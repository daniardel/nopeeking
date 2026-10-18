import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POWERSHELL_EXE } from '../src/windows.js';

const skip = process.platform !== 'win32';
const PS_DIR = fileURLToPath(new URL('../src/ps/', import.meta.url));

// Runs Test-FrameUrl from chromeui.ps1 on each [url, site] pair, in one PowerShell.
function frameVerdicts(pairs) {
  const script = `. '${PS_DIR}common.ps1'; . '${PS_DIR}chromeui.ps1'
$pairs = [Console]::In.ReadToEnd() | ConvertFrom-Json
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject @($pairs | ForEach-Object { Test-FrameUrl $_[0] $_[1] })))`;
  const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    input: JSON.stringify(pairs), encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('typing needs the password box to be on an https page of the locked site', { skip }, () => {
  const cases = [
    ['https://www.netflix.com/login', 'netflix.com', 'OK'],
    ['https://netflix.com/', 'netflix.com', 'OK'],
    ['https://NETFLIX.com./login', 'netflix.com', 'OK'],
    ['http://www.netflix.com/login', 'netflix.com', 'NOT_HTTPS'],
    ['http://localhost:3000/login', 'localhost', 'OK'],
    ['http://127.0.0.1:8080/', '127.0.0.1', 'OK'],
    ['https://evil.example/frame', 'netflix.com', 'OTHER_FRAME'],
    ['https://netflix.com.evil.ru/', 'netflix.com', 'OTHER_FRAME'],
    ['https://notnetflix.com/', 'netflix.com', 'OTHER_FRAME'],
    ['ftp://netflix.com/', 'netflix.com', 'NOT_HTTPS'],
    ['', 'netflix.com', 'PAGE_UNKNOWN'],
    ['not a url', 'netflix.com', 'PAGE_UNKNOWN'],
  ];
  assert.deepEqual(frameVerdicts(cases.map(([url, site]) => [url, site])), cases.map(([, , verdict]) => verdict));
});
