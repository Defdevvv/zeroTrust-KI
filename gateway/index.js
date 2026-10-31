'use strict';
// =====================================================================
// API GATEWAY (PEP) — port 3000, satu-satunya pintu masuk (NIST SP 800-207)
// Alur tiap request:  authn token -> Policy Engine (allow/deny) -> audit log -> proxy ke service
// =====================================================================
const express = require('express');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../shared/config');
const { verifyToken } = require('../shared/verifyToken');
const asyncRoute = require('../shared/asyncRoute');
const startServer = require('../shared/startServer');
const policy = require('./policy');
const audit = require('./audit');
const authRouter = require('./auth');

if (!config.gatewaySecret) throw new Error('GATEWAY_SECRET belum diset. Jalankan: npm run setup');

const app = express();
app.disable('x-powered-by');

// 1) /auth/* ditangani gateway sendiri (body JSON hanya di-parse di sini; request lain di-stream apa adanya)
app.use('/auth', express.json({ limit: '10kb' }), authRouter);

// 2) Semua request lain WAJIB melewati guard (PEP): token valid + keputusan Policy Engine
async function guard(req, res, next) {
  const base = {
    method: req.method, endpoint: req.path,
    device: req.get('x-device-id') || null, ip: req.ip,
  };
  const reject = async (status, reason, subject = 'anonymous') => {
    await audit.log({ ...base, subject, result: 'deny', reason });
    return res.status(status).json({ error: reason });
  };

  // Normalisasi path: cegah path confusion (//, .., %2e, dsb.)
  if (/%|\/\/|\.\./.test(req.path)) return reject(400, 'path tidak valid');

  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return reject(401, 'access token tidak ada');

  let claims;
  try {
    claims = verifyToken(m[1]); // tanda tangan RS256, issuer, audience, exp
  } catch (err) {
    const reason = err instanceof jwt.TokenExpiredError ? 'token kedaluwarsa' : `token tidak valid (${err.message})`;
    return reject(401, reason);
  }

  const subject = await policy.describeSubject(claims);
  const decision = await policy.decide({
    method: req.method, path: req.path, query: req.query, claims, deviceId: base.device,
  });
  await audit.log({ ...base, subject, result: decision.allow ? 'allow' : 'deny', reason: decision.reason });
  if (!decision.allow) return res.status(decision.status).json({ error: decision.reason });
  next();
}
app.use(asyncRoute(guard));

// 3) Setelah ALLOW: teruskan ke service dengan X-Gateway-Secret
function proxyTo(target, prefixRe) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: (pathname) => prefixRe.test(pathname),
    on: {
      proxyReq: (proxyReq) => {
        // setHeader menimpa header X-Gateway-Secret kiriman klien (kalau ada)
        proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret);
      },
      error: (err, req, res) => {
        audit.log({
          subject: 'gateway', method: req.method, endpoint: req.path,
          result: 'error', reason: `service tidak dapat dihubungi: ${err.code || err.message}`,
        }).catch((auditError) => {
          console.error('[audit] gagal menyimpan error proxy:', auditError.code || 'DB_ERROR');
        });
        if (res.writeHead && !res.headersSent) res.status(502).json({ error: 'Service tidak tersedia' });
      },
    },
  });
}
app.use(proxyTo(config.urls.nilai, /^\/(nilai|kelas)(\/|$)/));
app.use(proxyTo(config.urls.transkrip, /^\/transkrip(\/|$)/));

// Error handler (mis. JSON rusak di /auth)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status && err.status < 500 ? err.status : 500;
  audit.log({
    subject: 'anonymous', method: req.method, endpoint: req.path, device: req.get('x-device-id'),
    result: 'deny', reason: status === 500 ? 'kesalahan internal' : 'request tidak valid',
  }).then(() => {
    res.status(status).json({ error: status === 500 ? 'Kesalahan internal' : 'Request tidak valid' });
  }).catch((auditError) => {
    console.error('[audit] gagal menyimpan error request:', auditError.code || 'DB_ERROR');
    res.status(500).json({ error: 'Kesalahan internal' });
  });
});

startServer(app, 'API Gateway (PEP)', config.ports.gateway);
