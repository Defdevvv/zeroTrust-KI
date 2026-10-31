'use strict';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    password_hash VARCHAR(180) NOT NULL,
    role ENUM('mahasiswa', 'dosen', 'admin') NOT NULL,
    nama VARCHAR(200) NOT NULL,
    nim VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_nim (nim)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS devices (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    device_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_devices_user_device (user_id, device_id),
    KEY ix_devices_device_id (device_id),
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS kelas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    kode_mk VARCHAR(30) NOT NULL,
    nama_mk VARCHAR(200) NOT NULL,
    dosen_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY ix_kelas_dosen (dosen_id),
    CONSTRAINT fk_kelas_dosen FOREIGN KEY (dosen_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS nilai (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    kelas_id INT UNSIGNED NOT NULL,
    nim VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    nilai_angka DECIMAL(5,2) NOT NULL,
    nilai_huruf VARCHAR(2) NULL,
    final TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nilai_kelas_nim (kelas_id, nim),
    KEY ix_nilai_nim (nim),
    CONSTRAINT ck_nilai_range CHECK (nilai_angka BETWEEN 0 AND 100),
    CONSTRAINT fk_nilai_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_nilai_mahasiswa FOREIGN KEY (nim) REFERENCES users(nim)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS transkrip (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nim VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    kelas_id INT UNSIGNED NOT NULL,
    nilai_angka DECIMAL(5,2) NOT NULL,
    nilai_huruf VARCHAR(2) NOT NULL,
    synced_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_transkrip_nim_kelas (nim, kelas_id),
    KEY ix_transkrip_kelas (kelas_id),
    CONSTRAINT ck_transkrip_range CHECK (nilai_angka BETWEEN 0 AND 100),
    CONSTRAINT fk_transkrip_mahasiswa FOREIGN KEY (nim) REFERENCES users(nim)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_transkrip_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_refresh_tokens_hash (token_hash),
    KEY ix_refresh_tokens_user (user_id),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS service_clients (
    client_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    secret_hash VARCHAR(180) NOT NULL,
    PRIMARY KEY (client_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    waktu DATETIME(3) NOT NULL,
    subjek VARCHAR(200) NOT NULL,
    metode VARCHAR(16) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    device VARCHAR(100) NULL,
    hasil VARCHAR(16) NOT NULL,
    alasan VARCHAR(300) NOT NULL,
    ip VARCHAR(60) NULL,
    PRIMARY KEY (id),
    KEY ix_audit_log_waktu (waktu),
    KEY ix_audit_log_subject_result (subjek, hasil)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS sync_batches (
    sync_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    kelas_id INT UNSIGNED NOT NULL,
    status ENUM('pending', 'succeeded', 'failed') NOT NULL,
    payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    snapshot JSON NOT NULL,
    error_message VARCHAR(300) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (sync_id),
    KEY ix_sync_batches_kelas_status (kelas_id, status),
    CONSTRAINT fk_sync_batches_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
];

async function migrate(db) {
  for (const statement of MIGRATIONS) await db.exec(statement);
}

module.exports = { MIGRATIONS, migrate };
