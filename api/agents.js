// GET /api/agents — sesi wajib. Roster + tasks kosong (tidak ada tugas RPG
// di versi serverless).
import { ROSTER } from '../server/roster.mjs';
import { getDefaultStore } from './_lib/store.js';
import { requireSession } from './_lib/session.js';
import { fail, json, methodNotAllowed } from './_lib/respond.js';

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return methodNotAllowed(res);
    const session = await requireSession(req, store);
    if (!session) return fail(res, 401, 'Perlu login owner.');
    return json(res, 200, { agents: ROSTER.map((r) => ({ ...r, tasks: {} })) });
  };
}

export default createHandler();
