"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GridFSBucketAdapter = void 0;

var _mongodb = require("mongodb");

var _FilesAdapter = require("./FilesAdapter");

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 GridFSBucketAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient

 
 */
// -disable-next
const crypto = require('crypto');

class GridFSBucketAdapter extends _FilesAdapter.FilesAdapter {
  constructor(mongoDatabaseURI = _defaults.default.DefaultMongoURI, mongoOptions = {}, encryptionKey = undefined) {
    super();
    this._databaseURI = mongoDatabaseURI;
    this._algorithm = 'aes-256-gcm';
    this._encryptionKey = encryptionKey !== undefined ? crypto.createHash('sha256').update(String(encryptionKey)).digest('base64').substr(0, 32) : null;
    const defaultMongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
    this._mongoOptions = Object.assign(defaultMongoOptions, mongoOptions);
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = _mongodb.MongoClient.connect(this._databaseURI, this._mongoOptions).then(client => {
        this._client = client;
        return client.db(client.s.options.dbName);
      });
    }

    return this._connectionPromise;
  }

  _getBucket() {
    return this._connect().then(database => new _mongodb.GridFSBucket(database));
  } // For a given config object, filename, and data, store a file
  // Returns a promise


  async createFile(filename, data, contentType, options = {}) {
    const bucket = await this._getBucket();
    const stream = await bucket.openUploadStream(filename, {
      metadata: options.metadata
    });

    if (this._encryptionKey !== null) {
      try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this._algorithm, this._encryptionKey, iv);
        const encryptedResult = Buffer.concat([cipher.update(data), cipher.final(), iv, cipher.getAuthTag()]);
        await stream.write(encryptedResult);
      } catch (err) {
        return new Promise((resolve, reject) => {
          return reject(err);
        });
      }
    } else {
      await stream.write(data);
    }

    stream.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async deleteFile(filename) {
    const bucket = await this._getBucket();
    const documents = await bucket.find({
      filename
    }).toArray();

    if (documents.length === 0) {
      throw new Error('FileNotFound');
    }

    return Promise.all(documents.map(doc => {
      return bucket.delete(doc._id);
    }));
  }

  async getFileData(filename) {
    const bucket = await this._getBucket();
    const stream = bucket.openDownloadStreamByName(filename);
    stream.read();
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', data => {
        chunks.push(data);
      });
      stream.on('end', () => {
        const data = Buffer.concat(chunks);

        if (this._encryptionKey !== null) {
          try {
            const authTagLocation = data.length - 16;
            const ivLocation = data.length - 32;
            const authTag = data.slice(authTagLocation);
            const iv = data.slice(ivLocation, authTagLocation);
            const encrypted = data.slice(0, ivLocation);
            const decipher = crypto.createDecipheriv(this._algorithm, this._encryptionKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return resolve(decrypted);
          } catch (err) {
            return reject(err);
          }
        }

        resolve(data);
      });
      stream.on('error', err => {
        reject(err);
      });
    });
  }

  async rotateEncryptionKey(options = {}) {
    var fileNames = [];
    var oldKeyFileAdapter = {};
    const bucket = await this._getBucket();

    if (options.oldKey !== undefined) {
      oldKeyFileAdapter = new GridFSBucketAdapter(this._databaseURI, this._mongoOptions, options.oldKey);
    } else {
      oldKeyFileAdapter = new GridFSBucketAdapter(this._databaseURI, this._mongoOptions);
    }

    if (options.fileNames !== undefined) {
      fileNames = options.fileNames;
    } else {
      const fileNamesIterator = await bucket.find().toArray();
      fileNamesIterator.forEach(file => {
        fileNames.push(file.filename);
      });
    }

    return new Promise(resolve => {
      var fileNamesNotRotated = fileNames;
      var fileNamesRotated = [];
      var fileNameTotal = fileNames.length;
      var fileNameIndex = 0;
      fileNames.forEach(fileName => {
        oldKeyFileAdapter.getFileData(fileName).then(plainTextData => {
          //Overwrite file with data encrypted with new key
          this.createFile(fileName, plainTextData).then(() => {
            fileNamesRotated.push(fileName);
            fileNamesNotRotated = fileNamesNotRotated.filter(function (value) {
              return value !== fileName;
            });
            fileNameIndex += 1;

            if (fileNameIndex == fileNameTotal) {
              resolve({
                rotated: fileNamesRotated,
                notRotated: fileNamesNotRotated
              });
            }
          }).catch(() => {
            fileNameIndex += 1;

            if (fileNameIndex == fileNameTotal) {
              resolve({
                rotated: fileNamesRotated,
                notRotated: fileNamesNotRotated
              });
            }
          });
        }).catch(() => {
          fileNameIndex += 1;

          if (fileNameIndex == fileNameTotal) {
            resolve({
              rotated: fileNamesRotated,
              notRotated: fileNamesNotRotated
            });
          }
        });
      });
    });
  }

  getFileLocation(config, filename) {
    return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
  }

  async getMetadata(filename) {
    const bucket = await this._getBucket();
    const files = await bucket.find({
      filename
    }).toArray();

    if (files.length === 0) {
      return {};
    }

    const {
      metadata
    } = files[0];
    return {
      metadata
    };
  }

  async handleFileStream(filename, req, res, contentType) {
    const bucket = await this._getBucket();
    const files = await bucket.find({
      filename
    }).toArray();

    if (files.length === 0) {
      throw new Error('FileNotFound');
    }

    const parts = req.get('Range').replace(/bytes=/, '').split('-');
    const partialstart = parts[0];
    const partialend = parts[1];
    const start = parseInt(partialstart, 10);
    const end = partialend ? parseInt(partialend, 10) : files[0].length - 1;
    res.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + files[0].length,
      'Content-Type': contentType
    });
    const stream = bucket.openDownloadStreamByName(filename);
    stream.start(start);
    stream.on('data', chunk => {
      res.write(chunk);
    });
    stream.on('error', () => {
      res.sendStatus(404);
    });
    stream.on('end', () => {
      res.end();
    });
  }

  handleShutdown() {
    if (!this._client) {
      return Promise.resolve();
    }

    return this._client.close(false);
  }

  validateFilename(filename) {
    return (0, _FilesAdapter.validateFilename)(filename);
  }

}

