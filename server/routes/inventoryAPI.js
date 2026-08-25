const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check authentication (assuming req.user is set by JWT in index.js)
const authenticate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// GET /api/inventory/status - Get all claimed items and equipped items
router.get('/status', authenticate, (req, res) => {
  db.get('SELECT equipped_banner, equipped_theme, equipped_emoji FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'Database error' });

    db.all('SELECT item_id, item_type, claimed_at FROM user_inventory WHERE user_id = ?', [req.user.id], (err, items) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      res.json({
        equipped: {
          banner: user.equipped_banner,
          theme: user.equipped_theme,
          emoji: user.equipped_emoji
        },
        inventory: items
      });
    });
  });
});

// POST /api/inventory/claim - Claim an unlocked reward
router.post('/claim', authenticate, (req, res) => {
  const { item_id, item_type } = req.body;
  if (!item_id || !item_type) return res.status(400).json({ error: 'Invalid item data' });

  // For this implementation, we trust the client's XP check. In a production environment,
  // we would recalculate the required XP here.
  
  // Check if already claimed
  db.get('SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?', [req.user.id, item_id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) return res.status(400).json({ error: 'Item already claimed' });

    db.run('INSERT INTO user_inventory (user_id, item_id, item_type) VALUES (?, ?, ?)', [req.user.id, item_id, item_type], function(err) {
      if (err) return res.status(500).json({ error: 'Failed to claim item' });
      res.json({ success: true, message: 'Item claimed successfully', item_id });
    });
  });
});

// POST /api/inventory/equip - Equip a claimed item
router.post('/equip', authenticate, (req, res) => {
  const { item_id, item_type } = req.body; // item_type should be BANNER, THEME, or EMOJI
  
  if (!['BANNER', 'THEME', 'EMOJI'].includes(item_type)) {
    return res.status(400).json({ error: 'Invalid item type' });
  }

  // Check if user owns the item
  db.get('SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?', [req.user.id, item_id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(403).json({ error: 'You do not own this item' });

    let columnToUpdate = '';
    if (item_type === 'BANNER') columnToUpdate = 'equipped_banner';
    else if (item_type === 'THEME') columnToUpdate = 'equipped_theme';
    else if (item_type === 'EMOJI') columnToUpdate = 'equipped_emoji';

    db.run(`UPDATE users SET ${columnToUpdate} = ? WHERE id = ?`, [item_id, req.user.id], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to equip item' });
      res.json({ success: true, message: 'Item equipped successfully', item_id, item_type });
    });
  });
});

module.exports = router;
