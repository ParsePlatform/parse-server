// This is a port of the test suite:
// hungry/js/test/parse_geo_point_test.js

const rp = require('request-promise');
const Config = require('../src/Config');

const TestObject = Parse.Object.extend('TestObject');
const MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');
const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const defaultHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'rest'
}

describe('Parse.GeoPoint testing', () => {
  it('geo point roundtrip', (done) => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('location', point);
    obj.set('name', 'Ferndale');
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var pointAgain = results[0].get('location');
            ok(pointAgain);
            equal(pointAgain.latitude, 44.0);
            equal(pointAgain.longitude, -11.0);
            done();
          }
        });
      }
    });
  });

  it('update geopoint', (done) => {
    const oldPoint = new Parse.GeoPoint(44.0, -11.0);
    const newPoint = new Parse.GeoPoint(24.0, 19.0);
    const obj = new TestObject();
    obj.set('location', oldPoint);
    obj.save().then(() => {
      obj.set('location', newPoint);
      return obj.save();
    }).then(() => {
      var query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const point = result.get('location');
      equal(point.latitude, newPoint.latitude);
      equal(point.longitude, newPoint.longitude);
      done();
    });
  });

  it('has the correct __type field in the json response', done => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('location', point);
    obj.set('name', 'Zhoul')
    obj.save(null, {
      success: (obj) => {
        Parse.Cloud.httpRequest({
          url: 'http://localhost:8378/1/classes/TestObject/' + obj.id,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test'
          }
        }).then(response => {
          equal(response.data.location.__type, 'GeoPoint');
          done();
        })
      }
    })
  });


  it('geo point supports more than one field', (done) => {
    const point1 = new Parse.GeoPoint(44, -11);
    const point2 = new Parse.GeoPoint(24, 19);
    const obj = new TestObject();
    obj.set('location1', point1);
    obj.set('location2', point2);
    obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      return query.get(obj.id);
    }).then((result) => {
      const location1 = result.get('location1');
      const location2 = result.get('location2');
      equal(location1.latitude, point1.latitude);
      equal(location1.longitude, point1.longitude);
      equal(location2.latitude, point2.latitude);
      equal(location2.longitude, point2.longitude);
      done();
    }, done.fail);
  });

  it('geo line', (done) => {
    var line = [];
    for (var i = 0; i < 10; ++i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(i * 4.0 - 12.0, i * 3.2 - 11.0);
      obj.set('location', point);
      obj.set('construct', 'line');
      obj.set('seq', i);
      line.push(obj);
    }
    Parse.Object.saveAll(line, {
      success: function() {
        var query = new Parse.Query(TestObject);
        var point = new Parse.GeoPoint(24, 19);
        query.equalTo('construct', 'line');
        query.withinMiles('location', point, 10000);
        query.find({
          success: function(results) {
            equal(results.length, 10);
            equal(results[0].get('seq'), 9);
            equal(results[3].get('seq'), 6);
            done();
          }
        });
      }
    });
  });

  it('geo max distance large', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects).then(() => {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14);
      return query.find();
    }).then((results) => {
      equal(results.length, 3);
      done();
    }, (err) => {
      fail("Couldn't query GeoPoint");
      jfail(err)
    });
  });

  it('geo max distance medium', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14 * 0.5);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('index'), 0);
          equal(results[1].get('index'), 1);
          done();
        }
      });
    });
  });

  it('geo max distance small', (done) => {
    var objects = [];
    [0, 1, 2].map(function(i) {
      var obj = new TestObject();
      var point = new Parse.GeoPoint(0.0, i * 45.0);
      obj.set('location', point);
      obj.set('index', i);
      objects.push(obj);
    });
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(TestObject);
      var point = new Parse.GeoPoint(1.0, -1.0);
      query.withinRadians('location', point, 3.14 * 0.25);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('index'), 0);
          done();
        }
      });
    });
  });

  var makeSomeGeoPoints = function(callback) {
    var sacramento = new TestObject();
    sacramento.set('location', new Parse.GeoPoint(38.52, -121.50));
    sacramento.set('name', 'Sacramento');

    var honolulu = new TestObject();
    honolulu.set('location', new Parse.GeoPoint(21.35, -157.93));
    honolulu.set('name', 'Honolulu');

    var sf = new TestObject();
    sf.set('location', new Parse.GeoPoint(37.75, -122.68));
    sf.set('name', 'San Francisco');

    Parse.Object.saveAll([sacramento, sf, honolulu], callback);
  };

  it('geo max distance in km everywhere', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      // Honolulu is 4300 km away from SFO on a sphere ;)
      query.withinKilometers('location', sfo, 4800.0);
      query.find({
        success: function(results) {
          equal(results.length, 3);
          done();
        }
      });
    });
  });

  it('geo max distance in km california', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 3700.0);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('name'), 'San Francisco');
          equal(results[1].get('name'), 'Sacramento');
          done();
        }
      });
    });
  });

  it('geo max distance in km bay area', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 100.0);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'San Francisco');
          done();
        }
      });
    });
  });

  it('geo max distance in km mid peninsula', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinKilometers('location', sfo, 10.0);
      query.find({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      });
    });
  });

  it('geo max distance in miles everywhere', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 2600.0);
      query.find({
        success: function(results) {
          equal(results.length, 3);
          done();
        }
      });
    });
  });

  it('geo max distance in miles california', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 2200.0);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          equal(results[0].get('name'), 'San Francisco');
          equal(results[1].get('name'), 'Sacramento');
          done();
        }
      });
    });
  });

  it('geo max distance in miles bay area', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      // 100km is 62 miles...
      query.withinMiles('location', sfo, 62.0);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'San Francisco');
          done();
        }
      });
    });
  });

  it('geo max distance in miles mid peninsula', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.withinMiles('location', sfo, 10.0);
      query.find({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      });
    });
  });

  it('returns nearest location', (done) => {
    makeSomeGeoPoints(function() {
      var sfo = new Parse.GeoPoint(37.6189722, -122.3748889);
      var query = new Parse.Query(TestObject);
      query.near('location', sfo);
      query.find({
        success: function(results) {
          equal(results[0].get('name'), 'San Francisco');
          equal(results[1].get('name'), 'Sacramento');
          done();
        }
      });
    });
  });

  it('works with geobox queries', (done) => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('TestObject', {location: inbound});
    const obj2 = new Parse.Object('TestObject', {location: onbound});
    const obj3 = new Parse.Object('TestObject', {location: outbound});
    Parse.Object.saveAll([obj1, obj2, obj3]).then(() => {
      const sw = new Parse.GeoPoint(0, 0);
      const ne = new Parse.GeoPoint(10, 10);
      const query = new Parse.Query(TestObject);
      query.withinGeoBox('location', sw, ne);
      return query.find();
    }).then((results) => {
      equal(results.length, 2);
      done();
    });
  });

  it('supports a sub-object with a geo point', done => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('subobject', { location: point });
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var pointAgain = results[0].get('subobject')['location'];
            ok(pointAgain);
            equal(pointAgain.latitude, 44.0);
            equal(pointAgain.longitude, -11.0);
            done();
          }
        });
      }
    });
  });

  it('supports array of geo points', done => {
    var point1 = new Parse.GeoPoint(44.0, -11.0);
    var point2 = new Parse.GeoPoint(22.0, -55.0);
    var obj = new TestObject();
    obj.set('locations', [ point1, point2 ]);
    obj.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var locations = results[0].get('locations');
            expect(locations.length).toEqual(2);
            expect(locations[0]).toEqual(point1);
            expect(locations[1]).toEqual(point2);
            done();
          }
        });
      }
    });
  });

  it('equalTo geopoint', (done) => {
    var point = new Parse.GeoPoint(44.0, -11.0);
    var obj = new TestObject();
    obj.set('location', point);
    obj.save().then(() => {
      const query = new Parse.Query(TestObject);
      query.equalTo('location', point);
      return query.find();
    }).then((results) => {
      equal(results.length, 1);
      const loc = results[0].get('location');
      equal(loc.latitude, point.latitude);
      equal(loc.longitude, point.longitude);
      done();
    });
  });

  it('supports withinPolygon open path', (done) => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('Polygon', {location: inbound});
    const obj2 = new Parse.Object('Polygon', {location: onbound});
    const obj3 = new Parse.Object('Polygon', {location: outbound});
    Parse.Object.saveAll([obj1, obj2, obj3]).then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: [
              { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              { __type: 'GeoPoint', latitude: 0, longitude: 10 },
              { __type: 'GeoPoint', latitude: 10, longitude: 10 },
              { __type: 'GeoPoint', latitude: 10, longitude: 0 }
            ]
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
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

  it('supports withinPolygon closed path', (done) => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('Polygon', {location: inbound});
    const obj2 = new Parse.Object('Polygon', {location: onbound});
    const obj3 = new Parse.Object('Polygon', {location: outbound});
    Parse.Object.saveAll([obj1, obj2, obj3]).then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: [
              { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              { __type: 'GeoPoint', latitude: 0, longitude: 10 },
              { __type: 'GeoPoint', latitude: 10, longitude: 10 },
              { __type: 'GeoPoint', latitude: 10, longitude: 0 },
              { __type: 'GeoPoint', latitude: 0, longitude: 0 }
            ]
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
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

  it('invalid input withinPolygon', (done) => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', {location: point});
    obj.save().then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: 1234
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('invalid geoPoint withinPolygon', (done) => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', {location: point});
    obj.save().then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: [
              {}
            ]
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(Parse.Error.INVALID_JSON);
      done();
    });
  });

  it('invalid latitude withinPolygon', (done) => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', {location: point});
    obj.save().then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: [
              { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              { __type: 'GeoPoint', latitude: 181, longitude: 0 },
              { __type: 'GeoPoint', latitude: 0, longitude: 0 }
            ]
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(1);
      done();
    });
  });

  it('invalid longitude withinPolygon', (done) => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', {location: point});
    obj.save().then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: [
              { __type: 'GeoPoint', latitude: 0, longitude: 0 },
              { __type: 'GeoPoint', latitude: 0, longitude: 181 },
              { __type: 'GeoPoint', latitude: 0, longitude: 0 }
            ]
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(1);
      done();
    });
  });

  it('minimum 3 points withinPolygon', (done) => {
    const point = new Parse.GeoPoint(1.5, 1.5);
    const obj = new Parse.Object('Polygon', {location: point});
    obj.save().then(() => {
      const where = {
        location: {
          $geoWithin: {
            $polygon: []
          }
        }
      };
      return rp.post({
        url: Parse.serverURL + '/classes/Polygon',
        json: { where, '_method': 'GET' },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey
        }
      });
    }).then((resp) => {
      fail(`no request should succeed: ${JSON.stringify(resp)}`);
      done();
    }).catch((err) => {
      expect(err.error.code).toEqual(107);
      done();
    });
  });
});

