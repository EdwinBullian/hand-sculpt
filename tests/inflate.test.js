import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateStep } from '../js/inflate.js';

function buf3(vertices) {
  const a = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    a[i * 3] = vertices[i][0]; a[i * 3 + 1] = vertices[i][1]; a[i * 3 + 2] = vertices[i][2];
  }
  return a;
}

test('inflateStep with amount 0 leaves positions unchanged', () => {
  const pos = buf3([[0, 1, 0]]);
  const norm = buf3([[0, 1, 0]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0, 1);
  assert.equal(pos[0], 0); assert.equal(pos[1], 1); assert.equal(pos[2], 0);
});

test('inflateStep pushes vertex outward along normal (sign +1)', () => {
  const pos = buf3([[0, 1, 0]]);
  const norm = buf3([[0, 1, 0]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0.1, 1);
  assert.ok(Math.abs(pos[1] - 1.1) < 1e-5);
});

test('inflateStep pulls vertex inward along normal (sign -1)', () => {
  const pos = buf3([[0, 1, 0]]);
  const norm = buf3([[0, 1, 0]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0.1, -1);
  assert.ok(Math.abs(pos[1] - 0.9) < 1e-5);
});

test('inflateStep scales push by weight', () => {
  const pos = buf3([[0, 0, 0]]);
  const norm = buf3([[0, 0, 1]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 0.5 }], 1, 1);
  assert.ok(Math.abs(pos[2] - 0.5) < 1e-5);
});

test('inflateStep does not affect unlisted vertices', () => {
  const pos = buf3([[0, 0, 0], [5, 5, 5]]);
  const norm = buf3([[0, 1, 0], [0, 1, 0]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0.1, 1);
  assert.equal(pos[3], 5); assert.equal(pos[4], 5); assert.equal(pos[5], 5);
});

test('inflateStep moves along the normal vector direction', () => {
  const pos = buf3([[0, 0, 0]]);
  const norm = buf3([[0.707, 0.707, 0]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 1, 1);
  assert.ok(Math.abs(pos[0] - 0.707) < 1e-3);
  assert.ok(Math.abs(pos[1] - 0.707) < 1e-3);
  assert.ok(Math.abs(pos[2]) < 1e-5);
});

test('inflateStep accumulates across multiple calls', () => {
  const pos = buf3([[0, 0, 1]]);
  const norm = buf3([[0, 0, 1]]);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0.1, 1);
  inflateStep(pos, norm, [{ idx: 0, weight: 1 }], 0.1, 1);
  assert.ok(Math.abs(pos[2] - 1.2) < 1e-5);
});

test('inflateStep with empty region is a no-op', () => {
  const pos = buf3([[0, 1, 0]]);
  inflateStep(pos, buf3([[0, 1, 0]]), [], 1, 1);
  assert.equal(pos[1], 1);
});
