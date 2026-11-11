// POST /api/logout — sesi + CSRF wajib. Hapus sesi, clear cookie.
import { getDefaultStore } from './_lib/store.js';
import { csrfCheck, deleteSession, requireSession } from './_lib/session.js';
import { fail, json, methodNotAllowed } from './_lib/respond.js';

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return methodNotAllowed(res);
    const session = await requireSession(req, store);
    if (!session) return fail(res, 401, 'Perlu login owner.');
    if (!csrfCheck(req, session)) return fail(res, 403, 'CSRF tidak valid.');
    const clearCookie = await deleteSession(req, store);
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
  };
}

export default createHandler();
