// Daftar presence dari ROSTER + team-status di Blob.
// Satu-satunya sumber status di versi serverless ini adalah team-status
// (diperbarui PM). Tanpa entri untuk agen itu -> idle, source 'Update PM'.
// Status di luar 4 nilai valid -> entri diabaikan (pakai idle).
import { ROSTER } from '../../server/roster.mjs';
import { VALID_STATUSES } from './constants.js';

const clip = (s, n) => {
  const a = Array.from(String(s ?? '').replace(/\s+/g, ' ').trim());
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join('');
};

export async function buildPresenceList(store) {
  const team = await store.getTeamStatus();
  return ROSTER.map((r) => {
    const entry = team && typeof team === 'object' ? team[r.profile] : null;
    let status = 'idle';
    let summary = '';
    if (entry && typeof entry === 'object' && VALID_STATUSES.has(entry.status)) {
      status = entry.status;
      summary = typeof entry.summary === 'string' ? clip(entry.summary, 70) : '';
    }
    return {
      profile: r.profile,
      name: r.name,
      actorId: r.actorId,
      status,
      source: 'Update PM',
      summary,
      replies: [],
      typing: false,
      lastSeen: null,
    };
  });
}
