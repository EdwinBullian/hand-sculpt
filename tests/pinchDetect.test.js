import test from 'node:test';
import assert from 'node:assert/strict';
import { isPinched, pinchPoint } from '../js/gestures/pinchDetect.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

test('isPinched: thumb tip and index tip close together → true', () => {
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.51, 0.51, 0] });
  assert.equal(isPinched(lm), true);
});

test('isPinched: thumb tip and index tip far apart → false', () => {
  const lm = makeLandmarks({ 4: [0.3, 0.3, 0], 8: [0.7, 0.7, 0] });
  assert.equal(isPinched(lm), false);
});

test('isPinched: exactly at default threshold → false (strict)', () => {
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.55, 0.5, 0] });
  assert.equal(isPinched(lm), false);
});

test('isPinched: custom threshold', () => {
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.6, 0.5, 0] });
  assert.equal(isPinched(lm, 0.05), false);
  assert.equal(isPinched(lm, 0.2), true);
});

test('isPinched: null / short input → false', () => {
  assert.equal(isPinched(null), false);
  assert.equal(isPinched([]), false);
  assert.equal(isPinched(new Array(10).fill({ x: 0, y: 0, z: 0 })), false);
});

test('pinchPoint: midpoint of thumb tip and index tip', () => {
  const lm = makeLandmarks({ 4: [0.4, 0.6, -0.02], 8: [0.6, 0.4, 0.02] });
  const p = pinchPoint(lm);
  assert.equal(p.x, 0.5);
  assert.equal(p.y, 0.5);
  assert.equal(p.z, 0);
});
