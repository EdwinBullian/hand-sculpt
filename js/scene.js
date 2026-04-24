import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
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

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0); // transparent background

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene = new THREE.Scene();
    this.mesh = null;           // Group holding fill + wireframe
    this._fillMat = null;
    this._wireMat = null;
    this._geom = null;
    this.currentShapeName = 'cube';
    this.setShape(this.currentShapeName);
    this.resize();
  }

  setShape(name) {
    const geom = createShape(name);
    if (!geom) return;
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
    fill.add(wire); // wireframe inherits transforms from fill mesh
    this.mesh = fill;
    this._fillMat = fillMat;
    this._wireMat = wireMat;
    this._geom = geom;
    this.scene.add(this.mesh);
    this.currentShapeName = name;
  }

  // Apply a pose { position: {x,y,z}, quaternion: {x,y,z,w} } to the mesh.
  setPose(pose) {
    if (!this.mesh || !pose) return;
    const p = pose.position;
    const q = pose.quaternion;
    if (p) this.mesh.position.set(p.x, p.y, p.z);
    if (q) this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  // Apply a scale { x, y, z } (non-uniform allowed) to the mesh.
  setScale(scale) {
    if (!this.mesh || !scale) return;
    this.mesh.scale.set(scale.x, scale.y, scale.z);
  }

  // Restore current shape to identity transform (used by Reset button).
  reset() {
    if (!this.mesh) return;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
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
