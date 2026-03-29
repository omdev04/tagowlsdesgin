function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || 60 * 1000);
  const maxRequests = Number(options.maxRequests || 60);
  const store = new Map();

  return function rateLimiter(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || now > bucket.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfterMs: Math.max(0, bucket.resetAt - now),
      });
    }

    bucket.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
