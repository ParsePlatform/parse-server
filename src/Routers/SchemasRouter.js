// schemas.js

var Parse = require('parse/node').Parse,
  SchemaController = require('../Controllers/SchemaController');

import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import { filterOptions } from '../Controllers/SchemaController';
import Utils from '../Utils';

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

function handleSchemaOptions(options, requestSchema) {
  if (
    options.ignoreDefaultFields &&
    typeof options.ignoreDefaultFields === 'boolean' &&
    options.ignoreDefaultFields === true
  ) {
    const filterOption = filterOptions.find(f => f.label === 'ignoreDefaultFields');
    if (!filterOption) {
      throw new Parse.Error(`ignoreDefaultFields not registered in filter options list`);
    }
    requestSchema.fields = filterOption.do(requestSchema.fields);
  }
  return requestSchema;
}

function getOptionParamsFromRequest(req) {
  const options = new URLSearchParams(req.query);
  const filtered = {};
  for (let i = 0; i < filterOptions.length; i++) {
    if (options.has(filterOptions[i].label)) {
      filtered[filterOptions[i].label] = new Utils().convertType(
        filterOptions[i].defaultValue,
        options.get(filterOptions[i].label)
      );
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function createSchema(req) {
  let requestSchema = Object.assign({}, req.body);

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

  // handle options.
  const options = getOptionParamsFromRequest(req) || req.body.options;
  if (options && typeof options === 'object') {
    requestSchema = handleSchemaOptions(options, requestSchema);
  }

  return req.config.database
    .loadSchema({ clearCache: true })
    .then(schema =>
      schema.addClassIfNotExists(
        className,
        requestSchema.fields,
        requestSchema.classLevelPermissions,
        requestSchema.indexes
      )
    )
    .then(schema => ({ response: schema }));
}

function modifySchema(req) {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      "read-only masterKey isn't allowed to update a schema."
    );
  }
  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  const submittedFields = req.body.fields || {};
  const className = req.params.className;

  return req.config.database
    .loadSchema({ clearCache: true })
    .then(schema =>
      schema.updateClass(
        className,
        submittedFields,
        req.body.classLevelPermissions,
        req.body.indexes,
        req.config.database
      )
    )
    .then(result => ({ response: result }));
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
