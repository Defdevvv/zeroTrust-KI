'use strict';

const TABLES = [
  'sync_batches',
  'audit_log',
  'refresh_tokens',
  'transkrip',
  'nilai',
  'kelas',
  'devices',
  'service_clients',
  'users',
];

async function resetData(db, seedData) {
  return db.transaction(async (tx) => {
    for (const table of TABLES) await tx.exec(`DELETE FROM ${table}`);
    await seedData(tx);
    const counts = {};
    for (const table of TABLES) {
      const row = await tx.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      counts[table] = Number(row.count);
    }
    return counts;
  });
}

module.exports = { resetData, TABLES };
