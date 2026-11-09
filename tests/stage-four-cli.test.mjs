import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateFixture } from './helpers/update-fixture.mjs';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-stage-four-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  const cwd = join(parent, 'cwd');
  const project = join(parent, 'project');
  const skills = join(parent, 'skills/superpowers');
  const rules = join(parent, 'rules.md');
  await fs.mkdir(home);
  await fs.mkdir(cwd);
  await fs.mkdir(join(project, '.git'), { recursive: true });
  await fs.mkdir(skills, { recursive: true });
  await fs.writeFile(join(skills, 'SKILL.md'), '---\ndescription: Süreç\n---\nPlanla.');
  await fs.writeFile(rules, '# Kurallar\nVeriyi koru.');
  const run = (args, extra = {}) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: extra.cwd ?? cwd,
      env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config') },
      encoding: 'utf8', timeout: 20_000,
    });
    assert.ifError(result.error);
    return result;
  };
  return { parent, home, cwd, project, skills, rules, run };
}

test('profil dışa aktarma stdout dışında hiçbir şey yazmaz', async t => {
  const { home, cwd, project, run } = await fixture(t);
  const result = run(['profile-export', '--client', 'opencode', '--client', 'cursor', '--package', 'superpowers', '--package', 'github-mcp', '--source', 'superpowers:skill', '--source', 'rules:instruction', '--github', '--name', 'Ev ofis']);
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(result.stdout);
  assert.equal(profile.name, 'Ev ofis');
  assert.deepEqual(profile.clients, ['opencode', 'cursor']);
  assert.deepEqual(profile.sources, [{ key: 'superpowers', kind: 'skill' }, { key: 'rules', kind: 'instruction' }]);
  assert.equal(profile.includeGitHub, true);
  assert.equal(result.stdout.includes(project), false);
  assert.deepEqual(await fs.readdir(home), []);
  assert.deepEqual(await fs.readdir(cwd), []);
  assert.deepEqual(await fs.readdir(project), ['.git']);
});

test('profil dışa aktarma seçimsiz çalışmaz', async t => {
  const { run } = await fixture(t);
  const result = run(['profile-export', '--client', 'opencode', '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_SELECTION');
});

test('profil geri yükleme onay olmadan config yazmaz, onayla yazar', async t => {
  const { parent, project, skills, rules, run } = await fixture(t);
  const exported = run(['profile-export', '--client', 'opencode', '--client', 'cursor', '--package', 'superpowers', '--package', 'github-mcp', '--source', 'superpowers:skill', '--source', 'rules:instruction', '--github']);
  assert.equal(exported.status, 0, exported.stderr);
  const file = join(parent, 'profile.json');
  await fs.writeFile(file, exported.stdout);
  const args = ['profile-restore', '--profile', file, '--project', project, '--map', `superpowers=${skills}`, '--map', `rules=${rules}`, '--json'];
  const previewResult = run(args);
  assert.equal(previewResult.status, 0, previewResult.stderr);
  const plan = JSON.parse(previewResult.stdout);
  assert.equal(plan.mode, 'profile-restore-preview');
  assert.equal(plan.changesApplied, false);
  assert.deepEqual(plan.deferredClients, ['cursor']);
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
  const applied = run([...args, '--approve', plan.id]);
  assert.equal(applied.status, 0, applied.stderr);
  const receipt = JSON.parse(applied.stdout);
  assert.equal(receipt.applied, true);
  assert.deepEqual(receipt.deferredClients, ['cursor']);
  const { parse } = await import('jsonc-parser');
  const config = parse(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'));
  assert.deepEqual(config.skills, [skills]);
  assert.deepEqual(config.instructions, [rules]);
  assert.equal(config.mcp.servers['seroai-github'].disabled, true);
  assert.equal((await fs.readdir(join(project, '.git/seroai/opencode/backups'))).length, 1);
});

test('profil geri yükleme eksik veya fazla eşlemeyi reddeder', async t => {
  const { parent, project, skills, rules, run } = await fixture(t);
  const exported = run(['profile-export', '--client', 'opencode', '--package', 'superpowers', '--source', 'superpowers:skill', '--source', 'rules:instruction']);
  const file = join(parent, 'profile.json');
  await fs.writeFile(file, exported.stdout);
  const missing = run(['profile-restore', '--profile', file, '--project', project, '--map', `superpowers=${skills}`, '--json']);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).error.code, 'INVALID_PROFILE_MAPPING');
  const extra = run(['profile-restore', '--profile', file, '--project', project, '--map', `superpowers=${skills}`, '--map', `rules=${rules}`, '--map', 'other=/one', '--json']);
  assert.equal(extra.status, 1);
  assert.equal(JSON.parse(extra.stderr).error.code, 'INVALID_PROFILE_MAPPING');
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
});

