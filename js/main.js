import { Camera } from './camera.js';
import { Tracker } from './tracker.js';
import { Overlay } from './overlay.js';
import { Scene } from './scene.js';
import { countExtendedFingers } from './fingers.js';
import { SingleHandPose } from './gestures/singleHandPose.js';
import { PoseSmoother } from './poseSmoother.js';
import { TwoHandPinchScale } from './gestures/twoHandPinchScale.js';
import { FlatPalmSquish } from './gestures/flatPalmSquish.js';
import { FourFingerPinchStretch } from './gestures/fourFingerPinchStretch.js';
import { FingerCountHold } from './gestures/fingerCountHold.js';
import { SnapFreeze } from './gestures/snapFreeze.js';
import { VertexSculpt } from './gestures/vertexSculpt.js';
import { RotationAccumulator } from './rotationAccumulator.js';
import { nextMirrorAxis } from './mirror.js';
import { TwoHandYRotation } from './gestures/twoHandYRotation.js';

const videoEl = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene3d');

const camera = new Camera(videoEl);
const tracker = new Tracker();
const overlay = new Overlay(overlayCanvas);
const scene = new Scene(sceneCanvas);
const singleHandPose = new SingleHandPose();
const smoother = new PoseSmoother(0.15);
smoother.positionDeadZone = 0.02;
const handQuatSmoother = new PoseSmoother(0.08); // pre-smooth raw hand quat before accumulator
const rotationAccum = new RotationAccumulator();
const pinchScale = new TwoHandPinchScale();
const squish = new FlatPalmSquish();
const stretch = new FourFingerPinchStretch();
const fingerHold = new FingerCountHold(45, 0.04);
const snapFreeze = new SnapFreeze();
const vertexSculpt = new VertexSculpt();
const twoHandY = new TwoHandYRotation();

const SHAPES_BY_COUNT = [null, 'sphere', 'cube', 'pyramid', 'cylinder', 'torus'];

let running = false;
let frozen = false;
let lastFrameTime = 0;
let fpsEMA = 0;
let mirrorAxis = null;  // null | 'x' | 'y' | 'z' — cycled by the M key
let brushMode = 'drag'; // 'drag' | 'smooth' — cycled by the B key
let inflateMode = null;  // null | 'inflate' | 'deflate' — cycled by the I key; overrides brushMode when set

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

function resetAll() {
  smoother.reset();
  handQuatSmoother.reset();
  pinchScale.reset();
  squish.reset();
  stretch.reset();
  rotationAccum.reset();
  twoHandY.reset();
  scene.reset();
}

// Returns true if sculpt claimed the frame (either started or continued).
// Also handles release: if the user was sculpting and has let go, we stop
// the sculpt here before returning false so later gesture branches run
// cleanly.
function tryHandleSculpt(results) {
  const sc = vertexSculpt.detect(results);
  if (scene.isSculpting) {
    if (sc.active) {
      scene.updateSculpt(sc.worldPoint);
      return true;
    }
    scene.stopSculpt();
    return false;
  }
  if (sc.active && scene.startSculpt(sc.worldPoint)) {
    // Rotation should NOT accumulate while sculpting — release any prior grip.
    rotationAccum.onInactive();
    return true;
  }
  return false;
}

