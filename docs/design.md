# hand-sculpt — Design Spec

**Date:** 2026-04-23
**Status:** Approved, ready for implementation planning
**Author:** Eddie Bullian (with Claude as thinking partner)

## 1. Overview

A browser-based 3D object manipulation playground controlled entirely by hand gestures through the webcam. The user's hands act as 6-DOF controllers — moving, rotating, squishing, stretching, and sculpting a wireframe mesh shape. Designed to feel like telekinesis: the object responds to your palm like you have the Force.

**Goal:** starts as a fun toy ("Option D — just vibes"), architected so it can grow into a real tool for rough 3D shape exploration ("Option C") if a use case emerges.

## 2. Goals & Non-Goals

**In scope for MVP:**
- Hand tracking via MediaPipe Hands
- Three.js wireframe rendering of one shape at a time
- Five primitive shapes: sphere, cube, pyramid (cone), cylinder, torus
- Translate + rotate via dominant palm pose (6-DOF from one hand)
- Non-uniform scale (axis-stretch) via flat-palm squish
- Uniform scale via two-hand pinch
- Vertex-drag sculpting via one-hand pinch at surface
- Shape swap via held finger count
- Pause/resume via palm direction
- Runs on Windows and macOS, any modern browser
- Synced via git/GitHub between Eddie's two machines

**Out of scope for MVP (parking lot for phase C):**
- Color / material modes
- Multiple simultaneous objects in the scene
- Undo/redo history
- Save / export scene
- Additional gesture primitives
- Touch or mobile support
- Audio feedback / sound effects

**Explicit non-goals (ever):**
- Not a production 3D modeling tool
- Not a replacement for Blender / Maya
- Not optimized for mm-precision work
- Does not infer real-world scale from hand size

## 3. Architecture

Three logical layers in a single-page vanilla HTML/JS application. No framework, no build step for MVP.

```
┌──────────────────────────────────────────────┐
│  Webcam feed (mirrored horizontally)          │
│  ├─ Hand landmark overlay (21 dots/hand)      │← debug HUD
│  ├─ Finger counter text (Left/Right/Total)    │
│  └─ Gesture label (currently-detected)        │
│                                                │
│  Three.js canvas on top (transparent bg)       │
│  └─ One wireframe shape, transforms applied    │
└──────────────────────────────────────────────┘
```

**Layer 1 — Input:** MediaPipe Hands runs on the webcam, outputs 21 landmarks per detected hand per frame (x/y/z normalized).

**Layer 2 — Gesture recognizers:** Each gesture is its own JS module under `js/gestures/` with a shared interface. Each runs every frame against the landmark stream and outputs `{active: bool, params: {...}}` or null. A gesture registry orchestrates conflict resolution (e.g., two-hand pinch-scale takes priority over single-hand translate when both are detected).

**Layer 3 — Scene driver:** Reads the gesture registry's resolved output for the current frame and applies the resulting transforms/deformations to the Three.js mesh.

**Why this split:** adding a new gesture in phase C = drop a file into `gestures/`, register it. No touching the rest.

**Tech stack:**
- Vanilla HTML + JS + CSS (ES modules)
- MediaPipe Hands via CDN
- Three.js via CDN
- No bundler, no npm install for runtime
- Node's built-in `node --test` for unit tests (no dependencies)

## 4. Gesture Vocabulary

**Governing rule: palm direction gates each hand's activity.**
- Palm toward camera = that hand is active
- Back of hand toward camera = that hand is inactive
- **Both** hands showing backs = all tracking paused, object locks

Palm direction is computed from the palm normal: cross product of vectors (wrist → index MCP) and (wrist → pinky MCP). If normal.z > 0, palm is facing camera.

### Single-hand active (one palm up, other down / off-screen)

| Gesture | Action |
|---|---|
| Dominant palm position in space (x, y, z) | Object translates to match the palm centroid |
| Dominant palm orientation (tilt/cup/twist) | Object rotates to match (full pitch/yaw/roll from palm normal + up vector) |
| Thumb + index pinch near the object's surface | Vertex drag — grabs nearest mesh vertex and drags with hand motion |

The object is continuously attached to the dominant hand's pose while the hand is active. Not "grab to pick up" — more like "the object mirrors your hand."

### Two-hand active (both palms up)

| Gesture | Action |
|---|---|
| Both hands flat, palms facing each other | Non-uniform squish along the axis between palms |
| Both hands pinching (thumb + index) | Uniform scale — hand distance sets size. Translate and rotate are suspended while both are pinching (cleaner feel). |

### Discrete gestures

| Gesture | Action |
|---|---|
| N fingers up on one hand, **held ≥1 second** | Swap to shape N: 1=sphere, 2=cube, 3=pyramid, 4=cylinder, 5=torus |
| Both hands showing backs (dorsal) | Pause tracking — object freezes, hands ignored until a palm comes back up |

