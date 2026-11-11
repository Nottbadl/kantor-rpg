// GET /api/me — tanpa auth. Meniru route /api/me di server/server.mjs.
import { getDefaultStore } from './_lib/store.js';
import { getSession } from './_lib/session.js';
import { json, methodNotAllowed } from './_lib/respond.js';
import { LIMITS, RETENTION } from './_lib/constants.js';

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return methodNotAllowed(res);
    const session = await getSession(req, store);
    const owner = await store.getOwner();
    return json(res, 200, {
      mode: 'private',
      configured: !!owner,
      authenticated: !!session,
      csrf: session?.csrf ?? null,
      retention: RETENTION,
      limits: LIMITS,
    });
  };
}

export default createHandler();
