const fs = require('fs');

function cleanFile(filePath) {
  let buf = fs.readFileSync(filePath);
  // Remove UTF-8 BOM if present
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
  }
  let str = buf.toString('utf8');

  // Replace common double-encoded UTF-8 / Mojibake patterns
  try {
    // If text was double-encoded UTF-8 read as latin1, decoding latin1 bytes back to buffer then utf8 fixes it!
    const doubleDecoded = Buffer.from(str, 'latin1').toString('utf8');
    if (!doubleDecoded.includes('\uFFFD') && doubleDecoded.length > 0) {
      str = doubleDecoded;
    }
  } catch (e) {}

  // Explicit replacements for remaining corrupted sequences
  str = str
    .replace(/seÄŸtiniz/g, 'seçtiniz')
    .replace(/sÃ¼re/g, 'süre')
    .replace(/sÄ±nÄ±rÄ±/g, 'sınırı')
    .replace(/sÃ¤nÃÄ±rÄ±/g, 'sınırı')
    .replace(/Ã‡Ä±KTÄ±M/g, 'ÇIKTIM')
    .replace(/Ã„\u2021Ã„\u2013KTÃ„\u2013M/g, 'ÇIKTIM')
    .replace(/zamanÄ±n/g, 'zamanın')
    .replace(/sÃ„\u00BCren/g, 'süren')
    .replace(/sÃ„\u00BCre/g, 'süre')
    .replace(/Ã¢â‚¬â€ /g, '—')
    .replace(/â‚¬â€ /g, '—')
    .replace(/â‚¬¢/g, '•')
    .replace(/â†'/g, '→');

  fs.writeFileSync(filePath, str, 'utf8');
  console.log(`Cleaned ${filePath}`);
}

['public/index.html', 'public/js/timer.js', 'public/js/app.js'].forEach(cleanFile);
