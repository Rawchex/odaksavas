# ODAK SAVAŞI - KULLANIM KILAVUZU

## 🚀 HIZLI BAŞLANGIÇ

1. **baslat.bat** dosyasına çift tıkla
2. Tarayıcıda **http://localhost:3000** aç
3. Kullanıcı adını gir (örn: samet)
4. Başla!

## 📱 KULLANIM

### SAAT EKRANI
- **BAŞLA**: Odak oturumunu başlatır
- **DURDUR**: Oturumu manuel olarak sonlandırır
- Ekran takibi otomatik çalışır
- Sekme değiştirirsen veya uygulamadan çıkarsan → İHLAL
- Başarılı oturum → XP kazan
- 100 XP = 1 seviye

### SAVAŞ (LİDER) TABLOSU
- Tüm kullanıcıları görürsün
- Sıralama: Toplam odak süresine göre
- Kartlara tıkla → Profili gör
- Kendi kartın beyaz çerçeve ile belirgin

### FEED EKRANI
- Instagram benzeri sosyal alan
- **+ YENİ PAYLAŞIM**: Yazı veya görsel paylaş
- ❤️ Beğen
- 💬 Yorum yap
- 🔄 Repost et
- Kullanıcı adına tıkla → Profil

### PROFİL EKRANI
- İstatistiklerini gör
- Biyografi ekle
- Boy, kilo bilgilerini gir
- CV yaz
- Profil fotoğrafı yükle

## 🎯 ODAK KURALLARI

### İHLAL OLUR:
- Sekme değiştirirsen
- Başka uygulamaya geçersen
- Telefonu kilitlesen (mobilde)
- Sayfayı kapatırsan

### İHLAL OLMAZ:
- Sayfa içinde kalıp scroll yaparsan
- Saat ekranında kalırsan
- Başla/durdur butonlarına basarsan

## 💪 İPUÇLARI

1. **Uzun oturumlar yap**: Her dakika = 1 XP
2. **Rekabeti kullan**: Lider tablosunda üst sıralara çık
3. **Paylaş**: Başarılarını feed'de paylaş
4. **Takip et**: Diğer kullanıcıları motivasyon için takip et
5. **Tam ekran**: Mobilde tam ekran kullan (daha az ihmal)

## 🔥 SEVIYE SISTEMI

- Seviye 1: 0-99 XP
- Seviye 2: 100-199 XP
- Seviye 3: 200-299 XP
- ...ve devam eder

Her 100 XP = 1 seviye
Her dakika odak = 1 XP
60 dakika = 1 seviye

## 🐛 SORUN GİDERME

**Sunucu başlamıyor:**
- Node.js yüklü mü kontrol et: `node -v`
- Port 3000 kullanımda mı kontrol et

**Session kayboluyor:**
- Çerezleri kontrol et
- Sayfayı yenile

**İhlal sürekli oluşuyor:**
- Tarayıcıyı tam ekran yap
- Başka sekmeleri kapat
- Bildirimler kapalı olsun

## 📊 İSTATİSTİKLER

Profilinde görebileceğin veriler:
- Toplam odak süresi
- Seviye ve XP
- Son 20 oturum
- Başarı oranı (tamamlanan/ihlal)

## 🎨 TASARIM

- **Siyah**: Arkaplan (#000)
- **Gri**: Detaylar (#333, #666, #999)
- **Beyaz**: Yazılar ve vurgular (#fff)
- **Kalın fontlar**: Tüm metinler
- **Mobil-first**: Telefon için optimize

## 🔒 GÜVENLİK

- Username bazlı auth (şifresiz)
- Çerezler ile oturum
- Her kullanıcı sadece kendi verilerine erişir
- Dosya yüklemede güvenlik kontrolleri

## 💾 VERİ

- SQLite database (`odaksavas.db`)
- Yüklemeler: `public/uploads/`
- Tüm veri lokal

## 🚧 GELİŞTİRME

Yeni özellik eklemek için:
1. Backend: `server/index.js`
2. Frontend: `public/js/app.js`
3. Stil: `public/css/style.css`
4. HTML: `public/index.html`

## 📞 DEMO VERİ

Demo kullanıcılar eklemek için:
```bash
node demo-data.js
```

5 demo kullanıcı + postlar ekler.

---

**BAŞARILAR!** 🎯🔥💪
