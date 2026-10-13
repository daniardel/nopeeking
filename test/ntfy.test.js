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
