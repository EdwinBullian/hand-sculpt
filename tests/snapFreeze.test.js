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

// Snap pose: thumb tip + middle tip touching.
function snapPose() {
  return makeLandmarks({
    4:  [0.5, 0.5, 0],
    12: [0.505, 0.505, 0],
  });
}

function openHand() {
  return makeLandmarks({
    4:  [0.3, 0.5, 0],
    12: [0.7, 0.3, 0],
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
