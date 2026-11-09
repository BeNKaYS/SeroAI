import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmGuidedInstall } from '../src/cli/install.mjs';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));

async function fixture(t, { opencode = true } = {}) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-install-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  const project = join(parent, 'project');
  await fs.mkdir(home);
  await fs.mkdir(join(project, '.git'), { recursive: true });
  if (opencode) await fs.mkdir(join(home, '.config/opencode'), { recursive: true });
  const run = args => spawnSync(process.execPath, [cli, ...args], {
    cwd: parent,
    env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config') },
    encoding: 'utf8', timeout: 20_000,
  });
  return { parent, home, project, run };
}

test('kurulum yardımı ve güvenli önizleme komutları çalışır', async t => {
  const { project, run } = await fixture(t);
  const help = run(['help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /install --project/);
  assert.match(help.stdout, /install-doctor/);
  assert.match(help.stdout, /uninstall --project/);
  const doctor = run(['install-doctor', '--project', project, '--json']);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).installed, false);
  const rollback = run(['install-rollback', '--project', project, '--json']);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.equal(JSON.parse(rollback.stdout).id, null);
  const uninstall = run(['uninstall', '--project', project, '--json']);
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(JSON.parse(uninstall.stdout).id, null);
  assert.deepEqual(await fs.readdir(project), ['.git']);
});

test('lisanssız paket ve hedefsiz global kurulum ağa çıkmadan reddedilir', async t => {
  const { project, home, run } = await fixture(t, { opencode: false });
  const blocked = run(['install', '--project', project, '--package', 'karpathy-skills', '--json']);
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stderr).error.code, 'INSTALL_NOT_ALLOWED');
  const global = run(['install', '--global', '--profile', 'core', '--json']);
  assert.equal(global.status, 1);
  assert.equal(JSON.parse(global.stderr).error.code, 'INVALID_INSTALL_TARGET');
  assert.equal((await fs.readdir(home)).includes('.seroai'), false);
});

test('kurulum bayrakları kapsamlıdır', async t => {
  const { project, run } = await fixture(t);
  for (const args of [
    ['install', '--project', project, '--global'],
    ['install', '--global', '--project', project],
    ['install', '--project', project, '--profile', 'full'],
    ['install', '--project', project, '--profile', 'core', '--package', 'superpowers'],
    ['install', '--project', project, '--yes'],
    ['install-doctor'],
    ['uninstall', '--profile', 'core'],
    ['install-rollback', '--global', '--project', project],
  ]) {
    const result = run([args[0], '--json', ...args.slice(1)]);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS', args.join(' '));
  }
});

test('git olmayan proje ve bilinmeyen paket reddedilir', async t => {
  const { parent, run } = await fixture(t);
  const plain = join(parent, 'plain');
  await fs.mkdir(plain);
  const invalid = run(['install', '--project', plain, '--package', 'superpowers', '--json']);
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, 'INVALID_PROJECT');
  const unknown = run(['install', '--project', join(parent, 'project'), '--package', 'unknown', '--json']);
  assert.equal(unknown.status, 1);
  assert.equal(JSON.parse(unknown.stderr).error.code, 'UNKNOWN_PACKAGE');
});

test('rehberli onay yalnızca "evet" sözcüğünü kabul eder', async () => {
  for (const [input, expected] of [['evet\n', true], [' EVET \n', true], ['e\n', false], ['yes\n', false], ['\n', false]]) {
    const source = new PassThrough();
    source.end(input);
    const output = new PassThrough();
    assert.equal(await confirmGuidedInstall({}, { input: source, output }), expected, JSON.stringify(input));
  }
});
