const express = require('express');

module.exports = function(db, auth, checkSpamLimit, createAndPushNotification) {
  const router = express.Router();

  function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Party API - YENİDEN: ÖZEL PARTİLER + DAVETLER
  router.post('/parties', auth, (req, res) => {
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
  router.post('/parties/join-code', auth, (req, res) => {
    const { code } = req.body;
    if (!code || !code.trim()) return res.status(400).json({ error: 'Davet kodu girilmelidir' });
    const cleanCode = code.trim();

    db.get('SELECT * FROM parties WHERE invite_code = ?', [cleanCode], (err, party) => {
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
          db.run("DELETE FROM notifications WHERE user_id = ? AND party_id = ? AND type = 'party_invite'", [req.user.id, party.id]);
          res.json({ success: true, partyId: party.id });
        });
      });
    });
  });

  // Davet Kodunu Sıfırlama / Yenileme
  router.post('/parties/:id/regenerate-invite', auth, (req, res) => {
    const partyId = req.params.id;
    checkPartyManagementPermission(partyId, req.user.id, (err, allowed) => {
      if (!allowed) return res.status(403).json({ error: 'Davet kodunu yenileme yetkiniz yok' });

      const newCode = generateInviteCode();
      db.run('UPDATE parties SET invite_code = ? WHERE id = ?', [newCode, partyId], () => {
        res.json({ success: true, inviteCode: newCode });
      });
    });
  });

  router.get('/parties', auth, (req, res) => {
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

  router.post('/parties/:id/invite', auth, (req, res) => {
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

  router.get('/parties/invites/pending', auth, (req, res) => {
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

  router.post('/parties/invites/:id/accept', auth, (req, res) => {
    db.get('SELECT * FROM party_invites WHERE id = ? AND to_user_id = ?', [req.params.id, req.user.id], (err, invite) => {
      if (!invite) return res.status(404).json({ error: 'Davet bulunamadı' });
      
      db.run('UPDATE party_invites SET status = "accepted" WHERE id = ?', [req.params.id], () => {
        db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [invite.party_id, req.user.id], () => {
          db.run("DELETE FROM notifications WHERE user_id = ? AND party_id = ? AND type = 'party_invite'", [req.user.id, invite.party_id]);
          res.json({ success: true, partyId: invite.party_id });
        });
      });
    });
  });

  router.post('/parties/invites/:id/reject', auth, (req, res) => {
    db.get('SELECT * FROM party_invites WHERE id = ? AND to_user_id = ?', [req.params.id, req.user.id], (err, invite) => {
      db.run('UPDATE party_invites SET status = "rejected" WHERE id = ? AND to_user_id = ?', 
        [req.params.id, req.user.id], () => {
        if (invite) {
          db.run("DELETE FROM notifications WHERE user_id = ? AND party_id = ? AND type = 'party_invite'", [req.user.id, invite.party_id]);
        }
        res.json({ success: true });
      });
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

  const PARTY_ROLE_RANK = { member: 10, moderator: 20, admin: 30, owner: 40 };

  function checkPartyModerationPermission(partyId, actorId, targetUserId, callback) {
    db.get('SELECT owner_id FROM parties WHERE id = ?', [partyId], (err, party) => {
      if (err || !party) return callback(null, false, 'Oda bulunamadı');
      if (parseInt(party.owner_id) === parseInt(targetUserId)) return callback(null, false, 'Kurucu üzerinde işlem yapılamaz');

      db.all('SELECT user_id, role FROM party_members WHERE party_id = ? AND user_id IN (?, ?)', [partyId, actorId, targetUserId], (memberErr, rows) => {
        if (memberErr || !rows || rows.length !== 2) return callback(null, false, 'Üye bulunamadı');
        const actor = rows.find(row => parseInt(row.user_id) === parseInt(actorId));
        const target = rows.find(row => parseInt(row.user_id) === parseInt(targetUserId));
        const actorRole = parseInt(party.owner_id) === parseInt(actorId) ? 'owner' : (actor?.role || 'member');
        const targetRole = target?.role || 'member';
        if ((PARTY_ROLE_RANK[actorRole] || 0) < PARTY_ROLE_RANK.moderator) return callback(null, false, 'Moderasyon yetkiniz yok');
        if ((PARTY_ROLE_RANK[actorRole] || 0) <= (PARTY_ROLE_RANK[targetRole] || 0)) return callback(null, false, 'Eşit veya üst roldeki üye üzerinde işlem yapılamaz');
        callback(null, true, null, actorRole, targetRole);
      });
    });
  }

  function writePartyModerationAudit(partyId, actorId, targetUserId, action, reason, metadata = null) {
    db.run(
      'INSERT INTO party_moderation_audit (party_id, actor_id, target_user_id, action, reason, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [partyId, actorId, targetUserId || null, action, reason || null, metadata ? JSON.stringify(metadata) : null]
    );
  }

  router.get('/parties/:id', auth, (req, res) => {
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
                EXISTS(SELECT 1 FROM party_voice_moderation pvm WHERE pvm.party_id = pm.party_id AND pvm.user_id = u.id AND (pvm.expires_at IS NULL OR pvm.expires_at > datetime('now'))) as server_muted,
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
  router.put('/parties/:id/name', auth, (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Oda adı boş olamaz' });

    checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
      if (!allowed) return res.status(403).json({ error: 'Bu işlem için oda yönetici yetkisi gereklidir' });

      db.run('UPDATE parties SET name = ? WHERE id = ?', [name.trim(), req.params.id], () => {
        res.json({ success: true, name: name.trim() });
      });
    });
  });

  function cleanupEmptyParties() {
    db.all('SELECT id, owner_id, name FROM parties', [], (err, parties) => {
      if (err || !parties || parties.length === 0) return;

      parties.forEach(p => {
        db.all(`
          SELECT pm.user_id, 
            (u.last_seen IS NOT NULL AND u.last_seen > datetime('now', '-5 minutes')) as is_recent,
            EXISTS(SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.status = 'active') as is_focusing
          FROM party_members pm
          JOIN users u ON pm.user_id = u.id
          WHERE pm.party_id = ?
        `, [p.id], (err, members) => {
          if (err) return;
          const hasActiveMembers = (members || []).some(m => Boolean(m.is_recent) || Boolean(m.is_focusing));

          if (!hasActiveMembers) {
            console.log(`[Party Cleanup] Odak odasında (${p.id} - ${p.name}) 5 dakikadır aktif üye kalmadı. Kurucuya bildirim gönderilip oda kapatılıyor.`);
            
            if (p.owner_id) {
              db.run(
                'INSERT INTO notifications (user_id, type, from_user_id, party_id) VALUES (?, "party_auto_closed", 0, ?)',
                [p.owner_id, p.id]
              );
            }

            db.run('DELETE FROM party_members WHERE party_id = ?', [p.id]);
            db.run('DELETE FROM party_channels WHERE party_id = ?', [p.id]);
            db.run('DELETE FROM party_messages WHERE party_id = ?', [p.id]);
            db.run('DELETE FROM party_bans WHERE party_id = ?', [p.id]);
            db.run('DELETE FROM party_moderation_audit WHERE party_id = ?', [p.id]);
            db.run('DELETE FROM parties WHERE id = ?', [p.id]);
          }
        });
      });
    });
  }
  setInterval(cleanupEmptyParties, 30000);

  // Create sub-channel
  router.post('/parties/:id/channels', auth, (req, res) => {
    const { name, userLimit, allowScreenShare } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Kanal adı boş olamaz' });

    checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
      if (!allowed) return res.status(403).json({ error: 'Kanal oluşturma yetkiniz yok' });

      // Check max 10 sub-channels limit
      db.get('SELECT COUNT(*) as channelCount FROM party_channels WHERE party_id = ?', [req.params.id], (err, countRow) => {
        if (countRow && countRow.channelCount >= 10) {
          return res.status(400).json({ error: 'Bir odak odasında en fazla 10 alt oda oluşturulabilir.' });
        }

        const screenShare = allowScreenShare ? 1 : 0;
        const proceedInsert = () => {
          db.get('SELECT MAX(position) as maxPos FROM party_channels WHERE party_id = ?', [req.params.id], (err, row) => {
            const pos = (row && row.maxPos !== null) ? row.maxPos + 1 : 0;
            const limit = parseInt(userLimit) || 0;

            db.run(
              'INSERT INTO party_channels (party_id, name, user_limit, position, is_default, allow_screen_share) VALUES (?, ?, ?, ?, 0, ?)',
              [req.params.id, name.trim(), limit, pos, screenShare],
              function() {
                res.json({ success: true, channelId: this.lastID });
              }
            );
          });
        };

        if (screenShare === 1) {
          db.get('SELECT COUNT(*) as ssCount FROM party_channels WHERE party_id = ? AND allow_screen_share = 1', [req.params.id], (err, ssRow) => {
            if (ssRow && ssRow.ssCount >= 3) {
              return res.status(400).json({ error: 'Bir odak odasında en fazla 3 alt kanalda yayın (ekran paylaşımı) izni verilebilir.' });
            }
            proceedInsert();
          });
        } else {
          proceedInsert();
        }
      });
    });
  });

  // Edit sub-channel
  router.put('/parties/:id/channels/:channelId', auth, (req, res) => {

  const { name, userLimit, allowScreenShare } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Kanal adı boş olamaz' });

  checkPartyManagementPermission(req.params.id, req.user.id, (err, allowed) => {
    if (!allowed) return res.status(403).json({ error: 'Kanal düzenleme yetkiniz yok' });

    const limit = parseInt(userLimit) || 0;
    const screenShare = allowScreenShare ? 1 : 0;

    const proceedUpdate = () => {
      db.run(
        'UPDATE party_channels SET name = ?, user_limit = ?, allow_screen_share = ? WHERE id = ? AND party_id = ?',
        [name.trim(), limit, screenShare, req.params.channelId, req.params.id],
        () => {
          res.json({ success: true });
        }
      );
    };

    if (screenShare === 1) {
      db.get('SELECT COUNT(*) as ssCount FROM party_channels WHERE party_id = ? AND allow_screen_share = 1 AND id != ?', [req.params.id, req.params.channelId], (err, ssRow) => {
        if (ssRow && ssRow.ssCount >= 3) {
          return res.status(400).json({ error: 'Bir odak odasında en fazla 3 alt kanalda yayın (ekran paylaşımı) izni verilebilir.' });
        }
        proceedUpdate();
      });
    } else {
      proceedUpdate();
    }
  });
});

// Delete sub-channel
router.delete('/parties/:id/channels/:channelId', auth, (req, res) => {
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
router.put('/parties/:id/channels-reorder', auth, (req, res) => {
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
router.post('/parties/:id/channels/:channelId/join', auth, (req, res) => {
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
router.post('/parties/:id/members/:targetUserId/move', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { channelId } = req.body;

  checkPartyModerationPermission(partyId, req.user.id, targetUserId, (err, allowed, errorMessage) => {
    if (!allowed) return res.status(403).json({ error: 'Kullanıcı taşıma yetkiniz yok' });

    db.get('SELECT * FROM party_channels WHERE id = ? AND party_id = ?', [channelId, partyId], (err, chan) => {
      if (!chan) return res.status(404).json({ error: 'Hedef kanal bulunamadı' });

      db.run('UPDATE party_members SET channel_id = ? WHERE party_id = ? AND user_id = ?', [channelId, partyId, targetUserId], () => {
        updateMemoryVoiceChannel(partyId, targetUserId, channelId);
        writePartyModerationAudit(partyId, req.user.id, targetUserId, 'move_member', null, { channelId: parseInt(channelId) });
        res.json({ success: true, channelId, targetUserId });
      });
    });
  });
});

// Update member role (Owner / Admin granting Moderator/Admin role)
router.put('/parties/:id/members/:targetUserId/role', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { role } = req.body; // 'admin', 'moderator', 'member'

  const allowedRoles = ['admin', 'moderator', 'member'];
  if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Geçersiz rol' });

  checkPartyModerationPermission(partyId, req.user.id, targetUserId, (err, allowed, errorMessage, requesterRole) => {
    if (!allowed || requesterRole === 'moderator') {
      return res.status(403).json({ error: 'Rol atamak için Kurucu veya Yönetici yetkisi gereklidir' });
    }

    if ((PARTY_ROLE_RANK[role] || 0) >= (PARTY_ROLE_RANK[requesterRole] || 0)) {
      return res.status(403).json({ error: 'Kendi rolünüze eşit veya üst bir rol atayamazsınız' });
    }

    db.run('UPDATE party_members SET role = ? WHERE party_id = ? AND user_id = ?', [role, partyId, targetUserId], () => {
      writePartyModerationAudit(partyId, req.user.id, targetUserId, 'change_role', null, { role });
      res.json({ success: true, role });
    });
  });
});

// Kick member from party
router.delete('/parties/:id/members/:targetUserId/kick', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { reason } = req.body || {};

  checkPartyModerationPermission(partyId, req.user.id, targetUserId, (err, allowed, errorMessage, requesterRole) => {
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
            if (global.closePartyWebSocket) global.closePartyWebSocket(partyId, targetUserId, 'Bir oda yöneticisi sizi odadan çıkardı');
            writePartyModerationAudit(partyId, req.user.id, targetUserId, 'kick_member', reason || null);
            db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
              [partyId, `Bir üye odadan atıldı.`]);
            res.json({ success: true });
          });
        });
      } else {
        db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], () => {
          if (global.closePartyWebSocket) global.closePartyWebSocket(partyId, targetUserId, 'Bir oda yöneticisi sizi odadan çıkardı');
          writePartyModerationAudit(partyId, req.user.id, targetUserId, 'kick_member', reason || null);
          db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
            [partyId, `Bir üye odadan atıldı.`]);
          res.json({ success: true });
        });
      }
    });
  });
});

