/**
 * @interface ParseServerOptions
 * @property {AccountLockoutOptions} accountLockout The account lockout policy for failed login attempts.
 * @property {Boolean} allowClientClassCreation Enable (or disable) client class creation, defaults to true
 * @property {Boolean} allowCustomObjectId Enable (or disable) custom objectId
 * @property {String[]} allowHeaders Add headers to Access-Control-Allow-Headers
 * @property {String} allowOrigin Sets the origin to Access-Control-Allow-Origin
 * @property {Adapter<AnalyticsAdapter>} analyticsAdapter Adapter module for the analytics
 * @property {String} appId Your Parse Application ID
 * @property {String} appName Sets the app name
 * @property {Any} auth Configuration for your authentication providers, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#oauth-and-3rd-party-authentication
 * @property {Adapter<CacheAdapter>} cacheAdapter Adapter module for the cache
 * @property {Number} cacheMaxSize Sets the maximum size for the in memory cache, defaults to 10000
 * @property {Number} cacheTTL Sets the TTL for the in memory cache (in ms), defaults to 5000 (5 seconds)
 * @property {String} clientKey Key for iOS, MacOS, tvOS clients
 * @property {String} cloud Full path to your cloud code main.js
 * @property {Number|Boolean} cluster Run with cluster, optionally set the number of processes default to os.cpus().length
 * @property {String} collectionPrefix A collection prefix for the classes
 * @property {CustomPagesOptions} customPages custom pages for password validation and reset
 * @property {Adapter<StorageAdapter>} databaseAdapter Adapter module for the database
 * @property {DatabaseOptions} databaseOptions Options to pass to the database client
 * @property {String} databaseURI The full URI to your database. Supported databases are mongodb or postgres.
 * @property {Boolean} directAccess Set to `true` if Parse requests within the same Node.js environment as Parse Server should be routed to Parse Server directly instead of via the HTTP interface. Default is `false`.<br><br>If set to `false` then Parse requests within the same Node.js environment as Parse Server are executed as HTTP requests sent to Parse Server via the `serverURL`. For example, a `Parse.Query` in Cloud Code is calling Parse Server via a HTTP request. The server is essentially making a HTTP request to itself, unnecessarily using network resources such as network ports.<br><br>⚠️ In environments where multiple Parse Server instances run behind a load balancer and Parse requests within the current Node.js environment should be routed via the load balancer and distributed as HTTP requests among all instances via the `serverURL`, this should be set to `false`.
 * @property {String} dotNetKey Key for Unity and .Net SDK
 * @property {Adapter<MailAdapter>} emailAdapter Adapter module for email sending
 * @property {Boolean} emailVerifyTokenReuseIfValid Set to `true` if a email verification token should be reused in case another token is requested but there is a token that is still valid, i.e. has not expired. This avoids the often observed issue that a user requests multiple emails and does not know which link contains a valid token because each newly generated token would invalidate the previous token.<br><br>Default is `false`.<br>Requires option `verifyUserEmails: true`.
 * @property {Number} emailVerifyTokenValidityDuration Set the validity duration of the email verification token in seconds after which the token expires. The token is used in the link that is set in the email. After the token expires, the link becomes invalid and a new link has to be sent. If the option is not set or set to `undefined`, then the token never expires.<br><br>For example, to expire the token after 2 hours, set a value of 7200 seconds (= 60 seconds * 60 minutes * 2 hours).<br><br>Default is `undefined`.<br>Requires option `verifyUserEmails: true`.
 * @property {Boolean} enableAnonymousUsers Enable (or disable) anonymous users, defaults to true
 * @property {Boolean} enableExpressErrorHandler Enables the default express error handler for all errors
 * @property {String} encryptionKey Key for encrypting your files
 * @property {Boolean} enforcePrivateUsers Set to true if new users should be created without public read and write access.
 * @property {Boolean} expireInactiveSessions Sets wether we should expire the inactive sessions, defaults to true
 * @property {String} fileKey Key for your files
 * @property {Adapter<FilesAdapter>} filesAdapter Adapter module for the files sub-system
 * @property {FileUploadOptions} fileUpload Options for file uploads
 * @property {String} graphQLPath Mount path for the GraphQL endpoint, defaults to /graphql
 * @property {String} graphQLSchema Full path to your GraphQL custom schema.graphql file
 * @property {String} host The host to serve ParseServer on, defaults to 0.0.0.0
 * @property {IdempotencyOptions} idempotencyOptions Options for request idempotency to deduplicate identical requests that may be caused by network issues. Caution, this is an experimental feature that may not be appropriate for production.
 * @property {String} javascriptKey Key for the Javascript SDK
 * @property {Boolean} jsonLogs Log as structured JSON objects
 * @property {LiveQueryOptions} liveQuery parse-server's LiveQuery configuration object
 * @property {LiveQueryServerOptions} liveQueryServerOptions Live query server configuration options (will start the liveQuery server)
 * @property {Adapter<LoggerAdapter>} loggerAdapter Adapter module for the logging sub-system
 * @property {String} logLevel Sets the level for logs
 * @property {String} logsFolder Folder for the logs (defaults to './logs'); set to null to disable file based logging
 * @property {String} masterKey Your Parse Master Key
 * @property {String[]} masterKeyIps Restrict masterKey to be used by only these ips, defaults to [] (allow all ips)
 * @property {Number} maxLimit Max value for limit option on queries, defaults to unlimited
 * @property {Number|String} maxLogFiles Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. (default: null)
 * @property {String} maxUploadSize Max file size for uploads, defaults to 20mb
 * @property {Union} middleware middleware for express server, can be string or function
 * @property {Boolean} mountGraphQL Mounts the GraphQL endpoint
 * @property {String} mountPath Mount path for the server, defaults to /parse
 * @property {Boolean} mountPlayground Mounts the GraphQL Playground - never use this option in production
 * @property {Number} objectIdSize Sets the number of characters in generated object id's, default 10
 * @property {PagesOptions} pages The options for pages such as password reset and email verification. Caution, this is an experimental feature that may not be appropriate for production.
 * @property {PasswordPolicyOptions} passwordPolicy The password policy for enforcing password related rules.
 * @property {String} playgroundPath Mount path for the GraphQL Playground, defaults to /playground
 * @property {Number} port The port to run the ParseServer, defaults to 1337.
 * @property {Boolean} preserveFileName Enable (or disable) the addition of a unique hash to the file names
 * @property {Boolean} preventLoginWithUnverifiedEmail Set to `true` to prevent a user from logging in if the email has not yet been verified and email verification is required.<br><br>Default is `false`.<br>Requires option `verifyUserEmails: true`.
 * @property {ProtectedFields} protectedFields Protected fields that should be treated with extra security when fetching details.
 * @property {String} publicServerURL Public URL to your parse server with http:// or https://.
 * @property {Any} push Configuration for push, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#push-notifications
 * @property {String} readOnlyMasterKey Read-only key, which has the same capabilities as MasterKey without writes
 * @property {String} restAPIKey Key for REST calls
 * @property {Boolean} revokeSessionOnPasswordReset When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions.
 * @property {Boolean} scheduledPush Configuration for push scheduling, defaults to false.
 * @property {SecurityOptions} security The security options to identify and report weak security settings.
 * @property {Function} serverCloseComplete Callback when server has closed
 * @property {Function} serverStartComplete Callback when server has started
 * @property {String} serverURL URL to your parse server with http:// or https://.
 * @property {Number} sessionLength Session duration, in seconds, defaults to 1 year
 * @property {Boolean} silent Disables console output
 * @property {Boolean} startLiveQueryServer Starts the liveQuery server
 * @property {String[]} userSensitiveFields Personally identifiable information fields in the user table the should be removed for non-authorized users. Deprecated @see protectedFields
 * @property {Boolean} verbose Set the logging to verbose
 * @property {Boolean} verifyUserEmails Set to `true` to require users to verify their email address to complete the sign-up process.<br><br>Default is `false`.
 * @property {String} webhookKey Key sent with outgoing webhook calls
 */

