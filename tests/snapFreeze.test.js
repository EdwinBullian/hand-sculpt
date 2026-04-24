import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapFreeze } from '../js/gestures/snapFreeze.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// Snap pose: thumb tip + middle tip touching, index extended and NOT touching thumb.
function snapPose() {
  return makeLandmarks({
    0:  [0.5, 0.9, 0],   // wrist
    4:  [0.48, 0.5, 0],  // thumb tip
    6:  [0.55, 0.45, 0], // index PIP
    8:  [0.57, 0.25, 0], // index tip (extended, far from thumb)
    12: [0.49, 0.51, 0], // middle tip (near thumb tip — snap pose)
  });
}

// Open hand: thumb and middle far apart.
function openHand() {
  return makeLandmarks({
    0:  [0.5, 0.9, 0],
    4:  [0.3, 0.5, 0],
    6:  [0.55, 0.45, 0],
    8:  [0.57, 0.25, 0],
    12: [0.7, 0.3, 0],
  });
}

// Fist: thumb and middle tips both near wrist (touching-ish), index curled (tip near PIP).
function fistPose() {
  return makeLandmarks({
    0:  [0.5, 0.9, 0],
    4:  [0.5, 0.85, 0],  // thumb tip near wrist
    6:  [0.52, 0.65, 0], // index PIP
    8:  [0.52, 0.7, 0],  // index tip CLOSER to wrist than PIP (curled)
    12: [0.5, 0.84, 0],  // middle tip near thumb tip
  });
}

// Thumb+index pinch: thumb touching index (used by TwoHandPinchScale).
// Middle curls naturally during a pinch so it can also be near the thumb.
function pinchPose() {
  return makeLandmarks({
    0:  [0.5, 0.9, 0],
    4:  [0.5, 0.4, 0],   // thumb tip
    6:  [0.55, 0.5, 0],  // index PIP
    8:  [0.51, 0.4, 0],  // index tip near thumb tip (pinch)
    12: [0.495, 0.41, 0],// middle tip happens to be near thumb too
  });
}

function resultsOne(lm) {
  return {
    landmarks: [lm],
    handedness: [[{ categoryName: 'Right', score: 0.9 }]],
  };
}

test('fires toggle once after snap pose held for holdFrames', () => {
  const g = new SnapFreeze(3);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, true);
});

test('does not re-fire while snap pose held', () => {
  const g = new SnapFreeze(3);
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  for (let i = 0; i < 10; i++) {
    assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  }
});

test('can fire again after snap pose is released and re-entered', () => {
  const g = new SnapFreeze(3);
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose())); // first fire
  g.detect(resultsOne(openHand()));
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  assert.equal(g.detect(resultsOne(snapPose())).toggle, true);
});

test('counter resets if snap pose briefly lost', () => {
  const g = new SnapFreeze(3);
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(openHand()));
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, true);
});

test('no hands → no toggle, counter resets', () => {
  const g = new SnapFreeze(3);
  g.detect(resultsOne(snapPose()));
  g.detect(resultsOne(snapPose()));
  const r = g.detect({ landmarks: [], handedness: [] });
  assert.equal(r.toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, false);
  assert.equal(g.detect(resultsOne(snapPose())).toggle, true);
});

test('either of two hands in snap pose triggers', () => {
  const g = new SnapFreeze(3);
  const two = {
    landmarks: [openHand(), snapPose()],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
  assert.equal(g.detect(two).toggle, false);
  assert.equal(g.detect(two).toggle, false);
  assert.equal(g.detect(two).toggle, true);
});

test('does NOT fire on fist (thumb+middle touch but index curled)', () => {
  const g = new SnapFreeze(3);
  for (let i = 0; i < 20; i++) {
    assert.equal(g.detect(resultsOne(fistPose())).toggle, false);
  }
});

test('does NOT fire on pinch (thumb+index touching)', () => {
  const g = new SnapFreeze(3);
  for (let i = 0; i < 20; i++) {
    assert.equal(g.detect(resultsOne(pinchPose())).toggle, false);
  }
});
