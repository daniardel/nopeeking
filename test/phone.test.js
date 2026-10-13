import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_ACK_WAIT_MS, CLOSE_DRAIN_MS, createPhone } from '../src/phone.js';
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

// ---- Fix round 1: a saved secret is always reported as saved; start() is strict and race-free ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(cond, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
}

/** A relay that accepts acks (the replies to the phone) only after `ms`, like a congested ntfy.sh. */
function slowAcks(ntfy, ms) {
  const publish = ntfy.publish;
  ntfy.publish = async function (topic, message) {
    if (message.includes('"t":"ack"')) await sleep(ms);
    return publish.call(this, topic, message);
  };
  return ntfy;
}

/** A relay whose current subscription the test can end on demand, so the phone has to reconnect. */
function endableNtfy() {
  const ntfy = fakeNtfy();
  const subscribe = ntfy.subscribe;
  let endCurrent = () => {};
  ntfy.subscribe = (topic, onMessage, opts = {}) => {
    const ends = new AbortController();
    endCurrent = () => ends.abort();
    opts.signal?.addEventListener('abort', () => ends.abort());
    return subscribe.call(ntfy, topic, onMessage, { ...opts, signal: ends.signal });
  };
  return { ntfy, endCurrent: () => endCurrent() };
}

test('a secret saved before the expiry is reported saved even when the ack is slow', async () => {
  const vault = memoryVault();
  const ntfy = slowAcks(fakeNtfy(), 500);
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE, ttlMs: 200 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const { key, req } = await phoneSends(link, ntfy, 'slow-ack-value');
  assert.equal(await phone.check('gh', 1000), 'saved');
  assert.equal(await vault.get('gh'), 'slow-ack-value');
  assert.deepEqual(await acks(ntfy, key, req), [{ ok: true }]);
});

test('a secret whose save straddles the expiry is reported saved', async () => {
  const vault = memoryVault();
  const put = vault.put;
  vault.put = async (...args) => { await sleep(500); return put(...args); };
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE, ttlMs: 200 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const { key, req } = await phoneSends(link, ntfy, 'slow-save-value');
  assert.equal(await phone.check('gh', 1000), 'saved');
  assert.equal(await vault.get('gh'), 'slow-save-value');
  assert.deepEqual(await acks(ntfy, key, req), [{ ok: true }]);
});

test('two concurrent starts for one name: exactly one succeeds', async () => {
  const phone = createPhone({ vault: memoryVault(), ntfy: fakeNtfy(), pageUrl: PAGE });
  const results = await Promise.allSettled([
    phone.start({ name: 'gh', kind: 'command' }),
    phone.start({ name: 'gh', kind: 'command' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const refused = results.find((r) => r.status === 'rejected');
  assert.match(refused.reason.message, /already waiting/);
  phone.close();
});

test('start refuses a bad kind, a web link without a site, and a command link with a site', async () => {
  const phone = createPhone({ vault: memoryVault(), ntfy: fakeNtfy(), pageUrl: PAGE });
  await assert.rejects(phone.start({ name: 'a', kind: 'card' }), /Kind must be/);
  await assert.rejects(phone.start({ name: 'a', kind: 'web' }), /needs a site/);
  await assert.rejects(phone.start({ name: 'a', kind: 'web', site: '' }), /needs a site/);
  await assert.rejects(phone.start({ name: 'a', kind: 'command', site: 'x.com' }), /cannot have a site/);
});

test('a value that is not text is refused, saves nothing, and the link keeps waiting', async () => {
  const vault = memoryVault();
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const { key, req } = await phoneSends(link, ntfy, 12345678);
  assert.equal(await phone.check('gh', 50), 'waiting');
  assert.equal(await vault.get('gh'), null);
  assert.deepEqual(await acks(ntfy, key, req), [{ ok: false, error: 'The secret must be text.' }]);
  phone.close();
});

test('a message replayed after a reconnect is handled once (seen dedupe)', async () => {
  const { ntfy, endCurrent } = endableNtfy();
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE, retryMs: 5 });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const { key, req } = await phoneSends(link, ntfy, 'abc');
  assert.equal(await phone.check('gh', 50), 'waiting');
  endCurrent(); // drop the connection; the phone resubscribes and the relay replays the message
  await waitFor(() => ntfy.subscribes >= 2);
  await sleep(100); // give a duplicate handle() time to run and answer, if it wrongly does
  assert.equal((await acks(ntfy, key, req)).length, 1);
  phone.close();
});

test('the phone asks the relay for every message on its new topic, so no clock is involved', async () => {
  const ntfy = fakeNtfy();
  const since = [];
  const subscribe = ntfy.subscribe;
  ntfy.subscribe = (topic, onMessage, opts) => { since.push(opts.since); return subscribe(topic, onMessage, opts); };
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE });
  await phone.start({ name: 'gh', kind: 'command' });
  assert.deepEqual(since, ['all']);
  phone.close();
});

