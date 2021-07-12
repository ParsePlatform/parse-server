// This is a port of the test suite:
// hungry/js/test/parse_query_test.js
//
// Some new tests are added.
'use strict';

const Parse = require('parse/node');
const request = require('../lib/request');

const masterKeyHeaders = {
  'X-Parse-Application-Id': 'test',
  'X-Parse-Rest-API-Key': 'test',
  'X-Parse-Master-Key': 'test',
  'Content-Type': 'application/json',
};

const masterKeyOptions = {
  headers: masterKeyHeaders,
};

const BoxedNumber = Parse.Object.extend({
  className: 'BoxedNumber',
});

describe('Parse.Query testing', () => {
  it('basic query', function (done) {
    const baz = new TestObject({ foo: 'baz' });
    const qux = new TestObject({ foo: 'qux' });
    Parse.Object.saveAll([baz, qux]).then(function () {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'baz');
      query.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('foo'), 'baz');
        done();
      });
    });
  });

  it('searching for null', function (done) {
    const baz = new TestObject({ foo: null });
    const qux = new TestObject({ foo: 'qux' });
    const qux2 = new TestObject({});
    Parse.Object.saveAll([baz, qux, qux2]).then(function () {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', null);
      query.find().then(function (results) {
        equal(results.length, 2);
        qux.set('foo', null);
        qux.save().then(function () {
          query.find().then(function (results) {
            equal(results.length, 3);
            done();
          });
        });
      });
    });
  });

  it('searching for not null', function (done) {
    const baz = new TestObject({ foo: null });
    const qux = new TestObject({ foo: 'qux' });
    const qux2 = new TestObject({});
    Parse.Object.saveAll([baz, qux, qux2]).then(function () {
      const query = new Parse.Query(TestObject);
      query.notEqualTo('foo', null);
      query.find().then(function (results) {
        equal(results.length, 1);
        qux.set('foo', null);
        qux.save().then(function () {
          query.find().then(function (results) {
            equal(results.length, 0);
            done();
          });
        });
      });
    });
  });

  it('notEqualTo with Relation is working', function (done) {
    const user = new Parse.User();
    user.setPassword('asdf');
    user.setUsername('zxcv');

    const user1 = new Parse.User();
    user1.setPassword('asdf');
    user1.setUsername('qwerty');

    const user2 = new Parse.User();
    user2.setPassword('asdf');
    user2.setUsername('asdf');

    const Cake = Parse.Object.extend('Cake');
    const cake1 = new Cake();
    const cake2 = new Cake();
    const cake3 = new Cake();

    user
      .signUp()
      .then(function () {
        return user1.signUp();
      })
      .then(function () {
        return user2.signUp();
      })
      .then(function () {
        const relLike1 = cake1.relation('liker');
        relLike1.add([user, user1]);

        const relDislike1 = cake1.relation('hater');
        relDislike1.add(user2);

        return cake1.save();
      })
      .then(function () {
        const rellike2 = cake2.relation('liker');
        rellike2.add([user, user1]);

        const relDislike2 = cake2.relation('hater');
        relDislike2.add(user2);

        const relSomething = cake2.relation('something');
        relSomething.add(user);

        return cake2.save();
      })
      .then(function () {
        const rellike3 = cake3.relation('liker');
        rellike3.add(user);

        const relDislike3 = cake3.relation('hater');
        relDislike3.add([user1, user2]);
        return cake3.save();
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // User2 likes nothing so we should receive 0
        query.equalTo('liker', user2);
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // User1 likes two of three cakes
        query.equalTo('liker', user1);
        return query.find().then(function (results) {
          // It should return 2 -> cake 1 and cake 2
          equal(results.length, 2);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // We want to know which cake the user1 is not appreciating -> cake3
        query.notEqualTo('liker', user1);
        return query.find().then(function (results) {
          // Should return 1 -> the cake 3
          equal(results.length, 1);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // User2 is a hater of everything so we should receive 0
        query.notEqualTo('hater', user2);
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // Only cake3 is liked by user
        query.notContainedIn('liker', [user1]);
        return query.find().then(function (results) {
          equal(results.length, 1);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // All the users
        query.containedIn('liker', [user, user1, user2]);
        // Exclude user 1
        query.notEqualTo('liker', user1);
        // Only cake3 is liked only by user1
        return query.find().then(function (results) {
          equal(results.length, 1);
          const cake = results[0];
          expect(cake.id).toBe(cake3.id);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        // Exclude user1
        query.notEqualTo('liker', user1);
        // Only cake1
        query.equalTo('objectId', cake1.id);
        // user1 likes cake1 so this should return no results
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        query.notEqualTo('hater', user2);
        query.notEqualTo('liker', user2);
        // user2 doesn't like any cake so this should be 0
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        query.equalTo('hater', user);
        query.equalTo('liker', user);
        // user doesn't hate any cake so this should be 0
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        query.equalTo('hater', null);
        query.equalTo('liker', null);
        // user doesn't hate any cake so this should be 0
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        const query = new Parse.Query(Cake);
        query.equalTo('something', null);
        // user doesn't hate any cake so this should be 0
        return query.find().then(function (results) {
          equal(results.length, 0);
        });
      })
      .then(function () {
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('query notContainedIn on empty array', async () => {
    const object = new TestObject();
    object.set('value', 100);
    await object.save();

    const query = new Parse.Query(TestObject);
    query.notContainedIn('value', []);

    const results = await query.find();
    equal(results.length, 1);
  });

  it('query containedIn on empty array', async () => {
    const object = new TestObject();
    object.set('value', 100);
    await object.save();

    const query = new Parse.Query(TestObject);
    query.containedIn('value', []);

    const results = await query.find();
    equal(results.length, 0);
  });

  it('query with limit', function (done) {
    const baz = new TestObject({ foo: 'baz' });
    const qux = new TestObject({ foo: 'qux' });
    Parse.Object.saveAll([baz, qux]).then(function () {
      const query = new Parse.Query(TestObject);
      query.limit(1);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('query with limit equal to maxlimit', async () => {
    const baz = new TestObject({ foo: 'baz' });
    const qux = new TestObject({ foo: 'qux' });
    await reconfigureServer({ maxLimit: 1 });
    await Parse.Object.saveAll([baz, qux]);
    const query = new Parse.Query(TestObject);
    query.limit(1);
    const results = await query.find();
    equal(results.length, 1);
  });

  it('query with limit exceeding maxlimit', async () => {
    const baz = new TestObject({ foo: 'baz' });
    const qux = new TestObject({ foo: 'qux' });
    await reconfigureServer({ maxLimit: 1 });
    await Parse.Object.saveAll([baz, qux]);
    const query = new Parse.Query(TestObject);
    query.limit(2);
    const results = await query.find();
    equal(results.length, 1);
  });

  it('containedIn object array queries', function (done) {
    const messageList = [];
    for (let i = 0; i < 4; ++i) {
      const message = new TestObject({});
      if (i > 0) {
        message.set('prior', messageList[i - 1]);
      }
      messageList.push(message);
    }

    Parse.Object.saveAll(messageList).then(
      function () {
        equal(messageList.length, 4);

        const inList = [];
        inList.push(messageList[0]);
        inList.push(messageList[2]);

        const query = new Parse.Query(TestObject);
        query.containedIn('prior', inList);
        query.find().then(
          function (results) {
            equal(results.length, 2);
            done();
          },
          function (e) {
            jfail(e);
            done();
          }
        );
      },
      e => {
        jfail(e);
        done();
      }
    );
  });

  it('containedIn null array', done => {
    const emails = ['contact@xyz.com', 'contact@zyx.com', null];
    const user = new Parse.User();
    user.setUsername(emails[0]);
    user.setPassword('asdf');
    user
      .signUp()
      .then(() => {
        const query = new Parse.Query(Parse.User);
        query.containedIn('username', emails);
        return query.find({ useMasterKey: true });
      })
      .then(results => {
        equal(results.length, 1);
        done();
      }, done.fail);
  });

  it('nested equalTo string with single quote', async () => {
    const obj = new TestObject({ nested: { foo: "single'quote" } });
    await obj.save();
    const query = new Parse.Query(TestObject);
    query.equalTo('nested.foo', "single'quote");
    const result = await query.get(obj.id);
    equal(result.get('nested').foo, "single'quote");
  });

  it('nested containedIn string with single quote', async () => {
    const obj = new TestObject({ nested: { foo: ["single'quote"] } });
    await obj.save();
    const query = new Parse.Query(TestObject);
    query.containedIn('nested.foo', ["single'quote"]);
    const result = await query.get(obj.id);
    equal(result.get('nested').foo[0], "single'quote");
  });

  it('nested containedIn string', done => {
    const sender1 = { group: ['A', 'B'] };
    const sender2 = { group: ['A', 'C'] };
    const sender3 = { group: ['B', 'C'] };
    const obj1 = new TestObject({ sender: sender1 });
    const obj2 = new TestObject({ sender: sender2 });
    const obj3 = new TestObject({ sender: sender3 });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.containedIn('sender.group', ['A']);
        return query.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      }, done.fail);
  });

  it('nested containedIn number', done => {
    const sender1 = { group: [1, 2] };
    const sender2 = { group: [1, 3] };
    const sender3 = { group: [2, 3] };
    const obj1 = new TestObject({ sender: sender1 });
    const obj2 = new TestObject({ sender: sender2 });
    const obj3 = new TestObject({ sender: sender3 });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.containedIn('sender.group', [1]);
        return query.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      }, done.fail);
  });

  it('containsAll number array queries', function (done) {
    const NumberSet = Parse.Object.extend({ className: 'NumberSet' });

    const objectsList = [];
    objectsList.push(new NumberSet({ numbers: [1, 2, 3, 4, 5] }));
    objectsList.push(new NumberSet({ numbers: [1, 3, 4, 5] }));

    Parse.Object.saveAll(objectsList)
      .then(function () {
        const query = new Parse.Query(NumberSet);
        query.containsAll('numbers', [1, 2, 3]);
        query.find().then(
          function (results) {
            equal(results.length, 1);
            done();
          },
          function (err) {
            jfail(err);
            done();
          }
        );
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('containsAll string array queries', function (done) {
    const StringSet = Parse.Object.extend({ className: 'StringSet' });

    const objectsList = [];
    objectsList.push(new StringSet({ strings: ['a', 'b', 'c', 'd', 'e'] }));
    objectsList.push(new StringSet({ strings: ['a', 'c', 'd', 'e'] }));

    Parse.Object.saveAll(objectsList)
      .then(function () {
        const query = new Parse.Query(StringSet);
        query.containsAll('strings', ['a', 'b', 'c']);
        query.find().then(function (results) {
          equal(results.length, 1);
          done();
        });
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('containsAll date array queries', function (done) {
    const DateSet = Parse.Object.extend({ className: 'DateSet' });

    function parseDate(iso8601) {
      const regexp = new RegExp(
        '^([0-9]{1,4})-([0-9]{1,2})-([0-9]{1,2})' +
          'T' +
          '([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})' +
          '(.([0-9]+))?' +
          'Z$'
      );
      const match = regexp.exec(iso8601);
      if (!match) {
        return null;
      }

      const year = match[1] || 0;
      const month = (match[2] || 1) - 1;
      const day = match[3] || 0;
      const hour = match[4] || 0;
      const minute = match[5] || 0;
      const second = match[6] || 0;
      const milli = match[8] || 0;

      return new Date(Date.UTC(year, month, day, hour, minute, second, milli));
    }

    const makeDates = function (stringArray) {
      return stringArray.map(function (dateStr) {
        return parseDate(dateStr + 'T00:00:00Z');
      });
    };

    const objectsList = [];
    objectsList.push(
      new DateSet({
        dates: makeDates(['2013-02-01', '2013-02-02', '2013-02-03', '2013-02-04']),
      })
    );
    objectsList.push(
      new DateSet({
        dates: makeDates(['2013-02-01', '2013-02-03', '2013-02-04']),
      })
    );

    Parse.Object.saveAll(objectsList).then(function () {
      const query = new Parse.Query(DateSet);
      query.containsAll('dates', makeDates(['2013-02-01', '2013-02-02', '2013-02-03']));
      query.find().then(
        function (results) {
          equal(results.length, 1);
          done();
        },
        function (e) {
          jfail(e);
          done();
        }
      );
    });
  });

  it('containsAll object array queries', function (done) {
    const MessageSet = Parse.Object.extend({ className: 'MessageSet' });

    const messageList = [];
    for (let i = 0; i < 4; ++i) {
      messageList.push(new TestObject({ i: i }));
    }

    Parse.Object.saveAll(messageList).then(function () {
      equal(messageList.length, 4);

      const messageSetList = [];
      messageSetList.push(new MessageSet({ messages: messageList }));

      const someList = [];
      someList.push(messageList[0]);
      someList.push(messageList[1]);
      someList.push(messageList[3]);
      messageSetList.push(new MessageSet({ messages: someList }));

      Parse.Object.saveAll(messageSetList).then(function () {
        const inList = [];
        inList.push(messageList[0]);
        inList.push(messageList[2]);

        const query = new Parse.Query(MessageSet);
        query.containsAll('messages', inList);
        query.find().then(function (results) {
          equal(results.length, 1);
          done();
        });
      });
    });
  });

  it('containsAllStartingWith should match all strings that starts with string', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);
    const object2 = new Parse.Object('Object');
    object2.set('strings', ['the', 'brown', 'fox', 'jumps']);
    const object3 = new Parse.Object('Object');
    object3.set('strings', ['over', 'the', 'lazy', 'dog']);

    const objectList = [object, object2, object3];

    Parse.Object.saveAll(objectList).then(results => {
      equal(objectList.length, results.length);

      return request({
        url: Parse.serverURL + '/classes/Object',
        qs: {
          where: JSON.stringify({
            strings: {
              $all: [{ $regex: '^\\Qthe\\E' }, { $regex: '^\\Qfox\\E' }, { $regex: '^\\Qlazy\\E' }],
            },
          }),
        },
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Javascript-Key': Parse.javaScriptKey,
          'Content-Type': 'application/json',
        },
      })
        .then(function (response) {
          const results = response.data;
          equal(results.results.length, 1);
          arrayContains(results.results, object);

          return request({
            url: Parse.serverURL + '/classes/Object',
            qs: {
              where: JSON.stringify({
                strings: {
                  $all: [{ $regex: '^\\Qthe\\E' }, { $regex: '^\\Qlazy\\E' }],
                },
              }),
            },
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-Javascript-Key': Parse.javaScriptKey,
              'Content-Type': 'application/json',
            },
          });
        })
        .then(function (response) {
          const results = response.data;
          equal(results.results.length, 2);
          arrayContains(results.results, object);
          arrayContains(results.results, object3);

          return request({
            url: Parse.serverURL + '/classes/Object',
            qs: {
              where: JSON.stringify({
                strings: {
                  $all: [{ $regex: '^\\Qhe\\E' }, { $regex: '^\\Qlazy\\E' }],
                },
              }),
            },
            headers: {
              'X-Parse-Application-Id': Parse.applicationId,
              'X-Parse-Javascript-Key': Parse.javaScriptKey,
              'Content-Type': 'application/json',
            },
          });
        })
        .then(function (response) {
          const results = response.data;
          equal(results.results.length, 0);

          done();
        });
    });
  });

  it('containsAllStartingWith values must be all of type starting with regex', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);

    object
      .save()
      .then(() => {
        equal(object.isNew(), false);

        return request({
          url: Parse.serverURL + '/classes/Object',
          qs: {
            where: JSON.stringify({
              strings: {
                $all: [
                  { $regex: '^\\Qthe\\E' },
                  { $regex: '^\\Qlazy\\E' },
                  { $regex: '^\\Qfox\\E' },
                  { $unknown: /unknown/ },
                ],
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(done.fail, function () {
        done();
      });
  });

  it('containsAllStartingWith empty array values should return empty results', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);

    object
      .save()
      .then(() => {
        equal(object.isNew(), false);

        return request({
          url: Parse.serverURL + '/classes/Object',
          qs: {
            where: JSON.stringify({
              strings: {
                $all: [],
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        function (response) {
          const results = response.data;
          equal(results.results.length, 0);
          done();
        },
        function () {}
      );
  });

  it('containsAllStartingWith single empty value returns empty results', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);

    object
      .save()
      .then(() => {
        equal(object.isNew(), false);

        return request({
          url: Parse.serverURL + '/classes/Object',
          qs: {
            where: JSON.stringify({
              strings: {
                $all: [{}],
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        function (response) {
          const results = response.data;
          equal(results.results.length, 0);
          done();
        },
        function () {}
      );
  });

  it('containsAllStartingWith single regex value should return corresponding matching results', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);
    const object2 = new Parse.Object('Object');
    object2.set('strings', ['the', 'brown', 'fox', 'jumps']);
    const object3 = new Parse.Object('Object');
    object3.set('strings', ['over', 'the', 'lazy', 'dog']);

    const objectList = [object, object2, object3];

    Parse.Object.saveAll(objectList)
      .then(results => {
        equal(objectList.length, results.length);

        return request({
          url: Parse.serverURL + '/classes/Object',
          qs: {
            where: JSON.stringify({
              strings: {
                $all: [{ $regex: '^\\Qlazy\\E' }],
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        function (response) {
          const results = response.data;
          equal(results.results.length, 2);
          done();
        },
        function () {}
      );
  });

  it('containsAllStartingWith single invalid regex returns empty results', done => {
    const object = new Parse.Object('Object');
    object.set('strings', ['the', 'brown', 'lazy', 'fox', 'jumps']);

    object
      .save()
      .then(() => {
        equal(object.isNew(), false);

        return request({
          url: Parse.serverURL + '/classes/Object',
          qs: {
            where: JSON.stringify({
              strings: {
                $all: [{ $unknown: '^\\Qlazy\\E' }],
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
          },
        });
      })
      .then(
        function (response) {
          const results = response.data;
          equal(results.results.length, 0);
          done();
        },
        function () {}
      );
  });

  it('containedBy pointer array', done => {
    const objects = Array.from(Array(10).keys()).map(idx => {
      const obj = new Parse.Object('Object');
      obj.set('key', idx);
      return obj;
    });

    const parent = new Parse.Object('Parent');
    const parent2 = new Parse.Object('Parent');
    const parent3 = new Parse.Object('Parent');

    Parse.Object.saveAll(objects)
      .then(() => {
        // [0, 1, 2]
        parent.set('objects', objects.slice(0, 3));

        const shift = objects.shift();
        // [2, 0]
        parent2.set('objects', [objects[1], shift]);

        // [1, 2, 3, 4]
        parent3.set('objects', objects.slice(1, 4));

        return Parse.Object.saveAll([parent, parent2, parent3]);
      })
      .then(() => {
        // [1, 2, 3, 4, 5, 6, 7, 8, 9]
        const pointers = objects.map(object => object.toPointer());

        // Return all Parent where all parent.objects are contained in objects
        return request({
          url: Parse.serverURL + '/classes/Parent',
          qs: {
            where: JSON.stringify({
              objects: {
                $containedBy: pointers,
              },
            }),
          },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(response => {
        const results = response.data;
        expect(results.results[0].objectId).not.toBeUndefined();
        expect(results.results[0].objectId).toBe(parent3.id);
        expect(results.results.length).toBe(1);
        done();
      });
  });

  it('containedBy number array', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({
          numbers: { $containedBy: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
        }),
      },
    });
    const obj1 = new TestObject({ numbers: [0, 1, 2] });
    const obj2 = new TestObject({ numbers: [2, 0] });
    const obj3 = new TestObject({ numbers: [1, 2, 3, 4] });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(response => {
        const results = response.data;
        expect(results.results[0].objectId).not.toBeUndefined();
        expect(results.results[0].objectId).toBe(obj3.id);
        expect(results.results.length).toBe(1);
        done();
      });
  });

  it('containedBy empty array', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ numbers: { $containedBy: [] } }),
      },
    });
    const obj1 = new TestObject({ numbers: [0, 1, 2] });
    const obj2 = new TestObject({ numbers: [2, 0] });
    const obj3 = new TestObject({ numbers: [1, 2, 3, 4] });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(response => {
        const results = response.data;
        expect(results.results.length).toBe(0);
        done();
      });
  });

  it('containedBy invalid query', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ objects: { $containedBy: 1234 } }),
      },
    });
    const obj = new TestObject();
    obj
      .save()
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(done.fail)
      .catch(response => {
        equal(response.data.code, Parse.Error.INVALID_JSON);
        equal(response.data.error, 'bad $containedBy: should be an array');
        done();
      });
  });

  it('equalTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.equalTo('number', 3);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('equalTo undefined', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.equalTo('number', undefined);
      query.find().then(function (results) {
        equal(results.length, 0);
        done();
      });
    });
  });

  it('lessThan queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.lessThan('number', 7);
      query.find().then(function (results) {
        equal(results.length, 7);
        done();
      });
    });
  });

  it('lessThanOrEqualTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.lessThanOrEqualTo('number', 7);
      query.find().then(function (results) {
        equal(results.length, 8);
        done();
      });
    });
  });

  it('lessThan zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.lessThan('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 3);
        done();
      });
  });

  it('lessThanOrEqualTo zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.lessThanOrEqualTo('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 4);
        done();
      });
  });

  it('greaterThan queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.greaterThan('number', 7);
      query.find().then(function (results) {
        equal(results.length, 2);
        done();
      });
    });
  });

  it('greaterThanOrEqualTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.greaterThanOrEqualTo('number', 7);
      query.find().then(function (results) {
        equal(results.length, 3);
        done();
      });
    });
  });

  it('greaterThan zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.greaterThan('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 1);
        done();
      });
  });

  it('greaterThanOrEqualTo zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.greaterThanOrEqualTo('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      });
  });

  it('lessThanOrEqualTo greaterThanOrEqualTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.lessThanOrEqualTo('number', 7);
      query.greaterThanOrEqualTo('number', 7);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('lessThan greaterThan queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.lessThan('number', 9);
      query.greaterThan('number', 3);
      query.find().then(function (results) {
        equal(results.length, 5);
        done();
      });
    });
  });

  it('notEqualTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.notEqualTo('number', 5);
      query.find().then(function (results) {
        equal(results.length, 9);
        done();
      });
    });
  });

  it('notEqualTo zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.notEqualTo('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 4);
        done();
      });
  });

  it('equalTo zero queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.equalTo('number', 0);
        return query.find();
      })
      .then(results => {
        equal(results.length, 1);
        done();
      });
  });

  it('number equalTo boolean queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.equalTo('number', false);
        return query.find();
      })
      .then(results => {
        equal(results.length, 0);
        done();
      });
  });

  it('equalTo false queries', done => {
    const obj1 = new TestObject({ field: false });
    const obj2 = new TestObject({ field: true });
    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.equalTo('field', false);
        return query.find();
      })
      .then(results => {
        equal(results.length, 1);
        done();
      });
  });

  it('where $eq false queries (rest)', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ field: { $eq: false } }),
      },
    });
    const obj1 = new TestObject({ field: false });
    const obj2 = new TestObject({ field: true });
    Parse.Object.saveAll([obj1, obj2]).then(() => {
      request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options)).then(
        resp => {
          equal(resp.data.results.length, 1);
          done();
        }
      );
    });
  });

  it('where $eq null queries (rest)', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ field: { $eq: null } }),
      },
    });
    const obj1 = new TestObject({ field: false });
    const obj2 = new TestObject({ field: null });
    Parse.Object.saveAll([obj1, obj2]).then(() => {
      return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options)).then(
        resp => {
          equal(resp.data.results.length, 1);
          done();
        }
      );
    });
  });

  it('containedIn queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.containedIn('number', [3, 5, 7, 9, 11]);
      query.find().then(function (results) {
        equal(results.length, 4);
        done();
      });
    });
  });

  it('containedIn false queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.containedIn('number', false);
        return query.find();
      })
      .then(done.fail)
      .catch(error => {
        equal(error.code, Parse.Error.INVALID_JSON);
        equal(error.message, 'bad $in value');
        done();
      });
  });

  it('notContainedIn false queries', done => {
    const makeBoxedNumber = i => {
      return new BoxedNumber({ number: i });
    };
    const numbers = [-3, -2, -1, 0, 1];
    const boxedNumbers = numbers.map(makeBoxedNumber);
    Parse.Object.saveAll(boxedNumbers)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.notContainedIn('number', false);
        return query.find();
      })
      .then(done.fail)
      .catch(error => {
        equal(error.code, Parse.Error.INVALID_JSON);
        equal(error.message, 'bad $nin value');
        done();
      });
  });

  it('notContainedIn queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.notContainedIn('number', [3, 5, 7, 9, 11]);
      query.find().then(function (results) {
        equal(results.length, 6);
        done();
      });
    });
  });

  it('objectId containedIn queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function (list) {
      const query = new Parse.Query(BoxedNumber);
      query.containedIn('objectId', [list[2].id, list[3].id, list[0].id, 'NONSENSE']);
      query.ascending('number');
      query.find().then(function (results) {
        if (results.length != 3) {
          fail('expected 3 results');
        } else {
          equal(results[0].get('number'), 0);
          equal(results[1].get('number'), 2);
          equal(results[2].get('number'), 3);
        }
        done();
      });
    });
  });

  it('objectId equalTo queries', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function (list) {
      const query = new Parse.Query(BoxedNumber);
      query.equalTo('objectId', list[4].id);
      query.find().then(function (results) {
        if (results.length != 1) {
          fail('expected 1 result');
          done();
        } else {
          equal(results[0].get('number'), 4);
        }
        done();
      });
    });
  });

  it('find no elements', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.equalTo('number', 17);
      query.find().then(function (results) {
        equal(results.length, 0);
        done();
      });
    });
  });

  it('find with error', function (done) {
    const query = new Parse.Query(BoxedNumber);
    query.equalTo('$foo', 'bar');
    query
      .find()
      .then(done.fail)
      .catch(error => expect(error.code).toBe(Parse.Error.INVALID_KEY_NAME))
      .then(done);
  });

  it('get', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' })]).then(function (items) {
      ok(items[0]);
      const objectId = items[0].id;
      const query = new Parse.Query(TestObject);
      query.get(objectId).then(function (result) {
        ok(result);
        equal(result.id, objectId);
        equal(result.get('foo'), 'bar');
        ok(result.createdAt instanceof Date);
        ok(result.updatedAt instanceof Date);
        done();
      });
    });
  });

  it('get undefined', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' })]).then(function (items) {
      ok(items[0]);
      const query = new Parse.Query(TestObject);
      query.get(undefined).then(fail, () => done());
    });
  });

  it('get error', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' })]).then(function (items) {
      ok(items[0]);
      const query = new Parse.Query(TestObject);
      query.get('InvalidObjectID').then(
        function () {
          ok(false, 'The get should have failed.');
          done();
        },
        function (error) {
          equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      );
    });
  });

  it('first', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' })]).then(function () {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'bar');
      query.first().then(function (result) {
        equal(result.get('foo'), 'bar');
        done();
      });
    });
  });

  it('first no result', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' })]).then(function () {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'baz');
      query.first().then(function (result) {
        equal(result, undefined);
        done();
      });
    });
  });

  it('first with two results', function (done) {
    Parse.Object.saveAll([new TestObject({ foo: 'bar' }), new TestObject({ foo: 'bar' })]).then(
      function () {
        const query = new Parse.Query(TestObject);
        query.equalTo('foo', 'bar');
        query.first().then(function (result) {
          equal(result.get('foo'), 'bar');
          done();
        });
      }
    );
  });

  it('first with error', function (done) {
    const query = new Parse.Query(BoxedNumber);
    query.equalTo('$foo', 'bar');
    query
      .first()
      .then(done.fail)
      .catch(e => expect(e.code).toBe(Parse.Error.INVALID_KEY_NAME))
      .then(done);
  });

  const Container = Parse.Object.extend({
    className: 'Container',
  });

  it('notEqualTo object', function (done) {
    const item1 = new TestObject();
    const item2 = new TestObject();
    const container1 = new Container({ item: item1 });
    const container2 = new Container({ item: item2 });
    Parse.Object.saveAll([item1, item2, container1, container2]).then(function () {
      const query = new Parse.Query(Container);
      query.notEqualTo('item', item1);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('skip', function (done) {
    Parse.Object.saveAll([new TestObject(), new TestObject()]).then(function () {
      const query = new Parse.Query(TestObject);
      query.skip(1);
      query.find().then(function (results) {
        equal(results.length, 1);
        query.skip(3);
        query.find().then(function (results) {
          equal(results.length, 0);
          done();
        });
      });
    });
  });

  it("skip doesn't affect count", function (done) {
    Parse.Object.saveAll([new TestObject(), new TestObject()]).then(function () {
      const query = new Parse.Query(TestObject);
      query.count().then(function (count) {
        equal(count, 2);
        query.skip(1);
        query.count().then(function (count) {
          equal(count, 2);
          query.skip(3);
          query.count().then(function (count) {
            equal(count, 2);
            done();
          });
        });
      });
    });
  });

  it('count', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.greaterThan('number', 1);
      query.count().then(function (count) {
        equal(count, 8);
        done();
      });
    });
  });

  it('order by ascending number', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.ascending('number');
      query.find().then(function (results) {
        equal(results.length, 3);
        equal(results[0].get('number'), 1);
        equal(results[1].get('number'), 2);
        equal(results[2].get('number'), 3);
        done();
      });
    });
  });

  it('order by descending number', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.descending('number');
      query.find().then(function (results) {
        equal(results.length, 3);
        equal(results[0].get('number'), 3);
        equal(results[1].get('number'), 2);
        equal(results[2].get('number'), 1);
        done();
      });
    });
  });

  it('can order on an object string field', function (done) {
    const testSet = [
      { sortField: { value: 'Z' } },
      { sortField: { value: 'A' } },
      { sortField: { value: 'M' } },
    ];

    const objects = testSet.map(e => new Parse.Object('Test', e));
    Parse.Object.saveAll(objects)
      .then(() => new Parse.Query('Test').addDescending('sortField.value').first())
      .then(result => {
        expect(result.get('sortField').value).toBe('Z');
        return new Parse.Query('Test').addAscending('sortField.value').first();
      })
      .then(result => {
        expect(result.get('sortField').value).toBe('A');
        done();
      })
      .catch(done.fail);
  });

  it('can order on an object string field (level 2)', function (done) {
    const testSet = [
      { sortField: { value: { field: 'Z' } } },
      { sortField: { value: { field: 'A' } } },
      { sortField: { value: { field: 'M' } } },
    ];

    const objects = testSet.map(e => new Parse.Object('Test', e));
    Parse.Object.saveAll(objects)
      .then(() => new Parse.Query('Test').addDescending('sortField.value.field').first())
      .then(result => {
        expect(result.get('sortField').value.field).toBe('Z');
        return new Parse.Query('Test').addAscending('sortField.value.field').first();
      })
      .then(result => {
        expect(result.get('sortField').value.field).toBe('A');
        done();
      })
      .catch(done.fail);
  });

  it('can order on an object number field', function (done) {
    const testSet = [
      { sortField: { value: 10 } },
      { sortField: { value: 1 } },
      { sortField: { value: 5 } },
    ];

    const objects = testSet.map(e => new Parse.Object('Test', e));
    Parse.Object.saveAll(objects)
      .then(() => new Parse.Query('Test').addDescending('sortField.value').first())
      .then(result => {
        expect(result.get('sortField').value).toBe(10);
        return new Parse.Query('Test').addAscending('sortField.value').first();
      })
      .then(result => {
        expect(result.get('sortField').value).toBe(1);
        done();
      })
      .catch(done.fail);
  });

  it('can order on an object number field (level 2)', function (done) {
    const testSet = [
      { sortField: { value: { field: 10 } } },
      { sortField: { value: { field: 1 } } },
      { sortField: { value: { field: 5 } } },
    ];

    const objects = testSet.map(e => new Parse.Object('Test', e));
    Parse.Object.saveAll(objects)
      .then(() => new Parse.Query('Test').addDescending('sortField.value.field').first())
      .then(result => {
        expect(result.get('sortField').value.field).toBe(10);
        return new Parse.Query('Test').addAscending('sortField.value.field').first();
      })
      .then(result => {
        expect(result.get('sortField').value.field).toBe(1);
        done();
      })
      .catch(done.fail);
  });

  it('order by ascending number then descending string', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.ascending('number').addDescending('string');
      query.find().then(function (results) {
        equal(results.length, 4);
        equal(results[0].get('number'), 1);
        equal(results[0].get('string'), 'b');
        equal(results[1].get('number'), 2);
        equal(results[1].get('string'), 'd');
        equal(results[2].get('number'), 3);
        equal(results[2].get('string'), 'c');
        equal(results[3].get('number'), 3);
        equal(results[3].get('string'), 'a');
        done();
      });
    });
  });

  it('order by descending number then ascending string', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };

    const objects = [3, 1, 3, 2].map(makeBoxedNumber);
    Parse.Object.saveAll(objects)
      .then(() => {
        const query = new Parse.Query(BoxedNumber);
        query.descending('number').addAscending('string');
        return query.find();
      })
      .then(
        results => {
          equal(results.length, 4);
          equal(results[0].get('number'), 3);
          equal(results[0].get('string'), 'a');
          equal(results[1].get('number'), 3);
          equal(results[1].get('string'), 'c');
          equal(results[2].get('number'), 2);
          equal(results[2].get('string'), 'd');
          equal(results[3].get('number'), 1);
          equal(results[3].get('string'), 'b');
          done();
        },
        err => {
          jfail(err);
          done();
        }
      );
  });

  it('order by descending number and string', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.descending('number,string');
      query.find().then(function (results) {
        equal(results.length, 4);
        equal(results[0].get('number'), 3);
        equal(results[0].get('string'), 'c');
        equal(results[1].get('number'), 3);
        equal(results[1].get('string'), 'a');
        equal(results[2].get('number'), 2);
        equal(results[2].get('string'), 'd');
        equal(results[3].get('number'), 1);
        equal(results[3].get('string'), 'b');
        done();
      });
    });
  });

  it('order by descending number and string, with space', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber)).then(
      function () {
        const query = new Parse.Query(BoxedNumber);
        query.descending('number, string');
        query.find().then(function (results) {
          equal(results.length, 4);
          equal(results[0].get('number'), 3);
          equal(results[0].get('string'), 'c');
          equal(results[1].get('number'), 3);
          equal(results[1].get('string'), 'a');
          equal(results[2].get('number'), 2);
          equal(results[2].get('string'), 'd');
          equal(results[3].get('number'), 1);
          equal(results[3].get('string'), 'b');
          done();
        });
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('order by descending number and string, with array arg', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.descending(['number', 'string']);
      query.find().then(function (results) {
        equal(results.length, 4);
        equal(results[0].get('number'), 3);
        equal(results[0].get('string'), 'c');
        equal(results[1].get('number'), 3);
        equal(results[1].get('string'), 'a');
        equal(results[2].get('number'), 2);
        equal(results[2].get('string'), 'd');
        equal(results[3].get('number'), 1);
        equal(results[3].get('string'), 'b');
        done();
      });
    });
  });

  it('order by descending number and string, with multiple args', function (done) {
    const strings = ['a', 'b', 'c', 'd'];
    const makeBoxedNumber = function (num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.descending('number', 'string');
      query.find().then(function (results) {
        equal(results.length, 4);
        equal(results[0].get('number'), 3);
        equal(results[0].get('string'), 'c');
        equal(results[1].get('number'), 3);
        equal(results[1].get('string'), 'a');
        equal(results[2].get('number'), 2);
        equal(results[2].get('string'), 'd');
        equal(results[3].get('number'), 1);
        equal(results[3].get('string'), 'b');
        done();
      });
    });
  });

  it("can't order by password", function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber)).then(function () {
      const query = new Parse.Query(BoxedNumber);
      query.ascending('_password');
      query
        .find()
        .then(done.fail)
        .catch(e => expect(e.code).toBe(Parse.Error.INVALID_KEY_NAME))
        .then(done);
    });
  });

  it('order by _created_at', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    const numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0]
      .save()
      .then(() => {
        return numbers[1].save();
      })
      .then(() => {
        return numbers[2].save();
      })
      .then(function () {
        const query = new Parse.Query(BoxedNumber);
        query.ascending('_created_at');
        query.find().then(function (results) {
          equal(results.length, 3);
          equal(results[0].get('number'), 3);
          equal(results[1].get('number'), 1);
          equal(results[2].get('number'), 2);
          done();
        }, done.fail);
      });
  });

  it('order by createdAt', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    const numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0]
      .save()
      .then(() => {
        return numbers[1].save();
      })
      .then(() => {
        return numbers[2].save();
      })
      .then(function () {
        const query = new Parse.Query(BoxedNumber);
        query.descending('createdAt');
        query.find().then(function (results) {
          equal(results.length, 3);
          equal(results[0].get('number'), 2);
          equal(results[1].get('number'), 1);
          equal(results[2].get('number'), 3);
          done();
        });
      });
  });

  it('order by _updated_at', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    const numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0]
      .save()
      .then(() => {
        return numbers[1].save();
      })
      .then(() => {
        return numbers[2].save();
      })
      .then(function () {
        numbers[1].set('number', 4);
        numbers[1].save().then(function () {
          const query = new Parse.Query(BoxedNumber);
          query.ascending('_updated_at');
          query.find().then(function (results) {
            equal(results.length, 3);
            equal(results[0].get('number'), 3);
            equal(results[1].get('number'), 2);
            equal(results[2].get('number'), 4);
            done();
          });
        });
      });
  });

  it('order by updatedAt', function (done) {
    const makeBoxedNumber = function (i) {
      return new BoxedNumber({ number: i });
    };
    const numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0]
      .save()
      .then(() => {
        return numbers[1].save();
      })
      .then(() => {
        return numbers[2].save();
      })
      .then(function () {
        numbers[1].set('number', 4);
        numbers[1].save().then(function () {
          const query = new Parse.Query(BoxedNumber);
          query.descending('_updated_at');
          query.find().then(function (results) {
            equal(results.length, 3);
            equal(results[0].get('number'), 4);
            equal(results[1].get('number'), 2);
            equal(results[2].get('number'), 3);
            done();
          });
        });
      });
  });

  // Returns a promise
  function makeTimeObject(start, i) {
    const time = new Date();
    time.setSeconds(start.getSeconds() + i);
    const item = new TestObject({ name: 'item' + i, time: time });
    return item.save();
  }

  // Returns a promise for all the time objects
  function makeThreeTimeObjects() {
    const start = new Date();
    let one, two, three;
    return makeTimeObject(start, 1)
      .then(o1 => {
        one = o1;
        return makeTimeObject(start, 2);
      })
      .then(o2 => {
        two = o2;
        return makeTimeObject(start, 3);
      })
      .then(o3 => {
        three = o3;
        return [one, two, three];
      });
  }

  it('time equality', function (done) {
    makeThreeTimeObjects().then(function (list) {
      const query = new Parse.Query(TestObject);
      query.equalTo('time', list[1].get('time'));
      query.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('name'), 'item2');
        done();
      });
    });
  });

  it('time lessThan', function (done) {
    makeThreeTimeObjects().then(function (list) {
      const query = new Parse.Query(TestObject);
      query.lessThan('time', list[2].get('time'));
      query.find().then(function (results) {
        equal(results.length, 2);
        done();
      });
    });
  });

  // This test requires Date objects to be consistently stored as a Date.
  it('time createdAt', function (done) {
    makeThreeTimeObjects().then(function (list) {
      const query = new Parse.Query(TestObject);
      query.greaterThanOrEqualTo('createdAt', list[0].createdAt);
      query.find().then(function (results) {
        equal(results.length, 3);
        done();
      });
    });
  });

  it('matches string', function (done) {
    const thing1 = new TestObject();
    thing1.set('myString', 'football');
    const thing2 = new TestObject();
    thing2.set('myString', 'soccer');
    Parse.Object.saveAll([thing1, thing2]).then(function () {
      const query = new Parse.Query(TestObject);
      query.matches('myString', '^fo*\\wb[^o]l+$');
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('matches regex', function (done) {
    const thing1 = new TestObject();
    thing1.set('myString', 'football');
    const thing2 = new TestObject();
    thing2.set('myString', 'soccer');
    Parse.Object.saveAll([thing1, thing2]).then(function () {
      const query = new Parse.Query(TestObject);
      query.matches('myString', /^fo*\wb[^o]l+$/);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('case insensitive regex success', function (done) {
    const thing = new TestObject();
    thing.set('myString', 'football');
    Parse.Object.saveAll([thing]).then(function () {
      const query = new Parse.Query(TestObject);
      query.matches('myString', 'FootBall', 'i');
      query.find().then(done);
    });
  });

  it('regexes with invalid options fail', function (done) {
    const query = new Parse.Query(TestObject);
    query.matches('myString', 'FootBall', 'some invalid option');
    query
      .find()
      .then(done.fail)
      .catch(e => expect(e.code).toBe(Parse.Error.INVALID_QUERY))
      .then(done);
  });

  it('Use a regex that requires all modifiers', function (done) {
    const thing = new TestObject();
    thing.set('myString', 'PArSe\nCom');
    Parse.Object.saveAll([thing]).then(function () {
      const query = new Parse.Query(TestObject);
      query.matches(
        'myString',
        "parse # First fragment. We'll write this in one case but match insensitively\n" +
          '.com  # Second fragment. This can be separated by any character, including newline;' +
          'however, this comment must end with a newline to recognize it as a comment\n',
        'mixs'
      );
      query.find().then(
        function (results) {
          equal(results.length, 1);
          done();
        },
        function (err) {
          jfail(err);
          done();
        }
      );
    });
  });

  it('Regular expression constructor includes modifiers inline', function (done) {
    const thing = new TestObject();
    thing.set('myString', '\n\nbuffer\n\nparse.COM');
    Parse.Object.saveAll([thing]).then(function () {
      const query = new Parse.Query(TestObject);
      query.matches('myString', /parse\.com/im);
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  const someAscii =
    "\\E' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTU" +
    "VWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'";

  it('contains', function (done) {
    Parse.Object.saveAll([
      new TestObject({ myString: 'zax' + someAscii + 'qub' }),
      new TestObject({ myString: 'start' + someAscii }),
      new TestObject({ myString: someAscii + 'end' }),
      new TestObject({ myString: someAscii }),
    ]).then(function () {
      const query = new Parse.Query(TestObject);
      query.contains('myString', someAscii);
      query.find().then(function (results) {
        equal(results.length, 4);
        done();
      });
    });
  });

  it('nested contains', done => {
    const sender1 = { group: ['A', 'B'] };
    const sender2 = { group: ['A', 'C'] };
    const sender3 = { group: ['B', 'C'] };
    const obj1 = new TestObject({ sender: sender1 });
    const obj2 = new TestObject({ sender: sender2 });
    const obj3 = new TestObject({ sender: sender3 });
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const query = new Parse.Query(TestObject);
        query.contains('sender.group', 'A');
        return query.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      }, done.fail);
  });

  it('startsWith', function (done) {
    Parse.Object.saveAll([
      new TestObject({ myString: 'zax' + someAscii + 'qub' }),
      new TestObject({ myString: 'start' + someAscii }),
      new TestObject({ myString: someAscii + 'end' }),
      new TestObject({ myString: someAscii }),
    ]).then(function () {
      const query = new Parse.Query(TestObject);
      query.startsWith('myString', someAscii);
      query.find().then(function (results) {
        equal(results.length, 2);
        done();
      });
    });
  });

  it('endsWith', function (done) {
    Parse.Object.saveAll([
      new TestObject({ myString: 'zax' + someAscii + 'qub' }),
      new TestObject({ myString: 'start' + someAscii }),
      new TestObject({ myString: someAscii + 'end' }),
      new TestObject({ myString: someAscii }),
    ]).then(function () {
      const query = new Parse.Query(TestObject);
      query.endsWith('myString', someAscii);
      query.find().then(function (results) {
        equal(results.length, 2);
        done();
      });
    });
  });

  it('exists', function (done) {
    const objects = [];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const item = new TestObject();
      if (i % 2 === 0) {
        item.set('x', i + 1);
      } else {
        item.set('y', i + 1);
      }
      objects.push(item);
    }
    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(TestObject);
      query.exists('x');
      query.find().then(function (results) {
        equal(results.length, 5);
        for (const result of results) {
          ok(result.get('x'));
        }
        done();
      });
    });
  });

  it('doesNotExist', function (done) {
    const objects = [];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const item = new TestObject();
      if (i % 2 === 0) {
        item.set('x', i + 1);
      } else {
        item.set('y', i + 1);
      }
      objects.push(item);
    }
    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(TestObject);
      query.doesNotExist('x');
      query.find().then(function (results) {
        equal(results.length, 4);
        for (const result of results) {
          ok(result.get('y'));
        }
        done();
      });
    });
  });

  it('exists relation', function (done) {
    const objects = [];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const container = new Container();
      if (i % 2 === 0) {
        const item = new TestObject();
        item.set('x', i);
        container.set('x', item);
        objects.push(item);
      } else {
        container.set('y', i);
      }
      objects.push(container);
    }
    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(Container);
      query.exists('x');
      query.find().then(function (results) {
        equal(results.length, 5);
        for (const result of results) {
          ok(result.get('x'));
        }
        done();
      });
    });
  });

  it('doesNotExist relation', function (done) {
    const objects = [];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const container = new Container();
      if (i % 2 === 0) {
        const item = new TestObject();
        item.set('x', i);
        container.set('x', item);
        objects.push(item);
      } else {
        container.set('y', i);
      }
      objects.push(container);
    }
    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(Container);
      query.doesNotExist('x');
      query.find().then(function (results) {
        equal(results.length, 4);
        for (const result of results) {
          ok(result.get('y'));
        }
        done();
      });
    });
  });

  it("don't include by default", function (done) {
    const child = new TestObject();
    const parent = new Container();
    child.set('foo', 'bar');
    parent.set('child', child);
    Parse.Object.saveAll([child, parent]).then(function () {
      child._clearServerData();
      const query = new Parse.Query(Container);
      query.find().then(function (results) {
        equal(results.length, 1);
        const parentAgain = results[0];
        const goodURL = Parse.serverURL;
        Parse.serverURL = 'YAAAAAAAAARRRRRGGGGGGGGG';
        const childAgain = parentAgain.get('child');
        ok(childAgain);
        equal(childAgain.get('foo'), undefined);
        Parse.serverURL = goodURL;
        done();
      });
    });
  });

  it('include relation', function (done) {
    const child = new TestObject();
    const parent = new Container();
    child.set('foo', 'bar');
    parent.set('child', child);
    Parse.Object.saveAll([child, parent]).then(function () {
      const query = new Parse.Query(Container);
      query.include('child');
      query.find().then(function (results) {
        equal(results.length, 1);
        const parentAgain = results[0];
        const goodURL = Parse.serverURL;
        Parse.serverURL = 'YAAAAAAAAARRRRRGGGGGGGGG';
        const childAgain = parentAgain.get('child');
        ok(childAgain);
        equal(childAgain.get('foo'), 'bar');
        Parse.serverURL = goodURL;
        done();
      });
    });
  });

  it('include relation array', function (done) {
    const child = new TestObject();
    const parent = new Container();
    child.set('foo', 'bar');
    parent.set('child', child);
    Parse.Object.saveAll([child, parent]).then(function () {
      const query = new Parse.Query(Container);
      query.include(['child']);
      query.find().then(function (results) {
        equal(results.length, 1);
        const parentAgain = results[0];
        const goodURL = Parse.serverURL;
        Parse.serverURL = 'YAAAAAAAAARRRRRGGGGGGGGG';
        const childAgain = parentAgain.get('child');
        ok(childAgain);
        equal(childAgain.get('foo'), 'bar');
        Parse.serverURL = goodURL;
        done();
      });
    });
  });

  it('nested include', function (done) {
    const Child = Parse.Object.extend('Child');
    const Parent = Parse.Object.extend('Parent');
    const Grandparent = Parse.Object.extend('Grandparent');
    const objects = [];
    for (let i = 0; i < 5; ++i) {
      const grandparent = new Grandparent({
        z: i,
        parent: new Parent({
          y: i,
          child: new Child({
            x: i,
          }),
        }),
      });
      objects.push(grandparent);
    }

    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(Grandparent);
      query.include(['parent.child']);
      query.find().then(function (results) {
        equal(results.length, 5);
        for (const object of results) {
          equal(object.get('z'), object.get('parent').get('y'));
          equal(object.get('z'), object.get('parent').get('child').get('x'));
        }
        done();
      });
    });
  });

  it("include doesn't make dirty wrong", function (done) {
    const Parent = Parse.Object.extend('ParentObject');
    const Child = Parse.Object.extend('ChildObject');
    const parent = new Parent();
    const child = new Child();
    child.set('foo', 'bar');
    parent.set('child', child);

    Parse.Object.saveAll([child, parent]).then(function () {
      const query = new Parse.Query(Parent);
      query.include('child');
      query.find().then(function (results) {
        equal(results.length, 1);
        const parentAgain = results[0];
        const childAgain = parentAgain.get('child');
        equal(childAgain.id, child.id);
        equal(parentAgain.id, parent.id);
        equal(childAgain.get('foo'), 'bar');
        equal(false, parentAgain.dirty());
        equal(false, childAgain.dirty());
        done();
      });
    });
  });

  it('properly includes array', done => {
    const objects = [];
    let total = 0;
    while (objects.length != 5) {
      const object = new Parse.Object('AnObject');
      object.set('key', objects.length);
      total += objects.length;
      objects.push(object);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const object = new Parse.Object('AContainer');
        object.set('objects', objects);
        return object.save();
      })
      .then(() => {
        const query = new Parse.Query('AContainer');
        query.include('objects');
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toBe(1);
          const res = results[0];
          const objects = res.get('objects');
          expect(objects.length).toBe(5);
          objects.forEach(object => {
            total -= object.get('key');
          });
          expect(total).toBe(0);
          done();
        },
        () => {
          fail('should not fail');
          done();
        }
      );
  });

  it('properly includes array of mixed objects', done => {
    const objects = [];
    let total = 0;
    while (objects.length != 5) {
      const object = new Parse.Object('AnObject');
      object.set('key', objects.length);
      total += objects.length;
      objects.push(object);
    }
    while (objects.length != 10) {
      const object = new Parse.Object('AnotherObject');
      object.set('key', objects.length);
      total += objects.length;
      objects.push(object);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const object = new Parse.Object('AContainer');
        object.set('objects', objects);
        return object.save();
      })
      .then(() => {
        const query = new Parse.Query('AContainer');
        query.include('objects');
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toBe(1);
          const res = results[0];
          const objects = res.get('objects');
          expect(objects.length).toBe(10);
          objects.forEach(object => {
            total -= object.get('key');
          });
          expect(total).toBe(0);
          done();
        },
        e => {
          fail('should not fail');
          fail(JSON.stringify(e));
          done();
        }
      );
  });

  it('properly nested array of mixed objects with bad ids', done => {
    const objects = [];
    let total = 0;
    while (objects.length != 5) {
      const object = new Parse.Object('AnObject');
      object.set('key', objects.length);
      objects.push(object);
    }
    while (objects.length != 10) {
      const object = new Parse.Object('AnotherObject');
      object.set('key', objects.length);
      objects.push(object);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const object = new Parse.Object('AContainer');
        for (let i = 0; i < objects.length; i++) {
          if (i % 2 == 0) {
            objects[i].id = 'randomThing';
          } else {
            total += objects[i].get('key');
          }
        }
        object.set('objects', objects);
        return object.save();
      })
      .then(() => {
        const query = new Parse.Query('AContainer');
        query.include('objects');
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toBe(1);
          const res = results[0];
          const objects = res.get('objects');
          expect(objects.length).toBe(5);
          objects.forEach(object => {
            total -= object.get('key');
          });
          expect(total).toBe(0);
          done();
        },
        err => {
          jfail(err);
          fail('should not fail');
          done();
        }
      );
  });

  it('properly fetches nested pointers', done => {
    const color = new Parse.Object('Color');
    color.set('hex', '#133733');
    const circle = new Parse.Object('Circle');
    circle.set('radius', 1337);

    Parse.Object.saveAll([color, circle])
      .then(() => {
        circle.set('color', color);
        const badCircle = new Parse.Object('Circle');
        badCircle.id = 'badId';
        const complexFigure = new Parse.Object('ComplexFigure');
        complexFigure.set('consistsOf', [circle, badCircle]);
        return complexFigure.save();
      })
      .then(() => {
        const q = new Parse.Query('ComplexFigure');
        q.include('consistsOf.color');
        return q.find();
      })
      .then(
        results => {
          expect(results.length).toBe(1);
          const figure = results[0];
          expect(figure.get('consistsOf').length).toBe(1);
          expect(figure.get('consistsOf')[0].get('color').get('hex')).toBe('#133733');
          done();
        },
        () => {
          fail('should not fail');
          done();
        }
      );
  });

  it('result object creation uses current extension', function (done) {
    const ParentObject = Parse.Object.extend({ className: 'ParentObject' });
    // Add a foo() method to ChildObject.
    let ChildObject = Parse.Object.extend('ChildObject', {
      foo: function () {
        return 'foo';
      },
    });

    const parent = new ParentObject();
    const child = new ChildObject();
    parent.set('child', child);
    Parse.Object.saveAll([child, parent]).then(function () {
      // Add a bar() method to ChildObject.
      ChildObject = Parse.Object.extend('ChildObject', {
        bar: function () {
          return 'bar';
        },
      });

      const query = new Parse.Query(ParentObject);
      query.include('child');
      query.find().then(function (results) {
        equal(results.length, 1);
        const parentAgain = results[0];
        const childAgain = parentAgain.get('child');
        equal(childAgain.foo(), 'foo');
        equal(childAgain.bar(), 'bar');
        done();
      });
    });
  });

  it('matches query', function (done) {
    const ParentObject = Parse.Object.extend('ParentObject');
    const ChildObject = Parse.Object.extend('ChildObject');
    const objects = [];
    for (let i = 0; i < 10; ++i) {
      objects.push(
        new ParentObject({
          child: new ChildObject({ x: i }),
          x: 10 + i,
        })
      );
    }
    Parse.Object.saveAll(objects).then(function () {
      const subQuery = new Parse.Query(ChildObject);
      subQuery.greaterThan('x', 5);
      const query = new Parse.Query(ParentObject);
      query.matchesQuery('child', subQuery);
      query.find().then(function (results) {
        equal(results.length, 4);
        for (const object of results) {
          ok(object.get('x') > 15);
        }
        const query = new Parse.Query(ParentObject);
        query.doesNotMatchQuery('child', subQuery);
        query.find().then(function (results) {
          equal(results.length, 6);
          for (const object of results) {
            ok(object.get('x') >= 10);
            ok(object.get('x') <= 15);
            done();
          }
        });
      });
    });
  });

  it('select query', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const objects = [
      new RestaurantObject({ ratings: 5, location: 'Djibouti' }),
      new RestaurantObject({ ratings: 3, location: 'Ouagadougou' }),
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Ouagadougou' }),
      new PersonObject({ name: 'Billy', hometown: 'Detroit' }),
    ];

    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(RestaurantObject);
      query.greaterThan('ratings', 4);
      const mainQuery = new Parse.Query(PersonObject);
      mainQuery.matchesKeyInQuery('hometown', 'location', query);
      mainQuery.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('name'), 'Bob');
        done();
      });
    });
  });

  it('$select inside $or', done => {
    const Restaurant = Parse.Object.extend('Restaurant');
    const Person = Parse.Object.extend('Person');
    const objects = [
      new Restaurant({ ratings: 5, location: 'Djibouti' }),
      new Restaurant({ ratings: 3, location: 'Ouagadougou' }),
      new Person({ name: 'Bob', hometown: 'Djibouti' }),
      new Person({ name: 'Tom', hometown: 'Ouagadougou' }),
      new Person({ name: 'Billy', hometown: 'Detroit' }),
    ];

    Parse.Object.saveAll(objects)
      .then(() => {
        const subquery = new Parse.Query(Restaurant);
        subquery.greaterThan('ratings', 4);
        const query1 = new Parse.Query(Person);
        query1.matchesKeyInQuery('hometown', 'location', subquery);
        const query2 = new Parse.Query(Person);
        query2.equalTo('name', 'Tom');
        const query = Parse.Query.or(query1, query2);
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toEqual(2);
          done();
        },
        error => {
          jfail(error);
          done();
        }
      );
  });

  it('$nor valid query', done => {
    const objects = Array.from(Array(10).keys()).map(rating => {
      return new TestObject({ rating: rating });
    });

    const highValue = 5;
    const lowValue = 3;
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({
          $nor: [{ rating: { $gt: highValue } }, { rating: { $lte: lowValue } }],
        }),
      },
    });

    Parse.Object.saveAll(objects)
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(response => {
        const results = response.data;
        expect(results.results.length).toBe(highValue - lowValue);
        expect(results.results.every(res => res.rating > lowValue && res.rating <= highValue)).toBe(
          true
        );
        done();
      });
  });

  it('$nor invalid query - empty array', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ $nor: [] }),
      },
    });
    const obj = new TestObject();
    obj
      .save()
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(done.fail)
      .catch(response => {
        equal(response.data.code, Parse.Error.INVALID_QUERY);
        done();
      });
  });

  it('$nor invalid query - wrong type', done => {
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ $nor: 1337 }),
      },
    });
    const obj = new TestObject();
    obj
      .save()
      .then(() => {
        return request(Object.assign({ url: Parse.serverURL + '/classes/TestObject' }, options));
      })
      .then(done.fail)
      .catch(response => {
        equal(response.data.code, Parse.Error.INVALID_QUERY);
        done();
      });
  });

  it('dontSelect query', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const objects = [
      new RestaurantObject({ ratings: 5, location: 'Djibouti' }),
      new RestaurantObject({ ratings: 3, location: 'Ouagadougou' }),
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Ouagadougou' }),
      new PersonObject({ name: 'Billy', hometown: 'Djibouti' }),
    ];

    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(RestaurantObject);
      query.greaterThan('ratings', 4);
      const mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery('hometown', 'location', query);
      mainQuery.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('name'), 'Tom');
        done();
      });
    });
  });

  it('dontSelect query without conditions', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const objects = [
      new RestaurantObject({ location: 'Djibouti' }),
      new RestaurantObject({ location: 'Ouagadougou' }),
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Yoloblahblahblah' }),
      new PersonObject({ name: 'Billy', hometown: 'Ouagadougou' }),
    ];

    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(RestaurantObject);
      const mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery('hometown', 'location', query);
      mainQuery.find().then(results => {
        equal(results.length, 1);
        equal(results[0].get('name'), 'Tom');
        done();
      });
    });
  });

  it('equalTo on same column as $dontSelect should not break $dontSelect functionality (#3678)', function (done) {
    const AuthorObject = Parse.Object.extend('Author');
    const BlockedObject = Parse.Object.extend('Blocked');
    const PostObject = Parse.Object.extend('Post');

    let postAuthor = null;
    let requestUser = null;

    return new AuthorObject({ name: 'Julius' })
      .save()
      .then(user => {
        postAuthor = user;
        return new AuthorObject({ name: 'Bob' }).save();
      })
      .then(user => {
        requestUser = user;
        const objects = [
          new PostObject({ author: postAuthor, title: 'Lorem ipsum' }),
          new PostObject({ author: requestUser, title: 'Kafka' }),
          new PostObject({ author: requestUser, title: 'Brown fox' }),
          new BlockedObject({
            blockedBy: postAuthor,
            blockedUser: requestUser,
          }),
        ];
        return Parse.Object.saveAll(objects);
      })
      .then(() => {
        const banListQuery = new Parse.Query(BlockedObject);
        banListQuery.equalTo('blockedUser', requestUser);

        return new Parse.Query(PostObject)
          .equalTo('author', postAuthor)
          .doesNotMatchKeyInQuery('author', 'blockedBy', banListQuery)
          .find()
          .then(r => {
            expect(r.length).toEqual(0);
            done();
          }, done.fail);
      });
  });

  it('multiple dontSelect query', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const objects = [
      new RestaurantObject({ ratings: 7, location: 'Djibouti2' }),
      new RestaurantObject({ ratings: 5, location: 'Djibouti' }),
      new RestaurantObject({ ratings: 3, location: 'Ouagadougou' }),
      new PersonObject({ name: 'Bob2', hometown: 'Djibouti2' }),
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Ouagadougou' }),
    ];

    Parse.Object.saveAll(objects).then(function () {
      const query = new Parse.Query(RestaurantObject);
      query.greaterThan('ratings', 6);
      const query2 = new Parse.Query(RestaurantObject);
      query2.lessThan('ratings', 4);
      const subQuery = new Parse.Query(PersonObject);
      subQuery.matchesKeyInQuery('hometown', 'location', query);
      const subQuery2 = new Parse.Query(PersonObject);
      subQuery2.matchesKeyInQuery('hometown', 'location', query2);
      const mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery('objectId', 'objectId', Parse.Query.or(subQuery, subQuery2));
      mainQuery.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('name'), 'Bob');
        done();
      });
    });
  });

  it('include user', function (done) {
    Parse.User.signUp('bob', 'password', { age: 21 }).then(function (user) {
      const TestObject = Parse.Object.extend('TestObject');
      const obj = new TestObject();
      obj
        .save({
          owner: user,
        })
        .then(function (obj) {
          const query = new Parse.Query(TestObject);
          query.include('owner');
          query.get(obj.id).then(function (objAgain) {
            equal(objAgain.id, obj.id);
            ok(objAgain.get('owner') instanceof Parse.User);
            equal(objAgain.get('owner').get('age'), 21);
            done();
          }, done.fail);
        }, done.fail);
    }, done.fail);
  });

  it('or queries', function (done) {
    const objects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (x) {
      const object = new Parse.Object('BoxedNumber');
      object.set('x', x);
      return object;
    });
    Parse.Object.saveAll(objects).then(function () {
      const query1 = new Parse.Query('BoxedNumber');
      query1.lessThan('x', 2);
      const query2 = new Parse.Query('BoxedNumber');
      query2.greaterThan('x', 5);
      const orQuery = Parse.Query.or(query1, query2);
      orQuery.find().then(function (results) {
        equal(results.length, 6);
        for (const number of results) {
          ok(number.get('x') < 2 || number.get('x') > 5);
        }
        done();
      });
    });
  });

  // This relies on matchesQuery aka the $inQuery operator
  it('or complex queries', function (done) {
    const objects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (x) {
      const child = new Parse.Object('Child');
      child.set('x', x);
      const parent = new Parse.Object('Parent');
      parent.set('child', child);
      parent.set('y', x);
      return parent;
    });

    Parse.Object.saveAll(objects).then(function () {
      const subQuery = new Parse.Query('Child');
      subQuery.equalTo('x', 4);
      const query1 = new Parse.Query('Parent');
      query1.matchesQuery('child', subQuery);
      const query2 = new Parse.Query('Parent');
      query2.lessThan('y', 2);
      const orQuery = Parse.Query.or(query1, query2);
      orQuery.find().then(function (results) {
        equal(results.length, 3);
        done();
      });
    });
  });

  it('async methods', function (done) {
    const saves = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (x) {
      const obj = new Parse.Object('TestObject');
      obj.set('x', x + 1);
      return obj;
    });

    Parse.Object.saveAll(saves)
      .then(function () {
        const query = new Parse.Query('TestObject');
        query.ascending('x');
        return query.first();
      })
      .then(function (obj) {
        equal(obj.get('x'), 1);
        const query = new Parse.Query('TestObject');
        query.descending('x');
        return query.find();
      })
      .then(function (results) {
        equal(results.length, 10);
        const query = new Parse.Query('TestObject');
        return query.get(results[0].id);
      })
      .then(function (obj1) {
        equal(obj1.get('x'), 10);
        const query = new Parse.Query('TestObject');
        return query.count();
      })
      .then(function (count) {
        equal(count, 10);
      })
      .then(function () {
        done();
      });
  });

  it('query.each', function (done) {
    const TOTAL = 50;
    const COUNT = 25;

    const items = range(TOTAL).map(function (x) {
      const obj = new TestObject();
      obj.set('x', x);
      return obj;
    });

    Parse.Object.saveAll(items).then(function () {
      const query = new Parse.Query(TestObject);
      query.lessThan('x', COUNT);

      const seen = [];
      query
        .each(
          function (obj) {
            seen[obj.get('x')] = (seen[obj.get('x')] || 0) + 1;
          },
          {
            batchSize: 10,
          }
        )
        .then(function () {
          equal(seen.length, COUNT);
          for (let i = 0; i < COUNT; i++) {
            equal(seen[i], 1, 'Should have seen object number ' + i);
          }
          done();
        }, done.fail);
    });
  });

  it('query.each async', function (done) {
    const TOTAL = 50;
    const COUNT = 25;

    expect(COUNT + 1);

    const items = range(TOTAL).map(function (x) {
      const obj = new TestObject();
      obj.set('x', x);
      return obj;
    });

    const seen = [];

    Parse.Object.saveAll(items)
      .then(function () {
        const query = new Parse.Query(TestObject);
        query.lessThan('x', COUNT);
        return query.each(
          function (obj) {
            return new Promise(resolve => {
              process.nextTick(function () {
                seen[obj.get('x')] = (seen[obj.get('x')] || 0) + 1;
                resolve();
              });
            });
          },
          {
            batchSize: 10,
          }
        );
      })
      .then(function () {
        equal(seen.length, COUNT);
        for (let i = 0; i < COUNT; i++) {
          equal(seen[i], 1, 'Should have seen object number ' + i);
        }
        done();
      });
  });

  it('query.each fails with order', function (done) {
    const TOTAL = 50;
    const COUNT = 25;

    const items = range(TOTAL).map(function (x) {
      const obj = new TestObject();
      obj.set('x', x);
      return obj;
    });

    const seen = [];

    Parse.Object.saveAll(items)
      .then(function () {
        const query = new Parse.Query(TestObject);
        query.lessThan('x', COUNT);
        query.ascending('x');
        return query.each(function (obj) {
          seen[obj.get('x')] = (seen[obj.get('x')] || 0) + 1;
        });
      })
      .then(
        function () {
          ok(false, 'This should have failed.');
          done();
        },
        function () {
          done();
        }
      );
  });

  it('query.each fails with skip', function (done) {
    const TOTAL = 50;
    const COUNT = 25;

    const items = range(TOTAL).map(function (x) {
      const obj = new TestObject();
      obj.set('x', x);
      return obj;
    });

    const seen = [];

    Parse.Object.saveAll(items)
      .then(function () {
        const query = new Parse.Query(TestObject);
        query.lessThan('x', COUNT);
        query.skip(5);
        return query.each(function (obj) {
          seen[obj.get('x')] = (seen[obj.get('x')] || 0) + 1;
        });
      })
      .then(
        function () {
          ok(false, 'This should have failed.');
          done();
        },
        function () {
          done();
        }
      );
  });

  it('query.each fails with limit', function (done) {
    const TOTAL = 50;
    const COUNT = 25;

    expect(0);

    const items = range(TOTAL).map(function (x) {
      const obj = new TestObject();
      obj.set('x', x);
      return obj;
    });

    const seen = [];

    Parse.Object.saveAll(items)
      .then(function () {
        const query = new Parse.Query(TestObject);
        query.lessThan('x', COUNT);
        query.limit(5);
        return query.each(function (obj) {
          seen[obj.get('x')] = (seen[obj.get('x')] || 0) + 1;
        });
      })
      .then(
        function () {
          ok(false, 'This should have failed.');
          done();
        },
        function () {
          done();
        }
      );
  });

  it('select keys query JS SDK', async () => {
    const obj = new TestObject({ foo: 'baz', bar: 1, qux: 2 });
    await obj.save();
    obj._clearServerData();
    const query1 = new Parse.Query(TestObject);
    query1.select('foo');
    const result1 = await query1.first();
    ok(result1.id, 'expected object id to be set');
    ok(result1.createdAt, 'expected object createdAt to be set');
    ok(result1.updatedAt, 'expected object updatedAt to be set');
    ok(!result1.dirty(), 'expected result not to be dirty');
    strictEqual(result1.get('foo'), 'baz');
    strictEqual(result1.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result1.get('qux'), undefined, "expected 'qux' field to be unset");

    const result2 = await result1.fetch();
    strictEqual(result2.get('foo'), 'baz');
    strictEqual(result2.get('bar'), 1);
    strictEqual(result2.get('qux'), 2);

    obj._clearServerData();
    const query2 = new Parse.Query(TestObject);
    query2.select();
    const result3 = await query2.first();
    ok(result3.id, 'expected object id to be set');
    ok(result3.createdAt, 'expected object createdAt to be set');
    ok(result3.updatedAt, 'expected object updatedAt to be set');
    ok(!result3.dirty(), 'expected result not to be dirty');
    strictEqual(result3.get('foo'), undefined, "expected 'foo' field to be unset");
    strictEqual(result3.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result3.get('qux'), undefined, "expected 'qux' field to be unset");

    obj._clearServerData();
    const query3 = new Parse.Query(TestObject);
    query3.select([]);
    const result4 = await query3.first();
    ok(result4.id, 'expected object id to be set');
    ok(result4.createdAt, 'expected object createdAt to be set');
    ok(result4.updatedAt, 'expected object updatedAt to be set');
    ok(!result4.dirty(), 'expected result not to be dirty');
    strictEqual(result4.get('foo'), undefined, "expected 'foo' field to be unset");
    strictEqual(result4.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result4.get('qux'), undefined, "expected 'qux' field to be unset");

    obj._clearServerData();
    const query4 = new Parse.Query(TestObject);
    query4.select(['foo']);
    const result5 = await query4.first();
    ok(result5.id, 'expected object id to be set');
    ok(result5.createdAt, 'expected object createdAt to be set');
    ok(result5.updatedAt, 'expected object updatedAt to be set');
    ok(!result5.dirty(), 'expected result not to be dirty');
    strictEqual(result5.get('foo'), 'baz');
    strictEqual(result5.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result5.get('qux'), undefined, "expected 'qux' field to be unset");

    obj._clearServerData();
    const query5 = new Parse.Query(TestObject);
    query5.select(['foo', 'bar']);
    const result6 = await query5.first();
    ok(result6.id, 'expected object id to be set');
    ok(!result6.dirty(), 'expected result not to be dirty');
    strictEqual(result6.get('foo'), 'baz');
    strictEqual(result6.get('bar'), 1);
    strictEqual(result6.get('qux'), undefined, "expected 'qux' field to be unset");

    obj._clearServerData();
    const query6 = new Parse.Query(TestObject);
    query6.select(['foo', 'bar', 'qux']);
    const result7 = await query6.first();
    ok(result7.id, 'expected object id to be set');
    ok(!result7.dirty(), 'expected result not to be dirty');
    strictEqual(result7.get('foo'), 'baz');
    strictEqual(result7.get('bar'), 1);
    strictEqual(result7.get('qux'), 2);

    obj._clearServerData();
    const query7 = new Parse.Query(TestObject);
    query7.select('foo', 'bar');
    const result8 = await query7.first();
    ok(result8.id, 'expected object id to be set');
    ok(!result8.dirty(), 'expected result not to be dirty');
    strictEqual(result8.get('foo'), 'baz');
    strictEqual(result8.get('bar'), 1);
    strictEqual(result8.get('qux'), undefined, "expected 'qux' field to be unset");

    obj._clearServerData();
    const query8 = new Parse.Query(TestObject);
    query8.select('foo', 'bar', 'qux');
    const result9 = await query8.first();
    ok(result9.id, 'expected object id to be set');
    ok(!result9.dirty(), 'expected result not to be dirty');
    strictEqual(result9.get('foo'), 'baz');
    strictEqual(result9.get('bar'), 1);
    strictEqual(result9.get('qux'), 2);
  });

  it('select keys (arrays)', async () => {
    const obj = new TestObject({ foo: 'baz', bar: 1, hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: 'hello',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].bar).toBeUndefined();
    expect(response.data.results[0].hello).toBe('world');

    const response2 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: ['foo', 'hello'],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response2.data.results[0].foo).toBe('baz');
    expect(response2.data.results[0].bar).toBeUndefined();
    expect(response2.data.results[0].hello).toBe('world');

    const response3 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: ['foo', 'bar', 'hello'],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response3.data.results[0].foo).toBe('baz');
    expect(response3.data.results[0].bar).toBe(1);
    expect(response3.data.results[0].hello).toBe('world');

    const response4 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: [''],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response4.data.results[0].objectId, 'expected objectId to be set');
    ok(response4.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response4.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response4.data.results[0].foo).toBeUndefined();
    expect(response4.data.results[0].bar).toBeUndefined();
    expect(response4.data.results[0].hello).toBeUndefined();

    const response5 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: [],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response5.data.results[0].objectId, 'expected objectId to be set');
    ok(response5.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response5.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response5.data.results[0].foo).toBe('baz');
    expect(response5.data.results[0].bar).toBe(1);
    expect(response5.data.results[0].hello).toBe('world');
  });

  it('select keys (strings)', async () => {
    const obj = new TestObject({ foo: 'baz', bar: 1, hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: '',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response.data.results[0].objectId, 'expected objectId to be set');
    ok(response.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].bar).toBeUndefined();
    expect(response.data.results[0].hello).toBeUndefined();

    const response2 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: '["foo", "hello"]',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response2.data.results[0].objectId, 'expected objectId to be set');
    ok(response2.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response2.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response2.data.results[0].foo).toBe('baz');
    expect(response2.data.results[0].bar).toBeUndefined();
    expect(response2.data.results[0].hello).toBe('world');

    const response3 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: '["foo", "bar", "hello"]',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response3.data.results[0].objectId, 'expected objectId to be set');
    ok(response3.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response3.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response3.data.results[0].foo).toBe('baz');
    expect(response3.data.results[0].bar).toBe(1);
    expect(response3.data.results[0].hello).toBe('world');
  });

  it('exclude keys query JS SDK', async () => {
    const obj = new TestObject({ foo: 'baz', bar: 1, qux: 2 });

    await obj.save();
    obj._clearServerData();
    const query1 = new Parse.Query(TestObject);
    query1.exclude('foo');
    const result1 = await query1.first();
    ok(result1.id, 'expected object id to be set');
    ok(result1.createdAt, 'expected object createdAt to be set');
    ok(result1.updatedAt, 'expected object updatedAt to be set');
    ok(!result1.dirty(), 'expected result not to be dirty');
    strictEqual(result1.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result1.get('bar'), 1);
    strictEqual(result1.get('qux'), 2);

    const result2 = await result1.fetch();
    strictEqual(result2.get('foo'), 'baz');
    strictEqual(result2.get('bar'), 1);
    strictEqual(result2.get('qux'), 2);

    obj._clearServerData();
    const query2 = new Parse.Query(TestObject);
    query2.exclude();
    const result3 = await query2.first();
    ok(result3.id, 'expected object id to be set');
    ok(result3.createdAt, 'expected object createdAt to be set');
    ok(result3.updatedAt, 'expected object updatedAt to be set');
    ok(!result3.dirty(), 'expected result not to be dirty');
    strictEqual(result3.get('foo'), 'baz');
    strictEqual(result3.get('bar'), 1);
    strictEqual(result3.get('qux'), 2);

    obj._clearServerData();
    const query3 = new Parse.Query(TestObject);
    query3.exclude([]);
    const result4 = await query3.first();
    ok(result4.id, 'expected object id to be set');
    ok(result4.createdAt, 'expected object createdAt to be set');
    ok(result4.updatedAt, 'expected object updatedAt to be set');
    ok(!result4.dirty(), 'expected result not to be dirty');
    strictEqual(result4.get('foo'), 'baz');
    strictEqual(result4.get('bar'), 1);
    strictEqual(result4.get('qux'), 2);

    obj._clearServerData();
    const query4 = new Parse.Query(TestObject);
    query4.exclude(['foo']);
    const result5 = await query4.first();
    ok(result5.id, 'expected object id to be set');
    ok(result5.createdAt, 'expected object createdAt to be set');
    ok(result5.updatedAt, 'expected object updatedAt to be set');
    ok(!result5.dirty(), 'expected result not to be dirty');
    strictEqual(result5.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result5.get('bar'), 1);
    strictEqual(result5.get('qux'), 2);

    obj._clearServerData();
    const query5 = new Parse.Query(TestObject);
    query5.exclude(['foo', 'bar']);
    const result6 = await query5.first();
    ok(result6.id, 'expected object id to be set');
    ok(!result6.dirty(), 'expected result not to be dirty');
    strictEqual(result6.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result6.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result6.get('qux'), 2);

    obj._clearServerData();
    const query6 = new Parse.Query(TestObject);
    query6.exclude(['foo', 'bar', 'qux']);
    const result7 = await query6.first();
    ok(result7.id, 'expected object id to be set');
    ok(!result7.dirty(), 'expected result not to be dirty');
    strictEqual(result7.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result7.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result7.get('qux'), undefined, "expected 'bar' field to be unset");

    obj._clearServerData();
    const query7 = new Parse.Query(TestObject);
    query7.exclude('foo');
    const result8 = await query7.first();
    ok(result8.id, 'expected object id to be set');
    ok(!result8.dirty(), 'expected result not to be dirty');
    strictEqual(result8.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result8.get('bar'), 1);
    strictEqual(result8.get('qux'), 2);

    obj._clearServerData();
    const query8 = new Parse.Query(TestObject);
    query8.exclude('foo', 'bar');
    const result9 = await query8.first();
    ok(result9.id, 'expected object id to be set');
    ok(!result9.dirty(), 'expected result not to be dirty');
    strictEqual(result9.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result9.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result9.get('qux'), 2);

    obj._clearServerData();
    const query9 = new Parse.Query(TestObject);
    query9.exclude('foo', 'bar', 'qux');
    const result10 = await query9.first();
    ok(result10.id, 'expected object id to be set');
    ok(!result10.dirty(), 'expected result not to be dirty');
    strictEqual(result10.get('foo'), undefined, "expected 'bar' field to be unset");
    strictEqual(result10.get('bar'), undefined, "expected 'bar' field to be unset");
    strictEqual(result10.get('qux'), undefined, "expected 'bar' field to be unset");
  });

  it('exclude keys (arrays)', async () => {
    const obj = new TestObject({ foo: 'baz', hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: ['foo'],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response.data.results[0].objectId, 'expected objectId to be set');
    ok(response.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].hello).toBe('world');

    const response2 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: ['foo', 'hello'],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response2.data.results[0].objectId, 'expected objectId to be set');
    ok(response2.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response2.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response2.data.results[0].foo).toBeUndefined();
    expect(response2.data.results[0].hello).toBeUndefined();

    const response3 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: [],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response3.data.results[0].objectId, 'expected objectId to be set');
    ok(response3.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response3.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response3.data.results[0].foo).toBe('baz');
    expect(response3.data.results[0].hello).toBe('world');

    const response4 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: [''],
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response4.data.results[0].objectId, 'expected objectId to be set');
    ok(response4.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response4.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response4.data.results[0].foo).toBe('baz');
    expect(response4.data.results[0].hello).toBe('world');
  });

  it('exclude keys (strings)', async () => {
    const obj = new TestObject({ foo: 'baz', hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: 'foo',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response.data.results[0].objectId, 'expected objectId to be set');
    ok(response.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].hello).toBe('world');

    const response2 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: '',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response2.data.results[0].objectId, 'expected objectId to be set');
    ok(response2.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response2.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response2.data.results[0].foo).toBe('baz');
    expect(response2.data.results[0].hello).toBe('world');

    const response3 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: '["hello"]',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response3.data.results[0].objectId, 'expected objectId to be set');
    ok(response3.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response3.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response3.data.results[0].foo).toBe('baz');
    expect(response3.data.results[0].hello).toBeUndefined();

    const response4 = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        excludeKeys: '["foo", "hello"]',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    ok(response4.data.results[0].objectId, 'expected objectId to be set');
    ok(response4.data.results[0].createdAt, 'expected object createdAt to be set');
    ok(response4.data.results[0].updatedAt, 'expected object updatedAt to be set');
    expect(response4.data.results[0].foo).toBeUndefined();
    expect(response4.data.results[0].hello).toBeUndefined();
  });

  it('exclude keys with select same key', async () => {
    const obj = new TestObject({ foo: 'baz', hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: 'foo',
        excludeKeys: 'foo',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].hello).toBeUndefined();
  });

  it('exclude keys with select different key', async () => {
    const obj = new TestObject({ foo: 'baz', hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        keys: 'foo,hello',
        excludeKeys: 'foo',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].foo).toBeUndefined();
    expect(response.data.results[0].hello).toBe('world');
  });

  it('exclude keys with include same key', async () => {
    const pointer = new TestObject();
    await pointer.save();
    const obj = new TestObject({ child: pointer, hello: 'world' });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        include: 'child',
        excludeKeys: 'child',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].child).toBeUndefined();
    expect(response.data.results[0].hello).toBe('world');
  });

  it('exclude keys with include different key', async () => {
    const pointer = new TestObject();
    await pointer.save();
    const obj = new TestObject({
      child1: pointer,
      child2: pointer,
      hello: 'world',
    });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        include: 'child1,child2',
        excludeKeys: 'child1',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].child1).toBeUndefined();
    expect(response.data.results[0].child2.objectId).toEqual(pointer.id);
    expect(response.data.results[0].hello).toBe('world');
  });

  it('exclude keys with includeAll', async () => {
    const pointer = new TestObject();
    await pointer.save();
    const obj = new TestObject({
      child1: pointer,
      child2: pointer,
      hello: 'world',
    });
    await obj.save();

    const response = await request({
      url: Parse.serverURL + '/classes/TestObject',
      qs: {
        includeAll: true,
        excludeKeys: 'child1',
        where: JSON.stringify({ objectId: obj.id }),
      },
      headers: masterKeyHeaders,
    });
    expect(response.data.results[0].child).toBeUndefined();
    expect(response.data.results[0].child2.objectId).toEqual(pointer.id);
    expect(response.data.results[0].hello).toBe('world');
  });

  it('select keys with each query', function (done) {
    const obj = new TestObject({ foo: 'baz', bar: 1 });

    obj.save().then(function () {
      obj._clearServerData();
      const query = new Parse.Query(TestObject);
      query.select('foo');
      query
        .each(function (result) {
          ok(result.id, 'expected object id to be set');
          ok(result.createdAt, 'expected object createdAt to be set');
          ok(result.updatedAt, 'expected object updatedAt to be set');
          ok(!result.dirty(), 'expected result not to be dirty');
          strictEqual(result.get('foo'), 'baz');
          strictEqual(result.get('bar'), undefined, 'expected "bar" field to be unset');
        })
        .then(
          function () {
            done();
          },
          function (err) {
            jfail(err);
            done();
          }
        );
    });
  });

  it('notEqual with array of pointers', done => {
    const children = [];
    const parents = [];
    const promises = [];
    for (let i = 0; i < 2; i++) {
      const proc = iter => {
        const child = new Parse.Object('Child');
        children.push(child);
        const parent = new Parse.Object('Parent');
        parents.push(parent);
        promises.push(
          child.save().then(() => {
            parents[iter].set('child', [children[iter]]);
            return parents[iter].save();
          })
        );
      };
      proc(i);
    }
    Promise.all(promises)
      .then(() => {
        const query = new Parse.Query('Parent');
        query.notEqualTo('child', children[0]);
        return query.find();
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].id).toEqual(parents[1].id);
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  // PG don't support creating a null column
  it_exclude_dbs(['postgres'])('querying for null value', done => {
    const obj = new Parse.Object('TestObject');
    obj.set('aNull', null);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.equalTo('aNull', null);
        return query.find();
      })
      .then(results => {
        expect(results.length).toEqual(1);
        expect(results[0].get('aNull')).toEqual(null);
        done();
      });
  });

  it('query within dictionary', done => {
    const promises = [];
    for (let i = 0; i < 2; i++) {
      const proc = iter => {
        const obj = new Parse.Object('TestObject');
        obj.set('aDict', { x: iter + 1, y: iter + 2 });
        promises.push(obj.save());
      };
      proc(i);
    }
    Promise.all(promises)
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.equalTo('aDict.x', 1);
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toEqual(1);
          done();
        },
        error => {
          console.log(error);
        }
      );
  });

  it('supports include on the wrong key type (#2262)', function (done) {
    const childObject = new Parse.Object('TestChildObject');
    childObject.set('hello', 'world');
    childObject
      .save()
      .then(() => {
        const obj = new Parse.Object('TestObject');
        obj.set('foo', 'bar');
        obj.set('child', childObject);
        return obj.save();
      })
      .then(() => {
        const q = new Parse.Query('TestObject');
        q.include('child');
        q.include('child.parent');
        q.include('createdAt');
        q.include('createdAt.createdAt');
        return q.find();
      })
      .then(
        objs => {
          expect(objs.length).toBe(1);
          expect(objs[0].get('child').get('hello')).toEqual('world');
          expect(objs[0].createdAt instanceof Date).toBe(true);
          done();
        },
        () => {
          fail('should not fail');
          done();
        }
      );
  });

  it('query match on array with single object', done => {
    const target = {
      __type: 'Pointer',
      className: 'TestObject',
      objectId: 'abc123',
    };
    const obj = new Parse.Object('TestObject');
    obj.set('someObjs', [target]);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.equalTo('someObjs', target);
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toEqual(1);
          done();
        },
        error => {
          console.log(error);
        }
      );
  });

  it('query match on array with multiple objects', done => {
    const target1 = {
      __type: 'Pointer',
      className: 'TestObject',
      objectId: 'abc',
    };
    const target2 = {
      __type: 'Pointer',
      className: 'TestObject',
      objectId: '123',
    };
    const obj = new Parse.Object('TestObject');
    obj.set('someObjs', [target1, target2]);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.equalTo('someObjs', target1);
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toEqual(1);
          done();
        },
        error => {
          console.log(error);
        }
      );
  });

  it('query should not match on array when searching for null', done => {
    const target = {
      __type: 'Pointer',
      className: 'TestObject',
      objectId: '123',
    };
    const obj = new Parse.Object('TestObject');
    obj.set('someKey', 'someValue');
    obj.set('someObjs', [target]);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.equalTo('someKey', 'someValue');
        query.equalTo('someObjs', null);
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toEqual(0);
          done();
        },
        error => {
          console.log(error);
        }
      );
  });

  // #371
  it('should properly interpret a query v1', done => {
    const query = new Parse.Query('C1');
    const auxQuery = new Parse.Query('C1');
    query.matchesKeyInQuery('A1', 'A2', auxQuery);
    query.include('A3');
    query.include('A2');
    query.find().then(
      () => {
        done();
      },
      err => {
        jfail(err);
        fail('should not failt');
        done();
      }
    );
  });

  it('should properly interpret a query v2', done => {
    const user = new Parse.User();
    user.set('username', 'foo');
    user.set('password', 'bar');
    return user
      .save()
      .then(user => {
        const objIdQuery = new Parse.Query('_User').equalTo('objectId', user.id);
        const blockedUserQuery = user.relation('blockedUsers').query();

        const aResponseQuery = new Parse.Query('MatchRelationshipActivityResponse');
        aResponseQuery.equalTo('userA', user);
        aResponseQuery.equalTo('userAResponse', 1);

        const bResponseQuery = new Parse.Query('MatchRelationshipActivityResponse');
        bResponseQuery.equalTo('userB', user);
        bResponseQuery.equalTo('userBResponse', 1);

        const matchOr = Parse.Query.or(aResponseQuery, bResponseQuery);
        const matchRelationshipA = new Parse.Query('_User');
        matchRelationshipA.matchesKeyInQuery('objectId', 'userAObjectId', matchOr);
        const matchRelationshipB = new Parse.Query('_User');
        matchRelationshipB.matchesKeyInQuery('objectId', 'userBObjectId', matchOr);

        const orQuery = Parse.Query.or(
          objIdQuery,
          blockedUserQuery,
          matchRelationshipA,
          matchRelationshipB
        );
        const query = new Parse.Query('_User');
        query.doesNotMatchQuery('objectId', orQuery);
        return query.find();
      })
      .then(
        () => {
          done();
        },
        err => {
          jfail(err);
          fail('should not fail');
          done();
        }
      );
  });

  it('should match a key in an array (#3195)', function (done) {
    const AuthorObject = Parse.Object.extend('Author');
    const GroupObject = Parse.Object.extend('Group');
    const PostObject = Parse.Object.extend('Post');

    return new AuthorObject()
      .save()
      .then(user => {
        const post = new PostObject({
          author: user,
        });

        const group = new GroupObject({
          members: [user],
        });

        return Promise.all([post.save(), group.save()]);
      })
      .then(results => {
        const p = results[0];
        return new Parse.Query(PostObject)
          .matchesKeyInQuery('author', 'members', new Parse.Query(GroupObject))
          .find()
          .then(r => {
            expect(r.length).toEqual(1);
            if (r.length > 0) {
              expect(r[0].id).toEqual(p.id);
            }
            done();
          }, done.fail);
      });
  });

  it('should find objects with array of pointers', done => {
    const objects = [];
    while (objects.length != 5) {
      const object = new Parse.Object('ContainedObject');
      object.set('index', objects.length);
      objects.push(object);
    }

    Parse.Object.saveAll(objects)
      .then(objects => {
        const container = new Parse.Object('Container');
        const pointers = objects.map(obj => {
          return {
            __type: 'Pointer',
            className: 'ContainedObject',
            objectId: obj.id,
          };
        });
        container.set('objects', pointers);
        const container2 = new Parse.Object('Container');
        container2.set('objects', pointers.slice(2, 3));
        return Parse.Object.saveAll([container, container2]);
      })
      .then(() => {
        const inQuery = new Parse.Query('ContainedObject');
        inQuery.greaterThanOrEqualTo('index', 1);
        const query = new Parse.Query('Container');
        query.matchesQuery('objects', inQuery);
        return query.find();
      })
      .then(results => {
        if (results) {
          expect(results.length).toBe(2);
        }
        done();
      })
      .catch(err => {
        jfail(err);
        fail('should not fail');
        done();
      });
  });

  it('query with two OR subqueries (regression test #1259)', done => {
    const relatedObject = new Parse.Object('Class2');
    relatedObject
      .save()
      .then(relatedObject => {
        const anObject = new Parse.Object('Class1');
        const relation = anObject.relation('relation');
        relation.add(relatedObject);
        return anObject.save();
      })
      .then(anObject => {
        const q1 = anObject.relation('relation').query();
        q1.doesNotExist('nonExistantKey1');
        const q2 = anObject.relation('relation').query();
        q2.doesNotExist('nonExistantKey2');
        Parse.Query.or(q1, q2)
          .find()
          .then(results => {
            expect(results.length).toEqual(1);
            if (results.length == 1) {
              expect(results[0].objectId).toEqual(q1.objectId);
            }
            done();
          });
      });
  });

  it('objectId containedIn with multiple large array', done => {
    const obj = new Parse.Object('MyClass');
    obj
      .save()
      .then(obj => {
        const longListOfStrings = [];
        for (let i = 0; i < 130; i++) {
          longListOfStrings.push(i.toString());
        }
        longListOfStrings.push(obj.id);
        const q = new Parse.Query('MyClass');
        q.containedIn('objectId', longListOfStrings);
        q.containedIn('objectId', longListOfStrings);
        return q.find();
      })
      .then(results => {
        expect(results.length).toEqual(1);
        done();
      });
  });

  it('containedIn with pointers should work with string array', done => {
    const obj = new Parse.Object('MyClass');
    const child = new Parse.Object('Child');
    child
      .save()
      .then(() => {
        obj.set('child', child);
        return obj.save();
      })
      .then(() => {
        const objs = [];
        for (let i = 0; i < 10; i++) {
          objs.push(new Parse.Object('MyClass'));
        }
        return Parse.Object.saveAll(objs);
      })
      .then(() => {
        const query = new Parse.Query('MyClass');
        query.containedIn('child', [child.id]);
        return query.find();
      })
      .then(results => {
        expect(results.length).toBe(1);
      })
      .then(done)
      .catch(done.fail);
  });

  it('containedIn with pointers should work with string array, with many objects', done => {
    const objs = [];
    const children = [];
    for (let i = 0; i < 10; i++) {
      const obj = new Parse.Object('MyClass');
      const child = new Parse.Object('Child');
      objs.push(obj);
      children.push(child);
    }
    Parse.Object.saveAll(children)
      .then(() => {
        return Parse.Object.saveAll(
          objs.map((obj, i) => {
            obj.set('child', children[i]);
            return obj;
          })
        );
      })
      .then(() => {
        const query = new Parse.Query('MyClass');
        const subset = children.slice(0, 5).map(child => {
          return child.id;
        });
        query.containedIn('child', subset);
        return query.find();
      })
      .then(results => {
        expect(results.length).toBe(5);
      })
      .then(done)
      .catch(done.fail);
  });

  it('include for specific object', function (done) {
    const child = new Parse.Object('Child');
    const parent = new Parse.Object('Parent');
    child.set('foo', 'bar');
    parent.set('child', child);
    Parse.Object.saveAll([child, parent]).then(function (response) {
      const savedParent = response[1];
      const parentQuery = new Parse.Query('Parent');
      parentQuery.include('child');
      parentQuery.get(savedParent.id).then(function (parentObj) {
        const childPointer = parentObj.get('child');
        ok(childPointer);
        equal(childPointer.get('foo'), 'bar');
        done();
      });
    });
  });

  it('select keys for specific object', function (done) {
    const Foobar = new Parse.Object('Foobar');
    Foobar.set('foo', 'bar');
    Foobar.set('fizz', 'buzz');
    Foobar.save().then(function (savedFoobar) {
      const foobarQuery = new Parse.Query('Foobar');
      foobarQuery.select('fizz');
      foobarQuery.get(savedFoobar.id).then(function (foobarObj) {
        equal(foobarObj.get('fizz'), 'buzz');
        equal(foobarObj.get('foo'), undefined);
        done();
      });
    });
  });

  it('select nested keys (issue #1567)', function (done) {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    BarBaz.set('key', 'value');
    BarBaz.set('otherKey', 'value');
    BarBaz.save()
      .then(() => {
        Foobar.set('foo', 'bar');
        Foobar.set('fizz', 'buzz');
        Foobar.set('barBaz', BarBaz);
        return Foobar.save();
      })
      .then(function (savedFoobar) {
        const foobarQuery = new Parse.Query('Foobar');
        foobarQuery.select(['fizz', 'barBaz.key']);
        foobarQuery.get(savedFoobar.id).then(function (foobarObj) {
          equal(foobarObj.get('fizz'), 'buzz');
          equal(foobarObj.get('foo'), undefined);
          if (foobarObj.has('barBaz')) {
            equal(foobarObj.get('barBaz').get('key'), 'value');
            equal(foobarObj.get('barBaz').get('otherKey'), undefined);
          } else {
            fail('barBaz should be set');
          }
          done();
        });
      });
  });

  it('select nested keys 2 level (issue #1567)', function (done) {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    const Bazoo = new Parse.Object('Bazoo');

    Bazoo.set('some', 'thing');
    Bazoo.set('otherSome', 'value');
    Bazoo.save()
      .then(() => {
        BarBaz.set('key', 'value');
        BarBaz.set('otherKey', 'value');
        BarBaz.set('bazoo', Bazoo);
        return BarBaz.save();
      })
      .then(() => {
        Foobar.set('foo', 'bar');
        Foobar.set('fizz', 'buzz');
        Foobar.set('barBaz', BarBaz);
        return Foobar.save();
      })
      .then(function (savedFoobar) {
        const foobarQuery = new Parse.Query('Foobar');
        foobarQuery.select(['fizz', 'barBaz.key', 'barBaz.bazoo.some']);
        foobarQuery.get(savedFoobar.id).then(function (foobarObj) {
          equal(foobarObj.get('fizz'), 'buzz');
          equal(foobarObj.get('foo'), undefined);
          if (foobarObj.has('barBaz')) {
            equal(foobarObj.get('barBaz').get('key'), 'value');
            equal(foobarObj.get('barBaz').get('otherKey'), undefined);
            equal(foobarObj.get('barBaz').get('bazoo').get('some'), 'thing');
            equal(foobarObj.get('barBaz').get('bazoo').get('otherSome'), undefined);
          } else {
            fail('barBaz should be set');
          }
          done();
        });
      });
  });

  it('exclude nested keys', async () => {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    BarBaz.set('key', 'value');
    BarBaz.set('otherKey', 'value');
    await BarBaz.save();

    Foobar.set('foo', 'bar');
    Foobar.set('fizz', 'buzz');
    Foobar.set('barBaz', BarBaz);
    const savedFoobar = await Foobar.save();

    const foobarQuery = new Parse.Query('Foobar');
    foobarQuery.exclude(['foo', 'barBaz.otherKey']);
    const foobarObj = await foobarQuery.get(savedFoobar.id);
    equal(foobarObj.get('fizz'), 'buzz');
    equal(foobarObj.get('foo'), undefined);
    if (foobarObj.has('barBaz')) {
      equal(foobarObj.get('barBaz').get('key'), 'value');
      equal(foobarObj.get('barBaz').get('otherKey'), undefined);
    } else {
      fail('barBaz should be set');
    }
  });

  it('exclude nested keys 2 level', async () => {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    const Bazoo = new Parse.Object('Bazoo');

    Bazoo.set('some', 'thing');
    Bazoo.set('otherSome', 'value');
    await Bazoo.save();

    BarBaz.set('key', 'value');
    BarBaz.set('otherKey', 'value');
    BarBaz.set('bazoo', Bazoo);
    await BarBaz.save();

    Foobar.set('foo', 'bar');
    Foobar.set('fizz', 'buzz');
    Foobar.set('barBaz', BarBaz);
    const savedFoobar = await Foobar.save();

    const foobarQuery = new Parse.Query('Foobar');
    foobarQuery.exclude(['foo', 'barBaz.otherKey', 'barBaz.bazoo.otherSome']);
    const foobarObj = await foobarQuery.get(savedFoobar.id);
    equal(foobarObj.get('fizz'), 'buzz');
    equal(foobarObj.get('foo'), undefined);
    if (foobarObj.has('barBaz')) {
      equal(foobarObj.get('barBaz').get('key'), 'value');
      equal(foobarObj.get('barBaz').get('otherKey'), undefined);
      equal(foobarObj.get('barBaz').get('bazoo').get('some'), 'thing');
      equal(foobarObj.get('barBaz').get('bazoo').get('otherSome'), undefined);
    } else {
      fail('barBaz should be set');
    }
  });

  it('include with *', async () => {
    const child1 = new TestObject({ foo: 'bar', name: 'ac' });
    const child2 = new TestObject({ foo: 'baz', name: 'flo' });
    const child3 = new TestObject({ foo: 'bad', name: 'mo' });
    const parent = new Container({ child1, child2, child3 });
    await Parse.Object.saveAll([parent, child1, child2, child3]);
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ objectId: parent.id }),
        include: '*',
      },
    });
    const resp = await request(
      Object.assign({ url: Parse.serverURL + '/classes/Container' }, options)
    );
    const result = resp.data.results[0];
    equal(result.child1.foo, 'bar');
    equal(result.child2.foo, 'baz');
    equal(result.child3.foo, 'bad');
    equal(result.child1.name, 'ac');
    equal(result.child2.name, 'flo');
    equal(result.child3.name, 'mo');
  });

  it('include with ["*"]', async () => {
    const child1 = new TestObject({ foo: 'bar', name: 'ac' });
    const child2 = new TestObject({ foo: 'baz', name: 'flo' });
    const child3 = new TestObject({ foo: 'bad', name: 'mo' });
    const parent = new Container({ child1, child2, child3 });
    await Parse.Object.saveAll([parent, child1, child2, child3]);
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ objectId: parent.id }),
        include: '["*"]',
      },
    });
    const resp = await request(
      Object.assign({ url: Parse.serverURL + '/classes/Container' }, options)
    );
    const result = resp.data.results[0];
    equal(result.child1.foo, 'bar');
    equal(result.child2.foo, 'baz');
    equal(result.child3.foo, 'bad');
    equal(result.child1.name, 'ac');
    equal(result.child2.name, 'flo');
    equal(result.child3.name, 'mo');
  });

  it('include with * overrides', async () => {
    const child1 = new TestObject({ foo: 'bar', name: 'ac' });
    const child2 = new TestObject({ foo: 'baz', name: 'flo' });
    const child3 = new TestObject({ foo: 'bad', name: 'mo' });
    const parent = new Container({ child1, child2, child3 });
    await Parse.Object.saveAll([parent, child1, child2, child3]);
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ objectId: parent.id }),
        include: 'child2,*',
      },
    });
    const resp = await request(
      Object.assign({ url: Parse.serverURL + '/classes/Container' }, options)
    );
    const result = resp.data.results[0];
    equal(result.child1.foo, 'bar');
    equal(result.child2.foo, 'baz');
    equal(result.child3.foo, 'bad');
    equal(result.child1.name, 'ac');
    equal(result.child2.name, 'flo');
    equal(result.child3.name, 'mo');
  });

  it('include with ["*"] overrides', async () => {
    const child1 = new TestObject({ foo: 'bar', name: 'ac' });
    const child2 = new TestObject({ foo: 'baz', name: 'flo' });
    const child3 = new TestObject({ foo: 'bad', name: 'mo' });
    const parent = new Container({ child1, child2, child3 });
    await Parse.Object.saveAll([parent, child1, child2, child3]);
    const options = Object.assign({}, masterKeyOptions, {
      qs: {
        where: JSON.stringify({ objectId: parent.id }),
        include: '["child2","*"]',
      },
    });
    const resp = await request(
      Object.assign({ url: Parse.serverURL + '/classes/Container' }, options)
    );
    const result = resp.data.results[0];
    equal(result.child1.foo, 'bar');
    equal(result.child2.foo, 'baz');
    equal(result.child3.foo, 'bad');
    equal(result.child1.name, 'ac');
    equal(result.child2.name, 'flo');
    equal(result.child3.name, 'mo');
  });

  it('includeAll', done => {
    const child1 = new TestObject({ foo: 'bar', name: 'ac' });
    const child2 = new TestObject({ foo: 'baz', name: 'flo' });
    const child3 = new TestObject({ foo: 'bad', name: 'mo' });
    const parent = new Container({ child1, child2, child3 });
    Parse.Object.saveAll([parent, child1, child2, child3])
      .then(() => {
        const options = Object.assign({}, masterKeyOptions, {
          qs: {
            where: JSON.stringify({ objectId: parent.id }),
            includeAll: true,
          },
        });
        return request(Object.assign({ url: Parse.serverURL + '/classes/Container' }, options));
      })
      .then(resp => {
        const result = resp.data.results[0];
        equal(result.child1.foo, 'bar');
        equal(result.child2.foo, 'baz');
        equal(result.child3.foo, 'bad');
        equal(result.child1.name, 'ac');
        equal(result.child2.name, 'flo');
        equal(result.child3.name, 'mo');
        done();
      });
  });

  it('include pointer and pointer array', function (done) {
    const child = new TestObject();
    const child2 = new TestObject();
    child.set('foo', 'bar');
    child2.set('hello', 'world');
    Parse.Object.saveAll([child, child2]).then(function () {
      const parent = new Container();
      parent.set('child', child.toPointer());
      parent.set('child2', [child2.toPointer()]);
      parent.save().then(function () {
        const query = new Parse.Query(Container);
        query.include(['child', 'child2']);
        query.find().then(function (results) {
          equal(results.length, 1);
          const parentAgain = results[0];
          const childAgain = parentAgain.get('child');
          ok(childAgain);
          equal(childAgain.get('foo'), 'bar');
          const child2Again = parentAgain.get('child2');
          equal(child2Again.length, 1);
          ok(child2Again);
          equal(child2Again[0].get('hello'), 'world');
          done();
        });
      });
    });
  });

  it('include pointer and pointer array (keys switched)', function (done) {
    const child = new TestObject();
    const child2 = new TestObject();
    child.set('foo', 'bar');
    child2.set('hello', 'world');
    Parse.Object.saveAll([child, child2]).then(function () {
      const parent = new Container();
      parent.set('child', child.toPointer());
      parent.set('child2', [child2.toPointer()]);
      parent.save().then(function () {
        const query = new Parse.Query(Container);
        query.include(['child2', 'child']);
        query.find().then(function (results) {
          equal(results.length, 1);
          const parentAgain = results[0];
          const childAgain = parentAgain.get('child');
          ok(childAgain);
          equal(childAgain.get('foo'), 'bar');
          const child2Again = parentAgain.get('child2');
          equal(child2Again.length, 1);
          ok(child2Again);
          equal(child2Again[0].get('hello'), 'world');
          done();
        });
      });
    });
  });

  it('includeAll pointer and pointer array', function (done) {
    const child = new TestObject();
    const child2 = new TestObject();
    child.set('foo', 'bar');
    child2.set('hello', 'world');
    Parse.Object.saveAll([child, child2]).then(function () {
      const parent = new Container();
      parent.set('child', child.toPointer());
      parent.set('child2', [child2.toPointer()]);
      parent.save().then(function () {
        const query = new Parse.Query(Container);
        query.includeAll();
        query.find().then(function (results) {
          equal(results.length, 1);
          const parentAgain = results[0];
          const childAgain = parentAgain.get('child');
          ok(childAgain);
          equal(childAgain.get('foo'), 'bar');
          const child2Again = parentAgain.get('child2');
          equal(child2Again.length, 1);
          ok(child2Again);
          equal(child2Again[0].get('hello'), 'world');
          done();
        });
      });
    });
  });

  it('select nested keys 2 level includeAll', done => {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    const Bazoo = new Parse.Object('Bazoo');
    const Tang = new Parse.Object('Tang');

    Bazoo.set('some', 'thing');
    Bazoo.set('otherSome', 'value');
    Bazoo.save()
      .then(() => {
        BarBaz.set('key', 'value');
        BarBaz.set('otherKey', 'value');
        BarBaz.set('bazoo', Bazoo);
        return BarBaz.save();
      })
      .then(() => {
        Tang.set('clan', 'wu');
        return Tang.save();
      })
      .then(() => {
        Foobar.set('foo', 'bar');
        Foobar.set('fizz', 'buzz');
        Foobar.set('barBaz', BarBaz);
        Foobar.set('group', Tang);
        return Foobar.save();
      })
      .then(savedFoobar => {
        const options = Object.assign(
          {
            url: Parse.serverURL + '/classes/Foobar',
          },
          masterKeyOptions,
          {
            qs: {
              where: JSON.stringify({ objectId: savedFoobar.id }),
              includeAll: true,
              keys: 'fizz,barBaz.key,barBaz.bazoo.some',
            },
          }
        );
        return request(options);
      })
      .then(resp => {
        const result = resp.data.results[0];
        equal(result.group.clan, 'wu');
        equal(result.foo, undefined);
        equal(result.fizz, 'buzz');
        equal(result.barBaz.key, 'value');
        equal(result.barBaz.otherKey, undefined);
        equal(result.barBaz.bazoo.some, 'thing');
        equal(result.barBaz.bazoo.otherSome, undefined);
        done();
      })
      .catch(done.fail);
  });

  it('select nested keys 2 level without include (issue #3185)', function (done) {
    const Foobar = new Parse.Object('Foobar');
    const BarBaz = new Parse.Object('Barbaz');
    const Bazoo = new Parse.Object('Bazoo');

    Bazoo.set('some', 'thing');
    Bazoo.set('otherSome', 'value');
    Bazoo.save()
      .then(() => {
        BarBaz.set('key', 'value');
        BarBaz.set('otherKey', 'value');
        BarBaz.set('bazoo', Bazoo);
        return BarBaz.save();
      })
      .then(() => {
        Foobar.set('foo', 'bar');
        Foobar.set('fizz', 'buzz');
        Foobar.set('barBaz', BarBaz);
        return Foobar.save();
      })
      .then(function (savedFoobar) {
        const foobarQuery = new Parse.Query('Foobar');
        foobarQuery.select(['fizz', 'barBaz.key', 'barBaz.bazoo.some']);
        return foobarQuery.get(savedFoobar.id);
      })
      .then(foobarObj => {
        equal(foobarObj.get('fizz'), 'buzz');
        equal(foobarObj.get('foo'), undefined);
        if (foobarObj.has('barBaz')) {
          equal(foobarObj.get('barBaz').get('key'), 'value');
          equal(foobarObj.get('barBaz').get('otherKey'), undefined);
          if (foobarObj.get('barBaz').has('bazoo')) {
            equal(foobarObj.get('barBaz').get('bazoo').get('some'), 'thing');
            equal(foobarObj.get('barBaz').get('bazoo').get('otherSome'), undefined);
          } else {
            fail('bazoo should be set');
          }
        } else {
          fail('barBaz should be set');
        }
        done();
      });
  });

  it('properly handles nested ors', function (done) {
    const objects = [];
    while (objects.length != 4) {
      const obj = new Parse.Object('Object');
      obj.set('x', objects.length);
      objects.push(obj);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const q0 = new Parse.Query('Object');
        q0.equalTo('x', 0);
        const q1 = new Parse.Query('Object');
        q1.equalTo('x', 1);
        const q2 = new Parse.Query('Object');
        q2.equalTo('x', 2);
        const or01 = Parse.Query.or(q0, q1);
        return Parse.Query.or(or01, q2).find();
      })
      .then(results => {
        expect(results.length).toBe(3);
        done();
      })
      .catch(error => {
        fail('should not fail');
        jfail(error);
        done();
      });
  });

  it('should not depend on parameter order #3169', function (done) {
    const score1 = new Parse.Object('Score', { scoreId: '1' });
    const score2 = new Parse.Object('Score', { scoreId: '2' });
    const game1 = new Parse.Object('Game', { gameId: '1' });
    const game2 = new Parse.Object('Game', { gameId: '2' });
    Parse.Object.saveAll([score1, score2, game1, game2])
      .then(() => {
        game1.set('score', [score1]);
        game2.set('score', [score2]);
        return Parse.Object.saveAll([game1, game2]);
      })
      .then(() => {
        const where = {
          score: {
            objectId: score1.id,
            className: 'Score',
            __type: 'Pointer',
          },
        };
        return request({
          method: 'POST',
          url: Parse.serverURL + '/classes/Game',
          body: { where, _method: 'GET' },
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Javascript-Key': Parse.javaScriptKey,
            'Content-Type': 'application/json',
          },
        });
      })
      .then(
        response => {
          const results = response.data;
          expect(results.results.length).toBe(1);
          done();
        },
        res => done.fail(res.data)
      );
  });

  it('should not interfere with has when using select on field with undefined value #3999', done => {
    const obj1 = new Parse.Object('TestObject');
    const obj2 = new Parse.Object('OtherObject');
    obj2.set('otherField', 1);
    obj1.set('testPointerField', obj2);
    obj1.set('shouldBe', true);
    const obj3 = new Parse.Object('TestObject');
    obj3.set('shouldBe', false);
    Parse.Object.saveAll([obj1, obj3])
      .then(() => {
        const query = new Parse.Query('TestObject');
        query.include('testPointerField');
        query.select(['testPointerField', 'testPointerField.otherField', 'shouldBe']);
        return query.find();
      })
      .then(results => {
        results.forEach(result => {
          equal(result.has('testPointerField'), result.get('shouldBe'));
        });
        done();
      })
      .catch(done.fail);
  });

  it_only_db('mongo')('should handle relative times correctly', function (done) {
    const now = Date.now();
    const obj1 = new Parse.Object('MyCustomObject', {
      name: 'obj1',
      ttl: new Date(now + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });
    const obj2 = new Parse.Object('MyCustomObject', {
      name: 'obj2',
      ttl: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    });

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: 'in 1 day' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(1);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: '1 day ago' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(1);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.lessThan('ttl', { $relativeTime: '5 days ago' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(0);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: '3 days ago' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(2);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: 'now' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(1);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: 'now' });
        q.lessThan('ttl', { $relativeTime: 'in 1 day' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(0);
      })
      .then(() => {
        const q = new Parse.Query('MyCustomObject');
        q.greaterThan('ttl', { $relativeTime: '1 year 3 weeks ago' });
        return q.find({ useMasterKey: true });
      })
      .then(results => {
        expect(results.length).toBe(2);
      })
      .then(done, done.fail);
  });

  it_only_db('mongo')('should error on invalid relative time', function (done) {
    const obj1 = new Parse.Object('MyCustomObject', {
      name: 'obj1',
      ttl: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });

    const q = new Parse.Query('MyCustomObject');
    q.greaterThan('ttl', { $relativeTime: '-12 bananas ago' });
    obj1
      .save({ useMasterKey: true })
      .then(() => q.find({ useMasterKey: true }))
      .then(done.fail, () => done());
  });

  it_only_db('mongo')('should error when using $relativeTime on non-Date field', function (done) {
    const obj1 = new Parse.Object('MyCustomObject', {
      name: 'obj1',
      nonDateField: 'abcd',
      ttl: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });

    const q = new Parse.Query('MyCustomObject');
    q.greaterThan('nonDateField', { $relativeTime: '1 day ago' });
    obj1
      .save({ useMasterKey: true })
      .then(() => q.find({ useMasterKey: true }))
      .then(done.fail, () => done());
  });

  it('should match complex structure with dot notation when using matchesKeyInQuery', function (done) {
    const group1 = new Parse.Object('Group', {
      name: 'Group #1',
    });

    const group2 = new Parse.Object('Group', {
      name: 'Group #2',
    });

    Parse.Object.saveAll([group1, group2])
      .then(() => {
        const role1 = new Parse.Object('Role', {
          name: 'Role #1',
          type: 'x',
          belongsTo: group1,
        });

        const role2 = new Parse.Object('Role', {
          name: 'Role #2',
          type: 'y',
          belongsTo: group1,
        });

        return Parse.Object.saveAll([role1, role2]);
      })
      .then(() => {
        const rolesOfTypeX = new Parse.Query('Role');
        rolesOfTypeX.equalTo('type', 'x');

        const groupsWithRoleX = new Parse.Query('Group');
        groupsWithRoleX.matchesKeyInQuery('objectId', 'belongsTo.objectId', rolesOfTypeX);

        groupsWithRoleX.find().then(function (results) {
          equal(results.length, 1);
          equal(results[0].get('name'), group1.get('name'));
          done();
        });
      });
  });

  it('should match complex structure with dot notation when using doesNotMatchKeyInQuery', function (done) {
    const group1 = new Parse.Object('Group', {
      name: 'Group #1',
    });

    const group2 = new Parse.Object('Group', {
      name: 'Group #2',
    });

    Parse.Object.saveAll([group1, group2])
      .then(() => {
        const role1 = new Parse.Object('Role', {
          name: 'Role #1',
          type: 'x',
          belongsTo: group1,
        });

        const role2 = new Parse.Object('Role', {
          name: 'Role #2',
          type: 'y',
          belongsTo: group1,
        });

        return Parse.Object.saveAll([role1, role2]);
      })
      .then(() => {
        const rolesOfTypeX = new Parse.Query('Role');
        rolesOfTypeX.equalTo('type', 'x');

        const groupsWithRoleX = new Parse.Query('Group');
        groupsWithRoleX.doesNotMatchKeyInQuery('objectId', 'belongsTo.objectId', rolesOfTypeX);

        groupsWithRoleX.find().then(function (results) {
          equal(results.length, 1);
          equal(results[0].get('name'), group2.get('name'));
          done();
        });
      });
  });

  it('should not throw error with undefined dot notation when using matchesKeyInQuery', async () => {
    const group = new Parse.Object('Group', { name: 'Group #1' });
    await group.save();

    const role1 = new Parse.Object('Role', {
      name: 'Role #1',
      type: 'x',
      belongsTo: group,
    });

    const role2 = new Parse.Object('Role', {
      name: 'Role #2',
      type: 'y',
      belongsTo: undefined,
    });
    await Parse.Object.saveAll([role1, role2]);

    const rolesOfTypeX = new Parse.Query('Role');
    rolesOfTypeX.equalTo('type', 'x');

    const groupsWithRoleX = new Parse.Query('Group');
    groupsWithRoleX.matchesKeyInQuery('objectId', 'belongsTo.objectId', rolesOfTypeX);

    const results = await groupsWithRoleX.find();
    equal(results.length, 1);
    equal(results[0].get('name'), group.get('name'));
  });

  it('should not throw error with undefined dot notation when using doesNotMatchKeyInQuery', async () => {
    const group1 = new Parse.Object('Group', { name: 'Group #1' });
    const group2 = new Parse.Object('Group', { name: 'Group #2' });
    await Parse.Object.saveAll([group1, group2]);

    const role1 = new Parse.Object('Role', {
      name: 'Role #1',
      type: 'x',
      belongsTo: group1,
    });

    const role2 = new Parse.Object('Role', {
      name: 'Role #2',
      type: 'y',
      belongsTo: undefined,
    });
    await Parse.Object.saveAll([role1, role2]);

    const rolesOfTypeX = new Parse.Query('Role');
    rolesOfTypeX.equalTo('type', 'x');

    const groupsWithRoleX = new Parse.Query('Group');
    groupsWithRoleX.doesNotMatchKeyInQuery('objectId', 'belongsTo.objectId', rolesOfTypeX);

    const results = await groupsWithRoleX.find();
    equal(results.length, 1);
    equal(results[0].get('name'), group2.get('name'));
  });

  it('withJSON supports geoWithin.centerSphere', done => {
    const inbound = new Parse.GeoPoint(1.5, 1.5);
    const onbound = new Parse.GeoPoint(10, 10);
    const outbound = new Parse.GeoPoint(20, 20);
    const obj1 = new Parse.Object('TestObject', { location: inbound });
    const obj2 = new Parse.Object('TestObject', { location: onbound });
    const obj3 = new Parse.Object('TestObject', { location: outbound });
    const center = new Parse.GeoPoint(0, 0);
    const distanceInKilometers = 1569 + 1; // 1569km is the approximate distance between {0, 0} and {10, 10}.
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        const q = new Parse.Query(TestObject);
        const jsonQ = q.toJSON();
        jsonQ.where.location = {
          $geoWithin: {
            $centerSphere: [center, distanceInKilometers / 6371.0],
          },
        };
        q.withJSON(jsonQ);
        return q.find();
      })
      .then(results => {
        equal(results.length, 2);
        const q = new Parse.Query(TestObject);
        const jsonQ = q.toJSON();
        jsonQ.where.location = {
          $geoWithin: {
            $centerSphere: [[0, 0], distanceInKilometers / 6371.0],
          },
        };
        q.withJSON(jsonQ);
        return q.find();
      })
      .then(results => {
        equal(results.length, 2);
        done();
      })
      .catch(error => {
        fail(error);
        done();
      });
  });

  it('withJSON with geoWithin.centerSphere fails without parameters', done => {
    const q = new Parse.Query(TestObject);
    const jsonQ = q.toJSON();
    jsonQ.where.location = {
      $geoWithin: {
        $centerSphere: [],
      },
    };
    q.withJSON(jsonQ);
    q.find()
      .then(done.fail)
      .catch(e => expect(e.code).toBe(Parse.Error.INVALID_JSON))
      .then(done);
  });

  it('withJSON with geoWithin.centerSphere fails with invalid distance', done => {
    const q = new Parse.Query(TestObject);
    const jsonQ = q.toJSON();
    jsonQ.where.location = {
      $geoWithin: {
        $centerSphere: [[0, 0], 'invalid_distance'],
      },
    };
    q.withJSON(jsonQ);
    q.find()
      .then(done.fail)
      .catch(e => expect(e.code).toBe(Parse.Error.INVALID_JSON))
      .then(done);
  });

  it('withJSON with geoWithin.centerSphere fails with invalid coordinate', done => {
    const q = new Parse.Query(TestObject);
    const jsonQ = q.toJSON();
    jsonQ.where.location = {
      $geoWithin: {
        $centerSphere: [[-190, -190], 1],
      },
    };
    q.withJSON(jsonQ);
    q.find()
      .then(done.fail)
      .catch(() => done());
  });

  it('withJSON with geoWithin.centerSphere fails with invalid geo point', done => {
    const q = new Parse.Query(TestObject);
    const jsonQ = q.toJSON();
    jsonQ.where.location = {
      $geoWithin: {
        $centerSphere: [{ longitude: 0, dummytude: 0 }, 1],
      },
    };
    q.withJSON(jsonQ);
    q.find()
      .then(done.fail)
      .catch(() => done());
  });

  it('can add new config to existing config', async () => {
    await request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: {
        params: {
          files: [{ __type: 'File', name: 'name', url: 'http://url' }],
        },
      },
      headers: masterKeyHeaders,
    });

    await request({
      method: 'PUT',
      url: 'http://localhost:8378/1/config',
      json: true,
      body: {
        params: { newConfig: 'good' },
      },
      headers: masterKeyHeaders,
    });

    const result = await Parse.Config.get();
    equal(result.get('files')[0].toJSON(), {
      __type: 'File',
      name: 'name',
      url: 'http://url',
    });
    equal(result.get('newConfig'), 'good');
  });

  it('can set object type key', async () => {
    const data = { bar: true, baz: 100 };
    const object = new TestObject();
    object.set('objectField', data);
    await object.save();

    const query = new Parse.Query(TestObject);
    let result = await query.get(object.id);
    equal(result.get('objectField'), data);

    object.set('objectField.baz', 50, { ignoreValidation: true });
    await object.save();

    result = await query.get(object.id);
    equal(result.get('objectField'), { bar: true, baz: 50 });
  });

  it('can update numeric array', async () => {
    const data1 = [0, 1.1, 1, -2, 3];
    const data2 = [0, 1.1, 1, -2, 3, 4];
    const obj1 = new TestObject();
    obj1.set('array', data1);
    await obj1.save();
    equal(obj1.get('array'), data1);

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', obj1.id);

    const result = await query.first();
    equal(result.get('array'), data1);

    result.set('array', data2);
    equal(result.get('array'), data2);
    await result.save();
    equal(result.get('array'), data2);

    const results = await query.find();
    equal(results[0].get('array'), data2);
  });

  it('can update mixed array', async () => {
    const data1 = [0, 1.1, 'hello world', { foo: 'bar' }];
    const data2 = [0, 1, { foo: 'bar' }, [], [1, 2, 'bar']];
    const obj1 = new TestObject();
    obj1.set('array', data1);
    await obj1.save();
    equal(obj1.get('array'), data1);

    const query = new Parse.Query(TestObject);
    query.equalTo('objectId', obj1.id);

    const result = await query.first();
    equal(result.get('array'), data1);

    result.set('array', data2);
    equal(result.get('array'), data2);

    await result.save();
    equal(result.get('array'), data2);

    const results = await query.find();
    equal(results[0].get('array'), data2);
  });

  it('can query regex with unicode', async () => {
    const object = new TestObject();
    object.set('field', 'autoöo');
    await object.save();

    const query = new Parse.Query(TestObject);
    query.contains('field', 'autoöo');
    const results = await query.find();

    expect(results.length).toBe(1);
    expect(results[0].get('field')).toBe('autoöo');
  });

  it('can update mixed array more than 100 elements', async () => {
    const array = [0, 1.1, 'hello world', { foo: 'bar' }, null];
    const obj = new TestObject({ array });
    await obj.save();

    const query = new Parse.Query(TestObject);
    const result = await query.get(obj.id);
    equal(result.get('array').length, 5);

    for (let i = 0; i < 100; i += 1) {
      array.push(i);
    }
    obj.set('array', array);
    await obj.save();

    const results = await query.find();
    equal(results[0].get('array').length, 105);
  });

  xit('todo: exclude keys with select key (sdk query get)', async done => {
    // there is some problem with js sdk caching

    const obj = new TestObject({ foo: 'baz', hello: 'world' });
    await obj.save();

    const query = new Parse.Query('TestObject');

    query.withJSON({
      keys: 'hello',
      excludeKeys: 'hello',
    });

    const object = await query.get(obj.id);
    expect(object.get('foo')).toBeUndefined();
    expect(object.get('hello')).toBeUndefined();
    done();
  });

  it_only_db('mongo')('can use explain on User class', async () => {
    // Create user
    const user = new Parse.User();
    user.set('username', 'foo');
    user.set('password', 'bar');
    await user.save();
    // Query for user with explain
    const query = new Parse.Query('_User');
    query.equalTo('objectId', user.id);
    query.explain();
    const results = await query.find();
    // Validate
    expect(results[0].executionStats).not.toBeUndefined();
  });
});
