import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createManagedWorkspace } from '../src/core/workspace.mjs';

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-workspace-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const workspace = await createManagedWorkspace(parent, { approved: true });
  return { parent, workspace, root: workspace.root };
}

const changes = [{ path: 'rules.md', content: 'İlk kurallar\n' }];
const consent = plan => ({ approvedPlanId: plan.id });

test('klasör oluşturma onayı yoksa hiçbir şey yazılmaz', async t => {
  const { parent } = await fixture(t);
  const before = await fs.readdir(parent);
  await assert.rejects(createManagedWorkspace(parent), { code: 'APPROVAL_REQUIRED' });
  await assert.rejects(createManagedWorkspace(parent, { approved: 'yes' }), { code: 'APPROVAL_REQUIRED' });
  assert.deepEqual(await fs.readdir(parent), before);
});

test('yeni klasör özeldir, önizleme salt okunur ve değişmezdir', async t => {
  const { workspace, root } = await fixture(t);
  const before = await fs.readdir(root);
  const plan = await workspace.prepare(changes);
  assert.deepEqual(await fs.readdir(root), before);
  assert.deepEqual(await fs.readdir(join(root, '.seroai/backups')), []);
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.items[0].beforeHash, null);
  assert.equal(plan.items[0].bytes, Buffer.byteLength(changes[0].content));
  assert.match(plan.items[0].afterHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(plan).includes(changes[0].content));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.items) && Object.isFrozen(plan.items[0]));
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
});

test('eşleşen dosya yazma onayı olmadan yedek veya hedef oluşturulmaz', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  await assert.rejects(workspace.apply(plan), { code: 'APPROVAL_REQUIRED' });
  await assert.rejects(workspace.apply(plan, { approvedPlanId: 'wrong' }), { code: 'APPROVAL_REQUIRED' });
  assert.deepEqual(await fs.readdir(root), ['.seroai']);
  assert.deepEqual(await fs.readdir(join(root, '.seroai/backups')), []);
});

test('onaylı yeni dosya özel yedek ve sahiplik kaydıyla yazılır', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  const receipt = await workspace.apply(plan, consent(plan));
  assert.equal(receipt.id, plan.id);
  assert.ok(Object.isFrozen(receipt));
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), changes[0].content);
  const backup = JSON.parse(await fs.readFile(join(root, '.seroai/backups', `${plan.id}.json`), 'utf8'));
  assert.equal(backup.files[0].before, null);
  assert.equal(backup.files[0].path, 'rules.md');
  const ownership = JSON.parse(await fs.readFile(join(root, '.seroai/ownership.json'), 'utf8'));
  assert.equal(ownership.files['rules.md'], plan.items[0].afterHash);
  for (const file of ['rules.md', '.seroai/ownership.json', `.seroai/backups/${plan.id}.json`]) {
    assert.equal((await fs.stat(join(root, file))).mode & 0o777, 0o600);
  }
  for (const directory of ['.seroai', '.seroai/backups']) {
    assert.equal((await fs.stat(join(root, directory))).mode & 0o777, 0o700);
  }
});

test('yönetilen dosya güncellenir, geri alma önceki içeriği getirir', async t => {
  const { workspace, root } = await fixture(t);
  const first = await workspace.prepare(changes);
  await workspace.apply(first, consent(first));
  const second = await workspace.prepare([{ path: 'rules.md', content: 'Yeni kurallar' }]);
  const receipt = await workspace.apply(second, consent(second));
  const backup = JSON.parse(await fs.readFile(join(root, '.seroai/backups', `${second.id}.json`), 'utf8'));
  assert.equal(Buffer.from(backup.files[0].before, 'base64').toString('utf8'), changes[0].content);
  await assert.rejects(workspace.rollback(receipt), { code: 'APPROVAL_REQUIRED' });
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Yeni kurallar');
  await workspace.rollback(receipt, consent(receipt));
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), changes[0].content);
});

test('yeni dosyanın geri alınması yalnızca kendi dosyasını kaldırır', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  const receipt = await workspace.apply(plan, consent(plan));
  await fs.writeFile(join(root, 'user.txt'), 'Kullanıcının dosyası');
  await workspace.rollback(receipt, consent(receipt));
  await assert.rejects(fs.stat(join(root, 'rules.md')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(root, 'user.txt'), 'utf8'), 'Kullanıcının dosyası');
  await assert.rejects(workspace.rollback(receipt, consent(receipt)), { code: 'INVALID_PLAN' });
});

