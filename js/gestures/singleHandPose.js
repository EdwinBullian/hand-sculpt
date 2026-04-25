// SingleHandPose: the "Force" gesture.
// Consumes MediaPipe results and produces { active, position, quaternion, handCount }.
// Active when one or two palms face the camera.
// - 1 palm up: position = that palm's centroid; orientation = that palm's quaternion.
// - 2 palms up: position = midpoint of both centroids; orientation = averaged quaternion.
// Reset and freeze are handled by separate gestures (BothBacksReset, SnapFreeze).

import { palmNormal, palmFacesCamera } from './palmDirection.js';

// Position mapping from MediaPipe hand-space to Three.js world coords.
const X_SCALE = 8;    // hand x displacement of 0.5 → ±4 world units
const Y_SCALE = 5;    // hand y displacement of 0.5 → ±2.5 world units

export function handSpaceToWorld(p, worldZ = 0) {
  return {
    x: -(p.x - 0.5) * X_SCALE,
    y: -(p.y - 0.5) * Y_SCALE,
    z: worldZ,
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

function averageQuaternion(q1, q2) {
  // Double-cover shortcut: if dot < 0 flip q2 so we take the short path.
  const dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
  const q2s = dot < 0 ? { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w } : q2;
  const ax = (q1.x + q2s.x) * 0.5;
  const ay = (q1.y + q2s.y) * 0.5;
  const az = (q1.z + q2s.z) * 0.5;
  const aw = (q1.w + q2s.w) * 0.5;
  const len = Math.hypot(ax, ay, az, aw);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: ax / len, y: ay / len, z: az / len, w: aw / len };
}

export class SingleHandPose {
  detect(results) {
    const palmUp = [];
    if (!results || !results.landmarks || !results.handedness) {
      return { active: false, handCount: 0 };
    }
    for (let i = 0; i < results.landmarks.length; i++) {
      const lm = results.landmarks[i];
      const side = results.handedness[i]?.[0]?.categoryName;
      if (side !== 'Left' && side !== 'Right') continue;
      const isLeftHand = side === 'Left';
      if (palmFacesCamera(lm, isLeftHand)) {
        palmUp.push({ lm, isLeftHand });
      }
    }

    if (palmUp.length === 1) {
      const { lm, isLeftHand } = palmUp[0];
      const centroid = palmCentroid(lm);
      const position = handSpaceToWorld(centroid);
      const quaternion = handQuaternion(lm, isLeftHand);
      return { active: true, handCount: 1, position, quaternion };
    }

    if (palmUp.length === 2) {
      const c0 = palmCentroid(palmUp[0].lm);
      const c1 = palmCentroid(palmUp[1].lm);
      const w0 = handSpaceToWorld(c0);
      const w1 = handSpaceToWorld(c1);
      const position = { x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2, z: (w0.z + w1.z) / 2 };
      const q0 = handQuaternion(palmUp[0].lm, palmUp[0].isLeftHand);
      const q1 = handQuaternion(palmUp[1].lm, palmUp[1].isLeftHand);
      const quaternion = averageQuaternion(q0, q1);
      return { active: true, handCount: 2, position, quaternion };
    }

    return { active: false, handCount: 0 };
  }
}
