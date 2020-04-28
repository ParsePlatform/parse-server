// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
const triggers = require('./triggers');
const { continueWhile } = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference
function RestQuery(
  config,
  auth,
  className,
  restWhere = {},
  restOptions = {},
  clientSDK,
  runAfterFind = true
) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};

  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw new Parse.Error(
          Parse.Error.INVALID_SESSION_TOKEN,
          'Invalid session token'
        );
      }
      this.restWhere = {
        $and: [
          this.restWhere,
          {
            user: {
              __type: 'Pointer',
              className: '_User',
              objectId: this.auth.user.id,
            },
          },
        ],
      };
    }
  }

  this.doCount = false;
  this.includeAll = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];

  // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185
  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    const keysForInclude = restOptions.keys
      .split(',')
      .filter(key => {
        // At least 2 components
        return key.split('.').length > 1;
      })
      .map(key => {
        // Slice the last component (a.b.c -> a.b)
        // Otherwise we'll include one level too much.
        return key.slice(0, key.lastIndexOf('.'));
      })
      .join(',');

    // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.
    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }

  for (var option in restOptions) {
    switch (option) {
      case 'keys': {
        const keys = restOptions.keys.split(',').concat(AlwaysSelectedKeys);
        this.keys = Array.from(new Set(keys));
        break;
      }
      case 'excludeKeys': {
        const exclude = restOptions.excludeKeys
          .split(',')
          .filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
        this.excludeKeys = Array.from(new Set(exclude));
        break;
      }
      case 'count':
        this.doCount = true;
        break;
      case 'includeAll':
        this.includeAll = true;
        break;
      case 'explain':
      case 'hint':
      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
        this.findOptions[option] = restOptions[option];
        break;
      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();
          if (field === '$score') {
            sortMap.score = { $meta: 'textScore' };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }
          return sortMap;
        }, {});
        break;
      case 'include': {
        const paths = restOptions.include.split(',');
        if (paths.includes('*')) {
          this.includeAll = true;
          break;
        }
        // Load the existing includes (from keys)
        const pathSet = paths.reduce((memo, path) => {
          // Split each paths on . (a.b.c -> [a,b,c])
          // reduce to create all paths
          // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
          return path.split('.').reduce((memo, path, index, parts) => {
            memo[parts.slice(0, index + 1).join('.')] = true;
            return memo;
          }, memo);
        }, {});

        this.include = Object.keys(pathSet)
          .map(s => {
            return s.split('.');
          })
          .sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });
        break;
      }
      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;
      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;
      default:
        throw new Parse.Error(
          Parse.Error.INVALID_JSON,
          'bad option: ' + option
        );
    }
  }
}

// A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions
RestQuery.prototype.execute = function(executeOptions) {
  return Promise.resolve()
    .then(() => {
      return this.buildRestWhere();
    })
    .then(() => {
      return this.handleIncludeAll();
    })
    .then(() => {
      return this.handleExcludeKeys();
    })
    .then(() => {
      return this.runFind(executeOptions);
    })
    .then(() => {
      return this.runCount();
    })
    .then(() => {
      return this.handleInclude();
    })
    .then(() => {
      return this.runAfterFindTrigger();
    })
    .then(() => {
      return this.response;
    });
};

RestQuery.prototype.each = function(callback) {
  const { config, auth, className, restWhere, restOptions, clientSDK } = this;
  // if the limit is set, use it
  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;

  return continueWhile(
    () => {
      return !finished;
    },
    async () => {
      const query = new RestQuery(
        config,
        auth,
        className,
        restWhere,
        restOptions,
        clientSDK
      );
      const { results } = await query.execute();
      results.forEach(callback);
      finished = results.length < restOptions.limit;
      if (!finished) {
        restWhere.objectId = Object.assign({}, restWhere.objectId, {
          $gt: results[results.length - 1].objectId,
        });
      }
    }
  );
};