### Conflict resolution

Priority order when multiple gestures could fire simultaneously:
1. Both-backs pause (overrides everything)
2. Two-hand pinch scale (overrides single-hand when both pinch)
3. Two-hand flat-palm squish
4. Single-hand vertex drag (when pinch is near surface)
5. Single-hand translate + rotate (default continuous)
6. Shape swap (only fires on explicit hold-detection)

## 5. 3D Coordinate Mapping

MediaPipe Hands gives normalized 2D coords (x, y in 0–1) plus a relative z (depth guess, roughly -0.3 to +0.3 relative to wrist).

**Hands → scene mapping:**
```
palm centroid.x (0..1)        → scene.x (-2..+2)     # horizontal
palm centroid.y (0..1) flipped → scene.y (-2..+2)    # vertical (flip — screen Y grows down)
palm centroid.z (-0.3..+0.3)  → scene.z (-1..+1)     # depth toward/away from camera
```
Magnitude constants are tunable starting points. Calibrated in phase 5.

**Palm orientation → object orientation:**
- Palm normal vector (from cross product) = object's forward
- Wrist-to-middle-MCP vector = object's up
- Together: a full rotation matrix. Apply directly to the Three.js mesh quaternion.

Full 6-DOF from a single hand.

**Object persistence:**
The object does NOT follow your hands when no gesture is active. When a dominant hand becomes active (palm up), the object snaps its transform into "tracking mode" and mirrors the hand until the hand becomes inactive. When inactive, the object stays in its last pose (persists in space).

**Smoothing:**
- All tracked scalars (positions, angles, finger counts) run through an EMA filter with α ≈ 0.3. Tunable.
- Gesture detection uses a 3-frame hysteresis: must fire for 3 consecutive frames before activating, and be absent for 3 consecutive frames before releasing. Prevents flicker between states.

**What we punt on:**
- Hand occlusion — MediaPipe will drop detections, which is fine. The gesture registry handles "hand disappeared" as "gesture released."
- Absolute real-world scale — we don't try to map hand size to physical units. Normalized + tunable.

## 6. Scene & Visuals

**Layout:** webcam feed fills the stage area, mirrored horizontally so motion feels natural. A Three.js canvas overlays it with a transparent background.

**Two stacked canvases** inside one `<div class="stage">`:
1. `<canvas id="overlay">` — 2D canvas drawing the webcam video frame + hand landmarks + debug HUD
2. `<canvas id="scene3d">` — Three.js WebGL canvas with transparent clear color

**Object styling (MVP):**
- Wireframe material only (white lines, no fill)
- Single shape in scene center at start (default cube)
- No lighting, no shadows, no textures

**Hand landmarks:**
- 21 landmarks per hand drawn as small dots
- Connections between landmarks drawn as thin lines (skeleton)
- Matches the visual style of the screenshots

**Debug HUD (top-left, small monospace):**
```
Left: 5  Right: 4  Total: 9
Gesture: PINCH-GRAB
Shape: cube
```
The gesture label is critical — shows Eddie what the recognizers are firing in real time.

**Controls (top bar, matches screenshots):**
- `Start Camera` — initialize webcam + MediaPipe
- `Stop` — stop tracking, release camera
- `Reset` — restore current shape to default pose and default geometry (undoes all sculpting)

## 7. Project Structure

Project root: `Coding/hand-sculpt/`

```
hand-sculpt/
├── README.md                      # what it is, how to run on Win/Mac
├── index.html                     # single page entry
├── .gitignore
├── css/
│   └── main.css                   # layout, HUD styling
├── js/
│   ├── main.js                    # wires everything together
│   ├── camera.js                  # webcam init, mirror, canvas sizing
│   ├── tracker.js                 # MediaPipe Hands setup, landmark stream
│   ├── overlay.js                 # draws hand landmarks + HUD on 2D canvas
│   ├── scene.js                   # Three.js scene, camera, renderer
│   ├── shapes.js                  # shape factory (5 primitives)
│   ├── smoothing.js               # EMA + hysteresis helpers
│   └── gestures/
│       ├── index.js               # gesture registry + conflict resolution
│       ├── palmDirection.js       # palm-up vs palm-down per hand
│       ├── singleHandPose.js      # translate + rotate from dominant hand
│       ├── flatPalmSquish.js      # both flat palms → non-uniform scale
│       ├── twoHandPinchScale.js   # both pinching → uniform scale
│       ├── vertexDrag.js          # pinch near surface → sculpt
│       └── fingerCount.js         # N fingers held → shape swap
├── tests/
│   ├── smoothing.test.js
│   ├── palmNormal.test.js
│   ├── gestures.test.js
│   ├── shapes.test.js
│   └── fixtures/
│       └── *.json                 # recorded landmark frames for regression
└── docs/
    └── design.md                  # this document
```

