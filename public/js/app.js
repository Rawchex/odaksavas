/* ============================================================
   APP.JS — Core: Auth, Routing, Violation Detection, Utils
   ============================================================ */

'use strict';

// ─── GLOBAL STATE ───────────────────────────────────────────
let currentUser   = null;
let activePage    = null;
let notifPollTimer = null;

// ─── VIOLATION DETECTION STATE (shared with timer.js) ───────
window._activeSession   = null;   // { id, partyId, startTime }
window._violationFired  = false;
window._blurTimer       = null;

// ============================================================
// PAGE VISIBILITY API — instant on iOS when screen locks / app switch & Auth Revalidation
// ============================================================
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (window._activeSession && !window._violationFired) {
      window._violationFired = true;
      if (typeof handleViolation === 'function') handleViolation('EKRAN KAPANDI');
    }
  } else {
    // Re-validate user authentication when returning to app to prevent user session bleed/caching
    checkAuth(true);
  }
});

// window.blur — catches app switching on some browsers
window.addEventListener('blur', () => {
  if (window._activeSession && !window._violationFired) {
    // Small debounce — some browsers fire blur on focus loss to address bar
    window._blurTimer = setTimeout(() => {
      if (!document.hasFocus() && window._activeSession && !window._violationFired) {
        window._violationFired = true;
        if (typeof handleViolation === 'function') handleViolation('UYGULAMA BIRAKILDI');
      }
    }, 800);
  }
});

window.addEventListener('focus', () => {
  clearTimeout(window._blurTimer);
});

// page reload preserves active session, no beforeunload listener needed

// ============================================================
// INIT
// ============================================================
(async function init() {
  // Check if we left a session open last time (tab/browser closed)
  const pendingViolation = localStorage.getItem('os_violation_pending');
  if (pendingViolation) {
    localStorage.removeItem('os_violation_pending');
    // Already ended via sendBeacon — just show a note next login
    sessionStorage.setItem('os_show_violation_note', '1');
  }

  await checkAuth();

  // Handle URL invite code link (?join=CODE)
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('join');
  if (joinCode) {
    window.history.replaceState({}, document.title, window.location.pathname);
    fetch('/api/parties/join-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: joinCode })
    }).then(r => r.json()).then(d => {
      if (d.success) {
        setTimeout(() => {
          showToast('Davet bağlantısı ile odaya katıldınız!');
          if (typeof setActiveParty === 'function') setActiveParty(d.partyId);
        }, 1000);
      }
    }).catch(() => {});
  }
})();

// ============================================================
// AUTH
// ============================================================
async function checkAuth(silent = false) {
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const user = await res.json();
      if (currentUser && currentUser.id !== user.id) {
        // User mismatch detected (e.g., another user logged in on backend), force fresh reload
        currentUser = user;
        location.reload();
        return;
      }
      currentUser = user;
      if (!silent) showMainApp();
    } else {
      if (currentUser) {
        currentUser = null;
        location.reload();
      } else {
        showLogin();
      }
    }
  } catch {
    if (!silent) showLogin();
  }
}

function showLogin() {
  const loginEl = document.getElementById('loginScreen');
  if (loginEl) {
    loginEl.classList.add('active');
    loginEl.style.setProperty('display', 'flex', 'important');
  }
  const mainAppEl = document.getElementById('mainApp');
  if (mainAppEl) mainAppEl.style.display = 'none';

  // Check if first time visiting — if so, show register modal immediately over landing page
  const hasVisited = localStorage.getItem('blunk_visited');
  if (!hasVisited) {
    localStorage.setItem('blunk_visited', '1');
    setTimeout(() => {
      openRegisterModal();
    }, 150);
  }

  // Focus input & initialize GSI
  setTimeout(() => {
    const inp = document.getElementById('usernameInput');
    if (inp) inp.focus();
    initGoogleSignIn();
  }, 100);
}

// ─── GOOGLE AUTH INTEGRATION ─────────────────────────────────
let _googleGsiInitialized = false;

function initGoogleSignIn() {
  const clientId = window.GOOGLE_CLIENT_ID;
  if (!clientId || clientId.includes('demo') || typeof google === 'undefined' || !google.accounts) {
    return; // Do not initialize with dummy/demo IDs to avoid Google console 403 errors
  }
  if (_googleGsiInitialized) return;

  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleAuthCallback,
      auto_select: false,
      use_fedcm_for_prompt: true
    });
    _googleGsiInitialized = true;
  } catch (e) {
    console.warn('Google Sign-In init warn:', e);
  }
}

window.triggerGoogleSignIn = function() {
  const clientId = window.GOOGLE_CLIENT_ID;
  if (!clientId || clientId.includes('demo')) {
    if (typeof showToast === 'function') {
      showToast('Google ile Giriş yapabilmek için geçerli bir Google Client ID eklenmesi gerekmektedir.');
    }
    return;
  }

  if (typeof google === 'undefined' || !google.accounts) {
    if (typeof showToast === 'function') showToast('Google Giriş kütüphanesi yükleniyor, lütfen tekrar deneyin.');
    return;
  }

  try {
    if (!_googleGsiInitialized) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleAuthCallback,
        use_fedcm_for_prompt: true
      });
      _googleGsiInitialized = true;
    }
    google.accounts.id.prompt((notification) => {
      if (notification && notification.isNotDisplayed()) {
        const reason = notification.getNotDisplayedReason();
        if (reason === 'unregistered_origin') {
          console.warn(`Google Client ID yetkili kaynak uyarısı (${window.location.origin}).`);
          if (typeof showToast === 'function') {
            showToast(`Google Giriş için ${window.location.origin} adresi Google Cloud Console'da Yetkili Kaynak (Authorized Origin) olarak eklenmelidir.`);
          }
        }
      }
    });
  } catch (err) {
    console.error('Trigger Google Sign-In error:', err);
  }
};

async function handleGoogleAuthCallback(response) {
  if (!response || !response.credential) return;
  try {
    if (typeof showToast === 'function') showToast('Google ile giriş yapılıyor...');
    const regUsername = document.getElementById('regUsernameInput')?.value.trim() || '';
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential, username: regUsername })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      currentUser = data.user;
      if (typeof closeRegisterModal === 'function') closeRegisterModal();
      showMainApp();
      
      // If user was newly created (username contains '_') or user wants to set username
      if (data.isNewUser) {
        setTimeout(() => {
          if (typeof openProfileSettings === 'function') {
            openProfileSettings();
            if (typeof showToast === 'function') showToast('Hoş geldin! Lütfen kullanmak istediğin kullanıcı adını belirle.');
          }
        }, 500);
      } else {
        if (typeof showToast === 'function') showToast('Google ile başarıyla giriş yapıldı! Hoş geldin ' + (currentUser.username || ''));
      }
    } else {
      const errMsg = data.error || 'Google ile giriş başarısız.';
      showAuthAlert(errMsg, 'authAlertBox');
      showAuthAlert(errMsg, 'registerAlertBox');
    }
  } catch (err) {
    console.error('Google auth callback error:', err);
    showAuthAlert('Google girişi sırasında bir hata oluştu.', 'authAlertBox');
  }
}

