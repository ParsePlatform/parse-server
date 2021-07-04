import { GraphQLNonNull } from 'graphql';
import { fromGlobalId, mutationWithClientMutationId } from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';
import deepcopy from 'deepcopy';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import { extractKeysAndInclude, getParseClassMutationConfig } from '../parseGraphQLUtils';
import * as objectsMutations from '../helpers/objectsMutations';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { transformTypes } from '../transformers/mutation';

const getOnlyRequiredFields = (
  updatedFields,
  selectedFieldsString,
  includedFieldsString,
  nativeObjectFields
) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields
    .filter(field => !nativeObjectFields.includes(field) || includedFields.includes(field))
    .join(',');
  if (!missingFields.length) {
    return { needGet: false, keys: '' };
  } else {
    return { needGet: true, keys: missingFields };
  }
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig: ?ParseGraphQLClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);
  const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);

  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
    createAlias: createAlias = '',
    updateAlias: updateAlias = '',
    destroyAlias: destroyAlias = '',
  } = getParseClassMutationConfig(parseClassConfig);

  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType,
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isCreateEnabled) {
    const createGraphQLMutationName = createAlias || `create${graphQLClassName}`;
    const createGraphQLMutation = mutationWithClientMutationId({
      name: `Create${graphQLClassName}`,
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      inputFields: {
        fields: {
          description: 'These are the fields that will be used to create the new object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT,
        },
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the created object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { fields } = deepcopy(args);
          if (!fields) fields = {};
          const { config, auth, info } = context;

          const parseFields = await transformTypes('create', fields, {
            className,
            parseGraphQLSchema,
            req: { config, auth, info },
          });

          const createdObject = await objectsMutations.createObject(
            className,
            parseFields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(fields, keys, include, [
            'id',
            'objectId',
            'createdAt',
            'updatedAt',
          ]);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(
            parseClass.fields,
            keys,
            parseGraphQLSchema.parseClasses
          );
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              createdObject.objectId,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              createdObject.objectId,
              undefined,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          return {
            [getGraphQLQueryName]: {
              ...createdObject,
              updatedAt: createdObject.createdAt,
              ...parseFields,
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(createGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(createGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, createGraphQLMutation);
    }
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = updateAlias || `update${graphQLClassName}`;
    const updateGraphQLMutation = mutationWithClientMutationId({
      name: `Update${graphQLClassName}`,
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields that will be used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT,
        },
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the updated object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { id, fields } = deepcopy(args);
          if (!fields) fields = {};
          const { config, auth, info } = context;

          const globalIdObject = fromGlobalId(id);

          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }

          const parseFields = await transformTypes('update', fields, {
            className,
            parseGraphQLSchema,
            req: { config, auth, info },
          });

          const updatedObject = await objectsMutations.updateObject(
            className,
            id,
            parseFields,
            config,
            auth,
            info
          );

          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(fields, keys, include, [
            'id',
            'objectId',
            'updatedAt',
          ]);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(
            parseClass.fields,
            keys,
            parseGraphQLSchema.parseClasses
          );
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              undefined,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...updatedObject,
              ...parseFields,
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, updateGraphQLMutation);
    }
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = destroyAlias || `delete${graphQLClassName}`;
    const deleteGraphQLMutation = mutationWithClientMutationId({
      name: `Delete${graphQLClassName}`,
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the deleted object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { id } = deepcopy(args);
          const { config, auth, info } = context;

          const globalIdObject = fromGlobalId(id);

          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }

          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          let optimizedObject = {};
          if (keys && keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              keys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          await objectsMutations.deleteObject(className, id, config, auth, info);
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, deleteGraphQLMutation);
    }
  }
};

export { load };
