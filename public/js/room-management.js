/* Room management — Discord-style settings panel for focus rooms. */
'use strict';

const RoomManagement = {
  party: null,
  audit: [],
  auditLoading: false,
  bans: [],
  bansLoading: false,
  dialog: null,
  tab: 'overview',
  modal: null,
  content: null,
  memberSearch: '',
  memberFilter: 'all',

  icons: {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 3 8v8l9 5 9-5V8l-9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    channels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',
    members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 4a4 4 0 0 1 0 7.7"/><path d="M22 21v-2a6 6 0 0 0-4-5.65"/></svg>',
    security: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5l-8-3Z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m18 15-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 5.2 2.1M19 10v2a7 7 0 0 1-10.9 5.8M3 3l18 18"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h10M15 4l-3-3M15 4l-3 3M19 20H9M9 20l3-3M9 20l3 3"/></svg>',
    role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 7l8 4 8-4-8-4Z"/></svg>',
    kick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-7"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 4.2 4.2L19 6.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    join: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>'
  },

  get user() {
    return window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
  },

  roleRank(role) {
    return ({ member: 10, moderator: 20, admin: 30, owner: 40 })[role] || 0;
  },

  get me() {
    const u = this.user;
    if (!u) return null;
    return this.party?.members?.find(member => 
      (member.id && parseInt(member.id) === parseInt(u.id)) ||
      (member.username && member.username === u.username)
    ) || null;
  },

  get role() {
    if (!this.party) return 'member';
    const u = this.user;
    if (u) {
      const isOwner = Boolean(
        (this.party.owner_id && u.id && parseInt(this.party.owner_id) === parseInt(u.id)) ||
        (this.party.owner_name && u.username && this.party.owner_name === u.username) ||
        (this.party.created_by && u.id && parseInt(this.party.created_by) === parseInt(u.id))
      );
      if (isOwner) return 'owner';
    }
    return this.me?.role || 'member';
  },

  get canManage() {
    return this.roleRank(this.role) >= 20;
  },

  get canConfigure() {
    return this.roleRank(this.role) >= 20;
  },

  get canModerate() {
    return this.roleRank(this.role) >= 30;
  },

  sortedChannels() {
    return [...(this.party?.channels || [])].sort(
      (a, b) => (parseInt(a.position) || 0) - (parseInt(b.position) || 0) || parseInt(a.id) - parseInt(b.id)
    );
  },

  roleLabel(role) {
    return ({ owner: 'Sahip', admin: 'Yönetici', moderator: 'Moderatör', member: 'Üye' })[role] || 'Üye';
  },

  formatDuration(seconds) {
    const s = parseInt(seconds) || 0;
    if (s <= 0) return '0 dk';
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs} sa ${mins} dk`;
    return `${mins} dk`;
  },

  async open() {
    const partyId = window._currentPartyId || (typeof _currentPartyId !== 'undefined' ? _currentPartyId : null);
    if (!partyId) {
      if (typeof showToast === 'function') showToast('Önce bir odak odasına katılmalısın.');
      return;
    }

    this.modal = document.getElementById('partyModal');
    this.content = document.getElementById('partyModalContent');
    if (!this.modal || !this.content) return;

    this.modal.style.display = 'flex';
    this.modal.classList.add('open', 'room-management-open');
    document.body.style.overflow = 'hidden';
    this.dialog = null;
    this.audit = [];
    this.bans = [];
    this.tab = 'overview';
    this.memberSearch = '';
    this.memberFilter = 'all';
    this.content.innerHTML = '<div class="rm-loading">Yükleniyor…</div>';

    try {
      const res = await fetch(`/api/parties/${partyId}`);
      if (res.ok) {
        this.party = await res.json();
      }
    } catch (e) {
      console.warn('Oda detayları alınırken hata oluştu:', e);
    }

    if (this.roleRank(this.role) < 20) {
      if (typeof showToast === 'function') showToast('Oda yönetimi için yetkiniz yok.');
      this.closeModal();
      return;
    }

    await this.refresh();
  },

  closeModal() {
    if (typeof closePartyModal === 'function') {
      closePartyModal();
    } else if (this.modal) {
      this.modal.style.display = 'none';
      this.modal.classList.remove('open', 'room-management-open');
      document.body.style.overflow = '';
    }
  },

  async refresh({ preserveTab = true } = {}) {
    const partyId = window._currentPartyId || (typeof _currentPartyId !== 'undefined' ? _currentPartyId : null);
    if (!partyId || !this.content) return;
    try {
      const response = await fetch(`/api/parties/${partyId}`);
      const party = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(party.error || 'Oda bilgisi alınamadı');
      this.party = party;
      if (!preserveTab) this.tab = 'overview';
      this.render();
    } catch (error) {
      this.content.innerHTML = `<div class="rm-error"><strong>Oda yönetimi açılamadı</strong><small>${esc(error.message || 'Bağlantıyı kontrol edin.')}</small><button type="button" onclick="RoomManagement.refresh()">Tekrar dene</button></div>`;
    }
  },

  navItems() {
    const items = [
      ['overview', 'Genel', this.icons.overview],
      ['channels', 'Kanallar', this.icons.channels]
    ];
    if (this.canManage) items.push(['members', 'Üyeler', this.icons.members]);
    if (this.canModerate) items.push(['security', 'Güvenlik', this.icons.security]);
    return items;
  },

  render() {
    const tabs = this.navItems();
    if (!tabs.some(([id]) => id === this.tab)) this.tab = tabs[0][0];

    this.content.innerHTML = `
      <div class="rm-shell">
        <aside class="rm-sidebar">
          <div class="rm-sidebar-head">
            <span class="rm-sidebar-kicker">Oda Ayarları & Yönetim</span>
            <strong class="rm-sidebar-title">${esc(this.party.name)}</strong>
          </div>
          <nav class="rm-nav" aria-label="Oda yönetimi bölümleri">
            ${tabs.map(([id, label, icon]) => `
              <button type="button" class="rm-nav-btn ${this.tab === id ? 'active' : ''}" onclick="RoomManagement.selectTab('${id}')" aria-current="${this.tab === id ? 'page' : 'false'}">
                ${icon}<span>${label}</span>
              </button>`).join('')}
          </nav>
        </aside>
        <section class="rm-panel">
          <header class="rm-panel-head">
            <h2>${esc(this.panelTitle())}</h2>
            <button class="rm-close" type="button" onclick="RoomManagement.closeModal()" aria-label="Kapat">${this.icons.close}</button>
          </header>
          <div class="rm-panel-body">${this.renderCurrentTab()}</div>
        </section>
      </div>`;
  },

  panelTitle() {
    return ({ overview: 'Genel Oda Bilgileri', channels: 'Ses Kanalları', members: 'Üye Yönetimi', security: 'Güvenlik ve Moderasyon' })[this.tab] || 'Oda ayarları';
  },

  renderCurrentTab() {
    if (this.tab === 'channels') return this.renderChannels();
    if (this.tab === 'members') return this.renderMembers();
    if (this.tab === 'security') return this.renderSecurity();
    return this.renderOverview();
  },

  renderOverview() {
    const owner = this.party.owner_name ? `@${esc(this.party.owner_name)}` : '—';
    const inviteCode = this.party.invite_code || '—';
    const memberCount = this.party.members?.length || 0;
    const totalSecs = (this.party.members || []).reduce((acc, m) => acc + (parseInt(m.party_total_time) || 0), 0);
    const formattedTotal = this.formatDuration(totalSecs);

    return `
      <form class="rm-form" onsubmit="RoomManagement.saveRoomName(event)">
        <label class="rm-field">
          <span>Oda Adı</span>
          <input name="name" type="text" maxlength="80" value="${esc(this.party.name)}" ${this.canConfigure ? '' : 'disabled'} placeholder="Oda adı">
        </label>
        ${this.canConfigure ? '<button type="submit" class="rm-btn rm-btn-primary">Kaydet</button>' : ''}
      </form>

      <div class="rm-block" style="margin-top:20px;">
        <div class="rm-block-head">
          <h3>Davet Bağlantısı ve Kod</h3>
        </div>
        <div class="rm-invite-card">
          <div class="rm-invite-info">
            <span class="rm-invite-label">Aktif Davet Kodu</span>
            <strong class="rm-invite-code">${esc(inviteCode)}</strong>
          </div>
          <div class="rm-invite-actions">
            <button type="button" class="rm-btn rm-btn-secondary" onclick="RoomManagement.copyInviteLink()">
              ${this.icons.copy} <span>Bağlantıyı Kopyala</span>
            </button>
            ${this.canConfigure ? `
              <button type="button" class="rm-btn rm-btn-ghost" onclick="RoomManagement.regenerateInviteCode()" data-tooltip="Yeni kod üret">
                ${this.icons.refresh} <span>Yeni Kod</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <dl class="rm-meta">
        <div><dt>Kurucu</dt><dd>${owner}</dd></div>
        <div><dt>Toplam Üye</dt><dd>${memberCount}</dd></div>
        <div><dt>Sizin Rolünüz</dt><dd><span class="rm-role-badge role-${this.role}">${esc(this.roleLabel(this.role))}</span></dd></div>
        <div><dt>Ses Kanal Sayısı</dt><dd>${this.party.channels?.length || 0}</dd></div>
        <div><dt>Oda İçi Toplam Odaklanma</dt><dd>⚡ ${formattedTotal}</dd></div>
      </dl>`;
  },

  async copyInviteLink() {
    const code = this.party?.invite_code;
    if (!code) {
      if (typeof showToast === 'function') showToast('Davet kodu bulunamadı');
      return;
    }
    const url = `${window.location.origin}/?invite=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      if (typeof showToast === 'function') showToast('Davet bağlantısı kopyalandı! 📋');
    } catch {
      if (typeof copyPartyInviteLink === 'function') copyPartyInviteLink();
    }
  },

  async regenerateInviteCode() {
    if (!this.canConfigure) return;
    try {
      const data = await this.request(`/api/parties/${this.party.id}/regenerate-invite`, 'POST');
      if (data.inviteCode) {
        this.party.invite_code = data.inviteCode;
        if (typeof showToast === 'function') showToast('Yeni davet kodu üretildi: ' + data.inviteCode);
        this.render();
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message || 'Davet kodu yenilenemedi');
    }
  },

  renderChannels() {
    const channels = this.sortedChannels();
    const rows = channels.map((channel, index) => this.channelRow(channel, index, channels.length)).join('');
    return `
      <div class="rm-section-head">
        <p class="rm-section-desc">Ses kanallarını yönetin, limitler koyun veya yeni alt kanallar oluşturun.</p>
        ${this.canConfigure ? `<button type="button" class="rm-btn rm-btn-primary" onclick="RoomManagement.createChannel()">${this.icons.add}<span>Kanal ekle</span></button>` : ''}
      </div>
      <div class="rm-channel-list">${rows || '<div class="rm-empty">Henüz ses kanalı yok.</div>'}</div>`;
  },

  channelRow(channel, index, total) {
    const currentChannelId = window._activeVoiceChannelId || null;
    const isJoined = currentChannelId && parseInt(currentChannelId) === parseInt(channel.id);
    const count = (this.party.members || []).filter(m => parseInt(m.channel_id) === parseInt(channel.id)).length;
    const limit = channel.user_limit > 0 ? `${count}/${channel.user_limit}` : `${count} üye`;
    const isDefault = !!channel.is_default;
    const canUp = this.canConfigure && index > 0;
    const canDown = this.canConfigure && index < total - 1;

    return `
      <article class="rm-channel-row ${isDefault ? 'is-default' : ''} ${isJoined ? 'is-active-voice' : ''}">
        <div class="rm-channel-main">
          <span class="rm-channel-glyph">${this.icons.channels}</span>
          <div class="rm-channel-copy">
            <strong>${esc(channel.name)} ${isJoined ? '<span class="rm-voice-active-tag">Bağlı</span>' : ''}</strong>
            <small>${limit}${isDefault ? ' · Ana ses kanalı' : ''}${channel.allow_screen_share ? ' · Ekran paylaşımı açık' : ''}</small>
          </div>
        </div>
        <div class="rm-channel-actions">
          ${!isJoined ? `
            <button type="button" class="rm-btn rm-btn-secondary rm-btn-xs" onclick="RoomManagement.joinChannelDirectly(${channel.id})">
              ${this.icons.join}<span>Katıl</span>
            </button>
          ` : ''}
          ${this.canConfigure ? `
            <button type="button" class="rm-icon-btn" onclick="RoomManagement.moveChannel(${channel.id}, -1)" ${canUp ? '' : 'disabled'} aria-label="Yukarı taşı">${this.icons.up}</button>
            <button type="button" class="rm-icon-btn" onclick="RoomManagement.moveChannel(${channel.id}, 1)" ${canDown ? '' : 'disabled'} aria-label="Aşağı taşı">${this.icons.down}</button>
            <button type="button" class="rm-icon-btn" onclick="RoomManagement.editChannel(${channel.id})" aria-label="Kanalı düzenle">${this.icons.edit}</button>
            ${!isDefault ? `<button type="button" class="rm-icon-btn is-danger" onclick="RoomManagement.confirmDeleteChannelById(${channel.id})" aria-label="Kanalı sil">${this.icons.trash}</button>` : ''}
          ` : ''}
        </div>
      </article>`;
  },

  async joinChannelDirectly(channelId) {
    if (typeof joinVoiceChannel === 'function') {
      joinVoiceChannel(channelId);
      if (typeof showToast === 'function') showToast('Kanala geçiş yapıldı.');
      this.render();
    }
  },

  setMemberSearch(val) {
    this.memberSearch = val;
    this.render();
  },

  setMemberFilter(filter) {
    this.memberFilter = filter;
    this.render();
  },

  memberCard(member) {
    const role = member.role || 'member';
    const status = member.server_muted ? 'Susturuldu' : member.is_online ? 'Çevrimiçi' : 'Çevrimdışı';
    const level = member.level || 1;
    const focusTimeStr = this.formatDuration(member.party_total_time || 0);
    const u = this.user;
    const isSelf = u && ((member.id && parseInt(member.id) === parseInt(u.id)) || (member.username === u.username));
    const canTarget = this.canManage && !isSelf && this.roleRank(this.role) > this.roleRank(role);

    // Channel name lookup
    const channel = this.sortedChannels().find(c => parseInt(c.id) === parseInt(member.channel_id));
    const channelName = channel ? channel.name : '—';

    return `
      <article class="rm-member-row ${member.server_muted ? 'is-muted' : ''}">
        <div class="rm-member-main">
          <div class="rm-member-avatar">${typeof renderAvatar === 'function' ? renderAvatar(member, 'avatar avatar-sm') : esc(member.username.slice(0, 1).toUpperCase())}</div>
          <div class="rm-member-copy">
            <div class="rm-member-name-row">
              <strong>${esc(member.username)}</strong>
              ${isSelf ? '<span class="rm-self-tag">Siz</span>' : ''}
              <span class="rm-level-badge">Lv.${level}</span>
            </div>
            <small>${esc(this.roleLabel(role))} · 🔊 ${esc(channelName)} · ⚡ ${focusTimeStr} · <span class="rm-status-text ${member.is_online ? 'online' : 'offline'}">${esc(status)}</span></small>
          </div>
        </div>
        ${canTarget ? `<button type="button" class="rm-btn rm-btn-ghost" onclick="RoomManagement.manageMember('${esc(member.username)}')">Yönet</button>` : ''}
      </article>`;
  },

  renderMembers() {
    if (!this.canManage) {
      return '<div class="rm-empty">Üye yönetimi için moderatör veya üstü yetki gerekir.</div>';
    }
    const allMembers = [...(this.party.members || [])].sort(
      (a, b) => this.roleRank(b.role) - this.roleRank(a.role) || a.username.localeCompare(b.username)
    );

    const filtered = allMembers.filter(m => {
      if (this.memberSearch) {
        const q = this.memberSearch.toLowerCase().trim();
        if (!m.username.toLowerCase().includes(q)) return false;
      }
      if (this.memberFilter === 'moderators') return ['owner', 'admin', 'moderator'].includes(m.role);
      if (this.memberFilter === 'members') return !m.role || m.role === 'member';
      if (this.memberFilter === 'muted') return Boolean(m.server_muted);
      return true;
    });

    return `
      <div class="rm-members-toolbar">
        <div class="rm-search-box">
          ${this.icons.search}
          <input type="text" class="rm-search-input" placeholder="Üye ara..." value="${esc(this.memberSearch)}" oninput="RoomManagement.setMemberSearch(this.value)">
        </div>
        <div class="rm-filter-chips">
          <button type="button" class="rm-chip ${this.memberFilter === 'all' ? 'active' : ''}" onclick="RoomManagement.setMemberFilter('all')">Tümü (${allMembers.length})</button>
          <button type="button" class="rm-chip ${this.memberFilter === 'moderators' ? 'active' : ''}" onclick="RoomManagement.setMemberFilter('moderators')">Yöneticiler</button>
          <button type="button" class="rm-chip ${this.memberFilter === 'members' ? 'active' : ''}" onclick="RoomManagement.setMemberFilter('members')">Üyeler</button>
          <button type="button" class="rm-chip ${this.memberFilter === 'muted' ? 'active' : ''}" onclick="RoomManagement.setMemberFilter('muted')">Susturulanlar</button>
        </div>
      </div>
      <div class="rm-member-list">${filtered.map(member => this.memberCard(member)).join('') || '<div class="rm-empty">Eşleşen üye bulunamadı.</div>'}</div>`;
  },

  renderSecurity() {
    if (!this.canModerate) {
      return '<div class="rm-empty">Güvenlik ayarları yalnızca oda sahibi ve yöneticilere açıktır.</div>';
    }
    const events = this.auditLoading
      ? '<div class="rm-muted">Moderasyon geçmişi yükleniyor…</div>'
      : this.audit.length
        ? this.audit.map(event => this.auditRow(event)).join('')
        : '<div class="rm-muted">Henüz moderasyon kaydı yok.</div>';
    const banRows = this.bansLoading
      ? '<div class="rm-muted">Yasak listesi yükleniyor…</div>'
      : this.bans.length
        ? this.bans.map(ban => this.banRow(ban)).join('')
        : '<div class="rm-muted">Aktif yasaklı üye yok.</div>';

    return `
      <div class="rm-block">
        <div class="rm-block-head"><h3>Yasaklı Kullanıcılar</h3><button type="button" class="rm-btn rm-btn-ghost" onclick="RoomManagement.refreshSecurity()">${this.icons.refresh} Yenile</button></div>
        <div class="rm-ban-list">${banRows}</div>
      </div>
      <div class="rm-block">
        <div class="rm-block-head"><h3>Son Moderasyon Eylemleri</h3></div>
        <div class="rm-audit-list">${events}</div>
      </div>`;
  },

  banRow(ban) {
    const reason = ban.reason ? esc(ban.reason) : 'Neden belirtilmedi';
    return `
      <article class="rm-ban-row">
        <div class="rm-ban-copy"><strong>@${esc(ban.username)}</strong><small>${reason}</small></div>
        <button type="button" class="rm-btn rm-btn-ghost" onclick="RoomManagement.confirmUnban(${parseInt(ban.user_id)})">Yasağı kaldır</button>
      </article>`;
  },

  auditRow(event) {
    const labels = {
      voice_mute: 'susturdu',
      voice_unmute: 'susturmayı kaldırdı',
      move_member: 'kanala taşıdı',
      change_role: 'rolünü değiştirdi',
      kick_member: 'odadan çıkardı',
      ban_member: 'yasakladı',
      unban_member: 'yasağı kaldırdı'
    };
    const actionIcons = {
      voice_mute: this.icons.mute,
      voice_unmute: this.icons.mute,
      move_member: this.icons.move,
      change_role: this.icons.role,
      kick_member: this.icons.kick,
      ban_member: this.icons.ban,
      unban_member: this.icons.check
    };

    const date = event.created_at ? new Date(`${String(event.created_at).replace(' ', 'T')}Z`) : null;
    const time = date && !Number.isNaN(date.valueOf())
      ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
      : 'Az önce';
    const actor = event.actor_username ? `@${event.actor_username}` : 'Yönetici';
    const target = event.target_username ? `@${event.target_username}` : 'oda';
    const icon = actionIcons[event.action] || this.icons.security;

    return `
      <article class="rm-audit-row">
        <div class="rm-audit-icon">${icon}</div>
        <div class="rm-audit-copy"><strong>${esc(actor)} ${esc(labels[event.action] || event.action)} ${esc(target)}</strong>${event.reason ? `<small>${esc(event.reason)}</small>` : ''}</div>
        <time>${esc(time)}</time>
      </article>`;
  },

  async selectTab(tab) {
    this.tab = tab;
    this.render();
    if (tab === 'security' && this.canModerate && !this.audit.length && !this.auditLoading) {
      await this.loadAudit();
      if (!this.bans.length && !this.bansLoading) await this.loadBans();
    }
  },

  async saveRoomName(event) {
    event.preventDefault();
    if (!this.canConfigure) return;
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name) {
      if (typeof showToast === 'function') showToast('Oda adı boş bırakılamaz');
      return;
    }
    if (name === this.party.name) return;
    submit.disabled = true;
    try {
      await this.request(`/api/parties/${this.party.id}/name`, 'PUT', { name });
      await this.afterMutation('Oda adı güncellendi', { reloadSecurity: false });
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'Kaydedilemedi');
    } finally {
      submit.disabled = false;
    }
  },

  async moveChannel(channelId, direction) {
    if (!this.canConfigure) return;
    const channels = this.sortedChannels();
    const idx = channels.findIndex(c => parseInt(c.id) === parseInt(channelId));
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= channels.length) return;

    const reordered = channels.map((c, i) => ({ id: c.id, position: i }));
    const temp = reordered[idx].position;
    reordered[idx].position = reordered[targetIdx].position;
    reordered[targetIdx].position = temp;

    try {
      await this.request(`/api/parties/${this.party.id}/channels-reorder`, 'PUT', { channels: reordered });
      await this.afterMutation('Kanal sırası güncellendi', { reloadSecurity: false });
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'Sıralama güncellenemedi');
    }
  },

  confirmDeleteChannelById(channelId) {
    const channel = this.sortedChannels().find(c => parseInt(c.id) === parseInt(channelId));
    if (channel) this.confirmDeleteChannel(channel);
  },

  async loadAudit() {
    if (!this.party?.id || !this.canModerate) return;
    this.auditLoading = true;
    this.render();
    try {
      const response = await fetch(`/api/parties/${this.party.id}/moderation/audit`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Moderasyon geçmişi alınamadı');
      this.audit = data.events || [];
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'Moderasyon geçmişi alınamadı');
    } finally {
      this.auditLoading = false;
      this.render();
    }
  },

  async loadBans() {
    if (!this.party?.id || !this.canModerate) return;
    this.bansLoading = true;
    this.render();
    try {
      const data = await this.request(`/api/parties/${this.party.id}/moderation/bans`);
      this.bans = data.bans || [];
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'Yasak listesi alınamadı');
    } finally {
      this.bansLoading = false;
      this.render();
    }
  },

  async refreshSecurity() {
    await Promise.all([this.loadAudit(), this.loadBans()]);
  },

  async request(path, method = 'GET', payload = undefined) {
    const options = { method, headers: {} };
    if (payload !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(path, options);
    const detail = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(detail.error || 'İşlem tamamlanamadı');
    return detail;
  },

  memberById(memberId) {
    return (this.party?.members || []).find(member => parseInt(member.id) === parseInt(memberId)) || null;
  },

  closeDialog() {
    this.dialog = null;
    this.modal?.querySelector('.rm-dialog-layer')?.remove();
  },

  showDialog(config) {
    this.dialog = config;
    this.paintDialog();
  },

  paintDialog() {
    if (!this.dialog || !this.content) return;
    this.modal?.querySelector('.rm-dialog-layer')?.remove();
    const dialog = document.createElement('section');
    dialog.className = `rm-dialog-layer${this.dialog.danger ? ' is-danger' : ''}`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
      <div class="rm-dialog-backdrop"></div>
      <form class="rm-dialog-card">
        <header>
          <div><strong>${esc(this.dialog.title || '')}</strong>${this.dialog.subtitle ? `<small>${esc(this.dialog.subtitle)}</small>` : ''}</div>
          <button type="button" class="rm-dialog-close" aria-label="Kapat">${this.icons.close}</button>
        </header>
        <div class="rm-dialog-body">${this.dialog.body || ''}<p class="rm-dialog-error" aria-live="polite"></p></div>
        <footer>
          ${this.dialog.secondaryLabel ? `<button type="button" class="rm-dialog-secondary">${esc(this.dialog.secondaryLabel)}</button>` : ''}
          <button type="button" class="rm-dialog-cancel">Vazgeç</button>
          <button type="submit" class="rm-dialog-submit">${this.dialog.submitIcon || this.icons.check}<span>${esc(this.dialog.submitLabel || 'Kaydet')}</span></button>
        </footer>
      </form>`;
    (this.content.querySelector('.rm-shell') || this.content).appendChild(dialog);
    dialog.querySelector('.rm-dialog-backdrop').addEventListener('click', () => this.closeDialog());
    dialog.querySelector('.rm-dialog-close').addEventListener('click', () => this.closeDialog());
    dialog.querySelector('.rm-dialog-cancel').addEventListener('click', () => this.closeDialog());
    dialog.querySelector('.rm-dialog-secondary')?.addEventListener('click', () => this.dialog?.onSecondary?.());
    dialog.querySelector('form').addEventListener('submit', event => this.submitDialog(event));
    this.dialog.afterMount?.(dialog);
    requestAnimationFrame(() => dialog.querySelector('[autofocus], input, select, textarea, button')?.focus());
  },

  async submitDialog(event) {
    event.preventDefault();
    const dialog = this.dialog;
    if (!dialog?.onSubmit) return this.closeDialog();
    const form = event.currentTarget;
    const submit = form.querySelector('.rm-dialog-submit');
    const error = form.querySelector('.rm-dialog-error');
    submit.disabled = true;
    if (error) error.textContent = '';
    try {
      await dialog.onSubmit(new FormData(form));
      this.closeDialog();
    } catch (failure) {
      if (error) error.textContent = failure.message || 'İşlem tamamlanamadı';
    } finally {
      submit.disabled = false;
    }
  },

  async afterMutation(message, { reloadSecurity = true } = {}) {
    if (typeof showToast === 'function') showToast(message);
    this.audit = [];
    this.bans = [];
    await this.refresh();
    if (typeof fetchPartyAndRender === 'function') fetchPartyAndRender(this.party.id);
    if (reloadSecurity && this.tab === 'security' && this.canModerate) this.refreshSecurity();
  },

  field(label, name, value = '', options = {}) {
    const type = options.type || 'text';
    const extra = `${options.required ? ' required' : ''}${options.min !== undefined ? ` min="${options.min}"` : ''}${options.max !== undefined ? ` max="${options.max}"` : ''}${options.autofocus ? ' autofocus' : ''}`;
    return `<label class="rm-field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(String(value))}"${extra} placeholder="${esc(options.placeholder || '')}"></label>`;
  },

  channelFields(channel = {}) {
    return `${this.field('Kanal adı', 'name', channel.name || '', { required: true, maxlength: 80, autofocus: true, placeholder: 'Örn. Sessiz çalışma' })}
      ${this.field('Kişi limiti (0 = Sınırsız)', 'userLimit', channel.user_limit || 0, { type: 'number', min: 0, max: 20 })}
      <label class="rm-switch"><input type="checkbox" name="allowScreenShare" ${channel.allow_screen_share ? 'checked' : ''}><span><strong>Ekran paylaşımı</strong><small>Bu kanaldaki üyeler ekran paylaşabilir.</small></span></label>`;
  },

  createChannel() {
    this.showDialog({
      title: 'Yeni ses kanalı',
      subtitle: 'Odaya yeni bir ses kanalı ekleyin.',
      body: this.channelFields(),
      submitLabel: 'Oluştur',
      onSubmit: async data => {
        const name = String(data.get('name') || '').trim();
        if (!name) throw new Error('Kanal adı boş bırakılamaz');
        await this.request(`/api/parties/${this.party.id}/channels`, 'POST', {
          name,
          userLimit: Math.max(0, Math.min(20, parseInt(data.get('userLimit')) || 0)),
          allowScreenShare: data.get('allowScreenShare') === 'on'
        });
        await this.afterMutation('Kanal oluşturuldu', { reloadSecurity: false });
      }
    });
  },

  editChannel(channelId) {
    const channel = this.sortedChannels().find(item => parseInt(item.id) === parseInt(channelId));
    if (!channel) return;
    this.showDialog({
      title: 'Kanalı düzenle',
      subtitle: channel.is_default ? 'Ana kanal silinemez.' : 'Değişiklikler anında uygulanır.',
      body: this.channelFields(channel),
      submitLabel: 'Kaydet',
      secondaryLabel: channel.is_default ? '' : 'Sil',
      onSubmit: async data => {
        const name = String(data.get('name') || '').trim();
        if (!name) throw new Error('Kanal adı boş bırakılamaz');
        await this.request(`/api/parties/${this.party.id}/channels/${channel.id}`, 'PUT', {
          name,
          userLimit: Math.max(0, Math.min(20, parseInt(data.get('userLimit')) || 0)),
          allowScreenShare: data.get('allowScreenShare') === 'on'
        });
        await this.afterMutation('Kanal güncellendi', { reloadSecurity: false });
      },
      onSecondary: () => this.confirmDeleteChannel(channel)
    });
  },

  confirmDeleteChannel(channel) {
    this.showDialog({
      title: 'Kanalı sil',
      subtitle: `“${channel.name}” kanalındaki üyeler ana kanala taşınır.`,
      body: '<div class="rm-dialog-warning">Bu işlem geri alınamaz.</div>',
      submitLabel: 'Sil',
      submitIcon: this.icons.trash,
      danger: true,
      onSubmit: async () => {
        await this.request(`/api/parties/${this.party.id}/channels/${channel.id}`, 'DELETE');
        await this.afterMutation('Kanal silindi', { reloadSecurity: false });
      }
    });
  },

  manageMember(username) {
    const member = (this.party?.members || []).find(item => item.username === username);
    if (!member) return;
    const channel = this.sortedChannels().find(item => parseInt(item.id) === parseInt(member.channel_id));
    const muted = !!member.server_muted;
    const actions = [
      `<button type="button" onclick="RoomManagement.openMuteDialog(${member.id})">${this.icons.mute}<span>${muted ? 'Susturmayı kaldır' : 'Sustur'}</span></button>`,
      `<button type="button" onclick="RoomManagement.openMoveDialog(${member.id})">${this.icons.move}<span>Kanala taşı</span></button>`
    ];
    if (this.canModerate) actions.push(`<button type="button" onclick="RoomManagement.openRoleDialog(${member.id})">${this.icons.role}<span>Rolü değiştir</span></button>`);
    actions.push(`<button type="button" class="is-danger" onclick="RoomManagement.openKickDialog(${member.id})">${this.icons.kick}<span>Odadan çıkar</span></button>`);
    if (this.canModerate) actions.push(`<button type="button" class="is-danger" onclick="RoomManagement.openBanDialog(${member.id})">${this.icons.ban}<span>Yasakla</span></button>`);

    this.showDialog({
      title: `@${member.username}`,
      subtitle: `${this.roleLabel(member.role || 'member')} · ${channel?.name || 'Kanal yok'}`,
      body: `<div class="rm-member-action-grid">${actions.join('')}</div>`,
      submitLabel: 'Kapat',
      onSubmit: async () => {}
    });
  },

  openMuteDialog(memberId) {
    const member = this.memberById(memberId);
    if (!member) return;
    const unmute = !!member.server_muted;
    this.showDialog({
      title: unmute ? 'Susturmayı kaldır' : 'Sustur',
      subtitle: `@${member.username}`,
      body: unmute ? '' : `<label class="rm-field"><span>Neden <em>opsiyonel</em></span><textarea name="reason" maxlength="180" placeholder="Kısa açıklama"></textarea></label><label class="rm-field"><span>Süre</span><select name="durationMinutes"><option value="">Süresiz</option><option value="5">5 dk</option><option value="15">15 dk</option><option value="30">30 dk</option><option value="60">1 saat</option></select></label>`,
      submitLabel: unmute ? 'Kaldır' : 'Sustur',
      submitIcon: this.icons.mute,
      danger: !unmute,
      onSubmit: async data => {
        const duration = parseInt(data.get('durationMinutes'));
        await this.request(`/api/parties/${this.party.id}/members/${member.id}/voice-mute`, 'PUT', {
          muted: !unmute,
          reason: String(data.get('reason') || '').trim(),
          durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null
        });
        await this.afterMutation(unmute ? 'Susturma kaldırıldı' : 'Üye susturuldu');
      }
    });
  },

  openMoveDialog(memberId) {
    const member = this.memberById(memberId);
    if (!member) return;
    const options = this.sortedChannels().map(channel => `<option value="${channel.id}" ${parseInt(channel.id) === parseInt(member.channel_id) ? 'selected' : ''}>${esc(channel.name)}</option>`).join('');
    this.showDialog({
      title: 'Kanala taşı',
      subtitle: `@${member.username}`,
      body: `<label class="rm-field"><span>Hedef kanal</span><select name="channelId" autofocus>${options}</select></label>`,
      submitLabel: 'Taşı',
      submitIcon: this.icons.move,
      onSubmit: async data => {
        const channelId = parseInt(data.get('channelId'));
        if (!channelId || parseInt(channelId) === parseInt(member.channel_id)) return;
        await this.request(`/api/parties/${this.party.id}/members/${member.id}/move`, 'POST', { channelId });
        await this.afterMutation('Üye taşındı');
      }
    });
  },

  openRoleDialog(memberId) {
    const member = this.memberById(memberId);
    if (!member || !this.canModerate) return;
    const choices = ['member', 'moderator', 'admin'].filter(role => this.roleRank(role) < this.roleRank(this.role));
    this.showDialog({
      title: 'Rolü değiştir',
      subtitle: `@${member.username}`,
      body: `<label class="rm-field"><span>Rol</span><select name="role">${choices.map(role => `<option value="${role}" ${role === member.role ? 'selected' : ''}>${this.roleLabel(role)}</option>`).join('')}</select></label>`,
      submitLabel: 'Kaydet',
      onSubmit: async data => {
        await this.request(`/api/parties/${this.party.id}/members/${member.id}/role`, 'PUT', { role: String(data.get('role') || 'member') });
        await this.afterMutation('Rol güncellendi');
      }
    });
  },

  openKickDialog(memberId) {
    const member = this.memberById(memberId);
    if (!member) return;
    this.showDialog({
      title: 'Odadan çıkar',
      subtitle: `@${member.username}`,
      body: `<label class="rm-field"><span>Neden <em>opsiyonel</em></span><textarea name="reason" maxlength="180"></textarea></label>`,
      submitLabel: 'Çıkar',
      submitIcon: this.icons.kick,
      danger: true,
      onSubmit: async data => {
        await this.request(`/api/parties/${this.party.id}/members/${member.id}/kick`, 'DELETE', { reason: String(data.get('reason') || '').trim() });
        await this.afterMutation('Üye odadan çıkarıldı');
      }
    });
  },

  openBanDialog(memberId) {
    const member = this.memberById(memberId);
    if (!member || !this.canModerate) return;
    this.showDialog({
      title: 'Yasakla',
      subtitle: `@${member.username} odaya bir daha giremez.`,
      body: `<label class="rm-field"><span>Neden</span><textarea name="reason" required minlength="3" maxlength="180"></textarea></label>`,
      submitLabel: 'Yasakla',
      submitIcon: this.icons.ban,
      danger: true,
      onSubmit: async data => {
        const reason = String(data.get('reason') || '').trim();
        if (reason.length < 3) throw new Error('Neden en az 3 karakter olmalı');
        await this.request(`/api/parties/${this.party.id}/members/${member.id}/ban`, 'POST', { reason });
        await this.afterMutation('Kullanıcı yasaklandı');
      }
    });
  },

  confirmUnban(memberId) {
    const ban = this.bans.find(item => parseInt(item.user_id) === parseInt(memberId));
    if (!ban) return;
    this.showDialog({
      title: 'Yasağı kaldır',
      subtitle: `@${ban.username} tekrar davetle katılabilir.`,
      submitLabel: 'Kaldır',
      onSubmit: async () => {
        await this.request(`/api/parties/${this.party.id}/members/${ban.user_id}/ban`, 'DELETE');
        await this.afterMutation('Yasak kaldırıldı');
      }
    });
  }
};

window.RoomManagement = RoomManagement;
window.openPartyManagementModal = () => RoomManagement.open();
