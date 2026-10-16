import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { checkFonts, iconIco, lockups, socialPng } from '../scripts/brand/build.js';
import { fontFiles, readTokens, tokensToCss, tokensToXaml, validateTokens } from '../scripts/brand/tokens.js';
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

test('a colour the generated images use cannot be renamed away', () => {
  for (const name of ['violet', 'yellow', 'ink', 'white', 'muted-on-dark']) {
    const t = readTokens();
    t.color[`${name}-renamed`] = t.color[name];
    delete t.color[name];
    assert.throws(() => validateTokens(t), new RegExp(`missing color "${name}"`));
  }
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
  const files = readdirSync(root('brand/logo'));
  for (const name of LOGOS) assert.ok(files.includes(`${name}.svg`), `brand/logo/${name}.svg`);
  assert.deepEqual(files.filter((f) => !f.endsWith('.svg')), [], 'brand/logo holds only SVGs');
  for (const name of files.map((f) => f.replace(/\.svg$/, ''))) {
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

test('the font folders hold exactly the files tokens.json names: .ttf in assets, .woff2 for the web, and the licences', () => {
  const wanted = fontFiles(readTokens());
  for (const dir of ['assets/fonts', 'brand/web/fonts']) {
    const expected = wanted.filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)).sort();
    assert.deepEqual(readdirSync(root(dir)).sort(), expected, dir);
  }
});

test('fontFiles names each weight in the right folder and format, and one licence per family', () => {
  const t = readTokens();
  t.font = { display: { family: 'Big Font', fallback: 'serif', files: { 800: 'BigFont-Black' } } };
  assert.deepEqual(fontFiles(t).sort(), [
    'assets/fonts/BigFont-Black.ttf', 'assets/fonts/OFL-BigFont.txt', 'brand/web/fonts/BigFont-Black.woff2', 'brand/web/fonts/OFL-BigFont.txt',
  ]);
});

test('the brand build stops before writing anything when a font file is missing', () => {
  const t = readTokens();
  t.font.display.files[900] = 'NoSuchFont-Black';
  assert.throws(() => checkFonts(t), /missing font files: assets\/fonts\/NoSuchFont-Black\.ttf, brand\/web\/fonts\/NoSuchFont-Black\.woff2/);
  assert.doesNotThrow(() => checkFonts(readTokens()));
});

test('names used in generated CSS and XAML are refused when they could break out of them', () => {
  const cases = [
    [(t) => { t.radius['Big Radius'] = 4; }, /radius "Big Radius": names are lower-case/],
    [(t) => { t.shadow['card}'] = t.shadow.card; }, /shadow "card}": names are lower-case/],
    [(t) => { t.font['Display'] = t.font.display; }, /font "Display": names are lower-case/],
    [(t) => { t.font.display.family = "Evil'; } body { x: '"; }, /font "display": family "Evil'; } body \{ x: '" is not letters, digits and spaces/],
    [(t) => { t.font.display.fallback = 'serif; } *{'; }, /font "display": fallback "serif; } \*\{" is not a list of font names/],
  ];
  for (const [spoil, error] of cases) {
    const t = readTokens();
    spoil(t);
    assert.throws(() => validateTokens(t), error);
  }
  assert.doesNotThrow(() => validateTokens(readTokens()));
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
  assert.deepEqual(decodeIco(ico).map(({ size, format, data }) => [size, format, pngSize(data).width]), [[16, 'png', 16], [256, 'png', 256]]);
});

test('encodeIco stores small sizes as 32-bit bitmaps, bottom row first in BGRA, with an empty mask', () => {
  // 2×2: red, green on top; blue, half-clear white below.
  const rgba = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128]);
  const ico = encodeIco([{ size: 2, rgba }]);
  const [entry] = decodeIco(ico);
  assert.equal(entry.format, 'bmp');
  const dib = entry.data;
  assert.equal(dib.readUInt32LE(0), 40, 'BITMAPINFOHEADER');
  assert.equal(dib.readInt32LE(4), 2);
  assert.equal(dib.readInt32LE(8), 4, 'height counts the mask too');
  assert.equal(dib.readUInt16LE(14), 32, 'bits per pixel');
  assert.deepEqual([...dib.subarray(40, 56)], [255, 0, 0, 255, 255, 255, 255, 128, 0, 0, 255, 255, 0, 255, 0, 255]);
  assert.deepEqual([...dib.subarray(56)], [0, 0, 0, 0, 0, 0, 0, 0], 'one 4-byte mask row per pixel row');
  assert.equal(ico.readUInt32LE(6 + 8), dib.length, 'directory size matches');
});

