'use strict';
// Menampilkan audit log terbaru:  npm run audit  (atau: npm run audit -- 50)
const db = require('../shared/db');
const n = Math.min(Number(process.argv[2]) || 30, 500);
const rows = db.prepare(
  'SELECT waktu, subjek, metode || \' \' || endpoint AS endpoint, device, hasil, alasan FROM audit_log ORDER BY id DESC LIMIT ?'
).all(n).reverse();
console.table(rows);
