'use strict';
const config = require('../shared/config');
const db = require('../shared/db');
const { migrate } = require('../shared/schema');
const { seedData } = require('./seed');
const { resetData } = require('./reset-data');

function assertDemoTarget() {
  if (!config.db.name) throw new Error('DB_DEMO_NAME kosong; reset dibatalkan');
}

async function run() {
  assertDemoTarget();
  config.validateDatabaseConfig();
  config.validateSecrets();
  console.log(`[reset-db] target yang akan direset: ${config.db.name}`);

  const state = await db.ping();
  if (state.database_name !== config.db.name) {
    throw new Error('Koneksi database tidak cocok dengan target demo; reset dibatalkan');
  }
  await migrate(db);
  const counts = await resetData(db, seedData);
  console.log(`[reset-db] selesai untuk ${state.database_name}`);
  console.log(`[reset-db] users=${counts.users}, devices=${counts.devices}, kelas=${counts.kelas}, nilai=${counts.nilai}, transkrip=${counts.transkrip}, refresh_tokens=${counts.refresh_tokens}, service_clients=${counts.service_clients}, audit_log=${counts.audit_log}, sync_batches=${counts.sync_batches}`);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('[reset-db] gagal:', error.code || error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { assertDemoTarget, run };
