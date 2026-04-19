import { APP_VERSION } from './config.js';
import { getTetris } from './game-session.js';
import { setupMobileUI } from './input.js';
import { applyBgmVolumeToElements, getStoredVolume } from './audio.js';
import {
  showDifficultyScreen,
  showStartScreen,
  startGameAsync,
  pauseGame,
  resumeGame,
  holdGame,
  restartGame,
  backToMenu
} from './screens.js';
import { showTutorialScreen, exitTutorial } from './tutorial.js';
import {
  getPreferredTheme,
  applyTheme,
  toggleTheme,
  setupThemeButtonsInSettings,
  setupVolumeSliders,
  openSettingsModal,
  closeSettingsModal
} from './theme-settings.js';

Object.assign(window, {
  showDifficultyScreen,
  showStartScreen,
  showTutorialScreen,
  exitTutorial,
  startGameAsync,
  pauseGame,
  resumeGame,
  holdGame,
  restartGame,
  backToMenu,
  openSettingsModal,
  closeSettingsModal,
  toggleTheme
});

document.addEventListener('DOMContentLoaded', () => {
  setupMobileUI();
  applyTheme(getPreferredTheme());
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = 'v' + APP_VERSION;
  setupThemeButtonsInSettings();
  setupVolumeSliders();
  ['master', 'bgm', 'se'].forEach((key) => {
    const slider = document.getElementById('volume-' + key);
    const valueEl = document.getElementById('volume-' + key + '-value');
    const val = getStoredVolume(key);
    if (slider) slider.value = val;
    if (valueEl) valueEl.textContent = val + '%';
  });
  applyBgmVolumeToElements();
  document.querySelectorAll('.difficulty-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-option').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              const toast = document.getElementById('update-toast');
              if (toast) {
                toast.classList.add('show');
                toast.setAttribute('aria-hidden', 'false');
              }
            }
          });
        });
      })
      .catch(() => {});
  }
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    setupMobileUI();
    const t = getTetris();
    if (t) {
      t.handleResize();
      t.drawNextPieces();
    }
  }, 100);
});

window.addEventListener('resize', () => {
  const t = getTetris();
  if (t) {
    t.handleResize();
  }
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const t = getTetris();
    if (t && t.isMobile && t.canvas.id === 'mobile-game') {
      t.handleResize();
    }
  });
}
