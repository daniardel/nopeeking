// Adding a secret from the phone: one-time link, end-to-end encrypted, relayed through ntfy.
import { aadFor, deriveKey, fromB64u, generateKeyPair, randomTopic, seal, toB64u, unseal } from '../docs/e2e.js';

export const LINK_TTL_MS = 5 * 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPhone({ vault, ntfy, pageUrl, now = Date.now, ttlMs = LINK_TTL_MS, retryMs = 2000 }) {
  const pending = new Map(); // name -> request

  function finish(req, status) {
    if (req.status !== 'waiting') return;
    req.status = status;
    req.keys = null;
    clearTimeout(req.timer);
    req.controller.abort();
    for (const notify of req.waiters) notify(status);
    req.waiters.clear();
  }

  async function handle(req, text) {
    if (req.status !== 'waiting') return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg?.t !== 'sub' || typeof msg.pk !== 'string') return;
    let key;
    let plain;
    try {
      key = await deriveKey(req.keys.privateKey, fromB64u(msg.pk), req.topic);
      plain = await unseal(key, msg, aadFor(req, 'sub'));
    } catch {
      return; // not sealed for this link
    }
    const reply = async (body) => {
      const box = await seal(key, body, aadFor(req, 'ack'));
      await ntfy.publish(req.topic, JSON.stringify({ t: 'ack', ...box })).catch(() => {});
    };
    try {
      await vault.put(req.name, { kind: req.kind, site: req.site || undefined, created: new Date(now()).toISOString() }, String(plain?.value ?? ''));
    } catch (e) {
      await reply({ ok: false, error: e.message });
      return;
    }
    await reply({ ok: true });
    finish(req, 'saved');
  }

  async function listen(req, since) {
    const seen = new Set();
    while (req.status === 'waiting') {
      try {
        await ntfy.subscribe(req.topic, async (text, id) => {
          if (seen.has(id)) return;
          seen.add(id);
          await handle(req, text);
        }, { since, signal: req.controller.signal });
      } catch {
        // connection dropped or aborted; loop decides
      }
      if (req.status === 'waiting') await sleep(retryMs);
    }
  }

  return {
    async start({ name, kind, site }) {
      if (!pageUrl) throw new Error('Phone page not configured. Set PASSCLAUDE_PAGE_URL, or use add_secret (PC popup) instead.');
      if (pending.get(name)?.status === 'waiting') throw new Error(`A phone link for "${name}" is already waiting. Use check_phone_secret.`);
      if (await vault.meta(name)) throw new Error(`"${name}" already exists. Delete it first if you want to replace it.`);

      const keys = await generateKeyPair();
      const topic = randomTopic();
      const created = now();
      const expiresAt = created + ttlMs;
      const req = {
        topic, name, kind, site: site ?? '',
        keys, status: 'waiting', waiters: new Set(), controller: new AbortController(),
      };
      req.timer = setTimeout(() => finish(req, 'expired'), ttlMs);
      req.timer.unref?.();
      pending.set(name, req);
      listen(req, String(Math.floor(created / 1000))).catch(() => {});

      const params = new URLSearchParams({
        v: '1', t: topic, k: toB64u(keys.publicKeyRaw), n: name, kind, s: site ?? '',
        e: String(Math.floor(expiresAt / 1000)), r: ntfy.baseUrl,
      });
      return { link: `${pageUrl}#${params}`, expiresAt };
    },

    check(name, timeoutMs = 60_000) {
      const req = pending.get(name);
      if (!req) return Promise.resolve('none');
      if (req.status !== 'waiting') return Promise.resolve(req.status);
      return new Promise((resolve) => {
        const done = (status) => {
          clearTimeout(timer);
          resolve(status);
        };
        const timer = setTimeout(() => {
          req.waiters.delete(done);
          resolve('waiting');
        }, timeoutMs);
        req.waiters.add(done);
      });
    },

    close() {
      for (const req of pending.values()) finish(req, 'expired');
    },
  };
}
