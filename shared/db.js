'use strict';
// SQLite memakai modul BAWAAN Node (node:sqlite) -> tidak perlu kompilasi / Visual Studio.
// Wrapper tipis ini menyediakan API sederhana: exec, pragma, prepare(get/all/run), transaction, close.
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

function open(file) {
  const raw = new DatabaseSync(file);
  const db = {
    exec: (sql) => raw.exec(sql),
    pragma: (text) => raw.exec(`PRAGMA ${text}`),
    prepare(sql) {
      const st = raw.prepare(sql);
      return {
        get: (...a) => st.get(...a),
        all: (...a) => st.all(...a),
        run: (...a) => st.run(...a),
      };
    },
    // Transaksi: semua berhasil atau semua dibatalkan
    transaction: (fn) => (...args) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => raw.close(),
  };
  db.pragma('journal_mode = WAL');   // gateway + 2 service boleh akses bersamaan
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

const db = open(config.dbPath);
db.open = open;
module.exports = db;
