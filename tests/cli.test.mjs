import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'src/cli/main.mjs');
const setup = ['setup', '--client', 'opencode', '--package', 'superpowers'];

async function run(t, args) {
  const directory = await mkdtemp(join(tmpdir(), 'seroai-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, 'home');
  const cwd = join(directory, 'cwd');
  await mkdir(home);
  await mkdir(cwd);
  await writeFile(join(home, 'sentinel'), 'private sentinel');
  await symlink('sentinel', join(home, 'linked'));
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share') },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  return { ...result, home, cwd };
}

test('varsayılan yardım Türkçedir ve sınırları açıklar', async t => {
  const result = await run(t, []);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /salt okunur/i);
  assert.match(result.stdout, /önizleme/i);
  assert.equal(result.stderr, '');
});

test('İngilizce yardım seçilebilir', async t => {
  const result = await run(t, ['help', '--lang', 'en']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /read-only/);
  assert.match(result.stdout, /preview/);
});

test('sürüm yalnızca version.json ile eşleşir', async t => {
  const version = JSON.parse(await readFile(join(root, 'version.json'), 'utf8'));
  const result = await run(t, ['version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), version.surum);
});

test('katalog JSON çıktısı yedi kaynak ve doğrulanmamış uygulamaları gösterir', async t => {
  const result = await run(t, ['catalog', '--json']);
  assert.equal(result.status, 0);
  const catalog = JSON.parse(result.stdout);
  assert.equal(catalog.packages.length, 7);
  assert.ok(catalog.clients.every(c => c.capabilityStatus === 'unverified'));
});

test('JSON önizlemesi hiçbir ayar veya çalışma dosyası yazmaz', async t => {
  const result = await run(t, [...setup, '--json']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'preview');
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].status, 'review-required');
  assert.match(plan.warnings.join(' '), /doğrulanmadı/);
  assert.deepEqual(await readdir(result.home), ['linked', 'sentinel']);
  assert.deepEqual(await readdir(result.cwd), []);
  assert.equal(await readFile(join(result.home, 'sentinel'), 'utf8'), 'private sentinel');
  assert.equal(await readlink(join(result.home, 'linked')), 'sentinel');
});

test('İngilizce metin çıktısı kurulum yapıldığını iddia etmez', async t => {
  const result = await run(t, [...setup, '--lang', 'en']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PREVIEW/);
  assert.match(result.stdout, /No changes applied/);
  assert.match(result.stdout, /review-required/);
});

test('tekrarlanan seçim bayrakları tekilleştirilir', async t => {
  const result = await run(t, [...setup, '--package', 'superpowers', '--client', 'opencode', '--json']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).items.length, 1);
});

for (const command of ['update', 'backup', 'restore', 'uninstall', 'status']) {
  test(`${command} uygulanmadığı için hata verir`, async t => {
    const result = await run(t, [command]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /henüz uygulanmadı/);
    assert.equal(result.stdout, '');
  });
}

for (const args of [
  ['unknown'], ['--unknown'], [...setup, '--force'], [...setup, 'extra'],
  [...setup, '--client'], [...setup, '--client', '--json'],
  [...setup, '--lang', 'de'], [...setup, '--lang', ''],
  [...setup, '--json', '--json'], [...setup, '--lang', 'tr', '--lang', 'en'],
  ['catalog', '--client', 'opencode'], ['version', '--json'],
  ['setup'], ['setup', '--client', 'opencode'],
  [...setup, '--package', 'unknown'], [...setup, '--client', 'unknown'],
]) {
  test(`geçersiz komut reddedilir: ${args.join(' ')}`, async t => {
    const result = await run(t, args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.length > 0);
  });
}

test('JSON hatası yapılandırılmıştır ve İngilizce seçimini korur', async t => {
  const result = await run(t, [...setup, '--package', 'unknown', '--lang', 'en', '--json']);
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'UNKNOWN_PACKAGE');
  assert.match(error.message, /Unknown package/);
});
