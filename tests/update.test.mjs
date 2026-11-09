import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { planUpdate, applyUpdate, planUpdateRollback, rollbackUpdate } from '../src/updates/update.mjs';
import { updateFixture } from './helpers/update-fixture.mjs';

const consent = plan => ({ approvedPlanId: plan.id });

test('güncelleme önizlemesi salt okunur; onaysız yazma ve yedek yok', async t => {
  const { root, options } = await updateFixture(t);
  const plan = await planUpdate(options);
  assert.equal(plan.available, true);
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.current.surum, '0.1.0-dev.2');
  assert.equal(plan.candidate.surum, '0.1.0-dev.3');
  assert.ok(!JSON.stringify(plan).includes('PRIVATE_UPDATE_SENTINEL'));
  await assert.rejects(applyUpdate(plan), { code: 'APPROVAL_REQUIRED' });
  await assert.rejects(fs.stat(join(root, '.git/seroai/updates')), { code: 'ENOENT' });
});

test('yerel artan sürüm yedekle uygulanır ve ayrı geri alma eski sürümü getirir', async t => {
  const { root, options, oldVersion } = await updateFixture(t);
  const plan = await planUpdate(options);
  const result = await applyUpdate(plan, consent(plan));
  assert.equal(result.updated, true);
  assert.equal(JSON.parse(await fs.readFile(join(root, 'version.json'), 'utf8')).surum, '0.1.0-dev.3');
  assert.equal(await fs.readFile(join(root, 'src/core/new-module.mjs'), 'utf8'), 'export const added = true;');
  assert.equal(await fs.readFile(join(root, '.env'), 'utf8'), 'PRIVATE_UPDATE_SENTINEL');
  const backup = join(root, '.git/seroai/updates/backups', `${result.transactionId}.json`);
  assert.equal((await fs.stat(backup)).mode & 0o777, 0o600);
  await assert.rejects(fs.stat(join(root, '.git/seroai/updates/staging', result.transactionId)), { code: 'ENOENT' });
  const rollback = await planUpdateRollback(root);
  await assert.rejects(rollbackUpdate(rollback), { code: 'APPROVAL_REQUIRED' });
  await rollbackUpdate(rollback, consent(rollback));
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
  assert.equal(await fs.readFile(join(root, 'src/cli/main.mjs'), 'utf8'), 'export const old = true;');
  await assert.rejects(fs.stat(join(root, 'src/core/new-module.mjs')), { code: 'ENOENT' });
  assert.equal(await planUpdateRollback(root), null);
});

for (const version of ['0.1.0-dev.2', '0.1.0-dev.1']) {
  test(`aynı/eski sürüm yazılmaz: ${version}`, async t => {
    const { root, options } = await updateFixture(t, version);
    const plan = await planUpdate(options);
    assert.equal(plan.available, false);
    assert.equal((await applyUpdate(plan, consent(plan))).updated, false);
    await assert.rejects(fs.stat(join(root, '.git/seroai/updates')), { code: 'ENOENT' });
  });
}

test('onaydan sonra bozulmuş kaynak mevcut sürümü değiştirmez', async t => {
  const { root, source, options, oldVersion } = await updateFixture(t);
  const plan = await planUpdate(options);
  await fs.writeFile(join(source, 'src/cli/main.mjs'), 'Bozuk payload');
  await assert.rejects(applyUpdate(plan, consent(plan)), { code: 'UPDATE_APPLY_FAILED' });
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
  assert.equal(await fs.readFile(join(root, 'src/cli/main.mjs'), 'utf8'), 'export const old = true;');
  assert.equal((await fs.readdir(join(root, '.git/seroai/updates/backups'))).length, 1);
});

test('kısmi hedef yazım hatasında eski dosyalar geri alınır', async t => {
  const { root, options, oldVersion } = await updateFixture(t);
  const plan = await planUpdate(options);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (source, destination) => {
    if (destination === join(root, 'src/core/new-module.mjs')) throw new Error('Kontrollü yazma hatası');
    return rename(source, destination);
  });
  await assert.rejects(applyUpdate(plan, consent(plan)), { code: 'UPDATE_APPLY_FAILED' });
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
  assert.equal(await fs.readFile(join(root, 'src/cli/main.mjs'), 'utf8'), 'export const old = true;');
});

