// localStorage ハイスコア用キー
const HIGH_SCORE_STORAGE_KEY = 'tetrisHighScore';

// PWA キャッシュ更新用（sw.js の CACHE_VERSION と揃える）
const APP_VERSION = '2.0.5';

// 音量設定（0–100 で保存、0–1 で再生に使用）
const VOLUME_KEYS = { master: 'tetrisMasterVolume', bgm: 'tetrisBgmVolume', se: 'tetrisSeVolume' };
const VOLUME_DEFAULTS = { master: 80, bgm: 80, se: 80 };

function getStoredVolume(key) {
  try {
    const v = parseInt(localStorage.getItem(VOLUME_KEYS[key]), 10);
    if (Number.isNaN(v) || v < 0 || v > 100) return VOLUME_DEFAULTS[key];
    return v;
  } catch {
    return VOLUME_DEFAULTS[key];
  }
}

function setStoredVolume(key, value) {
  const n = Math.max(0, Math.min(100, Math.round(value)));
  try {
    localStorage.setItem(VOLUME_KEYS[key], String(n));
  } catch (_) {}
  return n;
}

// デシベル基準の音量（スライダー 0–100% → dB → 線形ゲイン）
const VOLUME_DB_MIN = -40;   // 0% のときの dB（ほぼ無音）
const VOLUME_DB_MAX = 0;     // 100% のときの dB（フル）
const VOLUME_DB_CURVE = 0.04; // 60% で十分聞こえるよう強め（60%→約-0.8dB/ch、BGM合計約-1.6dB→線形0.83）
// システム音量60%で十分聞こえるようゲインを強め（実質50%基準で補正）
const SYSTEM_VOLUME_COMPENSATION = 2.0;

function percentToDb(percent) {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  return VOLUME_DB_MIN + (VOLUME_DB_MAX - VOLUME_DB_MIN) * Math.pow(p, VOLUME_DB_CURVE);
}

function dbToLinear(dB) {
  if (dB <= -100) return 0;
  return Math.min(1, Math.pow(10, dB / 20));
}

function getVolumeDb(key) {
  return percentToDb(getStoredVolume(key));
}

// ピンチBGMは音源が小さめなので再生時のみ +8dB
const BGM_DANGER_DB = 8;

function getEffectiveBgmVolume() {
  const db = getVolumeDb('master') + getVolumeDb('bgm');
  return dbToLinear(db);
}

function getEffectiveBgmVolumeDanger() {
  const db = getVolumeDb('master') + getVolumeDb('bgm') + BGM_DANGER_DB;
  return dbToLinear(db);
}

let bgmNormalGainNode = null;
let bgmDangerGainNode = null;

function initBgmGainNodes() {
  if (bgmNormalGainNode && bgmDangerGainNode) return;
  const ctx = initSeAudioContext();
  const normalEl = document.getElementById('bgm-normal');
  const dangerEl = document.getElementById('bgm-danger');
  if (!ctx || !normalEl || !dangerEl) return;
  try {
    const normalSource = ctx.createMediaElementSource(normalEl);
    const dangerSource = ctx.createMediaElementSource(dangerEl);
    bgmNormalGainNode = ctx.createGain();
    bgmDangerGainNode = ctx.createGain();
    normalSource.connect(bgmNormalGainNode);
    dangerSource.connect(bgmDangerGainNode);
    bgmNormalGainNode.connect(ctx.destination);
    bgmDangerGainNode.connect(ctx.destination);
  } catch (_) {}
}

function applyBgmVolumeToElements() {
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  const linearNormal = getEffectiveBgmVolume();
  const linearDanger = getEffectiveBgmVolumeDanger();
  const compensatedNormal = Math.min(2, linearNormal * SYSTEM_VOLUME_COMPENSATION);
  const compensatedDanger = Math.min(2, linearDanger * SYSTEM_VOLUME_COMPENSATION);
  initBgmGainNodes();
  if (bgmNormalGainNode && bgmDangerGainNode) {
    const ctx = bgmNormalGainNode.context;
    const t = ctx.currentTime;
    bgmNormalGainNode.gain.setValueAtTime(compensatedNormal, t);
    bgmDangerGainNode.gain.setValueAtTime(compensatedDanger, t);
  } else {
    if (normal) normal.volume = linearNormal;
    if (danger) danger.volume = linearDanger;
  }
}

function getEffectiveSeVolume(isGameOver = false) {
  const db = getVolumeDb('master') + getVolumeDb('se') + (isGameOver ? SE_GAMEOVER_DB : 0);
  return dbToLinear(db);
}

// SE 聞こえやすく: ダッキング ＋ Web Audio バッファ再生（毎回新規 Source で連続再生も安定）
const BGM_DUCK_DB = -26;       // ダッキング時の BGM（約 0.05 に相当）
const BGM_DUCK_LINEAR = Math.min(1, Math.pow(10, BGM_DUCK_DB / 20));
const BGM_DUCK_DURATION_MS = 550;
const SE_GAMEOVER_DB = -6;     // ゲームオーバー音は他 SE より -6dB
const SE_URLS = {
  'se-gameover': 'audio/iwa_gameover010.mp3',
  'se-line-few': 'audio/play.mp3',
  'se-line-many': 'audio/little_cure.mp3'
};
let seAudioContext = null;
let seBuffers = {};
let seBuffersLoadPromise = null;
let bgmDuckTimeoutId = null;

