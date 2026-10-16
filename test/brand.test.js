import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens, tokensToCss, validateTokens } from '../scripts/brand/tokens.js';
import { writeAtomic } from '../scripts/brand/write.js';

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

const LOGOS = ['mark', 'mark-yellow', 'mark-mono', 'face-saved', 'face-error', 'face-expired'];

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
