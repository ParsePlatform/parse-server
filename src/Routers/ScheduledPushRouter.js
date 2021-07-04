import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import { Parse } from 'parse/node';
import { pushStatusHandler } from '../StatusHandler';

export class ScheduledPushRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'POST',
      '/push/sendScheduledPushes',
      middleware.promiseEnforceMasterKeyAccess,
      ScheduledPushRouter.handlePOST
    );
  }

  // always returns { result: true }
  static handlePOST(req) {
    if (req.auth.isReadOnly) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to trigger scheduled push notifications."
      );
    }
    const pushController = req.config.pushController;
    if (!pushController) {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Push controller is not set'
      );
    }

    let now;
    if (
      req.body &&
      req.body.overrideNow &&
      typeof req.body.overrideNow === 'string'
    ) {
      now = new Date(req.body.overrideNow);
    } else {
      now = new Date();
    }

    const query = new Parse.Query('_PushStatus');

    query.lessThan('pushDate', now);
    query.equalTo('status', 'scheduled');

    query.each(
      async pushObject => {
        if (pushObject.has('expiration_interval') && pushObject.has('expiry')) {
          // Invalid configuration, fail the status to keep a clean "scheduled" query
          const pushStatus = pushStatusHandler(req.config, pushObject.id);
          pushStatus.fail(
            'Invalid Push: only impliment expiration_interval or expiry, not both'
          );
        } else if (
          pushObject.has('expiry') ||
          pushObject.has('expiration_interval')
        ) {
          let expDate;

          if (pushObject.has('expiry')) {
            // Has an expiration date
            expDate = pushObject.get('expiry');
          } else if (pushObject.has('expiration_interval')) {
            // Has an expiration Interval
            // calculate the expiration date from the pushDate
            const pushDate = pushObject.get('pushDate');
            const expInterval = pushObject.get('expiration_interval');
            expDate = pushDate.setSeconds(pushDate.getSeconds() + expInterval);
          }

          if (expDate < now) {
            const pushStatus = pushStatusHandler(req.config, pushObject.id);
            pushStatus.fail('Expired on ' + expDate);
          } else {
            ScheduledPushRouter.sendPushFromPushStatus(pushObject, req);
          }
        } else {
          // No expiration Date
          ScheduledPushRouter.sendPushFromPushStatus(pushObject, req);
        }
      },
      { useMasterKey: true }
    );

    // return resolved promise
    return Promise.resolve({
      response: {
        result: true,
      },
    });
  }

  static sendPushFromPushStatus(object, req) {
    const pushController = req.config.pushController;

    pushController
      .sendScheduledPush(object, req.config, req.auth)
      .catch(err => {
        req.config.loggerController.error(
          `_PushStatus : error while sending push`,
          err
        );
      });
  }
}

export default ScheduledPushRouter;
