const request = require('../lib/request');
const Config = require('../lib/Config');
const defaultColumns = require('../lib/Controllers/SchemaController').defaultColumns;
const authenticationLoader = require('../lib/Adapters/Auth');
const path = require('path');
const { sign } = require('jsonwebtoken');

const responses = {
  gpgames: { playerId: 'userId' },
  instagram: { id: 'userId' },
  janrainengage: { stat: 'ok', profile: { identifier: 'userId' } },
  janraincapture: { stat: 'ok', result: 'userId' },
  line: { userId: 'userId' },
  vkontakte: { response: [{ id: 'userId' }] },
  google: { sub: 'userId' },
  wechat: { errcode: 0 },
  weibo: { uid: 'userId' },
  qq: 'callback( {"openid":"userId"} );', // yes it's like that, run eval in the client :P
  phantauth: { sub: 'userId' },
  microsoft: { id: 'userId', mail: 'userMail' },
};

describe('AuthenticationProviders', function () {
  [
    'apple',
    'gcenter',
    'gpgames',
    'facebook',
    'github',
    'instagram',
    'google',
    'linkedin',
    'meetup',
    'twitter',
    'janrainengage',
    'janraincapture',
    'line',
    'vkontakte',
    'qq',
    'spotify',
    'wechat',
    'weibo',
    'phantauth',
    'microsoft',
    'keycloak',
  ].map(function (providerName) {
    it('Should validate structure of ' + providerName, done => {
      const provider = require('../lib/Adapters/Auth/' + providerName);
      jequal(typeof provider.validateAuthData, 'function');
      jequal(typeof provider.validateAppId, 'function');
      const validateAuthDataPromise = provider.validateAuthData({}, {});
      const validateAppIdPromise = provider.validateAppId('app', 'key', {});
      jequal(validateAuthDataPromise.constructor, Promise.prototype.constructor);
      jequal(validateAppIdPromise.constructor, Promise.prototype.constructor);
      validateAuthDataPromise.then(
        () => {},
        () => {}
      );
      validateAppIdPromise.then(
        () => {},
        () => {}
      );
      done();
    });

    it(`should provide the right responses for adapter ${providerName}`, async () => {
      const noResponse = ['twitter', 'apple', 'gcenter', 'google', 'keycloak'];
      if (noResponse.includes(providerName)) {
        return;
      }
      spyOn(require('../lib/Adapters/Auth/httpsRequest'), 'get').and.callFake(options => {
        if (
          options ===
            'https://oauth.vk.com/access_token?client_id=appId&client_secret=appSecret&v=5.123&grant_type=client_credentials' ||
          options ===
            'https://oauth.vk.com/access_token?client_id=appId&client_secret=appSecret&v=5.124&grant_type=client_credentials'
        ) {
          return {
            access_token: 'access_token',
          };
        }
        return Promise.resolve(responses[providerName] || { id: 'userId' });
      });
      spyOn(require('../lib/Adapters/Auth/httpsRequest'), 'request').and.callFake(() => {
        return Promise.resolve(responses[providerName] || { id: 'userId' });
      });
      const provider = require('../lib/Adapters/Auth/' + providerName);
      let params = {};
      if (providerName === 'vkontakte') {
        params = {
          appIds: 'appId',
          appSecret: 'appSecret',
        };
        await provider.validateAuthData({ id: 'userId' }, params);
        params.appVersion = '5.123';
      }
      await provider.validateAuthData({ id: 'userId' }, params);
    });
  });

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

  const createOAuthUser = function (callback) {
    return createOAuthUserWithSessionToken(undefined, callback);
  };

  const createOAuthUserWithSessionToken = function (token, callback) {
    const jsonBody = {
      authData: {
        myoauth: getMockMyOauthProvider().authData,
      },
    };

    const options = {
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Installation-Id': 'yolo',
        'X-Parse-Session-Token': token,
        'Content-Type': 'application/json',
      },
      url: 'http://localhost:8378/1/users',
      body: jsonBody,
    };
    return request(options)
      .then(response => {
        if (callback) {
          callback(null, response, response.data);
        }
        return {
          res: response,
          body: response.data,
        };
      })
      .catch(error => {
        if (callback) {
          callback(error);
        }
        throw error;
      });
  };

  it('should create user with REST API', done => {
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      const b = body;
      ok(b.sessionToken);
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      const sessionToken = b.sessionToken;
      const q = new Parse.Query('_Session');
      q.equalTo('sessionToken', sessionToken);
      q.first({ useMasterKey: true })
        .then(res => {
          if (!res) {
            fail('should not fail fetching the session');
            done();
            return;
          }
          expect(res.get('installationId')).toEqual('yolo');
          done();
        })
        .catch(() => {
          fail('should not fail fetching the session');
          done();
        });
    });
  });

  it('should only create a single user with REST API', done => {
    let objectId;
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      const b = body;
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      objectId = b.objectId;

      createOAuthUser((error, response, body) => {
        expect(error).toBe(null);
        const b = body;
        expect(b.objectId).not.toBeNull();
        expect(b.objectId).not.toBeUndefined();
        expect(b.objectId).toBe(objectId);
        done();
      });
    });
  });

  it("should fail to link if session token don't match user", done => {
    Parse.User.signUp('myUser', 'password')
      .then(user => {
        return createOAuthUserWithSessionToken(user.getSessionToken());
      })
      .then(() => {
        return Parse.User.logOut();
      })
      .then(() => {
        return Parse.User.signUp('myUser2', 'password');
      })
      .then(user => {
        return createOAuthUserWithSessionToken(user.getSessionToken());
      })
      .then(fail, ({ data }) => {
        expect(data.code).toBe(208);
        expect(data.error).toBe('this auth is already used');
        done();
      })
      .catch(done.fail);
  });

  it('unlink and link with custom provider', async () => {
    const provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    const model = await Parse.User._logInWith('myoauth');
    ok(model instanceof Parse.User, 'Model should be a Parse.User');
    strictEqual(Parse.User.current(), model);
    ok(model.extended(), 'Should have used the subclass.');
    strictEqual(provider.authData.id, provider.synchronizedUserId);
    strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
    strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');

    await model._unlinkFrom('myoauth');
    ok(!model._isLinked('myoauth'), 'User should not be linked to myoauth');
    ok(!provider.synchronizedUserId, 'User id should be cleared');
    ok(!provider.synchronizedAuthToken, 'Auth token should be cleared');
    ok(!provider.synchronizedExpiration, 'Expiration should be cleared');
    // make sure the auth data is properly deleted
    const config = Config.get(Parse.applicationId);
    const res = await config.database.adapter.find(
      '_User',
      {
        fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
      },
      { objectId: model.id },
      {}
    );
    expect(res.length).toBe(1);
    expect(res[0]._auth_data_myoauth).toBeUndefined();
    expect(res[0]._auth_data_myoauth).not.toBeNull();

    await model._linkWith('myoauth');

    ok(provider.synchronizedUserId, 'User id should have a value');
    ok(provider.synchronizedAuthToken, 'Auth token should have a value');
    ok(provider.synchronizedExpiration, 'Expiration should have a value');
    ok(model._isLinked('myoauth'), 'User should be linked to myoauth');
  });

  function validateValidator(validator) {
    expect(typeof validator).toBe('function');
  }

  function validateAuthenticationHandler(authenticationHandler) {
    expect(authenticationHandler).not.toBeUndefined();
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
  }

  function validateAuthenticationAdapter(authAdapter) {
    expect(authAdapter).not.toBeUndefined();
    if (!authAdapter) {
      return;
    }
    expect(typeof authAdapter.validateAuthData).toBe('function');
    expect(typeof authAdapter.validateAppId).toBe('function');
  }

  it('properly loads custom adapter', done => {
    const validAuthData = {
      id: 'hello',
      token: 'world',
    };
    const adapter = {
      validateAppId: function () {
        return Promise.resolve();
      },
      validateAuthData: function (authData) {
        if (authData.id == validAuthData.id && authData.token == validAuthData.token) {
          return Promise.resolve();
        }
        return Promise.reject();
      },
    };

    const authDataSpy = spyOn(adapter, 'validateAuthData').and.callThrough();
    const appIdSpy = spyOn(adapter, 'validateAppId').and.callThrough();

    const authenticationHandler = authenticationLoader({
      customAuthentication: adapter,
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator(validAuthData).then(
      () => {
        expect(authDataSpy).toHaveBeenCalled();
        // AppIds are not provided in the adapter, should not be called
        expect(appIdSpy).not.toHaveBeenCalled();
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads custom adapter module object', done => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: path.resolve('./spec/support/CustomAuth.js'),
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator({
      token: 'my-token',
    }).then(
      () => {
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads custom adapter module object (again)', done => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: {
        module: path.resolve('./spec/support/CustomAuthFunction.js'),
        options: { token: 'valid-token' },
      },
    });

    validateAuthenticationHandler(authenticationHandler);
    const { validator } = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator({
      token: 'valid-token',
    }).then(
      () => {
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('properly loads a default adapter with options', () => {
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret',
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.facebook);
  });

  it('should handle Facebook appSecret for validating appIds', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'a' });
    });
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      access_token: 'badtoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'facebook',
      options
    );
    await adapter.validateAppId(appIds, authData, providerOptions);
    expect(httpsRequest.get.calls.first().args[0].includes('appsecret_proof')).toBe(true);
  });

  it('should handle Facebook appSecret for validating auth data', async () => {
    const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve();
    });
    const options = {
      facebook: {
        appIds: ['a', 'b'],
        appSecret: 'secret_sauce',
      },
    };
    const authData = {
      id: 'test',
      access_token: 'test',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('facebook', options);
    await adapter.validateAuthData(authData, providerOptions);
    expect(httpsRequest.get.calls.first().args[0].includes('appsecret_proof')).toBe(true);
  });

  it('properly loads a custom adapter with options', () => {
    const options = {
      custom: {
        validateAppId: () => {},
        validateAuthData: () => {},
        appIds: ['a', 'b'],
      },
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'custom',
      options
    );
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.custom);
  });
});

