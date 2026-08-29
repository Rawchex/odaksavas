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

      // GUEST LIMIT GUARD
      window._guestLimitReached = false;
      if (!(typeof currentUser !== 'undefined' && currentUser) && this.posts.length >= 15) {
        this.posts = this.posts.slice(0, 15);
        this.hasMore = false;
        window._guestLimitReached = true;
      } else if (newPosts.length < this.limit) {
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
    this.posts.forEach((post) => {
      html += window.renderTweetCard(post);
    });

    if (window._guestLimitReached) {
      html += `
        <div class="guest-auth-wall" style="padding:40px 20px; text-align:center; background:linear-gradient(to top, var(--bg, #0b0c0e) 0%, transparent 100%); position:relative; z-index:10;">
          <h2 style="color:#fff; font-size:24px; font-weight:800; margin-bottom:12px;">Daha fazlası için BLUNK'a katıl!</h2>
          <p style="color:#888; font-size:14px; margin-bottom:20px;">Ders arkadaşını bul, özel odalarda çalış ve toplulukla etkileşime geç.</p>
          <button class="btn btn-primary btn-block" onclick="showLogin()" style="border-radius:100px; padding:12px 24px; font-weight:700;">Hemen Kayıt Ol</button>
        </div>
      `;
    }

    list.innerHTML = html;
    observeFeedVideos();
  },

  async toggleRepost(postId) {
    if (window.requireAuth && window.requireAuth()) return;
    const post = this.posts.find(p => p.id === postId) || (window._loadedPostForModal && window._loadedPostForModal.id === postId ? window._loadedPostForModal : null);
    if (!post) return;

    const isReposted = !!post.user_reposted;
    const method = isReposted ? 'DELETE' : 'POST';

    try {
      const res = await fetch(`/api/posts/${postId}/repost`, { method });
      if (res.ok) {
        post.user_reposted = isReposted ? 0 : 1;
        post.repost_count = Math.max(0, (post.repost_count || 0) + (isReposted ? -1 : 1));

        const cards = document.querySelectorAll(`article[data-post-id="${postId}"]`);
        cards.forEach(card => {
          const btn = card.querySelector('.tweet-action-btn.repost');
          const cnt = card.querySelector('.action-count-repost');
          if (btn) {
            btn.classList.toggle('reposted', !!post.user_reposted);
            const svg = btn.querySelector('svg');
            if (svg) svg.setAttribute('stroke', post.user_reposted ? '#00ba7c' : 'currentColor');
          }
          if (cnt) cnt.textContent = post.repost_count || 0;
        });

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
  if (text.includes('matematik') || text.includes('türev') || text.includes('integral') || text.includes('geometri') || text.includes('denklem') || text.includes('lim')) return 'Matematik';
  if (text.includes('yazılım') || text.includes('kod') || text.includes('js') || text.includes('python') || text.includes('css') || text.includes('react')) return 'Yazılım';
  if (text.includes('fizik') || text.includes('kuantum') || text.includes('vektör') || text.includes('enerji')) return 'Fizik';
  if (text.includes('soru') || text.includes('nedir') || text.includes('nasıl') || text.includes('çözüm')) return 'Soru-Cevap';
  return 'Sohbet';
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

window.handleTweetReplyClick = function(postId) {
  if (window._currentOpenPostId === postId) {
    const input = document.getElementById(`pdetailCommentInput-${postId}`);
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    if (typeof openGlobalPostModal === 'function') {
      openGlobalPostModal(postId);
      setTimeout(() => {
        const input = document.getElementById(`pdetailCommentInput-${postId}`);
        if (input) input.focus();
      }, 300);
    }
  }
};

window.renderTweetCard = function(p, options = {}) {
  const hasMedia = !!p.image;
  const isVideo = p.image && /\.(mp4|webm|mov|m4v|ogg)$/i.test(p.image);
  const isThreadView = !!options.isThreadView;
  const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
  const isOwnPost = activeUser && (Number(activeUser.id) === Number(p.user_id) || activeUser.username === p.username);
  
  return `
    <article class="tweet-card ${isThreadView ? 'thread-root-card' : ''}" data-post-id="${p.id}" ${!isThreadView ? `onclick="if(event.target.closest('.tweet-action-btn') || event.target.closest('.tweet-delete-btn') || event.target.closest('a') || event.target.closest('.tweet-media-container') || event.target.closest('.tweet-avatar') || event.target.closest('.tweet-author-name') || event.target.closest('.tweet-author-handle') || event.target.closest('.blunk-hovercard-popover')) return; openGlobalPostModal(${p.id});"` : ''} style="${!isThreadView ? 'cursor:pointer;' : ''}">
      <div class="tweet-avatar" data-hovercard-user="${esc(p.username)}" onclick="openUserPage('${esc(p.username)}'); event.stopPropagation();">
        ${renderAvatar({ username: p.username, profile_photo: p.profile_photo }, 'avatar avatar-sm')}
      </div>
      <div class="tweet-content-wrapper">
        <div class="tweet-header">
          <div class="tweet-header-user">
            <span class="tweet-author-name" data-hovercard-user="${esc(p.username)}" onclick="openUserPage('${esc(p.username)}'); event.stopPropagation();">${esc(p.username)}</span>
            <span class="tweet-author-handle" data-hovercard-user="${esc(p.username)}" onclick="openUserPage('${esc(p.username)}'); event.stopPropagation();">@${esc(p.username)}</span>
            <span class="tweet-dot-separator">·</span>
            <span class="tweet-time">${fmtPostTime(p.created_at)}</span>
          </div>
          ${isOwnPost ? `
            <button class="tweet-delete-btn" onclick="deleteTweetPost(${p.id}); event.stopPropagation();" aria-label="Gönderiyi Sil" title="Gönderiyi Sil">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          ` : ''}
        </div>
        
        <div class="tweet-body">
          ${p.content ? `<div class="tweet-text">${formatMathAndMarkdown(p.content)}</div>` : ''}
          ${hasMedia ? (
            isVideo
              ? `<div class="tweet-media-container tweet-video-wrapper"><video src="${esc(p.image)}" class="tweet-media tweet-video-player" controls playsinline preload="metadata" loop onclick="event.stopPropagation();"></video></div>`
              : `<div class="tweet-media-container" onclick="openMediaLightbox('${esc(p.image)}'); event.stopPropagation();"><img src="${esc(p.image)}" alt="Gönderi Medyası" class="tweet-media" loading="lazy"></div>`
          ) : ''}
        </div>

        <div class="tweet-actions-bar">
          <button class="tweet-action-btn reply" data-tooltip="Yanıtla" onclick="handleTweetReplyClick(${p.id}); event.stopPropagation();">
            <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <span class="action-count-reply">${p.comment_count || 0}</span>
          </button>
          <button class="tweet-action-btn repost ${p.user_reposted ? 'reposted' : ''}" data-tooltip="Repost" onclick="FeedEngine.toggleRepost(${p.id}); event.stopPropagation();">
            <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${p.user_reposted ? '#00ba7c' : 'currentColor'}" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
            <span class="action-count-repost">${p.repost_count || 0}</span>
          </button>
          <button class="tweet-action-btn like ${p.user_liked ? 'liked' : ''}" data-tooltip="Beğen" onclick="toggleTweetLike(${p.id}); event.stopPropagation();">
            <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="${p.user_liked ? '#f91880' : 'none'}" stroke="${p.user_liked ? '#f91880' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
            <span class="action-count-like">${p.like_count || 0}</span>
          </button>
          <button class="tweet-action-btn bookmark ${p.user_bookmarked ? 'bookmarked' : ''}" data-tooltip="Kaydet" onclick="bookmarkTweet(${p.id}); event.stopPropagation();">
            <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="${p.user_bookmarked ? '#1d9bf0' : 'none'}" stroke="${p.user_bookmarked ? '#1d9bf0' : 'currentColor'}" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
          </button>
          <button class="tweet-action-btn share" data-tooltip="Paylaş" onclick="openSharePostModal(${p.id}); event.stopPropagation();">
            <div class="tweet-icon-wrap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></div>
          </button>
        </div>
      </div>
    </article>
  `;
};

window.deleteTweetPost = async function(postId) {
  if (window.requireAuth && window.requireAuth()) return;
  const confirmed = typeof window.showConfirm === 'function'
    ? await window.showConfirm('Bu gönderiyi silmek istediğinizden emin misiniz?')
    : confirm('Bu gönderiyi silmek istediğinizden emin misiniz?');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Gönderi silindi');
      if (window.FeedEngine && window.FeedEngine.posts) {
        window.FeedEngine.posts = window.FeedEngine.posts.filter(p => p.id !== postId);
      }
      document.querySelectorAll(`article[data-post-id="${postId}"]`).forEach(card => card.remove());
      if (typeof closeGlobalPostModal === 'function') closeGlobalPostModal();
      if (typeof loadMyProfile === 'function') loadMyProfile();
    } else {
      showToast('Gönderi silinemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
};

async function toggleTweetLike(postId) {
  if (window.requireAuth && window.requireAuth()) return;
  const post = FeedEngine.posts.find(p => p.id === postId) || (window._loadedPostForModal && window._loadedPostForModal.id === postId ? window._loadedPostForModal : null);
  if (!post) return;

  const wasLiked = !!post.user_liked;
  post.user_liked = wasLiked ? 0 : 1;
  post.like_count = Math.max(0, (post.like_count || 0) + (wasLiked ? -1 : 1));

  // Update ALL matching cards in DOM (both in feed and in modal)
  const cards = document.querySelectorAll(`article[data-post-id="${postId}"]`);
  cards.forEach(card => {
    const btn = card.querySelector('.tweet-action-btn.like');
    const cnt = card.querySelector('.action-count-like');
    if (btn) {
      btn.classList.toggle('liked', !!post.user_liked);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', post.user_liked ? '#f91880' : 'none');
        svg.setAttribute('stroke', post.user_liked ? '#f91880' : 'currentColor');
      }
    }
    if (cnt) cnt.textContent = post.like_count || 0;
  });

  showToast(post.user_liked ? 'Beğenildi' : 'Beğeni kaldırıldı');
  try {
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  } catch {}
}

async function bookmarkTweet(postId) {
  if (window.requireAuth && window.requireAuth()) return;
  const post = FeedEngine.posts.find(p => p.id === postId) || (window._loadedPostForModal && window._loadedPostForModal.id === postId ? window._loadedPostForModal : null);
  if (!post) return;

  try {
    const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      post.user_bookmarked = data.bookmarked ? 1 : 0;
      const cards = document.querySelectorAll(`article[data-post-id="${postId}"]`);
      cards.forEach(card => {
        const btn = card.querySelector('.tweet-action-btn.bookmark');
        if (btn) {
          btn.classList.toggle('bookmarked', !!data.bookmarked);
          const svg = btn.querySelector('svg');
          if (svg) {
            svg.setAttribute('fill', data.bookmarked ? '#1d9bf0' : 'none');
            svg.setAttribute('stroke', data.bookmarked ? '#1d9bf0' : 'currentColor');
          }
        }
      });
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
let _userSearchCache = {};

async function fetchFeedUserSearch(query) {
  if (query.length < 2) return [];
  if (_userSearchCache[query]) return _userSearchCache[query];
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    const users = await res.json();
    _userSearchCache[query] = users;
    return users;
  } catch (err) {
    console.error('User search err:', err);
    return [];
  }
}

async function handleFeedSearchInput(e) {
  const query = e.target.value.trim();
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = query.length ? 'block' : 'none';

  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    // 1. Filter Posts
    FeedEngine.setSearchQuery(query);
    
    // 2. Search Users (Instagram Style)
    const dropdown = document.getElementById('feedSearchDropdown');
    if (!dropdown) return;
    
    if (query.length < 2) {
      dropdown.style.display = 'none';
      return;
    }
    
    const users = await fetchFeedUserSearch(query);
    if (users.length === 0) {
      dropdown.style.display = 'none';
      return;
    }
    
    dropdown.innerHTML = users.map(u => {
      const avatarHtml = renderAvatar(u, 'avatar');
      return `
        <div class="feed-search-dropdown-item" onmousedown="openUserPage('${esc(u.username)}')">
          ${avatarHtml}
          <div>
            <div class="username">${esc(u.username)}</div>
            <div class="status">${u.is_online ? '<span style="color:#10b981;">● Çevrimiçi</span>' : (u.level ? `Seviye ${u.level}` : 'Yeni Üye')}</div>
          </div>
        </div>
      `;
    }).join('');
    
    dropdown.style.display = 'block';
  }, 350);
}

function handleFeedSearchFocus() {
  const query = document.getElementById('feedSearchInput')?.value.trim();
  const dropdown = document.getElementById('feedSearchDropdown');
  if (dropdown && dropdown.innerHTML.trim() !== '' && query && query.length >= 2) {
    dropdown.style.display = 'block';
  }
}

function handleFeedSearchBlur() {
  const dropdown = document.getElementById('feedSearchDropdown');
  // Use timeout to allow click on dropdown items to fire before hiding
  setTimeout(() => {
    if (dropdown) dropdown.style.display = 'none';
  }, 200);
}

function clearFeedSearch() {
  const input = document.getElementById('feedSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  const dropdown = document.getElementById('feedSearchDropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
  }
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
  safe = safe.replace(/(?:^|\s)@([a-zA-Z0-9_]+)/g, ' <span style="color:#1d9bf0; font-weight:700; cursor:pointer;" data-hovercard-user="$1" onclick="openUserPage(\'$1\'); event.stopPropagation();">@$1</span>');

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


// ─── PRO MEDIA & CROPPER ENGINE ──────────────────────────────
let _postMediaFile = null;
let _postMediaType = null; // 'image' | 'video'
let _cropState = {
  img: null,
  origW: 0,
  origH: 0,
  baseScale: 1,
  zoom: 1,
  x: 0,
  y: 0,
  viewportW: 340,
  viewportH: 340,
  isDragging: false,
  startX: 0,
  startY: 0,
  origX: 0,
  origY: 0
};

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
    submitBtn.disabled = (text.trim().length === 0 && !_postMediaFile) || count < 0;
  }
}

function onPostMediaSelected(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);

  if (isVideo) {
    // 1. File size check (35 MB)
    if (file.size > 35 * 1024 * 1024) {
      showToast('Video boyutu maksimum 35 MB olabilir.');
      input.value = '';
      return;
    }

    // 2. Video duration check (60 sec)
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    const tempUrl = URL.createObjectURL(file);
    tempVideo.src = tempUrl;

    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(tempUrl);
      if (tempVideo.duration > 60) {
        showToast('Video süresi maksimum 60 saniye olabilir.');
        clearPostMedia();
        return;
      }

      _postMediaFile = file;
      _postMediaType = 'video';

      const cropContainer = document.getElementById('postCropContainer');
      if (cropContainer) cropContainer.style.display = 'none';

      const videoContainer = document.getElementById('postVideoPreviewContainer');
      const videoPreview = document.getElementById('postVideoPreview');
      if (videoPreview) {
        videoPreview.src = URL.createObjectURL(file);
      }
      if (videoContainer) videoContainer.style.display = 'flex';

      updatePostModalState();
    };

    tempVideo.onerror = () => {
      showToast('Video formatı okunamadı');
      clearPostMedia();
    };
    return;
  }

  // Handle Image Upload with Crop Engine
  _postMediaFile = file;
  _postMediaType = 'image';

  const videoContainer = document.getElementById('postVideoPreviewContainer');
  const videoPreview = document.getElementById('postVideoPreview');
  if (videoContainer) videoContainer.style.display = 'none';
  if (videoPreview) videoPreview.src = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      _cropState.img = img;
      _cropState.origW = img.naturalWidth || img.width;
      _cropState.origH = img.naturalHeight || img.height;
      _cropState.zoom = 1;

      const container = document.getElementById('postCropContainer');
      const viewport = document.getElementById('postCropViewport');
      const cropImg = document.getElementById('postCropImg');
      const slider = document.getElementById('postCropZoomSlider');

      if (slider) slider.value = '1';
      if (container) container.style.display = 'flex';

      // Measure viewport
      const rect = viewport ? viewport.getBoundingClientRect() : null;
      _cropState.viewportW = (rect && rect.width > 0) ? rect.width : (viewport ? (viewport.clientWidth || 340) : 340);
      _cropState.viewportH = (rect && rect.height > 0) ? rect.height : (viewport ? (viewport.clientHeight || 340) : 340);

      // Base scale so image fully covers the square viewport
      _cropState.baseScale = Math.max(
        _cropState.viewportW / _cropState.origW,
        _cropState.viewportH / _cropState.origH
      );

      // Center image
      const curW = _cropState.origW * _cropState.baseScale;
      const curH = _cropState.origH * _cropState.baseScale;
      _cropState.x = (_cropState.viewportW - curW) / 2;
      _cropState.y = (_cropState.viewportH - curH) / 2;

      if (cropImg) {
        cropImg.src = e.target.result;
        cropImg.style.maxWidth = 'none';
        cropImg.style.maxHeight = 'none';
        cropImg.style.width = `${_cropState.origW}px`;
        cropImg.style.height = `${_cropState.origH}px`;
      }

      applyCropTransform();
      initCropInteraction();
      updatePostModalState();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function onPostImageSelected(input) {
  onPostMediaSelected(input);
}

