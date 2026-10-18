import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createVault } from '../src/vault.js';
import { POWERSHELL_EXE } from '../src/windows.js';

const skip = process.platform !== 'win32';
const PS_DIR = fileURLToPath(new URL('../src/ps/', import.meta.url));
const name = `zz-test-${process.pid}-${Date.now()}`;
const value = 'Pässwörd "quoted" $x `tick ✓ 🔑';
const linesName = `${name}-lines`;
const linesValue = 'line one\nline "two"\r\n  line three ✓\n';

test('the system Windows PowerShell exists at the pinned absolute path', { skip }, () => {
  assert.ok(fs.existsSync(POWERSHELL_EXE));
});

test('real Credential Manager round trip with special characters and line breaks', { skip }, async () => {
  const vault = createVault();
  const meta = { kind: 'command', created: '2026-10-13T00:00:00.000Z' };
  try {
    await vault.put(name, meta, value);
    assert.deepEqual(await vault.meta(name), { name, kind: 'command', site: undefined, created: meta.created });
    assert.equal(await vault.get(name), value);
    assert.ok((await vault.list()).some((s) => s.name === name));
    await assert.rejects(vault.put(name, meta, 'other-value'), { code: 'EXISTS' });
    // The value is everything after the first line of stdin, exactly: line breaks inside and at the end are kept.
    await vault.put(linesName, meta, linesValue);
    assert.equal(await vault.get(linesName), linesValue);
    assert.deepEqual(await vault.meta(linesName), { name: linesName, kind: 'command', site: undefined, created: meta.created });
  } finally {
    await vault.delete(name);
    await vault.delete(linesName);
  }
  assert.equal(await vault.meta(name), null);
  assert.equal(await vault.meta(linesName), null);
});

test('real Credential Manager: migrate moves passClaude entries to NoPeeking and leaves clashing names alone', { skip }, async () => {
  const vault = createVault();
  const prefix = `zz-migrate-${process.pid}-${Date.now()}`;
  const comment = '{"v":1,"kind":"command","created":"2026-10-13T00:00:00.000Z"}';
  // Writes or deletes passclaude: entries the way passClaude 0.1.0 did, using NoPeeking's own Credential Manager binding.
  const oldCred = (script) => execFileSync(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `. '${PS_DIR}common.ps1'; ${script}`], { encoding: 'utf8' });
  try {
    oldCred(`[NoPeeking.Cred]::Write('passclaude:${prefix}-a', 'old-a "quoted" value', '${comment}')`);
    oldCred(`[NoPeeking.Cred]::Write('passclaude:${prefix}-b', 'old-b', '${comment}')`);
    await vault.put(`${prefix}-b`, { kind: 'command', created: 'x' }, 'new-b');
    assert.equal(await vault.oldCount(prefix), 2);
    assert.deepEqual(await vault.migrate(prefix), { moved: [`${prefix}-a`], kept: [`${prefix}-b`] });
    assert.equal(await vault.get(`${prefix}-a`), 'old-a "quoted" value');
    assert.equal(await vault.get(`${prefix}-b`), 'new-b');
    assert.deepEqual(await vault.meta(`${prefix}-a`), { name: `${prefix}-a`, kind: 'command', site: undefined, created: '2026-10-13T00:00:00.000Z' });
    assert.equal(await vault.oldCount(prefix), 1);
  } finally {
    await vault.delete(`${prefix}-a`);
    await vault.delete(`${prefix}-b`);
    oldCred(`[void][NoPeeking.Cred]::Delete('passclaude:${prefix}-a'); [void][NoPeeking.Cred]::Delete('passclaude:${prefix}-b')`);
  }
});
