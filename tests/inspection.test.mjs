import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManagedWorkspace } from '../src/core/workspace.mjs';
import { inspectManagedWorkspace } from '../src/core/inspection.mjs';

async function fixture(t, populated = true) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-inspection-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const workspace = await createManagedWorkspace(parent, { approved: true });
  if (populated) {
    const plan = await workspace.prepare([{ path: 'rules.md', content: 'Kayıtlı kurallar' }]);
    await workspace.apply(plan, { approvedPlanId: plan.id });
  }
  return { parent, root: workspace.root, record: join(workspace.root, '.seroai/ownership.json') };
}

test('diskteki sahiplik kaydı nesneye ihtiyaç olmadan okunur ve yazma yapılmaz', async t => {
  const { root, record } = await fixture(t);
  const beforeRecord = await fs.readFile(record, 'utf8');
  const beforeFiles = await fs.readdir(root, { recursive: true });
  const result = await inspectManagedWorkspace(root);
  assert.equal(result.mode, 'inspection');
  assert.equal(result.changesApplied, false);
  assert.equal(result.revision, 1);
  assert.equal(result.recordStatus, 'present');
  assert.deepEqual(result.files, [{ path: 'rules.md', status: 'unchanged' }]);
  assert.ok(!JSON.stringify(result).includes('Kayıtlı kurallar'));
  assert.ok(result.warnings.length > 0);
  assert.equal(await fs.readFile(record, 'utf8'), beforeRecord);
  assert.deepEqual(await fs.readdir(root, { recursive: true }), beforeFiles);
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Kayıtlı kurallar');
});

test('değişmiş ve silinmiş dosyalar ayrı raporlanır', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(join(root, 'rules.md'), 'Elle düzenleme');
  assert.equal((await inspectManagedWorkspace(root)).files[0].status, 'modified');
  await fs.unlink(join(root, 'rules.md'));
  assert.equal((await inspectManagedWorkspace(root)).files[0].status, 'missing');
});

test('sahipsiz dosya ve sembolik bağlantılar taranmaz', async t => {
  const { root, parent } = await fixture(t);
  await fs.symlink(join(parent, 'does-not-exist'), join(root, 'user.txt'));
  const result = await inspectManagedWorkspace(root);
  assert.deepEqual(result.files, [{ path: 'rules.md', status: 'unchanged' }]);
});

for (const kind of ['symlink', 'hardlink', 'directory', 'oversized']) {
  test(`güvensiz yönetilen hedef takip edilmez: ${kind}`, async t => {
    const { root, parent } = await fixture(t);
    const target = join(root, 'rules.md');
    await fs.unlink(target);
    const outside = join(parent, 'outside.txt');
    await fs.writeFile(outside, 'Dış içerik');
    if (kind === 'symlink') await fs.symlink(outside, target);
    if (kind === 'hardlink') await fs.link(outside, target);
    if (kind === 'directory') await fs.mkdir(target);
    if (kind === 'oversized') await fs.writeFile(target, 'x'.repeat(1024 * 1024 + 1));
    const result = await inspectManagedWorkspace(root);
    assert.equal(result.files[0].status, 'unsafe');
    assert.equal(await fs.readFile(outside, 'utf8'), 'Dış içerik');
  });
}

test('eksik sahiplik kaydı temiz kurulum olarak sunulmaz', async t => {
  const { root } = await fixture(t, false);
  const result = await inspectManagedWorkspace(root);
  assert.equal(result.recordStatus, 'missing');
  assert.equal(result.revision, null);
  assert.deepEqual(result.files, []);
  assert.ok(result.warnings.length >= 2);
});

for (const [name, record] of [
  ['yol kaçışı', { revision: 1, files: { '../outside.md': 'a'.repeat(64) } }],
  ['geçersiz hash', { revision: 1, files: { 'rules.md': 'bad' } }],
  ['negatif revizyon', { revision: -1, files: {} }],
  ['kesirli revizyon', { revision: 0.5, files: {} }],
  ['eksik alan', { revision: 1 }],
  ['dizi kaydı', []],
  ['null kayıt', null],
]) {
  test(`bozuk sahiplik kaydı reddedilir: ${name}`, async t => {
    const { root, record: path } = await fixture(t);
    await fs.writeFile(path, JSON.stringify(record));
    await assert.rejects(inspectManagedWorkspace(root), { code: 'INVALID_WORKSPACE_RECORD' });
  });
}

test('JSON ayrıştırma hatası içerik sızdırmaz', async t => {
  const { root, record } = await fixture(t);
  await fs.writeFile(record, '{"secret":"PRIVATE_TEST_VALUE"');
  await assert.rejects(inspectManagedWorkspace(root), error => {
    assert.equal(error.code, 'INVALID_WORKSPACE_RECORD');
    assert.ok(!error.message.includes('PRIVATE_TEST_VALUE'));
    return true;
  });
});

test('kayıt dosyası sembolik bağlantıysa okunmaz', async t => {
  const { root, record, parent } = await fixture(t);
  await fs.unlink(record);
  await fs.symlink(join(parent, 'does-not-exist'), record);
  await assert.rejects(inspectManagedWorkspace(root), { code: 'INVALID_WORKSPACE_RECORD' });
});

test('göreli veya sembolik kök reddedilir', async t => {
  const { root, parent } = await fixture(t);
  await assert.rejects(inspectManagedWorkspace('.'), { code: 'INVALID_WORKSPACE' });
  await fs.symlink(root, join(parent, 'alias'));
  await assert.rejects(inspectManagedWorkspace(join(parent, 'alias')), { code: 'INVALID_WORKSPACE' });
});
