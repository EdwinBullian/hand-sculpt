import test from 'node:test';
import assert from 'node:assert/strict';
import { SingleHandPose, palmCentroid, handSpaceToWorld } from '../js/gestures/singleHandPose.js';

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

test('palmCentroid averages wrist + 4 MCP landmarks', () => {
  const c = palmCentroid(RIGHT_HAND_PALM_OUT);
  assert.ok(Math.abs(c.x - 0.296) < 1e-6);
  assert.ok(Math.abs(c.y - 0.696) < 1e-6);
});

test('handSpaceToWorld maps hand centroid to Three.js world coordinates', () => {
  const w = handSpaceToWorld({ x: 0.5, y: 0.5, z: 0 });
  assert.ok(Math.abs(w.x) < 1e-9);
  assert.ok(Math.abs(w.y) < 1e-9);
  assert.ok(Math.abs(w.z) < 1e-9);
  // X_SCALE = 8, so hand x=1 → world x = -(0.5)*8 = -4
  const right = handSpaceToWorld({ x: 1, y: 0.5, z: 0 });
  assert.ok(Math.abs(right.x - (-4)) < 1e-6);
  // Y_SCALE = 5, so hand y=0 → world y = -(-0.5)*5 = 2.5
  const top = handSpaceToWorld({ x: 0.5, y: 0, z: 0 });
  assert.ok(Math.abs(top.y - 2.5) < 1e-6);
  const near = handSpaceToWorld({ x: 0.5, y: 0.5, z: -0.3 });
  assert.ok(Math.abs(near.z - 0.999) < 1e-2);
});

test('detect — no hands → inactive, handCount 0', () => {
  const g = new SingleHandPose();
  const r = g.detect({ landmarks: [], handedness: [] });
  assert.equal(r.active, false);
  assert.equal(r.handCount, 0);
});

test('detect — two hands both palms-down → inactive (reset handled elsewhere)', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_IN, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  ));
  assert.equal(r.active, false);
  assert.equal(r.handCount, 0);
});

test('detect — single palm-up hand → active, handCount 1, position + quaternion present', () => {
  const g = new SingleHandPose();
  const r = g.detect(results({ lm: RIGHT_HAND_PALM_OUT, side: 'Right' }));
  assert.equal(r.active, true);
  assert.equal(r.handCount, 1);
  assert.ok(r.position, 'position should be defined');
  assert.ok(r.quaternion, 'quaternion should be defined');
  const q = r.quaternion;
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  assert.ok(Math.abs(len - 1) < 1e-5, `expected unit quaternion, got length ${len}`);
});

test('detect — two hands, only one palm-up → active (handCount 1, tracks the up hand)', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  ));
  assert.equal(r.active, true);
  assert.equal(r.handCount, 1);
});

test('detect — two hands, both palms-up → active with midpoint position, handCount 2', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_OUT, side: 'Left' },
  ));
  assert.equal(r.active, true);
  assert.equal(r.handCount, 2);
  // Both hands centered symmetrically around image x=0.5, so world.x midpoint ≈ 0.
  assert.ok(Math.abs(r.position.x) < 1e-3, `expected midpoint x≈0, got ${r.position.x}`);
  // Quaternion is unit length.
  const q = r.quaternion;
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  assert.ok(Math.abs(len - 1) < 1e-5, `expected unit quaternion, got length ${len}`);
});

test('detect — single palm-down hand → inactive', () => {
  const g = new SingleHandPose();
  const r = g.detect(results({ lm: RIGHT_HAND_PALM_IN, side: 'Right' }));
  assert.equal(r.active, false);
  assert.equal(r.handCount, 0);
});
