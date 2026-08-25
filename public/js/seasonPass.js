/**
 * seasonPass.js
 * Valorant Tarzı Sezon Bileti DOM İşlemleri
 */

const BLUNK_SEASON_PASS = (function() {

  let overlayEl = null;

  function initModal() {
    if (overlayEl) return;
    
    overlayEl = document.createElement('div');
    overlayEl.id = 'sp-modal-overlay';
    overlayEl.className = 'sp-modal-overlay';
    document.body.appendChild(overlayEl);

    overlayEl.innerHTML = `
      <div class="sp-header-bar">
        <div class="sp-header-title">
          SEZON BİLETİ
          <span id="sp-header-season-name">Yükleniyor...</span>
        </div>
        <button class="sp-close-btn" id="sp-close-btn">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="sp-content-area">
        <!-- SOL PANEL: İlerleme & Premium -->
        <div class="sp-sidebar">
          
          <div class="sp-current-progress-card" id="sp-current-progress-card">
            <!-- Geçerli ilerleme buraya render edilecek -->
          </div>

          <div class="sp-premium-banner" id="sp-premium-banner">
            <!-- Premium banner -->
          </div>

        </div>

        <!-- SAĞ PANEL: Valorant Tarzı Track -->
        <div class="sp-track-container">
          <div class="sp-track-scroll-area" id="sp-track-scroll-area">
            <!-- Tiers (Seviyeler) Buraya Eklenecek -->
          </div>
        </div>
      </div>
    `;

    document.getElementById('sp-close-btn').addEventListener('click', closeModal);
  }

  function renderData() {
    const config = window.BLUNK_SEASON_CONFIG;
    if (!config) return;

    document.getElementById('sp-header-season-name').textContent = config.metadata.season_name;

    const currentXP = config.currentUser.total_xp;
    
    // Geçerli Seviye ve Sonraki Seviye Hesabı
    let currentLevel = 0;
    let xpForNextLevel = 0;
    let xpOfCurrentLevelBase = 0; // Bulunduğu seviyenin taban XP'si

    for (let i = 0; i < config.tiers.length; i++) {
      if (currentXP >= config.tiers[i].required_xp) {
        currentLevel = config.tiers[i].level;
        xpOfCurrentLevelBase = config.tiers[i].required_xp;
      } else {
        xpForNextLevel = config.tiers[i].required_xp;
        break;
      }
    }

    renderCurrentProgress(currentLevel, currentXP, xpOfCurrentLevelBase, xpForNextLevel, config.metadata.max_tier);
    renderPremiumBanner(config);
    renderTrack(config, currentXP);
  }

  function renderCurrentProgress(currentLevel, currentXP, baseXP, nextXP, maxTier) {
    const container = document.getElementById('sp-current-progress-card');
    
    if (currentLevel >= maxTier) {
      container.innerHTML = `
        <div class="sp-current-tier-title">SEZON TAMAMLANDI</div>
        <div class="sp-current-tier-value">Maks. Seviye</div>
        <div class="sp-xp-bar-container">
          <div class="sp-xp-bar-fill" style="width: 100%;"></div>
        </div>
        <div class="sp-xp-text">
          <span>Toplam: ${new Intl.NumberFormat('tr-TR').format(currentXP)} XP</span>
        </div>
      `;
      return;
    }

    const nextLevel = currentLevel + 1;
    const xpNeededForThisLevel = nextXP - baseXP;
    const xpGainedInThisLevel = currentXP - baseXP;
    const progressPct = Math.min(100, Math.floor((xpGainedInThisLevel / xpNeededForThisLevel) * 100));

    container.innerHTML = `
      <div class="sp-current-tier-title">SIRADAKİ: SEVİYE ${nextLevel}</div>
      <div class="sp-current-tier-value">${progressPct}%</div>
      <div class="sp-xp-bar-container">
        <div class="sp-xp-bar-fill" style="width: ${progressPct}%;"></div>
      </div>
      <div class="sp-xp-text">
        <span>${new Intl.NumberFormat('tr-TR').format(xpGainedInThisLevel)}</span>
        <span>${new Intl.NumberFormat('tr-TR').format(xpNeededForThisLevel)} XP</span>
      </div>
    `;
  }

  async function handlePremiumUpgrade(config) {
    if (config.currentUser.is_premium_active) return;
    
    // Check balance
    if (config.currentUser.blunk_coins < 1000) {
      if (window.BLUNK_STORE) {
        window.BLUNK_STORE.openModal();
      } else {
        alert("Yetersiz Bakiye! Odak Parası mağazasına gidiniz.");
      }
      return;
    }

    // Attempt upgrade
    if (confirm("Premium Bileti 1000 OP karşılığında açmak istiyor musunuz?")) {
      try {
        const res = await fetch('/api/season-pass-system/upgrade', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert("Tebrikler! Premium Bilet Aktifleştirildi!");
          config.currentUser.is_premium_active = true;
          config.currentUser.blunk_coins = data.new_balance;
          
          // Liderlik tablosundaki OP'yi de güncelle
          const coinEl = document.getElementById('league-coin-amount');
          if (coinEl) coinEl.textContent = data.new_balance;

          renderData();
        } else {
          alert(data.error || "Bir hata oluştu.");
        }
      } catch (e) {
        alert("Bağlantı hatası.");
      }
    }
  }

  function renderPremiumBanner(config) {
    const bannerEl = document.getElementById('sp-premium-banner');
    if (config.currentUser.is_premium_active) {
      bannerEl.innerHTML = `
        <h3 class="sp-premium-title">Premium Açık</h3>
        <p class="sp-premium-desc">Savaş biletindeki tüm alt satır ödüllerine erişimin var. Zirveye tırmanmaya devam et!</p>
        <div style="font-size:12px; color:#94a3b8; font-weight:bold; margin-bottom: 8px;">BAKİYE: ${config.currentUser.blunk_coins} OP</div>
        <button class="sp-premium-btn" style="background:rgba(250,204,21,0.1); color:#facc15; pointer-events:none;">AKTİF</button>
      `;
    } else {
      bannerEl.innerHTML = `
        <h3 class="sp-premium-title">Premium Bileti Yükselt</h3>
        <p class="sp-premium-desc">Alt satırdaki destansı ödüllerin kilidini aç. Mevcut XP'n ile hak ettiğin premium ödülleri anında al!</p>
        <div style="font-size:12px; color:#94a3b8; font-weight:bold; margin-bottom: 8px;">BAKİYE: ${config.currentUser.blunk_coins} OP</div>
        <button class="sp-premium-btn" id="sp-btn-upgrade">${config.metadata.premium_price} SATIN AL</button>
      `;
      document.getElementById('sp-btn-upgrade').onclick = () => handlePremiumUpgrade(config);
    }
  }

  function renderTrack(config, currentXP) {
    const trackArea = document.getElementById('sp-track-scroll-area');
    const tiers = config.tiers;
    const rewards = config.rewards;
    const hasPremium = config.currentUser.is_premium_active;

    let html = '';

    tiers.forEach(tier => {
      const isUnlocked = currentXP >= tier.required_xp;
      const r = rewards[tier.reward_key];
      const isPremiumReward = tier.is_premium;
      const isEpic = (tier.level % 10 === 0 || tier.level === 1); // 1, 10, 20, 30... destansı kolonlar

      let freeHtml = '';
      let premiumHtml = '';

      // Riot Style: Eğer ödül premium ise alt bölgeye koy, ücretsizse üst bölgeye.
      let isClaimed = false;
      if (config.currentUser.claimed_items) {
        isClaimed = config.currentUser.claimed_items.includes(tier.reward_key);
      }

      if (!isPremiumReward && r) {
        freeHtml = generateRewardCardHtml(r, isUnlocked, false, hasPremium, isClaimed, tier.reward_key);
        premiumHtml = `<div class="sp-reward-card empty"></div>`;
      } else if (isPremiumReward && r) {
        freeHtml = `<div class="sp-reward-card empty"></div>`;
        premiumHtml = generateRewardCardHtml(r, isUnlocked, true, hasPremium, isClaimed, tier.reward_key);
      } else {
        freeHtml = `<div class="sp-reward-card empty"></div>`;
        premiumHtml = `<div class="sp-reward-card empty"></div>`;
      }

      html += `
        <div class="sp-tier-column ${isUnlocked ? 'unlocked' : 'locked'} ${isEpic ? 'is-epic' : ''}">
          
          <div class="sp-reward-free-zone">
            ${freeHtml}
          </div>

          <div class="sp-highway-container">
            <div class="sp-highway-line"></div>
            ${isUnlocked ? '<div class="sp-highway-line-fill" style="width: 100%;"></div>' : ''}
            <div class="sp-tier-node">${tier.level}</div>
          </div>

          <div class="sp-reward-premium-zone">
            ${premiumHtml}
          </div>

        </div>
      `;
    });

    trackArea.innerHTML = html;
  }

  async function claimReward(rewardKey, rewardType) {
    try {
      const res = await fetch('/api/inventory/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: rewardKey, item_type: rewardType })
      });
      const data = await res.json();
      if (data.success) {
        if (!window.BLUNK_SEASON_CONFIG.currentUser.claimed_items) {
          window.BLUNK_SEASON_CONFIG.currentUser.claimed_items = [];
        }
        window.BLUNK_SEASON_CONFIG.currentUser.claimed_items.push(rewardKey);
        renderData();
      } else {
        alert(data.error || "Ödül alınamadı.");
      }
    } catch(e) {
      console.error(e);
      alert("Bağlantı hatası.");
    }
  }

  // Export claimReward to be used in HTML string
  window.claimReward = claimReward;

  function generateRewardCardHtml(reward, isTierUnlocked, isPremiumReward, userHasPremium, isClaimed, rewardKey) {
    const isPremiumLocked = (isPremiumReward && !userHasPremium);
    const premiumLockedClass = isPremiumLocked ? 'premium-locked' : '';
    
    let lockIconHtml = '';
    
    if (isClaimed) {
      lockIconHtml = `
        <div class="sp-lock-icon" style="background:#4ade80; color:#1e1b4b; border-color:#4ade80;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      `;
    } else if (!isTierUnlocked || isPremiumLocked) {
      lockIconHtml = `
        <div class="sp-lock-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
      `;
    } else {
      // Unlocked but not claimed -> SHOW CLAIM BUTTON
      return `
        <div class="sp-reward-card claimable">
          <div class="sp-reward-icon" style="color: ${reward.color};">
            ${reward.icon}
          </div>
          <div class="sp-reward-title">${reward.name}</div>
          <button class="sp-claim-btn" onclick="claimReward('${rewardKey}', '${reward.type}')">AL</button>
        </div>
      `;
    }

    return `
      <div class="sp-reward-card ${premiumLockedClass}">
        ${lockIconHtml}
        <div class="sp-reward-icon" style="color: ${reward.color};">
          ${reward.icon}
        </div>
        <div class="sp-reward-title">${reward.name}</div>
        <div class="sp-reward-type">${reward.type}</div>
      </div>
    `;
  }

  async function openModal() {
    initModal();
    document.body.style.overflow = 'hidden';
    
    try {
      const [statusRes, invRes] = await Promise.all([
        fetch('/api/season-pass-system/status'),
        fetch('/api/inventory/status')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (window.BLUNK_SEASON_CONFIG) {
          window.BLUNK_SEASON_CONFIG.currentUser.total_xp = data.total_xp;
          window.BLUNK_SEASON_CONFIG.currentUser.is_premium_active = data.is_premium_active;
          window.BLUNK_SEASON_CONFIG.currentUser.blunk_coins = data.blunk_coins;
        }
      }

      if (invRes.ok) {
        const invData = await invRes.json();
        if (window.BLUNK_SEASON_CONFIG) {
          window.BLUNK_SEASON_CONFIG.currentUser.claimed_items = (invData.inventory || []).map(i => i.item_id);
        }
      }
    } catch(e) {
      console.error("Season pass / inventory fetch error:", e);
    }

    renderData();
    
    setTimeout(() => {
      overlayEl.classList.add('active');
    }, 10);
  }

  function closeModal() {
    if (!overlayEl) return;
    overlayEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  return {
    openModal,
    closeModal,
    claimReward
  };

})();

window.BLUNK_SEASON_PASS = BLUNK_SEASON_PASS;
