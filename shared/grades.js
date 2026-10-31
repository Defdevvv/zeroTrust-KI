'use strict';

function gradeForScore(score) {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

module.exports = { gradeForScore };
