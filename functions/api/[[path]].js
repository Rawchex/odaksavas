import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';

const app = new Hono().basePath('/api');

// --- HELPER: VAPID KEYS SETUP ---
// Using env variables or fallback
const getVapidKeys = (env) => {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  }
  // Fallback keys (normally generated once)
  return {
    publicKey: env.VAPID_PUBLIC_KEY || "BEl69vlAD48O6m9eIM67ElY1TUy4rV218MbjYbpGP5N3B8z29D1bZ_VpHC7_3zFp-WqP9l-P8a9n1n3b8z29D1bZ",
    privateKey: env.VAPID_PRIVATE_KEY || "YOUR_PRIVATE_KEY_FALLBACK"
  };
};

// --- AUTH MIDDLEWARE ---
const authMiddleware = async (c, next) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ error: 'Giriş yapmalısın' }, 401);

  try {
    const jwtSecret = c.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';
    const decoded = await verify(token, jwtSecret);
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(decoded.id)
      .first();

    if (!user) return c.json({ error: 'Kullanıcı bulunamadı' }, 401);
    c.set('user', user);
    await next();
  } catch (err) {
    return c.json({ error: 'Geçersiz veya süresi dolmuş oturum' }, 401);
  }
};

// Helper to push notification
const createAndPushNotification = async (env, userId, type, fromUserId, options = {}) => {
  const { postId = null, commentId = null, partyId = null } = options;
  try {
    // Insert into DB
    const res = await env.DB.prepare(
      'INSERT INTO notifications (user_id, type, from_user_id, post_id, comment_id, party_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, type, fromUserId, postId, commentId, partyId).run();

    // Since webpush uses native Node.js crypto, we do a basic console log or simplified push here
    // as full native webpush from V8 Isolates needs Web Crypto wrapper.
    // In production Cloudflare Workers, we would send a push payload via Web Crypto.
  } catch (e) {
    console.error('Notification error:', e);
  }
};

const notifyFriends = async (env, fromUserId, type, options = {}) => {
  try {
    const { results } = await env.DB.prepare(
      'SELECT friend_id FROM friendships WHERE user_id = ? AND status = "accepted"'
    ).bind(fromUserId).all();

    if (results) {
      for (const f of results) {
        await createAndPushNotification(env, f.friend_id, type, fromUserId, options);
      }
    }
  } catch (e) {}
};

// --- ROUTES ---

// 1. Auth & Register
app.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username) return c.json({ error: 'Kullanıcı adı gerekli' }, 400);

  try {
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
      .bind(username.toLowerCase().trim())
      .first();

    if (!user) return c.json({ error: 'Kullanıcı bulunamadı', notFound: true }, 400);

    if (user.password_hash) {
      if (!password) return c.json({ error: 'Şifre gerekli', needPassword: true }, 401);
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return c.json({ error: 'Yanlış şifre' }, 401);
    }

    // Generate JWT
    const jwtSecret = c.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';
    const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 }, jwtSecret);

    setCookie(c, 'token', token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, path: '/', sameSite: 'Lax' });
    setCookie(c, 'username', user.username, { maxAge: 30 * 24 * 60 * 60, httpOnly: false, path: '/', sameSite: 'Lax' });
    return c.json({ ...user, needsPassword: !user.password_hash });
  } catch (e) {
    return c.json({ error: 'Giriş yapılamadı' }, 500);
  }
});

app.post('/register', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: 'Kullanıcı adı ve şifre gerekli' }, 400);
  if (password.length < 6) return c.json({ error: 'Şifre en az 6 karakter olmalı' }, 400);

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!clean) return c.json({ error: 'Geçersiz kullanıcı adı' }, 400);

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await c.env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .bind(clean, hash)
      .run();

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
      .bind(clean)
      .first();

    // Generate JWT
    const jwtSecret = c.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';
    const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 }, jwtSecret);

    setCookie(c, 'token', token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, path: '/', sameSite: 'Lax' });
    setCookie(c, 'username', clean, { maxAge: 30 * 24 * 60 * 60, httpOnly: false, path: '/', sameSite: 'Lax' });
    return c.json(user);
  } catch (e) {
    return c.json({ error: 'Bu kullanıcı adı zaten alınmış' }, 400);
  }
});

app.post('/change-password', authMiddleware, async (c) => {
  const user = c.get('user');
  const { oldPassword, newPassword } = await c.req.json();
  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'Yeni şifre en az 6 karakter olmalı' }, 400);
  }

  if (user.password_hash) {
    if (!oldPassword) return c.json({ error: 'Eski şifre gerekli' }, 400);
    const ok = await bcrypt.compare(oldPassword, user.password_hash);
    if (!ok) return c.json({ error: 'Eski şifre yanlış' }, 401);
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(hash, user.id)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Şifre güncellenemedi' }, 500);
  }
});

app.get('/me', authMiddleware, async (c) => {
  return c.json(c.get('user'));
});

app.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  deleteCookie(c, 'username', { path: '/' });
  return c.json({ success: true });
});

