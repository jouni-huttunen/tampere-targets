// A minimal ZIP reader (Node has none built in): enough for the GTFS feed, a plain archive of
// stored or deflated text files under 4 GB. No ZIP64, no encryption.
import { Readable } from 'node:stream';
import { createInflateRaw, inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The archive's files: [{ name, method, compressedSize, size, offset }]. */
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end-of-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error('Damaged ZIP central directory');
    const nameLen = buf.readUInt16LE(p + 28);
    const entry = {
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    };
    if (entry.compressedSize === 0xffffffff || entry.offset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
    if (entry.method !== 0 && entry.method !== 8) throw new Error(`${entry.name}: unsupported compression method ${entry.method}`);
    entries.push(entry);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}

function rawData(buf, entry) {
  const p = entry.offset;
  if (buf.readUInt32LE(p) !== LOCAL) throw new Error(`${entry.name}: damaged local header`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  return buf.subarray(start, start + entry.compressedSize);
}

/** One file as text (for the small GTFS tables). */
export function entryText(buf, entry) {
  const data = rawData(buf, entry);
  return (entry.method === 8 ? inflateRawSync(data) : data).toString('utf8');
}

/** One file as a stream (for stop_times.txt, ~150 MB unpacked). */
export function entryStream(buf, entry) {
  const data = Readable.from([rawData(buf, entry)]);
  return entry.method === 8 ? data.pipe(createInflateRaw()) : data;
}
