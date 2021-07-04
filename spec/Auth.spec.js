'use strict';

describe('Auth', () => {
  const { Auth, getAuthForSessionToken } = require('../lib/Auth.js');
  const Config = require('../lib/Config');
  describe('getUserRoles', () => {
    let auth;
    let config;
    let currentRoles = null;
    const currentUserId = 'userId';

    beforeEach(() => {
      currentRoles = ['role:userId'];

      config = {
        cacheController: {
          role: {
            get: () => Promise.resolve(currentRoles),
            set: jasmine.createSpy('set'),
          },
        },
      };
      spyOn(config.cacheController.role, 'get').and.callThrough();

      auth = new Auth({
        config: config,
        isMaster: false,
        user: {
          id: currentUserId,
        },
        installationId: 'installationId',
      });
    });

    it('should get user roles from the cache', done => {
      auth.getUserRoles().then(roles => {
        const firstSet = config.cacheController.role.set.calls.first();
        expect(firstSet).toEqual(undefined);

        const firstGet = config.cacheController.role.get.calls.first();
        expect(firstGet.args[0]).toEqual(currentUserId);
        expect(roles).toEqual(currentRoles);
        done();
      });
    });

    it('should only query the roles once', done => {
      const loadRolesSpy = spyOn(auth, '_loadRoles').and.callThrough();
      auth
        .getUserRoles()
        .then(roles => {
          expect(roles).toEqual(currentRoles);
          return auth.getUserRoles();
        })
        .then(() => auth.getUserRoles())
        .then(() => auth.getUserRoles())
        .then(roles => {
          // Should only call the cache adapter once.
          expect(config.cacheController.role.get.calls.count()).toEqual(1);
          expect(loadRolesSpy.calls.count()).toEqual(1);

          const firstGet = config.cacheController.role.get.calls.first();
          expect(firstGet.args[0]).toEqual(currentUserId);
          expect(roles).toEqual(currentRoles);
          done();
        });
    });

    it('should not have any roles with no user', done => {
      auth.user = null;
      auth
        .getUserRoles()
        .then(roles => expect(roles).toEqual([]))
        .then(() => done());
    });

    it('should not have any user roles with master', done => {
      auth.isMaster = true;
      auth
        .getUserRoles()
        .then(roles => expect(roles).toEqual([]))
        .then(() => done());
    });

    it('should properly handle bcrypt upgrade', done => {
      const bcryptOriginal = require('bcrypt-nodejs');
      const bcryptNew = require('bcryptjs');
      bcryptOriginal.hash('my1Long:password', null, null, function (err, res) {
        bcryptNew.compare('my1Long:password', res, function (err, res) {
          expect(res).toBeTruthy();
          done();
        });
      });
    });
  });

  it('should load auth without a config', async () => {
    const user = new Parse.User();
    await user.signUp({
      username: 'hello',
      password: 'password',
    });
    expect(user.getSessionToken()).not.toBeUndefined();
    const userAuth = await getAuthForSessionToken({
      sessionToken: user.getSessionToken(),
    });
    expect(userAuth.user instanceof Parse.User).toBe(true);
    expect(userAuth.user.id).toBe(user.id);
  });

  it('should load auth with a config', async () => {
    const user = new Parse.User();
    await user.signUp({
      username: 'hello',
      password: 'password',
    });
    expect(user.getSessionToken()).not.toBeUndefined();
    const userAuth = await getAuthForSessionToken({
      sessionToken: user.getSessionToken(),
      config: Config.get('test'),
    });
    expect(userAuth.user instanceof Parse.User).toBe(true);
    expect(userAuth.user.id).toBe(user.id);
  });

  it('should load auth without a config', async () => {
    const user = new Parse.User();
    await user.signUp({
      username: 'hello',
      password: 'password',
    });
    expect(user.getSessionToken()).not.toBeUndefined();
    const userAuth = await getAuthForSessionToken({
      sessionToken: user.getSessionToken(),
    });
    expect(userAuth.user instanceof Parse.User).toBe(true);
    expect(userAuth.user.id).toBe(user.id);
  });

  it('should load auth with a config', async () => {
    const user = new Parse.User();
    await user.signUp({
      username: 'hello',
      password: 'password',
    });
    expect(user.getSessionToken()).not.toBeUndefined();
    const userAuth = await getAuthForSessionToken({
      sessionToken: user.getSessionToken(),
      config: Config.get('test'),
    });
    expect(userAuth.user instanceof Parse.User).toBe(true);
    expect(userAuth.user.id).toBe(user.id);
  });

  describe('getRolesForUser', () => {
    const rolesNumber = 100;

    it('should load all roles without config', async () => {
      const user = new Parse.User();
      await user.signUp({
        username: 'hello',
        password: 'password',
      });
      expect(user.getSessionToken()).not.toBeUndefined();
      const userAuth = await getAuthForSessionToken({
        sessionToken: user.getSessionToken(),
      });
      const roles = [];
      for (let i = 0; i < rolesNumber; i++) {
        const acl = new Parse.ACL();
        const role = new Parse.Role('roleloadtest' + i, acl);
        role.getUsers().add([user]);
        roles.push(role);
      }
      const savedRoles = await Parse.Object.saveAll(roles);
      expect(savedRoles.length).toBe(rolesNumber);
      const cloudRoles = await userAuth.getRolesForUser();
      expect(cloudRoles.length).toBe(rolesNumber);
    });

    it('should load all roles with config', async () => {
      const user = new Parse.User();
      await user.signUp({
        username: 'hello',
        password: 'password',
      });
      expect(user.getSessionToken()).not.toBeUndefined();
      const userAuth = await getAuthForSessionToken({
        sessionToken: user.getSessionToken(),
        config: Config.get('test'),
      });
      const roles = [];
      for (let i = 0; i < rolesNumber; i++) {
        const acl = new Parse.ACL();
        const role = new Parse.Role('roleloadtest' + i, acl);
        role.getUsers().add([user]);
        roles.push(role);
      }
      const savedRoles = await Parse.Object.saveAll(roles);
      expect(savedRoles.length).toBe(rolesNumber);
      const cloudRoles = await userAuth.getRolesForUser();
      expect(cloudRoles.length).toBe(rolesNumber);
    });

    it('should load all roles for different users with config', async () => {
      const user = new Parse.User();
      await user.signUp({
        username: 'hello',
        password: 'password',
      });
      const user2 = new Parse.User();
      await user2.signUp({
        username: 'world',
        password: '1234',
      });
      expect(user.getSessionToken()).not.toBeUndefined();
      const userAuth = await getAuthForSessionToken({
        sessionToken: user.getSessionToken(),
        config: Config.get('test'),
      });
      const user2Auth = await getAuthForSessionToken({
        sessionToken: user2.getSessionToken(),
        config: Config.get('test'),
      });
      const roles = [];
      for (let i = 0; i < rolesNumber; i += 1) {
        const acl = new Parse.ACL();
        const acl2 = new Parse.ACL();
        const role = new Parse.Role('roleloadtest' + i, acl);
        const role2 = new Parse.Role('role2loadtest' + i, acl2);
        role.getUsers().add([user]);
        role2.getUsers().add([user2]);
        roles.push(role);
        roles.push(role2);
      }
      const savedRoles = await Parse.Object.saveAll(roles);
      expect(savedRoles.length).toBe(rolesNumber * 2);
      const cloudRoles = await userAuth.getRolesForUser();
      const cloudRoles2 = await user2Auth.getRolesForUser();
      expect(cloudRoles.length).toBe(rolesNumber);
      expect(cloudRoles2.length).toBe(rolesNumber);
    });
  });

  fit('succes to login when masterkey and instalationId is provided and when password is not provided', async () => {
    const user = new Parse.User();
    const savedUser = await user.save({
      username: 'yolo',
      password: 'yolopass',
      email: 'yo@lo.com',
    });
    const installationId = '123456789';
    const query = new Parse.Query(Parse.User);
    const result = await query.get(savedUser.id, {
      useMasterKey: true,
      installationId: installationId,
    });

    try {
      await result.logIn({ useMasterKey: true, installationId: installationId });
    } catch (error) {
      fail(error.message);
    }
  });

  fit('succes to get session token when masterkey and instalationId is provided', async () => {
    const user = new Parse.User();
    user.set('username', 'yolo');
    user.set('password', 'yolopass');
    user.set('email', 'yo@lo.com');
    const savedUser = await user.signUp();

    const installationId = '123456789';
    const querySession = new Parse.Query(Parse.Session);
    const session = await querySession.first();

    expect(session).not.toBeUndefined();

    const userQuery = new Parse.Query(Parse.User);
    const result = await userQuery.get(savedUser.id, {
      useMasterKey: true,
      installationId: installationId,
    });

    const userSession = result.getSessionToken();
    expect(userSession).toEqual(session);
  });
});