describe('instagram auth adapter', () => {
  const instagram = require('../lib/Adapters/Auth/instagram');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('should use default api', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ data: { id: 'userId' } });
    });
    await instagram.validateAuthData({ id: 'userId', access_token: 'the_token' }, {});
    expect(httpsRequest.get).toHaveBeenCalledWith(
      'https://graph.instagram.com/me?fields=id&access_token=the_token'
    );
  });
  it('response object without data child', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'userId' });
    });
    await instagram.validateAuthData({ id: 'userId', access_token: 'the_token' }, {});
    expect(httpsRequest.get).toHaveBeenCalledWith(
      'https://graph.instagram.com/me?fields=id&access_token=the_token'
    );
  });
  it('should pass in api url', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ data: { id: 'userId' } });
    });
    await instagram.validateAuthData(
      {
        id: 'userId',
        access_token: 'the_token',
        apiURL: 'https://new-api.instagram.com/v1/',
      },
      {}
    );
    expect(httpsRequest.get).toHaveBeenCalledWith(
      'https://new-api.instagram.com/v1/me?fields=id&access_token=the_token'
    );
  });
});

describe('google auth adapter', () => {
  const google = require('../lib/Adapters/Auth/google');
  const jwt = require('jsonwebtoken');

  it('should throw error with missing id_token', async () => {
    try {
      await google.validateAuthData({}, {});
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await google.validateAuthData({ id: 'the_user_id', id_token: 'the_token' }, {});
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  // it('should throw error if public key used to encode token is not available', async () => {
  //   const fakeDecodedToken = { header: { kid: '789', alg: 'RS256' } };
  //   try {
  //     spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);

  //     await google.validateAuthData({ id: 'the_user_id', id_token: 'the_token' }, {});
  //     fail();
  //   } catch (e) {
  //     expect(e.message).toBe(
  //       `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
  //     );
  //   }
  // });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await google.validateAuthData(
      { id: 'the_user_id', id_token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.google.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'the_user_id', id_token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct provider - expected: accounts.google.com or https://accounts.google.com | from: https://not.google.com'
      );
    }
  });

  xit('(using client id as string) should throw error with invalid jwt client_id', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  xit('should throw error with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://accounts.google.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await google.validateAuthData(
        { id: 'invalid user', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('google play games service auth', () => {
  const gpgames = require('../lib/Adapters/Auth/gpgames');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('validateAuthData should pass validation', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ playerId: 'userId' });
    });
    await gpgames.validateAuthData({
      id: 'userId',
      access_token: 'access_token',
    });
  });

  it('validateAuthData should throw error', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ playerId: 'invalid' });
    });
    try {
      await gpgames.validateAuthData({
        id: 'userId',
        access_token: 'access_token',
      });
    } catch (e) {
      expect(e.message).toBe('Google Play Games Services - authData is invalid for this user.');
    }
  });
});

