import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens, tokensToCss, validateTokens } from '../scripts/brand/tokens.js';
import { writeAtomic } from '../scripts/brand/write.js';
import { ICON_SIZES, decodeIco, encodeIco, pngSize } from '../scripts/brand/ico.js';
import { lockupSvg, svgInner } from '../scripts/brand/compose.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const lf = (s) => s.replace(/\r\n/g, '\n'); // git on Windows may check text files out with CRLF

test('brand/web/tokens.css is up to date with brand/tokens.json', () => {
  assert.equal(lf(readFileSync(root('brand/web/tokens.css'), 'utf8')), tokensToCss(readTokens()), 'run `npm run brand`');
});

test('tokens.css holds the brand colours, shadows and self-hosted fonts', () => {
  const css = tokensToCss(readTokens());
  assert.match(css, /--pc-violet: #5B2EFF;/);
  assert.match(css, /--pc-radius-pill: 999px;/);
  assert.match(css, /--pc-shadow-button: 5px 5px 0 var\(--pc-ink\);/);
  assert.match(css, /--pc-font-display: 'Bricolage Grotesque', system-ui, sans-serif;/);
  assert.match(css, /src: url\('fonts\/BricolageGrotesque-ExtraBold\.woff2'\) format\('woff2'\);/);
  assert.doesNotMatch(css, /\r|https?:/, 'LF only, and nothing loaded from another site');
});

test('a colour that is not #RRGGBB in capitals is refused by name', () => {
  for (const bad of ['#5b2eff', '#FFF', 'violet']) {
    const t = readTokens();
    t.color.violet = bad;
    assert.throws(() => validateTokens(t), new RegExp(`color "violet": "${bad}" is not #RRGGBB`));
  }
});

test('a shadow naming a colour that does not exist is refused', () => {
  const t = readTokens();
  t.shadow.card.color = 'purple';
  assert.throws(() => validateTokens(t), /shadow "card": no color named "purple"/);
});

test('a missing section is refused', () => {
  for (const key of ['color', 'radius', 'shadow', 'font']) {
    const t = readTokens();
    delete t[key];
    assert.throws(() => validateTokens(t), new RegExp(`missing "${key}"`));
  }
});

test('writeAtomic writes and replaces a file, leaving no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-brand-'));
  try {
    const target = join(dir, 'sub', 'out.txt');
    writeAtomic(target, 'one');
    writeAtomic(target, 'two');
    assert.equal(readFileSync(target, 'utf8'), 'two');
    assert.deepEqual(readdirSync(join(dir, 'sub')), ['out.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeAtomic leaves the old file and no temp file when it fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-brand-'));
  try {
    const target = join(dir, 'taken');
    mkdirSync(target); // a folder where the file should go: the rename fails
    writeFileSync(join(target, 'keep.txt'), 'kept');
    assert.throws(() => writeAtomic(target, 'x'), /could not write .*taken/);
    assert.deepEqual(readdirSync(dir), ['taken']);
    assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'kept');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const LOGOS = ['mark', 'mark-yellow', 'mark-mono', 'face-saved', 'face-error', 'face-expired', 'lockup', 'lockup-on-violet'];

test('every logo file is a self-contained SVG in brand colours, with no live text', () => {
  const palette = new Set(Object.values(readTokens().color));
  for (const name of LOGOS) {
    const svg = lf(readFileSync(root(`brand/logo/${name}.svg`), 'utf8'));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="[\d. ]+"/, name);
    assert.match(svg, /<\/svg>\n$/, name);
    assert.doesNotMatch(svg, /<text|<image|<style|<script|<foreignObject/, name);
    for (const hex of svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) assert.ok(palette.has(hex), `${name}: ${hex} is not a brand colour`);
  }
});

const fontRoles = Object.values(readTokens().font);

test('every font weight in tokens.json has its .ttf and .woff2, with the licence beside them', () => {
  for (const f of fontRoles) {
    const licence = `OFL-${f.family.replace(/ /g, '')}.txt`;
    for (const dir of ['assets/fonts', 'brand/web/fonts']) {
      assert.match(readFileSync(root(`${dir}/${licence}`), 'utf8'), /SIL Open Font License, Version 1\.1/, `${dir}/${licence}`);
    }
    for (const file of Object.values(f.files)) {
      assert.equal(readFileSync(root(`assets/fonts/${file}.ttf`)).readUInt32BE(0), 0x00010000, `${file}.ttf`);
      assert.equal(readFileSync(root(`brand/web/fonts/${file}.woff2`)).subarray(0, 4).toString('latin1'), 'wOF2', `${file}.woff2`);
    }
  }
});

