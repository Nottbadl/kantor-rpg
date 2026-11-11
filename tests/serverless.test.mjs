// Tes serverless (node:test) — memakai shim storage berbasis filesystem
// lokal, TIDAK memanggil Vercel Blob asli.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { totp } from '../server/auth.mjs';
import { createStore } from '../api/_lib/store.js';
import { createSetupToken } from '../api/_lib/setup.js';
import { createHandler as createMe } from '../api/me.js';
import { createHandler as createLogin } from '../api/login.js';
import { createHandler as createLogout } from '../api/logout.js';
import { createHandler as createPresence } from '../api/presence.js';
import { createHandler as createAgents } from '../api/agents.js';
import { createHandler as createBoards } from '../api/boards.js';
import { createHandler as createSetup } from '../api/setup.js';
import { createHandler as createTeamStatus } from '../api/team-status.js';
// Default export tiap endpoint harus bisa di-import tanpa token Blob.
import meDefault from '../api/me.js';
import loginDefault from '../api/login.js';
import setupDefault from '../api/setup.js';

const PASSWORD = 'sandi-yang-sangat-panjang-123';
const USERNAME = 'jullian';

/** Shim storage { get, put, del } di atas filesystem lokal. */
function createFsStorage(dir) {
  return {
    async get(key) {
      try {
        return await fs.promises.readFile(path.join(dir, key), 'utf8');
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const p = path.join(dir, key);
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      await fs.promises.writeFile(p, value, 'utf8');
    },
    async del(key) {
      try {
        await fs.promises.unlink(path.join(dir, key));
      } catch {
        /* belum ada: bukan error */
      }
    },
  };
}

function mockReq({ method = 'GET', url = '/api/me', headers = {}, body = undefined, ip = '127.0.0.1' } = {}) {
  return { method, url, headers: { ...headers }, body, socket: { remoteAddress: ip } };
}

class MockRes {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = '';
    this.jsonBody = undefined;
  }
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(obj) {
    this.jsonBody = obj;
    this.body = JSON.stringify(obj);
    this.setHeader('content-type', 'application/json; charset=utf-8');
    return this;
  }
  writeHead(code, headers = {}) {
    this.statusCode = code;
    for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    return this;
  }
  end(data) {
    if (data !== undefined) this.body = String(data);
    return this;
  }
}

async function freshStore(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kantor-test-'));
  t.after(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
  return createStore(createFsStorage(dir));
}

/** Jalankan alur setup sampai owner terbentuk; kembalikan kredensial tes. */
async function makeOwner(store, username = USERNAME, password = PASSWORD) {
  const setupPath = await createSetupToken(username, store);
  const token = new URL(setupPath, 'http://x').searchParams.get('t');
  const setup = await store.getSetup();
  const code = totp(setup.totpSecret);
  const body = new URLSearchParams({ t: token, password, password2: password, code }).toString();
  const res = new MockRes();
  await createSetup(store)(mockReq({
    method: 'POST',
    url: '/api/setup',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }), res);
  assert.equal(res.statusCode, 200, `setup gagal: ${res.body.slice(0, 200)}`);
  assert.match(res.body, /Owner siap/);
  return { username, password, totpSecret: setup.totpSecret };
}

/** Login; kembalikan { res, cookie, csrf }. */
async function doLogin(store, { username, password, code, ip = '127.0.0.1' }) {
  const res = new MockRes();
  await createLogin(store)(mockReq({
    method: 'POST',
    url: '/api/login',
    headers: { 'content-type': 'application/json' },
    body: { username, password, code },
    ip,
  }), res);
  const setCookie = res.headers['set-cookie'] ?? '';
  const cookie = String(setCookie).split(';')[0];
  return { res, cookie, csrf: res.jsonBody?.csrf ?? null };
}

function authHeaders(cookie, csrf) {
  const h = { cookie };
  if (csrf) h['x-csrf'] = csrf;
  return h;
}

test('default export tiap endpoint bisa di-import (tanpa token Blob)', () => {
  assert.equal(typeof meDefault, 'function');
  assert.equal(typeof loginDefault, 'function');
  assert.equal(typeof setupDefault, 'function');
});

test('setup GET token valid -> 200 halaman; POST -> owner terbentuk', async (t) => {
  const store = await freshStore(t);
  const setupPath = await createSetupToken(USERNAME, store);
  const token = new URL(setupPath, 'http://x').searchParams.get('t');
  const getRes = new MockRes();
  await createSetup(store)(mockReq({ method: 'GET', url: setupPath }), getRes);
  assert.equal(getRes.statusCode, 200);
  assert.match(getRes.body, /Setup owner kantor-rpg/);
  assert.match(getRes.body, /otpauth|Ketik kunci ini/);

  const setup = await store.getSetup();
  const code = totp(setup.totpSecret);
  const postRes = new MockRes();
  await createSetup(store)(mockReq({
    method: 'POST',
    url: '/api/setup',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: token, password: PASSWORD, password2: PASSWORD, code }).toString(),
  }), postRes);
  assert.equal(postRes.statusCode, 200);
  assert.match(postRes.body, /Owner siap/);
  const owner = await store.getOwner();
  assert.equal(owner.username, USERNAME);
  assert.match(owner.passwordHash, /^scrypt\$/);
  assert.equal(owner.totpSecret, setup.totpSecret);
  assert.equal(await store.getSetup(), null);
});

