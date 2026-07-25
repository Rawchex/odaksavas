const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';

// Persistent Data Directory (Useful for Railway Volumes)
const DATA_DIR = process.env.DATA_DIR || __dirname;

// VAPID keys setup
let vapidKeys;
const vapidPath = path.join(DATA_DIR, 'vapidKeys.json');
try {
  if (fs.existsSync(vapidPath)) {
    vapidKeys = require(vapidPath);
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys));
  }
} catch (e) {
  vapidKeys = webpush.generateVAPIDKeys();
}

webpush.setVapidDetails(
  'mailto:iletisim@odaksavasi.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const app = express();
app.set('trust proxy', 1); // Railway runs behind a proxy

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'odaksavas.db');
const db = new sqlite3.Database(DB_PATH);

// Safe DB Schema Migration for BLUNK features
db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN email TEXT", () => {});
});

global.partyVoiceStates = {};
global.partySignals = {};


// Multer security configuration
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'public', 'uploads');
// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({ 
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece .png, .jpg, .jpeg, .webp formatlarına izin verilir.'));
    }
  }
});

// Generic Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Limit each IP to 5000 requests per 15 mins (avoiding 429 during active polling)
  message: { error: 'Çok fazla istek gönderdiniz, lütfen daha sonra tekrar deneyin.' }
});

// Auth specific Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Limit each IP to 15 login/register requests per window
  message: { error: 'Çok fazla giriş denemesi, lütfen 15 dakika bekleyin.' }
});

app.use(limiter);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Anti-Caching Middleware for API routes to prevent user state leakage across proxies/CDN/browsers
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR)); // Explicitly serve uploads from persistent dir
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health Check endpoint for Railway / Uptime Monitor
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Process Error Safety (Prevent server crashes on unhandled errors)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER WARN] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER ERROR] Uncaught Exception:', err);
});

// Bulletproof route for default avatar in uploads directory
app.get('/uploads/default-avatar.png', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'default-avatar.png'));
});


// Database setup - apply full schema from schema.sql
const schemaPath = path.join(__dirname, '..', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema, err => {
    if (err) console.error('Schema apply error:', err.message);
    else console.log('Schema applied successfully');
  });
}

// Migration checks for existing databases
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS party_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    user_limit INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    allow_screen_share INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id)
  )`);

  db.run(`ALTER TABLE party_members ADD COLUMN channel_id INTEGER DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE party_members ADD COLUMN role VARCHAR DEFAULT 'member'`, () => {});
  db.run(`ALTER TABLE party_channels ADD COLUMN allow_screen_share INTEGER DEFAULT 0`, () => {});
});

// Database setup
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    bio TEXT,
    height INTEGER,
    weight INTEGER,
    cv TEXT,
    profile_photo TEXT,
    total_focus_time INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    start_time DATETIME,
    end_time DATETIME,
    duration INTEGER,
    status TEXT,
    party_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (party_id) REFERENCES parties(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER,
    name TEXT,
    is_private INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS party_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER,
    from_user_id INTEGER,
    to_user_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id),
    UNIQUE(party_id, to_user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS party_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER,
    user_id INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(party_id, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    friend_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    UNIQUE(user_id, post_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    comment_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    UNIQUE(user_id, comment_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    from_user_id INTEGER,
    post_id INTEGER,
    comment_id INTEGER,
    party_id INTEGER,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reposts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    UNIQUE(user_id, post_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  )`);

  // Add new columns to existing tables safely
  db.run('ALTER TABLE users ADD COLUMN password_hash TEXT', () => {});
  db.run('ALTER TABLE users ADD COLUMN last_seen DATETIME', () => {});
  db.run('ALTER TABLE users ADD COLUMN is_private INTEGER DEFAULT 0', () => {});
  db.run('ALTER TABLE messages ADD COLUMN parent_id INTEGER', () => {});
  db.run('ALTER TABLE messages ADD COLUMN group_id INTEGER', () => {}); // for group chats
  db.run('ALTER TABLE users ADD COLUMN status VARCHAR DEFAULT "online"', () => {});
  db.run('ALTER TABLE messages ADD COLUMN is_share INTEGER DEFAULT 0', () => {});
  db.run('ALTER TABLE parties ADD COLUMN invite_code TEXT', () => {
    // Fill empty invite codes for existing parties
    db.all('SELECT id FROM parties WHERE invite_code IS NULL OR invite_code = ""', (err, rows) => {
      if (rows && rows.length > 0) {
        rows.forEach(r => {
          const code = Array.from({length: 8}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
          db.run('UPDATE parties SET invite_code = ? WHERE id = ?', [code, r.id]);
        });
      }
    });
  });
  db.run('ALTER TABLE sessions ADD COLUMN party_id INTEGER', () => {});
  db.run('ALTER TABLE sessions ADD COLUMN feeling TEXT', () => {});
  db.run('ALTER TABLE sessions ADD COLUMN category TEXT', () => {});
  db.run('ALTER TABLE sessions ADD COLUMN activity TEXT', () => {});
  db.run('ALTER TABLE comments ADD COLUMN parent_id INTEGER', () => {});
  db.run('ALTER TABLE posts ADD COLUMN repost_of_post_id INTEGER', () => {});
  db.run('ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0', () => {});
  db.run('ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT \'desktop\'', () => {});

  // Performance: DB indexes for message queries
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(from_user_id, to_user_id, group_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(from_user_id, to_user_id, read)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id)');
  
  db.run(`CREATE TABLE IF NOT EXISTS chat_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS chat_group_members (
    group_id INTEGER,
    user_id INTEGER,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS party_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    user_id INTEGER,
    reaction TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subscription TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TRIGGER IF NOT EXISTS ignore_dnd_notifications
    BEFORE INSERT ON notifications
    FOR EACH ROW
    WHEN (SELECT status FROM users WHERE id = NEW.user_id) = 'dnd'
    BEGIN
      SELECT RAISE(IGNORE);
    END;
  `);

  db.run(`CREATE TABLE IF NOT EXISTS party_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    banned_by INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(party_id, user_id)
  )`);
});

// Periodic database cleanup for messages and party chats
function cleanupOldMessages() {
  db.run("DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE created_at < datetime('now', '-24 hours'))", (err) => {
    if (err) console.error('Error cleaning up message reactions:', err.message);
  });
  db.run("DELETE FROM messages WHERE created_at < datetime('now', '-24 hours')", (err) => {
    if (err) console.error('Error cleaning up messages:', err.message);
  });
  db.run("DELETE FROM party_messages WHERE created_at < datetime('now', '-6 hours')", (err) => {
    if (err) console.error('Error cleaning up party messages:', err.message);
  });
}
cleanupOldMessages();
setInterval(cleanupOldMessages, 60 * 1000); // Check every minute


// Auth middleware — JWT tabanlı
const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Giriş yapmalısın' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum' });
    db.get('SELECT * FROM users WHERE id = ?', [decoded.id], (err, user) => {
      if (err || !user) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
      req.user = user;
      next();
    });
  });
};

// --- PUSH NOTIFICATION HELPER ---
const sendPushNotification = (userId, payload) => {
  db.all('SELECT subscription FROM web_push_subscriptions WHERE user_id = ?', [userId], (err, rows) => {
    if (err || !rows || rows.length === 0) return;
    rows.forEach(row => {
      try {
        const sub = JSON.parse(row.subscription);
        webpush.sendNotification(sub, JSON.stringify(payload)).catch(e => {
          if (e.statusCode === 404 || e.statusCode === 410) {
            // Subscription has expired or is no longer valid
            db.run('DELETE FROM web_push_subscriptions WHERE subscription = ?', [row.subscription]);
          }
        });
      } catch(e) {}
    });
  });
};



const createAndPushNotification = (userId, type, fromUserId, options = {}) => {
  const { postId = null, commentId = null, partyId = null } = options;
  db.run(
    'INSERT INTO notifications (user_id, type, from_user_id, post_id, comment_id, party_id) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, type, fromUserId, postId, commentId, partyId],
    () => {
      let title = 'Yeni Bildirim';
      let body = 'Bir gelişme var.';
      if (type === 'post_like') { title = 'Beğeni'; body = 'Bir gönderin beğenildi.'; }
      else if (type === 'post_comment') { title = 'Yorum'; body = 'Gönderine yorum yapıldı.'; }
      else if (type === 'post_repost') { title = 'Repost'; body = 'Gönderin paylaşıldı.'; }
      else if (type === 'comment_like') { title = 'Beğeni'; body = 'Yorumun beğenildi.'; }
      else if (type === 'party_invite') { title = 'Odak Odası Daveti'; body = 'Bir odak odasına davet edildin!'; }
      else if (type === 'party_join') { title = 'Odak Odası'; body = 'Odaya biri katıldı.'; }
      else if (type === 'friend_request') { title = 'Arkadaşlık İsteği'; body = 'Sana bir arkadaşlık isteği geldi.'; }
      else if (type === 'friend_accept') { title = 'Arkadaşlık Onayı'; body = 'Arkadaşlık isteğin onaylandı.'; }
      else if (type === 'friend_activity_like') { title = 'Arkadaş Etkileşimi'; body = 'Arkadaşın bir gönderiyi beğendi.'; }
      else if (type === 'friend_activity_comment') { title = 'Arkadaş Etkileşimi'; body = 'Arkadaşın bir gönderiye yorum yaptı.'; }
      else if (type === 'message') { title = 'Yeni Mesaj'; body = 'Yeni bir mesajın var.'; }

      sendPushNotification(userId, { title, body, type, ...options });
    }
  );
};

const notifyFriends = (fromUserId, type, options = {}) => {
  db.all('SELECT friend_id FROM friendships WHERE user_id = ? AND status = "accepted"', [fromUserId], (err, friends) => {
    if (!friends) return;
    friends.forEach(f => {
      createAndPushNotification(f.friend_id, type, fromUserId, options);
    });
  });
};
// ─── AUTH ────────────────────────────────────────────────────

