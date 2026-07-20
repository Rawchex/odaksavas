/* ============================================================
   PROFILE.JS — Instagram-style grid, post detail modal
   ============================================================ */

'use strict';

let _profileActiveTab = 'posts';
let _profileSettingsMode = false;
let _profileUserPosts = [];
let _profileUserReposts = [];
let _profileMenuPostId = null;
let _profileMenuIsRepost = false;

// ============================================================
// LOAD MY PROFILE
// ============================================================
async function loadMyProfile() {
  const content = document.getElementById('myProfileContent');
  if (!content) return;
  content.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';

  try {
    const res = await fetch(`/api/users/${currentUser.username}`);
    if (!res.ok) throw new Error();
    const user = await res.json();
    currentUser = { ...currentUser, ...user };
    renderMyProfile(user);
  } catch {
    content.innerHTML = '<div class="empty-state"><div class="empty-title">Profil yüklenemedi</div></div>';
  }
}

// ============================================================
// RENDER MY PROFILE
// ============================================================
function renderMyProfile(user) {
  const content = document.getElementById('myProfileContent');
  if (!content) return;

  const progress = getLevelProgress(user.xp || 0);
  const sessions = user.sessions || [];
  const posts = user.posts || [];
  const reposts = user.reposts || [];
  _profileUserPosts = posts;
  _profileUserReposts = reposts;

  let tabContentHtml = '';
  if (_profileActiveTab === 'posts') {
    tabContentHtml = posts.length === 0
      ? `<div class="profile-empty-tab">HENÜZ GÖNDERİ YOK</div>`
      : `<div class="profile-post-grid">${posts.map(p => renderPostGridItem(p, true, false)).join('')}</div>`;
  } else if (_profileActiveTab === 'sessions') {
    tabContentHtml = sessions.length === 0
      ? `<div class="profile-empty-tab">HENÜZ ODAK OTURUMU YOK</div>`
      : `<div class="profile-sessions-list">${sessions.slice(0, 30).map(s => {
          const detailParts = [];
          if (s.feeling) detailParts.push(`<span class="session-detail-feeling">${esc(s.feeling)}</span>`);
          if (s.category) detailParts.push(`<span class="session-detail-category">📁 ${esc(s.category)}</span>`);
          if (s.activity) detailParts.push(`<span class="session-detail-activity">🎯 ${esc(s.activity)}</span>`);
          
          const detailsHtml = detailParts.length > 0 
            ? `<div class="session-row-details" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; font-size:10px; color:var(--text-3); font-weight:600;">
                 ${detailParts.join('<span style="opacity:0.3">•</span>')}
               </div>`
            : '';

          return `
          <div class="session-row" style="flex-direction:column; align-items:stretch; padding:16px 20px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <div>
                <div class="session-row-time">${fmtTime(s.duration || 0)}</div>
                <div class="session-row-date">${fmtDate(s.start_time)}</div>
              </div>
              <div class="session-badge ${s.status === 'completed' ? 'ok' : 'fail'}">
                ${s.status === 'completed' ? 'TAMAM' : s.status === 'violated' ? 'İHLAL' : 'TERK'}
              </div>
            </div>
            ${detailsHtml}
          </div>`;
        }).join('')}</div>`;
  } else if (_profileActiveTab === 'reposts') {
    tabContentHtml = reposts.length === 0
      ? `<div class="profile-empty-tab">HENÜZ REPOST YOK</div>`
      : `<div class="profile-post-grid">${reposts.map(p => renderPostGridItem(p, false, true)).join('')}</div>`;
  }

  const statusColors = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af' };
  const userStatusColor = statusColors[user.status || 'online'] || statusColors.online;

  content.innerHTML = `
    <div class="profile-insta-header">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="profile-insta-username" style="font-size:18px;">${esc(user.username)}</span>
          <span class="lvl-badge">LVL ${user.level}</span>
          <div class="status-dot-indicator" style="background:${userStatusColor}; width:12px; height:12px; border-radius:50%; cursor:pointer;" onclick="openStatusSelector()"></div>
        </div>
      </div>

      <div class="profile-insta-top">
        <div class="profile-insta-avatar-col" onclick="document.getElementById('photoUpload').click()">
          ${renderAvatar(user, 'avatar avatar-xl')}
          <div class="profile-avatar-edit-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
        </div>
        <div class="profile-insta-stats-col">
          <div>
            <div class="profile-insta-stat-val">${user.post_count || 0}</div>
            <div class="profile-insta-stat-lbl">Gönderi</div>
          </div>
          <div onclick="openFriendListModal('${esc(user.username)}')" style="cursor:pointer">
            <div class="profile-insta-stat-val">${user.friend_count || 0}</div>
            <div class="profile-insta-stat-lbl">Takipçi</div>
          </div>
          <div onclick="openFriendListModal('${esc(user.username)}')" style="cursor:pointer">
            <div class="profile-insta-stat-val">${user.friend_count || 0}</div>
            <div class="profile-insta-stat-lbl">Takip</div>
          </div>
        </div>
      </div>

      <div class="profile-insta-meta">
        ${user.is_private ? '<div style="margin-bottom:8px"><span class="profile-private-dot">🔒 Gizli Hesap</span></div>' : ''}
        ${user.bio ? `<div class="profile-insta-bio">${esc(user.bio)}</div>` : ''}
        <div class="profile-insta-details">
          ${user.height ? `<span>📏 ${user.height}cm</span>` : ''}
          ${user.weight ? `<span>⚖️ ${user.weight}kg</span>` : ''}
          <span>⏱️ ${fmtTime(user.total_focus_time || 0)}</span>
        </div>
        <div class="profile-xp-row">
          <div class="xp-bar-wrap" style="height:2px;background:#1a1a1a;flex:1">
            <div class="xp-bar-fill" style="width:${progress.percentage}%;background:#fff;height:100%"></div>
          </div>
          <span class="profile-xp-label">${progress.xpInLevel}/${progress.xpNeededForNext} XP</span>
        </div>
      </div>
    </div>

    <div class="profile-insta-tabs">
      <div class="profile-insta-tab ${_profileActiveTab === 'posts' ? 'active' : ''}" onclick="switchProfileTab('posts')">
        <svg viewBox="0 0 24 24" fill="${_profileActiveTab === 'posts' ? '#fff' : '#555'}" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </div>
      <div class="profile-insta-tab ${_profileActiveTab === 'sessions' ? 'active' : ''}" onclick="switchProfileTab('sessions')">
        <svg viewBox="0 0 24 24" fill="none" stroke="${_profileActiveTab === 'sessions' ? '#fff' : '#555'}" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      </div>
      <div class="profile-insta-tab ${_profileActiveTab === 'reposts' ? 'active' : ''}" onclick="switchProfileTab('reposts')">
        <svg viewBox="0 0 24 24" fill="none" stroke="${_profileActiveTab === 'reposts' ? '#fff' : '#555'}" stroke-width="2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </div>
    </div>

    <div id="profileTabContent">
      ${tabContentHtml}
    </div>
  `;
}

