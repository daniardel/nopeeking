#!/usr/bin/env node
// Regenerates the brand kit's generated files. Run with `npm run brand`, then commit what it wrote.
// Fonts and text outlines come from scripts/brand/make-fonts.py, which is run by hand and rarely.
// The renderers are exported so the tests can check the committed files are up to date.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { lockupSvg, socialSvg } from './compose.js';
import { ICON_SIZES, encodeIco } from './ico.js';
import { fontFiles, readTokens, tokensToCss, tokensToXaml } from './tokens.js';
import { writeAtomic } from './write.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const outlines = () => JSON.parse(read('brand/build/outlines.json'));

/** Throws, naming them, if any font file tokens.json lists is not in the repo (make-fonts.py makes them). */
export function checkFonts(tokens) {
  const missing = fontFiles(tokens).filter((p) => !existsSync(root(p)));
  if (missing.length) throw new Error(`missing font files: ${missing.join(', ')} (run scripts/brand/make-fonts.py)`);
}

/** { 'brand/logo/lockup.svg': svg, 'brand/logo/lockup-on-violet.svg': svg } */
export function lockups() {
  const { wordmark } = outlines();
  const { color } = readTokens();
  return {
    'brand/logo/lockup.svg': lockupSvg(read('brand/logo/mark.svg'), wordmark, color.ink),
    'brand/logo/lockup-on-violet.svg': lockupSvg(read('brand/logo/mark-yellow.svg'), wordmark, color.white),
  };
}

export async function iconIco() {
  const mark = Buffer.from(read('brand/logo/mark.svg'));
  const images = [];
  for (const size of ICON_SIZES) {
    // The mark is 64 units at 72 dpi; scaling the density draws it at exactly size px instead of enlarging a bitmap.
    const drawn = sharp(mark, { density: (72 * size) / 64 }).resize(size, size);
    if (size === 256) images.push({ size, png: await drawn.png().toBuffer() });
    else images.push({ size, rgba: await drawn.ensureAlpha().raw().toBuffer() });
  }
  return encodeIco(images);
}

export async function socialPng() {
  const svg = socialSvg(read('brand/logo/mark-yellow.svg'), outlines(), readTokens().color);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function build() {
  const tokens = readTokens();
  checkFonts(tokens); // before writing anything: tokens.css would point the pages at fonts that are not there
  writeAtomic(root('brand/web/tokens.css'), tokensToCss(tokens));
  console.log('wrote brand/web/tokens.css');
  writeAtomic(root('src/ps/brand.xaml'), tokensToXaml(tokens));
  console.log('wrote src/ps/brand.xaml');
  for (const [path, svg] of Object.entries(lockups())) {
    writeAtomic(root(path), svg);
    console.log(`wrote ${path}`);
  }
  writeAtomic(root('assets/nopeeking.ico'), await iconIco());
  console.log('wrote assets/nopeeking.ico');
  writeAtomic(root('brand/social-preview.png'), await socialPng());
  console.log('wrote brand/social-preview.png');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await build();
  } catch (e) {
    console.error(`brand build failed: ${e.message}`);
    process.exit(1);
  }
}
