// Global Post Modal definition
async function openGlobalPostModal(postId, isOwn, isRepost) {
  // Remove existing modal if any
  const existing = document.getElementById('profilePostPreview');
  if (existing) existing.remove();

  // Disable body scroll to prevent background scrolling
  document.body.style.overflow = 'hidden';

  // Backdrop
  const el = document.createElement('div');
  el.id = 'profilePostPreview';
  el.className = 'pdetail-backdrop';
  el.onclick = (e) => { if (e.target === el) closeGlobalPostModal(); };

  // Scroll Container for Feed Queue
  const scrollBox = document.createElement('div');
  scrollBox.className = 'pdetail-scroll-queue';
  scrollBox.style.cssText = 'width:100%; height:100%; overflow-y:auto; scroll-snap-type:y mandatory; display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:24px;';
  
  el.appendChild(scrollBox);
  document.body.appendChild(el);
  if (!window._isPostPopstate) {
    history.pushState({ modal: "post", postId: postId }, "", "/post/" + postId);
  }
  window._isPostPopstate = false;
  window._currentOpenPostId = postId;


  // Store queue state
  window._modalFeedQueue = {
    loadedIds: new Set([postId]),
    offset: 0,
    isLoading: false,
    hasMore: true
  };

  // Render initial target post
  const firstSheet = document.createElement('div');
  firstSheet.className = 'pdetail-sheet';
  firstSheet.style.scrollSnapAlign = 'center';
  firstSheet.innerHTML = '<div class="loading-row" style="color:#aaa;padding:40px;text-align:center;font-weight:700;">Y├£KLEN─░YOR...</div>';
  scrollBox.appendChild(firstSheet);
  requestAnimationFrame(() => firstSheet.classList.add('open'));

  try {
    const res = await fetch(`/api/posts/${postId}`);
    if (!res.ok) throw new Error();
    const post = await res.json();
    renderPostDetailSheet(firstSheet, post, isOwn, isRepost);
  } catch {
    const list = isRepost ? _profileUserReposts : _profileUserPosts;
    const post = (list || []).find(p => p.id === postId);
    if (post) {
      renderPostDetailSheet(firstSheet, post, isOwn, isRepost);
    } else {
      firstSheet.innerHTML = '<div class="empty-state" style="color:#888;padding:40px;text-align:center;"><div class="empty-title">G├Ânderi y├╝klenemedi</div></div>';
    }
  }

  // Infinite Scroll Handler for Discover Queue inside modal
  scrollBox.addEventListener('scroll', async () => {
    const state = window._modalFeedQueue;
    if (!state || state.isLoading || !state.hasMore) return;

    if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 400) {
      state.isLoading = true;
      try {
        const res = await fetch(`/api/feed/discover?limit=10&offset=${state.offset}`);
        if (res.ok) {
          const nextPosts = await res.json();
          state.offset += 10;
          let addedCount = 0;
          
          nextPosts.forEach(p => {
            if (!state.loadedIds.has(p.id)) {
              state.loadedIds.add(p.id);
              addedCount++;
              const sheetNode = document.createElement('div');
              sheetNode.className = 'pdetail-sheet open';
              sheetNode.style.scrollSnapAlign = 'center';
              renderPostDetailSheet(sheetNode, p, p.username === currentUser?.username, false);
              scrollBox.appendChild(sheetNode);
            }
          });

          if (addedCount === 0 && nextPosts.length < 10) {
            state.hasMore = false;
          }
        }
      } catch (e) {
        console.warn('Queue feed load error:', e);
      }
      state.isLoading = false;
    }
  });
}

window.openPostModal = openPostModal;
function openGlobalPostModal(postId, isOwn, isRepost) {
  return openGlobalPostModal(postId, isOwn, isRepost);
}
window.openProfilePostDetail = openProfilePostDetail;