test('no font file is shipped without an entry in tokens.json', () => {
  const known = new Set(fontRoles.flatMap((f) => Object.values(f.files)));
  for (const dir of ['assets/fonts', 'brand/web/fonts']) {
    for (const name of readdirSync(root(dir))) {
      if (name.startsWith('OFL-')) continue;
      assert.ok(known.has(name.replace(/\.(ttf|woff2)$/, '')), `${dir}/${name} is not in brand/tokens.json`);
    }
  }
});

test('outlines.json has every text the generated images need', () => {
  const o = JSON.parse(readFileSync(root('brand/build/outlines.json'), 'utf8'));
  for (const key of ['wordmark', 'tagline1', 'tagline2', 'footnote']) {
    assert.match(o[key].d, /^M/, key);
    assert.equal(o[key].box.length, 4, key);
    assert.equal(o[key].unitsPerEm, 1000, key);
  }
  assert.equal(o.wordmark.text, 'passClaude');
});

/** The first 24 bytes of a PNG: signature, IHDR length and type, width, height. Enough for pngSize. */
function fakePng(width, height) {
  const b = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

test('encodeIco stores 256 px as 0 and decodeIco reads it back', () => {
  const images = [16, 256].map((size) => ({ size, png: fakePng(size, size) }));
  const ico = encodeIco(images);
  assert.equal(ico.readUInt8(6 + 16), 0, 'width byte of the 256 px entry');
  assert.equal(ico.readUInt8(6 + 16 + 1), 0, 'height byte of the 256 px entry');
  assert.deepEqual(decodeIco(ico).map(({ size, png }) => [size, pngSize(png).width]), [[16, 16], [256, 256]]);
});

test('encodeIco refuses sizes Windows icons cannot hold', () => {
  for (const size of [0, 300, 12.5]) {
    assert.throws(() => encodeIco([{ size, png: fakePng(1, 1) }]), /icon size .* is not 1–256/);
  }
});

test('assets/passclaude.ico holds every size, each a PNG of that size', () => {
  const entries = decodeIco(readFileSync(root('assets/passclaude.ico')));
  assert.deepEqual(entries.map((e) => e.size), ICON_SIZES);
  for (const { size, png } of entries) assert.deepEqual(pngSize(png), { width: size, height: size });
});

test('lockupSvg puts the mark and the outlined wordmark side by side', () => {
  const mark = readFileSync(root('brand/logo/mark.svg'), 'utf8');
  const wordmark = { text: 'x', unitsPerEm: 1000, d: 'M0 0L10 0L10 -10Z', box: [0, -700, 1000, 200] };
  const svg = lockupSvg(mark, wordmark, '#17132E');
  assert.ok(svg.includes(svgInner(mark)));
  assert.match(svg, /viewBox="0 0 \d+ 64"/);
  assert.match(svg, /<path transform="translate\([\d.-]+ [\d.-]+\) scale\([\d.]+\)" fill="#17132E" d="M0 0L10 0L10 -10Z"\/>/);
});

test('svgInner refuses something that is not an SVG', () => {
  assert.throws(() => svgInner('<html></html>'), /not an SVG file/);
});

test('brand/social-preview.png is 1280×640', () => {
  assert.deepEqual(pngSize(readFileSync(root('brand/social-preview.png'))), { width: 1280, height: 640 });
});

test('the npm package ships assets/ and leaves the brand sources out', () => {
  const out = execSync('npm pack --dry-run --json --ignore-scripts', { cwd: root('.'), encoding: 'utf8' });
  const paths = JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, '/'));
  assert.ok(paths.includes('assets/passclaude.ico'), 'icon');
  for (const f of fontRoles) {
    assert.ok(paths.includes(`assets/fonts/OFL-${f.family.replace(/ /g, '')}.txt`), `${f.family} licence`);
    for (const file of Object.values(f.files)) assert.ok(paths.includes(`assets/fonts/${file}.ttf`), file);
  }
  assert.deepEqual(paths.filter((p) => p.startsWith('brand/') || p.startsWith('scripts/')), []);
});
