/**
 * Redis Client with In-Memory Fallback
 *
 * If REDIS_URL is set  → uses ioredis (real Redis, works across PM2 workers & multiple servers)
 * If REDIS_URL is not set → uses a local in-memory mock (single-process, current behavior)
 *
 * Usage:
 *   const { getRedis, getPubClient, getSubClient, isRedisEnabled } = require('./redis');
 */

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || process.env.REDISURL;
const isRedisEnabled = !!redisUrl;

let _client = null;
let _pub    = null;
let _sub    = null;

// ─── In-memory event emitter mock (single-process fallback) ─────────────────
const { EventEmitter } = require('events');

class InMemoryRedisMock extends EventEmitter {
  constructor() {
    super();
    this._store = new Map();
    this._subscribers = new Map(); // channel → [callback]
    // Singleton shared store so pub & sub instances share data
    this._store = InMemoryRedisMock._sharedStore;
    this._subscribers = InMemoryRedisMock._sharedSubs;
  }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value) {
    this._store.set(key, { value, expireAt: null });
    return 'OK';
  }

  async setex(key, seconds, value) {
    this._store.set(key, { value, expireAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(key) {
    this._store.delete(key);
    return 1;
  }

  async hset(key, field, value) {
    if (!this._store.has(key)) this._store.set(key, { value: {}, expireAt: null });
    this._store.get(key).value[field] = value;
    return 1;
  }

  async hget(key, field) {
    const entry = this._store.get(key);
    return entry ? (entry.value[field] || null) : null;
  }

  async hgetall(key) {
    const entry = this._store.get(key);
    return entry ? entry.value : null;
  }

  async hdel(key, field) {
    const entry = this._store.get(key);
    if (entry) delete entry.value[field];
    return 1;
  }

  // Pub/Sub mock
  async publish(channel, message) {
    const subs = this._subscribers.get(channel) || [];
    subs.forEach(cb => cb(channel, message));
    return subs.length;
  }

  async subscribe(channel, callback) {
    if (!this._subscribers.has(channel)) this._subscribers.set(channel, []);
    this._subscribers.get(channel).push(callback);
  }

  duplicate() {
    return new InMemoryRedisMock();
  }

  on(event, cb) { super.on(event, cb); return this; }
  quit() { return Promise.resolve(); }
}

InMemoryRedisMock._sharedStore = new Map();
InMemoryRedisMock._sharedSubs  = new Map();

// ─── Initialise once ────────────────────────────────────────────────────────
function init() {
  if (_client) return;

  if (isRedisEnabled) {
    const Redis = require('ioredis');
    const opts = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };
    _client = new Redis(redisUrl, opts);
    _pub    = new Redis(redisUrl, opts);
    _sub    = new Redis(redisUrl, opts);

    _client.on('error', (err) => console.error('[Redis] Client error:', err.message));
    _pub.on('error',    (err) => console.error('[Redis] Pub error:',    err.message));
    _sub.on('error',    (err) => console.error('[Redis] Sub error:',    err.message));

    console.log('[Redis] Connected to Redis:', redisUrl.split('@').pop());
  } else {
    console.log('[Redis] REDIS_URL not set — using in-memory fallback (single-process mode)');
    _client = new InMemoryRedisMock();
    _pub    = new InMemoryRedisMock();
    _sub    = new InMemoryRedisMock();
  }
}

init();

module.exports = {
  getRedis:      () => _client,
  getPubClient:  () => _pub,
  getSubClient:  () => _sub,
  isRedisEnabled,
};
