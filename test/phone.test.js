import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhone } from '../src/phone.js';
import { aadFor, deriveKey, fromB64u, generateKeyPair, seal, toB64u, unseal } from '../docs/e2e.js';
import { fakeNtfy, memoryVault } from './helpers.js';

const PAGE = 'https://me.github.io/passclaude/';

function params(link) {
  return new URLSearchParams(new URL(link).hash.slice(1));
}

/** Plays the phone page: seals `value` for the link and publishes it. */
async function phoneSends(link, ntfy, value, override = {}) {
  const p = params(link);
  const req = { topic: p.get('t'), name: p.get('n'), kind: p.get('kind'), site: p.get('s'), ...override };
  const keys = await generateKeyPair();
  const key = await deriveKey(keys.privateKey, fromB64u(p.get('k')), p.get('t'));
  const box = await seal(key, { value }, aadFor(req, 'sub'));
  await ntfy.publish(p.get('t'), JSON.stringify({ t: 'sub', pk: toB64u(keys.publicKeyRaw), ...box }));
  return { key, req };
}

async function acks(ntfy, key, req) {
  const out = [];
  for (const { topic, message } of ntfy.published) {
    const msg = JSON.parse(message);
    if (topic === req.topic && msg.t === 'ack') out.push(await unseal(key, msg, aadFor(req, 'ack')));
  }
  return out;
}

test('start builds a one-time link with everything the page needs', async () => {
  const phone = createPhone({ vault: memoryVault(), ntfy: fakeNtfy(), pageUrl: PAGE, now: () => 1_000_000 });
  const { link, expiresAt } = await phone.start({ name: 'netflix', kind: 'web', site: 'netflix.com' });
  assert.ok(link.startsWith(`${PAGE}#`));
  const p = params(link);
  assert.equal(p.get('v'), '1');
  assert.match(p.get('t'), /^pc-[A-Za-z0-9_-]{32}$/);
  assert.equal(fromB64u(p.get('k')).length, 65);
  assert.deepEqual([p.get('n'), p.get('kind'), p.get('s'), p.get('r')], ['netflix', 'web', 'netflix.com', 'https://relay.test']);
  assert.equal(p.get('e'), String(Math.floor(expiresAt / 1000)));
  assert.equal(expiresAt, 1_000_000 + 300_000);
  phone.close();
});

test('start refuses without a page URL, for existing names, and while a link is waiting', async () => {
  const vault = memoryVault();
  await vault.put('gh', { kind: 'command', created: 'x' }, 'abcd1234');
  await assert.rejects(createPhone({ vault, ntfy: fakeNtfy(), pageUrl: '' }).start({ name: 'a', kind: 'command' }), /not configured/);
  const phone = createPhone({ vault, ntfy: fakeNtfy(), pageUrl: PAGE });
  await assert.rejects(phone.start({ name: 'gh', kind: 'command' }), /already exists/);
  await phone.start({ name: 'new', kind: 'command' });
  await assert.rejects(phone.start({ name: 'new', kind: 'command' }), /already waiting/);
  phone.close();
});

test('a secret sent from the phone is saved and acknowledged', async () => {
  const vault = memoryVault();
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'netflix', kind: 'web', site: 'netflix.com' });
  const { key, req } = await phoneSends(link, ntfy, 'phone-secret-1');
  assert.equal(await phone.check('netflix', 1000), 'saved');
  assert.equal(await vault.get('netflix'), 'phone-secret-1');
  assert.deepEqual((await vault.meta('netflix')).site, 'netflix.com');
  assert.deepEqual(await acks(ntfy, key, req), [{ ok: true }]);
  assert.equal(await phone.check('netflix', 10), 'saved');
});

test('garbage and messages sealed for another site are ignored (Review Focus #5)', async () => {
  const vault = memoryVault();
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'netflix', kind: 'web', site: 'netflix.com' });
  const topic = params(link).get('t');
  await ntfy.publish(topic, 'not json');
  await ntfy.publish(topic, JSON.stringify({ t: 'sub', pk: 'AAAA', iv: 'x', ct: 'y' }));
  await phoneSends(link, ntfy, 'evil-value-1', { site: 'evil.com' });
  assert.equal(await phone.check('netflix', 50), 'waiting');
  assert.equal(await vault.get('netflix'), null);
  await phoneSends(link, ntfy, 'real-value-1');
  assert.equal(await phone.check('netflix', 1000), 'saved');
  assert.equal(await vault.get('netflix'), 'real-value-1');
});

test('a rejected value is acknowledged once with the error and the link keeps waiting', async () => {
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE, retryMs: 5 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const { key, req } = await phoneSends(link, ntfy, 'abc');
  assert.equal(await phone.check('gh', 50), 'waiting');
  const replies = await acks(ntfy, key, req);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].error, /Too short/);
  phone.close();
});

test('reconnects when the relay connection drops and still saves (Review Focus #4)', async () => {
  const vault = memoryVault();
  const ntfy = fakeNtfy({ dropFirstSubscribe: true });
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE, retryMs: 5 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  await new Promise((r) => setTimeout(r, 30));
  await phoneSends(link, ntfy, 'after-reconnect');
  assert.equal(await phone.check('gh', 1000), 'saved');
  assert.ok(ntfy.subscribes >= 2);
  assert.equal(await vault.get('gh'), 'after-reconnect');
});

test('links expire, and late messages are not saved', async () => {
  const vault = memoryVault();
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE, ttlMs: 20 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  assert.equal(await phone.check('gh', 1000), 'expired');
  await phoneSends(link, ntfy, 'too-late-value');
  assert.equal(await vault.get('gh'), null);
  assert.equal(await phone.check('unknown', 10), 'none');
});
