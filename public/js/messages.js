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

let _chatPendingImageFile = null;
let _chatDisappearingHours = 24;
let _chatTypingTimer = null;
let _keyboardListenerInitialized = false;

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
  initMessagesKeyboardListener();
  setupChatPasteListener();
  await loadInbox();
  // Start polling inbox & messages
  startChatPolling();
}

function initMessagesKeyboardListener() {
  if (_keyboardListenerInitialized) return;
  _keyboardListenerInitialized = true;

  window.addEventListener('keydown', (e) => {
    if (typeof activePage !== 'undefined' && activePage !== 'messages') return;
    if (!_activeChatPartner) return;
    
    // Ignore if focus is inside any input, textarea, select or modal
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }
    const openModals = document.querySelectorAll('.modal-overlay.open, .post-modal-overlay.open');
    if (openModals.length > 0) return;

    if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Escape' || e.key === 'Tab' || e.key.startsWith('F')) {
      return;
    }

    const input = document.getElementById('chatInput');
    if (input) {
      input.focus();
      if (e.key.length === 1) {
        input.value += e.key;
        e.preventDefault();
        handleChatInputTyping();
      }
    }
  });
}

function setupChatPasteListener() {
  const input = document.getElementById('chatInput');
  if (!input || input._hasPasteListener) return;
  input._hasPasteListener = true;
  input.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
    if (!items) return;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          setChatMediaAttachment(file);
          e.preventDefault();
          break;
        }
      }
    }
  });
}

function handleChatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  } else if (e.key === 'ArrowUp') {
    const input = document.getElementById('chatInput');
    if (input && !input.value.trim()) {
      // Trigger reply to last message
      const msgRows = document.querySelectorAll('.chat-msg-row-item');
      if (msgRows.length > 0) {
        const lastRow = msgRows[msgRows.length - 1];
        const lastMsgId = parseInt(lastRow.id.replace('chat-msg-', ''));
        if (lastMsgId) {
          const bubble = lastRow.querySelector('.msg-body-wrapper');
          const text = bubble ? bubble.textContent.trim() : '';
          const sender = lastRow.querySelector('strong')?.textContent.replace('@', '') || _activeChatPartner;
          setReplyMessage(lastMsgId, text, sender);
        }
      }
    }
  }
}

function handleChatInputTyping() {
  clearTimeout(_chatTypingTimer);
  _chatTypingTimer = setTimeout(() => {
    // Typing stopped
  }, 3000);
}

function setChatMediaAttachment(file) {
  _chatPendingImageFile = file;
  const previewBar = document.getElementById('chatMediaPreviewBar');
  const previewImg = document.getElementById('chatMediaPreviewImg');
  if (previewBar && previewImg) {
    previewImg.src = URL.createObjectURL(file);
    previewBar.style.display = 'flex';
  }
}

function clearChatMediaAttachment() {
  _chatPendingImageFile = null;
  const input = document.getElementById('chatMediaInput');
  if (input) input.value = '';
  const previewBar = document.getElementById('chatMediaPreviewBar');
  if (previewBar) previewBar.style.display = 'none';
}

function showChatMediaNotice() {
  const msg = 'Özel mesajlara ve grup sohbetlerine görsel yüklemeye dair çalışmalarımız devam ediyor...';
  if (typeof window.showAlert === 'function') {
    window.showAlert(msg);
  } else if (typeof showToast === 'function') {
    showToast(msg);
  } else {
    alert(msg);
  }
}

