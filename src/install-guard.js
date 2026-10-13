// `npx passclaude install-guard`: copies the guard to ~/.claude/passclaude/ and registers it in
// ~/.claude/settings.json, after showing the exact change and asking first. Backs the file up before writing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const GUARD_SOURCE = fileURLToPath(new URL('../hook/guard.cjs', import.meta.url));
// The MCP tool is listed too: a run_with_secret command can run passClaude's own cred.ps1 and print a saved value.
export const MATCHER = 'Bash|PowerShell|mcp__passclaude__run_with_secret';

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
  const guardPath = path.join(claudeDir, 'passclaude', 'guard.cjs');
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

  const { settings, changed } = addGuardHook(current, command);
  if (!changed) {
    fs.mkdirSync(path.dirname(guardPath), { recursive: true }); // the hook entry can outlive this folder
    fs.copyFileSync(GUARD_SOURCE, guardPath); // refresh the copy in case passClaude was updated
    log('The passClaude guard is already installed.');
    return 0;
  }

  const entry = { matcher: MATCHER, hooks: [{ type: 'command', command }] };
  log(`This adds the passClaude guard to ${settingsPath}:\n`);
  log(JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, 2));
  log('\nIt blocks shell commands that try to read saved secrets directly. Your current settings are backed up first.');
  if (!(await ask('Add it? (y/N) '))) {
    log('Nothing changed.');
    return 0;
  }

  fs.mkdirSync(path.dirname(guardPath), { recursive: true });
  fs.copyFileSync(GUARD_SOURCE, guardPath);
  if (fs.existsSync(settingsPath)) {
    const backup = `${settingsPath}.passclaude-backup-${Date.now()}`;
    fs.copyFileSync(settingsPath, backup);
    log(`Backup saved: ${backup}`);
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  log('Guard installed. Restart Claude Code to turn it on.');
  return 0;
}
