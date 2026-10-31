'use strict';
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

process.env.TZ = process.env.TZ || 'Asia/Jakarta';

function port(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} harus berupa port antara 1 dan 65535`);
  }
  return value;
}

function databaseName(name) {
  const value = process.env[name] || '';
  if (!value) return '';
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`${name} wajib diisi dan hanya boleh berisi huruf, angka, atau underscore`);
  }
  return value;
}

const ports = {
  gateway: port('GATEWAY_PORT', 3000),
  nilai: port('NILAI_PORT', 3001),
  transkrip: port('TRANSKRIP_PORT', 3002),
};
const urls = {
  gateway: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
  nilai: process.env.NILAI_URL || 'http://127.0.0.1:3001',
  transkrip: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002',
};
const db = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: port('DB_PORT', 3306),
  name: databaseName('DB_DEMO_NAME'),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: port('DB_POOL_SIZE', 10),
};
const bindHost = process.env.BIND_HOST || '127.0.0.1';

function validateUrl(name, value, expectedPort) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} harus berupa URL HTTP yang valid`);
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== bindHost ||
    Number(url.port || 80) !== expectedPort ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} harus menggunakan host ${bindHost} dan port ${expectedPort}`);
  }
}

function validateRuntimeConfig() {
  validateUrl('GATEWAY_URL', urls.gateway, ports.gateway);
  validateUrl('NILAI_URL', urls.nilai, ports.nilai);
  validateUrl('TRANSKRIP_URL', urls.transkrip, ports.transkrip);
}

function validateDatabaseConfig() {
  const missing = [];
  for (const [name, value] of [
    ['DB_HOST', db.host],
    ['DB_PORT', process.env.DB_PORT || '3306'],
    ['DB_DEMO_NAME', db.name],
    ['DB_USER', db.user],
  ]) {
    if (!value) missing.push(name);
  }
  if (missing.length) {
    throw new Error(`Konfigurasi MySQL belum lengkap. Isi variabel: ${missing.join(', ')}`);
  }
}

function validateSecrets() {
  const missing = ['GATEWAY_SECRET', 'SERVICE_CLIENT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Secret aplikasi belum tersedia: ${missing.join(', ')}. Jalankan npm run setup`);
}

module.exports = {
  root,
  bindHost,
  ports,
  urls,
  db,
  gatewaySecret: process.env.GATEWAY_SECRET,
  serviceClient: {
    id: 'service-nilai',
    secret: process.env.SERVICE_CLIENT_SECRET,
  },
  keys: {
    private: path.join(root, 'keys', 'private.pem'),
    public: path.join(root, 'keys', 'public.pem'),
  },
  jwt: {
    issuer: 'zt-gateway',
    audience: 'zt-sistem-nilai',
    accessTtl: '10m',
    serviceTtl: '5m',
  },
  refreshTtlMs: 24 * 60 * 60 * 1000,
  policyFile: path.join(root, 'config', 'policy.json'),
  login: { maxFails: 5, windowMs: 5 * 60 * 1000 },
  validateRuntimeConfig,
  validateDatabaseConfig,
  validateSecrets,
};
