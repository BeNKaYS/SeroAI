import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compareVersions, validateUpdateManifest } from '../src/updates/manifest.mjs';
import { inspectUpdateSource } from '../src/updates/source.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const version = { surum: '0.1.0-dev.10', tarih: '2026-11-08', not: 'Yeni sürüm' };
const versionText = JSON.stringify(version);
const main = 'export const updated = true;';
const files = [
  { path: 'version.json', size: Buffer.byteLength(versionText), sha256: hash(versionText) },
  { path: 'src/cli/main.mjs', size: Buffer.byteLength(main), sha256: hash(main) },
];
const manifest = { schema: 1, application: 'seroai', version: version.surum, files };

test('sürüm karşılaştırması prerelease sayılarını sayısal ele alır', () => {
  assert.equal(compareVersions('0.1.0-dev.10', '0.1.0-dev.2'), 1);
  assert.equal(compareVersions('0.1.0', '0.1.0-dev.10'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('0.1.0-dev.2', '0.1.0-dev.2'), 0);
  assert.throws(() => compareVersions('latest', '0.1.0'), { code: 'INVALID_UPDATE_MANIFEST' });
});

test('manifest açık uygulama dosyalarını ve sürüm dosyasını doğrular', () => {
  assert.deepEqual(validateUpdateManifest(manifest, Buffer.from(versionText)), manifest);
});

for (const path of ['../outside.mjs', '/absolute.mjs', 'src/../secret.mjs', 'src\\evil.mjs', '.env', 'opencode.json', '.git/config', 'profiles/user.json', 'data.sqlite', 'src/.secret.mjs']) {
  test(`korunan/güvensiz güncelleme yolu reddedilir: ${path}`, () => {
    const bad = structuredClone(manifest);
    bad.files.push({ path, size: 1, sha256: hash('x') });
    assert.throws(() => validateUpdateManifest(bad, Buffer.from(versionText)), { code: 'INVALID_UPDATE_MANIFEST' });
  });
}

test('eksik imza dosyası, çakışan yol ve yanlış sürüm hash’i reddedilir', () => {
  for (const change of [
    m => m.files.pop(), m => m.files.push(m.files[0]),
    m => { m.files[0].sha256 = hash('wrong'); }, m => { m.application = 'other'; },
  ]) {
    const bad = structuredClone(manifest);
    change(bad);
    assert.throws(() => validateUpdateManifest(bad, Buffer.from(versionText)), { code: 'INVALID_UPDATE_MANIFEST' });
  }
});

test('yerel kontrol payload okumaz; sonradan değişen payload doğrulanmaz', async t => {
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-update-source-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(join(directory, 'src/cli'), { recursive: true });
  await fs.writeFile(join(directory, 'version.json'), versionText);
  await fs.writeFile(join(directory, 'update-manifest.json'), JSON.stringify(manifest));
  const source = await inspectUpdateSource({ kind: 'local', directory });
  assert.equal(source.version.surum, version.surum);
  // main henüz yokken metadata kontrolü çalışır; içerik ancak readFiles ile alınır.
  await fs.writeFile(join(directory, 'src/cli/main.mjs'), main);
  assert.equal((await source.readFiles()).get('src/cli/main.mjs').toString(), main);
  await fs.writeFile(join(directory, 'src/cli/main.mjs'), 'Tamper');
  await assert.rejects(source.readFiles(), { code: 'UPDATE_INTEGRITY_FAILED' });
});

test('GitHub dalı commit’e sabitlenir ve yalnızca metadata önceden alınır', async () => {
  const sha = 'a'.repeat(40);
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/commits/')) return new Response(JSON.stringify({ sha }));
    if (url.endsWith('/version.json')) return new Response(versionText);
    if (url.endsWith('/update-manifest.json')) return new Response(JSON.stringify(manifest));
    if (url.endsWith('/src/cli/main.mjs')) return new Response(main);
    return new Response('', { status: 404 });
  };
  const source = await inspectUpdateSource({ kind: 'github', repository: 'example/seroai', ref: 'main' }, { fetchImpl });
  assert.equal(source.descriptor.commit, sha);
  assert.ok(!calls.some(url => url.endsWith('/src/cli/main.mjs')));
  assert.ok(calls.some(url => url.includes(`/${sha}/version.json`)));
  await source.readFiles();
  assert.ok(calls.some(url => url.includes(`/${sha}/src/cli/main.mjs`)));
});

test('GitHub release JSON paketi ancak payload aşamasında alınır', async () => {
  const prefix = 'https://github.com/example/seroai/releases/download/v0.1.0/';
  const calls = [];
  const bundle = { schema: 1, files: [{ path: 'version.json', data: Buffer.from(versionText).toString('base64') }, { path: 'src/cli/main.mjs', data: Buffer.from(main).toString('base64') }] };
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/releases/latest')) return new Response(JSON.stringify({ id: 1, tag_name: 'v0.1.0', assets: ['version.json', 'update-manifest.json', 'seroai-update.json'].map(name => ({ name, browser_download_url: prefix + name })) }));
    if (url.endsWith('/version.json')) return new Response(versionText);
    if (url.endsWith('/update-manifest.json')) return new Response(JSON.stringify(manifest));
    if (url.endsWith('/seroai-update.json')) return new Response(JSON.stringify(bundle));
    return new Response('', { status: 404 });
  };
  const source = await inspectUpdateSource({ kind: 'github', repository: 'example/seroai' }, { fetchImpl });
  assert.equal(source.descriptor.mode, 'release');
  assert.ok(!calls.some(url => url.endsWith('/seroai-update.json')));
  assert.equal((await source.readFiles()).size, 2);
});

test('HTTP kaynak, güvensiz yönlendirme ve 404 kontrollü hata verir', async () => {
  await assert.rejects(inspectUpdateSource({ kind: 'github', repository: 'http://github.com/example/seroai' }), { code: 'INVALID_UPDATE_SOURCE' });
  await assert.rejects(inspectUpdateSource({ kind: 'github', repository: 'example/seroai' }, { fetchImpl: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }) }), { code: 'INVALID_UPDATE_SOURCE' });
  await assert.rejects(inspectUpdateSource({ kind: 'github', repository: 'example/seroai' }, { fetchImpl: async () => new Response('', { status: 404 }) }), { code: 'UPDATE_SOURCE_UNAVAILABLE' });
});