// Giriş: şifreli kullanıcı → bcrypt doğrula, şifresiz eski kullanıcı → geçişe izin ver
app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: 'Kullanıcı adı gerekli' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (!user) return res.status(400).json({ error: 'Kullanıcı bulunamadı', notFound: true });

    // Şifresi olan kullanıcı
    if (user.password_hash) {
      if (!password) return res.status(401).json({ error: 'Şifre gerekli', needPassword: true });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Yanlış şifre' });
    }
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'Lax' });
    // Keep username cookie for frontend compatibility during migration
    res.cookie('username', user.username, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'Lax' });
    
    res.json({ ...user, needsPassword: !user.password_hash });
  });
});

// Yeni kayıt (BLUNK Auth)
app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifreniz en az 6 karakter olmalıdır.' });
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!clean || clean.length < 3) return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalıdır.' });

  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  db.run('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', [clean, hash, cleanEmail], function(err) {
    if (err) {
      if (err.message && err.message.includes('email')) {
        return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanılıyor.' });
      }
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }
    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, user) => {
      if (err || !user) return res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu.' });
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'Lax' });
      res.cookie('username', clean, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'Lax' });
      const { password_hash, ...safeUser } = user;
      res.json(safeUser);
    });
  });
});

// Şifre oluştur / değiştir
app.post('/api/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı' });

  // Eski şifresi varsa doğrula
  if (req.user.password_hash) {
    if (!oldPassword) return res.status(400).json({ error: 'Eski şifre gerekli' });
    const ok = await bcrypt.compare(oldPassword, req.user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Eski şifre yanlış' });
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id], () => {
    res.json({ success: true });
  });
});

app.get('/api/me', auth, (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  res.json(safeUser);
});

// Arama endpoint'i (kullanıcı adında arama)
app.get('/api/search/users', auth, (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  
  const searchPattern = `%${q}%`;
  db.all(
    `SELECT id, username, profile_photo, level, xp, status 
     FROM users 
     WHERE username LIKE ? 
     LIMIT 10`,
    [searchPattern],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB hatası' });
      res.json(rows || []);
    }
  );
});

// Heartbeat — online/offline takibi için her 15sn'de çağrılır
app.patch('/api/me/heartbeat', auth, (req, res) => {
  db.run('UPDATE users SET last_seen = datetime("now") WHERE id = ?', [req.user.id], () => {
    res.json({ ok: true });
  });
});

// Instant offline signal on tab close / logout
app.post('/api/me/offline', auth, (req, res) => {
  db.run('UPDATE users SET last_seen = datetime("now", "-5 minutes") WHERE id = ?', [req.user.id], () => {
    res.json({ ok: true });
  });
});

// Cihaz tipi güncelle (mobile / desktop)
app.post('/api/me/device', auth, (req, res) => {
  const { device_type } = req.body;
  if (!['mobile', 'desktop'].includes(device_type)) {
    return res.status(400).json({ error: 'Geçersiz cihaz tipi' });
  }
  db.run('UPDATE users SET device_type = ? WHERE id = ?', [device_type, req.user.id], () => {
    res.json({ ok: true, device_type });
  });
});

// Belirli bir kullanıcının cihaz tipini getir
app.get('/api/user/:username/device', auth, (req, res) => {
  db.get('SELECT device_type, last_seen, status FROM users WHERE username = ?', [req.params.username], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ device_type: row.device_type || 'desktop', last_seen: row.last_seen, status: row.status || 'online' });
  });
});


app.patch('/api/me/status', auth, (req, res) => {
  const { status } = req.body;
  if (!['online', 'dnd', 'away', 'invisible'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum' });
  }
  db.run('UPDATE users SET status = ? WHERE id = ?', [status, req.user.id], () => {
    res.json({ success: true, status });
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', { path: '/', httpOnly: true, sameSite: 'Lax' });
  res.clearCookie('username', { path: '/', sameSite: 'Lax' });
  res.json({ success: true });
});

// Delete account and all user data
app.delete('/api/me', auth, (req, res) => {
  const { password, confirmText } = req.body;
  if (!password || confirmText !== 'ONAYLIYORUM') {
    return res.status(400).json({ error: 'Lütfen şifrenizi girin ve ONAYLIYORUM yazarak onaylayın.' });
  }

  // Get user to verify password
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'Sunucu hatası' });

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) return res.status(400).json({ error: 'Girdiğiniz şifre hatalı.' });

      db.serialize(() => {
        // Delete all related records
        db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM party_members WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', [req.user.id, req.user.id]);
        db.run('DELETE FROM posts WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM comments WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM comment_likes WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM notifications WHERE user_id = ? OR from_user_id = ?', [req.user.id, req.user.id]);
        db.run('DELETE FROM party_messages WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM party_bans WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM chat_group_members WHERE user_id = ?', [req.user.id]);
        db.run('DELETE FROM web_push_subscriptions WHERE user_id = ?', [req.user.id]);
        
        // Finally delete the user
        db.run('DELETE FROM users WHERE id = ?', [req.user.id], (err) => {
          if (err) return res.status(500).json({ error: 'Hesap silinirken hata oluştu.' });
          
          res.clearCookie('token');
          res.clearCookie('username');
          res.json({ success: true });
        });
      });
    });
  });
});


// Sessions
app.post('/api/sessions/start', auth, (req, res) => {
  const partyId = req.body.partyId || null;
  db.run('UPDATE sessions SET status = "abandoned", end_time = datetime("now") WHERE user_id = ? AND status = "active"', [req.user.id], () => {
    db.run('INSERT INTO sessions (user_id, start_time, status, party_id) VALUES (?, datetime("now"), "active", ?)', [req.user.id, partyId], function() {
      res.json({ sessionId: this.lastID });
    });
  });
});

app.post('/api/sessions/end/:id', auth, upload.none(), (req, res) => {
  const { id } = req.params;
  // Support both JSON body (normal stop) and FormData (sendBeacon on page close)
  const violation = req.body.violation === true || req.body.violation === 'true';
  
  // Strict check: Only query active sessions belonging to this user
  db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = "active"', [id, req.user.id], (err, session) => {
    if (!session) {
      return res.status(400).json({ error: 'Aktif bir seans bulunamadı veya seans zaten sonlandırılmış.' });
    }
    
    const now = new Date();
    const start = new Date(session.start_time.replace(' ', 'T') + 'Z');
    let rawDuration = Math.floor((now - start) / 1000);
    
    // Bounds checking: Prevent negative duration or absurdly high numbers (Cap at 12 hours = 43200s)
    if (isNaN(rawDuration) || rawDuration < 0) rawDuration = 0;
    const duration = Math.min(rawDuration, 43200);
    const status = violation ? 'violated' : 'completed';
    
    // Atomic Update: Only update if status is still 'active' (Race condition & multi-device double submission protection)
    db.run('UPDATE sessions SET end_time = datetime("now"), duration = ?, status = ? WHERE id = ? AND status = "active"', 
      [duration, status, id], 
      function(err) {
        if (err || this.changes === 0) {
          // If 0 rows updated, another concurrent request closed it micro-seconds ago!
          return res.status(400).json({ error: 'Seans zaten başka bir cihazdan kapatılmış.' });
        }

        if (duration >= 1) {
          if (!violation) {
            // 1 sec = 1 XP
            const baseXP = duration;
            
            // Bonuses: Every 60s (+5), Every 30 mins (+60), Every 1 hour (+360)
            const minBonus = Math.floor(duration / 60) * 5;
            const halfHourBonus = Math.floor(duration / 1800) * 60;
            const hourBonus = Math.floor(duration / 3600) * 360;
            
            const bonus = minBonus + halfHourBonus + hourBonus;
            const xpGained = baseXP + bonus;

            const newTotalXp = (req.user.xp || 0) + xpGained;
            const newLevel = Math.floor((1 + Math.sqrt(1 + 0.08 * newTotalXp)) / 2);
            const totalFocus = (req.user.total_focus_time || 0) + duration;
            
            db.run('UPDATE users SET xp = ?, level = ?, total_focus_time = ? WHERE id = ?', 
              [newTotalXp, newLevel, totalFocus, req.user.id], () => {
              res.json({ duration, xpGained, bonusGained: bonus, newLevel, status, total_focus_time: totalFocus });
            });
          } else {
            // Violated, update total_focus_time but no XP
            const totalFocus = (req.user.total_focus_time || 0) + duration;
            db.run('UPDATE users SET total_focus_time = ? WHERE id = ?', [totalFocus, req.user.id], () => {
              res.json({ duration, xpGained: 0, bonusGained: 0, newLevel: req.user.level, status, total_focus_time: totalFocus });
            });
          }
        } else {
          res.json({ duration, status, xpGained: 0, bonusGained: 0, total_focus_time: req.user.total_focus_time || 0 });
        }
    });
  });
});

app.get('/api/sessions/active', auth, (req, res) => {
  db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "active" ORDER BY start_time DESC LIMIT 1', [req.user.id], (err, session) => {
    res.json(session || null);
  });
});

app.get('/api/sessions/unrated', auth, (req, res) => {
  db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "completed" AND (feeling IS NULL OR category IS NULL OR activity IS NULL) ORDER BY end_time DESC LIMIT 1', [req.user.id], (err, session) => {
    res.json(session || null);
  });
});

app.post('/api/sessions/rate/:id', auth, (req, res) => {
  const { id } = req.params;
  const { feeling, category, activity } = req.body;
  db.run('UPDATE sessions SET feeling = ?, category = ?, activity = ? WHERE id = ? AND user_id = ?', 
    [feeling, category, activity, id, req.user.id], 
    function(err) {
      if (err) return res.status(500).json({ error: 'Değerlendirme kaydedilemedi' });
      res.json({ success: true });
    }
  );
});

app.get('/api/sessions/similar/:id', auth, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM sessions WHERE id = ?', [id], (err, session) => {
    if (err || !session || !session.category) return res.json([]);
    db.all(`
      SELECT DISTINCT u.username, u.profile_photo, s.activity, s.end_time 
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.category = ? AND s.user_id != ? AND s.status = 'completed'
      ORDER BY s.end_time DESC LIMIT 3
    `, [session.category, req.user.id], (err, rows) => {
      res.json(rows || []);
    });
  });
});

