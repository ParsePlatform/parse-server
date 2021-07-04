const SchemaCache = {};

export default {
  all() {
    return [...(SchemaCache.allClasses || [])];
  },

  get(className) {
    return this.all().find(cached => cached.className === className);
  },

  set(className, schema) {
    const cache = this.all();
    const index = cache.findIndex(cached => cached.className === className);
    if (index >= 0) {
      cache[index] = schema;
    } else {
      cache.push(schema);
    }
    this.put(cache);
  },

  put(allSchema) {
    SchemaCache.allClasses = allSchema;
  },

  del(className) {
    this.put(this.all().filter(cached => cached.className !== className));
  },

  clear() {
    delete SchemaCache.allClasses;
  },
};