// Ban member from party
router.post('/parties/:id/members/:targetUserId/ban', auth, (req, res) => {
  const partyId = req.params.id;
  const targetUserId = parseInt(req.params.targetUserId);
  const { reason } = req.body || {};

  checkPartyModerationPermission(partyId, req.user.id, targetUserId, (err, allowed, errorMessage, requesterRole) => {
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
            if (global.closePartyWebSocket) global.closePartyWebSocket(partyId, targetUserId, 'Bu odadan yasaklandınız');
            writePartyModerationAudit(partyId, req.user.id, targetUserId, 'ban_member', reason || null);
            db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
              [partyId, `Bir üye odadan yasaklandı.`]);
            res.json({ success: true });
          });
        });
    });
  });
});

// Moderation console: owners and admins can review and revoke room bans.
router.get('/parties/:id/moderation/bans', auth, (req, res) => {
  const partyId = parseInt(req.params.id);
  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, role) => {
    if (!allowed || !['owner', 'admin'].includes(role)) return res.status(403).json({ error: 'Yasak listesini görme yetkiniz yok' });
    db.all(
      `SELECT pb.*, u.username, u.profile_photo, moderator.username AS banned_by_username
       FROM party_bans pb
       JOIN users u ON u.id = pb.user_id
       LEFT JOIN users moderator ON moderator.id = pb.banned_by
       WHERE pb.party_id = ? ORDER BY pb.created_at DESC`,
      [partyId],
      (dbErr, bans) => {
        if (dbErr) return res.status(500).json({ error: 'Yasak listesi alınamadı' });
        res.json({ bans: bans || [] });
      }
    );
  });
});

