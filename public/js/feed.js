/* ============================================================
   FEED.JS — Instagram-like feed: posts, likes, comments, reposts
   ============================================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
let _currentFeedTab  = 'discover';
let _feedPosts       = [];
let _feedLoading     = false;
let _openComments    = {};   // postId → true/false
let _postImageFile   = null;

// ============================================================
// TAB SWITCH
// ============================================================
function switchFeedTab(tab) {
  _currentFeedTab = tab;
  document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.querySelector(`[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');
  _openComments = {};
  loadFeed();
}

// ============================================================
// LOAD FEED
// ============================================================
async function loadFeed() {
  if (_feedLoading) return;
  _feedLoading = true;

  const list = document.getElementById('feedList');
  if (list) list.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';

  try {
    const res = await fetch(`/api/feed/${_currentFeedTab}`);
    _feedPosts = await res.json();
    renderFeed();
  } catch {
    if (list) list.innerHTML = '<div class="empty-state"><div class="empty-title">Yüklenemedi</div></div>';
  }

  _feedLoading = false;
}

// ============================================================
// RENDER FEED
// ============================================================
function renderFeed() {
  const list = document.getElementById('feedList');
  if (!list) return;

  list.setAttribute('data-tab', _currentFeedTab);

  if (!_feedPosts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">${_currentFeedTab === 'following' ? 'Takip ettiğin kimse yok' : 'Henüz gönderi yok'}</div>
        <div class="empty-sub">İlk paylaşımı sen yap!</div>
      </div>`;
    return;
  }

  list.innerHTML = _feedPosts.map(p => renderPostCard(p)).join('');
}

// ============================================================
// RENDER SINGLE POST CARD
// ============================================================
function renderPostCard(p) {
  const commentsOpen = _openComments[p.id] || false;
  const isRepost = p.content && p.content.startsWith('Repost:');
  const hasImage = !!p.image;

  return `
    <article class="post-card ${hasImage ? 'has-image' : 'no-image'}" data-post-id="${p.id}" onclick="if(!event.target.closest('.post-card-actions, .post-card-header, button, a, img')) openProfilePostDetail(${p.id}, false, false)">
      <!-- Header -->
      <div class="post-card-header">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="event.stopPropagation(); openUserPage('${esc(p.username)}')">
          ${renderAvatar({ username: p.username, profile_photo: p.profile_photo }, 'avatar avatar-sm')}
          <div class="post-card-user-info">
            <div class="post-card-username">
              ${esc(p.username)}
              <span class="lvl-badge">LVL ${p.level}</span>
              ${isRepost ? '<span class="lvl-badge" style="color:var(--success);border-color:rgba(50,215,75,0.3)">REPOST</span>' : ''}
            </div>
            <div class="post-card-meta">${fmtPostTime(p.created_at)}</div>
          </div>
        </div>
        ${p.username === currentUser?.username ? `
          <button class="post-delete-btn" onclick="event.stopPropagation(); deletePost(${p.id})" style="background:none;border:none;color:#444;cursor:pointer;padding:8px 12px;font-size:14px;font-weight:bold">✕</button>
        ` : ''}
      </div>

      <!-- Content -->
      ${p.content ? `<div class="post-card-content">${esc(p.content)}</div>` : ''}

      <!-- Image -->
      ${p.image ? `<img
        class="post-card-image"
        src="${p.image}"
        alt=""
        loading="lazy"
        onclick="event.stopPropagation(); openImageFullscreen('${p.image}')"
      >` : ''}

      <!-- Actions bar -->
      <div class="post-card-actions">
        <!-- Like -->
        <button
          class="post-action-btn ${p.user_liked ? 'liked' : ''}"
          id="like-btn-${p.id}"
          onclick="event.stopPropagation(); toggleLike(${p.id})"
        >
          <svg viewBox="0 0 24 24" ${p.user_liked ? 'style="fill:var(--danger);stroke:var(--danger)"' : ''}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span id="like-count-${p.id}">${p.like_count || 0}</span>
        </button>

        <!-- Comment -->
        <button class="post-action-btn" onclick="event.stopPropagation(); toggleComments(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="comment-count-${p.id}">${p.comment_count || 0}</span>
        </button>

        <!-- Repost -->
        <button
          class="post-action-btn ${p.user_reposted ? 'reposted' : ''}"
          id="repost-btn-${p.id}"
          onclick="event.stopPropagation(); doRepost(${p.id})"
        >
          <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>

        <!-- Views (Aesthetic Indicator) -->
        <div class="post-action-btn" style="cursor:default; opacity:0.65;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 17px; height: 17px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span style="font-size:11px; font-weight:700;">${p.views || 0}</span>
        </div>

        <!-- Share -->
        <button class="post-action-btn" onclick="event.stopPropagation(); openSharePostModal(${p.id})" style="margin-left: auto;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </article>`;
}

// ============================================================
// LIKE
// ============================================================
async function toggleLike(postId) {
  // Optimistic update
  const post = _feedPosts.find(p => p.id === postId);
  if (!post) return;

  const wasLiked = !!post.user_liked;
  post.user_liked = wasLiked ? 0 : 1;
  post.like_count = (post.like_count || 0) + (wasLiked ? -1 : 1);

  // Update button in DOM without full re-render
  const btn = document.getElementById(`like-btn-${postId}`);
  const cnt = document.getElementById(`like-count-${postId}`);
  if (btn && cnt) {
    if (post.user_liked) {
      btn.classList.add('liked');
      btn.querySelector('svg').setAttribute('style', 'fill:var(--danger);stroke:var(--danger)');
    } else {
      btn.classList.remove('liked');
      btn.querySelector('svg').removeAttribute('style');
    }
    cnt.textContent = post.like_count;
  }

  // Animate heart
  if (btn) {
    btn.style.transform = 'scale(1.3)';
    setTimeout(() => { btn.style.transform = ''; }, 200);
  }

  await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
}

// ============================================================
// COMMENTS
// ============================================================
let _activeCommentPostId = null;

function openFeedCommentsModal(postId) {
  _activeCommentPostId = postId;
  const modal = document.getElementById('feedCommentsModal');
  const body = document.getElementById('feedCommentsModalBody');
  if (!modal || !body) return;

  // Lock background scroll
  document.body.style.overflow = 'hidden';

  modal.classList.add('open');
  body.innerHTML = '<div class="loading-row" style="padding:32px 0; text-align:center; color:#888;">Yorumlar yükleniyor...</div>';
  
  loadComments(postId);
}

function closeFeedCommentsModal() {
  _activeCommentPostId = null;
  const modal = document.getElementById('feedCommentsModal');
  if (modal) {
    modal.classList.remove('open');
  }
  // Restore background scroll
  document.body.style.overflow = '';
}

async function toggleComments(postId) {
  openFeedCommentsModal(postId);
}

async function loadComments(postId, section = null) {
  const body = document.getElementById('feedCommentsModalBody');
  if (!body) return;
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const comments = await res.json();
    renderComments(postId, comments, body);
  } catch {
    body.innerHTML = '<div class="empty-sub" style="padding:12px; text-align:center; color:#888;">Yorumlar yüklenemedi</div>';
  }
}

// ============================================================
// COMMENT REPLIES STATE & RENDER
// ============================================================
let _replyStates = {};

function setReplyTo(postId, parentId, username) {
  _replyStates[postId] = { parentId, username };
  const input = document.getElementById(`comment-input-${postId}`);
  if (input) {
    input.placeholder = `@${username} kullanıcısına yanıt yaz...`;
    input.value = `@${username} ` + input.value.replace(/^@[a-zA-Z0-9_.]+\s*/, '');
    input.focus();
  }
  renderReplyBar(postId);
}

