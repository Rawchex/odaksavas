# ODAK SAVAŞI

Sosyal odak temelli web uygulaması - İki veya daha fazla kişinin odak sürelerini rekabetçi şekilde takip etmelerini sağlayan mobil-first platform.

## ÖZELLİKLER

### 🎯 Odak Saat
- Kullanıcı bazlı odak oturumları
- Otomatik ihlal tespiti (sekme değiştirme, uygulama kapama)
- Gerçek zamanlı süre takibi
- XP ve seviye sistemi

### 🏆 Lider Tablosu
- Tüm kullanıcıların sıralaması
- Toplam odak sürelerine göre sıralama
- Kullanıcı profillerine hızlı erişim

### 📱 Sosyal Feed
- Instagram benzeri paylaşım sistemi
- Görsel + metin paylaşımları
- Beğeni, yorum, repost
- Profil ziyaretleri

### 👤 Profil Sistemi
- Detaylı kullanıcı bilgileri
- Profil fotoğrafı
- Biyografi, CV
- Boy, kilo bilgileri
- Oturum geçmişi

## KURULUM

### Otomatik Başlatma (Windows)
```bash
baslat.bat
```
Dosyaya çift tıkla, otomatik kurulum ve başlatma yapacak.

### Manuel Kurulum
```bash
cd odaksavas
npm install
npm start
```

Tarayıcıda aç: http://localhost:3000

## KULLANIM

1. Kullanıcı adınla giriş yap (ilk giriş otomatik kayıt)
2. "BAŞLA" butonuna tıkla ve odaklan
3. Sekme değiştirme veya uygulama kapama = ihlal
4. Başarılı oturumlardan XP kazan ve seviye atla
5. Feed'de paylaşım yap, diğer kullanıcıları takip et
6. Savaş tablosunda üst sıralara çık!

## TEKNOLOJİLER

- Backend: Node.js + Express
- Database: SQLite
- Frontend: Vanilla JS (mobil-first)
- Tema: Siyah-Gri-Beyaz minimalist

## NOTLAR

- Tamamen mobil web için optimize edilmiştir
- Username bazlı basit auth sistemi
- Çerezler ile oturum yönetimi
- Visibility API ile ekran takibi
