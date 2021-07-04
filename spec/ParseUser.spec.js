// This is a port of the test suite:
// hungry/js/test/parse_user_test.js
//
// Things that we didn't port:
// Tests that involve revocable sessions.
// Tests that involve sending password reset emails.

'use strict';

const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const request = require('../lib/request');
const passwordCrypto = require('../lib/password');
const Config = require('../lib/Config');
const cryptoUtils = require('../lib/cryptoUtils');
const UsersRouter = require('../lib/Routers/UsersRouter');

function verifyACL(user) {
  const ACL = user.getACL();
  expect(ACL.getReadAccess(user)).toBe(true);
  expect(ACL.getWriteAccess(user)).toBe(true);
  expect(ACL.getPublicReadAccess()).toBe(true);
  expect(ACL.getPublicWriteAccess()).toBe(false);
  const perms = ACL.permissionsById;
  expect(Object.keys(perms).length).toBe(2);
  expect(perms[user.id].read).toBe(true);
  expect(perms[user.id].write).toBe(true);
  expect(perms['*'].read).toBe(true);
  expect(perms['*'].write).not.toBe(true);
}

describe('Parse.User testing', () => {
  it('user sign up class method', async done => {
    const user = await Parse.User.signUp('asdf', 'zxcv');
    ok(user.getSessionToken());
    done();
  });

  it('user sign up instance method', async () => {
    const user = new Parse.User();
    user.setPassword('asdf');
    user.setUsername('zxcv');
    await user.signUp();
    ok(user.getSessionToken());
  });

  it('user login wrong username', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    try {
      await Parse.User.logIn('non_existent_user', 'asdf3');
      done.fail();
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('user login wrong password', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    try {
      await Parse.User.logIn('asdf', 'asdfWrong');
      done.fail();
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('user login with non-string username with REST API', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        _method: 'GET',
        username: { $regex: '^asd' },
        password: 'zxcv',
      },
    })
      .then(res => {
        fail(`no request should succeed: ${JSON.stringify(res)}`);
        done();
      })
      .catch(err => {
        expect(err.status).toBe(404);
        expect(err.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      });
  });

  it('user login with non-string username with REST API (again)', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        _method: 'GET',
        username: 'asdf',
        password: { $regex: '^zx' },
      },
    })
      .then(res => {
        fail(`no request should succeed: ${JSON.stringify(res)}`);
        done();
      })
      .catch(err => {
        expect(err.status).toBe(404);
        expect(err.text).toMatch('{"code":101,"error":"Invalid username/password."}');
        done();
      });
  });

  it('user login using POST with REST API', async done => {
    await Parse.User.signUp('some_user', 'some_password');
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
      body: {
        username: 'some_user',
        password: 'some_password',
      },
    })
      .then(res => {
        expect(res.data.username).toBe('some_user');
        done();
      })
      .catch(err => {
        fail(`no request should fail: ${JSON.stringify(err)}`);
        done();
      });
  });

  it('user login', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    const user = await Parse.User.logIn('asdf', 'zxcv');
    equal(user.get('username'), 'asdf');
    verifyACL(user);
    done();
  });

  it('should respect ACL without locking user out', done => {
    const user = new Parse.User();
    const ACL = new Parse.ACL();
    ACL.setPublicReadAccess(false);
    ACL.setPublicWriteAccess(false);
    user.setUsername('asdf');
    user.setPassword('zxcv');
    user.setACL(ACL);
    user
      .signUp()
      .then(() => {
        return Parse.User.logIn('asdf', 'zxcv');
      })
      .then(user => {
        equal(user.get('username'), 'asdf');
        const ACL = user.getACL();
        expect(ACL.getReadAccess(user)).toBe(true);
        expect(ACL.getWriteAccess(user)).toBe(true);
        expect(ACL.getPublicReadAccess()).toBe(false);
        expect(ACL.getPublicWriteAccess()).toBe(false);
        const perms = ACL.permissionsById;
        expect(Object.keys(perms).length).toBe(1);
        expect(perms[user.id].read).toBe(true);
        expect(perms[user.id].write).toBe(true);
        expect(perms['*']).toBeUndefined();
        // Try to lock out user
        const newACL = new Parse.ACL();
        newACL.setReadAccess(user.id, false);
        newACL.setWriteAccess(user.id, false);
        user.setACL(newACL);
        return user.save();
      })
      .then(() => {
        return Parse.User.logIn('asdf', 'zxcv');
      })
      .then(user => {
        equal(user.get('username'), 'asdf');
        const ACL = user.getACL();
        expect(ACL.getReadAccess(user)).toBe(true);
        expect(ACL.getWriteAccess(user)).toBe(true);
        expect(ACL.getPublicReadAccess()).toBe(false);
        expect(ACL.getPublicWriteAccess()).toBe(false);
        const perms = ACL.permissionsById;
        expect(Object.keys(perms).length).toBe(1);
        expect(perms[user.id].read).toBe(true);
        expect(perms[user.id].write).toBe(true);
        expect(perms['*']).toBeUndefined();
        done();
      })
      .catch(() => {
        fail('Should not fail');
        done();
      });
  });

  it('should let masterKey lockout user', done => {
    const user = new Parse.User();
    const ACL = new Parse.ACL();
    ACL.setPublicReadAccess(false);
    ACL.setPublicWriteAccess(false);
    user.setUsername('asdf');
    user.setPassword('zxcv');
    user.setACL(ACL);
    user
      .signUp()
      .then(() => {
        return Parse.User.logIn('asdf', 'zxcv');
      })
      .then(user => {
        equal(user.get('username'), 'asdf');
        // Lock the user down
        const ACL = new Parse.ACL();
        user.setACL(ACL);
        return user.save(null, { useMasterKey: true });
      })
      .then(() => {
        expect(user.getACL().getPublicReadAccess()).toBe(false);
        return Parse.User.logIn('asdf', 'zxcv');
      })
      .then(done.fail)
      .catch(err => {
        expect(err.message).toBe('Invalid username/password.');
        expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
        done();
      });
  });

  it_only_db('mongo')('should let legacy users without ACL login', async () => {
    await reconfigureServer();
    const databaseURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
    const adapter = new MongoStorageAdapter({
      collectionPrefix: 'test_',
      uri: databaseURI,
    });
    await adapter.connect();
    await adapter.database.dropDatabase();
    delete adapter.connectionPromise;
    Config.get(Parse.applicationId).schemaCache.clear();

    const user = new Parse.User();
    await user.signUp({
      username: 'newUser',
      password: 'password',
    });

    const collection = await adapter._adaptiveCollection('_User');
    await collection.insertOne({
      // the hashed password is 'password' hashed
      _hashed_password: '$2b$10$mJ2ca2UbCM9hlojYHZxkQe8pyEXe5YMg0nMdvP4AJBeqlTEZJ6/Uu',
      _session_token: 'xxx',
      email: 'xxx@a.b',
      username: 'oldUser',
      emailVerified: true,
      _email_verify_token: 'yyy',
    });

    // get the 2 users
    const users = await collection.find();
    expect(users.length).toBe(2);

    const aUser = await Parse.User.logIn('oldUser', 'password');
    expect(aUser).not.toBeUndefined();

    const newUser = await Parse.User.logIn('newUser', 'password');
    expect(newUser).not.toBeUndefined();
  });

  it('should be let masterKey lock user out with authData', async () => {
    const response = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        key: 'value',
        authData: { anonymous: { id: '00000000-0000-0000-0000-000000000001' } },
      },
    });
    const body = response.data;
    const objectId = body.objectId;
    const sessionToken = body.sessionToken;
    expect(sessionToken).toBeDefined();
    expect(objectId).toBeDefined();
    const user = new Parse.User();
    user.id = objectId;
    const ACL = new Parse.ACL();
    user.setACL(ACL);
    await user.save(null, { useMasterKey: true });
    // update the user
    const options = {
      method: 'POST',
      url: `http://localhost:8378/1/classes/_User/`,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        key: 'otherValue',
        authData: {
          anonymous: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    };
    const res = await request(options);
    expect(res.data.objectId).not.toEqual(objectId);
  });

  it('user login with files', done => {
    const file = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    file
      .save()
      .then(file => {
        return Parse.User.signUp('asdf', 'zxcv', { file: file });
      })
      .then(() => {
        return Parse.User.logIn('asdf', 'zxcv');
      })
      .then(user => {
        const fileAgain = user.get('file');
        ok(fileAgain.name());
        ok(fileAgain.url());
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('become sends token back', done => {
    let user = null;
    let sessionToken = null;

    Parse.User.signUp('Jason', 'Parse', { code: 'red' })
      .then(newUser => {
        user = newUser;
        expect(user.get('code'), 'red');

        sessionToken = newUser.getSessionToken();
        expect(sessionToken).toBeDefined();

        return Parse.User.become(sessionToken);
      })
      .then(newUser => {
        expect(newUser.id).toEqual(user.id);
        expect(newUser.get('username'), 'Jason');
        expect(newUser.get('code'), 'red');
        expect(newUser.getSessionToken()).toEqual(sessionToken);
      })
      .then(
        () => {
          done();
        },
        error => {
          jfail(error);
          done();
        }
      );
  });

  it('become', done => {
    let user = null;
    let sessionToken = null;

    Promise.resolve()
      .then(function () {
        return Parse.User.signUp('Jason', 'Parse', { code: 'red' });
      })
      .then(function (newUser) {
        equal(Parse.User.current(), newUser);

        user = newUser;
        sessionToken = newUser.getSessionToken();
        ok(sessionToken);

        return Parse.User.logOut();
      })
      .then(() => {
        ok(!Parse.User.current());

        return Parse.User.become(sessionToken);
      })
      .then(function (newUser) {
        equal(Parse.User.current(), newUser);

        ok(newUser);
        equal(newUser.id, user.id);
        equal(newUser.get('username'), 'Jason');
        equal(newUser.get('code'), 'red');

        return Parse.User.logOut();
      })
      .then(() => {
        ok(!Parse.User.current());

        return Parse.User.become('somegarbage');
      })
      .then(
        function () {
          // This should have failed actually.
          ok(false, "Shouldn't have been able to log in with garbage session token.");
        },
        function (error) {
          ok(error);
          // Handle the error.
          return Promise.resolve();
        }
      )
      .then(
        function () {
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('should not call beforeLogin with become', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(() => {
      hit++;
    });

    await Parse.User._logInWith('facebook');
    const sessionToken = Parse.User.current().getSessionToken();
    await Parse.User.become(sessionToken);
    expect(hit).toBe(0);
    done();
  });

  it('cannot save non-authed user', async done => {
    let user = new Parse.User();
    user.set({
      password: 'asdf',
      email: 'asdf@example.com',
      username: 'zxcv',
    });
    let userAgain = await user.signUp();
    equal(userAgain, user);
    const query = new Parse.Query(Parse.User);
    const userNotAuthed = await query.get(user.id);
    user = new Parse.User();
    user.set({
      username: 'hacker',
      password: 'password',
    });
    userAgain = await user.signUp();
    equal(userAgain, user);
    userNotAuthed.set('username', 'changed');
    userNotAuthed.save().then(fail, err => {
      expect(err.code).toEqual(Parse.Error.SESSION_MISSING);
      done();
    });
  });

  it('cannot delete non-authed user', async done => {
    let user = new Parse.User();
    await user.signUp({
      password: 'asdf',
      email: 'asdf@example.com',
      username: 'zxcv',
    });
    const query = new Parse.Query(Parse.User);
    const userNotAuthed = await query.get(user.id);
    user = new Parse.User();
    const userAgain = await user.signUp({
      username: 'hacker',
      password: 'password',
    });
    equal(userAgain, user);
    userNotAuthed.set('username', 'changed');
    try {
      await userNotAuthed.destroy();
      done.fail();
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
      done();
    }
  });

  it('cannot saveAll with non-authed user', async done => {
    let user = new Parse.User();
    await user.signUp({
      password: 'asdf',
      email: 'asdf@example.com',
      username: 'zxcv',
    });
    const query = new Parse.Query(Parse.User);
    const userNotAuthed = await query.get(user.id);
    user = new Parse.User();
    await user.signUp({
      username: 'hacker',
      password: 'password',
    });
    const userNotAuthedNotChanged = await query.get(user.id);
    userNotAuthed.set('username', 'changed');
    const object = new TestObject();
    await object.save({
      user: userNotAuthedNotChanged,
    });
    const item1 = new TestObject();
    await item1.save({
      number: 0,
    });
    item1.set('number', 1);
    const item2 = new TestObject();
    item2.set('number', 2);
    try {
      await Parse.Object.saveAll([item1, item2, userNotAuthed]);
      done.fail();
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
      done();
    }
  });

  it('never locks himself up', async () => {
    const user = new Parse.User();
    await user.signUp({
      username: 'username',
      password: 'password',
    });
    user.setACL(new Parse.ACL());
    await user.save();
    await user.fetch();
    expect(user.getACL().getReadAccess(user)).toBe(true);
    expect(user.getACL().getWriteAccess(user)).toBe(true);
    const publicReadACL = new Parse.ACL();
    publicReadACL.setPublicReadAccess(true);

    // Create an administrator role with a single admin user
    const role = new Parse.Role('admin', publicReadACL);
    const admin = new Parse.User();
    await admin.signUp({
      username: 'admin',
      password: 'admin',
    });
    role.getUsers().add(admin);
    await role.save(null, { useMasterKey: true });

    // Grant the admins write rights on the user
    const acl = user.getACL();
    acl.setRoleWriteAccess(role, true);
    acl.setRoleReadAccess(role, true);

    // Update with the masterKey just to be sure
    await user.save({ ACL: acl }, { useMasterKey: true });

    // Try to update from admin... should all work fine
    await user.save({ key: 'fromAdmin' }, { sessionToken: admin.getSessionToken() });
    await user.fetch();
    expect(user.toJSON().key).toEqual('fromAdmin');

    // Try to save when logged out (public)
    let failed = false;
    try {
      // Ensure no session token is sent
      await Parse.User.logOut();
      await user.save({ key: 'fromPublic' });
    } catch (e) {
      failed = true;
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
    }
    expect({ failed }).toEqual({ failed: true });

    // Try to save with a random user, should fail
    failed = false;
    const anyUser = new Parse.User();
    await anyUser.signUp({
      username: 'randomUser',
      password: 'password',
    });
    try {
      await user.save({ key: 'fromAnyUser' });
    } catch (e) {
      failed = true;
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
    }
    expect({ failed }).toEqual({ failed: true });
  });

  it('current user', done => {
    const user = new Parse.User();
    user.set('password', 'asdf');
    user.set('email', 'asdf@example.com');
    user.set('username', 'zxcv');
    user
      .signUp()
      .then(() => {
        const currentUser = Parse.User.current();
        equal(user.id, currentUser.id);
        ok(user.getSessionToken());

        const currentUserAgain = Parse.User.current();
        // should be the same object
        equal(currentUser, currentUserAgain);

        // test logging out the current user
        return Parse.User.logOut();
      })
      .then(() => {
        equal(Parse.User.current(), null);
        done();
      });
  });

  it('user.isCurrent', done => {
    const user1 = new Parse.User();
    const user2 = new Parse.User();
    const user3 = new Parse.User();

    user1.set('username', 'a');
    user2.set('username', 'b');
    user3.set('username', 'c');

    user1.set('password', 'password');
    user2.set('password', 'password');
    user3.set('password', 'password');

    user1
      .signUp()
      .then(() => {
        equal(user1.isCurrent(), true);
        equal(user2.isCurrent(), false);
        equal(user3.isCurrent(), false);
        return user2.signUp();
      })
      .then(() => {
        equal(user1.isCurrent(), false);
        equal(user2.isCurrent(), true);
        equal(user3.isCurrent(), false);
        return user3.signUp();
      })
      .then(() => {
        equal(user1.isCurrent(), false);
        equal(user2.isCurrent(), false);
        equal(user3.isCurrent(), true);
        return Parse.User.logIn('a', 'password');
      })
      .then(() => {
        equal(user1.isCurrent(), true);
        equal(user2.isCurrent(), false);
        equal(user3.isCurrent(), false);
        return Parse.User.logIn('b', 'password');
      })
      .then(() => {
        equal(user1.isCurrent(), false);
        equal(user2.isCurrent(), true);
        equal(user3.isCurrent(), false);
        return Parse.User.logIn('b', 'password');
      })
      .then(() => {
        equal(user1.isCurrent(), false);
        equal(user2.isCurrent(), true);
        equal(user3.isCurrent(), false);
        return Parse.User.logOut();
      })
      .then(() => {
        equal(user2.isCurrent(), false);
        done();
      });
  });

  it('user associations', async done => {
    const child = new TestObject();
    await child.save();
    const user = new Parse.User();
    user.set('password', 'asdf');
    user.set('email', 'asdf@example.com');
    user.set('username', 'zxcv');
    user.set('child', child);
    await user.signUp();
    const object = new TestObject();
    object.set('user', user);
    await object.save();
    const query = new Parse.Query(TestObject);
    const objectAgain = await query.get(object.id);
    const userAgain = objectAgain.get('user');
    await userAgain.fetch();
    equal(user.id, userAgain.id);
    equal(userAgain.get('child').id, child.id);
    done();
  });

  it('user queries', async done => {
    const user = new Parse.User();
    user.set('password', 'asdf');
    user.set('email', 'asdf@example.com');
    user.set('username', 'zxcv');
    await user.signUp();
    const query = new Parse.Query(Parse.User);
    const userAgain = await query.get(user.id);
    equal(userAgain.id, user.id);
    const users = await query.find();
    equal(users.length, 1);
    equal(users[0].id, user.id);
    ok(userAgain.get('email'), 'asdf@example.com');
    done();
  });

  function signUpAll(list, optionsOrCallback) {
    let promise = Promise.resolve();
    list.forEach(user => {
      promise = promise.then(function () {
        return user.signUp();
      });
    });
    promise = promise.then(function () {
      return list;
    });
    return promise.then(optionsOrCallback);
  }

  it('contained in user array queries', async done => {
    const USERS = 4;
    const MESSAGES = 5;

    // Make a list of users.
    const userList = range(USERS).map(function (i) {
      const user = new Parse.User();
      user.set('password', 'user_num_' + i);
      user.set('email', 'user_num_' + i + '@example.com');
      user.set('username', 'xinglblog_num_' + i);
      return user;
    });

    signUpAll(userList, async function (users) {
      // Make a list of messages.
      if (!users || users.length != USERS) {
        fail('signupAll failed');
        done();
        return;
      }
      const messageList = range(MESSAGES).map(function (i) {
        const message = new TestObject();
        message.set('to', users[(i + 1) % USERS]);
        message.set('from', users[i % USERS]);
        return message;
      });

      // Save all the messages.
      await Parse.Object.saveAll(messageList);

      // Assemble an "in" list.
      const inList = [users[0], users[3], users[3]]; // Intentional dupe
      const query = new Parse.Query(TestObject);
      query.containedIn('from', inList);
      const results = await query.find();
      equal(results.length, 3);
      done();
    });
  });

  it("saving a user signs them up but doesn't log them in", async done => {
    const user = new Parse.User();
    await user.save({
      password: 'asdf',
      email: 'asdf@example.com',
      username: 'zxcv',
    });
    equal(Parse.User.current(), null);
    done();
  });

  it('user updates', async done => {
    const user = new Parse.User();
    await user.signUp({
      password: 'asdf',
      email: 'asdf@example.com',
      username: 'zxcv',
    });

    user.set('username', 'test');
    await user.save();
    equal(Object.keys(user.attributes).length, 6);
    ok(user.attributes['username']);
    ok(user.attributes['email']);
    await user.destroy();
    const query = new Parse.Query(Parse.User);
    try {
      await query.get(user.id);
      done.fail();
    } catch (error) {
      // The user should no longer exist.
      equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('count users', async done => {
    const james = new Parse.User();
    james.set('username', 'james');
    james.set('password', 'mypass');
    await james.signUp();
    const kevin = new Parse.User();
    kevin.set('username', 'kevin');
    kevin.set('password', 'mypass');
    await kevin.signUp();
    const query = new Parse.Query(Parse.User);
    const count = await query.count();
    equal(count, 2);
    done();
  });

  it('user sign up with container class', async done => {
    await Parse.User.signUp('ilya', 'mypass', { array: ['hello'] });
    done();
  });

  it('user modified while saving', async done => {
    Parse.Object.disableSingleInstance();
    await reconfigureServer();
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'password');
    user.signUp().then(function (userAgain) {
      equal(userAgain.get('username'), 'bob');
      ok(userAgain.dirty('username'));
      const query = new Parse.Query(Parse.User);
      query.get(user.id).then(freshUser => {
        equal(freshUser.id, user.id);
        equal(freshUser.get('username'), 'alice');
        done();
      });
    });
    // Jump a frame so the signup call is properly sent
    // This is due to the fact that now, we use real promises
    process.nextTick(() => {
      ok(user.set('username', 'bob'));
    });
  });

  it('user modified while saving with unsaved child', done => {
    Parse.Object.disableSingleInstance();
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'password');
    user.set('child', new TestObject());
    user.signUp().then(userAgain => {
      equal(userAgain.get('username'), 'bob');
      // Should be dirty, but it depends on batch support.
      // ok(userAgain.dirty("username"));
      const query = new Parse.Query(Parse.User);
      query.get(user.id).then(freshUser => {
        equal(freshUser.id, user.id);
        // Should be alice, but it depends on batch support.
        equal(freshUser.get('username'), 'bob');
        done();
      });
    });
    ok(user.set('username', 'bob'));
  });

  it('user loaded from localStorage from signup', async done => {
    const alice = await Parse.User.signUp('alice', 'password');
    ok(alice.id, 'Alice should have an objectId');
    ok(alice.getSessionToken(), 'Alice should have a session token');
    equal(alice.get('password'), undefined, 'Alice should not have a password');

    // Simulate the environment getting reset.
    Parse.User._currentUser = null;
    Parse.User._currentUserMatchesDisk = false;

    const aliceAgain = Parse.User.current();
    equal(aliceAgain.get('username'), 'alice');
    equal(aliceAgain.id, alice.id, 'currentUser should have objectId');
    ok(aliceAgain.getSessionToken(), 'currentUser should have a sessionToken');
    equal(alice.get('password'), undefined, 'currentUser should not have password');
    done();
  });

  it('user loaded from localStorage from login', done => {
    let id;
    Parse.User.signUp('alice', 'password')
      .then(alice => {
        id = alice.id;
        return Parse.User.logOut();
      })
      .then(() => {
        return Parse.User.logIn('alice', 'password');
      })
      .then(() => {
        // Force the current user to read from disk
        delete Parse.User._currentUser;
        delete Parse.User._currentUserMatchesDisk;

        const userFromDisk = Parse.User.current();
        equal(userFromDisk.get('password'), undefined, 'password should not be in attributes');
        equal(userFromDisk.id, id, 'id should be set');
        ok(userFromDisk.getSessionToken(), 'currentUser should have a sessionToken');
        done();
      });
  });

  it('saving user after browser refresh', done => {
    let id;

    Parse.User.signUp('alice', 'password', null)
      .then(function (alice) {
        id = alice.id;
        return Parse.User.logOut();
      })
      .then(() => {
        return Parse.User.logIn('alice', 'password');
      })
      .then(function () {
        // Simulate browser refresh by force-reloading user from localStorage
        Parse.User._clearCache();

        // Test that this save works correctly
        return Parse.User.current().save({ some_field: 1 });
      })
      .then(
        function () {
          // Check the user in memory just after save operation
          const userInMemory = Parse.User.current();

          equal(
            userInMemory.getUsername(),
            'alice',
            'saving user should not remove existing fields'
          );

          equal(userInMemory.get('some_field'), 1, 'saving user should save specified field');

          equal(
            userInMemory.get('password'),
            undefined,
            'password should not be in attributes after saving user'
          );

          equal(
            userInMemory.get('objectId'),
            undefined,
            'objectId should not be in attributes after saving user'
          );

          equal(
            userInMemory.get('_id'),
            undefined,
            '_id should not be in attributes after saving user'
          );

          equal(userInMemory.id, id, 'id should be set');

          expect(userInMemory.updatedAt instanceof Date).toBe(true);

          ok(userInMemory.createdAt instanceof Date);

          ok(userInMemory.getSessionToken(), 'user should have a sessionToken after saving');

          // Force the current user to read from localStorage, and check again
          delete Parse.User._currentUser;
          delete Parse.User._currentUserMatchesDisk;
          const userFromDisk = Parse.User.current();

          equal(
            userFromDisk.getUsername(),
            'alice',
            'userFromDisk should have previously existing fields'
          );

          equal(userFromDisk.get('some_field'), 1, 'userFromDisk should have saved field');

          equal(
            userFromDisk.get('password'),
            undefined,
            'password should not be in attributes of userFromDisk'
          );

          equal(
            userFromDisk.get('objectId'),
            undefined,
            'objectId should not be in attributes of userFromDisk'
          );

          equal(
            userFromDisk.get('_id'),
            undefined,
            '_id should not be in attributes of userFromDisk'
          );

          equal(userFromDisk.id, id, 'id should be set on userFromDisk');

          ok(userFromDisk.updatedAt instanceof Date);

          ok(userFromDisk.createdAt instanceof Date);

          ok(userFromDisk.getSessionToken(), 'userFromDisk should have a sessionToken');

          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('user with missing username', async done => {
    const user = new Parse.User();
    user.set('password', 'foo');
    try {
      await user.signUp();
      done.fail();
    } catch (error) {
      equal(error.code, Parse.Error.OTHER_CAUSE);
      done();
    }
  });

  it('user with missing password', async done => {
    const user = new Parse.User();
    user.set('username', 'foo');
    try {
      await user.signUp();
      done.fail();
    } catch (error) {
      equal(error.code, Parse.Error.OTHER_CAUSE);
      done();
    }
  });

  it('user stupid subclassing', async done => {
    const SuperUser = Parse.Object.extend('User');
    const user = new SuperUser();
    user.set('username', 'bob');
    user.set('password', 'welcome');
    ok(user instanceof Parse.User, 'Subclassing User should have worked');
    await user.signUp();
    done();
  });

  it('user signup class method uses subclassing', async done => {
    const SuperUser = Parse.User.extend({
      secret: function () {
        return 1337;
      },
    });

    const user = await Parse.User.signUp('bob', 'welcome');
    ok(user instanceof SuperUser, 'Subclassing User should have worked');
    equal(user.secret(), 1337);
    done();
  });

  it('user on disk gets updated after save', async done => {
    Parse.User.extend({
      isSuper: function () {
        return true;
      },
    });

    const user = await Parse.User.signUp('bob', 'welcome');
    await user.save('secret', 1337);
    delete Parse.User._currentUser;
    delete Parse.User._currentUserMatchesDisk;

    const userFromDisk = Parse.User.current();
    equal(userFromDisk.get('secret'), 1337);
    ok(userFromDisk.isSuper(), 'The subclass should have been used');
    done();
  });

  it("current user isn't dirty", async done => {
    const user = await Parse.User.signUp('andrew', 'oppa', {
      style: 'gangnam',
    });
    ok(!user.dirty('style'), 'The user just signed up.');
    Parse.User._currentUser = null;
    Parse.User._currentUserMatchesDisk = false;
    const userAgain = Parse.User.current();
    ok(!userAgain.dirty('style'), 'The user was just read from disk.');
    done();
  });

  const getMockFacebookProviderWithIdToken = function (id, token) {
    return {
      authData: {
        id: id,
        access_token: token,
        expiration_date: new Date().toJSON(),
      },
      shouldError: false,
      loggedOut: false,
      synchronizedUserId: null,
      synchronizedAuthToken: null,
      synchronizedExpiration: null,

      authenticate: function (options) {
        if (this.shouldError) {
          options.error(this, 'An error occurred');
        } else if (this.shouldCancel) {
          options.error(this, null);
        } else {
          options.success(this, this.authData);
        }
      },
      restoreAuthentication: function (authData) {
        if (!authData) {
          this.synchronizedUserId = null;
          this.synchronizedAuthToken = null;
          this.synchronizedExpiration = null;
          return true;
        }
        this.synchronizedUserId = authData.id;
        this.synchronizedAuthToken = authData.access_token;
        this.synchronizedExpiration = authData.expiration_date;
        return true;
      },
      getAuthType: function () {
        return 'facebook';
      },
      deauthenticate: function () {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      },
    };
  };

  // Note that this mocks out client-side Facebook action rather than
  // server-side.
  const getMockFacebookProvider = function () {
    return getMockFacebookProviderWithIdToken('8675309', 'jenny');
  };

  const getMockMyOauthProvider = function () {
    return {
      authData: {
        id: '12345',
        access_token: '12345',
        expiration_date: new Date().toJSON(),
      },
      shouldError: false,
      loggedOut: false,
      synchronizedUserId: null,
      synchronizedAuthToken: null,
      synchronizedExpiration: null,

      authenticate: function (options) {
        if (this.shouldError) {
          options.error(this, 'An error occurred');
        } else if (this.shouldCancel) {
          options.error(this, null);
        } else {
          options.success(this, this.authData);
        }
      },
      restoreAuthentication: function (authData) {
        if (!authData) {
          this.synchronizedUserId = null;
          this.synchronizedAuthToken = null;
          this.synchronizedExpiration = null;
          return true;
        }
        this.synchronizedUserId = authData.id;
        this.synchronizedAuthToken = authData.access_token;
        this.synchronizedExpiration = authData.expiration_date;
        return true;
      },
      getAuthType: function () {
        return 'myoauth';
      },
      deauthenticate: function () {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      },
    };
  };

  Parse.User.extend({
    extended: function () {
      return true;
    },
  });

  it('log in with provider', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    done();
  });

  it('can not set authdata to null', async () => {
    try {
      const provider = getMockFacebookProvider();
      Parse.User._registerAuthenticationProvider(provider);
      const user = await Parse.User._logInWith('facebook');
      user.set('authData', null);
      await user.save();
      fail();
    } catch (e) {
      expect(e.message).toBe('This authentication method is unsupported.');
    }
  });

  it('ignore setting authdata to undefined', async () => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = await Parse.User._logInWith('facebook');
    user.set('authData', undefined);
    await user.save();
    let authData = user.get('authData');
    expect(authData).toBe(undefined);
    await user.fetch();
    authData = user.get('authData');
    expect(authData.facebook.id).toBeDefined();
  });

  it('user authData should be available in cloudcode (#2342)', async done => {
    Parse.Cloud.define('checkLogin', req => {
      expect(req.user).not.toBeUndefined();
      expect(Parse.FacebookUtils.isLinked(req.user)).toBe(true);
      return 'ok';
    });

    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');

    Parse.Cloud.run('checkLogin').then(done, done);
  });

  it('log in with provider and update token', async done => {
    const provider = getMockFacebookProvider();
    const secondProvider = getMockFacebookProviderWithIdToken('8675309', 'jenny_valid_token');
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User._logInWith('facebook');
    Parse.User._registerAuthenticationProvider(secondProvider);
    await Parse.User.logOut();
    await Parse.User._logInWith('facebook');
    expect(secondProvider.synchronizedAuthToken).toEqual('jenny_valid_token');
    // Make sure we can login with the new token again
    await Parse.User.logOut();
    await Parse.User._logInWith('facebook');
    done();
  });

  it('returns authData when authed and logged in with provider (regression test for #1498)', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = await Parse.User._logInWith('facebook');
    const userQuery = new Parse.Query(Parse.User);
    userQuery.get(user.id).then(user => {
      expect(user.get('authData')).not.toBeUndefined();
      done();
    });
  });

  it('only creates a single session for an installation / user pair (#2885)', async done => {
    Parse.Object.disableSingleInstance();
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User.logInWith('facebook');
    await Parse.User.logInWith('facebook');
    const user = await Parse.User.logInWith('facebook');
    const sessionToken = user.getSessionToken();
    const query = new Parse.Query('_Session');
    return query
      .find({ useMasterKey: true })
      .then(results => {
        expect(results.length).toBe(1);
        expect(results[0].get('sessionToken')).toBe(sessionToken);
        expect(results[0].get('createdWith')).toEqual({
          action: 'login',
          authProvider: 'facebook',
        });
        done();
      })
      .catch(done.fail);
  });

  it('log in with provider with files', done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const file = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    file
      .save()
      .then(file => {
        const user = new Parse.User();
        user.set('file', file);
        return user._linkWith('facebook', {});
      })
      .then(user => {
        expect(user._isLinked('facebook')).toBeTruthy();
        return Parse.User._logInWith('facebook', {});
      })
      .then(user => {
        const fileAgain = user.get('file');
        expect(fileAgain.name()).toMatch(/yolo.txt$/);
        expect(fileAgain.url()).toMatch(/yolo.txt$/);
      })
      .then(() => {
        done();
      })
      .catch(done.fail);
  });

  it('log in with provider twice', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');

    Parse.User.logOut().then(async () => {
      ok(provider.loggedOut);
      provider.loggedOut = false;
      const innerModel = await Parse.User._logInWith('facebook');
      ok(innerModel instanceof Parse.User, 'Model should be a Parse.User');
      ok(innerModel === Parse.User.current(), 'Returned model should be the current user');
      ok(provider.authData.id === provider.synchronizedUserId);
      ok(provider.authData.access_token === provider.synchronizedAuthToken);
      ok(innerModel._isLinked('facebook'), 'User should be linked to facebook');
      ok(innerModel.existed(), 'User should not be newly-created');
      done();
    }, done.fail);
  });

  it('log in with provider failed', async done => {
    const provider = getMockFacebookProvider();
    provider.shouldError = true;
    Parse.User._registerAuthenticationProvider(provider);
    try {
      await Parse.User._logInWith('facebook');
      done.fail();
    } catch (error) {
      ok(error, 'Error should be non-null');
      done();
    }
  });

  it('log in with provider cancelled', async done => {
    const provider = getMockFacebookProvider();
    provider.shouldCancel = true;
    Parse.User._registerAuthenticationProvider(provider);
    try {
      await Parse.User._logInWith('facebook');
      done.fail();
    } catch (error) {
      ok(error === null, 'Error should be null');
      done();
    }
  });

  it('login with provider should not call beforeSave trigger', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User._logInWith('facebook');
    Parse.User.logOut().then(async () => {
      Parse.Cloud.beforeSave(Parse.User, function (req, res) {
        res.error("Before save shouldn't be called on login");
      });
      await Parse.User._logInWith('facebook');
      done();
    });
  });

  it('signup with provider should not call beforeLogin trigger', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(() => {
      hit++;
    });

    await Parse.User._logInWith('facebook');
    expect(hit).toBe(0);
    done();
  });

  it('login with provider should call beforeLogin trigger', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('authData')).toBeDefined();
      expect(req.object.get('name')).toBe('tupac shakur');
    });
    await Parse.User._logInWith('facebook');
    await Parse.User.current().save({ name: 'tupac shakur' });
    await Parse.User.logOut();
    await Parse.User._logInWith('facebook');
    expect(hit).toBe(1);
    done();
  });

  it('incorrect login with provider should not call beforeLogin trigger', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(() => {
      hit++;
    });
    await Parse.User._logInWith('facebook');
    await Parse.User.logOut();
    provider.shouldError = true;
    try {
      await Parse.User._logInWith('facebook');
    } catch (e) {
      expect(e).toBeDefined();
    }
    expect(hit).toBe(0);
    done();
  });

  it('login with provider should be blockable by beforeLogin', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });
    await Parse.User._logInWith('facebook');
    await Parse.User.current().save({ isBanned: true });
    await Parse.User.logOut();

    try {
      await Parse.User._logInWith('facebook');
      throw new Error('should not have continued login.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }

    expect(hit).toBe(1);
    done();
  });

  it('login with provider should be blockable by beforeLogin even when the user has a attached file', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });

    const user = await Parse.User._logInWith('facebook');
    const base64 = 'aHR0cHM6Ly9naXRodWIuY29tL2t2bmt1YW5n';
    const file = new Parse.File('myfile.txt', { base64 });
    await file.save();
    await user.save({ isBanned: true, file });
    await Parse.User.logOut();

    try {
      await Parse.User._logInWith('facebook');
      throw new Error('should not have continued login.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }

    expect(hit).toBe(1);
    done();
  });

  it('logout with provider should call afterLogout trigger', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);

    let userId;
    Parse.Cloud.afterLogout(req => {
      expect(req.object.className).toEqual('_Session');
      expect(req.object.id).toBeDefined();
      const user = req.object.get('user');
      expect(user).toBeDefined();
      userId = user.id;
    });
    const user = await Parse.User._logInWith('facebook');
    await Parse.User.logOut();
    expect(user.id).toBe(userId);
    done();
  });

  it('link with provider', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProvider');
    user.set('password', 'mypass');
    await user.signUp();
    const model = await user._linkWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked');
    done();
  });

  // What this means is, only one Parse User can be linked to a
  // particular Facebook account.
  it('link with provider for already linked user', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProviderToAlreadyLinkedUser');
    user.set('password', 'mypass');
    await user.signUp();
    const model = await user._linkWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked.');
    const user2 = new Parse.User();
    user2.set('username', 'testLinkWithProviderToAlreadyLinkedUser2');
    user2.set('password', 'mypass');
    await user2.signUp();
    try {
      await user2._linkWith('facebook');
      done.fail();
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.ACCOUNT_ALREADY_LINKED);
      done();
    }
  });

  it('link with provider should return sessionToken', async () => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProvider');
    user.set('password', 'mypass');
    await user.signUp();
    const query = new Parse.Query(Parse.User);
    const u2 = await query.get(user.id);
    const model = await u2._linkWith('facebook', {}, { useMasterKey: true });
    expect(u2.getSessionToken()).toBeDefined();
    expect(model.getSessionToken()).toBeDefined();
    expect(u2.getSessionToken()).toBe(model.getSessionToken());
  });

  it('link with provider via sessionToken should not create new sessionToken (Regression #5799)', async () => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProviderNoOverride');
    user.set('password', 'mypass');
    await user.signUp();
    const sessionToken = user.getSessionToken();

    await user._linkWith('facebook', {}, { sessionToken });
    expect(sessionToken).toBe(user.getSessionToken());

    expect(user._isLinked(provider)).toBe(true);
    await user._unlinkFrom(provider, { sessionToken });
    expect(user._isLinked(provider)).toBe(false);

    const become = await Parse.User.become(sessionToken);
    expect(sessionToken).toBe(become.getSessionToken());
  });

  it('link with provider failed', async done => {
    const provider = getMockFacebookProvider();
    provider.shouldError = true;
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProvider');
    user.set('password', 'mypass');
    await user.signUp();
    try {
      await user._linkWith('facebook');
      done.fail();
    } catch (error) {
      ok(error, 'Linking should fail');
      ok(!user._isLinked('facebook'), 'User should not be linked to facebook');
      done();
    }
  });

  it('link with provider cancelled', async done => {
    const provider = getMockFacebookProvider();
    provider.shouldCancel = true;
    Parse.User._registerAuthenticationProvider(provider);
    const user = new Parse.User();
    user.set('username', 'testLinkWithProvider');
    user.set('password', 'mypass');
    await user.signUp();
    try {
      await user._linkWith('facebook');
      done.fail();
    } catch (error) {
      ok(!error, 'Linking should be cancelled');
      ok(!user._isLinked('facebook'), 'User should not be linked to facebook');
      done();
    }
  });

  it('unlink with provider', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User.');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook.');
    await model._unlinkFrom('facebook');
    ok(!model._isLinked('facebook'), 'User should not be linked.');
    ok(!provider.synchronizedUserId, 'User id should be cleared.');
    ok(!provider.synchronizedAuthToken, 'Auth token should be cleared.');
    ok(!provider.synchronizedExpiration, 'Expiration should be cleared.');
    done();
  });

  it('unlink and link', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');

    await model._unlinkFrom('facebook');
    ok(!model._isLinked('facebook'), 'User should not be linked to facebook');
    ok(!provider.synchronizedUserId, 'User id should be cleared');
    ok(!provider.synchronizedAuthToken, 'Auth token should be cleared');
    ok(!provider.synchronizedExpiration, 'Expiration should be cleared');

    await model._linkWith('facebook');
    ok(provider.synchronizedUserId, 'User id should have a value');
    ok(provider.synchronizedAuthToken, 'Auth token should have a value');
    ok(provider.synchronizedExpiration, 'Expiration should have a value');
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    done();
  });

  it('link multiple providers', async done => {
    const provider = getMockFacebookProvider();
    const mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    Parse.User._registerAuthenticationProvider(mockProvider);
    const objectId = model.id;
    await model._linkWith('myoauth');
    expect(model.id).toEqual(objectId);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');
    done();
  });

  it('link multiple providers and updates token', async done => {
    const provider = getMockFacebookProvider();
    const secondProvider = getMockFacebookProviderWithIdToken('8675309', 'jenny_valid_token');

    const mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    Parse.User._registerAuthenticationProvider(mockProvider);
    const objectId = model.id;
    await model._linkWith('myoauth');
    Parse.User._registerAuthenticationProvider(secondProvider);
    await Parse.User.logOut();
    await Parse.User._logInWith('facebook');
    await Parse.User.logOut();
    const user = await Parse.User._logInWith('myoauth');
    expect(user.id).toBe(objectId);
    done();
  });

  it('link multiple providers and update token', async done => {
    const provider = getMockFacebookProvider();
    const mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    Parse.User._registerAuthenticationProvider(mockProvider);
    const objectId = model.id;
    await model._linkWith('myoauth');
    expect(model.id).toEqual(objectId);
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');
    await model._linkWith('facebook');
    ok(model._isLinked('facebook'), 'User should be linked to facebook');
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');
    done();
  });

  it('should fail linking with existing', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User._logInWith('facebook');
    await Parse.User.logOut();
    const user = new Parse.User();
    user.setUsername('user');
    user.setPassword('password');
    await user.signUp();
    // try to link here
    try {
      await user._linkWith('facebook');
      done.fail();
    } catch (e) {
      done();
    }
  });

  it('should fail linking with existing through REST', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('facebook');
    const userId = model.id;
    Parse.User.logOut().then(() => {
      request({
        method: 'POST',
        url: Parse.serverURL + '/classes/_User',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
        body: { authData: { facebook: provider.authData } },
      }).then(response => {
        const body = response.data;
        // make sure the location header is properly set
        expect(userId).not.toBeUndefined();
        expect(body.objectId).toEqual(userId);
        expect(response.headers.location).toEqual(Parse.serverURL + '/users/' + userId);
        done();
      });
    });
  });

  it('should allow login with old authData token', done => {
    const provider = {
      authData: {
        id: '12345',
        access_token: 'token',
      },
      restoreAuthentication: function () {
        return true;
      },
      deauthenticate: function () {
        provider.authData = {};
      },
      authenticate: function (options) {
        options.success(this, provider.authData);
      },
      getAuthType: function () {
        return 'shortLivedAuth';
      },
    };
    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('token');
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith('shortLivedAuth', {})
      .then(() => {
        // Simulate a remotely expired token (like a short lived one)
        // In this case, we want success as it was valid once.
        // If the client needs an updated one, do lock the user out
        defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('otherToken');
        return Parse.User._logInWith('shortLivedAuth', {});
      })
      .then(
        () => {
          done();
        },
        err => {
          done.fail(err);
        }
      );
  });

  it('should allow PUT request with stale auth Data', done => {
    const provider = {
      authData: {
        id: '12345',
        access_token: 'token',
      },
      restoreAuthentication: function () {
        return true;
      },
      deauthenticate: function () {
        provider.authData = {};
      },
      authenticate: function (options) {
        options.success(this, provider.authData);
      },
      getAuthType: function () {
        return 'shortLivedAuth';
      },
    };
    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('token');
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith('shortLivedAuth', {})
      .then(() => {
        // Simulate a remotely expired token (like a short lived one)
        // In this case, we want success as it was valid once.
        // If the client needs an updated one, do lock the user out
        defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('otherToken');
        return request({
          method: 'PUT',
          url: Parse.serverURL + '/users/' + Parse.User.current().id,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'X-Parse-Session-Token': Parse.User.current().getSessionToken(),
            'Content-Type': 'application/json',
          },
          body: {
            key: 'value', // update a key
            authData: {
              // pass the original auth data
              shortLivedAuth: {
                id: '12345',
                access_token: 'token',
              },
            },
          },
        });
      })
      .then(
        () => {
          done();
        },
        err => {
          done.fail(err);
        }
      );
  });

  it('should properly error when password is missing', async done => {
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const user = await Parse.User._logInWith('facebook');
    user.set('username', 'myUser');
    user.set('email', 'foo@example.com');
    user
      .save()
      .then(() => {
        return Parse.User.logOut();
      })
      .then(() => {
        return Parse.User.logIn('myUser', 'password');
      })
      .then(
        () => {
          fail('should not succeed');
          done();
        },
        err => {
          expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
          expect(err.message).toEqual('Invalid username/password.');
          done();
        }
      );
  });

  it('should have authData in beforeSave and afterSave', async done => {
    Parse.Cloud.beforeSave('_User', request => {
      const authData = request.object.get('authData');
      expect(authData).not.toBeUndefined();
      if (authData) {
        expect(authData.facebook.id).toEqual('8675309');
        expect(authData.facebook.access_token).toEqual('jenny');
      } else {
        fail('authData should be set');
      }
    });

    Parse.Cloud.afterSave('_User', request => {
      const authData = request.object.get('authData');
      expect(authData).not.toBeUndefined();
      if (authData) {
        expect(authData.facebook.id).toEqual('8675309');
        expect(authData.facebook.access_token).toEqual('jenny');
      } else {
        fail('authData should be set');
      }
    });

    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    await Parse.User._logInWith('facebook');
    done();
  });

  it('set password then change password', done => {
    Parse.User.signUp('bob', 'barker')
      .then(bob => {
        bob.setPassword('meower');
        return bob.save();
      })
      .then(() => {
        return Parse.User.logIn('bob', 'meower');
      })
      .then(
        bob => {
          expect(bob.getUsername()).toEqual('bob');
          done();
        },
        e => {
          console.log(e);
          fail();
        }
      );
  });

  it('authenticated check', async done => {
    const user = new Parse.User();
    user.set('username', 'darkhelmet');
    user.set('password', 'onetwothreefour');
    ok(!user.authenticated());
    await user.signUp(null);
    ok(user.authenticated());
    done();
  });

  it('log in with explicit facebook auth data', async done => {
    await Parse.FacebookUtils.logIn({
      id: '8675309',
      access_token: 'jenny',
      expiration_date: new Date().toJSON(),
    });
    done();
  });

  it('log in async with explicit facebook auth data', done => {
    Parse.FacebookUtils.logIn({
      id: '8675309',
      access_token: 'jenny',
      expiration_date: new Date().toJSON(),
    }).then(
      function () {
        done();
      },
      function (error) {
        ok(false, error);
        done();
      }
    );
  });

  it('link with explicit facebook auth data', async done => {
    const user = await Parse.User.signUp('mask', 'open sesame');
    Parse.FacebookUtils.link(user, {
      id: '8675309',
      access_token: 'jenny',
      expiration_date: new Date().toJSON(),
    }).then(done, error => {
      jfail(error);
      done();
    });
  });

  it('link async with explicit facebook auth data', async done => {
    const user = await Parse.User.signUp('mask', 'open sesame');
    Parse.FacebookUtils.link(user, {
      id: '8675309',
      access_token: 'jenny',
      expiration_date: new Date().toJSON(),
    }).then(
      function () {
        done();
      },
      function (error) {
        ok(false, error);
        done();
      }
    );
  });

  it('async methods', done => {
    const data = { foo: 'bar' };

    Parse.User.signUp('finn', 'human', data)
      .then(function (user) {
        equal(Parse.User.current(), user);
        equal(user.get('foo'), 'bar');
        return Parse.User.logOut();
      })
      .then(function () {
        return Parse.User.logIn('finn', 'human');
      })
      .then(function (user) {
        equal(user, Parse.User.current());
        equal(user.get('foo'), 'bar');
        return Parse.User.logOut();
      })
      .then(function () {
        const user = new Parse.User();
        user.set('username', 'jake');
        user.set('password', 'dog');
        user.set('foo', 'baz');
        return user.signUp();
      })
      .then(function (user) {
        equal(user, Parse.User.current());
        equal(user.get('foo'), 'baz');
        user = new Parse.User();
        user.set('username', 'jake');
        user.set('password', 'dog');
        return user.logIn();
      })
      .then(function (user) {
        equal(user, Parse.User.current());
        equal(user.get('foo'), 'baz');
        const userAgain = new Parse.User();
        userAgain.id = user.id;
        return userAgain.fetch();
      })
      .then(function (userAgain) {
        equal(userAgain.get('foo'), 'baz');
        done();
      });
  });

  it("querying for users doesn't get session tokens", done => {
    Parse.User.signUp('finn', 'human', { foo: 'bar' })
      .then(function () {
        return Parse.User.logOut();
      })
      .then(() => {
        const user = new Parse.User();
        user.set('username', 'jake');
        user.set('password', 'dog');
        user.set('foo', 'baz');
        return user.signUp();
      })
      .then(function () {
        return Parse.User.logOut();
      })
      .then(() => {
        const query = new Parse.Query(Parse.User);
        return query.find({ sessionToken: null });
      })
      .then(
        function (users) {
          equal(users.length, 2);
          users.forEach(user => {
            expect(user.getSessionToken()).toBeUndefined();
            ok(!user.getSessionToken(), 'user should not have a session token.');
          });
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('querying for users only gets the expected fields', done => {
    Parse.User.signUp('finn', 'human', { foo: 'bar' }).then(() => {
      request({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
        url: 'http://localhost:8378/1/users',
      }).then(response => {
        const b = response.data;
        expect(b.results.length).toEqual(1);
        const user = b.results[0];
        expect(Object.keys(user).length).toEqual(6);
        done();
      });
    });
  });

  it("retrieve user data from fetch, make sure the session token hasn't changed", done => {
    const user = new Parse.User();
    user.setPassword('asdf');
    user.setUsername('zxcv');
    let currentSessionToken = '';
    Promise.resolve()
      .then(function () {
        return user.signUp();
      })
      .then(function () {
        currentSessionToken = user.getSessionToken();
        return user.fetch();
      })
      .then(
        function (u) {
          expect(currentSessionToken).toEqual(u.getSessionToken());
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('user save should fail with invalid email', done => {
    const user = new Parse.User();
    user.set('username', 'teste');
    user.set('password', 'test');
    user.set('email', 'invalid');
    user.signUp().then(
      () => {
        fail('Should not have been able to save.');
        done();
      },
      error => {
        expect(error.code).toEqual(125);
        done();
      }
    );
  });

  it('user signup should error if email taken', done => {
    const user = new Parse.User();
    user.set('username', 'test1');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user
      .signUp()
      .then(() => {
        const user2 = new Parse.User();
        user2.set('username', 'test2');
        user2.set('password', 'test');
        user2.set('email', 'test@test.com');
        return user2.signUp();
      })
      .then(
        () => {
          fail('Should not have been able to sign up.');
          done();
        },
        () => {
          done();
        }
      );
  });

  describe('case insensitive signup not allowed', () => {
    it('signup should fail with duplicate case insensitive username with basic setter', async () => {
      const user = new Parse.User();
      user.set('username', 'test1');
      user.set('password', 'test');
      await user.signUp();

      const user2 = new Parse.User();
      user2.set('username', 'Test1');
      user2.set('password', 'test');
      await expectAsync(user2.signUp()).toBeRejectedWith(
        new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.')
      );
    });

    it('signup should fail with duplicate case insensitive username with field specific setter', async () => {
      const user = new Parse.User();
      user.setUsername('test1');
      user.setPassword('test');
      await user.signUp();

      const user2 = new Parse.User();
      user2.setUsername('Test1');
      user2.setPassword('test');
      await expectAsync(user2.signUp()).toBeRejectedWith(
        new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.')
      );
    });

    it('signup should fail with duplicate case insensitive email', async () => {
      const user = new Parse.User();
      user.setUsername('test1');
      user.setPassword('test');
      user.setEmail('test@example.com');
      await user.signUp();

      const user2 = new Parse.User();
      user2.setUsername('test2');
      user2.setPassword('test');
      user2.setEmail('Test@Example.Com');
      await expectAsync(user2.signUp()).toBeRejectedWith(
        new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.')
      );
    });

    it('edit should fail with duplicate case insensitive email', async () => {
      const user = new Parse.User();
      user.setUsername('test1');
      user.setPassword('test');
      user.setEmail('test@example.com');
      await user.signUp();

      const user2 = new Parse.User();
      user2.setUsername('test2');
      user2.setPassword('test');
      user2.setEmail('Foo@Example.Com');
      await user2.signUp();

      user2.setEmail('Test@Example.Com');
      await expectAsync(user2.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.')
      );
    });

    describe('anonymous users', () => {
      beforeEach(() => {
        const insensitiveCollisions = [
          'abcdefghijklmnop',
          'Abcdefghijklmnop',
          'ABcdefghijklmnop',
          'ABCdefghijklmnop',
          'ABCDefghijklmnop',
          'ABCDEfghijklmnop',
          'ABCDEFghijklmnop',
          'ABCDEFGhijklmnop',
          'ABCDEFGHijklmnop',
          'ABCDEFGHIjklmnop',
          'ABCDEFGHIJklmnop',
          'ABCDEFGHIJKlmnop',
          'ABCDEFGHIJKLmnop',
          'ABCDEFGHIJKLMnop',
          'ABCDEFGHIJKLMnop',
          'ABCDEFGHIJKLMNop',
          'ABCDEFGHIJKLMNOp',
          'ABCDEFGHIJKLMNOP',
        ];

        // need a bunch of spare random strings per api request
        spyOn(cryptoUtils, 'randomString').and.returnValues(...insensitiveCollisions);
      });

      it('should not fail on case insensitive matches', async () => {
        const user1 = await Parse.AnonymousUtils.logIn();
        const username1 = user1.get('username');

        const user2 = await Parse.AnonymousUtils.logIn();
        const username2 = user2.get('username');

        expect(username1).not.toBeUndefined();
        expect(username2).not.toBeUndefined();
        expect(username1.toLowerCase()).toBe('abcdefghijklmnop');
        expect(username2.toLowerCase()).toBe('abcdefghijklmnop');
        expect(username2).not.toBe(username1);
        expect(username2.toLowerCase()).toBe(username1.toLowerCase()); // this is redundant :).
      });
    });
  });

  it('user cannot update email to existing user', done => {
    const user = new Parse.User();
    user.set('username', 'test1');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user
      .signUp()
      .then(() => {
        const user2 = new Parse.User();
        user2.set('username', 'test2');
        user2.set('password', 'test');
        return user2.signUp();
      })
      .then(user2 => {
        user2.set('email', 'test@test.com');
        return user2.save();
      })
      .then(
        () => {
          fail('Should not have been able to sign up.');
          done();
        },
        () => {
          done();
        }
      );
  });

  it('unset user email', done => {
    const user = new Parse.User();
    user.set('username', 'test');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user
      .signUp()
      .then(() => {
        user.unset('email');
        return user.save();
      })
      .then(() => {
        return Parse.User.logIn('test', 'test');
      })
      .then(user => {
        expect(user.getEmail()).toBeUndefined();
        done();
      });
  });

  it('create session from user', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('finn', 'human', { foo: 'bar' });
      })
      .then(user => {
        request({
          method: 'POST',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions',
        }).then(response => {
          const b = response.data;
          expect(typeof b.sessionToken).toEqual('string');
          expect(typeof b.createdWith).toEqual('object');
          expect(b.createdWith.action).toEqual('create');
          expect(typeof b.user).toEqual('object');
          expect(b.user.objectId).toEqual(user.id);
          done();
        });
      });
  });

  it('user get session from token on signup', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('finn', 'human', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions/me',
        }).then(response => {
          const b = response.data;
          expect(typeof b.sessionToken).toEqual('string');
          expect(typeof b.createdWith).toEqual('object');
          expect(b.createdWith.action).toEqual('signup');
          expect(typeof b.user).toEqual('object');
          expect(b.user.objectId).toEqual(user.id);
          done();
        });
      });
  });

  it('user get session from token on login', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('finn', 'human', { foo: 'bar' });
      })
      .then(() => {
        return Parse.User.logOut().then(() => {
          return Parse.User.logIn('finn', 'human');
        });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions/me',
        }).then(response => {
          const b = response.data;
          expect(typeof b.sessionToken).toEqual('string');
          expect(typeof b.createdWith).toEqual('object');
          expect(b.createdWith.action).toEqual('login');
          expect(typeof b.user).toEqual('object');
          expect(b.user.objectId).toEqual(user.id);
          done();
        });
      });
  });

  it('user update session with other field', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('finn', 'human', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions/me',
        }).then(response => {
          const b = response.data;
          request({
            method: 'PUT',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-Session-Token': user.getSessionToken(),
              'X-Parse-REST-API-Key': 'rest',
            },
            url: 'http://localhost:8378/1/sessions/' + b.objectId,
            body: JSON.stringify({ foo: 'bar' }),
          }).then(() => {
            done();
          });
        });
      });
  });

  it('cannot update session if invalid or no session token', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('finn', 'human', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions/me',
        }).then(response => {
          const b = response.data;
          request({
            method: 'PUT',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-Session-Token': 'foo',
              'X-Parse-REST-API-Key': 'rest',
              'Content-Type': 'application/json',
            },
            url: 'http://localhost:8378/1/sessions/' + b.objectId,
            body: JSON.stringify({ foo: 'bar' }),
          }).then(fail, response => {
            const b = response.data;
            expect(b.error).toBe('Invalid session token');
            request({
              method: 'PUT',
              headers: {
                'X-Parse-Application-Id': 'test',
                'X-Parse-REST-API-Key': 'rest',
              },
              url: 'http://localhost:8378/1/sessions/' + b.objectId,
              body: JSON.stringify({ foo: 'bar' }),
            }).then(fail, response => {
              const b = response.data;
              expect(b.error).toBe('Session token required.');
              done();
            });
          });
        });
      });
  });

  it('get session only for current user', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('test1', 'test', { foo: 'bar' });
      })
      .then(() => {
        return Parse.User.signUp('test2', 'test', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions',
        }).then(response => {
          const b = response.data;
          expect(b.results.length).toEqual(1);
          expect(typeof b.results[0].user).toEqual('object');
          expect(b.results[0].user.objectId).toEqual(user.id);
          done();
        });
      });
  });

  it('delete session by object', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('test1', 'test', { foo: 'bar' });
      })
      .then(() => {
        return Parse.User.signUp('test2', 'test', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions',
        }).then(response => {
          const b = response.data;
          let objId;
          try {
            expect(b.results.length).toEqual(1);
            objId = b.results[0].objectId;
          } catch (e) {
            jfail(e);
            done();
            return;
          }
          request({
            method: 'DELETE',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-Session-Token': user.getSessionToken(),
              'X-Parse-REST-API-Key': 'rest',
            },
            url: 'http://localhost:8378/1/sessions/' + objId,
          }).then(() => {
            request({
              headers: {
                'X-Parse-Application-Id': 'test',
                'X-Parse-Session-Token': user.getSessionToken(),
                'X-Parse-REST-API-Key': 'rest',
              },
              url: 'http://localhost:8378/1/sessions',
            }).then(fail, response => {
              const b = response.data;
              expect(b.code).toEqual(209);
              expect(b.error).toBe('Invalid session token');
              done();
            });
          });
        });
      });
  });

  it('cannot delete session if no sessionToken', done => {
    Promise.resolve()
      .then(() => {
        return Parse.User.signUp('test1', 'test', { foo: 'bar' });
      })
      .then(() => {
        return Parse.User.signUp('test2', 'test', { foo: 'bar' });
      })
      .then(user => {
        request({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/sessions',
        }).then(response => {
          const b = response.data;
          expect(b.results.length).toEqual(1);
          const objId = b.results[0].objectId;
          request({
            method: 'DELETE',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
            },
            url: 'http://localhost:8378/1/sessions/' + objId,
          }).then(fail, response => {
            const b = response.data;
            expect(b.code).toEqual(209);
            expect(b.error).toBe('Invalid session token');
            done();
          });
        });
      });
  });

  it('password format matches hosted parse', done => {
    const hashed = '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie';
    passwordCrypto.compare('test', hashed).then(
      pass => {
        expect(pass).toBe(true);
        done();
      },
      () => {
        fail('Password format did not match.');
        done();
      }
    );
  });

  it('changing password clears sessions', done => {
    let sessionToken = null;

    Promise.resolve()
      .then(function () {
        return Parse.User.signUp('fosco', 'parse');
      })
      .then(function (newUser) {
        equal(Parse.User.current(), newUser);
        sessionToken = newUser.getSessionToken();
        ok(sessionToken);
        newUser.set('password', 'facebook');
        return newUser.save();
      })
      .then(function () {
        return Parse.User.become(sessionToken);
      })
      .then(
        function () {
          fail('Session should have been invalidated');
          done();
        },
        function (err) {
          expect(err.code).toBe(Parse.Error.INVALID_SESSION_TOKEN);
          expect(err.message).toBe('Invalid session token');
          done();
        }
      );
  });

  it('test parse user become', done => {
    let sessionToken = null;
    Promise.resolve()
      .then(function () {
        return Parse.User.signUp('flessard', 'folo', { foo: 1 });
      })
      .then(function (newUser) {
        equal(Parse.User.current(), newUser);
        sessionToken = newUser.getSessionToken();
        ok(sessionToken);
        newUser.set('foo', 2);
        return newUser.save();
      })
      .then(function () {
        return Parse.User.become(sessionToken);
      })
      .then(
        function (newUser) {
          equal(newUser.get('foo'), 2);
          done();
        },
        function () {
          fail('The session should still be valid');
          done();
        }
      );
  });

  it('ensure logout works', done => {
    let user = null;
    let sessionToken = null;

    Promise.resolve()
      .then(function () {
        return Parse.User.signUp('log', 'out');
      })
      .then(newUser => {
        user = newUser;
        sessionToken = user.getSessionToken();
        return Parse.User.logOut();
      })
      .then(() => {
        user.set('foo', 'bar');
        return user.save(null, { sessionToken: sessionToken });
      })
      .then(
        () => {
          fail('Save should have failed.');
          done();
        },
        e => {
          expect(e.code).toEqual(Parse.Error.INVALID_SESSION_TOKEN);
          done();
        }
      );
  });

  it('support user/password signup with empty authData block', done => {
    // The android SDK can send an empty authData object along with username and password.
    Parse.User.signUp('artof', 'thedeal', { authData: {} }).then(
      () => {
        done();
      },
      () => {
        fail('Signup should have succeeded.');
        done();
      }
    );
  });

  it('session expiresAt correct format', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    request({
      url: 'http://localhost:8378/1/classes/_Session',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }).then(response => {
      const body = response.data;
      expect(body.results[0].expiresAt.__type).toEqual('Date');
      done();
    });
  });

  it('Invalid session tokens are rejected', async done => {
    await Parse.User.signUp('asdf', 'zxcv');
    request({
      url: 'http://localhost:8378/1/classes/AClass',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Rest-API-Key': 'rest',
        'X-Parse-Session-Token': 'text',
      },
    }).then(fail, response => {
      const body = response.data;
      expect(body.code).toBe(209);
      expect(body.error).toBe('Invalid session token');
      done();
    });
  });

  it_exclude_dbs(['postgres'])(
    'should cleanup null authData keys (regression test for #935)',
    done => {
      const database = Config.get(Parse.applicationId).database;
      database
        .create(
          '_User',
          {
            username: 'user',
            _hashed_password: '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie',
            _auth_data_facebook: null,
          },
          {}
        )
        .then(() => {
          return request({
            url: 'http://localhost:8378/1/login?username=user&password=test',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-Master-Key': 'test',
            },
          }).then(res => res.data);
        })
        .then(user => {
          const authData = user.authData;
          expect(user.username).toEqual('user');
          expect(authData).toBeUndefined();
          done();
        })
        .catch(() => {
          fail('this should not fail');
          done();
        });
    }
  );

  it_exclude_dbs(['postgres'])('should not serve null authData keys', done => {
    const database = Config.get(Parse.applicationId).database;
    database
      .create(
        '_User',
        {
          username: 'user',
          _hashed_password: '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie',
          _auth_data_facebook: null,
        },
        {}
      )
      .then(() => {
        return new Parse.Query(Parse.User)
          .equalTo('username', 'user')
          .first({ useMasterKey: true });
      })
      .then(user => {
        const authData = user.get('authData');
        expect(user.get('username')).toEqual('user');
        expect(authData).toBeUndefined();
        done();
      })
      .catch(() => {
        fail('this should not fail');
        done();
      });
  });

  it('should cleanup null authData keys ParseUser update (regression test for #1198, #2252)', done => {
    Parse.Cloud.beforeSave('_User', req => {
      req.object.set('foo', 'bar');
    });

    let originalSessionToken;
    let originalUserId;
    // Simulate anonymous user save
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        authData: {
          anonymous: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    })
      .then(response => response.data)
      .then(user => {
        originalSessionToken = user.sessionToken;
        originalUserId = user.objectId;
        // Simulate registration
        return request({
          method: 'PUT',
          url: 'http://localhost:8378/1/classes/_User/' + user.objectId,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
          body: {
            authData: { anonymous: null },
            username: 'user',
            password: 'password',
          },
        }).then(response => {
          return response.data;
        });
      })
      .then(user => {
        expect(typeof user).toEqual('object');
        expect(user.authData).toBeUndefined();
        expect(user.sessionToken).not.toBeUndefined();
        // Session token should have changed
        expect(user.sessionToken).not.toEqual(originalSessionToken);
        // test that the sessionToken is valid
        return request({
          url: 'http://localhost:8378/1/users/me',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
        }).then(response => {
          const body = response.data;
          expect(body.username).toEqual('user');
          expect(body.objectId).toEqual(originalUserId);
          done();
        });
      })
      .catch(err => {
        fail('no request should fail: ' + JSON.stringify(err));
        done();
      });
  });

  it('should send email when upgrading from anon', async done => {
    await reconfigureServer();
    let emailCalled = false;
    let emailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        emailOptions = options;
        emailCalled = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    // Simulate anonymous user save
    return request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        authData: {
          anonymous: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    })
      .then(response => {
        const user = response.data;
        return request({
          method: 'PUT',
          url: 'http://localhost:8378/1/classes/_User/' + user.objectId,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
          body: {
            authData: { anonymous: null },
            username: 'user',
            email: 'user@email.com',
            password: 'password',
          },
        });
      })
      .then(() => {
        expect(emailCalled).toBe(true);
        expect(emailOptions).not.toBeUndefined();
        expect(emailOptions.user.get('email')).toEqual('user@email.com');
        done();
      })
      .catch(err => {
        jfail(err);
        fail('no request should fail: ' + JSON.stringify(err));
        done();
      });
  });

  it('should not send email when email is not a string', async done => {
    let emailCalled = false;
    let emailOptions;
    const emailAdapter = {
      sendVerificationEmail: options => {
        emailOptions = options;
        emailCalled = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    await reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    const user = new Parse.User();
    user.set('username', 'asdf@jkl.com');
    user.set('password', 'zxcv');
    user.set('email', 'asdf@jkl.com');
    await user.signUp();
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/requestPasswordReset',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Session-Token': user.sessionToken,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        email: { $regex: '^asd' },
      },
    })
      .then(res => {
        fail('no request should succeed: ' + JSON.stringify(res));
        done();
      })
      .catch(err => {
        expect(emailCalled).toBeTruthy();
        expect(emailOptions).toBeDefined();
        expect(err.status).toBe(400);
        expect(err.text).toMatch('{"code":125,"error":"you must provide a valid email string"}');
        done();
      });
  });

  it('should aftersave with full object', done => {
    let hit = 0;
    Parse.Cloud.afterSave('_User', (req, res) => {
      hit++;
      expect(req.object.get('username')).toEqual('User');
      res.success();
    });
    const user = new Parse.User();
    user.setUsername('User');
    user.setPassword('pass');
    user
      .signUp()
      .then(() => {
        user.set('hello', 'world');
        return user.save();
      })
      .then(() => {
        expect(hit).toBe(2);
        done();
      });
  });

  it('changes to a user should update the cache', done => {
    Parse.Cloud.define('testUpdatedUser', req => {
      expect(req.user.get('han')).toEqual('solo');
      return {};
    });
    const user = new Parse.User();
    user.setUsername('harrison');
    user.setPassword('ford');
    user
      .signUp()
      .then(() => {
        user.set('han', 'solo');
        return user.save();
      })
      .then(() => {
        return Parse.Cloud.run('testUpdatedUser');
      })
      .then(
        () => {
          done();
        },
        () => {
          fail('Should not have failed.');
          done();
        }
      );
  });

  it('should fail to become user with expired token', done => {
    let token;
    Parse.User.signUp('auser', 'somepass', null)
      .then(() =>
        request({
          method: 'GET',
          url: 'http://localhost:8378/1/classes/_Session',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
        })
      )
      .then(response => {
        const body = response.data;
        const id = body.results[0].objectId;
        const expiresAt = new Date(new Date().setYear(2015));
        token = body.results[0].sessionToken;
        return request({
          method: 'PUT',
          url: 'http://localhost:8378/1/classes/_Session/' + id,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
            'Content-Type': 'application/json',
          },
          body: {
            expiresAt: { __type: 'Date', iso: expiresAt.toISOString() },
          },
        });
      })
      .then(() => Parse.User.become(token))
      .then(
        () => {
          fail('Should not have succeded');
          done();
        },
        error => {
          expect(error.code).toEqual(209);
          expect(error.message).toEqual('Session token is expired.');
          done();
        }
      )
      .catch(done.fail);
  });

  it('should not create extraneous session tokens', done => {
    const config = Config.get(Parse.applicationId);
    config.database
      .loadSchema()
      .then(s => {
        // Lock down the _User class for creation
        return s.addClassIfNotExists('_User', {}, { create: {} });
      })
      .then(() => {
        const user = new Parse.User();
        return user.save({ username: 'user', password: 'pass' });
      })
      .then(
        () => {
          fail('should not be able to save the user');
        },
        () => {
          return Promise.resolve();
        }
      )
      .then(() => {
        const q = new Parse.Query('_Session');
        return q.find({ useMasterKey: true });
      })
      .then(
        res => {
          // We should have no session created
          expect(res.length).toBe(0);
          done();
        },
        () => {
          fail('should not fail');
          done();
        }
      );
  });

  it('should not overwrite username when unlinking facebook user (regression test for #1532)', async done => {
    Parse.Object.disableSingleInstance();
    const provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    let user = new Parse.User();
    user.set('username', 'testLinkWithProvider');
    user.set('password', 'mypass');
    await user.signUp();
    await user._linkWith('facebook');
    expect(user.get('username')).toEqual('testLinkWithProvider');
    expect(Parse.FacebookUtils.isLinked(user)).toBeTruthy();
    await user._unlinkFrom('facebook');
    user = await user.fetch();
    expect(user.get('username')).toEqual('testLinkWithProvider');
    expect(Parse.FacebookUtils.isLinked(user)).toBeFalsy();
    done();
  });

  it('should revoke sessions when converting anonymous user to "normal" user', done => {
    request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        authData: {
          anonymous: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    }).then(response => {
      const body = response.data;
      Parse.User.become(body.sessionToken).then(user => {
        const obj = new Parse.Object('TestObject');
        obj.setACL(new Parse.ACL(user));
        return obj
          .save()
          .then(() => {
            // Change password, revoking session
            user.set('username', 'no longer anonymous');
            user.set('password', 'password');
            return user.save();
          })
          .then(() => {
            // Session token should have been recycled
            expect(body.sessionToken).not.toEqual(user.getSessionToken());
          })
          .then(() => obj.fetch())
          .then(() => {
            done();
          })
          .catch(() => {
            fail('should not fail');
            done();
          });
      });
    });
  });

  it('should not revoke session tokens if the server is configures to not revoke session tokens', done => {
    reconfigureServer({ revokeSessionOnPasswordReset: false }).then(() => {
      request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/_User',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'Content-Type': 'application/json',
        },
        body: {
          authData: {
            anonymous: { id: '00000000-0000-0000-0000-000000000001' },
          },
        },
      }).then(response => {
        const body = response.data;
        Parse.User.become(body.sessionToken).then(user => {
          const obj = new Parse.Object('TestObject');
          obj.setACL(new Parse.ACL(user));
          return (
            obj
              .save()
              .then(() => {
                // Change password, revoking session
                user.set('username', 'no longer anonymous');
                user.set('password', 'password');
                return user.save();
              })
              .then(() => obj.fetch())
              // fetch should succeed as we still have our session token
              .then(done, fail)
          );
        });
      });
    });
  });

  it('should not fail querying non existing relations', done => {
    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
    });
    user
      .signUp()
      .then(() => {
        return Parse.User.current().relation('relation').query().find();
      })
      .then(res => {
        expect(res.length).toBe(0);
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('should not allow updates to emailVerified', done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };

    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
      email: 'test@email.com',
    });

    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return user.signUp();
      })
      .then(() => {
        return Parse.User.current().set('emailVerified', true).save();
      })
      .then(() => {
        fail('Should not be able to update emailVerified');
        done();
      })
      .catch(err => {
        expect(err.message).toBe("Clients aren't allowed to manually update email verification.");
        done();
      });
  });

  it('should not retrieve hidden fields on GET users/me (#3432)', done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };

    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
      email: 'test@email.com',
    });

    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return user.signUp();
      })
      .then(() =>
        request({
          method: 'GET',
          url: 'http://localhost:8378/1/users/me',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': Parse.User.current().getSessionToken(),
            'X-Parse-REST-API-Key': 'rest',
          },
        })
      )
      .then(response => {
        const res = response.data;
        expect(res.emailVerified).toBe(false);
        expect(res._email_verify_token).toBeUndefined();
        done();
      })
      .catch(done.fail);
  });

  it('should not retrieve hidden fields on GET users/id (#3432)', done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };

    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
      email: 'test@email.com',
    });

    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return user.signUp();
      })
      .then(() =>
        request({
          method: 'GET',
          url: 'http://localhost:8378/1/users/' + Parse.User.current().id,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        })
      )
      .then(response => {
        const res = response.data;
        expect(res.emailVerified).toBe(false);
        expect(res._email_verify_token).toBeUndefined();
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('should not retrieve hidden fields on login (#3432)', done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };

    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
      email: 'test@email.com',
    });

    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return user.signUp();
      })
      .then(() =>
        request({
          url: 'http://localhost:8378/1/login?email=test@email.com&username=hello&password=world',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        })
      )
      .then(response => {
        const res = response.data;
        expect(res.emailVerified).toBe(false);
        expect(res._email_verify_token).toBeUndefined();
        done();
      })
      .catch(err => {
        fail(JSON.stringify(err));
        done();
      });
  });

  it('should not allow updates to hidden fields', done => {
    const emailAdapter = {
      sendVerificationEmail: () => {},
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };

    const user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world',
      email: 'test@email.com',
    });

    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    })
      .then(() => {
        return user.signUp();
      })
      .then(() => {
        return Parse.User.current().set('_email_verify_token', 'bad').save();
      })
      .then(() => {
        fail('Should not be able to update email verification token');
        done();
      })
      .catch(err => {
        expect(err).toBeDefined();
        done();
      });
  });

  it('should revoke sessions when setting paswword with masterKey (#3289)', done => {
    let user;
    Parse.User.signUp('username', 'password')
      .then(newUser => {
        user = newUser;
        user.set('password', 'newPassword');
        return user.save(null, { useMasterKey: true });
      })
      .then(() => {
        const query = new Parse.Query('_Session');
        query.equalTo('user', user);
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(0);
        done();
      }, done.fail);
  });

  xit('should not send a verification email if the user signed up using oauth', done => {
    let emailCalledCount = 0;
    const emailAdapter = {
      sendVerificationEmail: () => {
        emailCalledCount++;
        return Promise.resolve();
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve(),
    };
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    const user = new Parse.User();
    user.set('email', 'email1@host.com');
    Parse.FacebookUtils.link(user, {
      id: '8675309',
      access_token: 'jenny',
      expiration_date: new Date().toJSON(),
    }).then(user => {
      user.set('email', 'email2@host.com');
      user.save().then(() => {
        expect(emailCalledCount).toBe(0);
        done();
      });
    });
  }).pend('this test fails.  See: https://github.com/parse-community/parse-server/issues/5097');

  it('should be able to update user with authData passed', done => {
    let objectId;
    let sessionToken;

    function validate(block) {
      return request({
        url: `http://localhost:8378/1/classes/_User/${objectId}`,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': sessionToken,
        },
      }).then(response => block(response.data));
    }

    request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
        'Content-Type': 'application/json',
      },
      body: {
        key: 'value',
        authData: { anonymous: { id: '00000000-0000-0000-0000-000000000001' } },
      },
    })
      .then(response => {
        const body = response.data;
        objectId = body.objectId;
        sessionToken = body.sessionToken;
        expect(sessionToken).toBeDefined();
        expect(objectId).toBeDefined();
        return validate(user => {
          // validate that keys are set on creation
          expect(user.key).toBe('value');
        });
      })
      .then(() => {
        // update the user
        const options = {
          method: 'PUT',
          url: `http://localhost:8378/1/classes/_User/${objectId}`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': sessionToken,
            'Content-Type': 'application/json',
          },
          body: {
            key: 'otherValue',
            authData: {
              anonymous: { id: '00000000-0000-0000-0000-000000000001' },
            },
          },
        };
        return request(options);
      })
      .then(() => {
        return validate(user => {
          // validate that keys are set on update
          expect(user.key).toBe('otherValue');
        });
      })
      .then(() => {
        done();
      })
      .then(done)
      .catch(done.fail);
  });

  it('can login with email', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          qs: { email: 'yo@lo.com', password: 'yolopass' },
        };
        return request(options);
      })
      .then(done)
      .catch(done.fail);
  });

  it('cannot login with email and invalid password', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          method: 'POST',
          url: `http://localhost:8378/1/login`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'Content-Type': 'application/json',
          },
          body: { email: 'yo@lo.com', password: 'yolopass2' },
        };
        return request(options);
      })
      .then(done.fail)
      .catch(() => done());
  });

  it('can login with email through query string', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?email=yo@lo.com&password=yolopass`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done)
      .catch(done.fail);
  });

  it('can login when both email and username are passed', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?email=yo@lo.com&username=yolo&password=yolopass`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done)
      .catch(done.fail);
  });

  it("fails to login when username doesn't match email", done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?email=yo@lo.com&username=yolo2&password=yolopass`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done.fail)
      .catch(err => {
        expect(err.data.error).toEqual('Invalid username/password.');
        done();
      });
  });

  it("fails to login when email doesn't match username", done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?email=yo@lo2.com&username=yolo&password=yolopass`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done.fail)
      .catch(err => {
        expect(err.data.error).toEqual('Invalid username/password.');
        done();
      });
  });

  it('fails to login when email and username are not provided', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?password=yolopass`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done.fail)
      .catch(err => {
        expect(err.data.error).toEqual('username/email is required.');
        done();
      });
  });

  it('allows login when providing email as username', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        return Parse.User.logIn('yo@lo.com', 'yolopass');
      })
      .then(user => {
        expect(user.get('username')).toBe('yolo');
      })
      .then(done)
      .catch(done.fail);
  });

  it('handles properly when 2 users share username / email pairs', done => {
    const user = new Parse.User({
      username: 'yo@loname.com',
      password: 'yolopass',
      email: 'yo@lo.com',
    });
    const user2 = new Parse.User({
      username: 'yo@lo.com',
      email: 'yo@loname.com',
      password: 'yolopass2', // different passwords
    });

    Parse.Object.saveAll([user, user2])
      .then(() => {
        return Parse.User.logIn('yo@loname.com', 'yolopass');
      })
      .then(user => {
        // the username takes precedence over the email,
        // so we get the user with username as passed in
        expect(user.get('username')).toBe('yo@loname.com');
      })
      .then(done)
      .catch(done.fail);
  });

  it('handles properly when 2 users share username / email pairs, counterpart', done => {
    const user = new Parse.User({
      username: 'yo@loname.com',
      password: 'yolopass',
      email: 'yo@lo.com',
    });
    const user2 = new Parse.User({
      username: 'yo@lo.com',
      email: 'yo@loname.com',
      password: 'yolopass2', // different passwords
    });

    Parse.Object.saveAll([user, user2])
      .then(() => {
        return Parse.User.logIn('yo@loname.com', 'yolopass2');
      })
      .then(done.fail)
      .catch(err => {
        expect(err.message).toEqual('Invalid username/password.');
        done();
      });
  });

  it('fails to login when password is not provided', done => {
    const user = new Parse.User();
    user
      .save({
        username: 'yolo',
        password: 'yolopass',
        email: 'yo@lo.com',
      })
      .then(() => {
        const options = {
          url: `http://localhost:8378/1/login?username=yolo`,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
        };
        return request(options);
      })
      .then(done.fail)
      .catch(err => {
        expect(err.data.error).toEqual('password is required.');
        done();
      });
  });

  it('does not duplicate session when logging in multiple times #3451', done => {
    const user = new Parse.User();
    user
      .signUp({
        username: 'yolo',
        password: 'yolo',
        email: 'yo@lo.com',
      })
      .then(() => {
        const token = user.getSessionToken();
        let promise = Promise.resolve();
        let count = 0;
        while (count < 5) {
          promise = promise.then(() => {
            return Parse.User.logIn('yolo', 'yolo').then(res => {
              // ensure a new session token is generated at each login
              expect(res.getSessionToken()).not.toBe(token);
            });
          });
          count++;
        }
        return promise;
      })
      .then(() => {
        // wait because session destruction is not synchronous
        return new Promise(resolve => {
          setTimeout(resolve, 100);
        });
      })
      .then(() => {
        const query = new Parse.Query('_Session');
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        // only one session in the end
        expect(results.length).toBe(1);
      })
      .then(done, done.fail);
  });

  it('should throw OBJECT_NOT_FOUND instead of SESSION_MISSING when using masterKey', async () => {
    await reconfigureServer();
    // create a fake user (just so we simulate an object not found)
    const non_existent_user = Parse.User.createWithoutData('fake_id');
    try {
      await non_existent_user.destroy({ useMasterKey: true });
      throw '';
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
    try {
      await non_existent_user.save({}, { useMasterKey: true });
      throw '';
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
    try {
      await non_existent_user.save();
      throw '';
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
    }
    try {
      await non_existent_user.destroy();
      throw '';
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SESSION_MISSING);
    }
  });

  describe('UsersRouter.handleLogIn', () => {
    it('should work with valid userFromJWT', async done => {
      const user = await Parse.User.signUp('some_user', 'some_password');

      const fakeReq = {
        userFromJWT: user,
        config: Config.get('test'),
        info: {},
      };

      const { response = {} } = await new UsersRouter.UsersRouter().handleLogIn(fakeReq);

      expect(user.id).toEqual(response.objectId);
      expect(response.sessionToken).toBeTruthy();
      done();
    });

    it('should fail with non-existing userFromJWT', async done => {
      const user = new Parse.User({
        username: 'not_a_real_user',
        id: '1234567',
      });

      const fakeReq = {
        userFromJWT: user,
        config: Config.get('test'),
        info: {},
      };

      try {
        await new UsersRouter.UsersRouter().handleLogIn(fakeReq);
        fail('User login should not have succeeded');
      } catch (error) {
        expect(error.code).toEqual(101);
      }
      done();
    });
  });

  describe('issue #4897', () => {
    it_only_db('mongo')('should be able to login with a legacy user (no ACL)', async () => {
      // This issue is a side effect of the locked users and legacy users which don't have ACL's
      // In this scenario, a legacy user wasn't be able to login as there's no ACL on it
      await reconfigureServer();
      const database = Config.get(Parse.applicationId).database;
      const collection = await database.adapter._adaptiveCollection('_User');
      await collection.insertOne({
        _id: 'ABCDEF1234',
        name: '<some_name>',
        email: '<some_email>',
        username: '<some_username>',
        _hashed_password: '<some_password>',
        _auth_data_facebook: {
          id: '8675309',
          access_token: 'jenny',
        },
        sessionToken: '<some_session_token>',
      });
      const provider = getMockFacebookProvider();
      Parse.User._registerAuthenticationProvider(provider);
      const model = await Parse.User._logInWith('facebook', {});
      expect(model.id).toBe('ABCDEF1234');
      ok(model instanceof Parse.User, 'Model should be a Parse.User');
      strictEqual(Parse.User.current(), model);
      ok(model.extended(), 'Should have used subclass.');
      strictEqual(provider.authData.id, provider.synchronizedUserId);
      strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
      strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
      ok(model._isLinked('facebook'), 'User should be linked to facebook');
    });
  });
});