function cancelReply(postId) {
  const replyState = _replyStates[postId];
  delete _replyStates[postId];
  const input = document.getElementById(`comment-input-${postId}`);
  if (input) {
    input.placeholder = "Yorum yaz...";
    if (replyState && input.value.startsWith(`@${replyState.username} `)) {
      input.value = input.value.substring(replyState.username.length + 2);
    }
  }
  renderReplyBar(postId);
}

function renderReplyBar(postId) {
  const container = document.getElementById(`comment-reply-bar-${postId}`);
  if (!container) return;
  const state = _replyStates[postId];
  if (state) {
    container.innerHTML = `
      <div class="reply-active-indicator" style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);padding:6px 12px;border-radius:6px;font-size:11px;margin-bottom:8px;color:#aaa">
        <span>@${state.username} kullanıcısına yanıt veriliyor</span>
        <button onclick="cancelReply(${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-weight:bold;font-size:12px;padding:2px 6px">✕</button>
      </div>
    `;
    container.style.display = 'block';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function toggleRepliesContainer(btn, parentId) {
  const container = document.getElementById(`replies-list-${parentId}`);
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

function renderComments(postId, comments, section) {
  const post = _feedPosts.find(p => p.id === postId) || {};
  
  // Group comments: parents and children
  const parents = comments.filter(c => !c.parent_id || c.parent_id === 'null' || c.parent_id === '0' || c.parent_id === 0);
  const childrenMap = {};
  comments.forEach(c => {
    const isChild = c.parent_id && c.parent_id !== 'null' && c.parent_id !== '0' && c.parent_id !== 0;
    if (isChild) {
      if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
      childrenMap[c.parent_id].push(c);
    }
  });

  section.innerHTML = `
    <!-- Active Reply Indicator -->
    <div id="comment-reply-bar-${postId}" style="display:none"></div>
    <!-- Comment form -->
    <div class="comment-form-row">
      ${renderAvatar(currentUser, 'avatar avatar-sm')}
      <input
        class="comment-input"
        id="comment-input-${postId}"
        placeholder="Yorum yaz..."
        onkeydown="if(event.key==='Enter')addComment(${postId})"
      >
      <button class="comment-send-btn" onclick="addComment(${postId})">
        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    <!-- Comments list -->
    <div id="comment-list-${postId}">
      ${parents.length ? parents.map(c => renderCommentTree(c, childrenMap[c.id] || [], post, postId)).join('') : '<div class="empty-sub" style="padding:8px 0 12px">Henüz yorum yok</div>'}
    </div>
  `;
}

function renderCommentTree(c, replies, post, postId) {
  const canDelete = currentUser && (c.username === currentUser.username || (post && post.username === currentUser.username));
  const repliesHtml = replies.map(r => renderReplyItem(r, post, postId)).join('');
  const hasReplies = replies.length > 0;

  return `
    <div class="comment-tree-node" id="comment-node-${c.id}" style="margin-bottom: 12px;">
      <!-- Parent comment -->
      <div class="comment-item" id="comment-item-${c.id}">
        ${renderAvatar({ username: c.username, profile_photo: c.profile_photo }, 'avatar avatar-sm')}
        <div class="comment-body" style="flex:1">
          <div class="comment-meta">
            <span class="comment-username" onclick="openUserPage('${esc(c.username)}')">${esc(c.username)}</span>
            <span class="comment-time">${fmtPostTime(c.created_at)}</span>
          </div>
          <div class="comment-text">${esc(c.content)}</div>
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
            <button onclick="setReplyTo(${postId}, ${c.id}, '${esc(c.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yanıtla</button>
            ${canDelete ? `
              <button onclick="deleteComment(${c.id}, ${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>
            ` : ''}
          </div>
        </div>
      </div>
      
      <!-- Replies toggle & list -->
      ${hasReplies ? `
        <div class="replies-wrapper" style="margin-left: 44px; margin-top: 6px;">
          <button class="replies-toggle-btn" onclick="toggleRepliesContainer(this, ${c.id})" style="background:none;border:none;color:#888;cursor:pointer;padding:4px 0;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px">
            <span class="line" style="display:inline-block;width:20px;height:1px;background:#333"></span>
            <span class="text">Yanıtları gör (${replies.length})</span>
          </button>
          <div class="replies-list" id="replies-list-${c.id}" style="display:none; padding-left:12px; border-left:1px solid #222; margin-top:6px; flex-direction:column; gap:10px">
            ${repliesHtml}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderReplyItem(r, post, postId) {
  const canDelete = currentUser && (r.username === currentUser.username || (post && post.username === currentUser.username));
  return `
    <div class="comment-item reply-item" id="comment-item-${r.id}" style="margin-bottom: 6px;">
      ${renderAvatar({ username: r.username, profile_photo: r.profile_photo }, 'avatar avatar-sm')}
      <div class="comment-body" style="flex:1">
        <div class="comment-meta">
          <span class="comment-username" onclick="openUserPage('${esc(r.username)}')">${esc(r.username)}</span>
          <span class="comment-time">${fmtPostTime(r.created_at)}</span>
        </div>
        <div class="comment-text">${esc(r.content)}</div>
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
          <button onclick="setReplyTo(${postId}, ${r.parent_id}, '${esc(r.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yanıtla</button>
          ${canDelete ? `
            <button onclick="deleteComment(${r.id}, ${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;

  const replyState = _replyStates[postId];
  const parentId = replyState ? replyState.parentId : null;

  input.value = '';
  input.disabled = true;

  try {
    await fetch(`/api/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parent_id: parentId })
    });

    if (replyState) {
      cancelReply(postId);
    }

    // Update count
    const post = _feedPosts.find(p => p.id === postId);
    if (post) {
      post.comment_count = (post.comment_count || 0) + 1;
      const countEl = document.getElementById(`comment-count-${postId}`);
      if (countEl) countEl.textContent = post.comment_count;
    }

    // Reload comments in global modal
    await loadComments(postId);
  } catch {
    showToast('Yorum gönderilemedi');
  }

  if (input) input.disabled = false;
}

async function toggleCommentLike(commentId) {
  const btn = document.getElementById(`clbtn-${commentId}`);
  const cnt = document.getElementById(`cl-count-${commentId}`);
  const isLiked = btn && btn.classList.contains('liked');

  if (btn) {
    if (isLiked) {
      btn.classList.remove('liked');
      btn.querySelector('svg').removeAttribute('style');
      if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent) - 1);
    } else {
      btn.classList.add('liked');
      btn.querySelector('svg').setAttribute('style', 'fill:var(--danger)');
      if (cnt) cnt.textContent = parseInt(cnt.textContent) + 1;
    }
  }

  await fetch(`/api/comments/${commentId}/like`, { method: 'POST' });
}

// ============================================================
// REPOST
// ============================================================
async function doRepost(postId) {
  const btn = document.getElementById(`repost-btn-${postId}`);
  const countEl = document.getElementById(`repost-count-${postId}`);
  const isReposted = btn && btn.classList.contains('reposted');

  if (isReposted) {
    try {
      const res = await fetch(`/api/posts/${postId}/repost`, { method: 'DELETE' });
      if (res.ok) {
        if (btn) btn.classList.remove('reposted');
        if (countEl) {
          const currentCount = parseInt(countEl.textContent || '0');
          countEl.textContent = Math.max(0, currentCount - 1);
        }
        showToast('Repost kaldırıldı');
        const post = _feedPosts.find(p => p.id === postId);
        if (post) {
          post.user_reposted = 0;
          post.repost_count = Math.max(0, (post.repost_count || 0) - 1);
        }
      } else {
        showToast('Repost kaldırılamadı');
      }
    } catch {
      showToast('Bağlantı hatası');
    }
  } else {
    try {
      const res = await fetch(`/api/posts/${postId}/repost`, { method: 'POST' });
      if (res.ok) {
        if (btn) btn.classList.add('reposted');
        if (countEl) {
          const currentCount = parseInt(countEl.textContent || '0');
          countEl.textContent = currentCount + 1;
        }
        showToast('Profilinde yeniden paylaşıldı');
        const post = _feedPosts.find(p => p.id === postId);
        if (post) {
          post.user_reposted = 1;
          post.repost_count = (post.repost_count || 0) + 1;
        }
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Repost yapılamadı');
      }
    } catch {
      showToast('Bağlantı hatası');
    }
  }
}

// ============================================================
// NEW POST MODAL
// ============================================================
// --- CROPPER STATE ---
let _cropperX = 0;
let _cropperY = 0;
let _cropperZoom = 1.0;
let _cropperImgWidth = 0;
let _cropperImgHeight = 0;
let _cropperOrigWidth = 0;
let _cropperOrigHeight = 0;
let _cropperDragging = false;
let _cropperStartDragX = 0;
let _cropperStartDragY = 0;
let _cropperStartOffsetX = 0;
let _cropperStartOffsetY = 0;
let _cropperImgObj = null;

function updatePostModalState() {
  const text = document.getElementById('postTextarea').value;
  const count = 280 - text.length;
  const counter = document.getElementById('postCharCounter');
  if (counter) {
    counter.textContent = count;
    counter.classList.toggle('warning', count <= 50 && count > 10);
    counter.classList.toggle('danger', count <= 10);
  }
  const submitBtn = document.getElementById('postSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = (text.trim().length === 0 && !_postImageFile) || count < 0;
  }
  updateLivePreview();
}

function getCroppedCanvas() {
  if (!_cropperImgObj) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  const scaleRatio = _cropperOrigWidth / _cropperImgWidth; 
  const cropX = Math.round((-_cropperX / _cropperZoom) * scaleRatio);
  const cropY = Math.round((-_cropperY / _cropperZoom) * scaleRatio);
  const cropSize = Math.round((260 / _cropperZoom) * scaleRatio);

  ctx.drawImage(_cropperImgObj, cropX, cropY, cropSize, cropSize, 0, 0, 600, 600);
  return canvas;
}

function updateLivePreview() {
  const text = document.getElementById('postTextarea').value;
  const previewCard = document.getElementById('postLivePreviewCard');
  if (!previewCard) return;

  let imgHtml = '';
  if (_postImageFile && _cropperImgObj) {
    const canvas = getCroppedCanvas();
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      imgHtml = `
        <div style="width:100%; aspect-ratio:1/1; overflow:hidden; background:#000; border-bottom:1px solid rgba(255,255,255,0.06);">
          <img src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;" draggable="false">
        </div>
      `;
    }
  }

  previewCard.innerHTML = `
    <div class="post-header" style="border:none; padding:12px 14px 8px;">
      ${renderAvatar(currentUser, 'avatar avatar-xs')}
      <div class="post-user-info">
        <span class="post-username" style="font-size:11px">${esc(currentUser?.username || '')}</span>
        <span class="post-time" style="font-size:9px">şimdi</span>
      </div>
    </div>
    <div class="post-content" style="padding:0 14px 12px; font-size:12px; color:#ddd; word-break:break-word; min-height:10px;">
      ${esc(text) || '<span style="color:#444; font-style:italic;">Gönderi içeriği boş...</span>'}
    </div>
    ${imgHtml}
    <div class="post-actions" style="border:none; padding:10px 14px; font-size:11px; color:#555;">
      <span>0 Beğeni</span> • <span>0 Yorum</span>
    </div>
  `;
}

function applyCropperTransform() {
  const cropImg = document.getElementById('postCropImg');
  if (!cropImg) return;

  const scaledW = _cropperImgWidth * _cropperZoom;
  const scaledH = _cropperImgHeight * _cropperZoom;

  const minX = 260 - scaledW;
  const minY = 260 - scaledH;

  if (_cropperX > 0) _cropperX = 0;
  if (_cropperY > 0) _cropperY = 0;
  if (_cropperX < minX) _cropperX = minX;
  if (_cropperY < minY) _cropperY = minY;

  cropImg.style.width = `${_cropperImgWidth}px`;
  cropImg.style.height = `${_cropperImgHeight}px`;
  cropImg.style.transform = `translate(${_cropperX}px, ${_cropperY}px) scale(${_cropperZoom})`;
}

function initCropperEvents() {
  const viewport = document.getElementById('postCropViewport');
  if (!viewport || viewport._hasEvents) return;

  const startDrag = (clientX, clientY) => {
    if (!_cropperImgObj) return;
    _cropperDragging = true;
    _cropperStartDragX = clientX;
    _cropperStartDragY = clientY;
    _cropperStartOffsetX = _cropperX;
    _cropperStartOffsetY = _cropperY;
  };

  const moveDrag = (clientX, clientY) => {
    if (!_cropperDragging) return;
    const dx = clientX - _cropperStartDragX;
    const dy = clientY - _cropperStartDragY;
    _cropperX = _cropperStartOffsetX + dx;
    _cropperY = _cropperStartOffsetY + dy;
    applyCropperTransform();
    updateLivePreview();
  };

  const stopDrag = () => {
    _cropperDragging = false;
  };

  viewport.addEventListener('mousedown', e => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => {
    if (_cropperDragging) moveDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', stopDrag);

  viewport.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  viewport.addEventListener('touchmove', e => {
    if (_cropperDragging && e.touches.length === 1) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  viewport.addEventListener('touchend', stopDrag);

  const zoomSlider = document.getElementById('postCropZoom');
  if (zoomSlider) {
    zoomSlider.addEventListener('input', e => {
      _cropperZoom = parseFloat(e.target.value);
      applyCropperTransform();
      updateLivePreview();
    });
  }

  viewport._hasEvents = true;
}

function openPostModal() {
  document.getElementById('postModalOverlay').classList.add('open');
  const tx = document.getElementById('postTextarea');
  if (tx) {
    tx.value = '';
    if (!tx._hasListener) {
      tx.addEventListener('input', updatePostModalState);
      tx._hasListener = true;
    }
    tx.focus();
  }
  const authorWrap = document.getElementById('postModalAuthor');
  if (authorWrap && currentUser) {
    authorWrap.innerHTML = `
      ${renderAvatar(currentUser, 'avatar avatar-sm')}
      <div style="display:flex; flex-direction:column; line-height:1.2;">
        <span class="post-modal-author-name">${esc(currentUser.username)}</span>
        <span style="font-size:10px; color:var(--text-3)">yeni paylaşım</span>
      </div>
    `;
  }
  updatePostModalState();
}

function closePostModal() {
  document.getElementById('postModalOverlay').classList.remove('open');
  document.getElementById('postTextarea').value = '';
  clearPostImage();
}

function onPostImageSelected(input) {
  if (!input.files[0]) return;
  _postImageFile = input.files[0];
  
  const url = URL.createObjectURL(_postImageFile);
  const imgObj = new Image();
  imgObj.src = url;
  imgObj.onload = () => {
    _cropperImgObj = imgObj;
    _cropperOrigWidth = imgObj.width;
    _cropperOrigHeight = imgObj.height;

    if (_cropperOrigWidth > _cropperOrigHeight) {
      _cropperImgHeight = 260;
      _cropperImgWidth = _cropperOrigWidth * (260 / _cropperOrigHeight);
    } else {
      _cropperImgWidth = 260;
      _cropperImgHeight = _cropperOrigHeight * (260 / _cropperOrigWidth);
    }

    const cropImg = document.getElementById('postCropImg');
    cropImg.src = url;
    
    _cropperX = (260 - _cropperImgWidth) / 2;
    _cropperY = (260 - _cropperImgHeight) / 2;
    _cropperZoom = 1.0;
    
    const zoomSlider = document.getElementById('postCropZoom');
    if (zoomSlider) zoomSlider.value = 1.0;

    applyCropperTransform();
    initCropperEvents();
    
    document.getElementById('postCropContainer').style.display = 'flex';
    updatePostModalState();
  };
}

function clearPostImage() {
  _postImageFile = null;
  _cropperImgObj = null;
  document.getElementById('postImageInput').value = '';
  document.getElementById('postCropContainer').style.display = 'none';
  document.getElementById('postCropImg').src = '';
  updatePostModalState();
}

async function submitPost() {
  const content = document.getElementById('postTextarea').value.trim();
  if (!content && !_postImageFile) {
    showToast('Bir şeyler yaz veya fotoğraf ekle');
    return;
  }

  const btn = document.getElementById('postSubmitBtn');
  btn.disabled = true;
  btn.textContent = '...';

  const formData = new FormData();
  formData.append('content', content);

  if (_postImageFile && _cropperImgObj) {
    try {
      const canvas = getCroppedCanvas();
      if (!canvas) throw new Error();
      const croppedBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(), 'image/jpeg', 0.9);
      });
      formData.append('image', croppedBlob, 'cropped.jpg');
    } catch (e) {
      showToast('Görsel işlenemedi');
      btn.disabled = false;
      btn.textContent = 'PAYLAŞ';
      return;
    }
  }

  try {
    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    if (res.ok) {
      closePostModal();
      showToast('Paylaşıldı!');
      loadFeed();
    } else {
      showToast('Paylaşılamadı, tekrar dene');
    }
  } catch {
    showToast('Bağlantı hatası');
  }

  btn.disabled = false;
  btn.textContent = 'PAYLAŞ';
}

// ============================================================
// IMAGE FULLSCREEN
// ============================================================
function openImageFullscreen(src) {
  document.getElementById('imgFullscreenImg').src = src;
  document.getElementById('imgFullscreen').classList.add('open');
}

// ============================================================
// SHARE NAVIGATION HELPER (scrolls & toggles comment inline)
// ============================================================
function openSharedPostInFeed(postId) {
  showPage('feed');
  setTimeout(() => {
    const postEl = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (postEl) {
      postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toggleComments(postId);
    }
  }, 300);
}

async function deletePost(postId) {
  if (!(await window.showConfirm('Bu gönderiyi silmek istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Gönderi silindi');
      _feedPosts = _feedPosts.filter(p => p.id !== postId);
      renderFeed();
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

async function deleteComment(commentId, postId) {
  if (!(await window.showConfirm('Bu yorumu silmek istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Yorum silindi');
      await loadComments(postId);
      const post = _feedPosts.find(p => p.id === postId);
      if (post) {
        post.comment_count = Math.max(0, (post.comment_count || 0) - 1);
        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl) countEl.textContent = post.comment_count;
      }
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// ============================================================
// LIVE SEARCH (FEED / EXPLORE)
// ============================================================
let _searchTimeout = null;

function toggleFeedSearch() {
  const container = document.querySelector('.feed-search-container');
  const btn = document.getElementById('btnToggleFeedSearch');
  if (!container) return;
  
  const isHidden = window.getComputedStyle(container).display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.style.color = isHidden ? '#fff' : '#888';
  
  if (isHidden) {
    const input = document.getElementById('feedSearchInput');
    if (input) input.focus();
  } else {
    // Clear search values and close dropdown on close
    const input = document.getElementById('feedSearchInput');
    if (input) input.value = '';
    const results = document.getElementById('feedSearchResults');
    if (results) {
      results.style.display = 'none';
      results.innerHTML = '';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('feedSearchInput');
  const searchResults = document.getElementById('feedSearchResults');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      
      clearTimeout(_searchTimeout);
      
      if (!q) {
        searchResults.style.display = 'none';
        return;
      }
      
      _searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search/users?q=${encodeURIComponent(q)}`);
          if (!res.ok) throw new Error('Search failed');
          const users = await res.json();
          
          searchResults.style.display = 'block';
          
          if (users.length === 0) {
            searchResults.innerHTML = '<div style="padding:10px;text-align:center;color:#888;font-size:12px;">Sonuç bulunamadı</div>';
            return;
          }
          
          searchResults.innerHTML = users.map(u => `
            <div onclick="openUserModal('${esc(u.username)}'); toggleFeedSearch();" style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;border-bottom:1px solid #222;">
              ${renderAvatar(u, 'avatar avatar-sm')}
              <div style="flex:1">
                <div style="font-weight:700;color:#fff;font-size:13px">${esc(u.username)}</div>
                <div style="font-size:10px;color:#888">Seviye ${u.level} • ${u.xp} XP</div>
              </div>
            </div>
          `).join('');
          
        } catch (err) {
          console.error(err);
        }
      }, 300); // 300ms debounce
    });
    
    // Dışarı tıklayınca sonuçları gizle
    document.addEventListener('click', (e) => {
      const toggleBtn = document.getElementById('btnToggleFeedSearch');
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        searchResults.style.display = 'none';
      }
    });
  }
});
