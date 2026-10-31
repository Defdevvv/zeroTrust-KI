'use strict';
// Satu perintah untuk menyiapkan semuanya: .env (secret acak), key pair RS256, database + seed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
for (const d of ['data', 'keys', 'config']) fs.mkdirSync(path.join(root, d), { recursive: true });

// 1) .env dengan secret acak (tidak ditulis ulang kalau sudah ada)
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, [
    `GATEWAY_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    `SERVICE_CLIENT_SECRET=${crypto.randomBytes(24).toString('hex')}`,
    '',
  ].join('\n'), { mode: 0o600 });
  console.log('[setup] .env dibuat dengan secret acak');
} else {
  console.log('[setup] .env sudah ada, dipakai ulang');
}

// 2) Key pair RS256: private key hanya untuk gateway, public key untuk semua komponen
const priv = path.join(root, 'keys', 'private.pem');
const pub = path.join(root, 'keys', 'public.pem');
if (!fs.existsSync(priv) || !fs.existsSync(pub)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(priv, privateKey, { mode: 0o600 });
  fs.writeFileSync(pub, publicKey);
  console.log('[setup] key pair RS256 dibuat di keys/');
} else {
  console.log('[setup] key pair sudah ada, dipakai ulang');
}

// 3) Database + seed (require setelah .env ada supaya config terbaca)
require('./seed').run();
console.log('\nSelesai. Jalankan: npm start');
