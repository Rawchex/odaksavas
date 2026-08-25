const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
let db;

// Middleware to check auth
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const JWT_SECRET = process.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';
const SHOPIER_BEARER_TOKEN = process.env.SHOPIER_BEARER_TOKEN;
const SHOPIER_API_SECRET = process.env.SHOPIER_API_SECRET; // Müşteri sırrı

// Helper to determine price based on package
const getPackageInfo = (packageId) => {
  if (packageId === 'pack_500') return { price: 49.0, coins: 500 };
  if (packageId === 'pack_1100') return { price: 99.0, coins: 1100 };
  if (packageId === 'pack_2500') return { price: 199.0, coins: 2500 };
  return { price: 0, coins: 0 };
};

// 1. Ödeme Linki Oluşturma (REST API)
router.post('/checkout', authenticate, async (req, res) => {
  const { packageId } = req.body;
  const packageInfo = getPackageInfo(packageId);

  if (packageInfo.price === 0) {
    return res.status(400).json({ error: 'Geçersiz paket' });
  }

  // Generate a unique order ID
  const orderId = `BLUNK-${req.user.id}-${Date.now()}`;

  try {
    // 1. Siparişi veritabanına pending olarak kaydet
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO orders (user_id, order_id, package_id, price, coins, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [req.user.id, orderId, packageId, packageInfo.price, packageInfo.coins],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    // Calling Shopier REST API to generate a payment link
    const shopierResponse = await fetch('https://api.shopier.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHOPIER_BEARER_TOKEN}`
      },
      body: JSON.stringify({
        order_id: orderId,
        currency: 'TRY',
        price: packageInfo.price,
        buyer: {
          id: req.user.id.toString(),
          name: req.user.username || 'Oyuncu',
          surname: 'Blunk',
          email: 'user@blunk.com', // In a real app, use user's email
          phone: '05555555555'
        },
        items: [
          {
            name: `${packageInfo.coins} Odak Parası Paketi`,
            price: packageInfo.price,
            quantity: 1
          }
        ]
      })
    });

    if (shopierResponse.ok) {
      const shopierData = await shopierResponse.json();
      return res.json({ success: true, paymentUrl: shopierData.payment_url || shopierData.checkout_url || shopierData.url });
    } else {
      let errorMessage = 'Bilinmeyen Shopier Hatası';
      try {
        const errorData = await shopierResponse.json();
        console.error('Shopier API JSON Error:', errorData);
        errorMessage = errorData.message || JSON.stringify(errorData);
      } catch (e) {
        const errorText = await shopierResponse.text();
        console.error('Shopier API Text Error:', errorText);
        errorMessage = errorText || 'Geçersiz Shopier Yanıtı';
      }
      
      return res.status(400).json({ 
        success: false, 
        error: `Shopier Hatası: ${errorMessage}` 
      });
    }
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Ödeme sistemi geçici olarak hizmet dışı.' });
  }
});