// 2. User & Profile
app.get('/search/users', authMiddleware, async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json([]);

  const searchPattern = `%${q}%`;
  const { results } = await c.env.DB.prepare(
    'SELECT id, username, profile_photo, level, xp, status FROM users WHERE username LIKE ? LIMIT 10'
  ).bind(searchPattern).all();

  return c.json(results || []);
});

app.patch('/me/heartbeat', authMiddleware, async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?")
    .bind(user.id)
    .run();
  return c.json({ ok: true });
});

app.post('/me/device', authMiddleware, async (c) => {
  const user = c.get('user');
  const { device_type } = await c.req.json();
  if (!['mobile', 'desktop'].includes(device_type)) {
    return c.json({ error: 'Geçersiz cihaz tipi' }, 400);
  }
  await c.env.DB.prepare('UPDATE users SET device_type = ? WHERE id = ?')
    .bind(device_type, user.id)
    .run();
  return c.json({ ok: true, device_type });
});

app.get('/user/:username/device', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const row = await c.env.DB.prepare('SELECT device_type, last_seen, status FROM users WHERE username = ?')
    .bind(username)
    .first();
  if (!row) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
  return c.json({
    device_type: row.device_type || 'desktop',
    last_seen: row.last_seen,
    status: row.status || 'online'
  });
});

app.patch('/me/status', authMiddleware, async (c) => {
  const user = c.get('user');
  const { status } = await c.req.json();
  if (!['online', 'dnd', 'away', 'invisible'].includes(status)) {
    return c.json({ error: 'Geçersiz durum' }, 400);
  }
  await c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?')
    .bind(status, user.id)
    .run();
  return c.json({ success: true, status });
});

app.get('/users/search', authMiddleware, async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json([]);
  const { results } = await c.env.DB.prepare(
    'SELECT id, username, profile_photo, level, status FROM users WHERE username LIKE ? ORDER BY username ASC LIMIT 10'
  ).bind(`%${q}%`).all();
  return c.json(results || []);
});

app.get('/users/:username', authMiddleware, async (c) => {
  const current_user = c.get('user');
  const target_username = c.req.param('username');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(target_username)
    .first();

  if (!user) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  const rel = await c.env.DB.prepare(`
    SELECT * FROM friendships 
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).bind(current_user.id, user.id, user.id, current_user.id).first();

  let friendship = null;
  if (rel) {
    friendship = {
      status: rel.status,
      sender_id: rel.user_id,
      id: rel.id
    };
  }

  const isMe = current_user.id === user.id;
  const isFriend = friendship && friendship.status === 'accepted';
  const isLocked = user.is_private && !isMe && !isFriend;

  let sessions = [];
  let posts = [];
  let reposts = [];

  if (!isLocked) {
    const s_res = await c.env.DB.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY start_time DESC LIMIT 20')
      .bind(user.id).all();
    sessions = s_res.results || [];

    const p_res = await c.env.DB.prepare(`
      SELECT p.*, u.username, u.profile_photo, u.level,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ? AND p.content NOT LIKE 'Repost: %'
      ORDER BY p.created_at DESC
    `).bind(user.id).all();
    posts = p_res.results || [];

    const r_res = await c.env.DB.prepare(`
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
    `).bind(current_user.id, user.id).all();
    reposts = r_res.results || [];
  }

  const c1 = await c.env.DB.prepare('SELECT COUNT(*) as friend_count FROM friendships WHERE user_id = ? AND status = "accepted"').bind(user.id).first();
  const c2 = await c.env.DB.prepare('SELECT COUNT(*) as post_count FROM posts WHERE user_id = ?').bind(user.id).first();
  const c3 = await c.env.DB.prepare('SELECT COUNT(*) as repost_count FROM reposts WHERE user_id = ?').bind(user.id).first();
  const c4 = await c.env.DB.prepare(`
    SELECT COUNT(*) as mutual_count FROM friendships f1
    JOIN friendships f2 ON f1.friend_id = f2.friend_id
    WHERE f1.user_id = ? AND f2.user_id = ? AND f1.status = "accepted" AND f2.status = "accepted"
  `).bind(current_user.id, user.id).first();

  const finalBio = isLocked ? 'Bu hesap gizli.' : user.bio;
  const finalHeight = isLocked ? null : user.height;
  const finalWeight = isLocked ? null : user.weight;
  const finalCv = isLocked ? null : user.cv;

  return c.json({
    ...user,
    bio: finalBio,
    height: finalHeight,
    weight: finalWeight,
    cv: finalCv,
    sessions,
    posts,
    reposts,
    friend_count: c1?.friend_count || 0,
    post_count: c2?.post_count || 0,
    repost_count: c3?.repost_count || 0,
    mutual_count: c4?.mutual_count || 0,
    friendship,
    is_locked: !!isLocked
  });
});

app.get('/users/:username/friends', authMiddleware, async (c) => {
  const target_username = c.req.param('username');
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(target_username).first();
  if (!user) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time
    FROM friendships f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'accepted'
    ORDER BY u.username ASC
  `).bind(user.id).all();
  return c.json(results || []);
});