function stepPostCropZoom(delta) {
  const slider = document.getElementById('postCropZoomSlider');
  let newZ = (_cropState.zoom || 1) + delta;
  newZ = Math.min(5, Math.max(1, Math.round(newZ * 100) / 100));
  if (slider) slider.value = newZ.toString();
  onPostCropZoom(newZ);
}

function onPostCropZoom(val) {
  const newZoom = Math.min(5, Math.max(1, parseFloat(val) || 1));
  const oldZoom = _cropState.zoom || 1;
  _cropState.zoom = newZoom;

  // Zoom centered relative to viewport
  const centerX = _cropState.viewportW / 2;
  const centerY = _cropState.viewportH / 2;
  
  _cropState.x = centerX - ((centerX - _cropState.x) / oldZoom) * newZoom;
  _cropState.y = centerY - ((centerY - _cropState.y) / oldZoom) * newZoom;

  clampCropPosition();
  applyCropTransform();
}

function clampCropPosition() {
  const currentW = _cropState.origW * _cropState.baseScale * _cropState.zoom;
  const currentH = _cropState.origH * _cropState.baseScale * _cropState.zoom;

  // Clamp X
  if (currentW <= _cropState.viewportW) {
    _cropState.x = (_cropState.viewportW - currentW) / 2;
  } else {
    const minX = _cropState.viewportW - currentW;
    const maxX = 0;
    _cropState.x = Math.min(maxX, Math.max(minX, _cropState.x));
  }

  // Clamp Y
  if (currentH <= _cropState.viewportH) {
    _cropState.y = (_cropState.viewportH - currentH) / 2;
  } else {
    const minY = _cropState.viewportH - currentH;
    const maxY = 0;
    _cropState.y = Math.min(maxY, Math.max(minY, _cropState.y));
  }
}

