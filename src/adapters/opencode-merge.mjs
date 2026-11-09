import { applyEdits, modify, parse, parseTree } from 'jsonc-parser';
import { isDeepStrictEqual } from 'node:util';
import { failure } from '../core/safe-files.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function uniqueKeys(node) {
  if (node.type === 'object') {
    const keys = new Set();
    for (const property of node.children ?? []) {
      const key = property.children[0].value;
      if (keys.has(key) || key === '__proto__') throw failure('INVALID_PROJECT_CONFIG');
      keys.add(key);
    }
  }
  for (const child of node.children ?? []) uniqueKeys(child);
}

export function mergeOpenCodeConfig(text, fragment) {
  try {
    const errors = [];
    const options = { allowTrailingComma: true, disallowComments: false };
    const tree = parseTree(text, errors, options);
    if (!tree || tree.type !== 'object' || errors.length) throw failure('INVALID_PROJECT_CONFIG');
    uniqueKeys(tree);
    const config = parse(text, [], options);
    if (!object(fragment) || Object.keys(fragment).some(key => !['$schema', 'skills', 'instructions', 'mcp'].includes(key))) {
      throw failure('INVALID_PROJECT_CONFIG');
    }
    let content = text;
    const changes = [];
    const formattingOptions = { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n', keepLines: true };
    const set = (path, value, insertion = false) => {
      content = applyEdits(content, modify(content, path, value, { formattingOptions, isArrayInsertion: insertion }));
    };
    if (!Object.hasOwn(config, '$schema')) {
      set(['$schema'], 'https://opencode.ai/config.json');
      changes.push({ path: '$schema', action: 'add' });
    }
    for (const key of ['skills', 'instructions']) {
      if (!Object.hasOwn(fragment, key)) continue;
      if (!Array.isArray(fragment[key]) || fragment[key].some(item => typeof item !== 'string')) throw failure('INVALID_PROJECT_CONFIG');
      if (Object.hasOwn(config, key) && (!Array.isArray(config[key]) || config[key].some(item => typeof item !== 'string'))) {
        throw failure('CONFIG_CONFLICT');
      }
      const existing = config[key] ?? [];
      const additions = [...new Set(fragment[key])].filter(item => !existing.includes(item));
      if (!additions.length) continue;
      if (!Object.hasOwn(config, key)) set([key], []);
      for (const item of additions) {
        set([key, existing.length], item, true);
        existing.push(item);
      }
      changes.push({ path: key, action: 'append', count: additions.length });
    }
    if (Object.hasOwn(fragment, 'mcp')) {
      const desired = fragment.mcp?.servers;
      if (!object(desired) || Object.keys(desired).length !== 1 || !Object.hasOwn(desired, 'seroai-github')) throw failure('INVALID_PROJECT_CONFIG');
      const server = desired['seroai-github'];
      if (!isDeepStrictEqual(server, { type: 'remote', url: 'https://api.githubcopilot.com/mcp/readonly', disabled: true })) throw failure('INVALID_PROJECT_CONFIG');
      if (Object.hasOwn(config, 'mcp')) {
        if (!object(config.mcp) || Object.entries(config.mcp).some(([key, value]) => key !== 'servers' && object(value) && Object.hasOwn(value, 'type'))) {
          throw failure('CONFIG_CONFLICT');
        }
        if (Object.hasOwn(config.mcp, 'servers') && !object(config.mcp.servers)) throw failure('CONFIG_CONFLICT');
      }
      const servers = config.mcp?.servers;
      if (servers && Object.hasOwn(servers, 'seroai-github')) {
        if (!isDeepStrictEqual(servers['seroai-github'], server)) throw failure('CONFIG_CONFLICT');
      } else {
        set(['mcp', 'servers', 'seroai-github'], server);
        changes.push({ path: 'mcp.servers.seroai-github', action: 'add' });
      }
    }
    const finalErrors = [];
    parse(content, finalErrors, options);
    if (finalErrors.length) throw failure('INVALID_PROJECT_CONFIG');
    return { content, changes };
  } catch (error) {
    if (['INVALID_PROJECT_CONFIG', 'CONFIG_CONFLICT'].includes(error.code)) throw error;
    throw failure('INVALID_PROJECT_CONFIG');
  }
}
