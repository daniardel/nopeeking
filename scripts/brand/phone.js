#!/usr/bin/env node
// Copies the brand stylesheet and web fonts into docs/brand, so the phone page serves them itself
// (its Content-Security-Policy allows nothing from other sites). Run by `npm run brand`; commit what it wrote.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './write.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

try {
  writeAtomic(root('docs/brand/tokens.css'), readFileSync(root('brand/web/tokens.css')));
  const fonts = readdirSync(root('brand/web/fonts'));
  for (const f of fonts) writeAtomic(root(`docs/brand/fonts/${f}`), readFileSync(root(`brand/web/fonts/${f}`)));
  console.log(`wrote docs/brand/tokens.css and ${fonts.length} files in docs/brand/fonts`);
} catch (e) {
  console.error(`phone page brand copy failed: ${e.message}`);
  process.exit(1);
}
