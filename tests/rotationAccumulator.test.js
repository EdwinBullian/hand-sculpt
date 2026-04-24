import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RotationAccumulator,
  multiplyQuat,
  inverseQuat,
  normalizeQuat,
} from '../js/rotationAccumulator.js';

function identity() { return { x: 0, y: 0, z: 0, w: 1 }; }
function rot90Y() { return { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }; } // 90° about Y
function rot180Y() { return { x: 0, y: 1, z: 0, w: 0 }; }                     // 180° about Y

function approxEqQuat(a, b, eps = 1e-6) {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.z - b.z) < eps &&
    Math.abs(a.w - b.w) < eps
  );
}

test('multiplyQuat(q, identity) = q', () => {
  const q = rot90Y();
  const r = multiplyQuat(q, identity());
  assert.ok(approxEqQuat(r, q), `expected ${JSON.stringify(q)}, got ${JSON.stringify(r)}`);
});

test('multiplyQuat(identity, q) = q', () => {
  const q = rot90Y();
  const r = multiplyQuat(identity(), q);
  assert.ok(approxEqQuat(r, q));
});

test('multiplyQuat(inverseQuat(q), q) = identity', () => {
  const q = rot90Y();
  const r = multiplyQuat(inverseQuat(q), q);
  assert.ok(approxEqQuat(r, identity()));
});

test('multiplyQuat(rot90Y, rot90Y) = rot180Y', () => {
  const r = multiplyQuat(rot90Y(), rot90Y());
  assert.ok(approxEqQuat(r, rot180Y()));
});

test('onActive with first call returns current base (identity initially)', () => {
  const acc = new RotationAccumulator();
  const out = acc.onActive(rot90Y());
  assert.ok(approxEqQuat(out, identity()));
});

test('onActive rotating hand from identity to rot90Y rotates cube 90° about Y', () => {
  const acc = new RotationAccumulator();
  acc.onActive(identity());                  // reference = identity
  const out = acc.onActive(rot90Y());        // delta = rot90Y
  assert.ok(approxEqQuat(out, rot90Y()));
});

test('onActive two increments of 90° → cube at 180° (accumulation)', () => {
  const acc = new RotationAccumulator();
  acc.onActive(identity());
  acc.onActive(rot90Y());
  const out = acc.onActive(rot180Y());       // delta = rot90Y on top of base rot90Y → 180Y total
  assert.ok(approxEqQuat(out, rot180Y()));
});

test('onInactive then onActive with same orientation keeps cube at accumulated rotation', () => {
  const acc = new RotationAccumulator();
  acc.onActive(identity());
  acc.onActive(rot90Y()); // cube at 90° Y
  acc.onInactive();
  const out = acc.onActive(rot90Y()); // first call after reactivation: returns base unchanged
  assert.ok(approxEqQuat(out, rot90Y()));
});

test('re-grip pattern: rotate, release, re-grip at fresh orientation, rotate more', () => {
  const acc = new RotationAccumulator();
  acc.onActive(identity());
  acc.onActive(rot90Y());     // cube at 90° Y
  acc.onInactive();
  // Hand is now in some new orientation — doesn't matter which; treat as the new reference.
  acc.onActive(identity());   // reference captured; base unchanged
  const out = acc.onActive(rot90Y());  // delta = rot90Y on top of base rot90Y → 180Y
  assert.ok(approxEqQuat(out, rot180Y()));
});

test('reset returns base to identity', () => {
  const acc = new RotationAccumulator();
  acc.onActive(identity());
  acc.onActive(rot90Y());
  acc.reset();
  const out = acc.onActive(rot90Y());  // first call after reset → base is identity
  assert.ok(approxEqQuat(out, identity()));
});

test('normalizeQuat returns unit length', () => {
  const r = normalizeQuat({ x: 2, y: 0, z: 0, w: 0 });
  const len = Math.hypot(r.x, r.y, r.z, r.w);
  assert.ok(Math.abs(len - 1) < 1e-9);
});