function openRegisterModal() {
  hideAuthAlert('registerAlertBox');
  const modal = document.getElementById('registerModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  const inp = document.getElementById('regUsernameInput');
  if (inp) inp.focus();
}

function closeRegisterModal() {
  const modal = document.getElementById('registerModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  hideAuthAlert('registerAlertBox');
}

function showAuthAlert(msg, targetId = 'authAlertBox', type = 'error') {
  const alertBox = document.getElementById(targetId);
  if (!alertBox) return;
  alertBox.textContent = msg;
  alertBox.className = `auth-alert-box ${type === 'success' ? 'success' : ''}`;
  alertBox.style.display = 'block';
}

function hideAuthAlert(targetId = 'authAlertBox') {
  const alertBox = document.getElementById(targetId);
  if (alertBox) alertBox.style.display = 'none';
}

async function login() {
  hideAuthAlert('authAlertBox');
  const inp = document.getElementById('usernameInput');
  const passInp = document.getElementById('passwordInput');
  const username = inp ? inp.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') : '';
  const password = passInp ? passInp.value : '';

  if (!username) {
    showAuthAlert('Lütfen kullanıcı adınızı girin.', 'authAlertBox');
    return;
  }

  const btn = document.getElementById('loginSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'LÜTFEN BEKLEYİN...';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await res.json().catch(() => ({}));

    if (res.ok) {
      currentUser = d;
      showMainApp();
      if (d.needsPassword) {
        setTimeout(async () => {
          const newPass = await window.showPrompt('Hesabınızın güvenliği için bir şifre belirleyin (en az 6 karakter):');
          if (newPass && newPass.length >= 6) {
            const migrateRes = await fetch('/api/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newPassword: newPass })
            });
            if (migrateRes.ok) {
              showToast('Şifreniz başarıyla kaydedildi!');
            }
          }
        }, 1200);
      }
    } else {
      showAuthAlert(d.error || 'Kullanıcı adı veya şifre hatalı.', 'authAlertBox');
    }
  } catch {
    showAuthAlert('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 'authAlertBox');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'GİRİŞ YAP';
    }
  }
}

async function register() {
  hideAuthAlert('registerAlertBox');
  const inp = document.getElementById('regUsernameInput');
  const emailInp = document.getElementById('regEmailInput');
  const passInp = document.getElementById('regPasswordInput');
  const confirmInp = document.getElementById('regConfirmPasswordInput');

  const username = inp ? inp.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') : '';
  const email = emailInp ? emailInp.value.trim() : '';
  const password = passInp ? passInp.value : '';
  const confirmPassword = confirmInp ? confirmInp.value : '';

  if (!username || username.length < 3) {
    showAuthAlert('Kullanıcı adı en az 3 karakter olmalı ve özel karakter içermemelidir.', 'registerAlertBox');
    return;
  }
  if (!password || password.length < 6) {
    showAuthAlert('Şifreniz en az 6 karakter olmalıdır.', 'registerAlertBox');
    return;
  }
  if (password !== confirmPassword) {
    showAuthAlert('Girdiğiniz şifreler birbiriyle eşleşmiyor! Lütfen kontrol edin.', 'registerAlertBox');
    return;
  }

  const btn = document.getElementById('regSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'LÜTFEN BEKLEYİN...';
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const d = await res.json().catch(() => ({}));

    if (res.ok) {
      currentUser = d;
      closeRegisterModal();
      showMainApp();
      showToast('BLUNK dünyasına hoş geldin!');
    } else {
      showAuthAlert(d.error || 'Kayıt gerçekleştirilemedi.', 'registerAlertBox');
    }
  } catch {
    showAuthAlert('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 'registerAlertBox');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'KAYIT OL';
    }
  }
}

// ─── HIGH-PERFORMANCE INTERACTIVE BLUNK CANVAS PARTICLES & MOUSE EFFECT ───
(function initBlunkCanvasEngine() {
  const canvas = document.getElementById('blunkCanvasBg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width, height;
  let mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', (e) => {
    mouse.targetX = e.clientX;
    mouse.targetY = e.clientY;

    const bg = document.getElementById('blunkParallaxBg');
    if (bg) {
      const x = (e.clientX / window.innerWidth - 0.5) * 45;
      const y = (e.clientY / window.innerHeight - 0.5) * 45;
      bg.style.transform = `rotate(-12deg) scale(1.1) translate(${x}px, ${y}px)`;
    }
  });

  // Floating BLUNK Particle Class
  class Particle {
    constructor() {
      this.reset(true);
    }
    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + 50;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -(0.3 + Math.random() * 0.5);
      this.size = 14 + Math.random() * 26;
      this.alpha = 0.04 + Math.random() * 0.08;
      this.baseAlpha = this.alpha;
      this.angle = (Math.random() - 0.5) * 0.4;
      this.text = 'BLUNK';
      this.glow = 0;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Mouse interactive reaction (Repulsion + Glow)
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = 180;

      if (dist < minDist) {
        const force = (minDist - dist) / minDist;
        const angle = Math.atan2(dy, dx);
        this.x += Math.cos(angle) * force * 3;
        this.y += Math.sin(angle) * force * 3;
        this.alpha = Math.min(0.4, this.baseAlpha + force * 0.35);
        this.glow = force * 15;
      } else {
        this.alpha += (this.baseAlpha - this.alpha) * 0.05;
        this.glow += (0 - this.glow) * 0.05;
      }

      if (this.y < -60 || this.x < -100 || this.x > width + 100) {
        this.reset(false);
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      ctx.font = `900 ${this.size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.glow > 0.5) {
        ctx.shadowColor = 'rgba(88, 101, 242, 0.8)';
        ctx.shadowBlur = this.glow;
        ctx.fillStyle = `rgba(168, 85, 247, ${this.alpha})`;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
      }

      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  const particles = Array.from({ length: 32 }, () => new Particle());

  function animate() {
    ctx.clearRect(0, 0, width, height);

    mouse.x += (mouse.targetX - mouse.x) * 0.1;
    mouse.y += (mouse.targetY - mouse.y) * 0.1;

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animate);
  }
  animate();
})();

async function logout() {
  if (window._activeSession) {
    if (!(await window.showConfirm('Aktif oturum var, çıkmak oturumu iptal eder. Devam?'))) return;
    await endSession(true);
  }
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  stopNotifPoll();
  if (typeof stopChatPolling === 'function') stopChatPolling();
  location.reload();
}

function showMainApp() {
  const loginEl = document.getElementById('loginScreen');
  if (loginEl) {
    loginEl.classList.remove('active');
    loginEl.style.setProperty('display', 'none', 'important');
  }
  const mainAppEl = document.getElementById('mainApp');
  if (mainAppEl) mainAppEl.style.display = 'block';

  // Show violation note if any
  if (sessionStorage.getItem('os_show_violation_note')) {
    sessionStorage.removeItem('os_show_violation_note');
    setTimeout(() => showToast('Son oturumun ihlalle sonlandı'), 1000);
  }

  handleInitialUrlRoute();
  if (typeof window.startFocusRoomOnboarding === 'function') window.startFocusRoomOnboarding();
  startNotifPoll();
  updateTimerStats();
  startHeartbeat();
  updateTotalUnreadMessageCount();

  // Check if there was an active session (browser re-open)
  if (typeof checkActiveSession === 'function') checkActiveSession();
  if (typeof checkActiveParty === 'function') checkActiveParty();
  if (typeof checkUnratedSession === 'function') checkUnratedSession();

  checkPushPermission();
  updatePresenceUI();
}

function detectDeviceType() {
  const ua = navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)); // iPadOS
  return isMobile ? 'mobile' : 'desktop';
}

function reportDeviceType() {
  const device_type = detectDeviceType();
  fetch('/api/me/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_type })
  }).catch(() => {});
}

function startHeartbeat() {
  reportDeviceType(); // Report device on load
  const sendHb = () => {
    if (currentUser) {
      fetch('/api/me/heartbeat', { method: 'PATCH' }).catch(()=>{});
    }
  };
  sendHb();
  setInterval(sendHb, 15000);

  // Send instant offline signal when closing browser or navigating away
  const sendOffline = () => {
    if (currentUser && navigator.sendBeacon) {
      navigator.sendBeacon('/api/me/offline');
    }
  };
  window.addEventListener('beforeunload', sendOffline);
  window.addEventListener('pagehide', sendOffline);
}


// --- PUSH NOTIFICATION LOGIC ---
async function checkPushPermission() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!currentUser) return;

  try {
    const res = await fetch('/api/notifications/is-subscribed');
    const data = await res.json();
    if (data.subscribed) {
      registerServiceWorkerAndSubscribe();
      return;
    }
  } catch (e) {
    console.error('Subscription check failed', e);
  }

  const dismissed = localStorage.getItem('os_push_prompt_dismissed_' + currentUser.username);
  if (dismissed) return;

  if (Notification.permission === 'default') {
    const modal = document.getElementById('pushPermissionModal');
    if (modal) modal.classList.add('open');
  } else if (Notification.permission === 'granted') {
    registerServiceWorkerAndSubscribe();
  }
}

function closePushPermissionModal() {
  const modal = document.getElementById('pushPermissionModal');
  if (modal) modal.classList.remove('open');
  if (currentUser) {
    localStorage.setItem('os_push_prompt_dismissed_' + currentUser.username, '1');
  }
}

async function requestPushPermission() {
  const modal = document.getElementById('pushPermissionModal');
  if (modal) modal.classList.remove('open');
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    registerServiceWorkerAndSubscribe();
    showToast('Bildirimler açıldı!');
  }
}

async function registerServiceWorkerAndSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    if (!registration || !registration.pushManager) return;
    const vapidRes = await fetch('/api/notifications/vapidPublicKey');
    if (!vapidRes.ok) return;
    const vapidPublicKey = await vapidRes.text();
    
    let subscription = await registration.pushManager.getSubscription().catch(() => null);
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      }).catch(() => null);
    }
    if (!subscription) return;

    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    }).catch(() => {});
  } catch (err) {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

// ─── UTILS ───────────────────────────────────────────────────============================================================
// PAGE ROUTING
// ============================================================
let _previousPage = 'timer';

function getPathForPage(pageName, subPath = '') {
  const map = {
    timer: '/sayac',
    messages: '/mesajlar',
    feed: '/feed',
    leaderboard: '/siralama',
    notifications: '/bildirimler',
    profile: '/profil'
  };
  let base = map[pageName] || '/sayac';
  if (subPath) {
    base += '/' + encodeURIComponent(subPath);
  }
  return base;
}

function syncUrlState(pageName, subPath = '', replace = false) {
  const targetUrl = getPathForPage(pageName, subPath);
  if (window.location.pathname !== targetUrl) {
    if (replace) {
      history.replaceState({ pageName, subPath }, '', targetUrl);
    } else {
      history.pushState({ pageName, subPath }, '', targetUrl);
    }
  }
}

function showPage(name, pushState = true, subPath = '') {
  // Hide userProfilePage if switching main pages
  document.getElementById('userProfilePage').style.display = 'none';

  // Clean up mobile chat view states if leaving messages/chat
  if (name !== 'messages') {
    if (typeof closeChatArea === 'function') closeChatArea();
    document.body.classList.remove('chat-active');
  }

  // Auto-collapse party overlay when leaving timer page
  const overlay = document.getElementById('partyFocusOverlay');
  if (overlay && overlay.classList.contains('in-active-party')) {
    if (name !== 'timer') {
      if (!overlay.classList.contains('collapsed') && typeof togglePartyFocusOverlay === 'function') {
        togglePartyFocusOverlay();
      }
    }
  }

  const oldPage = document.querySelector('.page.active');
  const newPage = document.getElementById(name + 'Page');
  if (!newPage) return;
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) navBtn.classList.add('active');

  _previousPage = activePage || 'timer';
  activePage = name;

  if (pushState) {
    syncUrlState(name, subPath);
  }

  if (name === 'feed')          loadFeed();
  if (name === 'leaderboard')   loadLeaderboard();
  if (name === 'notifications') loadNotifications();
  if (name === 'profile')       loadMyProfile();
  if (name === 'messages')      initMessagesPage();

  if (oldPage && oldPage !== newPage) {
    oldPage.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    oldPage.style.opacity = '0';
    oldPage.style.transform = 'translateY(-10px)';
    
    setTimeout(() => {
      oldPage.classList.remove('active');
      oldPage.style.opacity = '';
      oldPage.style.transform = '';
      
      newPage.classList.add('active');
      newPage.style.opacity = '0';
      newPage.style.transform = 'translateY(10px)';
      newPage.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      
      newPage.offsetHeight;
      newPage.style.opacity = '1';
      newPage.style.transform = 'translateY(0)';
    }, 250);
  } else {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    newPage.classList.add('active');
    newPage.style.opacity = '1';
    newPage.style.transform = '';
  }
}

function handleInitialUrlRoute() {
  const rawPath = window.location.pathname.trim();
  const path = rawPath.toLowerCase();
  const parts = path.split('/').filter(Boolean);
  const rawParts = rawPath.split('/').filter(Boolean);
  
  if (parts.length === 0 || parts[0] === 'sayac') {
    showPage('timer', false);
  } else if (parts[0] === 'mesajlar') {
    showPage('messages', false);
    if (parts[1]) {
      const target = decodeURIComponent(rawParts[1]);
      setTimeout(() => {
        if (target.startsWith('group_')) {
          const groupId = parseInt(target.replace('group_', ''));
          if (groupId && typeof openGroupChat === 'function') openGroupChat(groupId);
        } else {
          if (typeof openDirectChat === 'function') openDirectChat(target);
        }
      }, 350);
    }
  } else if (parts[0] === 'feed') {
    showPage('feed', false);
  } else if (parts[0] === 'siralama' || parts[0] === 'sira') {
    showPage('leaderboard', false);
  } else if (parts[0] === 'bildirimler') {
    showPage('notifications', false);
  } else if (parts[0] === 'profil') {
    showPage('profile', false);
  } else if (parts[0] === 'u' && parts[1]) {
    const targetUser = decodeURIComponent(rawParts[1]);
    showPage('timer', false);
    setTimeout(() => {
      if (typeof openUserPage === 'function') openUserPage(targetUser);
    }, 350);
  } else if (parts.length > 0) {
    const reservedRoutes = ['sayac', 'mesajlar', 'feed', 'siralama', 'sira', 'bildirimler', 'profil', 'u', 'api', 'uploads', 'css', 'js', 'audio'];
    if (!reservedRoutes.includes(parts[0])) {
      const username = decodeURIComponent(rawParts[0]).replace(/^@/, '');
      showPage('timer', false);
      setTimeout(() => {
        if (typeof openUserPage === 'function') openUserPage(username);
      }, 350);
    } else {
      showPage('timer', false);
    }
  } else {
    showPage('timer', false);
  }
}

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.pageName) {
    showPage(e.state.pageName, false, e.state.subPath || '');
    if (e.state.pageName === 'messages' && e.state.subPath) {
      const target = e.state.subPath;
      if (target.startsWith('group_')) {
        const groupId = parseInt(target.replace('group_', ''));
        if (groupId && typeof openGroupChat === 'function') openGroupChat(groupId);
      } else {
        if (typeof openDirectChat === 'function') openDirectChat(target);
      }
    }
  } else {
    handleInitialUrlRoute();
  }
});

// ============================================================
// LEADERBOARD
// ============================================================
window._lbUsersCache = [];

async function loadLeaderboard() {
  const lbRes = await fetch('/api/leaderboard');
  if (!lbRes.ok) return;
  const users = await lbRes.json();
  window._lbUsersCache = users || [];

  const myIdx = users.findIndex(u => u.username === currentUser?.username);
  const myRank = myIdx + 1;

  // Personal Rank Status Card (Matching site card style)
  const hero = document.getElementById('myRankHero');
  if (myRank > 0) {
    const me = users[myIdx];
    hero.innerHTML = `
      <div style="margin: 16px 16px 12px; padding: 16px; background: var(--card2); border: 1px solid var(--border); border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${renderAvatar(me, 'avatar avatar-md')}
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:15px; font-weight:700; color:var(--text);">@${esc(me.username)}</span>
              <span style="font-size:10px; font-weight:700; padding:2px 6px; background:rgba(255,255,255,0.1); color:var(--text-2); border-radius:4px;">SEN</span>
            </div>
            <div style="font-size:12px; color:var(--text-2); margin-top:2px;">
              Seviye ${me.level || 1} · Toplam Odak: <strong style="color:var(--text);">${fmtTime(me.total_focus_time)}</strong>
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:0.5px;">SIRANIZ</div>
          <div style="font-size:20px; font-weight:800; color:var(--text);">#${myRank}</div>
        </div>
      </div>
    `;
  } else {
    hero.innerHTML = '';
  }

  const list = document.getElementById('leaderboardList');
  if (!users.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-2);"><div class="empty-title">Henüz sıralamada kimse yok</div></div>';
    return;
  }

  // Top 3 Cards (If users >= 3)
  let podiumHtml = '';
  const hasPodium = users.length >= 3;
  if (hasPodium) {
    const p1 = users[0];
    const p2 = users[1];
    const p3 = users[2];

    podiumHtml = `
      <div style="display:flex; align-items:stretch; gap:10px; margin: 12px 16px 16px;">
        
        <!-- #2 -->
        <div onclick="openUserModal('${esc(p2.username)}')" style="flex:1; display:flex; flex-direction:column; align-items:center; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:16px 10px; cursor:pointer; position:relative; box-sizing:border-box;">
          <div style="position:absolute; top:10px; left:12px; font-size:11px; font-weight:800; color:var(--text-2);">#2</div>
          <div style="margin-top:6px;">
            ${renderAvatar(p2, 'avatar avatar-md')}
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--text); margin-top:8px; text-align:center; overflow:hidden; text-overflow:ellipsis; width:100%; white-space:nowrap;">@${esc(p2.username)}</div>
          <div style="font-size:11px; color:var(--text-2); margin-top:2px;">Seviye ${p2.level || 1}</div>
          <div style="font-size:12px; color:var(--text); margin-top:8px; font-weight:700;">${fmtTime(p2.total_focus_time)}</div>
        </div>

        <!-- #1 -->
        <div onclick="openUserModal('${esc(p1.username)}')" style="flex:1.05; display:flex; flex-direction:column; align-items:center; background:var(--card2); border:1px solid var(--border); border-radius:var(--radius); padding:18px 12px; cursor:pointer; position:relative; box-sizing:border-box;">
          <div style="position:absolute; top:10px; left:12px; font-size:11px; font-weight:800; color:var(--text);">#1</div>
          <div style="margin-top:6px;">
            ${renderAvatar(p1, 'avatar avatar-lg')}
          </div>
          <div style="font-size:14px; font-weight:800; color:var(--text); margin-top:8px; text-align:center; overflow:hidden; text-overflow:ellipsis; width:100%; white-space:nowrap;">@${esc(p1.username)}</div>
          <div style="font-size:11px; color:var(--text-2); margin-top:2px;">Seviye ${p1.level || 1}</div>
          <div style="font-size:13px; color:var(--text); margin-top:8px; font-weight:800;">${fmtTime(p1.total_focus_time)}</div>
        </div>

        <!-- #3 -->
        <div onclick="openUserModal('${esc(p3.username)}')" style="flex:1; display:flex; flex-direction:column; align-items:center; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:16px 10px; cursor:pointer; position:relative; box-sizing:border-box;">
          <div style="position:absolute; top:10px; left:12px; font-size:11px; font-weight:800; color:var(--text-2);">#3</div>
          <div style="margin-top:6px;">
            ${renderAvatar(p3, 'avatar avatar-md')}
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--text); margin-top:8px; text-align:center; overflow:hidden; text-overflow:ellipsis; width:100%; white-space:nowrap;">@${esc(p3.username)}</div>
          <div style="font-size:11px; color:var(--text-2); margin-top:2px;">Seviye ${p3.level || 1}</div>
          <div style="font-size:12px; color:var(--text); margin-top:8px; font-weight:700;">${fmtTime(p3.total_focus_time)}</div>
        </div>

      </div>
    `;
  }

  // Live Desktop Search Bar (Matching site input style)
  const searchBarHtml = `
    <div style="margin: 0 16px 12px; position: relative;">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" stroke-width="2" width="16" height="16" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); pointer-events: none;">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="lbSearchInput" class="mono-input" placeholder="Kullanıcı ara..." oninput="filterLeaderboardList(this.value)" style="padding-left: 38px !important; background: var(--card) !important; border: 1px solid var(--border) !important; border-radius: var(--radius) !important; height: 40px !important; font-size: 13px !important; color: var(--text) !important; width: 100% !important; box-sizing: border-box !important;">
    </div>
  `;

  // Start table list from #4 if top 3 podium exists
  const tableUsers = hasPodium ? users.slice(3) : users;

  const listRowsContainerHtml = `
    <div style="margin: 0 16px 20px; display:flex; flex-direction:column; gap:8px;">
      <div id="lbRowsContainer" style="display:flex; flex-direction:column; gap:6px;">
        ${renderLeaderboardRows(tableUsers)}
      </div>
    </div>
  `;

  list.innerHTML = podiumHtml + searchBarHtml + listRowsContainerHtml;
}

function renderLeaderboardRows(usersList) {
  if (!usersList || !usersList.length) {
    return '<div style="text-align:center; padding:24px; color:var(--text-2); font-size:12px; font-weight:600;">KULLANICI BULUNAMADI</div>';
  }

  return usersList.map((u, i) => {
    const originalRank = (window._lbUsersCache || []).findIndex(orig => orig.username === u.username) + 1 || (i + 1);
    const isMe = u.username === currentUser?.username;

    return `
      <div class="user-rank-card ${isMe ? 'is-me' : ''}" onclick="openUserModal('${esc(u.username)}')" style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:var(--card); border:1px solid ${isMe ? 'rgba(255,255,255,0.25)' : 'var(--border)'}; border-radius:var(--radius); cursor:pointer; transition:all 0.15s ease;">
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          <div style="font-size:12px; font-weight:800; width:24px; color:var(--text-2); text-align:center;">
            #${originalRank}
          </div>
          ${renderAvatar(u, 'avatar avatar-sm')}
          <div style="min-width:0;">
            <div style="font-size:13px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">@${esc(u.username)}</span>
              ${isMe ? '<span style="font-size:9px; font-weight:700; padding:1px 5px; background:rgba(255,255,255,0.15); color:var(--text); border-radius:4px; flex-shrink:0;">SEN</span>' : ''}
            </div>
            <div style="font-size:11px; color:var(--text-2); margin-top:2px;">Seviye ${u.level || 1}</div>
          </div>
        </div>
        <div style="font-size:13px; font-weight:700; color:var(--text); flex-shrink:0;">
          ${fmtTime(u.total_focus_time)}
        </div>
      </div>
    `;
  }).join('');
}

function filterLeaderboardList(query) {
  const q = (query || '').toLowerCase().trim();
  const listContainer = document.getElementById('lbRowsContainer');
  if (!listContainer) return;

  const allUsers = window._lbUsersCache || [];
  const hasPodium = allUsers.length >= 3;

  let filtered = allUsers;
  if (q) {
    filtered = allUsers.filter(u => u.username.toLowerCase().includes(q));
  } else if (hasPodium) {
    filtered = allUsers.slice(3);
  }

  listContainer.innerHTML = renderLeaderboardRows(filtered);
}

// ============================================================
// NOTIFICATIONS
// ============================================================
async function loadNotifications() {
  const res = await fetch('/api/notifications');
  const notifs = await res.json();

  // Mark as read
  fetch('/api/notifications/read', { method: 'POST' });
  document.getElementById('notifDot').classList.remove('show');

  const list = document.getElementById('notificationsList');
  if (!notifs.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-title">Bildirim yok</div></div>';
    return;
  }

  list.innerHTML = notifs.map(n => {
    const text = notifText(n);
    // Inline action buttons for friend_request type
    let inlineActions = '';
    if (n.type === 'friend_request' && n.friendship_id) {
      inlineActions = `
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="mono-btn-primary" style="flex:1;height:30px;font-size:10px;padding:0 8px;margin:0"
            onclick="acceptFriendFromNotif(event,${n.friendship_id},'${esc(n.username)}')">KABUL ET</button>
          <button class="mono-btn-danger" style="flex:1;height:30px;font-size:10px;padding:0 8px;margin:0"
            onclick="rejectFriendFromNotif(event,${n.friendship_id})">REDDET</button>
        </div>`;
    }
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" style="position:relative;display:flex;align-items:center;justify-content:space-between;padding:10px 14px">
        <div style="flex:1;display:flex;align-items:flex-start;gap:10px;cursor:pointer" onclick="handleNotifClick('${esc(n.username)}', '${n.type}', ${n.post_id || null}, ${n.party_id || null})">
          ${renderAvatar({ username: n.username, profile_photo: n.profile_photo }, 'avatar avatar-sm')}
          <div class="notif-body" style="flex:1">
            <div class="notif-text">${text}</div>
            <div class="notif-time">${fmtPostTime(n.created_at)}</div>
            ${inlineActions}
          </div>
        </div>
        <button onclick="deleteNotif(event, ${n.id})" style="background:none;border:none;color:#444;cursor:pointer;padding:8px 12px;font-size:12px;z-index:10;font-weight:bold">✕</button>
      </div>`;
  }).join('');
}

