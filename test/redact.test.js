import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodedForms, redact, redactOutput } from '../src/redact.js';

test('redact hides the raw value and its common encodings', () => {
  const v = 'ghp_S3cr3t/+value=';
  const b = Buffer.from(v);
  const text = [v, b.toString('base64'), b.toString('base64url'), encodeURIComponent(v),
    b.toString('hex'), b.toString('hex').toUpperCase(), JSON.stringify(v)].join(' | ');
  const out = redact(text, [{ name: 'gh', value: v }]);
  for (const form of encodedForms(v)) assert.ok(!out.includes(form), form);
  assert.match(out, /••••\(gh\)/);
});

test('redact escapes JSON special characters the same way JSON does', () => {
  const v = 'pa"ss\\word';
  const out = redact(JSON.stringify({ token: v }), [{ name: 'k', value: v }]);
  assert.equal(out, '{"token":"••••(k)"}');
});

test('redact handles several secrets, longest first', () => {
  const out = redact('token=abcd1234 short=abcd', [{ name: 'short', value: 'abcd' }, { name: 'long', value: 'abcd1234' }]);
  assert.equal(out, 'token=••••(long) short=••••(short)');
});

test('redact leaves text without secrets alone', () => {
  assert.equal(redact('nothing to see', [{ name: 'k', value: 'SUPERSECRET' }]), 'nothing to see');
});

test('redactOutput drops a secret cut in half at the end of truncated output', () => {
  const secrets = [{ name: 'k', value: 'SUPERSECRET' }];
  const out = redactOutput(`${'x'.repeat(100)}SUPERSEC`, secrets, { truncated: true });
  assert.equal(out, 'x'.repeat(86)); // drops the longest form length (22 hex chars) from the end
  assert.equal(redactOutput('a SUPERSECRET b', secrets), 'a ••••(k) b');
});

test('redactOutput drops a secret that straddles the cut', () => {
  const secrets = [{ name: 'k', value: 'SUPERSECRET' }];
  const out = redactOutput(`${'x'.repeat(80)}SUPERSECRET${'y'.repeat(20)}`, secrets, { truncated: true });
  // The cut would land inside the mask, so the whole secret is dropped: no fragment survives.
  assert.equal(out, 'x'.repeat(80));
});

test('redactOutput never shows a secret prefix when a long mask sits near the cut', () => {
  const secrets = [
    { name: 'A', value: 'prefix_abcd1234' },
    { name: 'production_database_password_for_prod_eu1', value: 'abcd' }, // 41-character name
  ];
  const out = redactOutput(`${'z'.repeat(50)}prefix_abcd12`, secrets, { truncated: true });
  assert.ok(!out.includes('prefix_'), out);
  assert.equal(out, 'z'.repeat(33)); // no partial mask either
});

test('redact masks overlapping occurrences of one secret as a single mask', () => {
  assert.equal(redact('abcabcabc', [{ name: 'k', value: 'abcabc' }]), '••••(k)');
});

test('redact masks partly overlapping secrets without leaving fragments', () => {
  assert.equal(redact('abcdefgh', [{ name: 'A', value: 'abcdef' }, { name: 'B', value: 'cdefgh' }]), '••••(A)');
});

test('redact keeps adjacent secrets as separate masks', () => {
  assert.equal(redact('abcdwxyz', [{ name: 'A', value: 'abcd' }, { name: 'B', value: 'wxyz' }]), '••••(A)••••(B)');
});
