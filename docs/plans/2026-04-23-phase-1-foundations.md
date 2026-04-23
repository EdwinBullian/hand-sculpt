# hand-sculpt Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project skeleton: webcam feed, MediaPipe Hands tracking with landmarks + finger counter visible on overlay, a Three.js wireframe cube sitting in the center of the scene, and functional Start / Stop / Reset buttons.

**Architecture:** Vanilla HTML/JS/CSS single-page app. Two stacked canvases inside a stage div — a 2D `overlay` canvas (for mirrored webcam + hand landmarks + HUD) and a transparent `scene3d` WebGL canvas on top (Three.js). Modules are ES modules imported from local files; runtime dependencies (Three.js, MediaPipe) come from CDN. Unit-testable pure logic (smoothing, finger counting) lives in standalone modules with no browser or Three.js imports, so it can be tested under `node --test`.

**Tech Stack:**
- HTML / CSS / JavaScript (ES modules)
- Three.js `0.169.0` via `cdn.jsdelivr.net`
- MediaPipe Tasks Vision `0.10.17` via `cdn.jsdelivr.net` (HandLandmarker)
- Node 18+ built-in test runner (`node --test`) — no dev dependencies
- Python 3 `http.server` for local dev serving

**Phase 1 milestone:** "I see my hands tracked; a cube just sits there. Start/Stop/Reset buttons work."

---

## File Structure

Files created in this plan:

```
hand-sculpt/
├── index.html                 # Task 1
├── README.md                  # Task 1
├── .gitignore                 # Task 1
├── package.json               # Task 1 (only for `npm test` convenience)
├── css/
│   └── main.css               # Task 1
├── js/
│   ├── smoothing.js           # Task 2
│   ├── fingers.js             # Task 3
│   ├── shapes.js              # Task 4
│   ├── scene.js               # Task 4
│   ├── camera.js              # Task 5
│   ├── tracker.js             # Task 6
│   ├── overlay.js             # Task 7
│   └── main.js                # Task 8
└── tests/
    ├── smoothing.test.js      # Task 2
    └── fingers.test.js        # Task 3
```

**Design constraints already decided in the spec (do not revisit):**
- No bundler, no npm runtime install
- No framework (React/Vite) — vanilla only
- Two-canvas stacking is the rendering model
- Wireframe material only (no fills, no lighting)
- Mirror the webcam horizontally for natural motion feel

---

## Prerequisites

Engineer needs:
- Node.js 18+ (for `node --test`; verify with `node --version`)
- Python 3 (for local dev server; verify with `python --version` on Windows / `python3 --version` on Mac)
- Git (verify with `git --version`)
- Chrome browser (for best MediaPipe compatibility)
- A webcam and permission to use it

Working directory for all tasks: `Coding/hand-sculpt/` (which already exists with `docs/design.md` and `docs/plans/` inside it).

---

## Task 1: Project Scaffolding

Create the project skeleton — HTML shell, CSS, configuration files, and initialize git.

**Files:**
- Create: `Coding/hand-sculpt/index.html`
- Create: `Coding/hand-sculpt/css/main.css`
- Create: `Coding/hand-sculpt/.gitignore`
- Create: `Coding/hand-sculpt/package.json`
- Create: `Coding/hand-sculpt/README.md`

- [ ] **Step 1: Create `index.html`**

File: `Coding/hand-sculpt/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>hand-sculpt</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
<body>
  <div class="controls">
    <button id="start">Start Camera</button>
    <button id="stop">Stop</button>
    <button id="reset">Reset</button>
  </div>
  <div class="stage">
    <video id="webcam" autoplay playsinline muted></video>
    <canvas id="overlay"></canvas>
    <canvas id="scene3d"></canvas>
  </div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/main.css`**

First create the directory: `mkdir -p Coding/hand-sculpt/css`

File: `Coding/hand-sculpt/css/main.css`

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #0e0e12;
  color: #fff;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}
