// 色パレット（テトラミノ別）
const PIECE_COLORS = [
  '#00f5ff', // I型 - シアン
  '#8b00ff', // T型 - パープル  
  '#ff8c00', // L型 - オレンジ
  '#0000ff', // J型 - ブルー
  '#ffff00', // O型 - イエロー
  '#00ff00', // S型 - グリーン
  '#ff0000'  // Z型 - レッド
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

// テトリスメインクラス
class Tetris {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // ★追加: デバイス判定
    this.isMobile = isMobileDevice();
    
    // ★追加: モバイル版キャンバスサイズ調整
    if (this.isMobile && canvas.id === 'mobile-game') {
      this.adjustMobileCanvasSize();
    }
    
    // ★修正: グリッドサイズをキャンバスに応じて調整
    this.gridSize = this.isMobile ? 
      Math.min(this.canvas.width / 10, this.canvas.height / 20) : 30;
    
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    this.level = 1;
    this.currentPiece = null;
    this.gameLoop = null;
    this.gameOver = false;
    this.paused = false;
    this.dropInterval = 2000; // 初期速度をゆっくり（2秒）
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
    this.setupControls();
  }

  // ★追加: モバイルキャンバスサイズ調整メソッド
  adjustMobileCanvasSize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // ★修正: より適切なサイズ計算
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

  // ★修正: スマホ専用タップ操作
  setupMobileControls() {
    // ★修正: デバイス別のタップゾーンを設定
    const tapZoneSelector = this.isMobile ? '#mobile-tap-zones .tap-zone' : '#tap-zones .tap-zone';
    const tapZones = document.querySelectorAll(tapZoneSelector);
    let downInterval = null;

    console.log(`Found ${tapZones.length} tap zones for mobile controls`);

    tapZones.forEach(zone => {
      const action = zone.dataset.action;

      // タッチ開始
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        if (this.gameOver || this.paused) return;

        console.log(`Touch action: ${action}`);

        switch(action) {
          case 'rotate':
            this.rotatePiece();
            this.draw();
            break;
          case 'left':
            this.movePiece(-1, 0);
            this.draw();
            break;
          case 'right':
            this.movePiece(1, 0);
            this.draw();
            break;
          case 'down':
            // 即座に1回下移動
            this.movePiece(0, 1);
            this.draw();
            // 連続下降開始
            downInterval = setInterval(() => {
              if (!this.gameOver && !this.paused) {
                this.movePiece(0, 1);
                this.draw();
              }
            }, 100);
            break;
        }
      }, { passive: false });

      // タッチ終了
      zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        
        // 下降の連続動作を停止
        if (action === 'down' && downInterval) {
          clearInterval(downInterval);
          downInterval = null;
        }
      }, { passive: false });

      // タッチキャンセル
      zone.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        
        if (action === 'down' && downInterval) {
          clearInterval(downInterval);
          downInterval = null;
        }
      }, { passive: false });

      // マウスイベント（デバッグ用）
      zone.addEventListener('mousedown', (e) => {
        e.preventDefault();
        
        if (this.gameOver || this.paused) return;

        switch(action) {
          case 'rotate':
            this.rotatePiece();
            break;
          case 'left':
            this.movePiece(-1, 0);
            break;
          case 'right':
            this.movePiece(1, 0);
            break;
          case 'down':
            this.movePiece(0, 1);
            break;
        }
        this.draw();
      });

      zone.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (action === 'down' && downInterval) {
          clearInterval(downInterval);
          downInterval = null;
        }
      });
    });
  }

  // PC専用キーボード操作
  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      if (this.gameOver) return;
      
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (this.paused) {
          this.resume();
        } else {
          this.pause();
        }
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
      // 正確なテトリススコア計算
      let lineScore = 0;
      switch(linesCleared) {
        case 1: lineScore = 100 * this.level; break;  // シングル
        case 2: lineScore = 300 * this.level; break;  // ダブル
        case 3: lineScore = 500 * this.level; break;  // トリプル
        case 4: lineScore = 800 * this.level; break;  // テトリス
      }
      
      this.score += lineScore;
      this.linesCleared += linesCleared;
      
      // レベルアップ処理（10ライン消去ごと）
      const newLevel = Math.floor(this.linesCleared / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
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
          this.ctx.fillStyle = PIECE_COLORS[value - 1] || '#4a90e2';
          this.ctx.fillRect(x * this.gridSize + 1, y * this.gridSize + 1, 
          this.gridSize - 2, this.gridSize - 2);
        }
      });
    });

    // 現在のピース描画（色付き）
    if (this.currentPiece && !this.gameOver) {
      this.ctx.fillStyle = PIECE_COLORS[this.currentPiece.shapeIndex];
      this.currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            this.ctx.fillRect(
              (this.currentPiece.x + x) * this.gridSize + 1,
              (this.currentPiece.y + y) * this.gridSize + 1,
              this.gridSize - 2, this.gridSize - 2
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
    }, this.dropInterval);
  }

  // ★修正: ゲームオーバー処理（モーダル表示改善）
  handleGameOver() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
    
    // 少し遅延を入れて確実にモーダルを表示
    setTimeout(() => {
      const modal = document.getElementById('game-over');
      modal.classList.add('show');
      document.getElementById('final-score').textContent = this.score;
      document.getElementById('final-level').textContent = this.level;
    }, 100);
  }

  // ★修正: ゲーム一時停止（モーダル表示改善）
  pause() {
    this.paused = true;
    const modal = document.getElementById('pause-menu');
    modal.classList.add('show');
  }

  // ★修正: ゲーム再開（モーダル非表示改善）
  resume() {
    this.paused = false;
    const modal = document.getElementById('pause-menu');
    modal.classList.remove('show');
  }

  // ★修正: ゲームリセット（デバイス別表示リセット）
  reset() {
    clearInterval(this.gameLoop);
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    this.level = 1;
    this.linesStacked = 0;
    this.linesCleared = 0;
    this.dropInterval = 2000; // リセット時も遅い初期速度
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
      if (mobileLevel) mobileLevel.textContent = '1';
    } else {
      const scoreEl = document.getElementById('score');
      const levelEl = document.getElementById('level');
      if (scoreEl) scoreEl.textContent = '0';
      if (levelEl) levelEl.textContent = '1';
    }
  }

  // ★追加: 画面回転時のリサイズ対応
  handleResize() {
    if (this.isMobile && this.canvas.id === 'mobile-game') {
      this.adjustMobileCanvasSize();
      this.draw(); // 再描画
    }
  }

  // ゲーム開始
  start() {
    this.createNewPiece();
    this.startGameLoop();
    this.draw();
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

// ★修正: ゲーム制御関数（デバイス別キャンバス選択改良）
function startGame() {
  showScreen('game-screen');

  if (isMobileDevice()) {
    document.body.classList.add('game-active');
  }

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
  
  if (canvas) {
    tetris = new Tetris(canvas);
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
  
  if (tetris) {
    tetris.reset();
    tetris.start();
  }
}

// ★修正: メニューに戻る処理改善
function quitToMenu() {
  if (tetris) {
    clearInterval(tetris.gameLoop);
    tetris = null;
  }

  // ★追加: スマホでメニュー戻り時にbody固定を解除
  document.body.classList.remove('game-active');

  // モーダルを閉じる
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('show');
  });
  showScreen('start-screen');
}

function backToMenu() {
  quitToMenu();
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  setupMobileUI();
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
