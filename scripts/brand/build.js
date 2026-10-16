#!/usr/bin/env node
// Regenerates the brand kit's generated files. Run with `npm run brand`, then commit what it wrote.
import { fileURLToPath } from 'node:url';
import { readTokens, tokensToCss } from './tokens.js';
import { writeAtomic } from './write.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

async function buildCss() {
  writeAtomic(root('brand/web/tokens.css'), tokensToCss(readTokens()));
  return 'brand/web/tokens.css';
}

const steps = [buildCss];
try {
  for (const step of steps) console.log(`wrote ${await step()}`);
} catch (e) {
  console.error(`brand build failed: ${e.message}`);
  process.exit(1);
}
