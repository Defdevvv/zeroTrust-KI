'use strict';

function assertSupportedDatabaseVersion(rawVersion) {
  const versionText = String(rawVersion || '');
  const isMariaDb = /mariadb/i.test(versionText);
  const matches = [...versionText.matchAll(/(\d+)\.(\d+)\.(\d+)/g)];
  const match = isMariaDb ? matches[matches.length - 1] : matches[0];
  if (!match) throw new Error('Versi MySQL/MariaDB tidak dapat dikenali');

  const actual = match.slice(1).map(Number);
  const minimum = isMariaDb ? [10, 2, 7] : [8, 0, 16];
  const firstDifference = actual.findIndex((value, index) => value !== minimum[index]);
  const supported = firstDifference === -1 || actual[firstDifference] > minimum[firstDifference];

  if (!supported) {
    const required = isMariaDb ? 'MariaDB 10.2.7+' : 'MySQL 8.0.16+';
    throw new Error(`Versi database tidak didukung; diperlukan ${required} agar constraint CHECK ditegakkan`);
  }
}

module.exports = { assertSupportedDatabaseVersion };
