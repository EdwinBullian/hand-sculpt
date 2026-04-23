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
