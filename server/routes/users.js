const express = require('express');

module.exports = function(db, auth, upload) {
  const router = express.Router();

// Arama endpoint'i (kullanıcı adında arama)
router.get('/search/users', auth, (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  
  const searchPattern = `%${q}%`;
  db.all(
    `SELECT id, username, profile_photo, level, xp, status 
     FROM users 
     WHERE username LIKE ? AND id != ? 
     LIMIT 10`,
    [searchPattern, req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB hatası' });
      res.json(rows || []);
    }
  );
});

// Heartbeat — online/offline takibi için her 15sn'de çağrılır
router.patch('/me/heartbeat', auth, (req, res) => {
  db.run('UPDATE users SET last_seen = datetime("now") WHERE id = ?', [req.user.id], () => {
    res.json({ ok: true });
  });
});

// Instant offline signal on tab close / logout
router.post('/me/offline', auth, (req, res) => {
  db.run('UPDATE users SET last_seen = datetime("now", "-5 minutes") WHERE id = ?', [req.user.id], () => {
    res.json({ ok: true });
  });
});

// Cihaz tipi güncelle (mobile / desktop)
router.post('/me/device', auth, (req, res) => {
  const { device_type } = req.body;
  if (!['mobile', 'desktop'].includes(device_type)) {
    return res.status(400).json({ error: 'Geçersiz cihaz tipi' });
  }
  db.run('UPDATE users SET device_type = ? WHERE id = ?', [device_type, req.user.id], () => {
    res.json({ ok: true, device_type });
  });
});

// Belirli bir kullanıcının cihaz tipini getir
router.get('/user/:username/device', auth, (req, res) => {
  db.get('SELECT device_type, last_seen, status FROM users WHERE username = ?', [req.params.username], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ device_type: row.device_type || 'desktop', last_seen: row.last_seen, status: row.status || 'online' });
  });
});


router.patch('/me/status', auth, (req, res) => {
  const { status } = req.body;
  if (!['online', 'dnd', 'away', 'invisible'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum' });
  }
  db.run('UPDATE users SET status = ? WHERE id = ?', [status, req.user.id], () => {
    res.json({ success: true, status });
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/', httpOnly: true, sameSite: 'Lax' });
  res.clearCookie('username', { path: '/', sameSite: 'Lax' });
  res.json({ success: true });
});

// Update birth date (server-side age is always computed from this, never trusted from client)
router.patch('/me/birth-date', auth, (req, res) => {
  const { birth_date } = req.body;
  if (!birth_date || !/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
    return res.status(400).json({ error: 'Geçerli bir doğum tarihi gerekli (YYYY-MM-DD)' });
  }
  const bd = new Date(birth_date);
  if (isNaN(bd.getTime())) return res.status(400).json({ error: 'Geçersiz tarih' });
  const ageMins = (Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageMins < 10 || ageMins > 120) return res.status(400).json({ error: 'Geçersiz yaş aralığı' });

  db.run('UPDATE users SET birth_date = ? WHERE id = ?', [birth_date, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Güncellenemedi' });
    res.json({ success: true });
  });
});


// Delete account and all user data
router.delete('/me', auth, (req, res) => {
  const { password, confirmText } = req.body;
  if (confirmText !== 'ONAYLIYORUM') {
    return res.status(400).json({ error: 'Onaylamak için büyük harflerle ONAYLIYORUM yazmalısınız.' });
  }

  // Get user to verify password if they have one set
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'Sunucu hatası' });

    // If user registered with password or has set a password, verify password
    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: 'Lütfen şifrenizi girin.' });
      }
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err || !isMatch) return res.status(400).json({ error: 'Girdiğiniz şifre hatalı.' });
        proceedWithAccountDeletion();
      });
    } else {
      // User registered via Google and has no password set
      proceedWithAccountDeletion();
    }

    function proceedWithAccountDeletion() {
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
    }
  });
});


// Sessions
router.post('/sessions/start', auth, (req, res) => {
  const partyId = req.body.partyId || null;
  const mode = req.body.mode || 'free';
  const targetDuration = parseInt(req.body.targetDuration || '0', 10) || 0;
  const breakDuration = parseInt(req.body.breakDuration || '0', 10) || 0;
  // Activity fields can now be set at session START (not just end)
  const feeling  = req.body.feeling  || null;
  const category = req.body.category || null;
  const activity = req.body.activity || null;

  db.run('UPDATE sessions SET status = "abandoned", end_time = datetime("now") WHERE user_id = ? AND status = "active"', [req.user.id], () => {
    db.run(
      'INSERT INTO sessions (user_id, start_time, status, party_id, mode, target_duration, break_duration, feeling, category, activity, pomo_state, pomo_round, state_start_time) VALUES (?, datetime("now"), "active", ?, ?, ?, ?, ?, ?, ?, "focusing", 0, datetime("now"))',
      [req.user.id, partyId, mode, targetDuration, breakDuration, feeling, category, activity],
      function() { res.json({ sessionId: this.lastID }); }
    );
  });
});

