/* eslint-disable indent */
import { SubscriptionServer } from 'subscriptions-transport-ws-envelop';
import { useServer as useGraphQLWSServer } from 'graphql-ws/lib/use/ws';

function getPathname(path) {
  return path && new URL('http://_' + path).pathname;
}

export function handleWebSocketUpgrade(httpServer, path, wsTuple) {
  const wsServers = wsTuple[0] === 'all' ? wsTuple[2] : [wsTuple[1]];

  const state = {
    closing: false,
    wsServers,
  };

  httpServer.on('upgrade', (rawRequest, socket, head) => {
    const requestUrl = getPathname(rawRequest.url);

    if (state.closing || requestUrl !== path) {
      return wsServers[0].handleUpgrade(rawRequest, socket, head, webSocket => {
        webSocket.close(1001);
      });
    }

    switch (wsTuple[0]) {
      case 'all': {
        const server = wsTuple[1](rawRequest.headers['sec-websocket-protocol']);

        return server.handleUpgrade(rawRequest, socket, head, ws => {
          server.emit('connection', ws, rawRequest);
        });
      }
      case 'graphql-transport-ws':
      case 'legacy-graphql-ws': {
        const server = wsTuple[1];

        return server.handleUpgrade(rawRequest, socket, head, ws => {
          server.emit('connection', ws, rawRequest);
        });
      }
    }
  });
}

export function handleLegacySubscriptionsTransportWS(wsServer, getEnveloped, getSchema) {
  const { execute, subscribe, validate, parse, contextFactory } = getEnveloped();
  SubscriptionServer.create(
    {
      execute,
      subscribe,
      validate,
      parse,
      onOperation: async (_message, params, webSocket) => {
        const { schema } = await getSchema();
        const request = {
          info: webSocket.upgradeReq.info,
          config: webSocket.upgradeReq.config,
          auth: webSocket.upgradeReq.auth,
        };
        return Object.assign({}, params, { schema, context: await contextFactory({ request }) });
      },
    },
    wsServer
  );
}

export function handleGraphQLWS(wsServer, getEnveloped, getSchema) {
  const { execute, subscribe, validate, parse, contextFactory } = getEnveloped();
  useGraphQLWSServer(
    {
      execute,
      subscribe,
      async onOperation(
        { connectionParams, extra: { request: req, socket } },
        { payload: { operationName, query, variables } }
      ) {
        const request = {
          info: req.info,
          config: req.config,
          auth: req.auth,
        };
        const args = {
          schema: await getSchema(),
          operationName: operationName,
          document: parse(query),
          variableValues: variables,
          contextValue: await contextFactory({
            connectionParams,
            request,
            socket,
          }),
        };
        const errors = validate(args.schema, args.document);
        if (errors.length) return errors;
        return args;
      },
    },
    wsServer
  );
}