// ============================================================
// POST GRID ITEM
// ============================================================
function renderPostGridItem(p, isOwn, isRepost) {
  const hasImage = !!p.image;
  const thumb = hasImage
    ? `<img src="${p.image}" class="profile-grid-thumb" loading="lazy">`
    : `<div class="profile-grid-text"><span>${esc((p.content || '').slice(0, 80))}</span></div>`;

  const list = isRepost ? _profileUserReposts : _profileUserPosts;
  const idx = list.findIndex(x => x.id === p.id);

  return `
    <div class="profile-grid-item" onclick="openProfilePostSlider(${idx}, ${!!isOwn}, ${!!isRepost})">
      ${thumb}
      ${(p.like_count > 0 || p.comment_count > 0) ? `
        <div class="profile-grid-overlay">
          <span>♥ ${p.like_count || 0}</span>
          <span>💬 ${p.comment_count || 0}</span>
        </div>` : ''}
    </div>
  `;
}

// ============================================================
// POST DETAIL MODAL — full Instagram-style
// ============================================================
async function openProfilePostDetail(postId, isOwn, isRepost) {
  // Remove existing
  const existing = document.getElementById('profilePostPreview');
  if (existing) existing.remove();

  // Disable body scroll to prevent background scrolling
  document.body.style.overflow = 'hidden';

  // Skeleton loader
  const el = document.createElement('div');
  el.id = 'profilePostPreview';
  el.className = 'pdetail-backdrop';
  el.onclick = (e) => { if (e.target === el) closeProfilePostPreview(); };

  const sheet = document.createElement('div');
  sheet.className = 'pdetail-sheet';
  sheet.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';
  el.appendChild(sheet);
  document.body.appendChild(el);
  requestAnimationFrame(() => sheet.classList.add('open'));

  try {
    const res = await fetch(`/api/posts/${postId}`);
    if (!res.ok) throw new Error();
    const post = await res.json();

    renderPostDetailSheet(sheet, post, isOwn, isRepost);
  } catch {
    // Fallback: use cached data
    const list = isRepost ? _profileUserReposts : _profileUserPosts;
    const post = list.find(p => p.id === postId);
    if (post) {
      renderPostDetailSheet(sheet, post, isOwn, isRepost);
    } else {
      sheet.innerHTML = '<div class="empty-state"><div class="empty-title">Yüklenemedi</div></div>';
    }
  }
}

