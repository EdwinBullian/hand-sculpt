import { isPinched, pinchPoint } from './pinchDetect.js';
import { handSpaceToWorld } from './singleHandPose.js';

// Detects the single-hand pinch used for vertex-drag sculpting.
// Returns { active, worldPoint } when exactly one hand has a thumb+index pinch.
// Main.js is responsible for passing `worldPoint` to scene.startSculpt /
// updateSculpt so the scene can pick the nearest vertex and drag it.

export class VertexSculpt {
  detect(results) {
    if (!results || !results.landmarks) return { active: false };
    let pinchedCount = 0;
    let pinchedLm = null;
    for (const lm of results.landmarks) {
      if (isPinched(lm)) {
        pinchedCount++;
        pinchedLm = lm;
      }
    }
    if (pinchedCount !== 1) return { active: false };
    return { active: true, worldPoint: handSpaceToWorld(pinchPoint(pinchedLm)) };
  }
}
