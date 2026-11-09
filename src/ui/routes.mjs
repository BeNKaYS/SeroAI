import fs from 'node:fs/promises';
import { join } from 'node:path';
import { failure } from '../core/safe-files.mjs';
import { loadCatalog } from '../core/catalog.mjs';
import { inspectManagedWorkspace } from '../core/inspection.mjs';
import { prepareRecovery, recoverWorkspace } from '../core/recovery.mjs';
import { planOpenCodeProject, applyOpenCodeProject, planOpenCodeRollback, rollbackOpenCodeProject } from '../adapters/opencode-project.mjs';
import { planUpdate, applyUpdate, planUpdateRollback, rollbackUpdate } from '../updates/update.mjs';
import { validateProfile, createProfile, parseMappings, profileSources } from '../profiles/profile.mjs';

const paths = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/.test(value);
const pathList = value => Array.isArray(value) && value.length <= 20 && value.every(paths);

function fields(body, allowed) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw failure('UI_INVALID_REQUEST');
  for (const key of Object.keys(body)) if (!allowed.includes(key)) throw failure('INVALID_ARGUMENTS');
}

function approval(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw failure('APPROVAL_REQUIRED');
  return value;
}

function matches(plan, planId) {
  if (!plan || plan.id !== planId) throw failure('STALE_PLAN');
  return plan;
}

function sourceBody(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) throw failure('INVALID_ARGUMENTS');
  if (source.kind === 'local') {
    if (Object.keys(source).some(key => !['kind', 'directory'].includes(key)) || !paths(source.directory)) throw failure('INVALID_ARGUMENTS');
    return { kind: 'local', directory: source.directory };
  }
  if (source.kind === 'github') {
    if (Object.keys(source).some(key => !['kind', 'repository', 'ref'].includes(key)) || typeof source.repository !== 'string' || source.repository.length > 300) throw failure('INVALID_ARGUMENTS');
    if (source.ref !== undefined && (typeof source.ref !== 'string' || source.ref.length > 200)) throw failure('INVALID_ARGUMENTS');
    return { kind: 'github', repository: source.repository, ...(source.ref === undefined ? {} : { ref: source.ref }) };
  }
  throw failure('INVALID_ARGUMENTS');
}

async function exists(path) {
  try { await fs.access(path); return true; } catch { return false; }
}

function projectPreview(url) {
  const project = url.searchParams.get('project');
  if (!paths(project)) throw failure('INVALID_ARGUMENTS');
  const skillDirectories = url.searchParams.getAll('skill-dir');
  const instructionFiles = url.searchParams.getAll('instruction');
  const includeGitHub = url.searchParams.get('github') === '1';
  return planOpenCodeProject({ project, skillDirectories, instructionFiles, includeGitHub });
}

function updateSource(url) {
  const root = url.searchParams.get('root');
  if (!paths(root)) throw failure('INVALID_ARGUMENTS');
  const local = url.searchParams.get('local');
  const repository = url.searchParams.get('repo');
  const ref = url.searchParams.get('ref');
  if ((local && repository) || (!local && !repository) || (ref && !repository)) throw failure('INVALID_ARGUMENTS');
  if (local && !paths(local)) throw failure('INVALID_ARGUMENTS');
  return {
    root,
    source: local ? { kind: 'local', directory: local } : { kind: 'github', repository, ...(ref ? { ref } : {}) },
  };
}