app.put('/profile', authMiddleware, async (c) => {
  const user = c.get('user');
  const { bio, height, weight, cv, is_private } = await c.req.json();
  if (bio && bio.length > 500) return c.json({ error: 'Biyografi çok uzun (Maks: 500 karakter)' }, 400);
  if (cv && cv.length > 3000) return c.json({ error: 'CV çok uzun (Maks: 3000 karakter)' }, 400);
  const isPrivateVal = is_private ? 1 : 0;

  await c.env.DB.prepare('UPDATE users SET bio = ?, height = ?, weight = ?, cv = ?, is_private = ? WHERE id = ?')
    .bind(bio, height, weight, cv, isPrivateVal, user.id)
    .run();
  return c.json({ success: true });
});

// Profile photo upload to Cloudflare R2
app.post('/profile/photo', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body.photo;
  if (!file) return c.json({ error: 'Dosya yok' }, 400);

  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'Dosya boyutu 5 MB\'tan büyük olamaz' }, 400);
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Sadece JPG, PNG ve WebP formatları yüklenebilir' }, 400);
  }

  const filename = `avatar-${user.id}-${Date.now()}-${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  if (c.env.BUCKET) {
    await c.env.BUCKET.put(filename, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });
    const photoPath = `/api/uploads/${filename}`;
    await c.env.DB.prepare('UPDATE users SET profile_photo = ? WHERE id = ?')
      .bind(photoPath, user.id)
      .run();
    return c.json({ photoPath });
  } else {
    // If bucket not configured, save as base64
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const photoPath = `data:${file.type};base64,${base64}`;
    await c.env.DB.prepare('UPDATE users SET profile_photo = ? WHERE id = ?')
      .bind(photoPath, user.id)
      .run();
    return c.json({ photoPath });
  }
});

// Serve uploaded files from R2
app.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!c.env.BUCKET) return c.text('R2 Bucket not configured', 500);

  const object = await c.env.BUCKET.get(filename);
  if (!object) return c.text('Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});

// 3. Sessions
app.post('/sessions/start', authMiddleware, async (c) => {
  const user = c.get('user');
  const { partyId = null } = await c.req.json().catch(() => ({}));

  await c.env.DB.prepare("UPDATE sessions SET status = 'abandoned', end_time = datetime('now') WHERE user_id = ? AND status = 'active'")
    .bind(user.id)
    .run();

  const res = await c.env.DB.prepare("INSERT INTO sessions (user_id, start_time, status, party_id) VALUES (?, datetime('now'), 'active', ?)")
    .bind(user.id, partyId)
    .run();

  return c.json({ sessionId: res.meta.last_row_id || 0 });
});

app.post('/sessions/end/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  
  // Support JSON and Form Data
  let violation = false;
  try {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await c.req.json();
      violation = body.violation === true || body.violation === 'true';
    } else {
      const body = await c.req.parseBody();
      violation = body.violation === true || body.violation === 'true';
    }
  } catch(e) {}

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();

  if (!session) return c.json({ error: 'Session bulunamadi' }, 404);

  const now = new Date();
  const start = new Date(session.start_time.replace(' ', 'T') + 'Z');
  const duration = Math.floor((now - start) / 1000);
  const status = violation ? 'violated' : 'completed';

  await c.env.DB.prepare("UPDATE sessions SET end_time = datetime('now'), duration = ?, status = ? WHERE id = ?")
    .bind(duration, status, id)
    .run();

  if (duration >= 1) {
    if (!violation) {
      const baseXP = duration;
      const minBonus = Math.floor(duration / 60) * 5;
      const halfHourBonus = Math.floor(duration / 1800) * 60;
      const hourBonus = Math.floor(duration / 3600) * 360;
      
      const bonus = minBonus + halfHourBonus + hourBonus;
      const xpGained = baseXP + bonus;

      const newTotalXp = user.xp + xpGained;
      const newLevel = Math.floor((1 + Math.sqrt(1 + 0.08 * newTotalXp)) / 2);
      const totalFocus = (user.total_focus_time || 0) + duration;
      
      await c.env.DB.prepare('UPDATE users SET xp = ?, level = ?, total_focus_time = ? WHERE id = ?')
        .bind(newTotalXp, newLevel, totalFocus, user.id)
        .run();

      return c.json({ duration, xpGained, bonusGained: bonus, newLevel, status, total_focus_time: totalFocus });
    } else {
      const totalFocus = (user.total_focus_time || 0) + duration;
      await c.env.DB.prepare('UPDATE users SET total_focus_time = ? WHERE id = ?')
        .bind(totalFocus, user.id)
        .run();
      return c.json({ duration, xpGained: 0, bonusGained: 0, newLevel: user.level, status, total_focus_time: totalFocus });
    }
  }

  return c.json({ duration, status, xpGained: 0, bonusGained: 0, total_focus_time: user.total_focus_time || 0 });
});

app.get('/sessions/active', authMiddleware, async (c) => {
  const user = c.get('user');
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE user_id = ? AND status = "active" ORDER BY start_time DESC LIMIT 1')
    .bind(user.id)
    .first();
  return c.json(session || null);
});

app.get('/sessions/unrated', authMiddleware, async (c) => {
  const user = c.get('user');
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE user_id = ? AND status = "completed" AND (feeling IS NULL OR category IS NULL OR activity IS NULL) ORDER BY end_time DESC LIMIT 1')
    .bind(user.id)
    .first();
  return c.json(session || null);
});

app.post('/sessions/rate/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { feeling, category, activity } = await c.req.json();

  try {
    await c.env.DB.prepare('UPDATE sessions SET feeling = ?, category = ?, activity = ? WHERE id = ? AND user_id = ?')
      .bind(feeling, category, activity, id, user.id)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Değerlendirme kaydedilemedi' }, 500);
  }
});

app.get('/sessions/similar/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
  if (!session || !session.category) return c.json([]);

  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT u.username, u.profile_photo, s.activity, s.end_time 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.category = ? AND s.user_id != ? AND s.status = 'completed'
    ORDER BY s.end_time DESC LIMIT 3
  `).bind(session.category, user.id).all();

  return c.json(results || []);
});