router.delete('/parties/:id/members/:targetUserId/ban', auth, (req, res) => {
  const partyId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.targetUserId);
  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, role) => {
    if (!allowed || !['owner', 'admin'].includes(role)) return res.status(403).json({ error: 'Yasak kaldırma yetkiniz yok' });
    db.run('DELETE FROM party_bans WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], function(dbErr) {
      if (dbErr) return res.status(500).json({ error: 'Yasak kaldırılamadı' });
      if (!this.changes) return res.status(404).json({ error: 'Aktif yasak bulunamadı' });
      writePartyModerationAudit(partyId, req.user.id, targetUserId, 'unban_member');
      res.json({ success: true });
    });
  });
});

router.get('/parties/:id/moderation/audit', auth, (req, res) => {
  const partyId = parseInt(req.params.id);
  checkPartyManagementPermission(partyId, req.user.id, (err, allowed, role) => {
    if (!allowed || !['owner', 'admin', 'moderator'].includes(role)) {
      return res.status(403).json({ error: 'Moderasyon geçmişini görme yetkiniz yok' });
    }
    db.all(
      `SELECT audit.*, actor.username AS actor_username, target.username AS target_username
       FROM party_moderation_audit audit
       LEFT JOIN users actor ON actor.id = audit.actor_id
       LEFT JOIN users target ON target.id = audit.target_user_id
       WHERE audit.party_id = ?
       ORDER BY audit.created_at DESC, audit.id DESC
       LIMIT 100`,
      [partyId],
      (dbErr, rows) => {
        if (dbErr) return res.status(500).json({ error: 'Moderasyon geçmişi alınamadı' });
        res.json({ events: rows || [] });
      }
    );
  });
});

