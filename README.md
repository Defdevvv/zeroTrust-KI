# Sistem Nilai — Zero Trust Security

Tugas Praktikum Individu · Keamanan Informasi (KP70065004) · Informatika Universitas Siliwangi

API Gateway berperan sebagai **Policy Enforcement Point (PEP)** yang terpisah dari service, mengikuti **NIST SP 800-207**.
Prinsip yang diterapkan: *never trust, always verify*, *least privilege*, *assume breach*.

## Arsitektur

```
Client (Postman/curl)
   │  Authorization: Bearer <access token> + X-Device-ID
   ▼
┌──────────────────────────────────────────────┐
│ API GATEWAY (PEP) :3000                      │   ┌───────────┐
│  /auth/*  → login, refresh, logout, service  │──▶│ Audit Log │ (tabel audit_log)
│  guard    → verifikasi token                 │   └───────────┘
│  policy.js (PE/PA) → allow / deny + alasan   │
└───────┬───────────────────────┬──────────────┘
        │ jika allow            │ jika allow
        │ + X-Gateway-Secret    │ + X-Gateway-Secret
        ▼                       ▼
 Service Nilai :3001     Service Transkrip :3002
 (verifikasi secret      (verifikasi secret
  + token)                + token)
        │  finalisasi → POST /transkrip/sinkron (token service, LEWAT GATEWAY)
        └──────────────▶ kembali ke gateway
              Database SQLite bawaan Node (data/app.db) — dipakai bersama
```

| Komponen | Port | Peran NIST | File |
|---|---|---|---|
| API Gateway | 3000 | PEP | `gateway/index.js` |
| Policy Engine / Administrator | (modul di gateway) | PE / PA | `gateway/policy.js`, `gateway/auth.js`, `gateway/tokens.js` |
| Service Nilai | 3001 | Resource | `service-nilai/index.js` |
| Service Transkrip | 3002 | Resource | `service-transkrip/index.js` |
| Database | — | Resource | `data/app.db` (SQLite, modul `node:sqlite`) |
| Audit Log | — | Data source | `gateway/audit.js` → tabel `audit_log` |

## Cara Menjalankan

Prasyarat: **Node.js 22.13 atau lebih baru** (termasuk Node 24). Database memakai SQLite bawaan Node (`node:sqlite`), jadi **tidak perlu** Visual Studio / kompilasi apa pun.

```bash
npm install
npm run setup     # membuat .env (secret acak), key pair RS256, database + data seed
npm start         # menjalankan gateway + 2 service sekaligus
```

Perintah lain:

```bash
npm test          # uji otomatis 52 skenario (butuh `npm start` aktif di terminal lain)
npm run audit     # tampilkan audit log terbaru (npm run audit -- 50 untuk 50 baris)
npm run seed      # reset data ke kondisi awal
```

> `npm test` mereset data demo ke kondisi awal sebelum berjalan.

## Catatan Penting Saat Demo

- **Jam akses**: ubah nilai dan finalisasi hanya diizinkan pukul 07.00–21.00 (WIB). Jika kamu merekam demo di luar jam itu, kedua aksi tersebut akan ditolak (ini perilaku yang benar). Untuk demo di malam hari, buka `config/policy.json` lalu ubah `end` menjadi `"24:00"`; kembalikan setelahnya.
- Saat start, muncul `ExperimentalWarning: SQLite is an experimental feature`. Ini wajar dan tidak mengganggu.
- Windows PowerShell: tulis `curl.exe` (bukan `curl`), atau pakai Postman.

## Akun & Device ID (Data Awal / Seed)

| Role | Username | Password | NIM | X-Device-ID |
|---|---|---|---|---|
| Admin | `admin` | `Admin123!` | — | `DEV-ADMIN-01` |
| Dosen | `dosen1` (mengampu kelas 1 · IF301 Keamanan Informasi) | `Dosen123!` | — | `DEV-DOSEN1-01` |
| Dosen | `dosen2` (mengampu kelas 2 · IF302 Basis Data Lanjut) | `Dosen123!` | — | `DEV-DOSEN2-01` |
| Mahasiswa | `mhs1` | `Mhs12345!` | 227006001 | `DEV-MHS1-01` |
| Mahasiswa | `mhs2` | `Mhs12345!` | 227006002 | `DEV-MHS2-01` |
| Mahasiswa | `mhs3` | `Mhs12345!` | 227006003 | `DEV-MHS3-01` |

Setiap user punya tepat 1 device terdaftar. Semua mahasiswa terdaftar di kedua kelas.
Client service: `client_id = service-nilai`, secret ada di `SERVICE_CLIENT_SECRET` pada file `.env`.

## Pemetaan Kebutuhan → Kode (untuk video demo)

