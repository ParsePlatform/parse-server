import tv4 from 'tv4';
import Parse from 'parse/node';
import { Subscription } from './Subscription';
import { Client } from './Client';
import { ParseWebSocketServer } from './ParseWebSocketServer';
import logger from '../logger';
import RequestSchema from './RequestSchema';
import { matchesQuery, queryHash } from './QueryTools';
import { ParsePubSub } from './ParsePubSub';
import SchemaController from '../Controllers/SchemaController';
import _ from 'lodash';
import uuid from 'uuid';
import { runLiveQueryEventHandlers } from '../triggers';
import { getAuthForSessionToken, Auth } from '../Auth';
import { getCacheController } from '../Controllers';
import LRU from 'lru-cache';

class ParseLiveQueryServer {
  clients: Map;
  // className -> (queryHash -> subscription)
  subscriptions: Object;
  parseWebSocketServer: Object;
  keyPairs: any;
  // The subscriber we use to get object update from publisher
  subscriber: Object;

  constructor(server: any, config: any = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();

    config.appId = config.appId || Parse.applicationId;
    config.masterKey = config.masterKey || Parse.masterKey;

    // Store keys, convert obj to map
    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();
    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }
    logger.verbose('Support key pairs', this.keyPairs);

    // Initialize Parse
    Parse.Object.disableSingleInstance();
    const serverURL = config.serverURL || Parse.serverURL;
    Parse.serverURL = serverURL;
    Parse.initialize(config.appId, Parse.javaScriptKey, config.masterKey);

    // The cache controller is a proper cache controller
    // with access to User and Roles
    this.cacheController = getCacheController(config);

    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.
    this.authCache = new LRU({
      max: 500, // 500 concurrent
      maxAge: 60 * 60 * 1000, // 1h
    });
    // Initialize websocket server
    this.parseWebSocketServer = new ParseWebSocketServer(
      server,
      parseWebsocket => this._onConnect(parseWebsocket),
      config.websocketTimeout
    );

