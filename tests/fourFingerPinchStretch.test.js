import test from 'node:test';
import assert from 'node:assert/strict';
import { FourFingerPinchStretch } from '../js/gestures/fourFingerPinchStretch.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// Four-finger pinch: thumb tip (4) close to index (8), middle (12), ring (16).
// Landmarks 0 (wrist), 5/9/13/17 (MCPs) set so palmCentroid has a stable value.
function fourFingerPinchedHand(centerX, centerY) {
  const lm = makeLandmarks({
    0:  [centerX, centerY + 0.2, 0],      // wrist
    5:  [centerX - 0.03, centerY, -0.01],  // index MCP
    9:  [centerX, centerY - 0.03, -0.01], // middle MCP
    13: [centerX + 0.02, centerY, -0.01],  // ring MCP
    17: [centerX + 0.04, centerY + 0.02, -0.01], // pinky MCP
    // Clustered tips:
    4:  [centerX, centerY - 0.05, 0],     // thumb tip
    8:  [centerX + 0.01, centerY - 0.05, 0], // index tip (close to thumb)
    12: [centerX + 0.005, centerY - 0.045, 0], // middle tip
    16: [centerX - 0.01, centerY - 0.055, 0],  // ring tip
  });
  return lm;
}

function openHand(centerX, centerY) {
  return makeLandmarks({
    0:  [centerX, centerY + 0.2, 0],
    4:  [centerX - 0.1, centerY - 0.05, 0],
    8:  [centerX + 0.05, centerY - 0.15, 0],
    12: [centerX + 0.08, centerY - 0.2, 0],
    16: [centerX + 0.12, centerY - 0.15, 0],
  });
}

function resultsTwo(lm0, lm1) {
  return {
    landmarks: [lm0, lm1],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
}

test('inactive when zero or one hand visible', () => {
  const g = new FourFingerPinchStretch();
  assert.equal(g.detect({ landmarks: [], handedness: [] }, { x:1, y:1, z:1 }).active, false);
  const one = { landmarks: [fourFingerPinchedHand(0.3, 0.5)], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
  assert.equal(g.detect(one, { x:1, y:1, z:1 }).active, false);
});

test('inactive when either hand is not pinched', () => {
  const g = new FourFingerPinchStretch();
  const r = g.detect(resultsTwo(
    fourFingerPinchedHand(0.3, 0.5),
    openHand(0.7, 0.5),
  ), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, false);
});

test('active and baseline captured when both hands pinched', () => {
  const g = new FourFingerPinchStretch();
  const r = g.detect(resultsTwo(
    fourFingerPinchedHand(0.3, 0.5),
    fourFingerPinchedHand(0.7, 0.5),
  ), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.equal(r.axis, 'x');
  // Baseline frame → ratio 1, scale unchanged.
  assert.ok(Math.abs(r.scale.x - 1) < 1e-6);
  assert.equal(r.scale.y, 1);
  assert.equal(r.scale.z, 1);
});

test('ratchet: scale grows on dominant axis as hands pull apart', () => {
  const g = new FourFingerPinchStretch();
  g.detect(resultsTwo(
    fourFingerPinchedHand(0.3, 0.5),
    fourFingerPinchedHand(0.7, 0.5),
  ), { x: 1, y: 1, z: 1 });
  const r = g.detect(resultsTwo(
    fourFingerPinchedHand(0.1, 0.5),
    fourFingerPinchedHand(0.9, 0.5),
  ), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.equal(r.axis, 'x');
  assert.ok(r.scale.x > 1, `expected scale.x > 1, got ${r.scale.x}`);
  assert.equal(r.scale.y, 1);
  assert.equal(r.scale.z, 1);
});

test('ratchet: hands coming back together do not shrink scale', () => {
  const g = new FourFingerPinchStretch();
  g.detect(resultsTwo(
    fourFingerPinchedHand(0.3, 0.5),
    fourFingerPinchedHand(0.7, 0.5),
  ), { x: 1, y: 1, z: 1 });
  // Stretch.
  const stretched = g.detect(resultsTwo(
    fourFingerPinchedHand(0.1, 0.5),
    fourFingerPinchedHand(0.9, 0.5),
  ), { x: 1, y: 1, z: 1 });
  const stretchedX = stretched.scale.x;
  // Bring hands back.
  const r = g.detect(resultsTwo(
    fourFingerPinchedHand(0.3, 0.5),
    fourFingerPinchedHand(0.7, 0.5),
  ), { x: 1, y: 1, z: 1 });
  assert.ok(Math.abs(r.scale.x - stretchedX) < 1e-9, `expected scale.x locked at ${stretchedX}, got ${r.scale.x}`);
});