.controls {
  padding: 12px;
  display: flex;
  gap: 8px;
}
.controls button {
  padding: 6px 14px;
  background: #1b1b22;
  color: #fff;
  border: 1px solid #2d2d38;
  cursor: pointer;
  font: inherit;
}
.controls button:hover { background: #2a2a34; }
.stage {
  position: relative;
  width: min(1280px, 100vw - 24px);
  aspect-ratio: 16 / 9;
  margin: 0 12px;
  background: #000;
}
#webcam {
  display: none;
}
#overlay, #scene3d {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
#scene3d {
  pointer-events: none;
}
```

- [ ] **Step 3: Create `.gitignore`**

File: `Coding/hand-sculpt/.gitignore`

```
.DS_Store
Thumbs.db
.vscode/
.idea/
*.log
node_modules/
```

- [ ] **Step 4: Create `package.json`**

File: `Coding/hand-sculpt/package.json`

```json
{
  "name": "hand-sculpt",
  "version": "0.1.0",
  "description": "Browser hand-tracking 3D sculpting playground",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test tests/",
    "serve": "python -m http.server 8000"
  }
}
```

(`"type": "module"` lets the test files use `import` syntax without a `.mjs` extension.)

- [ ] **Step 5: Create `README.md`**

File: `Coding/hand-sculpt/README.md`

````markdown
# hand-sculpt

Browser-based 3D object manipulation playground, controlled by hand gestures via webcam. Dominant hand acts as a 6-DOF controller ("the Force"): palm position translates the object, palm orientation rotates it. Two-hand gestures handle scale and squish; pinch at the surface for vertex-drag sculpting.

## Requirements

- Node.js 18+ (for tests)
- Python 3 (for the local dev server)
- A modern browser (Chrome recommended)

## Run locally

**Windows (Git Bash) or macOS (Terminal):**

```bash
python -m http.server 8000
# on Mac you may need: python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome. Click "Start Camera" and allow webcam access.

`getUserMedia` is blocked on `file://` URLs, so you must serve over localhost.

## Run tests

```bash
npm test
# or directly:
node --test tests/
```

## Design

See [docs/design.md](docs/design.md) for the full design spec.
See [docs/plans/](docs/plans/) for per-phase implementation plans.
````

- [ ] **Step 6: Initialize git and create the first commit**

Run:

```bash
cd Coding/hand-sculpt
git init
git add .gitignore README.md package.json index.html css/main.css docs/
git commit -m "chore: scaffold hand-sculpt project"
```

Expected: `git commit` succeeds. `git status` shows clean tree.

- [ ] **Step 7: Verify HTML loads in a browser**

Run:

```bash
python -m http.server 8000
# (or python3 -m http.server 8000 on Mac)
```

Open `http://localhost:8000` in Chrome.

Expected:
- Page loads with dark background
- Three buttons visible at top: "Start Camera", "Stop", "Reset"
- Black rectangular "stage" area below the buttons
- Browser console shows a "main.js not found" 404 — that's fine, we haven't created it yet

Stop the server (Ctrl+C) after verifying.

---

## Task 2: Smoothing Module (EMA + Hysteresis) — TDD

Pure-function utility for exponential moving average and frame-hysteresis. No browser dependencies. Test-driven.

**Files:**
- Test: `Coding/hand-sculpt/tests/smoothing.test.js`
- Create: `Coding/hand-sculpt/js/smoothing.js`

- [ ] **Step 1: Create the tests directory and the failing test file**

First create directories: `mkdir -p Coding/hand-sculpt/tests Coding/hand-sculpt/js`

