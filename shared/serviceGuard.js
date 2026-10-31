'use strict';
// Pertahanan lapis kedua di setiap service (4.1 "Verifikasi ulang di service"):
//   1) X-Gateway-Secret harus benar  -> service tidak bisa diakses langsung
//   2) Access token / token service harus valid (tanda tangan + masa berlaku)
// Request tanpa token valid ditolak walaupun membawa gateway secret.
const config = require('./config');
const { safeEqual } = require('./secrets');
const { verifyToken } = require('./verifyToken');

function serviceGuard(req, res, next) {
  const secret = req.get('x-gateway-secret');
  if (!secret || !config.gatewaySecret || !safeEqual(secret, config.gatewaySecret)) {
    return res.status(403).json({ error: 'Akses langsung ditolak: X-Gateway-Secret tidak valid' });
  }
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    req.auth = verifyToken(m[1]); // { sub, role, ... }
  } catch (err) {
    return res.status(401).json({ error: `Token tidak valid: ${err.message}` });
  }
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.auth.role)
    ? next()
    : res.status(403).json({ error: `Role '${req.auth.role}' tidak diizinkan` });

module.exports = { serviceGuard, requireRole };
