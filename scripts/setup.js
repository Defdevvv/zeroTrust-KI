'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const defaults = {
  BIND_HOST: '127.0.0.1',
  GATEWAY_PORT: '3000',
  NILAI_PORT: '3001',
  TRANSKRIP_PORT: '3002',
  GATEWAY_URL: 'http://127.0.0.1:3000',
  NILAI_URL: 'http://127.0.0.1:3001',
  TRANSKRIP_URL: 'http://127.0.0.1:3002',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_DEMO_NAME: 'nilai',
  DB_USER: 'zero_trust_app',
  DB_PASSWORD: '',
  DB_POOL_SIZE: '10',
  GATEWAY_SECRET: '',
  SERVICE_CLIENT_SECRET: '',
};

function upsertEnv(content, key, value, replaceEmpty) {
  const parsed = dotenv.parse(content);
  if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] !== '') return content;
  const lines = content.split(/\r?\n/);
  let last = -1;
  for (let index = 0; index < lines.length; index++) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) last = index;
  }
  if (last >= 0 && replaceEmpty) {
    lines[last] = `${key}=${value}`;
    return lines.join('\n');
  }
  if (last >= 0) return content;
  const suffix = content.length && !content.endsWith('\n') ? '\n' : '';
  return `${content}${suffix}${key}=${value}\n`;
}

function prepareEnv() {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const value = key === 'GATEWAY_SECRET' || key === 'SERVICE_CLIENT_SECRET'
      ? crypto.randomBytes(32).toString('hex')
      : defaultValue;
    content = upsertEnv(content, key, value, key !== 'DB_PASSWORD');
  }
  fs.writeFileSync(envPath, content, { mode: 0o600 });
}

function prepareKeys() {
  const keyDir = path.join(root, 'keys');
  fs.mkdirSync(keyDir, { recursive: true });
  const privatePath = path.join(keyDir, 'private.pem');
  const publicPath = path.join(keyDir, 'public.pem');
  const hasPrivate = fs.existsSync(privatePath);
  const hasPublic = fs.existsSync(publicPath);

  if (hasPrivate && !hasPublic) {
    const publicKey = crypto.createPublicKey(fs.readFileSync(privatePath));
    fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
  } else if (!hasPrivate && !hasPublic) {
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    fs.writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
    fs.writeFileSync(publicPath, pair.publicKey);
  } else if (!hasPrivate && hasPublic) {
    throw new Error('keys/public.pem tersedia tetapi keys/private.pem tidak ada; pulihkan pasangan key yang sesuai sebelum setup');
  }
}

async function run() {
  prepareEnv();
  dotenv.config({ path: envPath });
  prepareKeys();

  const config = require('../shared/config');
  config.validateRuntimeConfig();
  config.validateSecrets();
  config.validateDatabaseConfig();

  const db = require('../shared/db');
  try {
    const state = await db.ping();
    if (state.database_name !== config.db.name) throw new Error('Koneksi MySQL tidak mengarah ke DB_DEMO_NAME yang ditentukan');
    const { migrate } = require('../shared/schema');
    const { seedData } = require('./seed');
    await migrate(db);
    await db.transaction(seedData);
    console.log(`[setup] skema dan seed siap di ${state.database_name} (MySQL ${state.version})`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error('[setup] gagal:', error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { prepareEnv, prepareKeys, run, upsertEnv };
