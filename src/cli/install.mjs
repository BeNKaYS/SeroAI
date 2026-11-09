import { createInterface } from 'node:readline/promises';
import { failure } from '../core/safe-files.mjs';
import { installContext } from '../install/state.mjs';
import { planInstall, planInstallRollback, planUninstall, doctorInstall } from '../install/plan.mjs';
import { applyInstall, rollbackInstall, uninstallSkills } from '../install/apply.mjs';

export async function confirmGuidedInstall(plan, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Kurulumu onaylıyor musunuz? Onaylamak için "evet" yazın (iptal için Enter): ');
    return answer.trim().toLocaleLowerCase('tr') === 'evet';
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

function contextFor(options) {
  return installContext(options.global === true ? { global: true } : { project: options.project });
}

function targetText(context, messages) {
  return `${messages.installTargets[context.type]}: ${context.skillsDirectory}`;
}

export async function runInstall(options, messages, appRoot) {
  const context = contextFor(options);
  if (options.command === 'install-doctor') {
    const report = await doctorInstall(context);
    if (options.json) return JSON.stringify(report, null, 2);
    if (!report.installed) return `${messages.installDoctorEmpty}\n  ${report.skillsDirectory}`;
    return [
      messages.installDoctor,
      `  ${targetText(context, messages)}`,
      ...report.skills.map(skill => `  ${skill.name}: ${messages.installStates[skill.status]} (${skill.files} dosya)`),
    ].join('\n');
  }
  if (options.command === 'install-rollback') {
    const plan = await planInstallRollback(context);
    if (!plan) {
      if (options.approval) throw failure('STALE_PLAN');
      return options.json ? JSON.stringify({ mode: 'install-rollback-preview', changesApplied: false, id: null }, null, 2) : messages.noInstallRollback;
    }
    if (options.approval) {
      const result = await rollbackInstall(plan, { approvedPlanId: options.approval });
      return options.json ? JSON.stringify({ mode: 'install-rollback', ...result }, null, 2) : messages.installRolledBack;
    }
    if (options.json) return JSON.stringify({ ...plan, warnings: messages.installWarnings }, null, 2);
    return [
      messages.installRollbackPreview,
      `  ${targetText(context, messages)}`,
      ...plan.skills.map(name => `  ${name}`),
      ...(plan.interrupted ? [messages.installInterrupted] : []),
      ...messages.installWarnings.map(warning => `${messages.warning}: ${warning}`),
      `${messages.installApproval} --approve ${plan.id}`,
    ].join('\n');
  }
  if (options.command === 'uninstall') {
    const plan = await planUninstall(context, { packageIds: options.packageIds });
    if (!plan) {
      if (options.approval) throw failure('STALE_PLAN');
      return options.json ? JSON.stringify({ mode: 'uninstall-preview', changesApplied: false, id: null }, null, 2) : messages.noUninstall;
    }
    if (options.approval) {
      const result = await uninstallSkills(plan, { approvedPlanId: options.approval });
      return options.json ? JSON.stringify({ mode: 'uninstall', ...result }, null, 2) : messages.uninstallApplied;
    }
    if (options.json) return JSON.stringify(plan, null, 2);
    return [
      messages.uninstallPreview,
      `  ${targetText(context, messages)}`,
      ...plan.actions.map(action => `  ${action.skill}: ${messages.uninstallAction}`),
      `${messages.installApproval} --approve ${plan.id}`,
    ].join('\n');
  }
  const plan = await planInstall({
    appRoot,
    ...(options.global === true ? { global: true } : { project: options.project }),
    ...(options.profile === undefined || options.profile === null ? {} : { profile: options.profile }),
    ...(options.packageIds.length ? { packageIds: options.packageIds } : {}),
  });
  if (options.approval) {
    const result = await applyInstall(plan, { approvedPlanId: options.approval });
    return options.json
      ? JSON.stringify({ mode: 'install', ...result }, null, 2)
      : result.unchanged ? messages.installUnchanged : `${messages.installApplied}\n  ${result.skills.join(', ')}`;
  }
  if (options.json) return JSON.stringify({ ...plan, warnings: messages.installWarnings }, null, 2);
  const previewText = [
    messages.installPreview,
    `  ${targetText(context, messages)}`,
    ...plan.packages.map(item => `  ${item.id}@${item.ref.slice(0, 12)} (${item.license ?? messages.installNoLicense}): ${item.skills.map(skill => skill.name).join(', ')}`),
    ...plan.exclusions.map(item => `  ${messages.warning}: ${item.id} — ${messages.installReasons[item.reason] ?? item.reason}`),
    ...messages.installWarnings.map(warning => `${messages.warning}: ${warning}`),
    `${messages.installApproval} --approve ${plan.id}`,
  ].join('\n');
  if (process.stdin.isTTY && process.stdout.isTTY) {
    process.stdout.write(`${previewText}\n${messages.installConfirm}\n`);
    const confirmed = await confirmGuidedInstall(plan);
    if (!confirmed) return messages.installCancelled;
    const result = await applyInstall(plan, { approvedPlanId: plan.id });
    return result.unchanged ? messages.installUnchanged : `${messages.installApplied}\n  ${result.skills.join(', ')}`;
  }
  return previewText;
}
