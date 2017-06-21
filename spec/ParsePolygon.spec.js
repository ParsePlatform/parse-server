const TestObject = Parse.Object.extend('TestObject');
const MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const rp = require('request-promise');
const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest'
}

describe('Parse.Polygon testing', () => {
  it('polygon save open path', (done) => {
    const coords = [[0,0],[0,1],[1,0],[1,1]];
    const closed = [[0,0],[0,1],[1,0],[1,1],[0,0]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const polygon = result.get('polygon');
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, closed);
      done();
    }, done.fail);
  });

  it('polygon save closed path', (done) => {
    const coords = [[0,0],[0,1],[1,0],[1,1],[0,0]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const polygon = result.get('polygon');
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, coords);
      done();
    }, done.fail);
  });

  it('polygon equalTo', (done) => {
    const coords = [[0,0],[0,1],[1,0],[1,1]];
    const polygon = {__type: 'Polygon', coordinates: coords};
    const obj = new TestObject();
    obj.set('polygon', polygon);
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      query.equalTo('polygon', polygon);
      return query.find();
    }).then((results) => {
      const polygon = results[0].get('polygon');
      coords.push(coords[0]);
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, coords);
      done();
    }, done.fail);
  });

  it('polygon update', (done) => {
    const oldCoords = [[0,0],[0,1],[1,0],[1,1]];
    const oldPolygon = {__type: 'Polygon', coordinates: oldCoords};
    const newCoords = [[2,2],[2,3],[3,3],[3,2]];
    const newPolygon = {__type: 'Polygon', coordinates: newCoords};
    const obj = new TestObject();
    obj.set('polygon', oldPolygon);
    return obj.save().then(() => {
      obj.set('polygon', newPolygon);
      return obj.save();
    }).then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const polygon = result.get('polygon');
      newCoords.push(newCoords[0]);
      equal(polygon.__type, 'Polygon');
      equal(polygon.coordinates, newCoords);
      done();
    }, done.fail);
  });

  it('polygon invalid value', (done) => {
    const coords = [['foo','bar'],[0,1],[1,0],[1,1],[0,0]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    return obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then(done.fail, done);
  });

  it('polygonContain query', (done) => {
    const points1 = [[0,0],[0,1],[1,1],[1,0]];
    const points2 = [[0,0],[0,2],[2,2],[2,0]];
    const points3 = [[10,10],[10,15],[15,15],[15,10],[10,10]];
    const polygon1 = {__type: 'Polygon', coordinates: points1};
    const polygon2 = {__type: 'Polygon', coordinates: points2};
    const polygon3 = {__type: 'Polygon', coordinates: points3};
    const obj1 = new TestObject({location: polygon1});
    const obj2 = new TestObject({location: polygon2});
    const obj3 = new TestObject({location: polygon3});
    Parse.Object.saveAll([obj1, obj2, obj3]).then(() => {
      const where = {
        location: {
          $geoIntersects: {
            $point: { __type: 'GeoPoint', latitude: 0.5, longitude: 0.5 }
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(2);
      done();
    }, done.fail);
  });

  it('polygonContain invalid input', (done) => {
    const points = [[0,0],[0,1],[1,1],[1,0]];
    const polygon = {__type: 'Polygon', coordinates: points};
    const obj = new TestObject({location: polygon});
    obj.save().then(() => {
      const where = {
        location: {
          $geoIntersects: {
            $point: { __type: 'GeoPoint', latitude: 181, longitude: 181 }
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then(done.fail, done);
  });

  it('polygonContain invalid geoPoint', (done) => {
    const points = [[0,0],[0,1],[1,1],[1,0]];
    const polygon = {__type: 'Polygon', coordinates: points};
    const obj = new TestObject({location: polygon});
    obj.save().then(() => {
      const where = {
        location: {
          $geoIntersects: {
            $point: []
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then(done.fail, done);
  });
});

const buildIndexes = () => {
  const databaseAdapter = new MongoStorageAdapter({ uri: mongoURI });
  return reconfigureServer({
    appId: 'test',
    restAPIKey: 'rest',
    publicServerURL: 'http://localhost:8378/1',
    databaseAdapter
  }).then(() => {
    return databaseAdapter.createIndex('TestObject', {location: '2d'});
  }).then(() => {
    return databaseAdapter.createIndex('TestObject', {polygon: '2dsphere'});
  });
};

describe_only_db('mongo')('Parse.Polygon testing', () => {
  it('support 2d and 2dsphere', (done) => {
    const coords = [[0,0],[0,1],[1,1],[1,0],[0,0]];
    const polygon = {__type: 'Polygon', coordinates: coords};
    const location = {__type: 'GeoPoint', latitude:10, longitude:10};
    buildIndexes().then(() => {
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: {
          '_method': 'POST',
          location,
          polygon
        },
        headers: defaultHeaders
      });
    }).then((resp) => {
      return rp.post({
        url: `http://localhost:8378/1/classes/TestObject/${resp.objectId}`,
        json: {'_method': 'GET'},
        headers: defaultHeaders
      });
    }).then((resp) => {
      equal(resp.location, location);
      equal(resp.polygon, polygon);
      done();
    }, done.fail);
  });

  it('polygon three points minimum', (done) => {
    const coords = [[0,0]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    buildIndexes().then(() => {
      return obj.save();
    }).then(done.fail, done);
  });

  it('polygon three different points minimum', (done) => {
    const coords = [[0,0],[0,1]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    buildIndexes().then(() => {
      return obj.save();
    }).then(done.fail, done);
  });

  it('polygonContain query with indexes', (done) => {
    const points1 = [[0,0],[0,1],[1,1],[1,0]];
    const points2 = [[0,0],[0,2],[2,2],[2,0]];
    const points3 = [[10,10],[10,15],[15,15],[15,10],[10,10]];
    const polygon1 = {__type: 'Polygon', coordinates: points1};
    const polygon2 = {__type: 'Polygon', coordinates: points2};
    const polygon3 = {__type: 'Polygon', coordinates: points3};
    const obj1 = new TestObject({polygon: polygon1});
    const obj2 = new TestObject({polygon: polygon2});
    const obj3 = new TestObject({polygon: polygon3});
    buildIndexes().then(() => {
      return Parse.Object.saveAll([obj1, obj2, obj3]);
    }).then(() => {
      const where = {
        polygon: {
          $geoIntersects: {
            $point: { __type: 'GeoPoint', latitude: 0.5, longitude: 0.5 }
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/TestObject',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      expect(resp.results.length).toBe(2);
      done();
    }, done.fail);
  });
});

describe_only_db('postgres')('[postgres] Parse.Polygon testing', () => {
  it('polygon three different points minimum', (done) => {
    const coords = [[0,0],[0,1]];
    const obj = new TestObject();
    obj.set('polygon', {__type: 'Polygon', coordinates: coords});
    obj.save().then(done.fail, done);
  });
});
