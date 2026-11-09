import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { failure } from '../core/safe-files.mjs';

const baseline = ['superpowers', 'graphify', 'caveman', 'ponytail', 'karpathy-skills', 'impeccable', 'github-mcp'];
const kinds = new Set(['skills', 'tool', 'mcp']);
const reasons = new Set(['license-missing', 'upstream-cli', 'config-only']);
const hosts = new Set(['api.github.com', 'codeload.github.com']);

function invalid() {
  return failure('INVALID_INSTALL_SOURCE');
}

function safeURL(value) {
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) throw invalid();
  return url;
}

export async function downloadTrusted(value, limit, fetchImpl = globalThis.fetch) {
  try {
    let current = value;
    for (let redirects = 0; redirects < 5; redirects++) {
      const target = safeURL(current);
      const response = await fetchImpl(target.href, { redirect: 'manual', signal: AbortSignal.timeout(120_000), headers: { accept: 'application/vnd.github+json' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw failure('INSTALL_SOURCE_UNAVAILABLE');
        current = safeURL(new URL(location, target).href).href;
        continue;
      }
      if (!response.ok) throw failure('INSTALL_SOURCE_UNAVAILABLE');
      if (Number(response.headers.get('content-length') ?? 0) > limit) throw failure('INSTALL_SOURCE_UNAVAILABLE');
      if (!response.body) throw failure('INSTALL_SOURCE_UNAVAILABLE');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.length;
          if (size > limit) throw failure('INSTALL_SOURCE_UNAVAILABLE');
          chunks.push(Buffer.from(chunk));
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    }
    throw failure('INSTALL_SOURCE_UNAVAILABLE');
  } catch (error) {
    if (['INVALID_INSTALL_SOURCE', 'INSTALL_SOURCE_UNAVAILABLE'].includes(error.code)) throw error;
    throw failure('INSTALL_SOURCE_UNAVAILABLE');
  }
}

function repositoryParts(repository) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository ?? '');
  if (!match) throw invalid();
  return { owner: match[1], repo: match[2] };
}

function sourceIsValid(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return false;
  const keys = new Set(Object.keys(source));
  const required = ['id', 'installable', 'kind', 'license', 'ref', 'repository'];
  if (!required.every(key => keys.has(key))) return false;
  const extras = [...keys].filter(key => !required.includes(key));
  if (extras.some(key => !['reason', 'skillsRoot'].includes(key))) return false;
  if (!baseline.includes(source.id) || typeof source.installable !== 'boolean' || !kinds.has(source.kind)) return false;
  if (typeof source.ref !== 'string' || !/^[a-f0-9]{40}$/.test(source.ref)) return false;
  if (source.license !== null && (typeof source.license !== 'string' || !/^[A-Za-z0-9.+-]{2,40}$/.test(source.license))) return false;
  try { repositoryParts(source.repository); } catch { return false; }
  if (source.installable) {
    if (source.kind !== 'skills' || source.license === null || keys.has('reason') || !keys.has('skillsRoot')) return false;
    if (typeof source.skillsRoot !== 'string' || !/^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/.test(source.skillsRoot)) return false;
    if (source.skillsRoot.split('/').some(part => !part || part === '.' || part === '..')) return false;
  } else if (!reasons.has(source.reason)) return false;
  return true;
}

export async function loadSources(root) {
  try {
    const document = JSON.parse(await readFile(join(root, 'catalog/sources.json'), 'utf8'));
    if (document === null || typeof document !== 'object' || document.schema !== 1 || !Array.isArray(document.sources) || document.sources.length !== baseline.length) throw invalid();
    const seen = new Set();
    for (const source of document.sources) {
      if (!sourceIsValid(source) || seen.has(source.id)) throw invalid();
      seen.add(source.id);
    }
    if (baseline.some(id => !seen.has(id))) throw invalid();
    return { schema: document.schema, sources: document.sources };
  } catch (error) {
    if (error.code === 'INVALID_INSTALL_SOURCE') throw error;
    throw invalid();
  }
}

export async function sourceTree(source, { fetchImpl = globalThis.fetch } = {}) {
  if (!sourceIsValid(source) || !source.installable) throw invalid();
  const { owner, repo } = repositoryParts(source.repository);
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${source.ref}?recursive=1`;
  const raw = await downloadTrusted(url, 16 * 1024 * 1024, fetchImpl);
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw invalid(); }
  if (payload === null || typeof payload !== 'object' || payload.truncated !== false || !Array.isArray(payload.tree) || payload.tree.length > 20_000) throw invalid();
  const tree = new Map();
  for (const entry of payload.tree) {
    if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.sha !== 'string' || !/^[a-f0-9]{40}$/.test(entry.sha)) throw invalid();
    if (entry.type !== 'blob') continue;
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw invalid();
    tree.set(entry.path, { sha: entry.sha, size: entry.size });
  }
  return tree;
}

export function skillsFromTree(source, tree) {
  if (!sourceIsValid(source) || source.kind !== 'skills' || !(tree instanceof Map)) throw invalid();
  const prefix = `${source.skillsRoot}/`;
  const skills = [];
  for (const path of tree.keys()) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\/SKILL\.md$/.exec(rest);
    if (!match) continue;
    skills.push({ name: match[1], root: `${source.skillsRoot}/${match[1]}` });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
