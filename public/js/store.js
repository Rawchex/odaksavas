/**
 * store.js
 * Odak Parası (Virtual Currency) Mağaza Arayüzü ve Satın Alım Mantığı
 */

const BLUNK_STORE = (function() {

  let overlayEl = null;
  let selectedPackage = null;

  const PACKAGES = {
    pack_500: { amount: 500, price: '49 ₺', name: 'Başlangıç Paketi' },
    pack_1100: { amount: 1100, price: '99 ₺', name: 'Sezon Paketi' },
    pack_2500: { amount: 2500, price: '199 ₺', name: 'Pro Paket' }
  };

  function initModal() {
    if (overlayEl) return;
    
    overlayEl = document.createElement('div');
    overlayEl.id = 'store-modal-overlay';
    overlayEl.className = 'store-modal-overlay';
    document.body.appendChild(overlayEl);

    overlayEl.innerHTML = `
      <div class="store-modal-container">
        <div class="store-header">
          <div class="store-header-title">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path stroke="#0f1923" stroke-width="2" d="M12 6v12M8 10h8M8 14h8"/></svg>
            ODAK PARASI MAĞAZASI
          </div>
          <button class="store-close-btn" id="store-close-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="store-body">
          
          <!-- Paket Seçim Ekranı -->
          <div class="store-packages-container" id="store-packages-view">
            
            <div class="store-package-card" onclick="BLUNK_STORE.selectPackage('pack_500')">
              <svg class="store-package-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
              <div class="store-package-amount">500</div>
              <div class="store-package-label">Odak Parası</div>
              <div class="store-package-price">49 ₺</div>
            </div>

            <div class="store-package-card recommended" onclick="BLUNK_STORE.selectPackage('pack_1100')">
              <div class="store-package-badge">EN POPÜLER</div>
              <svg class="store-package-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <div class="store-package-amount">1100</div>
              <div class="store-package-label">Odak Parası</div>
              <div class="store-package-price">99 ₺</div>
            </div>

            <div class="store-package-card" onclick="BLUNK_STORE.selectPackage('pack_2500')">
              <svg class="store-package-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 7h-4V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 5h4v2h-4V5zm10 14H4V9h16v10z"/></svg>
              <div class="store-package-amount">2500</div>
              <div class="store-package-label">Odak Parası</div>
              <div class="store-package-price">199 ₺</div>
            </div>

          </div>

          <!-- Ödeme Formu (Simülasyon) -->
          <div class="store-payment-view" id="store-payment-view">
            <div class="store-payment-header">
              <h3 id="store-payment-title">1100 OP Satın Alınıyor</h3>
              <p>Güvenli Ödeme - Test Modu</p>
            </div>

            <div class="store-payment-card-visual">
              <div class="store-card-chip"></div>
              <div class="store-card-dots">**** **** **** 4242</div>
              <div class="store-card-footer">
                <span>JOHN DOE</span>
                <span>12/28</span>
              </div>
            </div>

            <button class="store-payment-btn" id="store-payment-btn" onclick="BLUNK_STORE.processPayment()">
              <span id="store-payment-btn-text">99 ₺ ÖDE</span>
              <div class="store-loader" id="store-payment-loader"></div>
            </button>
            <button style="margin-top:16px; background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:12px; font-weight:700;" onclick="BLUNK_STORE.backToPackages()">← Paketlere Dön</button>
          </div>

        </div>
      </div>
    `;

    document.getElementById('store-close-btn').addEventListener('click', closeModal);
  }

  function openModal() {
    initModal();
    document.body.style.overflow = 'hidden';
    backToPackages(); // Her açılışta paketleri göster
    setTimeout(() => {
      overlayEl.classList.add('active');
    }, 10);
  }

  function closeModal() {
    if (!overlayEl) return;
    overlayEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  function selectPackage(packId) {
    selectedPackage = packId;
    const packInfo = PACKAGES[packId];

    document.getElementById('store-packages-view').style.display = 'none';
    document.getElementById('store-payment-view').style.display = 'flex';
    
    document.getElementById('store-payment-title').textContent = `${packInfo.amount} OP Satın Alınıyor`;
    document.getElementById('store-payment-btn-text').textContent = `${packInfo.price} ÖDE`;
  }

  function backToPackages() {
    selectedPackage = null;
    document.getElementById('store-packages-view').style.display = 'flex';
    document.getElementById('store-payment-view').style.display = 'none';
    
    const btn = document.getElementById('store-payment-btn');
    btn.disabled = false;
    document.getElementById('store-payment-btn-text').style.display = 'block';
    document.getElementById('store-payment-loader').style.display = 'none';
  }

  async function processPayment() {
    if (!selectedPackage) return;
    
    const btn = document.getElementById('store-payment-btn');
    btn.disabled = true;
    document.getElementById('store-payment-btn-text').style.display = 'none';
    document.getElementById('store-payment-loader').style.display = 'block';

    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selectedPackage })
      });
      const data = await res.json();
      
      if (data.success && data.paymentUrl) {
        // Yönlendirme işlemi (Shopier 3D Secure veya Mock Redirect)
        window.location.href = data.paymentUrl;
      } else {
        alert(data.error || 'Ödeme başlatılamadı.');
        backToPackages();
      }
    } catch (e) {
      alert('Bağlantı hatası.');
      backToPackages();
    }
  }

  return {
    openModal,
    closeModal,
    selectPackage,
    backToPackages,
    processPayment
  };

})();

window.BLUNK_STORE = BLUNK_STORE;
