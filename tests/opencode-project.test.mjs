import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parse } from 'jsonc-parser';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { planOpenCodeProject, applyOpenCodeProject, planOpenCodeRollback, rollbackOpenCodeProject } from '../src/adapters/opencode-project.mjs';

const consent = plan => ({ approvedPlanId: plan.id });
async function fixture(t, content = null) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-project-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  const skills = join(parent, 'skills');
  const rules = join(parent, 'rules.md');
  await fs.mkdir(project, { mode: 0o755 });
  await fs.mkdir(join(project, '.git'));
  await fs.mkdir(join(skills, 'review'), { recursive: true });
  await fs.writeFile(join(skills, 'review/SKILL.md'), '---\ndescription: Review code\n---\nReview carefully.');
  await fs.writeFile(rules, '# Kurallar\nKullanıcı verilerini koru.');
  if (content !== null) await fs.writeFile(join(project, 'opencode.jsonc'), content, { mode: 0o640 });
  return { parent, project, skills, rules, options: { project, skillDirectories: [skills], instructionFiles: [rules], includeGitHub: true } };
}

test('proje önizlemesi config sırlarını göstermez ve dosya yazmaz', async t => {
  const { project, options } = await fixture(t, '{"providers":{"custom":{"settings":{"apiKey":"PRIVATE_PROJECT_SECRET"}}}}');
  const before = await fs.readdir(project);
  const plan = await planOpenCodeProject(options);
  assert.equal(plan.mode, 'opencode-project-preview');
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.readyToApply, true);
  assert.equal(plan.target, 'opencode.jsonc');
  assert.match(plan.id, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(plan).includes('PRIVATE_PROJECT_SECRET'));
  assert.deepEqual(await fs.readdir(project), before);
  await assert.rejects(applyOpenCodeProject(plan), { code: 'APPROVAL_REQUIRED' });
  assert.deepEqual(await fs.readdir(project), before);
});

test('onaylı uygulama yorumları korur ve orijinal baytları izinleriyle geri alır', async t => {
  const original = '{\n // Model seçimi korunmalı\n "model":"custom/model",\n "skills":["/existing/team"],\n}\n';
  const { project, options, skills } = await fixture(t, original);
  const plan = await planOpenCodeProject(options);
  const receipt = await applyOpenCodeProject(plan, consent(plan));
  assert.equal(receipt.applied, true);
  const current = await fs.readFile(join(project, 'opencode.jsonc'), 'utf8');
  assert.match(current, /Model seçimi korunmalı/);
  assert.equal(parse(current).model, 'custom/model');
  assert.deepEqual(parse(current).skills, ['/existing/team', skills]);
  assert.equal(parse(current).mcp.servers['seroai-github'].disabled, true);
  const backups = join(project, '.git/seroai/opencode/backups');
  assert.equal((await fs.readdir(backups)).length, 1);
  assert.equal((await fs.stat(backups)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(join(backups, `${receipt.transactionId}.json`))).mode & 0o777, 0o600);
  const rollback = await planOpenCodeRollback(project);
  assert.equal(rollback.action, 'restore');
  await assert.rejects(rollbackOpenCodeProject(rollback), { code: 'APPROVAL_REQUIRED' });
  await rollbackOpenCodeProject(rollback, consent(rollback));
  assert.equal(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'), original);
  assert.equal((await fs.stat(join(project, 'opencode.jsonc'))).mode & 0o777, 0o640);
  assert.equal(await planOpenCodeRollback(project), null);
});

test('yeni config geri alınırken yalnızca işlem dosyası kaldırılır', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  await applyOpenCodeProject(plan, consent(plan));
  await fs.writeFile(join(project, 'user.txt'), 'Kullanıcı verisi');
  const rollback = await planOpenCodeRollback(project);
  assert.equal(rollback.action, 'delete');
  await rollbackOpenCodeProject(rollback, consent(rollback));
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(project, 'user.txt'), 'utf8'), 'Kullanıcı verisi');
});

