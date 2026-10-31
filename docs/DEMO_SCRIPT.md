# Panduan Video Demo (target 6–9 menit)

Gunakan database `nilai` yang sama dengan aplikasi. Collection Runner dapat mengubah data; jika data saat ini perlu dipertahankan, jangan reset atau jalankan skenario mutatif. Untuk menyiapkan seed demo dari awal, pahami bahwa reset menghapus seluruh data aplikasi, lalu jalankan:

```powershell
npm run reset-db
npm start
```

Di terminal lain, jalankan Collection Runner pada `postman/Zero-Trust-Nilai.postman_collection.json` dengan environment Laragon lokal. Collection tidak mereset database sendiri. E2E juga menggunakan database yang sama dan hanya berjalan jika `E2E_DB_CONFIRM` diset sama dengan `DB_DEMO_NAME`; jalankan setelah reset yang disengaja dan terima bahwa data akan berubah.

| Waktu | Bagian | Yang ditampilkan | Poin yang dijelaskan |
|---|---|---|---|
| 0:00–0:40 | Pembuka & arsitektur | Diagram README dan struktur folder | Gateway = PEP; dua service resource; satu database MySQL bersama |
| 0:40–2:00 | Login & token | Request login/refresh di Postman dan `gateway/tokens.js` | JWT RS256 10 menit, refresh hash 1 hari, rotasi/reuse detection/logout, token service 5 menit |
| 2:00–3:15 | Gateway secret | Request langsung ke port 3001 dan `gateway/index.js` | Secret hilang ditolak 403; secret valid tanpa token ditolak 401; token diverifikasi ulang oleh service |
| 3:15–5:15 | Kebijakan akses | Request mahasiswa/dosen/admin di Postman; `gateway/policy.js` | Default deny, ownership dibaca dari DB, role salah, device salah/hilang, user token ditolak pada endpoint sinkron |
| 5:15–6:30 | Konteks | Device dan jam akses; `config/policy.json` | Perubahan/finalisasi default 07.00–21.00 WIB; akses di luar waktu ditolak |
| 6:30–7:45 | Finalisasi & retry | `service-nilai/index.js`, `service-transkrip/index.js`, request finalisasi | Snapshot dan status persisten; sync ID stabil; sinkron lewat gateway; retry tidak membuka kembali nilai |
| 7:45–8:40 | Audit | `npm run audit` pada database yang dipilih | Keputusan allow/deny menyimpan metadata tanpa token/secret |
| 8:40–9:00 | Penutup | Ringkasan Collection Runner dan `npm test` | Tunjukkan hasil unit test; jelaskan E2E memakai database tunggal `nilai` dan bersifat mutatif |

Untuk mendemokan finalisasi sukses, jalankan Collection Runner saat jam server WIB berada di antara 07.00 dan 21.00 atau gunakan konfigurasi jadwal demo yang sudah disetujui. Kembalikan `config/policy.json` ke kebijakan semula setelah demo. Jika sinkronisasi timeout setelah transkrip tersimpan, batch tetap `succeeded`; jika gagal sebelum diterapkan, statusnya bisa diulang melalui finalisasi dan nilai tetap terkunci.
