'use strict';
const crypto = require('crypto');
const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const asyncRoute = require('../shared/asyncRoute');
const startServer = require('../shared/startServer');
const { gradeForScore } = require('../shared/grades');
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
  batch: db.prepare('SELECT * FROM sync_batches WHERE sync_id = ?'),
  sourceRows: db.prepare(
    'SELECT nim, nilai_angka, nilai_huruf, final FROM nilai WHERE kelas_id = ? ORDER BY id',
  ),
  upsert: db.prepare(
    `INSERT INTO transkrip (nim, kelas_id, nilai_angka, nilai_huruf, synced_at) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE nilai_angka = VALUES(nilai_angka),
       nilai_huruf = VALUES(nilai_huruf), synced_at = VALUES(synced_at)`),
  byNim: db.prepare(
    `SELECT t.kelas_id, k.kode_mk, k.nama_mk, t.nilai_angka, t.nilai_huruf, t.synced_at
       FROM transkrip t JOIN kelas k ON k.id = t.kelas_id WHERE t.nim = ? ORDER BY k.kode_mk`),
  nama: db.prepare('SELECT nama FROM users WHERE nim = ?'),
};

function parseSnapshot(batch) {
  return typeof batch.snapshot === 'string' ? JSON.parse(batch.snapshot) : batch.snapshot;
}

function requestEntries(entries) {
  return entries.map(({ nim, nilai_angka, nilai_huruf }) => ({ nim, nilai_angka, nilai_huruf }));
}

function isValidEntry(entry) {
  return entry &&
    typeof entry.nim === 'string' &&
    /^\d{5,20}$/.test(entry.nim) &&
    typeof entry.nilai_angka === 'number' &&
    Number.isFinite(entry.nilai_angka) &&
    entry.nilai_angka >= 0 &&
    entry.nilai_angka <= 100 &&
    HURUF.has(entry.nilai_huruf) &&
    gradeForScore(entry.nilai_angka) === entry.nilai_huruf;
}

app.post('/transkrip/sinkron', requireRole('service'), asyncRoute(async (req, res) => {
  if (req.auth.sub !== config.serviceClient.id) {
    return res.status(403).json({ error: 'Identitas service tidak dikenal' });
  }

  const { sync_id: syncId, payload_hash: payloadHash, kelas_id: kelasId, entries } = req.body || {};
  if (
    typeof syncId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncId) ||
    typeof payloadHash !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(payloadHash) ||
    !Number.isInteger(kelasId) ||
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > 500 ||
    !entries.every(isValidEntry) ||
    new Set(entries.map((entry) => entry.nim)).size !== entries.length
  ) {
    return res.status(400).json({ error: 'Payload sinkronisasi tidak valid' });
  }
  if (!await sql.kelas.get(kelasId)) return res.status(400).json({ error: 'kelas_id tidak valid' });

  const expectedHash = crypto.createHash('sha256')
    .update(JSON.stringify({ kelas_id: kelasId, entries: requestEntries(entries) }))
    .digest('hex');
  if (expectedHash !== payloadHash) return res.status(400).json({ error: 'Hash payload tidak cocok' });

  const initialBatch = await sql.batch.get(syncId);
  if (
    !initialBatch ||
    initialBatch.kelas_id !== kelasId ||
    initialBatch.payload_hash !== payloadHash
  ) {
    return res.status(409).json({ error: 'ID sinkronisasi tidak cocok dengan snapshot final' });
  }
  const snapshot = parseSnapshot(initialBatch);
  const expectedEntries = snapshot.map(({ nim, nilai_angka, nilai_huruf }) => ({
    nim,
    nilai_angka: Number(nilai_angka),
    nilai_huruf,
  }));
  if (JSON.stringify(requestEntries(entries)) !== JSON.stringify(expectedEntries)) {
    return res.status(409).json({ error: 'Data sinkronisasi berbeda dari snapshot final' });
  }

  const sourceRows = await sql.sourceRows.all(kelasId);
  const sourceByNim = new Map(sourceRows.map((row) => [row.nim, row]));
  for (const entry of entries) {
    const source = sourceByNim.get(entry.nim);
    if (
      !await sql.mhs.get(entry.nim) ||
      !source ||
      !source.final ||
      Number(source.nilai_angka) !== entry.nilai_angka ||
      source.nilai_huruf !== entry.nilai_huruf
    ) {
      return res.status(400).json({ error: 'Mahasiswa atau nilai final sumber tidak valid' });
    }
  }

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const applied = await db.transaction(async (tx) => {
    const batch = await tx.prepare('SELECT * FROM sync_batches WHERE sync_id = ? FOR UPDATE').get(syncId);
    if (!batch || batch.kelas_id !== kelasId || batch.payload_hash !== payloadHash) return false;
    if (batch.status === 'succeeded') return true;
    if (batch.status !== 'pending') return false;

    const upsert = tx.prepare(
      `INSERT INTO transkrip (nim, kelas_id, nilai_angka, nilai_huruf, synced_at) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE nilai_angka = VALUES(nilai_angka),
         nilai_huruf = VALUES(nilai_huruf), synced_at = VALUES(synced_at)`,
    );
    for (const entry of entries) {
      await upsert.run(entry.nim, kelasId, entry.nilai_angka, entry.nilai_huruf, now);
    }
    await tx.prepare(
      "UPDATE sync_batches SET status = 'succeeded', error_message = NULL, updated_at = ? WHERE sync_id = ?",
    ).run(now, syncId);
    return true;
  });
  if (!applied) return res.status(409).json({ error: 'Sinkronisasi tidak berada pada status yang dapat diterapkan' });
  return res.json({ message: 'Transkrip tersinkron', sync_id: syncId, status: 'succeeded', kelas_id: kelasId, jumlah: entries.length });
}));

app.get('/transkrip/:nim', requireRole('mahasiswa', 'admin'), asyncRoute(async (req, res) => {
  const nim = req.params.nim;
  if (!/^\d{5,20}$/.test(nim)) return res.status(400).json({ error: 'Format NIM tidak valid' });
  const user = /^\d+$/.test(String(req.auth.sub)) ? await sql.user.get(Number(req.auth.sub)) : null;
  if (!user || user.role !== req.auth.role) return res.status(403).json({ error: 'User tidak valid' });
  if (user.role === 'mahasiswa' && user.nim !== nim) {
    return res.status(403).json({ error: 'Hanya boleh melihat transkrip sendiri' });
  }
  const owner = await sql.nama.get(nim);
  if (!owner) return res.status(404).json({ error: 'Mahasiswa tidak ditemukan' });
  return res.json({ nim, nama: owner.nama, transkrip: await sql.byNim.all(nim) });
}));

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ada' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('[service-transkrip] request gagal:', err.code || 'INTERNAL_ERROR');
  res.status(status).json({ error: status === 500 ? 'Kesalahan internal' : 'Request tidak valid' });
});

startServer(app, 'Service Transkrip', config.ports.transkrip);
