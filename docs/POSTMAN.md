# Panduan Pengujian Postman

Panduan ini menjelaskan persiapan, cara menjalankan Collection, skenario pengujian, dan cara membaca response API.

## 1. Prasyarat

- MySQL Laragon aktif dan database `nilai` sudah dimigrasi serta memiliki data seed.
- Node.js versi yang disyaratkan project sudah terpasang.
- Gateway dan kedua service berjalan. Jalankan dari root project:

  ```powershell
  npm run dev
  ```

- Pastikan alamat lokal sesuai environment:
  - Gateway: `http://127.0.0.1:3000`
  - Service Nilai: `http://127.0.0.1:3001`
  - Service Transkrip: `http://127.0.0.1:3002`

Ketiga service menggunakan database aplikasi yang sama, yaitu `nilai`. Collection tidak membuat database test dan tidak me-reset data.

## 2. Impor Collection dan environment

1. Di Postman, pilih **Import**.
2. Impor [Collection Zero-Trust-Nilai](../postman/Zero-Trust-Nilai.postman_collection.json) dan [Environment Laragon Local](../postman/Laragon-Local.postman_environment.json).
3. Pilih environment **Laragon Local** di menu environment Postman.
4. Buka pengaturan environment dan isi **Current Value** untuk password akun seed berdasarkan [README](../README.md).
5. Isi `service_client_secret` dan `gateway_secret` dari `.env` lokal. Jangan menaruh nilainya di file yang dilacak, membagikannya, atau menampilkannya dalam tangkapan layar.
6. Tekan **Save**.

File environment yang di-commit sengaja tidak berisi password atau secret. Postman tidak membaca `.env` secara otomatis. Jika sebuah variabel wajib kosong, pre-request script menampilkan nama variabel yang harus diisi.

## 3. Menjalankan pengujian

### Menjalankan seluruh skenario

Collection berisi 34 request dan assertion untuk login, akses nilai, transkrip, penolakan akses, dan sinkronisasi. Untuk menjalankannya:

1. Klik menu Collection **Zero-Trust-Nilai** lalu pilih **Run**.
2. Pastikan environment yang dipilih adalah **Laragon Local**.
3. Jalankan folder **Laragon E2E** dari request pertama agar login mengisi token runtime yang dibutuhkan request berikutnya.
4. Periksa hasil per request: status HTTP, assertion, dan response body. Jangan hanya melihat ringkasan **Passed/Failed**.

**Perhatian: Collection Runner melakukan perubahan data.** Request perubahan nilai dan finalisasi memakai database `nilai` yang sama dengan aplikasi. Finalisasi mengunci nilai dan menyimpan transkrip. Database demo yang dipakai sebelumnya telah memfinalisasi kelas 1; periksa status data sebelum menjalankan request mutatif. Untuk pengujian penuh yang memerlukan seed bersih, reset hanya jika penghapusan semua data aplikasi sudah disetujui:

```powershell
npm run reset-db
```

Perintah tersebut menghapus seluruh data aplikasi di database `nilai`, termasuk nilai, transkrip, audit, token, dan status sinkronisasi. Tidak ada reset otomatis dari Postman.

### Menjalankan request satu per satu

Untuk pemeriksaan yang tidak mengubah data:

1. Jalankan request login yang diperlukan, misalnya **Login mahasiswa mhs1** atau **Login dosen1**.
2. Pastikan response login sukses; script test menyimpan token ke collection variables.
3. Jalankan request baca atau penolakan akses yang ingin diuji, seperti **Nilai mahasiswa sendiri**, **Mahasiswa membaca NIM lain**, atau **Akses langsung Service Nilai**.

Request yang bergantung pada token harus dijalankan setelah login yang sesuai. Jika token atau password belum tersedia, pre-request script menunjukkan penyebabnya; jangan meneruskan request dengan token kosong.

## 4. Skenario dan hasil yang diharapkan

| Request di Collection | Yang diuji | Hasil yang diharapkan |
|---|---|---|
| `Login mahasiswa mhs1` | Kredensial dan device terdaftar | `200`; response berisi access token, refresh token, dan `expires_in: 600` |
| `Login password salah` | Password tidak valid | `401`; pesan kredensial dibuat umum |
| `Login device salah` | Device tidak terdaftar untuk user | `403` |
| `Nilai mahasiswa sendiri` | Mahasiswa membaca nilainya sendiri | `200`; response berisi `{ "data": [...] }` |
| `Nilai tanpa token` | Request tanpa autentikasi | `401`; `access token tidak ada` |
| `Mahasiswa membaca NIM lain` | Mahasiswa mencoba membaca data mahasiswa lain | `403`; ownership ditolak |
| `Dosen membaca kelas dosen2` | Dosen membaca kelas yang bukan diampu | `403` |
| `Transkrip mahasiswa sendiri` | Mahasiswa membaca transkrip sendiri | `200`; response berisi `nim`, `nama`, dan `transkrip` |
| `Transkrip mahasiswa lain` | Mahasiswa membaca transkrip NIM lain | `403` |
| `Admin membaca transkrip` | Admin membaca transkrip | `200` |
| `Token user ke endpoint sinkron` | Access token user dipakai untuk sinkronisasi | `403`; hanya token service yang diizinkan |
| `Akses langsung Service Nilai` | Bypass Gateway tanpa secret internal | `403` |
| `Secret benar tanpa token` | Secret Gateway tanpa token | `401`; secret saja tidak cukup |
| `Finalisasi kelas` | Dosen memfinalisasi kelas miliknya | `200` dengan status `succeeded` bila kelas belum final dan jam akses mengizinkan |
| `Finalisasi ulang idempotent` | Retry finalisasi yang sudah sukses | `200`; `sync_id` tetap sama |

