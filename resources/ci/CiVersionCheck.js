const core = require('@actions/core');
const semver = require('semver');
const yaml = require('yaml');
const lodash = require('lodash');
const fs = require('fs').promises;

/**
 * This checks the CI version of an environment variable in a YAML file
 * against a list of released versions of a package.
 */
class CiVersionCheck {

  /**
   * The constructor.
   * @param {Object} config The config.
   * @param {String} config.packageName The package name to check.
   * @param {String} config.packageSupportUrl The URL to the package website
   * that shows the End-of-Life support dates.
   * @param {String} config.yamlFilePath The path to the GitHub workflow YAML
   * file that contains the tests.
   * @param {String} config.ciEnvironmentsKeyPath The key path in the CI YAML
   * file to the environment specifications.
   * @param {String} config.ciVersionKey The key in the CI YAML file to
   * determine the package version.
   * @param {Array<String>} config.releasedVersions The released versions of
   * the package to check against.
   * @param {Array<String>} config.ignoreReleasedVersions The versions to
   * ignore when checking whether the CI tests against the latest versions.
   * This can be used in case there is a package release for which Parse
   * Server compatibility is not required.
   * @param {String} [config.latestComponent='patch'] The version component
   * (`major`, `minor`, `patch`) that must be the latest released version.
   * Default is `patch`.
   *
   * For example:
   * - Released versions: 1.0.0, 1.2.0, 1.2.1, 1.3.0, 1.3.1, 2.0.0
   * - Tested version: 1.2.0
   *
   * If the latest version component is `patch`, then the check would
   * fail and recommend an upgrade to version 1.2.1 and to add additional
   * tests against 1.3.1 and 2.0.0.
   * If the latest version component is `minor` then the check would
   * fail and recommend an upgrade to version 1.3.0 and to add an additional
   * test against 2.0.0.
   * If the latest version component is `major` then the check would
   * fail and recommend an upgrade to version 2.0.0.
   * @param {Boolean} [config.updateYaml=false] Is true if the YAML file
   * should be updated and package versions should be bumped.
   */
  constructor(config) {
    const {
      packageName,
      packageSupportUrl,
      yamlFilePath,
      ciEnvironmentsKeyPath,
      ciVersionKey,
      releasedVersions,
      ignoreReleasedVersions = [],
      latestComponent = CiVersionCheck.versionComponents.patch,
      updateYaml = false,
    } = config;

    // Ensure required params are set
    if ([
      packageName,
      packageSupportUrl,
      yamlFilePath,
      ciEnvironmentsKeyPath,
      ciVersionKey,
      releasedVersions,
      ignoreReleasedVersions,
      latestComponent,
      updateYaml,
    ].includes(undefined)) {
      throw 'invalid configuration';
    }

    if (!Object.keys(CiVersionCheck.versionComponents).includes(latestComponent)) {
      throw 'invalid configuration for latestComponent';
    }

    this.packageName = packageName;
    this.packageSupportUrl = packageSupportUrl;
    this.yamlFilePath = yamlFilePath;
    this.ciEnvironmentsKeyPath = ciEnvironmentsKeyPath;
    this.ciVersionKey = ciVersionKey;
    this.releasedVersions = releasedVersions;
    this.ignoreReleasedVersions = ignoreReleasedVersions;
    this.latestComponent = latestComponent;
    this.updateYaml = updateYaml;
  }

  /**
   * The definition of version components.
   */
  static get versionComponents() {
    return Object.freeze({
      major: 'major',
      minor: 'minor',
      patch: 'patch',
    });
  }

  /**
   * Returns the test environments as specified in the YAML file.
   */
  async getTests() {
    try {
      // Get CI workflow
      const ciYaml = await fs.readFile(this.yamlFilePath, 'utf-8');
      const ci = yaml.parse(ciYaml);
      this.ci = ci;

      // Extract package versions
      let versions = this._getKeyAtPath(ci, this.ciEnvironmentsKeyPath);
      versions = Object.entries(versions)
        .map(entry => entry[1])
        .filter(entry => entry[this.ciVersionKey]);

      return versions;
    } catch (e) {
      throw `Failed to determine ${this.packageName} versions from CI YAML file with error: ${e}`;
    }
  }

