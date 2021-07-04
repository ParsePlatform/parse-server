import { GraphQLNonNull, GraphQLEnumType } from 'graphql';
import deepcopy from 'deepcopy';
import { mutationWithClientMutationId } from 'graphql-relay';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.functionNames.length > 0) {
    const cloudCodeFunctionEnum = parseGraphQLSchema.addGraphQLType(
      new GraphQLEnumType({
        name: 'CloudCodeFunction',
        description:
          'The CloudCodeFunction enum type contains a list of all available cloud code functions.',
        values: parseGraphQLSchema.functionNames.reduce(
          (values, functionName) => ({
            ...values,
            [functionName]: { value: functionName },
          }),
          {}
        ),
      }),
      true,
      true
    );

    const callCloudCodeMutation = mutationWithClientMutationId({
      name: 'CallCloudCode',
      description: 'The callCloudCode mutation can be used to invoke a cloud code function.',
      inputFields: {
        functionName: {
          description: 'This is the function to be called.',
          type: new GraphQLNonNull(cloudCodeFunctionEnum),
        },
        params: {
          description: 'These are the params to be passed to the function.',
          type: defaultGraphQLTypes.OBJECT,
        },
      },
      outputFields: {
        result: {
          description: 'This is the result value of the cloud code function execution.',
          type: defaultGraphQLTypes.ANY,
        },
      },
      mutateAndGetPayload: async (args, context) => {
        try {
          const { functionName, params } = deepcopy(args);
          const { config, auth, info } = context;

          return {
            result: (
              await FunctionsRouter.handleCloudFunction({
                params: {
                  functionName,
                },
                config,
                auth,
                info,
                body: params,
              })
            ).response.result,
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.args.input.type.ofType, true, true);
    parseGraphQLSchema.addGraphQLType(callCloudCodeMutation.type, true, true);
    parseGraphQLSchema.addGraphQLMutation('callCloudCode', callCloudCodeMutation, true, true);
  }
};

export { load };
