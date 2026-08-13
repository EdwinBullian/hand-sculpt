import { countExtendedFingers } from '../fingers.js';
import { palmZ } from './palmDirection.js';
import { palmCentroid } from './singleHandPose.js';

// Fires once when a single palm-DOWN hand holds 1..5 extended fingers for
// `holdFrames` consecutive frames AND keeps the palm centroid within
// `motionThreshold` (normalized coords) of its position when the hold began.
// Palm-DOWN + motion stability prevent accidental fires during natural hand
// motion (e.g. an open hand sweeping across the frame during Force).
//
// Gate: palmZ > PALM_AWAY_THRESHOLD — palm normal must point STRONGLY away
// from camera (default 0.5). The old gate of `palmFacesCamera == false`
// (n.z >= 0) fired any time the palm wasn't directly facing the camera, which
// included mid-rotation poses during the Force gesture. Tightening this to
// 0.5 means the back of the hand has to be deliberately presented (~60° off
// camera-facing) before a count can fire.

const DEFAULT_PALM_AWAY_THRESHOLD = 0.5;

export class FingerCountHold {
  constructor(holdFrames = 30, motionThreshold = 0.05, palmAwayThreshold = DEFAULT_PALM_AWAY_THRESHOLD) {
    this.holdFrames = holdFrames;
    this.motionThreshold = motionThreshold;
    this.palmAwayThreshold = palmAwayThreshold;
    this.currentCount = -1;
    this.counter = 0;
    this.fired = false;
    this.baselineCentroid = null;
  }

  detect(results) {
    if (!results || !results.landmarks || results.landmarks.length !== 1) {
      this._reset();
      return { fired: null };
    }
    const lm = results.landmarks[0];
    const side = results.handedness[0]?.[0]?.categoryName;
    if (side !== 'Left' && side !== 'Right') {
      this._reset();
      return { fired: null };
    }
    const isLeft = side === 'Left';
    if (palmZ(lm, isLeft) < this.palmAwayThreshold) {
      this._reset();
      return { fired: null };
    }
    const n = countExtendedFingers(lm);
    const c = palmCentroid(lm);

    if (n !== this.currentCount) {
      this.currentCount = n;
      this.counter = 1;
      this.fired = false;
      this.baselineCentroid = c;
    } else if (this.baselineCentroid) {
      const dx = c.x - this.baselineCentroid.x;
      const dy = c.y - this.baselineCentroid.y;
      if (Math.hypot(dx, dy) > this.motionThreshold) {
        // Hand moved too much — restart the hold with the current position as the new baseline.
        this.counter = 1;
        this.fired = false;
        this.baselineCentroid = c;
      } else {
        this.counter++;
      }
    } else {
      this.counter++;
    }

    if (!this.fired && this.counter >= this.holdFrames && n >= 1 && n <= 5) {
      this.fired = true;
      return { fired: n };
    }
    return { fired: null };
  }

  _reset() {
    this.currentCount = -1;
    this.counter = 0;
    this.fired = false;
    this.baselineCentroid = null;
  }
}
