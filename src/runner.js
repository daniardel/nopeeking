// Runs a Windows PowerShell command with secrets added as environment variables.
// Returns raw output; the caller redacts it before it reaches Claude.
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { POWERSHELL_EXE } from './windows.js';

export const OUTPUT_CAP = 1024 * 1024;

// Absolute path for the same reason as POWERSHELL_EXE: a bare "taskkill" could resolve to a file planted in the current directory.
const TASKKILL_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');

export function runCommand({ command, env = {}, cwd, timeoutSec = 120 }) {
  const script = `$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n${command}`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      POWERSHELL_EXE,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { cwd, env: { ...process.env, ...env }, windowsHide: true },
    );
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
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      execFile(TASKKILL_EXE, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    }, timeoutSec * 1000);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut,
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
        truncated,
      });
    });
    child.stdin.end();
  });
}
