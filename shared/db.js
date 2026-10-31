'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');
const { assertSupportedDatabaseVersion } = require('./databaseVersion');

config.validateDatabaseConfig();

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: true,
});

function createApi(execute, query) {
  return {
    async exec(sql) {
      await query(sql);
    },
    prepare(sql) {
      return {
        async get(...params) {
          const [rows] = await execute(sql, params);
          return rows[0];
        },
        async all(...params) {
          const [rows] = await execute(sql, params);
          return rows;
        },
        async run(...params) {
          const [result] = await execute(sql, params);
          return result;
        },
      };
    },
  };
}

const db = createApi(pool.execute.bind(pool), pool.query.bind(pool));

db.transaction = async (operation) => {
  const connection = await pool.getConnection();
  const tx = createApi(connection.execute.bind(connection), connection.query.bind(connection));
  try {
    await connection.beginTransaction();
    const result = await operation(tx);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

db.ping = async () => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS database_name, VERSION() AS version');
    assertSupportedDatabaseVersion(rows[0].version);
    return rows[0];
  } finally {
    connection.release();
  }
};

db.close = () => pool.end();
module.exports = db;
