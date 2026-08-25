/**
 * BLUNK Leagues & Permanent Medals Frontend Module (Ultra-Clean & Minimal Native BLUNK Design)
 */

(function () {
  let currentLeagueState = {
    timeframe: 'weekly',
    league_type: 'overall',
    league_name: 'Genel',
    categories: [],
    activities: []
  };

  // Vector SVG Icons Helper
  function getIconSvg(name, size = 15, strokeWidth = 2) {
    const icons = {
      trophy: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M18 4H6v7a6 6 0 0 0 12 0V4z"/></svg>`,
      flame: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/></svg>`,
      globe: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      book: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
      gamepad: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="11" r="1"/><rect x="2" y="6" width="20" height="12" rx="6"/></svg>`,
      pin: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-6H6.5L5 17z"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/></svg>`
    };
    return icons[name] || '';
  }

  // Clean CSS-based Mini Medal Icons for Leaderboard
  function getMedalSvg(rank, size = 48) {
    const rankColors = { 1: '#eab308', 2: '#d0d4dc', 3: '#b06b42' };
    const color = rankColors[rank] || '#888';
    return `
      <div style="width:${size}px; height:${size}px; border-radius:50%; background:radial-gradient(circle at 30% 30%, ${color}, #000); border:1px solid ${color}; display:flex; align-items:center; justify-content:center; font-weight:900; color:#fff; font-size:${size * 0.45}px; box-shadow:0 0 10px ${color}66; margin: 0 auto;">
        ${rank}
      </div>
    `;
  }
  let lastSeasonStatusData = null;

  // Load Status
  async function initLeagueStatus() {
    try {
      const res = await fetch('/api/leagues/status');
      if (!res.ok) return;
      const data = await res.json();

      lastSeasonStatusData = data;
      currentLeagueState.categories = (data.options && data.options.categories) || [];
      currentLeagueState.activities = (data.options && data.options.activities) || [];

      renderSeasonBanner(data);
      renderLeagueControls();
      loadLeaderboardData();

      // Fetch OP Coin Balance
      fetch('/api/season-pass-system/status')
        .then(r => r.json())
        .then(d => {
          const coinEl = document.getElementById('league-coin-amount');
          if (coinEl && d.blunk_coins !== undefined) {
            coinEl.textContent = d.blunk_coins;
          }
        })
        .catch(e => console.error("Coin fetch error", e));

    } catch (e) {
      console.error('[LEAGUES] Failed to init status:', e);
    }
  }

  // Render Header Banner
  // Render Header Banner
  function renderSeasonBanner(data) {
    const bannerContainer = document.getElementById('league-season-header');
    if (!bannerContainer) return;

    const statusData = data || lastSeasonStatusData || {};
    const totalHours = Math.floor((statusData.remaining_ms || 0) / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const timerText = days > 0 ? `${days}g ${hours}s` : `${hours}s`;

    const isAllTime = currentLeagueState.timeframe === 'all_time';

    if (isAllTime) {
      bannerContainer.innerHTML = `
        <div class="league-season-banner">
          <div class="league-season-info">
            <button class="league-back-btn" onclick="BLUNK_LEAGUES.openWeeklyView()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>Haftalık Sıralamaya Dön</span>
            </button>
            <h2 class="league-season-title">Tüm Zamanlar Liderlik Kürsüsü</h2>
          </div>
          <div class="league-season-timer">
            <span>Efsaneler Sıralaması</span>
          </div>
        </div>
      `;
    } else {
      bannerContainer.innerHTML = `
        <div class="league-season-banner clickable-season-banner" id="clickableSeasonBanner" title="Sezon Takvimi & Detaylı Bilgi İçin Tıklayın">
          <div class="league-season-info">
            <div class="league-season-tag-row">
              <span class="league-season-badge">SEZON ${statusData.season_number || 1} • HAFTA ${statusData.week_in_season || 1}</span>
              <span class="league-season-dot">•</span>
              <span class="league-season-subtag">HAFTALIK ODAK MARATONU</span>
              <span class="league-season-info-icon">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                Bilgi & Takvim
              </span>
            </div>
            <h2 class="league-season-title">${statusData.season_title || 'Sezon 1: Odak Dönemi'}</h2>
          </div>
          <div class="league-season-timer">
            <span>Sıfırlanmaya:</span> <strong>${timerText}</strong>
          </div>
        </div>
      `;

      const clickable = bannerContainer.querySelector('#clickableSeasonBanner');
      if (clickable) {
        clickable.addEventListener('click', () => {
          openSeasonCalendarModal(statusData);
        });
      }
    }
  }

  // Render Navigation Controls
  function renderLeagueControls() {
    const tabsContainer = document.getElementById('league-nav-controls');
    if (!tabsContainer) return;

    const catalog = getStructuredCatalog();
    const categories = Object.keys(catalog);

    const activeName = currentLeagueState.league_name !== 'Genel'
      ? `${currentLeagueState.league_name} (Değiştir)`
      : 'Kategori / Aktivite Ara';

    const triggerBtnHtml = `
      <button class="league-search-trigger-btn" id="leagueSearchTriggerBtn">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>${activeName}</span>
      </button>
    `;

    // 1. Dynamic Category Pills Bar (Renders ALL categories in database)
    let catPillsHtml = '';
    let subPillsHtml = '';

    if (currentLeagueState.league_type === 'category' || currentLeagueState.league_type === 'activity') {
      const allCatPills = ['Genel', ...categories];

      let selectedCat = 'Genel';
      if (categories.includes(currentLeagueState.league_name)) {
        selectedCat = currentLeagueState.league_name;
      } else if (currentLeagueState.league_name !== 'Genel') {
        categories.forEach(c => {
          if (catalog[c] && catalog[c].has(currentLeagueState.league_name)) {
            selectedCat = c;
          }
        });
      }

      catPillsHtml = `
        <div class="league-quick-pills-bar">
          ${allCatPills.map(c => `
            <button class="league-quick-pill ${selectedCat === c ? 'active' : ''}" data-cat="${esc(c)}">
              ${c === 'Genel' ? '🌐 Genel (Tüm Kategoriler)' : esc(c)}
            </button>
          `).join('')}
        </div>
      `;

      // 2. Sub-Activity Pills Bar (If a specific category is selected)
      if (selectedCat !== 'Genel' && catalog[selectedCat]) {
        const acts = Array.from(catalog[selectedCat]);
        const allActPills = [`${selectedCat} (Kategori Geneli)`, ...acts];

        subPillsHtml = `
          <div class="league-sub-pills-bar">
            <span class="sub-pills-label">${esc(selectedCat)} Aktiviteleri:</span>
            ${allActPills.map(a => {
              const isCatOverall = a.endsWith('(Kategori Geneli)');
              const realVal = isCatOverall ? selectedCat : a;
              const isSelected = currentLeagueState.league_name === realVal;

              return `
                <button class="league-sub-pill ${isSelected ? 'active' : ''}" data-act="${esc(realVal)}">
                  ${esc(a)}
                </button>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    tabsContainer.innerHTML = `
      <div class="league-controls-wrap">
        <div class="league-nav-tabs">
          <button class="league-tab-btn ${currentLeagueState.league_type === 'overall' ? 'active' : ''}" data-type="overall">
            ${getIconSvg('globe', 14)} Genel Lig
          </button>
          <button class="league-tab-btn ${currentLeagueState.league_type !== 'overall' ? 'active' : ''}" data-type="category">
            ${getIconSvg('book', 14)} Kategoriler & Hobiler
          </button>

        </div>
        ${triggerBtnHtml}
      </div>
      ${catPillsHtml}
      ${subPillsHtml}
    `;

    // Tab buttons event listeners
    tabsContainer.querySelectorAll('.league-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.dataset.type;
        currentLeagueState.league_type = type;
        currentLeagueState.league_name = 'Genel';
        renderLeagueControls();
        loadLeaderboardData();
      });
    });

    // Category pills click handler
    tabsContainer.querySelectorAll('.league-quick-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.cat;
        currentLeagueState.league_type = cat === 'Genel' ? 'overall' : 'category';
        currentLeagueState.league_name = cat;
        renderLeagueControls();
        loadLeaderboardData();
      });
    });

    // Sub-activity pills click handler
    tabsContainer.querySelectorAll('.league-sub-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const act = e.currentTarget.dataset.act;
        currentLeagueState.league_type = categories.includes(act) ? 'category' : 'activity';
        currentLeagueState.league_name = act;
        renderLeagueControls();
        loadLeaderboardData();
      });
    });

    // DEDICATED Search Trigger Button
    const triggerBtn = tabsContainer.querySelector('#leagueSearchTriggerBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        openSearchModal('activity');
      });
    }
  }

  function normalizeTr(str) {
    if (!str) return '';
    return str.toString()
      .replace(/İ/g, 'i')
      .replace(/I/g, 'ı')
      .toLocaleLowerCase('tr')
      .toLowerCase();
  }

  // Rich Contextual SVG Icon Generator
  function getItemIconSvg(title, type) {
    const t = (title || '').toLowerCase();

    if (t.startsWith('tümü')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    }
    // Code / Software / Developer
    if (t.includes('kod') || t.includes('yazılım') || t.includes('python') || t.includes('react') || t.includes('developer') || t.includes('bug') || t.includes('test') || t.includes('code') || t.includes('bilişim')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    }
    // Games / Gaming
    if (t.includes('oyna') || t.includes('game') || t.includes('minecraft') || t.includes('gta') || t.includes('valorant') || t.includes('cs') || t.includes('fortnite') || t.includes('hobi') || t.includes('oyun') || t.includes('brawl') || t.includes('clash') || t.includes('lol') || t.includes('pubg')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="11" r="1"/><rect x="2" y="6" width="20" height="12" rx="6"/></svg>`;
    }
    // Exams / Academic / KPSS / YKS / School / Education
    if (t.includes('kpss') || t.includes('yks') || t.includes('lgs') || t.includes('ales') || t.includes('eğitim') || t.includes('öabt') || t.includes('okul') || t.includes('lise') || t.includes('ortaokul') || t.includes('akademik') || t.includes('tyt') || t.includes('ayt')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    }
    // Books / Reading / Language / Lessons
    if (t.includes('kitap') || t.includes('oku') || t.includes('dil') || t.includes('ingilizce') || t.includes('türkçe') || t.includes('ders') || t.includes('paragraf') || t.includes('tarih') || t.includes('coğrafya') || t.includes('matematik') || t.includes('fizik') || t.includes('kimya') || t.includes('biyoloji')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
    }
    // Art / Design / Craft / Music / Content
    if (t.includes('resim') || t.includes('boya') || t.includes('sanat') || t.includes('müzik') || t.includes('tasarım') || t.includes('içerik') || t.includes('medya') || t.includes('video') || t.includes('kurgu')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.72 1.7-1.63 0-.41-.15-.79-.42-1.07-.27-.27-.42-.65-.42-1.07 0-.91.73-1.63 1.65-1.63H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z"/></svg>`;
    }
    // Business / Work / Project / Career
    if (t.includes('iş') || t.includes('proje') || t.includes('kariyer') || t.includes('ofis') || t.includes('toplantı') || t.includes('yönetim') || t.includes('portfolyo') || t.includes('gelişim')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
    }
    // Fitness / Sport / Health
    if (t.includes('spor') || t.includes('yürüyüş') || t.includes('koşu') || t.includes('fitness') || t.includes('egzersiz') || t.includes('sağlık')) {
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    }

    return type === 'category'
      ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }

  // Comprehensive Structured Catalog Generator
  function getStructuredCatalog() {
    const catalog = {};

    // 1. Initialize with all categories and activities from global _activitiesDb
    if (typeof _activitiesDb !== 'undefined') {
      Object.keys(_activitiesDb).forEach(cat => {
        catalog[cat] = new Set(Array.isArray(_activitiesDb[cat]) ? _activitiesDb[cat] : []);
      });
    }

    if (!catalog['Diğer']) catalog['Diğer'] = new Set();

    // 2. Add dynamically tracked activities from currentLeagueState
    if (Array.isArray(currentLeagueState.activities)) {
      currentLeagueState.activities.forEach(act => {
        let found = false;
        const lowerAct = normalizeTr(act);
        
        for (const cat in catalog) {
          if (catalog[cat].has(act)) {
            found = true;
            break;
          }
        }
        
        if (!found) {
          // Check for similar existing activities to avoid duplicates (e.g. "minecraft" vs "Minecraft oynamak")
          let duplicate = false;
          for (const cat in catalog) {
            const actsArray = Array.from(catalog[cat]);
            // If the dynamic activity is a substring of an existing one (or vice versa), consider it duplicate
            const match = actsArray.find(a => {
              const lowerA = normalizeTr(a);
              return lowerA.includes(lowerAct) || lowerAct.includes(lowerA);
            });
            if (match) {
              duplicate = true;
              break;
            }
          }

          if (duplicate) return; // Skip adding the duplicate

          let assignedCat = 'Diğer';

          if (lowerAct.includes('kod') || lowerAct.includes('yazılım') || lowerAct.includes('test') || lowerAct.includes('python') || lowerAct.includes('c#') || lowerAct.includes('dev')) {
            assignedCat = catalog['Tasarım & Medya'] ? 'Tasarım & Medya' : 'Diğer';
          } else if (lowerAct.includes('kpss')) {
            assignedCat = catalog['KPSS Lisans'] ? 'KPSS Lisans' : 'Diğer';
          } else if (lowerAct.includes('yks') || lowerAct.includes('tyt') || lowerAct.includes('ayt') || lowerAct.includes('lise')) {
            assignedCat = catalog['Lise & YKS'] ? 'Lise & YKS' : 'Diğer';
          } else if (lowerAct.includes('ders') || lowerAct.includes('matematik') || lowerAct.includes('sınav') || lowerAct.includes('okul')) {
            assignedCat = catalog['Eğitim'] ? 'Eğitim' : 'Diğer';
          } else if (lowerAct.includes('oyn') || lowerAct.includes('game') || lowerAct.includes('minecraft') || lowerAct.includes('hobi')) {
            assignedCat = catalog['Hobi'] ? 'Hobi' : 'Diğer';
          } else if (lowerAct.includes('spor') || lowerAct.includes('fitness') || lowerAct.includes('sağlık')) {
            assignedCat = catalog['Hobi'] ? 'Hobi' : 'Diğer';
          }

          if (!catalog[assignedCat]) catalog[assignedCat] = new Set();
          catalog[assignedCat].add(act);
        }
      });
    }

    return catalog;
  }

  // Full-Screen Spotlight Search & Interactive Categorized Picker Modal
  function openSearchModal(type) {
    let overlay = document.getElementById('league-picker-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'league-picker-modal-overlay';
      overlay.className = 'league-picker-modal-overlay';
      document.body.appendChild(overlay);
    }

    const catalog = getStructuredCatalog();
    const categories = Object.keys(catalog);
    let selectedCatFilter = 'ALL';

    // Use Real Active Leagues from Backend (or empty array if not loaded yet)
    const activeLeagues = (lastSeasonStatusData && lastSeasonStatusData.options && lastSeasonStatusData.options.active_leagues) 
      ? lastSeasonStatusData.options.active_leagues 
      : [];

    const titleText = type === 'category' ? 'KATEGORİ ARA VE FİLTRELE' : 'HOBİ VEYA AKTİVİTE SEÇ';
    const placeholderText = type === 'category'
      ? 'Kategori veya lig adı yazın (örn: Yazılım & Teknoloji, KPSS, YKS, Hobi)...'
      : 'Hobi veya aktivite adı yazın (örn: Minecraft, C# .NET Projesi, YKS Matematik)...';

    // Category pills HTML
    const pillsHtml = `
      <button class="picker-cat-pill active" data-cat="ALL">🌐 Tümü</button>
      ${categories.map(c => `
        <button class="picker-cat-pill" data-cat="${esc(c)}">${getItemIconSvg(c, 'category')} ${esc(c)}</button>
      `).join('')}
    `;

    overlay.innerHTML = `
      <div class="league-picker-modal-card">
        <div class="league-picker-header">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="leaguePickerSearchInput" class="league-picker-search-input" placeholder="${placeholderText}" autocomplete="off">
          <button class="league-picker-close-btn" id="closeLeaguePickerModal">
            <span>Kapat</span>
            <span style="opacity:0.6; font-size:11px;">(ESC)</span>
          </button>
        </div>
        <div class="league-picker-cat-pills" id="leaguePickerCatPills">
          ${pillsHtml}
        </div>
        <div class="league-picker-body">
          <div style="font-size:11px; font-weight:800; color:var(--t-text-muted); letter-spacing:0.8px; text-transform:uppercase; margin-bottom:12px;" id="leaguePickerCountLabel">
            ${titleText}
          </div>
          <div class="league-picker-grid" id="leaguePickerGrid"></div>
        </div>
      </div>
    `;

    function renderGridItems(filterText = '') {
      const gridEl = document.getElementById('leaguePickerGrid');
      const countLabelEl = document.getElementById('leaguePickerCountLabel');
      if (!gridEl) return;

      const query = normalizeTr(filterText);
      let html = '';
      let totalCount = 0;

      // 1. Render Active Started Leagues Section (if matches or no query)
      const matchingActive = query
        ? activeLeagues.filter(l => normalizeTr(l.activity).includes(query))
        : activeLeagues;

      if (matchingActive.length > 0 && selectedCatFilter === 'ALL') {
        html += `
          <div class="league-picker-category-group">
            <div class="league-active-section-title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              AKTİF LİGLER (${matchingActive.length})
            </div>
            <div class="league-picker-group-grid">
              ${matchingActive.map(al => {
                const isSelected = currentLeagueState.league_name === al.activity;
                
                // Format time professionally
                let timeStr = "0 dk";
                if (al.total_duration && al.total_duration > 0) {
                  const totalMins = Math.floor(al.total_duration / 60);
                  const h = Math.floor(totalMins / 60);
                  const m = totalMins % 60;
                  if (h > 0) {
                    timeStr = m > 0 ? `${h} saat ${m} dk` : `${h} saat`;
                  } else {
                    timeStr = `${m} dakika`;
                  }
                }
                
                const safePhoto = (al.leader_photo && al.leader_photo !== 'null' && al.leader_photo.trim() !== '') ? al.leader_photo : '/default-avatar.png';
                
                return `
                  <div class="league-picker-card-item ${isSelected ? 'selected' : ''}" data-val="${esc(al.activity)}">
                    <div class="league-picker-item-icon-wrapper">
                      <div class="league-picker-item-icon">${getItemIconSvg(al.activity, 'activity')}</div>
                      <div class="icon-glow"></div>
                    </div>
                    <div class="item-details" style="flex:1;">
                      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom: 6px;">
                        <span class="league-picker-item-title">${esc(al.activity)}</span>
                        <span class="league-picker-item-players">
                          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                          ${al.players}
                        </span>
                      </div>
                      <div class="item-cat-badge">
                        ${al.leader_username ? `
                          <div class="leader-info" title="Lider: @${esc(al.leader_username)}">
                            <img src="${esc(safePhoto)}" class="leader-avatar" onerror="this.src='/default-avatar.png'">
                            <span class="leader-name">@${esc(al.leader_username)}</span>
                          </div>
                          <div class="leader-time">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${timeStr}
                          </div>
                        ` : '<span style="color:var(--t-text-muted); font-size:11px;">Henüz lider yok</span>'}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
        totalCount += matchingActive.length;
      }

      // 2. Render All Categories and Activities Grouped Symmetrically
      const targetCats = selectedCatFilter === 'ALL' ? categories : categories.filter(c => c === selectedCatFilter);

      targetCats.forEach(catName => {
        const actSet = catalog[catName];
        if (!actSet) return;
        const acts = Array.from(actSet);

        const matchingActs = query
          ? acts.filter(a => normalizeTr(a).includes(query) || normalizeTr(catName).includes(query))
          : acts;

        if (matchingActs.length > 0) {
          totalCount += matchingActs.length;

          html += `
            <div class="league-picker-category-group">
              <div class="league-picker-group-title">
                ${getItemIconSvg(catName, 'category')} ${esc(catName)} (${matchingActs.length} AKTİVİTE)
              </div>
              <div class="league-picker-group-grid">
                <div class="league-picker-card-item ${currentLeagueState.league_name === catName ? 'selected' : ''}" data-val="${esc(catName)}">
                  <div class="league-picker-item-icon-wrapper">
                    <div class="league-picker-item-icon">${getItemIconSvg(catName, 'category')}</div>
                    <div class="icon-glow"></div>
                  </div>
                  <div class="item-details" style="flex:1;">
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom: 6px;">
                      <span class="league-picker-item-title">🌐 ${esc(catName)} (Genel)</span>
                    </div>
                    <div class="item-cat-badge">
                      <span class="leader-time">Kategori Genel Sıralaması</span>
                    </div>
                  </div>
                </div>

                ${matchingActs.map(act => {
                  const isSelected = currentLeagueState.league_name === act;
                  const iconSvg = getItemIconSvg(act, 'activity');

                  return `
                    <div class="league-picker-card-item ${isSelected ? 'selected' : ''}" data-val="${esc(act)}">
                      <div class="league-picker-item-icon-wrapper">
                        <div class="league-picker-item-icon">${iconSvg}</div>
                        <div class="icon-glow"></div>
                      </div>
                      <div class="item-details" style="flex:1;">
                        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom: 6px;">
                          <span class="league-picker-item-title">${esc(act)}</span>
                        </div>
                        <div class="item-cat-badge">
                          <span class="leader-time">Kategori: ${esc(catName)}</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
      });

      if (countLabelEl) countLabelEl.textContent = `Arama & Filtreleme (${totalCount} LİG VE AKTİVİTE)`;

      if (totalCount === 0) {
        gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:48px 10px; color:var(--t-text-muted);">"${filterText}" ile eşleşen aktivite veya kategori bulunamadı.</div>`;
        return;
      }

      gridEl.innerHTML = html;

      // Attach click listeners to all item cards
      gridEl.querySelectorAll('.league-picker-card-item').forEach(card => {
        card.addEventListener('click', (e) => {
          const val = e.currentTarget.dataset.val;
          currentLeagueState.league_type = categories.includes(val) ? 'category' : (val === 'Genel' ? 'overall' : 'activity');
          currentLeagueState.league_name = val;
          overlay.classList.remove('active');
          renderLeagueControls();
          loadLeaderboardData();
        });
      });
    }

    renderGridItems('');

    // Attach Cat Pill click handlers
    const pillContainer = document.getElementById('leaguePickerCatPills');
    if (pillContainer) {
      pillContainer.querySelectorAll('.picker-cat-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          pillContainer.querySelectorAll('.picker-cat-pill').forEach(p => p.classList.remove('active'));
          e.currentTarget.classList.add('active');
          selectedCatFilter = e.currentTarget.dataset.cat;
          const searchInput = document.getElementById('leaguePickerSearchInput');
          renderGridItems(searchInput ? searchInput.value : '');
        });
      });
    }

    // Auto-focus search input on modal open
    setTimeout(() => {
      const searchInp = document.getElementById('leaguePickerSearchInput');
      if (searchInp) {
        searchInp.value = '';
        searchInp.focus();
      }
    }, 50);

    // Global ESC key listener to safely remove document body overflow locks
    if (!window._escLockBound) {
      window._escLockBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.body.style.overflow = '';
          document.querySelectorAll('.medal-modal-overlay, .league-picker-modal-overlay, .analytics-dashboard-overlay').forEach(el => {
            el.classList.remove('active');
          });
        }
      });
    }

    setTimeout(() => {
      overlay.classList.add('active');
      const inputEl = document.getElementById('leaguePickerSearchInput');
      if (inputEl) {
        inputEl.focus();
        ['input', 'keyup', 'change'].forEach(evt => {
          inputEl.addEventListener(evt, (e) => renderGridItems(e.target.value));
        });
      }
    }, 10);

    const closeBtn = document.getElementById('closeLeaguePickerModal');
    if (closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');

    const handleEscKey = (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }

  // Humorous empty state callout messages dictionary (No Emojis)
  function getHumorousCallout(leagueName) {
    const nameLower = (leagueName || '').toLowerCase();
    
    if (nameLower.includes('minecraft')) {
      return {
        title: 'Bu hafta henüz kimsenin canı Minecraft oynamak istememiş...',
        sub: 'Kazmanı kap, 10 dakika odaklan ve haftalık Altın Madalyayı bedavaya kap!'
      };
    }
    if (nameLower.includes('kpss')) {
      return {
        title: 'KPSS tayfası bu hafta sessiz...',
        sub: 'Tarih ve Coğrafya sorularını devirip liderlik koltuğuna oturacak ilk yiğit sen ol!'
      };
    }
    if (nameLower.includes('yks') || nameLower.includes('tyt') || nameLower.includes('ayt')) {
      return {
        title: 'YKS maratoncuları henüz sahaya inmedi!',
        sub: 'Paragrafları ve mat sorularını temizleyip 1. sıraya yerleşme fırsatı doğrudan senin elinde.'
      };
    }
    if (nameLower.includes('yazılım') || nameLower.includes('kodlama') || nameLower.includes('react') || nameLower.includes('python')) {
      return {
        title: 'Bu hafta henüz tek satır kod yazılmamış veya bug çözülmemiş!',
        sub: 'Terminali aç, 10 dakika odaklan, yazılım madalyasını envanterine at!'
      };
    }
    if (nameLower.includes('ales') || nameLower.includes('dgs')) {
      return {
        title: 'Sayısal Mantık ve Sözel cephesinde henüz hareket yok!',
        sub: '1 saatlik odak seansıyla açılışı yap ve haftalık madalya yarışında liderliği kap!'
      };
    }

    return {
      title: `Bu hafta henüz ${leagueName !== 'Genel' ? leagueName + ' liginde' : ''} kimse yeterince odaklanmamış!`,
      sub: 'Madalyaların dağıtılması için en az 3 oyuncunun en az 10 dakika odaklanması gerekiyor. İlk adımı sen at!'
    };
  }

  // Diverse Test Matrix Generator (3 Players Active, 2 Players Almost Active, 1 Player In-Progress, 0 Players Unstarted)
  function getLeagueTestData(leagueName) {
    const nameLower = (leagueName || '').toLowerCase();
    const currentUsername = (window.currentUser && window.currentUser.username) ? window.currentUser.username : 'sen';

    // 1. FULLY ACTIVE LEAGUE (6 Players - Medals Active! 1-min intervals)
    if (nameLower.includes('minecraft')) {
      return {
        meta: { is_active_league: true, qualifying_users_count: 6, required_users: 3 },
        items: [
          { user_id: 101, username: 'ahmet_pro', profile_photo: '/default-avatar.png', total_hours: '3.3', total_minutes: 195, rank: 1, level: 42 },
          { user_id: 102, username: currentUsername, profile_photo: '/default-avatar.png', total_hours: '3.2', total_minutes: 194, rank: 2, level: 38 },
          { user_id: 103, username: 'mert_miner', profile_photo: '/default-avatar.png', total_hours: '3.2', total_minutes: 193, rank: 3, level: 31 },
          { user_id: 104, username: 'can_builder', profile_photo: '/default-avatar.png', total_hours: '2.0', total_minutes: 120, rank: 4, level: 24 },
          { user_id: 105, username: 'zeynep_redstone', profile_photo: '/default-avatar.png', total_hours: '1.5', total_minutes: 90, rank: 5, level: 19 },
          { user_id: 106, username: 'burak_craft', profile_photo: '/default-avatar.png', total_hours: '1.1', total_minutes: 65, rank: 6, level: 15 }
        ]
      };
    }

    // 2. ALMOST ACTIVE LEAGUE (2 Players - Needs 1 more player!)
    if (nameLower.includes('ders') || nameLower.includes('eğitim')) {
      return {
        meta: { is_active_league: false, qualifying_users_count: 2, required_users: 3 },
        items: [
          { user_id: 201, username: 'ayse_yks', profile_photo: '/default-avatar.png', total_hours: '5.4', total_minutes: 324, rank: 1, level: 55 },
          { user_id: 202, username: currentUsername, profile_photo: '/default-avatar.png', total_hours: '5.4', total_minutes: 323, rank: 2, level: 49 }
        ]
      };
    }

    // 3. IN-PROGRESS LEAGUE (1 Player)
    if (nameLower.includes('kod') || nameLower.includes('yazılım') || nameLower.includes('c#') || nameLower.includes('python')) {
      return {
        meta: { is_active_league: false, qualifying_users_count: 1, required_users: 3 },
        items: [
          { user_id: 301, username: 'dev_osman', profile_photo: '/default-avatar.png', total_hours: '4.2', total_minutes: 250, rank: 1, level: 48 }
        ]
      };
    }

    // 4. BRAND NEW UNSTARTED LEAGUE (0 Players - Empty Callout State!)
    return {
      meta: { is_active_league: false, qualifying_users_count: 0, required_users: 3 },
      items: []
    };
  }

  // Render Leaderboard Items
  async function loadLeaderboardData() {
    const listContainer = document.getElementById('league-leaderboard-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
      <div class="league-skeleton-container">
        <div class="league-skeleton-row"></div>
        <div class="league-skeleton-row"></div>
        <div class="league-skeleton-row"></div>
      </div>
    `;

    let items = [];
    let meta = { is_active_league: true, qualifying_users_count: 0, required_users: 6 };

    try {
      const url = `/api/leaderboard/leagues?timeframe=${currentLeagueState.timeframe}&league_type=${currentLeagueState.league_type}&league_name=${encodeURIComponent(currentLeagueState.league_name)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        items = data.leaderboard || [];
        if (data.meta) meta = data.meta;
      }
    } catch (fetchErr) {
      console.warn('[LEAGUES] API fallback active:', fetchErr.message);
    }

    // Always fallback to test matrix if items empty or server unavailable
    if (!items || items.length === 0) {
      const testObj = getLeagueTestData(currentLeagueState.league_name);
      items = testObj.items;
      meta = testObj.meta;
    }

    if (items.length === 0 || (!meta.is_active_league && currentLeagueState.timeframe === 'weekly')) {
      const callout = getHumorousCallout(currentLeagueState.league_name);
      const qualifyingCount = meta.qualifying_users_count || 0;
      const reqUsers = meta.required_users || 3;
      const progressPct = Math.min(100, Math.round((qualifyingCount / reqUsers) * 100));

      listContainer.innerHTML = `
        <div class="league-unstarted-callout">
          <div class="league-unstarted-icon">${getIconSvg('trophy', 24)}</div>
          <h3 class="league-unstarted-title">${callout.title}</h3>
          <p class="league-unstarted-sub">${callout.sub}</p>

          <div class="league-activation-progress-box">
            <div class="league-activation-label">
              <span>Lig İlerlemesi (Anti-Hile Threshold)</span>
              <span>${qualifyingCount}/${reqUsers} Oyuncu (≥10dk)</span>
            </div>
            <div class="league-activation-track">
              <div class="league-activation-fill" style="width: ${progressPct}%;"></div>
            </div>
          </div>

          <button class="league-start-focus-btn" onclick="BLUNK_LEAGUES.goToTimerPage()">
            Hemen Odaklan ve Liderliği Kap
          </button>
        </div>
      `;
      refreshLucideIcons();
      return;
    }

    let html = '';

    // Check current user position for Rival Distance Card
    const currentUsername = window.currentUser ? window.currentUser.username : null;
    if (currentUsername) {
      const userIndex = items.findIndex(u => u.username === currentUsername);
      const currentRank = userIndex >= 0 ? items[userIndex].rank : null;

      if (currentRank) {
        // Tracker for contextual messages (especially 4th place)
        const rankKey = `blunk_last_rank_${currentLeagueState.name}_${currentLeagueState.timeframe}`;
        const previousRank = localStorage.getItem(rankKey) ? parseInt(localStorage.getItem(rankKey), 10) : currentRank;
        
        // Update local storage
        localStorage.setItem(rankKey, currentRank);

        if (userIndex > 0) {
          const rival = items[userIndex - 1];
          const userObj = items[userIndex];
          const diffMins = Math.max(1, Math.ceil((rival.total_minutes - userObj.total_minutes) + 1));
          
          let messageHtml = `<span>Üstünüzdeki <strong>@${rival.username}</strong> oyuncusunu geçmek için <strong>${diffMins} Dk</strong> odak gerekli!</span>`;
          
          if (currentRank === 4) {
            try {
              const res = await fetch(`/api/leaderboard/rival-message?currentRank=${currentRank}&previousRank=${previousRank}&username=${currentUsername}`);
              const data = await res.json();
              if (data && data.message) {
                messageHtml = `<span>${data.message} <br/><br/><strong>(Podyum için ${diffMins} Dk gerekli)</strong></span>`;
              }
            } catch (err) {
              console.error('[LEAGUE_RIVAL_API_ERROR]', err);
            }
          }

          html += `
            <div class="league-rival-card">
              <div class="league-rival-info">
                ${getIconSvg('flame', 16)}
                ${messageHtml}
              </div>
              <button class="league-rival-btn" onclick="BLUNK_LEAGUES.goToTimerPage()">Hemen Yarış</button>
            </div>
          `;
        }
      }
    }

    // --- PODIUM RENDER ---
    if (items.length > 0) {
      html += `<div class="league-podium-container">`;

      const top3 = items.slice(0, 3);
      
      const renderStep = (item, posRank) => {
        if (!item) return `<div class="podium-step" style="opacity: 0.1;"><div class="podium-block"></div></div>`;
        const avatar = item.profile_photo || '/default-avatar.png';
        const medalSvgHtml = getMedalSvg(posRank, posRank === 1 ? 24 : 18);
        return `
          <div class="podium-step podium-rank-${posRank}" onclick="BLUNK_LEAGUES.openUserActivityModal(${item.user_id}, '${item.username}')" style="cursor:pointer;">
            <div class="podium-avatar-wrapper">
              <img src="${avatar}" alt="${item.username}" class="podium-avatar" onError="this.src='/default-avatar.png'" />
              <div class="podium-medal-badge">${medalSvgHtml}</div>
            </div>
            <div class="podium-block">
              <span class="podium-username">${item.username}</span>
              <span class="podium-time">${item.total_hours} sa</span>
              <span class="podium-rank-num">${posRank}</span>
            </div>
          </div>
        `;
      };

      // Order: 2nd, 1st, 3rd
      html += renderStep(top3[1], 2);
      html += renderStep(top3[0], 1);
      html += renderStep(top3[2], 3);

      html += `</div>`;
    }

    // --- REST OF THE LIST ---
    const restItems = items.slice(3);

    restItems.forEach((item, relativeIndex) => {
      const index = relativeIndex + 3;

      // LeetCode / Duolingo Style Zone Dividers
      if (index === 3) {
        html += `<div class="league-zone-divider zone-promotion">${getIconSvg('flame', 12)} YÜKSELME BÖLGESİ (İLK 10)</div>`;
      } else if (index === 10) {
        html += `<div class="league-zone-divider">GÜVENLİ BÖLGE</div>`;
      }

      // Mini 7-bar sparkline activity renderer using REAL user focus data
      const sparkData = item.sparkline_7_days || [0, 0, 0, 0, 0, 0, 0];
      const maxSparkMins = Math.max(1, ...sparkData);
      const bars = sparkData.map((mins) => {
        const h = mins > 0 ? Math.max(4, Math.round((mins / maxSparkMins) * 16)) : 4;
        const color = mins > 0 ? '#a855f7' : 'rgba(168, 85, 247, 0.2)';
        return `<div style="width:3px; height:${h}px; background:${color}; border-radius:2px; transition:height 0.3s ease;"></div>`;
      }).join('');

      let bannerStyle = '';
      let emojiHtml = '';
      if (window.BLUNK_SEASON_CONFIG && window.BLUNK_SEASON_CONFIG.rewards) {
        if (item.equipped_banner) {
          const banner = window.BLUNK_SEASON_CONFIG.rewards[item.equipped_banner];
          if (banner) {
            bannerStyle = `background: linear-gradient(90deg, rgba(30,27,75,0.95) 0%, rgba(30,27,75,0.7) 50%, rgba(30,27,75,0) 100%), ${banner.color}22; border-left: 4px solid ${banner.color};`;
          }
        }
        if (item.equipped_emoji) {
          const emoji = window.BLUNK_SEASON_CONFIG.rewards[item.equipped_emoji];
          if (emoji) {
            emojiHtml = `<span style="color: ${emoji.color}; display:inline-flex; align-items:center; width:16px; height:16px; margin-left:4px;">${emoji.icon}</span>`;
          }
        }
      }

      html += `
        <div class="league-rank-card" style="${bannerStyle}">
          <div class="league-rank-left">
            <div class="league-rank-number rank-${item.rank}">#${item.rank}</div>
            <img src="${item.profile_photo}" alt="${item.username}" class="league-user-avatar" onError="this.src='/default-avatar.png'" />
            <div class="league-user-details">
              <div style="display:flex; align-items:center; gap: 8px;">
                <a href="/${item.username}" class="league-user-name">${item.username}${emojiHtml}</a>
                ${item.top_activity ? `<span class="league-sub-tag">${item.top_activity}</span>` : ''}
              </div>
              <span class="league-user-level">LVL ${item.level}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <button class="activity-sparkline-btn" 
                    title="Detaylı 7 Günlük Odak Grafiğini İncele" 
                    onclick="BLUNK_LEAGUES.openUserActivityModal(${item.user_id}, '${item.username}')"
                    data-tooltip="7 Günlük Odak Grafiğim" data-tooltip-pos="bottom">
              ${bars}
            </button>
            <div class="league-rank-time">
              ${item.total_hours} sa
            </div>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
    refreshLucideIcons();
  }

  // Interactive Rules Modal (i) (Cleaned Emojis & Colors)
  function openRulesModal() {
    if (window.BLUNK_SEASON_PASS) {
      window.BLUNK_SEASON_PASS.openModal();
    }
  }

  function refreshLucideIcons() {
    if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Medal Modal (CS2 Inspect Style with 3D)
  let active3DMedalInstance = null;
  function openMedalModal(medal, canToggle = false, onToggleCallback = null) {
    let modalOverlay = document.getElementById('medal-detail-modal-overlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'medal-detail-modal-overlay';
      modalOverlay.className = 'medal-modal-overlay';
      modalOverlay.style.zIndex = '9999999';
      document.body.appendChild(modalOverlay);
    }
    
    // Cleanup previous 3D instance if exists
    if (active3DMedalInstance) {
      active3DMedalInstance.destroy();
      active3DMedalInstance = null;
    }

    modalOverlay.style.zIndex = '9999999';
    // Deep dark blurred background for CS2 inspect feel
    modalOverlay.style.background = 'radial-gradient(circle at 50% 50%, rgba(15,15,20,0.85) 0%, rgba(5,5,8,0.98) 100%)';
    modalOverlay.style.backdropFilter = 'blur(16px)';

    // The medal object natively contains medal.username from the backend.

    // Trigger open-source confetti burst!
    if (typeof window.triggerMedalConfetti === 'function') {
      window.triggerMedalConfetti(window.innerWidth / 2, window.innerHeight / 2);
    }

    const rankTitles = {
      1: '1. Sıra - Altın Şampiyonluk Madalyası',
      2: '2. Sıra - Gümüş Derece Madalyası',
      3: '3. Sıra - Bronz Derece Madalyası'
    };
    const rankTitle = rankTitles[medal.rank] || `${medal.rank}. Sıra Başarı Madalyası`;
    const rankColor = medal.rank === 1 ? '#eab308' : medal.rank === 2 ? '#d0d4dc' : '#b06b42';
    
    let leagueTypeLabel = 'Genel Klasman';
    if (medal.league_type === 'category') leagueTypeLabel = 'Kategori Ligi';
    else if (medal.league_type === 'activity') leagueTypeLabel = 'Aktivite Ligi';
    
    const totalMins = medal.total_minutes || (medal.total_hours ? parseFloat(medal.total_hours) * 60 : 0);
    const focusHours = (totalMins / 60).toFixed(1);
    const earnedDateStr = medal.earned_at || medal.created_at ? new Date(medal.earned_at || medal.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sezon Sonu Seanslarında';

    modalOverlay.innerHTML = `
      <div class="cs2-inspect-layout" data-theme="dark" style="display:flex; align-items:center; justify-content:space-between; width:100%; height:100%; position:relative; background:#050508; background-image: radial-gradient(ellipse at 38% 55%, rgba(${medal.rank===1?'234,179,8':medal.rank===2?'208,212,220':'176,107,66'},0.18) 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, rgba(80,60,160,0.12) 0%, transparent 45%), radial-gradient(ellipse at 20% 80%, rgba(20,20,40,0.9) 0%, transparent 60%), linear-gradient(180deg, #060608 0%, #08080d 100%); color:#fff;">
        <!-- Top edge glow bar -->
        <div style="position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent 0%, ${rankColor}60 30%, ${rankColor}90 50%, ${rankColor}60 70%, transparent 100%); z-index:20; pointer-events:none;"></div>
        
        <!-- Primary ambient orb -->
        <div style="position:absolute; top:50%; left:35%; transform:translate(-50%,-50%); width:700px; height:700px; background:radial-gradient(circle, ${rankColor}28 0%, ${rankColor}08 40%, transparent 70%); border-radius:50%; pointer-events:none; z-index:1; filter:blur(50px); animation:medalOrbPulse 4s ease-in-out infinite;"></div>
        
        <!-- Secondary cool-toned ambient orb -->
        <div style="position:absolute; top:20%; left:60%; width:300px; height:300px; background:radial-gradient(circle, rgba(100,80,220,0.15) 0%, transparent 70%); border-radius:50%; pointer-events:none; z-index:1; filter:blur(40px);"></div>
        
        <!-- Subtle bottom vignette -->
        <div style="position:absolute; bottom:0; left:0; right:0; height:200px; background:linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%); pointer-events:none; z-index:1;"></div>

        <style>
          @keyframes medalOrbPulse {
            0%, 100% { opacity: 0.7; transform: translate(-50%,-50%) scale(1); }
            50% { opacity: 1; transform: translate(-50%,-50%) scale(1.08); }
          }
          @keyframes medalCardShimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          .medal-stat-card {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.07);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 8px;
            transition: border-color 0.3s ease, background 0.3s ease;
          }
          .medal-stat-card:hover {
            background: rgba(255,255,255,0.07);
            border-color: rgba(255,255,255,0.14);
          }
          .medal-stat-row {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.07);
            border-radius: 16px;
            padding: 18px 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: border-color 0.3s ease;
          }
          .medal-stat-row:hover {
            border-color: rgba(255,255,255,0.14);
          }
          @media (max-width: 768px) {
            .cs2-inspect-layout {
              flex-direction: column !important;
              justify-content: flex-start !important;
              overflow-y: auto !important;
              /* Hide scrollbar for Chrome, Safari and Opera */
              -webkit-overflow-scrolling: touch;
            }
            .cs2-inspect-layout::-webkit-scrollbar {
              display: none !important;
            }
            .cs2-inspect-layout {
              -ms-overflow-style: none !important;  /* IE and Edge */
              scrollbar-width: none !important;  /* Firefox */
            }
            #medal-3d-studio-container {
              flex: none !important;
              height: 40vh !important;
              width: 100% !important;
              margin-top: 60px !important;
            }
            .cs2-stats-panel {
              width: 100% !important;
              margin: 0 !important;
              padding: 32px 24px 60px !important;
              border-radius: 32px 32px 0 0 !important;
              border-bottom: none !important;
              border-left: none !important;
              border-right: none !important;
            }
            .cs2-modal-title {
              font-size: 26px !important;
            }
            .medal-modal-close-btn {
              top: 16px !important;
              right: 16px !important;
              width: 40px !important;
              height: 40px !important;
            }
          }
        </style>

        <!-- Elegant Close Button -->
        <button class="medal-modal-close-btn" id="close-medal-modal-btn" title="Kapat" style="position:absolute; top:32px; right:32px; width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.06); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); cursor:pointer; z-index:100; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" onmouseover="this.style.background='rgba(255,255,255,0.12)';this.style.transform='scale(1.05) rotate(90deg)';" onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.transform='scale(1) rotate(0deg)';">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        
        <!-- Left Side: 3D Studio Canvas -->
        <div id="medal-3d-studio-container" style="flex:1; display:flex; justify-content:center; align-items:center; cursor:grab; z-index:10; position:relative;">
        </div>

        <!-- Right Side: Epic Stats Panel -->
        <div class="cs2-stats-panel" style="width:440px; margin:40px 40px 40px 0; padding:48px 40px; display:flex; flex-direction:column; justify-content:center; align-items:stretch; border-radius:24px; border:1px solid rgba(255,255,255,0.08); background:linear-gradient(145deg, rgba(22,22,28,0.75) 0%, rgba(10,10,16,0.95) 100%); backdrop-filter:blur(40px); -webkit-backdrop-filter:blur(40px); z-index:10; box-shadow: 0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.04); position:relative;">

          
          <div style="display:flex; align-items:center; justify-content:flex-start; gap:12px; margin-bottom:16px;">
            <div style="width:32px; height:1px; background:linear-gradient(90deg, ${rankColor}, transparent);"></div>
            <h4 style="font-size:10px; font-weight:800; color:${rankColor}; letter-spacing:4px; text-transform:uppercase; margin:0;">Resmi Turnuva Hatırası</h4>
          </div>
          
          <h3 class="cs2-modal-title" style="font-size:32px; font-weight:900; line-height:1.2; margin:0 0 12px; color:#ffffff !important; -webkit-text-fill-color:#ffffff !important; text-shadow: 0 2px 12px rgba(0,0,0,0.6);">${rankTitle}</h3>
          
          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom: 48px; align-self: flex-start;">
            <span style="font-size:10px; font-weight:800; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:2px; margin-left:4px;">${leagueTypeLabel}</span>
            <div style="display:inline-flex; align-items:center; justify-content:center; padding: 6px 14px; background: ${rankColor}15; border: 1px solid ${rankColor}30; border-radius: 100px;">
              <span style="width:6px; height:6px; border-radius:50%; background:${rankColor}; margin-right:8px; box-shadow: 0 0 8px ${rankColor};"></span>
              <span style="font-size:13px; font-weight:800; color:${rankColor}; text-transform:uppercase; letter-spacing:1px;">${medal.league_name || 'Genel Odak Lig'}</span>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom: 16px;">
            <div class="medal-stat-card">
              <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.45); text-transform:uppercase; letter-spacing:1.5px;">Zirve Sıralaması</span>
              <span style="font-size:30px; font-weight:900; color:${rankColor}; text-shadow: 0 0 20px ${rankColor}70, 0 0 40px ${rankColor}30; line-height:1;">#${medal.rank}</span>
            </div>
            <div class="medal-stat-card">
              <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.45); text-transform:uppercase; letter-spacing:1.5px;">Odak Süresi</span>
              <span style="font-size:26px; font-weight:800; color:#ffffff; line-height:1;">${focusHours}<span style="font-size:14px; color:rgba(255,255,255,0.5); margin-left:5px;">Saat</span></span>
            </div>
          </div>
          
          <div class="medal-stat-row" style="margin-bottom:16px;">
            <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.45); text-transform:uppercase; letter-spacing:1.5px;">Sezon Verisi</span>
            <span style="font-size:14px; font-weight:800; color:#ffffff;">Sezon ${medal.season_number || 1} • ${medal.week_in_season || Math.min(4, Math.ceil(new Date(medal.earned_at || medal.created_at || new Date()).getDate() / 7))}. Hafta</span>
          </div>

          <div class="medal-stat-row">
            <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.45); text-transform:uppercase; letter-spacing:1.5px;">İşlenme Tarihi</span>
            <span style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.65);">${earnedDateStr}</span>
          </div>

          ${canToggle ? `
            <button class="medal-modal-toggle-btn" id="toggle-showcase-btn" style="margin-top:40px; width:100%; padding:18px; border-radius:14px; background:linear-gradient(135deg, ${rankColor}dd 0%, ${rankColor} 100%); color:#000000; font-weight:900; font-size:14px; text-transform:uppercase; letter-spacing:2px; border:none; cursor:pointer; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow:0 8px 25px ${rankColor}40, inset 0 2px 0 rgba(255,255,255,0.3);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 30px ${rankColor}60, inset 0 2px 0 rgba(255,255,255,0.4)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 8px 25px ${rankColor}40, inset 0 2px 0 rgba(255,255,255,0.3)';">
              ${medal.is_showcased === 1 ? 'Vitrenden Kaldır' : 'Profilde Sergile'}
            </button>
          ` : ''}
        </div>
      </div>
    `;

    setTimeout(() => {
      modalOverlay.classList.add('active');
      // Force dark mode — this modal is always dark regardless of app theme
      modalOverlay.setAttribute('data-theme', 'dark');
      
      // Initialize 3D Engine for this modal
      if (window.BLUNK_MEDAL_3D) {
        const studioContainer = document.getElementById('medal-3d-studio-container');
        const calculatedSize = window.innerWidth < 768 ? window.innerWidth * 0.8 : Math.min(window.innerWidth - 460, window.innerHeight) * 0.75;
        active3DMedalInstance = window.BLUNK_MEDAL_3D.render(studioContainer, medal, {
          interactive: true,
          autoRotate: true,
          size: calculatedSize
        });
      }
    }, 10);

    const closeBtn = document.getElementById('close-medal-modal-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modalOverlay.classList.remove('active');
        if (active3DMedalInstance) {
          active3DMedalInstance.destroy();
          active3DMedalInstance = null;
        }
      };
    }
    const toggleBtn = document.getElementById('toggle-showcase-btn');
    if (toggleBtn && onToggleCallback) {
      toggleBtn.onclick = () => {
        onToggleCallback(medal, () => {
          modalOverlay.classList.remove('active');
          if (active3DMedalInstance) {
            active3DMedalInstance.destroy();
            active3DMedalInstance = null;
          }
        });
      };
    }
  }
  function openUserActivityModal(userId, username) {
    if (typeof window.openUserActivityModal === 'function') {
      window.openUserActivityModal(userId, username);
    }
  }

  function openMyActivityModal() {
    const user = window.currentUser || window.user;
    if (user && (user.id || user.username)) {
      openUserActivityModal(user.id || user.username, user.username);
      return;
    }

    // Dynamic fallback: Fetch logged-in user details from /api/me if window.currentUser is missing
    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('Oturum kapalı');
        return res.json();
      })
      .then(userData => {
        if (userData && (userData.id || userData.username)) {
          window.currentUser = userData;
          openUserActivityModal(userData.id || userData.username, userData.username);
        } else {
          showAuthRequiredNotification();
        }
      })
      .catch(() => {
        showAuthRequiredNotification();
      });
  }

  function showAuthRequiredNotification() {
    const msg = 'Detaylı odak grafiğinizi görmek için giriş yapmalısınız.';
    if (typeof window.showInAppToast === 'function') {
      window.showInAppToast(msg);
    } else if (typeof window.showNotification === 'function') {
      window.showNotification(msg, 'info');
    } else {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:12px 20px; border-radius:12px; border:1px solid #334155; font-size:13px; font-weight:600; z-index:9999999; box-shadow:0 10px 30px rgba(0,0,0,0.5);';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }
  }

  // Interactive Season Calendar & Guide Modal (Removed: Replaced by Season Pass in seasonPass.js)
  function openSeasonCalendarModal(statusData) {
    if (window.BLUNK_SEASON_PASS) {
      window.BLUNK_SEASON_PASS.openModal();
    }
  }

  // Authentic Windows Mouse Pointer & Smart Context Guided Focus Setup Flow
  async function startGuidedFocusSetup(targetItem) {
    // Determine category search context
    const rawTarget = targetItem || currentLeagueState.league_name;
    const isGenelSearch = (!rawTarget || rawTarget === 'Genel' || rawTarget === 'Tümü');
    const textToType = isGenelSearch ? "burada ilgilendiğin konuyu arayabilirsin..." : rawTarget;

    // 1. Create or get Authentic Windows Cursor Element
    let cursor = document.getElementById('blunk-virtual-cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'blunk-virtual-cursor';
      cursor.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28" style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.65));">
          <path d="M4.5 3.5l14 8.5-6.8 1.8-3.7 6.7-3.5-17z" fill="#ffffff" stroke="#1c1c1c" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      `;
      document.body.appendChild(cursor);
    } else {
      cursor.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28" style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.65));">
          <path d="M4.5 3.5l14 8.5-6.8 1.8-3.7 6.7-3.5-17z" fill="#ffffff" stroke="#1c1c1c" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      `;
    }

    function getElementCenter(element) {
      if (!element) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }

    function getCurrentCursorPos() {
      const x = parseFloat(cursor.style.left) || window.innerWidth / 2;
      const y = parseFloat(cursor.style.top) || window.innerHeight / 2;
      return { x, y };
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function getCubicBezierPoint(p0, cp1, cp2, p1, t) {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      return {
        x: uuu * p0.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + ttt * p1.x,
        y: uuu * p0.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + ttt * p1.y
      };
    }

    async function moveCursorCurved(toPos, durationMs = 1100) {
      const fromPos = getCurrentCursorPos();
      const midX = (fromPos.x + toPos.x) / 2;
      const midY = (fromPos.y + toPos.y) / 2;
      const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);

      const normX = -(toPos.y - fromPos.y) / (dist || 1);
      const normY = (toPos.x - fromPos.x) / (dist || 1);

      const side = Math.random() < 0.5 ? 1 : -1;
      const curveMag = (60 + Math.random() * 80) * side;

      const cp1 = { x: fromPos.x + (midX - fromPos.x) * 0.5 + normX * curveMag, y: fromPos.y + (midY - fromPos.y) * 0.5 + normY * curveMag };
      const cp2 = { x: midX + (toPos.x - midX) * 0.5 + normX * curveMag * 0.8, y: midY + (toPos.y - midY) * 0.5 + normY * curveMag * 0.8 };

      const steps = Math.max(30, Math.floor(durationMs / 16));
      const stepDelay = durationMs / steps;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const pt = getCubicBezierPoint(fromPos, cp1, cp2, toPos, easedT);
        cursor.style.transition = 'none';
        cursor.style.left = `${pt.x}px`;
        cursor.style.top = `${pt.y}px`;
        cursor.classList.add('active');
        await delay(stepDelay);
      }
    }

    function simulateClickAt(x, y) {
      cursor.classList.add('clicking');
      const ripple = document.createElement('div');
      ripple.className = 'virtual-click-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      setTimeout(() => {
        cursor.classList.remove('clicking');
        ripple.remove();
      }, 500);
    }

    function triggerHoverEvents(el) {
      if (!el) return;
      try {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        el.classList.add('hover');
        setTimeout(() => {
          el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
          el.classList.remove('hover');
        }, 400);
      } catch (e) {}
    }

    async function waitForVisibleElement(selector, maxWaitMs = 3000) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const el = document.querySelector(selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return el;
        }
        await delay(50);
      }
      return document.querySelector(selector);
    }

    // Clean direct movement to target element (NO feed button wander, NO pulling back!)
    async function moveDirectToTarget(targetEl) {
      if (!targetEl) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const targetPos = getElementCenter(targetEl);
      await moveCursorCurved(targetPos, 750 + Math.random() * 150);
      triggerHoverEvents(targetEl);
      await delay(300);
      return targetPos;
    }

    // STEP 0: Position cursor on clicked button
    const startButton = document.querySelector('.league-start-focus-btn');
    const startPos = getElementCenter(startButton);
    cursor.style.left = `${startPos.x}px`;
    cursor.style.top = `${startPos.y}px`;
    cursor.classList.add('active');
    await delay(350);

    // STEP 1: Move DIRECTLY to "Saat" tab button (NO feed button wander!)
    const timerNavBtn = document.getElementById('nav-timer');
    if (timerNavBtn) {
      const timerPos = await moveDirectToTarget(timerNavBtn);
      simulateClickAt(timerPos.x, timerPos.y);
      timerNavBtn.click();
      await delay(600);
    } else if (typeof showPage === 'function') {
      showPage('timer');
      await delay(600);
    }

    // STEP 2: On Timer Page, move DIRECTLY to Timer Clock Dial & Click!
    let timerClockEl = document.getElementById('timerDisplaySolo') || 
                       document.getElementById('timerRealClock') || 
                       document.querySelector('.timer-main-stage') || 
                       document.querySelector('#timerPage');

    if (timerClockEl) {
      const clockPos = await moveDirectToTarget(timerClockEl);
      simulateClickAt(clockPos.x, clockPos.y);

      if (typeof openFocusSetupModal === 'function') {
        openFocusSetupModal();
      } else if (typeof onMainTimerButtonClick === 'function') {
        onMainTimerButtonClick();
      } else {
        timerClockEl.click();
      }
      await delay(550);
    }

    // STEP 3: Inside Focus Setup Modal, move DIRECTLY to Search Input & Click
    const searchInput = await waitForVisibleElement('#fsm2SearchInput', 3000);
    if (searchInput) {
      await delay(300); // Allow modal animation to finish
      const searchPos = await moveDirectToTarget(searchInput);
      simulateClickAt(searchPos.x, searchPos.y);
      searchInput.focus();

      // Type text (General prompt OR specific category) letter by letter with ♾️ infinity orbit animation!
      const orbitCenter = { x: searchPos.x + 80, y: searchPos.y + 40 };
      let orbitFrame = 0;

      searchInput.value = '';
      for (let i = 0; i < textToType.length; i++) {
        searchInput.value += textToType[i];
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof fsmSearchActivities === 'function' && !isGenelSearch) {
          fsmSearchActivities(searchInput.value);
        }

        // Draw infinity orbit frame during typing
        for (let f = 0; f < 2; f++) {
          orbitFrame += 0.25;
          const infX = orbitCenter.x + 24 * Math.cos(orbitFrame);
          const infY = orbitCenter.y + 12 * Math.sin(2 * orbitFrame);
          cursor.style.transition = 'none';
          cursor.style.left = `${infX}px`;
          cursor.style.top = `${infY}px`;
          await delay(35);
        }
      }
      await delay(500);

      // If Genel search, clear search prompt so default top activities render!
      if (isGenelSearch) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof fsmSearchActivities === 'function') {
          fsmSearchActivities('');
        }
        await delay(350);
      }

      // STEP 4: Locate matching activity card in grid & Click
      await waitForVisibleElement('.fsm2-act-item', 2000);
      const gridItems = document.querySelectorAll('.fsm2-act-item');
      let targetGridEl = null;

      if (isGenelSearch) {
        targetGridEl = gridItems[0];
      } else {
        const normTarget = textToType.toLowerCase().trim();
        gridItems.forEach(el => {
          if (!targetGridEl && el.textContent.trim().toLowerCase().includes(normTarget)) {
            targetGridEl = el;
          }
        });
        if (!targetGridEl && gridItems.length > 0) {
          targetGridEl = gridItems[0];
        }
      }

      if (targetGridEl) {
        const itemPos = await moveDirectToTarget(targetGridEl);
        simulateClickAt(itemPos.x, itemPos.y);
        targetGridEl.click();
        await delay(400);
      }
    }

    // Devam Et butonu basılabilir hale geldiği an imleç tatlı bir opaklık yumuşamasıyla anında kaybolur!
    cursor.classList.remove('active');
  }

  function goToTimerPage(targetItem) {
    startGuidedFocusSetup(targetItem || currentLeagueState.league_name);
  }

  function openAllTimeView() {
    currentLeagueState.timeframe = 'all_time';
    renderSeasonBanner();
    renderLeagueControls();
    loadLeaderboardData();
  }

  function openWeeklyView() {
    currentLeagueState.timeframe = 'weekly';
    renderSeasonBanner();
    renderLeagueControls();
    loadLeaderboardData();
  }

  window.BLUNK_LEAGUES = {
    init: initLeagueStatus,
    getIconSvg,
    getMedalSvg,
    openMedalModal,
    openRulesModal,
    openUserActivityModal,
    openMyActivityModal,
    openAllTimeView,
    openWeeklyView,
    openSearchModal,
    openSeasonCalendarModal,
    goToTimerPage
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('league-season-header')) {
      initLeagueStatus();
    }
  });

})();
