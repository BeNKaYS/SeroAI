import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const sha = data => createHash('sha256').update(data).digest('hex');
export async function updateFixture(t, next = '0.1.0-dev.3') {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-update-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'installed');
  const source = join(parent, 'source');
  for (const directory of [root, source]) await fs.mkdir(join(directory, 'src/cli'), { recursive: true });
  await fs.mkdir(join(root, '.git'));
  const oldVersion = JSON.stringify({ surum: '0.1.0-dev.2', tarih: '2026-11-08', not: 'Önceki sürüm' });
  await fs.writeFile(join(root, 'version.json'), oldVersion);
  await fs.writeFile(join(root, 'package.json'), '{"name":"seroai","private":true}');
  await fs.writeFile(join(root, 'src/cli/main.mjs'), 'export const old = true;');
  await fs.writeFile(join(root, '.env'), 'PRIVATE_UPDATE_SENTINEL');
  const version = JSON.stringify({ surum: next, tarih: '2026-11-08', not: 'Yeni sürüm' });
  const contents = new Map([
    ['version.json', version], ['src/cli/main.mjs', 'export const next = true;'],
    ['src/core/new-module.mjs', 'export const added = true;'],
  ]);
  for (const [path, data] of contents) {
    const { dirname } = await import('node:path');
    await fs.mkdir(dirname(join(source, path)), { recursive: true });
    await fs.writeFile(join(source, path), data);
  }
  const manifest = { schema: 1, application: 'seroai', version: next, files: [...contents].map(([path, data]) => ({ path, size: Buffer.byteLength(data), sha256: sha(data) })) };
  await fs.writeFile(join(source, 'update-manifest.json'), JSON.stringify(manifest));
  return { parent, root, source, version, oldVersion, contents, manifest, options: { root, source: { kind: 'local', directory: source } } };
}
