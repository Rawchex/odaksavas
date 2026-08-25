const express = require('express');
const router = express.Router();
const db = require('../db'); // Varsayılan SQLite bağlantısı

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'odaksavasi_super_secret_jwt_key_2026';

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized. Please login.' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token. Please login again.' });
  }
}

/**
 * GET /api/season-pass/status
 * Get the current user's season pass status, XP, and Blunk Coins
 */
router.get('/status', requireAuth, (req, res) => {
  const userId = req.user.id;
  
  db.get(
    'SELECT total_focus_time as total_xp, blunk_coins, has_premium_pass FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'Failed to load user stats' });
      }

      res.json({
        total_xp: user.total_xp || 0,
        blunk_coins: user.blunk_coins || 0,
        is_premium_active: user.has_premium_pass === 1
      });
    }
  );
});

/**
 * POST /api/store/buy-coins
 * Test endpoint to mock buying virtual currency with real money.
 * Bu endpoint gerçekte Stripe/Iyzico webhook'undan tetiklenecek.
 */
router.post('/buy-coins', requireAuth, (req, res) => {
  const userId = req.user.id;
  const { packageId } = req.body; // e.g., 'pack_1000'

  let amount = 0;
  if (packageId === 'pack_500') amount = 500;
  else if (packageId === 'pack_1000') amount = 1000;
  else if (packageId === 'pack_2500') amount = 2500;
  else return res.status(400).json({ error: 'Invalid package ID' });

  // Add coins to user
  db.run(
    'UPDATE users SET blunk_coins = blunk_coins + ? WHERE id = ?',
    [amount, userId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to add coins' });
      
      db.get('SELECT blunk_coins FROM users WHERE id = ?', [userId], (err, user) => {
        res.json({ success: true, new_balance: user ? user.blunk_coins : 0 });
      });
    }
  );
});

/**
 * POST /api/season-pass-system/upgrade
 * Uses 1000 Blunk Coins to unlock the Premium Pass
 */
router.post('/upgrade', requireAuth, (req, res) => {
  const userId = req.user.id;
  const PREMIUM_COST = 1000;

  // First, check balance and current status
  db.get('SELECT blunk_coins, has_premium_pass FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'Database error' });
    if (user.has_premium_pass === 1) {
      return res.status(400).json({ error: 'Premium is already active!' });
    }
    if (user.blunk_coins < PREMIUM_COST) {
      return res.status(400).json({ error: 'Not enough Blunk Coins' });
    }

    // Deduct coins and activate premium
    db.run(
      'UPDATE users SET blunk_coins = blunk_coins - ?, has_premium_pass = 1 WHERE id = ?',
      [PREMIUM_COST, userId],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: 'Failed to upgrade pass' });

        res.json({ 
          success: true, 
          message: 'Premium Season Pass Activated!',
          new_balance: user.blunk_coins - PREMIUM_COST 
        });
      }
    );
  });
});

module.exports = router;
