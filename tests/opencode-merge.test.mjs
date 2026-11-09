import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'jsonc-parser';
import { mergeOpenCodeConfig } from '../src/adapters/opencode-merge.mjs';

const fragment = {
  $schema: 'https://opencode.ai/config.json', skills: ['/reviewed/skills'], instructions: ['/reviewed/rules.md'],
  mcp: { servers: { 'seroai-github': { type: 'remote', url: 'https://api.githubcopilot.com/mcp/readonly', disabled: true } } },
};

test('JSONC yorumları ve ilgisiz ayarlar korunarak yalnızca ekleme yapılır', () => {
  const before = `{
  // Kullanıcının model seçimi
  "model": "existing/model",
  "providers": { "private": { "settings": { "apiKey": "PRIVATE_TEST_VALUE" } } },
  "skills": [
    // Takım becerileri kalmalı
    "/existing/skills",
  ],
  "instructions": ["TEAM.md"],
  "mcp": { "servers": { "existing": { "type": "remote", "url": "https://example.com/mcp" } } },
}`;
  const result = mergeOpenCodeConfig(before, fragment);
  const config = parse(result.content);
  assert.equal(config.model, 'existing/model');
  assert.equal(config.providers.private.settings.apiKey, 'PRIVATE_TEST_VALUE');
  assert.deepEqual(config.skills, ['/existing/skills', '/reviewed/skills']);
  assert.deepEqual(config.instructions, ['TEAM.md', '/reviewed/rules.md']);
  assert.equal(config.mcp.servers.existing.url, 'https://example.com/mcp');
  assert.equal(config.mcp.servers['seroai-github'].disabled, true);
  assert.match(result.content, /Takım becerileri kalmalı/);
  assert.match(result.content, /Kullanıcının model seçimi/);
  assert.ok(result.changes.length > 0);
  const again = mergeOpenCodeConfig(result.content, fragment);
  assert.equal(again.content, result.content);
  assert.deepEqual(again.changes, []);
});

test('boş config yalnızca seçilen alanlarla oluşturulur', () => {
  const result = mergeOpenCodeConfig('{}', { $schema: fragment.$schema, skills: ['/reviewed/skills'] });
  assert.deepEqual(parse(result.content), { $schema: fragment.$schema, skills: ['/reviewed/skills'] });
});

for (const [name, text] of [
  ['bozuk JSON', '{"secret":"PRIVATE_TEST_VALUE"'], ['dizi kök', '[]'],
  ['yinelenen anahtar', '{"skills":[], "skills":[]}'],
  ['iç içe yinelenen anahtar', '{"agents":{"review":{"mode":"primary","mode":"subagent"}}}'],
  ['yanlış skills türü', '{"skills":{}}'], ['yanlış instructions türü', '{"instructions":42}'],
  ['V1 MCP', '{"mcp":{"legacy":{"type":"local","command":["node","server.js"]}}}'],
  ['MCP çakışması', '{"mcp":{"servers":{"seroai-github":{"type":"remote","url":"https://user.example/mcp"}}}}'],
]) {
  test(`güvensiz birleştirme reddedilir: ${name}`, () => {
    assert.throws(() => mergeOpenCodeConfig(text, fragment), error => {
      assert.ok(['INVALID_PROJECT_CONFIG', 'CONFIG_CONFLICT'].includes(error.code));
      assert.ok(!error.message.includes('PRIVATE_TEST_VALUE'));
      return true;
    });
  });
}
