import { HIGH_SCORE_STORAGE_KEY } from './config.js';

export function getHighScore() {
  try {
    const v = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY), 10);
    return Number.isNaN(v) ? 0 : v;
  } catch {
    return 0;
  }
}

export function updateHighScoreDisplay(value) {
  const n = String(value ?? getHighScore());
  const el = document.getElementById('high-score');
  if (el) el.textContent = n;
  const mobileEl = document.getElementById('mobile-high-score');
  if (mobileEl) mobileEl.textContent = n;
}