test('setup GET token salah -> 410; GET setelah owner ada -> 410', async (t) => {
  const store = await freshStore(t);
  const badRes = new MockRes();
  await createSetup(store)(mockReq({ method: 'GET', url: '/api/setup?t=tidak-valid' }), badRes);
  assert.equal(badRes.statusCode, 410);
  assert.match(badRes.body, /Tautan setup tidak berlaku/);

  await makeOwner(store);
  const setupPath = await createSetupToken(USERNAME, store);
  const againRes = new MockRes();
  await createSetup(store)(mockReq({ method: 'GET', url: setupPath }), againRes);
  assert.equal(againRes.statusCode, 410);
});

test('setup POST sandi pendek / tidak sama -> 400; kode TOTP salah -> 400', async (t) => {
  const store = await freshStore(t);
  const setupPath = await createSetupToken(USERNAME, store);
  const token = new URL(setupPath, 'http://x').searchParams.get('t');
  const setup = await store.getSetup();

  const shortRes = new MockRes();
  await createSetup(store)(mockReq({
    method: 'POST',
    url: '/api/setup',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: token, password: 'pendek', password2: 'pendek', code: totp(setup.totpSecret) }).toString(),
  }), shortRes);
  assert.equal(shortRes.statusCode, 400);
  assert.match(shortRes.body, /minimal 12 karakter/);

  const badCodeRes = new MockRes();
  await createSetup(store)(mockReq({
    method: 'POST',
    url: '/api/setup',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: token, password: PASSWORD, password2: PASSWORD, code: '000000' }).toString(),
  }), badCodeRes);
  assert.equal(badCodeRes.statusCode, 400);
  assert.match(badCodeRes.body, /Kode 2FA salah/);
});

test('login sebelum owner ada -> 503', async (t) => {
  const store = await freshStore(t);
  const { res } = await doLogin(store, { username: USERNAME, password: PASSWORD, code: '123456' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.jsonBody.error, 'Akun owner belum dibuat. Buka tautan setup owner.');
});

test('login sukses -> 200 + cookie + csrf; me authenticated', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const { res, cookie, csrf } = await doLogin(store, { username: USERNAME, password, code: totp(totpSecret) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonBody.ok, true);
  assert.ok(csrf);
  assert.match(res.headers['set-cookie'], /^kr_sess=[^;]+; Path=\/api; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);

  const meRes = new MockRes();
  await createMe(store)(mockReq({ method: 'GET', url: '/api/me', headers: { cookie } }), meRes);
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.jsonBody.authenticated, true);
  assert.equal(meRes.jsonBody.configured, true);
  assert.equal(meRes.jsonBody.csrf, csrf);
  assert.equal(meRes.jsonBody.mode, 'private');
  assert.deepEqual(meRes.jsonBody.retention, { messagesDays: 30, auditDays: 90, sessionHours: 12, loginWindowMin: 15 });
  assert.deepEqual(meRes.jsonBody.limits, { messageChars: 4000, optionLabelChars: 80, optionMessageChars: 600, approvalMinutes: 15, turnMinutes: 60, queuePerProfile: 5 });
});

