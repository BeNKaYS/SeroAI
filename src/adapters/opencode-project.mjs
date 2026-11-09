import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createOpenCodePreview } from './opencode.mjs';
import { mergeOpenCodeConfig } from './opencode-merge.mjs';
import { inspectOpenCodeSources } from './opencode-sources.mjs';
import { checkProject, configContent, ensureProjectState, loadProjectState, selectConfig, statePath, writerStopped } from './opencode-project-state.mjs';
import { failure, readRegular, writeAtomic, writePrivateNew } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';

const installs = new WeakMap();
const rollbacks = new WeakMap();
const digest = content => content === null ? null : sha256(content);
const sourceOptions = options => Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'project'));

async function installation(options, locks = {}) {
  if (!options || typeof options !== 'object') throw failure('INVALID_PROJECT');
  const project = await checkProject(options.project);
  const preview = createOpenCodePreview(sourceOptions(options));
  const state = await loadProjectState(project, locks);
  const target = await selectConfig(project);
  const before = await configContent(project, target);
  const text = before.content?.toString('utf8') ?? '{}';
  if (before.content && !Buffer.from(text, 'utf8').equals(before.content)) throw failure('INVALID_PROJECT_CONFIG');
  const merged = mergeOpenCodeConfig(text, preview.configFragment);
  const after = Buffer.from(merged.content, 'utf8');
  if (after.length > 1024 * 1024) throw failure('INVALID_PROJECT_CONFIG');
  const sources = await inspectOpenCodeSources(preview.configFragment);
  const id = sha256(JSON.stringify([project, target, digest(before.content), before.mode, sha256(after), sources, state.fingerprint]));
  return { project, target, before, after, sources, changes: merged.changes, id, options: structuredClone(options) };
}

export async function planOpenCodeProject(options) {
  const record = await installation(options);
  const plan = Object.freeze({
    id: record.id, mode: 'opencode-project-preview', changesApplied: false,
    readyToApply: true, runtimeStatus: 'unverified', target: record.target,
    noChanges: record.changes.length === 0,
    changes: Object.freeze(record.changes.map(change => Object.freeze({ ...change }))),
    sources: Object.freeze(record.sources.map(source => Object.freeze({ ...source }))),
  });
  installs.set(plan, { ...record, used: false });
  return plan;
}

