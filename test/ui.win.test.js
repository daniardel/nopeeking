import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL_EXE } from '../src/windows.js';
import { pngSize } from '../scripts/brand/ico.js';

const skip = process.platform !== 'win32';
const PS_DIR = fileURLToPath(new URL('../src/ps/', import.meta.url));
const RENDER = fileURLToPath(new URL('./fixtures/render-ui.ps1', import.meta.url));
const ps = (args) => execFileSync(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8' });

test('the save-a-secret window draws in the brand fonts, in each of its states', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-ui-'));
  try {
    const report = JSON.parse(ps(['-File', RENDER, '-Out', dir]).trim().split('\n').pop());
    assert.match(report.display, /Bricolage Grotesque/);
    assert.match(report.body, /DM Sans/);
    assert.match(report.mono, /JetBrains Mono/);
    assert.equal(report.webTitle, 'Save a password');
    assert.equal(report.commandTitle, 'Save a secret');
    assert.equal(report.oddSite, 'ex&<am>"ple.com', 'site shown as plain text');
    assert.equal(report.mismatchError, "The two entries don't match.");
    assert.equal(report.errorShown, true);
    assert.equal(report.shownText, true, 'show mode displays exactly what was typed');
    assert.equal(report.okAfterToggle, true, 'hiding again keeps the value');
    for (const name of ['prompt-web', 'prompt-command', 'prompt-error', 'prompt-shown']) {
      const { width, height } = pngSize(readFileSync(join(dir, `${name}.png`)));
      assert.ok(width >= 900 && height >= 700, `${name}.png is ${width}×${height}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the typed notification says what was typed where, stays on top and never takes focus', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-ui-'));
  try {
    const report = JSON.parse(ps(['-File', RENDER, '-Out', dir]).trim().split('\n').pop());
    assert.equal(report.toastTitle, 'Typed your netflix password');
    assert.equal(report.toastDetail, 'Into netflix.com in Chrome. It never went through the chat.');
    assert.equal(report.toastTakesFocus, false);
    assert.equal(report.toastTopmost, true);
    assert.equal(report.toastInTaskbar, false);
    const { width, height } = pngSize(readFileSync(join(dir, 'toast.png')));
    assert.ok(width >= 600 && height >= 150, `toast.png is ${width}×${height}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the PowerShell scripts are plain ASCII, because Windows PowerShell reads them as ANSI', () => {
  for (const file of readdirSync(PS_DIR).filter((f) => f.endsWith('.ps1'))) {
    const bad = readFileSync(join(PS_DIR, file), 'utf8').match(/[^\x00-\x7F]/);
    assert.equal(bad, null, `${file} has "${bad?.[0]}": write it as [char]0x… in code or &#…; in XAML`);
  }
});

test('the popup refuses short, long and mismatched entries with a plain message', { skip }, () => {
  const out = ps([
    '-Command',
    `. '${PS_DIR}prompt-ui.ps1'; ` +
      "@((Test-PromptEntries 'abc' 'abc'), (Test-PromptEntries ('x' * 1281) ('x' * 1281)), (Test-PromptEntries 'abcd' 'abcD'), " +
      "(Test-PromptEntries 'abcd' 'abcd'), (Test-PromptEntries ('x' * 1280) ('x' * 1280))) | ForEach-Object { if ($null -eq $_) { 'ok' } else { $_ } }",
  ]);
  assert.deepEqual(out.trim().split(/\r?\n/), [
    'Too short: at least 4 characters.',
    'Too long: at most 1280 characters.',
    "The two entries don't match.",
    'ok',
    'ok',
  ]);
});
