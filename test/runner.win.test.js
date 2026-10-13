import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { runCommand, OUTPUT_CAP } from '../src/runner.js';

const skip = process.platform !== 'win32';

test('passes env vars to the command and returns its output', { skip }, async () => {
  const r = await runCommand({ command: 'Write-Output "v=$env:PC_TEST_VAR"', env: { PC_TEST_VAR: 'abc "q" ü' } });
  assert.equal(r.exitCode, 0);
  assert.equal(r.timedOut, false);
  assert.match(r.stdout, /v=abc "q" ü/);
});

test('reports exit codes and stderr', { skip }, async () => {
  const r = await runCommand({ command: '[Console]::Error.WriteLine("boom"); exit 3' });
  assert.equal(r.exitCode, 3);
  assert.match(r.stderr, /boom/);
});

test('runs in the given working directory', { skip }, async () => {
  const dir = fs.realpathSync(os.tmpdir());
  const r = await runCommand({ command: '(Get-Location).Path', cwd: dir });
  assert.equal(r.stdout.trim().toLowerCase(), dir.toLowerCase());
});

test('stops commands that run past the timeout', { skip }, async () => {
  const started = Date.now();
  const r = await runCommand({ command: 'Start-Sleep -Seconds 30', timeoutSec: 2 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 15_000);
});

test('caps very large output', { skip }, async () => {
  const r = await runCommand({ command: "[Console]::Out.Write('x' * 1500000)" });
  assert.equal(r.stdout.length, OUTPUT_CAP);
  assert.equal(r.truncated.stdout, true);
});

test('ignores a powershell.exe planted in the current directory', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passclaude-plant-'));
  const home = process.cwd();
  // libuv only searches the current directory first when this variable is unset, so unset it to make the test meaningful.
  const guard = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  try {
    // hostname.exe stands in for malware: if it runs instead of PowerShell, the output gives it away.
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'hostname.exe'), path.join(dir, 'powershell.exe'));
    process.chdir(dir);
    const r = await runCommand({ command: 'Write-Output ok' });
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /ok/);
  } finally {
    process.chdir(home);
    if (guard !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = guard;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a thrown secret with & < > appears as typed, not XML-escaped', { skip }, async () => {
  const r = await runCommand({ command: 'throw "failed with $env:PC_S"', env: { PC_S: 'p&ss<w>rd"1\'x' } });
  assert.ok(r.stderr.includes('p&ss<w>rd"1\'x'), `stderr was: ${r.stderr}`);
  assert.ok(!r.stderr.includes('&amp;'));
  assert.ok(!r.stderr.includes('#< CLIXML'));
});

test('keeps plain stderr lines and a thrown secret as plain text when they are mixed', { skip }, async () => {
  const r = await runCommand({ command: 'cmd /c "echo nat 1>&2"; [Console]::Error.WriteLine("plain-line"); throw "boom $env:PC_S"', env: { PC_S: 'p&q<x>' } });
  assert.match(r.stderr, /nat/, `stderr was: ${r.stderr}`);
  assert.match(r.stderr, /plain-line/, `stderr was: ${r.stderr}`);
  assert.ok(r.stderr.includes('p&q<x>'), `stderr was: ${r.stderr}`);
  assert.ok(!r.stderr.includes('&amp;'));
  assert.ok(!r.stderr.includes('#< CLIXML'));
});

test('passes non-ASCII command text through unchanged', { skip }, async () => {
  const r = await runCommand({ command: 'Write-Output "ü✓"' });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /ü✓/);
});

test('runs from a temporary script file and removes it afterwards', { skip }, async () => {
  const countScripts = () => fs.readdirSync(os.tmpdir()).filter((f) => /^passclaude-.*\.ps1$/.test(f)).length;
  const before = countScripts();
  // $PSCommandPath is the script the command runs from, so this shows where the command came from.
  const r = await runCommand({ command: 'Write-Output $PSCommandPath' });
  const scriptPath = r.stdout.trim();
  assert.match(path.basename(scriptPath), /^passclaude-.*\.ps1$/, `stdout was: ${r.stdout}`);
  assert.equal(fs.existsSync(scriptPath), false);
  assert.ok(countScripts() <= before, 'a temporary script file was left behind');
});

test('returns promptly when a grandchild keeps the output pipes open after PowerShell exits', { skip }, async () => {
  const started = Date.now();
  // Start-Process hands ping.exe our stdout pipe and PowerShell exits at once; ping then exits on its own after about 30 seconds.
  const r = await runCommand({ command: "Start-Process -NoNewWindow ping.exe -ArgumentList '-n','30','127.0.0.1' | Out-Null; Write-Output started", timeoutSec: 20 });
  assert.equal(r.timedOut, false);
  assert.match(r.stdout, /started/);
  assert.ok(Date.now() - started < 15_000);
});