// 4. Leaderboard & Stats
app.get('/leaderboard', authMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, username, profile_photo, total_focus_time, level, xp, status FROM users ORDER BY total_focus_time DESC LIMIT 100').all();
  return c.json(results || []);
});

app.get('/stats', authMiddleware, async (c) => {
  const r1 = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
  const r2 = await c.env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = "completed"').first();
  const r3 = await c.env.DB.prepare('SELECT SUM(total_focus_time) as total FROM users').first();
  const r4 = await c.env.DB.prepare('SELECT username, total_focus_time FROM users ORDER BY total_focus_time DESC LIMIT 1').first();

  return c.json({
    totalUsers: r1?.count || 0,
    totalSessions: r2?.count || 0,
    totalFocusTime: r3?.total || 0,
    topUser: r4 || null
  });
});

// 5. Feed & Posts
app.get('/feed/discover', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id).all();
  return c.json(results || []);
});

app.get('/feed/following', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id, user.id).all();
  return c.json(results || []);
});

app.get('/feed/trending', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id).all();
  return c.json(results || []);
});

// Image upload for posts
app.post('/posts', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const content = body.content || '';
  if (content && content.length > 2000) {
    return c.json({ error: 'İçerik çok uzun (Maks: 2000 karakter)' }, 400);
  }
  const file = body.image;
  let image = null;

  if (file && file.name) {
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'Dosya boyutu 5 MB\'tan büyük olamaz' }, 400);
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Sadece JPG, PNG ve WebP formatları yüklenebilir' }, 400);
    }

    const filename = `post-${user.id}-${Date.now()}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    if (c.env.BUCKET) {
      await c.env.BUCKET.put(filename, arrayBuffer, {
        httpMetadata: { contentType: file.type }
      });
      image = `/api/uploads/${filename}`;
    } else {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      image = `data:${file.type};base64,${base64}`;
    }
  }

  try {
    const res = await c.env.DB.prepare('INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)')
      .bind(user.id, content, image)
      .run();
    return c.json({ postId: res.meta.last_row_id || 0 });
  } catch (e) {
    return c.json({ error: 'Post kaydedilemedi' }, 500);
  }
});

app.post('/posts/:id/like', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)')
      .bind(user.id, id)
      .run();

    const post = await c.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(id).first();
    if (post && post.user_id !== user.id) {
      await createAndPushNotification(c.env, post.user_id, 'post_like', user.id, { postId: id });
      await notifyFriends(c.env, user.id, 'friend_activity_like', { postId: id });
    }
    return c.json({ success: true });
  } catch (e) {
    await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?')
      .bind(user.id, id)
      .run();
    return c.json({ success: true, unliked: true });
  }
});

app.post('/posts/:id/comment', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content, parent_id = null } = await c.req.json();

  const res = await c.env.DB.prepare('INSERT INTO comments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)')
    .bind(user.id, id, content, parent_id)
    .run();
  const commentId = res.meta.last_row_id || 0;

  const post = await c.env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(id).first();
  if (parent_id) {
    const parentComment = await c.env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(parent_id).first();
    if (parentComment && parentComment.user_id !== user.id) {
      await createAndPushNotification(c.env, parentComment.user_id, 'post_comment', user.id, { postId: id, commentId });
    }
  } else {
    if (post && post.user_id !== user.id) {
      await createAndPushNotification(c.env, post.user_id, 'post_comment', user.id, { postId: id, commentId });
      await notifyFriends(c.env, user.id, 'friend_activity_comment', { postId: id, commentId });
    }
  }

  return c.json({ commentId });
});

app.get('/posts/:id/comments', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(`
    SELECT c.*, COALESCE(u.username, 'silinmiş_kullanıcı') as username, COALESCE(u.profile_photo, '') as profile_photo,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as user_liked
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).bind(user.id, id).all();
  return c.json(results || []);
});

