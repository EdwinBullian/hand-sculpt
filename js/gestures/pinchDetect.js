// Pinch detection: thumb tip (landmark 4) and index tip (landmark 8) within threshold.

export function isPinched(landmarks, threshold = 0.05) {
  if (!landmarks || landmarks.length < 21) return false;
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dx = thumb.x - index.x;
  const dy = thumb.y - index.y;
  const dz = thumb.z - index.z;
  return Math.hypot(dx, dy, dz) < threshold;
}

export function pinchPoint(landmarks) {
  if (!landmarks || landmarks.length < 21) return { x: 0, y: 0, z: 0 };
  const thumb = landmarks[4];
  const index = landmarks[8];
  return {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
    z: (thumb.z + index.z) / 2,
  };
}
