import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { failure, regularFile, readRegular, writeAtomic, writePrivateNew } from './safe-files.mjs';
import { afterOwnership, assertWorkspaceRoot, finishJournal, loadJournal } from './journal.mjs';
import { loadOwnership, ownershipKey, sha256 } from './workspace-state.mjs';

const plans = new WeakMap();

function assertWriterStopped(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return;
    throw failure('WORKSPACE_BUSY');
  }
  throw failure('WORKSPACE_BUSY');
}

async function currentHash(root, path) {
  const file = join(root, path);
  if (!await regularFile(file)) return null;
  return sha256(await readRegular(file));
}

async function context(root, { ignoreLock = false } = {}) {
  await assertWorkspaceRoot(root);
  const loaded = await loadJournal(root);
  if (!loaded) return null;
  if (!ignoreLock && await regularFile(join(root, '.seroai/recovery.lock'))) throw failure('WORKSPACE_BUSY');
  const { journal, snapshot } = loaded;
  assertWriterStopped(journal.writerPid);
  let ownership;
  try {
    ownership = await loadOwnership(root);
  } catch {
    throw failure('INVALID_JOURNAL');
  }
  const completed = {
    revision: journal.source.revision + 1,
    files: journal.operation === 'apply' ? afterOwnership(snapshot) : snapshot.ownership,
  };
  const restored = { revision: journal.source.revision + 2, files: snapshot.ownership };
  const permitted = [journal.source, completed, restored].map(ownershipKey);
  const emptyInitial = ownership === null && journal.source.revision === 0 && Object.keys(journal.source.files).length === 0;
  if (!emptyInitial && !permitted.includes(ownershipKey(ownership))) throw failure('INVALID_JOURNAL');
  const entries = [];
  for (const entry of snapshot.files) {
    const observedHash = await currentHash(root, entry.path);
    if (observedHash !== entry.beforeHash && observedHash !== entry.afterHash) throw failure('CONFLICT');
    entries.push({ ...entry, observedHash });
  }
  const fingerprint = sha256(JSON.stringify([
    resolve(root), loaded.journalHash, journal.snapshotHash, ownershipKey(ownership),
    entries.map(entry => [entry.path, entry.observedHash]),
  ]));
  return { ...loaded, entries, restored, fingerprint };
}

export async function prepareRecovery(root) {
  const record = await context(root);
  if (!record) return null;
  const plan = Object.freeze({
    id: record.fingerprint,
    transactionId: record.journal.id,
    mode: 'recovery-preview', changesApplied: false,
    operation: record.journal.operation,
    items: Object.freeze(record.entries.map(entry => Object.freeze({
      path: entry.path,
      action: entry.observedHash === entry.beforeHash ? 'leave' : entry.beforeHash === null ? 'delete' : 'restore',
    }))),
  });
  plans.set(plan, { root: resolve(root), fingerprint: record.fingerprint, used: false });
  return plan;
}

export async function recoverWorkspace(plan, approval) {
  const record = plans.get(plan);
  if (!record || record.used) throw failure('INVALID_PLAN');
  if (approval?.approvedPlanId !== plan.id) throw failure('APPROVAL_REQUIRED');
  await assertWorkspaceRoot(record.root);
  const lock = join(record.root, '.seroai/recovery.lock');
  try {
    await writePrivateNew(lock, JSON.stringify({ pid: process.pid, planId: plan.id }));
  } catch (cause) {
    if (cause.code === 'EEXIST') throw failure('WORKSPACE_BUSY');
    throw failure('RECOVERY_REQUIRED', cause);
  }
  try {
    let fresh;
    try {
      fresh = await context(record.root, { ignoreLock: true });
    } catch (cause) {
      if (cause.code === 'WORKSPACE_BUSY') throw cause;
      throw failure('STALE_PLAN');
    }
    if (!fresh || fresh.fingerprint !== record.fingerprint) throw failure('STALE_PLAN');
    record.used = true;
    try {
      for (const entry of fresh.entries) {
        await assertWorkspaceRoot(record.root);
        if (await currentHash(record.root, entry.path) !== entry.observedHash) throw failure('CONFLICT');
        if (entry.observedHash === entry.beforeHash) continue;
        if (entry.beforeHash === null) await fs.unlink(join(record.root, entry.path));
        else await writeAtomic(join(record.root, entry.path), Buffer.from(entry.before, 'base64'));
      }
      await assertWorkspaceRoot(record.root);
      await writeAtomic(join(record.root, '.seroai/ownership.json'), JSON.stringify(fresh.restored, null, 2));
      const pending = await readRegular(join(record.root, '.seroai/pending.json'));
      if (sha256(pending) !== fresh.journalHash) throw failure('STALE_PLAN');
      await finishJournal(record.root);
      return Object.freeze({ recovered: true, id: plan.id });
    } catch (cause) {
      throw failure('RECOVERY_REQUIRED', cause);
    }
  } finally {
    await fs.unlink(lock);
  }
}