RestQuery.prototype.buildRestWhere = function() {
  return Promise.resolve()
    .then(() => {
      return this.getUserAndRoleACL();
    })
    .then(() => {
      return this.redirectClassNameForKey();
    })
    .then(() => {
      return this.validateClientClassCreation();
    })
    .then(() => {
      return this.replaceSelect();
    })
    .then(() => {
      return this.replaceDontSelect();
    })
    .then(() => {
      return this.replaceInQuery();
    })
    .then(() => {
      return this.replaceNotInQuery();
    })
    .then(() => {
      return this.replaceEquality();
    });
};

// Uses the Auth object to get the list of roles, adds the user id
RestQuery.prototype.getUserAndRoleACL = function() {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.findOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [
        this.auth.user.id,
      ]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
RestQuery.prototype.redirectClassNameForKey = function() {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database
    .redirectClassNameForKey(this.className, this.redirectKey)
    .then(newClassName => {
      this.className = newClassName;
      this.redirectClassName = newClassName;
    });
};

// Validates this operation against the allowClientClassCreation config.
RestQuery.prototype.validateClientClassCreation = function() {
  if (
    this.config.allowClientClassCreation === false &&
    !this.auth.isMaster &&
    SchemaController.systemClasses.indexOf(this.className) === -1
  ) {
    return this.config.database
      .loadSchema()
      .then(schemaController => schemaController.hasClass(this.className))
      .then(hasClass => {
        if (hasClass !== true) {
          throw new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            'This user is not allowed to access ' +
              'non-existent class: ' +
              this.className
          );
        }
      });
  } else {
    return Promise.resolve();
  }
};

function transformInQuery(inQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId,
    });
  }
  delete inQueryObject['$inQuery'];
  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
}

// Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceInQuery = function() {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
  var inQueryValue = inQueryObject['$inQuery'];
  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      'improper usage of $inQuery'
    );
  }

  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey,
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(
    this.config,
    this.auth,
    inQueryValue.className,
    inQueryValue.where,
    additionalOptions
  );
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceInQuery();
  });
};

function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId,
    });
  }
  delete notInQueryObject['$notInQuery'];
  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
}

// Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceNotInQuery = function() {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
  var notInQueryValue = notInQueryObject['$notInQuery'];
  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      'improper usage of $notInQuery'
    );
  }

  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey,
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(
    this.config,
    this.auth,
    notInQueryValue.className,
    notInQueryValue.where,
    additionalOptions
  );
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

// Used to get the deepest object from json using dot notation.
const getDeepestObjectFromKey = (json, key, idx, src) => {
  if (key in json) {
    return json[key];
  }
  src.splice(1); // Exit Early
};

const transformSelect = (selectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
};

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceSelect = function() {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
  if (
    !selectValue.query ||
    !selectValue.key ||
    typeof selectValue.query !== 'object' ||
    !selectValue.query.className ||
    Object.keys(selectValue).length !== 2
  ) {
    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      'improper usage of $select'
    );
  }

  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey,
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(
    this.config,
    this.auth,
    selectValue.query.className,
    selectValue.query.where,
    additionalOptions
  );
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
    return this.replaceSelect();
  });
};

const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
};

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceDontSelect = function() {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
  var dontSelectValue = dontSelectObject['$dontSelect'];
  if (
    !dontSelectValue.query ||
    !dontSelectValue.key ||
    typeof dontSelectValue.query !== 'object' ||
    !dontSelectValue.query.className ||
    Object.keys(dontSelectValue).length !== 2
  ) {
    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      'improper usage of $dontSelect'
    );
  }
  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey,
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(
    this.config,
    this.auth,
    dontSelectValue.query.className,
    dontSelectValue.query.where,
    additionalOptions
  );
  return subquery.execute().then(response => {
    transformDontSelect(
      dontSelectObject,
      dontSelectValue.key,
      response.results
    );
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  });
};

