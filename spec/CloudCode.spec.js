'use strict';
const Config = require('../lib/Config');
const Parse = require('parse/node');
const request = require('../lib/request');
const InMemoryCacheAdapter = require('../lib/Adapters/Cache/InMemoryCacheAdapter')
  .InMemoryCacheAdapter;

const mockAdapter = {
  createFile: async filename => ({
    name: filename,
    location: `http://www.somewhere.com/${filename}`,
  }),
  deleteFile: () => {},
  getFileData: () => {},
  getFileLocation: (config, filename) => `http://www.somewhere.com/${filename}`,
  validateFilename: () => {
    return null;
  },
};

describe('Cloud Code', () => {
  it('can load absolute cloud code file', done => {
    reconfigureServer({
      cloud: __dirname + '/cloud/cloudCodeRelativeFile.js',
    }).then(() => {
      Parse.Cloud.run('cloudCodeInFile', {}).then(result => {
        expect(result).toEqual('It is possible to define cloud code in a file.');
        done();
      });
    });
  });

  it('can load relative cloud code file', done => {
    reconfigureServer({ cloud: './spec/cloud/cloudCodeAbsoluteFile.js' }).then(() => {
      Parse.Cloud.run('cloudCodeInFile', {}).then(result => {
        expect(result).toEqual('It is possible to define cloud code in a file.');
        done();
      });
    });
  });

  it('can create functions', done => {
    Parse.Cloud.define('hello', () => {
      return 'Hello world!';
    });

    Parse.Cloud.run('hello', {}).then(result => {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('show warning on duplicate cloud functions', done => {
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'warn').and.callFake(() => {});
    Parse.Cloud.define('hello', () => {
      return 'Hello world!';
    });
    Parse.Cloud.define('hello', () => {
      return 'Hello world!';
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Warning: Duplicate cloud functions exist for hello. Only the last one will be used and the others will be ignored.'
    );
    done();
  });

  it('is cleared cleared after the previous test', done => {
    Parse.Cloud.run('hello', {}).catch(error => {
      expect(error.code).toEqual(141);
      done();
    });
  });

  it('basic beforeSave rejection', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', function () {
      throw new Error('You shall not pass!');
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj.save().then(
      () => {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      () => {
        done();
      }
    );
  });

  it('returns an error', done => {
    Parse.Cloud.define('cloudCodeWithError', () => {
      /* eslint-disable no-undef */
      foo.bar();
      /* eslint-enable no-undef */
      return 'I better throw an error.';
    });

    Parse.Cloud.run('cloudCodeWithError').then(
      () => done.fail('should not succeed'),
      e => {
        expect(e).toEqual(new Parse.Error(141, 'foo is not defined'));
        done();
      }
    );
  });

  it('returns an empty error', done => {
    Parse.Cloud.define('cloudCodeWithError', () => {
      throw null;
    });

    Parse.Cloud.run('cloudCodeWithError').then(
      () => done.fail('should not succeed'),
      e => {
        expect(e.code).toEqual(141);
        expect(e.message).toEqual('Script failed.');
        done();
      }
    );
  });

  it('beforeFind can throw string', async function (done) {
    Parse.Cloud.beforeFind('beforeFind', () => {
      throw 'throw beforeFind';
    });
    const obj = new Parse.Object('beforeFind');
    obj.set('foo', 'bar');
    await obj.save();
    expect(obj.get('foo')).toBe('bar');
    try {
      const query = new Parse.Query('beforeFind');
      await query.first();
    } catch (e) {
      expect(e.code).toBe(141);
      expect(e.message).toBe('throw beforeFind');
      done();
    }
  });

  it('beforeSave rejection with custom error code', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithErrorCode', function () {
      throw new Parse.Error(999, 'Nope');
    });

    const obj = new Parse.Object('BeforeSaveFailWithErrorCode');
    obj.set('foo', 'bar');
    obj.save().then(
      function () {
        fail('Should not have been able to save BeforeSaveFailWithErrorCode class.');
        done();
      },
      function (error) {
        expect(error.code).toEqual(999);
        expect(error.message).toEqual('Nope');
        done();
      }
    );
  });

  it('basic beforeSave rejection via promise', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithPromise', function () {
      const query = new Parse.Query('Yolo');
      return query.find().then(
        () => {
          throw 'Nope';
        },
        () => {
          return Promise.response();
        }
      );
    });

    const obj = new Parse.Object('BeforeSaveFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(
      function () {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      function (error) {
        expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
        expect(error.message).toEqual('Nope');
        done();
      }
    );
  });

  it('test beforeSave changed object success', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(
      function () {
        const query = new Parse.Query('BeforeSaveChanged');
        query.get(obj.id).then(
          function (objAgain) {
            expect(objAgain.get('foo')).toEqual('baz');
            done();
          },
          function (error) {
            fail(error);
            done();
          }
        );
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('test beforeSave with invalid field', async () => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('length', 0);
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    try {
      await obj.save();
      fail('should not succeed');
    } catch (e) {
      expect(e.message).toBe('Invalid field name: length.');
    }
  });

  it("test beforeSave changed object fail doesn't change object", async function () {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      if (req.object.has('fail')) {
        return Promise.reject(new Error('something went wrong'));
      }

      return Promise.resolve();
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    await obj.save();
    obj.set('foo', 'baz').set('fail', true);
    try {
      await obj.save();
    } catch (e) {
      await obj.fetch();
      expect(obj.get('foo')).toBe('bar');
    }
  });

  it('test beforeSave returns value on create and update', done => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bing');
    obj.save().then(() => {
      expect(obj.get('foo')).toEqual('baz');
      obj.set('foo', 'bar');
      return obj.save().then(() => {
        expect(obj.get('foo')).toEqual('baz');
        done();
      });
    });
  });

  it('test beforeSave applies changes when beforeSave returns true', done => {
    Parse.Cloud.beforeSave('Insurance', function (req) {
      req.object.set('rate', '$49.99/Month');
      return true;
    });

    const insurance = new Parse.Object('Insurance');
    insurance.set('rate', '$5.00/Month');
    insurance.save().then(insurance => {
      expect(insurance.get('rate')).toEqual('$49.99/Month');
      done();
    });
  });

  it('test beforeSave applies changes and resolves returned promise', done => {
    Parse.Cloud.beforeSave('Insurance', function (req) {
      req.object.set('rate', '$49.99/Month');
      return new Parse.Query('Pet').get(req.object.get('pet').id).then(pet => {
        pet.set('healthy', true);
        return pet.save();
      });
    });

    const pet = new Parse.Object('Pet');
    pet.set('healthy', false);
    pet.save().then(pet => {
      const insurance = new Parse.Object('Insurance');
      insurance.set('pet', pet);
      insurance.set('rate', '$5.00/Month');
      insurance.save().then(insurance => {
        expect(insurance.get('rate')).toEqual('$49.99/Month');
        new Parse.Query('Pet').get(insurance.get('pet').id).then(pet => {
          expect(pet.get('healthy')).toEqual(true);
          done();
        });
      });
    });
  });

  it('beforeSave should be called only if user fulfills permissions', async () => {
    const triggeruser = new Parse.User();
    triggeruser.setUsername('triggeruser');
    triggeruser.setPassword('triggeruser');
    await triggeruser.signUp();

    const triggeruser2 = new Parse.User();
    triggeruser2.setUsername('triggeruser2');
    triggeruser2.setPassword('triggeruser2');
    await triggeruser2.signUp();

    const triggeruser3 = new Parse.User();
    triggeruser3.setUsername('triggeruser3');
    triggeruser3.setPassword('triggeruser3');
    await triggeruser3.signUp();

    const triggeruser4 = new Parse.User();
    triggeruser4.setUsername('triggeruser4');
    triggeruser4.setPassword('triggeruser4');
    await triggeruser4.signUp();

    const triggeruser5 = new Parse.User();
    triggeruser5.setUsername('triggeruser5');
    triggeruser5.setPassword('triggeruser5');
    await triggeruser5.signUp();

    const triggerroleacl = new Parse.ACL();
    triggerroleacl.setPublicReadAccess(true);

    const triggerrole = new Parse.Role();
    triggerrole.setName('triggerrole');
    triggerrole.setACL(triggerroleacl);
    triggerrole.getUsers().add(triggeruser);
    triggerrole.getUsers().add(triggeruser3);
    await triggerrole.save();

    const config = Config.get('test');
    const schema = await config.database.loadSchema();
    await schema.addClassIfNotExists(
      'triggerclass',
      {
        someField: { type: 'String' },
        pointerToUser: { type: 'Pointer', targetClass: '_User' },
      },
      {
        find: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        create: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        get: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        update: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        addField: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        delete: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        readUserFields: ['pointerToUser'],
        writeUserFields: ['pointerToUser'],
      },
      {}
    );

    let called = 0;
    Parse.Cloud.beforeSave('triggerclass', () => {
      called++;
    });

    const triggerobject = new Parse.Object('triggerclass');
    triggerobject.set('someField', 'someValue');
    triggerobject.set('someField2', 'someValue');
    const triggerobjectacl = new Parse.ACL();
    triggerobjectacl.setPublicReadAccess(false);
    triggerobjectacl.setPublicWriteAccess(false);
    triggerobjectacl.setRoleReadAccess(triggerrole, true);
    triggerobjectacl.setRoleWriteAccess(triggerrole, true);
    triggerobjectacl.setReadAccess(triggeruser.id, true);
    triggerobjectacl.setWriteAccess(triggeruser.id, true);
    triggerobjectacl.setReadAccess(triggeruser2.id, true);
    triggerobjectacl.setWriteAccess(triggeruser2.id, true);
    triggerobject.setACL(triggerobjectacl);

    await triggerobject.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(1);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(2);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(3);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser3.getSessionToken(),
    });
    expect(called).toBe(4);

    const triggerobject2 = new Parse.Object('triggerclass');
    triggerobject2.set('someField', 'someValue');
    triggerobject2.set('someField22', 'someValue');
    const triggerobjectacl2 = new Parse.ACL();
    triggerobjectacl2.setPublicReadAccess(false);
    triggerobjectacl2.setPublicWriteAccess(false);
    triggerobjectacl2.setReadAccess(triggeruser.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser.id, true);
    triggerobjectacl2.setReadAccess(triggeruser2.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser2.id, true);
    triggerobjectacl2.setReadAccess(triggeruser5.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser5.id, true);
    triggerobject2.setACL(triggerobjectacl2);

    await triggerobject2.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(5);
    await triggerobject2.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(6);
    await triggerobject2.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(7);

    let catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser3.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser4.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser5.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    const triggerobject3 = new Parse.Object('triggerclass');
    triggerobject3.set('someField', 'someValue');
    triggerobject3.set('someField33', 'someValue');

    catched = false;
    try {
      await triggerobject3.save(undefined, {
        sessionToken: triggeruser4.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(119);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject3.save(undefined, {
        sessionToken: triggeruser5.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(119);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);
  });

  it('test afterSave ran and created an object', function (done) {
    Parse.Cloud.afterSave('AfterSaveTest', function (req) {
      const obj = new Parse.Object('AfterSaveProof');
      obj.set('proof', req.object.id);
      obj.save().then(test);
    });

    const obj = new Parse.Object('AfterSaveTest');
    obj.save();

    function test() {
      const query = new Parse.Query('AfterSaveProof');
      query.equalTo('proof', obj.id);
      query.find().then(
        function (results) {
          expect(results.length).toEqual(1);
          done();
        },
        function (error) {
          fail(error);
          done();
        }
      );
    }
  });

  it('test afterSave ran on created object and returned a promise', function (done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function (req) {
      const obj = req.object;
      if (!obj.existed()) {
        return new Promise(resolve => {
          setTimeout(function () {
            obj.set('proof', obj.id);
            obj.save().then(function () {
              resolve();
            });
          }, 1000);
        });
      }
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function () {
      const query = new Parse.Query('AfterSaveTest2');
      query.equalTo('proof', obj.id);
      query.find().then(
        function (results) {
          expect(results.length).toEqual(1);
          const savedObject = results[0];
          expect(savedObject.get('proof')).toEqual(obj.id);
          done();
        },
        function (error) {
          fail(error);
          done();
        }
      );
    });
  });

  // TODO: Fails on CI randomly as racing
  xit('test afterSave ignoring promise, object not found', function (done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function (req) {
      const obj = req.object;
      if (!obj.existed()) {
        return new Promise(resolve => {
          setTimeout(function () {
            obj.set('proof', obj.id);
            obj.save().then(function () {
              resolve();
            });
          }, 1000);
        });
      }
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function () {
      done();
    });

    const query = new Parse.Query('AfterSaveTest2');
    query.equalTo('proof', obj.id);
    query.find().then(
      function (results) {
        expect(results.length).toEqual(0);
      },
      function (error) {
        fail(error);
      }
    );
  });

  it('test afterSave rejecting promise', function (done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function () {
      return new Promise((resolve, reject) => {
        setTimeout(function () {
          reject('THIS SHOULD BE IGNORED');
        }, 1000);
      });
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(
      function () {
        done();
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('test afterDelete returning promise, object is deleted when destroy resolves', function (done) {
    Parse.Cloud.afterDelete('AfterDeleteTest2', function (req) {
      return new Promise(resolve => {
        setTimeout(function () {
          const obj = new Parse.Object('AfterDeleteTestProof');
          obj.set('proof', req.object.id);
          obj.save().then(function () {
            resolve();
          });
        }, 1000);
      });
    });

    const errorHandler = function (error) {
      fail(error);
      done();
    };

    const obj = new Parse.Object('AfterDeleteTest2');
    obj.save().then(function () {
      obj.destroy().then(function () {
        const query = new Parse.Query('AfterDeleteTestProof');
        query.equalTo('proof', obj.id);
        query.find().then(function (results) {
          expect(results.length).toEqual(1);
          const deletedObject = results[0];
          expect(deletedObject.get('proof')).toEqual(obj.id);
          done();
        }, errorHandler);
      }, errorHandler);
    }, errorHandler);
  });

  it('test afterDelete ignoring promise, object is not yet deleted', function (done) {
    Parse.Cloud.afterDelete('AfterDeleteTest2', function (req) {
      return new Promise(resolve => {
        setTimeout(function () {
          const obj = new Parse.Object('AfterDeleteTestProof');
          obj.set('proof', req.object.id);
          obj.save().then(function () {
            resolve();
          });
        }, 1000);
      });
    });

    const errorHandler = function (error) {
      fail(error);
      done();
    };

    const obj = new Parse.Object('AfterDeleteTest2');
    obj.save().then(function () {
      obj.destroy().then(function () {
        done();
      });

      const query = new Parse.Query('AfterDeleteTestProof');
      query.equalTo('proof', obj.id);
      query.find().then(function (results) {
        expect(results.length).toEqual(0);
      }, errorHandler);
    }, errorHandler);
  });

  it('test beforeSave happens on update', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(function () {
        obj.set('foo', 'bar');
        return obj.save();
      })
      .then(
        function () {
          const query = new Parse.Query('BeforeSaveChanged');
          return query.get(obj.id).then(function (objAgain) {
            expect(objAgain.get('foo')).toEqual('baz');
            done();
          });
        },
        function (error) {
          fail(error);
          done();
        }
      );
  });

  it('test beforeDelete failure', function (done) {
    Parse.Cloud.beforeDelete('BeforeDeleteFail', function () {
      throw 'Nope';
    });

    const obj = new Parse.Object('BeforeDeleteFail');
    let id;
    obj.set('foo', 'bar');
    obj
      .save()
      .then(() => {
        id = obj.id;
        return obj.destroy();
      })
      .then(
        () => {
          fail('obj.destroy() should have failed, but it succeeded');
          done();
        },
        error => {
          expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
          expect(error.message).toEqual('Nope');

          const objAgain = new Parse.Object('BeforeDeleteFail', {
            objectId: id,
          });
          return objAgain.fetch();
        }
      )
      .then(
        objAgain => {
          if (objAgain) {
            expect(objAgain.get('foo')).toEqual('bar');
          } else {
            fail('unable to fetch the object ', id);
          }
          done();
        },
        error => {
          // We should have been able to fetch the object again
          fail(error);
        }
      );
  });

  it('basic beforeDelete rejection via promise', function (done) {
    Parse.Cloud.beforeSave('BeforeDeleteFailWithPromise', function () {
      const query = new Parse.Query('Yolo');
      return query.find().then(() => {
        throw 'Nope';
      });
    });

    const obj = new Parse.Object('BeforeDeleteFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(
      function () {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      function (error) {
        expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
        expect(error.message).toEqual('Nope');

        done();
      }
    );
  });

  it('test afterDelete ran and created an object', function (done) {
    Parse.Cloud.afterDelete('AfterDeleteTest', function (req) {
      const obj = new Parse.Object('AfterDeleteProof');
      obj.set('proof', req.object.id);
      obj.save().then(test);
    });

    const obj = new Parse.Object('AfterDeleteTest');
    obj.save().then(function () {
      obj.destroy();
    });

    function test() {
      const query = new Parse.Query('AfterDeleteProof');
      query.equalTo('proof', obj.id);
      query.find().then(
        function (results) {
          expect(results.length).toEqual(1);
          done();
        },
        function (error) {
          fail(error);
          done();
        }
      );
    }
  });

  it('test cloud function return types', function (done) {
    Parse.Cloud.define('foo', function () {
      return {
        object: {
          __type: 'Object',
          className: 'Foo',
          objectId: '123',
          x: 2,
          relation: {
            __type: 'Object',
            className: 'Bar',
            objectId: '234',
            x: 3,
          },
        },
        array: [
          {
            __type: 'Object',
            className: 'Bar',
            objectId: '345',
            x: 2,
          },
        ],
        a: 2,
      };
    });

    Parse.Cloud.run('foo').then(result => {
      expect(result.object instanceof Parse.Object).toBeTruthy();
      if (!result.object) {
        fail('Unable to run foo');
        done();
        return;
      }
      expect(result.object.className).toEqual('Foo');
      expect(result.object.get('x')).toEqual(2);
      const bar = result.object.get('relation');
      expect(bar instanceof Parse.Object).toBeTruthy();
      expect(bar.className).toEqual('Bar');
      expect(bar.get('x')).toEqual(3);
      expect(Array.isArray(result.array)).toEqual(true);
      expect(result.array[0] instanceof Parse.Object).toBeTruthy();
      expect(result.array[0].get('x')).toEqual(2);
      done();
    });
  });

  it('test cloud function request params types', function (done) {
    Parse.Cloud.define('params', function (req) {
      expect(req.params.date instanceof Date).toBe(true);
      expect(req.params.date.getTime()).toBe(1463907600000);
      expect(req.params.dateList[0] instanceof Date).toBe(true);
      expect(req.params.dateList[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.date[0] instanceof Date).toBe(true);
      expect(req.params.complexStructure.date[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.deepDate.date[0] instanceof Date).toBe(true);
      expect(req.params.complexStructure.deepDate.date[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.deepDate2[0].date instanceof Date).toBe(true);
      expect(req.params.complexStructure.deepDate2[0].date.getTime()).toBe(1463907600000);
      // Regression for #2294
      expect(req.params.file instanceof Parse.File).toBe(true);
      expect(req.params.file.url()).toEqual('https://some.url');
      // Regression for #2204
      expect(req.params.array).toEqual(['a', 'b', 'c']);
      expect(Array.isArray(req.params.array)).toBe(true);
      expect(req.params.arrayOfArray).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
      expect(Array.isArray(req.params.arrayOfArray)).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[0])).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[1])).toBe(true);
      return {};
    });

    const params = {
      date: {
        __type: 'Date',
        iso: '2016-05-22T09:00:00.000Z',
      },
      dateList: [
        {
          __type: 'Date',
          iso: '2016-05-22T09:00:00.000Z',
        },
      ],
      lol: 'hello',
      complexStructure: {
        date: [
          {
            __type: 'Date',
            iso: '2016-05-22T09:00:00.000Z',
          },
        ],
        deepDate: {
          date: [
            {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
          ],
        },
        deepDate2: [
          {
            date: {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
          },
        ],
      },
      file: Parse.File.fromJSON({
        __type: 'File',
        name: 'name',
        url: 'https://some.url',
      }),
      array: ['a', 'b', 'c'],
      arrayOfArray: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
    };
    Parse.Cloud.run('params', params).then(() => {
      done();
    });
  });

  it('test cloud function should echo keys', function (done) {
    Parse.Cloud.define('echoKeys', function () {
      return {
        applicationId: Parse.applicationId,
        masterKey: Parse.masterKey,
        javascriptKey: Parse.javascriptKey,
      };
    });

    Parse.Cloud.run('echoKeys').then(result => {
      expect(result.applicationId).toEqual(Parse.applicationId);
      expect(result.masterKey).toEqual(Parse.masterKey);
      expect(result.javascriptKey).toEqual(Parse.javascriptKey);
      done();
    });
  });

  it('should properly create an object in before save', done => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('foo', 'baz');
    });

    Parse.Cloud.define('createBeforeSaveChangedObject', function () {
      const obj = new Parse.Object('BeforeSaveChanged');
      return obj.save().then(() => {
        return obj;
      });
    });

    Parse.Cloud.run('createBeforeSaveChangedObject').then(res => {
      expect(res.get('foo')).toEqual('baz');
      done();
    });
  });

  it('dirtyKeys are set on update', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', req => {
      const object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.dirtyKeys()).toEqual(['foo']);
        expect(object.dirty('foo')).toBeTruthy();
        expect(object.get('foo')).toEqual('baz');
      } else {
        throw new Error();
      }
      triggerTime++;
    });

    const obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj
      .save()
      .then(() => {
        // We only update foo
        obj.set('foo', 'baz');
        return obj.save();
      })
      .then(
        () => {
          // Make sure the checking has been triggered
          expect(triggerTime).toBe(2);
          done();
        },
        function (error) {
          fail(error);
          done();
        }
      );
  });

  it('test beforeSave unchanged success', function (done) {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', function () {
      return;
    });

    const obj = new Parse.Object('BeforeSaveUnchanged');
    obj.set('foo', 'bar');
    obj.save().then(
      function () {
        done();
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('test beforeDelete success', function (done) {
    Parse.Cloud.beforeDelete('BeforeDeleteTest', function () {
      return;
    });

    const obj = new Parse.Object('BeforeDeleteTest');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(function () {
        return obj.destroy();
      })
      .then(
        function () {
          const objAgain = new Parse.Object('BeforeDeleteTest', obj.id);
          return objAgain.fetch().then(fail, () => done());
        },
        function (error) {
          fail(error);
          done();
        }
      );
  });

  it('test save triggers get user', async done => {
    Parse.Cloud.beforeSave('SaveTriggerUser', function (req) {
      if (req.user && req.user.id) {
        return;
      } else {
        throw new Error('No user present on request object for beforeSave.');
      }
    });

    Parse.Cloud.afterSave('SaveTriggerUser', function (req) {
      if (!req.user || !req.user.id) {
        console.log('No user present on request object for afterSave.');
      }
    });

    const user = new Parse.User();
    user.set('password', 'asdf');
    user.set('email', 'asdf@example.com');
    user.set('username', 'zxcv');
    await user.signUp();
    const obj = new Parse.Object('SaveTriggerUser');
    obj.save().then(
      function () {
        done();
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('beforeSave change propagates through the save response', done => {
    Parse.Cloud.beforeSave('ChangingObject', function (request) {
      request.object.set('foo', 'baz');
    });
    const obj = new Parse.Object('ChangingObject');
    obj.save({ foo: 'bar' }).then(
      objAgain => {
        expect(objAgain.get('foo')).toEqual('baz');
        done();
      },
      () => {
        fail('Should not have failed to save.');
        done();
      }
    );
  });

  it('beforeSave change propagates through the afterSave #1931', done => {
    Parse.Cloud.beforeSave('ChangingObject', function (request) {
      request.object.unset('file');
      request.object.unset('date');
    });

    Parse.Cloud.afterSave('ChangingObject', function (request) {
      expect(request.object.has('file')).toBe(false);
      expect(request.object.has('date')).toBe(false);
      expect(request.object.get('file')).toBeUndefined();
      return Promise.resolve();
    });
    const file = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    file
      .save()
      .then(() => {
        const obj = new Parse.Object('ChangingObject');
        return obj.save({ file, date: new Date() });
      })
      .then(
        () => {
          done();
        },
        () => {
          fail();
          done();
        }
      );
  });

  it('test cloud function parameter validation success', done => {
    // Register a function with validation
    Parse.Cloud.define(
      'functionWithParameterValidation',
      () => {
        return 'works';
      },
      request => {
        return request.params.success === 100;
      }
    );

    Parse.Cloud.run('functionWithParameterValidation', { success: 100 }).then(
      () => {
        done();
      },
      () => {
        fail('Validation should not have failed.');
        done();
      }
    );
  });

  it('doesnt receive stale user in cloud code functions after user has been updated with master key (regression test for #1836)', done => {
    Parse.Cloud.define('testQuery', function (request) {
      return request.user.get('data');
    });

    Parse.User.signUp('user', 'pass')
      .then(user => {
        user.set('data', 'AAA');
        return user.save();
      })
      .then(() => Parse.Cloud.run('testQuery'))
      .then(result => {
        expect(result).toEqual('AAA');
        Parse.User.current().set('data', 'BBB');
        return Parse.User.current().save(null, { useMasterKey: true });
      })
      .then(() => Parse.Cloud.run('testQuery'))
      .then(result => {
        expect(result).toEqual('BBB');
        done();
      });
  });

  it('clears out the user cache for all sessions when the user is changed', done => {
    let session1;
    let session2;
    let user;
    const cacheAdapter = new InMemoryCacheAdapter({ ttl: 100000000 });
    reconfigureServer({ cacheAdapter })
      .then(() => {
        Parse.Cloud.define('checkStaleUser', request => {
          return request.user.get('data');
        });

        user = new Parse.User();
        user.set('username', 'test');
        user.set('password', 'moon-y');
        user.set('data', 'first data');
        return user.signUp();
      })
      .then(user => {
        session1 = user.getSessionToken();
        return request({
          url: 'http://localhost:8378/1/login?username=test&password=moon-y',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
        });
      })
      .then(response => {
        session2 = response.data.sessionToken;
        //Ensure both session tokens are in the cache
        return Parse.Cloud.run('checkStaleUser', { sessionToken: session2 });
      })
      .then(() =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/functions/checkStaleUser',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': session2,
          },
        })
      )
      .then(() =>
        Promise.all([
          cacheAdapter.get('test:user:' + session1),
          cacheAdapter.get('test:user:' + session2),
        ])
      )
      .then(cachedVals => {
        expect(cachedVals[0].objectId).toEqual(user.id);
        expect(cachedVals[1].objectId).toEqual(user.id);

        //Change with session 1 and then read with session 2.
        user.set('data', 'second data');
        return user.save();
      })
      .then(() =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/functions/checkStaleUser',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': session2,
          },
        })
      )
      .then(response => {
        expect(response.data.result).toEqual('second data');
        done();
      })
      .catch(done.fail);
  });

  it('trivial beforeSave should not affect fetched pointers (regression test for #1238)', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', () => {});

    const TestObject = Parse.Object.extend('TestObject');
    const NoBeforeSaveObject = Parse.Object.extend('NoBeforeSave');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveUnchanged');

    const aTestObject = new TestObject();
    aTestObject.set('foo', 'bar');
    aTestObject
      .save()
      .then(aTestObject => {
        const aNoBeforeSaveObj = new NoBeforeSaveObject();
        aNoBeforeSaveObj.set('aTestObject', aTestObject);
        expect(aNoBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        return aNoBeforeSaveObj.save();
      })
      .then(aNoBeforeSaveObj => {
        expect(aNoBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');

        const aBeforeSaveObj = new BeforeSaveObject();
        aBeforeSaveObj.set('aTestObject', aTestObject);
        expect(aBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        return aBeforeSaveObj.save();
      })
      .then(aBeforeSaveObj => {
        expect(aBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        done();
      });
  });

  it('beforeSave should not affect fetched pointers', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', () => {});

    Parse.Cloud.beforeSave('BeforeSaveChanged', function (req) {
      req.object.set('foo', 'baz');
    });

    const TestObject = Parse.Object.extend('TestObject');
    const BeforeSaveUnchangedObject = Parse.Object.extend('BeforeSaveUnchanged');
    const BeforeSaveChangedObject = Parse.Object.extend('BeforeSaveChanged');

    const aTestObject = new TestObject();
    aTestObject.set('foo', 'bar');
    aTestObject
      .save()
      .then(aTestObject => {
        const aBeforeSaveUnchangedObject = new BeforeSaveUnchangedObject();
        aBeforeSaveUnchangedObject.set('aTestObject', aTestObject);
        expect(aBeforeSaveUnchangedObject.get('aTestObject').get('foo')).toEqual('bar');
        return aBeforeSaveUnchangedObject.save();
      })
      .then(aBeforeSaveUnchangedObject => {
        expect(aBeforeSaveUnchangedObject.get('aTestObject').get('foo')).toEqual('bar');

        const aBeforeSaveChangedObject = new BeforeSaveChangedObject();
        aBeforeSaveChangedObject.set('aTestObject', aTestObject);
        expect(aBeforeSaveChangedObject.get('aTestObject').get('foo')).toEqual('bar');
        return aBeforeSaveChangedObject.save();
      })
      .then(aBeforeSaveChangedObject => {
        expect(aBeforeSaveChangedObject.get('aTestObject').get('foo')).toEqual('bar');
        expect(aBeforeSaveChangedObject.get('foo')).toEqual('baz');
        done();
      });
  });

  it('should fully delete objects when using `unset` with beforeSave (regression test for #1840)', done => {
    const TestObject = Parse.Object.extend('TestObject');
    const NoBeforeSaveObject = Parse.Object.extend('NoBeforeSave');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

    Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
      const object = req.object;
      object.set('before', 'save');
    });

    Parse.Cloud.define('removeme', () => {
      const testObject = new TestObject();
      return testObject
        .save()
        .then(testObject => {
          const object = new NoBeforeSaveObject({ remove: testObject });
          return object.save();
        })
        .then(object => {
          object.unset('remove');
          return object.save();
        });
    });

    Parse.Cloud.define('removeme2', () => {
      const testObject = new TestObject();
      return testObject
        .save()
        .then(testObject => {
          const object = new BeforeSaveObject({ remove: testObject });
          return object.save();
        })
        .then(object => {
          object.unset('remove');
          return object.save();
        });
    });

    Parse.Cloud.run('removeme')
      .then(aNoBeforeSaveObj => {
        expect(aNoBeforeSaveObj.get('remove')).toEqual(undefined);

        return Parse.Cloud.run('removeme2');
      })
      .then(aBeforeSaveObj => {
        expect(aBeforeSaveObj.get('before')).toEqual('save');
        expect(aBeforeSaveObj.get('remove')).toEqual(undefined);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  /*
    TODO: fix for Postgres
    trying to delete a field that doesn't exists doesn't play nice
   */
  it_exclude_dbs(['postgres'])(
    'should fully delete objects when using `unset` and `set` with beforeSave (regression test for #1840)',
    done => {
      const TestObject = Parse.Object.extend('TestObject');
      const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

      Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
        const object = req.object;
        object.set('before', 'save');
        object.unset('remove');
      });

      let object;
      const testObject = new TestObject({ key: 'value' });
      testObject
        .save()
        .then(() => {
          object = new BeforeSaveObject();
          return object.save().then(() => {
            object.set({ remove: testObject });
            return object.save();
          });
        })
        .then(objectAgain => {
          expect(objectAgain.get('remove')).toBeUndefined();
          expect(object.get('remove')).toBeUndefined();
          done();
        })
        .catch(err => {
          jfail(err);
          done();
        });
    }
  );

  it('should not include relation op (regression test for #1606)', done => {
    const TestObject = Parse.Object.extend('TestObject');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');
    let testObj;
    Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
      const object = req.object;
      object.set('before', 'save');
      testObj = new TestObject();
      return testObj.save().then(() => {
        object.relation('testsRelation').add(testObj);
      });
    });

    const object = new BeforeSaveObject();
    object
      .save()
      .then(objectAgain => {
        // Originally it would throw as it would be a non-relation
        expect(() => {
          objectAgain.relation('testsRelation');
        }).not.toThrow();
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  /**
   * Checks that incrementing a value to a zero in a beforeSave hook
   * does not result in that key being omitted from the response.
   */
  it('before save increment does not return undefined', done => {
    Parse.Cloud.define('cloudIncrementClassFunction', function (req) {
      const CloudIncrementClass = Parse.Object.extend('CloudIncrementClass');
      const obj = new CloudIncrementClass();
      obj.id = req.params.objectId;
      return obj.save();
    });

    Parse.Cloud.beforeSave('CloudIncrementClass', function (req) {
      const obj = req.object;
      if (!req.master) {
        obj.increment('points', -10);
        obj.increment('num', -9);
      }
    });

    const CloudIncrementClass = Parse.Object.extend('CloudIncrementClass');
    const obj = new CloudIncrementClass();
    obj.set('points', 10);
    obj.set('num', 10);
    obj.save(null, { useMasterKey: true }).then(function () {
      Parse.Cloud.run('cloudIncrementClassFunction', { objectId: obj.id }).then(function (
        savedObj
      ) {
        expect(savedObj.get('num')).toEqual(1);
        expect(savedObj.get('points')).toEqual(0);
        done();
      });
    });
  });

  it('beforeSave should not sanitize database', async done => {
    const { adapter } = Config.get(Parse.applicationId).database;
    const spy = spyOn(adapter, 'findOneAndUpdate').and.callThrough();
    spy.calls.saveArgumentsByValue();

    let count = 0;
    Parse.Cloud.beforeSave('CloudIncrementNested', req => {
      count += 1;
      req.object.set('foo', 'baz');
      expect(typeof req.object.get('objectField').number).toBe('number');
    });

    Parse.Cloud.afterSave('CloudIncrementNested', req => {
      expect(typeof req.object.get('objectField').number).toBe('number');
    });

    const obj = new Parse.Object('CloudIncrementNested');
    obj.set('objectField', { number: 5 });
    obj.set('foo', 'bar');
    await obj.save();

    obj.increment('objectField.number', 10);
    await obj.save();

    const [
      ,
      ,
      ,
      /* className */ /* schema */ /* query */ update,
    ] = adapter.findOneAndUpdate.calls.first().args;
    expect(update).toEqual({
      'objectField.number': { __op: 'Increment', amount: 10 },
      foo: 'baz',
      updatedAt: obj.updatedAt.toISOString(),
    });

    count === 2 ? done() : fail();
  });

  /**
   * Verifies that an afterSave hook throwing an exception
   * will not prevent a successful save response from being returned
   */
  it('should succeed on afterSave exception', done => {
    Parse.Cloud.afterSave('AfterSaveTestClass', function () {
      throw 'Exception';
    });
    const AfterSaveTestClass = Parse.Object.extend('AfterSaveTestClass');
    const obj = new AfterSaveTestClass();
    obj.save().then(done, done.fail);
  });

  describe('cloud jobs', () => {
    it('should define a job', done => {
      expect(() => {
        Parse.Cloud.job('myJob', ({ message }) => {
          message('Hello, world!!!');
        });
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      })
        .then(async response => {
          const jobStatusId = response.headers['x-parse-job-status-id'];
          const checkJobStatus = async () => {
            const jobStatus = await getJobStatus(jobStatusId);
            return jobStatus.get('finishedAt') && jobStatus.get('message') === 'Hello, world!!!';
          };
          while (!(await checkJobStatus())) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        })
        .then(done)
        .catch(done.fail);
    });

    it('should not run without master key', done => {
      expect(() => {
        Parse.Cloud.job('myJob', () => {});
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
      }).then(
        () => {
          fail('Expected to be unauthorized');
          done();
        },
        err => {
          expect(err.status).toBe(403);
          done();
        }
      );
    });

    it('should run with master key', done => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof req.message).toBe('function');
          expect(typeof res).toBe('undefined');
        });
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      })
        .then(async response => {
          const jobStatusId = response.headers['x-parse-job-status-id'];
          const checkJobStatus = async () => {
            const jobStatus = await getJobStatus(jobStatusId);
            return jobStatus.get('finishedAt');
          };
          while (!(await checkJobStatus())) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        })
        .then(done)
        .catch(done.fail);
    });

    it('should run with master key basic auth', done => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof req.message).toBe('function');
          expect(typeof res).toBe('undefined');
        });
      }).not.toThrow();

      request({
        method: 'POST',
        url: `http://${Parse.applicationId}:${Parse.masterKey}@localhost:8378/1/jobs/myJob`,
      })
        .then(async response => {
          const jobStatusId = response.headers['x-parse-job-status-id'];
          const checkJobStatus = async () => {
            const jobStatus = await getJobStatus(jobStatusId);
            return jobStatus.get('finishedAt');
          };
          while (!(await checkJobStatus())) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        })
        .then(done)
        .catch(done.fail);
    });

    it('should set the message / success on the job', done => {
      Parse.Cloud.job('myJob', req => {
        return req
          .message('hello')
          .then(() => {
            return getJobStatus(req.jobId);
          })
          .then(jobStatus => {
            expect(jobStatus.get('message')).toEqual('hello');
            expect(jobStatus.get('status')).toEqual('running');
          });
      });

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      })
        .then(async response => {
          const jobStatusId = response.headers['x-parse-job-status-id'];
          const checkJobStatus = async () => {
            const jobStatus = await getJobStatus(jobStatusId);
            return (
              jobStatus.get('finishedAt') &&
              jobStatus.get('message') === 'hello' &&
              jobStatus.get('status') === 'succeeded'
            );
          };
          while (!(await checkJobStatus())) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        })
        .then(done)
        .catch(done.fail);
    });

    it('should set the failure on the job', done => {
      Parse.Cloud.job('myJob', () => {
        return Promise.reject('Something went wrong');
      });

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      })
        .then(async response => {
          const jobStatusId = response.headers['x-parse-job-status-id'];
          const checkJobStatus = async () => {
            const jobStatus = await getJobStatus(jobStatusId);
            return (
              jobStatus.get('finishedAt') &&
              jobStatus.get('message') === 'Something went wrong' &&
              jobStatus.get('status') === 'failed'
            );
          };
          while (!(await checkJobStatus())) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        })
        .then(done)
        .catch(done.fail);
    });

    it('should set the failure message on the job error', async () => {
      Parse.Cloud.job('myJobError', () => {
        throw new Parse.Error(101, 'Something went wrong');
      });
      const job = await Parse.Cloud.startJob('myJobError');
      let jobStatus, status;
      while (status !== 'failed') {
        if (jobStatus) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        jobStatus = await Parse.Cloud.getJobStatus(job);
        status = jobStatus.get('status');
      }
      expect(jobStatus.get('message')).toEqual('Something went wrong');
    });

    function getJobStatus(jobId) {
      const q = new Parse.Query('_JobStatus');
      return q.get(jobId, { useMasterKey: true });
    }
  });
});

