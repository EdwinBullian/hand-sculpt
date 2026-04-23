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
