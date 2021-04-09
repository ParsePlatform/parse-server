import Parse from 'parse/node';
import { offsetToCursor, cursorToOffset } from 'graphql-relay';
import rest from '../../rest';
import { transformQueryInputToParse } from '../transformers/query';

// Eslint/Prettier conflict
/* eslint-disable*/
const needToGetAllKeys = (fields, keys, parseClasses) =>
  keys
    ? keys.split(',').some(keyName => {
        const key = keyName.split('.');
        if (fields[key[0]]) {
          if (fields[key[0]].type === 'Relation') return false;
          if (fields[key[0]].type === 'Pointer') {
            const subClass = parseClasses.find(
              ({ className: parseClassName }) => fields[key[0]].targetClass === parseClassName
            );
            if (subClass && subClass.fields[key[1]]) {
              // Current sub key is not custom
              return false;
            }
          } else if (
            !key[1] ||
            fields[key[0]].type === 'Array' ||
            fields[key[0]].type === 'Object'
          ) {
            // current key is not custom
            return false;
          }
        }
        // Key not found into Parse Schema so it's custom
        return true;
      })
    : true;
/* eslint-enable*/

const getObject = async (
  className,
  objectId,
  keys,
  include,
  readPreference,
  includeReadPreference,
  config,
  auth,
  info,
  parseClasses
) => {
  const options = {};
  try {
    if (
      !needToGetAllKeys(
        parseClasses.find(({ className: parseClassName }) => className === parseClassName).fields,
        keys,
        parseClasses
      )
    ) {
      options.keys = keys;
    }
  } catch (e) {
    console.error(e);
  }
  if (include) {
    options.include = include;
    if (includeReadPreference) {
      options.includeReadPreference = includeReadPreference;
    }
  }
  if (readPreference) {
    options.readPreference = readPreference;
  }

  const response = await rest.get(
    config,
    auth,
    className,
    objectId,
    options,
    info.clientSDK,
    info.context
  );

  if (!response.results || response.results.length == 0) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
  }

  const object = response.results[0];
  if (className === '_User') {
    delete object.sessionToken;
  }
  return object;
};

const findObjects = async (
  className,
  where,
  order,
  skipInput,
  first,
  after,
  last,
  before,
  keys,
  include,
  includeAll,
  readPreference,
  includeReadPreference,
  subqueryReadPreference,
  config,
  auth,
  info,
  selectedFields,
  parseClasses
) => {
  if (!where) {
    where = {};
  }
  transformQueryInputToParse(where, className, parseClasses);
  const skipAndLimitCalculation = calculateSkipAndLimit(
    skipInput,
    first,
    after,
    last,
    before,
    config.maxLimit
  );
  let { skip } = skipAndLimitCalculation;
  const { limit, needToPreCount } = skipAndLimitCalculation;
  let preCount = undefined;
  if (needToPreCount) {
    const preCountOptions = {
      limit: 0,
      count: true,
    };
    if (readPreference) {
      preCountOptions.readPreference = readPreference;
    }
    if (Object.keys(where).length > 0 && subqueryReadPreference) {
      preCountOptions.subqueryReadPreference = subqueryReadPreference;
    }
    preCount = (
      await rest.find(config, auth, className, where, preCountOptions, info.clientSDK, info.context)
    ).count;
    if ((skip || 0) + limit < preCount) {
      skip = preCount - limit;
    }
  }

  const options = {};

  if (selectedFields.find(field => field.startsWith('edges.') || field.startsWith('pageInfo.'))) {
    if (limit || limit === 0) {
      options.limit = limit;
    } else {
      options.limit = 100;
    }
    if (options.limit !== 0) {
      if (order) {
        options.order = order;
      }
      if (skip) {
        options.skip = skip;
      }
      if (config.maxLimit && options.limit > config.maxLimit) {
        // Silently replace the limit on the query with the max configured
        options.limit = config.maxLimit;
      }
      if (
        !needToGetAllKeys(
          parseClasses.find(({ className: parseClassName }) => className === parseClassName).fields,
          keys,
          parseClasses
        )
      ) {
        options.keys = keys;
      }
      if (includeAll === true) {
        options.includeAll = includeAll;
      }
      if (!options.includeAll && include) {
        options.include = include;
      }
      if ((options.includeAll || options.include) && includeReadPreference) {
        options.includeReadPreference = includeReadPreference;
      }
    }
  } else {
    options.limit = 0;
  }

  if (
    (selectedFields.includes('count') ||
      selectedFields.includes('pageInfo.hasPreviousPage') ||
      selectedFields.includes('pageInfo.hasNextPage')) &&
    !needToPreCount
  ) {
    options.count = true;
  }

  if (readPreference) {
    options.readPreference = readPreference;
  }
  if (Object.keys(where).length > 0 && subqueryReadPreference) {
    options.subqueryReadPreference = subqueryReadPreference;
  }

  let results, count;
  if (options.count || !options.limit || (options.limit && options.limit > 0)) {
    const findResult = await rest.find(
      config,
      auth,
      className,
      where,
      options,
      info.clientSDK,
      info.context
    );
    results = findResult.results;
    count = findResult.count;
  }

  let edges = null;
  let pageInfo = null;
  if (results) {
    edges = results.map((result, index) => ({
      cursor: offsetToCursor((skip || 0) + index),
      node: result,
    }));

    pageInfo = {
      hasPreviousPage:
        ((preCount && preCount > 0) || (count && count > 0)) && skip !== undefined && skip > 0,
      startCursor: offsetToCursor(skip || 0),
      endCursor: offsetToCursor((skip || 0) + (results.length || 1) - 1),
      hasNextPage: (preCount || count) > (skip || 0) + results.length,
    };
  }

  return {
    edges,
    pageInfo,
    count: preCount || count,
  };
};

