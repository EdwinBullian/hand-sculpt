// SnapFreeze: detects the "pre-snap pose" — thumb tip touching middle finger
// tip — held for `holdFrames` frames. Fires a one-shot toggle signal.
//
// Intentionally permissive: only checks thumb+middle proximity. Earlier stricter
// versions (requiring index extended, thumb+index separated) made it too hard
// to trigger in practice. Live feedback: "the snap is still not working… when
// it was a lot more sensitive that was honestly when it worked best."

export class SnapFreeze {
  constructor(holdFrames = 3, touchThreshold = 0.07, cooldownMs = 1500) {
    this.holdFrames = holdFrames;
    this.touchThreshold = touchThreshold;
    this.cooldownMs = cooldownMs;
    this.counter = 0;
    this.fired = false;
    this._lastToggleTime = -Infinity;
  }

  detect(results) {
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      this._reset();
      return { toggle: false };
    }
    let snapping = false;
    for (const lm of results.landmarks) {
      if (!lm || lm.length < 21) continue;
      const thumb = lm[4];
      const middle = lm[12];
      const dx = thumb.x - middle.x;
      const dy = thumb.y - middle.y;
      const dz = thumb.z - middle.z;
      if (Math.hypot(dx, dy, dz) < this.touchThreshold) {
        snapping = true;
        break;
      }
    }
    if (!snapping) {
      this._reset();
      return { toggle: false };
    }
    this.counter++;
    const now = performance.now();
    if (!this.fired && this.counter >= this.holdFrames &&
        now - this._lastToggleTime >= this.cooldownMs) {
      this.fired = true;
      this._lastToggleTime = now;
      return { toggle: true };
    }
    return { toggle: false };
  }

  _reset() {
    this.counter = 0;
    this.fired = false;
  }
}
