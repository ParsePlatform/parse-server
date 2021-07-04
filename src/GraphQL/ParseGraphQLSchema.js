import Parse from 'parse/node';
import { GraphQLSchema, GraphQLObjectType, DocumentNode, GraphQLNamedType } from 'graphql';
import { stitchSchemas } from '@graphql-tools/stitch';
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import requiredParameter from '../requiredParameter';
import * as defaultGraphQLTypes from './loaders/defaultGraphQLTypes';
import * as parseClassTypes from './loaders/parseClassTypes';
import * as parseClassQueries from './loaders/parseClassQueries';
import * as parseClassMutations from './loaders/parseClassMutations';
import * as defaultGraphQLQueries from './loaders/defaultGraphQLQueries';
import * as defaultGraphQLMutations from './loaders/defaultGraphQLMutations';
import ParseGraphQLController, { ParseGraphQLConfig } from '../Controllers/ParseGraphQLController';
import DatabaseController from '../Controllers/DatabaseController';
import SchemaCache from '../Adapters/Cache/SchemaCache';
import { toGraphQLError } from './parseGraphQLUtils';
import * as schemaDirectives from './loaders/schemaDirectives';
import * as schemaTypes from './loaders/schemaTypes';
import { getFunctionNames } from '../triggers';
import * as defaultRelaySchema from './loaders/defaultRelaySchema';

const RESERVED_GRAPHQL_TYPE_NAMES = [
  'String',
  'Boolean',
  'Int',
  'Float',
  'ID',
  'ArrayResult',
  'Query',
  'Mutation',
  'Subscription',
  'CreateFileInput',
  'CreateFilePayload',
  'Viewer',
  'SignUpInput',
  'SignUpPayload',
  'LogInInput',
  'LogInPayload',
  'LogOutInput',
  'LogOutPayload',
  'CloudCodeFunction',
  'CallCloudCodeInput',
  'CallCloudCodePayload',
  'CreateClassInput',
  'CreateClassPayload',
  'UpdateClassInput',
  'UpdateClassPayload',
  'DeleteClassInput',
  'DeleteClassPayload',
  'PageInfo',
];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes'];
const RESERVED_GRAPHQL_MUTATION_NAMES = [
  'signUp',
  'logIn',
  'logOut',
  'createFile',
  'callCloudCode',
  'createClass',
  'updateClass',
  'deleteClass',
];

class ParseGraphQLSchema {
  databaseController: DatabaseController;
  parseGraphQLController: ParseGraphQLController;
  parseGraphQLConfig: ParseGraphQLConfig;
  log: any;
  appId: string;
  graphQLCustomTypeDefs: ?(string | GraphQLSchema | DocumentNode | GraphQLNamedType[]);
  schemaCache: any;

