'use strict';
// =====================================================================
// POLICY ENGINE (PE) — memutuskan allow/deny + alasan (NIST SP 800-207)
// Input : identitas (klaim token), konteks (device, jam), request
// Atribut kepemilikan (kelas yang diampu, NIM, status final) dibaca dari DATABASE,
// bukan dari isi token, karena token tidak memuat data tersebut (Bagian 4.2).
// Prinsip: DEFAULT DENY — endpoint tanpa aturan ditolak.
// =====================================================================
const fs = require('fs');
const config = require('../shared/config');
const db = require('../shared/db');

const sql = {
  user: db.prepare('SELECT id, username, role, nim FROM users WHERE id = ?'),
  device: db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?'),
  kelas: db.prepare('SELECT id, dosen_id FROM kelas WHERE id = ?'),
  nilai: db.prepare(
    'SELECT n.id, n.final, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?'),
};

const ALLOW = (reason) => ({ allow: true, status: 200, reason });
const DENY = (status, reason) => ({ allow: false, status, reason });

// ---------- Konteks: jam akses (4.3) — dibaca ulang tiap request agar mudah didemokan ----------
const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`format jam salah: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
};
function checkAccessHours(now = new Date()) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(config.policyFile, 'utf8')).access_hours;
    var start = toMin(cfg.start), end = toMin(cfg.end);
  } catch (e) {
    return { ok: false, label: 'konfigurasi jam akses tidak terbaca (fail-closed)' };
  }
  const cur = now.getHours() * 60 + now.getMinutes();
  const ok = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
  return { ok, label: `${cfg.start}–${cfg.end}` };
}

// ---------- Helper ----------
function param(query, key) {
  const v = query[key];
  if (v === undefined) return { ok: true, value: undefined };
  return typeof v === 'string' ? { ok: true, value: v } : { ok: false }; // tolak ?x=1&x=2 / ?x[a]=1
}

// ---------- Tabel Kebijakan Akses (Tabel 3) ----------
const RULES = [
  {
    method: 'GET', re: /^\/nilai\/?$/, roles: ['mahasiswa', 'dosen'],
    check: ({ user, query }) => {
      if (user.role === 'mahasiswa') {
        const nim = param(query, 'nim');
        if (!nim.ok) return DENY(400, 'parameter nim tidak valid');
        if (nim.value !== undefined && nim.value !== user.nim) {
          return DENY(403, 'mahasiswa hanya boleh melihat nilai miliknya sendiri');
        }
        return ALLOW('mahasiswa melihat nilai miliknya');
      }
      const k = param(query, 'kelas_id');
      if (!k.ok || (k.value !== undefined && !/^\d+$/.test(k.value))) return DENY(400, 'parameter kelas_id tidak valid');
      if (k.value !== undefined) {
        const kelas = sql.kelas.get(Number(k.value));
        if (!kelas || kelas.dosen_id !== user.id) return DENY(403, 'kelas bukan yang diampu dosen ini');
      }
      return ALLOW('dosen melihat nilai kelas yang diampu');
    },
  },
  {
    method: 'PUT', re: /^\/nilai\/(\d+)\/?$/, roles: ['dosen'], hours: true,
    check: ({ user, match }) => {
      const n = sql.nilai.get(Number(match[1]));
      if (!n) return DENY(404, 'data nilai tidak ditemukan');
      if (n.dosen_id !== user.id) return DENY(403, 'kelas bukan yang diampu dosen ini');
      if (n.final) return DENY(403, 'nilai sudah final, tidak dapat diubah');
      return ALLOW('dosen mengubah nilai di kelas yang diampu (belum final, dalam jam akses)');
    },
  },
  {
    method: 'POST', re: /^\/kelas\/(\d+)\/finalisasi\/?$/, roles: ['dosen'], hours: true,
    check: ({ user, match }) => {
      const kelas = sql.kelas.get(Number(match[1]));
      if (!kelas) return DENY(404, 'kelas tidak ditemukan');
      if (kelas.dosen_id !== user.id) return DENY(403, 'kelas bukan yang diampu dosen ini');
      return ALLOW('dosen memfinalisasi kelas yang diampu (dalam jam akses)');
    },
  },
  {
    method: 'GET', re: /^\/transkrip\/([^/]+)\/?$/, roles: ['mahasiswa', 'admin'],
    check: ({ user, match }) => {
      const nim = match[1];
      if (!/^\d{5,20}$/.test(nim)) return DENY(400, 'format NIM tidak valid');
      if (user.role === 'admin') return ALLOW('admin melihat transkrip');
      if (nim !== user.nim) return DENY(403, 'mahasiswa hanya boleh melihat transkrip NIM sendiri');
      return ALLOW('mahasiswa melihat transkrip sendiri');
    },
  },
  {
    // Hanya token service. Token user mana pun ditolak.
    method: 'POST', re: /^\/transkrip\/sinkron\/?$/, roles: ['service'],
    check: () => ALLOW('sinkronisasi transkrip oleh service-nilai'),
  },
];

// ---------- Subjek untuk audit ----------
function describeSubject(claims) {
  if (!claims) return 'anonymous';
  if (claims.role === 'service') return `service:${claims.sub}`;
  const u = /^\d+$/.test(String(claims.sub)) ? sql.user.get(Number(claims.sub)) : null;
  return u ? `${u.username}(${u.role})` : `unknown(sub=${claims.sub})`;
}

// ---------- Keputusan ----------
function decide({ method, path, query, claims, deviceId }) {
  const rule = RULES.find((r) => r.method === method && r.re.test(path));
  if (!rule) return DENY(403, 'tidak ada kebijakan untuk endpoint ini (default deny)');

  if (!rule.roles.includes(claims.role)) {
    if (rule.roles.includes('service')) return DENY(403, 'hanya token service yang diizinkan; token user ditolak');
    if (claims.role === 'service') return DENY(403, 'token service tidak boleh mengakses endpoint ini');
    return DENY(403, `role '${claims.role}' tidak diizinkan untuk endpoint ini`);
  }

  let user = null;
  if (claims.role === 'service') {
    if (claims.sub !== config.serviceClient.id) return DENY(403, 'identitas service tidak dikenal');
  } else {
    // Atribut user dibaca ulang dari DB (bukan dipercaya dari token)
    user = /^\d+$/.test(String(claims.sub)) ? sql.user.get(Number(claims.sub)) : null;
    if (!user) return DENY(403, 'user pada token tidak ditemukan');
    if (user.role !== claims.role) return DENY(403, 'role pada token tidak sesuai dengan data di database');
    // 4.3 Device terdaftar
    if (!deviceId) return DENY(403, 'header X-Device-ID tidak ada');
    if (!sql.device.get(user.id, deviceId)) return DENY(403, 'device tidak terdaftar untuk user ini');
  }

  // 4.3 Jam akses
  if (rule.hours) {
    const h = checkAccessHours();
    if (!h.ok) return DENY(403, `di luar jam akses (${h.label})`);
  }

  return rule.check({ user, query, match: rule.re.exec(path) });
}

module.exports = { decide, describeSubject, checkAccessHours };
