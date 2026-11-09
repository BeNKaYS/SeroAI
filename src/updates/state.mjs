import fs from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertDirectory, failure, readRegular, regularFile, writeAtomic, writePrivateNew } from '../core/safe-files.mjs';
import { isHash, sha256 } from '../core/workspace-state.mjs';
import { isUpdatePath, TOTAL_LIMIT } from './manifest.mjs';

export const updateStatePath = root => join(root, '.git/seroai/updates');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const exists = async path => { try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

export function stopped(pid) {
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return true; }
  return false;
}

async function readLock(path) {
  if (!await regularFile(path)) return null;
  const data = await readRegular(path);
  const value = JSON.parse(data.toString('utf8'));
  if (!value || !uuid(value.nonce) || !Number.isSafeInteger(value.pid) || value.pid <= 0) throw failure('INVALID_UPDATE_STATE');
  return { ...value, hash: sha256(data) };
}

export async function loadUpdateState(root, { writerNonce, recoveryNonce, rollback = false } = {}) {
  try {
    const parent = join(root, '.git/seroai');
    if (!await exists(parent)) return { fingerprint: 'none', pointer: null, writer: null, ownedPaths: [] };
    await assertDirectory(parent, { privateOnly: true });
    const state = updateStatePath(root);
    if (!await exists(state)) return { fingerprint: 'none', pointer: null, writer: null, ownedPaths: [] };
    await assertDirectory(state, { privateOnly: true });
    await assertDirectory(join(state, 'backups'), { privateOnly: true });
    const owner = JSON.parse((await readRegular(join(state, 'owner.json'))).toString('utf8'));
    if (owner.schema !== 1 || owner.application !== 'seroai' || owner.root !== root) throw failure('INVALID_UPDATE_STATE');
    const recovery = await readLock(join(state, 'recovery.lock'));
    if (recovery && recovery.nonce !== recoveryNonce) throw failure('WORKSPACE_BUSY');
    const writer = await readLock(join(state, 'write.lock'));
    if (writer && writer.nonce !== writerNonce && (!rollback || !stopped(writer.pid))) throw failure(stopped(writer.pid) ? 'RECOVERY_REQUIRED' : 'WORKSPACE_BUSY');
    const latest = join(state, 'latest.json');
    if (!await regularFile(latest)) return { fingerprint: 'none', pointer: null, writer, ownedPaths: [] };
    const raw = await readRegular(latest);
    const pointer = JSON.parse(raw.toString('utf8'));
    if (pointer.schema !== 1 || !uuid(pointer.id) || !isHash(pointer.hash) || !['pending', 'applied', 'rolled-back'].includes(pointer.status)) throw failure('INVALID_UPDATE_STATE');
    const data = await readRegular(join(state, 'backups', `${pointer.id}.json`), { maxBytes: TOTAL_LIMIT * 2 });
    if (sha256(data) !== pointer.hash) throw failure('INVALID_UPDATE_STATE');
    const snapshot = JSON.parse(data.toString('utf8'));
    if (snapshot.schema !== 1 || snapshot.id !== pointer.id || snapshot.root !== root || !Array.isArray(snapshot.files)
      || !snapshot.files.length || snapshot.files.length > 100 || !Array.isArray(snapshot.ownedPaths)
      || snapshot.ownedPaths.length > 1000 || snapshot.ownedPaths.some(path => !isUpdatePath(path))) throw failure('INVALID_UPDATE_STATE');
    const seen = new Set();
    let total = 0;
    for (const file of snapshot.files) {
      if (!isUpdatePath(file.path) || seen.has(file.path.toLowerCase()) || !isHash(file.afterHash)
        || !Number.isInteger(file.afterMode) || file.afterMode < 0 || file.afterMode > 0o777) throw failure('INVALID_UPDATE_STATE');
      seen.add(file.path.toLowerCase());
      if (file.before === null) {
        if (file.beforeHash !== null || file.beforeMode !== null) throw failure('INVALID_UPDATE_STATE');
      } else {
        if (typeof file.before !== 'string' || !isHash(file.beforeHash) || !Number.isInteger(file.beforeMode) || file.beforeMode < 0 || file.beforeMode > 0o777) throw failure('INVALID_UPDATE_STATE');
        const before = Buffer.from(file.before, 'base64');
        total += before.length;
        if (before.length > 1024 * 1024 || before.toString('base64') !== file.before || sha256(before) !== file.beforeHash || total > TOTAL_LIMIT) throw failure('INVALID_UPDATE_STATE');
      }
    }
    if (!rollback && pointer.status === 'pending') throw failure('RECOVERY_REQUIRED');
    return { fingerprint: sha256(raw), pointer, snapshot, writer, ownedPaths: snapshot.ownedPaths };
  } catch (error) {
    if (['INVALID_UPDATE_STATE', 'UNSAFE_FILE', 'UNSAFE_PATH', 'WORKSPACE_BUSY', 'RECOVERY_REQUIRED'].includes(error.code)) throw error;
    throw failure('INVALID_UPDATE_STATE');
  }
}

export async function ensureUpdateState(root) {
  const parent = join(root, '.git/seroai');
  try { await fs.mkdir(parent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assertDirectory(parent, { privateOnly: true });
  const state = updateStatePath(root);
  let created = false;
  try { await fs.mkdir(state, { mode: 0o700 }); created = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (created) {
    await writePrivateNew(join(state, 'owner.json'), JSON.stringify({ schema: 1, application: 'seroai', root }));
    await fs.mkdir(join(state, 'backups'), { mode: 0o700 });
  }
  await loadUpdateState(root);
}

export async function acquireUpdateLock(root, type) {
  const value = { pid: process.pid, nonce: randomUUID() };
  const path = join(updateStatePath(root), `${type}.lock`);
  try { await writePrivateNew(path, JSON.stringify(value)); }
  catch (cause) { throw failure(cause.code === 'EEXIST' ? 'WORKSPACE_BUSY' : 'INVALID_UPDATE_STATE'); }
  return { ...value, path };
}

export async function saveUpdatePointer(root, snapshot, hash, status) {
  await writeAtomic(join(updateStatePath(root), 'latest.json'), JSON.stringify({ schema: 1, id: snapshot.id, hash, status }));
}