const calculateSkipAndLimit = (skipInput, first, after, last, before, maxLimit) => {
  let skip = undefined;
  let limit = undefined;
  let needToPreCount = false;

  // Validates the skip input
  if (skipInput || skipInput === 0) {
    if (skipInput < 0) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Skip should be a positive number');
    }
    skip = skipInput;
  }

  // Validates the after param
  if (after) {
    after = cursorToOffset(after);
    if ((!after && after !== 0) || after < 0) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'After is not a valid cursor');
    }

    // If skip and after are passed, a new skip is calculated by adding them
    skip = (skip || 0) + (after + 1);
  }

  // Validates the first param
  if (first || first === 0) {
    if (first < 0) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'First should be a positive number');
    }

    // The first param is translated to the limit param of the Parse legacy API
    limit = first;
  }

  // Validates the before param
  if (before || before === 0) {
    // This method converts the cursor to the index of the object
    before = cursorToOffset(before);
    if ((!before && before !== 0) || before < 0) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Before is not a valid cursor');
    }

    if ((skip || 0) >= before) {
      // If the before index is less then the skip, no objects will be returned
      limit = 0;
    } else if ((!limit && limit !== 0) || (skip || 0) + limit > before) {
      // If there is no limit set, the limit is calculated. Or, if the limit (plus skip) is bigger than the before index, the new limit is set.
      limit = before - (skip || 0);
    }
  }

  // Validates the last param
  if (last || last === 0) {
    if (last < 0) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Last should be a positive number');
    }

    if (last > maxLimit) {
      // Last can't be bigger than Parse server maxLimit config.
      last = maxLimit;
    }

    if (limit || limit === 0) {
      // If there is a previous limit set, it may be adjusted
      if (last < limit) {
        // if last is less than the current limit
        skip = (skip || 0) + (limit - last); // The skip is adjusted
        limit = last; // the limit is adjusted
      }
    } else if (last === 0) {
      // No objects will be returned
      limit = 0;
    } else {
      // No previous limit set, the limit will be equal to last and pre count is needed.
      limit = last;
      needToPreCount = true;
    }
  }
  return {
    skip,
    limit,
    needToPreCount,
  };
};

export { getObject, findObjects, calculateSkipAndLimit, needToGetAllKeys };
