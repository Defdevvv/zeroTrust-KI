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

const sql = {
  user: db.prepare('SELECT id, role, nim FROM users WHERE id = ?'),
  kelas: db.prepare('SELECT * FROM kelas WHERE id = ?'),
  nilaiById: db.prepare('SELECT n.*, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?'),
  listMhs: db.prepare(
    `SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, n.nim, n.nilai_angka, n.nilai_huruf, n.final
       FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.nim = ? ORDER BY n.id`),
  listDosen: db.prepare(
    `SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, n.nim, n.nilai_angka, n.nilai_huruf, n.final
       FROM nilai n JOIN kelas k ON k.id = n.kelas_id
      WHERE k.dosen_id = ? AND (? IS NULL OR n.kelas_id = ?) ORDER BY n.id`),
  update: db.prepare('UPDATE nilai SET nilai_angka = ?, updated_at = ? WHERE id = ? AND final = 0'),
  latestBatch: db.prepare('SELECT * FROM sync_batches WHERE kelas_id = ? ORDER BY created_at DESC LIMIT 1'),
};

const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const currentUser = async (req) => (/^\d+$/.test(String(req.auth.sub)) ? sql.user.get(Number(req.auth.sub)) : null);

function batchSnapshot(batch) {
  return typeof batch.snapshot === 'string' ? JSON.parse(batch.snapshot) : batch.snapshot;
}

app.get('/nilai', requireRole('mahasiswa', 'dosen'), asyncRoute(async (req, res) => {
  const user = await currentUser(req);
  if (!user || user.role !== req.auth.role) return res.status(403).json({ error: 'User tidak valid' });
  if (user.role === 'mahasiswa') return res.json({ data: await sql.listMhs.all(user.nim) });
  const kelasId = req.query.kelas_id !== undefined ? toId(req.query.kelas_id) : null;
  return res.json({ data: await sql.listDosen.all(user.id, kelasId, kelasId) });
}));

app.put('/nilai/:id', requireRole('dosen'), asyncRoute(async (req, res) => {
  const user = await currentUser(req);
  const row = await sql.nilaiById.get(toId(req.params.id));
  if (!user || !row) return res.status(404).json({ error: 'Data nilai tidak ditemukan' });
  if (row.dosen_id !== user.id) return res.status(403).json({ error: 'Kelas bukan yang Anda ampu' });
  if (row.final) return res.status(403).json({ error: 'Nilai sudah final' });

  const skor = req.body && req.body.nilai_angka;
  if (typeof skor !== 'number' || !Number.isFinite(skor) || skor < 0 || skor > 100) {
    return res.status(400).json({ error: 'nilai_angka harus angka 0–100' });
  }
  const update = await sql.update.run(skor, new Date().toISOString().replace('T', ' ').replace('Z', ''), row.id);
  if (!update.affectedRows) return res.status(409).json({ error: 'Nilai berubah menjadi final; perubahan ditolak' });
  return res.json({ message: 'Nilai diperbarui', id: row.id, nilai_angka: skor });
}));

let cached = { token: null, exp: 0 };
async function getServiceToken() {
  if (cached.token && Date.now() < cached.exp - 30_000) return cached.token;
  const response = await fetch(`${config.urls.gateway}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.serviceClient.id, client_secret: config.serviceClient.secret }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`AUTH_HTTP_${response.status}`);
  const payload = await response.json();
  cached = { token: payload.access_token, exp: Date.now() + payload.expires_in * 1000 };
  return cached.token;
}

async function createOrLoadBatch(kelasId) {
  return db.transaction(async (tx) => {
    await tx.prepare('SELECT id FROM kelas WHERE id = ? FOR UPDATE').get(kelasId);
    const previous = await tx.prepare(
      'SELECT * FROM sync_batches WHERE kelas_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
    ).get(kelasId);
    if (previous) {
      if (previous.status === 'succeeded') return previous;
      if (previous.status === 'failed') {
        await tx.prepare(
          "UPDATE sync_batches SET status = 'pending', error_message = NULL, updated_at = ? WHERE sync_id = ?",
        ).run(new Date().toISOString().replace('T', ' ').replace('Z', ''), previous.sync_id);
        return { ...previous, status: 'pending', error_message: null };
      }
      return previous;
    }

    const rows = await tx.prepare(
      'SELECT id, nim, nilai_angka, final FROM nilai WHERE kelas_id = ? ORDER BY id FOR UPDATE',
    ).all(kelasId);
    if (rows.some((row) => row.final)) return { tooMany: false, inconsistent: true };
    const pending = rows.filter((row) => !row.final);
    if (pending.length === 0) return null;
    if (pending.length > 500) return { tooMany: true };

    const entries = pending.map((row) => ({
      id: row.id,
      nim: row.nim,
      nilai_angka: Number(row.nilai_angka),
      nilai_huruf: gradeForScore(Number(row.nilai_angka)),
    }));
    const syncId = crypto.randomUUID();
    const syncEntries = entries.map(({ nim, nilai_angka, nilai_huruf }) => ({ nim, nilai_angka, nilai_huruf }));
    const payloadHash = crypto.createHash('sha256')
      .update(JSON.stringify({ kelas_id: kelasId, entries: syncEntries }))
      .digest('hex');
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const setFinal = tx.prepare('UPDATE nilai SET final = 1, nilai_huruf = ? WHERE id = ? AND final = 0');
    for (const entry of entries) await setFinal.run(entry.nilai_huruf, entry.id);
    await tx.prepare(
      `INSERT INTO sync_batches (sync_id, kelas_id, status, payload_hash, snapshot, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    ).run(syncId, kelasId, payloadHash, JSON.stringify(entries), now, now);
    return {
      sync_id: syncId,
      kelas_id: kelasId,
      status: 'pending',
      payload_hash: payloadHash,
      snapshot: entries,
    };
  });
}