function handleChatMediaSelected(input) {
  if (input.files && input.files[0]) {
    setChatMediaAttachment(input.files[0]);
  }
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
      let decryptedLastMsg = decryptText(c.last_message || '', key);
      const isMeSender = c.last_message_sender_id === currentUser.id;

      if (decryptedLastMsg.startsWith('[POST_SHARE]:')) {
        decryptedLastMsg = isMeSender ? 'Bir gönderi paylaştın' : 'Bir gönderi paylaştı';
      } else if (decryptedLastMsg.startsWith('[IMAGE]:')) {
        decryptedLastMsg = isMeSender ? 'Bir fotoğraf gönderdin' : 'Bir fotoğraf gönderdi';
      } else if (isMeSender && decryptedLastMsg) {
        decryptedLastMsg = `Sen: ${decryptedLastMsg}`;
      }

      return `
        <div class="inbox-item ${activeClass}" onclick="openDirectChat('${esc(c.username)}', ${c.is_group}, ${c.id})" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;position:relative">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div>
              ${c.is_group ? '<div class="avatar avatar-sm" style="background:var(--t-bg-tab);color:var(--t-text-primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;">G</div>' : renderAvatar(c, 'avatar avatar-sm')}
            </div>
            <div style="min-width:0">
              <div class="inbox-item-name" style="font-weight:800;font-size:13px">${esc(c.username)}</div>
              <div class="inbox-item-preview" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${esc(decryptedLastMsg)}</div>
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
  const myUsername = (typeof currentUser !== 'undefined' && currentUser?.username) || localStorage.getItem('username');
  if (!isGroup && username && myUsername && username.toLowerCase() === myUsername.toLowerCase()) {
    if (typeof showToast === 'function') showToast('Kendinizle mesajlaşamazsınız.');
    return;
  }

  // Clear previous chat messages instantly so old messages don't confuse the user
  const chatMsgsEl = document.getElementById('chatMessages');
  if (chatMsgsEl) {
    chatMsgsEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:12px;font-weight:700;">Yükleniyor...</div>';
  }

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
  
  if (typeof syncUrlState === 'function') {
    const sub = isGroup ? (`group_${id}`) : username;
    syncUrlState('messages', sub);
  }

  // Asynchronously resolve direct partner's profile photo + device type & friend status
  let isFriend = true;
  if (_activeChatType === 'user') {
    try {
      const [uRes, dRes, fRes] = await Promise.all([
        fetch(`/api/users/${encodeURIComponent(username)}`),
        fetch(`/api/user/${encodeURIComponent(username)}/device`),
        fetch(`/api/messages/${encodeURIComponent(username)}/friendship-status`)
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
      if (fRes.ok) {
        const statusData = await fRes.json();
        isFriend = !!statusData.isFriend;
      }
    } catch (e) {
      console.warn('Failed to resolve target info:', e);
    }
  }

  // Toggle input bar vs non-friend barrier panel
  const inputBar = document.getElementById('chatInputBar');
  const nonFriendBanner = document.getElementById('chatNonFriendBanner');
  const nonFriendText = document.getElementById('chatNonFriendText');
  const nonFriendBtn = document.getElementById('chatNonFriendProfileBtn');
  const groupDetailsBtn = document.getElementById('chatGroupDetailsBtn');

  if (groupDetailsBtn) {
    groupDetailsBtn.style.display = _activeChatType === 'group' ? 'inline-flex' : 'none';
  }

  if (isGroup || isFriend) {
    if (inputBar) inputBar.style.display = 'flex';
    if (nonFriendBanner) nonFriendBanner.style.display = 'none';
  } else {
    if (inputBar) inputBar.style.display = 'none';
    if (nonFriendBanner) {
      nonFriendBanner.style.display = 'flex';
      if (nonFriendText) {
        nonFriendText.textContent = `@${username} ile mesajlaşabilmek için arkadaş olmalısınız.`;
      }
      if (nonFriendBtn) {
        nonFriendBtn.onclick = () => {
          if (typeof openUserPage === 'function') openUserPage(username);
        };
      }
    }
  }

  // Mobile responsive layout support
  const inboxPanel = document.getElementById('inboxPanel');
  const chatArea = document.getElementById('chatArea');
  const placeholder = document.getElementById('chatPlaceholder');

  if (window.innerWidth <= 768) {
    if (inboxPanel) inboxPanel.style.display = 'none';
    document.body.classList.add('chat-active');
  } else {
    if (inboxPanel) inboxPanel.style.display = 'flex';
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
        <div style="display:flex;flex-direction:column;gap:1px;cursor:pointer" onclick="if(typeof openUserPage==='function') openUserPage('${esc(username)}')">
          <span style="font-weight:900;color:#fff;font-size:14px">@${esc(username)}</span>
          <span id="chatDeviceSubtitle" class="chat-device-subtitle"></span>
        </div>
      `;
      updateDeviceIndicator(_activeChatPartnerDevice, username, _activeChatPartnerLastSeen, _activeChatPartnerStatus);
    }
  }