describe('keycloak auth adapter', () => {
  const keycloak = require('../lib/Adapters/Auth/keycloak');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('validateAuthData should fail without access token', async () => {
    const authData = {
      id: 'fakeid',
    };
    try {
      await keycloak.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing access token and/or User id');
    }
  });

  it('validateAuthData should fail without user id', async () => {
    const authData = {
      access_token: 'sometoken',
    };
    try {
      await keycloak.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing access token and/or User id');
    }
  });

  it('validateAuthData should fail without config', async () => {
    const options = {
      keycloak: {
        config: null,
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Missing keycloak configuration');
    }
  });

  it('validateAuthData should fail connect error', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.reject({
        text: JSON.stringify({ error: 'hosting_error' }),
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Could not connect to the authentication server');
    }
  });

  it('validateAuthData should fail with error description', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.reject({
        text: JSON.stringify({ error_description: 'custom error message' }),
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('custom error message');
    }
  });

  it('validateAuthData should fail with invalid auth', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({});
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should fail with invalid groups', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: ['role1'],
          groups: ['unknown'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should fail with invalid roles', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: 'unknown',
          groups: ['group1'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    try {
      await adapter.validateAuthData(authData, providerOptions);
      fail();
    } catch (e) {
      expect(e.message).toBe('Invalid authentication');
    }
  });

  it('validateAuthData should handle authentication', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({
        data: {
          sub: 'fakeid',
          roles: ['role1'],
          groups: ['group1'],
        },
      });
    });
    const options = {
      keycloak: {
        config: {
          'auth-server-url': 'http://example.com',
          realm: 'new',
        },
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
      roles: ['role1'],
      groups: ['group1'],
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter('keycloak', options);
    await adapter.validateAuthData(authData, providerOptions);
    expect(httpsRequest.get).toHaveBeenCalledWith({
      host: 'http://example.com',
      path: '/realms/new/protocol/openid-connect/userinfo',
      headers: {
        Authorization: 'Bearer sometoken',
      },
    });
  });
});

describe('oauth2 auth adapter', () => {
  const oauth2 = require('../lib/Adapters/Auth/oauth2');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('properly loads OAuth2 adapter via the "oauth2" option', () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
      },
    };
    const loadedAuthAdapter = authenticationLoader.loadAuthAdapter('oauth2Authentication', options);
    expect(loadedAuthAdapter.adapter).toEqual(oauth2);
  });

  it('properly loads OAuth2 adapter with options', () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
        authorizationHeader: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        debug: true,
      },
    };
    const loadedAuthAdapter = authenticationLoader.loadAuthAdapter('oauth2Authentication', options);
    const appIds = loadedAuthAdapter.appIds;
    const providerOptions = loadedAuthAdapter.providerOptions;
    expect(providerOptions.tokenIntrospectionEndpointUrl).toEqual('https://example.com/introspect');
    expect(providerOptions.useridField).toEqual('sub');
    expect(providerOptions.appidField).toEqual('appId');
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions.authorizationHeader).toEqual('Basic dXNlcm5hbWU6cGFzc3dvcmQ=');
    expect(providerOptions.debug).toEqual(true);
  });

  it('validateAppId should fail if OAuth2 tokenIntrospectionEndpointUrl is not configured properly', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        appIds: ['a', 'b'],
        appidField: 'appId',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 token introspection endpoint URL is missing from configuration!'
      );
    }
  });

  it('validateAppId appidField optional', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not reach here
      fail(e);
    }
  });

  it('validateAppId should fail without appIds', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'
      );
    }
  });

  it('validateAppId should fail empty appIds', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: [],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'
      );
    }
  });

  it('validateAppId invalid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({});
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe('OAuth2 access token is invalid for this user.');
    }
  });

  it('validateAppId invalid accessToken appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({ active: true });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        "OAuth2: the access_token's appID is empty or is not in the list of permitted appIDs in the auth configuration."
      );
    }
  });

  it('validateAppId valid accessToken appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: 'a',
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });

  it('validateAppId valid accessToken appId array', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: ['a'],
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });

  it('validateAppId valid accessToken invalid appId', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        appId: 'unknown',
      });
    });
    try {
      await adapter.validateAppId(appIds, authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        "OAuth2: the access_token's appID is empty or is not in the list of permitted appIDs in the auth configuration."
      );
    }
  });

  it('validateAuthData should fail if OAuth2 tokenIntrospectionEndpointUrl is not configured properly', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe(
        'OAuth2 token introspection endpoint URL is missing from configuration!'
      );
    }
  });

  it('validateAuthData invalid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
        authorizationHeader: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({});
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      expect(e.message).toBe('OAuth2 access token is invalid for this user.');
    }
    expect(httpsRequest.request).toHaveBeenCalledWith(
      {
        hostname: 'example.com',
        path: '/introspect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': 15,
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        },
      },
      'token=sometoken'
    );
  });

  it('validateAuthData valid accessToken', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        useridField: 'sub',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        sub: 'fakeid',
      });
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
    expect(httpsRequest.request).toHaveBeenCalledWith(
      {
        hostname: 'example.com',
        path: '/introspect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': 15,
        },
      },
      'token=sometoken'
    );
  });

  it('validateAuthData valid accessToken without useridField', async () => {
    const options = {
      oauth2Authentication: {
        oauth2: true,
        tokenIntrospectionEndpointUrl: 'https://example.com/introspect',
        appidField: 'appId',
        appIds: ['a', 'b'],
      },
    };
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter, providerOptions } = authenticationLoader.loadAuthAdapter(
      'oauth2Authentication',
      options
    );
    spyOn(httpsRequest, 'request').and.callFake(() => {
      return Promise.resolve({
        active: true,
        sub: 'fakeid',
      });
    });
    try {
      await adapter.validateAuthData(authData, providerOptions);
    } catch (e) {
      // Should not enter here
      fail(e);
    }
  });
});

