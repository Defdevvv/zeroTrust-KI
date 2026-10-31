'use strict';
// Menjalankan gateway + 2 service sekaligus dalam satu terminal.
const { spawn } = require('child_process');
const path = require('path');

const apps = [
  ['gateway   ', 'gateway/index.js'],
  ['svc-nilai ', 'service-nilai/index.js'],
  ['svc-trans ', 'service-transkrip/index.js'],
];
const children = apps.map(([label, file]) => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', file)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (stream, out) => stream.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => out.write(`[${label}] ${l}\n`)));
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on('exit', (code) => { console.log(`[${label}] berhenti (kode ${code})`); shutdown(); });
  return child;
});
function shutdown() { children.forEach((c) => c.kill()); setTimeout(() => process.exit(0), 200); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
