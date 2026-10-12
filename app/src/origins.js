// Which websites may use the chatbot. Controlled from .env (ALLOWED_ORIGINS, comma separated),
// falling back to content/config.json "allowedOrigins". Empty = any website (fine for testing, not for production).
// In development, localhost is always allowed so you can test the demo page; set NODE_ENV=production on the server.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function toOrigin(value) {
  try {
    return new URL(String(value).trim()).origin; // "https://site.com/" and "https://site.com/page" -> "https://site.com"
  } catch {
    return null;
  }
}

export function parseOrigins(input) {
  const items = Array.isArray(input) ? input : String(input ?? '').split(',');
  const origins = new Set();
  const bad = [];
  for (const raw of items) {
    const item = String(raw).trim();
    if (!item) continue;
    const origin = toOrigin(item);
    if (origin) origins.add(origin);
    else bad.push(item);
  }
  if (bad.length) console.warn(`[origins] ignored invalid entries: ${bad.join(', ')} (use full URLs like https://example.com)`);
  return [...origins];
}

export function createOriginPolicy({ env = process.env, config = {} } = {}) {
  const fromEnv = parseOrigins(env.ALLOWED_ORIGINS);
  const list = fromEnv.length ? fromEnv : parseOrigins(config.allowedOrigins);
  const dev = env.NODE_ENV !== 'production';
  return {
    list,
    open: list.length === 0,
    source: fromEnv.length ? 'ALLOWED_ORIGINS' : list.length ? 'config.json' : null,
    allows(origin) {
      if (!list.length) return true;
      if (!origin) return false; // no Origin header = not a browser on an allowed site
      const o = toOrigin(origin);
      return Boolean(o) && (list.includes(o) || (dev && LOCAL.test(o)));
    },
  };
}
