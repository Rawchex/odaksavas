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
// PAGE VISIBILITY API — instant on iOS when screen locks / app switch
// ============================================================
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window._activeSession && !window._violationFired) {
    window._violationFired = true;
    if (typeof handleViolation === 'function') handleViolation('EKRAN KAPANDI');
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
})();

// ============================================================
// AUTH
// ============================================================
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentUser = await res.json();
      showMainApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display    = 'none';
  // Focus input
  setTimeout(() => {
    const inp = document.getElementById('usernameInput');
    if (inp) inp.focus();
  }, 100);
}

async function login() {
  const inp = document.getElementById('usernameInput');
  const passInp = document.getElementById('passwordInput');
  const username = inp.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const password = passInp?.value;

  if (!username) {
    inp.classList.add('error');
    inp.placeholder = 'Kullanıcı adı gir!';
    setTimeout(() => { inp.classList.remove('error'); inp.placeholder = 'Kullanıcı adın'; }, 2000);
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '...';

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
      
      // Auto migrate users without passwords
      if (d.needsPassword) {
        setTimeout(async () => {
          const newPass = await window.showPrompt('Hesabınızın güvenliği için lütfen bir şifre belirleyin (en az 6 karakter):');
          if (newPass && newPass.length >= 6) {
            const migrateRes = await fetch('/api/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newPassword: newPass })
            });
            if (migrateRes.ok) {
              showToast('Şifreniz başarıyla kaydedildi!');
            } else {
              showToast('Şifre kaydedilemedi. Profilden sonra deneyebilirsiniz.');
            }
          }
        }, 1200);
      }
    } else {
      if (d.needPassword) {
        showToast('Şifre girmelisiniz!');
      } else {
        showToast(d.error || 'Giriş başarısız');
      }
      btn.disabled = false;
      btn.textContent = 'GİRİŞ YAP';
    }
  } catch {
    showToast('Sunucuya ulaşılamıyor');
    btn.disabled = false;
    btn.textContent = 'GİRİŞ YAP';
  }
}

async function register() {
  const inp = document.getElementById('usernameInput');
  const passInp = document.getElementById('passwordInput');
  const username = inp.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const password = passInp?.value;

  if (!username || !password || password.length < 6) {
    showToast('Kullanıcı adı ve en az 6 karakterli şifre girin!');
    return;
  }

  const btn = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await res.json().catch(() => ({}));

    if (res.ok) {
      currentUser = d;
      showMainApp();
      showToast('Kayıt başarılı!');
    } else {
      showToast(d.error || 'Kayıt başarısız');
      btn.disabled = false;
      btn.textContent = 'KAYIT OL';
    }
  } catch {
    showToast('Sunucuya ulaşılamıyor');
    btn.disabled = false;
    btn.textContent = 'KAYIT OL';
  }
}

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
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display    = 'block';

  // Show violation note if any
  if (sessionStorage.getItem('os_show_violation_note')) {
    sessionStorage.removeItem('os_show_violation_note');
    setTimeout(() => showToast('Son oturumun ihlalle sonlandı'), 1000);
  }

  showPage('timer');
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
  fetch('/api/me/heartbeat', { method: 'PATCH' }).catch(()=>{});
  setInterval(() => {
    if (currentUser) {
      fetch('/api/me/heartbeat', { method: 'PATCH' }).catch(()=>{});
    }
  }, 30000);
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
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    const vapidRes = await fetch('/api/notifications/vapidPublicKey');
    const vapidPublicKey = await vapidRes.text();
    
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
  } catch (err) {
    console.warn('Push registration status:', err.message || err);
  }
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

function showPage(name) {
  // Hide userProfilePage if switching main pages
  document.getElementById('userProfilePage').style.display = 'none';

  // Clean up mobile chat view states if leaving messages/chat
  if (name !== 'messages') {
    if (typeof closeChatArea === 'function') closeChatArea();
    document.body.classList.remove('chat-active');
  }

  const oldPage = document.querySelector('.page.active');
  const newPage = document.getElementById(name + 'Page');
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) navBtn.classList.add('active');

  _previousPage = activePage || 'timer';
  activePage = name;

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
      
      // Force reflow
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

