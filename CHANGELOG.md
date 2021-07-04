# Parse Server Changelog

Jump directly to a version:

| 4.x               |
|-------------------|
| [**4.5.0 (latest release)**](#450) |
| [4.4.0](#440)     |
| [4.3.0](#430)     |
| [4.2.0](#420)     |
| [4.1.0](#410)     |
| [4.0.2](#402)     |
| [4.0.1](#401)     |
| [4.0.0](#400)     |

<details>
<summary>Previous Versions</summary>

| 3.x             | 2.x             |
|-----------------|-----------------|
| [3.10.0](#3100) | [2.8.4](#284)   |
| [3.9.0](#390)   | [2.8.3](#283)   |
| [3.8.0](#380)   | [2.8.2](#282)   |
| [3.7.2](#372)   | [2.8.1](#281)   |
| [3.7.1](#371)   | [2.8.0](#280)   |
| [3.7.0](#370)   | [2.7.4](#274)   |
| [3.6.0](#360)   | [2.7.3](#273)   |
| [3.5.0](#350)   | [2.7.2](#272)   |
| [3.4.4](#344)   | [2.7.1](#271)   |
| [3.4.3](#343)   | [2.7.0](#270)   |
| [3.4.2](#342)   | [2.6.5](#265)   |
| [3.4.1](#341)   | [2.6.4](#264)   |
| [3.4.0](#340)   | [2.6.3](#263)   |
| [3.3.0](#330)   | [2.6.2](#262)   |
| [3.2.3](#323)   | [2.6.1](#261)   |
| [3.2.2](#322)   | [2.6.0](#260)   |
| [3.2.1](#321)   | [2.5.3](#253)   |
| [3.2.0](#320)   | [2.5.2](#252)   |
| [3.1.3](#313)   | [2.5.1](#251)   |
| [3.1.2](#312)   | [2.5.0](#250)   |
| [3.1.1](#311)   | [2.4.2](#242)   |
| [3.1.0](#310)   | [2.4.1](#241)   |
| [3.0.0](#300)   | [2.4.0](#240)   |
|                 | [2.3.8](#238)   |
|                 | [2.3.7](#237)   |
|                 | [2.3.6](#236)   |
|                 | [2.3.5](#235)   |
|                 | [2.3.3](#233)   |
|                 | [2.3.2](#232)   |
|                 | [2.3.1](#231)   |
|                 | [2.3.0](#230)   |
|                 | [2.2.25](#2225) |
|                 | [2.2.24](#2224) |
|                 | [2.2.23](#2223) |
|                 | [2.2.22](#2222) |
|                 | [2.2.21](#2221) |
|                 | [2.2.20](#2220) |
|                 | [2.2.19](#2219) |
|                 | [2.2.18](#2218) |
|                 | [2.2.17](#2217) |
|                 | [2.2.16](#2216) |
|                 | [2.2.15](#2215) |
|                 | [2.2.14](#2214) |
|                 | [2.2.13](#2213) |
|                 | [2.2.12](#2212) |
|                 | [2.2.11](#2211) |
|                 | [2.2.10](#2210) |
|                 | [2.2.9](#229)   |
|                 | [2.2.8](#228)   |
|                 | [2.2.7](#227)   |
|                 | [2.2.6](#226)   |
|                 | [2.2.5](#225)   |
|                 | [2.2.4](#224)   |
|                 | [2.2.3](#223)   |
|                 | [2.2.2](#222)   |
|                 | [2.2.1](#221)   |
|                 | [2.2.0](#220)   |
|                 | [2.1.6](#216)   |
|                 | [2.1.5](#215)   |
|                 | [2.1.4](#214)   |
|                 | [2.1.3](#213)   |
|                 | [2.1.2](#212)   |
|                 | [2.1.1](#211)   |
|                 | [2.1.0](#210)   |
|                 | [2.0.8](#208)   |
</details>

___

## Unreleased (Master Branch)
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.5.0...master)
### Breaking Changes
- Improved schema caching through database real-time hooks. Reduces DB queries, decreases Parse Query execution time and fixes a potential schema memory leak. If multiple Parse Server instances connect to the same DB (for example behind a load balancer), set the [Parse Server Option](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) `databaseOptions.enableSchemaHooks: true` to enable this feature and keep the schema in sync across all instances. Failing to do so will cause a schema change to not propagate to other instances and re-syncing will only happen when these instances restart. The options `enableSingleSchemaCache` and `schemaCacheTTL` have been removed. To use this feature with MongoDB, a replica set cluster with [change stream](https://docs.mongodb.com/manual/changeStreams/#availability) support is required. (Diamond Lewis, SebC) [#7214](https://github.com/parse-community/parse-server/issues/7214)
- Added file upload restriction. File upload is now only allowed for authenticated users by default for improved security. To allow file upload also for Anonymous Users or Public, set the `fileUpload` parameter in the [Parse Server Options](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) (dblythy, Manuel Trezza) [#7071](https://github.com/parse-community/parse-server/pull/7071)
- Removed [parse-server-simple-mailgun-adapter](https://github.com/parse-community/parse-server-simple-mailgun-adapter) dependency; to continue using the adapter it has to be explicitly installed (Manuel Trezza) [#7321](https://github.com/parse-community/parse-server/pull/7321)
- Remove support for MongoDB 3.6 which has reached its End-of-Life date and PostgreSQL 10 (Manuel Trezza) [#7315](https://github.com/parse-community/parse-server/pull/7315)
- Remove support for Node 10 which has reached its End-of-Life date (Manuel Trezza) [#7314](https://github.com/parse-community/parse-server/pull/7314)
- Remove S3 Files Adapter from Parse Server, instead install separately as `@parse/s3-files-adapter` (Manuel Trezza) [#7324](https://github.com/parse-community/parse-server/pull/7324)
### Notable Changes
- Added Parse Server Security Check to report weak security settings (Manuel Trezza, dblythy) [#7247](https://github.com/parse-community/parse-server/issues/7247)
- EXPERIMENTAL: Added new page router with placeholder rendering and localization of custom and feature pages such as password reset and email verification (Manuel Trezza) [#7128](https://github.com/parse-community/parse-server/pull/7128)
- EXPERIMENTAL: Added custom routes to easily customize flows for password reset, email verification or build entirely new flows (Manuel Trezza) [#7231](https://github.com/parse-community/parse-server/pull/7231)
- Added Deprecation Policy to govern the introduction of breaking changes in a phased pattern that is more predictable for developers (Manuel Trezza) [#7199](https://github.com/parse-community/parse-server/pull/7199)
- Add REST API endpoint `/loginAs` to create session of any user with master key; allows to impersonate another user. (GormanFletcher) [#7406](https://github.com/parse-community/parse-server/pull/7406)

### Other Changes
- Fix error when a not yet inserted job is updated (Antonio Davi Macedo Coelho de Castro) [#7196](https://github.com/parse-community/parse-server/pull/7196)
- request.context for afterFind triggers (dblythy) [#7078](https://github.com/parse-community/parse-server/pull/7078)
- Winston Logger interpolating stdout to console (dplewis) [#7114](https://github.com/parse-community/parse-server/pull/7114)
- Move graphql-tag from devDependencies to dependencies (Antonio Davi Macedo Coelho de Castro) [#7183](https://github.com/parse-community/parse-server/pull/7183)
- Added convenience method `Parse.Cloud.sendEmail(...)` to send email via email adapter in Cloud Code (dblythy) [#7089](https://github.com/parse-community/parse-server/pull/7089)
- LiveQuery support for $and, $nor, $containedBy, $geoWithin, $geoIntersects queries (dplewis) [#7113](https://github.com/parse-community/parse-server/pull/7113)
- Supporting patterns in LiveQuery server's config parameter `classNames` (Nes-si) [#7131](https://github.com/parse-community/parse-server/pull/7131)
- Added `requireAnyUserRoles` and `requireAllUserRoles` for Parse Cloud validator (dblythy) [#7097](https://github.com/parse-community/parse-server/pull/7097)
- Support Facebook Limited Login (miguel-s) [#7219](https://github.com/parse-community/parse-server/pull/7219)
- Removed Stage name check on aggregate pipelines (BRETT71) [#7237](https://github.com/parse-community/parse-server/pull/7237)
- Retry transactions on MongoDB when it fails due to transient error (Antonio Davi Macedo Coelho de Castro) [#7187](https://github.com/parse-community/parse-server/pull/7187)
- Bump tests to use Mongo 4.4.4 (Antonio Davi Macedo Coelho de Castro) [#7184](https://github.com/parse-community/parse-server/pull/7184)
- Added new account lockout policy option `accountLockout.unlockOnPasswordReset` to automatically unlock account on password reset (Manuel Trezza) [#7146](https://github.com/parse-community/parse-server/pull/7146)
- Test Parse Server continuously against all recent MongoDB versions that have not reached their end-of-life support date, added MongoDB compatibility table to Parse Server docs (Manuel Trezza) [#7161](https://github.com/parse-community/parse-server/pull/7161)
- Test Parse Server continuously against all recent Node.js versions that have not reached their end-of-life support date, added Node.js compatibility table to Parse Server docs (Manuel Trezza) [7161](https://github.com/parse-community/parse-server/pull/7177)
- Throw error on invalid Cloud Function validation configuration (dblythy) [#7154](https://github.com/parse-community/parse-server/pull/7154)
- Allow Cloud Validator `options` to be async (dblythy) [#7155](https://github.com/parse-community/parse-server/pull/7155)
- Optimize queries on classes with pointer permissions (Pedro Diaz) [#7061](https://github.com/parse-community/parse-server/pull/7061)
- Test Parse Server continuously against all relevant Postgres versions (minor versions), added Postgres compatibility table to Parse Server docs (Corey Baker) [#7176](https://github.com/parse-community/parse-server/pull/7176)
- Catch and return validation error caused by converting ParseObject to JSON after the beforeSave executed successfully [#7192](https://github.com/parse-community/parse-server/pull/7192)
- Randomize test suite (Diamond Lewis) [#7265](https://github.com/parse-community/parse-server/pull/7265)
- LDAP: Properly unbind client on group search error (Diamond Lewis) [#7265](https://github.com/parse-community/parse-server/pull/7265)
- Improve data consistency in Push and Job Status update (Diamond Lewis) [#7267](https://github.com/parse-community/parse-server/pull/7267)
- Excluding keys that have trailing edges.node when performing GraphQL resolver (Chris Bland) [#7273](https://github.com/parse-community/parse-server/pull/7273)
- Added centralized feature deprecation with standardized warning logs (Manuel Trezza) [#7303](https://github.com/parse-community/parse-server/pull/7303)
- Use Node.js 15.13.0 in CI (Olle Jonsson) [#7312](https://github.com/parse-community/parse-server/pull/7312)
- Fix file upload issue for S3 compatible storage (Linode, DigitalOcean) by avoiding empty tags property when creating a file (Ali Oguzhan Yildiz) [#7300](https://github.com/parse-community/parse-server/pull/7300)
- Add building Docker image as CI check (Manuel Trezza) [#7332](https://github.com/parse-community/parse-server/pull/7332)
- Add NPM package-lock version check to CI (Manuel Trezza) [#7333](https://github.com/parse-community/parse-server/pull/7333)
- Fix incorrect LiveQuery events triggered for multiple subscriptions on the same class with different events [#7341](https://github.com/parse-community/parse-server/pull/7341)
- Fix select and excludeKey queries to properly accept JSON string arrays. Also allow nested fields in exclude (Corey Baker) [#7242](https://github.com/parse-community/parse-server/pull/7242)
- Fix LiveQuery server crash when using $all query operator on a missing object key (Jason Posthuma) [#7421](https://github.com/parse-community/parse-server/pull/7421)

___
## 4.5.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.4.0...4.5.0)
### Breaking Changes
- FIX: Consistent casing for afterLiveQueryEvent. The afterLiveQueryEvent was introduced in 4.4.0 with inconsistent casing for the event names, which was fixed in 4.5.0. [#7023](https://github.com/parse-community/parse-server/pull/7023). Thanks to [dblythy](https://github.com/dblythy).
### Other Changes
- FIX: Properly handle serverURL and publicServerUrl in Batch requests. [#7049](https://github.com/parse-community/parse-server/pull/7049). Thanks to [Zach Goldberg](https://github.com/ZachGoldberg).
- IMPROVE: Prevent invalid column names (className and length). [#7053](https://github.com/parse-community/parse-server/pull/7053). Thanks to [Diamond Lewis](https://github.com/dplewis).
- IMPROVE: GraphQL: Remove viewer from logout mutation. [#7029](https://github.com/parse-community/parse-server/pull/7029). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- IMPROVE: GraphQL: Optimize on Relation. [#7044](https://github.com/parse-community/parse-server/pull/7044). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- NEW: Include sessionToken in onLiveQueryEvent. [#7043](https://github.com/parse-community/parse-server/pull/7043). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Definitions for accountLockout and passwordPolicy. [#7040](https://github.com/parse-community/parse-server/pull/7040). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Fix typo in server definitions for emailVerifyTokenReuseIfValid. [#7037](https://github.com/parse-community/parse-server/pull/7037). Thanks to [dblythy](https://github.com/dblythy).
- SECURITY FIX: LDAP auth stores password in plain text. See [GHSA-4w46-w44m-3jq3](https://github.com/parse-community/parse-server/security/advisories/GHSA-4w46-w44m-3jq3) for more details about the vulnerability and [da905a3](https://github.com/parse-community/parse-server/commit/da905a357d062ab4fea727a21eac231acc2ed92a) for the fix. Thanks to [Fabian Strachanski](https://github.com/fastrde).
- NEW: Reuse tokens if they haven't expired. [#7017](https://github.com/parse-community/parse-server/pull/7017). Thanks to [dblythy](https://github.com/dblythy).
- NEW: Add LDAPS-support to LDAP-Authcontroller. [#7014](https://github.com/parse-community/parse-server/pull/7014). Thanks to [Fabian Strachanski](https://github.com/fastrde).
- FIX: (beforeSave/afterSave): Return value instead of Parse.Op for nested fields. [#7005](https://github.com/parse-community/parse-server/pull/7005). Thanks to [Diamond Lewis](https://github.com/dplewis).
- FIX: (beforeSave): Skip Sanitizing Database results. [#7003](https://github.com/parse-community/parse-server/pull/7003). Thanks to [Diamond Lewis](https://github.com/dplewis).
- FIX: Fix includeAll for querying a Pointer and Pointer array. [#7002](https://github.com/parse-community/parse-server/pull/7002). Thanks to [Corey Baker](https://github.com/cbaker6).
- FIX: Add encryptionKey to src/options/index.js. [#6999](https://github.com/parse-community/parse-server/pull/6999). Thanks to [dblythy](https://github.com/dblythy).
- IMPROVE: Update PostgresStorageAdapter.js. [#6989](https://github.com/parse-community/parse-server/pull/6989). Thanks to [Vitaly Tomilov](https://github.com/vitaly-t).

## 4.4.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.3.0...4.4.0)
- IMPROVE: Update PostgresStorageAdapter.js. [#6981](https://github.com/parse-community/parse-server/pull/6981). Thanks to [Vitaly Tomilov](https://github.com/vitaly-t)
- NEW: skipWithMasterKey on Built-In Validator. [#6972](https://github.com/parse-community/parse-server/issues/6972). Thanks to [dblythy](https://github.com/dblythy).
- NEW: Add fileKey rotation to GridFSBucketAdapter. [#6768](https://github.com/parse-community/parse-server/pull/6768). Thanks to [Corey Baker](https://github.com/cbaker6).
- IMPROVE: Remove unused parameter in Cloud Function. [#6969](https://github.com/parse-community/parse-server/issues/6969). Thanks to [Diamond Lewis](https://github.com/dplewis).
- IMPROVE: Validation Handler Update. [#6968](https://github.com/parse-community/parse-server/issues/6968). Thanks to [dblythy](https://github.com/dblythy).
- FIX: (directAccess): Properly handle response status. [#6966](https://github.com/parse-community/parse-server/issues/6966). Thanks to [Diamond Lewis](https://github.com/dplewis).
- FIX: Remove hostnameMaxLen for Mongo URL. [#6693](https://github.com/parse-community/parse-server/issues/6693). Thanks to [markhoward02](https://github.com/markhoward02).
- IMPROVE: Show a message if cloud functions are duplicated. [#6963](https://github.com/parse-community/parse-server/issues/6963). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Pass request.query to afterFind. [#6960](https://github.com/parse-community/parse-server/issues/6960). Thanks to [dblythy](https://github.com/dblythy).
- SECURITY FIX: Patch session vulnerability over Live Query. See [GHSA-2xm2-xj2q-qgpj](https://github.com/parse-community/parse-server/security/advisories/GHSA-2xm2-xj2q-qgpj) for more details about the vulnerability and [78b59fb](https://github.com/parse-community/parse-server/commit/78b59fb26b1c36e3cdbd42ba9fec025003267f58) for the fix. Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo).
- IMPROVE: LiveQueryEvent Error Logging Improvements. [#6951](https://github.com/parse-community/parse-server/issues/6951). Thanks to [dblythy](https://github.com/dblythy).
- IMPROVE: Include stack in Cloud Code. [#6958](https://github.com/parse-community/parse-server/issues/6958). Thanks to [dblythy](https://github.com/dblythy).
- FIX: (jobs): Add Error Message to JobStatus Failure. [#6954](https://github.com/parse-community/parse-server/issues/6954). Thanks to [Diamond Lewis](https://github.com/dplewis).
- NEW: Create Cloud function afterLiveQueryEvent. [#6859](https://github.com/parse-community/parse-server/issues/6859). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Update vkontakte API to the latest version. [#6944](https://github.com/parse-community/parse-server/issues/6944). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo).
- FIX: Use an empty object as default value of options for Google Sign in. [#6844](https://github.com/parse-community/parse-server/issues/6844). Thanks to [Kevin Kuang](https://github.com/kvnkuang).
- FIX: Postgres: prepend className to unique indexes. [#6741](https://github.com/parse-community/parse-server/pull/6741). Thanks to [Corey Baker](https://github.com/cbaker6).
- FIX: GraphQL: Transform input types also on user mutations. [#6934](https://github.com/parse-community/parse-server/pull/6934). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Set objectId into query for Email Validation. [#6930](https://github.com/parse-community/parse-server/pull/6930). Thanks to [Danaru](https://github.com/Danaru87).
- FIX: GraphQL: Optimize queries, fixes some null returns (on object), fix stitched GraphQLUpload. [#6709](https://github.com/parse-community/parse-server/pull/6709). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Do not throw error if user provide a pointer like index onMongo. [#6923](https://github.com/parse-community/parse-server/pull/6923). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Hotfix instagram api. [#6922](https://github.com/parse-community/parse-server/issues/6922). Thanks to [Tim](https://github.com/timination).
- FIX: (directAccess/cloud-code): Pass installationId with LogIn. [#6903](https://github.com/parse-community/parse-server/issues/6903). Thanks to [Diamond Lewis](https://github.com/dplewis).
- FIX: Fix bcrypt binary incompatibility. [#6891](https://github.com/parse-community/parse-server/issues/6891). Thanks to [Manuel Trezza](https://github.com/mtrezza).
- NEW: Keycloak auth adapter. [#6376](https://github.com/parse-community/parse-server/issues/6376). Thanks to [Rhuan](https://github.com/rhuanbarreto).
- IMPROVE: Changed incorrect key name in apple auth adapter tests. [#6861](https://github.com/parse-community/parse-server/issues/6861). Thanks to [Manuel Trezza](https://github.com/mtrezza).
- FIX: Fix mutating beforeSubscribe Query. [#6868](https://github.com/parse-community/parse-server/issues/6868). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Fix beforeLogin for users logging in with AuthData. [#6872](https://github.com/parse-community/parse-server/issues/6872). Thanks to [Kevin Kuang](https://github.com/kvnkuang).
- FIX: Remove Facebook AccountKit auth. [#6870](https://github.com/parse-community/parse-server/issues/6870). Thanks to [Diamond Lewis](https://github.com/dplewis).
- FIX: Updated TOKEN_ISSUER to 'accounts.google.com'. [#6836](https://github.com/parse-community/parse-server/issues/6836). Thanks to [Arjun Vedak](https://github.com/arjun3396).
- IMPROVE: Optimized deletion of class field from schema by using an index if available to do an index scan instead of a collection scan. [#6815](https://github.com/parse-community/parse-server/issues/6815). Thanks to [Manuel Trezza](https://github.com/mtrezza).
- IMPROVE: Enable MongoDB transaction test for MongoDB >= 4.0.4 [#6827](https://github.com/parse-community/parse-server/pull/6827). Thanks to [Manuel](https://github.com/mtrezza).

## 4.3.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.2.0...4.3.0)
- PERFORMANCE: Optimizing pointer CLP query decoration done by DatabaseController#addPointerPermissions [#6747](https://github.com/parse-community/parse-server/pull/6747). Thanks to [mess-lelouch](https://github.com/mess-lelouch).
- SECURITY: Fix security breach on GraphQL viewer [78239ac](https://github.com/parse-community/parse-server/commit/78239ac9071167fdf243c55ae4bc9a2c0b0d89aa), [security advisory](https://github.com/parse-community/parse-server/security/advisories/GHSA-236h-rqv8-8q73). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Save context not present if direct access enabled [#6764](https://github.com/parse-community/parse-server/pull/6764). Thanks to [Omair Vaiyani](https://github.com/omairvaiyani).
- NEW: Before Connect + Before Subscribe [#6793](https://github.com/parse-community/parse-server/pull/6793). Thanks to [dblythy](https://github.com/dblythy).
- FIX: Add version to playground to fix CDN [#6804](https://github.com/parse-community/parse-server/pull/6804). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- NEW (EXPERIMENTAL): Idempotency enforcement for client requests. This deduplicates requests where the client intends to send one request to Parse Server but due to network issues the server receives the request multiple times. **Caution, this is an experimental feature that may not be appropriate for production.** [#6748](https://github.com/parse-community/parse-server/issues/6748). Thanks to [Manuel Trezza](https://github.com/mtrezza).
- FIX: Add production Google Auth Adapter instead of using the development url [#6734](https://github.com/parse-community/parse-server/pull/6734). Thanks to [SebC.](https://github.com/SebC99).
- IMPROVE: Run Prettier JS Again Without requiring () on arrow functions [#6796](https://github.com/parse-community/parse-server/pull/6796). Thanks to [Diamond Lewis](https://github.com/dplewis).
- IMPROVE: Run Prettier JS [#6795](https://github.com/parse-community/parse-server/pull/6795). Thanks to [Diamond Lewis](https://github.com/dplewis).
- IMPROVE: Replace bcrypt with @node-rs/bcrypt [#6794](https://github.com/parse-community/parse-server/pull/6794). Thanks to [LongYinan](https://github.com/Brooooooklyn).
- IMPROVE: Make clear description of anonymous user [#6655](https://github.com/parse-community/parse-server/pull/6655). Thanks to [Jerome De Leon](https://github.com/JeromeDeLeon).
- IMPROVE: Simplify GraphQL merge system to avoid js ref bugs [#6791](https://github.com/parse-community/parse-server/pull/6791). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- NEW: Pass context in beforeDelete, afterDelete, beforeFind and Parse.Cloud.run [#6666](https://github.com/parse-community/parse-server/pull/6666). Thanks to [yog27ray](https://github.com/yog27ray).
- NEW: Allow passing custom gql schema function to ParseServer#start options [#6762](https://github.com/parse-community/parse-server/pull/6762). Thanks to [Luca](https://github.com/lucatk).
- NEW: Allow custom cors origin header [#6772](https://github.com/parse-community/parse-server/pull/6772). Thanks to [Kevin Yao](https://github.com/kzmeyao).
- FIX: Fix context for cascade-saving and saving existing object [#6735](https://github.com/parse-community/parse-server/pull/6735). Thanks to [Manuel](https://github.com/mtrezza).
- NEW: Add file bucket encryption using fileKey [#6765](https://github.com/parse-community/parse-server/pull/6765). Thanks to [Corey Baker](https://github.com/cbaker6).
- FIX: Removed gaze from dev dependencies and removed not working dev script [#6745](https://github.com/parse-community/parse-server/pull/6745). Thanks to [Vincent Semrau](https://github.com/vince1995).
- IMPROVE: Upgrade graphql-tools to v6 [#6701](https://github.com/parse-community/parse-server/pull/6701). Thanks to [Yaacov Rydzinski](https://github.com/yaacovCR).
- NEW: Support Metadata in GridFSAdapter [#6660](https://github.com/parse-community/parse-server/pull/6660). Thanks to [Diamond Lewis](https://github.com/dplewis).
- NEW: Allow to unset file from graphql [#6651](https://github.com/parse-community/parse-server/pull/6651). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- NEW: Handle shutdown for RedisCacheAdapter [#6658](https://github.com/parse-community/parse-server/pull/6658). Thanks to [promisenxu](https://github.com/promisenxu).
- FIX: Fix explain on user class [#6650](https://github.com/parse-community/parse-server/pull/6650). Thanks to [Manuel](https://github.com/mtrezza).
- FIX: Fix read preference for aggregate [#6585](https://github.com/parse-community/parse-server/pull/6585). Thanks to [Manuel](https://github.com/mtrezza).
- NEW: Add context to Parse.Object.save [#6626](https://github.com/parse-community/parse-server/pull/6626). Thanks to [Manuel](https://github.com/mtrezza).
- NEW: Adding ssl config params to Postgres URI [#6580](https://github.com/parse-community/parse-server/pull/6580). Thanks to [Corey Baker](https://github.com/cbaker6).
- FIX: Travis postgres update: removing unnecessary start of mongo-runner [#6594](https://github.com/parse-community/parse-server/pull/6594). Thanks to [Corey Baker](https://github.com/cbaker6).
- FIX: ObjectId size for Pointer in Postgres [#6619](https://github.com/parse-community/parse-server/pull/6619). Thanks to [Corey Baker](https://github.com/cbaker6).
- IMPROVE: Improve a test case [#6629](https://github.com/parse-community/parse-server/pull/6629). Thanks to [Gordon Sun](https://github.com/sunshineo).
- NEW: Allow to resolve automatically Parse Type fields from Custom Schema [#6562](https://github.com/parse-community/parse-server/pull/6562). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Remove wrong console log in test [#6627](https://github.com/parse-community/parse-server/pull/6627). Thanks to [Gordon Sun](https://github.com/sunshineo).
- IMPROVE: Graphql tools v5 [#6611](https://github.com/parse-community/parse-server/pull/6611). Thanks to [Yaacov Rydzinski](https://github.com/yaacovCR).
- FIX: Catch JSON.parse and return 403 properly [#6589](https://github.com/parse-community/parse-server/pull/6589). Thanks to [Gordon Sun](https://github.com/sunshineo).
- PERFORMANCE: Allow covering relation queries with minimal index [#6581](https://github.com/parse-community/parse-server/pull/6581). Thanks to [Noah Silas](https://github.com/noahsilas).
- FIX: Fix Postgres group aggregation [#6522](https://github.com/parse-community/parse-server/pull/6522). Thanks to [Siddharth Ramesh](https://github.com/srameshr).
- NEW: Allow set user mapped from JWT directly on request [#6411](https://github.com/parse-community/parse-server/pull/6411). Thanks to [Gordon Sun](https://github.com/sunshineo).

## 4.2.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.1.0...4.2.0)

__BREAKING CHANGES:__
- CHANGE: The Sign-In with Apple authentication adapter parameter `client_id` has been changed to `clientId`. If using the Apple authentication adapter, this change requires to update the Parse Server configuration accordingly. See [#6523](https://github.com/parse-community/parse-server/pull/6523) for details.
___
- UPGRADE: Parse JS SDK to 2.12.0 [#6548](https://github.com/parse-community/parse-server/pull/6548)
- NEW: Support Group aggregation on multiple columns for Postgres [#6483](https://github.com/parse-community/parse-server/pull/6483). Thanks to [Siddharth Ramesh](https://github.com/srameshr).
- FIX: Improve test reliability by instructing Travis to only install one version of Postgres [#6490](https://github.com/parse-community/parse-server/pull/6490). Thanks to
[Corey Baker](https://github.com/cbaker6).
- FIX: Unknown type bug on overloaded types [#6494](https://github.com/parse-community/parse-server/pull/6494). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Improve reliability of 'SignIn with AppleID' [#6416](https://github.com/parse-community/parse-server/pull/6416). Thanks to [Andy King](https://github.com/andrewking0207).
- FIX: Improve Travis reliability by separating Postgres & Mongo scripts [#6505](https://github.com/parse-community/parse-server/pull/6505). Thanks to
[Corey Baker](https://github.com/cbaker6).
- NEW: Apple SignIn support for multiple IDs [#6523](https://github.com/parse-community/parse-server/pull/6523). Thanks to [UnderratedDev](https://github.com/UnderratedDev).
- NEW: Add support for new Instagram API [#6398](https://github.com/parse-community/parse-server/pull/6398). Thanks to [Maravilho Singa](https://github.com/maravilhosinga).
- FIX: Updating Postgres/Postgis Call and Postgis to 3.0 [#6528](https://github.com/parse-community/parse-server/pull/6528). Thanks to
[Corey Baker](https://github.com/cbaker6).
- FIX: enableExpressErrorHandler logic [#6423](https://github.com/parse-community/parse-server/pull/6423). Thanks to [Nikolay Andryukhin](https://github.com/hybeats).
- FIX: Change Order Enum Strategy for GraphQL [#6515](https://github.com/parse-community/parse-server/pull/6515). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Switch ACL to Relay Global Id for GraphQL [#6495](https://github.com/parse-community/parse-server/pull/6495). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Handle keys for pointer fields properly for GraphQL [#6499](https://github.com/parse-community/parse-server/pull/6499). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: GraphQL file mutation [#6507](https://github.com/parse-community/parse-server/pull/6507). Thanks to [Antoine Cormouls](https://github.com/Moumouls).
- FIX: Aggregate geoNear with date query [#6540](https://github.com/parse-community/parse-server/pull/6540). Thanks to [Manuel](https://github.com/mtrezza).
- NEW: Add file triggers and file meta data [#6344](https://github.com/parse-community/parse-server/pull/6344). Thanks to [stevestencil](https://github.com/stevestencil).
- FIX: Improve local testing of postgres [#6531](https://github.com/parse-community/parse-server/pull/6531). Thanks to
[Corey Baker](https://github.com/cbaker6).
- NEW: Case insensitive username and email indexing and query planning for Postgres [#6506](https://github.com/parse-community/parse-server/issues/6441). Thanks to
[Corey Baker](https://github.com/cbaker6).

## 4.1.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.0.2...4.1.0)

_SECURITY RELEASE_: see [advisory](https://github.com/parse-community/parse-server/security/advisories/GHSA-h4mf-75hf-67w4) for details
- SECURITY FIX: Patch Regex vulnerabilities. See [3a3a5ee](https://github.com/parse-community/parse-server/commit/3a3a5eee5ffa48da1352423312cb767de14de269). Special thanks to [W0lfw00d](https://github.com/W0lfw00d) for identifying and [responsibly reporting](https://github.com/parse-community/parse-server/blob/master/SECURITY.md) the vulnerability. Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo) for the speedy fix.

## 4.0.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.0.1...4.0.2)

__BREAKING CHANGES:__
1. Remove Support for Mongo 3.2 & 3.4. The new minimum supported version is Mongo 3.6.
2. Change username and email validation to be case insensitive. This change should be transparent in most use cases. The validation behavior should now behave 'as expected'. See [#5634](https://github.com/parse-community/parse-server/pull/5634) for details.

> __Special Note on Upgrading to Parse Server 4.0.0 and above__
>
> In addition to the breaking changes noted above, [#5634](https://github.com/parse-community/parse-server/pull/5634) introduces a two new case insensitive indexes on the `User` collection. Special care should be taken when upgrading to this version to ensure that:
>
> 1. The new indexes can be successfully created (see issue [#6465](https://github.com/parse-community/parse-server/issues/6465) for details on a potential issue for your installation).
>
> 2. Care is taken ensure that there is adequate compute capacity to create the index in the background while still servicing requests.

- FIX: attempt to get travis to deploy to npmjs again. See [#6475](https://github.com/parse-community/parse-server/pull/6457). Thanks to [Arthur Cinader](https://github.com/acinader).

## 4.0.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/4.0.0...4.0.1)
- FIX: correct 'new' travis config to properly deploy.  See [#6452](https://github.com/parse-community/parse-server/pull/6452). Thanks to [Arthur Cinader](https://github.com/acinader).
- FIX: Better message on not allowed to protect default fields. See [#6439](https://github.com/parse-community/parse-server/pull/6439).Thanks to [Old Grandpa](https://github.com/BufferUnderflower)

## 4.0.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.10.0...4.0.0)

> __Special Note on Upgrading to Parse Server 4.0.0 and above__
>
> In addition to the breaking changes noted below, [#5634](https://github.com/parse-community/parse-server/pull/5634) introduces a two new case insensitive indexes on the `User` collection. Special care should be taken when upgrading to this version to ensure that:
>
> 1. The new indexes can be successfully created (see issue [#6465](https://github.com/parse-community/parse-server/issues/6465) for details on a potential issue for your installation).
>
> 2. Care is taken ensure that there is adequate compute capacity to create the index in the background while still servicing requests.

- NEW: add hint option to Parse.Query [#6322](https://github.com/parse-community/parse-server/pull/6322). Thanks to [Steve Stencil](https://github.com/stevestencil)
- FIX: CLP objectId size validation fix [#6332](https://github.com/parse-community/parse-server/pull/6332). Thanks to [Old Grandpa](https://github.com/BufferUnderflower)
- FIX: Add volumes to Docker command [#6356](https://github.com/parse-community/parse-server/pull/6356). Thanks to [Kasra Bigdeli](https://github.com/githubsaturn)
- NEW: GraphQL 3rd Party LoginWith Support [#6371](https://github.com/parse-community/parse-server/pull/6371). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- FIX: GraphQL Geo Queries [#6363](https://github.com/parse-community/parse-server/pull/6363). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: GraphQL Nested File Upload [#6372](https://github.com/parse-community/parse-server/pull/6372). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: Granular CLP pointer permissions [#6352](https://github.com/parse-community/parse-server/pull/6352). Thanks to [Old Grandpa](https://github.com/BufferUnderflower)
- FIX: Add missing colon for customPages [#6393](https://github.com/parse-community/parse-server/pull/6393). Thanks to [Jerome De Leon](https://github.com/JeromeDeLeon)
- NEW: `afterLogin` cloud code hook [#6387](https://github.com/parse-community/parse-server/pull/6387). Thanks to [David Corona](https://github.com/davesters)
- FIX: __BREAKING CHANGE__ Prevent new usernames or emails that clash with existing users' email or username if it only differs by case.  For example, don't allow a new user with the name 'Jane' if we already have a user 'jane'. [#5634](https://github.com/parse-community/parse-server/pull/5634). Thanks to [Arthur Cinader](https://github.com/acinader)
- FIX: Support Travis CI V2. [#6414](https://github.com/parse-community/parse-server/pull/6414). Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: Prevent crashing on websocket error. [#6418](https://github.com/parse-community/parse-server/pull/6418). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Allow protectedFields for Authenticated users and Public. [$6415](https://github.com/parse-community/parse-server/pull/6415). Thanks to [Old Grandpa](https://github.com/BufferUnderflower)
- FIX: Correct bug in determining GraphQL pointer errors when mutating. [#6413](https://github.com/parse-community/parse-server/pull/6431). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: Allow true GraphQL Schema Customization. [#6360](https://github.com/parse-community/parse-server/pull/6360). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- __BREAKING CHANGE__: Remove Support for Mongo version < 3.6 [#6445](https://github.com/parse-community/parse-server/pull/6445). Thanks to [Arthur Cinader](https://github.com/acinader)

## 3.10.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.9.0...3.10.0)
- FIX: correct and cover ordering queries in GraphQL [#6316](https://github.com/parse-community/parse-server/pull/6316).  Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: GraphQL support for reset password email [#6301](https://github.com/parse-community/parse-server/pull/6301). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- FIX: Add default limit to GraphQL fetch [#6304](https://github.com/parse-community/parse-server/pull/6304). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- DOCS: use bash syntax highlighting [#6302](https://github.com/parse-community/parse-server/pull/6302). Thanks to [Jerome De Leon](https://github.com/JeromeDeLeon)
- NEW: Add max log file option [#6296](https://github.com/parse-community/parse-server/pull/6296). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: support user supplied objectId [#6101](https://github.com/parse-community/parse-server/pull/6101). Thanks to [Ruhan](https://github.com/rhuanbarretos)
- FIX: Add missing encodeURIComponent on username [#6278](https://github.com/parse-community/parse-server/pull/6278). Thanks to [Christopher Brookes](https://github.com/Klaitos)
- NEW: update  PostgresStorageAdapter.js to use async/await [#6275](https://github.com/parse-community/parse-server/pull/6275). Thanks to [Vitaly Tomilov](https://github.com/vitaly-t)
- NEW: Support required fields on output type for GraphQL [#6279](https://github.com/parse-community/parse-server/pull/6279). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: Support required fields for GraphQL [#6271](https://github.com/parse-community/parse-server/pull/6279). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- CHANGE: use mongodb 3.3.5 [#6263](https://github.com/parse-community/parse-server/pull/6263). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: GraphQL: DX Relational Where Query [#6255](https://github.com/parse-community/parse-server/pull/6255). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- CHANGE: test against Postgres 11 [#6260](https://github.com/parse-community/parse-server/pull/6260). Thanks to [Diamond Lewis](https://github.com/dplewis)
- CHANGE: test against Postgres 11 [#6260](https://github.com/parse-community/parse-server/pull/6260). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: GraphQL alias for mutations in classConfigs [#6258](https://github.com/parse-community/parse-server/pull/6258). Thanks to [Old Grandpa](https://github.com/BufferUnderflower)
- NEW: GraphQL classConfig query alias [#6257](https://github.com/parse-community/parse-server/pull/6257). Thanks to [Old Grandpa](https://github.com/BufferUnderflower)
- NEW: Allow validateFilename to return a string or Parse Error [#6246](https://github.com/parse-community/parse-server/pull/6246). Thanks to [Mike Patnode](https://github.com/mpatnode)
- NEW: Relay Spec [#6089](https://github.com/parse-community/parse-server/pull/6089). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- CHANGE: Set default ACL for GraphQL [#6249](https://github.com/parse-community/parse-server/pull/6249). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: LDAP auth Adapter [#6226](https://github.com/parse-community/parse-server/pull/6226). Thanks to [Julian Dax](https://github.com/brodo)
- FIX: improve beforeFind to include Query info [#6237](https://github.com/parse-community/parse-server/pull/6237). Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: improve websocket error handling [#6230](https://github.com/parse-community/parse-server/pull/6230). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: addition of an afterLogout trigger [#6217](https://github.com/parse-community/parse-server/pull/6217). Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: Initialize default logger [#6186](https://github.com/parse-community/parse-server/pull/6186). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Add funding link [#6192](https://github.com/parse-community/parse-server/pull/6192 ). Thanks to [Tom Fox](https://github.com/TomWFox)
- FIX: installationId on LiveQuery connect [#6180](https://github.com/parse-community/parse-server/pull/6180). Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Add exposing port in docker container [#6165](https://github.com/parse-community/parse-server/pull/6165). Thanks to [Priyash Patil](https://github.com/priyashpatil)
- NEW: Support Google Play Games Service [#6147](https://github.com/parse-community/parse-server/pull/6147). Thanks to [Diamond Lewis](https://github.com/dplewis)
- DOC: Throw error when setting authData to null [#6154](https://github.com/parse-community/parse-server/pull/6154). Thanks to [Manuel](https://github.com/mtrezza)
- CHANGE: Move filename validation out of the Router and into the FilesAdaptor [#6157](https://github.com/parse-community/parse-server/pull/6157). Thanks to [Mike Patnode](https://github.com/mpatnode)
- NEW: Added warning for special URL sensitive characters for appId [#6159](https://github.com/parse-community/parse-server/pull/6159). Thanks to [Saimoom Safayet Akash](https://github.com/saimoomsafayet)
- NEW: Support Apple Game Center Auth [#6143](https://github.com/parse-community/parse-server/pull/6143). Thanks to [Diamond Lewis](https://github.com/dplewis)
- CHANGE: test with Node 12 [#6133](https://github.com/parse-community/parse-server/pull/6133). Thanks to [Arthur Cinader](https://github.com/acinader)
- FIX: prevent after find from firing when saving objects [#6127](https://github.com/parse-community/parse-server/pull/6127). Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: GraphQL Mutations not returning updated information [6130](https://github.com/parse-community/parse-server/pull/6130). Thanks to [Omair Vaiyani](https://github.com/omairvaiyani)
- CHANGE: Cleanup Schema cache per request [#6216](https://github.com/parse-community/parse-server/pull/6216). Thanks to [Diamond Lewis](https://github.com/dplewis)
- DOC: Improve installation instructions [#6120](https://github.com/parse-community/parse-server/pull/6120). Thanks to [Andres Galante](https://github.com/andresgalante)
- DOC: add code formatting to contributing guidelines [#6119](https://github.com/parse-community/parse-server/pull/6119). Thanks to [Andres Galante](https://github.com/andresgalante)
- NEW: Add GraphQL ACL Type + Input [#5957](https://github.com/parse-community/parse-server/pull/5957). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- CHANGE: replace public key [#6099](https://github.com/parse-community/parse-server/pull/6099). Thanks to [Arthur Cinader](https://github.com/acinader)
- NEW: Support microsoft authentication in GraphQL [#6051](https://github.com/parse-community/parse-server/pull/6051). Thanks to [Alann Maulana](https://github.com/alann-maulana)
- NEW: Install parse-server 3.9.0 instead of 2.2 [#6069](https://github.com/parse-community/parse-server/pull/6069). Thanks to [Julian Dax](https://github.com/brodo)
- NEW: Use #!/bin/bash instead of #!/bin/sh [#6062](https://github.com/parse-community/parse-server/pull/6062). Thanks to [Julian Dax](https://github.com/brodo)
- DOC: Update GraphQL readme section [#6030](https://github.com/parse-community/parse-server/pull/6030). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)

## 3.9.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.8.0...3.9.0)
- NEW: Add allowHeaders to Options [#6044](https://github.com/parse-community/parse-server/pull/6044). Thanks to [Omair Vaiyani](https://github.com/omairvaiyani)
- CHANGE: Introduce ReadOptionsInput to GraphQL API [#6030](https://github.com/parse-community/parse-server/pull/6030). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Stream video with GridFSBucketAdapter (implements byte-range requests) [#6028](https://github.com/parse-community/parse-server/pull/6028). Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: Aggregate not matching null values [#6043](https://github.com/parse-community/parse-server/pull/6043). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- CHANGE: Improve callCloudCode mutation to receive a CloudCodeFunction enum instead of a String in the GraphQL API [#6029](https://github.com/parse-community/parse-server/pull/6029). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- TEST: Add more tests to transactions [#6022](https://github.com/parse-community/parse-server/pull/6022). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- CHANGE: Pointer constraint input type as ID in the GraphQL API [#6020](https://github.com/parse-community/parse-server/pull/6020). Thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- CHANGE: Remove underline from operators of the GraphQL API [#6024](https://github.com/parse-community/parse-server/pull/6024). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Make method async as expected in usage [#6025](https://github.com/parse-community/parse-server/pull/6025). Thanks to [Omair Vaiyani](https://github.com/omairvaiyani)
- DOC: Added breaking change note to 3.8 release [#6023](https://github.com/parse-community/parse-server/pull/6023). Thanks to [Manuel](https://github.com/mtrezza)
- NEW: Added support for line auth [#6007](https://github.com/parse-community/parse-server/pull/6007). Thanks to [Saimoom Safayet Akash](https://github.com/saimoomsafayet)
- FIX: Fix aggregate group id [#5994](https://github.com/parse-community/parse-server/pull/5994). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- CHANGE: Schema operations instead of generic operations in the GraphQL API [#5993](https://github.com/parse-community/parse-server/pull/5993). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- DOC: Fix changelog formatting[#6009](https://github.com/parse-community/parse-server/pull/6009). Thanks to [Tom Fox](https://github.com/TomWFox)
- CHANGE: Rename objectId to id in the GraphQL API [#5985](https://github.com/parse-community/parse-server/pull/5985). Thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- FIX: Fix beforeLogin trigger when user has a file [#6001](https://github.com/parse-community/parse-server/pull/6001). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- DOC: Update GraphQL Docs with the latest changes [#5980](https://github.com/parse-community/parse-server/pull/5980). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)

## 3.8.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.7.2...3.8.0)
- NEW:  Protected fields pointer-permissions support [#5951](https://github.com/parse-community/parse-server/pull/5951).  Thanks to [Dobbias Nan](https://github.com/Dobbias)
- NEW: GraphQL DX: Relation/Pointer [#5946](https://github.com/parse-community/parse-server/pull/5946).  Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: Master Key Only Config Properties [#5953](https://github.com/parse-community/parse-server/pull/5954). Thanks to [Manuel](https://github.com/mtrezza)
- FIX: Better validation when creating a Relation fields [#5922](https://github.com/parse-community/parse-server/pull/5922).  Thanks to [Lucas Alencar](https://github.com/alencarlucas)
- NEW: enable GraphQL file upload [#5944](https://github.com/parse-community/parse-server/pull/5944). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Handle shutdown on grid adapters  [#5943](https://github.com/parse-community/parse-server/pull/5943).  Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Fix GraphQL max upload size [#5940](https://github.com/parse-community/parse-server/pull/5940). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Remove Buffer() deprecation notice [#5942](https://github.com/parse-community/parse-server/pull/5942).  Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Remove MongoDB unified topology deprecation notice from the grid adapter [#5941](https://github.com/parse-community/parse-server/pull/5941).  Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: add callback for serverCloseComplete [#5937](https://github.com/parse-community/parse-server/pull/5937). Thanks to [Diamond Lewis](https://github.com/dplewis)
- DOCS: Add Cloud Code guide to README [#5936](https://github.com/parse-community/parse-server/pull/5936).  Thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Remove nested operations from GraphQL API [#5931](https://github.com/parse-community/parse-server/pull/5931).  Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Improve Live Query Monitoring [#5927](https://github.com/parse-community/parse-server/pull/5927).  Thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: GraphQL: Fix undefined Array [#5296](https://github.com/parse-community/parse-server/pull/5926). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- NEW: Added array support for pointer-permissions [#5921](https://github.com/parse-community/parse-server/pull/5921).  Thanks to [Dobbias Nan](https://github.com/Dobbias)
- GraphQL: Renaming Types/Inputs [#5921](https://github.com/parse-community/parse-server/pull/5921). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- FIX: Lint no-prototype-builtins [#5920](https://github.com/parse-community/parse-server/pull/5920). Thanks to [Diamond Lewis](https://github.com/dplewis)
- GraphQL: Inline Fragment on Array Fields [#5908](https://github.com/parse-community/parse-server/pull/5908). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- DOCS: Add instructions to launch a compatible Docker Postgres [](). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- Fix: Undefined dot notation in matchKeyInQuery [#5917](https://github.com/parse-community/parse-server/pull/5917). Thanks to [Diamond Lewis](https://github.com/dplewis)
- Fix: Logger print JSON and Numbers [#5916](https://github.com/parse-community/parse-server/pull/5916). Thanks to [Diamond Lewis](https://github.com/dplewis)
- GraphQL: Return specific Type on specific Mutation [#5893](https://github.com/parse-community/parse-server/pull/5893). Thanks to [Antoine Cormouls](https://github.com/Moumouls)
- FIX: Apple sign-in authAdapter [#5891](https://github.com/parse-community/parse-server/pull/5891). Thanks to [SebC](https://github.com/SebC99).
- DOCS: Add GraphQL beta notice [#5886](https://github.com/parse-community/parse-server/pull/5886). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- GraphQL: Remove "password" output field from _User class [#5889](https://github.com/parse-community/parse-server/pull/5889). Thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- GraphQL: Object constraints [#5715](https://github.com/parse-community/parse-server/pull/5715). Thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- DOCS: README top section overhaul + add sponsors [#5876](https://github.com/parse-community/parse-server/pull/5876). Thanks to [Tom Fox](https://github.com/TomWFox)
- FIX: Return a Promise from classUpdate method [#5877](https://github.com/parse-community/parse-server/pull/5877). Thanks to [Lucas Alencar](https://github.com/alencarlucas)
- FIX: Use UTC Month in aggregate tests [#5879](https://github.com/parse-community/parse-server/pull/5879). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Transaction was aborting before all promises have either resolved or rejected [#5878](https://github.com/parse-community/parse-server/pull/5878). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Use transactions for batch operation [#5849](https://github.com/parse-community/parse-server/pull/5849). Thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)

### Breaking Changes
- If you are running Parse Server on top of a MongoDB deployment which does not fit the [Retryable Writes Requirements](https://docs.mongodb.com/manual/core/retryable-writes/#prerequisites), you will have to add `retryWrites=false` to your connection string in order to upgrade to Parse Server 3.8.

## 3.7.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.7.1...3.7.2)

- FIX: Live Query was failing on release 3.7.1

## 3.7.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.7.0...3.7.1)

- FIX: Missing APN module
- FIX: Set falsy values as default to schema fields [#5868](https://github.com/parse-community/parse-server/pull/5868), thanks to [Lucas Alencar](https://github.com/alencarlucas)
- NEW: Implement WebSocketServer Adapter [#5866](https://github.com/parse-community/parse-server/pull/5866), thanks to [Diamond Lewis](https://github.com/dplewis)

## 3.7.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.6.0...3.7.0)

- FIX: Prevent linkWith sessionToken from generating new session [#5801](https://github.com/parse-community/parse-server/pull/5801), thanks to [Diamond Lewis](https://github.com/dplewis)
- GraphQL: Improve session token error messages [#5753](https://github.com/parse-community/parse-server/pull/5753), thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- NEW: GraphQL { functions { call } } generic mutation [#5818](https://github.com/parse-community/parse-server/pull/5818), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: GraphQL Custom Schema [#5821](https://github.com/parse-community/parse-server/pull/5821), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: GraphQL custom schema on CLI [#5828](https://github.com/parse-community/parse-server/pull/5828), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: GraphQL @mock directive [#5836](https://github.com/parse-community/parse-server/pull/5836), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: GraphQL _or operator not working [#5840](https://github.com/parse-community/parse-server/pull/5840), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Add "count" to CLP initial value [#5841](https://github.com/parse-community/parse-server/pull/5841), thanks to [Douglas Muraoka](https://github.com/douglasmuraoka)
- NEW: Add ability to alter the response from the after save trigger [#5814](https://github.com/parse-community/parse-server/pull/5814), thanks to [BrunoMaurice](https://github.com/brunoMaurice)
- FIX: Cache apple public key for the case it fails to fetch again [#5848](https://github.com/parse-community/parse-server/pull/5848), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: GraphQL Configuration Options [#5782](https://github.com/parse-community/parse-server/pull/5782), thanks to [Omair Vaiyani](https://github.com/omairvaiyani)
- NEW: Required fields and default values [#5835](https://github.com/parse-community/parse-server/pull/5835), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Postgres safely escape strings in nested objects [#5855](https://github.com/parse-community/parse-server/pull/5855), thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Support PhantAuth authentication [#5850](https://github.com/parse-community/parse-server/pull/5850), thanks to [Ivan SZKIBA](https://github.com/szkiba)
- FIX: Remove uws package [#5860](https://github.com/parse-community/parse-server/pull/5860), thanks to [Zeal Murapa](https://github.com/GoGross)

## 3.6.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.5.0...3.6.0)

- SECURITY FIX: Address [Security Advisory](https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5) of a potential [Enumeration Attack](https://www.owasp.org/index.php/Testing_for_User_Enumeration_and_Guessable_User_Account_(OWASP-AT-002)#Description_of_the_Issue) [73b0f9a](https://github.com/parse-community/parse-server/commit/73b0f9a339b81f5d757725dc557955a7b670a3ec), big thanks to [Fabian Strachanski](https://github.com/fastrde) for identifying the problem, creating a fix and following the [vulnerability disclosure guidelines](https://github.com/parse-community/parse-server/blob/master/SECURITY.md#parse-community-vulnerability-disclosure-program)
- NEW: Added rest option: excludeKeys [#5737](https://github.com/parse-community/parse-server/pull/5737), thanks to [Raschid J.F. Rafeally](https://github.com/RaschidJFR)
- FIX: LiveQuery create event with fields [#5790](https://github.com/parse-community/parse-server/pull/5790), thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: Generate sessionToken with linkWith [#5799](https://github.com/parse-community/parse-server/pull/5799), thanks to [Diamond Lewis](https://github.com/dplewis)

## 3.5.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.4.4...3.5.0)

- NEW: GraphQL Support [#5674](https://github.com/parse-community/parse-server/pull/5674), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)

[GraphQL Guide](https://github.com/parse-community/parse-server#graphql)

- NEW: Sign in with Apple [#5694](https://github.com/parse-community/parse-server/pull/5694), thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: AppSecret to Facebook Auth [#5695](https://github.com/parse-community/parse-server/pull/5695), thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Postgres: Regex support foreign characters [#5598](https://github.com/parse-community/parse-server/pull/5598), thanks to [Jeff Gu Kang](https://github.com/JeffGuKang)
- FIX: Winston Logger string interpolation [#5729](https://github.com/parse-community/parse-server/pull/5729), thanks to [Diamond Lewis](https://github.com/dplewis)

## 3.4.4
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.4.3...3.4.4)

Fix: Commit changes

## 3.4.3
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.4.2...3.4.3)

Fix: Use changes in master to travis configuration to enable pushing to npm and gh_pages.  See diff for details.

## 3.4.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.4.1...3.4.2)

Fix: In my haste to get a [Security Fix](https://github.com/parse-community/parse-server/security/advisories/GHSA-2479-qvv7-47qq) out, I added [8709daf](https://github.com/parse-community/parse-server/commit/8709daf698ea69b59268cb66f0f7cee75b52daa5) to master instead of to 3.4.1.  This commit fixes that.  [Arthur Cinader](https://github.com/acinader)

## 3.4.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.4.0...3.4.1)

Security Fix: see Advisory: [GHSA-2479-qvv7-47q](https://github.com/parse-community/parse-server/security/advisories/GHSA-2479-qvv7-47qq) for details [8709daf](https://github.com/parse-community/parse-server/commit/8709daf698ea69b59268cb66f0f7cee75b52daa5). Big thanks to: [Benjamin Simonsson](https://github.com/BenniPlejd) for identifying the issue and promptly bringing it to the Parse Community's attention and also big thanks to the indefatigable [Diamond Lewis](https://github.com/dplewis) for crafting a failing test and then a solution within an hour of the report.

## 3.4.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.3.0...3.4.0)
- NEW: Aggregate supports group by date fields [#5538](https://github.com/parse-community/parse-server/pull/5538) thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: API for Read Preferences [#3963](https://github.com/parse-community/parse-server/pull/3963) thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- NEW: Add Redis options for LiveQuery [#5584](https://github.com/parse-community/parse-server/pull/5584) thanks to [Diamond Lewis](https://github.com/dplewis)
- NEW: Add Direct Access option for Server Config [#5550](https://github.com/parse-community/parse-server/pull/5550) thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: updating mixed array in Postgres [#5552](https://github.com/parse-community/parse-server/pull/5552) thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: notEqualTo GeoPoint Query in Postgres [#5549](https://github.com/parse-community/parse-server/pull/5549), thanks to [Diamond Lewis](https://github.com/dplewis)
- FIX: put the timestamp back in logs that was lost after Winston upgrade [#5571](https://github.com/parse-community/parse-server/pull/5571), thanks to [Steven Rowe](https://github.com/mrowe009) and [Arthur Cinader](https://github.com/acinader)
- FIX: Validates permission before calling beforeSave [#5546](https://github.com/parse-community/parse-server/pull/5546), thanks to [Antonio Davi Macedo Coelho de Castro](https://github.com/davimacedo)
- FIX: Remove userSensitiveFields default value. [#5588](https://github.com/parse-community/parse-server/pull/5588), thanks to [William George](https://github.com/awgeorge)
- FIX: Decode Date JSON value in LiveQuery. [#5540](https://github.com/parse-community/parse-server/pull/5540), thanks to [ananfang](https://github.com/ananfang)


## 3.3.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.2.3...3.3.0)
- NEW: beforeLogin trigger with support for auth providers ([#5445](https://github.com/parse-community/parse-server/pull/5445)), thanks to [Omair Vaiyani](https://github.com/omairvaiyani)
- NEW: RFC 7662 compliant OAuth2 auth adapter ([#4910](https://github.com/parse-community/parse-server/pull/4910)), thanks to [Müller Zsolt](https://github.com/zsmuller)
- FIX: cannot change password when maxPasswordHistory is 1 ([#5191](https://github.com/parse-community/parse-server/pull/5191)), thanks to [Tulsi Sapkota](https://github.com/Tolsee)
- FIX (Postgres): count being very slow on large Parse Classes' collections ([#5330](https://github.com/parse-community/parse-server/pull/5330)), thanks to [CoderickLamar](https://github.com/CoderickLamar)
- FIX: using per-key basis queue ([#5420](https://github.com/parse-community/parse-server/pull/5420)), thanks to [Georges Jamous](https://github.com/georgesjamous)
- FIX: issue on count with Geo constraints and mongo ([#5286](https://github.com/parse-community/parse-server/pull/5286)), thanks to [Julien Quéré](https://github.com/jlnquere)

## 3.2.3
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.2.2...3.2.3)
- Correct previous release with patch that is fully merged

## 3.2.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.2.1...3.2.2)
- Security fix to properly process userSensitiveFields when parse-server is started with
  ../lib/cli/parse-server [#5463](https://github.com/parse-community/parse-server/pull/5463
  )

## 3.2.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.2.0...3.2.1)
- Increment package.json version to match the deployment tag

## 3.2.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.1.3...3.2.0)
- NEW: Support accessing sensitive fields with an explicit ACL.  Not documented yet, see [tests](https://github.com/parse-community/parse-server/blob/f2c332ea6a984808ad5b2e3ce34864a20724f72b/spec/UserPII.spec.js#L526) for examples
- Upgrade Parse SDK JS to 2.3.1 [#5457](https://github.com/parse-community/parse-server/pull/5457)
- Hides token contents in logStartupOptions if they arrive as a buffer [#6a9380](https://github.com/parse-community/parse-server/commit/6a93806c62205a56a8f4e3b8765848c552510337)
- Support custom message for password requirements [#5399](https://github.com/parse-community/parse-server/pull/5399)
- Support for Ajax password reset [#5332](https://github.com/parse-community/parse-server/pull/5332)
- Postgres: Refuse to build unsafe JSON lists for contains [#5337](https://github.com/parse-community/parse-server/pull/5337)
- Properly handle return values in beforeSave [#5228](https://github.com/parse-community/parse-server/pull/5228)
- Fixes issue when querying user roles [#5276](https://github.com/parse-community/parse-server/pull/5276)
- Fixes issue affecting update with CLP [#5269](https://github.com/parse-community/parse-server/pull/5269)

## 3.1.3
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.1.2...3.1.3)

- Postgres: Fixes support for global configuration
- Postgres: Fixes support for numeric arrays
- Postgres: Fixes issue affecting queries on empty arrays
- LiveQuery: Adds support for transmitting the original object
- Queries: Use estimated count if query is empty
- Docker: Reduces the size of the docker image to 154Mb


## 3.1.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.1.1...3.1.2)

- Removes dev script, use TDD instead of server.
- Removes nodemon and problematic dependencies.
- Addressed event-stream security debacle.

## 3.1.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.1.0...3.1.1)

### Improvements:
* Fixes issue that would prevent users with large number of roles to resolve all of them [Antoine Cormouls](https://github.com/Moumouls) (#5131, #5132)
* Fixes distinct query on special fields ([#5144](https://github.com/parse-community/parse-server/pull/5144))


## 3.1.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/3.0.0...3.1.0)

### Breaking Changes:
* Return success on sendPasswordResetEmail even if email not found. (#7fe4030)
### Security Fix:
* Expire password reset tokens on email change (#5104)
### Improvements:
* Live Query CLPs (#4387)
* Reduces number of calls to injectDefaultSchema (#5107)
* Remove runtime dependency on request (#5076)
### Bug fixes:
* Fixes issue with vkontatke authentication (#4977)
* Use the correct function when validating google auth tokens (#5018)
* fix unexpected 'delete' trigger issue on LiveQuery (#5031)
* Improves performance for roles and ACL's in live query server (#5126)


## 3.0.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.4...3.0.0)

`parse-server` 3.0.0 comes with brand new handlers for cloud code. It now fully supports promises and async / await.
For more informations, visit the v3.0.0 [migration guide](https://github.com/parse-community/parse-server/blob/master/3.0.0.md).

### Breaking changes:
* Cloud Code handlers have a new interface based on promises.
* response.success / response.error are removed in Cloud Code
* Cloud Code runs with Parse-SDK 2.0
* The aggregate now require aggregates to be passed in the form: `{"pipeline": [...]}` (REST Only)

### Improvements:
* Adds Pipeline Operator to Aggregate Router.
* Adds documentations for parse-server's adapters, constructors and more.
* Adds ability to pass a context object between `beforeSave` and `afterSave` affecting the same object.

### Bug Fixes:
* Fixes issue that would crash the server when mongo objects had undefined values [#4966](https://github.com/parse-community/parse-server/issues/4966)
* Fixes issue that prevented ACL's from being used with `select` (see [#571](https://github.com/parse-community/Parse-SDK-JS/issues/571))

### Dependency updates:
* [@parse/simple-mailgun-adapter@1.1.0](https://www.npmjs.com/package/@parse/simple-mailgun-adapter)
* [mongodb@3.1.3](https://www.npmjs.com/package/mongodb)
* [request@2.88.0](https://www.npmjs.com/package/request)

### Development Dependencies Updates:
* [@parse/minami@1.0.0](https://www.npmjs.com/package/@parse/minami)
* [deep-diff@1.0.2](https://www.npmjs.com/package/deep-diff)
* [flow-bin@0.79.0](https://www.npmjs.com/package/flow-bin)
* [jsdoc@3.5.5](https://www.npmjs.com/package/jsdoc)
* [jsdoc-babel@0.4.0](https://www.npmjs.com/package/jsdoc-babel)

### 2.8.4
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.3...2.8.4)

#### Improvements:
* Adds ability to forward errors to express handler (#4697)
* Adds ability to increment the push badge with an arbitrary value (#4889)
* Adds ability to preserve the file names when uploading (#4915)
* `_User` now follow regular ACL policy. Letting administrator lock user out. (#4860) and (#4898)
* Ensure dates are properly handled in aggregates (#4743)
* Aggregates: Improved support for stages sharing the same name
* Add includeAll option
* Added verify password to users router and tests. (#4747)
* Ensure read preference is never overriden, so DB config prevails (#4833)
* add support for geoWithin.centerSphere queries via withJSON (#4825)
* Allow sorting an object field (#4806)
* Postgres: Don't merge JSON fields after save() to keep same behaviour as MongoDB (#4808) (#4815)

#### Dependency updates
* [commander@2.16.0](https://www.npmjs.com/package/commander)
* [mongodb@3.1.1](https://www.npmjs.com/package/mongodb)
* [pg-promise@8.4.5](https://www.npmjs.com/package/pg-promise)
* [ws@6.0.0](https://www.npmjs.com/package/ws)
* [bcrypt@3.0.0](https://www.npmjs.com/package/bcrypt)
* [uws@10.148.1](https://www.npmjs.com/package/uws)

##### Development Dependencies Updates:
* [cross-env@5.2.0](https://www.npmjs.com/package/cross-env)
* [eslint@5.0.0](https://www.npmjs.com/package/eslint)
* [flow-bin@0.76.0](https://www.npmjs.com/package/flow-bin)
* [mongodb-runner@4.0.0](https://www.npmjs.com/package/mongodb-runner)
* [nodemon@1.18.1](https://www.npmjs.com/package/nodemon)
* [nyc@12.0.2](https://www.npmjs.com/package/nyc)
* [request-promise@4.2.2](https://www.npmjs.com/package/request-promise)
* [supports-color@5.4.0](https://www.npmjs.com/package/supports-color)

### 2.8.3
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.2...2.8.3)

#### Improvements:

* Adds support for JS SDK 2.0 job status header
* Removes npm-git scripts as npm supports using git repositories that build, thanks to [Florent Vilmart](https://github.com/flovilmart)


### 2.8.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.1...2.8.2)

##### Bug Fixes:
* Ensure legacy users without ACL's are not locked out, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Improvements:
* Use common HTTP agent to increase webhooks performance, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Adds withinPolygon support for Polygon objects, thanks to [Mads Bjerre](https://github.com/madsb)

#### Dependency Updates:
* [ws@5.2.0](https://www.npmjs.com/package/ws)
* [commander@2.15.1](https://www.npmjs.com/package/commander)
* [nodemon@1.17.5](https://www.npmjs.com/package/nodemon)

##### Development Dependencies Updates:
* [flow-bin@0.73.0](https://www.npmjs.com/package/flow-bin)
* [cross-env@5.1.6](https://www.npmjs.com/package/cross-env)
* [gaze@1.1.3](https://www.npmjs.com/package/gaze)
* [deepcopy@1.0.0](https://www.npmjs.com/package/deepcopy)
* [deep-diff@1.0.1](https://www.npmjs.com/package/deep-diff)


### 2.8.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.1...2.8.0)

Ensure all the files are properly exported to the final package.

### 2.8.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.8.0...2.7.4)

#### New Features
* Adding Mongodb element to add `arrayMatches` the #4762 (#4766), thanks to [Jérémy Piednoel](https://github.com/jeremypiednoel)
* Adds ability to Lockout users (#4749), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes:
* Fixes issue when using afterFind with relations (#4752), thanks to [Florent Vilmart](https://github.com/flovilmart)
* New query condition support to match all strings that starts with some other given strings (#3864), thanks to [Eduard Bosch Bertran](https://github.com/eduardbosch)
* Allow creation of indices on default fields (#4738), thanks to [Claire Neveu](https://github.com/ClaireNeveu)
* Purging empty class (#4676), thanks to [Diamond Lewis](https://github.com/dplewis)
* Postgres: Fixes issues comparing to zero or false (#4667), thanks to [Diamond Lewis](https://github.com/dplewis)
* Fix Aggregate Match Pointer (#4643), thanks to [Diamond Lewis](https://github.com/dplewis)

#### Improvements:
* Allow Parse.Error when returning from Cloud Code (#4695), thanks to [Saulo Tauil](https://github.com/saulogt)
* Fix typo: "requrest" -> "request" (#4761), thanks to [Joseph Frazier](https://github.com/josephfrazier)
* Send version for Vkontakte API (#4725), thanks to [oleg](https://github.com/alekoleg)
* Ensure we respond with invalid password even if email is unverified (#4708), thanks to [dblythy](https://github.com/dblythy)
* Add _password_history to default sensitive data (#4699), thanks to [Jong Eun Lee](https://github.com/yomybaby)
* Check for node version in postinstall script (#4657), thanks to [Diamond Lewis](https://github.com/dplewis)
* Remove FB Graph API version from URL to use the oldest non deprecated version, thanks to [SebC](https://github.com/SebC99)

#### Dependency Updates:
* [@parse/push-adapter@2.0.3](https://www.npmjs.com/package/@parse/push-adapter)
* [@parse/simple-mailgun-adapter@1.0.2](https://www.npmjs.com/package/@parse/simple-mailgun-adapter)
* [uws@10.148.0](https://www.npmjs.com/package/uws)
* [body-parser@1.18.3](https://www.npmjs.com/package/body-parser)
* [mime@2.3.1](https://www.npmjs.com/package/mime)
* [request@2.85.0](https://www.npmjs.com/package/request)
* [mongodb@3.0.7](https://www.npmjs.com/package/mongodb)
* [bcrypt@2.0.1](https://www.npmjs.com/package/bcrypt)
* [ws@5.1.1](https://www.npmjs.com/package/ws)

##### Development Dependencies Updates:
* [cross-env@5.1.5](https://www.npmjs.com/package/cross-env)
* [flow-bin@0.71.0](https://www.npmjs.com/package/flow-bin)
* [deep-diff@1.0.0](https://www.npmjs.com/package/deep-diff)
* [nodemon@1.17.3](https://www.npmjs.com/package/nodemon)


### 2.7.4
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.7.4...2.7.3)

#### Bug Fixes:
* Fixes an issue affecting polygon queries, thanks to [Diamond Lewis](https://github.com/dplewis)

#### Dependency Updates:
* [pg-promise@8.2.1](https://www.npmjs.com/package/pg-promise)

##### Development Dependencies Updates:
* [nodemon@1.17.1](https://www.npmjs.com/package/nodemon)

### 2.7.3
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.7.3...2.7.2)

#### Improvements:
* Improve documentation for LiveQuery options, thanks to [Arthur Cinader](https://github.com/acinader)
* Improve documentation for using cloud code with docker, thanks to [Stephen Tuso](https://github.com/stephentuso)
* Adds support for Facebook's AccountKit, thanks to [6thfdwp](https://github.com/6thfdwp)
* Disable afterFind routines when running aggregates, thanks to [Diamond Lewis](https://github.com/dplewis)
* Improve support for distinct aggregations of nulls, thanks to [Diamond Lewis](https://github.com/dplewis)
* Regenreate the email verification token when requesting a new email, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)

#### Bug Fixes:
* Fix issue affecting readOnly masterKey and purge command, thanks to [AreyouHappy](https://github.com/AreyouHappy)
* Fixes Issue unsetting in beforeSave doesn't allow object creation, thanks to [Diamond Lewis](https://github.com/dplewis)
* Fixes issue crashing server on invalid live query payload, thanks to [fridays](https://github.com/fridays)
* Fixes issue affecting postgres storage adapter "undefined property '__op'", thanks to [Tyson Andre](https://github,com/TysonAndre)

#### Dependency Updates:
* [winston@2.4.1](https://www.npmjs.com/package/winston)
* [pg-promise@8.2.0](https://www.npmjs.com/package/pg-promise)
* [commander@2.15.0](https://www.npmjs.com/package/commander)
* [lru-cache@4.1.2](https://www.npmjs.com/package/lru-cache)
* [parse@1.11.1](https://www.npmjs.com/package/parse)
* [ws@5.0.0](https://www.npmjs.com/package/ws)
* [mongodb@3.0.4](https://www.npmjs.com/package/mongodb)
* [lodash@4.17.5](https://www.npmjs.com/package/lodash)

##### Development Dependencies Updates:
* [cross-env@5.1.4](https://www.npmjs.com/package/cross-env)
* [flow-bin@0.67.1](https://www.npmjs.com/package/flow-bin)
* [jasmine@3.1.0](https://www.npmjs.com/package/jasmine)
* [parse@1.11.1](https://www.npmjs.com/package/parse)
* [babel-eslint@8.2.2](https://www.npmjs.com/package/babel-eslint)
* [nodemon@1.15.0](https://www.npmjs.com/package/nodemon)

### 2.7.2
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.7.2...2.7.1)

#### Improvements:
* Improved match aggregate
* Do not mark the empty push as failed
* Support pointer in aggregate query
* Introduces flow types for storage
* Postgres: Refactoring of Postgres Storage Adapter
* Postgres: Support for multiple projection in aggregate
* Postgres: performance optimizations
* Adds infos about vulnerability disclosures
* Adds ability to login with email when provided as username

#### Bug Fixes
* Scrub Passwords with URL Encoded Characters
* Fixes issue affecting using sorting in beforeFind

#### Dependency Updates:
* [commander@2.13.0](https://www.npmjs.com/package/commander)
* [semver@5.5.0](https://www.npmjs.com/package/semver)
* [pg-promise@7.4.0](https://www.npmjs.com/package/pg-promise)
* [ws@4.0.0](https://www.npmjs.com/package/ws)
* [mime@2.2.0](https://www.npmjs.com/package/mime)
* [parse@1.11.0](https://www.npmjs.com/package/parse)

##### Development Dependencies Updates:
* [nodemon@1.14.11](https://www.npmjs.com/package/nodemon)
* [flow-bin@0.64.0](https://www.npmjs.com/package/flow-bin)
* [jasmine@2.9.0](https://www.npmjs.com/package/jasmine)
* [cross-env@5.1.3](https://www.npmjs.com/package/cross-env)

### 2.7.1
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.7.1...2.7.0)

:warning: Fixes a security issue affecting Class Level Permissions

* Adds support for dot notation when using matchesKeyInQuery, thanks to [Henrik](https://github.com/bohemima) and [Arthur Cinader](https://github.com/acinader)

### 2.7.0
[Full Changelog](https://github.com/parse-community/parse-server/compare/2.7.0...2.6.5)

:warning: This version contains an issue affecting Class Level Permissions on mongoDB. Please upgrade to 2.7.1.

Starting parse-server 2.7.0, the minimun nodejs version is 6.11.4, please update your engines before updating parse-server

#### New Features:
* Aggregation endpoints, thanks to [Diamond Lewis](https://github.com/dplewis)
* Adds indexation options onto Schema endpoints, thanks to [Diamond Lewis](https://github.com/dplewis)

#### Bug fixes:
* Fixes sessionTokens being overridden in 'find' (#4332), thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Proper `handleShutdown()` feature to close database connections (#4361), thanks to [CHANG, TZU-YEN](https://github.com/trylovetom)
* Fixes issue affecting state of _PushStatus objects, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Fixes issue affecting calling password reset password pages with wrong appid, thanks to [Bryan de Leon](https://github.com/bryandel)
* Fixes issue affecting duplicates _Sessions on successive logins, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Improvements:
* Updates contributing guides, and improves windows support, thanks to [Addison Elliott](https://github.com/addisonelliott)
* Uses new official scoped packaged, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improves health checks responses, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Add password confirmation to choose_password, thanks to [Worathiti Manosroi](https://github.com/pungme)
* Improve performance of relation queries, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Dependency Updates:
* [commander@2.12.1](https://www.npmjs.com/package/commander)
* [ws@3.3.2](https://www.npmjs.com/package/ws)
* [uws@9.14.0](https://www.npmjs.com/package/uws)
* [pg-promise@7.3.2](https://www.npmjs.com/package/pg-promise)
* [parse@1.10.2](https://www.npmjs.com/package/parse)
* [pg-promise@7.3.1](https://www.npmjs.com/package/pg-promise)

##### Development Dependencies Updates:
* [cross-env@5.1.1](https://www.npmjs.com/package/cross-env)



### 2.6.5
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.6.5...2.6.4)

#### New Features:
* Adds support for read-only masterKey, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Adds support for relative time queries (mongodb only), thanks to [Marvel Mathew](https://github.com/marvelm)

#### Improvements:
* Handle possible afterSave exception, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Add support for expiration interval in Push, thanks to [Marvel Mathew](https://github.com/marvelm)

#### Bug Fixes:
* The REST API key was improperly inferred from environment when using the CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.6.4
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.6.4...2.6.3)

#### Improvements:
* Improves management of configurations and default values, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Adds ability to start ParseServer with `ParseServer.start(options)`, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Adds request original IP to cloud code hooks, thanks to [Gustav Ahlberg](https://github.com/Gyran)
* Corrects some outdated links, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Adds serverURL validation on startup, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Adds ability to login with POST requests alongside GET, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)
* Adds ability to login with email, instead of username, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug Fixes:
* Fixes issue affecting beforeSaves and increments, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)

#### Dependency Updates:
* [parse-server-push-adapter@2.0.2](https://www.npmjs.com/package/parse-server-push-adapter)
* [semver@5.4.1](https://www.npmjs.com/package/semver)
* [pg-promise@7.0.3](https://www.npmjs.com/package/pg-promise)
* [mongodb@2.2.33](https://www.npmjs.com/package/mongodb)
* [parse@1.10.1](https://www.npmjs.com/package/parse)
* [express@4.16.0](https://www.npmjs.com/package/express)
* [mime@1.4.1](https://www.npmjs.com/package/mime)
* [parse-server-simple-mailgun-adapter@1.0.1](https://www.npmjs.com/package/parse-server-simple-mailgun-adapter)

##### Development Dependencies Updates:
* [babel-preset-env@1.6.1](https://www.npmjs.com/package/babel-preset-env)
* [cross-env@5.1.0](https://www.npmjs.com/package/cross-env)
* [mongodb-runner@3.6.1](https://www.npmjs.com/package/mongodb-runner)
* [eslint-plugin-flowtype@2.39.1](https://www.npmjs.com/package/eslint-plugin-flowtype)
* [eslint@4.9.0](https://www.npmjs.com/package/eslint)

### 2.6.3
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.6.2...2.6.3)

#### Improvements:
* Queries on Pointer fields with `$in` and `$nin` now supports list of objectId's, thanks to [Florent Vilmart](https://github.com/flovilmart)
* LiveQueries on `$in` and `$nin` for pointer fields work as expected thanks to [Florent Vilmart](https://github.com/flovilmart)
* Also remove device token when APNS error is BadDeviceToken, thanks to [Mauricio Tollin](https://github.com/)
* LRU cache is not available on the ParseServer object, thanks to [Tyler Brock](https://github.com/tbrock)
* Error messages are more expressive, thanks to [Tyler Brock](https://github.com/tbrock)
* Postgres: Properly handle undefined field values, thanks to [Diamond Lewis](https://github.com/dlewis)
* Updating with two GeoPoints fails correctly, thanks to [Anthony Mosca](https://github.com/aontas)

#### New Features:
* Adds ability to set a maxLimit on server configuration for queries, thanks to [Chris Norris](https://github.com/)

#### Bug fixes:
* Fixes issue affecting reporting `_PushStatus` with misconfigured serverURL, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issue affecting deletion of class that doesn't exist, thanks to [Diamond Lewis](https://github.com/dlewis)

#### Dependency Updates:
* [winston@2.4.0](https://www.npmjs.com/package/winston)
* [pg-promise@6.10.2](https://www.npmjs.com/package/pg-promise)
* [winston-daily-rotate-file@1.6.0](https://www.npmjs.com/package/winston-daily-rotate-file)
* [request@2.83.0](https://www.npmjs.com/package/request)
* [body-parser@1.18.2](https://www.npmjs.com/package/body-parser)

##### Development Dependencies Updates:
* [request-promise@4.2.2](https://www.npmjs.com/package/request-promise)
* [eslint@4.7.1](https://www.npmjs.com/package/eslint)

### 2.6.2
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.6.1...2.6.2)

#### Improvements:
* PushWorker/PushQueue channels are properly prefixed with the Parse applicationId, thanks to [Marvel Mathew](https://github.com/marvelm)
* You can use Parse.Cloud.afterSave hooks on _PushStatus
* You can use Parse.Cloud.onLiveQueryEvent to track the number of clients and subscriptions
* Adds support for more fields from the Audience class.

#### New Features:
* Push: Adds ability to track sentPerUTC offset if your push scheduler supports it.
* Push: Adds support for cleaning up invalid deviceTokens from _Installation (PARSE_SERVER_CLEANUP_INVALID_INSTALLATIONS=1).

#### Dependency Updates:
* [ws@3.2.0](https://www.npmjs.com/package/ws)
* [pg-promise@6.5.3](https://www.npmjs.com/package/pg-promise)
* [winston-daily-rotate-file@1.5.0](https://www.npmjs.com/package/winston-daily-rotate-file)
* [body-parser@1.18.1](https://www.npmjs.com/package/body-parser)

##### Development Dependencies Updates:
* [nodemon@1.12.1](https://www.npmjs.com/package/nodemon)
* [mongodb-runner@3.6.0](https://www.npmjs.com/package/mongodb-runner)
* [babel-eslint@8.0.0](https://www.npmjs.com/package/babel-eslint)

### 2.6.1
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.6.0...2.6.1)

#### Improvements:
* Improves overall performance of the server, more particularly with large query results.
* Improves performance of InMemoryCacheAdapter by removing serialization.
* Improves logging performance by skipping necessary log calls.
* Refactors object routers to simplify logic.
* Adds automatic indexing on $text indexes, thanks to [Diamon Lewis](https://github.com/dplewis)

#### New Features:
* Push: Adds ability to send localized pushes according to the _Installation localeIdentifier
* Push: proper support for scheduling push in user's locale time, thanks to [Marvel Mathew](https://github.com/marvelm)
* LiveQuery: Adds ability to use LiveQuery with a masterKey, thanks to [Jeremy May](https://github.com/kenishi)

#### Bug Fixes:
* Fixes an issue that would duplicate Session objects per userId-installationId pair.
* Fixes an issue affecting pointer permissions introduced in this release.
* Fixes an issue that would prevent displaying audiences correctly in dashboard.
* Fixes an issue affecting preventLoginWithUnverifiedEmail upon signups.

#### Dependency Updates:
* [pg-promise@6.3.2](https://www.npmjs.com/package/pg-promise)
* [body-parser@1.18.0](https://www.npmjs.com/package/body-parser)
* [nodemon@1.11.1](https://www.npmjs.com/package/nodemon)

##### Development Dependencies Updates:
* [babel-cli@6.26.0](https://www.npmjs.com/package/babel-cli)

### 2.6.0
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.5.3...2.6.0)

#### Breaking Changes:
* [parse-server-s3-adapter@1.2.0](https://www.npmjs.com/package/parse-server-s3-adapter): A new deprecation notice is introduced with parse-server-s3-adapter's version 1.2.0.  An upcoming release will remove passing key and password arguments.  AWS credentials should be set using AWS best practices.  See the [Deprecation Notice for AWS credentials]( https://github.com/parse-server-modules/parse-server-s3-adapter/blob/master/README.md#deprecation-notice----aws-credentials) section of the adapter's README.

#### New Features
* Polygon is fully supported as a type, thanks to [Diamond Lewis](https://github.com/dplewis)
* Query supports PolygonContains, thanks to [Diamond Lewis](https://github.com/dplewis)

#### Improvements
* Postgres: Adds support nested contains and containedIn, thanks to [Diamond Lewis](https://github.com/dplewis)
* Postgres: Adds support for `null` in containsAll queries, thanks to [Diamond Lewis](https://github.com/dplewis)
* Cloud Code: Request headers are passed to the cloud functions, thanks to [miguel-s](https://github.com/miguel-s)
* Push: All push queries now filter only where deviceToken exists

#### Bug Fixes:
* Fixes issue affecting updates of _User objects when authData was passed.
* Push: Pushing to an empty audience should now properly report a failed _PushStatus
* Linking Users: Fixes issue affecting linking users with sessionToken only

#### Dependency Updates:
* [ws@3.1.0](https://www.npmjs.com/package/ws)
* [mime@1.4.0](https://www.npmjs.com/package/mime)
* [semver@5.4.0](https://www.npmjs.com/package/semver)
* [uws@8.14.1](https://www.npmjs.com/package/uws)
* [bcrypt@1.0.3](https://www.npmjs.com/package/bcrypt)
* [mongodb@2.2.31](https://www.npmjs.com/package/mongodb)
* [redis@2.8.0](https://www.npmjs.com/package/redis)
* [pg-promise@6.3.1](https://www.npmjs.com/package/pg-promise)
* [commander@2.11.0](https://www.npmjs.com/package/commander)

##### Development Dependencies Updates:
* [jasmine@2.8.0](https://www.npmjs.com/package/jasmine)
* [babel-register@6.26.0](https://www.npmjs.com/package/babel-register)
* [babel-core@6.26.0](https://www.npmjs.com/package/babel-core)
* [cross-env@5.0.2](https://www.npmjs.com/package/cross-env)

### 2.5.3
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.5.2...2.5.3)

#### New Features:
* badge property on android installations will now be set as on iOS (#3970), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug Fixes:
* Fixes incorrect number parser for cache options

### 2.5.2
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.5.1...2.5.2)

#### Improvements:
* Restores ability to run on node >= 4.6
* Adds ability to configure cache from CLI
* Removes runtime check for node >= 4.6

### 2.5.1
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.5.0...2.5.1)

#### New Features:
* Adds ability to set default objectId size (#3950), thanks to [Steven Shipton](https://github.com/steven-supersolid)

#### Improvements:
* Uses LRU cache instead of InMemoryCache by default (#3979), thanks to [Florent Vilmart](https://github.com/flovilmart)
* iOS pushes are now using HTTP/2.0 instead of binary API  (#3983), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Dependency Updates:
* [parse@1.10.0](https://www.npmjs.com/package/parse)
* [pg-promise@6.3.0](https://www.npmjs.com/package/pg-promise)
* [parse-server-s3-adapter@1.1.0](https://www.npmjs.com/package/parse-server-s3-adapter)
* [parse-server-push-adapter@2.0.0](https://www.npmjs.com/package/parse-server-push-adapter)

### 2.5.0
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.4.2...2.5.0)

#### New Features:
* Adds ability to run full text search (#3904), thanks to [Diamond Lewis](https://github.com/dplewis)
* Adds ability to run `$withinPolygon` queries (#3889), thanks to [Diamond Lewis](https://github.com/dplewis)
* Adds ability to pass read preference per query with mongodb (#3865), thanks to [davimacedo](https://github.com/davimacedo)
* beforeFind trigger now includes `isGet` for get queries (#3862), thanks to [davimacedo](https://github.com/davimacedo)
* Adds endpoints for dashboard's audience API (#3861), thanks to [davimacedo](https://github.com/davimacedo)
* Restores the job scheduling endpoints (#3927), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Improvements:
* Removes unnecessary warning when using maxTimeMs with mongodb, thanks to [Tyler Brock](https://github.com/tbrock)
* Improves access control on system classes (#3916), thanks to [Worathiti Manosroi](https://github.com/pungme)
* Adds bytes support in postgres (#3894), thanks to [Diamond Lewis](https://github.com/dplewis)

#### Bug Fixes:
* Fixes issue with vkontakte adapter that would hang the request, thanks to [Denis Trofimov](https://github.com/denistrofimov)
* Fixes issue affecting null relational data (#3924), thanks to [davimacedo](https://github.com/davimacedo)
* Fixes issue affecting session token deletion (#3937), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issue affecting the serverInfo endpoint (#3933), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issue affecting beforeSave with dot-noted sub-documents (#3912), thanks to [IlyaDiallo](https://github.com/IlyaDiallo)
* Fixes issue affecting emails being sent when using a 3rd party auth (#3882), thanks to [davimacedo](https://github.com/davimacedo)

#### Dependency Updates:
* [commander@2.10.0](https://www.npmjs.com/package/commander)
* [pg-promise@5.9.7](https://www.npmjs.com/package/pg-promise)
* [lru-cache@4.1.0](https://www.npmjs.com/package/lru-cache)
* [mongodb@2.2.28](https://www.npmjs.com/package/mongodb)

##### Development dependencies
* [babel-core@6.25.0](https://www.npmjs.com/package/babel-core)
* [cross-env@5.0.1](https://www.npmjs.com/package/cross-env)
* [nyc@11.0.2](https://www.npmjs.com/package/nyc)

### 2.4.2
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.4.1...2.4.2)

#### New Features:
* ParseQuery: Support for withinPolygon [#3866](https://github.com/parse-community/parse-server/pull/3866), thanks to [Diamond Lewis](https://github.com/dplewis)

#### Improvements:
* Postgres: Use transactions when deleting a class, [#3869](https://github.com/parse-community/parse-server/pull/3836), thanks to [Vitaly Tomilov](https://github.com/vitaly-t)
* Postgres: Proper support for GeoPoint equality query, [#3874](https://github.com/parse-community/parse-server/pull/3836), thanks to [Diamond Lewis](https://github.com/dplewis)
* beforeSave and liveQuery will be correctly triggered on email verification [#3851](https://github.com/parse-community/parse-server/pull/3851), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes:
* Skip authData validation if it hasn't changed, on PUT requests [#3872](https://github.com/parse-community/parse-server/pull/3872), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Dependency Updates:
* [mongodb@2.2.27](https://www.npmjs.com/package/mongodb)
* [pg-promise@5.7.2](https://www.npmjs.com/package/pg-promise)


### 2.4.1
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.4.0...2.4.1)

#### Bug fixes:
* Fixes issue affecting relation updates ([#3835](https://github.com/parse-community/parse-server/pull/3835), [#3836](https://github.com/parse-community/parse-server/pull/3836)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issue affecting sending push notifications, thanks to [Felipe Andrade](https://github.com/felipemobile)
* Session are always cleared when updating the passwords ([#3289](https://github.com/parse-community/parse-server/pull/3289), [#3821](https://github.com/parse-community/parse-server/pull/3821), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Dependency Updates:
* [body-parser@1.17.2](https://www.npmjs.com/package/body-parser)
* [pg-promise@5.7.1](https://www.npmjs.com/package/pg-promise)
* [ws@3.0.0](https://www.npmjs.com/package/ws)


### 2.4.0
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.8...2.4.0)

Starting 2.4.0, parse-server is tested against node 6.10 and 7.10, mongodb 3.2 and 3.4.
If you experience issues with older versions, please [open a issue](https://github.com/parse-community/parse-server/issues).

#### New Features:
* Adds `count` Class Level Permission ([#3814](https://github.com/parse-community/parse-server/pull/3814)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Proper graceful shutdown support ([#3786](https://github.com/parse-community/parse-server/pull/3786)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Let parse-server store as `scheduled` Push Notifications with push_time (#3717, #3722), thanks to [Felipe Andrade](https://github.com/felipemobile)

#### Improvements
* Parse-Server images are built through docker hub, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Skip authData validation if it hasn't changed, thanks to [Florent Vilmart](https://github.com/flovilmart)
* [postgres] Improve performance when adding many new fields to the Schema ([#3740](https://github.com/parse-community/parse-server/pull/3740)), thanks to [Paulo Vítor S Reis](https://github.com/paulovitin)
* Test maintenance, wordsmithing and nits ([#3744](https://github.com/parse-community/parse-server/pull/3744)), thanks to [Arthur Cinader](https://github.com/acinader)

#### Bug Fixes:
* [postgres] Fixes issue affecting deleting multiple fields of a Schema ([#3734](https://github.com/parse-community/parse-server/pull/3734), [#3735](https://github.com/parse-community/parse-server/pull/3735)), thanks to [Paulo Vítor S Reis](https://github.com/paulovitin)
* Fix issue affecting _PushStatus state ([#3808](https://github.com/parse-community/parse-server/pull/3808)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* requiresAuthentication Class Level Permission behaves correctly, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Email Verification related fields are not exposed ([#3681](https://github.com/parse-community/parse-server/pull/3681), [#3393](https://github.com/parse-community/parse-server/pull/3393), [#3432](https://github.com/parse-community/parse-server/pull/3432)), thanks to [Anthony Mosca](https://github.com/aontas)
* HTTP query parameters are properly obfuscated in logs ([#3793](https://github.com/parse-community/parse-server/pull/3793), [#3789](https://github.com/parse-community/parse-server/pull/3789)), thanks to [@youngerong](https://github.com/youngerong)
* Improve handling of `$near` operators in `$or` queries ([#3767](https://github.com/parse-community/parse-server/pull/3767), [#3798](https://github.com/parse-community/parse-server/pull/3798)), thanks to [Jack Wearden](https://github.com/NotBobTheBuilder)
* Fix issue affecting arrays of pointers ([#3169](https://github.com/parse-community/parse-server/pull/3169)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix issue affecting overloaded query constraints ([#3723](https://github.com/parse-community/parse-server/pull/3723), [#3678](https://github.com/parse-community/parse-server/pull/3678)), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Properly catch unhandled rejections in _Installation updates ([#3795](https://github.com/parse-community/parse-server/pull/3795)), thanks to [kahoona77](https://github.com/kahoona77)

#### Dependency Updates:

* [uws@0.14.5](https://www.npmjs.com/package/uws)
* [mime@1.3.6](https://www.npmjs.com/package/mime)
* [mongodb@2.2.26](https://www.npmjs.com/package/mongodb)
* [pg-promise@5.7.0](https://www.npmjs.com/package/pg-promise)
* [semver@5.3.0](https://www.npmjs.com/package/semver)

##### Development dependencies
* [babel-cli@6.24.1](https://www.npmjs.com/package/babel-cli)
* [babel-core@6.24.1](https://www.npmjs.com/package/babel-core)
* [babel-preset-es2015@6.24.1](https://www.npmjs.com/package/babel-preset-es2015)
* [babel-preset-stage-0@6.24.1](https://www.npmjs.com/package/babel-preset-stage-0)
* [babel-register@6.24.1](https://www.npmjs.com/package/babel-register)
* [cross-env@5.0.0](https://www.npmjs.com/package/cross-env)
* [deep-diff@0.3.8](https://www.npmjs.com/package/deep-diff)
* [gaze@1.1.2](https://www.npmjs.com/package/gaze)
* [jasmine@2.6.0](https://www.npmjs.com/package/jasmine)
* [jasmine-spec-reporter@4.1.0](https://www.npmjs.com/package/jasmine-spec-reporter)
* [mongodb-runner@3.5.0](https://www.npmjs.com/package/mongodb-runner)
* [nyc@10.3.2](https://www.npmjs.com/package/nyc)
* [request-promise@4.2.1](https://www.npmjs.com/package/request-promise)


### 2.3.8
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.7...2.3.8)

#### New Features
* Support for PG-Promise options, thanks to [ren dong](https://github.com/rendongsc)

#### Improvements
* Improves support for graceful shutdown, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improves configuration validation for Twitter Authentication, thanks to [Benjamin Wilson Friedman](https://github.com/montymxb)

#### Bug Fixes
* Fixes issue affecting GeoPoint __type with Postgres, thanks to [zhoul-HS](https://github.com/zhoul-HS)
* Prevent user creation if username or password is empty, thanks to [Wissam Abirached](https://github.com/wabirached)

#### Dependency Updates:
* [cross-env@4.0.0 ](https://www.npmjs.com/package/cross-env)
* [ws@2.2.3](https://www.npmjs.com/package/ws)
* [babel-core@6.24.0](https://www.npmjs.com/package/babel-core)
* [uws@0.14.0](https://www.npmjs.com/package/uws)
* [babel-preset-es2015@6.24.0](https://www.npmjs.com/package/babel-preset-es2015)
* [babel-plugin-syntax-flow@6.18.0](https://www.npmjs.com/package/babel-plugin-syntax-flow)
* [babel-cli@6.24.0](https://www.npmjs.com/package/babel-cli)
* [babel-register@6.24.0](https://www.npmjs.com/package/babel-register)
* [winston-daily-rotate-file@1.4.6](https://www.npmjs.com/package/winston-daily-rotate-file)
* [mongodb@2.2.25](https://www.npmjs.com/package/mongodb)
* [redis@2.7.0](https://www.npmjs.com/package/redis)
* [pg-promise@5.6.4](https://www.npmjs.com/package/pg-promise)
* [parse-server-push-adapter@1.3.0](https://www.npmjs.com/package/parse-server-push-adapter)

### 2.3.7
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.6...2.3.7)

#### New Features
* New endpoint to resend verification email, thanks to [Xy Ziemba](https://github.com/xyziemba)

#### Improvements
* Add TTL option for Redis Cache Adapter, thanks to [Ryan Foster](https://github.com/f0ster)
* Update Postgres Storage Adapter, thanks to [Vitaly Tomilov](https://github.com/vitaly-t)

#### Bug Fixes
* Add index on Role.name, fixes (#3579), thanks to [Natan Rolnik](https://github.com/natanrolnik)
* Fix default value of userSensitiveFields, fixes (#3593), thanks to [Arthur Cinader](https://github.com/acinader)

#### Dependency Updates:
* [body-parser@1.17.1](https://www.npmjs.com/package/body-parser)
* [express@4.15.2](https://www.npmjs.com/package/express)
* [request@2.81.0](https://www.npmjs.com/package/request)
* [winston-daily-rotate-file@1.4.5](https://www.npmjs.com/package/winston-daily-rotate-file)
* [ws@2.2.0](https://www.npmjs.com/package/ws)


### 2.3.6
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.5...2.3.6)

#### Improvements
* Adds support for injecting a middleware for instumentation in the CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Alleviate mongodb bug with $or queries [SERVER-13732](https://jira.mongodb.org/browse/SERVER-13732), thanks to [Jack Wearden](https://github.com/NotBobTheBuilder)

#### Bug Fixes
* Fix issue affecting password policy and empty passwords, thanks to [Bhaskar Reddy Yasa](https://github.com/bhaskaryasa)
* Fix issue when logging url in non string objects, thanks to [Paulo Vítor S Reis](https://github.com/paulovitin)

#### Dependencies updates:
* [ws@2.1.0](https://npmjs.com/package/ws)
* [uws@0.13.0](https://npmjs.com/package/uws)
* [pg-promise@5.6.2](https://npmjs.com/package/pg-promise)


### 2.3.5
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.3...2.3.5)

#### Bug Fixes
* Allow empty client key
(#3497), thanks to [Arthur Cinader](https://github.com/acinader)
* Fix LiveQuery unsafe user
(#3525), thanks to [David Starke](https://github.com/dstarke)
* Use `flushdb` instead of `flushall` in RedisCacheAdapter
(#3523), thanks to [Jeremy Louie](https://github.com/JeremyPlease)
* Fix saving GeoPoints and Files in `_GlobalConfig` (Make sure we don't treat
dot notation keys as topLevel atoms)
(#3531), thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.3.3
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.2...2.3.3)

#### Breaking Changes
* **Minimum Node engine bumped to 4.6** (#3480), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug Fixes
* Add logging on failure to create file (#3424), thanks to [Arthur Cinader](https://github.com/acinader)
* Log Parse Errors so they are intelligible (#3431), thanks to [Arthur Cinader](https://github.com/acinader)
* MongoDB $or Queries avoid SERVER-13732 bug (#3476), thanks to [Jack Wearden](https://github.com/NotBobTheBuilder)
* Mongo object to Parse object date serialization - avoid re-serialization of iso of type Date (#3389), thanks to [nodechefMatt](https://github.com/nodechefMatt)

#### Improvements
* Ground preparations for push scalability (#3080), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Use uWS as optional dependency for ws server (#3231), thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.3.2
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.1...2.3.2)

#### New features
* Add parseFrameURL for masking user-facing pages (#3267), thanks to  [Lenart Rudel](https://github.com/lenart)

#### Bug fixes
* Fix Parse-Server to work with winston-daily-rotate-1.4.2 (#3335), thanks to [Arthur Cinader](https://github.com/acinader)

#### Improvements
* Add support for regex string for password policy validatorPattern setting (#3331), thanks to [Bhaskar Reddy Yasa](https://github.com/bhaskaryasa)
* LiveQuery should match subobjects with dot notation (#3322), thanks to [David Starke](https://github.com/dstarke)
* Reduce time to process high number of installations for push (#3264), thanks to [jeacott1](https://github.com/jeacott1)
* Fix trivial typo in error message (#3238), thanks to [Arthur Cinader](https://github.com/acinader)

### 2.3.1
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.3.0...2.3.1)

A major issue was introduced when refactoring the authentication modules.
This release addresses only that issue.

### 2.3.0
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.2.25...2.3.0)

#### Breaking changes
* Parse.Cloud.useMasterKey() is a no-op, please refer to (Cloud Code migration guide)[https://github.com/ParsePlatform/parse-server/wiki/Compatibility-with-Hosted-Parse#cloud-code]
* Authentication helpers are now proper adapters, deprecates oauth option in favor of auth.
* DEPRECATES: facebookAppIds, use `auth: { facebook: { appIds: ["AAAAAAAAA" ] } }`
* `email` field is not returned anymore for `Parse.User` queries. (Provided only on the user itself if provided).

#### New Features
* Adds ability to restrict access through Class Level Permissions to only authenticated users [see docs](http://parseplatform.github.io/docs/ios/guide/#requires-authentication-permission-requires-parse-server---230)
* Adds ability to strip sensitive data from `_User` responses, strips emails by default, thanks to [Arthur Cinader](https://github.com/acinader)
* Adds password history support for password policies, thanks to [Bhaskar Reddy Yasa](https://github.com/bhaskaryasa)

#### Improvements
* Bump parse-server-s3-adapter to 1.0.6, thanks to [Arthur Cinader](https://github.com/acinader)
* Using PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS let you create user sessions when passing {installationId: "xxx-xxx"} on signup in cloud code, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Add CLI option to pass `host` parameter when creating parse-server from CLI, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)

#### Bug fixes
* Ensure batch routes are only using posix paths, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Ensure falsy options from CLI are properly taken into account, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Fixes issues affecting calls to `matchesKeyInQuery` with pointers.
* Ensure that `select` keys can be changed in triggers (beforeFind...), thanks to [Arthur Cinader](https://github.com/acinader)

#### Housekeeping
* Enables and enforces linting with eslint, thanks to [Arthur Cinader](https://github.com/acinader)

### 2.2.25

Postgres support requires v9.5

#### New Features
* Dockerizing Parse Server, thanks to [Kirill Kravinsky](https://github.com/woyorus)
* Login with qq, wechat, weibo, thanks to [haifeizhang]()
* Password policy, validation and expiration, thanks to [Bhaskar Reddy Yasa](https://github.com/bhaskaryasa)
* Health check on /health, thanks to [Kirill Kravinsky](https://github.com/woyorus)
* Reuse SchemaCache across requests option, thanks to [Steven Shipton](https://github.com/steven-supersolid)

#### Improvements
* Better support for CLI options, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Specity a database timeout with maxTimeMS, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Adds the username to reset password success pages, thanks to [Halim Qarroum](https://github.com/HQarroum)
* Better support for Redis cache adapter, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Better coverage of Postgres, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)

#### Bug Fixes
* Fixes issue when sending push to multiple installations, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issues with twitter authentication, thanks to [jonas-db](https://github.com/jonas-db)
* Ignore createdAt fields update, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)
* Improve support for array equality with LiveQuery, thanks to [David Poetzsch-Heffter](https://github.com/dpoetzsch)
* Improve support for batch endpoint when serverURL and publicServerURL have different paths, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Support saving relation objects, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)

### 2.2.24

#### New Features
* LiveQuery: Bring your own adapter (#2902), thanks to [Florent Vilmart](https://github.com/flovilmart)
* LiveQuery: Adds "update" operator to update a query subscription (#2935), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Improvements
* Better Postgres support, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Logs the function name when failing (#2963), thanks to [Michael Helvey](https://github.com/michaelhelvey)
* CLI: forces closing the connections with SIGINT/SIGTERM (#2964), thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Reduce the number of calls to the `_SCHEMA` table (#2912), thanks to [Steven Shipton](https://github.com/steven-supersolid)
* LiveQuery: Support for Role ACL's, thanks to [Aaron Blondeau](https://github.com/aaron-blondeau-dose)

#### Bug Fixes
* Better support for checking application and client keys, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Google OAuth, better support for android and web logins, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.23

* Run liveQuery server from CLI with a different port, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Support for Postgres databaseURI, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Support for Postgres options, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Improved support for google login (id_token and access_token), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improvements with VKontakte login, thanks to [Eugene Antropov](https://github.com/antigp)
* Improved support for `select` and `include`, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes

* Fix error when updating installation with useMasterKey (#2888), thanks to [Jeremy Louie](https://github.com/JeremyPlease)
* Fix bug affecting usage of multiple `notEqualTo`, thanks to [Jeremy Louie](https://github.com/JeremyPlease)
* Improved support for null values in arrays, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.22

* Minimum nodejs engine is now 4.5

#### New Features
* New: CLI for parse-live-query-server, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Start parse-live-query-server for parse-server CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes
* Fix: Include with pointers are not conflicting with get CLP anymore, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Removes dependency on babel-polyfill, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Support nested select calls, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Use native column selection instead of runtime, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: installationId header is properly used when updating `_Installation` objects, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: don't crash parse-server on improperly formatted live-query messages, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Passwords are properly stripped out of logs, thanks to [Arthur Cinader](https://github.com/acinader)
* Fix: Lookup for email in username if email is not set, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.21

* Fix: Reverts removal of babel-polyfill

### 2.2.20

* New: Adds CloudCode handler for `beforeFind`, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: RedisCacheAdapter for syncing schema, role and user caches across servers, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Latest master build available at `ParsePlatform/parse-server#latest`, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Better support for upgradeToRevocableSession with missing session token, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Removes babel-polyfill runtime dependency, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Cluster option now support a boolean value for automatically choosing the right number of processes, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Filenames now appear correctly, thanks to [Lama Chandrasena](https://github.com/lama-buddy)
* Fix: `_acl` is properly updated, thanks to [Steven Shipton](https://github.com/steven-supersolid)

Other fixes by [Mathias Rangel Wulff](https://github.com/mathiasrw)

### 2.2.19

* New: support for upgrading to revocable sessions, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: NullCacheAdapter for disabling caching, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)
* New: Account lockout policy [#2601](https://github.com/ParsePlatform/parse-server/pull/2601), thanks to [Diwakar Cherukumilli](https://github.com/cherukumilli)
* New: Jobs endpoint for defining and run jobs (no scheduling), thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Add --cluster option to the CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Support for login with vk.com, thanks to [Nurdaulet Bolatov](https://github.com/nbolatov)
* New: experimental support for postgres databases, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: parse-server doesn't call next() after successful responses, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Nested objects are properly includeed with Pointer Permissions on, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: null values in include calls are properly handled, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Schema validations now runs after beforeSave hooks, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: usersname and passwords are properly type checked, thanks to [Bam Wang](https://github.com/bamwang)
* Fix: logging in info log would log also in error log, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: removes extaneous logging from ParseLiveQueryServer, thanks to [Flavio Torres](https://github.com/flavionegrao)
* Fix: support for Range requests for files, thanks to [Brage G. Staven](https://github.com/Bragegs)

### 2.2.18

* Fix: Improve support for objects in push alert, thanks to [Antoine Lenoir](https://github.com/alenoir)
* Fix; Prevent pointed from getting clobbered when they are changed in a beforeSave, thanks to [sud](https://github.com/sud80)
* Fix: Improve support for "Bytes" type, thanks to [CongHoang](https://github.com/conghoang)
* Fix: Better logging compatability with Parse.com, thanks to [Arthur Cinader](https://github.com/acinader)
* New: Add Janrain Capture and Janrain Engage auth provider, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improved: Include content length header in files response, thanks to [Steven Van Bael](https://github.com/vbsteven)
* Improved: Support byte range header for files, thanks to [Brage G. Staven](https://github.com/Bragegs)
* Improved: Validations for LinkedIn access_tokens, thanks to [Felix Dumit](https://github.com/felix-dumit)
* Improved: Experimental postgres support, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Perf: Use native bcrypt implementation if available, thanks to [Florent Vilmart](https://github.com/flovilmart)


### 2.2.17
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.2.16...2.2.17)

* Cloud code logs [\#2370](https://github.com/ParsePlatform/parse-server/pull/2370) ([flovilmart](https://github.com/flovilmart))
* Make sure \_PushStatus operations are run in order [\#2367](https://github.com/ParsePlatform/parse-server/pull/2367) ([flovilmart](https://github.com/flovilmart))
* Typo fix for error message when can't ensure uniqueness of user email addresses [\#2360](https://github.com/ParsePlatform/parse-server/pull/2360) ([AndrewLane](https://github.com/AndrewLane))
* LiveQuery constrains matching fix [\#2357](https://github.com/ParsePlatform/parse-server/pull/2357) ([simonas-notcat](https://github.com/simonas-notcat))
* Fix typo in logging for commander parseConfigFile [\#2352](https://github.com/ParsePlatform/parse-server/pull/2352) ([AndrewLane](https://github.com/AndrewLane))
* Fix minor typos in test names [\#2351](https://github.com/ParsePlatform/parse-server/pull/2351) ([acinader](https://github.com/acinader))
* Makes sure we don't strip authData or session token from users using masterKey [\#2348](https://github.com/ParsePlatform/parse-server/pull/2348) ([flovilmart](https://github.com/flovilmart))
* Run coverage with istanbul [\#2340](https://github.com/ParsePlatform/parse-server/pull/2340) ([flovilmart](https://github.com/flovilmart))
* Run next\(\) after successfully sending data to the client [\#2338](https://github.com/ParsePlatform/parse-server/pull/2338) ([blacha](https://github.com/blacha))
* Cache all the mongodb/version folder [\#2336](https://github.com/ParsePlatform/parse-server/pull/2336) ([flovilmart](https://github.com/flovilmart))
* updates usage of setting: emailVerifyTokenValidityDuration [\#2331](https://github.com/ParsePlatform/parse-server/pull/2331) ([cherukumilli](https://github.com/cherukumilli))
* Update Mongodb client to 2.2.4 [\#2329](https://github.com/ParsePlatform/parse-server/pull/2329) ([flovilmart](https://github.com/flovilmart))
* Allow usage of analytics adapter [\#2327](https://github.com/ParsePlatform/parse-server/pull/2327) ([deashay](https://github.com/deashay))
* Fix flaky tests [\#2324](https://github.com/ParsePlatform/parse-server/pull/2324) ([flovilmart](https://github.com/flovilmart))
* don't serve null authData values [\#2320](https://github.com/ParsePlatform/parse-server/pull/2320) ([yuzeh](https://github.com/yuzeh))
* Fix null relation problem [\#2319](https://github.com/ParsePlatform/parse-server/pull/2319) ([flovilmart](https://github.com/flovilmart))
* Clear the connectionPromise upon close or error [\#2314](https://github.com/ParsePlatform/parse-server/pull/2314) ([flovilmart](https://github.com/flovilmart))
* Report validation errors with correct error code [\#2299](https://github.com/ParsePlatform/parse-server/pull/2299) ([flovilmart](https://github.com/flovilmart))
* Parses correctly Parse.Files and Dates when sent to Cloud Code Functions [\#2297](https://github.com/ParsePlatform/parse-server/pull/2297) ([flovilmart](https://github.com/flovilmart))
* Adding proper generic Not Implemented. [\#2292](https://github.com/ParsePlatform/parse-server/pull/2292) ([vitaly-t](https://github.com/vitaly-t))
* Adds schema caching capabilities \(5s by default\) [\#2286](https://github.com/ParsePlatform/parse-server/pull/2286) ([flovilmart](https://github.com/flovilmart))
* add digits oauth provider [\#2284](https://github.com/ParsePlatform/parse-server/pull/2284) ([ranhsd](https://github.com/ranhsd))
* Improve installations query [\#2281](https://github.com/ParsePlatform/parse-server/pull/2281) ([flovilmart](https://github.com/flovilmart))
* Adding request headers to cloud functions fixes \#1461 [\#2274](https://github.com/ParsePlatform/parse-server/pull/2274) ([blacha](https://github.com/blacha))
* Creates a new sessionToken when updating password [\#2266](https://github.com/ParsePlatform/parse-server/pull/2266) ([flovilmart](https://github.com/flovilmart))
* Add Gitter chat link to the README. [\#2264](https://github.com/ParsePlatform/parse-server/pull/2264) ([nlutsenko](https://github.com/nlutsenko))
* Restores ability to include non pointer keys [\#2263](https://github.com/ParsePlatform/parse-server/pull/2263) ([flovilmart](https://github.com/flovilmart))
* Allow next middleware handle error in handleParseErrors [\#2260](https://github.com/ParsePlatform/parse-server/pull/2260) ([mejcz](https://github.com/mejcz))
* Exposes the ClientSDK infos if available [\#2259](https://github.com/ParsePlatform/parse-server/pull/2259) ([flovilmart](https://github.com/flovilmart))
* Adds support for multiple twitter auths options [\#2256](https://github.com/ParsePlatform/parse-server/pull/2256) ([flovilmart](https://github.com/flovilmart))
* validate\_purchase fix for SANDBOX requests [\#2253](https://github.com/ParsePlatform/parse-server/pull/2253) ([valeryvaskabovich](https://github.com/valeryvaskabovich))

### 2.2.16

* New: Expose InMemoryCacheAdapter publicly, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* New: Add ability to prevent login with unverified email, thanks to [Diwakar Cherukumilli](https://github.com/cherukumilli)
* Improved: Better error message for incorrect type, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improved: Better error message for permission denied, thanks to [Blayne Chard](https://github.com/blacha)
* Improved: Update authData on login, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improved: Ability to not check for old files on Parse.com, thanks to [OzgeAkin](https://github.com/OzgeAkin)
* Fix: Issues with email adapter validation, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Issues with nested $or queries, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.15

* Fix: Type in description for Parse.Error.INVALID_QUERY, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improvement: Stop requiring verifyUserEmails for password reset functionality, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Improvement: Kill without validation, thanks to [Drew Gross](https://github.com/drew-gross)
* Fix: Deleting a file does not delete from fs.files, thanks to [David Keita](https://github.com/maninga)
* Fix: Postgres stoage adapter fix, thanks to [Vitaly Tomilov](https://github.com/vitaly-t)
* Fix: Results invalid session when providing an invalid session token, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: issue creating an anonymous user, thanks to [Hussam Moqhim](https://github.com/hmoqhim)
* Fix: make http response serializable, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Add postmark email adapter alternative [Glenn Reyes](https://github.com/glennreyes)

### 2.2.14

* Hotfix: Fix Parse.Cloud.HTTPResponse serialization

### 2.2.13

* Hotfix: Pin version of deepcopy

### 2.2.12

* New: Custom error codes in cloud code response.error, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Crash in beforeSave when response is not an object, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Allow "get" on installations
* Fix: Fix overly restrictive Class Level Permissions, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Fix nested date parsing in Cloud Code, thanks to [Marco Cheung](https://github.com/Marco129)
* Fix: Support very old file formats from Parse.com

### 2.2.11

* Security: Censor user password in logs, thanks to [Marco Cheung](https://github.com/Marco129)
* New: Add PARSE_SERVER_LOGS_FOLDER env var for setting log folder, thanks to [KartikeyaRokde](https://github.com/KartikeyaRokde)
* New: Webhook key support, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Perf: Add cache adapter and default caching of certain objects, thanks to [Blayne Chard](https://github.com/blacha)
* Improvement: Better error messages for schema type mismatches, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Improvement: Better error messages for reset password emails
* Improvement: Webhook key support in CLI, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Remove read only fields when using beforeSave, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Use content type provided by JS SDK, thanks to [Blayne Chard](https://github.com/blacha) and [Florent Vilmart](https://github.com/flovilmart)
* Fix: Tell the dashboard the stored push data is available, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Add support for HTTP Basic Auth, thanks to [Hussam Moqhim](https://github.com/hmoqhim)
* Fix: Support for MongoDB version 3.2.6, (note: do not use MongoDB 3.2 with migrated apps that still have traffic on Parse.com), thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Prevent `pm2` from crashing when push notifications fail, thanks to [benishak](https://github.com/benishak)
* Fix: Add full list of default _Installation fields, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Strip objectId out of hooks responses, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Fix external webhook response format, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Fix beforeSave when object is passed to `success`, thanks to [Madhav Bhagat](https://github.com/codebreach)
* Fix: Remove use of deprecated APIs, thanks to [Emad Ehsan](https://github.com/emadehsan)
* Fix: Crash when multiple Parse Servers on the same machine try to write to the same logs folder, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Fix: Various issues with key names in `Parse.Object`s
* Fix: Treat Bytes type properly
* Fix: Caching bugs that caused writes by masterKey or other session token to not show up to users reading with a different session token
* Fix: Pin mongo driver version, preventing a regression in version 2.1.19
* Fix: Various issues with pointer fields not being treated properly
* Fix: Issues with pointed getting un-fetched due to changes in beforeSave
* Fix: Fixed crash when deleting classes that have CLPs

### 2.2.10

* Fix: Write legacy ACLs to Mongo so that clients that still go through Parse.com can read them, thanks to [Tyler Brock](https://github.com/TylerBrock) and [carmenlau](https://github.com/carmenlau)
* Fix: Querying installations with limit = 0 and count = 1 now works, thanks to [ssk7833](https://github.com/ssk7833)
* Fix: Return correct error when violating unique index, thanks to [Marco Cheung](https://github.com/Marco129)
* Fix: Allow unsetting user's email, thanks to [Marco Cheung](https://github.com/Marco129)
* New: Support for Node 6.1

### 2.2.9

* Fix: Fix a regression that caused Parse Server to crash when a null parameter is passed to a Cloud function

### 2.2.8

* New: Support for Pointer Permissions
* New: Expose logger in Cloud Code
* New: Option to revoke sessions on password reset
* New: Option to expire inactive sessions
* Perf: Improvements in ACL checking query
* Fix: Issues when sending pushes to list of devices that contains invalid values
* Fix: Issues caused by using babel-polyfill outside of Parse Server, but in the same express app
* Fix: Remove creation of extra session tokens
* Fix: Return authData when querying with master key
* Fix: Bugs when deleting webhooks
* Fix: Ignore _RevocableSession header, which might be sent by the JS SDK
* Fix: Issues with querying via URL params
* Fix: Properly encode "Date" parameters to cloud code functions


### 2.2.7

* Adds support for --verbose and verbose option when running ParseServer [\#1414](https://github.com/ParsePlatform/parse-server/pull/1414) ([flovilmart](https://github.com/flovilmart))
* Adds limit = 0 as a valid parameter for queries [\#1493](https://github.com/ParsePlatform/parse-server/pull/1493) ([seijiakiyama](https://github.com/seijiakiyama))
* Makes sure we preserve Installations when updating a token  \(\#1475\) [\#1486](https://github.com/ParsePlatform/parse-server/pull/1486) ([flovilmart](https://github.com/flovilmart))
* Hotfix for tests [\#1503](https://github.com/ParsePlatform/parse-server/pull/1503) ([flovilmart](https://github.com/flovilmart))
* Enable logs [\#1502](https://github.com/ParsePlatform/parse-server/pull/1502) ([drew-gross](https://github.com/drew-gross))
* Do some triple equals for great justice [\#1499](https://github.com/ParsePlatform/parse-server/pull/1499) ([TylerBrock](https://github.com/TylerBrock))
* Apply credential stripping to all untransforms for \_User [\#1498](https://github.com/ParsePlatform/parse-server/pull/1498) ([TylerBrock](https://github.com/TylerBrock))
* Checking if object has defined key for Pointer constraints in liveQuery [\#1487](https://github.com/ParsePlatform/parse-server/pull/1487) ([simonas-notcat](https://github.com/simonas-notcat))
* Remove collection prefix and default mongo URI [\#1479](https://github.com/ParsePlatform/parse-server/pull/1479) ([drew-gross](https://github.com/drew-gross))
* Store collection prefix in mongo adapter, and clean up adapter interface [\#1472](https://github.com/ParsePlatform/parse-server/pull/1472) ([drew-gross](https://github.com/drew-gross))
* Move field deletion logic into mongo adapter [\#1471](https://github.com/ParsePlatform/parse-server/pull/1471) ([drew-gross](https://github.com/drew-gross))
* Adds support for Long and Double mongodb types \(fixes \#1316\) [\#1470](https://github.com/ParsePlatform/parse-server/pull/1470) ([flovilmart](https://github.com/flovilmart))
* Schema.js database agnostic [\#1468](https://github.com/ParsePlatform/parse-server/pull/1468) ([flovilmart](https://github.com/flovilmart))
* Remove console.log [\#1465](https://github.com/ParsePlatform/parse-server/pull/1465) ([drew-gross](https://github.com/drew-gross))
* Push status nits [\#1462](https://github.com/ParsePlatform/parse-server/pull/1462) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1444 [\#1451](https://github.com/ParsePlatform/parse-server/pull/1451) ([flovilmart](https://github.com/flovilmart))
* Removing sessionToken and authData from \_User objects included in a query [\#1450](https://github.com/ParsePlatform/parse-server/pull/1450) ([simonas-notcat](https://github.com/simonas-notcat))
* Move mongo field type logic into mongoadapter [\#1432](https://github.com/ParsePlatform/parse-server/pull/1432) ([drew-gross](https://github.com/drew-gross))
* Prevents \_User lock out when setting ACL on signup or afterwards [\#1429](https://github.com/ParsePlatform/parse-server/pull/1429) ([flovilmart](https://github.com/flovilmart))
* Update .travis.yml [\#1428](https://github.com/ParsePlatform/parse-server/pull/1428) ([flovilmart](https://github.com/flovilmart))
* Adds relation fields to objects [\#1424](https://github.com/ParsePlatform/parse-server/pull/1424) ([flovilmart](https://github.com/flovilmart))
* Update .travis.yml [\#1423](https://github.com/ParsePlatform/parse-server/pull/1423) ([flovilmart](https://github.com/flovilmart))
* Sets the defaultSchemas keys in the SchemaCollection [\#1421](https://github.com/ParsePlatform/parse-server/pull/1421) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1417 [\#1420](https://github.com/ParsePlatform/parse-server/pull/1420) ([drew-gross](https://github.com/drew-gross))
* Untransform should treat Array's as nested objects [\#1416](https://github.com/ParsePlatform/parse-server/pull/1416) ([blacha](https://github.com/blacha))
* Adds X-Parse-Push-Status-Id header [\#1412](https://github.com/ParsePlatform/parse-server/pull/1412) ([flovilmart](https://github.com/flovilmart))
* Schema format cleanup [\#1407](https://github.com/ParsePlatform/parse-server/pull/1407) ([drew-gross](https://github.com/drew-gross))
* Updates the publicServerURL option [\#1397](https://github.com/ParsePlatform/parse-server/pull/1397) ([flovilmart](https://github.com/flovilmart))
* Fix exception with non-expiring session tokens. [\#1386](https://github.com/ParsePlatform/parse-server/pull/1386) ([0x18B2EE](https://github.com/0x18B2EE))
* Move mongo schema format related logic into mongo adapter [\#1385](https://github.com/ParsePlatform/parse-server/pull/1385) ([drew-gross](https://github.com/drew-gross))
* WIP: Huge performance improvement on roles queries [\#1383](https://github.com/ParsePlatform/parse-server/pull/1383) ([flovilmart](https://github.com/flovilmart))
* Removes GCS Adapter from provided adapters [\#1339](https://github.com/ParsePlatform/parse-server/pull/1339) ([flovilmart](https://github.com/flovilmart))
* DBController refactoring [\#1228](https://github.com/ParsePlatform/parse-server/pull/1228) ([flovilmart](https://github.com/flovilmart))
* Spotify authentication [\#1226](https://github.com/ParsePlatform/parse-server/pull/1226) ([1nput0utput](https://github.com/1nput0utput))
* Expose DatabaseAdapter to simplify application tests [\#1121](https://github.com/ParsePlatform/parse-server/pull/1121) ([steven-supersolid](https://github.com/steven-supersolid))

### 2.2.6

* Important Fix: Disables find on installation from clients [\#1374](https://github.com/ParsePlatform/parse-server/pull/1374) ([flovilmart](https://github.com/flovilmart))
* Adds missing options to the CLI [\#1368](https://github.com/ParsePlatform/parse-server/pull/1368) ([flovilmart](https://github.com/flovilmart))
* Removes only master on travis [\#1367](https://github.com/ParsePlatform/parse-server/pull/1367) ([flovilmart](https://github.com/flovilmart))
* Auth.\_loadRoles should not query the same role twice. [\#1366](https://github.com/ParsePlatform/parse-server/pull/1366) ([blacha](https://github.com/blacha))

### 2.2.5

* Improves config loading and tests [\#1363](https://github.com/ParsePlatform/parse-server/pull/1363) ([flovilmart](https://github.com/flovilmart))
* Adds travis configuration to deploy NPM on new version tags [\#1361](https://github.com/ParsePlatform/parse-server/pull/1361) ([gfosco](https://github.com/gfosco))
* Inject the default schemas properties when loading it [\#1357](https://github.com/ParsePlatform/parse-server/pull/1357) ([flovilmart](https://github.com/flovilmart))
* Adds console transport when testing with VERBOSE=1 [\#1351](https://github.com/ParsePlatform/parse-server/pull/1351) ([flovilmart](https://github.com/flovilmart))
* Make notEqual work on relations  [\#1350](https://github.com/ParsePlatform/parse-server/pull/1350) ([flovilmart](https://github.com/flovilmart))
* Accept only bool for $exists in LiveQuery [\#1315](https://github.com/ParsePlatform/parse-server/pull/1315) ([drew-gross](https://github.com/drew-gross))
* Adds more options when using CLI/config [\#1305](https://github.com/ParsePlatform/parse-server/pull/1305) ([flovilmart](https://github.com/flovilmart))
* Update error message [\#1297](https://github.com/ParsePlatform/parse-server/pull/1297) ([drew-gross](https://github.com/drew-gross))
* Properly let masterKey add fields [\#1291](https://github.com/ParsePlatform/parse-server/pull/1291) ([flovilmart](https://github.com/flovilmart))
* Point to \#1271 as how to write a good issue report [\#1290](https://github.com/ParsePlatform/parse-server/pull/1290) ([drew-gross](https://github.com/drew-gross))
* Adds ability to override mount with publicServerURL for production uses [\#1287](https://github.com/ParsePlatform/parse-server/pull/1287) ([flovilmart](https://github.com/flovilmart))
* Single object queries to use include and keys [\#1280](https://github.com/ParsePlatform/parse-server/pull/1280) ([jeremyjackson89](https://github.com/jeremyjackson89))
* Improves report for Push error in logs and \_PushStatus [\#1269](https://github.com/ParsePlatform/parse-server/pull/1269) ([flovilmart](https://github.com/flovilmart))
* Removes all stdout/err logs while testing [\#1268](https://github.com/ParsePlatform/parse-server/pull/1268) ([flovilmart](https://github.com/flovilmart))
* Matching queries with doesNotExist constraint [\#1250](https://github.com/ParsePlatform/parse-server/pull/1250) ([andrecardoso](https://github.com/andrecardoso))
* Added session length option for session tokens to server configuration [\#997](https://github.com/ParsePlatform/parse-server/pull/997) ([Kenishi](https://github.com/Kenishi))
* Regression test for \#1259 [\#1286](https://github.com/ParsePlatform/parse-server/pull/1286) ([drew-gross](https://github.com/drew-gross))
* Regression test for \#871 [\#1283](https://github.com/ParsePlatform/parse-server/pull/1283) ([drew-gross](https://github.com/drew-gross))
* Add a test to repro \#701 [\#1281](https://github.com/ParsePlatform/parse-server/pull/1281) ([drew-gross](https://github.com/drew-gross))
* Fix for \#1334: using relative cloud code files broken  [\#1353](https://github.com/ParsePlatform/parse-server/pull/1353) ([airdrummingfool](https://github.com/airdrummingfool))
* Fix Issue/1288 [\#1346](https://github.com/ParsePlatform/parse-server/pull/1346) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1271 [\#1295](https://github.com/ParsePlatform/parse-server/pull/1295) ([drew-gross](https://github.com/drew-gross))
* Fixes issue \#1302 [\#1314](https://github.com/ParsePlatform/parse-server/pull/1314) ([flovilmart](https://github.com/flovilmart))
* Fixes bug related to include in queries [\#1312](https://github.com/ParsePlatform/parse-server/pull/1312) ([flovilmart](https://github.com/flovilmart))


### 2.2.4

* Hotfix: fixed imports issue for S3Adapter, GCSAdapter, FileSystemAdapter [\#1263](https://github.com/ParsePlatform/parse-server/pull/1263) ([drew-gross](https://github.com/drew-gross)
* Fix: Clean null authData values on _User update [\#1199](https://github.com/ParsePlatform/parse-server/pull/1199) ([yuzeh](https://github.com/yuzeh))

### 2.2.3

* Fixed bug with invalid email verification link on email update. [\#1253](https://github.com/ParsePlatform/parse-server/pull/1253) ([kzielonka](https://github.com/kzielonka))
* Badge update supports increment as well as Increment [\#1248](https://github.com/ParsePlatform/parse-server/pull/1248) ([flovilmart](https://github.com/flovilmart))
* Config/Push Tested with the dashboard. [\#1235](https://github.com/ParsePlatform/parse-server/pull/1235) ([drew-gross](https://github.com/drew-gross))
* Better logging with winston [\#1234](https://github.com/ParsePlatform/parse-server/pull/1234) ([flovilmart](https://github.com/flovilmart))
* Make GlobalConfig work like parse.com [\#1210](https://github.com/ParsePlatform/parse-server/pull/1210) ([framp](https://github.com/framp))
* Improve flattening of results from pushAdapter [\#1204](https://github.com/ParsePlatform/parse-server/pull/1204) ([flovilmart](https://github.com/flovilmart))
* Push adapters are provided by external packages [\#1195](https://github.com/ParsePlatform/parse-server/pull/1195) ([flovilmart](https://github.com/flovilmart))
* Fix flaky test [\#1188](https://github.com/ParsePlatform/parse-server/pull/1188) ([drew-gross](https://github.com/drew-gross))
* Fixes problem affecting finding array pointers [\#1185](https://github.com/ParsePlatform/parse-server/pull/1185) ([flovilmart](https://github.com/flovilmart))
* Moves Files adapters to external packages [\#1172](https://github.com/ParsePlatform/parse-server/pull/1172) ([flovilmart](https://github.com/flovilmart))
* Mark push as enabled in serverInfo endpoint [\#1164](https://github.com/ParsePlatform/parse-server/pull/1164) ([drew-gross](https://github.com/drew-gross))
* Document email adapter [\#1144](https://github.com/ParsePlatform/parse-server/pull/1144) ([drew-gross](https://github.com/drew-gross))
* Reset password fix [\#1133](https://github.com/ParsePlatform/parse-server/pull/1133) ([carmenlau](https://github.com/carmenlau))

### 2.2.2

* Important Fix: Mounts createLiveQueryServer, fix babel induced problem [\#1153](https://github.com/ParsePlatform/parse-server/pull/1153) (flovilmart)
* Move ParseServer to it's own file [\#1166](https://github.com/ParsePlatform/parse-server/pull/1166) (flovilmart)
* Update README.md * remove deploy buttons * replace with community links [\#1139](https://github.com/ParsePlatform/parse-server/pull/1139) (drew-gross)
* Adds bootstrap.sh [\#1138](https://github.com/ParsePlatform/parse-server/pull/1138) (flovilmart)
* Fix: Do not override username [\#1142](https://github.com/ParsePlatform/parse-server/pull/1142) (flovilmart)
* Fix: Add pushId back to GCM payload [\#1168](https://github.com/ParsePlatform/parse-server/pull/1168) (wangmengyan95)

### 2.2.1

* New: Add FileSystemAdapter file adapter [\#1098](https://github.com/ParsePlatform/parse-server/pull/1098) (dtsolis)
* New: Enabled CLP editing [\#1128](https://github.com/ParsePlatform/parse-server/pull/1128) (drew-gross)
* Improvement: Reduces the number of connections to mongo created [\#1111](https://github.com/ParsePlatform/parse-server/pull/1111) (flovilmart)
* Improvement: Make ParseServer a class [\#980](https://github.com/ParsePlatform/parse-server/pull/980) (flovilmart)
* Fix: Adds support for plain object in $add, $addUnique, $remove [\#1114](https://github.com/ParsePlatform/parse-server/pull/1114) (flovilmart)
* Fix: Generates default CLP, freezes objects [\#1132](https://github.com/ParsePlatform/parse-server/pull/1132) (flovilmart)
* Fix: Properly sets installationId on creating session with 3rd party auth [\#1110](https://github.com/ParsePlatform/parse-server/pull/1110) (flovilmart)

### 2.2.0

* New Feature: Real-time functionality with Live Queries! [\#1092](https://github.com/ParsePlatform/parse-server/pull/1092) (wangmengyan95)
* Improvement: Push Status API [\#1004](https://github.com/ParsePlatform/parse-server/pull/1004) (flovilmart)
* Improvement: Allow client operations on Roles [\#1068](https://github.com/ParsePlatform/parse-server/pull/1068) (flovilmart)
* Improvement: Add URI encoding to mongo auth parameters [\#986](https://github.com/ParsePlatform/parse-server/pull/986) (bgw)
* Improvement: Adds support for apps key in config file, but only support single app for now [\#979](https://github.com/ParsePlatform/parse-server/pull/979) (flovilmart)
* Documentation: Getting Started and Configuring Parse Server [\#988](https://github.com/ParsePlatform/parse-server/pull/988) (hramos)
* Fix: Various edge cases with REST API [\#1066](https://github.com/ParsePlatform/parse-server/pull/1066) (flovilmart)
* Fix: Makes sure the location in results has the proper objectId [\#1065](https://github.com/ParsePlatform/parse-server/pull/1065) (flovilmart)
* Fix: Third-party auth is properly removed when unlinked [\#1081](https://github.com/ParsePlatform/parse-server/pull/1081) (flovilmart)
* Fix: Clear the session-user cache when changing \_User objects [\#1072](https://github.com/ParsePlatform/parse-server/pull/1072) (gfosco)
* Fix: Bug related to subqueries on unfetched objects [\#1046](https://github.com/ParsePlatform/parse-server/pull/1046) (flovilmart)
* Fix: Properly urlencode parameters for email validation and password reset [\#1001](https://github.com/ParsePlatform/parse-server/pull/1001) (flovilmart)
* Fix: Better sanitization/decoding of object data for afterSave triggers [\#992](https://github.com/ParsePlatform/parse-server/pull/992) (flovilmart)
* Fix: Changes default encoding for httpRequest [\#892](https://github.com/ParsePlatform/parse-server/pull/892) (flovilmart)

### 2.1.6

* Improvement: Full query support for badge Increment \(\#931\) [\#983](https://github.com/ParsePlatform/parse-server/pull/983) (flovilmart)
* Improvement: Shutdown standalone parse server gracefully [\#958](https://github.com/ParsePlatform/parse-server/pull/958) (raulr)
* Improvement: Add database options to ParseServer constructor and pass to MongoStorageAdapter [\#956](https://github.com/ParsePlatform/parse-server/pull/956) (steven-supersolid)
* Improvement: AuthData logic refactor [\#952](https://github.com/ParsePlatform/parse-server/pull/952) (flovilmart)
* Improvement: Changed FileLoggerAdapterSpec to fail gracefully on Windows [\#946](https://github.com/ParsePlatform/parse-server/pull/946) (aneeshd16)
* Improvement: Add new schema collection type and replace all usages of direct mongo collection for schema operations. [\#943](https://github.com/ParsePlatform/parse-server/pull/943) (nlutsenko)
* Improvement: Adds CLP API to Schema router [\#898](https://github.com/ParsePlatform/parse-server/pull/898) (flovilmart)
* Fix: Cleans up authData null keys on login for android crash [\#978](https://github.com/ParsePlatform/parse-server/pull/978) (flovilmart)
* Fix: Do master query for before/afterSaveHook [\#959](https://github.com/ParsePlatform/parse-server/pull/959) (wangmengyan95)
* Fix: re-add shebang [\#944](https://github.com/ParsePlatform/parse-server/pull/944) (flovilmart)
* Fix: Added test command for Windows support [\#886](https://github.com/ParsePlatform/parse-server/pull/886) (aneeshd16)

### 2.1.5

* New: FileAdapter for Google Cloud Storage [\#708](https://github.com/ParsePlatform/parse-server/pull/708) (mcdonamp)
* Improvement: Minimize extra schema queries in some scenarios. [\#919](https://github.com/ParsePlatform/parse-server/pull/919) (Marco129)
* Improvement: Move DatabaseController and Schema fully to adaptive mongo collection. [\#909](https://github.com/ParsePlatform/parse-server/pull/909) (nlutsenko)
* Improvement: Cleanup PushController/PushRouter, remove raw mongo collection access. [\#903](https://github.com/ParsePlatform/parse-server/pull/903) (nlutsenko)
* Improvement: Increment badge the right way [\#902](https://github.com/ParsePlatform/parse-server/pull/902) (flovilmart)
* Improvement: Migrate ParseGlobalConfig to new database storage API. [\#901](https://github.com/ParsePlatform/parse-server/pull/901) (nlutsenko)
* Improvement: Improve delete flow for non-existent \_Join collection [\#881](https://github.com/ParsePlatform/parse-server/pull/881) (Marco129)
* Improvement: Adding a role scenario test for issue 827 [\#878](https://github.com/ParsePlatform/parse-server/pull/878) (gfosco)
* Improvement: Test empty authData block on login for \#413 [\#863](https://github.com/ParsePlatform/parse-server/pull/863) (gfosco)
* Improvement: Modified the npm dev script to support Windows [\#846](https://github.com/ParsePlatform/parse-server/pull/846) (aneeshd16)
* Improvement: Move HooksController to use MongoCollection instead of direct Mongo access. [\#844](https://github.com/ParsePlatform/parse-server/pull/844) (nlutsenko)
* Improvement: Adds public\_html and views for packaging [\#839](https://github.com/ParsePlatform/parse-server/pull/839) (flovilmart)
* Improvement: Better support for windows builds [\#831](https://github.com/ParsePlatform/parse-server/pull/831) (flovilmart)
* Improvement: Convert Schema.js to ES6 class. [\#826](https://github.com/ParsePlatform/parse-server/pull/826) (nlutsenko)
* Improvement: Remove duplicated instructions [\#816](https://github.com/ParsePlatform/parse-server/pull/816) (hramos)
* Improvement: Completely migrate SchemasRouter to new MongoCollection API. [\#794](https://github.com/ParsePlatform/parse-server/pull/794) (nlutsenko)
* Fix: Do not require where clause in $dontSelect condition on queries. [\#925](https://github.com/ParsePlatform/parse-server/pull/925) (nlutsenko)
* Fix: Make sure that ACLs propagate to before/after save hooks. [\#924](https://github.com/ParsePlatform/parse-server/pull/924) (nlutsenko)
* Fix: Support params option in Parse.Cloud.httpRequest. [\#912](https://github.com/ParsePlatform/parse-server/pull/912) (carmenlau)
* Fix: Fix flaky Parse.GeoPoint test. [\#908](https://github.com/ParsePlatform/parse-server/pull/908) (nlutsenko)
* Fix: Handle legacy \_client\_permissions key in \_SCHEMA. [\#900](https://github.com/ParsePlatform/parse-server/pull/900) (drew-gross)
* Fix: Fixes bug when querying equalTo on objectId and relation [\#887](https://github.com/ParsePlatform/parse-server/pull/887) (flovilmart)
* Fix: Allow crossdomain on filesRouter [\#876](https://github.com/ParsePlatform/parse-server/pull/876) (flovilmart)
* Fix: Remove limit when counting results. [\#867](https://github.com/ParsePlatform/parse-server/pull/867) (gfosco)
* Fix: beforeSave changes should propagate to the response [\#865](https://github.com/ParsePlatform/parse-server/pull/865) (gfosco)
* Fix: Delete relation field when \_Join collection not exist [\#864](https://github.com/ParsePlatform/parse-server/pull/864) (Marco129)
* Fix: Related query on non-existing column [\#861](https://github.com/ParsePlatform/parse-server/pull/861) (gfosco)
* Fix: Update markdown in .github/ISSUE\_TEMPLATE.md [\#859](https://github.com/ParsePlatform/parse-server/pull/859) (igorshubovych)
* Fix: Issue with creating wrong \_Session for Facebook login [\#857](https://github.com/ParsePlatform/parse-server/pull/857) (tobernguyen)
* Fix: Leak warnings in tests, use mongodb-runner from node\_modules [\#843](https://github.com/ParsePlatform/parse-server/pull/843) (drew-gross)
* Fix: Reversed roles lookup [\#841](https://github.com/ParsePlatform/parse-server/pull/841) (flovilmart)
* Fix: Improves loading of Push Adapter, fix loading of S3Adapter [\#833](https://github.com/ParsePlatform/parse-server/pull/833) (flovilmart)
* Fix: Add field to system schema [\#828](https://github.com/ParsePlatform/parse-server/pull/828) (Marco129)

### 2.1.4

* New: serverInfo endpoint that returns server version and info about the server's features
* Improvement: Add support for badges on iOS
* Improvement: Improve failure handling in cloud code http requests
* Improvement: Add support for queries on pointers and relations
* Improvement: Add support for multiple $in clauses in a query
* Improvement: Add allowClientClassCreation config option
* Improvement: Allow atomically setting subdocument keys
* Improvement: Allow arbitrarily deeply nested roles
* Improvement: Set proper content-type in S3 File Adapter
* Improvement: S3 adapter auto-creates buckets
* Improvement: Better error messages for many errors
* Performance: Improved algorithm for validating client keys
* Experimental: Parse Hooks and Hooks API
* Experimental: Email verification and password reset emails
* Experimental: Improve compatability of logs feature with Parse.com
* Fix: Fix for attempting to delete missing classes via schemas API
* Fix: Allow creation of system classes via schemas API
* Fix: Allow missing where cause in $select
* Fix: Improve handling of invalid object ids
* Fix: Replace query overwriting existing query
* Fix: Propagate installationId in cloud code triggers
* Fix: Session expiresAt is now a Date instead of a string
* Fix: Fix count queries
* Fix: Disallow _Role objects without names or without ACL
* Fix: Better handling of invalid types submitted
* Fix: beforeSave will not be triggered for attempts to save with invalid authData
* Fix: Fix duplicate device token issues on Android
* Fix: Allow empty authData on signup
* Fix: Allow Master Key Headers (CORS)
* Fix: Fix bugs if JavaScript key was not provided in server configuration
* Fix: Parse Files on objects can now be stored without URLs
* Fix: allow both objectId or installationId when modifying installation
* Fix: Command line works better when not given options

### 2.1.3

* Feature: Add initial support for in-app purchases
* Feature: Better error messages when attempting to run the server on a port that is already in use or without a server URL
* Feature: Allow customization of max file size
* Performance: Faster saves if not using beforeSave triggers
* Fix: Send session token in response to current user endpoint
* Fix: Remove triggers for _Session collection
* Fix: Improve compatability of cloud code beforeSave hook for newly created object
* Fix: ACL creation for master key only objects
* Fix: Allow uploading files without Content-Type
* Fix: Add features to http request to match Parse.com
* Fix: Bugs in development script when running from locations other than project root
* Fix: Can pass query constraints in URL
* Fix: Objects with legacy "_tombstone" key now don't cause issues.
* Fix: Allow nested keys in objects to begin with underscores
* Fix: Allow correct headers for CORS

### 2.1.2

* Change: The S3 file adapter constructor requires a bucket name
* Fix: Parse Query should throw if improperly encoded
* Fix: Issue where roles were not used in some requests
* Fix: serverURL will no longer default to api.parse.com/1

### 2.1.1

* Experimental: Schemas API support for DELETE operations
* Fix: Session token issue fetching Users
* Fix: Facebook auth validation
* Fix: Invalid error when deleting missing session

### 2.1.0

* Feature: Support for additional OAuth providers
* Feature: Ability to implement custom OAuth providers
* Feature: Support for deleting Parse Files
* Feature: Allow querying roles
* Feature: Support for logs, extensible via Log Adapter
* Feature: New Push Adapter for sending push notifications through OneSignal
* Feature: Tighter default security for Users
* Feature: Pass parameters to cloud code in query string
* Feature: Disable anonymous users via configuration.
* Experimental: Schemas API support for PUT operations
* Fix: Prevent installation ID from being added to User
* Fix: Becoming a user works properly with sessions
* Fix: Including multiple object when some object are unavailable will get all the objects that are available
* Fix: Invalid URL for Parse Files
* Fix: Making a query without a limit now returns 100 results
* Fix: Expose installation id in cloud code
* Fix: Correct username for Anonymous users
* Fix: Session token issue after fetching user
* Fix: Issues during install process
* Fix: Issue with Unity SDK sending _noBody

### 2.0.8

* Add: support for Android and iOS push notifications
* Experimental: cloud code validation hooks (can mark as non-experimental after we have docs)
* Experimental: support for schemas API (GET and POST only)
* Experimental: support for Parse Config (GET and POST only)
* Fix: Querying objects with equality constraint on array column
* Fix: User logout will remove session token
* Fix: Various files related bugs
* Fix: Force minimum node version 4.3 due to security issues in earlier version
* Performance Improvement: Improved caching
