#!/usr/bin/env node
// Regenerates the brand kit's generated files. Run with `npm run brand`, then commit what it wrote.
// Fonts and text outlines come from scripts/brand/make-fonts.py, which is run by hand and rarely.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { lockupSvg, socialSvg } from './compose.js';
import { ICON_SIZES, encodeIco } from './ico.js';
import { readTokens, tokensToCss, tokensToXaml } from './tokens.js';
import { writeAtomic } from './write.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const outlines = () => JSON.parse(read('brand/build/outlines.json'));

async function buildCss() {
  writeAtomic(root('brand/web/tokens.css'), tokensToCss(readTokens()));
  return 'brand/web/tokens.css';
}

async function buildXaml() {
  writeAtomic(root('src/ps/brand.xaml'), tokensToXaml(readTokens()));
  return 'src/ps/brand.xaml';
}

async function buildLockups() {
  const { wordmark } = outlines();
  const { color } = readTokens();
  writeAtomic(root('brand/logo/lockup.svg'), lockupSvg(read('brand/logo/mark.svg'), wordmark, color.ink));
  writeAtomic(root('brand/logo/lockup-on-violet.svg'), lockupSvg(read('brand/logo/mark-yellow.svg'), wordmark, color.white));
  return 'brand/logo/lockup.svg, brand/logo/lockup-on-violet.svg';
}

async function buildIcon() {
  const mark = Buffer.from(read('brand/logo/mark.svg'));
  const images = [];
  for (const size of ICON_SIZES) {
    // The mark is 64 units at 72 dpi; scaling the density draws it at exactly size px instead of enlarging a bitmap.
    const png = await sharp(mark, { density: (72 * size) / 64 }).resize(size, size).png().toBuffer();
    images.push({ size, png });
  }
  writeAtomic(root('assets/passclaude.ico'), encodeIco(images));
  return 'assets/passclaude.ico';
}

async function buildSocial() {
  const svg = socialSvg(read('brand/logo/mark-yellow.svg'), outlines(), readTokens().color);
  writeAtomic(root('brand/social-preview.png'), await sharp(Buffer.from(svg)).png().toBuffer());
  return 'brand/social-preview.png';
}

const steps = [buildCss, buildXaml, buildLockups, buildIcon, buildSocial];
try {
  for (const step of steps) console.log(`wrote ${await step()}`);
} catch (e) {
  console.error(`brand build failed: ${e.message}`);
  process.exit(1);
}
