const Database = require('better-sqlite3');
const db = new Database('odaksavas.db');

console.log('Demo kullanıcılar oluşturuluyor...');

const demoUsers = [
    { username: 'samet', bio: 'Odak savaşçısı', level: 5, xp: 450, total_focus_time: 18000 },
    { username: 'ibrahim', bio: 'Çalışma makinesi', level: 7, xp: 680, total_focus_time: 25200 },
    { username: 'ayse', bio: 'Fokus ustası', level: 3, xp: 210, total_focus_time: 10800 },
    { username: 'mehmet', bio: 'Kütüphane aşığı', level: 4, xp: 350, total_focus_time: 14400 },
    { username: 'zeynep', bio: 'Sınav savaşçısı', level: 6, xp: 590, total_focus_time: 21600 }
];

demoUsers.forEach(user => {
    const exists = db.prepare('SELECT * FROM users WHERE username = ?').get(user.username);
    if (!exists) {
        db.prepare('INSERT INTO users (username, bio, level, xp, total_focus_time) VALUES (?, ?, ?, ?, ?)')
            .run(user.username, user.bio, user.level, user.xp, user.total_focus_time);
        console.log(`✓ ${user.username} oluşturuldu`);
    } else {
        console.log(`- ${user.username} zaten var`);
    }
});

// Demo postlar
console.log('\nDemo postlar oluşturuluyor...');

const demoPosts = [
    { username: 'ibrahim', content: '3 saat kesintisiz odak! Matematik finaline hazırım 💪' },
    { username: 'ayse', content: 'Kütüphanede çalışma keyfi 📚' },
    { username: 'mehmet', content: 'Bugün 5 saat çalıştım, seviye atladım! 🎉' },
    { username: 'zeynep', content: 'Sınava 2 gün kaldı, odak modundayım 🔥' },
    { username: 'samet', content: 'Yeni rekor! 4 saat kesintisiz odak 🚀' }
];

demoPosts.forEach(post => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(post.username);
    if (user) {
        db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(user.id, post.content);
        console.log(`✓ ${post.username} için post oluşturuldu`);
    }
});

console.log('\n✅ Demo veri hazır!');
console.log('Şimdi baslat.bat ile sunucuyu başlatabilirsin.\n');

db.close();
