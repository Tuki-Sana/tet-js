// localStorage ハイスコア用キー
const HIGH_SCORE_STORAGE_KEY = 'tetrisHighScore';

// PWA キャッシュ更新用（sw.js の CACHE_VERSION と揃える）
const APP_VERSION = '1.0.1';

// ハイスコア取得（不正値は 0）
function getHighScore() {
  try {
    const v = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY), 10);
    return Number.isNaN(v) ? 0 : v;
  } catch {
    return 0;
  }
}

// ハイスコア表示を一括更新
function updateHighScoreDisplay(value) {
  const n = String(value ?? getHighScore());
  const el = document.getElementById('high-score');
  if (el) el.textContent = n;
  const mobileEl = document.getElementById('mobile-high-score');
  if (mobileEl) mobileEl.textContent = n;
}

// 難易度設定（開始レベルと初期落下間隔 ms）
const DIFFICULTY_CONFIG = {
  easy:   { startingLevel: 1, dropInterval: 2000 },
  normal: { startingLevel: 2, dropInterval: 1500 },
  hard:   { startingLevel: 4, dropInterval: 900 }
};
const LINES_PER_STAGE = 10;

// 視覚的に正方形に見えるようブロックの縦を少し伸ばす係数（1.0 = 正方形）
const BLOCK_HEIGHT_RATIO = 1.04;

// BGM 切り替え（積みの高さ: この行より上にブロックがあるとピンチ）
const BGM_PINCH_ROW = 7;   // 0〜7 で danger
const BGM_NORMAL_ROW = 10; // 10 以上で normal（ヒステリシス）
let currentBgm = 'normal';

function getHighestFilledRow(board) {
  for (let y = 0; y < 20; y++) {
    if (board[y].some((cell) => cell !== 0)) return y;
  }
  return 20;
}

function playBgmNormal() {
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  if (danger) danger.pause();
  if (normal) {
    normal.currentTime = 0;
    normal.play().catch(() => {});
  }
  currentBgm = 'normal';
}

function playBgmDanger() {
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  if (normal) normal.pause();
  if (danger) {
    danger.currentTime = 0;
    danger.play().catch(() => {});
  }
  currentBgm = 'danger';
}

function pauseAllBgm() {
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  if (normal) normal.pause();
  if (danger) danger.pause();
}

function playGameOverSe() {
  const el = document.getElementById('se-gameover');
  if (el) {
    el.currentTime = 0;
    el.play().catch(() => {});
  }
}

function playLineClearSe(linesCleared) {
  const id = linesCleared >= 3 ? 'se-line-many' : 'se-line-few';
  const el = document.getElementById(id);
  if (el) {
    el.currentTime = 0;
    el.play().catch(() => {});
  }
}

function updateBgmFromBoard(board) {
  const top = getHighestFilledRow(board);
  if (top <= BGM_PINCH_ROW && currentBgm !== 'danger') playBgmDanger();
  else if (top >= BGM_NORMAL_ROW && currentBgm !== 'normal') playBgmNormal();
}

function getDropIntervalForLevel(level) {
  return Math.max(400, 2000 * Math.pow(0.85, level - 1));
}

// ゲームオーバー「画面を埋める」演出の設定
const GAME_OVER_FILL = {
  spawnIntervalMs: 280,
  maxDurationMs: 4200,
  fallSpeedPerFrame: 0.22
};

// 色パレット（海モチーフ・パステル）
const PIECE_COLORS = [
  '#a8d8ea', // I型 - 空・スカイブルー
  '#c4b5fd', // T型 - ラベンダー
  '#7dd3c0', // L型 - 浅い海・ペールティール
  '#5dade2', // J型 - 海・アクア
  '#ffd6a5', // O型 - 砂・ペールピーチ
  '#b5ead7', // S型 - 波・ミント
  '#f8b4c4'  // Z型 - 朝焼け・ソフトピンク
];

// デバイス判定関数
function isMobileDevice() {
  // URLパラメータでデスクトップモードを強制
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('desktop') === 'true') {
    return false;
  }
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.innerWidth <= 768 && window.innerHeight <= 1024);
}

// モバイルUI設定
function setupMobileUI() {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    document.body.classList.add('mobile-device');
  }
}

