'use strict';
// Endpoint /auth/* — ditangani langsung oleh gateway (PE/PA): login, refresh, logout, token service.
const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { hashSecret, verifySecret } = require('../shared/secrets');
const tokens = require('./tokens');
const audit = require('./audit');

const router = express.Router();
const DUMMY_HASH = hashSecret('dummy-untuk-menyamakan-waktu'); // cegah user enumeration via timing

const sql = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT id, username, role FROM users WHERE id = ?'),
  device: db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?'),
  client: db.prepare('SELECT * FROM service_clients WHERE client_id = ?'),
};

// ---- pembatas percobaan gagal (anti brute-force) ----
const attempts = new Map();
const locked = (key) => {
  const e = attempts.get(key);
  if (!e) return false;
  if (Date.now() - e.first > config.login.windowMs) { attempts.delete(key); return false; }
  return e.count >= config.login.maxFails;
};
const recordFail = (key) => {
  const e = attempts.get(key);
  if (!e || Date.now() - e.first > config.login.windowMs) attempts.set(key, { count: 1, first: Date.now() });
  else e.count += 1;
};

// ---- helper respons + audit ----
function deny(req, res, status, reason, subject = 'anonymous', publicMsg) {
  audit.log({
    subject, method: req.method, endpoint: req.baseUrl + req.path,
    device: req.get('x-device-id'), result: 'deny', reason, ip: req.ip,
  });
  return res.status(status).json({ error: publicMsg || reason });
}
function allow(req, res, reason, subject, body) {
  audit.log({
    subject, method: req.method, endpoint: req.baseUrl + req.path,
    device: req.get('x-device-id'), result: 'allow', reason, ip: req.ip,
  });
  return res.json(body);
}
const isStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const label = (u) => `${u.username}(${u.role})`;

// ---------------------------------------------------------------- POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const device = req.get('x-device-id');
  if (!isStr(username) || !isStr(password)) return deny(req, res, 400, 'username/password tidak ada');
  if (!isStr(device)) return deny(req, res, 400, 'header X-Device-ID tidak ada', username);

  const key = `${req.ip}|${username}`;
  if (locked(key)) return deny(req, res, 429, 'terlalu banyak percobaan login gagal', username, 'Terlalu banyak percobaan, coba lagi nanti');

  const user = sql.userByName.get(username);
  const passOk = verifySecret(password, user ? user.password_hash : DUMMY_HASH);
  const generic = 'Kredensial atau device tidak valid'; // pesan ke klien dibuat seragam
  if (!user || !passOk) {
    recordFail(key);
    return deny(req, res, 401, 'kredensial salah', username, generic);
  }
  if (!sql.device.get(user.id, device)) {
    recordFail(key);
    return deny(req, res, 403, 'device tidak terdaftar untuk user ini', label(user), generic);
  }
  attempts.delete(key);
  return allow(req, res, 'login berhasil (kredensial valid, device terdaftar)', label(user), {
    token_type: 'Bearer',
    access_token: tokens.signAccess(user),
    expires_in: 600,
    refresh_token: tokens.issueRefresh(user.id, device),
  });
});

// ---------------------------------------------------------------- POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  const device = req.get('x-device-id');
  if (!isStr(refresh_token)) return deny(req, res, 400, 'refresh_token tidak ada');
  if (!isStr(device)) return deny(req, res, 400, 'header X-Device-ID tidak ada');

  const row = tokens.findRefresh(refresh_token);
  if (!row) return deny(req, res, 401, 'refresh token tidak dikenal');
  const user = sql.userById.get(row.user_id);
  const who = user ? label(user) : `unknown(id=${row.user_id})`;

  if (row.revoked) {
    // Assume breach: token yang sudah dicabut dipakai lagi => kemungkinan dicuri.
    tokens.revokeAllForUser(row.user_id);
    return deny(req, res, 401, 'refresh token sudah dicabut dipakai ulang: semua sesi user dicabut', who, 'Refresh token tidak valid');
  }
  if (row.expires_at < Date.now()) return deny(req, res, 401, 'refresh token kedaluwarsa', who, 'Refresh token tidak valid');
  if (!user || row.device_id !== device || !sql.device.get(user.id, device)) {
    return deny(req, res, 403, 'device tidak cocok / tidak terdaftar', who, 'Refresh token tidak valid');
  }
  // Rotasi: token lama dicabut, terbitkan pasangan baru
  tokens.revokeRefresh(row.id);
  return allow(req, res, 'refresh berhasil (token dirotasi)', who, {
    token_type: 'Bearer',
    access_token: tokens.signAccess(user),
    expires_in: 600,
    refresh_token: tokens.issueRefresh(user.id, device),
  });
});

// ---------------------------------------------------------------- POST /auth/logout
router.post('/logout', (req, res) => {
  const { refresh_token } = req.body || {};
  if (!isStr(refresh_token)) return deny(req, res, 400, 'refresh_token tidak ada');
  const row = tokens.findRefresh(refresh_token);
  if (!row || row.revoked || row.expires_at < Date.now()) {
    return deny(req, res, 401, 'refresh token tidak valid', 'anonymous', 'Refresh token tidak valid');
  }
  const user = sql.userById.get(row.user_id);
  tokens.revokeRefresh(row.id);
  return allow(req, res, 'logout: refresh token dicabut', user ? label(user) : 'unknown', { message: 'Logout berhasil' });
});

// ---------------------------------------------------------------- POST /auth/service
router.post('/service', (req, res) => {
  const { client_id, client_secret } = req.body || {};
  if (!isStr(client_id) || !isStr(client_secret)) return deny(req, res, 400, 'client_id/client_secret tidak ada');
  const key = `${req.ip}|svc:${client_id}`;
  if (locked(key)) return deny(req, res, 429, 'terlalu banyak percobaan gagal', `service:${client_id}`, 'Terlalu banyak percobaan');

  const row = sql.client.get(client_id);
  const ok = verifySecret(client_secret, row ? row.secret_hash : DUMMY_HASH);
  if (!row || !ok) {
    recordFail(key);
    return deny(req, res, 401, 'client id / secret salah', `service:${client_id}`, 'Kredensial service tidak valid');
  }
  return allow(req, res, 'token service diterbitkan (role: service, 5 menit)', `service:${client_id}`, {
    token_type: 'Bearer',
    access_token: tokens.signService(client_id),
    expires_in: 300,
  });
});

// Selain 4 endpoint di atas: default deny
router.use((req, res) => deny(req, res, 404, 'endpoint /auth tidak dikenal (default deny)'));

module.exports = router;