function applyCropTransform() {
  const cropImg = document.getElementById('postCropImg');
  if (!cropImg) return;
  const scale = _cropState.baseScale * _cropState.zoom;
  cropImg.style.transform = `translate3d(${_cropState.x}px, ${_cropState.y}px, 0) scale(${scale})`;
}

function initCropInteraction() {
  const viewport = document.getElementById('postCropViewport');
  const grid = document.getElementById('postCropGrid');
  if (!viewport || viewport._hasCropListener) return;
  viewport._hasCropListener = true;

  const activePointers = new Map();
  let initialPinchDist = 0;
  let initialPinchZoom = 1;

  const getPinchDist = (p1, p2) => Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

  const onPointerDown = (e) => {
    if (!_cropState.img) return;
    activePointers.set(e.pointerId, e);
    if (grid) grid.classList.add('active');

    if (activePointers.size === 1) {
      _cropState.isDragging = true;
      _cropState.startX = e.clientX;
      _cropState.startY = e.clientY;
      _cropState.origX = _cropState.x;
      _cropState.origY = _cropState.y;
    } else if (activePointers.size === 2) {
      _cropState.isDragging = false;
      const pts = Array.from(activePointers.values());
      initialPinchDist = getPinchDist(pts[0], pts[1]);
      initialPinchZoom = _cropState.zoom;
    }
    viewport.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, e);

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dist = getPinchDist(pts[0], pts[1]);
      if (initialPinchDist > 0) {
        const factor = dist / initialPinchDist;
        const newZ = Math.min(5, Math.max(1, initialPinchZoom * factor));
        const slider = document.getElementById('postCropZoomSlider');
        if (slider) slider.value = newZ.toString();
        onPostCropZoom(newZ);
      }
    } else if (_cropState.isDragging && activePointers.size === 1) {
      const dx = e.clientX - _cropState.startX;
      const dy = e.clientY - _cropState.startY;
      _cropState.x = _cropState.origX + dx;
      _cropState.y = _cropState.origY + dy;
      clampCropPosition();
      applyCropTransform();
    }
  };

  const onPointerUp = (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
      _cropState.isDragging = false;
      if (grid) grid.classList.remove('active');
    } else if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0];
      _cropState.isDragging = true;
      _cropState.startX = remaining.clientX;
      _cropState.startY = remaining.clientY;
      _cropState.origX = _cropState.x;
      _cropState.origY = _cropState.y;
    }
  };

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);

  // Wheel zoom support
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const slider = document.getElementById('postCropZoomSlider');
    let newZ = _cropState.zoom + (e.deltaY < 0 ? 0.15 : -0.15);
    newZ = Math.min(5, Math.max(1, Math.round(newZ * 100) / 100));
    if (slider) slider.value = newZ.toString();
    onPostCropZoom(newZ);
  }, { passive: false });
}

