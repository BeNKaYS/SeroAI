#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../core/catalog.mjs';
import { createPlan } from '../core/plan.mjs';
import { messages, localizePlan } from './messages.mjs';

const reserved = new Set(['status', 'update', 'backup', 'restore', 'uninstall']);
const root = fileURLToPath(new URL('../../', import.meta.url));

function badArguments() {
  throw Object.assign(new Error('INVALID_ARGUMENTS'), { code: 'INVALID_ARGUMENTS' });
}

function parse(args, options) {
  const [first = 'help', ...flags] = args;
  options.command = first === '--help' ? 'help' : first === '--version' ? 'version' : first;
  if (!['help', 'version', 'catalog', 'setup'].includes(options.command) && !reserved.has(options.command)) badArguments();
  const seen = new Set();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--json') {
      if (seen.has(flag) || !['catalog', 'setup'].includes(options.command)) badArguments();
      options.json = true;
      seen.add(flag);
      continue;
    }
    if (!['--lang', '--client', '--package'].includes(flag)) badArguments();
    const value = flags[++i];
    if (!value || value.startsWith('-')) badArguments();
    if (flag === '--lang') {
      if (seen.has(flag) || !['tr', 'en'].includes(value)) badArguments();
      options.language = value;
      seen.add(flag);
    } else {
      if (options.command !== 'setup') badArguments();
      options[flag === '--client' ? 'clientIds' : 'packageIds'].push(value);
    }
  }
  return options;
}

async function main(options) {
  const m = messages[options.language];
  if (reserved.has(options.command)) throw Object.assign(new Error('NOT_IMPLEMENTED'), { code: 'NOT_IMPLEMENTED' });
  if (options.command === 'help') return m.help;
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

const options = { command: 'help', language: 'tr', json: false, packageIds: [], clientIds: [] };
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
