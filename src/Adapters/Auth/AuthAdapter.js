/*eslint no-unused-vars: "off"*/
export class AuthAdapter {
  constructor() {
    /**
     * Usage policy
     * default: can be combined with ONE additional auth provider if additional configured on user
     * additional: could be only used with a default policy auth provider
     * solo: Will ignore ALL additional providers if additional configured on user
     */
    this.policy = 'default';
  }
  /**
  @param appIds: the specified app ids in the configuration
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @returns a promise that resolves if the applicationId is valid
   */
  validateAppId(appIds, authData, options, req) {
    return Promise.resolve({});
  }

  /**
   * Legacy usage, if provided it will be triggered when authData related to this provider is touched (signup/update/login)
   * otherwise you should implement validateSetup, validateLogin and validateUpdate
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @param user: Parse.User instance if Parse.User found
  @returns a promise that resolves, the resolved value will be handled by the server like:
  - resolve undefined|void|{} parse server will save authData
  - resolve { doNotSave: boolean, response: Object} parse server will do not save provided authData and send response to the client under authDataResponse
  - resolve { response: Object } parse server will save authData and send response to the client under authDataResponse
  - resolve { response: Object, save: Object } parse server will save the object provided into `save` key and send response to the client under authDataResponse
   */
  validateAuthData(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide for the first time this auth provider
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @param user: Parse.User instance if Parse.User found
  @returns a promise that resolves, the resolved value will be handled by the server like:
  - resolve undefined|void|{} parse server will save authData
  - resolve { doNotSave: boolean, response: Object} parse server will do not save provided authData and send response to the client under authDataResponse
  - resolve { response: Object } parse server will save authData and send response to the client under authDataResponse
  - resolve { response: Object, save: Object } parse server will save the object provided into `save` key and send response to the client under authDataResponse
   */
  validateSetUp(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * he is not logged in and has already set this provider before
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @param user: Parse.User instance if Parse.User found
  @returns a promise that resolves, the resolved value will be handled by the server like:
  - resolve undefined|void|{} parse server will save authData
  - resolve { doNotSave: boolean, response: Object} parse server will do not save provided authData and send response to the client under authDataResponse
  - resolve { response: Object } parse server will save authData and send response to the client under authDataResponse
  - resolve { response: Object, save: Object } parse server will save the object provided into `save` key and send response to the client under authDataResponse
   */
  validateLogin(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered when user provide authData related to this provider
   * he is logged in and has already set this provider before
  @param authData: the client provided authData
  @param options: additional options
  @param req: RestWrite instance with config/auth/data
  @param user: Parse.User instance if Parse.User found
  @returns a promise that resolves, the resolved value will be handled by the server like:
  - resolve undefined|void|{} parse server will save authData
  - resolve { doNotSave: boolean, response: Object} parse server will do not save provided authData and send response to the client under authDataResponse
  - resolve { response: Object } parse server will save authData and send response to the client under authDataResponse
  - resolve { response: Object, save: Object } parse server will save the object provided into `save` key and send response to the client under authDataResponse
   */
  validateUpdate(authData, options, req, user) {
    return Promise.resolve({});
  }

  /**
   * Triggered in pre authentication process if needed (like webauthn, SMS OTP)
   * @param challengeData: data provided by the client
   * @param authData: auth data provided by the client, can be used for validation
   * @param options: additional options
   * @param req: RestWrite instance with config/auth/data
   * @param user: Parse.User instance if Parse.User found
   * @returns a promise that resolves, resolved value will be added to challenge response under challenge key
   */
  challenge(challengeData, authData, options, req, user) {
    return Promise.resolve({});
  }
}

export default AuthAdapter;
