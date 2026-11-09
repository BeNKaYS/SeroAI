import { createHash } from 'node:crypto';
import { tarGz } from './tar-fixture.mjs';

const gitSha = content => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');

export function createInstallTransport(spec, sources) {
  const trees = new Map();
  const tarballs = new Map();
  for (const [id, skills] of Object.entries(spec)) {
    const source = sources.find(candidate => candidate.id === id);
    if (!source) continue;
    const [owner, repo] = source.repository.replace('https://github.com/', '').split('/');
    const tree = [];
    const entries = [];
    for (const [name, files] of Object.entries(skills)) {
      for (const [path, content] of Object.entries(files)) {
        const full = `${source.skillsRoot}/${name}/${path}`;
        tree.push({ path: full, type: 'blob', size: Buffer.byteLength(content), sha: gitSha(content) });
        entries.push({ name: `${repo}-${source.ref}/${full}`, data: content });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    trees.set(`${owner}/${repo}`, { truncated: false, tree });
    tarballs.set(`${owner}/${repo}`, tarGz(entries));
  }
  const fetchImpl = async url => {
    for (const [repoPath, payload] of trees) {
      if (url.includes(`/repos/${repoPath}/git/trees/`)) return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes(`codeload.github.com/${repoPath}/tar.gz/`)) return new Response(tarballs.get(repoPath), { status: 200, headers: { 'content-type': 'application/gzip' } });
    }
    return new Response('', { status: 404 });
  };
  return { fetchImpl };
}

export function skillsSpec(id, names) {
  const skills = {};
  for (const name of names) skills[name] = { 'SKILL.md': `---\ndescription: ${name}\n---\n${name}`, 'notes.md': `${name} notes` };
  return { [id]: skills };
}

export function mergeSpecs(...specs) {
  return Object.assign({}, ...specs);
}
