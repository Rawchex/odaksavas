/* ============================================================
   MESSAGES.JS — Direct Messages (DM) Client Logic with Replies & E2EE
   ============================================================ */

'use strict';

let _activeChatPartner = null;
let _activeChatPartnerPhoto = '';
let _activeChatPartnerDevice = 'desktop'; // 'mobile' | 'desktop'
let _activeChatPartnerLastSeen = null;
let _activeChatPartnerStatus = 'online';
let _activeChatType = 'user'; // 'user' or 'group'
let _activeChatId = null; // target user id or group id
let _chatPollInterval = null;
let _devicePollInterval = null;
let _replyToMessage = null;

function getChatChannelKey() {
  if (_activeChatType === 'group') {
    return `group_${_activeChatId}`;
  } else {
    const sorted = [currentUser.username, _activeChatPartner].sort().join('_');
    return sorted;
  }
}

// Call this when showing the messages page
async function initMessagesPage() {
  await loadInbox();
  // Start polling inbox & messages
  startChatPolling();
}

// Sol panel: Konuşmaları listele
let _lastInboxFingerprint = '';

async function loadInbox() {
  try {
    const res = await fetch(`/api/messages/inbox?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const chats = await res.json();

    // Fingerprint: only re-render if data changed
    const fp = chats.map(c => `${c.id}:${c.is_group}:${c.unread_count}:${c.last_message_time}:${_activeChatPartner === c.username ? 1 : 0}`).join('|');
    if (fp === _lastInboxFingerprint) return;
    _lastInboxFingerprint = fp;

    const inboxList = document.getElementById('inboxList');
    if (!inboxList) return;

    if (chats.length === 0) {
      inboxList.innerHTML = `<div style="text-align:center;padding:24px;font-size:11px;color:#444;font-weight:700">MESAJ KUTUNUZ BOŞ</div>`;
      return;
    }

    inboxList.innerHTML = chats.map(c => {
      const activeClass = (_activeChatPartner === c.username) ? 'active' : '';
      const unreadBadge = c.unread_count > 0 
        ? `<span class="inbox-unread-count">${c.unread_count}</span>` 
        : '';
      const key = c.is_group ? `group_${c.id}` : [currentUser.username, c.username].sort().join('_');
      const decryptedLastMsg = decryptText(c.last_message || '', key);

      return `
        <div class="inbox-item ${activeClass}" onclick="openDirectChat('${esc(c.username)}', ${c.is_group}, ${c.id})" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border-soft);background:#050505;cursor:pointer;position:relative">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div>
              ${c.is_group ? '<div class="avatar avatar-sm" style="background:#333;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">G</div>' : renderAvatar(c, 'avatar avatar-sm')}
            </div>
            <div style="min-width:0">
              <div style="font-weight:800;color:#fff;font-size:13px">${esc(c.username)}</div>
              <div style="font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${esc(decryptedLastMsg)}</div>
            </div>
          </div>
          ${unreadBadge}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load inbox:', err);
  }
}

