import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { createHandlers } from '../src/tools.js';
import { memoryVault } from './helpers.js';

const WEB = 'Web-Pa$$word-123';
const CMD = 'ghp_TOKENVALUE1234';
const POPUP = 'Popup-Typed-Value-9';

/** A command that leaks its secrets every way it can: raw, base64 and URL-encoded. */
async function leakyRun(opts) {
  const leak = Object.values(opts.env)
    .map((v) => `${v} ${Buffer.from(v).toString('base64')} ${encodeURIComponent(v)}`)
    .join(' ');
  return { exitCode: 0, timedOut: false, stdout: `out ${leak}`, stderr: `err ${leak}`, truncated: { stdout: false, stderr: false } };
}

async function setup({
  windows = [{ hwnd: '1', url: 'netflix.com/login', foreground: true }],
  typeResult = 'TYPED',
  popupValue = null,
  phoneStatus = 'saved',
  run = leakyRun,
} = {}) {
  const vault = memoryVault({ popupValue });
  await vault.put('netflix', { kind: 'web', site: 'netflix.com', created: '2026-10-13T00:00:00.000Z' }, WEB);
  await vault.put('github', { kind: 'command', created: '2026-10-13T00:00:00.000Z' }, CMD);
  const calls = { typed: [], started: [], runs: [] };
  const win = {
    chromeWindows: async () => windows,
    typeInto: async (name, hwnd, url) => { calls.typed.push({ name, hwnd, url }); return typeResult; },
  };
  const phone = {
    start: async (req) => {
      calls.started.push(req);
      return { link: 'https://me.github.io/passclaude/#v=1&t=pc-test', expiresAt: Date.now() + 300_000 };
    },
    check: async () => phoneStatus,
  };
  const runCommand = async (opts) => { calls.runs.push(opts); return run(opts); };
  return { vault, calls, tools: createHandlers({ vault, win, phone, runCommand, checkWaitMs: 5 }) };
}

