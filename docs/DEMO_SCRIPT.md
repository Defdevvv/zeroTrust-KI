# Panduan Video Demo (target 6–9 menit)

Tips: rekam layar dengan 2 jendela — editor kode (VS Code) dan terminal/Postman. Siapkan `npm start` dan tab `npm run audit` sebelum merekam. Jelaskan dengan kata-kata sendiri; naskah ini hanya kerangka.

| Waktu | Bagian | Yang ditampilkan | Poin yang dijelaskan |
|---|---|---|---|
| 0:00–0:40 | Pembuka & arsitektur | README (diagram), struktur folder | Prinsip zero trust; gateway = PEP satu-satunya pintu masuk; PE/PA modul di gateway; 2 service + DB bersama |
| 0:40–2:00 | 4.1 Token & login | `gateway/tokens.js`, `gateway/auth.js`; demo login di Postman | JWT RS256 10 menit (`sub`, `role`); refresh token acak, disimpan hash di DB; rotasi + deteksi reuse; logout mencabut; token service 5 menit |
| 2:00–3:15 | 4.1 Gateway secret & verifikasi ulang | `gateway/index.js` (`proxyReq`), `shared/serviceGuard.js`; curl langsung ke `:3001` | Tanpa secret → 403; secret benar tanpa token → 401; service hanya punya public key (assume breach) |
| 3:15–5:15 | 4.2 Kebijakan akses | `gateway/policy.js` (`RULES`); demo: mhs1 lihat nilai sendiri vs `?nim=` orang lain; dosen2 ubah nilai kelas dosen1; admin ke `/nilai`; user token ke `/transkrip/sinkron` | Default deny; atribut kepemilikan dibaca dari DB, bukan dari token; defense in depth di service |
| 5:15–6:30 | 4.3 Konteks | `policy.js` (`checkAccessHours`), `config/policy.json`; demo device salah; ubah jam akses lalu coba PUT/finalisasi | Device terdaftar per user; jam akses bisa dikonfigurasi dan dibaca tiap request |
| 6:30–7:45 | Finalisasi & sinkron antar-service | `service-nilai/index.js` (finalisasi, `getServiceToken`); demo finalisasi lalu transkrip mhs1 | Service Nilai memanggil Transkrip LEWAT gateway dengan token service; rollback bila sinkron gagal |
| 7:45–8:40 | 4.4 Audit log | `gateway/audit.js`; jalankan `npm run audit` | Setiap keputusan tercatat: waktu, subjek (user/service), endpoint, device, hasil, alasan |
| 8:40–9:00 | Penutup | `npm test` (52 lulus) | Ringkas pengerasan tambahan; sebutkan batasan yang diketahui |
