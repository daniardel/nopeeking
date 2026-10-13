// Runs a Windows PowerShell command with secrets added as environment variables.
// Returns raw output; the caller redacts it before it reaches Claude.
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { POWERSHELL_EXE } from './windows.js';

export const OUTPUT_CAP = 1024 * 1024;

// Absolute path for the same reason as POWERSHELL_EXE: a bare "taskkill" could resolve to a file planted in the current directory.
const TASKKILL_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
// PowerShell has exited, but a program it started may still hold the output pipes open. Wait this long for them to close.
const EXIT_GRACE_MS = 2000;
// After taskkill, how long to wait for PowerShell to exit before killing it directly.
const KILL_BACKSTOP_MS = 5000;

const CLIXML_START = /^\s*#< CLIXML/;
// Text of a stream record, <S S="Error">...</S>. Other elements (progress records, <S N="..."> properties) are skipped.
// The $ alternative takes a record cut off by the output cap.
const CLIXML_RECORD = /<S\s+S="[^"]*">([\s\S]*?)(?:<\/S>|$)/g;
const XML_ENTITY = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
const XML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const PS_ESCAPE = /_x([0-9a-fA-F]{4})_/g;

// Windows PowerShell writes stderr as CLIXML (XML-escaped, with _xHHHH_ escapes) when it has errors to report.
// Returns the plain text. Text that is not CLIXML passes through unchanged.
export function decodeCliXml(text) {
  if (!CLIXML_START.test(text)) return text;
  const pieces = [];
  for (const [, body] of text.matchAll(CLIXML_RECORD)) {
    // A raw "<" never occurs in text content, so a "<" and everything after it is a tag cut off by the cap.
    const visible = body.replace(/<[^>]*$/, '');
    pieces.push(unescapeXml(visible).replace(PS_ESCAPE, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
  }
  return pieces.join('');
}

// One pass, so "&amp;lt;" becomes "&lt;" and not "<".
function unescapeXml(text) {
  return text.replace(XML_ENTITY, (match, name) => {
    if (name in XML_NAMED) return XML_NAMED[name];
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

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
    let exitCode = null;
    let settled = false;
    let timer = null;
    let graceTimer = null;
    let backstopTimer = null;

    // Settles the promise once and clears every timer.
    const settle = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      clearTimeout(backstopTimer);
      action();
    };
    const finish = (code) =>
      settle(() =>
        resolve({
          exitCode: code,
          timedOut,
          stdout: Buffer.concat(chunks.stdout).toString('utf8'),
          stderr: decodeCliXml(Buffer.concat(chunks.stderr).toString('utf8')),
          truncated,
        }),
      );

    timer = setTimeout(() => {
      timedOut = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      execFile(TASKKILL_EXE, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      backstopTimer = setTimeout(() => {
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
        child.stdout.destroy();
        child.stderr.destroy();
        finish(exitCode);
      }, EXIT_GRACE_MS);
    });
    child.on('close', (code) => finish(code));
    child.on('error', (e) => settle(() => reject(e)));
    child.stdin.on('error', () => {});
    child.stdin.end();
  });
}
