import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const readme = readFileSync(root('README.md'), 'utf8');
const urls = [...readme.matchAll(/\]\(([^)\s]+)\)|(?:href|srcset|src)="([^"]*)"/g)].map((m) => m[1] ?? m[2]);
const REPO_FILE = /^https:\/\/(?:raw\.githubusercontent\.com\/daniardel\/passclaude\/main|github\.com\/daniardel\/passclaude\/blob\/main)\/(.+)$/;

test('every README link and image is a full address, so they also work on npm, away from the repo', () => {
  assert.ok(urls.length > 10);
  for (const url of urls) assert.match(url, /^(https:\/\/|#|mailto:)/, url);
});

test('every README link into this repo names a file that exists', () => {
  const inRepo = urls.map((url) => REPO_FILE.exec(url)?.[1]).filter(Boolean);
  assert.ok(inRepo.includes('brand/logo/lockup.svg'));
  for (const path of inRepo) assert.ok(existsSync(root(decodeURIComponent(path.replace(/#.*$/, '')))), path);
});