File: `Coding/hand-sculpt/tests/smoothing.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEMA, makeHysteresis } from '../js/smoothing.js';

test('EMA first value is returned unchanged', () => {
  const ema = makeEMA(0.5);
  assert.equal(ema.update(10), 10);
});

test('EMA with alpha=0.5 averages new and previous', () => {
  const ema = makeEMA(0.5);
  ema.update(10);
  assert.equal(ema.update(20), 15);   // 0.5*20 + 0.5*10
  assert.equal(ema.update(30), 22.5); // 0.5*30 + 0.5*15
});

test('EMA with alpha=1 returns latest value', () => {
  const ema = makeEMA(1);
  ema.update(10);
  assert.equal(ema.update(99), 99);
});

test('EMA reset clears prior value', () => {
  const ema = makeEMA(0.5);
  ema.update(10);
  ema.reset();
  assert.equal(ema.update(42), 42);
});

test('hysteresis fires after N consecutive true frames', () => {
  const h = makeHysteresis(3);
  assert.equal(h.update(true), false);
  assert.equal(h.update(true), false);
  assert.equal(h.update(true), true);   // 3rd true → fires
  assert.equal(h.update(true), true);   // stays on
});

test('hysteresis releases after N consecutive false frames', () => {
  const h = makeHysteresis(3);
  h.update(true); h.update(true); h.update(true); // fired
  assert.equal(h.update(false), true);
  assert.equal(h.update(false), true);
  assert.equal(h.update(false), false); // 3rd false → releases
});

test('hysteresis counter resets when signal matches current state', () => {
  const h = makeHysteresis(3);
  h.update(true);
  h.update(true);
  // counter=2 toward flipping to true, but state is still false
  h.update(false); // matches current state (false), resets counter
  h.update(true);
  h.update(true);
  // counter=2 again, not yet 3
  assert.equal(h.update(true), true); // 3rd true → fires
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd Coding/hand-sculpt
node --test tests/smoothing.test.js
```

Expected: test run fails with an error like `ERR_MODULE_NOT_FOUND: Cannot find module '../js/smoothing.js'`.

- [ ] **Step 3: Implement `js/smoothing.js`**

File: `Coding/hand-sculpt/js/smoothing.js`

```js
// Exponential Moving Average: prev = alpha * new + (1 - alpha) * prev
// First update returns the value unchanged.
export function makeEMA(alpha) {
  let prev = null;
  return {
    update(value) {
      prev = (prev === null) ? value : alpha * value + (1 - alpha) * prev;
      return prev;
    },
    reset() { prev = null; },
    get value() { return prev; },
  };
}

// Hysteresis: a boolean signal must hold for `frames` consecutive frames
// to flip the state. Returns the current stable state each frame.
export function makeHysteresis(frames) {
  let state = false;
  let counter = 0;
  return {
    update(active) {
      if (active === state) {
        counter = 0;
        return state;
      }
      counter++;
      if (counter >= frames) {
        state = active;
        counter = 0;
      }
      return state;
    },
    reset() { state = false; counter = 0; },
    get state() { return state; },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd Coding/hand-sculpt
node --test tests/smoothing.test.js
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd Coding/hand-sculpt
git add tests/smoothing.test.js js/smoothing.js
git commit -m "feat: add EMA + hysteresis smoothing utilities"
```

---

## Task 3: Fingers Module (count extended fingers) — TDD

Pure function that takes a 21-landmark hand array (MediaPipe shape: `[{x,y,z}, ...]`) and returns the count of extended fingers. Uses a wrist-distance heuristic so it's rotation-invariant (doesn't require the hand to be upright).

**Files:**
- Test: `Coding/hand-sculpt/tests/fingers.test.js`
- Create: `Coding/hand-sculpt/js/fingers.js`

- [ ] **Step 1: Write the failing test**

