// Runs a Windows PowerShell command with secrets added as environment variables.
// Returns raw output; the caller redacts it before it reaches Claude.
import { spawn, execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POWERSHELL_EXE } from './windows.js';

export const OUTPUT_CAP = 1024 * 1024;

// Absolute path for the same reason as POWERSHELL_EXE: a bare "taskkill" could resolve to a file planted in the current directory.
const TASKKILL_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
// PowerShell has exited, but a program it started may still hold the output pipes open. Wait this long for them to close.
const EXIT_GRACE_MS = 2000;
// After taskkill, how long to wait for PowerShell to exit before killing it directly.
const KILL_BACKSTOP_MS = 5000;
// How long stopAll() lets taskkill run. The server exits right after, and the MCP client kills it 2 seconds after closing stdin.
const STOP_ALL_KILL_MS = 1200;

// Appended after the user's command, with a blank line between so a trailing backtick in the command cannot join it. -File exits 0
// even when the last statement failed, so this reads $? first and exits non-zero for a failing last statement. A command that
// calls exit or throws never gets here, which is right. Details that matter:
// - Set-StrictMode -Off comes right after $? is read, because under strict mode reading an unset $LASTEXITCODE throws.
// - In Windows PowerShell 5.1, `native 2>&1` makes $? false whenever the program writes to stderr, even when it exits 0. That
//   leaves a native stderr record (id NativeCommandError, or NativeCommandErrorMessage for later lines) as the latest error and
//   $LASTEXITCODE 0 or unset, which counts as success. A non-zero $LASTEXITCODE always wins.
const POSTAMBLE = [
  '$passclaudeOk = $?',
  'Set-StrictMode -Off',
  '$passclaudeCode = $LASTEXITCODE',
  "$passclaudeId = if ($Error.Count -gt 0) { $Error[0].FullyQualifiedErrorId } else { '' }",
  'if (-not $passclaudeOk) {',
  '  if ($passclaudeCode) { exit $passclaudeCode }',
  "  elseif ($passclaudeId -ne 'NativeCommandError' -and $passclaudeId -ne 'NativeCommandErrorMessage') { exit 1 }",
  '}',
].join('\n');

// Best effort. A file that PowerShell still has open cannot be deleted yet, and nothing depends on it going.
function removeScript(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // ignored
  }
}

// Commands that are running right now: { child, scriptPath }. A run leaves the set when it settles.
const live = new Set();

/**
 * Stops every running command and removes its script file, all synchronously, because the server calls this just before it exits.
 * On Windows a child outlives its parent, so without this a command would keep running with its secrets in its environment,
 * with no timeout, and leave its script file behind. Errors are ignored: this is a last-moment cleanup.
 */
export function stopAll() {
  const runs = [...live];
  // A child that has already exited may have had its process id reused, so it is left alone.
  const pids = runs.filter(({ child }) => child.exitCode === null && child.signalCode === null).map(({ child }) => String(child.pid));
  if (pids.length > 0) {
    // One taskkill for all of them, bounded, so shutdown stays inside the MCP client's 2 seconds however many are running.
    try {
      execFileSync(TASKKILL_EXE, [...pids.flatMap((pid) => ['/pid', pid]), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: STOP_ALL_KILL_MS });
    } catch {
      // ignored
    }
  }
  // The script files go after every process has been killed, so none of them is still held open.
  for (const { scriptPath } of runs) removeScript(scriptPath);
}

export function runCommand({ command, env = {}, cwd, timeoutSec = 120 }) {
  const script = `$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n${command}\n\n${POSTAMBLE}`;
  return new Promise((resolve, reject) => {
    // A script file, not -EncodedCommand: for encoded commands PowerShell writes stderr as XML (CLIXML), which escapes the text
    // and mixes it with plain lines. The BOM tells Windows PowerShell 5.1 that the file is UTF-8.
    const scriptPath = path.join(os.tmpdir(), `passclaude-${crypto.randomUUID()}.ps1`);
    try {
      fs.writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8');
    } catch {
      removeScript(scriptPath);
      reject(new Error("Couldn't prepare the command."));
      return;
    }
    let child;
    try {
      child = spawn(
        POWERSHELL_EXE,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { cwd, env: { ...process.env, ...env }, windowsHide: true },
      );
    } catch (e) {
      removeScript(scriptPath);
      reject(e);
      return;
    }
    const run = { child, scriptPath };
    live.add(run);
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    const truncated = { stdout: false, stderr: false };
    for (const key of ['stdout', 'stderr']) {
      child[key].on('data', (chunk) => {
        const room = OUTPUT_CAP - sizes[key];
        if (chunk.length > room) truncated[key] = true;
        if (room <= 0) return;
        const part = chunk.subarray(0, room);
        chunks[key].push(part);
        sizes[key] += part.length;
      });
    }
    const dropPipes = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };
    let timedOut = false;
    let exitCode = null;
    let settled = false;
    let timer = null;
    let graceTimer = null;
    let backstopTimer = null;

    // Settles the promise once, clears every timer and deletes the script file.
    const settle = (action) => {
      if (settled) return;
      settled = true;
      live.delete(run);
      clearTimeout(timer);
      clearTimeout(graceTimer);
      clearTimeout(backstopTimer);
      removeScript(scriptPath);
      action();
    };
    const finish = (code) =>
      settle(() =>
        resolve({
          exitCode: code,
          timedOut,
          stdout: Buffer.concat(chunks.stdout).toString('utf8'),
          stderr: Buffer.concat(chunks.stderr).toString('utf8'),
          truncated,
        }),
      );

    timer = setTimeout(() => {
      timedOut = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      execFile(TASKKILL_EXE, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      backstopTimer = setTimeout(() => {
        dropPipes();
        child.kill();
        finish(exitCode);
      }, KILL_BACKSTOP_MS);
    }, timeoutSec * 1000);
    child.on('exit', (code) => {
      if (settled) return;
      exitCode = code;
      clearTimeout(timer);
      clearTimeout(backstopTimer);
      graceTimer = setTimeout(() => {
        dropPipes();
        finish(exitCode);
      }, EXIT_GRACE_MS);
    });
    child.on('close', (code) => finish(code));
    child.on('error', (e) => settle(() => reject(e)));
    child.stdin.on('error', () => {});
    child.stdin.end();
  });
}
