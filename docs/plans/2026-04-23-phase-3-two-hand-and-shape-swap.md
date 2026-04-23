# hand-sculpt Phase 3 — Two-Hand Transforms + Shape Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three gestures — two-hand pinch (uniform scale), flat-palm squish (non-uniform scale along dominant world axis), and N-fingers-held (shape swap between the 5 primitives). Integrate them with Phase 2's Force gesture via clear priority.

**Architecture:** Each gesture is its own pluggable module under `js/gestures/` with a `detect(results, ...context)` method returning `{active, ...params}`. Main.js coordinates priority: pause > two-hand scale > squish > Force. Shape swap runs orthogonally (independent, fires a one-shot event). Scene gains a `setScale({x,y,z})` method for non-uniform scale.

**Tech Stack:** Unchanged from Phase 2. No new dependencies.

**Phase 3 milestone:** "I can stretch, squish, scale with two hands, swap shapes with finger counts."

---

## File Structure

New:
- `js/gestures/pinchDetect.js` — pure utilities: `isPinched(lm)`, `pinchPoint(lm)`
- `js/gestures/fingerCountHold.js` — `FingerCountHold` class: fires shape-swap event when a single palm-DOWN hand holds N fingers for K frames
- `js/gestures/twoHandPinchScale.js` — `TwoHandPinchScale` class: uniform scale from both-hands-pinched
- `js/gestures/flatPalmSquish.js` — `FlatPalmSquish` class: non-uniform scale along dominant world axis from both-flat-palms-facing-each-other
- `tests/pinchDetect.test.js`
- `tests/fingerCountHold.test.js`
- `tests/twoHandPinchScale.test.js`
- `tests/flatPalmSquish.test.js`

Modified:
- `js/scene.js` — add `setScale({x,y,z})` method
- `js/main.js` — instantiate the 3 new gesture objects; coordinate priority in `tick()`; update HUD gesture label to include `PINCH-SCALE` / `SQUISH-X` / `SQUISH-Y` / `SQUISH-Z`; handle shape-swap events

---

## Gesture Priority (documented once, referenced by main.js)

```
1. PAUSED (both palms back)         → freeze everything
2. PINCH-SCALE (both pinched)       → only update scale (uniform)
3. SQUISH-{X|Y|Z} (both flat palms) → only update scale on dominant axis
4. FORCE (single palm-up)           → update position + rotation
5. IDLE                              → no updates
```

Shape swap (N-fingers held) runs in parallel with any of the above EXCEPT PAUSED. Fires once when count holds for ~30 frames on a palm-DOWN hand.

---

## Task 1: Pinch Detection Utilities — TDD

Pure functions: `isPinched(landmarks, threshold?)` and `pinchPoint(landmarks)`.

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/pinchDetect.js`
- Create: `Coding/hand-sculpt/tests/pinchDetect.test.js`

- [ ] **Step 1: Write the failing test**

File: `tests/pinchDetect.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPinched, pinchPoint } from '../js/gestures/pinchDetect.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

test('isPinched: thumb tip and index tip close together → true', () => {
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.51, 0.51, 0] });
  assert.equal(isPinched(lm), true);
});

test('isPinched: thumb tip and index tip far apart → false', () => {
  const lm = makeLandmarks({ 4: [0.3, 0.3, 0], 8: [0.7, 0.7, 0] });
  assert.equal(isPinched(lm), false);
});

test('isPinched: exactly at default threshold → false (strict)', () => {
  // Default threshold is 0.05. Distance exactly 0.05 should not count as pinched.
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.55, 0.5, 0] });
  assert.equal(isPinched(lm), false);
});

test('isPinched: custom threshold', () => {
  const lm = makeLandmarks({ 4: [0.5, 0.5, 0], 8: [0.6, 0.5, 0] });
  assert.equal(isPinched(lm, 0.05), false);
  assert.equal(isPinched(lm, 0.2), true);
});

test('isPinched: null / short input → false', () => {
  assert.equal(isPinched(null), false);
  assert.equal(isPinched([]), false);
  assert.equal(isPinched(new Array(10).fill({ x: 0, y: 0, z: 0 })), false);
});

test('pinchPoint: midpoint of thumb tip and index tip', () => {
  const lm = makeLandmarks({ 4: [0.4, 0.6, -0.02], 8: [0.6, 0.4, 0.02] });
  const p = pinchPoint(lm);
  assert.equal(p.x, 0.5);
  assert.equal(p.y, 0.5);
  assert.equal(p.z, 0);
});
```

- [ ] **Step 2: Run — expect fail (ERR_MODULE_NOT_FOUND)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/pinchDetect.test.js
```

- [ ] **Step 3: Implement**

File: `js/gestures/pinchDetect.js`

```js
// Pinch detection: thumb tip (landmark 4) and index tip (landmark 8) within threshold.

export function isPinched(landmarks, threshold = 0.05) {
  if (!landmarks || landmarks.length < 21) return false;
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dx = thumb.x - index.x;
  const dy = thumb.y - index.y;
  const dz = thumb.z - index.z;
  return Math.hypot(dx, dy, dz) < threshold;
}

export function pinchPoint(landmarks) {
  if (!landmarks || landmarks.length < 21) return { x: 0, y: 0, z: 0 };
  const thumb = landmarks[4];
  const index = landmarks[8];
  return {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
    z: (thumb.z + index.z) / 2,
  };
}
```

