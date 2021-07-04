// @flow
// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// @flow-disable-next
const Parse = require('parse/node').Parse;
import { StorageAdapter } from '../Adapters/Storage/StorageAdapter';
import SchemaCache from '../Adapters/Cache/SchemaCache';
import DatabaseController from './DatabaseController';
import Config from '../Config';
// @flow-disable-next
import deepcopy from 'deepcopy';
import type {
  Schema,
  SchemaFields,
  ClassLevelPermissions,
  SchemaField,
  LoadSchemaOptions,
} from './types';

const defaultColumns: { [string]: SchemaFields } = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: { type: 'String' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date' },
    ACL: { type: 'ACL' },
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: { type: 'String' },
    password: { type: 'String' },
    email: { type: 'String' },
    emailVerified: { type: 'Boolean' },
    authData: { type: 'Object' },
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: { type: 'String' },
    deviceToken: { type: 'String' },
    channels: { type: 'Array' },
    deviceType: { type: 'String' },
    pushType: { type: 'String' },
    GCMSenderId: { type: 'String' },
    timeZone: { type: 'String' },
    localeIdentifier: { type: 'String' },
    badge: { type: 'Number' },
    appVersion: { type: 'String' },
    appName: { type: 'String' },
    appIdentifier: { type: 'String' },
    parseVersion: { type: 'String' },
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: { type: 'String' },
    users: { type: 'Relation', targetClass: '_User' },
    roles: { type: 'Relation', targetClass: '_Role' },
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    restricted: { type: 'Boolean' },
    user: { type: 'Pointer', targetClass: '_User' },
    installationId: { type: 'String' },
    sessionToken: { type: 'String' },
    expiresAt: { type: 'Date' },
    createdWith: { type: 'Object' },
  },
  _Product: {
    productIdentifier: { type: 'String' },
    download: { type: 'File' },
    downloadName: { type: 'String' },
    icon: { type: 'File' },
    order: { type: 'Number' },
    title: { type: 'String' },
    subtitle: { type: 'String' },
  },
  _PushStatus: {
    pushTime: { type: 'String' },
    pushDate: { type: 'Date' }, // to improve speed for tolling Scheduled Pushs
    source: { type: 'String' }, // rest or webui
    query: { type: 'String' }, // the stringified JSON query
    payload: { type: 'String' }, // the stringified JSON payload,
    title: { type: 'String' },
    expiry: { type: 'Number' },
    expiration_interval: { type: 'Number' },
    status: { type: 'String' },
    numSent: { type: 'Number' },
    numFailed: { type: 'Number' },
    pushHash: { type: 'String' },
    errorMessage: { type: 'Object' },
    sentPerType: { type: 'Object' },
    failedPerType: { type: 'Object' },
    sentPerUTCOffset: { type: 'Object' },
    failedPerUTCOffset: { type: 'Object' },
    count: { type: 'Number' }, // tracks # of batches queued and pending
  },
  _JobStatus: {
    jobName: { type: 'String' },
    source: { type: 'String' },
    status: { type: 'String' },
    message: { type: 'String' },
    params: { type: 'Object' }, // params received when calling the job
    finishedAt: { type: 'Date' },
  },
  _JobSchedule: {
    jobName: { type: 'String' },
    description: { type: 'String' },
    params: { type: 'String' },
    startAfter: { type: 'String' },
    daysOfWeek: { type: 'Array' },
    timeOfDay: { type: 'String' },
    lastRun: { type: 'Number' },
    repeatMinutes: { type: 'Number' },
  },
  _Hooks: {
    functionName: { type: 'String' },
    className: { type: 'String' },
    triggerName: { type: 'String' },
    url: { type: 'String' },
  },
  _GlobalConfig: {
    objectId: { type: 'String' },
    params: { type: 'Object' },
    masterKeyOnly: { type: 'Object' },
  },
  _GraphQLConfig: {
    objectId: { type: 'String' },
    config: { type: 'Object' },
  },
  _Audience: {
    objectId: { type: 'String' },
    name: { type: 'String' },
    query: { type: 'String' }, //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: { type: 'Date' },
    timesUsed: { type: 'Number' },
  },
  _Idempotency: {
    reqId: { type: 'String' },
    expire: { type: 'Date' },
  },
});

