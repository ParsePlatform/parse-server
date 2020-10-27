// These methods handle the User-related routes.

import Parse from 'parse/node';
import Config from '../Config';
import AccountLockout from '../AccountLockout';
import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import Auth from '../Auth';
import passwordCrypto from '../password';
import { maybeRunTrigger, Types as TriggerTypes } from '../triggers';
import { promiseEnsureIdempotency } from '../middlewares';
import { authenticator } from 'otplib';
const crypto = require('crypto');

export class UsersRouter extends ClassesRouter {
  className() {
    return '_User';
  }

  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */
  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }

  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */
  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;
      if (
        (!payload.username && req.query && req.query.username) ||
        (!payload.email && req.query && req.query.email)
      ) {
        payload = req.query;
      }
      const { username, email, password, token } = payload;

      // TODO: use the right error codes / descriptions.
      if (!username && !email) {
        throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'username/email is required.');
      }
      if (!password) {
        throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required.');
      }
      if (
        typeof password !== 'string' ||
        (email && typeof email !== 'string') ||
        (username && typeof username !== 'string')
      ) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }

      let user;
      let isValidPassword = false;
      let query;
      if (email && username) {
        query = { email, username };
      } else if (email) {
        query = { email };
      } else {
        query = { $or: [{ username }, { email: username }] };
      }
      return req.config.database
        .find('_User', query)
        .then(results => {
          if (!results.length) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
          }

          if (results.length > 1) {
            // corner case where user1 has username == user2 email
            req.config.loggerController.warn(
              "There is a user which email is the same as another user's username, logging in based on username"
            );
            user = results.filter(user => user.username === username)[0];
          } else {
            user = results[0];
          }

          return passwordCrypto.compare(password, user.password);
        })
        .then(correct => {
          isValidPassword = correct;
          const accountLockoutPolicy = new AccountLockout(user, req.config);
          return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
        })
        .then(async () => {
          if (!isValidPassword) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
          }
          // Ensure the user isn't locked out
          // A locked out user won't be able to login
          // To lock a user out, just set the ACL to `masterKey` only  ({}).
          // Empty ACL is OK
          if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
          }
          if (
            req.config.verifyUserEmails &&
            req.config.preventLoginWithUnverifiedEmail &&
            !user.emailVerified
          ) {
            throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
          }

          delete user.password;

          // Sometimes the authData still has null on that keys
          // https://github.com/parse-community/parse-server/issues/935
          if (user.authData) {
            Object.keys(user.authData).forEach(provider => {
              if (user.authData[provider] === null) {
                delete user.authData[provider];
              }
            });
            if (Object.keys(user.authData).length == 0) {
              delete user.authData;
            }
          }
          const mfaenabled = req.config.multiFactorAuth || {};
          if (mfaenabled.enabled && user._mfa) {
            if (!token) {
              throw new Parse.Error(211, 'Please provide your MFA token.');
            }
            const mfaToken = await this.decryptMFAKey(
              user._mfa,
              req.config.multiFactorAuth.encryptionKey
            );
            if (req.config.multiFactorAuth && !authenticator.verify({ token, secret: mfaToken })) {
              throw new Parse.Error(212, 'Invalid MFA token');
            }
          }
          delete user._mfa;
          return resolve(user);
        })
        .catch(error => {
          return reject(error);
        });
    });
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }
    const sessionToken = req.info.sessionToken;
    return rest
      .find(
        req.config,
        Auth.master(req.config),
        '_Session',
        { sessionToken },
        { include: 'user' },
        req.info.clientSDK,
        req.info.context
      )
      .then(response => {
        if (!response.results || response.results.length == 0 || !response.results[0].user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
        } else {
          const user = response.results[0].user;
          // Send token back on the login, because SDKs expect that.
          user.sessionToken = sessionToken;

          // Remove hidden properties.
          UsersRouter.removeHiddenProperties(user);

          return { response: user };
        }
      });
  }

  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);

    // handle password expiry policy
    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;

      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update(
          '_User',
          { username: user.username },
          { _password_changed_at: Parse._encode(changedAt) }
        );
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        }
        // Calculate the expiry time.
        const expiresAt = new Date(
          changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge
        );
        if (expiresAt < new Date())
          // fail of current time is past password expiry time
          throw new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            'Your password has expired. Please reset your password.'
          );
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);

    req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await maybeRunTrigger(
      TriggerTypes.beforeLogin,
      req.auth,
      Parse.User.fromJSON(Object.assign({ className: '_User' }, user)),
      null,
      req.config
    );

    const { sessionData, createSession } = Auth.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password',
      },
      installationId: req.info.installationId,
    });

    user.sessionToken = sessionData.sessionToken;

    await createSession();

    const afterLoginUser = Parse.User.fromJSON(Object.assign({ className: '_User' }, user));
    maybeRunTrigger(
      TriggerTypes.afterLogin,
      { ...req.auth, user: afterLoginUser },
      afterLoginUser,
      null,
      req.config
    );

    return { response: user };
  }

  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req)
      .then(user => {
        // Remove hidden properties.
        UsersRouter.removeHiddenProperties(user);

        return { response: user };
      })
      .catch(error => {
        throw error;
      });
  }

  handleLogOut(req) {
    const success = { response: {} };
    if (req.info && req.info.sessionToken) {
      return rest
        .find(
          req.config,
          Auth.master(req.config),
          '_Session',
          { sessionToken: req.info.sessionToken },
          undefined,
          req.info.clientSDK,
          req.info.context
        )
        .then(records => {
          if (records.results && records.results.length) {
            return rest
              .del(
                req.config,
                Auth.master(req.config),
                '_Session',
                records.results[0].objectId,
                req.info.context
              )
              .then(() => {
                this._runAfterLogoutTrigger(req, records.results[0]);
                return Promise.resolve(success);
              });
          }
          return Promise.resolve(success);
        });
    }
    return Promise.resolve(success);
  }
  encryptMFAKey(mfa, encryptionKey) {
    try {
      if (!encryptionKey) {
        return mfa;
      }
      const algorithm = 'aes-256-gcm';
      const encryption = crypto
        .createHash('sha256')
        .update(String(encryptionKey))
        .digest('base64')
        .substr(0, 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, encryption, iv);

      const encryptedResult = Buffer.concat([
        cipher.update(mfa),
        cipher.final(),
        iv,
        cipher.getAuthTag(),
      ]);
      return encryptedResult.toString('base64');
    } catch (e) {
      throw new Parse.Error(212, 'Invalid MFA token');
    }
  }
  async decryptMFAKey(mfa, encryptionKey) {
    try {
      if (encryptionKey == null) {
        return mfa;
      }
      const algorithm = 'aes-256-gcm';
      const encryption = crypto
        .createHash('sha256')
        .update(String(encryptionKey))
        .digest('base64')
        .substr(0, 32);
      const data = Buffer.from(mfa, 'base64');
      const authTagLocation = data.length - 16;
      const ivLocation = data.length - 32;
      const authTag = data.slice(authTagLocation);
      const iv = data.slice(ivLocation, authTagLocation);
      const encrypted = data.slice(0, ivLocation);
      const decipher = crypto.createDecipheriv(algorithm, encryption, iv);
      decipher.setAuthTag(authTag);
      return await new Promise((resolve, reject) => {
        let decrypted = '';
        decipher.on('readable', chunk => {
          while (null !== (chunk = decipher.read())) {
            decrypted += chunk.toString('utf8');
          }
        });
        decipher.on('end', () => {
          resolve(decrypted);
        });
        decipher.on('error', e => {
          reject(e);
        });
        decipher.write(encrypted);
        decipher.end();
      });
    } catch (err) {
      throw new Parse.Error(212, 'Invalid MFA token');
    }
  }
  async enableMFA(req) {
    const mfaenabled = req.config.multiFactorAuth || {};
    if (!mfaenabled.enabled) {
      throw new Parse.Error(210, 'MFA is not enabled.');
    }
    if (!req.auth) {
      throw new Parse.Error(101, 'Unauthorized');
    }
    const [user] = await req.config.database.find('_User', {
      objectId: req.auth.user.id,
    });
    if (!user) {
      throw new Parse.Error(101, 'Unauthorized');
    }
    if (user._mfa) {
      throw new Parse.Error(214, 'MFA is already enabled on this account.');
    }
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.username, req.config.appName, secret);
    const storeKey = this.encryptMFAKey(
      `pending:${secret}`,
      req.config.multiFactorAuth.encryptionKey
    );
    await req.config.database.update('_User', { objectId: user.objectId }, { _mfa: storeKey });
    return { response: { qrcodeURL: otpauth, secret } };
  }

  async verifyMFA(req) {
    const mfaenabled = req.config.multiFactorAuth || {};
    if (!mfaenabled.enabled) {
      throw new Parse.Error(210, 'MFA is not enabled.');
    }
    if (!req.auth.user) {
      throw new Parse.Error(101, 'Unauthorized');
    }
    const { token } = req.body;
    if (!token) {
      throw new Parse.Error(211, 'Please provide a token.');
    }
    // Fetch the user directly from the DB as we need the _mfa
    const [user] = await req.config.database.find('_User', {
      objectId: req.auth.user.id,
    });
    if (!user._mfa) {
      throw new Parse.Error(
        213,
        'MFA is not enabled on this account. Please enable MFA before calling this function.'
      );
    }
    const mfa = await this.decryptMFAKey(user._mfa, req.config.multiFactorAuth.encryptionKey);
    if (mfa.indexOf('pending:') !== 0) {
      throw new Parse.Error(214, 'MFA is already active');
    }
    const secret = mfa.slice('pending:'.length);
    const result = authenticator.verify({ token, secret });
    if (!result) {
      throw new Parse.Error(212, 'Invalid token');
    }
    const storeKey = this.encryptMFAKey(`${secret}`, req.config.multiFactorAuth.encryptionKey);
    await req.config.database.update(
      '_User',
      { username: user.username },
      { _mfa: storeKey, MFAEnabled: true }
    );
    return { response: {} };
  }

  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    maybeRunTrigger(
      TriggerTypes.afterLogout,
      req.auth,
      Parse.Session.fromJSON(Object.assign({ className: '_Session' }, session)),
      null,
      req.config
    );
  }

  _throwOnBadEmailConfig(req) {
    try {
      Config.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.'
        );
      } else {
        throw e;
      }
    }
  }

  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);

    const { email } = req.body;
    if (!email) {
      throw new Parse.Error(Parse.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new Parse.Error(
        Parse.Error.INVALID_EMAIL_ADDRESS,
        'you must provide a valid email string'
      );
    }
    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(
      () => {
        return Promise.resolve({
          response: {},
        });
      },
      err => {
        if (err.code === Parse.Error.OBJECT_NOT_FOUND) {
          // Return success so that this endpoint can't
          // be used to enumerate valid emails
          return Promise.resolve({
            response: {},
          });
        } else {
          throw err;
        }
      }
    );
  }

  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);

    const { email } = req.body;
    if (!email) {
      throw new Parse.Error(Parse.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new Parse.Error(
        Parse.Error.INVALID_EMAIL_ADDRESS,
        'you must provide a valid email string'
      );
    }

    return req.config.database.find('_User', { email: email }).then(results => {
      if (!results.length || results.length < 1) {
        throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }
      const user = results[0];

      // remove password field, messes with saving on postgres
      delete user.password;

      if (user.emailVerified) {
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return { response: {} };
      });
    });
  }

  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('GET', '/users/me/enableMFA', req => this.enableMFA(req));
    this.route('POST', '/users/me/verifyMFA', req => this.verifyMFA(req));
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
  }
}

export default UsersRouter;