function renderPostDetailSheet(sheet, post, isOwn, isRepost) {
  const isSelfPost = post.username === currentUser.username;
  const displayContent = (post.content || '').replace(/^Repost: /, '');
  const comments = post.comments || [];
  const likers = post.likers || [];

  const authorPhoto = isSelfPost ? (currentUser.profile_photo || post.profile_photo) : post.profile_photo;
  const authorObj = { username: post.username, profile_photo: authorPhoto };

  const likersHtml = likers.length > 0 ? `
    <div class="pdetail-likers" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;color:var(--t-text-muted)">
      <div class="pdetail-likers-avatars" style="display:flex;margin-right:2px">
        ${likers.slice(0, 3).map(l => renderAvatar({ username: l.username, profile_photo: l.profile_photo }, 'avatar avatar-xs')).join('')}
      </div>
      <span class="pdetail-likers-text">
        ${likers[0]?.username ? `<strong>${esc(likers[0].username)}</strong>` : ''}${likers.length > 1 ? ` ve ${post.like_count - 1} ki┼şi` : ''} be─şendi
      </span>
    </div>
  ` : '';

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
    ? `<div class="pdetail-no-comment" style="color:var(--t-text-muted);font-size:13px;text-align:center;padding:24px 0">Hen├╝z yorum yok. ─░lk yorumu sen yaz!</div>`
    : parents.map(c => renderPdetailCommentTree(c, childrenMap[c.id] || [], post)).join('');

  sheet.innerHTML = `
    <div class="pdetail-modal-container">
      <!-- Media / Content Column (Left) -->
      <div class="pdetail-media-column">
        ${post.image ? `
          <div class="pdetail-image-box">
            <img src="${post.image}" class="pdetail-image" alt="G├Ânderi g├Ârseli">
          </div>
        ` : `
          <div class="pdetail-text-card-content">
            <p>${esc(displayContent)}</p>
          </div>
        `}
      </div>

      <!-- Info / Comments Column (Right) -->
      <div class="pdetail-info-column">
        <!-- Header -->
        <div class="pdetail-header">
          <div class="pdetail-author" onclick="openUserPage('${esc(post.username)}')">
            ${renderAvatar(authorObj, 'avatar avatar-sm')}
            <div style="display:flex;flex-direction:column;line-height:1.2">
              <span class="pdetail-author-name">${esc(post.username)}</span>
              <span style="font-size:10px;color:#777">${fmtPostTime(post.created_at)}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${(isOwn || isSelfPost) && !isRepost ? `
              <button class="pdetail-menu-btn" onclick="openDetailMenu(${post.id})" data-tooltip="Se├ğenekler" data-tooltip-pos="bottom">
                <span></span><span></span><span></span>
              </button>` : ''}
            ${isRepost ? `
              <button class="pdetail-menu-btn" onclick="profileRemoveRepostFromDetail(${post.id})" data-tooltip="Repostu Kald─▒r" data-tooltip-pos="bottom">
                <span></span><span></span><span></span>
              </button>` : ''}
            <button onclick="closeGlobalPostModal()" class="pdetail-close-btn" data-tooltip="Kapat" data-tooltip-pos="bottom" aria-label="Kapat">Ô£ò</button>
          </div>
        </div>

        <!-- Scrollable Middle Section (Caption + Likers + Comments) -->
        <div class="pdetail-comments-scroll" id="pdetailCommentsScroll-${post.id}">
          ${displayContent && post.image ? `
            <div class="pdetail-caption">
              <strong class="pdetail-caption-author" onclick="openUserPage('${esc(post.username)}')">${esc(post.username)}</strong>${esc(displayContent)}
            </div>
          ` : ''}

          ${likersHtml}

          <div class="pdetail-comments-section" id="pdetailComments-${post.id}">
            ${commentsHtml}
          </div>
        </div>

        <!-- Bottom Panel (Actions + Counts + Reply Bar + Comment Input) -->
        <div class="pdetail-bottom-panel">
          <div class="pdetail-actions">
            <div class="pdetail-action-left">
              <button class="pdetail-action-btn ${post.user_liked ? 'liked' : ''}" onclick="pdetailLike(${post.id}, this)" data-tooltip="${post.user_liked ? 'Be─şeniyi Kald─▒r' : 'Be─şen'}" data-tooltip-pos="top">
                <svg viewBox="0 0 24 24" fill="${post.user_liked ? '#ff3b30' : 'none'}" stroke="${post.user_liked ? '#ff3b30' : 'currentColor'}" stroke-width="2" width="24" height="24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
              <button class="pdetail-action-btn ${(post.user_reposted || isRepost) ? 'reposted' : ''}" onclick="pdetailRepost(${post.id}, this)" data-tooltip="${(post.user_reposted || isRepost) ? 'Repostu Kald─▒r' : 'Repost Et'}" data-tooltip-pos="top">
                <svg viewBox="0 0 24 24" fill="none" stroke="${(post.user_reposted || isRepost) ? '#32d74b' : 'currentColor'}" stroke-width="2" width="22" height="22"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              </button>
              <button class="pdetail-action-btn" onclick="openSharePostModal(${post.id})" data-tooltip="G├Ânderiyi Payla┼ş" data-tooltip-pos="top">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>

          <div class="pdetail-counts">
            <span id="pdetail-like-count">${post.like_count || 0} be─şeni</span>
            <span style="color:var(--text-3)">┬À</span>
            <span>${post.comment_count || 0} yorum</span>
            <span style="color:var(--text-3)">┬À</span>
            <span id="pdetail-repost-count-${post.id}">${post.repost_count || 0} repost</span>
          </div>

          <div id="pdetail-reply-bar-${post.id}" class="pdetail-reply-bar" style="display:none"></div>

          <div class="pdetail-comment-input-row">
            ${renderAvatar(currentUser, 'avatar avatar-xs')}
            <input id="pdetailCommentInput-${post.id}" class="pdetail-comment-input" placeholder="Yorum ekle..." onkeydown="if(event.key==='Enter') pdetailComment(${post.id})">
            <button class="pdetail-comment-send" onclick="pdetailComment(${post.id})">G├Ânder</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail 3-dot menu panel -->
    <div id="pdetailMenuOverlay-${post.id}" class="profile-menu-overlay" onclick="closeDetailMenu(${post.id})" style="display:none"></div>
    <div id="pdetailMenuPanel-${post.id}" class="profile-post-menu-panel" style="display:none">
      <div class="profile-post-menu-title">G├û├ûNDER─░ Y├ûNET─░M─░</div>
      <button class="profile-post-menu-item" onclick="pdetailEditPost(${post.id}, \`${esc(displayContent)}\`)">D├╝zenle</button>
      <button class="profile-post-menu-item" onclick="pdetailShareFromMenu(${post.id})">Mesajda payla┼ş</button>
      <button class="profile-post-menu-item danger" onclick="pdetailDeletePost(${post.id})">G├Ânderiyi sil</button>
    </div>
  `;

  if ((!post.comments || post.comments.length === 0) && post.comment_count > 0) {
    setTimeout(() => {
      loadPdetailComments(post.id);
    }, 50);
  }
}