test('login gagal: username salah / sandi salah -> 401', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const badUser = await doLogin(store, { username: 'bukan-owner', password, code: totp(totpSecret) });
  assert.equal(badUser.res.statusCode, 401);
  assert.equal(badUser.res.jsonBody.error, 'Nama, sandi, atau kode 2FA salah.');
  const badPw = await doLogin(store, { username: USERNAME, password: 'sandi-yang-salah-sekali', code: totp(totpSecret) });
  assert.equal(badPw.res.statusCode, 401);
});

test('login: kode TOTP dipakai ulang -> 401', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const code = totp(totpSecret);
  const first = await doLogin(store, { username: USERNAME, password, code });
  assert.equal(first.res.statusCode, 200);
  const second = await doLogin(store, { username: USERNAME, password, code });
  assert.equal(second.res.statusCode, 401);
});

test('login: 5x gagal -> percobaan ke-6 429', async (t) => {
  const store = await freshStore(t);
  await makeOwner(store);
  for (let i = 0; i < 5; i++) {
    const { res } = await doLogin(store, { username: USERNAME, password: 'salah', code: '000000' });
    assert.equal(res.statusCode, 401, `percobaan ${i + 1} harus 401`);
  }
  const { res } = await doLogin(store, { username: USERNAME, password: 'salah', code: '000000' });
  assert.equal(res.statusCode, 429);
  assert.match(res.jsonBody.error, /Terlalu banyak percobaan/);
});

test('me tanpa sesi -> authenticated false; presence/agents/boards tanpa sesi -> 401', async (t) => {
  const store = await freshStore(t);
  await makeOwner(store);
  const meRes = new MockRes();
  await createMe(store)(mockReq({ method: 'GET', url: '/api/me' }), meRes);
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.jsonBody.authenticated, false);
  assert.equal(meRes.jsonBody.configured, true);
  assert.equal(meRes.jsonBody.csrf, null);

  for (const [name, handler, url] of [
    ['presence', createPresence, '/api/presence'],
    ['agents', createAgents, '/api/agents'],
    ['boards', createBoards, '/api/boards'],
  ]) {
    const res = new MockRes();
    await handler(store)(mockReq({ method: 'GET', url }), res);
    assert.equal(res.statusCode, 401, `${name} tanpa sesi harus 401`);
    assert.equal(res.jsonBody.error, 'Perlu login owner.');
  }
});

test('presence/agents/boards dengan sesi -> 200, bentuk benar, semua idle', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const { cookie } = await doLogin(store, { username: USERNAME, password, code: totp(totpSecret) });
  const headers = { cookie };

  const pRes = new MockRes();
  await createPresence(store)(mockReq({ method: 'GET', url: '/api/presence', headers }), pRes);
  assert.equal(pRes.statusCode, 200);
  assert.equal(pRes.jsonBody.agents.length, 4);
  assert.deepEqual(pRes.jsonBody.agents.map((a) => a.profile), ['muse', 'asep', 'udin', 'barong']);
  for (const a of pRes.jsonBody.agents) {
    assert.equal(a.status, 'idle');
    assert.equal(a.source, 'Update PM');
    assert.equal(a.summary, '');
    assert.deepEqual(a.replies, []);
    assert.equal(a.typing, false);
    assert.equal(a.lastSeen, null);
  }
  assert.ok(Date.parse(pRes.jsonBody.observedAt));

  const aRes = new MockRes();
  await createAgents(store)(mockReq({ method: 'GET', url: '/api/agents', headers }), aRes);
  assert.equal(aRes.statusCode, 200);
  assert.equal(aRes.jsonBody.agents.length, 4);
  assert.equal(aRes.jsonBody.agents[0].name, 'Muse');
  assert.deepEqual(aRes.jsonBody.agents[0].tasks, {});

  const bRes = new MockRes();
  await createBoards(store)(mockReq({ method: 'GET', url: '/api/boards', headers }), bRes);
  assert.equal(bRes.statusCode, 200);
  assert.equal(bRes.jsonBody.mode, 'private');
  for (const board of [bRes.jsonBody.handoffs, bRes.jsonBody.tasks, bRes.jsonBody.log]) {
    assert.equal(board.ok, true);
    assert.deepEqual(board.items, []);
  }
});

