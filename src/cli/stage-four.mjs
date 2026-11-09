import { planUpdate, applyUpdate, planUpdateRollback, rollbackUpdate } from '../updates/update.mjs';
import { createProfile, readProfile, parseMappings, profileSources, validateProfile } from '../profiles/profile.mjs';
import { loadCatalog } from '../core/catalog.mjs';
import { planOpenCodeProject, applyOpenCodeProject } from '../adapters/opencode-project.mjs';
import { failure } from '../core/safe-files.mjs';

function source(options) {
  if (options.localSource) return { kind: 'local', directory: options.localSource };
  return { kind: 'github', repository: options.githubRepository, ...(options.githubRef ? { ref: options.githubRef } : {}) };
}

function descriptorText(descriptor) {
  return descriptor.kind === 'local'
    ? `local:${descriptor.directory}`
    : `github:${descriptor.repository}${descriptor.mode === 'branch' ? `@${descriptor.commit}` : `@${descriptor.tag}`}`;
}

export async function runUpdate(options, messages) {
  if (options.command === 'update-rollback') {
    const plan = await planUpdateRollback(options.root);
    if (!plan) {
      if (options.approval) throw failure('STALE_PLAN');
      return options.json
        ? JSON.stringify({ mode: 'update-rollback-preview', changesApplied: false, id: null }, null, 2)
        : messages.noUpdateRollback;
    }
    if (options.approval) {
      const result = await rollbackUpdate(plan, { approvedPlanId: options.approval });
      return options.json
        ? JSON.stringify({ mode: 'update-rollback', ...result }, null, 2)
        : messages.updateRolledBack;
    }
    if (options.json) return JSON.stringify({ ...plan, warnings: messages.updateWarnings }, null, 2);
    return [
      messages.updateRollbackPreview,
      ...plan.files.map(file => `  ${file.path}: ${messages.recoveryActions[file.action]}`),
      ...(plan.interrupted ? [messages.updateInterrupted] : []),
      ...messages.updateWarnings.map(warning => `${messages.warning}: ${warning}`),
      `${messages.recoveryApproval} --approve ${plan.id}`,
    ].join('\n');
  }
  const plan = await planUpdate({ root: options.root, source: source(options) });
  if (options.approval) {
    const result = await applyUpdate(plan, { approvedPlanId: options.approval });
    return options.json
      ? JSON.stringify({ mode: 'update', ...result }, null, 2)
      : result.updated ? `${messages.updateApplied} ${result.version}` : messages.updateNone;
  }
  if (options.json) return JSON.stringify({ ...plan, warnings: messages.updateWarnings }, null, 2);
  if (!plan.available) return `${messages.updateNone}\n  ${plan.current.surum} → ${plan.candidate.surum}`;
  return [
    messages.updatePreview,
    `  ${messages.updateCurrent}: ${plan.current.surum}`,
    `  ${messages.updateCandidate}: ${plan.candidate.surum} (${plan.candidate.tarih}) ${plan.candidate.not}`,
    `  ${messages.updateSource}: ${descriptorText(plan.source)}`,
    ...plan.files.map(file => `  ${file.path}: ${file.action}`),
    ...messages.updateWarnings.map(warning => `${messages.warning}: ${warning}`),
    `${messages.recoveryApproval} --approve ${plan.id}`,
  ].join('\n');
}

export async function runProfile(options, messages, root) {
  const catalog = await loadCatalog(root);
  if (options.command === 'profile-export') {
    const profile = createProfile({
      name: options.name ?? messages.profileDefaultName,
      clientIds: options.clientIds,
      packageIds: options.packageIds,
      sources: options.sources,
      includeGitHub: options.includeGitHub === true,
    }, catalog);
    return JSON.stringify(profile, null, 2);
  }
  const document = validateProfile(await readProfile(options.profile), catalog);
  const mappings = parseMappings(options.mappings);
  const sources = profileSources(document, mappings, catalog);
  if (!document.clients.includes('opencode')) {
    const preview = {
      mode: 'profile-restore-preview', changesApplied: false, applied: false,
      deferredClients: sources.deferredClients, id: null,
    };
    if (options.json) return JSON.stringify(preview, null, 2);
    return `${messages.profileNothingApplied}\n${sources.deferredClients.map(client => `  ${client}: ${messages.profileDeferredClient}`).join('\n')}`;
  }
  const plan = await planOpenCodeProject({ project: options.project, skillDirectories: sources.skillDirectories, instructionFiles: sources.instructionFiles, includeGitHub: sources.includeGitHub });
  if (options.approval) {
    const result = await applyOpenCodeProject(plan, { approvedPlanId: options.approval });
    return options.json
      ? JSON.stringify({ mode: 'profile-restore', applied: result.applied, deferredClients: sources.deferredClients }, null, 2)
      : [result.applied ? messages.profileApplied : messages.projectNoChanges, ...sources.deferredClients.map(client => `${messages.warning}: ${client} ${messages.profileDeferredClient}`)].join('\n');
  }
  if (options.json) {
    return JSON.stringify({ ...plan, mode: 'profile-restore-preview', deferredClients: sources.deferredClients, warnings: messages.projectWarnings }, null, 2);
  }
  return [
    messages.profilePreview,
    `  ${plan.target}`,
    ...plan.changes.map(change => `  ${change.path}: ${change.action}${change.count ? ` (${change.count})` : ''}`),
    ...sources.deferredClients.map(client => `${messages.warning}: ${client} ${messages.profileDeferredClient}`),
    ...messages.projectWarnings.map(warning => `${messages.warning}: ${warning}`),
    `${messages.recoveryApproval} --approve ${plan.id}`,
  ].join('\n');
}
