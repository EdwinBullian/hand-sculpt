import test from 'node:test';
import assert from 'node:assert/strict';
import { stepBall, bouncePlane, bouncePaddle, isPastPaddle, resetBall, DEFAULT_GRAVITY } from '../js/physics.js';

function ball(px, py, pz, vx, vy, vz) {
  return { pos: { x: px, y: py, z: pz }, vel: { x: vx, y: vy, z: vz } };
}

test('stepBall integrates position by velocity * dt', () => {
  const b = ball(0, 0, 0, 1, 2, 3);
  stepBall(b, 0.5, { x: 0, y: 0, z: 0 });
  assert.equal(b.pos.x, 0.5);
  assert.equal(b.pos.y, 1);
  assert.equal(b.pos.z, 1.5);
});

test('stepBall applies gravity to velocity over time', () => {
  const b = ball(0, 0, 0, 0, 0, 0);
  stepBall(b, 1.0, { x: 0, y: -10, z: 0 });
  assert.equal(b.vel.y, -10);
  // After a second tick, position has fallen and velocity grew further.
  stepBall(b, 1.0, { x: 0, y: -10, z: 0 });
  assert.equal(b.vel.y, -20);
  assert.equal(b.pos.y, -10); // position from second tick: 0 + (-10)*1 = -10
});

test('bouncePlane reflects when ball penetrates moving toward plane', () => {
  // Floor at y = -1, ball at y = -1.5 moving down at 5 → bounces back up.
  const b = ball(0, -1.5, 0, 0, -5, 0);
  const collided = bouncePlane(b, 'y', -1, +1, 0.1, 1.0);
  assert.equal(collided, true);
  assert.equal(b.pos.y, -0.9); // -1 + 0.1
  assert.equal(b.vel.y, 5);    // perfectly reflected
});

test('bouncePlane applies restitution', () => {
  const b = ball(0, -1.5, 0, 0, -10, 0);
  bouncePlane(b, 'y', -1, +1, 0, 0.5);
  assert.equal(b.vel.y, 5); // 50% energy retained
});

test('bouncePlane no-op when ball moving away from plane', () => {
  // Ball penetrating but already moving up — don't re-bounce.
  const b = ball(0, -0.95, 0, 0, +3, 0);
  const collided = bouncePlane(b, 'y', -1, +1, 0, 1.0);
  assert.equal(collided, false);
  assert.equal(b.vel.y, 3);
});

test('bouncePlane no-op when ball not penetrating', () => {
  const b = ball(0, 1, 0, 0, -3, 0);
  const collided = bouncePlane(b, 'y', -1, +1, 0.1, 1.0);
  assert.equal(collided, false);
  assert.equal(b.pos.y, 1);
  assert.equal(b.vel.y, -3);
});

test('bouncePaddle reflects ball coming from camera side moving toward wall', () => {
  const paddle = {
    pos: { x: 0, y: 0, z: 1 },
    halfSize: { x: 0.3, y: 0.2, z: 0.05 },
    vel: { x: 0, y: 0, z: 0 },
  };
  const b = ball(0, 0, 1.07, 0, 0, -3); // +z side of paddle, moving in -z (toward wall)
  const collided = bouncePaddle(b, paddle, 0.05);
  assert.equal(collided, true);
  assert.ok(b.vel.z > 0, 'z velocity reversed (now moving back toward camera)');
});

test('bouncePaddle reflects ball coming from wall side moving toward camera (the actual ping pong case)', () => {
  const paddle = {
    pos: { x: 0, y: 0, z: 1 },
    halfSize: { x: 0.3, y: 0.2, z: 0.05 },
    vel: { x: 0, y: 0, z: 0 },
  };
  const b = ball(0, 0, 0.93, 0, 0, +3); // -z side of paddle, moving in +z (toward camera)
  const collided = bouncePaddle(b, paddle, 0.05);
  assert.equal(collided, true);
  assert.ok(b.vel.z < 0, 'z velocity reversed (now moving back toward wall)');
});

test('bouncePaddle adds paddle swing velocity to ball', () => {
  const paddle = {
    pos: { x: 0, y: 0, z: 1 },
    halfSize: { x: 0.3, y: 0.2, z: 0.05 },
    vel: { x: 0, y: 0, z: -4 }, // user is swinging forward (toward wall)
  };
  const b = ball(0, 0, 1.07, 0, 0, -3);
  bouncePaddle(b, paddle, 0.05);
  // After bounce: z reverses to +3*restitution, then paddle vz adds -|paddleVZ|.
  // Net z velocity should be less positive than the bare reflection.
  assert.ok(b.vel.z < 3, 'paddle swing reduces or reverses ball z velocity');
});

test('bouncePaddle no-op when ball outside lateral footprint', () => {
  const paddle = {
    pos: { x: 0, y: 0, z: 1 },
    halfSize: { x: 0.3, y: 0.2, z: 0.05 },
    vel: { x: 0, y: 0, z: 0 },
  };
  const b = ball(2, 0, 1.07, 0, 0, -3); // x=2, way outside paddle x range
  const collided = bouncePaddle(b, paddle, 0.05);
  assert.equal(collided, false);
  assert.equal(b.vel.z, -3);
});

test('bouncePaddle no-op when ball already moving away from paddle', () => {
  const paddle = {
    pos: { x: 0, y: 0, z: 1 },
    halfSize: { x: 0.3, y: 0.2, z: 0.05 },
    vel: { x: 0, y: 0, z: 0 },
  };
  // Ball on +z side, moving FURTHER into +z (away from paddle) — no bounce.
  const b = ball(0, 0, 1.07, 0, 0, +3);
  const collided = bouncePaddle(b, paddle, 0.05);
  assert.equal(collided, false);
});

test('isPastPaddle detects miss when ball passes behind paddle', () => {
  const b = ball(0, 0, 2.5, 0, 0, +1);
  assert.equal(isPastPaddle(b, 2), true);
});

test('isPastPaddle returns false while ball still in front of paddle', () => {
  const b = ball(0, 0, 1.5, 0, 0, +1);
  assert.equal(isPastPaddle(b, 2), false);
});

test('resetBall overwrites position and velocity', () => {
  const b = ball(99, 99, 99, 5, 5, 5);
  resetBall(b, { x: 0, y: 1, z: -3 }, { x: 0, y: 0, z: 4 });
  assert.deepEqual(b.pos, { x: 0, y: 1, z: -3 });
  assert.deepEqual(b.vel, { x: 0, y: 0, z: 4 });
});

test('DEFAULT_GRAVITY pulls down only', () => {
  assert.equal(DEFAULT_GRAVITY.x, 0);
  assert.ok(DEFAULT_GRAVITY.y < 0);
  assert.equal(DEFAULT_GRAVITY.z, 0);
});
