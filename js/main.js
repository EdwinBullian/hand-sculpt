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
import { BothBacksReset } from './gestures/bothBacksReset.js';
import { SnapFreeze } from './gestures/snapFreeze.js';

const videoEl = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene3d');

const camera = new Camera(videoEl);
const tracker = new Tracker();
const overlay = new Overlay(overlayCanvas);
const scene = new Scene(sceneCanvas);
const singleHandPose = new SingleHandPose();
const smoother = new PoseSmoother(1.0);
const pinchScale = new TwoHandPinchScale();
const squish = new FlatPalmSquish();
const stretch = new FourFingerPinchStretch();
const fingerHold = new FingerCountHold(45, 0.04);
const bothBacks = new BothBacksReset();
const snapFreeze = new SnapFreeze();

const SHAPES_BY_COUNT = [null, 'sphere', 'cube', 'pyramid', 'cylinder', 'torus'];

let running = false;
let frozen = false;

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
  pinchScale.reset();
  squish.reset();
  stretch.reset();
  scene.reset();
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

  // Snap toggles freeze regardless of other state.
  const snap = snapFreeze.detect(results);
  if (snap.toggle) frozen = !frozen;

  let gestureLabel;

  if (bothBacks.detect(results).active) {
    gestureLabel = 'RESET';
    resetAll();
    frozen = false;
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
        } else if (frozen) {
          gestureLabel = 'FROZEN';
        } else {
          const pose = singleHandPose.detect(results);
          if (pose.active) {
            gestureLabel = pose.handCount === 2 ? 'FORCE-2' : 'FORCE-1';
            const smoothed = smoother.update(pose.position, pose.quaternion);
            scene.setPose(smoothed);
          } else {
            gestureLabel = 'IDLE';
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
  frozen = false;
  resetAll();
}

document.getElementById('start').addEventListener('click', start);
document.getElementById('stop').addEventListener('click', stop);
document.getElementById('reset').addEventListener('click', reset);
window.addEventListener('resize', syncCanvasSizes);

syncCanvasSizes();
scene.render();
