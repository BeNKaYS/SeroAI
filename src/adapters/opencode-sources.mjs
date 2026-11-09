import fs from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { assertDirectory, failure, readRegular } from '../core/safe-files.mjs';
import { sha256 } from '../core/workspace-state.mjs';

export async function inspectOpenCodeSources(fragment) {
  let count = 0;
  let total = 0;
  const sources = [];
  async function fingerprint(path) {
    const content = await readRegular(path);
    count += 1;
    total += content.length;
    if (count > 500 || total > 16 * 1024 * 1024) throw failure('INVALID_SOURCE');
    return { hash: sha256(content), bytes: content.length };
  }
  try {
    for (const root of fragment.skills ?? []) {
      const files = [];
      let entries = 0;
      let hasSkill = false;
      async function walk(directory, depth) {
        if (depth > 12) throw failure('INVALID_SOURCE');
        await assertDirectory(directory);
        const children = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
          if (child.name.startsWith('.') || child.name === 'node_modules') continue;
          entries += 1;
          if (entries > 1000) throw failure('INVALID_SOURCE');
          const path = join(directory, child.name);
          if (child.isSymbolicLink()) throw failure('UNSAFE_FILE');
          if (child.isDirectory()) await walk(path, depth + 1);
          else if (child.isFile()) {
            if (child.name === 'SKILL.md' || (depth === 0 && /\.md$/i.test(child.name))) hasSkill = true;
            files.push({ path: relative(root, path), ...await fingerprint(path) });
          } else throw failure('UNSAFE_FILE');
        }
      }
      await walk(root, 0);
      if (!hasSkill) throw failure('INVALID_SOURCE');
      sources.push({ kind: 'skills', path: root, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), digest: sha256(JSON.stringify(files)) });
    }
    for (const path of fragment.instructions ?? []) {
      await assertDirectory(dirname(path));
      const proof = await fingerprint(path);
      sources.push({ kind: 'instructions', path, files: 1, bytes: proof.bytes, digest: sha256(JSON.stringify([basename(path), proof])) });
    }
    return sources;
  } catch (error) {
    if (['UNSAFE_FILE', 'UNSAFE_PATH', 'INVALID_SOURCE'].includes(error.code)) throw error;
    throw failure('INVALID_SOURCE');
  }
}
