# Sistem Nilai — Zero Trust Security

Tugas Praktikum Individu · Keamanan Informasi (KP70065004) · Informatika Universitas Siliwangi

API Gateway adalah satu-satunya pintu masuk client dan bertindak sebagai Policy Enforcement Point (PEP). Policy Engine/Administrator berada di gateway; Service Nilai dan Service Transkrip memverifikasi ulang secret gateway dan token. Ketiga proses memakai satu database MySQL/MariaDB bersama.

## Arsitektur

```text
Client (Postman/curl)
   │ access token + X-Device-ID
   ▼
Gateway / PEP :3000 ───── Audit Log (MySQL)
   ├── Service Nilai :3001
   └── Service Transkrip :3002
          ▲
          └── Service Nilai meminta token dan mengirim sinkronisasi melalui Gateway

Database bersama: MySQL/MariaDB Laragon
```

Port dan URL default:

| Komponen | Port | URL |
|---|---:|---|
| Gateway | 3000 | `http://127.0.0.1:3000` |
| Service Nilai | 3001 | `http://127.0.0.1:3001` |
| Service Transkrip | 3002 | `http://127.0.0.1:3002` |

`GATEWAY_URL`, `NILAI_URL`, dan `TRANSKRIP_URL` wajib memakai host `BIND_HOST` dan port pasangannya. Jika port diubah, ubah URL yang bersesuaian juga; startup menolak pasangan yang tidak cocok.

## Persiapan MySQL Laragon (dilakukan operator)

1. Nyalakan MySQL di Laragon dan pastikan port aktual (contoh `3306`).
2. Buat satu database bernama `nilai`.
3. Buat user aplikasi khusus, bukan `root`. Contoh SQL berikut memakai nama `zero_trust_app`; jika `DB_USER` lokal Anda bernilai lain (misalnya `defan`), gunakan nama itu secara konsisten saat membuat user dan memberikan hak akses. Jalankan SQL lewat alat administrasi MySQL lokal; ganti placeholder password di sana dan jangan kirim atau commit nilainya:

```sql
CREATE DATABASE nilai CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
CREATE USER 'zero_trust_app'@'127.0.0.1' IDENTIFIED BY '<PASSWORD-LOKAL-KUAT>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON nilai.* TO 'zero_trust_app'@'127.0.0.1';
```

4. Isi `DB_PASSWORD` langsung di `.env` lokal bila akun MySQL memakai password. Jika akun lokal memang dibuat tanpa password, variabel boleh kosong. Jangan menampilkan nilai `.env` ke chat atau terminal bersama.

Aplikasi membutuhkan MySQL 8.0.16+ atau MariaDB 10.2.7+ agar tipe JSON dan constraint `CHECK` pada skema didukung. Versi diperiksa saat startup/koneksi. Database `nilai` harus sudah dibuat operator; aplikasi tidak membuat atau menjatuhkan database maupun user.

## Setup dan menjalankan (Windows PowerShell)

Prasyarat: Node.js `>=22.13`, Laragon MySQL aktif, serta database/user di atas sudah dibuat.

```powershell
npm install
npm run setup
npm run dev
```

`npm run setup` membuat `.env` bila belum ada, menambahkan default yang belum tersedia tanpa menghapus nilai lama, menghasilkan `GATEWAY_SECRET`/`SERVICE_CLIENT_SECRET` yang kosong, menyiapkan pasangan kunci RS256 yang belum tersedia, memvalidasi konfigurasi, lalu menjalankan migrasi dan seed awal pada database demo. Isi password MySQL lokal bila akun memakainya; password kosong didukung untuk akun lokal tanpa password. Jika konfigurasi belum lengkap atau koneksi gagal, setup berhenti dengan pesan aman; ia tidak menganggap Laragon aktif dan tidak mencetak kredensial.

`npm run dev` menjalankan Gateway dan kedua service secara bersamaan. Perintah ini tidak menjalankan watcher/hot reload; hentikan dengan `Ctrl+C`. `npm start` tetap tersedia sebagai alias operasional untuk menjalankan proses yang sama.

Perintah operasional:

```powershell
npm run db:check       # koneksi dan versi database nilai
npm run migrate        # migrasi idempotent pada DB_DEMO_NAME
npm run seed           # menambahkan seed tanpa menghapus data yang ada
npm run dev            # menjalankan gateway dan kedua service
npm run reset-db       # reset seluruh tabel database nilai ke kondisi seed
npm run audit          # tampilkan audit terbaru
npm test               # unit/configuration tests, tanpa koneksi MySQL
```