async function acceptFriendFromNotif(e, friendshipId, username) {
  e.stopPropagation();
  const res = await fetch(`/api/friends/accept/${friendshipId}`, { method: 'POST' });
  if (res.ok) {
    showToast(`${username} ile artık arkadaşsın! 🎉`);
    loadNotifications();
    if (typeof refreshPartyModal === 'function') refreshPartyModal();
  } else {
    showToast('İşlem başarısız');
  }
}

async function rejectFriendFromNotif(e, friendshipId) {
  e.stopPropagation();
  const res = await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Arkadaşlık isteği reddedildi');
    loadNotifications();
  }
}

function notifText(n) {
  const u = `<strong>${esc(n.username)}</strong>`;
  switch (n.type) {
    case 'post_like':     return `${u} gönderini beğendi`;
    case 'post_comment':  return `${u} gönderine yorum yaptı`;
    case 'post_repost':   return `${u} gönderini yeniden paylaştı`;
    case 'comment_like':  return `${u} yorumunu beğendi`;
    case 'friend_request':return `${u} sana arkadaşlık isteği gönderdi`;
    case 'friend_accept': return `${u} arkadaşlık isteğini kabul etti`;
    case 'party_invite':  return `${u} seni bir partiye davet etti`;
    case 'party_join':    return `${u} partine katıldı`;
    case 'message':       return `${u} sana mesaj gönderdi`;
    default:              return `${u} bir şey yaptı`;
  }
}

