var BROWSER = process.env.browser;
var VERBOSE = process.env.VERBOSE;
var JENKINS = !!process.env.JENKINS_HOME;

if (BROWSER) {
  /* jshint browser: true */
  var es = window.elasticsearch;
} else {
  var es = require('../../../src/elasticsearch');
}

var _ = require('../../../src/lib/utils');
var path = require('path');
var fs = require('fs');
var async = require('async');
var fromRoot = _.bindKey(path, 'join', require('find-root')(__dirname));

// current client
var client = null;

// when set to a boolean, hold the test of a ping
var externalExists;

module.exports = {
  create: function create(apiVersion, port, cb) {
    // create a client and ping the server for up to 15 seconds
    doCreateClient({
      logConfig: null
    }, function () {
      var attemptsRemaining = 60;
      var timeout = 500;

      (function ping() {
        client.info({
          maxRetries: 0,
          requestTimeout: 100
        }, function (err, resp) {
          if (err && --attemptsRemaining) {
            setTimeout(ping, timeout);
          } else if (err) {
            cb(new Error('unable to establish contact with ES at ' + JSON.stringify({
              host: 'localhost',
              port: port,
              err: err
            })));
          } else if (resp.name !== 'elasticsearch_js_test_runner') {
            console.log(resp);
            cb(new Error('Almosted wiped out another es node. Shut-down all instances of ES and try again.'));
          } else {
            // create a new client
            doCreateClient(function () {
              cb(void 0, client);
            });
          }
        });
      }());
    });

    function doCreateClient(options, cb) {
      if (typeof options === 'function') {
        cb = options, options = {};
      }

      var logConfig = {};
      if (_.has(options, 'logConfig')) {
        logConfig = options.logConfig;
      } else {
        if (BROWSER) {
          logConfig.type = 'console';
        } else if (JENKINS || !VERBOSE) {
          logConfig.type = 'stdio';
        } else {
          logConfig.type = 'tracer';
        }

        logConfig.level = JENKINS || VERBOSE ? 'trace' : 'error';
      }

      if (logConfig && logConfig.type === 'tracer') {
        try {
          fs.unlinkSync(fromRoot('elasticsearch-tracer.log'));
        } catch (e) {}
      }

      // close existing client
      if (client) {
        client.close();
      }

      client = new es.Client({
        apiVersion: apiVersion,
        hosts: [
          {
            host: 'localhost',
            port: port
          }
        ],
        log: logConfig
      });

      client.clearEs = function (done) {
        async.parallel([
          function (done) {
            client.indices.delete({ index: '*', ignore: 404 }, done);
          },
          function (done) {
            client.indices.deleteTemplate({ name: '*', ignore: 404 }, done);
          }
        ], done);
      };

      _.nextTick(cb);
    }
  },
  get: function () {
    return client;
  }
};
