import ConnectionBasedSync from './connectionbasedsync.js';

class WSSync extends ConnectionBasedSync  {
  constructor(sync, name, pre, post, relay, meta, value) {
    super(sync, name, pre, post, relay, meta, value);
    this.conn = undefined;
  }
  connect() {
    this.conn = new WebSocket(this.value);
    this.conn.onmessage = this.onmessage.bind(this);
    this.conn.onerror = this.onerror.bind(this);
    this.conn.onopen = this.opened.bind(this);
    this.conn.onclose = this.closed.bind(this);
  }
  onerror(err) {
    console.warn('WSSync websocket error', err);
  }
  onmessage(event) {
    console.log('WSSync got message', event.data);
    this.delivery(event.data);
  }
  deliver(resource, msg, preprocessed) {
    this.conn.send(preprocessed);
  }
}

export default WSSync;