function handleNotifClick(username, type, postId, partyId) {
  if (type === 'party_invite') {
    if (typeof openPartyModal === 'function') openPartyModal();
  } else if (type === 'message' && username) {
    showPage('messages');
    openDirectChat(username);
  } else if (['post_like', 'post_comment', 'post_repost'].includes(type) && postId && postId !== 'null') {
    showPage('feed');
    if (typeof openSharedPostInFeed === 'function') openSharedPostInFeed(parseInt(postId));
  } else if (username) {
    openUserPage(username);
  }
}


async function deleteNotif(e, id) {
  e.stopPropagation();
  const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  if (res.ok) {
    loadNotifications();
  }
}

async function markAllNotificationsRead() {
  await fetch('/api/notifications/read', { method: 'POST' });
  const dot = document.getElementById('notifDot');
  if (dot) dot.classList.remove('show');
  if (typeof loadNotifications === 'function') loadNotifications();
  if (typeof showToast === 'function') showToast('Tüm bildirimler okundu olarak işaretlendi');
}

async function clearAllNotifications() {
  try {
    const res = await fetch('/api/notifications/clear-all', { method: 'DELETE' });
    if (res.ok) {
      const dot = document.getElementById('notifDot');
      if (dot) dot.classList.remove('show');
      if (typeof loadNotifications === 'function') loadNotifications();
      if (typeof showToast === 'function') showToast('Tüm bildirimler temizlendi');
    }
  } catch(e){}
}

// Notification polling every 30s
function startNotifPoll() {
  checkNotifCount();
  notifPollTimer = setInterval(checkNotifCount, 30000);
}
function stopNotifPoll() {
  clearInterval(notifPollTimer);
}
async function checkNotifCount() {
  try {
    const res = await fetch('/api/notifications/unread');
    const { count } = await res.json();
    const dot = document.getElementById('notifDot');
    if (count > 0) dot.classList.add('show');
    else dot.classList.remove('show');
  } catch {}
}

// ============================================================
// USER PROFILE PAGE (full-screen)
// ============================================================
let _userPageActiveTab = 'posts';
let _userPageData = null;

