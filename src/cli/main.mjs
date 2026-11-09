#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { loadCatalog } from '../core/catalog.mjs';
import { createPlan } from '../core/plan.mjs';
import { inspectManagedWorkspace } from '../core/inspection.mjs';
import { prepareRecovery, recoverWorkspace } from '../core/recovery.mjs';
import { createOpenCodePreview } from '../adapters/opencode.mjs';
import { runOpenCodeProject } from './opencode-project.mjs';
import { runUpdate, runProfile } from './stage-four.mjs';
import { runUi } from './ui.mjs';
import { messages, localizePlan, localizeInspection, localizeOpenCodePreview } from './messages.mjs';

const reserved = new Set(['status', 'backup', 'restore', 'uninstall']);
const commands = [
  'help', 'version', 'catalog', 'setup', 'inspect', 'recover', 'opencode-preview', 'opencode-project', 'opencode-rollback',
  'update', 'update-rollback', 'profile-export', 'profile-restore', 'ui',
];
const jsonCommands = ['catalog', 'setup', 'inspect', 'recover', 'opencode-preview', 'opencode-project', 'opencode-rollback', 'update', 'update-rollback', 'profile-export', 'profile-restore', 'ui'];
const sourceCommands = ['opencode-preview', 'opencode-project'];
const root = fileURLToPath(new URL('../../', import.meta.url));
const absolute = value => value.length <= 4096 && isAbsolute(value) && !/[\u0000-\u001f]/.test(value);

function badArguments() {
  throw Object.assign(new Error('INVALID_ARGUMENTS'), { code: 'INVALID_ARGUMENTS' });
}

function parse(args, options) {
  const [first = 'help', ...flags] = args;
  options.command = first === '--help' ? 'help' : first === '--version' ? 'version' : first;
  if (!commands.includes(options.command) && !reserved.has(options.command)) badArguments();
  const seen = new Set();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--json') {
      if (seen.has(flag) || !jsonCommands.includes(options.command)) badArguments();
      options.json = true;
      seen.add(flag);
      continue;
    }
    if (flag === '--github') {
      if (![...sourceCommands, 'profile-export'].includes(options.command) || seen.has(flag)) badArguments();
      options.includeGitHub = true;
      seen.add(flag);
      continue;
    }
    if (flag === '--no-open') {
      if (options.command !== 'ui' || seen.has(flag)) badArguments();
      options.noOpen = true;
      seen.add(flag);
      continue;
    }
    if (!['--lang', '--client', '--package', '--workspace', '--approve', '--skill-dir', '--instruction', '--project', '--root', '--local', '--repo', '--ref', '--name', '--source', '--profile', '--map', '--port'].includes(flag)) badArguments();
    const value = flags[++i];
    if (!value || value.startsWith('-')) badArguments();
    if (flag === '--lang') {
      if (seen.has(flag) || !['tr', 'en'].includes(value)) badArguments();
      options.language = value;
      seen.add(flag);
    } else if (flag === '--workspace') {
      if (!['inspect', 'recover'].includes(options.command) || seen.has(flag)) badArguments();
      options.workspace = value;
      seen.add(flag);
    } else if (flag === '--approve') {
      if (!['recover', 'opencode-project', 'opencode-rollback', 'update', 'update-rollback', 'profile-restore'].includes(options.command) || seen.has(flag) || !/^[a-f0-9]{64}$/.test(value)) badArguments();
      options.approval = value;
      seen.add(flag);
    } else if (flag === '--skill-dir' || flag === '--instruction') {
      if (!sourceCommands.includes(options.command)) badArguments();
      options[flag === '--skill-dir' ? 'skillDirectories' : 'instructionFiles'].push(value);
    } else if (flag === '--project') {
      if (!['opencode-project', 'opencode-rollback', 'profile-restore'].includes(options.command) || seen.has(flag)) badArguments();
      options.project = value;
      seen.add(flag);
    } else if (flag === '--root') {
      if (!['update', 'update-rollback', 'ui'].includes(options.command) || seen.has(flag) || !absolute(value)) badArguments();
      options.root = value;
      seen.add(flag);
    } else if (flag === '--port') {
      if (options.command !== 'ui' || seen.has(flag) || !/^\d{1,5}$/.test(value) || Number(value) > 65535) badArguments();
      options.port = Number(value);
      seen.add(flag);
    } else if (flag === '--local') {
      if (options.command !== 'update' || seen.has(flag) || !absolute(value)) badArguments();
      options.localSource = value;
      seen.add(flag);
    } else if (flag === '--repo') {
      if (options.command !== 'update' || seen.has(flag) || value.length > 300) badArguments();
      options.githubRepository = value;
      seen.add(flag);
    } else if (flag === '--ref') {
      if (options.command !== 'update' || seen.has(flag) || value.length > 200) badArguments();
      options.githubRef = value;
      seen.add(flag);
    } else if (flag === '--name') {
      if (options.command !== 'profile-export' || seen.has(flag) || value.length > 80) badArguments();
      options.name = value;
      seen.add(flag);
    } else if (flag === '--source') {
      if (options.command !== 'profile-export' || !/^[a-z][a-z0-9-]{0,39}:(skill|instruction)$/.test(value)) badArguments();
      options.sources.push(value);
    } else if (flag === '--profile') {
      if (options.command !== 'profile-restore' || seen.has(flag) || !absolute(value)) badArguments();
      options.profile = value;
      seen.add(flag);
    } else if (flag === '--map') {
      if (options.command !== 'profile-restore' || !/^[a-z][a-z0-9-]{0,39}=/.test(value)) badArguments();
      options.mappings.push(value);
    } else {
      if (!['setup', 'profile-export'].includes(options.command)) badArguments();
      options[flag === '--client' ? 'clientIds' : 'packageIds'].push(value);
    }
  }
  if (['inspect', 'recover'].includes(options.command) && !options.workspace) badArguments();
  if (['opencode-project', 'opencode-rollback'].includes(options.command) && !options.project) badArguments();
  if (options.command === 'update' && (!options.root || (options.localSource && options.githubRepository) || (!options.localSource && !options.githubRepository) || (options.githubRef && !options.githubRepository))) badArguments();
  if (options.command === 'update-rollback' && !options.root) badArguments();
  if (options.command === 'profile-export' && (!options.clientIds.length || !options.packageIds.length)) {
    throw Object.assign(new Error('INVALID_SELECTION'), { code: 'INVALID_SELECTION' });
  }
  if (options.command === 'profile-restore' && (!options.profile || !options.project)) badArguments();
  return options;
}

