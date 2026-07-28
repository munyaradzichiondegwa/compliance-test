import { Request, Response, NextFunction } from 'express';

// Lightweight in-memory sliding-window rate limiter — no external dependency
// needed for a single-instance deployment. Applied to authentication
// endpoints (login, MFA challenge/setup) to blunt brute-force attempts
// against a government anti-corruption system's staff accounts.
//
// Production note: for a multi-instance deployment behind a load balancer,
// replace the in-memory Map below with a shared store (e.g. Redis) so limits
// are enforced consistently across instances. Documented in README.md.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map doesn't grow unbounded over a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > 10 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = (req.body && req.body.email ? String(req.body.email).toLowerCase() : req.ip) || 'unknown';
    const key = `${options.keyPrefix}:${identity}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > options.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSec = Math.ceil((options.windowMs - (now - bucket.windowStart)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: `Too many attempts. Please try again in ${retryAfterSec} seconds.` });
    }
    next();
  };
}
