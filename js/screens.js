import { Tetris } from './tetris-game.js';
import { setTetris, getTetris } from './game-session.js';
import { isMobileDevice } from './input.js';
import { ensureSeBuffersLoaded, pauseAllBgm } from './audio.js';
import { getHighScore, updateHighScoreDisplay } from './score.js';

export function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

export function showDifficultyScreen() {
  ensureSeBuffersLoaded();
  showScreen('difficulty-screen');
}

export function showStartScreen() {
  showScreen('start-screen');
}

export async function startGameAsync() {
  await ensureSeBuffersLoaded();
  startGame();
}

export function startGame() {
  showScreen('game-screen');
  updateHighScoreDisplay(getHighScore());

  document.body.classList.add('game-active');

  const isMobile = isMobileDevice();
  const canvas = isMobile
    ? document.getElementById('mobile-game')
    : document.getElementById('game');

  const selected = document.querySelector('.difficulty-option.active');
  const difficulty = (selected && selected.dataset.difficulty) ? selected.dataset.difficulty : 'normal';

  if (canvas) {
    setTetris(new Tetris(canvas, { difficulty }));
    const game = getTetris();
    game.start();
    /* ゲーム画面表示直後は flex 確定前にコンストラクタが走ることがあるため、レイアウト後に再計測 */
    if (isMobile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const t = getTetris();
          if (t) {
            t.handleResize();
            t.draw();
          }
        });
      });
    }
  } else {
    console.error('Canvas not found!');
  }
}

export function pauseGame() {
  const t = getTetris();
  if (t && !t.gameOver) {
    t.pause();
  }
}

export function resumeGame() {
  const t = getTetris();
  if (t) {
    t.resume();
  }
}

export function holdGame() {
  const t = getTetris();
  if (t) t.holdPiece();
}

export function restartGame() {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.remove('show');
  });
  const stageToast = document.getElementById('stage-clear');
  if (stageToast) stageToast.classList.remove('show');

  const t = getTetris();
  if (t) {
    t.reset();
    t.start();
  }
}

export function quitToMenu() {
  const t = getTetris();
  if (t) {
    clearInterval(t.gameLoop);
    setTetris(null);
  }

  document.body.classList.remove('game-active');

  pauseAllBgm();

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.remove('show');
  });
  const stageToast = document.getElementById('stage-clear');
  if (stageToast) stageToast.classList.remove('show');
  showScreen('start-screen');
}

export function backToMenu() {
  quitToMenu();
}
