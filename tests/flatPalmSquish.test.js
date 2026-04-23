import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatPalmSquish } from '../js/gestures/flatPalmSquish.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// Two flat hands facing each other along world X.
// Hand 0 (user's right, image-left, handedness='Right'): palm normal points world +X.
// Hand 1 (user's left, image-right, handedness='Left'): palm normal points world -X.
// Constructed so palmNormal(lm, isLeftHand) × flipToWorld gives the desired world vectors.
// Each hand has all 5 fingers extended (tips far from wrist).
function twoFlatHandsFacing() {
  const h0 = makeLandmarks({
    0:  [0.3, 0.6, 0],
    5:  [0.3, 0.4, -0.05],
    9:  [0.3, 0.4, 0],
    13: [0.3, 0.4, 0.02],
    17: [0.3, 0.4, 0.05],
    3:  [0.28, 0.55, 0],     4:  [0.25, 0.4, 0],
    6:  [0.3, 0.25, -0.05],  8:  [0.3, 0.1, -0.05],
    10: [0.3, 0.25, 0],      12: [0.3, 0.05, 0],
    14: [0.3, 0.25, 0.02],   16: [0.3, 0.1, 0.02],
    18: [0.3, 0.3, 0.05],    20: [0.3, 0.2, 0.05],
  });
  const h1 = makeLandmarks({
    0:  [0.7, 0.6, 0],
    5:  [0.7, 0.4, -0.05],
    9:  [0.7, 0.4, 0],
    13: [0.7, 0.4, 0.02],
    17: [0.7, 0.4, 0.05],
    3:  [0.72, 0.55, 0],     4:  [0.75, 0.4, 0],
    6:  [0.7, 0.25, -0.05],  8:  [0.7, 0.1, -0.05],
    10: [0.7, 0.25, 0],      12: [0.7, 0.05, 0],
    14: [0.7, 0.25, 0.02],   16: [0.7, 0.1, 0.02],
    18: [0.7, 0.3, 0.05],    20: [0.7, 0.2, 0.05],
  });
  return {
    landmarks: [h0, h1],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
}

test('activates when both palms flat and facing each other', () => {
  const g = new FlatPalmSquish();
  const r = g.detect(twoFlatHandsFacing(), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.ok(['x', 'y', 'z'].includes(r.axis), `axis should be x/y/z, got ${r.axis}`);
  assert.ok(Math.abs(r.scale.x - 1) < 1e-6);
  assert.ok(Math.abs(r.scale.y - 1) < 1e-6);
  assert.ok(Math.abs(r.scale.z - 1) < 1e-6);
});

test('dominant axis is X when hands are separated horizontally', () => {
  const g = new FlatPalmSquish();
  const r = g.detect(twoFlatHandsFacing(), { x: 1, y: 1, z: 1 });
  assert.equal(r.axis, 'x');
});

test('inactive with fewer than 2 hands', () => {
  const g = new FlatPalmSquish();
  assert.equal(g.detect({ landmarks: [], handedness: [] }, { x:1, y:1, z:1 }).active, false);
});

test('inactive when palms face the camera (not each other)', () => {
  const g = new FlatPalmSquish();
  const palmOutRight = makeLandmarks({
    0:  [0.3, 0.9, 0],
    5:  [0.35, 0.65, -0.01],
    9:  [0.3, 0.6, -0.015],
    13: [0.28, 0.63, -0.015],
    17: [0.25, 0.7, -0.01],
    3:  [0.32, 0.75, 0],    4:  [0.28, 0.55, 0],
    6:  [0.35, 0.4, 0],     8:  [0.35, 0.1, 0],
    10: [0.3, 0.35, 0],     12: [0.3, 0.05, 0],
    14: [0.28, 0.38, 0],    16: [0.28, 0.1, 0],
    18: [0.25, 0.45, 0],    20: [0.25, 0.3, 0],
  });
  const palmOutLeft = makeLandmarks({
    0:  [0.7, 0.9, 0],
    5:  [0.65, 0.65, -0.01],
    9:  [0.7, 0.6, -0.015],
    13: [0.72, 0.63, -0.015],
    17: [0.75, 0.7, -0.01],
    3:  [0.68, 0.75, 0],    4:  [0.72, 0.55, 0],
    6:  [0.65, 0.4, 0],     8:  [0.65, 0.1, 0],
    10: [0.7, 0.35, 0],     12: [0.7, 0.05, 0],
    14: [0.72, 0.38, 0],    16: [0.72, 0.1, 0],
    18: [0.75, 0.45, 0],    20: [0.75, 0.3, 0],
  });
  const r = g.detect({
    landmarks: [palmOutRight, palmOutLeft],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  }, { x: 1, y: 1, z: 1 });
  assert.equal(r.active, false);
});

test('scale grows on dominant axis as flat hands move apart', () => {
  const g = new FlatPalmSquish();
  g.detect(twoFlatHandsFacing(), { x: 1, y: 1, z: 1 });
  const wider = twoFlatHandsFacing();
  for (const p of wider.landmarks[0]) p.x -= 0.1;
  for (const p of wider.landmarks[1]) p.x += 0.1;
  const r = g.detect(wider, { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.equal(r.axis, 'x');
  assert.ok(r.scale.x > 1, `expected scale.x > 1, got ${r.scale.x}`);
  assert.equal(r.scale.y, 1);
  assert.equal(r.scale.z, 1);
});