/**
 * @interface SecurityOptions
 * @property {CheckGroup[]} checkGroups The security check groups to run. This allows to add custom security checks or override existing ones. Default are the groups defined in `CheckGroups.js`.
 * @property {Boolean} enableCheck Is true if Parse Server should check for weak security settings.
 * @property {Boolean} enableCheckLog Is true if the security check report should be written to logs. This should only be enabled temporarily to not expose weak security settings in logs.
 */

/**
 * @interface PagesOptions
 * @property {PagesRoute[]} customRoutes The custom routes.
 * @property {PagesCustomUrlsOptions} customUrls The URLs to the custom pages.
 * @property {Boolean} enableLocalization Is true if pages should be localized; this has no effect on custom page redirects.
 * @property {Boolean} enableRouter Is true if the pages router should be enabled; this is required for any of the pages options to take effect. Caution, this is an experimental feature that may not be appropriate for production.
 * @property {Boolean} forceRedirect Is true if responses should always be redirects and never content, false if the response type should depend on the request type (GET request -> content response; POST request -> redirect response).
 * @property {String} localizationFallbackLocale The fallback locale for localization if no matching translation is provided for the given locale. This is only relevant when providing translation resources via JSON file.
 * @property {String} localizationJsonPath The path to the JSON file for localization; the translations will be used to fill template placeholders according to the locale.
 * @property {String} pagesEndpoint The API endpoint for the pages. Default is 'apps'.
 * @property {String} pagesPath The path to the pages directory; this also defines where the static endpoint '/apps' points to. Default is the './public/' directory.
 * @property {Object} placeholders The placeholder keys and values which will be filled in pages; this can be a simple object or a callback function.
 */