router.post('/sessions/end/:id', auth, upload.none(), (req, res) => {
  const { id } = req.params;
  // Support both JSON body (normal stop) and FormData (sendBeacon on page close)
  const violation = req.body.violation === true || req.body.violation === 'true';
  const customDuration = req.body.customDuration ? parseInt(req.body.customDuration, 10) : null;
  
  // Strict check: Only query active sessions belonging to this user
  db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = "active"', [id, req.user.id], (err, session) => {
    if (!session) {
      return res.status(400).json({ error: 'Aktif bir seans bulunamadı veya seans zaten sonlandırılmış.' });
    }
    
    const now = new Date();
    const start = new Date(session.start_time.replace(' ', 'T') + 'Z');
    let rawDuration = customDuration !== null && !isNaN(customDuration) ? customDuration : Math.floor((now - start) / 1000);
    
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
              res.json({ duration, xpGained, bonusGained: bonus, newLevel, status, total_focus_time: totalFocus, mode: session.mode, target_duration: session.target_duration, break_duration: session.break_duration });
            });
          } else {
            // Violated, update total_focus_time but no XP
            const totalFocus = (req.user.total_focus_time || 0) + duration;
            db.run('UPDATE users SET total_focus_time = ? WHERE id = ?', [totalFocus, req.user.id], () => {
              res.json({ duration, xpGained: 0, bonusGained: 0, newLevel: req.user.level, status, total_focus_time: totalFocus, mode: session.mode, target_duration: session.target_duration, break_duration: session.break_duration });
            });
          }
        } else {
          res.json({ duration, status, xpGained: 0, bonusGained: 0, total_focus_time: req.user.total_focus_time || 0, mode: session.mode, target_duration: session.target_duration, break_duration: session.break_duration });
        }
    });
  });
});

router.get('/sessions/active', auth, (req, res) => {
  db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "active" ORDER BY start_time DESC LIMIT 1', [req.user.id], (err, session) => {
    if (err) return res.status(500).json({ error: 'Sorgu hatası' });
    if (!session) return res.json(null);

    if (session.mode === 'pomodoro') {
      if (!session.state_start_time) {
        return res.json(session);
      }
      const stateStart = new Date(session.state_start_time.replace(' ', 'T') + 'Z');
      const diffSecs = Math.floor((Date.now() - stateStart) / 1000);
      
      let isExpired = false;
      if (session.pomo_state === 'focusing') {
        if (diffSecs >= (session.target_duration + 1800)) {
          isExpired = true;
        }
      } else if (session.pomo_state === 'overtime') {
        if (diffSecs >= 1800) {
          isExpired = true;
        }
      }
      
      if (isExpired) {
        db.run('UPDATE sessions SET status = "abandoned", end_time = datetime("now") WHERE id = ?', [session.id], () => {
          sendDetailedSessionAbandonedNotification(session.user_id, session.pomo_round);
        });
        return res.json(null);
      }
    }
    res.json(session);
  });
});

router.post('/sessions/update-state', auth, (req, res) => {
  const { state, round } = req.body;
  if (!state) return res.status(400).json({ error: 'Geçersiz parametreler' });
  
  db.run(
    'UPDATE sessions SET pomo_state = ?, pomo_round = ?, state_start_time = datetime("now") WHERE user_id = ? AND status = "active"',
    [state, round || 0, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Durum güncellenemedi' });
      res.json({ success: true });
    }
  );
});

router.get('/sessions/unrated', auth, (req, res) => {
  db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "completed" AND (feeling IS NULL OR category IS NULL OR activity IS NULL) ORDER BY end_time DESC LIMIT 1', [req.user.id], (err, session) => {
    res.json(session || null);
  });
});

