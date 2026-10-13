import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../src/vault.js';
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

test('put refuses duplicates, too-short and too-long values with clear errors', async () => {
  const vault = createVault({ run: fakeWindowsCred().run });
  const cmd = { kind: 'command', created: meta.created };
  await vault.put('gh', cmd, 'abcd');
  await assert.rejects(vault.put('gh', cmd, 'abcdef'), { code: 'EXISTS' });
  await assert.rejects(vault.put('x', meta, 'abc'), { code: 'TOO_SHORT' });
  await assert.rejects(vault.put('y', meta, 'a'.repeat(1281)), { code: 'TOO_LONG' });
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

test('list ignores entries that are not passClaude metadata', async () => {
  const stdout = 'passclaude:ok\t{"v":1,"kind":"command","created":"x"}\npassclaude:junk\tnot json\n';
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
