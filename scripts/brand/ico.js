// Packs images into a Windows .ico file: sizes under 256 px as 32-bit bitmaps, which every reader takes (System.Drawing
// cannot open PNG entries at 48 px and up), and 256 px as PNG, as Windows itself does.
export const ICON_SIZES = [16, 24, 32, 48, 64, 256];

/** A bitmap entry: BITMAPINFOHEADER, then BGRA rows bottom first, then an all-clear AND mask (the alpha does the work). */
function dibFromRgba(size, rgba) {
  if (rgba.length !== size * size * 4) throw new Error(`a ${size} px icon needs ${size * size * 4} bytes of RGBA`);
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // the pixels and the mask, stacked
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bits per pixel
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = ((size - 1 - y) * size + x) * 4;
      const to = (y * size + x) * 4;
      pixels[to] = rgba[from + 2];
      pixels[to + 1] = rgba[from + 1];
      pixels[to + 2] = rgba[from];
      pixels[to + 3] = rgba[from + 3];
    }
  }
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

/** images: [{ size, png }] or [{ size, rgba }] (raw RGBA, top row first), in the order to store them. */
export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  const data = images.map(({ size, png, rgba }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`icon size ${size} is not 1–256`);
    const body = rgba ? dibFromRgba(size, rgba) : png;
    const e = i * 16;
    directory.writeUInt8(size === 256 ? 0 : size, e); // one byte each: 0 means 256
    directory.writeUInt8(size === 256 ? 0 : size, e + 1);
    directory.writeUInt8(0, e + 2); // no palette
    directory.writeUInt8(0, e + 3); // reserved
    directory.writeUInt16LE(1, e + 4); // colour planes
    directory.writeUInt16LE(32, e + 6); // bits per pixel
    directory.writeUInt32LE(body.length, e + 8);
    directory.writeUInt32LE(offset, e + 12);
    offset += body.length;
    return body;
  });
  return Buffer.concat([header, directory, ...data]);
}

/** [{ size, format: 'png' | 'bmp', data }] for each entry. */
export function decodeIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an .ico file');
  return Array.from({ length: buf.readUInt16LE(4) }, (_, i) => {
    const e = 6 + i * 16;
    const length = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    const data = buf.subarray(offset, offset + length);
    return { size: buf.readUInt8(e) || 256, format: data.readUInt32BE(0) === 0x89504e47 ? 'png' : 'bmp', data };
  });
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