// ============================================================
// LEADERBOARD
// ============================================================
async function loadLeaderboard() {
  const [lbRes] = await Promise.all([fetch('/api/leaderboard')]);
  const users = await lbRes.json();

  const myIdx = users.findIndex(u => u.username === currentUser.username);
  const myRank = myIdx + 1;

  // Hero card
  const hero = document.getElementById('myRankHero');
  if (myRank > 0) {
    const me = users[myIdx];
    hero.innerHTML = `
      <div class="my-rank-hero">
        <div class="my-rank-num">#${myRank}</div>
        <div class="my-rank-info">
          <div class="my-rank-label">Senin Sıran</div>
          <div class="my-rank-name">${esc(me.username)}</div>
          <div style="font-size:12px;color:var(--text-3);font-weight:500;margin-top:4px">${fmtTime(me.total_focus_time)} odak · Seviye ${me.level}</div>
        </div>
      </div>`;
  } else {
    hero.innerHTML = '';
  }

  const list = document.getElementById('leaderboardList');
  if (!users.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-title">Henüz kimse yok</div></div>';
    return;
  }

  list.innerHTML = users.map((u, i) => {
    const isMe = u.username === currentUser.username;
    const rank = i + 1;
    let rankClass = '';
    if (rank === 1) rankClass = 'top1';
    else if (rank === 2) rankClass = 'top2';
    else if (rank === 3) rankClass = 'top3';

    return `
      <div class="user-rank-card ${isMe ? 'is-me' : ''}" onclick="openUserModal('${esc(u.username)}')">
        <div class="rank-num ${rankClass}">${rank === 1 ? '①' : rank === 2 ? '②' : rank === 3 ? '③' : rank}</div>
        ${renderAvatar(u, 'avatar avatar-sm')}
        <div class="rank-user-info">
          <div class="rank-username">
            ${esc(u.username)}
            ${isMe ? '<span class="me-tag">SEN</span>' : ''}
          </div>
          <div class="rank-sub">Seviye ${u.level}</div>
        </div>
        <div class="rank-time">${fmtTime(u.total_focus_time)}</div>
      </div>`;
  }).join('');
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

async function markAllRead() {
  await fetch('/api/notifications/read', { method: 'POST' });
  document.getElementById('notifDot').classList.remove('show');
  loadNotifications();
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
  page.style.display = 'none';
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

  // Friendship action
  let actionBtnHtml = '';
  if (!isMe) {
    if (!user.friendship) {
      actionBtnHtml = `<button class="mono-btn-primary" style="flex:1" onclick="sendFriendReq('${esc(user.username)}')">Arkadaş Ekle</button>`;
    } else if (user.friendship.status === 'accepted') {
      actionBtnHtml = `
        <button class="mono-btn-secondary" style="flex:1;cursor:default" disabled>✓ Arkadaşsınız</button>
        <button class="mono-btn-primary" style="flex:1" onclick="closeUserPage();showPage('messages');openDirectChat('${esc(user.username)}')">Mesaj</button>
        <button class="mono-btn-danger" style="width:auto;padding:0 14px" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')">Çıkar</button>`;
    } else if (user.friendship.status === 'pending') {
      if (user.friendship.sender_id === currentUser.id) {
        actionBtnHtml = `
          <button class="mono-btn-secondary" style="flex:1;cursor:default" disabled>İstek Gönderildi</button>
          <button class="mono-btn-danger" style="width:auto;padding:0 14px" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')">İptal</button>`;
      } else {
        actionBtnHtml = `
          <button class="mono-btn-primary" style="flex:1" onclick="acceptFriendReqFromModal(${user.friendship.id},'${esc(user.username)}')">Kabul Et</button>
          <button class="mono-btn-danger" style="flex:1" onclick="removeFriend(${user.friendship.id},'${esc(user.username)}')">Reddet</button>`;
      }
    }
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

  const statusColors = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af' };
  const userStatusColor = statusColors[user.status || 'online'] || statusColors.online;

  content.innerHTML = `
    <div class="profile-insta-header">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="profile-insta-username" style="font-size:18px;">${esc(user.username)}</span>
          <span class="lvl-badge">LVL ${user.level}</span>
          <div class="status-dot-indicator" style="background:${userStatusColor}; width:12px; height:12px; border-radius:50%;"></div>
        </div>
      </div>

      <div class="profile-insta-top">
        <div class="profile-insta-avatar-col">
          ${renderAvatar(user, 'avatar avatar-xl')}
        </div>
        <div class="profile-insta-stats-col">
          <div onclick="openFriendListModal('${esc(user.username)}')" style="cursor:pointer">
            <div class="profile-insta-stat-val">${user.post_count || 0}</div>
            <div class="profile-insta-stat-lbl">Gönderi</div>
          </div>
          <div onclick="openFriendListModal('${esc(user.username)}')" style="cursor:pointer">
            <div class="profile-insta-stat-val">${user.friend_count || 0}</div>
            <div class="profile-insta-stat-lbl">Takipçi</div>
          </div>
          <div>
            <div class="profile-insta-stat-val">${fmtTime(user.total_focus_time||0)}</div>
            <div class="profile-insta-stat-lbl">Odak</div>
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
        <div class="profile-xp-row">
          <div class="xp-bar-wrap" style="height:2px;background:#1a1a1a;flex:1">
            <div class="xp-bar-fill" style="width:${progress.percentage}%;background:#fff;height:100%"></div>
          </div>
          <span class="profile-xp-label">${progress.xpInLevel}/${progress.xpNeededForNext} XP</span>
        </div>
      </div>

      ${actionBtnHtml ? `<div class="profile-insta-action-btn-row"><div style="display:flex;gap:8px">${actionBtnHtml}</div></div>` : ''}
    </div>

    ${user.is_locked ? `
      <div class="profile-locked-overlay">
        <div class="profile-locked-icon">🔒</div>
        <div class="profile-locked-title">Bu Hesap Gizli</div>
        <div class="profile-locked-desc">Gönderi ve istatistiklerini görmek için arkadaş olun.</div>
      </div>` : `
      <div class="profile-insta-tabs">
        <div class="profile-insta-tab ${_userPageActiveTab==='posts'?'active':''}" onclick="openUserPage('${esc(user.username)}','posts')">
          <svg viewBox="0 0 24 24" fill="${_userPageActiveTab==='posts'?'#fff':'#555'}" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </div>
        <div class="profile-insta-tab ${_userPageActiveTab==='sessions'?'active':''}" onclick="openUserPage('${esc(user.username)}','sessions')">
          <svg viewBox="0 0 24 24" fill="none" stroke="${_userPageActiveTab==='sessions'?'#fff':'#555'}" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        </div>
        <div class="profile-insta-tab ${_userPageActiveTab==='reposts'?'active':''}" onclick="openUserPage('${esc(user.username)}','reposts')">
          <svg viewBox="0 0 24 24" fill="none" stroke="${_userPageActiveTab==='reposts'?'#fff':'#555'}" stroke-width="2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </div>
      </div>
      <div id="userPageTabContent">${tabHtml}</div>
    `}
  `;
}

// ============================================================
// FRIEND LIST MODAL
// ============================================================
async function openFriendListModal(username) {
  const modal = document.getElementById('friendListModal');
  const title = document.getElementById('friendListTitle');
  const content = document.getElementById('friendListContent');
  title.textContent = `${username} — Arkadaşlar`;
  content.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';
  modal.classList.add('open');

  try {
    const res = await fetch(`/api/users/${username}/friends`);
    const friends = await res.json();
    if (!friends.length) {
      content.innerHTML = '<div class="profile-empty-tab">HENÜz ARKADAŞ YOK</div>';
      return;
    }
    content.innerHTML = friends.map(f => `
      <div class="fl-row" onclick="closeFriendListModal();openUserPage('${esc(f.username)}')">
        ${renderAvatar(f, 'avatar avatar-sm')}
        <div class="fl-info">
          <div class="fl-name">${esc(f.username)}</div>
          <div class="fl-sub">LVL ${f.level} · ${fmtTime(f.total_focus_time||0)}</div>
        </div>
      </div>
    `).join('');
  } catch {
    content.innerHTML = '<div class="profile-empty-tab">Yüklenemedi</div>';
  }
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
    document.getElementById('statLevel').textContent = progress.level;
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
    const isOnline = user.is_online || (user.status && user.status !== 'offline');
    let color = '#555'; // default offline / invisible
    if (isOnline) {
      if (user.status === 'online' || !user.status) color = '#00e676';
      else if (user.status === 'away') color = '#fbbf24';
      else if (user.status === 'dnd') color = '#ef4444';
    }

    // Determine dot size based on avatar classes
    let dotSize = 8;
    let borderSize = 2;
    if (classes.includes('avatar-xs')) { dotSize = 6; borderSize = 1.5; }
    else if (classes.includes('avatar-md')) { dotSize = 10; borderSize = 2; }
    else if (classes.includes('avatar-lg')) { dotSize = 14; borderSize = 2.5; }
    else if (classes.includes('avatar-xl')) { dotSize = 16; borderSize = 3; }

    statusDot = `<div class="status-online-dot" style="background:${color}; width:${dotSize}px; height:${dotSize}px; border-radius:50%; position:absolute; bottom:-1px; right:-1px; border:${borderSize}px solid #000; z-index:2;"></div>`;
  }

  return `<div class="${classes}" style="position:relative; display:inline-flex;">${avatarHtml}${statusDot}</div>`;
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

activePage = 'timer';

// ============================================================
// CUSTOM UI MODALS
// ============================================================
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


function updatePresenceUI() {
  if (!currentUser) return;
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (!dot || !text) return;
  
  const status = currentUser.status || 'online';
  let color = '#4ade80';
  let label = 'Çevrimiçi';
  
  if (status === 'away') { color = '#fbbf24'; label = 'Uzakta'; }
  else if (status === 'dnd') { color = '#ef4444'; label = 'R. Etmeyin'; }
  else if (status === 'invisible') { color = '#9ca3af'; label = 'Görünmez'; }
  
  dot.style.background = color;
  text.textContent = label.toUpperCase();

  if (typeof _spmMarkActive === 'function') _spmMarkActive(status);

  if (typeof startStatusChipAnimation === 'function') {
    startStatusChipAnimation();
  }
}

