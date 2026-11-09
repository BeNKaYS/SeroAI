import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { failure } from '../core/safe-files.mjs';
import { messages } from '../cli/messages.mjs';
import { staticEntry } from './static.mjs';
import { handleApi } from './routes.mjs';

export const BODY_LIMIT = 256 * 1024;
const defaultPublic = fileURLToPath(new URL('./public/', import.meta.url));
const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...securityHeaders, 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value));
}

function sendError(res, code, language = 'tr') {
  const text = messages[language]?.errors?.[code] ?? messages.tr.errors.INTERNAL_ERROR;
  sendJson(res, statusFor(code), { error: { code, message: text } });
}

function statusFor(code) {
  if (code === 'UI_UNAUTHORIZED') return 401;
  if (code === 'UI_FORBIDDEN') return 403;
  if (code === 'UI_NOT_FOUND') return 404;
  if (code === 'UI_METHOD_NOT_ALLOWED') return 405;
  if (['STALE_PLAN', 'CONFLICT', 'WORKSPACE_BUSY', 'RECOVERY_REQUIRED'].includes(code)) return 409;
  if (code === 'UI_PAYLOAD_TOO_LARGE') return 413;
  if (code === 'UI_UNSUPPORTED_MEDIA') return 415;
  if (code === 'INTERNAL_ERROR') return 500;
  if (code === 'UPDATE_SOURCE_UNAVAILABLE') return 502;
  return 400;
}

function tokenMatches(value, token) {
  if (typeof value !== 'string' || value.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(token));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw failure('UI_PAYLOAD_TOO_LARGE');
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body;
  } catch {
    throw failure('UI_INVALID_REQUEST');
  }
}

export async function createUiServer({ root, port = 0, host = '127.0.0.1', publicDirectory = defaultPublic, language = 'tr' } = {}) {
  if (typeof root !== 'string') throw failure('INVALID_ARGUMENTS');
  const token = randomBytes(32).toString('hex');
  let actualPort = 0;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}:${actualPort || port}`);
      const pathname = url.pathname;
      const isApi = pathname.startsWith('/api/');
      if (isApi) {
        if (!tokenMatches(req.headers['x-seroai-token'], token)) return sendError(res, 'UI_UNAUTHORIZED', language);
        let body = null;
        if (req.method !== 'GET') {
          if (!['POST'].includes(req.method)) return sendError(res, 'UI_METHOD_NOT_ALLOWED', language);
          const origin = req.headers.origin;
          const expected = [`http://${host}:${actualPort}`, `http://localhost:${actualPort}`];
          if (typeof origin !== 'string' || !expected.includes(origin)) return sendError(res, 'UI_FORBIDDEN', language);
          const site = req.headers['sec-fetch-site'];
          if (site !== undefined && !['same-origin', 'none'].includes(site)) return sendError(res, 'UI_FORBIDDEN', language);
          if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return sendError(res, 'UI_UNSUPPORTED_MEDIA', language);
          body = await readBody(req);
        }
        const result = await handleApi({ method: req.method, url, root, body, language });
        if (!result) return sendError(res, 'UI_NOT_FOUND', language);
        return sendJson(res, result.status ?? 200, result.body);
      }
      if (req.method !== 'GET') return sendError(res, 'UI_METHOD_NOT_ALLOWED', language);
      const entry = staticEntry(pathname);
      if (!entry) return sendError(res, 'UI_NOT_FOUND', language);
      let content;
      try {
        content = await readFile(join(publicDirectory, entry.file));
      } catch {
        return sendError(res, 'UI_NOT_FOUND', language);
      }
      return send(res, 200, content, entry.type);
    } catch (error) {
      const code = error?.code;
      const known = typeof code === 'string' && Object.hasOwn(messages[language]?.errors ?? messages.tr.errors, code);
      return sendError(res, known ? code : 'INTERNAL_ERROR', language);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      actualPort = server.address().port;
      resolve();
    });
  });

  return {
    url: `http://${host}:${actualPort}/?token=${token}`,
    port: actualPort,
    token,
    close: () => new Promise(resolve => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  };
}
