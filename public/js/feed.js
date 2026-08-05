/* ============================================================
   FEED.JS — Modular Algorithmic Feed & Social Engine
   ============================================================ */

'use strict';

// ─── ALGORITHMIC FEED ENGINE STATE ────────────────────────────
window.FeedEngine = {
  activeTab: 'discover',
  posts: [],
  isLoading: false,
  hasMore: true,
  offset: 0,
  limit: 20,
  activeReplyTo: null,

  // --- INIT & TAB SWITCHING ---
  init() {
    this.bindEvents();
    this.loadFeed(true);
  },

  bindEvents() {
    const list = document.getElementById('feedList');
    if (list && !list._scrollBound) {
      window.addEventListener('scroll', () => {
        if (window.activePage !== 'feed') return;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 600) {
          this.loadMore();
        }
      });
      list._scrollBound = true;
    }
  },

  switchTab(tab) {
    if (this.activeTab === tab && !this.isLoading) return;
    this.activeTab = tab;
    
    document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
    const tabEl = document.querySelector(`[data-tab="${tab}"]`);
    if (tabEl) tabEl.classList.add('active');

    this.offset = 0;
    this.hasMore = true;
    this.posts = [];
    this.loadFeed(true);
  },

  // --- FETCH & PAGINATION ---
  async loadFeed(reset = false) {
    if (this.isLoading) return;
    this.isLoading = true;

    const list = document.getElementById('feedList');
    if (reset && list) {
      list.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';
      this.offset = 0;
    }

    try {
      const res = await fetch(`/api/feed/${this.activeTab}?limit=${this.limit}&offset=${this.offset}`);
      if (!res.ok) throw new Error('Feed load error');
      
      const newPosts = await res.json();
      
      if (reset) {
        this.posts = newPosts;
      } else {
        this.posts = [...this.posts, ...newPosts];
      }

      if (newPosts.length < this.limit) {
        this.hasMore = false;
      }

      this.render();
    } catch (err) {
      console.error('Feed engine error:', err);
      if (reset && list) {
        list.innerHTML = '<div class="empty-state"><div class="empty-title">Akış Yüklenemedi</div></div>';
      }
    }

    this.isLoading = false;
  },

  loadMore() {
    if (!this.hasMore || this.isLoading) return;
    this.offset += this.limit;
    this.loadFeed(false);
  },

  // --- REÖNDER ENGINE ---
  render() {
    const list = document.getElementById('feedList');
    if (!list) return;

    if (!this.posts.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">${this.activeTab === 'following' ? 'Takip ettiğin kişilerin gönderisi bulunmuyor' : 'Henüz gönderi yok'}</div>
          <div class="empty-sub">İlk paylaşımı sen yap!</div>
        </div>`;
      return;
    }

    let html = '';
    const adCardHtml = `
      <article class="post-card feed-ad-card" style="text-align:center; padding:16px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.12); border-radius:12px; margin-bottom:16px;">
        <div style="font-size:10px; font-weight:700; color:var(--text-3, #777); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px;">SPONSORLU / REKLAM</div>
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-format="fluid"
             data-ad-layout-key="-fb+5w+4e-db+86"
             data-ad-client="ca-pub-2694418537952605"
             data-ad-slot="auto"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      </article>
    `;

    this.posts.forEach((post, index) => {
      html += this.renderPostCard(post);
      if ((index + 1) % 4 === 0 && index < this.posts.length - 1) {
        html += adCardHtml;
      }
    });

    list.innerHTML = html;
    this.observeViews();
  },

  observeViews() {
    if (this._viewObserver) this._viewObserver.disconnect();

    this._viewObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const postId = card.getAttribute('data-post-id');
          if (postId && !card._viewed) {
            card._viewed = true;
            fetch(`/api/posts/${postId}`).catch(() => {});
            this._viewObserver.unobserve(card);
          }
        }
      });
    }, { threshold: 0.6 });

    document.querySelectorAll('.post-card[data-post-id]').forEach(card => {
      this._viewObserver.observe(card);
    });
  },

  renderPostCard(p) {
    const isRepost = p.content && p.content.startsWith('Repost:');
    const hasImage = !!p.image;

    return `
      <article class="post-card ${hasImage ? 'has-image' : 'no-image'}" data-post-id="${p.id}" onclick="if(!event.target.closest('.post-card-actions, .post-card-header, button, a, img')) openPostModal(${p.id})">
        <!-- Header -->
        <div class="post-card-header">
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="event.stopPropagation(); openUserPage('${esc(p.username)}')">
            ${renderAvatar({ username: p.username, profile_photo: p.profile_photo }, 'avatar avatar-sm')}
            <div class="post-card-user-info">
              <div class="post-card-username">
                ${esc(p.username)}
                <span class="lvl-badge">LVL ${p.level || 1}</span>
                ${isRepost ? '<span class="lvl-badge" style="color:var(--success);border-color:rgba(50,215,75,0.3)">REPOST</span>' : ''}
              </div>
              <div class="post-card-meta">${fmtPostTime(p.created_at)}</div>
            </div>
          </div>
          ${p.username === currentUser?.username ? `
            <button class="post-delete-btn" onclick="event.stopPropagation(); FeedEngine.deletePost(${p.id})" style="background:none;border:none;color:#444;cursor:pointer;padding:8px 12px;font-size:14px;font-weight:bold">✕</button>
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

        <!-- Actions Bar -->
        <div class="post-card-actions">
          <!-- Like Button -->
          <button
            class="post-action-btn ${p.user_liked ? 'liked' : ''}"
            id="like-btn-${p.id}"
            onclick="event.stopPropagation(); FeedEngine.toggleLike(${p.id})"
          >
            <svg viewBox="0 0 24 24" ${p.user_liked ? 'style="fill:var(--danger);stroke:var(--danger)"' : ''}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="like-count-${p.id}">${p.like_count || 0}</span>
          </button>

          <!-- Comment Button -->
          <button class="post-action-btn" onclick="event.stopPropagation(); FeedEngine.openComments(${p.id})">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span id="comment-count-${p.id}">${p.comment_count || 0}</span>
          </button>

          <!-- Repost Button -->
          <button
            class="post-action-btn ${p.user_reposted ? 'reposted' : ''}"
            id="repost-btn-${p.id}"
            onclick="event.stopPropagation(); FeedEngine.toggleRepost(${p.id})"
          >
            <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>

          <!-- Views Indicator -->
          <div class="post-action-btn" style="cursor:default; opacity:0.65;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 17px; height: 17px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span style="font-size:11px; font-weight:700;">${p.views || 0}</span>
          </div>

          <!-- Share Button -->
          <button class="post-action-btn" onclick="event.stopPropagation(); openSharePostModal(${p.id})" style="margin-left: auto;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </article>`;
  },

  // --- ACTIONS ---
  async toggleLike(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const wasLiked = !!post.user_liked;
    post.user_liked = wasLiked ? 0 : 1;
    post.like_count = (post.like_count || 0) + (wasLiked ? -1 : 1);

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

    if (btn) {
      btn.style.transform = 'scale(1.3)';
      setTimeout(() => { btn.style.transform = ''; }, 200);
    }

    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  },

  async toggleRepost(postId) {
    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const isReposted = !!post.user_reposted;
    const method = isReposted ? 'DELETE' : 'POST';

    try {
      const res = await fetch(`/api/posts/${postId}/repost`, { method });
      if (res.ok) {
        post.user_reposted = isReposted ? 0 : 1;
        post.repost_count = Math.max(0, (post.repost_count || 0) + (isReposted ? -1 : 1));
        
        const btn = document.getElementById(`repost-btn-${postId}`);
        if (btn) {
          btn.classList.toggle('reposted', !!post.user_reposted);
        }
        showToast(isReposted ? 'Repost kaldırıldı' : 'Profilinde paylaşıldı');
      }
    } catch {
      showToast('İşlem gerçekleştirilemedi');
    }
  },

  async deletePost(postId) {
    if (!(await window.showConfirm('Bu gönderiyi silmek istediğinizden emin misiniz?'))) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Gönderi silindi');
        this.posts = this.posts.filter(p => p.id !== postId);
        this.render();
      } else {
        showToast('Silinemedi');
      }
    } catch {
      showToast('Bağlantı hatası');
    }
  },

  // --- COMMENTS MODAL ENGINE ---
  openComments(postId) {
    const modal = document.getElementById('feedCommentsModal');
    const body = document.getElementById('feedCommentsModalBody');
    if (!modal || !body) return;

    document.body.style.overflow = 'hidden';
    modal.classList.add('open');
    body.innerHTML = '<div class="loading-row" style="padding:32px 0; text-align:center; color:#888;">Yorumlar yükleniyor...</div>';
    
    this.loadComments(postId);
  },

  closeComments() {
    const modal = document.getElementById('feedCommentsModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
  },

  async loadComments(postId) {
    const body = document.getElementById('feedCommentsModalBody');
    if (!body) return;
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      const comments = await res.json();
      this.renderCommentsModal(postId, comments, body);
    } catch {
      body.innerHTML = '<div class="empty-sub" style="padding:12px; text-align:center; color:#888;">Yorumlar yüklenemedi</div>';
    }
  },

  renderCommentsModal(postId, comments, container) {
    const post = this.posts.find(p => p.id === postId) || {};
    
    const parents = comments.filter(c => !c.parent_id || c.parent_id === 'null' || c.parent_id === '0' || c.parent_id === 0);
    const childrenMap = {};
    comments.forEach(c => {
      if (c.parent_id && c.parent_id !== 'null' && c.parent_id !== '0' && c.parent_id !== 0) {
        if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
        childrenMap[c.parent_id].push(c);
      }
    });

    container.innerHTML = `
      <div id="comment-reply-bar-${postId}" style="display:none"></div>
      <div class="comment-form-row">
        ${renderAvatar(currentUser, 'avatar avatar-sm')}
        <input class="comment-input" id="comment-input-${postId}" placeholder="Yorum yaz..." onkeydown="if(event.key==='Enter')FeedEngine.addComment(${postId})">
        <button class="comment-send-btn" onclick="FeedEngine.addComment(${postId})">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div id="comment-list-${postId}">
        ${parents.length ? parents.map(c => this.renderCommentNode(c, childrenMap[c.id] || [], post, postId)).join('') : '<div class="empty-sub" style="padding:16px 0; text-align:center;">Henüz yorum yok</div>'}
      </div>
    `;
  },

  renderCommentNode(c, replies, post, postId) {
    const canDelete = currentUser && (c.username === currentUser.username || (post && post.username === currentUser.username));
    
    return `
      <div class="comment-tree-node" id="comment-node-${c.id}" style="margin-bottom:12px;">
        <div class="comment-item" id="comment-item-${c.id}">
          ${renderAvatar({ username: c.username, profile_photo: c.profile_photo }, 'avatar avatar-sm')}
          <div class="comment-body" style="flex:1">
            <div class="comment-meta">
              <span class="comment-username" onclick="openUserPage('${esc(c.username)}')">${esc(c.username)}</span>
              <span class="comment-time">${fmtPostTime(c.created_at)}</span>
            </div>
            <div class="comment-text">${esc(c.content)}</div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
              <button onclick="FeedEngine.setReplyTarget(${postId}, ${c.id}, '${esc(c.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yanıtla</button>
              ${canDelete ? `<button onclick="FeedEngine.deleteComment(${c.id}, ${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>` : ''}
            </div>
          </div>
        </div>
        ${replies.length > 0 ? `
          <div class="replies-wrapper" style="margin-left:44px; margin-top:6px; border-left:1px solid rgba(255,255,255,0.08); padding-left:10px;">
            ${replies.map(r => this.renderCommentNode(r, [], post, postId)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  setReplyTarget(postId, parentId, username) {
    this.activeReplyTo = { parentId, username };
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
      input.placeholder = `@${username} kullanıcısına yanıt yaz...`;
      input.focus();
    }
  },

  async addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const parentId = this.activeReplyTo ? this.activeReplyTo.parentId : null;
    input.value = '';
    input.disabled = true;

    try {
      await fetch(`/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parent_id: parentId })
      });

      this.activeReplyTo = null;
      const post = this.posts.find(p => p.id === postId);
      if (post) {
        post.comment_count = (post.comment_count || 0) + 1;
        const cntEl = document.getElementById(`comment-count-${postId}`);
        if (cntEl) cntEl.textContent = post.comment_count;
      }
      this.loadComments(postId);
    } catch {
      showToast('Yorum gönderilemedi');
    }

    if (input) input.disabled = false;
  },

  async deleteComment(commentId, postId) {
    if (!(await window.showConfirm('Bu yorumu silmek istediğinizden emin misiniz?'))) return;
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Yorum silindi');
        this.loadComments(postId);
        const post = this.posts.find(p => p.id === postId);
        if (post) {
          post.comment_count = Math.max(0, (post.comment_count || 0) - 1);
          const cntEl = document.getElementById(`comment-count-${postId}`);
          if (cntEl) cntEl.textContent = post.comment_count;
        }
      }
    } catch {
      showToast('Silinemedi');
    }
  }
};

// --- GLOBAL LEGACY INTERFACE WRAPPERS FOR BACKWARD COMPATIBILITY ---
function loadFeed() { window.FeedEngine.loadFeed(true); }
function switchFeedTab(tab) { window.FeedEngine.switchTab(tab); }
function closeFeedCommentsModal() { window.FeedEngine.closeComments(); }
function toggleComments(postId) { window.FeedEngine.openComments(postId); }

// Live Search logic
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
  }
}

// --- CROPPER STATE FOR POST CREATION ---
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
let _postImageFile = null;

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

function openCreatePostModal() {
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

function closeCreatePostModal() {
  document.getElementById('postModalOverlay').classList.remove('open');
  document.getElementById('postTextarea').value = '';
  clearPostImage();
}
function closePostModal() { closeCreatePostModal(); }

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
  const originalSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  
  btn.disabled = true;
  btn.innerHTML = '⏳';

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
      btn.innerHTML = originalSvg;
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
  btn.innerHTML = originalSvg;
}

function openImageFullscreen(src) {
  document.getElementById('imgFullscreenImg').src = src;
  document.getElementById('imgFullscreen').classList.add('open');
}

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

document.addEventListener('DOMContentLoaded', () => {
  window.FeedEngine.init();
});
