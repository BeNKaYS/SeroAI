import { isAbsolute } from 'node:path';
import { failure, readRegular } from '../core/safe-files.mjs';

const keys = ['schema', 'application', 'name', 'clients', 'packages', 'sources', 'includeGitHub'];
const sourceKinds = new Set(['skill', 'instruction']);
const sourceKey = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function invalid() {
  return failure('INVALID_PROFILE');
}

function textList(value, allowed, { required = true } = {}) {
  if (!Array.isArray(value) || value.length > 100 || (required && value.length === 0)) throw invalid();
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || seen.has(item)) throw invalid();
    seen.add(item);
  }
  return value;
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length > 20) throw invalid();
  const seen = new Set();
  for (const entry of sources) {
    if (!object(entry) || Object.keys(entry).length !== 2 || !sourceKey(entry.key) || !sourceKinds.has(entry.kind) || seen.has(entry.key)) throw invalid();
    seen.add(entry.key);
  }
  return sources;
}

export function validateProfile(document, catalog) {
  try {
    if (!object(document) || Object.keys(document).length !== keys.length || keys.some(key => !Object.hasOwn(document, key))) throw invalid();
    if (document.schema !== 1 || document.application !== 'seroai-profile') throw invalid();
    if (typeof document.name !== 'string' || !document.name.trim() || document.name.length > 80 || /[\u0000-\u001f\u007f]/.test(document.name)) throw invalid();
    if (typeof document.includeGitHub !== 'boolean') throw invalid();
    const clients = new Set(catalog.clients.map(client => client.id));
    const packages = new Set(catalog.packages.map(item => item.id));
    textList(document.clients, clients);
    textList(document.packages, packages);
    validateSources(document.sources);
    return document;
  } catch {
    throw invalid();
  }
}

export function createProfile(options, catalog) {
  const sources = (options.sources ?? []).map(item => {
    if (typeof item !== 'string' || !/^[a-z][a-z0-9-]{0,39}:(skill|instruction)$/.test(item)) throw failure('INVALID_PROFILE_SOURCE');
    const [key, kind] = item.split(':');
    return { key, kind };
  });
  const document = {
    schema: 1,
    application: 'seroai-profile',
    name: options.name,
    clients: [...new Set(options.clientIds ?? [])],
    packages: [...new Set(options.packageIds ?? [])],
    sources,
    includeGitHub: options.includeGitHub === true,
  };
  validateProfile(document, catalog);
  const selected = new Set(document.packages);
  if (!selected.has('github-mcp') && document.includeGitHub) throw failure('INVALID_PROFILE');
  return document;
}

export function parseMappings(values) {
  if (!Array.isArray(values) || values.length > 20) throw failure('INVALID_PROFILE_MAPPING');
  const mappings = new Map();
  for (const value of values) {
    if (typeof value !== 'string' || !value.includes('=')) throw failure('INVALID_PROFILE_MAPPING');
    const separator = value.indexOf('=');
    const key = value.slice(0, separator);
    const path = value.slice(separator + 1);
    if (!sourceKey(key) || mappings.has(key) || !isAbsolute(path) || path.length > 4096 || /[\u0000-\u001f]/.test(path) || path.split(/[\\/]/).some(part => part === '.' || part === '..')) {
      throw failure('INVALID_PROFILE_MAPPING');
    }
    mappings.set(key, path);
  }
  return mappings;
}

export function profileSources(document, mappings, catalog) {
  const profile = validateProfile(document, catalog);
  if (!(mappings instanceof Map)) throw failure('INVALID_PROFILE_MAPPING');
  const keys = new Set(profile.sources.map(source => source.key));
  if (mappings.size !== keys.size || [...mappings.keys()].some(key => !keys.has(key))) throw failure('INVALID_PROFILE_MAPPING');
  const skillDirectories = [];
  const instructionFiles = [];
  for (const source of profile.sources) {
    const path = mappings.get(source.key);
    if (typeof path !== 'string' || !isAbsolute(path)) throw failure('INVALID_PROFILE_MAPPING');
    (source.kind === 'skill' ? skillDirectories : instructionFiles).push(path);
  }
  return {
    skillDirectories: [...new Set(skillDirectories)],
    instructionFiles: [...new Set(instructionFiles)],
    includeGitHub: profile.includeGitHub,
    deferredClients: profile.clients.filter(client => client !== 'opencode'),
  };
}

export async function readProfile(path) {
  try {
    return JSON.parse((await readRegular(path, { maxBytes: 64 * 1024 })).toString('utf8'));
  } catch (error) {
    if (['UNSAFE_FILE', 'UNSAFE_PATH', 'CONFLICT'].includes(error.code)) throw error;
    throw failure('INVALID_PROFILE');
  }
}