// Geliştirme Ortamı İçin Sahte Yönlendirme ve Doğrulama
router.get('/mock-redirect', (req, res) => {
  const { orderId, coins } = req.query;
  const userId = orderId.split('-')[1];
  
  if (!db) return res.status(500).send('Database missing');
  
  // Idempotency: Sipariş zaten tamamlandı mı?
  db.get(`SELECT status, coins FROM orders WHERE order_id = ?`, [orderId], (err, order) => {
    if (err) return res.status(500).send('Veritabanı hatası');
    if (!order) return res.status(404).send('Sipariş bulunamadı');
    if (order.status === 'completed') {
      return res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Blunk - İşlem Tamamlandı</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            body { 
              margin: 0; font-family: 'Outfit', sans-serif; 
              background: radial-gradient(circle at top right, #1a1a2e 0%, #0f1923 100%);
              color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; 
            }
            .card { 
              background: rgba(255, 255, 255, 0.03); 
              border: 1px solid rgba(255, 255, 255, 0.05); 
              border-radius: 24px; padding: 48px; text-align: center; max-width: 420px; width: 100%;
              backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
              box-shadow: 0 30px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1); 
            }
            .icon-wrapper {
              width: 80px; height: 80px; margin: 0 auto 24px;
              background: linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(250, 204, 21, 0.05) 100%);
              border-radius: 50%; display: flex; align-items: center; justify-content: center;
              border: 1px solid rgba(250, 204, 21, 0.3);
              box-shadow: 0 0 30px rgba(250, 204, 21, 0.2);
            }
            .icon-wrapper svg { color: #facc15; }
            h1 { 
              margin: 0 0 12px; font-size: 28px; font-weight: 700; 
              background: linear-gradient(to right, #fff, #a1a1aa);
              -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            }
            p { color: #a1a1aa; font-size: 15px; margin: 0 0 32px; line-height: 1.6; }
            .btn { 
              display: inline-block; padding: 16px 32px; 
              background: linear-gradient(135deg, #facc15 0%, #eab308 100%); 
              color: #000; text-decoration: none; border-radius: 12px; 
              font-weight: 600; font-size: 15px; transition: all 0.3s ease; 
              border: none; cursor: pointer; width: 100%; box-sizing: border-box; 
              box-shadow: 0 10px 20px rgba(250, 204, 21, 0.2);
            }
            .btn:hover { 
              transform: translateY(-2px); 
              box-shadow: 0 15px 25px rgba(250, 204, 21, 0.3); 
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon-wrapper">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h1>İşlem Tamamlanmış</h1>
            <p>Bu ödeme işlemi zaten başarıyla işlenmiş durumda. Hesabınıza daha önce yansıtıldı.</p>
            <button class="btn" onclick="window.location.href='/'">Ana Sayfaya Dön</button>
          </div>
        </body>
        </html>
      `);
    }

    // Siparişi güncelle ve coin ekle
    db.run(`UPDATE orders SET status = 'completed', updated_at = datetime('now') WHERE order_id = ?`, [orderId], (err) => {
      if (err) return res.status(500).send('Sipariş güncellenemedi');
      
      // Kullanıcıya coinleri ver
      db.run('UPDATE users SET blunk_coins = blunk_coins + ? WHERE id = ?', [order.coins, userId], (err) => {
        if (err) return res.status(500).send('Bakiye güncellenemedi');
        
        res.send(`
          <!DOCTYPE html>
          <html lang="tr">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Blunk - Ödeme Başarılı</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
              body { 
                margin: 0; font-family: 'Outfit', sans-serif; 
                background: radial-gradient(circle at 50% -20%, #173322 0%, #0f1923 60%);
                color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; 
              }
              .card { 
                background: rgba(255, 255, 255, 0.02); 
                border: 1px solid rgba(255, 255, 255, 0.05); 
                border-radius: 24px; padding: 50px 40px; text-align: center; max-width: 440px; width: 100%;
                backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                box-shadow: 0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); 
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                position: relative; overflow: hidden;
              }
              .card::before {
                content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
                background: linear-gradient(90deg, #4ade80, #34d399, #10b981);
              }
              @keyframes slideUp { 
                0% { opacity: 0; transform: translateY(30px) scale(0.95); } 
                100% { opacity: 1; transform: translateY(0) scale(1); } 
              }
              .icon-wrapper { 
                width: 90px; height: 90px; border-radius: 50%; 
                background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(74, 222, 128, 0.05) 100%); 
                color: #4ade80; display: flex; align-items: center; justify-content: center; 
                margin: 0 auto 24px; font-size: 40px; 
                border: 1px solid rgba(74, 222, 128, 0.3);
                box-shadow: 0 0 40px rgba(74, 222, 128, 0.2);
                animation: pulse 2s infinite ease-in-out;
              }
              @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
                70% { box-shadow: 0 0 0 20px rgba(74, 222, 128, 0); }
                100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
              }
              h1 { 
                margin: 0 0 8px; font-size: 28px; font-weight: 700; 
                color: #fff; letter-spacing: -0.5px;
              }
              .amount { 
                font-size: 42px; font-weight: 800; 
                background: linear-gradient(135deg, #4ade80 0%, #34d399 100%);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                margin: 16px 0 24px; letter-spacing: -1px;
                text-shadow: 0 10px 20px rgba(74, 222, 128, 0.2);
              }
              p { 
                color: #94a3b8; font-size: 15px; margin: 0 0 36px; line-height: 1.6; 
              }
              .btn { 
                display: inline-block; padding: 16px 32px; 
                background: rgba(255, 255, 255, 0.05); color: #fff; 
                border-radius: 12px; font-weight: 600; font-size: 15px; 
                transition: all 0.3s ease; border: 1px solid rgba(255, 255, 255, 0.1); 
                cursor: pointer; width: 100%; box-sizing: border-box; 
              }
              .btn:hover { 
                background: rgba(255, 255, 255, 0.1); transform: translateY(-2px); 
              }
              .badge { 
                display: inline-flex; align-items: center; gap: 6px;
                padding: 6px 12px; background: rgba(74, 222, 128, 0.1); 
                border-radius: 20px; font-size: 12px; font-weight: 600; 
                margin-bottom: 24px; color: #4ade80; 
                border: 1px solid rgba(74, 222, 128, 0.2);
              }
              .badge::before {
                content: ''; width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
                box-shadow: 0 0 10px #4ade80;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">DEVELOPER MOCK MODE</div>
              <div class="icon-wrapper">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <h1>Ödeme Tamamlandı</h1>
              <div class="amount">+${order.coins} OP</div>
              <p>Hesabınıza odak parası başarıyla yüklendi. Güvenli bir şekilde sisteme yönlendiriliyorsunuz.</p>
              <button class="btn" onclick="window.location.href='/'">Şimdi Yönlendir</button>
            </div>
            <script>
              setTimeout(() => { window.location.href = '/'; }, 3500);
            </script>
          </body>
          </html>
        `);
      });
    });
  });
});

// 2. Webhook (Shopier'den dönen onay sinyali)
router.post('/callback', express.urlencoded({ extended: true }), express.json(), (req, res) => {
  const payload = req.body;
  const { status, payment_id, order_id, currency, total_order_value, custom_params, signature } = payload;
  
  // 1. Signature Verification
  // Shopier dokümantasyonuna göre, dönen değerler birleştirilerek secret ile hashlenir.
  // Not: Shopier HMAC algoritması genelde random_nr + order_nr + total_order_value + currency şeklindedir.
  // Bu örnekte varsayılan bir Shopier imza doğrulama mantığı (örnek) implemente edilmiştir.
  const expectedData = payload.random_nr + payload.order_id + payload.total_order_value + payload.currency;
  const expectedSignature = crypto.createHmac('sha256', SHOPIER_API_SECRET || '').update(expectedData).digest('base64');
  
  if (signature !== expectedSignature) {
    console.error('Shopier Webhook: Geçersiz imza.', { order_id, expectedSignature, received: signature });
    return res.status(400).send('Invalid Signature');
  }

  if (status !== 'success') {
    db.run(`UPDATE orders SET status = 'failed', updated_at = datetime('now') WHERE order_id = ?`, [order_id]);
    return res.status(200).send('OK');
  }

  // 2. Idempotency ve Sipariş Kontrolü
  db.get(`SELECT status, user_id, coins FROM orders WHERE order_id = ?`, [order_id], (err, order) => {
    if (err) {
      console.error('Shopier Webhook: DB Hatası', err);
      return res.status(500).send('Internal Error');
    }
    
    if (!order) {
      console.error('Shopier Webhook: Sipariş bulunamadı.', order_id);
      return res.status(404).send('Order Not Found');
    }

    if (order.status === 'completed') {
      console.log('Shopier Webhook: Sipariş zaten tamamlanmış (Idempotency).', order_id);
      return res.status(200).send('OK'); // Zaten işlenmiş
    }

    // 3. Siparişi güncelle ve parayı yükle
    db.run(`UPDATE orders SET status = 'completed', shopier_order_no = ?, updated_at = datetime('now') WHERE order_id = ?`, 
      [payment_id, order_id], 
      (updateErr) => {
        if (updateErr) {
          console.error('Shopier Webhook: Sipariş güncellenemedi', updateErr);
          return res.status(500).send('Internal Error');
        }

        db.run('UPDATE users SET blunk_coins = blunk_coins + ? WHERE id = ?', [order.coins, order.user_id], (coinErr) => {
          if (coinErr) {
            console.error('Shopier Webhook: Kullanıcı bakiyesi güncellenemedi', coinErr);
            return res.status(500).send('Internal Error');
          }
          
          console.log(`Shopier Webhook: Başarılı ödeme işlemi. Sipariş: ${order_id}, Coin: ${order.coins}, User: ${order.user_id}`);
          res.status(200).send('OK');
        });
    });
  });
});

module.exports = (database) => {
  db = database;
  return router;
};
