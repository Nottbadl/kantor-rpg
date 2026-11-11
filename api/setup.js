// GET + POST /api/setup — halaman setup owner sekali pakai.
// Meniru route /api/setup + setupState() di server/server.mjs.
// GET ?t=<token>: token tidak cocok/kedaluwarsa/owner sudah ada -> 410.
// POST (form-urlencoded atau JSON: t, password, password2, code):
// token tidak valid -> 410; sandi <12 / tidak sama -> 400;
// kode TOTP salah -> 400; sukses -> owner tersimpan, setup dihapus.
import crypto from 'node:crypto';
import { hashPassword, verifyTotp } from '../server/auth.mjs';
import { setupPage } from './_lib/setup-page.js';
import { getDefaultStore } from './_lib/store.js';
import { html, methodNotAllowed, readBody, fail } from './_lib/respond.js';

const SETUP_CSP = { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'self'" };

async function setupState(t, store) {
  const st = await store.getSetup();
  if (!st) return null;
  if (typeof st.expires !== 'number' || st.expires < Date.now()) return null;
  const owner = await store.getOwner();
  if (owner) return null;
  if (typeof st.tokenHash !== 'string') return null;
  const h = crypto.createHash('sha256').update(String(t ?? '')).digest('hex');
  if (h.length !== st.tokenHash.length) return null;
  try {
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(st.tokenHash)) ? st : null;
  } catch {
    return null;
  }
}

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/api/setup', 'http://x');
      const t = url.searchParams.get('t');
      const st = await setupState(t, store);
      if (!st) {
        return html(res, 410, await setupPage({ error: 'Tautan setup tidak berlaku (kedaluwarsa, salah, atau owner sudah dibuat).' }));
      }
      return html(res, 200, await setupPage({ secret: st.totpSecret, username: st.username, token: t }), SETUP_CSP);
    }
    if (req.method === 'POST') {
      let b;
      try {
        b = await readBody(req);
      } catch (e) {
        return fail(res, e.code ?? 400, e.message);
      }
      const st = await setupState(b.t, store);
      if (!st) return html(res, 410, await setupPage({ error: 'Tautan setup tidak berlaku.' }));
      const pw = String(b.password ?? '');
      if (pw.length < 12 || pw !== String(b.password2 ?? '')) {
        return html(res, 400, await setupPage({ secret: st.totpSecret, username: st.username, token: b.t, error: 'Sandi minimal 12 karakter dan kedua isian harus sama.' }));
      }
      if (!verifyTotp(st.totpSecret, b.code)) {
        return html(res, 400, await setupPage({ secret: st.totpSecret, username: st.username, token: b.t, error: 'Kode 2FA salah. Pastikan jam HP benar lalu coba kode terbaru.' }));
      }
      await store.putOwner({ username: st.username, passwordHash: hashPassword(pw), totpSecret: st.totpSecret });
      await store.deleteSetup();
      return html(res, 200, await setupPage({ done: true }));
    }
    return methodNotAllowed(res);
  };
}

export default createHandler();