/**
 * @interface PagesRoute
 * @property {Function} handler The route handler that is an async function.
 * @property {String} method The route method, e.g. 'GET' or 'POST'.
 * @property {String} path The route path.
 */

/**
 * @interface PagesCustomUrlsOptions
 * @property {String} emailVerificationLinkExpired The URL to the custom page for email verification -> link expired.
 * @property {String} emailVerificationLinkInvalid The URL to the custom page for email verification -> link invalid.
 * @property {String} emailVerificationSendFail The URL to the custom page for email verification -> link send fail.
 * @property {String} emailVerificationSendSuccess The URL to the custom page for email verification -> resend link -> success.
 * @property {String} emailVerificationSuccess The URL to the custom page for email verification -> success.
 * @property {String} passwordReset The URL to the custom page for password reset.
 * @property {String} passwordResetLinkInvalid The URL to the custom page for password reset -> link invalid.
 * @property {String} passwordResetSuccess The URL to the custom page for password reset -> success.
 */

/**
 * @interface CustomPagesOptions
 * @property {String} choosePassword choose password page path
 * @property {String} expiredVerificationLink expired verification link page path
 * @property {String} invalidLink invalid link page path
 * @property {String} invalidPasswordResetLink invalid password reset link page path
 * @property {String} invalidVerificationLink invalid verification link page path
 * @property {String} linkSendFail verification link send fail page path
 * @property {String} linkSendSuccess verification link send success page path
 * @property {String} parseFrameURL for masking user-facing pages
 * @property {String} passwordResetSuccess password reset success page path
 * @property {String} verifyEmailSuccess verify email success page path
 */

/**
 * @interface LiveQueryOptions
 * @property {String[]} classNames parse-server's LiveQuery classNames
 * @property {Adapter<PubSubAdapter>} pubSubAdapter LiveQuery pubsub adapter
 * @property {Any} redisOptions parse-server's LiveQuery redisOptions
 * @property {String} redisURL parse-server's LiveQuery redisURL
 * @property {Adapter<WSSAdapter>} wssAdapter Adapter module for the WebSocketServer
 */

/**
 * @interface LiveQueryServerOptions
 * @property {String} appId This string should match the appId in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same appId.
 * @property {Number} cacheTimeout Number in milliseconds. When clients provide the sessionToken to the LiveQuery server, the LiveQuery server will try to fetch its ParseUser's objectId from parse server and store it in the cache. The value defines the duration of the cache. Check the following Security section and our protocol specification for details, defaults to 5 * 1000 ms (5 seconds).
 * @property {Any} keyPairs A JSON object that serves as a whitelist of keys. It is used for validating clients when they try to connect to the LiveQuery server. Check the following Security section and our protocol specification for details.
 * @property {String} logLevel This string defines the log level of the LiveQuery server. We support VERBOSE, INFO, ERROR, NONE, defaults to INFO.
 * @property {String} masterKey This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey.
 * @property {Number} port The port to run the LiveQuery server, defaults to 1337.
 * @property {Adapter<PubSubAdapter>} pubSubAdapter LiveQuery pubsub adapter
 * @property {Any} redisOptions parse-server's LiveQuery redisOptions
 * @property {String} redisURL parse-server's LiveQuery redisURL
 * @property {String} serverURL This string should match the serverURL in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same serverURL.
 * @property {Number} websocketTimeout Number of milliseconds between ping/pong frames. The WebSocket server sends ping/pong frames to the clients to keep the WebSocket alive. This value defines the interval of the ping/pong frame from the server to clients, defaults to 10 * 1000 ms (10 s).
 * @property {Adapter<WSSAdapter>} wssAdapter Adapter module for the WebSocketServer
 */