// ---- Follow-up: close() waits for the phone's confirmation before the process exits ----

const ackPublished = (ntfy) => ntfy.published.some(({ message }) => message.includes('"t":"ack"'));

/** A relay that never accepts an ack (the reply to the phone), like a hung connection to ntfy.sh. */
function hungAcks(ntfy) {
  const publish = ntfy.publish;
  ntfy.publish = function (topic, message) {
    return message.includes('"t":"ack"') ? new Promise(() => {}) : publish.call(this, topic, message);
  };
  return ntfy;
}

test('close waits for a slow ack to be published before it resolves', async () => {
  // The ack is slower than the drain, so a close() that only drains would resolve before it lands.
  const ntfy = slowAcks(fakeNtfy(), CLOSE_DRAIN_MS + 500);
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const sent = phoneSends(link, ntfy, 'slow-ack-close');
  assert.equal(await phone.check('gh', 1000), 'saved');
  const started = Date.now();
  await phone.close();
  const waited = Date.now() - started;
  assert.ok(ackPublished(ntfy), 'close resolved before the ack was published');
  assert.ok(waited < CLOSE_ACK_WAIT_MS - 500, `close waited ${waited} ms: it should not sit out the cap`);
  const { key, req } = await sent;
  assert.deepEqual(await acks(ntfy, key, req), [{ ok: true }]);
});

test('close stops waiting for a hung ack at the wait cap, then drains', async () => {
  const ntfy = hungAcks(fakeNtfy());
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  phoneSends(link, ntfy, 'hung-ack-value'); // never settles: the ack it waits for is never published
  assert.equal(await phone.check('gh', 1000), 'saved');
  const started = Date.now();
  await phone.close();
  const waited = Date.now() - started;
  assert.ok(
    waited >= CLOSE_ACK_WAIT_MS - 100 && waited < CLOSE_ACK_WAIT_MS + CLOSE_DRAIN_MS + 1000,
    `close waited ${waited} ms`,
  );
});

test('close waits for a save that is already running, then for its ack', async () => {
  const vault = memoryVault();
  const put = vault.put;
  let putStarted = false;
  // The save is slower than the drain, so a close() that only drains would resolve while it is still running.
  vault.put = async (...args) => { putStarted = true; await sleep(CLOSE_DRAIN_MS + 500); return put(...args); };
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE });
  const { link } = await phone.start({ name: 'gh', kind: 'command' });
  const sent = phoneSends(link, ntfy, 'busy-save-value');
  await waitFor(() => putStarted);
  const started = Date.now();
  await phone.close();
  const waited = Date.now() - started;
  assert.equal(await vault.get('gh'), 'busy-save-value');
  assert.ok(ackPublished(ntfy), 'close resolved before the ack was published');
  assert.ok(waited < CLOSE_ACK_WAIT_MS - 500, `close waited ${waited} ms: it should not sit out the cap`);
  await sent;
});

// ---- Follow-up 2: exiting right after an aborted relay connection can crash on Windows, so close() drains first ----

test('close resolves only after a short drain, even with nothing in flight', async () => {
  const phone = createPhone({ vault: memoryVault(), ntfy: fakeNtfy(), pageUrl: PAGE });
  const started = Date.now();
  await phone.close();
  const waited = Date.now() - started;
  assert.ok(waited >= 190 && waited < CLOSE_DRAIN_MS + 500, `close resolved after ${waited} ms`);
});

// ---- Fix round 1: once close() has run, the phone starts nothing new ----

test('start refuses once the phone is shutting down, and opens no subscription', async () => {
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault: memoryVault(), ntfy, pageUrl: PAGE });
  await phone.close();
  await assert.rejects(phone.start({ name: 'gh', kind: 'command' }), /passClaude is shutting down\./);
  assert.equal(ntfy.subscribes, 0);
});

test('a start still in progress when close() is called registers nothing', async () => {
  const vault = memoryVault();
  const meta = vault.meta;
  vault.meta = async (name) => { await sleep(50); return meta(name); };
  const ntfy = fakeNtfy();
  const phone = createPhone({ vault, ntfy, pageUrl: PAGE });
  const starting = phone.start({ name: 'gh', kind: 'command' });
  // Attach the rejection handler before close() waits, so the rejection is never unhandled.
  const refused = assert.rejects(starting, /passClaude is shutting down\./);
  await phone.close();
  await refused;
  assert.equal(ntfy.subscribes, 0);
});
