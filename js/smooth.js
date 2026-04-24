// Pure smoothing math for the smooth-brush sculpt tool. Scene.js calls these
// on its BufferGeometry position array; they don't touch Three.js.
//
// "Smooth" here means laplacian averaging: each vertex in the brush region
// moves a fraction of the way toward the centroid of its nearby neighbors,
// which washes out high-frequency noise while preserving overall shape.

// Find all vertices within `falloffRadius` of `center`. Returns a list of
// { idx, weight }, where weight falls linearly from 1 at the center to 0 at
// the far edge of the radius. Input positions is a flat [x0,y0,z0, x1,...].
export function brushIndicesInRegion(positions, center, falloffRadius) {
  if (falloffRadius <= 0) return [];
  const count = positions.length / 3;
  const out = [];
  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3]     - center.x;
    const dy = positions[i * 3 + 1] - center.y;
    const dz = positions[i * 3 + 2] - center.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < falloffRadius) {
      out.push({ idx: i, weight: 1 - d / falloffRadius });
    }
  }
  return out;
}

// One iteration of laplacian smoothing on the given brush region. Each vertex
// in `brushIndices` moves toward the mean position of OTHER vertices within
// `neighborRadius` of it, by `clamp(strength * weight, 0, 1)`. Positions
// outside the brush are not touched and serve only as neighbor references.
// Positions is mutated in place; a staging buffer is used so each vertex's
// new position depends on the pre-step state (otherwise the result would
// drift as the iteration progresses through the list).
export function smoothStep(positions, brushIndices, neighborRadius, strength) {
  const count = positions.length / 3;
  const updates = new Float32Array(brushIndices.length * 3);

  for (let bi = 0; bi < brushIndices.length; bi++) {
    const { idx, weight } = brushIndices[bi];
    const x = positions[idx * 3];
    const y = positions[idx * 3 + 1];
    const z = positions[idx * 3 + 2];

    let sumX = 0, sumY = 0, sumZ = 0, n = 0;
    for (let j = 0; j < count; j++) {
      if (j === idx) continue;
      const nx = positions[j * 3];
      const ny = positions[j * 3 + 1];
      const nz = positions[j * 3 + 2];
      const d = Math.hypot(nx - x, ny - y, nz - z);
      if (d < neighborRadius) {
        sumX += nx; sumY += ny; sumZ += nz; n++;
      }
    }
    if (n === 0) {
      updates[bi * 3]     = x;
      updates[bi * 3 + 1] = y;
      updates[bi * 3 + 2] = z;
    } else {
      const cx = sumX / n;
      const cy = sumY / n;
      const cz = sumZ / n;
      const s = Math.max(0, Math.min(1, strength * weight));
      updates[bi * 3]     = x + (cx - x) * s;
      updates[bi * 3 + 1] = y + (cy - y) * s;
      updates[bi * 3 + 2] = z + (cz - z) * s;
    }
  }

  for (let bi = 0; bi < brushIndices.length; bi++) {
    const { idx } = brushIndices[bi];
    positions[idx * 3]     = updates[bi * 3];
    positions[idx * 3 + 1] = updates[bi * 3 + 1];
    positions[idx * 3 + 2] = updates[bi * 3 + 2];
  }
}
