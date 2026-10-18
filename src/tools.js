// The seven NoPeeking tools. Each handler takes the tool's arguments and returns the text Claude sees.
// No handler ever returns a secret value. Refusals are thrown as Errors with a plain-English next step.
import fs from 'node:fs';
import guard from '../hook/guard.cjs';
import { checkName, KINDS } from './vault.js';
import { normalizeSite } from './sitelock.js';
import { typeSecret } from './typer.js';
import { redactOutput } from './redact.js';

export const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;
export const MAX_TIMEOUT_SEC = 600;

function isFolder(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function createHandlers({ vault, win, phone, runCommand, now = Date.now, checkWaitMs = 50_000 }) {
  async function notFound(name) {
    const names = (await vault.list()).map((s) => s.name);
    return new Error(`No secret named "${name}". ${names.length ? `Saved: ${names.join(', ')}.` : 'Nothing is saved yet.'}`);
  }

  function newMeta({ kind, site }) {
    if (!KINDS.includes(kind)) {
      throw new Error('kind must be "web" (a website password) or "command" (an API key or token for commands).');
    }
    const created = new Date(now()).toISOString();
    if (kind === 'command') {
      if (site) throw new Error('Only web secrets have a site. Leave site out for command secrets.');
      return { kind, created };
    }
    if (!site) throw new Error('Web secrets need the site they belong to, like netflix.com.');
    return { kind, site: normalizeSite(site), created };
  }

  return {
    async list_secrets() {
      const secrets = await vault.list();
      if (secrets.length === 0) return 'No secrets saved yet. Save one with add_secret (PC popup) or add_secret_from_phone.';
      const lines = secrets.map((s) => {
        const date = String(s.created ?? '').slice(0, 10);
        return s.kind === 'web'
          ? `- ${s.name}: website password for ${s.site} (saved ${date})`
          : `- ${s.name}: command secret (saved ${date})`;
      });
      return `Saved secrets (values are never shown):\n${lines.join('\n')}`;
    },

    async add_secret({ name, kind, site }) {
      checkName(name);
      const meta = newMeta({ kind, site });
      const result = await vault.promptPut(name, meta);
      if (result === 'cancelled') {
        return 'The popup was closed. Nothing saved. If the user is away from the PC, use add_secret_from_phone instead.';
      }
      return meta.kind === 'web'
        ? `Saved "${name}" for ${meta.site}. Use type_secret to type it on that site.`
        : `Saved "${name}". Use run_with_secret to use it in commands.`;
    },

    async add_secret_from_phone({ name, kind, site, show_qr: showQr = false }) {
      checkName(name);
      const meta = newMeta({ kind, site });
      const { link, expiresAt } = await phone.start({ name, kind: meta.kind, site: meta.site });
      const minutes = Math.max(1, Math.round((expiresAt - now()) / 60_000));
      let qrShown = false;
      if (showQr) {
        const done = new AbortController();
        try {
          win.showQr({ name, kind: meta.kind, link, expiresAt, signal: done.signal });
          qrShown = true;
        } catch {
          // No window: the link in the reply still works.
        }
        // Close the window once the link is used or expires, whichever comes first.
        if (qrShown) phone.check(name, Math.max(0, expiresAt - now()) + 1_000).finally(() => done.abort());
      }
      return [
        'Show the user this one-time link and ask them to open it on their phone:',
        '',
        link,
        '',
        ...(qrShown
          ? ['A window on the PC also shows this link as a QR code: the user can scan it with their phone camera. It closes once the secret arrives or the link expires.']
          : []),
        `They type ${meta.kind === 'web' ? `the password for ${meta.site}` : 'the secret'} there. It is encrypted on the phone, so you never see it.`,
        `The link works once and expires in ${minutes} minutes.`,
        'Put the whole link in your reply, then end your turn and ask the user to say when they have sent it. Do not wait for it',
        'first: on their phone (Remote Control) the user only sees your message once your turn ends. This PC keeps listening, so',
        `nothing is lost. When the user says they sent it, call check_phone_secret with name "${name}".`,
      ].join('\n');
    },

    async check_phone_secret({ name }) {
      checkName(name);
      const status = await phone.check(name, checkWaitMs);
      if (status === 'saved') return `Saved "${name}" from the phone.`;
      if (status === 'waiting') {
        return 'Still waiting for the phone. If the user has seen the link, call check_phone_secret again to keep waiting; if not, end your turn and send them the link first. If the user says it failed, they can try again on the same link, or use add_secret (PC popup).';
      }
      if (status === 'expired') return `The phone link for "${name}" expired. Nothing saved. Call add_secret_from_phone again for a new link.`;
      throw new Error(`No phone link is waiting for "${name}". Call add_secret_from_phone first.`);
    },

    async type_secret({ name }) {
      checkName(name);
      const result = await typeSecret({ name, vault, win });
      if (result.ok) {
        try {
          win.notifyTyped?.({ name, site: result.site });
        } catch {
          // The notification is a courtesy: the password is typed either way.
        }
        return `Typed the password for "${name}". Enter was not pressed: click the sign-in button next.`;
      }
      if (result.reason.startsWith('No secret named')) throw await notFound(name);
      throw new Error(result.reason);
    },

    async run_with_secret({ command, env, stdin, cwd, timeout_sec: timeoutSec = 120 }) {
      if (typeof command !== 'string' || !command.trim()) throw new Error('command is empty.');
      // The same check the guard hook makes for Bash and PowerShell: this command could print a saved value by itself.
      const blocked = guard.verdict({ tool_input: { command } });
      if (blocked) throw new Error(blocked);
      const mapping = Object.entries(env ?? {});
      if (mapping.length === 0 && stdin === undefined) {
        throw new Error(
          'Give env to pass secrets as environment variables, like {"GITHUB_TOKEN": "github"}, or stdin to send one as the command\'s input.',
        );
      }
      for (const [varName] of mapping) {
        if (!ENV_NAME_RE.test(varName)) {
          throw new Error(`Bad environment variable name "${varName}". Use capital letters, digits and underscores, like GITHUB_TOKEN.`);
        }
      }
      const names = [...new Set([...mapping.map(([, secretName]) => secretName), ...(stdin === undefined ? [] : [stdin])])];
      for (const secretName of names) {
        checkName(secretName);
        const meta = await vault.meta(secretName);
        if (!meta) throw await notFound(secretName);
        if (meta.kind !== 'command') throw new Error(`"${secretName}" is a web secret and can only be used with type_secret.`);
      }
      if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > MAX_TIMEOUT_SEC) {
        throw new Error(`timeout_sec must be a whole number from 1 to ${MAX_TIMEOUT_SEC}.`);
      }
      if (cwd !== undefined && !isFolder(cwd)) throw new Error(`Folder not found: ${cwd}`);

      const secrets = [];
      const byName = new Map();
      for (const secretName of names) {
        const value = await vault.get(secretName);
        if (value === null) throw await notFound(secretName);
        byName.set(secretName, value);
        secrets.push({ name: secretName, value });
      }
      const values = Object.fromEntries(mapping.map(([varName, secretName]) => [varName, byName.get(secretName)]));
      const input = stdin === undefined ? {} : { stdin: byName.get(stdin) };

      // Whatever went wrong while starting the command, the original message is never passed on: Node's own spawn errors
      // can quote an environment value (for example one containing a null character) word for word.
      let r;
      try {
        r = await runCommand({ command, env: values, cwd, timeoutSec, ...input });
      } catch {
        throw new Error("Couldn't start the command. Nothing ran.");
      }
      const section = (label, text, cut) =>
        `--- ${label} ---\n${redactOutput(text, secrets, { truncated: cut }).trimEnd() || '(empty)'}${cut ? '\n(cut off at 1 MB)' : ''}`;
      const head = r.timedOut ? `Stopped: the command ran longer than ${timeoutSec} seconds.` : `Exit code: ${r.exitCode}`;
      return [head, section('stdout', r.stdout, r.truncated.stdout), section('stderr', r.stderr, r.truncated.stderr)].join('\n');
    },

    async delete_secret({ name }) {
      checkName(name);
      if (await vault.delete(name)) {
        phone?.forget(name);
        return `Deleted "${name}".`;
      }
      throw await notFound(name);
    },
  };
}
