// Runs passClaude's bundled PowerShell scripts. Secrets only ever travel over stdin/stdout, never in arguments.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PS_DIR = fileURLToPath(new URL('./ps/', import.meta.url));

// Absolute path, never the bare name: a bare "powershell.exe" can be satisfied by a file in the current directory
// (an MCP server runs with the project folder as cwd), which would run attacker code and receive secrets on stdin.
export const POWERSHELL_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// Exit codes shared with the scripts in src/ps/.
export const EXIT = { OK: 0, NOT_FOUND: 3, EXISTS: 4, TOO_LONG: 5, CANCELLED: 6, REFUSED: 7 };

export function runPs(script, args = [], stdin = '', { timeoutMs = 30_000, signal } = {}) {
  if (signal?.aborted) return Promise.resolve({ code: -1, stdout: '', stderr: '' });
  return new Promise((resolve, reject) => {
    const child = spawn(
      POWERSHELL_EXE,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${PS_DIR}${script}`, ...args],
      { windowsHide: true, cwd: PS_DIR },
    );
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.stdin.on('error', () => {});
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const stop = () => child.kill();
    signal?.addEventListener('abort', stop, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8').replace(/^\uFEFF/, ''),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.end(stdin, 'utf8');
  });
}
