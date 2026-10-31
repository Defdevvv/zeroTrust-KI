'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const baseEnv = {
  ...process.env,
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
  DB_PASSWORD: 'unit-test-only',
};

function runNode(source, overrides = {}) {
  return execFileSync(process.execPath, ['-e', source], {
    cwd: root,
    env: { ...baseEnv, ...overrides },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

let passed = 0;
function check(name, operation) {
  operation();
  passed++;
  console.log(`  ✓ ${name}`);
}

check('default port and URL pairs pass startup validation', () => {
  assert.equal(
    runNode("const c=require('./shared/config');c.validateRuntimeConfig();c.validateDatabaseConfig();console.log('ok')"),
    'ok',
  );
});

check('database password may be empty when the MySQL account has no password', () => {
  assert.equal(
    runNode("require('./shared/config').validateDatabaseConfig();console.log('ok')", {
      DB_PASSWORD: '',
    }),
    'ok',
  );
});

check('custom service ports require matching URLs', () => {
  assert.throws(() => runNode(
    "require('./shared/config').validateRuntimeConfig()",
    { NILAI_PORT: '3101', NILAI_URL: 'http://127.0.0.1:3001' },
  ));
});

check('matching custom ports and URLs pass startup validation', () => {
  assert.equal(
    runNode("require('./shared/config').validateRuntimeConfig();console.log('ok')", {
      GATEWAY_PORT: '3100',
      NILAI_PORT: '3101',
      TRANSKRIP_PORT: '3102',
      GATEWAY_URL: 'http://127.0.0.1:3100',
      NILAI_URL: 'http://127.0.0.1:3101',
      TRANSKRIP_URL: 'http://127.0.0.1:3102',
    }),
    'ok',
  );
});

check('DB_DEMO_NAME is the sole database target even when legacy DB_NAME exists', () => {
  assert.equal(
    runNode("const c=require('./shared/config');c.validateDatabaseConfig();console.log(c.db.name)", {
      DB_NAME: 'legacy_database_name',
    }),
    'nilai',
  );
});

check('demo reset refuses an empty DB_DEMO_NAME', () => {
  assert.throws(() => runNode(
    "require('./scripts/reset-db').assertDemoTarget()",
    { DB_DEMO_NAME: '' },
  ));
});

check('e2e requires explicit confirmation before using the single database', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['tests/e2e.js'], {
      cwd: root,
      env: { ...baseEnv, E2E_DB_CONFIRM: '' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    /E2E_DB_CONFIRM/,
  );
});

check('migration is idempotent and reset contains no database drop', () => {
  const schema = fs.readFileSync(path.join(root, 'shared', 'schema.js'), 'utf8');
  const reset = fs.readFileSync(path.join(root, 'scripts', 'reset-db.js'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS/);
  assert.match(schema, /sync_batches/);
  assert.doesNotMatch(reset, /DROP\s+DATABASE/i);
});

check('setup preserves existing secrets and leaves database password operator-controlled', () => {
  const { upsertEnv } = require('../scripts/setup');
  const original = 'GATEWAY_SECRET=keep-this\nSERVICE_CLIENT_SECRET=also-keep\n';
  const preserved = upsertEnv(original, 'GATEWAY_SECRET', 'generated', true);
  assert.equal(preserved, original);
  const withPassword = upsertEnv(preserved, 'DB_PASSWORD', '', false);
  assert.match(withPassword, /DB_PASSWORD=$/m);
});

check('score-to-letter boundaries are validated consistently', () => {
  const { gradeForScore } = require('../shared/grades');
  assert.equal(gradeForScore(85), 'A');
  assert.equal(gradeForScore(84.99), 'A-');
  assert.equal(gradeForScore(75), 'B+');
  assert.equal(gradeForScore(40), 'D');
  assert.equal(gradeForScore(39.99), 'E');
  assert.equal(gradeForScore(100.01), null);
});

check('database versions enforce CHECK constraint support', () => {
  const { assertSupportedDatabaseVersion } = require('../shared/databaseVersion');
  assert.doesNotThrow(() => assertSupportedDatabaseVersion('8.0.16'));
  assert.doesNotThrow(() => assertSupportedDatabaseVersion('8.4.3'));
  assert.doesNotThrow(() => assertSupportedDatabaseVersion('10.2.7-MariaDB'));
  assert.doesNotThrow(() => assertSupportedDatabaseVersion('5.5.5-10.11.6-MariaDB'));
  assert.throws(() => assertSupportedDatabaseVersion('5.7.8'), /MySQL 8\.0\.16\+/);
  assert.throws(() => assertSupportedDatabaseVersion('10.2.6-MariaDB'), /MariaDB 10\.2\.7\+/);
});

check('Postman Collection 2.1 scripts and JSON request bodies are valid', () => {
  const collection = JSON.parse(fs.readFileSync(
    path.join(root, 'postman', 'Zero-Trust-Nilai.postman_collection.json'),
    'utf8',
  ));
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.deepEqual(collection.info.version, { major: 1, minor: 0, patch: 0 });
  assert.ok(!collection.info._postman_id ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(collection.info._postman_id));
  const preRequest = collection.event.find((event) => event.listen === 'prerequest');
  assert.ok(preRequest);
  const preRequestScript = preRequest.script.exec.join('\n');
  assert.match(preRequestScript, /Environment \$\{loginPasswords\[name\]\} masih kosong/);
  assert.match(preRequestScript, /Token \$\{tokenKeys\[name\]\} belum tersedia/);
  for (const event of collection.event) {
    assert.doesNotThrow(() => new Function(event.script.exec.join('\n')));
  }
  const requests = collection.item.flatMap((folder) => folder.item);
  assert.ok(requests.length >= 30);
  for (const item of requests) {
    assert.ok(item.request.url && typeof item.request.url === 'object');
    if (item.request.body) {
      assert.equal(item.request.body.options.raw.language, 'json');
      assert.ok(item.request.header.some((header) => header.key.toLowerCase() === 'content-type'));
      assert.doesNotThrow(() => JSON.parse(item.request.body.raw.replace(/\{\{[^}]+\}\}/g, 'placeholder')));
    }
  }
});

check('tracked Postman environment contains no secret values', () => {
  const environment = JSON.parse(fs.readFileSync(
    path.join(root, 'postman', 'Laragon-Local.postman_environment.json'),
    'utf8',
  ));
  const keys = new Set(environment.values.map((value) => value.key));
  for (const key of ['admin_password', 'dosen1_password', 'dosen2_password', 'mhs1_password', 'mhs2_password', 'service_client_secret', 'gateway_secret']) {
    assert.ok(keys.has(key), `missing Postman environment variable: ${key}`);
  }
  for (const value of environment.values) {
    if (/_password$|_secret$/.test(value.key)) assert.equal(value.value, '');
  }
});

console.log(`Unit tests: ${passed} passed`);
