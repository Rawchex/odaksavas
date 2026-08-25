const { getRedis, isRedisEnabled } = require('../redis');

/**
 * Express middleware to cache GET responses in Redis.
 * Useful for public endpoints or leaderboards that don't need realtime precision.
 * 
 * @param {number} durationSeconds - How long to cache the response (in seconds)
 */
function cacheMiddleware(durationSeconds) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!isRedisEnabled) return next(); // Skip caching if in-memory fallback is active

    // Generate cache key based on the original URL (includes query params)
    const key = `cache:${req.originalUrl || req.url}`;
    const redis = getRedis();

    try {
      const cached = await redis.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cached);
      }
    } catch (err) {
      console.error('[Cache Middleware] Redis GET error:', err.message);
    }

    res.setHeader('X-Cache', 'MISS');

    // Override res.json to capture the response body and cache it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        const payload = JSON.stringify(body);
        redis.setex(key, durationSeconds, payload).catch(err => {
          console.error('[Cache Middleware] Redis SETEX error:', err.message);
        });
      } catch (err) {
        console.error('[Cache Middleware] Serialize error:', err.message);
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = cacheMiddleware;
