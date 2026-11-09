import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { failure, isManagedFileName, regularFile, readRegular } from './safe-files.mjs';

export const sha256 = content => createHash('sha256').update(content).digest('hex');
export const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateOwnership(record) {
  if (!object(record) || !Number.isSafeInteger(record.revision) || record.revision < 0 || !object(record.files)) {
    throw failure('INVALID_WORKSPACE_RECORD');
  }
  for (const [path, hash] of Object.entries(record.files)) {
    if (!isManagedFileName(path) || !isHash(hash)) throw failure('INVALID_WORKSPACE_RECORD');
  }
  return record;
}

export function ownershipKey(record) {
  return record === null ? 'missing' : JSON.stringify([record.revision, Object.entries(record.files).sort(([a], [b]) => a.localeCompare(b))]);
}

export async function loadOwnership(root) {
  try {
    const path = join(root, '.seroai/ownership.json');
    if (!await regularFile(path)) return null;
    return validateOwnership(JSON.parse((await readRegular(path)).toString('utf8')));
  } catch {
    throw failure('INVALID_WORKSPACE_RECORD');
  }
}
