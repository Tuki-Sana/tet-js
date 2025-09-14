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
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.innerWidth <= 768 && window.innerHeight <= 1024);
}

// モバイルUI設定
function setupMobileUI() {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    document.body.classList.add('mobile-device');
    
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
      gameScreen.classList.add('mobile-game-screen');
    }
    
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) {
      mobileControls.classList.add('show');
    }
    
    let viewport = document.querySelector("meta[name=viewport]");
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  }
}

// テトリスメインクラス
class Tetris {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridSize = 30;
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
    
    // NEXTピース管理
    this.nextPieces = [];
    this.nextCanvases = [
      document.getElementById('next-piece-1'),
      document.getElementById('next-piece-2'),
      document.getElementById('next-piece-3')
    ];
    this.nextContexts = this.nextCanvases.map(canvas => canvas.getContext('2d'));
    
    this.initializeNextPieces();
    this.setupControls(); // 統合した操作設定
    this.updateBonusDisplay(); // ボーナス表示更新
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
    const isMobile = isMobileDevice();
    
    if (isMobile) {
      this.setupMobileControls();
    } else {
      this.setupKeyboardControls();
    }
    
    // スクロール防止（両デバイス共通）
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  // スマホ専用タップ操作
  setupMobileControls() {
    // ポーズボタンの設定
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.paused) {
          this.resume();
          pauseBtn.textContent = '⏸️ 一時停止';
        } else {
          this.pause();
          pauseBtn.textContent = '▶️ 再開';
        }
      }, { passive: false });

      pauseBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.paused) {
          this.resume();
          pauseBtn.textContent = '⏸️ 一時停止';
        } else {
          this.pause();
          pauseBtn.textContent = '▶️ 再開';
        }
      });
    }

    // タップゾーンの設定
    const tapZones = document.querySelectorAll('.tap-zone');
    let downInterval = null;

    tapZones.forEach(zone => {
      const action = zone.dataset.action;

      // タッチ開始
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        if (this.gameOver || this.paused) return;

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
            }, 100); // 100ms間隔で高速落下
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

    // 初期ヒント表示（3秒後に非表示）
    const tapZonesContainer = document.getElementById('tap-zones');
    if (tapZonesContainer) {
      tapZonesContainer.classList.add('show-hints');
      setTimeout(() => {
        tapZonesContainer.classList.remove('show-hints');
      }, 3000);
    }
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

  // NEXTピース描画
  drawNextPieces() {
    this.nextContexts.forEach((ctx, index) => {
      const canvas = this.nextCanvases[index];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (index < this.nextPieces.length) {
        const shapeIndex = this.nextPieces[index];
        const shape = Tetris.SHAPES[shapeIndex];
        const color = PIECE_COLORS[shapeIndex];
        
        // モバイル対応サイズ調整
        const isMobile = isMobileDevice();
        const size = isMobile ? (index === 0 ? 8 : 6) : (index === 0 ? 16 : 12);
        
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

  // ボーナス表示更新
  updateBonusDisplay() {
    const elements = [
      'current-level-1',
      'current-level-2', 
      'current-level-3',
      'current-level-4'
    ];

    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = this.level;
      }
    });
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

  // ライン消去処理
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
        this.updateBonusDisplay(); // ボーナス表示更新
      }
      
      // 表示更新
      document.getElementById('score').textContent = this.score;
      document.getElementById('level').textContent = this.level;
    }
  }

  // ゲーム描画処理
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // モバイルでは細いグリッド
    const isMobile = isMobileDevice();
    if (!isMobile) {
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

  // ゲームオーバー処理
  handleGameOver() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
    
    // 少し遅延を入れて確実にモーダルを表示
    setTimeout(() => {
      document.getElementById('game-over').style.display = 'block';
      document.getElementById('final-score').textContent = this.score;
      document.getElementById('final-level').textContent = this.level;
    }, 100);
  }

  // ゲーム一時停止
  pause() {
    this.paused = true;
    document.getElementById('pause-screen').style.display = 'block';
  }

  // ゲーム再開
  resume() {
    this.paused = false;
    document.getElementById('pause-screen').style.display = 'none';
  }

  // ゲームリセット
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
    this.updateBonusDisplay();
    
    // 表示リセット
    document.getElementById('score').textContent = '0';
    document.getElementById('level').textContent = '1';
    
    // ポーズボタンリセット
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.textContent = '⏸️ 一時停止';
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

// ゲーム制御関数
function startGame() {
  showScreen('game-screen');
  const canvas = document.getElementById('game');
  tetris = new Tetris(canvas);
  tetris.start();
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

function restartGame() {
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  if (tetris) {
    tetris.reset();
    tetris.start();
  }
}

function quitToMenu() {
  if (tetris) {
    clearInterval(tetris.gameLoop);
  }
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  showScreen('start-screen');
}

function backToMenu() {
  quitToMenu();
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  setupMobileUI();
});

// 画面回転対応
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    setupMobileUI();
    if (tetris) {
      tetris.drawNextPieces();
      tetris.draw();
    }
  }, 100);
});
