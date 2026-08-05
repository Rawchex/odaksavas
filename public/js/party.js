/* ============================================================
   PARTY.JS — Redesigned Monochrome Party/Lobby/Friend System
   ============================================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
let _activePartyId     = null;
let _partyRefreshInt   = null;
let _partiesCache      = [];
let _currentPartyTab   = 'lobby'; // 'lobby' | 'friends' | 'manage'
let _partyRefreshInFlight = false;
let _partyRefreshQueued   = false;
let _partyModalLastHtml   = '';

// ============================================================
// PARTY MODAL
// ============================================================
async function openPartyModal() {
  const modal   = document.getElementById('partyModal');
  const content = document.getElementById('partyModalContent');
  if (!modal) return;

  // Rapid taps previously created concurrent pollers/renders and made the
  // modal visibly flash on mobile.
  if (modal.classList.contains('open')) return;

  modal.style.display = 'flex';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (content && !content.children.length) {
    content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#949ba4;font-size:13px;font-weight:700;">YÜKLENİYOR...</div>';
  }

  await refreshPartyModal();

  // Poll active states periodically
  if (_partyRefreshInt) clearInterval(_partyRefreshInt);
  _partyRefreshInt = setInterval(() => {
    if (!modal.classList.contains('open') || modal.style.display === 'none') {
      clearInterval(_partyRefreshInt);
      _partyRefreshInt = null;
      return;
    }

    if (document.hidden) {
      return;
    }

    // Skip refresh if user is typing in any input inside the modal
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && modal.contains(activeEl)) {
      return;
    }

    // Skip refresh if the inline party create form is open
    const createForm = document.getElementById('inlinePartyCreateForm');
    if (createForm && createForm.style.display !== 'none') {
      return;
    }

    refreshPartyModal();
  }, 4000);
}

function closePartyModal() {
  const modal = document.getElementById('partyModal');
  if (modal) {
    // The same shell hosts the room browser and the management console.
    // Reset both modes so a later regular room browse cannot inherit the
    // console's fixed desktop/mobile dimensions.
    modal.classList.remove('open', 'room-management-open');
    modal.style.display = 'none';
  }
  document.body.style.overflow = '';
  if (_partyRefreshInt) {
    clearInterval(_partyRefreshInt);
    _partyRefreshInt = null;
  }
  _partyRefreshQueued = false;
  _partyModalLastHtml = '';
}

async function refreshPartyModal() {
  if (_partyRefreshInFlight) {
    _partyRefreshQueued = true;
    return;
  }

  _partyRefreshInFlight = true;
  try {
    await renderPartyModalContent();
  } finally {
    _partyRefreshInFlight = false;
    if (_partyRefreshQueued) {
      _partyRefreshQueued = false;
      requestAnimationFrame(() => refreshPartyModal());
    }
  }
}

async function renderPartyModalContent() {
  const content = document.getElementById('partyModalContent');
  if (!content) return;

  // Check if user has management permissions
  let activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
  let canManageParty = false;
  if (activeParty) {
    try {
      const detailRes = await fetch(`/api/parties/${activeParty.id}`);
      if (detailRes.ok) {
        const party = await detailRes.json();
        const meMember = party.members.find(m => m.username === currentUser?.username);
        const isOwner = Boolean(
          (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
          (party.owner_name && currentUser?.username && party.owner_name === currentUser.username)
        );
        canManageParty = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember.role));
      }
    } catch(e) {}
  }

  let html = `
    <div class="focus-rooms-modal-header">
      <div class="focus-rooms-modal-title-wrap">
        <div class="focus-rooms-modal-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5865f2" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>BLUNK ODALARI</span>
        </div>
        <div class="focus-rooms-modal-divider"></div>
        <div class="focus-rooms-modal-tabs" role="tablist" aria-label="Blunk odaları görünümleri">
          <button class="discord-action-btn ${_currentPartyTab === 'lobby' ? 'primary' : ''}" style="padding:6px 14px; font-size:12px;" onclick="switchPartyTab('lobby')" data-tooltip="Odalar & Aktif Lobi" data-tooltip-pos="bottom">
            Odalar
          </button>
          <button class="discord-action-btn ${_currentPartyTab === 'friends' ? 'primary' : ''}" style="padding:6px 14px; font-size:12px;" onclick="switchPartyTab('friends')" data-tooltip="Arkadaş Listeniz & Davet Et" data-tooltip-pos="bottom">
            Arkadaşlar
          </button>
        </div>
      </div>
      <button onclick="closePartyModal()" class="discord-action-btn icon-only" data-tooltip="Kapat (ESC)" data-tooltip-pos="left" style="border-radius:50%; width:32px; height:32px; padding:0;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="partyModalScrollArea" class="focus-rooms-modal-body">
      <div id="voiceHandoverBanner" class="voice-handover-banner" style="display:none;"></div>
  `;

  try {
    if (_currentPartyTab === 'lobby') {
      html += await buildLobbyTabHtml();
    } else if (_currentPartyTab === 'friends') {
      html += await buildFriendsTabHtml();
    } else if (_currentPartyTab === 'manage') {
      html += await buildManageTabHtml();
    }
  } catch (err) {
    html += `<div style="text-align:center;padding:20px;color:#ef4444;font-size:12px">HATA OLUŞTU: ${err.message}</div>`;
  }

  html += `</div>`; // Close scrollable body

  // Avoid destroying/rebuilding the same tree on each poll. Besides removing
  // flicker, this keeps scroll position and any in-progress selection intact.
  if (_partyModalLastHtml !== html) {
    const oldScrollArea = content.querySelector('#partyModalScrollArea');
    const scrollTop = oldScrollArea ? oldScrollArea.scrollTop : 0;
    const activeElement = document.activeElement;
    const focusedId = activeElement && content.contains(activeElement) ? activeElement.id : '';

    content.innerHTML = html;
    _partyModalLastHtml = html;

    const newScrollArea = content.querySelector('#partyModalScrollArea');
    if (newScrollArea) newScrollArea.scrollTop = scrollTop;
    if (focusedId) {
      const replacement = document.getElementById(focusedId);
      if (replacement && typeof replacement.focus === 'function') replacement.focus({ preventScroll: true });
    }
  }

  // Trigger multi-device voice handover check
  if (typeof checkAndRenderHandoverButton === 'function') {
    checkAndRenderHandoverButton(window._currentPartyId);
  }

  if (_currentPartyTab === 'lobby') {
    let activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
    if (activeParty) {
      populateLobbyInviteFriendsList(activeParty);
    }
  }

  // Load banned users if on manage tab
  if (_currentPartyTab === 'manage') {
    setTimeout(() => loadBannedUsers(), 100);
  }
}

function switchPartyTab(tab) {
  if (_currentPartyTab === tab) return;
  _currentPartyTab = tab;
  refreshPartyModal();
}

// ============================================================
// LOBBY / PARTY TAB BUILDER
// ============================================================
async function buildLobbyTabHtml() {
  const res = await fetch('/api/parties');
  _partiesCache = await res.json();

  let activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
  let html = '';

  if (activeParty) {
    const detailRes = await fetch(`/api/parties/${activeParty.id}`);
    if (!detailRes.ok) throw new Error('Oda bilgisi alınamadı');
    const party = await detailRes.json();
    const isOwner = Boolean(
      (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
      (party.owner_name && currentUser?.username && party.owner_name === currentUser.username)
    );
    const meMember = party.members.find(m => m.username === currentUser?.username);
    const canRename = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember.role));
    const canAddChannel = isOwner || (meMember && ['owner', 'admin'].includes(meMember.role));
    const canManage = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember.role));

    html += `
      <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">AKTİF LOBİNİZ</div>
      <div class="lobby-desktop-layout">
        <div class="lobby-left-panel">
          <div class="lobby-header-row">
            <div class="lobby-title-text">${esc(party.name)}</div>
            ${(canRename || canAddChannel || canManage) ? `
              <div class="lobby-title-actions">
                ${canManage ? `<button onclick="if(window.RoomManagement) RoomManagement.open();" class="lobby-title-btn" data-tooltip="Oda Yönetimi" data-tooltip-pos="top"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>` : ''}
                ${canRename ? `<button onclick="triggerPartyRenameFromHeader()" class="lobby-title-btn" data-tooltip="Oda Adını Değiştir" data-tooltip-pos="top"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>` : ''}
                ${canAddChannel ? `<button onclick="promptAddChannel()" class="lobby-title-btn" data-tooltip="Alt Ses Kanalı Oluştur" data-tooltip-pos="top"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>` : ''}
              </div>
            ` : ''}
          </div>
          <div class="lobby-meta">Kurucu: <strong class="lobby-owner">@${esc(party.owner_name)}</strong> · ${party.members.length} Üye</div>
          
          <div class="lobby-section-title">ÜYE ODAK DURUMLARI</div>
          <div class="lobby-members-grid">
            ${party.members.map(m => {
              const isActive = m.active_session_id !== null;
              const isMe = m.username === currentUser.username;
              return `
                <div class="lobby-member-card ${isActive ? 'active' : 'idle'}" onclick="openUserVoiceModal('${esc(m.username)}')" data-tooltip="@${esc(m.username)} ses & üye yönetimi" data-tooltip-pos="top">
                  <div class="lobby-member-left">
                    ${renderAvatar(m, 'avatar avatar-sm')}
                    <span class="lobby-member-name">${esc(m.username)} ${isMe ? '<span class="lobby-self-tag">(sen)</span>' : ''}</span>
                  </div>
                  <span class="lobby-member-status">${isActive ? '● ODAKTA' : 'BOŞTA'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="lobby-right-panel">
          <div class="lobby-actions-container">
            <button class="lobby-focus-btn" onclick="startSessionInParty(${party.id}); closePartyModal()" data-tooltip="Odadaki arkadaşlarınla birlikte odağa başla" data-tooltip-pos="top">
              <svg viewBox="0 0 24 24" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Birlikte Odaklan</span>
            </button>

            <div class="lobby-section-title" style="margin-top: 4px;">DAVET BAĞLANTISI</div>
            <div class="lobby-invite-box">
              <div class="lobby-invite-input-wrap">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                <input type="text" readonly value="${party.invite_code || party.id}" class="lobby-invite-input" onclick="this.select()">
                <button class="lobby-copy-btn" onclick="copyPartyInviteCode('${party.invite_code || party.id}')" data-tooltip="Davet Bağlantısını Kopyala" data-tooltip-pos="top">
                  Kopyala
                </button>
              </div>
              ${canManage ? `
                <button class="lobby-icon-btn" onclick="regeneratePartyInviteCode(${party.id})" data-tooltip="Yeni Davet Kodu Üret" data-tooltip-pos="top">
                  <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                </button>
              ` : ''}
              <button class="lobby-icon-btn ${isOwner ? 'danger' : ''}" onclick="${isOwner ? 'deleteParty' : 'leaveParty'}(${party.id})" data-tooltip="${isOwner ? 'Lobiyi Sil' : 'Ayrıl'}" data-tooltip-pos="top">
                ${isOwner 
                  ? `<svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
                  : `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
                }
              </button>
            </div>
            
            <div class="lobby-section-title">ARKADAŞLARINI DAVET ET</div>
            <input class="lobby-search-input" id="lobbyInviteSearchInput" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Arkadaş veya kullanıcı adı ara..." oninput="handleLobbyInviteSearch(this.value)">
            <div id="lobbyInviteFriendsList" class="lobby-friends-list">
              <div id="lobbyInviteFriendsItems"></div>
              <div id="lobbyInviteOtherResults"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="lobby-welcome-dashboard">
        <div class="lobby-welcome-grid">
          <div class="lobby-welcome-card create" onclick="togglePartyCreateForm(true)" id="btnShowCreateParty">
            <div class="lobby-welcome-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="lobby-welcome-info">
              <div class="lobby-welcome-title">Yeni Lobi Oluştur</div>
              <div class="lobby-welcome-desc">Kendi sesli odaklanma odanı kur ve arkadaşlarını davet et.</div>
            </div>
          </div>
          
          <div class="lobby-welcome-card join" onclick="promptJoinByCode()">
            <div class="lobby-welcome-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            </div>
            <div class="lobby-welcome-info">
              <div class="lobby-welcome-title">Kod İle Katıl</div>
              <div class="lobby-welcome-desc">Davet kodu veya bağlantısı girerek bir lobiye katıl.</div>
            </div>
          </div>
        </div>
        
        <div id="inlinePartyCreateForm" class="lobby-create-form">
          <div class="lobby-create-title">LOBİ OLUŞTUR</div>
          <input class="lobby-search-input" id="inlineCreatePartyName" name="party_name_rand_field" autocomplete="new-password" placeholder="Lobi Adı (Örn: Gececi Tayfa)" style="margin:0;">
          
          <div class="lobby-section-title" style="margin-top:4px;">DAVET EDİLECEK ARKADAŞLAR</div>
          <div id="lobbyCreateFriendsList" class="lobby-friends-list" style="max-height:120px;"></div>
          
          <label class="lobby-checkbox-label">
            <input type="checkbox" id="inlineCreatePartyPrivate"> Gizli Lobi (Sadece davetle katılınabilir)
          </label>
          <div class="lobby-form-buttons">
            <button class="discord-action-btn primary" style="padding:6px 14px; font-size:12px;" onclick="submitCreateParty()">OLUŞTUR</button>
            <button class="discord-action-btn" style="padding:6px 14px; font-size:12px;" onclick="togglePartyCreateForm(false)">İPTAL</button>
          </div>
        </div>
      </div>

      <div class="lobby-section-title" style="margin-top:20px; margin-bottom:8px;">GENEL ODALARI ARA</div>
      <div style="margin-bottom:12px;">
        <input class="lobby-search-input" id="partySearchInModal" autocomplete="off" placeholder="Oda adı veya kurucu yazın..." oninput="filterPartiesModal()">
      </div>

      <div id="partyModalList">
        ${buildPublicPartiesListHtml(_partiesCache)}
      </div>
    `;
  }

  // Pending invites to join parties
  const invitesRes = await fetch('/api/parties/invites/pending');
  const invites = await invitesRes.json();
  if (invites && invites.length > 0) {
    html += `
      <div class="lobby-section-title" style="margin-top:16px;">GELEN LOBİ DAVETLERİ</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${invites.map(inv => `
          <div class="lobby-card">
            <div style="flex:1; font-size:12px; color:var(--t-text-primary);">
              <strong style="color:var(--t-accent-primary);">@${esc(inv.from_username)}</strong> sizi <strong>${esc(inv.party_name)}</strong> odasına çağırıyor.
            </div>
            <div style="display:flex; gap:6px;">
              <button class="mono-btn-primary" style="padding:6px 12px; font-size:9.5px; width:auto; border-radius:8px;" onclick="acceptPartyInvite(${inv.id})">KATIL</button>
              <button class="mono-btn-secondary" style="padding:6px 12px; font-size:9.5px; width:auto; border-radius:8px;" onclick="rejectPartyInvite(${inv.id})">REDDET</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return html;
}

function buildPublicPartiesListHtml(parties) {
  const filtered = parties.filter(p => p.owner_id !== currentUser.id && p.is_member === 0);
  if (!filtered.length) {
    return `<div style="text-align:center; padding:24px; font-size:12.5px; color:var(--t-text-muted); font-weight:600;">AKTİF GENEL LOBİ YOK</div>`;
  }
  return filtered.map(p => `
    <div class="lobby-card">
      <div style="flex:1; min-width:0; padding-right:8px;">
        <div style="font-size:14px; font-weight:800; color:var(--t-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.name)}</div>
        <div style="font-size:11px; color:var(--t-text-muted); margin-top:2px;">Kurucu: <strong>@${esc(p.owner_name)}</strong> · ${p.member_count} üye</div>
      </div>
      <button class="discord-action-btn primary" style="padding:6px 14px; font-size:12px; flex-shrink:0;" onclick="joinParty(${p.id})" data-tooltip="${esc(p.name)} odasına katıl" data-tooltip-pos="left">KATIL</button>
    </div>
  `).join('');
}

function filterPartiesModal() {
  const container = document.getElementById('partyModalList');
  if (!container) return;
  const search = (document.getElementById('partySearchInModal')?.value || '').toLowerCase();
  
  const filtered = _partiesCache.filter(p => 
    (p.owner_id !== currentUser.id && p.is_member === 0) &&
    (!search || p.name.toLowerCase().includes(search) || (p.owner_name || '').toLowerCase().includes(search))
  );

  container.innerHTML = buildPublicPartiesListHtml(filtered);
}

// ============================================================
// MANAGEMENT TAB BUILDER
// ============================================================
async function buildManageTabHtml() {
  const activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
  if (!activeParty) {
    return `<div style="text-align:center;padding:24px;font-size:13px;color:#949ba4;font-weight:600">Aktif bir odanız yok</div>`;
  }

  const detailRes = await fetch(`/api/parties/${activeParty.id}`);
  if (!detailRes.ok) throw new Error('Oda bilgisi alınamadı');
  const party = await detailRes.json();

  const meMember = party.members.find(m => m.username === currentUser?.username);
  const isOwner = Boolean(
    (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username)
  );
  const myRole = meMember?.role || (isOwner ? 'owner' : 'member');

  // Permission checks
  const canManageMembers = ['owner', 'admin'].includes(myRole);
  const canManageChannels = ['owner', 'admin', 'moderator'].includes(myRole);
  const canManagePartySettings = ['owner', 'admin'].includes(myRole);

  let html = `
    <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">ODA BİLGİLERİ</div>
    <div class="focus-room-active-card" style="background:#1e1f22; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div style="font-size:18px;font-weight:900;color:#fff;text-transform:uppercase;word-break:break-word">${esc(party.name)}</div>
        ${canManagePartySettings ? `
          <button onclick="triggerPartyRenameFromHeader()" class="discord-action-btn icon-only" data-tooltip="Oda Adını Değiştir" data-tooltip-pos="top">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        ` : ''}
      </div>
      <div style="font-size:12px;color:#949ba4;margin-bottom:12px">Kurucu: <strong style="color:#f2f3f5">@${esc(party.owner_name)}</strong> · ${party.members.length} Üye · ${party.channels?.length || 1} Kanal</div>
      <div style="font-size:11px;color:#6b7280;font-weight:600;">Senin rolün: <span style="color:${myRole === 'owner' ? '#fbbf24' : myRole === 'admin' ? '#c084fc' : myRole === 'moderator' ? '#60a5fa' : '#80848e'}">${myRole === 'owner' ? 'KURUCU' : myRole === 'admin' ? 'YÖNETİCİ' : myRole === 'moderator' ? 'MODERATÖR' : 'ÜYE'}</span></div>
    </div>
  `;

  // Channel Management
  if (canManageChannels) {
    html += `
      <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">KANALLAR</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
        ${(party.channels || [{id: party.default_channel_id, name: 'Genel'}]).map((ch, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:#111214;border:1px solid rgba(255,255,255,0.06);padding:12px 16px;border-radius:12px;">
            <div style="display:flex;align-items:center;gap:10px">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#949ba4" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <span style="font-size:13px;font-weight:700;color:#fff">${esc(ch.name)}</span>
            </div>
            <div style="display:flex;gap:6px;">
              ${canManageChannels ? `
                ${idx > 0 ? `
                  <button onclick="reorderChannel(${ch.id}, -1)" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#4e5058;" data-tooltip="Yukarı Taşı" data-tooltip-pos="top">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                ` : ''}
                ${idx < (party.channels?.length || 1) - 1 ? `
                  <button onclick="reorderChannel(${ch.id}, 1)" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#4e5058;" data-tooltip="Aşağı Taşı" data-tooltip-pos="top">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                ` : ''}
                <button onclick="promptEditChannel(${ch.id}, '${esc(ch.name)}', ${ch.user_limit || 0})" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#4e5058;" data-tooltip="Kanalı Düzenle" data-tooltip-pos="top">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              ` : ''}
              ${canManagePartySettings && ch.id !== party.default_channel_id ? `
                <button onclick="deleteChannel(${party.id}, ${ch.id})" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#da373c;" data-tooltip="Kanalı Sil" data-tooltip-pos="top">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
        ${canManagePartySettings ? `
          <button onclick="promptAddChannel()" class="discord-action-btn" style="padding:12px 20px;font-size:13px;font-weight:700;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span style="color:#ffffff !important;">Yeni Kanal Ekle</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  // Member Management
  html += `
    <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">ÜYELER</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${party.members.map(m => {
        const isMe = m.username === currentUser.username;
        const canEditThisMember = canManageMembers && !isMe && m.role !== 'owner';
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:#111214;border:1px solid rgba(255,255,255,0.06);padding:12px 16px;border-radius:12px;">
            <div style="display:flex;align-items:center;gap:10px">
              ${renderAvatar(m, 'avatar avatar-sm')}
              <div>
                <div style="font-size:13px;font-weight:700;color:#fff">${esc(m.username)} ${isMe ? '<span style="font-size:10px;color:#949ba4;font-weight:400"> (sen)</span>' : ''}</div>
                <div style="font-size:10px;color:${m.role === 'owner' ? '#fbbf24' : m.role === 'admin' ? '#c084fc' : m.role === 'moderator' ? '#60a5fa' : '#80848e'};font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">${m.role === 'owner' ? 'KURUCU' : m.role === 'admin' ? 'YÖNETİCİ' : m.role === 'moderator' ? 'MODERATÖR' : 'ÜYE'}</div>
              </div>
            </div>
            ${canEditThisMember ? `
              <div style="display:flex;gap:6px;">
                <button onclick="openUserVoiceModal('${esc(m.username)}')" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#4e5058;" data-tooltip="Üye Yönetimi" data-tooltip-pos="top">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Ban Management (only for owner and admin)
  if (canManageMembers) {
    html += `
      <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; margin-top:24px;">BANLANMIŞ KULLANICILAR</div>
      <div id="bannedUsersList" style="display:flex;flex-direction:column;gap:8px;">
        <div style="text-align:center;padding:16px;font-size:12px;color:#949ba4;font-weight:600">Yükleniyor...</div>
      </div>
    `;
  }

  return html;
}

// Load banned users for the party
async function loadBannedUsers() {
  const partyId = window._currentPartyId || _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id)?.id;
  if (!partyId) return;

  const container = document.getElementById('bannedUsersList');
  if (!container) return;

  try {
    const res = await fetch(`/api/parties/${partyId}/bans`);
    const bans = await res.json();

    if (!bans || bans.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:#949ba4;font-weight:600">Banlanmış kullanıcı yok</div>';
      return;
    }

    container.innerHTML = bans.map(ban => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#111214;border:1px solid rgba(239,68,68,0.2);padding:12px 16px;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:#2d2d2d;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#949ba4;">${ban.username?.charAt(0).toUpperCase() || '?'}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#fff">${esc(ban.username || 'Bilinmeyen')}</div>
            <div style="font-size:10px;color:#ef4444;font-weight:600;">Banlayan: @${esc(ban.banned_by_username || 'Sistem')} · ${new Date(ban.created_at).toLocaleDateString('tr-TR')}</div>
          </div>
        </div>
        <button onclick="unbanUser(${partyId}, ${ban.user_id})" class="discord-action-btn icon-only" style="width:32px;height:32px;padding:0;border-radius:8px;background:#23a55a;" data-tooltip="Banı Aç" data-tooltip-pos="top">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
    `).join('');
  } catch(e) {
    console.error('Load banned users error:', e);
    container.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:#ef4444;font-weight:600">Yüklenemedi</div>';
  }
}

// Unban a user
async function unbanUser(partyId, userId) {
  if (!confirm('Bu kullanıcının banını açmak istediğine emin misin?')) return;

  try {
    const res = await fetch(`/api/parties/${partyId}/bans/${userId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Ban açıldı');
      loadBannedUsers();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Ban açılamadı');
    }
  } catch(e) {
    console.error('Unban error:', e);
    showToast('Hata oluştu');
  }
}

async function deleteChannel(partyId, channelId) {
  if (!confirm('Bu kanalı silmek istediğine emin misin?')) return;

  try {
    const res = await fetch(`/api/parties/${partyId}/channels/${channelId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Kanal silindi');
      refreshPartyModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Kanal silinemedi');
    }
  } catch(e) {
    console.error('Delete channel error:', e);
    showToast('Hata oluştu');
  }
}

function promptEditChannel(chanId, currentName, currentLimit) {
  const partyId = window._currentPartyId || _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id)?.id;
  if (!partyId) {
    showToast('Oda bulunamadı');
    return;
  }
  if (typeof openChannelConfigModal === 'function') {
    openChannelConfigModal('edit_channel', { channelId: chanId, currentName, currentLimit });
  }
}

async function reorderChannel(chanId, direction) {
  const partyId = window._currentPartyId || _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id)?.id;
  if (!partyId) {
    showToast('Oda bulunamadı');
    return;
  }

  try {
    const res = await fetch(`/api/parties/${partyId}/channels/${chanId}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction })
    });
    if (res.ok) {
      showToast('Kanal sıralaması güncellendi');
      refreshPartyModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Sıralama güncellenemedi');
    }
  } catch(e) {
    console.error('Reorder channel error:', e);
    showToast('Hata oluştu');
  }
}

async function buildFriendsTabHtml() {
  const pRes = await fetch('/api/parties');
  _partiesCache = await pRes.json();

  const friendsRes = await fetch('/api/friends');
  const friends = await friendsRes.json();

  const reqRes = await fetch('/api/friends/requests');
  const requests = await reqRes.json();

  let html = `
    <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">ARKADAŞLARINIZ</div>
    <div class="lobby-desktop-layout">
      <div class="lobby-left-panel">
        <div class="lobby-section-title" style="margin-top:0;">KULLANICI ARA & EKLE</div>
        <div class="lobby-invite-box" style="margin-bottom:12px;">
          <div class="lobby-invite-input-wrap">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--t-text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              class="lobby-invite-input"
              id="friendSearchInput"
              placeholder="Kullanıcı adı ile ara..."
              autocomplete="off"
              oninput="debouncedFriendSearch(this.value)"
            >
          </div>
        </div>
        <div id="friendSearchResults" style="display:flex; flex-direction:column; gap:6px;"></div>

        ${requests.length > 0 ? `
          <div class="lobby-section-title" style="margin-top:16px;">GELEN İSTEKLER (${requests.length})</div>
          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px;">
            ${requests.map(req => `
              <div class="lobby-friend-row" style="cursor:pointer;" onclick="closePartyModal(); openUserModal('${esc(req.username)}')">
                <div class="lobby-friend-left">
                  ${renderAvatar(req, 'avatar avatar-xs')}
                  <div>
                    <div class="lobby-friend-name">@${esc(req.username)}</div>
                    <div style="font-size:10px; color:var(--t-text-muted);">Profili görmek için dokun</div>
                  </div>
                </div>
                <div style="display:flex; gap:6px;" onclick="event.stopPropagation()">
                  <button class="discord-action-btn primary" style="padding:6px 12px; font-size:11px;" onclick="acceptFriendRequestBtn(${req.id})">Kabul</button>
                  <button class="discord-action-btn danger" style="padding:6px 12px; font-size:11px; background:#ef4444 !important; border:none !important;" onclick="rejectFriendRequestBtn(${req.id})">Ret</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      
      <div class="lobby-right-panel">
        <div class="lobby-section-title" style="margin-top:0;">ARKADAŞ LİSTESİ (${friends.length})</div>
        <div id="lobbyFriendsList" class="lobby-friends-list" style="max-height:360px; overflow-y:auto; background:transparent !important; padding:0 !important; gap:6px;">
          ${friends.length === 0
            ? `<div style="text-align:center; padding:24px; font-size:12.5px; color:var(--t-text-muted); font-weight:600;">ARKADAŞ LİSTENİZ BOŞ</div>`
            : friends.map(f => {
                const activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
                const inviteBtn = activeParty
                  ? `<button class="discord-action-btn primary" style="padding:6px 12px; font-size:11px;" onclick="event.stopPropagation(); inviteFriendToParty(${activeParty.id}, '${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısını aktif lobiye çağır" data-tooltip-pos="left">Lobiye Davet Et</button>`
                  : '';
                const dmBtn = `<button class="discord-action-btn" style="padding:6px 12px; font-size:11px;" onclick="event.stopPropagation(); closePartyModal(); showPage('messages'); openDirectChat('${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısına direkt mesaj gönder" data-tooltip-pos="top">Mesaj</button>`;
                return `
                  <div class="lobby-friend-row" style="cursor:pointer;" onclick="closePartyModal(); openUserModal('${esc(f.username)}')">
                    <div class="lobby-friend-left">
                      ${renderAvatar(f, 'avatar avatar-xs')}
                      <div>
                        <div class="lobby-friend-name">@${esc(f.username)}</div>
                        <div style="font-size:10.5px; color:var(--t-text-muted); margin-top:2px;">Lvl ${f.level || 1} · ${f.is_online ? '<span style="color:#23a55a; font-weight:700;">Çevrimiçi</span>' : 'Çevrimdışı'}</div>
                      </div>
                    </div>
                    <div style="display:flex; gap:6px;" onclick="event.stopPropagation()">
                      ${dmBtn}
                      ${inviteBtn}
                    </div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>
    </div>
  `;

  return html;
}

// ============================================================
// LIVE FRIEND SEARCH
// ============================================================
let _friendSearchTimer = null;
function debouncedFriendSearch(value) {
  clearTimeout(_friendSearchTimer);
  const q = value.trim();
  const container = document.getElementById('friendSearchResults');
  if (!container) return;
  if (!q || q.length < 1) {
    container.innerHTML = '';
    return;
  }
  _friendSearchTimer = setTimeout(() => doFriendSearch(q), 300);
}

async function doFriendSearch(q) {
  const container = document.getElementById('friendSearchResults');
  if (!container) return;
  container.innerHTML = `<div style="font-size:10px;color:#555;padding:8px 0">ARANIYOR...</div>`;
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const users = await res.json();
    if (!users.length) {
      container.innerHTML = `<div style="font-size:11px;color:#444;padding:8px 0;font-weight:700">SONUÇ YOK</div>`;
      return;
    }
    container.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#0a0a0a;border:1px solid #1a1a1a;padding:8px 12px">
        <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="closePartyModal();openUserModal('${esc(u.username)}')">
          ${renderAvatar(u, 'avatar avatar-sm')}
          <div>
            <div style="font-weight:700;color:#fff;font-size:13px">${esc(u.username)}</div>
            <div style="font-size:10px;color:#555">Lvl ${u.level}</div>
          </div>
        </div>
        <button
          class="mono-btn-primary"
          style="width:auto;padding:6px 12px;font-size:9px"
          onclick="sendFriendReqFromSearch('${esc(u.username)}', this)"
        >ARKADAŞ EKLE</button>
      </div>
    `).join('');
  } catch {
    container.innerHTML = `<div style="color:#ff3b30;font-size:10px;padding:8px 0">HATA OLUŞTU</div>`;
  }
}

async function sendFriendReqFromSearch(username, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  const res = await fetch(`/api/friends/request/${encodeURIComponent(username)}`, { method: 'POST' });
  if (res.ok) {
    showToast('Arkadaşlık isteği gönderildi!');
    if (btn) { btn.textContent = 'GÖÖNDERİLDİ'; btn.style.opacity = '0.5'; }
  } else {
    const d = await res.json().catch(() => ({}));
    showToast(d.error || 'Gönderilemedi');
    if (btn) { btn.disabled = false; btn.textContent = 'ARKADAŞ EKLE'; }
  }
}

// ============================================================
// FRIEND API WRAPPERS
// ============================================================
async function acceptFriendRequestBtn(id) {
  const res = await fetch(`/api/friends/accept/${id}`, { method: 'POST' });
  if (res.ok) {
    showToast('Arkadaşlık isteği kabul edildi!');
    refreshPartyModal();
  }
}

async function rejectFriendRequestBtn(id) {
  const res = await fetch(`/api/friends/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('İstek reddedildi');
    refreshPartyModal();
  }
}

async function sendFriendRequestBtn() {
  // Legacy fallback — now search-driven
  const input = document.getElementById('friendSearchInput');
  const username = input?.value?.trim();
  if (!username) return;
  await sendFriendReqFromSearch(username, null);
  if (input) input.value = '';
  const r = document.getElementById('friendSearchResults');
  if (r) r.innerHTML = '';
}


async function inviteFriendToParty(partyId, username) {
  const res = await fetch(`/api/parties/${partyId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username })
  });
  if (res.ok) {
    showToast(`${username} davet edildi`);
  } else {
    const d = await res.json().catch(() => ({}));
    showToast(d.error || 'Davet gönderilemedi');
  }
}

// ============================================================
// PARTY MECHANICS WRAPPERS
// ============================================================
// ============================================================
// PARTY MECHANICS WRAPPERS (Simplified Selection System)
// ============================================================
let _lobbyFriendsCache = [];
let _lobbyActiveParty = null;
let _lobbySearchTimer = null;

async function populateLobbyInviteFriendsList(party) {
  const container = document.getElementById('lobbyInviteFriendsList');
  if (!container) return;
  
  const itemsContainer = document.getElementById('lobbyInviteFriendsItems');
  if (itemsContainer) itemsContainer.innerHTML = '<div style="font-size:10px;color:#555;padding:6px">Yükleniyor...</div>';
  
  try {
    const friendsRes = await fetch('/api/friends');
    const friends = await friendsRes.json();
    
    _lobbyFriendsCache = friends;
    _lobbyActiveParty = party;
    
    renderLobbyInviteFriends();
  } catch (err) {
    if (itemsContainer) itemsContainer.innerHTML = '<div style="font-size:10px;color:red;padding:6px">Hata oluştu</div>';
  }
}

function renderLobbyInviteFriends() {
  const container = document.getElementById('lobbyInviteFriendsItems');
  if (!container || !_lobbyActiveParty) return;
  
  const searchVal = (document.getElementById('lobbyInviteSearchInput')?.value || '').toLowerCase().trim();
  const memberUsernames = new Set((_lobbyActiveParty.members || []).map(m => m.username));
  
  const filteredFriends = _lobbyFriendsCache.filter(f => 
    f.username.toLowerCase().includes(searchVal)
  );
  
  if (filteredFriends.length === 0 && searchVal === '') {
    container.innerHTML = '<div style="font-size:11px;color:var(--t-text-muted);padding:8px;text-align:center">Davet edilecek arkadaş bulunmadı</div>';
    return;
  }
  
  container.innerHTML = filteredFriends.map(f => {
    const isMember = memberUsernames.has(f.username);
    const btnHtml = isMember
      ? `<span style="font-size:11px;color:#23a55a;font-weight:800;letter-spacing:0.5px;padding:4px 8px;background:rgba(35,165,90,0.12);border-radius:6px;">✓ GRUPTA</span>`
      : `<button class="discord-action-btn primary" style="padding:6px 14px !important;font-size:11.5px !important;font-weight:700 !important;border-radius:6px !important;cursor:pointer !important;" onclick="inviteFriendToParty(${_lobbyActiveParty.id}, '${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısını odaya davet et" data-tooltip-pos="left">Davet Et</button>`;
      
    return `
      <div class="lobby-friend-row">
        <div class="lobby-friend-left">
          ${renderAvatar(f, 'avatar avatar-xs')}
          <span class="lobby-friend-name">@${esc(f.username)}</span>
        </div>
        <div>
          ${btnHtml}
        </div>
      </div>
    `;
  }).join('');
}

function handleLobbyInviteSearch(value) {
  renderLobbyInviteFriends();
  
  clearTimeout(_lobbySearchTimer);
  const q = value.trim();
  if (!q) {
    const otherContainer = document.getElementById('lobbyInviteOtherResults');
    if (otherContainer) otherContainer.innerHTML = '';
    return;
  }
  
  _lobbySearchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const users = await res.json();
      renderLobbyInviteOtherUsers(users);
    } catch (err) {
      console.error(err);
    }
  }, 300);
}

function renderLobbyInviteOtherUsers(users) {
  const container = document.getElementById('lobbyInviteOtherResults');
  if (!container || !_lobbyActiveParty) return;
  
  const memberUsernames = new Set((_lobbyActiveParty.members || []).map(m => m.username));
  const friendUsernames = new Set(_lobbyFriendsCache.map(f => f.username));
  const others = users.filter(u => !friendUsernames.has(u.username));
  
  if (others.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = `
    <div style="font-size:9px;color:var(--t-text-muted);font-weight:800;letter-spacing:1px;padding:8px 4px 4px;border-top:1px dashed var(--t-border-subtle);margin-top:6px">DİĞER KULLANICILAR</div>
    ${others.map(u => {
      const isMember = memberUsernames.has(u.username);
      const isMe = u.username === currentUser.username;
      
      let actionHtml = '';
      if (isMe) {
        actionHtml = `<span style="font-size:10px;color:var(--t-text-muted);font-weight:700">SEN</span>`;
      } else if (isMember) {
        actionHtml = `<span style="font-size:10px;color:var(--t-text-muted);font-weight:700">GRUPTA</span>`;
      } else {
        actionHtml = `<button class="mono-btn-primary" style="width:auto;padding:6px 12px;font-size:9.5px;border-radius:6px;" onclick="inviteFriendToParty(${_lobbyActiveParty.id}, '${esc(u.username)}')">DAVET ET</button>`;
      }
      
      return `
        <div class="lobby-friend-row">
          <div class="lobby-friend-left">
            ${renderAvatar(u, 'avatar avatar-xs')}
            <span class="lobby-friend-name">@${esc(u.username)}</span>
          </div>
          <div>
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

async function togglePartyCreateForm(show) {
  const form = document.getElementById('inlinePartyCreateForm');
  const btn = document.getElementById('btnShowCreateParty');
  if (form) form.style.display = show ? 'flex' : 'none';
  if (btn) btn.style.display = show ? 'none' : 'block';
  
  if (show) {
    const container = document.getElementById('lobbyCreateFriendsList');
    if (container) {
      container.innerHTML = '<div style="font-size:10px;color:var(--t-text-muted);padding:4px">Yükleniyor...</div>';
      try {
        const res = await fetch('/api/friends');
        const friends = await res.json();
        if (friends.length === 0) {
          container.innerHTML = '<div style="font-size:10px;color:var(--t-text-muted);padding:4px">Arkadaşınız yok</div>';
          return;
        }
        container.innerHTML = friends.map(f => `
          <label class="lobby-friend-row" style="cursor:pointer; width:100%; box-sizing:border-box;">
            <div class="lobby-friend-left">
              <input type="checkbox" class="lobby-create-invite-check" value="${esc(f.username)}" style="margin:0 4px 0 0;">
              ${renderAvatar(f, 'avatar avatar-xs')}
              <span class="lobby-friend-name">@${esc(f.username)}</span>
            </div>
          </label>
        `).join('');
      } catch (err) {
        container.innerHTML = '<div style="font-size:10px;color:red;padding:4px">Hata oluştu</div>';
      }
    }
  }
}

async function submitCreateParty() {
  const nameInput = document.getElementById('inlineCreatePartyName');
  const privCheck = document.getElementById('inlineCreatePartyPrivate');
  
  const name = nameInput?.value?.trim() || 'Yeni Parti';
  const isPrivate = privCheck?.checked || false;
  
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, isPrivate })
  });

  if (res.ok) {
    const data = await res.json();
    const partyId = data.partyId;
    
    // Send invitations to checked friends
    const checkedBoxes = document.querySelectorAll('.lobby-create-invite-check:checked');
    const invitePromises = Array.from(checkedBoxes).map(box => {
      return inviteFriendToParty(partyId, box.value);
    });
    
    await Promise.all(invitePromises);
    
    showToast('Lobi oluşturuldu!');
    if (typeof setActiveParty === 'function') setActiveParty(partyId);
    if (typeof window.completeFocusRoomOnboarding === 'function') window.completeFocusRoomOnboarding();
    refreshPartyModal();
  } else {
    showToast('Oluşturulamadı');
  }
}

async function joinParty(partyId) {
  const res = await fetch(`/api/parties/${partyId}/join`, { method: 'POST' });
  if (res.ok) {
    showToast('Lobiye katıldın!');
    if (typeof setActiveParty === 'function') setActiveParty(partyId);
    if (typeof window.completeFocusRoomOnboarding === 'function') window.completeFocusRoomOnboarding();
    refreshPartyModal();
  } else {
    const d = await res.json().catch(() => ({}));
    showToast(d.error || 'Katılamadı');
  }
}

async function leaveParty(partyId) {
  const confirmed = await window.showConfirm('Lobiden ayrılmak istiyor musun?');
  if (!confirmed) return false;
  try {
    const res = await fetch(`/api/parties/${partyId}/leave`, { method: 'POST' });
    if (res.ok) {
      showToast('Lobiden ayrıldın');
    } else if (res.status === 404) {
      showToast('Lobi zaten kapatılmış');
    }
  } catch (e) {
    console.warn('leaveParty request error:', e);
  }
  if (typeof stopVoiceChat === 'function') stopVoiceChat(true);
  if (typeof clearActiveParty === 'function') clearActiveParty();
  refreshPartyModal();
  return true;
}

async function deleteParty(partyId) {
  const confirmed = await window.showConfirm('Lobiyi silmek istiyor musun?');
  if (!confirmed) return false;
  try {
    const res = await fetch(`/api/parties/${partyId}/leave`, { method: 'POST' });
    if (res.ok) {
      showToast('Lobi kapatıldı');
    } else if (res.status === 404) {
      showToast('Lobi zaten bulunamadı');
    }
  } catch (e) {
    console.warn('deleteParty request error:', e);
  }
  if (typeof stopVoiceChat === 'function') stopVoiceChat(true);
  if (typeof clearActiveParty === 'function') clearActiveParty();
  refreshPartyModal();
  return true;
}

// submitInlineInvite has been replaced with simplified quick select handlers

async function acceptPartyInvite(inviteId) {
  const res = await fetch(`/api/parties/invites/${inviteId}/accept`, { method: 'POST' });
  if (res.ok) {
    const d = await res.json();
    showToast('Lobiye katıldın!');
    if (d.partyId) {
      if (typeof setActiveParty === 'function') setActiveParty(d.partyId);
      if (typeof window.completeFocusRoomOnboarding === 'function') window.completeFocusRoomOnboarding();
      refreshPartyModal();
    }
  }
}

async function rejectPartyInvite(inviteId) {
  await fetch(`/api/parties/invites/${inviteId}/reject`, { method: 'POST' });
  refreshPartyModal();
}

async function startSessionInParty(partyId) {
  closePartyModal();
  if (typeof setActiveParty === 'function') setActiveParty(partyId);
  showPage('timer');
  showToast('Lobi seçildi. ODAĞA BAŞLA\'ya bas!');
}

// --- INVITE CODE HELPERS ---
async function copyPartyInviteCode(code) {
  const url = `${window.location.origin}/?join=${code}`;
  const text = `📢 BLUNK Sesli Odaklanma Odası Daveti!\n🚀 Odama katıl ve benimle birlikte odaklanmaya başla:\n🔗 ${url}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Oda davet bağlantısı panoya kopyalandı! 📋`);
  } catch {
    if (typeof window.showPrompt === 'function') window.showPrompt('Davet Bağlantınız:', text);
  }
}

async function promptJoinByCode() {
  const code = await window.showPrompt('Odaya katılmak için 8 haneli Davet Kodunu girin:');
  if (!code || !code.trim()) return;

  try {
    const res = await fetch('/api/parties/join-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() })
    });
    const d = await res.json();
    if (res.ok) {
      showToast('Odaya katıldınız!');
      refreshPartyModal();
      if (typeof setActiveParty === 'function') setActiveParty(d.partyId);
    } else {
      showToast(d.error || 'Katılım başarısız');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}

async function regeneratePartyInviteCode(partyId) {
  if (!(await window.showConfirm('Mevcut davet bağlantısı geçersiz kılınacak ve yeni bir kod oluşturulacak. Onaylıyor musunuz?'))) return;
  try {
    const res = await fetch(`/api/parties/${partyId}/regenerate-invite`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      showToast(`Yeni davet kodu üretildi: ${d.inviteCode}`);
      refreshPartyModal();
    } else {
      showToast(d.error || 'Kod yenilenemedi');
    }
  } catch {
    showToast('Bağlantı hatası');
  }
}
