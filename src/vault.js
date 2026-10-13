// Secret storage in Windows Credential Manager, through src/ps/cred.ps1 and src/ps/prompt.ps1.
// Values travel over stdin/stdout only. PowerShell stderr is never passed on (it can echo input).
import { runPs, EXIT } from './windows.js';
import { MIN_SECRET_LENGTH } from './redact.js';

export const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const KINDS = ['web', 'command'];
export const MAX_SECRET_CHARS = 1280;

export class VaultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function checkName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new VaultError('BAD_NAME', `Bad name "${name}". Use lowercase letters, digits, dots, dashes or underscores (max 64), e.g. netflix or github-token.`);
  }
  return name;
}

export function encodeMeta({ kind, site, created }) {
  return JSON.stringify(kind === 'web' ? { v: 1, kind, site, created } : { v: 1, kind, created });
}

export function decodeMeta(name, comment) {
  try {
    const m = JSON.parse(comment);
    if (m?.v !== 1 || !KINDS.includes(m.kind)) return null;
    return { name, kind: m.kind, site: m.kind === 'web' ? m.site : undefined, created: m.created };
  } catch {
    return null;
  }
}

const exists = (name) => new VaultError('EXISTS', `"${name}" already exists. Delete it first if you want to replace it.`);
const tooLong = () => new VaultError('TOO_LONG', `Too long: secrets can be at most ${MAX_SECRET_CHARS} characters.`);
const windowsFailed = (what, res) => new VaultError('WINDOWS', `Windows Credential Manager ${what} failed (exit code ${res.code}).`);

export function createVault({ run = runPs } = {}) {
  return {
    async list() {
      const res = await run('cred.ps1', ['list']);
      if (res.code !== EXIT.OK) throw windowsFailed('list', res);
      return res.stdout
        .split('\n')
        .filter((line) => line.includes('\t'))
        .map((line) => {
          const tab = line.indexOf('\t');
          return decodeMeta(line.slice(0, tab).replace(/^passclaude:/i, ''), line.slice(tab + 1).trim());
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async meta(name) {
      const res = await run('cred.ps1', ['meta', checkName(name)]);
      if (res.code === EXIT.NOT_FOUND) return null;
      if (res.code !== EXIT.OK) throw windowsFailed('read', res);
      return decodeMeta(name, res.stdout);
    },

    async get(name) {
      const res = await run('cred.ps1', ['get', checkName(name)]);
      if (res.code === EXIT.NOT_FOUND) return null;
      if (res.code !== EXIT.OK) throw windowsFailed('read', res);
      return res.stdout;
    },

    async put(name, meta, value) {
      checkName(name);
      if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) {
        throw new VaultError('TOO_SHORT', `Too short: secrets need at least ${MIN_SECRET_LENGTH} characters.`);
      }
      if (value.length > MAX_SECRET_CHARS) throw tooLong();
      // Node refuses to start a process whose environment holds a null character, and its error quotes the whole value.
      if (value.includes('\u0000')) throw new VaultError('BAD_VALUE', "Secrets can't contain a null character.");
      // First line: the metadata (JSON never contains a raw line break). Everything after it: the value, exactly.
      // Not one JSON object: cred.ps1 would have to parse it with ConvertFrom-Json, a cmdlet, and PowerShell module logging
      // can record the parameters a cmdlet receives, value included.
      const res = await run('cred.ps1', ['put', name], `${encodeMeta(meta)}\n${value}`);
      if (res.code === EXIT.EXISTS) throw exists(name);
      if (res.code === EXIT.TOO_LONG) throw tooLong();
      if (res.code !== EXIT.OK) throw windowsFailed('save', res);
    },

    async promptPut(name, meta) {
      const res = await run(
        'prompt.ps1',
        [checkName(name)],
        JSON.stringify({ comment: encodeMeta(meta), kind: meta.kind, site: meta.site ?? '' }),
        { timeoutMs: 6 * 60_000 },
      );
      if (res.code === EXIT.EXISTS) throw exists(name);
      if (res.code === EXIT.CANCELLED) return 'cancelled';
      if (res.code !== EXIT.OK) throw windowsFailed('popup', res);
      return 'saved';
    },

    async delete(name) {
      const res = await run('cred.ps1', ['delete', checkName(name)]);
      if (res.code === EXIT.NOT_FOUND) return false;
      if (res.code !== EXIT.OK) throw windowsFailed('delete', res);
      return true;
    },
  };
}