describe('cloud functions', () => {
  it('Should have request ip', done => {
    Parse.Cloud.define('myFunction', req => {
      expect(req.ip).toBeDefined();
      return 'success';
    });

    Parse.Cloud.run('myFunction', {}).then(() => done());
  });
});

describe('beforeSave hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.beforeSave('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeSave('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });

  it('should respect custom object ids (#6733)', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.object.id).toEqual('test_6733');
    });

    await reconfigureServer({ allowCustomObjectId: true });

    const req = request({
      // Parse JS SDK does not currently support custom object ids (see #1097), so we do a REST request
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      body: {
        objectId: 'test_6733',
        foo: 'bar',
      },
    });

    {
      const res = await req;
      expect(res.data.objectId).toEqual('test_6733');
    }

    const query = new Parse.Query('TestObject');
    query.equalTo('objectId', 'test_6733');
    const res = await query.find();
    expect(res.length).toEqual(1);
    expect(res[0].get('foo')).toEqual('bar');
  });
});

describe('afterSave hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.afterSave('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterSave('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });
});

describe('beforeDelete hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.beforeDelete('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeDelete('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });
});

describe('afterDelete hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.afterDelete('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterDelete('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });
});

describe('beforeFind hooks', () => {
  it('should add beforeFind trigger', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      expect(q instanceof Parse.Query).toBe(true);
      const jsonQuery = q.toJSON();
      expect(jsonQuery.where.key).toEqual('value');
      expect(jsonQuery.where.some).toEqual({ $gt: 10 });
      expect(jsonQuery.include).toEqual('otherKey,otherValue');
      expect(jsonQuery.excludeKeys).toBe('exclude');
      expect(jsonQuery.limit).toEqual(100);
      expect(jsonQuery.skip).toBe(undefined);
      expect(jsonQuery.order).toBe('key');
      expect(jsonQuery.keys).toBe('select');
      expect(jsonQuery.readPreference).toBe('PRIMARY');
      expect(jsonQuery.includeReadPreference).toBe('SECONDARY');
      expect(jsonQuery.subqueryReadPreference).toBe('SECONDARY_PREFERRED');

      expect(req.isGet).toEqual(false);
    });

    const query = new Parse.Query('MyObject');
    query.equalTo('key', 'value');
    query.greaterThan('some', 10);
    query.include('otherKey');
    query.include('otherValue');
    query.ascending('key');
    query.select('select');
    query.exclude('exclude');
    query.readPreference('PRIMARY', 'SECONDARY', 'SECONDARY_PREFERRED');
    query.find().then(() => {
      done();
    });
  });

  it('should use modify', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      q.equalTo('forced', true);
    });

    const obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    const obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      const query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then(results => {
        expect(results.length).toBe(1);
        const firstResult = results[0];
        expect(firstResult.get('forced')).toBe(true);
        done();
      });
    });
  });

  it('should use the modified the query', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('forced', true);
      return Parse.Query.or(q, otherQuery);
    });

    const obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    const obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      const query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then(results => {
        expect(results.length).toBe(2);
        done();
      });
    });
  });

  it('should use the modified exclude query', async () => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      q.exclude('number');
    });

    const obj = new Parse.Object('MyObject');
    obj.set('number', 100);
    obj.set('string', 'hello');
    await obj.save();

    const query = new Parse.Query('MyObject');
    query.equalTo('objectId', obj.id);
    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('number')).toBeUndefined();
    expect(results[0].get('string')).toBe('hello');
  });

  it('should reject queries', done => {
    Parse.Cloud.beforeFind('MyObject', () => {
      return Promise.reject('Do not run that query');
    });

    const query = new Parse.Query('MyObject');
    query.find().then(
      () => {
        fail('should not succeed');
        done();
      },
      err => {
        expect(err.code).toBe(141);
        expect(err.message).toEqual('Do not run that query');
        done();
      }
    );
  });

  it('should handle empty where', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('some', true);
      return Parse.Query.or(req.query, otherQuery);
    });

    request({
      url: 'http://localhost:8378/1/classes/MyObject',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
    }).then(
      () => {
        done();
      },
      err => {
        fail(err);
        done();
      }
    );
  });

  it('should handle sorting where', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const query = req.query;
      query.ascending('score');
      return query;
    });

    const count = 20;
    const objects = [];
    while (objects.length != count) {
      const object = new Parse.Object('MyObject');
      object.set('score', Math.floor(Math.random() * 100));
      objects.push(object);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.find();
      })
      .then(objects => {
        let lastScore = -1;
        objects.forEach(element => {
          expect(element.get('score') >= lastScore).toBe(true);
          lastScore = element.get('score');
        });
      })
      .then(done)
      .catch(done.fail);
  });

  it('should add beforeFind trigger using get API', done => {
    const hook = {
      method: function (req) {
        expect(req.isGet).toEqual(true);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(function () {
      request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/MyObject/' + obj.id,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
        json: true,
      }).then(response => {
        const body = response.data;
        expect(body.secretField).toEqual('SSID');
        expect(hook.method).toHaveBeenCalled();
        done();
      });
    });
  });

  it('should have request headers', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });
});

