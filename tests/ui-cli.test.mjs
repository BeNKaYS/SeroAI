import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli/main.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-ui-cli-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const home = join(parent, 'home');
  const cwd = join(parent, 'cwd');
  await fs.mkdir(home);
  await fs.mkdir(cwd);
  return { parent, home, cwd };
}

function launch(args, { cwd, home }) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`zaman aşımı: ${out} ${err}`));
    }, 20_000);
    child.stderr.on('data', chunk => { err += chunk; });
    child.stdout.on('data', chunk => {
      out += chunk;
      const newline = out.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timer);
        resolve({ child, line: out.slice(0, newline), read: () => out, error: () => err });
      }
    });
    child.on('exit', code => {
      if (!out.includes('\n')) {
        clearTimeout(timer);
        reject(new Error(`erken çıkış ${code}: ${out} ${err}`));
      }
    });
  });
}

async function stop(child) {
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  child.kill('SIGTERM');
  return exited;
}

test('ui --json adresi yazar, panel yalnızca belirteçle yanıt verir', async t => {
  const { cwd, home } = await fixture(t);
  const { child, line } = await launch(['ui', '--json', '--no-open', '--port', '0'], { cwd, home });
  t.after(() => child.kill('SIGKILL'));
  const info = JSON.parse(line);
  assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(info.port) && info.port > 0 && info.port <= 65535);
  assert.equal(info.root, repoRoot);
  const origin = `http://127.0.0.1:${info.port}`;
  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SeroAI/);
  const token = new URL(info.url).searchParams.get('token');
  const denied = await fetch(`${origin}/api/status`);
  assert.equal(denied.status, 401);
  const status = await fetch(`${origin}/api/status`, { headers: { 'x-seroai-token': token } });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).counts.packages, 7);
  assert.equal(await stop(child), 0);
});

test('ui bayrakları ve süreç sonlandırma güvenlidir', async t => {
  const { cwd, home } = await fixture(t);
  const run = args => spawnSync(process.execPath, [cli, ...args], {
    cwd, env: { HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 15_000,
  });
  for (const args of [
    ['ui', '--port', '70000'],
    ['ui', '--port', 'abc'],
    ['ui', '--root', 'relative'],
    ['ui', '--no-open', '--no-open'],
    ['opencode-preview', '--no-open'],
    ['update', '--root', repoRoot, '--no-open'],
  ]) {
    const result = run([args[0], '--json', ...args.slice(1)]);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS', args.join(' '));
  }
});

test('yardım ui komutunu iki dilde gösterir', async t => {
  const { cwd, home } = await fixture(t);
  const run = args => spawnSync(process.execPath, [cli, ...args], {
    cwd, env: { HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 15_000,
  });
  const tr = run(['help']);
  assert.equal(tr.status, 0, tr.stderr);
  assert.match(tr.stdout, /ui \[--root <yol>\]/);
  const en = run(['help', '--lang', 'en']);
  assert.equal(en.status, 0, en.stderr);
  assert.match(en.stdout, /ui \[--root <path>\]/);
});