// Leaderboard
app.get('/api/leaderboard', auth, (req, res) => {
  db.all(`
    SELECT id, username, profile_photo, total_focus_time, level, xp, status,
      (last_seen IS NOT NULL AND last_seen > datetime('now', '-2 minutes')) as is_online 
    FROM users 
    ORDER BY total_focus_time DESC LIMIT 100
  `, (err, users) => {
    res.json(users || []);
  });
});

// Stats endpoint
app.get('/api/stats', auth, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM users', (err, r1) => {
    db.get('SELECT COUNT(*) as count FROM sessions WHERE status = "completed"', (err, r2) => {
      db.get('SELECT SUM(total_focus_time) as total FROM users', (err, r3) => {
        db.get('SELECT username, total_focus_time FROM users ORDER BY total_focus_time DESC LIMIT 1', (err, r4) => {
          res.json({
            totalUsers: r1?.count || 0,
            totalSessions: r2?.count || 0,
            totalFocusTime: r3?.total || 0,
            topUser: r4 || null
          });
        });
      });
    });
  });
});


// User search endpoint — MUST be before /:username
app.get('/api/users/search', auth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  db.all(
    `SELECT id, username, profile_photo, level, status,
       (last_seen IS NOT NULL AND last_seen > datetime('now', '-2 minutes')) as is_online 
     FROM users
     WHERE username LIKE ?
     ORDER BY username ASC LIMIT 10`,
    [`%${q}%`],
    (err, users) => res.json(users || [])
  );
});

// Profile
app.get('/api/users/:username', auth, (req, res) => {
  db.get(`
    SELECT u.*, 
      (u.last_seen IS NOT NULL AND u.last_seen > datetime('now', '-2 minutes')) as is_online 
    FROM users u 
    WHERE u.username = ?
  `, [req.params.username], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    
    // Find friendship relation first
    db.get(`
      SELECT * FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `, [req.user.id, user.id, user.id, req.user.id], (err, rel) => {
      let friendship = null;
      if (rel) {
        friendship = {
          status: rel.status,
          sender_id: rel.user_id,
          id: rel.id
        };
      }
      
      const isMe = req.user.id === user.id;
      const isFriend = friendship && friendship.status === 'accepted';
      const isLocked = user.is_private && !isMe && !isFriend;

      const getSessions = (cb) => {
        if (isLocked) return cb(null, []);
        db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY start_time DESC LIMIT 20', [user.id], cb);
      };

      const getPosts = (cb) => {
        if (isLocked) return cb(null, []);
        db.all(`
          SELECT p.*, u.username, u.profile_photo, u.level,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
            (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count
          FROM posts p
          JOIN users u ON p.user_id = u.id
          WHERE p.user_id = ? AND p.content NOT LIKE 'Repost: %'
          ORDER BY p.created_at DESC
        `, [user.id], cb);
      };

      const getReposts = (cb) => {
        if (isLocked) return cb(null, []);
        db.all(`
          SELECT p.*, u.username, u.profile_photo, u.level,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
            (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
            1 as user_reposted
          FROM reposts r
          JOIN posts p ON r.post_id = p.id
          JOIN users u ON p.user_id = u.id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
        `, [req.user.id, user.id], cb);
      };

      getSessions((err, sessions) => {
        getPosts((err, posts) => {
          getReposts((err, reposts) => {
            // Count friends (accepted)
            db.get('SELECT COUNT(*) as friend_count FROM friendships WHERE user_id = ? AND status = "accepted"', [user.id], (err, c1) => {
              // Count posts
              db.get('SELECT COUNT(*) as post_count FROM posts WHERE user_id = ?', [user.id], (err, c2) => {
                // Count reposts
                db.get('SELECT COUNT(*) as repost_count FROM reposts WHERE user_id = ?', [user.id], (err, c3) => {
                  // Count mutual friends
                  db.get(`
                    SELECT COUNT(*) as mutual_count FROM friendships f1
                    JOIN friendships f2 ON f1.friend_id = f2.friend_id
                    WHERE f1.user_id = ? AND f2.user_id = ? AND f1.status = "accepted" AND f2.status = "accepted"
                  `, [req.user.id, user.id], (err, c4) => {
                    
                    // Hide sensitive info if profile is locked
                    const finalBio = isLocked ? 'Bu hesap gizli.' : user.bio;
                    const finalHeight = isLocked ? null : user.height;
                    const finalWeight = isLocked ? null : user.weight;
                    const finalCv = isLocked ? null : user.cv;

                    const { password_hash, ...safeUser } = user;
                    res.json({
                      ...safeUser,
                      bio: finalBio,
                      height: finalHeight,
                      weight: finalWeight,
                      cv: finalCv,
                      sessions: sessions || [],
                      posts: posts || [],
                      reposts: reposts || [],
                      friend_count: c1?.friend_count || 0,
                      post_count: c2?.post_count || 0,
                      repost_count: c3?.repost_count || 0,
                      mutual_count: c4?.mutual_count || 0,
                      friendship,
                      is_locked: !!isLocked
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// GET a specific user's friend list (for profile followers/following view)
app.get('/api/users/:username/friends', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.all(`
      SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time
      FROM friendships f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'accepted'
      ORDER BY u.username ASC
    `, [user.id], (err, friends) => {
      res.json(friends || []);
    });
  });
});


app.put('/api/profile', auth, (req, res) => {
  const { bio, height, weight, cv, is_private } = req.body;
  if (bio && bio.length > 500) return res.status(400).json({ error: 'Biyografi çok uzun (Maks: 500 karakter)' });
  if (cv && cv.length > 3000) return res.status(400).json({ error: 'CV çok uzun (Maks: 3000 karakter)' });
  const isPrivateVal = is_private ? 1 : 0;
  db.run('UPDATE users SET bio = ?, height = ?, weight = ?, cv = ?, is_private = ? WHERE id = ?', 
    [bio, height, weight, cv, isPrivateVal, req.user.id], () => {
    res.json({ success: true });
  });
});


app.post('/api/profile/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  const photoPath = '/uploads/' + req.file.filename;
  db.run('UPDATE users SET profile_photo = ? WHERE id = ?', [photoPath, req.user.id], () => {
    res.json({ photoPath });
  });
});

// Feed & Posts - ALGORİTMALI SİSTEM
app.get('/api/feed/discover', auth, (req, res) => {
  db.all(`
    SELECT p.*, u.username, u.profile_photo, u.level,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
      (
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) * 2 + 
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) * 3 + 
        COALESCE(u.total_focus_time, 0) / 3600.0
      ) as score
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE datetime(p.created_at) > datetime('now', '-30 days')
    ORDER BY score DESC, p.created_at DESC
    LIMIT 80
  `, [req.user.id], (err, posts) => {
    if (err) console.error(err);
    res.json(posts || []);
  });
});

app.get('/api/feed/following', auth, (req, res) => {
  // TAKİP: Sadece arkadaşların postları
  db.all(`
    SELECT p.*, u.username, u.profile_photo, u.level,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id IN (
      SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
    )
    ORDER BY p.created_at DESC
    LIMIT 50
  `, [req.user.id, req.user.id], (err, posts) => {
    res.json(posts || []);
  });
});

app.get('/api/feed/trending', auth, (req, res) => {
  // TREND: Son 24 saatin en çok etkileşim alanları
  db.all(`
    SELECT p.*, u.username, u.profile_photo, u.level,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
      (
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) + 
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) * 2
      ) as engagement
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE datetime(p.created_at) > datetime('now', '-24 hours')
    ORDER BY engagement DESC, p.created_at DESC
    LIMIT 50
  `, [req.user.id], (err, posts) => {
    if (err) console.error(err);
    res.json(posts || []);
  });
});

app.post('/api/posts', auth, upload.single('image'), (req, res) => {
  const { content } = req.body;
  if (content && content.length > 2000) return res.status(400).json({ error: 'İçerik çok uzun (Maks: 2000 karakter)' });
  const image = req.file ? '/uploads/' + req.file.filename : null;
  
  db.run('INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)', [req.user.id, content, image], function(err) {
    if (err) {
      console.error('Post insertion failed:', err);
      return res.status(500).json({ error: 'Post kaydedilemedi' });
    }
    res.json({ postId: this.lastID });
  });
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  db.run('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [req.user.id, req.params.id], (err) => {
    if (err) {
      db.run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [req.user.id, req.params.id], () => {
        res.json({ success: true, unliked: true });
      });
    } else {
      db.get('SELECT user_id FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (post && post.user_id !== req.user.id) {
          createAndPushNotification(post.user_id, 'post_like', req.user.id, { postId: req.params.id });
          notifyFriends(req.user.id, 'friend_activity_like', { postId: req.params.id });
        }
      });
      res.json({ success: true });
    }
  });
});

app.post('/api/posts/:id/comment', auth, (req, res) => {
  const { content, parent_id } = req.body;
  db.run('INSERT INTO comments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)', [req.user.id, req.params.id, content, parent_id || null], function() {
    db.get('SELECT user_id FROM posts WHERE id = ?', [req.params.id], (err, post) => {
      if (parent_id) {
        db.get('SELECT user_id FROM comments WHERE id = ?', [parent_id], (err, parentComment) => {
          if (parentComment && parentComment.user_id !== req.user.id) {
            createAndPushNotification(parentComment.user_id, 'post_comment', req.user.id, { postId: req.params.id, commentId: this.lastID });
          }
        });
      } else {
        if (post && post.user_id !== req.user.id) {
          createAndPushNotification(post.user_id, 'post_comment', req.user.id, { postId: req.params.id, commentId: this.lastID });
          notifyFriends(req.user.id, 'friend_activity_comment', { postId: req.params.id, commentId: this.lastID });
        }
      }
    });
    res.json({ commentId: this.lastID });
  });
});

app.get('/api/posts/:id/comments', auth, (req, res) => {
  db.all(`
    SELECT c.*, COALESCE(u.username, 'silinmiş_kullanıcı') as username, COALESCE(u.profile_photo, '') as profile_photo,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as user_liked
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `, [req.user.id, req.params.id], (err, comments) => {
    res.json(comments || []);
  });
});

app.post('/api/posts/:id/repost', auth, (req, res) => {
  db.run('INSERT INTO reposts (user_id, post_id) VALUES (?, ?)', [req.user.id, req.params.id], (err) => {
    if (err) {
      res.status(400).json({ error: 'Zaten repost ettin' });
    } else {
      db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        db.run('INSERT INTO posts (user_id, content, image, repost_of_post_id) VALUES (?, ?, ?, ?)', [req.user.id, `Repost: ${post.content}`, post.image, req.params.id], () => {
          if (post.user_id !== req.user.id) {
            createAndPushNotification(post.user_id, 'post_repost', req.user.id, { postId: req.params.id });
          }
          res.json({ success: true });
        });
      });
    }
  });
});

app.delete('/api/posts/:id/repost', auth, (req, res) => {
  // Remove from reposts table
  db.run('DELETE FROM reposts WHERE user_id = ? AND post_id = ?', [req.user.id, req.params.id], (err) => {
    // Remove the generated repost post using repost_of_post_id
    db.run('DELETE FROM posts WHERE user_id = ? AND repost_of_post_id = ?', [req.user.id, req.params.id]);
    res.json({ success: true });
  });
});

// DELETE Post (IDOR Protected: Only post owner can delete)
app.delete('/api/posts/:id', auth, (req, res) => {
  const postId = req.params.id;
  db.get('SELECT user_id FROM posts WHERE id = ?', [postId], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı' });
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Bu gönderiyi silme yetkiniz yok' });
    }

    db.serialize(() => {
      db.run('DELETE FROM likes WHERE post_id = ?', [postId]);
      db.run('DELETE FROM comments WHERE post_id = ?', [postId]);
      db.run('DELETE FROM reposts WHERE post_id = ?', [postId]);
      db.run('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gönderi silinemedi' });
        res.json({ success: true });
      });
    });
  });
});

// DELETE Comment (IDOR Protected: Comment owner OR post owner can delete)
app.delete('/api/comments/:id', auth, (req, res) => {
  const commentId = req.params.id;
  db.get(`
    SELECT c.user_id as comment_owner, p.user_id as post_owner 
    FROM comments c 
    JOIN posts p ON c.post_id = p.id 
    WHERE c.id = ?
  `, [commentId], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Yorum bulunamadı' });
    if (row.comment_owner !== req.user.id && row.post_owner !== req.user.id) {
      return res.status(403).json({ error: 'Bu yorumu silme yetkiniz yok' });
    }

    db.serialize(() => {
      db.run('DELETE FROM comment_likes WHERE comment_id = ?', [commentId]);
      db.run('DELETE FROM comments WHERE id = ? OR parent_id = ?', [commentId, commentId], (err) => {
        if (err) return res.status(500).json({ error: 'Yorum silinemedi' });
        res.json({ success: true });
      });
    });
  });
});

app.post('/api/comments/:id/like', auth, (req, res) => {
  db.run('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)', [req.user.id, req.params.id], (err) => {
    if (err) {
      db.run('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?', [req.user.id, req.params.id], () => {
        res.json({ success: true, unliked: true });
      });
    } else {
      db.get('SELECT user_id, post_id FROM comments WHERE id = ?', [req.params.id], (err, comment) => {
        if (comment && comment.user_id !== req.user.id) {
          createAndPushNotification(comment.user_id, 'comment_like', req.user.id, { commentId: req.params.id, postId: comment.post_id });
        }
      });
      res.json({ success: true });
    }
  });
});

// Friends API
app.post('/api/friends/request/:username', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, friend) => {
    if (!friend) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (friend.id === req.user.id) return res.status(400).json({ error: 'Kendine istek gönderemezsin' });
    
    db.run('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, "pending")', [req.user.id, friend.id], (err) => {
      if (err) res.status(400).json({ error: 'Zaten istek gönderilmiş' });
      else {
        createAndPushNotification(friend.id, 'friend_request', req.user.id);
        res.json({ success: true });
      }
    });
  });
});

app.post('/api/friends/accept/:id', auth, (req, res) => {
  db.run('UPDATE friendships SET status = "accepted" WHERE id = ? AND friend_id = ?', [req.params.id, req.user.id], function() {
    if (this.changes > 0) {
      db.get('SELECT user_id FROM friendships WHERE id = ?', [req.params.id], (err, friendship) => {
        db.run('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, "accepted")', [req.user.id, friendship.user_id], () => {
          createAndPushNotification(friendship.user_id, 'friend_accept', req.user.id);
          res.json({ success: true });
        });
      });
    } else res.status(404).json({ error: 'İstek bulunamadı' });
  });
});

app.get('/api/friends', auth, (req, res) => {
  db.all(`SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time,
    (u.last_seen > datetime('now', '-2 minutes')) as is_online
    FROM friendships f JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = "accepted"`, [req.user.id], (err, friends) => {
    res.json(friends || []);
  });
});

app.get('/api/friends/requests', auth, (req, res) => {
  db.all(`SELECT f.id, u.username, u.profile_photo FROM friendships f
    JOIN users u ON f.user_id = u.id WHERE f.friend_id = ? AND f.status = "pending"`, [req.user.id], (err, requests) => {
    res.json(requests || []);
  });
});

// Reject a pending request OR remove an existing friend
app.delete('/api/friends/:id', auth, (req, res) => {
  db.get('SELECT * FROM friendships WHERE id = ?', [req.params.id], (err, f) => {
    if (!f) return res.status(404).json({ error: 'Bulunamadı' });
    // Only allow if requester is sender or recipient
    if (f.user_id !== req.user.id && f.friend_id !== req.user.id)
      return res.status(403).json({ error: 'Yetkisiz' });
    // Delete both directions
    db.run('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [f.user_id, f.friend_id, f.friend_id, f.user_id], () => {
      res.json({ success: true });
    });
  });
});

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Party API - YENİDEN: ÖZEL PARTİLER + DAVETLER
app.post('/api/parties', auth, (req, res) => {
  const { name, isPrivate } = req.body;
  const inviteCode = generateInviteCode();
  db.run('INSERT INTO parties (owner_id, name, is_private, invite_code) VALUES (?, ?, ?, ?)', 
    [req.user.id, name || 'Yeni Parti', isPrivate ? 1 : 0, inviteCode], function() {
    const partyId = this.lastID;
    db.run('INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, "owner")', [partyId, req.user.id], () => {
      res.json({ partyId, inviteCode });
    });
  });
});

// Davet Kodu İle Odaya Katılma
app.post('/api/parties/join-code', auth, (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'Davet kodu girilmelidir' });
  const cleanCode = code.trim();

  db.get('SELECT * FROM parties WHERE invite_code = ? OR id = ?', [cleanCode, parseInt(cleanCode) || 0], (err, party) => {
    if (!party) return res.status(404).json({ error: 'Geçersiz davet kodu veya oda bulunamadı' });

    // Ban check
    db.get('SELECT id FROM party_bans WHERE party_id = ? AND user_id = ?', [party.id, req.user.id], (err, ban) => {
      if (ban) return res.status(403).json({ error: 'Bu odaya girme yetkiniz yok (yasaklandınız)' });

      db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [party.id, req.user.id], (err) => {
        if (err && party.owner_id !== req.user.id) {
          return res.json({ success: true, partyId: party.id });
        }
        db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
          [party.id, `@${req.user.username} davet kodu ile odaya katıldı.`]);
        res.json({ success: true, partyId: party.id });
      });
    });
  });
});