async function main(options) {
  const m = messages[options.language];
  if (reserved.has(options.command)) throw Object.assign(new Error('NOT_IMPLEMENTED'), { code: 'NOT_IMPLEMENTED' });
  if (options.command === 'help') return m.help;
  if (options.command === 'ui') return runUi(options, m, root);
  if (['update', 'update-rollback'].includes(options.command)) return runUpdate(options, m);
  if (['profile-export', 'profile-restore'].includes(options.command)) return runProfile(options, m, root);
  if (['opencode-project', 'opencode-rollback'].includes(options.command)) return runOpenCodeProject(options, m);
  if (options.command === 'opencode-preview') {
    const preview = localizeOpenCodePreview(createOpenCodePreview({
      skillDirectories: options.skillDirectories,
      instructionFiles: options.instructionFiles,
      includeGitHub: options.includeGitHub === true,
    }), options.language);
    if (options.json) return JSON.stringify(preview, null, 2);
    return [m.openCodePreview, JSON.stringify(preview.configFragment, null, 2), ...preview.warnings.map(warning => `${m.warning}: ${warning}`)].join('\n');
  }
  if (options.command === 'recover') {
    const plan = await prepareRecovery(options.workspace);
    if (options.approval) {
      if (!plan) throw Object.assign(new Error('STALE_PLAN'), { code: 'STALE_PLAN' });
      const result = await recoverWorkspace(plan, { approvedPlanId: options.approval });
      return options.json
        ? JSON.stringify({ mode: 'recovery', changesApplied: true, ...result }, null, 2)
        : m.recoveryComplete;
    }
    const preview = plan
      ? { ...plan, recoveryRequired: true, warnings: m.recoveryWarnings }
      : { mode: 'recovery-preview', changesApplied: false, recoveryRequired: false, id: null, items: [], warnings: [] };
    if (options.json) return JSON.stringify(preview, null, 2);
    if (!plan) return m.noRecovery;
    return [
      m.recoveryPreview,
      ...plan.items.map(item => `  ${item.path}: ${m.recoveryActions[item.action]}`),
      ...m.recoveryWarnings.map(warning => `${m.warning}: ${warning}`),
      `${m.recoveryApproval} --approve ${plan.id}`,
    ].join('\n');
  }
  if (options.command === 'inspect') {
    const inspection = localizeInspection(await inspectManagedWorkspace(options.workspace), options.language);
    if (options.json) return JSON.stringify(inspection, null, 2);
    return [
      m.inspection,
      `${m.ownershipRecord}: ${m.recordStates[inspection.recordStatus]}`,
      ...inspection.files.map(file => `  ${file.path}: ${m.fileStates[file.status]}`),
      ...inspection.warnings.map(warning => `${m.warning}: ${warning}`),
    ].join('\n');
  }
  const catalog = await loadCatalog(root);
  if (options.command === 'version') return catalog.version.surum;
  if (options.command === 'catalog') {
    if (options.json) return JSON.stringify(catalog, null, 2);
    return [
      m.packages,
      ...catalog.packages.map(item => `  ${item.id} — ${item.role}\n    ${item.repository}`),
      '', m.clients,
      ...catalog.clients.map(client => `  ${client.id} — ${client.label} [${m.unverified}]\n    skills / MCP / hooks / rules: ${m.unverified}`),
    ].join('\n');
  }
  const plan = localizePlan(createPlan(catalog, options), options.language);
  if (options.json) return JSON.stringify(plan, null, 2);
  return [
    m.preview,
    ...plan.items.map(item => `  ${item.packageId} → ${item.clientId}: ${m.reviewRequired}`),
    ...plan.warnings.map(warning => `${m.warning}: ${warning}`),
  ].join('\n');
}

const options = {
  command: 'help', language: 'tr', json: false, packageIds: [], clientIds: [], skillDirectories: [], instructionFiles: [],
  sources: [], mappings: [], root: null, localSource: null, githubRepository: null, githubRef: null, name: null, profile: null,
  port: 0, noOpen: false,
};
try {
  parse(process.argv.slice(2), options);
  process.stdout.write(`${await main(options)}\n`);
} catch (error) {
  const m = messages[options.language];
  const code = Object.hasOwn(m.errors, error?.code) ? error.code : 'INTERNAL_ERROR';
  process.stderr.write(options.json
    ? `${JSON.stringify({ error: { code, message: m.errors[code] } })}\n`
    : `${m.error}: ${m.errors[code]}\n`);
  process.exitCode = 1;
}