test('zaten eklenmiş ayarlar tekrar yazılmaz ve yeni yedek oluşturulmaz', async t => {
  const { project, options } = await fixture(t);
  const first = await planOpenCodeProject(options);
  await applyOpenCodeProject(first, consent(first));
  const before = await fs.readFile(join(project, 'opencode.jsonc'), 'utf8');
  const next = await planOpenCodeProject(options);
  assert.equal(next.noChanges, true);
  assert.deepEqual(next.changes, []);
  const result = await applyOpenCodeProject(next, consent(next));
  assert.equal(result.applied, false);
  assert.equal(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'), before);
  assert.equal((await fs.readdir(join(project, '.git/seroai/opencode/backups'))).length, 1);
});

test('config veya kaynak önizlemeden sonra değişirse onay eskir', async t => {
  const { project, options, rules } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  await fs.writeFile(rules, '# Değişen kurallar');
  await assert.rejects(applyOpenCodeProject(plan, consent(plan)), { code: 'STALE_PLAN' });
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
  const next = await planOpenCodeProject(options);
  await fs.writeFile(join(project, 'opencode.jsonc'), '{"model":"user/model"}');
  await assert.rejects(applyOpenCodeProject(next, consent(next)), { code: 'STALE_PLAN' });
  assert.equal(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'), '{"model":"user/model"}');
});

test('kurulum sonrası kullanıcı config düzenlemesi geri almayla ezilmez', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  await applyOpenCodeProject(plan, consent(plan));
  await fs.appendFile(join(project, 'opencode.jsonc'), '\n// Son kullanıcı notu');
  await assert.rejects(planOpenCodeRollback(project), { code: 'CONFLICT' });
});

test('mevcut opencode.json kullanılır; ikinci config oluşturulmaz', async t => {
  const { project, options } = await fixture(t);
  await fs.writeFile(join(project, 'opencode.json'), '{"model":"existing/model"}');
  const plan = await planOpenCodeProject(options);
  assert.equal(plan.target, 'opencode.json');
  await applyOpenCodeProject(plan, consent(plan));
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
});

test('iki config veya yüksek öncelikli .opencode config çakışması durdurur', async t => {
  const first = await fixture(t, '{}');
  await fs.writeFile(join(first.project, 'opencode.json'), '{}');
  await assert.rejects(planOpenCodeProject(first.options), { code: 'CONFIG_CONFLICT' });
  const second = await fixture(t);
  await fs.mkdir(join(second.project, '.opencode'));
  await fs.writeFile(join(second.project, '.opencode/opencode.jsonc'), '{}');
  await assert.rejects(planOpenCodeProject(second.options), { code: 'CONFIG_CONFLICT' });
});

test('kaynak ve config bağlantıları takip edilmez', async t => {
  const { parent, project, options, rules } = await fixture(t);
  await fs.symlink(rules, join(project, 'opencode.jsonc'));
  await assert.rejects(planOpenCodeProject(options), { code: 'UNSAFE_FILE' });
  await fs.unlink(join(project, 'opencode.jsonc'));
  await fs.symlink(join(parent, 'outside'), join(options.skillDirectories[0], 'linked'));
  await assert.rejects(planOpenCodeProject(options), { code: 'UNSAFE_FILE' });
});

test('boş beceri kaynağı kuruldu gibi gösterilmez', async t => {
  const { parent, options } = await fixture(t);
  const empty = join(parent, 'empty');
  await fs.mkdir(empty);
  await assert.rejects(planOpenCodeProject({ ...options, skillDirectories: [empty] }), { code: 'INVALID_SOURCE' });
});

test('hedef yazma hatasında hedef korunur ve yedek silinmez', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (source, destination) => {
    if (destination === join(project, 'opencode.jsonc')) throw new Error('Kontrollü disk hatası');
    return rename(source, destination);
  });
  await assert.rejects(applyOpenCodeProject(plan, consent(plan)), { code: 'PROJECT_APPLY_FAILED' });
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
  assert.equal((await fs.readdir(join(project, '.git/seroai/opencode/backups'))).length, 1);
});

