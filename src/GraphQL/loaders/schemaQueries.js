import Parse from 'parse/node';
import deepcopy from 'deepcopy';
import { GraphQLNonNull, GraphQLList } from 'graphql';
import { transformToGraphQL } from '../transformers/schemaFields';
import * as schemaTypes from './schemaTypes';
import { enforceMasterKeyAccess } from '../parseGraphQLUtils';

const getClass = async (name, schema) => {
  try {
    return await schema.getOneSchema(name, true);
  } catch (e) {
    if (e === undefined) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${name} does not exist.`);
    } else {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    }
  }
};

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery(
    'class',
    {
      description: 'The class query can be used to retrieve an existing object class.',
      args: {
        name: schemaTypes.CLASS_NAME_ATT,
      },
      type: new GraphQLNonNull(schemaTypes.CLASS),
      resolve: async (_source, args, context) => {
        try {
          const { name } = deepcopy(args);
          const { config, auth } = context;

          enforceMasterKeyAccess(auth);

          const schema = await config.database.loadSchema({ clearCache: true });
          const parseClass = await getClass(name, schema);
          return {
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLQuery(
    'classes',
    {
      description: 'The classes query can be used to retrieve the existing object classes.',
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(schemaTypes.CLASS))),
      resolve: async (_source, _args, context) => {
        try {
          const { config, auth } = context;

          enforceMasterKeyAccess(auth);

          const schema = await config.database.loadSchema({ clearCache: true });
          return (await schema.getAllClasses(true)).map(parseClass => ({
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          }));
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { getClass, load };
