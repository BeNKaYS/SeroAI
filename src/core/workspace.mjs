import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { assertDirectory, failure, isManagedFileName, regularFile, readRegular, writePrivateNew, writeAtomic } from './safe-files.mjs';
import { beginJournal, finishJournal, MAX_SNAPSHOT_BYTES } from './journal.mjs';

const hash = content => createHash('sha256').update(content).digest('hex');

function normalizeChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 100) throw failure('INVALID_CHANGE');
  const seen = new Set();
  let total = 0;
  return Array.from(changes, change => {
    if (!change || !isManagedFileName(change.path) || seen.has(change.path) || typeof change.content !== 'string') {
      throw failure('INVALID_CHANGE');
    }
    const content = Buffer.from(change.content, 'utf8');
    total += content.length;
    if (content.length > 1024 * 1024 || total > 8 * 1024 * 1024) throw failure('INVALID_CHANGE');
    seen.add(change.path);
    return { path: change.path, content };
  });
}

export async function createManagedWorkspace(parent, options) {
  if (options?.approved !== true) throw failure('APPROVAL_REQUIRED');
  if (typeof parent !== 'string' || parent.trim() === '') throw failure('UNSAFE_PATH');
  await assertDirectory(parent);
  const root = await fs.mkdtemp(join(resolve(parent), 'seroai-'));
  await fs.chmod(root, 0o700);
  const state = join(root, '.seroai');
  const backups = join(state, 'backups');
  await fs.mkdir(state, { mode: 0o700 });
  await fs.mkdir(backups, { mode: 0o700 });
  let ownership = new Map();
  let revision = 0;
  let busy = false;
  let broken = false;
  const plans = new WeakMap();
  const receipts = new WeakMap();

  async function exclusive(action) {
    if (broken) throw failure('RECOVERY_REQUIRED');
    if (busy) throw failure('BUSY');
    busy = true;
    try {
      await assertDirectory(root, { privateOnly: true });
      await assertDirectory(state, { privateOnly: true });
      if (await regularFile(join(state, 'pending.json'))) throw failure('RECOVERY_REQUIRED');
      if (await regularFile(join(state, 'recovery.lock'))) throw failure('WORKSPACE_BUSY');
      return await action();
    } finally {
      busy = false;
    }
  }

  async function currentContent(path, expected) {
    const file = join(root, path);
    const info = await regularFile(file);
    if (expected === null) {
      if (info) throw failure('CONFLICT');
      return null;
    }
    if (!info) throw failure('CONFLICT');
    const content = await readRegular(file);
    if (hash(content) !== expected) throw failure('CONFLICT');
    return content;
  }

  async function checkEntries(entries, side) {
    await assertDirectory(root, { privateOnly: true });
    for (const entry of entries) await currentContent(entry.path, side === 'before' ? entry.beforeHash : entry.afterHash);
  }

  async function saveOwnership(next, nextRevision) {
    await assertDirectory(state, { privateOnly: true });
    await writeAtomic(join(state, 'ownership.json'), JSON.stringify({
      revision: nextRevision, files: Object.fromEntries(next),
    }, null, 2));
  }

  async function restoreEntry(entry) {
    // İşlem sonrası kullanıcı düzenlemesi varsa onu ezme.
    await currentContent(entry.path, entry.afterHash);
    if (entry.before === null) await fs.unlink(join(root, entry.path));
    else await writeAtomic(join(root, entry.path), entry.before);
  }

  function authorized(store, object, approval) {
    const record = store.get(object);
    if (!record || record.used) throw failure('INVALID_PLAN');
    if (approval?.approvedPlanId !== object.id) throw failure('APPROVAL_REQUIRED');
    if (record.revision !== revision) throw failure('STALE_PLAN');
    return record;
  }

  return Object.freeze({
    root,
    async prepare(changes) {
      return exclusive(async () => {
        const entries = [];
        let previousBytes = 0;
        for (const change of normalizeChanges(changes)) {
          const beforeHash = ownership.get(change.path) ?? null;
          const before = await currentContent(change.path, beforeHash);
          previousBytes += before?.length ?? 0;
          if (previousBytes > 8 * 1024 * 1024) throw failure('INVALID_CHANGE');
          entries.push({ ...change, before, beforeHash, afterHash: hash(change.content) });
        }
        const plan = Object.freeze({
          id: randomUUID(), root, revision, changesApplied: false,
          items: Object.freeze(entries.map(entry => Object.freeze({
            path: entry.path, beforeHash: entry.beforeHash, afterHash: entry.afterHash, bytes: entry.content.length,
          }))),
        });
        plans.set(plan, { entries, revision, used: false });
        return plan;
      });
    },
    async apply(plan, approval) {
      return exclusive(async () => {
        const record = authorized(plans, plan, approval);
        await checkEntries(record.entries, 'before');
        const previousOwnership = new Map(ownership);
        const snapshot = {
          id: plan.id, revision,
          ownership: Object.fromEntries(ownership),
          files: record.entries.map(entry => ({
            path: entry.path, beforeHash: entry.beforeHash, afterHash: entry.afterHash,
            before: entry.before === null ? null : entry.before.toString('base64'),
          })),
        };
        const snapshotData = JSON.stringify(snapshot, null, 2);
        if (Buffer.byteLength(snapshotData) > MAX_SNAPSHOT_BYTES) throw failure('INVALID_CHANGE');
        const snapshotHash = hash(snapshotData);
        try {
          await assertDirectory(state, { privateOnly: true });
          await assertDirectory(backups, { privateOnly: true });
          await writePrivateNew(join(backups, `${plan.id}.json`), snapshotData);
        } catch (cause) {
          throw failure('BACKUP_FAILED', cause);
        }
        await beginJournal(root, {
          id: plan.id, operation: 'apply', snapshotHash,
          source: { revision, files: Object.fromEntries(ownership) },
        });
        record.used = true;
        const written = [];
        const next = new Map(ownership);
        try {
          for (const entry of record.entries) {
            await checkEntries([entry], 'before');
            await writeAtomic(join(root, entry.path), entry.content);
            written.push(entry);
            next.set(entry.path, entry.afterHash);
          }
          await saveOwnership(next, revision + 1);
          await finishJournal(root);
        } catch (cause) {
          try {
            for (const entry of [...written].reverse()) await restoreEntry(entry);
            await saveOwnership(previousOwnership, revision);
            await finishJournal(root);
          } catch (recoveryCause) {
            broken = true;
            throw failure('RECOVERY_REQUIRED', recoveryCause);
          }
          throw failure('APPLY_FAILED', cause);
        }
        ownership = next;
        revision += 1;
        const receipt = Object.freeze({ id: plan.id, root, revision, changesApplied: true });
        receipts.set(receipt, { entries: record.entries, previousOwnership, revision, snapshotHash, used: false });
        return receipt;
      });
    },
    async rollback(receipt, approval) {
      return exclusive(async () => {
        const record = authorized(receipts, receipt, approval);
        await checkEntries(record.entries, 'after');
        await assertDirectory(backups, { privateOnly: true });
        const snapshotData = await readRegular(join(backups, `${receipt.id}.json`), { maxBytes: MAX_SNAPSHOT_BYTES });
        if (hash(snapshotData) !== record.snapshotHash) throw failure('INVALID_JOURNAL');
        await beginJournal(root, {
          id: receipt.id, operation: 'rollback', snapshotHash: record.snapshotHash,
          source: { revision, files: Object.fromEntries(ownership) },
        });
        try {
          for (const entry of [...record.entries].reverse()) await restoreEntry(entry);
          await saveOwnership(record.previousOwnership, revision + 1);
          await finishJournal(root);
        } catch (cause) {
          broken = true;
          throw failure('RECOVERY_REQUIRED', cause);
        }
        record.used = true;
        ownership = new Map(record.previousOwnership);
        revision += 1;
        return Object.freeze({ id: receipt.id, rolledBack: true });
      });
    },
  });
}
