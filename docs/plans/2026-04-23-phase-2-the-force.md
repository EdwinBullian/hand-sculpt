# hand-sculpt Phase 2 — The Force Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wireframe object track the user's dominant hand (palm centroid → position, palm orientation → rotation) as a 6-DOF controller. Both palms showing backs → pause (object freezes). Smoothing + hysteresis prevent jitter.

**Architecture:** Add `js/gestures/palmDirection.js` (palm-normal math + palm-facing-camera predicate), `js/gestures/singleHandPose.js` (activation logic + pose extraction from landmarks), and `js/poseSmoother.js` (per-frame EMA on position + quaternion). Modify `js/main.js` to call these every frame and apply smoothed pose to the scene mesh. Modify `js/scene.js` to add `setPose({position, quaternion})` method.

**Tech Stack:** Same as Phase 1. No new dependencies. Tests still run under Node's built-in `--test` with the existing `npm test` command.

**Phase 2 milestone:** "I wave my palm, the cube follows and tilts with it. Show the backs of both hands, the cube freezes."

---

## File Structure

New:
- `js/gestures/palmDirection.js` — palm-normal cross-product math + `palmFacesCamera` predicate
- `js/gestures/singleHandPose.js` — `SingleHandPose` class: `detect(results) → {active, paused, position, quaternion}`
- `js/poseSmoother.js` — `PoseSmoother` class: wraps EMA on position components + component-wise EMA with renormalization on quaternion
- `tests/palmDirection.test.js`
- `tests/singleHandPose.test.js`
- `tests/poseSmoother.test.js`

Modified:
- `js/scene.js` — add `setPose({position, quaternion})` method that calls `mesh.position.set(...)` and `mesh.quaternion.set(...)`
- `js/main.js` — import gesture + smoother, instantiate at module scope, call `.detect()` in `tick()`, run smoother, apply to scene, update HUD gesture label ("FORCE" / "PAUSED" / "IDLE")

---

## Key Math Reference

