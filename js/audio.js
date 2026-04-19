import { BGM_NORMAL_ROW, BGM_PINCH_ROW } from './config.js';

const VOLUME_KEYS = { master: 'tetrisMasterVolume', bgm: 'tetrisBgmVolume', se: 'tetrisSeVolume' };
const VOLUME_DEFAULTS = { master: 80, bgm: 80, se: 80 };

export function getStoredVolume(key) {
  try {
    const v = parseInt(localStorage.getItem(VOLUME_KEYS[key]), 10);
    if (Number.isNaN(v) || v < 0 || v > 100) return VOLUME_DEFAULTS[key];
    return v;
  } catch {
    return VOLUME_DEFAULTS[key];
  }
}

export function setStoredVolume(key, value) {
  const n = Math.max(0, Math.min(100, Math.round(value)));
  try {
    localStorage.setItem(VOLUME_KEYS[key], String(n));
  } catch (_) {}
  return n;
}

const VOLUME_DB_MIN = -40;
const VOLUME_DB_MAX = 0;
const VOLUME_DB_CURVE = 0.04;
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

export function applyBgmVolumeToElements() {
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

const BGM_DUCK_LINEAR = Math.min(1, Math.pow(10, -26 / 20));
const BGM_DUCK_DURATION_MS = 550;
const SE_GAMEOVER_DB = -6;
const SE_URLS = {
  'se-gameover': 'audio/iwa_gameover010.mp3',
  'se-line-few': 'audio/play.mp3',
  'se-line-many': 'audio/little_cure.mp3'
};
let seAudioContext = null;
let seBuffers = {};
let seBuffersLoadPromise = null;
let bgmDuckTimeoutId = null;

function getEffectiveSeVolume(isGameOver = false) {
  const db = getVolumeDb('master') + getVolumeDb('se') + (isGameOver ? SE_GAMEOVER_DB : 0);
  return dbToLinear(db);
}

export function ensureSeBuffersLoaded() {
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

export function initSeAudioContext() {
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

export async function playSe(id) {
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

let currentBgm = 'normal';

function getHighestFilledRow(board) {
  for (let y = 0; y < 20; y++) {
    if (board[y].some((cell) => cell !== 0)) return y;
  }
  return 20;
}

export function playBgmNormal() {
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

export function playBgmDanger() {
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

export function pauseAllBgm() {
  const normal = document.getElementById('bgm-normal');
  const danger = document.getElementById('bgm-danger');
  if (normal) normal.pause();
  if (danger) danger.pause();
}

export function playGameOverSe() {
  playSe('se-gameover');
}

export function playLineClearSe(linesCleared) {
  const id = linesCleared >= 3 ? 'se-line-many' : 'se-line-few';
  playSe(id);
}

export function updateBgmFromBoard(board) {
  const top = getHighestFilledRow(board);
  if (top <= BGM_PINCH_ROW && currentBgm !== 'danger') playBgmDanger();
  else if (top >= BGM_NORMAL_ROW && currentBgm !== 'normal') playBgmNormal();
}

/** ポーズ解除後: 直前の BGM トラックを再開 */
export function resumeBgmAfterPause() {
  if (currentBgm === 'danger') playBgmDanger();
  else playBgmNormal();
}
