const cryptoUtils = require('./cryptoUtils');
const RestQuery = require('./RestQuery');
const Parse = require('parse/node');
import { AuthRoles } from "./AuthRoles";

// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({ config, isMaster = false, isReadOnly = false, user, installationId } = {}) {
  this.config = config;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;

  // return the auth role validator
  this.getAuthRoles = () => {
    return new AuthRoles(master(this.config), this.user.id);
  }
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function() {
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
var getAuthForSessionToken = function({ config, sessionToken, installationId } = {}) {
  return config.cacheController.user.get(sessionToken).then((userJSON) => {
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(new Auth({config, isMaster: false, installationId, user: cachedUser}));
    }

    var restOptions = {
      limit: 1,
      include: 'user'
    };

    var query = new RestQuery(config, master(config), '_Session', {sessionToken}, restOptions);
    return query.execute().then((response) => {
      var results = response.results;
      if (results.length !== 1 || !results[0]['user']) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }

      var now = new Date(),
        expiresAt = results[0].expiresAt ? new Date(results[0].expiresAt.iso) : undefined;
      if (expiresAt < now) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
          'Session token is expired.');
      }
      var obj = results[0]['user'];
      delete obj.password;
      obj['className'] = '_User';
      obj['sessionToken'] = sessionToken;
      config.cacheController.user.put(sessionToken, obj);
      const userObject = Parse.Object.fromJSON(obj);
      return new Auth({config, isMaster: false, installationId, user: userObject});
    });
  });
};

var getAuthForLegacySessionToken = function({config, sessionToken, installationId } = {}) {
  var restOptions = {
    limit: 1
  };
  var query = new RestQuery(config, master(config), '_User', { sessionToken: sessionToken}, restOptions);
  return query.execute().then((response) => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({config, isMaster: false, installationId, user: userObject});
  });
}

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function() {
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

// Iterates through the role tree and compiles a users roles
Auth.prototype._loadRoles = function() {
  var cacheAdapter = this.config.cacheController;
  return cacheAdapter.role.get(this.user.id).then((cachedRoles) => {
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return Promise.resolve(cachedRoles);
    }

    const authRoles = this.getAuthRoles()
    return authRoles.findRoles()
      .then((result) => {
        // mark the roles as fetched and clear promise
        this.fetchedRoles = true;
        this.rolePromise = null;
        // role names
        if (!result) {
          this.userRoles = [];
        }else{
          this.userRoles = result
        }
        cacheAdapter.role.put(this.user.id, Array(...this.userRoles));
        return Promise.resolve(this.userRoles)
      })
  });
};

const createSession = function(config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData,
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    restricted: false,
    expiresAt: Parse._encode(expiresAt)
  };

  if (installationId) {
    sessionData.installationId = installationId
  }

  Object.assign(sessionData, additionalSessionData);
  // We need to import RestWrite at this point for the cyclic dependency it has to it
  const RestWrite = require('./RestWrite');

  return {
    sessionData,
    createSession: () => new RestWrite(config, master(config), '_Session', null, sessionData).execute()
  }
}

module.exports = {
  Auth,
  master,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  createSession,
};
