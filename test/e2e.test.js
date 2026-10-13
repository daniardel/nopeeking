import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aadFor, deriveKey, fromB64u, generateKeyPair, randomTopic, seal, toB64u, unseal } from '../docs/e2e.js';

async function pair() {
  const pc = await generateKeyPair();
  const phone = await generateKeyPair();
  const topic = randomTopic();
  const req = { topic, name: 'netflix', kind: 'web', site: 'netflix.com' };
  return {
    req,
    phoneKey: await deriveKey(phone.privateKey, pc.publicKeyRaw, topic),
    pcKey: await deriveKey(pc.privateKey, phone.publicKeyRaw, topic),
  };
}

test('phone and PC derive the same key and round-trip a sealed message', async () => {
  const { req, phoneKey, pcKey } = await pair();
  const box = await seal(phoneKey, { value: 'hunter2 ✓' }, aadFor(req, 'sub'));
  assert.deepEqual(await unseal(pcKey, box, aadFor(req, 'sub')), { value: 'hunter2 ✓' });
});

test('unseal rejects tampered ciphertext, a different iv, or a different context', async () => {
  const { req, phoneKey, pcKey } = await pair();
  const box = await seal(phoneKey, { value: 'hunter2' }, aadFor(req, 'sub'));
  const ct = fromB64u(box.ct);
  ct[0] ^= 1;
  await assert.rejects(unseal(pcKey, { ...box, ct: toB64u(ct) }, aadFor(req, 'sub')));
  const other = await seal(phoneKey, { value: 'x' }, aadFor(req, 'sub'));
  await assert.rejects(unseal(pcKey, { ...box, iv: other.iv }, aadFor(req, 'sub')));
  await assert.rejects(unseal(pcKey, box, aadFor({ ...req, site: 'evil.com' }, 'sub')));
  await assert.rejects(unseal(pcKey, box, aadFor(req, 'ack')));
});

test('a third key pair cannot open the message', async () => {
  const { req, phoneKey } = await pair();
  const stranger = await generateKeyPair();
  const pc2 = await generateKeyPair();
  const wrongKey = await deriveKey(stranger.privateKey, pc2.publicKeyRaw, req.topic);
  const box = await seal(phoneKey, { value: 'hunter2' }, aadFor(req, 'sub'));
  await assert.rejects(unseal(wrongKey, box, aadFor(req, 'sub')));
});

test('randomTopic is ntfy-safe and unique; base64url round-trips', () => {
  const t = randomTopic();
  assert.match(t, /^pc-[A-Za-z0-9_-]{32}$/);
  assert.notEqual(t, randomTopic());
  const bytes = Uint8Array.from([0, 255, 62, 63, 128, 1, 2]);
  assert.deepEqual(fromB64u(toB64u(bytes)), bytes);
});