test('yedek yazılamazsa proje config dosyasına dokunulmaz', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (path, ...args) => {
    if (String(path).includes('/backups/')) throw new Error('Kontrollü yedek hatası');
    return open(path, ...args);
  });
  await assert.rejects(applyOpenCodeProject(plan, consent(plan)), { code: 'BACKUP_FAILED' });
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
});

test('taklit veya yanlış onaylı plan hiçbir dosya yazmaz', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  await assert.rejects(applyOpenCodeProject({ ...plan }, consent(plan)), { code: 'INVALID_PLAN' });
  await assert.rejects(applyOpenCodeProject(plan, { approvedPlanId: 'wrong' }), { code: 'APPROVAL_REQUIRED' });
  assert.deepEqual(await fs.readdir(project), ['.git']);
});

test('bozulmuş yedek veya sahipliği belirsiz durum klasörü reddedilir', async t => {
  const { project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  const result = await applyOpenCodeProject(plan, consent(plan));
  await fs.appendFile(join(project, '.git/seroai/opencode/backups', `${result.transactionId}.json`), ' ');
  await assert.rejects(planOpenCodeRollback(project), { code: 'INVALID_PROJECT_STATE' });
  const other = await fixture(t);
  await fs.mkdir(join(other.project, '.git/seroai/opencode'), { recursive: true, mode: 0o700 });
  await assert.rejects(planOpenCodeProject(other.options), { code: 'INVALID_PROJECT_STATE' });
});

test('hardlink kaynakları ve Git dışı proje hedefleri reddedilir', async t => {
  const { parent, options, rules } = await fixture(t);
  await fs.link(rules, join(parent, 'rules-copy.md'));
  await assert.rejects(planOpenCodeProject(options), { code: 'UNSAFE_FILE' });
  await fs.unlink(join(parent, 'rules-copy.md'));
  const plain = join(parent, 'plain');
  await fs.mkdir(plain);
  await assert.rejects(planOpenCodeProject({ ...options, project: plain }), { code: 'INVALID_PROJECT' });
});

test('son işlem işaretçisi yokken de yedek dizini bağlantısı takip edilmez', async t => {
  const { parent, project, options } = await fixture(t);
  const plan = await planOpenCodeProject(options);
  await applyOpenCodeProject(plan, consent(plan));
  const state = join(project, '.git/seroai/opencode');
  await fs.unlink(join(state, 'latest.json'));
  await fs.rename(join(state, 'backups'), join(state, 'original-backups'));
  const outside = join(parent, 'outside');
  await fs.mkdir(outside, { mode: 0o700 });
  await fs.symlink(outside, join(state, 'backups'));
  await assert.rejects(planOpenCodeProject(options), { code: 'UNSAFE_PATH' });
  assert.deepEqual(await fs.readdir(outside), []);
});

test('hedef yazıldıktan sonra süreç kapanırsa yeni süreç mantığıyla geri alınır', async t => {
  const { project } = await fixture(t);
  const moduleURL = new URL('../src/adapters/opencode-project.mjs', import.meta.url).href;
  const program = `
    import fs from 'node:fs/promises';
    import { basename } from 'node:path';
    const { planOpenCodeProject, applyOpenCodeProject } = await import(${JSON.stringify(moduleURL)});
    const plan = await planOpenCodeProject({ project: ${JSON.stringify(project)}, includeGitHub: true });
    let updates = 0;
    const rename = fs.rename.bind(fs);
    fs.rename = async (source, destination) => {
      if (basename(destination) === 'latest.json' && ++updates === 2) process.exit(23);
      return rename(source, destination);
    };
    await applyOpenCodeProject(plan, { approvedPlanId: plan.id });
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: project, env: { HOME: project }, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(child.error);
  assert.equal(child.status, 23, child.stderr);
  assert.equal(parse(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8')).mcp.servers['seroai-github'].disabled, true);
  const plan = await planOpenCodeRollback(project);
  assert.equal(plan.interrupted, true);
  await rollbackOpenCodeProject(plan, consent(plan));
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(join(project, '.git/seroai/opencode/write.lock')), { code: 'ENOENT' });
});
