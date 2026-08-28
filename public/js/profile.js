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

function getFeelingIconSvg(feeling) {
  if (!feeling) return '';
  const f = String(feeling).toLowerCase();
  if (f.includes('gurur') || f.includes('zafer') || f.includes('başar')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M18 4H6v7a6 6 0 0 0 12 0V4z"/></svg>`;
  }
  if (f.includes('mutlu') || f.includes('harika') || f.includes('iyi') || f.includes('neşeli')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
  }
  if (f.includes('motive') || f.includes('ateş') || f.includes('enerjik')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  }
  if (f.includes('odak') || f.includes('sakin') || f.includes('verim')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
  }
  if (f.includes('yorgun') || f.includes('bitkin') || f.includes('uyku')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
  if (f.includes('stres') || f.includes('zor') || f.includes('bunal')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
}

// ============================================================
// LOAD MY PROFILE
// ============================================================
async function loadMyProfile() {
  const content = document.getElementById('myProfileContent');
  if (!content) return;
  content.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';

  try {
    if (!currentUser || !currentUser.username) {
      const meRes = await fetch('/api/me', { cache: 'no-store' });
      if (meRes.ok) {
        currentUser = await meRes.json();
      }
    }

    if (!currentUser || !currentUser.username) {
      content.innerHTML = '<div class="empty-state"><div class="empty-title">Profil yüklenemedi</div></div>';
      return;
    }

    const cleanName = currentUser.username.replace(/^@/, '').trim();
    const res = await fetch(`/api/users/${encodeURIComponent(cleanName)}`);
    if (!res.ok) throw new Error();
    const user = await res.json();
    currentUser = { ...currentUser, ...user };
    renderMyProfile(user);
  } catch (err) {
    console.error('[Profile] loadMyProfile error:', err);
    content.innerHTML = '<div class="empty-state"><div class="empty-title">Profil yüklenemedi</div></div>';
  }
}

// ============================================================
// REÖNDER MY PROFILE
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
      ? `<div class="profile-empty-tab">Blunk ile hiç bir şey paylaşmadın... (lütfen paylaş lütfeeennn!!!)</div>`
      : `<div class="feed-list twitter-feed-timeline" style="padding-top:12px;">${posts.map(p => window.renderTweetCard(p)).join('')}</div>`;
  } else if (_profileActiveTab === 'sessions') {
    tabContentHtml = sessions.length === 0
      ? `<div class="profile-empty-tab">Blunk ile henüz bir odak oturumu başlatmadın.</div>`
      : `<div class="profile-sessions-list">${sessions.slice(0, 30).map(s => {
          const activityTitle = s.activity || s.category || 'Odak Seansı';
          const isCompleted = s.status === 'completed';

          const tags = [];
          if (s.feeling) {
            tags.push(`<span class="session-mini-tag">${getFeelingIconSvg(s.feeling)}<span>${esc(s.feeling)}</span></span>`);
          }
          if (s.category && s.category !== activityTitle) {
            tags.push(`<span class="session-mini-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span>${esc(s.category)}</span></span>`);
          }

          const tagsHtml = tags.length > 0 ? `<div class="session-tags-row">${tags.join('')}</div>` : '';

          const noteHtml = s.note
            ? `<div class="session-row-note">
                 "${esc(s.note)}"
               </div>`
            : '';

          const statusIconHtml = isCompleted
            ? `<div class="session-status-icon completed" data-tooltip="Kullanıcı bu seansı başarıyla tamamladı">
                 <svg viewBox="0 0 24 24" fill="none" stroke="#23a55a" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
               </div>`
            : `<div class="session-status-icon incomplete" data-tooltip="Bu seans tamamlanamadı veya terk edildi">
                 <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </div>`;

          return `
          <div class="session-row">
            <div class="session-row-top">
              <div class="session-title-wrap" onclick="if (typeof openSessionLeague === 'function') openSessionLeague('${esc(activityTitle)}', '${s.activity ? 'activity' : 'category'}')" data-tooltip="${esc(activityTitle)} ligine git">
                <span class="session-main-title">${esc(activityTitle)}</span>
                <svg class="session-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M7 17l9.2-9.2M17 17V8H8"/></svg>
              </div>
              <div class="session-top-meta">
                <div class="session-row-date" data-tooltip="Başlangıç Zamanı">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>${fmtDate(s.start_time)}</span>
                </div>
                ${statusIconHtml}
              </div>
            </div>
            
            <div class="session-row-sub">
              <div class="session-duration-tag">
                <span class="session-duration-val">${fmtTime(s.duration || 0)}</span>
                <span class="session-mode-pill ${s.mode === 'pomodoro' ? 'pomo' : 'free'}">${s.mode === 'pomodoro' ? 'POMODORO' : 'SERBEST'}</span>
              </div>
              ${tagsHtml}
            </div>

            ${noteHtml}
          </div>`;
        }).join('')}</div>`;
  } else if (_profileActiveTab === 'reposts') {
    tabContentHtml = reposts.length === 0
      ? `<div class="profile-empty-tab">HENÜZ REPOST YOK</div>`
      : `<div class="feed-list twitter-feed-timeline" style="padding-top:12px;">${reposts.map(p => window.renderTweetCard(p)).join('')}</div>`;
  }

  const hdrTitle = document.getElementById('myProfileHeaderTitle');
  if (hdrTitle) hdrTitle.textContent = `@${user.username}`;

  content.innerHTML = `
    <div class="profile-insta-header">
      <div class="profile-insta-top">
        <div class="profile-insta-avatar-col">
          ${renderAvatar(user, 'avatar avatar-xl')}
        </div>
        <div class="profile-insta-stats-col">
          <div class="profile-stat-box" onclick="switchProfileTab('posts')" data-tooltip="Gönderilerin">
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
        <div class="profile-insta-details" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; gap:8px; align-items:center;">
            ${user.height ? `<span>📏 ${user.height}cm</span>` : ''}
            ${user.weight ? `<span>⚖️ ${user.weight}kg</span>` : ''}
            <span>⏱️ ${fmtTime(user.total_focus_time || 0)}</span>
          </div>
          <!-- Multi-Theme Selector Dropdown / Menu -->
          <button onclick="toggleBlunkTheme(event)" style="display:flex; align-items:center; gap:6px; background:var(--t-bg-card); border:1px solid var(--t-border-subtle); color:var(--t-text-primary); padding:6px 12px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer; outline:none; transition:background 0.2s;">
            <span id="profileThemeIcon" style="display:flex; align-items:center;"></span>
            <span id="profileThemeText"></span>
          </button>
        </div>
        <div class="profile-xp-row" style="display:flex; align-items:center; gap:10px; margin-top:12px;">
          <span class="lvl-badge">LVL ${user.level}</span>
          <div class="xp-bar-wrap" style="height:4px;background:rgba(255,255,255,0.08);flex:1;border-radius:99px;overflow:hidden;">
            <div class="xp-bar-fill" style="width:${progress.percentage}%;background:linear-gradient(90deg, #a855f7, #ec4899);height:100%;border-radius:99px;"></div>
          </div>
          <span class="profile-xp-label" style="font-size:11px; font-weight:700; color:var(--text-3);">${progress.xpInLevel}/${progress.xpNeededForNext} XP</span>
        </div>
      </div>
    </div>

    <div class="profile-insta-tabs">
      <button class="profile-insta-tab ${_profileActiveTab === 'posts' ? 'active' : ''}" onclick="switchProfileTab('posts')" data-tooltip="Gönderiler" data-tooltip-pos="top">
        <svg viewBox="0 0 24 24" fill="${_profileActiveTab === 'posts' ? '#ffffff' : 'none'}" stroke="${_profileActiveTab === 'posts' ? '#ffffff' : '#888888'}" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
      </button>
      <button class="profile-insta-tab ${_profileActiveTab === 'sessions' ? 'active' : ''}" onclick="switchProfileTab('sessions')" data-tooltip="Odak Oturumları" data-tooltip-pos="top">
        <svg viewBox="0 0 24 24" fill="none" stroke="${_profileActiveTab === 'sessions' ? '#ffffff' : '#888888'}" stroke-width="2.2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      </button>
      <button class="profile-insta-tab ${_profileActiveTab === 'reposts' ? 'active' : ''}" onclick="switchProfileTab('reposts')" data-tooltip="Repostlar" data-tooltip-pos="top">
        <svg viewBox="0 0 24 24" fill="none" stroke="${_profileActiveTab === 'reposts' ? '#ffffff' : '#888888'}" stroke-width="2.2" width="18" height="18"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </button>
    </div>

    <div id="profileTabContent">
      ${tabContentHtml}
    </div>
  `;
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  if (typeof updateThemeToggleIcons === 'function') {
    updateThemeToggleIcons(currentTheme);
  }
}

// ============================================================
// GLOBAL UNIFIED POST DETAIL MODAL — full Instagram-style
// ============================================================
function switchProfileTab(tab) {
  _profileActiveTab = tab;
  loadMyProfile();
}

function openProfileSettings() {
  console.log("openProfileSettings() triggered.");
  try {
    const modal = document.getElementById('profileSettingsModal');
    if (!modal) {
      console.error("profileSettingsModal element not found in DOM!");
      if (typeof showToast === 'function') showToast("Ayarlar modalı DOM'da bulunamadı!");
      return;
    }

    const user = currentUser || {};
    console.log("openProfileSettings - Current User Data:", user);

    const avatarContainer = document.getElementById('settingsAvatarContainer');
    if (avatarContainer && typeof renderAvatar === 'function') {
      try {
        avatarContainer.innerHTML = renderAvatar(user, 'avatar avatar-xl');
      } catch (avatarErr) {
        console.error("Error rendering avatar in settings:", avatarErr);
      }
    }

    const removeBtn = document.getElementById('settingsRemovePhotoBtn');
    if (removeBtn) {
      const hasPhoto = user && user.profile_photo && !user.profile_photo.includes('default-avatar.png');
      removeBtn.style.display = hasPhoto ? 'inline-flex' : 'none';
    }

    const settingsUsername = document.getElementById('settingsUsername');
    if (settingsUsername) settingsUsername.value = user.username || '';

    const deletePassGroup = document.getElementById('deleteAccountPasswordGroup');
    if (deletePassGroup) {
      deletePassGroup.style.display = user.has_password === false || !user.password ? 'none' : 'block';
    }

    const settingsPrivateToggle = document.getElementById('settingsPrivateToggle');
    if (settingsPrivateToggle) settingsPrivateToggle.checked = !!user.is_private;

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (typeof updateThemeToggleIcons === 'function') {
      updateThemeToggleIcons(currentTheme);
    }

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

    // Channel sound volume initialization
    const savedSoundVol = localStorage.getItem('os_channel_sound_volume') !== null
      ? parseInt(localStorage.getItem('os_channel_sound_volume'))
      : 100;
    const volSlider = document.getElementById('settingsChannelSoundVol');
    const volLabel = document.getElementById('settingsChannelSoundVolVal');
    if (volSlider) volSlider.value = savedSoundVol;
    if (volLabel) volLabel.textContent = `${savedSoundVol}%`;

    try {
      if (typeof populateMicDeviceList === 'function') {
        populateMicDeviceList();
      }
      if (typeof syncVoiceProcessingSettings === 'function') {
        syncVoiceProcessingSettings();
      }
    } catch (e) {
      console.warn("Failed to populate mic list inside settings:", e);
    }

    console.log("Displaying profile settings modal.");
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    modal.style.pointerEvents = 'auto';
    modal.style.zIndex = '999999';
  } catch (err) {
    console.error("Error in openProfileSettings:", err);
    if (typeof showToast === 'function') {
      showToast("Ayarlar açılırken hata: " + err.message);
    } else {
      alert("Ayarlar açılırken hata: " + err.message);
    }
    // Fallback opening
    const modal = document.getElementById('profileSettingsModal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
      modal.style.pointerEvents = 'auto';
      modal.style.zIndex = '999999';
    }
  }
}

function closeProfileSettingsModal() {
  const modal = document.getElementById('profileSettingsModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
    modal.style.pointerEvents = 'none';
  }
}

// ============================================================
// SAVE SETTINGS
// ============================================================
async function saveSettings() {
  const username = document.getElementById('settingsUsername')?.value.trim() || '';
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
      body: JSON.stringify({ username, bio, height, weight, cv, is_private: isPrivate })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      if (data.username) currentUser.username = data.username;
      currentUser.bio = bio;
      currentUser.height = height;
      currentUser.weight = weight;
      currentUser.cv = cv;
      currentUser.is_private = isPrivate ? 1 : 0;
      showToast('Profil ayarları kaydedildi');
      closeProfileSettingsModal();
      loadMyProfile();
    } else {
      showToast(data.error || 'Ayarlar kaydedilemedi');
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

      const removeBtn = document.getElementById('settingsRemovePhotoBtn');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
      
      loadMyProfile();
    } else {
      showToast('Fotoğraf yüklenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
  input.value = '';
}

// REMOVE PROFILE PHOTO
// ============================================================
async function removeProfilePhoto() {
  if (!currentUser || !currentUser.profile_photo || currentUser.profile_photo.includes('default-avatar.png')) {
    if (typeof showToast === 'function') showToast('Zaten yüklenmiş profil fotoğrafınız yok');
    return;
  }
  try {
    const res = await fetch('/api/profile/photo', { method: 'DELETE' });
    if (res.ok) {
      currentUser.profile_photo = null;
      if (typeof showToast === 'function') showToast('Profil fotoğrafı kaldırıldı');
      
      const settingsAvatarContainer = document.getElementById('settingsAvatarContainer');
      if (settingsAvatarContainer && typeof renderAvatar === 'function') {
        settingsAvatarContainer.innerHTML = renderAvatar(currentUser, 'avatar avatar-xl');
      }

      const removeBtn = document.getElementById('settingsRemovePhotoBtn');
      if (removeBtn) removeBtn.style.display = 'none';

      if (typeof loadMyProfile === 'function') loadMyProfile();
    } else {
      if (typeof showToast === 'function') showToast('Fotoğraf kaldırılamadı');
    }
  } catch {
    if (typeof showToast === 'function') showToast('Bağlantı hatası');
  }
}
window.removeProfilePhoto = removeProfilePhoto;
// ============================================================
async function setUserStatus(status, isAuto = false) {
  try {
    const res = await fetch('/api/me/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      currentUser.status = status;
      if (!isAuto && typeof closeStatusSelector === 'function') closeStatusSelector();
      if (typeof updatePresenceUI === 'function') updatePresenceUI();
      if (!isAuto) showToast('Durum güncellendi');
      if (typeof loadMyProfile === 'function') loadMyProfile();
    } else {
      if (!isAuto) showToast('Güncellenemedi');
    }
  } catch {
    if (!isAuto) showToast('Bağlantı hatası');
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
    sheet.style.paddingTop = 'calc(64px + env(safe-area-inset-top, 16px))';
    
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

function handleChannelSoundVolChange(val) {
  const vol = Math.max(0, Math.min(100, parseInt(val) || 0));
  localStorage.setItem('os_channel_sound_volume', vol.toString());
  const label = document.getElementById('settingsChannelSoundVolVal');
  if (label) label.textContent = `${vol}%`;
}

// Event delegation to bulletproof profile settings click trigger
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.topbar-settings-btn');
  if (btn) {
    console.log("topbar-settings-btn click intercepted by document event delegation.");
    e.preventDefault();
    e.stopPropagation();
    openProfileSettings();
  }
});

async function deleteOwnAccount() {
  const passwordInput = document.getElementById('deleteAccountPassword');
  const confirmInput  = document.getElementById('deleteAccountConfirmText');
  
  if (!confirmInput) return;
  const password    = passwordInput ? passwordInput.value : '';
  const confirmText = confirmInput.value;

  if (confirmText !== 'ONAYLIYORUM') {
    showToast('Onaylamak için büyük harflerle ONAYLIYORUM yazmalısınız.');
    return;
  }

  if (!confirm('Hesabınızı ve tüm verilerinizi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
    return;
  }

  const btn = document.getElementById('settingsDeleteBtn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, confirmText })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Hesabınız başarıyla silindi.');
      closeProfileSettingsModal();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showToast(data.error || 'Hesap silinirken hata oluştu.');
      if (btn) btn.disabled = false;
    }
  } catch(e) {
    console.error('Delete account error:', e);
    showToast('Sunucu bağlantı hatası.');
    if (btn) btn.disabled = false;
  }
}
