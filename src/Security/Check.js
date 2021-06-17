/**
 * @module SecurityCheck
 */

import Utils from '../Utils';
import { isFunction, isString } from 'lodash';

/**
 * A security check.
 * @class Check
 */
class Check {
  /**
   * Constructs a new security check.
   * @param {Object} params The parameters.
   * @param {String} params.title The title.
   * @param {String} params.warning The warning message if the check fails.
   * @param {String} params.solution The solution to fix the check.
   * @param {Promise} params.check The check as synchronous or asynchronous function.
   */
  constructor(params) {
    this._validateParams(params);
    const { title, warning, solution, check } = params;

    this.title = title;
    this.warning = warning;
    this.solution = solution;
    this.check = check;

    // Set default properties
    this._checkState = CheckState.none;
    this.error;
  }

  /**
   * Returns the current check state.
   * @return {CheckState} The check state.
   */
  checkState() {
    return this._checkState;
  }

  async run() {
    // Get check as synchronous or asynchronous function
    const check = this.check instanceof Promise ? await this.check : this.check;

    // Run check
    try {
      check();
      this._checkState = CheckState.success;
    } catch (e) {
      this.stateFailError = e;
      this._checkState = CheckState.fail;
    }
  }

  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */
  _validateParams(params) {
    Utils.validateParams(params, {
      group: { t: 'string', v: isString },
      title: { t: 'string', v: isString },
      warning: { t: 'string', v: isString },
      solution: { t: 'string', v: isString },
      check: { t: 'function', v: isFunction },
    });
  }
}

/**
 * The check state.
 */
const CheckState = Object.freeze({
  none: 'none',
  fail: 'fail',
  success: 'success',
});

export default Check;
module.exports = {
  Check,
  CheckState,
};