describe('apple signin auth adapter', () => {
  const apple = require('../lib/Adapters/Auth/apple');
  const jwt = require('jsonwebtoken');
  const util = require('util');

  it('(using client id as string) should throw error with missing id_token', async () => {
    try {
      await apple.validateAuthData({}, { clientId: 'secret' });
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('(using client id as array) should throw error with missing id_token', async () => {
    try {
      await apple.validateAuthData({}, { clientId: ['secret'] });
      fail();
    } catch (e) {
      expect(e.message).toBe('id token is invalid for this user.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('should throw error if public key used to encode token is not available', async () => {
    const fakeDecodedToken = { header: { kid: '789', alg: 'RS256' } };
    try {
      spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);

      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
      );
    }
  });

  it('should use algorithm from key header to verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
    expect(jwt.verify.calls.first().args[2].algorithms).toEqual(fakeDecodedToken.header.alg);
  });

  it('should not verify invalid id_token', async () => {
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt malformed');
    }
  });

  it('(using client id as array) should not verify invalid id_token', async () => {
    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array with multiple items) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await apple.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret', 'secret 123'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as array) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT APPLE TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: ['INSERT CLIENT ID HERE'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.apple.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT APPLE TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://appleid.apple.com | from: https://not.apple.com'
      );
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as string) should throw error with invalid jwt clientId', async () => {
    try {
      await apple.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('(using client id as array) should throw error with invalid jwt clientId', async () => {
    try {
      await apple.validateAuthData(
        { id: 'INSERT ID HERE', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own apple signed tokens, perhaps with a parse apple account
  // and a private key
  xit('should throw error with invalid user id', async () => {
    try {
      await apple.validateAuthData(
        { id: 'invalid user', token: 'INSERT APPLE TOKEN HERE' },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });

  it('should throw error with with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://appleid.apple.com',
      aud: 'invalid_client_id',
      sub: 'a_different_user_id',
    };
    const fakeDecodedToken = { header: { kid: '123', alg: 'RS256' } };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return { kid: '123', rsaPublicKey: 'the_rsa_public_key' };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await apple.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('Apple Game Center Auth adapter', () => {
  const gcenter = require('../lib/Adapters/Auth/gcenter');

  it('validateAuthData should validate', async () => {
    // real token is used
    const authData = {
      id: 'G:1965586982',
      publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
      timestamp: 1565257031287,
      signature:
        'uqLBTr9Uex8zCpc1UQ1MIDMitb+HUat2Mah4Kw6AVLSGe0gGNJXlih2i5X+0ZwVY0S9zY2NHWi2gFjmhjt/4kxWGMkupqXX5H/qhE2m7hzox6lZJpH98ZEUbouWRfZX2ZhUlCkAX09oRNi7fI7mWL1/o88MaI/y6k6tLr14JTzmlxgdyhw+QRLxRPA6NuvUlRSJpyJ4aGtNH5/wHdKQWL8nUnFYiYmaY8R7IjzNxPfy8UJTUWmeZvMSgND4u8EjADPsz7ZtZyWAPi8kYcAb6M8k0jwLD3vrYCB8XXyO2RQb/FY2TM4zJuI7PzLlvvgOJXbbfVtHx7Evnm5NYoyzgzw==',
      salt: 'DzqqrQ==',
      bundleId: 'cloud.xtralife.gamecenterauth',
    };

    try {
      await gcenter.validateAuthData(authData);
    } catch (e) {
      fail();
    }
  });

  it('validateAuthData invalid signature id', async () => {
    const authData = {
      id: 'G:1965586982',
      publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-4.cer',
      timestamp: 1565257031287,
      signature: '1234',
      salt: 'DzqqrQ==',
      bundleId: 'cloud.xtralife.gamecenterauth',
    };

    try {
      await gcenter.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Apple Game Center - invalid signature');
    }
  });

  it('validateAuthData invalid public key url', async () => {
    const authData = {
      id: 'G:1965586982',
      publicKeyUrl: 'invalid.com',
      timestamp: 1565257031287,
      signature: '1234',
      salt: 'DzqqrQ==',
      bundleId: 'cloud.xtralife.gamecenterauth',
    };

    try {
      await gcenter.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('Apple Game Center - invalid publicKeyUrl: invalid.com');
    }
  });
});

describe('phant auth adapter', () => {
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('validateAuthData should throw for invalid auth', async () => {
    const authData = {
      id: 'fakeid',
      access_token: 'sometoken',
    };
    const { adapter } = authenticationLoader.loadAuthAdapter('phantauth', {});

    spyOn(httpsRequest, 'get').and.callFake(() => Promise.resolve({ sub: 'invalidID' }));
    try {
      await adapter.validateAuthData(authData);
      fail();
    } catch (e) {
      expect(e.message).toBe('PhantAuth auth is invalid for this user.');
    }
  });
});

describe('microsoft graph auth adapter', () => {
  const microsoft = require('../lib/Adapters/Auth/microsoft');
  const httpsRequest = require('../lib/Adapters/Auth/httpsRequest');

  it('should use access_token for validation is passed and responds with id and mail', async () => {
    spyOn(httpsRequest, 'get').and.callFake(() => {
      return Promise.resolve({ id: 'userId', mail: 'userMail' });
    });
    await microsoft.validateAuthData({
      id: 'userId',
      access_token: 'the_token',
    });
  });

  it('should fail to validate Microsoft Graph auth with bad token', done => {
    const authData = {
      id: 'fake-id',
      mail: 'fake@mail.com',
      access_token: 'very.long.bad.token',
    };
    microsoft.validateAuthData(authData).then(done.fail, err => {
      expect(err.code).toBe(101);
      expect(err.message).toBe('Microsoft Graph auth is invalid for this user.');
      done();
    });
  });
});

describe('facebook limited auth adapter', () => {
  const facebook = require('../lib/Adapters/Auth/facebook');
  const jwt = require('jsonwebtoken');
  const util = require('util');

  // TODO: figure out a way to run this test alongside facebook classic tests
  xit('(using client id as string) should throw error with missing id_token', async () => {
    try {
      await facebook.validateAuthData({}, { clientId: 'secret' });
      fail();
    } catch (e) {
      expect(e.message).toBe('Facebook auth is not configured.');
    }
  });

  // TODO: figure out a way to run this test alongside facebook classic tests
  xit('(using client id as array) should throw error with missing id_token', async () => {
    try {
      await facebook.validateAuthData({}, { clientId: ['secret'] });
      fail();
    } catch (e) {
      expect(e.message).toBe('Facebook auth is not configured.');
    }
  });

  it('should not decode invalid id_token', async () => {
    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('should throw error if public key used to encode token is not available', async () => {
    const fakeDecodedToken = {
      header: { kid: '789', alg: 'RS256' },
    };
    try {
      spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);

      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        `Unable to find matching key for Key ID: ${fakeDecodedToken.header.kid}`
      );
    }
  });

  it('should use algorithm from key header to verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
    expect(jwt.verify.calls.first().args[2].algorithms).toEqual(fakeDecodedToken.header.alg);
  });

  it('should not verify invalid id_token', async () => {
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt malformed');
    }
  });

  it('(using client id as array) should not verify invalid id_token', async () => {
    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('provided token does not decode as JWT');
    }
  });

  it('(using client id as string) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: 'secret' }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as array with multiple items) should verify id_token', async () => {
    const fakeClaim = {
      iss: 'https://facebook.com',
      aud: 'secret',
      exp: Date.now(),
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    const result = await facebook.validateAuthData(
      { id: 'the_user_id', token: 'the_token' },
      { clientId: ['secret', 'secret 123'] }
    );
    expect(result).toEqual(fakeClaim);
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://facebook.com | from: https://not.facebook.com'
      );
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as array) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: ['INSERT CLIENT ID HERE'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://facebook.com | from: https://not.facebook.com'
      );
    }
  });

  it('(using client id as string) should throw error with with invalid jwt issuer', async () => {
    const fakeClaim = {
      iss: 'https://not.facebook.com',
      sub: 'the_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE WITH INVALID JWT ISSUER',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe(
        'id token not issued by correct OpenID provider - expected: https://facebook.com | from: https://not.facebook.com'
      );
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as string) should throw error with invalid jwt clientId', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('(using client id as array) should throw error with invalid jwt clientId', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'INSERT ID HERE',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: ['secret'] }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('jwt audience invalid. expected: secret');
    }
  });

  // TODO: figure out a way to generate our own facebook signed tokens, perhaps with a parse facebook account
  // and a private key
  xit('should throw error with invalid user id', async () => {
    try {
      await facebook.validateAuthData(
        {
          id: 'invalid user',
          token: 'INSERT FACEBOOK TOKEN HERE',
        },
        { clientId: 'INSERT CLIENT ID HERE' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });

  it('should throw error with with invalid user id', async () => {
    const fakeClaim = {
      iss: 'https://facebook.com',
      aud: 'invalid_client_id',
      sub: 'a_different_user_id',
    };
    const fakeDecodedToken = {
      header: { kid: '123', alg: 'RS256' },
    };
    spyOn(jwt, 'decode').and.callFake(() => fakeDecodedToken);
    const fakeGetSigningKeyAsyncFunction = () => {
      return {
        kid: '123',
        rsaPublicKey: 'the_rsa_public_key',
      };
    };
    spyOn(util, 'promisify').and.callFake(() => fakeGetSigningKeyAsyncFunction);
    spyOn(jwt, 'verify').and.callFake(() => fakeClaim);

    try {
      await facebook.validateAuthData(
        { id: 'the_user_id', token: 'the_token' },
        { clientId: 'secret' }
      );
      fail();
    } catch (e) {
      expect(e.message).toBe('auth data is invalid for this user.');
    }
  });
});

describe('Auth Adapter features', () => {
  const baseAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
  };
  const baseAdapter2 = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    options: { anOption: true },
  };

  const doNotSaveAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve({ doNotSave: true }),
  };

  const additionalAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    policy: 'additional',
  };

  const soloAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    policy: 'solo',
  };

  const challengeAdapter = {
    validateAppId: () => Promise.resolve(),
    validateAuthData: () => Promise.resolve(),
    challenge: () => Promise.resolve({ token: 'test' }),
    options: {
      anOption: true,
    },
  };

  const modernAdapter = {
    validateAppId: () => Promise.resolve(),
    validateSetUp: () => Promise.resolve(),
    validateUpdate: () => Promise.resolve(),
    validateLogin: () => Promise.resolve(),
  };

  const wrongAdapter = {
    validateAppId: () => Promise.resolve(),
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };

  it('should ensure no duplicate auth data id after before save', async () => {
    await reconfigureServer({
      auth: { baseAdapter },
      cloud: () => {
        Parse.Cloud.beforeSave('_User', async request => {
          request.object.set('authData', { baseAdapter: { id: 'test' } });
        });
      },
    });

    const user = new Parse.User();
    await user.save({ authData: { baseAdapter: { id: 'another' } } });
    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({ baseAdapter: { id: 'test' } });

    const user2 = new Parse.User();
    try {
      await user2.save({ authData: { baseAdapter: { id: 'another' } } });
      fail();
    } catch (e) {
      expect(e.message).toContain('this auth is already used');
    }
  });

  it('should pass authData, options, req, user to validateAuthData', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({ auth: { baseAdapter } });

    const user = new Parse.User();

    const payload = { someData: true };

    await user.save({
      username: 'test',
      password: 'password',
      authData: { baseAdapter: payload },
    });

    expect(user.getSessionToken()).toBeDefined();

    const firstCall = baseAdapter.validateAuthData.calls.argsFor(0);
    expect(firstCall[0]).toEqual(payload);
    expect(firstCall[1]).toEqual(baseAdapter);
    expect(firstCall[2].config).toBeDefined();
    expect(firstCall[2].isChallenge).toBeUndefined();
    expect(firstCall[2].config.headers).toBeDefined();
    expect(firstCall[2].auth).toBeDefined();
    expect(firstCall[3]).toBeUndefined();

    // Use request sine JS SDK not ready
    await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'test',
        password: 'password',
        authData: { baseAdapter: payload },
      }),
    });
    const secondCall = baseAdapter.validateAuthData.calls.argsFor(1);
    expect(secondCall[0]).toEqual(payload);
    expect(secondCall[1]).toEqual(baseAdapter);
    expect(secondCall[2].config).toBeDefined();
    expect(secondCall[2].isChallenge).toBeUndefined();
    expect(secondCall[2].auth).toBeDefined();
    expect(secondCall[2].config.headers).toBeDefined();
    expect(secondCall[3] instanceof Parse.User).toBeTruthy();
    expect(secondCall[3].id).toEqual(user.id);
  });

  it('should trigger correctly validateSetUp', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter } });
    const user = new Parse.User();

    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    const call = modernAdapter.validateSetUp.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].config).toBeDefined();
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].auth).toBeDefined();
    expect(call[2].config.headers).toBeDefined();
    expect(call[3]).toBeUndefined();
    expect(user.getSessionToken()).toBeDefined();
  });
  it('should trigger correctly validateLogin', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter } });
    const user = new Parse.User();

    // Signup
    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    // Login
    const user2 = new Parse.User();
    await user2.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(1);
    const call = modernAdapter.validateLogin.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].config).toBeDefined();
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].auth).toBeDefined();
    expect(call[2].config.headers).toBeDefined();
    expect(call[3] instanceof Parse.User).toBeTruthy();
    expect(call[3].id).toEqual(user2.id);
    expect(call[3].id).toEqual(user.id);
    expect(user2.getSessionToken()).toBeDefined();
  });
  it('should trigger correctly validateUpdate', async () => {
    spyOn(modernAdapter, 'validateSetUp').and.resolveTo({});
    spyOn(modernAdapter, 'validateUpdate').and.resolveTo({});
    spyOn(modernAdapter, 'validateLogin').and.resolveTo({});

    await reconfigureServer({ auth: { modernAdapter } });
    const user = new Parse.User();

    // Signup
    await user.save({ authData: { modernAdapter: { id: 'modernAdapter' } } });
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);

    // Save same data
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter' } } },
      { sessionToken: user.getSessionToken() }
    );

    // Save same data with master key
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter' } } },
      { useMasterKey: true }
    );

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(0);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);

    // Change authData
    await user.save(
      { authData: { modernAdapter: { id: 'modernAdapter2' } } },
      { sessionToken: user.getSessionToken() }
    );

    expect(modernAdapter.validateUpdate).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateSetUp).toHaveBeenCalledTimes(1);
    expect(modernAdapter.validateLogin).toHaveBeenCalledTimes(0);
    const call = modernAdapter.validateUpdate.calls.argsFor(0);
    expect(call[0]).toEqual({ id: 'modernAdapter2' });
    expect(call[1]).toEqual(modernAdapter);
    expect(call[2].config).toBeDefined();
    expect(call[2].isChallenge).toBeUndefined();
    expect(call[2].auth).toBeDefined();
    expect(call[2].config.headers).toBeDefined();
    expect(call[3] instanceof Parse.User).toBeTruthy();
    expect(call[3].id).toEqual(user.id);
    expect(user.getSessionToken()).toBeDefined();
  });
  it('should throw if no triggers found', async () => {
    await reconfigureServer({ auth: { wrongAdapter } });
    const user = new Parse.User();
    try {
      await user.save({ authData: { wrongAdapter: { id: 'wrongAdapter' } } });
      fail('should throw');
    } catch (e) {
      expect(e.message).toContain(
        'Adapter not ready, need to implement validateAuthData or (validateSetUp, validateLogin, validateUpdate)'
      );
    }
  });
  it('should not update authData if provider return doNotSave', async () => {
    spyOn(doNotSaveAdapter, 'validateAuthData').and.resolveTo({ doNotSave: true });
    await reconfigureServer({
      auth: { doNotSaveAdapter, baseAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: { baseAdapter: { id: 'baseAdapter' }, doNotSaveAdapter: { token: true } },
    });

    await user.fetch({ useMasterKey: true });

    expect(user.get('authData')).toEqual({ baseAdapter: { id: 'baseAdapter' } });
  });
  it('should perform authData validation only when its required', async () => {
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({});
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({
      auth: { baseAdapter2, baseAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { token: true },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(1);

    const user2 = new Parse.User();
    await user2.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(1);

    const user3 = new Parse.User();
    await user3.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { token: true },
      },
    });

    expect(baseAdapter2.validateAuthData).toHaveBeenCalledTimes(2);
  });
  it('should require additional provider if configured', async () => {
    await reconfigureServer({
      auth: { baseAdapter, additionalAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        additionalAdapter: { token: true },
      },
    });

    const user2 = new Parse.User();
    try {
      await user2.save({
        authData: {
          baseAdapter: { id: 'baseAdapter' },
        },
      });
      fail('should require additional authData');
    } catch (e) {
      expect(e.message).toContain('Missing additional authData additionalAdapter');
      expect(user2.getSessionToken()).toBeUndefined();
    }

    await user2.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        additionalAdapter: { token: true },
      },
    });

    expect(user2.getSessionToken()).toBeDefined();
  });
  it('should skip additional provider if used provider is solo', async () => {
    await reconfigureServer({
      auth: { soloAdapter, additionalAdapter },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        soloAdapter: { id: 'soloAdapter' },
        additionalAdapter: { token: true },
      },
    });

    const user2 = new Parse.User();
    await user2.save({
      authData: {
        soloAdapter: { id: 'soloAdapter' },
      },
    });
    expect(user2.getSessionToken()).toBeDefined();
  });
  it('should return authData response and save some info on non username login', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
      response: { someData: true },
    });
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
      response: { someData2: true },
      save: { otherData: true },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });

    const user = new Parse.User();

    await user.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    expect(user.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const user2 = new Parse.User();
    user2.id = user.id;
    await user2.save(
      {
        authData: {
          baseAdapter: { id: 'baseAdapter' },
          baseAdapter2: { test: true },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    expect(user2.get('authDataResponse')).toEqual({ baseAdapter2: { someData2: true } });

    const user3 = new Parse.User();
    await user3.save({
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    // On logIn all authData are revalidated
    expect(user3.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const userViaMasterKey = new Parse.User();
    userViaMasterKey.id = user2.id;
    await userViaMasterKey.fetch({ useMasterKey: true });
    expect(userViaMasterKey.get('authData')).toEqual({
      baseAdapter: { id: 'baseAdapter' },
      baseAdapter2: { otherData: true },
    });
  });
  it('should return authData response and save some info on username login', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
      response: { someData: true },
    });
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
      response: { someData2: true },
      save: { otherData: true },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });

    const user = new Parse.User();

    await user.save({
      username: 'username',
      password: 'password',
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });

    expect(user.get('authDataResponse')).toEqual({
      baseAdapter: { someData: true },
      baseAdapter2: { someData2: true },
    });

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/login',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter' },
        },
      }),
    });
    const result = JSON.parse(res.text);
    expect(result.authDataResponse).toEqual({
      baseAdapter2: { someData2: true },
      baseAdapter: { someData: true },
    });

    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({
      baseAdapter: { id: 'baseAdapter' },
      baseAdapter2: { otherData: true },
    });
  });
  it('should allow update of authData', async () => {
    spyOn(baseAdapter, 'validateAuthData').and.resolveTo({
      response: { someData: true },
    });
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({
      response: { someData2: true },
      save: { otherData: true },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });
    await reconfigureServer({
      auth: { baseAdapter, baseAdapter2 },
    });

    const user = new Parse.User();

    await user.save({
      username: 'username',
      password: 'password',
      authData: {
        baseAdapter: { id: 'baseAdapter' },
        baseAdapter2: { test: true },
      },
    });
    expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);

    expect(user.id).toBeDefined();
    expect(user.getSessionToken()).toBeDefined();
    // Should not re validate the baseAdapter
    // when user is already logged in and authData not changed
    await user.save(
      {
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter' },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);

    // Should not re validate the baseAdapter
    // when master key used and authData are not changed
    await user.save(
      {
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter' },
        },
      },
      { useMasterKey: true }
    );

    expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(1);

    // Should allow user to change authData
    await user.save(
      {
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter2' },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(2);

    // Should allow master key to change authData
    await user.save(
      {
        authData: {
          baseAdapter2: { test: true },
          baseAdapter: { id: 'baseAdapter3' },
        },
      },
      { useMasterKey: true }
    );

    expect(baseAdapter.validateAuthData).toHaveBeenCalledTimes(3);

    await user.fetch({ useMasterKey: true });
    expect(user.get('authData')).toEqual({
      baseAdapter: { id: 'baseAdapter3' },
      baseAdapter2: { otherData: true },
    });
  });
  it('should pass user to auth adapter on update by matching session', async () => {
    spyOn(baseAdapter2, 'validateAuthData').and.resolveTo({});
    await reconfigureServer({ auth: { baseAdapter2 } });

    const user = new Parse.User();

    const payload = { someData: true };

    await user.save({
      username: 'test',
      password: 'password',
    });

    expect(user.getSessionToken()).toBeDefined();

    await user.save(
      { authData: { baseAdapter2: payload } },
      { sessionToken: user.getSessionToken() }
    );

    const firstCall = baseAdapter2.validateAuthData.calls.argsFor(0);
    expect(firstCall[0]).toEqual(payload);
    expect(firstCall[1]).toEqual(baseAdapter2);
    expect(firstCall[2].config).toBeDefined();
    expect(firstCall[2].isChallenge).toBeUndefined();
    expect(firstCall[2].auth).toBeDefined();
    expect(firstCall[2].config.headers).toBeDefined();
    expect(firstCall[3] instanceof Parse.User).toBeTruthy();
    expect(firstCall[3].id).toEqual(user.id);

    await user.save({ authData: { baseAdapter2: payload } }, { useMasterKey: true });

    const secondCall = baseAdapter2.validateAuthData.calls.argsFor(1);
    expect(secondCall[0]).toEqual(payload);
    expect(secondCall[1]).toEqual(baseAdapter2);
    expect(secondCall[2].config).toBeDefined();
    expect(secondCall[2].isChallenge).toBeUndefined();
    expect(secondCall[2].auth).toBeDefined();
    expect(secondCall[2].config.headers).toBeDefined();
    expect(secondCall[3] instanceof Parse.User).toBeTruthy();
    expect(secondCall[3].id).toEqual(user.id);
  });
  it('should return challenge with no logged user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter },
    });

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: {},
      });
      fail('should throw Nothing to challenge.');
    } catch (e) {
      expect(e.text).toContain('Nothing to challenge.');
    }

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: { challengeData: true },
      });
      fail('should throw challengeData should be an object.');
    } catch (e) {
      expect(e.text).toContain('challengeData should be an object.');
    }

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: { challengeData: { data: true }, authData: true },
      });
      fail('should throw authData should be an object.');
    } catch (e) {
      expect(e.text).toContain('authData should be an object.');
    }

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          challengeAdapter: { someData: true },
        },
      }),
    });

    expect(JSON.parse(res.text)).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });
    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toBeUndefined();
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].config).toBeDefined();
    expect(challengeCall[3].auth).toBeDefined();
    expect(challengeCall[3].config.headers).toBeDefined();
    expect(challengeCall[4]).toBeUndefined();
  });
  it('should return challenge with username created user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          username: 'username',
          challengeData: {
            challengeAdapter: { someData: true },
          },
        }),
      });
      fail('should throw You provided username or email, you need to also provide password.');
    } catch (e) {
      expect(e.text).toContain(
        'You provided username or email, you need to also provide password.'
      );
    }

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          username: 'username',
          password: 'password',
          authData: { data: true },
          challengeData: {
            challengeAdapter: { someData: true },
          },
        }),
      });
      fail(
        'should throw You cant provide username/email and authData, only use one identification method.'
      );
    } catch (e) {
      expect(e.text).toContain(
        'You cant provide username/email and authData, only use one identification method.'
      );
    }

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        username: 'username',
        password: 'password',
        challengeData: {
          challengeAdapter: { someData: true },
        },
      }),
    });

    expect(JSON.parse(res.text)).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });

    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toEqual(undefined);
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].config).toBeDefined();
    expect(challengeCall[3].auth).toBeDefined();
    expect(challengeCall[3].config.headers).toBeDefined();
    expect(challengeCall[4] instanceof Parse.User).toBeTruthy();
    expect(challengeCall[4].id).toEqual(user.id);
  });
  it('should return challenge with authData created user', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });
    spyOn(challengeAdapter, 'validateAuthData').and.callThrough();

    await reconfigureServer({
      auth: { challengeAdapter, soloAdapter },
    });

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      });
      fail();
    } catch (e) {
      expect(e.text).toContain('User not found.');
    }

    const user = new Parse.User();
    await user.save({ authData: { challengeAdapter: { id: 'challengeAdapter' } } });

    const user2 = new Parse.User();
    await user2.save({ authData: { soloAdapter: { id: 'soloAdapter' } } });

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
            soloAdapter: { id: 'soloAdapter' },
          },
        }),
      });
      fail();
    } catch (e) {
      expect(e.text).toContain('You cant provide more than one authData provider with an id.');
    }

    const res = await request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          challengeAdapter: { someData: true },
        },
        authData: {
          challengeAdapter: { id: 'challengeAdapter' },
        },
      }),
    });

    expect(JSON.parse(res.text)).toEqual({
      challengeData: {
        challengeAdapter: {
          token: 'test',
        },
      },
    });

    const validateCall = challengeAdapter.validateAuthData.calls.argsFor(1);
    expect(validateCall[2].isChallenge).toBeTruthy();

    const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
    expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
    expect(challengeCall[0]).toEqual({ someData: true });
    expect(challengeCall[1]).toEqual({ id: 'challengeAdapter' });
    expect(challengeCall[2]).toEqual(challengeAdapter);
    expect(challengeCall[3].config).toBeDefined();
    expect(challengeCall[3].auth).toBeDefined();
    expect(challengeCall[3].config.headers).toBeDefined();
    expect(challengeCall[4] instanceof Parse.User).toBeTruthy();
    expect(challengeCall[4].id).toEqual(user.id);
  });
  it('should validate provided authData and prevent guess id attack', async () => {
    spyOn(challengeAdapter, 'challenge').and.resolveTo({ token: 'test' });

    await reconfigureServer({
      auth: { challengeAdapter, soloAdapter },
    });

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      });
      fail();
    } catch (e) {
      expect(e.text).toContain('User not found.');
    }

    const user = new Parse.User();
    await user.save({ authData: { challengeAdapter: { id: 'challengeAdapter' } } });

    spyOn(challengeAdapter, 'validateAuthData').and.rejectWith({});

    try {
      await request({
        headers: headers,
        method: 'POST',
        url: 'http://localhost:8378/1/challenge',
        body: JSON.stringify({
          challengeData: {
            challengeAdapter: { someData: true },
          },
          authData: {
            challengeAdapter: { id: 'challengeAdapter' },
          },
        }),
      });
      fail();
    } catch (e) {
      expect(e.text).toContain('User not found.');
    }

    const validateCall = challengeAdapter.validateAuthData.calls.argsFor(0);
    expect(challengeAdapter.validateAuthData).toHaveBeenCalledTimes(1);
    expect(validateCall[0]).toEqual({ id: 'challengeAdapter' });
    expect(validateCall[1]).toEqual(challengeAdapter);
    expect(validateCall[2].config).toBeDefined();
    expect(validateCall[2].isChallenge).toBeTruthy();
    expect(validateCall[2].auth).toBeDefined();
    expect(validateCall[2].config.headers).toBeDefined();
    expect(validateCall[3] instanceof Parse.User).toBeTruthy();
    expect(validateCall[3].id).toEqual(user.id);
  });
});

