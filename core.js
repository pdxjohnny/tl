class Resource {
  constructor(sync, name, typename, meta, value) {
    // Sync
    if (typeof sync !== 'object') {
      throw new Error('sync must be an array of Syncs');
    }
    this.sync = sync;
    // Name
    if (typeof name !== 'string') {
      throw new Error('name must be a string');
    }
    this.name = name;
    // Meta
    if (typeof meta !== 'object') {
      meta = {};
    }
    if (typeof typename !== 'string') {
      throw new Error('typename must be a string');
    }
    this.meta = meta;
    this.meta['__type'] = typename;
    // Value
    this.values = [];
    this.value = undefined;
    if (typeof value !== 'undefined') {
      this.value = value;
    }
    this.callbacks = [];
    this.bound = new Bound();
  }
  primarysyncget() {
    return this._syncget(this.sync.slice(0, 1));
  }
  syncget() {
    return this._syncget(this.sync);
  }
  _syncget(syncs) {
    return Promise.all(syncs.map(function(sync) {
      return sync.get(this)
      .then((function(sync) {
        return function(value) {
          if (value !== null && value !== undefined) {
            this.onupdate(value);
          }
          this.runcallbacks(value);
          return value;
        }.bind(this);
      }.bind(this))(sync));
    }.bind(this)));
  }
  onempty(callback) {
    if (typeof callback !== 'function') {
      throw new Error('callback must be function');
    }
    this.callbacks.push({
      callback: callback,
      empty: true,
      once: false
    });
  }
  register(callback) {
    if (typeof callback !== 'function') {
      throw new Error('callback must be function');
    }
    this.callbacks.push({
      callback: callback,
      once: false
    });
  }
  oneshot(callback) {
    if (typeof callback !== 'function') {
      throw new Error('callback must be function');
    }
    this.callbacks.push({
      callback: callback,
      once: true
    });
  }
  unregister(callback) {
    if (typeof callback !== 'function') {
      throw new Error('callback must be function');
    }
    var remove = -1;
    for (var i = 0; i < this.callbacks.length; ++i) {
      if (this.callbacks[i].callback === callback) {
        remove = i;
      }
    }
    if (remove !== -1) {
      this.callbacks.splice(remove, 1);
    }
  }
  queryPrimary() {
    return this.primarysyncget()
    .then(function(values) {
      if (values.length) {
        return values[0];
      }
      return null;
    }.bind(this));
  }
  query() {
    return this.syncget();
  }
  update(value) {
    if (typeof value === 'undefined') {
      throw new Error('update requires value');
    }
    if (typeof this.meta['__type'] === undefined) {
      throw new Error('update requires meta to contain __type');
    }
    return this._update(this.sync, value);
  }
  _update(syncs, value) {
    return Promise.race(syncs.map(function(sync) {
      return sync.set(this, value);
    }.bind(this)))
    .then(function() {
      this.value = value;
      this.runcallbacks(value);
      return this;
    }.bind(this));
  }
  onupdate(value) {
    return this.validateupdate(value)
    .then(function(value) {
      this.value = value;
      this.runcallbacks(value);
      return value;
    }.bind(this));
  }
  validateupdate(value) {
    return Promise.resolve(value);
  }
  runcallbacks(value) {
    var remove = [];
    for (var i in this.callbacks) {
      if ((typeof value !== 'undefined' && value !== null) ||
          (typeof this.callbacks[i].empty !== 'undefined' &&
          this.callbacks[i].empty === true)) {
        this.callbacks[i].callback(value, this);
      }
      if (typeof this.callbacks[i].once !== 'undefined' &&
          this.callbacks[i].once) {
        remove.push(i);
      }
    }
    for (var i = 0; i < remove.length; ++i) {
      this.callbacks.splice(remove[i], 1);
    }
  }
  pack(value) {
    return Promise.resolve({
      name: this.name,
      meta: this.meta,
      value: value
    });
  }
  unpack(packed) {
    if (packed === null) {
      return null;
    }
    if (typeof packed !== 'object') {
      throw new Error('packed must be object');
    }
    this.meta = packed.meta;
    return Promise.resolve(packed.value);
  }
  marshal(value) {
    return Promise.resolve(value);
  }
  unmarshal(value) {
    return Promise.resolve(value);
  }
  prestore(value) {
    return Promise.resolve(value);
  }
  poststore(value) {
    return Promise.resolve(value);
  }
}

