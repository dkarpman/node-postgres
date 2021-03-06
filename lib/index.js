var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');
var pool = require(__dirname + '/pool');
var Connection = require(__dirname + '/connection');

var PG = function(clientConstructor) {
  EventEmitter.call(this);
  this.defaults = defaults;
  this.Client = pool.Client = clientConstructor;
  this.Query = this.Client.Query;
  this.pools = pool;
  this.Connection = Connection;
  this.types = require('pg-types');
  this.num_connections = 0;
  this.max_connections = this.defaults.max_connections;
};

util.inherits(PG, EventEmitter);

PG.prototype.end = function() {
  var self = this;
  var keys = Object.keys(self.pools.all);
  var count = keys.length;
  if(count === 0) {
    self.emit('end');
  } else {
    keys.forEach(function(key) {
      var pool = self.pools.all[key];
      delete self.pools.all[key];
      pool.drain(function() {
        pool.destroyAllNow(function() {
          count--;
          if(count === 0) {
            self.emit('end');
          }
        });
      });
    });
  }
};

PG.prototype.connect = function(config, callback) {
  if(typeof config == "function") {
    callback = config;
    config = null;
  }
  if(this.max_connections && this.num_connections >= this.max_connections) {
    return callback && callback(Error("Connection limit", this.max_connections, "reached"));
  }
  var client = new this.Client(config);
  // Max connections waiting to connect
  this.num_connections++;
  var _this = this;
  client.connect(function(err) {
    _this.num_connections--;
    if(err) {
      return callback && callback(err);
    }
    return callback && callback(null, client, function() {
      client.end();
    });
  });
};

// cancel the query runned by the given client
PG.prototype.cancel = function(config, client, query) {
  var c = config;
  //allow for no config to be passed
  if(typeof c === 'function') {
    c = defaults;
  }
  var cancellingClient = new this.Client(c);
  cancellingClient.cancel(client, query);
};

var forceNative = Object.prototype.hasOwnProperty.call(process.env, 'NODE_PG_FORCE_NATIVE');
if (forceNative) {
  module.exports = new PG(require(__dirname + '/native'));
} else {
  module.exports = new PG(Client);

  //lazy require native module...the native module may not have installed
  module.exports.__defineGetter__("native", function() {
    delete module.exports.native;
    module.exports.native = new PG(require(__dirname + '/native'));
    return module.exports.native;
  });
}
