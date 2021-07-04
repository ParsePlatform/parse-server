import { GraphQLNonNull } from 'graphql';
import { fromGlobalId } from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';
import deepcopy from 'deepcopy';
import pluralize from 'pluralize';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { extractKeysAndInclude } from '../parseGraphQLUtils';

const getParseClassQueryConfig = function (parseClassConfig: ?ParseGraphQLClassConfig) {
  return (parseClassConfig && parseClassConfig.query) || {};
};

const getQuery = async (parseClass, _source, args, context, queryInfo, parseClasses) => {
  let { id } = args;
  const { options } = args;
  const { readPreference, includeReadPreference } = options || {};
  const { config, auth, info } = context;
  const selectedFields = getFieldNames(queryInfo);

  const globalIdObject = fromGlobalId(id);

  if (globalIdObject.type === parseClass.className) {
    id = globalIdObject.id;
  }

  const { keys, include } = extractKeysAndInclude(selectedFields);

  return await objectsQueries.getObject(
    parseClass.className,
    id,
    keys,
    include,
    readPreference,
    includeReadPreference,
    config,
    auth,
    info,
    parseClasses
  );
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig: ?ParseGraphQLClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true,
    getAlias: getAlias = '',
    findAlias: findAlias = '',
  } = getParseClassQueryConfig(parseClassConfig);

  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType,
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isGetEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);

    const getGraphQLQueryName = getAlias || lowerCaseClassName;

    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        options: defaultGraphQLTypes.READ_OPTIONS_ATT,
      },
      type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(
            parseClass,
            _source,
            deepcopy(args),
            context,
            queryInfo,
            parseGraphQLSchema.parseClasses
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }

  if (isFindEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);

    const findGraphQLQueryName = findAlias || pluralize(lowerCaseClassName);

    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.OBJECT),
      async resolve(_source, args, context, queryInfo) {
        try {
          // Deep copy args to avoid internal re assign issue
          const { where, order, skip, first, after, last, before, options } = deepcopy(args);
          const { readPreference, includeReadPreference, subqueryReadPreference } = options || {};
          const { config, auth, info } = context;
          const selectedFields = getFieldNames(queryInfo);

          const { keys, include } = extractKeysAndInclude(
            selectedFields
              .filter(field => field.startsWith('edges.node.'))
              .map(field => field.replace('edges.node.', ''))
              .filter(field => field.indexOf('edges.node') < 0)
          );
          const parseOrder = order && order.join(',');

          return await objectsQueries.findObjects(
            className,
            where,
            parseOrder,
            skip,
            first,
            after,
            last,
            before,
            keys,
            include,
            false,
            readPreference,
            includeReadPreference,
            subqueryReadPreference,
            config,
            auth,
            info,
            selectedFields,
            parseGraphQLSchema.parseClasses
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }
};

export { load };
