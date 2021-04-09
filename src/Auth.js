const Parse = require('parse/node');
import _ from 'lodash';

const reducePromise = async (arr, fn, acc, index = 0) => {
  if (arr[index]) {
    const newAcc = await Promise.resolve(fn(acc, arr[index]));
    return reducePromise(arr, fn, newAcc, index + 1);
  }
  return acc;
};

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isReadOnly = false,
  user,
  installationId,
}) {
  this.config = config;
  this.cacheController = cacheController || (config && config.cacheController);
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({ config, isMaster: true });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({ config, isMaster: true, isReadOnly: true });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({ config, isMaster: false });
}

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId,
}) {
  cacheController = cacheController || (config && config.cacheController);
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(
        new Auth({
          config,
          cacheController,
          isMaster: false,
          installationId,
          user: cachedUser,
        })
      );
    }
  }

  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user',
    };
    // For cyclic dep
    const RestQuery = require('./RestQuery');
    const query = new RestQuery(config, master(config), '_Session', { sessionToken }, restOptions);
    results = (await query.execute()).results;
  } else {
    results = (
      await new Parse.Query(Parse.Session)
        .limit(1)
        .include('user')
        .equalTo('sessionToken', sessionToken)
        .find({ useMasterKey: true })
    ).map(obj => obj.toJSON());
  }

  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const now = new Date(),
    expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = results[0]['user'];
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject,
  });
};

var getAuthForLegacySessionToken = function ({ config, sessionToken, installationId }) {
  var restOptions = {
    limit: 1,
  };
  // For cyclic dep
  const RestQuery = require('./RestQuery');
  var query = new RestQuery(config, master(config), '_User', { sessionToken }, restOptions);
  return query.execute().then(response => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject,
    });
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return this.rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

Auth.prototype.getRolesForUser = async function () {
  //Stack all Parse.Role
  const results = [];
  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id,
      },
    };
    // For cyclic dep
    const RestQuery = require('./RestQuery');
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result =>
      results.push(result)
    );
  } else {
    await new Parse.Query(Parse.Role)
      .equalTo('users', this.user)
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
  }
  return results;
};

// Iterates through the role tree and compiles a user's roles
Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  }

  // First get the role ids this user is directly a member of
  const results = await this.getRolesForUser();
  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;

    this.cacheRoles();
    return this.userRoles;
  }

  const rolesMap = results.reduce(
    (m, r) => {
      m.names.push(r.name);
      m.ids.push(r.objectId);
      return m;
    },
    { ids: [], names: [] }
  );

  // run the recursive finding
  const roleNames = await this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names);
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};

Auth.prototype.cacheRoles = function () {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};

Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
  if (!this.config) {
    await new Parse.Query(Parse.Role)
      .containedIn(
        'roles',
        ins.map(id => {
          const role = new Parse.Object(Parse.Role);
          role.id = id;
          return role;
        })
      )
      .each(result => results.push(result.toJSON()), { useMasterKey: true });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id,
      };
    });
    const restWhere = { roles: { $in: roles } };
    // For cyclic dep
    const RestQuery = require('./RestQuery');
    await new RestQuery(this.config, master(this.config), '_Role', restWhere, {}).each(result =>
      results.push(result)
    );
  }
  return results;
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }

  return this.getRolesByIds(ins)
    .then(results => {
      // Nothing found
      if (!results.length) {
        return Promise.resolve(names);
      }
      // Map the results with all Ids and names
      const resultMap = results.reduce(
        (memo, role) => {
          memo.names.push(role.name);
          memo.ids.push(role.objectId);
          return memo;
        },
        { ids: [], names: [] }
      );
      // store the new found names
      names = names.concat(resultMap.names);
      // find the next ones, circular roles will be cut
      return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
    })
    .then(names => {
      return Promise.resolve([...new Set(names)]);
    });
};

const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers
    .reduce((memo, provider) => {
      if (!authData[provider] || (authData && !authData[provider].id)) {
        return memo;
      }
      const queryKey = `authData.${provider}.id`;
      const query = {};
      query[queryKey] = authData[provider].id;
      memo.push(query);
      return memo;
    }, [])
    .filter(q => {
      return typeof q !== 'undefined';
    });

  let findPromise = Promise.resolve([]);
  if (query.length > 0) {
    findPromise = config.database.find('_User', { $or: query }, {});
  }

  return findPromise;
};

const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) return { hasMutatedAuthData: true, mutatedAuthData: authData };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];
    if (!_.isEqual(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return { hasMutatedAuthData, mutatedAuthData };
};

const checkIfUserHasProvidedConfiguredProvidersForLogin = (
  authData = {},
  userAuthData = {},
  config
) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter,
  }));

  const hasProvidedASoloProvider = savedUserProviders.some(
    provider =>
      provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]
  );

  // Solo providers can be considered as safe
  // so we do not have to check if the user need
  // to provide an additional provider to login
  if (hasProvidedASoloProvider) return;

  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    if (provider && provider.adapter && provider.adapter.policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for plausible error return
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) return;

  throw new Parse.Error(
    Parse.Error.OTHER_CAUSE,
    `Missing additional authData ${additionProvidersNotFound.join(',')}`
  );
};

// Validate each authData step by step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON({ className: '_User', ...foundUser });
    // Find the user by session and current object id
    // Only pass user if it's the current one or master key with provided user
  } else if (
    (req.auth &&
      req.auth.user &&
      typeof req.getUserId === 'function' &&
      req.getUserId() === req.auth.user.id) ||
    (req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId())
  ) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({ useMasterKey: true });
  }

  // Perform validation as step by step pipeline
  // for better error consistency and also to avoid to trigger a provider (like OTP SMS)
  // if another one fail
  return reducePromise(
    // apply sort to run the pipeline each time in the same order

    Object.keys(authData).sort(),
    async (acc, provider) => {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        return acc;
      }
      const { validator } = req.config.authDataManager.getValidatorForProvider(provider);
      if (!validator) {
        throw new Parse.Error(
          Parse.Error.UNSUPPORTED_SERVICE,
          'This authentication method is unsupported.'
        );
      }
      const validationResult = await validator(
        authData[provider],
        { config: req.config, auth: req.auth },
        user
      );
      if (validationResult) {
        if (!Object.keys(validationResult).length) acc.authData[provider] = authData[provider];

        if (validationResult.response) acc.authDataResponse[provider] = validationResult.response;
        // Some auth providers after initialization will avoid
        // to replace authData already stored
        if (!validationResult.doNotSave) {
          acc.authData[provider] = validationResult.save || authData[provider];
        }
      } else {
        // Support current authData behavior
        // no result store the new AuthData
        acc.authData[provider] = authData[provider];
      }
      return acc;
    },
    { authData: {}, authDataResponse: {} }
  );
};

module.exports = {
  Auth,
  master,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  reducePromise,
  handleAuthDataValidation,
};
