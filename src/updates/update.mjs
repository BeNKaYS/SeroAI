import fs from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkProject } from '../adapters/opencode-project-state.mjs';
import { assertDirectory, failure, readRegular, regularFile, writeAtomic, writePrivateNew } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';
import { compareVersions, TOTAL_LIMIT, validateVersion } from './manifest.mjs';
import { inspectUpdateSource } from './source.mjs';
import { acquireUpdateLock, ensureUpdateState, loadUpdateState, saveUpdatePointer, stopped, updateStatePath } from './state.mjs';

const knownPaths = new Set([
  'version.json', 'package.json', 'package-lock.json', 'README.md', 'catalog/packages.json', 'catalog/clients.json',
  ...['catalog', 'plan', 'safe-files', 'workspace-state', 'workspace', 'journal', 'recovery', 'inspection'].map(name => `src/core/${name}.mjs`),
  ...['opencode', 'opencode-merge', 'opencode-sources', 'opencode-project', 'opencode-project-state'].map(name => `src/adapters/${name}.mjs`),
  ...['main', 'messages', 'opencode-project', 'stage-four'].map(name => `src/cli/${name}.mjs`),
  ...['manifest', 'source', 'state', 'update'].map(name => `src/updates/${name}.mjs`),
  'src/profiles/profile.mjs',
]);
const plans = new WeakMap();
const rollbacks = new WeakMap();
const hash = content => content === null ? null : sha256(content);

async function applicationRoot(root) {
  root = await checkProject(root);
  try {
    const pkg = JSON.parse((await readRegular(join(root, 'package.json'))).toString('utf8'));
    if (pkg.name !== 'seroai') throw failure('INVALID_UPDATE_TARGET');
    await readRegular(join(root, 'src/cli/main.mjs'));
  } catch (error) {
    if (['UNSAFE_FILE', 'UNSAFE_PATH'].includes(error.code)) throw error;
    throw failure('INVALID_UPDATE_TARGET');
  }
  return root;
}

