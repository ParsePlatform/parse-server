'use strict';
const UserController = require('../lib/Controllers/UserController').UserController;
const Config = require('../lib/Config');
const validatorFail = () => {
  throw 'you are not authorized';
};

describe('ParseLiveQuery', function () {
  it('access user on onLiveQueryEvent disconnect', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.CoreManager.getLiveQueryController().setDefaultLiveQueryClient(null);
    const requestedUser = new Parse.User();
    requestedUser.setUsername('username');
    requestedUser.setPassword('password');
    Parse.Cloud.onLiveQueryEvent(req => {
      const { event, sessionToken } = req;
      if (event === 'ws_disconnect') {
        Parse.Cloud._removeAllHooks();
        expect(sessionToken).toBeDefined();
        expect(sessionToken).toBe(requestedUser.getSessionToken());
        done();
      }
    });
    await requestedUser.signUp();
    const query = new Parse.Query(TestObject);
    await query.subscribe();
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
  });

  it('can subscribe to query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can use patterns in className', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Test.*'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('expect afterEvent create', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('create');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
    });

    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    subscription.on('create', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent payload', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('update');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
      done();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('expect afterEvent enter', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('enter');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBe('bar');
      expect(req.original.get('foo')).toBeUndefined();
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('enter', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    object.set('foo', 'bar');
    await object.save();
  });

  it('expect afterEvent leave', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('leave');
      expect(req.user).toBeUndefined();
      expect(req.object.get('foo')).toBeUndefined();
      expect(req.original.get('foo')).toBe('bar');
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();
    subscription.on('leave', object => {
      expect(object.get('foo')).toBeUndefined();
      done();
    });

    object.unset('foo');
    await object.save();
  });

  it('expect afterEvent delete', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      expect(req.event).toBe('delete');
      expect(req.user).toBeUndefined();
      req.object.set('foo', 'bar');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);

    const subscription = await query.subscribe();
    subscription.on('delete', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });

    await object.destroy();
  });

  it('can handle afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      current.set('foo', 'yolo');

      const original = req.original;
      original.set('yolo', 'foo');
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', (object, original) => {
      expect(object.get('foo')).toBe('yolo');
      expect(original.get('yolo')).toBe('foo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can return different object in afterEvent', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const object = new Parse.Object('Yolo');
      req.object = object;
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.className).toBe('Yolo');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle afterEvent throw', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', () => {
      throw 'Throw error from LQ afterEvent.';
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('update should not have been called.');
    });
    subscription.on('error', e => {
      expect(e).toBe('Throw error from LQ afterEvent.');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle afterEvent sendEvent to false', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', req => {
      const current = req.object;
      const original = req.original;

      setTimeout(() => {
        done();
      }, 2000);

      if (current.get('foo') != original.get('foo')) {
        req.sendEvent = false;
      }
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', () => {
      fail('update should not have been called.');
    });
    subscription.on('error', () => {
      fail('error should not have been called.');
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle afterEvent set pointers', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    const secondObject = new Parse.Object('Test2');
    secondObject.set('foo', 'bar');
    await secondObject.save();

    Parse.Cloud.afterLiveQueryEvent('TestObject', async ({ object }) => {
      const query = new Parse.Query('Test2');
      const obj = await query.first();
      object.set('obj', obj);
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('obj')).toBeDefined();
      expect(object.get('obj').get('foo')).toBe('bar');
      done();
    });
    subscription.on('error', () => {
      fail('error should not have been called.');
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle async afterEvent modification', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const parent = new TestObject();
    const child = new TestObject();
    child.set('bar', 'foo');
    await Parse.Object.saveAll([parent, child]);

    Parse.Cloud.afterLiveQueryEvent('TestObject', async req => {
      const current = req.object;
      const pointer = current.get('child');
      await pointer.fetch();
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', parent.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('child')).toBeDefined();
      expect(object.get('child').get('bar')).toBe('foo');
      done();
    });
    parent.set('child', child);
    await parent.save();
  });

  it('can handle beforeConnect / beforeSubscribe hooks', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe('TestObject', req => {
      expect(req.op).toBe('subscribe');
      expect(req.requestId).toBe(1);
      expect(req.query).toBeDefined();
      expect(req.user).toBeUndefined();
    });

    Parse.Cloud.beforeConnect(req => {
      expect(req.event).toBe('connect');
      expect(req.clients).toBe(0);
      expect(req.subscriptions).toBe(0);
      expect(req.useMasterKey).toBe(false);
      expect(req.installationId).toBeDefined();
      expect(req.user).toBeUndefined();
      expect(req.client).toBeDefined();
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('update', object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    object.set({ foo: 'bar' });
    await object.save();
  });

  it('can handle beforeConnect validation function', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });

    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeConnect(() => {}, validatorFail);
    let complete = false;
    Parse.LiveQuery.on('error', error => {
      Parse.LiveQuery.removeAllListeners('error');
      if (complete) {
        return;
      }
      complete = true;
      expect(error).toBe('you are not authorized');
      done();
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
  });

  it('can handle beforeSubscribe validation function', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe(TestObject, () => {}, validatorFail);
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('error', error => {
      expect(error).toBe('you are not authorized');
      done();
    });
  });

  it('can handle afterEvent validation function', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.afterLiveQueryEvent('TestObject', () => {}, validatorFail);

    const query = new Parse.Query(TestObject);
    const subscription = await query.subscribe();
    subscription.on('error', error => {
      expect(error).toBe('you are not authorized');
      done();
    });

    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
  });

  it('can handle beforeConnect error', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeConnect(() => {
      throw new Error('You shall not pass!');
    });
    Parse.LiveQuery.on('error', error => {
      Parse.LiveQuery.removeAllListeners('error');
      expect(error).toBe('You shall not pass!');
      done();
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    await query.subscribe();
  });

  it('can handle beforeSubscribe error', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const object = new TestObject();
    await object.save();

    Parse.Cloud.beforeSubscribe(TestObject, () => {
      throw new Error('You shall not subscribe!');
    });
    Parse.LiveQuery.on('error', error => {
      expect(error).toBe('You shall not subscribe!');
    });
    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();
    subscription.on('error', error => {
      Parse.LiveQuery.removeAllListeners('error');
      expect(error).toBe('You shall not subscribe!');
      done();
    });
  });

  it('can handle mutate beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.beforeSubscribe(TestObject, request => {
      const query = request.query;
      query.equalTo('yolo', 'abc');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    subscription.on('update', () => {
      fail();
    });
    object.set({ foo: 'bar' });
    await object.save();
    setTimeout(async () => {
      done();
    }, 1000);
  });

  it('can return a new beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.beforeSubscribe(TestObject, request => {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'yolo');
      request.query = query;
    });

    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    const subscription = await query.subscribe();

    subscription.on('create', object => {
      expect(object.get('foo')).toBe('yolo');
      done();
    });
    const object = new TestObject();
    object.set({ foo: 'yolo' });
    await object.save();
  });

  it('can handle select beforeSubscribe query', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    Parse.Cloud.beforeSubscribe(TestObject, request => {
      const query = request.query;
      query.select('yolo');
    });

    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    subscription.on('update', object => {
      expect(object.get('foo')).toBeUndefined();
      expect(object.get('yolo')).toBe('abc');
      done();
    });
    object.set({ foo: 'bar', yolo: 'abc' });
    await object.save();
  });

  it('LiveQuery with ACL', async () => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['Chat'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
    });
    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();

    const calls = {
      beforeConnect(req) {
        expect(req.event).toBe('connect');
        expect(req.clients).toBe(0);
        expect(req.subscriptions).toBe(0);
        expect(req.useMasterKey).toBe(false);
        expect(req.installationId).toBeDefined();
        expect(req.client).toBeDefined();
      },
      beforeSubscribe(req) {
        expect(req.op).toBe('subscribe');
        expect(req.requestId).toBe(1);
        expect(req.query).toBeDefined();
        expect(req.user).toBeDefined();
      },
      afterLiveQueryEvent(req) {
        expect(req.user).toBeDefined();
        expect(req.object.get('foo')).toBe('bar');
      },
      create(object) {
        expect(object.get('foo')).toBe('bar');
      },
      delete(object) {
        expect(object.get('foo')).toBe('bar');
      },
    };
    for (const key in calls) {
      spyOn(calls, key).and.callThrough();
    }
    Parse.Cloud.beforeConnect(calls.beforeConnect);
    Parse.Cloud.beforeSubscribe('Chat', calls.beforeSubscribe);
    Parse.Cloud.afterLiveQueryEvent('Chat', calls.afterLiveQueryEvent);

    const chatQuery = new Parse.Query('Chat');
    const subscription = await chatQuery.subscribe();
    subscription.on('create', calls.create);
    subscription.on('delete', calls.delete);
    const object = new Parse.Object('Chat');
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    object.set({ foo: 'bar' });
    await object.save();
    await object.destroy();
    await new Promise(resolve => setTimeout(resolve, 200));
    for (const key in calls) {
      expect(calls[key]).toHaveBeenCalled();
    }
  });

  it('handle invalid websocket payload length', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      websocketTimeout: 100,
    });
    const object = new TestObject();
    await object.save();

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', object.id);
    const subscription = await query.subscribe();

    // All control frames must have a payload length of 125 bytes or less.
    // https://tools.ietf.org/html/rfc6455#section-5.5
    //
    // 0x89 = 10001001 = ping
    // 0xfe = 11111110 = first bit is masking the remaining 7 are 1111110 or 126 the payload length
    // https://tools.ietf.org/html/rfc6455#section-5.2
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.socket._socket.write(Buffer.from([0x89, 0xfe]));

    subscription.on('update', async object => {
      expect(object.get('foo')).toBe('bar');
      done();
    });
    // Wait for Websocket timeout to reconnect
    setTimeout(async () => {
      object.set({ foo: 'bar' });
      await object.save();
    }, 1000);
  });

  it('should execute live query update on email validation', async done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => {},
    };

    await reconfigureServer({
      liveQuery: {
        classNames: ['_User'],
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      websocketTimeout: 100,
      appName: 'liveQueryEmailValidation',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      emailVerifyTokenValidityDuration: 20, // 0.5 second
      publicServerURL: 'http://localhost:8378/1',
    }).then(() => {
      const user = new Parse.User();
      user.set('password', 'asdf');
      user.set('email', 'asdf@example.com');
      user.set('username', 'zxcv');
      user
        .signUp()
        .then(() => {
          const config = Config.get('test');
          return config.database.find('_User', {
            username: 'zxcv',
          });
        })
        .then(async results => {
          const foundUser = results[0];
          const query = new Parse.Query('_User');
          query.equalTo('objectId', foundUser.objectId);
          const subscription = await query.subscribe();

          subscription.on('update', async object => {
            expect(object).toBeDefined();
            expect(object.get('emailVerified')).toBe(true);
            done();
          });

          const userController = new UserController(emailAdapter, 'test', {
            verifyUserEmails: true,
          });
          userController.verifyEmail(foundUser.username, foundUser._email_verify_token);
        });
    });
  });

  it('should not broadcast event to client with invalid session token - avisory GHSA-2xm2-xj2q-qgpj', async done => {
    await reconfigureServer({
      liveQuery: {
        classNames: ['TestObject'],
      },
      liveQueryServerOptions: {
        cacheTimeout: 100,
      },
      startLiveQueryServer: true,
      verbose: false,
      silent: true,
      cacheTTL: 100,
    });
    const user = new Parse.User();
    user.setUsername('username');
    user.setPassword('password');
    await user.signUp();
    const obj1 = new Parse.Object('TestObject');
    const obj1ACL = new Parse.ACL();
    obj1ACL.setPublicReadAccess(false);
    obj1ACL.setReadAccess(user, true);
    obj1.setACL(obj1ACL);
    const obj2 = new Parse.Object('TestObject');
    const obj2ACL = new Parse.ACL();
    obj2ACL.setPublicReadAccess(false);
    obj2ACL.setReadAccess(user, true);
    obj2.setACL(obj2ACL);
    const query = new Parse.Query('TestObject');
    const subscription = await query.subscribe();
    subscription.on('create', obj => {
      if (obj.id !== obj1.id) {
        done.fail('should not fire');
      }
    });
    await obj1.save();
    await Parse.User.logOut();
    await new Promise(resolve => setTimeout(resolve, 200));
    await obj2.save();
    await new Promise(resolve => setTimeout(resolve, 200));
    done();
  });

  afterEach(async function (done) {
    const client = await Parse.CoreManager.getLiveQueryController().getDefaultLiveQueryClient();
    client.close();
    // Wait for live query client to disconnect
    setTimeout(() => {
      done();
    }, 1000);
  });
});
