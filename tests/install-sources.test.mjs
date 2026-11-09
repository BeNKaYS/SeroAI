import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, sourceTree, skillsFromTree } from '../src/install/sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const blob = (path, size = 10) => ({ path, type: 'blob', size, sha: 'a'.repeat(40) });

test('kaynak kataloğu 7 paketi pin ve lisansla doğrular', async () => {
  const { sources } = await loadSources(root);
  assert.equal(sources.length, 7);
  const installable = sources.filter(source => source.installable);
  assert.deepEqual(installable.map(source => source.id).sort(), ['caveman', 'impeccable', 'ponytail', 'superpowers']);
  for (const source of sources) {
    assert.match(source.ref, /^[a-f0-9]{40}$/, source.id);
    assert.match(source.repository, /^https:\/\/github\.com\//);
  }
  const karpathy = sources.find(source => source.id === 'karpathy-skills');
  assert.equal(karpathy.license, null);
  assert.equal(karpathy.installable, false);
  assert.equal(karpathy.reason, 'license-missing');
  const graphify = sources.find(source => source.id === 'graphify');
  assert.equal(graphify.kind, 'tool');
  const github = sources.find(source => source.id === 'github-mcp');
  assert.equal(github.kind, 'mcp');
});

test('bozuk katalog, eksik gerekçe ve kısa commit reddedilir', async t => {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-sources-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await fs.mkdir(join(parent, 'catalog'));
  const document = JSON.parse(await fs.readFile(join(root, 'catalog/sources.json'), 'utf8'));
  const write = async value => fs.writeFile(join(parent, 'catalog/sources.json'), JSON.stringify(value));
  const badReason = structuredClone(document);
  delete badReason.sources.find(source => source.id === 'karpathy-skills').reason;
  await write(badReason);
  await assert.rejects(loadSources(parent), { code: 'INVALID_INSTALL_SOURCE' });
  const shortRef = structuredClone(document);
  shortRef.sources[0].ref = shortRef.sources[0].ref.slice(0, 12);
  await write(shortRef);
  await assert.rejects(loadSources(parent), { code: 'INVALID_INSTALL_SOURCE' });
  const unlicensed = structuredClone(document);
  unlicensed.sources[0].license = null;
  await write(unlicensed);
  await assert.rejects(loadSources(parent), { code: 'INVALID_INSTALL_SOURCE' });
  const extra = structuredClone(document);
  extra.sources[0].token = 'secret';
  await write(extra);
  await assert.rejects(loadSources(parent), { code: 'INVALID_INSTALL_SOURCE' });
});

test('ağaç metadatası yalnızca blobları döndürür ve truncated yanıtı reddeder', async () => {
  const source = (await loadSources(root)).sources.find(item => item.id === 'superpowers');
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response(JSON.stringify({
      truncated: false,
      tree: [blob('skills/alpha/SKILL.md'), blob('skills/alpha/notes.md', 5), blob('docs/readme.md'), { path: 'skills', type: 'tree', sha: 'b'.repeat(40) }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const tree = await sourceTree(source, { fetchImpl });
  assert.equal(tree.size, 3);
  assert.equal(tree.get('skills/alpha/SKILL.md').size, 10);
  assert.match(calls[0], /^https:\/\/api\.github\.com\/repos\/obra\/superpowers\/git\/trees\/22f0b463/);
  const truncated = { fetchImpl: async () => new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 }) };
  await assert.rejects(sourceTree(source, truncated), { code: 'INVALID_INSTALL_SOURCE' });
  await assert.rejects(sourceTree(source, { fetchImpl: async () => new Response('', { status: 404 }) }), { code: 'INSTALL_SOURCE_UNAVAILABLE' });
  await assert.rejects(sourceTree({ ...source, installable: false }, { fetchImpl }), { code: 'INVALID_INSTALL_SOURCE' });
});

test('beceri kökleri ağaçtan türetilir ve gizli kök desteklenir', async () => {
  const { sources } = await loadSources(root);
  const superpowers = sources.find(source => source.id === 'superpowers');
  const tree = new Map([
    ['skills/alpha/SKILL.md', { sha: 'a'.repeat(40), size: 1 }],
    ['skills/beta/SKILL.md', { sha: 'a'.repeat(40), size: 1 }],
    ['skills/alpha/ref.md', { sha: 'a'.repeat(40), size: 1 }],
  ]);
  assert.deepEqual(skillsFromTree(superpowers, tree), [
    { name: 'alpha', root: 'skills/alpha' },
    { name: 'beta', root: 'skills/beta' },
  ]);
  const impeccable = sources.find(source => source.id === 'impeccable');
  const hidden = new Map([['.agents/skills/impeccable/SKILL.md', { sha: 'a'.repeat(40), size: 1 }]]);
  assert.deepEqual(skillsFromTree(impeccable, hidden), [{ name: 'impeccable', root: '.agents/skills/impeccable' }]);
});
