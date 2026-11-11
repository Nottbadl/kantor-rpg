// Helper respons HTTP untuk fungsi serverless — meniru server/server.mjs
// (send/fail/readJson): JSON selalu no-store, HTML dengan header keamanan.
import { MAX_BODY } from './constants.js';

/** Kirim JSON. Header sama dengan send() di backend asli. */
export function json(res, code, body, extraHeaders = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  return res.status(code).json(body);
}

/** Kirim { error } seperti fail() di backend asli. */
export function fail(res, code, message) {
  return json(res, code, { error: message });
}

/** Kirim HTML (halaman setup). */
export function html(res, code, body, extraHeaders = {}) {
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders,
  });
  res.end(body);
}

export function methodNotAllowed(res) {
  return fail(res, 405, 'Metode tidak didukung.');
}

function parseBodyString(raw, contentType) {
  if (String(contentType ?? '').startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    const e = new Error('JSON tidak sah.');
    e.code = 400;
    throw e;
  }
}

/**
 * Baca body request. Di Vercel, req.body sudah diparse (objek untuk JSON,
 * string/objek untuk form); bila belum, baca dari stream.
 */
export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return parseBodyString(req.body, req.headers?.['content-type']);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const e = new Error('Body terlalu besar.');
      e.code = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return parseBodyString(raw, req.headers?.['content-type']);
}