async function parents(root, path, create = false) {
  let current = root;
  for (const segment of path.split('/').slice(0, -1)) {
    current = join(current, segment);
    try { await assertDirectory(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return;
      await fs.mkdir(current, { mode: 0o700 });
      await assertDirectory(current);
    }
  }
}

async function target(root, path) {
  await parents(root, path);
  const info = await regularFile(join(root, path));
  return info ? { content: await readRegular(join(root, path)), mode: info.mode & 0o777 } : { content: null, mode: null };
}

async function preparation(options, transport, locks = {}) {
  const root = await applicationRoot(options?.root);
  const state = await loadUpdateState(root, locks);
  const source = await inspectUpdateSource(options.source, transport);
  const current = validateVersion(JSON.parse((await readRegular(join(root, 'version.json'))).toString('utf8')));
  const files = [];
  let previousBytes = 0;
  for (const entry of source.manifest.files) {
    const before = await target(root, entry.path);
    if (before.content !== null && !knownPaths.has(entry.path) && !state.ownedPaths.includes(entry.path)) throw failure('UNOWNED_UPDATE_FILE');
    previousBytes += before.content?.length ?? 0;
    if (previousBytes > TOTAL_LIMIT) throw failure('INVALID_UPDATE_TARGET');
    files.push({ ...entry, before: before.content, beforeHash: hash(before.content), beforeMode: before.mode, afterMode: before.mode ?? 0o600 });
  }
  const id = sha256(JSON.stringify([root, current, source.fingerprint, files.map(file => [file.path, file.beforeHash, file.beforeMode]), state.fingerprint]));
  return { root, source, current, files, state, id, available: compareVersions(source.version.surum, current.surum) > 0, options: structuredClone(options), transport };
}

export async function planUpdate(options, transport = {}) {
  const record = await preparation(options, transport);
  const plan = Object.freeze({
    id: record.id, mode: 'update-preview', changesApplied: false, available: record.available,
    current: Object.freeze({ ...record.current }), candidate: Object.freeze({ ...record.source.version }),
    source: Object.freeze({ ...record.source.descriptor }),
    files: Object.freeze(record.files.map(file => Object.freeze({ path: file.path, action: file.before === null ? 'create' : 'replace', size: file.size, beforeHash: file.beforeHash, afterHash: file.sha256 }))),
  });
  plans.set(plan, { ...record, used: false });
  return plan;
}

function approve(store, plan, approval) {
  const record = store.get(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (approval?.approvedPlanId !== plan.id) throw failure('APPROVAL_REQUIRED');
  return record;
}

async function restorable(root, files, pending) {
  for (const file of files) {
    const current = await target(root, file.path);
    const observed = hash(current.content);
    if (observed !== file.afterHash && !(pending && observed === file.beforeHash)) throw failure('CONFLICT');
    if (!pending && current.mode !== file.afterMode) throw failure('CONFLICT');
  }
}

async function restore(root, files) {
  await restorable(root, files, true);
  for (const file of [...files].reverse()) {
    const current = await target(root, file.path);
    const observed = hash(current.content);
    if (observed !== file.beforeHash) {
      if (file.before === null) await fs.unlink(join(root, file.path));
      else {
        await parents(root, file.path, true);
        await writeAtomic(join(root, file.path), Buffer.from(file.before, 'base64'));
      }
    }
    if (file.beforeMode !== null) await fs.chmod(join(root, file.path), file.beforeMode);
  }
}

export async function applyUpdate(plan, approval) {
  const record = approve(plans, plan, approval);
  if ((await preparation(record.options, record.transport)).id !== record.id) throw failure('STALE_PLAN');
  if (!record.available) { record.used = true; return { updated: false, changesApplied: false }; }
  await ensureUpdateState(record.root);
  const writer = await acquireUpdateLock(record.root, 'write');
  try {
    const fresh = await preparation(record.options, record.transport, { writerNonce: writer.nonce });
    if (fresh.id !== record.id) throw failure('STALE_PLAN');
    const snapshot = {
      schema: 1, id: randomUUID(), root: record.root, source: record.source.descriptor,
      ownedPaths: [...new Set([...record.state.ownedPaths, ...record.files.map(file => file.path)])],
      files: record.files.map(file => ({ path: file.path, before: file.before === null ? null : file.before.toString('base64'), beforeHash: file.beforeHash, beforeMode: file.beforeMode, afterHash: file.sha256, afterMode: file.afterMode })),
    };
    const raw = JSON.stringify(snapshot);
    const snapshotHash = sha256(raw);
    try {
      await writePrivateNew(join(updateStatePath(record.root), 'backups', `${snapshot.id}.json`), raw);
      await saveUpdatePointer(record.root, snapshot, snapshotHash, 'pending');
    } catch { throw failure('BACKUP_FAILED'); }
    record.used = true;
    let staging = null;
    try {
      // Payload yedekten sonra alınır; indirilen kod veya paket script'i çalıştırılmaz.
      const payload = await fresh.source.readFiles();
      validateVersion(JSON.parse(payload.get('version.json').toString('utf8')));
      if (payload.has('package.json') && JSON.parse(payload.get('package.json').toString('utf8')).name !== 'seroai') throw failure('UPDATE_INTEGRITY_FAILED');
      staging = join(updateStatePath(record.root), 'staging', snapshot.id);
      await fs.mkdir(staging, { recursive: true, mode: 0o700 });
      for (const [path, content] of payload) {
        await parents(staging, path, true);
        await writePrivateNew(join(staging, path), content);
      }
      const ordered = [...record.files.filter(file => file.path !== 'version.json'), ...record.files.filter(file => file.path === 'version.json')];
      for (const file of ordered) {
        const current = await target(record.root, file.path);
        if (hash(current.content) !== file.beforeHash || current.mode !== file.beforeMode) throw failure('CONFLICT');
        const content = await readRegular(join(staging, file.path));
        if (sha256(content) !== file.sha256) throw failure('UPDATE_INTEGRITY_FAILED');
        await parents(record.root, file.path, true);
        await writeAtomic(join(record.root, file.path), content);
        await fs.chmod(join(record.root, file.path), file.afterMode);
      }
      await saveUpdatePointer(record.root, snapshot, snapshotHash, 'applied');
    } catch (cause) {
      try { await restore(record.root, snapshot.files); await saveUpdatePointer(record.root, snapshot, snapshotHash, 'rolled-back'); }
      catch { throw failure('RECOVERY_REQUIRED'); }
      throw failure('UPDATE_APPLY_FAILED', cause);
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
    return { updated: true, changesApplied: true, transactionId: snapshot.id, version: record.source.version.surum, refresh: 'restart-cli-manually' };
  } finally { await fs.unlink(writer.path); }
}

async function rollbackPreparation(root, locks = {}) {
  root = await applicationRoot(root);
  const state = await loadUpdateState(root, { ...locks, rollback: true });
  if (!state.pointer || state.pointer.status === 'rolled-back') return null;
  await restorable(root, state.snapshot.files, state.pointer.status === 'pending');
  const observed = [];
  for (const file of state.snapshot.files) {
    const current = await target(root, file.path);
    observed.push([file.path, hash(current.content), current.mode]);
  }
  const id = sha256(JSON.stringify([root, state.fingerprint, observed, state.writer?.hash ?? null]));
  return { root, state, id };
}

export async function planUpdateRollback(root) {
  const record = await rollbackPreparation(root);
  if (!record) return null;
  const plan = Object.freeze({ id: record.id, mode: 'update-rollback-preview', changesApplied: false, interrupted: record.state.pointer.status === 'pending', files: Object.freeze(record.state.snapshot.files.map(file => Object.freeze({ path: file.path, action: file.before === null ? 'delete' : 'restore' }))) });
  rollbacks.set(plan, { ...record, used: false });
  return plan;
}

export async function rollbackUpdate(plan, approval) {
  const record = approve(rollbacks, plan, approval);
  const recovery = await acquireUpdateLock(record.root, 'recovery');
  try {
    let fresh;
    try { fresh = await rollbackPreparation(record.root, { recoveryNonce: recovery.nonce }); } catch { throw failure('STALE_PLAN'); }
    if (!fresh || fresh.id !== record.id) throw failure('STALE_PLAN');
    if (fresh.state.writer) {
      const path = join(updateStatePath(record.root), 'write.lock');
      if (!stopped(fresh.state.writer.pid) || sha256(await readRegular(path)) !== fresh.state.writer.hash) throw failure('WORKSPACE_BUSY');
      await fs.unlink(path);
    }
    record.used = true;
    try { await restore(record.root, fresh.state.snapshot.files); await saveUpdatePointer(record.root, fresh.state.snapshot, fresh.state.pointer.hash, 'rolled-back'); }
    catch { throw failure('RECOVERY_REQUIRED'); }
    return { rolledBack: true, changesApplied: true, refresh: 'restart-cli-manually' };
  } finally { await fs.unlink(recovery.path); }
}
