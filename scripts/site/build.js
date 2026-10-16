#!/usr/bin/env node
// Assembles the landing page into one folder ready for static hosting: site/ plus the brand kit files it uses.
// Run with `npm run site` (writes site-dist/), or call buildSite(folder) from a test.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const MARKER = '.passclaude-site'; // marks a folder this script made, so it never clears anything else

// Published path → source path in the repo.
const COPIES = {
  'index.html': 'site/index.html',
  'site.css': 'site/site.css',
  'site.js': 'site/site.js',
  'brand/tokens.css': 'brand/web/tokens.css',
  'brand/fonts': 'brand/web/fonts',
  'brand/logo/mark.svg': 'brand/logo/mark.svg',
  'brand/logo/mark-yellow.svg': 'brand/logo/mark-yellow.svg',
  'favicon.ico': 'assets/passclaude.ico',
  'social-preview.png': 'brand/social-preview.png',
};

export function buildSite(outDir) {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    if (!existsSync(join(outDir, MARKER))) throw new Error(`${outDir} is not a passClaude site build; not clearing it`);
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, MARKER), 'Built by scripts/site/build.js. Safe to delete.\n');
  for (const [to, from] of Object.entries(COPIES)) cpSync(root(from), join(outDir, to), { recursive: true });
  return outDir;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(`built ${buildSite(root('site-dist'))}`);
  } catch (e) {
    console.error(`site build failed: ${e.message}`);
    process.exit(1);
  }
}
