'use strict'; // Helper functions for accessing the google API.

var Parse = require('parse/node').Parse;

const https = require('https');

const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'accounts.google.com';
const HTTPS_TOKEN_ISSUER = 'https://accounts.google.com';
let cache = {}; // Retrieve Google Signin Keys (with cache control)

function getGoogleKeyByKeyId(keyId) {
  if (cache[keyId] && cache.expiresAt > new Date()) {
    return cache[keyId];
  }

  return new Promise((resolve, reject) => {
    https.get(`https://www.googleapis.com/oauth2/v3/certs`, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk.toString('utf8');
      });
      res.on('end', () => {
        const {
          keys
        } = JSON.parse(data);
        const pems = keys.reduce((pems, {
          n: modulus,
          e: exposant,
          kid
        }) => Object.assign(pems, {
          [kid]: rsaPublicKeyToPEM(modulus, exposant)
        }), {});

        if (res.headers['cache-control']) {
          var expire = res.headers['cache-control'].match(/max-age=([0-9]+)/);

          if (expire) {
            cache = Object.assign({}, pems, {
              expiresAt: new Date(new Date().getTime() + Number(expire[1]) * 1000)
            });
          }
        }

        resolve(pems[keyId]);
      });
    }).on('error', reject);
  });
}

function getHeaderFromToken(token) {
  const decodedToken = jwt.decode(token, {
    complete: true
  });

  if (!decodedToken) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `provided token does not decode as JWT`);
  }

  return decodedToken.header;
}

async function verifyIdToken({
  id_token: token,
  id
}, {
  clientId
}) {
  if (!token) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token is invalid for this user.`);
  }

  const {
    kid: keyId,
    alg: algorithm
  } = getHeaderFromToken(token);
  let jwtClaims;
  const googleKey = await getGoogleKeyByKeyId(keyId);

  try {
    jwtClaims = jwt.verify(token, googleKey, {
      algorithms: algorithm,
      audience: clientId
    });
  } catch (exception) {
    const message = exception.message;
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
  }

  if (jwtClaims.iss !== TOKEN_ISSUER && jwtClaims.iss !== HTTPS_TOKEN_ISSUER) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token not issued by correct provider - expected: ${TOKEN_ISSUER} or ${HTTPS_TOKEN_ISSUER} | from: ${jwtClaims.iss}`);
  }

  if (jwtClaims.sub !== id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `auth data is invalid for this user.`);
  }

  if (clientId && jwtClaims.aud !== clientId) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `id token not authorized for this clientId.`);
  }

  return jwtClaims;
} // Returns a promise that fulfills if this user id is valid.


function validateAuthData(authData, options = {}) {
  return verifyIdToken(authData, options);
} // Returns a promise that fulfills if this app id is valid.


function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
}; // Helpers functions to convert the RSA certs to PEM (from jwks-rsa)

