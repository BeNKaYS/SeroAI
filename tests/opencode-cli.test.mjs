import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-opencode-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  const cwd = join(parent, 'cwd');
  await fs.mkdir(home);
  await fs.mkdir(cwd);
  await fs.writeFile(join(home, 'private.txt'), 'Özel kullanıcı verisi');
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd, env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config') },
      encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return result;
  };
  return { home, cwd, run };
}

test('OpenCode JSON önizlemesi ayar veya dosya oluşturmaz', async t => {
  const { home, cwd, run } = await fixture(t);
  const result = run(['opencode-preview', '--skill-dir', '/reviewed/skills', '--instruction', '/reviewed/rules.md', '--github', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.readyToApply, false);
  assert.equal(preview.changesApplied, false);
  assert.deepEqual(preview.configFragment.skills, ['/reviewed/skills']);
  assert.deepEqual(preview.configFragment.instructions, ['/reviewed/rules.md']);
  assert.equal(preview.configFragment.mcp.servers['seroai-github'].disabled, true);
  assert.match(preview.warnings.join(' '), /doğrulanmadı/);
  assert.deepEqual(await fs.readdir(home), ['private.txt']);
  assert.deepEqual(await fs.readdir(cwd), []);
  assert.equal(await fs.readFile(join(home, 'private.txt'), 'utf8'), 'Özel kullanıcı verisi');
});

test('OpenCode metin önizlemesi Türkçe/İngilizce seçilebilir', async t => {
  const { run } = await fixture(t);
  const tr = run(['opencode-preview', '--github']);
  assert.equal(tr.status, 0, tr.stderr);
  assert.match(tr.stdout, /ÖNİZLEME/);
  assert.match(tr.stdout, /disabled/);
  const en = run(['opencode-preview', '--github', '--lang', 'en']);
  assert.equal(en.status, 0, en.stderr);
  assert.match(en.stdout, /PREVIEW/);
  assert.match(en.stdout, /unverified/);
});

test('tekrarlanan kaynak bayrakları tekilleştirilir', async t => {
  const { run } = await fixture(t);
  const result = run(['opencode-preview', '--skill-dir', '/reviewed/skills', '--skill-dir', '/reviewed/skills/', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).configFragment.skills, ['/reviewed/skills']);
});

for (const args of [
  ['opencode-preview'], ['opencode-preview', '--skill-dir'], ['opencode-preview', '--github', '--github'],
  ['opencode-preview', '--github', '--approve', '0'.repeat(64)], ['opencode-preview', '--github', '--yes'],
  ['opencode-preview', '--github', '--client', 'opencode'], ['opencode-preview', '--github', '--workspace', '/one'],
  ['setup', '--client', 'opencode', '--package', 'superpowers', '--github'], ['inspect', '--skill-dir', '/one'],
]) {
  test(`OpenCode komut bayrakları kapsamlıdır: ${args.join(' ')}`, async t => {
    const { run } = await fixture(t);
    const result = run([args[0], '--json', ...args.slice(1)]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const code = JSON.parse(result.stderr).error.code;
    assert.equal(code, args.length === 1 ? 'INVALID_ADAPTER_OPTIONS' : 'INVALID_ARGUMENTS');
  });
}
