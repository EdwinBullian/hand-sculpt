// SingleHandPose: the "Force" gesture.
// Consumes MediaPipe results and produces { active, paused, position, quaternion }.
// Active when exactly one hand has palm facing camera; paused when both hands
// show their backs. All other states are inactive + not paused.

import { palmNormal, palmFacesCamera } from './palmDirection.js';

// Position mapping from MediaPipe hand-space (x,y ∈ [0,1], z ≈ [-0.3,+0.3]) to
// Three.js world coords. Tunable — see design.md §11 "Open Questions."
const XY_SCALE = 4;    // hand x/y displacement of 0.5 → ±2 world units
const Z_SCALE = 3.33;  // hand z displacement of 0.3 → ±1 world unit

export function handSpaceToWorld(p) {
  return {
    x: -(p.x - 0.5) * XY_SCALE,   // mirror flip: hand-right on screen → world +X
    y: -(p.y - 0.5) * XY_SCALE,   // y-axis flip: MediaPipe y-down → world y-up
    z: -p.z * Z_SCALE,             // z flip: MediaPipe z-toward-camera is negative → world +Z
  };
}

export function palmCentroid(landmarks) {
  const idx = [0, 5, 9, 13, 17]; // wrist + 4 knuckles
  let sx = 0, sy = 0, sz = 0;
  for (const i of idx) {
    sx += landmarks[i].x;
    sy += landmarks[i].y;
    sz += landmarks[i].z;
  }
  return { x: sx / idx.length, y: sy / idx.length, z: sz / idx.length };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function flipToWorld(v) {
  // Same axis flips as position: mirror x, y-down→y-up, z-toward-camera→world +Z.
  return { x: -v.x, y: -v.y, z: -v.z };
}

// Build a unit quaternion from a 3x3 rotation matrix whose columns are the
// world-space axes of the object's local frame (X=right, Y=up, Z=normal).
// Standard Shepperd's method.
function quaternionFromBasis(right, up, normal) {
  const m00 = right.x, m01 = up.x, m02 = normal.x;
  const m10 = right.y, m11 = up.y, m12 = normal.y;
  const m20 = right.z, m21 = up.z, m22 = normal.z;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}

function handQuaternion(landmarks, isLeftHand) {
  const wrist = landmarks[0];
  const middleMCP = landmarks[9];
  const upHand = normalize(sub(middleMCP, wrist));
  const normalHand = palmNormal(landmarks, isLeftHand);
  const up = normalize(flipToWorld(upHand));
  const normal = normalize(flipToWorld(normalHand));
  let right = normalize(cross(up, normal));
  if (right.x === 0 && right.y === 0 && right.z === 0) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const upOrtho = normalize(cross(normal, right));
  return quaternionFromBasis(right, upOrtho, normal);
}

export class SingleHandPose {
  detect(results) {
    const palmUp = [];
    const palmDown = [];
    if (!results || !results.landmarks || !results.handedness) {
      return { active: false, paused: false };
    }
    for (let i = 0; i < results.landmarks.length; i++) {
      const lm = results.landmarks[i];
      const side = results.handedness[i]?.[0]?.categoryName;
      if (side !== 'Left' && side !== 'Right') continue;
      const isLeftHand = side === 'Left';
      if (palmFacesCamera(lm, isLeftHand)) {
        palmUp.push({ lm, isLeftHand });
      } else {
        palmDown.push({ lm, isLeftHand });
      }
    }

    if (palmUp.length === 0 && palmDown.length === 2) {
      return { active: false, paused: true };
    }

    if (palmUp.length === 1) {
      const { lm, isLeftHand } = palmUp[0];
      const centroid = palmCentroid(lm);
      const position = handSpaceToWorld(centroid);
      const quaternion = handQuaternion(lm, isLeftHand);
      return { active: true, paused: false, position, quaternion };
    }

    return { active: false, paused: false };
  }
}
