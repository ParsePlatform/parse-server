'use strict';

const request = require('../lib/request');

describe('Scheduled Push Router', () => {
  // the number of milliseconds to wait for the push to save before continueing
  // This MAY need to be increase if tests fail on a slower box
  // 5 ms results in 1/3 failing
  // 10 ms results in all passing on a fast box
  // 50 ms is a 5x buffer for a slower box
  const delayToSave = 50;

  const delayPromise = delay => {
    return new Promise(resolve => {
      setTimeout(resolve, delay);
    });
  };

  const setup = async () => {
    // const sendToInstallationSpy = jasmine.createSpy();

    const pushAdapter = {
      send: function() {
        return Promise.resolve({
          err: null,
          transmitted: true,
        });
      },
      getValidPushTypes: function() {
        return ['ios', 'android'];
      },
    };

    await reconfigureServer({
      scheduledPush: true,
      appId: Parse.applicationId,
      masterKey: Parse.masterKey,
      serverURL: Parse.serverURL,
      push: {
        adapter: pushAdapter,
      },
    });
    const installations = [];
    while (installations.length != 10) {
      const installation = new Parse.Object('_Installation');
      installation.set(
        'installationId',
        'installation_' + installations.length
      );
      installation.set('deviceToken', 'device_token_' + installations.length);
      installation.set('badge', installations.length);
      installation.set('originalBadge', installations.length);
      installation.set('deviceType', 'ios');
      installations.push(installation);
    }
    await Parse.Object.saveAll(installations);
  };

  const queryPushStatus = async () => {
    const response = await request({
      url: 'http://localhost:8378/1/classes/_PushStatus',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    const body = response.data;
    return body;
  };

  const triggerPushTick = async () => {
    const response = await request({
      url: 'http://localhost:8378/1/push/sendScheduledPushes',
      method: 'POST',
      json: true,
      body: {
        overrideNow: '2019-01-05T01:01:02Z', // Mock that now is 2 seconds into Jan 5, 2019
      },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });

    const body = response.data;
    // wait for the push to save
    await delayPromise(delayToSave);

    return body;
  };

  const yesPush = async data => {
    await _pushShouldMatchAfterSweep(data, 'succeeded');
  };

  const noPushFailed = async data => {
    await _pushShouldMatchAfterSweep(data, 'failed');
  };

  const noPushScheduled = async data => {
    await _pushShouldMatchAfterSweep(data, 'scheduled');
  };

  const _pushShouldMatchAfterSweep = async (data, match) => {
    await setup();
    const defaultObject = {
      where: {
        deviceType: 'ios',
      },
      data: {
        alert: 'Hello Everyone!',
      },
    };
    const merged = { ...defaultObject, ...data };
    // Schedule the push
    await Parse.Push.send(merged, { useMasterKey: true });

    const before = await queryPushStatus();
    expect(before.results.length).toEqual(1);
    expect(before.results[0].status).toEqual('scheduled');

    // trigger the function that should send all of the sheduled pushes
    await triggerPushTick();

    const after = await queryPushStatus();
    expect(after.results.length).toEqual(1);
    expect(after.results[0].status).toEqual(match);
  };

  describe('Should send push', () => {
    describe('because push_time is', () => {
      it('1 second in the past', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than 1 seconds in the past
        });
      });

      it('4 days in the past', async () => {
        await yesPush({
          push_time: '2019-01-01T01:01:01Z', // send push no eariler than 4 days in the past
        });
      });

      it('5 years in the past', async () => {
        await yesPush({
          push_time: '2014-01-05T01:01:01Z', // send push no eariler than 5 years in the past
        });
      });

      it('100 years in the past', async () => {
        await yesPush({
          push_time: '1919-01-05T01:01:01Z', // send push no eariler than 100 years in the past
        });
      });
    });

    describe('because push_time is in past and experation expiration_interval is', () => {
      it('10 seconds in the future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_interval: 11, // expire 11 seconds after the start of eligibility
        });
      });

      it('2 days into the future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_interval: 60 * 60 * 24 * 2, // expire 7 day after the start of eligibility
        });
      });

      it('5 years in future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_interval: 60 * 60 * 24 * 365 * 5 + 60 * 60 * 24 * 2, // expire 5 years and 2 days after the start of eligibility (leap years...)
        });
      });

      it('5 years in future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_interval: 60 * 60 * 24 * 365 * 5, // expire 5 years after the start of eligibility
        });
      });
    });

    describe('because push_time is in past and experation expiration_time is', () => {
      it('1 seconds in the future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-06T01:01:03Z', // one second in the future
        });
      });

      it('1 seconds in the future (expiration_time local timezone)', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-05T18:01:03-07:00', // one second in the future (local)
        });
      });

      it('1 seconds in the future (push_time local timezone)', async () => {
        await yesPush({
          push_time: '2019-01-04T18:01:01-07:00', // send push no eariler than one second ago (local)
          expiration_time: '2019-01-06T01:01:03Z', // one second in the future
        });
      });

      it('1 seconds in the future (push_time and expiration_time local timezone)', async () => {
        await yesPush({
          push_time: '2019-01-04T18:01:01-07:00', // send push no eariler than one second ago
          expiration_time: '2019-01-05T18:01:03-07:00', // one second in the future (local)
        });
      });

      it('4 days in the future (missing time)', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-09', // expire after 4 days in the future
        });
      });

      it('4 days in the future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-09T01:01:03Z', // expire after 4 days in the future
        });
      });

      it('100 years in the future', async () => {
        await yesPush({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2119-01-05T01:01:12Z', // expire after 100 years days in the future
        });
      });
    });
  });

  describe('Should not send push', () => {
    describe('because push_time is', () => {
      it('10 seconds in the future', async () => {
        await noPushScheduled({
          push_time: '2019-01-05T01:01:12Z', // send push no eariler than 10 seconds in the future
        });
      });

      it('4 days in the future', async () => {
        await noPushScheduled({
          push_time: '2019-01-09T01:01:01Z', // send push no eariler than 4 days in the future
        });
      });

      it('5 years in the future', async () => {
        await noPushScheduled({
          push_time: '2024-01-05T01:01:01Z', // send push no eariler than 5 in the future
        });
      });

      it('100 years in the future', async () => {
        await noPushScheduled({
          push_time: '2119-01-05T01:01:01Z', // send push no eariler than 100 years in the future
        });
      });
    });

    describe('because expiration_interval expired', () => {
      it('1 second ago', async () => {
        await noPushFailed({
          push_time: '2019-01-05T01:01:00Z', // send push no eariler than two seconds ago
          expiration_interval: 1, // expire 1 second after the pushTime, 1 second ago
        });
      });

      it('4 days ago', async () => {
        await noPushFailed({
          push_time: '2019-01-01T01:01:01Z', // send push no eariler than 4 days ago
          expiration_interval: 60, // expire 1 minute after the pushTime, 4 days ago
        });
      });

      it('5 years ago', async () => {
        await noPushFailed({
          push_time: '2014-01-05T01:01:01Z', // send push no eariler than 5 years ago
          expiration_interval: 60, // expire 1 minute after the pushTime, 5 years ago
        });
      });
    });

    describe('because expiration_time expired', () => {
      it('before the push_time (with push_time in past)', async () => {
        await noPushFailed({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
        });
      });

      it('before the push_time (with push_time in future)', async () => {
        await noPushScheduled({
          push_time: '2019-01-05T01:01:03Z', // send push no eariler than one second in the future
          expiration_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
        });
      });

      it('one second in the past', async () => {
        await noPushFailed({
          push_time: '2019-01-01T01:01:01Z', // send push no eariler than 4 days ago
          expiration_time: '2019-01-05T01:01:01Z', // expire one second ago
        });
      });

      it('1 seconds in the past (expiration_time local timezone)', async () => {
        await noPushFailed({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-04T18:01:01-07:00', // one second in the past (local)
        });
      });

      it('1 seconds in the past (push_time local timezone)', async () => {
        await noPushFailed({
          push_time: '2019-01-04T18:01:01-07:00', // send push no eariler than one second ago (local)
          expiration_time: '2019-01-05T01:01:01Z', // one second in the past
        });
      });

      it('1 seconds in the past (push_time and expiration_time local timezone)', async () => {
        await noPushFailed({
          push_time: '2019-01-04T18:01:01-07:00', // send push no eariler than one second ago
          expiration_time: '2019-01-04T18:01:01-07:00', // one second in the past (local)
        });
      });

      it('2 days in the past (missing time)', async () => {
        await noPushFailed({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2019-01-03', // expire after 2 days in the past
        });
      });

      it('2 days in the past', async () => {
        await noPushFailed({
          push_time: '2019-01-01T01:01:01Z', // send push no eariler than 4 days ago
          expiration_time: '2019-01-03T01:01:01Z', // expire 2 days ago
        });
      });

      it('5 years in the past', async () => {
        await noPushFailed({
          push_time: '2019-01-05T01:01:01Z', // send push no eariler than one second ago
          expiration_time: '2014-01-01T01:01:01Z', // expire 5 years ago
        });
      });
    });
  });
});
