// Hides secret values (and common encodings of them) in text before it reaches Claude.
//
// Windows PowerShell 5.1 does not always print a value in one piece: Format-List, warnings and the error view wrap long
// values onto the next line (often indented), tables cut them off with '...', and an error's CategoryInfo shortens any
// text over 40 characters to its first and last 15 ('abc...xyz'). So besides every whole form, this masks:
// - pieces: any PIECE_LENGTH or more characters in a row of any form, wherever they appear;
// - line joins: the same search with line breaks (and the spaces around them) removed, so a wrapped tail shorter than
//   PIECE_LENGTH is masked together with the rest of the value, line break included;
// - ellipsis edges: the first or last EDGE_MIN..EDGE_MAX characters of a form, right before or after '...' or '…'.
// Base64 is searched for at each of the three byte alignments, so a value encoded after other text (as in an
// 'Authorization: Basic' header for 'user:token') is found too. Shorter pieces elsewhere, other encodings and values a
// command reshapes on purpose are not caught.

export const MIN_SECRET_LENGTH = 4;

const PIECE_LENGTH = 8;
const EDGE_MIN = 3;
const EDGE_MAX = PIECE_LENGTH - 1;
const isBlank = (ch) => ch === ' ' || ch === '\t';
const ELLIPSIS_RE = /\.\.\.|…/g;

const percent = (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
const lowerHex = (str) => str.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());

// Base64 of bytes that start at byte offset 0, 1 or 2 of a longer encoded run, cut to the characters that depend on these
// bytes alone: base64 turns 3 bytes into 4 characters, so the characters that also hold bits of the bytes around them
// (2 or 3 at the start, 1 at an unfinished end) change with whatever comes before and after.
function base64Inside(bytes, offset, encoding) {
  const padded = Buffer.concat([Buffer.alloc(offset), bytes]);
  const text = padded.toString(encoding).replace(/=+$/, '');
  return text.slice([0, 2, 3][offset], padded.length % 3 === 0 ? text.length : text.length - 1);
}

const base64Aligned = (bytes) =>
  ['base64', 'base64url'].flatMap((encoding) => [0, 1, 2].map((offset) => base64Inside(bytes, offset, encoding)));

