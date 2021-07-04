const Config = require('../lib/Config');
const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';

describe_only_db('mongo')('Schema Performance', function () {
  let getAllSpy;
  let config;

  beforeEach(async () => {
    config = Config.get('test');
    config.schemaCache.clear();
    const databaseAdapter = new MongoStorageAdapter({ uri: mongoURI });
    await reconfigureServer({ databaseAdapter });
    getAllSpy = spyOn(databaseAdapter, 'getAllClasses').and.callThrough();
  });

  it('test new object', async () => {
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test new object multiple fields', async () => {
    const container = new Container({
      dateField: new Date(),
      arrayField: [],
      numberField: 1,
      stringField: 'hello',
      booleanField: true,
    });
    await container.save();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test update existing fields', async () => {
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    getAllSpy.calls.reset();

    object.set('foo', 'barz');
    await object.save();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  xit('test saveAll / destroyAll', async () => {
    // This test can be flaky due to the nature of /batch requests
    // Used for performance
    const object = new TestObject();
    await object.save();

    getAllSpy.calls.reset();

    const objects = [];
    for (let i = 0; i < 10; i++) {
      const object = new TestObject();
      object.set('number', i);
      objects.push(object);
    }
    await Parse.Object.saveAll(objects);
    expect(getAllSpy.calls.count()).toBe(0);

    getAllSpy.calls.reset();

    const query = new Parse.Query(TestObject);
    await query.find();
    expect(getAllSpy.calls.count()).toBe(0);

    getAllSpy.calls.reset();

    await Parse.Object.destroyAll(objects);
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test add new field to existing object', async () => {
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    getAllSpy.calls.reset();

    object.set('new', 'barz');
    await object.save();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test add multiple fields to existing object', async () => {
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    getAllSpy.calls.reset();

    object.set({
      dateField: new Date(),
      arrayField: [],
      numberField: 1,
      stringField: 'hello',
      booleanField: true,
    });
    await object.save();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test user', async () => {
    const user = new Parse.User();
    user.setUsername('testing');
    user.setPassword('testing');
    await user.signUp();

    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test query include', async () => {
    const child = new TestObject();
    await child.save();

    const object = new TestObject();
    object.set('child', child);
    await object.save();

    getAllSpy.calls.reset();

    const query = new Parse.Query(TestObject);
    query.include('child');
    await query.get(object.id);

    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('query relation without schema', async () => {
    const child = new Parse.Object('ChildObject');
    await child.save();

    const parent = new Parse.Object('ParentObject');
    const relation = parent.relation('child');
    relation.add(child);
    await parent.save();

    getAllSpy.calls.reset();

    const objects = await relation.query().find();
    expect(objects.length).toBe(1);
    expect(objects[0].id).toBe(child.id);

    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test delete object', async () => {
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();

    getAllSpy.calls.reset();

    await object.destroy();
    expect(getAllSpy.calls.count()).toBe(0);
  });

  it('test schema update class', async () => {
    const container = new Container();
    await container.save();

    getAllSpy.calls.reset();

    const schema = await config.database.loadSchema();
    await schema.reloadData();

    const levelPermissions = {
      find: { '*': true },
      get: { '*': true },
      create: { '*': true },
      update: { '*': true },
      delete: { '*': true },
      addField: { '*': true },
      protectedFields: { '*': [] },
    };

    await schema.updateClass(
      'Container',
      {
        fooOne: { type: 'Number' },
        fooTwo: { type: 'Array' },
        fooThree: { type: 'Date' },
        fooFour: { type: 'Object' },
        fooFive: { type: 'Relation', targetClass: '_User' },
        fooSix: { type: 'String' },
        fooSeven: { type: 'Object' },
        fooEight: { type: 'String' },
        fooNine: { type: 'String' },
        fooTeen: { type: 'Number' },
        fooEleven: { type: 'String' },
        fooTwelve: { type: 'String' },
        fooThirteen: { type: 'String' },
        fooFourteen: { type: 'String' },
        fooFifteen: { type: 'String' },
        fooSixteen: { type: 'String' },
        fooEighteen: { type: 'String' },
        fooNineteen: { type: 'String' },
      },
      levelPermissions,
      {},
      config.database
    );
    expect(getAllSpy.calls.count()).toBe(0);
  });
});
