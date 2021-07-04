// @flow
// A database adapter that works with data exported from the hosted
// Parse database.

// @flow-disable-next
import { Parse } from 'parse/node';
// @flow-disable-next
import _ from 'lodash';
// @flow-disable-next
import intersect from 'intersect';
// @flow-disable-next
import deepcopy from 'deepcopy';
import logger from '../logger';
import * as SchemaController from './SchemaController';
import { StorageAdapter } from '../Adapters/Storage/StorageAdapter';
import MongoStorageAdapter from '../Adapters/Storage/Mongo/MongoStorageAdapter';
import SchemaCache from '../Adapters/Cache/SchemaCache';
import type { LoadSchemaOptions } from './types';
import type { QueryOptions, FullQueryOptions } from '../Adapters/Storage/StorageAdapter';

function addWriteACL(query, acl) {
  const newQuery = _.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = { $in: [null, ...acl] };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = { $in: [null, '*', ...acl] };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
const transformObjectACL = ({ ACL, ...result }) => {
  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }
    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }
  return result;
};

const specialQuerykeys = [
  '$and',
  '$or',
  '$nor',
  '_rperm',
  '_wperm',
  '_perishable_token',
  '_email_verify_token',
  '_email_verify_token_expires_at',
  '_account_lockout_expires_at',
  '_failed_login_count',
];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = (query: any): void => {
  if (query.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);
    } else {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(validateQuery);
    } else {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Bad $nor format - use an array of at least 1 value.'
      );
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new Parse.Error(
            Parse.Error.INVALID_QUERY,
            `Bad $options value for query: ${query[key].$options}`
          );
        }
      }
    }
    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (
  isMaster: boolean,
  aclGroup: any[],
  auth: any,
  operation: any,
  schema: SchemaController.SchemaController,
  className: string,
  protectedFields: null | Array<any>,
  object: any
) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

  // replace protectedFields when using pointer-permissions
  const perms = schema.getClassLevelPermissions(className);
  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;

    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields)
        .filter(key => key.startsWith('userField:'))
        .map(key => {
          return { key: key.substring(10), value: perms.protectedFields[key] };
        });

      const newProtectedFields: Array<string>[] = [];
      let overrideProtectedFields = false;

      // check if the object grants the current user access based on the extracted fields
      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];
        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(
              user => user.objectId && user.objectId === userId
            );
          } else {
            pointerPermIncludesUser =
              readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }

        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      });

      // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C
      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      }
      // intersect all sets of protectedFields
      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }

  const isUserClass = className === '_User';

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    //but were needed to apply protecttedFields
    perms.protectedFields &&
      perms.protectedFields.temporaryKeys &&
      perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }

  if (!isUserClass) {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;

  delete object.sessionToken;

  if (isMaster) {
    return object;
  }
  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;
  delete object._password_history;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }
  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = [
  '_hashed_password',
  '_perishable_token',
  '_email_verify_token',
  '_email_verify_token_expires_at',
  '_account_lockout_expires_at',
  '_failed_login_count',
  '_perishable_token_expires_at',
  '_password_changed_at',
  '_password_history',
];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function expandResultOnKeyPath(object, key, value) {
  if (key.indexOf('.') < 0) {
    object[key] = value[key];
    return object;
  }
  const path = key.split('.');
  const firstKey = path[0];
  const nextPath = path.slice(1).join('.');
  object[firstKey] = expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
  delete object[key];
  return object;
}

function sanitizeDatabaseResult(originalObject, result): Promise<any> {
  const response = {};
  if (!result) {
    return Promise.resolve(response);
  }
  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key];
    // determine if that was an op
    if (
      keyUpdate &&
      typeof keyUpdate === 'object' &&
      keyUpdate.__op &&
      ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1
    ) {
      // only valid ops that produce an actionable result
      // the op may have happend on a keypath
      expandResultOnKeyPath(response, key, result);
    }
  });
  return Promise.resolve(response);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].amount;
          break;
        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = [];
          break;
        case 'Delete':
          delete object[key];
          break;
        default:
          throw new Parse.Error(
            Parse.Error.COMMAND_UNAVAILABLE,
            `The ${object[key].__op} operator is not supported yet.`
          );
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;
      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete',
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = { type: 'Object' };
      }
    });
    delete object.authData;
  }
};
// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = ({ _rperm, _wperm, ...output }) => {
  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { read: true };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = { write: true };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }
  return output;
};

