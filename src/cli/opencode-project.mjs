import { planOpenCodeProject, applyOpenCodeProject, planOpenCodeRollback, rollbackOpenCodeProject } from '../adapters/opencode-project.mjs';
import { failure } from '../core/safe-files.mjs';

export async function runOpenCodeProject(options, messages) {
  const rollback = options.command === 'opencode-rollback';
  const plan = rollback
    ? await planOpenCodeRollback(options.project)
    : await planOpenCodeProject({ project: options.project, skillDirectories: options.skillDirectories, instructionFiles: options.instructionFiles, includeGitHub: options.includeGitHub === true });
  if (!plan) {
    if (options.approval) throw failure('STALE_PLAN');
    return options.json
      ? JSON.stringify({ mode: 'opencode-rollback-preview', changesApplied: false, id: null }, null, 2)
      : messages.noProjectRollback;
  }
  if (options.approval) {
    const result = rollback
      ? await rollbackOpenCodeProject(plan, { approvedPlanId: options.approval })
      : await applyOpenCodeProject(plan, { approvedPlanId: options.approval });
    return options.json
      ? JSON.stringify({ mode: options.command, ...result }, null, 2)
      : rollback ? messages.projectRolledBack : result.applied ? messages.projectApplied : messages.projectNoChanges;
  }
  if (options.json) return JSON.stringify({ ...plan, warnings: messages.projectWarnings }, null, 2);
  return [
    rollback ? messages.projectRollbackPreview : messages.projectPreview,
    `  ${plan.target}`,
    ...(rollback ? [`  ${messages.recoveryActions[plan.action]}`] : plan.changes.map(change => `  ${change.path}: ${change.action}${change.count ? ` (${change.count})` : ''}`)),
    ...messages.projectWarnings.map(warning => `${messages.warning}: ${warning}`),
    `${messages.recoveryApproval} --approve ${plan.id}`,
  ].join('\n');
}
