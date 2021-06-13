// @flow
import MongoCollection from './MongoCollection';
import MongoSchemaCollection from './MongoSchemaCollection';
import { StorageAdapter } from '../StorageAdapter';
import type { SchemaType, QueryType, StorageClass, QueryOptions } from '../StorageAdapter';
import { parse as parseUrl, format as formatUrl } from '../../../vendor/mongodbUrl';
import {
  parseObjectToMongoObjectForCreate,
  mongoObjectToParseObject,
  transformKey,
  transformWhere,
  transformUpdate,
  transformPointerString,
} from './MongoTransform';
// @flow-disable-next
import Parse from 'parse/node';
// @flow-disable-next
import _ from 'lodash';
import defaults from '../../../defaults';
import logger from '../../../logger';

// @flow-disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;

const MongoSchemaCollectionName = '_SCHEMA';

const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter
    .connect()
    .then(() => mongoAdapter.database.collections())
    .then(collections => {
      return collections.filter(collection => {
        if (collection.namespace.match(/\.system\./)) {
          return false;
        }
        // TODO: If you have one app with a collection prefix that happens to be a prefix of another
        // apps prefix, this will go very very badly. We should fix that somehow.
        return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
      });
    });
};

const convertParseSchemaToMongoSchema = ({ ...schema }) => {
  delete schema.fields._rperm;
  delete schema.fields._wperm;

  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }

  return schema;
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (
  fields,
  className,
  classLevelPermissions,
  indexes
) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined,
  };

  for (const fieldName in fields) {
    const { type, targetClass, ...fieldOptions } = fields[fieldName];
    mongoObject[fieldName] = MongoSchemaCollection.parseFieldTypeToMongoFieldType({
      type,
      targetClass,
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }

  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }

  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }

  return mongoObject;
};

export class MongoStorageAdapter implements StorageAdapter {
  // Private
  _uri: string;
  _collectionPrefix: string;
  _mongoOptions: Object;
  _onchange: any;
  _stream: any;
  // Public
  connectionPromise: ?Promise<any>;
  database: any;
  client: MongoClient;
  _maxTimeMS: ?number;
  canSortOnJoinTables: boolean;
  enableSchemaHooks: boolean;

