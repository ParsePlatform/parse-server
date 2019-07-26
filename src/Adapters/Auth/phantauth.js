/*
 * Helper functions for authenticating with PhantAuth.
 *
 * PhantAuth was designed to simplify testing for applications using OpenID Connect
 * authentication by making use of random generated users.
 *
 * To learn more, please go to: https://wwww.phantauth.net
 */

var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  return request('auth/userinfo', authData.access_token).then(data => {
    if (data && data.sub == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'PhantAuth auth is invalid for this user.'
    );
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'phantauth.net',
    path: '/' + path,
    headers: {
      Authorization: 'bearer ' + access_token,
      'User-Agent': 'parse-server',
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
