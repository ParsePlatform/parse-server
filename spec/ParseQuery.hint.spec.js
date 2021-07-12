'use strict';

const Config = require('../lib/Config');
const TestUtils = require('../lib/TestUtils');
const request = require('../lib/request');

let config;

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};

const masterKeyOptions = {
  headers: masterKeyHeaders,
  json: true,
};

describe_only_db('mongo')('Parse.Query hint', () => {
  beforeEach(() => {
    config = Config.get('test');
  });

  afterEach(async () => {
    await TestUtils.destroyAllDataPermanently(false);
  });

  it('query find with hint string', async () => {
    const object = new TestObject();
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let explain = await collection._rawFind({ _id: object.id }, { explain: true });
    expect(explain.queryPlanner.winningPlan.stage).toBe('IDHACK');
    explain = await collection._rawFind({ _id: object.id }, { hint: '_id_', explain: true });
    expect(explain.queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(explain.queryPlanner.winningPlan.inputStage.indexName).toBe('_id_');
  });

  it('query find with hint object', async () => {
    const object = new TestObject();
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let explain = await collection._rawFind({ _id: object.id }, { explain: true });
    expect(explain.queryPlanner.winningPlan.stage).toBe('IDHACK');
    explain = await collection._rawFind({ _id: object.id }, { hint: { _id: 1 }, explain: true });
    expect(explain.queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(explain.queryPlanner.winningPlan.inputStage.keyPattern).toEqual({
      _id: 1,
    });
  });

  it_only_mongodb_version('<4.4')('query aggregate with hint string', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('COLLSCAN');

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: '_id_',
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.indexName).toBe('_id_');
  });

  it_only_mongodb_version('>=4.4')('query aggregate with hint string', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('COLLSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage).toBeUndefined();

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: '_id_',
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.inputStage.stage).toBe('IXSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage.indexName).toBe('_id_');
  });

  it_only_mongodb_version('<4.4')('query aggregate with hint object', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('COLLSCAN');

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: { _id: 1 },
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.keyPattern).toEqual({ _id: 1 });
  });

  it_only_mongodb_version('>=4.4')('query aggregate with hint object', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();

    const collection = await config.database.adapter._adaptiveCollection('TestObject');
    let result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      explain: true,
    });
    let { queryPlanner } = result[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('COLLSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage).toBeUndefined();

    result = await collection.aggregate([{ $group: { _id: '$foo' } }], {
      hint: { _id: 1 },
      explain: true,
    });
    queryPlanner = result[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.inputStage.stage).toBe('IXSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage.indexName).toBe('_id_');
    expect(queryPlanner.winningPlan.inputStage.inputStage.keyPattern).toEqual({ _id: 1 });
  });

  it('query find with hint (rest)', async () => {
    const object = new TestObject();
    await object.save();
    let options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        explain: true,
      },
    });
    let response = await request(options);
    let explain = response.data.results;
    expect(explain[0].queryPlanner.winningPlan.inputStage.stage).toBe('COLLSCAN');

    options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        explain: true,
        hint: '_id_',
      },
    });
    response = await request(options);
    explain = response.data.results;
    expect(explain[0].queryPlanner.winningPlan.inputStage.inputStage.indexName).toBe('_id_');
  });

  it_only_mongodb_version('<4.4')('query aggregate with hint (rest)', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();
    let options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/aggregate/TestObject',
      qs: {
        explain: true,
        group: JSON.stringify({ objectId: '$foo' }),
      },
    });
    let response = await request(options);
    let { queryPlanner } = response.data.results[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('COLLSCAN');

    options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/aggregate/TestObject',
      qs: {
        explain: true,
        hint: '_id_',
        group: JSON.stringify({ objectId: '$foo' }),
      },
    });
    response = await request(options);
    queryPlanner = response.data.results[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.inputStage.keyPattern).toEqual({ _id: 1 });
  });

  it_only_mongodb_version('>=4.4')('query aggregate with hint (rest)', async () => {
    const object = new TestObject({ foo: 'bar' });
    await object.save();
    let options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/aggregate/TestObject',
      qs: {
        explain: true,
        group: JSON.stringify({ objectId: '$foo' }),
      },
    });
    let response = await request(options);
    let { queryPlanner } = response.data.results[0].stages[0].$cursor;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('COLLSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage).toBeUndefined();

    options = Object.assign({}, masterKeyOptions, {
      url: Parse.serverURL + '/aggregate/TestObject',
      qs: {
        explain: true,
        hint: '_id_',
        group: JSON.stringify({ objectId: '$foo' }),
      },
    });
    response = await request(options);
    queryPlanner = response.data.results[0].stages[0].$cursor.queryPlanner;
    expect(queryPlanner.winningPlan.stage).toBe('PROJECTION_SIMPLE');
    expect(queryPlanner.winningPlan.inputStage.stage).toBe('FETCH');
    expect(queryPlanner.winningPlan.inputStage.inputStage.stage).toBe('IXSCAN');
    expect(queryPlanner.winningPlan.inputStage.inputStage.indexName).toBe('_id_');
    expect(queryPlanner.winningPlan.inputStage.inputStage.keyPattern).toEqual({ _id: 1 });
  });
});
