const http = require('http');
const express = require('express');
const req = require('../lib/request');
const fetch = require('node-fetch');
const FormData = require('form-data');
const ws = require('ws');
require('./helper');
const { updateCLP } = require('./support/dev');

const pluralize = require('pluralize');
const { getMainDefinition } = require('apollo-utilities');
const { ApolloLink, split } = require('apollo-link');
const { createHttpLink } = require('apollo-link-http');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { createUploadLink } = require('apollo-upload-client');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const ApolloClient = require('apollo-client').default;
const gql = require('graphql-tag');
const { toGlobalId } = require('graphql-relay');
const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLSchema,
} = require('graphql');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');
const ReadPreference = require('mongodb').ReadPreference;
const { v4: uuidv4 } = require('uuid');

function handleError(e) {
  if (e && e.networkError && e.networkError.result && e.networkError.result.errors) {
    fail(e.networkError.result.errors);
  } else {
    fail(e);
  }
}

describe('ParseGraphQLServer', () => {
  let parseServer;
  let parseGraphQLServer;

  beforeEach(async () => {
    parseServer = await global.reconfigureServer({});
    parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
    });
  });

  describe('constructor', () => {
    it('should require a parseServer instance', () => {
      expect(() => new ParseGraphQLServer()).toThrow('You must provide a parseServer instance!');
    });

    it('should require config.graphQLPath', () => {
      expect(() => new ParseGraphQLServer(parseServer)).toThrow(
        'You must provide a config.graphQLPath!'
      );
      expect(() => new ParseGraphQLServer(parseServer, {})).toThrow(
        'You must provide a config.graphQLPath!'
      );
    });

    it('should only require parseServer and config.graphQLPath args', () => {
      let parseGraphQLServer;
      expect(() => {
        parseGraphQLServer = new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        });
      }).not.toThrow();
      expect(parseGraphQLServer.parseGraphQLSchema).toBeDefined();
      expect(parseGraphQLServer.parseGraphQLSchema.databaseController).toEqual(
        parseServer.config.databaseController
      );
    });

    it('should initialize parseGraphQLSchema with a log controller', async () => {
      const loggerAdapter = {
        log: () => {},
        error: () => {},
      };
      const parseServer = await global.reconfigureServer({
        loggerAdapter,
      });
      const parseGraphQLServer = new ParseGraphQLServer(parseServer, {
        graphQLPath: 'graphql',
      });
      expect(parseGraphQLServer.parseGraphQLSchema.log.adapter).toBe(loggerAdapter);
    });
  });

  describe('_getGraphQLOptions', () => {
    const req = {
      info: new Object(),
      config: new Object(),
      auth: new Object(),
    };

    it("should return schema and context with req's info, config and auth", async () => {
      const options = await parseGraphQLServer._getGraphQLOptions(req);
      expect(options.schema).toEqual(parseGraphQLServer.parseGraphQLSchema.graphQLSchema);
      expect(options.context.info).toEqual(req.info);
      expect(options.context.config).toEqual(req.config);
      expect(options.context.auth).toEqual(req.auth);
    });

    it('should load GraphQL schema in every call', async () => {
      const originalLoad = parseGraphQLServer.parseGraphQLSchema.load;
      let counter = 0;
      parseGraphQLServer.parseGraphQLSchema.load = () => ++counter;
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(1);
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(2);
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(3);
      parseGraphQLServer.parseGraphQLSchema.load = originalLoad;
    });
  });

  describe('_transformMaxUploadSizeToBytes', () => {
    it('should transform to bytes', () => {
      expect(parseGraphQLServer._transformMaxUploadSizeToBytes('20mb')).toBe(20971520);
      expect(parseGraphQLServer._transformMaxUploadSizeToBytes('333Gb')).toBe(357556027392);
      expect(parseGraphQLServer._transformMaxUploadSizeToBytes('123456KB')).toBe(126418944);
    });
  });

  describe('applyGraphQL', () => {
    it('should require an Express.js app instance', () => {
      expect(() => parseGraphQLServer.applyGraphQL()).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyGraphQL({})).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyGraphQL(new express())).not.toThrow();
    });

    it('should apply middlewares at config.graphQLPath', () => {
      let useCount = 0;
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'somepath',
        }).applyGraphQL({
          use: path => {
            useCount++;
            expect(path).toEqual('somepath');
          },
        })
      ).not.toThrow();
      expect(useCount).toBeGreaterThan(0);
    });
  });

  describe('applyPlayground', () => {
    it('should require an Express.js app instance', () => {
      expect(() => parseGraphQLServer.applyPlayground()).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyPlayground({})).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyPlayground(new express())).not.toThrow();
    });

    it('should require initialization with config.playgroundPath', () => {
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        }).applyPlayground(new express())
      ).toThrow('You must provide a config.playgroundPath to applyPlayground!');
    });

    it('should apply middlewares at config.playgroundPath', () => {
      let useCount = 0;
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphQL',
          playgroundPath: 'somepath',
        }).applyPlayground({
          get: path => {
            useCount++;
            expect(path).toEqual('somepath');
          },
        })
      ).not.toThrow();
      expect(useCount).toBeGreaterThan(0);
    });
  });

  describe('createSubscriptions', () => {
    it('should require initialization with config.subscriptionsPath', () => {
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        }).createSubscriptions({})
      ).toThrow('You must provide a config.subscriptionsPath to createSubscriptions!');
    });
  });

  describe('setGraphQLConfig', () => {
    let parseGraphQLServer;
    beforeEach(() => {
      parseGraphQLServer = new ParseGraphQLServer(parseServer, {
        graphQLPath: 'graphql',
      });
    });
    it('should pass the graphQLConfig onto the parseGraphQLController', async () => {
      let received;
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig(graphQLConfig) {
          received = graphQLConfig;
          return {};
        },
      };
      const graphQLConfig = { enabledForClasses: [] };
      await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
      expect(received).toBe(graphQLConfig);
    });
    it('should not absorb exceptions from parseGraphQLController', async () => {
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig() {
          throw new Error('Network request failed');
        },
      };
      await expectAsync(parseGraphQLServer.setGraphQLConfig({})).toBeRejectedWith(
        new Error('Network request failed')
      );
    });
    it('should return the response from parseGraphQLController', async () => {
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig() {
          return { response: { result: true } };
        },
      };
      await expectAsync(parseGraphQLServer.setGraphQLConfig({})).toBeResolvedTo({
        response: { result: true },
      });
    });
  });

  describe('Auto API', () => {
    let httpServer;
    let parseLiveQueryServer;
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'test',
    };

    let apolloClient;

    let user1;
    let user2;
    let user3;
    let user4;
    let user5;
    let role;
    let object1;
    let object2;
    let object3;
    let object4;
    let objects = [];

    async function prepareData() {
      user1 = new Parse.User();
      user1.setUsername('user1');
      user1.setPassword('user1');
      user1.setEmail('user1@user1.user1');
      await user1.signUp();

      user2 = new Parse.User();
      user2.setUsername('user2');
      user2.setPassword('user2');
      await user2.signUp();

      user3 = new Parse.User();
      user3.setUsername('user3');
      user3.setPassword('user3');
      await user3.signUp();

      user4 = new Parse.User();
      user4.setUsername('user4');
      user4.setPassword('user4');
      await user4.signUp();

      user5 = new Parse.User();
      user5.setUsername('user5');
      user5.setPassword('user5');
      await user5.signUp();

      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);
      role = new Parse.Role();
      role.setName('role');
      role.setACL(roleACL);
      role.getUsers().add(user1);
      role.getUsers().add(user3);
      role = await role.save();

      const schemaController = await parseServer.config.databaseController.loadSchema();
      try {
        await schemaController.addClassIfNotExists(
          'GraphQLClass',
          {
            someField: { type: 'String' },
            pointerToUser: { type: 'Pointer', targetClass: '_User' },
          },
          {
            find: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            create: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            get: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            update: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            addField: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            delete: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            readUserFields: ['pointerToUser'],
            writeUserFields: ['pointerToUser'],
          },
          {}
        );
      } catch (err) {
        if (!(err instanceof Parse.Error) || err.message !== 'Class GraphQLClass already exists.') {
          throw err;
        }
      }

      object1 = new Parse.Object('GraphQLClass');
      object1.set('someField', 'someValue1');
      object1.set('someOtherField', 'A');
      const object1ACL = new Parse.ACL();
      object1ACL.setPublicReadAccess(false);
      object1ACL.setPublicWriteAccess(false);
      object1ACL.setRoleReadAccess(role, true);
      object1ACL.setRoleWriteAccess(role, true);
      object1ACL.setReadAccess(user1.id, true);
      object1ACL.setWriteAccess(user1.id, true);
      object1ACL.setReadAccess(user2.id, true);
      object1ACL.setWriteAccess(user2.id, true);
      object1.setACL(object1ACL);
      await object1.save(undefined, { useMasterKey: true });

      object2 = new Parse.Object('GraphQLClass');
      object2.set('someField', 'someValue2');
      object2.set('someOtherField', 'A');
      const object2ACL = new Parse.ACL();
      object2ACL.setPublicReadAccess(false);
      object2ACL.setPublicWriteAccess(false);
      object2ACL.setReadAccess(user1.id, true);
      object2ACL.setWriteAccess(user1.id, true);
      object2ACL.setReadAccess(user2.id, true);
      object2ACL.setWriteAccess(user2.id, true);
      object2ACL.setReadAccess(user5.id, true);
      object2ACL.setWriteAccess(user5.id, true);
      object2.setACL(object2ACL);
      await object2.save(undefined, { useMasterKey: true });

      object3 = new Parse.Object('GraphQLClass');
      object3.set('someField', 'someValue3');
      object3.set('someOtherField', 'B');
      object3.set('pointerToUser', user5);
      await object3.save(undefined, { useMasterKey: true });

      object4 = new Parse.Object('PublicClass');
      object4.set('someField', 'someValue4');
      await object4.save();

      objects = [];
      objects.push(object1, object2, object3, object4);
    }

    beforeEach(async () => {
      const expressApp = express();
      httpServer = http.createServer(expressApp);
      expressApp.use('/parse', parseServer.app);
      parseLiveQueryServer = ParseServer.createLiveQueryServer(httpServer, {
        port: 1338,
      });
      parseGraphQLServer.applyGraphQL(expressApp);
      parseGraphQLServer.applyPlayground(expressApp);
      parseGraphQLServer.createSubscriptions(httpServer);
      await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));

      const subscriptionClient = new SubscriptionClient(
        'ws://localhost:13377/subscriptions',
        {
          reconnect: true,
          connectionParams: headers,
        },
        ws
      );
      const wsLink = new WebSocketLink(subscriptionClient);
      const httpLink = createUploadLink({
        uri: 'http://localhost:13377/graphql',
        fetch,
        headers,
      });
      apolloClient = new ApolloClient({
        link: split(
          ({ query }) => {
            const { kind, operation } = getMainDefinition(query);
            return kind === 'OperationDefinition' && operation === 'subscription';
          },
          wsLink,
          httpLink
        ),
        cache: new InMemoryCache(),
        defaultOptions: {
          query: {
            fetchPolicy: 'no-cache',
          },
        },
      });
      spyOn(console, 'warn').and.callFake(() => {});
      spyOn(console, 'error').and.callFake(() => {});
    });

    afterEach(async () => {
      await parseLiveQueryServer.server.close();
      await httpServer.close();
    });

    describe('GraphQL', () => {
      it('should be healthy', async () => {
        try {
          const health = (
            await apolloClient.query({
              query: gql`
                query Health {
                  health
                }
              `,
            })
          ).data.health;
          expect(health).toBeTruthy();
        } catch (e) {
          handleError(e);
        }
      });

      it('should be cors enabled', async () => {
        let checked = false;
        const apolloClient = new ApolloClient({
          link: new ApolloLink((operation, forward) => {
            return forward(operation).map(response => {
              const context = operation.getContext();
              const {
                response: { headers },
              } = context;
              expect(headers.get('access-control-allow-origin')).toEqual('*');
              checked = true;
              return response;
            });
          }).concat(
            createHttpLink({
              uri: 'http://localhost:13377/graphql',
              fetch,
              headers: {
                ...headers,
                Origin: 'http://someorigin.com',
              },
            })
          ),
          cache: new InMemoryCache(),
        });
        const healthResponse = await apolloClient.query({
          query: gql`
            query Health {
              health
            }
          `,
        });
        expect(healthResponse.data.health).toBeTruthy();
        expect(checked).toBeTruthy();
      });

      it('should handle Parse headers', async () => {
        let checked = false;
        const originalGetGraphQLOptions = parseGraphQLServer._getGraphQLOptions;
        parseGraphQLServer._getGraphQLOptions = async req => {
          expect(req.info).toBeDefined();
          expect(req.config).toBeDefined();
          expect(req.auth).toBeDefined();
          checked = true;
          return await originalGetGraphQLOptions.bind(parseGraphQLServer)(req);
        };
        const health = (
          await apolloClient.query({
            query: gql`
              query Health {
                health
              }
            `,
          })
        ).data.health;
        expect(health).toBeTruthy();
        expect(checked).toBeTruthy();
        parseGraphQLServer._getGraphQLOptions = originalGetGraphQLOptions;
      });
    });

    describe('Playground', () => {
      it('should mount playground', async () => {
        const res = await req({
          method: 'GET',
          url: 'http://localhost:13377/playground',
        });
        expect(res.status).toEqual(200);
      });
    });

    describe('Schema', () => {
      const resetGraphQLCache = async () => {
        await Promise.all([
          parseGraphQLServer.parseGraphQLController.cacheController.graphQL.clear(),
          parseGraphQLServer.parseGraphQLSchema.schemaCache.clear(),
        ]);
      };

      describe('Default Types', () => {
        it('should have Object scalar type', async () => {
          const objectType = (
            await apolloClient.query({
              query: gql`
                query ObjectType {
                  __type(name: "Object") {
                    kind
                  }
                }
              `,
            })
          ).data['__type'];
          expect(objectType.kind).toEqual('SCALAR');
        });

        it('should have Date scalar type', async () => {
          const dateType = (
            await apolloClient.query({
              query: gql`
                query DateType {
                  __type(name: "Date") {
                    kind
                  }
                }
              `,
            })
          ).data['__type'];
          expect(dateType.kind).toEqual('SCALAR');
        });

        it('should have ArrayResult type', async () => {
          const arrayResultType = (
            await apolloClient.query({
              query: gql`
                query ArrayResultType {
                  __type(name: "ArrayResult") {
                    kind
                  }
                }
              `,
            })
          ).data['__type'];
          expect(arrayResultType.kind).toEqual('UNION');
        });

        it('should have File object type', async () => {
          const fileType = (
            await apolloClient.query({
              query: gql`
                query FileType {
                  __type(name: "FileInfo") {
                    kind
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'];
          expect(fileType.kind).toEqual('OBJECT');
          expect(fileType.fields.map(field => field.name).sort()).toEqual(['name', 'url']);
        });

        it('should have Class interface type', async () => {
          const classType = (
            await apolloClient.query({
              query: gql`
                query ClassType {
                  __type(name: "ParseObject") {
                    kind
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'];
          expect(classType.kind).toEqual('INTERFACE');
          expect(classType.fields.map(field => field.name).sort()).toEqual([
            'ACL',
            'createdAt',
            'objectId',
            'updatedAt',
          ]);
        });

        it('should have ReadPreference enum type', async () => {
          const readPreferenceType = (
            await apolloClient.query({
              query: gql`
                query ReadPreferenceType {
                  __type(name: "ReadPreference") {
                    kind
                    enumValues {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'];
          expect(readPreferenceType.kind).toEqual('ENUM');
          expect(readPreferenceType.enumValues.map(value => value.name).sort()).toEqual([
            'NEAREST',
            'PRIMARY',
            'PRIMARY_PREFERRED',
            'SECONDARY',
            'SECONDARY_PREFERRED',
          ]);
        });

        it('should have GraphQLUpload object type', async () => {
          const graphQLUploadType = (
            await apolloClient.query({
              query: gql`
                query GraphQLUploadType {
                  __type(name: "Upload") {
                    kind
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'];
          expect(graphQLUploadType.kind).toEqual('SCALAR');
        });

        it('should have all expected types', async () => {
          const schemaTypes = (
            await apolloClient.query({
              query: gql`
                query SchemaTypes {
                  __schema {
                    types {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__schema'].types.map(type => type.name);

          const expectedTypes = ['ParseObject', 'Date', 'FileInfo', 'ReadPreference', 'Upload'];
          expect(expectedTypes.every(type => schemaTypes.indexOf(type) !== -1)).toBeTruthy(
            JSON.stringify(schemaTypes.types)
          );
        });
      });

      describe('Relay Specific Types', () => {
        let clearCache;
        beforeEach(async () => {
          if (!clearCache) {
            await resetGraphQLCache();
            clearCache = true;
          }
        });

        afterAll(async () => {
          await resetGraphQLCache();
        });

        it('should have Node interface', async () => {
          const schemaTypes = (
            await apolloClient.query({
              query: gql`
                query SchemaTypes {
                  __schema {
                    types {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__schema'].types.map(type => type.name);

          expect(schemaTypes).toContain('Node');
        });

        it('should have node query', async () => {
          const queryFields = (
            await apolloClient.query({
              query: gql`
                query UserType {
                  __type(name: "Query") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields.map(field => field.name);

          expect(queryFields).toContain('node');
        });

        it('should return global id', async () => {
          const userFields = (
            await apolloClient.query({
              query: gql`
                query UserType {
                  __type(name: "User") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields.map(field => field.name);

          expect(userFields).toContain('id');
          expect(userFields).toContain('objectId');
        });

        it('should have clientMutationId in create file input', async () => {
          const createFileInputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateFileInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(createFileInputFields).toEqual(['clientMutationId', 'upload']);
        });

        it('should have clientMutationId in create file payload', async () => {
          const createFilePayloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateFilePayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(createFilePayloadFields).toEqual(['clientMutationId', 'fileInfo']);
        });

        it('should have clientMutationId in call function input', async () => {
          Parse.Cloud.define('hello', () => {});

          const callFunctionInputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CallCloudCodeInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(callFunctionInputFields).toEqual(['clientMutationId', 'functionName', 'params']);
        });

        it('should have clientMutationId in call function payload', async () => {
          Parse.Cloud.define('hello', () => {});

          const callFunctionPayloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CallCloudCodePayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(callFunctionPayloadFields).toEqual(['clientMutationId', 'result']);
        });

        it('should have clientMutationId in sign up mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "SignUpInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(inputFields).toEqual(['clientMutationId', 'fields']);
        });

        it('should have clientMutationId in sign up mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "SignUpPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['clientMutationId', 'viewer']);
        });

        it('should have clientMutationId in log in mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "LogInInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();
          expect(inputFields).toEqual(['authData', 'clientMutationId', 'password', 'username']);
        });

        it('should have clientMutationId in log in mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "LogInPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['clientMutationId', 'viewer']);
        });

        it('should have clientMutationId in log out mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "LogOutInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(inputFields).toEqual(['clientMutationId']);
        });

        it('should have clientMutationId in log out mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "LogOutPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['clientMutationId', 'ok']);
        });

        it('should have clientMutationId in createClass mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(inputFields).toEqual(['clientMutationId', 'name', 'schemaFields']);
        });

        it('should have clientMutationId in createClass mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['class', 'clientMutationId']);
        });

        it('should have clientMutationId in updateClass mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "UpdateClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(inputFields).toEqual(['clientMutationId', 'name', 'schemaFields']);
        });

        it('should have clientMutationId in updateClass mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "UpdateClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['class', 'clientMutationId']);
        });

        it('should have clientMutationId in deleteClass mutation input', async () => {
          const inputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "DeleteClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(inputFields).toEqual(['clientMutationId', 'name']);
        });

        it('should have clientMutationId in deleteClass mutation payload', async () => {
          const payloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "UpdateClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(payloadFields).toEqual(['class', 'clientMutationId']);
        });

        it('should have clientMutationId in custom create object mutation input', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectInputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateSomeClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(createObjectInputFields).toEqual(['clientMutationId', 'fields']);
        });

        it('should have clientMutationId in custom create object mutation payload', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectPayloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "CreateSomeClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(createObjectPayloadFields).toEqual(['clientMutationId', 'someClass']);
        });

        it('should have clientMutationId in custom update object mutation input', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectInputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "UpdateSomeClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(createObjectInputFields).toEqual(['clientMutationId', 'fields', 'id']);
        });

        it('should have clientMutationId in custom update object mutation payload', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectPayloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "UpdateSomeClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(createObjectPayloadFields).toEqual(['clientMutationId', 'someClass']);
        });

        it('should have clientMutationId in custom delete object mutation input', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectInputFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "DeleteSomeClassInput") {
                    inputFields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].inputFields
            .map(field => field.name)
            .sort();

          expect(createObjectInputFields).toEqual(['clientMutationId', 'id']);
        });

        it('should have clientMutationId in custom delete object mutation payload', async () => {
          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const createObjectPayloadFields = (
            await apolloClient.query({
              query: gql`
                query {
                  __type(name: "DeleteSomeClassPayload") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields
            .map(field => field.name)
            .sort();

          expect(createObjectPayloadFields).toEqual(['clientMutationId', 'someClass']);
        });
      });

      describe('Parse Class Types', () => {
        it('should have all expected types', async () => {
          await parseServer.config.databaseController.loadSchema();

          const schemaTypes = (
            await apolloClient.query({
              query: gql`
                query SchemaTypes {
                  __schema {
                    types {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__schema'].types.map(type => type.name);

          const expectedTypes = [
            'Role',
            'RoleWhereInput',
            'CreateRoleFieldsInput',
            'UpdateRoleFieldsInput',
            'RoleConnection',
            'User',
            'UserWhereInput',
            'UserConnection',
            'CreateUserFieldsInput',
            'UpdateUserFieldsInput',
          ];
          expect(expectedTypes.every(type => schemaTypes.indexOf(type) !== -1)).toBeTruthy(
            JSON.stringify(schemaTypes)
          );
        });

        it('should ArrayResult contains all types', async () => {
          const objectType = (
            await apolloClient.query({
              query: gql`
                query ObjectType {
                  __type(name: "ArrayResult") {
                    kind
                    possibleTypes {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'];
          const possibleTypes = objectType.possibleTypes.map(o => o.name);
          expect(possibleTypes).toContain('User');
          expect(possibleTypes).toContain('Role');
          expect(possibleTypes).toContain('Element');
        });

        it('should update schema when it changes', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.updateClass('_User', {
            foo: { type: 'String' },
          });

          const userFields = (
            await apolloClient.query({
              query: gql`
                query UserType {
                  __type(name: "User") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields.map(field => field.name);
          expect(userFields.indexOf('foo') !== -1).toBeTruthy();
        });

        it('should not contain password field from _User class', async () => {
          const userFields = (
            await apolloClient.query({
              query: gql`
                query UserType {
                  __type(name: "User") {
                    fields {
                      name
                    }
                  }
                }
              `,
            })
          ).data['__type'].fields.map(field => field.name);
          expect(userFields.includes('password')).toBeFalsy();
        });
      });

      describe('Configuration', function () {
        const resetGraphQLCache = async () => {
          await Promise.all([
            parseGraphQLServer.parseGraphQLController.cacheController.graphQL.clear(),
            parseGraphQLServer.parseGraphQLSchema.schemaCache.clear(),
          ]);
        };

        beforeEach(async () => {
          await parseGraphQLServer.setGraphQLConfig({});
          await resetGraphQLCache();
        });

        it('should only include types in the enabledForClasses list', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            foo: { type: 'String' },
          });

          const graphQLConfig = {
            enabledForClasses: ['SuperCar'],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          const { data } = await apolloClient.query({
            query: gql`
              query UserType {
                userType: __type(name: "User") {
                  fields {
                    name
                  }
                }
                superCarType: __type(name: "SuperCar") {
                  fields {
                    name
                  }
                }
              }
            `,
          });
          expect(data.userType).toBeNull();
          expect(data.superCarType).toBeTruthy();
        });
        it('should not include types in the disabledForClasses list', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            foo: { type: 'String' },
          });

          const graphQLConfig = {
            disabledForClasses: ['SuperCar'],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          const { data } = await apolloClient.query({
            query: gql`
              query UserType {
                userType: __type(name: "User") {
                  fields {
                    name
                  }
                }
                superCarType: __type(name: "SuperCar") {
                  fields {
                    name
                  }
                }
              }
            `,
          });
          expect(data.superCarType).toBeNull();
          expect(data.userType).toBeTruthy();
        });
        it('should remove query operations when disabled', async () => {
          const superCar = new Parse.Object('SuperCar');
          await superCar.save({ foo: 'bar' });
          const customer = new Parse.Object('Customer');
          await customer.save({ foo: 'bar' });

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    count
                  }
                }
              `,
            })
          ).toBeResolved();

          const graphQLConfig = {
            classConfigs: [
              {
                className: 'SuperCar',
                query: {
                  get: false,
                  find: true,
                },
              },
              {
                className: 'Customer',
                query: {
                  get: true,
                  find: false,
                },
              },
            ],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetCustomer($id: ID!) {
                  customer(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: customer.id,
              },
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars {
                    count
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    count
                  }
                }
              `,
            })
          ).toBeRejected();
        });

        it('should remove mutation operations, create, update and delete, when disabled', async () => {
          const superCar1 = new Parse.Object('SuperCar');
          await superCar1.save({ foo: 'bar' });
          const customer1 = new Parse.Object('Customer');
          await customer1.save({ foo: 'bar' });

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateSuperCar($id: ID!, $foo: String!) {
                  updateSuperCar(input: { id: $id, fields: { foo: $foo } }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: superCar1.id,
                foo: 'lah',
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($id: ID!) {
                  deleteCustomer(input: { id: $id }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: customer1.id,
              },
            })
          ).toBeResolved();

          const { data: customerData } = await apolloClient.query({
            query: gql`
              mutation CreateCustomer($foo: String!) {
                createCustomer(input: { fields: { foo: $foo } }) {
                  customer {
                    id
                  }
                }
              }
            `,
            variables: {
              foo: 'rah',
            },
          });
          expect(customerData.createCustomer.customer).toBeTruthy();

          // used later
          const customer2Id = customerData.createCustomer.customer.id;

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                mutation: {
                  create: true,
                  update: false,
                  destroy: true,
                },
              },
              {
                className: 'Customer',
                mutation: {
                  create: false,
                  update: true,
                  destroy: false,
                },
              },
            ],
          });
          await resetGraphQLCache();

          const { data: superCarData } = await apolloClient.query({
            query: gql`
              mutation CreateSuperCar($foo: String!) {
                createSuperCar(input: { fields: { foo: $foo } }) {
                  superCar {
                    id
                  }
                }
              }
            `,
            variables: {
              foo: 'mah',
            },
          });
          expect(superCarData.createSuperCar).toBeTruthy();
          const superCar3Id = superCarData.createSuperCar.superCar.id;

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateSupercar($id: ID!, $foo: String!) {
                  updateSuperCar(input: { id: $id, fields: { foo: $foo } }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: superCar3Id,
              },
            })
          ).toBeRejected();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteSuperCar($id: ID!) {
                  deleteSuperCar(input: { id: $id }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: superCar3Id,
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation CreateCustomer($foo: String!) {
                  createCustomer(input: { fields: { foo: $foo } }) {
                    customer {
                      id
                    }
                  }
                }
              `,
              variables: {
                foo: 'rah',
              },
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateCustomer($id: ID!, $foo: String!) {
                  updateCustomer(input: { id: $id, fields: { foo: $foo } }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: customer2Id,
                foo: 'tah',
              },
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($id: ID!, $foo: String!) {
                  deleteCustomer(input: { id: $id }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: customer2Id,
              },
            })
          ).toBeRejected();
        });

        it('should only allow the supplied create and update fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  inputFields: {
                    create: ['engine', 'doors', 'price'],
                    update: ['price', 'mileage'],
                  },
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation InvalidCreateSuperCar {
                  createSuperCar(input: { fields: { engine: "diesel", mileage: 1000 } }) {
                    superCar {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeRejected();
          const { id: superCarId } = (
            await apolloClient.query({
              query: gql`
                mutation ValidCreateSuperCar {
                  createSuperCar(
                    input: { fields: { engine: "diesel", doors: 5, price: "£10000" } }
                  ) {
                    superCar {
                      id
                    }
                  }
                }
              `,
            })
          ).data.createSuperCar.superCar;

          expect(superCarId).toBeTruthy();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation InvalidUpdateSuperCar($id: ID!) {
                  updateSuperCar(input: { id: $id, fields: { engine: "petrol" } }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: superCarId,
              },
            })
          ).toBeRejected();

          const updatedSuperCar = (
            await apolloClient.query({
              query: gql`
                mutation ValidUpdateSuperCar($id: ID!) {
                  updateSuperCar(input: { id: $id, fields: { mileage: 2000 } }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: superCarId,
              },
            })
          ).data.updateSuperCar;
          expect(updatedSuperCar).toBeTruthy();
        });

        it('should handle required fields from the Parse class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String', required: true },
            doors: { type: 'Number', required: true },
            price: { type: 'String' },
            mileage: { type: 'Number' },
          });

          await resetGraphQLCache();

          const {
            data: { __type },
          } = await apolloClient.query({
            query: gql`
              query requiredFields {
                __type(name: "CreateSuperCarFieldsInput") {
                  inputFields {
                    name
                    type {
                      kind
                    }
                  }
                }
              }
            `,
          });
          expect(__type.inputFields.find(o => o.name === 'price').type.kind).toEqual('SCALAR');
          expect(__type.inputFields.find(o => o.name === 'engine').type.kind).toEqual('NON_NULL');
          expect(__type.inputFields.find(o => o.name === 'doors').type.kind).toEqual('NON_NULL');

          const {
            data: { __type: __type2 },
          } = await apolloClient.query({
            query: gql`
              query requiredFields {
                __type(name: "SuperCar") {
                  fields {
                    name
                    type {
                      kind
                    }
                  }
                }
              }
            `,
          });
          expect(__type2.fields.find(o => o.name === 'price').type.kind).toEqual('SCALAR');
          expect(__type2.fields.find(o => o.name === 'engine').type.kind).toEqual('NON_NULL');
          expect(__type2.fields.find(o => o.name === 'doors').type.kind).toEqual('NON_NULL');
        });

        it('should only allow the supplied output fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();

          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
            insuranceClaims: { type: 'Number' },
          });

          const superCar = await new Parse.Object('SuperCar').save({
            engine: 'petrol',
            doors: 3,
            price: '£7500',
            mileage: 0,
            insuranceCertificate: 'private-file.pdf',
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  outputFields: ['engine', 'doors', 'price', 'mileage'],
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                    objectId
                    engine
                    doors
                    price
                    mileage
                    insuranceCertificate
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          let getSuperCar = (
            await apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                    objectId
                    engine
                    doors
                    price
                    mileage
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).data.superCar;
          expect(getSuperCar).toBeTruthy();

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  outputFields: [],
                },
              },
            ],
          });

          await resetGraphQLCache();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    engine
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          getSuperCar = (
            await apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                    objectId
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).data.superCar;
          expect(getSuperCar.objectId).toBe(superCar.id);
        });

        it('should only allow the supplied constraint fields for a class', async () => {
          try {
            const schemaController = await parseServer.config.databaseController.loadSchema();

            await schemaController.addClassIfNotExists('SuperCar', {
              model: { type: 'String' },
              engine: { type: 'String' },
              doors: { type: 'Number' },
              price: { type: 'String' },
              mileage: { type: 'Number' },
              insuranceCertificate: { type: 'String' },
            });

            await new Parse.Object('SuperCar').save({
              model: 'McLaren',
              engine: 'petrol',
              doors: 3,
              price: '£7500',
              mileage: 0,
              insuranceCertificate: 'private-file.pdf',
            });

            await parseGraphQLServer.setGraphQLConfig({
              classConfigs: [
                {
                  className: 'SuperCar',
                  type: {
                    constraintFields: ['engine', 'doors', 'price'],
                  },
                },
              ],
            });

            await resetGraphQLCache();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(where: { insuranceCertificate: { equalTo: "private-file.pdf" } }) {
                      count
                    }
                  }
                `,
              })
            ).toBeRejected();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(where: { mileage: { equalTo: 0 } }) {
                      count
                    }
                  }
                `,
              })
            ).toBeRejected();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(where: { engine: { equalTo: "petrol" } }) {
                      count
                    }
                  }
                `,
              })
            ).toBeResolved();
          } catch (e) {
            handleError(e);
          }
        });

        it('should only allow the supplied sort fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();

          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
          });

          await new Parse.Object('SuperCar').save({
            engine: 'petrol',
            doors: 3,
            price: '£7500',
            mileage: 0,
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  sortFields: [
                    {
                      field: 'doors',
                      asc: true,
                      desc: true,
                    },
                    {
                      field: 'price',
                      asc: true,
                      desc: true,
                    },
                    {
                      field: 'mileage',
                      asc: true,
                      desc: false,
                    },
                  ],
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [engine_ASC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [engine_DESC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [mileage_DESC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeRejected();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [mileage_ASC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [doors_ASC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [price_DESC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [price_ASC, doors_DESC]) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
        });
      });

      describe('Relay Spec', () => {
        beforeEach(async () => {
          await resetGraphQLCache();
        });

        describe('Object Identification', () => {
          it('Class get custom method should return valid gobal id', async () => {
            const obj = new Parse.Object('SomeClass');
            obj.set('someField', 'some value');
            await obj.save();

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeClass($objectId: ID!) {
                  someClass(id: $objectId) {
                    id
                    objectId
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            });

            expect(getResult.data.someClass.objectId).toBe(obj.id);

            const nodeResult = await apolloClient.query({
              query: gql`
                query Node($id: ID!) {
                  node(id: $id) {
                    id
                    ... on SomeClass {
                      objectId
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: getResult.data.someClass.id,
              },
            });

            expect(nodeResult.data.node.id).toBe(getResult.data.someClass.id);
            expect(nodeResult.data.node.objectId).toBe(obj.id);
            expect(nodeResult.data.node.someField).toBe('some value');
          });

          it('Class find custom method should return valid gobal id', async () => {
            const obj1 = new Parse.Object('SomeClass');
            obj1.set('someField', 'some value 1');
            await obj1.save();

            const obj2 = new Parse.Object('SomeClass');
            obj2.set('someField', 'some value 2');
            await obj2.save();

            const findResult = await apolloClient.query({
              query: gql`
                query FindSomeClass {
                  someClasses(order: [createdAt_ASC]) {
                    edges {
                      node {
                        id
                        objectId
                      }
                    }
                  }
                }
              `,
            });

            expect(findResult.data.someClasses.edges[0].node.objectId).toBe(obj1.id);
            expect(findResult.data.someClasses.edges[1].node.objectId).toBe(obj2.id);

            const nodeResult = await apolloClient.query({
              query: gql`
                query Node($id1: ID!, $id2: ID!) {
                  node1: node(id: $id1) {
                    id
                    ... on SomeClass {
                      objectId
                      someField
                    }
                  }
                  node2: node(id: $id2) {
                    id
                    ... on SomeClass {
                      objectId
                      someField
                    }
                  }
                }
              `,
              variables: {
                id1: findResult.data.someClasses.edges[0].node.id,
                id2: findResult.data.someClasses.edges[1].node.id,
              },
            });

            expect(nodeResult.data.node1.id).toBe(findResult.data.someClasses.edges[0].node.id);
            expect(nodeResult.data.node1.objectId).toBe(obj1.id);
            expect(nodeResult.data.node1.someField).toBe('some value 1');
            expect(nodeResult.data.node2.id).toBe(findResult.data.someClasses.edges[1].node.id);
            expect(nodeResult.data.node2.objectId).toBe(obj2.id);
            expect(nodeResult.data.node2.someField).toBe('some value 2');
          });
          // TODO: (moumouls, davimacedo) Fix flaky test
          xit('Id inputs should work either with global id or object id', async () => {
            try {
              await apolloClient.mutate({
                mutation: gql`
                  mutation CreateClasses {
                    secondaryObject: createClass(
                      input: {
                        name: "SecondaryObject"
                        schemaFields: { addStrings: [{ name: "someField" }] }
                      }
                    ) {
                      clientMutationId
                    }
                    primaryObject: createClass(
                      input: {
                        name: "PrimaryObject"
                        schemaFields: {
                          addStrings: [{ name: "stringField" }]
                          addArrays: [{ name: "arrayField" }]
                          addPointers: [
                            { name: "pointerField", targetClassName: "SecondaryObject" }
                          ]
                          addRelations: [
                            { name: "relationField", targetClassName: "SecondaryObject" }
                          ]
                        }
                      }
                    ) {
                      clientMutationId
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              await resetGraphQLCache();

              const createSecondaryObjectsResult = await apolloClient.mutate({
                mutation: gql`
                  mutation CreateSecondaryObjects {
                    secondaryObject1: createSecondaryObject(
                      input: { fields: { someField: "some value 1" } }
                    ) {
                      secondaryObject {
                        id
                        objectId
                        someField
                      }
                    }
                    secondaryObject2: createSecondaryObject(
                      input: { fields: { someField: "some value 2" } }
                    ) {
                      secondaryObject {
                        id
                        someField
                      }
                    }
                    secondaryObject3: createSecondaryObject(
                      input: { fields: { someField: "some value 3" } }
                    ) {
                      secondaryObject {
                        objectId
                        someField
                      }
                    }
                    secondaryObject4: createSecondaryObject(
                      input: { fields: { someField: "some value 4" } }
                    ) {
                      secondaryObject {
                        id
                        objectId
                      }
                    }
                    secondaryObject5: createSecondaryObject(
                      input: { fields: { someField: "some value 5" } }
                    ) {
                      secondaryObject {
                        id
                      }
                    }
                    secondaryObject6: createSecondaryObject(
                      input: { fields: { someField: "some value 6" } }
                    ) {
                      secondaryObject {
                        objectId
                      }
                    }
                    secondaryObject7: createSecondaryObject(
                      input: { fields: { someField: "some value 7" } }
                    ) {
                      secondaryObject {
                        someField
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              const updateSecondaryObjectsResult = await apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSecondaryObjects(
                    $id1: ID!
                    $id2: ID!
                    $id3: ID!
                    $id4: ID!
                    $id5: ID!
                    $id6: ID!
                  ) {
                    secondaryObject1: updateSecondaryObject(
                      input: { id: $id1, fields: { someField: "some value 11" } }
                    ) {
                      secondaryObject {
                        id
                        objectId
                        someField
                      }
                    }
                    secondaryObject2: updateSecondaryObject(
                      input: { id: $id2, fields: { someField: "some value 22" } }
                    ) {
                      secondaryObject {
                        id
                        someField
                      }
                    }
                    secondaryObject3: updateSecondaryObject(
                      input: { id: $id3, fields: { someField: "some value 33" } }
                    ) {
                      secondaryObject {
                        objectId
                        someField
                      }
                    }
                    secondaryObject4: updateSecondaryObject(
                      input: { id: $id4, fields: { someField: "some value 44" } }
                    ) {
                      secondaryObject {
                        id
                        objectId
                      }
                    }
                    secondaryObject5: updateSecondaryObject(
                      input: { id: $id5, fields: { someField: "some value 55" } }
                    ) {
                      secondaryObject {
                        id
                      }
                    }
                    secondaryObject6: updateSecondaryObject(
                      input: { id: $id6, fields: { someField: "some value 66" } }
                    ) {
                      secondaryObject {
                        objectId
                      }
                    }
                  }
                `,
                variables: {
                  id1: createSecondaryObjectsResult.data.secondaryObject1.secondaryObject.id,
                  id2: createSecondaryObjectsResult.data.secondaryObject2.secondaryObject.id,
                  id3: createSecondaryObjectsResult.data.secondaryObject3.secondaryObject.objectId,
                  id4: createSecondaryObjectsResult.data.secondaryObject4.secondaryObject.objectId,
                  id5: createSecondaryObjectsResult.data.secondaryObject5.secondaryObject.id,
                  id6: createSecondaryObjectsResult.data.secondaryObject6.secondaryObject.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              const deleteSecondaryObjectsResult = await apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSecondaryObjects($id1: ID!, $id3: ID!, $id5: ID!, $id6: ID!) {
                    secondaryObject1: deleteSecondaryObject(input: { id: $id1 }) {
                      secondaryObject {
                        id
                        objectId
                        someField
                      }
                    }
                    secondaryObject3: deleteSecondaryObject(input: { id: $id3 }) {
                      secondaryObject {
                        objectId
                        someField
                      }
                    }
                    secondaryObject5: deleteSecondaryObject(input: { id: $id5 }) {
                      secondaryObject {
                        id
                      }
                    }
                    secondaryObject6: deleteSecondaryObject(input: { id: $id6 }) {
                      secondaryObject {
                        objectId
                      }
                    }
                  }
                `,
                variables: {
                  id1: updateSecondaryObjectsResult.data.secondaryObject1.secondaryObject.id,
                  id3: updateSecondaryObjectsResult.data.secondaryObject3.secondaryObject.objectId,
                  id5: updateSecondaryObjectsResult.data.secondaryObject5.secondaryObject.id,
                  id6: updateSecondaryObjectsResult.data.secondaryObject6.secondaryObject.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              const getSecondaryObjectsResult = await apolloClient.query({
                query: gql`
                  query GetSecondaryObjects($id2: ID!, $id4: ID!) {
                    secondaryObject2: secondaryObject(id: $id2) {
                      id
                      objectId
                      someField
                    }
                    secondaryObject4: secondaryObject(id: $id4) {
                      objectId
                      someField
                    }
                  }
                `,
                variables: {
                  id2: updateSecondaryObjectsResult.data.secondaryObject2.secondaryObject.id,
                  id4: updateSecondaryObjectsResult.data.secondaryObject4.secondaryObject.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              const findSecondaryObjectsResult = await apolloClient.query({
                query: gql`
                  query FindSecondaryObjects(
                    $id1: ID!
                    $id2: ID!
                    $id3: ID!
                    $id4: ID!
                    $id5: ID!
                    $id6: ID!
                  ) {
                    secondaryObjects(
                      where: {
                        AND: [
                          {
                            OR: [
                              { id: { equalTo: $id2 } }
                              { AND: [{ id: { equalTo: $id4 } }, { objectId: { equalTo: $id4 } }] }
                            ]
                          }
                          { id: { notEqualTo: $id1 } }
                          { id: { notEqualTo: $id3 } }
                          { objectId: { notEqualTo: $id2 } }
                          { objectId: { notIn: [$id5, $id6] } }
                          { id: { in: [$id2, $id4] } }
                        ]
                      }
                      order: [id_ASC, objectId_ASC]
                    ) {
                      edges {
                        node {
                          id
                          objectId
                          someField
                        }
                      }
                      count
                    }
                  }
                `,
                variables: {
                  id1: deleteSecondaryObjectsResult.data.secondaryObject1.secondaryObject.objectId,
                  id2: getSecondaryObjectsResult.data.secondaryObject2.id,
                  id3: deleteSecondaryObjectsResult.data.secondaryObject3.secondaryObject.objectId,
                  id4: getSecondaryObjectsResult.data.secondaryObject4.objectId,
                  id5: deleteSecondaryObjectsResult.data.secondaryObject5.secondaryObject.id,
                  id6: deleteSecondaryObjectsResult.data.secondaryObject6.secondaryObject.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              expect(findSecondaryObjectsResult.data.secondaryObjects.count).toEqual(2);
              expect(
                findSecondaryObjectsResult.data.secondaryObjects.edges
                  .map(value => value.node.someField)
                  .sort()
              ).toEqual(['some value 22', 'some value 44']);
              expect(
                findSecondaryObjectsResult.data.secondaryObjects.edges[0].node.id
              ).toBeLessThan(findSecondaryObjectsResult.data.secondaryObjects.edges[1].node.id);
              expect(
                findSecondaryObjectsResult.data.secondaryObjects.edges[0].node.objectId
              ).toBeLessThan(
                findSecondaryObjectsResult.data.secondaryObjects.edges[1].node.objectId
              );

              const createPrimaryObjectResult = await apolloClient.mutate({
                mutation: gql`
                  mutation CreatePrimaryObject(
                    $pointer: Any
                    $secondaryObject2: ID!
                    $secondaryObject4: ID!
                  ) {
                    createPrimaryObject(
                      input: {
                        fields: {
                          stringField: "some value"
                          arrayField: [1, "abc", $pointer]
                          pointerField: { link: $secondaryObject2 }
                          relationField: { add: [$secondaryObject2, $secondaryObject4] }
                        }
                      }
                    ) {
                      primaryObject {
                        id
                        stringField
                        arrayField {
                          ... on Element {
                            value
                          }
                          ... on SecondaryObject {
                            someField
                          }
                        }
                        pointerField {
                          id
                          objectId
                          someField
                        }
                        relationField {
                          edges {
                            node {
                              id
                              objectId
                              someField
                            }
                          }
                        }
                      }
                    }
                  }
                `,
                variables: {
                  pointer: {
                    __type: 'Pointer',
                    className: 'SecondaryObject',
                    objectId: getSecondaryObjectsResult.data.secondaryObject4.objectId,
                  },
                  secondaryObject2: getSecondaryObjectsResult.data.secondaryObject2.id,
                  secondaryObject4: getSecondaryObjectsResult.data.secondaryObject4.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              const updatePrimaryObjectResult = await apolloClient.mutate({
                mutation: gql`
                  mutation UpdatePrimaryObject(
                    $id: ID!
                    $secondaryObject2: ID!
                    $secondaryObject4: ID!
                  ) {
                    updatePrimaryObject(
                      input: {
                        id: $id
                        fields: {
                          pointerField: { link: $secondaryObject4 }
                          relationField: { remove: [$secondaryObject2, $secondaryObject4] }
                        }
                      }
                    ) {
                      primaryObject {
                        id
                        stringField
                        arrayField {
                          ... on Element {
                            value
                          }
                          ... on SecondaryObject {
                            someField
                          }
                        }
                        pointerField {
                          id
                          objectId
                          someField
                        }
                        relationField {
                          edges {
                            node {
                              id
                              objectId
                              someField
                            }
                          }
                        }
                      }
                    }
                  }
                `,
                variables: {
                  id: createPrimaryObjectResult.data.createPrimaryObject.primaryObject.id,
                  secondaryObject2: getSecondaryObjectsResult.data.secondaryObject2.id,
                  secondaryObject4: getSecondaryObjectsResult.data.secondaryObject4.objectId,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              expect(
                createPrimaryObjectResult.data.createPrimaryObject.primaryObject.stringField
              ).toEqual('some value');
              expect(
                createPrimaryObjectResult.data.createPrimaryObject.primaryObject.arrayField
              ).toEqual([
                { __typename: 'Element', value: 1 },
                { __typename: 'Element', value: 'abc' },
                { __typename: 'SecondaryObject', someField: 'some value 44' },
              ]);
              expect(
                createPrimaryObjectResult.data.createPrimaryObject.primaryObject.pointerField
                  .someField
              ).toEqual('some value 22');
              expect(
                createPrimaryObjectResult.data.createPrimaryObject.primaryObject.relationField.edges
                  .map(value => value.node.someField)
                  .sort()
              ).toEqual(['some value 22', 'some value 44']);
              expect(
                updatePrimaryObjectResult.data.updatePrimaryObject.primaryObject.stringField
              ).toEqual('some value');
              expect(
                updatePrimaryObjectResult.data.updatePrimaryObject.primaryObject.arrayField
              ).toEqual([
                { __typename: 'Element', value: 1 },
                { __typename: 'Element', value: 'abc' },
                { __typename: 'SecondaryObject', someField: 'some value 44' },
              ]);
              expect(
                updatePrimaryObjectResult.data.updatePrimaryObject.primaryObject.pointerField
                  .someField
              ).toEqual('some value 44');
              expect(
                updatePrimaryObjectResult.data.updatePrimaryObject.primaryObject.relationField.edges
              ).toEqual([]);
            } catch (e) {
              handleError(e);
            }
          });
        });
      });

      describe('Class Schema Mutations', () => {
        it('should create a new class', async () => {
          try {
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  class1: createClass(input: { name: "Class1", clientMutationId: "cmid1" }) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  class2: createClass(
                    input: { name: "Class2", schemaFields: null, clientMutationId: "cmid2" }
                  ) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  class3: createClass(
                    input: { name: "Class3", schemaFields: {}, clientMutationId: "cmid3" }
                  ) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  class4: createClass(
                    input: {
                      name: "Class4"
                      schemaFields: {
                        addStrings: null
                        addNumbers: null
                        addBooleans: null
                        addArrays: null
                        addObjects: null
                        addDates: null
                        addFiles: null
                        addGeoPoint: null
                        addPolygons: null
                        addBytes: null
                        addPointers: null
                        addRelations: null
                      }
                      clientMutationId: "cmid4"
                    }
                  ) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  class5: createClass(
                    input: {
                      name: "Class5"
                      schemaFields: {
                        addStrings: []
                        addNumbers: []
                        addBooleans: []
                        addArrays: []
                        addObjects: []
                        addDates: []
                        addFiles: []
                        addPolygons: []
                        addBytes: []
                        addPointers: []
                        addRelations: []
                      }
                      clientMutationId: "cmid5"
                    }
                  ) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  class6: createClass(
                    input: {
                      name: "Class6"
                      schemaFields: {
                        addStrings: [
                          { name: "stringField1" }
                          { name: "stringField2" }
                          { name: "stringField3" }
                        ]
                        addNumbers: [
                          { name: "numberField1" }
                          { name: "numberField2" }
                          { name: "numberField3" }
                        ]
                        addBooleans: [
                          { name: "booleanField1" }
                          { name: "booleanField2" }
                          { name: "booleanField3" }
                        ]
                        addArrays: [
                          { name: "arrayField1" }
                          { name: "arrayField2" }
                          { name: "arrayField3" }
                        ]
                        addObjects: [
                          { name: "objectField1" }
                          { name: "objectField2" }
                          { name: "objectField3" }
                        ]
                        addDates: [
                          { name: "dateField1" }
                          { name: "dateField2" }
                          { name: "dateField3" }
                        ]
                        addFiles: [
                          { name: "fileField1" }
                          { name: "fileField2" }
                          { name: "fileField3" }
                        ]
                        addGeoPoint: { name: "geoPointField" }
                        addPolygons: [
                          { name: "polygonField1" }
                          { name: "polygonField2" }
                          { name: "polygonField3" }
                        ]
                        addBytes: [
                          { name: "bytesField1" }
                          { name: "bytesField2" }
                          { name: "bytesField3" }
                        ]
                        addPointers: [
                          { name: "pointerField1", targetClassName: "Class1" }
                          { name: "pointerField2", targetClassName: "Class6" }
                          { name: "pointerField3", targetClassName: "Class2" }
                        ]
                        addRelations: [
                          { name: "relationField1", targetClassName: "Class1" }
                          { name: "relationField2", targetClassName: "Class6" }
                          { name: "relationField3", targetClassName: "Class2" }
                        ]
                        remove: [
                          { name: "stringField3" }
                          { name: "numberField3" }
                          { name: "booleanField3" }
                          { name: "arrayField3" }
                          { name: "objectField3" }
                          { name: "dateField3" }
                          { name: "fileField3" }
                          { name: "polygonField3" }
                          { name: "bytesField3" }
                          { name: "pointerField3" }
                          { name: "relationField3" }
                          { name: "doesNotExist" }
                        ]
                      }
                      clientMutationId: "cmid6"
                    }
                  ) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                        ... on SchemaPointerField {
                          targetClassName
                        }
                        ... on SchemaRelationField {
                          targetClassName
                        }
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            const classes = Object.keys(result.data).map(fieldName => ({
              clientMutationId: result.data[fieldName].clientMutationId,
              class: {
                name: result.data[fieldName].class.name,
                schemaFields: result.data[fieldName].class.schemaFields.sort((a, b) =>
                  a.name > b.name ? 1 : -1
                ),
                __typename: result.data[fieldName].class.__typename,
              },
              __typename: result.data[fieldName].__typename,
            }));
            expect(classes).toEqual([
              {
                clientMutationId: 'cmid1',
                class: {
                  name: 'Class1',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
              {
                clientMutationId: 'cmid2',
                class: {
                  name: 'Class2',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
              {
                clientMutationId: 'cmid3',
                class: {
                  name: 'Class3',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
              {
                clientMutationId: 'cmid4',
                class: {
                  name: 'Class4',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
              {
                clientMutationId: 'cmid5',
                class: {
                  name: 'Class5',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
              {
                clientMutationId: 'cmid6',
                class: {
                  name: 'Class6',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'arrayField1', __typename: 'SchemaArrayField' },
                    { name: 'arrayField2', __typename: 'SchemaArrayField' },
                    { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                    { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                    { name: 'bytesField1', __typename: 'SchemaBytesField' },
                    { name: 'bytesField2', __typename: 'SchemaBytesField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'dateField1', __typename: 'SchemaDateField' },
                    { name: 'dateField2', __typename: 'SchemaDateField' },
                    { name: 'fileField1', __typename: 'SchemaFileField' },
                    { name: 'fileField2', __typename: 'SchemaFileField' },
                    {
                      name: 'geoPointField',
                      __typename: 'SchemaGeoPointField',
                    },
                    { name: 'numberField1', __typename: 'SchemaNumberField' },
                    { name: 'numberField2', __typename: 'SchemaNumberField' },
                    { name: 'objectField1', __typename: 'SchemaObjectField' },
                    { name: 'objectField2', __typename: 'SchemaObjectField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    {
                      name: 'pointerField1',
                      __typename: 'SchemaPointerField',
                      targetClassName: 'Class1',
                    },
                    {
                      name: 'pointerField2',
                      __typename: 'SchemaPointerField',
                      targetClassName: 'Class6',
                    },
                    { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                    { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                    {
                      name: 'relationField1',
                      __typename: 'SchemaRelationField',
                      targetClassName: 'Class1',
                    },
                    {
                      name: 'relationField2',
                      __typename: 'SchemaRelationField',
                      targetClassName: 'Class6',
                    },
                    { name: 'stringField1', __typename: 'SchemaStringField' },
                    { name: 'stringField2', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
                __typename: 'CreateClassPayload',
              },
            ]);

            const findResult = await apolloClient.query({
              query: gql`
                query {
                  classes {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            findResult.data.classes = findResult.data.classes
              .filter(schemaClass => !schemaClass.name.startsWith('_'))
              .sort((a, b) => (a.name > b.name ? 1 : -1));
            findResult.data.classes.forEach(schemaClass => {
              schemaClass.schemaFields = schemaClass.schemaFields.sort((a, b) =>
                a.name > b.name ? 1 : -1
              );
            });
            expect(findResult.data.classes).toEqual([
              {
                name: 'Class1',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class2',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class3',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class4',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class5',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class6',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'arrayField1', __typename: 'SchemaArrayField' },
                  { name: 'arrayField2', __typename: 'SchemaArrayField' },
                  { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                  { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                  { name: 'bytesField1', __typename: 'SchemaBytesField' },
                  { name: 'bytesField2', __typename: 'SchemaBytesField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'dateField1', __typename: 'SchemaDateField' },
                  { name: 'dateField2', __typename: 'SchemaDateField' },
                  { name: 'fileField1', __typename: 'SchemaFileField' },
                  { name: 'fileField2', __typename: 'SchemaFileField' },
                  {
                    name: 'geoPointField',
                    __typename: 'SchemaGeoPointField',
                  },
                  { name: 'numberField1', __typename: 'SchemaNumberField' },
                  { name: 'numberField2', __typename: 'SchemaNumberField' },
                  { name: 'objectField1', __typename: 'SchemaObjectField' },
                  { name: 'objectField2', __typename: 'SchemaObjectField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  {
                    name: 'pointerField1',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'pointerField2',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class6',
                  },
                  { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                  { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                  {
                    name: 'relationField1',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'relationField2',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class6',
                  },
                  { name: 'stringField1', __typename: 'SchemaStringField' },
                  { name: 'stringField2', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
            ]);
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to create a new class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(input: { name: "SomeClass" }) {
                    clientMutationId
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
            expect(e.graphQLErrors[0].message).toEqual('unauthorized: master key is required');
          }
        });

        it('should not allow duplicated field names when creating', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    input: {
                      name: "SomeClass"
                      schemaFields: {
                        addStrings: [{ name: "someField" }]
                        addNumbers: [{ name: "someField" }]
                      }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.INVALID_KEY_NAME);
            expect(e.graphQLErrors[0].message).toEqual('Duplicated field name: someField');
          }
        });

        it('should update an existing class', async () => {
          try {
            const clientMutationId = uuidv4();
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    input: {
                      name: "MyNewClass"
                      schemaFields: { addStrings: [{ name: "willBeRemoved" }] }
                    }
                  ) {
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  updateClass(input: {
                    clientMutationId: "${clientMutationId}"
                    name: "MyNewClass"
                    schemaFields: {
                      addStrings: [
                        { name: "stringField1" }
                        { name: "stringField2" }
                        { name: "stringField3" }
                      ]
                      addNumbers: [
                        { name: "numberField1" }
                        { name: "numberField2" }
                        { name: "numberField3" }
                      ]
                      addBooleans: [
                        { name: "booleanField1" }
                        { name: "booleanField2" }
                        { name: "booleanField3" }
                      ]
                      addArrays: [
                        { name: "arrayField1" }
                        { name: "arrayField2" }
                        { name: "arrayField3" }
                      ]
                      addObjects: [
                        { name: "objectField1" }
                        { name: "objectField2" }
                        { name: "objectField3" }
                      ]
                      addDates: [
                        { name: "dateField1" }
                        { name: "dateField2" }
                        { name: "dateField3" }
                      ]
                      addFiles: [
                        { name: "fileField1" }
                        { name: "fileField2" }
                        { name: "fileField3" }
                      ]
                      addGeoPoint: { name: "geoPointField" }
                      addPolygons: [
                        { name: "polygonField1" }
                        { name: "polygonField2" }
                        { name: "polygonField3" }
                      ]
                      addBytes: [
                        { name: "bytesField1" }
                        { name: "bytesField2" }
                        { name: "bytesField3" }
                      ]
                      addPointers: [
                        { name: "pointerField1", targetClassName: "Class1" }
                        { name: "pointerField2", targetClassName: "Class6" }
                        { name: "pointerField3", targetClassName: "Class2" }
                      ]
                      addRelations: [
                        { name: "relationField1", targetClassName: "Class1" }
                        { name: "relationField2", targetClassName: "Class6" }
                        { name: "relationField3", targetClassName: "Class2" }
                      ]
                      remove: [
                        { name: "willBeRemoved" }
                        { name: "stringField3" }
                        { name: "numberField3" }
                        { name: "booleanField3" }
                        { name: "arrayField3" }
                        { name: "objectField3" }
                        { name: "dateField3" }
                        { name: "fileField3" }
                        { name: "polygonField3" }
                        { name: "bytesField3" }
                        { name: "pointerField3" }
                        { name: "relationField3" }
                        { name: "doesNotExist" }
                      ]
                    }
                  }) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                        ... on SchemaPointerField {
                          targetClassName
                        }
                        ... on SchemaRelationField {
                          targetClassName
                        }
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            result.data.createClass.class.schemaFields = result.data.createClass.class.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            result.data.updateClass.class.schemaFields = result.data.updateClass.class.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            expect(result).toEqual({
              data: {
                createClass: {
                  class: {
                    name: 'MyNewClass',
                    schemaFields: [
                      { name: 'ACL', __typename: 'SchemaACLField' },
                      { name: 'createdAt', __typename: 'SchemaDateField' },
                      { name: 'objectId', __typename: 'SchemaStringField' },
                      { name: 'updatedAt', __typename: 'SchemaDateField' },
                      {
                        name: 'willBeRemoved',
                        __typename: 'SchemaStringField',
                      },
                    ],
                    __typename: 'Class',
                  },
                  __typename: 'CreateClassPayload',
                },
                updateClass: {
                  clientMutationId,
                  class: {
                    name: 'MyNewClass',
                    schemaFields: [
                      { name: 'ACL', __typename: 'SchemaACLField' },
                      { name: 'arrayField1', __typename: 'SchemaArrayField' },
                      { name: 'arrayField2', __typename: 'SchemaArrayField' },
                      {
                        name: 'booleanField1',
                        __typename: 'SchemaBooleanField',
                      },
                      {
                        name: 'booleanField2',
                        __typename: 'SchemaBooleanField',
                      },
                      { name: 'bytesField1', __typename: 'SchemaBytesField' },
                      { name: 'bytesField2', __typename: 'SchemaBytesField' },
                      { name: 'createdAt', __typename: 'SchemaDateField' },
                      { name: 'dateField1', __typename: 'SchemaDateField' },
                      { name: 'dateField2', __typename: 'SchemaDateField' },
                      { name: 'fileField1', __typename: 'SchemaFileField' },
                      { name: 'fileField2', __typename: 'SchemaFileField' },
                      {
                        name: 'geoPointField',
                        __typename: 'SchemaGeoPointField',
                      },
                      { name: 'numberField1', __typename: 'SchemaNumberField' },
                      { name: 'numberField2', __typename: 'SchemaNumberField' },
                      { name: 'objectField1', __typename: 'SchemaObjectField' },
                      { name: 'objectField2', __typename: 'SchemaObjectField' },
                      { name: 'objectId', __typename: 'SchemaStringField' },
                      {
                        name: 'pointerField1',
                        __typename: 'SchemaPointerField',
                        targetClassName: 'Class1',
                      },
                      {
                        name: 'pointerField2',
                        __typename: 'SchemaPointerField',
                        targetClassName: 'Class6',
                      },
                      {
                        name: 'polygonField1',
                        __typename: 'SchemaPolygonField',
                      },
                      {
                        name: 'polygonField2',
                        __typename: 'SchemaPolygonField',
                      },
                      {
                        name: 'relationField1',
                        __typename: 'SchemaRelationField',
                        targetClassName: 'Class1',
                      },
                      {
                        name: 'relationField2',
                        __typename: 'SchemaRelationField',
                        targetClassName: 'Class6',
                      },
                      { name: 'stringField1', __typename: 'SchemaStringField' },
                      { name: 'stringField2', __typename: 'SchemaStringField' },
                      { name: 'updatedAt', __typename: 'SchemaDateField' },
                    ],
                    __typename: 'Class',
                  },
                  __typename: 'UpdateClassPayload',
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query {
                  class(name: "MyNewClass") {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            getResult.data.class.schemaFields = getResult.data.class.schemaFields.sort((a, b) =>
              a.name > b.name ? 1 : -1
            );
            expect(getResult.data).toEqual({
              class: {
                name: 'MyNewClass',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'arrayField1', __typename: 'SchemaArrayField' },
                  { name: 'arrayField2', __typename: 'SchemaArrayField' },
                  { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                  { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                  { name: 'bytesField1', __typename: 'SchemaBytesField' },
                  { name: 'bytesField2', __typename: 'SchemaBytesField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'dateField1', __typename: 'SchemaDateField' },
                  { name: 'dateField2', __typename: 'SchemaDateField' },
                  { name: 'fileField1', __typename: 'SchemaFileField' },
                  { name: 'fileField2', __typename: 'SchemaFileField' },
                  {
                    name: 'geoPointField',
                    __typename: 'SchemaGeoPointField',
                  },
                  { name: 'numberField1', __typename: 'SchemaNumberField' },
                  { name: 'numberField2', __typename: 'SchemaNumberField' },
                  { name: 'objectField1', __typename: 'SchemaObjectField' },
                  { name: 'objectField2', __typename: 'SchemaObjectField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  {
                    name: 'pointerField1',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'pointerField2',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class6',
                  },
                  { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                  { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                  {
                    name: 'relationField1',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'relationField2',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class6',
                  },
                  { name: 'stringField1', __typename: 'SchemaStringField' },
                  { name: 'stringField2', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
            });
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to update an existing class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(input: { name: "SomeClass" }) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(input: { name: "SomeClass" }) {
                    clientMutationId
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
            expect(e.graphQLErrors[0].message).toEqual('unauthorized: master key is required');
          }
        });

        it('should not allow duplicated field names when updating', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    input: {
                      name: "SomeClass"
                      schemaFields: { addStrings: [{ name: "someField" }] }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(
                    input: {
                      name: "SomeClass"
                      schemaFields: { addNumbers: [{ name: "someField" }] }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.INVALID_KEY_NAME);
            expect(e.graphQLErrors[0].message).toEqual('Duplicated field name: someField');
          }
        });

        it('should fail if updating an inexistent class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(
                    input: {
                      name: "SomeInexistentClass"
                      schemaFields: { addNumbers: [{ name: "someField" }] }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
            expect(e.graphQLErrors[0].message).toEqual('Class SomeInexistentClass does not exist.');
          }
        });

        it('should delete an existing class', async () => {
          try {
            const clientMutationId = uuidv4();
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    input: {
                      name: "MyNewClass"
                      schemaFields: { addStrings: [{ name: "willBeRemoved" }] }
                    }
                  ) {
                    class {
                      name
                      schemaFields {
                        name
                        __typename
                      }
                    }
                  }
                  deleteClass(input: { clientMutationId: "${clientMutationId}" name: "MyNewClass" }) {
                    clientMutationId
                    class {
                      name
                      schemaFields {
                        name
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            result.data.createClass.class.schemaFields = result.data.createClass.class.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            result.data.deleteClass.class.schemaFields = result.data.deleteClass.class.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            expect(result).toEqual({
              data: {
                createClass: {
                  class: {
                    name: 'MyNewClass',
                    schemaFields: [
                      { name: 'ACL', __typename: 'SchemaACLField' },
                      { name: 'createdAt', __typename: 'SchemaDateField' },
                      { name: 'objectId', __typename: 'SchemaStringField' },
                      { name: 'updatedAt', __typename: 'SchemaDateField' },
                      {
                        name: 'willBeRemoved',
                        __typename: 'SchemaStringField',
                      },
                    ],
                    __typename: 'Class',
                  },
                  __typename: 'CreateClassPayload',
                },
                deleteClass: {
                  clientMutationId,
                  class: {
                    name: 'MyNewClass',
                    schemaFields: [
                      { name: 'ACL', __typename: 'SchemaACLField' },
                      { name: 'createdAt', __typename: 'SchemaDateField' },
                      { name: 'objectId', __typename: 'SchemaStringField' },
                      { name: 'updatedAt', __typename: 'SchemaDateField' },
                      {
                        name: 'willBeRemoved',
                        __typename: 'SchemaStringField',
                      },
                    ],
                    __typename: 'Class',
                  },
                  __typename: 'DeleteClassPayload',
                },
              },
            });

            try {
              await apolloClient.query({
                query: gql`
                  query {
                    class(name: "MyNewClass") {
                      name
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });
              fail('should fail');
            } catch (e) {
              expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
              expect(e.graphQLErrors[0].message).toEqual('Class MyNewClass does not exist.');
            }
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to delete an existing class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(input: { name: "SomeClass" }) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  deleteClass(input: { name: "SomeClass" }) {
                    clientMutationId
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
            expect(e.graphQLErrors[0].message).toEqual('unauthorized: master key is required');
          }
        });

        it('should fail if deleting an inexistent class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  deleteClass(input: { name: "SomeInexistentClass" }) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.INVALID_CLASS_NAME);
            expect(e.graphQLErrors[0].message).toEqual('Class SomeInexistentClass does not exist.');
          }
        });

        it('should require master key to get an existing class', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query {
                  class(name: "_User") {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
            expect(e.graphQLErrors[0].message).toEqual('unauthorized: master key is required');
          }
        });

        it('should require master key to find the existing classes', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query {
                  classes {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
            expect(e.graphQLErrors[0].message).toEqual('unauthorized: master key is required');
          }
        });
      });

      describe('Objects Queries', () => {
        describe('Get', () => {
          it('should return a class object using class specific query', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField', 'someValue');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = (
              await apolloClient.query({
                query: gql`
                  query GetCustomer($id: ID!) {
                    customer(id: $id) {
                      id
                      objectId
                      someField
                      createdAt
                      updatedAt
                    }
                  }
                `,
                variables: {
                  id: obj.id,
                },
              })
            ).data.customer;

            expect(result.objectId).toEqual(obj.id);
            expect(result.someField).toEqual('someValue');
            expect(new Date(result.createdAt)).toEqual(obj.createdAt);
            expect(new Date(result.updatedAt)).toEqual(obj.updatedAt);
          });

          it_only_db('mongo')('should return child objects in array fields', async () => {
            const obj1 = new Parse.Object('Customer');
            const obj2 = new Parse.Object('SomeClass');
            const obj3 = new Parse.Object('Customer');

            obj1.set('someCustomerField', 'imCustomerOne');
            const arrayField = [42.42, 42, 'string', true];
            obj1.set('arrayField', arrayField);
            await obj1.save();

            obj2.set('someClassField', 'imSomeClassTwo');
            await obj2.save();

            obj3.set('manyRelations', [obj1, obj2]);
            await obj3.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = (
              await apolloClient.query({
                query: gql`
                  query GetCustomer($id: ID!) {
                    customer(id: $id) {
                      objectId
                      manyRelations {
                        ... on Customer {
                          objectId
                          someCustomerField
                          arrayField {
                            ... on Element {
                              value
                            }
                          }
                        }
                        ... on SomeClass {
                          objectId
                          someClassField
                        }
                      }
                      createdAt
                      updatedAt
                    }
                  }
                `,
                variables: {
                  id: obj3.id,
                },
              })
            ).data.customer;

            expect(result.objectId).toEqual(obj3.id);
            expect(result.manyRelations.length).toEqual(2);

            const customerSubObject = result.manyRelations.find(o => o.objectId === obj1.id);
            const someClassSubObject = result.manyRelations.find(o => o.objectId === obj2.id);

            expect(customerSubObject).toBeDefined();
            expect(someClassSubObject).toBeDefined();
            expect(customerSubObject.someCustomerField).toEqual('imCustomerOne');
            const formatedArrayField = customerSubObject.arrayField.map(elem => elem.value);
            expect(formatedArrayField).toEqual(arrayField);
            expect(someClassSubObject.someClassField).toEqual('imSomeClassTwo');
          });

          it_only_db('mongo')(
            'should return many child objects in allow cyclic query',
            async () => {
              const obj1 = new Parse.Object('Employee');
              const obj2 = new Parse.Object('Team');
              const obj3 = new Parse.Object('Company');
              const obj4 = new Parse.Object('Country');

              obj1.set('name', 'imAnEmployee');
              await obj1.save();

              obj2.set('name', 'imATeam');
              obj2.set('employees', [obj1]);
              await obj2.save();

              obj3.set('name', 'imACompany');
              obj3.set('teams', [obj2]);
              obj3.set('employees', [obj1]);
              await obj3.save();

              obj4.set('name', 'imACountry');
              obj4.set('companies', [obj3]);
              await obj4.save();

              obj1.set('country', obj4);
              await obj1.save();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const result = (
                await apolloClient.query({
                  query: gql`
                    query DeepComplexGraphQLQuery($id: ID!) {
                      country(id: $id) {
                        objectId
                        name
                        companies {
                          ... on Company {
                            objectId
                            name
                            employees {
                              ... on Employee {
                                objectId
                                name
                              }
                            }
                            teams {
                              ... on Team {
                                objectId
                                name
                                employees {
                                  ... on Employee {
                                    objectId
                                    name
                                    country {
                                      objectId
                                      name
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  `,
                  variables: {
                    id: obj4.id,
                  },
                })
              ).data.country;

              const expectedResult = {
                objectId: obj4.id,
                name: 'imACountry',
                __typename: 'Country',
                companies: [
                  {
                    objectId: obj3.id,
                    name: 'imACompany',
                    __typename: 'Company',
                    employees: [
                      {
                        objectId: obj1.id,
                        name: 'imAnEmployee',
                        __typename: 'Employee',
                      },
                    ],
                    teams: [
                      {
                        objectId: obj2.id,
                        name: 'imATeam',
                        __typename: 'Team',
                        employees: [
                          {
                            objectId: obj1.id,
                            name: 'imAnEmployee',
                            __typename: 'Employee',
                            country: {
                              objectId: obj4.id,
                              name: 'imACountry',
                              __typename: 'Country',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              };
              expect(result).toEqual(expectedResult);
            }
          );

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            async function getObject(className, id, headers) {
              const alias = className.charAt(0).toLowerCase() + className.slice(1);
              const specificQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    get: ${alias}(id: $id) {
                      id
                      createdAt
                      someField
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });

              return specificQueryResult;
            }

            await Promise.all(
              objects
                .slice(0, 3)
                .map(obj =>
                  expectAsync(getObject(obj.className, obj.id)).toBeRejectedWith(
                    jasmine.stringMatching('Object not found')
                  )
                )
            );
            expect((await getObject(object4.className, object4.id)).data.get.someField).toEqual(
              'someValue4'
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (
                    await getObject(obj.className, obj.id, {
                      'X-Parse-Master-Key': 'test',
                    })
                  ).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (
                    await getObject(obj.className, obj.id, {
                      'X-Parse-Session-Token': user1.getSessionToken(),
                    })
                  ).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (
                    await getObject(obj.className, obj.id, {
                      'X-Parse-Session-Token': user2.getSessionToken(),
                    })
                  ).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await expectAsync(
              getObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user3.getSessionToken(),
              })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await Promise.all(
              [object1, object3, object4].map(async obj =>
                expect(
                  (
                    await getObject(obj.className, obj.id, {
                      'X-Parse-Session-Token': user3.getSessionToken(),
                    })
                  ).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.slice(0, 3).map(obj =>
                expectAsync(
                  getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'))
              )
            );
            expect(
              (
                await getObject(object4.className, object4.id, {
                  'X-Parse-Session-Token': user4.getSessionToken(),
                })
              ).data.get.someField
            ).toEqual('someValue4');
            await Promise.all(
              objects.slice(0, 2).map(obj =>
                expectAsync(
                  getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user5.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'))
              )
            );
            expect(
              (
                await getObject(object3.className, object3.id, {
                  'X-Parse-Session-Token': user5.getSessionToken(),
                })
              ).data.get.someField
            ).toEqual('someValue3');
            expect(
              (
                await getObject(object4.className, object4.id, {
                  'X-Parse-Session-Token': user5.getSessionToken(),
                })
              ).data.get.someField
            ).toEqual('someValue4');
          });

          it('should support keys argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    someField
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    someField
                    pointerToUser {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.get.someField).toBeDefined();
            expect(result1.data.get.pointerToUser).toBeUndefined();
            expect(result2.data.get.someField).toBeDefined();
            expect(result2.data.get.pointerToUser).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    pointerToUser {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  graphQLClass(id: $id) {
                    pointerToUser {
                      username
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.get.pointerToUser.username).toBeUndefined();
            expect(result2.data.graphQLClass.pointerToUser.username).toBeDefined();
          });

          it('should respect protectedFields', async done => {
            await prepareData();
            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const className = 'GraphQLClass';

            await updateCLP(
              {
                get: { '*': true },
                find: { '*': true },

                protectedFields: {
                  '*': ['someField', 'someOtherField'],
                  authenticated: ['someField'],
                  'userField:pointerToUser': [],
                  [user2.id]: [],
                },
              },
              className
            );

            const getObject = async (className, id, user) => {
              const headers = user
                ? { ['X-Parse-Session-Token']: user.getSessionToken() }
                : undefined;

              const specificQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    get: graphQLClass(id: $id) {
                      pointerToUser {
                        username
                        id
                      }
                      someField
                      someOtherField
                    }
                  }
                `,
                variables: {
                  id: id,
                },
                context: {
                  headers: headers,
                },
              });

              return specificQueryResult.data.get;
            };

            const id = object3.id;

            /* not authenticated */
            const objectPublic = await getObject(className, id, undefined);

            expect(objectPublic.someField).toBeNull();
            expect(objectPublic.someOtherField).toBeNull();

            /* authenticated */
            const objectAuth = await getObject(className, id, user1);

            expect(objectAuth.someField).toBeNull();
            expect(objectAuth.someOtherField).toBe('B');

            /* pointer field */
            const objectPointed = await getObject(className, id, user5);

            expect(objectPointed.someField).toBe('someValue3');
            expect(objectPointed.someOtherField).toBe('B');

            /* for user id */
            const objectForUser = await getObject(className, id, user2);

            expect(objectForUser.someField).toBe('someValue3');
            expect(objectForUser.someOtherField).toBe('B');

            done();
          });
          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              try {
                await prepareData();

                await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

                const databaseAdapter = parseServer.config.databaseController.adapter;
                spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

                await apolloClient.query({
                  query: gql`
                    query GetSomeObject($id: ID!) {
                      graphQLClass(id: $id) {
                        pointerToUser {
                          username
                        }
                      }
                    }
                  `,
                  variables: {
                    id: object3.id,
                  },
                  context: {
                    headers: {
                      'X-Parse-Session-Token': user1.getSessionToken(),
                    },
                  },
                });

                let foundGraphQLClassReadPreference = false;
                let foundUserClassReadPreference = false;
                databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.PRIMARY);
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.PRIMARY);
                  }
                });

                expect(foundGraphQLClassReadPreference).toBe(true);
                expect(foundUserClassReadPreference).toBe(true);
              } catch (e) {
                handleError(e);
              }
            });

            it('should support readPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const databaseAdapter = parseServer.config.databaseController.adapter;
              spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    graphQLClass(id: $id, options: { readPreference: SECONDARY }) {
                      pointerToUser {
                        username
                      }
                    }
                  }
                `,
                variables: {
                  id: object3.id,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                  foundGraphQLClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                  foundUserClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                }
              });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support includeReadPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const databaseAdapter = parseServer.config.databaseController.adapter;
              spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    graphQLClass(
                      id: $id
                      options: { readPreference: SECONDARY, includeReadPreference: NEAREST }
                    ) {
                      pointerToUser {
                        username
                      }
                    }
                  }
                `,
                variables: {
                  id: object3.id,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                  foundGraphQLClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                  foundUserClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.NEAREST);
                }
              });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });
          });
        });

        describe('Find', () => {
          it('should return class objects using class specific query', async () => {
            const obj1 = new Parse.Object('Customer');
            obj1.set('someField', 'someValue1');
            await obj1.save();
            const obj2 = new Parse.Object('Customer');
            obj2.set('someField', 'someValue1');
            await obj2.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    edges {
                      node {
                        objectId
                        someField
                        createdAt
                        updatedAt
                      }
                    }
                  }
                }
              `,
            });

            expect(result.data.customers.edges.length).toEqual(2);

            result.data.customers.edges.forEach(resultObj => {
              const obj = resultObj.node.objectId === obj1.id ? obj1 : obj2;
              expect(resultObj.node.objectId).toEqual(obj.id);
              expect(resultObj.node.someField).toEqual(obj.get('someField'));
              expect(new Date(resultObj.node.createdAt)).toEqual(obj.createdAt);
              expect(new Date(resultObj.node.updatedAt)).toEqual(obj.updatedAt);
            });
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            async function findObjects(className, headers) {
              const graphqlClassName = pluralize(
                className.charAt(0).toLowerCase() + className.slice(1)
              );
              const result = await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: ${graphqlClassName} {
                      edges {
                        node {
                          id
                          someField
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers,
                },
              });

              return result;
            }

            expect(
              (await findObjects('GraphQLClass')).data.find.edges.map(
                object => object.node.someField
              )
            ).toEqual([]);
            expect(
              (await findObjects('PublicClass')).data.find.edges.map(
                object => object.node.someField
              )
            ).toEqual(['someValue4']);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Master-Key': 'test',
                })
              ).data.find.edges
                .map(object => object.node.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (
                await findObjects('PublicClass', {
                  'X-Parse-Master-Key': 'test',
                })
              ).data.find.edges.map(object => object.node.someField)
            ).toEqual(['someValue4']);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                })
              ).data.find.edges
                .map(object => object.node.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (
                await findObjects('PublicClass', {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                })
              ).data.find.edges.map(object => object.node.someField)
            ).toEqual(['someValue4']);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Session-Token': user2.getSessionToken(),
                })
              ).data.find.edges
                .map(object => object.node.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Session-Token': user3.getSessionToken(),
                })
              ).data.find.edges
                .map(object => object.node.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Session-Token': user4.getSessionToken(),
                })
              ).data.find.edges.map(object => object.node.someField)
            ).toEqual([]);
            expect(
              (
                await findObjects('GraphQLClass', {
                  'X-Parse-Session-Token': user5.getSessionToken(),
                })
              ).data.find.edges.map(object => object.node.someField)
            ).toEqual(['someValue3']);
          });

          it('should support where argument using class specific query', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  graphQLClasses(where: $where) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  someField: {
                    in: ['someValue1', 'someValue2', 'someValue3'],
                  },
                  OR: [
                    {
                      pointerToUser: {
                        have: {
                          objectId: {
                            equalTo: user5.id,
                          },
                        },
                      },
                    },
                    {
                      id: {
                        equalTo: object1.id,
                      },
                    },
                  ],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(
              result.data.graphQLClasses.edges.map(object => object.node.someField).sort()
            ).toEqual(['someValue1', 'someValue3']);
          });

          it('should support in pointer operator using class specific query', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  graphQLClasses(where: $where) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  pointerToUser: {
                    have: {
                      objectId: {
                        in: [user5.id],
                      },
                    },
                  },
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            const { edges } = result.data.graphQLClasses;
            expect(edges.length).toBe(1);
            expect(edges[0].node.someField).toEqual('someValue3');
          });

          it('should support OR operation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query {
                  graphQLClasses(
                    where: {
                      OR: [
                        { someField: { equalTo: "someValue1" } }
                        { someField: { equalTo: "someValue2" } }
                      ]
                    }
                  ) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(
              result.data.graphQLClasses.edges.map(object => object.node.someField).sort()
            ).toEqual(['someValue1', 'someValue2']);
          });

          it('should support full text search', async () => {
            try {
              const obj = new Parse.Object('FullTextSearchTest');
              obj.set('field1', 'Parse GraphQL Server');
              obj.set('field2', 'It rocks!');
              await obj.save();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const result = await apolloClient.query({
                query: gql`
                  query FullTextSearchTests($where: FullTextSearchTestWhereInput) {
                    fullTextSearchTests(where: $where) {
                      edges {
                        node {
                          objectId
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
                variables: {
                  where: {
                    field1: {
                      text: {
                        search: {
                          term: 'graphql',
                        },
                      },
                    },
                  },
                },
              });

              expect(result.data.fullTextSearchTests.edges[0].node.objectId).toEqual(obj.id);
            } catch (e) {
              handleError(e);
            }
          });

          it('should support in query key', async () => {
            try {
              const country = new Parse.Object('Country');
              country.set('code', 'FR');
              await country.save();

              const country2 = new Parse.Object('Country');
              country2.set('code', 'US');
              await country2.save();

              const city = new Parse.Object('City');
              city.set('country', 'FR');
              city.set('name', 'city1');
              await city.save();

              const city2 = new Parse.Object('City');
              city2.set('country', 'US');
              city2.set('name', 'city2');
              await city2.save();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const {
                data: {
                  cities: { edges: result },
                },
              } = await apolloClient.query({
                query: gql`
                  query inQueryKey($where: CityWhereInput) {
                    cities(where: $where) {
                      edges {
                        node {
                          country
                          name
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
                variables: {
                  where: {
                    country: {
                      inQueryKey: {
                        query: {
                          className: 'Country',
                          where: { code: { equalTo: 'US' } },
                        },
                        key: 'code',
                      },
                    },
                  },
                },
              });

              expect(result.length).toEqual(1);
              expect(result[0].node.name).toEqual('city2');
            } catch (e) {
              handleError(e);
            }
          });

          it('should support order, skip and first arguments', async () => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
              const obj = new Parse.Object('SomeClass');
              obj.set('someField', `someValue${i < 10 ? '0' : ''}${i}`);
              obj.set('numberField', i % 3);
              promises.push(obj.save());
            }
            await Promise.all(promises);

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects(
                  $where: SomeClassWhereInput
                  $order: [SomeClassOrder!]
                  $skip: Int
                  $first: Int
                ) {
                  find: someClasses(where: $where, order: $order, skip: $skip, first: $first) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  someField: {
                    matchesRegex: '^someValue',
                  },
                },
                order: ['numberField_DESC', 'someField_ASC'],
                skip: 4,
                first: 2,
              },
            });

            expect(result.data.find.edges.map(obj => obj.node.someField)).toEqual([
              'someValue14',
              'someValue17',
            ]);
          });

          it('should support pagination', async () => {
            const numberArray = (first, last) => {
              const array = [];
              for (let i = first; i <= last; i++) {
                array.push(i);
              }
              return array;
            };

            const promises = [];
            for (let i = 0; i < 100; i++) {
              const obj = new Parse.Object('SomeClass');
              obj.set('numberField', i);
              promises.push(obj.save());
            }
            await Promise.all(promises);

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const find = async ({ skip, after, first, before, last } = {}) => {
              return await apolloClient.query({
                query: gql`
                  query FindSomeObjects(
                    $order: [SomeClassOrder!]
                    $skip: Int
                    $after: String
                    $first: Int
                    $before: String
                    $last: Int
                  ) {
                    someClasses(
                      order: $order
                      skip: $skip
                      after: $after
                      first: $first
                      before: $before
                      last: $last
                    ) {
                      edges {
                        cursor
                        node {
                          numberField
                        }
                      }
                      count
                      pageInfo {
                        hasPreviousPage
                        startCursor
                        endCursor
                        hasNextPage
                      }
                    }
                  }
                `,
                variables: {
                  order: ['numberField_ASC'],
                  skip,
                  after,
                  first,
                  before,
                  last,
                },
              });
            };

            let result = await find();
            expect(result.data.someClasses.edges.map(edge => edge.node.numberField)).toEqual(
              numberArray(0, 99)
            );
            expect(result.data.someClasses.count).toEqual(100);
            expect(result.data.someClasses.pageInfo.hasPreviousPage).toEqual(false);
            expect(result.data.someClasses.pageInfo.startCursor).toEqual(
              result.data.someClasses.edges[0].cursor
            );
            expect(result.data.someClasses.pageInfo.endCursor).toEqual(
              result.data.someClasses.edges[99].cursor
            );
            expect(result.data.someClasses.pageInfo.hasNextPage).toEqual(false);

            result = await find({ first: 10 });
            expect(result.data.someClasses.edges.map(edge => edge.node.numberField)).toEqual(
              numberArray(0, 9)
            );
            expect(result.data.someClasses.count).toEqual(100);
            expect(result.data.someClasses.pageInfo.hasPreviousPage).toEqual(false);
            expect(result.data.someClasses.pageInfo.startCursor).toEqual(
              result.data.someClasses.edges[0].cursor
            );
            expect(result.data.someClasses.pageInfo.endCursor).toEqual(
              result.data.someClasses.edges[9].cursor
            );
            expect(result.data.someClasses.pageInfo.hasNextPage).toEqual(true);

            result = await find({
              first: 10,
              after: result.data.someClasses.pageInfo.endCursor,
            });
            expect(result.data.someClasses.edges.map(edge => edge.node.numberField)).toEqual(
              numberArray(10, 19)
            );
            expect(result.data.someClasses.count).toEqual(100);
            expect(result.data.someClasses.pageInfo.hasPreviousPage).toEqual(true);
            expect(result.data.someClasses.pageInfo.startCursor).toEqual(
              result.data.someClasses.edges[0].cursor
            );
            expect(result.data.someClasses.pageInfo.endCursor).toEqual(
              result.data.someClasses.edges[9].cursor
            );
            expect(result.data.someClasses.pageInfo.hasNextPage).toEqual(true);

            result = await find({ last: 10 });
            expect(result.data.someClasses.edges.map(edge => edge.node.numberField)).toEqual(
              numberArray(90, 99)
            );
            expect(result.data.someClasses.count).toEqual(100);
            expect(result.data.someClasses.pageInfo.hasPreviousPage).toEqual(true);
            expect(result.data.someClasses.pageInfo.startCursor).toEqual(
              result.data.someClasses.edges[0].cursor
            );
            expect(result.data.someClasses.pageInfo.endCursor).toEqual(
              result.data.someClasses.edges[9].cursor
            );
            expect(result.data.someClasses.pageInfo.hasNextPage).toEqual(false);

            result = await find({
              last: 10,
              before: result.data.someClasses.pageInfo.startCursor,
            });
            expect(result.data.someClasses.edges.map(edge => edge.node.numberField)).toEqual(
              numberArray(80, 89)
            );
            expect(result.data.someClasses.count).toEqual(100);
            expect(result.data.someClasses.pageInfo.hasPreviousPage).toEqual(true);
            expect(result.data.someClasses.pageInfo.startCursor).toEqual(
              result.data.someClasses.edges[0].cursor
            );
            expect(result.data.someClasses.pageInfo.endCursor).toEqual(
              result.data.someClasses.edges[9].cursor
            );
            expect(result.data.someClasses.pageInfo.hasNextPage).toEqual(true);
          });

          it('should support count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const where = {
              someField: {
                in: ['someValue1', 'someValue2', 'someValue3'],
              },
              OR: [
                {
                  pointerToUser: {
                    have: {
                      objectId: {
                        equalTo: user5.id,
                      },
                    },
                  },
                },
                {
                  id: {
                    equalTo: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput, $first: Int) {
                  find: graphQLClasses(where: $where, first: $first) {
                    edges {
                      node {
                        id
                      }
                    }
                    count
                  }
                }
              `,
              variables: {
                where,
                first: 0,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.edges).toEqual([]);
            expect(result.data.find.count).toEqual(2);
          });

          it('should only count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const where = {
              someField: {
                in: ['someValue1', 'someValue2', 'someValue3'],
              },
              OR: [
                {
                  pointerToUser: {
                    have: {
                      objectId: {
                        equalTo: user5.id,
                      },
                    },
                  },
                },
                {
                  id: {
                    equalTo: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    count
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.edges).toBeUndefined();
            expect(result.data.find.count).toEqual(2);
          });

          it('should respect max limit', async () => {
            parseServer = await global.reconfigureServer({
              maxLimit: 10,
            });

            const promises = [];
            for (let i = 0; i < 100; i++) {
              const obj = new Parse.Object('SomeClass');
              promises.push(obj.save());
            }
            await Promise.all(promises);

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($limit: Int) {
                  find: someClasses(where: { id: { exists: true } }, first: $limit) {
                    edges {
                      node {
                        id
                      }
                    }
                    count
                  }
                }
              `,
              variables: {
                limit: 50,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.edges.length).toEqual(10);
            expect(result.data.find.count).toEqual(100);
          });

          it('should support keys argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  id: { equalTo: object3.id },
                },
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    edges {
                      node {
                        someField
                        pointerToUser {
                          username
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  id: { equalTo: object3.id },
                },
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.find.edges[0].node.someField).toBeDefined();
            expect(result1.data.find.edges[0].node.pointerToUser).toBeUndefined();
            expect(result2.data.find.edges[0].node.someField).toBeDefined();
            expect(result2.data.find.edges[0].node.pointerToUser).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const where = {
              id: {
                equalTo: object3.id,
              },
            };

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    edges {
                      node {
                        pointerToUser {
                          id
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    edges {
                      node {
                        pointerToUser {
                          username
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });
            expect(result1.data.find.edges[0].node.pointerToUser.username).toBeUndefined();
            expect(result2.data.find.edges[0].node.pointerToUser.username).toBeDefined();
          });

          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const databaseAdapter = parseServer.config.databaseController.adapter;
              spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: graphQLClasses {
                      edges {
                        node {
                          pointerToUser {
                            username
                          }
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Session-Token': user1.getSessionToken(),
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                  foundGraphQLClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.PRIMARY);
                } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                  foundUserClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.PRIMARY);
                }
              });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support readPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const databaseAdapter = parseServer.config.databaseController.adapter;
              spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: graphQLClasses(options: { readPreference: SECONDARY }) {
                      edges {
                        node {
                          pointerToUser {
                            username
                          }
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                  foundGraphQLClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                  foundUserClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                }
              });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support includeReadPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

              const databaseAdapter = parseServer.config.databaseController.adapter;
              spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    graphQLClasses(
                      options: { readPreference: SECONDARY, includeReadPreference: NEAREST }
                    ) {
                      edges {
                        node {
                          pointerToUser {
                            username
                          }
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                  foundGraphQLClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                  foundUserClassReadPreference = true;
                  expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.NEAREST);
                }
              });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support subqueryReadPreference argument', async () => {
              try {
                await prepareData();

                await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

                const databaseAdapter = parseServer.config.databaseController.adapter;
                spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

                await apolloClient.query({
                  query: gql`
                    query FindSomeObjects($where: GraphQLClassWhereInput) {
                      find: graphQLClasses(
                        where: $where
                        options: { readPreference: SECONDARY, subqueryReadPreference: NEAREST }
                      ) {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                  `,
                  variables: {
                    where: {
                      pointerToUser: {
                        have: {
                          objectId: {
                            equalTo: 'xxxx',
                          },
                        },
                      },
                    },
                  },
                  context: {
                    headers: {
                      'X-Parse-Master-Key': 'test',
                    },
                  },
                });

                let foundGraphQLClassReadPreference = false;
                let foundUserClassReadPreference = false;
                databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.SECONDARY);
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.NEAREST);
                  }
                });

                expect(foundGraphQLClassReadPreference).toBe(true);
                expect(foundUserClassReadPreference).toBe(true);
              } catch (e) {
                handleError(e);
              }
            });
          });

          it('should order by multiple fields', async () => {
            await prepareData();

            await resetGraphQLCache();

            let result;
            try {
              result = await apolloClient.query({
                query: gql`
                  query OrderByMultipleFields($order: [GraphQLClassOrder!]) {
                    graphQLClasses(order: $order) {
                      edges {
                        node {
                          objectId
                        }
                      }
                    }
                  }
                `,
                variables: {
                  order: ['someOtherField_DESC', 'someField_ASC'],
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });
            } catch (e) {
              handleError(e);
            }

            expect(result.data.graphQLClasses.edges.map(edge => edge.node.objectId)).toEqual([
              object3.id,
              object1.id,
              object2.id,
            ]);
          });

          it_only_db('mongo')('should order by multiple fields on a relation field', async () => {
            await prepareData();

            const parentObject = new Parse.Object('ParentClass');
            const relation = parentObject.relation('graphQLClasses');
            relation.add(object1);
            relation.add(object2);
            relation.add(object3);
            await parentObject.save();

            await resetGraphQLCache();

            let result;
            try {
              result = await apolloClient.query({
                query: gql`
                  query OrderByMultipleFieldsOnRelation($id: ID!, $order: [GraphQLClassOrder!]) {
                    parentClass(id: $id) {
                      graphQLClasses(order: $order) {
                        edges {
                          node {
                            objectId
                          }
                        }
                      }
                    }
                  }
                `,
                variables: {
                  id: parentObject.id,
                  order: ['someOtherField_DESC', 'someField_ASC'],
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });
            } catch (e) {
              handleError(e);
            }

            expect(
              result.data.parentClass.graphQLClasses.edges.map(edge => edge.node.objectId)
            ).toEqual([object3.id, object1.id, object2.id]);
          });

          it('should support including relation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query FindRoles {
                  roles {
                    edges {
                      node {
                        name
                      }
                    }
                  }
                }
              `,
              variables: {},
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindRoles {
                  roles {
                    edges {
                      node {
                        name
                        users {
                          edges {
                            node {
                              username
                            }
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: {},
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.roles.edges[0].node.name).toBeDefined();
            expect(result1.data.roles.edges[0].node.users).toBeUndefined();
            expect(result1.data.roles.edges[0].node.roles).toBeUndefined();
            expect(result2.data.roles.edges[0].node.name).toBeDefined();
            expect(result2.data.roles.edges[0].node.users).toBeDefined();
            expect(result2.data.roles.edges[0].node.users.edges[0].node.username).toBeDefined();
            expect(result2.data.roles.edges[0].node.roles).toBeUndefined();
          });
        });
      });

      describe('Objects Mutations', () => {
        describe('Create', () => {
          it('should return specific type object using class specific mutation', async () => {
            const clientMutationId = uuidv4();
            const customerSchema = new Parse.Schema('Customer');
            customerSchema.addString('someField');
            await customerSchema.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCustomer($input: CreateCustomerInput!) {
                  createCustomer(input: $input) {
                    clientMutationId
                    customer {
                      id
                      objectId
                      createdAt
                      someField
                    }
                  }
                }
              `,
              variables: {
                input: {
                  clientMutationId,
                  fields: {
                    someField: 'someValue',
                  },
                },
              },
            });

            expect(result.data.createCustomer.clientMutationId).toEqual(clientMutationId);
            expect(result.data.createCustomer.customer.id).toBeDefined();
            expect(result.data.createCustomer.customer.someField).toEqual('someValue');

            const customer = await new Parse.Query('Customer').get(
              result.data.createCustomer.customer.objectId
            );

            expect(customer.createdAt).toEqual(
              new Date(result.data.createCustomer.customer.createdAt)
            );
            expect(customer.get('someField')).toEqual('someValue');
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            async function createObject(className, headers) {
              const getClassName = className.charAt(0).toLowerCase() + className.slice(1);
              const result = await apolloClient.mutate({
                mutation: gql`
                  mutation CreateSomeObject {
                    create${className}(input: {}) {
                      ${getClassName} {
                        id
                        createdAt
                      }
                    }
                  }
                `,
                context: {
                  headers,
                },
              });

              const specificCreate = result.data[`create${className}`][getClassName];
              expect(specificCreate.id).toBeDefined();
              expect(specificCreate.createdAt).toBeDefined();

              return result;
            }

            await expectAsync(createObject('GraphQLClass')).toBeRejectedWith(
              jasmine.stringMatching('Permission denied for action create on class GraphQLClass')
            );
            await expectAsync(createObject('PublicClass')).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', { 'X-Parse-Master-Key': 'test' })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', { 'X-Parse-Master-Key': 'test' })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })
            ).toBeRejectedWith(
              jasmine.stringMatching('Permission denied for action create on class GraphQLClass')
            );
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })
            ).toBeResolved();
          });
        });

        describe('Update', () => {
          it('should return specific type object using class specific mutation', async () => {
            const clientMutationId = uuidv4();
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer($input: UpdateCustomerInput!) {
                  updateCustomer(input: $input) {
                    clientMutationId
                    customer {
                      updatedAt
                      someField1
                      someField2
                    }
                  }
                }
              `,
              variables: {
                input: {
                  clientMutationId,
                  id: obj.id,
                  fields: {
                    someField1: 'someField1Value2',
                  },
                },
              },
            });

            expect(result.data.updateCustomer.clientMutationId).toEqual(clientMutationId);
            expect(result.data.updateCustomer.customer.updatedAt).toBeDefined();
            expect(result.data.updateCustomer.customer.someField1).toEqual('someField1Value2');
            expect(result.data.updateCustomer.customer.someField2).toEqual('someField2Value1');

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should return only id using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer($id: ID!, $fields: UpdateCustomerFieldsInput) {
                  updateCustomer(input: { id: $id, fields: $fields }) {
                    customer {
                      id
                      objectId
                    }
                  }
                }
              `,
              variables: {
                id: obj.id,
                fields: {
                  someField1: 'someField1Value2',
                },
              },
            });

            expect(result.data.updateCustomer.customer.objectId).toEqual(obj.id);

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            async function updateObject(className, id, fields, headers) {
              return await apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $id: ID!
                    $fields: Update${className}FieldsInput
                  ) {
                    update: update${className}(input: {
                      id: $id
                      fields: $fields
                      clientMutationId: "someid"
                    }) {
                      clientMutationId
                    }
                  }
                `,
                variables: {
                  id,
                  fields,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(obj.className, obj.id, {
                    someField: 'changedValue1',
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(object4.className, object4.id, {
                  someField: 'changedValue1',
                })
              ).data.update.clientMutationId
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue1');
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue2' },
                      { 'X-Parse-Master-Key': 'test' }
                    )
                  ).data.update.clientMutationId
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue2');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue3' },
                      { 'X-Parse-Session-Token': user1.getSessionToken() }
                    )
                  ).data.update.clientMutationId
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue3');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue4' },
                      { 'X-Parse-Session-Token': user2.getSessionToken() }
                    )
                  ).data.update.clientMutationId
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue4');
              })
            );
            await Promise.all(
              [object1, object3, object4].map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue5' },
                      { 'X-Parse-Session-Token': user3.getSessionToken() }
                    )
                  ).data.update.clientMutationId
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue5');
              })
            );
            const originalFieldValue = object2.get('someField');
            await expectAsync(
              updateObject(
                object2.className,
                object2.id,
                { someField: 'changedValue5' },
                { 'X-Parse-Session-Token': user3.getSessionToken() }
              )
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await object2.fetch({ useMasterKey: true });
            expect(object2.get('someField')).toEqual(originalFieldValue);
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue6' },
                    { 'X-Parse-Session-Token': user4.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(
                  object4.className,
                  object4.id,
                  { someField: 'changedValue6' },
                  { 'X-Parse-Session-Token': user4.getSessionToken() }
                )
              ).data.update.clientMutationId
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue6');
            await Promise.all(
              objects.slice(0, 2).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue7' },
                    { 'X-Parse-Session-Token': user5.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(
                  object3.className,
                  object3.id,
                  { someField: 'changedValue7' },
                  { 'X-Parse-Session-Token': user5.getSessionToken() }
                )
              ).data.update.clientMutationId
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (
                await updateObject(
                  object4.className,
                  object4.id,
                  { someField: 'changedValue7' },
                  { 'X-Parse-Session-Token': user5.getSessionToken() }
                )
              ).data.update.clientMutationId
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue7');
          });

          it('should respect level permissions with specific class mutation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            function updateObject(className, id, fields, headers) {
              const mutationName = className.charAt(0).toLowerCase() + className.slice(1);

              return apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $id: ID!
                    $fields: Update${className}FieldsInput
                  ) {
                    update${className}(input: {
                      id: $id
                      fields: $fields
                    }) {
                      ${mutationName} {
                        updatedAt
                      }
                    }
                  }
                `,
                variables: {
                  id,
                  fields,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(obj.className, obj.id, {
                    someField: 'changedValue1',
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(object4.className, object4.id, {
                  someField: 'changedValue1',
                })
              ).data[`update${object4.className}`][
                object4.className.charAt(0).toLowerCase() + object4.className.slice(1)
              ].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue1');
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue2' },
                      { 'X-Parse-Master-Key': 'test' }
                    )
                  ).data[`update${obj.className}`][
                    obj.className.charAt(0).toLowerCase() + obj.className.slice(1)
                  ].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue2');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue3' },
                      { 'X-Parse-Session-Token': user1.getSessionToken() }
                    )
                  ).data[`update${obj.className}`][
                    obj.className.charAt(0).toLowerCase() + obj.className.slice(1)
                  ].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue3');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue4' },
                      { 'X-Parse-Session-Token': user2.getSessionToken() }
                    )
                  ).data[`update${obj.className}`][
                    obj.className.charAt(0).toLowerCase() + obj.className.slice(1)
                  ].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue4');
              })
            );
            await Promise.all(
              [object1, object3, object4].map(async obj => {
                expect(
                  (
                    await updateObject(
                      obj.className,
                      obj.id,
                      { someField: 'changedValue5' },
                      { 'X-Parse-Session-Token': user3.getSessionToken() }
                    )
                  ).data[`update${obj.className}`][
                    obj.className.charAt(0).toLowerCase() + obj.className.slice(1)
                  ].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue5');
              })
            );
            const originalFieldValue = object2.get('someField');
            await expectAsync(
              updateObject(
                object2.className,
                object2.id,
                { someField: 'changedValue5' },
                { 'X-Parse-Session-Token': user3.getSessionToken() }
              )
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await object2.fetch({ useMasterKey: true });
            expect(object2.get('someField')).toEqual(originalFieldValue);
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue6' },
                    { 'X-Parse-Session-Token': user4.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(
                  object4.className,
                  object4.id,
                  { someField: 'changedValue6' },
                  { 'X-Parse-Session-Token': user4.getSessionToken() }
                )
              ).data[`update${object4.className}`][
                object4.className.charAt(0).toLowerCase() + object4.className.slice(1)
              ].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue6');
            await Promise.all(
              objects.slice(0, 2).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue7' },
                    { 'X-Parse-Session-Token': user5.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (
                await updateObject(
                  object3.className,
                  object3.id,
                  { someField: 'changedValue7' },
                  { 'X-Parse-Session-Token': user5.getSessionToken() }
                )
              ).data[`update${object3.className}`][
                object3.className.charAt(0).toLowerCase() + object3.className.slice(1)
              ].updatedAt
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (
                await updateObject(
                  object4.className,
                  object4.id,
                  { someField: 'changedValue7' },
                  { 'X-Parse-Session-Token': user5.getSessionToken() }
                )
              ).data[`update${object4.className}`][
                object4.className.charAt(0).toLowerCase() + object4.className.slice(1)
              ].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue7');
          });
        });

        describe('Delete', () => {
          it('should return a specific type using class specific mutation', async () => {
            const clientMutationId = uuidv4();
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation DeleteCustomer($input: DeleteCustomerInput!) {
                  deleteCustomer(input: $input) {
                    clientMutationId
                    customer {
                      id
                      objectId
                      someField1
                      someField2
                    }
                  }
                }
              `,
              variables: {
                input: {
                  clientMutationId,
                  id: obj.id,
                },
              },
            });

            expect(result.data.deleteCustomer.clientMutationId).toEqual(clientMutationId);
            expect(result.data.deleteCustomer.customer.objectId).toEqual(obj.id);
            expect(result.data.deleteCustomer.customer.someField1).toEqual('someField1Value1');
            expect(result.data.deleteCustomer.customer.someField2).toEqual('someField2Value1');

            await expectAsync(obj.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            function deleteObject(className, id, headers) {
              const mutationName = className.charAt(0).toLowerCase() + className.slice(1);
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $id: ID!
                  ) {
                    delete: delete${className}(input: { id: $id }) {
                      ${mutationName} {
                        objectId
                      }
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(deleteObject(obj.className, obj.id)).toBeRejectedWith(
                  jasmine.stringMatching('Object not found')
                );
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await deleteObject(object4.className, object4.id)).data.delete[
                object4.className.charAt(0).toLowerCase() + object4.className.slice(1)
              ]
            ).toEqual({ objectId: object4.id, __typename: 'PublicClass' });
            await expectAsync(object4.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object1.className, object1.id, {
                  'X-Parse-Master-Key': 'test',
                })
              ).data.delete[object1.className.charAt(0).toLowerCase() + object1.className.slice(1)]
            ).toEqual({ objectId: object1.id, __typename: 'GraphQLClass' });
            await expectAsync(object1.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object2.className, object2.id, {
                  'X-Parse-Session-Token': user2.getSessionToken(),
                })
              ).data.delete[object2.className.charAt(0).toLowerCase() + object2.className.slice(1)]
            ).toEqual({ objectId: object2.id, __typename: 'GraphQLClass' });
            await expectAsync(object2.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object3.className, object3.id, {
                  'X-Parse-Session-Token': user5.getSessionToken(),
                })
              ).data.delete[object3.className.charAt(0).toLowerCase() + object3.className.slice(1)]
            ).toEqual({ objectId: object3.id, __typename: 'GraphQLClass' });
            await expectAsync(object3.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
          });

          it('should respect level permissions with specific class mutation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            function deleteObject(className, id, headers) {
              const mutationName = className.charAt(0).toLowerCase() + className.slice(1);
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $id: ID!
                  ) {
                    delete${className}(input: { id: $id }) {
                      ${mutationName} {
                        objectId
                      }
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(deleteObject(obj.className, obj.id)).toBeRejectedWith(
                  jasmine.stringMatching('Object not found')
                );
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await deleteObject(object4.className, object4.id)).data[
                `delete${object4.className}`
              ][object4.className.charAt(0).toLowerCase() + object4.className.slice(1)].objectId
            ).toEqual(object4.id);
            await expectAsync(object4.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object1.className, object1.id, {
                  'X-Parse-Master-Key': 'test',
                })
              ).data[`delete${object1.className}`][
                object1.className.charAt(0).toLowerCase() + object1.className.slice(1)
              ].objectId
            ).toEqual(object1.id);
            await expectAsync(object1.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object2.className, object2.id, {
                  'X-Parse-Session-Token': user2.getSessionToken(),
                })
              ).data[`delete${object2.className}`][
                object2.className.charAt(0).toLowerCase() + object2.className.slice(1)
              ].objectId
            ).toEqual(object2.id);
            await expectAsync(object2.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
            expect(
              (
                await deleteObject(object3.className, object3.id, {
                  'X-Parse-Session-Token': user5.getSessionToken(),
                })
              ).data[`delete${object3.className}`][
                object3.className.charAt(0).toLowerCase() + object3.className.slice(1)
              ].objectId
            ).toEqual(object3.id);
            await expectAsync(object3.fetch({ useMasterKey: true })).toBeRejectedWith(
              jasmine.stringMatching('Object not found')
            );
          });
        });
      });

      describe('Files Mutations', () => {
        describe('Create', () => {
          it('should return File object', async () => {
            const clientMutationId = uuidv4();

            parseServer = await global.reconfigureServer({
              publicServerURL: 'http://localhost:13377/parse',
            });

            const body = new FormData();
            body.append(
              'operations',
              JSON.stringify({
                query: `
                  mutation CreateFile($input: CreateFileInput!) {
                    createFile(input: $input) {
                      clientMutationId
                      fileInfo {
                        name
                        url
                      }
                    }
                  }
                `,
                variables: {
                  input: {
                    clientMutationId,
                    upload: null,
                  },
                },
              })
            );
            body.append('map', JSON.stringify({ 1: ['variables.input.upload'] }));
            body.append('1', 'My File Content', {
              filename: 'myFileName.txt',
              contentType: 'text/plain',
            });

            let res = await fetch('http://localhost:13377/graphql', {
              method: 'POST',
              headers,
              body,
            });

            expect(res.status).toEqual(200);

            const result = JSON.parse(await res.text());

            expect(result.data.createFile.clientMutationId).toEqual(clientMutationId);
            expect(result.data.createFile.fileInfo.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result.data.createFile.fileInfo.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            res = await fetch(result.data.createFile.fileInfo.url);

            expect(res.status).toEqual(200);
            expect(await res.text()).toEqual('My File Content');
          });
        });
      });

      describe('Users Queries', () => {
        it('should return current logged user', async () => {
          const userName = 'user1',
            password = 'user1',
            email = 'emailUser1@parse.com';

          const user = new Parse.User();
          user.setUsername(userName);
          user.setPassword(password);
          user.setEmail(email);
          await user.signUp();

          const session = await Parse.Session.current();
          const result = await apolloClient.query({
            query: gql`
              query GetCurrentUser {
                viewer {
                  user {
                    id
                    username
                    email
                  }
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          const { id, username: resultUserName, email: resultEmail } = result.data.viewer.user;
          expect(id).toBeDefined();
          expect(resultUserName).toEqual(userName);
          expect(resultEmail).toEqual(email);
        });

        it('should return logged user including pointer', async () => {
          const foo = new Parse.Object('Foo');
          foo.set('bar', 'hello');

          const userName = 'user1',
            password = 'user1',
            email = 'emailUser1@parse.com';

          const user = new Parse.User();
          user.setUsername(userName);
          user.setPassword(password);
          user.setEmail(email);
          user.set('userFoo', foo);
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const session = await Parse.Session.current();
          const result = await apolloClient.query({
            query: gql`
              query GetCurrentUser {
                viewer {
                  sessionToken
                  user {
                    id
                    objectId
                    userFoo {
                      bar
                    }
                  }
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          const sessionToken = result.data.viewer.sessionToken;
          const { objectId, userFoo: resultFoo } = result.data.viewer.user;
          expect(objectId).toEqual(user.id);
          expect(sessionToken).toBeDefined();
          expect(resultFoo).toBeDefined();
          expect(resultFoo.bar).toEqual('hello');
        });
        it('should return logged user and do not by pass pointer security', async () => {
          const masterKeyOnlyACL = new Parse.ACL();
          masterKeyOnlyACL.setPublicReadAccess(false);
          masterKeyOnlyACL.setPublicWriteAccess(false);
          const foo = new Parse.Object('Foo');
          foo.setACL(masterKeyOnlyACL);
          foo.set('bar', 'hello');
          await foo.save(null, { useMasterKey: true });
          const userName = 'userx1',
            password = 'user1',
            email = 'emailUserx1@parse.com';

          const user = new Parse.User();
          user.setUsername(userName);
          user.setPassword(password);
          user.setEmail(email);
          user.set('userFoo', foo);
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const session = await Parse.Session.current();
          const result = await apolloClient.query({
            query: gql`
              query GetCurrentUser {
                viewer {
                  sessionToken
                  user {
                    id
                    objectId
                    userFoo {
                      bar
                    }
                  }
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          const sessionToken = result.data.viewer.sessionToken;
          const { objectId, userFoo: resultFoo } = result.data.viewer.user;
          expect(objectId).toEqual(user.id);
          expect(sessionToken).toBeDefined();
          expect(resultFoo).toEqual(null);
        });
      });

      describe('Users Mutations', () => {
        const challengeAdapter = {
          validateAuthData: () => Promise.resolve({ response: { someData: true } }),
          validateAppId: () => Promise.resolve(),
          challenge: () => Promise.resolve({ someData: true }),
          options: { anOption: true },
        };

        it('should create user and return authData response', async () => {
          parseServer = await global.reconfigureServer({
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              challengeAdapter,
            },
          });
          const clientMutationId = uuidv4();

          const result = await apolloClient.mutate({
            mutation: gql`
              mutation createUser($input: CreateUserInput!) {
                createUser(input: $input) {
                  clientMutationId
                  user {
                    id
                    authDataResponse
                  }
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                fields: {
                  authData: {
                    challengeAdapter: {
                      id: 'challengeAdapter',
                    },
                  },
                },
              },
            },
          });

          expect(result.data.createUser.clientMutationId).toEqual(clientMutationId);
          expect(result.data.createUser.user.authDataResponse).toEqual({
            challengeAdapter: { someData: true },
          });
        });

        it('should sign user up', async () => {
          parseServer = await global.reconfigureServer({
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              challengeAdapter,
            },
          });
          const clientMutationId = uuidv4();
          const userSchema = new Parse.Schema('_User');
          userSchema.addString('someField');
          userSchema.addPointer('aPointer', '_User');
          await userSchema.update();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation SignUp($input: SignUpInput!) {
                signUp(input: $input) {
                  clientMutationId
                  viewer {
                    sessionToken
                    user {
                      someField
                      authDataResponse
                      aPointer {
                        id
                        username
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                fields: {
                  username: 'user1',
                  password: 'user1',
                  authData: {
                    challengeAdapter: {
                      id: 'challengeAdapter',
                    },
                  },
                  aPointer: {
                    createAndLink: {
                      username: 'user2',
                      password: 'user2',
                      someField: 'someValue2',
                    },
                  },
                  someField: 'someValue',
                },
              },
            },
          });

          expect(result.data.signUp.clientMutationId).toEqual(clientMutationId);
          expect(result.data.signUp.viewer.sessionToken).toBeDefined();
          expect(result.data.signUp.viewer.user.someField).toEqual('someValue');
          expect(result.data.signUp.viewer.user.aPointer.id).toBeDefined();
          expect(result.data.signUp.viewer.user.aPointer.username).toEqual('user2');
          expect(typeof result.data.signUp.viewer.sessionToken).toBe('string');
          expect(result.data.signUp.viewer.user.authDataResponse).toEqual({
            challengeAdapter: { someData: true },
          });
        });

        it('should login with user', async () => {
          const clientMutationId = uuidv4();
          const userSchema = new Parse.Schema('_User');
          parseServer = await global.reconfigureServer({
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              challengeAdapter,
              myAuth: {
                module: global.mockCustomAuthenticator('parse', 'graphql'),
              },
            },
          });

          userSchema.addString('someField');
          userSchema.addPointer('aPointer', '_User');
          await userSchema.update();
          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation LogInWith($input: LogInWithInput!) {
                logInWith(input: $input) {
                  clientMutationId
                  viewer {
                    sessionToken
                    user {
                      someField
                      authDataResponse
                      aPointer {
                        id
                        username
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                authData: {
                  challengeAdapter: { id: 'challengeAdapter' },
                  myAuth: {
                    id: 'parse',
                    password: 'graphql',
                  },
                },
                fields: {
                  someField: 'someValue',
                  aPointer: {
                    createAndLink: {
                      username: 'user2',
                      password: 'user2',
                      someField: 'someValue2',
                    },
                  },
                },
              },
            },
          });

          expect(result.data.logInWith.clientMutationId).toEqual(clientMutationId);
          expect(result.data.logInWith.viewer.sessionToken).toBeDefined();
          expect(result.data.logInWith.viewer.user.someField).toEqual('someValue');
          expect(typeof result.data.logInWith.viewer.sessionToken).toBe('string');
          expect(result.data.logInWith.viewer.user.aPointer.id).toBeDefined();
          expect(result.data.logInWith.viewer.user.aPointer.username).toEqual('user2');
          expect(result.data.logInWith.viewer.user.authDataResponse).toEqual({
            challengeAdapter: { someData: true },
          });
        });

        it('should handle challenge', async () => {
          const clientMutationId = uuidv4();

          spyOn(challengeAdapter, 'challenge').and.callThrough();
          parseServer = await global.reconfigureServer({
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              challengeAdapter,
            },
          });

          const user = new Parse.User();
          await user.save({ username: 'username', password: 'password' });

          const result = await apolloClient.mutate({
            mutation: gql`
              mutation Challenge($input: ChallengeInput!) {
                challenge(input: $input) {
                  clientMutationId
                  challengeData
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                username: 'username',
                password: 'password',
                challengeData: {
                  challengeAdapter: { someChallengeData: true },
                },
              },
            },
          });

          const challengeCall = challengeAdapter.challenge.calls.argsFor(0);
          expect(challengeAdapter.challenge).toHaveBeenCalledTimes(1);
          expect(challengeCall[0]).toEqual({ someChallengeData: true });
          expect(challengeCall[1]).toEqual(undefined);
          expect(challengeCall[2]).toEqual(challengeAdapter);
          expect(challengeCall[3].config).toBeDefined();
          expect(challengeCall[3].auth).toBeDefined();
          expect(challengeCall[3].config.headers).toBeDefined();
          expect(challengeCall[4] instanceof Parse.User).toBeTruthy();
          expect(challengeCall[4].id).toEqual(user.id);
          expect(result.data.challenge.clientMutationId).toEqual(clientMutationId);
          expect(result.data.challenge.challengeData).toEqual({
            challengeAdapter: { someData: true },
          });
        });

        it('should log the user in', async () => {
          parseServer = await global.reconfigureServer({
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              challengeAdapter,
            },
          });
          const clientMutationId = uuidv4();
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          user.set('someField', 'someValue');
          await user.signUp();
          await Parse.User.logOut();
          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($input: LogInInput!) {
                logIn(input: $input) {
                  clientMutationId
                  viewer {
                    sessionToken
                    user {
                      authDataResponse
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                username: 'user1',
                password: 'user1',
                authData: { challengeAdapter: { token: true } },
              },
            },
          });

          expect(result.data.logIn.clientMutationId).toEqual(clientMutationId);
          expect(result.data.logIn.viewer.sessionToken).toBeDefined();
          expect(result.data.logIn.viewer.user.someField).toEqual('someValue');
          expect(typeof result.data.logIn.viewer.sessionToken).toBe('string');
          expect(result.data.logIn.viewer.user.authDataResponse).toEqual({
            challengeAdapter: { someData: true },
          });
        });

        it('should log the user out', async () => {
          const clientMutationId = uuidv4();
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();
          await Parse.User.logOut();

          const logIn = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($input: LogInInput!) {
                logIn(input: $input) {
                  viewer {
                    sessionToken
                  }
                }
              }
            `,
            variables: {
              input: {
                username: 'user1',
                password: 'user1',
              },
            },
          });

          const sessionToken = logIn.data.logIn.viewer.sessionToken;

          const logOut = await apolloClient.mutate({
            mutation: gql`
              mutation LogOutUser($input: LogOutInput!) {
                logOut(input: $input) {
                  clientMutationId
                  ok
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': sessionToken,
              },
            },
            variables: {
              input: {
                clientMutationId,
              },
            },
          });
          expect(logOut.data.logOut.clientMutationId).toEqual(clientMutationId);
          expect(logOut.data.logOut.ok).toEqual(true);

          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  viewer {
                    username
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': sessionToken,
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { statusCode, result } = err.networkError;
            expect(statusCode).toBe(400);
            expect(result).toEqual({
              code: 209,
              error: 'Invalid session token',
            });
          }
        });

        it('should send reset password', async () => {
          const clientMutationId = uuidv4();
          const emailAdapter = {
            sendVerificationEmail: () => {},
            sendPasswordResetEmail: () => Promise.resolve(),
            sendMail: () => {},
          };
          parseServer = await global.reconfigureServer({
            appName: 'test',
            emailAdapter: emailAdapter,
            publicServerURL: 'http://test.test',
          });
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          user.setEmail('user1@user1.user1');
          await user.signUp();
          await Parse.User.logOut();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation ResetPassword($input: ResetPasswordInput!) {
                resetPassword(input: $input) {
                  clientMutationId
                  ok
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                email: 'user1@user1.user1',
              },
            },
          });

          expect(result.data.resetPassword.clientMutationId).toEqual(clientMutationId);
          expect(result.data.resetPassword.ok).toBeTruthy();
        });

        it('should reset password', async () => {
          const clientMutationId = uuidv4();
          let resetPasswordToken;
          const emailAdapter = {
            sendVerificationEmail: () => {},
            sendPasswordResetEmail: ({ link }) => {
              resetPasswordToken = link.split('token=')[1].split('&')[0];
            },
            sendMail: () => {},
          };
          parseServer = await global.reconfigureServer({
            appName: 'test',
            emailAdapter: emailAdapter,
            publicServerURL: 'http://localhost:13377/parse',
            auth: {
              myAuth: {
                module: global.mockCustomAuthenticator('parse', 'graphql'),
              },
            },
          });
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          user.setEmail('user1@user1.user1');
          await user.signUp();
          await Parse.User.logOut();
          await Parse.User.requestPasswordReset('user1@user1.user1');
          await apolloClient.mutate({
            mutation: gql`
              mutation ConfirmResetPassword($input: ConfirmResetPasswordInput!) {
                confirmResetPassword(input: $input) {
                  clientMutationId
                  ok
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                username: 'user1',
                password: 'newPassword',
                token: resetPasswordToken,
              },
            },
          });
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($input: LogInInput!) {
                logIn(input: $input) {
                  clientMutationId
                  viewer {
                    sessionToken
                  }
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                username: 'user1',
                password: 'newPassword',
              },
            },
          });

          expect(result.data.logIn.clientMutationId).toEqual(clientMutationId);
          expect(result.data.logIn.viewer.sessionToken).toBeDefined();
          expect(typeof result.data.logIn.viewer.sessionToken).toBe('string');
        });

        it('should send verification email again', async () => {
          const clientMutationId = uuidv4();
          const emailAdapter = {
            sendVerificationEmail: () => {},
            sendPasswordResetEmail: () => Promise.resolve(),
            sendMail: () => {},
          };
          parseServer = await global.reconfigureServer({
            appName: 'test',
            emailAdapter: emailAdapter,
            publicServerURL: 'http://test.test',
          });
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          user.setEmail('user1@user1.user1');
          await user.signUp();
          await Parse.User.logOut();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation SendVerificationEmail($input: SendVerificationEmailInput!) {
                sendVerificationEmail(input: $input) {
                  clientMutationId
                  ok
                }
              }
            `,
            variables: {
              input: {
                clientMutationId,
                email: 'user1@user1.user1',
              },
            },
          });

          expect(result.data.sendVerificationEmail.clientMutationId).toEqual(clientMutationId);
          expect(result.data.sendVerificationEmail.ok).toBeTruthy();
        });
      });

      describe('Session Token', () => {
        it('should fail due to invalid session token', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  me {
                    username
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': 'foo',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { statusCode, result } = err.networkError;
            expect(statusCode).toBe(400);
            expect(result).toEqual({
              code: 209,
              error: 'Invalid session token',
            });
          }
        });

        it('should fail due to empty session token', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  viewer {
                    user {
                      username
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': '',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { graphQLErrors } = err;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Invalid session token');
          }
        });

        it('should find a user and fail due to empty session token', async () => {
          const car = new Parse.Object('Car');
          await car.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  viewer {
                    user {
                      username
                    }
                  }
                  cars {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': '',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { graphQLErrors } = err;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Invalid session token');
          }
        });
      });

      describe('Functions Mutations', () => {
        it('can be called', async () => {
          try {
            const clientMutationId = uuidv4();

            Parse.Cloud.define('hello', async () => {
              return 'Hello world!';
            });

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CallFunction($input: CallCloudCodeInput!) {
                  callCloudCode(input: $input) {
                    clientMutationId
                    result
                  }
                }
              `,
              variables: {
                input: {
                  clientMutationId,
                  functionName: 'hello',
                },
              },
            });

            expect(result.data.callCloudCode.clientMutationId).toEqual(clientMutationId);
            expect(result.data.callCloudCode.result).toEqual('Hello world!');
          } catch (e) {
            handleError(e);
          }
        });

        it('can throw errors', async () => {
          Parse.Cloud.define('hello', async () => {
            throw new Error('Some error message.');
          });

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation CallFunction {
                  callCloudCode(input: { functionName: hello }) {
                    result
                  }
                }
              `,
            });
            fail('Should throw an error');
          } catch (e) {
            const { graphQLErrors } = e;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Some error message.');
          }
        });

        it('should accept different params', done => {
          Parse.Cloud.define('hello', async req => {
            expect(req.params.date instanceof Date).toBe(true);
            expect(req.params.date.getTime()).toBe(1463907600000);
            expect(req.params.dateList[0] instanceof Date).toBe(true);
            expect(req.params.dateList[0].getTime()).toBe(1463907600000);
            expect(req.params.complexStructure.date[0] instanceof Date).toBe(true);
            expect(req.params.complexStructure.date[0].getTime()).toBe(1463907600000);
            expect(req.params.complexStructure.deepDate.date[0] instanceof Date).toBe(true);
            expect(req.params.complexStructure.deepDate.date[0].getTime()).toBe(1463907600000);
            expect(req.params.complexStructure.deepDate2[0].date instanceof Date).toBe(true);
            expect(req.params.complexStructure.deepDate2[0].date.getTime()).toBe(1463907600000);
            // Regression for #2294
            expect(req.params.file instanceof Parse.File).toBe(true);
            expect(req.params.file.url()).toEqual('https://some.url');
            // Regression for #2204
            expect(req.params.array).toEqual(['a', 'b', 'c']);
            expect(Array.isArray(req.params.array)).toBe(true);
            expect(req.params.arrayOfArray).toEqual([
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ]);
            expect(Array.isArray(req.params.arrayOfArray)).toBe(true);
            expect(Array.isArray(req.params.arrayOfArray[0])).toBe(true);
            expect(Array.isArray(req.params.arrayOfArray[1])).toBe(true);

            done();
          });

          const params = {
            date: {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
            dateList: [
              {
                __type: 'Date',
                iso: '2016-05-22T09:00:00.000Z',
              },
            ],
            lol: 'hello',
            complexStructure: {
              date: [
                {
                  __type: 'Date',
                  iso: '2016-05-22T09:00:00.000Z',
                },
              ],
              deepDate: {
                date: [
                  {
                    __type: 'Date',
                    iso: '2016-05-22T09:00:00.000Z',
                  },
                ],
              },
              deepDate2: [
                {
                  date: {
                    __type: 'Date',
                    iso: '2016-05-22T09:00:00.000Z',
                  },
                },
              ],
            },
            file: Parse.File.fromJSON({
              __type: 'File',
              name: 'name',
              url: 'https://some.url',
            }),
            array: ['a', 'b', 'c'],
            arrayOfArray: [
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ],
          };

          apolloClient.mutate({
            mutation: gql`
              mutation CallFunction($params: Object) {
                callCloudCode(input: { functionName: hello, params: $params }) {
                  result
                }
              }
            `,
            variables: {
              params,
            },
          });
        });

        it('should list all functions in the enum type', async () => {
          try {
            Parse.Cloud.define('a', async () => {
              return 'hello a';
            });

            Parse.Cloud.define('b', async () => {
              return 'hello b';
            });

            Parse.Cloud.define('_underscored', async () => {
              return 'hello _underscored';
            });

            Parse.Cloud.define('contains1Number', async () => {
              return 'hello contains1Number';
            });

            const functionEnum = (
              await apolloClient.query({
                query: gql`
                  query ObjectType {
                    __type(name: "CloudCodeFunction") {
                      kind
                      enumValues {
                        name
                      }
                    }
                  }
                `,
              })
            ).data['__type'];
            expect(functionEnum.kind).toEqual('ENUM');
            expect(functionEnum.enumValues.map(value => value.name).sort()).toEqual([
              '_underscored',
              'a',
              'b',
              'contains1Number',
            ]);
          } catch (e) {
            handleError(e);
          }
        });

        it('should warn functions not matching GraphQL allowed names', async () => {
          try {
            spyOn(parseGraphQLServer.parseGraphQLSchema.log, 'warn').and.callThrough();

            Parse.Cloud.define('a', async () => {
              return 'hello a';
            });

            Parse.Cloud.define('double-barrelled', async () => {
              return 'hello b';
            });

            Parse.Cloud.define('1NumberInTheBeggning', async () => {
              return 'hello contains1Number';
            });

            const functionEnum = (
              await apolloClient.query({
                query: gql`
                  query ObjectType {
                    __type(name: "CloudCodeFunction") {
                      kind
                      enumValues {
                        name
                      }
                    }
                  }
                `,
              })
            ).data['__type'];
            expect(functionEnum.kind).toEqual('ENUM');
            expect(functionEnum.enumValues.map(value => value.name).sort()).toEqual(['a']);
            expect(
              parseGraphQLServer.parseGraphQLSchema.log.warn.calls
                .all()
                .map(call => call.args[0])
                .sort()
            ).toEqual([
              'Function 1NumberInTheBeggning could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.',
              'Function double-barrelled could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.',
            ]);
          } catch (e) {
            handleError(e);
          }
        });
      });

      describe('Data Types', () => {
        it('should support String', async () => {
          try {
            const someFieldValue = 'some string';

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addStrings: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('String');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: String) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { equalTo: $someFieldValue } }) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('string');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Int numbers', async () => {
          try {
            const someFieldValue = 123;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addNumbers: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Number');

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Float) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { equalTo: $someFieldValue } }) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('number');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Float numbers', async () => {
          try {
            const someFieldValue = 123.4;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addNumbers: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Number');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Float) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { equalTo: $someFieldValue } }) {
                    edges {
                      node {
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('number');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Boolean', async () => {
          try {
            const someFieldValueTrue = true;
            const someFieldValueFalse = false;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addBooleans: [{ name: 'someFieldTrue' }, { name: 'someFieldFalse' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someFieldTrue.type).toEqual('Boolean');
            expect(schema.fields.someFieldFalse.type).toEqual('Boolean');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someFieldTrue: someFieldValueTrue,
                  someFieldFalse: someFieldValueFalse,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject(
                  $id: ID!
                  $someFieldValueTrue: Boolean
                  $someFieldValueFalse: Boolean
                ) {
                  someClass(id: $id) {
                    someFieldTrue
                    someFieldFalse
                  }
                  someClasses(
                    where: {
                      someFieldTrue: { equalTo: $someFieldValueTrue }
                      someFieldFalse: { equalTo: $someFieldValueFalse }
                    }
                  ) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                someFieldValueTrue,
                someFieldValueFalse,
              },
            });

            expect(typeof getResult.data.someClass.someFieldTrue).toEqual('boolean');
            expect(typeof getResult.data.someClass.someFieldFalse).toEqual('boolean');
            expect(getResult.data.someClass.someFieldTrue).toEqual(true);
            expect(getResult.data.someClass.someFieldFalse).toEqual(false);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Date', async () => {
          try {
            const someFieldValue = new Date();

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addDates: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Date');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { exists: true } }) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
              },
            });

            expect(new Date(getResult.data.someClass.someField)).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support createdAt and updatedAt', async () => {
          await apolloClient.mutate({
            mutation: gql`
              mutation CreateClass {
                createClass(input: { name: "SomeClass" }) {
                  clientMutationId
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.createdAt.type).toEqual('Date');
          expect(schema.fields.updatedAt.type).toEqual('Date');
        });

        it('should support ACL', async () => {
          const someClass = new Parse.Object('SomeClass');
          await someClass.save();

          const user = new Parse.User();
          user.set('username', 'username');
          user.set('password', 'password');
          await user.signUp();

          const user2 = new Parse.User();
          user2.set('username', 'username2');
          user2.set('password', 'password2');
          await user2.signUp();

          const roleACL = new Parse.ACL();
          roleACL.setPublicReadAccess(true);

          const role = new Parse.Role('aRole', roleACL);
          await role.save();

          const role2 = new Parse.Role('aRole2', roleACL);
          await role2.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const gqlUser = (
            await apolloClient.query({
              query: gql`
                query getUser($id: ID!) {
                  user(id: $id) {
                    id
                  }
                }
              `,
              variables: { id: user.id },
            })
          ).data.user;
          const {
            data: { createSomeClass },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Create($fields: CreateSomeClassFieldsInput) {
                createSomeClass(input: { fields: $fields }) {
                  someClass {
                    id
                    objectId
                    ACL {
                      users {
                        userId
                        read
                        write
                      }
                      roles {
                        roleName
                        read
                        write
                      }
                      public {
                        read
                        write
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                ACL: {
                  users: [
                    { userId: gqlUser.id, read: true, write: true },
                    { userId: user2.id, read: true, write: false },
                  ],
                  roles: [
                    { roleName: 'aRole', read: true, write: false },
                    { roleName: 'aRole2', read: false, write: true },
                  ],
                  public: { read: true, write: true },
                },
              },
            },
          });

          const expectedCreateACL = {
            __typename: 'ACL',
            users: [
              {
                userId: toGlobalId('_User', user.id),
                read: true,
                write: true,
                __typename: 'UserACL',
              },
              {
                userId: toGlobalId('_User', user2.id),
                read: true,
                write: false,
                __typename: 'UserACL',
              },
            ],
            roles: [
              {
                roleName: 'aRole',
                read: true,
                write: false,
                __typename: 'RoleACL',
              },
              {
                roleName: 'aRole2',
                read: false,
                write: true,
                __typename: 'RoleACL',
              },
            ],
            public: { read: true, write: true, __typename: 'PublicACL' },
          };
          const query1 = new Parse.Query('SomeClass');
          const obj1 = (
            await query1.get(createSomeClass.someClass.objectId, {
              useMasterKey: true,
            })
          ).toJSON();
          expect(obj1.ACL[user.id]).toEqual({ read: true, write: true });
          expect(obj1.ACL[user2.id]).toEqual({ read: true });
          expect(obj1.ACL['role:aRole']).toEqual({ read: true });
          expect(obj1.ACL['role:aRole2']).toEqual({ write: true });
          expect(obj1.ACL['*']).toEqual({ read: true, write: true });
          expect(createSomeClass.someClass.ACL).toEqual(expectedCreateACL);

          const {
            data: { updateSomeClass },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Update($id: ID!, $fields: UpdateSomeClassFieldsInput) {
                updateSomeClass(input: { id: $id, fields: $fields }) {
                  someClass {
                    id
                    objectId
                    ACL {
                      users {
                        userId
                        read
                        write
                      }
                      roles {
                        roleName
                        read
                        write
                      }
                      public {
                        read
                        write
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              id: createSomeClass.someClass.id,
              fields: {
                ACL: {
                  roles: [{ roleName: 'aRole', write: true, read: true }],
                  public: { read: true, write: false },
                },
              },
            },
          });

          const expectedUpdateACL = {
            __typename: 'ACL',
            users: null,
            roles: [
              {
                roleName: 'aRole',
                read: true,
                write: true,
                __typename: 'RoleACL',
              },
            ],
            public: { read: true, write: false, __typename: 'PublicACL' },
          };

          const query2 = new Parse.Query('SomeClass');
          const obj2 = (
            await query2.get(createSomeClass.someClass.objectId, {
              useMasterKey: true,
            })
          ).toJSON();

          expect(obj2.ACL['role:aRole']).toEqual({ write: true, read: true });
          expect(obj2.ACL[user.id]).toBeUndefined();
          expect(obj2.ACL['*']).toEqual({ read: true });
          expect(updateSomeClass.someClass.ACL).toEqual(expectedUpdateACL);
        });

        it('should support pointer on create', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              createCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Create($fields: CreateCountryFieldsInput) {
                createCountry(input: { fields: $fields }) {
                  country {
                    id
                    objectId
                    company {
                      id
                      objectId
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imCountry2',
                company: { link: company2.id },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.objectId).toEqual(company2.id);
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support nested pointer on create', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              createCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Create($fields: CreateCountryFieldsInput) {
                createCountry(input: { fields: $fields }) {
                  country {
                    id
                    company {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imCountry2',
                company: {
                  createAndLink: {
                    name: 'imACompany2',
                  },
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toBeDefined();
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support pointer on update', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              updateCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Update($id: ID!, $fields: UpdateCountryFieldsInput) {
                updateCountry(input: { id: $id, fields: $fields }) {
                  country {
                    id
                    objectId
                    company {
                      id
                      objectId
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              fields: {
                company: { link: company2.id },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.objectId).toEqual(company2.id);
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support nested pointer on update', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              updateCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Update($id: ID!, $fields: UpdateCountryFieldsInput) {
                updateCountry(input: { id: $id, fields: $fields }) {
                  country {
                    id
                    company {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              fields: {
                company: {
                  createAndLink: {
                    name: 'imACompany2',
                  },
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toBeDefined();
          expect(result.company.name).toEqual('imACompany2');
        });

        it_only_db('mongo')('should support relation and nested relation on create', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add(company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              createCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation CreateCountry($fields: CreateCountryFieldsInput) {
                createCountry(input: { fields: $fields }) {
                  country {
                    id
                    objectId
                    name
                    companies {
                      edges {
                        node {
                          id
                          objectId
                          name
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imACountry2',
                companies: {
                  add: [company.id],
                  createAndAdd: [
                    {
                      name: 'imACompany2',
                    },
                    {
                      name: 'imACompany3',
                    },
                  ],
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.name).toEqual('imACountry2');
          expect(result.companies.edges.length).toEqual(3);
          expect(result.companies.edges.some(o => o.node.objectId === company.id)).toBeTruthy();
          expect(result.companies.edges.some(o => o.node.name === 'imACompany2')).toBeTruthy();
          expect(result.companies.edges.some(o => o.node.name === 'imACompany3')).toBeTruthy();
        });

        it_only_db('mongo')('should support deep nested creation', async () => {
          const team = new Parse.Object('Team');
          team.set('name', 'imATeam1');
          await team.save();

          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          company.relation('teams').add(team);
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add(company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              createCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation CreateCountry($fields: CreateCountryFieldsInput) {
                createCountry(input: { fields: $fields }) {
                  country {
                    id
                    name
                    companies {
                      edges {
                        node {
                          id
                          name
                          teams {
                            edges {
                              node {
                                id
                                name
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imACountry2',
                companies: {
                  createAndAdd: [
                    {
                      name: 'imACompany2',
                      teams: {
                        createAndAdd: {
                          name: 'imATeam2',
                        },
                      },
                    },
                    {
                      name: 'imACompany3',
                      teams: {
                        createAndAdd: {
                          name: 'imATeam3',
                        },
                      },
                    },
                  ],
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.name).toEqual('imACountry2');
          expect(result.companies.edges.length).toEqual(2);
          expect(
            result.companies.edges.some(
              c =>
                c.node.name === 'imACompany2' &&
                c.node.teams.edges.some(t => t.node.name === 'imATeam2')
            )
          ).toBeTruthy();
          expect(
            result.companies.edges.some(
              c =>
                c.node.name === 'imACompany3' &&
                c.node.teams.edges.some(t => t.node.name === 'imATeam3')
            )
          ).toBeTruthy();
        });

        it_only_db('mongo')('should support relation and nested relation on update', async () => {
          const company1 = new Parse.Object('Company');
          company1.set('name', 'imACompany1');
          await company1.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add(company1);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              updateCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation UpdateCountry($id: ID!, $fields: UpdateCountryFieldsInput) {
                updateCountry(input: { id: $id, fields: $fields }) {
                  country {
                    id
                    objectId
                    companies {
                      edges {
                        node {
                          id
                          objectId
                          name
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              fields: {
                companies: {
                  add: [company2.id],
                  remove: [company1.id],
                  createAndAdd: [
                    {
                      name: 'imACompany3',
                    },
                  ],
                },
              },
            },
          });

          expect(result.objectId).toEqual(country.id);
          expect(result.companies.edges.length).toEqual(2);
          expect(result.companies.edges.some(o => o.node.objectId === company2.id)).toBeTruthy();
          expect(result.companies.edges.some(o => o.node.name === 'imACompany3')).toBeTruthy();
          expect(result.companies.edges.some(o => o.node.objectId === company1.id)).toBeFalsy();
        });

        it_only_db('mongo')('should support nested relation on create with filter', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add(company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const {
            data: {
              createCountry: { country: result },
            },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation CreateCountry($fields: CreateCountryFieldsInput, $where: CompanyWhereInput) {
                createCountry(input: { fields: $fields }) {
                  country {
                    id
                    name
                    companies(where: $where) {
                      edges {
                        node {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                name: {
                  equalTo: 'imACompany2',
                },
              },
              fields: {
                name: 'imACountry2',
                companies: {
                  add: [company.id],
                  createAndAdd: [
                    {
                      name: 'imACompany2',
                    },
                    {
                      name: 'imACompany3',
                    },
                  ],
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.name).toEqual('imACountry2');
          expect(result.companies.edges.length).toEqual(1);
          expect(result.companies.edges.some(o => o.node.name === 'imACompany2')).toBeTruthy();
        });

        it_only_db('mongo')('should support relation on query', async () => {
          const company1 = new Parse.Object('Company');
          company1.set('name', 'imACompany1');
          await company1.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add([company1, company2]);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          // Without where
          const {
            data: { country: result1 },
          } = await apolloClient.query({
            query: gql`
              query getCountry($id: ID!) {
                country(id: $id) {
                  id
                  objectId
                  companies {
                    edges {
                      node {
                        id
                        objectId
                        name
                      }
                    }
                    count
                  }
                }
              }
            `,
            variables: {
              id: country.id,
            },
          });

          expect(result1.objectId).toEqual(country.id);
          expect(result1.companies.edges.length).toEqual(2);
          expect(result1.companies.edges.some(o => o.node.objectId === company1.id)).toBeTruthy();
          expect(result1.companies.edges.some(o => o.node.objectId === company2.id)).toBeTruthy();

          // With where
          const {
            data: { country: result2 },
          } = await apolloClient.query({
            query: gql`
              query getCountry($id: ID!, $where: CompanyWhereInput) {
                country(id: $id) {
                  id
                  objectId
                  companies(where: $where) {
                    edges {
                      node {
                        id
                        objectId
                        name
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              where: {
                name: { equalTo: 'imACompany1' },
              },
            },
          });
          expect(result2.objectId).toEqual(country.id);
          expect(result2.companies.edges.length).toEqual(1);
          expect(result2.companies.edges[0].node.objectId).toEqual(company1.id);
        });

        it_only_db('mongo')('should support relational where query', async () => {
          const president = new Parse.Object('President');
          president.set('name', 'James');
          await president.save();

          const employee = new Parse.Object('Employee');
          employee.set('name', 'John');
          await employee.save();

          const company1 = new Parse.Object('Company');
          company1.set('name', 'imACompany1');
          await company1.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          company2.relation('employees').add([employee]);
          await company2.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add([company1, company2]);
          await country.save();

          const country2 = new Parse.Object('Country');
          country2.set('name', 'imACountry2');
          country2.relation('companies').add([company1]);
          await country2.save();

          const country3 = new Parse.Object('Country');
          country3.set('name', 'imACountry3');
          country3.set('president', president);
          await country3.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          let {
            data: {
              countries: { edges: result },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      objectId
                      companies {
                        edges {
                          node {
                            id
                            objectId
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                companies: {
                  have: {
                    employees: { have: { name: { equalTo: 'John' } } },
                  },
                },
              },
            },
          });
          expect(result.length).toEqual(1);
          result = result[0].node;
          expect(result.objectId).toEqual(country.id);
          expect(result.companies.edges.length).toEqual(2);

          const {
            data: {
              countries: { edges: result2 },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      objectId
                      companies {
                        edges {
                          node {
                            id
                            objectId
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                companies: {
                  have: {
                    OR: [
                      { name: { equalTo: 'imACompany1' } },
                      { name: { equalTo: 'imACompany2' } },
                    ],
                  },
                },
              },
            },
          });
          expect(result2.length).toEqual(2);

          const {
            data: {
              countries: { edges: result3 },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                companies: { exists: false },
              },
            },
          });
          expect(result3.length).toEqual(1);
          expect(result3[0].node.name).toEqual('imACountry3');

          const {
            data: {
              countries: { edges: result4 },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                president: { exists: false },
              },
            },
          });
          expect(result4.length).toEqual(2);
          const {
            data: {
              countries: { edges: result5 },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                president: { exists: true },
              },
            },
          });
          expect(result5.length).toEqual(1);
          const {
            data: {
              countries: { edges: result6 },
            },
          } = await apolloClient.query({
            query: gql`
              query findCountry($where: CountryWhereInput) {
                countries(where: $where) {
                  edges {
                    node {
                      id
                      objectId
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                companies: {
                  haveNot: {
                    OR: [
                      { name: { equalTo: 'imACompany1' } },
                      { name: { equalTo: 'imACompany2' } },
                    ],
                  },
                },
              },
            },
          });
          expect(result6.length).toEqual(1);
          expect(result6.length).toEqual(1);
          expect(result6[0].node.name).toEqual('imACountry3');
        });

        it('should support files', async () => {
          try {
            parseServer = await global.reconfigureServer({
              publicServerURL: 'http://localhost:13377/parse',
            });

            const body = new FormData();
            body.append(
              'operations',
              JSON.stringify({
                query: `
                  mutation CreateFile($input: CreateFileInput!) {
                    createFile(input: $input) {
                      fileInfo {
                        name
                        url
                      }
                    }
                  }
                `,
                variables: {
                  input: {
                    upload: null,
                  },
                },
              })
            );
            body.append('map', JSON.stringify({ 1: ['variables.input.upload'] }));
            body.append('1', 'My File Content', {
              filename: 'myFileName.txt',
              contentType: 'text/plain',
            });

            let res = await fetch('http://localhost:13377/graphql', {
              method: 'POST',
              headers,
              body,
            });

            expect(res.status).toEqual(200);

            const result = JSON.parse(await res.text());

            expect(result.data.createFile.fileInfo.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result.data.createFile.fileInfo.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            const someFieldValue = result.data.createFile.fileInfo.name;
            const someFieldObjectValue = result.data.createFile.fileInfo;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addFiles: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const body2 = new FormData();
            body2.append(
              'operations',
              JSON.stringify({
                query: `
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                  $fields3: CreateSomeClassFieldsInput
                ) {
                  createSomeClass1: createSomeClass(
                    input: { fields: $fields1 }
                  ) {
                    someClass {
                      id
                      someField {
                        name
                        url
                      }
                    }
                  }
                  createSomeClass2: createSomeClass(
                    input: { fields: $fields2 }
                  ) {
                    someClass {
                      id
                      someField {
                        name
                        url
                      }
                    }
                  }
                  createSomeClass3: createSomeClass(
                    input: { fields: $fields3 }
                  ) {
                    someClass {
                      id
                      someField {
                        name
                        url
                      }
                    }
                  }
                }
                `,
                variables: {
                  fields1: {
                    someField: { file: someFieldValue },
                  },
                  fields2: {
                    someField: {
                      file: {
                        name: someFieldObjectValue.name,
                        url: someFieldObjectValue.url,
                        __type: 'File',
                      },
                    },
                  },
                  fields3: {
                    someField: { upload: null },
                  },
                },
              })
            );
            body2.append('map', JSON.stringify({ 1: ['variables.fields3.someField.upload'] }));
            body2.append('1', 'My File Content', {
              filename: 'myFileName.txt',
              contentType: 'text/plain',
            });

            res = await fetch('http://localhost:13377/graphql', {
              method: 'POST',
              headers,
              body: body2,
            });
            expect(res.status).toEqual(200);
            const result2 = JSON.parse(await res.text());
            expect(result2.data.createSomeClass1.someClass.someField.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result2.data.createSomeClass1.someClass.someField.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result2.data.createSomeClass2.someClass.someField.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result2.data.createSomeClass2.someClass.someField.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result2.data.createSomeClass3.someClass.someField.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result2.data.createSomeClass3.someClass.someField.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('File');

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField {
                      name
                      url
                    }
                  }
                  findSomeClass1: someClasses(where: { someField: { exists: true } }) {
                    edges {
                      node {
                        someField {
                          name
                          url
                        }
                      }
                    }
                  }
                  findSomeClass2: someClasses(where: { someField: { exists: true } }) {
                    edges {
                      node {
                        someField {
                          name
                          url
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: result2.data.createSomeClass1.someClass.id,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('object');
            expect(getResult.data.someClass.someField.name).toEqual(
              result.data.createFile.fileInfo.name
            );
            expect(getResult.data.someClass.someField.url).toEqual(
              result.data.createFile.fileInfo.url
            );
            expect(getResult.data.findSomeClass1.edges.length).toEqual(3);
            expect(getResult.data.findSomeClass2.edges.length).toEqual(3);

            res = await fetch(getResult.data.someClass.someField.url);

            expect(res.status).toEqual(200);
            expect(await res.text()).toEqual('My File Content');

            const mutationResult = await apolloClient.mutate({
              mutation: gql`
                mutation UnlinkFile($id: ID!) {
                  updateSomeClass(input: { id: $id, fields: { someField: { file: null } } }) {
                    someClass {
                      someField {
                        name
                        url
                      }
                    }
                  }
                }
              `,
              variables: {
                id: result2.data.createSomeClass3.someClass.id,
              },
            });
            expect(mutationResult.data.updateSomeClass.someClass.someField).toEqual(null);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support object values', async () => {
          try {
            const someObjectFieldValue = {
              foo: { bar: 'baz' },
              number: 10,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addObjects: [{ name: 'someObjectField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someObjectField.type).toEqual('Object');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someObjectField: someObjectFieldValue,
                },
              },
            });

            const where = {
              someObjectField: {
                equalTo: { key: 'foo.bar', value: 'baz' },
                notEqualTo: { key: 'foo.bar', value: 'bat' },
                greaterThan: { key: 'number', value: 9 },
                lessThan: { key: 'number', value: 11 },
              },
            };
            const queryResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $where: SomeClassWhereInput) {
                  someClass(id: $id) {
                    id
                    someObjectField
                  }
                  someClasses(where: $where) {
                    edges {
                      node {
                        id
                        someObjectField
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                where,
              },
            });

            const { someClass: getResult, someClasses } = queryResult.data;

            const { someObjectField } = getResult;
            expect(typeof someObjectField).toEqual('object');
            expect(someObjectField).toEqual(someObjectFieldValue);

            // Checks class query results
            expect(someClasses.edges.length).toEqual(1);
            expect(someClasses.edges[0].node.someObjectField).toEqual(someObjectFieldValue);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support object composed queries', async () => {
          try {
            const someObjectFieldValue1 = {
              lorem: 'ipsum',
              number: 10,
            };
            const someObjectFieldValue2 = {
              foo: {
                test: 'bar',
              },
              number: 10,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass {
                  createClass(
                    input: {
                      name: "SomeClass"
                      schemaFields: { addObjects: [{ name: "someObjectField" }] }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                ) {
                  create1: createSomeClass(input: { fields: $fields1 }) {
                    someClass {
                      id
                    }
                  }
                  create2: createSomeClass(input: { fields: $fields2 }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields1: {
                  someObjectField: someObjectFieldValue1,
                },
                fields2: {
                  someObjectField: someObjectFieldValue2,
                },
              },
            });

            const where = {
              AND: [
                {
                  someObjectField: {
                    greaterThan: { key: 'number', value: 9 },
                  },
                },
                {
                  someObjectField: {
                    lessThan: { key: 'number', value: 11 },
                  },
                },
                {
                  OR: [
                    {
                      someObjectField: {
                        equalTo: { key: 'lorem', value: 'ipsum' },
                      },
                    },
                    {
                      someObjectField: {
                        equalTo: { key: 'foo.test', value: 'bar' },
                      },
                    },
                  ],
                },
              ],
            };
            const findResult = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: SomeClassWhereInput) {
                  someClasses(where: $where) {
                    edges {
                      node {
                        id
                        someObjectField
                      }
                    }
                  }
                }
              `,
              variables: {
                where,
              },
            });

            const { create1, create2 } = createResult.data;
            const { someClasses } = findResult.data;

            // Checks class query results
            const { edges } = someClasses;
            expect(edges.length).toEqual(2);
            expect(
              edges.find(result => result.node.id === create1.someClass.id).node.someObjectField
            ).toEqual(someObjectFieldValue1);
            expect(
              edges.find(result => result.node.id === create2.someClass.id).node.someObjectField
            ).toEqual(someObjectFieldValue2);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support array values', async () => {
          try {
            const someArrayFieldValue = [1, 'foo', ['bar'], { lorem: 'ipsum' }, true];

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addArrays: [{ name: 'someArrayField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someArrayField.type).toEqual('Array');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someArrayField: someArrayFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someArrayField {
                      ... on Element {
                        value
                      }
                    }
                  }
                  someClasses(where: { someArrayField: { exists: true } }) {
                    edges {
                      node {
                        id
                        someArrayField {
                          ... on Element {
                            value
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
              },
            });

            const { someArrayField } = getResult.data.someClass;
            expect(Array.isArray(someArrayField)).toBeTruthy();
            expect(someArrayField.map(element => element.value)).toEqual(someArrayFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support undefined array', async () => {
          const schema = await new Parse.Schema('SomeClass');
          schema.addArray('someArray');
          await schema.save();

          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                someClass(id: $id) {
                  id
                  someArray {
                    ... on Element {
                      value
                    }
                  }
                }
              }
            `,
            variables: {
              id: obj.id,
            },
          });
          expect(getResult.data.someClass.someArray).toEqual(null);
        });

        it('should support null values', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass {
                  createClass(
                    input: {
                      name: "SomeClass"
                      schemaFields: {
                        addStrings: [{ name: "someStringField" }, { name: "someNullField" }]
                        addNumbers: [{ name: "someNumberField" }]
                        addBooleans: [{ name: "someBooleanField" }]
                        addObjects: [{ name: "someObjectField" }]
                      }
                    }
                  ) {
                    clientMutationId
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someStringField: 'some string',
                  someNumberField: 123,
                  someBooleanField: true,
                  someObjectField: { someField: 'some value' },
                  someNullField: null,
                },
              },
            });

            await apolloClient.mutate({
              mutation: gql`
                mutation UpdateSomeObject($id: ID!, $fields: UpdateSomeClassFieldsInput) {
                  updateSomeClass(input: { id: $id, fields: $fields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
                fields: {
                  someStringField: null,
                  someNumberField: null,
                  someBooleanField: null,
                  someObjectField: null,
                  someNullField: 'now it has a string',
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someStringField
                    someNumberField
                    someBooleanField
                    someObjectField
                    someNullField
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
              },
            });

            expect(getResult.data.someClass.someStringField).toBeFalsy();
            expect(getResult.data.someClass.someNumberField).toBeFalsy();
            expect(getResult.data.someClass.someBooleanField).toBeFalsy();
            expect(getResult.data.someClass.someObjectField).toBeFalsy();
            expect(getResult.data.someClass.someNullField).toEqual('now it has a string');
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Bytes', async () => {
          try {
            const someFieldValue = 'aGVsbG8gd29ybGQ=';

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addBytes: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Bytes');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                ) {
                  createSomeClass1: createSomeClass(input: { fields: $fields1 }) {
                    someClass {
                      id
                    }
                  }
                  createSomeClass2: createSomeClass(input: { fields: $fields2 }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields1: {
                  someField: someFieldValue,
                },
                fields2: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Bytes) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { equalTo: $someFieldValue } }) {
                    edges {
                      node {
                        id
                        someField
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass1.someClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('string');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(2);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Geo Points', async () => {
          try {
            const someFieldValue = {
              __typename: 'GeoPoint',
              latitude: 45,
              longitude: 45,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addGeoPoint: { name: 'someField' },
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('GeoPoint');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: {
                    latitude: someFieldValue.latitude,
                    longitude: someFieldValue.longitude,
                  },
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField {
                      latitude
                      longitude
                    }
                  }
                  someClasses(where: { someField: { exists: true } }) {
                    edges {
                      node {
                        id
                        someField {
                          latitude
                          longitude
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('object');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.edges.length).toEqual(1);

            const getGeoWhere = await apolloClient.query({
              query: gql`
                query GeoQuery($latitude: Float!, $longitude: Float!) {
                  nearSphere: someClasses(
                    where: {
                      someField: { nearSphere: { latitude: $latitude, longitude: $longitude } }
                    }
                  ) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                  geoWithin: someClasses(
                    where: {
                      someField: {
                        geoWithin: {
                          centerSphere: {
                            distance: 10
                            center: { latitude: $latitude, longitude: $longitude }
                          }
                        }
                      }
                    }
                  ) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                  within: someClasses(
                    where: {
                      someField: {
                        within: {
                          box: {
                            bottomLeft: { latitude: $latitude, longitude: $longitude }
                            upperRight: { latitude: $latitude, longitude: $longitude }
                          }
                        }
                      }
                    }
                  ) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `,
              variables: {
                latitude: 45,
                longitude: 45,
              },
            });
            expect(getGeoWhere.data.nearSphere.edges[0].node.id).toEqual(
              createResult.data.createSomeClass.someClass.id
            );
            expect(getGeoWhere.data.geoWithin.edges[0].node.id).toEqual(
              createResult.data.createSomeClass.someClass.id
            );
            expect(getGeoWhere.data.within.edges[0].node.id).toEqual(
              createResult.data.createSomeClass.someClass.id
            );
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Polygons', async () => {
          try {
            const somePolygonFieldValue = [
              [44, 45],
              [46, 47],
              [48, 49],
              [44, 45],
            ].map(point => ({
              latitude: point[0],
              longitude: point[1],
            }));

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(input: { name: "SomeClass", schemaFields: $schemaFields }) {
                    clientMutationId
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addPolygons: [{ name: 'somePolygonField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.somePolygonField.type).toEqual('Polygon');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(input: { fields: $fields }) {
                    someClass {
                      id
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  somePolygonField: somePolygonFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    somePolygonField {
                      latitude
                      longitude
                    }
                  }
                  someClasses(where: { somePolygonField: { exists: true } }) {
                    edges {
                      node {
                        id
                        somePolygonField {
                          latitude
                          longitude
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.someClass.id,
              },
            });

            expect(typeof getResult.data.someClass.somePolygonField).toEqual('object');
            expect(getResult.data.someClass.somePolygonField).toEqual(
              somePolygonFieldValue.map(geoPoint => ({
                ...geoPoint,
                __typename: 'GeoPoint',
              }))
            );
            expect(getResult.data.someClasses.edges.length).toEqual(1);
            const getIntersect = await apolloClient.query({
              query: gql`
                query IntersectQuery($point: GeoPointInput!) {
                  someClasses(where: { somePolygonField: { geoIntersects: { point: $point } } }) {
                    edges {
                      node {
                        id
                        somePolygonField {
                          latitude
                          longitude
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                point: { latitude: 44, longitude: 45 },
              },
            });
            expect(getIntersect.data.someClasses.edges.length).toEqual(1);
            expect(getIntersect.data.someClasses.edges[0].node.id).toEqual(
              createResult.data.createSomeClass.someClass.id
            );
          } catch (e) {
            handleError(e);
          }
        });

        it_only_db('mongo')('should support bytes values', async () => {
          const SomeClass = Parse.Object.extend('SomeClass');
          const someClass = new SomeClass();
          someClass.set('someField', {
            __type: 'Bytes',
            base64: 'foo',
          });
          await someClass.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Bytes');

          const someFieldValue = {
            __type: 'Bytes',
            base64: 'bytesContent',
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(input: { fields: $fields }) {
                  someClass {
                    id
                  }
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                someClass(id: $id) {
                  someField
                }
              }
            `,
            variables: {
              id: createResult.data.createSomeClass.someClass.id,
            },
          });

          expect(getResult.data.someClass.someField).toEqual(someFieldValue.base64);

          const updatedSomeFieldValue = {
            __type: 'Bytes',
            base64: 'newBytesContent',
          };

          const updatedResult = await apolloClient.mutate({
            mutation: gql`
              mutation UpdateSomeObject($id: ID!, $fields: UpdateSomeClassFieldsInput) {
                updateSomeClass(input: { id: $id, fields: $fields }) {
                  someClass {
                    updatedAt
                  }
                }
              }
            `,
            variables: {
              id: createResult.data.createSomeClass.someClass.id,
              fields: {
                someField: updatedSomeFieldValue,
              },
            },
          });

          const { updatedAt } = updatedResult.data.updateSomeClass.someClass;
          expect(updatedAt).toBeDefined();

          const findResult = await apolloClient.query({
            query: gql`
              query FindSomeObject($where: SomeClassWhereInput!) {
                someClasses(where: $where) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            `,
            variables: {
              where: {
                someField: {
                  equalTo: updatedSomeFieldValue.base64,
                },
              },
            },
          });
          const findResults = findResult.data.someClasses.edges;
          expect(findResults.length).toBe(1);
          expect(findResults[0].node.id).toBe(createResult.data.createSomeClass.someClass.id);
        });
      });

      describe('Special Classes', () => {
        it('should support User class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: user(id: $id) {
                  objectId
                }
              }
            `,
            variables: {
              id: user.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(user.id);
        });

        it('should support Installation class', async () => {
          const installation = new Parse.Installation();
          await installation.save({
            deviceType: 'foo',
          });

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: installation(id: $id) {
                  objectId
                }
              }
            `,
            variables: {
              id: installation.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(installation.id);
        });

        it('should support Role class', async () => {
          const roleACL = new Parse.ACL();
          roleACL.setPublicReadAccess(true);
          const role = new Parse.Role('MyRole', roleACL);
          await role.save();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: role(id: $id) {
                  objectId
                }
              }
            `,
            variables: {
              id: role.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(role.id);
        });

        it('should support Session class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const session = await Parse.Session.current();
          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: session(id: $id) {
                  id
                  objectId
                }
              }
            `,
            variables: {
              id: session.id,
            },
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(session.id);
        });

        it('should support Product class', async () => {
          const Product = Parse.Object.extend('_Product');
          const product = new Product();
          await product.save(
            {
              productIdentifier: 'foo',
              icon: new Parse.File('icon', ['foo']),
              order: 1,
              title: 'Foo',
              subtitle: 'My product',
            },
            { useMasterKey: true }
          );

          await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: product(id: $id) {
                  objectId
                }
              }
            `,
            variables: {
              id: product.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(product.id);
        });
      });
    });
  });

  describe('Custom API', () => {
    describe('GraphQL Schema Based', () => {
      let httpServer;
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
      };
      let apolloClient;
      beforeEach(async () => {
        const expressApp = express();
        httpServer = http.createServer(expressApp);
        parseGraphQLServer = new ParseGraphQLServer(parseServer, {
          graphQLPath: '/graphql',
          graphQLCustomTypeDefs: gql`
            extend type Query {
              hello: String @resolve
              hello2: String @resolve(to: "hello")
              userEcho(user: CreateUserFieldsInput!): User! @resolve
              hello3: String! @mock(with: "Hello world!")
              hello4: User! @mock(with: { username: "somefolk" })
            }
          `,
        });
        parseGraphQLServer.applyGraphQL(expressApp);
        await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));
        const httpLink = createUploadLink({
          uri: 'http://localhost:13377/graphql',
          fetch,
          headers,
        });
        apolloClient = new ApolloClient({
          link: httpLink,
          cache: new InMemoryCache(),
          defaultOptions: {
            query: {
              fetchPolicy: 'no-cache',
            },
          },
        });
      });

      afterEach(async () => {
        await httpServer.close();
      });

      it('can resolve a custom query using default function name', async () => {
        Parse.Cloud.define('hello', async () => {
          return 'Hello world!';
        });

        const result = await apolloClient.query({
          query: gql`
            query Hello {
              hello
            }
          `,
        });

        expect(result.data.hello).toEqual('Hello world!');
      });

      it('can resolve a custom query using function name set by "to" argument', async () => {
        Parse.Cloud.define('hello', async () => {
          return 'Hello world!';
        });

        const result = await apolloClient.query({
          query: gql`
            query Hello {
              hello2
            }
          `,
        });

        expect(result.data.hello2).toEqual('Hello world!');
      });

      it('order option should continue working', async () => {
        const schemaController = await parseServer.config.databaseController.loadSchema();

        await schemaController.addClassIfNotExists('SuperCar', {
          engine: { type: 'String' },
          doors: { type: 'Number' },
          price: { type: 'String' },
          mileage: { type: 'Number' },
        });

        await new Parse.Object('SuperCar').save({
          engine: 'petrol',
          doors: 3,
          price: '£7500',
          mileage: 0,
        });

        await new Parse.Object('SuperCar').save({
          engine: 'petrol',
          doors: 3,
          price: '£7500',
          mileage: 10000,
        });

        await Promise.all([
          parseGraphQLServer.parseGraphQLController.cacheController.graphQL.clear(),
          parseGraphQLServer.parseGraphQLSchema.schemaCache.clear(),
        ]);

        await expectAsync(
          apolloClient.query({
            query: gql`
              query FindSuperCar {
                superCars(order: [mileage_ASC]) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            `,
          })
        ).toBeResolved();
      });
    });

    describe('SDL Based', () => {
      let httpServer;
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
      };
      let apolloClient;

      beforeEach(async () => {
        const expressApp = express();
        httpServer = http.createServer(expressApp);
        const TypeEnum = new GraphQLEnumType({
          name: 'TypeEnum',
          values: {
            human: { value: 'human' },
            robot: { value: 'robot' },
          },
        });
        const SomeClassType = new GraphQLObjectType({
            name: 'SomeClass',
            fields: {
              nameUpperCase: {
                type: new GraphQLNonNull(GraphQLString),
                resolve: p => p.name.toUpperCase(),
              },
              type: { type: TypeEnum },
              language: {
                type: new GraphQLEnumType({
                  name: 'LanguageEnum',
                  values: {
                    fr: { value: 'fr' },
                    en: { value: 'en' },
                  },
                }),
                resolve: () => 'fr',
              },
            },
          }),
          parseGraphQLServer = new ParseGraphQLServer(parseServer, {
            graphQLPath: '/graphql',
            graphQLCustomTypeDefs: new GraphQLSchema({
              query: new GraphQLObjectType({
                name: 'Query',
                fields: {
                  customQuery: {
                    type: new GraphQLNonNull(GraphQLString),
                    args: {
                      message: { type: new GraphQLNonNull(GraphQLString) },
                    },
                    resolve: (p, { message }) => message,
                  },
                  customQueryWithAutoTypeReturn: {
                    type: SomeClassType,
                    args: {
                      id: { type: new GraphQLNonNull(GraphQLString) },
                    },
                    resolve: async (p, { id }) => {
                      const obj = new Parse.Object('SomeClass');
                      obj.id = id;
                      await obj.fetch();
                      return obj.toJSON();
                    },
                  },
                },
              }),
              types: [
                new GraphQLInputObjectType({
                  name: 'CreateSomeClassFieldsInput',
                  fields: {
                    type: { type: TypeEnum },
                  },
                }),
                new GraphQLInputObjectType({
                  name: 'UpdateSomeClassFieldsInput',
                  fields: {
                    type: { type: TypeEnum },
                  },
                }),
                SomeClassType,
              ],
            }),
          });

        parseGraphQLServer.applyGraphQL(expressApp);
        await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));
        const httpLink = createUploadLink({
          uri: 'http://localhost:13377/graphql',
          fetch,
          headers,
        });
        apolloClient = new ApolloClient({
          link: httpLink,
          cache: new InMemoryCache(),
          defaultOptions: {
            query: {
              fetchPolicy: 'no-cache',
            },
          },
        });
      });

      afterEach(async () => {
        await httpServer.close();
      });

      it('can resolve a custom query', async () => {
        const result = await apolloClient.query({
          variables: { message: 'hello' },
          query: gql`
            query CustomQuery($message: String!) {
              customQuery(message: $message)
            }
          `,
        });
        expect(result.data.customQuery).toEqual('hello');
      });

      it('can resolve a custom query with auto type return', async () => {
        const obj = new Parse.Object('SomeClass');
        await obj.save({ name: 'aname', type: 'robot' });
        await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
        const result = await apolloClient.query({
          variables: { id: obj.id },
          query: gql`
            query CustomQuery($id: String!) {
              customQueryWithAutoTypeReturn(id: $id) {
                objectId
                nameUpperCase
                name
                type
              }
            }
          `,
        });
        expect(result.data.customQueryWithAutoTypeReturn.objectId).toEqual(obj.id);
        expect(result.data.customQueryWithAutoTypeReturn.name).toEqual('aname');
        expect(result.data.customQueryWithAutoTypeReturn.nameUpperCase).toEqual('ANAME');
        expect(result.data.customQueryWithAutoTypeReturn.type).toEqual('robot');
      });

      it('can resolve a custom extend type', async () => {
        const obj = new Parse.Object('SomeClass');
        await obj.save({ name: 'aname', type: 'robot' });
        await parseGraphQLServer.parseGraphQLSchema.schemaCache.clear();
        const result = await apolloClient.query({
          variables: { id: obj.id },
          query: gql`
            query someClass($id: ID!) {
              someClass(id: $id) {
                nameUpperCase
                language
                type
              }
            }
          `,
        });
        expect(result.data.someClass.nameUpperCase).toEqual('ANAME');
        expect(result.data.someClass.language).toEqual('fr');
        expect(result.data.someClass.type).toEqual('robot');

        const result2 = await apolloClient.query({
          variables: { id: obj.id },
          query: gql`
            query someClass($id: ID!) {
              someClass(id: $id) {
                name
                language
              }
            }
          `,
        });
        expect(result2.data.someClass.name).toEqual('aname');
        expect(result.data.someClass.language).toEqual('fr');
        const result3 = await apolloClient.mutate({
          variables: { id: obj.id, name: 'anewname', type: 'human' },
          mutation: gql`
            mutation someClass($id: ID!, $name: String!, $type: TypeEnum!) {
              updateSomeClass(input: { id: $id, fields: { name: $name, type: $type } }) {
                someClass {
                  nameUpperCase
                  type
                }
              }
            }
          `,
        });
        expect(result3.data.updateSomeClass.someClass.nameUpperCase).toEqual('ANEWNAME');
        expect(result3.data.updateSomeClass.someClass.type).toEqual('human');
      });
    });
    describe('Async Function Based Merge', () => {
      let httpServer;
      const headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Javascript-Key': 'test',
      };
      let apolloClient;

      beforeEach(async () => {
        if (!httpServer) {
          const expressApp = express();
          httpServer = http.createServer(expressApp);
          parseGraphQLServer = new ParseGraphQLServer(parseServer, {
            graphQLPath: '/graphql',
            graphQLCustomTypeDefs: ({ autoSchema, stitchSchemas }) =>
              stitchSchemas({ subschemas: [autoSchema] }),
          });

          parseGraphQLServer.applyGraphQL(expressApp);
          await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));
          const httpLink = createUploadLink({
            uri: 'http://localhost:13377/graphql',
            fetch,
            headers,
          });
          apolloClient = new ApolloClient({
            link: httpLink,
            cache: new InMemoryCache(),
            defaultOptions: {
              query: {
                fetchPolicy: 'no-cache',
              },
            },
          });
        }
      });

      afterAll(async () => {
        await httpServer.close();
      });

      it('can resolve a query', async () => {
        const result = await apolloClient.query({
          query: gql`
            query Health {
              health
            }
          `,
        });
        expect(result.data.health).toEqual(true);
      });
    });
  });
});
