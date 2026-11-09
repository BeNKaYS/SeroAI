import { gunzipSync } from 'node:zlib';
import { failure } from '../core/safe-files.mjs';

const BLOCK = 512;
const DEFAULTS = { maxBytes: 112 * 1024 * 1024, maxFiles: 8000, fileLimit: 2 * 1024 * 1024 };

function invalid() {
  return failure('INVALID_ARCHIVE');
}

function text(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return (end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
}

function octal(buffer, start, length) {
  const raw = text(buffer, start, length).trim();
  if (raw === '') return 0;
  if (!/^[0-7]+$/.test(raw)) throw invalid();
  const value = parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}

function checksum(buffer, offset) {
  const header = Buffer.from(buffer.subarray(offset, offset + BLOCK));
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  return sum;
}

function safePath(name) {
  if (typeof name !== 'string' || !name.length || name.includes('\0') || name.includes('\\') || name.startsWith('/')) throw invalid();
  const parts = name.replace(/\/+$/, '').split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) throw invalid();
  return parts.join('/');
}

function paxPath(data) {
  let offset = 0;
  let path = null;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) throw invalid();
    const length = Number(data.subarray(offset, space).toString('utf8'));
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) throw invalid();
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
    const separator = record.indexOf('=');
    if (separator < 1) throw invalid();
    if (record.slice(0, separator) === 'path') path = record.slice(separator + 1);
    offset += length;
  }
  return path;
}

function parse(buffer, limits) {
  const entries = new Map();
  let offset = 0;
  let longName = null;
  let pax = null;
  let files = 0;
  let bytes = 0;
  const include = typeof limits.include === 'function' ? limits.include : () => true;
  while (offset + BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK);
    if (header.every(byte => byte === 0)) break;
    if (octal(buffer, offset + 148, 8) !== checksum(buffer, offset)) throw invalid();
    const type = String.fromCharCode(buffer[offset + 156] || 0x30);
    const size = octal(buffer, offset + 124, 12);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw invalid();
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') { pax = paxPath(data); continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0+$/, ''); continue; }
    if (type === 'K') continue;
    if (!['0', '5'].includes(type)) throw invalid();
    const headerName = text(header, 0, 100);
    const prefix = text(header, 345, 155);
    const name = safePath(longName ?? pax ?? (prefix ? `${prefix}/${headerName}` : headerName));
    longName = null;
    pax = null;
    if (type === '5') continue;
    if (!include(name)) continue;
    if (entries.has(name)) throw invalid();
    files += 1;
    if (files > limits.maxFiles || size > limits.fileLimit) throw invalid();
    bytes += size;
    if (bytes > limits.maxBytes) throw invalid();
    entries.set(name, { data: Buffer.from(data), mode: octal(header, 100, 8) & 0o777 });
  }
  return entries;
}

export function extractTarGz(buffer, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw invalid();
  let raw;
  try {
    raw = gunzipSync(buffer, { maxOutputLength: limits.maxBytes + limits.maxFiles * BLOCK });
  } catch {
    throw invalid();
  }
  const entries = parse(raw, limits);
  if (limits.withMode === true) return entries;
  return new Map([...entries].map(([path, entry]) => [path, entry.data]));
}
