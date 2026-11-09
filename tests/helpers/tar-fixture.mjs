import { gzipSync } from 'node:zlib';

function header({ name, size = 0, type = '0', mode = 0o644, prefix = '' }) {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, 100, 'utf8');
  block.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 'ascii');
  block.write('0000000\0', 108, 'ascii');
  block.write('0000000\0', 116, 'ascii');
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  block.write('00000000000\0', 136, 'ascii');
  block.write('        ', 148, 'ascii');
  block.write(type, 156, 1, 'ascii');
  block.write('ustar\0', 257, 'ascii');
  block.write('00', 263, 'ascii');
  if (prefix) block.write(prefix.slice(0, 155), 345, 155, 'utf8');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return block;
}

function padding(size) {
  return Buffer.alloc(Math.ceil(size / 512) * 512 - size);
}

function paxRecord(name, value) {
  const body = ` ${name}=${value}\n`;
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return `${length}${body}`;
}

export function tarGz(entries) {
  const blocks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '', 'utf8');
    if (entry.paxPath) {
      const pax = Buffer.from(paxRecord('path', entry.paxPath), 'utf8');
      blocks.push(header({ name: 'PaxHeader', size: pax.length, type: 'x' }), pax, padding(pax.length));
    }
    if (entry.longName) {
      const long = Buffer.from(`${entry.longName}\0`, 'utf8');
      blocks.push(header({ name: '././@LongLink', size: long.length, type: 'L' }), long, padding(long.length));
    }
    blocks.push(header({ name: entry.name ?? 'file', size: data.length, type: entry.type ?? '0', prefix: entry.prefix ?? '', mode: entry.mode ?? 0o644 }));
    if (data.length) blocks.push(data, padding(data.length));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
