import { getStoredVolume, setStoredVolume, applyBgmVolumeToElements } from './audio.js';

// ========== テーマ（ライト/ダーク） ==========
const THEME_STORAGE_KEY = 'tetrisTheme';

export function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch (_) {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
  }
}

export function toggleTheme() {
  const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (_) {}
  applyTheme(next);
}

// ========== 設定モーダル（表示・音量） ==========
export function getCurrentTheme() {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

export function updateSettingsThemeUI() {
  const theme = getCurrentTheme();
  const lightBtn = document.getElementById('theme-light-btn');
  const darkBtn = document.getElementById('theme-dark-btn');
  if (lightBtn) {
    lightBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }
  if (darkBtn) {
    darkBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

export function applyThemeFromSettings(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
  applyTheme(theme);
  updateSettingsThemeUI();
}

export function setupThemeButtonsInSettings() {
  const lightBtn = document.getElementById('theme-light-btn');
  const darkBtn = document.getElementById('theme-dark-btn');
  if (lightBtn) lightBtn.addEventListener('click', () => applyThemeFromSettings('light'));
  if (darkBtn) darkBtn.addEventListener('click', () => applyThemeFromSettings('dark'));
}

export function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  updateSettingsThemeUI();
  const keys = ['master', 'bgm', 'se'];
  keys.forEach((key) => {
    const val = getStoredVolume(key);
    const slider = document.getElementById('volume-' + key);
    const valueEl = document.getElementById('volume-' + key + '-value');
    if (slider) {
      slider.value = val;
      slider.setAttribute('aria-valuenow', val);
    }
    if (valueEl) valueEl.textContent = val + '%';
  });
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  applyBgmVolumeToElements();
}

export function setupVolumeSliders() {
  const keys = ['master', 'bgm', 'se'];
  keys.forEach((key) => {
    const slider = document.getElementById('volume-' + key);
    const valueEl = document.getElementById('volume-' + key + '-value');
    if (!slider || !valueEl) return;
    const update = () => {
      const val = setStoredVolume(key, Number(slider.value));
      valueEl.textContent = val + '%';
      slider.setAttribute('aria-valuenow', val);
      applyBgmVolumeToElements();
    };
    slider.addEventListener('input', update);
    slider.addEventListener('change', update);
  });
}