exports.GridFSBucketAdapter = GridFSBucketAdapter;
var _default = GridFSBucketAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9HcmlkRlNCdWNrZXRBZGFwdGVyLmpzIl0sIm5hbWVzIjpbImNyeXB0byIsInJlcXVpcmUiLCJHcmlkRlNCdWNrZXRBZGFwdGVyIiwiRmlsZXNBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJtb25nb0RhdGFiYXNlVVJJIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJtb25nb09wdGlvbnMiLCJlbmNyeXB0aW9uS2V5IiwidW5kZWZpbmVkIiwiX2RhdGFiYXNlVVJJIiwiX2FsZ29yaXRobSIsIl9lbmNyeXB0aW9uS2V5IiwiY3JlYXRlSGFzaCIsInVwZGF0ZSIsIlN0cmluZyIsImRpZ2VzdCIsInN1YnN0ciIsImRlZmF1bHRNb25nb09wdGlvbnMiLCJ1c2VOZXdVcmxQYXJzZXIiLCJ1c2VVbmlmaWVkVG9wb2xvZ3kiLCJfbW9uZ29PcHRpb25zIiwiT2JqZWN0IiwiYXNzaWduIiwiX2Nvbm5lY3QiLCJfY29ubmVjdGlvblByb21pc2UiLCJNb25nb0NsaWVudCIsImNvbm5lY3QiLCJ0aGVuIiwiY2xpZW50IiwiX2NsaWVudCIsImRiIiwicyIsIm9wdGlvbnMiLCJkYk5hbWUiLCJfZ2V0QnVja2V0IiwiZGF0YWJhc2UiLCJHcmlkRlNCdWNrZXQiLCJjcmVhdGVGaWxlIiwiZmlsZW5hbWUiLCJkYXRhIiwiY29udGVudFR5cGUiLCJidWNrZXQiLCJzdHJlYW0iLCJvcGVuVXBsb2FkU3RyZWFtIiwibWV0YWRhdGEiLCJpdiIsInJhbmRvbUJ5dGVzIiwiY2lwaGVyIiwiY3JlYXRlQ2lwaGVyaXYiLCJlbmNyeXB0ZWRSZXN1bHQiLCJCdWZmZXIiLCJjb25jYXQiLCJmaW5hbCIsImdldEF1dGhUYWciLCJ3cml0ZSIsImVyciIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZW5kIiwib24iLCJkZWxldGVGaWxlIiwiZG9jdW1lbnRzIiwiZmluZCIsInRvQXJyYXkiLCJsZW5ndGgiLCJFcnJvciIsImFsbCIsIm1hcCIsImRvYyIsImRlbGV0ZSIsIl9pZCIsImdldEZpbGVEYXRhIiwib3BlbkRvd25sb2FkU3RyZWFtQnlOYW1lIiwicmVhZCIsImNodW5rcyIsInB1c2giLCJhdXRoVGFnTG9jYXRpb24iLCJpdkxvY2F0aW9uIiwiYXV0aFRhZyIsInNsaWNlIiwiZW5jcnlwdGVkIiwiZGVjaXBoZXIiLCJjcmVhdGVEZWNpcGhlcml2Iiwic2V0QXV0aFRhZyIsImRlY3J5cHRlZCIsInJvdGF0ZUVuY3J5cHRpb25LZXkiLCJmaWxlTmFtZXMiLCJvbGRLZXlGaWxlQWRhcHRlciIsIm9sZEtleSIsImZpbGVOYW1lc0l0ZXJhdG9yIiwiZm9yRWFjaCIsImZpbGUiLCJmaWxlTmFtZXNOb3RSb3RhdGVkIiwiZmlsZU5hbWVzUm90YXRlZCIsImZpbGVOYW1lVG90YWwiLCJmaWxlTmFtZUluZGV4IiwiZmlsZU5hbWUiLCJwbGFpblRleHREYXRhIiwiZmlsdGVyIiwidmFsdWUiLCJyb3RhdGVkIiwibm90Um90YXRlZCIsImNhdGNoIiwiZ2V0RmlsZUxvY2F0aW9uIiwiY29uZmlnIiwibW91bnQiLCJhcHBsaWNhdGlvbklkIiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZ2V0TWV0YWRhdGEiLCJmaWxlcyIsImhhbmRsZUZpbGVTdHJlYW0iLCJyZXEiLCJyZXMiLCJwYXJ0cyIsImdldCIsInJlcGxhY2UiLCJzcGxpdCIsInBhcnRpYWxzdGFydCIsInBhcnRpYWxlbmQiLCJzdGFydCIsInBhcnNlSW50Iiwid3JpdGVIZWFkIiwiY2h1bmsiLCJzZW5kU3RhdHVzIiwiaGFuZGxlU2h1dGRvd24iLCJjbG9zZSIsInZhbGlkYXRlRmlsZW5hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFTQTs7QUFDQTs7QUFDQTs7OztBQVhBOzs7Ozs7O0FBUUE7QUFJQSxNQUFNQSxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxRQUFELENBQXRCOztBQUVPLE1BQU1DLG1CQUFOLFNBQWtDQywwQkFBbEMsQ0FBK0M7QUFNcERDLEVBQUFBLFdBQVcsQ0FDVEMsZ0JB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QUZEO0FBR0FqRixJQUFBQSxNQUFNLENBQUNrQixFQUFQLENBQVUsT0FBVixFQUFtQixNQUFNO0FBQ3ZCcUQsTUFBQUEsR0FBRyxDQUFDVyxVQUFKLENBQWUsR0FBZjtBQUNELEtBRkQ7QUFHQWxGLElBQUFBLE1BQU0sQ0FBQ2tCLEVBQVAsQ0FBVSxLQUFWLEVBQWlCLE1BQU07QUFDckJxRCxNQUFBQSxHQUFHLENBQUN0RCxHQUFKO0FBQ0QsS0FGRDtBQUdEOztBQUVEa0UsRUFBQUEsY0FBYyxHQUFHO0FBQ2YsUUFBSSxDQUFDLEtBQUtoRyxPQUFWLEVBQW1CO0FBQ2pCLGFBQU8yQixPQUFPLENBQUNDLE9BQVIsRUFBUDtBQUNEOztBQUNELFdBQU8sS0FBSzVCLE9BQUwsQ0FBYWlHLEtBQWIsQ0FBbUIsS0FBbkIsQ0FBUDtBQUNEOztBQUVEQyxFQUFBQSxnQkFBZ0IsQ0FBQ3pGLFFBQUQsRUFBVztBQUN6QixXQUFPLG9DQUFpQkEsUUFBakIsQ0FBUDtBQUNEOztBQWxSbUQ7OztlQXFSdkN0QyxtQiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuIEdyaWRGU0J1Y2tldEFkYXB0ZXJcbiBTdG9yZXMgZmlsZXMgaW4gTW9uZ28gdXNpbmcgR3JpZFN0b3JlXG4gUmVxdWlyZXMgdGhlIGRhdGFiYXNlIGFkYXB0ZXIgdG8gYmUgYmFzZWQgb24gbW9uZ29jbGllbnRcblxuIEBmbG93IHdlYWtcbiAqL1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IE1vbmdvQ2xpZW50LCBHcmlkRlNCdWNrZXQsIERiIH0gZnJvbSAnbW9uZ29kYic7XG5pbXBvcnQgeyBGaWxlc0FkYXB0ZXIsIHZhbGlkYXRlRmlsZW5hbWUgfSBmcm9tICcuL0ZpbGVzQWRhcHRlcic7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuY29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7XG5cbmV4cG9ydCBjbGFzcyBHcmlkRlNCdWNrZXRBZGFwdGVyIGV4dGVuZHMgRmlsZXNBZGFwdGVyIHtcbiAgX2RhdGFiYXNlVVJJOiBzdHJpbmc7XG4gIF9jb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZTxEYj47XG4gIF9tb25nb09wdGlvbnM6IE9iamVjdDtcbiAgX2FsZ29yaXRobTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIG1vbmdvRGF0YWJhc2VVUkkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksXG4gICAgbW9uZ29PcHRpb25zID0ge30sXG4gICAgZW5jcnlwdGlvbktleSA9IHVuZGVmaW5lZFxuICApIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuX2RhdGFiYXNlVVJJID0gbW9uZ29EYXRhYmFzZVVSSTtcbiAgICB0aGlzLl9hbGdvcml0aG0gPSAnYWVzLTI1Ni1nY20nO1xuICAgIHRoaXMuX2VuY3J5cHRpb25LZXkgPVxuICAgICAgZW5jcnlwdGlvbktleSAhPT0gdW5kZWZpbmVkXG4gICAgICAgID8gY3J5cHRvXG4gICAgICAgICAgLmNyZWF0ZUhhc2goJ3NoYTI1NicpXG4gICAgICAgICAgLnVwZGF0ZShTdHJpbmcoZW5jcnlwdGlvbktleSkpXG4gICAgICAgICAgLmRpZ2VzdCgnYmFzZTY0JylcbiAgICAgICAgICAuc3Vic3RyKDAsIDMyKVxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3QgZGVmYXVsdE1vbmdvT3B0aW9ucyA9IHtcbiAgICAgIHVzZU5ld1VybFBhcnNlcjogdHJ1ZSxcbiAgICAgIHVzZVVuaWZpZWRUb3BvbG9neTogdHJ1ZSxcbiAgICB9O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oZGVmYXVsdE1vbmdvT3B0aW9ucywgbW9uZ29PcHRpb25zKTtcbiAgfVxuXG4gIF9jb25uZWN0KCkge1xuICAgIGlmICghdGhpcy5fY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHRoaXMuX2Nvbm5lY3Rpb25Qcm9taXNlID0gTW9uZ29DbGllbnQuY29ubmVjdChcbiAgICAgICAgdGhpcy5fZGF0YWJhc2VVUkksXG4gICAgICAgIHRoaXMuX21vbmdvT3B0aW9uc1xuICAgICAgKS50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5kYihjbGllbnQucy5vcHRpb25zLmRiTmFtZSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgX2dldEJ1Y2tldCgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29ubmVjdCgpLnRoZW4oZGF0YWJhc2UgPT4gbmV3IEdyaWRGU0J1Y2tldChkYXRhYmFzZSkpO1xuICB9XG5cbiAgLy8gRm9yIGEgZ2l2ZW4gY29uZmlnIG9iamVjdCwgZmlsZW5hbWUsIGFuZCBkYXRhLCBzdG9yZSBhIGZpbGVcbiAgLy8gUmV0dXJucyBhIHByb21pc2VcbiAgYXN5bmMgY3JlYXRlRmlsZShmaWxlbmFtZTogc3RyaW5nLCBkYXRhLCBjb250ZW50VHlwZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgYnVja2V0ID0gYXdhaXQgdGhpcy5fZ2V0QnVja2V0KCk7XG4gICAgY29uc3Qgc3RyZWFtID0gYXdhaXQgYnVja2V0Lm9wZW5VcGxvYWRTdHJlYW0oZmlsZW5hbWUsIHtcbiAgICAgIG1ldGFkYXRhOiBvcHRpb25zLm1ldGFkYXRhLFxuICAgIH0pO1xuICAgIGlmICh0aGlzLl9lbmNyeXB0aW9uS2V5ICE9PSBudWxsKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpdiA9IGNyeXB0by5yYW5kb21CeXRlcygxNik7XG4gICAgICAgIGNvbnN0IGNpcGhlciA9IGNyeXB0by5jcmVhdGVDaXBoZXJpdihcbiAgICAgICAgICB0aGlzLl9hbGdvcml0aG0sXG4gICAgICAgICAgdGhpcy5fZW5jcnlwdGlvbktleSxcbiAgICAgICAgICBpdlxuICAgICAgICApO1xuICAgICAgICBjb25zdCBlbmNyeXB0ZWRSZXN1bHQgPSBCdWZmZXIuY29uY2F0KFtcbiAgICAgICAgICBjaXBoZXIudXBkYXRlKGRhdGEpLFxuICAgICAgICAgIGNpcGhlci5maW5hbCgpLFxuICAgICAgICAgIGl2LFxuICAgICAgICAgIGNpcGhlci5nZXRBdXRoVGFnKCksXG4gICAgICAgIF0pO1xuICAgICAgICBhd2FpdCBzdHJlYW0ud3JpdGUoZW5jcnlwdGVkUmVzdWx0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHN0cmVhbS53cml0ZShkYXRhKTtcbiAgICB9XG4gICAgc3RyZWFtLmVuZCgpO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBzdHJlYW0ub24oJ2ZpbmlzaCcsIHJlc29sdmUpO1xuICAgICAgc3RyZWFtLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBkZWxldGVGaWxlKGZpbGVuYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBidWNrZXQgPSBhd2FpdCB0aGlzLl9nZXRCdWNrZXQoKTtcbiAgICBjb25zdCBkb2N1bWVudHMgPSBhd2FpdCBidWNrZXQuZmluZCh7IGZpbGVuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICBpZiAoZG9jdW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGaWxlTm90Rm91bmQnKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgZG9jdW1lbnRzLm1hcChkb2MgPT4ge1xuICAgICAgICByZXR1cm4gYnVja2V0LmRlbGV0ZShkb2MuX2lkKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGdldEZpbGVEYXRhKGZpbGVuYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBidWNrZXQgPSBhd2FpdCB0aGlzLl9nZXRCdWNrZXQoKTtcbiAgICBjb25zdCBzdHJlYW0gPSBidWNrZXQub3BlbkRvd25sb2FkU3RyZWFtQnlOYW1lKGZpbGVuYW1lKTtcbiAgICBzdHJlYW0ucmVhZCgpO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgIHN0cmVhbS5vbignZGF0YScsIGRhdGEgPT4ge1xuICAgICAgICBjaHVua3MucHVzaChkYXRhKTtcbiAgICAgIH0pO1xuICAgICAgc3RyZWFtLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBCdWZmZXIuY29uY2F0KGNodW5rcyk7XG4gICAgICAgIGlmICh0aGlzLl9lbmNyeXB0aW9uS2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGF1dGhUYWdMb2NhdGlvbiA9IGRhdGEubGVuZ3RoIC0gMTY7XG4gICAgICAgICAgICBjb25zdCBpdkxvY2F0aW9uID0gZGF0YS5sZW5ndGggLSAzMjtcbiAgICAgICAgICAgIGNvbnN0IGF1dGhUYWcgPSBkYXRhLnNsaWNlKGF1dGhUYWdMb2NhdGlvbik7XG4gICAgICAgICAgICBjb25zdCBpdiA9IGRhdGEuc2xpY2UoaXZMb2NhdGlvbiwgYXV0aFRhZ0xvY2F0aW9uKTtcbiAgICAgICAgICAgIGNvbnN0IGVuY3J5cHRlZCA9IGRhdGEuc2xpY2UoMCwgaXZMb2NhdGlvbik7XG4gICAgICAgICAgICBjb25zdCBkZWNpcGhlciA9IGNyeXB0by5jcmVhdGVEZWNpcGhlcml2KFxuICAgICAgICAgICAgICB0aGlzLl9hbGdvcml0aG0sXG4gICAgICAgICAgICAgIHRoaXMuX2VuY3J5cHRpb25LZXksXG4gICAgICAgICAgICAgIGl2XG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgZGVjaXBoZXIuc2V0QXV0aFRhZyhhdXRoVGFnKTtcbiAgICAgICAgICAgIGNvbnN0IGRlY3J5cHRlZCA9IEJ1ZmZlci5jb25jYXQoW1xuICAgICAgICAgICAgICBkZWNpcGhlci51cGRhdGUoZW5jcnlwdGVkKSxcbiAgICAgICAgICAgICAgZGVjaXBoZXIuZmluYWwoKSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGVjcnlwdGVkKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShkYXRhKTtcbiAgICAgIH0pO1xuICAgICAgc3RyZWFtLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyByb3RhdGVFbmNyeXB0aW9uS2V5KG9wdGlvbnMgPSB7fSkge1xuICAgIHZhciBmaWxlTmFtZXMgPSBbXTtcbiAgICB2YXIgb2xkS2V5RmlsZUFkYXB0ZXIgPSB7fTtcbiAgICBjb25zdCBidWNrZXQgPSBhd2FpdCB0aGlzLl9nZXRCdWNrZXQoKTtcbiAgICBpZiAob3B0aW9ucy5vbGRLZXkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgb2xkS2V5RmlsZUFkYXB0ZXIgPSBuZXcgR3JpZEZTQnVja2V0QWRhcHRlcihcbiAgICAgICAgdGhpcy5fZGF0YWJhc2VVUkksXG4gICAgICAgIHRoaXMuX21vbmdvT3B0aW9ucyxcbiAgICAgICAgb3B0aW9ucy5vbGRLZXlcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9sZEtleUZpbGVBZGFwdGVyID0gbmV3IEdyaWRGU0J1Y2tldEFkYXB0ZXIoXG4gICAgICAgIHRoaXMuX2RhdGFiYXNlVVJJLFxuICAgICAgICB0aGlzLl9tb25nb09wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zLmZpbGVOYW1lcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlTmFtZXMgPSBvcHRpb25zLmZpbGVOYW1lcztcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZmlsZU5hbWVzSXRlcmF0b3IgPSBhd2FpdCBidWNrZXQuZmluZCgpLnRvQXJyYXkoKTtcbiAgICAgIGZpbGVOYW1lc0l0ZXJhdG9yLmZvckVhY2goZmlsZSA9PiB7XG4gICAgICAgIGZpbGVOYW1lcy5wdXNoKGZpbGUuZmlsZW5hbWUpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIHZhciBmaWxlTmFtZXNOb3RSb3RhdGVkID0gZmlsZU5hbWVzO1xuICAgICAgdmFyIGZpbGVOYW1lc1JvdGF0ZWQgPSBbXTtcbiAgICAgIHZhciBmaWxlTmFtZVRvdGFsID0gZmlsZU5hbWVzLmxlbmd0aDtcbiAgICAgIHZhciBmaWxlTmFtZUluZGV4ID0gMDtcbiAgICAgIGZpbGVOYW1lcy5mb3JFYWNoKGZpbGVOYW1lID0+IHtcbiAgICAgICAgb2xkS2V5RmlsZUFkYXB0ZXJcbiAgICAgICAgICAuZ2V0RmlsZURhdGEoZmlsZU5hbWUpXG4gICAgICAgICAgLnRoZW4ocGxhaW5UZXh0RGF0YSA9PiB7XG4gICAgICAgICAgICAvL092ZXJ3cml0ZSBmaWxlIHdpdGggZGF0YSBlbmNyeXB0ZWQgd2l0aCBuZXcga2V5XG4gICAgICAgICAgICB0aGlzLmNyZWF0ZUZpbGUoZmlsZU5hbWUsIHBsYWluVGV4dERhdGEpXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBmaWxlTmFtZXNSb3RhdGVkLnB1c2goZmlsZU5hbWUpO1xuICAgICAgICAgICAgICAgIGZpbGVOYW1lc05vdFJvdGF0ZWQgPSBmaWxlTmFtZXNOb3RSb3RhdGVkLmZpbHRlcihmdW5jdGlvbiAoXG4gICAgICAgICAgICAgICAgICB2YWx1ZVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlICE9PSBmaWxlTmFtZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBmaWxlTmFtZUluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGVOYW1lSW5kZXggPT0gZmlsZU5hbWVUb3RhbCkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHJvdGF0ZWQ6IGZpbGVOYW1lc1JvdGF0ZWQsXG4gICAgICAgICAgICAgICAgICAgIG5vdFJvdGF0ZWQ6IGZpbGVOYW1lc05vdFJvdGF0ZWQsXG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsZU5hbWVJbmRleCArPSAxO1xuICAgICAgICAgICAgICAgIGlmIChmaWxlTmFtZUluZGV4ID09IGZpbGVOYW1lVG90YWwpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgICByb3RhdGVkOiBmaWxlTmFtZXNSb3RhdGVkLFxuICAgICAgICAgICAgICAgICAgICBub3RSb3RhdGVkOiBmaWxlTmFtZXNOb3RSb3RhdGVkLFxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICBmaWxlTmFtZUluZGV4ICs9IDE7XG4gICAgICAgICAgICBpZiAoZmlsZU5hbWVJbmRleCA9PSBmaWxlTmFtZVRvdGFsKSB7XG4gICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgIHJvdGF0ZWQ6IGZpbGVOYW1lc1JvdGF0ZWQsXG4gICAgICAgICAgICAgICAgbm90Um90YXRlZDogZmlsZU5hbWVzTm90Um90YXRlZCxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldEZpbGVMb2NhdGlvbihjb25maWcsIGZpbGVuYW1lKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIGNvbmZpZy5tb3VudCArXG4gICAgICAnL2ZpbGVzLycgK1xuICAgICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgK1xuICAgICAgJy8nICtcbiAgICAgIGVuY29kZVVSSUNvbXBvbmVudChmaWxlbmFtZSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZ2V0TWV0YWRhdGEoZmlsZW5hbWUpIHtcbiAgICBjb25zdCBidWNrZXQgPSBhd2FpdCB0aGlzLl9nZXRCdWNrZXQoKTtcbiAgICBjb25zdCBmaWxlcyA9IGF3YWl0IGJ1Y2tldC5maW5kKHsgZmlsZW5hbWUgfSkudG9BcnJheSgpO1xuICAgIGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gICAgY29uc3QgeyBtZXRhZGF0YSB9ID0gZmlsZXNbMF07XG4gICAgcmV0dXJuIHsgbWV0YWRhdGEgfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUZpbGVTdHJlYW0oZmlsZW5hbWU6IHN0cmluZywgcmVxLCByZXMsIGNvbnRlbnRUeXBlKSB7XG4gICAgY29uc3QgYnVja2V0ID0gYXdhaXQgdGhpcy5fZ2V0QnVja2V0KCk7XG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBidWNrZXQuZmluZCh7IGZpbGVuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGVOb3RGb3VuZCcpO1xuICAgIH1cbiAgICBjb25zdCBwYXJ0cyA9IHJlcVxuICAgICAgLmdldCgnUmFuZ2UnKVxuICAgICAgLnJlcGxhY2UoL2J5dGVzPS8sICcnKVxuICAgICAgLnNwbGl0KCctJyk7XG4gICAgY29uc3QgcGFydGlhbHN0YXJ0ID0gcGFydHNbMF07XG4gICAgY29uc3QgcGFydGlhbGVuZCA9IHBhcnRzWzFdO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBwYXJzZUludChwYXJ0aWFsc3RhcnQsIDEwKTtcbiAgICBjb25zdCBlbmQgPSBwYXJ0aWFsZW5kID8gcGFyc2VJbnQocGFydGlhbGVuZCwgMTApIDogZmlsZXNbMF0ubGVuZ3RoIC0gMTtcblxuICAgIHJlcy53cml0ZUhlYWQoMjA2LCB7XG4gICAgICAnQWNjZXB0LVJhbmdlcyc6ICdieXRlcycsXG4gICAgICAnQ29udGVudC1MZW5ndGgnOiBlbmQgLSBzdGFydCArIDEsXG4gICAgICAnQ29udGVudC1SYW5nZSc6ICdieXRlcyAnICsgc3RhcnQgKyAnLScgKyBlbmQgKyAnLycgKyBmaWxlc1swXS5sZW5ndGgsXG4gICAgICAnQ29udGVudC1UeXBlJzogY29udGVudFR5cGUsXG4gICAgfSk7XG4gICAgY29uc3Qgc3RyZWFtID0gYnVja2V0Lm9wZW5Eb3dubG9hZFN0cmVhbUJ5TmFtZShmaWxlbmFtZSk7XG4gICAgc3RyZWFtLnN0YXJ0KHN0YXJ0KTtcbiAgICBzdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7XG4gICAgICByZXMud3JpdGUoY2h1bmspO1xuICAgIH0pO1xuICAgIHN0cmVhbS5vbignZXJyb3InLCAoKSA9PiB7XG4gICAgICByZXMuc2VuZFN0YXR1cyg0MDQpO1xuICAgIH0pO1xuICAgIHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5jbG9zZShmYWxzZSk7XG4gIH1cblxuICB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKSB7XG4gICAgcmV0dXJuIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEdyaWRGU0J1Y2tldEFkYXB0ZXI7XG4iXX0=