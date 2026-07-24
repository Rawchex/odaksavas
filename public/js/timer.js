/* ============================================================
   TIMER.JS — Focus Session, Violation, Party Duel
   ============================================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
let _timerInterval     = null;
let _partyPollInterval = null;
let _sessionStartTime  = null;
let _sessionElapsed    = 0;   // seconds
let _currentPartyId    = null;
let _duelMode          = false; // 2-member party = duel, else solo

// Questionnaire State
let _sessionRatingId   = null;
let _currentFeeling    = null;
let _currentCategory   = null;
let _currentActivity   = null;

// XP milestone flags (reset each session)
const _milestones = { 5:false, 10:false, 25:false, 60:false, 120:false };

let _loadingShownAt = null;
let _loadingTimeout = null;

function showSessionLoading(msg) {
  const el = document.getElementById('sessionLoadingOverlay');
  const msgEl = document.getElementById('sessionLoadingMsg');
  if (_loadingTimeout) {
    clearTimeout(_loadingTimeout);
    _loadingTimeout = null;
  }
  if (el) {
    if (msgEl) msgEl.textContent = msg || 'yükleniyor...';
    el.classList.add('visible');
    _loadingShownAt = Date.now();
  }
}

function hideSessionLoading() {
  return new Promise((resolve) => {
    const el = document.getElementById('sessionLoadingOverlay');
    if (!el) {
      resolve();
      return;
    }
    const elapsed = Date.now() - (_loadingShownAt || 0);
    const minDuration = 3000;
    if (elapsed < minDuration) {
      const delay = minDuration - elapsed;
      if (_loadingTimeout) clearTimeout(_loadingTimeout);
      _loadingTimeout = setTimeout(() => {
        el.classList.remove('visible');
        _loadingShownAt = null;
        _loadingTimeout = null;
        resolve();
      }, delay);
    } else {
      el.classList.remove('visible');
      _loadingShownAt = null;
      resolve();
    }
  });
}

// ============================================================
// XP PARTICLE ANIMATION
// ============================================================
// ============================================================
// LEVEL AND XP PROGRESSION SYSTEM
// ============================================================
window.getLevelFromXP = function(xp) {
  if (xp <= 0) return 1;
  return Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2);
};

window.getXPNeededForLevel = function(level) {
  return 50 * (level - 1) * level;
};

window.getLevelProgress = function(xp) {
  const level = getLevelFromXP(xp);
  const currentLevelStartXP = getXPNeededForLevel(level);
  const nextLevelStartXP = getXPNeededForLevel(level + 1);
  const xpInLevel = xp - currentLevelStartXP;
  const xpNeededForNext = nextLevelStartXP - currentLevelStartXP;
  return {
    level,
    xpInLevel,
    xpNeededForNext,
    percentage: Math.min(100, Math.max(0, (xpInLevel / xpNeededForNext) * 100))
  };
};

function updateXPBarUI(xp) {
  const progress = getLevelProgress(xp);
  
  const statLevel = document.getElementById('statLevel');
  const xpBarFill = document.getElementById('xpBarFill');
  const xpText    = document.getElementById('xpText');
  
  if (statLevel) statLevel.textContent = `LVL ${progress.level}`;
  if (xpBarFill) {
    xpBarFill.style.width = `${progress.percentage}%`;
  }
  if (xpText) {
    xpText.textContent = `${progress.xpInLevel}/${progress.xpNeededForNext} XP`;
  }
}

function animateXPBar(oldXP, newXP) {
  const startTime = Date.now();
  const duration = 5000; // 5 seconds
  
  triggerCurvedParticles(duration);

  function tick() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    
    // Cubic ease out
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    const interpolatedXP = Math.floor(oldXP + (newXP - oldXP) * easeProgress);
    updateXPBarUI(interpolatedXP);
    
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      updateXPBarUI(newXP);
    }
  }
  
  requestAnimationFrame(tick);
}

function triggerCurvedParticles(totalDuration) {
  const timerEl = document.getElementById('timerDisplaySolo');
  const xpRail  = document.getElementById('xpBarFill')?.parentElement;
  if (!timerEl || !xpRail) return;
  
  const srcRect  = timerEl.getBoundingClientRect();
  const destRect = xpRail.getBoundingClientRect();
  
  const srcX = srcRect.left + srcRect.width / 2;
  const srcY = srcRect.top - 15;
  
  const dstX = destRect.left + destRect.width * 0.5;
  const dstY = destRect.top + destRect.height / 2;
  
  const ctrlX = (srcX + dstX) / 2 - 60;
  const ctrlY = Math.min(srcY, dstY) - 120;
  
  const emitInterval = 100;
  const stopEmittingAt = totalDuration - 1000;
  const startTime = Date.now();
  
  const timerId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed > stopEmittingAt) {
      clearInterval(timerId);
      return;
    }
    spawnCurvedParticle(srcX, srcY, ctrlX, ctrlY, dstX, dstY);
    if (Math.random() > 0.4) {
      spawnCurvedParticle(srcX, srcY, ctrlX, ctrlY, dstX, dstY);
    }
  }, emitInterval);
}

function spawnCurvedParticle(srcX, srcY, ctrlX, ctrlY, dstX, dstY) {
  const p = document.createElement('div');
  p.style.cssText = `
    width: 4px;
    height: 4px;
    background: #ffffff;
    box-shadow: 0 0 5px rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    position: fixed;
    z-index: 999999;
    pointer-events: none;
  `;
  
  const jitterX = (Math.random() - 0.5) * 20;
  const jitterY = (Math.random() - 0.5) * 10;
  
  const pStart = { x: srcX + jitterX, y: srcY + jitterY };
  const pCtrl  = { x: ctrlX + (Math.random() - 0.5) * 40, y: ctrlY + (Math.random() - 0.5) * 30 };
  const pEnd   = { x: dstX, y: dstY };
  
  p.style.left = `${pStart.x}px`;
  p.style.top = `${pStart.y}px`;
  document.body.appendChild(p);
  
  const flightStartTime = Date.now();
  const flightDuration = 800 + Math.random() * 400;
  
  function animateFlight() {
    const elapsed = Date.now() - flightStartTime;
    const t = Math.min(1, elapsed / flightDuration);
    
    const x = (1 - t) * (1 - t) * pStart.x + 2 * (1 - t) * t * pCtrl.x + t * t * pEnd.x;
    const y = (1 - t) * (1 - t) * pStart.y + 2 * (1 - t) * t * pCtrl.y + t * t * pEnd.y;
    
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.opacity = (1 - t).toString();
    p.style.transform = `scale(${1 - 0.5 * t})`;
    
    if (t < 1) {
      requestAnimationFrame(animateFlight);
    } else {
      p.remove();
    }
  }
  
  requestAnimationFrame(animateFlight);
}


// ============================================================
// CHECK ACTIVE SESSION (on page load / tab re-open)
// ============================================================
async function checkActiveSession() {
  try {
    const res = await fetch('/api/sessions/active');
    const session = await res.json();
    if (!session || !session.id) return;

    // Resume the session
    window._activeSession  = session;
    window._violationFired = false;
    _sessionStartTime = new Date(session.start_time.replace(' ', 'T') + 'Z');
    _currentPartyId   = session.party_id || null;

    startTimerTick();
    updateTimerUI('running');

    if (_currentPartyId) startPartyPoll(_currentPartyId);
  } catch {}
}

// ============================================================
// START SESSION
// ============================================================
async function startFocusSession() {
  if (window._activeSession) return;

  // Reset milestones
  Object.keys(_milestones).forEach(k => _milestones[k] = false);
  window._violationFired = false;

  showSessionLoading('odaklanma başlıyor...');

  try {
    const res = await fetch('/api/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId: _currentPartyId || null })
    });

    if (!res.ok) { hideSessionLoading(); showToast('Oturum başlatılamadı'); return; }
    const data = await res.json();

    window._activeSession = { id: data.sessionId, partyId: _currentPartyId || null };
    _sessionStartTime = new Date();
    _sessionElapsed   = 0;

    localStorage.setItem('os_active_session', JSON.stringify({
      id: data.sessionId,
      partyId: _currentPartyId || null,
      startTime: _sessionStartTime.toISOString()
    }));

    startTimerTick();
    updateTimerUI('running');
    if (_currentPartyId) startPartyPoll(_currentPartyId);
  } catch {
    showToast('Oturum başlatılamadı');
  } finally {
    hideSessionLoading();
  }
}

// ============================================================
// STOP SESSION (normal end)
// ============================================================
async function stopFocusSession() {
  if (!window._activeSession) return;
  if (!(await window.showConfirm('Odaklanma seansını sonlandırmak istediğinizden emin misiniz?'))) return;
  await endSession(false);
}

// ============================================================
// FOCUS ACTIVITIES DICTIONARY
// ============================================================
const _activitiesDb = {
  "Eğitim": [
    "Ders Çalışmak", "Kitap Okumak", "Sınava Hazırlık", "Ödev Yapmak", "Kodlama Öğrenmek", "Dil Pratiği", "Araştırma Yapmak", "Tarih Okumak", 
    "Matematik Çözmek", "Fizik Çalışmak", "Kimya Çalışmak", "Biyoloji Çalışmak", "Edebiyat İncelemek", "Felsefe Okumak", "Coğrafya Çalışmak", 
    "Akademik Makale Yazmak", "Sunum Hazırlamak", "Online Kurs İzlemek", "Notları Düzenlemek", "Kelime Ezberlemek", "Tarih Araştırması", 
    "Sosyoloji Okumak", "Psikoloji Okumak", "Hukuk Çalışmak", "Tıp Makalesi Okumak", "Mühendislik Projesi Çalışmak", "Algoritma Tasarımı", 
    "Yazılım Mimarisi Okumak", "Veri Yapıları Çalışmak", "Yapay Zeka Araştırması", "Siber Güvenlik Çalışmak", "Veritabanı Tasarımı", 
    "Web Geliştirme", "Mobil Uygulama Geliştirme", "Veri Analizi", "Makine Öğrenimi", "Derin Öğrenme", "Bulut Bilişim", "DevOps Çalışmak", 
    "İstatistik Çalışmak", "Finansal Okuryazarlık", "Borsa Analizi", "Kripto Para Analizi", "İktisat Okumak", "Siyaset Bilimi Çalışmak"
  ],
  "İş & Proje": [
    "Kod Yazmak", "E-postaları Yanıtlamak", "Toplantı Yapmak", "Rapor Hazırlamak", "Proje Yönetimi", "Tasarım Yapmak", "Metin Yazarlığı", 
    "Müşteri Görüşmesi", "Bütçe Planlama", "İçerik Üretmek", "SEO Analizi", "Sosyal Medya Yönetimi", "Video Düzenlemek", "Ses Kaydı Yapmak", 
    "Portfolyo Güncellemek", "Pazarlama Stratejisi", "Satış Takibi", "Veri Girişi Yapmak", "Sunum Provası", "Ofis Düzenleme", 
    "Freelance İş Çalışmak", "Girişim Projesi", "İş Planı Hazırlamak", "Ürün Yönetimi", "Kullanıcı Deneyimi (UX) Araştırması", 
    "Arayüz (UI) Tasarımı", "Yazılım Testi Yapmak", "Kod İncelemesi (Code Review)", "Sunucu Yönetimi", "Hata Ayıklama (Debugging)", 
    "Teknik Destek Vermek", "İnsan Kaynakları Planlaması", "İşe Alım Görüşmesi", "Eğitim Vermek", "Danışmanlık Yapmak"
  ],
  "Sanat": [
    "Resim Yapmak", "Çizim Çalışmak", "Gitar Çalmak", "Piyano Çalmak", "Şarkı Sözü Yazmak", "Şiir Yazmak", "Roman/Öykü Yazmak", 
    "Heykel Yapmak", "Seramik Çalışmak", "Fotoğraf Düzenlemek", "Senaryo Yazmak", "Tiyatro Provası", "Dans Pratiği", "Şan Egzersizi", 
    "Beat/Müzik Altyapısı Yapmak", "Dijital Çizim", "3D Modelleme", "Animasyon Yapmak", "Karakter Tasarımı", "Kaligrafi Çalışmak", 
    "Ebru Sanatı", "Örgü Örmek", "Dikiş Dikmek", "Ahşap Boyama", "Origami Yapmak", "Beste Yapmak", "Enstrüman Bakımı", "Müzik Teorisi Çalışmak"
  ],
  "Hobi": [
    "Satranç Oynamak", "Sudoku Çözmek", "Yapboz (Puzzle) Yapmak", "Belgesel İzlemek", "Podcast Dinlemek", "Bahçe İşleri", 
    "Yemek Yapmak", "Yeni Tarif Denemek", "Bitki Bakımı", "Koleksiyon Düzenlemek", "Seyahat Planlamak", "Masa Oyunu Oynamak", 
    "Kağıt Oyunları", "Zeka Soruları Çözmek", "Kutu Oyunu Oynamak", "Origami Yapmak", "Model Uçak Yapmak", "Lego Tasarlamak",
    "Minecraft oynamak", "GTA V oynamak", "League of Legends oynamak", "Valorant oynamak", "CS:GO oynamak", "CS2 oynamak", 
    "FIFA oynamak", "EA Sports FC oynamak", "Cyberpunk 2077 oynamak", "Elden Ring oynamak", "Red Dead Redemption 2 oynamak", 
    "Fortnite oynamak", "PUBG oynamak", "Apex Legends oynamak", "DOTA 2 oynamak", "World of Warcraft oynamak", "The Witcher 3 oynamak", 
    "Baldur's Gate 3 oynamak", "Roblox oynamak", "Brawl Stars oynamak", "Clash Royale oynamak", "Clash of Clans oynamak", "Rust oynamak", 
    "Dead by Daylight oynamak", "Among Us oynamak", "Fall Guys oynamak", "Rocket League oynamak", "Call of Duty: Warzone oynamak", 
    "World of Tanks oynamak", "Genshin Impact oynamak", "Honkai: Star Rail oynamak", "Assassin's Creed oynamak", "Hades oynamak", 
    "Terraria oynamak", "Stardew Valley oynamak", "The Sims 4 oynamak", "Cities: Skylines oynamak", "Euro Truck Simulator 2 oynamak", 
    "Hearts of Iron IV oynamak", "Europa Universalis IV oynamak", "Civilization VI oynamak", "Football Manager oynamak", "Dofus oynamak", 
    "Metin2 oynamak", "Knight Online oynamak", "Silkroad Online oynamak", "Slay the Spire oynamak", "Hollow Knight oynamak", 
    "Celeste oynamak", "Portal 2 oynamak", "Half-Life 2 oynamak", "Skyrim oynamak", "Fallout 4 oynamak", "Destiny 2 oynamak", 
    "Overwatch 2 oynamak", "Rainbow Six Siege oynamak", "Resident Evil oynamak", "Tomb Raider oynamak", "Uncharted oynamak", 
    "God of War oynamak", "The Last of Us oynamak", "Marvel's Spider-Man oynamak", "Detroit: Become Human oynamak", 
    "Life is Strange oynamak", "Subnautica oynamak", "No Man's Sky oynamak", "Ark: Survival Evolved oynamak", "Sea of Thieves oynamak", 
    "Monster Hunter: World oynamak", "Tekken 8 oynamak", "Street Fighter 6 oynamak", "Mortal Kombat 1 oynamak", "Smash Bros oynamak", 
    "Zelda: Tears of the Kingdom oynamak", "Super Mario Odyssey oynamak", "Animal Crossing oynamak", "Hogwarts Legacy oynamak", 
    "Starfield oynamak", "Diablo IV oynamak", "Path of Exile oynamak", "Warframe oynamak", "Doom Eternal oynamak", "Battlefield oynamak", 
    "Call of Duty oynamak", "Phasmophobia oynamak", "Lethal Company oynamak", "Palworld oynamak", "Helldivers 2 oynamak", "Enshrouded oynamak", 
    "Forza Horizon oynamak", "Need for Speed oynamak", "Assetto Corsa oynamak", "F1 23 oynamak", "Microsoft Flight Simulator oynamak", 
    "Satisfactory oynamak", "Factorio oynamak", "Age of Empires IV oynamak", "StarCraft II oynamak", "Hearthstone oynamak", 
    "Yu-Gi-Oh! Master Duel oynamak", "Marvel Snap oynamak", "The Binding of Isaac oynamak", "Enter the Gungeon oynamak", 
    "Dead Cells oynamak", "Vampire Survivors oynamak", "Loop Hero oynamak", "Disco Elysium oynamak", "Mass Effect oynamak", 
    "Persona 5 Royal oynamak", "Dark Souls oynamak", "Sekiro oynamak", "Lies of P oynamak"
  ],
  "Sağlık": [
    "Ağırlık Antrenmanı (Fitness)", "Koşu Yapmak", "Kardiyo Egzersizi", "Yoga Yapmak", "Pilates Yapmak", "Esnetme (Stretching)", 
    "Meditasyon Yapmak", "Nefes Egzersizleri", "Yürüyüş Yapmak", "Bisiklete Binmek", "Yüzmek", "Boks Yapmak", "Ev Egzersizi", 
    "Sağlıklı Yemek Hazırlamak", "Kalori/Besin Takibi", "Su Tüketim Takibi", "Postür/Duruş Egzersizleri", "Fizyoterapi Hareketleri", 
    "Tenis Oynamak", "Basketbol Oynamak", "Futbol Oynamak", "Voleybol Oynamak", "Masa Tenisi Oynamak", "Squash Oynamak", 
    "Karın Kası Antrenmanı", "Şınav/Mekik Egzersizi", "İp Atlamak", "Pilates Topu Egzersizleri", "Kettlebell Antrenmanı"
  ],
  "Gelişim & Ev": [
    "Temizlik Yapmak", "Evi Düzenlemek", "Gardırop Temizliği", "Bulaşık Yıkamak", "Çamaşır Katlamak", "Gelecek Planlaması Yapmak", 
    "Günlük Yazmak", "Bütçe Kontrolü", "Alışveriş Listesi Hazırlamak", "Kişisel Hedef Belirleme", "Zaman Yönetimi Planı", 
    "Ajanda/Bullet Journal Tutmak", "Faturaları Düzenlemek", "E-devlet/Evrak İşleri", "Ütü Yapmak", "Nevresim Değiştirmek", 
    "Toz Almak", "Evi Havalandırmak", "Kişisel Bakım Rutini", "Cilt Bakımı Yapmak", "Saç Bakımı Yapmak", "Diş Temizliği/Bakımı", 
    "Meditasyon ve Rahatlama", "Göz Egzersizleri", "Düşünceleri Değerlendirmek", "Vizyon Panosu Hazırlamak", "Gereksiz Eşyalardan Arınmak"
  ]
};

// ============================================================
// FOCUS SUMMARY MULTI-STEP CONTROLLER
// ============================================================
function goToStep(stepName) {
  const steps = document.querySelectorAll('.summary-step');
  steps.forEach(step => {
    step.classList.remove('active');
  });
  
  const target = document.getElementById(`step${stepName}`);
  if (target) {
    target.classList.add('active');
  }
}

function openSummaryModal(data, sessionId) {
  _sessionRatingId = sessionId;
  _currentFeeling = null;
  _currentCategory = null;
  _currentActivity = null;

  const summaryModal = document.getElementById('focusSummaryModal');
  const summaryDuration = document.getElementById('summaryDuration');
  const summaryXP = document.getElementById('summaryXP');
  const summaryBonusRow = document.getElementById('summaryBonusRow');
  const summaryBonus = document.getElementById('summaryBonus');
  
  if (summaryModal) {
    if (summaryDuration) summaryDuration.textContent = fmtTime(data.duration || 0);
    if (summaryXP) {
      const baseXP = (data.xpGained || 0) - (data.bonusGained || 0);
      summaryXP.textContent = `+${baseXP} XP`;
    }
    if (data.bonusGained > 0) {
      if (summaryBonusRow) summaryBonusRow.style.display = 'flex';
      if (summaryBonus) summaryBonus.textContent = `+${data.bonusGained} XP`;
    } else {
      if (summaryBonusRow) summaryBonusRow.style.display = 'none';
    }
    
    goToStep('Overview');
    summaryModal.classList.add('open');
  }
}

function selectFeeling(emoji, label) {
  _currentFeeling = emoji + " " + label;
  goToStep('Category');
}

function selectCategory(category) {
  _currentCategory = category;
  
  const input = document.getElementById('activitySearchInput');
  if (input) {
    input.value = '';
  }
  const suggestions = document.getElementById('activitySuggestions');
  if (suggestions) {
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
  }
  
  goToStep('Activity');
}

function onActivitySearch(val) {
  const suggestions = document.getElementById('activitySuggestions');
  if (!suggestions) return;
  
  if (!val || val.trim().length === 0) {
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    return;
  }
  
  const query = val.toLowerCase().trim();
  const list = _activitiesDb[_currentCategory] || [];
  
  const matches = list.filter(item => item.toLowerCase().includes(query)).slice(0, 10);
  
  if (matches.length === 0) {
    suggestions.innerHTML = `<div class="activity-suggestion-item" onclick="selectActivity('${esc(val)}')"><strong>Ekle:</strong> "${esc(val)}"</div>`;
    suggestions.style.display = 'block';
    return;
  }
  
  suggestions.innerHTML = matches.map(item => `
    <div class="activity-suggestion-item" onclick="selectActivity('${esc(item)}')">${esc(item)}</div>
  `).join('');
  suggestions.style.display = 'block';
}

function selectActivity(activity) {
  _currentActivity = activity;
  const input = document.getElementById('activitySearchInput');
  if (input) {
    input.value = activity;
  }
  const suggestions = document.getElementById('activitySuggestions');
  if (suggestions) {
    suggestions.style.display = 'none';
  }
}

async function submitRating() {
  const input = document.getElementById('activitySearchInput');
  if (input && !_currentActivity) {
    _currentActivity = input.value.trim();
  }
  
  if (!_currentActivity) {
    showToast('Lütfen ne yaptığınızı belirtin');
    return;
  }
  
  if (!_sessionRatingId) return;
  
  try {
    const res = await fetch(`/api/sessions/rate/${_sessionRatingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feeling: _currentFeeling,
        category: _currentCategory,
        activity: _currentActivity
      })
    });
    
    if (res.ok) {
      const banner = document.getElementById('unratedSessionBanner');
      if (banner) banner.style.display = 'none';

      await loadSimilarUsers(_sessionRatingId);
      goToStep('Done');
    } else {
      showToast('Kayıt başarısız oldu');
    }
  } catch (err) {
    showToast('Bağlantı hatası');
  }
}

async function loadSimilarUsers(sessionId) {
  const container = document.getElementById('similarUsersContainer');
  const list = document.getElementById('similarUsersList');
  if (!container || !list) return;
  
  try {
    const res = await fetch(`/api/sessions/similar/${sessionId}`);
    if (res.ok) {
      const users = await res.json();
      if (users && users.length > 0) {
        list.innerHTML = users.map(u => {
          const safeUsername = (u.username || '').replace(/'/g, "\\'");
          return `
          <div class="similar-user-item" onclick="openUserModal('${safeUsername}')" style="cursor:pointer;">
            ${typeof renderAvatar === 'function' ? renderAvatar(u, 'avatar avatar-xs') : ''}
            <div class="similar-user-info">
              <span class="similar-user-name">${esc(u.username)}</span>
              <span class="similar-user-activity">${esc(u.activity)}</span>
            </div>
          </div>`;
        }).join('');
        container.style.display = 'block';
      } else {
        container.style.display = 'none';
      }
    }
  } catch (err) {
    container.style.display = 'none';
  }
}

async function checkUnratedSession() {
  if (window._activeSession) return;
  
  try {
    const res = await fetch('/api/sessions/unrated');
    if (res.ok) {
      const session = await res.json();
      const banner = document.getElementById('unratedSessionBanner');
      if (session && session.id) {
        _sessionRatingId = session.id;
        if (banner) banner.style.display = 'flex';
      } else {
        if (banner) banner.style.display = 'none';
      }
    }
  } catch {}
}

function openUnratedSessionRating() {
  if (!_sessionRatingId) return;
  
  const summaryModal = document.getElementById('focusSummaryModal');
  if (summaryModal) {
    goToStep('Feeling');
    summaryModal.classList.add('open');
  }
}

// ============================================================
// END SESSION (shared: normal or violation)
// ============================================================
async function endSession(isViolation = false) {
  const session = window._activeSession;
  if (!session) {
    updateTimerUI('idle');
    return;
  }
  const sessionIdToRate = session.id;
  if (!session.id) {
    window._activeSession = null;
    window._violationFired = false;
    resetTimerDisplay();
    updateTimerUI('idle');
    return;
  }

  clearInterval(_timerInterval);
  clearInterval(_partyPollInterval);
  _timerInterval     = null;
  _partyPollInterval = null;

  localStorage.removeItem('os_active_session');

  if (!isViolation) showSessionLoading('kaydediliyor...');

  try {
    const res = await fetch(`/api/sessions/end/${session.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violation: isViolation })
    });

    window._activeSession  = null;
    window._violationFired = false;

    if (res.ok) {
      const data = await res.json();

      if (!isViolation) {
        await hideSessionLoading();
      }

      if (data.total_focus_time !== undefined) {
        currentUser.total_focus_time = data.total_focus_time;
      }

      if (isViolation) {
        updateTimerUI('violated', data);
        updateTimerStats();
        // Show violation feedback
        const banner = document.getElementById('violationBanner');
        const crack  = document.getElementById('crackOverlay');
        if (banner) banner.classList.add('show');
        if (crack) crack.classList.add('show');
        setTimeout(() => {
          if (banner) banner.classList.remove('show');
          if (crack) crack.classList.remove('show');
        }, 3000);
      } else {
        // Update user stats
        if (data.xpGained !== undefined) {
          const oldLevel = currentUser.level || 1;
          const oldXP = currentUser.xp || 0;
          currentUser.xp             += data.xpGained;
          currentUser.level           = data.newLevel;
          
          // Trigger smooth XP bar progress and particle flow
          if (data.xpGained > 0) {
            animateXPBar(oldXP, currentUser.xp);
            setTimeout(() => {
              openSummaryModal(data, sessionIdToRate);
            }, 5000);
          } else {
            updateTimerStats();
            openSummaryModal(data, sessionIdToRate);
          }

          // Level up celebration
          if (data.newLevel > oldLevel) {
            setTimeout(() => {
              showToast(`🛡️ Gelişiminiz tescillendi. Kararlılığınızın devamı temennisiyle. (Seviye ${data.newLevel})`, 5000);
            }, 1200);
          }
        }
        updateTimerUI('completed', data);

        if (data.xpGained > 0) {
          const bonusText = data.bonusGained > 0 ? ` (+${data.bonusGained} Milestone Bonusu!)` : '';
          showToast(`+${data.xpGained} XP kazandın!${bonusText}`, 3000);
        }
      }
    } else {
      if (!isViolation) await hideSessionLoading();
      updateTimerUI('idle');
    }
  } catch (err) {
    console.error('Session end failed:', err);
    window._activeSession  = null;
    window._violationFired = false;
    if (!isViolation) await hideSessionLoading();
    updateTimerUI('idle');
  }

  // Reset display after 5s
  setTimeout(() => {
    if (!window._activeSession) {
      resetTimerDisplay();
      updateTimerUI('idle');
    }
  }, 5000);
}

// ============================================================
// VIOLATION HANDLER (called from app.js detection)
// ============================================================
function handleViolation(reason) {
  if (!window._activeSession || window._violationFired) return;
  window._violationFired = true;
  document.getElementById('violationBanner').textContent =
    `${reason || 'EKRANDAN UZAKLAŞTIN'} — ODAK BOZULDU`;
  endSession(true);
}

// ============================================================
// TIMER TICK
// ============================================================
function startTimerTick() {
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    if (!window._activeSession) { clearInterval(_timerInterval); return; }
    _sessionElapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
    renderTimerDisplay(_sessionElapsed);
    checkMilestones(_sessionElapsed);

    if (currentUser) {
      const displayTotal = (currentUser.total_focus_time || 0) + _sessionElapsed;
      const statTotal = document.getElementById('statTotal');
      if (statTotal && typeof fmtTime === 'function') {
        statTotal.textContent = fmtTime(displayTotal);
      }
    }
  }, 1000);
}

function renderTimerDisplay(secs) {
  if (_duelMode) {
    document.getElementById('duelTimerMe').textContent = fmtTimeClock(secs);
    updateDuelLeads();
  } else {
    const el = document.getElementById('timerDisplaySolo');
    el.textContent = fmtTimeClock(secs);
    el.classList.add('ticking');
    setTimeout(() => el.classList.remove('ticking'), 100);

    const bonusInd = document.getElementById('timerBonusIndicator');
    if (bonusInd) {
      const remaining = 60 - (secs % 60);
      bonusInd.textContent = `Sonraki Bonus (+5 XP): ${remaining} sn`;
    }
  }
}

function resetTimerDisplay() {
  document.getElementById('timerDisplaySolo').textContent = '00:00';
  document.getElementById('duelTimerMe').textContent      = '00:00';
  document.getElementById('duelTimerOther').textContent   = '00:00';
  document.getElementById('duelLeadMe').classList.remove('show');
  document.getElementById('duelLeadOther').classList.remove('show');
}

// ============================================================
// MILESTONES (XP feedback toasts)
// ============================================================
function checkMilestones(secs) {
  const mins = Math.floor(secs / 60);
  if (mins === 5  && !_milestones[5])   { _milestones[5]   = true; showToast('🔥 5 dakika — iyi gidiyorsun!', 2200); }
  if (mins === 10 && !_milestones[10])  { _milestones[10]  = true; showToast('⚡ 10 dakika — ritme girdin', 2200); }
  if (mins === 25 && !_milestones[25])  { _milestones[25]  = true; showToast('💪 25 dakika — yarı yoldasın', 2200); }
  if (mins === 60 && !_milestones[60])  { _milestones[60]  = true; showToast('🏆 1 SAAT! Efsane odak', 2600); }
  if (mins === 120 && !_milestones[120]){ _milestones[120] = true; showToast('👑 2 SAAT! Rakipler titredi', 2600); }
}

// ============================================================
// UI STATE
// ============================================================
function updateTimerUI(state, data = {}) {
  const startBtn     = document.getElementById('timerStartBtn');
  const stopBtn      = document.getElementById('timerStopBtn');
  const statusDot    = document.getElementById('statusDot');      // inside timer-status-chip
  
  const bonusInd = document.getElementById('timerBonusIndicator');
  if (bonusInd) {
    bonusInd.style.display = (state === 'running' && !_duelMode) ? 'block' : 'none';
  }
  const statusChip   = document.getElementById('timerStatusChip');
  const statusTxt    = document.getElementById('statusText');
  const timerTxt     = document.getElementById('timerStatusText');
  const soloDisp     = document.getElementById('timerDisplaySolo');
  const bottomNav    = document.getElementById('bottomNav');
  const topMeta      = document.getElementById('timerTopMeta');

  switch (state) {
    case 'running': {
      startBtn.style.display = 'none';
      stopBtn.style.display  = 'block';

      const partyBtn = document.getElementById('timerPartyBtn');
      if (partyBtn) partyBtn.style.display = 'none';

      if (statusChip) { statusChip.className = 'timer-status-chip state-focus'; }
      if (statusDot) { statusDot.className = 'timer-status-dot live'; }
      if (statusTxt) statusTxt.textContent = 'odaklanıyorsun';
      if (timerTxt)  { timerTxt.className = 'timer-status-text live'; timerTxt.textContent = 'ekrandan ayrılma'; }
      if (soloDisp)  { soloDisp.classList.remove('violated'); soloDisp.classList.add('active-pulse'); }

      if (bottomNav) bottomNav.style.display = 'none';
      if (topMeta)   topMeta.style.display = 'none';
      // party focus overlay will be shown by renderPartyDuel if in a party
      break;
    }

    case 'violated':
      startBtn.style.display = 'block';
      stopBtn.style.display  = 'none';
      if (statusChip) { statusChip.className = 'timer-status-chip state-status'; }
      if (statusDot) statusDot.className = 'timer-status-dot bad';
      if (statusTxt) statusTxt.textContent = 'ihlal';
      if (timerTxt)  { timerTxt.className = 'timer-status-text bad'; timerTxt.textContent = `odak bozuldu · ${fmtTime(_sessionElapsed)} kaydedilmedi`; }
      if (soloDisp)  { soloDisp.classList.add('violated'); soloDisp.classList.remove('active-pulse'); }
      if (bottomNav) bottomNav.style.display = 'flex';
      if (topMeta)   topMeta.style.display = 'flex';
      { const pfo = document.getElementById('partyFocusOverlay'); if (pfo) pfo.style.display = 'none'; }
      break;

    case 'completed':
      startBtn.style.display = 'block';
      stopBtn.style.display  = 'none';
      if (statusChip) { statusChip.className = 'timer-status-chip state-status'; }
      if (statusDot) statusDot.className = 'timer-status-dot good';
      if (statusTxt) statusTxt.textContent = 'tamamlandı';
      if (timerTxt)  {
        timerTxt.className = 'timer-status-text good';
        timerTxt.textContent = data.xpGained
          ? `${fmtTime(data.duration)} · +${data.xpGained} XP`
          : `${fmtTime(data.duration || _sessionElapsed)}`;
      }
      if (soloDisp)  { soloDisp.classList.remove('violated', 'active-pulse'); }
      if (bottomNav) bottomNav.style.display = 'flex';
      if (topMeta)   topMeta.style.display = 'flex';
      break;

    case 'idle':
    default: {
      startBtn.style.display = 'block';
      stopBtn.style.display  = 'none';
      const partyBtnIdle = document.getElementById('timerPartyBtn');
      if (partyBtnIdle && !_currentPartyId) partyBtnIdle.style.display = 'flex';
      
      if (statusChip) { statusChip.className = 'timer-status-chip state-status'; }
      if (typeof updatePresenceUI === 'function') {
        updatePresenceUI();
      } else {
        if (statusDot) statusDot.className = 'timer-status-dot';
        if (statusTxt) statusTxt.textContent = 'hazır';
      }
      
      if (timerTxt)  { timerTxt.className = 'timer-status-text'; timerTxt.textContent = 'odaklanmaya başlamak için dokun'; }
      if (soloDisp)  { soloDisp.classList.remove('violated', 'active-pulse'); }
      if (bottomNav) bottomNav.style.display = 'flex';
      if (topMeta)   topMeta.style.display = 'flex';
      { const pfo = document.getElementById('partyFocusOverlay'); if (pfo) pfo.style.display = _currentPartyId ? 'flex' : 'none'; }
      break;
    }
  }
}

// ============================================================
// PARTY DUEL & CHAT POLLING
// ============================================================
let _lastFocusingMembers = {};
let _partyLiveMembers = [];
let _partyLiveUIRefresh = null;
let _partyMessagesPoller = null;

function startPartyPoll(partyId) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') return;
  clearInterval(_partyPollInterval);
  clearInterval(_partyMessagesPoller);
  
  // 1. Lobi üyelerini çek (1 sn)
  fetchPartyAndRender(partyId);
  _partyPollInterval = setInterval(() => {
    if (!_currentPartyId) {
      clearInterval(_partyPollInterval);
      _partyPollInterval = null;
      return;
    }
    fetchPartyAndRender(_currentPartyId);
  }, 1000);

  // 2. Chat mesajlarını çek (3 sn)
  fetchPartyMessages(partyId);
  _partyMessagesPoller = setInterval(() => {
    if (!_currentPartyId) {
      clearInterval(_partyMessagesPoller);
      _partyMessagesPoller = null;
      return;
    }
    fetchPartyMessages(_currentPartyId);
  }, 3000);
  
  // 3. UI Timer Tick (her sn)
  if (!_partyLiveUIRefresh) {
    _partyLiveUIRefresh = setInterval(() => {
      if (!_partyLiveMembers || !_partyLiveMembers.length) return;
      _partyLiveMembers.forEach(m => {
        if (m.isActive || (m.isMe && window._activeSession)) {
          let elapsed = m.isMe 
            ? _sessionElapsed 
            : (m.sessionStartUtc ? Math.floor((Date.now() - m.sessionStartUtc.getTime()) / 1000) : 0);
          
          if (elapsed < 0) elapsed = 0;
          const card = document.getElementById(`member-card-${m.username}`);
          if (card) {
            const statusEl = card.querySelector('.member-status');
            if (statusEl) statusEl.textContent = `● ODAKTA: ${elapsed} sn`;
          }
        }
      });
    }, 1000);
  }
}

async function fetchPartyMessages(partyId) {
  try {
    const res = await fetch(`/api/parties/${partyId}/live-status`);
    if (!res.ok) return;
    const data = await res.json();
    
    const container = document.getElementById('partyChatMessages');
    if (!container) return;

    const wasNearBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 60;
    const currentMsgCount = container.children.length;

    const partySystemBanner = `
      <div class="chat-system-retention-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Güvenlik ve gizliliğiniz için oda sohbet mesajları 24 saat sonra otomatik olarak silinir.</span>
      </div>
    `;

    container.innerHTML = partySystemBanner + (data.messages || []).map(m => {
      if (m.user_id === 0 || !m.username) {
        return `
          <div style="align-self:center; text-align:center; margin:10px 0; font-size:11px; color:#555; font-weight:800; text-transform:uppercase; letter-spacing:1px; width:100%;">
            ${esc(m.content)}
          </div>
        `;
      }
      const isMe = m.username === currentUser.username;
      const decryptedContent = decryptText(m.content, key);
      return `
        <div class="party-msg-row ${isMe ? 'me' : ''}">
          <div style="cursor:pointer" onclick="openUserPage('${esc(m.username)}')">
            ${renderAvatar({ username: m.username, profile_photo: m.profile_photo }, 'avatar avatar-sm')}
          </div>
          <div class="party-msg-content">
            <div class="party-msg-name" onclick="openUserPage('${esc(m.username)}')">${esc(m.username)}</div>
            <div class="party-msg-bubble">${esc(decryptedContent)}</div>
          </div>
        </div>
      `;
    }).join('');

    if (data.messages && data.messages.length > currentMsgCount && currentMsgCount > 0) {
      const lastBubble = container.lastElementChild?.querySelector('.party-msg-bubble');
      if (lastBubble) {
        lastBubble.classList.add('new-message-highlight');
        setTimeout(() => lastBubble.classList.remove('new-message-highlight'), 2000);
      }
    }

    if (wasNearBottom || currentMsgCount === 0) {
      container.scrollTop = container.scrollHeight;
    }

    // Update unread badge count
    const isChatOpen = document.getElementById('partyChatModal').classList.contains('open');
    const totalMsgs = data.messages ? data.messages.length : 0;
    const badge = document.getElementById('partyChatUnreadBadge');
    
    if (isChatOpen) {
      localStorage.setItem(`last_seen_party_msg_${partyId}`, totalMsgs);
      if (badge) badge.style.display = 'none';
    } else {
      const lastSeen = parseInt(localStorage.getItem(`last_seen_party_msg_${partyId}`) || 0);
      const unread = totalMsgs - lastSeen;
      if (badge) {
        if (unread > 0) {
          badge.textContent = unread;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    }
  } catch {}
}

async function sendPartyChatMessage() {
  const input = document.getElementById('partyChatInput');
  const content = input?.value?.trim();
  if (!content || !_currentPartyId) return;

  const key = `party_${_currentPartyId}`;
  const encryptedContent = encryptText(content, key);

  input.value = '';
  try {
    const res = await fetch(`/api/parties/${_currentPartyId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: encryptedContent })
    });
    if (res.ok) {
      await fetchPartyMessages(_currentPartyId);
    }
  } catch {}
}

async function fetchPartyAndRender(partyId) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') return;
  try {
    const res = await fetch(`/api/parties/${partyId}`);
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      if (typeof clearActiveParty === 'function') clearActiveParty();
      return;
    }
    if (!res.ok) return;
    const party = await res.json();
    
    _partyLiveMembers = (party.members || []).map(m => {
      const isMe = m.username === currentUser?.username;
      const isActive = m.active_session_id !== null;
      const sessionStartUtc = m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null;
      return { username: m.username, isMe, isActive, sessionStartUtc };
    });

    // Check if anyone started focusing
    const newFocusing = {};
    (party.members || []).forEach(m => {
      const isMe = m.username === currentUser?.username;
      const isActive = m.active_session_id !== null;
      if (isActive && !isMe) {
        newFocusing[m.username] = true;
        if (!_lastFocusingMembers[m.username]) {
          showToast(`🔥 ${esc(m.username)} odağa başladı!`);
        }
      }
    });
    _lastFocusingMembers = newFocusing;

    renderPartyDuel(party);
  } catch (err) {
    if (err && err.name !== 'TypeError') console.error("fetchPartyAndRender error:", err);
  }
}

window._lobbyCardSize = localStorage.getItem('os_lobby_size') || 'm';

function setGlobalCardSize(size) {
  window._lobbyCardSize = size;
  localStorage.setItem('os_lobby_size', size);
  if (_currentPartyId) {
    fetchPartyAndRender(_currentPartyId);
  }
}

window._currentPartyData = null;

// Role display helper
function getRoleLabel(role) {
  const labels = { owner: 'Kurucu', admin: 'Yönetici', moderator: 'Moderatör', member: '' };
  return labels[role] || '';
}
function getRoleColor(role) {
  const colors = { owner: '#fbbf24', admin: '#c084fc', moderator: '#60a5fa', member: '#80848e' };
  return colors[role] || '#80848e';
}

function renderPartyDuel(partyData) {
  const party = (partyData && partyData.members) ? partyData : { members: Array.isArray(partyData) ? partyData : [] };
  const members = party.members || [];
  window._currentPartyData = party;
  // CRITICAL: Always sync window._currentPartyId with local _currentPartyId
  if (_currentPartyId) window._currentPartyId = _currentPartyId;

  const grid      = document.getElementById('partyDuelGrid');
  const solo      = document.getElementById('timerSolo');
  const duelInner = document.getElementById('timerDuelInner');
  const overlay   = document.getElementById('partyFocusOverlay');
  const membersEl = document.getElementById('partyFocusMembers');
  const labelEl   = document.getElementById('partyFocusLabel');
  const addChanBtn = document.getElementById('addChannelBtnHeader');

  if (!members.length || !overlay || !_currentPartyId) {
    if (grid) grid.style.display = 'none';
    if (overlay) {
      overlay.classList.remove('in-active-party');
      overlay.style.display = 'none';
      overlay.style.setProperty('display', 'none', 'important');
    }
    return;
  }

  // Keep solo clock visible
  _duelMode = false;
  solo.style.display      = 'flex';
  duelInner.style.display = 'none';
  if (grid) grid.style.display = 'none';

  // Identify current user's role in party
  const meMember = members.find(m => m.username === currentUser?.username);
  const isOwner = Boolean(
    (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  // canManage: server will do final auth check, client is just UI gating
  const canManage = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember?.role));
  const myDisplayRole = meMember?.role || (isOwner ? 'owner' : 'member');

  // Set Party Name Header
  const partyName = party.name || 'Odak Odası';
  if (labelEl) {
    labelEl.innerHTML = `${esc(partyName)} ${canManage ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="margin-left:4px; opacity:0.6;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' : ''}`;
  }

  if (addChanBtn) {
    addChanBtn.style.display = canManage ? 'inline-flex' : 'none';
  }

  // Find user's current channel
  const defaultChanId = parseInt(party.default_channel_id) || (party.channels && party.channels[0] ? parseInt(party.channels[0].id) : 1);
  if (meMember) {
    const serverChanId = meMember.channel_id ? parseInt(meMember.channel_id) : defaultChanId;
    if (window._currentChannelId && parseInt(window._currentChannelId) !== serverChanId) {
      console.log('[Party] Server channel updated for me, switching voice to:', serverChanId);
      window._currentChannelId = serverChanId;
      if (typeof switchVoiceChannel === 'function') switchVoiceChannel(serverChanId);
    } else if (!window._currentChannelId) {
      window._currentChannelId = serverChanId;
    }
  } else if (!window._currentChannelId) {
    window._currentChannelId = defaultChanId;
  }

  // Render Sub-Channels
  const channels = (party.channels && party.channels.length > 0) 
    ? party.channels.map(c => ({ ...c, id: parseInt(c.id) || defaultChanId })) 
    : [{ id: defaultChanId, name: 'Genel Odak Odası', user_limit: 0, position: 0, is_default: 1 }];

  const maxSecs = members.reduce((max, m) => {
    const isMe = m.username === currentUser?.username;
    const isActive = m.active_session_id !== null;
    const sessionStartUtc = m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null;
    const elapsed = isMe ? _sessionElapsed : (isActive && sessionStartUtc ? Math.floor((Date.now() - sessionStartUtc.getTime()) / 1000) : 0);
    return Math.max(max, elapsed);
  }, 1);

  membersEl.innerHTML = channels.map((chan, index) => {
    const channelMembers = members.filter(m => parseInt(m.channel_id) === parseInt(chan.id) || (!m.channel_id && chan.is_default));
    const isCurrentChannel = window._currentChannelId && parseInt(window._currentChannelId) === parseInt(chan.id);
    const isFull = chan.user_limit > 0 && channelMembers.length >= chan.user_limit;

    return `
      <div class="sub-channel-card ${isCurrentChannel ? 'active-channel' : ''}" 
           id="channel-card-${chan.id}"
           ondragover="handleChannelDragOver(event)" 
           ondragleave="handleChannelDragLeave(event)" 
           ondrop="handleChannelDrop(event, ${chan.id})">
        
        <div class="sub-channel-header" onclick="joinSubChannel(${chan.id})">
          <div class="sub-channel-title" style="display:flex; align-items:center; gap:8px; min-width:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="${isCurrentChannel ? '#23a55a' : '#80848e'}" stroke-width="2" width="16" height="16"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            <span class="sub-channel-name" style="color:${isCurrentChannel ? '#ffffff' : '#949ba4'}; font-weight:${isCurrentChannel ? '700' : '500'}; font-size:13px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${esc(chan.name)}</span>
            ${chan.user_limit > 0 ? `<span style="font-size:10px; color:#80848e; font-family:monospace; flex-shrink:0;">${channelMembers.length}/${chan.user_limit}</span>` : ''}
          </div>

          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${canManage ? `
              <div onclick="event.stopPropagation();" class="channel-actions" style="display:flex; align-items:center; gap:4px; opacity:0.6;">
                <button onclick="promptEditChannel(${chan.id}, '${esc(chan.name)}', ${chan.user_limit})" data-tooltip="Kanalı Düzenle" style="background:none; border:none; color:#b5bac1; cursor:pointer; padding:2px; display:inline-flex; align-items:center;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${!chan.is_default ? `<button onclick="promptDeleteChannel(${chan.id})" data-tooltip="Kanalı Sil" style="background:none; border:none; color:#b5bac1; cursor:pointer; padding:2px; display:inline-flex; align-items:center;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="sub-channel-members-list">
          ${channelMembers.length === 0 ? `<div style="font-size:11px; color:#4e5058; padding:4px 8px; font-style:italic;">— Boş —</div>` : channelMembers.map(m => {
            const isMe = m.username === currentUser?.username;
            const isActive = m.active_session_id !== null || (isMe && window._activeSession);
            const sessionStartUtc = m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null;
            const elapsed = isMe ? _sessionElapsed : (isActive && sessionStartUtc ? Math.floor((Date.now() - sessionStartUtc.getTime()) / 1000) : 0);
            const roleLabel = getRoleLabel(m.role);
            const roleColor = getRoleColor(m.role);

            return `
              <div class="party-focus-member ${isMe ? 'is-me' : ''} ${canManage ? 'can-drag' : ''}" 
                   id="member-card-${m.username}"
                   onclick="openUserVoiceModal('${esc(m.username)}')"
                   ${canManage ? `draggable="true" ondragstart="handleMemberDragStart(event, ${m.id})"` : ''}>
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden;">
                  ${renderAvatar(m, 'avatar avatar-xs')}
                  <div style="display:flex; flex-direction:column; min-width:0; overflow:hidden;">
                    <span class="party-focus-member-name" style="font-size:13px; color:${isMe ? '#ffffff' : '#dbdee1'}; font-weight:500; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                      ${esc(m.username)}
                    </span>
                    ${roleLabel ? `<span style="font-size:10px; color:${roleColor}; font-weight:700; text-transform:uppercase; letter-spacing:0.3px;">${roleLabel}</span>` : ''}
                  </div>
                </div>
                
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:6px;">
                  <div id="voice-badge-${m.username}"></div>
                  <span style="font-size:11px; color:#80848e; font-weight:600; white-space:nowrap;">${isActive ? fmtTimeClock(elapsed) : ''}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  const soloPartyRow = document.getElementById('soloPartyControlsRow');
  if (_currentPartyId) {
    overlay.classList.add('in-active-party');
    overlay.style.display = 'flex';
    overlay.style.removeProperty('display');
    if (soloPartyRow) soloPartyRow.style.display = 'none';
    const inviteBtn = document.getElementById('timerInvitePartyBtn');
    if (inviteBtn) inviteBtn.style.display = 'inline-flex';
  } else {
    overlay.classList.remove('in-active-party');
    overlay.style.display = 'none';
    overlay.style.setProperty('display', 'none', 'important');
    if (soloPartyRow) soloPartyRow.style.display = 'flex';
    const inviteBtn = document.getElementById('timerInvitePartyBtn');
    if (inviteBtn) inviteBtn.style.display = 'none';
  }

  // Sound Notification logic: Scoped strictly to sub-channel entry/exit and switching
  const myChanId = window._currentChannelId || party.default_channel_id;
  const currentMyChannelUsers = new Set(
    (members || [])
      .filter(m => {
        const cId = m.channel_id ? parseInt(m.channel_id) : party.default_channel_id;
        return parseInt(cId) === parseInt(myChanId);
      })
      .map(m => m.username)
  );

  if (window._lastMyChannelId !== undefined) {
    if (window._lastMyChannelId !== myChanId) {
      // Current user switched sub-channels!
      playChannelSound('connect');
    } else if (window._lastMyChannelUsers !== undefined) {
      let playedSound = false;

      // Check if another member joined my sub-channel
      currentMyChannelUsers.forEach(uname => {
        if (uname !== currentUser?.username && !window._lastMyChannelUsers.has(uname) && !playedSound) {
          playChannelSound('connect');
          playedSound = true;
        }
      });

      // Check if another member left my sub-channel
      if (!playedSound) {
        window._lastMyChannelUsers.forEach(uname => {
          if (uname !== currentUser?.username && !currentMyChannelUsers.has(uname) && !playedSound) {
            playChannelSound('disconnect');
            playedSound = true;
          }
        });
      }
    }
  } else {
    // Initial join to focus room / sub-channel
    playChannelSound('connect');
  }

  window._lastMyChannelUsers = currentMyChannelUsers;
  window._lastMyChannelId = myChanId;

  if (typeof updateLobbyVoiceBadges === 'function') {
    updateLobbyVoiceBadges();
  }
}

// ─── AUDIO NOTIFICATION PLAYER ────────────────────────────────
function playChannelSound(type) {
  try {
    const volSetting = localStorage.getItem('os_channel_sound_volume');
    const vol = volSetting !== null ? parseInt(volSetting) / 100 : 1.0;
    if (vol <= 0) return;

    const audioPath = type === 'connect' ? '/audio/connect.wav' : '/audio/disconnect.wav';
    const audio = new Audio(audioPath);
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(e => console.warn('[Sound] Audio play prevented:', e));
  } catch (e) {
    console.warn('[Sound] Error playing channel sound:', e);
  }
}

// ─── CUSTOM CHANNEL & MANAGEMENT MODAL HANDLERS ───────────────
window._ccmMode = null; // 'rename_party' | 'add_channel' | 'edit_channel'
window._ccmTargetChannelId = null;

function updateCcmLimitDisplay(val) {
  const v = parseInt(val) || 0;
  const display = document.getElementById('ccmLimitDisplay');
  if (display) display.textContent = v === 0 ? 'Sınırsız' : `${v} kişi`;
}

function openChannelConfigModal(mode, options = {}) {
  window._ccmMode = mode;
  window._ccmTargetChannelId = options.channelId || null;

  const partyModal = document.getElementById('partyModal');
  if (partyModal && partyModal.classList.contains('open')) {
    window._ccmWasPartyModalOpen = true;
    if (typeof closePartyModal === 'function') closePartyModal();
  }

  const modal = document.getElementById('channelConfigModal');
  const title = document.getElementById('ccmTitle');
  const nameLabel = document.getElementById('ccmNameLabel');
  const nameInput = document.getElementById('ccmNameInput');
  const limitWrap = document.getElementById('ccmLimitWrap');
  const limitInput = document.getElementById('ccmLimitInput');
  const deleteBtn = document.getElementById('ccmDeleteBtn');

  if (!modal) return;

  if (mode === 'rename_party') {
    if (title) title.textContent = 'Oda Adını Değiştir';
    if (nameLabel) nameLabel.textContent = 'ODA ADI';
    if (nameInput) nameInput.value = options.currentName || '';
    if (limitWrap) limitWrap.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
    const ssWrap = document.getElementById('ccmScreenShareWrap');
    if (ssWrap) ssWrap.style.display = 'none';
  } else if (mode === 'add_channel') {
    if (title) title.textContent = 'Yeni Alt Oda Ekle';
    if (nameLabel) nameLabel.textContent = 'KANAL ADI';
    if (nameInput) nameInput.value = '';
    if (limitWrap) limitWrap.style.display = 'block';
    if (limitInput) { limitInput.min = '0'; limitInput.value = '0'; }
    updateCcmLimitDisplay(0);
    if (deleteBtn) deleteBtn.style.display = 'none';
    const ssWrap = document.getElementById('ccmScreenShareWrap');
    const ssCheck = document.getElementById('ccmScreenShareToggle');
    if (ssWrap) ssWrap.style.display = 'flex';
    if (ssCheck) ssCheck.checked = false;
  } else if (mode === 'edit_channel') {
    if (title) title.textContent = 'Alt Odayı Düzenle';
    if (nameLabel) nameLabel.textContent = 'KANAL ADI';
    if (nameInput) nameInput.value = options.currentName || '';
    if (limitWrap) limitWrap.style.display = 'block';
    const lv = Math.min(parseInt(options.currentLimit) || 0, 20);
    if (limitInput) { limitInput.value = lv; }
    updateCcmLimitDisplay(lv);
    if (deleteBtn) deleteBtn.style.display = options.isDefault ? 'none' : 'inline-block';
    const ssWrap = document.getElementById('ccmScreenShareWrap');
    const ssCheck = document.getElementById('ccmScreenShareToggle');
    if (ssWrap) ssWrap.style.display = 'flex';
    if (ssCheck) ssCheck.checked = !!(options.allowScreenShare);
  }

  modal.style.display = 'flex';
  modal.classList.add('open');
  if (nameInput) {
    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 100);
  }
}

function closeChannelConfigModal() {
  const modal = document.getElementById('channelConfigModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
  window._ccmMode = null;
  window._ccmTargetChannelId = null;

  if (window._ccmWasPartyModalOpen) {
    window._ccmWasPartyModalOpen = false;
    if (typeof openPartyModal === 'function') openPartyModal();
  }
}

async function submitChannelConfigModal() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId || !window._ccmMode) {
    showToast('Odak odası bulunamadı');
    return;
  }

  const nameInput = document.getElementById('ccmNameInput');
  const limitInput = document.getElementById('ccmLimitInput');
  const ssCheck = document.getElementById('ccmScreenShareToggle');
  const name = nameInput ? nameInput.value.trim() : '';
  const userLimit = limitInput ? parseInt(limitInput.value) || 0 : 0;
  const allowScreenShare = ssCheck ? ssCheck.checked : false;

  if (!name) {
    if (typeof showToast === 'function') showToast('Lütfen geçerli bir isim giriniz');
    return;
  }

  const saveBtn = document.getElementById('ccmSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor...'; }

  try {
    if (window._ccmMode === 'rename_party') {
      const res = await fetch(`/api/parties/${partyId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        showToast('✅ Oda adı güncellendi');
        if (window._currentPartyData) window._currentPartyData.name = name;
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Güncellenemedi');
      }
    } else if (window._ccmMode === 'add_channel') {
      const res = await fetch(`/api/parties/${partyId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userLimit, allowScreenShare })
      });
      if (res.ok) {
        showToast('Yeni alt oda oluşturuldu');
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Oluşturulamadı');
      }
    } else if (window._ccmMode === 'edit_channel' && window._ccmTargetChannelId) {
      const res = await fetch(`/api/parties/${partyId}/channels/${window._ccmTargetChannelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userLimit, allowScreenShare })
      });
      if (res.ok) {
        showToast('✅ Kanal güncellendi');
        closeChannelConfigModal();
        fetchPartyAndRender(partyId);
        if (typeof refreshPartyModal === 'function') refreshPartyModal();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Güncellenemedi');
      }
    }
  } catch (e) {
    console.error('Submit channel config error:', e);
    showToast('İşlem başarısız');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Kaydet'; }
  }
}

async function submitChannelDeleteFromModal() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId || !window._ccmTargetChannelId) return;

  try {
    const res = await fetch(`/api/parties/${partyId}/channels/${window._ccmTargetChannelId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Alt oda silindi');
      playChannelSound('disconnect');
      closeChannelConfigModal();
      fetchPartyAndRender(partyId);
      if (typeof refreshPartyModal === 'function') refreshPartyModal();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Silinemedi');
    }
  } catch (e) {
    console.error('Delete channel error:', e);
  }
}

function triggerPartyRenameFromHeader() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) {
    if (typeof showToast === 'function') showToast('Herhangi bir odak odasında değilsiniz');
    return;
  }
  const party = window._currentPartyData || {};
  const members = party.members || [];
  const meMember = members.find(m => m.username === currentUser?.username);
  const isOwner = Boolean(
    (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  // If party data not loaded yet, allow based on partyId existing (server will validate)
  const canManage = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember?.role)) || !party.owner_id;

  if (!canManage) {
    if (typeof showToast === 'function') showToast('Sadece oda yöneticisi oda adını değiştirebilir');
    return;
  }

  const labelEl = document.getElementById('partyFocusLabel');
  const currentName = party.name || (labelEl ? labelEl.textContent.trim().replace(/\s*✏.*$/, '') : '');
  openChannelConfigModal('rename_party', { currentName });
}

function promptAddChannel() {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) {
    if (typeof showToast === 'function') showToast('Herhangi bir odak odasında değilsiniz');
    return;
  }
  const party = window._currentPartyData || {};
  const members = party.members || [];
  const meMember = members.find(m => m.username === currentUser?.username);
  const isOwner = Boolean(
    (party.owner_id && currentUser?.id && parseInt(party.owner_id) === parseInt(currentUser.id)) ||
    (party.owner_name && currentUser?.username && party.owner_name === currentUser.username) ||
    (meMember && meMember.role === 'owner')
  );
  const canManage = isOwner || (meMember && ['owner', 'admin', 'moderator'].includes(meMember?.role)) || !party.owner_id;

  if (!canManage) {
    if (typeof showToast === 'function') showToast('Sadece oda yöneticisi alt oda ekleyebilir');
    return;
  }


  openChannelConfigModal('add_channel');
}

function promptEditChannel(chanId, currentName, currentLimit) {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) { console.error('[Party] promptEditChannel: no partyId'); return; }
  const chan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  openChannelConfigModal('edit_channel', { channelId: chanId, currentName, currentLimit, isDefault: chan ? chan.is_default : false, allowScreenShare: chan ? !!chan.allow_screen_share : false });
}

function promptDeleteChannel(chanId) {
  const partyId = _currentPartyId || window._currentPartyId;
  if (!partyId) { console.error('[Party] promptDeleteChannel: no partyId'); return; }
  const chan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  openChannelConfigModal('edit_channel', { channelId: chanId, currentName: chan ? chan.name : '', currentLimit: chan ? chan.user_limit : 0, isDefault: chan ? chan.is_default : false, allowScreenShare: chan ? !!chan.allow_screen_share : false });
}

async function reorderChannel(chanId, direction) {
  if (!window._currentPartyId || !window._currentPartyData) return;
  const channels = window._currentPartyData.channels || [];
  const idx = channels.findIndex(c => parseInt(c.id) === parseInt(chanId));
  if (idx === -1) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= channels.length) return;

  // Swap position values
  const reordered = channels.map((c, i) => ({ id: c.id, position: i }));
  const tempPos = reordered[idx].position;
  reordered[idx].position = reordered[targetIdx].position;
  reordered[targetIdx].position = tempPos;

  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/channels-reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: reordered })
    });
    if (res.ok) {
      fetchPartyAndRender(window._currentPartyId);
    }
  } catch (e) {
    console.error('Reorder channels error:', e);
  }
}

async function joinSubChannel(chanId) {
  if (!window._currentPartyId) return;
  if (window._currentChannelId && parseInt(window._currentChannelId) === parseInt(chanId)) return;

  const targetChan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(chanId));
  const chanName = targetChan ? targetChan.name : 'Kanal';

  try {
    // 1. Join channel on server (updates channel_id in party_members)
    const res = await fetch(`/api/parties/${window._currentPartyId}/channels/${chanId}/join`, {
      method: 'POST'
    });
    if (res.ok) {
      // 2. Instantly switch voice channel (drops all peer connections, re-establishes)
      const prev = window._currentChannelId;
      window._currentChannelId = chanId;

      if (typeof switchVoiceChannel === 'function') {
        await switchVoiceChannel(chanId);
      }

      if (prev !== null) {
        playChannelSound('disconnect');
        setTimeout(() => playChannelSound('connect'), 120);
      } else {
        playChannelSound('connect');
      }

      showToast(`"${chanName}" kanalına geçildi`);
      fetchPartyAndRender(window._currentPartyId);
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Kanala katılamadı');
    }
  } catch (e) {
    console.error('Join channel error:', e);
  }
}


// Drag and Drop Event Handlers
function handleMemberDragStart(e, memberUserId) {
  e.stopPropagation();
  e.dataTransfer.setData('text/plain', memberUserId.toString());
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
  const targetEl = e.currentTarget;
  setTimeout(() => {
    if (targetEl) targetEl.classList.remove('dragging');
  }, 400);
}

function handleChannelDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleChannelDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
}

async function handleChannelDrop(e, targetChannelId) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');

  const userIdStr = e.dataTransfer.getData('text/plain');
  const targetUserId = parseInt(userIdStr);
  if (!targetUserId || !window._currentPartyId) return;

  const targetChan = (window._currentPartyData?.channels || []).find(c => parseInt(c.id) === parseInt(targetChannelId));
  const chanName = targetChan ? targetChan.name : 'Kanal';

  try {
    const res = await fetch(`/api/parties/${window._currentPartyId}/members/${targetUserId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: parseInt(targetChannelId) })
    });
    if (res.ok) {
      showToast(`Kullanıcı "${chanName}" kanalına taşındı`);
      // Play disconnect sound as user was moved/left current room
      playChannelSound('disconnect');
      fetchPartyAndRender(window._currentPartyId);
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Taşıma başarısız');
    }
  } catch (e) {
    console.error('Channel drop error:', e);
  }
}

// ============================================================
// PARTY CHAT DRAWER / BOTTOM SHEET
// ============================================================
function togglePartyChatModal(show) {
  const modal = document.getElementById('partyChatModal');
  if (modal) {
    modal.classList.toggle('open', show);
    if (show) {
      const badge = document.getElementById('partyChatUnreadBadge');
      if (badge) badge.style.display = 'none';
      if (_currentPartyId) {
        // Query current message count and mark as read
        const chatMsgs = document.getElementById('partyChatMessages');
        if (chatMsgs) {
          localStorage.setItem(`last_seen_party_msg_${_currentPartyId}`, chatMsgs.children.length);
        }
      }
      setTimeout(() => {
        const chatInput = document.getElementById('partyChatInput');
        if (chatInput) chatInput.focus();
        const chatMsgs = document.getElementById('partyChatMessages');
        if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
      }, 100);
    }
  }
}

// ============================================================
// SET ACTIVE PARTY (called from party.js)
// ============================================================
function setActiveParty(partyId) {
  if (!partyId || partyId === 'undefined' || partyId === 'null') {
    clearActiveParty();
    return;
  }
  _currentPartyId = partyId;
  window._currentPartyId = partyId;

  // Immediately make Focus Room Overlay visible
  const overlay = document.getElementById('partyFocusOverlay');
  if (overlay) {
    overlay.classList.add('in-active-party');
    overlay.style.display = 'flex';
    overlay.style.removeProperty('display');
  }

  // Auto switch page to timer if user created/joined room from another tab
  if (typeof showPage === 'function') {
    showPage('timer');
  }

  // Play connect sound effect
  playChannelSound('connect');

  const info = document.getElementById('activePartyInfo');
  const btn  = document.getElementById('timerPartyBtn');
  const chatBtn = document.getElementById('timerChatBtn');
  const leaveBtn = document.getElementById('timerLeavePartyBtn');
  
  const soloPartyRow = document.getElementById('soloPartyControlsRow');
  if (soloPartyRow) soloPartyRow.style.display = 'none';
  
  if (info) info.style.display = 'none';
  if (btn) {
    btn.style.display = 'inline-flex';
    btn.title = 'Oda Yönetimi';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }
  if (chatBtn) chatBtn.style.display = 'block';
  if (leaveBtn) leaveBtn.style.display = 'flex';
  
  // Start polling room & initialize WebRTC Voice Chat
  startPartyPoll(partyId);
  if (typeof initVoiceChat === 'function') {
    initVoiceChat(partyId);
  }
}

function clearActiveParty() {
  _currentPartyId = null;
  window._currentPartyId = null;
  _duelMode = false;

  if (_partyPollInterval) { clearInterval(_partyPollInterval); _partyPollInterval = null; }
  if (_partyMessagesPoller) { clearInterval(_partyMessagesPoller); _partyMessagesPoller = null; }
  if (_partyLiveUIRefresh) { clearInterval(_partyLiveUIRefresh); _partyLiveUIRefresh = null; }

  if (typeof stopVoiceChat === 'function') {
    stopVoiceChat();
  }

  const info = document.getElementById('activePartyInfo');
  const btn  = document.getElementById('timerPartyBtn');
  const chatBtn = document.getElementById('timerChatBtn');
  const leaveBtn = document.getElementById('timerLeavePartyBtn');
  const overlay = document.getElementById('partyFocusOverlay');
  const soloPartyRow = document.getElementById('soloPartyControlsRow');

  if (overlay) {
    overlay.classList.remove('in-active-party');
    overlay.style.display = 'none';
    overlay.style.setProperty('display', 'none', 'important');
  }
  if (info) info.style.display = 'none';
  if (soloPartyRow) soloPartyRow.style.display = 'flex';
  if (btn) {
    btn.style.display  = 'inline-flex';
    btn.title = 'Odak Odası';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }
  if (chatBtn) chatBtn.style.display = 'none';
  if (leaveBtn) leaveBtn.style.display = 'none';
  if (typeof togglePartyChatModal === 'function') togglePartyChatModal(false);

  const solo = document.getElementById('timerSolo');
  const duelInner = document.getElementById('timerDuelInner');
  if (solo) solo.style.display = 'flex';
  if (duelInner) duelInner.style.display = 'none';

  _partyLiveMembers = [];
  _lastFocusingMembers = {};
}

async function checkActiveParty() {
  try {
    const res = await fetch('/api/parties');
    if (!res.ok) return;
    const parties = await res.json();
    const activeParty = parties.find(p => p.is_member > 0);
    if (activeParty) {
      setActiveParty(activeParty.id);
    } else {
      clearActiveParty();
    }
  } catch (err) {
    console.error('Error checking active party:', err);
  }
}

async function leavePartyFromTimer() {
  if (!_currentPartyId) {
    if (typeof clearActiveParty === 'function') clearActiveParty();
    return;
  }
  const pid = _currentPartyId;
  try {
    const res = await fetch(`/api/parties/${pid}`);
    if (!res.ok) {
      if (typeof clearActiveParty === 'function') clearActiveParty();
      return;
    }
    const party = await res.json();
    const isOwner = currentUser && party.owner_id === currentUser.id;
    if (isOwner) {
      if (typeof deleteParty === 'function') {
        await deleteParty(pid);
      }
    } else {
      if (typeof leaveParty === 'function') {
        await leaveParty(pid);
      }
    }
  } catch (err) {
    console.error('Leave party from timer failed:', err);
  }
}

// ============================================================
// UPDATE TIMER UI STATS
// ============================================================
function updateTimerStats(withGlow = false) {
  if (!currentUser) return;
  const user = currentUser;
  
  const statTotal = document.getElementById('statTotal');
  
  updateXPBarUI(user.xp || 0);

  if (withGlow) {
    const xpBarFill = document.getElementById('xpBarFill');
    const xpText = document.getElementById('xpText');
    if (xpBarFill) {
      xpBarFill.classList.remove('gained');
      void xpBarFill.offsetWidth;
      xpBarFill.classList.add('gained');
    }
    if (xpText) {
      xpText.classList.add('gained');
      setTimeout(() => xpText.classList.remove('gained'), 1400);
    }
  }

  if (statTotal && typeof fmtTime === 'function') {
    statTotal.textContent = fmtTime(user.total_focus_time || 0);
  }
}

function closeFocusSummaryModal() {
  const modal = document.getElementById('focusSummaryModal');
  if (modal) modal.classList.remove('open');
  checkUnratedSession();
}

if (typeof currentUser !== 'undefined' && currentUser) {
  updateTimerStats();
  if (typeof checkActiveSession === 'function') checkActiveSession();
  if (typeof checkActiveParty === 'function') checkActiveParty();
  
  setTimeout(checkUnratedSession, 2000);
  setInterval(checkUnratedSession, 30000); // Check every 30 seconds
}

function startStatusChipAnimation() {
  if (window._statusChipInterval) return;

  const chip    = document.getElementById('timerStatusChip');
  const avatarEl= document.getElementById('statusChipAvatar');
  const nameEl  = document.getElementById('statusChipUsername');
  const textEl  = document.getElementById('statusText');
  const dotEl   = document.getElementById('statusDot');
  if (!chip) return;

  const SPRING   = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const FAST_OUT = 'cubic-bezier(0.55, 0, 1, 0.45)';
  const COLORS   = { online: '#4ade80', away: '#fbbf24', dnd: '#ef4444', invisible: '#9ca3af' };
  const LABELS   = { online: 'ÇEVRİMİÇİ', away: 'UZAKTA', dnd: 'R. ETME', invisible: 'GÖRÜNMEz' };

  let _dotIdle     = null;   // current idle animation handle
  let _transitioning = false;

  /* ── Helpers ── */

  // Commit & cancel all animations on el, baking final style into inline styles.
  // This lets the next animation start from the exact visual state.
  const freeze = (el) => {
    if (!el) return;
    el.getAnimations().forEach(a => {
      try { a.commitStyles(); } catch(e) {}
      a.cancel();
    });
  };

  const stopIdle = () => {
    if (_dotIdle) { _dotIdle.cancel(); _dotIdle = null; }
  };

  const startIdle = (phase) => {
    stopIdle();
    if (!dotEl) return;
    // STATUS: gentle breath — grows and shrinks slowly
    // PROFILE: soft bob — up/down like a floating dot
    _dotIdle = phase === 'status'
      ? dotEl.animate([
          { transform: 'translateY(-50%) scale(1)',    opacity: 1 },
          { transform: 'translateY(-50%) scale(1.32)', opacity: 0.82 },
          { transform: 'translateY(-50%) scale(1)',    opacity: 1 }
        ], { duration: 2800, iterations: Infinity, easing: 'ease-in-out', delay: 400 })
      : dotEl.animate([
          { transform: 'translateY(-50%)   scale(1)' },
          { transform: 'translateY(-57%)   scale(0.88)' },
          { transform: 'translateY(-52%)   scale(1.06)' },
          { transform: 'translateY(-50%)   scale(1)' }
        ], { duration: 2200, iterations: Infinity, easing: 'ease-in-out', delay: 700 });
  };

  const refreshData = () => {
    if (!currentUser) return;
    const s = currentUser.status || 'online';
    if (dotEl)    dotEl.style.background = COLORS[s] || COLORS.online;
    if (avatarEl) avatarEl.style.backgroundImage = `url('${currentUser.profile_photo || '/uploads/default-avatar.png'}')`;
    if (nameEl)   nameEl.textContent   = `@${currentUser.username || ''}`;
    if (textEl)   textEl.textContent   = LABELS[s] || 'ÇEVRİMİÇİ';
  };

  /* ── Transition: STATUS → PROFILE ── */
  const toProfile = async () => {
    refreshData();
    stopIdle();
    nameEl && (nameEl.style.animation = ''); // clear shimmer

    // ─ EXIT: dot grows then flies left; text fades up ─
    const exits = [];
    if (dotEl) {
      freeze(dotEl);
      exits.push(dotEl.animate([
        { transform: 'translateY(-50%) scale(1)',    opacity: 1 },
        { transform: 'translateY(-50%) scale(1.45)', opacity: 1, offset: 0.3 },
        { transform: 'translateY(-50%) translateX(-32px) scale(0.1)', opacity: 0 }
      ], { duration: 290, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (textEl) {
      freeze(textEl);
      exits.push(textEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(-50%) scale(1)' },
        { opacity: 0, transform: 'translateY(-66%) translateX(-50%) scale(0.82)' }
      ], { duration: 210, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    await Promise.all(exits).catch(() => {});

    // ─ Switch chip width state ─
    chip.classList.remove('state-status');
    chip.classList.add('state-profile');

    // ─ ENTER: avatar slides in from right (springy overshoot) ─
    if (avatarEl) {
      freeze(avatarEl);
      avatarEl.animate([
        { opacity: 0, transform: 'translateY(-50%) translateX(38px) scale(0.52)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(-4px) scale(1.08)', offset: 0.60 },
        { opacity: 1, transform: 'translateY(-50%) translateX(0)    scale(1)' }
      ], { duration: 530, easing: SPRING, fill: 'forwards' });
    }

    // ─ ENTER: username fades in with slight right-to-left drift (110ms delay) ─
    await new Promise(r => setTimeout(r, 110));
    if (nameEl) {
      freeze(nameEl);
      nameEl.animate([
        { opacity: 0, transform: 'translateY(-50%) translateX(22px)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(0)' }
      ], { duration: 480, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        if (chip.classList.contains('state-profile') && nameEl) {
          nameEl.style.animation = 'metallicShimmer 5s 0.5s ease-in-out infinite';
        }
      }).catch(() => {});
    }

    // ─ ENTER: dot shoots in from right (60ms after username) ─
    await new Promise(r => setTimeout(r, 60));
    if (dotEl) {
      freeze(dotEl);
      dotEl.animate([
        { transform: 'translateY(-50%) translateX(26px) scale(0.1)',  opacity: 0 },
        { transform: 'translateY(-50%) translateX(-4px) scale(1.32)', opacity: 1, offset: 0.58 },
        { transform: 'translateY(-50%) translateX(1px)  scale(0.93)', opacity: 1, offset: 0.80 },
        { transform: 'translateY(-50%) translateX(0)    scale(1)',    opacity: 1 }
      ], { duration: 510, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        startIdle('profile');
      }).catch(() => {});
    }
  };

  /* ── Transition: PROFILE → STATUS ── */
  const toStatus = async () => {
    refreshData();
    stopIdle();
    nameEl && (nameEl.style.animation = '');

    // ─ EXIT: dot + username + avatar all leave toward left ─
    const exits = [];
    if (dotEl) {
      freeze(dotEl);
      exits.push(dotEl.animate([
        { transform: 'translateY(-50%) scale(1)',    opacity: 1 },
        { transform: 'translateY(-50%) scale(1.45)', opacity: 1, offset: 0.28 },
        { transform: 'translateY(-50%) translateX(-32px) scale(0.1)', opacity: 0 }
      ], { duration: 275, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (nameEl) {
      freeze(nameEl);
      exits.push(nameEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-18px)' }
      ], { duration: 195, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    if (avatarEl) {
      freeze(avatarEl);
      exits.push(avatarEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-24px) scale(0.6)' }
      ], { duration: 230, delay: 35, easing: FAST_OUT, fill: 'forwards' }).finished.catch(() => {}));
    }
    await Promise.all(exits).catch(() => {});

    // ─ Switch chip width state ─
    chip.classList.remove('state-profile');
    chip.classList.add('state-status');

    // ─ ENTER: status text rises up from slightly below ─
    if (textEl) {
      freeze(textEl);
      textEl.animate([
        { opacity: 0, transform: 'translateY(-38%) translateX(-50%) scale(0.86)' },
        { opacity: 1, transform: 'translateY(-50%) translateX(-50%) scale(1)' }
      ], { duration: 440, easing: SPRING, fill: 'forwards' });
    }

    // ─ ENTER: dot from right (130ms after text) ─
    await new Promise(r => setTimeout(r, 130));
    if (dotEl) {
      freeze(dotEl);
      dotEl.animate([
        { transform: 'translateY(-50%) translateX(24px) scale(0.1)',  opacity: 0 },
        { transform: 'translateY(-50%) translateX(-4px) scale(1.28)', opacity: 1, offset: 0.60 },
        { transform: 'translateY(-50%) translateX(1px)  scale(0.92)', opacity: 1, offset: 0.80 },
        { transform: 'translateY(-50%) translateX(0)    scale(1)',    opacity: 1 }
      ], { duration: 490, easing: SPRING, fill: 'forwards' }).finished.then(() => {
        startIdle('status');
      }).catch(() => {});
    }
  };

  /* ── Init ── */
  // Reset all inline styles so CSS defaults apply (avatar hidden, text visible, dot visible)
  [avatarEl, nameEl, textEl, dotEl].forEach(el => {
    if (!el) return;
    el.getAnimations().forEach(a => a.cancel());
    el.style.cssText = '';
  });
  if (nameEl) nameEl.style.animation = '';

  chip.classList.remove('state-profile', 'state-focus');
  chip.classList.add('state-status');

  refreshData();
  startIdle('status');

  let _phase = 'status';

  window._statusChipInterval = setInterval(async () => {
    if (chip.classList.contains('state-focus')) return;
    if (_transitioning) return;
    _transitioning = true;
    const goToProfile = _phase === 'status';
    try {
      await (goToProfile ? toProfile() : toStatus());
      _phase = goToProfile ? 'profile' : 'status';
    } catch(e) {
      // swallow DOMException from cancelled animations mid-transition
    } finally {
      _transitioning = false;
    }
  }, 4500);
}

function copyPartyInviteLink() {
  const partyId = window._currentPartyId;
  const partyData = window._currentPartyData;
  if (!partyId) {
    showToast('Önce bir odak odasına katılmalısınız');
    return;
  }

  const code = (partyData && partyData.code) ? partyData.code : partyId;
  const url = `${window.location.origin}?party=${code}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Oda davet bağlantısı kopyalandı!');
    }).catch(() => {
      fallbackCopyText(url);
    });
  } else {
    fallbackCopyText(url);
  }
}

function fallbackCopyText(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    showToast('Oda davet bağlantısı kopyalandı!');
  } catch (e) {
    showToast('Kopyalanamadı');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTY FOCUS OVERLAY — Global floating panel (always position:fixed)
// ─────────────────────────────────────────────────────────────────────────────

function _isMobileView() { return window.innerWidth <= 768; }

/**
 * Place overlay at its stored or default position, always as position:fixed.
 */
function _placeOverlayFixed(overlay) {
  const isMobile = _isMobileView();
  overlay.style.position = 'fixed';
  overlay.style.transform = 'none';

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('os_overlay_snap') || 'null'); } catch(e) { return null; }
  })();

  if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
    const W = window.innerWidth, H = window.innerHeight;
    const ow = overlay.offsetWidth || 44;
    const oh = overlay.offsetHeight || 240;
    overlay.style.left   = `${Math.max(0, Math.min(W - ow, saved.left))}px`;
    overlay.style.top    = `${Math.max(56, Math.min(H - oh - 8, saved.top))}px`;
    overlay.style.right  = 'auto';
    overlay.style.bottom = 'auto';
    overlay.classList.add('has-drag-pos');
  } else {
    // Mobile: bottom-right, Desktop: middle-left
    if (isMobile) {
      const W = window.innerWidth;
      const ow = overlay.offsetWidth || 44;
      const navBottom = 76 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0') || 0);
      overlay.style.right  = '16px';
      overlay.style.bottom = `${navBottom + 16}px`;
      overlay.style.left   = 'auto';
      overlay.style.top    = 'auto';
    } else {
      const top = Math.max(56, Math.round((window.innerHeight - 240) / 2));
      overlay.style.left   = '12px';
      overlay.style.top    = `${top}px`;
      overlay.style.right  = 'auto';
      overlay.style.bottom = 'auto';
    }
    overlay.classList.add('has-drag-pos');
  }
}

/**
 * Snap collapsed widget to nearest vertical edge (left or right).
 * On mobile: fully flush to edge (0px margin, half-hidden for cleanliness).
 * On desktop: 12px from edge.
 */
function _snapToEdge(overlay) {
  const isMobile = _isMobileView();
  const W  = window.innerWidth;
  const H  = window.innerHeight;
  const MARGIN = isMobile ? 0 : 12;

  // Current center x
  const rect = overlay.getBoundingClientRect();
  const cx   = rect.left + rect.width / 2;

  const snapRight = cx > W / 2; // snap to right edge?
  const left = snapRight ? (W - rect.width - MARGIN) : MARGIN;

  // Clamp top
  const NAV_TOP    = 56;  // header/top nav height
  const NAV_BOTTOM = 76;  // bottom nav height
  let top = Math.max(NAV_TOP, Math.min(H - rect.height - NAV_BOTTOM, rect.top));

  overlay.style.transition = 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1), right 0.3s, bottom 0.3s';
  overlay.style.left   = `${left}px`;
  overlay.style.top    = `${top}px`;
  overlay.style.right  = 'auto';
  overlay.style.bottom = 'auto';
  overlay.classList.add('has-drag-pos');

  try { localStorage.setItem('os_overlay_snap', JSON.stringify({ left, top })); } catch(e){}
  
  // Update chevron instantly during snap
  updatePartyOverlayCollapseBtn();

  setTimeout(() => { overlay.style.transition = ''; }, 320);
}

function togglePartyFocusOverlay() {
  const overlay = document.getElementById('partyFocusOverlay');
  if (!overlay) return;

  const isCollapsed = overlay.classList.contains('collapsed');

  if (isCollapsed) {
    // ── EXPAND ──
    // Clear all inline position coordinates so CSS styling rules take over
    overlay.classList.remove('collapsed', 'has-drag-pos');
    overlay.style.position = '';
    overlay.style.left = '';
    overlay.style.top = '';
    overlay.style.right = '';
    overlay.style.bottom = '';
    overlay.style.transform = '';
    try { localStorage.setItem('os_focus_overlay_collapsed', '0'); } catch(e){}
  } else {
    // ── COLLAPSE ──
    overlay.classList.add('collapsed');
    // Load last snap coordinates or snap to middle-left default
    _placeOverlayFixed(overlay);
    try { localStorage.setItem('os_focus_overlay_collapsed', '1'); } catch(e){}
  }

  updatePartyOverlayCollapseBtn();
}

function updatePartyOverlayCollapseBtn() {
  const overlay = document.getElementById('partyFocusOverlay');
  const btn     = document.getElementById('partyOverlayCollapseBtn');
  if (!overlay || !btn) return;
  const isCollapsed = overlay.classList.contains('collapsed');
  btn.setAttribute('data-tooltip', isCollapsed ? 'Paneli Genişlet' : 'Paneli Daralt');

  let chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>`; // default pointing left (<)

  if (isCollapsed) {
    const rect = overlay.getBoundingClientRect();
    const isOnRightSide = (rect.left + rect.width / 2) > (window.innerWidth / 2);
    if (isOnRightSide) {
      // Snapped to right edge: expand chevron should point LEFT (<)
      chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="15 18 9 12 15 6"/></svg>`;
    } else {
      // Snapped to left edge: expand chevron should point RIGHT (>)
      chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><polyline points="9 18 15 12 9 6"/></svg>`;
    }
  }

  btn.innerHTML = chevronSvg;
}

function initDraggablePartyOverlay() {
  const overlay = document.getElementById('partyFocusOverlay');
  if (!overlay) return;

  // ── Restore previous collapsed/position state ──
  const wasCollapsed = localStorage.getItem('os_focus_overlay_collapsed') === '1';
  if (wasCollapsed) {
    overlay.classList.add('collapsed');
    _placeOverlayFixed(overlay);
    updatePartyOverlayCollapseBtn();
  }

  // ── Drag state ──
  let dragging = false;
  let startX   = 0, startY = 0;
  let initLeft = 0, initTop = 0;
  let moved    = false;

  function dragStart(clientX, clientY, target, pointerId) {
    // Only drag when collapsed
    if (!overlay.classList.contains('collapsed')) return;
    // Don't start drag on button clicks
    if (target.closest('button')) return;

    dragging = true;
    moved    = false;

    // Lock pointer to overlay for seamless touch dragging
    try { overlay.setPointerCapture(pointerId); } catch(e) {}

    overlay.classList.add('is-dragging', 'has-drag-pos');

    // Compute current pixel position from getBoundingClientRect (works even if right/bottom are set)
    const rect = overlay.getBoundingClientRect();
    initLeft   = rect.left;
    initTop    = rect.top;
    startX     = clientX;
    startY     = clientY;

    // Switch to left/top coords for drag math
    overlay.style.position  = 'fixed';
    overlay.style.left      = `${initLeft}px`;
    overlay.style.top       = `${initTop}px`;
    overlay.style.right     = 'auto';
    overlay.style.bottom    = 'auto';
    overlay.style.transform = 'none';
  }

  function dragMove(clientX, clientY) {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

    const W  = window.innerWidth;
    const H  = window.innerHeight;
    const ow = overlay.offsetWidth;
    const oh = overlay.offsetHeight;

    const nx = Math.max(0, Math.min(W - ow, initLeft + dx));
    const ny = Math.max(56, Math.min(H - oh - 8, initTop + dy));
    overlay.style.left = `${nx}px`;
    overlay.style.top  = `${ny}px`;
  }

  function dragEnd(pointerId) {
    if (!dragging) return;
    dragging = false;
    try { overlay.releasePointerCapture(pointerId); } catch(e) {}
    overlay.classList.remove('is-dragging');
    if (moved) {
      _snapToEdge(overlay);
    }
  }

  // ── Pointer Events (handles mouse and touch seamlessly via pointer capture) ──
  overlay.addEventListener('pointerdown', (e) => {
    // Only drag with left mouse button, or touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStart(e.clientX, e.clientY, e.target, e.pointerId);
  });

  // pointermove/up/cancel fire on overlay because of setPointerCapture
  overlay.addEventListener('pointermove', (e) => {
    if (dragging) {
      e.preventDefault();
      dragMove(e.clientX, e.clientY);
    }
  }, { passive: false });

  overlay.addEventListener('pointerup',     (e) => dragEnd(e.pointerId));
  overlay.addEventListener('pointercancel', (e) => dragEnd(e.pointerId));
}

document.addEventListener('DOMContentLoaded', () => {
  try { initDraggablePartyOverlay(); } catch(e) { console.error('initDraggablePartyOverlay error:', e); }
});
