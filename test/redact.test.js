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

test('redact hides the forms Windows PowerShell and .NET produce for JSON and URLs', () => {
  const v = "p&s<'x> (a)!~";
  const out = redact([
    '{"t":"p\\u0026s\\u003c\\u0027x\\u003e (a)!~"}', // ConvertTo-Json in Windows PowerShell 5.1
    'p%26s%3c%27x%3e%20(a)!~', // lowercase percent-encoding
    'p%26s%3C%27x%3E%20%28a%29%21~', // [Uri]::EscapeDataString in PowerShell 7 (.NET Core and later)
    'p%26s%3c%27x%3e+(a)!%7e', // [System.Web.HttpUtility]::UrlEncode
  ].join('\n'), [{ name: 'k', value: v }]);
  assert.equal(out, '{"t":"••••(k)"}\n••••(k)\n••••(k)\n••••(k)');
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
  assert.equal(out, 'x'.repeat(64)); // drops the longest form length (44 UTF-16 hex chars) from the end
  assert.equal(redactOutput('a SUPERSECRET b', secrets), 'a ••••(k) b');
});

test('redactOutput drops a secret that straddles the cut', () => {
  const secrets = [{ name: 'k', value: 'SUPERSECRET' }];
  const out = redactOutput(`${'x'.repeat(80)}SUPERSECRET${'y'.repeat(40)}`, secrets, { truncated: true });
  // The cut would land inside the mask, so the whole secret is dropped: no fragment survives.
  assert.equal(out, 'x'.repeat(80));
});

