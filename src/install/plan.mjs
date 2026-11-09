import fs from 'node:fs/promises';
import { join } from 'node:path';
import { failure, readRegular, regularFile } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';
import { checkProject } from '../adapters/opencode-project-state.mjs';
import { loadSources, sourceTree, skillsFromTree } from './sources.mjs';
import { installContext, loadInstallState, loadLatest, installedFilePath } from './state.mjs';

const plans = new WeakMap();
const relativePath = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\\') && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..');

async function exists(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function fileStatus(path) {
  let info;
  try { info = await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return { status: 'missing', sha256: null }; throw error; }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) return { status: 'unsafe', sha256: null };
  try {
    const raw = await readRegular(path, { maxBytes: 2 * 1024 * 1024 });
    return { status: 'present', sha256: sha256(raw), size: raw.length };
  } catch {
    return { status: 'unsafe', sha256: null };
  }
}

export async function observeSkills(context, state) {
  const observed = [];
  for (const item of state?.packages ?? []) {
    for (const skill of item.skills) {
      const files = [];
      for (const file of skill.files) {
        const result = await fileStatus(installedFilePath(context, skill.name, file.path));
        files.push({ path: file.path, expected: file.sha256, observed: result.sha256, status: result.status });
      }
      const statuses = new Set(files.map(file => file.status === 'present' ? (file.expected === file.observed ? 'unchanged' : 'modified') : file.status));
      const status = statuses.has('unsafe') ? 'unsafe' : statuses.has('modified') ? 'modified' : statuses.has('missing') ? 'missing' : 'unchanged';
      observed.push({ packageId: item.id, name: skill.name, status, files });
    }
  }
  return observed;
}

function selectedSources(all, options) {
  if (options.profile !== undefined && options.profile !== null && options.packageIds?.length) throw failure('INVALID_ARGUMENTS');
  if (options.profile !== undefined && options.profile !== null && options.profile !== 'core') throw failure('INVALID_ARGUMENTS');
  if (options.packageIds?.length) {
    const selected = options.packageIds.map(id => all.find(source => source.id === id) ?? (() => { throw failure('UNKNOWN_PACKAGE'); })());
    const blocked = selected.find(source => !source.installable);
    if (blocked) throw failure('INSTALL_NOT_ALLOWED');
    return { selected, exclusions: [] };
  }
  return {
    selected: all.filter(source => source.installable),
    exclusions: all.filter(source => !source.installable).map(source => ({ id: source.id, reason: source.reason })),
  };
}

export async function planInstall(options, transport = {}) {
  if (!options || typeof options.appRoot !== 'string') throw failure('INVALID_ARGUMENTS');
  if (options.global === true && options.project !== undefined) throw failure('INVALID_ARGUMENTS');
  let context;
  if (options.global === true) context = installContext({ global: true, home: options.home });
  else {
    const project = await checkProject(options.project);
    context = installContext({ project });
  }
  if (context.type === 'global') {
    const config = await exists(context.configDirectory);
    if (!config || !config.isDirectory() || config.isSymbolicLink()) throw failure('INVALID_INSTALL_TARGET');
  } else {
    const config = await exists(context.configDirectory);
    if (config && (config.isSymbolicLink() || !config.isDirectory())) throw failure('INVALID_INSTALL_TARGET');
  }
  const { sources } = await loadSources(options.appRoot);
  const { selected, exclusions } = selectedSources(sources, options);
  if (!selected.length) throw failure('INVALID_SELECTION');
  const loaded = await loadInstallState(context);
  const stateSkills = new Map();
  for (const item of loaded.state?.packages ?? []) for (const skill of item.skills) stateSkills.set(skill.name, { packageId: item.id, ref: item.ref, skill });
  const packages = [];
  const actions = [];
  const seen = new Map();
  for (const source of selected) {
    const tree = await sourceTree(source, transport);
    const skills = skillsFromTree(source, tree);
    if (!skills.length) throw failure('INVALID_INSTALL_SOURCE');
    const planned = [];
    for (const skill of skills) {
      if (seen.has(skill.name)) throw failure('DUPLICATE_SKILL');
      seen.set(skill.name, source.id);
      const prefix = `${skill.root}/`;
      const files = [...tree].filter(([path]) => path.startsWith(prefix)).map(([path, entry]) => ({ path: path.slice(prefix.length), sha: entry.sha, size: entry.size })).sort((a, b) => a.path.localeCompare(b.path));
      if (!files.length || files.some(file => !relativePath(file.path))) throw failure('INVALID_INSTALL_SOURCE');
      const owned = stateSkills.get(skill.name);
      const target = join(context.skillsDirectory, skill.name);
      const present = await exists(target);
      let action = 'create';
      if (present) {
        if (!owned || owned.ref !== source.ref || owned.packageId !== source.id) throw failure('CONFLICT');
        const sameFiles = owned.skill.files.length === files.length && owned.skill.files.every(file => files.some(candidate => candidate.path === file.path && candidate.size === file.size));
        if (!sameFiles) throw failure('CONFLICT');
        action = 'none';
      }
      const bytes = files.reduce((sum, file) => sum + file.size, 0);
      planned.push({ name: skill.name, root: skill.root, files, bytes });
      actions.push({ packageId: source.id, skill: skill.name, path: target, action, files: files.length, bytes });
    }
    packages.push({ id: source.id, ref: source.ref, license: source.license, skills: planned });
  }
  const id = sha256(JSON.stringify([context, loaded.fingerprint, packages.map(item => [item.id, item.ref]), actions.map(action => [action.packageId, action.skill, action.action]), packages.map(item => item.skills.map(skill => [skill.name, skill.files.map(file => [file.path, file.sha, file.size])]))]));
  const plan = Object.freeze({
    id,
    mode: 'install-preview',
    changesApplied: false,
    target: { type: context.type, skillsDirectory: context.skillsDirectory },
    packages: packages.map(item => ({
      id: item.id,
      ref: item.ref,
      license: item.license,
      skills: item.skills.map(skill => ({ name: skill.name, files: skill.files.map(file => ({ path: file.path, sha: file.sha, size: file.size })), count: skill.files.length, bytes: skill.bytes })),
    })),
    actions,
    exclusions,
    warnings: ['upstream-source', 'no-client-config-change'],
  });
  plans.set(plan, { context, loaded, packages, actions, sources: selected, options: structuredClone(options), transport, used: false });
  return plan;
}

