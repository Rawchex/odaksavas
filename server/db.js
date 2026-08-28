const path = require('path');
const fs = require('fs');

let db;
const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('[DB] Connecting to PostgreSQL...');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: parseInt(process.env.PG_POOL_SIZE) || 5,       // per worker; 4 workers = 20 total
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  // Query translation helper
  const translateSql = (sql) => {
    let translated = sql;

    // 1. Replace ? placeholders with $1, $2, $3...
    let count = 1;
    translated = translated.replace(/\?/g, () => `$${count++}`);

    // 2. Translate date functions
    translated = translated.replace(/datetime\(['"]now['"]\)/gi, 'CURRENT_TIMESTAMP');
    translated = translated.replace(/datetime\(['"]now['"]\s*,\s*['"]-(\d+)\s+(\w+)['"]\)/gi, (match, num, unit) => {
      return `CURRENT_TIMESTAMP - INTERVAL '${num} ${unit}'`;
    });
    translated = translated.replace(/datetime\(['"]now['"]\s*,\s*['"]\+(\d+)\s+(\w+)['"]\)/gi, (match, num, unit) => {
      return `CURRENT_TIMESTAMP + INTERVAL '${num} ${unit}'`;
    });
    translated = translated.replace(/datetime\(datetime\('now'\)\)/gi, 'CURRENT_TIMESTAMP');
    translated = translated.replace(/datetime\(p\.created_at\)/gi, 'p.created_at');

    // 3. SQLite specific replacements/ignores
    translated = translated.replace(/INSERT OR REPLACE INTO party_bans/gi, 'INSERT INTO party_bans');
    translated = translated.replace(/INSERT OR IGNORE INTO chat_group_members/gi, 'INSERT INTO chat_group_members');

    if (/INSERT INTO party_bans/i.test(translated) && !/ON CONFLICT/i.test(translated)) {
      translated += ' ON CONFLICT (party_id, user_id) DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason, created_at = CURRENT_TIMESTAMP';
    }
    if (/INSERT INTO chat_group_members/i.test(translated) && !/ON CONFLICT/i.test(translated)) {
      translated += ' ON CONFLICT (group_id, user_id) DO NOTHING';
    }

    // 4. Schema translations
    translated = translated.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    translated = translated.replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    translated = translated.replace(/DATETIME DEFAULT \(datetime\('now'\)\)/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    translated = translated.replace(/DATETIME/gi, 'TIMESTAMP');

    return translated;
  };

  db = {
    get: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      const query = translateSql(sql);
      pool.query(query, actualParams, (err, res) => {
        if (err) return actualCb(err);
        actualCb(null, res.rows[0] || null);
      });
    },

    all: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      const query = translateSql(sql);
      pool.query(query, actualParams, (err, res) => {
        if (err) return actualCb(err);
        actualCb(null, res.rows || []);
      });
    },

    run: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      let query = translateSql(sql);
      const isInsert = /^\s*insert\s+/i.test(sql);
      
      // Auto-append RETURNING id for inserts if not already returning
      if (isInsert && !/returning/i.test(query)) {
        query += ' RETURNING id';
      }

      pool.query(query, actualParams, function(err, res) {
        if (err) return actualCb(err);
        
        let lastID = null;
        if (isInsert && res.rows && res.rows[0]) {
          lastID = res.rows[0].id || null;
        }

        const context = {
          lastID: lastID,
          changes: res.rowCount
        };
        actualCb.call(context, null);
      });
    },

    exec: (sql, cb) => {
      const actualCb = cb || (() => {});
      const queries = sql
        .split(';')
        .map(q => q.trim())
        .filter(q => q.length > 0);

      const executeSequentially = (index) => {
        if (index >= queries.length) return actualCb(null);
        const q = translateSql(queries[index]);
        pool.query(q, (err) => {
          if (err) {
            // Swallow duplicate table/column errors in Postgres migrations
            if (err.code === '42P07' || err.code === '42701') {
              return executeSequentially(index + 1);
            }
            return actualCb(err);
          }
          executeSequentially(index + 1);
        });
      };

      executeSequentially(0);
    },

    serialize: (cb) => {
      cb();
    }
  };
} else {
  console.log('[DB] Connecting to SQLite...');
  const sqlite3 = require('sqlite3').verbose();
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname);
  const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'odaksavas.db');
  
  const sqliteDb = new sqlite3.Database(DB_PATH);

  // High Concurrency Optimizations for SQLite (WAL Mode + Timeout)
  sqliteDb.serialize(() => {
    sqliteDb.run('PRAGMA journal_mode = WAL;');
    sqliteDb.run('PRAGMA busy_timeout = 10000;');
    sqliteDb.run('PRAGMA synchronous = NORMAL;');
    sqliteDb.run('PRAGMA cache_size = -64000;'); // 64MB cache
    sqliteDb.run('PRAGMA temp_store = MEMORY;');
  });

  db = {
    get: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      sqliteDb.get(sql, actualParams, actualCb);
    },
    all: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      sqliteDb.all(sql, actualParams, actualCb);
    },
    run: (sql, params, cb) => {
      const { actualParams, actualCb } = parseArgs(params, cb);
      sqliteDb.run(sql, actualParams, actualCb);
    },
    exec: (sql, cb) => {
      sqliteDb.exec(sql, cb);
    },
    serialize: (cb) => {
      sqliteDb.serialize(cb);
    }
  };
}

function parseArgs(params, cb) {
  if (typeof params === 'function') {
    return { actualParams: [], actualCb: params };
  }
  return { actualParams: params || [], actualCb: cb || (() => {}) };
}

module.exports = db;
