import { md5Hash, newObjectId } from './cryptoUtils';
import { KeyPromiseQueue } from './KeyPromiseQueue';
import { logger } from './logger';
import rest from './rest';
import Auth from './Auth';

const PUSH_STATUS_COLLECTION = '_PushStatus';
const JOB_STATUS_COLLECTION = '_JobStatus';

const pushPromiseQueue = new KeyPromiseQueue();
const jobPromiseQueue = new KeyPromiseQueue();

const incrementOp = function (object = {}, key, amount = 1) {
  if (!object[key]) {
    object[key] = { __op: 'Increment', amount: amount };
  } else {
    object[key].amount += amount;
  }
  return object[key];
};

export function flatten(array) {
  var flattened = [];
  for (var i = 0; i < array.length; i++) {
    if (Array.isArray(array[i])) {
      flattened = flattened.concat(flatten(array[i]));
    } else {
      flattened.push(array[i]);
    }
  }
  return flattened;
}

function statusHandler(className, database) {
  function create(object) {
    return database.create(className, object).then(() => {
      return Promise.resolve(object);
    });
  }

  function update(where, object) {
    return jobPromiseQueue.enqueue(where.objectId, () => database.update(className, where, object));
  }

  return Object.freeze({
    create,
    update,
  });
}

function restStatusHandler(className, config) {
  const auth = Auth.master(config);
  function create(object) {
    return rest.create(config, auth, className, object).then(({ response }) => {
      return { ...object, ...response };
    });
  }

  function update(where, object) {
    return pushPromiseQueue.enqueue(where.objectId, () =>
      rest
        .update(config, auth, className, { objectId: where.objectId }, object)
        .then(({ response }) => {
          return { ...object, ...response };
        })
    );
  }

  return Object.freeze({
    create,
    update,
  });
}

export function jobStatusHandler(config) {
  let jobStatus;
  const objectId = newObjectId(config.objectIdSize);
  const database = config.database;
  const handler = statusHandler(JOB_STATUS_COLLECTION, database);
  const setRunning = function (jobName, params) {
    const now = new Date();
    jobStatus = {
      objectId,
      jobName,
      params,
      status: 'running',
      source: 'api',
      createdAt: now,
      // lockdown!
      ACL: {},
    };

    return handler.create(jobStatus);
  };

  const setMessage = function (message) {
    if (!message || typeof message !== 'string') {
      return Promise.resolve();
    }
    return handler.update({ objectId }, { message });
  };

  const setSucceeded = function (message) {
    return setFinalStatus('succeeded', message);
  };

  const setFailed = function (message) {
    return setFinalStatus('failed', message);
  };

  const setFinalStatus = function (status, message = undefined) {
    const finishedAt = new Date();
    const update = { status, finishedAt };
    if (message && typeof message === 'string') {
      update.message = message;
    }
    if (message instanceof Error && typeof message.message === 'string') {
      update.message = message.message;
    }
    return handler.update({ objectId }, update);
  };

  return Object.freeze({
    setRunning,
    setSucceeded,
    setMessage,
    setFailed,
  });
}