**DOM:**
```html
<div class="stage">
  <video id="webcam" autoplay playsinline muted></video>
  <canvas id="overlay"></canvas>
  <canvas id="scene3d"></canvas>
</div>
<div class="controls">
  <button id="start">Start Camera</button>
  <button id="stop">Stop</button>
  <button id="reset">Reset</button>
</div>
```

## 8. Evolution Path (Phases)

Each phase is a working, playable checkpoint. Don't start phase N+1 until phase N's milestone passes in the browser. Commit a git tag at each milestone.

**Phase 1 — Foundations (no gestures)**
- Webcam stream + MediaPipe Hands running
- Hand landmarks + finger counter visible on overlay
- Three.js scene with a wireframe cube sitting in center
- Start / Stop / Reset buttons functional
- Milestone: "I see my hands tracked; a cube just sits there."

**Phase 2 — The Force (single-hand 6-DOF + pause)**
- Palm direction detection per hand
- Pause system: both palms down → freeze everything
- Dominant palm position → object translate
- Dominant palm orientation → object rotate
- Smoothing (EMA) + hysteresis integrated
- Milestone: "I wave my palm, the cube follows and tilts. Show backs, it freezes."

**Phase 3 — Two-hand transforms + shape swap**
- Flat-palm squish → non-uniform scale
- Two-hand pinch → uniform scale (translate/rotate suspended)
- N fingers held ≥1s → swap between all 5 shapes
- Milestone: "I can stretch, squish, scale, swap shapes."

**Phase 4 — Vertex-drag sculpting**
- Expose each shape's `BufferGeometry.attributes.position` for direct vertex mutation (Three.js primitives are already BufferGeometry — we just need to hold the reference and mark it dirty on change)
- Detect pinch near surface (distance from pinch point in scene space to nearest vertex)
- Drag vertex with hand motion, update position attribute, set `needsUpdate = true`
- Optional soft-falloff to neighboring vertices for smoother sculpting (weight by inverse distance within radius)
- Milestone: "I can pinch the surface and pull a point."

**Phase 5 — Tuning & polish**
- Gesture label HUD (live-updating)
- Tune constants: smoothing α, scale magnitudes, hysteresis frame counts, pinch detection thresholds
- Edge cases: hand leaves frame mid-grab, rapid gesture switches, low-FPS scenarios
- Milestone: "It feels good."

**Beyond MVP (phase C — gesture sandbox):**
Parking lot. Ideas for when MVP is stable:
- Color / material modes (solid, glass, glow)
- Multiple simultaneous objects
- Undo / redo history (N-step)
- Save scene to JSON, load from JSON
- New gesture primitives (snap fingers, thumbs up, peace sign)
- Shape library expansion (torus knot, icosahedron, etc.)

## 9. Testing & Verification

Two kinds of correctness:

**Math (unit-testable with `node --test`):**
- `smoothing.test.js` — EMA produces expected values; hysteresis fires/releases after N frames
- `palmNormal.test.js` — fixed landmark fixtures → expected palm normal direction
- `gestures/*.test.js` — feed recorded landmark fixtures, verify detector outputs
- `shapes.test.js` — each factory returns a valid `BufferGeometry` with expected vertex count

**Feel (manual browser verification per phase):**
Each phase has a milestone check. Passing the check = phase complete = commit a git tag. Not passing = fix before proceeding.

**Landmark fixtures:** during phase 2, add a "Save Landmarks" debug keyboard shortcut that dumps the current frame's raw landmarks to JSON. Drop those files into `tests/fixtures/` to use as regression fixtures.

**What we do NOT test:**
- Visual rendering correctness — use your eyes
- "Feel" of interaction — tune by playing

## 10. Cross-Platform Notes

**Runs identically on Windows and macOS** — vanilla browser stack with no native dependencies.

**Local dev server (either OS):**
```bash
python -m http.server 8000
# or on Mac, possibly: python3 -m http.server 8000
# open http://localhost:8000
```
`getUserMedia` requires localhost or HTTPS — `file://` is blocked by browsers.

**Browser support:** Chrome, Safari, Firefox, Edge on both OS. Chrome recommended for MediaPipe reliability.

**Sync between Eddie's Windows PC and MacBook:** GitHub repo `hand-sculpt`. Push from one, pull on the other. Avoids OneDrive flakiness during rapid dev.

## 11. Open Questions / Tuning Parameters

These don't block design — they get resolved empirically during phase 5.

- Exact EMA α for position smoothing (starting: 0.3)
- Exact EMA α for rotation smoothing (starting: 0.3, may need lower for rotations)
- Hysteresis frame count (starting: 3)
- Scene coordinate magnitudes (starting: x/y → ±2, z → ±1)
- Pinch detection distance threshold (starting: thumb-index landmarks within 0.05 normalized units)
- Surface-pinch proximity threshold for vertex drag (starting: 0.15 scene units)
- Finger-held duration for shape swap (starting: 1.0 seconds)