function updateDeviceIndicator(deviceType, username, lastSeen, status) {
  const subtitle = document.getElementById('chatDeviceSubtitle');
  if (!subtitle) return;

  const isOnline = lastSeen ? (new Date(lastSeen) > new Date(Date.now() - 2 * 60 * 1000)) : false;
  const statusColorMap = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af', offline: '#9ca3af' };
  const color = isOnline ? (statusColorMap[status] || '#4ade80') : '#9ca3af';

  const iconSvg = deviceType === 'mobile' 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> Mobil` 
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> Masaüstü`;
  const text = isOnline ? 'Çevrimiçi' : (lastSeen ? `Son Görülme: ${typeof fmtDate === 'function' ? fmtDate(lastSeen) : lastSeen}` : 'Çevrimdışı');

  subtitle.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:${color};font-weight:600;">
      <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>
      <span style="display:inline-flex;align-items:center;gap:3px;">${iconSvg}</span> • ${text}
    </span>
  `;
}

  // Load disappearing settings for active chat
  try {
    const target = _activeChatType === 'group' ? `group_${_activeChatId}` : username;
    const sRes = await fetch(`/api/messages/settings/${encodeURIComponent(target)}`);
    if (sRes.ok) {
      const sData = await sRes.json();
      _chatDisappearingHours = sData.disappearing_hours || 24;
      updateDisappearingHeaderLabel(_chatDisappearingHours);
    }
  } catch (e) {}

  // Load messages
  await refreshChatMessages();
  
  // Mark messages as read
  if (_activeChatType === 'user') {
    await fetch(`/api/messages/${encodeURIComponent(username)}/read`, { method: 'POST' });
    updateTotalUnreadMessageCount();
  }
  loadInbox(); // reload inbox list for badge update

  // Auto focus input on desktop
  if (window.innerWidth > 768) {
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }
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

    const systemBanner = `
      <div class="chat-system-retention-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Güvenlik ve gizliliğiniz için mesajlar 24 saat sonra otomatik olarak silinir.</span>
      </div>
    `;

    if (!idsMatch) {
      container.innerHTML = systemBanner + messages.map(m => renderMessageBubble(m, key, lastReadMsgId)).join('');
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

function getReactionSvgIcon(key) {
  const map = {
    heart: `<svg viewBox="0 0 24 24" fill="#e0245e" width="12" height="12"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    thumbsup: `<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="12" height="12"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="#eab308" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" width="12" height="12"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-1.75-2.5-4.5-2.5-4.5s-2.5 2.75-2.5 4.5z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 3.31 1.61 6.24 4.1 8.07.41-.65.9-1.24 1.46-1.75.92-.83 2.05-1.32 3.24-1.32s2.32.49 3.24 1.32c.56.51 1.05 1.1 1.46 1.75C18.39 18.24 20 15.31 20 12c0-5.5-4.5-10-10-10z"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" width="12" height="12"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`
  };
  if (map[key]) return map[key];
  return map.heart;
}

