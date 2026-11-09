import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUiServer } from '../src/ui/server.mjs';

async function fixture(t) {
  const parent = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'seroai-ui-server-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const publicDirectory = join(parent, 'public');
  await fs.mkdir(publicDirectory);
  await fs.writeFile(join(publicDirectory, 'index.html'), '<!doctype html><html><body><h1>SeroAI panel</h1></body></html>');
  await fs.writeFile(join(publicDirectory, 'app.css'), ':root{--accent:#2F4BD8}');
  const ui = await createUiServer({ root: parent, port: 0, publicDirectory });
  t.after(() => ui.close());
  const tokenHeader = { 'x-seroai-token': ui.token };
  const origin = `http://127.0.0.1:${ui.port}`;
  return { parent, publicDirectory, ui, tokenHeader, origin };
}

test('statik panel yalnızca beyaz listedeki dosyaları sunar', async t => {
  const { ui } = await fixture(t);
  const response = await fetch(`http://127.0.0.1:${ui.port}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /SeroAI panel/);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  for (const path of ['/../package.json', '/public/app.js', '/%2e%2e/version.json', '/app.js', '/nope']) {
    const denied = await fetch(`http://127.0.0.1:${ui.port}${path}`);
    assert.equal(denied.status, 404, path);
    assert.equal((await denied.json()).error.code, 'UI_NOT_FOUND');
  }
});

test('API belirteçsiz, yabancı kaynaklı ve yanlış türde isteği reddeder', async t => {
  const { ui, tokenHeader, origin } = await fixture(t);
  const base = `http://127.0.0.1:${ui.port}`;
  const without = await fetch(`${base}/api/echo`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}' });
  assert.equal(without.status, 401);
  assert.equal((await without.json()).error.code, 'UI_UNAUTHORIZED');
  const foreign = await fetch(`${base}/api/echo`, { method: 'POST', headers: { ...tokenHeader, 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).error.code, 'UI_FORBIDDEN');
  const plain = await fetch(`${base}/api/echo`, { method: 'POST', headers: { ...tokenHeader, 'content-type': 'text/plain', origin }, body: '{}' });
  assert.equal(plain.status, 415);
  assert.equal((await plain.json()).error.code, 'UI_UNSUPPORTED_MEDIA');
  const method = await fetch(`${base}/api/echo`, { method: 'PUT', headers: { ...tokenHeader, origin } });
  assert.equal(method.status, 405);
});

test('aşırı büyük veya bozuk gövde çekirdeğe ulaşmaz', async t => {
  const { ui, tokenHeader, origin } = await fixture(t);
  const base = `http://127.0.0.1:${ui.port}`;
  const huge = await fetch(`${base}/api/echo`, {
    method: 'POST', headers: { ...tokenHeader, 'content-type': 'application/json', origin },
    body: JSON.stringify({ padding: 'x'.repeat(300 * 1024) }),
  });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).error.code, 'UI_PAYLOAD_TOO_LARGE');
  const malformed = await fetch(`${base}/api/echo`, {
    method: 'POST', headers: { ...tokenHeader, 'content-type': 'application/json', origin }, body: '{not json',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'UI_INVALID_REQUEST');
  const array = await fetch(`${base}/api/echo`, {
    method: 'POST', headers: { ...tokenHeader, 'content-type': 'application/json', origin }, body: '[]',
  });
  assert.equal(array.status, 400);
});

test('bilinmeyen API yolu belirteçle JSON 404 döndürür', async t => {
  const { ui, tokenHeader } = await fixture(t);
  const response = await fetch(`http://127.0.0.1:${ui.port}/api/missing`, { headers: tokenHeader });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'UI_NOT_FOUND');
  assert.equal(body.error.message, 'Arayüz uç noktası bulunamadı.');
});

test('belirteç yanıt gövdesinde veya statik dosyada sızmaz', async t => {
  const { ui } = await fixture(t);
  const page = await (await fetch(`http://127.0.0.1:${ui.port}/`)).text();
  assert.equal(page.includes(ui.token), false);
  const status = await fetch(`http://127.0.0.1:${ui.port}/api/missing`, { headers: { 'x-seroai-token': 'x'.repeat(64) } });
  assert.equal(status.status, 401);
});
