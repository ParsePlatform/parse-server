'use strict';
/* Tests for ParseServer.js */
const express = require('express');
const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const PostgresStorageAdapter = require('../lib/Adapters/Storage/Postgres/PostgresStorageAdapter')
  .default;
const GridFSBucketAdapter = require('../lib/Adapters/Files/GridFSBucketAdapter')
  .GridFSBucketAdapter;
const FSAdapter = require('@parse/fs-files-adapter');
const ParseServer = require('../lib/ParseServer').default;
const path = require('path');
const { spawn } = require('child_process');

describe('Server Url Checks', () => {
  let server;
  beforeEach(done => {
    if (!server) {
      const app = express();
      app.get('/health', function (req, res) {
        res.json({
          status: 'ok',
        });
      });
      server = app.listen(13376, undefined, done);
    } else {
      done();
    }
  });

  afterAll(done => {
    Parse.serverURL = 'http://localhost:8378/1';
    server.close(done);
  });

  it('validate good server url', done => {
    Parse.serverURL = 'http://localhost:13376';
    ParseServer.verifyServerUrl(async result => {
      if (!result) {
        done.fail('Did not pass valid url');
      }
      await reconfigureServer();
      done();
    });
  });

  it('mark bad server url', done => {
    spyOn(console, 'warn').and.callFake(() => {});
    Parse.serverURL = 'notavalidurl';
    ParseServer.verifyServerUrl(async result => {
      if (result) {
        done.fail('Did not mark invalid url');
      }
      await reconfigureServer();
      done();
    });
  });

  xit('handleShutdown, close connection', done => {
    const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
    const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';
    let databaseAdapter;
    if (process.env.PARSE_SERVER_TEST_DB === 'postgres') {
      databaseAdapter = new PostgresStorageAdapter({
        uri: process.env.PARSE_SERVER_TEST_DATABASE_URI || postgresURI,
        collectionPrefix: 'test_',
      });
    } else {
      databaseAdapter = new MongoStorageAdapter({
        uri: mongoURI,
        collectionPrefix: 'test_',
      });
    }
    let close = false;
    const newConfiguration = Object.assign({}, defaultConfiguration, {
      databaseAdapter,
      serverStartComplete: () => {
        let promise = Promise.resolve();
        if (process.env.PARSE_SERVER_TEST_DB !== 'postgres') {
          promise = parseServer.config.filesController.adapter._connect();
        }
        promise.then(() => {
          parseServer.handleShutdown();
          parseServer.server.close(err => {
            if (err) {
              done.fail('Close Server Error');
            }
            reconfigureServer({}).then(() => {
              expect(close).toBe(true);
              done();
            });
          });
        });
      },
      serverCloseComplete: () => {
        close = true;
      },
    });
    const parseServer = ParseServer.start(newConfiguration);
  });

  it('does not have unhandled promise rejection in the case of load error', done => {
    const parseServerProcess = spawn(path.resolve(__dirname, './support/FailingServer.js'));
    let stdout;
    let stderr;
    parseServerProcess.stdout.on('data', data => {
      stdout = data.toString();
    });
    parseServerProcess.stderr.on('data', data => {
      stderr = data.toString();
    });
    parseServerProcess.on('close', async code => {
      expect(code).toEqual(1);
      expect(stdout).not.toContain('UnhandledPromiseRejectionWarning');
      expect(stderr).toContain('MongoServerSelectionError');
      await reconfigureServer();
      done();
    });
  });
});

describe('Server Shutdown', () => {
  let quitSpy;
  let databaseAdapter;
  let filesAdapter;

  beforeEach(() => {
    // Mock redis
    quitSpy = jasmine.createSpy('quit'); // Called when connection is closed
    const createClient = jasmine.createSpy('createClient').and.returnValue({
      quit: quitSpy,
    });
    jasmine.mockLibrary('redis', 'createClient', createClient);

    const mongoURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
    const postgresURI = 'postgres://localhost:5432/parse_server_postgres_adapter_test_database';

    const isPostgres = process.env.PARSE_SERVER_TEST_DB === 'postgres';
    databaseAdapter = isPostgres
      ? new PostgresStorageAdapter({
        uri: process.env.PARSE_SERVER_TEST_DATABASE_URI || postgresURI,
        collectionPrefix: 'shutdown_',
      })
      : new MongoStorageAdapter({
        uri: mongoURI,
        collectionPrefix: 'shutdown_',
      });
    filesAdapter = isPostgres ? new FSAdapter() : new GridFSBucketAdapter(mongoURI);
  });

  it('should disconnect from Redis', async () => {
    const server = new ParseServer({
      appId: 'test',
      masterKey: 'test',
      databaseAdapter,
      filesAdapter,
      liveQuery: {
        redisURL: 'redis://127.0.0.1:6379', // Fake connection. URL is irrelevant
      },
    });

    await server.handleShutdown();

    expect(quitSpy).toHaveBeenCalled();
  });

  afterEach(function () {
    jasmine.restoreLibrary('redis', 'createClient');
  });
});
