// SnapFreeze: detects the "pre-snap pose" — thumb tip (4) touching middle
// finger tip (12) — with the *index finger extended* AND thumb not also
// touching index (i.e. not a pinch). Held for `holdFrames` frames fires a
// one-shot toggle.
//
// The extra conditions rule out two common false positives:
// - Fist: all fingertips bunch near the wrist, thumb+middle are close but
//   index is curled — index-extended check fails.
// - Thumb+index pinch (used by two-hand scale): thumb+middle can also be
//   close since middle curls during pinch; we require thumb+index > threshold
//   to reject this.

function dist3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function distFromWrist(lm, i) {
  return Math.hypot(lm[i].x - lm[0].x, lm[i].y - lm[0].y);
}

function isSnapPose(lm, touchThreshold, separationThreshold) {
  if (!lm || lm.length < 21) return false;
  const thumbMiddle = dist3d(lm[4], lm[12]);
  if (thumbMiddle >= touchThreshold) return false;
  const thumbIndex = dist3d(lm[4], lm[8]);
  if (thumbIndex < separationThreshold) return false;
  // Index extended: tip (8) farther from wrist than PIP (6).
  const indexTipD = distFromWrist(lm, 8);
  const indexPipD = distFromWrist(lm, 6);
  if (indexTipD <= indexPipD) return false;
  return true;
}

export class SnapFreeze {
  constructor(holdFrames = 5, touchThreshold = 0.05, separationThreshold = 0.08) {
    this.holdFrames = holdFrames;
    this.touchThreshold = touchThreshold;
    this.separationThreshold = separationThreshold;
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
      if (isSnapPose(lm, this.touchThreshold, this.separationThreshold)) {
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