const cleanResultAuthData = function(result) {
  delete result.password;
  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });

    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};

const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }
  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;
  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }
  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }
  return constraint;
};

RestQuery.prototype.replaceEquality = function() {
  if (typeof this.restWhere !== 'object') {
    return;
  }
  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
RestQuery.prototype.runFind = function(options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = { results: [] };
    return Promise.resolve();
  }
  const findOptions = Object.assign({}, this.findOptions);
  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }
  if (options.op) {
    findOptions.op = options.op;
  }
  return this.config.database
    .find(this.className, this.restWhere, findOptions, this.auth)
    .then(results => {
      if (this.className === '_User') {
        for (var result of results) {
          cleanResultAuthData(result);
        }
      }

      this.config.filesController.expandFilesInObject(this.config, results);

      if (this.redirectClassName) {
        for (var r of results) {
          r.className = this.redirectClassName;
        }
      }
      this.response = { results: results };
    });
};

// Returns a promise for whether it was successful.
// Populates this.response.count with the count
RestQuery.prototype.runCount = function() {
  if (!this.doCount) {
    return;
  }
  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database
    .find(this.className, this.restWhere, this.findOptions)
    .then(c => {
      this.response.count = c;
    });
};

// Augments this.response with all pointers on an object
RestQuery.prototype.handleIncludeAll = function() {
  if (!this.includeAll) {
    return;
  }
  return this.config.database
    .loadSchema()
    .then(schemaController => schemaController.getOneSchema(this.className))
    .then(schema => {
      const includeFields = [];
      const keyFields = [];
      for (const field in schema.fields) {
        if (
          schema.fields[field].type &&
          schema.fields[field].type === 'Pointer'
        ) {
          includeFields.push([field]);
          keyFields.push(field);
        }
      }
      // Add fields to include, keys, remove dups
      this.include = [...new Set([...this.include, ...includeFields])];
      // if this.keys not set, then all keys are already included
      if (this.keys) {
        this.keys = [...new Set([...this.keys, ...keyFields])];
      }
    });
};

// Updates property `this.keys` to contain all keys but the ones unselected.
RestQuery.prototype.handleExcludeKeys = function() {
  if (!this.excludeKeys) {
    return;
  }
  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }
  return this.config.database
    .loadSchema()
    .then(schemaController => schemaController.getOneSchema(this.className))
    .then(schema => {
      const fields = Object.keys(schema.fields);
      this.keys = fields.filter(k => !this.excludeKeys.includes(k));
    });
};

// Augments this.response with data at the paths provided in this.include.
//
// Preconditions:
// - `this.include` is an array of arrays of strings; (in flow parlance, Array<Array<string>>)
//
// - `this.include` is de-duplicated. This ensures that we don't try to fetch
//   the same objects twice.
//
// - For each value in `this.include` with length > 1, there is also
//   an earlier value for the prefix of that value.
//
//   Example: ['a', 'b', 'c'] in the array implies that ['a', 'b'] is also in
//   the array, at an earlier position).
//
//   This prevents trying to follow pointers on unfetched objects.
RestQuery.prototype.handleInclude = function() {
  if (this.include.length == 0) {
    return;
  }

  // The list of includes form a sort of a tree - Each path should wait to
  // start trying to load until its parent path has finished loading (so that
  // the pointers it is trying to read and fetch are in the object tree).
  //
  // So, for instance, if we have an include of ['a', 'b', 'c'], that must
  // wait on the include of ['a', 'b'] to finish, which must wait on the include
  // of ['a'] to finish.
  //
  // This `promises` object is a map of dotted paths to promises that resolve
  // when that path has finished loading into the tree. One special case is the
  // empty path (represented by the empty string). This represents the root of
  // the tree, which is `this.response` and is already fetched. We set a
  // pre-resolved promise at that level, meaning that include paths with only
  // one component (like `['a']`) will chain onto that resolved promise and
  // are immediately unblocked.
  const promises = { '': Promise.resolve() };

  this.include.forEach(path => {
    const dottedPath = path.join('.');

    // Get the promise for the parent path
    const parentDottedPath = path.slice(0, -1).join('.');
    const parentPromise = promises[parentDottedPath];

    // Once the parent promise has resolved, do this path's load step
    const loadPromise = parentPromise.then(() =>
      includePath(this.config, this.auth, this.response, path, this.restOptions)
    );

    // Put our promise into the promises map, so child paths can find and chain
    // off of it
    promises[dottedPath] = loadPromise;
  });

  // Wait for all includes to be fetched and merged in to the response tree
  return Promise.all(Object.values(promises));
};

