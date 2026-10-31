'use strict';
const config = require('../shared/config');
const db = require('../shared/db');
const { migrate } = require('../shared/schema');

async function run() {
  config.validateDatabaseConfig();
  const state = await db.ping();
  if (state.database_name !== config.db.name) throw new Error('Database target tidak sesuai konfigurasi');
  await migrate(db);
  console.log(`[migrate] skema MySQL siap di ${state.database_name}`);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('[migrate] gagal:', error.code || error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { run };
