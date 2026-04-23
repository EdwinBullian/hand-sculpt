import { countExtendedFingers } from '../fingers.js';
import { palmFacesCamera } from './palmDirection.js';

// Fires once when a single palm-DOWN hand holds 1..5 extended fingers
// for `holdFrames` consecutive frames.
// Palm-DOWN requirement prevents collision with the palm-UP Force gesture.

export class FingerCountHold {
  constructor(holdFrames = 30) {
    this.holdFrames = holdFrames;
    this.currentCount = -1;
    this.counter = 0;
    this.fired = false;
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
    if (palmFacesCamera(lm, isLeft)) {
      this._reset();
      return { fired: null };
    }
    const n = countExtendedFingers(lm);
    if (n !== this.currentCount) {
      this.currentCount = n;
      this.counter = 1;
      this.fired = false;
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
  }
}
