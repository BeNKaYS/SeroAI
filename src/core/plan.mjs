export const warnings = Object.freeze([
  'Client capabilities are unverified; this preview does not establish compatibility.',
  'MCP does not imply automatic session capture or native hooks.',
  'Source versions and licenses are unreviewed; nothing will be downloaded or installed.',
]);

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function selectionIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string' || id.trim() === '')) {
    fail('INVALID_SELECTION');
  }
  return [...new Set(ids)];
}

export function createPlan(catalog, options) {
  if (!options || typeof options !== 'object') fail('INVALID_SELECTION');
  const packageIds = selectionIds(options.packageIds);
  const clientIds = selectionIds(options.clientIds);
  const knownPackages = new Set(catalog.packages.map(item => item.id));
  const knownClients = new Set(catalog.clients.map(item => item.id));
  if (packageIds.some(id => !knownPackages.has(id))) fail('UNKNOWN_PACKAGE');
  if (clientIds.some(id => !knownClients.has(id))) fail('UNKNOWN_CLIENT');
  return {
    mode: 'preview',
    changesApplied: false,
    items: packageIds.flatMap(packageId => clientIds.map(clientId => ({
      packageId, clientId, status: 'review-required',
    }))),
    warnings: [...warnings],
  };
}
