const fs = require('fs');

function repairFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  // Replacements dictionary for Mojibake / garbled characters
  const map = [
    [/seÄŸtiniz/g, 'seçtiniz'],
    [/seÃ§tiniz/g, 'seçtiniz'],
    [/sÃ¼re/g, 'süre'],
    [/sÃ¤nÃÄ±rÄ±/g, 'sınırı'],
    [/sÄ±nÄ±rÄ±/g, 'sınırı'],
    [/sÄ±nÄ±rÄ/g, 'sınırı'],
    [/Ã‡Ä±KTÄ±M/g, 'ÇIKTIM'],
    [/Ã„\u2021Ã„\u2013KTÃ„\u2013M/g, 'ÇIKTIM'],
    [/Ã‡Ä±KTÄ±m/g, 'Çıktım'],
    [/zamanÄ±n/g, 'zamanın'],
    [/zamanÄ±/g, 'zamanı'],
    [/sÃ„\u00BCren/g, 'süren'],
    [/sÃ„\u00BCre/g, 'süre'],
    [/BaÅŸlat/g, 'Başlat'],
    [/baÅŸlat/g, 'başlat'],
    [/BaÅŸlar/g, 'Başlar'],
    [/baÅŸlar/g, 'başlar'],
    [/OdalarÄ±/g, 'Odaları'],
    [/odalarÄ±/g, 'odaları'],
    [/MolayÄ±/g, 'Molayı'],
    [/molayÄ±/g, 'molayı'],
    [/MolanÄ±/g, 'Molanı'],
    [/molanÄ±/g, 'molanı'],
    [/â˜•/g, '☕'],
    [/â†'/g, '→'],
    [/Ã¢â‚¬â€ /g, '—'],
    [/â‚¬â€ /g, '—'],
    [/â‚¬¢/g, '•'],
    [/â€ /g, '']
  ];

  map.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Repaired ${filePath}`);
}

['public/index.html', 'public/js/timer.js', 'public/js/app.js', 'public/js/profile.js'].forEach(repairFile);