app.post('/posts/:id/repost', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('INSERT INTO reposts (user_id, post_id) VALUES (?, ?)')
      .bind(user.id, id)
      .run();

    const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
    if (post) {
      await c.env.DB.prepare('INSERT INTO posts (user_id, content, image, repost_of_post_id) VALUES (?, ?, ?, ?)')
        .bind(user.id, `Repost: ${post.content}`, post.image, id)
        .run();

      if (post.user_id !== user.id) {
        await createAndPushNotification(c.env, post.user_id, 'post_repost', user.id, { postId: id });
      }
    }
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Zaten repost ettin' }, 400);
  }
});

app.delete('/posts/:id/repost', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM reposts WHERE user_id = ? AND post_id = ?').bind(user.id, id).run();
  await c.env.DB.prepare('DELETE FROM posts WHERE user_id = ? AND repost_of_post_id = ?').bind(user.id, id).run();
  return c.json({ success: true });
});

app.post('/comments/:id/like', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)')
      .bind(user.id, id)
      .run();

    const comment = await c.env.DB.prepare('SELECT user_id, post_id FROM comments WHERE id = ?').bind(id).first();
    if (comment && comment.user_id !== user.id) {
      await createAndPushNotification(c.env, comment.user_id, 'comment_like', user.id, { commentId: id, postId: comment.post_id });
    }
    return c.json({ success: true });
  } catch (e) {
    await c.env.DB.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?')
      .bind(user.id, id)
      .run();
    return c.json({ success: true, unliked: true });
  }
});

// 6. Friends API
app.post('/friends/request/:username', authMiddleware, async (c) => {
  const user = c.get('user');
  const friend_username = c.req.param('username');

  const friend = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(friend_username).first();
  if (!friend) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
  if (friend.id === user.id) return c.json({ error: 'Kendine istek gönderemezsin' }, 400);

  try {
    await c.env.DB.prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, "pending")')
      .bind(user.id, friend.id)
      .run();
    await createAndPushNotification(c.env, friend.id, 'friend_request', user.id);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Zaten istek gönderilmiş' }, 400);
  }
});

app.post('/friends/accept/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const res = await c.env.DB.prepare('UPDATE friendships SET status = "accepted" WHERE id = ? AND friend_id = ?')
    .bind(id, user.id)
    .run();

  if (res.meta.changes > 0) {
    const friendship = await c.env.DB.prepare('SELECT user_id FROM friendships WHERE id = ?').bind(id).first();
    await c.env.DB.prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, "accepted")')
      .bind(user.id, friendship.user_id)
      .run();
    await createAndPushNotification(c.env, friendship.user_id, 'friend_accept', user.id);
    return c.json({ success: true });
  } else {
    return c.json({ error: 'İstek bulunamadı' }, 404);
  }
});

app.get('/friends', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time,
      (u.last_seen > datetime('now', '-2 minutes')) as is_online
    FROM friendships f JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = "accepted"
  `).bind(user.id).all();
  return c.json(results || []);
});

app.get('/friends/requests', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT f.id, u.username, u.profile_photo FROM friendships f
    JOIN users u ON f.user_id = u.id WHERE f.friend_id = ? AND f.status = "pending"
  `).bind(user.id).all();
  return c.json(requests || []);
});

app.delete('/friends/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const f = await c.env.DB.prepare('SELECT * FROM friendships WHERE id = ?').bind(id).first();
  if (!f) return c.json({ error: 'Bulunamadı' }, 404);
  if (f.user_id !== user.id && f.friend_id !== user.id) return c.json({ error: 'Yetkisiz' }, 403);

  await c.env.DB.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
    .bind(f.user_id, f.friend_id, f.friend_id, f.user_id)
    .run();
  return c.json({ success: true });
});

// 7. Direct Messages (DM)
app.get('/messages/inbox', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id, user.id, user.id, user.id, user.id).all();

  return c.json(results || []);
});

app.post('/messages/groups', authMiddleware, async (c) => {
  const user = c.get('user');
  const { name, users } = await c.req.json();
  if (!name || !users || !users.length) return c.json({ error: 'Grup adı ve üyeler gerekli' }, 400);

  const res = await c.env.DB.prepare('INSERT INTO chat_groups (name, created_by) VALUES (?, ?)')
    .bind(name, user.id)
    .run();
  const groupId = res.meta.last_row_id || 0;

  await c.env.DB.prepare('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)').bind(groupId, user.id).run();

  for (const u of users) {
    const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(u).first();
    if (targetUser) {
      await c.env.DB.prepare('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)').bind(groupId, targetUser.id).run();
    }
  }

  return c.json({ success: true, groupId });
});

app.get('/messages/group/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const member = await c.env.DB.prepare('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!member) return c.json({ error: 'Yetkisiz' }, 403);

  const { results } = await c.env.DB.prepare(`
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
  `).bind(id).all();

  return c.json(results || []);
});