async function synchronize(batch) {
  const entries = batchSnapshot(batch);
  const token = await getServiceToken();
  const response = await fetch(`${config.urls.gateway}/transkrip/sinkron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sync_id: batch.sync_id,
      payload_hash: batch.payload_hash,
      kelas_id: batch.kelas_id,
      entries: entries.map(({ nim, nilai_angka, nilai_huruf }) => ({ nim, nilai_angka, nilai_huruf })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401) cached = { token: null, exp: 0 };
  if (!response.ok) throw new Error(`SYNC_HTTP_${response.status}`);
  const result = await response.json();
  if (result.sync_id !== batch.sync_id || result.status !== 'succeeded') {
    throw new Error('SYNC_RESPONSE_INVALID');
  }
}

async function finishBatch(batch, error) {
  const state = await sql.latestBatch.get(batch.kelas_id);
  if (state && state.sync_id === batch.sync_id && state.status === 'succeeded') return true;
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const reason = error.name === 'TimeoutError' ? 'timeout' : (error.message || 'network_error').slice(0, 300);
  const updated = await db.prepare(
    "UPDATE sync_batches SET status = 'failed', error_message = ?, updated_at = ? WHERE sync_id = ? AND status = 'pending'",
  ).run(reason, now, batch.sync_id);
  if (!updated.affectedRows) {
    const reconciled = await sql.latestBatch.get(batch.kelas_id);
    return reconciled && reconciled.sync_id === batch.sync_id && reconciled.status === 'succeeded';
  }
  return false;
}

app.post('/kelas/:id/finalisasi', requireRole('dosen'), asyncRoute(async (req, res) => {
  const user = await currentUser(req);
  const kelas = await sql.kelas.get(toId(req.params.id));
  if (!user || !kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== user.id) return res.status(403).json({ error: 'Kelas bukan yang Anda ampu' });

  const batch = await createOrLoadBatch(kelas.id);
  if (batch && batch.tooMany) {
    return res.status(413).json({ error: 'Jumlah nilai kelas melebihi batas sinkronisasi 500' });
  }
  if (batch && batch.inconsistent) {
    return res.status(409).json({ error: 'Status nilai final tidak memiliki batch sinkronisasi; diperlukan rekonsiliasi' });
  }
  if (!batch) return res.status(409).json({ error: 'Kelas sudah difinalisasi atau tidak ada nilai' });
  if (batch.status === 'succeeded') {
    return res.json({
      message: 'Kelas difinalisasi dan transkrip tersinkron',
      kelas_id: kelas.id,
      sync_id: batch.sync_id,
      status: batch.status,
      jumlah_nilai: batchSnapshot(batch).length,
    });
  }

  try {
    await synchronize(batch);
  } catch (error) {
    if (await finishBatch(batch, error)) {
      return res.json({
        message: 'Kelas difinalisasi dan transkrip tersinkron',
        kelas_id: kelas.id,
        sync_id: batch.sync_id,
        status: 'succeeded',
        jumlah_nilai: batchSnapshot(batch).length,
      });
    }
    return res.status(502).json({
      error: 'Sinkronisasi gagal; nilai tetap terkunci dan dapat dicoba ulang',
      kelas_id: kelas.id,
      sync_id: batch.sync_id,
      status: 'failed',
    });
  }

  return res.json({
    message: 'Kelas difinalisasi dan transkrip tersinkron',
    kelas_id: kelas.id,
    sync_id: batch.sync_id,
    status: 'succeeded',
    jumlah_nilai: batchSnapshot(batch).length,
  });
}));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('[service-nilai] request gagal:', err.code || 'INTERNAL_ERROR');
  res.status(status).json({ error: status === 500 ? 'Kesalahan internal' : 'Request tidak valid' });
});

startServer(app, 'Service Nilai', config.ports.nilai);