File: `Coding/hand-sculpt/tests/fingers.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { countExtendedFingers } from '../js/fingers.js';

// Build a 21-length landmark array, defaulting every landmark to (0.5, 0.9, 0).
// Override specific indices to simulate a hand pose.
function makeLandmarks(overrides) {
  const base = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9, z: 0 }));
  for (const [i, [x, y]] of Object.entries(overrides)) {
    base[+i] = { x, y, z: 0 };
  }
  return base;
}

test('countExtendedFingers handles falsy / short input', () => {
  assert.equal(countExtendedFingers(null), 0);
  assert.equal(countExtendedFingers(undefined), 0);
  assert.equal(countExtendedFingers([]), 0);
  assert.equal(countExtendedFingers(new Array(10).fill({ x: 0, y: 0, z: 0 })), 0);
});

test('open hand — 5 fingers extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],                  // wrist
    3:  [0.35, 0.7],  4:  [0.3, 0.6],   // thumb IP, tip
    6:  [0.42, 0.4],  8:  [0.4, 0.1],   // index PIP, tip
    10: [0.5, 0.4],   12: [0.5, 0.05],  // middle PIP, tip
    14: [0.58, 0.4],  16: [0.6, 0.1],   // ring PIP, tip
    18: [0.65, 0.5],  20: [0.7, 0.3],   // pinky PIP, tip
  });
  assert.equal(countExtendedFingers(lm), 5);
});

test('fist — 0 fingers extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.52, 0.55], 8:  [0.5, 0.65],
    10: [0.52, 0.5],  12: [0.52, 0.63],
    14: [0.56, 0.52], 16: [0.55, 0.65],
    18: [0.6, 0.58],  20: [0.58, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 0);
});

test('peace sign — index + middle extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.42, 0.4],  8:  [0.4, 0.1],
    10: [0.52, 0.4],  12: [0.55, 0.1],
    14: [0.59, 0.58], 16: [0.58, 0.7],
    18: [0.66, 0.6],  20: [0.65, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 2);
});

test('index-only — 1 finger extended', () => {
  const lm = makeLandmarks({
    0:  [0.5, 0.9],
    3:  [0.4, 0.83],  4:  [0.45, 0.85],
    6:  [0.42, 0.4],  8:  [0.4, 0.1],
    10: [0.52, 0.5],  12: [0.55, 0.63],
    14: [0.59, 0.58], 16: [0.58, 0.7],
    18: [0.66, 0.6],  20: [0.65, 0.7],
  });
  assert.equal(countExtendedFingers(lm), 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd Coding/hand-sculpt
node --test tests/fingers.test.js
```

Expected: fails with `ERR_MODULE_NOT_FOUND: Cannot find module '../js/fingers.js'`.

- [ ] **Step 3: Implement `js/fingers.js`**

File: `Coding/hand-sculpt/js/fingers.js`

```js
// MediaPipe Hands landmark indices:
//   0  = wrist
//   1..4  = thumb (CMC, MCP, IP, TIP)
//   5..8  = index (MCP, PIP, DIP, TIP)
//   9..12 = middle
//   13..16= ring
//   17..20= pinky
//
// Heuristic: a finger is extended when its TIP is farther from the wrist
// than the joint one below the tip (PIP for fingers, IP for thumb).
// Works regardless of hand orientation.

const FINGER_PAIRS = [
  [4,  3],    // thumb: tip vs IP
  [8,  6],    // index: tip vs PIP
  [12, 10],   // middle
  [16, 14],   // ring
  [20, 18],   // pinky
];

function dist2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function countExtendedFingers(landmarks) {
  if (!landmarks || landmarks.length < 21) return 0;
  const wrist = landmarks[0];
  let count = 0;
  for (const [tipIdx, pivotIdx] of FINGER_PAIRS) {
    const tipD   = dist2d(landmarks[tipIdx],   wrist);
    const pivotD = dist2d(landmarks[pivotIdx], wrist);
    if (tipD > pivotD) count++;
  }
  return count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd Coding/hand-sculpt
node --test tests/fingers.test.js
```

Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Run all tests to confirm nothing regressed**

Run:

```bash
cd Coding/hand-sculpt
node --test tests/
```

Expected: all 12 tests pass (7 smoothing + 5 fingers).

- [ ] **Step 6: Commit**

```bash
cd Coding/hand-sculpt
git add tests/fingers.test.js js/fingers.js
git commit -m "feat: add finger-count utility (wrist-distance heuristic)"
```