  /**
   * Returns the value at a given key path.
   * @param {Object} obj The object to traverse.
   * @param {String} keyPath The path to the key to return.
   * @returns {Any} The value at the given key path.
   */
  _getKeyAtPath(obj, keyPath) {
    return keyPath.split('.').reduce((o,k) => o !== undefined ? o[k] : undefined, obj);
  }

  /**
   * Returns the package versions which are missing in the CI environment.
   * @param {Array<String>} releasedVersions The released versions; need to
   * be sorted descending.
   * @param {Array<String>} testedVersions The tested versions.
   * @param {String} versionComponent The latest version component.
   * @returns {Array<String>} The untested versions.
   */
  getUntestedVersions(releasedVersions, testedVersions, versionComponent) {
    // Use these example values for debugging the version range logic below
    // versionComponent = CiVersionCheck.versionComponents.patch;
    // this.ignoreReleasedVersions = ['<4.4.0', '~4.7.0'];
    // testedVersions = ['4.4.3'];
    // releasedVersions = [
    //   '5.0.0-rc0',
    //   '5.0.0',
    //   '4.9.1',
    //   '4.9.0',
    //   '4.8.1',
    //   '4.8.0',
    //   '4.7.1',
    //   '4.7.0',
    //   '4.4.3',
    //   '4.4.2',
    //   '4.4.0',
    //   '4.1.0',
    //   '3.5.0',
    // ];

    // Determine operator for range comparison
    const operator = this._getOperatorForVersionComponent(versionComponent);

    // Get all untested versions
    const untestedVersions = releasedVersions.reduce((m, v) => {
      // If the version should be ignored, skip it
      if (this.ignoreReleasedVersions.length > 0 && semver.satisfies(v, this.ignoreReleasedVersions.join(' || '))) {
        return m;
      }
      // If the version is a pre-release, skip it
      if ((semver.prerelease(v) || []).length > 0) {
        return m;
      }
      // If a satisfying version has already been added to untested, skip it
      if (semver.maxSatisfying(m, `${operator}${v}`)) {
        return m;
      }
      // If a satisfying version is already tested, skip it
      if (semver.maxSatisfying(testedVersions, `${operator}${v}`)) {
        return m;
      }
      // Add version
      m.push(v);
      return m;
    }, []);

    return untestedVersions;
  }

  /**
   * Returns the latest version for a given version and component.
   * @param {Array<String>} versions The versions in which to search.
   * @param {String} version The version for which a newer version
   * should be searched.
   * @param {String} versionComponent The version component up to
   * which the latest version should be checked.
   * @returns {String|undefined} The newer version.
   */
  getNewerVersion(versions, version, versionComponent) {
    // Determine operator for range comparison
    const operator = this._getOperatorForVersionComponent(versionComponent);
    const latest = semver.maxSatisfying(versions, `${operator}${version}`);
    return semver.gt(latest, version) ? latest : undefined;
  }

  /**
   * This validates that the given versions strictly follow semver
   * syntax.
   * @param {Array<String>} versions The versions to check.
   */
  _validateVersionSyntax(versions) {
    for (const version of versions) {
      if (!semver.valid(version)) {
        throw version;
      }
    }
  }

  /**
   * Returns the semver range operator that relates to the a version component.
   * For example, the operator for the `patch` version component defines a
   * range up to the highest patch version.
   * @param {String} component The version component (`patch`, `minor`,
   * `major`).
   * @returns {String} The semver operator.
   */
  _getOperatorForVersionComponent(component) {
    // Determine operator for range comparison
    return component == CiVersionCheck.versionComponents.major
      ? '>='
      : component == CiVersionCheck.versionComponents.minor
        ? '^'
        : '~'
  }