function approved(store, plan, approval) {
  const record = store.get(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (approval?.approvedPlanId !== plan.id) throw failure('APPROVAL_REQUIRED');
  return record;
}

async function lock(project, type) {
  const nonce = randomUUID();
  const path = join(statePath(project), `${type}.lock`);
  try { await writePrivateNew(path, JSON.stringify({ pid: process.pid, nonce })); }
  catch (error) { throw failure(error.code === 'EEXIST' ? 'WORKSPACE_BUSY' : 'INVALID_PROJECT_STATE'); }
  return { nonce, path };
}

async function setLatest(project, snapshot, hash, status) {
  await writeAtomic(join(statePath(project), 'latest.json'), JSON.stringify({ schema: 1, id: snapshot.id, hash, status }));
}

async function restore(project, snapshot) {
  const current = await configContent(project, snapshot.target);
  const observed = digest(current.content);
  if (observed !== snapshot.afterHash && observed !== snapshot.beforeHash) throw failure('CONFLICT');
  const path = join(project, snapshot.target);
  if (observed !== snapshot.beforeHash) {
    if (snapshot.before === null) await fs.unlink(path);
    else await writeAtomic(path, Buffer.from(snapshot.before, 'base64'));
  }
  if (snapshot.beforeMode !== null) await fs.chmod(path, snapshot.beforeMode);
}

export async function applyOpenCodeProject(plan, approval) {
  const record = approved(installs, plan, approval);
  const first = await installation(record.options);
  if (first.id !== record.id) throw failure('STALE_PLAN');
  if (!record.changes.length) {
    record.used = true;
    return { applied: false, changesApplied: false, target: record.target };
  }
  await ensureProjectState(record.project);
  const writer = await lock(record.project, 'write');
  try {
    const fresh = await installation(record.options, { writerNonce: writer.nonce });
    if (fresh.id !== record.id) throw failure('STALE_PLAN');
    const snapshot = {
      schema: 1, id: randomUUID(), project: record.project, target: record.target,
      before: record.before.content === null ? null : record.before.content.toString('base64'),
      beforeHash: digest(record.before.content), beforeMode: record.before.mode,
      afterHash: sha256(record.after), changes: record.changes,
    };
    const data = JSON.stringify(snapshot);
    const hash = sha256(data);
    // Yedek ve pending işaretçisi tamamlanmadan hedefe yazılmaz.
    try {
      await writePrivateNew(join(statePath(record.project), 'backups', `${snapshot.id}.json`), data);
      await setLatest(record.project, snapshot, hash, 'pending');
    } catch (cause) { throw failure('BACKUP_FAILED', cause); }
    record.used = true;
    try {
      const current = await configContent(record.project, record.target);
      if (digest(current.content) !== snapshot.beforeHash) throw failure('CONFLICT');
      await writeAtomic(join(record.project, record.target), record.after);
      await setLatest(record.project, snapshot, hash, 'applied');
    } catch (cause) {
      try {
        await restore(record.project, snapshot);
        await setLatest(record.project, snapshot, hash, 'rolled-back');
      } catch {
        throw failure('RECOVERY_REQUIRED');
      }
      throw failure('PROJECT_APPLY_FAILED', cause);
    }
    return { applied: true, changesApplied: true, target: record.target, transactionId: snapshot.id };
  } finally {
    await fs.unlink(writer.path);
  }
}

async function rollbackState(project, locks = {}) {
  project = await checkProject(project);
  const state = await loadProjectState(project, { ...locks, rollback: true });
  if (!state.pointer || state.pointer.status === 'rolled-back') return null;
  const current = await configContent(project, state.snapshot.target);
  const observed = digest(current.content);
  const pending = state.pointer.status === 'pending';
  if (observed !== state.snapshot.afterHash && !(pending && observed === state.snapshot.beforeHash)) throw failure('CONFLICT');
  if (!pending && current.mode !== 0o600) throw failure('CONFLICT');
  const id = sha256(JSON.stringify([project, state.fingerprint, observed, current.mode, state.writer?.hash ?? null]));
  return { project, state, observed, id };
}

export async function planOpenCodeRollback(project) {
  const record = await rollbackState(project);
  if (!record) return null;
  const plan = Object.freeze({
    id: record.id, mode: 'opencode-rollback-preview', changesApplied: false,
    target: record.state.snapshot.target,
    action: record.observed === record.state.snapshot.beforeHash ? 'leave' : record.state.snapshot.before === null ? 'delete' : 'restore',
    interrupted: record.state.pointer.status === 'pending',
  });
  rollbacks.set(plan, { ...record, used: false });
  return plan;
}

export async function rollbackOpenCodeProject(plan, approval) {
  const record = approved(rollbacks, plan, approval);
  const recovery = await lock(record.project, 'recovery');
  try {
    let fresh;
    try { fresh = await rollbackState(record.project, { recoveryNonce: recovery.nonce }); }
    catch { throw failure('STALE_PLAN'); }
    if (!fresh || fresh.id !== record.id) throw failure('STALE_PLAN');
    if (fresh.state.writer) {
      if (!writerStopped(fresh.state.writer.pid)) throw failure('WORKSPACE_BUSY');
      const path = join(statePath(record.project), 'write.lock');
      if (sha256(await readRegular(path)) !== fresh.state.writer.hash) throw failure('STALE_PLAN');
      await fs.unlink(path);
    }
    record.used = true;
    try {
      await restore(record.project, fresh.state.snapshot);
      await setLatest(record.project, fresh.state.snapshot, fresh.state.pointer.hash, 'rolled-back');
    } catch { throw failure('RECOVERY_REQUIRED'); }
    return { rolledBack: true, changesApplied: true, target: fresh.state.snapshot.target };
  } finally {
    await fs.unlink(recovery.path);
  }
}
