const express = require('express');

module.exports = function(db, auth, checkSpamLimit, upload, createAndPushNotification, notifyFriends) {
  const router = express.Router();

// ============================================================
// DIRECT MESSAGES (DM) SYSTEM
// ============================================================
router.get('/messages/inbox', auth, (req, res) => {
  db.all(`
    SELECT 
      u.id as id,
      u.username,
      u.profile_photo,
      0 as is_group,
      (u.last_seen > datetime('now', '-2 minutes')) as is_online,
      m.content as last_message,
      m.from_user_id as last_message_sender_id,
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
      m.from_user_id as last_message_sender_id,
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


router.post('/messages/groups', auth, (req, res) => {
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

router.get('/messages/group/:id', auth, (req, res) => {
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

router.get('/messages/group/:id/members', auth, (req, res) => {
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

router.post('/messages/group/:id', auth, checkSpamLimit, (req, res) => {
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

router.get('/messages/:username', auth, (req, res) => {
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

router.get('/messages/:username/friendship-status', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (targetUser.id === req.user.id) return res.json({ isFriend: true });

    db.get(
      `SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?`,
      [req.user.id, targetUser.id],
      (err, row) => {
        const isFriend = row && row.status === 'accepted';
        res.json({ isFriend: !!isFriend, status: row ? row.status : 'none' });
      }
    );
  });
});

router.post('/messages/:username', auth, checkSpamLimit, (req, res) => {
  const { content, parentId, isShare } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Mesaj içeriği boş olamaz' });
  
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    // Check friendship status before allowing message sending
    db.get(
      `SELECT status FROM friendships WHERE user_id = ? AND friend_id = ?`,
      [req.user.id, targetUser.id],
      (err, friendship) => {
        if (!friendship || friendship.status !== 'accepted') {
          return res.status(403).json({ error: 'Yalnızca ekli arkadaşlarınızla mesajlaşabilirsiniz.' });
        }

        db.run('INSERT INTO messages (from_user_id, to_user_id, content, parent_id, is_share) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, targetUser.id, content.trim(), parentId || null, isShare ? 1 : 0], function() {
            // Also create a notification of type "message"
            db.run('INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, "message", ?)',
              [targetUser.id, req.user.id]);
            res.json({ success: true, messageId: this.lastID });
          });
      }
    );
  });
});


router.post('/messages/:username/read', auth, (req, res) => {
  db.get('SELECT id FROM users WHERE username = ?', [req.params.username], (err, targetUser) => {
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    db.run('UPDATE messages SET read = 1 WHERE from_user_id = ? AND to_user_id = ?',
      [targetUser.id, req.user.id], () => {
        res.json({ success: true });
      });
  });
});

// MESSAGES & REACTION ACTIONS
router.post('/messages/:id/reactions', auth, (req, res) => {
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

router.delete('/messages/:id', auth, (req, res) => {
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

// CHAT IMAGE UPLOAD
router.post('/messages/upload-image', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Görsel yüklenemedi' });
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, imageUrl });
});

// GET / POST DISAPPEARING MESSAGE SETTINGS (DM or Group)
router.get('/messages/settings/:target', auth, (req, res) => {
  const target = req.params.target;
  if (target.startsWith('group_')) {
    const groupId = parseInt(target.replace('group_', ''));
    db.get('SELECT disappearing_hours, avatar, name FROM chat_groups WHERE id = ?', [groupId], (err, group) => {
      res.json({ disappearing_hours: group ? (group.disappearing_hours || 24) : 24, avatar: group ? group.avatar : null, name: group ? group.name : '' });
    });
  } else {
    db.get('SELECT id FROM users WHERE username = ?', [target], (err, targetUser) => {
      if (!targetUser) return res.json({ disappearing_hours: 24 });
      const u1 = Math.min(req.user.id, targetUser.id);
      const u2 = Math.max(req.user.id, targetUser.id);
      db.get('SELECT disappearing_hours FROM chat_settings WHERE user1_id = ? AND user2_id = ?', [u1, u2], (err, row) => {
        res.json({ disappearing_hours: row ? row.disappearing_hours : 24 });
      });
    });
  }
});

router.post('/messages/settings/:target', auth, (req, res) => {
  const target = req.params.target;
  const hours = parseInt(req.body.disappearing_hours) || 24;
  
  if (target.startsWith('group_')) {
    const groupId = parseInt(target.replace('group_', ''));
    const avatar = req.body.avatar !== undefined ? req.body.avatar : null;
    let sql = 'UPDATE chat_groups SET disappearing_hours = ?';
    let params = [hours];
    if (avatar !== null) {
      sql += ', avatar = ?';
      params.push(avatar);
    }
    sql += ' WHERE id = ?';
    params.push(groupId);
    
    db.run(sql, params, () => {
      res.json({ success: true, disappearing_hours: hours, avatar });
    });
  } else {
    db.get('SELECT id FROM users WHERE username = ?', [target], (err, targetUser) => {
      if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      const u1 = Math.min(req.user.id, targetUser.id);
      const u2 = Math.max(req.user.id, targetUser.id);
      db.run('INSERT INTO chat_settings (user1_id, user2_id, disappearing_hours) VALUES (?, ?, ?) ON CONFLICT(user1_id, user2_id) DO UPDATE SET disappearing_hours = excluded.disappearing_hours',
        [u1, u2, hours], () => {
          res.json({ success: true, disappearing_hours: hours });
        });
    });
  }
});

// GROUP SETTINGS & MODERATION
router.put('/messages/groups/:id', auth, (req, res) => {
  const groupId = req.params.id;
  const { name, avatar, disappearing_hours } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Grup adı boş olamaz' });
  
  db.get('SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    const hours = parseInt(disappearing_hours) || 24;
    db.run('UPDATE chat_groups SET name = ?, avatar = COALESCE(?, avatar), disappearing_hours = ? WHERE id = ?',
      [name.trim(), avatar || null, hours, groupId], () => {
        res.json({ success: true });
      });
  });
});

router.delete('/messages/groups/:id', auth, (req, res) => {
  const groupId = req.params.id;
  db.get('SELECT * FROM chat_groups WHERE id = ?', [groupId], (err, group) => {
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
    if (group.created_by !== req.user.id) return res.status(403).json({ error: 'Grubu yalnızca oluşturan kişi silebilir.' });

    db.run('DELETE FROM chat_groups WHERE id = ?', [groupId], () => {
      db.run('DELETE FROM chat_group_members WHERE group_id = ?', [groupId]);
      db.run('DELETE FROM messages WHERE group_id = ?', [groupId]);
      res.json({ success: true });
    });
  });
});

router.post('/messages/groups/:id/members', auth, (req, res) => {
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

router.delete('/messages/groups/:id/members/:userId', auth, (req, res) => {
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

router.get('/messages/group/:id/stats', auth, (req, res) => {
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

router.get('/share/targets', auth, (req, res) => {
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


router.get('/messages/:id/reactions', auth, (req, res) => {
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


  return router;
};