  /**
   * Updates a key in the CI YAML file with a given value.
   * @param {Array<Object>} update The key to update.
   * @param {String} update.old The old value to update.
   * @param {String} update.new The new value to set.
   */
  async _updateYaml(update) {
    if (this.ci === undefined) {
      throw 'YAML file has not been read.';
    }

    // Get environments
    const newCi = lodash.cloneDeep(this.ci);
    const envs = this._getKeyAtPath(newCi, this.ciEnvironmentsKeyPath);

    // Update keys
    for (const key of Object.keys(update)) {
      for (const oldValue of Object.keys(update[key])) {
        const newValue = update[key][oldValue];

        // Update value
        for (const env of envs) {
          if (env[key] == oldValue) {
            env[key] = newValue;
          }
        }
      }
    }

    // Write to file
    const newYaml = yaml.stringify(newCi);
    await fs.writeFile(this.yamlFilePath, newYaml);
  }

  /**
   * Runs the check.
   */
  async check() {
    try {
      console.log(`\nChecking ${this.packageName} versions in CI environments...`);

      // Validate released versions syntax
      try {
        this._validateVersionSyntax(this.releasedVersions);
      } catch (e) {
        core.setFailed(`Failed to check ${this.packageName} versions because released version '${e}' does not follow semver syntax (x.y.z).`);
        return;
      }

      // Sort versions descending
      semver.sort(this.releasedVersions).reverse()

      // Get tested package versions from CI
      const tests = await this.getTests();

      // Is true if any of the checks failed
      let failed = false;

      // The keys that should be updated
      const keyUpdatesNeeded = {};

      // Check whether each tested version is the latest patch
      for (const test of tests) {
        const version = test[this.ciVersionKey];

        // Validate version syntax
        try {
          this._validateVersionSyntax([version]);
        } catch (e) {
          core.setFailed(`Failed to check ${this.packageName} versions because environment version '${e}' does not follow semver syntax (x.y.z).`);
          return;
        }

        const newer = this.getNewerVersion(this.releasedVersions, version, this.latestComponent);
        if (newer) {
          console.log(`❌ CI environment '${test.name}' uses an old ${this.packageName} ${this.latestComponent} version ${version} instead of ${newer}.`);
          failed = true;
          keyUpdatesNeeded[this.ciVersionKey] = Object.assign(keyUpdatesNeeded[this.ciVersionKey] || {}, { [version]: newer });
        } else {
          console.log(`✅ CI environment '${test.name}' uses the latest ${this.packageName} ${this.latestComponent} version ${version}.`);
        }
      }

      // Check whether there is a newer component version available that is not tested
      const testedVersions = tests.map(test => test[this.ciVersionKey]);
      const untested = this.getUntestedVersions(this.releasedVersions, testedVersions, this.latestComponent);
      if (untested.length > 0) {
        console.log(`❌ CI does not have environments using the following versions of ${this.packageName}: ${untested.join(', ')}.`);
        failed = true;
      } else {
        console.log(`✅ CI has environments using all recent versions of ${this.packageName}.`);
      }

      if (failed) {
        core.setFailed(
          `CI environments are not up-to-date with the latest ${this.packageName} versions.` +
          `\n\nCheck the error messages above and update the ${this.packageName} versions in the CI YAML ` +
          `file. Additionally, check for versions of ${this.packageName} that have reached their official end-of-life ` +
          `support date and may be removed from the CI, see ${this.packageSupportUrl}.`
        );

        // If packages in YAML file should be updated
        if (this.updateYaml && Object.keys(keyUpdatesNeeded).length > 0) {
          try {
            this._updateYaml(keyUpdatesNeeded);
          } catch (e) {
            console.log(`Failed to update ${this.packageName} versions in YAML file with error: ${e}`);
          }
          console.log(`\n🚀 Updated YAML file to use newer versions of ${this.packageName}. Check the Pull Request list for a PR.`);
        }
      }

    } catch (e) {
      const msg = `Failed to check ${this.packageName} versions with error: ${e}`;
      core.setFailed(msg);
    }
  }
}

module.exports = CiVersionCheck;