// Davet Kodunu Sıfırlama / Yenileme
app.post('/api/parties/:id/regenerate-invite', auth, (req, res) => {
  const partyId = req.params.id;
  checkPartyManagementPermission(partyId, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Davet kodunu yenileme yetkiniz yok' });

    const newCode = generateInviteCode();
    db.run('UPDATE parties SET invite_code = ? WHERE id = ?', [newCode, partyId], () => {
      res.json({ success: true, inviteCode: newCode });
    });
  });
});

app.get('/api/parties', auth, (req, res) => {
  // Sadece public partiler VEYA üye olduğum özel partiler
  db.all(`
    SELECT p.*, u.username as owner_name,
      (SELECT COUNT(*) FROM party_members WHERE party_id = p.id) as member_count,
      (SELECT COUNT(*) FROM party_members WHERE party_id = p.id AND user_id = ?) as is_member
    FROM parties p 
    JOIN users u ON p.owner_id = u.id 
    WHERE p.is_private = 0 OR p.id IN (
      SELECT party_id FROM party_members WHERE user_id = ?
    )
    ORDER BY p.created_at DESC
  `, [req.user.id, req.user.id], (err, parties) => {
    res.json(parties || []);
  });
});

app.post('/api/parties/:id/invite', auth, (req, res) => {
  const { username } = req.body;
  
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    
    db.get('SELECT * FROM parties WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id], (err, party) => {
      if (!party) return res.status(403).json({ error: 'Sadece sahip davet edebilir' });
      
      db.run('INSERT INTO party_invites (party_id, from_user_id, to_user_id) VALUES (?, ?, ?)',
        [req.params.id, req.user.id, user.id], (err) => {
        if (err) return res.status(400).json({ error: 'Zaten davet edilmiş' });
        
        createAndPushNotification(user.id, 'party_invite', req.user.id, { partyId: req.params.id });
        res.json({ success: true });
      });
    });
  });
});

app.get('/api/parties/invites/pending', auth, (req, res) => {
  db.all(`
    SELECT pi.*, p.name as party_name, u.username as from_username
    FROM party_invites pi
    JOIN parties p ON pi.party_id = p.id
    JOIN users u ON pi.from_user_id = u.id
    WHERE pi.to_user_id = ? AND pi.status = 'pending'
  `, [req.user.id], (err, invites) => {
    res.json(invites || []);
  });
});

