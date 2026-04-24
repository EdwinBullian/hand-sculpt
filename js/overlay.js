// 21-landmark hand skeleton: pairs of indices that form bones.
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],           // index
  [5, 9], [9, 10], [10, 11], [11, 12],      // middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [0, 17],                                   // wrist → pinky MCP (palm edge)
];

// Renders the overlay canvas (mirrored webcam image, hand skeletons, debug HUD).
export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = w;
    this.cssHeight = h;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  drawVideo(videoEl) {
    // Mirror horizontally so movement feels natural (right hand moves right on screen).
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(videoEl, -this.cssWidth, 0, this.cssWidth, this.cssHeight);
    this.ctx.restore();
  }

  drawHands(handsLandmarks) {
    const w = this.cssWidth;
    const h = this.cssHeight;
    for (const lm of handsLandmarks) {
      // Mirror landmark X to match mirrored video.
      const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
      // Skeleton lines.
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) {
        this.ctx.beginPath();
        this.ctx.moveTo(pts[a].x, pts[a].y);
        this.ctx.lineTo(pts[b].x, pts[b].y);
        this.ctx.stroke();
      }
      // Joint dots.
      this.ctx.fillStyle = '#4488ff';
      for (const p of pts) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawHUD({ leftFingers, rightFingers, totalFingers, gesture, shape, fps, undoDepth }) {
    const lines = [
      `Left: ${leftFingers}  Right: ${rightFingers}  Total: ${totalFingers}`,
      `Gesture: ${gesture}`,
      `Shape: ${shape}`,
    ];
    if (fps !== undefined) lines.push(`FPS: ${fps}`);
    if (undoDepth !== undefined && undoDepth > 0) lines.push(`Undo stack: ${undoDepth} (press Z)`);
    const pad = 8;
    const lh = 22;
    this.ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(pad, pad, 280, lh * lines.length + pad);
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], pad + 8, pad + 16 + i * lh);
    }
  }
}
