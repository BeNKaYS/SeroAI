import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertDirectory, failure, readRegular, regularFile, writeAtomic, writePrivateNew } from '../core/safe-files.mjs';
import { isHash, sha256 } from '../core/workspace-state.mjs';

export const STATE_FILE = 'state.json';
export const LATEST_FILE = 'latest.json';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const skillName = value => typeof value === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}$/.test(value);
const relativePath = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\\') && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');

export function installContext(options = {}) {
  if (options.global === true && options.project !== undefined) throw failure('INVALID_ARGUMENTS');
  if (options.global === true) {
    const home = options.home ?? homedir();
    return {
      type: 'global',
      root: home,
      skillsDirectory: join(home, '.config/opencode/skills'),
      stateDirectory: join(home, '.seroai/install'),
      configDirectory: join(home, '.config/opencode'),
    };
  }
  if (typeof options.project !== 'string' || !options.project) throw failure('INVALID_ARGUMENTS');
  return {
    type: 'project',
    root: options.project,
    skillsDirectory: join(options.project, '.opencode/skills'),
    stateDirectory: join(options.project, '.git/seroai/install'),
    configDirectory: join(options.project, '.opencode'),
  };
}

export function statePath(context) {
  return join(context.stateDirectory, STATE_FILE);
}

export function latestPath(context) {
  return join(context.stateDirectory, LATEST_FILE);
}

export function installedFilePath(context, skill, path) {
  return join(context.skillsDirectory, skill, path);
}

async function exists(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function validateState(state, context) {
  if (state === null || typeof state !== 'object' || Array.isArray(state) || state.schema !== 1) throw failure('INVALID_INSTALL_STATE');
  if (state.target !== context.type || state.root !== context.root || state.skillsDirectory !== context.skillsDirectory || !uuid(state.transactionId)) throw failure('INVALID_INSTALL_STATE');
  if (!Array.isArray(state.packages) || state.packages.length > 20) throw failure('INVALID_INSTALL_STATE');
  const ids = new Set();
  for (const item of state.packages) {
    if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || ids.has(item.id)) throw failure('INVALID_INSTALL_STATE');
    ids.add(item.id);
    if (typeof item.ref !== 'string' || !/^[a-f0-9]{40}$/.test(item.ref) || (item.license !== null && typeof item.license !== 'string')) throw failure('INVALID_INSTALL_STATE');
    if (!Array.isArray(item.skills) || item.skills.length > 200) throw failure('INVALID_INSTALL_STATE');
    const names = new Set();
    for (const skill of item.skills) {
      if (skill === null || typeof skill !== 'object' || !skillName(skill.name) || names.has(skill.name)) throw failure('INVALID_INSTALL_STATE');
      names.add(skill.name);
      if (!Array.isArray(skill.files) || skill.files.length > 2000) throw failure('INVALID_INSTALL_STATE');
      const paths = new Set();
      for (const file of skill.files) {
        if (file === null || typeof file !== 'object' || !relativePath(file.path) || paths.has(file.path) || !isHash(file.sha256)) throw failure('INVALID_INSTALL_STATE');
        if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 2 * 1024 * 1024) throw failure('INVALID_INSTALL_STATE');
        paths.add(file.path);
      }
    }
  }
  return state;
}

export async function loadInstallState(context) {
  try {
    if (!await exists(context.stateDirectory)) return { fingerprint: 'none', state: null };
    await assertDirectory(context.stateDirectory, { privateOnly: true });
    const file = statePath(context);
    if (!await regularFile(file)) return { fingerprint: 'none', state: null };
    const raw = await readRegular(file, { maxBytes: 8 * 1024 * 1024 });
    const state = validateState(JSON.parse(raw.toString('utf8')), context);
    return { fingerprint: sha256(raw), state };
  } catch (error) {
    if (['INVALID_INSTALL_STATE', 'UNSAFE_FILE', 'UNSAFE_PATH'].includes(error.code)) throw error;
    throw failure('INVALID_INSTALL_STATE');
  }
}

export async function ensureStateDirectory(context) {
  try { await fs.mkdir(context.stateDirectory, { recursive: true, mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assertDirectory(context.stateDirectory, { privateOnly: true });
}

export async function saveInstallState(context, state) {
  const raw = JSON.stringify(state);
  validateState(state, context);
  const file = statePath(context);
  if (await regularFile(file)) await writeAtomic(file, raw);
  else await writePrivateNew(file, raw);
}

export async function saveLatest(context, value) {
  await ensureStateDirectory(context);
  const raw = JSON.stringify(value);
  const file = latestPath(context);
  if (await regularFile(file)) await writeAtomic(file, raw);
  else await writePrivateNew(file, raw);
  return sha256(raw);
}

export async function loadLatest(context) {
  const file = latestPath(context);
  if (!await regularFile(file)) return null;
  try {
    const raw = await readRegular(file);
    const value = JSON.parse(raw.toString('utf8'));
    if (value === null || typeof value !== 'object' || value.schema !== 1 || !uuid(value.transactionId) || !['pending', 'applied', 'rolled-back'].includes(value.status) || !Array.isArray(value.created)) throw failure('INVALID_INSTALL_STATE');
    if (value.created.some(name => !skillName(name))) throw failure('INVALID_INSTALL_STATE');
    if (value.previous !== null && (typeof value.previous !== 'string' || !isHash(value.previous))) throw failure('INVALID_INSTALL_STATE');
    return { ...value, hash: sha256(raw) };
  } catch (error) {
    if (error.code === 'INVALID_INSTALL_STATE') throw error;
    throw failure('INVALID_INSTALL_STATE');
  }
}

export async function savePreviousState(context, raw) {
  if (raw === null) return null;
  await ensureStateDirectory(context);
  const directory = join(context.stateDirectory, 'previous');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await assertDirectory(directory, { privateOnly: true });
  const hash = sha256(raw);
  const file = join(directory, `${hash}.json`);
  if (!await regularFile(file)) await writePrivateNew(file, raw);
  return hash;
}

export async function restorePreviousState(context, hash) {
  if (hash === null) {
    const file = statePath(context);
    if (await regularFile(file)) await fs.unlink(file);
    return;
  }
  const raw = await readRegular(join(context.stateDirectory, 'previous', `${hash}.json`), { maxBytes: 8 * 1024 * 1024 });
  if (sha256(raw) !== hash) throw failure('INVALID_INSTALL_STATE');
  const file = statePath(context);
  if (await regularFile(file)) await writeAtomic(file, raw);
  else await writePrivateNew(file, raw);
}

export async function ensureSkillsDirectory(context) {
  if (context.type === 'project') {
    try { await fs.mkdir(context.configDirectory, { mode: 0o755 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  await assertDirectory(context.configDirectory);
  try { await fs.mkdir(context.skillsDirectory, { mode: 0o755 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assertDirectory(context.skillsDirectory);
}

export async function acquireInstallLock(context) {
  await ensureStateDirectory(context);
  const value = { pid: process.pid, nonce: randomUUID() };
  const path = join(context.stateDirectory, 'write.lock');
  try { await writePrivateNew(path, JSON.stringify(value)); }
  catch (cause) { throw failure(cause.code === 'EEXIST' ? 'WORKSPACE_BUSY' : 'INVALID_INSTALL_STATE'); }
  return { ...value, path };
}

export async function releaseInstallLock(lock) {
  if (!lock?.path) return;
  try { await fs.unlink(lock.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function removeStateDirectory(context) {
  const state = statePath(context);
  if (await regularFile(state)) await fs.unlink(state);
}
