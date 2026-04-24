import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIRROR_AXES,
  nextMirrorAxis,
  mirrorPoint,
  mirrorDeltaSign,
} from '../js/mirror.js';

test('MIRROR_AXES lists the three axes', () => {
  assert.deepEqual(MIRROR_AXES, ['x', 'y', 'z']);
});

test('nextMirrorAxis cycles off → x → y → z → off', () => {
  assert.equal(nextMirrorAxis(null), 'x');
  assert.equal(nextMirrorAxis('x'), 'y');
  assert.equal(nextMirrorAxis('y'), 'z');
  assert.equal(nextMirrorAxis('z'), null);
});

test('nextMirrorAxis treats undefined as off', () => {
  assert.equal(nextMirrorAxis(undefined), 'x');
});

test('mirrorPoint flips the selected axis', () => {
  const pt = { x: 2, y: 3, z: 4 };
  assert.deepEqual(mirrorPoint(pt, 'x'), { x: -2, y: 3, z: 4 });
  assert.deepEqual(mirrorPoint(pt, 'y'), { x: 2, y: -3, z: 4 });
  assert.deepEqual(mirrorPoint(pt, 'z'), { x: 2, y: 3, z: -4 });
});

test('mirrorPoint is a no-op for null axis', () => {
  const pt = { x: 2, y: 3, z: 4 };
  assert.deepEqual(mirrorPoint(pt, null), { x: 2, y: 3, z: 4 });
});

test('mirrorPoint does not mutate the input', () => {
  const pt = { x: 2, y: 3, z: 4 };
  mirrorPoint(pt, 'x');
  assert.deepEqual(pt, { x: 2, y: 3, z: 4 });
});

test('mirrorDeltaSign flips exactly one axis', () => {
  assert.deepEqual(mirrorDeltaSign('x'), { x: -1, y: 1, z: 1 });
  assert.deepEqual(mirrorDeltaSign('y'), { x: 1, y: -1, z: 1 });
  assert.deepEqual(mirrorDeltaSign('z'), { x: 1, y: 1, z: -1 });
});

test('mirrorDeltaSign for null is identity', () => {
  assert.deepEqual(mirrorDeltaSign(null), { x: 1, y: 1, z: 1 });
});

test('applying mirrorDeltaSign twice on the same axis is identity', () => {
  // Sanity: two reflections cancel.
  const sign = mirrorDeltaSign('x');
  const v = { x: 0.3, y: -0.2, z: 0.1 };
  const once = { x: v.x * sign.x, y: v.y * sign.y, z: v.z * sign.z };
  const twice = { x: once.x * sign.x, y: once.y * sign.y, z: once.z * sign.z };
  assert.deepEqual(twice, v);
});