function closeGlobalPostModal() {
  if (window._currentOpenPostId && !window._isPostPopstate) {
    if (location.pathname.startsWith("/post/")) {
      history.replaceState(null, "", "/feed");
    } else {
      history.back();
    }
  }
  window._currentOpenPostId = null;
  window._isPostPopstate = false;

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

function pdetailShareFromMenu(postId) {
  closeDetailMenu(postId);
  openSharePostModal(postId);
}

// Edit from detail
function pdetailEditPost(postId, currentContent) {
  closeDetailMenu(postId);
  const existing = document.getElementById('pdetailEditSheet');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'pdetailEditSheet';
  el.className = 'profile-edit-modal';
  el.onclick = (e) => { if (e.target === el) el.remove(); };

  const inner = document.createElement('div');
  inner.className = 'profile-edit-modal-inner';

  const header = document.createElement('div');
  header.className = 'profile-edit-modal-header';
  header.innerHTML = `
    <span>G├û├ûNDER─░Y─░ D├£ZENLE</span>
    <button class="profile-edit-modal-close" onclick="document.getElementById('pdetailEditSheet')?.remove()">Ô£ò</button>
  `;

  const body = document.createElement('div');
  body.className = 'profile-edit-modal-body';

  const textarea = document.createElement('textarea');
  textarea.className = 'profile-edit-modal-textarea';
  textarea.value = currentContent || '';
  textarea.placeholder = 'G├Ânderi i├ğeri─şinizi d├╝zenleyin...';
  body.appendChild(textarea);

  const footer = document.createElement('div');
  footer.className = 'profile-edit-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'profile-edit-modal-cancel';
  cancelBtn.textContent = '─░ptal';
  cancelBtn.onclick = () => el.remove();

  const saveBtn = document.createElement('button');
  saveBtn.className = 'profile-edit-modal-save';
  saveBtn.textContent = 'Kaydet';
  saveBtn.onclick = async () => {
    const content = textarea.value.trim();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Kaydediliyor...';
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        showToast('G├Ânderi g├╝ncellendi');
        el.remove();
        openGlobalPostModal(postId);
        if (typeof loadFeed === 'function') loadFeed();
        if (typeof loadMyProfile === 'function') loadMyProfile();
      } else {
        showToast('G├╝ncellenemedi');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Kaydet';
      }
    } catch {
      showToast('Ba─şlant─▒ hatas─▒');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Kaydet';
    }
  };

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  inner.appendChild(header);
  inner.appendChild(body);
  inner.appendChild(footer);
  el.appendChild(inner);
  document.body.appendChild(el);

  setTimeout(() => textarea.focus(), 50);
}

