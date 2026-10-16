import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { encodeQr, qrPathData } from '../src/qr.js';

/** Draws the matrix as RGBA pixels (with the 4-module quiet zone) and reads it back with an independent decoder. */
function decode(matrix, scale = 4) {
  const quiet = 4;
  const side = (matrix.length + 2 * quiet) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const i = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
  }));
  return jsQR(pixels, side, side)?.data ?? null;
}

const LINK =
  'https://daniardel.github.io/passclaude-phone/#v=1&t=pc-4mY0bq2V8xYk3Jt1Zr&k=BHq0yXk3l7r6nJ5Qd2v9Wm8Yt1Kp4Hs6Lf3Ga0Ce7Ub2Ri5Nj9Ox1Tz4Vw8Sq3Mg6Dh0Ay2Ec5Fb7Il9Pn1Kr&n=netflix&kind=web&s=netflix.com&e=1792160000&r=https%3A%2F%2Fntfy.sh';

test('a real phone link encodes to a QR code that decodes back to exactly the link', () => {
  assert.equal(decode(encodeQr(LINK)), LINK);
});

test('every length a link can have round-trips, across QR versions', () => {
  for (const length of [1, 14, 15, 16, 30, 62, 100, 154, 213, 251, 287, 331, 362, 412, 600, 900]) {
    const text = LINK.repeat(4).slice(0, length);
    const matrix = encodeQr(text);
    assert.equal(matrix.length, matrix[0].length);
    assert.equal((matrix.length - 17) % 4, 0, `size ${matrix.length} is 17 + 4 × version`);
    assert.equal(decode(matrix), text, `length ${length}`);
  }
});

test('text that is not ASCII is encoded as UTF-8', () => {
  const text = 'https://example.com/#n=café&s=üñîçødé';
  assert.equal(decode(encodeQr(text)), text);
});

test('text too long for any QR code is refused', () => {
  assert.throws(() => encodeQr('x'.repeat(2400)), /too long for a QR code/);
});

test('qrPathData draws each run of dark modules in a row as one rectangle, offset by the quiet zone', () => {
  const matrix = [
    [true, true, false],
    [false, true, true],
    [false, false, false],
  ];
  assert.equal(qrPathData(matrix), 'M4 4h2v1h-2zM5 5h2v1h-2z');
});
