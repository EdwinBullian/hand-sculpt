import { palmFacesCamera } from './palmDirection.js';

// Activates when both palms face the camera AND the two thumb tips are close
// together (user presses thumbs toward each other). This discriminates from
// FORCE-2 (both palms, thumbs apart) so the two gestures are mutually exclusive.
//
// Returns { active, deltaY } where deltaY is the world-Y rotation delta in
// radians for this frame — derived from horizontal movement of the thumb
// midpoint between consecutive detections.

const THUMB_TOUCH_THRESHOLD = 0.12; // normalized screen distance

export class TwoHandYRotation {
  constructor() {
    this._lastCenterX = null;
  }

  detect(results) {
    const { handedness, landmarks } = results;

    if (handedness.length < 2) {
      this._lastCenterX = null;
      return { active: false, deltaY: 0 };
    }

    // Both palms must face the camera.
    for (let i = 0; i < handedness.length; i++) {
      const isLeft = handedness[i]?.[0]?.categoryName === 'Left';
      if (!palmFacesCamera(landmarks[i], isLeft)) {
        this._lastCenterX = null;
        return { active: false, deltaY: 0 };
      }
    }

    // Thumb tips (landmark 4) of the two hands must be close together.
    const t0 = landmarks[0][4];
    const t1 = landmarks[1][4];
    const thumbDist = Math.hypot(t0.x - t1.x, t0.y - t1.y);
    if (thumbDist > THUMB_TOUCH_THRESHOLD) {
      this._lastCenterX = null;
      return { active: false, deltaY: 0 };
    }

    // Horizontal midpoint of the two thumb tips drives Y rotation.
    // Moving hands left → positive deltaY (counter-clockwise from above).
    const centerX = (t0.x + t1.x) / 2;
    const deltaY = this._lastCenterX !== null
      ? (this._lastCenterX - centerX) * Math.PI * 2
      : 0;
    this._lastCenterX = centerX;

    return { active: true, deltaY };
  }

  reset() {
    this._lastCenterX = null;
  }
}