const requiredColumns = Object.freeze({
  _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
  _Role: ['name', 'ACL'],
});

const invalidColumns = ['length'];

const systemClasses = Object.freeze([
  '_User',
  '_Installation',
  '_Role',
  '_Session',
  '_Product',
  '_PushStatus',
  '_JobStatus',
  '_JobSchedule',
  '_Audience',
  '_Idempotency',
]);

const volatileClasses = Object.freeze([
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_GraphQLConfig',
  '_JobSchedule',
  '_Audience',
  '_Idempotency',
]);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;

const authenticatedRegex = /^authenticated$/;

const requiresAuthenticationRegex = /^requiresAuthentication$/;

const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([
  protectedFieldsPointerRegex,
  publicRegex,
  authenticatedRegex,
  roleRegex,
]);

// clp regex
const clpFieldsRegex = Object.freeze([
  clpPointerRegex,
  publicRegex,
  requiresAuthenticationRegex,
  roleRegex,
]);

function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      `'${key}' is not a valid key for class level permissions`
    );
  }
}

function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      `'${key}' is not a valid key for class level permissions`
    );
  }
}

const CLPValidKeys = Object.freeze([
  'find',
  'count',
  'get',
  'create',
  'update',
  'delete',
  'addField',
  'readUserFields',
  'writeUserFields',
  'protectedFields',
]);

// validation before setting class-level permissions on collection
function validateCLP(perms: ClassLevelPermissions, fields: SchemaFields, userIdRegExp: RegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        `${operationKey} is not a valid operation for class level permissions`
      );
    }

    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);

    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);

        const protectedFields = operation[entity];

        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`
          );
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(
              Parse.Error.INVALID_JSON,
              `Default field '${field}' can not be protected`
            );
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(
              Parse.Error.INVALID_JSON,
              `Field '${field}' in protectedFields:${entity} does not exist`
            );
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];

        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(
            Parse.Error.INVALID_JSON,
            `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`
          );
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
      const permit = operation[entity];

      if (permit !== true) {
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`
        );
      }
    }
  }
}

function validateCLPjson(operation: any, operationKey: string) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`
      );
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`
      );
    }
  }
}

