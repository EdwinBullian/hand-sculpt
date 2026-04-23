import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { createShape } from './shapes.js';

// Manages the Three.js scene, camera, renderer, and the currently-displayed mesh.
// One shape at a time, wireframe material only.
export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0); // transparent background

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene = new THREE.Scene();
    this.mesh = null;
    this.currentShapeName = 'cube';
    this.setShape(this.currentShapeName);
    this.resize();
  }

  setShape(name) {
    const geom = createShape(name);
    if (!geom) return;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.mesh = new THREE.Mesh(geom, mat);
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
