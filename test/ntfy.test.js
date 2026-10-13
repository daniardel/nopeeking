import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNtfy } from '../src/ntfy.js';

const encode = (s) => new TextEncoder().encode(s);

test('subscribe parses JSON lines split across chunks and skips non-messages', async () => {
  const chunks = [
    '{"event":"open"}\n{"event":"message","id":"a","message":"hel',
    'lo"}\n{"event":"keepalive"}\nnot json\n',
    '{"event":"message","id":"b","message":"world"}\n',
  ];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, body: (async function* () { for (const c of chunks) yield encode(c); })() };
  };
  const got = [];
  await createNtfy({ baseUrl: 'https://relay.test/', fetchImpl }).subscribe('topic1', (m, id) => { got.push([m, id]); }, { since: '123' });
  assert.deepEqual(got, [['hello', 'a'], ['world', 'b']]);
  assert.deepEqual(urls, ['https://relay.test/topic1/json?since=123']);
});

test('publish posts the body and returns the message info', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'x1' }) }; };
  const ntfy = createNtfy({ baseUrl: 'https://relay.test', fetchImpl });
  assert.deepEqual(await ntfy.publish('topic1', 'hello'), { id: 'x1' });
  assert.equal(calls[0].url, 'https://relay.test/topic1');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'hello');
});

test('publish and subscribe throw on HTTP errors', async () => {
  const ntfy = createNtfy({ baseUrl: 'https://relay.test', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(ntfy.publish('t', 'x'), /503/);
  await assert.rejects(ntfy.subscribe('t', () => {}), /503/);
});

test('subscribe calls onOpen once after the relay answers 200, before any message, and never on a failure', async () => {
  const events = [];
  const fetchImpl = async () => ({
    ok: true,
    body: (async function* () {
      yield encode('{"event":"message","id":"a","message":"one"}\n');
      yield encode('{"event":"message","id":"b","message":"two"}\n');
    })(),
  });
  await createNtfy({ baseUrl: 'https://relay.test', fetchImpl }).subscribe('t', (m) => { events.push(m); }, { onOpen: () => events.push('open') });
  assert.deepEqual(events, ['open', 'one', 'two']);

  let opened = 0;
  const onOpen = () => { opened += 1; };
  const httpError = createNtfy({ baseUrl: 'https://relay.test', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(httpError.subscribe('t', () => {}, { onOpen }), /503/);
  const offline = createNtfy({ baseUrl: 'https://relay.test', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.subscribe('t', () => {}, { onOpen }), /fetch failed/);
  assert.equal(opened, 0);
});