router.get('/parties/:id/live-status', auth, (req, res) => {
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

router.post('/parties/:id/messages', auth, checkSpamLimit, (req, res) => {
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

router.post('/parties/:id/join', auth, (req, res) => {
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
            db.run("DELETE FROM notifications WHERE user_id = ? AND party_id = ? AND type = 'party_invite'", [req.user.id, req.params.id]);
            res.json({ success: true });
          });
        });
      } else {
        db.run('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id], (err) => {
          if (err && !isOwner) return res.status(400).json({ error: 'Zaten partidesin' });

          db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
            [req.params.id, `@${req.user.username} odaya katıldı.`]);
          
          db.run("DELETE FROM notifications WHERE user_id = ? AND party_id = ? AND type = 'party_invite'", [req.user.id, req.params.id]);

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

router.post('/parties/:id/leave', auth, (req, res) => {
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
          if (global.partyConnections) {
            const partyConns = global.partyConnections.get(parseInt(partyId));
            if (partyConns) {
              partyConns.forEach(conn => {
                try { conn.ws.close(4004, 'Oda silindi'); } catch(e) {}
              });
              global.partyConnections.delete(parseInt(partyId));
            }
          }
          res.json({ success: true, deleted: true });
        });
      });
    } else {
      db.run('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], () => {
        if (global.closePartyWebSocket) global.closePartyWebSocket(partyId, req.user.id, 'Oda üyesi değilsiniz');
        db.run('INSERT INTO party_messages (party_id, user_id, content) VALUES (?, 0, ?)',
          [partyId, `@${req.user.username} odadan ayrıldı.`]);
        res.json({ success: true });
      });
    }
  });
});


