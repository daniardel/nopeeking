// Runs the phone page's script (docs/app.js) in Node against a small stand-in for its page, with the clock mocked.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, randomTopic, toB64u } from '../docs/e2e.js';

const SECTIONS = ['loading', 'bad', 'ask', 'done', 'expired'];

function fakePage() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const listeners = {};
      els.set(id, {
        id, textContent: '', value: '', type: 'password', disabled: false, hidden: false, attrs: {},
        classList: { toggle() {} },
        toggleAttribute(name, on) { this.attrs[name] = on; },
        addEventListener(type, fn) { listeners[type] = fn; },
        fire(type, event = {}) { return listeners[type]?.({ preventDefault() {}, target: this, ...event }); },
      });
    }
    return els.get(id);
  };
  return {
    el,
    body: { dataset: {} },
    getElementById: el,
    querySelectorAll: (selector) => (selector === 'main > section' ? SECTIONS.map(el) : []),
  };
}

/** Lets the page's real crypto and promise chains run between clock ticks. */
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test('a link that runs out while waiting for the PC never leaves the countdown stuck at 0:01', async () => {
  const now = 1_800_000_000_000;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  const { publicKeyRaw } = await generateKeyPair();
  const page = fakePage();
  globalThis.document = page;
  globalThis.location = {
    hash: `#${new URLSearchParams({ v: '1', t: randomTopic(), k: toB64u(publicKeyRaw), n: 'netflix', kind: 'web', s: 'netflix.com', e: String(now / 1000 + 5), r: 'https://ntfy.sh' })}`,
  };
  // The relay takes the message, and the PC never confirms.
  globalThis.fetch = async (url, opts) => (opts?.method === 'POST' ? { ok: true, json: async () => ({ id: 'm1' }) } : { ok: true, text: async () => '' });
  try {
    await import('../docs/app.js');
    assert.equal(page.body.dataset.state, 'ask');
    assert.equal(page.el('expires').textContent, 'Expires in 0:05');

    page.el('value').value = page.el('confirm').value = 'hunter22';
    page.el('form').fire('submit');
    for (let s = 0; s < 10; s++) { await settle(); mock.timers.tick(1000); }
    await settle();
    assert.equal(page.el('status').textContent, 'Sent. Waiting for your PC to confirm…');
    assert.equal(page.el('expires').textContent, 'Expired', 'the badge says so while the send is still waiting');

    for (let s = 0; s < 100; s++) { await settle(); mock.timers.tick(1000); }
    await settle();
    assert.match(page.el('status').textContent, /^No reply from your PC/);
    assert.equal(page.body.dataset.state, 'ask', 'the message stays on screen');
    assert.equal(page.el('expires-badge').hidden, true, 'no countdown beside a link that can never work again');
    assert.equal(page.el('send').disabled, true);
    assert.equal(page.el('value').value, '', 'nothing typed is kept');
  } finally {
    mock.timers.reset();
    delete globalThis.document;
    delete globalThis.location;
    delete globalThis.fetch;
  }
});
