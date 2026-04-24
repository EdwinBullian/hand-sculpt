// SnapFreeze: detects the "snap pose" — thumb tip (landmark 4) touching middle
// finger tip (landmark 12) — held for `holdFrames` consecutive frames. Fires a
// one-shot toggle signal that the caller can use to flip a `frozen` flag.
//
// True snap detection (the rapid flick) is unreliable frame-to-frame; the pre-snap
// pose is distinctive and easy to detect, and matches the user's physical intent.

export class SnapFreeze {
  constructor(holdFrames = 5, threshold = 0.05) {
    this.holdFrames = holdFrames;
    this.threshold = threshold;
    this.counter = 0;
    this.fired = false;
  }

  detect(results) {
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      this._reset();
      return { toggle: false };
    }
    let snapping = false;
    for (const lm of results.landmarks) {
      if (!lm || lm.length < 21) continue;
      const thumbTip = lm[4];
      const middleTip = lm[12];
      const dx = thumbTip.x - middleTip.x;
      const dy = thumbTip.y - middleTip.y;
      const dz = thumbTip.z - middleTip.z;
      if (Math.hypot(dx, dy, dz) < this.threshold) {
        snapping = true;
        break;
      }
    }
    if (!snapping) {
      this._reset();
      return { toggle: false };
    }
    this.counter++;
    if (!this.fired && this.counter >= this.holdFrames) {
      this.fired = true;
      return { toggle: true };
    }
    return { toggle: false };
  }

  _reset() {
    this.counter = 0;
    this.fired = false;
  }
}