function renderPostDetailSheet(sheet, post, isOwn, isRepost) {
  const isSelfPost = post.username === currentUser.username;
  const displayContent = (post.content || '').replace(/^Repost: /, '');
  const comments = post.comments || [];
  const likers = post.likers || [];

  // Build avatar for post author — use currentUser data if it's own post
  const authorPhoto = isSelfPost ? (currentUser.profile_photo || post.profile_photo) : post.profile_photo;
  const authorObj = { username: post.username, profile_photo: authorPhoto };

  // Likers preview
  const likersHtml = likers.length > 0 ? `
    <div class="pdetail-likers">
      <div class="pdetail-likers-avatars">
        ${likers.slice(0, 3).map(l => renderAvatar({ username: l.username, profile_photo: l.profile_photo }, 'avatar avatar-xs')).join('')}
      </div>
      <span class="pdetail-likers-text">
        ${likers[0]?.username ? `<strong>${esc(likers[0].username)}</strong>` : ''}${likers.length > 1 ? ` ve ${post.like_count - 1} kişi` : ''} beğendi
      </span>
    </div>
  ` : '';

  // Comments grouping
  const parents = comments.filter(c => !c.parent_id || c.parent_id === 'null' || c.parent_id === '0' || c.parent_id === 0);
  const childrenMap = {};
  comments.forEach(c => {
    const isChild = c.parent_id && c.parent_id !== 'null' && c.parent_id !== '0' && c.parent_id !== 0;
    if (isChild) {
      if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
      childrenMap[c.parent_id].push(c);
    }
  });

  const commentsHtml = parents.length === 0
    ? `<div class="pdetail-no-comment">Henüz yorum yok</div>`
    : parents.map(c => renderPdetailCommentTree(c, childrenMap[c.id] || [], post)).join('');

  sheet.innerHTML = `
    <div class="pdetail-header">
      <div class="pdetail-author">
        ${renderAvatar(authorObj, 'avatar avatar-sm')}
        <span class="pdetail-author-name">${esc(post.username)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${(isOwn || isSelfPost) && !isRepost ? `
          <button class="pdetail-menu-btn" onclick="openDetailMenu(${post.id})">
            <span></span><span></span><span></span>
          </button>` : ''}
        ${isRepost ? `
          <button class="pdetail-menu-btn" onclick="profileRemoveRepostFromDetail(${post.id})">
            <span></span><span></span><span></span>
          </button>` : ''}
        <button onclick="closeProfilePostPreview()" class="pdetail-close-btn">✕</button>
      </div>
    </div>

    ${post.image ? `<img src="${post.image}" class="pdetail-image">` : `
      <div class="pdetail-text-card-content">
        <p>${esc(displayContent)}</p>
      </div>
    `}

    <div class="pdetail-actions">
      <div class="pdetail-action-left">
        <button class="pdetail-action-btn ${post.user_liked ? 'liked' : ''}" onclick="pdetailLike(${post.id}, this)">
          <svg viewBox="0 0 24 24" fill="${post.user_liked ? '#ff3b30' : 'none'}" stroke="${post.user_liked ? '#ff3b30' : 'currentColor'}" stroke-width="2" width="24" height="24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="pdetail-action-btn" onclick="focusDetailComment(${post.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="pdetail-action-btn ${(post.user_reposted || isRepost) ? 'reposted' : ''}" onclick="pdetailRepost(${post.id}, this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="${(post.user_reposted || isRepost) ? '#32d74b' : 'currentColor'}" stroke-width="2" width="22" height="22"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        <button class="pdetail-action-btn" onclick="openSharePostModal(${post.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
      <div class="pdetail-counts">
        <span id="pdetail-like-count">${post.like_count || 0} beğeni</span>
        <span style="color:var(--text-3)">·</span>
        <span>${post.comment_count || 0} yorum</span>
        <span style="color:var(--text-3)">·</span>
        <span id="pdetail-repost-count-${post.id}">${post.repost_count || 0} repost</span>
        <span style="color:var(--text-3)">·</span>
        <span>${post.views || 0} görüntülenme</span>
      </div>
    </div>

    ${displayContent && post.image ? `<div class="pdetail-content"><strong>${esc(post.username)}</strong> ${esc(displayContent)}</div>` : ''}

    ${likersHtml}

    <div class="pdetail-meta">${fmtPostTime(post.created_at)}</div>

    <div id="pdetail-reply-bar-${post.id}" style="display:none"></div>
    <div class="pdetail-comments-section" id="pdetailComments-${post.id}">
      ${commentsHtml}
    </div>

    <div class="pdetail-comment-input-row">
      ${renderAvatar(currentUser, 'avatar avatar-xs')}
      <input id="pdetailCommentInput-${post.id}" class="pdetail-comment-input" placeholder="Yorum ekle..." onkeydown="if(event.key==='Enter') pdetailComment(${post.id})">
      <button class="pdetail-comment-send" onclick="pdetailComment(${post.id})">Gönder</button>
    </div>

    <!-- Detail 3-dot menu panel -->
    <div id="pdetailMenuOverlay-${post.id}" class="profile-menu-overlay" onclick="closeDetailMenu(${post.id})" style="display:none"></div>
    <div id="pdetailMenuPanel-${post.id}" class="profile-post-menu-panel" style="display:none">
      <button class="profile-post-menu-item" onclick="pdetailEditPost(${post.id}, \`${esc(displayContent)}\`)">✏️ Düzenle</button>
      <button class="profile-post-menu-item danger" onclick="pdetailDeletePost(${post.id})">🗑 Sil</button>
    </div>
  `;

  if ((!post.comments || post.comments.length === 0) && post.comment_count > 0) {
    setTimeout(() => {
      loadPdetailComments(post.id);
    }, 50);
  }
}

