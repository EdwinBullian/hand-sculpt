import test from 'node:test';
import assert from 'node:assert/strict';
import { FingerCountHold } from '../js/gestures/fingerCountHold.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// Back of RIGHT hand facing camera: wrist at (0.3, 0.9), MCPs above with z POSITIVE (away from camera).
// Index MCP on IMAGE-LEFT of wrist (since back-of-hand flips the L/R of MCPs relative to palm-out).
function palmDownRightHand(fingerBits) {
  const lm = makeLandmarks({
    0:  [0.3, 0.9, 0],
    5:  [0.25, 0.65, 0.01],
    9:  [0.3, 0.6, 0.015],
    13: [0.32, 0.63, 0.015],
    17: [0.35, 0.7, 0.01],
  });
  lm[3] = { x: 0.27, y: 0.83, z: 0 };
  lm[4] = fingerBits[0] ? { x: 0.22, y: 0.72, z: 0 } : { x: 0.29, y: 0.85, z: 0 };
  lm[6] = { x: 0.26, y: 0.45, z: 0 };
  lm[8] = fingerBits[1] ? { x: 0.26, y: 0.1, z: 0 } : { x: 0.29, y: 0.7, z: 0 };
  lm[10] = { x: 0.3, y: 0.4, z: 0 };
  lm[12] = fingerBits[2] ? { x: 0.3, y: 0.05, z: 0 } : { x: 0.3, y: 0.68, z: 0 };
  lm[14] = { x: 0.33, y: 0.43, z: 0 };
  lm[16] = fingerBits[3] ? { x: 0.34, y: 0.1, z: 0 } : { x: 0.32, y: 0.7, z: 0 };
  lm[18] = { x: 0.36, y: 0.5, z: 0 };
  lm[20] = fingerBits[4] ? { x: 0.38, y: 0.3, z: 0 } : { x: 0.35, y: 0.72, z: 0 };
  return lm;
}

function resultsOneHand(lm, side = 'Right') {
  return {
    landmarks: [lm],
    handedness: [[{ categoryName: side, score: 0.9 }]],
  };
}

test('fires when palm-DOWN hand holds 2 fingers for holdFrames', () => {
  const g = new FingerCountHold(3);
  const lm = palmDownRightHand([false, true, true, false, false]);
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  assert.equal(g.detect(resultsOneHand(lm)).fired, 2);
});

test('does not fire again while count stays same (one-shot per change)', () => {
  const g = new FingerCountHold(3);
  const lm = palmDownRightHand([false, true, true, false, false]);
  g.detect(resultsOneHand(lm));
  g.detect(resultsOneHand(lm));
  g.detect(resultsOneHand(lm));
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
});

test('does not fire when palm is UP (Force territory)', () => {
  const g = new FingerCountHold(3);
  const lm = makeLandmarks({
    0:  [0.3, 0.9, 0],
    3:  [0.35, 0.83, 0],  4:  [0.37, 0.85, 0],
    5:  [0.35, 0.65, -0.01], 6: [0.36, 0.45, 0], 8: [0.37, 0.1, 0],
    9:  [0.3, 0.6, -0.015],  10: [0.3, 0.4, 0], 12: [0.3, 0.05, 0],
    13: [0.28, 0.63, -0.015], 14: [0.28, 0.58, 0], 16: [0.28, 0.72, 0],
    17: [0.25, 0.7, -0.01],  18: [0.25, 0.58, 0], 20: [0.25, 0.72, 0],
  });
  for (let i = 0; i < 10; i++) {
    const r = g.detect(resultsOneHand(lm, 'Right'));
    assert.equal(r.fired, null);
  }
});

test('does not fire with zero or more than one hand visible', () => {
  const g = new FingerCountHold(3);
  const lm = palmDownRightHand([false, true, true, false, false]);
  for (let i = 0; i < 10; i++) {
    assert.equal(g.detect({ landmarks: [], handedness: [] }).fired, null);
  }
  const two = {
    landmarks: [lm, lm],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
  for (let i = 0; i < 10; i++) {
    assert.equal(g.detect(two).fired, null);
  }
});

test('resets when count changes', () => {
  const g = new FingerCountHold(3);
  const lm2 = palmDownRightHand([false, true, true, false, false]);
  const lm3 = palmDownRightHand([false, true, true, true, false]);
  g.detect(resultsOneHand(lm2));
  g.detect(resultsOneHand(lm2));
  g.detect(resultsOneHand(lm2));
  assert.equal(g.detect(resultsOneHand(lm3)).fired, null);
  assert.equal(g.detect(resultsOneHand(lm3)).fired, null);
  assert.equal(g.detect(resultsOneHand(lm3)).fired, 3);
});

test('does not fire for 0 or >5 fingers', () => {
  const g = new FingerCountHold(3);
  const fist = palmDownRightHand([false, false, false, false, false]);
  for (let i = 0; i < 10; i++) {
    assert.equal(g.detect(resultsOneHand(fist)).fired, null);
  }
});

test('motion stability: counter resets when palm moves too much during hold', () => {
  const g = new FingerCountHold(3, 0.05);
  const lm = palmDownRightHand([false, true, true, false, false]);
  // First frame — count recorded, baseline centroid set.
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  // Second frame — same landmarks, still counting.
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  // Shift every landmark by 0.2 in x (simulating hand swept across the frame).
  const shifted = lm.map((p) => ({ x: p.x + 0.2, y: p.y, z: p.z }));
  // Motion detected → counter resets to 1, fired stays false.
  assert.equal(g.detect(resultsOneHand(shifted)).fired, null);
  assert.equal(g.detect(resultsOneHand(shifted)).fired, null);
  // Need two more frames of stability (counter now 2), then third fires.
  assert.equal(g.detect(resultsOneHand(shifted)).fired, 2);
});