router.post('/sessions/rate/:id', auth, (req, res) => {
  const { id } = req.params;
  const { feeling, note } = req.body;
  db.run('UPDATE sessions SET feeling = ?, note = ? WHERE id = ? AND user_id = ?', 
    [feeling, note, id, req.user.id], 
    function(err) {
      if (err) return res.status(500).json({ error: 'Değerlendirme kaydedilemedi' });
      res.json({ success: true });
    }
  );
});

router.get('/sessions/similar/:id', auth, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM sessions WHERE id = ?', [id], (err, session) => {
    if (err || !session || !session.activity) return res.json([]);

    const userBD = req.user.birth_date;
    let minBD = null, maxBD = null, underAge = false;

    if (userBD) {
      const msPerYear = 365.25 * 24 * 3600 * 1000;
      const userAge   = Math.floor((Date.now() - new Date(userBD)) / msPerYear);

      if (userAge < 18) { underAge = true; }
      else {
        const today = new Date();
        let minAge, maxAge;
        if (userAge <= 25) { minAge = 18; maxAge = 25; }
        else               { minAge = userAge - 5; maxAge = userAge + 5; }
        maxBD = new Date(today); maxBD.setFullYear(today.getFullYear() - minAge);
        minBD = new Date(today); minBD.setFullYear(today.getFullYear() - maxAge - 1);
      }
    }

    if (underAge) return res.json([]);

    const ageClause = (minBD && maxBD)
      ? `AND (u.birth_date IS NULL OR (u.birth_date >= '${minBD.toISOString().slice(0,10)}' AND u.birth_date <= '${maxBD.toISOString().slice(0,10)}'))`
      : '';

    db.all(`
      SELECT DISTINCT
        u.id, u.username, u.profile_photo, u.level, u.birth_date,
        s.activity, s.end_time,
        (SELECT status FROM friendships
           WHERE (user_id = ? AND friend_id = u.id)
              OR (user_id = u.id AND friend_id = ?)
           LIMIT 1) AS friendship_status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.activity = ? AND s.user_id != ? AND s.status = 'completed'
        ${ageClause}
      ORDER BY s.end_time DESC
      LIMIT 10
    `, [req.user.id, req.user.id, session.activity, req.user.id], (err2, rows) => {
      res.json(rows || []);
    });
  });
});

// Leaderboard
router.get('/leaderboard', auth, (req, res) => {
  db.all(`
    SELECT id, username, profile_photo, total_focus_time, level, xp, status,
      (last_seen IS NOT NULL AND last_seen > datetime('now', '-2 minutes')) as is_online 
    FROM users 
    ORDER BY total_focus_time DESC LIMIT 100
  `, (err, users) => {
    res.json(users || []);
  });
});

// Public Stats endpoint for Landing Page (No auth required)
router.get('/public-stats', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM users', (err, r1) => {
    db.get('SELECT COUNT(*) as count FROM sessions WHERE status = "completed"', (err, r2) => {
      db.get('SELECT SUM(total_focus_time) as total FROM users', (err, r3) => {
        const totalUsers = r1?.count || 0;
        const totalSessions = r2?.count || 0;
        const totalFocusMinutes = r3?.total || 0;
        const totalFocusHours = Math.round(totalFocusMinutes / 60);

        res.json({
          users: totalUsers,
          sessions: totalSessions,
          hours: totalFocusHours
        });
      });
    });
  });
});

