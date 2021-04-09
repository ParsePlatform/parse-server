'use strict';

const Utils = require('../lib/Utils');
const Config = require('../lib/Config');
const request = require('../lib/request');
const Definitions = require('../lib/Options/Definitions');
const { Check, CheckState } = require('../lib/Security/Check');
const CheckGroup = require('../lib/Security/CheckGroup');
const CheckRunner = require('../lib/Security/CheckRunner');
const CheckGroups = require('../lib/Security/CheckGroups/CheckGroups');

describe('Security Check', () => {
  let Group;
  let groupName;
  let checkSuccess;
  let checkFail;
  let config;
  const publicServerURL = 'http://localhost:8378/1';
  const securityUrl = publicServerURL + '/security';

  async function reconfigureServerWithSecurityConfig(security) {
    config.security = security;
    await reconfigureServer(config);
  }

  const securityRequest = options =>
    request(
      Object.assign(
        {
          url: securityUrl,
          headers: {
            'X-Parse-Master-Key': Parse.masterKey,
            'X-Parse-Application-Id': Parse.applicationId,
          },
          followRedirects: false,
        },
        options
      )
    ).catch(e => e);

  beforeEach(async () => {
    groupName = 'Example Group Name';
    checkSuccess = new Check({
      group: 'TestGroup',
      title: 'TestTitleSuccess',
      warning: 'TestWarning',
      solution: 'TestSolution',
      check: () => {
        return true;
      },
    });
    checkFail = new Check({
      group: 'TestGroup',
      title: 'TestTitleFail',
      warning: 'TestWarning',
      solution: 'TestSolution',
      check: () => {
        throw 'Fail';
      },
    });
    Group = class Group extends CheckGroup {
      setName() {
        return groupName;
      }
      setChecks() {
        return [checkSuccess, checkFail];
      }
    };
    config = {
      appId: 'test',
      appName: 'ExampleAppName',
      publicServerURL,
      security: {
        enableCheck: true,
        enableCheckLog: true,
      },
    };
    await reconfigureServer(config);
  });

  describe('server options', () => {
    it('uses default configuration when none is set', async () => {
      await reconfigureServerWithSecurityConfig({});
      expect(Config.get(Parse.applicationId).security.enableCheck).toBe(
        Definitions.SecurityOptions.enableCheck.default
      );
      expect(Config.get(Parse.applicationId).security.enableCheckLog).toBe(
        Definitions.SecurityOptions.enableCheckLog.default
      );
    });

    it('throws on invalid configuration', async () => {
      const options = [
        [],
        'a',
        0,
        true,
        { enableCheck: 'a' },
        { enableCheck: 0 },
        { enableCheck: {} },
        { enableCheck: [] },
        { enableCheckLog: 'a' },
        { enableCheckLog: 0 },
        { enableCheckLog: {} },
        { enableCheckLog: [] },
      ];
      for (const option of options) {
        await expectAsync(reconfigureServerWithSecurityConfig(option)).toBeRejected();
      }
    });
  });

  describe('auto-run', () => {
    it('runs security checks on server start if enabled', async () => {
      const runnerSpy = spyOn(CheckRunner.prototype, 'run').and.callThrough();
      await reconfigureServerWithSecurityConfig({ enableCheck: true, enableCheckLog: true });
      expect(runnerSpy).toHaveBeenCalledTimes(1);
    });

    it('does not run security checks on server start if disabled', async () => {
      const runnerSpy = spyOn(CheckRunner.prototype, 'run').and.callThrough();
      const configs = [
        { enableCheck: true, enableCheckLog: false },
        { enableCheck: false, enableCheckLog: false },
        { enableCheck: false },
        {},
      ];
      for (const config of configs) {
        await reconfigureServerWithSecurityConfig(config);
        expect(runnerSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('security endpoint accessibility', () => {
    it('responds with 403 without masterkey', async () => {
      const response = await securityRequest({ headers: {} });
      expect(response.status).toBe(403);
    });

    it('responds with 409 with masterkey and security check disabled', async () => {
      await reconfigureServerWithSecurityConfig({});
      const response = await securityRequest();
      expect(response.status).toBe(409);
    });

    it('responds with 200 with masterkey and security check enabled', async () => {
      const response = await securityRequest();
      expect(response.status).toBe(200);
    });
  });

  describe('check', () => {
    const initCheck = config => (() => new Check(config)).bind(null);

    it('instantiates check with valid parameters', async () => {
      const configs = [
        {
          group: 'string',
          title: 'string',
          warning: 'string',
          solution: 'string',
          check: () => {},
        },
        {
          group: 'string',
          title: 'string',
          warning: 'string',
          solution: 'string',
          check: async () => {},
        },
      ];
      for (const config of configs) {
        expect(initCheck(config)).not.toThrow();
      }
    });

    it('throws instantiating check with invalid parameters', async () => {
      const configDefinition = {
        group: [false, true, 0, 1, [], {}, () => {}],
        title: [false, true, 0, 1, [], {}, () => {}],
        warning: [false, true, 0, 1, [], {}, () => {}],
        solution: [false, true, 0, 1, [], {}, () => {}],
        check: [false, true, 0, 1, [], {}, 'string'],
      };
      const configs = Utils.getObjectKeyPermutations(configDefinition);

      for (const config of configs) {
        expect(initCheck(config)).toThrow();
      }
    });

    it('sets correct states for check success', async () => {
      const check = new Check({
        group: 'string',
        title: 'string',
        warning: 'string',
        solution: 'string',
        check: () => {},
      });
      expect(check._checkState == CheckState.none);
      check.run();
      expect(check._checkState == CheckState.success);
    });

    it('sets correct states for check fail', async () => {
      const check = new Check({
        group: 'string',
        title: 'string',
        warning: 'string',
        solution: 'string',
        check: () => {
          throw 'error';
        },
      });
      expect(check._checkState == CheckState.none);
      check.run();
      expect(check._checkState == CheckState.fail);
    });
  });

  describe('check group', () => {
    it('returns properties if subclassed correctly', async () => {
      const group = new Group();
      expect(group.name()).toBe(groupName);
      expect(group.checks().length).toBe(2);
      expect(group.checks()[0]).toEqual(checkSuccess);
      expect(group.checks()[1]).toEqual(checkFail);
    });

    it('throws if subclassed incorrectly', async () => {
      class InvalidGroup1 extends CheckGroup {}
      expect((() => new InvalidGroup1()).bind()).toThrow('Check group has no name.');
      class InvalidGroup2 extends CheckGroup {
        setName() {
          return groupName;
        }
      }
      expect((() => new InvalidGroup2()).bind()).toThrow('Check group has no checks.');
    });

    it('runs checks', async () => {
      const group = new Group();
      expect(group.checks()[0].checkState()).toBe(CheckState.none);
      expect(group.checks()[1].checkState()).toBe(CheckState.none);
      expect((() => group.run()).bind(null)).not.toThrow();
      expect(group.checks()[0].checkState()).toBe(CheckState.success);
      expect(group.checks()[1].checkState()).toBe(CheckState.fail);
    });
  });

  describe('check runner', () => {
    const initRunner = config => (() => new CheckRunner(config)).bind(null);

    it('instantiates runner with valid parameters', async () => {
      const configDefinition = {
        enableCheck: [false, true, undefined],
        enableCheckLog: [false, true, undefined],
        checkGroups: [[], undefined],
      };
      const configs = Utils.getObjectKeyPermutations(configDefinition);
      for (const config of configs) {
        expect(initRunner(config)).not.toThrow();
      }
    });

    it('throws instantiating runner with invalid parameters', async () => {
      const configDefinition = {
        enableCheck: [0, 1, [], {}, () => {}],
        enableCheckLog: [0, 1, [], {}, () => {}],
        checkGroups: [false, true, 0, 1, {}, () => {}],
      };
      const configs = Utils.getObjectKeyPermutations(configDefinition);

      for (const config of configs) {
        expect(initRunner(config)).toThrow();
      }
    });

    it('instantiates runner with default parameters', async () => {
      const runner = new CheckRunner();
      expect(runner.enableCheck).toBeFalse();
      expect(runner.enableCheckLog).toBeFalse();
      expect(runner.checkGroups).toBe(CheckGroups);
    });

    it('runs all checks of all groups', async () => {
      const checkGroups = [Group, Group];
      const runner = new CheckRunner({ checkGroups });
      const report = await runner.run();
      expect(report.report.groups[0].checks[0].state).toBe(CheckState.success);
      expect(report.report.groups[0].checks[1].state).toBe(CheckState.fail);
      expect(report.report.groups[1].checks[0].state).toBe(CheckState.success);
      expect(report.report.groups[1].checks[1].state).toBe(CheckState.fail);
    });

    it('reports correct default syntax version 1.0.0', async () => {
      const checkGroups = [Group];
      const runner = new CheckRunner({ checkGroups, enableCheckLog: true });
      const report = await runner.run();
      expect(report).toEqual({
        report: {
          version: '1.0.0',
          state: 'fail',
          groups: [
            {
              name: 'Example Group Name',
              state: 'fail',
              checks: [
                {
                  title: 'TestTitleSuccess',
                  state: 'success',
                },
                {
                  title: 'TestTitleFail',
                  state: 'fail',
                  warning: 'TestWarning',
                  solution: 'TestSolution',
                },
              ],
            },
          ],
        },
      });
    });

    it('logs report', async () => {
      const logger = require('../lib/logger').logger;
      const logSpy = spyOn(logger, 'warn').and.callThrough();
      const checkGroups = [Group];
      const runner = new CheckRunner({ checkGroups, enableCheckLog: true });
      const report = await runner.run();
      const titles = report.report.groups.flatMap(group => group.checks.map(check => check.title));
      expect(titles.length).toBe(2);

      for (const title of titles) {
        expect(logSpy.calls.all()[0].args[0]).toContain(title);
      }
    });
  });
});
