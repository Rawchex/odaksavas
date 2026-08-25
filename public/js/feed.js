/* ============================================================
   FEED.JS — Modular Algorithmic Feed, 3x3 Grid & Shorts Engine
   (Instagram + YouTube Shorts + Twitter + Discord + Reddit Hybrid)
   ============================================================ */

'use strict';

// ─── ALGORITHMIC FEED ENGINE STATE ────────────────────────────
window.FeedEngine = {
  activeTab: 'discover',
  activeTopic: 'all',
  searchQuery: '',
  posts: [],
  isLoading: false,
  hasMore: true,
  offset: 0,
  limit: 24,

  // --- INIT & EVENT BINDING ---
  init() {
    this.bindEvents();
    this.loadFeed(true);
  },

  bindEvents() {
    window.addEventListener('scroll', () => {
      if (window.activePage !== 'feed') return;
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        this.loadMore();
      }
    });
  },

  // --- TAB & FILTER SWITCHING ---
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

  filterTopic(topic) {
    if (this.activeTopic === topic && !this.isLoading) return;
    this.activeTopic = topic;

    document.querySelectorAll('.topic-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-topic') === topic);
    });

    this.offset = 0;
    this.hasMore = true;
    this.posts = [];
    this.loadFeed(true);
  },

  setSearchQuery(q) {
    this.searchQuery = q.trim();
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
      list.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:#888; font-weight:700;">✨ AKIŞ YÜKLENİYOR...</div>';
      this.offset = 0;
    }

    try {
      let url = `/api/feed/${this.activeTab}?limit=${this.limit}&offset=${this.offset}`;
      if (this.searchQuery) {
        url += `&q=${encodeURIComponent(this.searchQuery)}`;
      }
      if (this.activeTopic && this.activeTopic !== 'all') {
        url += `&topic=${encodeURIComponent(this.activeTopic)}`;
      }

      const res = await fetch(url);
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

      this.renderGrid();
    } catch (err) {
      console.error('Feed engine error:', err);
      if (reset && list) {
        list.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:#888;"><div style="font-size:16px; font-weight:700; color:#fff;">Akış Yüklenemedi</div><div style="font-size:12px; margin-top:4px;">Lütfen internet bağlantını kontrol et</div></div>';
      }
    }

    this.isLoading = false;
  },

  loadMore() {
    if (!this.hasMore || this.isLoading) return;
    this.offset += this.limit;
    this.loadFeed(false);
  },

  // --- TWITTER STYLE TIMELINE RENDER ENGINE ---
  renderGrid() {
    const list = document.getElementById('feedList');
    if (!list) return;

    if (!this.posts.length) {
      list.innerHTML = `
        <div style="padding:60px 20px; text-align:center;">
          <div style="font-size:36px; margin-bottom:12px;">📭</div>
          <div style="font-size:16px; font-weight:800; color:#fff;">Henüz Gönderi Bulunamadı</div>
          <div style="font-size:13px; color:#888; margin-top:6px;">Arama kriterlerini değiştir veya ilk soruyu/paylaşımı sen yaz!</div>
        </div>`;
      return;
    }

    let html = '';
    this.posts.forEach((post, index) => {
      html += this.renderTweetCard(post, index);
    });

    list.innerHTML = html;
  },

  renderTweetCard(p, index) {
    const hasImage = !!p.image;
    const isSelf = window.currentUser && (
      (p.user_id && parseInt(p.user_id) === parseInt(window.currentUser.id)) ||
      (p.username && p.username === window.currentUser.username)
    );

    return `
      <article class="tweet-card" data-post-id="${p.id}">
        <div class="tweet-avatar" onclick="openUserPage('${esc(p.username)}')">
          ${renderAvatar({ username: p.username, profile_photo: p.profile_photo }, 'avatar avatar-sm')}
        </div>
        <div class="tweet-content-wrapper">
          <div class="tweet-header">
            <span class="tweet-author-name" onclick="openUserPage('${esc(p.username)}')">${esc(p.username)}</span>
            <span class="tweet-author-handle" onclick="openUserPage('${esc(p.username)}')">@${esc(p.username)}</span>
            <span class="tweet-dot-separator">·</span>
            <span class="tweet-time">${fmtPostTime(p.created_at)}</span>
          </div>
          
          <div class="tweet-body">
            ${p.content ? `<div class="tweet-text">${formatMathAndMarkdown(p.content)}</div>` : ''}
            ${hasImage ? `<div class="tweet-media-container" onclick="openMediaLightbox('${p.image}')"><img src="${p.image}" alt="Gönderi Medyası" class="tweet-media" loading="lazy"></div>` : ''}
          </div>

          <div class="tweet-actions-bar">
            <button class="tweet-action-btn reply" data-tooltip="Yanıtla" onclick="openGlobalPostModal(${p.id})">
              <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
              <span>${p.comment_count || 0}</span>
            </button>
            <button class="tweet-action-btn repost ${p.user_reposted ? 'reposted' : ''}" data-tooltip="Repost" onclick="FeedEngine.toggleRepost(${p.id})">
              <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
              <span>${p.repost_count || 0}</span>
            </button>
            <button class="tweet-action-btn like ${p.user_liked ? 'liked' : ''}" id="tweet-like-${p.id}" data-tooltip="Beğen" onclick="toggleTweetLike(${p.id})">
              <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="${p.user_liked ? '#f91880' : 'none'}" stroke="${p.user_liked ? '#f91880' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
              <span id="tweet-like-cnt-${p.id}">${p.like_count || 0}</span>
            </button>
            <button class="tweet-action-btn bookmark ${p.user_bookmarked ? 'bookmarked' : ''}" id="tweet-bookmark-${p.id}" data-tooltip="Kaydet" onclick="bookmarkTweet(${p.id})">
              <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="${p.user_bookmarked ? '#1d9bf0' : 'none'}" stroke="${p.user_bookmarked ? '#1d9bf0' : 'currentColor'}" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
            </button>
            <button class="tweet-action-btn share" data-tooltip="Paylaş" onclick="openSharePostModal(${p.id})">
              <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></div>
            </button>
          </div>
        </div>
      </article>
    `;
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
        showToast(isReposted ? 'Repost kaldırıldı' : 'Profilinde paylaşıldı');
      }
    } catch {
      showToast('İşlem gerçekleştirilemedi');
    }
  }
};