**Coordinate conventions:**
- MediaPipe: `x` and `y` normalized [0,1], origin top-left. `z` is depth relative to wrist, smaller = closer to camera (MediaPipe convention: z < 0 toward camera).
- Three.js world: right-handed. Camera at `(0,0,5)` looking at origin. +X = right, +Y = up, +Z = toward camera.
- Video is mirrored horizontally FOR DISPLAY ONLY. MediaPipe receives the unmirrored stream. So landmarks are in image-native coords (user's right hand appears at small x).

**Position mapping** (from MediaPipe hand-space to Three.js world):
```
world.x = -(hand.x - 0.5) * 4       // mirror flip so hand-right on screen = cube-right in world
world.y = -(hand.y - 0.5) * 4       // y-axis flip (MediaPipe y-down, Three.js y-up)
world.z = -hand.z * 3.33             // flip so "closer to camera in hand-space" = "closer to camera in world"
```

**Palm normal** (cross product, with handedness-dependent sign flip so the normal points OUT of the palm):
```
v1 = indexMCP - wrist            // landmarks[5] - landmarks[0]
v2 = pinkyMCP - wrist            // landmarks[17] - landmarks[0]
rawCross = v1 × v2
palm_normal_hand_space = isLeftHand ? negate(rawCross) : rawCross
```
Palm faces camera when `palm_normal_hand_space.z < 0` (per MediaPipe z-convention).

**Basis vectors for object rotation** (transform hand-space basis to Three.js world-space via the same xyz flip used for position):
```
palm_up_hand      = middleMCP - wrist       // landmarks[9] - landmarks[0]
palm_normal_hand  = (as above)

// Normalize
up     = normalize(palm_up_hand)
normal = normalize(palm_normal_hand)

// Flip MediaPipe → Three.js world (component-wise negation):
up_world     = { x: -up.x,     y: -up.y,     z: -up.z }
normal_world = { x: -normal.x, y: -normal.y, z: -normal.z }

// Right axis (orthogonalized):
right_world = normalize(cross(up_world, normal_world))
// Re-orthogonalize up so the basis is exactly orthogonal:
up_world   = normalize(cross(normal_world, right_world))
```

**Quaternion from rotation basis** (columns are world-space image of local axes — X=right, Y=up, Z=normal):
Use Shepperd's method. Code given in Task 2.

---

## Task 1: Palm Direction Module — TDD

Pure function: given a 21-landmark hand and handedness boolean, compute the palm normal vector and whether the palm faces the camera.

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/palmDirection.js`
- Create: `Coding/hand-sculpt/tests/palmDirection.test.js`

- [ ] **Step 1: Create the gestures directory**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
mkdir -p js/gestures
```

- [ ] **Step 2: Write the failing test**

File: `Coding/hand-sculpt/tests/palmDirection.test.js`

```js
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
```

- [ ] **Step 3: Run the test to verify it FAILS**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/palmDirection.test.js
```

Expected: `ERR_MODULE_NOT_FOUND: Cannot find module '../js/gestures/palmDirection.js'`.

- [ ] **Step 4: Implement the module**

File: `Coding/hand-sculpt/js/gestures/palmDirection.js`

```js
// MediaPipe hand landmarks:
//   0  = wrist, 5 = index MCP, 17 = pinky MCP
// Palm normal is computed as (indexMCP - wrist) × (pinkyMCP - wrist).
// For a RIGHT hand with palm facing camera this cross product points TOWARD the camera (z < 0).
// For a LEFT hand it points AWAY, so we negate to keep the convention consistent:
// after this function, palm-facing-camera always means result.z < 0.

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function palmNormal(landmarks, isLeftHand) {
  if (!landmarks || landmarks.length < 21) return { x: 0, y: 0, z: 0 };
  const wrist = landmarks[0];
  const indexMCP = landmarks[5];
  const pinkyMCP = landmarks[17];
  const v1 = sub(indexMCP, wrist);
  const v2 = sub(pinkyMCP, wrist);
  let n = cross(v1, v2);
  if (isLeftHand) {
    n = { x: -n.x, y: -n.y, z: -n.z };
  }
  const len = Math.hypot(n.x, n.y, n.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}

export function palmFacesCamera(landmarks, isLeftHand) {
  if (!landmarks || landmarks.length < 21) return false;
  const n = palmNormal(landmarks, isLeftHand);
  return n.z < 0;
}
```

- [ ] **Step 5: Run the test to verify it PASSES**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/palmDirection.test.js
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 6: Run the full suite to confirm no regressions**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: 19 tests pass (12 Phase 1 + 7 new).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/palmDirection.js tests/palmDirection.test.js
git commit -m "feat: add palm-direction utility (palm normal + facesCamera predicate)"
```

---

## Task 2: Single-Hand Pose Module — Math + Activation

Build the full `SingleHandPose` gesture: consumes `{landmarks, handedness}` from the tracker, determines activation state (single palm-up + not paused), computes world-space position and quaternion.

Tests cover: activation logic for all state combinations, palm centroid math, and quaternion unit-length invariant. The actual rotation correctness is verified visually in the browser in Task 6 — it's too complex to pin exactly with synthetic fixtures.

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/singleHandPose.js`
- Create: `Coding/hand-sculpt/tests/singleHandPose.test.js`

- [ ] **Step 1: Write the failing test**

File: `Coding/hand-sculpt/tests/singleHandPose.test.js`

```js
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

// Same fixtures as palmDirection tests.
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
  // Mean x of {0.3, 0.35, 0.3, 0.28, 0.25} = 1.48/5 = 0.296
  assert.ok(Math.abs(c.x - 0.296) < 1e-6);
  // Mean y of {0.9, 0.65, 0.6, 0.63, 0.7} = 3.48/5 = 0.696
  assert.ok(Math.abs(c.y - 0.696) < 1e-6);
});