`.env.example` memuat nilai default nonrahasia. `npm run setup` membuat rahasia aplikasi dan key RS256 secara otomatis. Operator wajib mengisi password MySQL dan menjaga file `.env` tetap lokal. `.env`, `keys/`, file database lama `data/`, backup, dan environment Postman lokal privat tidak boleh di-commit.

| Key | Default/peran |
|---|---|
| `BIND_HOST` | `127.0.0.1`; host yang dipakai ketiga proses dan URL service |
| `GATEWAY_PORT`, `NILAI_PORT`, `TRANSKRIP_PORT` | `3000`, `3001`, `3002` |
| `GATEWAY_URL`, `NILAI_URL`, `TRANSKRIP_URL` | URL localhost dengan port pasangan di atas |
| `DB_HOST`, `DB_PORT` | `127.0.0.1`, `3306`; operator sesuaikan dengan Laragon |
| `DB_DEMO_NAME` | satu-satunya database aplikasi; default `nilai` |
| `DB_USER` | `zero_trust_app` |
| `DB_PASSWORD` | Diisi operator bila akun MySQL memerlukannya; boleh kosong bila akun lokal memang tanpa password |
| `DB_POOL_SIZE` | `10` koneksi maksimum per proses |
| `GATEWAY_SECRET`, `SERVICE_CLIENT_SECRET` | Dibuat acak oleh `npm run setup` bila belum ada; nilai lama dipertahankan |

Setup melaporkan nama key yang belum lengkap tanpa mencetak nilainya. Jam akses tidak memakai environment variable; atur melalui `config/policy.json`.

`data/app.db` SQLite lama tidak dihapus atau dimigrasikan otomatis. Setelah backup dan tinjauan data, pemindahan data lama harus dilakukan secara eksplisit; seed demo baru tidak mengimpor isi file tersebut.

## Reset database

`npm run reset-db` menargetkan `DB_DEMO_NAME` (default `nilai`). Script mencetak nama target sebelum operasi, lalu menghapus baris tabel aplikasi dalam urutan foreign key, menjalankan migrasi, dan mengisi seed dalam transaksi. Script tidak memakai `DROP DATABASE` dan tidak menghapus user/database MySQL. Karena hanya ada satu database, reset menghapus seluruh data aplikasi di database `nilai`, termasuk audit log, token, transkrip, dan status sinkronisasi. Pastikan data boleh dihapus sebelum menjalankannya.

`npm test` hanya menjalankan unit/configuration tests dan tidak mengakses MySQL. E2E dan Collection Runner menggunakan database yang sama dengan aplikasi dan menulis data; tidak ada reset otomatis. Untuk E2E, siapkan ulang data dengan reset yang disengaja, lalu jalankan tiga service:

```powershell
npm run reset-db         # PERINGATAN: menghapus seluruh data aplikasi di database nilai
npm run dev              # terminal pertama: start tiga service pada database nilai
$env:E2E_DB_CONFIRM = 'nilai'
npm run test:e2e         # terminal kedua: skenario mutatif melalui gateway
```

E2E menolak berjalan kecuali `E2E_DB_CONFIRM` sama persis dengan `DB_DEMO_NAME`, dan memeriksa database aktif sebelum menguji. E2E tetap mengubah data, termasuk memfinalisasi kelas seed; jalankan `npm run reset-db` lagi jika ingin mengembalikan seed setelah pengujian.

## Akun seed dan device

| Role | Username | Password seed | NIM | `X-Device-ID` |
|---|---|---|---|---|
| Admin | `admin` | `Admin123!` | — | `DEV-ADMIN-01` |
| Dosen | `dosen1` (kelas 1 · IF301) | `Dosen123!` | — | `DEV-DOSEN1-01` |
| Dosen | `dosen2` (kelas 2 · IF302) | `Dosen123!` | — | `DEV-DOSEN2-01` |
| Mahasiswa | `mhs1` | `Mhs12345!` | 227006001 | `DEV-MHS1-01` |
| Mahasiswa | `mhs2` | `Mhs12345!` | 227006002 | `DEV-MHS2-01` |
| Mahasiswa | `mhs3` | `Mhs12345!` | 227006003 | `DEV-MHS3-01` |