describe('afterFind hooks', () => {
  it('should add afterFind trigger', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      const q = req.query;
      expect(q instanceof Parse.Query).toBe(true);
      const jsonQuery = q.toJSON();
      expect(jsonQuery.where.key).toEqual('value');
      expect(jsonQuery.where.some).toEqual({ $gt: 10 });
      expect(jsonQuery.include).toEqual('otherKey,otherValue');
      expect(jsonQuery.excludeKeys).toBe('exclude');
      expect(jsonQuery.limit).toEqual(100);
      expect(jsonQuery.skip).toBe(undefined);
      expect(jsonQuery.order).toBe('key');
      expect(jsonQuery.keys).toBe('select');
      expect(jsonQuery.readPreference).toBe('PRIMARY');
      expect(jsonQuery.includeReadPreference).toBe('SECONDARY');
      expect(jsonQuery.subqueryReadPreference).toBe('SECONDARY_PREFERRED');
    });

    const query = new Parse.Query('MyObject');
    query.equalTo('key', 'value');
    query.greaterThan('some', 10);
    query.include('otherKey');
    query.include('otherValue');
    query.ascending('key');
    query.select('select');
    query.exclude('exclude');
    query.readPreference('PRIMARY', 'SECONDARY', 'SECONDARY_PREFERRED');
    query.find().then(() => {
      done();
    });
  });
  it('should add afterFind trigger using get', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      for (let i = 0; i < req.objects.length; i++) {
        req.objects[i].set('secretField', '###');
      }
      return req.objects;
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function () {
        const query = new Parse.Query('MyObject');
        query.get(obj.id).then(
          function (result) {
            expect(result.get('secretField')).toEqual('###');
            done();
          },
          function (error) {
            fail(error);
            done();
          }
        );
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('should add afterFind trigger using find', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      for (let i = 0; i < req.objects.length; i++) {
        req.objects[i].set('secretField', '###');
      }
      return req.objects;
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function () {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function (results) {
            expect(results[0].get('secretField')).toEqual('###');
            done();
          },
          function (error) {
            fail(error);
            done();
          }
        );
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('should filter out results', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      const filteredResults = [];
      for (let i = 0; i < req.objects.length; i++) {
        if (req.objects[i].get('secretField') === 'SSID1') {
          filteredResults.push(req.objects[i]);
        }
      }
      return filteredResults;
    });
    const obj0 = new Parse.Object('MyObject');
    obj0.set('secretField', 'SSID1');
    const obj1 = new Parse.Object('MyObject');
    obj1.set('secretField', 'SSID2');
    Parse.Object.saveAll([obj0, obj1]).then(
      function () {
        const query = new Parse.Query('MyObject');
        query.find().then(
          function (results) {
            expect(results[0].get('secretField')).toEqual('SSID1');
            expect(results.length).toEqual(1);
            done();
          },
          function (error) {
            fail(error);
            done();
          }
        );
      },
      function (error) {
        fail(error);
        done();
      }
    );
  });

  it('should handle failures', done => {
    Parse.Cloud.afterFind('MyObject', () => {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'It should fail');
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function () {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function () {
            fail('AfterFind should handle response failure correctly');
            done();
          },
          function () {
            done();
          }
        );
      },
      function () {
        done();
      }
    );
  });

  it('should also work with promise', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      return new Promise(resolve => {
        setTimeout(function () {
          for (let i = 0; i < req.objects.length; i++) {
            req.objects[i].set('secretField', '###');
          }
          resolve(req.objects);
        }, 1000);
      });
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function () {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function (results) {
            expect(results[0].get('secretField')).toEqual('###');
            done();
          },
          function (error) {
            fail(error);
          }
        );
      },
      function (error) {
        fail(error);
      }
    );
  });

  it('should alter select', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      req.query.select('white');
      return req.query;
    });

    const obj0 = new Parse.Object('MyObject').set('white', true).set('black', true);
    obj0.save().then(() => {
      new Parse.Query('MyObject').first().then(result => {
        expect(result.get('white')).toBe(true);
        expect(result.get('black')).toBe(undefined);
        done();
      });
    });
  });

  it('should not alter select', done => {
    const obj0 = new Parse.Object('MyObject').set('white', true).set('black', true);
    obj0.save().then(() => {
      new Parse.Query('MyObject').first().then(result => {
        expect(result.get('white')).toBe(true);
        expect(result.get('black')).toBe(true);
        done();
      });
    });
  });

  it('should set count to true on beforeFind hooks if query is count', done => {
    const hook = {
      method: function (req) {
        expect(req.count).toBe(true);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('Stuff', hook.method);
    new Parse.Query('Stuff').count().then(count => {
      expect(count).toBe(0);
      expect(hook.method).toHaveBeenCalled();
      done();
    });
  });

  it('should set count to false on beforeFind hooks if query is not count', done => {
    const hook = {
      method: function (req) {
        expect(req.count).toBe(false);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('Stuff', hook.method);
    new Parse.Query('Stuff').find().then(res => {
      expect(res.length).toBe(0);
      expect(hook.method).toHaveBeenCalled();
      done();
    });
  });

  it('should have request headers', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done())
      .catch(done.fail);
  });

  it('should validate triggers correctly', () => {
    expect(() => {
      Parse.Cloud.beforeSave('_Session', () => {});
    }).toThrow('Only the afterLogout trigger is allowed for the _Session class.');
    expect(() => {
      Parse.Cloud.afterSave('_Session', () => {});
    }).toThrow('Only the afterLogout trigger is allowed for the _Session class.');
    expect(() => {
      Parse.Cloud.beforeSave('_PushStatus', () => {});
    }).toThrow('Only afterSave is allowed on _PushStatus');
    expect(() => {
      Parse.Cloud.afterSave('_PushStatus', () => {});
    }).not.toThrow();
    expect(() => {
      Parse.Cloud.beforeLogin(() => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.beforeLogin('_User', () => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.beforeLogin(Parse.User, () => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.beforeLogin('SomeClass', () => {});
    }).toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.afterLogin(() => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.afterLogin('_User', () => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.afterLogin(Parse.User, () => {});
    }).not.toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.afterLogin('SomeClass', () => {});
    }).toThrow('Only the _User class is allowed for the beforeLogin and afterLogin triggers');
    expect(() => {
      Parse.Cloud.afterLogout(() => {});
    }).not.toThrow();
    expect(() => {
      Parse.Cloud.afterLogout('_Session', () => {});
    }).not.toThrow();
    expect(() => {
      Parse.Cloud.afterLogout('_User', () => {});
    }).toThrow('Only the _Session class is allowed for the afterLogout trigger.');
    expect(() => {
      Parse.Cloud.afterLogout('SomeClass', () => {});
    }).toThrow('Only the _Session class is allowed for the afterLogout trigger.');
  });

  it('should skip afterFind hooks for aggregate', done => {
    const hook = {
      method: function () {
        return Promise.reject();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.afterFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    const pipeline = [
      {
        group: { objectId: {} },
      },
    ];
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results[0].objectId).toEqual(null);
        expect(hook.method).not.toHaveBeenCalled();
        done();
      });
  });

  it('should skip afterFind hooks for distinct', done => {
    const hook = {
      method: function () {
        return Promise.reject();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.afterFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    obj.set('score', 10);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.distinct('score');
      })
      .then(results => {
        expect(results[0]).toEqual(10);
        expect(hook.method).not.toHaveBeenCalled();
        done();
      });
  });

  it('should throw error if context header is malformed', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', () => {
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', () => {
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': 'key',
      },
      body: {
        foo: 'bar',
      },
    });
    try {
      await req;
      fail('Should have thrown error');
    } catch (e) {
      expect(e).toBeDefined();
      expect(e.data.code).toEqual(Parse.Error.INVALID_JSON);
    }
    expect(calledBefore).toBe(false);
    expect(calledAfter).toBe(false);
  });

  it('should throw error if context header is string "1"', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', () => {
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', () => {
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': '1',
      },
      body: {
        foo: 'bar',
      },
    });
    try {
      await req;
      fail('Should have thrown error');
    } catch (e) {
      expect(e).toBeDefined();
      expect(e.data.code).toEqual(Parse.Error.INVALID_JSON);
    }
    expect(calledBefore).toBe(false);
    expect(calledAfter).toBe(false);
  });

  it('should expose context in beforeSave/afterSave via header', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.object.get('foo')).toEqual('bar');
      expect(req.context.otherKey).toBe(1);
      expect(req.context.key).toBe('value');
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.object.get('foo')).toEqual('bar');
      expect(req.context.otherKey).toBe(1);
      expect(req.context.key).toBe('value');
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': '{"key":"value","otherKey":1}',
      },
      body: {
        foo: 'bar',
      },
    });
    await req;
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });

  it('should override header context with body context in beforeSave/afterSave', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.object.get('foo')).toEqual('bar');
      expect(req.context.otherKey).toBe(10);
      expect(req.context.key).toBe('hello');
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.object.get('foo')).toEqual('bar');
      expect(req.context.otherKey).toBe(10);
      expect(req.context.key).toBe('hello');
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': '{"key":"value","otherKey":1}',
      },
      body: {
        foo: 'bar',
        _ApplicationId: 'test',
        _context: '{"key":"hello","otherKey":10}',
      },
    });
    await req;
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });

  it('should throw error if context body is malformed', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', () => {
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', () => {
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': '{"key":"value","otherKey":1}',
      },
      body: {
        foo: 'bar',
        _ApplicationId: 'test',
        _context: 'key',
      },
    });
    try {
      await req;
      fail('Should have thrown error');
    } catch (e) {
      expect(e).toBeDefined();
      expect(e.data.code).toEqual(Parse.Error.INVALID_JSON);
    }
    expect(calledBefore).toBe(false);
    expect(calledAfter).toBe(false);
  });

  it('should throw error if context body is string "true"', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('TestObject', () => {
      calledBefore = true;
    });
    Parse.Cloud.afterSave('TestObject', () => {
      calledAfter = true;
    });
    const req = request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      headers: {
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Cloud-Context': '{"key":"value","otherKey":1}',
      },
      body: {
        foo: 'bar',
        _ApplicationId: 'test',
        _context: 'true',
      },
    });
    try {
      await req;
      fail('Should have thrown error');
    } catch (e) {
      expect(e).toBeDefined();
      expect(e.data.code).toEqual(Parse.Error.INVALID_JSON);
    }
    expect(calledBefore).toBe(false);
    expect(calledAfter).toBe(false);
  });

  it('should expose context in before and afterSave', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('MyClass', req => {
      req.context = {
        key: 'value',
        otherKey: 1,
      };
      calledBefore = true;
    });
    Parse.Cloud.afterSave('MyClass', req => {
      expect(req.context.otherKey).toBe(1);
      expect(req.context.key).toBe('value');
      calledAfter = true;
    });

    const object = new Parse.Object('MyClass');
    await object.save();
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });

  it('should expose context in before and afterSave and let keys be set individually', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('MyClass', req => {
      req.context.some = 'value';
      req.context.yolo = 1;
      calledBefore = true;
    });
    Parse.Cloud.afterSave('MyClass', req => {
      expect(req.context.yolo).toBe(1);
      expect(req.context.some).toBe('value');
      calledAfter = true;
    });

    const object = new Parse.Object('MyClass');
    await object.save();
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });
});

