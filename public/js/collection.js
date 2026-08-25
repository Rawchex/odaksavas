/**
 * collection.js
 * Kullanıcı Envanteri (Koleksiyon) Modalı
 */

const BLUNK_COLLECTION = (function() {

  let overlayEl = null;
  let activeCategory = 'ALL';
  let inventoryData = [];
  let equippedData = { banner: null, theme: null, emoji: null };

  function initModal() {
    if (overlayEl) return;
    
    overlayEl = document.createElement('div');
    overlayEl.id = 'collection-modal-overlay';
    overlayEl.className = 'collection-modal-overlay';
    document.body.appendChild(overlayEl);

    overlayEl.innerHTML = `
      <div class="collection-header">
        <div class="collection-title">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 3h16a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2z"/><path d="M4 12h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          KOLEKSİYON
        </div>
        <button class="collection-close-btn" id="collection-close-btn">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="collection-body">
        <div class="collection-sidebar">
          <div class="collection-tab active" data-category="ALL" onclick="BLUNK_COLLECTION.setCategory('ALL')">TÜMÜ</div>
          <div class="collection-tab" data-category="BANNER" onclick="BLUNK_COLLECTION.setCategory('BANNER')">PROFİL KARTLARI</div>
          <div class="collection-tab" data-category="THEME" onclick="BLUNK_COLLECTION.setCategory('THEME')">TEMALAR</div>
          <div class="collection-tab" data-category="EMOJI" onclick="BLUNK_COLLECTION.setCategory('EMOJI')">EMOJİ & ROZETLER</div>
        </div>
        
        <div class="collection-content">
          <div class="collection-grid" id="collection-grid-view">
            <!-- Items injected here -->
          </div>
        </div>
      </div>
    `;

    document.getElementById('collection-close-btn').addEventListener('click', closeModal);
  }

  async function fetchInventory() {
    try {
      const res = await fetch('/api/inventory/status');
      if (res.ok) {
        const data = await res.json();
        inventoryData = data.inventory || [];
        equippedData = data.equipped || {};
      }
    } catch(e) {
      console.error("Failed to fetch inventory:", e);
    }
  }

  function setCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll('.collection-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.collection-tab[data-category="${cat}"]`).classList.add('active');
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById('collection-grid-view');
    let html = '';

    // config rewards represents all possible items. We cross-reference with inventoryData.
    if (!window.BLUNK_SEASON_CONFIG) return;
    
    const allRewards = window.BLUNK_SEASON_CONFIG.rewards;
    
    // Filter inventory based on category
    const itemsToShow = inventoryData.filter(invItem => {
      if (activeCategory === 'ALL') return true;
      return invItem.item_type === activeCategory;
    });

    if (itemsToShow.length === 0) {
      grid.innerHTML = `<div style="color:#94a3b8; font-weight:700; width:100%; text-align:center; padding:40px;">Bu kategoride henüz bir eşyan yok. Savaş biletinden ödül kazanmalısın!</div>`;
      return;
    }

    itemsToShow.forEach(invItem => {
      const rewardConfig = allRewards[invItem.item_id];
      if (!rewardConfig) return;

      const isEquipped = (
        equippedData.banner === invItem.item_id ||
        equippedData.theme === invItem.item_id ||
        equippedData.emoji === invItem.item_id
      );

      html += `
        <div class="collection-item-card ${isEquipped ? 'equipped' : ''}" onclick="BLUNK_COLLECTION.equipItem('${invItem.item_id}', '${invItem.item_type}')">
          <div class="collection-item-icon" style="color:${rewardConfig.color}">
            ${rewardConfig.icon}
          </div>
          <div class="collection-item-title">${rewardConfig.name}</div>
          <div class="collection-item-type">${rewardConfig.type}</div>
          <button class="collection-equip-btn">
            ${isEquipped ? 'KUŞANILDI' : 'KUŞAN'}
          </button>
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  async function equipItem(itemId, itemType) {
    try {
      const res = await fetch('/api/inventory/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, item_type: itemType })
      });
      const data = await res.json();
      if (data.success) {
        // Update local equipped data
        if (itemType === 'BANNER') equippedData.banner = itemId;
        else if (itemType === 'THEME') equippedData.theme = itemId;
        else if (itemType === 'EMOJI') equippedData.emoji = itemId;
        
        renderGrid(); // Refresh UI
        
        // Trigger global app UI update for cosmetics if needed
        applyCosmeticsGlobally();

      } else {
        alert(data.error || "Kuşanma başarısız.");
      }
    } catch(e) {
      alert("Bağlantı hatası.");
    }
  }

  function applyCosmeticsGlobally() {
    // Profil kartlarına banner uygula vs.
    // Şimdilik sadece sayfa yenilenince veya leaderboard render olunca gözükebilir
    // Ancak demo için:
    if (window.BLUNK_LEAGUES && typeof window.BLUNK_LEAGUES.reload === 'function') {
      window.BLUNK_LEAGUES.reload();
    }
  }

  async function openModal() {
    initModal();
    document.body.style.overflow = 'hidden';
    await fetchInventory();
    setCategory('ALL'); // Renders grid
    
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
    setCategory,
    equipItem
  };

})();

window.BLUNK_COLLECTION = BLUNK_COLLECTION;
