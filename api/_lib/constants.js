// Konstanta yang dipakai /api/me — nilai persis dari server/store.mjs
// (RETENTION) dan server/policy.mjs (LIMITS) di backend asli.
export const RETENTION = { messagesDays: 30, auditDays: 90, sessionHours: 12, loginWindowMin: 15 };
export const LIMITS = { messageChars: 4000, optionLabelChars: 80, optionMessageChars: 600, approvalMinutes: 15, turnMinutes: 60, queuePerProfile: 5 };
export const LOGIN_MAX = 5;
export const VALID_STATUSES = new Set(['working', 'waiting', 'idle', 'unknown']);
export const SESSION_HOURS = 12;
export const TOTP_REUSE_WINDOW_MS = 120_000;
export const MAX_BODY = 16 * 1024;