function clearPostMedia() {
  _postMediaFile = null;
  _postMediaType = null;
  _cropState.img = null;

  const input = document.getElementById('postImageInput');
  if (input) input.value = '';

  const cropContainer = document.getElementById('postCropContainer');
  if (cropContainer) cropContainer.style.display = 'none';

  const cropImg = document.getElementById('postCropImg');
  if (cropImg) cropImg.src = '';

  const videoContainer = document.getElementById('postVideoPreviewContainer');
  if (videoContainer) videoContainer.style.display = 'none';

  const videoPreview = document.getElementById('postVideoPreview');
  if (videoPreview) {
    videoPreview.pause();
    videoPreview.src = '';
  }

  updatePostModalState();
}

function clearPostImage() {
  clearPostMedia();
}

// Generate the cropped image blob - strictly sending only the cropped area
function getCroppedBlob() {
  return new Promise((resolve) => {
    if (!_cropState.img) {
      resolve(null);
      return;
    }

    const scale = _cropState.baseScale * _cropState.zoom;
    // Calculate source rect relative to original image dimensions
    const srcX = Math.max(0, -_cropState.x / scale);
    const srcY = Math.max(0, -_cropState.y / scale);
    const srcW = Math.min(_cropState.origW - srcX, _cropState.viewportW / scale);
    const srcH = Math.min(_cropState.origH - srcY, _cropState.viewportH / scale);

    // High quality 1080x1080 square canvas output
    const outCanvas = document.createElement('canvas');
    const TARGET_SIZE = 1080;
    outCanvas.width = TARGET_SIZE;
    outCanvas.height = TARGET_SIZE;
    const ctx = outCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      _cropState.img,
      srcX, srcY, srcW, srcH,
      0, 0, TARGET_SIZE, TARGET_SIZE
    );

    outCanvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.92);
  });
}

