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
  const right = handSpaceToWorld({ x: 1, y: 0.5, z: 0 });
  assert.ok(Math.abs(right.x - (-2)) < 1e-6);
  const top = handSpaceToWorld({ x: 0.5, y: 0, z: 0 });
  assert.ok(Math.abs(top.y - 2) < 1e-6);
  const near = handSpaceToWorld({ x: 0.5, y: 0.5, z: -0.3 });
  assert.ok(Math.abs(near.z - 0.999) < 1e-2);
});

test('detect — no hands → inactive, not paused', () => {
  const g = new SingleHandPose();
  const r = g.detect({ landmarks: [], handedness: [] });
  assert.equal(r.active, false);
  assert.equal(r.paused, false);
});

test('detect — two hands both palms-down → paused, inactive', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_IN, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  ));
  assert.equal(r.active, false);
  assert.equal(r.paused, true);
});

test('detect — single palm-up hand → active, position + quaternion present', () => {
  const g = new SingleHandPose();
  const r = g.detect(results({ lm: RIGHT_HAND_PALM_OUT, side: 'Right' }));
  assert.equal(r.active, true);
  assert.equal(r.paused, false);
  assert.ok(r.position, 'position should be defined');
  assert.ok(r.quaternion, 'quaternion should be defined');
  const q = r.quaternion;
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  assert.ok(Math.abs(len - 1) < 1e-5, `expected unit quaternion, got length ${len}`);
});

test('detect — two hands, only one palm-up → active (the up hand)', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_IN, side: 'Left' },
  ));
  assert.equal(r.active, true);
  assert.equal(r.paused, false);
});

test('detect — two hands, both palms-up → inactive (Phase 3 two-hand mode)', () => {
  const g = new SingleHandPose();
  const r = g.detect(results(
    { lm: RIGHT_HAND_PALM_OUT, side: 'Right' },
    { lm: LEFT_HAND_PALM_OUT, side: 'Left' },
  ));
  assert.equal(r.active, false);
  assert.equal(r.paused, false);
});

test('detect — single palm-down hand → inactive, not paused (one back is not pause)', () => {
  const g = new SingleHandPose();
  const r = g.detect(results({ lm: RIGHT_HAND_PALM_IN, side: 'Right' }));
  assert.equal(r.active, false);
  assert.equal(r.paused, false);
});
