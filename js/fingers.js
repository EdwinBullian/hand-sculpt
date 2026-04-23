// MediaPipe Hands landmark indices:
//   0  = wrist
//   1..4  = thumb (CMC, MCP, IP, TIP)
//   5..8  = index (MCP, PIP, DIP, TIP)
//   9..12 = middle
//   13..16= ring
//   17..20= pinky
//
// Heuristic: a finger is extended when its TIP is farther from the wrist
// than the joint one below the tip (PIP for fingers, IP for thumb).
// Works regardless of hand orientation.

const FINGER_PAIRS = [
  [4,  3],    // thumb: tip vs IP
  [8,  6],    // index: tip vs PIP
  [12, 10],   // middle
  [16, 14],   // ring
  [20, 18],   // pinky
];

function dist2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function countExtendedFingers(landmarks) {
  if (!landmarks || landmarks.length < 21) return 0;
  const wrist = landmarks[0];
  let count = 0;
  for (const [tipIdx, pivotIdx] of FINGER_PAIRS) {
    const tipD   = dist2d(landmarks[tipIdx],   wrist);
    const pivotD = dist2d(landmarks[pivotIdx], wrist);
    if (tipD > pivotD) count++;
  }
  return count;
}
