import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLink } from '../docs/link.js';
import { generateKeyPair, randomTopic, toB64u } from '../docs/e2e.js';
import { createPhone } from '../src/phone.js';
import { fakeNtfy, memoryVault } from './helpers.js';

async function linkHash(over = {}) {
  const { publicKeyRaw } = await generateKeyPair();
  const p = new URLSearchParams({
    v: '1', t: randomTopic(), k: toB64u(publicKeyRaw), n: 'netflix', kind: 'web', s: 'netflix.com',
    e: '2000', r: 'https://ntfy.sh', ...over,
  });
  return `#${p}`;
}

test('parses a good link', async () => {
  const hash = await linkHash();
  const link = parseLink(hash, 1_000_000);
  const topic = new URLSearchParams(hash.slice(1)).get('t');
  assert.deepEqual(link.req, { topic, name: 'netflix', kind: 'web', site: 'netflix.com' });
  assert.equal(link.relay, 'https://ntfy.sh');
  assert.equal(link.expiresAt, 2_000_000);
  assert.equal(link.pcKey.length, 65);
});

test('command links have an empty site', async () => {
  assert.equal(parseLink(await linkHash({ kind: 'command', s: '' }), 0).req.site, '');
});

test('refuses damaged links and relays that are not plain https', async () => {
  const cases = [
    { v: '2' }, { t: 'short' }, { n: 'Bad Name' }, { kind: 'other' }, { s: '' }, { kind: 'command' },
    { s: 'evil.com/<b>' }, { k: 'AAAA' }, { k: '!!!' }, { r: 'http://ntfy.sh' }, { r: 'javascript:alert(1)' },
    { r: 'https://user:pw@ntfy.sh' }, { e: 'soon' }, { e: '' },
  ];
  for (const over of cases) {
    assert.match(parseLink(await linkHash(over), 1_000_000).error ?? '', /incomplete or damaged/, JSON.stringify(over));
  }
  assert.match(parseLink('', 0).error, /incomplete or damaged/);
});

test('refuses expired links', async () => {
  assert.match(parseLink(await linkHash(), 2_000_000).error, /expired/);
});

test('reads links made by the PC side', async () => {
  const phone = createPhone({ vault: memoryVault(), ntfy: fakeNtfy(), pageUrl: 'https://me.github.io/passclaude/' });
  const { link } = await phone.start({ name: 'netflix', kind: 'web', site: 'netflix.com' });
  const parsed = parseLink(new URL(link).hash);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.req.name, 'netflix');
  assert.equal(parsed.relay, 'https://relay.test');
  phone.close();
});
