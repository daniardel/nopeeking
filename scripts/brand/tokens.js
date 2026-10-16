// Reads brand/tokens.json and turns it into the stylesheet the web pages use. Used by build.js and the tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../../brand/tokens.json', import.meta.url));
const HEX = /^#[0-9A-F]{6}$/;
const NAME = /^[a-z][a-z0-9-]*$/;
const USED_BY_IMAGES = ['violet', 'yellow', 'ink', 'white', 'muted-on-dark']; // read by build.js for lockups and the social preview

export function readTokens() {
  return JSON.parse(readFileSync(TOKENS, 'utf8'));
}

/** Throws an Error naming the first bad token. */
export function validateTokens(t) {
  for (const key of ['color', 'radius', 'shadow', 'font']) {
    if (typeof t[key] !== 'object' || t[key] === null) throw new Error(`missing "${key}"`);
  }
  for (const name of USED_BY_IMAGES) {
    if (!Object.hasOwn(t.color, name)) throw new Error(`missing color "${name}" (the generated images use it)`);
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

const pascal = (name) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

/** The WPF resource dictionary for src/ps/brand.xaml: a brush per colour, corner radii, outline and shadow offsets. */
export function tokensToXaml(t) {
  validateTokens(t);
  const out = [
    '<!-- Generated from brand/tokens.json by `npm run brand`. Do not edit by hand. -->',
    '<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">',
  ];
  for (const [name, hex] of Object.entries(t.color)) out.push(`  <SolidColorBrush x:Key="${pascal(name)}" Color="${hex}"/>`);
  for (const [name, px] of Object.entries(t.radius)) out.push(`  <CornerRadius x:Key="Radius${pascal(name)}">${px}</CornerRadius>`);
  out.push(`  <Thickness x:Key="Outline">${t.outline}</Thickness>`);
  // A shadow is drawn as an ink copy of the shape behind it, pushed right and down by this margin.
  for (const [name, s] of Object.entries(t.shadow)) out.push(`  <Thickness x:Key="Shadow${pascal(name)}">${s.x},${s.y},0,0</Thickness>`);
  out.push('</ResourceDictionary>', '');
  return out.join('\n');
}
