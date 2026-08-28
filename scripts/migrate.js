// Run with: node --env-file=.env scripts/migrate.js
'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('../server/db');

console.log('[Migration] Starting database migration...');

// 1. Apply full schema (idempotent)
const schemaPath = path.join(__dirname, '..', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema, err => {
    if (err) console.error('[Migration] Schema apply error:', err.message);
    else     console.log('[Migration] Schema applied successfully');
  });
}

// 2. ALTER TABLE additions (all idempotent via callback ignore)
db.serialize(() => {

  // users
  const userCols = [
    `ALTER TABLE users ADD COLUMN password_hash TEXT`,
    `ALTER TABLE users ADD COLUMN last_seen DATETIME`,
    `ALTER TABLE users ADD COLUMN email TEXT`,
    `ALTER TABLE users ADD COLUMN google_id TEXT`,
    `ALTER TABLE users ADD COLUMN is_private INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT 'online'`,
    `ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT 'desktop'`,
    `ALTER TABLE users ADD COLUMN blunk_coins INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN has_premium_pass INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN birth_date TEXT`,
    `ALTER TABLE users ADD COLUMN equipped_banner TEXT`,
    `ALTER TABLE users ADD COLUMN equipped_theme TEXT`,
    `ALTER TABLE users ADD COLUMN equipped_emoji TEXT`,
  ];
  userCols.forEach(sql => db.run(sql, () => {}));

  // sessions
  const sessionCols = [
    `ALTER TABLE sessions ADD COLUMN mode TEXT`,
    `ALTER TABLE sessions ADD COLUMN target_duration INTEGER`,
    `ALTER TABLE sessions ADD COLUMN break_duration INTEGER`,
    `ALTER TABLE sessions ADD COLUMN note TEXT`,
    `ALTER TABLE sessions ADD COLUMN party_id INTEGER`,
    `ALTER TABLE sessions ADD COLUMN feeling TEXT`,
    `ALTER TABLE sessions ADD COLUMN category TEXT`,
    `ALTER TABLE sessions ADD COLUMN activity TEXT`,
    `ALTER TABLE sessions ADD COLUMN category_id INTEGER`,
    `ALTER TABLE sessions ADD COLUMN tag_id INTEGER`,
    `ALTER TABLE sessions ADD COLUMN pomo_state TEXT DEFAULT 'focusing'`,
    `ALTER TABLE sessions ADD COLUMN pomo_round INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN state_start_time DATETIME`,
    `ALTER TABLE sessions ADD COLUMN accumulated_duration INTEGER DEFAULT 0`,
  ];
  sessionCols.forEach(sql => db.run(sql, () => {}));

  // posts
  db.run(`ALTER TABLE posts ADD COLUMN repost_of_post_id INTEGER`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0`,    () => {});

  // comments
  db.run(`ALTER TABLE comments ADD COLUMN parent_id INTEGER`, () => {});

  // messages
  db.run(`ALTER TABLE messages ADD COLUMN parent_id INTEGER`,          () => {});
  db.run(`ALTER TABLE messages ADD COLUMN group_id INTEGER`,           () => {});
  db.run(`ALTER TABLE messages ADD COLUMN is_share INTEGER DEFAULT 0`, () => {});

  // chat_groups
  db.run(`ALTER TABLE chat_groups ADD COLUMN disappearing_hours INTEGER DEFAULT 24`, () => {});
  db.run(`ALTER TABLE chat_groups ADD COLUMN avatar TEXT`, () => {});

  // party_members
  db.run(`ALTER TABLE party_members ADD COLUMN channel_id INTEGER DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE party_members ADD COLUMN role VARCHAR DEFAULT 'member'`,   () => {});

  // party_channels
  db.run(`ALTER TABLE party_channels ADD COLUMN allow_screen_share INTEGER DEFAULT 0`, () => {});

  // orders
  db.run(`ALTER TABLE orders ADD COLUMN updated_at DATETIME DEFAULT (datetime('now'))`, () => {});

  // parties: invite_code + backfill
  db.run(`ALTER TABLE parties ADD COLUMN invite_code TEXT`, () => {
    db.all(`SELECT id FROM parties WHERE invite_code IS NULL OR invite_code = ''`, (err, rows) => {
      if (!rows) return;
      rows.forEach(r => {
        const code = Array.from({ length: 8 }, () =>
          'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]
        ).join('');
        db.run(`UPDATE parties SET invite_code = ? WHERE id = ?`, [code, r.id]);
      });
    });
  });

  // Data cleanup
  db.run(`UPDATE sessions SET category = TRIM(category), activity = TRIM(activity) WHERE category IS NOT NULL OR activity IS NOT NULL`, () => {});

  // Indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_messages_dm          ON messages(from_user_id, to_user_id, group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_read        ON messages(from_user_id, to_user_id, read)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_group       ON messages(group_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_created     ON messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id)`,
  ];
  indexes.forEach(sql => db.run(sql, () => {}));

  // DND trigger
  db.run(`
    CREATE TRIGGER IF NOT EXISTS ignore_dnd_notifications
      BEFORE INSERT ON notifications
      FOR EACH ROW
      WHEN (SELECT status FROM users WHERE id = NEW.user_id) = 'dnd'
      BEGIN SELECT RAISE(IGNORE); END;
  `);

  // Seed categories
  const cats = [
    ['Ders & Akademik',       'ders',            'fa-graduation-cap'],
    ['İş & Kariyer',          'is',              'fa-briefcase'],
    ['Yazılım & Teknoloji',   'yazilim',         'fa-code'],
    ['Okuma & Araştırma',     'okuma',           'fa-book-open'],
    ['Sanat & Tasarım',       'sanat-tasarim',   'fa-palette'],
    ['Dil Öğrenimi',          'dil',             'fa-language'],
    ['Hobi',                  'hobi',            'fa-gamepad'],
    ['KPSS Lisans',           'kpss-lisans',     'fa-file-signature'],
    ['KPSS Ön Lisans',        'kpss-on-lisans',  'fa-file-signature'],
    ['KPSS Ortaöğretim',      'kpss-ortaogretim','fa-file-signature'],
    ['KPSS Eğitim Bilimleri', 'kpss-egitim-oabt','fa-file-signature'],
    ['YKS & Lise',            'yks-lise',        'fa-school'],
    ['Ortaokul & LGS',        'ortaokul-lgs',    'fa-child'],
    ['Sağlık',                'saglik',           'fa-heartbeat'],
    ['Diğer',                 'diger',            'fa-cube'],
  ];
  cats.forEach(([name, slug, icon]) => {
    db.run(`INSERT OR IGNORE INTO categories (name, slug, icon) VALUES (?, ?, ?)`, [name, slug, icon]);
  });

});

setTimeout(() => {
  console.log('[Migration] All commands dispatched. Exiting.');
  process.exit(0);
}, 3000);