function closeProfilePostPreview() {
  const el = document.getElementById('profilePostPreview');
  if (el) {
    const sheet = el.querySelector('.pdetail-sheet');
    if (sheet) sheet.classList.remove('open');
    setTimeout(() => {
      el.remove();
      // Restore body scroll
      document.body.style.overflow = '';
    }, 280);
  }
}

// Detail menu
function openDetailMenu(postId) {
  document.getElementById(`pdetailMenuOverlay-${postId}`).style.display = 'block';
  document.getElementById(`pdetailMenuPanel-${postId}`).style.display = 'flex';
}
function closeDetailMenu(postId) {
  const o = document.getElementById(`pdetailMenuOverlay-${postId}`);
  const p = document.getElementById(`pdetailMenuPanel-${postId}`);
  if (o) o.style.display = 'none';
  if (p) p.style.display = 'none';
}

// Edit from detail
function pdetailEditPost(postId, currentContent) {
  closeDetailMenu(postId);
  const existing = document.getElementById('pdetailEditSheet');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'pdetailEditSheet';
  el.className = 'profile-edit-modal';
  el.style.zIndex = '970';
  el.onclick = (e) => { if (e.target === el) el.remove(); };

  const inner = document.createElement('div');
  inner.className = 'profile-edit-modal-inner';

  const header = document.createElement('div');
  header.className = 'profile-edit-modal-header';
  header.innerHTML = `<span>GÖNDERİYİ DÜZENLE</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#666;font-size:18px;cursor:pointer';
  closeBtn.onclick = () => el.remove();
  header.appendChild(closeBtn);

  const textarea = document.createElement('textarea');
  textarea.className = 'profile-edit-modal-textarea';
  textarea.value = currentContent;
  textarea.placeholder = 'Ne düşünüyorsun?';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'mono-btn-primary';
  saveBtn.textContent = 'KAYDET';
  saveBtn.onclick = async () => {
    const content = textarea.value.trim();
    saveBtn.disabled = true;
    saveBtn.textContent = 'KAYDEDİLİYOR...';
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        showToast('Güncellendi');
        el.remove();
        closeProfilePostPreview();
        loadMyProfile();
      } else {
        showToast('Güncellenemedi');
        saveBtn.disabled = false;
        saveBtn.textContent = 'KAYDET';
      }
    } catch {
      showToast('Bağlantı hatası');
      saveBtn.disabled = false;
      saveBtn.textContent = 'KAYDET';
    }
  };

  inner.appendChild(header);
  inner.appendChild(textarea);
  inner.appendChild(saveBtn);
  el.appendChild(inner);
  document.body.appendChild(el);
}

// Delete from detail
async function pdetailDeletePost(postId) {
  closeDetailMenu(postId);
  if (!(await window.showConfirm('Bu gönderiyi silmek istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Gönderi silindi');
      closeProfilePostPreview();
      loadMyProfile();
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// Remove repost from detail
async function profileRemoveRepostFromDetail(postId) {
  if (!(await window.showConfirm('Repost\'u kaldırmak istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}/repost`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Repost kaldırıldı');
      closeProfilePostPreview();
      loadMyProfile();
    } else {
      showToast('Kaldırılamadı');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// Like from detail
async function pdetailLike(postId, btn) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const liked = !data.unliked;
      btn.querySelector('svg').setAttribute('fill', liked ? '#ff3b30' : 'none');
      btn.querySelector('svg').setAttribute('stroke', liked ? '#ff3b30' : 'currentColor');
      btn.classList.toggle('liked', liked);
      // Update count
      const countEl = document.getElementById('pdetail-like-count');
      if (countEl) {
        const cur = parseInt(countEl.textContent) || 0;
        countEl.textContent = `${liked ? cur + 1 : Math.max(0, cur - 1)} beğeni`;
      }
    }
  } catch {}
}