  constructor({ uri = defaults.DefaultMongoURI, collectionPrefix = '', mongoOptions = {} }: any) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = mongoOptions;
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    delete mongoOptions.enableSchemaHooks;
    delete mongoOptions.maxTimeMS;
  }

  watch(callback: () => void): void {
    this._onchange = callback;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = formatUrl(parseUrl(this._uri));

    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions)
      .then(client => {
        // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
        // Fortunately, we can get back the options and use them to select the proper DB.
        // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
        const options = client.s.options;
        const database = client.db(options.dbName);
        if (!database) {
          delete this.connectionPromise;
          return;
        }
        database.on('error', () => {
          delete this.connectionPromise;
        });
        database.on('close', () => {
          delete this.connectionPromise;
        });
        this.client = client;
        this.database = database;
      })
      .catch(err => {
        delete this.connectionPromise;
        return Promise.reject(err);
      });

    return this.connectionPromise;
  }

  handleError<T>(error: ?(Error | Parse.Error)): Promise<T> {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      logger.error('Received unauthorized error', { error: error });
    }
    throw error;
  }

  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }
    return this.client.close(false);
  }

  _adaptiveCollection(name: string) {
    return this.connect()
      .then(() => this.database.collection(this._collectionPrefix + name))
      .then(rawCollection => new MongoCollection(rawCollection))
      .catch(err => this.handleError(err));
  }

  _schemaCollection(): Promise<MongoSchemaCollection> {
    return this.connect()
      .then(() => this._adaptiveCollection(MongoSchemaCollectionName))
      .then(collection => {
        if (!this._stream && this.enableSchemaHooks) {
          this._stream = collection._mongoCollection.watch();
          this._stream.on('change', () => this._onchange());
        }
        return new MongoSchemaCollection(collection);
      });
  }

  classExists(name: string) {
    return this.connect()
      .then(() => {
        return this.database.listCollections({ name: this._collectionPrefix + name }).toArray();
      })
      .then(collections => {
        return collections.length > 0;
      })
      .catch(err => this.handleError(err));
  }

  setClassLevelPermissions(className: string, CLPs: any): Promise<void> {
    return this._schemaCollection()
      .then(schemaCollection =>
        schemaCollection.updateSchema(className, {
          $set: { '_metadata.class_permissions': CLPs },
        })
      )
      .catch(err => this.handleError(err));
  }

  setIndexesWithSchemaFormat(
    className: string,
    submittedIndexes: any,
    existingIndexes: any = {},
    fields: any
  ): Promise<void> {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = { _id_: { _id: 1 } };
    }
    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new Parse.Error(Parse.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new Parse.Error(
          Parse.Error.INVALID_QUERY,
          `Index ${name} does not exist, cannot delete.`
        );
      }
      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (
            !Object.prototype.hasOwnProperty.call(
              fields,
              key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key
            )
          ) {
            throw new Parse.Error(
              Parse.Error.INVALID_QUERY,
              `Field ${key} does not exist, cannot add index.`
            );
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name,
        });
      }
    });
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises)
      .then(() => insertPromise)
      .then(() => this._schemaCollection())
      .then(schemaCollection =>
        schemaCollection.updateSchema(className, {
          $set: { '_metadata.indexes': existingIndexes },
        })
      )
      .catch(err => this.handleError(err));
  }

  setIndexesFromMongo(className: string) {
    return this.getIndexes(className)
      .then(indexes => {
        indexes = indexes.reduce((obj, index) => {
          if (index.key._fts) {
            delete index.key._fts;
            delete index.key._ftsx;
            for (const field in index.weights) {
              index.key[field] = 'text';
            }
          }
          obj[index.name] = index.key;
          return obj;
        }, {});
        return this._schemaCollection().then(schemaCollection =>
          schemaCollection.updateSchema(className, {
            $set: { '_metadata.indexes': indexes },
          })
        );
      })
      .catch(err => this.handleError(err))
      .catch(() => {
        // Ignore if collection not found
        return Promise.resolve();
      });
  }

  createClass(className: string, schema: SchemaType): Promise<void> {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(
      schema.fields,
      className,
      schema.classLevelPermissions,
      schema.indexes
    );
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields)
      .then(() => this._schemaCollection())
      .then(schemaCollection => schemaCollection.insertSchema(mongoObject))
      .catch(err => this.handleError(err));
  }

  async updateFieldOptions(className: string, fieldName: string, type: any) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }

  addFieldIfNotExists(className: string, fieldName: string, type: any): Promise<void> {
    return this._schemaCollection()
      .then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type))
      .then(() => this.createIndexesIfNeeded(className, fieldName, type))
      .catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className: string) {
    return (
      this._adaptiveCollection(className)
        .then(collection => collection.drop())
        .catch(error => {
          // 'ns not found' means collection was already gone. Ignore deletion attempt.
          if (error.message == 'ns not found') {
            return;
          }
          throw error;
        })
        // We've dropped the collection, now remove the _SCHEMA document
        .then(() => this._schemaCollection())
        .then(schemaCollection => schemaCollection.findAndDeleteSchema(className))
        .catch(err => this.handleError(err))
    );
  }

  deleteAllClasses(fast: boolean) {
    return storageAdapterAllCollections(this).then(collections =>
      Promise.all(
        collections.map(collection => (fast ? collection.deleteMany({}) : collection.drop()))
      )
    );
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className: string, schema: SchemaType, fieldNames: string[]) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = { $unset: {} };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });

    const collectionFilter = { $or: [] };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({ [name]: { $exists: true } });
    });

    const schemaUpdate = { $unset: {} };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });

    return this._adaptiveCollection(className)
      .then(collection => collection.updateMany(collectionFilter, collectionUpdate))
      .then(() => this._schemaCollection())
      .then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate))
      .catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses(): Promise<StorageClass[]> {
    return this._schemaCollection()
      .then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA())
      .catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className: string): Promise<StorageClass> {
    return this._schemaCollection()
      .then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className))
      .catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className: string, schema: SchemaType, object: any, transactionalSession: ?any) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = parseObjectToMongoObjectForCreate(className, object, schema);
    return this._adaptiveCollection(className)
      .then(collection => collection.insertOne(mongoObject, transactionalSession))
      .catch(error => {
        if (error.code === 11000) {
          // Duplicate value
          const err = new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided'
          );
          err.underlyingError = error;
          if (error.message) {
            const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
            if (matches && Array.isArray(matches)) {
              err.userInfo = { duplicated_field: matches[1] };
            }
          }
          throw err;
        }
        throw error;
      })
      .catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    transactionalSession: ?any
  ) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className)
      .then(collection => {
        const mongoWhere = transformWhere(className, query, schema);
        return collection.deleteMany(mongoWhere, transactionalSession);
      })
      .catch(err => this.handleError(err))
      .then(
        ({ result }) => {
          if (result.n === 0) {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
          return Promise.resolve();
        },
        () => {
          throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
        }
      );
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
      .then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession))
      .catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
      .then(collection =>
        collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
          returnOriginal: false,
          session: transactionalSession || undefined,
        })
      )
      .then(result => mongoObjectToParseObject(className, result.value, schema))
      .catch(error => {
        if (error.code === 11000) {
          throw new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided'
          );
        }
        throw error;
      })
      .catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
      .then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession))
      .catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(
    className: string,
    schema: SchemaType,
    query: QueryType,
    { skip, limit, sort, keys, readPreference, hint, caseInsensitive, explain }: QueryOptions
  ): Promise<any> {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = transformWhere(className, query, schema);
    const mongoSort = _.mapKeys(sort, (value, fieldName) =>
      transformKey(className, fieldName, schema)
    );
    const mongoKeys = _.reduce(
      keys,
      (memo, key) => {
        if (key === 'ACL') {
          memo['_rperm'] = 1;
          memo['_wperm'] = 1;
        } else {
          memo[transformKey(className, key, schema)] = 1;
        }
        return memo;
      },
      {}
    );

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }

    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema)
      .then(() => this._adaptiveCollection(className))
      .then(collection =>
        collection.find(mongoWhere, {
          skip,
          limit,
          sort: mongoSort,
          keys: mongoKeys,
          maxTimeMS: this._maxTimeMS,
          readPreference,
          hint,
          caseInsensitive,
          explain,
        })
      )
      .then(objects => {
        if (explain) {
          return objects;
        }
        return objects.map(object => mongoObjectToParseObject(className, object, schema));
      })
      .catch(err => this.handleError(err));
  }

  ensureIndex(
    className: string,
    schema: SchemaType,
    fieldNames: string[],
    indexName: ?string,
    caseInsensitive: boolean = false,
    options?: Object = {}
  ): Promise<any> {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => transformKey(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });

    const defaultOptions: Object = { background: true, sparse: true };
    const indexNameOptions: Object = indexName ? { name: indexName } : {};
    const ttlOptions: Object = options.ttl !== undefined ? { expireAfterSeconds: options.ttl } : {};
    const caseInsensitiveOptions: Object = caseInsensitive
      ? { collation: MongoCollection.caseInsensitiveCollation() }
      : {};
    const indexOptions: Object = {
      ...defaultOptions,
      ...caseInsensitiveOptions,
      ...indexNameOptions,
      ...ttlOptions,
    };

    return this._adaptiveCollection(className)
      .then(
        collection =>
          new Promise((resolve, reject) =>
            collection._mongoCollection.createIndex(indexCreationRequest, indexOptions, error =>
              error ? reject(error) : resolve()
            )
          )
      )
      .catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className: string, schema: SchemaType, fieldNames: string[]) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => transformKey(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className)
      .then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest))
      .catch(error => {
        if (error.code === 11000) {
          throw new Parse.Error(
            Parse.Error.DUPLICATE_VALUE,
            'Tried to ensure field uniqueness for a class that already has duplicates.'
          );
        }
        throw error;
      })
      .catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className: string, query: QueryType) {
    return this._adaptiveCollection(className)
      .then(collection =>
        collection.find(query, {
          maxTimeMS: this._maxTimeMS,
        })
      )
      .catch(err => this.handleError(err));
  }

  // Executes a count.
  count(
    className: string,
    schema: SchemaType,
    query: QueryType,
    readPreference: ?string,
    hint: ?mixed
  ) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className)
      .then(collection =>
        collection.count(transformWhere(className, query, schema, true), {
          maxTimeMS: this._maxTimeMS,
          readPreference,
          hint,
        })
      )
      .catch(err => this.handleError(err));
  }

  distinct(className: string, schema: SchemaType, query: QueryType, fieldName: string) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = transformKey(className, fieldName, schema);

    return this._adaptiveCollection(className)
      .then(collection =>
        collection.distinct(transformField, transformWhere(className, query, schema))
      )
      .then(objects => {
        objects = objects.filter(obj => obj != null);
        return objects.map(object => {
          if (isPointerField) {
            return transformPointerString(schema, fieldName, object);
          }
          return mongoObjectToParseObject(className, object, schema);
        });
      })
      .catch(err => this.handleError(err));
  }

  aggregate(
    className: string,
    schema: any,
    pipeline: any,
    readPreference: ?string,
    hint: ?mixed,
    explain?: boolean
  ) {
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (
          stage.$group._id &&
          typeof stage.$group._id === 'string' &&
          stage.$group._id.indexOf('$_p_') >= 0
        ) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className)
      .then(collection =>
        collection.aggregate(pipeline, {
          readPreference,
          maxTimeMS: this._maxTimeMS,
          hint,
          explain,
        })
      )
      .then(results => {
        results.forEach(result => {
          if (Object.prototype.hasOwnProperty.call(result, '_id')) {
            if (isPointerField && result._id) {
              result._id = result._id.split('$')[1];
            }
            if (
              result._id == null ||
              result._id == undefined ||
              (['object', 'string'].includes(typeof result._id) && _.isEmpty(result._id))
            ) {
              result._id = null;
            }
            result.objectId = result._id;
            delete result._id;
          }
        });
        return results;
      })
      .then(objects => objects.map(object => mongoObjectToParseObject(className, object, schema)))
      .catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema: any, pipeline: any): any {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }

        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema: any, pipeline: any): any {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }

      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema: any, pipeline: any): any {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value: any): any {
    if (typeof value === 'string') {
      return new Date(value);
    }

    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }

  _parseReadPreference(readPreference: ?string): ?string {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }

  performInitialization(): Promise<void> {
    return Promise.resolve();
  }

  createIndex(className: string, index: any) {
    return this._adaptiveCollection(className)
      .then(collection => collection._mongoCollection.createIndex(index))
      .catch(err => this.handleError(err));
  }

  createIndexes(className: string, indexes: any) {
    return this._adaptiveCollection(className)
      .then(collection => collection._mongoCollection.createIndexes(indexes))
      .catch(err => this.handleError(err));
  }

  createIndexesIfNeeded(className: string, fieldName: string, type: any) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere',
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }

  createTextIndexesIfNeeded(className: string, query: QueryType, schema: any): Promise<void> {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: { [fieldName]: 'text' },
      };
      return this.setIndexesWithSchemaFormat(
        className,
        textIndex,
        existingIndexes,
        schema.fields
      ).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }

  getIndexes(className: string) {
    return this._adaptiveCollection(className)
      .then(collection => collection._mongoCollection.indexes())
      .catch(err => this.handleError(err));
  }

  dropIndex(className: string, index: any) {
    return this._adaptiveCollection(className)
      .then(collection => collection._mongoCollection.dropIndex(index))
      .catch(err => this.handleError(err));
  }

  dropAllIndexes(className: string) {
    return this._adaptiveCollection(className)
      .then(collection => collection._mongoCollection.dropIndexes())
      .catch(err => this.handleError(err));
  }

  updateSchemaWithIndexes(): Promise<any> {
    return this.getAllClasses()
      .then(classes => {
        const promises = classes.map(schema => {
          return this.setIndexesFromMongo(schema.className);
        });
        return Promise.all(promises);
      })
      .catch(err => this.handleError(err));
  }

  createTransactionalSession(): Promise<any> {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }

  commitTransactionalSession(transactionalSection: any): Promise<void> {
    const commit = retries => {
      return transactionalSection
        .commitTransaction()
        .catch(error => {
          if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
            return commit(retries - 1);
          }
          throw error;
        })
        .then(() => {
          transactionalSection.endSession();
        });
    };
    return commit(5);
  }

  abortTransactionalSession(transactionalSection: any): Promise<void> {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}

export default MongoStorageAdapter;
