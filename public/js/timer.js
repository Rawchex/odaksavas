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
      { const pfo = document.getElementById('partyFocusOverlay'); if (pfo) pfo.style.display = 'none'; }
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
  
  // 1. Lobi üyelerini çek (5 sn)
  fetchPartyAndRender(partyId);
  _partyPollInterval = setInterval(() => {
    if (!_currentPartyId) {
      clearInterval(_partyPollInterval);
      _partyPollInterval = null;
      return;
    }
    fetchPartyAndRender(_currentPartyId);
  }, 5000);

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

    const key = `party_${partyId}`;
    container.innerHTML = (data.messages || []).map(m => {
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

    renderPartyDuel(party.members || []);
  } catch {}
}

window._lobbyCardSize = localStorage.getItem('os_lobby_size') || 'm';

function setGlobalCardSize(size) {
  window._lobbyCardSize = size;
  localStorage.setItem('os_lobby_size', size);
  if (_currentPartyId) {
    fetchPartyAndRender(_currentPartyId);
  }
}

function renderPartyDuel(members) {
  const grid      = document.getElementById('partyDuelGrid');
  const solo      = document.getElementById('timerSolo');
  const duelInner = document.getElementById('timerDuelInner');
  const overlay   = document.getElementById('partyFocusOverlay');
  const membersEl = document.getElementById('partyFocusMembers');
  const labelEl   = document.getElementById('partyFocusLabel');

  if (!members.length || !overlay) {
    if (grid) grid.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    return;
  }

  // Keep solo clock visible
  _duelMode = false;
  solo.style.display      = 'flex';
  duelInner.style.display = 'none';
  grid.style.display      = 'none'; // old grid hidden

  const activeCount = members.filter(m => m.active_session_id !== null).length;
  const timerSmall = document.getElementById('partyFocusTime');
  
  if (!window._activeSession) {
    if (labelEl) labelEl.textContent = `Odak Odası (${members.length} üye)`;
    if (timerSmall) timerSmall.style.display = 'none';
  } else {
    if (labelEl) labelEl.textContent = `${activeCount} kişi odakta`;
    if (timerSmall) timerSmall.style.display = 'block';
  }

  const maxSecs = members.reduce((max, m) => {
    const isMe = m.username === currentUser?.username;
    const isActive = m.active_session_id !== null;
    const sessionStartUtc = m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null;
    const elapsed = isMe ? _sessionElapsed : (isActive && sessionStartUtc ? Math.floor((Date.now() - sessionStartUtc.getTime()) / 1000) : 0);
    return Math.max(max, elapsed);
  }, 1);

  membersEl.innerHTML = members.map(m => {
    const isMe = m.username === currentUser?.username;
    const isActive = m.active_session_id !== null || (isMe && window._activeSession);
    const sessionStartUtc = m.session_start ? new Date(m.session_start.replace(' ', 'T') + 'Z') : null;
    const elapsed = isMe ? _sessionElapsed : (isActive && sessionStartUtc ? Math.floor((Date.now() - sessionStartUtc.getTime()) / 1000) : 0);
    const pct = isActive ? Math.min(100, (elapsed / maxSecs) * 100) : 0;

    return `
      <div class="party-focus-member ${isMe ? 'is-me' : ''}">
        ${renderAvatar(m, 'avatar avatar-sm')}
        <div class="party-focus-member-info">
          <span class="party-focus-member-name" style="cursor:${isMe ? 'default':'pointer'}" ${isMe ? '' : `onclick="openUserPage('${esc(m.username)}')"`}>
            ${esc(m.username)} ${isMe ? '<span style="font-size:8px; color:#000; background:#fff; padding:2px 5px; border-radius:4px; margin-left:4px; font-weight:900; vertical-align:middle;">SEN</span>' : ''}
          </span>
          <div class="party-focus-member-bar-wrap">
            <div class="party-focus-member-bar ${isMe ? 'is-me' : (isActive ? 'live' : '')}" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="party-focus-member-time ${isMe ? 'is-me' : ''}">${isActive ? fmtTimeClock(elapsed) : '—'}</span>
      </div>
    `;
  }).join('');

  overlay.style.display = 'block';
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
  const info = document.getElementById('activePartyInfo');
  const btn  = document.getElementById('timerPartyBtn');
  const chatBtn = document.getElementById('timerChatBtn');
  const leaveBtn = document.getElementById('timerLeavePartyBtn');
  
  if (info) {
    info.style.display = 'none';
  }
  if (btn) {
    btn.style.display = 'block';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Lobi Yönetimi
    `;
  }
  if (chatBtn) {
    chatBtn.style.display = 'block';
  }
  if (leaveBtn) {
    leaveBtn.style.display = 'flex';
  }
  
  // Start polling lobi
  startPartyPoll(partyId);
}

function clearActiveParty() {
  _currentPartyId = null;
  _duelMode = false;
  clearInterval(_partyPollInterval);
  _partyPollInterval = null;
  const info = document.getElementById('activePartyInfo');
  const btn  = document.getElementById('timerPartyBtn');
  const chatBtn = document.getElementById('timerChatBtn');
  const leaveBtn = document.getElementById('timerLeavePartyBtn');
  
  if (info) info.style.display = 'none';
  if (btn) {
    btn.style.display  = 'block';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Odak Odası
    `;
  }
  if (chatBtn) {
    chatBtn.style.display = 'none';
  }
  if (leaveBtn) {
    leaveBtn.style.display = 'none';
  }
  togglePartyChatModal(false);
  
  document.getElementById('timerSolo').style.display      = 'flex';
  document.getElementById('timerDuelInner').style.display = 'none';
}

async function checkActiveParty() {
  try {
    const res = await fetch('/api/parties');
    if (!res.ok) return;
    const parties = await res.json();
    const activeParty = parties.find(p => p.is_member > 0 || p.owner_id === currentUser.id);
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
  if (!_currentPartyId) return;
  try {
    const res = await fetch(`/api/parties/${_currentPartyId}`);
    if (!res.ok) {
      if (typeof leaveParty === 'function') {
        await leaveParty(_currentPartyId);
      }
      return;
    }
    const party = await res.json();
    const isOwner = party.owner_id === currentUser.id;
    if (isOwner) {
      if (typeof deleteParty === 'function') {
        await deleteParty(_currentPartyId);
      }
    } else {
      if (typeof leaveParty === 'function') {
        await leaveParty(_currentPartyId);
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
      ], { duration: 290, easing: FAST_OUT, fill: 'forwards' }).finished);
    }
    if (textEl) {
      freeze(textEl);
      exits.push(textEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(-50%) scale(1)' },
        { opacity: 0, transform: 'translateY(-66%) translateX(-50%) scale(0.82)' }
      ], { duration: 210, easing: FAST_OUT, fill: 'forwards' }).finished);
    }
    await Promise.all(exits);

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
      });
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
      });
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
      ], { duration: 275, easing: FAST_OUT, fill: 'forwards' }).finished);
    }
    if (nameEl) {
      freeze(nameEl);
      exits.push(nameEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-18px)' }
      ], { duration: 195, easing: FAST_OUT, fill: 'forwards' }).finished);
    }
    if (avatarEl) {
      freeze(avatarEl);
      exits.push(avatarEl.animate([
        { opacity: 1, transform: 'translateY(-50%) translateX(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-50%) translateX(-24px) scale(0.6)' }
      ], { duration: 230, delay: 35, easing: FAST_OUT, fill: 'forwards' }).finished);
    }
    await Promise.all(exits);

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
      });
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









