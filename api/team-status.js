// GET + POST /api/team-status — status tim untuk presence (owner saja).
// GET: isi team-status saat ini ({} bila belum ada).
// POST: body JSON { "<profile>": { status, summary } }; hanya profile di
// ROSTER dan status working|waiting|idle|unknown yang diterima.
// Update bersifat merge per-profile (profile lain tidak ikut terhapus).
import { ROSTER } from '../server/roster.mjs';
import { getDefaultStore } from './_lib/store.js';
import { csrfCheck, requireSession } from './_lib/session.js';
import { fail, json, methodNotAllowed, readBody } from './_lib/respond.js';
import { VALID_STATUSES } from './_lib/constants.js';

const PROFILES = new Set(ROSTER.map((r) => r.profile));

export function createHandler(store = getDefaultStore()) {
  return async function handler(req, res) {
    const session = await requireSession(req, store);
    if (!session) return fail(res, 401, 'Perlu login owner.');
    if (req.method === 'GET') {
      const current = (await store.getTeamStatus()) ?? {};
      return json(res, 200, current);
    }
    if (req.method === 'POST') {
      if (!csrfCheck(req, session)) return fail(res, 403, 'CSRF tidak valid.');
      let b;
      try {
        b = await readBody(req);
      } catch (e) {
        return fail(res, e.code ?? 400, e.message);
      }
      for (const [profile, entry] of Object.entries(b)) {
        if (
          !PROFILES.has(profile) ||
          !entry ||
          typeof entry !== 'object' ||
          !VALID_STATUSES.has(entry.status) ||
          (entry.summary !== undefined && typeof entry.summary !== 'string')
        ) {
          return fail(res, 400, 'Profil atau status tidak sah.');
        }
      }
      const current = (await store.getTeamStatus()) ?? {};
      const next = { ...current };
      for (const [profile, entry] of Object.entries(b)) {
        next[profile] = { status: entry.status, summary: typeof entry.summary === 'string' ? entry.summary : '' };
      }
      await store.putTeamStatus(next);
      return json(res, 200, { ok: true });
    }
    return methodNotAllowed(res);
  };
}

export default createHandler();
