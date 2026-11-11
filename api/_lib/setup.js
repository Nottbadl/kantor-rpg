// Util setup owner untuk versi serverless (dipakai dari luar, bukan oleh
// frontend): membuat setup.json di Blob dan mengembalikan path tautan
// sekali pakai. Meniru createSetup() di server/server.mjs.
import crypto from 'node:crypto';
import { base32Encode, token } from '../../server/auth.mjs';
import { getDefaultStore } from './store.js';

/**
 * Buat token setup owner sekali pakai (berlaku `hours` jam, default 24).
 * @returns {Promise<string>} path `/api/setup?t=<token mentah>`
 */
export async function createSetupToken(username, store = getDefaultStore(), hours = 24) {
  const t = token(24);
  const totpSecret = base32Encode(crypto.randomBytes(20));
  await store.putSetup({
    tokenHash: crypto.createHash('sha256').update(t).digest('hex'),
    totpSecret,
    username,
    expires: Date.now() + hours * 3600_000,
  });
  return `/api/setup?t=${t}`;
}
