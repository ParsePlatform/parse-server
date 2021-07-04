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
import { v4 as uuidv4 } from 'uuid';
import { runLiveQueryEventHandlers, getTrigger, runTrigger } from '../triggers';
import { getAuthForSessionToken, Auth } from '../Auth';
import { getCacheController } from '../Controllers';
import LRU from 'lru-cache';
import UserRouter from '../Routers/UsersRouter';

class ParseLiveQueryServer {
  clients: Map;
  // className -> (queryHash -> subscription)
  subscriptions: Object;
  parseWebSocketServer: Object;
  keyPairs: any;
  // The subscriber we use to get object update from publisher
  subscriber: Object;

  constructor(server: any, config: any = {}, parseServerConfig: any = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;

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
    this.cacheController = getCacheController(parseServerConfig);

    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s

    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.
    this.authCache = new LRU({
      max: 500, // 500 concurrent
      maxAge: config.cacheTimeout,
    });
    // Initialize websocket server
    this.parseWebSocketServer = new ParseWebSocketServer(
      server,
      parseWebsocket => this._onConnect(parseWebsocket),
      config
    );

    // Initialize subscriber
    this.subscriber = ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(Parse.applicationId + 'afterSave');
    this.subscriber.subscribe(Parse.applicationId + 'afterDelete');
    // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.
    this.subscriber.on('message', (channel, messageStr) => {
      logger.verbose('Subscribe message %j', messageStr);
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
        logger.error('Get message %s from unknown channel %j', message, channel);
      }
    });
  }

  // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.
  _inflateParseObject(message: any): void {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;
    UserRouter.removeHiddenProperties(currentParseObject);
    let className = currentParseObject.className;
    let parseObject = new Parse.Object(className);
    parseObject._finishFetch(currentParseObject);
    message.currentParseObject = parseObject;
    // Inflate original object
    const originalParseObject = message.originalParseObject;
    if (originalParseObject) {
      UserRouter.removeHiddenProperties(originalParseObject);
      className = originalParseObject.className;
      parseObject = new Parse.Object(className);
      parseObject._finishFetch(originalParseObject);
      message.originalParseObject = parseObject;
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterDelete(message: any): void {
    logger.verbose(Parse.applicationId + 'afterDelete is triggered');

    let deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;
    logger.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);
    logger.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);
    if (typeof classSubscriptions === 'undefined') {
      logger.debug('Can not find subscriptions under this class ' + className);
      return;
    }

    for (const subscription of classSubscriptions.values()) {
      const isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);
      if (!isSubscriptionMatched) {
        continue;
      }
      for (const [clientId, requestIds] of _.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
          const acl = message.currentParseObject.getACL();
          // Check CLP
          const op = this._getCLPOperation(subscription.query);
          let res = {};
          try {
            await this._matchesCLP(
              classLevelPermissions,
              message.currentParseObject,
              client,
              requestId,
              op
            );
            const isMatched = await this._matchesACL(acl, client, requestId);
            if (!isMatched) {
              return null;
            }
            res = {
              event: 'delete',
              sessionToken: client.sessionToken,
              object: deletedParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true,
            };
            const trigger = getTrigger(className, 'afterEvent', Parse.applicationId);
            if (trigger) {
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              if (res.object) {
                res.object = Parse.Object.fromJSON(res.object);
              }
              await runTrigger(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              deletedParseObject = res.object.toJSON();
              deletedParseObject.className = className;
            }
            client.pushDelete(requestId, deletedParseObject);
          } catch (error) {
            Client.pushError(
              client.parseWebSocket,
              error.code || 141,
              error.message || error,
              false,
              requestId
            );
            logger.error(
              `Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` +
                JSON.stringify(error)
            );
          }
        });
      }
    }
  }

  // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.
  async _onAfterSave(message: any): void {
    logger.verbose(Parse.applicationId + 'afterSave is triggered');

    let originalParseObject = null;
    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }
    const classLevelPermissions = message.classLevelPermissions;
    let currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;
    logger.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);
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
      for (const [clientId, requestIds] of _.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);
        if (typeof client === 'undefined') {
          continue;
        }
        requestIds.forEach(async requestId => {
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
            originalACLCheckingPromise = this._matchesACL(originalACL, client, requestId);
          }
          // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let currentACLCheckingPromise;
          let res = {};
          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }
          try {
            const op = this._getCLPOperation(subscription.query);
            await this._matchesCLP(
              classLevelPermissions,
              message.currentParseObject,
              client,
              requestId,
              op
            );
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([
              originalACLCheckingPromise,
              currentACLCheckingPromise,
            ]);
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
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'enter';
              } else {
                type = 'create';
              }
            } else {
              return null;
            }
            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: currentParseObject,
              original: originalParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true,
            };
            const trigger = getTrigger(className, 'afterEvent', Parse.applicationId);
            if (trigger) {
              if (res.object) {
                res.object = Parse.Object.fromJSON(res.object);
              }
              if (res.original) {
                res.original = Parse.Object.fromJSON(res.original);
              }
              const auth = await this.getAuthFromClient(client, requestId);
              if (auth && auth.user) {
                res.user = auth.user;
              }
              await runTrigger(trigger, `afterEvent.${className}`, res, auth);
            }
            if (!res.sendEvent) {
              return;
            }
            if (res.object && typeof res.object.toJSON === 'function') {
              currentParseObject = res.object.toJSON();
              currentParseObject.className = res.object.className || className;
            }

            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = res.original.toJSON();
              originalParseObject.className = res.original.className || className;
            }
            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);
            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          } catch (error) {
            Client.pushError(
              client.parseWebSocket,
              error.code || 141,
              error.message || error,
              false,
              requestId
            );
            logger.error(
              `Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` +
                JSON.stringify(error)
            );
          }
        });
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
      for (const [requestId, subscriptionInfo] of _.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId);

        // If there is no client which is subscribing this subscription, remove it from subscriptions
        const classSubscriptions = this.subscriptions.get(subscription.className);
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
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId,
        sessionToken: client.sessionToken,
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

  getAuthForSessionToken(sessionToken: ?string): Promise<{ auth: ?Auth, userId: ?string }> {
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
      .catch(error => {
        // There was an error with the session token
        const result = {};
        if (error && error.code === Parse.Error.INVALID_SESSION_TOKEN) {
          result.error = error;
          this.authCache.set(sessionToken, Promise.resolve(result), this.config.cacheTimeout);
        } else {
          this.authCache.del(sessionToken);
        }
        return result;
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
      const { userId } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);
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

  async _verifyACL(acl: any, token: string) {
    if (!token) {
      return false;
    }

    const { auth, userId } = await this.getAuthForSessionToken(token);

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
        const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));
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
      .catch(() => {
        return false;
      });
  }

  async getAuthFromClient(client: any, requestId: number, sessionToken: string) {
    const getSessionFromClient = () => {
      const subscriptionInfo = client.getSubscriptionInfo(requestId);
      if (typeof subscriptionInfo === 'undefined') {
        return client.sessionToken;
      }
      return subscriptionInfo.sessionToken || client.sessionToken;
    };
    if (!sessionToken) {
      sessionToken = getSessionFromClient();
    }
    if (!sessionToken) {
      return;
    }
    const { auth } = await this.getAuthForSessionToken(sessionToken);
    return auth;
  }

  async _matchesACL(acl: any, client: any, requestId: number): Promise<boolean> {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    }
    // Check subscription sessionToken matches ACL first
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }

    const subscriptionToken = subscriptionInfo.sessionToken;
    const clientSessionToken = client.sessionToken;

    if (await this._verifyACL(acl, subscriptionToken)) {
      return true;
    }

    if (await this._verifyACL(acl, clientSessionToken)) {
      return true;
    }

    return false;
  }

  async _handleConnect(parseWebsocket: any, request: any): any {
    if (!this._validateKeys(request, this.keyPairs)) {
      Client.pushError(parseWebsocket, 4, 'Key in request is not valid');
      logger.error('Key in request is not valid');
      return;
    }
    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);
    const clientId = uuidv4();
    const client = new Client(
      clientId,
      parseWebsocket,
      hasMasterKey,
      request.sessionToken,
      request.installationId
    );
    try {
      const req = {
        client,
        event: 'connect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: request.installationId,
      };
      const trigger = getTrigger('@Connect', 'beforeConnect', Parse.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, req.sessionToken);
        if (auth && auth.user) {
          req.user = auth.user;
        }
        await runTrigger(trigger, `beforeConnect.@Connect`, req, auth);
      }
      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);
      logger.info(`Create new client: ${parseWebsocket.clientId}`);
      client.pushConnect();
      runLiveQueryEventHandlers(req);
    } catch (error) {
      Client.pushError(parseWebsocket, error.code || 141, error.message || error, false);
      logger.error(
        `Failed running beforeConnect for session ${request.sessionToken} with:\n Error: ` +
          JSON.stringify(error)
      );
    }
  }

  _hasMasterKey(request: any, validKeyPairs: any): boolean {
    if (!validKeyPairs || validKeyPairs.size == 0 || !validKeyPairs.has('masterKey')) {
      return false;
    }
    if (!request || !Object.prototype.hasOwnProperty.call(request, 'masterKey')) {
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

  async _handleSubscribe(parseWebsocket: any, request: any): any {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      Client.pushError(
        parseWebsocket,
        2,
        'Can not find this client, make sure you connect to server before subscribing'
      );
      logger.error('Can not find this client, make sure you connect to server before subscribing');
      return;
    }
    const client = this.clients.get(parseWebsocket.clientId);
    const className = request.query.className;
    try {
      const trigger = getTrigger(className, 'beforeSubscribe', Parse.applicationId);
      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        if (auth && auth.user) {
          request.user = auth.user;
        }

        const parseQuery = new Parse.Query(className);
        parseQuery.withJSON(request.query);
        request.query = parseQuery;
        await runTrigger(trigger, `beforeSubscribe.${className}`, request, auth);

        const query = request.query.toJSON();
        if (query.keys) {
          query.fields = query.keys.split(',');
        }
        request.query = query;
      }

      // Get subscription from subscriptions, create one if necessary
      const subscriptionHash = queryHash(request.query);
      // Add className to subscriptions if necessary

      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }
      const classSubscriptions = this.subscriptions.get(className);
      let subscription;
      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      }

      // Add subscriptionInfo to client
      const subscriptionInfo = {
        subscription: subscription,
      };
      // Add selected fields, sessionToken and installationId for this subscription if necessary
      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
      }
      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }
      client.addSubscriptionInfo(request.requestId, subscriptionInfo);

      // Add clientId to subscription
      subscription.addClientSubscription(parseWebsocket.clientId, request.requestId);

      client.pushSubscribe(request.requestId);

      logger.verbose(
        `Create client ${parseWebsocket.clientId} new subscription: ${request.requestId}`
      );
      logger.verbose('Current client number: %d', this.clients.size);
      runLiveQueryEventHandlers({
        client,
        event: 'subscribe',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId,
      });
    } catch (e) {
      Client.pushError(parseWebsocket, e.code || 141, e.message || e, false, request.requestId);
      logger.error(
        `Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` +
          JSON.stringify(e)
      );
    }
  }

  _handleUpdateSubscription(parseWebsocket: any, request: any): any {
    this._handleUnsubscribe(parseWebsocket, request, false);
    this._handleSubscribe(parseWebsocket, request);
  }

  async _handleUnsubscribe(parseWebsocket: any, request: any, notifyClient: boolean = true): any {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
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

    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    const trigger = getTrigger(className, 'beforeUnsubscribe', Parse.applicationId);
    if (trigger) {
      const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
      if (auth && auth.user) {
        request.user = auth.user;
      }

      request.sessionToken = subscriptionInfo.sessionToken;
      request.useMasterKey = client.hasMasterKey;
      request.installationId = client.installationId;

      await runTrigger(trigger, `beforeUnsubscribe.${className}`, request, auth);
    }

    // Remove subscription from client
    client.deleteSubscriptionInfo(requestId);
    // Remove client from subscription
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
      client,
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: subscriptionInfo.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: client.installationId,
    });

    if (!notifyClient) {
      return;
    }

    client.pushUnsubscribe(request.requestId);

    logger.verbose(
      `Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`
    );
  }
}

export { ParseLiveQueryServer };
