'use strict';
// Uji otomatis seluruh kebutuhan Bagian 4. Uji ini mengubah database aktif.
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const config = require('../shared/config');
config.validateDatabaseConfig();
if (process.env.E2E_DB_CONFIRM !== config.db.name) {
  throw new Error('E2E dibatalkan. Set E2E_DB_CONFIRM sama dengan DB_DEMO_NAME setelah memastikan perubahan data dapat diterima.');
}
const db = require('../shared/db');
const { sha256, verifySecret } = require('../shared/secrets');

const GW = config.urls.gateway, SVC_NILAI = config.urls.nilai;
const DEV = { admin: 'DEV-ADMIN-01', dosen1: 'DEV-DOSEN1-01', dosen2: 'DEV-DOSEN2-01', mhs1: 'DEV-MHS1-01', mhs2: 'DEV-MHS2-01' };
const PASS = { admin: 'Admin123!', dosen1: 'Dosen123!', dosen2: 'Dosen123!', mhs1: 'Mhs12345!', mhs2: 'Mhs12345!' };

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
async function call(method, path, { token, device, body, base = GW, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (device) h['X-Device-ID'] = device;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch { /* kosong */ }
  return { status: r.status, body: json };
}
const login = (u, device = DEV[u], password = PASS[u]) =>
  call('POST', '/auth/login', { device, body: { username: u, password } });

(async () => {
  const state = await db.ping();
  if (state.database_name !== config.db.name) throw new Error('Koneksi E2E tidak mengarah ke DB_DEMO_NAME');

  // Agar hasil uji tidak bergantung jam komputer, jam akses dibuka penuh selama uji
  // (file asli dikembalikan di akhir). Skenario "di luar jam akses" diuji terpisah di bawah.
  const original = fs.readFileSync(config.policyFile, 'utf8');
  const openAll = JSON.stringify({ access_hours: { start: '00:00', end: '24:00' } });
  process.on('exit', () => fs.writeFileSync(config.policyFile, original));
  fs.writeFileSync(config.policyFile, openAll);

  console.log('4.1 Autentikasi & token');
  const d1 = await login('dosen1');
  check('login dosen1 berhasil + access & refresh token', d1.status === 200 && d1.body.access_token && d1.body.refresh_token, JSON.stringify(d1));
  const claims = jwt.decode(d1.body.access_token);
  check('access token 10 menit, sub/role, issuer, dan audience benar',
    claims.exp - claims.iat === 600 && claims.sub && claims.role === 'dosen' &&
    claims.iss === config.jwt.issuer && claims.aud === config.jwt.audience);
  const refreshRow = await db.prepare('SELECT token_hash, expires_at FROM refresh_tokens WHERE token_hash = ?')
    .get(sha256(d1.body.refresh_token));
  check('refresh token disimpan sebagai hash dan berlaku satu hari',
    !!refreshRow && refreshRow.token_hash !== d1.body.refresh_token &&
    Math.abs(refreshRow.expires_at - Date.now() - config.refreshTtlMs) < 60_000);
  const badPassword = await login('dosen1', DEV.dosen1, 'salah');
  const badDevice = await login('dosen1', 'DEV-ASING-99');
  check('login password salah ditolak', badPassword.status === 401);
  check('login dari device tak terdaftar ditolak', badDevice.status === 403);
  check('pesan login gagal tidak membedakan password dan device', badPassword.body.error === badDevice.body.error);
  check('login tanpa X-Device-ID ditolak', (await call('POST', '/auth/login', { body: { username: 'dosen1', password: PASS.dosen1 } })).status === 400);
  const unknownUser = `unknown-${Date.now()}`;
  let failedLogins = 0;
  for (let i = 0; i < config.login.maxFails; i++) {
    const attempt = await call('POST', '/auth/login', {
      device: 'DEV-ASING-99',
      body: { username: unknownUser, password: 'salah' },
    });
    if (attempt.status === 401) failedLogins++;
  }
  check('percobaan login gagal dibatasi dan pesan username tidak valid seragam', failedLogins === config.login.maxFails &&
    (await call('POST', '/auth/login', { device: 'DEV-ASING-99', body: { username: unknownUser, password: 'salah' } })).status === 429);

  const t = {};
  for (const u of ['admin', 'dosen1', 'dosen2', 'mhs1', 'mhs2']) t[u] = (await login(u)).body.access_token;

  const svc = await call('POST', '/auth/service', { body: { client_id: config.serviceClient.id, client_secret: config.serviceClient.secret } });
  const sc = svc.body && jwt.decode(svc.body.access_token);
  check('token service: role service, berlaku 5 menit', svc.status === 200 && sc.role === 'service' && sc.exp - sc.iat === 300);
  const clientHash = await db.prepare('SELECT secret_hash FROM service_clients WHERE client_id = ?')
    .get(config.serviceClient.id);
  check('service secret tersimpan sebagai hash', !!clientHash &&
    clientHash.secret_hash !== config.serviceClient.secret &&
    verifySecret(config.serviceClient.secret, clientHash.secret_hash));
  check('token service dengan secret salah ditolak', (await call('POST', '/auth/service', { body: { client_id: 'service-nilai', client_secret: 'salah' } })).status === 401);

  // refresh & logout
  const rf = await call('POST', '/auth/refresh', { device: DEV.mhs2, body: { refresh_token: (await login('mhs2')).body.refresh_token } });
  check('refresh berhasil -> access token baru', rf.status === 200 && rf.body.access_token);
  const old = (await login('mhs2')).body.refresh_token;
  await call('POST', '/auth/logout', { device: DEV.mhs2, body: { refresh_token: old } });
  check('setelah logout refresh token tidak bisa dipakai', (await call('POST', '/auth/refresh', { device: DEV.mhs2, body: { refresh_token: old } })).status === 401);
  const rf1 = (await login('mhs2')).body.refresh_token;
  await call('POST', '/auth/refresh', { device: DEV.mhs2, body: { refresh_token: rf1 } });
  const reuse = await call('POST', '/auth/refresh', { device: DEV.mhs2, body: { refresh_token: rf1 } });
  check('reuse refresh token lama ditolak (rotasi + deteksi pencurian)', reuse.status === 401);
  check('refresh dari device lain ditolak', (await call('POST', '/auth/refresh', { device: DEV.mhs1, body: { refresh_token: (await login('mhs2')).body.refresh_token } })).status === 403);

  console.log('\n4.2 Kebijakan akses');
  check('tanpa token -> 401', (await call('GET', '/nilai', { device: DEV.mhs1 })).status === 401);
  check('token palsu -> 401', (await call('GET', '/nilai', { token: 'abc.def.ghi', device: DEV.mhs1 })).status === 401);
  const privateKey = fs.readFileSync(config.keys.private);
  const algNone = jwt.sign({ role: 'admin' }, '', { algorithm: 'none', subject: '1' });
  check('token alg=none ditolak', (await call('GET', '/transkrip/227006001', { token: algNone, device: DEV.admin })).status === 401);
  const publicKey = fs.readFileSync(config.keys.public);
  const hs = jwt.sign({ role: 'admin' }, publicKey, { algorithm: 'HS256', subject: '1', issuer: config.jwt.issuer, audience: config.jwt.audience });
  check('token HS256 (algorithm confusion) ditolak', (await call('GET', '/transkrip/227006001', { token: hs, device: DEV.admin })).status === 401);
  const expired = jwt.sign({ role: 'admin' }, privateKey, { algorithm: 'RS256', subject: '1', expiresIn: -10, issuer: config.jwt.issuer, audience: config.jwt.audience });
  check('token kedaluwarsa ditolak', (await call('GET', '/transkrip/227006001', { token: expired, device: DEV.admin })).status === 401);

  const m1 = await call('GET', '/nilai', { token: t.mhs1, device: DEV.mhs1 });
  check('mhs1 hanya melihat nilai miliknya', m1.status === 200 && m1.body.data.length === 2 && m1.body.data.every((r) => r.nim === '227006001'));
  check('mhs1 minta ?nim=orang lain -> 403', (await call('GET', '/nilai?nim=227006002', { token: t.mhs1, device: DEV.mhs1 })).status === 403);
  check('mhs1 HPP ?nim=a&nim=b -> 400', (await call('GET', '/nilai?nim=227006001&nim=227006002', { token: t.mhs1, device: DEV.mhs1 })).status === 400);

  const n1 = await call('GET', '/nilai', { token: t.dosen1, device: DEV.dosen1 });
  check('dosen1 hanya melihat kelas yang diampu (kelas 1)', n1.status === 200 && n1.body.data.length === 3 && n1.body.data.every((r) => r.kelas_id === 1));
  check('dosen1 minta kelas_id=2 (bukan miliknya) -> 403', (await call('GET', '/nilai?kelas_id=2', { token: t.dosen1, device: DEV.dosen1 })).status === 403);
  check('admin tidak boleh GET /nilai', (await call('GET', '/nilai', { token: t.admin, device: DEV.admin })).status === 403);

  const target = n1.body.data[0].id; // nilai milik kelas 1
  check('dosen2 ubah nilai kelas dosen1 -> 403', (await call('PUT', `/nilai/${target}`, { token: t.dosen2, device: DEV.dosen2, body: { nilai_angka: 99 } })).status === 403);
  check('mahasiswa ubah nilai -> 403', (await call('PUT', `/nilai/${target}`, { token: t.mhs1, device: DEV.mhs1, body: { nilai_angka: 100 } })).status === 403);
  const up = await call('PUT', `/nilai/${target}`, { token: t.dosen1, device: DEV.dosen1, body: { nilai_angka: 90 } });
  check('dosen1 ubah nilai kelasnya -> 200', up.status === 200, JSON.stringify(up));
  check('nilai di luar 0–100 ditolak service', (await call('PUT', `/nilai/${target}`, { token: t.dosen1, device: DEV.dosen1, body: { nilai_angka: 500 } })).status === 400);

  check('mhs1 lihat transkrip sendiri -> 200', (await call('GET', '/transkrip/227006001', { token: t.mhs1, device: DEV.mhs1 })).status === 200);
  check('mhs1 lihat transkrip mhs2 -> 403', (await call('GET', '/transkrip/227006002', { token: t.mhs1, device: DEV.mhs1 })).status === 403);
  check('admin lihat transkrip semua NIM -> 200', (await call('GET', '/transkrip/227006002', { token: t.admin, device: DEV.admin })).status === 200);
  check('dosen lihat transkrip -> 403', (await call('GET', '/transkrip/227006001', { token: t.dosen1, device: DEV.dosen1 })).status === 403);
  check('user token ke /transkrip/sinkron -> 403', (await call('POST', '/transkrip/sinkron', { token: t.admin, device: DEV.admin, body: { kelas_id: 1, entries: [] } })).status === 403);
  check('token service ke /nilai -> 403', (await call('GET', '/nilai', { token: svc.body.access_token })).status === 403);
  check('endpoint tak dikenal -> default deny', (await call('GET', '/rahasia', { token: t.admin, device: DEV.admin })).status === 403);
  check('path ter-encode (path confusion) ditolak', (await call('GET', '/transkrip%2f..%2fnilai', { token: t.admin, device: DEV.admin })).status === 400);

  console.log('\n4.1 Gateway secret & verifikasi ulang di service');
  check('akses langsung service tanpa secret -> 403', (await call('GET', '/nilai', { base: SVC_NILAI, token: t.mhs1 })).status === 403);
  check('secret salah -> 403', (await call('GET', '/nilai', { base: SVC_NILAI, token: t.mhs1, headers: { 'X-Gateway-Secret': 'tebakan' } })).status === 403);
  check('secret benar tapi tanpa token -> 401', (await call('GET', '/nilai', { base: SVC_NILAI, headers: { 'X-Gateway-Secret': config.gatewaySecret } })).status === 401);
  check('secret benar + token kedaluwarsa -> 401', (await call('GET', '/nilai', { base: SVC_NILAI, token: expired, headers: { 'X-Gateway-Secret': config.gatewaySecret } })).status === 401);
  check('secret benar + token valid -> 200', (await call('GET', '/nilai', { base: SVC_NILAI, token: t.mhs1, headers: { 'X-Gateway-Secret': config.gatewaySecret } })).status === 200);
  check('klien tidak bisa menyuntik X-Gateway-Secret lewat gateway', (await call('GET', '/nilai', { token: t.mhs1, device: DEV.mhs1, headers: { 'X-Gateway-Secret': 'x' } })).status === 200);

  console.log('\n4.3 Verifikasi konteks');
  check('device tak terdaftar (token valid) -> 403', (await call('GET', '/nilai', { token: t.mhs1, device: DEV.mhs2 })).status === 403);
  check('tanpa X-Device-ID -> 403', (await call('GET', '/nilai', { token: t.mhs1 })).status === 403);
  try {
    fs.writeFileSync(config.policyFile, JSON.stringify({ access_hours: { start: '00:00', end: '00:01' } }));
    check('ubah nilai di luar jam akses -> 403', (await call('PUT', `/nilai/${target}`, { token: t.dosen1, device: DEV.dosen1, body: { nilai_angka: 91 } })).status === 403);
    check('finalisasi di luar jam akses -> 403', (await call('POST', '/kelas/1/finalisasi', { token: t.dosen1, device: DEV.dosen1 })).status === 403);
    check('baca nilai tetap boleh di luar jam akses', (await call('GET', '/nilai', { token: t.dosen1, device: DEV.dosen1 })).status === 200);
  } finally { fs.writeFileSync(config.policyFile, openAll); }

  console.log('\nFinalisasi + sinkron transkrip antar-service');
  check('dosen2 finalisasi kelas 1 -> 403', (await call('POST', '/kelas/1/finalisasi', { token: t.dosen2, device: DEV.dosen2 })).status === 403);
  const fin = await call('POST', '/kelas/1/finalisasi', { token: t.dosen1, device: DEV.dosen1 });
  check('dosen1 finalisasi kelas 1 -> 200', fin.status === 200, JSON.stringify(fin));
  const tr = await call('GET', '/transkrip/227006001', { token: t.mhs1, device: DEV.mhs1 });
  check('transkrip mhs1 berisi nilai hasil sinkron (90 -> A)', tr.status === 200 && tr.body.transkrip.length === 1 && tr.body.transkrip[0].nilai_huruf === 'A', JSON.stringify(tr.body));
  check('ubah nilai setelah final -> 403', (await call('PUT', `/nilai/${target}`, { token: t.dosen1, device: DEV.dosen1, body: { nilai_angka: 50 } })).status === 403);
  const repeatedFinalization = await call('POST', '/kelas/1/finalisasi', { token: t.dosen1, device: DEV.dosen1 });
  check('finalisasi ulang idempotent dan tetap sukses', repeatedFinalization.status === 200 && repeatedFinalization.body.status === 'succeeded');

  console.log('\n4.4 Audit log');
  const total = (await db.prepare('SELECT COUNT(*) c FROM audit_log').get()).c;
  const kinds = (await db.prepare('SELECT DISTINCT hasil FROM audit_log').all()).map((r) => r.hasil);
  check(`audit log terisi (${total} baris) dengan allow & deny`, total > 50 && kinds.includes('allow') && kinds.includes('deny'));
  const svcRow = await db.prepare("SELECT 1 FROM audit_log WHERE subjek = 'service:service-nilai' AND endpoint = '/transkrip/sinkron' AND hasil = 'allow'").get();
  check('panggilan antar-service tercatat di audit (subjek service)', !!svcRow);
  let sensitiveAuditRows = 0;
  for (const value of [config.gatewaySecret, config.serviceClient.secret, PASS.dosen1, ...Object.values(t), svc.body.access_token]) {
    const row = await db.prepare(
      'SELECT 1 FROM audit_log WHERE alasan LIKE ? OR endpoint LIKE ? OR subjek LIKE ? OR device LIKE ? LIMIT 1',
    ).get(`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`);
    if (row) sensitiveAuditRows++;
  }
  check('audit tidak memuat password, secret, atau token', sensitiveAuditRows === 0);

  console.log(`\nHasil: ${passed} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
