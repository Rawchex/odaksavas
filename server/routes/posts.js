const express = require('express');

module.exports = function(db, auth, upload, createAndPushNotification, notifyFriends) {
  const router = express.Router();

// Feed & Posts — Gelişmiş Algoritmik Mühendislik (Instagram-Style Ranking Engine)
router.get('/feed/:tab', auth, (req, res) => {
  const tab = req.params.tab || 'discover';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const currentUserId = req.user.id;

  let query = '';
  let params = [];

  if (tab === 'following') {
    // Takip Edilenler: İstemci zamanına göre en yeni gönderiler
    query = `
      SELECT p.*, u.username, u.profile_photo, u.level,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ?) as user_reposted
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id IN (
        SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
        UNION SELECT ?
      )
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [currentUserId, currentUserId, currentUserId, currentUserId, limit, offset];
  } else if (tab === 'trending') {
    // Trendler: Son 48 saatteki yüksek etkileşim ivmesi
    query = `
      SELECT p.*, u.username, u.profile_photo, u.level,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ?) as user_reposted,
        (
          ((SELECT COUNT(*) FROM likes WHERE post_id = p.id) * 2.0 + 
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) * 4.0 + 
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) * 5.0) /
          POWER(CAST((julianday('now') - julianday(p.created_at)) * 24.0 + 2.0 AS REAL), 1.5)
        ) as rank_score
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE datetime(p.created_at) > datetime('now', '-7 days')
      ORDER BY rank_score DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [currentUserId, currentUserId, limit, offset];
  } else {
    // Keşfet (Discover): Gelişmiş Algoritmik Sıralama (Time Decay + Engagement Weight + Affinity)
    query = `
      SELECT p.*, u.username, u.profile_photo, u.level,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) as repost_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked,
        (SELECT COUNT(*) FROM reposts WHERE post_id = p.id AND user_id = ?) as user_reposted,
        (
          (
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) * 1.5 + 
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) * 3.5 + 
            (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) * 4.5 +
            CASE WHEN p.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted') THEN 15.0 ELSE 0.0 END
          ) /
          POWER(CAST((julianday('now') - julianday(p.created_at)) * 24.0 + 2.0 AS REAL), 1.3)
        ) as rank_score
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY rank_score DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params = [currentUserId, currentUserId, currentUserId, limit, offset];
  }

  db.all(query, params, (err, posts) => {
    if (err) {
      console.error('Feed fetch error:', err);
      return res.status(500).json({ error: 'Akış çekilirken hata oluştu' });
    }
    res.json(posts || []);
  });
});

router.post('/posts', auth, upload.single('image'), (req, res) => {
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

router.post('/posts/:id/like', auth, (req, res) => {
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

router.post('/posts/:id/comment', auth, (req, res) => {
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

router.get('/posts/:id/comments', auth, (req, res) => {
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

router.post('/posts/:id/repost', auth, (req, res) => {
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

router.delete('/posts/:id/repost', auth, (req, res) => {
  // Remove from reposts table
  db.run('DELETE FROM reposts WHERE user_id = ? AND post_id = ?', [req.user.id, req.params.id], (err) => {
    // Remove the generated repost post using repost_of_post_id
    db.run('DELETE FROM posts WHERE user_id = ? AND repost_of_post_id = ?', [req.user.id, req.params.id]);
    res.json({ success: true });
  });
});

// GET Post by ID (views++, likers, nested comments)
router.get('/posts/:id', auth, (req, res) => {
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
      db.all(`SELECT u.username, u.profile_photo FROM likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 5`, [req.params.id], (err, likers) => {
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

// DELETE Post (cascade: reposts, likes, comments, notifications)
router.delete('/posts/:id', auth, (req, res) => {
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post bulunamadı' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });

    db.serialize(() => {
      db.run('DELETE FROM likes WHERE post_id = ? OR post_id IN (SELECT id FROM posts WHERE repost_of_post_id = ?)', [req.params.id, req.params.id]);
      db.run('DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?)', [req.params.id]);
      db.run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
      db.run('DELETE FROM reposts WHERE post_id = ?', [req.params.id]);
      db.run('DELETE FROM notifications WHERE post_id = ?', [req.params.id]);
      db.run('DELETE FROM posts WHERE id = ? OR repost_of_post_id = ?', [req.params.id, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gönderi silinemedi' });
        res.json({ success: true });
      });
    });
  });
});

// DELETE Comment (cascade: alt-yorumlar + comment_likes + notifications)
router.delete('/comments/:id', auth, (req, res) => {
  const commentId = req.params.id;
  db.get(`
    SELECT c.user_id as comment_owner, p.user_id as post_owner
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE c.id = ?
  `, [commentId], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Yorum bulunamadı' });
    if (row.comment_owner !== req.user.id && row.post_owner !== req.user.id) {
      return res.status(403).json({ error: 'Yetkisiz' });
    }
    db.serialize(() => {
      db.run('DELETE FROM comment_likes WHERE comment_id = ? OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?)', [commentId, commentId]);
      db.run('DELETE FROM notifications WHERE comment_id = ?', [commentId]);
      db.run('DELETE FROM comments WHERE id = ? OR parent_id = ?', [commentId, commentId], (err) => {
        if (err) return res.status(500).json({ error: 'Yorum silinemedi' });
        res.json({ success: true });
      });
    });
  });
});

// PUT Post (edit content, owner only)
router.put('/posts/:id', auth, (req, res) => {
  const { content } = req.body;
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post bulunamadı' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
    db.run('UPDATE posts SET content = ? WHERE id = ?', [content, req.params.id], () => {
      res.json({ success: true });
    });
  });
});

router.post('/comments/:id/like', auth, (req, res) => {
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



  return router;
};
