import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs';

// If the model drops all hands for fewer than this many frames (e.g. during a
// wrist rotation), hold the last known landmarks rather than snapping to idle.
const STICKY_FRAMES = 8; // ~133ms at 60fps

// Tracks up to 2 hands per frame via MediaPipe HandLandmarker.
// Call init() once, then detect(videoEl, timestampMs) each frame.
export class Tracker {
  constructor() {
    this.landmarker = null;
    this.lastResults = { landmarks: [], worldLandmarks: [], handedness: [] };
    this._stickyCount = 0;
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
    );
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      // Lowered from defaults (0.5) for better resilience when hand rotates
      // far from camera-facing orientation (e.g. mid-gesture palm flipping).
      minHandDetectionConfidence: 0.2,
      minHandPresenceConfidence: 0.15,
      minTrackingConfidence: 0.2,
    });
  }

  detect(videoEl, timestampMs) {
    if (!this.landmarker || videoEl.readyState < 2) return this.lastResults;
    const r = this.landmarker.detectForVideo(videoEl, timestampMs);
    const fresh = {
      landmarks: r.landmarks || [],
      worldLandmarks: r.worldLandmarks || [],
      handedness: r.handedness || [],
    };
    if (fresh.landmarks.length === 0 && this.lastResults.landmarks.length > 0) {
      // Brief loss of detection — hold last known results for STICKY_FRAMES
      if (this._stickyCount < STICKY_FRAMES) {
        this._stickyCount++;
        return this.lastResults;
      }
    } else {
      this._stickyCount = 0;
    }
    this.lastResults = fresh;
    return fresh;
  }
}