export async function handleApi({ method, url, root, body }) {
  if (method === 'GET' && url.pathname === '/api/status') {
    const catalog = await loadCatalog(root);
    return {
      status: 200,
      body: {
        version: catalog.version,
        counts: { packages: catalog.packages.length, clients: catalog.clients.length },
        root,
        state: {
          opencode: await exists(join(root, '.git/seroai/opencode')),
          updates: await exists(join(root, '.git/seroai/updates')),
        },
      },
    };
  }
  if (method === 'GET' && url.pathname === '/api/catalog') {
    const catalog = await loadCatalog(root);
    return { status: 200, body: { packages: catalog.packages, clients: catalog.clients } };
  }
  if (method === 'GET' && url.pathname === '/api/inspect') {
    const workspace = url.searchParams.get('workspace');
    if (!paths(workspace)) throw failure('INVALID_ARGUMENTS');
    return { status: 200, body: await inspectManagedWorkspace(workspace) };
  }
  if (method === 'GET' && url.pathname === '/api/project/preview') {
    return { status: 200, body: await projectPreview(url) };
  }
  if (method === 'GET' && url.pathname === '/api/project/rollback-preview') {
    const project = url.searchParams.get('project');
    if (!paths(project)) throw failure('INVALID_ARGUMENTS');
    return { status: 200, body: { plan: await planOpenCodeRollback(project) } };
  }
  if (method === 'GET' && url.pathname === '/api/update/preview') {
    const { root: target, source } = updateSource(url);
    return { status: 200, body: await planUpdate({ root: target, source }) };
  }
  if (method === 'GET' && url.pathname === '/api/update/rollback-preview') {
    const rootPath = url.searchParams.get('root');
    if (!paths(rootPath)) throw failure('INVALID_ARGUMENTS');
    return { status: 200, body: { plan: await planUpdateRollback(rootPath) } };
  }
  if (method === 'POST' && url.pathname === '/api/profile/preview') {
    fields(body, ['profile', 'mappings', 'project']);
    if (!Array.isArray(body.mappings) || !paths(body.project)) throw failure('INVALID_ARGUMENTS');
    const catalog = await loadCatalog(root);
    validateProfile(body.profile, catalog);
    const sources = profileSources(body.profile, parseMappings(body.mappings), catalog);
    const plan = await planOpenCodeProject({
      project: body.project,
      skillDirectories: sources.skillDirectories,
      instructionFiles: sources.instructionFiles,
      includeGitHub: sources.includeGitHub,
    });
    return { status: 200, body: { ...plan, deferredClients: sources.deferredClients } };
  }
  if (method === 'POST' && url.pathname === '/api/profile/export') {
    fields(body, ['name', 'clients', 'packages', 'sources', 'includeGitHub']);
    if (!Array.isArray(body.clients) || !Array.isArray(body.packages) || !Array.isArray(body.sources) || typeof body.includeGitHub !== 'boolean' || typeof body.name !== 'string') throw failure('INVALID_ARGUMENTS');
    const catalog = await loadCatalog(root);
    const profile = createProfile({
      name: body.name,
      clientIds: body.clients,
      packageIds: body.packages,
      sources: body.sources,
      includeGitHub: body.includeGitHub,
    }, catalog);
    return { status: 200, body: profile };
  }
  if (method === 'POST' && url.pathname === '/api/project/apply') {
    fields(body, ['project', 'skillDirectories', 'instructionFiles', 'includeGitHub', 'planId']);
    if (!paths(body.project) || !pathList(body.skillDirectories ?? []) || !pathList(body.instructionFiles ?? []) || typeof (body.includeGitHub ?? false) !== 'boolean') throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const plan = await planOpenCodeProject({
      project: body.project,
      skillDirectories: body.skillDirectories ?? [],
      instructionFiles: body.instructionFiles ?? [],
      includeGitHub: body.includeGitHub === true,
    });
    matches(plan, planId);
    return { status: 200, body: await applyOpenCodeProject(plan, { approvedPlanId: planId }) };
  }
  if (method === 'POST' && url.pathname === '/api/project/rollback') {
    fields(body, ['project', 'planId']);
    if (!paths(body.project)) throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const plan = await planOpenCodeRollback(body.project);
    matches(plan, planId);
    return { status: 200, body: await rollbackOpenCodeProject(plan, { approvedPlanId: planId }) };
  }
  if (method === 'POST' && url.pathname === '/api/update/apply') {
    fields(body, ['root', 'source', 'planId']);
    if (!paths(body.root)) throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const source = sourceBody(body.source);
    const plan = await planUpdate({ root: body.root, source });
    matches(plan, planId);
    return { status: 200, body: await applyUpdate(plan, { approvedPlanId: planId }) };
  }
  if (method === 'POST' && url.pathname === '/api/update/rollback') {
    fields(body, ['root', 'planId']);
    if (!paths(body.root)) throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const plan = await planUpdateRollback(body.root);
    matches(plan, planId);
    return { status: 200, body: await rollbackUpdate(plan, { approvedPlanId: planId }) };
  }
  if (method === 'POST' && url.pathname === '/api/recover/apply') {
    fields(body, ['workspace', 'planId']);
    if (!paths(body.workspace)) throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const plan = await prepareRecovery(body.workspace);
    matches(plan, planId);
    return { status: 200, body: await recoverWorkspace(plan, { approvedPlanId: planId }) };
  }
  if (method === 'POST' && url.pathname === '/api/profile/restore') {
    fields(body, ['profile', 'mappings', 'project', 'planId']);
    if (!Array.isArray(body.mappings) || !paths(body.project)) throw failure('INVALID_ARGUMENTS');
    const planId = approval(body.planId);
    const catalog = await loadCatalog(root);
    validateProfile(body.profile, catalog);
    const sources = profileSources(body.profile, parseMappings(body.mappings), catalog);
    const plan = await planOpenCodeProject({
      project: body.project,
      skillDirectories: sources.skillDirectories,
      instructionFiles: sources.instructionFiles,
      includeGitHub: sources.includeGitHub,
    });
    matches(plan, planId);
    const result = await applyOpenCodeProject(plan, { approvedPlanId: planId });
    return { status: 200, body: { ...result, deferredClients: sources.deferredClients } };
  }
  return null;
}
