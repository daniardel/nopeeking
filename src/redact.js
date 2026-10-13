// Hides secret values (and common encodings of them) in text before it reaches Claude.

export const MIN_SECRET_LENGTH = 4;

export function encodedForms(value) {
  const utf8 = Buffer.from(value, 'utf8');
  const base64 = utf8.toString('base64');
  const forms = [
    value,
    base64,
    base64.replace(/=+$/, ''),
    utf8.toString('base64url'),
    encodeURIComponent(value),
    utf8.toString('hex'),
    utf8.toString('hex').toUpperCase(),
    JSON.stringify(value).slice(1, -1),
  ];
  return [...new Set(forms)].filter((form) => form.length >= MIN_SECRET_LENGTH);
}

/** secrets: [{ name, value }] */
export function redact(text, secrets) {
  const str = String(text);
  // Find every occurrence of every form, including overlapping ones.
  const spans = [];
  for (const { name, value } of secrets) {
    for (const form of encodedForms(value)) {
      for (let i = str.indexOf(form); i !== -1; i = str.indexOf(form, i + 1)) {
        spans.push({ start: i, end: i + form.length, name });
      }
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  // Merge spans that overlap (not merely touch); a merged span keeps the name of its first span.
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  let out = '';
  let pos = 0;
  for (const { start, end, name } of merged) {
    out += str.slice(pos, start) + `••••(${name})`;
    pos = end;
  }
  return out + str.slice(pos);
}

/** Like redact, but when output was cut off, drops the tail where half a secret could sit (after redacting). */
export function redactOutput(text, secrets, { truncated = false } = {}) {
  const out = redact(String(text), secrets);
  if (!truncated) return out;
  const longest = Math.max(0, ...secrets.flatMap(({ value }) => encodedForms(value).map((f) => f.length)));
  return out.slice(0, Math.max(0, out.length - longest));
}
