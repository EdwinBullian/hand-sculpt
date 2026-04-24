# hand-sculpt

Browser-based 3D object manipulation playground, controlled by hand gestures via webcam.

## Gesture quick reference

Priority is resolved top to bottom — a higher gesture suppresses everything below it for the frame.

| Gesture | Pose | Effect |
|---|---|---|
| **Reset** | Both hands showing backs of hands | Object snaps to center, identity rotation, scale 1, fresh un-sculpted geometry |
| **Freeze toggle** | Snap pose (thumb tip touching middle finger tip), held ~3 frames | Toggles freeze: cube's *position* locks; rotation keeps tracking the hand |
| **Sculpt** | One hand pinched (thumb+index) near the object's surface | Grabs nearest vertex and drags with hand motion (soft falloff pulls neighbors too) |
| **Stretch** | Both hands with thumb+index+middle+ring clustered, pulled apart | Non-uniform scale grows along dominant world axis; ratchets — moving hands back together does NOT shrink |
| **Pinch-scale** | Both hands pinched (thumb+index) | Uniform scale proportional to hand distance |
| **Squish** | Both hands flat, palms facing each other, pressed together | Non-uniform scale shrinks along dominant world axis; ratchets — moving hands apart does NOT grow back |
| **Force (1-hand)** | One palm facing camera | Position follows palm centroid; rotation accumulates via delta from a captured reference (re-grip to rotate further) |
| **Force (2-hand)** | Both palms facing camera | Position = midpoint of both centroids; rotation = averaged quaternion, delta-accumulated |
| **Shape swap** | One hand palm-DOWN, N fingers extended (1–5), held still ~1.5 s | 1 = sphere, 2 = cube, 3 = pyramid, 4 = cylinder, 5 = torus |

Debug HUD (top-left overlay) shows live finger counts, the currently-firing gesture label (`FORCE-1` / `SCULPT` / `STRETCH-X` / `FROZEN+PINCH-SCALE` / …), and the current shape.

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
```

## Design

See [docs/design.md](docs/design.md) for the full design spec and
[docs/plans/](docs/plans/) for per-phase implementation plans.

## Phase tags

| Tag | What it ships |
|---|---|
| `phase-1-foundations` | Webcam + MediaPipe tracking + wireframe cube + buttons |
| `phase-2-the-force` | Single-hand 6-DOF position/rotation tracking + pause |
| `phase-3-two-hand-and-shape-swap` | Pinch scale, flat-palm squish, N-fingers-held shape swap |
| `phase-4-vertex-sculpt` | One-hand-pinch-at-surface vertex-drag sculpting with soft falloff |
| `phase-5-polish` | Gesture refinements: ratchet compress/expand, delta rotation accumulation, freeze locks position only, snap-freeze toggle, gradient fill, tuned tracking |

## Ideas / Future

Parked for later — not designed yet, just saved here so they don't get lost.

- **Darts** — mini-game using hand flick velocity as a throw mechanic; Force-1 gesture as throw input, dart flies toward a board target in the scene
- **Ping pong** — mini-game using hand position as a paddle; object becomes the ball, bounce physics, keep-the-rally-going mode