function validatePointerPermission(fieldName: string, fields: Object, operation: string) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (
    !(
      fields[fieldName] &&
      ((fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User') ||
        fields[fieldName].type == 'Array')
    )
  ) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`
    );
  }
}

const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className: string): boolean {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName: string, className: string): boolean {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName: string, className: string): boolean {
  if (!fieldNameIsValid(fieldName, className)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}

function invalidClassNameMessage(className: string): string {
  return (
    'Invalid classname: ' +
    className +
    ', classnames can only have alphanumeric characters and _, and must start with an alpha character '
  );
}

const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = [
  'Number',
  'String',
  'Boolean',
  'Date',
  'Object',
  'Array',
  'GeoPoint',
  'File',
  'Bytes',
  'Polygon',
];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({ type, targetClass }) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }
  if (typeof type !== 'string') {
    return invalidJsonError;
  }
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }
  return undefined;
};

const convertSchemaToAdapterSchema = (schema: any) => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = { type: 'Array' };
  schema.fields._wperm = { type: 'Array' };

  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = { type: 'String' };
  }

  return schema;
};

const convertAdapterSchemaToParseSchema = ({ ...schema }) => {
  delete schema.fields._rperm;
  delete schema.fields._wperm;

  schema.fields.ACL = { type: 'ACL' };

  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = { type: 'String' };
  }

  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }

  return schema;
};

class SchemaData {
  __data: any;
  __protectedFields: any;
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }
      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = deepcopy(schema.classLevelPermissions);
            data.indexes = schema.indexes;

            const classProtectedFields = this.__protectedFields[schema.className];
            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([
                  ...(data.classLevelPermissions.protectedFields[key] || []),
                  ...classProtectedFields[key],
                ]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }

            this.__data[schema.className] = data;
          }
          return this.__data[schema.className];
        },
      });
    });

    // Inject the in-memory classes
    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {},
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }
          return this.__data[className];
        },
      });
    });
  }
}

const injectDefaultSchema = ({ className, fields, classLevelPermissions, indexes }: Schema) => {
  const defaultSchema: Schema = {
    className,
    fields: {
      ...defaultColumns._Default,
      ...(defaultColumns[className] || {}),
      ...fields,
    },
    classLevelPermissions,
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};

const _HooksSchema = { className: '_Hooks', fields: defaultColumns._Hooks };
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig,
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig,
};
const _PushStatusSchema = convertSchemaToAdapterSchema(
  injectDefaultSchema({
    className: '_PushStatus',
    fields: {},
    classLevelPermissions: {},
  })
);
const _JobStatusSchema = convertSchemaToAdapterSchema(
  injectDefaultSchema({
    className: '_JobStatus',
    fields: {},
    classLevelPermissions: {},
  })
);
const _JobScheduleSchema = convertSchemaToAdapterSchema(
  injectDefaultSchema({
    className: '_JobSchedule',
    fields: {},
    classLevelPermissions: {},
  })
);
const _AudienceSchema = convertSchemaToAdapterSchema(
  injectDefaultSchema({
    className: '_Audience',
    fields: defaultColumns._Audience,
    classLevelPermissions: {},
  })
);
const _IdempotencySchema = convertSchemaToAdapterSchema(
  injectDefaultSchema({
    className: '_Idempotency',
    fields: defaultColumns._Idempotency,
    classLevelPermissions: {},
  })
);
const VolatileClassesSchemas = [
  _HooksSchema,
  _JobStatusSchema,
  _JobScheduleSchema,
  _PushStatusSchema,
  _GlobalConfigSchema,
  _GraphQLConfigSchema,
  _AudienceSchema,
  _IdempotencySchema,
];

const dbTypeMatchesObjectType = (dbType: SchemaField | string, objectType: SchemaField) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};

const typeToString = (type: SchemaField | string): string => {
  if (typeof type === 'string') {
    return type;
  }
  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }
  return `${type.type}`;
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
export default class SchemaController {
  _dbAdapter: StorageAdapter;
  schemaData: { [string]: Schema };
  reloadDataPromise: ?Promise<any>;
  protectedFields: any;
  userIdRegEx: RegExp;

  constructor(databaseAdapter: StorageAdapter) {
    this._dbAdapter = databaseAdapter;
    this.schemaData = new SchemaData(SchemaCache.all(), this.protectedFields);
    this.protectedFields = Config.get(Parse.applicationId).protectedFields;

    const customIds = Config.get(Parse.applicationId).allowCustomObjectId;

    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;

    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;

    this._dbAdapter.watch(() => {
      this.reloadData({ clearCache: true });
    });
  }

  reloadData(options: LoadSchemaOptions = { clearCache: false }): Promise<any> {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }
    this.reloadDataPromise = this.getAllClasses(options)
      .then(
        allSchemas => {
          this.schemaData = new SchemaData(allSchemas, this.protectedFields);
          delete this.reloadDataPromise;
        },
        err => {
          this.schemaData = new SchemaData();
          delete this.reloadDataPromise;
          throw err;
        }
      )
      .then(() => {});
    return this.reloadDataPromise;
  }

  getAllClasses(options: LoadSchemaOptions = { clearCache: false }): Promise<Array<Schema>> {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    const cached = SchemaCache.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }

  setAllClasses(): Promise<Array<Schema>> {
    return this._dbAdapter
      .getAllClasses()
      .then(allSchemas => allSchemas.map(injectDefaultSchema))
      .then(allSchemas => {
        SchemaCache.put(allSchemas);
        return allSchemas;
      });
  }

  getOneSchema(
    className: string,
    allowVolatileClasses: boolean = false,
    options: LoadSchemaOptions = { clearCache: false }
  ): Promise<Schema> {
    if (options.clearCache) {
      SchemaCache.clear();
    }
    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes,
      });
    }
    const cached = SchemaCache.get(className);
    if (cached && !options.clearCache) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses().then(allSchemas => {
      const oneSchema = allSchemas.find(schema => schema.className === className);
      if (!oneSchema) {
        return Promise.reject(undefined);
      }
      return oneSchema;
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  async addClassIfNotExists(
    className: string,
    fields: SchemaFields = {},
    classLevelPermissions: any,
    indexes: any = {}
  ): Promise<void | Schema> {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }
      return Promise.reject(validationError);
    }
    try {
      const adapterSchema = await this._dbAdapter.createClass(
        className,
        convertSchemaToAdapterSchema({
          fields,
          classLevelPermissions,
          indexes,
          className,
        })
      );
      // TODO: Remove by updating schema cache directly
      await this.reloadData({ clearCache: true });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }

  updateClass(
    className: string,
    submittedFields: SchemaFields,
    classLevelPermissions: any,
    indexes: any,
    database: DatabaseController
  ) {
    return this.getOneSchema(className)
      .then(schema => {
        const existingFields = schema.fields;
        Object.keys(submittedFields).forEach(name => {
          const field = submittedFields[name];
          if (existingFields[name] && field.__op !== 'Delete') {
            throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
          }
          if (!existingFields[name] && field.__op === 'Delete') {
            throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
          }
        });

        delete existingFields._rperm;
        delete existingFields._wperm;
        const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
        const defaultFields = defaultColumns[className] || defaultColumns._Default;
        const fullNewSchema = Object.assign({}, newSchema, defaultFields);
        const validationError = this.validateSchemaData(
          className,
          newSchema,
          classLevelPermissions,
          Object.keys(existingFields)
        );
        if (validationError) {
          throw new Parse.Error(validationError.code, validationError.error);
        }

        // Finally we have checked to make sure the request is valid and we can start deleting fields.
        // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
        const deletedFields: string[] = [];
        const insertedFields = [];
        Object.keys(submittedFields).forEach(fieldName => {
          if (submittedFields[fieldName].__op === 'Delete') {
            deletedFields.push(fieldName);
          } else {
            insertedFields.push(fieldName);
          }
        });

        let deletePromise = Promise.resolve();
        if (deletedFields.length > 0) {
          deletePromise = this.deleteFields(deletedFields, className, database);
        }
        let enforceFields = [];
        return (
          deletePromise // Delete Everything
            .then(() => this.reloadData({ clearCache: true })) // Reload our Schema, so we have all the new values
            .then(() => {
              const promises = insertedFields.map(fieldName => {
                const type = submittedFields[fieldName];
                return this.enforceFieldExists(className, fieldName, type);
              });
              return Promise.all(promises);
            })
            .then(results => {
              enforceFields = results.filter(result => !!result);
              return this.setPermissions(className, classLevelPermissions, newSchema);
            })
            .then(() =>
              this._dbAdapter.setIndexesWithSchemaFormat(
                className,
                indexes,
                schema.indexes,
                fullNewSchema
              )
            )
            .then(() => this.reloadData({ clearCache: true }))
            //TODO: Move this logic into the database adapter
            .then(() => {
              this.ensureFields(enforceFields);
              const schema = this.schemaData[className];
              const reloadedSchema: Schema = {
                className: className,
                fields: schema.fields,
                classLevelPermissions: schema.classLevelPermissions,
              };
              if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
                reloadedSchema.indexes = schema.indexes;
              }
              return reloadedSchema;
            })
        );
      })
      .catch(error => {
        if (error === undefined) {
          throw new Parse.Error(
            Parse.Error.INVALID_CLASS_NAME,
            `Class ${className} does not exist.`
          );
        } else {
          throw error;
        }
      });
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className: string): Promise<SchemaController> {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className)
        .catch(() => {
          // The schema update failed. This can be okay - it might
          // have failed because there's a race condition and a different
          // client is making the exact same schema update that we want.
          // So just reload the schema.
          return this.reloadData({ clearCache: true });
        })
        .then(() => {
          // Ensure that the schema now validates
          if (this.schemaData[className]) {
            return this;
          } else {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
          }
        })
        .catch(() => {
          // The schema still doesn't validate. Give up
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
        })
    );
  }

  validateNewClass(className: string, fields: SchemaFields = {}, classLevelPermissions: any): any {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className),
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }

  validateSchemaData(
    className: string,
    fields: SchemaFields,
    classLevelPermissions: ClassLevelPermissions,
    existingFieldNames: Array<string>
  ) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName, className)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName,
          };
        }
        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added',
          };
        }
        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return { code: error.code, error: error.message };
        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);
          if (typeof defaultValueType === 'string') {
            defaultValueType = { type: defaultValueType };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`,
            };
          }
          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(
                fieldType
              )} but got ${typeToString(defaultValueType)}`,
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`,
            };
          }
        }
      }
    }

    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }

    const geoPoints = Object.keys(fields).filter(
      key => fields[key] && fields[key].type === 'GeoPoint'
    );
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error:
          'currently, only one GeoPoint field may exist in an object. Adding ' +
          geoPoints[1] +
          ' when ' +
          geoPoints[0] +
          ' already exists.',
      };
    }
    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  async setPermissions(className: string, perms: any, newSchema: SchemaFields) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);
    const cached = SchemaCache.get(className);
    if (cached) {
      cached.classLevelPermissions = perms;
    }
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className: string, fieldName: string, type: string | SchemaField) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    if (!fieldNameIsValid(fieldName, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
    if (!type) {
      return undefined;
    }

    const expectedType = this.getExpectedType(className, fieldName);
    if (typeof type === 'string') {
      type = ({ type }: SchemaField);
    }

    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);
      if (typeof defaultValueType === 'string') {
        defaultValueType = { type: defaultValueType };
      }
      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(
          Parse.Error.INCORRECT_TYPE,
          `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(
            type
          )} but got ${typeToString(defaultValueType)}`
        );
      }
    }

    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(
          Parse.Error.INCORRECT_TYPE,
          `schema mismatch for ${className}.${fieldName}; expected ${typeToString(
            expectedType
          )} but got ${typeToString(type)}`
        );
      }
      return undefined;
    }

    return this._dbAdapter
      .addFieldIfNotExists(className, fieldName, type)
      .catch(error => {
        if (error.code == Parse.Error.INCORRECT_TYPE) {
          // Make sure that we throw errors when it is appropriate to do so.
          throw error;
        }
        // The update failed. This can be okay - it might have been a race
        // condition where another client updated the schema in the same
        // way that we wanted to. So, just reload the schema
        return Promise.resolve();
      })
      .then(() => {
        return {
          className,
          fieldName,
          type,
        };
      });
  }

  ensureFields(fields: any) {
    for (let i = 0; i < fields.length; i += 1) {
      const { className, fieldName } = fields[i];
      let { type } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);
      if (typeof type === 'string') {
        type = { type: type };
      }
      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  }

  // maintain compatibility
  deleteField(fieldName: string, className: string, database: DatabaseController) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteFields(fieldNames: Array<string>, className: string, database: DatabaseController) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }

    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName, className)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });

    return this.getOneSchema(className, false, { clearCache: true })
      .catch(error => {
        if (error === undefined) {
          throw new Parse.Error(
            Parse.Error.INVALID_CLASS_NAME,
            `Class ${className} does not exist.`
          );
        } else {
          throw error;
        }
      })
      .then(schema => {
        fieldNames.forEach(fieldName => {
          if (!schema.fields[fieldName]) {
            throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
          }
        });

        const schemaFields = { ...schema.fields };
        return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
          return Promise.all(
            fieldNames.map(fieldName => {
              const field = schemaFields[fieldName];
              if (field && field.type === 'Relation') {
                //For relations, drop the _Join table
                return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
              }
              return Promise.resolve();
            })
          );
        });
      })
      .then(() => {
        SchemaCache.clear();
      });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  async validateObject(className: string, object: any, query: any) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];

    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }
      if (geocount > 1) {
        return Promise.reject(
          new Parse.Error(
            Parse.Error.INCORRECT_TYPE,
            'there can only be one geopoint field in a class'
          )
        );
      }
    }
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
      if (!expected) {
        continue;
      }
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promises.push(schema.enforceFieldExists(className, fieldName, expected));
    }
    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);

    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
      await this.reloadData({ clearCache: true });
    }
    this.ensureFields(enforceFields);

    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className: string, object: any, query: any) {
    const columns = requiredColumns[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
        return false;
      }
      return !object[column];
    });

    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }
    return Promise.resolve(this);
  }

  testPermissionsForClassName(className: string, aclGroup: string[], operation: string) {
    return SchemaController.testPermissions(
      this.getClassLevelPermissions(className),
      aclGroup,
      operation
    );
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions: ?any, aclGroup: string[], operation: string): boolean {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (
      aclGroup.some(acl => {
        return perms[acl] === true;
      })
    ) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(
    classPermissions: ?any,
    className: string,
    aclGroup: string[],
    operation: string,
    action?: string
  ) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }

    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Permission denied, user needs to be authenticated.'
        );
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Permission denied, user needs to be authenticated.'
        );
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField =
      ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        `Permission denied for action ${operation} on class ${className}.`
      );
    }

    // Process the readUserFields later
    if (
      Array.isArray(classPermissions[permissionField]) &&
      classPermissions[permissionField].length > 0
    ) {
      return Promise.resolve();
    }

    const pointerFields = classPermissions[operation].pointerFields;
    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }

    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      `Permission denied for action ${operation} on class ${className}.`
    );
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className: string, aclGroup: string[], operation: string, action?: string) {
    return SchemaController.validatePermission(
      this.getClassLevelPermissions(className),
      className,
      aclGroup,
      operation,
      action
    );
  }

  getClassLevelPermissions(className: string): any {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className: string, fieldName: string): ?(SchemaField | string) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className: string) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
