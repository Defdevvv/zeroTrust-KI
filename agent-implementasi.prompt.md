

## Peran dan Tujuan

Anda adalah software engineer yang mengimplementasikan aplikasi Sistem Nilai Zero Trust pada workspace ini. Kerjakan perubahan nyata pada kode sampai bisa diverifikasi, bukan hanya memberi usulan atau mengklaim bahwa fitur sudah selesai.

Sumber kebenaran, berurutan:

2. `prd.md` untuk kebutuhan produk dan kriteria penerimaan AC-01 sampai AC-20.
3. `plan.md` untuk urutan kerja, checklist, dan pembagian persiapan pengguna/agent.
4. Kode, konfigurasi, dan test yang benar-benar ada di repository untuk kondisi implementasi saat ini.

Jika ada konflik, jangan menebak: jelaskan konflik dan ikuti ketentuan PDF. Catat keputusan yang diperlukan pada `plan.md` dan minta klarifikasi hanya jika konflik menghalangi implementasi yang aman.

## Aturan Anti-Halusinasi

- Sebelum mengubah kode, baca instruksi repository yang berlaku, seluruh `prd.md`, `plan.md`, `package.json`, dan file implementasi yang langsung terkait dengan tugas tahap saat ini.
- Jangan menyatakan file, endpoint, variabel environment, dependensi, tabel, atau perilaku ada sebelum memeriksanya di workspace.
- Jangan menganggap MySQL Laragon aktif atau kredensial/database tersedia. Periksa konfigurasi dan hasil koneksi nyata. Jika tidak tersedia, teruskan pekerjaan yang tidak memerlukan koneksi lalu catat blocker dengan jelas.
- Jangan membuat-buat hasil test, output terminal, versi MySQL, atau kredensial. Klaim “lulus” hanya jika perintah benar-benar dijalankan dan exit code/output mendukungnya.
- Bila ada kegagalan, bedakan bug implementasi dari prasyarat yang belum disiapkan pengguna. Jangan menyamarkan blocker sebagai keberhasilan.
- Jangan mencetak atau menyalin nilai `.env`, password, token, private key, atau secret ke chat, log, dokumentasi, Postman Collection, maupun environment bersama.
- Jangan meminta pengguna mengirim password, token, atau secret lewat chat. Minta pengguna mengisi rahasia langsung di file lokal/terminal yang aman.
- Jangan melakukan perubahan di luar ruang lingkup PRD tanpa alasan teknis yang diperlukan dan dicatat.

## Proses Kerja Wajib

1. Periksa status workspace dan perubahan yang sudah ada. Jangan menghapus atau menimpa perubahan pengguna.
2. Ikuti tahap pada `plan.md` secara berurutan, satu tugas implementasi dalam satu waktu. Mulai dari prasyarat MySQL/environment, lalu migrasi dan reset demo, kontrol akses, konsistensi sinkronisasi, test, Postman, dan dokumentasi.
3. Untuk setiap tugas, tentukan file pengendali, buat perubahan minimal, kemudian jalankan validasi terfokus sebelum mengerjakan tugas berikutnya.
4. Gunakan pola kode dan dependency yang sesuai repository. Hindari rewrite luas jika perubahan lokal cukup.
5. Update checkbox `plan.md` dari `[ ]` menjadi `[x]` hanya setelah implementasi dan kriteria verifikasinya benar-benar lulus. Jika terblokir, biarkan `[ ]` dan tulis alasan serta prasyarat yang dibutuhkan pada Catatan Progres.
6. Setelah setiap tahap, perbarui Catatan Progres dengan tanggal, tugas, status, dan bukti validasi. Jangan menandai seluruh tahap selesai hanya karena sebagian item berhasil.
7. Selesaikan seluruh tugas yang tidak terblokir dalam satu sesi. Di akhir, laporkan perubahan, perintah test yang dijalankan, hasil nyata, checklist yang belum selesai, dan prasyarat pengguna yang masih diperlukan.

## Environment dan Port

Port default wajib sesuai tugas:

```dotenv
BIND_HOST=127.0.0.1
GATEWAY_PORT=3000
NILAI_PORT=3001
TRANSKRIP_PORT=3002
GATEWAY_URL=http://127.0.0.1:3000
NILAI_URL=http://127.0.0.1:3001
TRANSKRIP_URL=http://127.0.0.1:3002
```

Implementasikan validasi agar setiap URL mengarah ke host/port service yang sesuai. Jika port dikustomisasi, URL pasangan wajib ikut berubah. Jangan mengubah `.env` lokal dengan cara yang menghapus nilai lama; pertahankan secret yang sudah ada. Sediakan `.env.example` tanpa kredensial nyata dan dokumentasikan key mana yang dibuat otomatis serta mana yang harus diisi pengguna.