  constructor(
    params: {
      databaseController: DatabaseController,
      parseGraphQLController: ParseGraphQLController,
      log: any,
      appId: string,
      graphQLCustomTypeDefs: ?(string | GraphQLSchema | DocumentNode | GraphQLNamedType[]),
    } = {}
  ) {
    this.parseGraphQLController =
      params.parseGraphQLController ||
      requiredParameter('You must provide a parseGraphQLController instance!');
    this.databaseController =
      params.databaseController ||
      requiredParameter('You must provide a databaseController instance!');
    this.log = params.log || requiredParameter('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
    this.appId = params.appId || requiredParameter('You must provide the appId!');
    this.schemaCache = SchemaCache;
  }

  async load() {
    const { parseGraphQLConfig } = await this._initializeSchemaAndConfig();
    const parseClasses = await this._getClassesForSchema(parseGraphQLConfig);
    const parseClassesString = JSON.stringify(parseClasses);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = JSON.stringify(functionNames);

    if (
      this.graphQLSchema &&
      !this._hasSchemaInputChanged({
        parseClasses,
        parseClassesString,
        parseGraphQLConfig,
        functionNamesString,
      })
    ) {
      return this.graphQLSchema;
    }

    this.parseClasses = parseClasses;
    this.parseClassesString = parseClassesString;
    this.parseGraphQLConfig = parseGraphQLConfig;
    this.functionNames = functionNames;
    this.functionNamesString = functionNamesString;
    this.parseClassTypes = {};
    this.viewerType = null;
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};
    this.relayNodeInterface = null;

    defaultGraphQLTypes.load(this);
    defaultRelaySchema.load(this);
    schemaTypes.load(this);

    this._getParseClassesWithConfig(parseClasses, parseGraphQLConfig).forEach(
      ([parseClass, parseClassConfig]) => {
        // Some times schema return the _auth_data_ field
        // it will lead to unstable graphql generation order
        if (parseClass.className === '_User') {
          Object.keys(parseClass.fields).forEach(fieldName => {
            if (fieldName.startsWith('_auth_data_')) {
              delete parseClass.fields[fieldName];
            }
          });
        }

        // Fields order inside the schema seems to not be consistent across
        // restart so we need to ensure an alphabetical order
        // also it's better for the playground documentation
        const orderedFields = {};
        Object.keys(parseClass.fields)
          .sort()
          .forEach(fieldName => {
            orderedFields[fieldName] = parseClass.fields[fieldName];
          });
        parseClass.fields = orderedFields;
        parseClassTypes.load(this, parseClass, parseClassConfig);
        parseClassQueries.load(this, parseClass, parseClassConfig);
        parseClassMutations.load(this, parseClass, parseClassConfig);
      }
    );

    defaultGraphQLTypes.loadArrayResult(this, parseClasses);
    defaultGraphQLQueries.load(this);
    defaultGraphQLMutations.load(this);

    let graphQLQuery = undefined;
    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries,
      });
      this.addGraphQLType(graphQLQuery, true, true);
    }

    let graphQLMutation = undefined;
    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations,
      });
      this.addGraphQLType(graphQLMutation, true, true);
    }

    let graphQLSubscription = undefined;
    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions,
      });
      this.addGraphQLType(graphQLSubscription, true, true);
    }

    this.graphQLAutoSchema = new GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription,
    });

    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);

      if (typeof this.graphQLCustomTypeDefs.getTypeMap === 'function') {
        // In following code we use underscore attr to avoid js var un ref
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs._typeMap;
        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (
              this.graphQLAutoSchema._typeMap[parent[key].name] &&
              this.graphQLAutoSchema._typeMap[parent[key].name] !== parent[key]
            ) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema._typeMap[parent[key].name];
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        };
        // Add non shared types from custom schema to auto schema
        // note: some non shared types can use some shared types
        // so this code need to be ran before the shared types addition
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap)
          .sort()
          .forEach(customGraphQLSchemaTypeKey => {
            const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
            if (
              !customGraphQLSchemaType ||
              !customGraphQLSchemaType.name ||
              customGraphQLSchemaType.name.startsWith('__')
            ) {
              return;
            }
            const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[
              customGraphQLSchemaType.name
            ];
            if (!autoGraphQLSchemaType) {
              this.graphQLAutoSchema._typeMap[
                customGraphQLSchemaType.name
              ] = customGraphQLSchemaType;
            }
          });
        // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // we use sort to ensure schema consistency over restarts
        Object.keys(customGraphQLSchemaTypeMap)
          .sort()
          .forEach(customGraphQLSchemaTypeKey => {
            const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];
            if (
              !customGraphQLSchemaType ||
              !customGraphQLSchemaType.name ||
              customGraphQLSchemaType.name.startsWith('__')
            ) {
              return;
            }
            const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[
              customGraphQLSchemaType.name
            ];

            if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
              Object.keys(customGraphQLSchemaType._fields)
                .sort()
                .forEach(fieldKey => {
                  const field = customGraphQLSchemaType._fields[fieldKey];
                  findAndReplaceLastType(field, 'type');
                  autoGraphQLSchemaType._fields[field.name] = field;
                });
            }
          });
        this.graphQLSchema = this.graphQLAutoSchema;
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          stitchSchemas,
        });
      } else {
        this.graphQLSchema = stitchSchemas({
          schemas: [
            this.graphQLSchemaDirectivesDefinitions,
            this.graphQLAutoSchema,
            this.graphQLCustomTypeDefs,
          ],
          mergeDirectives: true,
        });
      }

      // Only merge directive when string schema provided
      const graphQLSchemaTypeMap = this.graphQLSchema.getTypeMap();
      Object.keys(graphQLSchemaTypeMap).forEach(graphQLSchemaTypeName => {
        const graphQLSchemaType = graphQLSchemaTypeMap[graphQLSchemaTypeName];
        if (
          typeof graphQLSchemaType.getFields === 'function' &&
          this.graphQLCustomTypeDefs.definitions
        ) {
          const graphQLCustomTypeDef = this.graphQLCustomTypeDefs.definitions.find(
            definition => definition.name.value === graphQLSchemaTypeName
          );
          if (graphQLCustomTypeDef) {
            const graphQLSchemaTypeFieldMap = graphQLSchemaType.getFields();
            Object.keys(graphQLSchemaTypeFieldMap).forEach(graphQLSchemaTypeFieldName => {
              const graphQLSchemaTypeField = graphQLSchemaTypeFieldMap[graphQLSchemaTypeFieldName];
              if (!graphQLSchemaTypeField.astNode) {
                const astNode = graphQLCustomTypeDef.fields.find(
                  field => field.name.value === graphQLSchemaTypeFieldName
                );
                if (astNode) {
                  graphQLSchemaTypeField.astNode = astNode;
                }
              }
            });
          }
        }
      });

      SchemaDirectiveVisitor.visitSchemaDirectives(
        this.graphQLSchema,
        this.graphQLSchemaDirectives
      );
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }

    return this.graphQLSchema;
  }

  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (
      (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name)) ||
      this.graphQLTypes.find(existingType => existingType.name === type.name) ||
      (!ignoreConnection && type.name.endsWith('Connection'))
    ) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;
      if (throwError) {
        throw new Error(message);
      }
      this.log.warn(message);
      return undefined;
    }
    this.graphQLTypes.push(type);
    return type;
  }

  addGraphQLQuery(fieldName, field, throwError = false, ignoreReserved = false) {
    if (
      (!ignoreReserved && RESERVED_GRAPHQL_QUERY_NAMES.includes(fieldName)) ||
      this.graphQLQueries[fieldName]
    ) {
      const message = `Query ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this.log.warn(message);
      return undefined;
    }
    this.graphQLQueries[fieldName] = field;
    return field;
  }

  addGraphQLMutation(fieldName, field, throwError = false, ignoreReserved = false) {
    if (
      (!ignoreReserved && RESERVED_GRAPHQL_MUTATION_NAMES.includes(fieldName)) ||
      this.graphQLMutations[fieldName]
    ) {
      const message = `Mutation ${fieldName} could not be added to the auto schema because it collided with an existing field.`;
      if (throwError) {
        throw new Error(message);
      }
      this.log.warn(message);
      return undefined;
    }
    this.graphQLMutations[fieldName] = field;
    return field;
  }

  handleError(error) {
    if (error instanceof Parse.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }
    throw toGraphQLError(error);
  }

  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([
      this.databaseController.loadSchema(),
      this.parseGraphQLController.getGraphQLConfig(),
    ]);

    this.schemaController = schemaController;

    return {
      parseGraphQLConfig,
    };
  }

  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */
  async _getClassesForSchema(parseGraphQLConfig: ParseGraphQLConfig) {
    const { enabledForClasses, disabledForClasses } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();

    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;
      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }
      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }

      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });

      return includedClasses;
    } else {
      return allClasses;
    }
  }

  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */
  _getParseClassesWithConfig(parseClasses, parseGraphQLConfig: ParseGraphQLConfig) {
    const { classConfigs } = parseGraphQLConfig;

    // Make sures that the default classes and classes that
    // starts with capitalized letter will be generated first.
    const sortClasses = (a, b) => {
      a = a.className;
      b = b.className;
      if (a[0] === '_') {
        if (b[0] !== '_') {
          return -1;
        }
      }
      if (b[0] === '_') {
        if (a[0] !== '_') {
          return 1;
        }
      }
      if (a === b) {
        return 0;
      } else if (a < b) {
        return -1;
      } else {
        return 1;
      }
    };

    return parseClasses.sort(sortClasses).map(parseClass => {
      let parseClassConfig;
      if (classConfigs) {
        parseClassConfig = classConfigs.find(c => c.className === parseClass.className);
      }
      return [parseClass, parseClassConfig];
    });
  }

  async _getFunctionNames() {
    return await getFunctionNames(this.appId).filter(functionName => {
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(functionName)) {
        return true;
      } else {
        this.log.warn(
          `Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`
        );
        return false;
      }
    });
  }

  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */
  _hasSchemaInputChanged(params: {
    parseClasses: any,
    parseClassesString: string,
    parseGraphQLConfig: ?ParseGraphQLConfig,
    functionNamesString: string,
  }): boolean {
    const { parseClasses, parseClassesString, parseGraphQLConfig, functionNamesString } = params;

    if (
      JSON.stringify(this.parseGraphQLConfig) === JSON.stringify(parseGraphQLConfig) &&
      this.functionNamesString === functionNamesString
    ) {
      if (this.parseClasses === parseClasses) {
        return false;
      }

      if (this.parseClassesString === parseClassesString) {
        this.parseClasses = parseClasses;
        return false;
      }
    }

    return true;
  }
}

export { ParseGraphQLSchema };
