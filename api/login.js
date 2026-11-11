// POST /api/login — meniru route /api/login di server/server.mjs:
// rate limit 5 percobaan / 15 menit per "<ip>|<username>", cek username
// dengan sha256 timing-safe, sandi scrypt, TOTP, tolak TOTP yang dipakai
// ulang dalam 120 detik. Sukses -> sesi + Set-Cookie + { ok: true, csrf }.
import crypto from 'node:crypto';
import { verifyPassword, verifyTotp } from '../server/auth.mjs';
import { getDefaultStore } from './_lib/store.js';
import { createSession } from './_lib/session.js';
import { fail, json, methodNotAllowed, readBody } from './_lib/respond.js';
import { LOGIN_MAX, RETENTION } from './_lib/constants.js';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '?';
}

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res);
    let b;
    try {
      b = await readBody(req);
    } catch (e) {
      return fail(res, e.code ?? 400, e.message);
    }
    const owner = await store.getOwner();
    if (!owner) return fail(res, 503, 'Akun owner belum dibuat. Buka tautan setup owner.');
    const key = `${clientIp(req)}|${String(b.username ?? '').slice(0, 40)}`;
    const recent = await store.countRecentAttempts(key, RETENTION.loginWindowMin * 60_000);
    if (recent >= LOGIN_MAX) {
      return fail(res, 429, `Terlalu banyak percobaan. Coba lagi ${RETENTION.loginWindowMin} menit lagi.`);
    }
    const userOk =
      typeof b.username === 'string' &&
      b.username.length < 60 &&
      crypto.timingSafeEqual(sha256(b.username), sha256(owner.username));
    const pwOk = verifyPassword(String(b.password ?? '').slice(0, 200), owner.passwordHash);
    const codeOk = verifyTotp(owner.totpSecret, b.code);
    const usedKey = `${owner.username}|${b.code}`;
    const reused = await store.isTotpUsed(usedKey);
    if (!(userOk && pwOk && codeOk) || reused) {
      await store.recordLoginAttempt(key);
      return fail(res, 401, 'Nama, sandi, atau kode 2FA salah.');
    }
    const { cookie, csrf } = await createSession(store, req.headers?.['user-agent']);
    await store.clearLoginAttempts(key);
    await store.markTotpUsed(usedKey);
    return json(res, 200, { ok: true, csrf }, { 'Set-Cookie': cookie });
  };
}

export default createHandler();