- [ ] **Step 4: Run — expect pass (6/6)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/pinchDetect.test.js
```

- [ ] **Step 5: Full suite — expect 39 passing**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/pinchDetect.js tests/pinchDetect.test.js
git commit -m "feat: add pinch detection utilities (isPinched, pinchPoint)"
```

---

## Task 2: FingerCountHold — TDD

Stateful gesture. Fires a one-shot shape-swap event when a single palm-DOWN hand holds N fingers (1-5) for 30 consecutive frames (~1 second at 30fps).

Why palm-DOWN? Palm-UP activates Force (position tracking) — we don't want the hand that's controlling the cube to also trigger shape swaps from its finger count. Palm-DOWN has no other gesture attached, so it's a clean "command mode."

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/fingerCountHold.js`
- Create: `Coding/hand-sculpt/tests/fingerCountHold.test.js`

- [ ] **Step 1: Write failing test**

File: `tests/fingerCountHold.test.js`

```js
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

// Palm-DOWN right hand with N fingers extended (varies by N).
// Back of right hand facing camera: thumb on image LEFT side (away from body), pinky on image RIGHT.
// For back-facing hand, image-native: wrist at (0.3, 0.9), index MCP at (0.25, 0.65) (z positive, away from camera).
// Fingers extended: tips point up, far from wrist.

function palmDownRightHand(fingerBits) {
  // fingerBits: [thumb, index, middle, ring, pinky] booleans
  const lm = makeLandmarks({
    0:  [0.3, 0.9, 0],
    // MCPs — palm-DOWN positions (back of hand facing camera, x is mirrored from palm-out):
    5:  [0.25, 0.65, 0.01],
    9:  [0.3, 0.6, 0.015],
    13: [0.32, 0.63, 0.015],
    17: [0.35, 0.7, 0.01],
  });
  // Thumb: tip vs IP (landmark 3) — extended when tip far from wrist, curled when close.
  lm[3] = { x: 0.27, y: 0.83, z: 0 }; // IP
  lm[4] = fingerBits[0] ? { x: 0.22, y: 0.72, z: 0 } : { x: 0.29, y: 0.85, z: 0 };
  // Index: tip 8 vs PIP 6. PIP always mid-height.
  lm[6] = { x: 0.26, y: 0.45, z: 0 };
  lm[8] = fingerBits[1] ? { x: 0.26, y: 0.1, z: 0 } : { x: 0.29, y: 0.7, z: 0 };
  // Middle
  lm[10] = { x: 0.3, y: 0.4, z: 0 };
  lm[12] = fingerBits[2] ? { x: 0.3, y: 0.05, z: 0 } : { x: 0.3, y: 0.68, z: 0 };
  // Ring
  lm[14] = { x: 0.33, y: 0.43, z: 0 };
  lm[16] = fingerBits[3] ? { x: 0.34, y: 0.1, z: 0 } : { x: 0.32, y: 0.7, z: 0 };
  // Pinky
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
  const lm = palmDownRightHand([false, true, true, false, false]); // peace
  // First two frames: not fired yet.
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  assert.equal(g.detect(resultsOneHand(lm)).fired, null);
  // Third frame: hold count reaches threshold, fires N=2.
  assert.equal(g.detect(resultsOneHand(lm)).fired, 2);
});

test('does not fire again while count stays same (one-shot per change)', () => {
  const g = new FingerCountHold(3);
  const lm = palmDownRightHand([false, true, true, false, false]);
  g.detect(resultsOneHand(lm));
  g.detect(resultsOneHand(lm));
  g.detect(resultsOneHand(lm)); // fires
  assert.equal(g.detect(resultsOneHand(lm)).fired, null); // still same count, no fire
});

test('does not fire when palm is UP (Force territory)', () => {
  const g = new FingerCountHold(3);
  // Palm-OUT right hand, 2 fingers extended.
  const lm = makeLandmarks({
    0:  [0.3, 0.9, 0],
    3:  [0.35, 0.83, 0],  4:  [0.37, 0.85, 0], // thumb curled (palm-out orientation)
    5:  [0.35, 0.65, -0.01], 6: [0.36, 0.45, 0], 8: [0.37, 0.1, 0],   // index up
    9:  [0.3, 0.6, -0.015],  10: [0.3, 0.4, 0], 12: [0.3, 0.05, 0],   // middle up
    13: [0.28, 0.63, -0.015], 14: [0.28, 0.58, 0], 16: [0.28, 0.72, 0], // ring curled
    17: [0.25, 0.7, -0.01],  18: [0.25, 0.58, 0], 20: [0.25, 0.72, 0], // pinky curled
  });
  for (let i = 0; i < 10; i++) {
    const r = g.detect(resultsOneHand(lm, 'Right'));
    assert.equal(r.fired, null);
  }
});

