import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export function failure(code, cause) {
  return Object.assign(new Error(code, cause ? { cause } : undefined), { code });
}

export function isManagedFileName(path) {
  return typeof path === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(md|txt|json)$/.test(path) && !path.includes('..');
}

export async function assertDirectory(path, { privateOnly = false } = {}) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await fs.lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw failure('UNSAFE_PATH');
  }
  if (privateOnly && ((await fs.lstat(absolute)).mode & 0o077) !== 0) throw failure('UNSAFE_PATH');
}

export async function regularFile(path) {
  let info;
  try {
    info = await fs.lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw failure('UNSAFE_FILE');
  return info;
}

export async function readRegular(path, { maxBytes = 1024 * 1024 } = {}) {
  const info = await regularFile(path);
  if (!info) throw failure('CONFLICT');
  if (info.size > maxBytes) throw failure('UNSAFE_FILE');
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== info.ino || opened.dev !== info.dev || opened.size > maxBytes) throw failure('UNSAFE_FILE');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function writePrivateNew(path, content) {
  const handle = await fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeAtomic(path, content) {
  await regularFile(path);
  const temporary = join(dirname(path), `.seroai-stage-${randomUUID()}`);
  try {
    await writePrivateNew(temporary, content);
    await fs.rename(temporary, path);
  } finally {
    await fs.unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
