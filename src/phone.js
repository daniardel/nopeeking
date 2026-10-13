// Adding a secret from the phone: one-time link, end-to-end encrypted, relayed through ntfy.
import { aadFor, deriveKey, fromB64u, generateKeyPair, randomTopic, seal, toB64u, unseal } from '../docs/e2e.js';

export const LINK_TTL_MS = 5 * 60_000;

/** How long start() waits for the relay connection to open before telling the user to use the PC popup instead. */
export const RELAY_OPEN_WAIT_MS = 8000;

/**
 * How long close() waits for messages still being saved or acknowledged, before giving up on them. With CLOSE_DRAIN_MS it
 * stays well under the 2 seconds the MCP client waits after closing stdin before it kills the server.
 */
export const CLOSE_ACK_WAIT_MS = 1500;

/** Pause after the wait, so aborted relay connections can finish closing before the caller exits (see close()). */
export const CLOSE_DRAIN_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves once every promise has settled, or after `ms`. The timer is cleared as soon as either happens. */
function settledWithin(promises, ms) {
  if (promises.length === 0) return Promise.resolve();
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([Promise.allSettled(promises), timeout]).finally(() => clearTimeout(timer));
}

/** The relay's host, such as ntfy.sh, for messages to the user. */
function relayHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function createPhone({
  vault, ntfy, pageUrl, now = Date.now, ttlMs = LINK_TTL_MS, retryMs = 2000, openTimeoutMs = RELAY_OPEN_WAIT_MS,
}) {
  const pending = new Map(); // name -> request
  const starting = new Set(); // names whose start() is still in progress
  const inFlight = new Set(); // handle() calls still saving a secret or publishing its ack
  let closed = false; // set by close(); nothing new may start after that

  function finish(req, status) {
    if (req.status !== 'waiting') return;
    req.status = status;
    req.keys = null;
    clearTimeout(req.timer);
    req.controller.abort();
    for (const notify of req.waiters) notify(status);
    req.waiters.clear();
  }

  /** Expiry and close() never interrupt a save in progress; the save decides the outcome. */
  function expire(req) {
    if (req.busy) req.expirePending = true;
    else finish(req, 'expired');
  }

  async function handle(req, text) {
    if (req.status !== 'waiting' || req.busy) return;
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
    // The link may have expired while decrypting. Claim it synchronously, so nothing else can save to it.
    if (req.status !== 'waiting' || req.busy) return;
    req.busy = true;
    const reply = async (body) => {
      const box = await seal(key, body, aadFor(req, 'ack'));
      await ntfy.publish(req.topic, JSON.stringify({ t: 'ack', ...box })).catch(() => {});
    };
    try {
      if (typeof plain?.value !== 'string') throw new Error('The secret must be text.');
      await vault.put(req.name, { kind: req.kind, site: req.site || undefined, created: new Date(now()).toISOString() }, plain.value);
    } catch (e) {
      req.busy = false;
      if (req.expirePending) finish(req, 'expired');
      await reply({ ok: false, error: e.message });
      return;
    }
    // The secret is in the vault: report it as saved before the ack goes out, so a slow relay cannot turn it into 'expired'.
    req.busy = false;
    finish(req, 'saved');
    await reply({ ok: true });
  }

  /** Records a message that is still being saved or acknowledged, so close() can wait for it. */
  async function track(work) {
    inFlight.add(work);
    try {
      await work;
    } finally {
      inFlight.delete(work);
    }
  }

  /**
   * Keeps a relay connection open for req until it is finished, reconnecting when it drops. Calls reached(true) each time
   * a connection opens and reached(false) each time one fails; start() only looks at the first call.
   */
  async function listen(req, since, reached) {
    const seen = new Set();
    while (req.status === 'waiting') {
      try {
        await ntfy.subscribe(req.topic, async (text, id) => {
          if (seen.has(id)) return;
          seen.add(id);
          await track(handle(req, text));
        }, { since, signal: req.controller.signal, onOpen: () => reached(true) });
      } catch {
        reached(false); // could not connect, dropped or aborted; the loop decides
      }
      if (req.status === 'waiting') await sleep(retryMs);
    }
  }

  return {
    async start({ name, kind, site }) {
      if (closed) throw new Error('passClaude is shutting down.');
      if (kind !== 'web' && kind !== 'command') throw new Error('Kind must be "web" or "command".');
      if (kind === 'web' && !site) throw new Error('A web link needs a site, such as netflix.com.');
      if (kind === 'command' && site) throw new Error('A command link cannot have a site.');
      if (!pageUrl) throw new Error('Phone page not configured. Set PASSCLAUDE_PAGE_URL, or use add_secret (PC popup) instead.');
      if (starting.has(name) || pending.get(name)?.status === 'waiting') {
        throw new Error(`A phone link for "${name}" is already waiting. Use check_phone_secret.`);
      }
      starting.add(name); // reserved before the first await, so a concurrent start() is refused
      try {
        if (await vault.meta(name)) throw new Error(`"${name}" already exists. Delete it first if you want to replace it.`);

        const keys = await generateKeyPair();
        if (closed) throw new Error('passClaude is shutting down.'); // close() ran while we were waiting
        const topic = randomTopic();
        const created = now();
        const expiresAt = created + ttlMs;
        const req = {
          topic, name, kind, site: site ?? '',
          keys, status: 'waiting', busy: false, expirePending: false,
          waiters: new Set(), controller: new AbortController(),
        };
        req.timer = setTimeout(() => expire(req), ttlMs);
        req.timer.unref?.();
        pending.set(name, req);
        // Hand out the link only once the relay has accepted the connection: a link the PC can't hear would leave the user
        // waiting for nothing. Only this first connection counts; later drops are retried quietly by listen().
        let timer;
        const opened = await new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), openTimeoutMs);
          // 'all' returns only this link's messages (the topic is new and random), so no clock is involved.
          listen(req, 'all', resolve).catch(() => {});
        });
        clearTimeout(timer);
        if (!opened || closed) {
          finish(req, 'expired'); // stops listening
          pending.delete(name);
          if (closed) throw new Error('passClaude is shutting down.');
          throw new Error(`Could not reach the relay (${relayHost(ntfy.baseUrl)}) from this PC. Use add_secret (PC popup) instead.`);
        }

        const params = new URLSearchParams({
          v: '1', t: topic, k: toB64u(keys.publicKeyRaw), n: name, kind, s: site ?? '',
          e: String(Math.floor(expiresAt / 1000)), r: ntfy.baseUrl,
        });
        return { link: `${pageUrl}#${params}`, expiresAt };
      } finally {
        starting.delete(name);
      }
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

    /**
     * Ends every waiting link (which aborts its relay connection). Resolves once messages already being saved have been
     * acknowledged (or after CLOSE_ACK_WAIT_MS), then after CLOSE_DRAIN_MS. The drain is needed because on Windows,
     * calling process.exit() right after a streaming fetch is aborted trips a libuv assertion (src\win\async.c) and the
     * process dies with exit code 127. Callers that exit afterwards must await close() first.
     */
    close() {
      closed = true;
      for (const req of pending.values()) expire(req);
      return settledWithin([...inFlight], CLOSE_ACK_WAIT_MS).then(() => sleep(CLOSE_DRAIN_MS));
    },
  };
}
