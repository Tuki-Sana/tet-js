import { Tetris } from './tetris-game.js';
import { performZoneAction } from './input.js';
import { showScreen } from './screens.js';

const TUTORIAL_STEPS = [
  { id: 'move', message: '画面の左側をタップで左へ、右側をタップで右へ移動してみよう。（キーなら A / D）', completeOn: 'move' },
  { id: 'rotate', message: '画面上部をタップしてブロックを回転させよう。（キーなら W）', completeOn: 'rotate' },
  { id: 'drop', message: '画面下部をタップすると落下が速くなる。試してみよう。（キーなら S）', completeOn: 'drop' },
  { id: 'line', message: '横一列を揃えるとラインが消える。1行消してみよう。', completeOn: 'lineCleared' },
  { id: 'done', message: 'チュートリアル完了！ ゲームを楽しもう。', completeOn: null }
];

let tutorialTetris = null;
let tutorialStepIndex = 0;
let tutorialKeyHandler = null;
let tutorialTapHandlerRefs = [];

function getTutorialInstructionEl() {
  return document.getElementById('tutorial-instruction');
}

function getTutorialLayoutEl() {
  return document.getElementById('tutorial-layout');
}

function getTutorialStepIndicatorEl() {
  return document.getElementById('tutorial-step-indicator');
}

function updateTutorialInstruction() {
  const el = getTutorialInstructionEl();
  const stepEl = getTutorialStepIndicatorEl();
  const layoutEl = getTutorialLayoutEl();
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  if (el && step) {
    el.textContent = step.message;
  }
  if (stepEl) {
    const total = 4;
    if (step && step.completeOn) {
      const current = Math.min(tutorialStepIndex + 1, total);
      stepEl.textContent = `ステップ ${current} / ${total}`;
    } else {
      stepEl.textContent = '完了';
    }
  }
  if (layoutEl && step) {
    layoutEl.setAttribute('data-step', step.completeOn || '');
  }
}

function advanceTutorialStep(reason) {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  if (!step || step.completeOn !== reason) return;
  tutorialStepIndex++;
  if (tutorialStepIndex >= TUTORIAL_STEPS.length) {
    tutorialStepIndex = TUTORIAL_STEPS.length - 1;
  }
  updateTutorialInstruction();
}

export function showTutorialScreen() {
  showScreen('tutorial-screen');
  tutorialStepIndex = 0;

  const canvas = document.getElementById('tutorial-canvas');
  if (!canvas) return;

  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const isDesktop = window.innerWidth >= 769;
  const maxH = isDesktop ? 560 : 520;
  const vhRatio = isDesktop ? 0.7 : 0.76;
  const maxCanvasHeight = Math.min(maxH, Math.floor(vh * vhRatio));
  const h = Math.max(200, maxCanvasHeight);
  const w = Math.floor(h / 2);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  updateTutorialInstruction();

  tutorialTetris = new Tetris(canvas, {
    difficulty: 'easy',
    tutorialMode: true,
    tutorialCallbacks: {
      onLineCleared(count) {
        if (count >= 1) advanceTutorialStep('lineCleared');
      },
      onGameOver() {
        const el = getTutorialInstructionEl();
        if (el) el.textContent = 'ブロックが積み上がった。スタート画面へ戻るか、もう一度チュートリアルを試そう。';
      }
    }
  });
  tutorialTetris.start();

  tutorialKeyHandler = (e) => {
    if (!tutorialTetris || tutorialTetris.gameOver) return;
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    if (!step) return;
    const k = e.key.toLowerCase();
    if (step.completeOn === 'move' && (k === 'a' || k === 'd')) {
      tutorialTetris.movePiece(k === 'a' ? -1 : 1, 0);
      tutorialTetris.draw();
      advanceTutorialStep('move');
      e.preventDefault();
    } else if (step.completeOn === 'rotate' && k === 'w') {
      tutorialTetris.rotatePiece();
      tutorialTetris.draw();
      advanceTutorialStep('rotate');
      e.preventDefault();
    } else if (step.completeOn === 'drop' && k === 's') {
      tutorialTetris.movePiece(0, 1);
      tutorialTetris.draw();
      advanceTutorialStep('drop');
      e.preventDefault();
    } else if (step.completeOn === 'lineCleared') {
      if (k === 'a') tutorialTetris.movePiece(-1, 0);
      else if (k === 'd') tutorialTetris.movePiece(1, 0);
      else if (k === 'w') tutorialTetris.rotatePiece();
      else if (k === 's') tutorialTetris.movePiece(0, 1);
      if (k === 'a' || k === 'd' || k === 'w' || k === 's') {
        tutorialTetris.draw();
        e.preventDefault();
      }
    }
  };
  document.addEventListener('keydown', tutorialKeyHandler);

  tutorialTapHandlerRefs = [];
  const tapZones = document.querySelectorAll('#tutorial-tap-zones .tap-zone');
  tapZones.forEach(zone => {
    const action = zone.dataset.action;
    const handler = (e) => {
      e.preventDefault();
      if (!tutorialTetris || tutorialTetris.gameOver) return;
      const step = TUTORIAL_STEPS[tutorialStepIndex];
      if (!step) return;

      if (step.completeOn === 'move' && (action === 'left' || action === 'right')) {
        performZoneAction(tutorialTetris, action);
        tutorialTetris.draw();
        advanceTutorialStep('move');
      } else if (step.completeOn === 'rotate' && action === 'rotate') {
        performZoneAction(tutorialTetris, action);
        tutorialTetris.draw();
        advanceTutorialStep('rotate');
      } else if (step.completeOn === 'drop' && action === 'down') {
        performZoneAction(tutorialTetris, action);
        tutorialTetris.draw();
        advanceTutorialStep('drop');
      } else if (step.completeOn === 'lineCleared') {
        performZoneAction(tutorialTetris, action);
        tutorialTetris.draw();
      }
    };
    zone.addEventListener('touchstart', handler, { passive: false });
    zone.addEventListener('mousedown', handler);
    tutorialTapHandlerRefs.push({ zone, handler, eventTypes: ['touchstart', 'mousedown'] });
  });
}

export function exitTutorial() {
  if (tutorialTetris) {
    clearInterval(tutorialTetris.gameLoop);
    tutorialTetris = null;
  }
  if (tutorialKeyHandler) {
    document.removeEventListener('keydown', tutorialKeyHandler);
    tutorialKeyHandler = null;
  }
  tutorialTapHandlerRefs.forEach(({ zone, handler, eventTypes }) => {
    eventTypes.forEach(ev => zone.removeEventListener(ev, handler));
  });
  tutorialTapHandlerRefs = [];
  tutorialStepIndex = 0;
  showScreen('start-screen');
}
