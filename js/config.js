/** PWA キャッシュ更新用（sw.js の CACHE_VERSION と揃える） */
export const APP_VERSION = '2.0.15';

export const HIGH_SCORE_STORAGE_KEY = 'tetrisHighScore';

/** 難易度は開始レベルのみ（落下間隔は getDropIntervalForLevel に統一） */
export const DIFFICULTY_CONFIG = {
  easy: { startingLevel: 1 },
  normal: { startingLevel: 2 },
  hard: { startingLevel: 4 }
};

/** マラソン: 消去ライン累計がこの行数ごとにレベルアップ＋速度更新 */
export const LINES_PER_LEVEL = 10;

export const BLOCK_HEIGHT_RATIO = 1.04;

export const BGM_PINCH_ROW = 7;
export const BGM_NORMAL_ROW = 10;

/** タップゾーン左右幅（css .tap-zones --tap-side-w のモバイル値と一致） */
export const MOBILE_TAP_SIDE_FRAC = 0.38;

export const DOWN_REPEAT_DELAY_MS = 150;
export const DOWN_REPEAT_INTERVAL_MS = 80;

export const PIECE_COLORS = [
  '#7bcce5',
  '#b8a8f8',
  '#5dc0aa',
  '#4aaad8',
  '#f7c47a',
  '#7ad8bc',
  '#f59abe'
];

export function getDropIntervalForLevel(level) {
  return Math.max(400, 2000 * Math.pow(0.85, level - 1));
}
