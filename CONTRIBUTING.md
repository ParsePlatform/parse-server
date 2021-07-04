# Contributing to Parse Server <!-- omit in toc -->

## Table of Contents <!-- omit in toc -->
- [Contributing](#contributing)
- [Why Contributing?](#why-contributing)
- [Environment Setup](#environment-setup)
  - [Recommended Tools](#recommended-tools)
  - [Setting up your local machine](#setting-up-your-local-machine)
  - [Good to Know](#good-to-know)
  - [Troubleshooting](#troubleshooting)
  - [Please Do's](#please-dos)
  - [Test against Postgres](#test-against-postgres)
    - [Postgres with Docker](#postgres-with-docker)
- [Breaking Changes](#breaking-changes)
  - [Deprecation Policy](#deprecation-policy)
- [Feature Considerations](#feature-considerations)
  - [Security Checks](#security-checks)
    - [Add Security Check](#add-security-check)
    - [Wording Guideline](#wording-guideline)
  - [Parse Error](#parse-error)
  - [Parse Server Configuration](#parse-server-configuration)
- [Versioning](#versioning)
- [Code of Conduct](#code-of-conduct)

## Contributing

Before you start to code, please open a [new issue](https://github.com/parse-community/parse-server/issues/new/choose) to describe your idea, or search for and continue the discussion in an [existing issue](https://github.com/parse-community/parse-server/issues).

> ⚠️ Please do not post a security vulnerability on GitHub or in the Parse Community Forum. Instead, follow the [Parse Community Security Policy](https://github.com/parse-community/parse-server/security/policy).

Please completely fill out any templates to provide essential information about your new feature or the bug you discovered.

Together we will plan out the best conceptual approach for your contribution, so that your and our time is invested in the best possible approach. The discussion often reveals how to leverage existing features of Parse Server to reach your goal with even less effort and in a more sustainable way.

When you are ready to code, you can find more information about opening a pull request in the [GitHub docs](https://help.github.com/articles/creating-a-pull-request/).

Whether this is your first contribution or you are already an experienced contributor, the Parse Community has your back – don't hesitate to ask for help!

## Why Contributing?

Buy cheap, buy twice. What? No, this is not the Economics 101 class, but the same is true for contributing.

There are two ways of writing a feature or fixing a bug. Sometimes the quick solution is to just write a Cloud Code function that does what you want. Contributing by making the change directly in Parse Server may take a bit longer, but it actually saves you much more time in the long run.

Consider the benefits you get:

- #### 🚀 Higher efficiency
  Your code is examined for efficiency and interoperability with existing features by the community.
- #### 🛡 Stronger security
  Your code is scrutinized for bugs and vulnerabilities and automated checks help to identify security issues that may arise in the future.
- #### 🧬 Continuous improvement
  If your feature is used by others it is likely to be continuously improved and extended by the community.
- #### 💝 Giving back
  You give back to the community that contributed to make the Parse Platform become what it is today and for future developers to come.
- #### 🧑‍🎓 Improving yourself
  You learn to better understand the inner workings of Parse Server, which will help you to write more efficient and resilient code for your own application.

Most importantly, with every contribution you improve your skills so that future contributions take even less time and you get all the benefits above for free — easy choice, right?

## Environment Setup

### Recommended Tools

* [Visual Studio Code](https://code.visualstudio.com), the popular IDE.
* [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-jasmine-test-adapter), a very practical test exploration plugin which let you run, debug and see the test results inline.

### Setting up your local machine

* [Fork](https://github.com/parse-community/parse-server) this project and clone the fork on your local machine:

```sh
$ git clone https://github.com/parse-community/parse-server
$ cd parse-server # go into the clone directory
$ npm install # install all the node dependencies
$ code . # launch vscode
$ npm run watch # run babel watching for local file changes
```

> To launch VS Code from the terminal with the `code` command you first need to follow the [launching from the command line section](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line) in the VS Code setup documentation.

Once you have babel running in watch mode, you can start making changes to parse-server.

### Good to Know

* The `lib/` folder is not committed, so never make changes in there.
* Always make changes to files in the `src/` folder.
* All the tests should point to sources in the `lib/` folder.
* The `lib/` folder is produced by `babel` using either the `npm run build`, `npm run watch`, or the `npm run prepare` step.
* The `npm run prepare` step is automatically invoked when your package depends on forked parse-server installed via git for example using `npm install --save git+https://github.com/[username]/parse-server#[branch/commit]`.
* The tests are run against a single server instance. You can change the server configurations using `await reconfigureServer({ ... some configuration })` found in `spec/helper.js`.
* The tests are ran at random.
* Caches and Configurations are reset after every test.
* Users are logged out after every test.
* Cloud Code hooks are removed after every test.
* Database is deleted after every test (indexes are not removed for speed)
* Tests are located in the `spec` folder
* For better test reporting enable `PARSE_SERVER_LOG_LEVEL=debug`

### Troubleshooting

*Question*: I modify the code in the src folder but it doesn't seem to have any effect.<br/>
*Answer*: Check that `npm run watch` is running

*Question*: How do I use breakpoints and debug step by step?<br/>
*Answer*: The easiest way is to install [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer), it will let you run selectively tests and debug them.

*Question*: How do I deploy my forked version on my servers?<br/>
*Answer*: In your `package.json`, update the `parse-server` dependency to `https://github.com/[username]/parse-server#[branch/commit]`. Run `npm install`, commit the changes and deploy to your servers.

*Question*: How do I deploy my forked version using docker?<br/>
*Answer*: In your `package.json`, update the `parse-server` dependency to `https://github.com/[username]/parse-server#[branch/commit]`. Make sure the `npm install` step in your `Dockerfile` is running under non-privileged user for the ``npm run prepare`` step to work correctly. For official node images from hub.docker.com that non-privileged user is `node` with `/home/node` working directory.


### Please Do's

* Begin by reading the [Development Guide](http://docs.parseplatform.org/parse-server/guide/#development-guide) to learn how to get started running the parse-server.
* Take testing seriously! Aim to increase the test coverage with every pull request. To obtain the test coverage of the project, run: `npm run coverage`
* Run the tests for the file you are working on with the following command: `npm test spec/MyFile.spec.js`
* Run the tests for the whole project to make sure the code passes all tests. This can be done by running the test command for a single file but removing the test file argument. The results can be seen at *<PROJECT_ROOT>/coverage/lcov-report/index.html*.
* Lint your code by running `npm run lint` to make sure the code is not going to be rejected by the CI.
* **Do not** publish the *lib* folder.
* Mocks belong in the `spec/support` folder.
* Please consider if any changes to the [docs](http://docs.parseplatform.org) are needed or add additional sections in the case of an enhancement or feature.

### Test against Postgres

If your pull request introduces a change that may affect the storage or retrieval of objects, you may want to make sure it plays nice with Postgres.

* Run the tests against the postgres database with `PARSE_SERVER_TEST_DB=postgres PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database npm run testonly`. You'll need to have postgres running on your machine and setup [appropriately](https://github.com/parse-community/parse-server/blob/master/scripts/before_script_postgres.sh) or use [`Docker`](#run-a-parse-postgres-with-docker).
* The Postgres adapter has a special debugger that traces all the sql commands. You can enable it with setting the environment variable `PARSE_SERVER_LOG_LEVEL=debug`
* If your feature is intended to only work with MongoDB, you should disable PostgreSQL-specific tests with:

  - `describe_only_db('mongo')` // will create a `describe` that runs only on mongoDB
  - `it_only_db('mongo')` // will make a test that only runs on mongo
  - `it_exclude_dbs(['postgres'])` // will make a test that runs against all DB's but postgres
* Similarly, if your feature is intended to only work with PostgreSQL, you should disable MongoDB-specific tests with:
 
  - `describe_only_db('postgres')` // will create a `describe` that runs only on postgres
  - `it_only_db('postgres')` // will make a test that only runs on postgres
  - `it_exclude_dbs(['mongo'])` // will make a test that runs against all DB's but mongo

* If your feature is intended to work with MongoDB and PostgreSQL, you can include or exclude tests more granularly with:

  - `it_only_mongodb_version('>=4.4')` // will test with any version of Postgres but only with version >=4.4 of MongoDB; accepts semver notation to specify a version range
  - `it_exclude_mongodb_version('<4.4')` // will test with any version of Postgres and MongoDB, excluding version <4.4 of MongoDB; accepts semver notation to specify a version range

#### Postgres with Docker

[PostGIS images (select one with v2.2 or higher) on docker dashboard](https://hub.docker.com/r/postgis/postgis) is based off of the official [postgres](https://registry.hub.docker.com/_/postgres/) image and will work out-of-the-box (as long as you create a user with the necessary extensions for each of your Parse databases; see below). To launch the compatible Postgres instance, copy and paste the following line into your shell:

```
docker run -d --name parse-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password --rm postgis/postgis:11-3.0-alpine && sleep 20 && docker exec -it parse-postgres psql -U postgres -c 'CREATE DATABASE parse_server_postgres_adapter_test_database;' && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION pgcrypto; CREATE EXTENSION postgis;' -d parse_server_postgres_adapter_test_database && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION postgis_topology;' -d parse_server_postgres_adapter_test_database
```
To stop the Postgres instance:

```
docker stop parse-postgres
```

You can also use the [postgis/postgis:11-2.5-alpine](https://hub.docker.com/r/postgis/postgis) image in a Dockerfile and copy this [script](https://github.com/parse-community/parse-server/blob/master/scripts/before_script_postgres.sh) to the image by adding the following lines:

```
#Install additional scripts. These are run in abc order during initial start
COPY ./scripts/setup-dbs.sh /docker-entrypoint-initdb.d/setup-dbs.sh
RUN chmod +x /docker-entrypoint-initdb.d/setup-dbs.sh
```

Note that the script above will ONLY be executed during initialization of the container with no data in the database, see the official [Postgres image](https://hub.docker.com/_/postgres) for details. If you want to use the script to run again be sure there is no data in the /var/lib/postgresql/data of the container.

## Breaking Changes

Breaking changes should be avoided whenever possible. For a breaking change to be accepted, the benefits of the change have to clearly outweigh the costs of developers having to adapt their deployments. If a breaking change is only cosmetic it will likely be rejected and preferred to become obsolete organically during the course of further development, unless it is required as part of a larger change. Breaking changes should follow the [Deprecation Policy](#deprecation-policy).

Please consider that Parse Server is just one component in a stack that requires attention. A breaking change requires resources and effort to adapt an environment. An unnecessarily high frequency of breaking changes can have detrimental side effects such as:
- "upgrade fatigue" where developers run old versions of Parse Server because they cannot always attend to every update that contains a breaking change
- less secure Parse Server deployments that run on old versions which is contrary to the security evangelism Parse Server intends to facilitate for developers
- less feedback and slower identification of bugs and an overall slow-down of Parse Server development because new versions with breaking changes also include new features we want to get feedback on

### Deprecation Policy

If you change or remove an existing feature that would lead to a breaking change, use the following deprecation pattern:
  - Make the new feature or change optional, if necessary with a new Parse Server option parameter.
  - Use a default value that falls back to existing behavior.
  - Add a deprecation definition in `Deprecator/Deprecations.js` that will output a deprecation warning log message on Parse Server launch, for example:
    > DeprecationWarning: The Parse Server option 'example' will be removed in a future release.
  
Deprecations become breaking changes after notifying developers through deprecation warnings for at least one entire previous major release. For example:
  - `4.5.0` is the current version
  - `4.6.0` adds a new optional feature and a deprecation warning for the existing feature
  - `5.0.0` marks the beginning of logging the deprecation warning for one entire major release
  - `6.0.0` makes the breaking change by removing the deprecation warning and making the new feature replace the existing feature

Developer feedback during the deprecation period may further postpone the introduction of a breaking change.

## Feature Considerations
### Security Checks

The Parse Server security checks feature warns developers about weak security settings in their Parse Server deployment.

A security check needs to be added for every new feature or enhancement that allows the developer to configure it in a way that weakens security mechanisms or exposes functionality which creates a weak spot for malicious attacks. If you are not sure whether your feature or enhancements requires a security check, feel free to ask.

For example, allowing public read and write to a class may be useful to simplify development but should be disallowed in a production environment.

Security checks are added in [CheckGroups](https://github.com/parse-community/parse-server/tree/master/src/Security/CheckGroups).

#### Add Security Check
Adding a new security check for your feature is easy and fast:
1. Look into [CheckGroups](https://github.com/parse-community/parse-server/tree/master/src/Security/CheckGroups) whether there is an existing `CheckGroup[Category].js` file for the category of check to add. For example, a check regarding the database connection is added to `CheckGroupDatabase.js`.
2. If you did not find a file, duplicate an existing file and replace the category name in `setName()` and the checks in `setChecks()`:
    ```js
    class CheckGroupNewCategory extends CheckGroup {
      setName() {
        return 'House';
      }
      setChecks() {
        return [
          new Check({
            title: 'Door locked',
            warning: 'Anyone can enter your house.',
            solution: 'Lock the door.',
            check: () => {    
              return;     // Example of a passing check
            }
          }),
          new Check({
            title: 'Camera online',
            warning: 'Security camera is offline.',
            solution: 'Check the camera.',
            check: async () => {  
              throw 1;     // Example of a failing check
            }
          }),
        ];
      }
    }
    ```

3. If you added a new file in the previous step, reference the file in [CheckGroups.js](https://github.com/parse-community/parse-server/blob/master/src/Security/CheckGroups/CheckGroups.js), which is the collector of all security checks:
    ```
    export { default as CheckGroupNewCategory } from './CheckGroupNewCategory';
    ```
4. Add a test that covers the new check to [SecurityCheckGroups.js](https://github.com/parse-community/parse-server/blob/master/spec/SecurityCheckGroups.js) for the cases of success and failure.

#### Wording Guideline
Consider the following when adding a new security check:
- *Group.name*: The category name; ends without period as this is a headline.
- *Check.title*: Is the positive hypothesis that should be checked, for example "Door locked" instead of "Door unlocked"; ends without period as this is a title.
- *Check.warning*: The warning if the test fails; ends with period as this is a description.
- *Check.solution*: The recommended solution if the test fails; ends with period as this is an instruction.
- The wordings must not contain any sensitive information such as keys, as the security report may be exposed in logs.
- The wordings should be concise and not contain verbose explanations, for example "Door locked" instead of "Door has been locked securely".
- Do not use pronouns such as "you" or "your" because log files can have various readers with different roles. Do not use pronouns such as "I" or "me" because although we love it dearly, Parse Server is not a human.

### Parse Error

Introducing new Parse Errors requires the following steps:

1. Research whether an existing Parse Error already covers the error scenario. Keep in mind that reusing an already existing Parse Error does not allow to distinguish between scenarios in which the same error is thrown, so it may be necessary to add a new and more specific Parse Error, even though a more general Parse Error already exists.
⚠️ Currently (as of Dec. 2020), there are inconsistencies between the Parse Errors documented in the Parse Guides, coded in the Parse JS SDK and coded in Parse Server, therefore research regarding the availability of error codes has to be conducted in all of these sources.
1. Add the new Parse Error to [/src/ParseError.js](https://github.com/parse-community/Parse-SDK-JS/blob/master/src/ParseError.js) in the Parse JavaScript SDK. This is the primary reference for Parse Errors for the Parse JavaScript SDK and Parse Server.
1. Create a pull request for the Parse JavaScript SDK including the new Parse Errors. The PR needs to be merged and a new Parse JS SDK version needs to be released.
1. Change the Parse JS SDK dependency in [package.json](https://github.com/parse-community/parse-server/blob/master/package.json) of Parse Server to the newly released Parse JS SDK version, so that the new Parse Error is recognized by Parse Server.
1. When throwing the new Parse Error in code, do not hard-code the error code but instead reference the error code from the Parse Error. For example:
    ```javascript
    throw new Parse.Error(Parse.Error.EXAMPLE_ERROR_CODE, 'Example error message.');
    ```
1. Choose a descriptive error message that provdes more details about the specific error scenario. Different error messages may be used for the same error code. For example:
    ```javascript
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'The file could not be saved because it exceeded the maximum allowed file size.');
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'The file could not be saved because the file format was incorrect.');
    ```
1. Add the new Parse Error to the [docs](https://github.com/parse-community/docs/blob/gh-pages/_includes/common/errors.md).

### Parse Server Configuration

Introducing new [Parse Server configuration][config] parameters requires the following steps:

1. Add parameters definitions in [/src/Options/index.js][config-index].
1. If a nested configuration object has been added, add the environment variable option prefix to `getENVPrefix` in [/resources/buildConfigDefinition.js](https://github.com/parse-community/parse-server/blob/master/resources/buildConfigDefinition.js).
1. Execute `npm run definitions` to automatically create the definitions in [/src/Options/Definitions.js][config-def] and [/src/Options/docs.js][config-docs].
1. Add parameter value validation in [/src/Config.js](https://github.com/parse-community/parse-server/blob/master/src/Config.js).
1. Add test cases to ensure the correct parameter value validation. Parse Server throws an error at launch if an invalid value is set for any configuration parameter.
1. Execute `npm run docs` to generate the documentation in the `/out` directory. Take a look at the documentation whether the description and formatting of the newly introduced parameters is satisfactory.

## Versioning

> The following versioning system is applied since Parse Server 5.0.0 and does not necessarily apply to previous releases.

Parse Server follows [semantic versioning](https://semver.org) with a flavor of [calendric versioning](https://calver.org). Semantic versioning makes Parse Server easy to upgrade because breaking changes only occur in major releases. Calendric versioning gives an additional sense of how old a Parse Server release is and allows for future Long-Term Support concepts, which Parse Server currently does not provide.

Syntax: `[major]`**.**`[minor]`**.**`[patch]`**-**`[pre-release-label]`

- The `major` version increments with the first release of every year and may include changes that are *not* backwards compatible.
- The `minor` version increments during the year and may include new features or improvements of existing features that are backwards compatible.
- The `patch` version increments during the year and may include bug fixes that are backwards compatible.
- The `pre-release-label` is optional for pre-release versions such as:
  - `-alpha` (likely to contain bugs, likely to change in features until release)
  - `-beta` (likely to contain bugs, no change in features until release)
  - `-rc0` (unlikely to contain bugs, no change in features until release)

Exceptions:
- The `major` version may increment during the year in the unlikely event that a breaking change is so urgent that it cannot wait for the next yearly release. An example would be a vulnerability fix that leads to an unavoidable breaking change.
- Bug fixes of security vulnerabilities are `patch` releases, unless they cause a breaking change, then they are `major` releases.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://github.com/parse-community/parse-server/blob/master/CODE_OF_CONDUCT.md). By participating, you are expected to honor this code.

[config]: http://parseplatform.org/parse-server/api/master/ParseServerOptions.html
[config-def]: https://github.com/parse-community/parse-server/blob/master/src/Options/Definitions.js
[config-docs]: https://github.com/parse-community/parse-server/blob/master/src/Options/docs.js
[config-index]: https://github.com/parse-community/parse-server/blob/master/src/Options/index.js