app.post('/api/parties/invites/:id/accept', auth, (req, res) => {
  db.get('SELECT * FROM party_invites WHERE id = ? AND to_user_id = ?', [req.params.id, req.user.id], (err, invite) => {
    if (!invite) return res.status(404).json({ error: 'Davet bulunamadı' });
    
    db.run('UPDATE party_invites SET status = "accepted" WHERE id = ?', [req.params.id], () => {
      db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [invite.party_id, req.user.id], () => {
        res.json({ success: true, partyId: invite.party_id });
      });
    });
  });
});

app.post('/api/parties/invites/:id/reject', auth, (req, res) => {
  db.run('UPDATE party_invites SET status = "rejected" WHERE id = ? AND to_user_id = ?', 
    [req.params.id, req.user.id], () => {
    res.json({ success: true });
  });
});

// Helper to check management permission (owner, admin, or moderator) in a party
function checkPartyManagementPermission(partyId, userId, callback) {
  db.get('SELECT owner_id FROM parties WHERE id = ?', [partyId], (err, party) => {
    if (!party) return callback(null, false, 'Parti bulunamadı');
    
    const isOwner = Boolean(party.owner_id && userId && (parseInt(party.owner_id) === parseInt(userId) || party.owner_id == userId));
    if (isOwner) {
      db.run('UPDATE party_members SET role = "owner" WHERE party_id = ? AND user_id = ? AND (role IS NULL OR role = "member")', [partyId, userId]);
      return callback(null, true, 'owner');
    }

    db.get('SELECT role FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, userId], (err, member) => {
      if (!member) return callback(null, false, 'Üye değilsiniz');
      const role = member ? (member.role || 'member') : 'member';
      const isAllowed = ['owner', 'admin', 'moderator'].includes(role);
      callback(null, isAllowed, role);
    });
  });
}

app.get('/api/parties/:id', auth, (req, res) => {
  const partyId = req.params.id;
  db.get('SELECT * FROM parties WHERE id = ?', [partyId], (err, party) => {
    if (!party) return res.status(404).json({ error: 'Parti bulunamadı' });
    
    db.get('SELECT username FROM users WHERE id = ?', [party.owner_id], (err, owner) => {
      // Ensure at least 1 default sub-channel exists
      db.all('SELECT * FROM party_channels WHERE party_id = ? ORDER BY position ASC, id ASC', [partyId], (err, channels) => {
        let channelList = channels || [];

        const fetchMembersAndRespond = (activeChannels) => {
          const defaultChannel = activeChannels.find(c => c.is_default) || activeChannels[0];
          const defaultChannelId = defaultChannel ? defaultChannel.id : null;

          db.all(`
            SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time, u.status,
              pm.channel_id,
              CASE WHEN u.id = ? THEN 'owner' ELSE COALESCE(pm.role, 'member') END as role,
              (u.last_seen > datetime('now', '-45 seconds')) as is_online,
              (SELECT id FROM sessions WHERE user_id = u.id AND status = 'active' LIMIT 1) as active_session_id,
              (SELECT start_time FROM sessions WHERE user_id = u.id AND status = 'active' LIMIT 1) as session_start,
              (SELECT COALESCE(SUM(duration), 0) FROM sessions WHERE user_id = u.id AND party_id = ? AND status = 'completed') as party_total_time
            FROM party_members pm 
            JOIN users u ON pm.user_id = u.id 
            WHERE pm.party_id = ? 
            ORDER BY party_total_time DESC
          `, [party.owner_id, partyId, partyId], (err, members) => {
            const formattedMembers = (members || []).map(m => ({
              ...m,
              channel_id: m.channel_id ? parseInt(m.channel_id) : defaultChannelId
            }));

            res.json({ 
              ...party, 
              owner_name: owner ? owner.username : 'Bilinmiyor',
              channels: activeChannels,
              default_channel_id: defaultChannelId,
              members: formattedMembers
            });
          });
        };

        if (channelList.length === 0) {
          db.run(
            'INSERT INTO party_channels (party_id, name, user_limit, position, is_default) VALUES (?, ?, 0, 0, 1)',
            [partyId, 'Genel Odak Odası'],
            function() {
              const newChanId = this.lastID;
              channelList = [{
                id: newChanId,
                party_id: parseInt(partyId),
                name: 'Genel Odak Odası',
                user_limit: 0,
                position: 0,
                is_default: 1
              }];
              fetchMembersAndRespond(channelList);
            }
          );
        } else {
          fetchMembersAndRespond(channelList);
        }
      });
    });
  });
});

// Rename party
app.put('/api/parties/:id/name', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Oda adı boş olamaz' });

  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Bu işlem için oda yönetici yetkisi gereklidir' });

    db.run('UPDATE parties SET name = ? WHERE id = ?', [name.trim(), req.params.id], () => {
      res.json({ success: true, name: name.trim() });
    });
  });
});

// Create sub-channel
app.post('/api/parties/:id/channels', auth, (req, res) => {
  const { name, userLimit, allowScreenShare } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Kanal adı boş olamaz' });

  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kanal oluşturma yetkiniz yok' });

    db.get('SELECT MAX(position) as maxPos FROM party_channels WHERE party_id = ?', [req.params.id], (err, row) => {
      const pos = (row && row.maxPos !== null) ? row.maxPos + 1 : 0;
      const limit = parseInt(userLimit) || 0;
      const screenShare = allowScreenShare ? 1 : 0;

      db.run(
        'INSERT INTO party_channels (party_id, name, user_limit, position, is_default, allow_screen_share) VALUES (?, ?, ?, ?, 0, ?)',
        [req.params.id, name.trim(), limit, pos, screenShare],
        function() {
          res.json({ success: true, channelId: this.lastID });
        }
      );
    });
  });
});

// Edit sub-channel
app.put('/api/parties/:id/channels/:channelId', auth, (req, res) => {
  const { name, userLimit, allowScreenShare } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Kanal adı boş olamaz' });

  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kanal düzenleme yetkiniz yok' });

    const limit = parseInt(userLimit) || 0;
    const screenShare = allowScreenShare ? 1 : 0;
    db.run(
      'UPDATE party_channels SET name = ?, user_limit = ?, allow_screen_share = ? WHERE id = ? AND party_id = ?',
      [name.trim(), limit, screenShare, req.params.channelId, req.params.id],
      () => {
        res.json({ success: true });
      }
    );
  });
});

// Delete sub-channel
app.delete('/api/parties/:id/channels/:channelId', auth, (req, res) => {
  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kanal silme yetkiniz yok' });

    db.get('SELECT * FROM party_channels WHERE id = ? AND party_id = ?', [req.params.channelId, req.params.id], (err, chan) => {
      if (!chan) return res.status(404).json({ error: 'Kanal bulunamadı' });
      if (chan.is_default) return res.status(400).json({ error: 'Varsayılan ana odak kanalı silinemez!' });

      // Find default channel
      db.get('SELECT id FROM party_channels WHERE party_id = ? AND is_default = 1 LIMIT 1', [req.params.id], (err, defChan) => {
        const fallbackChannelId = defChan ? defChan.id : null;

        // Move members to fallback channel
        db.run('UPDATE party_members SET channel_id = ? WHERE party_id = ? AND channel_id = ?', 
          [fallbackChannelId, req.params.id, req.params.channelId], () => {
          db.run('DELETE FROM party_channels WHERE id = ? AND party_id = ?', [req.params.channelId, req.params.id], () => {
            res.json({ success: true });
          });
        });
      });
    });
  });
});

// Reorder channels
app.put('/api/parties/:id/channels-reorder', auth, (req, res) => {
  const { channels } = req.body; // Array of { id, position }
  if (!Array.isArray(channels)) return res.status(400).json({ error: 'Geçersiz kanal sıralaması' });

  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kanal sıralama yetkiniz yok' });

    db.serialize(() => {
      channels.forEach(ch => {
        db.run('UPDATE party_channels SET position = ? WHERE id = ? AND party_id = ?', [ch.position, ch.id, req.params.id]);
      });
      res.json({ success: true });
    });
  });
});

// Helper to update memory voice state channelId
function updateMemoryVoiceChannel(partyId, userId, channelId) {
  try {
    if (global.partyVoiceStates && global.partyVoiceStates[partyId] && global.partyVoiceStates[partyId][userId]) {
      global.partyVoiceStates[partyId][userId].channelId = parseInt(channelId);
    }
  } catch(e){}
}

// Join sub-channel
app.post('/api/parties/:id/channels/:channelId/join', auth, (req, res) => {
  const partyId = req.params.id;
  const channelId = parseInt(req.params.channelId);

  db.get('SELECT * FROM party_channels WHERE id = ? AND party_id = ?', [channelId, partyId], (err, chan) => {
    if (!chan) return res.status(404).json({ error: 'Kanal bulunamadı' });

    // Check user limit if limit > 0
    db.get('SELECT COUNT(*) as currentCount FROM party_members WHERE party_id = ? AND channel_id = ? AND user_id != ?', 
      [partyId, channelId, req.user.id], (err, row) => {
      const currentCount = row ? row.currentCount : 0;
      if (chan.user_limit > 0 && currentCount >= chan.user_limit) {
        return res.status(400).json({ error: `Kanal dolu! Maksimum ${chan.user_limit} kişi katılabilir.` });
      }

      db.run('UPDATE party_members SET channel_id = ? WHERE party_id = ? AND user_id = ?', [channelId, partyId, req.user.id], () => {
        updateMemoryVoiceChannel(partyId, req.user.id, channelId);
        res.json({ success: true, channelId });
      });
    });
  });
});

// Move specific member to another channel (Drag & drop move by manager)
app.post('/api/parties/:id/members/:targetUserId/move', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { channelId } = req.body;

  checkPartyManagementPermission(partyId, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kullanıcı taşıma yetkiniz yok' });

    db.get('SELECT * FROM party_channels WHERE id = ? AND party_id = ?', [channelId, partyId], (err, chan) => {
      if (!chan) return res.status(404).json({ error: 'Hedef kanal bulunamadı' });

      db.run('UPDATE party_members SET channel_id = ? WHERE party_id = ? AND user_id = ?', [channelId, partyId, targetUserId], () => {
        updateMemoryVoiceChannel(partyId, targetUserId, channelId);
        res.json({ success: true, channelId, targetUserId });
      });
    });
  });
});

