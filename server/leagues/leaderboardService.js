/**
 * Leaderboard Service Module for Leagues
 */
const db = require('../db');

/**
 * Helper to compute current weekly season start (Monday 00:00:00) in GMT+3 (Turkey Local Timezone)
 */
function getWeekStartTimestamp() {
  const d = new Date();
  // GMT+3 Offset (3 hours in ms)
  const gmtPlus3Ms = 3 * 60 * 60 * 1000;
  const localDate = new Date(d.getTime() + gmtPlus3Ms);

  const day = localDate.getUTCDay(); // 0 is Sunday, 1 is Monday...
  const diff = localDate.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday of current week
  const monday = new Date(localDate);
  monday.setUTCDate(diff);
  monday.setUTCHours(0, 0, 0, 0);

  // Convert back to UTC for SQLite ISO string comparison
  const utcMonday = new Date(monday.getTime() - gmtPlus3Ms);
  const pad = n => String(n).padStart(2, '0');
  return `${utcMonday.getUTCFullYear()}-${pad(utcMonday.getUTCMonth() + 1)}-${pad(utcMonday.getUTCDate())} ${pad(utcMonday.getUTCHours())}:${pad(utcMonday.getUTCMinutes())}:${pad(utcMonday.getUTCSeconds())}`;
}

/**
 * Fetch leaderboard ranking based on timeframe, league type, and category/activity name
 */
