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
  const pairs = secrets.flatMap(({ name, value }) =>
    encodedForms(value).map((form) => ({ form, mask: `••••(${name})` })));
  pairs.sort((a, b) => b.form.length - a.form.length);
  let out = String(text);
  for (const { form, mask } of pairs) out = out.split(form).join(mask);
  return out;
}

/** Like redact, but when output was cut off, first drops the tail where half a secret could sit. */
export function redactOutput(text, secrets, { truncated = false } = {}) {
  if (!truncated) return redact(text, secrets);
  const longest = Math.max(0, ...secrets.flatMap(({ value }) => encodedForms(value).map((f) => f.length)));
  return redact(text.slice(0, Math.max(0, text.length - longest)), secrets);
}
