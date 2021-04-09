/**
 * WebAuthn Adapter can be used as an alternative way to login
 * Since we cannot support currently signup with webauthn will throw an error (due to lack of reset process)
 * User need to be logged in to setup the webauthn provider
 */
import {
  generateAttestationOptions,
  verifyAttestationResponse,
  generateAssertionOptions,
  verifyAssertionResponse,
} from '@simplewebauthn/server';
import Parse from 'parse/node';
import { sign, verify } from 'jsonwebtoken';
import crypto from 'crypto';

export const validateAppId = () => Promise.resolve();

const toUserFriendlyRpName = url => {
  const domain = getDomainWithoutWww(url);
  const baseDomain = getBaseDomain(domain).split('.')[0];
  const words = baseDomain.split('-');
  return words
    .reduce((acc, word) => `${acc} ${word.charAt(0).toUpperCase() + word.slice(1)}`, '')
    .trim();
};

const getJwtSecret = config => {
  const hash = crypto.createHash('sha512');
  hash.update(config.masterKey, 'utf-8');
  // Security:
  // sha512 return 128 chars, we can keep only 64 chars since it represent 6,61E98 combinations
  // using the hash allow to reduce risk of compromising the master key
  // if brute force is attempted on the JWT
  return hash.digest().toString('hex').slice(64);
};

// Example here: https://regex101.com/r/wN6cZ7/365
const getDomainWithoutWww = url =>
  /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/g.exec(url)[1];

const getBaseDomain = domain => {
  const splittedDomain = domain.split('.');
  // Handle localhost
  if (splittedDomain.length === 1) return domain.trim();
  // Classic domains
  return `${splittedDomain[splittedDomain.length - 2]}.${
    splittedDomain[splittedDomain.length - 1]
  }`.trim();
};

export const getOrigin = config =>
  getBaseDomain(getDomainWithoutWww(config.publicServerURL || config.serverURL));

const extractSignedChallenge = (signedChallenge, config) => {
  if (!signedChallenge)
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'signedChallenge is required.');
  let expectedChallenge;
  try {
    expectedChallenge = verify(signedChallenge, getJwtSecret(config)).challenge;
    if (!expectedChallenge) throw new Error();
    return expectedChallenge;
  } catch (e) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Invalid signedChallenge');
  }
};

// Return credentials options to the client
// for register public key process
const registerOptions = (user, options = {}, config) => {
  const attestationOptions = generateAttestationOptions({
    rpName:
      (options && options.rpName) ||
      toUserFriendlyRpName(config.publicServerURL || config.serverURL),
    rpID: options.rpId || getOrigin(config),
    // here userId is only used as an identifier and this is never
    // retrieved by the user device
    // this has not real value for parse
    userID: user.id,
    // Could be an email or a firstname lastname depending of
    // the developer usage
    userDisplayName:
      typeof options.getUserDisplayName === 'function'
        ? options.getUserDisplayName(user)
        : user.get('email') || user.get('username'),
    userName:
      typeof options.getUsername === 'function' ? options.getUsername(user) : user.get('username'),
    timeout: 60000,
    attestationType: options.attestationType || 'indirect',
    authenticatorSelection: {
      // Use required to avoid silent sign up
      userVerification: 'required',
      residentKey: options.residentKey || 'preferred',
    },
  });
  return {
    // Use jwt signed challenge to avoid storing challenge in DB
    // Master key is considered safe here to sign the challenge
    // Add additional 20sec for a bad network latency
    signedChallenge: sign({ challenge: attestationOptions.challenge }, getJwtSecret(config), {
      expiresIn: attestationOptions.timeout + 20000,
    }),
    options: attestationOptions,
  };
};

// Verify the attestation provided by the client
const verifyRegister = async ({ signedChallenge, attestation }, options = {}, config) => {
  if (!attestation) throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'attestation is required.');
  const expectedChallenge = extractSignedChallenge(signedChallenge, config);
  try {
    const { verified, attestationInfo } = await verifyAttestationResponse({
      credential: attestation,
      expectedChallenge,
      expectedOrigin: options.origin || getOrigin(config),
      expectedRPID: options.rpId || getOrigin(config),
    });
    if (verified) {
      return {
        counter: attestationInfo.counter,
        publicKey: attestationInfo.credentialPublicKey.toString('base64'),
        id: attestation.id,
      };
    }
    throw new Error();
  } catch (e) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Invalid webauthn attestation');
  }
};

const loginOptions = config => {
  const options = generateAssertionOptions();
  return {
    options,
    signedChallenge: sign({ challenge: options.challenge }, getJwtSecret(config), {
      expiresIn: options.timeout + 20000,
    }),
  };
};

const verifyLogin = ({ assertion, signedChallenge }, options = {}, config, user) => {
  const dbAuthData = user && user.get('authData') && user.get('authData').webauthn;
  if (!dbAuthData)
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      'webauthn not configured for this user or credential id not recognized.'
    );
  if (!assertion) throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'assertion is required.');
  const expectedChallenge = extractSignedChallenge(signedChallenge, config);
  try {
    const { verified, assertionInfo } = verifyAssertionResponse({
      credential: assertion,
      expectedChallenge,
      expectedOrigin: options.origin || getOrigin(config),
      expectedRPID: options.rpId || getOrigin(config),
      authenticator: {
        credentialID: Buffer.from(dbAuthData.id, 'base64'),
        counter: dbAuthData.counter,
        credentialPublicKey: Buffer.from(dbAuthData.publicKey, 'base64'),
      },
    });
    if (verified) {
      return {
        ...dbAuthData,
        counter: assertionInfo.newCounter,
      };
    }
    throw new Error();
  } catch (e) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Invalid webauthn assertion');
  }
};

export const challenge = async (challengeData, authData, adapterConfig = {}, req) => {
  // Allow logged user to update/setUp webauthn
  if (req.auth.user && req.auth.user.id) {
    return registerOptions(req.auth.user, adapterConfig.options, req.config);
  }

  return loginOptions(req.config);
};

export const validateSetUp = async (authData, adapterConfig = {}, req) => {
  if (!req.auth.user && !req.auth.isMaster)
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      'Webauthn can only be configured on an already logged in user.'
    );
  return { save: await verifyRegister(authData, adapterConfig.options, req.config) };
};

export const validateUpdate = validateSetUp;

export const validateLogin = async (authData, adapterConfig = {}, req, user) => {
  if (!user) throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'User not found for webauthn login.');
  // Will save updated counter of the credential
  // and avoid cloned/bugged authenticators
  return { save: verifyLogin(authData, adapterConfig.options, req.config, user) };
};

export const policy = 'solo';
