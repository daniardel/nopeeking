// Builds the lockup and social-preview SVGs from the mark and the outlined text. Strings in, strings out.
// Outlines are in font units with the baseline at y = 0 and y growing down (see scripts/brand/make-fonts.py).
const MARK = 64; // the mark's box
const GAP = 14; // between the mark and the wordmark
const TEXT_H = 44; // the wordmark's outline box is scaled to this height…
const BODY_MID = 41; // …and centred on the padlock body (y 24 to 58)

const r = (n, digits = 2) => Number(n.toFixed(digits));

/** Everything between <svg …> and </svg>. */
export function svgInner(svg) {
  const m = /^\s*<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg);
  if (!m) throw new Error('not an SVG file');
  return m[1].trim();
}

export function lockupSvg(markSvg, wordmark, color) {
  const [x0, y0, x1, y1] = wordmark.box;
  const s = TEXT_H / (y1 - y0);
  const width = Math.ceil(MARK + GAP + (x1 - x0) * s);
  const tx = MARK + GAP - x0 * s;
  const ty = BODY_MID - TEXT_H / 2 - y0 * s;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${MARK * 2}" viewBox="0 0 ${width} ${MARK}" role="img" aria-label="NoPeeking">`,
    `  ${svgInner(markSvg)}`,
    `  <path transform="translate(${r(tx)} ${r(ty)}) scale(${r(s, 5)})" fill="${color}" d="${wordmark.d}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

/** 1280×640 image for GitHub's social preview: lockup top left, the tagline in two lines, a footnote. */
export function socialSvg(markSvg, o, c) {
  const text = (t, x, baseline, px, fill) =>
    `<path transform="translate(${x} ${baseline}) scale(${r(px / t.unitsPerEm, 5)})" fill="${fill}" d="${t.d}"/>`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">',
    `  <rect width="1280" height="640" fill="${c.violet}"/>`,
    `  <circle cx="1130" cy="110" r="360" fill="none" stroke="${c.white}" stroke-opacity="0.12" stroke-width="2"/>`,
    `  <circle cx="1130" cy="110" r="260" fill="none" stroke="${c.white}" stroke-opacity="0.12" stroke-width="2"/>`,
    `  <circle cx="1130" cy="110" r="170" fill="${c.yellow}" fill-opacity="0.16"/>`,
    `  <g transform="translate(96 84) scale(1.5)">${svgInner(markSvg)}</g>`,
    `  ${text(o.wordmark, 214, 172, 64, c.white)}`,
    `  ${text(o.tagline1, 96, 384, 88, c.white)}`,
    `  ${text(o.tagline2, 96, 482, 88, c.yellow)}`,
    `  ${text(o.footnote, 96, 566, 28, c['muted-on-dark'])}`,
    '</svg>',
    '',
  ].join('\n');
}
