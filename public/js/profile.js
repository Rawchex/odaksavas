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
      : `<div class="profile-post-grid">${posts.map(p => renderPostGridItem(p, true, false)).join('')}</div>`;
  } else if (_profileActiveTab === 'sessions') {
    tabContentHtml = sessions.length === 0
      ? `<div class="profile-empty-tab">Blunk ile hiç odak oturumu başlatmadın...</div>`
      : `<div class="profile-sessions-list">${sessions.slice(0, 30).map(s => {
          const detailParts = [];
          if (s.feeling) detailParts.push(`<span class="session-detail-feeling">${esc(s.feeling)}</span>`);
          if (s.category) detailParts.push(`<span class="session-detail-category">${esc(s.category)}</span>`);
          if (s.activity) detailParts.push(`<span class="session-detail-activity">${esc(s.activity)}</span>`);
          
          const detailsHtml = detailParts.length > 0 
            ? `<div class="session-row-details" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; font-size:10px; color:var(--text-3); font-weight:600;">
                 ${detailParts.join('<span style="opacity:0.3">•</span>')}
               </div>`
            : '';

          const noteHtml = s.note
            ? `<div class="session-row-note" style="margin-top: 8px; font-size: 11px; color: var(--text-2); font-style: italic; background: rgba(255,255,255,0.02); border-left: 2px solid rgba(255,255,255,0.15); padding: 4px 8px; border-radius: 0 4px 4px 0; word-break: break-word;">
                 "${esc(s.note)}"
               </div>`
            : '';

          return `
          <div class="session-row" style="flex-direction:column; align-items:stretch; padding:16px 20px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <div class="session-row-time">${fmtTime(s.duration || 0)}</div>
                  <span class="session-mode-badge" style="font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; padding:2px 6px; border-radius:4px; background:${s.mode === 'pomodoro' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)'}; color:${s.mode === 'pomodoro' ? '#ef4444' : 'var(--text-3)'}; border:1px solid ${s.mode === 'pomodoro' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'};">${s.mode === 'pomodoro' ? 'POMODORO' : 'SERBEST'}</span>
                </div>
                <div class="session-row-date">${fmtDate(s.start_time)}</div>
              </div>
              <div class="session-badge ${s.status === 'completed' ? 'ok' : 'fail'}">
                ${s.status === 'completed' ? 'TAMAM' : s.status === 'violated' ? 'İHLAL' : 'TERK'}
              </div>
            </div>
            ${detailsHtml}
            ${noteHtml}
          </div>`;
        }).join('')}</div>`;
  } else if (_profileActiveTab === 'reposts') {
    tabContentHtml = reposts.length === 0
      ? `<div class="profile-empty-tab">HENÜZ REPOST YOK</div>`
      : `<div class="profile-post-grid">${reposts.map(p => renderPostGridItem(p, false, true)).join('')}</div>`;
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
// POST GRID ITEM
// ============================================================
function renderPostGridItem(p, isOwn, isRepost) {
  const hasImage = !!p.image;
  const thumb = hasImage
    ? `<img src="${p.image}" class="profile-grid-thumb" loading="lazy">`
    : `<div class="profile-grid-text"><span>${esc((p.content || '').slice(0, 80))}</span></div>`;

  const list = isRepost ? _profileUserReposts : _profileUserPosts;
  const idx = list.findIndex(x => x.id === p.id);

  return `
    <div class="profile-grid-item" onclick="openGlobalPostModal(${p.id})">
      ${thumb}
      ${(p.like_count > 0 || p.comment_count > 0) ? `
        <div class="profile-grid-overlay">
          <span>♥ ${p.like_count || 0}</span>
          <span>💬 ${p.comment_count || 0}</span>
        </div>` : ''}
    </div>
  `;
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
