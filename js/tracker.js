import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs';

// Tracks up to 2 hands per frame via MediaPipe HandLandmarker.
// Call init() once, then detect(videoEl, timestampMs) each frame.
export class Tracker {
  constructor() {
    this.landmarker = null;
    this.lastResults = { landmarks: [], handedness: [] };
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
    });
  }

  detect(videoEl, timestampMs) {
    if (!this.landmarker || videoEl.readyState < 2) return this.lastResults;
    const r = this.landmarker.detectForVideo(videoEl, timestampMs);
    this.lastResults = {
      landmarks: r.landmarks || [],
      handedness: r.handedness || [],
    };
    return this.lastResults;
  }
}
