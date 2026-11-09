import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { assertDirectory, failure, regularFile, readRegular } from './safe-files.mjs';
import { loadOwnership } from './workspace-state.mjs';

export const inspectionWarnings = Object.freeze([
  'Inspection only compares the ownership record with current files; interrupted operations and backups are not verified. No recovery is performed.',
  'The ownership record is missing; this does not establish an empty or healthy installation.',
]);

async function fileStatus(path, expectedHash) {
  try {
    if (!await regularFile(path)) return 'missing';
    const actual = createHash('sha256').update(await readRegular(path)).digest('hex');
    return actual === expectedHash ? 'unchanged' : 'modified';
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'CONFLICT') return 'missing';
    if (error.code === 'UNSAFE_FILE' || error.code === 'ELOOP') return 'unsafe';
    throw failure('INSPECTION_FAILED');
  }
}

export async function inspectManagedWorkspace(root) {
  try {
    if (typeof root !== 'string' || !isAbsolute(root)) throw failure('INVALID_WORKSPACE');
    await assertDirectory(root, { privateOnly: true });
    await assertDirectory(join(root, '.seroai'), { privateOnly: true });
  } catch {
    throw failure('INVALID_WORKSPACE');
  }
  const record = await loadOwnership(root);
  const files = [];
  for (const [path, expectedHash] of Object.entries(record?.files ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    files.push({ path, status: await fileStatus(join(root, path), expectedHash) });
  }
  return {
    mode: 'inspection', changesApplied: false,
    revision: record?.revision ?? null,
    recordStatus: record ? 'present' : 'missing',
    files,
    warnings: record ? [inspectionWarnings[0]] : [...inspectionWarnings],
  };
}