test('team-status POST lalu presence mencerminkan status baru', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const { cookie, csrf } = await doLogin(store, { username: USERNAME, password, code: totp(totpSecret) });

  const postRes = new MockRes();
  await createTeamStatus(store)(mockReq({
    method: 'POST',
    url: '/api/team-status',
    headers: { ...authHeaders(cookie, csrf), 'content-type': 'application/json' },
    body: { muse: { status: 'working', summary: 'PM: kerjakan Task 4' }, barong: { status: 'waiting', summary: 'Menunggu hasil' } },
  }), postRes);
  assert.equal(postRes.statusCode, 200);
  assert.deepEqual(postRes.jsonBody, { ok: true });

  const getRes = new MockRes();
  await createTeamStatus(store)(mockReq({ method: 'GET', url: '/api/team-status', headers: { cookie } }), getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.jsonBody.muse.status, 'working');
  assert.equal(getRes.jsonBody.barong.status, 'waiting');

  const pRes = new MockRes();
  await createPresence(store)(mockReq({ method: 'GET', url: '/api/presence', headers: { cookie } }), pRes);
  const byProfile = Object.fromEntries(pRes.jsonBody.agents.map((a) => [a.profile, a]));
  assert.equal(byProfile.muse.status, 'working');
  assert.equal(byProfile.muse.summary, 'PM: kerjakan Task 4');
  assert.equal(byProfile.barong.status, 'waiting');
  assert.equal(byProfile.asep.status, 'idle');
  assert.equal(byProfile.udin.status, 'idle');
});

test('team-status POST tidak valid -> 400; tanpa CSRF -> 403', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const { cookie, csrf } = await doLogin(store, { username: USERNAME, password, code: totp(totpSecret) });

  const badProfile = new MockRes();
  await createTeamStatus(store)(mockReq({
    method: 'POST',
    url: '/api/team-status',
    headers: { ...authHeaders(cookie, csrf), 'content-type': 'application/json' },
    body: { budi: { status: 'working', summary: 'x' } },
  }), badProfile);
  assert.equal(badProfile.statusCode, 400);

  const badStatus = new MockRes();
  await createTeamStatus(store)(mockReq({
    method: 'POST',
    url: '/api/team-status',
    headers: { ...authHeaders(cookie, csrf), 'content-type': 'application/json' },
    body: { muse: { status: 'tidur', summary: 'x' } },
  }), badStatus);
  assert.equal(badStatus.statusCode, 400);

  const noCsrf = new MockRes();
  await createTeamStatus(store)(mockReq({
    method: 'POST',
    url: '/api/team-status',
    headers: { cookie, 'content-type': 'application/json' },
    body: { muse: { status: 'working', summary: 'x' } },
  }), noCsrf);
  assert.equal(noCsrf.statusCode, 403);
  assert.equal(noCsrf.jsonBody.error, 'CSRF tidak valid.');
});

test('logout lalu me unauthenticated dan presence 401', async (t) => {
  const store = await freshStore(t);
  const { password, totpSecret } = await makeOwner(store);
  const { cookie, csrf } = await doLogin(store, { username: USERNAME, password, code: totp(totpSecret) });

  const outRes = new MockRes();
  await createLogout(store)(mockReq({
    method: 'POST',
    url: '/api/logout',
    headers: authHeaders(cookie, csrf),
  }), outRes);
  assert.equal(outRes.statusCode, 200);
  assert.deepEqual(outRes.jsonBody, { ok: true });
  assert.match(outRes.headers['set-cookie'], /Max-Age=0/);

  const meRes = new MockRes();
  await createMe(store)(mockReq({ method: 'GET', url: '/api/me', headers: { cookie } }), meRes);
  assert.equal(meRes.jsonBody.authenticated, false);
  assert.equal(meRes.jsonBody.csrf, null);

  const pRes = new MockRes();
  await createPresence(store)(mockReq({ method: 'GET', url: '/api/presence', headers: { cookie } }), pRes);
  assert.equal(pRes.statusCode, 401);
});
