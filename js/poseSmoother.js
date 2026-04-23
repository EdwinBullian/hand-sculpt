// Per-frame pose smoother. EMA on position components; component-wise EMA
// on quaternion with renormalization (and sign flip for shortest-path through
// the double cover). Simple and cheap — real slerp is overkill at 60fps
// since frame-to-frame rotation deltas are small.

export class PoseSmoother {
  constructor(alpha = 0.4) {
    this.alpha = alpha;
    this.pos = null;
    this.quat = null;
  }

  update(position, quaternion) {
    if (this.pos === null) {
      this.pos = { ...position };
      this.quat = { ...quaternion };
      return { position: { ...this.pos }, quaternion: { ...this.quat } };
    }
    const a = this.alpha;
    this.pos = {
      x: a * position.x + (1 - a) * this.pos.x,
      y: a * position.y + (1 - a) * this.pos.y,
      z: a * position.z + (1 - a) * this.pos.z,
    };
    const dot = this.quat.x * quaternion.x + this.quat.y * quaternion.y +
                this.quat.z * quaternion.z + this.quat.w * quaternion.w;
    const q = (dot < 0)
      ? { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: -quaternion.w }
      : quaternion;
    const mx = a * q.x + (1 - a) * this.quat.x;
    const my = a * q.y + (1 - a) * this.quat.y;
    const mz = a * q.z + (1 - a) * this.quat.z;
    const mw = a * q.w + (1 - a) * this.quat.w;
    const len = Math.hypot(mx, my, mz, mw) || 1;
    this.quat = { x: mx / len, y: my / len, z: mz / len, w: mw / len };
    return { position: { ...this.pos }, quaternion: { ...this.quat } };
  }

  reset() {
    this.pos = null;
    this.quat = null;
  }
}