// Sağ panel: Seçilen kullanıcı ile olan konuşmayı aç
async function openDirectChat(username, isGroup = 0, id = null) {
  _activeChatPartner = username;
  _activeChatPartnerPhoto = '';
  _activeChatPartnerDevice = 'desktop';
  _activeChatPartnerLastSeen = null;
  _activeChatPartnerStatus = 'online';
  _lastRenderedMsgIds = [];
  _lastReadReceiptMsgId = null;
  _activeChatType = isGroup ? 'group' : 'user';
  _activeChatId = id;
  cancelReply();
  
  // Asynchronously resolve direct partner's profile photo + device type
  if (_activeChatType === 'user') {
    try {
      const [uRes, dRes] = await Promise.all([
        fetch(`/api/users/${username}`),
        fetch(`/api/user/${encodeURIComponent(username)}/device`)
      ]);
      if (uRes.ok) {
        const uData = await uRes.json();
        _activeChatPartnerPhoto = uData.profile_photo || '';
      }
      if (dRes.ok) {
        const dData = await dRes.json();
        _activeChatPartnerDevice = dData.device_type || 'desktop';
        _activeChatPartnerLastSeen = dData.last_seen || null;
        _activeChatPartnerStatus = dData.status || 'online';
      }
    } catch (e) {
      console.warn('Failed to resolve target info:', e);
    }
  }

  // Mobile responsive layout support
  const inboxList = document.getElementById('inboxList');
  const chatArea = document.getElementById('chatArea');
  const placeholder = document.getElementById('chatPlaceholder');

  if (window.innerWidth <= 768) {
    inboxList.style.display = 'none';
    document.body.classList.add('chat-active');
  }
  if (chatArea) chatArea.style.display = 'flex';
  if (placeholder) placeholder.style.display = 'none';

  // Set chat header (Clickable to open profile if user)
  const headerUser = document.getElementById('chatHeaderUser');
  if (headerUser) {
    if (_activeChatType === 'group') {
      headerUser.innerHTML = `
        <span style="font-weight:900;color:#fff;font-size:14px;cursor:pointer" onclick="openGroupDetailsModal(${_activeChatId}, '${esc(username)}')">${esc(username)}</span>
      `;
      const badge = document.getElementById('chatDeviceBadge');
      if (badge) badge.style.display = 'none';
    } else {
      headerUser.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1px;cursor:pointer" onclick="openUserModal('${esc(username)}')">
          <span style="font-weight:900;color:#fff;font-size:14px">@${esc(username)}</span>
          <span id="chatDeviceSubtitle" class="chat-device-subtitle"></span>
        </div>
      `;
      updateDeviceIndicator(_activeChatPartnerDevice, username, _activeChatPartnerLastSeen, _activeChatPartnerStatus);
    }
  }

  // Load messages
  await refreshChatMessages();
  
  // Mark messages as read
  if (_activeChatType === 'user') {
    await fetch(`/api/messages/${encodeURIComponent(username)}/read`, { method: 'POST' });
    updateTotalUnreadMessageCount();
  }
  loadInbox(); // reload inbox list for badge update
}

let _lastRenderedMsgIds = [];
let _lastReadReceiptMsgId = null;

async function refreshChatMessages() {
  if (!_activeChatPartner) return;
  try {
    const ts = Date.now();
    const url = _activeChatType === 'group' 
      ? `/api/messages/group/${_activeChatId}?_t=${ts}`
      : `/api/messages/${encodeURIComponent(_activeChatPartner)}?_t=${ts}`;
      
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const messages = await res.json();

    // Mark unread as read (fire-and-forget, no re-fetch)
    if (_activeChatType === 'user' && messages.length > 0) {
      const hasUnread = messages.some(m => m.from_username === _activeChatPartner && m.read === 0);
      if (hasUnread) {
        fetch(`/api/messages/${encodeURIComponent(_activeChatPartner)}/read`, { method: 'POST' }).catch(() => {});
        updateTotalUnreadMessageCount();
        // Mark locally so read receipt renders this cycle
        messages.forEach(m => {
          if (m.from_username === _activeChatPartner) m.read = 1;
        });
      }
    }

    const container = document.getElementById('chatMessages');
    if (!container) return;

    const wasNearBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 60;
    const key = getChatChannelKey();

    // Find latest read message ID for receipt indicator
    let lastReadMsgId = null;
    if (_activeChatType === 'user') {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].from_username === currentUser.username && messages[i].read === 1) {
          lastReadMsgId = messages[i].id;
          break;
        }
      }
    }

    // Full re-render only if first load, message set structurally changed, or reactions changed
    const currentFingerprints = messages.map(m => `${m.id}_${m.reactions || ''}`);
    const idsMatch = _lastRenderedMsgIds.length === currentFingerprints.length &&
                     _lastRenderedMsgIds.every((fp, i) => fp === currentFingerprints[i]);

    if (!idsMatch) {
      // Build HTML — same rendering logic as before
      container.innerHTML = messages.map(m => renderMessageBubble(m, key, lastReadMsgId)).join('');
      _lastRenderedMsgIds = currentFingerprints;
      _lastReadReceiptMsgId = lastReadMsgId;

      // Load post previews for new render
      messages.forEach(m => {
        const decrypted = decryptText(m.content, key);
        if (decrypted.startsWith('[POST_SHARE]:')) {
          const postId = parseInt(decrypted.split(':')[1]);
          setTimeout(() => loadSharedPostPreview(m.id, postId), 0);
        }
      });
    } else if (lastReadMsgId !== _lastReadReceiptMsgId) {
      // Only update read receipt badge (no full re-render)
      _updateReadReceipt(container, lastReadMsgId, _lastReadReceiptMsgId);
      _lastReadReceiptMsgId = lastReadMsgId;
    }

    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Failed to refresh messages:', err);
  }
}

// Update only the read receipt indicator without touching the rest of the DOM
function _updateReadReceipt(container, newId, oldId) {
  // Remove old receipt
  if (oldId) {
    const oldReceipt = container.querySelector(`#chat-msg-${oldId} .msg-read-receipt`);
    if (oldReceipt) oldReceipt.remove();
  }
  // Add new receipt
  if (newId) {
    const newMsg = container.querySelector(`#chat-msg-${newId}`);
    if (newMsg) {
      const col = newMsg.querySelector('div[style*="flex-direction:column"]');
      if (col) {
        const existing = col.querySelector('.msg-read-receipt');
        if (!existing) {
          const photo = _activeChatPartnerPhoto;
          const init = _activeChatPartner ? _activeChatPartner[0].toUpperCase() : '?';
          const imgHtml = photo
            ? `<img src="${photo}" alt="${esc(_activeChatPartner)}" style="width:14px; height:14px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.15)">`
            : `<span style="display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%; background:#222; color:#aaa; font-size:7px; font-weight:bold; border:1px solid rgba(255,255,255,0.1);">${init}</span>`;
          const div = document.createElement('div');
          div.className = 'msg-read-receipt';
          div.style.cssText = 'display:flex; justify-content:flex-end; align-self:flex-end; margin-top:-4px; margin-bottom:4px; margin-right:2px;';
          div.title = 'Görüldü';
          div.innerHTML = imgHtml;
          col.appendChild(div);
        }
      }
    }
  }
}

// Single message bubble renderer (extracted for reuse)
function renderMessageBubble(m, key, lastReadMsgId) {
  if (m.from_user_id === 0 || !m.from_username) {
    return `
      <div style="align-self:center; text-align:center; margin:10px 0; font-size:11px; color:#555; font-weight:800; text-transform:uppercase; letter-spacing:1px; width:100%;">
        ${esc(m.content)}
      </div>
    `;
  }

  const isMe = m.from_username === currentUser.username;
  const align = isMe ? 'flex-end' : 'flex-start';
  const labelColor = isMe ? 'rgba(255,255,255,0.4)' : '#555';
  const decryptedContent = decryptText(m.content, key);
  const isPostShare = decryptedContent.startsWith('[POST_SHARE]:');

  let bubbleClass = isMe ? 'msg-body-wrapper msg-sender-bubble' : 'msg-body-wrapper';
  let bubbleStyle = `background:${isMe ? '' : '#0a0a0a'};color:#fff;border:${isMe ? 'none' : '1px solid #1a1a1a'};padding:8px 14px;font-size:12.5px;font-weight:600;border-radius:18px;word-break:break-word;cursor:pointer;transition:transform 0.1s; touch-action:pan-y;`;
  
  if (isPostShare) {
    bubbleClass = '';
    bubbleStyle = 'background:transparent; border:none; padding:0; box-shadow:none; cursor:pointer; display:block; touch-action:pan-y;';
  }

  let mainBodyHtml = `<div>${esc(decryptedContent)}</div>`;
  if (isPostShare) {
    const parts = decryptedContent.split(':');
    const postId = parseInt(parts[1]);
    const extraMsg = parts.slice(2).join(':');
    
    mainBodyHtml = `
      <div class="chat-post-share-card" id="post-share-card-${m.id}" onclick="event.stopPropagation(); openSharedPostInChat(${postId})">
        <div style="font-size:10px;color:#888;padding:8px">Yükleniyor...</div>
      </div>
    `;
    if (extraMsg) {
      mainBodyHtml += `<div style="margin-top:6px;font-size:12px;font-weight:600;word-break:break-word;">${esc(extraMsg)}</div>`;
    }
  }

  let replyHtml = '';
  if (m.parent_content) {
    let decryptedParent = decryptText(m.parent_content, key);
    if (decryptedParent.startsWith('[POST_SHARE]:')) {
      decryptedParent = '📄 Paylaşılan Gönderi';
    }
    replyHtml = `
      <div class="msg-reply-bubble" style="cursor:pointer" onclick="event.stopPropagation(); scrollToMessage(${m.parent_id})">
        <strong>@${esc(m.parent_from_username)}</strong>
        ${esc(decryptedParent)}
      </div>
    `;
  }

  let avatarHtml = '';
  if (!isMe) {
    avatarHtml = `
      <div style="cursor:pointer" onclick="openUserModal('${esc(m.from_username)}')">
        ${renderAvatar({ username: m.from_username, profile_photo: m.from_photo }, 'avatar avatar-xs')}
      </div>
    `;
  }

  const reactionsList = m.reactions 
    ? m.reactions.split(',').map(r => {
        const parts = r.split(':');
        return { reaction: parts[0], username: parts[1] };
      })
    : [];
  
  const reactionGroups = {};
  reactionsList.forEach(r => {
    if (!reactionGroups[r.reaction]) reactionGroups[r.reaction] = [];
    reactionGroups[r.reaction].push(r.username);
  });

  let reactionsHtml = '';
  if (reactionsList.length > 0) {
    reactionsHtml = `
      <div class="msg-reactions-container" style="align-self:${align};">
        ${Object.entries(reactionGroups).map(([emoji, users]) => {
          const count = users.length;
          const namesText = users.join(', ');
          return `
            <div class="msg-reaction-badge" title="${esc(namesText)}" onclick="showReactionDetails(${m.id})">
              <span>${emoji}</span>
              ${count > 1 ? `<span style="font-size:8px;font-weight:bold;color:#aaa">${count}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const readReceiptHtml = (() => {
    if (m.id === lastReadMsgId) {
      const photo = _activeChatPartnerPhoto;
      const init = _activeChatPartner ? _activeChatPartner[0].toUpperCase() : '?';
      const imgHtml = photo 
        ? `<img src="${photo}" alt="${esc(_activeChatPartner)}" style="width:14px; height:14px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.15)">`
        : `<span style="display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%; background:#222; color:#aaa; font-size:7px; font-weight:bold; border:1px solid rgba(255,255,255,0.1);">${init}</span>`;
      return `
        <div class="msg-read-receipt" style="display:flex; justify-content:flex-end; align-self:flex-end; margin-top:-4px; margin-bottom:4px; margin-right:2px;" title="Görüldü">
          ${imgHtml}
        </div>
      `;
    }
    return '';
  })();

  return `
    <div id="chat-msg-${m.id}" class="chat-msg-row-item" style="display:flex;align-items:flex-end;gap:8px;align-self:${align};max-width:75%;transition:all 0.3s ease;">
      ${avatarHtml}
      <div style="display:flex;flex-direction:column;align-self:${align};gap:4px">
        <div class="msg-bubble-row">
          <div class="${bubbleClass}" 
               style="${bubbleStyle}"
               ondblclick="submitReaction(${m.id}, '❤️')"
               onclick="openMessageActionsMenu(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})"
               ontouchstart="handleTouchStart(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})"
               ontouchmove="handleTouchMove(event)"
               ontouchend="handleTouchEnd(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})">
            ${replyHtml}
            ${mainBodyHtml}
          </div>
        </div>
        ${reactionsHtml}
        <div style="font-size:9px;color:${labelColor};font-weight:700;align-self:${align};margin-top:2px;margin-bottom:6px">
          ${(() => {
            const dateStr = m.created_at.endsWith('Z') || m.created_at.includes('+') ? m.created_at : m.created_at + 'Z';
            return new Date(dateStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          })()}
        </div>
        ${readReceiptHtml}
      </div>
    </div>
  `;
}

// Mesaj yanıtlama modunu aktif et
function setReplyMessage(id, content, from_username) {
  _replyToMessage = { id, content, from_username };
  
  // Render reply bar above input
  let replyBar = document.getElementById('chatReplyBar');
  if (!replyBar) {
    replyBar = document.createElement('div');
    replyBar.id = 'chatReplyBar';
    replyBar.className = 'chat-reply-preview-bar';
    const inputBar = document.querySelector('.chat-input-bar');
    if (inputBar) {
      inputBar.parentNode.insertBefore(replyBar, inputBar);
    }
  }

  replyBar.style.display = 'flex';
  replyBar.innerHTML = `
    <div class="chat-reply-preview-text">
      <strong>@${esc(from_username)}</strong> kullanıcısına yanıt: <i>"${esc(content)}"</i>
    </div>
    <button class="chat-reply-close-btn" onclick="cancelReply()">✕</button>
  `;
}

function cancelReply() {
  _replyToMessage = null;
  const replyBar = document.getElementById('chatReplyBar');
  if (replyBar) replyBar.style.display = 'none';
}

// Mesaj gönder
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const content = input?.value?.trim();
  if (!content || !_activeChatPartner) return;

  const key = getChatChannelKey();
  const encryptedContent = encryptText(content, key);
  const parentId = _replyToMessage ? _replyToMessage.id : null;

  input.value = '';
  cancelReply();

  try {
    const url = _activeChatType === 'group' 
      ? `/api/messages/group/${_activeChatId}`
      : `/api/messages/${encodeURIComponent(_activeChatPartner)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: encryptedContent, parentId })
    });
    if (res.ok) {
      await refreshChatMessages();
      loadInbox();
    } else {
      showToast('Mesaj gönderilemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// Konuşmayı kapat (mobil için geri tuşu)
function closeChatArea() {
  _activeChatPartner = null;
  _lastRenderedMsgIds = [];
  _lastReadReceiptMsgId = null;
  _lastInboxFingerprint = '';
  cancelReply();
  const inboxList = document.getElementById('inboxList');
  const chatArea = document.getElementById('chatArea');
  const placeholder = document.getElementById('chatPlaceholder');

  document.body.classList.remove('chat-active');

  if (inboxList) inboxList.style.display = 'flex';
  if (chatArea) chatArea.style.display = 'none';
  if (placeholder && window.innerWidth > 768) placeholder.style.display = 'flex';
}

// Polling interval trigger
function startChatPolling() {
  stopChatPolling();
  _chatPollInterval = setInterval(async () => {
    if (activePage === 'messages') {
      await loadInbox();
      await refreshChatMessages();
    }
  }, 4000);

  // Device type + status poll — every 30s
  _devicePollInterval = setInterval(async () => {
    if (activePage === 'messages' && _activeChatPartner && _activeChatType === 'user') {
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(_activeChatPartner)}/device?_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          _activeChatPartnerDevice = data.device_type || 'desktop';
          _activeChatPartnerLastSeen = data.last_seen || null;
          _activeChatPartnerStatus = data.status || 'online';
          updateDeviceIndicator(_activeChatPartnerDevice, _activeChatPartner, _activeChatPartnerLastSeen, _activeChatPartnerStatus);
        }
      } catch {}
    }
  }, 30000);
}

function stopChatPolling() {
  if (_chatPollInterval) { clearInterval(_chatPollInterval); _chatPollInterval = null; }
  if (_devicePollInterval) { clearInterval(_devicePollInterval); _devicePollInterval = null; }
}

// Device icon + subtitle renderer
// isActive: user seen within 2 min AND status not 'invisible'
function _isPartnerActive(lastSeen, status) {
  if (status === 'invisible') return false;
  if (!lastSeen) return false;
  const seenMs = new Date(lastSeen + 'Z').getTime(); // SQLite returns UTC without Z
  return (Date.now() - seenMs) < 120000; // 2 minutes
}

function updateDeviceIndicator(device, username, lastSeen, status) {
  const badge = document.getElementById('chatDeviceBadge');
  const subtitle = document.getElementById('chatDeviceSubtitle');
  if (!badge && !subtitle) return;

  const isMobile = device === 'mobile';
  const isActive = _isPartnerActive(lastSeen, status);

  // SVG icons — monochrome
  const mobileIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/>
    <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>
    <line x1="9" y1="5" x2="15" y2="5"/>
  </svg>`;
  const desktopIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="13" rx="2"/>
    <polyline points="8,21 12,17 16,21"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
  </svg>`;

  if (badge) {
    badge.innerHTML = isMobile ? mobileIcon : desktopIcon;
    badge.style.display = 'flex';
    // Reset color classes — always monochrome
    badge.className = 'chat-device-badge';
    const tip = isActive
      ? (isMobile ? `@${username} şu an mobilde` : `@${username} şu an bilgisayarda`)
      : (isMobile ? `@${username} en son mobildeydi` : `@${username} en son bilgisayardaydı`);
    badge.setAttribute('title', tip);
  }

  if (subtitle) {
    if (isActive) {
      subtitle.textContent = isMobile ? 'şu an mobilde ·' : 'şu an bilgisayarda ·';
    } else {
      subtitle.textContent = isMobile ? 'en son mobilde ·' : 'en son bilgisayardaydı ·';
    }
    subtitle.className = 'chat-device-subtitle';
  }
}

// Device info popup
function showDevicePopup() {
  const existing = document.getElementById('deviceInfoPopup');
  if (existing) { existing.remove(); return; }

  const isMobile = _activeChatPartnerDevice === 'mobile';
  const isActive = _isPartnerActive(_activeChatPartnerLastSeen, _activeChatPartnerStatus);
  const partner = _activeChatPartner || 'Kullanıcı';

  const deviceLabel = isMobile ? 'Mobil Cihaz' : 'Bilgisayar';
  const deviceDetail = isMobile ? 'telefon veya tablet' : 'masaüstü veya dizüstü bilgisayar';
  const stateText = isActive
    ? `@${esc(partner)} şu anda <strong>${deviceDetail}</strong> üzerinden bağlanıyor.`
    : `@${esc(partner)} en son <strong>${deviceDetail}</strong> üzerinden bağlanmıştı.`;

  const iconSvg = isMobile
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17.5" r="0.9" fill="currentColor" stroke="none"/><line x1="9" y1="5" x2="15" y2="5"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="13" rx="2"/><polyline points="8,21 12,17 16,21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>`;

  const popup = document.createElement('div');
  popup.id = 'deviceInfoPopup';
  popup.className = 'device-info-popup';
  popup.innerHTML = `
    <div class="dip-inner">
      <div class="dip-icon">${iconSvg}</div>
      <div class="dip-title">${deviceLabel}</div>
      <div class="dip-desc">${stateText}</div>
      <div class="dip-note">Cihaz değiştiğinde otomatik güncellenir.</div>
    </div>
  `;

  const badge = document.getElementById('chatDeviceBadge');
  if (badge) {
    const rect = badge.getBoundingClientRect();
    popup.style.top = (rect.bottom + 8) + 'px';
    popup.style.right = (window.innerWidth - rect.right) + 'px';
  } else {
    popup.style.top = '70px';
    popup.style.right = '12px';
  }

  document.body.appendChild(popup);

  const dismiss = (e) => {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 100);
  setTimeout(() => { popup.remove(); }, 5000);
}


// Total unread messages indicator dot for navbar
async function updateTotalUnreadMessageCount() {
  try {
    const res = await fetch('/api/messages/inbox');
    if (!res.ok) return;
    const chats = await res.json();
    const totalUnread = chats.reduce((acc, c) => acc + (c.unread_count || 0), 0);

    const dot = document.getElementById('messageNotifDot');
    if (dot) {
      if (totalUnread > 0) {
        dot.classList.add('show');
        dot.textContent = totalUnread > 9 ? '9+' : totalUnread;
      } else {
        dot.classList.remove('show');
      }
    }
  } catch {}
}

function stopChatPolling() {
  if (_chatPollInterval) {
    clearInterval(_chatPollInterval);
    _chatPollInterval = null;
  }
}

// ============================================================
// GROUP CHATS (Monochrome / Simplified Selection System)
// ============================================================
let _friendsCacheForGroup = [];
let _selectedFriendsForGroup = new Set();
let _groupSearchTimer = null;

async function openCreateGroupModal() {
  const m = document.getElementById('createGroupModal');
  if (m) m.classList.add('open');
  
  _selectedFriendsForGroup.clear();
  
  const itemsContainer = document.getElementById('createGroupFriendsItems');
  if (itemsContainer) itemsContainer.innerHTML = '<div style="font-size:11px;color:#888;padding:8px">Yükleniyor...</div>';
  
  const otherContainer = document.getElementById('createGroupOtherResults');
  if (otherContainer) otherContainer.innerHTML = '';
  
  const searchInput = document.getElementById('createGroupSearch');
  if (searchInput) searchInput.value = '';
  
  renderSelectedGroupUsersPills();
  
  try {
    const res = await fetch('/api/friends');
    if (res.ok) {
      _friendsCacheForGroup = await res.json();
      renderCreateGroupFriends();
    } else {
      if (itemsContainer) itemsContainer.innerHTML = '<div style="font-size:11px;color:red;padding:8px">Arkadaşlar yüklenemedi</div>';
    }
  } catch (err) {
    console.error('Failed to load friends for group:', err);
    if (itemsContainer) itemsContainer.innerHTML = '<div style="font-size:11px;color:red;padding:8px">Hata oluştu</div>';
  }
}

function closeCreateGroupModal() {
  const m = document.getElementById('createGroupModal');
  if (m) {
    m.classList.remove('open');
    document.getElementById('createGroupName').value = '';
    document.getElementById('createGroupSearch').value = '';
    const otherResults = document.getElementById('createGroupOtherResults');
    if (otherResults) otherResults.innerHTML = '';
  }
}

function renderCreateGroupFriends() {
  const itemsContainer = document.getElementById('createGroupFriendsItems');
  if (!itemsContainer) return;
  
  const searchVal = (document.getElementById('createGroupSearch')?.value || '').toLowerCase().trim();
  
  // Filter cached friends
  const filteredFriends = _friendsCacheForGroup.filter(f => 
    f.username.toLowerCase().includes(searchVal)
  );
  
  if (filteredFriends.length === 0 && searchVal === '') {
    itemsContainer.innerHTML = '<div style="grid-column:span 4;font-size:11px;color:#555;padding:24px;text-align:center;font-weight:700">Arkadaş bulunamadı</div>';
    return;
  }
  
  itemsContainer.innerHTML = filteredFriends.map(f => {
    const isSelected = _selectedFriendsForGroup.has(f.username);
    const selectChar = isSelected ? '✓' : '';
    const selectedClass = isSelected ? 'selected' : '';
    
    return `
      <div class="share-item ${selectedClass}" onclick="toggleGroupFriendSelection('${esc(f.username)}')">
        <div class="share-avatar-wrapper">
          ${renderAvatar({ username: f.username, profile_photo: f.profile_photo }, 'share-avatar-img')}
          <div class="share-select-badge">${selectChar}</div>
        </div>
        <span class="share-name-label">@${esc(f.username)}</span>
      </div>
    `;
  }).join('');
}

function toggleGroupFriendSelection(username) {
  if (_selectedFriendsForGroup.has(username)) {
    _selectedFriendsForGroup.delete(username);
  } else {
    _selectedFriendsForGroup.add(username);
  }
  renderCreateGroupFriends();
  
  // Re-filter other results if searching
  const searchInput = document.getElementById('createGroupSearch');
  if (searchInput && searchInput.value.trim()) {
    handleGroupSearchInput(searchInput.value);
  }
  renderSelectedGroupUsersPills();
}

function handleGroupSearchInput(value) {
  // 1. Instantly filter and render matching friends
  renderCreateGroupFriends();
  
  // 2. Debounced search for other users
  clearTimeout(_groupSearchTimer);
  const q = value.trim();
  if (!q) {
    const otherContainer = document.getElementById('createGroupOtherResults');
    if (otherContainer) otherContainer.innerHTML = '';
    return;
  }
  
  _groupSearchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const users = await res.json();
      renderCreateGroupOtherUsers(users);
    } catch (err) {
      console.error(err);
    }
  }, 300);
}

function renderCreateGroupOtherUsers(users) {
  const container = document.getElementById('createGroupOtherResults');
  if (!container) return;
  
  const friendUsernames = new Set(_friendsCacheForGroup.map(f => f.username));
  
  // Filter out users who are already friends and self
  const others = users.filter(u => !friendUsernames.has(u.username) && u.username !== currentUser.username);
  
  if (others.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = others.map(u => {
    const isSelected = _selectedFriendsForGroup.has(u.username);
    const selectChar = isSelected ? '✓' : '';
    const selectedClass = isSelected ? 'selected' : '';
    
    return `
      <div class="share-item ${selectedClass}" onclick="toggleGroupFriendSelection('${esc(u.username)}')">
        <div class="share-avatar-wrapper">
          ${renderAvatar({ username: u.username, profile_photo: u.profile_photo }, 'share-avatar-img')}
          <div class="share-select-badge">${selectChar}</div>
        </div>
        <span class="share-name-label">@${esc(u.username)}</span>
      </div>
    `;
  }).join('');
}

function renderSelectedGroupUsersPills() {
  const container = document.getElementById('selectedGroupUsersPills');
  if (!container) return;
  
  if (_selectedFriendsForGroup.size === 0) {
    container.innerHTML = '<span style="font-size:11px;color:#444;font-weight:700">Henüz üye seçilmedi</span>';
    return;
  }
  
  container.innerHTML = Array.from(_selectedFriendsForGroup).map(username => {
    return `
      <div class="group-pill" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:14px; padding:4px 10px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:6px;">
        <span>@${esc(username)}</span>
        <span style="cursor:pointer;font-weight:900;color:var(--danger);" onclick="removeGroupUserSelection('${esc(username)}')">✕</span>
      </div>
    `;
  }).join('');
}

function removeGroupUserSelection(username) {
  _selectedFriendsForGroup.delete(username);
  renderCreateGroupFriends();
  
  // Re-filter other results if searching
  const searchInput = document.getElementById('createGroupSearch');
  if (searchInput && searchInput.value.trim()) {
    handleGroupSearchInput(searchInput.value);
  }
  renderSelectedGroupUsersPills();
}

async function submitCreateGroup() {
  const name = document.getElementById('createGroupName').value.trim();
  
  if (!name) {
    showToast('Lütfen grup adını girin');
    return;
  }
  
  if (_selectedFriendsForGroup.size === 0) {
    showToast('Lütfen en az bir üye seçin');
    return;
  }
  
  const users = Array.from(_selectedFriendsForGroup);
  
  try {
    const res = await fetch('/api/messages/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, users })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Grup oluşturuldu!');
      closeCreateGroupModal();
      await loadInbox();
    } else {
      showToast(data.error || 'Hata oluştu');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// ============================================================
// INSTAGRAM-STYLE MESSAGE INTERACTIONS & REACTION MECHANISMS
// ============================================================
let _menuActiveMsgId = null;
let _menuActiveMsgContent = null;
let _menuActiveMsgSender = null;

function openMessageActionsMenu(event, messageId, content, fromUsername, isMe) {
  event.stopPropagation();
  _menuActiveMsgId = messageId;
  _menuActiveMsgContent = content;
  _menuActiveMsgSender = fromUsername;

  // Retrieve bounding rectangle synchronously before the event gets recycled
  const bubble = event.currentTarget;
  const rect = bubble.getBoundingClientRect();
  const bubbleRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right
  };

  const modal = document.getElementById('messageActionsModal');
  const popover = document.getElementById('messageActionsPopover');
  const deleteBtn = document.getElementById('actionDeleteBtn');
  
  if (!modal || !popover) return;
  
  if (deleteBtn) {
    deleteBtn.style.display = isMe ? 'flex' : 'none';
  }

  // Show container to calculate popover offset dimensions
  modal.style.display = 'block';
  requestAnimationFrame(() => {
    modal.classList.add('open');

    const popWidth = popover.offsetWidth || 200;
    const popHeight = popover.offsetHeight || 180;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Place popover relative to bubble:
    let left = isMe ? (bubbleRect.left - popWidth - 10) : (bubbleRect.right + 10);

    // Keep popover inside horizontal screen edges
    if (left < 12) {
      left = bubbleRect.right + 10;
    }
    if (left + popWidth > viewportWidth - 12) {
      left = Math.max(12, bubbleRect.left + (bubbleRect.width - popWidth) / 2);
    }

    // Keep popover inside vertical screen edges
    let top = bubbleRect.top;
    if (top + popHeight > viewportHeight - 12) {
      top = viewportHeight - popHeight - 12;
    }
    top = Math.max(12, top);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  });
}

function closeMessageActionsModal() {
  const modal = document.getElementById('messageActionsModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 150);
  }
}

async function submitReaction(messageId, emoji) {
  try {
    const res = await fetch(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction: emoji })
    });
    if (res.ok) {
      await refreshChatMessages();
    }
  } catch (err) {
    console.error('Failed to submit reaction:', err);
  }
}

async function reactToMessage(emoji) {
  if (!_menuActiveMsgId) return;
  await submitReaction(_menuActiveMsgId, emoji);
  closeMessageActionsModal();
}

function actionReply() {
  if (!_menuActiveMsgId) return;
  setReplyMessage(_menuActiveMsgId, _menuActiveMsgContent, _menuActiveMsgSender);
  closeMessageActionsModal();
}

function actionCopy() {
  if (!_menuActiveMsgContent) return;
  navigator.clipboard.writeText(_menuActiveMsgContent).then(() => {
    showToast('Mesaj metni kopyalandı');
  }).catch(() => {
    showToast('Kopyalanamadı');
  });
  closeMessageActionsModal();
}

async function actionDelete() {
  if (!_menuActiveMsgId) return;
  
  const confirmDelete = await showCustomConfirm('Bu mesajı herkesten geri çekmek istediğinize emin misiniz?');
  if (!confirmDelete) return;

  try {
    const res = await fetch(`/api/messages/${_menuActiveMsgId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      await refreshChatMessages();
      loadInbox();
      showToast('Mesaj geri çekildi');
    } else {
      showToast('Mesaj silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
  closeMessageActionsModal();
}

// ============================================================
// MESSAGE FORWARDING LOGIC (E2EE COMPATIBLE)
// ============================================================
let _forwardActiveMsgContent = null;
let _forwardTargetsCache = [];

async function actionForward() {
  if (!_menuActiveMsgContent) return;
  _forwardActiveMsgContent = _menuActiveMsgContent;
  closeMessageActionsModal();

  const modal = document.getElementById('forwardMessageModal');
  const searchInput = document.getElementById('forwardSearchInput');
  const listContainer = document.getElementById('forwardTargetsList');

  if (modal) modal.classList.add('open');
  if (searchInput) searchInput.value = '';
  if (listContainer) listContainer.innerHTML = '<div style="font-size:11px;color:#888;padding:8px">Yükleniyor...</div>';

  try {
    // Load inbox targets (chats & groups we can forward to)
    const res = await fetch('/api/messages/inbox');
    if (res.ok) {
      _forwardTargetsCache = await res.json();
      renderForwardTargets(_forwardTargetsCache);
    }
  } catch {
    if (listContainer) listContainer.innerHTML = '<div style="font-size:11px;color:red;padding:8px">Hedefler yüklenemedi</div>';
  }
}

function closeForwardModal() {
  const modal = document.getElementById('forwardMessageModal');
  if (modal) modal.classList.remove('remove');
  if (modal) modal.classList.remove('open');
  _forwardActiveMsgContent = null;
}

function filterForwardTargets(query) {
  const q = query.toLowerCase().trim();
  const filtered = _forwardTargetsCache.filter(t => t.username.toLowerCase().includes(q));
  renderForwardTargets(filtered);
}

function renderForwardTargets(targets) {
  const container = document.getElementById('forwardTargetsList');
  if (!container) return;

  if (targets.length === 0) {
    container.innerHTML = '<div style="font-size:11px;color:#555;padding:8px;text-align:center">Hedef bulunamadı</div>';
    return;
  }

  container.innerHTML = targets.map(t => {
    return `
      <div class="group-member-row" style="cursor:pointer;" onclick="sendForwardedMessage(${t.is_group}, '${esc(t.username)}', ${t.id})">
        <div style="display:flex;align-items:center;gap:10px;">
          ${t.is_group 
            ? '<div class="avatar avatar-sm" style="background:#333;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;">G</div>' 
            : renderAvatar(t, 'avatar avatar-sm')}
          <span style="font-weight:800;font-size:13px;color:#fff">${esc(t.username)}</span>
        </div>
        <button class="mono-btn-primary" style="width:auto;padding:6px 12px;font-size:9px;font-weight:800;">GÖNDER</button>
      </div>
    `;
  }).join('');
}

async function sendForwardedMessage(isGroup, targetPartner, targetId) {
  if (!_forwardActiveMsgContent) return;

  // Derivate correct E2EE key for target
  const key = isGroup ? `group_${targetId}` : [currentUser.username, targetPartner].sort().join('_');
  const encryptedContent = encryptText(_forwardActiveMsgContent, key);

  try {
    const url = isGroup ? `/api/messages/group/${targetId}` : `/api/messages/${encodeURIComponent(targetPartner)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: encryptedContent, parentId: null })
    });

    if (res.ok) {
      showToast('Mesaj yönlendirildi!');
      closeForwardModal();
      if (_activeChatPartner === targetPartner) {
        await refreshChatMessages();
      }
      loadInbox();
    } else {
      showToast('Yönlendirilemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// ============================================================
// INSTAGRAM-STYLE GROUP MANAGEMENT MODAL (STATS & LEADERSHIP)
// ============================================================
let _activeGroupCreatorId = null;

async function openGroupDetailsModal(groupId, groupName) {
  const modal = document.getElementById('groupDetailsModal');
  const nameInput = document.getElementById('groupDetailsNameInput');
  const addMemberSec = document.getElementById('groupDetailsAddMemberSection');
  
  if (modal) modal.classList.add('open');
  if (nameInput) nameInput.value = groupName;
  
  // Reset search fields
  const addInput = document.getElementById('groupDetailsAddMemberInput');
  if (addInput) addInput.value = '';
  const resultsDiv = document.getElementById('groupDetailsAddMemberResults');
  if (resultsDiv) resultsDiv.style.display = 'none';

  await refreshGroupDetails(groupId);
}

function closeGroupDetailsModal() {
  const modal = document.getElementById('groupDetailsModal');
  if (modal) modal.classList.remove('open');
}

async function refreshGroupDetails(groupId) {
  try {
    const res = await fetch(`/api/messages/group/${groupId}/stats`);
    if (!res.ok) return;
    const data = await res.json();

    _activeGroupCreatorId = data.group.created_by;

    // Set stats
    const totalFocusDiv = document.getElementById('groupDetailsTotalFocus');
    const memberCountDiv = document.getElementById('groupDetailsMemberCount');
    if (totalFocusDiv) totalFocusDiv.textContent = fmtSecondsToHMS(data.totalFocusTime || 0);
    if (memberCountDiv) memberCountDiv.textContent = data.members.length;

    // Show add member section only to creator (admin)
    const addMemberSec = document.getElementById('groupDetailsAddMemberSection');
    if (addMemberSec) {
      addMemberSec.style.display = (currentUser.id === _activeGroupCreatorId) ? 'flex' : 'none';
    }

    // Render members leaderboard
    const membersList = document.getElementById('groupDetailsMembersList');
    if (membersList) {
      membersList.innerHTML = data.members.map((m, idx) => {
        const isAdmin = m.id === _activeGroupCreatorId;
        const adminBadge = isAdmin ? '<span class="admin-badge">YÖNETİCİ</span>' : '';
        const onlineDot = m.is_online 
          ? '<span style="background:#00e676;width:8px;height:8px;border-radius:50%;display:inline-block;"></span>' 
          : '<span style="background:#444;width:8px;height:8px;border-radius:50%;display:inline-block;"></span>';

        // Kick button (only visible to Creator next to other members)
        let kickBtn = '';
        if (currentUser.id === _activeGroupCreatorId && m.id !== _activeGroupCreatorId) {
          kickBtn = `
            <button onclick="kickGroupMember(${m.id})" style="background:none; border:1px solid #ff1744; color:#ff1744; font-size:8px; font-weight:800; padding:4px 8px; border-radius:10px; cursor:pointer;">ÇIKAR</button>
          `;
        }

        return `
          <div class="group-member-row">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-family:monospace;font-size:12px;font-weight:900;color:#555">#${idx + 1}</span>
              ${renderAvatar(m, 'avatar avatar-sm')}
              <div style="display:flex;flex-direction:column;gap:2px">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-weight:800;font-size:12px;color:#fff">${esc(m.username)}</span>
                  ${onlineDot}
                  ${adminBadge}
                </div>
                <div style="font-size:10px;color:#555">
                  Odak: <span style="font-family:monospace;color:#aaa">${fmtSecondsToHMS(m.total_focus_time || 0)}</span>
                </div>
              </div>
            </div>
            ${kickBtn}
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load group details:', err);
  }
}

async function saveGroupName() {
  const nameInput = document.getElementById('groupDetailsNameInput');
  const name = nameInput?.value?.trim();
  if (!name || !_activeChatId) return;

  try {
    const res = await fetch(`/api/messages/groups/${_activeChatId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      showToast('Grup adı güncellendi');
      _activeChatPartner = name;
      const headerUser = document.getElementById('chatHeaderUser');
      if (headerUser) {
        headerUser.querySelector('span').textContent = name;
      }
      loadInbox();
    } else {
      showToast('Grup adı güncellenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

async function searchFriendsToAddToGroup(query) {
  const resultsDiv = document.getElementById('groupDetailsAddMemberResults');
  if (!resultsDiv) return;

  const q = query.toLowerCase().trim();
  if (!q) {
    resultsDiv.style.display = 'none';
    return;
  }

  try {
    // Filter friends list
    const res = await fetch('/api/friends');
    if (!res.ok) return;
    const friends = await res.json();
    
    // Also check current group members to avoid showing already added users
    const membersRes = await fetch(`/api/messages/group/${_activeChatId}/members`);
    const currentMembers = membersRes.ok ? await membersRes.json() : [];
    const memberIds = new Set(currentMembers.map(m => m.id));

    const matches = friends.filter(f => f.username.toLowerCase().includes(q) && !memberIds.has(f.id));

    if (matches.length === 0) {
      resultsDiv.innerHTML = '<div style="font-size:10px;color:#888;padding:8px;text-align:center">Eklenmeye uygun arkadaş bulunamadı</div>';
    } else {
      resultsDiv.innerHTML = matches.map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #111;cursor:pointer;" onclick="addGroupMember('${esc(f.username)}')">
          <div style="display:flex;align-items:center;gap:8px;">
            ${renderAvatar(f, 'avatar avatar-xs')}
            <span style="font-size:12px;font-weight:700;color:#fff">${esc(f.username)}</span>
          </div>
          <span style="font-size:10px;font-weight:bold;color:var(--accent)">+ EKLE</span>
        </div>
      `).join('');
    }
    resultsDiv.style.display = 'block';
  } catch {}
}

async function addGroupMember(username) {
  if (!_activeChatId) return;
  try {
    const res = await fetch(`/api/messages/groups/${_activeChatId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (res.ok) {
      showToast(`${username} gruba eklendi`);
      const resultsDiv = document.getElementById('groupDetailsAddMemberResults');
      if (resultsDiv) resultsDiv.style.display = 'none';
      const addInput = document.getElementById('groupDetailsAddMemberInput');
      if (addInput) addInput.value = '';
      await refreshGroupDetails(_activeChatId);
    } else {
      showToast('Gruba eklenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

async function kickGroupMember(userId) {
  if (!_activeChatId) return;
  const confirmKick = await showCustomConfirm('Bu üyeyi gruptan çıkarmak istediğinize emin misiniz?');
  if (!confirmKick) return;

  try {
    const res = await fetch(`/api/messages/groups/${_activeChatId}/members/${userId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Üye gruptan çıkarıldı');
      await refreshGroupDetails(_activeChatId);
    } else {
      showToast('Çıkarılamadı');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

async function leaveActiveGroup() {
  if (!_activeChatId) return;
  const confirmLeave = await showCustomConfirm('Bu gruptan ayrılmak istediğinize emin misiniz?');
  if (!confirmLeave) return;

  try {
    const res = await fetch(`/api/messages/groups/${_activeChatId}/members/${currentUser.id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Gruptan ayrıldınız');
      closeGroupDetailsModal();
      closeChatArea();
      await loadInbox();
    } else {
      showToast('Ayrılamadınız');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// Utility formatting helper
function fmtSecondsToHMS(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// E2EE DYNAMIC SHARED POST PREVIEW LOADER
// ============================================================
let _sharedPostCache = {};
async function loadSharedPostPreview(mId, postId) {
  const el = document.getElementById(`post-share-card-${mId}`);
  if (!el) return;
  
  if (_sharedPostCache[postId]) {
    renderSharedPostCardInBubble(el, _sharedPostCache[postId]);
    return;
  }
  
  try {
    const res = await fetch(`/api/posts/${postId}`);
    if (res.ok) {
      const post = await res.json();
      _sharedPostCache[postId] = post;
      renderSharedPostCardInBubble(el, post);
    } else {
      el.innerHTML = '<div style="font-size:10px;color:#888;padding:8px">Gönderi silinmiş veya erişilemiyor</div>';
    }
  } catch {
    el.innerHTML = '<div style="font-size:10px;color:#888;padding:8px">Gönderi yüklenemedi</div>';
  }
}

function renderSharedPostCardInBubble(el, post) {
  const container = document.getElementById('chatMessages');
  const wasNearBottom = container ? (container.scrollHeight - container.clientHeight - container.scrollTop < 150) : false;

  const isPlain = !post.image;
  const contentText = post.content || '';
  const headerHtml = `
    <div class="chat-post-share-header" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:4px;">
      ${renderAvatar({ username: post.username, profile_photo: post.profile_photo }, 'avatar avatar-xs')}
      <span style="font-size:11.5px; font-weight:700; color:#fff;">@${esc(post.username)}</span>
    </div>
  `;
  
  const bodyHtml = isPlain 
    ? `<div class="chat-post-share-body-text" style="background:linear-gradient(135deg, #242426, #141416); border-radius:8px; border:1px solid rgba(255,255,255,0.05); padding:16px 12px; min-height:80px; display:flex; align-items:center; justify-content:center; text-align:center; font-style:italic; font-size:11.5px; color:#ddd; line-height:1.4; word-break:break-word;">
         "${esc(contentText.slice(0, 100))}"
       </div>`
    : `<img class="chat-post-share-img" src="${post.image}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.06);" />
       <div class="chat-post-share-body" style="font-size:11.5px; color:rgba(255,255,255,0.85); line-height:1.4; margin-top:4px;">
         <strong style="color:#fff; margin-right:4px;">@${esc(post.username)}</strong>${esc(contentText.slice(0, 60))}
       </div>`;
       
  const statsHtml = `
    <div class="chat-post-share-footer" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; display:flex; justify-content:space-around; align-items:center; font-size:11px; color:rgba(255,255,255,0.45); font-weight:700;">
      <div style="display:flex; align-items:center; gap:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="color:rgba(255,255,255,0.4);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span>${post.like_count || 0}</span>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="color:rgba(255,255,255,0.4);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>${post.comment_count || 0}</span>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="color:rgba(255,255,255,0.4);"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        <span>${post.repost_count || 0}</span>
      </div>
    </div>
  `;

  el.innerHTML = `
    ${headerHtml}
    ${bodyHtml}
    ${statsHtml}
  `;

  // Prevent scroll jumpiness after preview loads
  if (container && wasNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// ============================================================
// INSTAGRAM STYLE REACTION DETAILS VIEW
// ============================================================
async function showReactionDetails(messageId) {
  const modal = document.getElementById('reactionDetailsModal');
  const listContainer = document.getElementById('reactionDetailsList');
  
  if (!modal || !listContainer) return;
  modal.classList.add('open');
  listContainer.innerHTML = '<div style="font-size:11px;color:#888;padding:12px;text-align:center">Yükleniyor...</div>';
  
  try {
    const res = await fetch(`/api/messages/${messageId}/reactions`);
    if (!res.ok) throw new Error();
    const reactions = await res.json();
    
    if (reactions.length === 0) {
      listContainer.innerHTML = '<div style="font-size:11px;color:#555;padding:12px;text-align:center">Reaksiyon bulunamadı</div>';
      return;
    }
    
    listContainer.innerHTML = reactions.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#0d0d0d;border:1px solid #222;border-radius:10px;padding:10px 14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${renderAvatar(r, 'avatar avatar-sm')}
          <div>
            <div style="font-weight:800;color:#fff;font-size:13px">${esc(r.username)}</div>
            <div style="font-size:10px;color:#555">Seviye ${r.level || 1}</div>
          </div>
        </div>
        <span style="font-size:20px;">${esc(r.reaction)}</span>
      </div>
    `).join('');
  } catch {
    listContainer.innerHTML = '<div style="font-size:11px;color:red;padding:12px;text-align:center">Yüklenemedi</div>';
  }
}

function closeReactionDetailsModal() {
  const modal = document.getElementById('reactionDetailsModal');
  if (modal) modal.classList.remove('open');
}

// ============================================================
// INSTAGRAM STYLE POST SHARING MODAL & RECOMMENDED LIST
// ============================================================
let _shareActivePostId = null;
let _shareTargetsCache = [];
window._shareSelectedTargets = [];

async function openSharePostModal(postId) {
  _shareActivePostId = postId;
  window._shareSelectedTargets = [];
  
  const modal = document.getElementById('sharePostModal');
  const msgInput = document.getElementById('sharePostMessageInput');
  const searchInput = document.getElementById('sharePostSearchInput');
  const listContainer = document.getElementById('sharePostTargetsList');
  const btn = document.getElementById('shareSubmitBtn');

  if (modal) modal.classList.add('open');
  if (msgInput) msgInput.value = '';
  if (searchInput) searchInput.value = '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'GÖNDER';
  }
  if (listContainer) listContainer.innerHTML = '<div style="grid-column: span 4; font-size:11px;color:#888;padding:24px;text-align:center;">Yükleniyor...</div>';

  try {
    const res = await fetch('/api/share/targets');
    if (res.ok) {
      _shareTargetsCache = await res.json();
      // Sort by chat_count desc so most active chats are at the top
      _shareTargetsCache.sort((a, b) => (b.chat_count || 0) - (a.chat_count || 0));
      renderShareTargets(_shareTargetsCache);
    }
  } catch {
    if (listContainer) listContainer.innerHTML = '<div style="grid-column: span 4; font-size:11px;color:red;padding:24px;text-align:center;">Hata oluştu</div>';
  }
}

function closeSharePostModal() {
  const modal = document.getElementById('sharePostModal');
  if (modal) modal.classList.remove('open');
  _shareActivePostId = null;
  window._shareSelectedTargets = [];
}

let _shareSearchTimeout = null;

function filterShareTargets(query) {
  const q = query.toLowerCase().trim();
  
  clearTimeout(_shareSearchTimeout);
  
  if (!q) {
    renderShareTargets(_shareTargetsCache);
    return;
  }

  // Filter local groups and local friends matching query
  const matchingGroups = _shareTargetsCache.filter(t => t.is_group && t.username.toLowerCase().includes(q));
  const matchingLocalFriends = _shareTargetsCache.filter(t => !t.is_group && t.username.toLowerCase().includes(q));

  // Show local matches instantly
  const instantMatches = [...matchingGroups, ...matchingLocalFriends];
  renderShareTargets(instantMatches);

  // Debounced search to fetch all matching users from the system
  _shareSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search/users?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const searchedUsers = await res.json();
        
        // Map searched users to target format
        const formattedUsers = searchedUsers.map(u => ({
          id: u.id,
          username: u.username,
          profile_photo: u.profile_photo,
          level: u.level,
          is_group: 0,
          chat_count: 0
        }));

        // Register searched users into cache so they are resolvable in submitMultiSharePost
        formattedUsers.forEach(u => {
          const exists = _shareTargetsCache.some(tc => !tc.is_group && tc.username === u.username);
          if (!exists && u.username !== currentUser.username) {
            _shareTargetsCache.push(u);
          }
        });

        // Merge keeping local data (like selection state, chat_count)
        const merged = [...matchingGroups];
        
        formattedUsers.forEach(u => {
          const localFriend = matchingLocalFriends.find(lf => lf.username === u.username);
          if (localFriend) {
            merged.push(localFriend);
          } else {
            if (u.username !== currentUser.username) {
              const cacheUser = _shareTargetsCache.find(tc => !tc.is_group && tc.username === u.username);
              merged.push(cacheUser || u);
            }
          }
        });

        // Add any remaining local friends that matched but weren't in search results
        matchingLocalFriends.forEach(lf => {
          if (!merged.some(m => m.is_group === 0 && m.username === lf.username)) {
            merged.push(lf);
          }
        });

        renderShareTargets(merged);
      }
    } catch (e) {
      console.error('Share targets search failed', e);
    }
  }, 300);
}

function renderShareTargets(targets) {
  const container = document.getElementById('sharePostTargetsList');
  if (!container) return;

  if (targets.length === 0) {
    container.innerHTML = '<div style="grid-column: span 4; font-size:11px;color:#555;padding:24px;text-align:center">Gönderilecek kimse bulunamadı</div>';
    return;
  }

  container.innerHTML = targets.map(t => {
    const targetKey = t.is_group ? `group_${t.id}` : `user_${t.username}`;
    const isSelected = window._shareSelectedTargets.includes(targetKey);
    const selectChar = isSelected ? '✓' : '';
    const selectedClass = isSelected ? 'selected' : '';
    
    // Group vs User Avatar
    let avatarMarkup = '';
    if (t.is_group) {
      const name = t.username || 'Grup';
      const initial = name.trim().charAt(0).toUpperCase();
      const code = name.charCodeAt(0) % 5;
      const gradients = [
        'linear-gradient(135deg, #ff5e62, #ff9966)',
        'linear-gradient(135deg, #4facfe, #00f2fe)',
        'linear-gradient(135deg, #43e97b, #38f9d7)',
        'linear-gradient(135deg, #f093fb, #f5576c)',
        'linear-gradient(135deg, #fa709a, #fee140)'
      ];
      avatarMarkup = `
        <div class="share-avatar-circle" style="background: ${gradients[code]}; color: #fff; font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; border-radius: 50%;">
          ${initial}
        </div>
      `;
    } else {
      avatarMarkup = renderAvatar({ username: t.username, profile_photo: t.profile_photo }, 'share-avatar-img');
    }

    const labelText = t.is_group ? t.username : `@${t.username}`;

    return `
      <div class="share-item ${selectedClass}" data-target-key="${targetKey}" onclick="toggleShareTarget('${targetKey}')">
        <div class="share-avatar-wrapper">
          ${avatarMarkup}
          <div class="share-select-badge">${selectChar}</div>
        </div>
        <span class="share-name-label">${esc(labelText)}</span>
      </div>
    `;
  }).join('');
}

function toggleShareTarget(targetKey) {
  const el = document.querySelector(`.share-item[data-target-key="${targetKey}"]`);
  if (!el) return;

  const idx = window._shareSelectedTargets.indexOf(targetKey);
  if (idx > -1) {
    window._shareSelectedTargets.splice(idx, 1);
    el.classList.remove('selected');
    const badge = el.querySelector('.share-select-badge');
    if (badge) badge.textContent = '';
  } else {
    window._shareSelectedTargets.push(targetKey);
    el.classList.add('selected');
    const badge = el.querySelector('.share-select-badge');
    if (badge) badge.textContent = '✓';
  }

  // Update send button state
  const btn = document.getElementById('shareSubmitBtn');
  if (btn) {
    const count = window._shareSelectedTargets.length;
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `GÖNDER (${count})` : 'GÖNDER';
  }
}

async function submitMultiSharePost() {
  if (!_shareActivePostId || window._shareSelectedTargets.length === 0) return;

  const btn = document.getElementById('shareSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'GÖNDERİLİYOR...';
  }

  const extraMsg = document.getElementById('sharePostMessageInput').value.trim();
  const shareText = `[POST_SHARE]:${_shareActivePostId}`;

  const promises = window._shareSelectedTargets.map(async (targetKey) => {
    // Find target details in cache
    const target = _shareTargetsCache.find(t => {
      const key = t.is_group ? `group_${t.id}` : `user_${t.username}`;
      return key === targetKey;
    });
    if (!target) return;

    const key = target.is_group ? `group_${target.id}` : [currentUser.username, target.username].sort().join('_');
    const encryptedPost = encryptText(shareText, key);

    try {
      const url = target.is_group ? `/api/messages/group/${target.id}` : `/api/messages/${encodeURIComponent(target.username)}`;
      
      // 1. Send Post Share Message
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: encryptedPost, parentId: null, isShare: true })
      });

      // 2. Send Extra Message if provided
      if (extraMsg) {
        const encryptedExtra = encryptText(extraMsg, key);
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encryptedExtra, parentId: null, isShare: false })
        });
      }

      if (!target.is_group && _activeChatPartner === target.username) {
        await refreshChatMessages();
      }
    } catch (e) {
      console.error(e);
    }
  });

  try {
    await Promise.all(promises);
    showToast('Paylaşıldı!');
    closeSharePostModal();
    loadInbox();
  } catch {
    showToast('Bazı mesajlar gönderilemedi');
    if (btn) {
      const count = window._shareSelectedTargets.length;
      btn.disabled = count === 0;
      btn.textContent = count > 0 ? `GÖNDER (${count})` : 'GÖNDER';
    }
  }
}

