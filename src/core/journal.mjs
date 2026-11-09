import fs from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { assertDirectory, failure, isManagedFileName, readRegular, regularFile, writePrivateNew } from './safe-files.mjs';
import { isHash, ownershipKey, sha256, validateOwnership } from './workspace-state.mjs';

export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export async function assertWorkspaceRoot(root) {
  try {
    if (typeof root !== 'string' || !isAbsolute(root)) throw failure('INVALID_WORKSPACE');
    await assertDirectory(root, { privateOnly: true });
    await assertDirectory(join(root, '.seroai'), { privateOnly: true });
  } catch {
    throw failure('INVALID_WORKSPACE');
  }
}

export async function beginJournal(root, { id, operation, snapshotHash, source }) {
  const journal = { schemaVersion: 1, id, root: resolve(root), operation, writerPid: process.pid, snapshotHash, source };
  await assertDirectory(join(root, '.seroai'), { privateOnly: true });
  try {
    await writePrivateNew(join(root, '.seroai/pending.json'), JSON.stringify(journal, null, 2));
  } catch (cause) {
    if (cause.code === 'EEXIST') throw failure('RECOVERY_REQUIRED');
    throw failure('JOURNAL_FAILED', cause);
  }
}

export async function finishJournal(root) {
  await assertDirectory(join(root, '.seroai'), { privateOnly: true });
  await regularFile(join(root, '.seroai/pending.json'));
  await fs.unlink(join(root, '.seroai/pending.json'));
}

export function afterOwnership(snapshot) {
  const files = { ...snapshot.ownership };
  for (const entry of snapshot.files) files[entry.path] = entry.afterHash;
  return files;
}

function validateSnapshot(snapshot, id) {
  if (!snapshot || snapshot.id !== id || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
    || snapshot.revision > Number.MAX_SAFE_INTEGER - 3 || !Array.isArray(snapshot.files)
    || snapshot.files.length === 0 || snapshot.files.length > 100) throw failure('INVALID_JOURNAL');
  validateOwnership({ revision: snapshot.revision, files: snapshot.ownership });
  const seen = new Set();
  let total = 0;
  for (const entry of snapshot.files) {
    if (!entry || !isManagedFileName(entry.path) || seen.has(entry.path) || !isHash(entry.afterHash)
      || entry.beforeHash !== (snapshot.ownership[entry.path] ?? null)) throw failure('INVALID_JOURNAL');
    seen.add(entry.path);
    if (entry.beforeHash === null) {
      if (entry.before !== null) throw failure('INVALID_JOURNAL');
    } else {
      if (typeof entry.before !== 'string') throw failure('INVALID_JOURNAL');
      const before = Buffer.from(entry.before, 'base64');
      if (before.toString('base64') !== entry.before || sha256(before) !== entry.beforeHash || before.length > 1024 * 1024) {
        throw failure('INVALID_JOURNAL');
      }
      total += before.length;
      if (total > 8 * 1024 * 1024) throw failure('INVALID_JOURNAL');
    }
  }
}

export async function loadJournal(root) {
  try {
    const pending = join(root, '.seroai/pending.json');
    if (!await regularFile(pending)) return null;
    const raw = await readRegular(pending);
    const journal = JSON.parse(raw.toString('utf8'));
    if (!journal || journal.schemaVersion !== 1 || !uuid(journal.id) || journal.root !== resolve(root)
      || !['apply', 'rollback'].includes(journal.operation) || !isHash(journal.snapshotHash)
      || !Number.isSafeInteger(journal.writerPid) || journal.writerPid <= 0) throw failure('INVALID_JOURNAL');
    validateOwnership(journal.source);
    await assertDirectory(join(root, '.seroai/backups'), { privateOnly: true });
    const snapshotData = await readRegular(join(root, '.seroai/backups', `${journal.id}.json`), { maxBytes: MAX_SNAPSHOT_BYTES });
    if (sha256(snapshotData) !== journal.snapshotHash) throw failure('INVALID_JOURNAL');
    const snapshot = JSON.parse(snapshotData.toString('utf8'));
    validateSnapshot(snapshot, journal.id);
    const source = journal.operation === 'apply'
      ? { revision: snapshot.revision, files: snapshot.ownership }
      : { revision: snapshot.revision + 1, files: afterOwnership(snapshot) };
    if (ownershipKey(source) !== ownershipKey(journal.source)) throw failure('INVALID_JOURNAL');
    return { journal, snapshot, journalHash: sha256(raw) };
  } catch {
    throw failure('INVALID_JOURNAL');
  }
}