    // Initialize subscriber
    this.subscriber = ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(Parse.applicationId + 'afterSave');
    this.subscriber.subscribe(Parse.applicationId + 'afterDelete');
    // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.
    this.subscriber.on('message', (channel, messageStr) => {
      logger.verbose('Subscribe messsage %j', messageStr);
      let message;
      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        logger.error('unable to parse message', messageStr, e);
        return;
      }
      this._inflateParseObject(message);
      if (channel === Parse.applicationId + 'afterSave') {
        this._onAfterSave(message);
      } else if (channel === Parse.applicationId + 'afterDelete') {
        this._onAfterDelete(message);
      } else {
        logger.error(
          'Get message %s from unknown channel %j',
          message,
          channel
        );
      }
    });
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.
  _inflateParseObject(message: any): void {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;
    let className = currentParseObject.className;
    let parseObject = new Parse.Object(className);
    parseObject._finishFetch(currentParseObject);
    message.currentParseObject = parseObject;
    // Inflate original object
    const originalParseObject = message.originalParseObject;
    if (originalParseObject) {
      className = originalParseObject.className;
      parseObject = new Parse.Object(className);
      parseObject._finishFetch(originalParseObject);
      message.originalParseObject = parseObject;
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  _onAfterDelete(message: any): void {
    logger.verbose(Parse.applicationId + 'afterDelete is triggered');

    const deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;
    logger.verbose(
      'ClassName: %j | ObjectId: %s',
      className,
      deletedParseObject.id
    );
    logger.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      logger.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      const isSubscriptionMatched = this._matchesSubscription(
        deletedParseObject,
        subscription
      );
      if (!isSubscriptionMatched) {
        continue;
      }
      for (const [clientId, requestIds] of _.entries(
        subscription.clientRequestIds
      )) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        for (const requestId of requestIds) {
          const acl = message.currentParseObject.getACL();
          // Check CLP
          const op = this._getCLPOperation(subscription.query);
          this._matchesCLP(
            classLevelPermissions,
            message.currentParseObject,
            client,
            requestId,
            op
          )
            .then(() => {
              // Check ACL
              return this._matchesACL(acl, client, requestId);
            })
            .then(isMatched => {
              if (!isMatched) {
                return null;
              }
              client.pushDelete(requestId, deletedParseObject);
            })
            .catch(error => {
              logger.error('Matching ACL error : ', error);
            });
        }
      }
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  _onAfterSave(message: any): void {
    logger.verbose(Parse.applicationId + 'afterSave is triggered');

    let originalParseObject = null;
    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }
    const classLevelPermissions = message.classLevelPermissions;
    const currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;
    logger.verbose(
      'ClassName: %s | ObjectId: %s',
      className,
      currentParseObject.id
    );
    logger.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      logger.debug('Can not find subscriptions under this class ' + className);
      return;
    }
    for (const subscription of classSubscriptions.values()) {
      const isOriginalSubscriptionMatched = this._matchesSubscription(
        originalParseObject,
        subscription
      );
      const isCurrentSubscriptionMatched = this._matchesSubscription(
        currentParseObject,
        subscription
      );
      for (const [clientId, requestIds] of _.entries(
        subscription.clientRequestIds
      )) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        for (const requestId of requestIds) {
          // Set orignal ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let originalACLCheckingPromise;
          if (!isOriginalSubscriptionMatched) {
            originalACLCheckingPromise = Promise.resolve(false);
          } else {
            let originalACL;
            if (message.originalParseObject) {
              originalACL = message.originalParseObject.getACL();
            }
            originalACLCheckingPromise = this._matchesACL(
              originalACL,
              client,
              requestId
            );
          }
          // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let currentACLCheckingPromise;
          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(
              currentACL,
              client,
              requestId
            );
          }
          const op = this._getCLPOperation(subscription.query);
          this._matchesCLP(
            classLevelPermissions,
            message.currentParseObject,
            client,
            requestId,
            op
          )
            .then(() => {
              return Promise.all([
                originalACLCheckingPromise,
                currentACLCheckingPromise,
              ]);
            })
            .then(
              ([isOriginalMatched, isCurrentMatched]) => {
                logger.verbose(
                  'Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s',
                  originalParseObject,
                  currentParseObject,
                  isOriginalSubscriptionMatched,
                  isCurrentSubscriptionMatched,
                  isOriginalMatched,
                  isCurrentMatched,
                  subscription.hash
                );

                // Decide event type
                let type;
                if (isOriginalMatched && isCurrentMatched) {
                  type = 'Update';
                } else if (isOriginalMatched && !isCurrentMatched) {
                  type = 'Leave';
                } else if (!isOriginalMatched && isCurrentMatched) {
                  if (originalParseObject) {
                    type = 'Enter';
                  } else {
                    type = 'Create';
                  }
                } else {
                  return null;
                }
                const functionName = 'push' + type;
                client[functionName](requestId, currentParseObject);
              },
              error => {
                logger.error('Matching ACL error : ', error);
              }
            );
        }
      }
    }
  }

  _onConnect(parseWebsocket: any): void {
    parseWebsocket.on('message', request => {
      if (typeof request === 'string') {
        try {
          request = JSON.parse(request);
        } catch (e) {
          logger.error('unable to parse request', request, e);
          return;
        }
      }
      logger.verbose('Request: %j', request);

      // Check whether this request is a valid request, return error directly if not
      if (
        !tv4.validate(request, RequestSchema['general']) ||
        !tv4.validate(request, RequestSchema[request.op])
      ) {
        Client.pushError(parseWebsocket, 1, tv4.error.message);
        logger.error('Connect message error %s', tv4.error.message);
        return;
      }

      switch (request.op) {
        case 'connect':
          this._handleConnect(parseWebsocket, request);
          break;
        case 'subscribe':
          this._handleSubscribe(parseWebsocket, request);
          break;
        case 'update':
          this._handleUpdateSubscription(parseWebsocket, request);
          break;
        case 'unsubscribe':
          this._handleUnsubscribe(parseWebsocket, request);
          break;
        default:
          Client.pushError(parseWebsocket, 3, 'Get unknown operation');
          logger.error('Get unknown operation', request.op);
      }
    });

    parseWebsocket.on('disconnect', () => {
      logger.info(`Client disconnect: ${parseWebsocket.clientId}`);
      const clientId = parseWebsocket.clientId;
      if (!this.clients.has(clientId)) {
        runLiveQueryEventHandlers({
          event: 'ws_disconnect_error',
          clients: this.clients.size,
          subscriptions: this.subscriptions.size,
          error: `Unable to find client ${clientId}`,
        });
        logger.error(`Can not find client ${clientId} on disconnect`);
        return;
      }

      // Delete client
      const client = this.clients.get(clientId);
      this.clients.delete(clientId);

      // Delete client from subscriptions
      for (const [requestId, subscriptionInfo] of _.entries(
        client.subscriptionInfos
      )) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId);

        // If there is no client which is subscribing this subscription, remove it from subscriptions
        const classSubscriptions = this.subscriptions.get(
          subscription.className
        );
        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        }
        // If there is no subscriptions under this class, remove it from subscriptions
        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }

      logger.verbose('Current clients %d', this.clients.size);
      logger.verbose('Current subscriptions %d', this.subscriptions.size);
      runLiveQueryEventHandlers({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
      });
    });

    runLiveQueryEventHandlers({
      event: 'ws_connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
    });
  }

  _matchesSubscription(parseObject: any, subscription: any): boolean {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }
    return matchesQuery(parseObject, subscription.query);
  }

  getAuthForSessionToken(
    sessionToken: ?string
  ): Promise<{ auth: ?Auth, userId: ?string }> {
    if (!sessionToken) {
      return Promise.resolve({});
    }
    const fromCache = this.authCache.get(sessionToken);
    if (fromCache) {
      return fromCache;
    }
    const authPromise = getAuthForSessionToken({
      cacheController: this.cacheController,
      sessionToken: sessionToken,
    })
      .then(auth => {
        return { auth, userId: auth && auth.user && auth.user.id };
      })
      .catch(() => {
        // If you can't continue, let's just wrap it up and delete it.
        // Next time, one will try again
        this.authCache.del(sessionToken);
        return {};
      });
    this.authCache.set(sessionToken, authPromise);
    return authPromise;
  }

  async _matchesCLP(
    classLevelPermissions: ?any,
    object: any,
    client: any,
    requestId: number,
    op: string
  ): any {
    // try to match on user first, less expensive than with roles
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;
    if (typeof subscriptionInfo !== 'undefined') {
      const { userId } = await this.getAuthForSessionToken(
        subscriptionInfo.sessionToken
      );
      if (userId) {
        aclGroup.push(userId);
      }
    }
    try {
      await SchemaController.validatePermission(
        classLevelPermissions,
        object.className,
        aclGroup,
        op
      );
      return true;
    } catch (e) {
      logger.verbose(`Failed matching CLP for ${object.id} ${userId} ${e}`);
      return false;
    }
    // TODO: handle roles permissions
    // Object.keys(classLevelPermissions).forEach((key) => {
    //   const perm = classLevelPermissions[key];
    //   Object.keys(perm).forEach((key) => {
    //     if (key.indexOf('role'))
    //   });
    // })
    // // it's rejected here, check the roles
    // var rolesQuery = new Parse.Query(Parse.Role);
    // rolesQuery.equalTo("users", user);
    // return rolesQuery.find({useMasterKey:true});
  }

  _getCLPOperation(query: any) {
    return typeof query === 'object' &&
      Object.keys(query).length == 1 &&
      typeof query.objectId === 'string'
      ? 'get'
      : 'find';
  }

  async _matchesACL(
    acl: any,
    client: any,
    requestId: number
  ): Promise<boolean> {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    }
    // Check subscription sessionToken matches ACL first
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }

    const { auth, userId } = await this.getAuthForSessionToken(
      subscriptionInfo.sessionToken
    );

    // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.
    if (!auth || !userId) {
      return false;
    }
    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);
    if (isSubscriptionSessionTokenMatched) {
      return true;
    }

    // Check if the user has any roles that match the ACL
    return Promise.resolve()
      .then(async () => {
        // Resolve false right away if the acl doesn't have any roles
        const acl_has_roles = Object.keys(acl.permissionsById).some(key =>
          key.startsWith('role:')
        );
        if (!acl_has_roles) {
          return false;
        }

        const roleNames = await auth.getUserRoles();
        // Finally, see if any of the user's roles allow them read access
        for (const role of roleNames) {
          // We use getReadAccess as `role` is in the form `role:roleName`
          if (acl.getReadAccess(role)) {
            return true;
          }
        }
        return false;
      })
      .then(async isRoleMatched => {
        if (isRoleMatched) {
          return Promise.resolve(true);
        }

        // Check client sessionToken matches ACL
        const clientSessionToken = client.sessionToken;
        if (clientSessionToken) {
          const { userId } = await this.getAuthForSessionToken(
            clientSessionToken
          );
          return acl.getReadAccess(userId);
        } else {
          return isRoleMatched;
        }
      })
      .catch(() => {
        return false;
      });
  }

  _handleConnect(parseWebsocket: any, request: any): any {
    if (!this._validateKeys(request, this.keyPairs)) {
      Client.pushError(parseWebsocket, 4, 'Key in request is not valid');
      logger.error('Key in request is not valid');
      return;
    }
    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);
    const clientId = uuid();
    const client = new Client(clientId, parseWebsocket, hasMasterKey);
    parseWebsocket.clientId = clientId;
    this.clients.set(parseWebsocket.clientId, client);
    logger.info(`Create new client: ${parseWebsocket.clientId}`);
    client.pushConnect();
    runLiveQueryEventHandlers({
      event: 'connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
    });
  }

  _hasMasterKey(request: any, validKeyPairs: any): boolean {
    if (
      !validKeyPairs ||
      validKeyPairs.size == 0 ||
      !validKeyPairs.has('masterKey')
    ) {
      return false;
    }
    if (!request || !request.hasOwnProperty('masterKey')) {
      return false;
    }
    return request.masterKey === validKeyPairs.get('masterKey');
  }

  _validateKeys(request: any, validKeyPairs: any): boolean {
    if (!validKeyPairs || validKeyPairs.size == 0) {
      return true;
    }
    let isValid = false;
    for (const [key, secret] of validKeyPairs) {
      if (!request[key] || request[key] !== secret) {
        continue;
      }
      isValid = true;
      break;
    }
    return isValid;
  }

  _handleSubscribe(parseWebsocket: any, request: any): any {
    // If we can not find this client, return error to client
    if (!parseWebsocket.hasOwnProperty('clientId')) {
      Client.pushError(
        parseWebsocket,
        2,
        'Can not find this client, make sure you connect to server before subscribing'
      );
      logger.error(
        'Can not find this client, make sure you connect to server before subscribing'
      );
      return;
    }
    const client = this.clients.get(parseWebsocket.clientId);

    // Get subscription from subscriptions, create one if necessary
    const subscriptionHash = queryHash(request.query);
    // Add className to subscriptions if necessary
    const className = request.query.className;
    if (!this.subscriptions.has(className)) {
      this.subscriptions.set(className, new Map());
    }
    const classSubscriptions = this.subscriptions.get(className);
    let subscription;
    if (classSubscriptions.has(subscriptionHash)) {
      subscription = classSubscriptions.get(subscriptionHash);
    } else {
      subscription = new Subscription(
        className,
        request.query.where,
        subscriptionHash
      );
      classSubscriptions.set(subscriptionHash, subscription);
    }

    // Add subscriptionInfo to client
    const subscriptionInfo = {
      subscription: subscription,
    };
    // Add selected fields and sessionToken for this subscription if necessary
    if (request.query.fields) {
      subscriptionInfo.fields = request.query.fields;
    }
    if (request.sessionToken) {
      subscriptionInfo.sessionToken = request.sessionToken;
    }
    client.addSubscriptionInfo(request.requestId, subscriptionInfo);

    // Add clientId to subscription
    subscription.addClientSubscription(
      parseWebsocket.clientId,
      request.requestId
    );

    client.pushSubscribe(request.requestId);

    logger.verbose(
      `Create client ${parseWebsocket.clientId} new subscription: ${
        request.requestId
      }`
    );
    logger.verbose('Current client number: %d', this.clients.size);
    runLiveQueryEventHandlers({
      event: 'subscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
    });
  }

  _handleUpdateSubscription(parseWebsocket: any, request: any): any {
    this._handleUnsubscribe(parseWebsocket, request, false);
    this._handleSubscribe(parseWebsocket, request);
  }

  _handleUnsubscribe(
    parseWebsocket: any,
    request: any,
    notifyClient: boolean = true
  ): any {
    // If we can not find this client, return error to client
    if (!parseWebsocket.hasOwnProperty('clientId')) {
      Client.pushError(
        parseWebsocket,
        2,
        'Can not find this client, make sure you connect to server before unsubscribing'
      );
      logger.error(
        'Can not find this client, make sure you connect to server before unsubscribing'
      );
      return;
    }
    const requestId = request.requestId;
    const client = this.clients.get(parseWebsocket.clientId);
    if (typeof client === 'undefined') {
      Client.pushError(
        parseWebsocket,
        2,
        'Cannot find client with clientId ' +
          parseWebsocket.clientId +
          '. Make sure you connect to live query server before unsubscribing.'
      );
      logger.error('Can not find this client ' + parseWebsocket.clientId);
      return;
    }

    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      Client.pushError(
        parseWebsocket,
        2,
        'Cannot find subscription with clientId ' +
          parseWebsocket.clientId +
          ' subscriptionId ' +
          requestId +
          '. Make sure you subscribe to live query server before unsubscribing.'
      );
      logger.error(
        'Can not find subscription with clientId ' +
          parseWebsocket.clientId +
          ' subscriptionId ' +
          requestId
      );
      return;
    }

    // Remove subscription from client
    client.deleteSubscriptionInfo(requestId);
    // Remove client from subscription
    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId);
    // If there is no client which is subscribing this subscription, remove it from subscriptions
    const classSubscriptions = this.subscriptions.get(className);
    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    }
    // If there is no subscriptions under this class, remove it from subscriptions
    if (classSubscriptions.size === 0) {
      this.subscriptions.delete(className);
    }
    runLiveQueryEventHandlers({
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
    });

    if (!notifyClient) {
      return;
    }

    client.pushUnsubscribe(request.requestId);

    logger.verbose(
      `Delete client: ${parseWebsocket.clientId} | subscription: ${
        request.requestId
      }`
    );
  }
}

export { ParseLiveQueryServer };
