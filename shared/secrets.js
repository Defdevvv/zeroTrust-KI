'use strict';
// Hash password / client secret memakai scrypt (bawaan Node, tanpa dependency native tambahan).
const crypto = require('crypto');

function hashSecret(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifySecret(plain, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Perbandingan string konstan-waktu (untuk gateway secret).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { hashSecret, verifySecret, safeEqual, sha256 };
