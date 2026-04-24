// Tracks cube orientation as the cumulative integral of hand-rotation deltas.
// Each frame while Force is active, the frame-to-frame delta from the previous
// hand orientation is applied on top of the running base. On deactivation the
// base stays put; on reactivation a new reference is captured so future deltas
// start from zero — the user can "re-grip" to rotate further without the cube
// snapping back to whatever their hand happens to be doing.
//
// Quaternion conventions: { x, y, z, w } unit quaternions. All multiplication
// follows the standard right-handed convention.

export function multiplyQuat(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function inverseQuat(q) {
  // For a unit quaternion, the inverse equals the conjugate.
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function normalizeQuat(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export class RotationAccumulator {
  constructor() {
    this.base = { x: 0, y: 0, z: 0, w: 1 };
    this.reference = null;
  }

  // Call every frame Force is active. Returns the current cube orientation.
  onActive(handQuat) {
    if (this.reference === null) {
      this.reference = { ...handQuat };
      return { ...this.base };
    }
    const invRef = inverseQuat(this.reference);
    const delta = multiplyQuat(handQuat, invRef);
    this.base = normalizeQuat(multiplyQuat(delta, this.base));
    this.reference = { ...handQuat };
    return { ...this.base };
  }

  // Call when Force transitions to inactive. Cube orientation is preserved in
  // this.base; reference is cleared so the next activation starts fresh.
  onInactive() {
    this.reference = null;
  }

  // Full reset — cube rotation back to identity.
  reset() {
    this.base = { x: 0, y: 0, z: 0, w: 1 };
    this.reference = null;
  }
}
