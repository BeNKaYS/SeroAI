import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const baselineIds = new Set([
  'superpowers', 'graphify', 'caveman', 'ponytail', 'karpathy-skills', 'impeccable', 'github-mcp',
]);
const capabilityKeys = ['skills', 'mcp', 'hooks', 'rules'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

function invalid() {
  return Object.assign(new Error('Catalog files are missing or invalid.'), { code: 'INVALID_CATALOG' });
}

function uniqueEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw invalid();
  const ids = new Set();
  for (const entry of entries) {
    if (!object(entry) || typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id)) {
      throw invalid();
    }
    ids.add(entry.id);
  }
}

function validatePackages(packages) {
  uniqueEntries(packages);
  if (packages.length !== baselineIds.size) throw invalid();
  for (const item of packages) {
    // Bu aşamada hiçbir sürüm veya lisans incelenmiş kabul edilmez.
    if (!baselineIds.has(item.id) || !text(item.role) || item.status !== 'unreviewed' || item.reviewedRef !== null || item.license !== null) {
      throw invalid();
    }
    if (typeof item.repository !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(item.repository)) {
      throw invalid();
    }
    const url = new URL(item.repository);
    if (url.username || url.password || url.search || url.hash || item.repository.split('/').some(part => part === '.' || part === '..')) {
      throw invalid();
    }
  }
}

function validateClients(clients) {
  uniqueEntries(clients);
  for (const client of clients) {
    if (!text(client.label) || client.capabilityStatus !== 'unverified' || !object(client.capabilities)) throw invalid();
    if (Object.keys(client.capabilities).length !== capabilityKeys.length || capabilityKeys.some(key => client.capabilities[key] !== 'unverified')) {
      throw invalid();
    }
  }
}

function validateVersion(version) {
  if (!object(version) || !text(version.surum) || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(version.surum) || !text(version.not)) {
    throw invalid();
  }
  if (typeof version.tarih !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version.tarih)) throw invalid();
  const date = new Date(`${version.tarih}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== version.tarih) throw invalid();
}

export async function loadCatalog(root) {
  try {
    // Yalnızca proje içindeki bu üç dosya okunur; HOME ve istemci ayarları okunmaz.
    const [packages, clients, version] = await Promise.all([
      'catalog/packages.json', 'catalog/clients.json', 'version.json',
    ].map(async file => JSON.parse(await readFile(join(root, file), 'utf8'))));
    validatePackages(packages);
    validateClients(clients);
    validateVersion(version);
    return { packages, clients, version };
  } catch {
    // JSON ayrıştırma hataları kaynak içeriğini veya yerel yolu açığa çıkarmamalı.
    throw invalid();
  }
}