// Helper: detect category hashtag/topic
function detectTopicTag(content) {
  if (!content) return '';
  const text = content.toLowerCase();
  if (text.includes('matematik') || text.includes('türev') || text.includes('integral') || text.includes('geometri') || text.includes('denklem') || text.includes('lim')) return '📐 Matematik';
  if (text.includes('yazılım') || text.includes('kod') || text.includes('js') || text.includes('python') || text.includes('css') || text.includes('react')) return '💻 Yazılım';
  if (text.includes('fizik') || text.includes('kuantum') || text.includes('vektör') || text.includes('enerji')) return '⚡ Fizik';
  if (text.includes('soru') || text.includes('nedir') || text.includes('nasıl') || text.includes('çözüm')) return '❓ Soru-Cevap';
  return '💬 Sohbet';
}

// ─── MEDIA LIGHTBOX & TWEET INTERACTIONS ────────────────
function openMediaLightbox(url) {
  const lightbox = document.getElementById('mediaLightbox');
  const img = document.getElementById('lightboxImage');
  if (lightbox && img) {
    img.src = url;
    lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeMediaLightbox(e) {
  if (e && e.target && e.target.id === 'lightboxImage') return; // clicked on image
  const lightbox = document.getElementById('mediaLightbox');
  if (lightbox) {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
    const img = document.getElementById('lightboxImage');
    if (img) img.src = '';
  }
}

async function toggleTweetLike(postId) {
  const post = FeedEngine.posts.find(p => p.id === postId);
  if (!post) return;

  const wasLiked = !!post.user_liked;
  post.user_liked = wasLiked ? 0 : 1;
  post.like_count = (post.like_count || 0) + (wasLiked ? -1 : 1);

  const btn = document.getElementById(`tweet-like-${postId}`);
  const cnt = document.getElementById(`tweet-like-cnt-${postId}`);
  if (btn && cnt) {
    btn.classList.toggle('liked', !!post.user_liked);
    cnt.textContent = post.like_count || 0;
    const svg = btn.querySelector('svg');
    if(svg) {
      svg.setAttribute('fill', post.user_liked ? '#f91880' : 'none');
      svg.setAttribute('stroke', post.user_liked ? '#f91880' : 'currentColor');
    }
  }

  showToast(post.user_liked ? 'Beğenildi ❤️' : 'Beğeni kaldırıldı');
  await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
}

async function bookmarkTweet(postId) {
  const post = FeedEngine.posts.find(p => p.id === postId);
  if (!post) return;

  try {
    const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      post.user_bookmarked = data.bookmarked ? 1 : 0;
      const btn = document.getElementById(`tweet-bookmark-${postId}`);
      if (btn) {
        btn.classList.toggle('bookmarked', data.bookmarked);
        const svg = btn.querySelector('svg');
        if(svg) {
          svg.setAttribute('fill', data.bookmarked ? '#1d9bf0' : 'none');
          svg.setAttribute('stroke', data.bookmarked ? '#1d9bf0' : 'currentColor');
        }
      }
      showToast(data.bookmarked ? 'Kaydedildi' : 'Kaydedilenlerden çıkarıldı');
    }
  } catch {
    showToast('İşlem tamamlanamadı');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMediaLightbox();
});

// Mock legacy wrappers to avoid breaking existing html elements
function closeShortsModal() { }
function toggleShortsComments(open) { }
function submitShortsComment() { }
function handleShortsCommentKeyPress(e) { }

// Search & Filtering Handlers
let _searchTimer = null;
function handleFeedSearchInput(e) {
  const query = e.target.value;
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = query.length ? 'block' : 'none';

  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    FeedEngine.setSearchQuery(query);
  }, 350);
}