// タップゾーン操作の共通処理（本番・チュートリアルで利用）
function performZoneAction(tetris, action) {
  if (!tetris || tetris.gameOver || tetris.paused) return;
  switch (action) {
    case 'rotate': tetris.rotatePiece(); break;
    case 'left': tetris.movePiece(-1, 0); break;
    case 'right': tetris.movePiece(1, 0); break;
    case 'down': tetris.movePiece(0, 1); break;
  }
}

// 落下ゾーン長押しリピートの設定（初回即実行→遅延後に 80ms 間隔）
const DOWN_REPEAT_DELAY_MS = 150;
const DOWN_REPEAT_INTERVAL_MS = 80;

// テトリスメインクラス
class Tetris {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    const difficulty = options.difficulty && DIFFICULTY_CONFIG[options.difficulty] ? options.difficulty : 'normal';
    this.difficulty = difficulty;
    const config = DIFFICULTY_CONFIG[difficulty];
    this.startingLevel = config.startingLevel;
    this.dropInterval = config.dropInterval;
    
    this.tutorialMode = !!options.tutorialMode;
    this.tutorialCallbacks = options.tutorialCallbacks || {};
    if (this.tutorialMode) {
      this.dropInterval = 2200;
      this.startingLevel = 1;
      this.level = 1;
    }
    
    // ★追加: デバイス判定
    this.isMobile = isMobileDevice();
    
    // ★追加: モバイル版キャンバスサイズ調整
    if (this.isMobile && canvas.id === 'mobile-game') {
      this.adjustMobileCanvasSize();
    }
    
    // ★修正: グリッドサイズをキャンバスに応じて調整（チュートリアル・非標準サイズもキャンバスに合わせる）
    const isTutorialCanvas = canvas.id === 'tutorial-canvas';
    const isStandardPcSize = this.canvas.width === 300 && this.canvas.height === 600;
    this.gridSize = (this.isMobile || isTutorialCanvas || !isStandardPcSize)
      ? Math.min(this.canvas.width / 10, this.canvas.height / 20)
      : 30;
    
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    this.level = this.startingLevel;
    this.currentPiece = null;
    this.gameLoop = null;
    this.gameOver = false;
    this.paused = false;
    this.linesStacked = 0;
    this.linesCleared = 0;
    
    // ★修正: デバイス別NEXT設定
    if (this.isMobile) {
      this.nextPieces = [];
      this.nextCanvas = document.getElementById('mobile-next');
      this.nextContext = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;
    } else {
      this.nextPieces = [];
      this.nextCanvases = [
        document.getElementById('next-piece-1'),
        document.getElementById('next-piece-2'),
        document.getElementById('next-piece-3')
      ];
      this.nextContexts = this.nextCanvases.map(canvas => canvas ? canvas.getContext('2d') : null);
    }
    