export function pushStatusHandler(config, existingObjectId) {
  let pushStatus;
  const database = config.database;
  const handler = restStatusHandler(PUSH_STATUS_COLLECTION, config);
  let objectId = existingObjectId;
  const setInitial = function (body = {}, where, options = { source: 'rest' }) {
    const now = new Date();
    let pushTime = now.toISOString();
    let pushDate = now;
    let status = 'pending';
    if (Object.prototype.hasOwnProperty.call(body, 'push_time')) {
      if (config.hasPushScheduledSupport) {
        pushTime = body.push_time;
        pushDate = new Date(body.push_time);
        status = 'scheduled';
      } else {
        logger.warn('Trying to schedule a push while server is not configured.');
        logger.warn('Push will be sent immediately');
      }
    }

    const data = body.data || {};
    const payloadString = JSON.stringify(data);
    let pushHash;
    if (typeof data.alert === 'string') {
      pushHash = md5Hash(data.alert);
    } else if (typeof data.alert === 'object') {
      pushHash = md5Hash(JSON.stringify(data.alert));
    } else {
      pushHash = 'd41d8cd98f00b204e9800998ecf8427e';
    }
    const object = {
      pushTime,
      query: JSON.stringify(where),
      payload: payloadString,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      expiration_interval: body.expiration_interval,
      status: status,
      pushDate: { iso: pushDate, __type: 'Date' },
      numSent: 0,
      pushHash,
      // lockdown!
      ACL: {},
    };
    return handler.create(object).then(result => {
      objectId = result.objectId;
      pushStatus = {
        objectId,
      };
      return Promise.resolve(pushStatus);
    });
  };

  const setRunning = function (batches) {
    logger.verbose(
      `_PushStatus ${objectId}: sending push to installations with %d batches`,
      batches
    );
    return handler.update(
      {
        status: 'pending',
        objectId: objectId,
      },
      {
        status: 'running',
        count: batches,
      }
    );
  };

  const trackSent = function (
    results,
    UTCOffset,
    cleanupInstallations = process.env.PARSE_SERVER_CLEANUP_INVALID_INSTALLATIONS
  ) {
    const update = {
      numSent: 0,
      numFailed: 0,
    };
    const devicesToRemove = [];
    if (Array.isArray(results)) {
      results = flatten(results);
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result || !result.device || !result.device.deviceType) {
          return memo;
        }
        const deviceType = result.device.deviceType;
        const key = result.transmitted
          ? `sentPerType.${deviceType}`
          : `failedPerType.${deviceType}`;
        memo[key] = incrementOp(memo, key);
        if (typeof UTCOffset !== 'undefined') {
          const offsetKey = result.transmitted
            ? `sentPerUTCOffset.${UTCOffset}`
            : `failedPerUTCOffset.${UTCOffset}`;
          memo[offsetKey] = incrementOp(memo, offsetKey);
        }
        if (result.transmitted) {
          memo.numSent++;
        } else {
          if (
            result &&
            result.response &&
            result.response.error &&
            result.device &&
            result.device.deviceToken
          ) {
            const token = result.device.deviceToken;
            const error = result.response.error;
            // GCM errors
            if (error === 'NotRegistered' || error === 'InvalidRegistration') {
              devicesToRemove.push(token);
            }
            // APNS errors
            if (error === 'Unregistered' || error === 'BadDeviceToken') {
              devicesToRemove.push(token);
            }
          }
          memo.numFailed++;
        }
        return memo;
      }, update);
    }

    logger.verbose(
      `_PushStatus ${objectId}: sent push! %d success, %d failures`,
      update.numSent,
      update.numFailed
    );
    logger.verbose(`_PushStatus ${objectId}: needs cleanup`, {
      devicesToRemove,
    });
    ['numSent', 'numFailed'].forEach(key => {
      if (update[key] > 0) {
        update[key] = {
          __op: 'Increment',
          amount: update[key],
        };
      } else {
        delete update[key];
      }
    });

    if (devicesToRemove.length > 0 && cleanupInstallations) {
      logger.info(`Removing device tokens on ${devicesToRemove.length} _Installations`);
      database.update(
        '_Installation',
        { deviceToken: { $in: devicesToRemove } },
        { deviceToken: { __op: 'Delete' } },
        {
          acl: undefined,
          many: true,
        }
      );
    }
    incrementOp(update, 'count', -1);
    update.status = 'running';

    return handler.update({ objectId }, update).then(res => {
      if (res && res.count === 0) {
        return this.complete();
      }
    });
  };

  const complete = function () {
    return handler.update(
      { objectId },
      {
        status: 'succeeded',
        count: { __op: 'Delete' },
      }
    );
  };

  const fail = function (err) {
    if (typeof err === 'string') {
      err = { message: err };
    }
    const update = {
      errorMessage: err,
      status: 'failed',
    };
    return handler.update({ objectId }, update);
  };

  const rval = {
    setInitial,
    setRunning,
    trackSent,
    complete,
    fail,
  };

  // define objectId to be dynamic
  Object.defineProperty(rval, 'objectId', {
    get: () => objectId,
  });

  return Object.freeze(rval);
}