app.get('/messages/group/:id/members', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const member = await c.env.DB.prepare('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!member) return c.json({ error: 'Yetkisiz' }, 403);

  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.profile_photo, u.level
    FROM chat_group_members cgm
    JOIN users u ON cgm.user_id = u.id
    WHERE cgm.group_id = ?
    ORDER BY u.username ASC
  `).bind(id).all();

  return c.json(results || []);
});

app.post('/messages/group/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content, parentId, isShare } = await c.req.json();
  if (!content || !content.trim()) return c.json({ error: 'Mesaj boş olamaz' }, 400);

  const member = await c.env.DB.prepare('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!member) return c.json({ error: 'Yetkisiz' }, 403);

  const res = await c.env.DB.prepare('INSERT INTO messages (from_user_id, to_user_id, content, parent_id, group_id, is_share) VALUES (?, 0, ?, ?, ?, ?)')
    .bind(user.id, content.trim(), parentId || null, id, isShare ? 1 : 0)
    .run();

  return c.json({ success: true, messageId: res.meta.last_row_id || 0 });
});

app.get('/messages/:username', authMiddleware, async (c) => {
  const user = c.get('user');
  const target_username = c.req.param('username');

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(target_username).first();
  if (!targetUser) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id, targetUser.id, targetUser.id, user.id).all();

  return c.json(results || []);
});

app.post('/messages/:username', authMiddleware, async (c) => {
  const user = c.get('user');
  const target_username = c.req.param('username');
  const { content, parentId, isShare } = await c.req.json();
  if (!content || !content.trim()) return c.json({ error: 'Mesaj içeriği boş olamaz' }, 400);

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(target_username).first();
  if (!targetUser) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  const res = await c.env.DB.prepare('INSERT INTO messages (from_user_id, to_user_id, content, parent_id, is_share) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, targetUser.id, content.trim(), parentId || null, isShare ? 1 : 0)
    .run();

  await c.env.DB.prepare('INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, "message", ?)')
    .bind(targetUser.id, user.id)
    .run();

  return c.json({ success: true, messageId: res.meta.last_row_id || 0 });
});

app.post('/messages/:username/read', authMiddleware, async (c) => {
  const user = c.get('user');
  const target_username = c.req.param('username');

  const targetUser = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(target_username).first();
  if (!targetUser) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  await c.env.DB.prepare('UPDATE messages SET read = 1 WHERE from_user_id = ? AND to_user_id = ?')
    .bind(targetUser.id, user.id)
    .run();
  return c.json({ success: true });
});

app.post('/messages/:id/reactions', authMiddleware, async (c) => {
  const user = c.get('user');
  const messageId = c.req.param('id');
  const { reaction } = await c.req.json();

  const row = await c.env.DB.prepare('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ?')
    .bind(messageId, user.id)
    .first();

  if (row) {
    if (row.reaction === reaction) {
      await c.env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?')
        .bind(messageId, user.id)
        .run();
      return c.json({ success: true, removed: true });
    } else {
      await c.env.DB.prepare('UPDATE message_reactions SET reaction = ? WHERE message_id = ? AND user_id = ?')
        .bind(reaction, messageId, user.id)
        .run();
      return c.json({ success: true });
    }
  } else {
    await c.env.DB.prepare('INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)')
      .bind(messageId, user.id, reaction)
      .run();
    return c.json({ success: true });
  }
});

app.delete('/messages/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const messageId = c.req.param('id');

  const msg = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first();
  if (!msg) return c.json({ error: 'Mesaj bulunamadı' }, 404);
  if (msg.from_user_id !== user.id) return c.json({ error: 'Yetkisiz' }, 403);

  await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run();
  await c.env.DB.prepare('DELETE FROM message_reactions WHERE message_id = ?').bind(messageId).run();
  return c.json({ success: true });
});

// 8. Notifications API
app.get('/notifications', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id, user.id).all();

  return c.json(results || []);
});

app.get('/notifications/unread', authMiddleware, async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0')
    .bind(user.id)
    .first();
  return c.json({ count: result?.count || 0 });
});

app.post('/notifications/read', authMiddleware, async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(user.id).run();
  return c.json({ success: true });
});

app.delete('/notifications/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return c.json({ success: true });
});

// 9. Post Details, Edit, Delete
app.get('/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await c.env.DB.prepare('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?').bind(id).run();
  const post = await c.env.DB.prepare(`
    SELECT p.*, u.username, u.profile_photo, u.level,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
      (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ?) as user_reposted
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).bind(user.id, user.id, id).first();

  if (!post) return c.json({ error: 'Bulunamadı' }, 404);

  const likers_res = await c.env.DB.prepare('SELECT u.username, u.profile_photo FROM likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 5').bind(id).all();
  const comments_res = await c.env.DB.prepare(`
    SELECT c.*, COALESCE(u.username, 'silinmiş_kullanıcı') as username, COALESCE(u.profile_photo, '') as profile_photo,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as like_count,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as user_liked
    FROM comments c LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).bind(user.id, id).all();

  return c.json({
    ...post,
    likers: likers_res.results || [],
    comments: comments_res.results || []
  });
});

app.delete('/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Post bulunamadı' }, 404);
  if (post.user_id !== user.id) return c.json({ error: 'Yetkisiz' }, 403);

  await c.env.DB.prepare('DELETE FROM posts WHERE id = ? OR repost_of_post_id = ?').bind(id, id).run();
  await c.env.DB.prepare('DELETE FROM likes WHERE post_id = ? OR post_id IN (SELECT id FROM posts WHERE repost_of_post_id = ?)')
    .bind(id, id).run();
  await c.env.DB.prepare('DELETE FROM comments WHERE post_id = ? OR post_id IN (SELECT id FROM posts WHERE repost_of_post_id = ?)')
    .bind(id, id).run();
  await c.env.DB.prepare('DELETE FROM reposts WHERE post_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM notifications WHERE post_id = ?').bind(id).run();

  return c.json({ success: true });
});

app.put('/posts/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content } = await c.req.json();

  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!post) return c.json({ error: 'Post bulunamadı' }, 404);
  if (post.user_id !== user.id) return c.json({ error: 'Yetkisiz' }, 403);

  await c.env.DB.prepare('UPDATE posts SET content = ? WHERE id = ?').bind(content, id).run();
  return c.json({ success: true });
});

app.delete('/comments/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const comment = await c.env.DB.prepare(`
    SELECT c.*, p.user_id as post_owner_id 
    FROM comments c 
    JOIN posts p ON c.post_id = p.id 
    WHERE c.id = ?
  `).bind(id).first();

  if (!comment) return c.json({ error: 'Yorum bulunamadı' }, 404);
  if (comment.user_id !== user.id && comment.post_owner_id !== user.id) {
    return c.json({ error: 'Yetkisiz' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM comment_likes WHERE comment_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM notifications WHERE comment_id = ?').bind(id).run();

  return c.json({ success: true });
});

// 10. Parties
app.post('/parties', authMiddleware, async (c) => {
  const user = c.get('user');
  const { name, isPrivate } = await c.req.json();

  const res = await c.env.DB.prepare('INSERT INTO parties (owner_id, name, is_private) VALUES (?, ?, ?)')
    .bind(user.id, name || 'Yeni Parti', isPrivate ? 1 : 0)
    .run();
  const partyId = res.meta.last_row_id || 0;

  await c.env.DB.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').bind(partyId, user.id).run();
  return c.json({ partyId });
});

app.get('/parties', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, u.username as owner_name,
      (SELECT COUNT(*) FROM party_members WHERE party_id = p.id) as member_count,
      (SELECT COUNT(*) FROM party_members WHERE party_id = p.id AND user_id = ?) as is_member
    FROM parties p 
    JOIN users u ON p.owner_id = u.id 
    WHERE p.is_private = 0 OR p.id IN (
      SELECT party_id FROM party_members WHERE user_id = ?
    )
    ORDER BY p.created_at DESC
  `).bind(user.id, user.id).all();

  return c.json(results || []);
});

