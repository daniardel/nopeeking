import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVault } from '../src/vault.js';
import { POWERSHELL_EXE } from '../src/windows.js';

const skip = process.platform !== 'win32';
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
