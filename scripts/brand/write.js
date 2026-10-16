import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Writes to a temp file beside path, then renames it over path, so a failed build never leaves half a file. */
export function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new Error(`could not write ${path}: ${e.message}`);
  }
}
