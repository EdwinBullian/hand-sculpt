// Pure helpers for mirror-sculpt support. Kept separate from scene.js so the
// math is unit-testable without pulling in Three.js.
//
// A "mirror axis" is either null (off) or one of 'x' | 'y' | 'z'. When set,
// every vertex deformation the sculpt API applies is duplicated on the
// opposite side of that axis, with the motion-delta on that axis negated so
// the object stays symmetric.

export const MIRROR_AXES = ['x', 'y', 'z'];

// Cycle order used by the `M` key binding: off → x → y → z → off.
export function nextMirrorAxis(axis) {
  if (axis === 'x') return 'y';
  if (axis === 'y') return 'z';
  if (axis === 'z') return null;
  return 'x';
}

// Return a new {x,y,z} with the given axis negated. No mutation, no axis = no-op.
export function mirrorPoint(pt, axis) {
  const out = { x: pt.x, y: pt.y, z: pt.z };
  if (axis === 'x') out.x = -out.x;
  else if (axis === 'y') out.y = -out.y;
  else if (axis === 'z') out.z = -out.z;
  return out;
}

// Multiplier for a motion delta so it mirrors correctly across the axis.
// null → {1,1,1} (no flip); 'x' → {-1,1,1}; etc.
export function mirrorDeltaSign(axis) {
  const out = { x: 1, y: 1, z: 1 };
  if (axis === 'x') out.x = -1;
  else if (axis === 'y') out.y = -1;
  else if (axis === 'z') out.z = -1;
  return out;
}