// Scroll smoothly to a message in the current chat view and trigger a glow highlight
function scrollToMessage(messageId) {
  const el = document.getElementById(`chat-msg-${messageId}`);
  if (!el) {
    showToast('Mesaj bulunamadı (çok eski olabilir)');
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('glow-highlight');
  setTimeout(() => {
    el.classList.remove('glow-highlight');
  }, 1600);
}

// Load and view a shared post using the premium Instagram-style detail modal from profile.js
async function openSharedPostInChat(postId) {
  if (typeof openProfilePostDetail === 'function') {
    openProfilePostDetail(postId, false, false);
  } else {
    showToast('Profil modülü yüklenemedi.');
  }
}

function closeChatPostViewModal() {
  const modal = document.getElementById('chatPostViewModal');
  if (modal) modal.classList.remove('open');
}

// ============================================================
// MOBILE SWIPE-TO-REACT EVENT GESTURES
// ============================================================
let _swipeStartX = 0;
let _swipeCurrentX = 0;
let _swipeActiveEl = null;
let _swipeVibrated = false;

function handleTouchStart(event, messageId, content, fromUsername, isMe) {
  const touch = event.touches[0];
  _swipeStartX = touch.clientX;
  _swipeCurrentX = touch.clientX;
  _swipeVibrated = false; // Reset haptic trigger state
  
  _swipeActiveEl = event.currentTarget;
  if (_swipeActiveEl) {
    _swipeActiveEl.style.transition = 'none';
  }
}

function triggerHapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(15); // Android / Standard PWA haptic
  } else {
    // iOS 18+ Taptic Engine Switch-Toggling Hack
    try {
      const input = document.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('switch', ''); // iOS switch layout trigger
      input.style.position = 'absolute';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);
      input.click(); // Trigger native WebKit toggle haptic feedback
      input.remove(); // Cleanup immediately
    } catch (e) {
      console.warn('iOS haptic click workaround failed:', e);
    }
  }
}

