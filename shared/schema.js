'use strict';
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nama TEXT NOT NULL,
  nim TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  UNIQUE (user_id, device_id)
);
CREATE TABLE IF NOT EXISTS kelas (
  id INTEGER PRIMARY KEY,
  kode_mk TEXT NOT NULL,
  nama_mk TEXT NOT NULL,
  dosen_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS nilai (
  id INTEGER PRIMARY KEY,
  kelas_id INTEGER NOT NULL REFERENCES kelas(id),
  nim TEXT NOT NULL,
  nilai_angka REAL NOT NULL,
  nilai_huruf TEXT,
  final INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  UNIQUE (kelas_id, nim)
);
CREATE TABLE IF NOT EXISTS transkrip (
  id INTEGER PRIMARY KEY,
  nim TEXT NOT NULL,
  kelas_id INTEGER NOT NULL REFERENCES kelas(id),
  nilai_angka REAL NOT NULL,
  nilai_huruf TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE (nim, kelas_id)
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_clients (
  client_id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  waktu TEXT NOT NULL,
  subjek TEXT NOT NULL,
  metode TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  device TEXT,
  hasil TEXT NOT NULL,
  alasan TEXT NOT NULL,
  ip TEXT
);
`;
module.exports = { SCHEMA };
