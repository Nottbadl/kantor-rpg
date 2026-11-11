// Penyimpanan state serverless di Vercel Blob (semua blob PRIVATE —
// access: 'private', jadi tidak bisa dibaca lewat URL publik).
// Kunci blob (prefix `kantor/`):
//   kantor/owner.json, kantor/setup.json, kantor/team-status.json,
//   kantor/sessions/<sha256(sid)>.json,
//   kantor/login-attempts/<sha256(key)>.json,
//   kantor/used-totp/<sha256(key)[0..16]>.json
// Semua operasi tahan terhadap "belum ada": baca blob yang tidak ada = null.
//
// Untuk tes, buat store dengan storage injeksi:
//   createStore({ get, put, del })  — get mengembalikan string|null.
// Tanpa argumen, dipakai implementasi Blob (butuh BLOB_READ_WRITE_TOKEN).
import crypto from 'node:crypto';
import { del as blobDel, get as blobGet, put as blobPut } from '@vercel/blob';
import { LOGIN_MAX, RETENTION, TOTP_REUSE_WINDOW_MS } from './constants.js';

const KEYS = {
  owner: 'kantor/owner.json',
  setup: 'kantor/setup.json',
  teamStatus: 'kantor/team-status.json',
  session: (idHash) => `kantor/sessions/${idHash}.json`,
  loginAttempts: (keyHash) => `kantor/login-attempts/${keyHash}.json`,
  usedTotp: (hash16) => `kantor/used-totp/${hash16}.json`,
};

const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Storage Blob: get/put/del atas pathname. get mengembalikan null bila belum ada. */
export function createBlobStorage() {
  const token = () => process.env.BLOB_READ_WRITE_TOKEN;
  return {
    async get(key) {
      const result = await blobGet(key, { access: 'private', useCache: false, token: token() });
      if (!result) return null;
      return await new Response(result.stream).text();
    },
    async put(key, value) {
      await blobPut(key, value, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token: token(),
      });
    },
    async del(key) {
      try {
        await blobDel(key, { token: token() });
      } catch (e) {
        // Menghapus yang belum ada bukan error.
        if (e?.name === 'BlobNotFoundError') return;
        throw e;
      }
    },
  };
}

/**
 * Store domain di atas storage generik. Semua fungsi mengembalikan null
 * (bukan throw) bila datanya belum ada.
 */
export function createStore(storage = createBlobStorage()) {
  const getJson = async (key) => {
    const raw = await storage.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const putJson = (key, value) => storage.put(key, JSON.stringify(value));

  return {
    storage,

    getOwner: () => getJson(KEYS.owner),
    putOwner: (owner) => putJson(KEYS.owner, owner),

    getSetup: () => getJson(KEYS.setup),
    putSetup: (setup) => putJson(KEYS.setup, setup),
    deleteSetup: () => storage.del(KEYS.setup),

    getSession: (idHash) => getJson(KEYS.session(idHash)),
    putSession: (idHash, session) => putJson(KEYS.session(idHash), session),
    deleteSession: (idHash) => storage.del(KEYS.session(idHash)),

    getTeamStatus: () => getJson(KEYS.teamStatus),
    putTeamStatus: (status) => putJson(KEYS.teamStatus, status),

    recordLoginAttempt: async (key) => {
      const k = KEYS.loginAttempts(sha256hex(key));
      const rec = (await getJson(k)) ?? { attempts: [] };
      const attempts = Array.isArray(rec.attempts) ? rec.attempts : [];
      attempts.push(Date.now());
      await putJson(k, { attempts });
    },
    countRecentAttempts: async (key, windowMs = RETENTION.loginWindowMin * 60_000) => {
      const rec = await getJson(KEYS.loginAttempts(sha256hex(key)));
      if (!rec || !Array.isArray(rec.attempts)) return 0;
      const cutoff = Date.now() - windowMs;
      return rec.attempts.filter((t) => typeof t === 'number' && t > cutoff).length;
    },
    clearLoginAttempts: (key) => storage.del(KEYS.loginAttempts(sha256hex(key))),
    /** Jumlah maksimal percobaan login dalam jendela (sama dengan backend asli). */
    loginMax: LOGIN_MAX,

    /** Tandai kode TOTP sudah dipakai (anti replay, jendela 120 detik). */
    markTotpUsed: (key) => putJson(KEYS.usedTotp(sha256hex(key).slice(0, 16)), { at: Date.now() }),
    isTotpUsed: async (key) => {
      const rec = await getJson(KEYS.usedTotp(sha256hex(key).slice(0, 16)));
      return !!rec && typeof rec.at === 'number' && rec.at > Date.now() - TOTP_REUSE_WINDOW_MS;
    },
  };
}

let defaultStore = null;
/** Store default (Blob). Dibuat malas — konstruksinya tidak menyentuh jaringan. */
export function getDefaultStore() {
  if (!defaultStore) defaultStore = createStore();
  return defaultStore;
}
