// Reads brand/tokens.json and turns it into the stylesheet the web pages use. Used by build.js and the tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../../brand/tokens.json', import.meta.url));
const HEX = /^#[0-9A-F]{6}$/;
const NAME = /^[a-z][a-z0-9-]*$/;

export function readTokens() {
  return JSON.parse(readFileSync(TOKENS, 'utf8'));
}

/** Throws an Error naming the first bad token. */
export function validateTokens(t) {
  for (const key of ['color', 'radius', 'shadow', 'font']) {
    if (typeof t[key] !== 'object' || t[key] === null) throw new Error(`missing "${key}"`);
  }
  for (const [name, hex] of Object.entries(t.color)) {
    if (!NAME.test(name)) throw new Error(`color "${name}": names are lower-case letters, digits and dashes`);
    if (!HEX.test(hex)) throw new Error(`color "${name}": "${hex}" is not #RRGGBB in capitals`);
  }
  for (const [name, px] of Object.entries(t.radius)) {
    if (!Number.isInteger(px) || px < 0) throw new Error(`radius "${name}": ${px} is not a whole number of pixels`);
  }
  if (!Number.isInteger(t.outline) || t.outline < 1) throw new Error(`outline: ${t.outline} is not a whole number of pixels`);
  for (const [name, s] of Object.entries(t.shadow)) {
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) throw new Error(`shadow "${name}": x and y must be whole numbers`);
    if (!Object.hasOwn(t.color, s.color)) throw new Error(`shadow "${name}": no color named "${s.color}"`);
  }
  for (const [role, f] of Object.entries(t.font)) {
    if (typeof f.family !== 'string' || !f.family) throw new Error(`font "${role}": missing family`);
    if (typeof f.fallback !== 'string' || !f.fallback) throw new Error(`font "${role}": missing fallback`);
    for (const [weight, file] of Object.entries(f.files ?? {})) {
      if (!/^[1-9]00$/.test(weight)) throw new Error(`font "${role}": weight ${weight} is not 100–900`);
      if (!/^[A-Za-z0-9-]+$/.test(file)) throw new Error(`font "${role}": bad file name "${file}"`);
    }
  }
}

/** The stylesheet for brand/web/tokens.css: @font-face rules for the self-hosted fonts, then --pc-* custom properties. */
export function tokensToCss(t) {
  validateTokens(t);
  const out = ['/* Generated from brand/tokens.json by `npm run brand`. Do not edit by hand. */', ''];
  for (const f of Object.values(t.font)) {
    for (const [weight, file] of Object.entries(f.files)) {
      out.push(
        '@font-face {',
        `  font-family: '${f.family}';`,
        `  font-weight: ${weight};`,
        '  font-style: normal;',
        '  font-display: swap;',
        `  src: url('fonts/${file}.woff2') format('woff2');`,
        '}',
        '',
      );
    }
  }
  out.push(':root {');
  for (const [name, hex] of Object.entries(t.color)) out.push(`  --pc-${name}: ${hex};`);
  for (const [name, px] of Object.entries(t.radius)) out.push(`  --pc-radius-${name}: ${px}px;`);
  out.push(`  --pc-outline: ${t.outline}px;`);
  for (const [name, s] of Object.entries(t.shadow)) out.push(`  --pc-shadow-${name}: ${s.x}px ${s.y}px 0 var(--pc-${s.color});`);
  for (const [role, f] of Object.entries(t.font)) out.push(`  --pc-font-${role}: '${f.family}', ${f.fallback};`);
  out.push('}', '');
  return out.join('\n');
}