app.post('/parties/:id/invite', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { username } = await c.req.json();

  const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (!target) return c.json({ error: 'Kullanıcı bulunamadı' }, 404);

  const party = await c.env.DB.prepare('SELECT * FROM parties WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
  if (!party) return c.json({ error: 'Sadece sahip davet edebilir' }, 403);

  try {
    await c.env.DB.prepare('INSERT INTO party_invites (party_id, from_user_id, to_user_id) VALUES (?, ?, ?)')
      .bind(id, user.id, target.id)
      .run();
    await createAndPushNotification(c.env, target.id, 'party_invite', user.id, { partyId: id });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Zaten davet edilmiş' }, 400);
  }
});

app.get('/parties/invites/pending', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT pi.*, p.name as party_name, u.username as from_username
    FROM party_invites pi
    JOIN parties p ON pi.party_id = p.id
    JOIN users u ON pi.from_user_id = u.id
    WHERE pi.to_user_id = ? AND pi.status = 'pending'
  `).bind(user.id).all();

  return c.json(results || []);
});

app.post('/parties/invites/:id/accept', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const invite = await c.env.DB.prepare('SELECT * FROM party_invites WHERE id = ? AND to_user_id = ?')
    .bind(id, user.id)
    .first();

  if (!invite) return c.json({ error: 'Davet bulunamadı' }, 404);

  await c.env.DB.prepare('UPDATE party_invites SET status = "accepted" WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').bind(invite.party_id, user.id).run();

  return c.json({ success: true, partyId: invite.party_id });
});

app.post('/parties/invites/:id/reject', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE party_invites SET status = "rejected" WHERE id = ? AND to_user_id = ?')
    .bind(id, user.id)
    .run();
  return c.json({ success: true });
});

app.get('/parties/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const party = await c.env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(id).first();
  if (!party) return c.json({ error: 'Parti bulunamadı' }, 404);

  const owner = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(party.owner_id).first();
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time,
      (SELECT id FROM sessions WHERE user_id = u.id AND status = 'active' LIMIT 1) as active_session_id,
      (SELECT start_time FROM sessions WHERE user_id = u.id AND status = 'active' LIMIT 1) as session_start,
      (SELECT COALESCE(SUM(duration), 0) FROM sessions WHERE user_id = u.id AND party_id = ? AND status = 'completed') as party_total_time
    FROM party_members pm 
    JOIN users u ON pm.user_id = u.id 
    WHERE pm.party_id = ? 
    ORDER BY party_total_time DESC
  `).bind(id, id).all();

  return c.json({
    ...party,
    owner_name: owner.username,
    members: results || []
  });
});