// --- PARTY VOICE CHAT SIGNALING & STATE ENDPOINTS ---

// WebRTC bootstrap. Use a deployment-owned coturn service in production;
// credentials stay in environment variables and are never hard-coded in JS.
router.get('/rtc-config', auth, (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  const turnUrls = String(process.env.TURN_URLS || process.env.TURN_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrls.length && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  }

  res.json({ iceServers, iceCandidatePoolSize: 4, hasTurn: turnUrls.length > 0 && !!turnUsername && !!turnCredential });
});

// Global Active Voice Session Tracker per User
global.userActiveVoiceSessions = global.userActiveVoiceSessions || {};

router.get('/parties/:id/access-status', auth, (req, res) => {
  const partyId = parseInt(req.params.id);
  db.get('SELECT reason FROM party_bans WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (banErr, ban) => {
    if (ban) return res.json({ status: 'banned', reason: ban.reason || null });
    db.get('SELECT id FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (memberErr, member) => {
      res.json({ status: member ? 'member' : 'removed' });
    });
  });
});

// Server-enforced room mute. This state is authoritative: clients can display
// it but cannot clear it without a moderator action.
router.put('/parties/:id/members/:targetUserId/voice-mute', auth, (req, res) => {
  const partyId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.targetUserId);
  const { muted, reason = '', durationMinutes = null } = req.body || {};

  if (!Number.isInteger(partyId) || !Number.isInteger(targetUserId) || typeof muted !== 'boolean') {
    return res.status(400).json({ error: 'Geçersiz moderasyon isteği' });
  }

  checkPartyModerationPermission(partyId, req.user.id, targetUserId, (err, allowed, errorMessage) => {
    if (!allowed) return res.status(403).json({ error: errorMessage || 'Bu işlem için yetkiniz yok' });
    const duration = Math.max(0, Math.min(10080, parseInt(durationMinutes) || 0));
    const expiresAt = duration ? `datetime('now', '+${duration} minutes')` : 'NULL';

    if (muted) {
      db.run(
        `INSERT INTO party_voice_moderation (party_id, user_id, muted_by, reason, expires_at)
         VALUES (?, ?, ?, ?, ${expiresAt})
         ON CONFLICT(party_id, user_id) DO UPDATE SET muted_by = excluded.muted_by, reason = excluded.reason, expires_at = excluded.expires_at, created_at = datetime('now')`,
        [partyId, targetUserId, req.user.id, String(reason || '').trim().slice(0, 240)],
        dbErr => {
          if (dbErr) return res.status(500).json({ error: 'Susturma kaydedilemedi' });
          writePartyModerationAudit(partyId, req.user.id, targetUserId, 'voice_mute', reason, { durationMinutes: duration || null });
          if (global.partyVoiceStates?.[partyId]?.[targetUserId]) global.partyVoiceStates[partyId][targetUserId].serverMuted = true;
          res.json({ success: true, muted: true, durationMinutes: duration || null });
        }
      );
    } else {
      db.run('DELETE FROM party_voice_moderation WHERE party_id = ? AND user_id = ?', [partyId, targetUserId], dbErr => {
        if (dbErr) return res.status(500).json({ error: 'Susturma kaldırılamadı' });
        writePartyModerationAudit(partyId, req.user.id, targetUserId, 'voice_unmute', reason);
        if (global.partyVoiceStates?.[partyId]?.[targetUserId]) global.partyVoiceStates[partyId][targetUserId].serverMuted = false;
        res.json({ success: true, muted: false });
      });
    }
  });
});

