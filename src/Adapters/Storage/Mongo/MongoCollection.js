let mongodb = require('mongodb');
let Collection = mongodb.Collection;

export default class MongoCollection {
  _mongoCollection:Collection;

  constructor(mongoCollection:Collection) {
    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(query, { skip, limit, sort } = {}) {
    return this._rawFind(query, { skip, limit, sort })
      .catch(error => {
        // Check for "no geoindex" error
        if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
          throw error;
        }
        // Figure out what key needs an index
        let key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
        if (!key) {
          throw error;
        }

        var index = {};
        index[key] = '2d';
        return this._mongoCollection.createIndex(index)
          // Retry, but just once.
          .then(() => this._rawFind(query, { skip, limit, sort }));
      });
  }

  _rawFind(query, { skip, limit, sort } = {}) {
    return this._mongoCollection
      .find(query, { skip, limit, sort })
      .toArray();
  }

  count(query, { skip, limit, sort } = {}) {
    return this._mongoCollection.count(query, { skip, limit, sort });
  }

  insertOne(object) {
    return this._mongoCollection.insertOne(object);
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  upsertOne(query, update) {
    return this._mongoCollection.update(query, update, { upsert: true });
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update) {
    return this._mongoCollection.updateMany(query, update);
  }

  deleteOne(query) {
    return this._mongoCollection.deleteOne(query);
  }

  deleteMany(query) {
    return this._mongoCollection.deleteMany(query);
  }

  drop() {
    return this._mongoCollection.drop();
  }
}