describe('Webauthn', () => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-REST-API-Key': 'rest',
  };

  const clientAttestation = {
    id: 'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
    rawId: 'VHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUQ',
    response: {
      attestationObject:
        'o2NmbXRoZmlkby11MmZnYXR0U3RtdKJjc2lnWEcwRQIgRYUftNUmhT0VWTZmIgDmrOoP26Pcre-kL3DLnCrXbegCIQCOu_x5gqp-Rej76zeBuXlk8e7J-9WM_i-wZmCIbIgCGmN4NWOBWQLBMIICvTCCAaWgAwIBAgIEKudiYzANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZdWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwMDYzMTAgFw0xNDA4MDEwMDAwMDBaGA8yMDUwMDkwNDAwMDAwMFowbjELMAkGA1UEBhMCU0UxEjAQBgNVBAoMCVl1YmljbyBBQjEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEnMCUGA1UEAwweWXViaWNvIFUyRiBFRSBTZXJpYWwgNzE5ODA3MDc1MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKgOGXmBD2Z4R_xCqJVRXhL8Jr45rHjsyFykhb1USGozZENOZ3cdovf5Ke8fj2rxi5tJGn_VnW4_6iQzKdIaeP6NsMGowIgYJKwYBBAGCxAoCBBUxLjMuNi4xLjQuMS40MTQ4Mi4xLjEwEwYLKwYBBAGC5RwCAQEEBAMCBDAwIQYLKwYBBAGC5RwBAQQEEgQQbUS6m_bsLkm5MAyP6SDLczAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQByV9A83MPhFWmEkNb4DvlbUwcjc9nmRzJjKxHc3HeK7GvVkm0H4XucVDB4jeMvTke0WHb_jFUiApvpOHh5VyMx5ydwFoKKcRs5x0_WwSWL0eTZ5WbVcHkDR9pSNcA_D_5AsUKOBcbpF5nkdVRxaQHuuIuwV4k1iK2IqtMNcU8vL6w21U261xCcWwJ6sMq4zzVO8QCKCQhsoIaWrwz828GDmPzfAjFsJiLJXuYivdHACkeJ5KHMt0mjVLpfJ2BCML7_rgbmvwL7wBW80VHfNdcKmKjkLcpEiPzwcQQhiN_qHV90t-p4iyr5xRSpurlP5zic2hlRkLKxMH2_kRjhqSn4aGF1dGhEYXRhWMQ93EcQ6cCIsinbqJ1WMiC7Ofcimv9GWwplaxr7mor4oEEAAAAAAAAAAAAAAAAAAAAAAAAAAABAVHzbxaYaJu2P8m1Y2iHn2gRNHrgK0iYbn9E978L3Qi7Q-chFeicIHwYCRophz5lth2nCgEVKcgWirxlgidgbUaUBAgMmIAEhWCDIkcsOaVKDIQYwq3EDQ-pST2kRwNH_l1nCgW-WcFpNXiJYIBSbummp-KO3qZeqmvZ_U_uirCDL2RNj3E5y4_KzefIr',
      clientDataJSON:
        'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmRIUmxjM1JoZEdsdmJnIiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmNyZWF0ZSJ9',
    },
    clientExtensionResults: {},
    type: 'public-key',
  };
  const attestationOrigin = 'https://dev.dontneeda.pw';
  const attestationRpId = 'dev.dontneeda.pw';
  const attestationChallenge = 'dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBdHRlc3RhdGlvbg';

  const clientAssertion = {
    id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    rawId: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    response: {
      authenticatorData: 'PdxHEOnAiLIp26idVjIguzn3Ipr_RlsKZWsa-5qK-KABAAAAAA',
      clientDataJSON:
        'eyJjaGFsbGVuZ2UiOiJkRzkwWVd4c2VWVnVhWEYxWlZaaGJIVmxSWFpsY25sQmMzTmxjblJwYjI0IiwiY2xpZW50RXh0ZW5zaW9ucyI6e30sImhhc2hBbGdvcml0aG0iOiJTSEEtMjU2Iiwib3JpZ2luIjoiaHR0cHM6Ly9kZXYuZG9udG5lZWRhLnB3IiwidHlwZSI6IndlYmF1dGhuLmdldCJ9',
      signature:
        'MEQCIBu6M-DGzu1O8iocGHEj0UaAZm0HmxTeRIE6-nS3_CPjAiBDsmIzy5sacYwwzgpXqfwRt_2vl5yiQZ_OAqWJQBGVsQ',
    },
    type: 'public-key',
  };

  const assertionChallenge = 'dG90YWxseVVuaXF1ZVZhbHVlRXZlcnlBc3NlcnRpb24';
  const assertionOrigin = 'https://dev.dontneeda.pw';
  const assertionRpId = 'dev.dontneeda.pw';
  const assertionCredential = {
    publicKey:
      'pQECAyYgASFYIGmaxR4mBbukc2QhtW2ldhAAd555r-ljlGQN8MbcTnPPIlgg9CyUlE-0AB2fbzZbNgBvJuRa7r6o2jPphOmtyNPR_kY',
    id: 'wSisR0_4hlzw3Y1tj4uNwwifIhRa-ZxWJwWbnfror0pVK9qPdBPO5pW3gasPqn6wXHb0LNhXB_IrA1nFoSQJ9A',
    counter: 0,
  };

  // Generated from masterKey
  const jwtSecret = '7ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff';

  const callChallenge = async sessionToken => {
    const res = await request({
      headers: {
        ...headers,
        'X-Parse-Session-Token': sessionToken,
      },
      method: 'POST',
      url: 'http://localhost:8378/1/challenge',
      body: JSON.stringify({
        challengeData: {
          webauthn: true,
        },
      }),
    });
    const {
      challengeData: {
        webauthn: { signedChallenge, options },
      },
    } = JSON.parse(res.text);
    return { signedChallenge, options };
  };
  it('should throw if user not logged and try to register', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });

    const user = new Parse.User();
    try {
      await user.save({ authData: { webauthn: { id: 'webauthn' } } });
    } catch (e) {
      expect(e.message).toContain('Webauthn can only be configured on an already logged in user.');
    }
  });
  it('should register if user logged', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    const { signedChallenge, options } = await callChallenge(user.getSessionToken());

    expect(typeof signedChallenge).toEqual('string');
    const { challenge, ...otherOptions } = options;
    delete otherOptions.authenticatorSelection.residentKey;
    expect(typeof challenge).toEqual('string');
    expect(otherOptions).toEqual({
      rp: { name: 'Localhost', id: 'localhost' },
      user: { id: user.id, name: 'username', displayName: 'username' },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -8, type: 'public-key' },
        { alg: -36, type: 'public-key' },
        { alg: -37, type: 'public-key' },
        { alg: -38, type: 'public-key' },
        { alg: -39, type: 'public-key' },
        { alg: -257, type: 'public-key' },
        { alg: -258, type: 'public-key' },
        { alg: -259, type: 'public-key' },
      ],
      timeout: 60000,
      attestation: 'indirect',
      excludeCredentials: [],
      authenticatorSelection: { userVerification: 'required', requireResidentKey: false },
    });

    await reconfigureServer({
      auth: { webauthn: { options: { rpId: attestationRpId, origin: attestationOrigin } } },
    });

    try {
      await user.save(
        {
          authData: {
            webauthn: { attestation: clientAttestation, signedChallenge: 'test' },
          },
        },
        { sessionToken: user.getSessionToken() }
      );
    } catch (e) {
      expect(e.message).toContain('Invalid signedChallenge');
    }

    try {
      await user.save(
        {
          authData: {
            webauthn: {
              attestation: clientAttestation,
              signedChallenge: sign({ challenge: 'test' }, jwtSecret),
            },
          },
        },
        { sessionToken: user.getSessionToken() }
      );
    } catch (e) {
      expect(e.message).toContain('Invalid webauthn attestation');
    }

    await user.save(
      {
        authData: {
          webauthn: {
            attestation: clientAttestation,
            signedChallenge: sign({ challenge: attestationChallenge }, jwtSecret),
          },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientAttestation.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should register with master key and already created user', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    await reconfigureServer({
      auth: { webauthn: { options: { rpId: attestationRpId, origin: attestationOrigin } } },
    });

    await user.save(
      {
        authData: {
          webauthn: {
            attestation: clientAttestation,
            signedChallenge: sign({ challenge: attestationChallenge }, jwtSecret),
          },
        },
      },
      { useMasterKey: true }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientAttestation.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should update registered credential', async () => {
    const server = await reconfigureServer({
      auth: { webauthn: { options: { rpId: attestationRpId, origin: attestationOrigin } } },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });

    await server.config.databaseController.update(
      '_User',
      { objectId: user.id },
      { authData: { webauthn: { id: 'credId', publicKey: 'test', counter: 6 } } },
      {}
    );
    const fakedSignedChallenge = sign({ challenge: attestationChallenge }, jwtSecret);

    await user.save(
      {
        authData: {
          webauthn: { attestation: clientAttestation, signedChallenge: fakedSignedChallenge },
        },
      },
      { sessionToken: user.getSessionToken() }
    );

    await user.fetch({ useMasterKey: true });
    const webauthnAuthData = user.get('authData').webauthn;
    expect(webauthnAuthData).toBeDefined();
    expect(webauthnAuthData.id).toEqual(clientAttestation.id);
    expect(webauthnAuthData.counter).toEqual(0);
    expect(typeof webauthnAuthData.publicKey).toEqual('string');
  });
  it('should login', async () => {
    const server = await reconfigureServer({
      auth: { webauthn: { options: { rpId: assertionRpId, origin: assertionOrigin } } },
    });
    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password' });
    await server.config.databaseController.update(
      '_User',
      { objectId: user.id },
      { authData: { webauthn: assertionCredential } },
      {}
    );

    const { signedChallenge, options } = await callChallenge();
    expect(typeof signedChallenge).toEqual('string');
    expect(typeof options.challenge).toEqual('string');
    expect(options.timeout).toEqual(60000);

    const user2 = new Parse.User();

    try {
      await user2.save({
        authData: {
          webauthn: {
            id: assertionCredential.id,
            assertion: clientAssertion,
            signedChallenge: sign({ challenge: 'test' }, jwtSecret),
          },
        },
      });
    } catch (e) {
      expect(e.message).toContain('Invalid webauthn assertion');
    }
    await user2.save({
      authData: {
        webauthn: {
          id: assertionCredential.id,
          assertion: clientAssertion,
          signedChallenge: sign({ challenge: assertionChallenge }, jwtSecret),
        },
      },
    });

    expect(user2.getSessionToken()).toBeDefined();
    expect(user2.id).toEqual(user.id);
    await user2.fetch({ useMasterKey: true });
    const webauthnAuthData = user2.get('authData').webauthn;
    expect(webauthnAuthData.publicKey).toEqual(assertionCredential.publicKey);
    expect(webauthnAuthData.id).toEqual(assertionCredential.id);
    expect(webauthnAuthData.counter).toEqual(assertionCredential.counter);
  });
  it('should handle options rpId, rpName, origin, getUsername, getUserDisplayName, attestationType, requireResidentKey', async () => {
    await reconfigureServer({
      auth: { webauthn: true },
    });

    const user = new Parse.User();
    await user.save({ username: 'username', password: 'password', email: 'test@test.test' });

    let options = (await callChallenge(user.getSessionToken())).options;

    expect(options.rp).toEqual({ name: 'Localhost', id: 'localhost' });
    expect(options.user).toEqual({ id: user.id, name: 'username', displayName: 'test@test.test' });

    await reconfigureServer({
      publicServerURL: 'https://subdomain.a-super-app.com/parse',
      auth: {
        webauthn: {
          options: {
            getUserDisplayName: user => {
              return user.get('username').toUpperCase();
            },
          },
        },
      },
    });

    options = (await callChallenge(user.getSessionToken())).options;

    expect(options.rp).toEqual({ name: 'A Super App', id: 'a-super-app.com' });
    expect(options.user).toEqual({ id: user.id, name: 'username', displayName: 'USERNAME' });

    await reconfigureServer({
      publicServerURL: 'https://subdomain.a-super-app.com/parse',
      auth: {
        webauthn: {
          options: {
            rpId: 'my.app.com',
            rpName: 'App',
            origin: 'app.com',
            attestationType: 'direct',
            residentKey: 'required',
            getUserDisplayName: user => user.get('username').toUpperCase(),
            getUsername: user => user.get('username') + user.id,
          },
        },
      },
    });

    options = (await callChallenge(user.getSessionToken())).options;
    expect(options.rp).toEqual({ name: 'App', id: 'my.app.com' });
    expect(options.authenticatorSelection.requireResidentKey).toBeTruthy();
    expect(options.attestation).toEqual('direct');
    expect(options.user).toEqual({
      id: user.id,
      name: 'username' + user.id,
      displayName: 'USERNAME',
    });
  });
});
