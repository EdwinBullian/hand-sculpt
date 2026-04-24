import test from 'node:test';
import assert from 'node:assert/strict';
import { VertexSculpt } from '../js/gestures/vertexSculpt.js';

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

function openHand(cx, cy) {
  return makeLandmarks({
    4: [cx, cy, 0],
    8: [cx + 0.3, cy + 0.3, 0],
  });
}

function results(...lms) {
  return {
    landmarks: lms,
    handedness: lms.map(() => [{ categoryName: 'Right', score: 0.9 }]),
  };
}

test('inactive when no hands', () => {
  const g = new VertexSculpt();
  assert.equal(g.detect({ landmarks: [], handedness: [] }).active, false);
});

test('inactive when the single hand is not pinched', () => {
  const g = new VertexSculpt();
  assert.equal(g.detect(results(openHand(0.5, 0.5))).active, false);
});

test('active with exactly one pinched hand; worldPoint provided', () => {
  const g = new VertexSculpt();
  const r = g.detect(results(pinchedHand(0.5, 0.5)));
  assert.equal(r.active, true);
  assert.ok(r.worldPoint);
  // Pinch at image center → world origin.
  assert.ok(Math.abs(r.worldPoint.x) < 1e-6);
  assert.ok(Math.abs(r.worldPoint.y) < 1e-6);
});

test('inactive when both hands pinched (belongs to PinchScale, not sculpt)', () => {
  const g = new VertexSculpt();
  const r = g.detect(results(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)));
  assert.equal(r.active, false);
});

test('active when only one of two hands is pinched', () => {
  const g = new VertexSculpt();
  const r = g.detect(results(pinchedHand(0.3, 0.5), openHand(0.7, 0.5)));
  assert.equal(r.active, true);
});
