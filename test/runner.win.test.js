import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { runCommand, stopAll, OUTPUT_CAP } from '../src/runner.js';
import { redactOutput } from '../src/redact.js';

const skip = process.platform !== 'win32';

// Puts an environment variable back the way it was, including leaving it unset.
function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('passes env vars to the command and returns its output', { skip }, async () => {
  const r = await runCommand({ command: 'Write-Output "v=$env:PC_TEST_VAR"', env: { PC_TEST_VAR: 'abc "q" ü' } });
  assert.equal(r.exitCode, 0);
  assert.equal(r.timedOut, false);
  assert.match(r.stdout, /v=abc "q" ü/);
});

test('sends stdin, byte for byte and followed by Enter, to the first program that reads input', { skip }, async () => {
  const echo = `& '${process.execPath}' -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(d)))"`;
  const value = 'abc ü€ "q" $x 😀';
  const r = await runCommand({ command: echo, stdin: value });
  assert.equal(r.exitCode, 0);
  assert.equal(JSON.parse(r.stdout.trim()), `${value}\n`);
  // Without stdin the input is empty and closed, so a program that reads it does not wait for ever.
  const none = await runCommand({ command: echo, timeoutSec: 20 });
  assert.equal(JSON.parse(none.stdout.trim()), '');
  // A command that never reads its input still finishes normally.
  const ignored = await runCommand({ command: 'Write-Output ok', stdin: 'x'.repeat(200_000) });
  assert.equal(ignored.exitCode, 0);
  assert.match(ignored.stdout, /ok/);
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

test('a native command that fails as the last statement gives its exit code', { skip }, async () => {
  const r = await runCommand({ command: 'cmd /c exit 5' });
  assert.equal(r.exitCode, 5);
});

test('a non-terminating error as the last statement gives exit code 1', { skip }, async () => {
  const r = await runCommand({ command: 'Write-Error "w"' });
  assert.equal(r.exitCode, 1);
});

test('a failing cmdlet as the last statement gives exit code 1', { skip }, async () => {
  const r = await runCommand({ command: 'Get-Item C:\\definitely-not-here-xyz' });
  assert.equal(r.exitCode, 1);
});

test('a successful last statement gives exit code 0, also with a trailing comment', { skip }, async () => {
  const ok = await runCommand({ command: 'Write-Output ok' });
  assert.equal(ok.exitCode, 0);
  const commented = await runCommand({ command: 'Write-Output ok # trailing comment' });
  assert.equal(commented.exitCode, 0);
  assert.match(commented.stdout, /ok/);
});

test('a native command that writes to stderr but exits 0 stays a success with 2>&1', { skip }, async () => {
  const node = await runCommand({ command: `& '${process.execPath}' -e "console.error('warn'); console.log('done')" 2>&1` });
  assert.equal(node.exitCode, 0, `stdout was: ${node.stdout}`);
  assert.match(node.stdout, /done/);
  const cmd = await runCommand({ command: 'cmd /c "echo err 1>&2" 2>&1' });
  assert.equal(cmd.exitCode, 0, `stdout was: ${cmd.stdout}`);
});

test('a native command that writes to stderr and fails keeps its exit code with 2>&1', { skip }, async () => {
  const r = await runCommand({ command: 'cmd /c "echo err 1>&2 & exit 4" 2>&1' });
  assert.equal(r.exitCode, 4);
});

test('strict mode in the command does not break the exit code or add stderr noise', { skip }, async () => {
  const ok = await runCommand({ command: 'Set-StrictMode -Version Latest; Write-Output ok' });
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.stderr.trim(), '');
  const failed = await runCommand({ command: 'Set-StrictMode -Version Latest; Write-Error "w"' });
  assert.equal(failed.exitCode, 1);
});

test('a command ending in a trailing backtick does not swallow the exit-code check', { skip }, async () => {
  const r = await runCommand({ command: 'Write-Output ok `' });
  assert.equal(r.stdout.trim(), 'ok');
  assert.equal(r.exitCode, 0);
});

test('reports that the command could not be prepared when the temporary folder is missing', { skip }, async () => {
  const missing = path.join(os.tmpdir(), `passclaude-missing-${Date.now()}`);
  assert.equal(fs.existsSync(missing), false);
  const savedTemp = process.env.TEMP;
  const savedTmp = process.env.TMP;
  process.env.TEMP = missing;
  process.env.TMP = missing;
  try {
    await assert.rejects(runCommand({ command: 'Write-Output ok' }), { name: 'Error', message: "Couldn't prepare the command." });
  } finally {
    restoreEnv('TEMP', savedTemp);
    restoreEnv('TMP', savedTmp);
  }
});

test('returns promptly when a grandchild keeps the output pipes open after PowerShell exits', { skip }, async () => {
  const started = Date.now();
  // Start-Process hands ping.exe our stdout pipe and PowerShell exits at once; ping then exits on its own after about 30 seconds.
  const r = await runCommand({ command: "Start-Process -NoNewWindow ping.exe -ArgumentList '-n','30','127.0.0.1' | Out-Null; Write-Output started", timeoutSec: 20 });
  assert.equal(r.timedOut, false);
  assert.match(r.stdout, /started/);
  assert.ok(Date.now() - started < 15_000);
});

test('stopAll stops a running command and removes its script file', { skip }, async () => {
  // The command writes the path of its own script file to a marker, so the test knows which file to look for.
  const marker = path.join(os.tmpdir(), `passclaude-marker-${process.pid}-${Date.now()}.txt`);
  const started = Date.now();
  const pending = runCommand({ command: `Set-Content -LiteralPath '${marker}' -Value $PSCommandPath; Start-Sleep -Seconds 30`, timeoutSec: 60 });
  try {
    while (!fs.existsSync(marker) || !fs.readFileSync(marker, 'utf8').trim()) {
      assert.ok(Date.now() - started < 15_000, 'the command never started');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const scriptPath = fs.readFileSync(marker, 'utf8').trim();
    assert.match(path.basename(scriptPath), /^passclaude-.*\.ps1$/);
    stopAll();
    const r = await pending;
    assert.ok(Date.now() - started < 10_000, 'the command was not stopped');
    assert.equal(r.timedOut, false);
    assert.equal(fs.existsSync(scriptPath), false, 'the script file was left behind');
  } finally {
    stopAll();
    fs.rmSync(marker, { force: true });
  }
});

test('stopAll stops several running commands at once, within the MCP client\'s 2 seconds', { skip }, async () => {
  const markers = [0, 1, 2].map((i) => path.join(os.tmpdir(), `passclaude-marker-${process.pid}-${Date.now()}-${i}.txt`));
  const runs = markers.map((m) => runCommand({ command: `Set-Content -LiteralPath '${m}' -Value x; Start-Sleep -Seconds 30`, timeoutSec: 60 }));
  try {
    const started = Date.now();
    while (!markers.every((m) => fs.existsSync(m))) {
      assert.ok(Date.now() - started < 15_000, 'the commands never started');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const stopping = Date.now();
    stopAll();
    assert.ok(Date.now() - stopping < 2000, `stopAll took ${Date.now() - stopping} ms`);
    for (const r of await Promise.all(runs)) assert.equal(r.timedOut, false);
    assert.ok(Date.now() - stopping < 5000, 'the commands were not stopped');
  } finally {
    stopAll();
    for (const m of markers) fs.rmSync(m, { force: true });
  }
});

test('stopAll with nothing running does nothing', { skip }, () => {
  assert.doesNotThrow(() => stopAll());
});

test('masking leaves no 8 characters of a value that PowerShell wraps or shortens', { skip }, async () => {
  const long = `eyJhbGciOiJIUzI1NiJ9.${'Q1w2E3r4T5y6U7i8O9p0'.repeat(10)}`.slice(0, 200);
  const token = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const secrets = [{ name: 'long', value: long }, { name: 'gh', value: token }];
  const runs = [
    // Format-List and the error view wrap the 200-character value; the error's CategoryInfo shortens it with '...'.
    await runCommand({ command: 'Get-ChildItem Env:T | Format-List; throw "x $env:T"', env: { T: long } }),
    // A native program's stderr line becomes an error record whose CategoryInfo shows the token's last 15 characters.
    await runCommand({ command: `& '${process.execPath}' -e "console.error('login failed: '+process.env.G)" 2>&1`, env: { G: token } }),
  ];
  // The shapes this test is about really are in the raw output.
  assert.ok(!(runs[0].stdout + runs[0].stderr).includes(long), 'the long value was not wrapped');
  assert.match(runs[1].stdout + runs[1].stderr, /\(login failed: g\.\.\./);
  for (const r of runs) {
    // Redacted the way run_with_secret does it, one stream at a time.
    const out = redactOutput(r.stdout, secrets, { truncated: r.truncated.stdout }) + redactOutput(r.stderr, secrets, { truncated: r.truncated.stderr });
    for (const { value } of secrets) {
      for (let i = 0; i + 8 <= value.length; i++) assert.ok(!out.includes(value.slice(i, i + 8)), `"${value.slice(i, i + 8)}" is visible in:\n${out}`);
    }
  }
});
