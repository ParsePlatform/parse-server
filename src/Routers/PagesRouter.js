import PromiseRouter from '../PromiseRouter';
import Config from '../Config';
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { Parse } from 'parse/node';
import Utils from '../Utils';
import mustache from 'mustache';
import Page from '../Page';

// All pages with custom page key for reference and file name
const pages = Object.freeze({
  passwordReset: new Page({ id: 'passwordReset', defaultFile: 'password_reset.html' }),
  passwordResetSuccess: new Page({
    id: 'passwordResetSuccess',
    defaultFile: 'password_reset_success.html',
  }),
  passwordResetLinkInvalid: new Page({
    id: 'passwordResetLinkInvalid',
    defaultFile: 'password_reset_link_invalid.html',
  }),
  emailVerificationSuccess: new Page({
    id: 'emailVerificationSuccess',
    defaultFile: 'email_verification_success.html',
  }),
  emailVerificationSendFail: new Page({
    id: 'emailVerificationSendFail',
    defaultFile: 'email_verification_send_fail.html',
  }),
  emailVerificationSendSuccess: new Page({
    id: 'emailVerificationSendSuccess',
    defaultFile: 'email_verification_send_success.html',
  }),
  emailVerificationLinkInvalid: new Page({
    id: 'emailVerificationLinkInvalid',
    defaultFile: 'email_verification_link_invalid.html',
  }),
  emailVerificationLinkExpired: new Page({
    id: 'emailVerificationLinkExpired',
    defaultFile: 'email_verification_link_expired.html',
  }),
});

// All page parameters for reference to be used as template placeholders or query params
const pageParams = Object.freeze({
  appName: 'appName',
  appId: 'appId',
  token: 'token',
  username: 'username',
  error: 'error',
  locale: 'locale',
  publicServerUrl: 'publicServerUrl',
});

// The header prefix to add page params as response headers
const pageParamHeaderPrefix = 'x-parse-page-param-';

// The errors being thrown
const errors = Object.freeze({
  jsonFailedFileLoading: 'failed to load JSON file',
  fileOutsideAllowedScope: 'not allowed to read file outside of pages directory',
});

export class PagesRouter extends PromiseRouter {
  /**
   * Constructs a PagesRouter.
   * @param {Object} pages The pages options from the Parse Server configuration.
   */
  constructor(pages = {}) {
    super();

    // Set instance properties
    this.pagesConfig = pages;
    this.pagesEndpoint = pages.pagesEndpoint ? pages.pagesEndpoint : 'apps';
    this.pagesPath = pages.pagesPath
      ? path.resolve('./', pages.pagesPath)
      : path.resolve(__dirname, '../../public');
    this.loadJsonResource();
    this.mountPagesRoutes();
    this.mountCustomRoutes();
    this.mountStaticRoute();
  }

  verifyEmail(req) {
    const config = req.config;
    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!config) {
      this.invalidRequest();
    }

    if (!token || !username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }

