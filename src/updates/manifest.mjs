import { failure } from '../core/safe-files.mjs';
import { isHash, sha256 } from '../core/workspace-state.mjs';

export const FILE_LIMIT = 1024 * 1024;
export const TOTAL_LIMIT = 16 * FILE_LIMIT;
const roots = new Set(['version.json', 'package.json', 'package-lock.json', 'README.md']);

export function isUpdatePath(path) {
  if (typeof path !== 'string' || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) return false;
  return roots.has(path) || /^catalog\/(packages|clients)\.json$/.test(path)
    || /^src\/(core|adapters|cli|updates|profiles)\/(?:[a-z][a-z0-9-]*\/)*[a-z][a-z0-9-]*\.mjs$/.test(path);
}

function parts(value) {
  if (typeof value !== 'string' || value.length > 100) throw failure('INVALID_UPDATE_MANIFEST');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*))?$/.exec(value);
  if (!match) throw failure('INVALID_UPDATE_MANIFEST');
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(item => /^\d+$/.test(item) && item.length > 1 && item.startsWith('0'))) throw failure('INVALID_UPDATE_MANIFEST');
  return { base: match.slice(1, 4).map(BigInt), pre };
}

export function compareVersions(a, b) {
  const first = parts(a);
  const second = parts(b);
  for (let i = 0; i < 3; i++) if (first.base[i] !== second.base[i]) return first.base[i] > second.base[i] ? 1 : -1;
  if (!first.pre.length || !second.pre.length) return first.pre.length === second.pre.length ? 0 : first.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(first.pre.length, second.pre.length); i++) {
    const x = first.pre[i];
    const y = second.pre[i];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function validateVersion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['surum', 'tarih', 'not'].includes(key))) throw failure('INVALID_UPDATE_MANIFEST');
  parts(value.surum);
  if (typeof value.not !== 'string' || !value.not.trim() || value.not.length > 2000 || typeof value.tarih !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.tarih)) throw failure('INVALID_UPDATE_MANIFEST');
  const date = new Date(`${value.tarih}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.tarih) throw failure('INVALID_UPDATE_MANIFEST');
  return value;
}

export function validateUpdateManifest(manifest, versionData) {
  try {
    const version = validateVersion(JSON.parse(versionData.toString('utf8')));
    if (!manifest || manifest.schema !== 1 || manifest.application !== 'seroai' || manifest.version !== version.surum
      || !Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 100) throw failure('INVALID_UPDATE_MANIFEST');
    const seen = new Set();
    let total = 0;
    for (const file of manifest.files) {
      if (!file || !isUpdatePath(file.path) || seen.has(file.path.toLowerCase()) || !isHash(file.sha256)
        || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > FILE_LIMIT) throw failure('INVALID_UPDATE_MANIFEST');
      total += file.size;
      seen.add(file.path.toLowerCase());
    }
    const entry = manifest.files.find(file => file.path === 'version.json');
    if (total > TOTAL_LIMIT || !seen.has('src/cli/main.mjs') || !entry || entry.sha256 !== sha256(versionData) || entry.size !== versionData.length) throw failure('INVALID_UPDATE_MANIFEST');
    return manifest;
  } catch { throw failure('INVALID_UPDATE_MANIFEST'); }
}

export function verifyUpdateFiles(manifest, files) {
  if (!(files instanceof Map) || files.size !== manifest.files.length) throw failure('UPDATE_INTEGRITY_FAILED');
  for (const entry of manifest.files) {
    const data = files.get(entry.path);
    if (!Buffer.isBuffer(data) || data.length !== entry.size || sha256(data) !== entry.sha256) throw failure('UPDATE_INTEGRITY_FAILED');
  }
  return files;
}
