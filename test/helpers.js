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
        const { comment, value } = JSON.parse(stdin);
        creds.set(target, { comment, value });
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

/** In-memory ntfy relay. Subscribers get every earlier message replayed, like ntfy's `since`. */
export function fakeNtfy({ dropFirstSubscribe = false } = {}) {
  const topics = new Map();
  const get = (t) => topics.get(t) ?? topics.set(t, { messages: [], listeners: new Set() }).get(t);
  let count = 0;
  let subscribes = 0;
  return {
    baseUrl: 'https://relay.test',
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
    async subscribe(topic, onMessage, { signal } = {}) {
      subscribes += 1;
      const tp = get(topic);
      for (const m of [...tp.messages]) await onMessage(m.message, m.id);
      if (dropFirstSubscribe && subscribes === 1) return; // simulate the connection dropping
      await new Promise((resolve) => {
        tp.listeners.add(onMessage);
        signal?.addEventListener('abort', () => { tp.listeners.delete(onMessage); resolve(); });
      });
    },
  };
}
