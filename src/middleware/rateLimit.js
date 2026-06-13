// Rate limit in-memory para endpoints de autenticacion.
const bucketsByLimiter = new Set();

export function resetLoginRateLimitBuckets() {
  bucketsByLimiter.forEach((buckets) => buckets.clear());
}

function createInMemoryRateLimiter({
  windowMs,
  max,
  keyGenerator,
  errorMessage
}) {
  const buckets = new Map();
  bucketsByLimiter.add(buckets);
  return (req, res, next) => {
    const key = keyGenerator(req);
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
      return res.status(429).json({ error: errorMessage });
    }

    next();
  };
}

export function rateLimitLogin({ windowMs = 15 * 60 * 1000, max = 30 } = {}) {
  return createInMemoryRateLimiter({
    windowMs,
    max,
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'anon',
    errorMessage: 'Demasiados intentos, intenta mas tarde'
  });
}

export function rateLimitPasswordReset({ windowMs = 60 * 60 * 1000, max = 5 } = {}) {
  return createInMemoryRateLimiter({
    windowMs,
    max,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'anon';
      const email = String(req.body?.email || '').trim().toLowerCase();
      return `${ip}|${email || 'no-email'}`;
    },
    errorMessage: 'Demasiados intentos de restablecimiento, intenta mas tarde'
  });
}
