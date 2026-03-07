function parseCorsEntries(rawOrigins) {
  return String(rawOrigins || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function toRule(entry) {
  if (entry === '*') return { type: 'all' };

  if (entry.endsWith(':*')) {
    const base = entry.slice(0, -2);
    try {
      const parsed = new URL(base);
      return {
        type: 'host-any-port',
        protocol: parsed.protocol,
        hostname: parsed.hostname
      };
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(entry);
    return { type: 'exact', origin: parsed.origin };
  } catch {
    return null;
  }
}

function isOriginAllowed(origin, rules) {
  if (!origin) return true;

  let requestOrigin;
  try {
    requestOrigin = new URL(origin);
  } catch {
    return false;
  }

  for (const rule of rules) {
    if (!rule) continue;
    if (rule.type === 'all') return true;
    if (rule.type === 'exact' && rule.origin === requestOrigin.origin) return true;
    if (
      rule.type === 'host-any-port' &&
      rule.protocol === requestOrigin.protocol &&
      rule.hostname === requestOrigin.hostname
    ) {
      return true;
    }
  }
  return false;
}

export function createCorsOriginOption(rawOrigins) {
  const entries = parseCorsEntries(rawOrigins);
  if (!entries.length) return '*';

  const rules = entries.map(toRule).filter(Boolean);
  if (!rules.length) return '*';

  return (origin, callback) => {
    callback(null, isOriginAllowed(origin, rules));
  };
}