    this.initializeNextPieces();
    if (!this.tutorialMode) {
      this.setupControls();
    } else {
      this.nextCanvases = [];
      this.nextContexts = [];
      if (this.isMobile) {
        this.nextCanvas = null;
        this.nextContext = null;
      }
    }
  }

  // ★追加: モバイルキャンバスサイズ調整メソッド（iPhone 検索バー考慮で visualViewport 使用）
  adjustMobileCanvasSize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;

    const maxWidth = Math.min(380, viewportWidth - 6);
    const maxHeight = Math.min(580, viewportHeight - 70);
    
    // アスペクト比を維持（10:20の比率）
    const aspectRatio = 10 / 20;
    let finalWidth = maxWidth;
    let finalHeight = maxWidth / aspectRatio;
    
    if (finalHeight > maxHeight) {
      finalHeight = maxHeight;
      finalWidth = finalHeight * aspectRatio;
    }
    
    // ★重要: キャンバス要素のサイズ設定
    this.canvas.width = Math.floor(finalWidth);
    this.canvas.height = Math.floor(finalHeight);
    this.canvas.style.width = Math.floor(finalWidth) + 'px';
    this.canvas.style.height = Math.floor(finalHeight) + 'px';
    
    console.log(`Mobile canvas adjusted: ${this.canvas.width}×${this.canvas.height}`);
  }

  // テトラミノの形状定義
  static SHAPES = [
    [[1,1,1,1]], // I型
    [[1,1,1],[0,1,0]], // T型
    [[1,1,1],[1,0,0]], // L型
    [[1,1,1],[0,0,1]], // J型
    [[1,1],[1,1]], // O型
    [[1,1,0],[0,1,1]], // S型
    [[0,1,1],[1,1,0]]  // Z型
  ];

  // デバイス別操作設定
  setupControls() {
    if (this.isMobile) {
      this.setupMobileControls();
    } else {
      this.setupKeyboardControls();
    }
    
    // スクロール防止（両デバイス共通）
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  // ★修正: スマホ専用タップ操作（performZoneAction 共通化・落下リピート 初回即時→80ms）
  setupMobileControls() {
    const tapZoneSelector = this.isMobile ? '#mobile-tap-zones .tap-zone' : '#tap-zones .tap-zone';
    const tapZones = document.querySelectorAll(tapZoneSelector);
    let downRepeatTimer = null;
    let downRepeatInterval = null;

    const clearDownRepeat = () => {
      if (downRepeatTimer) {
        clearTimeout(downRepeatTimer);
        downRepeatTimer = null;
      }
      if (downRepeatInterval) {
        clearInterval(downRepeatInterval);
        downRepeatInterval = null;
      }
    };

    tapZones.forEach(zone => {
      const action = zone.dataset.action;

      const onStart = (e) => {
        e.preventDefault();
        if (this.gameOver || this.paused) return;

        performZoneAction(this, action);
        this.draw();

        if (action === 'down') {
          downRepeatTimer = setTimeout(() => {
            downRepeatTimer = null;
            downRepeatInterval = setInterval(() => {
              if (!this.gameOver && !this.paused) {
                performZoneAction(this, 'down');
                this.draw();
              }
            }, DOWN_REPEAT_INTERVAL_MS);
          }, DOWN_REPEAT_DELAY_MS);
        }
      };

      const onEnd = (e) => {
        e.preventDefault();
        if (action === 'down') clearDownRepeat();
      };

      zone.addEventListener('touchstart', onStart, { passive: false });
      zone.addEventListener('touchend', onEnd, { passive: false });
      zone.addEventListener('touchcancel', onEnd, { passive: false });
      zone.addEventListener('mousedown', onStart);
      zone.addEventListener('mouseup', onEnd);
    });
  }

  // PC専用キーボード操作
  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      if (this.gameOver) return;
      
      if (e.key === 'p' || e.key === 'P') {
        if (this.paused) {
          this.resume();
        } else {
          this.pause();
        }
        e.preventDefault();
        return;
      }
      
      if (this.paused) return;
      
      switch(e.key.toLowerCase()) {
        case 'a': this.movePiece(-1, 0); break;
        case 'd': this.movePiece(1, 0); break;
        case 's': this.movePiece(0, 1); break;
        case 'w': this.rotatePiece(); break;
      }
      this.draw();
    });
  }

  // NEXTピース初期化
  initializeNextPieces() {
    for (let i = 0; i < 4; i++) {
      this.nextPieces.push(Math.floor(Math.random() * Tetris.SHAPES.length));
    }
    this.drawNextPieces();
  }

  // ★修正: デバイス別NEXT描画
  drawNextPieces() {
    if (this.isMobile && this.nextContext) {
      // ★スマホ版：1個のみ表示
      this.nextContext.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
      if (this.nextPieces.length > 0) {
        const shapeIndex = this.nextPieces[0];
        const shape = Tetris.SHAPES[shapeIndex];
        const color = PIECE_COLORS[shapeIndex];
        const size = 8;
        
        const offsetX = (this.nextCanvas.width - shape[0].length * size) / 2;
        const offsetY = (this.nextCanvas.height - shape.length * size) / 2;
        
        this.nextContext.fillStyle = color;
        shape.forEach((row, y) => {
          row.forEach((value, x) => {
            if (value) {
              this.nextContext.fillRect(
                offsetX + x * size,
                offsetY + y * size,
                size - 1, size - 1
              );
            }
          });
        });
      }
    } else {
      // ★PC版：3個表示
      this.nextContexts.forEach((ctx, index) => {
        if (!ctx) return;
        const canvas = this.nextCanvases[index];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (index < this.nextPieces.length) {
          const shapeIndex = this.nextPieces[index];
          const shape = Tetris.SHAPES[shapeIndex];
          const color = PIECE_COLORS[shapeIndex];
          const size = index === 0 ? 12 : 10;
          
          const offsetX = (canvas.width - shape[0].length * size) / 2;
          const offsetY = (canvas.height - shape.length * size) / 2;
          
          ctx.fillStyle = color;
          shape.forEach((row, y) => {
            row.forEach((value, x) => {
              if (value) {
                ctx.fillRect(
                  offsetX + x * size,
                  offsetY + y * size,
                  size - 1, size - 1
                );
              }
            });
          });
        }
      });
    }
  }

  // 新しいピース生成
  createNewPiece() {
    const shapeIndex = this.nextPieces.shift();
    const shape = Tetris.SHAPES[shapeIndex];
    
    this.currentPiece = {
      shape,
      shapeIndex,
      x: Math.floor(this.board[0].length/2) - Math.floor(shape[0].length/2),
      y: 0
    };
    
    this.nextPieces.push(Math.floor(Math.random() * Tetris.SHAPES.length));
    this.drawNextPieces();
  }

  // 衝突判定
  checkCollision(newX, newY, shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const boardX = newX + x;
          const boardY = newY + y;
          
          // 壁の衝突判定
          if (boardX < 0 || boardX >= this.board[0].length) return true;
          // 底面との衝突
          if (boardY >= this.board.length) return true;
          // 既存のブロックとの衝突
          if (boardY >= 0 && this.board[boardY][boardX]) return true;
        }
      }
    }
    return false;
  }

  // ピース移動
  movePiece(dx, dy) {
    if (this.gameOver || this.paused) return false;
    const newX = this.currentPiece.x + dx;
    const newY = this.currentPiece.y + dy;
    
    if (!this.checkCollision(newX, newY, this.currentPiece.shape)) {
      this.currentPiece.x = newX;
      this.currentPiece.y = newY;
      return true;
    }
    return false;
  }

  // ピース回転
  rotatePiece() {
    if (this.gameOver || this.paused) return;
    
    const shape = this.currentPiece.shape;
    const rotatedShape = [];
    const rows = shape.length;
    const cols = shape[0].length;
    
    // 時計回り90度回転: [row][col] -> [col][rows-1-row]
    for (let newRow = 0; newRow < cols; newRow++) {
      rotatedShape[newRow] = [];
      for (let newCol = 0; newCol < rows; newCol++) {
        rotatedShape[newRow][newCol] = shape[rows - 1 - newCol][newRow];
      }
    }
    
    if (!this.checkCollision(this.currentPiece.x, this.currentPiece.y, rotatedShape)) {
      this.currentPiece.shape = rotatedShape;
    }
  }

  // ピース固定処理
  lockPiece() {
    const {x, y, shape, shapeIndex} = this.currentPiece;
    let gameOverFlag = false;
    
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const boardY = y + row;
          const boardX = x + col;
          
          if (boardY < 0) {
            gameOverFlag = true;
            break;
          }
          
          // 境界チェックを追加
          if (boardY >= 0 && boardY < this.board.length && 
              boardX >= 0 && boardX < this.board[0].length) {
            this.board[boardY][boardX] = shapeIndex + 1;
          }
        }
      }
      if (gameOverFlag) break;
    }

    if (!gameOverFlag) {
      this.linesStacked++;
      this.speedUpIfNeeded();
      this.clearLines();
      this.createNewPiece();
      
      // 新しいピースが配置できない場合もゲームオーバー
      if (this.checkCollision(this.currentPiece.x, this.currentPiece.y, this.currentPiece.shape)) {
        gameOverFlag = true;
      }
    }

    return !gameOverFlag;
  }

  // 速度上昇処理（より緩やかに）
  speedUpIfNeeded() {
    const newInterval = Math.max(400, 2000 * Math.pow(0.9, Math.floor(this.linesStacked / 8)));
    if (newInterval < this.dropInterval) {
      this.dropInterval = newInterval;
      if (this.gameLoop) {
        clearInterval(this.gameLoop);
        this.startGameLoop();
      }
    }
  }

  // ★修正: ライン消去処理（デバイス別表示更新）
  clearLines() {
    let linesCleared = 0;
    for (let row = this.board.length - 1; row >= 0; row--) {
      if (this.board[row].every(cell => cell)) {
        this.board.splice(row, 1);
        this.board.unshift(Array(10).fill(0));
        linesCleared++;
        row++;
      }
    }
    
    if (linesCleared > 0) {
      if (!this.tutorialMode) playLineClearSe(linesCleared);
      // 正確なテトリススコア計算
      let lineScore = 0;
      switch(linesCleared) {
        case 1: lineScore = 100 * this.level; break;  // シングル
        case 2: lineScore = 300 * this.level; break;  // ダブル
        case 3: lineScore = 500 * this.level; break;  // トリプル
        case 4: lineScore = 800 * this.level; break;  // テトリス
      }
      
      this.score += lineScore;
      const prevLinesCleared = this.linesCleared;
      this.linesCleared += linesCleared;
      
      // レベル（難易度の開始レベル + 10ラインごと）
      const newLevel = this.startingLevel + Math.floor(this.linesCleared / 10);
      if (newLevel > this.level) {
        this.level = newLevel;
        const newInterval = getDropIntervalForLevel(this.level);
        if (newInterval < this.dropInterval) {
          this.dropInterval = newInterval;
          if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.startGameLoop();
          }
        }
      }
      
      // ステージ進行（10ラインごと）とクリア表示
      const prevStage = Math.floor(prevLinesCleared / LINES_PER_STAGE) + 1;
      const newStage = Math.floor(this.linesCleared / LINES_PER_STAGE) + 1;
      if (!this.tutorialMode && newStage > prevStage) {
        this.showStageClear(newStage);
      }
      
      // ★修正: デバイス別表示更新
      if (this.isMobile) {
        const mobileScore = document.getElementById('mobile-score');
        const mobileLevel = document.getElementById('mobile-level');
        if (mobileScore) mobileScore.textContent = this.score;
        if (mobileLevel) mobileLevel.textContent = this.level;
      } else {
        const scoreEl = document.getElementById('score');
        const levelEl = document.getElementById('level');
        if (scoreEl) scoreEl.textContent = this.score;
        if (levelEl) levelEl.textContent = this.level;
      }
      this.updateStageDisplay();

      // ハイスコア更新（上回ったら保存・表示更新）
      const currentHigh = getHighScore();
      if (this.score > currentHigh) {
        try {
          localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(this.score));
          updateHighScoreDisplay(this.score);
        } catch (_) {}
      }
      if (this.tutorialCallbacks.onLineCleared) {
        this.tutorialCallbacks.onLineCleared(linesCleared);
      }
    }
  }

  updateStageDisplay() {
    const stage = Math.floor(this.linesCleared / LINES_PER_STAGE) + 1;
    const linesInStage = this.linesCleared % LINES_PER_STAGE;
    const text = `${linesInStage}/${LINES_PER_STAGE}`;
    const stageEl = document.getElementById('stage');
    const linesEl = document.getElementById('stage-lines');
    if (stageEl) stageEl.textContent = stage;
    if (linesEl) linesEl.textContent = text;
    const mobileStage = document.getElementById('mobile-stage');
    const mobileLines = document.getElementById('mobile-stage-lines');
    if (mobileStage) mobileStage.textContent = stage;
    if (mobileLines) mobileLines.textContent = text;
  }

  showStageClear(stageNum) {
    const toast = document.getElementById('stage-clear');
    const textEl = toast ? toast.querySelector('.stage-clear-text') : null;
    if (toast && textEl) {
      textEl.textContent = `ステージ ${stageNum} クリア！`;
      toast.classList.add('show');
      toast.setAttribute('aria-hidden', 'false');
      if (this._stageClearTimer) clearTimeout(this._stageClearTimer);
      this._stageClearTimer = setTimeout(() => {
        toast.classList.remove('show');
        toast.setAttribute('aria-hidden', 'true');
        this._stageClearTimer = null;
      }, 1500);
    }
  }

  // ★修正: ゲーム描画処理（グリッドサイズ対応）
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // モバイルでは細いグリッド
    if (!this.isMobile) {
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(i * this.gridSize, 0);
        this.ctx.lineTo(i * this.gridSize, this.canvas.height);
        this.ctx.stroke();
      }
      for (let i = 0; i <= 20; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, i * this.gridSize);
        this.ctx.lineTo(this.canvas.width, i * this.gridSize);
        this.ctx.stroke();
      }
    }
    
    // ボード描画（色付きブロック）
    this.board.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.ctx.fillStyle = PIECE_COLORS[value - 1] || '#5dade2';
          const w = this.gridSize - 2;
          const h = w * BLOCK_HEIGHT_RATIO;
          this.ctx.fillRect(x * this.gridSize + 1, y * this.gridSize + 1, w, h);
        }
      });
    });

    // 現在のピース描画（色付き）
    if (this.currentPiece && !this.gameOver) {
      this.ctx.fillStyle = PIECE_COLORS[this.currentPiece.shapeIndex];
      this.currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            const w = this.gridSize - 2;
            const h = w * BLOCK_HEIGHT_RATIO;
            this.ctx.fillRect(
              (this.currentPiece.x + x) * this.gridSize + 1,
              (this.currentPiece.y + y) * this.gridSize + 1,
              w, h
            );
          }
        });
      });
    }
  }

  // ゲームループ開始
  startGameLoop() {
    this.gameLoop = setInterval(() => {
      if (this.gameOver) {
        clearInterval(this.gameLoop);
        return;
      }
      
      if (this.paused) return;
      
      if (!this.movePiece(0, 1)) {
        // ピースが固定される
        const lockResult = this.lockPiece();
        if (!lockResult) {
          // ゲームオーバー
          this.handleGameOver();
          return;
        }
      }
      this.draw();
      if (!this.tutorialMode) updateBgmFromBoard(this.board);
    }, this.dropInterval);
  }

  // ★修正: ゲームオーバー処理（落下演出のあとモーダル表示）
  handleGameOver() {
    if (!this.tutorialMode) {
      pauseAllBgm();
      playGameOverSe();
    }
    if (this.tutorialMode && this.tutorialCallbacks.onGameOver) {
      this.gameOver = true;
      clearInterval(this.gameLoop);
      this.gameLoop = null;
      this.tutorialCallbacks.onGameOver();
      return;
    }
    this.gameOver = true;
    clearInterval(this.gameLoop);
    this.gameLoop = null;
    this.gameOverFillPile = this.board.map(row => row.slice());
    this.gameOverFillPieces = [];
    this.gameOverFilling = true;
    this.gameOverFillStartTime = null;
    this.gameOverFillLastSpawn = 0;
    this.gameOverFillRAF = null;
    this.startGameOverFillAnimation();
  }

  startGameOverFillAnimation() {
    this.gameOverFillStartTime = performance.now();
    this.gameOverFillRAF = requestAnimationFrame((t) => this.stepGameOverFill(t));
  }

  stepGameOverFill(timestamp) {
    if (!this.gameOverFilling) return;
    const elapsed = timestamp - this.gameOverFillStartTime;
    if (elapsed - this.gameOverFillLastSpawn >= GAME_OVER_FILL.spawnIntervalMs) {
      this.gameOverFillLastSpawn = elapsed;
      const shapeIndex = Math.floor(Math.random() * Tetris.SHAPES.length);
      const shape = Tetris.SHAPES[shapeIndex];
      const h = shape.length;
      const w = shape[0].length;
      const x = Math.floor(Math.random() * Math.max(1, 11 - w));
      const y = -h - Math.random() * 2;
      this.gameOverFillPieces.push({ shape, colorIndex: shapeIndex, x, y });
    }
    const g = this.gridSize;
    const pile = this.gameOverFillPile;
    const stillFalling = [];
    for (const p of this.gameOverFillPieces) {
      p.y += GAME_OVER_FILL.fallSpeedPerFrame;
      let landed = false;
      for (let sy = 0; sy < p.shape.length && !landed; sy++) {
        for (let sx = 0; sx < p.shape[0].length; sx++) {
          if (!p.shape[sy][sx]) continue;
          const gy = p.y + sy;
          const gx = p.x + sx;
          if (gy >= 20) landed = true;
          else if (gy >= 0 && gx >= 0 && gx < 10 && pile[Math.floor(gy)][Math.floor(gx)]) landed = true;
        }
      }
      if (landed) {
        for (let sy = 0; sy < p.shape.length; sy++) {
          for (let sx = 0; sx < p.shape[0].length; sx++) {
            if (!p.shape[sy][sx]) continue;
            const gy = Math.floor(p.y + sy);
            const gx = Math.floor(p.x + sx);
            if (gy >= 0 && gy < 20 && gx >= 0 && gx < 10) pile[gy][gx] = p.colorIndex + 1;
          }
        }
      } else {
        stillFalling.push(p);
      }
    }
    this.gameOverFillPieces = stillFalling;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.isMobile) {
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(i * g, 0);
        this.ctx.lineTo(i * g, this.canvas.height);
        this.ctx.stroke();
      }
      for (let i = 0; i <= 20; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, i * g);
        this.ctx.lineTo(this.canvas.width, i * g);
        this.ctx.stroke();
      }
    }
    pile.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.ctx.fillStyle = PIECE_COLORS[value - 1] || '#5dade2';
          const w = g - 2;
          const h = w * BLOCK_HEIGHT_RATIO;
          this.ctx.fillRect(x * g + 1, y * g + 1, w, h);
        }
      });
    });
    this.gameOverFillPieces.forEach(p => {
      this.ctx.fillStyle = PIECE_COLORS[p.colorIndex] || '#5dade2';
      p.shape.forEach((row, sy) => {
        row.forEach((cell, sx) => {
          if (cell) {
            const px = (p.x + sx) * g + 1;
            const py = (p.y + sy) * g + 1;
            const w = g - 2;
            const h = w * BLOCK_HEIGHT_RATIO;
            this.ctx.fillRect(px, py, w, h);
          }
        });
      });
    });
    const topFilled = pile[0].some(c => c !== 0);
    const timeUp = elapsed >= GAME_OVER_FILL.maxDurationMs;
    if (topFilled || timeUp) {
      this.gameOverFilling = false;
      if (this.gameOverFillRAF != null) {
        cancelAnimationFrame(this.gameOverFillRAF);
        this.gameOverFillRAF = null;
      }
      this.showGameOverModal();
      return;
    }
    this.gameOverFillRAF = requestAnimationFrame((t) => this.stepGameOverFill(t));
  }

  showGameOverModal() {
    const modal = document.getElementById('game-over');
    if (modal) modal.classList.add('show');
    const scoreEl = document.getElementById('final-score');
    const levelEl = document.getElementById('final-level');
    const linesEl = document.getElementById('final-lines');
    if (scoreEl) scoreEl.textContent = this.score;
    if (levelEl) levelEl.textContent = this.level;
    if (linesEl) linesEl.textContent = this.linesCleared;
    try {
      const high = getHighScore();
      if (this.score > high) localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(this.score));
      updateHighScoreDisplay(getHighScore());
    } catch (_) {}
  }

  // ★修正: ゲーム一時停止（モーダル表示改善）
  pause() {
    this.paused = true;
    if (!this.tutorialMode) pauseAllBgm();
    const modal = document.getElementById('pause-menu');
    modal.classList.add('show');
  }

  // ★修正: ゲーム再開（モーダル非表示改善）
  resume() {
    this.paused = false;
    const modal = document.getElementById('pause-menu');
    modal.classList.remove('show');
    if (!this.tutorialMode) (currentBgm === 'danger' ? playBgmDanger : playBgmNormal)();
  }

  // ★修正: ゲームリセット（デバイス別表示リセット）
  reset() {
    clearInterval(this.gameLoop);
    this.gameOverFilling = false;
    if (this.gameOverFillRAF != null) {
      cancelAnimationFrame(this.gameOverFillRAF);
      this.gameOverFillRAF = null;
    }
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    const config = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.normal;
    this.startingLevel = config.startingLevel;
    this.dropInterval = config.dropInterval;
    this.level = this.startingLevel;
    this.linesStacked = 0;
    this.linesCleared = 0;
    this.gameOver = false;
    this.paused = false;
    
    // NEXTピースもリセット
    this.nextPieces = [];
    this.initializeNextPieces();
    
    // ★修正: デバイス別表示リセット
    if (this.isMobile) {
      const mobileScore = document.getElementById('mobile-score');
      const mobileLevel = document.getElementById('mobile-level');
      if (mobileScore) mobileScore.textContent = '0';
      if (mobileLevel) mobileLevel.textContent = String(this.startingLevel);
    } else {
      const scoreEl = document.getElementById('score');
      const levelEl = document.getElementById('level');
      if (scoreEl) scoreEl.textContent = '0';
      if (levelEl) levelEl.textContent = String(this.startingLevel);
    }
    this.updateStageDisplay();
    // ハイスコア表示は保存値のまま更新
    updateHighScoreDisplay(getHighScore());
  }

  // ★追加: 画面回転時のリサイズ対応
  handleResize() {
    if (this.isMobile && this.canvas.id === 'mobile-game') {
      this.adjustMobileCanvasSize();
      this.gridSize = Math.min(this.canvas.width / 10, this.canvas.height / 20);
      this.draw(); // 再描画
    }
  }

  // ゲーム開始
  start() {
    this.createNewPiece();
    this.startGameLoop();
    this.updateStageDisplay();
    this.draw();
    if (!this.tutorialMode) playBgmNormal();
  }
}

