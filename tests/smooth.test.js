import test from 'node:test';
import assert from 'node:assert/strict';
import { brushIndicesInRegion, smoothStep } from '../js/smooth.js';

function positionsFrom(vertices) {
  const a = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    a[i * 3]     = vertices[i][0];
    a[i * 3 + 1] = vertices[i][1];
    a[i * 3 + 2] = vertices[i][2];
  }
  return a;
}

test('brushIndicesInRegion returns empty when all vertices are outside radius', () => {
  const pos = positionsFrom([[10, 10, 10], [20, 20, 20]]);
  const region = brushIndicesInRegion(pos, { x: 0, y: 0, z: 0 }, 1);
  assert.deepEqual(region, []);
});

test('brushIndicesInRegion weights decrease linearly with distance', () => {
  // Vertices at 0 (center) and 0.5 (half-radius) from origin; falloff=1.
  const pos = positionsFrom([[0, 0, 0], [0.5, 0, 0], [2, 0, 0]]);
  const region = brushIndicesInRegion(pos, { x: 0, y: 0, z: 0 }, 1);
  assert.equal(region.length, 2);
  assert.equal(region[0].idx, 0);
  assert.ok(Math.abs(region[0].weight - 1) < 1e-6);
  assert.equal(region[1].idx, 1);
  assert.ok(Math.abs(region[1].weight - 0.5) < 1e-6);
});

test('brushIndicesInRegion returns empty for non-positive radius', () => {
  const pos = positionsFrom([[0, 0, 0]]);
  assert.deepEqual(brushIndicesInRegion(pos, { x: 0, y: 0, z: 0 }, 0), []);
  assert.deepEqual(brushIndicesInRegion(pos, { x: 0, y: 0, z: 0 }, -1), []);
});

test('smoothStep with strength 0 leaves positions unchanged', () => {
  const pos = positionsFrom([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const copy = new Float32Array(pos);
  const region = [{ idx: 0, weight: 1 }];
  smoothStep(pos, region, 5, 0);
  assert.deepEqual(Array.from(pos), Array.from(copy));
});

test('smoothStep flattens a spike toward neighbor mean (strength 1)', () => {
  // Vertex 0 is a spike at y=1; its neighbors sit on y=0. Neighbor mean y = 0,
  // so with strength 1 the spike snaps to mean.
  const pos = positionsFrom([
    [0, 1, 0],       // spike
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]);
  const region = [{ idx: 0, weight: 1 }];
  smoothStep(pos, region, 5, 1);
  // y should collapse from 1 to 0 (neighbor mean); x/z stay put.
  assert.ok(Math.abs(pos[0]) < 1e-6);
  assert.ok(Math.abs(pos[1]) < 1e-6);
  assert.ok(Math.abs(pos[2]) < 1e-6);
});

test('smoothStep moves partway toward mean at strength 0.5', () => {
  const pos = positionsFrom([[0, 1, 0], [1, 0, 0], [-1, 0, 0]]);
  const region = [{ idx: 0, weight: 1 }];
  smoothStep(pos, region, 5, 0.5);
  // Neighbor mean is (0, 0, 0); halfway from (0,1,0) → (0, 0.5, 0).
  assert.ok(Math.abs(pos[1] - 0.5) < 1e-6);
});

test('smoothStep is a no-op for a vertex with no neighbors in radius', () => {
  const pos = positionsFrom([[0, 0, 0], [10, 10, 10]]);
  const region = [{ idx: 0, weight: 1 }];
  smoothStep(pos, region, 1, 1); // vertex 1 is outside neighborRadius
  assert.equal(pos[0], 0);
  assert.equal(pos[1], 0);
  assert.equal(pos[2], 0);
});

test('smoothStep only mutates brush vertices, not unlisted neighbors', () => {
  const pos = positionsFrom([[0, 1, 0], [1, 0, 0], [-1, 0, 0]]);
  const region = [{ idx: 0, weight: 1 }];
  smoothStep(pos, region, 5, 1);
  // Vertices 1 and 2 must be untouched even though they were used as neighbors.
  assert.equal(pos[3], 1); assert.equal(pos[4], 0); assert.equal(pos[5], 0);
  assert.equal(pos[6], -1); assert.equal(pos[7], 0); assert.equal(pos[8], 0);
});

test('smoothStep uses pre-step positions (not in-place during iteration)', () => {
  // A and B are each other's only neighbor (radius 1, dist 0.5). With
  // strength 1 and pre-step logic they *swap* positions. In-place logic would
  // pick up A's new position when computing B, so B would not move.
  const pos = positionsFrom([[0, 0, 0], [0.5, 0, 0]]);
  const region = [{ idx: 0, weight: 1 }, { idx: 1, weight: 1 }];
  smoothStep(pos, region, 1, 1);
  assert.ok(Math.abs(pos[0] - 0.5) < 1e-6, 'A should land at B\'s original position');
  assert.ok(Math.abs(pos[3]) < 1e-6, 'B should land at A\'s original position');
});