test('güncelleme sonrası kullanıcı düzenlemesi rollback ile ezilmez', async t => {
  const { root, options } = await updateFixture(t);
  const plan = await planUpdate(options);
  await applyUpdate(plan, consent(plan));
  await fs.writeFile(join(root, 'src/cli/main.mjs'), 'Kullanıcının düzeltmesi');
  await assert.rejects(planUpdateRollback(root), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'src/cli/main.mjs'), 'utf8'), 'Kullanıcının düzeltmesi');
});

test('önizlemeden sonra config veya manifest değişirse onay eskir', async t => {
  const { root, options } = await updateFixture(t);
  const plan = await planUpdate(options);
  await fs.appendFile(join(root, 'src/cli/main.mjs'), '// Edit');
  await assert.rejects(applyUpdate(plan, consent(plan)), { code: 'STALE_PLAN' });
});

test('sahipsiz kod çakışması ve symlink güncelleme hedefi reddedilir', async t => {
  const first = await updateFixture(t);
  await fs.mkdir(join(first.root, 'src/core'));
  await fs.writeFile(join(first.root, 'src/core/new-module.mjs'), 'Kullanıcı dosyası');
  await assert.rejects(planUpdate(first.options), { code: 'UNOWNED_UPDATE_FILE' });
  const second = await updateFixture(t);
  await fs.unlink(join(second.root, 'src/cli/main.mjs'));
  await fs.symlink(join(second.source, 'src/cli/main.mjs'), join(second.root, 'src/cli/main.mjs'));
  await assert.rejects(planUpdate(second.options), { code: 'UNSAFE_FILE' });
});

test('taklit plan veya yanlış onay hiçbir dosyaya yazmaz', async t => {
  const { root, options } = await updateFixture(t);
  const plan = await planUpdate(options);
  await assert.rejects(applyUpdate({ ...plan }, consent(plan)), { code: 'INVALID_PLAN' });
  await assert.rejects(applyUpdate(plan, { approvedPlanId: 'wrong' }), { code: 'APPROVAL_REQUIRED' });
  await assert.rejects(fs.stat(join(root, '.git/seroai/updates')), { code: 'ENOENT' });
});

test('yarım kalmış (pending) güncelleme normal akışı kilitler, ayrı geri alma tamamlar', async t => {
  const { root, options, oldVersion } = await updateFixture(t);
  const plan = await planUpdate(options);
  const result = await applyUpdate(plan, consent(plan));
  const { saveUpdatePointer } = await import('../src/updates/state.mjs');
  const { sha256 } = await import('../src/core/workspace-state.mjs');
  const backupPath = join(root, '.git/seroai/updates/backups', `${result.transactionId}.json`);
  const raw = await fs.readFile(backupPath);
  const snapshot = JSON.parse(raw.toString());
  await saveUpdatePointer(root, snapshot, sha256(raw), 'pending');
  await assert.rejects(planUpdate(options), { code: 'RECOVERY_REQUIRED' });
  const rollback = await planUpdateRollback(root);
  assert.equal(rollback.interrupted, true);
  await rollbackUpdate(rollback, consent(rollback));
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
  assert.equal(await fs.readFile(join(root, 'src/cli/main.mjs'), 'utf8'), 'export const old = true;');
  assert.equal(await planUpdateRollback(root), null);
});

test('canlı yazıcı kilidi geri almayı engeller; durmuş yazıcının kilidi onayla kaldırılır', async t => {
  const { root, options, oldVersion } = await updateFixture(t);
  const plan = await planUpdate(options);
  await applyUpdate(plan, consent(plan));
  const lock = join(root, '.git/seroai/updates/write.lock');
  await fs.writeFile(lock, JSON.stringify({ pid: process.pid, nonce: '11111111-1111-1111-1111-111111111111' }), { mode: 0o600 });
  await assert.rejects(planUpdateRollback(root), { code: 'WORKSPACE_BUSY' });
  await fs.writeFile(lock, JSON.stringify({ pid: 999999, nonce: '22222222-2222-2222-2222-222222222222' }), { mode: 0o600 });
  const rollback = await planUpdateRollback(root);
  await rollbackUpdate(rollback, consent(rollback));
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
  await assert.rejects(fs.stat(lock), { code: 'ENOENT' });
});
