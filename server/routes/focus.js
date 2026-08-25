const express = require('express');
const cacheMiddleware = require('../middleware/cache');

module.exports = function(db, auth, upload, sendDetailedSessionAbandonedNotification) {
  const router = express.Router();

  // POST /api/sessions/start
  router.post('/start', auth, (req, res) => {
    const partyId = req.body.partyId || null;
    const mode = req.body.mode || 'free';
    const targetDuration = parseInt(req.body.targetDuration || '0', 10) || 0;
    const breakDuration = parseInt(req.body.breakDuration || '0', 10) || 0;
    const feeling  = req.body.feeling  ? req.body.feeling.trim() : null;
    const categoryId = req.body.categoryId ? parseInt(req.body.categoryId, 10) : null;
    let tagName = req.body.tagName ? req.body.tagName.trim() : null;

    const startSession = (finalTagId) => {
      db.run('UPDATE sessions SET status = "abandoned", end_time = datetime("now") WHERE user_id = ? AND status = "active"', [req.user.id], () => {
        db.run(
          'INSERT INTO sessions (user_id, start_time, status, party_id, mode, target_duration, break_duration, feeling, category_id, tag_id, pomo_state, pomo_round, state_start_time) VALUES (?, datetime("now"), "active", ?, ?, ?, ?, ?, ?, ?, "focusing", 0, datetime("now"))',
          [req.user.id, partyId, mode, targetDuration, breakDuration, feeling, categoryId, finalTagId],
          function() { res.json({ sessionId: this.lastID }); }
        );
      });
    };

    if (tagName) {
      let tagSlug = tagName.toLowerCase().replace(/[^a-z0-9ğüşöçi]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!tagSlug) tagSlug = 'diger';

      db.get('SELECT id FROM tags WHERE slug = ?', [tagSlug], (err, tag) => {
        if (tag) {
          startSession(tag.id);
        } else {
          db.run('INSERT INTO tags (name, slug) VALUES (?, ?)', [tagName, tagSlug], function(err) {
            if (err) {
              db.get('SELECT id FROM tags WHERE slug = ?', [tagSlug], (err2, tag2) => {
                startSession(tag2 ? tag2.id : null);
              });
            } else {
              startSession(this.lastID);
            }
          });
        }
      });
    } else {
      startSession(null);
    }
  });

  // POST /api/sessions/end/:id
  router.post('/end/:id', auth, upload.none(), (req, res) => {
    const { id } = req.params;
    const violation = req.body.violation === true || req.body.violation === 'true';
    const customDuration = req.body.customDuration ? parseInt(req.body.customDuration, 10) : null;

    db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = "active"', [id, req.user.id], (err, session) => {
      if (!session) {
        return res.status(400).json({ error: 'Aktif bir seans bulunamadı veya seans zaten sonlandırılmış.' });
      }

      const now = new Date();
      const start = new Date(session.start_time.replace(' ', 'T') + 'Z');
      let rawDuration = customDuration !== null && !isNaN(customDuration) ? customDuration : Math.floor((now - start) / 1000);

      if (isNaN(rawDuration) || rawDuration < 0) rawDuration = 0;
      const duration = Math.min(rawDuration, 43200);
      const status = violation ? 'violated' : 'completed';

      db.run('UPDATE sessions SET end_time = datetime("now"), duration = ?, status = ? WHERE id = ? AND status = "active"',
        [duration, status, id],
        function(err) {
          if (err || this.changes === 0) {
            return res.status(400).json({ error: 'Seans zaten başka bir cihazdan kapatılmış.' });
          }

          if (duration >= 1) {
            if (!violation) {
              const baseXP = duration;
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

  // GET /api/sessions/active
  router.get('/active', auth, (req, res) => {
    db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "active" ORDER BY start_time DESC LIMIT 1', [req.user.id], (err, session) => {
      if (err) return res.status(500).json({ error: 'Sorgu hatası' });
      if (!session) return res.json(null);

      if (session.mode === 'pomodoro') {
        if (!session.state_start_time) return res.json(session);

        const stateStart = new Date(session.state_start_time.replace(' ', 'T') + 'Z');
        const diffSecs = Math.floor((Date.now() - stateStart) / 1000);

        let isExpired = false;
        if (session.pomo_state === 'focusing') {
          if (diffSecs >= (session.target_duration + 1800)) isExpired = true;
        } else if (session.pomo_state === 'overtime') {
          if (diffSecs >= 1800) isExpired = true;
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

  // POST /api/sessions/update-state
  router.post('/update-state', auth, (req, res) => {
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

  // GET /api/sessions/unrated
  router.get('/unrated', auth, (req, res) => {
    db.get('SELECT * FROM sessions WHERE user_id = ? AND status = "completed" AND (feeling IS NULL OR category IS NULL OR activity IS NULL) ORDER BY end_time DESC LIMIT 1', [req.user.id], (err, session) => {
      res.json(session || null);
    });
  });

  // POST /api/sessions/rate/:id
  router.post('/rate/:id', auth, (req, res) => {
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

  // GET /api/sessions/similar/:id
  router.get('/similar/:id', auth, (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM sessions WHERE id = ?', [id], (err, session) => {
      if (err || !session || !session.activity) return res.json([]);

      const userBD = req.user.birth_date;
      let minBD = null, maxBD = null, underAge = false;

      if (userBD) {
        const msPerYear = 365.25 * 24 * 3600 * 1000;
        const userAge = Math.floor((Date.now() - new Date(userBD)) / msPerYear);

        if (userAge < 18) { underAge = true; }
        else {
          const today = new Date();
          let minAge, maxAge;
          if (userAge <= 25) { minAge = 18; maxAge = 25; }
          else { minAge = userAge - 5; maxAge = userAge + 5; }
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

  // GET /api/leaderboard (all-time)
  router.get('/leaderboard', auth, cacheMiddleware(15), (req, res) => {
    db.all(`
      SELECT id, username, profile_photo, total_focus_time, level, xp, status,
        (last_seen IS NOT NULL AND last_seen > datetime('now', '-2 minutes')) as is_online
      FROM users
      ORDER BY total_focus_time DESC LIMIT 100
    `, (err, users) => {
      res.json(users || []);
    });
  });

  return router;
};
