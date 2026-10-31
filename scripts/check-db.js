'use strict';
const mysql = require('mysql2/promise');
const config = require('../shared/config');
const { assertSupportedDatabaseVersion } = require('../shared/databaseVersion');

async function checkDatabase(name) {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: name,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name, VERSION() AS version');
    if (rows[0].database_name !== name) throw new Error('DB_TARGET_MISMATCH');
    assertSupportedDatabaseVersion(rows[0].version);
    console.log(`[db:check] ${name}: koneksi berhasil (${rows[0].version})`);
  } finally {
    await connection.end();
  }
}

async function run() {
  config.validateDatabaseConfig();
  await checkDatabase(config.db.name);
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[db:check] gagal:', error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
