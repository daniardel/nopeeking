import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCliXml } from '../src/runner.js';

const HEADER = '#< CLIXML\r\n';
const OBJS = '<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">';
// Mimics the stderr PowerShell 5.1 writes for: throw "failed with $env:PC_S" with PC_S = p&ss<w>rd"1'x
const PROBE =
  HEADER +
  OBJS +
  '<Obj S="progress" RefId="0"><MS><S N="Activity">Preparing modules</S><S N="StatusDescription">Busy</S></MS></Obj>' +
  '<S S="Error">failed with p&amp;ss&lt;w&gt;rd"1\'x_x000D__x000A_</S></Objs>';

test('returns text that is not CLIXML unchanged', () => {
  assert.equal(decodeCliXml('boom\r\nline 2'), 'boom\r\nline 2');
  assert.equal(decodeCliXml('a &amp; b <S S="Error">x</S>'), 'a &amp; b <S S="Error">x</S>');
});

test('decodes the error text and skips progress records', () => {
  assert.equal(decodeCliXml(PROBE), 'failed with p&ss<w>rd"1\'x\r\n');
});

test('accepts leading whitespace before the CLIXML header', () => {
  assert.equal(decodeCliXml(`\r\n  ${HEADER}${OBJS}<S S="Error">x</S></Objs>`), 'x');
});

test('joins stream records in order', () => {
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Error">first</S><S S="Warning">second</S></Objs>`), 'firstsecond');
});

test('unescapes XML entities and PowerShell _x escapes once each', () => {
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Error">&#65;&#x42;_x0041__x005F_</S></Objs>`), 'ABA_');
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Error">&amp;lt;</S></Objs>`), '&lt;');
});

test('keeps the text of a truncated final record', () => {
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Error">abc &amp; de`), 'abc & de');
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Error">abc</S`), 'abc');
  assert.equal(decodeCliXml(`${HEADER}${OBJS}<S S="Err`), '');
});