function clearFeedSearch() {
  const input = document.getElementById('feedSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  FeedEngine.setSearchQuery('');
}

function toggleFeedSearch() {
  const container = document.getElementById('feedSearchContainer');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('feedSearchInput');
    if (input) input.focus();
  }
}

function filterFeedTopic(topic) {
  FeedEngine.filterTopic(topic);
}

function switchFeedTab(tab) {
  FeedEngine.switchTab(tab);
}

// Format LaTeX Math & Discord Style Code Blocks & Markdown
function formatMathAndMarkdown(str) {
  if (!str) return '';
  let safe = esc(str);

  // Mentions: @username
  safe = safe.replace(/(?:^|\s)@([a-zA-Z0-9_]+)/g, ' <span style="color:#1d9bf0; font-weight:700; cursor:pointer;" onclick="openUserPage(\'$1\')">@$1</span>');

  // Math equations: $equation$
  safe = safe.replace(/\$([^$]+)\$/g, '<span style="font-family:\'Latin Modern Math\', \'Times New Roman\', serif; font-style:italic; font-size:1.1em; background:rgba(99,102,241,0.15); color:#a78bfa; padding:2px 8px; border-radius:6px; border:1px solid rgba(167,139,250,0.3); font-weight:bold;">$1</span>');

  // Subreddit / Community tags: r/matematik or #matematik
  safe = safe.replace(/(?:^|\s)([rR]\/[\w\-]+|#[\w\-]+)/g, ' <span style="color:#818cf8; font-weight:800; cursor:pointer;" onclick="filterFeedTopic(\'$1\')">$1</span>');

  // Code blocks ```code```
  safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code `code`
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-family:monospace;">$1</code>');
  // Bold **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return safe;
}

// Global Legacy Wrappers for create/share modals
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
  const tx = document.getElementById('postTextarea');
  if (tx) tx.value = '';
  clearPostImage();
}
function closePostModal() { closeCreatePostModal(); }


// CROPPER STATE & CREATION HELPERS
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
  const textEl = document.getElementById('postTextarea');
  if (!textEl) return;
  const text = textEl.value;
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
    if (cropImg) cropImg.src = url;
    
    _cropperX = (260 - _cropperImgWidth) / 2;
    _cropperY = (260 - _cropperImgHeight) / 2;
    _cropperZoom = 1.0;
    
    const cropContainer = document.getElementById('postCropContainer');
    if (cropContainer) cropContainer.style.display = 'flex';
    updatePostModalState();
  };
}

function clearPostImage() {
  _postImageFile = null;
  _cropperImgObj = null;
  const input = document.getElementById('postImageInput');
  if (input) input.value = '';
  const cropContainer = document.getElementById('postCropContainer');
  if (cropContainer) cropContainer.style.display = 'none';
  updatePostModalState();
}

async function submitPost() {
  const textEl = document.getElementById('postTextarea');
  const content = textEl ? textEl.value.trim() : '';
  if (!content && !_postImageFile) {
    showToast('Bir şeyler yaz veya fotoğraf ekle');
    return;
  }

  const btn = document.getElementById('postSubmitBtn');
  btn.disabled = true;

  const formData = new FormData();
  formData.append('content', content);
  if (_postImageFile) {
    formData.append('image', _postImageFile);
  }

  try {
    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    if (res.ok) {
      closePostModal();
      showToast('Paylaşıldı!');
      FeedEngine.loadFeed(true);
    } else {
      showToast('Paylaşılamadı, tekrar dene');
    }
  } catch {
    showToast('Bağlantı hatası');
  }

  btn.disabled = false;
}

function loadFeed() { window.FeedEngine.loadFeed(true); }

document.addEventListener('DOMContentLoaded', () => {
  window.FeedEngine.init();
});
