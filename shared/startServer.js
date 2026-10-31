'use strict';
const config = require('./config');
const db = require('./db');

module.exports = async function startServer(app, label, port) {
  try {
    config.validateRuntimeConfig();
    config.validateSecrets();
    const state = await db.ping();
    if (state.database_name !== config.db.name) throw new Error('DB_TARGET_MISMATCH');
    app.listen(port, config.bindHost, () => {
      console.log(`${label} aktif di http://${config.bindHost}:${port} (MySQL ${state.version})`);
    });
  } catch (error) {
    console.error(
      `${label} gagal dimulai (${error.code || error.message}). Periksa MySQL Laragon dan konfigurasi lokal.`,
    );
    await db.close();
    process.exitCode = 1;
  }
};
