import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from '../src/install/sources.mjs';
import { planInstall, planUninstall, doctorInstall } from '../src/install/plan.mjs';
import { createInstallTransport, skillsSpec, mergeSpecs } from './helpers/install-fixture.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const { sources } = await loadSources(appRoot);
const coreSpec = mergeSpecs(
  skillsSpec('superpowers', ['alpha', 'beta']),
  skillsSpec('caveman', ['cave-one']),
  skillsSpec('ponytail', ['pony-one']),
  skillsSpec('impeccable', ['impeccable']),
);

async function fixture(t, { global = false } = {}) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-install-plan-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  const home = join(parent, 'home');
  await fs.mkdir(join(project, '.git'), { recursive: true });
  await fs.mkdir(join(home, '.config/opencode'), { recursive: true });
  return { parent, project, home };
}

test('proje planı hedefleri ve dosyaları gösterir, hiçbir şey yazmaz', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha', 'beta']), sources);
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  assert.equal(plan.mode, 'install-preview');
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.target.type, 'project');
  assert.equal(plan.target.skillsDirectory, join(project, '.opencode/skills'));
  assert.deepEqual(plan.actions.map(action => [action.skill, action.action]), [['alpha', 'create'], ['beta', 'create']]);
  assert.equal(plan.actions[0].files, 2);
  assert.match(plan.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.exclusions, []);
  assert.equal((await fs.readdir(project)).length, 1);
});

test('core profili uygun paketleri seçer, diğerlerini gerekçeyle dışlar', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(coreSpec, sources);
  const plan = await planInstall({ appRoot, project, profile: 'core' }, transport);
  assert.deepEqual(plan.packages.map(item => item.id).sort(), ['caveman', 'impeccable', 'ponytail', 'superpowers']);
  assert.deepEqual(plan.exclusions.map(item => item.id).sort(), ['github-mcp', 'graphify', 'karpathy-skills']);
  const reasons = Object.fromEntries(plan.exclusions.map(item => [item.id, item.reason]));
  assert.equal(reasons['karpathy-skills'], 'license-missing');
  assert.equal(reasons.graphify, 'upstream-cli');
  assert.equal(reasons['github-mcp'], 'config-only');
  for (const item of plan.packages) assert.equal(item.ref.length, 40);
});

test('aynı beceri adı iki pakette ve sahipsiz hedef çakışma verir', async t => {
  const { project } = await fixture(t);
  const duplicate = mergeSpecs(skillsSpec('superpowers', ['same']), skillsSpec('caveman', ['same']));
  await assert.rejects(planInstall({ appRoot, project, packageIds: ['superpowers', 'caveman'] }, createInstallTransport(duplicate, sources)), { code: 'DUPLICATE_SKILL' });
  await fs.mkdir(join(project, '.opencode/skills/alpha'), { recursive: true });
  await fs.writeFile(join(project, '.opencode/skills/alpha/SKILL.md'), 'kullanıcı');
  await assert.rejects(planInstall({ appRoot, project, packageIds: ['superpowers'] }, createInstallTransport(skillsSpec('superpowers', ['alpha']), sources)), { code: 'CONFLICT' });
});

test('lisanssız ve araç paketleri açık seçimde reddedilir', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(coreSpec, sources);
  for (const id of ['karpathy-skills', 'graphify', 'github-mcp']) {
    await assert.rejects(planInstall({ appRoot, project, packageIds: [id] }, transport), { code: 'INSTALL_NOT_ALLOWED' }, id);
  }
  await assert.rejects(planInstall({ appRoot, project, packageIds: ['unknown'] }, transport), { code: 'UNKNOWN_PACKAGE' });
});

test('global hedef istemci klasörü yoksa reddedilir, varsa planlanır', async t => {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-install-global-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  await fs.mkdir(home);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  await assert.rejects(planInstall({ appRoot, global: true, home, packageIds: ['superpowers'] }, transport), { code: 'INVALID_INSTALL_TARGET' });
  await fs.mkdir(join(home, '.config/opencode'), { recursive: true });
  const plan = await planInstall({ appRoot, global: true, home, packageIds: ['superpowers'] }, transport);
  assert.equal(plan.target.type, 'global');
  assert.equal(plan.target.skillsDirectory, join(home, '.config/opencode/skills'));
});

test('boş hedefte doctor kurulu değil der, uninstall planı yoktur', async t => {
  const { project } = await fixture(t);
  const doctor = await doctorInstall((await import('../src/install/state.mjs')).installContext({ project }));
  assert.equal(doctor.installed, false);
  assert.deepEqual(doctor.skills, []);
  const context = (await import('../src/install/state.mjs')).installContext({ project });
  assert.equal(await planUninstall(context), null);
});

test('project ve global birlikte reddedilir', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(coreSpec, sources);
  await assert.rejects(planInstall({ appRoot, project, global: true, packageIds: ['superpowers'] }, transport), { code: 'INVALID_ARGUMENTS' });
});
