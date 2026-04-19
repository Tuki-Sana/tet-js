import { MOBILE_TAP_SIDE_FRAC } from './config.js';
import { getTetris } from './game-session.js';

export function isMobileDevice() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('desktop') === 'true') {
    return false;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768 && window.innerHeight <= 1024);
}

export function setupMobileUI() {
  if (isMobileDevice()) {
    document.body.classList.add('mobile-device');
  }
}

export function performZoneAction(tetrisInstance, action) {
  if (!tetrisInstance || tetrisInstance.gameOver || tetrisInstance.paused) return;
  switch (action) {
    case 'rotate': tetrisInstance.rotatePiece(); break;
    case 'left': tetrisInstance.movePiece(-1, 0); break;
    case 'right': tetrisInstance.movePiece(1, 0); break;
    case 'down': tetrisInstance.movePiece(0, 1); break;
  }
}

let mobileSwipeHardDropTrack = null;

/** プレイエリア中央帯の下方向スワイプで一気落下（1回だけリスナー登録） */
export function attachMobileSwipeHardDropOnce() {
  const gameArea = document.querySelector('.game-layout-mobile .game-area');
  if (!gameArea || gameArea.dataset.hardDropSwipe === '1') return;
  gameArea.dataset.hardDropSwipe = '1';

  gameArea.addEventListener('touchstart', (e) => {
    const tetris = getTetris();
    if (!document.body.classList.contains('game-active') || !tetris || tetris.gameOver || tetris.paused) return;
    const t = e.touches[0];
    if (!t) return;
    const rect = gameArea.getBoundingClientRect();
    const rx = (t.clientX - rect.left) / rect.width;
    if (rx < MOBILE_TAP_SIDE_FRAC || rx > 1 - MOBILE_TAP_SIDE_FRAC) {
      mobileSwipeHardDropTrack = null;
      return;
    }
    mobileSwipeHardDropTrack = { x0: t.clientX, y0: t.clientY, id: t.identifier };
  }, { passive: true, capture: true });

  gameArea.addEventListener('touchcancel', () => { mobileSwipeHardDropTrack = null; }, { passive: true, capture: true });

  gameArea.addEventListener('touchend', (e) => {
    if (!mobileSwipeHardDropTrack) return;
    const t = [...e.changedTouches].find((x) => x.identifier === mobileSwipeHardDropTrack.id);
    if (!t) {
      mobileSwipeHardDropTrack = null;
      return;
    }
    const dx = t.clientX - mobileSwipeHardDropTrack.x0;
    const dy = t.clientY - mobileSwipeHardDropTrack.y0;
    mobileSwipeHardDropTrack = null;
    const tetris = getTetris();
    if (!document.body.classList.contains('game-active') || !tetris || tetris.gameOver || tetris.paused) return;
    if (dy < 52) return;
    if (dy < Math.abs(dx) * 1.15) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    tetris.hardDrop();
  }, { passive: false, capture: true });
}
