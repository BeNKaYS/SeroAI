import { isAbsolute, parse, resolve, sep } from 'node:path';

export const openCodeWarnings = Object.freeze([
  'This is a configuration fragment, not a replacement for existing JSON/JSONC; review merge conflicts and higher-precedence configuration.',
  'Local paths, source versions and licenses are unverified; no files are read or installed.',
  'The installed OpenCode/OpenChamber version and runtime compatibility are unverified; this preview targets OpenCode V2 documentation.',
  'GitHub MCP remains disabled; authentication and access are unverified. No connection is attempted.',
]);

const optionNames = new Set(['clientMajor', 'skillDirectories', 'instructionFiles', 'includeGitHub']);

function fail(code = 'INVALID_ADAPTER_OPTIONS') {
  throw Object.assign(new Error(code), { code });
}

function localPaths(values, { markdown = false } = {}) {
  if (!Array.isArray(values) || values.length > 100) fail();
  const paths = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length > 4096 || value.trim() !== value || !isAbsolute(value)
      || /[\x00-\x1f\x7f*?\[\]{}]/.test(value) || value.includes('://')
      || (sep !== '\\' && value.includes('\\')) || value.split(/[\\/]/).includes('..')) fail();
    const path = resolve(value);
    if (path === parse(path).root || (markdown && !/\.md$/i.test(path))) fail();
    paths.push(path);
  }
  return [...new Set(paths)];
}

export function createOpenCodePreview(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !optionNames.has(key))) fail();
  if (Object.hasOwn(options, 'clientMajor') && options.clientMajor !== 2) fail('UNSUPPORTED_CLIENT_VERSION');
  if (Object.hasOwn(options, 'includeGitHub') && typeof options.includeGitHub !== 'boolean') fail();
  const skillDirectories = localPaths(Object.hasOwn(options, 'skillDirectories') ? options.skillDirectories : []);
  const instructionFiles = localPaths(Object.hasOwn(options, 'instructionFiles') ? options.instructionFiles : [], { markdown: true });
  const includeGitHub = options.includeGitHub === true;
  if (skillDirectories.length === 0 && instructionFiles.length === 0 && !includeGitHub) fail();
  const configFragment = { $schema: 'https://opencode.ai/config.json' };
  if (skillDirectories.length) configFragment.skills = skillDirectories;
  if (instructionFiles.length) configFragment.instructions = instructionFiles;
  if (includeGitHub) {
    configFragment.mcp = { servers: { 'seroai-github': {
      type: 'remote', url: 'https://api.githubcopilot.com/mcp/readonly', disabled: true,
    } } };
  }
  return {
    mode: 'adapter-preview', changesApplied: false, readyToApply: false,
    documentationStatus: 'reviewed', runtimeStatus: 'unverified',
    target: { client: 'opencode', major: 2, scope: 'project', file: 'opencode.jsonc', strategy: 'manual-merge-required' },
    evidence: {
      reviewedOn: '2026-11-08',
      sources: [
        'https://opencode.ai/v2/docs/config',
        'https://opencode.ai/v2/docs/skills',
        'https://opencode.ai/v2/docs/instructions',
        'https://opencode.ai/v2/docs/mcp-servers',
        'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',
      ],
    },
    configFragment,
    warnings: openCodeWarnings.slice(0, includeGitHub ? 4 : 3),
  };
}
