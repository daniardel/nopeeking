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
