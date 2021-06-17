import Parse from 'parse/node';
import { logger } from './logger';
import Config from './Config';
import { internalCreateSchema, internalUpdateSchema } from './Routers/SchemasRouter';
import { defaultColumns } from './Controllers/SchemaController';

export class DefinedSchemas {
  constructor(localSchemas, config) {
    this.config = Config.get(config.appId);
    this.localSchemas = localSchemas;
    this.retries = 0;
    this.maxRetries = 3;
  }

  // Simulate save like the SDK
  // We cannot use SDK since routes are disabled
  async saveSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp,
    };
    await internalCreateSchema(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }

  async resetSchemaOps(schema) {
    // Reset ops like SDK
    schema._fields = {};
    schema._indexes = {};
  }

  // Simulate update like the SDK
  // We cannot use SDK since routes are disabled
  async updateSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp,
    };
    await internalUpdateSchema(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }

  async execute() {
    let timeout;
    try {
      // Set up a time out in production
      // if we fail to get schema
      // pm2 or K8s and many other process managers will try to restart the process
      // after the exit
      timeout = setTimeout(() => {
        if (process.env.NODE_ENV === 'production') process.exit(1);
      }, 20000);
      // Hack to force session schema to be created
      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time
        // modern systems like k8 avoid this by doing rolling updates
        await this.wait(1000 * this.retries);
        await this.execute();
      } else {
        logger.error(e);
        if (process.env.NODE_ENV === 'production') process.exit(1);
      }
    }
  }

  // Required for testing purpose
  async wait(time) {
    await new Promise(resolve => setTimeout(resolve, time));
  }

  async enforceCLPForNonProvidedClass() {
    const nonProvidedClasses = this.allCloudSchemas.filter(
      cloudSchema =>
        !this.localSchemas.some(localSchema => localSchema.className === cloudSchema.className)
    );
    await Promise.all(
      nonProvidedClasses.map(async schema => {
        const parseSchema = new Parse.Schema(schema.className);
        this.handleCLP(schema, parseSchema);
        await this.updateSchemaToDB(parseSchema);
      })
    );
  }

  // Create a fake session since Parse do not create the _Session until
  // a session is created
  async createDeleteSession() {
    const session = new Parse.Session();
    await session.save(null, { useMasterKey: true });
    await session.destroy({ useMasterKey: true });
  }

  async saveOrUpdate(localSchema) {
    const cloudSchema = this.allCloudSchemas.find(sc => sc.className === localSchema.className);
    if (cloudSchema) {
      await this.updateSchema(localSchema, cloudSchema);
    } else {
      await this.saveSchema(localSchema);
    }
  }

  async saveSchema(localSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);
    if (localSchema.fields) {
      // Handle fields
      Object.keys(localSchema.fields)
        .filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName))
        .forEach(fieldName => {
          const { type, ...others } = localSchema.fields[fieldName];
          this.handleFields(newLocalSchema, fieldName, type, others);
        });
    }
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema);

    return this.saveSchemaToDB(newLocalSchema);
  }

  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    // Handle fields
    // Check addition
    if (localSchema.fields) {
      Object.keys(localSchema.fields)
        .filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName))
        .forEach(fieldName => {
          const { type, ...others } = localSchema.fields[fieldName];
          if (!cloudSchema.fields[fieldName])
            this.handleFields(newLocalSchema, fieldName, type, others);
        });
    }

    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = [];

    // Check deletion
    Object.keys(cloudSchema.fields)
      .filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName))
      .forEach(async fieldName => {
        const field = cloudSchema.fields[fieldName];
        if (!localSchema.fields || !localSchema.fields[fieldName]) {
          fieldsToDelete.push(fieldName);
          return;
        }

        const localField = localSchema.fields[fieldName];
        // Check if field has a changed type
        if (
          !this.paramsAreEquals(
            { type: field.type, targetClass: field.targetClass },
            { type: localField.type, targetClass: localField.targetClass }
          )
        ) {
          fieldsToRecreate.push(fieldName);
          fieldsToDelete.push(fieldName);
          return;
        }

        // Check if something changed other than the type (like required, defaultValue)
        if (!this.paramsAreEquals(field, localField)) {
          fieldsWithChangedParams.push(fieldName);
        }
      });

    fieldsToDelete.forEach(fieldName => {
      newLocalSchema.deleteField(fieldName);
    });

    // Delete fields from the schema then apply changes
    await this.updateSchemaToDB(newLocalSchema);

    fieldsToRecreate.forEach(fieldName => {
      const { type, ...others } = localSchema.fields[fieldName];
      this.handleFields(newLocalSchema, fieldName, type, others);
    });
    fieldsWithChangedParams.forEach(fieldName => {
      const { type, ...others } = localSchema.fields[fieldName];
      this.handleFields(newLocalSchema, fieldName, type, others);
    });

    // Handle Indexes
    // Check addition
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (
          (!cloudSchema.indexes || !cloudSchema.indexes[indexName]) &&
          !this.isProtectedIndex(localSchema.className, indexName)
        )
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
      });
    }

    const indexesToAdd = [];

    // Check deletion
    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(async indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (
            !this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])
          ) {
            newLocalSchema.deleteIndex(indexName);
            indexesToAdd.push({
              indexName,
              index: localSchema.indexes[indexName],
            });
          }
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema, cloudSchema);
    // Apply changes
    await this.updateSchemaToDB(newLocalSchema);
    // Apply new/changed indexes
    if (indexesToAdd.length) {
      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }

  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    }
    // Use spread to avoid read only issue (encountered by Moumouls using directAccess)
    const clp = { ...localSchema.classLevelPermissions } || {};
    const cloudCLP = (cloudSchema && cloudSchema.classLevelPermissions) || {};
    // Try to inject default CLPs
    const CLPKeys = ['find', 'count', 'get', 'create', 'update', 'delete', 'addField'];
    CLPKeys.forEach(key => {
      if (!clp[key]) {
        clp[key] = cloudCLP[key] || { '*': true };
      }
    });
    // To avoid inconsistency we need to remove all rights on addField
    clp.addField = {};
    newLocalSchema.setCLP(clp);
  }

  isProtectedFields(className, fieldName) {
    return (
      !!defaultColumns._Default[fieldName] ||
      !!(defaultColumns[className] && defaultColumns[className][fieldName])
    );
  }

  isProtectedIndex(className, indexName) {
    let indexes = ['_id_'];
    if (className === '_User') {
      indexes = [
        ...indexes,
        'case_insensitive_username',
        'case_insensitive_email',
        'username_1',
        'email_1',
      ];
    }

    return indexes.indexOf(indexName) !== -1;
  }

  paramsAreEquals(indexA, indexB) {
    const keysIndexA = Object.keys(indexA);
    const keysIndexB = Object.keys(indexB);

    // Check key name
    if (keysIndexA.length !== keysIndexB.length) return false;
    return keysIndexA.every(k => indexA[k] === indexB[k]);
  }

  handleFields(newLocalSchema, fieldName, type, others) {
    if (type === 'Relation') {
      newLocalSchema.addRelation(fieldName, others.targetClass);
    } else if (type === 'Pointer') {
      const { targetClass, ...others2 } = others;
      newLocalSchema.addPointer(fieldName, targetClass, others2);
    } else {
      newLocalSchema.addField(fieldName, type, others);
    }
  }
}
