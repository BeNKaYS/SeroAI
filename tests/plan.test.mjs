import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, symlink, readlink, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/core/catalog.mjs';
import { createPlan } from '../src/core/plan.mjs';

const catalog = await loadCatalog(fileURLToPath(new URL('../', import.meta.url)));
const selection = { packageIds: ['superpowers'], clientIds: ['opencode'] };

test('önizleme belirlenimcidir, girdiyi değiştirmez ve uygulama yapmaz', () => {
  const before = structuredClone(catalog);
  const options = structuredClone(selection);
  const plan = createPlan(catalog, options);
  assert.equal(plan.mode, 'preview');
  assert.equal(plan.changesApplied, false);
  assert.deepEqual(plan.items, [{ packageId: 'superpowers', clientId: 'opencode', status: 'review-required' }]);
  assert.ok(plan.warnings.some(w => /MCP.*hooks/.test(w)));
  assert.deepEqual(createPlan(catalog, options), plan);
  assert.deepEqual(catalog, before);
  assert.deepEqual(options, selection);
});

test('yinelenen seçimler ilk sırayı koruyarak tekilleştirilir', () => {
  const plan = createPlan(catalog, {
    packageIds: ['impeccable', 'superpowers', 'impeccable'],
    clientIds: ['claude-desktop', 'claude-code', 'claude-code'],
  });
  assert.deepEqual(plan.items.map(i => [i.packageId, i.clientId]), [
    ['impeccable', 'claude-desktop'], ['impeccable', 'claude-code'],
    ['superpowers', 'claude-desktop'], ['superpowers', 'claude-code'],
  ]);
  assert.ok(plan.items.every(i => i.status === 'review-required'));
});

for (const [name, options, code] of [
  ['bilinmeyen paket', { ...selection, packageIds: ['unknown'] }, 'UNKNOWN_PACKAGE'],
  ['bilinmeyen uygulama', { ...selection, clientIds: ['unknown'] }, 'UNKNOWN_CLIENT'],
  ['boş uygulama', { ...selection, clientIds: [] }, 'INVALID_SELECTION'],
  ['boş paket', { ...selection, packageIds: [] }, 'INVALID_SELECTION'],
  ['dizi olmayan seçim', { ...selection, packageIds: 'superpowers' }, 'INVALID_SELECTION'],
  ['boş kimlik', { ...selection, clientIds: [''] }, 'INVALID_SELECTION'],
  ['eksik seçenekler', undefined, 'INVALID_SELECTION'],
  ['null seçenekler', null, 'INVALID_SELECTION'],
]) {
  test(`plan reddeder: ${name}`, () => assert.throws(() => createPlan(catalog, options), { code }));
}

test('planlayıcı izole HOME içindeki dosya ve sembolik bağlantıyı değiştirmez', async t => {
  const home = await mkdtemp(join(tmpdir(), 'seroai-plan-'));
  const previous = process.env.HOME;
  t.after(async () => {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  await writeFile(join(home, 'sentinel'), 'private sentinel');
  await symlink('sentinel', join(home, 'linked'));
  process.env.HOME = home;
  const before = await readdir(home);
  createPlan(catalog, selection);
  assert.deepEqual(await readdir(home), before);
  assert.equal(await readFile(join(home, 'sentinel'), 'utf8'), 'private sentinel');
  assert.equal(await readlink(join(home, 'linked')), 'sentinel');
});
