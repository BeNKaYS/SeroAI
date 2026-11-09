import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, validateProfile, parseMappings, profileSources } from '../src/profiles/profile.mjs';
import { loadCatalog } from '../src/core/catalog.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = await loadCatalog(root);

const sources = [{ key: 'superpowers-skills', kind: 'skill' }, { key: 'team-rules', kind: 'instruction' }];
const valid = createProfile({
  name: 'Ev ofis',
  clientIds: ['opencode', 'cursor'],
  packageIds: ['superpowers', 'github-mcp'],
  sources: ['superpowers-skills:skill', 'team-rules:instruction'],
  includeGitHub: true,
}, catalog);

test('profil yalnızca mantıksal seçimler ve kaynak anahtarları taşır', () => {
  assert.deepEqual(valid, {
    schema: 1,
    application: 'seroai-profile',
    name: 'Ev ofis',
    clients: ['opencode', 'cursor'],
    packages: ['superpowers', 'github-mcp'],
    sources,
    includeGitHub: true,
  });
  assert.equal(JSON.stringify(valid).includes('/Users/'), false);
  assert.equal(JSON.stringify(valid).toLowerCase().includes('token'), false);
});

test('bilinmeyen alan, mutlak yol, sır ve katalog dışı seçim reddedilir', () => {
  for (const change of [
    profile => { profile.path = '/Users/private'; },
    profile => { profile.token = 'ghp_secret'; },
    profile => { profile.rawConfig = { mcp: {} }; },
    profile => { profile.clients = ['unknown-client']; },
    profile => { profile.packages = ['unknown-package']; },
    profile => { profile.sources = [{ key: 'Bad_Key', kind: 'skill' }]; },
    profile => { profile.sources = [{ key: 'a', kind: 'file', path: '/x' }]; },
    profile => { profile.name = ''; },
    profile => { profile.includeGitHub = 'yes'; },
  ]) {
    const bad = structuredClone(valid);
    change(bad);
    assert.throws(() => validateProfile(bad, catalog), { code: 'INVALID_PROFILE' });
  }
});

test('GitHub seçimi paket seçmeden dışa aktarılamaz', () => {
  assert.throws(() => createProfile({ name: 'X', clientIds: ['opencode'], packageIds: ['superpowers'], sources: [], includeGitHub: true }, catalog), { code: 'INVALID_PROFILE' });
});

test('eşlemeler yalnızca mutlak yolları ve profil anahtarlarını kabul eder', () => {
  assert.deepEqual([...parseMappings(['a=/one', 'b=/two'])], [['a', '/one'], ['b', '/two']]);
  for (const values of [['a=relative'], ['a=/one', 'a=/two'], ['a=/one/../two'], ['a=/one', 'C=/two']]) {
    assert.throws(() => parseMappings(values), { code: 'INVALID_PROFILE_MAPPING' });
  }
});

test('geri yükleme kaynakları türlerine göre ayırır ve diğer istemcileri erteler', () => {
  const mappings = parseMappings(['superpowers-skills=/skills/superpowers', 'team-rules=/rules/AGENTS.md']);
  const result = profileSources(valid, mappings, catalog);
  assert.deepEqual(result, {
    skillDirectories: ['/skills/superpowers'],
    instructionFiles: ['/rules/AGENTS.md'],
    includeGitHub: true,
    deferredClients: ['cursor'],
  });
  assert.throws(() => profileSources(valid, parseMappings(['superpowers-skills=/skills/superpowers']), catalog), { code: 'INVALID_PROFILE_MAPPING' });
});
