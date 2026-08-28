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
  el.className = 'thread-modal-backdrop';
  el.onclick = (e) => { 
    if (e.target === el || e.target.classList.contains('thread-modal-container') || e.target.classList.contains('thread-modal-content-wrapper')) {
      closeGlobalPostModal(); 
    }
  };

  // Scroll Container
  const scrollBox = document.createElement('div');
  scrollBox.className = 'thread-modal-container';
  
  // Wrapper for centering
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'thread-modal-content-wrapper';
  
  const threadWrapper = document.createElement('div');
  threadWrapper.className = 'thread-modal-content';
  threadWrapper.innerHTML = '<div class="loading-row" style="color:#aaa;padding:40px;text-align:center;font-weight:700;">YÜKLENİYOR...</div>';
  
  contentWrapper.appendChild(threadWrapper);
  scrollBox.appendChild(contentWrapper);
  el.appendChild(scrollBox);
  document.body.appendChild(el);

  window._previousUrlBeforePostModal = window.location.pathname;

  if (!window._isPostPopstate) {
    const encId = window.encodeId ? window.encodeId(postId) : postId;
    history.pushState({ modal: "post", postId: encId }, "", "/post/" + encId);
  }
  window._isPostPopstate = false;
  window._currentOpenPostId = postId;

  requestAnimationFrame(() => el.classList.add('open'));

  try {
    const res = await fetch(`/api/posts/${postId}`);
    if (!res.ok) throw new Error();
    const post = await res.json();
    renderPostDetailSheet(threadWrapper, post, isOwn, isRepost);
  } catch {
    const list = isRepost ? (typeof _profileUserReposts !== 'undefined' ? _profileUserReposts : []) : (typeof _profileUserPosts !== 'undefined' ? _profileUserPosts : []);
    const post = (list || window.FeedEngine?.posts || []).find(p => p.id === postId);
    if (post) {
      renderPostDetailSheet(threadWrapper, post, isOwn, isRepost);
    } else {
      threadWrapper.innerHTML = '<div class="empty-state" style="color:#888;padding:40px;text-align:center;"><div class="empty-title">Gönderi yüklenemedi</div></div>';
    }
  }
}

window.openPostModal = openGlobalPostModal;
window.openProfilePostDetail = openGlobalPostModal;
window.openGlobalPostModal = openGlobalPostModal;

