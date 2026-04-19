/** メインゲームの Tetris インスタンス（モジュール間の循環参照回避用） */
let tetris = null;

export function getTetris() {
  return tetris;
}

export function setTetris(instance) {
  tetris = instance;
}