// Update member role (Owner / Admin granting Moderator/Admin role)
app.put('/api/parties/:id/members/:targetUserId/role', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { role } = req.body; // 'admin', 'moderator', 'member'

  const allowedRoles = ['admin', 'moderator', 'member'];
  if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Geçersiz rol' });

  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, requesterRole) => {
    if (!allowed || requesterRole === 'moderator') {
      return res.status(403).json({ error: 'Rol atamak için Kurucu veya Yönetici yetkisi gereklidir' });
    }

    db.run('UPDATE party_members SET role = ? WHERE party_id = ? AND user_id = ?', [role, partyId, targetUserId], () => {
      res.json({ success: true, role });
    });
  });
});

// Kick member from party
app.delete('/api/parties/:id/members/:targetUserId/kick', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);

  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, requesterRole) => {
    if (!allowed) return res.status(403).json({ error: 'Kullanıcı atma yetkiniz yok' });

    // Check target is not owner
    db.get('SELECT owner_id FROM parties WHERE id = ?', [partyId], (err, party) => {
      if (party && parseInt(party.owner_id) === targetUserId) {
        return res.status(403).json({ error: 'Kurucu atılamaz' });
      }
      // Moderators can only kick members, not admins
      if (requesterRole === 'moderator') {
        db.get('SELECT role FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], (err, tm) => {
          if (tm && ['admin', 'owner'].includes(tm.role)) {
            return res.status(403).json({ error: 'Bu kullanıcıyı atma yetkiniz yok' });
          }
          db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], () => {
            db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
              [partyId, `Bir üye odadan atıldı.`]);
            res.json({ success: true });
          });
        });
      } else {
        db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], () => {
          db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
            [partyId, `Bir üye odadan atıldı.`]);
          res.json({ success: true });
        });
      }
    });
  });
});

// Ban member from party
app.post('/api/parties/:id/members/:targetUserId/ban', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { reason } = req.body || {};

  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, requesterRole) => {
    if (!allowed || requesterRole === 'moderator') {
      return res.status(403).json({ error: 'Banlama için Kurucu veya Yönetici yetkisi gereklidir' });
    }
    db.get('SELECT owner_id FROM parties WHERE id = ?', [partyId], (err, party) => {
      if (party && parseInt(party.owner_id) === targetUserId) {
        return res.status(403).json({ error: 'Kurucu banlanamaz' });
      }
      // Insert ban record
      db.run('INSERT OR REPLACE INTO party_bans (party_id, user_id, banned_by, reason) VALUES (?, ?, ?, ?)',
        [partyId, targetUserId, req.user.id, reason || null], () => {
          // Remove from members
          db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], () => {
            db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
              [partyId, `Bir üye odadan yasaklandı.`]);
            res.json({ success: true });
          });
        });
    });
  });
});

app.get('/api/parties/:id/live-status', auth, (req, res) => {
  // Check if member
  db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    // Get members active sessions
    db.all(`
      SELECT user_id, start_time 
      FROM sessions 
      WHERE party_id = ? AND status = 'active'
    `, [req.params.id], (err, sessions) => {
    // Get last 50 messages
    db.all(`
      SELECT pm.*, u.username, u.profile_photo 
      FROM party_messages pm
      LEFT JOIN users u ON pm.user_id = u.id
      WHERE pm.party_id = ?
      ORDER BY pm.created_at ASC
      LIMIT 50
    `, [req.params.id], (err, messages) => {
      res.json({
        sessions: sessions || [],
        messages: messages || []
      });
    });
    });
  });
});

app.post('/api/parties/:id/messages', auth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Mesaj boş' });
  
  db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, content.trim()], function() {
        res.json({ success: true, messageId: this.lastID });
      });
  });
});

app.post('/api/parties/:id/join', auth, (req, res) => {
  db.get('SELECT * FROM parties WHERE id = ?', [req.params.id], (err, party) => {
    if (!party) return res.status(404).json({ error: 'Parti bulunamadı' });

    // Ban check
    db.get('SELECT id FROM party_bans WHERE party_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, ban) => {
      if (ban) return res.status(403).json({ error: 'Bu odaya girme yetkiniz yok (yasaklandınız)' });

      const isOwner = party.owner_id === req.user.id;

      // Özel parti ise davet veya kurucu kontrolü
      if (party.is_private && !isOwner) {
        db.get('SELECT * FROM party_invites WHERE party_id = ? AND to_user_id = ? AND (status = "accepted" OR status = "pending")',
          [req.params.id, req.user.id], (err, invite) => {
          if (!invite) return res.status(403).json({ error: 'Bu parti özel - davet gerekli' });

          // Auto accept pending invite on join
          db.run('UPDATE party_invites SET status = "accepted" WHERE id = ?', [invite.id]);

          db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id], (err) => {
            if (err) return res.status(400).json({ error: 'Zaten partidesin' });
            db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
              [req.params.id, `@${req.user.username} odaya katıldı.`]);
            res.json({ success: true });
          });
        });
      } else {
        db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id], (err) => {
          if (err && !isOwner) return res.status(400).json({ error: 'Zaten partidesin' });

          db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
            [req.params.id, `@${req.user.username} odaya katıldı.`]);

          if (party.owner_id !== req.user.id) {
            db.run('INSERT INTO notifications (user_id, type, from_user_id, party_id) VALUES (?, "party_join", ?, ?)',
              [party.owner_id, req.user.id, req.params.id]);
          }
          res.json({ success: true });
        });
      }
    });
  });
});

app.post('/api/parties/:id/leave', auth, (req, res) => {
  const partyId = req.params.id;
  db.get('SELECT owner_id FROM parties WHERE id = ?', [partyId], (err, party) => {
    if (!party) return res.status(404).json({ error: 'Parti bulunamadı' });
    
    if (party.owner_id === req.user.id) {
      db.serialize(() => {
        db.run('DELETE FROM party_members WHERE party_id = ?', [partyId]);
        db.run('DELETE FROM party_channels WHERE party_id = ?', [partyId]);
        db.run('DELETE FROM party_invites WHERE party_id = ?', [partyId]);
        db.run('DELETE FROM party_messages WHERE party_id = ?', [partyId]);
        db.run('DELETE FROM party_bans WHERE party_id = ?', [partyId]);
        db.run('DELETE FROM parties WHERE id = ?', [partyId], () => {
          if (global.partyVoiceStates) delete global.partyVoiceStates[partyId];
          res.json({ success: true, deleted: true });
        });
      });
    } else {
      db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], () => {
        db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
          [partyId, `@${req.user.username} odadan ayrıldı.`]);
        res.json({ success: true });
      });
    }
  });
});


// --- PARTY VOICE CHAT SIGNALING & STATE ENDPOINTS ---

app.post('/api/parties/:id/voice-state', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    
    // Check if requester is actual member of party
    db.get('SELECT id FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (err, member) => {
      if (!member) return res.status(403).json({ error: 'Oda üyesi değilsiniz' });

      const { micMuted, deafened, pingMs, channelId } = req.body;
      const userId = req.user.id;
      const username = req.user.username;

      if (!global.partyVoiceStates) global.partyVoiceStates = {};
      if (!global.partyVoiceStates[partyId]) {
        global.partyVoiceStates[partyId] = {};
      }

      // Update current user state
      global.partyVoiceStates[partyId][userId] = {
        username,
        micMuted: !!micMuted,
        deafened: !!deafened,
        channelId: channelId ? parseInt(channelId) : null,
        pingMs: parseInt(pingMs) || 0,
        lastSeen: Date.now()
      };

      // Cleanup users that haven't sent state in 15 seconds
      const now = Date.now();
      Object.keys(global.partyVoiceStates[partyId]).forEach(uid => {
        if (now - global.partyVoiceStates[partyId][uid].lastSeen > 15000) {
          delete global.partyVoiceStates[partyId][uid];
        }
      });

      res.json({ members: global.partyVoiceStates[partyId] });
    });
  } catch(e) {
    res.status(500).json({ error: 'Ses durumu güncellenemedi' });
  }
});

app.post('/api/parties/:id/voice-signal', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const { toUsername, signal } = req.body;
    const fromUsername = req.user.username;

    if (!global.partySignals) global.partySignals = {};
    if (!global.partySignals[partyId]) {
      global.partySignals[partyId] = [];
    }

    global.partySignals[partyId].push({
      fromUsername,
      toUsername,
      signal,
      timestamp: Date.now()
    });

    // Keep signal array clean - limit to last 200 items or delete signals older than 1 minute
    const now = Date.now();
    global.partySignals[partyId] = global.partySignals[partyId].filter(sig => now - sig.timestamp < 60000);

    res.json({ success: true });
  } catch (err) {
    console.error('[Server Voice] Error in /voice-signal:', err);
    res.status(500).json({ error: 'Voice signal post failed', details: err.message });
  }
});

app.get('/api/parties/:id/voice-signals', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const username = req.user.username;

    if (!global.partySignals || !global.partySignals[partyId]) {
      return res.json([]);
    }

    // Find signals addressed to current user
    const mySignals = global.partySignals[partyId].filter(sig => sig.toUsername === username);

    // Remove my signals from the main queue
    global.partySignals[partyId] = global.partySignals[partyId].filter(sig => sig.toUsername !== username);

    res.json(mySignals);
  } catch (err) {
    console.error('[Server Voice] Error in /voice-signals:', err);
    res.status(500).json({ error: 'Voice signals fetch failed', details: err.message });
  }
});

// (duplicate route removed - session start with partyId is handled above)

// --- SCREEN SHARE SIGNALING (reuses in-memory signal queue with type prefix) ---
global.partyScreenShareStates = {}; // partyId -> { username -> { sharing, channelId, ts } }

