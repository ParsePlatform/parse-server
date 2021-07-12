import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import * as middleware from '../middlewares';
import Parse from 'parse/node';
import UsersRouter from './UsersRouter';

export class AggregateRouter extends ClassesRouter {
  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = {};
    if (body.distinct) {
      options.distinct = String(body.distinct);
    }
    if (body.hint) {
      options.hint = body.hint;
      delete body.hint;
    }
    if (body.explain) {
      options.explain = body.explain;
      delete body.explain;
    }
    if (body.readPreference) {
      options.readPreference = body.readPreference;
      delete body.readPreference;
    }
    options.pipeline = AggregateRouter.getPipeline(body);
    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }
    return rest
      .find(
        req.config,
        req.auth,
        this.className(req),
        body.where,
        options,
        req.info.clientSDK,
        req.info.context
      )
      .then(response => {
        for (const result of response.results) {
          if (typeof result === 'object') {
            UsersRouter.removeHiddenProperties(result);
          }
        }
        return { response };
      });
  }

  /* Builds a pipeline from the body. Originally the body could be passed as a single object,
   * and now we support many options
   *
   * Array
   *
   * body: [{
   *   group: { objectId: '$name' },
   * }]
   *
   * Object
   *
   * body: {
   *   group: { objectId: '$name' },
   * }
   *
   *
   * Pipeline Operator with an Array or an Object
   *
   * body: {
   *   pipeline: {
   *     group: { objectId: '$name' },
   *   }
   * }
   *
   */
  static getPipeline(body) {
    let pipeline = body.pipeline || body;
    if (!Array.isArray(pipeline)) {
      pipeline = Object.keys(pipeline).map(key => {
        return { [key]: pipeline[key] };
      });
    }

    return pipeline.map(stage => {
      const keys = Object.keys(stage);
      if (keys.length != 1) {
        throw new Error(`Pipeline stages should only have one key found ${keys.join(', ')}`);
      }
      return AggregateRouter.transformStage(keys[0], stage);
    });
  }

  static transformStage(stageName, stage) {
    if (stageName === 'group') {
      if (Object.prototype.hasOwnProperty.call(stage[stageName], 'objectId')) {
        // TODO: show deprecation warning for `objectId`
        stage[stageName]._id = stage[stageName].objectId;
        delete stage[stageName].objectId;
      }
      if (!Object.prototype.hasOwnProperty.call(stage[stageName], '_id')) {
        throw new Parse.Error(
          Parse.Error.INVALID_QUERY,
          `Invalid parameter for query: group. Missing key _id`
        );
      }
    }

    // TODO: show deprecation warning for missing `$`
    const key = stageName[0] === '$' ? stageName : `$${stageName}`;
    return { [key]: stage[stageName] };
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }
}

export default AggregateRouter;
