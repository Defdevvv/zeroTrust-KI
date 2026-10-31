'use strict';
// Verifikasi JWT (RS256) hanya dengan PUBLIC key.
// Service tidak pernah memegang private key => service yang dibobol tidak bisa memalsukan token.
const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const publicKey = fs.readFileSync(config.keys.public);

function verifyToken(token) {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],        // tolak alg:none / HS256 (algorithm confusion)
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  }); // exp juga otomatis diperiksa
}

module.exports = { verifyToken };
