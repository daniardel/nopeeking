import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWinOps } from '../src/winops.js';

const fakeRun = (stdout, code = 0) => async () => ({ code, stdout, stderr: '' });

test('chromeWindows parses one window, many windows and an empty list', async () => {
  const one = '{"hwnd":"1","url":"a.com","foreground":true}';
  assert.deepEqual(await createWinOps({ run: fakeRun(one) }).chromeWindows(), [{ hwnd: '1', url: 'a.com', foreground: true }]);
  assert.deepEqual(await createWinOps({ run: fakeRun(`[${one},${one}]`) }).chromeWindows(), [JSON.parse(one), JSON.parse(one)]);
  assert.deepEqual(await createWinOps({ run: fakeRun('') }).chromeWindows(), []);
});

test('chromeWindows never lets script output into its error messages', async () => {
  const garbage = 'my pin 1234 {not json';
  await assert.rejects(createWinOps({ run: fakeRun(garbage) }).chromeWindows(), (e) => {
    assert.equal(e.message, "Couldn't read the Chrome window list.");
    return true;
  });
  await assert.rejects(createWinOps({ run: fakeRun(garbage, 1) }).chromeWindows(), (e) => {
    assert.equal(e.message, "Couldn't inspect Chrome windows (exit code 1).");
    return true;
  });
});

test('typeInto returns TYPED, the refusal code, or the exit code', async () => {
  assert.equal(await createWinOps({ run: fakeRun('TYPED') }).typeInto('n', '1', 'a.com'), 'TYPED');
  assert.equal(await createWinOps({ run: fakeRun('NOT_PASSWORD_FIELD', 7) }).typeInto('n', '1', 'a.com'), 'NOT_PASSWORD_FIELD');
  assert.equal(await createWinOps({ run: fakeRun('', 1) }).typeInto('n', '1', 'a.com'), 'EXIT_1');
});
