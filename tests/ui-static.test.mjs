import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../src/ui/public/', import.meta.url));
const read = file => fs.readFile(join(root, file), 'utf8');

test('HTML satır içi betik, stil ve dış kaynak içermez', async () => {
  const html = await read('index.html');
  assert.match(html, /<link rel="stylesheet" href="\/app\.css">/);
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(html, /lang="tr"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="theme"[^>]*aria-pressed="false"/);
});

test('istekler yalnızca aynı kökene, belirteç başlığıyla gider', async () => {
  const app = await read('app.js');
  assert.match(app, /x-seroai-token/);
  assert.match(app, /new URLSearchParams\(location\.search\)\.get\('token'\)/);
  const calls = [...app.matchAll(/fetch\(([^,)]+)/g)].map(match => match[1].trim());
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.ok(call.startsWith('path') || call.startsWith('`/api') || call.startsWith("'/api"), call);
  assert.doesNotMatch(app, /https?:\/\//);
  assert.doesNotMatch(app, /localStorage\.getItem\('seroai-token'\)/);
});

test('görünümler tablo başlığı ve defter erişilebilirliğini korur', async () => {
  const views = await read('views.js');
  assert.match(views, /<caption>/);
  assert.match(views, /aria-label="Değişiklik defteri"/);
  assert.match(views, /aria-live|data-slot="status"/);
  assert.doesNotMatch(views, /<script/i);
  assert.doesNotMatch(views, /onclick=/i);
  assert.doesNotMatch(views, /https?:\/\/[^"']*\.(js|css)/i);
  assert.doesNotMatch(views, /fetch\(/);
});

test('stil dosyası palet, koyu mod ve hareket tercihini tanımlar', async () => {
  const css = await read('app.css');
  for (const token of ['--ground', '--surface', '--accent', '--ink', '--muted', '--danger', '--ok']) {
    assert.match(css, new RegExp(`${token}:`), token);
  }
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /::selection/);
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(css, /gradient/i);
});

test('statik dosya listesi yalnızca bilinen adları sunar', async () => {
  const { staticEntry } = await import('../src/ui/static.mjs');
  assert.equal(staticEntry('/').file, 'index.html');
  assert.equal(staticEntry('/app.css').file, 'app.css');
  assert.equal(staticEntry('/app.js').file, 'app.js');
  assert.equal(staticEntry('/views.js').file, 'views.js');
  for (const path of ['/../x', '/public/app.js', '/package.json', '/favicon.ico', '//', '/app.css/..']) {
    assert.equal(staticEntry(path), null, path);
  }
});
