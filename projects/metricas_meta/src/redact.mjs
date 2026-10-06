const SENSITIVE_KEY = /^(?:token|access[_-]?token|auth[_-]?token|authorization|api[_-]?key|secret|values)$/i;

export function redactText(value, secret) {
  let text = String(value);
  if (secret) text = text.replaceAll(secret, '[REDACTED]');
  return text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(["']?)((?:token|access[_-]?token|auth[_-]?token|authorization|api[_-]?key|secret|values))\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|\[[^\]]*\]|\{[^}]*\}|[^&\s,;]+)/gi, '$1$2$1=[REDACTED]');
}

export function redact(value, secret) {
  if (typeof value === 'string') return redactText(value, secret);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, entry]) => [key, redact(entry, secret)]));
  }
  return value;
}
