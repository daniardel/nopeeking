import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addGuardHook, guardCommand, installGuard, MATCHER, removeOldGuardHooks } from '../src/install-guard.js';

/** A fresh home folder for one test, removed again when the test ends. */
function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}
const quiet = () => {};

test('addGuardHook adds one entry and keeps everything else', () => {
  const before = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'lint' }] }], Stop: [] } };
  const { settings, changed } = addGuardHook(before, 'node "C:/g.cjs"');
  assert.equal(changed, true);
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.hooks.Stop, []);
  assert.deepEqual(settings.hooks.PreToolUse[1], { matcher: MATCHER, hooks: [{ type: 'command', command: 'node "C:/g.cjs"' }] });
  assert.equal(before.hooks.PreToolUse.length, 1, 'the input object is not modified');
  assert.equal(addGuardHook(settings, 'node "C:/g.cjs"').changed, false);
  assert.equal(addGuardHook(undefined, 'x').settings.hooks.PreToolUse.length, 1);
});

test('installGuard asks first and changes nothing on no', async (t) => {
  const home = tempHome(t);
  assert.equal(await installGuard({ home, ask: async () => false, log: quiet }), 0);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});

test('installGuard copies the guard, backs up settings and registers the hook on yes', async (t) => {
  const home = tempHome(t);
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'settings.json'), '\uFEFF{"model":"opus"}');
  let question = '';
  assert.equal(await installGuard({ home, ask: async (q) => { question = q; return true; }, log: quiet }), 0);
  assert.match(question, /\(y\/N\)/);
  const guardPath = path.join(dir, 'nopeeking', 'guard.cjs');
  assert.ok(fs.existsSync(guardPath));
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.equal(settings.model, 'opus');
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, guardCommand(guardPath));
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('settings.json.nopeeking-backup-')).length, 1);

  // A second run does not ask and does not add a second entry.
  assert.equal(await installGuard({ home, ask: async () => assert.fail('asked twice'), log: quiet }), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).hooks.PreToolUse.length, 1);
});

test('installGuard refuses to touch settings it cannot read', async (t) => {
  const home = tempHome(t);
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ broken');
  assert.equal(await installGuard({ home, ask: async () => true, log: quiet }), 1);
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'), '{ broken');
});

test('installGuard restores the guard file when only its nopeeking folder was deleted', async (t) => {
  const home = tempHome(t);
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir);
  const guardPath = path.join(dir, 'nopeeking', 'guard.cjs');
  assert.equal(await installGuard({ home, ask: async () => true, log: quiet }), 0);
  fs.rmSync(path.join(dir, 'nopeeking'), { recursive: true, force: true });

  // The hook entry is still in settings, so this is the "already installed" path: no question, the file comes back.
  assert.equal(await installGuard({ home, ask: async () => assert.fail('asked again'), log: quiet }), 0);
  assert.ok(fs.existsSync(guardPath));
});

test('removeOldGuardHooks takes out only passClaude guard hooks, and entries left empty', () => {
  const before = { hooks: { PreToolUse: [
    { matcher: 'Bash|PowerShell|mcp__passclaude__run_with_secret', hooks: [{ type: 'command', command: 'node "C:/Users/x/.claude/passclaude/guard.cjs"' }] },
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }, { type: 'command', command: 'node C:\\Users\\x\\.claude\\passclaude\\guard.cjs' }] },
    { matcher: 'Edit', hooks: [{ type: 'command', command: 'format' }] },
  ] } };
  const { settings, removed } = removeOldGuardHooks(before);
  assert.equal(removed.length, 2);
  assert.deepEqual(settings.hooks.PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }] },
    { matcher: 'Edit', hooks: [{ type: 'command', command: 'format' }] },
  ]);
  assert.equal(before.hooks.PreToolUse.length, 3, 'the input object is not modified');
  assert.deepEqual(removeOldGuardHooks({ model: 'opus' }), { settings: { model: 'opus' }, removed: [] });
});

test('installGuard replaces the passClaude guard: one question, old hook and file gone, new one in', async (t) => {
  const home = tempHome(t);
  const dir = path.join(home, '.claude');
  fs.mkdirSync(path.join(dir, 'passclaude'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'passclaude', 'guard.cjs'), '// old guard');
  const oldCommand = `node "${path.join(dir, 'passclaude', 'guard.cjs').replace(/\\/g, '/')}"`;
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: oldCommand }] }] } }));
  const lines = [];
  assert.equal(await installGuard({ home, ask: async () => true, log: (l) => lines.push(l) }), 0);
  assert.match(lines.join('\n'), /also removes the guard of passClaude/);
  const hooks = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).hooks.PreToolUse;
  assert.deepEqual(hooks.map((e) => e.hooks[0].command), [guardCommand(path.join(dir, 'nopeeking', 'guard.cjs'))]);
  assert.equal(fs.existsSync(path.join(dir, 'passclaude')), false);
});

test('installGuard with the NoPeeking guard already in still offers to remove a leftover passClaude guard', async (t) => {
  const home = tempHome(t);
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir);
  assert.equal(await installGuard({ home, ask: async () => true, log: quiet }), 0);
  const settingsPath = path.join(dir, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "C:/u/.claude/passclaude/guard.cjs"' }] });
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  let question = '';
  assert.equal(await installGuard({ home, ask: async (q) => { question = q; return true; }, log: quiet }), 0);
  assert.match(question, /Remove it\? \(y\/N\)/);
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks.PreToolUse.length, 1);
});