function tick() {
  if (!running) return;
  const t = performance.now();
  if (lastFrameTime > 0) {
    const instantFPS = 1000 / Math.max(1, t - lastFrameTime);
    fpsEMA = fpsEMA === 0 ? instantFPS : 0.1 * instantFPS + 0.9 * fpsEMA;
  }
  lastFrameTime = t;
  const results = tracker.detect(videoEl, t);

  overlay.clear();
  overlay.drawVideo(videoEl);
  overlay.drawHands(results.landmarks);

  const leftHands = landmarksByHand(results, 'Left');
  const rightHands = landmarksByHand(results, 'Right');
  const leftFingers = leftHands.reduce((n, lm) => n + countExtendedFingers(lm), 0);
  const rightFingers = rightHands.reduce((n, lm) => n + countExtendedFingers(lm), 0);
  const totalFingers = leftFingers + rightFingers;

  // Snap toggles freeze regardless of other state.
  const snap = snapFreeze.detect(results);
  if (snap.toggle) frozen = !frozen;

  let gestureLabel;

  if (tryHandleSculpt(results)) {
    gestureLabel = 'SCULPT';
  } else {
    const scaleNow = currentMeshScale();
    // Scale gestures run whether frozen or not — freeze only blocks Force.
    // Priority order: stretch (all-4-to-thumb) > pinch-scale (thumb+index) > squish (flat palms).
    // Stretch checks first so it "wins" over pinch-scale when the user clusters all 4 fingers to thumb.
    const st = stretch.detect(results, scaleNow);
    if (st.active) {
      gestureLabel = (frozen ? 'FROZEN+STRETCH-' : 'STRETCH-') + st.axis.toUpperCase();
      scene.setScale(st.scale);
      pinchScale.reset();
      squish.reset();
    } else {
      const ps = pinchScale.detect(results, scaleNow);
      if (ps.active) {
        gestureLabel = frozen ? 'FROZEN+PINCH-SCALE' : 'PINCH-SCALE';
        scene.setScale(ps.scale);
        squish.reset();
      } else {
        const sq = squish.detect(results, scaleNow);
        if (sq.active) {
          gestureLabel = (frozen ? 'FROZEN+SQUISH-' : 'SQUISH-') + sq.axis.toUpperCase();
          scene.setScale(sq.scale);
        } else {
          const yRot = twoHandY.detect(results);
          if (yRot.active) {
            // Turntable Y-rotation: thumbs touching + both palms toward camera.
            // This intercepts before FORCE-2 since it's a subset of that pose.
            gestureLabel = frozen ? 'FROZEN+Y-ROTATE' : 'Y-ROTATE';
            if (!frozen && yRot.deltaY !== 0) scene.rotateAroundWorldY(yRot.deltaY);
            rotationAccum.onInactive(); // don't let delta accumulator drift
          } else {
            const pose = singleHandPose.detect(results);
            if (pose.active) {
              const preSmoothed = handQuatSmoother.update(pose.position, pose.quaternion);
              const cubeOrientation = rotationAccum.onActive(preSmoothed.quaternion);
              const smoothed = smoother.update(pose.position, cubeOrientation);
              if (frozen) {
                gestureLabel = 'FROZEN';
                scene.setPose({ quaternion: smoothed.quaternion });
              } else {
                gestureLabel = pose.handCount === 2 ? 'FORCE-2' : 'FORCE-1';
                scene.setPose(smoothed);
              }
            } else {
              rotationAccum.onInactive();
              gestureLabel = frozen ? 'FROZEN' : 'IDLE';
            }
          }
        }
      }
    }

    // Shape swap runs in parallel with scale gestures, independent of freeze.
    const swap = fingerHold.detect(results);
    if (swap.fired !== null) {
      const shapeName = SHAPES_BY_COUNT[swap.fired];
      if (shapeName) {
        scene.setShape(shapeName);
        smoother.reset();
        pinchScale.reset();
        squish.reset();
        stretch.reset();
        rotationAccum.reset();
      }
    }
  }

  overlay.drawHUD({
    leftFingers,
    rightFingers,
    totalFingers,
    gesture: gestureLabel,
    shape: scene.currentShapeName,
    fps: Math.round(fpsEMA),
    undoDepth: scene.sculptUndoDepth,
    redoDepth: scene.sculptRedoDepth,
    mirror: mirrorAxis,
    brush: inflateMode ?? brushMode,
    palette: scene.paletteName,
    bloom: scene.bloomEnabled,
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
  frozen = false;
  resetAll();
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('stop').addEventListener('click', stop);
document.getElementById('reset').addEventListener('click', reset);
window.addEventListener('resize', syncCanvasSizes);

// ---------- Settings panel ----------
// Each slider writes directly into the module or scene field that drives the
// behavior — no intermediate state. Backtick toggles the panel's visibility.
const settingsPanel = document.getElementById('settings');
function wireSlider(inputId, outputId, onChange) {
  const input = document.getElementById(inputId);
  const out = document.getElementById(outputId);
  const apply = () => {
    const v = parseFloat(input.value);
    out.textContent = v.toFixed(2);
    onChange(v);
  };
  input.addEventListener('input', apply);
  apply(); // seed the label so it matches the slider's starting value
}
wireSlider('s-alpha',   'v-alpha',   (v) => { smoother.alpha = v; });
wireSlider('s-pick',    'v-pick',    (v) => { scene.sculptPickRadius = v; });
wireSlider('s-falloff', 'v-falloff', (v) => { scene.sculptFalloffRadius = v; });
wireSlider('s-sn',      'v-sn',      (v) => { scene.smoothNeighborRadius = v; });
wireSlider('s-ss',      'v-ss',      (v) => { scene.smoothStrength = v; });
wireSlider('s-bloom',   'v-bloom',   (v) => { scene.setBloomStrength(v); });

document.getElementById('s-reset').addEventListener('click', () => {
  const defaults = {
    's-alpha': 0.15, 's-pick': 0.50, 's-falloff': 0.80, 's-sn': 0.25, 's-ss': 0.15, 's-bloom': 1.50,
  };
  for (const [id, value] of Object.entries(defaults)) {
    const el = document.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new Event('input'));
  }
});

// Keyboard shortcuts:
//   Z → undo last sculpt (pops the snapshot stack on the scene)
//   M → cycle mirror axis for sculpt: off → x → y → z → off
//   B → toggle brush tool: drag ↔ smooth
//   C → cycle color palette
//   ` → toggle the settings panel
window.addEventListener('keydown', (e) => {
  // Swallow the shortcut if the user is typing into a form field (e.g. the
  // range inputs — arrow keys also fire keydown there).
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'z' || e.key === 'Z') {
    if (scene.undoSculpt()) {
      console.log('Sculpt undone. Undo remaining:', scene.sculptUndoDepth, 'Redo available:', scene.sculptRedoDepth);
    }
  } else if (e.key === 'y' || e.key === 'Y') {
    if (scene.redoSculpt()) {
      console.log('Sculpt redone. Undo remaining:', scene.sculptUndoDepth, 'Redo available:', scene.sculptRedoDepth);
    }
  } else if (e.key === 'm' || e.key === 'M') {
    mirrorAxis = nextMirrorAxis(mirrorAxis);
    scene.setMirrorAxis(mirrorAxis);
    console.log('Mirror axis:', mirrorAxis ?? 'off');
  } else if (e.key === 'b' || e.key === 'B') {
    if (inflateMode === null) {
      brushMode = brushMode === 'drag' ? 'smooth' : 'drag';
      scene.setBrushMode(brushMode);
      console.log('Brush:', brushMode);
    }
  } else if (e.key === 'i' || e.key === 'I') {
    if (inflateMode === null) inflateMode = 'inflate';
    else if (inflateMode === 'inflate') inflateMode = 'deflate';
    else inflateMode = null;
    scene.setBrushMode(inflateMode ?? brushMode);
    console.log('Inflate:', inflateMode ?? 'off');
  } else if (e.key === 'c' || e.key === 'C') {
    scene.cyclePalette();
    console.log('Palette:', scene.paletteName);
  } else if (e.key === 'h' || e.key === 'H') {
    const cs = document.getElementById('cheatsheet');
    const nowHidden = cs.classList.toggle('hidden');
    cs.setAttribute('aria-hidden', String(nowHidden));
  } else if (e.key === 'g' || e.key === 'G') {
    scene.toggleBloom().then(on => console.log('Bloom:', on ? 'on' : 'off'));
  } else if (e.key === 's' || e.key === 'S') {
    overlay.showSkeleton = !overlay.showSkeleton;
    console.log('Skeleton:', overlay.showSkeleton ? 'on' : 'off');
  } else if (e.key === '`' || e.key === '~') {
    const nowHidden = settingsPanel.classList.toggle('hidden');
    settingsPanel.setAttribute('aria-hidden', String(nowHidden));
  }
});

syncCanvasSizes();
scene.render();