test('does not fire with zero or more than one hand visible', () => {
  const g = new FingerCountHold(3);
  const lm = palmDownRightHand([false, true, true, false, false]);
  // No hands.
  for (let i = 0; i < 10; i++) {
    assert.equal(g.detect({ landmarks: [], handedness: [] }).fired, null);
  }
  // Two hands.
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
  const lm2 = palmDownRightHand([false, true, true, false, false]);  // 2
  const lm3 = palmDownRightHand([false, true, true, true, false]);    // 3
  g.detect(resultsOneHand(lm2));
  g.detect(resultsOneHand(lm2));
  g.detect(resultsOneHand(lm2)); // fires 2
  // Change to 3 — counter resets, not fired yet.
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
```

- [ ] **Step 2: Run — expect fail**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/fingerCountHold.test.js
```

- [ ] **Step 3: Implement**

File: `js/gestures/fingerCountHold.js`

```js
import { countExtendedFingers } from '../fingers.js';
import { palmFacesCamera } from './palmDirection.js';

// Fires once when a single palm-DOWN hand holds 1..5 extended fingers
// for `holdFrames` consecutive frames.
// Palm-DOWN requirement prevents collision with the palm-UP Force gesture.

export class FingerCountHold {
  constructor(holdFrames = 30) {
    this.holdFrames = holdFrames;
    this.currentCount = -1;
    this.counter = 0;
    this.fired = false;
  }

  detect(results) {
    if (!results || !results.landmarks || results.landmarks.length !== 1) {
      this._reset();
      return { fired: null };
    }
    const lm = results.landmarks[0];
    const side = results.handedness[0]?.[0]?.categoryName;
    if (side !== 'Left' && side !== 'Right') {
      this._reset();
      return { fired: null };
    }
    const isLeft = side === 'Left';
    if (palmFacesCamera(lm, isLeft)) {
      this._reset();
      return { fired: null };
    }
    const n = countExtendedFingers(lm);
    if (n !== this.currentCount) {
      this.currentCount = n;
      this.counter = 1;
      this.fired = false;
    } else {
      this.counter++;
    }
    if (!this.fired && this.counter >= this.holdFrames && n >= 1 && n <= 5) {
      this.fired = true;
      return { fired: n };
    }
    return { fired: null };
  }

  _reset() {
    this.currentCount = -1;
    this.counter = 0;
    this.fired = false;
  }
}
```

- [ ] **Step 4: Run — expect pass (6/6)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/fingerCountHold.test.js
```

- [ ] **Step 5: Full suite — expect 45**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/fingerCountHold.js tests/fingerCountHold.test.js
git commit -m "feat: add FingerCountHold gesture (N fingers, palm-down, held 1s → shape swap)"
```

---

## Task 3: TwoHandPinchScale — TDD

Stateful. Activates when both hands are pinched; captures baseline pinch-distance and object scale on activation; outputs uniform scale as `baseline_scale * (current_distance / baseline_distance)`. Resets when pinch releases.

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/twoHandPinchScale.js`
- Create: `Coding/hand-sculpt/tests/twoHandPinchScale.test.js`

- [ ] **Step 1: Write failing test**

File: `tests/twoHandPinchScale.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoHandPinchScale } from '../js/gestures/twoHandPinchScale.js';

function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: z ?? 0 };
  }
  return base;
}

// Pinched hand: thumb tip and index tip close. Place them at a given (x, y) center.
function pinchedHand(cx, cy) {
  return makeLandmarks({
    4: [cx + 0.005, cy, 0],  // thumb tip
    8: [cx - 0.005, cy, 0],  // index tip
  });
}

function resultsTwoHands(lm0, lm1) {
  return {
    landmarks: [lm0, lm1],
    handedness: [
      [{ categoryName: 'Right', score: 0.9 }],
      [{ categoryName: 'Left', score: 0.9 }],
    ],
  };
}

