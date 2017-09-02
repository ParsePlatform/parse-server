// InstallationsRouter.js

import ClassesRouter from './ClassesRouter';
import rest from '../rest';

export class InstallationsRouter extends ClassesRouter {
  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = ClassesRouter.optionsFromBody(body);
    return rest.find(req.config, req.auth,
      '_Installation', body.where, options, req.info.clientSDK)
      .then((response) => {
        return {response: response};
      });
  }

  handleGet(req) {
    req.params.className = '_Installation';
    return super.handleGet(req);
  }

  handleCreate(req) {
    req.params.className = '_Installation';
    return super.handleCreate(req);
  }

  handleUpdate(req) {
    req.params.className = '_Installation';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_Installation';
    return super.handleDelete(req);
  }

  mountRoutes() {
    this.route('GET','/installations', req => { return this.handleFind(req); });
    this.route('GET','/installations/:objectId', req => { return this.handleGet(req); });
    this.route('POST','/installations', req => { return this.handleCreate(req); });
    this.route('PUT','/installations/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE','/installations/:objectId', req => { return this.handleDelete(req); });
  }
}

export default InstallationsRouter;
