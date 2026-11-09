import fs from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertDirectory, failure, readRegular, regularFile, writeAtomic, writePrivateNew } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';
import { downloadTrusted } from './sources.mjs';
import { extractTarGz } from './tar.mjs';
import { installRecord, observeSkills } from './plan.mjs';
import {
  acquireInstallLock, ensureSkillsDirectory, ensureStateDirectory, installedFilePath, loadInstallState, loadLatest,
  releaseInstallLock, restorePreviousState, saveInstallState, saveLatest, savePreviousState, statePath,
} from './state.mjs';

const TARBALL_LIMIT = 32 * 1024 * 1024;

function approval(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw failure('APPROVAL_REQUIRED');
  return value;
}

function gitBlobSha(content) {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function matchesTree(content, file) {
  if (content.length === file.size && gitBlobSha(content) === file.sha) return true;
  if (!content.includes(0x0d) || content.includes(0)) return false;
  const normalized = Buffer.from(content.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return normalized.length === file.size && gitBlobSha(normalized) === file.sha;
}

function repositoryName(repository) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository ?? '');
  if (!match) throw failure('INVALID_INSTALL_SOURCE');
  return { owner: match[1], repo: match[2] };
}

async function exists(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function stageSkill(context, transactionId, source, skill, files) {
  const directory = join(context.stateDirectory, 'staging', transactionId, skill.name);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await assertDirectory(directory, { privateOnly: true });
  for (const file of files) {
    const target = join(directory, file.path);
    const parent = join(target, '..');
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });
    await writePrivateNew(target, file.content);
    await fs.chmod(target, file.mode);
  }
  return directory;
}

async function packageFiles(context, transactionId, source, planned, fetchImpl) {
  const { owner, repo } = repositoryName(source.repository);
  const base = `${repo}-${source.ref}`;
  const raw = await downloadTrusted(`https://codeload.github.com/${owner}/${repo}/tar.gz/${source.ref}`, TARBALL_LIMIT, fetchImpl);
  const prefixes = planned.skills.map(skill => `${base}/${skill.root}/`);
  const archive = extractTarGz(raw, { include: path => prefixes.some(prefix => path.startsWith(prefix)), withMode: true });
  const staged = [];
  for (const skill of planned.skills) {
    const prefix = `${base}/${skill.root}/`;
    const plannedPaths = new Set(skill.files.map(file => file.path));
    for (const path of archive.keys()) {
      if (path.startsWith(prefix) && !plannedPaths.has(path.slice(prefix.length))) throw failure('INSTALL_INTEGRITY_FAILED');
    }
    const files = [];
    for (const file of skill.files) {
      const entry = archive.get(`${prefix}${file.path}`);
      if (!entry || !matchesTree(entry.data, file)) throw failure('INSTALL_INTEGRITY_FAILED');
      files.push({ path: file.path, content: entry.data, mode: entry.mode & 0o111 ? 0o755 : 0o644, sha256: sha256(entry.data), size: entry.data.length });
    }
    const directory = await stageSkill(context, transactionId, source, skill, files);
    staged.push({ ...skill, directory, files });
  }
  return { ...planned, ref: source.ref, license: source.license, staged, source };
}

