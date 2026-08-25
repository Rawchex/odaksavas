const express = require('express');

const cacheMiddleware = require('../middleware/cache');

module.exports = function(db, auth, seasonManager, leaderboardService, medalEngine) {
  const router = express.Router();

  // GET /api/leagues/status
  router.get('/leagues/status', cacheMiddleware(15), (req, res) => {
    const status = seasonManager.getCurrentSeasonAndWeek();
    leaderboardService.getActiveLeagueOptions((err, options) => {
      res.json({
        ...status,
        options: options || { categories: [], activities: [] }
      });
    });
  });

  // GET /api/leaderboard/rival-message
  router.get('/leaderboard/rival-message', (req, res) => {
    const currentRank = parseInt(req.query.currentRank, 10);
    const previousRank = parseInt(req.query.previousRank, 10);
    const username = req.query.username || 'oyuncu';

    let messages = [];

    if (currentRank === 4) {
      if (previousRank === 1) {
        messages = [
          `Şampiyonluktan düşmek en acısıdır @${username}. Tahtını geri almak için hemen odaklan!`,
          `Zirvenin havası başkadır, dördüncülük sana yakışmıyor @${username}. Hemen toparlan.`,
          `Bir zamanlar birinciydin, şimdi podyumda bile değilsin. Bunu kendine yakıştırıyor musun @${username}?`,
          `Tahtı başkasına kaptırdın... Acilen eski formuna dönüp o birinciliği geri almalısın @${username}!`
        ];
      } else if (previousRank === 2 || previousRank === 3) {
        messages = [
          `Podyumdan kayıp düştün @${username}. O madalyayı başkasına mı kaptıracaksın?`,
          `İlk üçten düşmek can sıkar. Rakiplerin gaza basmış, sen de basmalısın @${username}.`,
          `Madalya bölgesindeydin ne güzel. Şimdi dışarıdan izliyorsun... Hemen bir seans başlat!`,
          `Podyumdan itildin ama henüz bitmedi. Yeniden çıkmak için bir fırsattır, hadi @${username}!`
        ];
      } else {
        messages = [
          `ilk üçte kalmak istikrar ister @${username}... öyle bir kere çıkayım sonra yan gelip yatayım da madalyamı alayım diyerek olmaazz!!`,
          `inan bana bu hissi yaşamalısın. podyum oradan çok yakın görünüyor, hadi biraz daha blunk!`,
          `dördüncülük en kötü sıradır @${username}. podyumu görüyorsun ama çıkamıyorsun. bence bu kadarla yetinmemelisin.`,
          `ufak bir odak seansıyla podyumdasın. buralarda takılmak sana göre değil, asıl yerin o ilk 3!`,
          `madalya bölgesine girmek üzeresin @${username}. biraz daha dişini sıkarsan o podyum senin.`,
          `tam podyumun sınırındasın. arkana bakma, sadece bir adım daha at ve o madalyayı al.`,
          `biliyorum yoruldun ama podyumdakiler de yoruldu @${username}. şimdi pes etmeyen kazanacak!`,
          `o bronz madalya seni bekliyor. bırakmak yok, hadi son bir gayret!`,
          `podyumu kaçırmak istemiyorsan hemen şimdi bir odak başlat @${username}. rakiplerin uyumuyor!`,
          `dördüncülük kimseye yetmez. podyuma çıkana kadar durmak yok!`,
          `sadece biraz daha... podyuma bu kadar yaklaşmışken geri dönmek sana yakışmaz @${username}.`,
          `madalyaya sadece bir adım kaldı. derin bir nefes al ve hemen masaya dön!`
        ];
      }
    } else {
      messages = [ `Üstünüzdeki rakibi geçmek için odaklanın!` ];
    }

    const msg = messages[Math.floor(Math.random() * messages.length)];
    return res.json({ message: msg });
  });

  // GET /api/leaderboard/leagues
  router.get('/leaderboard/leagues', cacheMiddleware(15), (req, res) => {
    const timeframe = req.query.timeframe || 'weekly';
    const league_type = req.query.league_type || 'overall';
    const league_name = req.query.league_name || 'Genel';
    const limit = parseInt(req.query.limit, 10) || 50;

    leaderboardService.getLeaderboard({ timeframe, league_type, league_name, limit }, (err, result) => {
      if (err) {
        console.error('[LEADERBOARD_API_ERROR]', err);
        return res.status(500).json({ error: 'Sıralama yüklenemedi: ' + err.message });
      }

      if (Array.isArray(result)) {
        return res.json({ leaderboard: result, meta: { is_active_league: true, qualifying_users_count: result.length, required_users: 6 } });
      }

      const leaderboard = (result && result.leaderboard) || [];
      const meta = (result && result.meta) || { is_active_league: true, qualifying_users_count: 0, required_users: 6 };
      res.json({ leaderboard, meta });
    });
  });

  // GET /api/users/:id/weekly-activity-breakdown
  router.get('/users/:id/weekly-activity-breakdown', (req, res) => {
    const userId = req.params.id;
    const currentUserId = req.query.currentUserId || null;
    leaderboardService.getUserWeeklyActivityBreakdown(userId, currentUserId, (err, data) => {
      if (err) return res.status(500).json({ error: 'Aktivite detayları yüklenemedi.' });
      res.json(data);
    });
  });

  // POST /api/users/:id/follow (Auth Required)
  router.post('/users/:id/follow', auth, (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.id;

    if (parseInt(followerId) === parseInt(followingId)) {
      return res.status(400).json({ error: 'Kendi kendinizi takip edemezsiniz.' });
    }

    leaderboardService.toggleUserFollow(followerId, followingId, (err, result) => {
      if (err) return res.status(400).json({ error: err.message || 'İşlem başarısız.' });
      res.json(result);
    });
  });

  // GET /api/users/:id/all-time-calendar
  router.get('/users/:id/all-time-calendar', (req, res) => {
    const userId = req.params.id;
    const year = req.query.year;
    const month = req.query.month;

    leaderboardService.getUserAllTimeCalendar(userId, year, month, (err, data) => {
      if (err) return res.status(500).json({ error: 'Takvim verileri yüklenemedi.' });
      res.json(data);
    });
  });

  // GET /api/users/:id/medals
  router.get('/users/:id/medals', (req, res) => {
    medalEngine.getUserMedals(req.params.id, (err, medals) => {
      if (err) return res.status(500).json({ error: 'Madalyalar yüklenemedi.' });
      res.json({ medals });
    });
  });

  // GET /api/users/:id/public-medals
  router.get('/users/:id/public-medals', (req, res) => {
    medalEngine.getPublicShowcasedMedals(req.params.id, (err, medals) => {
      if (err) return res.status(500).json({ error: 'Sergilenen madalyalar yüklenemedi.' });
      res.json({ medals });
    });
  });

  // POST /api/users/me/medals/:id/toggle-showcase
  router.post('/users/me/medals/:id/toggle-showcase', auth, (req, res) => {
    medalEngine.toggleMedalShowcase(req.user.id, req.params.id, (err, result) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json(result);
    });
  });

  return router;
};