/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */
const getRootFieldName = (fieldName: string): string => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: { relatedId: { type: 'String' }, owningId: { type: 'String' } },
};

class DatabaseController {
  adapter: StorageAdapter;
  schemaCache: any;
  schemaPromise: ?Promise<SchemaController.SchemaController>;
  _transactionalSession: ?any;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
    // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
  }

  collectionExists(className: string): Promise<boolean> {
    return this.adapter.classExists(className);
  }

  purgeCollection(className: string): Promise<void> {
    return this.loadSchema()
      .then(schemaController => schemaController.getOneSchema(className))
      .then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className: string): Promise<void> {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(
        new Parse.Error(Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className)
      );
    }
    return Promise.resolve();
  }

  // Returns a promise for a schemaController.
  loadSchema(
    options: LoadSchemaOptions = { clearCache: false }
  ): Promise<SchemaController.SchemaController> {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }
    this.schemaPromise = SchemaController.load(this.adapter, options);
    this.schemaPromise.then(
      () => delete this.schemaPromise,
      () => delete this.schemaPromise
    );
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(
    schemaController: SchemaController.SchemaController,
    options: LoadSchemaOptions = { clearCache: false }
  ): Promise<SchemaController.SchemaController> {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  }

  // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface
  redirectClassNameForKey(className: string, key: string): Promise<?string> {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);
      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }
      return className;
    });
  }

  // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.
  validateObject(
    className: string,
    object: any,
    query: any,
    runOptions: QueryOptions
  ): Promise<boolean> {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup: string[] = acl || [];
    return this.loadSchema()
      .then(s => {
        schema = s;
        if (isMaster) {
          return Promise.resolve();
        }
        return this.canAddField(schema, className, object, aclGroup, runOptions);
      })
      .then(() => {
        return schema.validateObject(className, object, query);
      });
  }

  update(
    className: string,
    query: any,
    update: any,
    { acl, many, upsert, addsField }: FullQueryOptions = {},
    skipSanitization: boolean = false,
    validateOnly: boolean = false,
    validSchemaController: SchemaController.SchemaController
  ): Promise<any> {
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
    update = deepcopy(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];

    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster
        ? Promise.resolve()
        : schemaController.validatePermission(className, aclGroup, 'update')
      )
        .then(() => {
          relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);
          if (!isMaster) {
            query = this.addPointerPermissions(
              schemaController,
              className,
              'update',
              query,
              aclGroup
            );

            if (addsField) {
              query = {
                $and: [
                  query,
                  this.addPointerPermissions(
                    schemaController,
                    className,
                    'addField',
                    query,
                    aclGroup
                  ),
                ],
              };
            }
          }
          if (!query) {
            return Promise.resolve();
          }
          if (acl) {
            query = addWriteACL(query, acl);
          }
          validateQuery(query);
          return schemaController
            .getOneSchema(className, true)
            .catch(error => {
              // If the schema doesn't exist, pretend it exists with no fields. This behavior
              // will likely need revisiting.
              if (error === undefined) {
                return { fields: {} };
              }
              throw error;
            })
            .then(schema => {
              Object.keys(update).forEach(fieldName => {
                if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
                  throw new Parse.Error(
                    Parse.Error.INVALID_KEY_NAME,
                    `Invalid field name for update: ${fieldName}`
                  );
                }
                const rootFieldName = getRootFieldName(fieldName);
                if (
                  !SchemaController.fieldNameIsValid(rootFieldName, className) &&
                  !isSpecialUpdateKey(rootFieldName)
                ) {
                  throw new Parse.Error(
                    Parse.Error.INVALID_KEY_NAME,
                    `Invalid field name for update: ${fieldName}`
                  );
                }
              });
              for (const updateOperation in update) {
                if (
                  update[updateOperation] &&
                  typeof update[updateOperation] === 'object' &&
                  Object.keys(update[updateOperation]).some(
                    innerKey => innerKey.includes('$') || innerKey.includes('.')
                  )
                ) {
                  throw new Parse.Error(
                    Parse.Error.INVALID_NESTED_KEY,
                    "Nested keys should not contain the '$' or '.' characters"
                  );
                }
              }
              update = transformObjectACL(update);
              transformAuthData(className, update, schema);
              if (validateOnly) {
                return this.adapter.find(className, schema, query, {}).then(result => {
                  if (!result || !result.length) {
                    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
                  }
                  return {};
                });
              }
              if (many) {
                return this.adapter.updateObjectsByQuery(
                  className,
                  schema,
                  query,
                  update,
                  this._transactionalSession
                );
              } else if (upsert) {
                return this.adapter.upsertOneObject(
                  className,
                  schema,
                  query,
                  update,
                  this._transactionalSession
                );
              } else {
                return this.adapter.findOneAndUpdate(
                  className,
                  schema,
                  query,
                  update,
                  this._transactionalSession
                );
              }
            });
        })
        .then((result: any) => {
          if (!result) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
          if (validateOnly) {
            return result;
          }
          return this.handleRelationUpdates(
            className,
            originalQuery.objectId,
            update,
            relationUpdates
          ).then(() => {
            return result;
          });
        })
        .then(result => {
          if (skipSanitization) {
            return Promise.resolve(result);
          }
          return sanitizeDatabaseResult(originalUpdate, result);
        });
    });
  }

  // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.
  collectRelationUpdates(className: string, objectId: ?string, update: any) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        ops.push({ key, op });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({ key, op });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }
    for (const key of deleteMe) {
      delete update[key];
    }
    return ops;
  }

  // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed
  handleRelationUpdates(className: string, objectId: string, update: any, ops: any) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({ key, op }) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });

    return Promise.all(pending);
  }

  // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.
  addRelation(key: string, fromClassName: string, fromId: string, toId: string) {
    const doc = {
      relatedId: toId,
      owningId: fromId,
    };
    return this.adapter.upsertOneObject(
      `_Join:${key}:${fromClassName}`,
      relationSchema,
      doc,
      doc,
      this._transactionalSession
    );
  }

  // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.
  removeRelation(key: string, fromClassName: string, fromId: string, toId: string) {
    var doc = {
      relatedId: toId,
      owningId: fromId,
    };
    return this.adapter
      .deleteObjectsByQuery(
        `_Join:${key}:${fromClassName}`,
        relationSchema,
        doc,
        this._transactionalSession
      )
      .catch(error => {
        // We don't care if they try to delete a non-existent relation.
        if (error.code == Parse.Error.OBJECT_NOT_FOUND) {
          return;
        }
        throw error;
      });
  }

  // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.
  destroy(
    className: string,
    query: any,
    { acl }: QueryOptions = {},
    validSchemaController: SchemaController.SchemaController
  ): Promise<any> {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];

    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster
        ? Promise.resolve()
        : schemaController.validatePermission(className, aclGroup, 'delete')
      ).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(
            schemaController,
            className,
            'delete',
            query,
            aclGroup
          );
          if (!query) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        }
        // delete by query
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query);
        return schemaController
          .getOneSchema(className)
          .catch(error => {
            // If the schema doesn't exist, pretend it exists with no fields. This behavior
            // will likely need revisiting.
            if (error === undefined) {
              return { fields: {} };
            }
            throw error;
          })
          .then(parseFormatSchema =>
            this.adapter.deleteObjectsByQuery(
              className,
              parseFormatSchema,
              query,
              this._transactionalSession
            )
          )
          .catch(error => {
            // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
            if (className === '_Session' && error.code === Parse.Error.OBJECT_NOT_FOUND) {
              return Promise.resolve({});
            }
            throw error;
          });
      });
    });
  }

  // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.
  create(
    className: string,
    object: any,
    { acl }: QueryOptions = {},
    validateOnly: boolean = false,
    validSchemaController: SchemaController.SchemaController
  ): Promise<any> {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);

    object.createdAt = { iso: object.createdAt, __type: 'Date' };
    object.updatedAt = { iso: object.updatedAt, __type: 'Date' };

    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);

    return this.validateClassName(className)
      .then(() => this.loadSchemaIfNeeded(validSchemaController))
      .then(schemaController => {
        return (isMaster
          ? Promise.resolve()
          : schemaController.validatePermission(className, aclGroup, 'create')
        )
          .then(() => schemaController.enforceClassExists(className))
          .then(() => schemaController.getOneSchema(className, true))
          .then(schema => {
            transformAuthData(className, object, schema);
            flattenUpdateOperatorsForCreate(object);
            if (validateOnly) {
              return {};
            }
            return this.adapter.createObject(
              className,
              SchemaController.convertSchemaToAdapterSchema(schema),
              object,
              this._transactionalSession
            );
          })
          .then(result => {
            if (validateOnly) {
              return originalObject;
            }
            return this.handleRelationUpdates(
              className,
              object.objectId,
              object,
              relationUpdates
            ).then(() => {
              return sanitizeDatabaseResult(originalObject, result.ops[0]);
            });
          });
      });
  }

  canAddField(
    schema: SchemaController.SchemaController,
    className: string,
    object: any,
    aclGroup: string[],
    runOptions: QueryOptions
  ): Promise<void> {
    const classSchema = schema.schemaData[className];
    if (!classSchema) {
      return Promise.resolve();
    }
    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }
      return schemaFields.indexOf(getRootFieldName(field)) < 0;
    });
    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;

      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }
    return Promise.resolve();
  }

  // Won't delete collections in the system namespace
  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */
  deleteEverything(fast: boolean = false): Promise<any> {
    this.schemaPromise = null;
    SchemaCache.clear();
    return this.adapter.deleteAllClasses(fast);
  }

  // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.
  relatedIds(
    className: string,
    key: string,
    owningId: string,
    queryOptions: QueryOptions
  ): Promise<Array<string>> {
    const { skip, limit, sort } = queryOptions;
    const findOptions = {};
    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = { _id: sort.createdAt };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }
    return this.adapter
      .find(joinTableName(className, key), relationSchema, { owningId }, findOptions)
      .then(results => results.map(result => result.relatedId));
  }

  // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.
  owningIds(className: string, key: string, relatedIds: string[]): Promise<string[]> {
    return this.adapter
      .find(
        joinTableName(className, key),
        relationSchema,
        { relatedId: { $in: relatedIds } },
        { keys: ['owningId'] }
      )
      .then(results => results.map(result => result.owningId));
  }

  // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated
  reduceInRelation(className: string, query: any, schema: any): Promise<any> {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(
        ors.map((aQuery, index) => {
          return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
            query['$or'][index] = aQuery;
          });
        })
      ).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);
      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }
      let queries: ?(any[]) = null;
      if (
        query[key] &&
        (query[key]['$in'] ||
          query[key]['$ne'] ||
          query[key]['$nin'] ||
          query[key].__type == 'Pointer')
      ) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;
          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }
          return {
            isNegation,
            relatedIds,
          };
        });
      } else {
        queries = [{ isNegation: false, relatedIds: [] }];
      }

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independently to build the list of
      // $in / $nin
      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }
        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }
          return Promise.resolve();
        });
      });

      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });

    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated
  reduceRelationKeys(className: string, query: any, queryOptions: any): ?Promise<void> {
    if (query['$or']) {
      return Promise.all(
        query['$or'].map(aQuery => {
          return this.reduceRelationKeys(className, aQuery, queryOptions);
        })
      );
    }

    var relatedTo = query['$relatedTo'];
    if (relatedTo) {
      return this.relatedIds(
        relatedTo.object.className,
        relatedTo.key,
        relatedTo.object.objectId,
        queryOptions
      )
        .then(ids => {
          delete query['$relatedTo'];
          this.addInObjectIdsIds(ids, query);
          return this.reduceRelationKeys(className, query, queryOptions);
        })
        .then(() => {});
    }
  }

  addInObjectIdsIds(ids: ?Array<string> = null, query: any) {
    const idsFromString: ?Array<string> =
      typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq: ?Array<string> =
      query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn: ?Array<string> =
      query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

    // @flow-disable-next
    const allIds: Array<Array<string>> = [idsFromString, idsFromEq, idsFromIn, ids].filter(
      list => list !== null
    );
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);

    let idsIntersection = [];
    if (totalLength > 125) {
      idsIntersection = intersect.big(allIds);
    } else {
      idsIntersection = intersect(allIds);
    }

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined,
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId,
      };
    }
    query.objectId['$in'] = idsIntersection;

    return query;
  }

  addNotInObjectIdsIds(ids: string[] = [], query: any) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null);

    // make a set and spread to remove duplicates
    allIds = [...new Set(allIds)];

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined,
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId,
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  }

  // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  caseInsensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.
  find(
    className: string,
    query: any,
    {
      skip,
      limit,
      acl,
      sort = {},
      count,
      keys,
      op,
      distinct,
      pipeline,
      readPreference,
      hint,
      caseInsensitive = false,
      explain,
    }: any = {},
    auth: any = {},
    validSchemaController: SchemaController.SchemaController
  ): Promise<any> {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op =
      op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
    // Count operation if counting
    op = count === true ? 'count' : op;

    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController
        .getOneSchema(className, isMaster)
        .catch(error => {
          // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
          // For now, pretend the class exists but has no objects,
          if (error === undefined) {
            classExists = false;
            return { fields: {} };
          }
          throw error;
        })
        .then(schema => {
          // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
          // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
          // use the one that appears first in the sort list.
          if (sort._created_at) {
            sort.createdAt = sort._created_at;
            delete sort._created_at;
          }
          if (sort._updated_at) {
            sort.updatedAt = sort._updated_at;
            delete sort._updated_at;
          }
          const queryOptions = {
            skip,
            limit,
            sort,
            keys,
            readPreference,
            hint,
            caseInsensitive,
            explain,
          };
          Object.keys(sort).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
            }
            const rootFieldName = getRootFieldName(fieldName);
            if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
              throw new Parse.Error(
                Parse.Error.INVALID_KEY_NAME,
                `Invalid field name: ${fieldName}.`
              );
            }
          });
          return (isMaster
            ? Promise.resolve()
            : schemaController.validatePermission(className, aclGroup, op)
          )
            .then(() => this.reduceRelationKeys(className, query, queryOptions))
            .then(() => this.reduceInRelation(className, query, schemaController))
            .then(() => {
              let protectedFields;
              if (!isMaster) {
                query = this.addPointerPermissions(
                  schemaController,
                  className,
                  op,
                  query,
                  aclGroup
                );
                /* Don't use projections to optimize the protectedFields since the protectedFields
                  based on pointer-permissions are determined after querying. The filtering can
                  overwrite the protected fields. */
                protectedFields = this.addProtectedFields(
                  schemaController,
                  className,
                  query,
                  aclGroup,
                  auth,
                  queryOptions
                );
              }
              if (!query) {
                if (op === 'get') {
                  throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
                } else {
                  return [];
                }
              }
              if (!isMaster) {
                if (op === 'update' || op === 'delete') {
                  query = addWriteACL(query, aclGroup);
                } else {
                  query = addReadACL(query, aclGroup);
                }
              }
              validateQuery(query);
              if (count) {
                if (!classExists) {
                  return 0;
                } else {
                  return this.adapter.count(
                    className,
                    schema,
                    query,
                    readPreference,
                    undefined,
                    hint
                  );
                }
              } else if (distinct) {
                if (!classExists) {
                  return [];
                } else {
                  return this.adapter.distinct(className, schema, query, distinct);
                }
              } else if (pipeline) {
                if (!classExists) {
                  return [];
                } else {
                  return this.adapter.aggregate(
                    className,
                    schema,
                    pipeline,
                    readPreference,
                    hint,
                    explain
                  );
                }
              } else if (explain) {
                return this.adapter.find(className, schema, query, queryOptions);
              } else {
                return this.adapter
                  .find(className, schema, query, queryOptions)
                  .then(objects =>
                    objects.map(object => {
                      object = untransformObjectACL(object);
                      return filterSensitiveData(
                        isMaster,
                        aclGroup,
                        auth,
                        op,
                        schemaController,
                        className,
                        protectedFields,
                        object
                      );
                    })
                  )
                  .catch(error => {
                    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, error);
                  });
              }
            });
        });
    });
  }

  deleteSchema(className: string): Promise<void> {
    let schemaController;
    return this.loadSchema({ clearCache: true })
      .then(s => {
        schemaController = s;
        return schemaController.getOneSchema(className, true);
      })
      .catch(error => {
        if (error === undefined) {
          return { fields: {} };
        } else {
          throw error;
        }
      })
      .then((schema: any) => {
        return this.collectionExists(className)
          .then(() => this.adapter.count(className, { fields: {} }, null, '', false))
          .then(count => {
            if (count > 0) {
              throw new Parse.Error(
                255,
                `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`
              );
            }
            return this.adapter.deleteClass(className);
          })
          .then(wasParseCollection => {
            if (wasParseCollection) {
              const relationFieldNames = Object.keys(schema.fields).filter(
                fieldName => schema.fields[fieldName].type === 'Relation'
              );
              return Promise.all(
                relationFieldNames.map(name =>
                  this.adapter.deleteClass(joinTableName(className, name))
                )
              ).then(() => {
                SchemaCache.del(className);
                return schemaController.reloadData();
              });
            } else {
              return Promise.resolve();
            }
          });
      });
  }

  // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json
  objectToEntriesStrings(query: any): Array<string> {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  }

  // Naive logic reducer for OR operations meant to be used only for pointer permissions.
  reduceOrOperation(query: { $or: Array<any> }): any {
    if (!query.$or) {
      return query;
    }
    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce(
            (acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0),
            0
          );
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$or.length === 1) {
      query = { ...query, ...query.$or[0] };
      delete query.$or;
    }
    return query;
  }

  // Naive logic reducer for AND operations meant to be used only for pointer permissions.
  reduceAndOperation(query: { $and: Array<any> }): any {
    if (!query.$and) {
      return query;
    }
    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce(
            (acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0),
            0
          );
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$and.length === 1) {
      query = { ...query, ...query.$and[0] };
      delete query.$and;
    }
    return query;
  }

  // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)
  addPointerPermissions(
    schema: SchemaController.SchemaController,
    className: string,
    operation: string,
    query: any,
    aclGroup: any[] = []
  ): any {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }
    const perms = schema.getClassLevelPermissions(className);

    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });

    const groupKey =
      ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    const permFields = [];

    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }

    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    }
    // the ACL should have exactly 1 user
    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }
      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId,
      };

      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType =
          fieldDescriptor &&
          typeof fieldDescriptor === 'object' &&
          Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type')
            ? fieldDescriptor.type
            : null;

        let queryClause;

        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = { [key]: userPointer };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = { [key]: { $all: [userPointer] } };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = { [key]: userPointer };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(
            `An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`
          );
        }
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({ $and: [queryClause, query] });
        }
        // otherwise just add the constaint
        return Object.assign({}, query, queryClause);
      });

      return queries.length === 1 ? queries[0] : this.reduceOrOperation({ $or: queries });
    } else {
      return query;
    }
  }

  addProtectedFields(
    schema: SchemaController.SchemaController,
    className: string,
    query: any = {},
    aclGroup: any[] = [],
    auth: any = {},
    queryOptions: FullQueryOptions = {}
  ): null | string[] {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;

    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;

    if (aclGroup.indexOf(query.objectId) > -1) return null;

    // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'
    const preserveKeys = queryOptions.keys;

    // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)
    const serverOnlyKeys = [];

    const authenticated = auth.user;

    // map to allow check without array search
    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {});

    // array of sets of protected fields. separate item for each applicable criteria
    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);
          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName);
            // 2. preserve it delete later
            serverOnlyKeys.push(fieldName);
          }
        }
        continue;
      }

      // add public tier
      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }

      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }

        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    }

    // check if there's a rule for current user's id
    if (authenticated) {
      const userId = auth.user.id;
      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    }

    // preserve fields to be removed before sending response to client
    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }
      return acc;
    }, []);

    // intersect all sets of protectedFields
    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });

    return protectedKeys;
  }

  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }

  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }
    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }
    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.
  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas,
    });
    const requiredUserFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._User,
      },
    };
    const requiredRoleFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._Role,
      },
    };
    const requiredIdempotencyFields = {
      fields: {
        ...SchemaController.defaultColumns._Default,
        ...SchemaController.defaultColumns._Idempotency,
      },
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    if (this.adapter instanceof MongoStorageAdapter) {
      await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    }

    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      logger.warn('Unable to ensure uniqueness for usernames: ', error);
      throw error;
    });

    await this.adapter
      .ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)
      .catch(error => {
        logger.warn('Unable to create case insensitive username index: ', error);
        throw error;
      });
    await this.adapter
      .ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true)
      .catch(error => {
        logger.warn('Unable to create case insensitive username index: ', error);
        throw error;
      });

    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      logger.warn('Unable to ensure uniqueness for user email addresses: ', error);
      throw error;
    });

    await this.adapter
      .ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true)
      .catch(error => {
        logger.warn('Unable to create case insensitive email index: ', error);
        throw error;
      });

    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      logger.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });
    if (this.adapter instanceof MongoStorageAdapter) {
      await this.adapter
        .ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId'])
        .catch(error => {
          logger.warn('Unable to ensure uniqueness for idempotency request ID: ', error);
          throw error;
        });

      await this.adapter
        .ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, {
          ttl: 0,
        })
        .catch(error => {
          logger.warn('Unable to create TTL index for idempotency expire date: ', error);
          throw error;
        });
    }
    await this.adapter.updateSchemaWithIndexes();
  }

  static _validateQuery: any => void;
}

module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
