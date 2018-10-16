import { Resource, Sync } from 'tinylib/core';

class ConnectionBasedSync extends Sync {
  constructor(sync, name, pre, post, relay, meta, value) {
    super(sync, name, pre, post, relay, meta, value);
    this.outgoing = [];
    this.timeout = 2000;
    this.connected = false;
    this.reconnect_timeout = undefined;
    this.watch = {};
    this.relay = relay;
    if (!Array.isArray(this.relay)) {
      this.relay = [];
    }
    if (typeof this.connect !== 'function') {
      throw new Error('ConnectionBasedSyncs must implement connect');
    }
    if (typeof this.deliver !== 'function') {
      throw new Error('ConnectionBasedSyncs must implement deliver');
    }
    if (typeof this.resource_event !== 'function') {
      throw new Error('ConnectionBasedSyncs must implement resource_event');
    }
  }
  opened() {
    this.connected = true;
    if (this.reconnect_timeout !== undefined) {
      clearTimeout(this.reconnect_timeout);
    }
    this.process();
  }
  closed() {
    this.connected = false;
    this.reconnect_timeout = setTimeout(this._reconnect.bind(this),
      this.timeout);
  }
  _reconnect() {
    this.reconnect_timeout = undefined;
    this.connect();
  }
  delivery(data) {
    var resource = new Resource(this.relay, '', 'resource');
    this.runthrough(this.post, 'post', resource, data)
    .then(function(msg) {
      if (!this.should_process(msg)) {
        console.log('Won\'t process', msg);
        return;
      }
      console.log('Processing', msg);
      resource.name = msg.name;
      resource.meta.__type = msg.type;
      this.resource_event(resource, msg.method, msg);
    }.bind(this));
  }
  should_process(msg) {
    if (typeof msg.method === 'undefined' ||
        typeof msg.name === 'undefined') {
      return false;
    }
    return true;
  }
  resource_event(resource, method, msg) {
    if (typeof this['resource_event_' + method] === 'function') {
      this['resource_event_' + method](resource, msg);
    }
  }
  resource_event_get(resource, msg) {
    resource.oneshot(function(value, resource) {
      if (value === null || value === undefined) {
        return;
      }
      return this.preprocess(resource, value)
      .then(function(preprocessed) {
        this.send(resource, 'got', resource.name, {
          data: preprocessed
        });
      }.bind(this));
    }.bind(this));
    resource.query().catch(function(err) {
      console.warn(resource, err);
    }.bind(this));
  }
  resource_updated(resource, msg) {
    if (typeof msg.data === 'undefined' ||
        !(this.watch.hasOwnProperty(resource.meta.__type) &&
        this.watch[resource.meta.__type].hasOwnProperty(resource.name))) {
      return;
    }
    this.watch[resource.meta.__type][resource.name].onupdate(msg.data);
  }
  resource_event_got(resource, msg) {
    this.resource_updated(resource, msg);
  }
  resource_event_set(resource, msg) {
    this.resource_updated(resource, msg);
  }
  get(resource) {
    if (!this.watch.hasOwnProperty(resource.meta.__type)) {
      this.watch[resource.meta.__type] = {};
    }
    this.watch[resource.meta.__type][resource.name] = resource;
    var msg = {};
    return resource.pack(null)
    .then(function(packed) {
      this.send(resource, 'get', resource.name, packed);
    }.bind(this));
  }
  set(resource, value) {
    if (!this.watch.hasOwnProperty(resource.meta.__type)) {
      this.watch[resource.meta.__type] = {};
    }
    this.watch[resource.meta.__type][resource.name] = resource;
    return resource.pack(value)
    .then(function(packed) {
      this.send(resource, 'set', resource.name, packed);
      return resource;
    }.bind(this));
  }
  send(resource, method, name, msg) {
    if (typeof msg !== 'object') {
      msg = {};
    }
    msg.resource = resource;
    msg.method = method;
    msg.name = name;
    this.outgoing.push(msg);
    this.process();
  }
  process() {
    if (!this.connected) {
      return;
    }
    const outgoing_queue = this.outgoing.slice();
    this.outgoing = [];
    outgoing_queue.map(function(msg) {
      var resource = msg.resource;
      delete msg.resource;
      if (typeof resource === 'undefined') {
        throw new Error('msg resource is undefined');
      }
      this.runthrough(this.pre, 'pre', resource, msg)
      .then(function(preprocessed) {
        this.deliver(resource, msg, preprocessed);
      }.bind(this));
    }.bind(this));
  }
}

export default ConnectionBasedSync;
