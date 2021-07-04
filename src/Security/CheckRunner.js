/**
 * @module SecurityCheck
 */

import Utils from '../Utils';
import { CheckState } from './Check';
import * as CheckGroups from './CheckGroups/CheckGroups';
import logger from '../logger';
import { isArray, isBoolean } from 'lodash';

/**
 * The security check runner.
 */
class CheckRunner {
  /**
   * The security check runner.
   * @param {Object} [config] The configuration options.
   * @param {Boolean} [config.enableCheck=false] Is true if Parse Server should report weak security settings.
   * @param {Boolean} [config.enableCheckLog=false] Is true if the security check report should be written to logs.
   * @param {Object} [config.checkGroups] The check groups to run. Default are the groups defined in `./CheckGroups/CheckGroups.js`.
   */
  constructor(config = {}) {
    this._validateParams(config);
    const { enableCheck = false, enableCheckLog = false, checkGroups = CheckGroups } = config;
    this.enableCheck = enableCheck;
    this.enableCheckLog = enableCheckLog;
    this.checkGroups = checkGroups;
  }

  /**
   * Runs all security checks and returns the results.
   * @params
   * @returns {Object} The security check report.
   */
  async run({ version = '1.0.0' } = {}) {
    // Instantiate check groups
    const groups = Object.values(this.checkGroups)
      .filter(c => typeof c === 'function')
      .map(CheckGroup => new CheckGroup());

    // Run checks
    groups.forEach(group => group.run());

    // Generate JSON report
    const report = this._generateReport({ groups, version });

    // If report should be written to logs
    if (this.enableCheckLog) {
      this._logReport(report);
    }
    return report;
  }

  /**
   * Generates a security check report in JSON format with schema:
   * ```
   * {
   *    report: {
   *      version: "1.0.0", // The report version, defines the schema
   *      state: "fail"     // The disjunctive indicator of failed checks in all groups.
   *      groups: [         // The check groups
   *        {
   *          name: "House",            // The group name
   *          state: "fail"             // The disjunctive indicator of failed checks in this group.
   *          checks: [                 // The checks
   *            title: "Door locked",   // The check title
   *            state: "fail"           // The check state
   *            warning: "Anyone can enter your house."   // The warning.
   *            solution: "Lock your door."               // The solution.
   *          ]
   *        },
   *        ...
   *      ]
   *    }
   * }
   * ```
   * @param {Object} params The parameters.
   * @param {Array<CheckGroup>} params.groups The check groups.
   * @param {String} params.version: The report schema version.
   * @returns {Object} The report.
   */
  _generateReport({ groups, version }) {
    // Create report template
    const report = {
      report: {
        version,
        state: CheckState.success,
        groups: [],
      },
    };

    // Identify report version
    switch (version) {
      case '1.0.0':
      default:
        // For each check group
        for (const group of groups) {
          // Create group report
          const groupReport = {
            name: group.name(),
            state: CheckState.success,
            checks: [],
          };

          // Create check reports
          groupReport.checks = group.checks().map(check => {
            const checkReport = {
              title: check.title,
              state: check.checkState(),
            };
            if (check.checkState() == CheckState.fail) {
              checkReport.warning = check.warning;
              checkReport.solution = check.solution;
              report.report.state = CheckState.fail;
              groupReport.state = CheckState.fail;
            }
            return checkReport;
          });

          report.report.groups.push(groupReport);
        }
    }
    return report;
  }

  /**
   * Logs the security check report.
   * @param {Object} report The report to log.
   */
  _logReport(report) {
    // Determine log level depending on whether any check failed
    const log =
      report.report.state == CheckState.success ? s => logger.info(s) : s => logger.warn(s);

    // Declare output
    const indent = '   ';
    let output = '';
    let checksCount = 0;
    let failedChecksCount = 0;
    let skippedCheckCount = 0;

    // Traverse all groups and checks for compose output
    for (const group of report.report.groups) {
      output += `\n- ${group.name}`;

      for (const check of group.checks) {
        checksCount++;
        output += `\n${indent}${this._getLogIconForState(check.state)} ${check.title}`;

        if (check.state == CheckState.fail) {
          failedChecksCount++;
          output += `\n${indent}${indent}Warning: ${check.warning}`;
          output += ` ${check.solution}`;
        } else if (check.state == CheckState.none) {
          skippedCheckCount++;
          output += `\n${indent}${indent}Test did not execute, this is likely an internal server issue, please report.`;
        }
      }
    }

    output =
      `\n###################################` +
      `\n#                                 #` +
      `\n#   Parse Server Security Check   #` +
      `\n#                                 #` +
      `\n###################################` +
      `\n` +
      `\n${
        failedChecksCount > 0 ? 'Warning: ' : ''
      }${failedChecksCount} weak security setting(s) found${failedChecksCount > 0 ? '!' : ''}` +
      `\n${checksCount} check(s) executed` +
      `\n${skippedCheckCount} check(s) skipped` +
      `\n` +
      `${output}`;

    // Write log
    log(output);
  }

  /**
   * Returns an icon for use in the report log output.
   * @param {CheckState} state The check state.
   * @returns {String} The icon.
   */
  _getLogIconForState(state) {
    switch (state) {
      case CheckState.success:
        return '✅';
      case CheckState.fail:
        return '❌';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */
  _validateParams(params) {
    Utils.validateParams(params, {
      enableCheck: { t: 'boolean', v: isBoolean, o: true },
      enableCheckLog: { t: 'boolean', v: isBoolean, o: true },
      checkGroups: { t: 'array', v: isArray, o: true },
    });
  }
}

module.exports = CheckRunner;