function getLeaderboard({ timeframe = 'weekly', league_type = 'overall', league_name = '', limit = 50 }, callback) {
  if (timeframe === 'all_time' && (league_type === 'overall' || league_name === 'Genel' || !league_name)) {
    // All-time overall leaderboard query based on users.total_focus_time or session sums
    const query = `
      SELECT 
        u.id as user_id,
        u.username,
        u.profile_photo,
        u.level,
        u.bio,
        u.equipped_banner,
        u.equipped_emoji,
        CASE WHEN COALESCE(u.total_focus_time, 0) > COALESCE(s.session_total, 0)
             THEN COALESCE(u.total_focus_time, 0)
             ELSE COALESCE(s.session_total, 0)
        END as total_seconds,
        ROUND((CASE WHEN COALESCE(u.total_focus_time, 0) > COALESCE(s.session_total, 0)
                    THEN COALESCE(u.total_focus_time, 0)
                    ELSE COALESCE(s.session_total, 0)
               END) / 60.0) as total_minutes
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(duration) as session_total 
        FROM sessions 
        WHERE status = 'completed' OR duration > 0 
        GROUP BY user_id
      ) s ON u.id = s.user_id
      WHERE COALESCE(u.total_focus_time, 0) > 0 OR COALESCE(s.session_total, 0) > 0
      ORDER BY total_seconds DESC
      LIMIT ?
    `;

    return db.all(query, [limit], (err, rows) => {
      if (err) return callback(err);
      const leaderboard = (rows || []).map((row, index) => ({
        rank: index + 1,
        user_id: row.user_id,
        username: row.username,
        profile_photo: row.profile_photo || '/default-avatar.png',
        level: row.level || 1,
        bio: row.bio || '',
        equipped_banner: row.equipped_banner,
        equipped_emoji: row.equipped_emoji,
        total_seconds: row.total_seconds || 0,
        total_minutes: row.total_minutes || 0,
        total_hours: (row.total_minutes / 60).toFixed(1)
      }));
      callback(null, {
        leaderboard,
        meta: { is_active_league: true, qualifying_users_count: leaderboard.length, required_users: 3 }
      });
    });
  }

  let whereClauses = ["(s.status = 'completed' OR s.duration > 0)"];
  let params = [];

  // Timeframe filter for weekly season (Starts every Monday at 00:00:00 GMT+3)
  if (timeframe === 'weekly') {
    const weekStart = getWeekStartTimestamp();
    whereClauses.push("(s.start_time >= ? OR s.end_time >= ?)");
    params.push(weekStart, weekStart);
  }

  // League Type filter with joins
  let joinSql = "LEFT JOIN categories c ON s.category_id = c.id LEFT JOIN tags t ON s.tag_id = t.id";
  if (league_type === 'category' && league_name && league_name !== 'Genel' && league_name !== 'Tümü') {
    whereClauses.push("LOWER(TRIM(COALESCE(c.name, s.category))) = LOWER(TRIM(?))");
    params.push(league_name);
  } else if (league_type === 'activity' && league_name && league_name !== 'Genel' && league_name !== 'Tümü') {
    whereClauses.push("LOWER(TRIM(COALESCE(t.name, s.activity))) = LOWER(TRIM(?))");
    params.push(league_name);
  }

  const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

  let subqueryFilter = "";
  let subJoin = "LEFT JOIN categories c2 ON s2.category_id = c2.id LEFT JOIN tags t2 ON s2.tag_id = t2.id";
  if (league_type === 'category' && league_name && league_name !== 'Genel' && league_name !== 'Tümü') {
    const escapedName = league_name.replace(/'/g, "''").toLowerCase();
    subqueryFilter = ` AND LOWER(TRIM(COALESCE(c2.name, s2.category))) = '${escapedName}'`;
  }

  const query = `
    SELECT 
      u.id as user_id,
      u.username,
      u.profile_photo,
      u.level,
      u.bio,
      u.equipped_banner,
      u.equipped_emoji,
      SUM(COALESCE(s.duration, 0)) as total_seconds,
      ROUND(SUM(COALESCE(s.duration, 0)) / 60.0) as total_minutes,
      (SELECT COALESCE(t2.name, s2.activity) FROM sessions s2 
       ${subJoin}
       WHERE s2.user_id = u.id AND (s2.activity IS NOT NULL OR t2.name IS NOT NULL) AND (s2.activity != '' OR t2.name != '') ${subqueryFilter}
       GROUP BY LOWER(TRIM(COALESCE(t2.name, s2.activity))) 
       ORDER BY SUM(s2.duration) DESC LIMIT 1) as top_activity
    FROM users u
    JOIN sessions s ON u.id = s.user_id
    ${joinSql}
    ${whereSql}
    GROUP BY u.id
    HAVING total_minutes > 0
    ORDER BY total_seconds DESC
    LIMIT ?
  `;

  params.push(limit);

  db.all(query, params, (err, rows) => {
    if (err) return callback(err);

    const userIds = (rows || []).map(r => r.user_id);
    if (userIds.length === 0) {
      return callback(null, {
        leaderboard: [],
        meta: { is_active_league: true, qualifying_users_count: 0, required_users: 3, required_minutes: 10 }
      });
    }

    let sparkWhere = [
      `s.user_id IN (${userIds.map(() => '?').join(',')})`,
      "(s.start_time >= date('now', '-6 days') OR s.end_time >= date('now', '-6 days'))",
      "(s.status = 'completed' OR s.duration > 0)"
    ];
    let sparkParams = [...userIds];

    if (league_type === 'category' && league_name && league_name !== 'Genel' && league_name !== 'Tümü') {
      sparkWhere.push("LOWER(TRIM(COALESCE(c.name, s.category))) = LOWER(TRIM(?))");
      sparkParams.push(league_name.trim());
    } else if (league_type === 'activity' && league_name && league_name !== 'Genel' && league_name !== 'Tümü') {
      sparkWhere.push("LOWER(TRIM(COALESCE(t.name, s.activity))) = LOWER(TRIM(?))");
      sparkParams.push(league_name.trim());
    }

    const sparklineQuery = `
      SELECT 
        s.user_id,
        date(s.start_time) as focus_date,
        SUM(COALESCE(s.duration, 0)) as total_seconds
      FROM sessions s
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN tags t ON s.tag_id = t.id
      WHERE ${sparkWhere.join(" AND ")}
      GROUP BY s.user_id, focus_date
    `;

    db.all(sparklineQuery, sparkParams, (err, sparkRows) => {
      const sparkMap = {};
      const today = new Date();
      const last7Dates = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        last7Dates.push(d.toISOString().split('T')[0]);
      }

      userIds.forEach(uid => {
        sparkMap[uid] = {};
        last7Dates.forEach(dateStr => { sparkMap[uid][dateStr] = 0; });
      });

      (sparkRows || []).forEach(sr => {
        if (sparkMap[sr.user_id] && sparkMap[sr.user_id][sr.focus_date] !== undefined) {
          sparkMap[sr.user_id][sr.focus_date] += sr.total_seconds || 0;
        }
      });

      const leaderboard = (rows || []).map((row, index) => {
        const userSparks = last7Dates.map(dateStr => Math.round((sparkMap[row.user_id][dateStr] || 0) / 60));
        const safeMins = Math.max(0, row.total_minutes || 0);
        return {
          rank: index + 1,
          user_id: row.user_id,
          username: row.username,
          profile_photo: (row.profile_photo && row.profile_photo !== 'null' && row.profile_photo.trim() !== '') ? row.profile_photo : '/default-avatar.png',
          level: row.level || 1,
          bio: row.bio || '',
          top_activity: row.top_activity || '',
          total_seconds: Math.max(0, row.total_seconds || 0),
          total_minutes: safeMins,
          total_hours: (safeMins / 60.0).toFixed(1),
          sparkline_7_days: userSparks
        };
      });

      // Count qualifying users strictly within this category/activity league (users with >= 10 mins focus)
      const qualifyingCount = leaderboard.filter(u => u.total_minutes >= 10).length;
      const requiredUsers = 3;
      const requiredMinutes = 10;
      const isActiveLeague = timeframe === 'all_time' || league_type === 'overall' || qualifyingCount >= requiredUsers;

      callback(null, {
        leaderboard,
        meta: {
          is_active_league: isActiveLeague,
          qualifying_users_count: qualifyingCount,
          required_users: requiredUsers,
          required_minutes: requiredMinutes
        }
      });
    });
  });
}

