// This is a port of the test suite:
// hungry/js/test/parse_file_test.js

'use strict';

const { FilesController } = require('../lib/Controllers/FilesController');
const request = require('../lib/request');

const str = 'Hello World!';
const data = [];
for (let i = 0; i < str.length; i++) {
  data.push(str.charCodeAt(i));
}

describe('Parse.File testing', () => {
  describe('creating files', () => {
    it('works with Content-Type', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/_file.txt$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.txt$/);
        request({ url: b.url }).then(response => {
          const body = response.text;
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });

    it('works with _ContentType', done => {
      request({
        method: 'POST',
        url: 'http://localhost:8378/1/files/file',
        body: JSON.stringify({
          _ApplicationId: 'test',
          _JavaScriptKey: 'test',
          _ContentType: 'text/html',
          base64: 'PGh0bWw+PC9odG1sPgo=',
        }),
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/_file.html/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.html$/);
        request({ url: b.url }).then(response => {
          const body = response.text;
          try {
            expect(response.headers['content-type']).toMatch('^text/html');
            expect(body).toEqual('<html></html>\n');
          } catch (e) {
            jfail(e);
          }
          done();
        });
      });
    });

    it('works without Content-Type', done => {
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/_file.txt$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*file.txt$/);
        request({ url: b.url }).then(response => {
          expect(response.text).toEqual('argle bargle');
          done();
        });
      });
    });

    it('supports REST end-to-end file create, read, delete, read', done => {
      const headers = {
        'Content-Type': 'image/jpeg',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/testfile.txt',
        body: 'check one two',
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/_testfile.txt$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*testfile.txt$/);
        request({ url: b.url }).then(response => {
          const body = response.text;
          expect(body).toEqual('check one two');
          request({
            method: 'DELETE',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
              'X-Parse-Master-Key': 'test',
            },
            url: 'http://localhost:8378/1/files/' + b.name,
          }).then(response => {
            expect(response.status).toEqual(200);
            request({
              headers: {
                'X-Parse-Application-Id': 'test',
                'X-Parse-REST-API-Key': 'rest',
              },
              url: b.url,
            }).then(fail, response => {
              expect(response.status).toEqual(404);
              done();
            });
          });
        });
      });
    });

    it('blocks file deletions with missing or incorrect master-key header', done => {
      const headers = {
        'Content-Type': 'image/jpeg',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/thefile.jpg',
        body: 'the file body',
      }).then(response => {
        const b = response.data;
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/test\/.*thefile.jpg$/);
        // missing X-Parse-Master-Key header
        request({
          method: 'DELETE',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
          url: 'http://localhost:8378/1/files/' + b.name,
        }).then(fail, response => {
          const del_b = response.data;
          expect(response.status).toEqual(403);
          expect(del_b.error).toMatch(/unauthorized/);
          // incorrect X-Parse-Master-Key header
          request({
            method: 'DELETE',
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
              'X-Parse-Master-Key': 'tryagain',
            },
            url: 'http://localhost:8378/1/files/' + b.name,
          }).then(fail, response => {
            const del_b2 = response.data;
            expect(response.status).toEqual(403);
            expect(del_b2.error).toMatch(/unauthorized/);
            done();
          });
        });
      });
    });

    it('handles other filetypes', done => {
      const headers = {
        'Content-Type': 'image/jpeg',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.jpg',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/_file.jpg$/);
        expect(b.url).toMatch(/^http:\/\/localhost:8378\/1\/files\/.*file.jpg$/);
        request({ url: b.url }).then(response => {
          const body = response.text;
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });

    it('save file', async () => {
      const file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());
      const result = await file.save();
      strictEqual(result, file);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello.txt');
    });

    it('saves the file with tags', async () => {
      spyOn(FilesController.prototype, 'createFile').and.callThrough();
      const file = new Parse.File('hello.txt', data, 'text/plain');
      const tags = { hello: 'world' };
      file.setTags(tags);
      expect(file.url()).toBeUndefined();
      const result = await file.save();
      expect(file.name()).toBeDefined();
      expect(file.url()).toBeDefined();
      expect(result.tags()).toEqual(tags);
      expect(FilesController.prototype.createFile.calls.argsFor(0)[4]).toEqual({
        tags: tags,
        metadata: {},
      });
    });

    it('does not pass empty file tags while saving', async () => {
      spyOn(FilesController.prototype, 'createFile').and.callThrough();
      const file = new Parse.File('hello.txt', data, 'text/plain');
      expect(file.url()).toBeUndefined();
      expect(file.name()).toBeDefined();
      await file.save();
      expect(file.url()).toBeDefined();
      expect(FilesController.prototype.createFile.calls.argsFor(0)[4]).toEqual({
        metadata: {},
      });
    });

    it('save file in object', async done => {
      const file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());
      const result = await file.save();
      strictEqual(result, file);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello.txt');

      const object = new Parse.Object('TestObject');
      await object.save({ file: file });
      const objectAgain = await new Parse.Query('TestObject').get(object.id);
      ok(objectAgain.get('file') instanceof Parse.File);
      done();
    });

    it('save file in object with escaped characters in filename', async () => {
      const file = new Parse.File('hello . txt', data, 'text/plain');
      ok(!file.url());
      const result = await file.save();
      strictEqual(result, file);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello . txt');

      const object = new Parse.Object('TestObject');
      await object.save({ file });
      const objectAgain = await new Parse.Query('TestObject').get(object.id);
      ok(objectAgain.get('file') instanceof Parse.File);
    });

    it('autosave file in object', async done => {
      let file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());
      const object = new Parse.Object('TestObject');
      await object.save({ file });
      const objectAgain = await new Parse.Query('TestObject').get(object.id);
      file = objectAgain.get('file');
      ok(file instanceof Parse.File);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello.txt');
      done();
    });

    it('autosave file in object in object', async done => {
      let file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());

      const child = new Parse.Object('Child');
      child.set('file', file);

      const parent = new Parse.Object('Parent');
      parent.set('child', child);

      await parent.save();
      const query = new Parse.Query('Parent');
      query.include('child');
      const parentAgain = await query.get(parent.id);
      const childAgain = parentAgain.get('child');
      file = childAgain.get('file');
      ok(file instanceof Parse.File);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello.txt');
      done();
    });

    it('saving an already saved file', async () => {
      const file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());
      const result = await file.save();
      strictEqual(result, file);
      ok(file.name());
      ok(file.url());
      notEqual(file.name(), 'hello.txt');
      const previousName = file.name();

      await file.save();
      equal(file.name(), previousName);
    });

    it('two saves at the same time', done => {
      const file = new Parse.File('hello.txt', data, 'text/plain');

      let firstName;
      let secondName;

      const firstSave = file.save().then(function () {
        firstName = file.name();
      });
      const secondSave = file.save().then(function () {
        secondName = file.name();
      });

      Promise.all([firstSave, secondSave]).then(
        function () {
          equal(firstName, secondName);
          done();
        },
        function (error) {
          ok(false, error);
          done();
        }
      );
    });

    it('file toJSON testing', async () => {
      const file = new Parse.File('hello.txt', data, 'text/plain');
      ok(!file.url());
      const object = new Parse.Object('TestObject');
      await object.save({
        file: file,
      });
      ok(object.toJSON().file.url);
    });

    it('content-type used with no extension', done => {
      const headers = {
        'Content-Type': 'text/html',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file',
        body: 'fee fi fo',
      }).then(response => {
        const b = response.data;
        expect(b.name).toMatch(/\.html$/);
        request({ url: b.url }).then(response => {
          expect(response.headers['content-type']).toMatch(/^text\/html/);
          done();
        });
      });
    });

    it('filename is url encoded', done => {
      const headers = {
        'Content-Type': 'text/html',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/hello world.txt',
        body: 'oh emm gee',
      }).then(response => {
        const b = response.data;
        expect(b.url).toMatch(/hello%20world/);
        done();
      });
    });

    it('supports files in json that inside of array', async done => {
      const oldBaseUrl = "http://old-file-url.example.com";
      const newBaseUrl = "http://new-file-url.example.com";

      const mockAdapterOld = {
        createFile: async filename => ({
          name: filename,
          location: `${oldBaseUrl}/${filename}`,
        }),
        deleteFile: () => {},
        getFileData: () => {},
        getFileLocation: (config, filename) => `${oldBaseUrl}/${filename}`,
        validateFilename: () => {
          return null;
        },
      };
      await reconfigureServer({ filesAdapter: mockAdapterOld });

      const base64 = "V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=";
      const file = new Parse.File("myFile", { base64: base64 });

      const jsonItem = {"file": file};

      const fileArray = [jsonItem];
      const obj = new Parse.Object('FilesInJsonInArrayTest');
      obj.set('files', fileArray);
      await obj.save();

      const mockAdapterNew = {
        createFile: async filename => ({
          name: filename,
          location: `${newBaseUrl}/${filename}`,
        }),
        deleteFile: () => {},
        getFileData: () => {},
        getFileLocation: (config, filename) => `${newBaseUrl}/${filename}`,
        validateFilename: () => {
          return null;
        },
      };
      await reconfigureServer({ filesAdapter: mockAdapterNew });

      const query = new Parse.Query('FilesInJsonInArrayTest');
      const result = await query.first();

      const filesAgain = result.get('files');
      expect(filesAgain.length).toEqual(1);
      expect(filesAgain[0].file.name()).toMatch(/myFile/);
      expect(filesAgain[0].file.url()).toEqual(newBaseUrl + '/' + filesAgain[0].file.name());
      done();
    });

    it('supports files in array', async done => {
      const oldBaseUrl = "http://old-file-url.example.com";
      const newBaseUrl = "http://new-file-url.example.com";

      const mockAdapterOld = {
        createFile: async filename => ({
          name: filename,
          location: `${oldBaseUrl}/${filename}`,
        }),
        deleteFile: () => {},
        getFileData: () => {},
        getFileLocation: (config, filename) => `${oldBaseUrl}/${filename}`,
        validateFilename: () => {
          return null;
        },
      };
      await reconfigureServer({ filesAdapter: mockAdapterOld });

      const base64 = "V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=";
      const file = new Parse.File("myFile", { base64: base64 });

      const fileArray = [file];
      const obj = new Parse.Object('FilesInArrayTest');
      obj.set('files', fileArray);
      await obj.save();

      const mockAdapterNew = {
        createFile: async filename => ({
          name: filename,
          location: `${newBaseUrl}/${filename}`,
        }),
        deleteFile: () => {},
        getFileData: () => {},
        getFileLocation: (config, filename) => `${newBaseUrl}/${filename}`,
        validateFilename: () => {
          return null;
        },
      };
      await reconfigureServer({ filesAdapter: mockAdapterNew });

      const query = new Parse.Query('FilesInArrayTest');
      const result = await query.first();

      const filesAgain = result.get('files');
      expect(filesAgain.length).toEqual(1);
      expect(filesAgain[0].name()).toMatch(/myFile/);
      expect(filesAgain[0].url()).toEqual(newBaseUrl + '/' + filesAgain[0].name());
      done();
    });

    it('supports array of files', done => {
      const file = {
        __type: 'File',
        url: 'http://meep.meep',
        name: 'meep',
      };
      const files = [file, file];
      const obj = new Parse.Object('FilesArrayTest');
      obj.set('files', files);
      obj
        .save()
        .then(() => {
          const query = new Parse.Query('FilesArrayTest');
          return query.first();
        })
        .then(result => {
          const filesAgain = result.get('files');
          expect(filesAgain.length).toEqual(2);
          expect(filesAgain[0].name()).toEqual('meep');
          expect(filesAgain[0].url()).toEqual('http://meep.meep');
          done();
        });
    });

    it('validates filename characters', done => {
      const headers = {
        'Content-Type': 'text/plain',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/di$avowed.txt',
        body: 'will fail',
      }).then(fail, response => {
        const b = response.data;
        expect(b.code).toEqual(122);
        done();
      });
    });

    it('validates filename length', done => {
      const headers = {
        'Content-Type': 'text/plain',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      const fileName =
        'Onceuponamidnightdrearywhileiponderedweak' +
        'andwearyOveramanyquaintandcuriousvolumeof' +
        'forgottenloreWhileinoddednearlynappingsud' +
        'denlytherecameatapping';
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/' + fileName,
        body: 'will fail',
      }).then(fail, response => {
        const b = response.data;
        expect(b.code).toEqual(122);
        done();
      });
    });

    it('supports a dictionary with file', done => {
      const file = {
        __type: 'File',
        url: 'http://meep.meep',
        name: 'meep',
      };
      const dict = {
        file: file,
      };
      const obj = new Parse.Object('FileObjTest');
      obj.set('obj', dict);
      obj
        .save()
        .then(() => {
          const query = new Parse.Query('FileObjTest');
          return query.first();
        })
        .then(result => {
          const dictAgain = result.get('obj');
          expect(typeof dictAgain).toEqual('object');
          const fileAgain = dictAgain['file'];
          expect(fileAgain.name()).toEqual('meep');
          expect(fileAgain.url()).toEqual('http://meep.meep');
          done();
        })
        .catch(e => {
          jfail(e);
          done();
        });
    });

    it('creates correct url for old files hosted on files.parsetfss.com', done => {
      const file = {
        __type: 'File',
        url: 'http://irrelevant.elephant/',
        name: 'tfss-123.txt',
      };
      const obj = new Parse.Object('OldFileTest');
      obj.set('oldfile', file);
      obj
        .save()
        .then(() => {
          const query = new Parse.Query('OldFileTest');
          return query.first();
        })
        .then(result => {
          const fileAgain = result.get('oldfile');
          expect(fileAgain.url()).toEqual('http://files.parsetfss.com/test/tfss-123.txt');
          done();
        })
        .catch(e => {
          jfail(e);
          done();
        });
    });

    it('creates correct url for old files hosted on files.parse.com', done => {
      const file = {
        __type: 'File',
        url: 'http://irrelevant.elephant/',
        name: 'd6e80979-a128-4c57-a167-302f874700dc-123.txt',
      };
      const obj = new Parse.Object('OldFileTest');
      obj.set('oldfile', file);
      obj
        .save()
        .then(() => {
          const query = new Parse.Query('OldFileTest');
          return query.first();
        })
        .then(result => {
          const fileAgain = result.get('oldfile');
          expect(fileAgain.url()).toEqual(
            'http://files.parse.com/test/d6e80979-a128-4c57-a167-302f874700dc-123.txt'
          );
          done();
        })
        .catch(e => {
          jfail(e);
          done();
        });
    });

    it('supports files in objects without urls', done => {
      const file = {
        __type: 'File',
        name: '123.txt',
      };
      const obj = new Parse.Object('FileTest');
      obj.set('file', file);
      obj
        .save()
        .then(() => {
          const query = new Parse.Query('FileTest');
          return query.first();
        })
        .then(result => {
          const fileAgain = result.get('file');
          expect(fileAgain.url()).toMatch(/123.txt$/);
          done();
        })
        .catch(e => {
          jfail(e);
          done();
        });
    });

    it('return with publicServerURL when provided', done => {
      reconfigureServer({
        publicServerURL: 'https://mydomain/parse',
      })
        .then(() => {
          const file = {
            __type: 'File',
            name: '123.txt',
          };
          const obj = new Parse.Object('FileTest');
          obj.set('file', file);
          return obj.save();
        })
        .then(() => {
          const query = new Parse.Query('FileTest');
          return query.first();
        })
        .then(result => {
          const fileAgain = result.get('file');
          expect(fileAgain.url().indexOf('https://mydomain/parse')).toBe(0);
          done();
        })
        .catch(e => {
          jfail(e);
          done();
        });
    });

    it('fails to upload an empty file', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: '',
      }).then(fail, response => {
        expect(response.status).toBe(400);
        const body = response.text;
        expect(body).toEqual('{"code":130,"error":"Invalid file upload."}');
        done();
      });
    });

    it('fails to upload without a file name', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/',
        body: 'yolo',
      }).then(fail, response => {
        expect(response.status).toBe(400);
        const body = response.text;
        expect(body).toEqual('{"code":122,"error":"Filename not provided."}');
        done();
      });
    });
  });

  describe('deleting files', () => {
    it('fails to delete an unkown file', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Master-Key': 'test',
      };
      request({
        method: 'DELETE',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
      }).then(fail, response => {
        expect(response.status).toBe(400);
        const body = response.text;
        expect(typeof body).toBe('string');
        const { code, error } = JSON.parse(body);
        expect(code).toBe(153);
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
        done();
      });
    });
  });

  xdescribe('Gridstore Range tests', () => {
    it('supports range requests', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=0-5',
          },
        }).then(response => {
          const body = response.text;
          expect(body).toEqual('argle ');
          done();
        });
      });
    });

    it('supports small range requests', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=0-2',
          },
        }).then(response => {
          const body = response.text;
          expect(body).toEqual('arg');
          done();
        });
      });
    });

    // See specs https://www.greenbytes.de/tech/webdav/draft-ietf-httpbis-p5-range-latest.html#byte.ranges
    it('supports getting one byte', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=2-2',
          },
        }).then(response => {
          const body = response.text;
          expect(body).toEqual('g');
          done();
        });
      });
    });

    xit('supports getting last n bytes', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'something different',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=-4',
          },
        }).then(response => {
          const body = response.text;
          expect(body.length).toBe(4);
          expect(body).toEqual('rent');
          done();
        });
      });
    });

    it('supports getting first n bytes', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'something different',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=10-',
          },
        }).then(response => {
          const body = response.text;
          expect(body).toEqual('different');
          done();
        });
      });
    });

    function repeat(string, count) {
      let s = string;
      while (count > 0) {
        s += string;
        count--;
      }
      return s;
    }

    it('supports large range requests', done => {
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: repeat('argle bargle', 100),
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=13-240',
          },
        }).then(response => {
          const body = response.text;
          expect(body.length).toEqual(228);
          expect(body.indexOf('rgle barglea')).toBe(0);
          done();
        });
      });
    });

    it('fails to stream unknown file', done => {
      request({
        url: 'http://localhost:8378/1/files/test/file.txt',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          Range: 'bytes=13-240',
        },
      }).then(response => {
        expect(response.status).toBe(404);
        const body = response.text;
        expect(body).toEqual('File not found.');
        done();
      });
    });
  });

  // Because GridStore is not loaded on PG, those are perfect
  // for fallback tests
  describe_only_db('postgres')('Default Range tests', () => {
    it('fallback to regular request', async done => {
      await reconfigureServer();
      const headers = {
        'Content-Type': 'application/octet-stream',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };
      request({
        method: 'POST',
        headers: headers,
        url: 'http://localhost:8378/1/files/file.txt',
        body: 'argle bargle',
      }).then(response => {
        const b = response.data;
        request({
          url: b.url,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            Range: 'bytes=0-5',
          },
        }).then(response => {
          const body = response.text;
          expect(body).toEqual('argle bargle');
          done();
        });
      });
    });
  });

  describe('file upload configuration', () => {
    it('allows file upload only for authenticated user by default', async () => {
      await reconfigureServer({
        fileUpload: {},
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeResolved();
    });

    it('allows file upload with master key', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: false,
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
        },
      });
      const file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save({ useMasterKey: true })).toBeResolved();
    });

    it('rejects all file uploads', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: false,
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
        },
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload by authenticated user is disabled.'
        )
      );
    });

    it('allows all file uploads', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: true,
          enableForAnonymousUser: true,
          enableForAuthenticatedUser: true,
        },
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeResolved();
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeResolved();
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeResolved();
    });

    it('allows file upload only for public', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: true,
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: false,
        },
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeResolved();
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload by authenticated user is disabled.'
        )
      );
    });

    it('allows file upload only for anonymous user', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: false,
          enableForAnonymousUser: true,
          enableForAuthenticatedUser: false,
        },
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeResolved();
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.FILE_SAVE_ERROR,
          'File upload by authenticated user is disabled.'
        )
      );
    });

    it('allows file upload only for authenticated user', async () => {
      await reconfigureServer({
        fileUpload: {
          enableForPublic: false,
          enableForAnonymousUser: false,
          enableForAuthenticatedUser: true,
        },
      });
      let file = new Parse.File('hello.txt', data, 'text/plain');
      await expectAsync(file.save()).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const anonUser = await Parse.AnonymousUtils.logIn();
      await expectAsync(file.save({ sessionToken: anonUser.getSessionToken() })).toBeRejectedWith(
        new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.')
      );
      file = new Parse.File('hello.txt', data, 'text/plain');
      const authUser = await Parse.User.signUp('user', 'password');
      await expectAsync(file.save({ sessionToken: authUser.getSessionToken() })).toBeResolved();
    });

    it('rejects invalid fileUpload configuration', async () => {
      const invalidConfigs = [
        { fileUpload: undefined },
        { fileUpload: null },
        { fileUpload: [] },
        { fileUpload: 1 },
        { fileUpload: 'string' },
      ];
      const validConfigs = [{ fileUpload: {} }];
      const keys = ['enableForPublic', 'enableForAnonymousUser', 'enableForAuthenticatedUser'];
      const invalidValues = [[], {}, 1, 'string', null];
      const validValues = [undefined, true, false];
      for (const config of invalidConfigs) {
        await expectAsync(reconfigureServer(config)).toBeRejectedWith(
          'fileUpload must be an object value.'
        );
      }
      for (const config of validConfigs) {
        await expectAsync(reconfigureServer(config)).toBeResolved();
      }
      for (const key of keys) {
        for (const value of invalidValues) {
          await expectAsync(reconfigureServer({ fileUpload: { [key]: value } })).toBeRejectedWith(
            `fileUpload.${key} must be a boolean value.`
          );
        }
        for (const value of validValues) {
          await expectAsync(reconfigureServer({ fileUpload: { [key]: value } })).toBeResolved();
        }
      }
    });
  });
});
