// Packs PNG images into a Windows .ico file. Entries stay PNG-encoded, which every Windows since Vista reads.
export const ICON_SIZES = [16, 24, 32, 48, 64, 256];

export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`icon size ${size} is not 1–256`);
    const e = i * 16;
    directory.writeUInt8(size === 256 ? 0 : size, e); // one byte each: 0 means 256
    directory.writeUInt8(size === 256 ? 0 : size, e + 1);
    directory.writeUInt8(0, e + 2); // no palette
    directory.writeUInt8(0, e + 3); // reserved
    directory.writeUInt16LE(1, e + 4); // colour planes
    directory.writeUInt16LE(32, e + 6); // bits per pixel
    directory.writeUInt32LE(png.length, e + 8);
    directory.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}

export function decodeIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an .ico file');
  return Array.from({ length: buf.readUInt16LE(4) }, (_, i) => {
    const e = 6 + i * 16;
    const length = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    return { size: buf.readUInt8(e) || 256, png: buf.subarray(offset, offset + length) };
  });
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