    const userController = config.userController;
    return userController.verifyEmail(username, token).then(
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.emailVerificationSuccess, params);
      },
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.emailVerificationLinkExpired, params);
      }
    );
  }

  resendVerificationEmail(req) {
    const config = req.config;
    const username = req.body.username;

    if (!config) {
      this.invalidRequest();
    }

    if (!username) {
      return this.goToPage(req, pages.emailVerificationLinkInvalid);
    }

    const userController = config.userController;

    return userController.resendVerificationEmail(username).then(
      () => {
        return this.goToPage(req, pages.emailVerificationSendSuccess);
      },
      () => {
        return this.goToPage(req, pages.emailVerificationSendFail);
      }
    );
  }

  passwordReset(req) {
    const config = req.config;
    const params = {
      [pageParams.appId]: req.params.appId,
      [pageParams.appName]: config.appName,
      [pageParams.token]: req.query.token,
      [pageParams.username]: req.query.username,
      [pageParams.publicServerUrl]: config.publicServerURL,
    };
    return this.goToPage(req, pages.passwordReset, params);
  }

  requestResetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    const { username, token: rawToken } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username || !token) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }

    return config.userController.checkResetTokenValidity(username, token).then(
      () => {
        const params = {
          [pageParams.token]: token,
          [pageParams.username]: username,
          [pageParams.appId]: config.applicationId,
          [pageParams.appName]: config.appName,
        };
        return this.goToPage(req, pages.passwordReset, params);
      },
      () => {
        const params = {
          [pageParams.username]: username,
        };
        return this.goToPage(req, pages.passwordResetLinkInvalid, params);
      }
    );
  }

  resetPassword(req) {
    const config = req.config;

    if (!config) {
      this.invalidRequest();
    }

    const { username, new_password, token: rawToken } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if ((!username || !token || !new_password) && req.xhr === false) {
      return this.goToPage(req, pages.passwordResetLinkInvalid);
    }

    if (!username) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'Missing username');
    }

    if (!token) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'Missing token');
    }

    if (!new_password) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'Missing password');
    }

    return config.userController
      .updatePassword(username, token, new_password)
      .then(
        () => {
          return Promise.resolve({
            success: true,
          });
        },
        err => {
          return Promise.resolve({
            success: false,
            err,
          });
        }
      )
      .then(result => {
        if (req.xhr) {
          if (result.success) {
            return Promise.resolve({
              status: 200,
              response: 'Password successfully reset',
            });
          }
          if (result.err) {
            throw new Parse.Error(Parse.Error.OTHER_CAUSE, `${result.err}`);
          }
        }

        const query = result.success
          ? {
              [pageParams.username]: username,
            }
          : {
              [pageParams.username]: username,
              [pageParams.token]: token,
              [pageParams.appId]: config.applicationId,
              [pageParams.error]: result.err,
              [pageParams.appName]: config.appName,
            };
        const page = result.success ? pages.passwordResetSuccess : pages.passwordReset;

        return this.goToPage(req, page, query, false);
      });
  }

  /**
   * Returns page content if the page is a local file or returns a
   * redirect to a custom page.
   * @param {Object} req The express request.
   * @param {Page} page The page to go to.
   * @param {Object} [params={}] The query parameters to attach to the URL in case of
   * HTTP redirect responses for POST requests, or the placeholders to fill into
   * the response content in case of HTTP content responses for GET requests.
   * @param {Boolean} [responseType] Is true if a redirect response should be forced,
   * false if a content response should be forced, undefined if the response type
   * should depend on the request type by default:
   * - GET request -> content response
   * - POST request -> redirect response (PRG pattern)
   * @returns {Promise<Object>} The PromiseRouter response.
   */
  goToPage(req, page, params = {}, responseType) {
    const config = req.config;

    // Determine redirect either by force, response setting or request method
    const redirect = config.pages.forceRedirect
      ? true
      : responseType !== undefined
      ? responseType
      : req.method == 'POST';

    // Include default parameters
    const defaultParams = this.getDefaultParams(config);
    if (Object.values(defaultParams).includes(undefined)) {
      return this.notFound();
    }
    params = Object.assign(params, defaultParams);

    // Add locale to params to ensure it is passed on with every request;
    // that means, once a locale is set, it is passed on to any follow-up page,
    // e.g. request_password_reset -> password_reset -> password_reset_success
    const locale = this.getLocale(req);
    params[pageParams.locale] = locale;

    // Compose paths and URLs
    const defaultFile = page.defaultFile;
    const defaultPath = this.defaultPagePath(defaultFile);
    const defaultUrl = this.composePageUrl(defaultFile, config.publicServerURL);

    // If custom URL is set redirect to it without localization
    const customUrl = config.pages.customUrls[page.id];
    if (customUrl && !Utils.isPath(customUrl)) {
      return this.redirectResponse(customUrl, params);
    }

    // Get JSON placeholders
    let placeholders = {};
    if (config.pages.enableLocalization && config.pages.localizationJsonPath) {
      placeholders = this.getJsonPlaceholders(locale, params);
    }

    // Send response
    if (config.pages.enableLocalization && locale) {
      return Utils.getLocalizedPath(defaultPath, locale).then(({ path, subdir }) =>
        redirect
          ? this.redirectResponse(
              this.composePageUrl(defaultFile, config.publicServerURL, subdir),
              params
            )
          : this.pageResponse(path, params, placeholders)
      );
    } else {
      return redirect
        ? this.redirectResponse(defaultUrl, params)
        : this.pageResponse(defaultPath, params, placeholders);
    }
  }

  /**
   * Serves a request to a static resource and localizes the resource if it
   * is a HTML file.
   * @param {Object} req The request object.
   * @returns {Promise<Object>} The response.
   */
  staticRoute(req) {
    // Get requested path
    const relativePath = req.params[0];

    // Resolve requested path to absolute path
    const absolutePath = path.resolve(this.pagesPath, relativePath);

    // If the requested file is not a HTML file send its raw content
    if (!absolutePath || !absolutePath.endsWith('.html')) {
      return this.fileResponse(absolutePath);
    }

    // Get parameters
    const params = this.getDefaultParams(req.config);
    const locale = this.getLocale(req);
    if (locale) {
      params.locale = locale;
    }

    // Get JSON placeholders
    const placeholders = this.getJsonPlaceholders(locale, params);

    return this.pageResponse(absolutePath, params, placeholders);
  }

  /**
   * Returns a translation from the JSON resource for a given locale. The JSON
   * resource is parsed according to i18next syntax.
   *
   * Example JSON content:
   * ```js
   *  {
   *    "en": {               // resource for language `en` (English)
   *      "translation": {
   *        "greeting": "Hello!"
   *      }
   *    },
   *    "de": {               // resource for language `de` (German)
   *      "translation": {
   *        "greeting": "Hallo!"
   *      }
   *    }
   *    "de-CH": {            // resource for locale `de-CH` (Swiss German)
   *      "translation": {
   *        "greeting": "Grüezi!"
   *      }
   *    }
   *  }
   * ```
   * @param {String} locale The locale to translate to.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonTranslation(locale) {
    // If there is no JSON resource
    if (this.jsonParameters === undefined) {
      return {};
    }

    // If locale is not set use the fallback locale
    locale = locale || this.pagesConfig.localizationFallbackLocale;

    // Get matching translation by locale, language or fallback locale
    const language = locale.split('-')[0];
    const resource =
      this.jsonParameters[locale] ||
      this.jsonParameters[language] ||
      this.jsonParameters[this.pagesConfig.localizationFallbackLocale] ||
      {};
    const translation = resource.translation || {};
    return translation;
  }

  /**
   * Returns a translation from the JSON resource for a given locale with
   * placeholders filled in by given parameters.
   * @param {String} locale The locale to translate to.
   * @param {Object} params The parameters to fill into any placeholders
   * within the translations.
   * @returns {Object} The translation or an empty object if no matching
   * translation was found.
   */
  getJsonPlaceholders(locale, params = {}) {
    // If localization is disabled or there is no JSON resource
    if (!this.pagesConfig.enableLocalization || !this.pagesConfig.localizationJsonPath) {
      return {};
    }

    // Get JSON placeholders
    let placeholders = this.getJsonTranslation(locale);

    // Fill in any placeholders in the translation; this allows a translation
    // to contain default placeholders like {{appName}} which are filled here
    placeholders = JSON.stringify(placeholders);
    placeholders = mustache.render(placeholders, params);
    placeholders = JSON.parse(placeholders);

    return placeholders;
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @param {Object} [params={}] The parameters to be included in the response
   * header. These will also be used to fill placeholders.
   * @param {Object} [placeholders={}] The placeholders to fill in the content.
   * These will not be included in the response header.
   * @returns {Object} The Promise Router response.
   */
  async pageResponse(path, params = {}, placeholders = {}) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }

    // Get config placeholders; can be an object, a function or an async function
    let configPlaceholders =
      typeof this.pagesConfig.placeholders === 'function'
        ? this.pagesConfig.placeholders(params)
        : Object.prototype.toString.call(this.pagesConfig.placeholders) === '[object Object]'
        ? this.pagesConfig.placeholders
        : {};
    if (configPlaceholders instanceof Promise) {
      configPlaceholders = await configPlaceholders;
    }

    // Fill placeholders
    const allPlaceholders = Object.assign({}, configPlaceholders, placeholders);
    const paramsAndPlaceholders = Object.assign({}, params, allPlaceholders);
    data = mustache.render(data, paramsAndPlaceholders);

    // Add placeholders in header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});

    return { text: data, headers: headers };
  }

  /**
   * Creates a response with file content.
   * @param {String} path The path of the file to return.
   * @returns {Object} The PromiseRouter response.
   */
  async fileResponse(path) {
    // Get file content
    let data;
    try {
      data = await this.readFile(path);
    } catch (e) {
      return this.notFound();
    }

    return { text: data };
  }

  /**
   * Reads and returns the content of a file at a given path. File reading to
   * serve content on the static route is only allowed from the pages
   * directory on downwards.
   * -----------------------------------------------------------------------
   * **WARNING:** All file reads in the PagesRouter must be executed by this
   * wrapper because it also detects and prevents common exploits.
   * -----------------------------------------------------------------------
   * @param {String} filePath The path to the file to read.
   * @returns {Promise<String>} The file content.
   */
  async readFile(filePath) {
    // Normalize path to prevent it from containing any directory changing
    // UNIX patterns which could expose the whole file system, e.g.
    // `http://example.com/parse/apps/../file.txt` requests a file outside
    // of the pages directory scope.
    const normalizedPath = path.normalize(filePath);

    // Abort if the path is outside of the path directory scope
    if (!normalizedPath.startsWith(this.pagesPath)) {
      throw errors.fileOutsideAllowedScope;
    }

    return await fs.readFile(normalizedPath, 'utf-8');
  }

  /**
   * Loads a language resource JSON file that is used for translations.
   */
  loadJsonResource() {
    if (this.pagesConfig.localizationJsonPath === undefined) {
      return;
    }
    try {
      const json = require(path.resolve('./', this.pagesConfig.localizationJsonPath));
      this.jsonParameters = json;
    } catch (e) {
      throw errors.jsonFailedFileLoading;
    }
  }

  /**
   * Extracts and returns the page default parameters from the Parse Server
   * configuration. These parameters are made accessible in every page served
   * by this router.
   * @param {Object} config The Parse Server configuration.
   * @returns {Object} The default parameters.
   */
  getDefaultParams(config) {
    return config
      ? {
          [pageParams.appId]: config.appId,
          [pageParams.appName]: config.appName,
          [pageParams.publicServerUrl]: config.publicServerURL,
        }
      : {};
  }

  /**
   * Extracts and returns the locale from an express request.
   * @param {Object} req The express request.
   * @returns {String|undefined} The locale, or undefined if no locale was set.
   */
  getLocale(req) {
    const locale =
      (req.query || {})[pageParams.locale] ||
      (req.body || {})[pageParams.locale] ||
      (req.params || {})[pageParams.locale] ||
      (req.headers || {})[pageParamHeaderPrefix + pageParams.locale];
    return locale;
  }

  /**
   * Creates a response with http redirect.
   * @param {Object} req The express request.
   * @param {String} path The path of the file to return.
   * @param {Object} params The query parameters to include.
   * @returns {Object} The Promise Router response.
   */
  async redirectResponse(url, params) {
    // Remove any parameters with undefined value
    params = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[p[0]] = p[1];
      }
      return m;
    }, {});

    // Compose URL with parameters in query
    const location = new URL(url);
    Object.entries(params).forEach(p => location.searchParams.set(p[0], p[1]));
    const locationString = location.toString();

    // Add parameters to header to allow parsing for programmatic use
    // of response, instead of having to parse the HTML content.
    const headers = Object.entries(params).reduce((m, p) => {
      if (p[1] !== undefined) {
        m[`${pageParamHeaderPrefix}${p[0].toLowerCase()}`] = p[1];
      }
      return m;
    }, {});

    return {
      status: 303,
      location: locationString,
      headers: headers,
    };
  }

  defaultPagePath(file) {
    return path.join(this.pagesPath, file);
  }

  composePageUrl(file, publicServerUrl, locale) {
    let url = publicServerUrl;
    url += url.endsWith('/') ? '' : '/';
    url += this.pagesEndpoint + '/';
    url += locale === undefined ? '' : locale + '/';
    url += file;
    return url;
  }

  notFound() {
    return {
      text: 'Not found.',
      status: 404,
    };
  }

  invalidRequest() {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized';
    throw error;
  }

  /**
   * Sets the Parse Server configuration in the request object to make it
   * easily accessible throughtout request processing.
   * @param {Object} req The request.
   * @param {Boolean} failGracefully Is true if failing to set the config should
   * not result in an invalid request response. Default is `false`.
   */
  setConfig(req, failGracefully = false) {
    req.config = Config.get(req.params.appId || req.query.appId);
    if (!req.config && !failGracefully) {
      this.invalidRequest();
    }
    return Promise.resolve();
  }

  mountPagesRoutes() {
    this.route(
      'GET',
      `/${this.pagesEndpoint}/:appId/verify_email`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.verifyEmail(req);
      }
    );

    this.route(
      'POST',
      `/${this.pagesEndpoint}/:appId/resend_verification_email`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resendVerificationEmail(req);
      }
    );

    this.route(
      'GET',
      `/${this.pagesEndpoint}/choose_password`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.passwordReset(req);
      }
    );

    this.route(
      'POST',
      `/${this.pagesEndpoint}/:appId/request_password_reset`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.resetPassword(req);
      }
    );

    this.route(
      'GET',
      `/${this.pagesEndpoint}/:appId/request_password_reset`,
      req => {
        this.setConfig(req);
      },
      req => {
        return this.requestResetPassword(req);
      }
    );
  }

  mountCustomRoutes() {
    for (const route of this.pagesConfig.customRoutes || []) {
      this.route(
        route.method,
        `/${this.pagesEndpoint}/:appId/${route.path}`,
        req => {
          this.setConfig(req);
        },
        async req => {
          const { file, query = {} } = (await route.handler(req)) || {};

          // If route handler did not return a page send 404 response
          if (!file) {
            return this.notFound();
          }

          // Send page response
          const page = new Page({ id: file, defaultFile: file });
          return this.goToPage(req, page, query, false);
        }
      );
    }
  }

  mountStaticRoute() {
    this.route(
      'GET',
      `/${this.pagesEndpoint}/(*)?`,
      req => {
        this.setConfig(req, true);
      },
      req => {
        return this.staticRoute(req);
      }
    );
  }

  expressRouter() {
    const router = express.Router();
    router.use('/', super.expressRouter());
    return router;
  }
}

export default PagesRouter;
module.exports = {
  PagesRouter,
  pageParamHeaderPrefix,
  pageParams,
  pages,
};
