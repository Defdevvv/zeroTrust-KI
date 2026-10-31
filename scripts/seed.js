'use strict';
// Mengisi database dengan data awal (seed). Aman dijalankan berulang (reset isi tabel).
const config = require('../shared/config');
const { SCHEMA } = require('../shared/schema');
const { hashSecret } = require('../shared/secrets');

function run() {
  if (!config.serviceClient.secret) {
    throw new Error('SERVICE_CLIENT_SECRET belum ada. Jalankan: npm run setup');
  }
  const db = require('../shared/db');
  db.exec(SCHEMA);
  // Reset isi tabel (file DB tidak dihapus, jadi aman walau gateway/service sedang berjalan)
  for (const t of ['audit_log', 'refresh_tokens', 'transkrip', 'nilai', 'kelas', 'devices', 'service_clients', 'users']) {
    db.exec(`DELETE FROM ${t}`);
  }

  const addUser = db.prepare(
    'INSERT INTO users(id, username, password_hash, role, nama, nim) VALUES (?,?,?,?,?,?)');
  const addDevice = db.prepare('INSERT INTO devices(user_id, device_id) VALUES (?,?)');

  const users = [
    [1, 'admin',  'Admin123!',  'admin',     'Admin Prodi',       null,        'DEV-ADMIN-01'],
    [2, 'dosen1', 'Dosen123!',  'dosen',     'Dr. Budi Santoso',  null,        'DEV-DOSEN1-01'],
    [3, 'dosen2', 'Dosen123!',  'dosen',     'Dr. Siti Rahma',    null,        'DEV-DOSEN2-01'],
    [4, 'mhs1',   'Mhs12345!',  'mahasiswa', 'Andi Pratama',      '227006001', 'DEV-MHS1-01'],
    [5, 'mhs2',   'Mhs12345!',  'mahasiswa', 'Bella Safitri',     '227006002', 'DEV-MHS2-01'],
    [6, 'mhs3',   'Mhs12345!',  'mahasiswa', 'Citra Lestari',     '227006003', 'DEV-MHS3-01'],
  ];
  db.transaction(() => {
    for (const [id, username, pw, role, nama, nim, dev] of users) {
      addUser.run(id, username, hashSecret(pw), role, nama, nim);
      addDevice.run(id, dev);
    }
    // 2 kelas, diampu dosen berbeda
    db.prepare('INSERT INTO kelas(id,kode_mk,nama_mk,dosen_id) VALUES (?,?,?,?)')
      .run(1, 'IF301', 'Keamanan Informasi', 2);
    db.prepare('INSERT INTO kelas(id,kode_mk,nama_mk,dosen_id) VALUES (?,?,?,?)')
      .run(2, 'IF302', 'Basis Data Lanjut', 3);

    // Semua mahasiswa terdaftar di kedua kelas
    const addNilai = db.prepare('INSERT INTO nilai(kelas_id,nim,nilai_angka) VALUES (?,?,?)');
    const seedScores = {
      1: { '227006001': 88, '227006002': 76, '227006003': 69 },
      2: { '227006001': 82, '227006002': 91, '227006003': 73 },
    };
    for (const [kelasId, rows] of Object.entries(seedScores)) {
      for (const [nim, skor] of Object.entries(rows)) addNilai.run(Number(kelasId), nim, skor);
    }

    // Client untuk token service (secret disimpan sebagai hash)
    db.prepare('INSERT INTO service_clients(client_id, secret_hash) VALUES (?,?)')
      .run(config.serviceClient.id, hashSecret(config.serviceClient.secret));
  })();
  console.log('[seed] database dibuat:', config.dbPath);
}

module.exports = { run };
if (require.main === module) run();