// Repost from detail
async function pdetailRepost(postId, btn) {
  const isReposted = btn.classList.contains('reposted');
  try {
    const res = await fetch(`/api/posts/${postId}/repost`, { method: isReposted ? 'DELETE' : 'POST' });
    if (res.ok) {
      if (isReposted) {
        showToast('Repost kaldırıldı');
        btn.querySelector('svg').setAttribute('stroke', 'currentColor');
        btn.classList.remove('reposted');
        // If we are on the reposts tab, close and refresh so the item disappears from grid
        if (_profileActiveTab === 'reposts') {
          closeProfilePostPreview();
        }
      } else {
        showToast('Repost yapıldı');
        btn.querySelector('svg').setAttribute('stroke', '#32d74b');
        btn.classList.add('reposted');
      }

      const countEl = document.getElementById(`pdetail-repost-count-${postId}`);
      if (countEl) {
        const cur = parseInt(countEl.textContent) || 0;
        countEl.textContent = `${isReposted ? Math.max(0, cur - 1) : cur + 1} repost`;
      }

      loadMyProfile();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Repost işlemi başarısız');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// Comment from detail
async function pdetailComment(postId) {
  const input = document.getElementById(`pdetailCommentInput-${postId}`);
  if (!input || !input.value.trim()) return;
  const content = input.value.trim();

  const replyState = _pdetailReplyStates[postId];
  const parentId = replyState ? replyState.parentId : null;

  try {
    const res = await fetch(`/api/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parent_id: parentId })
    });
    if (res.ok) {
      input.value = '';
      if (replyState) {
        cancelPdetailReply(postId);
      }
      await loadPdetailComments(postId);
    }
  } catch {}
}

function focusDetailComment(postId) {
  document.getElementById(`pdetailCommentInput-${postId}`)?.focus();
}

// ============================================================
// PROFILE DETAIL NESTED COMMENTS HELPERS
// ============================================================
let _pdetailReplyStates = {};

function setPdetailReplyTo(postId, parentId, username) {
  _pdetailReplyStates[postId] = { parentId, username };
  const input = document.getElementById(`pdetailCommentInput-${postId}`);
  if (input) {
    input.placeholder = `@${username} kullanıcısına yanıt yaz...`;
    input.value = `@${username} ` + input.value.replace(/^@[a-zA-Z0-9_.]+\s*/, '');
    input.focus();
  }
  renderPdetailReplyBar(postId);
}

function cancelPdetailReply(postId) {
  const replyState = _pdetailReplyStates[postId];
  delete _pdetailReplyStates[postId];
  const input = document.getElementById(`pdetailCommentInput-${postId}`);
  if (input) {
    input.placeholder = "Yorum ekle...";
    if (replyState && input.value.startsWith(`@${replyState.username} `)) {
      input.value = input.value.substring(replyState.username.length + 2);
    }
  }
  renderPdetailReplyBar(postId);
}

function renderPdetailReplyBar(postId) {
  const container = document.getElementById(`pdetail-reply-bar-${postId}`);
  if (!container) return;
  const state = _pdetailReplyStates[postId];
  if (state) {
    container.innerHTML = `
      <div class="reply-active-indicator" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);padding:6px 12px;border-radius:6px;font-size:11px;margin-bottom:8px;color:#aaa">
        <span>@${state.username} kullanıcısına yanıt veriliyor</span>
        <button onclick="cancelPdetailReply(${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-weight:bold;font-size:12px;padding:2px 6px">✕</button>
      </div>
    `;
    container.style.display = 'block';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function togglePdetailRepliesContainer(btn, parentId) {
  const container = document.getElementById(`pdetail-replies-list-${parentId}`);
  if (!container) return;
  const isHidden = container.style.display === 'none' || !container.style.display;
  if (isHidden) {
    container.style.display = 'flex';
    btn.querySelector('.text').textContent = 'Yanıtları gizle';
  } else {
    container.style.display = 'none';
    btn.querySelector('.text').textContent = `Yanıtları gör (${container.children.length})`;
  }
}

async function loadPdetailComments(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const comments = await res.json();
    const section = document.getElementById(`pdetailComments-${postId}`);
    if (!section) return;

    const parents = comments.filter(c => !c.parent_id || c.parent_id === 'null' || c.parent_id === '0' || c.parent_id === 0);
    const childrenMap = {};
    comments.forEach(c => {
      const isChild = c.parent_id && c.parent_id !== 'null' && c.parent_id !== '0' && c.parent_id !== 0;
      if (isChild) {
        if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
        childrenMap[c.parent_id].push(c);
      }
    });

    // Try to get post owner username from cached data
    const cachedPost = (_profileUserPosts || []).find(p => p.id === postId)
      || (_profileUserReposts || []).find(p => p.id === postId);
    const post = cachedPost ? cachedPost : { id: postId, username: null };

    section.innerHTML = parents.length === 0
      ? `<div class="pdetail-no-comment">Henüz yorum yok</div>`
      : parents.map(c => renderPdetailCommentTree(c, childrenMap[c.id] || [], post)).join('');
  } catch {}
}

async function deletePdetailComment(commentId, postId) {
  if (!(await window.showConfirm('Bu yorumu silmek istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Yorum silindi');
      await loadPdetailComments(postId);
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

function renderPdetailCommentTree(c, replies, post) {
  const canDelete = currentUser && (c.username === currentUser.username || (post && post.username === currentUser.username));
  const repliesHtml = replies.map(r => renderPdetailReplyItem(r, post)).join('');
  const hasReplies = replies.length > 0;

  return `
    <div class="pdetail-comment-tree-node" id="pdetail-comment-node-${c.id}" style="margin-bottom:12px;display:flex;flex-direction:column;">
      <div class="pdetail-comment" id="pdetail-comment-item-${c.id}" style="display:flex;gap:10px;align-items:flex-start;">
        ${renderAvatar({ username: c.username, profile_photo: c.profile_photo }, 'avatar avatar-xs')}
        <div class="pdetail-comment-body" style="flex:1">
          <div class="pdetail-comment-meta" style="margin-bottom:2px;">
            <span class="pdetail-comment-user" style="font-weight:700;color:#fff;cursor:pointer;" onclick="openUserPage('${esc(c.username)}')">${esc(c.username)}</span>
            <span style="font-size:10px;color:#555;margin-left:6px;">${fmtPostTime(c.created_at)}</span>
          </div>
          <span class="pdetail-comment-text" style="font-size:13px;color:#ddd;word-break:break-word;">${esc(c.content)}</span>
          <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
            <button
              class="comment-like-btn ${c.user_liked ? 'liked' : ''}"
              id="clbtn-${c.id}"
              onclick="toggleCommentLike(${c.id})"
              style="background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px"
            >
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;${c.user_liked ? 'fill:var(--danger);stroke:var(--danger)' : 'stroke:#555'}"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span id="cl-count-${c.id}" style="font-size:10px;color:#555">${c.like_count || 0}</span>
            </button>
            <button onclick="setPdetailReplyTo(${post.id}, ${c.id}, '${esc(c.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yanıtla</button>
            ${canDelete ? `
              <button onclick="deletePdetailComment(${c.id}, ${post.id})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>
            ` : ''}
          </div>
        </div>
      </div>

      ${hasReplies ? `
        <div class="pdetail-replies-wrapper" style="margin-left:36px;margin-top:6px;">
          <button class="pdetail-replies-toggle-btn" onclick="togglePdetailRepliesContainer(this, ${c.id})" style="background:none;border:none;color:#888;cursor:pointer;padding:4px 0;font-size:10px;font-weight:600;display:flex;align-items:center;gap:6px">
            <span class="line" style="display:inline-block;width:16px;height:1px;background:#333"></span>
            <span class="text">Yanıtları gör (${replies.length})</span>
          </button>
          <div class="pdetail-replies-list" id="pdetail-replies-list-${c.id}" style="display:none;padding-left:10px;border-left:1px solid #222;margin-top:6px;flex-direction:column;gap:8px">
            ${repliesHtml}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderPdetailReplyItem(r, post) {
  const canDelete = currentUser && (r.username === currentUser.username || (post && post.username === currentUser.username));
  return `
    <div class="pdetail-comment reply-item" id="pdetail-comment-item-${r.id}" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px;">
      ${renderAvatar({ username: r.username, profile_photo: r.profile_photo }, 'avatar avatar-xs')}
      <div class="pdetail-comment-body" style="flex:1">
        <div class="pdetail-comment-meta" style="margin-bottom:2px;">
          <span class="pdetail-comment-user" style="font-weight:700;color:#fff;cursor:pointer;" onclick="openUserPage('${esc(r.username)}')">${esc(r.username)}</span>
          <span style="font-size:10px;color:#555;margin-left:6px;">${fmtPostTime(r.created_at)}</span>
        </div>
        <span class="pdetail-comment-text" style="font-size:13px;color:#ddd;word-break:break-word;">${esc(r.content)}</span>
        <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
          <button
            class="comment-like-btn ${r.user_liked ? 'liked' : ''}"
            id="clbtn-${r.id}"
            onclick="toggleCommentLike(${r.id})"
            style="background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px"
          >
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;${r.user_liked ? 'fill:var(--danger);stroke:var(--danger)' : 'stroke:#555'}"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="cl-count-${r.id}" style="font-size:10px;color:#555">${r.like_count || 0}</span>
          </button>
          <button onclick="setPdetailReplyTo(${post.id}, ${r.parent_id}, '${esc(r.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yanıtla</button>
          ${canDelete ? `
            <button onclick="deletePdetailComment(${r.id}, ${post.id})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PROFILE TAB SWITCH
// ============================================================
function switchProfileTab(tab) {
  _profileActiveTab = tab;
  loadMyProfile();
}

function openProfileSettings() {
  try {
    const modal = document.getElementById('profileSettingsModal');
    if (!modal) return;

    const user = currentUser || {};

    const avatarContainer = document.getElementById('settingsAvatarContainer');
    if (avatarContainer && typeof renderAvatar === 'function') {
      avatarContainer.innerHTML = renderAvatar(user, 'avatar avatar-xl');
    }

    const settingsPrivateToggle = document.getElementById('settingsPrivateToggle');
    if (settingsPrivateToggle) settingsPrivateToggle.checked = !!user.is_private;

    const settingsBio = document.getElementById('settingsBio');
    if (settingsBio) settingsBio.value = user.bio || '';

    const settingsHeight = document.getElementById('settingsHeight');
    if (settingsHeight) settingsHeight.value = user.height || '';

    const settingsWeight = document.getElementById('settingsWeight');
    if (settingsWeight) settingsWeight.value = user.weight || '';

    const settingsCv = document.getElementById('settingsCv');
    if (settingsCv) settingsCv.value = user.cv || '';

    // Clear password inputs
    const settingsOldPassword = document.getElementById('settingsOldPassword');
    if (settingsOldPassword) settingsOldPassword.value = '';
    const settingsNewPassword = document.getElementById('settingsNewPassword');
    if (settingsNewPassword) settingsNewPassword.value = '';

    try {
      if (typeof populateMicDeviceList === 'function') {
        populateMicDeviceList();
      }
    } catch (e) {
      console.warn("Failed to populate mic list inside settings:", e);
    }

    modal.style.display = 'flex';
  } catch (err) {
    console.error("Error in openProfileSettings:", err);
    // Fallback opening
    const modal = document.getElementById('profileSettingsModal');
    if (modal) modal.style.display = 'flex';
  }
}

function closeProfileSettingsModal() {
  const modal = document.getElementById('profileSettingsModal');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// SAVE SETTINGS
// ============================================================
async function saveSettings() {
  const bio = document.getElementById('settingsBio')?.value.trim() || '';
  const height = parseInt(document.getElementById('settingsHeight')?.value) || null;
  const weight = parseInt(document.getElementById('settingsWeight')?.value) || null;
  const cv = document.getElementById('settingsCv')?.value.trim() || '';
  const isPrivate = document.getElementById('settingsPrivateToggle')?.checked || false;

  const btn = document.getElementById('settingsSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'KAYDEDİLİYOR...'; }

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio, height, weight, cv, is_private: isPrivate })
    });
    if (res.ok) {
      currentUser.bio = bio;
      currentUser.height = height;
      currentUser.weight = weight;
      currentUser.cv = cv;
      currentUser.is_private = isPrivate ? 1 : 0;
      showToast('Profil ayarları kaydedildi');
      closeProfileSettingsModal();
      loadMyProfile();
    } else {
      showToast('Ayarlar kaydedilemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }

  if (btn) { btn.disabled = false; btn.textContent = 'AYARLARI KAYDET'; }
}

// ============================================================
// UPDATE PASSWORD
// ============================================================
async function updatePassword() {
  const oldPassword = document.getElementById('settingsOldPassword')?.value || '';
  const newPassword = document.getElementById('settingsNewPassword')?.value || '';

  if (!newPassword || newPassword.length < 6) {
    showToast('Yeni şifre en az 6 karakter olmalı');
    return;
  }

  const btn = document.getElementById('settingsPasswordBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'GÜNCELLENİYOR...'; }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Şifre başarıyla güncellendi');
      document.getElementById('settingsOldPassword').value = '';
      document.getElementById('settingsNewPassword').value = '';
    } else {
      showToast(data.error || 'Şifre güncellenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }

  if (btn) { btn.disabled = false; btn.textContent = 'ŞİFREYİ GÜNCELLE'; }
}

// ============================================================
// UPLOAD PROFILE PHOTO
// ============================================================
async function uploadProfilePhoto(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('photo', input.files[0]);
  try {
    const res = await fetch('/api/profile/photo', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      currentUser.profile_photo = data.photoPath;
      showToast('Fotoğraf güncellendi');
      
      const settingsAvatarContainer = document.getElementById('settingsAvatarContainer');
      if (settingsAvatarContainer) {
        settingsAvatarContainer.innerHTML = typeof renderAvatar === 'function' ? renderAvatar(currentUser, 'avatar avatar-xl') : '';
      }
      
      loadMyProfile();
    } else {
      showToast('Fotoğraf yüklenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
  input.value = '';
}
// ============================================================
async function setUserStatus(status) {
  try {
    const res = await fetch('/api/me/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      currentUser.status = status;
      closeStatusSelector();
      loadMyProfile(); // Reload header to update dot color
      if (typeof updatePresenceUI === 'function') updatePresenceUI();
      showToast('Durum güncellendi');
    } else {
      showToast('Güncellenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// ============================================================
// PROFILE POST SLIDER (Instagram style)
// ============================================================
function openProfilePostSlider(startIndex, isOwn, isRepost) {
  const overlay = document.getElementById('profilePostSliderOverlay');
  const container = document.getElementById('profilePostSliderContainer');
  if (!overlay || !container) return;

  const list = isRepost ? _profileUserReposts : _profileUserPosts;
  if (!list || list.length === 0) return;

  overlay.classList.add('open');
  container.innerHTML = '';

  list.forEach((post, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-post-wrapper';
    
    // Use the existing renderPostDetailSheet structure but attach it to a child of wrapper
    const sheet = document.createElement('div');
    sheet.className = 'pdetail-sheet open'; // force open for slider items
    sheet.style.transform = 'none'; // remove bottom-up animation
    sheet.style.position = 'relative';
    sheet.style.height = '100dvh';
    sheet.style.maxHeight = '100dvh';
    sheet.style.borderRadius = '0';
    sheet.style.paddingTop = '50px'; // make room for header
    
    wrapper.appendChild(sheet);
    container.appendChild(wrapper);

    // Call the rendering function
    renderPostDetailSheet(sheet, post, isOwn, isRepost);
    
    // Override the close button inside the sheet since the slider has its own close button
    const closeBtn = sheet.querySelector('.pdetail-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';
  });

  // Scroll to the clicked item
  const targetElement = container.children[startIndex];
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
}

function closeProfilePostSlider() {
  const overlay = document.getElementById('profilePostSliderOverlay');
  if (overlay) overlay.classList.remove('open');
}
