# Zero-Downtime Deployment Script for BLUNK (Windows)

Write-Host "🚀 Başlatılıyor: BLUNK Zero-Downtime Deployment..." -ForegroundColor Cyan

# 1. Kodları çek
Write-Host "📦 1/4 En güncel kodlar çekiliyor..." -ForegroundColor Yellow
git pull origin main

# 2. Paketleri kur
Write-Host "📦 2/4 Bağımlılıklar güncelleniyor..." -ForegroundColor Yellow
npm install --production

# 3. Veritabanını güncelle (Migration)
Write-Host "🗄️ 3/4 Veritabanı şeması güncelleniyor..." -ForegroundColor Yellow
node --env-file=.env scripts/migrate.js

# 4. Uygulamayı Sıfır Kesinti ile yenile (Reload)
Write-Host "♻️ 4/4 PM2 Worker'ları sıfır kesintiyle yenileniyor..." -ForegroundColor Yellow
pm2 reload pm2.config.js --update-env

Write-Host "✅ Canlı güncelleme başarıyla tamamlandı!" -ForegroundColor Green
