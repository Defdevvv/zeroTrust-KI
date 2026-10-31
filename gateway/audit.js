'use strict';
// 4.4 Audit Log: setiap keputusan akses dicatat (waktu, subjek, endpoint, device, hasil, alasan).
// Disimpan di tabel audit_log (database) dan dicetak ke console.
const db = require('../shared/db');

const insert = db.prepare(
  `INSERT INTO audit_log (waktu, subjek, metode, endpoint, device, hasil, alasan, ip)
   VALUES (?,?,?,?,?,?,?,?)`);

const clip = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

function log({ subject = 'anonymous', method, endpoint, device = null, result, reason, ip = null }) {
  const waktu = new Date().toISOString();
  insert.run(waktu, clip(subject), method, clip(endpoint), clip(device, 100), result, clip(reason, 300), clip(ip, 60));
  const tag = result === 'allow' ? 'ALLOW' : result.toUpperCase();
  console.log(`${waktu} ${tag.padEnd(5)} ${subject} ${method} ${endpoint} dev=${device || '-'} :: ${reason}`);
}

module.exports = { log };
