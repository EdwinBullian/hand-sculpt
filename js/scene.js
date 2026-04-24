import * as THREE from 'three';
import { createShape } from './shapes.js';

// Manages the Three.js scene, camera, renderer, and the currently-displayed mesh.
// Each shape is a Group containing:
//   - a filled mesh with a vertical gray→white gradient (via vertex colors)
//   - a wireframe mesh as a child (inherits the group's transforms)
// The wireframe stays on top so mesh edges are always visible.

function applyVertexGradient(geom) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const range = maxY - minY || 1;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / range;
    // 0.15 (dark gray) at the bottom → 0.95 (near white) at the top.
    const c = 0.15 + t * 0.8;
    colors[i * 3]     = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Default pick / falloff radii (world units). Shapes are roughly 1–1.5 units
// across, so 0.5 gives generous "near surface" tolerance and 0.8 pulls a
// smooth region of neighbors along with the primary vertex.
const SCULPT_PICK_RADIUS = 0.5;
const SCULPT_FALLOFF_RADIUS = 0.8;

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene = new THREE.Scene();
    this.mesh = null;
    this._fillMat = null;
    this._wireMat = null;
    this._geom = null;
    // Sculpt state.
    this._sculpting = false;
    this._sculptOriginals = null;       // Map<vertexIndex, {x,y,z,weight}>
    this._sculptInitialPinchLocal = null;
    this.currentShapeName = 'cube';
    this.setShape(this.currentShapeName);
    this.resize();
  }

  setShape(name) {
    const geom = createShape(name);
    if (!geom) return;
    this.stopSculpt();
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this._geom) this._geom.dispose();
      if (this._fillMat) this._fillMat.dispose();
      if (this._wireMat) this._wireMat.dispose();
    }
    applyVertexGradient(geom);
    const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    const fill = new THREE.Mesh(geom, fillMat);
    const wire = new THREE.Mesh(geom, wireMat);
    fill.add(wire);
    this.mesh = fill;
    this._fillMat = fillMat;
    this._wireMat = wireMat;
    this._geom = geom;
    this.scene.add(this.mesh);
    this.currentShapeName = name;
  }

  setPose(pose) {
    if (!this.mesh || !pose) return;
    const p = pose.position;
    const q = pose.quaternion;
    if (p) this.mesh.position.set(p.x, p.y, p.z);
    if (q) this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  setScale(scale) {
    if (!this.mesh || !scale) return;
    this.mesh.scale.set(scale.x, scale.y, scale.z);
  }

  // Restore: fresh geometry + identity transform. Undoes any sculpting.
  reset() {
    this.stopSculpt();
    this.setShape(this.currentShapeName);
  }

  // ---------- Sculpt API ----------

  get isSculpting() {
    return this._sculpting === true;
  }

  // Try to grab the nearest vertex to `worldPoint`. Returns true on success.
  // On success, stores original positions + falloff weights for every vertex
  // within SCULPT_FALLOFF_RADIUS of the primary vertex, so `updateSculpt` can
  // smoothly deform a neighborhood, not just one point.
  startSculpt(worldPoint) {
    if (!this._geom || !this.mesh) return false;
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();

    // Find the nearest vertex in WORLD space to the pinch.
    const vLocal = new THREE.Vector3();
    const vWorld = new THREE.Vector3();
    let minD = Infinity, primaryIdx = -1;
    for (let i = 0; i < pos.count; i++) {
      vLocal.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      vWorld.copy(vLocal).applyMatrix4(this.mesh.matrixWorld);
      const dx = vWorld.x - worldPoint.x;
      const dy = vWorld.y - worldPoint.y;
      const dz = vWorld.z - worldPoint.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < minD) { minD = d; primaryIdx = i; }
    }
    if (primaryIdx < 0 || minD > SCULPT_PICK_RADIUS) return false;

    // Build falloff map in LOCAL space (so it stays valid when the cube rotates).
    const px = pos.getX(primaryIdx);
    const py = pos.getY(primaryIdx);
    const pz = pos.getZ(primaryIdx);
    this._sculptOriginals = new Map();
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - px;
      const dy = pos.getY(i) - py;
      const dz = pos.getZ(i) - pz;
      const d = Math.hypot(dx, dy, dz);
      if (d < SCULPT_FALLOFF_RADIUS) {
        // Linear falloff: primary vertex gets weight 1; far edge gets 0.
        const w = 1 - d / SCULPT_FALLOFF_RADIUS;
        this._sculptOriginals.set(i, {
          x: pos.getX(i),
          y: pos.getY(i),
          z: pos.getZ(i),
          weight: w,
        });
      }
    }

    // Initial pinch position transformed into local space.
    const initLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    this._sculptInitialPinchLocal = { x: initLocal.x, y: initLocal.y, z: initLocal.z };
    this._sculpting = true;
    return true;
  }

  updateSculpt(worldPoint) {
    if (!this._sculpting || !this._geom || !this.mesh) return;
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const nowLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);

    const dx = nowLocal.x - this._sculptInitialPinchLocal.x;
    const dy = nowLocal.y - this._sculptInitialPinchLocal.y;
    const dz = nowLocal.z - this._sculptInitialPinchLocal.z;

    for (const [idx, orig] of this._sculptOriginals) {
      pos.setXYZ(
        idx,
        orig.x + dx * orig.weight,
        orig.y + dy * orig.weight,
        orig.z + dz * orig.weight,
      );
    }
    pos.needsUpdate = true;
    // Keep the gradient in sync: vertex colors are cheap to recompute and the
    // top/bottom of the shape can shift noticeably during sculpting.
    applyVertexGradient(this._geom);
  }

  stopSculpt() {
    this._sculpting = false;
    this._sculptOriginals = null;
    this._sculptInitialPinchLocal = null;
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
