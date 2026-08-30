const express = require('express');
const { getFileUrl } = require('../storage');

module.exports = function(db, auth, upload, createAndPushNotification, notifyFriends) {
  const router = express.Router();

  // Feed & Posts — Instagram/Twitter-Style Ranking Engine
  router.get('/feed/:tab', auth, (req, res) => {
    const tab = req.params.tab || 'discover';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    const currentUserId = req.user.id;

    let query = '';
    let params = [];

    if (tab === 'following') {
      query = `
        SELECT 
          COALESCE(orig_p.id, p.id) as id,
          COALESCE(orig_p.content, p.content) as content,
          COALESCE(orig_p.image, p.image) as image,
          COALESCE(orig_p.created_at, p.created_at) as created_at,
          COALESCE(orig_p.views, p.views) as views,
          COALESCE(orig_u.username, u.username) as username,
          COALESCE(orig_u.profile_photo, u.profile_photo) as profile_photo,
          COALESCE(orig_u.level, u.level) as level,
          COALESCE(orig_p.user_id, p.user_id) as user_id,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.username ELSE NULL END as reposter_username,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.id ELSE NULL END as reposter_id,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id)) as like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = COALESCE(orig_p.id, p.id)) as comment_count,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id)) as repost_count,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_liked,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_reposted
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN posts orig_p ON p.repost_of_post_id = orig_p.id
        LEFT JOIN users orig_u ON orig_p.user_id = orig_u.id
        WHERE p.user_id IN (
          SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
          UNION SELECT ?
        )
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [currentUserId, currentUserId, currentUserId, currentUserId, limit, offset];
    } else if (tab === 'trending') {
      query = `
        SELECT 
          COALESCE(orig_p.id, p.id) as id,
          COALESCE(orig_p.content, p.content) as content,
          COALESCE(orig_p.image, p.image) as image,
          COALESCE(orig_p.created_at, p.created_at) as created_at,
          COALESCE(orig_p.views, p.views) as views,
          COALESCE(orig_u.username, u.username) as username,
          COALESCE(orig_u.profile_photo, u.profile_photo) as profile_photo,
          COALESCE(orig_u.level, u.level) as level,
          COALESCE(orig_p.user_id, p.user_id) as user_id,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.username ELSE NULL END as reposter_username,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.id ELSE NULL END as reposter_id,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id)) as like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = COALESCE(orig_p.id, p.id)) as comment_count,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id)) as repost_count,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_liked,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_reposted,
          (
            ((SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id)) * 2.0 + 
             (SELECT COUNT(*) FROM comments WHERE post_id = COALESCE(orig_p.id, p.id)) * 4.0 + 
             (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id)) * 5.0) /
            POWER(CAST((julianday('now') - julianday(p.created_at)) * 24.0 + 2.0 AS REAL), 1.5)
          ) as rank_score
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN posts orig_p ON p.repost_of_post_id = orig_p.id
        LEFT JOIN users orig_u ON orig_p.user_id = orig_u.id
        WHERE datetime(p.created_at) > datetime('now', '-7 days')
        ORDER BY rank_score DESC, p.created_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [currentUserId, currentUserId, limit, offset];
    } else {
      query = `
        SELECT 
          COALESCE(orig_p.id, p.id) as id,
          COALESCE(orig_p.content, p.content) as content,
          COALESCE(orig_p.image, p.image) as image,
          COALESCE(orig_p.created_at, p.created_at) as created_at,
          COALESCE(orig_p.views, p.views) as views,
          COALESCE(orig_u.username, u.username) as username,
          COALESCE(orig_u.profile_photo, u.profile_photo) as profile_photo,
          COALESCE(orig_u.level, u.level) as level,
          COALESCE(orig_p.user_id, p.user_id) as user_id,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.username ELSE NULL END as reposter_username,
          CASE WHEN p.repost_of_post_id IS NOT NULL THEN u.id ELSE NULL END as reposter_id,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id)) as like_count,
          (SELECT COUNT(*) FROM comments WHERE post_id = COALESCE(orig_p.id, p.id)) as comment_count,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id)) as repost_count,
          (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_liked,
          (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id) AND user_id = ?) as user_reposted,
          (
            (
              (SELECT COUNT(*) FROM likes WHERE post_id = COALESCE(orig_p.id, p.id)) * 1.5 + 
              (SELECT COUNT(*) FROM comments WHERE post_id = COALESCE(orig_p.id, p.id)) * 3.5 + 
              (SELECT COUNT(*) FROM reposts WHERE post_id = COALESCE(orig_p.id, p.id)) * 4.5 +
              CASE WHEN p.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted') THEN 15.0 ELSE 0.0 END
            ) /
            POWER(CAST((julianday('now') - julianday(p.created_at)) * 24.0 + 2.0 AS REAL), 1.3)
          ) as rank_score
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN posts orig_p ON p.repost_of_post_id = orig_p.id
        LEFT JOIN users orig_u ON orig_p.user_id = orig_u.id
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

  // POST Create Post (Supports Images & Videos with Daily Quotas)
  router.post('/posts', auth, upload.single('image'), (req, res) => {
    const { content } = req.body;
    if (content && content.length > 2000) return res.status(400).json({ error: 'İçerik çok uzun (Maks: 2000 karakter)' });
    const image = req.file ? getFileUrl(req.file) : null;
    const isVideo = req.file && (req.file.mimetype.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(req.file.originalname || req.file.filename || ''));

    if (!isVideo) {
      db.run('INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)', [req.user.id, content, image], function(err) {
        if (err) {
          console.error('Post insertion failed:', err);
          return res.status(500).json({ error: 'Post kaydedilemedi' });
        }
        res.json({ postId: this.lastID });
      });
      return;
    }

    // 1. Check Active Video Limit (Max 2 active videos created today)
    db.get(`
      SELECT COUNT(*) as active_count
      FROM posts
      WHERE user_id = ?
        AND date(created_at) = date('now')
        AND (image LIKE '%.mp4' OR image LIKE '%.webm' OR image LIKE '%.mov' OR image LIKE '%.m4v' OR image LIKE '%.ogg')
    `, [req.user.id], (err, activeRow) => {
      if (err) {
        console.error('Active video check error:', err);
        return res.status(500).json({ error: 'Video limiti kontrol edilemedi' });
      }

      const activeCount = activeRow ? activeRow.active_count : 0;
      if (activeCount >= 2) {
        return res.status(400).json({ error: 'Günde en fazla 2 aktif video yayında tutabilirsiniz.' });
      }

      // 2. Check Daily Total Upload Quota (Max 5 total uploads today including deleted ones)
      db.get(`
        SELECT COUNT(*) as total_uploads
        FROM video_upload_logs
        WHERE user_id = ?
          AND date(created_at) = date('now')
      `, [req.user.id], (err, logRow) => {
        if (err) {
          console.error('Video quota check error:', err);
          return res.status(500).json({ error: 'Video kotası kontrol edilemedi' });
        }

        const totalUploads = logRow ? logRow.total_uploads : 0;
        if (totalUploads >= 5) {
          return res.status(400).json({ error: 'Günlük maksimum video yükleme kotanıza (5) ulaştınız.' });
        }

        // 3. Save Post & Log Upload
        db.run('INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)', [req.user.id, content, image], function(insertErr) {
          if (insertErr) {
            console.error('Post insertion failed:', insertErr);
            return res.status(500).json({ error: 'Post kaydedilemedi' });
          }
          const newPostId = this.lastID;
          db.run('INSERT INTO video_upload_logs (user_id, post_id) VALUES (?, ?)', [req.user.id, newPostId], (logErr) => {
            if (logErr) console.error('Error logging video upload:', logErr);
          });

          res.json({ postId: newPostId });
        });
      });
    });
  });

  // POST Like / Unlike Post
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

  // POST Add Comment
  router.post('/posts/:id/comment', auth, (req, res) => {
    const { content, parent_id } = req.body;
    const commentSnippet = (content || '').trim().slice(0, 80);
    db.run('INSERT INTO comments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)', [req.user.id, req.params.id, content, parent_id || null], function() {
      const insertedCommentId = this.lastID;
      db.get('SELECT user_id FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (parent_id) {
          db.get('SELECT user_id FROM comments WHERE id = ?', [parent_id], (err, parentComment) => {
            if (parentComment && parentComment.user_id !== req.user.id) {
              createAndPushNotification(parentComment.user_id, 'comment_reply', req.user.id, { 
                postId: req.params.id, 
                commentId: insertedCommentId,
                commentText: commentSnippet
              });
            }
          });
        } else {
          if (post && post.user_id !== req.user.id) {
            createAndPushNotification(post.user_id, 'post_comment', req.user.id, { 
              postId: req.params.id, 
              commentId: insertedCommentId,
              commentText: commentSnippet
            });
            notifyFriends(req.user.id, 'friend_activity_comment', { postId: req.params.id, commentId: insertedCommentId });
          }
        }
      });
      res.json({ commentId: insertedCommentId });
    });
  });

  // GET Post Comments
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

  // POST Repost
  router.post('/posts/:id/repost', auth, (req, res) => {
    const postId = parseInt(req.params.id);
    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı' });
      const rootPostId = post.repost_of_post_id || post.id;

      db.run('INSERT INTO reposts (user_id, post_id) VALUES (?, ?)', [req.user.id, rootPostId], (insertErr) => {
        if (insertErr) {
          return res.status(400).json({ error: 'Zaten yeniden paylaştınız' });
        }
        db.run('INSERT INTO posts (user_id, content, image, repost_of_post_id) VALUES (?, NULL, NULL, ?)', [req.user.id, rootPostId], () => {
          if (post.user_id !== req.user.id) {
            createAndPushNotification(post.user_id, 'post_repost', req.user.id, { postId: rootPostId });
          }
          res.json({ success: true });
        });
      });
    });
  });

  // DELETE Repost
  router.delete('/posts/:id/repost', auth, (req, res) => {
    const postId = parseInt(req.params.id);
    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
      const rootPostId = (post && post.repost_of_post_id) || postId;
      db.run('DELETE FROM reposts WHERE user_id = ? AND post_id = ?', [req.user.id, rootPostId], () => {
        db.run('DELETE FROM posts WHERE user_id = ? AND repost_of_post_id = ?', [req.user.id, rootPostId], () => {
          res.json({ success: true });
        });
      });
    });
  });

  // GET Post by ID (views++, likers, comments)
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

  // POST Comment Like / Unlike
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
