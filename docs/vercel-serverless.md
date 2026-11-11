# Kantor-RPG — Backend Serverless di Vercel

Port sebagian dari backend privat (`server/`, satu proses Node yang jalan
terus) ke Vercel Serverless Functions + Vercel Blob. Hanya bagian yang
dibutuhkan kantor 3D yang di-port; sisanya tetap tidak ada.

## Yang di-deploy

- **Frontend statis**: `app/dist` (Vite build) — lihat `vercel.json`:
  `buildCommand: "cd app && npm ci && npm run build"`,
  `outputDirectory: "app/dist"`.
- **Fungsi API** di `api/` (Node ESM, `export default handler`).
  Vercel mendeteksinya otomatis; dependensi dari `package.json` di root
  (`@vercel/blob`, `qrcode`).

## Endpoint

| Route | Metode | Auth | Keterangan |
| --- | --- | --- | --- |
| `/api/me` | GET | — | `{ mode:'private', configured, authenticated, csrf, retention, limits }` |
| `/api/login` | POST | — | JSON `{ username, password, code }` -> `{ ok:true, csrf }` + cookie sesi |
| `/api/logout` | POST | sesi + CSRF | Hapus sesi, clear cookie |
| `/api/presence` | GET | sesi | `{ observedAt, agents: [...] }` dari team-status |
| `/api/agents` | GET | sesi | Roster + `tasks: {}` |
| `/api/boards` | GET | sesi | Ketiga papan kosong (tidak ada tugas RPG) |
| `/api/setup` | GET/POST | — | Halaman setup owner sekali pakai (form + QR TOTP) |
| `/api/team-status` | GET/POST | sesi (+CSRF untuk POST) | Baca/tulis status tim |

Semua respons JSON memakai `Cache-Control: no-store`. Cookie sesi:
`kr_sess=<sid>; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200; Secure`.
CSRF: header `X-CSRF` harus sama dengan `csrf` dari `/api/me` di setiap POST
ber-auth (pesan 403: `CSRF tidak valid.`).

## State di Vercel Blob (semua PRIVATE)

Prefix `kantor/`, semua blob dibuat dengan `access: 'private'` (tidak bisa
dibaca lewat URL publik):

- `kantor/owner.json` — `{ username, passwordHash, totpSecret }`
- `kantor/setup.json` — `{ tokenHash, totpSecret, username, expires }`
- `kantor/sessions/<sha256(sid)>.json` — `{ csrf, createdAt, expiresAt, ua }`
- `kantor/team-status.json` — `{ "<profile>": { status, summary } }`
- `kantor/login-attempts/<sha256(key)>.json` — `{ attempts: [timestampMs] }`
- `kantor/used-totp/<hash16>.json` — `{ at }` (anti replay TOTP, 120 detik)

Butuh env `BLOB_READ_WRITE_TOKEN` di project Vercel (dibuat dari dashboard
Vercel: Storage → Blob). Tanpa token, semua endpoint yang membaca state
gagal dengan error SDK yang jelas.

## Yang TIDAK di-port

- Chat agen / percakapan / dispatcher / Hermes CLI
- Telegram (sinkronisasi, transcript, perintah)
- Kanban (tugas, handoff, event) dan `agent.log`
- Push notification, media, uploads, pencarian
- Cek origin dan header proxy `x-kantor-proxy` dari backend asli (di Vercel
  tidak ada nginx; perlindungan mengandalkan cookie `SameSite=Strict` +
  token CSRF + sesi HttpOnly)

`GET /api/boards` mengembalikan ketiga papan kosong dengan `source` yang
jujur (`Serverless (tidak ada tugas RPG)` / `Serverless (tidak ada log agen)`).

## Cara update team-status

Sebagai owner yang sudah login (cookie + CSRF dari `/api/me`):

```bash
curl -X POST https://<domain>/api/team-status \
  -H 'Content-Type: application/json' \
  -H "Cookie: kr_sess=<sid>" -H "X-CSRF: <csrf>" \
  -d '{"muse":{"status":"working","summary":"PM: kerjakan Task 4"}}'
```

Hanya profile di roster (`muse`, `asep`, `udin`, `barong`) dan status
`working|waiting|idle|unknown` yang diterima. Update bersifat merge
per-profile. `GET /api/team-status` mengembalikan isi saat ini.
`GET /api/presence` langsung mencerminkan perubahan itu.

## Cara membuat token setup owner

Setup owner dilakukan sekali, dari luar (bukan dari frontend):

```js
// di mesin yang punya BLOB_READ_WRITE_TOKEN, dari root repo:
import { createSetupToken } from './api/_lib/setup.js';
const path = await createSetupToken('jullian'); // -> "/api/setup?t=<token>"
console.log('https://<domain>' + path);
```

Buka tautan itu di browser: pindai QR TOTP ke aplikasi authenticator,
isi sandi (minimal 12 karakter, 2x), lalu masukkan kode 6 digit.
Token berlaku 24 jam dan hangus setelah owner dibuat (atau bila owner
sudah ada). Jangan kirim tautan ini ke orang lain — siapa pun yang
memegangnya bisa membuat akun owner.

## Tes lokal

```bash
npm test   # node --test tests/serverless.test.mjs
```

Tes memakai shim storage filesystem lokal (bukan Blob asli) dan mencakup:
alur setup -> login sukses, login gagal, TOTP dipakai ulang, rate limit
5x -> 429, endpoint ber-auth dengan/tanpa sesi, team-status -> presence,
dan logout.

## Perbedaan dari backend asli (disederhanakan)

- Pesan 503 login: `Buka tautan setup owner.` (asli: `...yang dikirim ke
  Telegram Budi.` — Telegram tidak ada di versi ini).
- Pesan 403 CSRF: `CSRF tidak valid.` (asli: `Token CSRF salah.`).
- IP rate limit diambil dari `X-Forwarded-For` (Vercel) bukan `X-Real-IP`
  dari nginx.
- Ringkasan presence dipotong 70 karakter seperti aslinya.
- Halaman setup masih menyebut "Mac mini" dan
  "employee-rpg.air-buddy.site" (teks dari `server/setup-page.mjs` yang
  dipakai apa adanya) — tidak akurat untuk deploy Vercel.
- Tidak ada audit log (backend asli mencatat ke SQLite).