async function openUserPage(username, tab = 'posts') {
  if (username === currentUser?.username) {
    showPage('profile');
    return;
  }

  // Update URL without page reload (use clean /username format)
  const url = new URL(window.location);
  url.searchParams.delete('u');
  url.pathname = `/${username}`;
  window.history.pushState({}, '', url);

  _userPageActiveTab = tab;
  const page = document.getElementById('userProfilePage');
  const content = document.getElementById('userPageContent');
  const title = document.getElementById('userPageTitle');

  // Show page overlay
  page.style.display = 'flex';
  page.style.flexDirection = 'column';
  page.style.position = 'fixed';
  page.style.inset = '0';
  page.style.zIndex = '10000';
  page.style.background = '#000';
  page.style.overflowY = 'auto';
  title.textContent = username;
  content.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';

  try {
    const res = await fetch(`/api/users/${username}`);
    if (!res.ok) throw new Error();
    const user = await res.json();
    _userPageData = user;
    renderUserPage(user);
  } catch {
    content.innerHTML = '<div class="empty-state"><div class="empty-title">Kullan\u0131c\u0131 bulunamad\u0131</div></div>';
  }
}

// Alias for backward compatibility
function openUserModal(username) { openUserPage(username); }

function closeUserPage() {
  const page = document.getElementById('userProfilePage');
  if (page) page.style.display = 'none';
  const headerActionsEl = document.getElementById('userPageHeaderActions');
  if (headerActionsEl) headerActionsEl.innerHTML = '';

  // Clean profile URL format back to root if needed
  if (window.location.pathname !== '/' && window.location.pathname !== '') {
    try {
      const url = new URL(window.location);
      url.pathname = '/';
      window.history.pushState({}, '', url);
    } catch(e) {}
  }

  // Strictly hide focus room overlay if not in an active party
  const overlay = document.getElementById('partyFocusOverlay');
  if (overlay) {
    const activePartyId = window._currentPartyId || (typeof _currentPartyId !== 'undefined' ? _currentPartyId : null);
    if (!activePartyId) {
      overlay.classList.remove('in-active-party');
      overlay.style.display = 'none';
      overlay.style.setProperty('display', 'none', 'important');
    }
  }
}

function renderUserPage(user) {
  const content = document.getElementById('userPageContent');
  const isMe = user.username === currentUser.username;
  const progress = (typeof getLevelProgress === 'function') ? getLevelProgress(user.xp || 0) : { percentage: 0, xpInLevel: 0, xpNeededForNext: 100 };
  const posts = user.posts || [];
  const sessions = user.sessions || [];
  const reposts = user.reposts || [];
  _profileUserPosts = posts;
  _profileUserReposts = reposts;

  // Friendship action buttons for topbar top-right
  let actionBtnHtml = '';
  if (!isMe) {
    if (!user.friendship) {
      actionBtnHtml = `
        <button class="profile-action-icon-btn active" onclick="sendFriendReq('${esc(user.username)}')" data-tooltip="Arkadaş Ekle" data-tooltip-pos="bottom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/>
          </svg>
        </button>
        <button class="profile-action-icon-btn" onclick="closeUserPage();showPage('messages');openDirectChat('${esc(user.username)}')" data-tooltip="Mesaj Gönder" data-tooltip-pos="bottom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>`;
    } else if (user.friendship.status === 'accepted') {
      actionBtnHtml = `
        <button class="profile-action-icon-btn active" onclick="closeUserPage();showPage('messages');openDirectChat('${esc(user.username)}')" data-tooltip="Mesaj Gönder" data-tooltip-pos="bottom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button class="profile-action-icon-btn danger" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')" data-tooltip="Arkadaşlıktan Çıkar" data-tooltip-pos="bottom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="11" x2="23" y2="11"/>
          </svg>
        </button>`;
    } else if (user.friendship.status === 'pending') {
      if (user.friendship.sender_id === currentUser.id) {
        actionBtnHtml = `
          <button class="profile-action-icon-btn warning" disabled data-tooltip="İstek Gönderildi" data-tooltip-pos="bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button class="profile-action-icon-btn danger" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')" data-tooltip="İsteği İptal Et" data-tooltip-pos="bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>`;
      } else {
        actionBtnHtml = `
          <button class="profile-action-icon-btn active" onclick="acceptFriendReqFromModal(${user.friendship.id},'${esc(user.username)}')" data-tooltip="İsteği Kabul Et" data-tooltip-pos="bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button class="profile-action-icon-btn danger" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')" data-tooltip="İsteği Reddet" data-tooltip-pos="bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>`;
      }
    }
  }

  // Populate topbar top-right actions container
  const headerActionsEl = document.getElementById('userPageHeaderActions');
  if (headerActionsEl) {
    headerActionsEl.innerHTML = actionBtnHtml;
  }

  const isOnline = user.last_seen ? (new Date() - new Date(user.last_seen) < 120000) : false;

  // Tab content
  let tabHtml = '';
  if (_userPageActiveTab === 'posts') {
    tabHtml = posts.length === 0
      ? `<div class="profile-empty-tab">GÖNDERI YOK</div>`
      : `<div class="profile-post-grid">${posts.map(p => renderPostGridItem(p, false, false)).join('')}</div>`;
  } else if (_userPageActiveTab === 'sessions') {
    tabHtml = sessions.length === 0
      ? `<div class="profile-empty-tab">ODAK OTURUMU YOK</div>`
      : `<div class="profile-sessions-list">${sessions.slice(0,20).map(s => `
          <div class="session-row">
            <div>
              <div class="session-row-time">${fmtTime(s.duration||0)}</div>
              <div class="session-row-date">${fmtDate(s.start_time)}</div>
            </div>
            <div class="session-badge ${s.status==='completed'?'ok':'fail'}">${s.status==='completed'?'TAMAM':s.status==='violated'?'İHLAL':'TERK'}</div>
          </div>`).join('')}</div>`;
  } else if (_userPageActiveTab === 'reposts') {
    tabHtml = reposts.length === 0
      ? `<div class="profile-empty-tab">REPOST YOK</div>`
      : `<div class="profile-post-grid">${reposts.map(p => renderPostGridItem(p, false, true)).join('')}</div>`;
  }

  const titleEl = document.getElementById('userPageTitle');
  if (titleEl) titleEl.textContent = `@${user.username}`;

  content.innerHTML = `
    <div class="profile-insta-header">
      <div class="profile-insta-top">
        <div class="profile-insta-avatar-col">
          ${renderAvatar(user, 'avatar avatar-xl')}
        </div>
        <div class="profile-insta-stats-col">
          <div class="profile-stat-box" onclick="openUserPage('${esc(user.username)}','posts')" data-tooltip="Gönderiler">
            <div class="profile-insta-stat-val">${user.post_count || 0}</div>
            <div class="profile-insta-stat-lbl">Gönderi</div>
          </div>
          <div class="profile-stat-box" onclick="openFriendListModal('${esc(user.username)}', 'followers')" data-tooltip="Takipçileri Gör">
            <div class="profile-insta-stat-val">${user.follower_count || user.friend_count || 0}</div>
            <div class="profile-insta-stat-lbl">Takipçi</div>
          </div>
          <div class="profile-stat-box" onclick="openFriendListModal('${esc(user.username)}', 'following')" data-tooltip="Takip Edilenleri Gör">
            <div class="profile-insta-stat-val">${user.following_count || user.friend_count || 0}</div>
            <div class="profile-insta-stat-lbl">Takip</div>
          </div>
        </div>
      </div>

      <div class="profile-insta-meta">
        ${user.is_private ? '<div style="margin-bottom:8px"><span class="profile-private-dot">🔒 Gizli Hesap</span></div>' : ''}
        ${user.bio ? `<div class="profile-insta-bio">${esc(user.bio)}</div>` : ''}
        ${(user.height || user.weight) ? `
          <div class="profile-insta-details">
            ${user.height ? `<span>📏 ${user.height}cm</span>` : ''}
            ${user.weight ? `<span>⚖️ ${user.weight}kg</span>` : ''}
            <span>⏱️ ${fmtTime(user.total_focus_time||0)}</span>
          </div>` : ''}
        ${user.cv ? `<div class="up-cv">${esc(user.cv)}</div>` : ''}
        <div class="profile-xp-row" style="display:flex; align-items:center; gap:10px; margin-top:12px;">
          <span class="lvl-badge">LVL ${user.level}</span>
          <div class="xp-bar-wrap" style="height:4px;background:rgba(255,255,255,0.08);flex:1;border-radius:99px;overflow:hidden;">
            <div class="xp-bar-fill" style="width:${progress.percentage}%;background:linear-gradient(90deg, #a855f7, #ec4899);height:100%;border-radius:99px;"></div>
          </div>
          <span class="profile-xp-label" style="font-size:11px; font-weight:700; color:var(--text-3);">${progress.xpInLevel}/${progress.xpNeededForNext} XP</span>
        </div>
      </div>
    </div>

    ${user.is_locked ? `
      <div class="profile-locked-overlay">
        <div class="profile-locked-icon">🔒</div>
        <div class="profile-locked-title">Bu Hesap Gizli</div>
        <div class="profile-locked-desc">Gönderi ve istatistiklerini görmek için arkadaş olun.</div>
      </div>` : `
      <div class="profile-insta-tabs">
        <button class="profile-insta-tab ${_userPageActiveTab==='posts'?'active':''}" onclick="openUserPage('${esc(user.username)}','posts')" data-tooltip="Gönderiler" data-tooltip-pos="top">
          <svg viewBox="0 0 24 24" fill="${_userPageActiveTab==='posts'?'#ffffff':'none'}" stroke="${_userPageActiveTab==='posts'?'#ffffff':'#888888'}" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        </button>
        <button class="profile-insta-tab ${_userPageActiveTab==='sessions'?'active':''}" onclick="openUserPage('${esc(user.username)}','sessions')" data-tooltip="Odak Oturumları" data-tooltip-pos="top">
          <svg viewBox="0 0 24 24" fill="none" stroke="${_userPageActiveTab==='sessions'?'#ffffff':'#888888'}" stroke-width="2.2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        </button>
        <button class="profile-insta-tab ${_userPageActiveTab==='reposts'?'active':''}" onclick="openUserPage('${esc(user.username)}','reposts')" data-tooltip="Repostlar" data-tooltip-pos="top">
          <svg viewBox="0 0 24 24" fill="none" stroke="${_userPageActiveTab==='reposts'?'#ffffff':'#888888'}" stroke-width="2.2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
      </div>
      <div id="userPageTabContent">${tabHtml}</div>
    `}
  `;
}

