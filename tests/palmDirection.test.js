import test from 'node:test';
import assert from 'node:assert/strict';
import { palmNormal, palmFacesCamera } from '../js/gestures/palmDirection.js';

// Fixtures representing canonical hand poses. Coordinates follow MediaPipe
// convention (normalized 0..1, y grows downward, z negative = toward camera).

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// USER'S RIGHT hand, palm facing camera, fingers pointing up.
// Right hand sits at the LEFT of the unmirrored image (x ≈ 0.3).
// Thumb is on user's left = image-right side of the hand.
// Index MCP near thumb side (right of wrist), pinky MCP on opposite side (left of wrist).
const RIGHT_HAND_PALM_OUT = makeLandmarks({
  0:  [0.3, 0.9, 0],      // wrist
  5:  [0.35, 0.65, -0.01], // index MCP — slightly right of wrist, above, toward camera
  9:  [0.3, 0.6, -0.015],  // middle MCP
  17: [0.25, 0.7, -0.01], // pinky MCP — slightly left of wrist
});

// USER'S RIGHT hand, BACK of hand facing camera (hand flipped 180° around its up axis).
// Horizontal positions of index and pinky MCPs swap; z values flip sign (fingers now farther from camera).
const RIGHT_HAND_PALM_IN = makeLandmarks({
  0:  [0.3, 0.9, 0],
  5:  [0.25, 0.65, 0.01],
  9:  [0.3, 0.6, 0.015],
  17: [0.35, 0.7, 0.01],
});

// USER'S LEFT hand, palm facing camera. Left hand sits at the RIGHT of the image (x ≈ 0.7).
// Thumb on user's right = image-left side of hand.
// Index MCP near thumb side (left of wrist), pinky MCP opposite side (right of wrist).
const LEFT_HAND_PALM_OUT = makeLandmarks({
  0:  [0.7, 0.9, 0],
  5:  [0.65, 0.65, -0.01],
  9:  [0.7, 0.6, -0.015],
  17: [0.75, 0.7, -0.01],
});

const LEFT_HAND_PALM_IN = makeLandmarks({
  0:  [0.7, 0.9, 0],
  5:  [0.75, 0.65, 0.01],
  9:  [0.7, 0.6, 0.015],
  17: [0.65, 0.7, 0.01],
});

test('palmNormal returns a unit-length vector', () => {
  const n = palmNormal(RIGHT_HAND_PALM_OUT, false);
  const len = Math.hypot(n.x, n.y, n.z);
  assert.ok(Math.abs(len - 1) < 1e-6, `expected unit length, got ${len}`);
});

test('palmNormal returns {x:0, y:0, z:0} for degenerate zero landmarks', () => {
  const lm = makeLandmarks({ 0: [0.5, 0.5, 0], 5: [0.5, 0.5, 0], 17: [0.5, 0.5, 0] });
  const n = palmNormal(lm, false);
  assert.equal(n.x, 0);
  assert.equal(n.y, 0);
  assert.equal(n.z, 0);
});

test('palmFacesCamera — right hand palm-out → true', () => {
  assert.equal(palmFacesCamera(RIGHT_HAND_PALM_OUT, false), true);
});

test('palmFacesCamera — right hand palm-in → false', () => {
  assert.equal(palmFacesCamera(RIGHT_HAND_PALM_IN, false), false);
});

test('palmFacesCamera — left hand palm-out → true', () => {
  assert.equal(palmFacesCamera(LEFT_HAND_PALM_OUT, true), true);
});

test('palmFacesCamera — left hand palm-in → false', () => {
  assert.equal(palmFacesCamera(LEFT_HAND_PALM_IN, true), false);
});

test('palmFacesCamera — null / short input returns false', () => {
  assert.equal(palmFacesCamera(null, false), false);
  assert.equal(palmFacesCamera([], false), false);
  assert.equal(palmFacesCamera(new Array(10).fill({ x: 0, y: 0, z: 0 }), false), false);
});
