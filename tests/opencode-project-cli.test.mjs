import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-project-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  await fs.mkdir(project);
  await fs.mkdir(join(project, '.git'));
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: parent, env: { HOME: parent, USERPROFILE: parent }, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return result;
  };
  return { project, run };
}

test('proje CLI önizleme, ayrı onay, yeniden süreçte rollback döngüsü', async t => {
  const { project, run } = await fixture(t);
  const args = ['opencode-project', '--project', project, '--github', '--json'];
  const preview = run(args);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.mode, 'opencode-project-preview');
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.readyToApply, true);
  assert.deepEqual(await fs.readdir(project), ['.git']);
  const applied = run([...args, '--approve', plan.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).applied, true);
  const config = parse(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'));
  assert.equal(config.mcp.servers['seroai-github'].disabled, true);
  const rollback = run(['opencode-rollback', '--project', project, '--json']);
  assert.equal(rollback.status, 0, rollback.stderr);
  const restore = JSON.parse(rollback.stdout);
  assert.equal(restore.action, 'delete');
  const result = run(['opencode-rollback', '--project', project, '--approve', restore.id, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).rolledBack, true);
  await assert.rejects(fs.stat(join(project, 'opencode.jsonc')), { code: 'ENOENT' });
});

test('proje CLI eski onayı ve kullanıcı düzenlemesini reddeder', async t => {
  const { project, run } = await fixture(t);
  const args = ['opencode-project', '--project', project, '--github', '--json'];
  const preview = run(args);
  assert.equal(preview.status, 0, preview.stderr);
  const wrong = run([...args, '--approve', '0'.repeat(64)]);
  assert.equal(wrong.status, 1);
  assert.equal(JSON.parse(wrong.stderr).error.code, 'APPROVAL_REQUIRED');
  const applied = run([...args, '--approve', JSON.parse(preview.stdout).id]);
  assert.equal(applied.status, 0, applied.stderr);
  await fs.appendFile(join(project, 'opencode.jsonc'), '\n// Kullanıcı notu');
  const rollback = run(['opencode-rollback', '--project', project, '--json']);
  assert.equal(rollback.status, 1);
  assert.equal(JSON.parse(rollback.stderr).error.code, 'CONFLICT');
});

test('proje önizleme dilleri ve işlem yokluğu dürüstçe gösterilir', async t => {
  const { project, run } = await fixture(t);
  const tr = run(['opencode-project', '--project', project, '--github']);
  assert.equal(tr.status, 0, tr.stderr);
  assert.match(tr.stdout, /ÖNİZLEME/);
  assert.match(tr.stdout, /--approve/);
  const en = run(['opencode-project', '--project', project, '--github', '--lang', 'en']);
  assert.equal(en.status, 0, en.stderr);
  assert.match(en.stdout, /PREVIEW/);
  const none = run(['opencode-rollback', '--project', project, '--json']);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(JSON.parse(none.stdout).id, null);
  assert.equal(JSON.parse(none.stdout).changesApplied, false);
});

test('proje CLI config içeriğindeki sırları çıktıya taşımaz', async t => {
  const { project, run } = await fixture(t);
  await fs.writeFile(join(project, 'opencode.jsonc'), '{"providers":{"custom":{"settings":{"apiKey":"PRIVATE_CLI_SECRET"}}}}');
  const result = run(['opencode-project', '--project', project, '--github', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('PRIVATE_CLI_SECRET'));
});

for (const args of [
  ['opencode-project'], ['opencode-rollback'], ['opencode-project', '--project', '/one', '--yes'],
  ['opencode-rollback', '--project', '/one', '--github'], ['opencode-preview', '--project', '/one', '--github'],
  ['opencode-project', '--project', '/one', '--project', '/two', '--github'],
]) {
  test(`proje CLI yanlış bayrağı reddeder: ${args.join(' ')}`, async t => {
    const { project, run } = await fixture(t);
    const replaced = args.map(value => value === '/one' ? project : value);
    const result = run([replaced[0], '--json', ...replaced.slice(1)]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS');
  });
}