describe('beforeLogin hook', () => {
  it('should run beforeLogin with correct credentials', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    await Parse.User.signUp('tupac', 'shakur');
    const user = await Parse.User.logIn('tupac', 'shakur');
    expect(hit).toBe(1);
    expect(user).toBeDefined();
    expect(user.getUsername()).toBe('tupac');
    expect(user.getSessionToken()).toBeDefined();
    done();
  });

  it('should be able to block login if an error is thrown', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    await user.save({ isBanned: true });

    try {
      await Parse.User.logIn('tupac', 'shakur');
      throw new Error('should not have been logged in.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }
    expect(hit).toBe(1);
    done();
  });

  it('should be able to block login if an error is thrown even if the user has a attached file', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    const base64 = 'V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=';
    const file = new Parse.File('myfile.txt', { base64 });
    await file.save();
    await user.save({ isBanned: true, file });

    try {
      await Parse.User.logIn('tupac', 'shakur');
      throw new Error('should not have been logged in.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }
    expect(hit).toBe(1);
    done();
  });

  it('should not run beforeLogin with incorrect credentials', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    await Parse.User.signUp('tupac', 'shakur');
    try {
      await Parse.User.logIn('tony', 'shakur');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
    expect(hit).toBe(0);
    done();
  });

  it('should not run beforeLogin on sign up', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    expect(user).toBeDefined();
    expect(hit).toBe(0);
    done();
  });

  it('should trigger afterLogout hook on logout', async done => {
    let userId;
    Parse.Cloud.afterLogout(req => {
      expect(req.object.className).toEqual('_Session');
      expect(req.object.id).toBeDefined();
      const user = req.object.get('user');
      expect(user).toBeDefined();
      userId = user.id;
    });

    const user = await Parse.User.signUp('user', 'pass');
    await Parse.User.logOut();
    expect(user.id).toBe(userId);
    done();
  });

  it('should have expected data in request', async done => {
    Parse.Cloud.beforeLogin(req => {
      expect(req.object).toBeDefined();
      expect(req.user).toBeUndefined();
      expect(req.headers).toBeDefined();
      expect(req.ip).toBeDefined();
      expect(req.installationId).toBeDefined();
      expect(req.context).toBeUndefined();
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    done();
  });

  it('afterFind should not be triggered when saving an object', async () => {
    let beforeSaves = 0;
    Parse.Cloud.beforeSave('SavingTest', () => {
      beforeSaves++;
    });

    let afterSaves = 0;
    Parse.Cloud.afterSave('SavingTest', () => {
      afterSaves++;
    });

    let beforeFinds = 0;
    Parse.Cloud.beforeFind('SavingTest', () => {
      beforeFinds++;
    });

    let afterFinds = 0;
    Parse.Cloud.afterFind('SavingTest', () => {
      afterFinds++;
    });

    const obj = new Parse.Object('SavingTest');
    obj.set('someField', 'some value 1');
    await obj.save();

    expect(beforeSaves).toEqual(1);
    expect(afterSaves).toEqual(1);
    expect(beforeFinds).toEqual(0);
    expect(afterFinds).toEqual(0);

    obj.set('someField', 'some value 2');
    await obj.save();

    expect(beforeSaves).toEqual(2);
    expect(afterSaves).toEqual(2);
    expect(beforeFinds).toEqual(0);
    expect(afterFinds).toEqual(0);

    await obj.fetch();

    expect(beforeSaves).toEqual(2);
    expect(afterSaves).toEqual(2);
    expect(beforeFinds).toEqual(1);
    expect(afterFinds).toEqual(1);

    obj.set('someField', 'some value 3');
    await obj.save();

    expect(beforeSaves).toEqual(3);
    expect(afterSaves).toEqual(3);
    expect(beforeFinds).toEqual(1);
    expect(afterFinds).toEqual(1);
  });
});

describe('afterLogin hook', () => {
  it('should run afterLogin after successful login', async done => {
    let hit = 0;
    Parse.Cloud.afterLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('testuser');
    });

    await Parse.User.signUp('testuser', 'p@ssword');
    const user = await Parse.User.logIn('testuser', 'p@ssword');
    expect(hit).toBe(1);
    expect(user).toBeDefined();
    expect(user.getUsername()).toBe('testuser');
    expect(user.getSessionToken()).toBeDefined();
    done();
  });

  it('should not run afterLogin after unsuccessful login', async done => {
    let hit = 0;
    Parse.Cloud.afterLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('testuser');
    });

    await Parse.User.signUp('testuser', 'p@ssword');
    try {
      await Parse.User.logIn('testuser', 'badpassword');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
    expect(hit).toBe(0);
    done();
  });

  it('should not run afterLogin on sign up', async done => {
    let hit = 0;
    Parse.Cloud.afterLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('testuser');
    });

    const user = await Parse.User.signUp('testuser', 'p@ssword');
    expect(user).toBeDefined();
    expect(hit).toBe(0);
    done();
  });

  it('should have expected data in request', async done => {
    Parse.Cloud.afterLogin(req => {
      expect(req.object).toBeDefined();
      expect(req.user).toBeDefined();
      expect(req.headers).toBeDefined();
      expect(req.ip).toBeDefined();
      expect(req.installationId).toBeDefined();
      expect(req.context).toBeUndefined();
    });

    await Parse.User.signUp('testuser', 'p@ssword');
    await Parse.User.logIn('testuser', 'p@ssword');
    done();
  });

  it('context options should override _context object property when saving a new object', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
      expect(req.context.hello).not.toBeDefined();
      expect(req._context).not.toBeDefined();
      expect(req.object._context).not.toBeDefined();
      expect(req.object.context).not.toBeDefined();
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
      expect(req.context.hello).not.toBeDefined();
      expect(req._context).not.toBeDefined();
      expect(req.object._context).not.toBeDefined();
      expect(req.object.context).not.toBeDefined();
    });
    const obj = new TestObject();
    obj.set('_context', { hello: 'world' });
    await obj.save(null, { context: { a: 'a' } });
  });

  it('should have access to context when saving a new object', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj = new TestObject();
    await obj.save(null, { context: { a: 'a' } });
  });

  it('should have access to context when saving an existing object', async () => {
    const obj = new TestObject();
    await obj.save(null);
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    await obj.save(null, { context: { a: 'a' } });
  });

  it('should have access to context when saving a new object in a trigger', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TriggerObject', async () => {
      const obj = new TestObject();
      await obj.save(null, { context: { a: 'a' } });
    });
    const obj = new Parse.Object('TriggerObject');
    await obj.save(null);
  });

  it('should have access to context when cascade-saving objects', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.beforeSave('TestObject2', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject2', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj = new Parse.Object('TestObject');
    const obj2 = new Parse.Object('TestObject2');
    obj.set('obj2', obj2);
    await obj.save(null, { context: { a: 'a' } });
  });

  it('should have access to context as saveAll argument', async () => {
    Parse.Cloud.beforeSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    await Parse.Object.saveAll([obj1, obj2], { context: { a: 'a' } });
  });

  it('should have access to context as destroyAll argument', async () => {
    Parse.Cloud.beforeDelete('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterDelete('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj1 = new TestObject();
    const obj2 = new TestObject();
    await Parse.Object.saveAll([obj1, obj2]);
    await Parse.Object.destroyAll([obj1, obj2], { context: { a: 'a' } });
  });

  it('should have access to context as destroy a object', async () => {
    Parse.Cloud.beforeDelete('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterDelete('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj = new TestObject();
    await obj.save();
    await obj.destroy({ context: { a: 'a' } });
  });

  it('should have access to context in beforeFind hook', async () => {
    Parse.Cloud.beforeFind('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const query = new Parse.Query('TestObject');
    return query.find({ context: { a: 'a' } });
  });

  it('should have access to context when cloud function is called.', async () => {
    Parse.Cloud.define('contextTest', async req => {
      expect(req.context.a).toEqual('a');
      return {};
    });

    await Parse.Cloud.run('contextTest', {}, { context: { a: 'a' } });
  });

  it('afterFind should have access to context', async () => {
    Parse.Cloud.afterFind('TestObject', req => {
      expect(req.context.a).toEqual('a');
    });
    const obj = new TestObject();
    await obj.save();
    const query = new Parse.Query(TestObject);
    await query.find({ context: { a: 'a' } });
  });
});

describe('saveFile hooks', () => {
  it('beforeSaveFile should return file that is already saved and not save anything to files adapter', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const createFileSpy = spyOn(mockAdapter, 'createFile').and.callThrough();
    Parse.Cloud.beforeSaveFile(() => {
      const newFile = new Parse.File('some-file.txt');
      newFile._url = 'http://www.somewhere.com/parse/files/some-app-id/some-file.txt';
      return newFile;
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    expect(result._name).toBe('some-file.txt');
    expect(result._url).toBe('http://www.somewhere.com/parse/files/some-app-id/some-file.txt');
    expect(createFileSpy).not.toHaveBeenCalled();
  });

  it('beforeSaveFile should throw error', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeSaveFile(() => {
      throw new Parse.Error(400, 'some-error-message');
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    try {
      await file.save({ useMasterKey: true });
    } catch (error) {
      expect(error.message).toBe('some-error-message');
    }
  });

  it('beforeSaveFile should change values of uploaded file by editing fileObject directly', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const createFileSpy = spyOn(mockAdapter, 'createFile').and.callThrough();
    Parse.Cloud.beforeSaveFile(async req => {
      expect(req.triggerName).toEqual('beforeSaveFile');
      expect(req.master).toBe(true);
      req.file.addMetadata('foo', 'bar');
      req.file.addTag('tagA', 'some-tag');
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
    const newData = new Buffer([1, 2, 3]);
    const newOptions = {
      tags: {
        tagA: 'some-tag',
      },
      metadata: {
        foo: 'bar',
      },
    };
    expect(createFileSpy).toHaveBeenCalledWith(
      jasmine.any(String),
      newData,
      'text/plain',
      newOptions
    );
  });

  it('beforeSaveFile should change values by returning new fileObject', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const createFileSpy = spyOn(mockAdapter, 'createFile').and.callThrough();
    Parse.Cloud.beforeSaveFile(async req => {
      expect(req.triggerName).toEqual('beforeSaveFile');
      expect(req.fileSize).toBe(3);
      const newFile = new Parse.File('donald_duck.pdf', [4, 5, 6], 'application/pdf');
      newFile.setMetadata({ foo: 'bar' });
      newFile.setTags({ tagA: 'some-tag' });
      return newFile;
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBeInstanceOf(Parse.File);
    const newData = new Buffer([4, 5, 6]);
    const newContentType = 'application/pdf';
    const newOptions = {
      tags: {
        tagA: 'some-tag',
      },
      metadata: {
        foo: 'bar',
      },
    };
    expect(createFileSpy).toHaveBeenCalledWith(
      jasmine.any(String),
      newData,
      newContentType,
      newOptions
    );
    const expectedFileName = 'donald_duck.pdf';
    expect(file._name.indexOf(expectedFileName)).toBe(file._name.length - expectedFileName.length);
  });

  it('beforeSaveFile should contain metadata and tags saved from client', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const createFileSpy = spyOn(mockAdapter, 'createFile').and.callThrough();
    Parse.Cloud.beforeSaveFile(async req => {
      expect(req.triggerName).toEqual('beforeSaveFile');
      expect(req.fileSize).toBe(3);
      expect(req.file).toBeInstanceOf(Parse.File);
      expect(req.file.name()).toBe('popeye.txt');
      expect(req.file.metadata()).toEqual({ foo: 'bar' });
      expect(req.file.tags()).toEqual({ bar: 'foo' });
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    file.setMetadata({ foo: 'bar' });
    file.setTags({ bar: 'foo' });
    const result = await file.save({ useMasterKey: true });
    expect(result).toBeInstanceOf(Parse.File);
    const options = {
      metadata: { foo: 'bar' },
      tags: { bar: 'foo' },
    };
    expect(createFileSpy).toHaveBeenCalledWith(
      jasmine.any(String),
      jasmine.any(Buffer),
      'text/plain',
      options
    );
  });

  it('beforeSaveFile should return same file data with new file name', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const config = Config.get('test');
    config.filesController.options.preserveFileName = true;
    Parse.Cloud.beforeSaveFile(async ({ file }) => {
      expect(file.name()).toBe('popeye.txt');
      const fileData = await file.getData();
      const newFile = new Parse.File('2020-04-01.txt', { base64: fileData });
      return newFile;
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result.name()).toBe('2020-04-01.txt');
  });

  it('afterSaveFile should set fileSize to null if beforeSave returns an already saved file', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    const createFileSpy = spyOn(mockAdapter, 'createFile').and.callThrough();
    Parse.Cloud.beforeSaveFile(req => {
      expect(req.fileSize).toBe(3);
      const newFile = new Parse.File('some-file.txt');
      newFile._url = 'http://www.somewhere.com/parse/files/some-app-id/some-file.txt';
      return newFile;
    });
    Parse.Cloud.afterSaveFile(req => {
      expect(req.fileSize).toBe(null);
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(result);
    expect(result._name).toBe('some-file.txt');
    expect(result._url).toBe('http://www.somewhere.com/parse/files/some-app-id/some-file.txt');
    expect(createFileSpy).not.toHaveBeenCalled();
  });

  it('afterSaveFile should throw error', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.afterSaveFile(async () => {
      throw new Parse.Error(400, 'some-error-message');
    });
    const filename = 'donald_duck.pdf';
    const file = new Parse.File(filename, [1, 2, 3], 'text/plain');
    try {
      await file.save({ useMasterKey: true });
    } catch (error) {
      expect(error.message).toBe('some-error-message');
    }
  });

  it('afterSaveFile should call with fileObject', async done => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeSaveFile(async req => {
      req.file.setTags({ tagA: 'some-tag' });
      req.file.setMetadata({ foo: 'bar' });
    });
    Parse.Cloud.afterSaveFile(async req => {
      expect(req.master).toBe(true);
      expect(req.file._tags).toEqual({ tagA: 'some-tag' });
      expect(req.file._metadata).toEqual({ foo: 'bar' });
      done();
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save({ useMasterKey: true });
  });

  it('afterSaveFile should change fileSize when file data changes', async done => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeSaveFile(async req => {
      expect(req.fileSize).toBe(3);
      expect(req.master).toBe(true);
      const newFile = new Parse.File('donald_duck.pdf', [4, 5, 6, 7, 8, 9], 'application/pdf');
      return newFile;
    });
    Parse.Cloud.afterSaveFile(async req => {
      expect(req.fileSize).toBe(6);
      expect(req.master).toBe(true);
      done();
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    await file.save({ useMasterKey: true });
  });

  it('beforeDeleteFile should call with fileObject', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeDeleteFile(req => {
      expect(req.file).toBeInstanceOf(Parse.File);
      expect(req.file._name).toEqual('popeye.txt');
      expect(req.file._url).toEqual('http://www.somewhere.com/popeye.txt');
      expect(req.fileSize).toBe(null);
    });
    const file = new Parse.File('popeye.txt');
    await file.destroy({ useMasterKey: true });
  });

  it('beforeDeleteFile should throw error', async done => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeDeleteFile(() => {
      throw new Error('some error message');
    });
    const file = new Parse.File('popeye.txt');
    try {
      await file.destroy({ useMasterKey: true });
    } catch (error) {
      expect(error.message).toBe('some error message');
      done();
    }
  });

  it('afterDeleteFile should call with fileObject', async done => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeDeleteFile(req => {
      expect(req.file).toBeInstanceOf(Parse.File);
      expect(req.file._name).toEqual('popeye.txt');
      expect(req.file._url).toEqual('http://www.somewhere.com/popeye.txt');
    });
    Parse.Cloud.afterDeleteFile(req => {
      expect(req.file).toBeInstanceOf(Parse.File);
      expect(req.file._name).toEqual('popeye.txt');
      expect(req.file._url).toEqual('http://www.somewhere.com/popeye.txt');
      done();
    });
    const file = new Parse.File('popeye.txt');
    await file.destroy({ useMasterKey: true });
  });

  it('beforeSaveFile should not change file if nothing is returned', async () => {
    await reconfigureServer({ filesAdapter: mockAdapter });
    Parse.Cloud.beforeSaveFile(() => {
      return;
    });
    const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
    const result = await file.save({ useMasterKey: true });
    expect(result).toBe(file);
  });

  it('throw custom error from beforeSaveFile', async done => {
    Parse.Cloud.beforeSaveFile(() => {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'It should fail');
    });
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      fail('error should have thrown');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.SCRIPT_FAILED);
      done();
    }
  });

  it('throw empty error from beforeSaveFile', async done => {
    Parse.Cloud.beforeSaveFile(() => {
      throw null;
    });
    try {
      const file = new Parse.File('popeye.txt', [1, 2, 3], 'text/plain');
      await file.save({ useMasterKey: true });
      fail('error should have thrown');
    } catch (e) {
      expect(e.code).toBe(130);
      done();
    }
  });
});

describe('sendEmail', () => {
  it('can send email via Parse.Cloud', async done => {
    const emailAdapter = {
      sendMail: mailData => {
        expect(mailData).toBeDefined();
        expect(mailData.to).toBe('test');
        reconfigureServer().then(done, done);
      },
    };
    await reconfigureServer({
      emailAdapter: emailAdapter,
    });
    const mailData = { to: 'test' };
    await Parse.Cloud.sendEmail(mailData);
  });

  it('cannot send email without adapter', async () => {
    const logger = require('../lib/logger').logger;
    spyOn(logger, 'error').and.callFake(() => {});
    await Parse.Cloud.sendEmail({});
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to send email because no mail adapter is configured for Parse Server.'
    );
  });
});