---

## Task 4: Shapes + Scene Modules (Three.js wireframe cube)

Two modules created together because they're tightly coupled and neither is usable without the other. Both are thin wrappers around Three.js and will be visually verified once the full app is wired together in Task 8. No standalone unit tests — Three.js is not installed as a runtime dep, and mocking it would be more complex than the code itself.

**Files:**
- Create: `Coding/hand-sculpt/js/shapes.js`
- Create: `Coding/hand-sculpt/js/scene.js`

- [ ] **Step 1: Implement `js/shapes.js`**

File: `Coding/hand-sculpt/js/shapes.js`

```js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Returns a BufferGeometry for one of the 5 supported primitives, or null.
// Sizes chosen so each shape comfortably fills the scene frustum at scale=1.
export function createShape(name) {
  switch (name) {
    case 'sphere':   return new THREE.SphereGeometry(1, 32, 16);
    case 'cube':     return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    case 'pyramid':  return new THREE.ConeGeometry(1, 1.8, 4);   // 4 radial segments = square base
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1.8, 32);
    case 'torus':    return new THREE.TorusGeometry(1, 0.4, 16, 48);
    default:         return null;
  }
}

export const SHAPE_NAMES = ['sphere', 'cube', 'pyramid', 'cylinder', 'torus'];
```

- [ ] **Step 2: Implement `js/scene.js`**

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

- [ ] **Step 3: Commit**

```bash
cd Coding/hand-sculpt
git add js/shapes.js js/scene.js
git commit -m "feat: add Three.js shape factory and wireframe scene manager"
```

---

## Task 5: Camera Module (webcam → video element)

Wrapper around `getUserMedia` that wires a video stream into a `<video>` element and exposes start/stop.

**Files:**
- Create: `Coding/hand-sculpt/js/camera.js`

- [ ] **Step 1: Implement `js/camera.js`**

File: `Coding/hand-sculpt/js/camera.js`

```js
// Thin wrapper around getUserMedia. Pipes webcam video into a given <video>.
export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  get ready() {
    // readyState >= 2 (HAVE_CURRENT_DATA) — at least one frame is available
    return this.video.readyState >= 2;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd Coding/hand-sculpt
git add js/camera.js
git commit -m "feat: add Camera wrapper around getUserMedia"
```

---

## Task 6: Tracker Module (MediaPipe Hands)

Wrapper around the MediaPipe Tasks Vision `HandLandmarker`. Detects up to 2 hands per video frame and exposes the latest landmarks + handedness labels.

**Files:**
- Create: `Coding/hand-sculpt/js/tracker.js`

- [ ] **Step 1: Implement `js/tracker.js`**

File: `Coding/hand-sculpt/js/tracker.js`

```js
import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs';

// Tracks up to 2 hands per frame via MediaPipe HandLandmarker.
// Call init() once, then detect(videoEl, timestampMs) each frame.
export class Tracker {
  constructor() {
    this.landmarker = null;
    this.lastResults = { landmarks: [], handedness: [] };
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
    );
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  detect(videoEl, timestampMs) {
    if (!this.landmarker || videoEl.readyState < 2) return this.lastResults;
    const r = this.landmarker.detectForVideo(videoEl, timestampMs);
    this.lastResults = {
      landmarks: r.landmarks || [],
      handedness: r.handedness || [],
    };
    return this.lastResults;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd Coding/hand-sculpt
git add js/tracker.js
git commit -m "feat: add MediaPipe HandLandmarker tracker wrapper"
```

---

## Task 7: Overlay Module (draw webcam + landmarks + HUD)

Draws every frame onto the 2D overlay canvas: mirrored webcam image, hand skeletons (21 landmarks + connection lines per hand), and the debug HUD (finger counts, current gesture, current shape).

**Files:**
- Create: `Coding/hand-sculpt/js/overlay.js`

- [ ] **Step 1: Implement `js/overlay.js`**

