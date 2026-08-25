/**
 * seasonConfig.js
 * Bu dosya, Sezon Bileti (Season Pass) sisteminin tüm altyapısını ve ödüllerini tanımlar.
 * 50 Seviyelik devasa sistemin konfigürasyonudur.
 */

// Ana Destansı Ödüller Kataloğu
const EPIC_REWARDS = {
  tier_1: { type: "BADGE", name: "Uyanışa Adım", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`, color: "#4ade80", description: "Sezona ilk adımını attın." },
  tier_10: { type: "EMOJI", name: "Ateşli Kafa (Emoji)", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c-3.3 0-6 2.7-6 6 0 2.2 1.2 4.1 3 5.1V22h6v-8.9c1.8-1 3-2.9 3-5.1 0-3.3-2.7-6-6-6z"/><path d="M9 22h6"/><path d="M9 18h6"/></svg>`, color: "#f97316", description: "Sohbetlerde özel alevli kafa emojisi." },
  tier_20: { type: "BANNER", name: "Gece Yarısı Afişi", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`, color: "#8b5cf6", description: "Profilin için özel gece yarısı afişi." },
  tier_30: { type: "AVATAR_FRAME", name: "Neon Çerçeve", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="12" cy="12" r="3"/></svg>`, color: "#ec4899", description: "Fotoğrafın için animasyonlu çerçeve." },
  tier_40: { type: "THEME", name: "Karanlık Madde Tema", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`, color: "#111827", description: "Tüm arayüzü simsiyah yapan özel tema." },
  tier_50: { type: "THEME", name: "Altın Uyanış Tema", icon: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`, color: "#fbbf24", description: "Sezonu tamamlayanların efsanevi teması." }
};

// Standart Dolgu Ödülleri
const FILLER_REWARDS = [
  { type: "BOOST", name: "100 XP Boost", icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`, color: "#3b82f6", description: "Anında 100 XP kazandırır." },
  { type: "COSMETIC", name: "Gümüş Kasa", icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>`, color: "#94a3b8", description: "İçerisinden rastgele kozmetik çıkar." },
  { type: "TITLE", name: "Özel Unvan", icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`, color: "#06b6d4", description: "Profilinde sergileyebileceğin unvan." },
  { type: "CURRENCY", name: "50 Odak Parası", icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`, color: "#eab308", description: "Mağazada geçerli oyun içi para birimi." }
];

const BLUNK_SEASON_CONFIG = {
  metadata: {
    season_id: "s1_uyanis",
    season_name: "SEZON 1: UYANIŞ",
    description: "İlk adımdan zirveye. Görevleri tamamla, XP kazan ve özel ödüllerin kilidini aç.",
    start_date: "2026-08-01T00:00:00Z",
    end_date: "2026-08-31T23:59:59Z",
    max_tier: 50,
    premium_price: "99 TL"
  },
  
  rewards: { ...EPIC_REWARDS },
  tiers: [],

  missions: {
    daily: [
      { id: "d1", title: "Güne Başlangıç", description: "Herhangi bir derse en az 25 dakika odaklan.", xp_reward: 500, is_completed: true, current_progress: 25, max_progress: 25 },
      { id: "d2", title: "Sosyalleşme Vakti", description: "3 farklı kullanıcıyı takip et veya arkadaş ekle.", xp_reward: 300, is_completed: false, current_progress: 1, max_progress: 3 },
      { id: "d3", title: "Uzun Maraton", description: "Tek oturuşta 60 dakikalık odak seansını tamamla.", xp_reward: 1000, is_completed: false, current_progress: 0, max_progress: 60 }
    ],
    weekly: [
      { id: "w1", title: "Lig Savaşçısı", description: "Bu hafta toplamda 10 saat odaklanma süresine ulaş.", xp_reward: 3000, is_completed: false, current_progress: 6.5, max_progress: 10 },
      { id: "w2", title: "Liderlik Ruhu", description: "Herhangi bir aktivite liginde ilk 3'e gir.", xp_reward: 5000, is_completed: false, current_progress: 0, max_progress: 1 }
    ]
  },

  currentUser: {
    total_xp: 38000, 
    is_premium_active: false
  }
};

// 50 Seviyeyi Dinamik Olarak Oluştur (Admin Paneli Yokken Mock Data)
let currentCumulativeXP = 0;
for (let i = 1; i <= 50; i++) {
  currentCumulativeXP += 1000 + (i * 200); // Giderek artan XP gereksinimi
  
  let rewardKey = null;
  let isPremium = (i % 2 !== 0 && i !== 1 && i !== 50); // Genelde her 2 seviyeden biri premium olsun ama kilitler free olabilir.
  
  // Kilit Seviyelere Destansı Ödüller
  if (i === 1) rewardKey = "tier_1";
  else if (i === 10) rewardKey = "tier_10";
  else if (i === 20) rewardKey = "tier_20";
  else if (i === 30) rewardKey = "tier_30";
  else if (i === 40) rewardKey = "tier_40";
  else if (i === 50) { rewardKey = "tier_50"; isPremium = true; } // Zirve Premium
  else {
    // Ara Seviyelere Dolgu Ödüller (Rastgele dağıtıyoruz)
    const fillerIdx = (i * 7) % FILLER_REWARDS.length;
    const filler = FILLER_REWARDS[fillerIdx];
    rewardKey = `tier_filler_${i}`;
    BLUNK_SEASON_CONFIG.rewards[rewardKey] = {
      type: filler.type,
      name: filler.name,
      icon: filler.icon,
      color: filler.color,
      description: filler.description
    };
  }

  BLUNK_SEASON_CONFIG.tiers.push({
    level: i,
    required_xp: currentCumulativeXP,
    reward_key: rewardKey,
    is_premium: isPremium
  });
}

window.BLUNK_SEASON_CONFIG = BLUNK_SEASON_CONFIG;