class Sync extends Resource {
  // pre and post can be used to encrypt and decrypt data
  constructor(sync, name, pre, post, relay, meta, value) {
    super(sync, name, 'sync', meta, value);
    if (!Array.isArray(pre)) {
      throw new Error('pre must be an array of processors');
    }
    if (!Array.isArray(post)) {
      throw new Error('post must be an array of processors');
    }
    if (!Array.isArray(relay)) {
      relay = [];
    }
    this.pre = pre;
    this.post = post;
    this.relay = relay;
    this.watching = {};
  }
  preprocess(resource, value) {
    return resource.marshal(value)
    .then(function(value) {
      return this.runthrough(this.pre, 'pre', resource, value);
    }.bind(this))
    .then(function(preprocessed) {
      return resource.prestore(preprocessed);
    }.bind(this))
    .then(function(prestore) {
      return resource.pack(prestore);
    }.bind(this))
    .then(function(packed) {
      return this.runthrough(this.pre, 'pre', resource, packed);
    }.bind(this));
  }
  postprocess(resource, value) {
    return this.runthrough(this.post, 'post', resource, value)
    .then(function(packed) {
      return resource.unpack(packed);
    }.bind(this))
    .then(function(poststore) {
      return resource.poststore(poststore);
    }.bind(this))
    .then(function(poststore) {
      return this.runthrough(this.post, 'post', resource, poststore);
    }.bind(this))
    .then(function(value) {
      return resource.unmarshal(value);
    }.bind(this));
  }
  runthrough(array, func, resource, value) {
    return new Promise(function(resolve, reject) {
      var i = 0;
      var curr = value;
      if (curr === null || curr === undefined) {
        return resolve(null);
      }
      if (array.length < 1) {
        return resolve(curr);
      }
      var inc = function() {
        try {
          array[i][func](resource, curr).then(function(processed) {
            curr = processed;
            ++i;
            if (i < array.length) {
              setTimeout(inc, 0);
            } else {
              return resolve(curr);
            }
          }.bind(this)).catch(reject);
        } catch (err) {
          reject(err);
        }
      }.bind(this)
      setTimeout(inc, 0);
    }.bind(this));
  }
  get(resource) {
    return Promise.resolve(null);
  }
  set(resource, value) {
    return Promise.resolve(resource);
  }
}

class Bound {
  constructor() {
    this.bound = [];
  }
  method(method, bound_to) {
    for (var i = 0; i < this.bound; ++i) {
      if (this.bound[i][0] === method && this.bound[i][1] === bound_to) {
        return this.bound[i][2];
      }
    }
    var bound = method.bind(bound_to);
    this.bound.push([method, bound_to, bound]);
    return bound;
  }
}

// https://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    const formatValue = function(value) {
      if (typeof value === 'boolean') {
        if (value === true) {
          return 'yes';
        } else {
          return 'no';
        }
      }
      return value;
    }
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] !== 'undefined'
        ? formatValue(args[number])
        : match
      ;
    });
  };
}

class Dict extends Resource {
  constructor(sync, name, typename, subClass, meta, value) {
    super(sync, name, typename, meta, value);
    this.subClass = subClass;
    this.subvalue = {};
    if (typeof this.value !== 'array') {
      this.value = [];
    }
  }
  loadSubvalue() {
    var subvaluesLoading = [];
    for (var key in this.value) {
      subvaluesLoading.push(this._load_subvalue(this.value[key]));
    }
    return Promise.all(subvaluesLoading).then(function() {
      return this.subvalue;
    }.bind(this));
  }
  update(value, resource) {
    value = Array.from(new Set(value));
    if (typeof resource !== 'undefined') {
      this.subvalue[resource.name] = resource;
    }
    return super.update(value).then(function(resource) {
      return this.loadSubvalue().then(function() {
        return this;
      }.bind(this));
    }.bind(this));
  }
  queryPrimary() {
    return super.queryPrimary()
    .then(this.loadSubs.bind(this))
    .then(function() {
      this.runcallbacks(this.subvalue);
      return this.subvalue;
    }.bind(this));
  }
  query() {
    return super.query()
    .then(this.loadSubs.bind(this))
    .then(function() {
      this.runcallbacks(this.subvalue);
      return this.subvalue;
    }.bind(this));
  }
  loadSubs() {
    return this.loadSubvalue().then(function() {
      console.log('Subvalues Loaded', this.name, this.value, this.subvalue);
      return this;
    }.bind(this));
  }
  contains(key) {
    return Promise.resolve(this.value.includes(key));
  }
  add(key, resource) {
    if (key.length < 1) {
      return Promise.resolve(this);
    }
    var value = JSON.parse(JSON.stringify(this.value));
    value.push(key);
    console.log('Adding Subvalue', this.name, key, resource);
    return this.update(value, resource);
  }
  remove(key) {
    var index = this.value.indexOf(key);
    if (key.length < 1 || index == -1) {
      return Promise.resolve(this);
    }
    console.log('Removing Subvalue', this.name, key);
    if (typeof this.subvalue[key] !== 'undefined') {
      delete this.subvalue[key];
    }
    var value = JSON.parse(JSON.stringify(this.value));
    value.splice(index, 1);
    return this.update(value);
  }
  _load_subvalue(key, resource) {
    if (this.subvalue.hasOwnProperty(key)) {
      return Promise.resolve(this.subvalue[key]);
    }
    if (this.value.includes(key)) {
      resource = this.createSubvalue(key);
      return resource.query().then(function() {
        this.subvalue[resource.name] = resource;
        return resource;
      }.bind(this));
    }
    console.log(this.value, key);
    return Promise.reject(new Error('not subvalues'));
  }
  createSubvalue(key) {
    return new this.subClass(this.sync, key);
  }
}
class JSONProcessor {
  pre(resource, value) {
    return Promise.resolve(JSON.stringify(value));
  }
  post(resource, value) {
    return Promise.resolve(JSON.parse(value));
  }
}
class LocalStorageSync extends Sync {
  constructor(sync, name, pre, post, meta, value) {
    super(sync, name, pre, post, meta, value);
  }
  get(resource) {
    var value = localStorage.getItem(this.name + '.' + resource.name)
    return this.postprocess(resource, value);
  }
  set(resource, value) {
    return this.preprocess(resource, value)
    .then(function(preprocessed) {
      localStorage.setItem(this.name + '.' + resource.name, preprocessed);
      console.warn('LocalStorageSync.set', resource.name, preprocessed);
      return resource;
    }.bind(this));
  }
}

export {
  Resource,
  Sync,
  Bound,
  Dict,
  JSONProcessor,
  LocalStorageSync
};
