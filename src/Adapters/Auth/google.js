'use strict';

// Helper functions for accessing the google API.
var Parse = require('parse/node').Parse;

const https = require('https');
const jwt = require('jsonwebtoken');
const httpsRequest = require('./httpsRequest');

const TOKEN_ISSUER = 'accounts.google.com';
const HTTPS_TOKEN_ISSUER = 'https://accounts.google.com';

let cache = {};

// Retrieve Google Signin Keys (with cache control)
function getGoogleKeyByKeyId(keyId) {
  if (cache[keyId] && cache.expiresAt > new Date()) {
    return cache[keyId];
  }

  return new Promise((resolve, reject) => {
    https
      .get(`https://www.googleapis.com/oauth2/v3/certs`, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => {
          const {keys} = JSON.parse(data);
          const pems = keys.reduce(
            (pems, { n: modulus, e: exposant, kid }) =>
              Object.assign(pems, {
                [kid]: rsaPublicKeyToPEM(modulus, exposant),
              }),
            {}
          );

          if (res.headers['cache-control']) {
            var expire = res.headers['cache-control'].match(/max-age=([0-9]+)/);

            if (expire) {
              cache = Object.assign({}, pems, {
                expiresAt: new Date(new Date().getTime() + Number(expire[1]) * 1000),
              });
            }
          }

          resolve(pems[keyId]);
        });
      })
      .on('error', reject);
  });
}

function getHeaderFromToken(token) {
  const decodedToken = jwt.decode(token, {complete: true});

  if (!decodedToken) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `provided token does not decode as JWT`);
  }

  return decodedToken.header;
}

async function verifyIdToken({id_token: token, id}, {clientId}) {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token is invalid for this user.`);
  }

  const { kid: keyId, alg: algorithm } = getHeaderFromToken(token);
  let jwtClaims;
  const googleKey = await getGoogleKeyByKeyId(keyId);

  try {
    jwtClaims = jwt.verify(token, googleKey, {
      algorithms: algorithm,
      audience: clientId,
    });
  } catch (exception) {
    const message = exception.message;
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER && jwtClaims.iss !== HTTPS_TOKEN_ISSUER) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not issued by correct provider - expected: ${TOKEN_ISSUER} or ${HTTPS_TOKEN_ISSUER} | from: ${jwtClaims.iss}`
    );
  }

  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `auth data is invalid for this user.`);
  }

  if (clientId && jwtClaims.aud !== clientId) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `id token not authorized for this clientId.`
    );
  }

  return jwtClaims;
}

// Old way to validate an auth_token, only used for development purpose
function validateAuthToken({id,access_token}) {
  return googleRequest('tokeninfo?access_token=' + access_token).then(response => {
    if (response && (response.sub == id || response.user_id == id)) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this user id is valid.
function validateAuthData({id, id_token, access_token}, options) {
  // Returns a promise that fulfills if this user id is valid.
  if (id_token) {
    return verifyIdToken({id, id_token}, options);
  } else {
    return validateAuthToken({id, access_token}).then(
      () => {
        // Validation with auth token worked
        return;
      },
      () => {
        // Try with the id_token param
        return verifyIdToken({id, id_token: access_token}, options);
      }
    );
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};


// Helpers functions to convert the RSA certs to PEM (from jwks-rsa)
function rsaPublicKeyToPEM(modulusB64, exponentB64) {
  const modulus = new Buffer(modulusB64, 'base64');
  const exponent = new Buffer(exponentB64, 'base64');
  const modulusHex = prepadSigned(modulus.toString('hex'));
  const exponentHex = prepadSigned(exponent.toString('hex'));
  const modlen = modulusHex.length / 2;
  const explen = exponentHex.length / 2;

  const encodedModlen = encodeLengthHex(modlen);
  const encodedExplen = encodeLengthHex(explen);
  const encodedPubkey =
    '30' +
    encodeLengthHex(modlen + explen + encodedModlen.length / 2 + encodedExplen.length / 2 + 2) +
    '02' +
    encodedModlen +
    modulusHex +
    '02' +
    encodedExplen +
    exponentHex;

  const der = new Buffer(encodedPubkey, 'hex').toString('base64');

  let pem = '-----BEGIN RSA PUBLIC KEY-----\n';
  pem += `${der.match(/.{1,64}/g).join('\n')}`;
  pem += '\n-----END RSA PUBLIC KEY-----\n';
  return pem;
}

function prepadSigned(hexStr) {
  const msb = hexStr[0];
  if (msb < '0' || msb > '7') {
    return `00${hexStr}`;
  }
  return hexStr;
}

function toHex(number) {
  const nstr = number.toString(16);
  if (nstr.length % 2) {
    return `0${nstr}`;
  }
  return nstr;
}

function encodeLengthHex(n) {
  if (n <= 127) {
    return toHex(n);
  }
  const nHex = toHex(n);
  const lengthOfLengthByte = 128 + nHex.length / 2;
  return toHex(lengthOfLengthByte) + nHex;
}

// A promisey wrapper for api requests
function googleRequest(path) {
  return httpsRequest.get('https://www.googleapis.com/oauth2/v3/' + path);
}
