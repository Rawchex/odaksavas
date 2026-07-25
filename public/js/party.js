/* ============================================================
   PARTY.JS — Redesigned Monochrome Party/Lobby/Friend System
   ============================================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
let _activePartyId     = null;
let _partyRefreshInt   = null;
let _partiesCache      = [];
let _currentPartyTab   = 'lobby'; // 'lobby' | 'friends'

// ============================================================
// PARTY MODAL
// ============================================================
async function openPartyModal() {
  const modal   = document.getElementById('partyModal');
  const content = document.getElementById('partyModalContent');
  if (!modal) return;

  modal.classList.add('open');
  content.innerHTML = '<div class="loading-row">YÜKLENİYOR...</div>';

  await refreshPartyModal();

  // Poll active states periodically
  if (_partyRefreshInt) clearInterval(_partyRefreshInt);
  _partyRefreshInt = setInterval(() => {
    if (!modal.classList.contains('open')) {
      clearInterval(_partyRefreshInt);
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
  if (modal) modal.classList.remove('open');
  if (_partyRefreshInt) {
    clearInterval(_partyRefreshInt);
    _partyRefreshInt = null;
  }
}

async function refreshPartyModal() {
  const content = document.getElementById('partyModalContent');
  if (!content) return;

  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid rgba(255,255,255,0.08); background:#18191c; flex-shrink:0;">
      <div style="display:flex; align-items:center; gap:16px;">
        <div style="font-size:16px; font-weight:800; color:#fff; letter-spacing:0.5px; display:flex; align-items:center; gap:8px;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5865f2" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>ODAK ODALARI</span>
        </div>
        <div style="height:18px; width:1px; background:rgba(255,255,255,0.12);"></div>
        <div style="display:flex; gap:8px;">
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
    <div style="flex:1; overflow-y:auto; padding:24px; box-sizing:border-box;">
  `;

  try {
    if (_currentPartyTab === 'lobby') {
      html += await buildLobbyTabHtml();
    } else {
      html += await buildFriendsTabHtml();
    }
  } catch (err) {
    html += `<div style="text-align:center;padding:20px;color:#ef4444;font-size:12px">HATA OLUŞTU: ${err.message}</div>`;
  }

  html += `</div>`; // Close scrollable body

  content.innerHTML = html;

  if (_currentPartyTab === 'lobby') {
    let activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
    if (activeParty) {
      populateLobbyInviteFriendsList(activeParty);
    }
  }
}

function switchPartyTab(tab) {
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
    const canManage = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember.role));

    html += `
      <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">AKTİF LOBİNİZ</div>
      <div style="background:#1e1f22; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="font-size:18px;font-weight:900;color:#fff;text-transform:uppercase;word-break:break-word">${esc(party.name)}</div>
          ${canManage ? `
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button onclick="triggerPartyRenameFromHeader()" class="discord-action-btn" style="font-size:12px;padding:6px 12px;" data-tooltip="Oda Adını Değiştir" data-tooltip-pos="top">✏️ Düzenle</button>
              <button onclick="promptAddChannel()" class="discord-action-btn" style="font-size:12px;padding:6px 12px;" data-tooltip="Alt Ses Kanalı Oluştur" data-tooltip-pos="top">+ Kanal</button>
            </div>
          ` : ''}
        </div>
        <div style="font-size:12px;color:#949ba4;margin-bottom:20px">Kurucu: <strong style="color:#f2f3f5">@${esc(party.owner_name)}</strong> · ${party.members.length} Üye</div>
        
        <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">ÜYE ODAK DURUMLARI</div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px; margin-bottom:24px;">
          ${party.members.map(m => {
            const isActive = m.active_session_id !== null;
            const isMe = m.username === currentUser.username;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#111214;border:1px solid rgba(255,255,255,0.06);padding:10px 14px;border-radius:12px;">
                <div style="display:flex;align-items:center;gap:10px">
                  ${renderAvatar(m, 'avatar avatar-sm')}
                  <span style="font-size:13px;font-weight:700;color:#fff;cursor:${isMe ? 'default' : 'pointer'}" ${isMe ? '' : `onclick="closePartyModal(); openUserPage('${esc(m.username)}')"`}>${esc(m.username)} ${isMe ? '<span style="font-size:10px;color:#949ba4;font-weight:400"> (sen)</span>' : ''}</span>
                </div>
                <span style="font-size:10px;font-weight:800;letter-spacing:0.5px;color:${isActive ? '#23a55a' : '#949ba4'}">${isActive ? '● ODAKTA' : 'BOŞTA'}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          <button class="discord-action-btn primary" style="font-size:14px;padding:14px;width:100%;font-weight:800;" onclick="startSessionInParty(${party.id}); closePartyModal()" data-tooltip="Odadaki arkadaşlarınla birlikte odağa başla" data-tooltip-pos="top">
            🚀 Birlikte Odaklan
          </button>

          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="discord-action-btn" style="flex:1;font-size:12px;padding:10px 14px;" onclick="copyPartyInviteCode('${party.invite_code || party.id}')" data-tooltip="Oda davet bağlantısını pano kopyala" data-tooltip-pos="top">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              <span>Davet Bağlantısını Kopyala (${party.invite_code || party.id})</span>
            </button>
            ${canManage ? `
              <button class="discord-action-btn icon-only" onclick="regeneratePartyInviteCode(${party.id})" data-tooltip="Yeni Davet Kodu Üret (Eski link geçersiz olur)" data-tooltip-pos="left">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              </button>
            ` : ''}
          </div>
          
          <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-top:16px;">ARKADAŞLARINI DAVET ET</div>
          <input class="mono-input" id="lobbyInviteSearchInput" placeholder="Arkadaş veya kullanıcı adı ara..." style="margin-bottom:8px" oninput="handleLobbyInviteSearch(this.value)">
          <div id="lobbyInviteFriendsList" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding:6px; background:#111214; border:1px solid rgba(255,255,255,0.06); border-radius:12px;">
            <div id="lobbyInviteFriendsItems"></div>
            <div id="lobbyInviteOtherResults"></div>
          </div>

          <button class="discord-action-btn ${isOwner ? 'danger' : ''}" style="margin-top:12px; width:100%;" onclick="${isOwner ? 'deleteParty' : 'leaveParty'}(${party.id})" data-tooltip="${isOwner ? 'Odayı kalıcı olarak siler' : 'Lobiden ayrılırsınız'}" data-tooltip-pos="top">
            ${isOwner ? 'LOBİYİ SİL' : 'LOBİDEN AYRIL'}
          </button>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="margin-bottom:20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:12px;">
          <button class="discord-action-btn primary" style="flex:1;font-size:13px;padding:12px;" id="btnShowCreateParty" onclick="togglePartyCreateForm(true)" data-tooltip="Kendi özel oda veya lobinizi kurun" data-tooltip-pos="top">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>+ Yeni Oda Oluştur</span>
          </button>
          <button class="discord-action-btn" style="flex:1;font-size:13px;padding:12px;" onclick="promptJoinByCode()" data-tooltip="8 haneli davet kodu veya bağlantısı ile katıl" data-tooltip-pos="top">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            <span>Kod İle Katıl</span>
          </button>
        </div>
        
        <div id="inlinePartyCreateForm" style="display:none;flex-direction:column;gap:12px;background:#1e1f22;border:1px solid rgba(255,255,255,0.08);padding:20px;border-radius:16px;">
          <div style="font-weight:800;color:#fff;font-size:13px">LOBİ OLUŞTUR</div>
          <input class="mono-input" id="inlineCreatePartyName" placeholder="Lobi Adı (Örn: Gececi Tayfa)" style="margin:0">
          
          <div style="font-size:10px;color:#949ba4;margin-top:4px;font-weight:700;">DAVET EDİLECEK ARKADAŞLAR</div>
          <div id="lobbyCreateFriendsList" style="max-height:140px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding:8px; background:#111214; border:1px solid rgba(255,255,255,0.06); border-radius:10px;"></div>
          
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#dbdee1;cursor:pointer">
            <input type="checkbox" id="inlineCreatePartyPrivate"> Gizli Lobi (Sadece davetle)
          </label>
          <div style="display:flex;gap:10px">
            <button class="discord-action-btn primary" onclick="submitCreateParty()" data-tooltip="Odayı oluştur ve başlat" data-tooltip-pos="top">OLUŞTUR</button>
            <button class="discord-action-btn" onclick="togglePartyCreateForm(false)">İPTAL</button>
          </div>
        </div>
      </div>

      <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">GENEL ODALARI ARA</div>
      <div style="margin-bottom:20px">
        <input class="mono-input" id="partySearchInModal" placeholder="Oda adı veya kurucu yazın..." oninput="filterPartiesModal()">
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
      <div class="mono-sub-header">GELEN LOBİ DAVETLERİ</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${invites.map(inv => `
          <div class="mono-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="flex:1;font-size:12px">
              <strong style="color:#fff">${esc(inv.from_username)}</strong> sizi <strong>${esc(inv.party_name)}</strong> odasına çağırıyor.
            </div>
            <div style="display:flex;gap:6px">
              <button class="mono-btn-primary" style="padding:6px 12px;font-size:9px;width:auto" onclick="acceptPartyInvite(${inv.id})">KATIL</button>
              <button class="mono-btn-secondary" style="padding:6px 12px;font-size:9px;width:auto" onclick="rejectPartyInvite(${inv.id})">REDDET</button>
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
    return `<div style="text-align:center;padding:24px;font-size:12px;color:#949ba4;font-weight:600">AKTİF GENEL LOBİ YOK</div>`;
  }
  return filtered.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1e1f22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;margin-bottom:8px;">
      <div style="flex:1">
        <div style="font-size:15px;font-weight:800;color:#fff">${esc(p.name)}</div>
        <div style="font-size:11px;color:#949ba4;margin-top:2px">Kurucu: <strong style="color:#f2f3f5">@${esc(p.owner_name)}</strong> · ${p.member_count} üye</div>
      </div>
      <button class="discord-action-btn primary" style="padding:6px 14px;font-size:12px" onclick="joinParty(${p.id})" data-tooltip="${esc(p.name)} odasına katıl" data-tooltip-pos="left">KATIL</button>
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
// FRIENDS TAB BUILDER
// ============================================================
async function buildFriendsTabHtml() {
  const pRes = await fetch('/api/parties');
  _partiesCache = await pRes.json();

  const friendsRes = await fetch('/api/friends');
  const friends = await friendsRes.json();

  const reqRes = await fetch('/api/friends/requests');
  const requests = await reqRes.json();

  let html = `
    <div class="mono-header">ARKADAŞLARINIZ</div>

    <div class="mono-card">
      <div class="mono-sub-header" style="margin-top:0">KULLANICI ARA & EKLE</div>
      <input
        class="mono-input"
        id="friendSearchInput"
        placeholder="Kullanıcı adı ile ara..."
        autocomplete="off"
        oninput="debouncedFriendSearch(this.value)"
      >
      <div id="friendSearchResults" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>
    </div>
  `;

  if (requests.length > 0) {
    html += `
      <div class="mono-sub-header">GELEN ARKADAŞLIK İSTEKLERİ (${requests.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${requests.map(req => `
          <div class="mono-card" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="closePartyModal();openUserModal('${esc(req.username)}')">
            <div style="display:flex;align-items:center;gap:10px">
              ${renderAvatar(req, 'avatar avatar-sm')}
              <div>
                <div style="font-weight:800;color:#fff">${esc(req.username)}</div>
                <div style="font-size:10px;color:#555">Profili görmek için dokun</div>
              </div>
            </div>
            <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
              <button class="mono-btn-primary" style="padding:6px 12px;font-size:9px;width:auto" onclick="acceptFriendRequestBtn(${req.id})">KABUL</button>
              <button class="mono-btn-danger" style="padding:6px 12px;font-size:9px;width:auto" onclick="rejectFriendRequestBtn(${req.id})">RET</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  html += `
    <div style="font-size:11px; font-weight:800; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; margin-top:16px;">ARKADAŞ LİSTESİ (${friends.length})</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${friends.length === 0
        ? `<div style="text-align:center;padding:24px;font-size:12px;color:#949ba4;font-weight:600">ARKADAŞ LİSTENİZ BOŞ</div>`
        : friends.map(f => {
            const activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
            const inviteBtn = activeParty
              ? `<button class="discord-action-btn primary" style="padding:6px 12px;font-size:11px" onclick="event.stopPropagation();inviteFriendToParty(${activeParty.id}, '${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısını aktif lobiye çağır" data-tooltip-pos="left">Lobiye Davet Et</button>`
              : '';
            const onlineDot = f.is_online
              ? `<div style="background:#23a55a;width:10px;height:10px;border-radius:50%;position:absolute;bottom:-1px;right:-1px;border:2px solid #111214"></div>`
              : `<div style="background:#80848e;width:10px;height:10px;border-radius:50%;position:absolute;bottom:-1px;right:-1px;border:2px solid #111214"></div>`;
            const dmBtn = `<button class="discord-action-btn" style="padding:6px 12px;font-size:11px" onclick="event.stopPropagation();closePartyModal();showPage('messages');openDirectChat('${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısına direkt mesaj gönder" data-tooltip-pos="top">Mesaj</button>`;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1e1f22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;cursor:pointer" onclick="closePartyModal();openUserModal('${esc(f.username)}')">
                <div style="display:flex;align-items:center;gap:12px">
                  <div style="position:relative">
                    ${renderAvatar(f, 'avatar avatar-sm')}
                    ${onlineDot}
                  </div>
                  <div>
                    <div style="font-weight:800;color:#fff;font-size:14px">@${esc(f.username)}</div>
                    <div style="font-size:11px;color:#949ba4;margin-top:2px;">Lvl ${f.level || 1} · ${f.is_online ? '<span style="color:#23a55a;font-weight:700">Çevrimiçi</span>' : 'Çevrimdışı'}</div>
                  </div>
                </div>
                <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
                  ${dmBtn}
                  ${inviteBtn}
                </div>
              </div>
            `;
          }).join('')}
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
    if (btn) { btn.textContent = 'GÖNDERİLDİ'; btn.style.opacity = '0.5'; }
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
    container.innerHTML = '<div style="font-size:11px;color:#555;padding:8px;text-align:center">Davet edilecek arkadaş bulunmadı</div>';
    return;
  }
  
  container.innerHTML = filteredFriends.map(f => {
    const isMember = memberUsernames.has(f.username);
    const btnHtml = isMember
      ? `<span style="font-size:11px;color:#23a55a;font-weight:800;letter-spacing:0.5px;">✓ GRUPTA</span>`
      : `<button class="discord-action-btn primary" style="padding:4px 10px;font-size:11px;" onclick="inviteFriendToParty(${_lobbyActiveParty.id}, '${esc(f.username)}')" data-tooltip="@${esc(f.username)} kullanıcısını odaya davet et" data-tooltip-pos="left">Davet Et</button>`;
      
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#1e1f22;padding:8px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
        <div style="display:flex;align-items:center;gap:10px">
          ${renderAvatar(f, 'avatar avatar-xs')}
          <span style="font-size:13px;font-weight:700;color:#fff">@${esc(f.username)}</span>
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
    <div style="font-size:9px;color:#555;font-weight:800;letter-spacing:1px;padding:6px 4px 2px;border-top:1px dashed #222;margin-top:4px">DİĞER KULLANICILAR</div>
    ${others.map(u => {
      const isMember = memberUsernames.has(u.username);
      const isMe = u.username === currentUser.username;
      
      let actionHtml = '';
      if (isMe) {
        actionHtml = `<span style="font-size:10px;color:#555;font-weight:700">SEN</span>`;
      } else if (isMember) {
        actionHtml = `<span style="font-size:10px;color:#555;font-weight:700">GRUPTA</span>`;
      } else {
        actionHtml = `<button class="mono-btn-primary" style="width:auto;padding:6px 12px;font-size:9px" onclick="inviteFriendToParty(${_lobbyActiveParty.id}, '${esc(u.username)}')">DAVET ET</button>`;
      }
      
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#080808;padding:6px 10px;border:1px solid #111">
          <div style="display:flex;align-items:center;gap:8px">
            ${renderAvatar(u, 'avatar avatar-xs')}
            <span style="font-size:12px;font-weight:700;color:#fff">${esc(u.username)}</span>
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
      container.innerHTML = '<div style="font-size:10px;color:#555;padding:4px">Yükleniyor...</div>';
      try {
        const res = await fetch('/api/friends');
        const friends = await res.json();
        if (friends.length === 0) {
          container.innerHTML = '<div style="font-size:10px;color:#555;padding:4px">Arkadaşınız yok</div>';
          return;
        }
        container.innerHTML = friends.map(f => `
          <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:#fff;cursor:pointer;background:#080808;padding:4px 6px;border:1px solid #111;margin:0">
            <input type="checkbox" class="lobby-create-invite-check" value="${esc(f.username)}">
            ${renderAvatar(f, 'avatar avatar-xs')}
            <span>${esc(f.username)}</span>
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
  try {
    await navigator.clipboard.writeText(url);
    showToast(`Davet bağlantısı kopyalandı! (Kod: ${code})`);
  } catch {
    if (typeof window.showPrompt === 'function') window.showPrompt('Davet Bağlantınız:', url);
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
      if (typeof openPartyUI === 'function') openPartyUI(d.partyId);
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
