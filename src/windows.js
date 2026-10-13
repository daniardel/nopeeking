// Runs passClaude's bundled PowerShell scripts. Secrets only ever travel over stdin/stdout, never in arguments.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PS_DIR = fileURLToPath(new URL('./ps/', import.meta.url));

// Exit codes shared with the scripts in src/ps/.
export const EXIT = { OK: 0, NOT_FOUND: 3, EXISTS: 4, TOO_LONG: 5, CANCELLED: 6, REFUSED: 7 };

export function runPs(script, args = [], stdin = '', { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${PS_DIR}${script}`, ...args],
      { windowsHide: true },
    );
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.stdin.on('error', () => {});
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8').replace(/^﻿/, ''),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.end(stdin, 'utf8');
  });
}
