import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, normalizeSite, siteMatches } from '../src/sitelock.js';

test('hostOf reads Chrome address bar text with or without a scheme', () => {
  assert.equal(hostOf('netflix.com/login'), 'netflix.com');
  assert.equal(hostOf('https://www.netflix.com/login?x=1'), 'www.netflix.com');
  assert.equal(hostOf('http://localhost:8080/login'), 'localhost');
  assert.equal(hostOf('localhost:8080/login'), 'localhost');
  assert.equal(hostOf('NETFLIX.COM'), 'netflix.com');
  assert.equal(hostOf('netflix.com./x'), 'netflix.com');
});

test('hostOf rejects non-web pages, search text and userinfo tricks', () => {
  for (const t of ['', '   ', null, 'about:blank', 'chrome://settings', 'file:///C:/x.html',
    'data:text/html,hi', 'javascript:alert(1)', 'view-source:https://netflix.com',
    'ftp://netflix.com', 'netflix login', 'https://netflix.com@evil.com/']) {
    assert.equal(hostOf(t), null, String(t));
  }
});

test('siteMatches accepts the site and its subdomains only', () => {
  assert.ok(siteMatches('netflix.com/login', 'netflix.com'));
  assert.ok(siteMatches('https://www.netflix.com', 'netflix.com'));
  assert.ok(siteMatches('https://login.auth.netflix.com:8443/x', 'netflix.com'));
  assert.ok(!siteMatches('netflix.com.evil.ru/login', 'netflix.com'));
  assert.ok(!siteMatches('evilnetflix.com', 'netflix.com'));
  assert.ok(!siteMatches('netflix.co', 'netflix.com'));
  assert.ok(!siteMatches('https://netflix.com@evil.com', 'netflix.com'));
  assert.ok(!siteMatches('about:blank', 'netflix.com'));
});

test('siteMatches compares internationalised domains in one form', () => {
  const site = normalizeSite('bücher.de');
  assert.equal(site, 'xn--bcher-kva.de');
  assert.ok(siteMatches('https://bücher.de/login', site));
  assert.ok(siteMatches('xn--bcher-kva.de/login', site));
});

test('normalizeSite cleans user input and refuses unusable sites', () => {
  assert.equal(normalizeSite('Netflix.com'), 'netflix.com');
  assert.equal(normalizeSite('https://www.netflix.com/login'), 'netflix.com');
  assert.equal(normalizeSite('localhost'), 'localhost');
  assert.throws(() => normalizeSite('com'), /too broad/);
  assert.throws(() => normalizeSite('not a site'), /not a website/);
  assert.throws(() => normalizeSite(''), /not a website/);
  assert.throws(() => normalizeSite(`${'a'.repeat(150)}.com`), /too long/);
});
