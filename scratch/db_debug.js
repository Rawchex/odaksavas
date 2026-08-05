const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'server', 'odaksavas.db'));

// Let's mimic followers query for 'samet' (id: 1)
const loggedInUserId = 1;
const targetUserId = 1;

db.all(`
  SELECT DISTINCT u.id, u.username, u.display_name, u.profile_photo, u.level, u.status,
    (SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_id = u.id AND status = 'accepted') as is_following
  FROM users u
  JOIN friendships f ON f.user_id = u.id
  WHERE f.friend_id = ? AND f.status = 'accepted' AND u.id != ?
  ORDER BY u.username ASC
`, [loggedInUserId, targetUserId, targetUserId], (err, followers) => {
  if (err) console.error('Followers query error:', err);
  else console.log('Followers result:', followers);

  // Mimic following query
  db.all(`
    SELECT DISTINCT u.id, u.username, u.display_name, u.profile_photo, u.level, u.status,
      (SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_id = u.id AND status = 'accepted') as is_following
    FROM users u
    JOIN friendships f ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'accepted' AND u.id != ?
    ORDER BY u.username ASC
  `, [loggedInUserId, targetUserId, targetUserId], (err2, following) => {
    if (err2) console.error('Following query error:', err2);
    else console.log('Following result:', following);
    db.close();
  });
});
