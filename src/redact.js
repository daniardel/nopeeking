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

/** Sorted, non-overlapping [start, end) spans of every secret occurrence in str, each with its name. */
function mergedSpans(str, secrets) {
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
  return merged;
}

/** Writes str with each span replaced by its mask. */
function maskSpans(str, spans) {
  let out = '';
  let pos = 0;
  for (const { start, end, name } of spans) {
    out += str.slice(pos, start) + `••••(${name})`;
    pos = end;
  }
  return out + str.slice(pos);
}

/** secrets: [{ name, value }] */
export function redact(text, secrets) {
  const str = String(text);
  return maskSpans(str, mergedSpans(str, secrets));
}

/**
 * Like redact, but when output was cut off, drops the tail where half a secret could sit.
 * The cut is made in raw-text positions, so a mask is never cut in half.
 */
export function redactOutput(text, secrets, { truncated = false } = {}) {
  const str = String(text);
  const spans = mergedSpans(str, secrets);
  if (!truncated) return maskSpans(str, spans);
  const longest = Math.max(0, ...secrets.flatMap(({ value }) => encodedForms(value).map((f) => f.length)));
  let cut = Math.max(0, str.length - longest);
  // A span that straddles the cut is dropped whole, so no part of it is shown.
  const straddling = spans.find(({ start, end }) => start < cut && cut < end);
  if (straddling) cut = straddling.start;
  return maskSpans(str.slice(0, cut), spans.filter(({ end }) => end <= cut));
}