// Stats endpoint
router.get('/stats', auth, (req, res) => {
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
router.get('/users/search', auth, (req, res) => {
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
router.get('/users/:username', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get(`
    SELECT u.*, 
      (u.last_seen IS NOT NULL AND u.last_seen > datetime('now', '-2 minutes')) as is_online 
    FROM users u 
    WHERE LOWER(u.username) = LOWER(?)
  `, [targetName], (err, user) => {
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
            // Count followers (people following this user)
            db.get('SELECT COUNT(*) as follower_count FROM friendships WHERE friend_id = ? AND status = "accepted"', [user.id], (err, c_followers) => {
              // Count following (people followed by this user)
              db.get('SELECT COUNT(*) as following_count FROM friendships WHERE user_id = ? AND status = "accepted"', [user.id], (err, c_following) => {
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
                      friend_count: c_following?.following_count || 0,
                      follower_count: c_followers?.follower_count || 0,
                      following_count: c_following?.following_count || 0,
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
});

// GET a specific user's friend list (for profile followers/following view)
router.get('/users/:username/friends', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.all(`
      SELECT DISTINCT u.id, u.username, u.username AS display_name, u.profile_photo, u.level, u.total_focus_time, u.status
      FROM users u
      JOIN friendships f ON ((f.user_id = ? AND f.friend_id = u.id) OR (f.friend_id = ? AND f.user_id = u.id))
      WHERE f.status = 'accepted' AND u.id != ?
      ORDER BY u.username ASC
    `, [user.id, user.id, user.id], (err, friends) => {
      res.json(friends || []);
    });
  });
});

// GET user's followers list
router.get('/users/:username/followers', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.all(`
      SELECT DISTINCT u.id, u.username, u.username AS display_name, u.profile_photo, u.level, u.status,
        (SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_id = u.id AND status = 'accepted') as is_following
      FROM users u
      JOIN friendships f ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'accepted' AND u.id != ?
      ORDER BY u.username ASC
    `, [req.user.id, user.id, user.id], (err, followers) => {
      res.json(followers || []);
    });
  });
});

// GET user's following list
router.get('/users/:username/following', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, user) => {
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.all(`
      SELECT DISTINCT u.id, u.username, u.username AS display_name, u.profile_photo, u.level, u.status,
        (SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_id = u.id AND status = 'accepted') as is_following
      FROM users u
      JOIN friendships f ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'accepted' AND u.id != ?
      ORDER BY u.username ASC
    `, [req.user.id, user.id, user.id], (err, following) => {
      res.json(following || []);
    });
  });
});

// Follow a user
router.post('/follow/:username', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, target) => {
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Kendinizi takip edemezsiniz' });
    
    db.run(`
      INSERT OR REPLACE INTO friendships (user_id, friend_id, status)
      VALUES (?, ?, 'accepted')
    `, [req.user.id, target.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Takip etme işlemi başarısız oldu' });
      createAndPushNotification(target.id, 'friend_request', req.user.id);
      res.json({ success: true });
    });
  });
});

// Unfollow a user
router.post('/unfollow/:username', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, target) => {
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    
    db.run(`
      DELETE FROM friendships
      WHERE user_id = ? AND friend_id = ?
    `, [req.user.id, target.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Takipten çıkma işlemi başarısız oldu' });
      res.json({ success: true });
    });
  });
});

// Remove a follower
router.post('/remove-follower/:username', auth, (req, res) => {
  const targetName = (req.params.username || '').replace(/^@/, '').trim();
  db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [targetName], (err, target) => {
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    
    db.run(`
      DELETE FROM friendships
      WHERE user_id = ? AND friend_id = ?
    `, [target.id, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ error: 'Takipçi çıkarma işlemi başarısız oldu' });
      res.json({ success: true });
    });
  });
});


router.put('/profile', auth, (req, res) => {
  const { username, bio, height, weight, cv, is_private } = req.body;
  if (bio && bio.length > 500) return res.status(400).json({ error: 'Biyografi çok uzun (Maks: 500 karakter)' });
  if (cv && cv.length > 3000) return res.status(400).json({ error: 'CV çok uzun (Maks: 3000 karakter)' });
  
  let newUsername = req.user.username;
  if (username && username.trim()) {
    const cleanUser = username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUser)) {
      return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter arası, harf, rakam ve alt çizgi içermelidir.' });
    }
    newUsername = cleanUser;
  }

  // Check if username is taken by someone else
  db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Veritabanı hatası' });
    if (existing) return res.status(400).json({ error: 'Bu kullanıcı adı zaten başka bir üye tarafından kullanılıyor.' });

    const isPrivateVal = is_private ? 1 : 0;
    db.run('UPDATE users SET username = ?, bio = ?, height = ?, weight = ?, cv = ?, is_private = ? WHERE id = ?', 
      [newUsername, bio, height, weight, cv, isPrivateVal, req.user.id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Güncelleme hatası' });
      
      const token = jwt.sign({ id: req.user.id, username: newUsername }, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'Lax' });
      res.cookie('username', newUsername, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'Lax' });

      res.json({ success: true, username: newUsername });
    });
  });
});

router.get('/user/active-voice-session', auth, (req, res) => {
  res.json({ active: false });
});



router.post('/profile/photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  const photoPath = '/uploads/' + req.file.filename;
  db.run('UPDATE users SET profile_photo = ? WHERE id = ?', [photoPath, req.user.id], () => {
    res.json({ photoPath });
  });
});

router.delete('/profile/photo', auth, (req, res) => {
  db.run('UPDATE users SET profile_photo = NULL WHERE id = ?', [req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Fotoğraf kaldırılamadı' });
    res.json({ success: true, photoPath: null });
  });
});


  return router;
};
