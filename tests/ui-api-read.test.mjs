import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUiServer } from '../src/ui/server.mjs';
import { updateFixture } from './helpers/update-fixture.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-ui-read-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'app');
  const publicDirectory = join(parent, 'public');
  const project = join(parent, 'project');
  const skills = join(parent, 'skills/superpowers');
  const rules = join(parent, 'rules.md');
  await fs.mkdir(publicDirectory);
  await fs.mkdir(root);
  await fs.cp(join(appRoot, 'catalog'), join(root, 'catalog'), { recursive: true });
  await fs.copyFile(join(appRoot, 'version.json'), join(root, 'version.json'));
  await fs.writeFile(join(root, '.env'), 'PRIVATE_UI_SENTINEL');
  await fs.mkdir(join(project, '.git'), { recursive: true });
  await fs.mkdir(skills, { recursive: true });
  await fs.writeFile(join(skills, 'SKILL.md'), '---\ndescription: Test\n---\nAdım adım çalış.');
  await fs.writeFile(rules, '# Kurallar\nVeriyi koru.');
  await fs.writeFile(join(publicDirectory, 'index.html'), '<!doctype html><h1>SeroAI</h1>');
  const ui = await createUiServer({ root, port: 0, publicDirectory });
  t.after(() => ui.close());
  const base = `http://127.0.0.1:${ui.port}`;
  const api = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'x-seroai-token': ui.token, ...(options.body ? { 'content-type': 'application/json', origin: base } : {}), ...options.headers },
    });
    return { status: response.status, body: await response.json() };
  };
  return { parent, root, project, skills, rules, ui, base, api };
}

test('durum ucu sürümü ve sayıları verir, sır göstermez', async t => {
  const { root, api } = await fixture(t);
  const version = JSON.parse(await fs.readFile(join(root, 'version.json'), 'utf8'));
  const result = await api('/api/status');
  assert.equal(result.status, 200);
  assert.equal(result.body.version.surum, version.surum);
  assert.deepEqual(result.body.counts, { packages: 7, clients: 12 });
  assert.equal(result.body.root, root);
  assert.equal(JSON.stringify(result.body).includes('PRIVATE_UI_SENTINEL'), false);
  assert.deepEqual(result.body.state, { opencode: false, updates: false });
});

test('katalog ucu doğrulanmamış durumları korur', async t => {
  const { api } = await fixture(t);
  const result = await api('/api/catalog');
  assert.equal(result.status, 200);
  assert.equal(result.body.packages.length, 7);
  assert.equal(result.body.clients.length, 12);
  assert.ok(result.body.packages.every(item => item.status === 'unreviewed'));
  assert.ok(result.body.clients.every(item => item.capabilityStatus === 'unverified'));
});

test('proje önizlemesi config yazmaz ve göreli yolu reddeder', async t => {
  const { project, skills, rules, api } = await fixture(t);
  const query = new URLSearchParams({ project, 'skill-dir': skills, instruction: rules });
  const result = await api(`/api/project/preview?${query}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.changesApplied, false);
  assert.equal(result.body.readyToApply, true);
  assert.match(result.body.id, /^[a-f0-9]{64}$/);
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
  const relative = await api('/api/project/preview?project=relative');
  assert.equal(relative.status, 400);
  assert.equal(relative.body.error.code, 'INVALID_PROJECT');
  assert.equal(relative.body.error.message, 'Mutlak yol ve gerçek .git dizini bulunan güvenli bir proje gerekiyor. Worktree bağlantıları ve Git dışı klasörler bu sürümde manuel kalır.');
});

test('symlink kaynak ve güvensiz çalışma alanı reddedilir', async t => {
  const { parent, project, api } = await fixture(t);
  const target = join(parent, 'skills');
  const link = join(parent, 'skills-link');
  await fs.symlink(target, link);
  const query = new URLSearchParams({ project, 'skill-dir': link });
  const result = await api(`/api/project/preview?${query}`);
  assert.equal(result.status, 400);
  assert.ok(['UNSAFE_PATH', 'UNSAFE_FILE'].includes(result.body.error.code));
  const inspect = await api(`/api/inspect?workspace=${encodeURIComponent(join(parent, 'missing'))}`);
  assert.equal(inspect.status, 400);
});

test('güncelleme önizlemesi yalnızca metadata okur', async t => {
  const { api } = await fixture(t);
  const update = await updateFixture(t);
  const first = await api(`/api/update/preview?root=${encodeURIComponent(update.root)}&local=${encodeURIComponent(update.source)}`);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.available, true);
  assert.equal(first.body.source.kind, 'local');
  assert.equal((await fs.readdir(join(update.root, '.git/seroai')).catch(() => [])).length, 0);
  await fs.writeFile(join(update.source, 'src/cli/main.mjs'), 'Bozuk');
  const second = await api(`/api/update/preview?root=${encodeURIComponent(update.root)}&local=${encodeURIComponent(update.source)}`);
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  const both = await api(`/api/update/preview?root=${encodeURIComponent(update.root)}&local=${encodeURIComponent(update.source)}&repo=example/seroai`);
  assert.equal(both.status, 400);
  assert.equal(both.body.error.code, 'INVALID_ARGUMENTS');
});

test('boş geri alma önizlemesi ve profil önizlemesi doğru biçimde döner', async t => {
  const { project, skills, api } = await fixture(t);
  const empty = await api(`/api/project/rollback-preview?project=${encodeURIComponent(project)}`);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.plan, null);
  const profile = {
    schema: 1, application: 'seroai-profile', name: 'Test', clients: ['opencode', 'cursor'],
    packages: ['superpowers'], sources: [{ key: 'superpowers', kind: 'skill' }], includeGitHub: false,
  };
  const preview = await api('/api/profile/preview', {
    method: 'POST', body: JSON.stringify({ profile, mappings: [`superpowers=${skills}`], project }),
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.changesApplied, false);
  assert.deepEqual(preview.body.deferredClients, ['cursor']);
  const badField = await api('/api/profile/preview', {
    method: 'POST', body: JSON.stringify({ profile, mappings: [], project, token: 'secret' }),
  });
  assert.equal(badField.status, 400);
  assert.equal(badField.body.error.code, 'INVALID_ARGUMENTS');
});
