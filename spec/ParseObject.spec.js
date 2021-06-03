'use strict';
// This is a port of the test suite:
// hungry/js/test/parse_object_test.js
//
// Things we didn't port:
// Tests that aren't async, because they only test the client.
// Tests that use Relations, because we intentionally do not support
// relations.
// Tests that use 'testDestroy', because they have a complex
// dependency on the terrible qunit start/stop mechanism.
// Tests for unfetching, since that behaves differently in
// single-instance mode and we don't want these tests to run in
// single-instance mode.

describe('Parse.Object testing', () => {
  it('create', function (done) {
    create({ test: 'test' }, function (model) {
      ok(model.id, 'Should have an objectId set');
      equal(model.get('test'), 'test', 'Should have the right attribute');
      done();
    });
  });

  it('update', function (done) {
    create({ test: 'test' }, function (model) {
      const t2 = new TestObject({ objectId: model.id });
      t2.set('test', 'changed');
      t2.save().then(function (model) {
        equal(model.get('test'), 'changed', 'Update should have succeeded');
        done();
      });
    });
  });

  it('save without null', function (done) {
    const object = new TestObject();
    object.set('favoritePony', 'Rainbow Dash');
    object.save().then(
      function (objectAgain) {
        equal(objectAgain, object);
        done();
      },
      function (objectAgain, error) {
        ok(null, 'Error ' + error.code + ': ' + error.message);
        done();
      }
    );
  });

  it('save cycle', done => {
    const a = new Parse.Object('TestObject');
    const b = new Parse.Object('TestObject');
    a.set('b', b);
    a.save()
      .then(function () {
        b.set('a', a);
        return b.save();
      })
      .then(function () {
        ok(a.id);
        ok(b.id);
        strictEqual(a.get('b'), b);
        strictEqual(b.get('a'), a);
      })
      .then(
        function () {
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('get', function (done) {
    create({ test: 'test' }, function (model) {
      const t2 = new TestObject({ objectId: model.id });
      t2.fetch().then(function (model2) {
        equal(model2.get('test'), 'test', 'Update should have succeeded');
        ok(model2.id);
        equal(model2.id, model.id, 'Ids should match');
        done();
      });
    });
  });

  it('delete', function (done) {
    const t = new TestObject();
    t.set('test', 'test');
    t.save().then(function () {
      t.destroy().then(function () {
        const t2 = new TestObject({ objectId: t.id });
        t2.fetch().then(fail, () => done());
      });
    });
  });

  it('find', function (done) {
    const t = new TestObject();
    t.set('foo', 'bar');
    t.save().then(function () {
      const query = new Parse.Query(TestObject);
      query.equalTo('foo', 'bar');
      query.find().then(function (results) {
        equal(results.length, 1);
        done();
      });
    });
  });

  it('relational fields', function (done) {
    const item = new Item();
    item.set('property', 'x');
    const container = new Container();
    container.set('item', item);

    Parse.Object.saveAll([item, container]).then(function () {
      const query = new Parse.Query(Container);
      query.find().then(function (results) {
        equal(results.length, 1);
        const containerAgain = results[0];
        const itemAgain = containerAgain.get('item');
        itemAgain.fetch().then(function () {
          equal(itemAgain.get('property'), 'x');
          done();
        });
      });
    });
  });

  it('save adds no data keys (other than createdAt and updatedAt)', function (done) {
    const object = new TestObject();
    object.save().then(function () {
      const keys = Object.keys(object.attributes).sort();
      equal(keys.length, 2);
      done();
    });
  });

  it('recursive save', function (done) {
    const item = new Item();
    item.set('property', 'x');
    const container = new Container();
    container.set('item', item);

    container.save().then(function () {
      const query = new Parse.Query(Container);
      query.find().then(function (results) {
        equal(results.length, 1);
        const containerAgain = results[0];
        const itemAgain = containerAgain.get('item');
        itemAgain.fetch().then(function () {
          equal(itemAgain.get('property'), 'x');
          done();
        });
      });
    });
  });

  it('fetch', function (done) {
    const item = new Item({ foo: 'bar' });
    item.save().then(function () {
      const itemAgain = new Item();
      itemAgain.id = item.id;
      itemAgain.fetch().then(function () {
        itemAgain.save({ foo: 'baz' }).then(function () {
          item.fetch().then(function () {
            equal(item.get('foo'), itemAgain.get('foo'));
            done();
          });
        });
      });
    });
  });

  it("createdAt doesn't change", function (done) {
    const object = new TestObject({ foo: 'bar' });
    object.save().then(function () {
      const objectAgain = new TestObject();
      objectAgain.id = object.id;
      objectAgain.fetch().then(function () {
        equal(object.createdAt.getTime(), objectAgain.createdAt.getTime());
        done();
      });
    });
  });

  it('createdAt and updatedAt exposed', function (done) {
    const object = new TestObject({ foo: 'bar' });
    object.save().then(function () {
      notEqual(object.updatedAt, undefined);
      notEqual(object.createdAt, undefined);
      done();
    });
  });

  it('updatedAt gets updated', function (done) {
    const object = new TestObject({ foo: 'bar' });
    object.save().then(function () {
      ok(object.updatedAt, 'initial save should cause updatedAt to exist');
      const firstUpdatedAt = object.updatedAt;
      object.save({ foo: 'baz' }).then(function () {
        ok(object.updatedAt, 'two saves should cause updatedAt to exist');
        notEqual(firstUpdatedAt, object.updatedAt);
        done();
      });
    });
  });

  it('createdAt is reasonable', function (done) {
    const startTime = new Date();
    const object = new TestObject({ foo: 'bar' });
    object.save().then(function () {
      const endTime = new Date();
      const startDiff = Math.abs(startTime.getTime() - object.createdAt.getTime());
      ok(startDiff < 5000);

      const endDiff = Math.abs(endTime.getTime() - object.createdAt.getTime());
      ok(endDiff < 5000);

      done();
    });
  });

  it_exclude_dbs(['postgres'])('can set null', function (done) {
    const obj = new Parse.Object('TestObject');
    obj.set('foo', null);
    obj.save().then(
      function (obj) {
        on_db('mongo', () => {
          equal(obj.get('foo'), null);
        });
        on_db('postgres', () => {
          fail('should not succeed');
        });
        done();
      },
      function () {
        fail('should not fail');
        done();
      }
    );
  });

  it('can set boolean', function (done) {
    const obj = new Parse.Object('TestObject');
    obj.set('yes', true);
    obj.set('no', false);
    obj.save().then(
      function (obj) {
        equal(obj.get('yes'), true);
        equal(obj.get('no'), false);
        done();
      },
      function (obj, error) {
        ok(false, error.message);
        done();
      }
    );
  });

  it('cannot set invalid date', async function (done) {
    const obj = new Parse.Object('TestObject');
    obj.set('when', new Date(Date.parse(null)));
    try {
      await obj.save();
    } catch (e) {
      ok(true);
      done();
      return;
    }
    ok(false, 'Saving an invalid date should throw');
    done();
  });

  it('can set authData when not user class', async () => {
    const obj = new Parse.Object('TestObject');
    obj.set('authData', 'random');
    await obj.save();
    expect(obj.get('authData')).toBe('random');
    const query = new Parse.Query('TestObject');
    const object = await query.get(obj.id, { useMasterKey: true });
    expect(object.get('authData')).toBe('random');
  });

  it('invalid class name', function (done) {
    const item = new Parse.Object('Foo^bar');
    item.save().then(
      function () {
        ok(false, 'The name should have been invalid.');
        done();
      },
      function () {
        // Because the class name is invalid, the router will not be able to route
        // it, so it will actually return a -1 error code.
        // equal(error.code, Parse.Error.INVALID_CLASS_NAME);
        done();
      }
    );
  });

  it('invalid key name', function (done) {
    const item = new Parse.Object('Item');
    ok(!item.set({ 'foo^bar': 'baz' }), 'Item should not be updated with invalid key.');
    item.save({ 'foo^bar': 'baz' }).then(fail, () => done());
  });

  it('invalid __type', function (done) {
    const item = new Parse.Object('Item');
    const types = ['Pointer', 'File', 'Date', 'GeoPoint', 'Bytes', 'Polygon', 'Relation'];
    const tests = types.map(type => {
      const test = new Parse.Object('Item');
      test.set('foo', {
        __type: type,
      });
      return test;
    });
    const next = function (index) {
      if (index < tests.length) {
        tests[index].save().then(fail, error => {
          expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);
          next(index + 1);
        });
      } else {
        done();
      }
    };
    item
      .save({
        foo: {
          __type: 'IvalidName',
        },
      })
      .then(fail, () => next(0));
  });

  it('simple field deletion', function (done) {
    const simple = new Parse.Object('SimpleObject');
    simple
      .save({
        foo: 'bar',
      })
      .then(
        function (simple) {
          simple.unset('foo');
          ok(!simple.has('foo'), 'foo should have been unset.');
          ok(simple.dirty('foo'), 'foo should be dirty.');
          ok(simple.dirty(), 'the whole object should be dirty.');
          simple.save().then(
            function (simple) {
              ok(!simple.has('foo'), 'foo should have been unset.');
              ok(!simple.dirty('foo'), 'the whole object was just saved.');
              ok(!simple.dirty(), 'the whole object was just saved.');

              const query = new Parse.Query('SimpleObject');
              query.get(simple.id).then(
                function (simpleAgain) {
                  ok(!simpleAgain.has('foo'), 'foo should have been removed.');
                  done();
                },
                function (simpleAgain, error) {
                  ok(false, 'Error ' + error.code + ': ' + error.message);
                  done();
                }
              );
            },
            function (simple, error) {
              ok(false, 'Error ' + error.code + ': ' + error.message);
              done();
            }
          );
        },
        function (simple, error) {
          ok(false, 'Error ' + error.code + ': ' + error.message);
          done();
        }
      );
  });

  it('field deletion before first save', function (done) {
    const simple = new Parse.Object('SimpleObject');
    simple.set('foo', 'bar');
    simple.unset('foo');

    ok(!simple.has('foo'), 'foo should have been unset.');
    ok(simple.dirty('foo'), 'foo should be dirty.');
    ok(simple.dirty(), 'the whole object should be dirty.');
    simple.save().then(
      function (simple) {
        ok(!simple.has('foo'), 'foo should have been unset.');
        ok(!simple.dirty('foo'), 'the whole object was just saved.');
        ok(!simple.dirty(), 'the whole object was just saved.');

        const query = new Parse.Query('SimpleObject');
        query.get(simple.id).then(
          function (simpleAgain) {
            ok(!simpleAgain.has('foo'), 'foo should have been removed.');
            done();
          },
          function (simpleAgain, error) {
            ok(false, 'Error ' + error.code + ': ' + error.message);
            done();
          }
        );
      },
      function (simple, error) {
        ok(false, 'Error ' + error.code + ': ' + error.message);
        done();
      }
    );
  });

  it('relation deletion', function (done) {
    const simple = new Parse.Object('SimpleObject');
    const child = new Parse.Object('Child');
    simple
      .save({
        child: child,
      })
      .then(
        function (simple) {
          simple.unset('child');
          ok(!simple.has('child'), 'child should have been unset.');
          ok(simple.dirty('child'), 'child should be dirty.');
          ok(simple.dirty(), 'the whole object should be dirty.');
          simple.save().then(
            function (simple) {
              ok(!simple.has('child'), 'child should have been unset.');
              ok(!simple.dirty('child'), 'the whole object was just saved.');
              ok(!simple.dirty(), 'the whole object was just saved.');

              const query = new Parse.Query('SimpleObject');
              query.get(simple.id).then(
                function (simpleAgain) {
                  ok(!simpleAgain.has('child'), 'child should have been removed.');
                  done();
                },
                function (simpleAgain, error) {
                  ok(false, 'Error ' + error.code + ': ' + error.message);
                  done();
                }
              );
            },
            function (simple, error) {
              ok(false, 'Error ' + error.code + ': ' + error.message);
              done();
            }
          );
        },
        function (simple, error) {
          ok(false, 'Error ' + error.code + ': ' + error.message);
          done();
        }
      );
  });

  it('deleted keys get cleared', function (done) {
    const simpleObject = new Parse.Object('SimpleObject');
    simpleObject.set('foo', 'bar');
    simpleObject.unset('foo');
    simpleObject.save().then(function (simpleObject) {
      simpleObject.set('foo', 'baz');
      simpleObject.save().then(function (simpleObject) {
        const query = new Parse.Query('SimpleObject');
        query.get(simpleObject.id).then(function (simpleObjectAgain) {
          equal(simpleObjectAgain.get('foo'), 'baz');
          done();
        }, done.fail);
      }, done.fail);
    }, done.fail);
  });

  it('setting after deleting', function (done) {
    const simpleObject = new Parse.Object('SimpleObject');
    simpleObject.set('foo', 'bar');
    simpleObject.save().then(
      function (simpleObject) {
        simpleObject.unset('foo');
        simpleObject.set('foo', 'baz');
        simpleObject.save().then(
          function (simpleObject) {
            const query = new Parse.Query('SimpleObject');
            query.get(simpleObject.id).then(
              function (simpleObjectAgain) {
                equal(simpleObjectAgain.get('foo'), 'baz');
                done();
              },
              function (error) {
                ok(false, 'Error ' + error.code + ': ' + error.message);
                done();
              }
            );
          },
          function (error) {
            ok(false, 'Error ' + error.code + ': ' + error.message);
            done();
          }
        );
      },
      function (error) {
        ok(false, 'Error ' + error.code + ': ' + error.message);
        done();
      }
    );
  });

  it('increment', function (done) {
    const simple = new Parse.Object('SimpleObject');
    simple
      .save({
        foo: 5,
      })
      .then(function (simple) {
        simple.increment('foo');
        equal(simple.get('foo'), 6);
        ok(simple.dirty('foo'), 'foo should be dirty.');
        ok(simple.dirty(), 'the whole object should be dirty.');
        simple.save().then(function (simple) {
          equal(simple.get('foo'), 6);
          ok(!simple.dirty('foo'), 'the whole object was just saved.');
          ok(!simple.dirty(), 'the whole object was just saved.');

          const query = new Parse.Query('SimpleObject');
          query.get(simple.id).then(function (simpleAgain) {
            equal(simpleAgain.get('foo'), 6);
            done();
          });
        });
      });
  });

  it('addUnique', function (done) {
    const x1 = new Parse.Object('X');
    x1.set('stuff', [1, 2]);
    x1.save()
      .then(() => {
        const objectId = x1.id;
        const x2 = new Parse.Object('X', { objectId: objectId });
        x2.addUnique('stuff', 2);
        x2.addUnique('stuff', 4);
        expect(x2.get('stuff')).toEqual([2, 4]);
        return x2.save();
      })
      .then(() => {
        const query = new Parse.Query('X');
        return query.get(x1.id);
      })
      .then(
        x3 => {
          const stuff = x3.get('stuff');
          const expected = [1, 2, 4];
          expect(stuff.length).toBe(expected.length);
          for (const i of stuff) {
            expect(expected.indexOf(i) >= 0).toBe(true);
          }
          done();
        },
        error => {
          on_db('mongo', () => {
            jfail(error);
          });
          on_db('postgres', () => {
            expect(error.message).toEqual('Postgres does not support AddUnique operator.');
          });
          done();
        }
      );
  });

  it('addUnique with object', function (done) {
    const x1 = new Parse.Object('X');
    x1.set('stuff', [1, { hello: 'world' }, { foo: 'bar' }]);
    x1.save()
      .then(() => {
        const objectId = x1.id;
        const x2 = new Parse.Object('X', { objectId: objectId });
        x2.addUnique('stuff', { hello: 'world' });
        x2.addUnique('stuff', { bar: 'baz' });
        expect(x2.get('stuff')).toEqual([{ hello: 'world' }, { bar: 'baz' }]);
        return x2.save();
      })
      .then(() => {
        const query = new Parse.Query('X');
        return query.get(x1.id);
      })
      .then(
        x3 => {
          const stuff = x3.get('stuff');
          const target = [1, { hello: 'world' }, { foo: 'bar' }, { bar: 'baz' }];
          expect(stuff.length).toEqual(target.length);
          let found = 0;
          for (const thing in target) {
            for (const st in stuff) {
              if (st == thing) {
                found++;
              }
            }
          }
          expect(found).toBe(target.length);
          done();
        },
        error => {
          jfail(error);
          done();
        }
      );
  });

  it('removes with object', function (done) {
    const x1 = new Parse.Object('X');
    x1.set('stuff', [1, { hello: 'world' }, { foo: 'bar' }]);
    x1.save()
      .then(() => {
        const objectId = x1.id;
        const x2 = new Parse.Object('X', { objectId: objectId });
        x2.remove('stuff', { hello: 'world' });
        expect(x2.get('stuff')).toEqual([]);
        return x2.save();
      })
      .then(() => {
        const query = new Parse.Query('X');
        return query.get(x1.id);
      })
      .then(
        x3 => {
          expect(x3.get('stuff')).toEqual([1, { foo: 'bar' }]);
          done();
        },
        error => {
          jfail(error);
          done();
        }
      );
  });

  it('dirty attributes', function (done) {
    const object = new Parse.Object('TestObject');
    object.set('cat', 'good');
    object.set('dog', 'bad');
    object.save().then(
      function (object) {
        ok(!object.dirty());
        ok(!object.dirty('cat'));
        ok(!object.dirty('dog'));

        object.set('dog', 'okay');

        ok(object.dirty());
        ok(!object.dirty('cat'));
        ok(object.dirty('dog'));

        done();
      },
      function () {
        ok(false, 'This should have saved.');
        done();
      }
    );
  });

  it('dirty keys', function (done) {
    const object = new Parse.Object('TestObject');
    object.set('gogo', 'good');
    object.set('sito', 'sexy');
    ok(object.dirty());
    let dirtyKeys = object.dirtyKeys();
    equal(dirtyKeys.length, 2);
    ok(arrayContains(dirtyKeys, 'gogo'));
    ok(arrayContains(dirtyKeys, 'sito'));

    object
      .save()
      .then(function (obj) {
        ok(!obj.dirty());
        dirtyKeys = obj.dirtyKeys();
        equal(dirtyKeys.length, 0);
        ok(!arrayContains(dirtyKeys, 'gogo'));
        ok(!arrayContains(dirtyKeys, 'sito'));

        // try removing keys
        obj.unset('sito');
        ok(obj.dirty());
        dirtyKeys = obj.dirtyKeys();
        equal(dirtyKeys.length, 1);
        ok(!arrayContains(dirtyKeys, 'gogo'));
        ok(arrayContains(dirtyKeys, 'sito'));

        return obj.save();
      })
      .then(function (obj) {
        ok(!obj.dirty());
        equal(obj.get('gogo'), 'good');
        equal(obj.get('sito'), undefined);
        dirtyKeys = obj.dirtyKeys();
        equal(dirtyKeys.length, 0);
        ok(!arrayContains(dirtyKeys, 'gogo'));
        ok(!arrayContains(dirtyKeys, 'sito'));

        done();
      });
  });

  it('acl attribute', function (done) {
    Parse.User.signUp('bob', 'password').then(function (user) {
      const TestObject = Parse.Object.extend('TestObject');
      const obj = new TestObject({
        ACL: new Parse.ACL(user), // ACLs cause things like validation to run
      });
      ok(obj.get('ACL') instanceof Parse.ACL);

      obj.save().then(function (obj) {
        ok(obj.get('ACL') instanceof Parse.ACL);

        const query = new Parse.Query(TestObject);
        query.get(obj.id).then(function (obj) {
          ok(obj.get('ACL') instanceof Parse.ACL);

          const query = new Parse.Query(TestObject);
          query.find().then(function (results) {
            obj = results[0];
            ok(obj.get('ACL') instanceof Parse.ACL);

            done();
          });
        });
      });
    });
  });

  it('cannot save object with invalid field', async () => {
    const invalidFields = ['className', 'length'];
    const promises = invalidFields.map(async field => {
      const obj = new TestObject();
      obj.set(field, 'bar');
      try {
        await obj.save();
        fail('should not succeed');
      } catch (e) {
        expect(e.message).toBe(`Invalid field name: ${field}.`);
      }
    });
    await Promise.all(promises);
  });

  it('old attribute unset then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 3);
    obj.save().then(function () {
      obj.unset('x');
      obj.unset('x');
      obj.save().then(function () {
        equal(obj.has('x'), false);
        equal(obj.get('x'), undefined);
        const query = new Parse.Query(TestObject);
        query.get(obj.id).then(function (objAgain) {
          equal(objAgain.has('x'), false);
          equal(objAgain.get('x'), undefined);
          done();
        });
      });
    });
  });

  it('new attribute unset then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 5);
    obj.unset('x');
    obj.unset('x');
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('unknown attribute unset then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.unset('x');
    obj.unset('x');
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('old attribute unset then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 3);
    obj.save().then(function () {
      obj.unset('x');
      obj.clear();
      obj.save().then(function () {
        equal(obj.has('x'), false);
        equal(obj.get('x'), undefined);
        const query = new Parse.Query(TestObject);
        query.get(obj.id).then(function (objAgain) {
          equal(objAgain.has('x'), false);
          equal(objAgain.get('x'), undefined);
          done();
        });
      });
    });
  });

  it('new attribute unset then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 5);
    obj.unset('x');
    obj.clear();
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('unknown attribute unset then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.unset('x');
    obj.clear();
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('old attribute clear then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 3);
    obj.save().then(function () {
      obj.clear();
      obj.unset('x');
      obj.save().then(function () {
        equal(obj.has('x'), false);
        equal(obj.get('x'), undefined);
        const query = new Parse.Query(TestObject);
        query.get(obj.id).then(function (objAgain) {
          equal(objAgain.has('x'), false);
          equal(objAgain.get('x'), undefined);
          done();
        });
      });
    });
  });

  it('new attribute clear then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 5);
    obj.clear();
    obj.unset('x');
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('unknown attribute clear then unset', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.clear();
    obj.unset('x');
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('old attribute clear then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 3);
    obj.save().then(function () {
      obj.clear();
      obj.clear();
      obj.save().then(function () {
        equal(obj.has('x'), false);
        equal(obj.get('x'), undefined);
        const query = new Parse.Query(TestObject);
        query.get(obj.id).then(function (objAgain) {
          equal(objAgain.has('x'), false);
          equal(objAgain.get('x'), undefined);
          done();
        });
      });
    });
  });

  it('new attribute clear then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.set('x', 5);
    obj.clear();
    obj.clear();
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('unknown attribute clear then clear', function (done) {
    const TestObject = Parse.Object.extend('TestObject');
    const obj = new TestObject();
    obj.clear();
    obj.clear();
    obj.save().then(function () {
      equal(obj.has('x'), false);
      equal(obj.get('x'), undefined);
      const query = new Parse.Query(TestObject);
      query.get(obj.id).then(function (objAgain) {
        equal(objAgain.has('x'), false);
        equal(objAgain.get('x'), undefined);
        done();
      });
    });
  });

  it('saving children in an array', function (done) {
    const Parent = Parse.Object.extend('Parent');
    const Child = Parse.Object.extend('Child');

    const child1 = new Child();
    const child2 = new Child();
    const parent = new Parent();

    child1.set('name', 'jamie');
    child2.set('name', 'cersei');
    parent.set('children', [child1, child2]);

    parent.save().then(function () {
      const query = new Parse.Query(Child);
      query.ascending('name');
      query.find().then(function (results) {
        equal(results.length, 2);
        equal(results[0].get('name'), 'cersei');
        equal(results[1].get('name'), 'jamie');
        done();
      });
    }, done.fail);
  });

  it('two saves at the same time', function (done) {
    const object = new Parse.Object('TestObject');
    let firstSave = true;

    const success = function () {
      if (firstSave) {
        firstSave = false;
        return;
      }

      const query = new Parse.Query('TestObject');
      query.find().then(function (results) {
        equal(results.length, 1);
        equal(results[0].get('cat'), 'meow');
        equal(results[0].get('dog'), 'bark');
        done();
      });
    };

    object.save({ cat: 'meow' }).then(success, fail);
    object.save({ dog: 'bark' }).then(success, fail);
  });

  // The schema-checking parts of this are working.
  // We dropped the part where number can be reset to a correctly
  // typed field and saved okay, since that appears to be borked in
  // the client.
  // If this fails, it's probably a schema issue.
  it('many saves after a failure', function (done) {
    // Make a class with a number in the schema.
    const o1 = new Parse.Object('TestObject');
    o1.set('number', 1);
    let object = null;
    o1.save()
      .then(() => {
        object = new Parse.Object('TestObject');
        object.set('number', 'two');
        return object.save();
      })
      .then(fail, error => {
        expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

        object.set('other', 'foo');
        return object.save();
      })
      .then(fail, error => {
        expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

        object.set('other', 'bar');
        return object.save();
      })
      .then(fail, error => {
        expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

        done();
      });
  });

  it('is not dirty after save', function (done) {
    const obj = new Parse.Object('TestObject');
    obj.save().then(function () {
      obj.set({ content: 'x' });
      obj.fetch().then(function () {
        equal(false, obj.dirty('content'));
        done();
      });
    });
  });

  it('add with an object', function (done) {
    const child = new Parse.Object('Person');
    const parent = new Parse.Object('Person');

    Promise.resolve()
      .then(function () {
        return child.save();
      })
      .then(function () {
        parent.add('children', child);
        return parent.save();
      })
      .then(function () {
        const query = new Parse.Query('Person');
        return query.get(parent.id);
      })
      .then(function (parentAgain) {
        equal(parentAgain.get('children')[0].id, child.id);
      })
      .then(
        function () {
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('toJSON saved object', function (done) {
    create({ foo: 'bar' }, function (model) {
      const objJSON = model.toJSON();
      ok(objJSON.foo, "expected json to contain key 'foo'");
      ok(objJSON.objectId, "expected json to contain key 'objectId'");
      ok(objJSON.createdAt, "expected json to contain key 'createdAt'");
      ok(objJSON.updatedAt, "expected json to contain key 'updatedAt'");
      done();
    });
  });

  it('remove object from array', function (done) {
    const obj = new TestObject();
    obj.save().then(function () {
      const container = new TestObject();
      container.add('array', obj);
      equal(container.get('array').length, 1);
      container.save(null).then(function () {
        const objAgain = new TestObject();
        objAgain.id = obj.id;
        container.remove('array', objAgain);
        equal(container.get('array').length, 0);
        done();
      });
    });
  });

  it('async methods', function (done) {
    const obj = new TestObject();
    obj.set('time', 'adventure');

    obj
      .save()
      .then(function (obj) {
        ok(obj.id, 'objectId should not be null.');
        const objAgain = new TestObject();
        objAgain.id = obj.id;
        return objAgain.fetch();
      })
      .then(function (objAgain) {
        equal(objAgain.get('time'), 'adventure');
        return objAgain.destroy();
      })
      .then(function () {
        const query = new Parse.Query(TestObject);
        return query.find();
      })
      .then(function (results) {
        equal(results.length, 0);
      })
      .then(function () {
        done();
      });
  });

  it('fail validation with promise', function (done) {
    const PickyEater = Parse.Object.extend('PickyEater', {
      validate: function (attrs) {
        if (attrs.meal === 'tomatoes') {
          return 'Ew. Tomatoes are gross.';
        }
        return Parse.Object.prototype.validate.apply(this, arguments);
      },
    });

    const bryan = new PickyEater();
    bryan
      .save({
        meal: 'burrito',
      })
      .then(
        function () {
          return bryan.save({
            meal: 'tomatoes',
          });
        },
        function () {
          ok(false, 'Save should have succeeded.');
        }
      )
      .then(
        function () {
          ok(false, 'Save should have failed.');
        },
        function (error) {
          equal(error, 'Ew. Tomatoes are gross.');
          done();
        }
      );
  });

  it("beforeSave doesn't make object dirty with new field", function (done) {
    const restController = Parse.CoreManager.getRESTController();
    const r = restController.request;
    restController.request = function () {
      return r.apply(this, arguments).then(function (result) {
        result.aDate = { __type: 'Date', iso: '2014-06-24T06:06:06.452Z' };
        return result;
      });
    };

    const obj = new Parse.Object('Thing');
    obj
      .save()
      .then(function () {
        ok(!obj.dirty(), 'The object should not be dirty');
        ok(obj.get('aDate'));
      })
      .then(function () {
        restController.request = r;
        done();
      });
  });

  xit("beforeSave doesn't make object dirty with existing field", function (done) {
    const restController = Parse.CoreManager.getRESTController();
    const r = restController.request;
    restController.request = function () {
      return r.apply(restController, arguments).then(function (result) {
        result.aDate = { __type: 'Date', iso: '2014-06-24T06:06:06.452Z' };
        return result;
      });
    };

    const now = new Date();

    const obj = new Parse.Object('Thing');
    const promise = obj.save();
    obj.set('aDate', now);

    promise
      .then(function () {
        ok(obj.dirty(), 'The object should be dirty');
        equal(now, obj.get('aDate'));
      })
      .then(function () {
        restController.request = r;
        done();
      });
  });

  it('bytes work', function (done) {
    Promise.resolve()
      .then(function () {
        const obj = new TestObject();
        obj.set('bytes', { __type: 'Bytes', base64: 'ZnJveW8=' });
        return obj.save();
      })
      .then(function (obj) {
        const query = new Parse.Query(TestObject);
        return query.get(obj.id);
      })
      .then(
        function (obj) {
          equal(obj.get('bytes').__type, 'Bytes');
          equal(obj.get('bytes').base64, 'ZnJveW8=');
          done();
        },
        function (error) {
          ok(false, JSON.stringify(error));
          done();
        }
      );
  });

  it('destroyAll no objects', function (done) {
    Parse.Object.destroyAll([])
      .then(function (success) {
        ok(success, 'Should be able to destroy no objects');
        done();
      })
      .catch(done.fail);
  });

  it('destroyAll new objects only', function (done) {
    const objects = [new TestObject(), new TestObject()];
    Parse.Object.destroyAll(objects)
      .then(function (success) {
        ok(success, 'Should be able to destroy only new objects');
        done();
      })
      .catch(done.fail);
  });

  it('fetchAll', function (done) {
    const numItems = 11;
    const container = new Container();
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const item = new Item();
      item.set('x', i);
      items.push(item);
    }
    Parse.Object.saveAll(items)
      .then(function () {
        container.set('items', items);
        return container.save();
      })
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const itemsAgain = containerAgain.get('items');
        if (!itemsAgain || !itemsAgain.forEach) {
          fail('no itemsAgain retrieved', itemsAgain);
          done();
          return;
        }
        equal(itemsAgain.length, numItems, 'Should get the array back');
        itemsAgain.forEach(function (item, i) {
          const newValue = i * 2;
          item.set('x', newValue);
        });
        return Parse.Object.saveAll(itemsAgain);
      })
      .then(function () {
        return Parse.Object.fetchAll(items);
      })
      .then(function (fetchedItemsAgain) {
        equal(fetchedItemsAgain.length, numItems, 'Number of items fetched should not change');
        fetchedItemsAgain.forEach(function (item, i) {
          equal(item.get('x'), i * 2);
        });
        done();
      });
  });

  it('fetchAll no objects', function (done) {
    Parse.Object.fetchAll([])
      .then(function (success) {
        ok(Array.isArray(success), 'Should be able to fetchAll no objects');
        done();
      })
      .catch(done.fail);
  });

  it('fetchAll updates dates', function (done) {
    let updatedObject;
    const object = new TestObject();
    object.set('x', 7);
    object
      .save()
      .then(function () {
        const query = new Parse.Query(TestObject);
        return query.find(object.id);
      })
      .then(function (results) {
        updatedObject = results[0];
        updatedObject.set('x', 11);
        return updatedObject.save();
      })
      .then(function () {
        return Parse.Object.fetchAll([object]);
      })
      .then(function () {
        equal(object.createdAt.getTime(), updatedObject.createdAt.getTime());
        equal(object.updatedAt.getTime(), updatedObject.updatedAt.getTime());
        done();
      });
  });

  xit('fetchAll backbone-style callbacks', function (done) {
    const numItems = 11;
    const container = new Container();
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const item = new Item();
      item.set('x', i);
      items.push(item);
    }
    Parse.Object.saveAll(items)
      .then(function () {
        container.set('items', items);
        return container.save();
      })
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const itemsAgain = containerAgain.get('items');
        if (!itemsAgain || !itemsAgain.forEach) {
          fail('no itemsAgain retrieved', itemsAgain);
          done();
          return;
        }
        equal(itemsAgain.length, numItems, 'Should get the array back');
        itemsAgain.forEach(function (item, i) {
          const newValue = i * 2;
          item.set('x', newValue);
        });
        return Parse.Object.saveAll(itemsAgain);
      })
      .then(function () {
        return Parse.Object.fetchAll(items).then(
          function (fetchedItemsAgain) {
            equal(fetchedItemsAgain.length, numItems, 'Number of items fetched should not change');
            fetchedItemsAgain.forEach(function (item, i) {
              equal(item.get('x'), i * 2);
            });
            done();
          },
          function () {
            ok(false, 'Failed to fetchAll');
            done();
          }
        );
      });
  });

  it('fetchAll error on multiple classes', function (done) {
    const container = new Container();
    container.set('item', new Item());
    container.set('subcontainer', new Container());
    return container
      .save()
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const subContainerAgain = containerAgain.get('subcontainer');
        const itemAgain = containerAgain.get('item');
        const multiClassArray = [subContainerAgain, itemAgain];
        return Parse.Object.fetchAll(multiClassArray).catch(e => {
          expect(e.code).toBe(Parse.Error.INVALID_CLASS_NAME);
          done();
        });
      });
  });

  it('fetchAll error on unsaved object', async function (done) {
    const unsavedObjectArray = [new TestObject()];
    await Parse.Object.fetchAll(unsavedObjectArray).catch(e => {
      expect(e.code).toBe(Parse.Error.MISSING_OBJECT_ID);
      done();
    });
  });

  it('fetchAll error on deleted object', function (done) {
    const numItems = 11;
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const item = new Item();
      item.set('x', i);
      items.push(item);
    }
    Parse.Object.saveAll(items)
      .then(function () {
        const query = new Parse.Query(Item);
        return query.get(items[0].id);
      })
      .then(function (objectToDelete) {
        return objectToDelete.destroy();
      })
      .then(function (deletedObject) {
        const nonExistentObject = new Item({ objectId: deletedObject.id });
        const nonExistentObjectArray = [nonExistentObject, items[1]];
        return Parse.Object.fetchAll(nonExistentObjectArray).catch(e => {
          expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
          done();
        });
      });
  });

  // TODO: Verify that with Sessions, this test is wrong... A fetch on
  //       user should not bring down a session token.
  xit('fetchAll User attributes get merged', function (done) {
    let sameUser;
    let user = new Parse.User();
    user.set('username', 'asdf');
    user.set('password', 'zxcv');
    user.set('foo', 'bar');
    user
      .signUp()
      .then(function () {
        Parse.User.logOut();
        const query = new Parse.Query(Parse.User);
        return query.get(user.id);
      })
      .then(function (userAgain) {
        user = userAgain;
        sameUser = new Parse.User();
        sameUser.set('username', 'asdf');
        sameUser.set('password', 'zxcv');
        return sameUser.logIn();
      })
      .then(function () {
        ok(!user.getSessionToken(), 'user should not have a sessionToken');
        ok(sameUser.getSessionToken(), 'sameUser should have a sessionToken');
        sameUser.set('baz', 'qux');
        return sameUser.save();
      })
      .then(function () {
        return Parse.Object.fetchAll([user]);
      })
      .then(function () {
        equal(user.getSessionToken(), sameUser.getSessionToken());
        equal(user.createdAt.getTime(), sameUser.createdAt.getTime());
        equal(user.updatedAt.getTime(), sameUser.updatedAt.getTime());
        Parse.User.logOut();
        done();
      });
  });

  it('fetchAllIfNeeded', function (done) {
    const numItems = 11;
    const container = new Container();
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const item = new Item();
      item.set('x', i);
      items.push(item);
    }
    Parse.Object.saveAll(items)
      .then(function () {
        container.set('items', items);
        return container.save();
      })
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const itemsAgain = containerAgain.get('items');
        if (!itemsAgain || !itemsAgain.forEach) {
          fail('no itemsAgain retrieved', itemsAgain);
          done();
          return;
        }
        itemsAgain.forEach(function (item, i) {
          item.set('x', i * 2);
        });
        return Parse.Object.saveAll(itemsAgain);
      })
      .then(function () {
        return Parse.Object.fetchAllIfNeeded(items);
      })
      .then(function (fetchedItems) {
        equal(fetchedItems.length, numItems, 'Number of items should not change');
        fetchedItems.forEach(function (item, i) {
          equal(item.get('x'), i);
        });
        done();
      });
  });

  xit('fetchAllIfNeeded backbone-style callbacks', function (done) {
    const numItems = 11;
    const container = new Container();
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const item = new Item();
      item.set('x', i);
      items.push(item);
    }
    Parse.Object.saveAll(items)
      .then(function () {
        container.set('items', items);
        return container.save();
      })
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const itemsAgain = containerAgain.get('items');
        if (!itemsAgain || !itemsAgain.forEach) {
          fail('no itemsAgain retrieved', itemsAgain);
          done();
          return;
        }
        itemsAgain.forEach(function (item, i) {
          item.set('x', i * 2);
        });
        return Parse.Object.saveAll(itemsAgain);
      })
      .then(function () {
        const items = container.get('items');
        return Parse.Object.fetchAllIfNeeded(items).then(
          function (fetchedItems) {
            equal(fetchedItems.length, numItems, 'Number of items should not change');
            fetchedItems.forEach(function (item, j) {
              equal(item.get('x'), j);
            });
            done();
          },
          function () {
            ok(false, 'Failed to fetchAll');
            done();
          }
        );
      });
  });

  it('fetchAllIfNeeded no objects', function (done) {
    Parse.Object.fetchAllIfNeeded([])
      .then(function (success) {
        ok(Array.isArray(success), 'Should be able to fetchAll no objects');
        done();
      })
      .catch(done.fail);
  });

  it('fetchAllIfNeeded unsaved object', async function (done) {
    const unsavedObjectArray = [new TestObject()];
    await Parse.Object.fetchAllIfNeeded(unsavedObjectArray).catch(e => {
      expect(e.code).toBe(Parse.Error.MISSING_OBJECT_ID);
      done();
    });
  });

  it('fetchAllIfNeeded error on multiple classes', function (done) {
    const container = new Container();
    container.set('item', new Item());
    container.set('subcontainer', new Container());
    return container
      .save()
      .then(function () {
        const query = new Parse.Query(Container);
        return query.get(container.id);
      })
      .then(function (containerAgain) {
        const subContainerAgain = containerAgain.get('subcontainer');
        const itemAgain = containerAgain.get('item');
        const multiClassArray = [subContainerAgain, itemAgain];
        return Parse.Object.fetchAllIfNeeded(multiClassArray).catch(e => {
          expect(e.code).toBe(Parse.Error.INVALID_CLASS_NAME);
          done();
        });
      });
  });

  it('Objects with className User', function (done) {
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), true);
    const User1 = Parse.Object.extend({
      className: 'User',
    });

    equal(User1.className, '_User', 'className is rewritten by default');

    Parse.User.allowCustomUserClass(true);
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), false);
    const User2 = Parse.Object.extend({
      className: 'User',
    });

    equal(User2.className, 'User', 'className is not rewritten when allowCustomUserClass(true)');

    // Set back to default so as not to break other tests.
    Parse.User.allowCustomUserClass(false);
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), true, 'PERFORM_USER_REWRITE is reset');

    const user = new User2();
    user.set('name', 'Me');
    user.save({ height: 181 }).then(function (user) {
      equal(user.get('name'), 'Me');
      equal(user.get('height'), 181);

      const query = new Parse.Query(User2);
      query.get(user.id).then(function (user) {
        equal(user.className, 'User');
        equal(user.get('name'), 'Me');
        equal(user.get('height'), 181);
        done();
      });
    });
  });

  it('create without data', function (done) {
    const t1 = new TestObject({ test: 'test' });
    t1.save()
      .then(function (t1) {
        const t2 = TestObject.createWithoutData(t1.id);
        return t2.fetch();
      })
      .then(function (t2) {
        equal(t2.get('test'), 'test', 'Fetch should have grabbed ' + "'test' property.");
        const t3 = TestObject.createWithoutData(t2.id);
        t3.set('test', 'not test');
        return t3.fetch();
      })
      .then(
        function (t3) {
          equal(t3.get('test'), 'test', "Fetch should have grabbed server 'test' property.");
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
  });

  it('remove from new field creates array key', done => {
    const obj = new TestObject();
    obj.remove('shouldBeArray', 'foo');
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestObject');
        return query.get(obj.id);
      })
      .then(objAgain => {
        const arr = objAgain.get('shouldBeArray');
        ok(Array.isArray(arr), 'Should have created array key');
        ok(!arr || arr.length === 0, 'Should have an empty array.');
        done();
      });
  });

  it('increment with type conflict fails', done => {
    const obj = new TestObject();
    obj.set('astring', 'foo');
    obj
      .save()
      .then(() => {
        const obj2 = new TestObject();
        obj2.increment('astring');
        return obj2.save();
      })
      .then(
        () => {
          fail('Should not have saved.');
          done();
        },
        error => {
          expect(error.code).toEqual(111);
          done();
        }
      );
  });

  it('increment with empty field solidifies type', done => {
    const obj = new TestObject();
    obj.increment('aninc');
    obj
      .save()
      .then(() => {
        const obj2 = new TestObject();
        obj2.set('aninc', 'foo');
        return obj2.save();
      })
      .then(
        () => {
          fail('Should not have saved.');
          done();
        },
        error => {
          expect(error.code).toEqual(111);
          done();
        }
      );
  });

  it('increment update with type conflict fails', done => {
    const obj = new TestObject();
    obj.set('someString', 'foo');
    obj
      .save()
      .then(objAgain => {
        const obj2 = new TestObject();
        obj2.id = objAgain.id;
        obj2.increment('someString');
        return obj2.save();
      })
      .then(
        () => {
          fail('Should not have saved.');
          done();
        },
        error => {
          expect(error.code).toEqual(111);
          done();
        }
      );
  });

  it('dictionary fetched pointers do not lose data on fetch', done => {
    const parent = new Parse.Object('Parent');
    const dict = {};
    for (let i = 0; i < 5; i++) {
      const proc = iter => {
        const child = new Parse.Object('Child');
        child.set('name', 'testname' + i);
        dict[iter] = child;
      };
      proc(i);
    }
    parent.set('childDict', dict);
    parent
      .save()
      .then(() => {
        return parent.fetch();
      })
      .then(parentAgain => {
        const dictAgain = parentAgain.get('childDict');
        if (!dictAgain) {
          fail('Should have been a dictionary.');
          return done();
        }
        expect(typeof dictAgain).toEqual('object');
        expect(typeof dictAgain['0']).toEqual('object');
        expect(typeof dictAgain['1']).toEqual('object');
        expect(typeof dictAgain['2']).toEqual('object');
        expect(typeof dictAgain['3']).toEqual('object');
        expect(typeof dictAgain['4']).toEqual('object');
        done();
      });
  });

  it('should create nested keys with _', done => {
    const object = new Parse.Object('AnObject');
    object.set('foo', {
      _bar: '_',
      baz_bar: 1,
      __foo_bar: true,
      _0: 'underscore_zero',
      _more: {
        _nested: 'key',
      },
    });
    object
      .save()
      .then(res => {
        ok(res);
        return res.fetch();
      })
      .then(res => {
        const foo = res.get('foo');
        expect(foo['_bar']).toEqual('_');
        expect(foo['baz_bar']).toEqual(1);
        expect(foo['__foo_bar']).toBe(true);
        expect(foo['_0']).toEqual('underscore_zero');
        expect(foo['_more']['_nested']).toEqual('key');
        done();
      })
      .catch(err => {
        jfail(err);
        fail('should not fail');
        done();
      });
  });

  it('should have undefined includes when object is missing', done => {
    const obj1 = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        obj1.set('obj', obj2);
        // Save the pointer, delete the pointee
        return obj1.save().then(() => {
          return obj2.destroy();
        });
      })
      .then(() => {
        const query = new Parse.Query('AnObject');
        query.include('obj');
        return query.find();
      })
      .then(res => {
        expect(res.length).toBe(1);
        if (res[0]) {
          expect(res[0].get('obj')).toBe(undefined);
        }
        const query = new Parse.Query('AnObject');
        return query.find();
      })
      .then(res => {
        expect(res.length).toBe(1);
        if (res[0]) {
          expect(res[0].get('obj')).not.toBe(undefined);
          return res[0].get('obj').fetch();
        } else {
          done();
        }
      })
      .then(
        () => {
          fail('Should not fetch a deleted object');
        },
        err => {
          expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      );
  });

  it('should have undefined includes when object is missing on deeper path', done => {
    const obj1 = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnObject');
    const obj3 = new Parse.Object('AnObject');
    Parse.Object.saveAll([obj1, obj2, obj3])
      .then(() => {
        obj1.set('obj', obj2);
        obj2.set('obj', obj3);
        // Save the pointer, delete the pointee
        return Parse.Object.saveAll([obj1, obj2]).then(() => {
          return obj3.destroy();
        });
      })
      .then(() => {
        const query = new Parse.Query('AnObject');
        query.include('obj.obj');
        return query.get(obj1.id);
      })
      .then(res => {
        expect(res.get('obj')).not.toBe(undefined);
        expect(res.get('obj').get('obj')).toBe(undefined);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should handle includes on null arrays #2752', done => {
    const obj1 = new Parse.Object('AnObject');
    const obj2 = new Parse.Object('AnotherObject');
    const obj3 = new Parse.Object('NestedObject');
    obj3.set({
      foo: 'bar',
    });
    obj2.set({
      key: obj3,
    });

    Parse.Object.saveAll([obj1, obj2])
      .then(() => {
        obj1.set('objects', [null, null, obj2]);
        return obj1.save();
      })
      .then(() => {
        const query = new Parse.Query('AnObject');
        query.include('objects.key');
        return query.find();
      })
      .then(res => {
        const obj = res[0];
        expect(obj.get('objects')).not.toBe(undefined);
        const array = obj.get('objects');
        expect(Array.isArray(array)).toBe(true);
        expect(array[0]).toBe(null);
        expect(array[1]).toBe(null);
        expect(array[2].get('key').get('foo')).toEqual('bar');
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should handle select and include #2786', done => {
    const score = new Parse.Object('GameScore');
    const player = new Parse.Object('Player');
    score.set({
      score: 1234,
    });

    score
      .save()
      .then(() => {
        player.set('gameScore', score);
        player.set('other', 'value');
        return player.save();
      })
      .then(() => {
        const query = new Parse.Query('Player');
        query.include('gameScore');
        query.select('gameScore');
        return query.find();
      })
      .then(res => {
        const obj = res[0];
        const gameScore = obj.get('gameScore');
        const other = obj.get('other');
        expect(other).toBeUndefined();
        expect(gameScore).not.toBeUndefined();
        expect(gameScore.get('score')).toBe(1234);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('should include ACLs with select', done => {
    const score = new Parse.Object('GameScore');
    const player = new Parse.Object('Player');
    score.set({
      score: 1234,
    });
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    acl.setPublicWriteAccess(false);

    score
      .save()
      .then(() => {
        player.set('gameScore', score);
        player.set('other', 'value');
        player.setACL(acl);
        return player.save();
      })
      .then(() => {
        const query = new Parse.Query('Player');
        query.include('gameScore');
        query.select('gameScore');
        return query.find();
      })
      .then(res => {
        const obj = res[0];
        const gameScore = obj.get('gameScore');
        const other = obj.get('other');
        expect(other).toBeUndefined();
        expect(gameScore).not.toBeUndefined();
        expect(gameScore.get('score')).toBe(1234);
        expect(obj.getACL().getPublicReadAccess()).toBe(true);
        expect(obj.getACL().getPublicWriteAccess()).toBe(false);
      })
      .then(done)
      .catch(done.fail);
  });

  it('Update object field should store exactly same sent object', async done => {
    let object = new TestObject();

    // Set initial data
    object.set('jsonData', { a: 'b' });
    object = await object.save();
    equal(object.get('jsonData'), { a: 'b' });

    // Set empty JSON
    object.set('jsonData', {});
    object = await object.save();
    equal(object.get('jsonData'), {});

    // Set new JSON data
    object.unset('jsonData');
    object.set('jsonData', { c: 'd' });
    object = await object.save();
    equal(object.get('jsonData'), { c: 'd' });

    // Fetch object from server
    object = await object.fetch();
    equal(object.get('jsonData'), { c: 'd' });

    done();
  });

  it('isNew in cloud code', async () => {
    Parse.Cloud.beforeSave('CloudCodeIsNew', req => {
      expect(req.object.isNew()).toBeTruthy();
      expect(req.object.id).toBeUndefined();
    });

    Parse.Cloud.afterSave('CloudCodeIsNew', req => {
      expect(req.object.isNew()).toBeFalsy();
      expect(req.object.id).toBeDefined();
    });

    const object = new Parse.Object('CloudCodeIsNew');
    await object.save();
  });

  it('should run wildcard trigger for every class', async () => {
    Parse.Cloud.beforeSave('*', req => {
      req.object.set("newField",true);
      return req.object;
    });

    Parse.Cloud.afterSave('*', req => {
      expect(req.object.get("newField")).toBe(true);
    });

    const object = new Parse.Object('WildcardClass');
    await object.save();
  });
});