test('sahipsiz dosya çakışması korunur', async t => {
  const { workspace, root } = await fixture(t);
  await fs.writeFile(join(root, 'rules.md'), 'Kullanıcı içeriği');
  await assert.rejects(workspace.prepare(changes), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Kullanıcı içeriği');
});

test('önizlemeden sonra eklenen sahipsiz hedef ezilmez', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  await fs.writeFile(join(root, 'rules.md'), 'Sonradan eklendi');
  await assert.rejects(workspace.apply(plan, consent(plan)), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Sonradan eklendi');
});

test('sonradan düzenlenmiş yönetilen dosya güncellenmez veya geri alınmaz', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  const receipt = await workspace.apply(plan, consent(plan));
  await fs.writeFile(join(root, 'rules.md'), 'Elle değiştirildi');
  await assert.rejects(workspace.prepare(changes), { code: 'CONFLICT' });
  await assert.rejects(workspace.rollback(receipt, consent(receipt)), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Elle değiştirildi');
});

test('rollback çakışması bütün dosyalar kontrol edilmeden geri almaya başlamaz', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare([...changes, { path: 'second.md', content: 'İkinci' }]);
  const receipt = await workspace.apply(plan, consent(plan));
  await fs.writeFile(join(root, 'second.md'), 'Kullanıcı değişikliği');
  await assert.rejects(workspace.rollback(receipt, consent(receipt)), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), changes[0].content);
});

test('plan kopyası, yeniden kullanım ve eski revizyon reddedilir', async t => {
  const { workspace } = await fixture(t);
  const plan = await workspace.prepare(changes);
  const old = await workspace.prepare([{ path: 'other.txt', content: 'Diğer' }]);
  await assert.rejects(workspace.apply({ ...plan }, consent(plan)), { code: 'INVALID_PLAN' });
  await workspace.apply(plan, consent(plan));
  await assert.rejects(workspace.apply(plan, consent(plan)), { code: 'INVALID_PLAN' });
  await assert.rejects(workspace.apply(old, consent(old)), { code: 'STALE_PLAN' });
});

for (const path of ['../outside.md', '/outside.md', 'sub/file.md', 'sub\\file.md', '.env', '.seroai', 'a..md', 'db.sqlite', 'script.mjs']) {
  test(`güvensiz veya kapsam dışı yol reddedilir: ${path}`, async t => {
    const { workspace } = await fixture(t);
    await assert.rejects(workspace.prepare([{ path, content: 'x' }]), { code: 'INVALID_CHANGE' });
  });
}

test('boş, yinelenen ve aşırı büyük değişiklikler reddedilir', async t => {
  const { workspace } = await fixture(t);
  for (const invalid of [[], null, [null], [...changes, ...changes], [{ path: 'a.txt', content: 42 }], [{ path: 'a.txt', content: 'x'.repeat(1024 * 1024 + 1) }]]) {
    await assert.rejects(workspace.prepare(invalid), { code: 'INVALID_CHANGE' });
  }
});

test('sembolik bağlantı hedefi takip edilmez', async t => {
  const { workspace, parent, root } = await fixture(t);
  const outside = join(parent, 'outside.txt');
  await fs.writeFile(outside, 'Korunacak');
  const plan = await workspace.prepare(changes);
  await fs.symlink(outside, join(root, 'rules.md'));
  await assert.rejects(workspace.apply(plan, consent(plan)), { code: 'UNSAFE_FILE' });
  assert.equal(await fs.readFile(outside, 'utf8'), 'Korunacak');
});

test('üst dizindeki sembolik bağlantı reddedilir', async t => {
  const { parent } = await fixture(t);
  await fs.symlink(parent, join(parent, 'alias'));
  await assert.rejects(createManagedWorkspace(join(parent, 'alias'), { approved: true }), { code: 'UNSAFE_PATH' });
});

test('hardlink ile değiştirilen yönetilen dosya reddedilir', async t => {
  const { workspace, parent, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  await workspace.apply(plan, consent(plan));
  await fs.link(join(root, 'rules.md'), join(parent, 'hardlink.txt'));
  await assert.rejects(workspace.prepare(changes), { code: 'UNSAFE_FILE' });
});

test('yedek oluşturulamazsa hiçbir hedef yazılmaz', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare(changes);
  await fs.rmdir(join(root, '.seroai/backups'));
  await fs.writeFile(join(root, '.seroai/backups'), 'Engel');
  await assert.rejects(workspace.apply(plan, consent(plan)), { code: 'BACKUP_FAILED' });
  await assert.rejects(fs.stat(join(root, 'rules.md')), { code: 'ENOENT' });
});

test('ikinci dosyanın yazma hatasında ilk dosya geri alınır', async t => {
  const { workspace, root } = await fixture(t);
  const plan = await workspace.prepare([...changes, { path: 'second.md', content: 'İkinci' }]);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (source, destination) => {
    if (basename(destination) === 'second.md') throw new Error('Kontrollü disk hatası');
    return rename(source, destination);
  });
  await assert.rejects(workspace.apply(plan, consent(plan)), { code: 'APPLY_FAILED' });
  await assert.rejects(fs.stat(join(root, 'rules.md')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(join(root, 'second.md')), { code: 'ENOENT' });
  assert.equal((await fs.readdir(join(root, '.seroai/backups'))).length, 1);
  assert.deepEqual((await fs.readdir(root)).filter(name => name.startsWith('.seroai-stage-')), []);
});
