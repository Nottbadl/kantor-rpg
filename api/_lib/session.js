// Cookie + sesi owner — meniru persis server/server.mjs:
// cookie `kr_sess=<sid>; Path=/api; HttpOnly; SameSite=Strict;
// Max-Age=<detik>; Secure` (Secure selalu, karena Vercel HTTPS).
// sid = token(32); sesi disimpan dengan id = sha256(sid); csrf = token(18);
// masa sesi 12 jam.
import crypto from 'node:crypto';
import { token } from '../../server/auth.mjs';
import { SESSION_HOURS } from './constants.js';

export const SESSION_COOKIE = 'kr_sess';
export const SESSION_MAX_AGE_S = SESSION_HOURS * 3600;

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers?.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookieValue(sid, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${sid}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}; Secure`;
}

export function clearSessionCookieValue() {
  return sessionCookieValue('', 0);
}

const sessionIdHash = (sid) => crypto.createHash('sha256').update(sid).digest('hex');

/** Sesi dari cookie, atau null bila tidak ada/kedaluwarsa. */
export async function getSession(req, store) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid || typeof sid !== 'string' || sid.length > 100) return null;
  const rec = await store.getSession(sessionIdHash(sid));
  if (!rec || typeof rec.expiresAt !== 'number' || rec.expiresAt < Date.now()) return null;
  return { ...rec, id: sessionIdHash(sid) };
}

/** Buat sesi baru. Mengembalikan { cookie, csrf } untuk respons login. */
export async function createSession(store, ua) {
  const sid = token(32);
  const csrf = token(18);
  const now = Date.now();
  await store.putSession(sessionIdHash(sid), {
    csrf,
    createdAt: now,
    expiresAt: now + SESSION_HOURS * 3600_000,
    ua: String(ua ?? '').slice(0, 120),
  });
  return { cookie: sessionCookieValue(sid, SESSION_MAX_AGE_S), csrf };
}

/** Hapus sesi dari cookie request. Mengembalikan nilai cookie penghapus. */
export async function deleteSession(req, store) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (sid && typeof sid === 'string' && sid.length <= 100) {
    await store.deleteSession(sessionIdHash(sid));
  }
  return clearSessionCookieValue();
}

/** Sesi yang wajib ada — null bila tidak ada (pemanggil mengirim 401). */
export async function requireSession(req, store) {
  return getSession(req, store);
}

/** Cek header X-CSRF terhadap csrf sesi (timing-safe, seperti backend asli). */
export function csrfCheck(req, session) {
  if (!session) return false;
  const h = req.headers?.['x-csrf'];
  if (typeof h !== 'string' || h.length !== session.csrf.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(session.csrf));
  } catch {
    return false;
  }
}
