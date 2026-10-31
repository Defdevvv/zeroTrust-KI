'use strict';
// Menampilkan audit log terbaru:  npm run audit  (atau: npm run audit -- 50)
const db = require('../shared/db');
const n = Math.min(Number(process.argv[2]) || 30, 500);
async function run() {
  const rows = await db.prepare(
    "SELECT waktu, subjek, CONCAT(metode, ' ', endpoint) AS endpoint, device, hasil, alasan FROM audit_log ORDER BY id DESC LIMIT ?",
  ).all(n);
  console.table(rows.reverse());
}

run()
  .catch((error) => {
    console.error('[audit] gagal membaca log:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