test('yalnızca OpenCode dışı istemci seçen profil hiçbir şey uygulamaz', async t => {
  const { parent, project, run } = await fixture(t);
  const exported = run(['profile-export', '--client', 'cursor', '--package', 'superpowers']);
  const file = join(parent, 'cursor.json');
  await fs.writeFile(file, exported.stdout);
  const result = run(['profile-restore', '--profile', file, '--project', project, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.applied, false);
  assert.equal(preview.id, null);
  assert.deepEqual(preview.deferredClients, ['cursor']);
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
});

test('yol veya sır alanlı profil dosyası reddedilir', async t => {
  const { parent, project, run } = await fixture(t);
  const file = join(parent, 'bad.json');
  await fs.writeFile(file, JSON.stringify({
    schema: 1, application: 'seroai-profile', name: 'X', clients: ['opencode'], packages: ['superpowers'],
    sources: [], includeGitHub: false, path: '/Users/private', token: 'secret',
  }));
  const result = run(['profile-restore', '--profile', file, '--project', project, '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_PROFILE');
});

test('güncelleme CLI önizlemesi dosya yazmaz, onaylı uygulama ve ayrı geri alma çalışır', async t => {
  const { root, source, oldVersion } = await updateFixture(t);
  const before = await fs.readFile(join(root, 'version.json'), 'utf8');
  const preview = spawnSync(process.execPath, [cli, 'update', '--root', root, '--local', source, '--json'], { encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.available, true);
  assert.equal(plan.changesApplied, false);
  assert.match(plan.id, /^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), before);
  assert.deepEqual(await fs.readdir(join(root, '.git/seroai')).catch(() => []), []);
  const applied = spawnSync(process.execPath, [cli, 'update', '--root', root, '--local', source, '--approve', plan.id], { encoding: 'utf8' });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Güncelleme yedek alınarak uygulandı/);
  assert.equal(JSON.parse(await fs.readFile(join(root, 'version.json'), 'utf8')).surum, '0.1.0-dev.3');
  const rollbackPreview = spawnSync(process.execPath, [cli, 'update-rollback', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(rollbackPreview.status, 0, rollbackPreview.stderr);
  const rollback = JSON.parse(rollbackPreview.stdout);
  assert.equal(rollback.changesApplied, false);
  assert.ok(rollback.files.length > 0);
  const rolledBack = spawnSync(process.execPath, [cli, 'update-rollback', '--root', root, '--approve', rollback.id], { encoding: 'utf8' });
  assert.equal(rolledBack.status, 0, rolledBack.stderr);
  assert.equal(await fs.readFile(join(root, 'version.json'), 'utf8'), oldVersion);
});

test('güncelleme CLI yanlış onayı ve aynı sürümü reddeder veya atlar', async t => {
  const { root, source } = await updateFixture(t);
  const wrong = spawnSync(process.execPath, [cli, 'update', '--root', root, '--local', source, '--approve', '0'.repeat(64), '--json'], { encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.equal(JSON.parse(wrong.stderr).error.code, 'APPROVAL_REQUIRED');
  const same = await updateFixture(t, '0.1.0-dev.2');
  const result = spawnSync(process.execPath, [cli, 'update', '--root', same.root, '--local', same.source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Güncelleme yok/);
  assert.deepEqual(await fs.readdir(join(same.root, '.git/seroai')).catch(() => []), []);
});

test('güncelleme kaynağı bayrakları birbirini dışlar ve güvensiz kaynağı reddeder', async t => {
  const { root, source } = await updateFixture(t);
  const both = spawnSync(process.execPath, [cli, 'update', '--root', root, '--local', source, '--repo', 'example/seroai', '--json'], { encoding: 'utf8' });
  assert.equal(both.status, 1);
  assert.equal(JSON.parse(both.stderr).error.code, 'INVALID_ARGUMENTS');
  const insecure = spawnSync(process.execPath, [cli, 'update', '--root', root, '--repo', 'http://github.com/example/seroai', '--json'], { encoding: 'utf8' });
  assert.equal(insecure.status, 1);
  assert.equal(JSON.parse(insecure.stderr).error.code, 'INVALID_UPDATE_SOURCE');
  const refOnly = spawnSync(process.execPath, [cli, 'update', '--root', root, '--ref', 'main', '--json'], { encoding: 'utf8' });
  assert.equal(refOnly.status, 1);
  assert.equal(JSON.parse(refOnly.stderr).error.code, 'INVALID_ARGUMENTS');
});
