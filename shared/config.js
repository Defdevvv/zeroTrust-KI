'use strict';
// Konfigurasi terpusat. Rahasia (secret) dibaca dari .env, TIDAK di-hardcode.
const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });

process.env.TZ = process.env.TZ || 'Asia/Jakarta'; // jam akses mengikuti WIB

module.exports = {
  root,
  ports: {
    gateway: Number(process.env.GATEWAY_PORT) || 3000,
    nilai: Number(process.env.NILAI_PORT) || 3001,
    transkrip: Number(process.env.TRANSKRIP_PORT) || 3002,
  },
  urls: {
    gateway: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
    nilai: process.env.NILAI_URL || 'http://127.0.0.1:3001',
    transkrip: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002',
  },
  gatewaySecret: process.env.GATEWAY_SECRET,
  serviceClient: {
    id: 'service-nilai',
    secret: process.env.SERVICE_CLIENT_SECRET,
  },
  dbPath: path.join(root, 'data', 'app.db'),
  keys: {
    private: path.join(root, 'keys', 'private.pem'), // hanya dibaca GATEWAY
    public: path.join(root, 'keys', 'public.pem'),   // dibaca gateway + service
  },
  jwt: {
    issuer: 'zt-gateway',
    audience: 'zt-sistem-nilai',
    accessTtl: '10m',   // access token user: 10 menit
    serviceTtl: '5m',   // token service: 5 menit
  },
  refreshTtlMs: 24 * 60 * 60 * 1000, // refresh token: 1 hari
  policyFile: path.join(root, 'config', 'policy.json'), // jam akses, dibaca ulang tiap request
  login: { maxFails: 5, windowMs: 5 * 60 * 1000 },
};