Perubahan nilai dan finalisasi dibatasi jam akses dalam `config/policy.json` (default 07.00–21.00 WIB). Di luar jadwal, request mutatif semestinya ditolak dengan `403`. Hasil beberapa skenario juga bergantung pada status kelas di database.

## 5. Contoh payload dan response

### Login

Request:

```http
POST {{base_url}}/auth/login
Content-Type: application/json
X-Device-ID: {{mhs1_device}}
```

```json
{
  "username": "{{mhs1_username}}",
  "password": "{{mhs1_password}}"
}
```

Response sukses (token disamarkan):

```json
{
  "token_type": "Bearer",
  "access_token": "<token disamarkan>",
  "expires_in": 600,
  "refresh_token": "<token disamarkan>"
}
```

Gunakan access token sebagai `Authorization: Bearer ...`; Collection memasangnya dari collection variable secara otomatis. Access token berlaku 10 menit. Jangan menyalin token ke laporan atau tangkapan layar.

### Membaca nilai

Request:

```http
GET {{base_url}}/nilai
Authorization: Bearer {{mhs1_access_token}}
X-Device-ID: {{mhs1_device}}
```

Contoh response:

```json
{
  "data": [
    {
      "id": 1,
      "kelas_id": 1,
      "kode_mk": "IF301",
      "nama_mk": "Keamanan Informasi",
      "nim": "227006001",
      "nilai_angka": 88,
      "nilai_huruf": null,
      "final": 0
    }
  ]
}
```

Nilai pada response aktual mengikuti isi database. Sebelum finalisasi, `nilai_huruf` bisa `null` dan `final` bernilai `0`.

### Membaca transkrip

Request:

```http
GET {{base_url}}/transkrip/227006001
Authorization: Bearer {{mhs1_access_token}}
X-Device-ID: {{mhs1_device}}
```

Bentuk response:

```json
{
  "nim": "227006001",
  "nama": "Andi Pratama",
  "transkrip": [
    {
      "kelas_id": 1,
      "kode_mk": "IF301",
      "nama_mk": "Keamanan Informasi",
      "nilai_angka": 88,
      "nilai_huruf": "A",
      "synced_at": "<waktu sinkronisasi>"
    }
  ]
}
```

Transkrip memuat nilai yang telah difinalisasi dan disinkronkan; jumlah item bergantung pada status kelas.

### Mengubah nilai

Request dosen memakai `PUT {{base_url}}/nilai/{{nilai_id}}`, access token dosen, dan device dosen yang terdaftar. Body JSON:

```json
{
  "nilai_angka": 90
}
```

Nilai harus berupa angka antara 0 sampai 100. Request yang berhasil mengembalikan `200` dengan pesan `Nilai diperbarui`. ID nilai diisi oleh script Collection berdasarkan response request sebelumnya. Nilai pada kelas final tidak dapat diubah.

### Finalisasi kelas dan sinkronisasi

Request finalisasi:

```http
POST {{base_url}}/kelas/1/finalisasi
Authorization: Bearer {{dosen_access_token}}
X-Device-ID: {{dosen1_device}}
```

Endpoint ini tidak memerlukan body. Jika berhasil, response memiliki bentuk:

```json
{
  "message": "Kelas difinalisasi dan transkrip tersinkron",
  "kelas_id": 1,
  "sync_id": "<UUID>",
  "status": "succeeded",
  "jumlah_nilai": 3
}
```

Di dalam proses antarservice, payload sinkronisasi juga memuat `payload_hash` dan `entries` berisi NIM, nilai angka, serta nilai huruf. Payload tersebut dikirim oleh Service Nilai menggunakan token service; bukan request yang perlu dibuat manual dari Postman. Request **Token user ke endpoint sinkron** sengaja membuktikan bahwa token dosen ditolak dengan `403`.

## 6. Membaca kegagalan umum

- **401 `access token tidak ada`**: request tidak membawa Bearer token. Pastikan login terkait berhasil dan jalankan request dari awal agar script menyimpan token.
- **401 saat login**: periksa Current Value password dan username pada environment yang aktif; jangan tempelkan password di chat.
- **403 pada akses NIM/kelas lain**: ini hasil yang diharapkan untuk uji ownership.
- **403 pada endpoint sinkron dengan token dosen/mahasiswa**: ini hasil yang diharapkan; endpoint hanya menerima role service.
- **403 pada akses langsung service**: bypass Gateway ditolak karena secret internal tidak ada atau salah.
- **403 untuk perubahan/finalisasi**: periksa role, kepemilikan kelas, status final, device, dan jam akses.
- **Environment variable kosong**: isi password/secret pada Current Value lokal. File environment yang dibagikan sengaja tidak menyimpan rahasia.
- **Service tidak tersedia**: pastikan `npm run dev` masih berjalan dan port pada environment sesuai konfigurasi.

## 7. Penutup pengujian

Untuk memeriksa unit/configuration tests tanpa mengakses database:

```powershell
npm test
```

Untuk Collection Runner, pastikan semua request yang mengubah data memang boleh dijalankan pada database `nilai`. Simpan hasil test, tetapi jangan ekspor environment yang berisi rahasia atau membagikan token dari response.
