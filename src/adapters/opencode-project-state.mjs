import fs from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { assertDirectory, failure, regularFile, readRegular, writePrivateNew } from '../core/safe-files.mjs';
import { isHash, sha256 } from '../core/workspace-state.mjs';

export const statePath = project => join(project, '.git/seroai/opencode');
export const isTarget = target => ['opencode.json', 'opencode.jsonc'].includes(target);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const exists = async path => {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

export async function checkProject(project) {
  if (typeof project !== 'string' || !isAbsolute(project) || resolve(project) === parse(resolve(project)).root) throw failure('INVALID_PROJECT');
  try {
    await assertDirectory(project);
    // Yedekler çalışma ağacına veya public Git içeriğine girmemeli.
    await assertDirectory(join(project, '.git'));
  } catch { throw failure('INVALID_PROJECT'); }
  return resolve(project);
}

export async function selectConfig(project) {
  const nested = join(project, '.opencode');
  if (await exists(nested)) {
    await assertDirectory(nested);
    if (await exists(join(nested, 'opencode.json')) || await exists(join(nested, 'opencode.jsonc'))) throw failure('CONFIG_CONFLICT');
  }
  const json = await regularFile(join(project, 'opencode.json'));
  const jsonc = await regularFile(join(project, 'opencode.jsonc'));
  if (json && jsonc) throw failure('CONFIG_CONFLICT');
  return json ? 'opencode.json' : 'opencode.jsonc';
}

export async function configContent(project, target) {
  if (!isTarget(target)) throw failure('INVALID_PROJECT_STATE');
  const path = join(project, target);
  const info = await regularFile(path);
  return info ? { content: await readRegular(path), mode: info.mode & 0o777 } : { content: null, mode: null };
}

export function writerStopped(pid) {
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return true; }
  return false;
}

async function readLock(path) {
  if (!await regularFile(path)) return null;
  const raw = await readRegular(path);
  const lock = JSON.parse(raw.toString('utf8'));
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0 || !uuid(lock.nonce)) throw failure('INVALID_PROJECT_STATE');
  return { ...lock, hash: sha256(raw) };
}

export async function loadProjectState(project, { writerNonce, recoveryNonce, rollback = false } = {}) {
  try {
    const parent = join(project, '.git/seroai');
    if (!await exists(parent)) return { pointer: null, fingerprint: 'none', writer: null };
    await assertDirectory(parent, { privateOnly: true });
    const state = statePath(project);
    if (!await exists(state)) return { pointer: null, fingerprint: 'none', writer: null };
    await assertDirectory(state, { privateOnly: true });
    const owner = JSON.parse((await readRegular(join(state, 'owner.json'))).toString('utf8'));
    if (owner.schema !== 1 || owner.adapter !== 'opencode-v2-project' || owner.project !== project) throw failure('INVALID_PROJECT_STATE');
    await assertDirectory(join(state, 'backups'), { privateOnly: true });
    const recovery = await readLock(join(state, 'recovery.lock'));
    if (recovery && recovery.nonce !== recoveryNonce) throw failure('WORKSPACE_BUSY');
    const writer = await readLock(join(state, 'write.lock'));
    if (writer && writer.nonce !== writerNonce) {
      if (!rollback || !writerStopped(writer.pid)) throw failure(writerStopped(writer.pid) ? 'RECOVERY_REQUIRED' : 'WORKSPACE_BUSY');
    }
    const latest = join(state, 'latest.json');
    if (!await regularFile(latest)) return { pointer: null, fingerprint: 'none', writer };
    const raw = await readRegular(latest);
    const pointer = JSON.parse(raw.toString('utf8'));
    if (pointer.schema !== 1 || !uuid(pointer.id) || !isHash(pointer.hash) || !['pending', 'applied', 'rolled-back'].includes(pointer.status)) throw failure('INVALID_PROJECT_STATE');
    const data = await readRegular(join(state, 'backups', `${pointer.id}.json`), { maxBytes: 2 * 1024 * 1024 });
    if (sha256(data) !== pointer.hash) throw failure('INVALID_PROJECT_STATE');
    const snapshot = JSON.parse(data.toString('utf8'));
    if (snapshot.schema !== 1 || snapshot.id !== pointer.id || snapshot.project !== project || !isTarget(snapshot.target) || !isHash(snapshot.afterHash)) throw failure('INVALID_PROJECT_STATE');
    if (snapshot.before === null) {
      if (snapshot.beforeHash !== null || snapshot.beforeMode !== null) throw failure('INVALID_PROJECT_STATE');
    } else {
      if (typeof snapshot.before !== 'string' || !isHash(snapshot.beforeHash) || !Number.isInteger(snapshot.beforeMode) || snapshot.beforeMode < 0 || snapshot.beforeMode > 0o777) throw failure('INVALID_PROJECT_STATE');
      const before = Buffer.from(snapshot.before, 'base64');
      if (before.toString('base64') !== snapshot.before || before.length > 1024 * 1024 || sha256(before) !== snapshot.beforeHash) throw failure('INVALID_PROJECT_STATE');
    }
    if (!rollback && pointer.status === 'pending') throw failure('RECOVERY_REQUIRED');
    return { pointer, snapshot, fingerprint: sha256(raw), writer };
  } catch (error) {
    if (['WORKSPACE_BUSY', 'RECOVERY_REQUIRED', 'INVALID_PROJECT_STATE', 'UNSAFE_PATH', 'UNSAFE_FILE'].includes(error.code)) throw error;
    throw failure('INVALID_PROJECT_STATE');
  }
}

export async function ensureProjectState(project) {
  const parent = join(project, '.git/seroai');
  try { await fs.mkdir(parent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assertDirectory(parent, { privateOnly: true });
  const state = statePath(project);
  let created = false;
  try { await fs.mkdir(state, { mode: 0o700 }); created = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (created) {
    await writePrivateNew(join(state, 'owner.json'), JSON.stringify({ schema: 1, adapter: 'opencode-v2-project', project }));
    await fs.mkdir(join(state, 'backups'), { mode: 0o700 });
  }
  await loadProjectState(project);
}
