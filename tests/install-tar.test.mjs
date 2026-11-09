import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTarGz } from '../src/install/tar.mjs';
import { tarGz } from './helpers/tar-fixture.mjs';

test('normal dosyalar, dizinler ve uzun adlar çıkarılır', () => {
  const map = extractTarGz(tarGz([
    { name: 'skills/alpha/SKILL.md', data: '---\ndescription: A\n---\nAlfa' },
    { name: 'skills/alpha/docs', type: '5' },
    { name: 'skills/alpha/docs/not.md', data: 'Not' },
    { name: 'x', longName: 'skills/beta/SKILL.md', data: 'Beta' },
    { name: 'y', paxPath: 'skills/gamma/SKILL.md', data: 'Gama' },
  ]));
  assert.equal(map.size, 4);
  assert.equal(map.get('skills/alpha/SKILL.md').toString(), '---\ndescription: A\n---\nAlfa');
  assert.equal(map.get('skills/alpha/docs/not.md').toString(), 'Not');
  assert.equal(map.get('skills/beta/SKILL.md').toString(), 'Beta');
  assert.equal(map.get('skills/gamma/SKILL.md').toString(), 'Gama');
});

test('symlink, hardlink, aygıt ve tehlikeli yollar reddedilir', () => {
  for (const entry of [
    { name: 'link', type: '2' },
    { name: 'hard', type: '1' },
    { name: 'dev', type: '3' },
    { name: '../escape', data: 'x' },
    { name: '/absolute', data: 'x' },
    { name: 'a\\b', data: 'x' },
    { name: 'a/../b', data: 'x' },
    { name: 'a/./b', data: 'x' },
    { name: 'x', paxPath: '../evil', data: 'x' },
    { name: 'x', longName: '/etc/passwd', data: 'x' },
  ]) {
    assert.throws(() => extractTarGz(tarGz([entry])), { code: 'INVALID_ARCHIVE' });
  }
});

test('yinelenen yol, bozuk checksum ve kesik arşiv reddedilir', async () => {
  assert.throws(() => extractTarGz(tarGz([{ name: 'a', data: '1' }, { name: 'a', data: '2' }])), { code: 'INVALID_ARCHIVE' });
  const { gunzipSync, gzipSync } = await import('node:zlib');
  const raw = gunzipSync(tarGz([{ name: 'a', data: '1' }]));
  raw[10] ^= 0xff;
  assert.throws(() => extractTarGz(gzipSync(raw)), { code: 'INVALID_ARCHIVE' });
  assert.throws(() => extractTarGz(Buffer.from('not gzip')), { code: 'INVALID_ARCHIVE' });
  assert.throws(() => extractTarGz(Buffer.alloc(0)), { code: 'INVALID_ARCHIVE' });
});

test('dosya, toplam boyut ve girdi sınırları uygulanır', () => {
  assert.throws(() => extractTarGz(tarGz([{ name: 'a', data: 'x'.repeat(20) }]), { fileLimit: 10 }), { code: 'INVALID_ARCHIVE' });
  assert.throws(() => extractTarGz(tarGz([{ name: 'a', data: 'x'.repeat(20) }, { name: 'b', data: 'x'.repeat(20) }]), { maxBytes: 30 }), { code: 'INVALID_ARCHIVE' });
  const many = Array.from({ length: 11 }, (_, index) => ({ name: `f${index}`, data: 'x' }));
  assert.throws(() => extractTarGz(tarGz(many), { maxFiles: 10 }), { code: 'INVALID_ARCHIVE' });
});

test('include filtresi yalnızca istenen dosyaları bellekte tutar', () => {
  const map = extractTarGz(tarGz([
    { name: 'repo-sha/skills/alpha/SKILL.md', data: 'A' },
    { name: 'repo-sha/skills/alpha/notes.md', data: 'N' },
    { name: 'repo-sha/browser-bundle/big.bin', data: 'x'.repeat(1000) },
    { name: 'repo-sha/crates/other.bin', data: 'y'.repeat(1000) },
  ]), { include: path => path.includes('/skills/alpha/') });
  assert.deepEqual([...map.keys()].sort(), ['repo-sha/skills/alpha/SKILL.md', 'repo-sha/skills/alpha/notes.md']);
});

test('withMode çalıştırma iznini korur', () => {
  const entries = extractTarGz(tarGz([
    { name: 'a', data: 'x', mode: 0o755 },
    { name: 'b', data: 'y', mode: 0o644 },
  ]), { withMode: true });
  assert.equal(entries.get('a').mode, 0o755);
  assert.equal(entries.get('b').mode, 0o644);
  assert.equal(entries.get('a').data.toString(), 'x');
});
