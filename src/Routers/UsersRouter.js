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
import RestWrite from '../RestWrite';
import { logger } from '../../lib/Adapters/Logger/WinstonLogger';

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
      const { username, email, password } = payload;

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
        .then(() => {
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
    const authData = req.body && req.body.authData;
    // Check if user has provided his required auth providers
    Auth.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);

    let authDataResponse;
    let validatedAuthData;
    if (authData) {
      const res = await Auth.handleAuthDataValidation(authData, req, user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    }

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

    // If we have some new validated authData
    // update directly
    if (validatedAuthData && Object.keys(validatedAuthData).length) {
      await req.config.database.update(
        '_User',
        { objectId: user.objectId },
        { authData: validatedAuthData },
        {}
      );
    }

    const { sessionData, createSession } = RestWrite.createSession(req.config, {
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

    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }

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
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid,
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

  async handleChallenge(req) {
    const { username, email, password, authData, challengeData } = req.body;

    // if username or email provided with password try to find the user with default
    // system
    let user;
    if (username || email) {
      if (!password)
        throw new Parse.Error(
          Parse.Error.OTHER_CAUSE,
          'You provided username or email, you need to also provide password.'
        );
      user = await this._authenticateUserFromRequest(req);
    }

    if (!challengeData) throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Nothing to challenge.');

    if (typeof challengeData !== 'object')
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'challengeData should be an object.');

    // Try to find user by authData
    if (authData) {
      if (typeof authData !== 'object')
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'authData should be an object.');
      // To avoid security issue we should only support one identifying method
      if (user)
        throw new Parse.Error(
          Parse.Error.OTHER_CAUSE,
          'You cant provide username/email and authData, only use one identification method.'
        );

      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new Parse.Error(
          Parse.Error.OTHER_CAUSE,
          'You cant provide more than one authData provider with an id.'
        );
      }

      const results = await Auth.findUsersWithAuthData(req.config, authData);

      try {
        if (!results[0] || results.length > 1)
          throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'User not found.');

        // Find the provider used to find the user
        const provider = Object.keys(authData).find(key => authData[key].id);

        // Validate authData used to identify the user
        // to avoid guess id attack
        const { validator } = req.config.authDataManager.getValidatorForProvider(provider);
        await validator(
          authData[provider],
          { config: req.config, auth: req.auth, isChallenge: true },
          Parse.User.fromJSON({ className: '_User', ...results[0] })
        );
        user = results[0];
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        logger.error(e);
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'User not found.');
      }
    }

    // Execute challenge step by step
    // with consistent order
    const challenge = await Auth.reducePromise(
      Object.keys(challengeData).sort(),
      async (acc, provider) => {
        const challengeHandler = req.config.authDataManager.getValidatorForProvider(provider)
          .adapter.challenge;
        if (typeof challengeHandler === 'function') {
          acc[provider] =
            (await challengeHandler(
              challengeData[provider],
              authData && authData[provider],
              req.config.auth[provider],
              req,
              user ? Parse.User.fromJSON({ className: '_User', ...user }) : undefined
            )) || true;
          return acc;
        }
      },
      {}
    );

    return { response: Object.keys(challenge).length ? { challengeData: challenge } : undefined };
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
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }
}

export default UsersRouter;
