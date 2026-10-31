'use strict';
// =====================================================================
// SERVICE TRANSKRIP — port 3002 (Resource)
// Tidak bisa diakses langsung: wajib X-Gateway-Secret + token valid (serviceGuard).
// =====================================================================
const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { serviceGuard, requireRole } = require('../shared/serviceGuard');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(serviceGuard);

const HURUF = new Set(['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E']);
const sql = {
  user: db.prepare('SELECT id, role, nim FROM users WHERE id = ?'),
  kelas: db.prepare('SELECT id FROM kelas WHERE id = ?'),
  mhs: db.prepare("SELECT 1 FROM users WHERE nim = ? AND role = 'mahasiswa'"),
  upsert: db.prepare(
    `INSERT INTO transkrip (nim, kelas_id, nilai_angka, nilai_huruf, synced_at) VALUES (?,?,?,?,?)
     ON CONFLICT(nim, kelas_id) DO UPDATE SET nilai_angka = excluded.nilai_angka,
       nilai_huruf = excluded.nilai_huruf, synced_at = excluded.synced_at`),
  byNim: db.prepare(
    `SELECT t.kelas_id, k.kode_mk, k.nama_mk, t.nilai_angka, t.nilai_huruf, t.synced_at
       FROM transkrip t JOIN kelas k ON k.id = t.kelas_id WHERE t.nim = ? ORDER BY k.kode_mk`),
  nama: db.prepare('SELECT nama FROM users WHERE nim = ?'),
};

// POST /transkrip/sinkron — HANYA token service (service-nilai). Token user mana pun ditolak.
app.post('/transkrip/sinkron', requireRole('service'), (req, res) => {
  if (req.auth.sub !== config.serviceClient.id) return res.status(403).json({ error: 'Identitas service tidak dikenal' });

  const { kelas_id, entries } = req.body || {};
  if (!Number.isInteger(kelas_id) || !sql.kelas.get(kelas_id)) return res.status(400).json({ error: 'kelas_id tidak valid' });
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 500) {
    return res.status(400).json({ error: 'entries harus array 1–500 item' });
  }
  for (const e of entries) {
    const okShape = e && typeof e.nim === 'string' && /^\d{5,20}$/.test(e.nim) &&
      typeof e.nilai_angka === 'number' && e.nilai_angka >= 0 && e.nilai_angka <= 100 &&
      HURUF.has(e.nilai_huruf);
    if (!okShape || !sql.mhs.get(e.nim)) return res.status(400).json({ error: `entry tidak valid: ${JSON.stringify(e).slice(0, 80)}` });
  }
  const now = new Date().toISOString();
  db.transaction(() => entries.forEach((e) => sql.upsert.run(e.nim, kelas_id, e.nilai_angka, e.nilai_huruf, now)))();
  res.json({ message: 'Transkrip tersinkron', kelas_id, jumlah: entries.length });
});

// GET /transkrip/:nim — mahasiswa hanya NIM sendiri; admin semua (dicek ulang di service)
app.get('/transkrip/:nim', requireRole('mahasiswa', 'admin'), (req, res) => {
  const nim = req.params.nim;
  if (!/^\d{5,20}$/.test(nim)) return res.status(400).json({ error: 'Format NIM tidak valid' });
  const user = /^\d+$/.test(String(req.auth.sub)) ? sql.user.get(Number(req.auth.sub)) : null;
  if (!user || user.role !== req.auth.role) return res.status(403).json({ error: 'User tidak valid' });
  if (user.role === 'mahasiswa' && user.nim !== nim) {
    return res.status(403).json({ error: 'Hanya boleh melihat transkrip sendiri' });
  }
  const owner = sql.nama.get(nim);
  if (!owner) return res.status(404).json({ error: 'Mahasiswa tidak ditemukan' });
  res.json({ nim, nama: owner.nama, transkrip: sql.byNim.all(nim) });
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ada' }));
const host = process.env.BIND_HOST || '127.0.0.1';
app.listen(config.ports.transkrip, host, () => console.log(`Service Transkrip aktif di http://${host}:${config.ports.transkrip}`));