function triggerDoubleTapHeart(event, messageId) {
  event.stopPropagation();
  const bubble = event.currentTarget || event.target.closest('.msg-body-wrapper');
  if (bubble) {
    const heart = document.createElement('div');
    heart.className = 'msg-double-tap-heart';
    heart.innerHTML = `<svg viewBox="0 0 24 24" fill="#e0245e" width="32" height="32"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    bubble.style.position = 'relative';
    bubble.appendChild(heart);
    setTimeout(() => heart.remove(), 650);
  }
  submitReaction(messageId, 'heart');
}

// Single message bubble renderer (extracted for reuse)
function renderMessageBubble(m, key, lastReadMsgId) {
  if (m.from_user_id === 0 || !m.from_username) {
    return `
      <div class="chat-system-divider-msg">
        <span>${esc(m.content)}</span>
      </div>
    `;
  }

  const isMe = m.from_username === currentUser.username;
  const decryptedContent = decryptText(m.content, key);
  const isPostShare = decryptedContent.startsWith('[POST_SHARE]:');
  const hasImage = decryptedContent.includes('[IMAGE]:');

  let bubbleClass = isMe ? 'msg-body-wrapper msg-sender-bubble msg-me' : 'msg-body-wrapper msg-them';
  
  if (isPostShare) {
    bubbleClass = isMe ? 'msg-body-wrapper msg-post-share-bubble msg-me' : 'msg-body-wrapper msg-post-share-bubble msg-them';
  }

  let mainBodyHtml = '';
  if (isPostShare) {
    const parts = decryptedContent.split(':');
    const postId = parseInt(parts[1]);
    const extraMsg = parts.slice(2).join(':');
    
    mainBodyHtml = `
      <div class="chat-post-share-card" id="post-share-card-${m.id}" onclick="event.stopPropagation(); openSharedPostInChat(${postId})">
        <div style="font-size:10px;color:var(--text-3);padding:8px">Yükleniyor...</div>
      </div>
    `;
    if (extraMsg) {
      mainBodyHtml += `<div class="chat-post-share-extra-msg">${esc(extraMsg)}</div>`;
    }
  } else if (hasImage) {
    const parts = decryptedContent.split('[IMAGE]:');
    const textPart = parts[0].trim();
    const imgUrl = parts[1].trim();
    mainBodyHtml = `
      ${textPart ? `<div class="msg-text-content">${esc(textPart)}</div>` : ''}
      <img src="${imgUrl}" class="chat-image-attachment" alt="Görsel" onclick="event.stopPropagation(); if(typeof openImageFullscreen==='function') openImageFullscreen('${imgUrl}')">
    `;
  } else {
    mainBodyHtml = `<div class="msg-text-content">${esc(decryptedContent)}</div>`;
  }

  let replyHtml = '';
  if (m.parent_content) {
    let decryptedParent = decryptText(m.parent_content, key);
    if (decryptedParent.startsWith('[POST_SHARE]:')) {
      decryptedParent = 'Paylaşılan Gönderi';
    } else if (decryptedParent.includes('[IMAGE]:')) {
      decryptedParent = 'Görsel';
    }
    replyHtml = `
      <div class="msg-reply-bubble" onclick="event.stopPropagation(); scrollToMessage(${m.parent_id})">
        <div class="msg-reply-bar-accent"></div>
        <div class="msg-reply-bubble-content">
          <strong>@${esc(m.parent_from_username)}</strong>
          <span>${esc(decryptedParent)}</span>
        </div>
      </div>
    `;
  }

  let avatarHtml = '';
  if (!isMe) {
    avatarHtml = `
      <div class="msg-avatar-col" onclick="openUserModal('${esc(m.from_username)}')">
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
      <div class="msg-reactions-container">
        ${Object.entries(reactionGroups).map(([rKey, users]) => {
          const count = users.length;
          const namesText = users.join(', ');
          const svgIcon = getReactionSvgIcon(rKey);
          const isMyReaction = users.includes(currentUser.username);
          const myClass = isMyReaction ? 'my-reaction' : '';
          return `
            <div class="msg-reaction-badge ${myClass}" 
                 title="${esc(namesText)}" 
                 onclick="event.stopPropagation(); submitReaction(${m.id}, '${rKey}')" 
                 oncontextmenu="event.preventDefault(); showReactionDetails(${m.id})">
              <span class="msg-reaction-icon">${svgIcon}</span>
              ${count > 1 ? `<span class="msg-reaction-count">${count}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const readReceiptHtml = (() => {
    if (isMe && m.id === lastReadMsgId) {
      const photo = _activeChatPartnerPhoto;
      const init = _activeChatPartner ? _activeChatPartner[0].toUpperCase() : '?';
      const imgHtml = photo 
        ? `<img src="${photo}" alt="${esc(_activeChatPartner)}" class="msg-read-receipt-avatar">`
        : `<span class="msg-read-receipt-init">${init}</span>`;
      return `
        <div class="msg-read-receipt" title="Görüldü">
          ${imgHtml}
        </div>
      `;
    }
    return '';
  })();

  const selfDestructBadge = _chatDisappearingHours > 0 ? `
    <span class="msg-self-destruct-badge" title="Süreli Mesaj (${_chatDisappearingHours}sa)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${_chatDisappearingHours >= 24 ? (_chatDisappearingHours/24)+'g' : _chatDisappearingHours+'sa'}</span>
    </span>
  ` : '';

  const groupAuthorHtml = (_activeChatType === 'group' && !isMe) 
    ? `<div class="msg-group-author">@${esc(m.from_username)}</div>` 
    : '';

  const timeText = (() => {
    const dateStr = m.created_at.endsWith('Z') || m.created_at.includes('+') ? m.created_at : m.created_at + 'Z';
    return new Date(dateStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  })();

  return `
    <div id="chat-msg-${m.id}" class="chat-msg-row-item ${isMe ? 'msg-me-row' : 'msg-them-row'}">
      <!-- Swipe to reply indicator (mobile gesture) -->
      <div class="msg-swipe-reply-icon" id="swipe-icon-${m.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15">
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </div>

      ${avatarHtml}
      
      <div class="msg-column">
        ${groupAuthorHtml}
        <div class="msg-bubble-row">
          <div class="${bubbleClass}" 
               id="bubble-${m.id}"
               ondblclick="triggerDoubleTapHeart(event, ${m.id})"
               onclick="openMessageActionsMenu(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})"
               ontouchstart="handleTouchStart(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})"
               ontouchmove="handleTouchMove(event, ${m.id})"
               ontouchend="handleTouchEnd(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})"
               ontouchcancel="handleTouchCancel(event, ${m.id})">
            ${replyHtml}
            ${mainBodyHtml}
          </div>
          <button class="msg-desktop-action-btn" onclick="openMessageActionsMenu(event, ${m.id}, '${esc(decryptedContent)}', '${esc(m.from_username)}', ${isMe})" title="İşlemler">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
          </button>
        </div>
        ${reactionsHtml}
        <div class="msg-meta-row">
          <span class="msg-timestamp">${timeText}</span>
          ${selfDestructBadge}
          ${readReceiptHtml}
        </div>
      </div>
    </div>
  `;
}

// Mesaj yanıtlama modunu aktif et
function setReplyMessage(id, content, from_username) {
  _replyToMessage = { id, content, from_username };
  
  let replyBar = document.getElementById('chatReplyBar');
  if (!replyBar) {
    replyBar = document.createElement('div');
    replyBar.id = 'chatReplyBar';
    replyBar.className = 'chat-reply-preview-bar';
    const inputBar = document.getElementById('chatInputBar') || document.querySelector('.chat-input-bar');
    if (inputBar && inputBar.parentNode) {
      inputBar.parentNode.insertBefore(replyBar, inputBar);
    }
  }

  replyBar.style.display = 'flex';
  replyBar.innerHTML = `
    <div class="chat-reply-indicator-line"></div>
    <div class="chat-reply-content-box">
      <div class="chat-reply-user">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        <span>@${esc(from_username)} kullanıcısına yanıt</span>
      </div>
      <div class="chat-reply-text">${esc(content)}</div>
    </div>
    <button class="chat-reply-close-btn" onclick="cancelReply()" title="Yanıtı İptal Et">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
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
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Mesaj gönderilemedi');
      if (res.status === 429) {
        const input = document.getElementById('msgInput');
        if (input) {
          input.disabled = true;
          const cooldown = data.retryAfter || 15;
          let count = cooldown;
          const origPlaceholder = input.placeholder;
          const timer = setInterval(() => {
            count--;
            input.placeholder = `Spam engeli (${count}s)...`;
            if (count <= 0) {
              clearInterval(timer);
              input.disabled = false;
              input.placeholder = origPlaceholder;
            }
          }, 1000);
        }
      }
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
  if (typeof activePage !== 'undefined' && activePage === 'messages') {
    if (typeof syncUrlState === 'function') {
      syncUrlState('messages', '', true);
    }
  }
  const inboxPanel = document.getElementById('inboxPanel');
  const chatArea = document.getElementById('chatArea');
  const placeholder = document.getElementById('chatPlaceholder');

  document.body.classList.remove('chat-active');

  if (inboxPanel) inboxPanel.style.display = 'flex';
  if (chatArea) chatArea.style.display = 'none';
  if (placeholder && window.innerWidth > 768) placeholder.style.display = 'flex';
}

// Polling interval trigger
function startChatPolling() {
  stopChatPolling();
  
  const chatDelay = document.hidden ? 60000 : 4000;
  _chatPollInterval = setInterval(async () => {
    if (activePage === 'messages') {
      await loadInbox();
      await refreshChatMessages();
    }
  }, chatDelay);

  // Device type + status poll — every 30s (60s if hidden)
  const deviceDelay = document.hidden ? 60000 : 30000;
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
  }, deviceDelay);
}

function stopChatPolling() {
  if (_chatPollInterval) { clearInterval(_chatPollInterval); _chatPollInterval = null; }
  if (_devicePollInterval) { clearInterval(_devicePollInterval); _devicePollInterval = null; }
}

document.addEventListener('visibilitychange', () => {
  if (activePage === 'messages') {
    if (document.hidden) {
      startChatPolling();
    } else {
      loadInbox().catch(() => {});
      refreshChatMessages().catch(() => {});
      startChatPolling();
    }
  }
});

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
      ? (isMobile ? `@${username} şu an mobilde` : `@${username} şu an bilgisayaçrda`)
      : (isMobile ? `@${username} en son mobildeydi` : `@${username} en son bilgisayaçrdaydı`);
    badge.setAttribute('title', tip);
  }

  if (subtitle) {
    if (isActive) {
      subtitle.textContent = isMobile ? 'şu an mobilde ·' : 'şu an bilgisayaçrda ·';
    } else {
      subtitle.textContent = isMobile ? 'en son mobilde ·' : 'en son bilgisayaçrdaydı ·';
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

  const deviceLabel = isMobile ? 'Mobil Cihaz' : 'Bilgisayaçr';
  const deviceDetail = isMobile ? 'telefon veya tablet' : 'masaüstü veya dizüstü bilgisayaçr';
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
          ${renderAvatar({ username: f.username, profile_photo: f.profile_photo }, 'avatar')}
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
          ${renderAvatar({ username: u.username, profile_photo: u.profile_photo }, 'avatar')}
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
      showToast('Grup başarıyla oluşturuldu!');
      closeCreateGroupModal();
      await loadInbox();
      if (data && data.id) {
        openDirectChat(name, 1, data.id);
      }
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

  const bubble = event.currentTarget || event.target.closest('.msg-body-wrapper');
  const rect = bubble ? bubble.getBoundingClientRect() : { top: 120, left: 20, width: 120, height: 40, right: 140, bottom: 160 };

  const modal = document.getElementById('messageActionsModal');
  const popover = document.getElementById('messageActionsPopover');
  const deleteBtn = document.getElementById('actionDeleteBtn');
  
  if (!modal || !popover) return;
  
  if (deleteBtn) {
    deleteBtn.style.display = isMe ? 'flex' : 'none';
  }

  modal.style.display = 'block';
  modal.classList.add('open');

  const popWidth = popover.offsetWidth || 220;
  const popHeight = popover.offsetHeight || (isMe ? 210 : 170);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = isMe ? (rect.right - popWidth) : rect.left;
  let top = rect.bottom + 8;

  // If overflows bottom edge, show above message
  if (top + popHeight > viewportHeight - 16) {
    top = Math.max(16, rect.top - popHeight - 8);
  }
  // Clamp horizontal boundaries
  left = Math.max(12, Math.min(left, viewportWidth - popWidth - 12));

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
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
    container.innerHTML = '<div style="font-size:11px;color:var(--text-3);padding:24px;text-align:center;font-weight:700">Yönlendirilecek hedef bulunamadı</div>';
    return;
  }

  container.innerHTML = targets.map(t => {
    const avatar = t.is_group 
      ? '<div class="avatar avatar-sm" style="background:rgba(255,255,255,0.08);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:1px solid rgba(255,255,255,0.12)">G</div>' 
      : renderAvatar(t, 'avatar avatar-sm');
    const subtitle = t.is_group ? 'Grup Sohbeti' : 'Direkt Mesaj';
    return `
      <div class="forward-target-item" onclick="sendForwardedMessage(${t.is_group}, '${esc(t.username)}', ${t.id})">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          ${avatar}
          <div style="min-width:0;display:flex;flex-direction:column;gap:1px;">
            <span style="font-weight:800;font-size:13px;color:var(--t-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.username)}</span>
            <span style="font-size:10px;color:var(--text-3);font-weight:600;">${subtitle}</span>
          </div>
        </div>
        <button class="forward-action-btn" onclick="event.stopPropagation(); sendForwardedMessage(${t.is_group}, '${esc(t.username)}', ${t.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
            <polyline points="15 17 20 12 15 7" />
            <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
          </svg>
          <span>YÖNLENDİR</span>
        </button>
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
  groupId = groupId || _activeChatId;
  groupName = groupName || _activeChatPartner || '';

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
            <button onclick="kickGroupMember(${m.id})" class="discord-action-btn danger" data-tooltip="Gruptan Çıkar" data-tooltip-pos="left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </button>
          `;
        }

        return `
          <div class="group-member-row">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-family:monospace;font-size:12px;font-weight:900;color:var(--text-3)">#${idx + 1}</span>
              ${renderAvatar(m, 'avatar avatar-sm')}
              <div style="display:flex;flex-direction:column;gap:2px">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-weight:800;font-size:12px;color:var(--text-1)">${esc(m.username)}</span>
                  ${onlineDot}
                  ${adminBadge}
                </div>
                <div style="font-size:10px;color:var(--text-3)">
                  Odak: <span style="font-family:monospace;color:var(--text-2);font-weight:700">${fmtSecondsToHMS(m.total_focus_time || 0)}</span>
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
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="color:rgba(255,255,255,0.4);"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
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
        <span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);">${getReactionSvgIcon(r.reaction)}</span>
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
// INSTAGRAM STYLE POST SHARING MODAL & RECOMMEÖNDED LIST
// ============================================================
let _shareActivePostId = null;
let _shareTargetsCache = [];
window._shareSelectedTargets = [];

function updateShareSubmitBtnState(count = 0, loading = false) {
  const btn = document.getElementById('shareSubmitBtn');
  if (!btn) return;
  btn.disabled = loading || count === 0;
  const sendSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  let text = 'GÖNDER';
  if (loading) text = 'GÖNDERİLİYOR...';
  else if (count > 0) text = `GÖNDER (${count})`;

  btn.innerHTML = `${sendSvg}<span class="share-btn-text">${text}</span>`;
}

async function openSharePostModal(postId) {
  _shareActivePostId = postId;
  window._shareSelectedTargets = [];
  
  const modal = document.getElementById('sharePostModal');
  const msgInput = document.getElementById('sharePostMessageInput');
  const searchInput = document.getElementById('sharePostSearchInput');
  const listContainer = document.getElementById('sharePostTargetsList');

  if (modal) modal.classList.add('open');
  if (msgInput) msgInput.value = '';
  if (searchInput) searchInput.value = '';
  updateShareSubmitBtnState(0);
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

// ─── EXTERNAL SHARING HELPERS ────────────────────────────────
function getPostShareUrl(postId) {
  const id = postId || _shareActivePostId;
  return `${window.location.origin}/feed?post=${id}`;
}

function sharePostToWhatsApp() {
  const url = getPostShareUrl();
  const text = encodeURIComponent(`BLUNK üzerindeki bu gönderiye göz at: ${url}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function sharePostToInstagram() {
  const url = getPostShareUrl();
  if (navigator.share) {
    navigator.share({
      title: 'BLUNK Gönderisi',
      text: 'BLUNK üzerindeki bu gönderiyi incele!',
      url: url
    }).catch(() => {});
  } else {
    copyPostShareLink();
    if (typeof showToast === 'function') {
      showToast('Bağlantı kopyalandı! Hikayenizde paylaşabilirsiniz.');
    }
  }
}

function copyPostShareLink() {
  const url = getPostShareUrl();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showToast === 'function') showToast('Bağlantı panoya kopyalandı! 📋');
    });
  } else {
    const inp = document.createElement('input');
    inp.value = url;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand('copy');
    inp.remove();
    if (typeof showToast === 'function') showToast('Bağlantı kopyalandı! 📋');
  }
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
      avatarMarkup = renderAvatar({ username: t.username, profile_photo: t.profile_photo }, 'avatar avatar-md');
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
  updateShareSubmitBtnState(window._shareSelectedTargets.length);
}

async function submitMultiSharePost() {
  if (!_shareActivePostId || window._shareSelectedTargets.length === 0) return;

  updateShareSubmitBtnState(window._shareSelectedTargets.length, true);

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
    const count = window._shareSelectedTargets ? window._shareSelectedTargets.length : 0;
    updateShareSubmitBtnState(count, false);
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

async function openSharedPostInChat(postId) {
  if (typeof openGlobalPostModal === 'function') {
    openGlobalPostModal(postId);
  } else if (typeof openProfilePostDetail === 'function') {
    openProfilePostDetail(postId);
  } else {
    showToast('Gönderi detay modülü yüklenemedi.');
  }
}

function closeChatPostViewModal() {
  const modal = document.getElementById('chatPostViewModal');
  if (modal) modal.classList.remove('open');
}

// ============================================================
// MOBILE SWIPE-TO-REPLY & LONG-PRESS GESTURES
// ============================================================
let _swipeStartX = 0;
let _swipeStartY = 0;
let _swipeCurrentX = 0;
let _swipeCurrentY = 0;
let _swipeActiveEl = null;
let _swipeIndicatorEl = null;
let _swipeIsHorizontal = false;
let _swipeVibrated = false;
let _msgLongPressTimer = null;

function handleTouchStart(event, messageId, content, fromUsername, isMe) {
  const touch = event.touches[0];
  _swipeStartX = touch.clientX;
  _swipeStartY = touch.clientY;
  _swipeCurrentX = touch.clientX;
  _swipeCurrentY = touch.clientY;
  _swipeIsHorizontal = false;
  _swipeVibrated = false;
  
  _swipeActiveEl = event.currentTarget || event.target.closest('.msg-body-wrapper');
  _swipeIndicatorEl = document.getElementById(`swipe-icon-${messageId}`);

  if (_swipeActiveEl) {
    _swipeActiveEl.style.transition = 'none';
  }
  if (_swipeIndicatorEl) {
    _swipeIndicatorEl.style.transition = 'none';
    _swipeIndicatorEl.style.opacity = '0';
    _swipeIndicatorEl.style.transform = 'translateY(-50%) scale(0.6)';
    _swipeIndicatorEl.classList.remove('ready');
  }

  // Long press timer for opening actions popover
  clearTimeout(_msgLongPressTimer);
  _msgLongPressTimer = setTimeout(() => {
    if (!_swipeIsHorizontal && Math.abs(_swipeCurrentX - _swipeStartX) < 12 && Math.abs(_swipeCurrentY - _swipeStartY) < 12) {
      triggerHapticFeedback();
      openMessageActionsMenu(event, messageId, content, fromUsername, isMe);
    }
  }, 480);
}

function triggerHapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(15);
  } else {
    try {
      const input = document.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('switch', '');
      input.style.position = 'absolute';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);
      input.click();
      input.remove();
    } catch (e) {}
  }
}

function handleTouchMove(event, messageId) {
  if (!_swipeActiveEl) return;
  const touch = event.touches[0];
  _swipeCurrentX = touch.clientX;
  _swipeCurrentY = touch.clientY;
  
  const diffX = _swipeCurrentX - _swipeStartX;
  const diffY = _swipeCurrentY - _swipeStartY;

  // Determine gesture direction
  if (!_swipeIsHorizontal) {
    if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      _swipeIsHorizontal = true;
      clearTimeout(_msgLongPressTimer);
    } else if (Math.abs(diffY) > 8) {
      clearTimeout(_msgLongPressTimer);
      return; // Normal vertical scrolling
    }
  }

  // Drag right gesture
  if (_swipeIsHorizontal && diffX > 0) {
    clearTimeout(_msgLongPressTimer);
    const maxDrag = 80;
    // Fluid rubber-band drag amount
    const dragAmount = Math.min(diffX * 0.65, maxDrag);
    _swipeActiveEl.style.transform = `translateX(${dragAmount}px)`;

    const threshold = 42;
    const progress = Math.min(dragAmount / threshold, 1);

    if (_swipeIndicatorEl) {
      _swipeIndicatorEl.style.opacity = (progress * 0.95).toFixed(2);
      _swipeIndicatorEl.style.transform = `translateY(-50%) scale(${0.7 + progress * 0.35}) translateX(${dragAmount * 0.4}px)`;
      
      if (dragAmount >= threshold) {
        _swipeIndicatorEl.classList.add('ready');
        if (!_swipeVibrated) {
          triggerHapticFeedback();
          _swipeVibrated = true;
        }
      } else {
        _swipeIndicatorEl.classList.remove('ready');
        _swipeVibrated = false;
      }
    }
    
    if (event.cancelable) {
      event.preventDefault();
    }
  }
}

function handleTouchEnd(event, messageId, content, fromUsername, isMe) {
  clearTimeout(_msgLongPressTimer);
  if (!_swipeActiveEl) return;
  
  const diffX = _swipeCurrentX - _swipeStartX;
  const dragAmount = Math.min(diffX * 0.65, 80);
  const wasTriggered = _swipeIsHorizontal && dragAmount >= 42;
  
  // Spring bounce back to 0
  _swipeActiveEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  _swipeActiveEl.style.transform = 'translateX(0)';
  
  if (_swipeIndicatorEl) {
    _swipeIndicatorEl.style.transition = 'all 0.22s ease';
    _swipeIndicatorEl.style.opacity = '0';
    _swipeIndicatorEl.style.transform = 'translateY(-50%) scale(0.5)';
    _swipeIndicatorEl.classList.remove('ready');
  }

  if (wasTriggered) {
    let replyContentText = content;
    if (replyContentText.startsWith('[POST_SHARE]:')) {
      replyContentText = 'Paylaşılan Gönderi';
    } else if (replyContentText.includes('[IMAGE]:')) {
      replyContentText = 'Görsel';
    }
    setReplyMessage(messageId, replyContentText, fromUsername);
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.focus();
    }
  }
  
  _swipeActiveEl = null;
  _swipeIndicatorEl = null;
  _swipeIsHorizontal = false;
}

function handleTouchCancel(event, messageId) {
  clearTimeout(_msgLongPressTimer);
  if (_swipeActiveEl) {
    _swipeActiveEl.style.transition = 'transform 0.2s ease';
    _swipeActiveEl.style.transform = 'translateX(0)';
  }
  if (_swipeIndicatorEl) {
    _swipeIndicatorEl.style.opacity = '0';
    _swipeIndicatorEl.classList.remove('ready');
  }
  _swipeActiveEl = null;
  _swipeIndicatorEl = null;
  _swipeIsHorizontal = false;
}

// ============================================================
// DISAPPEARING MESSAGES MODAL LOGIC
// ============================================================
function openDisappearingSettingsModal() {
  const modal = document.getElementById('disappearingSettingsModal');
  if (modal) {
    modal.classList.add('open');
    document.querySelectorAll('.disappearing-check').forEach(el => {
      const h = parseInt(el.getAttribute('data-hours'));
      if (h === _chatDisappearingHours) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }
}

function closeDisappearingSettingsModal() {
  const modal = document.getElementById('disappearingSettingsModal');
  if (modal) modal.classList.remove('open');
}

async function selectDisappearingOption(hours) {
  if (hours === 0) {
    showToast('Çok yakında abonelik sistemi ile sınırsız süreli mesajları aktif edeceğiz...');
    return;
  }
  _chatDisappearingHours = hours;
  closeDisappearingSettingsModal();
  updateDisappearingHeaderLabel(hours);

  if (!_activeChatPartner) return;
  const target = _activeChatType === 'group' ? `group_${_activeChatId}` : _activeChatPartner;

  try {
    await fetch(`/api/messages/settings/${encodeURIComponent(target)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disappearing_hours: hours })
    });
    showToast(`Süreli mesajlar ${hours >= 24 ? (hours/24) + ' gün' : hours + ' saat'} olarak ayarlandı.`);
    await refreshChatMessages();
  } catch (e) {
    console.error('Failed to update disappearing settings:', e);
  }
}

function updateDisappearingHeaderLabel(hours) {
  const label = document.getElementById('chatDisappearingLabel');
  if (!label) return;
  if (hours === 0) label.textContent = 'Kapalı';
  else if (hours === 1) label.textContent = '1sa';
  else if (hours === 24) label.textContent = '24sa';
  else if (hours === 168) label.textContent = '7gün';
  else label.textContent = `${hours}sa`;
}

// ============================================================
// INBOX USER SEARCH & DESKTOP PANEL TOGGLE
// ============================================================
let _inboxSearchTimeout = null;
function handleInboxSearchInput(query) {
  clearTimeout(_inboxSearchTimeout);
  const q = (query || '').trim().toLowerCase();
  
  if (!q) {
    _lastInboxFingerprint = '';
    loadInbox();
    return;
  }

  _inboxSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search/users?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const users = await res.json();
      const inboxList = document.getElementById('inboxList');
      if (!inboxList) return;

      const myName = (typeof currentUser !== 'undefined' && currentUser?.username) || localStorage.getItem('username');
      const filteredUsers = (users || []).filter(u => !myName || u.username.toLowerCase() !== myName.toLowerCase());

      if (filteredUsers.length === 0) {
        inboxList.innerHTML = '<div style="padding:16px;text-align:center;color:#666;font-size:11px;font-weight:700">Kullanıcı bulunamadı</div>';
        return;
      }

      inboxList.innerHTML = filteredUsers.map(u => `
        <div class="inbox-item" onclick="openDirectChat('${esc(u.username)}', 0)" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border-soft);background:#050505;cursor:pointer;position:relative">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            ${renderAvatar(u, 'avatar avatar-sm')}
            <div style="min-width:0">
              <div style="font-weight:800;color:#fff;font-size:13px">@${esc(u.username)}</div>
              <div style="font-size:10px;color:#888">Seviye ${u.level} • ${u.xp} XP</div>
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Failed to search users in inbox:', e);
    }
  }, 250);
}