export async function applyInstall(plan, consent, transport = {}) {
  const planId = approval(consent?.approvedPlanId);
  const record = installRecord(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (plan.id !== planId) throw failure('STALE_PLAN');
  const active = record.actions.filter(action => action.action !== 'none');
  if (!active.length) {
    record.used = true;
    return { installed: false, changesApplied: false, unchanged: true, skills: [] };
  }
  const context = record.context;
  const fresh = await loadInstallState(context);
  if (fresh.fingerprint !== record.loaded.fingerprint) throw failure('STALE_PLAN');
  for (const action of active) if (await exists(action.path)) throw failure('STALE_PLAN');
  await ensureStateDirectory(context);
  const lock = await acquireInstallLock(context);
  const transactionId = randomUUID();
  const fetchImpl = transport.fetchImpl ?? globalThis.fetch;
  let moved = [];
  let previousHash = null;
  let captured = false;
  try {
    const staged = [];
    for (const item of record.packages) {
      const source = record.sources.find(candidate => candidate.id === item.id);
      if (!source) throw failure('INVALID_INSTALL_STATE');
      staged.push(await packageFiles(context, transactionId, source, item, fetchImpl));
    }
    await ensureSkillsDirectory(context);
    for (const action of active) if (await exists(action.path)) throw failure('STALE_PLAN');
    const previousRaw = record.loaded.state ? await readRegular(statePath(context)) : null;
    previousHash = await savePreviousState(context, previousRaw);
    captured = true;
    await saveLatest(context, { schema: 1, transactionId, status: 'pending', created: active.map(action => action.skill), previous: previousHash });
    for (const item of staged) {
      for (const skill of item.staged) {
        const target = join(context.skillsDirectory, skill.name);
        await fs.rename(skill.directory, target);
        moved.push(target);
      }
    }
    const previousById = new Map((record.loaded.state?.packages ?? []).map(item => [item.id, item]));
    const packages = [
      ...(record.loaded.state?.packages ?? []).filter(item => !staged.some(candidate => candidate.id === item.id)),
      ...staged.map(item => ({
        id: item.id,
        ref: item.ref,
        license: item.license,
        skills: [
          ...(previousById.get(item.id)?.skills ?? []).filter(skill => !item.staged.some(candidate => candidate.name === skill.name)),
          ...item.staged.map(skill => ({ name: skill.name, files: skill.files.map(file => ({ path: file.path, sha256: file.sha256, size: file.size })) })),
        ],
      })),
    ];
    const state = {
      schema: 1,
      target: context.type,
      root: context.root,
      skillsDirectory: context.skillsDirectory,
      transactionId,
      packages,
    };
    await saveInstallState(context, state);
    await saveLatest(context, { schema: 1, transactionId, status: 'applied', created: active.map(action => action.skill), previous: previousHash });
    record.used = true;
    return { installed: true, changesApplied: true, transactionId, skills: active.map(action => action.skill) };
  } catch (cause) {
    let recovered = true;
    for (const target of moved.reverse()) {
      try { await fs.rm(target, { recursive: true, force: true }); } catch { recovered = false; }
    }
    if (captured) {
      try {
        await restorePreviousState(context, previousHash);
        await saveLatest(context, { schema: 1, transactionId, status: 'rolled-back', created: active.map(action => action.skill), previous: previousHash });
      } catch { recovered = false; }
    }
    if (!recovered) throw failure('RECOVERY_REQUIRED');
    if (['STALE_PLAN', 'CONFLICT', 'INSTALL_INTEGRITY_FAILED', 'INVALID_INSTALL_STATE', 'INVALID_ARCHIVE', 'INSTALL_SOURCE_UNAVAILABLE'].includes(cause.code)) throw cause;
    throw failure('INSTALL_APPLY_FAILED', cause);
  } finally {
    await fs.rm(join(context.stateDirectory, 'staging', transactionId), { recursive: true, force: true }).catch(() => {});
    await releaseInstallLock(lock);
  }
}

export async function rollbackInstall(plan, consent) {
  const planId = approval(consent?.approvedPlanId);
  const record = installRecord(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (plan.id !== planId) throw failure('STALE_PLAN');
  const context = record.context;
  const lock = await acquireInstallLock(context);
  try {
    const latest = await loadLatest(context);
    if (!latest || latest.hash !== record.latest.hash || latest.status === 'rolled-back') throw failure('STALE_PLAN');
    const fresh = await loadInstallState(context);
    if (fresh.fingerprint !== record.loaded.fingerprint) throw failure('STALE_PLAN');
    const observed = await observeSkills(context, fresh.state);
    if (observed.some(skill => skill.status !== 'unchanged')) throw failure('CONFLICT');
    for (const name of record.latest.created) {
      await fs.rm(join(context.skillsDirectory, name), { recursive: true, force: true });
    }
    await restorePreviousState(context, record.latest.previous);
    await saveLatest(context, { schema: 1, transactionId: record.latest.transactionId, status: 'rolled-back', created: record.latest.created, previous: record.latest.previous });
    record.used = true;
    return { rolledBack: true, changesApplied: true, skills: record.latest.created };
  } finally {
    await releaseInstallLock(lock);
  }
}

export async function uninstallSkills(plan, consent) {
  const planId = approval(consent?.approvedPlanId);
  const record = installRecord(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (plan.id !== planId) throw failure('STALE_PLAN');
  const context = record.context;
  const lock = await acquireInstallLock(context);
  try {
    const fresh = await loadInstallState(context);
    if (fresh.fingerprint !== record.loaded.fingerprint) throw failure('STALE_PLAN');
    const observed = await observeSkills(context, fresh.state);
    if (observed.some(skill => skill.status !== 'unchanged')) throw failure('CONFLICT');
    const remove = record.packages.flatMap(item => item.skills.map(skill => skill.name));
    for (const name of remove) await fs.rm(join(context.skillsDirectory, name), { recursive: true, force: true });
    const remaining = fresh.state.packages.filter(item => !record.packages.some(candidate => candidate.id === item.id));
    record.used = true;
    if (!remaining.length) {
      await fs.unlink(statePath(context)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      return { removed: remove, changesApplied: true, empty: true };
    }
    const state = { ...fresh.state, transactionId: randomUUID(), packages: remaining };
    await saveInstallState(context, state);
    return { removed: remove, changesApplied: true, empty: false };
  } finally {
    await releaseInstallLock(lock);
  }
}
