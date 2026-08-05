const fs = require('fs');
const path = require('path');

// Double-encoded UTF-8 / Windows-1252 / ISO-8859-1 Mojibake replacements
const replacements = [
  // Lowercase Turkish
  [/Ã§/g, 'ç'],
  [/ÄŸ/g, 'ğ'],
  [/Ä±/g, 'ı'],
  [/Ã¶/g, 'ö'],
  [/ÅŸ/g, 'ş'],
  [/Ã¼/g, 'ü'],

  // Uppercase Turkish
  [/Ã‡/g, 'Ç'],
  [/ÄŽ/g, 'Ğ'],
  [/Ä°/g, 'İ'],
  [/Ã–/g, 'Ö'],
  [/ÅŽ/g, 'Ş'],
  [/Åž/g, 'Ş'],
  [/Ãœ/g, 'Ü'],

  // Special Triple / Garbled patterns
  [/seÄŸtiniz/g, 'seçtiniz'],
  [/seÃ§tiniz/g, 'seçtiniz'],
  [/sÃ¼re/g, 'süre'],
  [/sÃ¤nÃÄ±rÄ±/g, 'sınırı'],
  [/sÄ±nÄ±rÄ±/g, 'sınırı'],
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

  // Punctuation & Symbols
  [/â€”/g, '—'],
  [/â€“/g, '–'],
  [/â€™/g, '’'],
  [/â€œ/g, '“'],
  [/â€/g, '”'],
  [/â€¦/g, '…'],
  [/â€¢/g, '•'],
  [/â‚¬â€ /g, '—'],
  [/â‚¬¢/g, '•'],
  [/â˜•/g, '☕'],
  [/â†'/g, '→'],
  [/Ã¢â‚¬â€ /g, '—']
];

function repairFileContent(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  let original = content;

  replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Repaired: ${filePath}`);
  } else {
    console.log(`No changes needed: ${filePath}`);
  }
}

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
      repairFileContent(fullPath);
    }
  }
}

scanDirectory(path.join(__dirname, '..', 'public'));