export function installRecord(plan) {
  return plan && typeof plan === 'object' ? plans.get(plan) : null;
}

export function matchPlan(record, planId, code = 'STALE_PLAN') {
  if (!record || !planId || record.used) throw failure('INVALID_PLAN');
  return record;
}

export async function planInstallRollback(context) {
  const latest = await loadLatest(context);
  if (!latest || latest.status === 'rolled-back') return null;
  const loaded = await loadInstallState(context);
  if (!loaded.state || loaded.state.transactionId !== latest.transactionId) throw failure('INVALID_INSTALL_STATE');
  const observed = await observeSkills(context, loaded.state);
  if (observed.some(skill => skill.status !== 'unchanged')) throw failure('CONFLICT');
  const id = sha256(JSON.stringify([context, latest.hash, loaded.fingerprint, observed.map(skill => [skill.name, skill.status, skill.files.map(file => file.observed)])]));
  const plan = Object.freeze({
    id,
    mode: 'install-rollback-preview',
    changesApplied: false,
    target: { type: context.type, skillsDirectory: context.skillsDirectory },
    interrupted: latest.status === 'pending',
    skills: latest.created,
    files: observed.reduce((sum, skill) => sum + skill.files.length, 0),
  });
  plans.set(plan, { context, latest, loaded, observed, used: false });
  return plan;
}

export async function planUninstall(context, options = {}) {
  const loaded = await loadInstallState(context);
  if (!loaded.state) return null;
  const ids = options.packageIds?.length ? options.packageIds : loaded.state.packages.map(item => item.id);
  const unknown = ids.filter(id => !loaded.state.packages.some(item => item.id === id));
  if (unknown.length) throw failure('UNKNOWN_PACKAGE');
  const packages = loaded.state.packages.filter(item => ids.includes(item.id));
  const observed = await observeSkills(context, loaded.state);
  const owned = observed.filter(skill => packages.some(item => item.id === skill.packageId));
  if (owned.some(skill => skill.status !== 'unchanged')) throw failure('CONFLICT');
  const id = sha256(JSON.stringify([context, loaded.fingerprint, ids, owned.map(skill => [skill.name, skill.files.map(file => file.observed)])]));
  const plan = Object.freeze({
    id,
    mode: 'uninstall-preview',
    changesApplied: false,
    target: { type: context.type, skillsDirectory: context.skillsDirectory },
    packages: packages.map(item => ({ id: item.id, skills: item.skills.map(skill => skill.name) })),
    actions: owned.map(skill => ({ packageId: skill.packageId, skill: skill.name, action: 'delete' })),
  });
  plans.set(plan, { context, loaded, packages, observed: owned, used: false });
  return plan;
}

export async function doctorInstall(context) {
  const loaded = await loadInstallState(context);
  if (!loaded.state) return { mode: 'install-doctor', target: context.type, skillsDirectory: context.skillsDirectory, installed: false, skills: [] };
  const observed = await observeSkills(context, loaded.state);
  return {
    mode: 'install-doctor',
    target: context.type,
    skillsDirectory: context.skillsDirectory,
    installed: true,
    packages: loaded.state.packages.map(item => item.id),
    skills: observed.map(skill => ({ packageId: skill.packageId, name: skill.name, status: skill.status, files: skill.files.length, modified: skill.files.filter(file => file.status !== 'present' || file.expected !== file.observed).length })),
  };
}

export { plans, fileStatus, exists };