app.get('/parties/:id/live-status', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const member = await c.env.DB.prepare('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?').bind(id, user.id).first();
  if (!member) return c.json({ error: 'Yetkisiz' }, 403);

  const s_res = await c.env.DB.prepare('SELECT user_id, start_time FROM sessions WHERE party_id = ? AND status = "active"').bind(id).all();
  const m_res = await c.env.DB.prepare(`
    SELECT pm.*, u.username, u.profile_photo 
    FROM party_messages pm
    LEFT JOIN users u ON pm.user_id = u.id
    WHERE pm.party_id = ?
    ORDER BY pm.created_at ASC
    LIMIT 50
  `).bind(id).all();

  return c.json({
    sessions: s_res.results || [],
    messages: m_res.results || []
  });
});

app.post('/parties/:id/messages', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content } = await c.req.json();
  if (!content || !content.trim()) return c.json({ error: 'Mesaj boş' }, 400);

  const member = await c.env.DB.prepare('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?').bind(id, user.id).first();
  if (!member) return c.json({ error: 'Yetkisiz' }, 403);

  const res = await c.env.DB.prepare('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, ?, ?)')
    .bind(id, user.id, content.trim())
    .run();

  return c.json({ success: true, messageId: res.meta.last_row_id || 0 });
});

app.post('/parties/:id/join', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const party = await c.env.DB.prepare('SELECT * FROM parties WHERE id = ?').bind(id).first();
  if (!party) return c.json({ error: 'Parti bulunamadı' }, 404);

  const runJoin = async () => {
    try {
      await c.env.DB.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').bind(id, user.id).run();
      await c.env.DB.prepare('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)').bind(id, `@${user.username} odaya katıldı.`).run();

      if (party.owner_id !== user.id) {
        await c.env.DB.prepare('INSERT INTO notifications (user_id, type, from_user_id, party_id) VALUES (?, "party_join", ?, ?)')
          .bind(party.owner_id, user.id, id)
          .run();
      }
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Zaten partidesin' }, 400);
    }
  };

  if (party.is_private) {
    const invite = await c.env.DB.prepare('SELECT * FROM party_invites WHERE party_id = ? AND to_user_id = ? AND status = "accepted"')
      .bind(id, user.id)
      .first();
    if (!invite) return c.json({ error: 'Bu parti özel - davet gerekli' }, 403);
    return await runJoin();
  } else {
    return await runJoin();
  }
});

app.post('/parties/:id/leave', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const party = await c.env.DB.prepare('SELECT owner_id FROM parties WHERE id = ?').bind(id).first();
  if (!party) return c.json({ error: 'Parti bulunamadı' }, 404);

  if (party.owner_id === user.id) {
    await c.env.DB.prepare('DELETE FROM party_members WHERE party_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM parties WHERE id = ?').bind(id).run();
    return c.json({ success: true, deleted: true });
  } else {
    await c.env.DB.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?').bind(id, user.id).run();
    await c.env.DB.prepare('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)').bind(id, `@${user.username} odadan ayrıldı.`).run();
    return c.json({ success: true });
  }
});

// 11. Share Targets & Reactions
app.get('/share/targets', authMiddleware, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
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
  `).bind(user.id, user.id, user.id, user.id, user.id, user.id).all();

  return c.json(results || []);
});

app.get('/messages/:id/reactions', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(`
    SELECT mr.reaction, u.username, u.profile_photo, u.level
    FROM message_reactions mr
    JOIN users u ON mr.user_id = u.id
    WHERE mr.message_id = ?
    ORDER BY mr.created_at DESC
  `).bind(id).all();
  return c.json(results || []);
});

app.get('/notifications/vapidPublicKey', (c) => {
  const keys = getVapidKeys(c.env);
  return c.text(keys.publicKey);
});

app.post('/notifications/subscribe', authMiddleware, async (c) => {
  const user = c.get('user');
  const subscription = await c.req.json();
  if (!subscription || !subscription.endpoint) {
    return c.json({ error: 'Geçersiz abonelik' }, 400);
  }

  try {
    await c.env.DB.prepare('INSERT INTO web_push_subscriptions (user_id, subscription) VALUES (?, ?)')
      .bind(user.id, JSON.stringify(subscription))
      .run();
    return c.json({ success: true }, 201);
  } catch (e) {
    return c.json({ error: 'Abonelik kaydedilemedi' }, 500);
  }
});

app.get('/notifications/is-subscribed', authMiddleware, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT count(*) as count FROM web_push_subscriptions WHERE user_id = ?')
    .bind(user.id)
    .first();
  return c.json({ subscribed: (row && row.count > 0) });
});

export const onRequest = handle(app);
