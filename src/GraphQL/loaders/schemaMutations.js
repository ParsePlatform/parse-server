import Parse from 'parse/node';
import { GraphQLNonNull } from 'graphql';
import deepcopy from 'deepcopy';
import { mutationWithClientMutationId } from 'graphql-relay';
import * as schemaTypes from './schemaTypes';
import { transformToParse, transformToGraphQL } from '../transformers/schemaFields';
import { enforceMasterKeyAccess } from '../parseGraphQLUtils';
import { getClass } from './schemaQueries';

const load = parseGraphQLSchema => {
  const createClassMutation = mutationWithClientMutationId({
    name: 'CreateClass',
    description:
      'The createClass mutation can be used to create the schema for a new object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT,
      },
    },
    outputFields: {
      class: {
        description: 'This is the created class.',
        type: new GraphQLNonNull(schemaTypes.CLASS),
      },
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const { name, schemaFields } = deepcopy(args);
        const { config, auth } = context;

        enforceMasterKeyAccess(auth);

        if (auth.isReadOnly) {
          throw new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            "read-only masterKey isn't allowed to create a schema."
          );
        }

        const schema = await config.database.loadSchema({ clearCache: true });
        const parseClass = await schema.addClassIfNotExists(name, transformToParse(schemaFields));
        return {
          class: {
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          },
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(createClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createClass', createClassMutation, true, true);

  const updateClassMutation = mutationWithClientMutationId({
    name: 'UpdateClass',
    description:
      'The updateClass mutation can be used to update the schema for an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
      schemaFields: {
        description: "These are the schema's fields of the object class.",
        type: schemaTypes.SCHEMA_FIELDS_INPUT,
      },
    },
    outputFields: {
      class: {
        description: 'This is the updated class.',
        type: new GraphQLNonNull(schemaTypes.CLASS),
      },
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const { name, schemaFields } = deepcopy(args);
        const { config, auth } = context;

        enforceMasterKeyAccess(auth);

        if (auth.isReadOnly) {
          throw new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            "read-only masterKey isn't allowed to update a schema."
          );
        }

        const schema = await config.database.loadSchema({ clearCache: true });
        const existingParseClass = await getClass(name, schema);
        const parseClass = await schema.updateClass(
          name,
          transformToParse(schemaFields, existingParseClass.fields),
          undefined,
          undefined,
          config.database
        );
        return {
          class: {
            name: parseClass.className,
            schemaFields: transformToGraphQL(parseClass.fields),
          },
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(updateClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(updateClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('updateClass', updateClassMutation, true, true);

  const deleteClassMutation = mutationWithClientMutationId({
    name: 'DeleteClass',
    description: 'The deleteClass mutation can be used to delete an existing object class.',
    inputFields: {
      name: schemaTypes.CLASS_NAME_ATT,
    },
    outputFields: {
      class: {
        description: 'This is the deleted class.',
        type: new GraphQLNonNull(schemaTypes.CLASS),
      },
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const { name } = deepcopy(args);
        const { config, auth } = context;

        enforceMasterKeyAccess(auth);

        if (auth.isReadOnly) {
          throw new Parse.Error(
            Parse.Error.OPERATION_FORBIDDEN,
            "read-only masterKey isn't allowed to delete a schema."
          );
        }

        const schema = await config.database.loadSchema({ clearCache: true });
        const existingParseClass = await getClass(name, schema);
        await config.database.deleteSchema(name);
        return {
          class: {
            name: existingParseClass.className,
            schemaFields: transformToGraphQL(existingParseClass.fields),
          },
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(deleteClassMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(deleteClassMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('deleteClass', deleteClassMutation, true, true);
};

export { load };