// POST handover: user claims voice chat on current device (disconnects previous device)
router.post('/parties/:id/voice-handover', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const { targetDeviceId, channelId } = req.body;
    const username = req.user.username;
    const userId = req.user.id;

    if (global.partyConnections) {
      const partyConns = global.partyConnections.get(parseInt(partyId));
      if (partyConns && partyConns.has(userId)) {
        const conn = partyConns.get(userId);
        if (conn.ws.readyState === 1) { // WebSocket.OPEN
          conn.ws.send(JSON.stringify({
            type: 'rtc_signal',
            fromUsername: username,
            signal: { _handover: true, newDeviceId: targetDeviceId }
          }));
        }
      }
    }

    // Update active device session
    global.userActiveVoiceSessions = global.userActiveVoiceSessions || {};
    global.userActiveVoiceSessions[userId] = {
      partyId: parseInt(partyId),
      channelId: channelId ? parseInt(channelId) : null,
      deviceId: targetDeviceId,
      lastSeen: Date.now()
    };

    res.json({ success: true });
  } catch (err) {
    console.error('[Server Voice] Handover failed:', err);
    res.status(500).json({ error: 'Voice handover failed' });
  }
});

// (duplicate route removed - session start with partyId is handled above)

// --- SCREEN SHARE SIGNALING (reuses in-memory signal queue with type prefix) ---
global.partyScreenShareStates = {}; // partyId -> { username -> { sharing, channelId, ts } }

// Announce screen share start/stop
router.post('/parties/:id/screenshare-state', auth, (req, res) => {
  try {
    const partyId = req.params.id;
    const { sharing, channelId, validateOnly } = req.body;
    const username = req.user.username;

    // Verify membership
    db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (err, member) => {
      if (!member) return res.status(403).json({ error: 'Bu odada değilsiniz' });

      if (!global.partyScreenShareStates[partyId]) global.partyScreenShareStates[partyId] = {};

      if (sharing) {
        const isManager = ['owner', 'admin', 'moderator'].includes(member.role);
        const targetChanId = channelId ? parseInt(channelId) : (parseInt(member.channel_id) || 0);

        db.get('SELECT allow_screen_share, is_default FROM party_channels WHERE id = ? AND party_id = ?', [targetChanId, partyId], (err, chan) => {
          if (chan && chan.allow_screen_share === 0 && !isManager) {
            return res.status(403).json({ error: 'Bu kanalda ekran paylaşımı kapalı' });
          }

          if (validateOnly) {
            return res.json({ success: true, allowed: true });
          }

          if (targetChanId && targetChanId > 0) {
            db.run('UPDATE party_members SET channel_id = ? WHERE party_id = ? AND user_id = ?', [targetChanId, partyId, req.user.id]);
          }

          global.partyScreenShareStates[partyId][username] = { 
            sharing: true, 
            channelId: targetChanId, 
            ts: Date.now() 
          };
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
router.get('/parties/:id/screenshare-state', auth, (req, res) => {
  const partyId = req.params.id;
  db.get('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, req.user.id], (err, member) => {
    if (!member) return res.status(403).json({ error: 'Yetkisiz' });
    
    const ownChannelId = parseInt(member.channel_id) || 0;
    const states = global.partyScreenShareStates[partyId] || {};
    const now = Date.now();
    if (states[req.user.username]) states[req.user.username].ts = now;
    
    // Cleanup stale (>30s)
    Object.keys(states).forEach(u => { if (now - states[u].ts > 30000) delete states[u]; });
    
    const visibleStates = Object.fromEntries(
      Object.entries(states).filter(([, state]) => {
        if (!ownChannelId || !state.channelId) return true;
        return parseInt(state.channelId) === ownChannelId;
      })
    );
    res.json(visibleStates);
  });
});

// Screenshare signaling is now completely routed through WebSockets. No REST route needed.



  return router;
};