File: `Coding/hand-sculpt/js/overlay.js`

```js
// 21-landmark hand skeleton: pairs of indices that form bones.
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],           // index
  [5, 9], [9, 10], [10, 11], [11, 12],      // middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [0, 17],                                   // wrist → pinky MCP (palm edge)
];

// Renders the overlay canvas (mirrored webcam image, hand skeletons, debug HUD).
export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = w;
    this.cssHeight = h;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  drawVideo(videoEl) {
    // Mirror horizontally so movement feels natural (right hand moves right on screen).
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(videoEl, -this.cssWidth, 0, this.cssWidth, this.cssHeight);
    this.ctx.restore();
  }

  drawHands(handsLandmarks) {
    const w = this.cssWidth;
    const h = this.cssHeight;
    for (const lm of handsLandmarks) {
      // Mirror landmark X to match mirrored video.
      const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
      // Skeleton lines.
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        this.ctx.beginPath();
        this.ctx.moveTo(pts[a].x, pts[a].y);
        this.ctx.lineTo(pts[b].x, pts[b].y);
        this.ctx.stroke();
      }
      // Joint dots.
      this.ctx.fillStyle = '#4488ff';
      for (const p of pts) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawHUD({ leftFingers, rightFingers, totalFingers, gesture, shape }) {
    const lines = [
      `Left: ${leftFingers}  Right: ${rightFingers}  Total: ${totalFingers}`,
      `Gesture: ${gesture}`,
      `Shape: ${shape}`,
    ];
    const pad = 8;
    const lh = 22;
    this.ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(pad, pad, 260, lh * lines.length + pad);
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], pad + 8, pad + 16 + i * lh);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd Coding/hand-sculpt
git add js/overlay.js
git commit -m "feat: add 2D overlay renderer (webcam mirror + skeleton + HUD)"
```

---

## Task 8: Main Orchestrator + Controls

Wires everything together: hooks the button event listeners, kicks off the render loop, routes landmarks through the finger-counter, feeds the HUD, and renders the Three.js scene.

**Files:**
- Create: `Coding/hand-sculpt/js/main.js`

- [ ] **Step 1: Implement `js/main.js`**

File: `Coding/hand-sculpt/js/main.js`

```js
import { Camera } from './camera.js';
import { Tracker } from './tracker.js';
import { Overlay } from './overlay.js';
import { Scene } from './scene.js';
import { countExtendedFingers } from './fingers.js';

const videoEl = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene3d');

const camera = new Camera(videoEl);
const tracker = new Tracker();
const overlay = new Overlay(overlayCanvas);
const scene = new Scene(sceneCanvas);

let running = false;

// Resize both canvases to match their CSS box.
function syncCanvasSizes() {
  const rect = overlayCanvas.getBoundingClientRect();
  overlay.resize(rect.width, rect.height);
  scene.resize();
}

// MediaPipe tags each detected hand with "Left" or "Right" (as the model sees
// the user's hands from the camera's viewpoint). We trust those labels for
// counting; left/right swap in the mirrored view is a UX concern for Phase 2+.
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

  overlay.drawHUD({
    leftFingers,
    rightFingers,
    totalFingers,
    gesture: 'IDLE',
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

- [ ] **Step 2: Commit**

```bash
cd Coding/hand-sculpt
git add js/main.js
git commit -m "feat: wire main orchestrator, controls, and render loop"
```

---

## Task 9: Phase 1 Milestone Verification + Git Tag

Smoke-test the app end-to-end in a browser, verify each element of the Phase 1 milestone, then tag the commit.

**Files:** none created or modified — this task is entirely verification.

- [ ] **Step 1: Start the local dev server**

Run:

```bash
cd Coding/hand-sculpt
python -m http.server 8000
# (or python3 -m http.server 8000 on Mac)
```

Expected: server prints `Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/)`.

- [ ] **Step 2: Open in Chrome and verify the idle state**

Open `http://localhost:8000` in Chrome.

