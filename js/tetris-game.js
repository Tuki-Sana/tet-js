import {
  DIFFICULTY_CONFIG,
  LINES_PER_LEVEL,
  BLOCK_HEIGHT_RATIO,
  PIECE_COLORS,
  getDropIntervalForLevel,
  HIGH_SCORE_STORAGE_KEY,
  DOWN_REPEAT_DELAY_MS,
  DOWN_REPEAT_INTERVAL_MS
} from './config.js';
import {
  playBgmNormal,
  pauseAllBgm,
  playLineClearSe,
  playGameOverSe,
  updateBgmFromBoard,
  resumeBgmAfterPause
} from './audio.js';
import { getHighScore, updateHighScoreDisplay } from './score.js';
import { isMobileDevice, performZoneAction, attachMobileSwipeHardDropOnce } from './input.js';

export class Tetris {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    const difficulty = options.difficulty && DIFFICULTY_CONFIG[options.difficulty] ? options.difficulty : 'normal';
    this.difficulty = difficulty;
    const config = DIFFICULTY_CONFIG[difficulty];
    this.startingLevel = config.startingLevel;

    this.tutorialMode = !!options.tutorialMode;
    this.tutorialCallbacks = options.tutorialCallbacks || {};
    if (this.tutorialMode) {
      this.dropInterval = 2200;
      this.startingLevel = 1;
      this.level = 1;
    } else {
      this.level = this.startingLevel;
      this.dropInterval = getDropIntervalForLevel(this.level);
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
    this.currentPiece = null;
    this.gameLoop = null;
    this.gameOver = false;
    this.paused = false;
    this.linesCleared = 0;
    this.combo = 0;
    this.holdIndex = null;
    this.canHold = true;
    
    // ★修正: デバイス別NEXT設定
    if (this.isMobile) {
      this.nextPieces = [];
      this.nextCanvas = document.getElementById('mobile-next');
      this.nextContext = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;
      this.holdCanvas = document.getElementById('mobile-hold-piece');
      this.holdContext = this.holdCanvas ? this.holdCanvas.getContext('2d') : null;
      this.holdBtnMobile = document.getElementById('mobile-hold-btn');
      this.holdPreviewMobile = document.getElementById('mobile-hold-preview');
    } else {
      this.nextPieces = [];
      this.nextCanvases = [
        document.getElementById('next-piece-1'),
        document.getElementById('next-piece-2'),
        document.getElementById('next-piece-3')
      ];
      this.nextContexts = this.nextCanvases.map(canvas => canvas ? canvas.getContext('2d') : null);
      this.holdCanvas = document.getElementById('hold-piece');
      this.holdContext = this.holdCanvas ? this.holdCanvas.getContext('2d') : null;
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

    const headerEl = document.querySelector('.game-layout-mobile .mobile-header');
    const holdBarEl = document.querySelector('.mobile-hold-bar');
    let headerH = headerEl ? headerEl.getBoundingClientRect().height : 68;
    let holdH = holdBarEl ? holdBarEl.getBoundingClientRect().height : 56;
    if (headerH < 20) headerH = 68;
    if (holdH < 20) holdH = 56;
    const overheadY = headerH + holdH + 32;
    const nextReserve = 96;
    const maxWidth = Math.min(380, viewportWidth - nextReserve);
    const maxHeight = Math.min(580, viewportHeight - overheadY);
    
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
      attachMobileSwipeHardDropOnce();
    } else {
      this.setupKeyboardControls();
    }
    
    // スクロール防止（ゲーム中のみ。メニュー戻り後はスタート画面のスクロールを許可）
    document.addEventListener('touchmove', (e) => {
      if (document.body.classList.contains('game-active')) e.preventDefault();
    }, { passive: false });
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

      if (e.code === 'Space' || e.key === ' ') {
        if (!e.repeat) {
          e.preventDefault();
          this.hardDrop();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'a': this.movePiece(-1, 0); break;
        case 'd': this.movePiece(1, 0); break;
        case 's': this.movePiece(0, 1); break;
        case 'w': this.rotatePiece(); break;
        case 'c': this.holdPiece(); break;
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
        const cw = this.nextCanvas.width;
        const ch = this.nextCanvas.height;
        let size = Math.floor(Math.min(cw / shape[0].length, ch / shape.length)) - 1;
        size = Math.max(6, Math.min(size, 18));

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
    this.canHold = true;
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

  // ホールド: 現在ピースをストックし、ストックがあればそれに差し替え、なければNEXTから生成
  holdPiece() {
    if (!this.currentPiece || this.gameOver || this.paused || !this.canHold) return;
    const savedIndex = this.currentPiece.shapeIndex;
    if (this.holdIndex !== null) {
      const shape = Tetris.SHAPES[this.holdIndex].map(row => row.slice());
      const w = shape[0].length;
      this.currentPiece = {
        shape,
        shapeIndex: this.holdIndex,
        x: Math.floor(this.board[0].length / 2) - Math.floor(w / 2),
        y: 0
      };
      this.holdIndex = savedIndex;
    } else {
      this.holdIndex = savedIndex;
      const nextIndex = this.nextPieces.shift();
      const shape = Tetris.SHAPES[nextIndex].map(row => row.slice());
      const w = shape[0].length;
      this.currentPiece = {
        shape,
        shapeIndex: nextIndex,
        x: Math.floor(this.board[0].length / 2) - Math.floor(w / 2),
        y: 0
      };
      this.nextPieces.push(Math.floor(Math.random() * Tetris.SHAPES.length));
    }
    this.canHold = false;
    this.drawNextPieces();
    this.drawHoldPiece();
    this.draw();
  }

  drawHoldPiece() {
    if (!this.holdContext) return;
    const canvas = this.holdCanvas;
    this.holdContext.clearRect(0, 0, canvas.width, canvas.height);

    if (this.isMobile && this.holdBtnMobile && this.holdPreviewMobile) {
      if (this.holdIndex === null) {
        this.holdBtnMobile.style.display = '';
        this.holdPreviewMobile.style.display = 'none';
        return;
      }
      this.holdBtnMobile.style.display = 'none';
      this.holdPreviewMobile.style.display = 'flex';
    }

    if (this.holdIndex === null) return;
    const shape = Tetris.SHAPES[this.holdIndex];
    const color = PIECE_COLORS[this.holdIndex];
    const bw = shape[0].length;
    const bh = shape.length;
    let size = this.isMobile
      ? Math.max(6, Math.min(Math.floor(Math.min(canvas.width / bw, canvas.height / bh)) - 1, 16))
      : 12;
    const offsetX = (canvas.width - shape[0].length * size) / 2;
    const offsetY = (canvas.height - shape.length * size) / 2;
    this.holdContext.fillStyle = color;
    shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.holdContext.fillRect(offsetX + x * size, offsetY + y * size, size - 1, size - 1);
        }
      });
    });
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

  // ゴースト: 現在ピースの着地Yを返す
  getGhostY() {
    if (!this.currentPiece) return 0;
    let gy = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece.x, gy + 1, this.currentPiece.shape)) {
      gy++;
    }
    return gy;
  }

  // ピース移動
  movePiece(dx, dy) {
    if (this.gameOver || this.paused || !this.currentPiece) return false;
    const newX = this.currentPiece.x + dx;
    const newY = this.currentPiece.y + dy;
    
    if (!this.checkCollision(newX, newY, this.currentPiece.shape)) {
      this.currentPiece.x = newX;
      this.currentPiece.y = newY;
      return true;
    }
    return false;
  }

  /** 現在ミノをゴースト位置まで落とし、即ロック（キー Space / スマホ中央下スワイプ） */
  hardDrop() {
    if (this.gameOver || this.paused || !this.currentPiece) return;
    this.currentPiece.y = this.getGhostY();
    const lockResult = this.lockPiece();
    if (!lockResult) {
      this.handleGameOver();
      return;
    }
    this.draw();
    if (!this.tutorialMode) updateBgmFromBoard(this.board);
  }

  // ピース回転（その場で時計回り90度、壁蹴りなし）
  rotatePiece() {
    if (this.gameOver || this.paused || !this.currentPiece) return;

    const shape = this.currentPiece.shape;
    const rotatedShape = [];
    const rows = shape.length;
    const cols = shape[0].length;

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
      this.clearLines();
      this.createNewPiece();
      
      // 新しいピースが配置できない場合もゲームオーバー
      if (this.checkCollision(this.currentPiece.x, this.currentPiece.y, this.currentPiece.shape)) {
        gameOverFlag = true;
      }
    }

    return !gameOverFlag;
  }

  // ★修正: ライン消去処理（デバイス別表示更新）。戻り値: 消した行数
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
      // コンボボーナス（連続で消した回数に応じて加算）
      this.score += 50 * this.level * this.combo;
      this.combo++;
      
      this.linesCleared += linesCleared;

      // マラソン: 消去ライン累計のみでレベル・落下速度を更新（開始レベル + N 行ごと）
      const newLevel = this.startingLevel + Math.floor(this.linesCleared / LINES_PER_LEVEL);
      if (newLevel > this.level) {
        this.level = newLevel;
        const newInterval = getDropIntervalForLevel(this.level);
        if (newInterval !== this.dropInterval) {
          this.dropInterval = newInterval;
          if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.startGameLoop();
          }
        }
        if (!this.tutorialMode) {
          this.showLevelUpToast();
        }
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
      this.updateLinesDisplay();

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
    } else {
      this.combo = 0;
    }
    return linesCleared;
  }

  updateLinesDisplay() {
    const n = String(this.linesCleared);
    const linesEl = document.getElementById('lines');
    const mobileLinesEl = document.getElementById('mobile-lines');
    if (linesEl) linesEl.textContent = n;
    if (mobileLinesEl) mobileLinesEl.textContent = n;
  }

  showLevelUpToast() {
    const toast = document.getElementById('stage-clear');
    const textEl = toast ? toast.querySelector('.stage-clear-text') : null;
    if (toast && textEl) {
      textEl.textContent = 'レベルアップ！';
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

    // ── ボード背景（テーマ別、JS描画） ──────────────────
    const isDark = document.body.classList.contains('theme-dark');
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (isDark) {
      // 深海グラデーション（アイコンと同系統）
      const bg = this.ctx.createLinearGradient(0, 0, W * 0.3, H);
      bg.addColorStop(0,    '#0c2545');
      bg.addColorStop(0.45, '#0e3460');
      bg.addColorStop(1,    '#071628');
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(0, 0, W, H);

      // 水面シマー（上部）
      const surf = this.ctx.createLinearGradient(0, 0, 0, H * 0.22);
      surf.addColorStop(0, 'rgba(100, 200, 255, 0.14)');
      surf.addColorStop(1, 'rgba(100, 200, 255, 0)');
      this.ctx.fillStyle = surf;
      this.ctx.fillRect(0, 0, W, H * 0.22);

      // 波ライン（2本、上部のみ）
      this.ctx.lineWidth = 1;
      [{ y: H * 0.07, amp: 2.5, freq: 0.12, phase: 0,   op: 0.28 },
       { y: H * 0.13, amp: 2.0, freq: 0.09, phase: 1.4, op: 0.18 }].forEach(w => {
        this.ctx.strokeStyle = `rgba(120, 210, 255, ${w.op})`;
        this.ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const y = w.y + Math.sin(x * w.freq + w.phase) * w.amp;
          x === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
      });
    } else {
      // 海面：薄い青みがかったグラデーション（全ピース色と対比が取れる）
      const bg = this.ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#e8f3f8');
      bg.addColorStop(1, '#d4e8f2');
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(0, 0, W, H);

      // 上部の光スポット（水面の反射）
      const spot = this.ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, H * 0.55);
      spot.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      spot.addColorStop(1, 'rgba(255, 255, 255, 0)');
      this.ctx.fillStyle = spot;
      this.ctx.fillRect(0, 0, W, H);
    }

    // モバイルでは細いグリッド
    if (!this.isMobile) {
      this.ctx.strokeStyle = isDark ? 'rgba(30, 80, 130, 0.35)' : 'rgba(180, 155, 115, 0.22)';
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

    // ゴーストブロック（着地位置を半透明で表示）
    if (this.currentPiece && !this.gameOver) {
      const ghostY = this.getGhostY();
      if (ghostY !== this.currentPiece.y) {
        this.ctx.globalAlpha = 0.25;
        this.ctx.fillStyle = PIECE_COLORS[this.currentPiece.shapeIndex];
        this.currentPiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
            if (value) {
              const w = this.gridSize - 2;
              const h = w * BLOCK_HEIGHT_RATIO;
              this.ctx.fillRect(
                (this.currentPiece.x + x) * this.gridSize + 1,
                (ghostY + y) * this.gridSize + 1,
                w, h
              );
            }
          });
        });
        this.ctx.globalAlpha = 1;
      }
    }

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

  // ゲームオーバー処理（盤面のまま即モーダル表示・クラシックテトリス風）
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
    this.showGameOverModal();
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
    if (!this.tutorialMode) resumeBgmAfterPause();
  }

  // ★修正: ゲームリセット（デバイス別表示リセット）
  reset() {
    clearInterval(this.gameLoop);
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    const config = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.normal;
    this.startingLevel = config.startingLevel;
    this.level = this.startingLevel;
    this.dropInterval = this.tutorialMode ? 2200 : getDropIntervalForLevel(this.level);
    this.linesCleared = 0;
    this.combo = 0;
    this.gameOver = false;
    this.paused = false;
    this.holdIndex = null;
    this.canHold = true;
    
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
    this.updateLinesDisplay();
    // ハイスコア表示は保存値のまま更新
    updateHighScoreDisplay(getHighScore());
    this.drawHoldPiece();
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
    this.updateLinesDisplay();
    this.draw();
    if (!this.tutorialMode) playBgmNormal();
  }
}