// Announce screen share start/stop
app.post('/api/parties/:id/screenshare-state', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const { sharing, channelId } = req.body;
    const username = req.user.username;

    // Verify membership
    db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (err, member) => {
      if (!member) return res.status(403).json({ error: 'Yetkisiz' });

      if (!global.partyScreenShareStates[partyId]) global.partyScreenShareStates[partyId] = {};

      if (sharing) {
        // Check if channel allows screen share (Managers always allowed, or if channel allows/is default)
        db.get('SELECT allow_screen_share, is_default FROM party_channels WHERE id = ? AND party_id = ?', [channelId, partyId], (err, chan) => {
          const isManager = ['owner', 'admin', 'moderator'].includes(member.role);
          const isAllowed = isManager || (chan && (chan.allow_screen_share || chan.is_default));
          if (!isAllowed) {
            return res.status(403).json({ error: 'Bu kanalda ekran paylaşımı kapalı' });
          }
          global.partyScreenShareStates[partyId][username] = { sharing: true, channelId: parseInt(channelId), ts: Date.now() };
          res.json({ success: true, allowed: true });
        });
      } else {
        delete global.partyScreenShareStates[partyId][username];
        res.json({ success: true, allowed: false });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active screen sharers in a party
app.get('/api/parties/:id/screenshare-state', auth, (req, res) => {
  const partyId = req.params.id;
  db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    const states = global.partyScreenShareStates[partyId] || {};
    // Cleanup stale (>30s)
    const now = Date.now();
    Object.keys(states).forEach(u => { if (now - states[u].ts > 30000) delete states[u]; });
    res.json(states);
  });
});

// Screen share WebRTC signal (reuses partySignals queue with ss_ prefix on type)
app.post('/api/parties/:id/screenshare-signal', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const { toUsername, signal } = req.body;
    const fromUsername = req.user.username;

    if (!global.partySignals) global.partySignals = {};
    if (!global.partySignals[partyId]) global.partySignals[partyId] = [];

    global.partySignals[partyId].push({
      fromUsername,
      toUsername,
      signal: { ...signal, _ssShare: true },
      timestamp: Date.now()
    });

    const now = Date.now();
    global.partySignals[partyId] = global.partySignals[partyId].filter(s => now - s.timestamp < 60000);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/notifications', auth, (req, res) => {
  db.all(`
    SELECT n.*, u.username, u.profile_photo,
      (SELECT content FROM posts WHERE id = n.post_id LIMIT 1) as post_content,
      (SELECT content FROM comments WHERE id = n.comment_id LIMIT 1) as comment_content,
      (SELECT name FROM parties WHERE id = n.party_id LIMIT 1) as party_name,
      (SELECT f.id FROM friendships f WHERE f.user_id = n.from_user_id AND f.friend_id = ? AND f.status = 'pending' LIMIT 1) as friendship_id
    FROM notifications n
    JOIN users u ON n.from_user_id = u.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 100
  `, [req.user.id, req.user.id], (err, notifications) => {
    res.json(notifications || []);
  });
});

app.get('/api/notifications/unread', auth, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0', [req.user.id], (err, result) => {
    res.json({ count: result?.count || 0 });
  });
});

app.post('/api/notifications/read', auth, (req, res) => {
  db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id], () => {
    res.json({ success: true });
  });
});

app.delete('/api/notifications/clear-all', auth, (req, res) => {
  db.run('DELETE FROM notifications WHERE user_id = ?', [req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Veritabanı hatası' });
    res.json({ success: true });
  });
});

app.delete('/api/notifications/:id', auth, (req, res) => {
  db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], () => {
    res.json({ success: true });
  });
});

// ============================================================
// DELETE POSTS & COMMENTS
// ============================================================
app.get('/api/posts/:id', auth, (req, res) => {
  // Increment view count dynamically
  db.run('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?', [req.params.id], () => {
    db.get(`
      SELECT p.*, u.username, u.profile_photo, u.level,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ?) as user_reposted
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `, [req.user.id, req.user.id, req.params.id], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Bulunamadı' });
    // Get likers (up to 5)
    db.all(`SELECT u.username, u.profile_photo FROM likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 5`, [req.params.id], (err, likers) => {
      // Get comments with author info
      db.all(`
        SELECT c.*, COALESCE(u.username, 'silinmiş_kullanıcı') as username, COALESCE(u.profile_photo, '') as profile_photo,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as user_liked
        FROM comments c LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? ORDER BY c.created_at ASC
      `, [req.user.id, req.params.id], (err, comments) => {
        res.json({ ...post, likers: likers || [], comments: comments || [] });
      });
    });
  });
  });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post bulunamadı' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.run('DELETE FROM posts WHERE id = ? OR repost_of_post_id = ?', [req.params.id, req.params.id], () => {
      db.run('DELETE FROM likes WHERE post_id = ? OR post_id IN (SELECT id FROM posts WHERE repost_of_post_id = ?)', [req.params.id, req.params.id]);
      db.run('DELETE FROM comments WHERE post_id = ? OR post_id IN (SELECT id FROM posts WHERE repost_of_post_id = ?)', [req.params.id, req.params.id]);
      db.run('DELETE FROM reposts WHERE post_id = ?', [req.params.id]);
      db.run('DELETE FROM notifications WHERE post_id = ?', [req.params.id]);
      res.json({ success: true });
    });
  });
});

app.put('/api/posts/:id', auth, (req, res) => {
  const { content } = req.body;
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post bulunamadı' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
    db.run('UPDATE posts SET content = ? WHERE id = ?', [content, req.params.id], () => {
      res.json({ success: true });
    });
  });
});

app.delete('/api/comments/:id', auth, (req, res) => {
  db.get(`
    SELECT c.*, p.user_id as post_owner_id 
    FROM comments c 
    JOIN posts p ON c.post_id = p.id 
    WHERE c.id = ?
  `, [req.params.id], (err, comment) => {
    if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı' });
    // Allow if commenter is the user OR if user is the post owner
    if (comment.user_id !== req.user.id && comment.post_owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Yetkisiz' });
    }
    
    db.run('DELETE FROM comments WHERE id = ?', [req.params.id], () => {
      db.run('DELETE FROM comment_likes WHERE comment_id = ?', [req.params.id]);
      db.run('DELETE FROM notifications WHERE comment_id = ?', [req.params.id]);
      res.json({ success: true });
    });
  });
});