function rsaPublicKeyToPEM(modulusB64, exponentB64) {
  const modulus = new Buffer(modulusB64, 'base64');
  const exponent = new Buffer(exponentB64, 'base64');
  const modulusHex = prepadSigned(modulus.toString('hex'));
  const exponentHex = prepadSigned(exponent.toString('hex'));
  const modlen = modulusHex.length / 2;
  const explen = exponentHex.length / 2;
  const encodedModlen = encodeLengthHex(modlen);
  const encodedExplen = encodeLengthHex(explen);
  const encodedPubkey = '30' + encodeLengthHex(modlen + explen + encodedModlen.length / 2 + encodedExplen.length / 2 + 2) + '02' + encodedModlen + modulusHex + '02' + encodedExplen + exponentHex;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9BdXRoL2dvb2dsZS5qcyJdLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJodHRwcyIsImp3dCIsIlRPS0VOX0lTU1VFUiIsIkhUVFBTX1RPS0VOX0lTU1VFUiIsImNhY2hlIiwiZ2V0R29vZ2xlS2V5QnlLZXlJZCIsImtleUlkIiwiZXhwaXJlc0F0IiwiRGF0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZ2V0IiwicmVzIiwiZGF0YSIsIm9uIiwiY2h1bmsiLCJ0b1N0cmluZyIsImtleXMiLCJKU09OIiwicGFyc2UiLCJwZW1zIiwicmVkdWNlIiwibiIsIm1vZHVsdXMiLCJlIiwiZXhwb3NhbnQiLCJraWQiLCJPYmplY3QiLCJhc3NpZ24iLCJyc2FQdWJsaWNLZXlUb1BFTSIsImhlYWRlcnMiLCJleHBpcmUiLCJtYXRjaCIsImdldFRpbWUiLCJOdW1iZXIiLCJnZXRIZWFkZXJGcm9tVG9rZW4iLCJ0b2tlbiIsImRlY29kZWRUb2tlbiIsImRlY29kZSIsImNvbXBsZXRlIiwiRXJyb3IiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaGVhZGVyIiwidmVyaWZ5SWRUb2tlbiIsImlkX3Rva2VuIiwiaWQiLCJjbGllbnRJZCIsImFsZyIsImFsZ29yaXRobSIsImp3dENsYWltcyIsImdvb2dsZUtleSIsInZlcmlmeSIsImFsZ29yaXRobXMiLCJhdWRpZW5jZSIsImV4Y2VwdGlvbiIsIm1lc3NhZ2UiLCJpc3MiLCJzdWIiLCJhdWQiLCJ2YWxpZGF0ZUF1dGhEYXRhIiwiYXV0aERhdGEiLCJvcHRpb25zIiwidmFsaWRhdGVBcHBJZCIsIm1vZHVsZSIsImV4cG9ydHMiLCJtb2R1bHVzQjY0IiwiZXhwb25lbnRCNjQiLCJCdWZmZXIiLCJleHBvbmVudCIsIm1vZHVsdXNIZXgiLCJwcmVwYWRTaWduZWQiLCJleHBvbmVudEhleCIsIm1vZGxlbiIsImxlbmd0aCIsImV4cGxlbiIsImVuY29kZWRNb2RsZW4iLCJlbmNvZGVMZW5ndGhIZXgiLCJlbmNvZGVkRXhwbGVuIiwiZW5jb2RlZFB1YmtleSIsImRlciIsInBlbSIsImpvaW4iLCJoZXhTdHIiLCJtc2IiLCJ0b0hleCIsIm51bWJlciIsIm5zdHIiLCJuSGV4IiwibGVuZ3RoT2ZMZW5ndGhCeXRlIl0sIm1hcHBpbmdzIjoiQUFBQSxhLENBRUE7O0FBQ0EsSUFBSUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCRCxLQUFsQzs7QUFFQSxNQUFNRSxLQUFLLEdBQUdELE9BQU8sQ0FBQyxPQUFELENBQXJCOztBQUNBLE1BQU1FLEdBQUcsR0FBR0YsT0FBTyxDQUFDLGNBQUQsQ0FBbkI7O0FBRUEsTUFBTUcsWUFBWSxHQUFHLHFCQUFyQjtBQUNBLE1BQU1DLGtCQUFrQixHQUFHLDZCQUEzQjtBQUVBLElBQUlDLEtBQUssR0FBRyxFQUFaLEMsQ0FFQTs7QUFDQSxTQUFTQyxtQkFBVCxDQUE2QkMsS0FBN0IsRUFBb0M7QUFDbEMsTUFBSUYsS0FBSyxDQUFDRSxLQUFELENBQUwsSUFBZ0JGLEtBQUssQ0FBQ0csU0FBTixHQUFrQixJQUFJQyxJQUFKLEVBQXRDLEVBQWtEO0FBQ2hELFdBQU9KLEtBQUssQ0FBQ0UsS0FBRCxDQUFaO0FBQ0Q7O0FBRUQsU0FBTyxJQUFJRyxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO0FBQ3RDWCxJQUFBQSxLQUFLLENBQ0ZZLEdBREgsQ0FDUSw0Q0FEUixFQUNxREMsR0FBRyxJQUFJO0FBQ3hELFVBQUlDLElBQUksR0FBRyxFQUFYO0FBQ0FELE1BQUFBLEdBQUcsQ0FBQ0UsRUFBSixDQUFPLE1BQVAsRUFBZUMsS0FBSyxJQUFJO0FBQ3RCRixRQUFBQSxJQUFJLElBQUlFLEtBQUssQ0FBQ0MsUUFBTixDQUFlLE1BQWYsQ0FBUjtBQUNELE9BRkQ7QUFHQUosTUFBQUEsR0FBRyxDQUFDRSxFQUFKLENBQU8sS0FBUCxFQUFjLE1BQU07QUFDbEIsY0FBTTtBQUFFRyxVQUFBQTtBQUFGLFlBQVdDLElBQUksQ0FBQ0Ms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R0FBUDtBQUNEOztBQUVELFNBQVNWLFlBQVQsQ0FBc0JZLE1BQXRCLEVBQThCO0FBQzVCLFFBQU1DLEdBQUcsR0FBR0QsTUFBTSxDQUFDLENBQUQsQ0FBbEI7O0FBQ0EsTUFBSUMsR0FBRyxHQUFHLEdBQU4sSUFBYUEsR0FBRyxHQUFHLEdBQXZCLEVBQTRCO0FBQzFCLFdBQVEsS0FBSUQsTUFBTyxFQUFuQjtBQUNEOztBQUNELFNBQU9BLE1BQVA7QUFDRDs7QUFFRCxTQUFTRSxLQUFULENBQWVDLE1BQWYsRUFBdUI7QUFDckIsUUFBTUMsSUFBSSxHQUFHRCxNQUFNLENBQUNyRSxRQUFQLENBQWdCLEVBQWhCLENBQWI7O0FBQ0EsTUFBSXNFLElBQUksQ0FBQ2IsTUFBTCxHQUFjLENBQWxCLEVBQXFCO0FBQ25CLFdBQVEsSUFBR2EsSUFBSyxFQUFoQjtBQUNEOztBQUNELFNBQU9BLElBQVA7QUFDRDs7QUFFRCxTQUFTVixlQUFULENBQXlCdEQsQ0FBekIsRUFBNEI7QUFDMUIsTUFBSUEsQ0FBQyxJQUFJLEdBQVQsRUFBYztBQUNaLFdBQU84RCxLQUFLLENBQUM5RCxDQUFELENBQVo7QUFDRDs7QUFDRCxRQUFNaUUsSUFBSSxHQUFHSCxLQUFLLENBQUM5RCxDQUFELENBQWxCO0FBQ0EsUUFBTWtFLGtCQUFrQixHQUFHLE1BQU1ELElBQUksQ0FBQ2QsTUFBTCxHQUFjLENBQS9DO0FBQ0EsU0FBT1csS0FBSyxDQUFDSSxrQkFBRCxDQUFMLEdBQTRCRCxJQUFuQztBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb25zIGZvciBhY2Nlc3NpbmcgdGhlIGdvb2dsZSBBUEkuXG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5cbmNvbnN0IGh0dHBzID0gcmVxdWlyZSgnaHR0cHMnKTtcbmNvbnN0IGp3dCA9IHJlcXVpcmUoJ2pzb253ZWJ0b2tlbicpO1xuXG5jb25zdCBUT0tFTl9JU1NVRVIgPSAnYWNjb3VudHMuZ29vZ2xlLmNvbSc7XG5jb25zdCBIVFRQU19UT0tFTl9JU1NVRVIgPSAnaHR0cHM6Ly9hY2NvdW50cy5nb29nbGUuY29tJztcblxubGV0IGNhY2hlID0ge307XG5cbi8vIFJldHJpZXZlIEdvb2dsZSBTaWduaW4gS2V5cyAod2l0aCBjYWNoZSBjb250cm9sKVxuZnVuY3Rpb24gZ2V0R29vZ2xlS2V5QnlLZXlJZChrZXlJZCkge1xuICBpZiAoY2FjaGVba2V5SWRdICYmIGNhY2hlLmV4cGlyZXNBdCA+IG5ldyBEYXRlKCkpIHtcbiAgICByZXR1cm4gY2FjaGVba2V5SWRdO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBodHRwc1xuICAgICAgLmdldChgaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YzL2NlcnRzYCwgcmVzID0+IHtcbiAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuICAgICAgICAgIGRhdGEgKz0gY2h1bmsudG9TdHJpbmcoJ3V0ZjgnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsga2V5cyB9ID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICBjb25zdCBwZW1zID0ga2V5cy5yZWR1Y2UoXG4gICAgICAgICAgICAocGVtcywgeyBuOiBtb2R1bHVzLCBlOiBleHBvc2FudCwga2lkIH0pID0+XG4gICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocGVtcywge1xuICAgICAgICAgICAgICAgIFtraWRdOiByc2FQdWJsaWNLZXlUb1BFTShtb2R1bHVzLCBleHBvc2FudCksXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAge31cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgaWYgKHJlcy5oZWFkZXJzWydjYWNoZS1jb250cm9sJ10pIHtcbiAgICAgICAgICAgIHZhciBleHBpcmUgPSByZXMuaGVhZGVyc1snY2FjaGUtY29udHJvbCddLm1hdGNoKC9tYXgtYWdlPShbMC05XSspLyk7XG5cbiAgICAgICAgICAgIGlmIChleHBpcmUpIHtcbiAgICAgICAgICAgICAgY2FjaGUgPSBPYmplY3QuYXNzaWduKHt9LCBwZW1zLCB7XG4gICAgICAgICAgICAgICAgZXhwaXJlc0F0OiBuZXcgRGF0ZShcbiAgICAgICAgICAgICAgICAgIG5ldyBEYXRlKCkuZ2V0VGltZSgpICsgTnVtYmVyKGV4cGlyZVsxXSkgKiAxMDAwXG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzb2x2ZShwZW1zW2tleUlkXSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCByZWplY3QpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0SGVhZGVyRnJvbVRva2VuKHRva2VuKSB7XG4gIGNvbnN0IGRlY29kZWRUb2tlbiA9IGp3dC5kZWNvZGUodG9rZW4sIHsgY29tcGxldGU6IHRydWUgfSk7XG5cbiAgaWYgKCFkZWNvZGVkVG9rZW4pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgYHByb3ZpZGVkIHRva2VuIGRvZXMgbm90IGRlY29kZSBhcyBKV1RgXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBkZWNvZGVkVG9rZW4uaGVhZGVyO1xufVxuXG5hc3luYyBmdW5jdGlvbiB2ZXJpZnlJZFRva2VuKHsgaWRfdG9rZW46IHRva2VuLCBpZCB9LCB7IGNsaWVudElkIH0pIHtcbiAgaWYgKCF0b2tlbikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICBgaWQgdG9rZW4gaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLmBcbiAgICApO1xuICB9XG5cbiAgY29uc3QgeyBraWQ6IGtleUlkLCBhbGc6IGFsZ29yaXRobSB9ID0gZ2V0SGVhZGVyRnJvbVRva2VuKHRva2VuKTtcbiAgbGV0IGp3dENsYWltcztcbiAgY29uc3QgZ29vZ2xlS2V5ID0gYXdhaXQgZ2V0R29vZ2xlS2V5QnlLZXlJZChrZXlJZCk7XG5cbiAgdHJ5IHtcbiAgICBqd3RDbGFpbXMgPSBqd3QudmVyaWZ5KHRva2VuLCBnb29nbGVLZXksIHtcbiAgICAgIGFsZ29yaXRobXM6IGFsZ29yaXRobSxcbiAgICAgIGF1ZGllbmNlOiBjbGllbnRJZCxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGV4Y2VwdGlvbi5tZXNzYWdlO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCBgJHttZXNzYWdlfWApO1xuICB9XG5cbiAgaWYgKGp3dENsYWltcy5pc3MgIT09IFRPS0VOX0lTU1VFUiAmJiBqd3RDbGFpbXMuaXNzICE9PSBIVFRQU19UT0tFTl9JU1NVRVIpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgYGlkIHRva2VuIG5vdCBpc3N1ZWQgYnkgY29ycmVjdCBwcm92aWRlciAtIGV4cGVjdGVkOiAke1RPS0VOX0lTU1VFUn0gb3IgJHtIVFRQU19UT0tFTl9JU1NVRVJ9IHwgZnJvbTogJHtqd3RDbGFpbXMuaXNzfWBcbiAgICApO1xuICB9XG5cbiAgaWYgKGp3dENsYWltcy5zdWIgIT09IGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgIGBhdXRoIGRhdGEgaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLmBcbiAgICApO1xuICB9XG5cbiAgaWYgKGNsaWVudElkICYmIGp3dENsYWltcy5hdWQgIT09IGNsaWVudElkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgIGBpZCB0b2tlbiBub3QgYXV0aG9yaXplZCBmb3IgdGhpcyBjbGllbnRJZC5gXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBqd3RDbGFpbXM7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWYgdGhpcyB1c2VyIGlkIGlzIHZhbGlkLlxuZnVuY3Rpb24gdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YSwgb3B0aW9ucyA9IHt9KSB7XG4gIHJldHVybiB2ZXJpZnlJZFRva2VuKGF1dGhEYXRhLCBvcHRpb25zKTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCBmdWxmaWxscyBpZiB0aGlzIGFwcCBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXBwSWQoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHZhbGlkYXRlQXBwSWQ6IHZhbGlkYXRlQXBwSWQsXG4gIHZhbGlkYXRlQXV0aERhdGE6IHZhbGlkYXRlQXV0aERhdGEsXG59O1xuXG4vLyBIZWxwZXJzIGZ1bmN0aW9ucyB0byBjb252ZXJ0IHRoZSBSU0EgY2VydHMgdG8gUEVNIChmcm9tIGp3a3MtcnNhKVxuZnVuY3Rpb24gcnNhUHVibGljS2V5VG9QRU0obW9kdWx1c0I2NCwgZXhwb25lbnRCNjQpIHtcbiAgY29uc3QgbW9kdWx1cyA9IG5ldyBCdWZmZXIobW9kdWx1c0I2NCwgJ2Jhc2U2NCcpO1xuICBjb25zdCBleHBvbmVudCA9IG5ldyBCdWZmZXIoZXhwb25lbnRCNjQsICdiYXNlNjQnKTtcbiAgY29uc3QgbW9kdWx1c0hleCA9IHByZXBhZFNpZ25lZChtb2R1bHVzLnRvU3RyaW5nKCdoZXgnKSk7XG4gIGNvbnN0IGV4cG9uZW50SGV4ID0gcHJlcGFkU2lnbmVkKGV4cG9uZW50LnRvU3RyaW5nKCdoZXgnKSk7XG4gIGNvbnN0IG1vZGxlbiA9IG1vZHVsdXNIZXgubGVuZ3RoIC8gMjtcbiAgY29uc3QgZXhwbGVuID0gZXhwb25lbnRIZXgubGVuZ3RoIC8gMjtcblxuICBjb25zdCBlbmNvZGVkTW9kbGVuID0gZW5jb2RlTGVuZ3RoSGV4KG1vZGxlbik7XG4gIGNvbnN0IGVuY29kZWRFeHBsZW4gPSBlbmNvZGVMZW5ndGhIZXgoZXhwbGVuKTtcbiAgY29uc3QgZW5jb2RlZFB1YmtleSA9XG4gICAgJzMwJyArXG4gICAgZW5jb2RlTGVuZ3RoSGV4KFxuICAgICAgbW9kbGVuICsgZXhwbGVuICsgZW5jb2RlZE1vZGxlbi5sZW5ndGggLyAyICsgZW5jb2RlZEV4cGxlbi5sZW5ndGggLyAyICsgMlxuICAgICkgK1xuICAgICcwMicgK1xuICAgIGVuY29kZWRNb2RsZW4gK1xuICAgIG1vZHVsdXNIZXggK1xuICAgICcwMicgK1xuICAgIGVuY29kZWRFeHBsZW4gK1xuICAgIGV4cG9uZW50SGV4O1xuXG4gIGNvbnN0IGRlciA9IG5ldyBCdWZmZXIoZW5jb2RlZFB1YmtleSwgJ2hleCcpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblxuICBsZXQgcGVtID0gJy0tLS0tQkVHSU4gUlNBIFBVQkxJQyBLRVktLS0tLVxcbic7XG4gIHBlbSArPSBgJHtkZXIubWF0Y2goLy57MSw2NH0vZykuam9pbignXFxuJyl9YDtcbiAgcGVtICs9ICdcXG4tLS0tLUVORCBSU0EgUFVCTElDIEtFWS0tLS0tXFxuJztcbiAgcmV0dXJuIHBlbTtcbn1cblxuZnVuY3Rpb24gcHJlcGFkU2lnbmVkKGhleFN0cikge1xuICBjb25zdCBtc2IgPSBoZXhTdHJbMF07XG4gIGlmIChtc2IgPCAnMCcgfHwgbXNiID4gJzcnKSB7XG4gICAgcmV0dXJuIGAwMCR7aGV4U3RyfWA7XG4gIH1cbiAgcmV0dXJuIGhleFN0cjtcbn1cblxuZnVuY3Rpb24gdG9IZXgobnVtYmVyKSB7XG4gIGNvbnN0IG5zdHIgPSBudW1iZXIudG9TdHJpbmcoMTYpO1xuICBpZiAobnN0ci5sZW5ndGggJSAyKSB7XG4gICAgcmV0dXJuIGAwJHtuc3RyfWA7XG4gIH1cbiAgcmV0dXJuIG5zdHI7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUxlbmd0aEhleChuKSB7XG4gIGlmIChuIDw9IDEyNykge1xuICAgIHJldHVybiB0b0hleChuKTtcbiAgfVxuICBjb25zdCBuSGV4ID0gdG9IZXgobik7XG4gIGNvbnN0IGxlbmd0aE9mTGVuZ3RoQnl0ZSA9IDEyOCArIG5IZXgubGVuZ3RoIC8gMjtcbiAgcmV0dXJuIHRvSGV4KGxlbmd0aE9mTGVuZ3RoQnl0ZSkgKyBuSGV4O1xufVxuIl19