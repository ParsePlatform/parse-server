<p align="center">
    <img alt="Parse Server" src="https://github.com/parse-community/parse-server/raw/master/.github/parse-server-logo.png" width="500">
  </a>
</p>

<p align="center">
  Parse Server is an open source backend that can be deployed to any infrastructure that can run Node.js.
</p>


<p align="center">
    <a href="https://twitter.com/intent/follow?screen_name=parseplatform"><img alt="Follow on Twitter" src="https://img.shields.io/twitter/follow/parseplatform?style=social&label=Follow"></a>
    <a href="https://github.com/parse-community/parse-server/actions?query=workflow%3Aci+branch%3Amaster">
      <img alt="Build status" src="https://github.com/parse-community/parse-server/workflows/ci/badge.svg?branch=master">
    </a>
    <a href="https://codecov.io/github/parse-community/parse-server?branch=master"><img alt="Coverage status" src="https://img.shields.io/codecov/c/github/parse-community/parse-server/master.svg"></a>
    <a href="https://www.npmjs.com/package/parse-server"><img alt="npm version" src="https://img.shields.io/npm/v/parse-server.svg?style=flat"></a>
    <a href="https://community.parseplatform.org/"><img alt="Join the conversation" src="https://img.shields.io/discourse/https/community.parseplatform.org/topics.svg"></a>
    <a href="https://snyk.io/test/github/parse-community/parse-server"><img alt="Snyk badge" src="https://snyk.io/test/github/parse-community/parse-server/badge.svg"></a>
</p>

<p align="center">
    <img alt="MongoDB 3.6" src="https://img.shields.io/badge/mongodb-3.6-green.svg?logo=mongodb&style=flat">
    <img alt="MongoDB 4.0" src="https://img.shields.io/badge/mongodb-4.0-green.svg?logo=mongodb&style=flat">
</p>

<h2 align="center">Our Sponsors</h2>
<p align="center">
    <p align="center">Our backers and sponsors help to ensure the quality and timely development of the Parse Platform.</p>
  <details align="center">
  <summary align="center"><b>🥉 Bronze Sponsors</b></summary>
  <a href="https://opencollective.com/parse-server/sponsor/0/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/0/avatar.svg"></a>
  </details>

</p>
<p align="center">
  <a href="#backers"><img alt="Backers on Open Collective" src="https://opencollective.com/parse-server/tiers/backers/badge.svg" /></a>
  <a href="#sponsors"><img alt="Sponsors on Open Collective" src="https://opencollective.com/parse-server/tiers/sponsors/badge.svg" /></a>
</p>
<br>

Parse Server works with the Express web application framework. It can be added to existing web applications, or run by itself.

