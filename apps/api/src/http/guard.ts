/** Guards for the public API: an admin token for what destroys data, a rate for what costs money. */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { AppError } from '../lib/common';
import type { Deps } from '../services/deps';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Requires `Authorization: Bearer <ADMIN_TOKEN>`. Without a configured token the route is closed
 * in the demo (a public deploy) and open on a local radar.
 */
export function requireAdmin(deps: Deps): MiddlewareHandler {
  return async (c, next) => {
    const token = deps.config.ADMIN_TOKEN;
    if (!token) {
      if (deps.config.DEMO_MODE)
        throw new AppError(403, 'forbidden', 'Esta acción está cerrada en la demo pública.');
      return next();
    }
    const given = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
    // Equal-length digests, so the comparison takes the same time whatever was sent.
    if (!timingSafeEqual(digest(given), digest(token)))
      throw new AppError(401, 'unauthorized', 'Esta acción necesita el token de administración.');
    return next();
  };
}

/** The visitor's address: the first hop a proxy (Railway, Vercel) recorded, else the socket's. */
function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/**
 * At most `limit` requests per visitor in a sliding window, shared by every route it guards.
 * ponytail: in-memory and per process; a store shared across instances if the API scales out.
 */
export function rateLimit(deps: Deps, limit = 20, windowMs = 3_600_000): MiddlewareHandler {
  const hits = new Map<string, number[]>();
  return async (c, next) => {
    const now = deps.clock.now().getTime();
    const ip = clientIp(c);
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(ip, recent);
      throw new AppError(
        429,
        'rate_limited',
        'Llegaste al límite de consultas por hora de la demo. Intenta más tarde.',
      );
    }
    recent.push(now);
    hits.set(ip, recent);
    // Forget visitors whose window is over, so the map does not grow without bound.
    if (hits.size > 10_000)
      for (const [key, times] of hits)
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
    return next();
  };
}
