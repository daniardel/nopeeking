// The phone page is static: these tests read its files, they don't run it in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8').replace(/\r\n/g, '\n'); // git on Windows may check out CRLF
const html = read('docs/index.html');

test('the phone page allows only its own scripts, styles and fonts, and HTTPS for the relay', () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
  assert.ok(csp, 'no Content-Security-Policy meta tag');
  const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  assert.deepEqual(directives, {
    'default-src': "'none'",
    'script-src': "'self'",
    'style-src': "'self'",
    'font-src': "'self'",
    'connect-src': 'https:',
    'base-uri': "'none'",
    'form-action': "'none'",
  });
});

test('the phone page loads nothing from another site', () => {
  for (const file of ['docs/index.html', 'docs/style.css', 'docs/brand/tokens.css']) {
    assert.doesNotMatch(read(file).replace('http://www.w3.org/2000/svg', ''), /https?:\/\//, file);
  }
});

test('the phone page has no inline styles, which its policy would block', () => {
  assert.doesNotMatch(html, /<style|\sstyle=/);
  assert.doesNotMatch(read('docs/app.js'), /\.style\b|innerHTML|outerHTML|insertAdjacentHTML/);
});

test('the phone page links its stylesheets and script', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/brand\/tokens\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/style\.css">/);
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
});

test('the phone page has every state and the padlock faces they show', () => {
  for (const id of ['loading', 'bad', 'ask', 'done', 'expired', 'status', 'status-face', 'send']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('docs/brand is a fresh copy of brand/web (run `npm run brand`)', () => {
  assert.equal(read('docs/brand/tokens.css'), read('brand/web/tokens.css'));
  const fonts = readdirSync(root('brand/web/fonts')).sort();
  assert.deepEqual(readdirSync(root('docs/brand/fonts')).sort(), fonts);
  for (const f of fonts) {
    assert.ok(readFileSync(root(`docs/brand/fonts/${f}`)).equals(readFileSync(root(`brand/web/fonts/${f}`))) ||
      read(`docs/brand/fonts/${f}`) === read(`brand/web/fonts/${f}`), f);
  }
});
