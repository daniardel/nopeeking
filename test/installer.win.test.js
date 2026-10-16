import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngSize } from '../scripts/brand/ico.js';

const skip = process.platform !== 'win32';
const INSTALLER = fileURLToPath(new URL('../install/install-passclaude.cmd', import.meta.url));

/** Runs the real .cmd through cmd.exe in test mode: it draws its screens into dir and changes nothing. */
function renderInstaller(dir) {
  const out = execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/c', INSTALLER], {
    encoding: 'utf8',
    env: { ...process.env, PASSCLAUDE_INSTALLER_TEST: dir },
    timeout: 60_000,
  });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

test('the one-click installer opens its window from the .cmd and draws every screen', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-installer-'));
  try {
    const report = renderInstaller(dir);
    assert.deepEqual(report.screens, ['checking', 'ready', 'missing-node', 'missing-claude', 'working', 'done', 'already', 'failed']);
    for (const screen of report.screens) {
      const { width, height } = pngSize(readFileSync(join(dir, `installer-${screen}.png`)));
      assert.ok(width >= 900 && height >= 600, `${screen}: ${width}×${height}`);
    }
    assert.equal(report.command, 'claude mcp add --scope user passclaude -- npx -y passclaude');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the installer accepts Node.js 20 and newer only', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-installer-'));
  try {
    assert.deepEqual(renderInstaller(dir).nodeVersions, {
      'v18.19.0': false,
      'v19.9.0': false,
      'v20.0.0': true,
      'v22.11.0': true,
      'v100.1.0': true,
      '': false,
      'garbage': false,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a powershell.exe planted next to the installer (say in Downloads) is never run', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-installer-plant-'));
  try {
    const copy = join(dir, 'install-passclaude.cmd');
    copyFileSync(INSTALLER, copy);
    // Any program will do as the plant: whoami prints a user name, which is not the JSON the real script prints.
    copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), join(dir, 'powershell.exe'));
    const out = execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/c', copy], {
      cwd: dir, // a double-click starts the file in its own folder
      encoding: 'utf8',
      // Without this variable at all (any value, even empty, switches the protection on), as on a normal PC.
      env: Object.fromEntries(
        Object.entries({ ...process.env, PASSCLAUDE_INSTALLER_TEST: dir }).filter(([k]) => k.toLowerCase() !== 'nodefaultcurrentdirectoryinexepath'),
      ),
      timeout: 60_000,
    });
    assert.ok(JSON.parse(out.trim().split(/\r?\n/).pop()).screens, 'the real PowerShell ran, not the plant');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the installer starts cmd.exe by full path, from the user profile, and stops a command that hangs', () => {
  const text = readFileSync(INSTALLER, 'utf8');
  assert.match(text, /Join-Path \$env:SystemRoot 'System32\\cmd\.exe'/);
  assert.match(text, /WorkingDirectory = \$env:USERPROFILE/);
  assert.match(text, /set "NoDefaultCurrentDirectoryInExePath=1"/, 'node and claude are not looked up in the current folder');
});

test('the installer gives up on a step after 60 seconds', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-installer-'));
  try {
    assert.deepEqual(renderInstaller(dir).stepTimedOut, { '59s': false, '61s': true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the installer stays readable: an ASCII text file whose batch part runs no Invoke-Expression', () => {
  const text = readFileSync(INSTALLER, 'utf8');
  assert.equal(text.match(/[^\x00-\x7F]/), null, 'ASCII only');
  assert.match(text, /^<# : /, 'starts with the batch/PowerShell header');
  assert.doesNotMatch(text, /\biex\b|Invoke-Expression/i);
  assert.match(text, /claude mcp add --scope user passclaude -- npx -y passclaude/);
});