Verify:
- Page loads with a dark background
- Three buttons visible at the top: "Start Camera", "Stop", "Reset"
- A black stage area below the buttons
- **A white wireframe cube is visible in the center of the stage** (Three.js canvas rendering even before the camera starts)
- Browser DevTools console has no errors

If the cube is not visible: check the console for Three.js load errors; verify the CDN URL in `shapes.js` and `scene.js`.

- [ ] **Step 3: Click "Start Camera" and verify tracking**

Click `Start Camera`. Allow the webcam when prompted.

Verify:
- Your webcam feed appears in the stage, **mirrored horizontally** (raise your right hand → it appears on the right of the screen)
- Within ~2 seconds, hand landmarks appear over your hands when you raise them: blue dots at each joint, white lines connecting them (the skeleton)
- The HUD in the top-left shows live finger counts (`Left: 5  Right: 5  Total: 10` when both hands are open)
- `Gesture: IDLE` stays constant (no gestures wired up yet — that's Phase 2)
- `Shape: cube` stays constant
- The wireframe cube is still visible on top of the video, centered

Interact:
- Hold up only an index finger → Total should read 1
- Show a peace sign → Total should read 2
- Make a fist → Total should read 0 (or close to it; MediaPipe can be noisy on closed hands)

- [ ] **Step 4: Verify Stop and Reset buttons**

With the camera running:

1. Click `Reset` → no visible change (cube was already at identity). No console errors.
2. Click `Stop` → webcam indicator turns off; video feed disappears from the stage; the wireframe cube remains visible (the Three.js scene doesn't clear).
3. Click `Start Camera` again → feed resumes; landmarks reappear.

- [ ] **Step 5: Run the full test suite one more time**

Stop the server (Ctrl+C). Then:

```bash
cd Coding/hand-sculpt
node --test tests/
```

Expected: `# pass 12`, `# fail 0`.

- [ ] **Step 6: Verify git state is clean and tag the milestone**

Run:

```bash
cd Coding/hand-sculpt
git status
```

Expected: `nothing to commit, working tree clean`.

Then tag:

```bash
git tag phase-1-foundations
```

Verify:

```bash
git log --oneline -n 10
git tag --list
```

Expected: tag `phase-1-foundations` appears on the most recent commit.

- [ ] **Step 7: (Optional) Push to GitHub**

If you have created the GitHub repo already:

```bash
cd Coding/hand-sculpt
git remote add origin <your-github-url>
git push -u origin main
git push origin phase-1-foundations
```

If not, skip this step — you can push at any time. The milestone is complete either way.

---

## Phase 1 Done — Milestone Achieved

At this point you should have:
- Webcam feed mirrored in the stage
- Hand landmarks + skeleton drawn over your hands
- Finger counter HUD updating in real time
- Wireframe cube visible in the scene center
- Start / Stop / Reset buttons functional
- 12 passing unit tests
- Git tag `phase-1-foundations` on the final commit

**Next phase:** Phase 2 — The Force (single-hand 6-DOF + pause). A separate plan file will be generated when Phase 1 is complete.

---

## Self-Review Notes

**Spec coverage:** Phase 1 milestone from `docs/design.md` section 8 = "Webcam stream + MediaPipe Hands running / Hand landmarks + finger counter visible on overlay / Three.js scene with a wireframe cube sitting in center / Start / Stop / Reset buttons functional." All covered — see Tasks 5-9.

**No placeholders:** every step has exact paths, exact code, and exact commands with expected output. Verified.

**Type consistency:** `countExtendedFingers` returns `number` in both `fingers.js` and `main.js`; `createShape` returns `BufferGeometry|null` and both consumers handle the null case; `Scene.currentShapeName` is a string used as `shape` in the HUD. Consistent.

**Scope:** Phase 1 only — no gestures (other than finger counting for display), no interactions with the cube beyond Reset. Gesture logic is deferred to Phase 2's plan.
