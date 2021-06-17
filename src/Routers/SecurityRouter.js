import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import CheckRunner from '../Security/CheckRunner';

export class SecurityRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'GET',
      '/security',
      middleware.promiseEnforceMasterKeyAccess,
      this._enforceSecurityCheckEnabled,
      async req => {
        const report = await new CheckRunner(req.config.security).run();
        return {
          status: 200,
          response: report,
        };
      }
    );
  }

  async _enforceSecurityCheckEnabled(req) {
    const config = req.config;
    if (!config.security || !config.security.enableCheck) {
      const error = new Error();
      error.status = 409;
      error.message = 'Enable Parse Server option `security.enableCheck` to run security check.';
      throw error;
    }
  }
}

export default SecurityRouter;
