import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { buildSite } from '../scripts/site/build.js';

const CSP =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'";
const SITE_URL = 'https://daniardel.github.io/passclaude/';
const LINK_HOSTS =['github.com', 'www.npmjs.com', 'nodejs.org', 'docs.claude.com'];

/** Builds the site into a fresh temp folder, hands it to fn, then removes it. */
function withBuild(fn) {
  const dir = join(mkdtempSync(join(tmpdir(), 'pc-site-')), 'out');
  try {
    buildSite(dir);
    return fn(dir);
  } finally {
    rmSync(dirname(dir), { recursive: true, force: true });
  }
}

function files(dir) {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

/** Every URL a page or stylesheet loads or links to: tag attributes (href, src) and CSS url(). */
function refs(text) {
  const out = [];
  for (const m of text.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    for (const a of m[2].matchAll(/\s(href|src)="([^"]*)"/g)) out.push({ tag, url: a[2] });
  }
  for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) out.push({ tag: 'css', url: m[1] });
  return out;
}

const isExternal = (url) => /^(https?:)?\/\//i.test(url);
const isLocal = (url) => !isExternal(url) && !/^(#|mailto:|data:)/i.test(url);

test('the built site has every file its pages and stylesheets load or link to', () => {
  withBuild((dir) => {
    const pages = files(dir).filter((f) => /\.(html|css)$/.test(f));
    assert.ok(pages.some((f) => f.endsWith('index.html')), 'index.html');
    for (const page of pages) {
      for (const { url } of refs(readFileSync(page, 'utf8')).filter((r) => isLocal(r.url))) {
        const target = join(dirname(page), decodeURIComponent(url.replace(/[?#].*$/, '')));
        assert.ok(existsSync(target), `${relative(dir, page)} names ${url}, which the build did not produce`);
      }
    }
  });
});

test('a shared link shows the social image from its full address on the site itself', () => {
  withBuild((dir) => {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.equal(/<meta property="og:url" content="([^"]*)">/.exec(html)?.[1], SITE_URL);
    assert.equal(/<meta property="og:image" content="([^"]*)">/.exec(html)?.[1], `${SITE_URL}social-preview.png`);
    assert.ok(existsSync(join(dir, 'social-preview.png')));
  });
});

test('the landing page loads nothing from another site', () => {
  withBuild((dir) => {
    for (const page of files(dir).filter((f) => /\.(html|css)$/.test(f))) {
      const text = readFileSync(page, 'utf8');
      for (const { tag, url } of refs(text)) {
        if (!isExternal(url)) continue;
        assert.equal(tag, 'a', `${relative(dir, page)} loads ${url}`);
        assert.ok(LINK_HOSTS.includes(new URL(url).hostname), `${relative(dir, page)} links to ${url}`);
      }
      assert.doesNotMatch(text, /@import|<iframe|<object|<embed/i, relative(dir, page));
    }
  });
});

test('the page works under its own CSP: no inline scripts or styles', () => {
  withBuild((dir) => {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
    assert.equal(meta?.[1], CSP);
    assert.doesNotMatch(html, /\sstyle="/, 'style attributes are blocked by the CSP');
    assert.doesNotMatch(html, /<style/, 'style elements are blocked by the CSP');
    assert.doesNotMatch(html, /\son[a-z]+="/, 'inline event handlers are blocked by the CSP');
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\ssrc="/, 'inline scripts are blocked by the CSP');
  });
});

test('the page says what passClaude does, how to get it and what it does not protect', () => {
  withBuild((dir) => {
    const raw = readFileSync(join(dir, 'index.html'), 'utf8');
    const html = `${raw}\n${raw.replace(/<[^>]+>/g, '')}`; // markup for links, plain text for words split by <span>s
    for (const text of [
      'claude mcp add --scope user passclaude -- npx -y passclaude',
      'https://github.com/daniardel/passclaude/releases/latest/download/install-passclaude.cmd',
      'https://github.com/daniardel/passclaude#security-what-it-protects-and-what-it-doesnt',
      'https://github.com/daniardel/passclaude/blob/main/LICENSE',
      'OPENAI_API_KEY',
      '••••(openai)',
      'not made by Anthropic',
      'Node.js 20',
    ]) {
      assert.ok(html.includes(text), text);
    }
  });
});

test('the Copy button stays hidden unless its script runs, so the page never shows a dead button', () => {
  withBuild((dir) => {
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /<button\b[^>]*\sdata-copy="[^"]+"[^>]*\shidden[\s>]/);
    assert.match(readFileSync(join(dir, 'site.js'), 'utf8'), /hidden = false/);
  });
});

test('buildSite replaces its own earlier output', () => {
  withBuild((dir) => {
    writeFileSync(join(dir, 'stale.txt'), 'old');
    buildSite(dir);
    assert.equal(existsSync(join(dir, 'stale.txt')), false);
    assert.ok(existsSync(join(dir, 'index.html')));
  });
});

test('buildSite refuses to clear a folder it did not make', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-site-'));
  try {
    mkdirSync(join(dir, 'mine'));
    writeFileSync(join(dir, 'mine', 'keep.txt'), 'kept');
    assert.throws(() => buildSite(join(dir, 'mine')), /not a passClaude site build/);
    assert.equal(readFileSync(join(dir, 'mine', 'keep.txt'), 'utf8'), 'kept');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
