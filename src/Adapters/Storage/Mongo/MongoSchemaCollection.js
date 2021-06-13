import MongoCollection from './MongoCollection';
import Parse from 'parse/node';

function mongoFieldToParseSchemaField(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1),
    };
  }
  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1),
    };
  }
  switch (type) {
    case 'number':
      return { type: 'Number' };
    case 'string':
      return { type: 'String' };
    case 'boolean':
      return { type: 'Boolean' };
    case 'date':
      return { type: 'Date' };
    case 'map':
    case 'object':
      return { type: 'Object' };
    case 'array':
      return { type: 'Array' };
    case 'geopoint':
      return { type: 'GeoPoint' };
    case 'file':
      return { type: 'File' };
    case 'bytes':
      return { type: 'Bytes' };
    case 'polygon':
      return { type: 'Polygon' };
  }
}

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);
    if (
      schema._metadata &&
      schema._metadata.fields_options &&
      schema._metadata.fields_options[fieldName]
    ) {
      obj[fieldName] = Object.assign(
        {},
        obj[fieldName],
        schema._metadata.fields_options[fieldName]
      );
    }
    return obj;
  }, {});
  response.ACL = { type: 'ACL' };
  response.createdAt = { type: 'Date' };
  response.updatedAt = { type: 'Date' };
  response.objectId = { type: 'String' };
  return response;
}

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {},
});

const defaultCLPS = Object.freeze({
  find: { '*': true },
  count: { '*': true },
  get: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true },
  protectedFields: { '*': [] },
});

function mongoSchemaToParseSchema(mongoSchema) {
  let clps = defaultCLPS;
  let indexes = {};
  if (mongoSchema._metadata) {
    if (mongoSchema._metadata.class_permissions) {
      clps = { ...emptyCLPS, ...mongoSchema._metadata.class_permissions };
    }
    if (mongoSchema._metadata.indexes) {
      indexes = { ...mongoSchema._metadata.indexes };
    }
  }
  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: clps,
    indexes: indexes,
  };
}

function _mongoSchemaQueryFromNameQuery(name: string, query) {
  const object = { _id: name };
  if (query) {
    Object.keys(query).forEach(key => {
      object[key] = query[key];
    });
  }
  return object;
}

// Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.
function parseFieldTypeToMongoFieldType({ type, targetClass }) {
  switch (type) {
    case 'Pointer':
      return `*${targetClass}`;
    case 'Relation':
      return `relation<${targetClass}>`;
    case 'Number':
      return 'number';
    case 'String':
      return 'string';
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'date';
    case 'Object':
      return 'object';
    case 'Array':
      return 'array';
    case 'GeoPoint':
      return 'geopoint';
    case 'File':
      return 'file';
    case 'Bytes':
      return 'bytes';
    case 'Polygon':
      return 'polygon';
  }
}

class MongoSchemaCollection {
  _collection: MongoCollection;

  constructor(collection: MongoCollection) {
    this._collection = collection;
  }

  _fetchAllSchemasFrom_SCHEMA() {
    return this._collection._rawFind({}).then(schemas => schemas.map(mongoSchemaToParseSchema));
  }

  _fetchOneSchemaFrom_SCHEMA(name: string) {
    return this._collection
      ._rawFind(_mongoSchemaQueryFromNameQuery(name), { limit: 1 })
      .then(results => {
        if (results.length === 1) {
          return mongoSchemaToParseSchema(results[0]);
        } else {
          throw undefined;
        }
      });
  }

  // Atomically find and delete an object based on query.
  findAndDeleteSchema(name: string) {
    return this._collection._mongoCollection.findOneAndDelete(_mongoSchemaQueryFromNameQuery(name));
  }

  insertSchema(schema: any) {
    return this._collection
      .insertOne(schema)
      .then(result => mongoSchemaToParseSchema(result.ops[0]))
      .catch(error => {
        if (error.code === 11000) {
          //Mongo's duplicate key error
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Class already exists.');
        } else {
          throw error;
        }
      });
  }

  updateSchema(name: string, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name: string, query: string, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  }

  // Add a field to the schema. If database does not support the field
  // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
  // Parse error with a desciptive message. If the field already exists, this function must
  // not modify the schema, and must reject with DUPLICATE_VALUE error.
  // If this is called for a class that doesn't exist, this function must create that class.

  // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
  // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
  // Support additional types that Mongo doesn't, like Money, or something.

  // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.
  addFieldIfNotExists(className: string, fieldName: string, fieldType: string) {
    return this._fetchOneSchemaFrom_SCHEMA(className)
      .then(
        schema => {
          // If a field with this name already exists, it will be handled elsewhere.
          if (schema.fields[fieldName] !== undefined) {
            return;
          }
          // The schema exists. Check for existing GeoPoints.
          if (fieldType.type === 'GeoPoint') {
            // Make sure there are not other geopoint fields
            if (
              Object.keys(schema.fields).some(
                existingField => schema.fields[existingField].type === 'GeoPoint'
              )
            ) {
              throw new Parse.Error(
                Parse.Error.INCORRECT_TYPE,
                'MongoDB only supports one GeoPoint field in a class.'
              );
            }
          }
          return;
        },
        error => {
          // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
          // If some other error, reject with it.
          if (error === undefined) {
            return;
          }
          throw error;
        }
      )
      .then(() => {
        const { type, targetClass, ...fieldOptions } = fieldType;
        // We use $exists and $set to avoid overwriting the field type if it
        // already exists. (it could have added inbetween the last query and the update)
        if (fieldOptions && Object.keys(fieldOptions).length > 0) {
          return this.upsertSchema(
            className,
            { [fieldName]: { $exists: false } },
            {
              $set: {
                [fieldName]: parseFieldTypeToMongoFieldType({
                  type,
                  targetClass,
                }),
                [`_metadata.fields_options.${fieldName}`]: fieldOptions,
              },
            }
          );
        } else {
          return this.upsertSchema(
            className,
            { [fieldName]: { $exists: false } },
            {
              $set: {
                [fieldName]: parseFieldTypeToMongoFieldType({
                  type,
                  targetClass,
                }),
              },
            }
          );
        }
      });
  }

  async updateFieldOptions(className: string, fieldName: string, fieldType: string) {
    // eslint-disable-next-line no-unused-vars
    const { type, targetClass, ...fieldOptions } = fieldType;
    await this.upsertSchema(
      className,
      { [fieldName]: { $exists: true } },
      {
        $set: {
          [`_metadata.fields_options.${fieldName}`]: fieldOptions,
        },
      }
    );
  }
}

// Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.
MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;

export default MongoSchemaCollection;
