// GET /api/presence — sesi wajib. Status tim dari team-status (Blob).
import { getDefaultStore } from './_lib/store.js';
import { requireSession } from './_lib/session.js';
import { fail, json, methodNotAllowed } from './_lib/respond.js';
import { buildPresenceList } from './_lib/presence.js';

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return methodNotAllowed(res);
    const session = await requireSession(req, store);
    if (!session) return fail(res, 401, 'Perlu login owner.');
    const agents = await buildPresenceList(store);
    return json(res, 200, { observedAt: new Date().toISOString(), agents });
  };
}

export default createHandler();
