'use strict';
// =====================================================================
// SERVICE NILAI — port 3001 (Resource)
// Tidak bisa diakses langsung: wajib X-Gateway-Secret + token valid (serviceGuard).
// Prinsip "assume breach": service juga membatasi data berdasarkan identitas di token,
// jadi bug/bypass di gateway tidak otomatis membocorkan data.
// =====================================================================
const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { serviceGuard, requireRole } = require('../shared/serviceGuard');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
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
  update: db.prepare("UPDATE nilai SET nilai_angka = ?, updated_at = ? WHERE id = ? AND final = 0"),
  kelasRows: db.prepare('SELECT id, nim, nilai_angka, final FROM nilai WHERE kelas_id = ?'),
  setFinal: db.prepare('UPDATE nilai SET final = 1, nilai_huruf = ? WHERE id = ? AND final = 0'),
  unsetFinal: db.prepare('UPDATE nilai SET final = 0, nilai_huruf = NULL WHERE id = ?'),
};

const toId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const currentUser = (req) => (/^\d+$/.test(String(req.auth.sub)) ? sql.user.get(Number(req.auth.sub)) : null);

function toHuruf(a) {
  if (a >= 85) return 'A';
  if (a >= 80) return 'A-';
  if (a >= 75) return 'B+';
  if (a >= 70) return 'B';
  if (a >= 65) return 'B-';
  if (a >= 60) return 'C+';
  if (a >= 55) return 'C';
  if (a >= 40) return 'D';
  return 'E';
}

// GET /nilai — data selalu dibatasi berdasarkan identitas di token
app.get('/nilai', requireRole('mahasiswa', 'dosen'), (req, res) => {
  const user = currentUser(req);
  if (!user || user.role !== req.auth.role) return res.status(403).json({ error: 'User tidak valid' });
  if (user.role === 'mahasiswa') return res.json({ data: sql.listMhs.all(user.nim) });
  const kelasId = req.query.kelas_id !== undefined ? toId(req.query.kelas_id) : null;
  res.json({ data: sql.listDosen.all(user.id, kelasId, kelasId) });
});

// PUT /nilai/:id — ubah nilai (dosen pengampu, belum final)
app.put('/nilai/:id', requireRole('dosen'), (req, res) => {
  const user = currentUser(req);
  const row = sql.nilaiById.get(toId(req.params.id));
  if (!user || !row) return res.status(404).json({ error: 'Data nilai tidak ditemukan' });
  if (row.dosen_id !== user.id) return res.status(403).json({ error: 'Kelas bukan yang Anda ampu' });
  if (row.final) return res.status(403).json({ error: 'Nilai sudah final' });

  const skor = req.body && req.body.nilai_angka;
  if (typeof skor !== 'number' || !Number.isFinite(skor) || skor < 0 || skor > 100) {
    return res.status(400).json({ error: 'nilai_angka harus angka 0–100' });
  }
  sql.update.run(skor, new Date().toISOString(), row.id);
  res.json({ message: 'Nilai diperbarui', id: row.id, nilai_angka: skor });
});

// ---- Token service untuk memanggil Service Transkrip (melalui gateway) ----
let cached = { token: null, exp: 0 };
async function getServiceToken() {
  if (cached.token && Date.now() < cached.exp - 30_000) return cached.token;
  const r = await fetch(`${config.urls.gateway}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.serviceClient.id, client_secret: config.serviceClient.secret }),
  });
  if (!r.ok) throw new Error(`gagal mengambil token service (HTTP ${r.status})`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

// POST /kelas/:id/finalisasi — finalisasi nilai lalu sinkron ke transkrip VIA GATEWAY
app.post('/kelas/:id/finalisasi', requireRole('dosen'), async (req, res) => {
  const user = currentUser(req);
  const kelas = sql.kelas.get(toId(req.params.id));
  if (!user || !kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== user.id) return res.status(403).json({ error: 'Kelas bukan yang Anda ampu' });

  const pending = sql.kelasRows.all(kelas.id).filter((r) => !r.final);
  if (pending.length === 0) return res.status(409).json({ error: 'Kelas sudah difinalisasi atau tidak ada nilai' });

  // Kunci nilai (final=1) dulu agar tidak bisa diubah selama sinkronisasi berlangsung
  const entries = pending.map((r) => ({ id: r.id, nim: r.nim, nilai_angka: r.nilai_angka, nilai_huruf: toHuruf(r.nilai_angka) }));
  db.transaction(() => entries.forEach((e) => sql.setFinal.run(e.nilai_huruf, e.id)))();

  try {
    const token = await getServiceToken();
    const r = await fetch(`${config.urls.gateway}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kelas_id: kelas.id,
        entries: entries.map(({ nim, nilai_angka, nilai_huruf }) => ({ nim, nilai_angka, nilai_huruf })),
      }),
    });
    if (!r.ok) {
      if (r.status === 401) cached = { token: null, exp: 0 };
      throw new Error(`gateway/transkrip menolak sinkronisasi (HTTP ${r.status})`);
    }
  } catch (err) {
    // Sinkron gagal -> batalkan finalisasi supaya data tetap konsisten (dosen bisa mencoba lagi)
    db.transaction(() => entries.forEach((e) => sql.unsetFinal.run(e.id)))();
    return res.status(502).json({ error: `Finalisasi dibatalkan: ${err.message}` });
  }
  res.json({
    message: 'Kelas difinalisasi dan transkrip tersinkron',
    kelas_id: kelas.id,
    jumlah_nilai: entries.length,
  });
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ada' }));
const host = process.env.BIND_HOST || '127.0.0.1';
app.listen(config.ports.nilai, host, () => console.log(`Service Nilai aktif di http://${host}:${config.ports.nilai}`));