/**
 * @interface IdempotencyOptions
 * @property {String[]} paths An array of paths for which the feature should be enabled. The mount path must not be included, for example instead of `/parse/functions/myFunction` specifiy `functions/myFunction`. The entries are interpreted as regular expression, for example `functions/.*` matches all functions, `jobs/.*` matches all jobs, `classes/.*` matches all classes, `.*` matches all paths.
 * @property {Number} ttl The duration in seconds after which a request record is discarded from the database, defaults to 300s.
 */

/**
 * @interface AccountLockoutOptions
 * @property {Number} duration Set the duration in minutes that a locked-out account remains locked out before automatically becoming unlocked.<br><br>Valid values are greater than `0` and less than `100000`.
 * @property {Number} threshold Set the number of failed sign-in attempts that will cause a user account to be locked. If the account is locked. The account will unlock after the duration set in the `duration` option has passed and no further login attempts have been made.<br><br>Valid values are greater than `0` and less than `1000`.
 * @property {Boolean} unlockOnPasswordReset Set to `true`  if the account should be unlocked after a successful password reset.<br><br>Default is `false`.<br>Requires options `duration` and `threshold` to be set.
 */

/**
 * @interface PasswordPolicyOptions
 * @property {Boolean} doNotAllowUsername Set to `true` to disallow the username as part of the password.<br><br>Default is `false`.
 * @property {Number} maxPasswordAge Set the number of days after which a password expires. Login attempts fail if the user does not reset the password before expiration.
 * @property {Number} maxPasswordHistory Set the number of previous password that will not be allowed to be set as new password. If the option is not set or set to `0`, no previous passwords will be considered.<br><br>Valid values are >= `0` and <= `20`.<br>Default is `0`.
 * @property {Boolean} resetTokenReuseIfValid Set to `true` if a password reset token should be reused in case another token is requested but there is a token that is still valid, i.e. has not expired. This avoids the often observed issue that a user requests multiple emails and does not know which link contains a valid token because each newly generated token would invalidate the previous token.<br><br>Default is `false`.
 * @property {Number} resetTokenValidityDuration Set the validity duration of the password reset token in seconds after which the token expires. The token is used in the link that is set in the email. After the token expires, the link becomes invalid and a new link has to be sent. If the option is not set or set to `undefined`, then the token never expires.<br><br>For example, to expire the token after 2 hours, set a value of 7200 seconds (= 60 seconds * 60 minutes * 2 hours).<br><br>Default is `undefined`.
 * @property {String} validationError Set the error message to be sent.<br><br>Default is `Password does not meet the Password Policy requirements.`
 * @property {Function} validatorCallback Set a callback function to validate a password to be accepted.<br><br>If used in combination with `validatorPattern`, the password must pass both to be accepted.
 * @property {String} validatorPattern Set the regular expression validation pattern a password must match to be accepted.<br><br>If used in combination with `validatorCallback`, the password must pass both to be accepted.
 */

/**
 * @interface FileUploadOptions
 * @property {Boolean} enableForAnonymousUser Is true if file upload should be allowed for anonymous users.
 * @property {Boolean} enableForAuthenticatedUser Is true if file upload should be allowed for authenticated users.
 * @property {Boolean} enableForPublic Is true if file upload should be allowed for anyone, regardless of user authentication.
 */

/**
 * @interface DatabaseOptions
 * @property {Boolean} enableSchemaHooks Enables database real-time hooks to update single schema cache. Set to `true` if using multiple Parse Servers instances connected to the same database. Failing to do so will cause a schema change to not propagate to all instances and re-syncing will only happen when the instances restart. To use this feature with MongoDB, a replica set cluster with [change stream](https://docs.mongodb.com/manual/changeStreams/#availability) support is required.
 */
