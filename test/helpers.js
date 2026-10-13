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
