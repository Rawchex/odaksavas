const express = require('express');

module.exports = function(db, auth, webpush, vapidKeys) {
  const router = express.Router();

  // --- WEB PUSH HELPER ---
  const sendPushNotification = (userId, payload) => {
    db.all('SELECT subscription FROM web_push_subscriptions WHERE user_id = ?', [userId], (err, rows) => {
      if (err || !rows || rows.length === 0) return;
      const uniqueSubs = [];
      const endpoints = new Set();
      rows.forEach(row => {
        try {
          const sub = JSON.parse(row.subscription);
          if (sub.endpoint && !endpoints.has(sub.endpoint)) {
            endpoints.add(sub.endpoint);
            uniqueSubs.push(sub);
          }
        } catch(e) {}
      });

      uniqueSubs.forEach(sub => {
        webpush.sendNotification(sub, JSON.stringify(payload)).catch(e => {
          if (e.statusCode === 404 || e.statusCode === 410) {
            db.run('DELETE FROM web_push_subscriptions WHERE subscription = ?', [JSON.stringify(sub)]);
          }
        });
      });
    });
  };

  router.get('/vapidPublicKey', (req, res) => {
    res.send(vapidKeys.publicKey);
  });

  router.post('/subscribe', auth, (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Geçersiz abonelik' });
    }

    db.all('SELECT id, subscription FROM web_push_subscriptions WHERE user_id = ?', [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Sorgu hatası' });
      const exists = rows && rows.some(row => {
        try {
          return JSON.parse(row.subscription).endpoint === subscription.endpoint;
        } catch(e) { return false; }
      });
      if (exists) {
        return res.json({ success: true, message: 'Abonelik zaten mevcut' });
      }
      db.run('INSERT INTO web_push_subscriptions (user_id, subscription) VALUES (?, ?)', [req.user.id, JSON.stringify(subscription)], (err2) => {
        if (err2) return res.status(500).json({ error: 'Abonelik kaydedilemedi' });
        res.status(201).json({ success: true });
      });
    });
  });

  router.get('/is-subscribed', auth, (req, res) => {
    db.get('SELECT count(*) as count FROM web_push_subscriptions WHERE user_id = ?', [req.user.id], (err, row) => {
      if (err) return res.status(500).json({ error: 'Sorgu hatası' });
      res.json({ subscribed: (row && row.count > 0) });
    });
  });

  router.get('/', auth, (req, res) => {
    db.all(`
      SELECT n.*, 
        COALESCE(u.username, 'BLUNK') as username, 
        COALESCE(u.profile_photo, '/favicon.svg') as profile_photo,
        (SELECT content FROM posts WHERE id = n.post_id LIMIT 1) as post_content,
        (SELECT content FROM comments WHERE id = n.comment_id LIMIT 1) as comment_content,
        (SELECT name FROM parties WHERE id = n.party_id LIMIT 1) as party_name,
        (SELECT f.id FROM friendships f WHERE f.user_id = n.from_user_id AND f.friend_id = ? AND f.status = 'pending' LIMIT 1) as friendship_id
      FROM notifications n
      LEFT JOIN users u ON n.from_user_id = u.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `, [req.user.id, req.user.id], (err, notifications) => {
      res.json(notifications || []);
    });
  });

  router.get('/unread', auth, (req, res) => {
    db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0', [req.user.id], (err, result) => {
      res.json({ count: result?.count || 0 });
    });
  });

  router.post('/read', auth, (req, res) => {
    db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id], () => {
      res.json({ success: true });
    });
  });

  router.delete('/clear-all', auth, (req, res) => {
    db.run('DELETE FROM notifications WHERE user_id = ?', [req.user.id], (err) => {
      if (err) return res.status(500).json({ error: 'Veritabanı hatası' });
      res.json({ success: true });
    });
  });

  router.delete('/:id', auth, (req, res) => {
    db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], () => {
      res.json({ success: true });
    });
  });

  return router;
};