test('encodeIco refuses pixels that do not match the size', () => {
  assert.throws(() => encodeIco([{ size: 2, rgba: Buffer.alloc(15) }]), /2 px icon needs 16 bytes of RGBA/);
});

test('encodeIco refuses sizes Windows icons cannot hold', () => {
  for (const size of [0, 300, 12.5]) {
    assert.throws(() => encodeIco([{ size, png: fakePng(1, 1) }]), /icon size .* is not 1–256/);
  }
});

test('assets/passclaude.ico holds every size: bitmaps under 256 px, as older Windows code needs, and a 256 px PNG', () => {
  const entries = decodeIco(readFileSync(root('assets/passclaude.ico')));
  assert.deepEqual(entries.map((e) => e.size), ICON_SIZES);
  for (const { size, format, data } of entries) {
    if (size === 256) {
      assert.equal(format, 'png');
      assert.deepEqual(pngSize(data), { width: size, height: size });
    } else {
      assert.equal(format, 'bmp', `${size} px`);
      assert.deepEqual([data.readInt32LE(4), data.readInt32LE(8)], [size, size * 2], `${size} px`);
    }
  }
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

test('src/ps/brand.xaml is up to date with brand/tokens.json', () => {
  assert.equal(lf(readFileSync(root('src/ps/brand.xaml'), 'utf8')), tokensToXaml(readTokens()), 'run `npm run brand`');
});

test('brand.xaml gives WPF a brush per colour and the shape tokens, keyed in PascalCase', () => {
  const xaml = tokensToXaml(readTokens());
  assert.match(xaml, /<SolidColorBrush x:Key="Violet" Color="#5B2EFF"\/>/);
  assert.match(xaml, /<SolidColorBrush x:Key="MutedOnDark" Color="#CFC6EE"\/>/);
  assert.match(xaml, /<SolidColorBrush x:Key="Lilac200" Color="#DCD3FF"\/>/);
  assert.match(xaml, /<CornerRadius x:Key="RadiusMd">16<\/CornerRadius>/);
  assert.match(xaml, /<Thickness x:Key="Outline">2<\/Thickness>/);
  assert.match(xaml, /<Thickness x:Key="ShadowButton">5,5,0,0<\/Thickness>/);
  assert.doesNotMatch(xaml, /\r/);
});

test('the lockups are up to date with the mark, the outlines and tokens.json', () => {
  for (const [path, svg] of Object.entries(lockups())) assert.equal(lf(readFileSync(root(path), 'utf8')), svg, `${path}: run \`npm run brand\``);
});

/** Same size, and almost every channel of every pixel within a small step: another sharp version may smooth edges differently. */
function assertLooksSame(a, b, what) {
  assert.equal(a.length, b.length, `${what}: size`);
  let off = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 16) off++;
  assert.ok(off / a.length < 0.005, `${what}: ${off} of ${a.length} bytes differ, run \`npm run brand\``);
}
const rawPixels = async (png) => (await sharp(png).ensureAlpha().raw().toBuffer());

test('assets/passclaude.ico is up to date with the mark', async () => {
  const fresh = decodeIco(await iconIco());
  const shipped = decodeIco(readFileSync(root('assets/passclaude.ico')));
  assert.deepEqual(shipped.map((e) => [e.size, e.format]), fresh.map((e) => [e.size, e.format]));
  for (const [i, { size, format, data }] of shipped.entries()) {
    if (format === 'bmp') assertLooksSame(data, fresh[i].data, `${size} px`);
    else assertLooksSame(await rawPixels(data), await rawPixels(fresh[i].data), `${size} px`);
  }
});

test('brand/social-preview.png is up to date with the mark, the outlines and tokens.json', async () => {
  assertLooksSame(await rawPixels(readFileSync(root('brand/social-preview.png'))), await rawPixels(await socialPng()), 'social preview');
});