test('inactive when zero or one hand visible', () => {
  const g = new TwoHandPinchScale();
  assert.equal(g.detect({ landmarks: [], handedness: [] }, { x:1, y:1, z:1 }).active, false);
  const one = { landmarks: [pinchedHand(0.3, 0.5)], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
  assert.equal(g.detect(one, { x:1, y:1, z:1 }).active, false);
});

test('inactive when either hand is not pinched', () => {
  const g = new TwoHandPinchScale();
  // First hand pinched, second not.
  const lm0 = pinchedHand(0.3, 0.5);
  const lm1 = makeLandmarks({ 4: [0.7, 0.5, 0], 8: [0.8, 0.5, 0] }); // far apart → not pinched
  assert.equal(g.detect(resultsTwoHands(lm0, lm1), { x:1, y:1, z:1 }).active, false);
});

test('active when both hands pinched; captures baseline, returns baseline scale on first frame', () => {
  const g = new TwoHandPinchScale();
  const lm0 = pinchedHand(0.3, 0.5);
  const lm1 = pinchedHand(0.7, 0.5);
  const r = g.detect(resultsTwoHands(lm0, lm1), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  // First frame: ratio = 1, scale unchanged.
  assert.ok(Math.abs(r.scale.x - 1) < 1e-9);
  assert.ok(Math.abs(r.scale.y - 1) < 1e-9);
  assert.ok(Math.abs(r.scale.z - 1) < 1e-9);
});

test('scale grows as hands move apart', () => {
  const g = new TwoHandPinchScale();
  // Activation frame: hands 0.4 apart in image x (world x: -0.8, world: (0.5-0.3)*4 etc.)
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  // Next frame: hands are twice as far apart in image x.
  const r = g.detect(resultsTwoHands(pinchedHand(0.1, 0.5), pinchedHand(0.9, 0.5)), { x: 1, y: 1, z: 1 });
  // Baseline world distance: |(-0.8) - (-(-0.8))| wait let me compute:
  // pinchPoint(lm0) is (0.3, 0.5, 0). handSpaceToWorld: x = -(0.3 - 0.5) * 4 = 0.8, y = 0, z = 0.
  // pinchPoint(lm1) is (0.7, 0.5, 0). world x = -(0.7 - 0.5) * 4 = -0.8, y = 0, z = 0.
  // Baseline distance = |0.8 - (-0.8)| = 1.6.
  // Current frame: lm0 at 0.1 → world x = 1.6; lm1 at 0.9 → world x = -1.6. Distance 3.2.
  // Ratio = 2. Scale x/y/z = 2.
  assert.ok(Math.abs(r.scale.x - 2) < 1e-6);
  assert.ok(Math.abs(r.scale.y - 2) < 1e-6);
  assert.ok(Math.abs(r.scale.z - 2) < 1e-6);
});

test('reset() clears baseline', () => {
  const g = new TwoHandPinchScale();
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  g.reset();
  // After reset + new activation at wider hands, ratio starts at 1.
  const r = g.detect(resultsTwoHands(pinchedHand(0.1, 0.5), pinchedHand(0.9, 0.5)), { x: 2, y: 2, z: 2 });
  assert.equal(r.active, true);
  assert.ok(Math.abs(r.scale.x - 2) < 1e-9);
  assert.ok(Math.abs(r.scale.y - 2) < 1e-9);
});

test('auto-resets when hands release pinch', () => {
  const g = new TwoHandPinchScale();
  // Activate at distance baseline.
  g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 1, y: 1, z: 1 });
  // Release (both hands not pinched).
  const lm0 = makeLandmarks({ 4: [0.3, 0.5, 0], 8: [0.35, 0.5, 0] }); // not pinched
  const lm1 = makeLandmarks({ 4: [0.7, 0.5, 0], 8: [0.75, 0.5, 0] });
  assert.equal(g.detect(resultsTwoHands(lm0, lm1), { x: 5, y: 5, z: 5 }).active, false);
  // Re-activate with a fresh baseline using current (larger) scale.
  const r = g.detect(resultsTwoHands(pinchedHand(0.3, 0.5), pinchedHand(0.7, 0.5)), { x: 5, y: 5, z: 5 });
  assert.equal(r.active, true);
  assert.ok(Math.abs(r.scale.x - 5) < 1e-9); // fresh baseline, ratio 1
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/twoHandPinchScale.test.js
```

- [ ] **Step 3: Implement**

File: `js/gestures/twoHandPinchScale.js`

```js
import { isPinched, pinchPoint } from './pinchDetect.js';
import { handSpaceToWorld } from './singleHandPose.js';

// Two-hand pinch → uniform scale. Captures baseline distance and object scale
// on the activation frame; subsequent frames scale by ratio.
// Auto-resets when either hand releases pinch.

export class TwoHandPinchScale {
  constructor() {
    this.baselineDistance = null;
    this.baselineScale = null;
  }

  detect(results, currentScale) {
    if (!results || !results.landmarks || results.landmarks.length !== 2) {
      this.reset();
      return { active: false };
    }
    const lm0 = results.landmarks[0];
    const lm1 = results.landmarks[1];
    if (!isPinched(lm0) || !isPinched(lm1)) {
      this.reset();
      return { active: false };
    }
    const p0 = handSpaceToWorld(pinchPoint(lm0));
    const p1 = handSpaceToWorld(pinchPoint(lm1));
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    if (this.baselineDistance === null || this.baselineDistance === 0) {
      this.baselineDistance = d || 1e-6;
      this.baselineScale = { ...currentScale };
    }
    const ratio = d / this.baselineDistance;
    return {
      active: true,
      scale: {
        x: this.baselineScale.x * ratio,
        y: this.baselineScale.y * ratio,
        z: this.baselineScale.z * ratio,
      },
    };
  }

  reset() {
    this.baselineDistance = null;
    this.baselineScale = null;
  }
}
```

- [ ] **Step 4: Run — expect pass (6/6)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/twoHandPinchScale.test.js
```

- [ ] **Step 5: Full suite — expect 51**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/twoHandPinchScale.js tests/twoHandPinchScale.test.js
git commit -m "feat: add TwoHandPinchScale gesture (uniform scale from both-hands-pinched)"
```

---

## Task 4: FlatPalmSquish — TDD

Stateful. Active when both hands are flat (≥4 extended fingers) AND their palm normals are antiparallel (palms face each other; world-space dot ≤ -0.3). Snaps to dominant world axis (x/y/z whichever component of the hand-to-hand vector is largest). Applies non-uniform scale to that axis only.

**Files:**
- Create: `Coding/hand-sculpt/js/gestures/flatPalmSquish.js`
- Create: `Coding/hand-sculpt/tests/flatPalmSquish.test.js`

- [ ] **Step 1: Write failing test**

File: `tests/flatPalmSquish.test.js`

```js
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

// Flat right hand, palm facing to the user's LEFT (so palm normal points toward the left hand).
// Fingers pointing up. Wrist at (wx, 0.9). Placed so palm faces +x in image (= -x in world, via flipToWorld).
// For a right hand with palm facing LEFT (in world, palm pointing toward -x): in image, the hand is seen from the side,
// so we simplify: just satisfy palmFacesCamera=false (palm does NOT face camera) but normal points toward other hand.
//
// Simpler test construction: we synthesize landmark fixtures such that palm normals compute to specific world vectors.
// For right hand where we want world-palm-normal pointing +X:
//   hand raw normal (isLeftHand=false so no sign flip) = (+X, 0, 0) in MediaPipe coords
//   flipToWorld(n) = (-n.x, -n.y, -n.z) = (-X, 0, 0) in world
//   Wait — we want world-palm-normal pointing +X. So hand raw normal must be (-X, 0, 0) in MediaPipe.
// 
// palmNormal = normalize((indexMCP - wrist) × (pinkyMCP - wrist)). Skipping manual fixture math —
// we use minimal tests that assert gesture state transitions, not exact normal values.

// Two flat RIGHT-ish and LEFT-ish hands positioned so they face each other in world X.
// We provide extended fingers (tip far from wrist for all 5) for the flat check, and
// specific wrist/MCP layouts so the palm normal comparison works.

function flatHandFacing({ wx, palmToward = 'right', isLeftHand = false }) {
  // Build a hand where all 5 fingers are extended (flat) and palm normal points +X or -X in world.
  // We'll place MCPs so the cross product produces a normal on the desired axis.
  // Keep it symmetric and simple.
  const lm = makeLandmarks({
    0:  [wx, 0.9, 0],
  });
  // For palmToward='right' (world +X), we want world normal (+1, 0, 0) → hand normal (-1, 0, 0) (after isLeftHand sign flip).
  // Easiest construction: place index MCP above wrist, pinky MCP forward (+z hand), so cross points in hand -X.
  // indexMCP - wrist = (0, -0.25, 0)  (above wrist, up=y decreases in MediaPipe)
  // pinkyMCP - wrist = (0, -0.2, -0.05)  (above wrist + closer to camera)
  // cross = ((-0.25)(-0.05) - 0, 0 - 0*(-0.05), 0 - (-0.25)*0) = (0.0125, 0, 0)
  // After isLeftHand flip = depends. Let me set both hands to isLeftHand=false and build the fixtures to get the right world-space normal directly.
  //
  // Actually this is over-engineered. For unit tests we'll mock the gesture INPUT data structure
  // and trust the gesture's internal math. We'll focus on activation logic and scale output via
  // direct, hand-made fixtures.
  lm[5]  = { x: wx, y: 0.65, z: palmToward === 'right' ? 0 : 0 };
  lm[9]  = { x: wx, y: 0.6, z: palmToward === 'right' ? -0.05 : 0.05 };
  lm[13] = { x: wx, y: 0.63, z: palmToward === 'right' ? -0.05 : 0.05 };
  lm[17] = { x: wx, y: 0.7, z: palmToward === 'right' ? -0.05 : 0.05 };
  // Extended fingers: tips far from wrist.
  lm[3]  = { x: wx - 0.02, y: 0.75, z: 0 }; lm[4]  = { x: wx - 0.05, y: 0.55, z: 0 };
  lm[6]  = { x: wx, y: 0.4, z: 0 };         lm[8]  = { x: wx, y: 0.1, z: 0 };
  lm[10] = { x: wx, y: 0.4, z: 0 };         lm[12] = { x: wx, y: 0.05, z: 0 };
  lm[14] = { x: wx, y: 0.43, z: 0 };        lm[16] = { x: wx, y: 0.1, z: 0 };
  lm[18] = { x: wx, y: 0.5, z: 0 };         lm[20] = { x: wx, y: 0.3, z: 0 };
  return { lm, isLeftHand };
}

function twoFlatHandsFacing() {
  // Hand 0 on left side of image (user's right hand), palm pointing world +X (toward the other hand).
  // Hand 1 on right side of image (user's left hand), palm pointing world -X.
  // Construct them symmetrically so dot(normal0_world, normal1_world) ≈ -1.
  const h0 = makeLandmarks({
    0:  [0.3, 0.6, 0],
    // Palm normal built from v1=(indexMCP-wrist), v2=(pinkyMCP-wrist).
    // For world normal pointing +X after flipToWorld, hand-space normal must point -X.
    // If v1 = (0, -0.2, -0.05) (above, toward camera) and v2 = (0, -0.2, 0.05) (above, away):
    //   cross = v1.y*v2.z - v1.z*v2.y, ... = ((-0.2)(0.05)-(-0.05)(-0.2), (-0.05)(0)-(0)(0.05), (0)(-0.2)-(-0.2)(0))
    //         = (-0.01 - 0.01, 0, 0) = (-0.02, 0, 0)
    //   hand-space normal after normalize = (-1, 0, 0)
    //   isLeftHand=false → no flip → (-1, 0, 0)
    //   flipToWorld = (1, 0, 0) — yes, world +X. ✓
    5:  [0.3, 0.4, -0.05],   // index MCP
    9:  [0.3, 0.4, 0],       // middle MCP
    13: [0.3, 0.4, 0.02],    // ring MCP
    17: [0.3, 0.4, 0.05],    // pinky MCP
    // All 5 fingers extended (tips far from wrist):
    3:  [0.28, 0.55, 0],     4:  [0.25, 0.4, 0],     // thumb
    6:  [0.3, 0.25, -0.05],  8:  [0.3, 0.1, -0.05],  // index
    10: [0.3, 0.25, 0],      12: [0.3, 0.05, 0],     // middle
    14: [0.3, 0.25, 0.02],   16: [0.3, 0.1, 0.02],   // ring
    18: [0.3, 0.3, 0.05],    20: [0.3, 0.2, 0.05],   // pinky
  });
  // Hand 1: mirror construction. For world normal -X, hand normal = +X, isLeftHand=true (flip → -X...) wait:
  //   isLeftHand=true → negate hand cross → hand normal becomes (+X).
  //   flipToWorld(+X) = (-X) → world -X. ✓
  // v1 (indexMCP-wrist) = (0, -0.2, 0.05), v2 (pinkyMCP-wrist) = (0, -0.2, -0.05).
  //   cross nx = (-0.2)(-0.05) - (0.05)(-0.2) = 0.01 - (-0.01) = 0.02
  //   After isLeftHand flip: nx = -0.02 → normalize to (-1, 0, 0)
  //   flipToWorld = (+1, 0, 0)... hmm that's world +X, not what we want.
  //
  // Let me flip the z signs on hand 1's MCPs:
  //   5 at (0.7, 0.4, +0.05), 17 at (0.7, 0.4, -0.05).
  //   v1 = (0, -0.2, +0.05), v2 = (0, -0.2, -0.05)
  //   nx = (-0.2)(-0.05) - (+0.05)(-0.2) = 0.01 + 0.01 = 0.02
  //   isLeftHand=true → nx = -0.02 → norm (-1, 0, 0)
  //   flipToWorld → (+1, 0, 0)
  //   Hmm still world +X. That means both hands' normals point world +X, dot = +1, not antiparallel.
  //
  // Flip z signs on hand 1 again:
  //   5 at (0.7, 0.4, -0.05), 17 at (0.7, 0.4, +0.05) [same as hand 0]. Then nx ≈ -0.02, isLeftHand flip → +0.02, norm (+1,0,0), world = (-1,0,0). That's what we want.
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
      [{ categoryName: 'Right', score: 0.9 }],   // User's right = image left = h0
      [{ categoryName: 'Left', score: 0.9 }],    // User's left = image right = h1
    ],
  };
}