async function submitPost() {
  const textEl = document.getElementById('postTextarea');
  const content = textEl ? textEl.value.trim() : '';
  if (!content && !_postMediaFile) {
    showToast('Bir şeyler yaz veya medya ekle');
    return;
  }

  const btn = document.getElementById('postSubmitBtn');
  if (btn) btn.disabled = true;

  const formData = new FormData();
  formData.append('content', content);

  // If a video is selected
  if (_postMediaType === 'video' && _postMediaFile) {
    formData.append('image', _postMediaFile, _postMediaFile.name || 'post_video.mp4');
  } 
  // If an image was cropped, export ONLY the cropped canvas blob
  else if (_postMediaType === 'image' && _postMediaFile && _cropState.img) {
    try {
      const croppedBlob = await getCroppedBlob();
      if (croppedBlob) {
        formData.append('image', croppedBlob, 'post_image.jpg');
      }
    } catch {
      showToast('Görsel işlenirken hata oluştu');
      if (btn) btn.disabled = false;
      return;
    }
  }

  try {
    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      closeCreatePostModal();
      showToast('Gönderi paylaşıldı!');
      if (window.FeedEngine) FeedEngine.loadFeed(true);
    } else {
      showToast(data.error || 'Paylaşılamadı, tekrar dene');
    }
  } catch {
    showToast('Bağlantı hatası');
  }

  if (btn) btn.disabled = false;
}

function observeFeedVideos() {
  const videos = document.querySelectorAll('.tweet-video-player');
  if (!videos.length) return;
  if (!window._feedVideoObserver) {
    window._feedVideoObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      });
    }, { threshold: 0.3 });
  }
  videos.forEach(v => window._feedVideoObserver.observe(v));
}

function loadFeed() { window.FeedEngine.loadFeed(true); }

// Expose compose & media functions globally to window
window.onPostMediaSelected = onPostMediaSelected;
window.onPostImageSelected = onPostMediaSelected;
window.clearPostMedia = clearPostMedia;
window.clearPostImage = clearPostMedia;
window.stepPostCropZoom = stepPostCropZoom;
window.onPostCropZoom = onPostCropZoom;
window.submitPost = submitPost;
window.openCreatePostModal = openCreatePostModal;
window.closeCreatePostModal = closeCreatePostModal;

document.addEventListener('DOMContentLoaded', () => {
  window.FeedEngine.init();
});