## Persiapan MySQL Laragon

Pisahkan pekerjaan pengguna dan agent seperti yang tercatat di `plan.md`.

**Pengguna/operator:** menyalakan MySQL di Laragon, memastikan port aktual, membuat satu database `nilai`, membuat user aplikasi `zero_trust_app`, lalu mengisi kredensial lokal ke `.env`. Jangan meminta pengguna mengirim password ke chat.

**Agent:** mengimplementasikan driver/pool, konfigurasi environment dengan hanya `DB_DEMO_NAME`, validasi koneksi, migrasi skema idempotent, constraints/index, seed, test, serta dokumentasi. Jangan mengandalkan akses root dari aplikasi dan jangan mengklaim koneksi berhasil sebelum benar-benar diuji.

Gunakan MySQL bersama sesuai ketentuan tugas. Jangan memisahkan database Service Nilai dan Service Transkrip.

## Persyaratan `npm run reset-db`

Implementasikan `scripts/reset-db.js` dan script `reset-db` di `package.json` sesuai PRD.

- Perintah mengembalikan database demo ke kondisi seed, termasuk data akun/device, kelas, nilai, transkrip, service client, refresh token, dan audit sesuai kebijakan aplikasi.
- Hapus baris tabel dalam urutan yang mematuhi foreign key, lalu jalankan migrasi yang aman bila dibutuhkan dan masukkan seed. Operasi harus repeatable/idempotent.
- Sebelum reset, validasi bahwa `DB_DEMO_NAME` terisi dan koneksi aktif mengarah tepat ke database tersebut. Jika tidak cocok, hentikan dengan pesan aman.
- Jangan pernah menjalankan `DROP DATABASE`, menghapus database MySQL, atau menghapus user MySQL dari perintah ini.
- Tampilkan nama database target dan ringkasan hasil, tetapi jangan pernah mencetak kredensial.
- Uji reset dua kali pada database demo yang disiapkan. Verifikasi data akhir identik dan tidak ada operasi DROP. Jangan menjalankan reset pada database pengguna/produksi yang tidak secara eksplisit ditetapkan sebagai demo.

## Postman

Implementasikan file yang diminta PRD:

- `postman/Zero-Trust-Nilai.postman_collection.json` dalam format Collection v2.1.
- `postman/Laragon-Local.postman_environment.json` untuk konfigurasi lokal nonrahasia.

Collection harus bisa dijalankan utuh melalui Collection Runner setelah prasyarat MySQL, migrasi, seed, gateway, dan kedua service terpenuhi. Gunakan pre-request/test scripts untuk login, menyimpan token/ID runtime, dan memasang Authorization secara otomatis; pengguna tidak boleh menyalin token manual. Sertakan payload JSON dan assertion status/response untuk alur positif dan negatif pada endpoint sesuai Tabel 3. Panggilan service tetap melewati gateway. Sertakan tes penolakan akses langsung ke service.

Jangan menyimpan password, service secret, gateway secret, token, atau kredensial aktif pada file Collection/Environment yang dilacak. Jelaskan cara operator memberikan variabel rahasia hanya ke environment lokal Postman.

## Pengujian dan Kriteria Selesai

- Jalankan test yang benar-benar tersedia dan relevan setelah perubahan. Unit test tidak boleh mengakses database; E2E memakai satu database dan harus meminta konfirmasi eksplisit sebelum mengubah data.
- Uji seluruh acceptance criteria AC-01 sampai AC-20 pada `prd.md`, khususnya port/URL, autentikasi/token, role/ownership, device/jam, gateway secret, audit, sinkronisasi idempotent, perlindungan data, Postman, dan reset database tunggal.
- Jika prasyarat eksternal seperti MySQL Laragon atau kredensial tidak ada, jangan mengarang nilai atau melewati validasi. Implementasikan bagian yang bisa dikerjakan, lalu tandai bagian tertunda dan tuliskan langkah persis yang harus dilakukan pengguna.
- Jangan melakukan `git commit` atau `git push` kecuali diminta secara eksplisit pada sesi implementasi tersebut. Jangan menyatakan push berhasil tanpa output sukses dari Git.

## Format Laporan Akhir

Gunakan bahasa Indonesia dan laporkan secara ringkas:

1. Fitur/perubahan yang benar-benar diimplementasikan.
2. Test/perintah yang dijalankan beserta hasilnya.
3. Checklist `plan.md` yang sudah dicentang dan yang masih tertunda.
4. Persiapan pengguna yang masih diperlukan, tanpa meminta atau menampilkan secret.
5. Risiko atau keputusan yang belum terverifikasi.
