const express = require('express');

module.exports = function(db, auth, createAndPushNotification) {
  const router = express.Router();

  // Dedicated Real Follow & Unfollow API Endpoints
  router.post('/follow/:username', auth, (req, res) => {
    const targetUsername = req.params.username;
    db.get('SELECT id FROM users WHERE username = ?', [targetUsername], (err, targetUser) => {
      if (err || !targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Kendini takip edemezsin' });

      db.run(
        `INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')
         ON CONFLICT(user_id, friend_id) DO UPDATE SET status = 'accepted'`,
        [req.user.id, targetUser.id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Takip işlemi başarısız' });
          createAndPushNotification(targetUser.id, 'friend_accept', req.user.id);
          res.json({ success: true, is_following: true });
        }
      );
    });
  });

  router.post('/unfollow/:username', auth, (req, res) => {
    const targetUsername = req.params.username;
    db.get('SELECT id FROM users WHERE username = ?', [targetUsername], (err, targetUser) => {
      if (err || !targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

      db.run('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?', [req.user.id, targetUser.id], (err) => {
        if (err) return res.status(500).json({ error: 'Takipten çıkma başarısız' });
        res.json({ success: true, is_following: false });
      });
    });
  });

  // Friends API
  router.post('/friends/request/:username', auth, (req, res) => {
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

  router.post('/friends/accept/:id', auth, (req, res) => {
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

  router.get('/friends', auth, (req, res) => {
    db.all(`SELECT u.id, u.username, u.profile_photo, u.level, u.total_focus_time,
      (u.last_seen > datetime('now', '-2 minutes')) as is_online
      FROM friendships f JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = "accepted"`, [req.user.id], (err, friends) => {
      res.json(friends || []);
    });
  });

  router.get('/friends/requests', auth, (req, res) => {
    db.all(`SELECT f.id, u.username, u.profile_photo FROM friendships f
      JOIN users u ON f.user_id = u.id WHERE f.friend_id = ? AND f.status = "pending"`, [req.user.id], (err, requests) => {
      res.json(requests || []);
    });
  });

  // Reject a pending request OR remove an existing friend
  router.delete('/friends/:id', auth, (req, res) => {
    db.get('SELECT * FROM friendships WHERE id = ?', [req.params.id], (err, f) => {
      if (!f) return res.status(404).json({ error: 'Bulunamadı' });
      if (f.user_id !== req.user.id && f.friend_id !== req.user.id)
        return res.status(403).json({ error: 'Yetkisiz' });
      db.run('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
        [f.user_id, f.friend_id, f.friend_id, f.user_id], () => {
        res.json({ success: true });
      });
    });
  });

  return router;
};