function renderPostDetailSheet(wrapper, post, isOwn, isRepost) {
  const comments = post.comments || [];
  window._loadedPostForModal = post; // Used globally for likes/bookmarks

  let rootHtml = '';
  if (typeof window.renderTweetCard === 'function') {
    rootHtml = window.renderTweetCard(post, { isThreadView: true });
  }

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
    ? `<div class="pdetail-no-comment" style="color:var(--t-text-muted);font-size:13.5px;text-align:center;padding:32px 0; font-weight:600;">Henüz yanıt yok. İlk yanıtı sen yaz!</div>`
    : parents.map(c => renderPdetailCommentTree(c, childrenMap[c.id] || [], post)).join('');

  const activeUser = (typeof currentUser !== 'undefined' ? currentUser : null);
  const guestCta = `
    <div class="thread-reply-guest-cta" style="padding: 16px 20px; text-align: center; background: var(--t-bg-input, rgba(255,255,255,0.04)); border-radius: 14px; border: 1px solid var(--t-border-subtle, rgba(255,255,255,0.08));">
      <div style="font-size: 15px; font-weight: 800; color: var(--t-text-primary, #fff); margin-bottom: 6px;">Senin Düşüncen Ne?</div>
      <div style="font-size: 13px; color: var(--t-text-muted, #8a9099); margin-bottom: 14px; line-height: 1.45;">Topluluğa katıl, kendi fikrini belirt ve fikirlerine değer veren insanlarla etkileşime geç.</div>
      <button onclick="closeGlobalPostModal(); showLogin();" class="mono-btn-primary" style="padding: 10px 24px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer;">Hemen Giriş Yap / Kaydol</button>
    </div>
  `;

  const replyRow = `
    <div id="pdetail-reply-bar-${post.id}" class="pdetail-reply-bar" style="display:none;"></div>
    <div class="thread-reply-input-row">
      ${renderAvatar(activeUser || { profile_photo: '/default-avatar.png' }, 'avatar avatar-sm')}
      <input id="pdetailCommentInput-${post.id}" class="thread-comment-input" placeholder="Yanıtını gönder..." onkeydown="if(event.key==='Enter') pdetailComment(${post.id})">
      <button class="thread-comment-send" onclick="pdetailComment(${post.id})">Yanıtla</button>
    </div>
  `;

  wrapper.innerHTML = `
    <div class="thread-modal-header">
      <div class="thread-back-btn" onclick="closeGlobalPostModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </div>
      <div class="thread-header-title">Gönderi</div>
    </div>
    
    <div class="thread-root-container">
      ${rootHtml}
    </div>

    <div class="thread-comments-container" id="pdetailComments-${post.id}">
      ${commentsHtml}
    </div>

    <div class="thread-reply-container">
      ${activeUser ? replyRow : guestCta}
    </div>
  
    <!-- Detail 3-dot menu panel -->
    <div id="pdetailMenuOverlay-${post.id}" class="profile-menu-overlay" onclick="closeDetailMenu(${post.id})" style="display:none"></div>
    <div id="pdetailMenuPanel-${post.id}" class="profile-post-menu-panel" style="display:none">
      <div class="profile-post-menu-title">GÖNDERİ YÖNETİMİ</div>
      <button class="profile-post-menu-item" onclick="pdetailEditPost(${post.id}, \`${esc(post.content || '')}\`)">Düzenle</button>
      <button class="profile-post-menu-item" onclick="pdetailShareFromMenu(${post.id})">Mesajda paylaş</button>
      <button class="profile-post-menu-item danger" onclick="pdetailDeletePost(${post.id})">Gönderiyi sil</button>
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
    if (history.state && history.state.modal === 'post') {
      history.back();
    } else {
      const userProfileEl = document.getElementById('userProfilePage');
      const isUserProfileActive = userProfileEl && userProfileEl.classList.contains('active') && userProfileEl.style.display !== 'none';
      
      let targetUrl = '/feed';
      if (isUserProfileActive && window._previousUrlBeforePostModal && window._previousUrlBeforePostModal.startsWith('/u/')) {
        targetUrl = window._previousUrlBeforePostModal;
      } else {
        const pageToReturn = (typeof activePage !== 'undefined' && activePage) ? activePage : 'feed';
        targetUrl = (typeof getPathForPage === 'function') ? getPathForPage(pageToReturn) : '/feed';
      }
      history.replaceState({ pageName: isUserProfileActive ? 'userProfile' : activePage }, '', targetUrl);
    }
  }
  window._currentOpenPostId = null;
  window._isPostPopstate = false;

  const el = document.getElementById('profilePostPreview');
  if (el) {
    el.classList.remove('open');
    setTimeout(() => {
      el.remove();
      // Restore body scroll only if userProfilePage is not active
      const userProfileEl = document.getElementById('userProfilePage');
      const isUserProfileActive = userProfileEl && userProfileEl.classList.contains('active') && userProfileEl.style.display !== 'none';
      if (!isUserProfileActive) {
        document.body.style.overflow = '';
      }
    }, 200);
  }
}

// Detail menu
function openDetailMenu(postId) {
  const o = document.getElementById(`pdetailMenuOverlay-${postId}`);
  const p = document.getElementById(`pdetailMenuPanel-${postId}`);
  if (o) o.style.display = 'block';
  if (p) p.style.display = 'flex';
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
    <span>GÖNDERİYİ DÜZENLE</span>
    <button class="profile-edit-modal-close" onclick="document.getElementById('pdetailEditSheet')?.remove()">✕</button>
  `;

  const body = document.createElement('div');
  body.className = 'profile-edit-modal-body';

  const textarea = document.createElement('textarea');
  textarea.className = 'profile-edit-modal-textarea';
  textarea.value = currentContent || '';
  textarea.placeholder = 'Gönderi içeriğinizi düzenleyin...';
  body.appendChild(textarea);

  const footer = document.createElement('div');
  footer.className = 'profile-edit-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'profile-edit-modal-cancel';
  cancelBtn.textContent = 'İptal';
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
        showToast('Gönderi güncellendi');
        el.remove();
        openGlobalPostModal(postId);
        if (typeof loadFeed === 'function') loadFeed();
        if (typeof loadMyProfile === 'function') loadMyProfile();
      } else {
        showToast('Güncellenemedi');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Kaydet';
      }
    } catch {
      showToast('Bağlantı hatası');
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
  if (!(await window.showConfirm('Bu gönderiyi silmek istediğinizden emin misiniz?'))) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Gönderi silindi');
      closeGlobalPostModal();
      if (typeof loadMyProfile === 'function') loadMyProfile();
      if (typeof loadFeed === 'function') loadFeed();
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
      closeGlobalPostModal();
      if (typeof loadMyProfile === 'function') loadMyProfile();
      if (typeof loadFeed === 'function') loadFeed();
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
        if (typeof _profileActiveTab !== 'undefined' && _profileActiveTab === 'reposts') {
          closeGlobalPostModal();
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

      if (typeof loadMyProfile === 'function') loadMyProfile();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Repost işlemi başarısız');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

// ============================================================
// PROFILE DETAIL NESTED COMMENTS HELPERS
// ============================================================
let _pdetailReplyStates = {};
const _openReplyParentIds = new Set();

// Toggle comment / reply like
async function toggleCommentLike(commentId) {
  if (window.requireAuth && window.requireAuth()) return;
  if (!commentId) return;

  const btn = document.getElementById(`clbtn-${commentId}`);
  const cnt = document.getElementById(`cl-count-${commentId}`);
  const svg = btn ? btn.querySelector('svg') : null;

  const isLiked = btn ? btn.classList.contains('liked') : false;
  const currentCount = cnt ? parseInt(cnt.textContent || '0', 10) : 0;
  const nextCount = Math.max(0, currentCount + (isLiked ? -1 : 1));

  // Optimistic UI Update
  if (btn) btn.classList.toggle('liked', !isLiked);
  if (cnt) cnt.textContent = nextCount;
  if (svg) {
    svg.style.fill = !isLiked ? 'var(--danger, #ff3b30)' : 'none';
    svg.style.stroke = !isLiked ? 'var(--danger, #ff3b30)' : 'currentColor';
  }

  try {
    const res = await fetch(`/api/comments/${commentId}/like`, { method: 'POST' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (typeof showToast === 'function') {
      showToast(data.liked ? 'Yanıt beğenildi' : 'Beğeni kaldırıldı');
    }
  } catch (err) {
    // Revert UI on failure
    if (btn) btn.classList.toggle('liked', isLiked);
    if (cnt) cnt.textContent = currentCount;
    if (svg) {
      svg.style.fill = isLiked ? 'var(--danger, #ff3b30)' : 'none';
      svg.style.stroke = isLiked ? 'var(--danger, #ff3b30)' : 'currentColor';
    }
    if (typeof showToast === 'function') showToast('İşlem gerçekleştirilemedi');
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
      if (parentId) {
        _openReplyParentIds.add(parentId);
      }
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

function setPdetailReplyTo(postId, parentId, username) {
  _pdetailReplyStates[postId] = { parentId, username };
  if (parentId) {
    _openReplyParentIds.add(parentId);
  }
  const input = document.getElementById(`pdetailCommentInput-${postId}`);
  if (input) {
    input.placeholder = `@${username} kullanıcısına yanıt yaz...`;
    input.value = `@${username} ` + input.value.replace(/^@[a-zA-Z0-9_.]+\s*/, '');
    input.focus();
  }
  renderPdetailReplyBar(postId);
  
  if (parentId) {
    const list = document.getElementById(`pdetail-replies-list-${parentId}`);
    if (list) list.classList.add('open');
    const toggleBtn = document.querySelector(`[data-reply-parent-id="${parentId}"]`);
    if (toggleBtn && toggleBtn.querySelector('.text')) {
      toggleBtn.querySelector('.text').textContent = 'Yanıtları gizle';
    }
  }
}

function cancelPdetailReply(postId) {
  const replyState = _pdetailReplyStates[postId];
  delete _pdetailReplyStates[postId];
  const input = document.getElementById(`pdetailCommentInput-${postId}`);
  if (input) {
    input.placeholder = "Yanıtını gönder...";
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
      <div class="reply-active-indicator">
        <span>@${esc(state.username)} kullanıcısına yanıt veriliyor</span>
        <button onclick="cancelPdetailReply(${postId})" style="background:none;border:none;color:var(--danger, #ff3b30);cursor:pointer;font-weight:bold;font-size:13px;padding:2px 6px">✕</button>
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
    _openReplyParentIds.add(parentId);
    if (btn && btn.querySelector('.text')) {
      btn.querySelector('.text').textContent = 'Yanıtları gizle';
    }
  } else {
    container.classList.remove('open');
    _openReplyParentIds.delete(parentId);
    if (btn && btn.querySelector('.text')) {
      btn.querySelector('.text').textContent = `Yanıtları gör (${container.children.length})`;
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

    const cachedPost = (typeof _profileUserPosts !== 'undefined' ? _profileUserPosts : []).find(p => p.id === postId)
      || (typeof _profileUserReposts !== 'undefined' ? _profileUserReposts : []).find(p => p.id === postId);
    const post = cachedPost ? cachedPost : { id: postId, username: null };

    section.innerHTML = parents.length === 0
      ? `<div class="pdetail-no-comment" style="color:var(--t-text-muted);font-size:13.5px;text-align:center;padding:32px 0; font-weight:600;">Henüz yanıt yok. İlk yanıtı sen yaz!</div>`
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

function formatCommentContent(raw) {
  if (!raw) return '';
  const escaped = esc(raw);
  // Match @username
  return escaped.replace(/@([a-zA-Z0-9_.]+)/g, (match, uname) => {
    return `<span class="tweet-mention" data-hovercard-user="${uname}" onclick="openUserPage('${uname}'); event.stopPropagation();">@${uname}</span>`;
  });
}

function renderPdetailCommentTree(c, replies, post) {
  const canDelete = currentUser && (c.username === currentUser.username || (post && post.username === currentUser.username));
  const repliesHtml = replies.map(r => renderPdetailReplyItem(r, post)).join('');
  const hasReplies = replies.length > 0;
  const isExpanded = _openReplyParentIds.has(c.id);

  return `
    <div class="pdetail-comment-tree-node" id="pdetail-comment-node-${c.id}">
      <div class="pdetail-comment" id="pdetail-comment-item-${c.id}">
        <div class="pdetail-comment-left">
          <div class="pdetail-comment-avatar-wrap" data-hovercard-user="${esc(c.username)}" onclick="openUserPage('${esc(c.username)}'); event.stopPropagation();">
            ${renderAvatar({ username: c.username, profile_photo: c.profile_photo }, 'avatar avatar-sm')}
          </div>
          <div class="pdetail-comment-body">
            <div class="pdetail-comment-meta">
              <span class="pdetail-comment-user" data-hovercard-user="${esc(c.username)}" onclick="openUserPage('${esc(c.username)}')">${esc(c.username)}</span>
              <span class="pdetail-comment-time">${fmtPostTime(c.created_at)}</span>
            </div>
            <div class="pdetail-comment-text">${formatCommentContent(c.content)}</div>
            <div class="pdetail-comment-actions">
              <button class="comment-reply-action-btn" onclick="setPdetailReplyTo(${post.id}, ${c.id}, '${esc(c.username)}')">Yanıtla</button>
              ${canDelete ? `
                <span class="comment-action-dot">·</span>
                <button class="comment-delete-action-btn" onclick="deletePdetailComment(${c.id}, ${post.id})">Sil</button>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="pdetail-comment-right">
          <button
            class="comment-like-btn ${c.user_liked ? 'liked' : ''}"
            id="clbtn-${c.id}"
            onclick="toggleCommentLike(${c.id})"
            title="Beğen"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${c.user_liked ? 'var(--danger, #ff3b30)' : 'none'}" stroke="${c.user_liked ? 'var(--danger, #ff3b30)' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="cl-count-${c.id}" class="comment-like-num">${c.like_count ? c.like_count : ''}</span>
          </button>
        </div>
      </div>

      ${hasReplies ? `
        <div class="pdetail-replies-wrapper">
          <button class="pdetail-replies-toggle-btn" data-reply-parent-id="${c.id}" onclick="togglePdetailRepliesContainer(this, ${c.id})">
            <span class="line"></span>
            <span class="text">${isExpanded ? 'Yanıtları gizle' : `Yanıtları gör (${replies.length})`}</span>
          </button>
          <div class="pdetail-replies-list ${isExpanded ? 'open' : ''}" id="pdetail-replies-list-${c.id}">
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
    <div class="pdetail-comment reply-item" id="pdetail-comment-item-${r.id}">
      <div class="pdetail-comment-left">
        <div class="pdetail-comment-avatar-wrap" data-hovercard-user="${esc(r.username)}" onclick="openUserPage('${esc(r.username)}'); event.stopPropagation();">
          ${renderAvatar({ username: r.username, profile_photo: r.profile_photo }, 'avatar avatar-xs')}
        </div>
        <div class="pdetail-comment-body">
          <div class="pdetail-comment-meta">
            <span class="pdetail-comment-user" data-hovercard-user="${esc(r.username)}" onclick="openUserPage('${esc(r.username)}')">${esc(r.username)}</span>
            <span class="pdetail-comment-time">${fmtPostTime(r.created_at)}</span>
          </div>
          <div class="pdetail-comment-text">${formatCommentContent(r.content)}</div>
          <div class="pdetail-comment-actions">
            <button class="comment-reply-action-btn" onclick="setPdetailReplyTo(${post.id}, ${r.parent_id}, '${esc(r.username)}')">Yanıtla</button>
            ${canDelete ? `
              <span class="comment-action-dot">·</span>
              <button class="comment-delete-action-btn" onclick="deletePdetailComment(${r.id}, ${post.id})">Sil</button>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="pdetail-comment-right">
        <button
          class="comment-like-btn ${r.user_liked ? 'liked' : ''}"
          id="clbtn-${r.id}"
          onclick="toggleCommentLike(${r.id})"
          title="Beğen"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="${r.user_liked ? 'var(--danger, #ff3b30)' : 'none'}" stroke="${r.user_liked ? 'var(--danger, #ff3b30)' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span id="cl-count-${r.id}" class="comment-like-num">${r.like_count ? r.like_count : ''}</span>
        </button>
      </div>
    </div>
  `;
}
