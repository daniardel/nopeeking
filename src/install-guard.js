// `node src/cli.js install-guard`: copies the guard to ~/.claude/nopeeking/ and registers it in
// ~/.claude/settings.json, after showing the exact change and asking first. Backs the file up before writing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const GUARD_SOURCE = fileURLToPath(new URL('../hook/guard.cjs', import.meta.url));
// The MCP tool is listed too: a run_with_secret command can run NoPeeking's own cred.ps1 and print a saved value.
export const MATCHER = 'Bash|PowerShell|mcp__nopeeking__run_with_secret';

export function guardCommand(guardPath) {
  return `node "${guardPath.replace(/\\/g, '/')}"`;
}

export function addGuardHook(settings, command) {
  const next = structuredClone(settings ?? {});
  next.hooks ??= {};
  next.hooks.PreToolUse ??= [];
  const present = next.hooks.PreToolUse.some((entry) => entry?.hooks?.some((h) => h?.command === command));
  if (present) return { settings: next, changed: false };
  next.hooks.PreToolUse.push({ matcher: MATCHER, hooks: [{ type: 'command', command }] });
  return { settings: next, changed: true };
}

// The guard passClaude (NoPeeking's name before 0.2.0) installed at ~/.claude/passclaude/guard.cjs. NoPeeking's guard covers
// everything it did, so it goes when NoPeeking's is installed.
const OLD_GUARD_RE = /[\\/]passclaude[\\/]guard\.cjs/i;

/** settings without passClaude's guard hooks, and the commands that were taken out. Entries left with no hooks go too. */
export function removeOldGuardHooks(settings) {
  const next = structuredClone(settings ?? {});
  const removed = [];
  if (!Array.isArray(next.hooks?.PreToolUse)) return { settings: next, removed };
  next.hooks.PreToolUse = next.hooks.PreToolUse.flatMap((entry) => {
    if (!Array.isArray(entry?.hooks)) return [entry];
    const kept = entry.hooks.filter((h) => {
      const old = typeof h?.command === 'string' && OLD_GUARD_RE.test(h.command);
      if (old) removed.push(h.command);
      return !old;
    });
    if (kept.length === entry.hooks.length) return [entry];
    return kept.length === 0 ? [] : [{ ...entry, hooks: kept }];
  });
  return { settings: next, removed };
}

async function askYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

export async function installGuard({ home = os.homedir(), ask = askYesNo, log = console.log } = {}) {
  const claudeDir = path.join(home, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const guardPath = path.join(claudeDir, 'nopeeking', 'guard.cjs');
  const command = guardCommand(guardPath);

  let current = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const text = fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, '');
      current = text.trim() ? JSON.parse(text) : {};
    } catch {
      log(`Couldn't read ${settingsPath} (it is not valid JSON). Fix it and try again. Nothing changed.`);
      return 1;
    }
  }

  const added = addGuardHook(current, command);
  const { settings, removed } = removeOldGuardHooks(added.settings);
  if (!added.changed && removed.length === 0) {
    fs.mkdirSync(path.dirname(guardPath), { recursive: true }); // the hook entry can outlive this folder
    fs.copyFileSync(GUARD_SOURCE, guardPath); // refresh the copy in case NoPeeking was updated
    log('The NoPeeking guard is already installed.');
    return 0;
  }

  if (added.changed) {
    const entry = { matcher: MATCHER, hooks: [{ type: 'command', command }] };
    log(`This adds the NoPeeking guard to ${settingsPath}:\n`);
    log(JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, 2));
    log('\nIt blocks shell commands that try to read saved secrets directly.');
  }
  if (removed.length > 0) {
    const what = added.changed ? 'It also removes' : `This removes from ${settingsPath}`;
    log(`${what} the guard of passClaude (NoPeeking's old name), which NoPeeking's guard replaces:`);
    for (const old of removed) log(`  ${old}`);
  }
  log('Your current settings are backed up first.');
  if (!(await ask(added.changed ? 'Add it? (y/N) ' : 'Remove it? (y/N) '))) {
    log('Nothing changed.');
    return 0;
  }

  fs.mkdirSync(path.dirname(guardPath), { recursive: true });
  fs.copyFileSync(GUARD_SOURCE, guardPath);
  if (fs.existsSync(settingsPath)) {
    const backup = `${settingsPath}.nopeeking-backup-${Date.now()}`;
    fs.copyFileSync(settingsPath, backup);
    log(`Backup saved: ${backup}`);
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  if (removed.length > 0) {
    const oldDir = path.join(claudeDir, 'passclaude');
    fs.rmSync(path.join(oldDir, 'guard.cjs'), { force: true });
    try {
      fs.rmdirSync(oldDir); // only when nothing else is in it
    } catch {
      // not empty, or already gone
    }
  }
  log('Guard installed. Restart Claude Code to turn it on.');
  return 0;
}