/**
 * Fetch top 3 winners of a league for weekly evaluation
 */
function getWeeklyTop3(league_type, league_name, callback) {
  const cleanName = (league_name || '').trim();
  const weekStart = getWeekStartTimestamp();
  let whereClauses = ["(s.start_time >= ? OR s.end_time >= ?)", "(s.status = 'completed' OR s.duration > 0)"];
  let params = [weekStart, weekStart];

  if (league_type === 'category') {
    whereClauses.push("LOWER(TRIM(s.category)) = LOWER(TRIM(?))");
    params.push(cleanName);
  } else if (league_type === 'activity') {
    whereClauses.push("LOWER(TRIM(s.activity)) = LOWER(TRIM(?))");
    params.push(cleanName);
  }

  const whereSql = "WHERE " + whereClauses.join(" AND ");

  const query = `
    SELECT 
      u.id as user_id,
      u.username,
      ROUND(SUM(COALESCE(s.duration, 0)) / 60.0) as total_minutes
    FROM users u
    JOIN sessions s ON u.id = s.user_id
    ${whereSql}
    GROUP BY u.id
    HAVING total_minutes > 0
    ORDER BY SUM(COALESCE(s.duration, 0)) DESC
    LIMIT 3
  `;

  if (league_type === 'overall') {
    return db.all(query, params, (err, rows) => {
      if (err) return callback(err);
      callback(null, rows || []);
    });
  }

  // Anti-abuse check for category & activity leagues (Requires >= 3 users with >= 10 mins focus)
  const countQuery = `
    SELECT COUNT(*) as count FROM (
      SELECT u.id, ROUND(SUM(COALESCE(s.duration, 0)) / 60.0) as mins
      FROM users u JOIN sessions s ON u.id = s.user_id
      ${whereSql}
      GROUP BY u.id
      HAVING mins >= 10
    )
  `;

  db.get(countQuery, params, (err, countRow) => {
    if (err) return callback(err);

    const qualifyingCount = countRow ? countRow.count : 0;
    if (qualifyingCount < 3) {
      return callback(null, []);
    }

    db.all(query, params, (err, rows) => {
      if (err) return callback(err);
      callback(null, rows || []);
    });
  });
}

/**
 * Fetch distinct categories and activities from active sessions for league selectors (Case-Deduplicated)
 */