| Kebutuhan (Bagian 4) | Diterapkan di |
|---|---|
| Access token JWT 10 menit, berisi `sub` + `role`, header Bearer | `gateway/tokens.js` (`signAccess`), `gateway/index.js` (`guard`) |
| Refresh token 1 hari, disimpan di DB (hash), bisa dicabut, logout mencabut | `gateway/tokens.js` (`issueRefresh`, `revokeRefresh`), `gateway/auth.js` (`/refresh`, `/logout`) |
| Token service dari `POST /auth/service`, 5 menit, `role: service` | `gateway/auth.js` (`/service`), `service-nilai/index.js` (`getServiceToken`) |
| `X-Gateway-Secret` ditambahkan gateway, service menolak tanpa header | `gateway/index.js` (`proxyReq`), `shared/serviceGuard.js` |
| Verifikasi ulang token di service (tanda tangan + masa berlaku) | `shared/serviceGuard.js`, `shared/verifyToken.js` |
| Kebijakan akses (Tabel 3), atribut kepemilikan dari database | `gateway/policy.js` (`RULES`) |
| Device terdaftar (`X-Device-ID`) | `gateway/policy.js` (`decide`), `gateway/auth.js` (`/login`) |
| Jam akses 07.00–21.00, bisa diatur | `gateway/policy.js` (`checkAccessHours`), `config/policy.json` |
| Finalisasi → sinkron transkrip lewat gateway | `service-nilai/index.js` (`/kelas/:id/finalisasi`), `service-transkrip/index.js` (`/transkrip/sinkron`) |
| Audit log (waktu, subjek, endpoint, device, hasil, alasan) | `gateway/audit.js`, `scripts/show-audit.js` |

## Pengerasan Keamanan Tambahan

- **RS256 (asimetris)**: hanya gateway memegang *private key*; service hanya punya *public key*, jadi service yang dibobol tidak bisa memalsukan token (*assume breach*).
- Verifikasi JWT mengunci `algorithms: ['RS256']`, `issuer`, dan `audience` → menolak `alg: none` dan *algorithm confusion* (HS256).
- **Default deny**: endpoint tanpa aturan di `policy.js` selalu ditolak.
- **Atribut dibaca dari DB, bukan dari token**: kepemilikan kelas, NIM, status final, dan role dicek ulang ke database tiap request.
- **Defense in depth**: service juga membatasi data berdasarkan identitas di token, bukan hanya mengandalkan keputusan gateway.
- **Rotasi refresh token + deteksi reuse**: refresh token lama yang dipakai ulang mencabut seluruh sesi user itu. Refresh token juga terikat ke device saat login.
- Password dan client secret disimpan sebagai hash **scrypt**; refresh token disimpan sebagai hash SHA-256.
- **Anti brute-force**: 5 kali gagal login per 5 menit per (IP + username) → HTTP 429. Pesan error login dibuat seragam dan waktu verifikasi disamakan agar tidak membocorkan keberadaan user.
- Perbandingan gateway secret memakai `timingSafeEqual`; header `X-Gateway-Secret` dari klien selalu ditimpa gateway.
- Normalisasi path (menolak `%`, `//`, `..`) dan penolakan *HTTP parameter pollution* (`?nim=a&nim=b`).
- Layanan berjalan di `127.0.0.1` secara default.
- **Konsistensi finalisasi**: nilai dikunci dulu, lalu sinkron ke transkrip; bila sinkron gagal, finalisasi dibatalkan otomatis (bisa dicoba ulang).

## Contoh curl

```bash
# 1. Login dosen1
curl -s -X POST localhost:3000/auth/login -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-DOSEN1-01" -d '{"username":"dosen1","password":"Dosen123!"}'
# simpan access_token & refresh_token dari respons
TOKEN=<access_token>

# 2. Dosen melihat nilai kelasnya
curl -s localhost:3000/nilai -H "Authorization: Bearer $TOKEN" -H "X-Device-ID: DEV-DOSEN1-01"

# 3. Ubah nilai (id dari langkah 2)
curl -s -X PUT localhost:3000/nilai/1 -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d '{"nilai_angka": 90}'

# 4. Finalisasi kelas 1 (otomatis sinkron ke transkrip)
curl -s -X POST localhost:3000/kelas/1/finalisasi -H "Authorization: Bearer $TOKEN" -H "X-Device-ID: DEV-DOSEN1-01"

# 5. Device tidak terdaftar -> 403
curl -s localhost:3000/nilai -H "Authorization: Bearer $TOKEN" -H "X-Device-ID: DEV-ASING-99"

# 6. Akses langsung ke service (melewati gateway) -> 403
curl -s localhost:3001/nilai -H "Authorization: Bearer $TOKEN"

# 7. Refresh & logout
curl -s -X POST localhost:3000/auth/refresh -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-DOSEN1-01" -d '{"refresh_token":"<refresh_token>"}'
curl -s -X POST localhost:3000/auth/logout -H "Content-Type: application/json" \
  -d '{"refresh_token":"<refresh_token_terbaru>"}'
```

Mengatur jam akses (tanpa restart): edit `config/policy.json`, contoh `{"access_hours":{"start":"00:00","end":"00:01"}}` → perubahan dan finalisasi nilai langsung ditolak. Kembalikan ke `07:00`–`21:00` setelah demo.

## Struktur Repository

```
gateway/            index.js (PEP), policy.js (PE), auth.js (PA), tokens.js, audit.js
service-nilai/      index.js
service-transkrip/  index.js
shared/             config, db (node:sqlite), schema, secrets (scrypt), verifyToken, serviceGuard
scripts/            setup, seed, start-all, show-audit
tests/              e2e.js (52 skenario)
config/policy.json  pengaturan jam akses
docs/               DEMO_SCRIPT.md (panduan video demo)
```

## Batasan yang Diketahui

- Access token yang sudah terbit tetap berlaku sampai kedaluwarsa (maks. 10 menit) setelah logout; ini alasan masa berlakunya dibuat singkat. Untuk pencabutan instan, tambahkan daftar `jti` yang dicabut.
- Pesan alasan penolakan dikirim ke klien agar mudah didemokan; di produksi cukup pesan generik, dan alasan lengkap hanya di audit log.
- Komunikasi gateway ↔ service memakai HTTP di localhost; di produksi gunakan mTLS.
- Rate limiter berada di memori (hilang saat gateway restart).
