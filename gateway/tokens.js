'use strict';
// Penerbitan token (fungsi Policy Administrator). Hanya gateway yang memegang PRIVATE key.
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../shared/config');
const db = require('../shared/db');
const { sha256 } = require('../shared/secrets');

const privateKey = fs.readFileSync(config.keys.private);

function sign(payload, subject, expiresIn) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    subject: String(subject),
    expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    jwtid: crypto.randomUUID(),
  });
}

// Access token user: 10 menit, klaim minimal sub + role
const signAccess = (user) => sign({ role: user.role }, user.id, config.jwt.accessTtl);
// Token service: 5 menit, role: service
const signService = (clientId) => sign({ role: 'service' }, clientId, config.jwt.serviceTtl);

// ---- Refresh token: opaque + disimpan (hash) di database agar bisa dicabut ----
const insRefresh = db.prepare(
  'INSERT INTO refresh_tokens(user_id, token_hash, device_id, expires_at, revoked, created_at) VALUES (?,?,?,?,0,?)');
const selRefresh = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?');
const revokeOne = db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?');
const revokeAll = db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?');

function issueRefresh(userId, deviceId) {
  const raw = crypto.randomBytes(48).toString('base64url');
  insRefresh.run(userId, sha256(raw), deviceId, Date.now() + config.refreshTtlMs, new Date().toISOString());
  return raw;
}
const findRefresh = (raw) => selRefresh.get(sha256(raw));

module.exports = {
  signAccess, signService, issueRefresh, findRefresh,
  revokeRefresh: (id) => revokeOne.run(id),
  revokeAllForUser: (userId) => revokeAll.run(userId),
};