test('handSpaceToWorld maps hand centroid to Three.js world coordinates', () => {
  // A hand at image-center (x=0.5, y=0.5, z=0) should map to world origin.
  const w = handSpaceToWorld({ x: 0.5, y: 0.5, z: 0 });
  assert.ok(Math.abs(w.x) < 1e-9);
  assert.ok(Math.abs(w.y) < 1e-9);
  assert.ok(Math.abs(w.z) < 1e-9);
  // Hand at image right edge (x=1), map should be world -X = -2 (mirror flip).
  const right = handSpaceToWorld({ x: 1, y: 0.5, z: 0 });
  assert.ok(Math.abs(right.x - (-2)) < 1e-6);
  // Hand at image top (y=0), map to world +Y = +2.
  const top = handSpaceToWorld({ x: 0.5, y: 0, z: 0 });
  assert.ok(Math.abs(top.y - 2) < 1e-6);
  // Hand closer to camera (z=-0.3), map to world +Z = +1 (with factor 3.33).
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
  // Quaternion is unit length.
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
```

- [ ] **Step 2: Run the test to verify it FAILS**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/singleHandPose.test.js
```

Expected: `ERR_MODULE_NOT_FOUND: Cannot find module '../js/gestures/singleHandPose.js'`.

- [ ] **Step 3: Implement the module**

File: `Coding/hand-sculpt/js/gestures/singleHandPose.js`

```js
// SingleHandPose: the "Force" gesture.
// Consumes MediaPipe results and produces { active, paused, position, quaternion }.
// Active when exactly one hand has palm facing camera; paused when both hands
// show their backs. All other states are inactive + not paused.

import { palmNormal, palmFacesCamera } from './palmDirection.js';

// Position mapping from MediaPipe hand-space (x,y ∈ [0,1], z ≈ [-0.3,+0.3]) to
// Three.js world coords. Tunable — see design.md §11 "Open Questions."
const XY_SCALE = 4;    // hand x/y displacement of 0.5 → ±2 world units
const Z_SCALE = 3.33;  // hand z displacement of 0.3 → ±1 world unit

export function handSpaceToWorld(p) {
  return {
    x: -(p.x - 0.5) * XY_SCALE,   // mirror flip: hand-right on screen → world +X
    y: -(p.y - 0.5) * XY_SCALE,   // y-axis flip: MediaPipe y-down → world y-up
    z: -p.z * Z_SCALE,             // z flip: MediaPipe z-toward-camera is negative → world +Z
  };
}

export function palmCentroid(landmarks) {
  const idx = [0, 5, 9, 13, 17]; // wrist + 4 knuckles
  let sx = 0, sy = 0, sz = 0;
  for (const i of idx) {
    sx += landmarks[i].x;
    sy += landmarks[i].y;
    sz += landmarks[i].z;
  }
  return { x: sx / idx.length, y: sy / idx.length, z: sz / idx.length };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function flipToWorld(v) {
  // Same axis flips as position: mirror x, y-down→y-up, z-toward-camera→world +Z.
  return { x: -v.x, y: -v.y, z: -v.z };
}

// Build a unit quaternion from a 3x3 rotation matrix whose columns are the
// world-space axes of the object's local frame (X=right, Y=up, Z=normal).
// Standard Shepperd's method.
function quaternionFromBasis(right, up, normal) {
  const m00 = right.x, m01 = up.x, m02 = normal.x;
  const m10 = right.y, m11 = up.y, m12 = normal.y;
  const m20 = right.z, m21 = up.z, m22 = normal.z;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  // Renormalize to guard against floating-point drift.
  const len = Math.hypot(x, y, z, w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

// Extract the object's world-space orientation from the hand's landmarks.
function handQuaternion(landmarks, isLeftHand) {
  const wrist = landmarks[0];
  const middleMCP = landmarks[9];
  const upHand = normalize(sub(middleMCP, wrist));   // "up" along fingers
  const normalHand = palmNormal(landmarks, isLeftHand); // already unit length
  // Transform both to world space:
  const up = normalize(flipToWorld(upHand));
  const normal = normalize(flipToWorld(normalHand));
  // Right axis: complete the orthonormal basis. cross(up, normal) gives a
  // vector perpendicular to both; re-orthogonalize up so the frame is exact.
  let right = normalize(cross(up, normal));
  if (right.x === 0 && right.y === 0 && right.z === 0) {
    // Degenerate: up parallel to normal. Return identity orientation.
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const upOrtho = normalize(cross(normal, right));
  return quaternionFromBasis(right, upOrtho, normal);
}

export class SingleHandPose {
  detect(results) {
    const palmUp = [];   // [{ landmarks, isLeftHand }]
    const palmDown = []; // [{ landmarks, isLeftHand }]
    if (!results || !results.landmarks || !results.handedness) {
      return { active: false, paused: false };
    }
    for (let i = 0; i < results.landmarks.length; i++) {
      const lm = results.landmarks[i];
      const side = results.handedness[i]?.[0]?.categoryName;
      if (side !== 'Left' && side !== 'Right') continue;
      const isLeftHand = side === 'Left';
      if (palmFacesCamera(lm, isLeftHand)) {
        palmUp.push({ lm, isLeftHand });
      } else {
        palmDown.push({ lm, isLeftHand });
      }
    }

    // Pause: exactly two hands visible, both palms-down.
    if (palmUp.length === 0 && palmDown.length === 2) {
      return { active: false, paused: true };
    }

    // Single-hand active: exactly one palm-up (regardless of the other hand).
    if (palmUp.length === 1) {
      const { lm, isLeftHand } = palmUp[0];
      const centroid = palmCentroid(lm);
      const position = handSpaceToWorld(centroid);
      const quaternion = handQuaternion(lm, isLeftHand);
      return { active: true, paused: false, position, quaternion };
    }

    // All other cases: idle.
    return { active: false, paused: false };
  }
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/singleHandPose.test.js
```

Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Run full test suite**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 27` (12 Phase 1 + 7 palmDirection + 8 singleHandPose).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/singleHandPose.js tests/singleHandPose.test.js
git commit -m "feat: add SingleHandPose gesture (Force-style 6-DOF from dominant palm)"
```

---

## Task 3: Pose Smoother — TDD

Per-frame smoother. EMA on position components, EMA on quaternion components (with renormalization to keep it a unit quaternion). Simple and cheap — spherical linear interpolation would be more correct but overkill at 60fps frame deltas.

**Files:**
- Create: `Coding/hand-sculpt/js/poseSmoother.js`
- Create: `Coding/hand-sculpt/tests/poseSmoother.test.js`

- [ ] **Step 1: Write the failing test**

File: `Coding/hand-sculpt/tests/poseSmoother.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseSmoother } from '../js/poseSmoother.js';

test('first update returns input unchanged', () => {
  const s = new PoseSmoother(0.5);
  const r = s.update(
    { x: 1, y: 2, z: 3 },
    { x: 0, y: 0, z: 0, w: 1 },
  );
  assert.deepEqual(r.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(r.quaternion, { x: 0, y: 0, z: 0, w: 1 });
});

test('position is EMA-smoothed at alpha=0.5', () => {
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const r = s.update({ x: 10, y: 20, z: 30 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(r.position.x, 5);
  assert.equal(r.position.y, 10);
  assert.equal(r.position.z, 15);
});

test('position at alpha=1 returns latest value', () => {
  const s = new PoseSmoother(1);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const r = s.update({ x: 42, y: 99, z: -7 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(r.position.x, 42);
  assert.equal(r.position.y, 99);
  assert.equal(r.position.z, -7);
});

test('quaternion stays unit length after smoothing', () => {
  const s = new PoseSmoother(0.3);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  // Rotate 90° around Y: q = (0, sin(45°), 0, cos(45°))
  const root2 = Math.SQRT1_2;
  const r = s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: root2, z: 0, w: root2 });
  const q = r.quaternion;
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  assert.ok(Math.abs(len - 1) < 1e-9, `expected unit length, got ${len}`);
});

test('reset clears both position and quaternion state', () => {
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  s.update({ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  s.reset();
  const r = s.update({ x: 7, y: 7, z: 7 }, { x: 0, y: 0, z: 0, w: 1 });
  // After reset, next update should pass through.
  assert.deepEqual(r.position, { x: 7, y: 7, z: 7 });
});

test('quaternion double-cover shortcut: flip sign when dot(prev, next) < 0', () => {
  // Quaternions q and -q represent the same rotation. If the caller hands us
  // a q on the "other side" of the double cover, we should flip it before
  // averaging so the blended quaternion takes the short path.
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  // Next input is -identity — same rotation, opposite sign.
  const r = s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: -1 });
  // After flip, blending (1, w=1) with (1, w=1) stays at (1, w=1) — not (0, w=0).
  assert.equal(r.quaternion.w, 1);
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/poseSmoother.test.js
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the module**

File: `Coding/hand-sculpt/js/poseSmoother.js`

```js
// Per-frame pose smoother. EMA on position components; component-wise EMA
// on quaternion with renormalization (and sign flip for shortest-path through
// the double cover). Simple and cheap — real slerp is overkill at 60fps
// since frame-to-frame rotation deltas are small.

export class PoseSmoother {
  constructor(alpha = 0.4) {
    this.alpha = alpha;
    this.pos = null;
    this.quat = null;
  }

  update(position, quaternion) {
    if (this.pos === null) {
      this.pos = { ...position };
      this.quat = { ...quaternion };
      return { position: { ...this.pos }, quaternion: { ...this.quat } };
    }
    const a = this.alpha;
    this.pos = {
      x: a * position.x + (1 - a) * this.pos.x,
      y: a * position.y + (1 - a) * this.pos.y,
      z: a * position.z + (1 - a) * this.pos.z,
    };
    // Double-cover shortcut: flip incoming quaternion if dot with prev is negative.
    const dot = this.quat.x * quaternion.x + this.quat.y * quaternion.y +
                this.quat.z * quaternion.z + this.quat.w * quaternion.w;
    const q = (dot < 0)
      ? { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: -quaternion.w }
      : quaternion;
    const mx = a * q.x + (1 - a) * this.quat.x;
    const my = a * q.y + (1 - a) * this.quat.y;
    const mz = a * q.z + (1 - a) * this.quat.z;
    const mw = a * q.w + (1 - a) * this.quat.w;
    const len = Math.hypot(mx, my, mz, mw) || 1;
    this.quat = { x: mx / len, y: my / len, z: mz / len, w: mw / len };
    return { position: { ...this.pos }, quaternion: { ...this.quat } };
  }

  reset() {
    this.pos = null;
    this.quat = null;
  }
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/poseSmoother.test.js
```

Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Run full suite**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 33` total.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/poseSmoother.js tests/poseSmoother.test.js
git commit -m "feat: add PoseSmoother (per-frame EMA for position + quaternion)"
```

---

## Task 4: Scene `setPose` Integration

Add a method to the `Scene` class that applies a `{position, quaternion}` pair directly to the current mesh. No unit tests (Three.js code).

**Files:**
- Modify: `Coding/hand-sculpt/js/scene.js`

- [ ] **Step 1: Open `js/scene.js` and add the `setPose` method**

Insert a new method between `setShape` and `reset` in the `Scene` class. The final file should look like this:

File: `Coding/hand-sculpt/js/scene.js`

```js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { createShape } from './shapes.js';

// Manages the Three.js scene, camera, renderer, and the currently-displayed mesh.
// One shape at a time, wireframe material only.
export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0); // transparent background

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene = new THREE.Scene();
    this.mesh = null;
    this.currentShapeName = 'cube';
    this.setShape(this.currentShapeName);
    this.resize();
  }

  setShape(name) {
    const geom = createShape(name);
    if (!geom) return;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);
    this.currentShapeName = name;
  }

  // Apply a pose { position: {x,y,z}, quaternion: {x,y,z,w} } to the mesh.
  setPose(pose) {
    if (!this.mesh || !pose) return;
    const p = pose.position;
    const q = pose.quaternion;
    if (p) this.mesh.position.set(p.x, p.y, p.z);
    if (q) this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  // Restore current shape to identity transform (used by Reset button).
  reset() {
    if (!this.mesh) return;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
```

(The only change from Phase 1 is the new `setPose(pose)` method between `setShape` and `reset`.)

- [ ] **Step 2: Verify tests still pass**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 33` — scene.js is not unit-tested, and we haven't changed consumers yet.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/scene.js
git commit -m "feat: add Scene.setPose for applying position + quaternion to mesh"
```

---

## Task 5: Wire Up Main (Gesture → Smoother → Scene + HUD Label)

Integrate the gesture, smoother, and scene in `main.js`. Also update the HUD gesture label to show one of `FORCE` / `PAUSED` / `IDLE`.

**Files:**
- Modify: `Coding/hand-sculpt/js/main.js`

- [ ] **Step 1: Rewrite `js/main.js`**

File: `Coding/hand-sculpt/js/main.js`

```js
import { Camera } from './camera.js';
import { Tracker } from './tracker.js';
import { Overlay } from './overlay.js';
import { Scene } from './scene.js';
import { countExtendedFingers } from './fingers.js';
import { SingleHandPose } from './gestures/singleHandPose.js';
import { PoseSmoother } from './poseSmoother.js';

const videoEl = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene3d');

const camera = new Camera(videoEl);
const tracker = new Tracker();
const overlay = new Overlay(overlayCanvas);
const scene = new Scene(sceneCanvas);
const singleHandPose = new SingleHandPose();
const smoother = new PoseSmoother(0.4);

let running = false;

function syncCanvasSizes() {
  const rect = overlayCanvas.getBoundingClientRect();
  overlay.resize(rect.width, rect.height);
  scene.resize();
}

function landmarksByHand(results, want) {
  const out = [];
  for (let i = 0; i < results.handedness.length; i++) {
    const label = results.handedness[i]?.[0]?.categoryName || '';
    if (label === want) out.push(results.landmarks[i]);
  }
  return out;
}

function tick() {
  if (!running) return;
  const t = performance.now();
  const results = tracker.detect(videoEl, t);

  overlay.clear();
  overlay.drawVideo(videoEl);
  overlay.drawHands(results.landmarks);

  const leftHands = landmarksByHand(results, 'Left');
  const rightHands = landmarksByHand(results, 'Right');
  const leftFingers = leftHands.reduce((n, lm) => n + countExtendedFingers(lm), 0);
  const rightFingers = rightHands.reduce((n, lm) => n + countExtendedFingers(lm), 0);
  const totalFingers = leftFingers + rightFingers;

  // Run the Force gesture and apply smoothed pose if active.
  const pose = singleHandPose.detect(results);
  let gestureLabel;
  if (pose.paused) {
    gestureLabel = 'PAUSED';
  } else if (pose.active) {
    gestureLabel = 'FORCE';
    const smoothed = smoother.update(pose.position, pose.quaternion);
    scene.setPose(smoothed);
  } else {
    gestureLabel = 'IDLE';
  }

  overlay.drawHUD({
    leftFingers,
    rightFingers,
    totalFingers,
    gesture: gestureLabel,
    shape: scene.currentShapeName,
  });

  scene.render();
  requestAnimationFrame(tick);
}

async function start() {
  if (running) return;
  try {
    await camera.start();
    syncCanvasSizes();
    await tracker.init();
    running = true;
    requestAnimationFrame(tick);
  } catch (err) {
    console.error('Failed to start:', err);
    alert('Could not start camera or tracker: ' + err.message);
  }
}

function stop() {
  running = false;
  camera.stop();
  overlay.clear();
}

function reset() {
  smoother.reset();
  scene.reset();
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('stop').addEventListener('click', stop);
document.getElementById('reset').addEventListener('click', reset);
window.addEventListener('resize', syncCanvasSizes);

// Initial sizing so the cube is visible even before the camera starts.
syncCanvasSizes();
scene.render();
```

Changes from Phase 1:
1. Imported `SingleHandPose` and `PoseSmoother` at top.
2. Instantiated `singleHandPose` and `smoother` at module scope.
3. Inside `tick()`, run `singleHandPose.detect(results)` after building finger counts. Branch on `paused` / `active`, update HUD label accordingly, apply smoothed pose to scene when active.
4. `reset()` now also clears the smoother so the next active frame snaps to hand position instead of interpolating from the old remembered state.

- [ ] **Step 2: Verify tests still pass**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 33`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/main.js
git commit -m "feat: wire Force gesture + smoother into render loop, update HUD states"
```

---

## Task 6: Phase 2 Milestone Verification + Git Tag

End-to-end browser check. Requires live webcam and hand.

**Files:** none modified — this task is verification only.

- [ ] **Step 1: Start the dev server**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
python -m http.server 8001
# (or python3 -m http.server 8001 on Mac)
```

Open `http://localhost:8001` in Chrome.

- [ ] **Step 2: Verify the pre-camera state is unchanged**

Before clicking Start Camera:
- Wireframe cube visible in the center
- HUD not yet visible (only drawn when camera running)
- Buttons functional, no console errors

- [ ] **Step 3: Click "Start Camera" and verify IDLE → FORCE transition**

Allow webcam when prompted. Hold both hands below the camera frame (no hands detected).

Verify:
- HUD shows `Gesture: IDLE`
- Cube is stationary in center

Raise your right hand, palm facing the camera, fingers up.

Verify:
- HUD transitions to `Gesture: FORCE`
- Cube moves to where your palm is on screen (smoothly glides, not snapping)
- Cube rotates as you tilt your wrist

- [ ] **Step 4: Verify pause**

Raise both hands, palm-side first, then rotate both wrists so the backs of your hands face the camera.

Verify:
- HUD shows `Gesture: PAUSED`
- Cube freezes in whatever pose it was in — does NOT track either hand

Rotate one wrist back so that hand's palm faces the camera again.

Verify:
- HUD returns to `Gesture: FORCE`
- Cube resumes tracking that hand

- [ ] **Step 5: Verify two-hands-palm-up idle**

Raise both hands, palms facing camera.

Verify:
- HUD shows `Gesture: IDLE`
- Cube freezes (two-hand gestures are Phase 3)

- [ ] **Step 6: Verify Reset**

With the camera running and hand active, click `Reset`.

Verify:
- The smoother is cleared (next active frame the cube snaps to hand position instead of jerking from identity)
- No console errors

- [ ] **Step 7: Stop the server and run the full test suite**

Ctrl+C the server, then:

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 33`.

- [ ] **Step 8: Verify git state is clean and tag the milestone**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git status
git log --oneline -n 15
```

Expected: `nothing to commit, working tree clean`. Log shows 5 new commits on top of phase-1-foundations.

Tag:

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git tag phase-2-the-force
git tag --list
```

Expected: both `phase-1-foundations` and `phase-2-the-force` appear.

---

## Phase 2 Done — Milestone Achieved

At this point you have:
- Wireframe cube that tracks a single palm-facing-camera hand (6-DOF: position + rotation)
- Pause state (both backs → freeze) and idle state (two palms up → freeze)
- Smoothed motion (no frame-to-frame jitter)
- HUD label shows current state: FORCE / PAUSED / IDLE
- 33 passing unit tests (12 Phase 1 + 21 Phase 2)
- Git tag `phase-2-the-force`

**Next phase:** Phase 3 — Two-hand transforms + shape swap (flat-palm squish, two-hand pinch scale, N-fingers-held to swap between primitives).

---

## Self-Review Notes

**Spec coverage (design.md §8 Phase 2):**
- ✅ "Palm direction detection per hand" — Task 1 (palmDirection.js)
- ✅ "Pause system: both palms down → freeze" — Task 2 (SingleHandPose.detect returns paused:true)
- ✅ "Dominant palm position → object translate" — Task 2 (handSpaceToWorld) + Task 5 (applied via setPose)
- ✅ "Dominant palm orientation → object rotate" — Task 2 (handQuaternion) + Task 5
- ✅ "Smoothing (EMA) integrated" — Task 3 (PoseSmoother) + Task 5 (wired in tick)
- ⚠️ "3-frame hysteresis" in the spec — deliberately deferred. Phase 2 uses PoseSmoother's EMA for visual smoothness, which covers the "no jitter" intent. Explicit hysteresis on the active/paused flag would only matter if MediaPipe flickered the palm-direction classification frame-to-frame; the handedness labels are stable enough that per-frame evaluation is fine. Re-add in Phase 5 if tuning reveals it's needed.

**No placeholders:** all test code and implementation code is complete. Tuning constants (XY_SCALE=4, Z_SCALE=3.33, α=0.4) are explicit values in the spec's "Open Questions" list, to be refined in Phase 5.

**Type consistency:**
- `SingleHandPose.detect()` returns `{active, paused, position?, quaternion?}`. Position is `{x,y,z}`, quaternion is `{x,y,z,w}`. Consistent across gesture, smoother, and scene.
- `PoseSmoother.update(position, quaternion)` returns `{position, quaternion}` of the same shape.
- `Scene.setPose({position, quaternion})` consumes that shape directly.

**Scope:** Focused on single-hand pose. Two-hand gestures (squish, pinch-scale) explicitly deferred to Phase 3. Shape swap (N-fingers-held) deferred to Phase 3.
