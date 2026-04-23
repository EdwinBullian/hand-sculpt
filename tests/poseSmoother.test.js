import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseSmoother } from '../js/poseSmoother.js';

test('first update returns input unchanged', () => {
  const s = new PoseSmoother(0.5);
  const r = s.update(
    { x: 1, y: 2, z: 3 },
    { x: 0, y: 0, z: 0, w: 1 },
  );
  assert.deepEqual(r.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(r.quaternion, { x: 0, y: 0, z: 0, w: 1 });
});

test('position is EMA-smoothed at alpha=0.5', () => {
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const r = s.update({ x: 10, y: 20, z: 30 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(r.position.x, 5);
  assert.equal(r.position.y, 10);
  assert.equal(r.position.z, 15);
});

test('position at alpha=1 returns latest value', () => {
  const s = new PoseSmoother(1);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const r = s.update({ x: 42, y: 99, z: -7 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(r.position.x, 42);
  assert.equal(r.position.y, 99);
  assert.equal(r.position.z, -7);
});

test('quaternion stays unit length after smoothing', () => {
  const s = new PoseSmoother(0.3);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const root2 = Math.SQRT1_2;
  const r = s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: root2, z: 0, w: root2 });
  const q = r.quaternion;
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  assert.ok(Math.abs(len - 1) < 1e-9, `expected unit length, got ${len}`);
});

test('reset clears both position and quaternion state', () => {
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  s.update({ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  s.reset();
  const r = s.update({ x: 7, y: 7, z: 7 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(r.position, { x: 7, y: 7, z: 7 });
});

test('quaternion double-cover shortcut: flip sign when dot(prev, next) < 0', () => {
  const s = new PoseSmoother(0.5);
  s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
  const r = s.update({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: -1 });
  assert.equal(r.quaternion.w, 1);
});