function handleTouchMove(event) {
  if (!_swipeActiveEl) return;
  const touch = event.touches[0];
  _swipeCurrentX = touch.clientX;
  
  const diffX = _swipeCurrentX - _swipeStartX;
  // Allow swiping right (diffX > 0)
  if (diffX > 0) {
    const dragAmount = Math.min(diffX, 85);
    _swipeActiveEl.style.transform = `translateX(${dragAmount}px)`;
    
    // Trigger a single short haptic vibration exactly when threshold is crossed
    if (dragAmount >= 50 && !_swipeVibrated) {
      triggerHapticFeedback();
      _swipeVibrated = true;
    }
    
    // Prevent screen navigation/bounce while swiping bubbles
    if (dragAmount > 15 && event.cancelable) {
      event.preventDefault();
    }
  }
}

function handleTouchEnd(event, messageId, content, fromUsername, isMe) {
  if (!_swipeActiveEl) return;
  
  const diffX = _swipeCurrentX - _swipeStartX;
  
  // Smoothly slide back to normal
  _swipeActiveEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
  _swipeActiveEl.style.transform = 'translateX(0)';
  
  // Trigger reply mode if swiped far enough (threshold: 50px)
  if (diffX > 50) {
    // Set active message reply mode
    if (typeof setReplyMessage === 'function') {
      // If content starts with post share identifier, sanitize display text for reply preview
      let replyContentText = content;
      if (replyContentText.startsWith('[POST_SHARE]:')) {
        replyContentText = '📄 Paylaşılan Gönderi';
      }
      setReplyMessage(messageId, replyContentText, fromUsername);
    }
    
    // Focus chat input box and trigger virtual keyboard
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.focus();
    }
  }
  
  _swipeActiveEl = null;
}