// ============================================================
// FRIEND LIST MODAL
// ============================================================
let _flModalAllUsers = [];

async function openFriendListModal(username, type = 'followers') {
  const modal = document.getElementById('friendListModal');
  const title = document.getElementById('friendListTitle');
  const content = document.getElementById('friendListContent');
  if (!modal || !title || !content) return;

  let displayTitle = 'TAKİPÇİLER';
  if (type === 'following') displayTitle = 'TAKİP EDİLENLER';
  else if (type === 'friends') displayTitle = 'ARKADAŞLAR';

  title.textContent = `${displayTitle} (@${username})`;
  content.innerHTML = `
    <div style="padding:12px 16px 8px 16px;">
      <div class="share-search-box" style="margin:0 0 12px 0;">
        <input type="text" id="flSearchInput" autocomplete="off" placeholder="Kullanıcı ara..." oninput="filterFriendListModal(this.value)">
        <svg class="share-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
    </div>
    <div id="flUserItems" style="max-height: 380px; overflow-y: auto; padding: 0 16px;">
      <div class="loading-row">YÜKLENİYOR...</div>
    </div>
  `;
  modal.classList.add('open');

  try {
    const res = await fetch(`/api/users/${username}/friends`);
    const friends = await res.json();
    _flModalAllUsers = Array.isArray(friends) ? friends : [];
    renderFriendListItems(_flModalAllUsers);
  } catch {
    const container = document.getElementById('flUserItems');
    if (container) container.innerHTML = '<div class="profile-empty-tab">Liste yüklenemedi</div>';
  }
}

function filterFriendListModal(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderFriendListItems(_flModalAllUsers);
    return;
  }
  const filtered = _flModalAllUsers.filter(u => 
    (u.username && u.username.toLowerCase().includes(q)) || 
    (u.display_name && u.display_name.toLowerCase().includes(q))
  );
  renderFriendListItems(filtered);
}

function renderFriendListItems(users) {
  const container = document.getElementById('flUserItems');
  if (!container) return;

  if (!users || !users.length) {
    container.innerHTML = '<div class="profile-empty-tab" style="padding:32px 0;">KULLANICI BULUNAMADI</div>';
    return;
  }

  container.innerHTML = users.map(f => `
    <div class="fl-row" onclick="closeFriendListModal();openUserPage('${esc(f.username)}')" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; margin-bottom:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; cursor:pointer; transition:all 0.15s ease;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${renderAvatar(f, 'avatar avatar-md')}
        <div class="fl-info">
          <div class="fl-name" style="font-weight:800; color:#fff; font-size:13.5px;">${esc(f.display_name || f.username)}</div>
          <div class="fl-sub" style="font-size:11px; color:var(--text-3); font-weight:600;">@${esc(f.username)} &bull; LVL ${f.level || 1}</div>
        </div>
      </div>
      <button class="mono-btn-secondary" style="height:28px; padding:0 12px; font-size:10px; font-weight:700; border-radius:14px; margin:0;" onclick="event.stopPropagation();closeFriendListModal();openUserPage('${esc(f.username)}')">GÖR</button>
    </div>
  `).join('');
}

function closeFriendListModal() {
  document.getElementById('friendListModal').classList.remove('open');
}

// ============================================================
// FRIEND REQUEST
// ============================================================
async function sendFriendReq(username) {
  const res = await fetch(`/api/friends/request/${username}`, { method: 'POST' });
  if (res.ok) {
    showToast('Arkadaşlık isteği gönderildi');
    openUserPage(username);
    if (typeof refreshPartyModal === 'function') refreshPartyModal();
  } else {
    const d = await res.json();
    showToast(d.error || 'Hata');
  }
}

async function removeFriend(friendshipId, username) {
  const label = await window.showConfirm(`${username} ile arkadaşlık kaydını kaldır?`);
  if (!label) return;
  const res = await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Arkadaşlık kaldırıldı');
    openUserPage(username);
    if (typeof refreshPartyModal === 'function') refreshPartyModal();
  } else {
    showToast('İşlem başarısız');
  }
}

async function acceptFriendReqFromModal(friendshipId, username) {
  const res = await fetch(`/api/friends/accept/${friendshipId}`, { method: 'POST' });
  if (res.ok) {
    showToast(`${username} ile artık arkadaşsınız!`);
    openUserPage(username);
    if (typeof refreshPartyModal === 'function') refreshPartyModal();
  } else {
    showToast('Kabul edilemedi');
  }
}

// ============================================================
// TIMER STATS (called from timer.js too)
// ============================================================
function updateTimerStats() {
  if (!currentUser) return;
  document.getElementById('statTotal').textContent = fmtTime(currentUser.total_focus_time || 0);

  if (typeof getLevelProgress === 'function') {
    const progress = getLevelProgress(currentUser.xp || 0);
    document.getElementById('statLevel').textContent = 'LVL ' + progress.level;
    document.getElementById('xpBarFill').style.width = progress.percentage + '%';
    document.getElementById('xpText').textContent = `${progress.xpInLevel} / ${progress.xpNeededForNext} XP`;
  }
}

// ============================================================
// AVATAR HELPER
// ============================================================
function renderAvatar(user, classes = 'avatar avatar-sm') {
  let avatarHtml = '';
  if (user && user.profile_photo) {
    avatarHtml = `<img src="${user.profile_photo}" alt="${esc(user.username||'')}">`;
  } else {
    const init = (user && user.username) ? user.username[0].toUpperCase() : '?';
    avatarHtml = `<span class="avatar-initials">${init}</span>`;
  }

  // Handle status dot
  let statusDot = '';
  if (user && user.username) {
    const isOnline = Boolean(user.is_online) || (user.is_online === undefined && user.status && user.status !== 'offline' && user.status !== 'invisible');
    let color = '#747f8d'; // offline / invisible gray
    let status = 'offline';
    if (isOnline && user.status !== 'invisible') {
      status = user.status || 'online';
    }
    if (status === 'online') { color = '#23a55a'; }
    else if (status === 'away') { color = '#faa61a'; }
    else if (status === 'dnd') { color = '#f23f43'; }
    else { color = '#747f8d'; }

    let tooltip = '';
    if (window._statusTooltips) {
      const list = window._statusTooltips[status] || window._statusTooltips.offline;
      const template = list[window._statusTooltipIndex] || list[0];
      const usernameVal = `@${user.username}`;
      tooltip = template.replace(/@username/g, usernameVal);
    } else {
      const STATUS_TR = { online: 'çevrimiçi', away: 'uzakta', dnd: 'rahatsız etme', invisible: 'çevrimdışı', offline: 'çevrimdışı' };
      tooltip = `@${user.username} şu anda ${STATUS_TR[status] || 'çevrimdışı'}`;
    }

    // Determine dot size based on avatar classes
    let dotSize = 8;
    let borderSize = 2;
    if (classes.includes('avatar-xs')) { dotSize = 7; borderSize = 1.5; }
    else if (classes.includes('avatar-md')) { dotSize = 10; borderSize = 2; }
    else if (classes.includes('avatar-lg')) { dotSize = 14; borderSize = 2.5; }
    else if (classes.includes('avatar-xl')) { dotSize = 16; borderSize = 3; }

    statusDot = `<div class="status-online-dot" style="background:${color}; width:${dotSize}px; height:${dotSize}px; border-radius:50%; position:absolute; bottom:-1px; right:-1px; border:${borderSize}px solid #111214; z-index:5; pointer-events:auto;" data-tooltip="${esc(tooltip)}"></div>`;
  }

  return `<div class="avatar-container" style="position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
    <div class="${classes}">${avatarHtml}</div>
    ${statusDot}
  </div>`;
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2400) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  // Clean all emojis automatically
  const cleanMsg = (msg || '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/gu, '').trim();
  t.textContent = cleanMsg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

activePage = 'timer';

// ============================================================
window.showAlert = function(message) {
  return new Promise(resolve => {
    const msgEl = document.getElementById('customAlertMessage');
    const modal = document.getElementById('customAlertModal');
    if (msgEl) msgEl.textContent = message;
    if (modal) modal.classList.add('open');
    window._resolveAlert = () => {
      if (modal) modal.classList.remove('open');
      resolve();
    };
  });
};

window.showConfirm = function(message) {
  return new Promise(resolve => {
    document.getElementById('customConfirmMessage').textContent = message;
    document.getElementById('customConfirmModal').classList.add('open');
    window._resolveConfirm = (val) => {
      document.getElementById('customConfirmModal').classList.remove('open');
      resolve(val);
    };
  });
};

window.showPrompt = function(message, defaultVal = '') {
  return new Promise(resolve => {
    document.getElementById('customPromptMessage').textContent = message;
    const inp = document.getElementById('customPromptInput');
    inp.value = defaultVal;
    document.getElementById('customPromptModal').classList.add('open');
    inp.focus();
    window._resolvePrompt = (val) => {
      document.getElementById('customPromptModal').classList.remove('open');
      resolve(val);
    };
  });
};

// ============================================================
// UTILS
// ============================================================
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function fmtTime(secs) {
  secs = Math.floor(secs || 0);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h} sa ${m} dk ${s} sn`;
  }
  if (m > 0) {
    return `${m} dk ${s} sn`;
  }
  return `${s} sn`;
}

function fmtTimeClock(secs) {
  secs = Math.floor(secs || 0);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function fmtPostTime(str) {
  if (!str) return '';
  const diff = Math.floor((Date.now() - new Date(str)) / 1000);
  if (diff < 60)     return 'şimdi';
  if (diff < 3600)   return `${Math.floor(diff/60)}dk`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}s`;
  if (diff < 604800) return `${Math.floor(diff/86400)}g`;
  return new Date(str).toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
}

