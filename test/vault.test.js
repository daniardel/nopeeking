import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault, encodeMeta } from '../src/vault.js';
import { fakeWindowsCred } from './helpers.js';

const meta = { kind: 'web', site: 'netflix.com', created: '2026-10-13T00:00:00.000Z' };

test('put sends the value over stdin only; meta, get and list read it back', async () => {
  const fake = fakeWindowsCred();
  const calls = [];
  const vault = createVault({ run: (s, a, i, o) => { calls.push({ s, a }); return fake.run(s, a, i, o); } });
  await vault.put('netflix', meta, 'hunter2-value');
  assert.ok(calls.every((c) => !c.a.join(' ').includes('hunter2-value')));
  assert.deepEqual(await vault.meta('netflix'), { name: 'netflix', kind: 'web', site: 'netflix.com', created: meta.created });
  assert.equal(await vault.get('netflix'), 'hunter2-value');
  assert.deepEqual((await vault.list()).map((s) => s.name), ['netflix']);
});

test('put sends the metadata as the first stdin line and the value, exactly as it is, after it', async () => {
  // Not JSON: cred.ps1 reads both with [Console]::In, so the value never passes through a cmdlet such as ConvertFrom-Json,
  // whose parameters PowerShell module logging can record.
  const calls = [];
  const vault = createVault({ run: async (s, a, i) => { calls.push({ s, a, i }); return { code: 0, stdout: '', stderr: '' }; } });
  const cmd = { kind: 'command', created: meta.created };
  const value = 'line one\nline "two"\r\n';
  await vault.put('gh', cmd, value);
  assert.deepEqual(calls.map((c) => [c.s, c.a]), [['cred.ps1', ['put', 'gh']]]);
  assert.equal(calls[0].i, `${encodeMeta(cmd)}\n${value}`);
  assert.ok(!encodeMeta(meta).includes('\n'));
});

test('put refuses duplicates, too-short and too-long values with clear errors', async () => {
  const vault = createVault({ run: fakeWindowsCred().run });
  const cmd = { kind: 'command', created: meta.created };
  await vault.put('gh', cmd, 'abcd');
  await assert.rejects(vault.put('gh', cmd, 'abcdef'), { code: 'EXISTS' });
  await assert.rejects(vault.put('x', meta, 'abc'), { code: 'TOO_SHORT' });
  await assert.rejects(vault.put('y', meta, 'a'.repeat(1281)), { code: 'TOO_LONG' });
});

test('put refuses a value with a null character before anything reaches PowerShell', async () => {
  let ran = false;
  const vault = createVault({ run: async () => { ran = true; return { code: 0, stdout: '', stderr: '' }; } });
  await assert.rejects(
    vault.put('x', meta, 'ghp_REALVALUE\u0000tail'),
    (e) => e.code === 'BAD_VALUE' && e.message === "Secrets can't contain a null character.",
  );
  assert.equal(ran, false);
});

test('missing secrets read as null and delete reports false', async () => {
  const vault = createVault({ run: fakeWindowsCred().run });
  assert.equal(await vault.meta('nope'), null);
  assert.equal(await vault.get('nope'), null);
  assert.equal(await vault.delete('nope'), false);
});

test('names are checked before anything reaches PowerShell', async () => {
  let ran = false;
  const vault = createVault({ run: async () => { ran = true; return { code: 0, stdout: '', stderr: '' }; } });
  for (const bad of ['Netflix', 'has space', '../x', '', 'a'.repeat(65), '-lead']) {
    await assert.rejects(vault.meta(bad), { code: 'BAD_NAME' });
  }
  assert.equal(ran, false);
});

test('list ignores entries that are not NoPeeking metadata', async () => {
  const stdout = 'nopeeking:ok\t{"v":1,"kind":"command","created":"x"}\nnopeeking:junk\tnot json\n';
  const vault = createVault({ run: async () => ({ code: 0, stdout, stderr: '' }) });
  assert.deepEqual(await vault.list(), [{ name: 'ok', kind: 'command', site: undefined, created: 'x' }]);
});

test('PowerShell failures never put stderr into error messages', async () => {
  const vault = createVault({ run: async () => ({ code: 1, stdout: '', stderr: 'ConvertFrom-Json: hunter2-value' }) });
  await assert.rejects(vault.put('z', meta, 'hunter2-value'), (e) => e.code === 'WINDOWS' && !e.message.includes('hunter2'));
});

test('promptPut saves what the popup returns and reports cancel', async () => {
  const fake = fakeWindowsCred({ popupValue: 'typed-in-popup' });
  const vault = createVault({ run: fake.run });
  assert.equal(await vault.promptPut('netflix', meta), 'saved');
  assert.equal(await vault.get('netflix'), 'typed-in-popup');
  assert.deepEqual(await vault.meta('netflix'), { name: 'netflix', ...meta });
  await assert.rejects(vault.promptPut('netflix', meta), { code: 'EXISTS' });
  const cancelled = createVault({ run: fakeWindowsCred().run });
  assert.equal(await cancelled.promptPut('netflix', meta), 'cancelled');
  assert.equal(await cancelled.meta('netflix'), null);
});

test('promptPut runs prompt.ps1 with the name only, a 6 minute timeout, and kind/site over stdin', async () => {
  const fake = fakeWindowsCred({ popupValue: 'typed-in-popup' });
  const calls = [];
  const vault = createVault({ run: (s, a, i, o) => { calls.push({ s, a, i, o }); return fake.run(s, a, i, o); } });
  await vault.promptPut('netflix', meta);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].s, 'prompt.ps1');
  assert.deepEqual(calls[0].a, ['netflix']);
  assert.equal(calls[0].o.timeoutMs, 360000);
  const stdin = JSON.parse(calls[0].i);
  assert.equal(stdin.kind, 'web');
  assert.equal(stdin.site, 'netflix.com');
  assert.deepEqual(JSON.parse(stdin.comment), { v: 1, ...meta });
  const cmdCalls = [];
  const cmdVault = createVault({ run: (s, a, i, o) => { cmdCalls.push({ i }); return fake.run(s, a, i, o); } });
  await cmdVault.promptPut('gh-token', { kind: 'command', created: meta.created });
  assert.deepEqual({ ...JSON.parse(cmdCalls[0].i), comment: undefined }, { kind: 'command', site: '', comment: undefined });
});
