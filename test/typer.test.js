import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeSecret } from '../src/typer.js';
import { memoryVault } from './helpers.js';

async function setup(windows, typeResult = 'TYPED') {
  const vault = memoryVault();
  await vault.put('netflix', { kind: 'web', site: 'netflix.com', created: 'x' }, 'web-secret-1');
  await vault.put('gh', { kind: 'command', created: 'x' }, 'cmd-secret-1');
  const typed = [];
  const win = {
    chromeWindows: async () => windows,
    typeInto: async (name, hwnd, url, site) => { typed.push({ name, hwnd, url, site }); return typeResult; },
  };
  return { vault, win, typed };
}

test('types into the foreground Chrome window when it is on the locked site', async () => {
  const { vault, win, typed } = await setup([
    { hwnd: '1', url: 'other.com', foreground: false },
    { hwnd: '2', url: 'www.netflix.com/login', foreground: true },
  ]);
  assert.deepEqual(await typeSecret({ name: 'netflix', vault, win }), { ok: true, site: 'netflix.com' });
  assert.deepEqual(typed, [{ name: 'netflix', hwnd: '2', url: 'www.netflix.com/login', site: 'netflix.com' }]);
});

test('uses a background Chrome window when it is the only one on the site', async () => {
  const { vault, win, typed } = await setup([
    { hwnd: '1', url: 'netflix.com/login', foreground: false },
    { hwnd: '2', url: 'other.com', foreground: true },
  ]);
  assert.deepEqual(await typeSecret({ name: 'netflix', vault, win }), { ok: true, site: 'netflix.com' });
  assert.equal(typed[0].hwnd, '1');
});

test('refuses lookalike sites and never types', async () => {
  const { vault, win, typed } = await setup([{ hwnd: '1', url: 'netflix.com.evil.ru/login', foreground: true }]);
  const r = await typeSecret({ name: 'netflix', vault, win });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Site lock/);
  assert.match(r.reason, /netflix\.com\.evil\.ru/);
  assert.equal(typed.length, 0);
});

test('refuses when two background windows are on the site', async () => {
  const { vault, win, typed } = await setup([
    { hwnd: '1', url: 'netflix.com', foreground: false },
    { hwnd: '2', url: 'netflix.com/browse', foreground: false },
  ]);
  const r = await typeSecret({ name: 'netflix', vault, win });
  assert.match(r.reason, /Several Chrome windows/);
  assert.equal(typed.length, 0);
});

test('refuses command secrets, unknown names and a missing Chrome', async () => {
  const { vault, win } = await setup([{ hwnd: '1', url: 'netflix.com', foreground: true }]);
  assert.match((await typeSecret({ name: 'gh', vault, win })).reason, /command secret/);
  assert.match((await typeSecret({ name: 'nope', vault, win })).reason, /No secret named "nope"/);
  const empty = await setup([]);
  assert.match((await typeSecret({ name: 'netflix', vault: empty.vault, win: empty.win })).reason, /Couldn't read any Chrome window\. .*visible tab.*completely covered/);
});

test('explains each refusal from the typing script', async () => {
  const cases = [
    ['NOT_PASSWORD_FIELD', /not a password field/],
    ['NO_FOCUS', /unlocked/],
    ['URL_CHANGED', /page changed/],
    ['INTERRUPTED', /partly filled/],
    ['NOT_FOUND', /disappeared/],
    ['FOCUS_MOVED', /lost focus.*partly filled/],
    ['NOT_HTTPS', /isn't https.*Nothing was typed/],
    ['OTHER_FRAME', /another website.*Nothing was typed/],
    ['PAGE_UNKNOWN', /Nothing was typed/],
    ['WEIRD', /Typing failed \(WEIRD\)/],
  ];
  for (const [code, pattern] of cases) {
    const { vault, win } = await setup([{ hwnd: '1', url: 'netflix.com', foreground: true }], code);
    const r = await typeSecret({ name: 'netflix', vault, win });
    assert.equal(r.ok, false);
    assert.match(r.reason, pattern);
    if (code === 'WEIRD') {
      assert.doesNotMatch(r.reason, /Nothing was typed/);
      assert.match(r.reason, /partly filled/);
    }
  }
});

test('the site lock refusal never echoes address-bar text, only web hosts or "a non-web page"', async () => {
  const { vault, win, typed } = await setup([
    { hwnd: '1', url: 'my pin 1234', foreground: true },
    { hwnd: '2', url: 'hunter2', foreground: false },
    { hwnd: '3', url: 'file:///C:/Users/x/secret.txt', foreground: false },
    { hwnd: '4', url: 'https://user:pw@netflix.com/', foreground: false },
    { hwnd: '5', url: 'chrome://settings/passwords', foreground: false },
    { hwnd: '6', url: 'netflix.com.evil.ru/login', foreground: false },
    { hwnd: '7', url: 'localhost:8765/login.html', foreground: false },
  ]);
  const r = await typeSecret({ name: 'netflix', vault, win });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Site lock: "netflix" is locked to netflix.com, but Chrome is showing a non-web page, netflix.com.evil.ru, localhost. Nothing was typed. NoPeeking reads the tab each Chrome window is showing: make the login page the visible tab, then try again.');
  for (const leaked of ['my pin 1234', 'pin 1234', 'hunter2', 'file:', 'secret.txt', 'user:pw', 'chrome://', 'settings/passwords']) {
    assert.ok(!r.reason.includes(leaked), `reason leaks "${leaked}": ${r.reason}`);
  }
  assert.equal(typed.length, 0);
});
