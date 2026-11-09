import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenCodePreview } from '../src/adapters/opencode.mjs';

test('V2 ayar önizlemesi yerel kaynakları native dizilerle ifade eder', () => {
  const options = {
    clientMajor: 2,
    skillDirectories: ['/reviewed/skills', '/reviewed/skills/'],
    instructionFiles: ['/reviewed/rules.md', '/reviewed/rules.md'],
    includeGitHub: true,
  };
  const before = structuredClone(options);
  const result = createOpenCodePreview(options);
  assert.equal(result.mode, 'adapter-preview');
  assert.equal(result.changesApplied, false);
  assert.equal(result.readyToApply, false);
  assert.equal(result.documentationStatus, 'reviewed');
  assert.equal(result.runtimeStatus, 'unverified');
  assert.deepEqual(result.target, { client: 'opencode', major: 2, scope: 'project', file: 'opencode.jsonc', strategy: 'manual-merge-required' });
  assert.deepEqual(result.configFragment, {
    $schema: 'https://opencode.ai/config.json',
    skills: ['/reviewed/skills'],
    instructions: ['/reviewed/rules.md'],
    mcp: { servers: { 'seroai-github': { type: 'remote', url: 'https://api.githubcopilot.com/mcp/readonly', disabled: true } } },
  });
  assert.deepEqual(options, before);
  assert.deepEqual(createOpenCodePreview(options), result);
  assert.ok(result.warnings.length >= 3);
});

test('yalnızca seçilen entegrasyonlar önerilir', () => {
  const skillOnly = createOpenCodePreview({ skillDirectories: ['/reviewed/skills'] });
  assert.deepEqual(Object.keys(skillOnly.configFragment).sort(), ['$schema', 'skills']);
  const rulesOnly = createOpenCodePreview({ instructionFiles: ['/reviewed/rules.md'] });
  assert.deepEqual(Object.keys(rulesOnly.configFragment).sort(), ['$schema', 'instructions']);
  const githubOnly = createOpenCodePreview({ includeGitHub: true });
  const server = githubOnly.configFragment.mcp.servers['seroai-github'];
  assert.equal(server.disabled, true);
  assert.ok(!Object.hasOwn(server, 'enabled'));
  assert.ok(!Object.hasOwn(server, 'headers'));
  assert.ok(!Object.hasOwn(githubOnly.configFragment, 'permissions'));
  assert.ok(!Object.hasOwn(githubOnly.configFragment, 'plugins'));
});

test('boşluk içeren yerel yollar kabul edilir', () => {
  const result = createOpenCodePreview({ skillDirectories: ['/Reviewed Sources/skills'] });
  assert.deepEqual(result.configFragment.skills, ['/Reviewed Sources/skills']);
});

for (const path of [
  'relative/skills', '~/skills', '/', '/reviewed/../private', 'https://example.com/skills',
  '/reviewed/*', '/reviewed/{env:SECRET}', '/reviewed/line\nbreak', '/reviewed/a?b', '/reviewed/[all]',
]) {
  test(`uyarlama güvensiz/belirsiz kaynağı reddeder: ${JSON.stringify(path)}`, () => {
    assert.throws(() => createOpenCodePreview({ skillDirectories: [path] }), { code: 'INVALID_ADAPTER_OPTIONS' });
  });
}

for (const [name, options] of [
  ['eksik seçenekler', undefined], ['null seçenekler', null], ['boş seçim', {}],
  ['hatalı GitHub türü', { includeGitHub: 'yes' }], ['seçimsiz kapalı GitHub', { includeGitHub: false }],
  ['dizi olmayan kaynaklar', { skillDirectories: 'not-an-array' }], ['metin olmayan yol', { instructionFiles: [42] }],
  ['Markdown olmayan kural', { instructionFiles: ['/reviewed/script.js'] }],
  ['bilinmeyen gizli bilgi alanı', { includeGitHub: true, token: 'PRIVATE_TEST_VALUE' }],
  ['aşırı kaynak sayısı', { skillDirectories: Array(101).fill('/reviewed/skills') }],
]) {
  test(`hatalı/boş uyarlama seçeneği reddedilir: ${name}`, () => {
    assert.throws(() => createOpenCodePreview(options), error => {
      assert.equal(error.code, 'INVALID_ADAPTER_OPTIONS');
      assert.ok(!error.message.includes('PRIVATE_TEST_VALUE'));
      return true;
    });
  });
}

test('V1 hedefini V2 ile sessizce karıştırmaz', () => {
  assert.throws(() => createOpenCodePreview({ clientMajor: 1, includeGitHub: true }), { code: 'UNSUPPORTED_CLIENT_VERSION' });
});
