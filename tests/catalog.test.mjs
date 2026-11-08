import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/core/catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = ['superpowers', 'graphify', 'caveman', 'ponytail', 'karpathy-skills', 'impeccable', 'github-mcp'];

async function fixture(t, change) {
  const catalog = structuredClone(await loadCatalog(root));
  change(catalog);
  const directory = await mkdtemp(join(tmpdir(), 'seroai-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'catalog'));
  await Promise.all([
    writeFile(join(directory, 'catalog/packages.json'), JSON.stringify(catalog.packages)),
    writeFile(join(directory, 'catalog/clients.json'), JSON.stringify(catalog.clients)),
    writeFile(join(directory, 'version.json'), JSON.stringify(catalog.version)),
  ]);
  return directory;
}

test('katalog yedi temel kaynağı ve doğrulanmamış uygulamaları içerir', async () => {
  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.packages.map(item => item.id), baseline);
  for (const item of catalog.packages) {
    assert.match(item.repository, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    assert.equal(item.reviewedRef, null);
    assert.equal(item.status, 'unreviewed');
    assert.equal(item.license, null);
  }
  const ids = catalog.clients.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['claude-code', 'claude-desktop', 'codex-cli', 'codex-desktop', 'gemini-cli', 'gemini-desktop']) {
    assert.ok(ids.includes(id));
  }
  for (const client of catalog.clients) {
    assert.equal(client.capabilityStatus, 'unverified');
    assert.deepEqual(Object.values(client.capabilities), Array(4).fill('unverified'));
  }
  assert.equal(catalog.version.surum, '0.1.0-dev.1');
});

const invalidCases = [
  ['yinelenen paket', c => c.packages.push(c.packages[0])],
  ['yinelenen uygulama', c => c.clients.push(c.clients[0])],
  ['HTTP kaynak', c => { c.packages[0].repository = 'http://github.com/obra/superpowers'; }],
  ['kimlik bilgili kaynak', c => { c.packages[0].repository = 'https://secret@github.com/obra/superpowers'; }],
  ['sorgulu kaynak', c => { c.packages[0].repository += '?token=secret'; }],
  ['sahte alan adı', c => { c.packages[0].repository = 'https://github.com.example/obra/superpowers'; }],
  ['üst dizin kaynak yolu', c => { c.packages[0].repository = 'https://github.com/obra/..'; }],
  ['nokta kaynak yolu', c => { c.packages[0].repository = 'https://github.com/obra/.'; }],
  ['eksik sürüm alanı', c => { delete c.version.not; }],
  ['geçersiz sürüm', c => { c.version.surum = 'latest'; }],
  ['geçersiz tarih', c => { c.version.tarih = '2026-02-30'; }],
  ['uydurma sabitleme', c => { c.packages[0].reviewedRef = 'main'; }],
  ['uydurma inceleme durumu', c => { c.packages[0].status = 'reviewed'; }],
  ['uydurma destek', c => { c.clients[0].capabilities.hooks = 'supported'; }],
  ['eksik temel kaynak', c => { c.packages.pop(); }],
  ['geçersiz katalog türü', c => { c.packages = {}; }],
];

for (const [name, change] of invalidCases) {
  test(`katalog reddeder: ${name}`, async t => {
    await assert.rejects(loadCatalog(await fixture(t, change)), { code: 'INVALID_CATALOG' });
  });
}

test('bozuk JSON içeriği hata mesajına sızmaz', async t => {
  const directory = await fixture(t, () => {});
  await writeFile(join(directory, 'catalog/packages.json'), '{"secret":"PRIVATE_VALUE"');
  await assert.rejects(loadCatalog(directory), error => {
    assert.equal(error.code, 'INVALID_CATALOG');
    assert.ok(!error.message.includes('PRIVATE_VALUE'));
    return true;
  });
});

test('eksik katalog dosyası kontrollü hata verir', async t => {
  const directory = await fixture(t, () => {});
  await rm(join(directory, 'catalog/clients.json'));
  await assert.rejects(loadCatalog(directory), { code: 'INVALID_CATALOG' });
});
