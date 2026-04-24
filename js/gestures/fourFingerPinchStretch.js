import { palmCentroid, handSpaceToWorld } from './singleHandPose.js';

// Both hands in "four-finger pinch": thumb tip (4) close to index tip (8),
// middle tip (12), AND ring tip (16). Pinky is ignored (often uncooperative).
// Ratchet expand-only: tracks MAXIMUM hand-distance seen since activation.
// Scale on dominant axis = baseline * (max/baseline), always ≥ 1 — hands
// coming back together never shrink the shape. Pair with FlatPalmSquish
// (compress-only) for opposable sizing.

const CLUSTER_THRESHOLD = 0.06;

function tipDist(lm, a, b) {
  return Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, lm[a].z - lm[b].z);
}

function isFourFingerPinch(lm) {
  if (!lm || lm.length < 21) return false;
  return (
    tipDist(lm, 4, 8) < CLUSTER_THRESHOLD &&
    tipDist(lm, 4, 12) < CLUSTER_THRESHOLD &&
    tipDist(lm, 4, 16) < CLUSTER_THRESHOLD
  );
}

function dominantAxis(vec) {
  const ax = Math.abs(vec.x);
  const ay = Math.abs(vec.y);
  const az = Math.abs(vec.z);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= az) return 'y';
  return 'z';
}

export class FourFingerPinchStretch {
  constructor() {
    this.baselineDistance = null;
    this.baselineScaleAxis = null;
    this.axis = null;
    this.maxDistance = null;
  }

  detect(results, currentScale) {
    if (!results || !results.landmarks || results.landmarks.length !== 2) {
      this.reset();
      return { active: false };
    }
    const lm0 = results.landmarks[0];
    const lm1 = results.landmarks[1];
    if (!isFourFingerPinch(lm0) || !isFourFingerPinch(lm1)) {
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
      this.maxDistance = this.baselineDistance;
    }
    if (d > this.maxDistance) this.maxDistance = d;
    const ratio = this.maxDistance / this.baselineDistance;
    const newScale = { x: currentScale.x, y: currentScale.y, z: currentScale.z };
    newScale[this.axis] = this.baselineScaleAxis * ratio;
    return { active: true, scale: newScale, axis: this.axis };
  }

  reset() {
    this.baselineDistance = null;
    this.baselineScaleAxis = null;
    this.axis = null;
    this.maxDistance = null;
  }
}