test('activates when both palms flat and facing each other', () => {
  const g = new FlatPalmSquish();
  const r = g.detect(twoFlatHandsFacing(), { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.ok(['x', 'y', 'z'].includes(r.axis), `axis should be x/y/z, got ${r.axis}`);
  // Baseline frame: scale unchanged.
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
  // Both hands with palms toward camera: dot of normals ≈ +1 (parallel), not antiparallel.
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
  // First frame: activation.
  g.detect(twoFlatHandsFacing(), { x: 1, y: 1, z: 1 });
  // Second frame: move the hands farther apart in image x (farther world distance).
  const wider = twoFlatHandsFacing();
  // Translate hand 0 to the left and hand 1 to the right.
  for (const p of wider.landmarks[0]) p.x -= 0.1;
  for (const p of wider.landmarks[1]) p.x += 0.1;
  const r = g.detect(wider, { x: 1, y: 1, z: 1 });
  assert.equal(r.active, true);
  assert.equal(r.axis, 'x');
  // Scale X should have grown; Y and Z unchanged from the provided current scale (1).
  assert.ok(r.scale.x > 1, `expected scale.x > 1, got ${r.scale.x}`);
  assert.equal(r.scale.y, 1);
  assert.equal(r.scale.z, 1);
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/flatPalmSquish.test.js
```

- [ ] **Step 3: Implement**

File: `js/gestures/flatPalmSquish.js`

```js
import { palmNormal } from './palmDirection.js';
import { palmCentroid, handSpaceToWorld } from './singleHandPose.js';
import { countExtendedFingers } from '../fingers.js';

// Both palms flat (≥4 fingers extended) + palm normals antiparallel (facing each other).
// Non-uniform scale along the dominant world axis of the hand-to-hand vector.

const FLAT_FINGER_MIN = 4;
const PALM_DOT_MAX = -0.3; // dot <= -0.3 → antiparallel enough

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function flipToWorld(v) {
  return { x: -v.x, y: -v.y, z: -v.z };
}

function dominantAxis(vec) {
  const ax = Math.abs(vec.x);
  const ay = Math.abs(vec.y);
  const az = Math.abs(vec.z);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= az) return 'y';
  return 'z';
}

export class FlatPalmSquish {
  constructor() {
    this.baselineDistance = null;
    this.baselineScaleAxis = null;
    this.axis = null;
  }

  detect(results, currentScale) {
    if (!results || !results.landmarks || results.landmarks.length !== 2) {
      this.reset();
      return { active: false };
    }
    const lm0 = results.landmarks[0];
    const lm1 = results.landmarks[1];
    const hand0IsLeft = results.handedness[0]?.[0]?.categoryName === 'Left';
    const hand1IsLeft = results.handedness[1]?.[0]?.categoryName === 'Left';

    if (countExtendedFingers(lm0) < FLAT_FINGER_MIN || countExtendedFingers(lm1) < FLAT_FINGER_MIN) {
      this.reset();
      return { active: false };
    }
    const n0Hand = palmNormal(lm0, hand0IsLeft);
    const n1Hand = palmNormal(lm1, hand1IsLeft);
    const n0World = flipToWorld(n0Hand);
    const n1World = flipToWorld(n1Hand);
    if (dot(n0World, n1World) > PALM_DOT_MAX) {
      this.reset();
      return { active: false };
    }
    const c0 = handSpaceToWorld(palmCentroid(lm0));
    const c1 = handSpaceToWorld(palmCentroid(lm1));
    const vec = { x: c1.x - c0.x, y: c1.y - c0.y, z: c1.z - c0.z };
    const d = Math.hypot(vec.x, vec.y, vec.z);
    if (this.baselineDistance === null || this.baselineDistance === 0) {
      this.baselineDistance = d || 1e-6;
      this.axis = dominantAxis(vec);
      this.baselineScaleAxis = currentScale[this.axis];
    }
    const ratio = d / this.baselineDistance;
    const newScale = { x: currentScale.x, y: currentScale.y, z: currentScale.z };
    newScale[this.axis] = this.baselineScaleAxis * ratio;
    return { active: true, scale: newScale, axis: this.axis };
  }

  reset() {
    this.baselineDistance = null;
    this.baselineScaleAxis = null;
    this.axis = null;
  }
}
```

- [ ] **Step 4: Run — expect pass (5/5)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
node --test tests/flatPalmSquish.test.js
```

- [ ] **Step 5: Full suite — expect 56**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/gestures/flatPalmSquish.js tests/flatPalmSquish.test.js
git commit -m "feat: add FlatPalmSquish gesture (axis-snapped non-uniform scale)"
```

---

## Task 5: Scene `setScale` Method

**Files:**
- Modify: `Coding/hand-sculpt/js/scene.js`

- [ ] **Step 1: Add `setScale` method to the `Scene` class**

In `js/scene.js`, immediately after the `setPose` method (before `reset`), insert:

```js
  // Apply a scale { x, y, z } (non-uniform allowed) to the mesh.
  setScale(scale) {
    if (!this.mesh || !scale) return;
    this.mesh.scale.set(scale.x, scale.y, scale.z);
  }

```

- [ ] **Step 2: Tests still pass (56/56)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/scene.js
git commit -m "feat: add Scene.setScale for non-uniform scale"
```

---

## Task 6: Main.js Gesture Coordination + HUD Labels

Wire the 3 new gestures into the tick loop, update HUD label to reflect the current active gesture (`PAUSED` / `PINCH-SCALE` / `SQUISH-X` / `SQUISH-Y` / `SQUISH-Z` / `FORCE` / `IDLE`), and handle shape-swap events.

**Files:**
- Modify: `Coding/hand-sculpt/js/main.js`

- [ ] **Step 1: Replace `js/main.js` with the new version**

File: `js/main.js`

```js
import { Camera } from './camera.js';
import { Tracker } from './tracker.js';
import { Overlay } from './overlay.js';
import { Scene } from './scene.js';
import { countExtendedFingers } from './fingers.js';
import { SingleHandPose } from './gestures/singleHandPose.js';
import { PoseSmoother } from './poseSmoother.js';
import { TwoHandPinchScale } from './gestures/twoHandPinchScale.js';
import { FlatPalmSquish } from './gestures/flatPalmSquish.js';
import { FingerCountHold } from './gestures/fingerCountHold.js';

const videoEl = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene3d');

const camera = new Camera(videoEl);
const tracker = new Tracker();
const overlay = new Overlay(overlayCanvas);
const scene = new Scene(sceneCanvas);
const singleHandPose = new SingleHandPose();
const smoother = new PoseSmoother(0.4);
const pinchScale = new TwoHandPinchScale();
const squish = new FlatPalmSquish();
const fingerHold = new FingerCountHold(30);

const SHAPES_BY_COUNT = [null, 'sphere', 'cube', 'pyramid', 'cylinder', 'torus'];

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

function currentMeshScale() {
  if (!scene.mesh) return { x: 1, y: 1, z: 1 };
  const s = scene.mesh.scale;
  return { x: s.x, y: s.y, z: s.z };
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

  const pose = singleHandPose.detect(results);
  let gestureLabel;

  if (pose.paused) {
    gestureLabel = 'PAUSED';
    pinchScale.reset();
    squish.reset();
  } else {
    const scaleNow = currentMeshScale();
    const ps = pinchScale.detect(results, scaleNow);
    if (ps.active) {
      gestureLabel = 'PINCH-SCALE';
      scene.setScale(ps.scale);
      squish.reset();
    } else {
      const sq = squish.detect(results, scaleNow);
      if (sq.active) {
        gestureLabel = 'SQUISH-' + sq.axis.toUpperCase();
        scene.setScale(sq.scale);
      } else if (pose.active) {
        gestureLabel = 'FORCE';
        const smoothed = smoother.update(pose.position, pose.quaternion);
        scene.setPose(smoothed);
      } else {
        gestureLabel = 'IDLE';
      }
    }

    const swap = fingerHold.detect(results);
    if (swap.fired !== null) {
      const shapeName = SHAPES_BY_COUNT[swap.fired];
      if (shapeName) {
        scene.setShape(shapeName);
        smoother.reset();
        pinchScale.reset();
        squish.reset();
      }
    }
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
  pinchScale.reset();
  squish.reset();
  scene.reset();
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('stop').addEventListener('click', stop);
document.getElementById('reset').addEventListener('click', reset);
window.addEventListener('resize', syncCanvasSizes);

syncCanvasSizes();
scene.render();
```

Changes from Phase 2:
1. New imports: `TwoHandPinchScale`, `FlatPalmSquish`, `FingerCountHold`.
2. Instantiated the 3 new gesture objects.
3. `SHAPES_BY_COUNT` lookup table for shape swap.
4. `currentMeshScale()` helper reads the mesh's current scale for baselining.
5. `tick()` follows gesture priority: PAUSED → PINCH-SCALE → SQUISH → FORCE → IDLE. Shape-swap event handled after the main branch.
6. `reset()` also clears the two-hand gestures.

- [ ] **Step 2: Tests pass (56/56)**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git add js/main.js
git commit -m "feat: wire two-hand gestures + shape swap into main, expand HUD labels"
```

---

## Task 7: Phase 3 Milestone Verification + Git Tag

- [ ] **Step 1: Start dev server**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
python -m http.server 8002
```

Open `http://localhost:8002` in Chrome, click Start Camera.

- [ ] **Step 2: Verify each gesture**

1. **FORCE (already working from Phase 2):** one palm up → cube tracks palm.
2. **PINCH-SCALE:** pinch thumb+index on both hands. HUD should read `PINCH-SCALE`. Move hands apart → cube grows uniformly. Move together → shrinks. Release → cube stays at new size.
3. **SQUISH-X/Y/Z:** hold both hands flat, palms facing each other, horizontally. HUD should read `SQUISH-X`. Pull hands apart → cube stretches along world X only. Orient hands vertically (one above the other, palms facing) → `SQUISH-Y`.
4. **SHAPE SWAP:** turn one hand palm-DOWN (back of hand toward camera), hold up N fingers for ~1 second. Shape changes: 1=sphere, 2=cube, 3=pyramid, 4=cylinder, 5=torus. HUD `Shape:` label updates.
5. **PAUSED:** both hands backs-of-hand toward camera → cube freezes.

- [ ] **Step 3: Stop server, confirm test suite**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
npm test
```

Expected: `# pass 56`.

- [ ] **Step 4: Tag**

```bash
cd "C:/Users/edwin/OneDrive/Desktop/Claude/Coding/hand-sculpt"
git status
git tag phase-3-two-hand-and-shape-swap
git tag --list
```

Expected `phase-1-foundations`, `phase-2-the-force`, `phase-3-two-hand-and-shape-swap`.

---

## Phase 3 Done — Milestone Achieved

You now have all 5 primitive shapes swappable via finger count, both uniform and non-uniform scaling via two-hand gestures, layered on top of Phase 2's Force control and pause.

**Next phase:** Phase 4 — Vertex-drag sculpting (pinch near surface → grab nearest vertex → drag with hand motion).

---

## Self-Review Notes

**Spec coverage (design.md §8 Phase 3):**
- ✅ "Flat-palm squish → non-uniform scale" — Task 4 + Task 6 wiring
- ✅ "Two-hand pinch → uniform scale (translate/rotate suspended)" — Task 3 + Task 6 (priority suspends Force)
- ✅ "N fingers held ≥1s → swap between all 5 shapes" — Task 2 + Task 6 shape-swap handler

**Type consistency:** all gestures use `{active, scale}` / `{active, scale, axis}` / `{fired}` shapes consistently; `scene.setScale({x,y,z})` matches what both TwoHandPinchScale and FlatPalmSquish produce.

**Deferred to Phase 5:** MediaPipe detection tuning (confidence thresholds), HUD overflow for long shape names, temporal smoothing on finger-count flicker during shape swaps.
