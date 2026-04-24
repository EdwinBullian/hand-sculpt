import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoHandYRotation } from '../js/gestures/twoHandYRotation.js';

// Build 21-landmark arrays. Only wrist (0), indexMCP (5), pinkyMCP (17), and
// thumb tip (4) are inspected by TwoHandYRotation / palmFacesCamera.
function emptyLandmarks() {
  return Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
}

// RIGHT hand with palm facing camera.
// cross(indexMCP-wrist, pinkyMCP-wrist).z < 0 (no negation for right hand).
// indexMCP at +y, pinkyMCP at +x → cross.z = -0.01 < 0 ✓
function rightFacing(wrist = { x: 0.3, y: 0.5 }, thumbPos = null) {
  const lm = emptyLandmarks();
  lm[0]  = { x: wrist.x,       y: wrist.y,       z: 0 };
  lm[5]  = { x: wrist.x,       y: wrist.y + 0.1, z: 0 }; // indexMCP +y
  lm[17] = { x: wrist.x + 0.1, y: wrist.y,       z: 0 }; // pinkyMCP +x
  lm[4]  = thumbPos ? { ...thumbPos, z: 0 } : { x: wrist.x, y: wrist.y, z: 0 };
  return lm;
}

// RIGHT hand with palm facing AWAY.
// indexMCP at +x, pinkyMCP at +y → cross.z = +0.01 > 0 (not facing) ✓
function rightAway(wrist = { x: 0.3, y: 0.5 }) {
  const lm = emptyLandmarks();
  lm[0]  = { x: wrist.x,       y: wrist.y,       z: 0 };
  lm[5]  = { x: wrist.x + 0.1, y: wrist.y,       z: 0 };
  lm[17] = { x: wrist.x,       y: wrist.y + 0.1, z: 0 };
  lm[4]  = { x: wrist.x, y: wrist.y, z: 0 };
  return lm;
}

// LEFT hand with palm facing camera.
// cross.z > 0 before negation → after negate < 0 ✓
// indexMCP at +x, pinkyMCP at +y → cross.z = 0.01 → negated → -0.01 < 0
function leftFacing(wrist = { x: 0.7, y: 0.5 }, thumbPos = null) {
  const lm = emptyLandmarks();
  lm[0]  = { x: wrist.x,       y: wrist.y,       z: 0 };
  lm[5]  = { x: wrist.x + 0.1, y: wrist.y,       z: 0 }; // indexMCP +x
  lm[17] = { x: wrist.x,       y: wrist.y + 0.1, z: 0 }; // pinkyMCP +y
  lm[4]  = thumbPos ? { ...thumbPos, z: 0 } : { x: wrist.x, y: wrist.y, z: 0 };
  return lm;
}

function makeResults(hands) {
  return {
    handedness: hands.map(h => [{ categoryName: h.label }]),
    landmarks: hands.map(h => h.lm),
  };
}

// Thumbs placed near the center so they're within the 0.12 threshold.
const CLOSE_THUMB_R = { x: 0.49, y: 0.5 };
const CLOSE_THUMB_L = { x: 0.51, y: 0.5 };
const FAR_THUMB_R   = { x: 0.1,  y: 0.5 };
const FAR_THUMB_L   = { x: 0.9,  y: 0.5 };

test('not active with no hands', () => {
  const g = new TwoHandYRotation();
  const r = g.detect({ handedness: [], landmarks: [] });
  assert.equal(r.active, false);
  assert.equal(r.deltaY, 0);
});

test('not active with only one hand', () => {
  const g = new TwoHandYRotation();
  const r = g.detect(makeResults([{ label: 'Right', lm: rightFacing() }]));
  assert.equal(r.active, false);
});

test('not active when one palm does not face camera', () => {
  const g = new TwoHandYRotation();
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightAway() },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, CLOSE_THUMB_L) },
  ]));
  assert.equal(r.active, false);
});

test('not active when both palms face camera but thumbs too far apart', () => {
  const g = new TwoHandYRotation();
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, FAR_THUMB_R) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, FAR_THUMB_L) },
  ]));
  assert.equal(r.active, false);
  assert.equal(r.deltaY, 0);
});

test('active when both palms face camera and thumbs are close', () => {
  const g = new TwoHandYRotation();
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, CLOSE_THUMB_R) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, CLOSE_THUMB_L) },
  ]));
  assert.equal(r.active, true);
});

test('deltaY is 0 on first active detection', () => {
  const g = new TwoHandYRotation();
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, CLOSE_THUMB_R) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, CLOSE_THUMB_L) },
  ]));
  assert.equal(r.deltaY, 0);
});

test('deltaY reflects horizontal movement on second detection', () => {
  const g = new TwoHandYRotation();
  // First frame: thumb center at x=0.5
  g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, { x: 0.49, y: 0.5 }) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, { x: 0.51, y: 0.5 }) },
  ]));
  // Second frame: hands moved left, thumb center at x=0.4
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.2, y: 0.5 }, { x: 0.39, y: 0.5 }) },
    { label: 'Left',  lm: leftFacing({ x: 0.6, y: 0.5 }, { x: 0.41, y: 0.5 }) },
  ]));
  assert.equal(r.active, true);
  // lastCenterX(0.5) - centerX(0.4) = 0.1 → deltaY ≈ 0.628
  assert.ok(Math.abs(r.deltaY - 0.1 * Math.PI * 2) < 1e-5, `expected ~0.628, got ${r.deltaY}`);
});

test('reset clears state so next detection gives deltaY 0', () => {
  const g = new TwoHandYRotation();
  g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, CLOSE_THUMB_R) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, CLOSE_THUMB_L) },
  ]));
  g.reset();
  const r = g.detect(makeResults([
    { label: 'Right', lm: rightFacing({ x: 0.3, y: 0.5 }, CLOSE_THUMB_R) },
    { label: 'Left',  lm: leftFacing({ x: 0.7, y: 0.5 }, CLOSE_THUMB_L) },
  ]));
  assert.equal(r.deltaY, 0);
});
