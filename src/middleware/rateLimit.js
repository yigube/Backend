// Rate limit in-memory para endpoint de login.
const buckets = new Map();

export function rateLimitLogin({ windowMs = 15 * 60 * 1000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'] || 'anon';
    const now = Date.now();
    const entry = buckets.get(key) || { count: 0, reset: now + windowMs };

    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > max) {
      const retry = Math.ceil((entry.reset - now) / 1000);
      res.setHeader('Retry-After', retry);
      return res.status(429).json({ error: 'Demasiados intentos, intenta mas tarde' });
    }

    next();
  };
}
