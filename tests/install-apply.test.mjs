import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tarGz } from './helpers/tar-fixture.mjs';
import { createInstallTransport, skillsSpec } from './helpers/install-fixture.mjs';
import { loadSources } from '../src/install/sources.mjs';
import { applyInstall, rollbackInstall, uninstallSkills } from '../src/install/apply.mjs';
import { planInstall, planInstallRollback, planUninstall, doctorInstall } from '../src/install/plan.mjs';
import { installContext } from '../src/install/state.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const { sources } = await loadSources(appRoot);

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-install-apply-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  await fs.mkdir(join(project, '.git'), { recursive: true });
  return { parent, project };
}

const consent = plan => ({ approvedPlanId: plan.id });

test('onaysız kurulum sıfır yazım; doğru onayla dosya, durum ve doctor oluşur', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha', 'beta']), sources);
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  await assert.rejects(applyInstall(plan, undefined, transport), { code: 'APPROVAL_REQUIRED' });
  await assert.rejects(applyInstall(plan, { approvedPlanId: '0'.repeat(64) }, transport), { code: 'STALE_PLAN' });
  assert.equal((await fs.readdir(project)).includes('.opencode'), false);
  const result = await applyInstall(plan, consent(plan), transport);
  assert.equal(result.installed, true);
  assert.deepEqual(result.skills.sort(), ['alpha', 'beta']);
  assert.equal(await fs.readFile(join(project, '.opencode/skills/alpha/SKILL.md'), 'utf8'), '---\ndescription: alpha\n---\nalpha');
  assert.equal(await fs.readFile(join(project, '.opencode/skills/beta/notes.md'), 'utf8'), 'beta notes');
  const state = join(project, '.git/seroai/install/state.json');
  assert.equal((await fs.stat(state)).mode & 0o777, 0o600);
  const doctor = await doctorInstall(installContext({ project }));
  assert.equal(doctor.installed, true);
  assert.deepEqual(doctor.packages, ['superpowers']);
  assert.deepEqual(doctor.skills.map(skill => skill.status), ['unchanged', 'unchanged']);
  const again = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  assert.deepEqual(again.actions.map(action => action.action), ['none', 'none']);
  assert.equal((await applyInstall(again, consent(again), transport)).unchanged, true);
});

test('bozulmuş tarball hiçbir hedefe yazmaz ve kısmi durum bırakmaz', async t => {
  const { project } = await fixture(t);
  const base = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const source = sources.find(item => item.id === 'superpowers');
  const repo = source.repository.replace('https://github.com/', '').split('/')[1];
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, base);
  const tampered = {
    fetchImpl: async url => url.includes('codeload')
      ? new Response(tarGz([{ name: `${repo}-${source.ref}/skills/alpha/SKILL.md`, data: 'bozuk' }]), { status: 200 })
      : base.fetchImpl(url),
  };
  await assert.rejects(applyInstall(plan, consent(plan), tampered), { code: 'INSTALL_INTEGRITY_FAILED' });
  assert.equal((await fs.readdir(join(project, '.opencode')).catch(() => [])).includes('skills'), false);
  assert.equal((await fs.readdir(join(project, '.git/seroai/install')).catch(() => [])).includes('state.json'), false);
});

test('ikinci paket kurulumu geri alınca yalnızca o paket kalkar', async t => {
  const { project } = await fixture(t);
  const first = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const planA = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, first);
  await applyInstall(planA, consent(planA), first);
  const second = createInstallTransport(skillsSpec('caveman', ['cave-one']), sources);
  const planB = await planInstall({ appRoot, project, packageIds: ['caveman'] }, second);
  await applyInstall(planB, consent(planB), second);
  assert.equal(await fs.readFile(join(project, '.opencode/skills/cave-one/SKILL.md'), 'utf8'), '---\ndescription: cave-one\n---\ncave-one');
  const context = installContext({ project });
  const rollback = await planInstallRollback(context);
  assert.deepEqual(rollback.skills, ['cave-one']);
  await assert.rejects(rollbackInstall(rollback, undefined), { code: 'APPROVAL_REQUIRED' });
  const result = await rollbackInstall(rollback, consent(rollback));
  assert.equal(result.rolledBack, true);
  await assert.rejects(fs.stat(join(project, '.opencode/skills/cave-one')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(project, '.opencode/skills/alpha/SKILL.md'), 'utf8'), '---\ndescription: alpha\n---\nalpha');
  const doctor = await doctorInstall(context);
  assert.deepEqual(doctor.packages, ['superpowers']);
  assert.equal(await planInstallRollback(context), null);
});

test('kullanıcı düzenlemesi geri alma ve kaldırmayı engeller', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  await applyInstall(plan, consent(plan), transport);
  await fs.writeFile(join(project, '.opencode/skills/alpha/SKILL.md'), 'kullanıcı düzenlemesi');
  const context = installContext({ project });
  await assert.rejects(planInstallRollback(context), { code: 'CONFLICT' });
  await assert.rejects(planUninstall(context), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(join(project, '.opencode/skills/alpha/SKILL.md'), 'utf8'), 'kullanıcı düzenlemesi');
  const doctor = await doctorInstall(context);
  assert.equal(doctor.skills[0].status, 'modified');
});

test('kaldırma sahipli dosyaları siler ve boş durumu temizler', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  await applyInstall(plan, consent(plan), transport);
  const context = installContext({ project });
  const uninstall = await planUninstall(context, { packageIds: ['superpowers'] });
  assert.deepEqual(uninstall.actions.map(action => action.skill), ['alpha']);
  await assert.rejects(uninstallSkills(uninstall, undefined), { code: 'APPROVAL_REQUIRED' });
  const result = await uninstallSkills(uninstall, consent(uninstall));
  assert.deepEqual(result.removed, ['alpha']);
  await assert.rejects(fs.stat(join(project, '.opencode/skills/alpha')), { code: 'ENOENT' });
  assert.equal((await doctorInstall(context)).installed, false);
});

test('önizlemeden sonra beliren hedef eski kimlikle yazılmaz', async t => {
  const { project } = await fixture(t);
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const plan = await planInstall({ appRoot, project, packageIds: ['superpowers'] }, transport);
  await fs.mkdir(join(project, '.opencode/skills/alpha'), { recursive: true });
  await assert.rejects(applyInstall(plan, consent(plan), transport), { code: 'STALE_PLAN' });
  assert.equal((await fs.readdir(join(project, '.git/seroai/install')).catch(() => [])).includes('state.json'), false);
});

test('global kurulum kullanıcı evindeki keşif klasörüne yazar', async t => {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-install-global-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  await fs.mkdir(join(home, '.config/opencode'), { recursive: true });
  const transport = createInstallTransport(skillsSpec('superpowers', ['alpha']), sources);
  const plan = await planInstall({ appRoot, global: true, home, packageIds: ['superpowers'] }, transport);
  await applyInstall(plan, consent(plan), transport);
  assert.equal(await fs.readFile(join(home, '.config/opencode/skills/alpha/SKILL.md'), 'utf8'), '---\ndescription: alpha\n---\nalpha');
  const state = join(home, '.seroai/install/state.json');
  assert.equal((await fs.stat(state)).mode & 0o777, 0o600);
});