export function encodedForms(value) {
  const utf8 = Buffer.from(value, 'utf8');
  // UTF-16LE: what [Text.Encoding]::Unicode, Out-File in Windows PowerShell 5.1 and -EncodedCommand use.
  const utf16 = Buffer.from(value, 'utf16le');
  const base64 = utf8.toString('base64');
  const uri = encodeURIComponent(value);
  const json = JSON.stringify(value).slice(1, -1);
  const forms = [
    value,
    base64,
    base64.replace(/=+$/, ''),
    utf8.toString('base64url'),
    uri,
    lowerHex(uri),
    uri.replace(/[!'()*]/g, percent), // [Uri]::EscapeDataString in PowerShell 7 (.NET Core and later)
    lowerHex(uri.replace(/['~]/g, percent).replace(/%20/g, '+')), // [System.Web.HttpUtility]::UrlEncode
    utf8.toString('hex'),
    utf8.toString('hex').toUpperCase(),
    json,
    // ConvertTo-Json in Windows PowerShell 5.1 also escapes these four.
    json.replace(/[<>&']/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')),
    ...base64Aligned(utf8),
    utf16.toString('base64'),
    ...base64Aligned(utf16),
    utf16.toString('hex'),
    utf16.toString('hex').toUpperCase(),
  ];
  // UTF-16LE text read back as UTF-8 shows each ASCII character followed by a NUL.
  if (/^[\x20-\x7e]+$/.test(value)) forms.push(utf16.toString('latin1'));
  return [...new Set(forms)].filter((form) => form.length >= MIN_SECRET_LENGTH);
}

/** What to look for. Each piece and edge maps to the name of the first secret it belongs to. */
function searchFor(secrets) {
  const forms = []; // { form, name }
  const pieces = new Map(); // every PIECE_LENGTH-character piece of every longer form
  const prefixes = new Map(); // the first EDGE_MIN..EDGE_MAX characters of every form
  const suffixes = new Map(); // the last EDGE_MIN..EDGE_MAX characters of every form
  const remember = (map, key, name) => {
    if (!map.has(key)) map.set(key, name);
  };
  for (const { name, value } of secrets) {
    for (const form of encodedForms(value)) {
      forms.push({ form, name });
      if (form.length > PIECE_LENGTH) {
        for (let i = 0; i + PIECE_LENGTH <= form.length; i++) remember(pieces, form.slice(i, i + PIECE_LENGTH), name);
      }
      for (let k = EDGE_MIN; k <= Math.min(EDGE_MAX, form.length); k++) {
        remember(prefixes, form.slice(0, k), name);
        remember(suffixes, form.slice(-k), name);
      }
    }
  }
  return { forms, pieces, prefixes, suffixes };
}

/**
 * Every [start, end) span of str where a secret shows, with its name. Unsorted and possibly overlapping.
 * Spans of one secret that overlap the one found just before are joined right away, which keeps the list short.
 */
function findSpans(str, { forms, pieces, prefixes, suffixes }) {
  const spans = [];
  const add = (start, end, name) => {
    const last = spans.at(-1);
    if (last?.name === name && start >= last.start && start < last.end) last.end = Math.max(last.end, end);
    else spans.push({ start, end, name });
  };
  // Whole forms, including overlapping occurrences.
  for (const { form, name } of forms) {
    for (let i = str.indexOf(form); i !== -1; i = str.indexOf(form, i + 1)) add(i, i + form.length, name);
  }
  // Pieces, in one pass over the text.
  if (pieces.size > 0) {
    for (let i = 0; i + PIECE_LENGTH <= str.length; i++) {
      const name = pieces.get(str.slice(i, i + PIECE_LENGTH));
      if (name !== undefined) add(i, i + PIECE_LENGTH, name);
    }
  }
  // The longest prefix that ends right at an ellipsis, and the longest suffix that starts right after it.
  for (const match of str.matchAll(ELLIPSIS_RE)) {
    const before = match.index;
    const after = before + match[0].length;
    for (let k = Math.min(EDGE_MAX, before); k >= EDGE_MIN; k--) {
      const name = prefixes.get(str.slice(before - k, before));
      if (name !== undefined) {
        add(before - k, before, name);
        break;
      }
    }
    for (let k = Math.min(EDGE_MAX, str.length - after); k >= EDGE_MIN; k--) {
      const name = suffixes.get(str.slice(after, after + k));
      if (name !== undefined) {
        add(after, after + k, name);
        break;
      }
    }
  }
  return spans;
}

/** str without its line breaks and the spaces and tabs around them, and for each of its characters, where it came from. */
function withoutLineBreaks(str) {
  const from = new Int32Array(str.length);
  const parts = [];
  let length = 0;
  let pos = 0;
  // Each '\n' widened by hand over an optional '\r' and the spaces and tabs around it. A regex such as
  // /[ \t]*\r?\n[ \t]*/g retries from every blank of a long run with no line break after it, which takes quadratic time.
  for (let nl = str.indexOf('\n'); nl !== -1; nl = str.indexOf('\n', pos)) {
    let start = nl;
    if (start > pos && str[start - 1] === '\r') start--;
    while (start > pos && isBlank(str[start - 1])) start--;
    let end = nl + 1;
    while (end < str.length && isBlank(str[end])) end++;
    for (let i = pos; i < start; i++) from[length++] = i;
    parts.push(str.slice(pos, start));
    pos = end;
  }
  if (parts.length === 0) return null;
  for (let i = pos; i < str.length; i++) from[length++] = i;
  parts.push(str.slice(pos));
  return { text: parts.join(''), from };
}

const isHigh = (code) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code) => code >= 0xdc00 && code <= 0xdfff;

/** Sorted, non-overlapping [start, end) spans of everything in str that belongs to a secret, each with its name. */
function mergedSpans(str, secrets) {
  const patterns = searchFor(secrets);
  const spans = findSpans(str, patterns);
  // The same search across line breaks. Spans that cross a break are mapped back over it, so the break is masked too.
  const joined = withoutLineBreaks(str);
  if (joined) {
    for (const { start, end, name } of findSpans(joined.text, patterns)) {
      const from = joined.from[start];
      const to = joined.from[end - 1] + 1;
      if (to - from > end - start) spans.push({ start: from, end: to, name });
    }
  }
  // A piece can begin or end in the middle of a character that takes two UTF-16 units; mask the whole character.
  for (const span of spans) {
    if (isLow(str.charCodeAt(span.start)) && isHigh(str.charCodeAt(span.start - 1))) span.start -= 1;
    if (isHigh(str.charCodeAt(span.end - 1)) && isLow(str.charCodeAt(span.end))) span.end += 1;
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
