import test from 'node:test';
import assert from 'node:assert/strict';
import { BothBacksReset } from '../js/gestures/bothBacksReset.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

const RIGHT_HAND_PALM_OUT = makeLandmarks({
  0:  [0.3, 0.9, 0],
  5:  [0.35, 0.65, -0.01],
  9:  [0.3, 0.6, -0.015],
  13: [0.28, 0.63, -0.015],
  17: [0.25, 0.7, -0.01],
});
const RIGHT_HAND_PALM_IN = makeLandmarks({
  0:  [0.3, 0.9, 0],
  5:  [0.25, 0.65, 0.01],
  9:  [0.3, 0.6, 0.015],
  13: [0.32, 0.63, 0.015],
  17: [0.35, 0.7, 0.01],
});
const LEFT_HAND_PALM_OUT = makeLandmarks({
  0:  [0.7, 0.9, 0],
  5:  [0.65, 0.65, -0.01],
  9:  [0.7, 0.6, -0.015],
  13: [0.72, 0.63, -0.015],
  17: [0.75, 0.7, -0.01],
});
const LEFT_HAND_PALM_IN = makeLandmarks({
  0:  [0.7, 0.9, 0],
  5:  [0.75, 0.65, 0.01],
  9:  [0.7, 0.6, 0.015],
  13: [0.68, 0.63, 0.015],
  17: [0.65, 0.7, 0.01],
});

function results(...hands) {
  return {
    landmarks: hands.map(h => h.lm),
    handedness: hands.map(h => [{ categoryName: h.side, score: 0.9 }]),
  };
}

test('active when both hands have backs facing camera', () => {
  const g = new BothBacksReset();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_IN, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  ));
  assert.equal(r.active, true);
});

test('inactive when only one hand visible', () => {
  const g = new BothBacksReset();
  assert.equal(g.detect(results({ lm: RIGHT_HAND_PALM_IN, side: 'Right' })).active, false);
});

test('inactive when no hands visible', () => {
  const g = new BothBacksReset();
  assert.equal(g.detect({ landmarks: [], handedness: [] }).active, false);
});

test('inactive when either palm faces camera', () => {
  const g = new BothBacksReset();
  assert.equal(g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  )).active, false);
  assert.equal(g.detect(results(
    { lm: RIGHT_HAND_PALM_IN, side: 'Right' },
    { lm: LEFT_HAND_PALM_OUT, side: 'Left' },
  )).active, false);
});

test('inactive when both palms face camera', () => {
  const g = new BothBacksReset();
  assert.equal(g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_OUT, side: 'Left' },
  )).active, false);
});

test('inactive when handedness missing', () => {
  const g = new BothBacksReset();
  const r = g.detect({
    landmarks: [RIGHT_HAND_PALM_IN, LEFT_HAND_PALM_IN],
    handedness: [[], []],
  });
  assert.equal(r.active, false);
});
