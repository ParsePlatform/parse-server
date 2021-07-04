import { Parse } from 'parse/node';
import RestQuery from '../RestQuery';
import RestWrite from '../RestWrite';
import { master } from '../Auth';
import { pushStatusHandler } from '../StatusHandler';
import { applyDeviceTokenExists } from '../Push/utils';

export class PushController {
  sendPush(body = {}, where = {}, config, auth, onPushStatusSaved = () => {}, now = new Date()) {
    if (!config.hasPushSupport) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Missing push configuration');
    }

    // Replace the expiration_time and push_time with a valid Unix epoch milliseconds time
    body.expiration_time = PushController.getExpirationTime(body);
    body.expiration_interval = PushController.getExpirationInterval(body);
    if (body.expiration_time && body.expiration_interval) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Both expiration_time and expiration_interval cannot be set'
      );
    }

    // Immediate push
    if (body.expiration_interval && !Object.prototype.hasOwnProperty.call(body, 'push_time')) {
      const ttlMs = body.expiration_interval * 1000;
      body.expiration_time = new Date(now.valueOf() + ttlMs).valueOf();
    }

    const pushTime = PushController.getPushTime(body);
    if (pushTime && pushTime.date !== 'undefined') {
      body['push_time'] = PushController.formatPushTime(pushTime);
    }

    // TODO: If the req can pass the checking, we return immediately instead of waiting
    // pushes to be sent. We probably change this behaviour in the future.
    let badgeUpdate = () => {
      return Promise.resolve();
    };

    if (body.data && body.data.badge) {
      const badge = body.data.badge;
      let restUpdate = {};
      if (typeof badge == 'string' && badge.toLowerCase() === 'increment') {
        restUpdate = { badge: { __op: 'Increment', amount: 1 } };
      } else if (
        typeof badge == 'object' &&
        typeof badge.__op == 'string' &&
        badge.__op.toLowerCase() == 'increment' &&
        Number(badge.amount)
      ) {
        restUpdate = { badge: { __op: 'Increment', amount: badge.amount } };
      } else if (Number(badge)) {
        restUpdate = { badge: badge };
      } else {
        throw "Invalid value for badge, expected number or 'Increment' or {increment: number}";
      }

      // Force filtering on only valid device tokens
      const updateWhere = applyDeviceTokenExists(where);
      badgeUpdate = () => {
        // Build a real RestQuery so we can use it in RestWrite
        const restQuery = new RestQuery(config, master(config), '_Installation', updateWhere);
        return restQuery.buildRestWhere().then(() => {
          const write = new RestWrite(
            config,
            master(config),
            '_Installation',
            restQuery.restWhere,
            restUpdate
          );
          write.runOptions.many = true;
          return write.execute();
        });
      };
    }
    const pushStatus = pushStatusHandler(config);
    return Promise.resolve()
      .then(() => {
        return pushStatus.setInitial(body, where);
      })
      .then(() => {
        onPushStatusSaved(pushStatus.objectId);
        return badgeUpdate();
      })
      .then(() => {
        // Update audience lastUsed and timesUsed
        if (body.audience_id) {
          const audienceId = body.audience_id;

          var updateAudience = {
            lastUsed: { __type: 'Date', iso: new Date().toISOString() },
            timesUsed: { __op: 'Increment', amount: 1 },
          };
          const write = new RestWrite(
            config,
            master(config),
            '_Audience',
            { objectId: audienceId },
            updateAudience
          );
          write.execute();
        }
        // Don't wait for the audience update promise to resolve.
        return Promise.resolve();
      })
      .then(() => {
        if (
          Object.prototype.hasOwnProperty.call(body, 'push_time') &&
          config.hasPushScheduledSupport
        ) {
          return Promise.resolve();
        }
        return config.pushControllerQueue.enqueue(body, where, config, auth, pushStatus);
      })
      .catch(err => {
        return pushStatus.fail(err).then(() => {
          throw err;
        });
      });
  }

  sendScheduledPush(pushObject, config, auth, now = new Date()) {
    if (!config.hasPushSupport) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Missing push configuration'
      );
    }

    // translate parseObject to body
    const body = {};
    if (pushObject.has('pushTime')) body.push_time = pushObject.get('pushTime');
    if (pushObject.has('expiry'))
      body.expiration_time = pushObject.get('expiry');
    if (pushObject.has('expiration_interval'))
      body.expiration_interval = pushObject.get('expiration_interval');
    if (pushObject.has('payload'))
      body.data = JSON.parse(pushObject.get('payload'));

    const where = JSON.parse(pushObject.get('query'));

    // Replace the expiration_time and push_time with a valid Unix epoch milliseconds time
    body.expiration_time = PushController.getExpirationTime(body);
    body.expiration_interval = PushController.getExpirationInterval(body);
    if (body.expiration_time && body.expiration_interval) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Both expiration_time and expiration_interval cannot be set'
      );
    }

    // calculate and set the expiration_time for APNS and GCM to use
    if (
      body.expiration_interval &&
      !Object.prototype.hasOwnProperty.call(body, 'push_time')
    ) {
      const ttlMs = body.expiration_interval * 1000;
      body.expiration_time = new Date(now.valueOf() + ttlMs).valueOf();
    }

    const pushTime = PushController.getPushTime(body);
    if (pushTime && pushTime.date !== 'undefined') {
      body['push_time'] = PushController.formatPushTime(pushTime);
    }

    // TODO: currently we increment the badge when we schedule the push.
    //       We should consider waiting to increment the badge until the
    //       actual push is sent here. This would prevent a "ghost badge"
    //       where the user sees a "1" in their app but the notifcation
    //       hasn't been sent yet. Until we make that breaking change
    //       lets comment this out to make sure we dont increment the
    //       badge twice.
    const pushStatus = pushStatusHandler(config, pushObject.id);
    return (
      Promise.resolve()
        // .then(() => {
        //   return badgeUpdate();
        // })
        .then(() => {
          return config.pushControllerQueue.enqueue(
            body,
            where,
            config,
            auth,
            pushStatus
          );
        })
        .catch(err => {
          return pushStatus.fail(err).then(() => {
            throw err;
          });
        })
    );
  }

  /**
   * Get expiration time from the request body.
   * @param {Object} request A request object
   * @returns {Number|undefined} The expiration time if it exists in the request
   */
  static getExpirationTime(body = {}) {
    var hasExpirationTime = Object.prototype.hasOwnProperty.call(body, 'expiration_time');
    if (!hasExpirationTime) {
      return;
    }
    var expirationTimeParam = body['expiration_time'];
    var expirationTime;
    if (typeof expirationTimeParam === 'number') {
      expirationTime = new Date(expirationTimeParam * 1000);
    } else if (typeof expirationTimeParam === 'string') {
      expirationTime = new Date(expirationTimeParam);
    } else {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        body['expiration_time'] + ' is not valid time.'
      );
    }
    // Check expirationTime is valid or not, if it is not valid, expirationTime is NaN
    if (!isFinite(expirationTime)) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        body['expiration_time'] + ' is not valid time.'
      );
    }
    return expirationTime.valueOf();
  }

  static getExpirationInterval(body = {}) {
    const hasExpirationInterval = Object.prototype.hasOwnProperty.call(body, 'expiration_interval');
    if (!hasExpirationInterval) {
      return;
    }

    var expirationIntervalParam = body['expiration_interval'];
    if (typeof expirationIntervalParam !== 'number' || expirationIntervalParam <= 0) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        `expiration_interval must be a number greater than 0`
      );
    }
    return expirationIntervalParam;
  }

  /**
   * Get push time from the request body.
   * @param {Object} request A request object
   * @returns {Number|undefined} The push time if it exists in the request
   */
  static getPushTime(body = {}) {
    var hasPushTime = Object.prototype.hasOwnProperty.call(body, 'push_time');
    if (!hasPushTime) {
      return;
    }
    var pushTimeParam = body['push_time'];
    var date;
    var isLocalTime = true;

    if (typeof pushTimeParam === 'number') {
      date = new Date(pushTimeParam * 1000);
    } else if (typeof pushTimeParam === 'string') {
      isLocalTime = !PushController.pushTimeHasTimezoneComponent(pushTimeParam);
      date = new Date(pushTimeParam);
    } else {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        body['push_time'] + ' is not valid time.'
      );
    }
    // Check pushTime is valid or not, if it is not valid, pushTime is NaN
    if (!isFinite(date)) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        body['push_time'] + ' is not valid time.'
      );
    }

    return {
      date,
      isLocalTime,
    };
  }

  /**
   * Checks if a ISO8601 formatted date contains a timezone component
   * @param pushTimeParam {string}
   * @returns {boolean}
   */
  static pushTimeHasTimezoneComponent(pushTimeParam: string): boolean {
    const offsetPattern = /(.+)([+-])\d\d:\d\d$/;
    return (
      pushTimeParam.indexOf('Z') === pushTimeParam.length - 1 || offsetPattern.test(pushTimeParam) // 2007-04-05T12:30Z
    ); // 2007-04-05T12:30.000+02:00, 2007-04-05T12:30.000-02:00
  }

  /**
   * Converts a date to ISO format in UTC time and strips the timezone if `isLocalTime` is true
   * @param date {Date}
   * @param isLocalTime {boolean}
   * @returns {string}
   */
  static formatPushTime({ date, isLocalTime }: { date: Date, isLocalTime: boolean }) {
    if (isLocalTime) {
      // Strip 'Z'
      const isoString = date.toISOString();
      return isoString.substring(0, isoString.indexOf('Z'));
    }
    return date.toISOString();
  }
}

export default PushController;
