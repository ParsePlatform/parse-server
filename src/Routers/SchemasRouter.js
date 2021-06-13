// schemas.js

var Parse = require('parse/node').Parse,
  SchemaController = require('../Controllers/SchemaController');

import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';

function classNameMismatchResponse(bodyClass, pathClass) {
  throw new Parse.Error(
    Parse.Error.INVALID_CLASS_NAME,
    `Class name mismatch between ${bodyClass} and ${pathClass}.`
  );
}

function getAllSchemas(req) {
  return req.config.database
    .loadSchema({ clearCache: true })
    .then(schemaController => schemaController.getAllClasses(true))
    .then(schemas => ({ response: { results: schemas } }));
}

function getOneSchema(req) {
  const className = req.params.className;
  return req.config.database
    .loadSchema({ clearCache: true })
    .then(schemaController => schemaController.getOneSchema(className, true))
    .then(schema => ({ response: schema }))
    .catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
      }
    });
}

const checkIfDefinedSchemasIsUsed = req => {
  if (req.config && req.config.schemas) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      'cannot perform this operation when schemas options is used.'
    );
  }
};

export const internalCreateSchema = async (className, body, config) => {
  const controller = await config.database.loadSchema({ clearCache: true });
  return {
    response: await controller.addClassIfNotExists(
      className,
      body.fields,
      body.classLevelPermissions,
      body.indexes
    ),
  };
};

export const internalUpdateSchema = async (className, body, config) => {
  const controller = await config.database.loadSchema({ clearCache: true });
  return {
    response: await controller.updateClass(
      className,
      body.fields || {},
      body.classLevelPermissions,
      body.indexes,
      config.database
    ),
  };
};

function createSchema(req) {
  checkIfDefinedSchemasIsUsed(req);
  if (req.auth.isReadOnly) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      "read-only masterKey isn't allowed to create a schema."
    );
  }
  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return classNameMismatchResponse(req.body.className, req.params.className);
    }
  }

  const className = req.params.className || req.body.className;
  if (!className) {
    throw new Parse.Error(135, `POST ${req.path} needs a class name.`);
  }

  return internalCreateSchema(className, req.body, req.config);
}

function modifySchema(req) {
  checkIfDefinedSchemasIsUsed(req);
  if (req.auth.isReadOnly) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      "read-only masterKey isn't allowed to update a schema."
    );
  }
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }
  const className = req.params.className;

  return internalUpdateSchema(className, req.body, req.config);
}

const deleteSchema = req => {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      "read-only masterKey isn't allowed to delete a schema."
    );
  }
  if (!SchemaController.classNameIsValid(req.params.className)) {
    throw new Parse.Error(
      Parse.Error.INVALID_CLASS_NAME,
      SchemaController.invalidClassNameMessage(req.params.className)
    );
  }
  return req.config.database.deleteSchema(req.params.className).then(() => ({ response: {} }));
};

export class SchemasRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/schemas', middleware.promiseEnforceMasterKeyAccess, getAllSchemas);
    this.route(
      'GET',
      '/schemas/:className',
      middleware.promiseEnforceMasterKeyAccess,
      getOneSchema
    );
    this.route('POST', '/schemas', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route(
      'POST',
      '/schemas/:className',
      middleware.promiseEnforceMasterKeyAccess,
      createSchema
    );
    this.route(
      'PUT',
      '/schemas/:className',
      middleware.promiseEnforceMasterKeyAccess,
      modifySchema
    );
    this.route(
      'DELETE',
      '/schemas/:className',
      middleware.promiseEnforceMasterKeyAccess,
      deleteSchema
    );
  }
}