describe('Security Advisory GHSA-8w3j-g983-8jh5', function () {
  it_only_db('mongo')(
    'should validate credentials first and check if account already linked afterwards ()',
    async done => {
      await reconfigureServer();
      // Add User to Database with authData
      const database = Config.get(Parse.applicationId).database;
      const collection = await database.adapter._adaptiveCollection('_User');
      await collection.insertOne({
        _id: 'ABCDEF1234',
        name: '<some_name>',
        email: '<some_email>',
        username: '<some_username>',
        _hashed_password: '<some_password>',
        _auth_data_custom: {
          id: 'linkedID', // Already linked userid
        },
        sessionToken: '<some_session_token>',
      });
      const provider = {
        getAuthType: () => 'custom',
        restoreAuthentication: () => true,
      }; // AuthProvider checks if password is 'password'
      Parse.User._registerAuthenticationProvider(provider);

      // Try to link second user with wrong password
      try {
        const user = await Parse.AnonymousUtils.logIn();
        await user._linkWith(provider.getAuthType(), {
          authData: { id: 'linkedID', password: 'wrong' },
        });
      } catch (error) {
        // This should throw Parse.Error.SESSION_MISSING and not Parse.Error.ACCOUNT_ALREADY_LINKED
        expect(error.code).toEqual(Parse.Error.SESSION_MISSING);
        done();
        return;
      }
      fail();
      done();
    }
  );
  it_only_db('mongo')('should ignore authData field', async () => {
    // Add User to Database with authData
    await reconfigureServer();
    const database = Config.get(Parse.applicationId).database;
    const collection = await database.adapter._adaptiveCollection('_User');
    await collection.insertOne({
      _id: '1234ABCDEF',
      name: '<some_name>',
      email: '<some_email>',
      username: '<some_username>',
      _hashed_password: '<some_password>',
      _auth_data_custom: {
        id: 'linkedID',
      },
      sessionToken: '<some_session_token>',
      authData: null, // should ignore
    });
    const provider = {
      getAuthType: () => 'custom',
      restoreAuthentication: () => true,
    };
    Parse.User._registerAuthenticationProvider(provider);
    const query = new Parse.Query(Parse.User);
    const user = await query.get('1234ABCDEF', { useMasterKey: true });
    expect(user.get('authData')).toEqual({ custom: { id: 'linkedID' } });
  });
});

