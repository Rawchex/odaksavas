/**
 * Medal Engine Module for Weekly League Evaluation & Showcase Management
 */
const db = require('../db');
const { getCurrentSeasonAndWeek } = require('./seasonManager');
const { getWeeklyTop3, getActiveLeagueOptions } = require('./leaderboardService');

/**
 * Fetch all medals won by a specific user
 */
function getUserMedals(userId, callback) {
  const query = `
    SELECT 
      m.id,
      m.user_id,
      m.league_type,
      m.league_name,
      m.rank,
      m.season_number,
      m.week_number,
      m.week_identifier,
      m.total_minutes,
      m.is_showcased,
      m.showcase_order,
      m.created_at,
      u.username
    FROM user_medals m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.user_id = ?
    ORDER BY m.is_showcased DESC, m.created_at DESC
  `;

  db.all(query, [userId], (err, medals) => {
    if (err) return callback(err);
    callback(null, medals || []);
  });
}

/**
 * Fetch public showcased medals for a user (Max 5)
 */
function getPublicShowcasedMedals(userId, callback) {
  const query = `
    SELECT 
      m.id,
      m.user_id,
      m.league_type,
      m.league_name,
      m.rank,
      m.season_number,
      m.week_number,
      m.week_identifier,
      m.total_minutes,
      m.created_at,
      u.username
    FROM user_medals m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.user_id = ? AND m.is_showcased = 1
    ORDER BY m.rank ASC, m.created_at DESC
    LIMIT 5
  `;

  db.all(query, [userId], (err, medals) => {
    if (err) return callback(err);
    callback(null, medals || []);
  });
}

/**
 * Toggle showcase status of a medal for a user
 */
function toggleMedalShowcase(userId, medalId, callback) {
  // First check if medal belongs to user and current showcase status
  const findQuery = `SELECT id, is_showcased FROM user_medals WHERE id = ? AND user_id = ?`;
  
  db.get(findQuery, [medalId, userId], (err, medal) => {
    if (err) return callback(err);
    if (!medal) return callback(new Error('Madalya bulunamadı.'));

    const newShowcaseState = medal.is_showcased === 1 ? 0 : 1;

    if (newShowcaseState === 1) {
      // Check total showcased count limit (Max 5)
      const countQuery = `SELECT COUNT(*) as count FROM user_medals WHERE user_id = ? AND is_showcased = 1`;
      db.get(countQuery, [userId], (err, res) => {
        if (err) return callback(err);
        if (res && res.count >= 5) {
          return callback(new Error('En fazla 5 madalya sergileyebilirsiniz. Önce birini gizleyin.'));
        }

        updateShowcase(userId, medalId, 1, callback);
      });
    } else {
      updateShowcase(userId, medalId, 0, callback);
    }
  });
}

function updateShowcase(userId, medalId, showcaseValue, callback) {
  const updateQuery = `UPDATE user_medals SET is_showcased = ? WHERE id = ? AND user_id = ?`;
  db.run(updateQuery, [showcaseValue, medalId, userId], function(err) {
    if (err) return callback(err);
    callback(null, { success: true, is_showcased: showcaseValue });
  });
}

/**
 * Autonomous Weekly League Evaluation Engine
 * Calculates 1st, 2nd, and 3rd place for Overall, active categories & activities
 */
function evaluateWeeklyLeagues(callback = () => {}) {
  const timing = getCurrentSeasonAndWeek();
  const weekId = timing.week_identifier;
  const seasonNum = timing.season_number;
  const weekNum = timing.week_number;

  getActiveLeagueOptions((err, options) => {
    if (err) {
      console.error('[MEDAL_ENGINE] Failed to fetch active options:', err);
      return callback(err);
    }

    const leaguesToEvaluate = [
      { type: 'overall', name: 'Genel' },
      ...(options.categories || []).slice(0, 10).map(cat => ({ type: 'category', name: cat })),
      ...(options.activities || []).slice(0, 15).map(act => ({ type: 'activity', name: act }))
    ];

    let completed = 0;

    if (leaguesToEvaluate.length === 0) return callback(null, { evaluated: 0 });

    leaguesToEvaluate.forEach(league => {
      getWeeklyTop3(league.type, league.name, (err, winners) => {
        if (!err && winners && winners.length > 0) {
          winners.forEach((winner, idx) => {
            const rank = idx + 1; // 1: Gold, 2: Silver, 3: Bronze
            const insertSql = `
              INSERT OR IGNORE INTO user_medals (
                user_id, league_type, league_name, rank, season_number, week_number, week_identifier, total_minutes, is_showcased
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // Auto-showcase top 1 medals if user has space
            db.run(insertSql, [
              winner.user_id,
              league.type,
              league.name,
              rank,
              seasonNum,
              weekNum,
              weekId,
              winner.total_minutes,
              rank === 1 ? 1 : 0
            ], (err) => {
              if (err) console.error(`[MEDAL_ENGINE] Error awarding medal to user ${winner.user_id}:`, err);
            });
          });
        }

        completed++;
        if (completed >= leaguesToEvaluate.length) {
          console.log(`[MEDAL_ENGINE] Successfully evaluated ${completed} leagues for week ${weekId}`);
          callback(null, { evaluated: completed, weekId });
        }
      });
    });
  });
}

module.exports = {
  getUserMedals,
  getPublicShowcasedMedals,
  toggleMedalShowcase,
  evaluateWeeklyLeagues
};
