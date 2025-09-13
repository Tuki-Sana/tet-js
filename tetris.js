class Tetris {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridSize = 30;
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    this.level = 1; // ★追加：レベル管理
    this.currentPiece = null;
    this.gameLoop = null;
    this.gameOver = false;
    this.paused = false; // ★追加：一時停止フラグ
    this.dropInterval = 1000;
    this.linesStacked = 0;
    this.linesCleared = 0; // ★追加：クリア済みライン数
  }

  static SHAPES = [
    [[1,1,1,1]], [[1,1,1],[0,1,0]], [[1,1,1],[1,0,0]],
    [[1,1,1],[0,0,1]], [[1,1],[1,1]], [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];

  createNewPiece() {
    const shape = Tetris.SHAPES[Math.floor(Math.random() * Tetris.SHAPES.length)];
    this.currentPiece = {
      shape,
      x: Math.floor(this.board[0].length/2) - Math.floor(shape[0].length/2),
      y: 0
    };
  }

  checkCollision(newX, newY, shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const boardX = newX + x;
          const boardY = newY + y;
          if (boardX < 0 || boardX >= this.board[0].length || 
              boardY >= this.board.length) return true;
          if (boardY >= 0 && this.board[boardY][boardX]) return true;
        }
      }
    }
    return false;
  }

  movePiece(dx, dy) {
    if (this.gameOver || this.paused) return false; // ★修正：一時停止時も移動不可
    const newX = this.currentPiece.x + dx;
    const newY = this.currentPiece.y + dy;
    
    if (!this.checkCollision(newX, newY, this.currentPiece.shape)) {
      this.currentPiece.x = newX;
      this.currentPiece.y = newY;
      return true;
    }
    return false;
  }

  rotatePiece() {
    if (this.gameOver || this.paused) return; // ★修正：一時停止時も回転不可
    const shape = this.currentPiece.shape;
    const newShape = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
    if (!this.checkCollision(this.currentPiece.x, this.currentPiece.y, newShape)) {
      this.currentPiece.shape = newShape;
    }
  }

  lockPiece() {
    const {x, y, shape} = this.currentPiece;
    let gameOver = false;
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const boardY = y + row;
          if (boardY < 0) gameOver = true;
          if (boardY >= 0) this.board[boardY][x + col] = 1;
        }
      }
    }

    this.linesStacked++;
    this.speedUpIfNeeded();
    this.clearLines();
    this.createNewPiece();
    return !gameOver;
  }

  speedUpIfNeeded() {
    const newInterval = Math.max(200, 1000 * Math.pow(0.95, this.linesStacked));
    if (newInterval < this.dropInterval) {
      this.dropInterval = newInterval;
      if (this.gameLoop) {
        clearInterval(this.gameLoop);
        this.startGameLoop();
      }
    }
  }

  // ★修正：正確な得点計算システム
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
      
      // 表示更新
      document.getElementById('score').textContent = this.score;
      document.getElementById('level').textContent = this.level;
      
      // サイドパネルの現在レベル表示を更新
      document.getElementById('current-level-1').textContent = this.level;
      document.getElementById('current-level-2').textContent = this.level;
      document.getElementById('current-level-3').textContent = this.level;
      document.getElementById('current-level-4').textContent = this.level;
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.board.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.ctx.fillStyle = '#000';
          this.ctx.fillRect(x * this.gridSize, y * this.gridSize, 
          this.gridSize - 1, this.gridSize - 1);
        }
      });
    });

    if (this.currentPiece && !this.gameOver) {
      this.ctx.fillStyle = '#f00';
      this.currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            this.ctx.fillRect(
              (this.currentPiece.x + x) * this.gridSize,
              (this.currentPiece.y + y) * this.gridSize,
              this.gridSize - 1, this.gridSize - 1
            );
          }
        });
      });
    }
  }

  startGameLoop() {
    this.gameLoop = setInterval(() => {
      if (this.paused) return; // ★追加：一時停止時は処理しない
      if (!this.movePiece(0, 1)) {
        if (!this.lockPiece()) {
          this.handleGameOver(); // ★修正：ゲームオーバー処理
        }
      }
      this.draw();
    }, this.dropInterval);
  }

  // ★修正：ゲームオーバー処理
  handleGameOver() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('final-score').textContent = this.score;
    document.getElementById('final-level').textContent = this.level;
  }

  // ★追加：一時停止処理
  pause() {
    this.paused = true;
    document.getElementById('pause-screen').style.display = 'block';
  }

  // ★追加：再開処理
  resume() {
    this.paused = false;
    document.getElementById('pause-screen').style.display = 'none';
  }

  // ★追加：リセット処理
  reset() {
    clearInterval(this.gameLoop);
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    this.level = 1;
    this.linesStacked = 0;
    this.linesCleared = 0;
    this.dropInterval = 1000;
    this.gameOver = false;
    this.paused = false;
    document.getElementById('score').textContent = '0';
    document.getElementById('level').textContent = '1';
  }

  start() {
    this.createNewPiece();
    this.startGameLoop();
  }
}

// ★追加：グローバル変数
let tetris = null;

// ★追加：画面管理関数
window.showScreen = function(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

window.startGame = function() {
  showScreen('game-screen');
  const canvas = document.getElementById('game');
  tetris = new Tetris(canvas);
  tetris.start();
}

window.pauseGame = function() {
  if (tetris && !tetris.gameOver) {
    tetris.pause();
  }
}

window.resumeGame = function() {
  if (tetris) {
    tetris.resume();
  }
}

window.restartGame = function() {
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  if (tetris) {
    tetris.reset();
    tetris.start();
  }
}

window.quitToMenu = function() {
  if (tetris) {
    clearInterval(tetris.gameLoop);
  }
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  showScreen('start-screen');
}

window.backToMenu = function() {
  quitToMenu();
}

// ★修正：WASD操作に変更
document.addEventListener('keydown', (e) => {
  if (!tetris || tetris.gameOver) return;
  
  // ★追加：一時停止キー
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (tetris.paused) {
      tetris.resume();
    } else {
      tetris.pause();
    }
    return;
  }
  
  if (tetris.paused) return;
  
  switch(e.key.toLowerCase()) {
    case 'a': // 左移動
      tetris.movePiece(-1, 0);
      break;
    case 'd': // 右移動
      tetris.movePiece(1, 0);
      break;
    case 's': // 下移動（ソフトドロップ）
      tetris.movePiece(0, 1);
      break;
    case 'w': // 回転
      tetris.rotatePiece();
      break;
  }
  tetris.draw();
});
