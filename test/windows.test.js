import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPs, POWERSHELL_EXE } from '../src/windows.js';

const skip = process.platform !== 'win32';

test('POWERSHELL_EXE is the absolute path of the system Windows PowerShell', { skip }, () => {
  assert.ok(path.isAbsolute(POWERSHELL_EXE));
  assert.ok(POWERSHELL_EXE.endsWith('\\WindowsPowerShell\\v1.0\\powershell.exe'));
});

test('runPs ignores a powershell.exe planted in the current directory', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passclaude-plant-'));
  const home = process.cwd();
  // libuv only searches the current directory first when this variable is unset, so unset it to make the test meaningful.
  const guard = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  try {
    // hostname.exe stands in for malware: if it runs instead of PowerShell, the exit code or output gives it away.
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'hostname.exe'), path.join(dir, 'powershell.exe'));
    process.chdir(dir);
    const res = await runPs('cred.ps1', ['list']);
    assert.equal(res.code, 0);
    const lines = res.stdout.split('\n').filter(Boolean);
    assert.ok(lines.every((line) => line.startsWith('passclaude:') && line.includes('\t')), 'cred.ps1 output expected');
  } finally {
    process.chdir(home);
    if (guard !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = guard;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