// グローバル変数
let tetris = null;

// 画面管理関数
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

function showDifficultyScreen() {
  showScreen('difficulty-screen');
}

function showStartScreen() {
  showScreen('start-screen');
}

// ========== チュートリアル ==========
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

function showTutorialScreen() {
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

function exitTutorial() {
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

// ★修正: ゲーム制御関数（デバイス別キャンバス選択改良）
function startGame() {
  showScreen('game-screen');
  updateHighScoreDisplay(getHighScore());

  /* ゲーム画面中はテーマ切替を非表示（エミュ・狭いビューポートでも重ならないように） */
  document.body.classList.add('game-active');

  const isMobile = isMobileDevice();
  
  // ★修正: より確実なキャンバス選択
  let canvas;
  if (isMobile) {
    canvas = document.getElementById('mobile-game');
    console.log('Mobile game canvas selected:', canvas);
  } else {
    canvas = document.getElementById('game');
    console.log('PC game canvas selected:', canvas);
  }
  
  const selected = document.querySelector('.difficulty-option.active');
  const difficulty = (selected && selected.dataset.difficulty) ? selected.dataset.difficulty : 'normal';
  
  if (canvas) {
    tetris = new Tetris(canvas, { difficulty });
    tetris.start();
    console.log('Game started successfully');
  } else {
    console.error('Canvas not found!');
  }
}

function pauseGame() {
  if (tetris && !tetris.gameOver) {
    tetris.pause();
  }
}

function resumeGame() {
  if (tetris) {
    tetris.resume();
  }
}

// ★修正: ゲーム再開時の処理改善
function restartGame() {
  // モーダルを閉じる
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('show');
  });
  const stageToast = document.getElementById('stage-clear');
  if (stageToast) stageToast.classList.remove('show');
  
  if (tetris) {
    tetris.reset();
    tetris.start();
  }
}

