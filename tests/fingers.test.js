import test from 'node:test';
import assert from 'node:assert/strict';
import { countExtendedFingers } from '../js/fingers.js';

// Build a 21-length landmark array, defaulting every landmark to (0.5, 0.9, 0).
// Override specific indices to simulate a hand pose.
function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9, z: 0 }));
  for (const [i, [x, y]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: 0 };
  }
  return base;
}

test('countExtendedFingers handles falsy / short input', () => {
  assert.equal(countExtendedFingers(null), 0);
  assert.equal(countExtendedFingers(undefined), 0);
  assert.equal(countExtendedFingers([]), 0);
  assert.equal(countExtendedFingers(new Array(10).fill({ x: 0, y: 0, z: 0 })), 0);
});

test('open hand — 5 fingers extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],                  // wrist
    3:  [0.35, 0.7],  4:  [0.3, 0.6],   // thumb IP, tip
    6:  [0.42, 0.4],  8:  [0.4, 0.1],   // index PIP, tip
    10: [0.5, 0.4],   12: [0.5, 0.05],  // middle PIP, tip
    14: [0.58, 0.4],  16: [0.6, 0.1],   // ring PIP, tip
    18: [0.65, 0.5],  20: [0.7, 0.3],   // pinky PIP, tip
  });
  assert.equal(countExtendedFingers(lm), 5);
});

test('fist — 0 fingers extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.52, 0.55], 8:  [0.5, 0.65],
    10: [0.52, 0.5],  12: [0.52, 0.63],
    14: [0.56, 0.52], 16: [0.55, 0.65],
    18: [0.6, 0.58],  20: [0.58, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 0);
});

test('peace sign — index + middle extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.42, 0.4],  8:  [0.4, 0.1],
    10: [0.52, 0.4],  12: [0.55, 0.1],
    14: [0.59, 0.58], 16: [0.58, 0.7],
    18: [0.66, 0.6],  20: [0.65, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 2);
});

test('index-only — 1 finger extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.42, 0.4],  8:  [0.4, 0.1],
    10: [0.52, 0.5],  12: [0.55, 0.63],
    14: [0.59, 0.58], 16: [0.58, 0.7],
    18: [0.66, 0.6],  20: [0.65, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 1);
});
