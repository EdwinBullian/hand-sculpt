// Thin wrapper around getUserMedia. Pipes webcam video into a given <video>.
export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  get ready() {
    // readyState >= 2 (HAVE_CURRENT_DATA) — at least one frame is available
    return this.video.readyState >= 2;
  }
}
