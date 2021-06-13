const { DefinedSchemas } = require('../lib/DefinedSchemas');
const Config = require('../lib/Config');

const cleanUpIndexes = schema => {
  if (schema.indexes) {
    delete schema.indexes._id_;
    if (!Object.keys(schema.indexes).length) {
      delete schema.indexes;
    }
  }
};

describe('DefinedSchemas', () => {
  let config;
  beforeEach(async () => {
    config = Config.get('test');
    await config.database.adapter.deleteAllClasses();
  });
  afterAll(async () => {
    await config.database.adapter.deleteAllClasses();
  });

  describe('Fields', () => {
    it('should keep default fields if not provided', async () => {
      const server = await reconfigureServer();
      // Will perform create
      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      const expectedFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      };
      expect(schema.fields).toEqual(expectedFields);

      await server.config.schemaCache.clear();
      // Will perform update
      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);
    });
    it('should protect default fields', async () => {
      const server = await reconfigureServer();

      const schemas = [
        {
          className: '_User',
          fields: {
            email: 'Object',
          },
        },
        {
          className: '_Role',
          fields: {
            users: 'Object',
          },
        },
        {
          className: '_Installation',
          fields: {
            installationId: 'Object',
          },
        },
        {
          className: 'Test',
          fields: {
            createdAt: { type: 'Object' },
            objectId: { type: 'Number' },
            updatedAt: { type: 'String' },
            ACL: { type: 'String' },
          },
        },
      ];

      const expectedFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      };

      const expectedUserFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        username: { type: 'String' },
        password: { type: 'String' },
        email: { type: 'String' },
        emailVerified: { type: 'Boolean' },
        authData: { type: 'Object' },
      };

      const expectedRoleFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        name: { type: 'String' },
        users: { type: 'Relation', targetClass: '_User' },
        roles: { type: 'Relation', targetClass: '_Role' },
      };

      const expectedInstallationFields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
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
      };

      // Perform create
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);

      let userSchema = await new Parse.Schema('_User').get();
      expect(userSchema.fields).toEqual(expectedUserFields);

      let roleSchema = await new Parse.Schema('_Role').get();
      expect(roleSchema.fields).toEqual(expectedRoleFields);

      let installationSchema = await new Parse.Schema('_Installation').get();
      expect(installationSchema.fields).toEqual(expectedInstallationFields);

      await server.config.schemaCache.clear();
      // Perform update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(expectedFields);

      userSchema = await new Parse.Schema('_User').get();
      expect(userSchema.fields).toEqual(expectedUserFields);

      roleSchema = await new Parse.Schema('_Role').get();
      expect(roleSchema.fields).toEqual(expectedRoleFields);

      installationSchema = await new Parse.Schema('_Installation').get();
      expect(installationSchema.fields).toEqual(expectedInstallationFields);
    });
    it('should create new fields', async () => {
      const server = await reconfigureServer();
      const fields = {
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
        aString: { type: 'String' },
        aStringWithDefault: { type: 'String', defaultValue: 'Test' },
        aStringWithRequired: { type: 'String', required: true },
        aStringWithRequiredAndDefault: { type: 'String', required: true, defaultValue: 'Test' },
        aBoolean: { type: 'Boolean' },
        aFile: { type: 'File' },
        aNumber: { type: 'Number' },
        aRelation: { type: 'Relation', targetClass: '_User' },
        aPointer: { type: 'Pointer', targetClass: '_Role' },
        aDate: { type: 'Date' },
        aGeoPoint: { type: 'GeoPoint' },
        aPolygon: { type: 'Polygon' },
        aArray: { type: 'Array' },
        aObject: { type: 'Object' },
      };
      const schemas = [
        {
          className: 'Test',
          fields,
        },
      ];

      // Create
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(fields);

      fields.anotherObject = { type: 'Object' };
      // Update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual(fields);
    });
    it('should delete removed fields', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toBeDefined();

      await new DefinedSchemas([{ className: 'Test' }], server.config).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields).toEqual({
        objectId: { type: 'String' },
        createdAt: { type: 'Date' },
        updatedAt: { type: 'Date' },
        ACL: { type: 'ACL' },
      });
    });
    it('should re create fields with changed type', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String' });

      const object = new Parse.Object('Test');
      await object.save({ aField: 'Hello' }, { useMasterKey: true });

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'Number' } } }],
        server.config
      ).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'Number' });

      await object.fetch({ useMasterKey: true });
      expect(object.get('aField')).toBeUndefined();
    });
    it('should just update classic fields with changed params', async () => {
      const server = await reconfigureServer();

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String' } } }],
        server.config
      ).execute();

      let schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String' });

      const object = new Parse.Object('Test');
      await object.save({ aField: 'Hello' }, { useMasterKey: true });

      await new DefinedSchemas(
        [{ className: 'Test', fields: { aField: { type: 'String', required: true } } }],
        server.config
      ).execute();

      schema = await new Parse.Schema('Test').get();
      expect(schema.fields.aField).toEqual({ type: 'String', required: true });

      await object.fetch({ useMasterKey: true });
      expect(object.get('aField')).toEqual('Hello');
    });
  });

  describe('Indexes', () => {
    it('should create new indexes', async () => {
      const server = await reconfigureServer();

      const indexes = { complex: { createdAt: 1, updatedAt: 1 } };

      const schemas = [{ className: 'Test', fields: { aField: { type: 'String' } }, indexes }];
      await new DefinedSchemas(schemas, server.config).execute();

      let schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toEqual(indexes);

      indexes.complex2 = { createdAt: 1, aField: 1 };
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toEqual(indexes);
    });
    it('should re create changed indexes', async () => {
      const server = await reconfigureServer();

      let indexes = { complex: { createdAt: 1, updatedAt: 1 } };

      let schemas = [{ className: 'Test', indexes }];
      await new DefinedSchemas(schemas, server.config).execute();

      indexes = { complex: { createdAt: 1 } };
      schemas = [{ className: 'Test', indexes }];

      // Change indexes
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toEqual(indexes);

      // Update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toEqual(indexes);
    });
    it('should delete removed indexes', async () => {
      const server = await reconfigureServer();

      let indexes = { complex: { createdAt: 1, updatedAt: 1 } };

      let schemas = [{ className: 'Test', indexes }];
      await new DefinedSchemas(schemas, server.config).execute();

      indexes = {};
      schemas = [{ className: 'Test', indexes }];
      // Change indexes
      await new DefinedSchemas(schemas, server.config).execute();
      let schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toBeUndefined();

      // Update
      await new DefinedSchemas(schemas, server.config).execute();
      schema = await new Parse.Schema('Test').get();
      cleanUpIndexes(schema);
      expect(schema.indexes).toBeUndefined();
    });
    it('should keep protected indexes', async () => {
      const server = await reconfigureServer();

      const expectedIndexes = {
        username_1: { username: 1 },
        case_insensitive_username: { username: 1 },
        email_1: { email: 1 },
        case_insensitive_email: { email: 1 },
      };
      const schemas = [
        {
          className: '_User',
          indexes: {
            case_insensitive_username: { password: true },
            case_insensitive_email: { password: true },
          },
        },
        { className: 'Test' },
      ];
      // Create
      await new DefinedSchemas(schemas, server.config).execute();
      let userSchema = await new Parse.Schema('_User').get();
      let testSchema = await new Parse.Schema('Test').get();
      cleanUpIndexes(userSchema);
      cleanUpIndexes(testSchema);
      expect(testSchema.indexes).toBeUndefined();
      expect(userSchema.indexes).toEqual(expectedIndexes);

      // Update
      await new DefinedSchemas(schemas, server.config).execute();
      userSchema = await new Parse.Schema('_User').get();
      testSchema = await new Parse.Schema('Test').get();
      cleanUpIndexes(userSchema);
      cleanUpIndexes(testSchema);
      expect(testSchema.indexes).toBeUndefined();
      expect(userSchema.indexes).toEqual(expectedIndexes);
    });
  });

  describe('ClassLevelPermissions', () => {
    it('should use default CLP', async () => {
      const server = await reconfigureServer();
      const schemas = [{ className: 'Test' }];
      await new DefinedSchemas(schemas, server.config).execute();

      const expectedTestCLP = {
        find: { '*': true },
        count: { '*': true },
        get: { '*': true },
        create: { '*': true },
        update: { '*': true },
        delete: { '*': true },
        addField: {},
        protectedFields: {},
      };
      let testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);

      await new DefinedSchemas(schemas, server.config).execute();
      testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);
    });
    it('should save CLP', async () => {
      const server = await reconfigureServer();

      const expectedTestCLP = {
        find: {},
        count: { requiresAuthentication: true },
        get: { 'role:Admin': true },
        create: { 'role:ARole': true, requiresAuthentication: true },
        update: { requiresAuthentication: true },
        delete: { requiresAuthentication: true },
        addField: {},
        protectedFields: { '*': ['aField'], 'role:Admin': ['anotherField'] },
      };
      const schemas = [
        {
          className: 'Test',
          fields: { aField: { type: 'String' }, anotherField: { type: 'Object' } },
          classLevelPermissions: expectedTestCLP,
        },
      ];
      await new DefinedSchemas(schemas, server.config).execute();

      let testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);

      expectedTestCLP.update = {};
      expectedTestCLP.create = { requiresAuthentication: true };

      await new DefinedSchemas(schemas, server.config).execute();
      testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);
    });
    it('should force addField to empty', async () => {
      const server = await reconfigureServer();
      const schemas = [{ className: 'Test', classLevelPermissions: { addField: { '*': true } } }];
      await new DefinedSchemas(schemas, server.config).execute();

      const expectedTestCLP = {
        find: { '*': true },
        count: { '*': true },
        get: { '*': true },
        create: { '*': true },
        update: { '*': true },
        delete: { '*': true },
        addField: {},
        protectedFields: {},
      };

      let testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);

      await new DefinedSchemas(schemas, server.config).execute();
      testSchema = await new Parse.Schema('Test').get();
      expect(testSchema.classLevelPermissions).toEqual(expectedTestCLP);
    });
  });

  it('should not delete automatically classes', async () => {
    await reconfigureServer({ schemas: [{ className: '_User' }, { className: 'Test' }] });

    await reconfigureServer({ schemas: [{ className: '_User' }] });

    const schema = await new Parse.Schema('Test').get();
    expect(schema.className).toEqual('Test');
  });

  it('should disable class PUT/POST endpoint when schemas provided to avoid dual source of truth', async () => {
    await reconfigureServer({ schemas: [{ className: '_User' }, { className: 'Test' }] });
    await reconfigureServer({ schemas: [{ className: '_User' }] });

    const schema = await new Parse.Schema('Test').get();
    expect(schema.className).toEqual('Test');

    const schemas = await Parse.Schema.all();
    expect(schemas.length).toEqual(4);

    try {
      await new Parse.Schema('Test').save();
    } catch (e) {
      expect(e.message).toContain('cannot perform this operation when schemas options is used.');
    }

    try {
      await new Parse.Schema('_User').update();
    } catch (e) {
      expect(e.message).toContain('cannot perform this operation when schemas options is used.');
    }
  });
  it('should only enable delete class endpoint since', async () => {
    await reconfigureServer({ schemas: [{ className: '_User' }, { className: 'Test' }] });
    await reconfigureServer({ schemas: [{ className: '_User' }] });

    let schemas = await Parse.Schema.all();
    expect(schemas.length).toEqual(4);

    await new Parse.Schema('_User').delete();
    schemas = await Parse.Schema.all();
    expect(schemas.length).toEqual(3);
  });
  it('should run beforeSchemasMigration before execution of DefinedSchemas', async () => {
    let before = false;
    const server = await reconfigureServer({
      schemas: [{ className: '_User' }, { className: 'Test' }],
      beforeSchemasMigration: async () => {
        expect(before).toEqual(false);
        before = true;
      },
    });
    before = true;
    expect(before).toEqual(true);
    expect(server).toBeDefined();
  });
  it('should use logger in case of error after 3 retries', async () => {
    const server = await reconfigureServer({ schemas: [{ className: '_User' }] });
    const error = new Error('A test error');
    const logger = require('../lib/logger').logger;
    spyOn(DefinedSchemas.prototype, 'wait').and.resolveTo();
    spyOn(logger, 'error').and.callThrough();
    spyOn(Parse.Schema, 'all').and.callFake(async () => {
      throw error;
    });

    await new DefinedSchemas(
      [{ className: 'Test', fields: { aField: { type: 'String' } } }],
      server.config
    ).execute();

    expect(logger.error).toHaveBeenCalledWith(error);
    expect(DefinedSchemas.prototype.wait).toHaveBeenCalledTimes(3);
    const calls = DefinedSchemas.prototype.wait.calls.all();
    expect(calls[0].args[0]).toEqual(1000);
    expect(calls[1].args[0]).toEqual(2000);
    expect(calls[2].args[0]).toEqual(3000);
  });
  it('should perform migration in parallel without failing', async () => {
    const server = await reconfigureServer();
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callThrough();
    const schema = {
      className: 'Test',
      fields: { aField: { type: 'String' } },
      indexes: { aField: { aField: 1 } },
      classLevelPermissions: {
        create: { requiresAuthentication: true },
      },
    };

    // Simulate parallel deployment
    await Promise.all([
      new DefinedSchemas([schema], server.config).execute(),
      new DefinedSchemas([schema], server.config).execute(),
      new DefinedSchemas([schema], server.config).execute(),
      new DefinedSchemas([schema], server.config).execute(),
      new DefinedSchemas([schema], server.config).execute(),
    ]);

    const testSchema = (await Parse.Schema.all()).find(
      ({ className }) => className === schema.className
    );

    expect(testSchema.indexes.aField).toEqual({ aField: 1 });
    expect(testSchema.fields.aField).toEqual({ type: 'String' });
    expect(testSchema.classLevelPermissions.create).toEqual({ requiresAuthentication: true });
    expect(logger.error).toHaveBeenCalledTimes(0);
  });
});