Semua mahasiswa memiliki nilai pada dua kelas seed. Client token service menggunakan ID `service-nilai`; secret-nya hanya disimpan pada `SERVICE_CLIENT_SECRET` lokal.

## Postman

Impor [Collection](postman/Zero-Trust-Nilai.postman_collection.json) dan [environment Laragon](postman/Laragon-Local.postman_environment.json), pilih environment tersebut, lalu jalankan collection melalui Collection Runner. Collection mengelola token/ID runtime dan menguji allow/deny, role, ownership, device, refresh/logout, sinkronisasi, serta penolakan akses langsung service.

Sebelum Collection Runner:

1. Pastikan Laragon aktif, `npm run setup`/migrasi dan seed selesai, dan ketiga service aktif.
2. Collection Runner menggunakan database `nilai` yang sama dengan aplikasi dan memiliki request mutatif. Jalankan hanya bila perubahan data dapat diterima; `npm run reset-db` dapat mengembalikan seed tetapi menghapus seluruh data aplikasi.
3. Impor ulang Collection [Zero-Trust-Nilai.postman_collection.json](postman/Zero-Trust-Nilai.postman_collection.json) dan environment [Laragon-Local.postman_environment.json](postman/Laragon-Local.postman_environment.json). Pilih environment `Laragon Local`, lalu isi bagian **Current Value** untuk `admin_password`, `dosen1_password`, `dosen2_password`, `mhs1_password`, dan `mhs2_password` memakai password seed yang tercantum di README. Isi juga `service_client_secret` dari `SERVICE_CLIENT_SECRET` dan `gateway_secret` dari `GATEWAY_SECRET` pada `.env` lokal. Nilai password/secret memang kosong pada file yang dibagikan dan tidak otomatis diambil dari `.env`. Jika variabel belum diisi, Collection menampilkan error pre-request yang menunjuk variabel yang kosong; jangan lanjutkan pengujian terlindungi sampai login berhasil dan token terisi. Jangan mengekspor atau membagikan environment yang berisi nilai tersebut atau menyimpan nilai itu pada file yang dilacak. Jika membutuhkan file lokal terpisah, gunakan nama `postman/Laragon-Local.local.private.postman_environment.json` (di-ignore Git).
4. Pastikan jam akses server terbuka untuk skenario perubahan/finalisasi. Jika di luar jadwal, skenario itu semestinya ditolak dengan 403. Untuk mendemokan sukses, ubah `config/policy.json` sementara dan kembalikan setelahnya.

Postman tidak melakukan reset database secara tersembunyi. Request langsung ke port service hanya merupakan tes penolakan bypass; semua alur client dan sinkronisasi tetap melewati gateway.

## Kontrol keamanan dan alur sinkronisasi

- JWT RS256: access token 10 menit, refresh token 1 hari tersimpan hash, token service 5 menit.
- Refresh token terikat device, dirotasi dalam transaksi, dan reuse token yang dicabut mencabut sesi user. Logout memerlukan device yang sama.
- Gateway memverifikasi token, device, role, jam akses, serta ownership dari database; endpoint/kombinasi role yang tidak terdaftar ditolak.
- Gateway menimpa `X-Gateway-Secret`; service memeriksa secret dan tanda tangan/masa berlaku token secara independen.
- Perubahan/finalisasi default dibatasi pukul 07.00–21.00 WIB melalui `config/policy.json`.
- Finalisasi menyimpan snapshot dan status `pending` dalam transaksi, lalu mengirim idempotency key lewat gateway. Service Transkrip memverifikasi snapshot terhadap nilai final sumber dan menerapkan transkrip serta status `succeeded` atomik.
- Timeout tidak membuka kembali nilai. Status tetap dapat dicoba ulang melalui `POST /kelas/:id/finalisasi`; retry memakai ID yang sama dan respons sukses yang sudah tersimpan tetap deterministik.
- Audit menyimpan waktu, subjek, metode, endpoint, device, hasil, alasan, dan IP tanpa password/token/secret.
- Komunikasi lokal masih HTTP; deployment produksi memerlukan transport terenkripsi seperti mTLS.

## Panduan demo

Lihat [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) untuk alur video 6–9 menit, termasuk autentikasi, policy, device/jam, gateway secret, sinkronisasi, audit, dan Collection Runner.