const load = (dbAdapter: StorageAdapter, options: any): Promise<SchemaController> => {
  const schema = new SchemaController(dbAdapter);
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
function buildMergedSchemaObject(existingFields: SchemaFields, putRequest: any): SchemaFields {
  const newSchema = {};
  // @flow-disable-next
  const sysSchemaField =
    Object.keys(defaultColumns).indexOf(existingFields._id) === -1
      ? []
      : Object.keys(defaultColumns[existingFields._id]);
  for (const oldField in existingFields) {
    if (
      oldField !== '_id' &&
      oldField !== 'ACL' &&
      oldField !== 'updatedAt' &&
      oldField !== 'createdAt' &&
      oldField !== 'objectId'
    ) {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj: any): ?(SchemaField | string) {
  const type = typeof obj;
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }
      return getObjectType(obj);
    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj): ?(SchemaField | string) {
  if (obj instanceof Array) {
    return 'Array';
  }
  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className,
          };
        }
        break;
      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className,
          };
        }
        break;
      case 'File':
        if (obj.name) {
          return 'File';
        }
        break;
      case 'Date':
        if (obj.iso) {
          return 'Date';
        }
        break;
      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }
        break;
      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }
        break;
      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }
        break;
    }
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className,
        };
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}

export {
  load,
  classNameIsValid,
  fieldNameIsValid,
  invalidClassNameMessage,
  buildMergedSchemaObject,
  systemClasses,
  defaultColumns,
  convertSchemaToAdapterSchema,
  VolatileClassesSchemas,
  SchemaController,
};
