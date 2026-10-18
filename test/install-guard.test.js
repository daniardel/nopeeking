import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addGuardHook, guardCommand, installGuard, MATCHER } from '../src/install-guard.js';

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