/** The text Claude would see: the result, or the error message. */
async function seen(promise) {
  try {
    return await promise;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

test('list_secrets shows names, kinds and sites but no values', async () => {
  const { tools } = await setup();
  const out = await tools.list_secrets();
  assert.match(out, /netflix: website password for netflix\.com \(saved 2026-10-13\)/);
  assert.match(out, /github: command secret \(saved 2026-10-13\)/);
  const empty = createHandlers({ vault: memoryVault(), win: null, phone: null, runCommand: null });
  assert.match(await empty.list_secrets(), /No secrets saved yet/);
});

test('add_secret checks kind and site, then saves what the user typed in the popup', async () => {
  const { tools, vault } = await setup({ popupValue: POPUP });
  await assert.rejects(tools.add_secret({ name: 'x', kind: 'password' }), /kind must be/);
  await assert.rejects(tools.add_secret({ name: 'x', kind: 'web' }), /need the site/);
  await assert.rejects(tools.add_secret({ name: 'x', kind: 'command', site: 'a.com' }), /Only web secrets have a site/);
  await assert.rejects(tools.add_secret({ name: 'Bad Name', kind: 'command' }), /Bad name/);
  await assert.rejects(tools.add_secret({ name: 'netflix', kind: 'web', site: 'netflix.com' }), /already exists/);
  assert.match(await tools.add_secret({ name: 'hulu', kind: 'web', site: 'https://www.Hulu.com/login' }), /Saved "hulu" for hulu\.com/);
  assert.equal((await vault.meta('hulu')).site, 'hulu.com');
  assert.equal(await vault.get('hulu'), POPUP);
});

test('add_secret reports a closed popup and saves nothing', async () => {
  const { tools, vault } = await setup({ popupValue: null });
  assert.match(await tools.add_secret({ name: 'npm', kind: 'command' }), /popup was closed\. Nothing saved/);
  assert.equal(await vault.meta('npm'), null);
});

test('add_secret_from_phone returns the link at once; check_phone_secret reports each state', async () => {
  const { tools, calls } = await setup();
  const out = await tools.add_secret_from_phone({ name: 'hulu', kind: 'web', site: 'www.hulu.com' });
  assert.match(out, /https:\/\/me\.github\.io\/passclaude\/#v=1&t=pc-test/);
  assert.match(out, /expires in 5 minutes/);
  assert.match(out, /check_phone_secret/);
  assert.deepEqual(calls.started, [{ name: 'hulu', kind: 'web', site: 'hulu.com' }]);
  const expected = { saved: /Saved "hulu" from the phone/, waiting: /Still waiting/, expired: /expired\. Nothing saved/ };
  for (const [status, pattern] of Object.entries(expected)) {
    const s = await setup({ phoneStatus: status });
    assert.match(await s.tools.check_phone_secret({ name: 'hulu' }), pattern);
  }
  const none = await setup({ phoneStatus: 'none' });
  await assert.rejects(none.tools.check_phone_secret({ name: 'hulu' }), /No phone link is waiting/);
});

test('type_secret types web secrets and explains refusals', async () => {
  const { tools, calls } = await setup();
  assert.match(await tools.type_secret({ name: 'netflix' }), /Typed the password for "netflix"\. Enter was not pressed/);
  assert.deepEqual(calls.typed, [{ name: 'netflix', hwnd: '1', url: 'netflix.com/login' }]);
  await assert.rejects(tools.type_secret({ name: 'github' }), /command secret/);
  await assert.rejects(tools.type_secret({ name: 'nope' }), /No secret named "nope"\. Saved: github, netflix\./);
  const wrongSite = await setup({ windows: [{ hwnd: '1', url: 'evil.com/login', foreground: true }] });
  await assert.rejects(wrongSite.tools.type_secret({ name: 'netflix' }), /Site lock/);
  assert.equal(wrongSite.calls.typed.length, 0);
});

test('run_with_secret passes secrets as env vars and masks them in the output', async () => {
  const { tools, calls } = await setup();
  const out = await tools.run_with_secret({ command: 'gh repo list', env: { GH_TOKEN: 'github' } });
  assert.deepEqual(calls.runs, [{ command: 'gh repo list', env: { GH_TOKEN: CMD }, cwd: undefined, timeoutSec: 120 }]);
  assert.match(out, /^Exit code: 0/);
  assert.match(out, /--- stdout ---\nout ••••\(github\) ••••\(github\) ••••\(github\)/);
  assert.ok(!out.includes(CMD));
});

test('run_with_secret refuses bad requests before running anything', async () => {
  const { tools, calls } = await setup();
  const cases = [
    [{ command: '', env: { T: 'github' } }, /command is empty/],
    [{ command: 'x', env: {} }, /at least one environment variable/],
    [{ command: 'x', env: { 'bad-name': 'github' } }, /Bad environment variable name/],
    [{ command: 'x', env: { lower: 'github' } }, /Bad environment variable name/],
    [{ command: 'x', env: { T: 'netflix' } }, /web secret and can only be used with type_secret/],
    [{ command: 'x', env: { T: 'nope' } }, /No secret named "nope"\. Saved: github, netflix\./],
    [{ command: 'x', env: { T: 'github' }, timeout_sec: 601 }, /timeout_sec must be/],
    [{ command: 'x', env: { T: 'github' }, timeout_sec: 1.5 }, /timeout_sec must be/],
    [{ command: 'x', env: { T: 'github' }, cwd: 'C:/definitely/not/here' }, /Folder not found/],
  ];
  for (const [args, pattern] of cases) {
    await assert.rejects(tools.run_with_secret(args), pattern, JSON.stringify(args));
  }
  assert.equal(calls.runs.length, 0);
});

test('run_with_secret reports timeouts and cut-off output without leaking half a secret', async () => {
  const run = async () => ({
    exitCode: null,
    timedOut: true,
    stdout: `${'x'.repeat(50)}${CMD.slice(0, 10)}`,
    stderr: '',
    truncated: { stdout: true, stderr: false },
  });
  const { tools } = await setup({ run });
  const out = await tools.run_with_secret({ command: 'x', env: { T: 'github' }, cwd: os.tmpdir(), timeout_sec: 5 });
  assert.match(out, /^Stopped: the command ran longer than 5 seconds\./);
  assert.match(out, /\(cut off at 1 MB\)/);
  assert.match(out, /--- stderr ---\n\(empty\)/);
  assert.ok(!out.includes(CMD.slice(0, 10)));
});

test('delete_secret deletes and reports unknown names', async () => {
  const { tools, vault } = await setup();
  assert.equal(await tools.delete_secret({ name: 'github' }), 'Deleted "github".');
  assert.equal(await vault.meta('github'), null);
  await assert.rejects(tools.delete_secret({ name: 'github' }), /No secret named "github"\. Saved: netflix\./);
});

test('no tool output or error ever contains a stored value', async () => {
  const forms = (v) => [v, Buffer.from(v).toString('base64'), encodeURIComponent(v)];
  const secrets = [WEB, CMD, POPUP].flatMap(forms);
  const outputs = [];
  for (const typeResult of ['TYPED', 'NOT_PASSWORD_FIELD', 'INTERRUPTED']) {
    const { tools } = await setup({ typeResult, popupValue: POPUP });
    outputs.push(
      await seen(tools.list_secrets()),
      await seen(tools.add_secret({ name: 'new-one', kind: 'command' })),
      await seen(tools.add_secret({ name: 'github', kind: 'command' })),
      await seen(tools.add_secret_from_phone({ name: 'phone-one', kind: 'command' })),
      await seen(tools.check_phone_secret({ name: 'phone-one' })),
      await seen(tools.type_secret({ name: 'netflix' })),
      await seen(tools.type_secret({ name: 'github' })),
      await seen(tools.run_with_secret({ command: 'x', env: { A: 'github', B: 'new-one' } })),
      await seen(tools.run_with_secret({ command: 'x', env: { A: 'netflix' } })),
      await seen(tools.list_secrets()),
      await seen(tools.delete_secret({ name: 'netflix' })),
      await seen(tools.delete_secret({ name: 'netflix' })),
    );
  }
  for (const out of outputs) {
    for (const s of secrets) assert.ok(!out.includes(s), `leaked in: ${out}`);
  }
});

test('run_with_secret never passes on a start-up error, because Node can quote a stored value in it', async () => {
  // Node's own spawn error for an env value with a null byte quotes the whole value.
  const run = async (opts) => {
    throw new Error(`The property 'options.env['T']' must be a string without null bytes. Received '${opts.env.T}'`);
  };
  const { tools } = await setup({ run });
  let error;
  try {
    await tools.run_with_secret({ command: 'x', env: { T: 'github' } });
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'expected run_with_secret to reject');
  assert.equal(error.message, "Couldn't start the command. Nothing ran.");
  assert.equal(error.cause, undefined);
  const everything = `${error.message}\n${error.stack}`;
  for (const form of [CMD, Buffer.from(CMD).toString('base64'), encodeURIComponent(CMD)]) {
    assert.ok(!everything.includes(form), `leaked in: ${everything}`);
  }
});

test('check_phone_secret waits 50 seconds by default, under the MCP client request timeout of 60 seconds', async () => {
  const waits = [];
  const phone = { check: async (name, ms) => { waits.push(ms); return 'saved'; } };
  const tools = createHandlers({ vault: memoryVault(), win: null, phone, runCommand: null });
  await tools.check_phone_secret({ name: 'hulu' });
  assert.deepEqual(waits, [50_000]);
});