function ensureSeBuffersLoaded() {
  if (seBuffers['se-gameover'] && seBuffers['se-line-few'] && seBuffers['se-line-many']) {
    return Promise.resolve();
  }
  if (!seAudioContext) initSeAudioContext();
  if (!seBuffersLoadPromise) seBuffersLoadPromise = loadSeBuffers();
  return seBuffersLoadPromise;
}

function duckBgm() {
  if (bgmDuckTimeoutId != null) clearTimeout(bgmDuckTimeoutId);
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  const duckLinear = Math.min(2, BGM_DUCK_LINEAR * SYSTEM_VOLUME_COMPENSATION);
  if (bgmNormalGainNode && bgmDangerGainNode) {
    const ctx = bgmNormalGainNode.context;
    const t = ctx.currentTime;
    bgmNormalGainNode.gain.setValueAtTime(duckLinear, t);
    bgmDangerGainNode.gain.setValueAtTime(duckLinear, t);
  } else {
    if (normal) normal.volume = BGM_DUCK_LINEAR;
    if (danger) danger.volume = BGM_DUCK_LINEAR;
  }
  bgmDuckTimeoutId = setTimeout(() => {
    bgmDuckTimeoutId = null;
    applyBgmVolumeToElements();
  }, BGM_DUCK_DURATION_MS);
}

function initSeAudioContext() {
  if (seAudioContext) return seAudioContext;
  try {
    seAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {}
  return seAudioContext;
}

function loadSeBuffers() {
  const ctx = initSeAudioContext();
  if (!ctx) return Promise.resolve();
  const promises = Object.keys(SE_URLS).map(async (id) => {
    try {
      const res = await fetch(SE_URLS[id]);
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      seBuffers[id] = decoded;
    } catch (_) {}
  });
  return Promise.all(promises);
}

function playSeWithBuffer(id) {
  const ctx = seAudioContext;
  const buffer = seBuffers[id];
  if (!ctx || !buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const linear = getEffectiveSeVolume(id === 'se-gameover');
  const compensated = Math.min(2, linear * SYSTEM_VOLUME_COMPENSATION);
  gain.gain.setValueAtTime(compensated, ctx.currentTime);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
}

function fallbackSePlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const linear = getEffectiveSeVolume(id === 'se-gameover');
  el.volume = Math.min(1, linear * SYSTEM_VOLUME_COMPENSATION);
  el.currentTime = 0;
  el.pause();
  el.play().catch(() => {});
}

async function playSe(id) {
  duckBgm();
  const ctx = initSeAudioContext();
  if (!ctx) {
    fallbackSePlay(id);
    return;
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 0));
  }
  if (seBuffers[id]) {
    playSeWithBuffer(id);
  } else {
    fallbackSePlay(id);
  }
}

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
    applyBgmVolumeToElements();
    if (seAudioContext && seAudioContext.state === 'suspended') {
      seAudioContext.resume().catch(() => {});
    }
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
    applyBgmVolumeToElements();
    if (seAudioContext && seAudioContext.state === 'suspended') {
      seAudioContext.resume().catch(() => {});
    }
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
  playSe('se-gameover');
}

function playLineClearSe(linesCleared) {
  const id = linesCleared >= 3 ? 'se-line-many' : 'se-line-few';
  playSe(id);
}

function updateBgmFromBoard(board) {
  const top = getHighestFilledRow(board);
  if (top <= BGM_PINCH_ROW && currentBgm !== 'danger') playBgmDanger();
  else if (top >= BGM_NORMAL_ROW && currentBgm !== 'normal') playBgmNormal();
}

function getDropIntervalForLevel(level) {
  return Math.max(400, 2000 * Math.pow(0.85, level - 1));
}

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
      
      switch(e.key.toLowerCase()) {
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
    const size = this.isMobile ? 10 : 12;
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

  // ピース回転（その場で時計回り90度、壁蹴りなし）
  rotatePiece() {
    if (this.gameOver || this.paused) return;

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
      
      // 10ラインごとにレベルアップトースト表示
      const prevStage = Math.floor(prevLinesCleared / LINES_PER_STAGE) + 1;
      const newStage = Math.floor(this.linesCleared / LINES_PER_STAGE) + 1;
      if (!this.tutorialMode && newStage > prevStage) {
        this.showLevelUpToast();
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
    if (!this.tutorialMode) (currentBgm === 'danger' ? playBgmDanger : playBgmNormal)();
  }

  // ★修正: ゲームリセット（デバイス別表示リセット）
  reset() {
    clearInterval(this.gameLoop);
    this.board = Array(20).fill().map(() => Array(10).fill(0));
    this.score = 0;
    const config = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.normal;
    this.startingLevel = config.startingLevel;
    this.dropInterval = config.dropInterval;
    this.level = this.startingLevel;
    this.linesStacked = 0;
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
  ensureSeBuffersLoaded();
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
async function startGameAsync() {
  await ensureSeBuffersLoaded();
  startGame();
}

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

function holdGame() {
  if (tetris) tetris.holdPiece();
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

// ========== 設定モーダル（表示・音量） ==========
function getCurrentTheme() {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

function updateSettingsThemeUI() {
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

function applyThemeFromSettings(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
  applyTheme(theme);
  updateSettingsThemeUI();
}

function setupThemeButtonsInSettings() {
  const lightBtn = document.getElementById('theme-light-btn');
  const darkBtn = document.getElementById('theme-dark-btn');
  if (lightBtn) lightBtn.addEventListener('click', () => applyThemeFromSettings('light'));
  if (darkBtn) darkBtn.addEventListener('click', () => applyThemeFromSettings('dark'));
}

function openSettingsModal() {
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

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  applyBgmVolumeToElements();
}

function setupVolumeSliders() {
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

// 初期化処理
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