The full documentation for Parse Server is available [here](https://docs.parseplatform.org/parse-server/guide/). An [API reference](http://parseplatform.org/parse-server/api/) and [Cloud Code guide](https://docs.parseplatform.org/cloudcode/guide/) are also available.

# Getting Started

The fastest and easiest way to get started is to run MongoDB and Parse Server locally.

## Running Parse Server

Before you start make sure you have installed:

- [NodeJS](https://www.npmjs.com/) that includes `npm`
- [MongoDB](https://www.mongodb.com/) or [PostgreSQL](https://www.postgresql.org/)(with [PostGIS](https://postgis.net) 2.2.0 or higher)
- Optionally [Docker](https://www.docker.com/)

### Locally
```bash
$ npm install -g parse-server mongodb-runner
$ mongodb-runner start
$ parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --databaseURI mongodb://localhost/test
```
***Note:*** *If installation with* `-g` *fails due to permission problems* (`npm ERR! code 'EACCES'`), *please refer to [this link](https://docs.npmjs.com/getting-started/fixing-npm-permissions).*


### Inside a Docker container

```bash
$ git clone https://github.com/parse-community/parse-server
$ cd parse-server
$ docker build --tag parse-server .
$ docker run --name my-mongo -d mongo
```

#### Running the Parse Server Image

```bash
$ docker run --name my-parse-server -v config-vol:/parse-server/config -p 1337:1337 --link my-mongo:mongo -d parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --databaseURI mongodb://mongo/test
```

***Note:*** *If you want to use [Cloud Code](https://docs.parseplatform.org/cloudcode/guide/) feature, please add `-v cloud-code-vol:/parse-server/cloud --cloud /parse-server/cloud/main.js` to command above. Make sure the `main.js` file is available in the `cloud-code-vol` directory before run this command. Otherwise, an error will occur.*

You can use any arbitrary string as your application id and master key. These will be used by your clients to authenticate with the Parse Server.

That's it! You are now running a standalone version of Parse Server on your machine.

**Using a remote MongoDB?** Pass the  `--databaseURI DATABASE_URI` parameter when starting `parse-server`. Learn more about configuring Parse Server [here](#configuration). For a full list of available options, run `parse-server --help`.

### Getting started with SDKs

Now that you're running Parse Server, it is time to save your first object. Parse Server has a broad range of [SDKs](http://parseplatform.org/#sdks) you can use to connect to your server.

- [Getting started with iOS](https://docs.parseplatform.org/ios/guide/#getting-started)
- [Getting started with Android](https://docs.parseplatform.org/android/guide/#getting-started)
- [Getting started with JavaScript](https://docs.parseplatform.org/js/guide/#getting-started)
- [Getting started with .NET + Xamarin](https://docs.parseplatform.org/dotnet/guide/#getting-started)
- [Getting started with macOS](https://docs.parseplatform.org/macos/guide/#getting-started)
- [Getting started with Unity](https://docs.parseplatform.org/unity/guide/#getting-started)
- [Getting started with PHP](https://docs.parseplatform.org/php/guide/#getting-started)
- [Getting started with Arduino](https://docs.parseplatform.org/arduino/guide/#getting-started)
- [Getting started with Embedded C](https://docs.parseplatform.org/embedded_c/guide/#getting-started)

### Connect your app to Parse Server

Parse provides SDKs for all the major platforms. Refer to the Parse Server guide to [learn how to connect your app to Parse Server](https://docs.parseplatform.org/parse-server/guide/#using-parse-sdks-with-parse-server).

## Running Parse Server elsewhere

Once you have a better understanding of how the project works, please refer to the [Parse Server wiki](https://github.com/parse-community/parse-server/wiki) for in-depth guides to deploy Parse Server to major infrastructure providers. Read on to learn more about additional ways of running Parse Server.

### Parse Server Sample Application

We have provided a basic [Node.js application](https://github.com/parse-community/parse-server-example) that uses the Parse Server module on Express and can be easily deployed to various infrastructure providers:

* [Heroku and mLab](https://devcenter.heroku.com/articles/deploying-a-parse-server-to-heroku)
* [AWS and Elastic Beanstalk](http://mobile.awsblog.com/post/TxCD57GZLM2JR/How-to-set-up-Parse-Server-on-AWS-using-AWS-Elastic-Beanstalk)
* [Google App Engine](https://medium.com/@justinbeckwith/deploying-parse-server-to-google-app-engine-6bc0b7451d50)
* [Microsoft Azure](https://azure.microsoft.com/en-us/blog/azure-welcomes-parse-developers/)
* [SashiDo](https://blog.sashido.io/tag/migration/)
* [Digital Ocean](https://www.digitalocean.com/community/tutorials/how-to-run-parse-server-on-ubuntu-14-04)
* [Pivotal Web Services](https://github.com/cf-platform-eng/pws-parse-server)
* [Back4app](http://blog.back4app.com/2016/03/01/quick-wizard-migration/)
* [Glitch](https://glitch.com/edit/#!/parse-server)
* [Flynn](https://flynn.io/blog/parse-apps-on-flynn)

### Parse Server + Express

You can also create an instance of Parse Server, and mount it on a new or existing Express website:

```js
const express = require('express');
const ParseServer = require('parse-server').ParseServer;
const app = express();

const api = new ParseServer({
  databaseURI: 'mongodb://localhost:27017/dev', // Connection string for your MongoDB database
  cloud: './cloud/main.js', // Path to your Cloud Code
  appId: 'myAppId',
  masterKey: 'myMasterKey', // Keep this key secret!
  fileKey: 'optionalFileKey',
  serverURL: 'http://localhost:1337/parse' // Don't forget to change to https if needed
});

// Serve the Parse API on the /parse URL prefix
app.use('/parse', api);

app.listen(1337, function() {
  console.log('parse-server-example running on port 1337.');
});
```

## Configuration

Parse Server can be configured using the following options. You may pass these as parameters when running a standalone `parse-server`, or by loading a configuration file in JSON format using `parse-server path/to/configuration.json`. If you're using Parse Server on Express, you may also pass these to the `ParseServer` object as options.

For the full list of available options, run `parse-server --help` or take a look at [Parse Server Configurations](http://parseplatform.org/parse-server/api/master/ParseServerOptions.html).

[For more information, check out our docs.](https://docs.parseplatform.org/parse-server/guide/#usage)



# Want to ride the bleeding edge?

It is recommend to use builds deployed npm for many reasons, but if you want to use
the latest not-yet-released version of parse-server, you can do so by depending
directly on this branch:

```
npm install parse-community/parse-server.git#master
```

## Experimenting

You can also use your own forks, and work in progress branches by specifying them:

```
npm install github:myUsername/parse-server#my-awesome-feature
```

And don't forget, if you plan to deploy it remotely, you should run `npm install` with the `--save` option.

# Contributing

We really want Parse to be yours, to see it grow and thrive in the open source community. Please see the [Contributing to Parse Server guide](CONTRIBUTING.md).

# Contributors

This project exists thanks to all the people who contribute... we'd love to see your face on this list!

<a href="../../graphs/contributors"><img src="https://opencollective.com/parse-server/contributors.svg?width=890&button=false" /></a>

# Sponsors

Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor!](https://opencollective.com/parse-server#sponsor)

<a href="https://opencollective.com/parse-server/sponsor/0/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/0/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/1/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/1/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/2/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/2/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/3/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/3/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/4/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/4/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/5/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/5/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/6/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/6/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/7/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/7/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/8/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/8/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/9/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/9/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/10/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/10/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/11/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/11/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/12/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/12/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/13/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/13/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/14/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/14/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/15/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/15/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/16/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/16/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/17/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/17/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/18/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/18/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/19/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/19/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/20/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/20/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/21/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/21/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/22/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/22/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/23/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/23/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/24/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/24/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/25/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/25/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/26/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/26/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/27/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/27/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/28/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/28/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/29/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/29/avatar.svg"></a>

# Backers

Support us with a monthly donation and help us continue our activities. [Become a backer!](https://opencollective.com/parse-server#backer)

<a href="https://opencollective.com/parse-server#backers" target="_blank"><img src="https://opencollective.com/parse-server/backers.svg?width=890" /></a>
