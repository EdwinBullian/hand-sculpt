// Minimal hand-rolled physics for the ping pong + basketball mini-games.
// Pure functions on plain {x,y,z} vectors so they can be tested without
// Three.js. The game-mode files apply the results to their meshes each frame.
//
// Conventions:
// - Positions and velocities live in the world coordinate system used by the
//   Three.js scene (camera at (0,0,5) looking down -z).
// - `dt` is in seconds. Caller is responsible for clamping huge gaps (e.g.
//   tab-backgrounded frames) so a single tick can't teleport the ball through
//   a wall.

export const DEFAULT_GRAVITY = { x: 0, y: -6.5, z: 0 };

// Integrate one tick: pos += vel * dt; vel.y -= g * dt. Mutates the inputs.
export function stepBall(state, dt, gravity = DEFAULT_GRAVITY) {
  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;
  state.vel.x += gravity.x * dt;
  state.vel.y += gravity.y * dt;
  state.vel.z += gravity.z * dt;
}

// Reflect the ball off an axis-aligned plane. The plane is described by an
// `axis` ('x'|'y'|'z') and a constant `value` along that axis. `side` is +1
// if the ball should stay on the positive side of the plane (e.g. floor at
// y=-1.5, side=+1 means ball stays above y=-1.5), -1 for the opposite.
//
// `restitution` ∈ [0,1] is how much velocity is preserved after the bounce
// (1 = perfectly elastic, 0 = ball sticks to the plane).
//
// Returns true if a collision was resolved this call.
export function bouncePlane(state, axis, value, side, radius, restitution) {
  const p = state.pos[axis];
  const v = state.vel[axis];
  // Penetration test: ball center is on the wrong side of (plane + radius*side).
  const surface = value + radius * side;
  const penetrating = side > 0 ? p < surface : p > surface;
  if (!penetrating) return false;
  // Only resolve if the ball is moving INTO the plane — prevents an
  // infinite re-bounce loop on a ball already moving away.
  const movingIntoPlane = side > 0 ? v < 0 : v > 0;
  if (!movingIntoPlane) return false;
  state.pos[axis] = surface;
  state.vel[axis] = -v * restitution;
  return true;
}

// Paddle bounce: treat the paddle as an axis-aligned bounding box at
// `paddle.pos` with `paddle.halfSize`. If the ball is within the paddle's
// xy footprint AND penetrating the thin z extent AND moving INTO the
// paddle (from either side), reflect z velocity and add the paddle's
// swing velocity to the ball.
//
// Returns true if a collision was resolved.
export function bouncePaddle(state, paddle, ballRadius) {
  const { pos: pp, halfSize: hs, vel: pv, restitution = 0.95 } = paddle;
  // Lateral footprint check — must be true for any paddle hit regardless of
  // which side the ball is on.
  if (Math.abs(state.pos.x - pp.x) > hs.x + ballRadius) return false;
  if (Math.abs(state.pos.y - pp.y) > hs.y + ballRadius) return false;
  const dz = state.pos.z - pp.z;
  if (Math.abs(dz) > hs.z + ballRadius) return false;
  // The ball is INSIDE the paddle box. Reflect only if the ball is moving
  // toward the paddle's center plane (otherwise we'd re-bounce a ball
  // that's already moving away — the classic stuck-in-paddle jitter).
  const ballOnPlusZSide = dz >= 0;
  const movingIntoPaddle = ballOnPlusZSide ? state.vel.z < 0 : state.vel.z > 0;
  if (!movingIntoPaddle) return false;
  // Push the ball out to the surface on the side it came from.
  state.pos.z = pp.z + (ballOnPlusZSide ? 1 : -1) * (hs.z + ballRadius);
  state.vel.z = -state.vel.z * restitution;
  // Paddle swing adds DIRECTLY to the ball — a forward swing (pv.z < 0)
  // pushes the ball further toward the wall regardless of which side it
  // bounced from. x/y are damped so wild side-swings don't fling the ball
  // off-court, but z is direct so the user's intended shot power transfers.
  state.vel.x += pv.x * 0.6;
  state.vel.y += pv.y * 0.6;
  state.vel.z += pv.z;
  return true;
}

// Out-of-bounds test: ball passed behind the paddle and is now on the
// wrong side of `behindZ` (positive — closer to camera than the paddle).
// Used by the game-mode tick to detect a missed return.
export function isPastPaddle(state, behindZ) {
  return state.pos.z > behindZ;
}

// Convenience: reset the ball to a starting state (used on game start /
// after a miss). Mutates `state` in place.
export function resetBall(state, pos, vel) {
  state.pos.x = pos.x; state.pos.y = pos.y; state.pos.z = pos.z;
  state.vel.x = vel.x; state.vel.y = vel.y; state.vel.z = vel.z;
}