function getActiveLeagueOptions(callback) {
  const catQuery = `SELECT id, name as category FROM categories ORDER BY id ASC`;
  const actQuery = `
    SELECT t.name as activity, COUNT(s.id) as usage_count
    FROM tags t
    JOIN sessions s ON t.id = s.tag_id
    WHERE s.start_time >= date('now', '-30 days')
    GROUP BY t.id
    ORDER BY usage_count DESC
    LIMIT 100
  `;
  const activeLeaguesQuery = `
    SELECT 
      t.name as activity, 
      COUNT(DISTINCT s.user_id) as players,
      SUM(s.duration) as total_duration,
      (
        SELECT u.username 
        FROM sessions s2 
        JOIN users u ON s2.user_id = u.id 
        WHERE s2.tag_id = t.id AND s2.start_time >= date('now', '-30 days') 
        GROUP BY s2.user_id 
        ORDER BY SUM(s2.duration) DESC 
        LIMIT 1
      ) as leader_username,
      (
        SELECT u.profile_photo 
        FROM sessions s2 
        JOIN users u ON s2.user_id = u.id 
        WHERE s2.tag_id = t.id AND s2.start_time >= date('now', '-30 days') 
        GROUP BY s2.user_id 
        ORDER BY SUM(s2.duration) DESC 
        LIMIT 1
      ) as leader_photo
    FROM tags t
    JOIN sessions s ON t.id = s.tag_id
    WHERE s.start_time >= date('now', '-30 days')
    GROUP BY t.id
    ORDER BY players DESC, total_duration DESC
    LIMIT 12
  `;

  db.all(catQuery, [], (err, categories) => {
    if (err) return callback(err);
    db.all(actQuery, [], (err, activities) => {
      if (err) return callback(err);
      db.all(activeLeaguesQuery, [], (err, activeLeagues) => {
        if (err) return callback(err);

        // We still need to return strings for backward compatibility with frontend
        const uniqueCats = categories.map(c => c.category);
        const uniqueActs = activities.map(a => a.activity);

        callback(null, {
          categories: uniqueCats,
          activities: uniqueActs,
          active_leagues: activeLeagues || []
        });
      });
    });
  });
}

/**
 * Fetch detailed 7-day activity breakdown for a specific user with follow status
 */
function getUserWeeklyActivityBreakdown(userId, currentUserId, callback) {
  if (typeof currentUserId === 'function') {
    callback = currentUserId;
    currentUserId = null;
  }

  const userQuery = `SELECT id, username, profile_photo, bio, level, status, last_seen FROM users WHERE id = ?`;
  const medalsQuery = `SELECT m.*, u.username FROM user_medals m LEFT JOIN users u ON m.user_id = u.id WHERE m.user_id = ? AND m.is_showcased = 1 LIMIT 5`;
  const followQuery = `SELECT COUNT(*) as is_following FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'accepted'`;

  db.get(userQuery, [userId], (err, user) => {
    if (err || !user) return callback(err || new Error('User not found'));

    db.all(medalsQuery, [userId], (err, medals) => {
      const showcasedMedals = medals || [];

      db.get(followQuery, [currentUserId || 0, userId], (err, followRes) => {
        const isFollowing = followRes && followRes.is_following > 0;

        const query = `
          SELECT 
            date(s.start_time) as focus_date,
            COALESCE(c.name, s.category, 'Genel') as category,
            COALESCE(t.name, s.activity, 'Genel Odak') as activity,
            SUM(COALESCE(s.duration, 0)) as total_seconds
          FROM sessions s
          LEFT JOIN categories c ON s.category_id = c.id
          LEFT JOIN tags t ON s.tag_id = t.id
          WHERE s.user_id = ? 
            AND (s.start_time >= date('now', '-6 days') OR s.end_time >= date('now', '-6 days'))
            AND (s.status = 'completed' OR s.duration > 0)
          GROUP BY focus_date, category, activity
          ORDER BY focus_date ASC
        `;

        db.all(query, [userId], (err, rows) => {
          if (err) return callback(err);

          const daysMap = {};
          const today = new Date();
          
          for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const isoDate = d.toISOString().split('T')[0];
            const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
            const dayName = dayNames[d.getDay()];

            daysMap[isoDate] = {
              date: isoDate,
              day_name: dayName,
              total_seconds: 0,
              total_minutes: 0,
              total_hours: "0.0",
              items: []
            };
          }

          (rows || []).forEach(row => {
            const rowDate = row.focus_date || today.toISOString().split('T')[0];
            if (daysMap[rowDate]) {
              const secs = row.total_seconds || 0;
              const mins = secs / 60;
              daysMap[rowDate].total_seconds += secs;
              daysMap[rowDate].total_minutes += mins;
              daysMap[rowDate].total_hours = (daysMap[rowDate].total_minutes / 60).toFixed(1);
              daysMap[rowDate].items.push({
                category: row.category,
                activity: row.activity,
                minutes: mins,
                hours: (mins / 60).toFixed(1)
              });
            }
          });

          const breakdown = Object.values(daysMap);
          callback(null, {
            user: {
              id: user.id,
              username: user.username,
              profile_photo: user.profile_photo || '/default-avatar.png',
              bio: user.bio || '',
              level: user.level || 1,
              status: user.status || 'online',
              last_seen: user.last_seen,
              is_following: isFollowing,
              medals: showcasedMedals
            },
            breakdown
          });
        });
      });
    });
  });
}