//Returns a promise of a processed set of results
RestQuery.prototype.runAfterFindTrigger = function() {
  if (!this.response) {
    return;
  }
  if (!this.runAfterFind) {
    return;
  }
  // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.
  const hasAfterFindHook = triggers.triggerExists(
    this.className,
    triggers.Types.afterFind,
    this.config.applicationId
  );
  if (!hasAfterFindHook) {
    return Promise.resolve();
  }
  // Skip Aggregate and Distinct Queries
  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }
  // Run afterFind trigger and set the new results
  return triggers
    .maybeRunAfterFindTrigger(
      triggers.Types.afterFind,
      this.auth,
      this.className,
      this.response.results,
      this.config
    )
    .then(results => {
      // Ensure we properly set the className back
      if (this.redirectClassName) {
        this.response.results = results.map(object => {
          if (object instanceof Parse.Object) {
            object = object.toJSON();
          }
          object.className = this.redirectClassName;
          return object;
        });
      } else {
        this.response.results = results;
      }
    });
};

// Adds included values to the response.
// Path is a list of field names.
//
// Modifies the response in place by replacing pointers with fetched objects
// Returns a promise that resolves when all includes have been fetched and
// substituted into the response.
function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  const pointersHash = {};
  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }
    const className = pointer.className;
    // only include the good pointers
    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }
  const includeRestOptions = {};
  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }

  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference =
      restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }

  const queryPromises = Object.keys(pointersHash).map(className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;
    if (objectIds.length === 1) {
      where = { objectId: objectIds[0] };
    } else {
      where = { objectId: { $in: objectIds } };
    }
    var query = new RestQuery(
      config,
      auth,
      className,
      where,
      includeRestOptions
    );
    return query.execute({ op: 'get' }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  });

  // Get the objects for all these object ids
  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;

        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }
        replace[obj.objectId] = obj;
      }
      return replace;
    }, {});

    replacePointers(response.results, path, replace);
  });
}

// Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.
function findPointers(object, path) {
  if (object instanceof Array) {
    var answer = [];
    for (var x of object) {
      answer = answer.concat(findPointers(x, path));
    }
    return answer;
  }

  if (typeof object !== 'object' || !object) {
    return [];
  }

  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }
    return [];
  }

  var subobject = object[path[0]];
  if (!subobject) {
    return [];
  }
  return findPointers(subobject, path.slice(1));
}

// Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
//
// Performs in-place replacements on object
function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object
      .map(obj => replacePointers(obj, path, replace))
      .filter(obj => typeof obj !== 'undefined');
  }

  if (typeof object !== 'object' || !object) {
    return object;
  }

  // base case: we're returning a replacement
  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }
    return object;
  }

  // penultimate case: we're looking at the object holding a reference
  // to be mutated
  else if (path.length === 1) {
    object[path[0]] = replacePointers(object[path[0]], [], replace);
    return;
  }

  var subobject = object[path[0]];
  if (!subobject) {
    return object;
  }

  return replacePointers(subobject, path.slice(1), replace);
}

// Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.
function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }
  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);
      if (answer) {
        return answer;
      }
    }
  }
  if (root && root[key]) {
    return root;
  }
  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);
    if (answer) {
      return answer;
    }
  }
}

module.exports = RestQuery;