describe('login as other user', () => {
  it('allows creating a session for another user with the master key', async done => {
    await Parse.User.signUp('some_user', 'some_password');
    const userId = Parse.User.current().id;
    await Parse.User.logOut();

    try {
      const response = await request({
        method: 'POST',
        url: 'http://localhost:8378/1/loginAs',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Master-Key': 'test',
        },
        body: {
          userId,
        },
      });

      expect(response.data.sessionToken).toBeDefined();
    } catch (err) {
      fail(`no request should fail: ${JSON.stringify(err)}`);
      done();
    }

    const sessionsQuery = new Parse.Query(Parse.Session);
    const sessionsAfterRequest = await sessionsQuery.find({ useMasterKey: true });
    expect(sessionsAfterRequest.length).toBe(1);

    done();
  });

  it('rejects creating a session for another user if the user does not exist', async done => {
    try {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/loginAs',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Master-Key': 'test',
        },
        body: {
          userId: 'bogus-user',
        },
      });

      fail('Request should fail without a valid user ID');
      done();
    } catch (err) {
      expect(err.data.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      expect(err.data.error).toBe('user not found');
    }

    const sessionsQuery = new Parse.Query(Parse.Session);
    const sessionsAfterRequest = await sessionsQuery.find({ useMasterKey: true });
    expect(sessionsAfterRequest.length).toBe(0);

    done();
  });

  it('rejects creating a session for another user with invalid parameters', async done => {
    const invalidUserIds = [undefined, null, ''];

    for (const invalidUserId of invalidUserIds) {
      try {
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/loginAs',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Master-Key': 'test',
          },
          body: {
            userId: invalidUserId,
          },
        });

        fail('Request should fail without a valid user ID');
        done();
      } catch (err) {
        expect(err.data.code).toBe(Parse.Error.INVALID_VALUE);
        expect(err.data.error).toBe('userId must not be empty, null, or undefined');
      }

      const sessionsQuery = new Parse.Query(Parse.Session);
      const sessionsAfterRequest = await sessionsQuery.find({ useMasterKey: true });
      expect(sessionsAfterRequest.length).toBe(0);
    }

    done();
  });

  it('rejects creating a session for another user without the master key', async done => {
    await Parse.User.signUp('some_user', 'some_password');
    const userId = Parse.User.current().id;
    await Parse.User.logOut();

    try {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/loginAs',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        body: {
          userId,
        },
      });

      fail('Request should fail without the master key');
      done();
    } catch (err) {
      expect(err.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
      expect(err.data.error).toBe('master key is required');
    }

    const sessionsQuery = new Parse.Query(Parse.Session);
    const sessionsAfterRequest = await sessionsQuery.find({ useMasterKey: true });
    expect(sessionsAfterRequest.length).toBe(0);

    done();
  });
});