describe_only_db('mongo')('Parse.GeoPoint testing', () => {
  it('converts geoJSON to geoPoint', (done) => {
    const config = new Config('test');
    const database = config.database.adapter.database;
    const geoJSON = {type: 'Point', coordinates:[10, 20]};
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('test_TestObject', {
        point: {type: 'GeoPoint'},
      }))
      .then(actualSchema => {
        equal(actualSchema.fields.point.type, 'GeoPoint');
        database.collection('test_TestObject').insertOne({ point: geoJSON }, {}, (error, records) => {
          const objectId = records.ops[0]._id;
          config.database.adapter.find('TestObject', actualSchema, { objectId }, {}).then((results) => {
            equal(results[0].point.__type, 'GeoPoint');
            done();
          });
        });
      });
  });

  it('support legacy geopoints with 2dsphere', (done) => {
    const location = {__type: 'GeoPoint', latitude:10, longitude:10};
    const databaseAdapter = new MongoStorageAdapter({ uri: mongoURI });
    return reconfigureServer({
      appId: 'test',
      restAPIKey: 'rest',
      publicServerURL: 'http://localhost:8378/1',
      databaseAdapter
    }).then(() => {
      return databaseAdapter.createIndex('TestObject', {location: '2d'});
    }).then(() => {
      return rp.post({
        url: 'http://localhost:8378/1/classes/TestObject',
        json: {
          '_method': 'POST',
          location
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
      return databaseAdapter.getIndexes('TestObject');
    }).then((indexes) => {
      equal(indexes.length, 3);
      equal(indexes[0].key, {_id: 1});
      equal(indexes[1].key, {location: '2d'});
      equal(indexes[2].key, {location: '2dsphere'});
      done();
    }, done.fail);
  });
});

