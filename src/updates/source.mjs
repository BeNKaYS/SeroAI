import { dirname, join, resolve } from 'node:path';
import { assertDirectory, failure, readRegular } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';
import { FILE_LIMIT, TOTAL_LIMIT, validateUpdateManifest, validateVersion, verifyUpdateFiles } from './manifest.mjs';

const hosts = new Set(['api.github.com', 'github.com', 'raw.githubusercontent.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

function safeURL(value) {
  let url;
  try { url = new URL(value); } catch { throw failure('INVALID_UPDATE_SOURCE'); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) throw failure('INVALID_UPDATE_SOURCE');
  return url;
}

async function download(url, limit, fetchImpl) {
  try {
    for (let redirects = 0; redirects < 6; redirects++) {
      const target = safeURL(url);
      const response = await fetchImpl(target.href, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw failure('UPDATE_SOURCE_UNAVAILABLE');
        url = safeURL(new URL(location, target).href).href;
        continue;
      }
      if (!response.ok) throw failure('UPDATE_SOURCE_UNAVAILABLE');
      if (Number(response.headers.get('content-length') ?? 0) > limit) throw failure('UPDATE_INTEGRITY_FAILED');
      if (!response.body) throw failure('UPDATE_SOURCE_UNAVAILABLE');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit) throw failure('UPDATE_INTEGRITY_FAILED');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    }
    throw failure('UPDATE_SOURCE_UNAVAILABLE');
  } catch (error) {
    if (['INVALID_UPDATE_SOURCE', 'UPDATE_SOURCE_UNAVAILABLE', 'UPDATE_INTEGRITY_FAILED'].includes(error.code)) throw error;
    throw failure('UPDATE_SOURCE_UNAVAILABLE');
  }
}

function repositoryName(value) {
  if (typeof value !== 'string') throw failure('INVALID_UPDATE_SOURCE');
  if (value.includes('://')) {
    const url = safeURL(value);
    if (url.hostname !== 'github.com' || url.search) throw failure('INVALID_UPDATE_SOURCE');
    value = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) throw failure('INVALID_UPDATE_SOURCE');
  return value;
}

export async function inspectUpdateSource(source, { fetchImpl = globalThis.fetch } = {}) {
  try {
    let descriptor;
    let metadata;
    let readFiles;
    if (source?.kind === 'local') {
      if (typeof source.directory !== 'string') throw failure('INVALID_UPDATE_SOURCE');
      const directory = resolve(source.directory);
      await assertDirectory(directory);
      metadata = await Promise.all(['version.json', 'update-manifest.json'].map(file => readRegular(join(directory, file))));
      descriptor = { kind: 'local', directory };
      readFiles = async manifest => {
        const files = new Map();
        for (const entry of manifest.files) {
          await assertDirectory(dirname(join(directory, entry.path)));
          files.set(entry.path, await readRegular(join(directory, entry.path)));
        }
        return files;
      };
    } else if (source?.kind === 'github') {
      const repository = repositoryName(source.repository);
      let versionURL;
      let manifestURL;
      if (source.ref !== undefined) {
        if (typeof source.ref !== 'string' || source.ref.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(source.ref) || source.ref.split('/').some(part => part === '.' || part === '..')) throw failure('INVALID_UPDATE_SOURCE');
        const commit = JSON.parse((await download(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(source.ref)}`, FILE_LIMIT, fetchImpl)).toString('utf8'));
        if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw failure('INVALID_UPDATE_SOURCE');
        descriptor = { kind: 'github', repository, mode: 'branch', ref: source.ref, commit: commit.sha };
        const base = `https://raw.githubusercontent.com/${repository}/${commit.sha}/`;
        versionURL = base + 'version.json';
        manifestURL = base + 'update-manifest.json';
        readFiles = async manifest => {
          const files = new Map();
          for (const entry of manifest.files) files.set(entry.path, await download(base + entry.path.split('/').map(encodeURIComponent).join('/'), FILE_LIMIT, fetchImpl));
          return files;
        };
      } else {
        const release = JSON.parse((await download(`https://api.github.com/repos/${repository}/releases/latest`, FILE_LIMIT, fetchImpl)).toString('utf8'));
        if (!Number.isSafeInteger(release.id) || release.id <= 0 || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) throw failure('INVALID_UPDATE_SOURCE');
        const asset = name => {
          const matches = release.assets.filter(item => item.name === name);
          if (matches.length !== 1) throw failure('UPDATE_SOURCE_UNAVAILABLE');
          const url = safeURL(matches[0].browser_download_url);
          if (url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`) || !url.pathname.endsWith(`/${name}`) || url.search) throw failure('INVALID_UPDATE_SOURCE');
          return url.href;
        };
        versionURL = asset('version.json');
        manifestURL = asset('update-manifest.json');
        const bundleURL = asset('seroai-update.json');
        descriptor = { kind: 'github', repository, mode: 'release', releaseId: release.id, tag: release.tag_name };
        readFiles = async () => {
          const bundle = JSON.parse((await download(bundleURL, TOTAL_LIMIT * 2, fetchImpl)).toString('utf8'));
          if (bundle.schema !== 1 || !Array.isArray(bundle.files) || bundle.files.length > 100) throw failure('UPDATE_INTEGRITY_FAILED');
          const files = new Map();
          for (const file of bundle.files) {
            if (!file || typeof file.path !== 'string' || files.has(file.path) || typeof file.data !== 'string') throw failure('UPDATE_INTEGRITY_FAILED');
            const data = Buffer.from(file.data, 'base64');
            if (data.toString('base64') !== file.data || data.length > FILE_LIMIT) throw failure('UPDATE_INTEGRITY_FAILED');
            files.set(file.path, data);
          }
          return files;
        };
      }
      metadata = await Promise.all([download(versionURL, FILE_LIMIT, fetchImpl), download(manifestURL, FILE_LIMIT, fetchImpl)]);
    } else throw failure('INVALID_UPDATE_SOURCE');
    const version = validateVersion(JSON.parse(metadata[0].toString('utf8')));
    const manifest = validateUpdateManifest(JSON.parse(metadata[1].toString('utf8')), metadata[0]);
    return {
      descriptor, version, manifest,
      fingerprint: sha256(JSON.stringify([descriptor, sha256(metadata[0]), sha256(metadata[1])])),
      async readFiles() {
        try { return verifyUpdateFiles(manifest, await readFiles(manifest)); }
        catch (error) {
          if (['UPDATE_SOURCE_UNAVAILABLE', 'INVALID_UPDATE_SOURCE', 'UPDATE_INTEGRITY_FAILED'].includes(error.code)) throw error;
          throw failure('UPDATE_INTEGRITY_FAILED');
        }
      },
    };
  } catch (error) {
    if (['INVALID_UPDATE_SOURCE', 'UPDATE_SOURCE_UNAVAILABLE', 'INVALID_UPDATE_MANIFEST', 'UPDATE_INTEGRITY_FAILED'].includes(error.code)) throw error;
    throw failure('INVALID_UPDATE_SOURCE');
  }
}