// Delete from detail
async function pdetailDeletePost(postId) {
  closeDetailMenu(postId);
  if (!(await window.showConfirm('Bu g├Ânderiyi silmek istedi─şinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('G├Ânderi silindi');
      closeGlobalPostModal();
      loadMyProfile();
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Ba─şlant─▒ hatas─▒');
  }
}

// Remove repost from detail
async function profileRemoveRepostFromDetail(postId) {
  if (!(await window.showConfirm('Repost\'u kald─▒rmak istedi─şinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}/repost`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Repost kald─▒r─▒ld─▒');
      closeGlobalPostModal();
      loadMyProfile();
    } else {
      showToast('Kald─▒r─▒lamad─▒');
    }
  } catch {
    showToast('Ba─şlant─▒ hatas─▒');
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
        countEl.textContent = `${liked ? cur + 1 : Math.max(0, cur - 1)} be─şeni`;
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
        showToast('Repost kald─▒r─▒ld─▒');
        btn.querySelector('svg').setAttribute('stroke', 'currentColor');
        btn.classList.remove('reposted');
        // If we are on the reposts tab, close and refresh so the item disappears from grid
        if (_profileActiveTab === 'reposts') {
          closeGlobalPostModal();
        }
      } else {
        showToast('Repost yap─▒ld─▒');
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
      showToast(d.error || 'Repost i┼şlemi ba┼şar─▒s─▒z');
    }
  } catch {
    showToast('Ba─şlant─▒ hatas─▒');
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
    input.placeholder = `@${username} kullan─▒c─▒s─▒na yan─▒t yaz...`;
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
        <span>@${state.username} kullan─▒c─▒s─▒na yan─▒t veriliyor</span>
        <button onclick="cancelPdetailReply(${postId})" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-weight:bold;font-size:12px;padding:2px 6px">Ô£ò</button>
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
  const isOpen = container.classList.contains('open');
  if (!isOpen) {
    container.classList.add('open');
    if (btn && btn.querySelector('.text')) {
      btn.querySelector('.text').textContent = 'Yan─▒tlar─▒ gizle';
    }
  } else {
    container.classList.remove('open');
    if (btn && btn.querySelector('.text')) {
      btn.querySelector('.text').textContent = `Yan─▒tlar─▒ g├Âr (${container.children.length})`;
    }
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
      ? `<div class="pdetail-no-comment">Hen├╝z yorum yok</div>`
      : parents.map(c => renderPdetailCommentTree(c, childrenMap[c.id] || [], post)).join('');
  } catch {}
}

async function deletePdetailComment(commentId, postId) {
  if (!(await window.showConfirm('Bu yorumu silmek istedi─şinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Yorum silindi');
      await loadPdetailComments(postId);
    } else {
      showToast('Silinemedi');
    }
  } catch {
    showToast('Ba─şlant─▒ hatas─▒');
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
            <span class="pdetail-comment-user" style="font-weight:700;color:var(--t-text-primary);cursor:pointer;" onclick="openUserPage('${esc(c.username)}')">${esc(c.username)}</span>
            <span style="font-size:10px;color:var(--t-text-muted);margin-left:6px;">${fmtPostTime(c.created_at)}</span>
          </div>
          <span class="pdetail-comment-text" style="font-size:13px;color:var(--t-text-secondary);word-break:break-word;">${esc(c.content)}</span>
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
            <button onclick="setPdetailReplyTo(${post.id}, ${c.id}, '${esc(c.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yan─▒tla</button>
            ${canDelete ? `
              <button onclick="deletePdetailComment(${c.id}, ${post.id})" style="background:none;border:none;color:#ff3b30;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Sil</button>
            ` : ''}
          </div>
        </div>
      </div>

      ${hasReplies ? `
        <div class="pdetail-replies-wrapper" style="margin-left:36px;margin-top:6px;">
          <button class="pdetail-replies-toggle-btn" onclick="togglePdetailRepliesContainer(this, ${c.id})" style="background:none;border:none;color:var(--t-text-muted);cursor:pointer;padding:4px 0;font-size:10px;font-weight:600;display:flex;align-items:center;gap:6px">
            <span class="line" style="display:inline-block;width:16px;height:1px;background:var(--t-border-strong)"></span>
            <span class="text">Yan─▒tlar─▒ g├Âr (${replies.length})</span>
          </button>
          <div class="pdetail-replies-list" id="pdetail-replies-list-${c.id}">
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
          <span class="pdetail-comment-user" style="font-weight:700;color:var(--t-text-primary);cursor:pointer;" onclick="openUserPage('${esc(r.username)}')">${esc(r.username)}</span>
          <span style="font-size:10px;color:var(--t-text-muted);margin-left:6px;">${fmtPostTime(r.created_at)}</span>
        </div>
        <span class="pdetail-comment-text" style="font-size:13px;color:var(--t-text-secondary);word-break:break-word;">${esc(r.content)}</span>
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
          <button onclick="setPdetailReplyTo(${post.id}, ${r.parent_id}, '${esc(r.username)}')" style="background:none;border:none;color:#888;cursor:pointer;padding:0;font-size:10px;font-weight:bold">Yan─▒tla</button>
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
// ============================================================window.openProfilePostDetail = openGlobalPostModal;
window.openGlobalPostModal = openGlobalPostModal;
