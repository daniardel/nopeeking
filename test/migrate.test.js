import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../src/migrate.js';

const run = async (result) => {
  const lines = [];
  const code = await migrate({ vault: { migrate: async () => { if (result instanceof Error) throw result; return result; } }, log: (l) => lines.push(l) });
  return { code, out: lines.join('\n') };
};

test('migrate reports what it moved and what it left in place, by name only', async () => {
  assert.deepEqual(await run({ moved: [], kept: [] }), { code: 0, out: 'No passClaude secrets found. Nothing to move.' });
  const { code, out } = await run({ moved: ['netflix', 'github'], kept: ['hulu'] });
  assert.equal(code, 0);
  assert.match(out, /Moved 2 secrets to NoPeeking: netflix, github/);
  assert.match(out, /Left in place.*: hulu/);
  assert.deepEqual(await run(new Error('Windows Credential Manager migration failed (exit code 1).')), {
    code: 1, out: "Couldn't move the secrets: Windows Credential Manager migration failed (exit code 1).",
  });
});
