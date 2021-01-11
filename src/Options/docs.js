/**
 * @interface ParseServerOptions
 * @property {AccountLockoutOptions} accountLockout account lockout policy for failed login attempts
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
 * @property {Any} databaseOptions Options to pass to the mongodb client
 * @property {String} databaseURI The full URI to your database. Supported databases are mongodb or postgres.
 * @property {ACLOptions} defaultACL Options for default ACL on classes
 * @property {Boolean} directAccess Replace HTTP Interface when using JS SDK in current node runtime, defaults to false. Caution, this is an experimental feature that may not be appropriate for production.
 * @property {String} dotNetKey Key for Unity and .Net SDK
 * @property {Adapter<MailAdapter>} emailAdapter Adapter module for email sending
 * @property {Boolean} emailVerifyTokenReuseIfValid an existing email verify token should be reused when resend verification email is requested
 * @property {Number} emailVerifyTokenValidityDuration Email verification token validity duration, in seconds
 * @property {Boolean} enableAnonymousUsers Enable (or disable) anonymous users, defaults to true
 * @property {Boolean} enableExpressErrorHandler Enables the default express error handler for all errors
 * @property {Boolean} enableSingleSchemaCache Use a single schema cache shared across requests. Reduces number of queries made to _SCHEMA, defaults to false, i.e. unique schema cache per request.
 * @property {String} encryptionKey Key for encrypting your files
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
 * @property {PasswordPolicyOptions} passwordPolicy Password policy for enforcing password related rules
 * @property {String} playgroundPath Mount path for the GraphQL Playground, defaults to /playground
 * @property {Number} port The port to run the ParseServer, defaults to 1337.
 * @property {Boolean} preserveFileName Enable (or disable) the addition of a unique hash to the file names
 * @property {Boolean} preventLoginWithUnverifiedEmail Prevent user from login if email is not verified and PARSE_SERVER_VERIFY_USER_EMAILS is true, defaults to false
 * @property {ProtectedFields} protectedFields Protected fields that should be treated with extra security when fetching details.
 * @property {String} publicServerURL Public URL to your parse server with http:// or https://.
 * @property {Any} push Configuration for push, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#push-notifications
 * @property {String} readOnlyMasterKey Read-only key, which has the same capabilities as MasterKey without writes
 * @property {String} restAPIKey Key for REST calls
 * @property {Boolean} revokeSessionOnPasswordReset When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions.
 * @property {Boolean} scheduledPush Configuration for push scheduling, defaults to false.
 * @property {Number} schemaCacheTTL The TTL for caching the schema for optimizing read/write operations. You should put a long TTL when your DB is in production. default to 5000; set 0 to disable.
 * @property {Function} serverCloseComplete Callback when server has closed
 * @property {Function} serverStartComplete Callback when server has started
 * @property {String} serverURL URL to your parse server with http:// or https://.
 * @property {Number} sessionLength Session duration, in seconds, defaults to 1 year
 * @property {Boolean} silent Disables console output
 * @property {Boolean} startLiveQueryServer Starts the liveQuery server
 * @property {String[]} userSensitiveFields Personally identifiable information fields in the user table the should be removed for non-authorized users. Deprecated @see protectedFields
 * @property {Boolean} verbose Set the logging to verbose
 * @property {Boolean} verifyUserEmails Enable (or disable) user email validation, defaults to false
 * @property {String} webhookKey Key sent with outgoing webhook calls
 */

/**
 * @interface CustomPagesOptions
 * @property {String} choosePassword choose password page path
 * @property {String} invalidLink invalid link page path
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
 * @property {Number} duration number of minutes that a locked-out account remains locked out before automatically becoming unlocked.
 * @property {Number} threshold number of failed sign-in attempts that will cause a user account to be locked
 */

/**
 * @interface PasswordPolicyOptions
 * @property {Boolean} doNotAllowUsername disallow username in passwords
 * @property {Number} maxPasswordAge days for password expiry
 * @property {Number} maxPasswordHistory setting to prevent reuse of previous n passwords
 * @property {Boolean} resetTokenReuseIfValid resend token if it's still valid
 * @property {Number} resetTokenValidityDuration time for token to expire
 * @property {Function} validatorCallback a callback function to be invoked to validate the password
 * @property {String} validatorPattern a RegExp object or a regex string representing the pattern to enforce
 */

/**
 * @interface FileUploadOptions
 * @property {Boolean} enableForAnonymousUser Is true if file upload should be allowed for anonymous users.
 * @property {Boolean} enableForAuthenticatedUser Is true if file upload should be allowed for authenticated users.
 * @property {Boolean} enableForPublic Is true if file upload should be allowed for anyone, regardless of user authentication.
 */
