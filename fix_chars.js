const fs = require('fs');

const path = 'c:\\BLUNK\\BLUNK\\public\\js\\postModal.js';
let content = fs.readFileSync(path, 'utf8');

const replacements = {
  'Yâ”œÂ£KLENâ”€â–‘YOR': 'YÜKLENİYOR',
  'Gâ”œÃ‚nderi yâ”œâ• klenemedi': 'Gönderi yüklenemedi',
  'Gâ”œÃ‚nderi gâ”œÃ‚rseli': 'Gönderi görseli',
  'Gâ”œÃ‚nderiyi Paylaâ”¼ÅŸ': 'Gönderiyi Paylaş',
  'Gâ”œÃ‚nderiyi sil': 'Gönderiyi sil',
  'Gâ”œÃ‚nder': 'Gönder',
  'Gâ”œÃ‚nderi gâ”œâ• ncellendi': 'Gönderi güncellendi',
  'Bu gâ”œÃ‚nderiyi silmek': 'Bu gönderiyi silmek',
  'Gâ”œÃ»â”œÃ»NDERâ”€â–‘ Yâ”œÃ»NETâ”€â–‘Mâ”€â–‘': 'GÖNDERİ YÖNETİMİ',
  'GÖNDERİYâ”€â–‘ Dâ”œÂ£ZENLE': 'GÖNDERİYİ DÜZENLE',
  'kullanâ”€â–’câ”€â–’sâ”€â–’na': 'kullanıcısına',
  'yanâ”€â–’t yaz...': 'yanıt yaz...',
  'yanâ”€â–’t veriliyor': 'yanıt veriliyor',
  'Yanâ”€â–’tlarâ”€â–’ gizle': 'Yanıtları gizle',
  'Yanâ”€â–’tlarâ”€â–’ gâ”œÃ‚r': 'Yanıtları gör',
  'Yanâ”€â–’tla': 'Yanıtla',
  'beâ”€ÅŸendi': 'beğendi',
  'kiâ”¼ÅŸi': 'kişi',
  'beâ”€ÅŸeni': 'beğeni',
  'Beâ”€ÅŸeniyi Kaldâ”€â–’r': 'Beğeniyi Kaldır',
  'Beâ”€ÅŸen': 'Beğen',
  'Seâ”œÄŸenekler': 'Seçenekler',
  'Repostu Kaldâ”€â–’r': 'Repostu Kaldır',
  'kaldâ”€â–’rmak istediâ”€ÅŸinizden': 'kaldırmak istediğinizden',
  'kaldâ”€â–’râ”€â–’ldâ”€â–’': 'kaldırıldı',
  'Kaldâ”€â–’râ”€â–’lamadâ”€â–’': 'Kaldırılamadı',
  'yapâ”€â–’ldâ”€â–’': 'yapıldı',
  'iâ”¼ÅŸlemi baâ”¼ÅŸarâ”€â–’sâ”€â–’z': 'işlemi başarısız',
  'Henâ”œâ• z yorum yok. â”€â–‘lk yorumu sen yaz!': 'Henüz yorum yok. İlk yorumu sen yaz!',
  'Henâ”œâ• z yorum yok': 'Henüz yorum yok',
  'Dâ”œâ• zenle': 'Düzenle',
  'dâ”œâ• zenleyin': 'düzenleyin',
  'Mesajda paylaâ”¼ÅŸ': 'Mesajda paylaş',
  'â”€â–‘ptal': 'İptal',
  'iâ”œÄŸeriâ”€ÅŸinizi': 'içeriğinizi',
  'Gâ”œâ• ncellenemedi': 'Güncellenemedi',
  'Baâ”€ÅŸlantâ”€â–’ hatasâ”€â–’': 'Bağlantı hatası',
  'istediâ”€ÅŸinizden': 'istediğinizden',
  'Ã”Â£Ã²': '✕',
  'â”¬Ã€': '·',
  'Gâ”œÃ»â”œÃ»NDERâ”€â–‘ Yâ”œÃ»NETâ”€â–‘Mâ”€â–‘': 'GÖNDERİ YÖNETİMİ'
};

for (const [bad, good] of Object.entries(replacements)) {
  content = content.split(bad).join(good);
}

// Since I reverted the file, let me do a global replace for the common ones as well
content = content.replace(/â”€â–’/g, 'ı');
content = content.replace(/â”œÃ‚/g, 'ö');
content = content.replace(/â”œâ• /g, 'ü');
content = content.replace(/â”¼ÅŸ/g, 'ş');
content = content.replace(/â”€ÅŸ/g, 'ğ');
content = content.replace(/â”œÄŸ/g, 'ç');

// Capital letters
content = content.replace(/â”œÂ£/g, 'Ü');
content = content.replace(/â”œÃ»â”œÃ»/g, 'Ö');
content = content.replace(/â”€â–‘/g, 'İ');


// Manual precise replacements for the remaining tricky characters
const preciseReplacements = [
  ['<div class="empty-title">Gönderi yâ”œâ• klenemedi</div>', '<div class="empty-title">Gönderi yüklenemedi</div>'],
  ['Henâ”œâ• z yorum yok. İlk yorumu sen yaz!', 'Henüz yorum yok. İlk yorumu sen yaz!'],
  ['>Dâ”œâ• zenle<', '>Düzenle<'],
  ['dâ”œâ• zenleyin', 'düzenleyin'],
  ['gâ”œâ• ncellendi', 'güncellendi'],
  ['Gâ”œâ• ncellenemedi', 'Güncellenemedi'],
  ['Henâ”œâ• z yorum yok</div>', 'Henüz yorum yok</div>']
];

for(const [bad, good] of preciseReplacements) {
  content = content.split(bad).join(good);
}

// Check with regex for any remaining
const regex = /[^\x00-\x7F\u011E\u011F\u0130\u0131\u00D6\u00F6\u00DC\u00FC\u015E\u015F\u00C7\u00E7]/g;
const match = content.match(regex);
if (match) {
  console.log("Still has unusual characters:", Array.from(new Set(match)).join(' '));
} else {
  console.log("All clean!");
}

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed postModal.js completely');