// ★修正: メニューに戻る処理改善
function quitToMenu() {
  if (tetris) {
    clearInterval(tetris.gameLoop);
    tetris.gameOverFilling = false;
    if (tetris.gameOverFillRAF != null) {
      cancelAnimationFrame(tetris.gameOverFillRAF);
      tetris.gameOverFillRAF = null;
    }
    tetris = null;
  }

  // ★追加: スマホでメニュー戻り時にbody固定を解除
  document.body.classList.remove('game-active');

  pauseAllBgm();

  // モーダル・ステージクリアトーストを閉じる
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('show');
  });
  const stageToast = document.getElementById('stage-clear');
  if (stageToast) stageToast.classList.remove('show');
  showScreen('start-screen');
}

function backToMenu() {
  quitToMenu();
}

// ========== テーマ（ライト/ダーク） ==========
const THEME_STORAGE_KEY = 'tetrisTheme';

function getPreferredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch (_) {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
  }
}

function toggleTheme() {
  const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (_) {}
  applyTheme(next);
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  setupMobileUI();
  applyTheme(getPreferredTheme());
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = 'v' + APP_VERSION;
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  document.querySelectorAll('.difficulty-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-option').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  console.log('Mobile device detected:', isMobileDevice());
});

// ★修正: 画面回転対応強化
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    setupMobileUI();
    if (tetris) {
      tetris.handleResize(); // ★追加: リサイズ処理
      tetris.drawNextPieces();
    }
  }, 100);
});

// ★追加: ウィンドウリサイズ対応
window.addEventListener('resize', () => {
  if (tetris) {
    tetris.handleResize();
  }
});

// ★追加: iPhone 検索バー出し入れ時にキャンバス再計算（visualViewport）
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (tetris && tetris.isMobile && tetris.canvas.id === 'mobile-game') {
      tetris.handleResize();
    }
  });
}
