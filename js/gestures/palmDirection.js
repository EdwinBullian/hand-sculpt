// MediaPipe hand landmarks:
//   0  = wrist, 5 = index MCP, 17 = pinky MCP
// Palm normal is computed as (indexMCP - wrist) × (pinkyMCP - wrist).
// For a RIGHT hand with palm facing camera this cross product points TOWARD the camera (z < 0).
// For a LEFT hand it points AWAY, so we negate to keep the convention consistent:
// after this function, palm-facing-camera always means result.z < 0.

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

export function palmNormal(landmarks, isLeftHand) {
  if (!landmarks || landmarks.length < 21) return { x: 0, y: 0, z: 0 };
  const wrist = landmarks[0];
  const indexMCP = landmarks[5];
  const pinkyMCP = landmarks[17];
  const v1 = sub(indexMCP, wrist);
  const v2 = sub(pinkyMCP, wrist);
  let n = cross(v1, v2);
  if (isLeftHand) {
    n = { x: -n.x, y: -n.y, z: -n.z };
  }
  const len = Math.hypot(n.x, n.y, n.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}

export function palmFacesCamera(landmarks, isLeftHand) {
  if (!landmarks || landmarks.length < 21) return false;
  const n = palmNormal(landmarks, isLeftHand);
  return n.z < 0;
}