test('redactOutput never shows a secret prefix when a long mask sits near the cut', () => {
  const secrets = [
    { name: 'A', value: 'prefix_abcd1234' },
    { name: 'production_database_password_for_prod_eu1', value: 'abcd' }, // 41-character name
  ];
  const out = redactOutput(`${'z'.repeat(80)}prefix_abcd12`, secrets, { truncated: true });
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

// ---- Windows PowerShell 5.1 wraps long values and shortens them with '...'; pieces of 8+ characters are still masked ----
// The texts below are copied from real runs of Windows PowerShell 5.1 through src/runner.js.

const LONG = `eyJhbGciOiJIUzI1NiJ9.${'QWERTYuiop1234567890asdfghjklZXCVBNM'.repeat(5)}.sigSIGsig`; // 211 characters
const GH = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'; // 40 characters
const SHAPE_SECRETS = [{ name: 'long', value: LONG }, { name: 'gh', value: GH }, { name: 'pw', value: 'Hunt3r-2-pass' }];

/** Fails if any `size` consecutive characters of the secret are still in the text. */
function assertNoPiece(text, secret, size = 8) {
  for (let i = 0; i + size <= secret.length; i++) {
    const piece = secret.slice(i, i + size);
    assert.ok(!text.includes(piece), `"${piece}" is still visible in:\n${text}`);
  }
}

test('redact masks a value that Format-List wraps onto an indented second line', () => {
  const text = '\r\n\r\nName  : L\r\nValue : eyJhbGciOiJIUzI1NiJ9.QWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop12345678\r\n        90asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNM.sigSIGsig\r\n\r\n\r\n\r\n';
  const out = redact(text, SHAPE_SECRETS);
  assertNoPiece(out, LONG);
  assert.equal(out, '\r\n\r\nName  : L\r\nValue : ••••(long)\r\n\r\n\r\n\r\n');
});

test('redact masks a wrapped tail shorter than 8 characters', () => {
  const label = 'name_of_a_setting_that_is_long_enough_to_push_the_value_to_the_right_edge_xxxxxx';
  const text = `\r\n\r\n${label} : ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\r\n${' '.repeat(83)}Q7r8\r\n\r\n\r\n\r\n`;
  const out = redact(text, SHAPE_SECRETS);
  assert.equal(out, `\r\n\r\n${label} : ••••(gh)\r\n\r\n\r\n\r\n`);
});

test('redact masks both ends of a value that an error CategoryInfo shortens with ...', () => {
  const lines = [
    '    + CategoryInfo          : OperationStopped: (auth failed: gh...1l2M3n4O5p6Q7r8:String) [], RuntimeException',
    '    + CategoryInfo          : ObjectNotFound: (C:\\nope\\ghp_A1b...1l2M3n4O5p6Q7r8:String) [Get-Item], ItemNotFoundExcep \r\n   tion',
    '    + CategoryInfo          : OperationStopped: (bad token eyJhb...CVBNM.sigSIGsig:String) [], RuntimeException',
  ];
  const out = lines.map((line) => redact(line, SHAPE_SECRETS));
  for (const line of out) {
    assertNoPiece(line, GH);
    assertNoPiece(line, LONG);
  }
  assert.deepEqual(out, [
    '    + CategoryInfo          : OperationStopped: (auth failed: gh...••••(gh):String) [], RuntimeException',
    '    + CategoryInfo          : ObjectNotFound: (C:\\nope\\••••(gh)...••••(gh):String) [Get-Item], ItemNotFoundExcep \r\n   tion',
    '    + CategoryInfo          : OperationStopped: (bad token ••••(long)...••••(long):String) [], RuntimeException',
  ]);
});

test('redact masks a value that a table cuts off with ...', () => {
  const pad = ' '.repeat(87);
  const text = `\r\nName                           Value${pad}\r\n----                           -----${pad}\r\nL                              eyJhbGciOiJIUzI1NiJ9.QWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjk...\r\n\r\n\r\n`;
  const out = redact(text, SHAPE_SECRETS);
  assertNoPiece(out, LONG);
  assert.equal(out, `\r\nName                           Value${pad}\r\n----                           -----${pad}\r\nL                              ••••(long)...\r\n\r\n\r\n`);
  const narrow = '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345 Hunt3r-2-...';
  // Only the password here: the digits in this row share 8-character pieces with the "long" test value.
  assert.equal(redact(narrow, [{ name: 'pw', value: 'Hunt3r-2-pass' }]), '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345 ••••(pw)...');
});

test('redact masks short ends next to a one-character ellipsis too', () => {
  assert.equal(redact('(token ghp_A1…5p6Q7r8)', SHAPE_SECRETS), '(token ••••(gh)…••••(gh))');
});

test('redact masks a value that a warning wraps across lines', () => {
  const text = 'WARNING: tok \r\neyJhbGciOiJIUzI1NiJ9.QWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfgh\r\njklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNMQWERTYuiop1234567890asdfghjklZXCVBNM.sigSIGsig\n';
  const out = redact(text, SHAPE_SECRETS);
  assertNoPiece(out, LONG);
  assert.equal(out, 'WARNING: tok \r\n••••(long)\n');
});

test('redact masks pieces of 8 or more characters anywhere, but not shorter ones', () => {
  assert.equal(redact('half of it: QWERTYuiop1234 and a bit: Yuio', SHAPE_SECRETS), 'half of it: ••••(long) and a bit: Yuio');
});

test('redact masks pieces of an encoded form too', () => {
  const v = 'correct-horse-battery-staple';
  const b64 = Buffer.from(v).toString('base64');
  const out = redact(`start of the base64: ${b64.slice(0, 20)}`, [{ name: 'k', value: v }]);
  assert.equal(out, 'start of the base64: ••••(k)');
});

test('redact handles 1 MB of spaces and tabs without a line break in well under 3 seconds', () => {
  const text = ' \t'.repeat(512 * 1024) + 'x\r\n  QWERTYuiop1234567890asdfghjklZXCVBNM';
  const started = Date.now();
  const out = redact(text, SHAPE_SECRETS);
  const took = Date.now() - started;
  assert.ok(!out.includes('QWERTYuiop12'), out.slice(-60));
  assert.ok(took < 3000, `took ${took} ms`);
});

test('redact handles 1 MB of ordinary output with three secrets in well under 3 seconds', () => {
  const line = 'Some normal log output line 12345 with path C:/x/y and text... QWERTYuiop1234 done\r\n';
  const text = line.repeat(Math.ceil((1024 * 1024) / line.length)).slice(0, 1024 * 1024);
  const started = Date.now();
  const out = redact(text, SHAPE_SECRETS);
  const took = Date.now() - started;
  assert.ok(out.includes('••••(long)'));
  assert.ok(took < 3000, `took ${took} ms`);
});

test('redact hides base64 of a value that starts at any byte inside a longer encoded run', () => {
  const v = 'hunter2-secret-XYZ';
  for (const before of ['', 'u:', 'us:', 'user:', 'longer-user:']) {
    for (const after of ['', '\n', 'ab']) {
      const bytes = Buffer.from(before + v + after);
      for (const encoding of ['base64', 'base64url']) {
        const encoded = bytes.toString(encoding);
        const out = redact(`Authorization: Basic ${encoded}`, [{ name: 'k', value: v }]);
        assert.match(out, /^Authorization: Basic .{0,20}••••\(k\).{0,8}$/, `${JSON.stringify(before)} ${JSON.stringify(after)} ${encoding}: ${out}`);
      }
    }
  }
});

test('redact hides UTF-16LE forms: base64 (as -EncodedCommand uses), hex and text read back as UTF-8', () => {
  const v = 'hunter2-secret-XYZ';
  const utf16 = Buffer.from(v, 'utf16le');
  for (const text of [utf16.toString('base64'), Buffer.from(`x=${v}`, 'utf16le').toString('base64'), utf16.toString('hex'), utf16.toString('latin1')]) {
    const out = redact(`out: ${text}`, [{ name: 'k', value: v }]);
    assert.match(out, /^out: .{0,8}••••\(k\).{0,4}$/s, JSON.stringify(text));
  }
});
