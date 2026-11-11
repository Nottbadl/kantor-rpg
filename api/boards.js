// GET /api/boards — sesi wajib. Versi serverless tidak punya Kanban,
// handoff, atau agent.log, jadi ketiga papan kosong dengan sumber yang
// jujur. Bentuk respons sama dengan buildBoards() di backend asli.
import { getDefaultStore } from './_lib/store.js';
import { requireSession } from './_lib/session.js';
import { fail, json, methodNotAllowed } from './_lib/respond.js';

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return methodNotAllowed(res);
    const session = await requireSession(req, store);
    if (!session) return fail(res, 401, 'Perlu login owner.');
    return json(res, 200, {
      observedAt: new Date().toISOString(),
      mode: 'private',
      handoffs: { ok: true, source: 'Serverless (tidak ada tugas RPG)', items: [] },
      tasks: { ok: true, source: 'Serverless (tidak ada tugas RPG)', items: [] },
      log: { ok: true, source: 'Serverless (tidak ada log agen)', items: [] },
    });
  };
}

export default createHandler();
