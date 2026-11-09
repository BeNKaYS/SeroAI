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
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-ui-write-'));
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
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
  return { parent, root, project, skills, rules, ui, base, api, post };
}

test('proje uygulama onay kimliği ister ve ancak doğru kimlikle yazar', async t => {
  const { project, skills, rules, post, api } = await fixture(t);
  const query = new URLSearchParams({ project, 'skill-dir': skills, instruction: rules });
  const preview = await api(`/api/project/preview?${query}`);
  const sources = { project, skillDirectories: [skills], instructionFiles: [rules], includeGitHub: false };
  const denied = await post('/api/project/apply', sources);
  assert.equal(denied.status, 400);
  assert.equal(denied.body.error.code, 'APPROVAL_REQUIRED');
  const stale = await post('/api/project/apply', { ...sources, planId: '0'.repeat(64) });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'STALE_PLAN');
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
  const applied = await post('/api/project/apply', { ...sources, planId: preview.body.id });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.applied, true);
  const { parse } = await import('jsonc-parser');
  const config = parse(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'));
  assert.deepEqual(config.skills, [skills]);
  assert.equal((await fs.readdir(join(project, '.git/seroai/opencode/backups'))).length, 1);
  const rollbackPreview = await api(`/api/project/rollback-preview?project=${encodeURIComponent(project)}`);
  const rolled = await post('/api/project/rollback', { project, planId: rollbackPreview.body.plan.id });
  assert.equal(rolled.status, 200, JSON.stringify(rolled.body));
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
});

test('önizlemeden sonra değişen hedef eski kimlikle yazılmaz', async t => {
  const { project, skills, post, api } = await fixture(t);
  const query = new URLSearchParams({ project, 'skill-dir': skills });
  const preview = await api(`/api/project/preview?${query}`);
  await fs.writeFile(join(project, 'opencode.jsonc'), '{"model":"user/model"}');
  const result = await post('/api/project/apply', { project, skillDirectories: [skills], instructionFiles: [], includeGitHub: false, planId: preview.body.id });
  assert.ok([400, 409].includes(result.status));
  assert.ok(['STALE_PLAN', 'CONFIG_CONFLICT', 'CONFLICT'].includes(result.body.error.code));
  assert.equal(await fs.readFile(join(project, 'opencode.jsonc'), 'utf8'), '{"model":"user/model"}');
});

test('güncelleme uygulama ve geri alma uçları ayrı onay kimliği kullanır', async t => {
  const { post, api } = await fixture(t);
  const update = await updateFixture(t);
  const preview = await api(`/api/update/preview?root=${encodeURIComponent(update.root)}&local=${encodeURIComponent(update.source)}`);
  const source = { kind: 'local', directory: update.source };
  const denied = await post('/api/update/apply', { root: update.root, source, planId: '0'.repeat(64) });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error.code, 'STALE_PLAN');
  assert.equal(await fs.readFile(join(update.root, 'version.json'), 'utf8'), update.oldVersion);
  const applied = await post('/api/update/apply', { root: update.root, source, planId: preview.body.id });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.updated, true);
  assert.equal(JSON.parse(await fs.readFile(join(update.root, 'version.json'), 'utf8')).surum, '0.1.0-dev.3');
  const rollbackPreview = await api(`/api/update/rollback-preview?root=${encodeURIComponent(update.root)}`);
  assert.equal(rollbackPreview.status, 200);
  const rolled = await post('/api/update/rollback', { root: update.root, planId: '1'.repeat(64) });
  assert.equal(rolled.body.error.code, 'STALE_PLAN');
  const restored = await post('/api/update/rollback', { root: update.root, planId: rollbackPreview.body.plan.id });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(await fs.readFile(join(update.root, 'version.json'), 'utf8'), update.oldVersion);
  const badSource = await post('/api/update/apply', { root: update.root, source: { kind: 'local', directory: update.source, url: 'http://evil' }, planId: '0'.repeat(64) });
  assert.equal(badSource.status, 400);
  assert.equal(badSource.body.error.code, 'INVALID_ARGUMENTS');
});

test('güncelleme geri alma önizlemesi olmadan yazmaz', async t => {
  const { post, api } = await fixture(t);
  const update = await updateFixture(t);
  const preview = await api(`/api/update/preview?root=${encodeURIComponent(update.root)}&local=${encodeURIComponent(update.source)}`);
  await post('/api/update/apply', { root: update.root, source: { kind: 'local', directory: update.source }, planId: preview.body.id });
  const current = await fs.readFile(join(update.root, 'version.json'), 'utf8');
  const denied = await post('/api/update/rollback', { root: update.root, planId: '2'.repeat(64) });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error.code, 'STALE_PLAN');
  assert.equal(await fs.readFile(join(update.root, 'version.json'), 'utf8'), current);
});

test('profil geri yükleme onay ister ve diğer istemcileri erteler', async t => {
  const { project, skills, post, api } = await fixture(t);
  const profile = {
    schema: 1, application: 'seroai-profile', name: 'Test', clients: ['opencode', 'cursor'],
    packages: ['superpowers'], sources: [{ key: 'superpowers', kind: 'skill' }], includeGitHub: false,
  };
  const body = { profile, mappings: [`superpowers=${skills}`], project };
  const preview = await post('/api/profile/preview', body);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const denied = await post('/api/profile/restore', body);
  assert.equal(denied.status, 400);
  assert.equal(denied.body.error.code, 'APPROVAL_REQUIRED');
  assert.equal((await fs.readdir(project)).includes('opencode.jsonc'), false);
  const applied = await post('/api/profile/restore', { ...body, planId: preview.body.id });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.applied, true);
  assert.deepEqual(applied.body.deferredClients, ['cursor']);
});

test('boş kurtarma ve bilinmeyen gövde alanı güvenli hata verir', async t => {
  const { parent, post } = await fixture(t);
  const workspace = join(parent, 'workspace-missing');
  const noApproval = await post('/api/recover/apply', { workspace });
  assert.equal(noApproval.status, 400);
  assert.equal(noApproval.body.error.code, 'APPROVAL_REQUIRED');
  const missing = await post('/api/recover/apply', { workspace, planId: '3'.repeat(64) });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'INVALID_WORKSPACE');
  const unknown = await post('/api/project/apply', { project: workspace, skillDirectories: [], instructionFiles: [], includeGitHub: false, planId: '4'.repeat(64), token: 'secret' });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, 'INVALID_ARGUMENTS');
});