/**
 * Toggle Follow / Unfollow between two users
 */
function toggleUserFollow(followerId, followingId, callback) {
  if (!followerId || !followingId || parseInt(followerId) === parseInt(followingId)) {
    return callback(new Error('Kendi kendinizi takip edemezsiniz.'));
  }

  const checkQuery = `SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?`;
  db.get(checkQuery, [followerId, followingId], (err, row) => {
    if (err) return callback(err);

    if (row) {
      const delQuery = `DELETE FROM friendships WHERE user_id = ? AND friend_id = ?`;
      db.run(delQuery, [followerId, followingId], (err) => {
        if (err) return callback(err);
        callback(null, { is_following: false });
      });
    } else {
      const insQuery = `INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')`;
      db.run(insQuery, [followerId, followingId], (err) => {
        if (err) return callback(err);
        callback(null, { is_following: true });
      });
    }
  });
}

/**
 * Fetch All-Time Calendar & Monthly Focus History since registration
 */
function getUserAllTimeCalendar(userId, year, month, callback) {
  const userQuery = `SELECT id, username, created_at FROM users WHERE id = ?`;
  db.get(userQuery, [userId], (err, user) => {
    if (err || !user) return callback(err || new Error('Kullanıcı bulunamadı'));

    const now = new Date();
    const targetYear = year ? Math.max(2026, parseInt(year, 10)) : now.getFullYear();
    const targetMonth = month ? Math.min(12, Math.max(1, parseInt(month, 10))) : (now.getMonth() + 1);

    const monthStr = targetMonth < 10 ? `0${targetMonth}` : `${targetMonth}`;
    const datePrefix = `${targetYear}-${monthStr}`;

    const sessionsQuery = `
      SELECT 
        date(start_time) as focus_date,
        COALESCE(category, 'Genel') as category,
        COALESCE(activity, 'Genel Odak') as activity,
        SUM(COALESCE(duration, 0)) as total_seconds
      FROM sessions
      WHERE user_id = ?
        AND date(start_time) LIKE ?
        AND (status = 'completed' OR duration > 0)
      GROUP BY focus_date, category, activity
      ORDER BY focus_date ASC
    `;

    db.all(sessionsQuery, [userId, `${datePrefix}%`], (err, rows) => {
      if (err) return callback(err);

      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      const firstDateObj = new Date(targetYear, targetMonth - 1, 1);
      // Monday = 0, Tuesday = 1 ... Sunday = 6
      const rawDay = firstDateObj.getDay(); 
      const firstDayOffset = rawDay === 0 ? 6 : rawDay - 1;

      const monthDaysMap = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        const fullDate = `${datePrefix}-${dayStr}`;
        const dObj = new Date(targetYear, targetMonth - 1, day);
        const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

        monthDaysMap[fullDate] = {
          date: fullDate,
          day: day,
          day_name: dayNames[dObj.getDay()],
          total_seconds: 0,
          total_minutes: 0,
          total_hours: "0.0",
          items: []
        };
      }

      (rows || []).forEach(row => {
        if (monthDaysMap[row.focus_date]) {
          const secs = row.total_seconds || 0;
          const mins = Math.round(secs / 60);
          monthDaysMap[row.focus_date].total_seconds += secs;
          monthDaysMap[row.focus_date].total_minutes += mins;
          monthDaysMap[row.focus_date].total_hours = (monthDaysMap[row.focus_date].total_minutes / 60).toFixed(1);
          monthDaysMap[row.focus_date].items.push({
            category: row.category,
            activity: row.activity,
            minutes: mins,
            hours: (mins / 60).toFixed(1)
          });
        }
      });

      callback(null, {
        registered_at: user.created_at || '2026-01-01',
        selected_year: targetYear,
        selected_month: targetMonth,
        first_day_offset: firstDayOffset,
        days: Object.values(monthDaysMap)
      });
    });
  });
}

module.exports = {
  getLeaderboard,
  getWeeklyTop3,
  getActiveLeagueOptions,
  getUserWeeklyActivityBreakdown,
  toggleUserFollow,
  getUserAllTimeCalendar
};
