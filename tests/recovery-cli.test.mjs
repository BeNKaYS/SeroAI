import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedWorkspace } from '../src/core/workspace.mjs';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));
const workspaceURL = new URL('../src/core/workspace.mjs', import.meta.url).href;

async function fixture(t, interrupted = true) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-recovery-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  let root;
  if (interrupted) {
    const program = `
      import fs from 'node:fs/promises';
      import { writeSync } from 'node:fs';
      import { basename } from 'node:path';
      const { createManagedWorkspace } = await import(${JSON.stringify(workspaceURL)});
      const workspace = await createManagedWorkspace(${JSON.stringify(parent)}, { approved: true });
      writeSync(1, workspace.root + '\\n');
      const rename = fs.rename.bind(fs);
      fs.rename = async (source, destination) => {
        if (basename(destination) === 'ownership.json') process.exit(23);
        return rename(source, destination);
      };
      const plan = await workspace.prepare([{ path: 'rules.md', content: 'Yarım işlem içeriği' }]);
      await workspace.apply(plan, { approvedPlanId: plan.id });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: parent, env: { HOME: parent, USERPROFILE: parent }, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 23, result.stderr);
    root = result.stdout.trim();
    assert.ok(root.startsWith(parent));
  } else {
    root = (await createManagedWorkspace(parent, { approved: true })).root;
  }
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: parent, env: { HOME: parent, USERPROFILE: parent, XDG_CONFIG_HOME: join(parent, '.config') },
      encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return result;
  };
  return { parent, root, run };
}

test('recover varsayılan JSON önizlemesi hiçbir dosyayı değiştirmez', async t => {
  const { root, run } = await fixture(t);
  const pending = await fs.readFile(join(root, '.seroai/pending.json'), 'utf8');
  const files = await fs.readdir(root, { recursive: true });
  const result = run(['recover', '--workspace', root, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'recovery-preview');
  assert.equal(plan.changesApplied, false);
  assert.equal(plan.recoveryRequired, true);
  assert.match(plan.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan.items, [{ path: 'rules.md', action: 'delete' }]);
  assert.ok(!result.stdout.includes('Yarım işlem içeriği'));
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Yarım işlem içeriği');
  assert.equal(await fs.readFile(join(root, '.seroai/pending.json'), 'utf8'), pending);
  assert.deepEqual(await fs.readdir(root, { recursive: true }), files);
});

test('ayrı CLI sürecinde aynı önizleme kimliğiyle kurtarma yapılır', async t => {
  const { root, run } = await fixture(t);
  await fs.writeFile(join(root, 'user.txt'), 'Kullanıcı verisi');
  const preview = run(['recover', '--workspace', root, '--json']);
  assert.equal(preview.status, 0, preview.stderr);
  const { id } = JSON.parse(preview.stdout);
  const result = run(['recover', '--workspace', root, '--approve', id, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { mode: 'recovery', changesApplied: true, recovered: true, id });
  await assert.rejects(fs.stat(join(root, 'rules.md')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(join(root, '.seroai/pending.json')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(join(root, 'user.txt'), 'utf8'), 'Kullanıcı verisi');
  assert.equal((await fs.readdir(join(root, '.seroai/backups'))).length, 1);
  const repeated = run(['recover', '--workspace', root, '--approve', id, '--json']);
  assert.equal(repeated.status, 1);
  assert.equal(JSON.parse(repeated.stderr).error.code, 'STALE_PLAN');
});

test('eşleşmeyen onay kimliği hiçbir hedefi değiştirmez', async t => {
  const { root, run } = await fixture(t);
  const result = run(['recover', '--workspace', root, '--approve', '0'.repeat(64), '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'APPROVAL_REQUIRED');
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Yarım işlem içeriği');
});

test('önizlemeden sonra kullanıcı düzenlemesi kurtarmayı engeller', async t => {
  const { root, run } = await fixture(t);
  const preview = run(['recover', '--workspace', root, '--json']);
  assert.equal(preview.status, 0, preview.stderr);
  const { id } = JSON.parse(preview.stdout);
  await fs.writeFile(join(root, 'rules.md'), 'Son kullanıcı düzenlemesi');
  const result = run(['recover', '--workspace', root, '--approve', id, '--json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'CONFLICT');
  assert.equal(await fs.readFile(join(root, 'rules.md'), 'utf8'), 'Son kullanıcı düzenlemesi');
});

test('işlem yoksa kurtarma gerekmediği açıkça gösterilir', async t => {
  const { root, run } = await fixture(t, false);
  const result = run(['recover', '--workspace', root, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.recoveryRequired, false);
  assert.equal(preview.changesApplied, false);
  assert.equal(preview.id, null);
  assert.deepEqual(preview.items, []);
});

test('Türkçe ve İngilizce önizleme silme etkisini açıklar', async t => {
  const { root, run } = await fixture(t);
  const tr = run(['recover', '--workspace', root]);
  assert.equal(tr.status, 0, tr.stderr);
  assert.match(tr.stdout, /ÖNİZLEME/);
  assert.match(tr.stdout, /sil/i);
  assert.match(tr.stdout, /--approve/);
  const en = run(['recover', '--workspace', root, '--lang', 'en']);
  assert.equal(en.status, 0, en.stderr);
  assert.match(en.stdout, /PREVIEW/);
  assert.match(en.stdout, /delete/i);
});

for (const args of [
  ['recover'], ['recover', '--workspace'], ['recover', '--workspace', '/one', '--yes'],
  ['recover', '--workspace', '/one', '--approve', 'yes'],
  ['recover', '--workspace', '/one', '--approve', '0'.repeat(64), '--approve', '0'.repeat(64)],
  ['inspect', '--workspace', '/one', '--approve', '0'.repeat(64)],
  ['setup', '--client', 'opencode', '--package', 'superpowers', '--approve', '0'.repeat(64)],
]) {
  test(`recover onay bayrakları katıdır: ${args.join(' ')}`, async t => {
    const { root, run } = await fixture(t, false);
    const actualArgs = args.map(value => value === '/one' ? root : value);
    const result = run([actualArgs[0], '--json', ...actualArgs.slice(1)]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS');
  });
}
