import { palmNormal } from './palmDirection.js';
import { palmCentroid, handSpaceToWorld } from './singleHandPose.js';
import { countExtendedFingers } from '../fingers.js';

// Both palms flat (≥4 fingers extended) + palm normals antiparallel (facing each other).
// Non-uniform scale along the dominant world axis of the hand-to-hand vector.

const FLAT_FINGER_MIN = 4;
const PALM_DOT_MAX = -0.3;

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
