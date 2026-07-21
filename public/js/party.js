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
    <div class="grid-controls-bar" style="border:1px solid #1a1a1a; margin-bottom:16px; padding: 4px; border-radius:10px;">
      <div class="grid-size-btn-group">
        <div class="grid-size-btn ${_currentPartyTab === 'lobby' ? 'active' : ''}" onclick="switchPartyTab('lobby')">Odalar</div>
        <div class="grid-size-btn ${_currentPartyTab === 'friends' ? 'active' : ''}" onclick="switchPartyTab('friends')">Arkadaşlar</div>
      </div>
    </div>
  `;

  try {
    if (_currentPartyTab === 'lobby') {
      html += await buildLobbyTabHtml();
    } else {
      html += await buildFriendsTabHtml();
    }
  } catch (err) {
    html += `<div style="text-align:center;padding:20px;color:red;font-size:11px">HATA OLUŞTU: ${err.message}</div>`;
  }

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
    const isOwner = party.owner_id === currentUser.id;

    html += `
      <div class="mono-header">AKTİF LOBİNİZ</div>
      <div class="mono-card active-room">
        <div style="font-size:16px;font-weight:900;color:#fff;margin-bottom:6px;text-transform:uppercase">${esc(party.name)}</div>
        <div style="font-size:11px;color:#888;margin-bottom:16px">Kurucu: ${esc(party.owner_name)} · ${party.members.length} Üye</div>
        
        <div class="mono-sub-header" style="margin-top:0">ÜYE ODAK DURUMLARI</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
          ${party.members.map(m => {
            const isActive = m.active_session_id !== null;
            const isMe = m.username === currentUser.username;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#050505;padding:10px 14px;border-radius:10px;border:1px solid #111">
                <div style="display:flex;align-items:center;gap:10px">
                  ${renderAvatar(m, 'avatar avatar-sm')}
                  <span style="font-size:13px;font-weight:600;color:#fff;cursor:${isMe ? 'default' : 'pointer'}" ${isMe ? '' : `onclick="closePartyModal(); openUserPage('${esc(m.username)}')"`}>${esc(m.username)} ${isMe ? '<span style="font-size:10px;color:#333;font-weight:400"> siz</span>' : ''}</span>
                </div>
                <span style="font-size:10px;font-weight:700;letter-spacing:1px;color:${isActive ? '#fff' : '#2a2a2a'}">${isActive ? '● odakta' : 'boşta'}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="timer-start-btn" style="font-size:13px;padding:14px" onclick="startSessionInParty(${party.id}); closePartyModal()">
            Birlikte Odaklan
          </button>
          
          <div class="mono-sub-header" style="margin-top:16px">ARKADAŞLARINI DAVET ET</div>
          <input class="mono-input" id="lobbyInviteSearchInput" placeholder="Arkadaş veya kullanıcı ara..." style="margin-bottom:8px" oninput="handleLobbyInviteSearch(this.value)">
          <div id="lobbyInviteFriendsList" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; border:1px solid #1a1a1a; padding:4px; background:#020202">
            <div id="lobbyInviteFriendsItems"></div>
            <div id="lobbyInviteOtherResults"></div>
          </div>

          <button class="${isOwner ? 'mono-btn-danger' : 'mono-btn-secondary'}" style="margin-top:12px" onclick="${isOwner ? 'deleteParty' : 'leaveParty'}(${party.id})">
            ${isOwner ? 'LOBİYİ SİL' : 'LOBİDEN AYRIL'}
          </button>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px">
        <button class="timer-start-btn" style="font-size:13px;padding:14px" id="btnShowCreateParty" onclick="togglePartyCreateForm(true)">+ Yeni Oda Oluştur</button>
        
        <div id="inlinePartyCreateForm" style="display:none;flex-direction:column;gap:12px;background:#050505;padding:16px;border:1px solid var(--border-soft)">
          <div style="font-weight:800;color:#fff;font-size:12px">LOBİ OLUŞTUR</div>
          <input class="mono-input" id="inlineCreatePartyName" placeholder="Lobi Adı (Örn: Gececi Tayfa)" style="margin:0">
          
          <div style="font-size:10px;color:#888;margin-top:4px">DAVET EDİLECEK ARKADAŞLAR</div>
          <div id="lobbyCreateFriendsList" style="max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; border:1px solid #111; padding:4px; background:#020202"></div>
          
          <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:#ccc;cursor:pointer">
            <input type="checkbox" id="inlineCreatePartyPrivate"> Gizli Lobi (Sadece davetle)
          </label>
          <div style="display:flex;gap:8px">
            <button class="mono-btn-primary" onclick="submitCreateParty()">OLUŞTUR</button>
            <button class="mono-btn-secondary" onclick="togglePartyCreateForm(false)">İPTAL</button>
          </div>
        </div>
      </div>

      <div class="mono-sub-header">GENEL ODALARI ARA</div>
      <div style="margin-bottom:16px">
        <input class="mono-input" id="partySearchInModal" placeholder="Oda adı yazın..." oninput="filterPartiesModal()">
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
    return `<div style="text-align:center;padding:24px;font-size:11px;color:#444;font-weight:700">AKTİF GENEL LOBİ YOK</div>`;
  }
  return filtered.map(p => `
    <div class="mono-card" style="display:flex;align-items:center;justify-content:space-between">
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:#fff">${esc(p.name)}</div>
        <div style="font-size:10px;color:#555;margin-top:2px">Kurucu: ${esc(p.owner_name)} · ${p.member_count} üye</div>
      </div>
      <button class="mono-btn-secondary" style="width:auto;padding:8px 16px;font-size:10px" onclick="joinParty(${p.id})">KATIL</button>
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
    <div class="mono-sub-header">ARKADAŞ LİSTESİ (${friends.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${friends.length === 0
        ? `<div style="text-align:center;padding:24px;font-size:11px;color:#444;font-weight:700">ARKADAŞ LİSTENİZ BOŞ</div>`
        : friends.map(f => {
            const activeParty = _partiesCache.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
            const inviteBtn = activeParty
              ? `<button class="mono-btn-secondary" style="width:auto;padding:6px 12px;font-size:9px" onclick="event.stopPropagation();inviteFriendToParty(${activeParty.id}, '${esc(f.username)}')">LOBİYE DAVET ET</button>`
              : '';
            const onlineDot = f.is_online
              ? `<div style="background:#00e676;width:8px;height:8px;border-radius:50%;position:absolute;bottom:0;right:0;border:2px solid #000"></div>`
              : `<div style="background:#555;width:8px;height:8px;border-radius:50%;position:absolute;bottom:0;right:0;border:2px solid #000"></div>`;
            const dmBtn = `<button class="mono-btn-secondary" style="width:auto;padding:6px 12px;font-size:9px" onclick="event.stopPropagation();closePartyModal();showPage('messages');openDirectChat('${esc(f.username)}')">MESAJ</button>`;
            return `
              <div class="mono-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer" onclick="closePartyModal();openUserModal('${esc(f.username)}')">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="position:relative">
                    ${renderAvatar(f, 'avatar avatar-sm')}
                    ${onlineDot}
                  </div>
                  <div>
                    <div style="font-weight:800;color:#fff">${esc(f.username)}</div>
                    <div style="font-size:10px;color:#555">Lvl ${f.level || 1} · ${f.is_online ? '<span style="color:#00e676">Çevrimiçi</span>' : 'Çevrimdışı'}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
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
      ? `<span style="font-size:10px;color:#555;font-weight:700">GRUPTA</span>`
      : `<button class="mono-btn-secondary" style="width:auto;padding:6px 12px;font-size:9px" onclick="inviteFriendToParty(${_lobbyActiveParty.id}, '${esc(f.username)}')">DAVET ET</button>`;
      
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#050505;padding:6px 10px;border:1px solid #111">
        <div style="display:flex;align-items:center;gap:8px">
          ${renderAvatar(f, 'avatar avatar-xs')}
          <span style="font-size:12px;font-weight:700;color:#fff">${esc(f.username)}</span>
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
  if (!(await window.showConfirm('Lobiden ayrılmak istiyor musun?'))) return;
  try {
    const res = await fetch(`/api/parties/${partyId}/leave`, { method: 'POST' });
    if (res.ok) {
      showToast('Lobiden ayrıldın');
    } else if (res.status === 404) {
      showToast('Lobi zaten kapatılmış');
    }
  } catch (e) {
    console.warn('leaveParty request error:', e);
  } finally {
    if (typeof stopVoiceChat === 'function') stopVoiceChat(true);
    if (typeof clearActiveParty === 'function') clearActiveParty();
    refreshPartyModal();
  }
}

async function deleteParty(partyId) {
  if (!(await window.showConfirm('Lobiyi silmek istiyor musun?'))) return;
  try {
    const res = await fetch(`/api/parties/${partyId}/leave`, { method: 'POST' });
    if (res.ok) {
      showToast('Lobi kapatıldı');
    } else if (res.status === 404) {
      showToast('Lobi zaten bulunamadı');
    }
  } catch (e) {
    console.warn('deleteParty request error:', e);
  } finally {
    if (typeof stopVoiceChat === 'function') stopVoiceChat(true);
    if (typeof clearActiveParty === 'function') clearActiveParty();
    refreshPartyModal();
  }
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
