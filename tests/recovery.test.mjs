import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createManagedWorkspace } from '../src/core/workspace.mjs';
import { prepareRecovery, recoverWorkspace } from '../src/core/recovery.mjs';

const workspaceURL = new URL('../src/core/workspace.mjs', import.meta.url).href;
const consent = plan => ({ approvedPlanId: plan.id });

async function parentDirectory(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-recovery-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  return parent;
}

async function interrupted(t, point = 'second-file') {
  const parent = await parentDirectory(t);
  const program = `
    import fs from 'node:fs/promises';
    import { writeSync, existsSync } from 'node:fs';
    import { basename, join } from 'node:path';
    const { createManagedWorkspace } = await import(${JSON.stringify(workspaceURL)});
    const workspace = await createManagedWorkspace(${JSON.stringify(parent)}, { approved: true });
    const point = ${JSON.stringify(point)};
    const initial = [{ path: 'one.md', content: 'Eski bir' }, { path: 'two.md', content: 'Eski iki' }];
    if (point === 'update' || point === 'rollback') {
      const first = await workspace.prepare(initial);
      var receipt = await workspace.apply(first, { approvedPlanId: first.id });
    }
    writeSync(1, workspace.root + '\\n');
    const rename = fs.rename.bind(fs);
    const unlink = fs.unlink.bind(fs);
    fs.rename = async (source, destination) => {
      if (((point === 'second-file' || point === 'update') && basename(destination) === 'two.md')
        || (point === 'metadata-before' && basename(destination) === 'ownership.json')) {
        if (!existsSync(join(workspace.root, '.seroai/pending.json'))) process.exit(98);
        process.exit(23);
      }
      return rename(source, destination);
    };
    fs.unlink = async path => {
      if ((point === 'metadata-after' && basename(path) === 'pending.json')
        || (point === 'rollback' && basename(path) === 'one.md')) process.exit(23);
      return unlink(path);
    };
    if (point === 'rollback') await workspace.rollback(receipt, { approvedPlanId: receipt.id });
    else {
      const plan = await workspace.prepare([{ path: 'one.md', content: 'Yeni bir' }, { path: 'two.md', content: 'Yeni iki' }]);
      await workspace.apply(plan, { approvedPlanId: plan.id });
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: parent, env: { HOME: parent, USERPROFILE: parent }, encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 23, result.stderr);
  const root = result.stdout.trim();
  assert.ok(root.startsWith(parent));
  return { parent, root, pending: join(root, '.seroai/pending.json') };
}

test('normal işlem pending kaydını kaldırır; kurtarma gerekmez', async t => {
  const workspace = await createManagedWorkspace(await parentDirectory(t), { approved: true });
  assert.equal(await prepareRecovery(workspace.root), null);
  const plan = await workspace.prepare([{ path: 'one.md', content: 'Bir' }]);
  const receipt = await workspace.apply(plan, consent(plan));
  assert.equal(await prepareRecovery(workspace.root), null);
  await workspace.rollback(receipt, consent(receipt));
  assert.equal(await prepareRecovery(workspace.root), null);
});

test('ilk hedef yazılmadan önce yedek ve pending günlüğü hazırdır', async t => {
  const workspace = await createManagedWorkspace(await parentDirectory(t), { approved: true });
  const plan = await workspace.prepare([{ path: 'one.md', content: 'Bir' }]);
  const rename = fs.rename.bind(fs);
  let checked = false;
  t.mock.method(fs, 'rename', async (source, destination) => {
    if (destination === join(workspace.root, 'one.md')) {
      const pending = JSON.parse(await fs.readFile(join(workspace.root, '.seroai/pending.json'), 'utf8'));
      const snapshot = await fs.readFile(join(workspace.root, '.seroai/backups', `${plan.id}.json`));
      assert.equal(pending.id, plan.id);
      assert.equal(pending.snapshotHash, createHash('sha256').update(snapshot).digest('hex'));
      checked = true;
    }
    return rename(source, destination);
  });
  await workspace.apply(plan, consent(plan));
  assert.equal(checked, true);
});

for (const point of ['second-file', 'metadata-before', 'metadata-after', 'update', 'rollback']) {
  test(`yeni süreç yarım işlemi onayla geri alır: ${point}`, async t => {
    const { root, pending } = await interrupted(t, point);
    const before = await fs.readFile(pending, 'utf8');
    const plan = await prepareRecovery(root);
    assert.equal(plan.mode, 'recovery-preview');
    assert.equal(plan.changesApplied, false);
    assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.items));
    assert.ok(!JSON.stringify(plan).includes('Eski bir'));
    assert.equal(await fs.readFile(pending, 'utf8'), before);
    await assert.rejects(recoverWorkspace(plan), { code: 'APPROVAL_REQUIRED' });
    const result = await recoverWorkspace(plan, consent(plan));
    assert.equal(result.recovered, true);
    if (point === 'update') {
      assert.equal(await fs.readFile(join(root, 'one.md'), 'utf8'), 'Eski bir');
      assert.equal(await fs.readFile(join(root, 'two.md'), 'utf8'), 'Eski iki');
    } else {
      await assert.rejects(fs.stat(join(root, 'one.md')), { code: 'ENOENT' });
      await assert.rejects(fs.stat(join(root, 'two.md')), { code: 'ENOENT' });
    }
    assert.equal(await prepareRecovery(root), null);
    await assert.rejects(fs.stat(pending), { code: 'ENOENT' });
    assert.ok((await fs.readdir(join(root, '.seroai/backups'))).length > 0);
    await assert.rejects(recoverWorkspace(plan, consent(plan)), { code: 'INVALID_PLAN' });
  });
}

test('kullanıcı düzenlemesi bütün kurtarmayı başlamadan engeller', async t => {
  const { root, pending } = await interrupted(t, 'metadata-before');
  await fs.writeFile(join(root, 'two.md'), 'Kullanıcının düzenlemesi');
  await assert.rejects(prepareRecovery(root), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'one.md'), 'utf8'), 'Yeni bir');
  assert.equal(await fs.readFile(join(root, 'two.md'), 'utf8'), 'Kullanıcının düzenlemesi');
  assert.ok(await fs.stat(pending));
});

test('taklit veya eski kurtarma planı hiçbir hedefi değiştirmez', async t => {
  const { root } = await interrupted(t);
  const plan = await prepareRecovery(root);
  await assert.rejects(recoverWorkspace({ ...plan }, consent(plan)), { code: 'INVALID_PLAN' });
  await fs.writeFile(join(root, 'one.md'), 'Elle değişti');
  await assert.rejects(recoverWorkspace(plan, consent(plan)), { code: 'STALE_PLAN' });
  assert.equal(await fs.readFile(join(root, 'one.md'), 'utf8'), 'Elle değişti');
});

test('canlı yazıcı PID kurtarmayı engeller', async t => {
  const { root, pending } = await interrupted(t);
  const journal = JSON.parse(await fs.readFile(pending, 'utf8'));
  journal.writerPid = process.pid;
  await fs.writeFile(pending, JSON.stringify(journal));
  await assert.rejects(prepareRecovery(root), { code: 'WORKSPACE_BUSY' });
});

test('başka kurtarma kilidi otomatik kırılmaz', async t => {
  const { root } = await interrupted(t);
  const plan = await prepareRecovery(root);
  const lock = join(root, '.seroai/recovery.lock');
  await fs.writeFile(lock, 'Başka işlem', { mode: 0o600 });
  await assert.rejects(recoverWorkspace(plan, consent(plan)), { code: 'WORKSPACE_BUSY' });
  assert.equal(await fs.readFile(lock, 'utf8'), 'Başka işlem');
});

test('kurtarma yazma hatasında günlük korunur ve yeni önizlemeyle devam edilir', async t => {
  const { root, pending } = await interrupted(t, 'metadata-before');
  const plan = await prepareRecovery(root);
  const unlink = fs.unlink.bind(fs);
  t.mock.method(fs, 'unlink', async path => {
    if (path === join(root, 'two.md')) throw new Error('Kontrollü kurtarma hatası');
    return unlink(path);
  });
  await assert.rejects(recoverWorkspace(plan, consent(plan)), { code: 'RECOVERY_REQUIRED' });
  assert.ok(await fs.stat(pending));
  t.mock.restoreAll();
  const next = await prepareRecovery(root);
  assert.ok(next.items.some(item => item.action === 'leave'));
  await recoverWorkspace(next, consent(next));
  assert.equal(await prepareRecovery(root), null);
});

test('kurtarma ilgisiz kullanıcı dosyasını korur', async t => {
  const { root } = await interrupted(t);
  await fs.writeFile(join(root, 'user.txt'), 'Bağımsız kullanıcı verisi');
  const plan = await prepareRecovery(root);
  await recoverWorkspace(plan, consent(plan));
  assert.equal(await fs.readFile(join(root, 'user.txt'), 'utf8'), 'Bağımsız kullanıcı verisi');
});

test('çok büyük toplam içerik ve aşırı dosya sayısı önizlemede reddedilir', async t => {
  const workspace = await createManagedWorkspace(await parentDirectory(t), { approved: true });
  await assert.rejects(workspace.prepare(Array.from({ length: 101 }, (_, i) => ({ path: `file${i}.txt`, content: '' }))), { code: 'INVALID_CHANGE' });
  await assert.rejects(workspace.prepare(Array.from({ length: 9 }, (_, i) => ({ path: `file${i}.txt`, content: 'x'.repeat(1024 * 1024) }))), { code: 'INVALID_CHANGE' });
  assert.equal(await prepareRecovery(workspace.root), null);
});

test('sembolik hedef ve eksik yönetilen güncelleme reddedilir', async t => {
  const first = await interrupted(t);
  await fs.unlink(join(first.root, 'one.md'));
  const outside = join(first.parent, 'outside.txt');
  await fs.writeFile(outside, 'Dış veri');
  await fs.symlink(outside, join(first.root, 'one.md'));
  await assert.rejects(prepareRecovery(first.root), { code: 'UNSAFE_FILE' });
  assert.equal(await fs.readFile(outside, 'utf8'), 'Dış veri');
  const second = await interrupted(t, 'update');
  await fs.unlink(join(second.root, 'one.md'));
  await assert.rejects(prepareRecovery(second.root), { code: 'CONFLICT' });
});

test('beklenmeyen sahiplik sürümü reddedilir', async t => {
  const { root } = await interrupted(t, 'metadata-after');
  await fs.writeFile(join(root, '.seroai/ownership.json'), JSON.stringify({ revision: 99, files: {} }));
  await assert.rejects(prepareRecovery(root), { code: 'INVALID_JOURNAL' });
});

for (const change of ['bad-json', 'snapshot-hash', 'path-escape', 'invalid-base64', 'before-hash', 'foreign-root']) {
  test(`bozuk günlük/yedek reddedilir: ${change}`, async t => {
    const { root, pending } = await interrupted(t, 'update');
    const journal = JSON.parse(await fs.readFile(pending, 'utf8'));
    const backup = join(root, '.seroai/backups', `${journal.id}.json`);
    if (change === 'bad-json') {
      await fs.writeFile(pending, '{"secret":"PRIVATE_RECOVERY_TEST"');
    } else if (change === 'snapshot-hash') {
      await fs.appendFile(backup, ' ');
    } else if (change === 'foreign-root') {
      journal.root = '/another-workspace';
      await fs.writeFile(pending, JSON.stringify(journal));
    } else {
      const snapshot = JSON.parse(await fs.readFile(backup, 'utf8'));
      if (change === 'path-escape') snapshot.files[0].path = '../outside.md';
      if (change === 'invalid-base64') snapshot.files[0].before = '!!!!';
      if (change === 'before-hash') snapshot.files[0].before = Buffer.from('Sahte yedek').toString('base64');
      const data = JSON.stringify(snapshot);
      await fs.writeFile(backup, data);
      journal.snapshotHash = createHash('sha256').update(data).digest('hex');
      await fs.writeFile(pending, JSON.stringify(journal));
    }
    await assert.rejects(prepareRecovery(root), error => {
      assert.equal(error.code, 'INVALID_JOURNAL');
      assert.ok(!error.message.includes('PRIVATE_RECOVERY_TEST'));
      return true;
    });
    assert.equal(await fs.readFile(join(root, 'one.md'), 'utf8'), 'Yeni bir');
  });
}
