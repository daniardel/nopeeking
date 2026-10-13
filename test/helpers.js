// Test doubles shared by several test files.
import { createVault } from '../src/vault.js';

/** Emulates src/ps/cred.ps1 and src/ps/prompt.ps1 in memory. popupValue = what the user "types" (null = Cancel). */
export function fakeWindowsCred({ popupValue = null } = {}) {
  const creds = new Map();
  const result = (code, stdout = '') => ({ code, stdout, stderr: '' });
  async function run(script, args = [], stdin = '') {
    if (script === 'prompt.ps1') {
      const target = `passclaude:${args[0]}`;
      if (creds.has(target)) return result(4);
      if (popupValue === null) return result(6);
      creds.set(target, { comment: JSON.parse(stdin).comment, value: popupValue });
      return result(0);
    }
    if (script !== 'cred.ps1') throw new Error(`unexpected script ${script}`);
    const [op, name] = args;
    const target = `passclaude:${name}`;
    switch (op) {
      case 'list': return result(0, [...creds].map(([t, c]) => `${t}\t${c.comment}\n`).join(''));
      case 'meta': return creds.has(target) ? result(0, creds.get(target).comment) : result(3);
      case 'get': return creds.has(target) ? result(0, creds.get(target).value) : result(3);
      case 'put': {
        if (creds.has(target)) return result(4);
        // Like cred.ps1: the first line is the metadata, everything after the first newline is the value.
        const newline = stdin.indexOf('\n');
        creds.set(target, { comment: stdin.slice(0, newline), value: stdin.slice(newline + 1) });
        return result(0);
      }
      case 'delete': return creds.delete(target) ? result(0) : result(3);
      default: throw new Error(`unexpected op ${op}`);
    }
  }
  return { run, creds };
}

export function memoryVault(options) {
  return createVault({ run: fakeWindowsCred(options).run });
}

/**
 * In-memory ntfy relay. Subscribers get every earlier message replayed, like ntfy's `since`.
 * `mode` (also settable later as ntfy.mode): 'open' works; 'unreachable' makes subscribe fail at once, like fetch with no
 * network; 'never-opens' makes subscribe hang without ever opening until it is aborted, like a connection that stalls.
 */
export function fakeNtfy({ dropFirstSubscribe = false, mode = 'open' } = {}) {
  const topics = new Map();
  const get = (t) => topics.get(t) ?? topics.set(t, { messages: [], listeners: new Set() }).get(t);
  let count = 0;
  let subscribes = 0;
  const relay = {
    baseUrl: 'https://relay.test',
    mode,
    published: [],
    get subscribes() { return subscribes; },
    async publish(topic, message) {
      const id = `m${++count}`;
      const tp = get(topic);
      tp.messages.push({ message, id });
      this.published.push({ topic, message });
      for (const listener of [...tp.listeners]) await listener(message, id);
      return { id };
    },
    async subscribe(topic, onMessage, { signal, onOpen } = {}) {
      subscribes += 1;
      if (relay.mode === 'unreachable') throw new TypeError('fetch failed');
      if (relay.mode === 'never-opens') {
        return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      onOpen?.();
      const tp = get(topic);
      for (const m of [...tp.messages]) await onMessage(m.message, m.id);
      if (dropFirstSubscribe && subscribes === 1) return; // simulate the connection dropping
      await new Promise((resolve) => {
        tp.listeners.add(onMessage);
        signal?.addEventListener('abort', () => { tp.listeners.delete(onMessage); resolve(); });
      });
    },
  };
  return relay;
}
