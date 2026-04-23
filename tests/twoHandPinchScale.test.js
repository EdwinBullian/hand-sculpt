import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoHandPinchScale } from '../js/gestures/twoHandPinchScale.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

function pinchedHand(cx, cy) {
  return makeLandmarks({
    4: [cx + 0.005, cy, 0],
    8: [cx - 0.005, cy, 0],
  });
}

function resultsTwoHands(lm0, lm1) {
  return {
    landmarks: [lm0, lm1],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
}

test('inactive when zero or one hand visible', () => {
  const g = new TwoHandPinchScale();
  assert.equal(g.detect({ landmarks: [], handedness: [] }, { x:1, y:1, z:1 }).active, false);
  const one = { landmarks: [pinchedHand(0.3, 0.5)], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
  assert.equal(g.detect(one, { x:1, y:1, z:1 }).active, false);
});

test('inactive when either hand is not pinched', () => {
  const g = new TwoHandPinchScale();
  const lm0 = pinchedHand(0.3, 0.5);
  const lm1 = makeLandmarks({ 4: [0.7, 0.5, 0], 8: [0.8, 0.5, 0] });
  assert.equal(g.detect(resultsTwoHands(lm0, lm1), { x:1, y:1, z:1 }).active, false);
});

test('active when both hands pinched; captures baseline, returns baseline scale on first frame', () => {
  const g = new TwoHandPinchScale();
  const lm0 = pinchedHand(0.3, 0.5);
  const lm1 = pinchedHand(0.7, 0.5);
  const r = g.detect(resultsTwoHands(lm0, lm1), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.ok(Math.abs(r.scale.x - 1) < 1e-9);
  assert.ok(Math.abs(r.scale.y - 1) < 1e-9);
  assert.ok(Math.abs(r.scale.z - 1) < 1e-9);
});

test('scale grows as hands move apart', () => {
  const g = new TwoHandPinchScale();
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  const r = g.detect(resultsTwoHands(pinchedHand(0.1, 0.5), pinchedHand(0.9, 0.5)), { x: 1, y: 1, z: 1 });
  assert.ok(Math.abs(r.scale.x - 2) < 1e-6);
  assert.ok(Math.abs(r.scale.y - 2) < 1e-6);
  assert.ok(Math.abs(r.scale.z - 2) < 1e-6);
});

test('reset() clears baseline', () => {
  const g = new TwoHandPinchScale();
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  g.reset();
  const r = g.detect(resultsTwoHands(pinchedHand(0.1, 0.5), pinchedHand(0.9, 0.5)), { x: 2, y: 2, z: 2 });
  assert.equal(r.active, true);
  assert.ok(Math.abs(r.scale.x - 2) < 1e-9);
  assert.ok(Math.abs(r.scale.y - 2) < 1e-9);
});

test('auto-resets when hands release pinch', () => {
  const g = new TwoHandPinchScale();
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  const lm0 = makeLandmarks({ 4: [0.3, 0.5, 0], 8: [0.35, 0.5, 0] });
  const lm1 = makeLandmarks({ 4: [0.7, 0.5, 0], 8: [0.75, 0.5, 0] });
  assert.equal(g.detect(resultsTwoHands(lm0, lm1), { x: 5, y: 5, z: 5 }).active, false);
  const r = g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 5, y: 5, z: 5 });
  assert.equal(r.active, true);
  assert.ok(Math.abs(r.scale.x - 5) < 1e-9);
});