// ============================================================
// DIRECT MESSAGES (DM) SYSTEM
// ============================================================
app.get('/api/messages/inbox', auth, (req, res) => {
  db.all(`
    SELECT 
      u.id as id,
      u.username,
      u.profile_photo,
      0 as is_group,
      (u.last_seen > datetime('now', '-2 minutes')) as is_online,
      m.content as last_message,
      m.created_at as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE from_user_id = u.id AND to_user_id = ? AND read = 0 AND group_id IS NULL) as unread_count
    FROM users u
    JOIN (
      SELECT 
        CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as partner_id,
        MAX(id) as max_id
      FROM messages
      WHERE (from_user_id = ? OR to_user_id = ?) AND group_id IS NULL
      GROUP BY partner_id
    ) chat ON u.id = chat.partner_id
    JOIN messages m ON m.id = chat.max_id
    
    UNION ALL
    
    SELECT
      g.id as id,
      g.name as username,
      NULL as profile_photo,
      1 as is_group,
      0 as is_online,
      m.content as last_message,
      m.created_at as last_message_time,
      0 as unread_count
    FROM chat_groups g
    JOIN chat_group_members cgm ON g.id = cgm.group_id
    LEFT JOIN (
      SELECT group_id, MAX(id) as max_id
      FROM messages
      WHERE group_id IS NOT NULL
      GROUP BY group_id
    ) chat ON g.id = chat.group_id
    LEFT JOIN messages m ON m.id = chat.max_id
    WHERE cgm.user_id = ?
    
    ORDER BY last_message_time DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id], (err, chats) => {
    res.json(chats || []);
  });
});


app.post('/api/messages/groups', auth, (req, res) => {
  const { name, users } = req.body; // users array of usernames
  if (!name || !users || !users.length) return res.status(400).json({ error: 'Grup adı ve üyeler gerekli' });
  
  db.run('INSERT INTO chat_groups (name, created_by) VALUES (?, ?)', [name, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Grup oluşturulamadı' });
    const groupId = this.lastID;
    
    // add creator
    db.run('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)', [groupId, req.user.id]);
    
    // add others
    users.forEach(u => {
      db.get('SELECT id FROM users WHERE username = ?', [u], (err, user) => {
        if (user) {
          db.run('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)', [groupId, user.id]);
        }
      });
    });
    res.json({ success: true, groupId });
  });
});

app.get('/api/messages/group/:id', auth, (req, res) => {
  // Yetki kontrolü (kullanıcı grupta mı)
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.all(`
      SELECT m.*, u.username as from_username, u.profile_photo as from_photo,
             pm.content as parent_content, pu.username as parent_from_username,
             (
               SELECT GROUP_CONCAT(mr.reaction || ':' || ru.username)
               FROM message_reactions mr
               JOIN users ru ON mr.user_id = ru.id
               WHERE mr.message_id = m.id
             ) as reactions
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      LEFT JOIN messages pm ON m.parent_id = pm.id
      LEFT JOIN users pu ON pm.from_user_id = pu.id
      WHERE m.group_id = ?
      ORDER BY m.created_at ASC LIMIT 100
    `, [req.params.id], (err, messages) => {
      res.json(messages || []);
    });
  });
});

app.get('/api/messages/group/:id/members', auth, (req, res) => {
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.all(`
      SELECT u.id, u.username, u.profile_photo, u.level
      FROM chat_group_members cgm
      JOIN users u ON cgm.user_id = u.id
      WHERE cgm.group_id = ?
      ORDER BY u.username ASC
    `, [req.params.id], (err, members) => {
      res.json(members || []);
    });
  });
});

app.post('/api/messages/group/:id', auth, (req, res) => {
  const { content, parentId, isShare } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Mesaj boş olamaz' });
  
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.run('INSERT INTO messages (from_user_id, to_user_id, content, parent_id, group_id, is_share) VALUES (?, 0, ?, ?, ?, ?)',
      [req.user.id, content.trim(), parentId || null, req.params.id, isShare ? 1 : 0], function() {
        res.json({ success: true, messageId: this.lastID });
      });
  });
});

app.get('/api/messages/:username', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.all(`
      SELECT m.*, u.username as from_username, u.profile_photo as from_photo,
             pm.content as parent_content, pu.username as parent_from_username,
             (
               SELECT GROUP_CONCAT(mr.reaction || ':' || ru.username)
               FROM message_reactions mr
               JOIN users ru ON mr.user_id = ru.id
               WHERE mr.message_id = m.id
             ) as reactions
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      LEFT JOIN messages pm ON m.parent_id = pm.id
      LEFT JOIN users pu ON pm.from_user_id = pu.id
      WHERE (m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?)
      ORDER BY m.created_at ASC LIMIT 100
    `, [req.user.id, targetUser.id, targetUser.id, req.user.id], (err, messages) => {
      res.json(messages || []);
    });
  });
});

app.post('/api/messages/:username', auth, (req, res) => {
  const { content, parentId, isShare } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Mesaj içeriği boş olamaz' });
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.run('INSERT INTO messages (from_user_id, to_user_id, content, parent_id, is_share) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, targetUser.id, content.trim(), parentId || null, isShare ? 1 : 0], function() {
        // Also create a notification of type "message"
        db.run('INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, "message", ?)',
          [targetUser.id, req.user.id]);
        res.json({ success: true, messageId: this.lastID });
      });
  });
});


app.post('/api/messages/:username/read', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.run('UPDATE messages SET read = 1 WHERE from_user_id = ? AND to_user_id = ?',
      [targetUser.id, req.user.id], () => {
        res.json({ success: true });
      });
  });
});

// MESSAGES & REACTION ACTIONS
app.post('/api/messages/:id/reactions', auth, (req, res) => {
  const { reaction } = req.body;
  const messageId = req.params.id;
  
  db.get('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, req.user.id], (err, row) => {
    if (row) {
      if (row.reaction === reaction) {
        db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, req.user.id], () => {
          res.json({ success: true, removed: true });
        });
      } else {
        db.run('UPDATE message_reactions SET reaction = ? WHERE message_id = ? AND user_id = ?', [reaction, messageId, req.user.id], () => {
          res.json({ success: true });
        });
      }
    } else {
      db.run('INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)', [messageId, req.user.id, reaction], () => {
        res.json({ success: true });
      });
    }
  });
});

app.delete('/api/messages/:id', auth, (req, res) => {
  const messageId = req.params.id;
  db.get('SELECT * FROM messages WHERE id = ?', [messageId], (err, msg) => {
    if (!msg) return res.status(404).json({ error: 'Mesaj bulunamadı' });
    if (msg.from_user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.run('DELETE FROM messages WHERE id = ?', [messageId], () => {
      db.run('DELETE FROM message_reactions WHERE message_id = ?', [messageId], () => {
        res.json({ success: true });
      });
    });
  });
});

// GROUP SETTINGS & MODERATION
app.put('/api/messages/groups/:id', auth, (req, res) => {
  const groupId = req.params.id;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Grup adı boş olamaz' });
  
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.run('UPDATE chat_groups SET name = ? WHERE id = ?', [name.trim(), groupId], () => {
      res.json({ success: true });
    });
  });
});

app.post('/api/messages/groups/:id/members', auth, (req, res) => {
  const groupId = req.params.id;
  const { username } = req.body;
  
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, targetUser) => {
      if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      
      db.run('INSERT OR IGNORE INTO chat_group_members (group_id, user_id) VALUES (?, ?)', [groupId, targetUser.id], () => {
        db.run('INSERT INTO messages (from_user_id, to_user_id, content, group_id) VALUES (0, 0, ?, ?)', 
          [`@${username} gruba katıldı.`, groupId], () => {
            res.json({ success: true });
          });
      });
    });
  });
});

app.delete('/api/messages/groups/:id/members/:userId', auth, (req, res) => {
  const groupId = req.params.id;
  const targetUserId = req.params.userId;
  
  db.get('SELECT * FROM chat_groups WHERE id = ?', [groupId], (err, group) => {
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
    
    db.get('SELECT username FROM users WHERE id = ?', [targetUserId], (err, targetUserObj) => {
      if (!targetUserObj) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      const targetUsername = targetUserObj.username;
      
      const isSelf = parseInt(targetUserId) === req.user.id;
      const isAdmin = group.created_by === req.user.id;
      
      if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: 'Yetkisiz' });
      }
      
      db.run('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?', [groupId, targetUserId], () => {
        const sysMsg = isSelf 
          ? `@${targetUsername} gruptan ayrıldı.` 
          : `@${targetUsername} gruptan çıkarıldı.`;
        db.run('INSERT INTO messages (from_user_id, to_user_id, content, group_id) VALUES (0, 0, ?, ?)', 
          [sysMsg, groupId], () => {
            res.json({ success: true });
          });
      });
    });
  });
});

app.get('/api/messages/group/:id/stats', auth, (req, res) => {
  const groupId = req.params.id;
  
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    db.get('SELECT g.*, u.username as creator_name FROM chat_groups g JOIN users u ON g.created_by = u.id WHERE g.id = ?', [groupId], (err, group) => {
      db.all(`
        SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time,
               (u.last_seen > datetime('now', '-2 minutes')) as is_online
        FROM chat_group_members cgm
        JOIN users u ON cgm.user_id = u.id
        WHERE cgm.group_id = ?
        ORDER BY u.total_focus_time DESC
      `, [groupId], (err, members) => {
        const totalFocus = (members || []).reduce((sum, m) => sum + (m.total_focus_time || 0), 0);
        res.json({
          group,
          members: members || [],
          totalFocusTime: totalFocus
        });
      });
    });
  });
});

app.get('/api/share/targets', auth, (req, res) => {
  db.all(`
    SELECT u.id, u.username, u.profile_photo, u.level, 0 as is_group,
      (
        SELECT COUNT(*) FROM messages 
        WHERE (from_user_id = ? AND to_user_id = u.id) OR (from_user_id = u.id AND to_user_id = ?)
      ) as chat_count,
      (
        SELECT COUNT(*) FROM messages 
        WHERE from_user_id = ? AND to_user_id = u.id AND is_share = 1
      ) as share_count,
      f.id as sort_id
    FROM friendships f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'accepted'
    
    UNION ALL
    
    SELECT g.id, g.name as username, NULL as profile_photo, NULL as level, 1 as is_group,
      (SELECT COUNT(*) FROM messages WHERE group_id = g.id) as chat_count,
      (SELECT COUNT(*) FROM messages WHERE group_id = g.id AND from_user_id = ? AND is_share = 1) as share_count,
      0 as sort_id
    FROM chat_groups g
    JOIN chat_group_members cgm ON g.id = cgm.group_id
    WHERE cgm.user_id = ?
    
    ORDER BY share_count DESC, chat_count DESC, sort_id DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id], (err, rows) => {
    res.json(rows || []);
  });
});


app.get('/api/messages/:id/reactions', auth, (req, res) => {
  db.all(`
    SELECT mr.reaction, u.username, u.profile_photo, u.level
    FROM message_reactions mr
    JOIN users u ON mr.user_id = u.id
    WHERE mr.message_id = ?
    ORDER BY mr.created_at DESC
  `, [req.params.id], (err, rows) => {
    res.json(rows || []);
  });
});

// --- WEB PUSH ENDPOINTS ---
app.get('/api/notifications/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

app.post('/api/notifications/subscribe', auth, (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Geçersiz abonelik' });
  }
  
  db.run('INSERT INTO web_push_subscriptions (user_id, subscription) VALUES (?, ?)', [req.user.id, JSON.stringify(subscription)], (err) => {
    if (err) return res.status(500).json({ error: 'Abonelik kaydedilemedi' });
    res.status(201).json({ success: true });
  });
});

app.get('/api/notifications/is-subscribed', auth, (req, res) => {
  db.get('SELECT count(*) as count FROM web_push_subscriptions WHERE user_id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Sorgu hatası' });
    res.json({ subscribed: (row && row.count > 0) });
  });
});

// ABANDONED SESSION CLEANUP & 24-HOUR AUTO-DELETE WORKER
setInterval(() => {
  // 1. Session cleanup
  db.run(`
    UPDATE sessions 
    SET status = 'abandoned', end_time = datetime('now')
    WHERE status = 'active' 
      AND user_id IN (
        SELECT id FROM users 
        WHERE last_seen IS NOT NULL 
          AND (strftime('%s', 'now') - strftime('%s', last_seen)) > 90
      )
  `);

  // 2. Delete ALL messages and party messages older than 24 hours (privacy/security retention)
  db.run(`
    DELETE FROM messages 
    WHERE created_at < datetime('now', '-24 hours')
  `);
  db.run(`
    DELETE FROM party_messages 
    WHERE created_at < datetime('now', '-24 hours')
  `);

  // 3. Delete posts older than 24 hours, along with their engagements
  db.all(`SELECT id FROM posts WHERE created_at < datetime('now', '-24 hours')`, (err, oldPosts) => {
    if (oldPosts && oldPosts.length > 0) {
      const ids = oldPosts.map(p => p.id).join(',');
      db.run(`DELETE FROM likes WHERE post_id IN (${ids})`);
      db.run(`DELETE FROM comments WHERE post_id IN (${ids})`);
      db.run(`DELETE FROM reposts WHERE post_id IN (${ids})`);
      db.run(`DELETE FROM posts WHERE id IN (${ids})`);
    }
  });
}, 30000);


const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  
  // Find local network IP
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }

  console.log('========================================');
  console.log('   ODAK SAVASI SERVER BASLATILDI');
  console.log('========================================');
  console.log('');
  console.log('   Local URL:   http://localhost:3000');
  console.log(`   Network URL: http://${localIp}:3000 (Ayni WiFi'dakiler icin)`);
  console.log('');
  console.log('   Sunucuyu durdurmak icin CTRL+C');
  console.log('========================================');
  console.log('');
});
