#!/bin/bash
# Zero-Downtime Deployment Script for BLUNK

echo "🚀 Başlatılıyor: BLUNK Zero-Downtime Deployment..."

# 1. Kodları çek
echo "📦 1/4 En güncel kodlar çekiliyor..."
git pull origin main

# 2. Paketleri kur
echo "📦 2/4 Bağımlılıklar güncelleniyor..."
npm install --production

# 3. Veritabanını güncelle (Migration)
# Migration ayrı bir process olarak çalışır, worker'lar kilitlenmez.
echo "🗄️ 3/4 Veritabanı şeması güncelleniyor..."
node --env-file=.env scripts/migrate.js

# 4. Uygulamayı Sıfır Kesinti ile yenile (Reload)
echo "♻️ 4/4 PM2 Worker'ları sıfır kesintiyle yenileniyor..."
pm2 reload pm2.config.js --update-env

echo "✅ Canlı güncelleme başarıyla tamamlandı!"