// Keyboard shortcut: Enter to login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'usernameInput') login();
});

// Global E2EE client encryption helpers
function encryptText(text, key) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return '[E2EE]' + btoa(unescape(encodeURIComponent(result)));
}

function decryptText(cipherText, key) {
  if (!cipherText) return '';
  if (!cipherText.startsWith('[E2EE]')) return cipherText;
  
  try {
    const base64Data = cipherText.substring(6);
    const decoded = decodeURIComponent(escape(atob(base64Data)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (err) {
    return cipherText;
  }
}

// --- GLOBAL PRESENCE SELECTOR ---
function openStatusSelector() {
  const chip = document.getElementById('timerStatusChip');
  if (chip && chip.classList.contains('state-focus')) return;

  const overlay = document.getElementById('statusPopoverOverlay');
  const menu    = document.getElementById('statusPopoverMenu');
  if (!overlay || !menu) return;

  // Populate header
  if (currentUser) {
    const avatar = document.getElementById('spmAvatar');
    const name   = document.getElementById('spmDisplayName');
    const handle = document.getElementById('spmHandle');
    if (avatar) avatar.style.backgroundImage = `url('${currentUser.profile_photo || '/uploads/default-avatar.png'}')`;
    if (name)   name.textContent   = currentUser.display_name || currentUser.username || 'Kullanıcı';
    if (handle) handle.textContent = `@${currentUser.username || ''}`;
  }

  // Mark active status
  _spmMarkActive(currentUser?.status || 'online');

  // Show & measure before positioning
  menu.style.display = 'flex';
  overlay.style.display = 'block';

  requestAnimationFrame(() => {
    const chipRect = chip ? chip.getBoundingClientRect()
                          : { top: 60, bottom: 100, left: 0, width: 120 };
    const menuW = menu.offsetWidth  || 236;
    const menuH = menu.offsetHeight || 240;
    const vw    = window.innerWidth;
    const vh    = window.innerHeight;
    const GAP   = 8;

    // Prefer above chip, fall back to below
    let top;
    const spaceAbove = chipRect.top  - GAP;
    const spaceBelow = vh - chipRect.bottom - GAP;
    if (spaceAbove >= menuH || spaceAbove >= spaceBelow) {
      top = chipRect.top - menuH - GAP;
      menu.style.transformOrigin = 'center bottom';
    } else {
      top = chipRect.bottom + GAP;
      menu.style.transformOrigin = 'center top';
    }

    // Horizontal: center on chip, clamp
    let left = chipRect.left + chipRect.width / 2 - menuW / 2;
    left = Math.max(8, Math.min(left, vw - menuW - 8));
    top  = Math.max(8, Math.min(top,  vh - menuH - 8));

    menu.style.top  = top  + 'px';
    menu.style.left = left + 'px';

    // Trigger animation
    requestAnimationFrame(() => menu.classList.add('open'));
  });

  // Close on Escape
  window._spmEscHandler = (e) => { if (e.key === 'Escape') closeStatusSelector(); };
  window.addEventListener('keydown', window._spmEscHandler);
}

function closeStatusSelector() {
  const overlay = document.getElementById('statusPopoverOverlay');
  const menu    = document.getElementById('statusPopoverMenu');
  if (menu) menu.classList.remove('open');
  // Wait for transition then hide
  setTimeout(() => {
    if (menu && !menu.classList.contains('open')) {
      menu.style.display = 'none';
    }
    if (overlay) overlay.style.display = 'none';
  }, 200);
  if (window._spmEscHandler) {
    window.removeEventListener('keydown', window._spmEscHandler);
    window._spmEscHandler = null;
  }
}

function _spmMarkActive(status) {
  const ids = { online: 'spmOnline', away: 'spmAway', dnd: 'spmDnd', invisible: 'spmInvis' };
  Object.values(ids).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(ids[status]);
  if (activeEl) activeEl.classList.add('active');
}


// Global status tooltips data (initialized once per page load)
window._statusTooltipIndex = window._statusTooltipIndex !== undefined ? window._statusTooltipIndex : Math.floor(Math.random() * 10);
window._statusTooltips = {
  online: [
    "@username buralarda, ortalığı kasıp kavuruyor! (çevrimiçi)",
    "@username burada ve her an çılgın bir şeyler yapabilir. (çevrimiçi)",
    "@username radara girdi, gözümüz üstünde! (çevrimiçi)",
    "@username canavar gibi odaklanmaya hazır bekliyor. (çevrimiçi)",
    "@username çevrimiçi! Kaçın kurtulun ya da selam verin. (çevrimiçi)",
    "@username sonunda geldi, artık parti başlayabilir. (çevrimiçi)",
    "@username piksellerin arasında bir yerde süzülüyor. (çevrimiçi)",
    "@username çevrimiçi ve odaklanmak için parmaklarını çıtlatıyor. (çevrimiçi)",
    "@username burada! Ekrana bakmaktan gözleri yaşarmış olabilir. (çevrimiçi)",
    "@username şu an aktif, klavyesinden alevler çıkıyor! (çevrimiçi)"
  ],
  away: [
    "@username çay tazelemeye gitmiş olabilir mi? (uzakta)",
    "@username ekran başında ama ruhu başka diyarlarda... (uzakta)",
    "@username ufak bir mola verdi, hemen döner. (uzakta)",
    "@username mutfakta gizemli atıştırmalıklar arıyor. (uzakta)",
    "@username gözlerini dinlendiriyor (ya da uyuyakaldı). (uzakta)",
    "@username geçici olarak buralardan uzaklaştı. (uzakta)",
    "@username bilgisayarın başından kahve kokusuna doğru çekildi. (uzakta)",
    "@username kedisini sevmek için kısa bir ara verdi. (uzakta)",
    "@username ufuklara dalmış, dönmeyi unutmuş gibi. (uzakta)",
    "@username şu an burada değil ama kalbi bizimle. (uzakta)"
  ],
  dnd: [
    "@username şu an ultra odak modunda, yaklaşanın canı yanar! (rahatsız etme)",
    "@username dünyayı kurtarıyor ya da çok önemli bir kod yazıyor. (rahatsız etme)",
    "@username bildirimleri sessize aldı, derin odaklanma devrede! (rahatsız etme)",
    "@username şu an kimseyi duymuyor, müzik son ses! (rahatsız etme)",
    "@username dokunmayın, yoksa odak zinciri kırılacak! (rahatsız etme)",
    "@username sessizlik yemini etti, odaklanıyor. (rahatsız etme)",
    "@username işine öyle bir gömüldü ki ışık hızını geçti. (rahatsız etme)",
    "@username şu an dış dünyaya kapalı, sadece odak! (rahatsız etme)",
    "@username bildirim canavarlarını kapının dışında bıraktı. (rahatsız etme)",
    "@username konsantrasyonun doruklarında geziyor, bölmeyin. (rahatsız etme)"
  ],
  invisible: [
    "@username şu an uygulamamızı kullanacak zaman bulamıyor (çevrimdışı)",
    "@username hayata karışmış, gerçek dünyayı keşfediyor. (çevrimdışı)",
    "@username piksellerden uzaklaşıp biraz dinlenmeye çekildi. (çevrimdışı)",
    "@username internetsiz bir adaya düşmüş gibi sessiz... (çevrimdışı)",
    "@username bilgisayarı kapatıp doğayla buluşmaya gitti. (çevrimdışı)",
    "@username şu an gizemli bir şekilde ortadan kayboldu. (çevrimdışı)",
    "@username bataryası bitti ya da fişi çekti. (çevrimdışı)",
    "@username internet kablosunu kemiren bir kediyle boğuşuyor olabilir. (çevrimdışı)",
    "@username gerçek dünyadaki görevlerini tamamlamaya çalışıyor. (çevrimdışı)",
    "@username offline ama geri döndüğünde fırtınalar koparacak! (çevrimdışı)"
  ],
  offline: [
    "@username şu an uygulamamızı kullanacak zaman bulamıyor (çevrimdışı)",
    "@username hayata karışmış, gerçek dünyayı keşfediyor. (çevrimdışı)",
    "@username piksellerden uzaklaşıp biraz dinlenmeye çekildi. (çevrimdışı)",
    "@username internetsiz bir adaya düşmüş gibi sessiz... (çevrimdışı)",
    "@username bilgisayarı kapatıp doğayla buluşmaya gitti. (çevrimdışı)",
    "@username şu an gizemli bir şekilde ortadan kayboldu. (çevrimdışı)",
    "@username bataryası bitti ya da fişi çekti. (çevrimdışı)",
    "@username internet kablosunu kemiren bir kediyle boğuşuyor olabilir. (çevrimdışı)",
    "@username gerçek dünyadaki görevlerini tamamlamaya çalışıyor. (çevrimdışı)",
    "@username offline ama geri döndüğünde fırtınalar koparacak! (çevrimdışı)"
  ]
};

function updatePresenceUI() {
  if (!currentUser) return;
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (!dot || !text) return;
  
  const status = currentUser.status || 'online';
  let color = '#4ade80';
  let label = 'Çevrimiçi';
  
  if (status === 'away') { color = '#fbbf24'; label = 'Uzakta'; }
  else if (status === 'dnd') { color = '#ef4444'; label = 'R. Etme'; }
  else if (status === 'invisible') { color = '#9ca3af'; label = 'Görünmez'; }
  
  dot.setAttribute('data-status', status);
  dot.style.background = color;
  dot.style.boxShadow = `0 0 8px ${color}`;
  dot.style.color = color;
  text.textContent = label.toUpperCase();

  const chip = document.getElementById('timerStatusChip');
  if (chip) {
    const list = window._statusTooltips[status] || window._statusTooltips.online;
    const template = list[window._statusTooltipIndex] || list[0];
    const usernameVal = currentUser.username ? `@${currentUser.username}` : 'Sen';
    const finalTooltip = template.replace(/@username/g, usernameVal);
    chip.setAttribute('data-tooltip', finalTooltip);
  }

  if (typeof _spmMarkActive === 'function') _spmMarkActive(status);

  if (typeof startStatusChipAnimation === 'function') {
    startStatusChipAnimation();
  }
}

// ─── DISCORD-STYLE FLOATING TOOLTIP ENGINE ─────────────────────
(function initDiscordTooltipEngine() {
  let activeTarget = null;

  function showTooltip(target) {
    const tooltipEl = document.getElementById('discordTooltip');
    const tooltipText = document.getElementById('discordTooltipText');
    if (!tooltipEl || !tooltipText) return;

    let text = target.getAttribute('data-tooltip') || target.getAttribute('title');
    if (!text || !text.trim()) return;

    if (target.hasAttribute('title')) {
      target.setAttribute('data-tooltip', text.trim());
      target.removeAttribute('title');
    }

    activeTarget = target;
    tooltipText.textContent = text.trim();

    tooltipEl.style.display = 'block';
    tooltipEl.style.opacity = '1';
    tooltipEl.style.visibility = 'visible';

    const rect = target.getBoundingClientRect();
    const ttRect = tooltipEl.getBoundingClientRect();

    const isCollapsedOverlay = !!target.closest('.party-focus-overlay.collapsed');
    const overlayEl = target.closest('.party-focus-overlay');
    
    let preferRight = target.getAttribute('data-tooltip-pos') === 'right' || isCollapsedOverlay;
    let preferLeft = false;

    if (isCollapsedOverlay && overlayEl) {
      const overRect = overlayEl.getBoundingClientRect();
      // If collapsed overlay is on the right side of the screen, show tooltip on the left
      if (overRect.left + overRect.width / 2 > window.innerWidth / 2) {
        preferRight = false;
        preferLeft = true;
      }
    }

    let top, left;

    if (preferRight) {
      top = rect.top + (rect.height / 2) - (ttRect.height / 2);
      left = rect.right + 10;
      tooltipEl.classList.add('tooltip-right');
      tooltipEl.classList.remove('tooltip-bottom', 'tooltip-left');
    } else if (preferLeft) {
      top = rect.top + (rect.height / 2) - (ttRect.height / 2);
      left = rect.left - ttRect.width - 10;
      tooltipEl.classList.add('tooltip-left');
      tooltipEl.classList.remove('tooltip-bottom', 'tooltip-right');
    } else {
      top = rect.top - ttRect.height - 8;
      left = rect.left + (rect.width / 2) - (ttRect.width / 2);
      tooltipEl.classList.remove('tooltip-right', 'tooltip-left');

      if (top < 8) {
        top = rect.bottom + 8;
        tooltipEl.classList.add('tooltip-bottom');
      } else {
        tooltipEl.classList.remove('tooltip-bottom');
      }
      left = Math.max(8, Math.min(window.innerWidth - ttRect.width - 8, left));
    }

    const svgArrow = document.getElementById('discordTooltipArrow');
    if (svgArrow) {
      const pathEl = svgArrow.querySelector('path');
      if (preferRight) {
        svgArrow.setAttribute('viewBox', '0 0 8 16');
        svgArrow.setAttribute('width', '7');
        svgArrow.setAttribute('height', '14');
        if (pathEl) pathEl.setAttribute('d', 'M8 0 C8 4 6 6 1 8 C6 10 8 12 8 16 Z');
      } else if (preferLeft) {
        svgArrow.setAttribute('viewBox', '0 0 8 16');
        svgArrow.setAttribute('width', '7');
        svgArrow.setAttribute('height', '14');
        if (pathEl) pathEl.setAttribute('d', 'M0 0 C0 4 2 6 7 8 C2 10 0 12 0 16 Z');
      } else if (top > rect.top) { // bottom position
        svgArrow.setAttribute('viewBox', '0 0 16 8');
        svgArrow.setAttribute('width', '14');
        svgArrow.setAttribute('height', '7');
        if (pathEl) pathEl.setAttribute('d', 'M0 8 C4 8 6 6 8 1 C10 6 12 8 16 8 Z');
      } else { // top position
        svgArrow.setAttribute('viewBox', '0 0 16 8');
        svgArrow.setAttribute('width', '14');
        svgArrow.setAttribute('height', '7');
        if (pathEl) pathEl.setAttribute('d', 'M0 0 C4 0 6 2 8 7 C10 2 12 0 16 0 Z');
      }
    }

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.classList.add('visible');
  }

  function hideTooltip() {
    const tooltipEl = document.getElementById('discordTooltip');
    activeTarget = null;
    if (tooltipEl) {
      tooltipEl.classList.remove('visible');
      tooltipEl.style.display = 'none';
      tooltipEl.style.opacity = '0';
      tooltipEl.style.visibility = 'hidden';
    }
  }

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip], [title]');
    if (target) {
      showTooltip(target);
    } else if (activeTarget && !e.target.closest('#discordTooltip')) {
      hideTooltip();
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (activeTarget) {
      const rel = e.relatedTarget;
      if (!rel || (!activeTarget.contains(rel) && activeTarget !== rel)) {
        hideTooltip();
      }
    }
  });

  document.addEventListener('click', () => hideTooltip());
  window.addEventListener('scroll', () => hideTooltip(), { passive: true });
})();

// ─── AUTOMATIC AFK / IDLE DETECTION ENGINE ───────────────────────
(function initAutoAfkEngine() {
  let lastActivity = Date.now();
  let isAutoAway = false;
  const IDLE_TIMEOUT_MS = 2.5 * 60 * 1000; // 2.5 minutes of inactivity

  function onUserActivity() {
    lastActivity = Date.now();
    if (isAutoAway && currentUser) {
      isAutoAway = false;
      if (typeof setUserStatus === 'function') {
        setUserStatus('online', true);
      }
    }
  }

  const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
  events.forEach(evt => {
    window.addEventListener(evt, onUserActivity, { passive: true });
  });

  setInterval(() => {
    if (!currentUser) return;
    const idleDuration = Date.now() - lastActivity;
    // Auto-away if idle for > 2.5 minutes and currently online
    if (idleDuration >= IDLE_TIMEOUT_MS && (!currentUser.status || currentUser.status === 'online') && !isAutoAway) {
      isAutoAway = true;
      if (typeof setUserStatus === 'function') {
        setUserStatus('away', true);
      }
    }
  }, 10000); // Check every 10 seconds
})();

// ─── MULTI-DEVICE VOICE HANDOVER BACKGROUND POLLER ────────────────
(function initMultiDeviceHandoverPoller() {
  setInterval(() => {
    if (!currentUser) return;
    if (typeof checkAndRenderHandoverButton === 'function') {
      checkAndRenderHandoverButton(window._currentPartyId);
    }
  }, 4000);
})();
