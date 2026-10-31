'use strict';
const config = require('../shared/config');
const db = require('../shared/db');
const { migrate } = require('../shared/schema');
const { hashSecret } = require('../shared/secrets');

const USERS = [
  [1, 'admin', 'Admin123!', 'admin', 'Admin Prodi', null, 'DEV-ADMIN-01'],
  [2, 'dosen1', 'Dosen123!', 'dosen', 'Dr. Budi Santoso', null, 'DEV-DOSEN1-01'],
  [3, 'dosen2', 'Dosen123!', 'dosen', 'Dr. Siti Rahma', null, 'DEV-DOSEN2-01'],
  [4, 'mhs1', 'Mhs12345!', 'mahasiswa', 'Andi Pratama', '227006001', 'DEV-MHS1-01'],
  [5, 'mhs2', 'Mhs12345!', 'mahasiswa', 'Bella Safitri', '227006002', 'DEV-MHS2-01'],
  [6, 'mhs3', 'Mhs12345!', 'mahasiswa', 'Citra Lestari', '227006003', 'DEV-MHS3-01'],
];

async function seedData(tx) {
  const addUser = tx.prepare(
    'INSERT IGNORE INTO users (id, username, password_hash, role, nama, nim) VALUES (?,?,?,?,?,?)',
  );
  const addDevice = tx.prepare('INSERT IGNORE INTO devices (id, user_id, device_id) VALUES (?,?,?)');
  for (const [id, username, password, role, nama, nim, device] of USERS) {
    await addUser.run(id, username, hashSecret(password), role, nama, nim);
    await addDevice.run(id, id, device);
  }

  const addKelas = tx.prepare(
    `INSERT INTO kelas (id, kode_mk, nama_mk, dosen_id) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE kode_mk = VALUES(kode_mk), nama_mk = VALUES(nama_mk), dosen_id = VALUES(dosen_id)`,
  );
  await addKelas.run(1, 'IF301', 'Keamanan Informasi', 2);
  await addKelas.run(2, 'IF302', 'Basis Data Lanjut', 3);

  const scores = [
    [1, 1, '227006001', 88], [2, 1, '227006002', 76], [3, 1, '227006003', 69],
    [4, 2, '227006001', 82], [5, 2, '227006002', 91], [6, 2, '227006003', 73],
  ];
  const addNilai = tx.prepare(
    'INSERT IGNORE INTO nilai (id, kelas_id, nim, nilai_angka) VALUES (?,?,?,?)',
  );
  for (const row of scores) await addNilai.run(...row);

  await tx.prepare(
    `INSERT INTO service_clients (client_id, secret_hash) VALUES (?,?)
     ON DUPLICATE KEY UPDATE secret_hash = VALUES(secret_hash)`,
  ).run(config.serviceClient.id, hashSecret(config.serviceClient.secret));
}

async function run() {
  config.validateDatabaseConfig();
  config.validateSecrets();
  const state = await db.ping();
  if (state.database_name !== config.db.name) throw new Error('Database target tidak sesuai konfigurasi');
  await migrate(db);
  await db.transaction(seedData);
  console.log(`[seed] data awal tersedia di database ${state.database_name}`);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('[seed] gagal:', error.code || error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { run, seedData };
