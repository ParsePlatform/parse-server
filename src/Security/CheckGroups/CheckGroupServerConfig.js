/**
 * @module SecurityCheck
 */

import { Check } from '../Check';
import CheckGroup from '../CheckGroup';
import Config from '../../Config';
import Parse from 'parse/node';

/**
 * The security checks group for Parse Server configuration.
 * Checks common Parse Server parameters such as access keys.
 */
class CheckGroupServerConfig extends CheckGroup {
  setName() {
    return 'Parse Server Configuration';
  }
  setChecks() {
    const config = Config.get(Parse.applicationId);
    return [
      new Check({
        title: 'Secure master key',
        warning: 'The Parse Server master key is insecure and vulnerable to brute force attacks.',
        solution:
          'Choose a longer and/or more complex master key with a combination of upper- and lowercase characters, numbers and special characters.',
        check: () => {
          const masterKey = config.masterKey;
          const hasUpperCase = /[A-Z]/.test(masterKey);
          const hasLowerCase = /[a-z]/.test(masterKey);
          const hasNumbers = /\d/.test(masterKey);
          const hasNonAlphasNumerics = /\W/.test(masterKey);
          // Ensure length
          if (masterKey.length < 14) {
            throw 1;
          }
          // Ensure at least 3 out of 4 requirements passed
          if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Security log disabled',
        warning: 'Security checks in logs may expose vulnerabilities to anyone access to logs.',
        solution: "Change Parse Server configuration to 'security.enableCheckLog: false'.",
        check: () => {
          if (config.security && config.security.enableCheckLog) {
            throw 1;
          }
        },
      }),
      new Check({
        title: 'Client class creation disabled',
        warning:
          'Attackers are allowed to create new classes without restriction and flood the database.',
        solution: "Change Parse Server configuration to 'allowClientClassCreation: false'.",
        check: () => {
          if (config.allowClientClassCreation || config.allowClientClassCreation == null) {
            throw 1;
          }
        },
      }),
    ];
  }
}

module.exports = CheckGroupServerConfig;
