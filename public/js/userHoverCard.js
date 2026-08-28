/* ============================================================
   USERHOVERCARD.JS — BLUNK Custom Interactive Profile HoverCard
   1000ms Intent Delay, Auto-Dismiss on Scroll & Navigation,
   Zero-Emoji, Light/Dark Mode Native, Production Hardened
   ============================================================ */

'use strict';

(function() {
  const SHOW_DELAY_MS = 1000; // 1 second hover intent delay (like X/Twitter)
  const HIDE_DELAY_MS = 180;  // Grace period when moving cursor from trigger to card

  const _userCache = new Map();
  let _popoverEl = null;
  let _showTimeout = null;
  let _hideTimeout = null;
  let _currentTargetEl = null;
  let _isMouseInsideCard = false;

  // Format compact numbers (e.g. 10.4K)
  function formatNumber(num) {
    if (!num) return '0';
    const n = parseInt(num, 10);
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
  }

  // Escape HTML safe
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // League badge helper (Vector SVG, NO EMOJIS)
  function getLeagueBadgeHtml(level) {
    const lvl = parseInt(level || 1, 10);
    let name = 'Çırak';
    let color = '#94a3b8';
    let bg = 'rgba(148, 163, 184, 0.12)';
    let border = 'rgba(148, 163, 184, 0.25)';

    if (lvl >= 50) {
      name = 'Efsane';
      color = '#f59e0b';
      bg = 'rgba(245, 158, 11, 0.15)';
      border = 'rgba(245, 158, 11, 0.35)';
    } else if (lvl >= 30) {
      name = 'Elmas';
      color = '#38bdf8';
      bg = 'rgba(56, 189, 248, 0.15)';
      border = 'rgba(56, 189, 248, 0.35)';
    } else if (lvl >= 20) {
      name = 'Platin';
      color = '#a855f7';
      bg = 'rgba(168, 85, 247, 0.15)';
      border = 'rgba(168, 85, 247, 0.35)';
    } else if (lvl >= 10) {
      name = 'Altın';
      color = '#eab308';
      bg = 'rgba(234, 179, 8, 0.15)';
      border = 'rgba(234, 179, 8, 0.35)';
    } else if (lvl >= 5) {
      name = 'Gümüş';
      color = '#cbd5e1';
      bg = 'rgba(203, 213, 225, 0.15)';
      border = 'rgba(203, 213, 225, 0.35)';
    }

    return `
      <div class="blunk-hovercard-badge" style="background:${bg}; border-color:${border}; color:${color};">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>${name}</span>
      </div>
    `;
  }

  // Fetch user data with 60s memory caching
  async function fetchUserData(username) {
    const cleanUser = (username || '').replace(/^@/, '').trim();
    if (!cleanUser) return null;

    const cached = _userCache.get(cleanUser.toLowerCase());
    if (cached && (Date.now() - cached.timestamp < 60000)) {
      return cached.data;
    }

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(cleanUser)}`);
      if (!res.ok) return null;
      const data = await res.json();
      _userCache.set(cleanUser.toLowerCase(), { timestamp: Date.now(), data });
      return data;
    } catch (err) {
      console.error('[HoverCard] Error fetching user:', err);
      return null;
    }
  }

  // Force close & clear all pending timers immediately
  function forceHide() {
    clearTimeout(_showTimeout);
    clearTimeout(_hideTimeout);
    _showTimeout = null;
    _hideTimeout = null;
    _currentTargetEl = null;
    _isMouseInsideCard = false;

    if (_popoverEl) {
      _popoverEl.classList.remove('visible');
    }
  }

  // Create or get global popover container
  function getPopoverContainer() {
    if (!_popoverEl) {
      let el = document.getElementById('blunkHovercardPopover');
      if (!el) {
        el = document.createElement('div');
        el.id = 'blunkHovercardPopover';
        el.className = 'blunk-hovercard-popover';
        document.body.appendChild(el);
      }

      el.addEventListener('mouseenter', () => {
        _isMouseInsideCard = true;
        clearTimeout(_hideTimeout);
      });

      el.addEventListener('mouseleave', () => {
        _isMouseInsideCard = false;
        scheduleHide(0);
      });

      // Prevent clicks inside card from bubbling to window close handlers unintentionally
      el.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      _popoverEl = el;
    }
    return _popoverEl;
  }

  // Position popover relative to target element
  function positionPopover(popover, targetEl) {
    if (!targetEl || !document.body.contains(targetEl)) {
      forceHide();
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    
    // If target is no longer visible in viewport, hide immediately
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      forceHide();
      return;
    }

    const popoverWidth = 320;
    const popoverHeight = popover.offsetHeight || 280;
    const padding = 12;

    // Calculate horizontal position (center aligned with target, clamped to screen)
    let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
    if (left < padding) left = padding;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }

    // Calculate vertical position (prefer below target, flip to top if close to bottom)
    let top = rect.bottom + 8;
    let placement = 'bottom';

    if (top + popoverHeight > window.innerHeight - padding) {
      top = rect.top - popoverHeight - 8;
      placement = 'top';
      if (top < padding) {
        top = Math.max(padding, rect.bottom + 8);
        placement = 'bottom';
      }
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.setAttribute('data-placement', placement);
  }

  // Render HoverCard UI (BLUNK Native Design)
  function renderCardContent(user) {
    const isMe = (typeof currentUser !== 'undefined' && currentUser && currentUser.id === user.id);
    const isFollowing = user.friendship && user.friendship.status === 'accepted';
    const cleanUsername = esc(user.username);
    const photoUrl = user.profile_photo || '/default-avatar.png';
    const isOnline = !!user.is_online;
    const bioText = user.bio ? esc(user.bio) : '';

    return `
      <div class="blunk-hovercard-inner">
        <!-- Top Section: Avatar & Action Button -->
        <div class="blunk-hovercard-top">
          <div class="blunk-hovercard-avatar-wrap" onclick="window.UserHoverCard.goToProfile('${cleanUsername}')">
            <img src="${photoUrl}" alt="${cleanUsername}" class="blunk-hovercard-avatar">
            ${isOnline ? '<span class="blunk-hovercard-online-dot" title="Çevrimiçi"></span>' : ''}
          </div>

          <div class="blunk-hovercard-top-action">
            ${isMe ? `
              <span class="blunk-hovercard-self-tag">Sen</span>
            ` : `
              <button class="blunk-hovercard-follow-btn ${isFollowing ? 'following' : ''}" 
                      id="hovercard-follow-btn-${cleanUsername}"
                      onclick="window.UserHoverCard.toggleFollow('${cleanUsername}', this, event)">
                <span class="btn-text-follow">+ Takip Et</span>
                <span class="btn-text-following">Takip Ediliyor</span>
                <span class="btn-text-unfollow">Takipten Çık</span>
              </button>
            `}
          </div>
        </div>

        <!-- Identity Section -->
        <div class="blunk-hovercard-identity">
          <div class="blunk-hovercard-name-row" onclick="window.UserHoverCard.goToProfile('${cleanUsername}')">
            <span class="blunk-hovercard-name">${cleanUsername}</span>
            <svg class="blunk-hovercard-verified-icon" viewBox="0 0 24 24" width="16" height="16" fill="var(--t-accent-primary, #a855f7)">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <span class="blunk-hovercard-handle" onclick="window.UserHoverCard.goToProfile('${cleanUsername}')">@${cleanUsername}</span>
        </div>

        <!-- BLUNK Gamification Badges (Level & League & Streak) -->
        <div class="blunk-hovercard-badges-row">
          <div class="blunk-hovercard-badge level-badge">
            <span class="badge-accent">LVL</span>
            <span>${user.level || 1}</span>
          </div>
          ${getLeagueBadgeHtml(user.level)}
          ${user.streak ? `
            <div class="blunk-hovercard-badge streak-badge" title="Günlük Seri">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/>
              </svg>
              <span>${user.streak} Gün Seri</span>
            </div>
          ` : ''}
        </div>

        <!-- Bio (if available) -->
        ${bioText ? `
          <div class="blunk-hovercard-bio">${bioText}</div>
        ` : ''}

        <!-- Stats Bar: Followers / Following / Posts -->
        <div class="blunk-hovercard-stats-bar">
          <div class="blunk-hovercard-stat" onclick="window.UserHoverCard.openFriends('${cleanUsername}', 'followers')">
            <span class="stat-value">${formatNumber(user.follower_count || user.friend_count || 0)}</span>
            <span class="stat-label">Takipçi</span>
          </div>
          <div class="blunk-hovercard-stat" onclick="window.UserHoverCard.openFriends('${cleanUsername}', 'following')">
            <span class="stat-value">${formatNumber(user.following_count || user.friend_count || 0)}</span>
            <span class="stat-label">Takip</span>
          </div>
          <div class="blunk-hovercard-stat" onclick="window.UserHoverCard.goToProfile('${cleanUsername}')">
            <span class="stat-value">${formatNumber(user.post_count || 0)}</span>
            <span class="stat-label">Gönderi</span>
          </div>
        </div>

        <!-- Quick Profile & Chat Actions -->
        <div class="blunk-hovercard-footer-actions">
          <button class="blunk-hovercard-btn secondary" onclick="window.UserHoverCard.goToProfile('${cleanUsername}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Profili Gör</span>
          </button>

          ${!isMe ? `
            <button class="blunk-hovercard-btn primary" onclick="window.UserHoverCard.startDirectChat('${cleanUsername}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Mesaj</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Show hovercard for given target and username after intent delay
  async function showHovercard(targetEl, username) {
    if (!targetEl || !username || !document.body.contains(targetEl)) return;
    _currentTargetEl = targetEl;

    const popover = getPopoverContainer();
    
    // Skeleton loading state
    popover.innerHTML = `
      <div class="blunk-hovercard-inner loading">
        <div class="blunk-hovercard-top">
          <div class="blunk-hovercard-avatar-wrap skeleton"></div>
          <div class="blunk-hovercard-btn-skeleton skeleton"></div>
        </div>
        <div class="blunk-hovercard-skeleton-line short skeleton" style="margin-top:12px;"></div>
        <div class="blunk-hovercard-skeleton-line tiny skeleton" style="margin-top:6px; width:45%;"></div>
        <div class="blunk-hovercard-skeleton-line full skeleton" style="margin-top:14px;"></div>
      </div>
    `;

    popover.classList.add('visible');
    positionPopover(popover, targetEl);

    const user = await fetchUserData(username);
    
    // Check if target element is still the active one
    if (_currentTargetEl !== targetEl) return;

    if (!user) {
      forceHide();
      return;
    }

    popover.innerHTML = renderCardContent(user);
    positionPopover(popover, targetEl);
  }

  // Schedule show with exactly 1000ms hover intent delay
  function scheduleShow(targetEl, username) {
    clearTimeout(_hideTimeout);
    clearTimeout(_showTimeout);

    // If mouse left before delay expires, it won't open
    _showTimeout = setTimeout(() => {
      showHovercard(targetEl, username);
    }, SHOW_DELAY_MS);
  }

  // Schedule hide when cursor leaves trigger
  function scheduleHide(delay = HIDE_DELAY_MS) {
    clearTimeout(_showTimeout);
    clearTimeout(_hideTimeout);

    _hideTimeout = setTimeout(() => {
      if (!_isMouseInsideCard) {
        forceHide();
      }
    }, delay);
  }

  // Follow/Unfollow toggle inside card
  async function toggleFollow(username, btnEl, e) {
    if (e) e.stopPropagation();
    if (window.requireAuth && window.requireAuth()) return;
    if (!username || !btnEl) return;

    const isFollowing = btnEl.classList.contains('following');
    const endpoint = isFollowing ? `/api/unfollow/${encodeURIComponent(username)}` : `/api/follow/${encodeURIComponent(username)}`;

    // Optimistic UI update
    btnEl.classList.toggle('following', !isFollowing);
    
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error();
      
      // Update cache
      const cleanUser = username.toLowerCase();
      if (_userCache.has(cleanUser)) {
        const cached = _userCache.get(cleanUser);
        if (cached && cached.data) {
          cached.data.friendship = !isFollowing ? { status: 'accepted' } : null;
          cached.data.follower_count = (cached.data.follower_count || 0) + (!isFollowing ? 1 : -1);
        }
      }

      if (typeof showToast === 'function') {
        showToast(!isFollowing ? `@${username} takip edildi` : `@${username} takipten çıkarıldı`);
      }
    } catch (err) {
      btnEl.classList.toggle('following', isFollowing);
      if (typeof showToast === 'function') showToast('İşlem gerçekleştirilemedi');
    }
  }

  // Navigate to user profile and dismiss card & post modal
  function goToProfile(username) {
    forceHide();
    if (typeof closeGlobalPostModal === 'function') {
      closeGlobalPostModal();
    }
    setTimeout(() => {
      if (typeof openUserPage === 'function') {
        openUserPage(username);
      }
    }, 60);
  }

  // Open friends modal and dismiss card
  function openFriends(username, type) {
    forceHide();
    if (typeof openFriendListModal === 'function') {
      openFriendListModal(username, type);
    }
  }

  // Start direct message chat and dismiss card & post modal
  function startDirectChat(username) {
    forceHide();
    if (typeof closeGlobalPostModal === 'function') {
      closeGlobalPostModal();
    }
    setTimeout(() => {
      if (typeof showPage === 'function') {
        showPage('messages');
      }
      if (typeof openDirectChat === 'function') {
        openDirectChat(username);
      }
    }, 60);
  }

  // Global Event Delegation & Strict Visibility Rule Handlers
  function initHoverListeners() {
    // 1. Hover Intent Trigger
    document.addEventListener('mouseover', (e) => {
      const trigger = e.target.closest('[data-hovercard-user]');
      if (trigger) {
        // If we are already on this target, ignore
        if (_currentTargetEl === trigger) return;

        const username = trigger.getAttribute('data-hovercard-user');
        if (username) {
          _currentTargetEl = trigger;
          scheduleShow(trigger, username);
        }
      }
    });

    // 2. Mouse Leave Trigger
    document.addEventListener('mouseout', (e) => {
      const trigger = e.target.closest('[data-hovercard-user]');
      if (trigger && _currentTargetEl === trigger) {
        scheduleHide();
      }
    });

    // 3. Click on trigger (e.g. user clicked avatar/name to go to profile) -> DISMISS IMMEDIATELY
    document.addEventListener('click', (e) => {
      const isInsideCard = _popoverEl && _popoverEl.contains(e.target);
      if (!isInsideCard) {
        forceHide();
      }
    }, { capture: true });

    // 4. Scroll on window or ANY container -> DISMISS IMMEDIATELY (no floating ghost cards)
    window.addEventListener('scroll', () => {
      forceHide();
    }, { passive: true, capture: true });

    // 5. Route changes, browser back/forward, tab switch, page blur
    window.addEventListener('popstate', forceHide);
    window.addEventListener('blur', forceHide);
    window.addEventListener('resize', forceHide, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) forceHide();
    });

    // 6. Keyboard Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') forceHide();
    });
  }

  // Expose Global Public API & Dismiss Hook
  window.UserHoverCard = {
    show: showHovercard,
    hide: forceHide,
    goToProfile,
    openFriends,
    startDirectChat,
    toggleFollow
  };

  // Global alias for modal engines
  window.closeHoverCard = forceHide;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHoverListeners);
  } else {
    initHoverListeners();
  }
})();
