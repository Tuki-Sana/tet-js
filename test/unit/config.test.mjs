import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  DIFFICULTY_CONFIG,
  LINES_PER_LEVEL,
  getDropIntervalForLevel,
  PIECE_COLORS
} from '../../js/config.js';

test('APP_VERSION は semver 風の文字列', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('難易度キーが揃っている', () => {
  assert.deepEqual(Object.keys(DIFFICULTY_CONFIG).sort(), ['easy', 'hard', 'normal']);
  assert.equal(DIFFICULTY_CONFIG.easy.startingLevel, 1);
  assert.equal(DIFFICULTY_CONFIG.normal.startingLevel, 2);
  assert.equal(DIFFICULTY_CONFIG.hard.startingLevel, 4);
});

test('LINES_PER_LEVEL は正の整数', () => {
  assert.equal(typeof LINES_PER_LEVEL, 'number');
  assert.ok(LINES_PER_LEVEL > 0);
});

test('getDropIntervalForLevel はレベルが上がるほど短く、下限を守る', () => {
  const l1 = getDropIntervalForLevel(1);
  const l2 = getDropIntervalForLevel(2);
  assert.ok(l2 < l1);
  assert.equal(getDropIntervalForLevel(999), 400);
  assert.ok(getDropIntervalForLevel(1) >= 400);
});

test('PIECE_COLORS は 7 色', () => {
  assert.equal(PIECE_COLORS.length, 7);
  for (const c of PIECE_COLORS) {
    assert.match(c, /^#[0-9a-f]{6}$/i);
  }
});
