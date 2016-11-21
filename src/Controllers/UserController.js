import { randomString }    from '../cryptoUtils';
import { inflate }         from '../triggers';
import AdaptableController from './AdaptableController';
import MailAdapter         from '../Adapters/Email/MailAdapter';
import rest                from '../rest';
import Parse               from 'parse/node';

var RestQuery = require('../RestQuery');
var Auth = require('../Auth');

export class UserController extends AdaptableController {

  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }

  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }
    super.validateAdapter(adapter);
  }

  expectedAdapterType() {
    return MailAdapter;
  }

  get shouldVerifyEmails() {
    return this.options.verifyUserEmails;
  }

  setEmailVerifyToken(user) {
    if (this.shouldVerifyEmails) {
      user._email_verify_token = randomString(25);
      user.emailVerified = false;

      if (this.config.emailVerifyTokenValidityDuration) {
        user._email_verify_token_expires_at = Parse._encode(this.config.generateEmailVerifyTokenExpiresAt());
      }
    }
  }

  verifyEmail(username, token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }

    const query = {username: username, _email_verify_token: token};
    const updateFields = { emailVerified: true, _email_verify_token: {__op: 'Delete'}};

    // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated
    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = { $gt: Parse._encode(new Date()) };

      updateFields._email_verify_token_expires_at = {__op: 'Delete'};
    }

    return this.config.database.update('_User', query, updateFields).then((document) => {
      if (!document) {
        throw undefined;
      }
      return Promise.resolve(document);
    });
  }

  checkResetTokenValidity(username, token) {
    return this.config.database.find('_User', {
      username: username,
      _perishable_token: token
    }, {limit: 1}).then(results => {
      if (results.length != 1) {
        throw undefined;
      }

      if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate < new Date())
          throw 'The password reset link has expired';
      }

      return results[0];
    });
  }

  getUserIfNeeded(user) {
    if (user.username && user.email) {
      return Promise.resolve(user);
    }
    var where = {};
    if (user.username) {
      where.username = user.username;
    }
    if (user.email) {
      where.email = user.email;
    }

    var query = new RestQuery(this.config, Auth.master(this.config), '_User', where);
    return query.execute().then(function(result){
      if (result.results.length != 1) {
        throw undefined;
      }
      return result.results[0];
    })
  }

  sendVerificationEmail(user) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    const token = encodeURIComponent(user._email_verify_token);
    // We may need to fetch the user in case of update email
    this.getUserIfNeeded(user).then((user) => {
      const username = encodeURIComponent(user.username);
      const link = buildVerificationLink(this.config.verifyEmailURL, username, token);
      const options = {
        appName: this.config.appName,
        link: link,
        user: inflate('_User', user),
      };
      if (this.adapter.sendVerificationEmail) {
        this.adapter.sendVerificationEmail(options);
      } else {
        this.adapter.sendMail(this.defaultVerificationEmail(options));
      }
    });
  }

  setPasswordResetToken(email) {
    const token = { _perishable_token: randomString(25) };

    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      token._perishable_token_expires_at = Parse._encode(this.config.generatePasswordResetTokenExpiresAt());
    }

    return this.config.database.update('_User', { $or: [{email}, {username: email, email: {$exists: false}}] }, token, {}, true)
  }

  sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw "Trying to send a reset password but no adapter is set";
      //  TODO: No adapter?
    }

    return this.setPasswordResetToken(email)
    .then(user => {
      const token = encodeURIComponent(user._perishable_token);
      const username = encodeURIComponent(user.username);

      const link = buildVerificationLink(this.config.requestResetPasswordURL, username, token);
      const options = {
        appName: this.config.appName,
        link: link,
        user: inflate('_User', user),
      };

      if (this.adapter.sendPasswordResetEmail) {
        this.adapter.sendPasswordResetEmail(options);
      } else {
        this.adapter.sendMail(this.defaultResetPasswordEmail(options));
      }

      return Promise.resolve(user);
    });
  }

  updatePassword(username, token, password) {
    return this.checkResetTokenValidity(username, token)
      .then(user => updateUserPassword(user.objectId, password, this.config))
      // clear reset password token
      .then(() => this.config.database.update('_User', {username}, {
        _perishable_token: {__op: 'Delete'},
        _perishable_token_expires_at: {__op: 'Delete'}
      })).catch((error) => {
        if (error.message) {  // in case of Parse.Error, fail with the error message only
          return Promise.reject(error.message);
        } else {
          return Promise.reject(error);
        }
      });
  }

  defaultVerificationEmail({link, user, appName, }) {
    const text = "Hi,\n\n" +
        "You are being asked to confirm the e-mail address " + user.get("email") + " with " + appName + "\n\n" +
        "" +
        "Click here to confirm it:\n" + link;
    const to = user.get("email");
    const subject = 'Please verify your e-mail for ' + appName;
    return { text, to, subject };
  }

  defaultResetPasswordEmail({link, user, appName, }) {
    const text = "Hi,\n\n" +
        "You requested to reset your password for " + appName + ".\n\n" +
        "" +
        "Click here to reset it:\n" + link;
    const to = user.get("email") || user.get('username');
    const subject =  'Password Reset for ' + appName;
    return { text, to, subject };
  }
}

// Mark this private
function updateUserPassword(userId, password, config) {
  return rest.update(config, Auth.master(config), '_User', userId, {
    password: password
  });
}

function buildVerificationLink(destination, username, token) {
  let usernameAndToken = `token=${token}&username=${username}`

  if (this.config.parseFrameURL) {
    let destinationWithoutHost = destination.replace(this.config.publicServerURL, '');
   return `${this.config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}

export default UserController;
