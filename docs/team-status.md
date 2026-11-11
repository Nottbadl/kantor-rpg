# Status tim (Update PM) — kantor tim Somewhere

Kantor ini menampilkan status kerja tim dari empat sumber, berurutan
prioritasnya (`server/boards.mjs`, `buildPresence()`):

1. Tugas RPG yang sedang jalan (`perintah dari RPG`)
2. Tugas Kanban `running`/`claimed` (`Kanban`)
3. Tool call di `agent.log` 5 menit terakhir (`agent.log`)
4. **File `team-status.json` (`Update PM`)** — sumber ini

## File aslinya tinggal di mana

`team-status.json` **tidak di-commit ke repo**. File aslinya tinggal di
folder data backend, bersama `owner.json` dan `kantor-rpg.db`:

- Default: `~/.hermes/kantor-rpg/team-status.json`
- Atau sesuai `KANTOR_RPG_DATA` saat server dijalankan

Contoh formatnya ada di `server/team-status.example.json` (file ini hanya
dokumentasi — jangan salin begitu saja tanpa menyesuaikan isinya).

## Format

```json
{
  "muse":   { "status": "working", "summary": "PM: fork kantor-rpg + pantau Task 3" },
  "barong": { "status": "working", "summary": "Menguji Plan 01 Task 3" },
  "udin":   { "status": "idle",    "summary": "Task 3 selesai, menunggu Task 4" },
  "asep":   { "status": "idle",    "summary": "Review Task 3 selesai, menunggu Plan 02" }
}
```

- Kunci: `profile` dari `server/roster.mjs` (`muse`, `asep`, `udin`, `barong`).
- `status`: `working` | `waiting` | `idle` | `unknown`. Nilai lain diabaikan.
- `summary`: kalimat singkat (maksimal ±70 karakter yang tampil).
- Entri boleh sebagian saja — profil yang tidak ada di file mengikuti
  sumber lain / `idle` seperti biasa.

## Cara PM memperbaruinya

1. Edit `team-status.json` di folder data backend (bukan di repo).
2. Simpan. Tidak perlu restart server: file dibaca ulang setiap kali
   `buildPresence()` dipanggil, dan endpoint `/api/presence` memakai
   cache 4 detik — halaman yang polling tiap 10 detik akan melihat
   perubahan dalam hitungan detik.
3. Perbarui setiap tugas mulai/selesai: siapa memegang tugas aktif =
   `working`, siapa menunggu hasil orang lain = `waiting`, siapa tidak
   memegang tugas = `idle`.

## Kejujuran

Status ini **bukan deteksi proses agen**. Tim Somewhere (Muse, Asep,
Udin, Barong) adalah subagent; tidak ada proses yang bisa diamati
server seperti `agent.log` milik Budi. Label `bekerja` di kantor ini
artinya "memegang tugas aktif" menurut catatan PM, dan sumbernya
ditampilkan apa adanya sebagai `Update PM` — bukan `Kanban` atau
`agent.log`. Kalau file tidak ada atau rusak, sumber ini dilewati
tanpa error.
