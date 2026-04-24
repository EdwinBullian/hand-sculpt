import * as THREE from 'three';
import { createShape } from './shapes.js';
import { mirrorPoint, mirrorDeltaSign } from './mirror.js';
import { brushIndicesInRegion, smoothStep } from './smooth.js';
import { inflateStep } from './inflate.js';
import { PALETTES, cyclePaletteIndex, paletteColorAt } from './palettes.js';

// Manages the Three.js scene, camera, renderer, and the currently-displayed mesh.
// Each shape is a Group containing:
//   - a filled mesh with a vertical gray→white gradient (via vertex colors)
//   - a wireframe mesh as a child (inherits the group's transforms)
// The wireframe stays on top so mesh edges are always visible.

function applyVertexGradient(geom, palette) {
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
    const c = paletteColorAt(palette, t);
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Default pick / falloff radii (world units). Shapes are roughly 1–1.5 units
// across, so 0.5 gives generous "near surface" tolerance and 0.8 pulls a
// smooth region of neighbors along with the primary vertex. The settings
// panel can override these at runtime via `scene.sculptPickRadius` etc.
export const DEFAULT_SCULPT_PICK_RADIUS = 0.5;
export const DEFAULT_SCULPT_FALLOFF_RADIUS = 0.8;
// Smooth brush defaults. Strength is per-frame; holding the pinch longer
// deepens the effect. Neighbor radius is how far the laplacian looks for
// the local mean — too small = ineffective, too large = shape collapses.
export const DEFAULT_SMOOTH_NEIGHBOR_RADIUS = 0.25;
export const DEFAULT_SMOOTH_STRENGTH = 0.15;
// Inflate / deflate brush: per-frame push distance in local mesh units.
// Small values (0.003–0.01) give a slow continuous push; larger values stamp harder.
export const DEFAULT_INFLATE_STEP_SIZE = 0.005;

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
    this._sculptOriginals = null;       // Map<vertexIndex, {x,y,z,contribs:[{weight,sx,sy,sz}]}>
    this._sculptInitialPinchLocal = null;
    this._sculptUndoStack = [];         // Float32Array snapshots of position attribute
    this._sculptRedoStack = [];         // snapshots invalidated by undo, replayed by redo
    this._UNDO_LIMIT = 20;
    // Mirror sculpt: null | 'x' | 'y' | 'z'. When set, each sculpt deformation
    // is duplicated across that axis with the on-axis motion-delta flipped.
    this.mirrorAxis = null;
    // Brush tool: 'drag' pulls a neighborhood with the hand; 'smooth' runs a
    // laplacian average per frame to flatten noise. Locked in at startSculpt
    // so switching B mid-stroke doesn't corrupt state.
    this.brushMode = 'drag';
    this._sculptMode = 'drag';
    // Palette index into PALETTES; cycled by `C` from main.js.
    this.paletteIndex = 0;
    // Tunable sculpt / smooth parameters. Settings panel writes these directly.
    this.sculptPickRadius = DEFAULT_SCULPT_PICK_RADIUS;
    this.sculptFalloffRadius = DEFAULT_SCULPT_FALLOFF_RADIUS;
    this.smoothNeighborRadius = DEFAULT_SMOOTH_NEIGHBOR_RADIUS;
    this.smoothStrength = DEFAULT_SMOOTH_STRENGTH;
    this.inflateStepSize = DEFAULT_INFLATE_STEP_SIZE;
    this.currentShapeName = 'cube';
    this.setShape(this.currentShapeName);
    this.resize();
  }

  setShape(name) {
    const geom = createShape(name);
    if (!geom) return;
    this.stopSculpt();
    this._sculptUndoStack.length = 0; // snapshots are tied to the old geometry
    this._sculptRedoStack.length = 0;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this._geom) this._geom.dispose();
      if (this._fillMat) this._fillMat.dispose();
      if (this._wireMat) this._wireMat.dispose();
    }
    applyVertexGradient(geom, PALETTES[this.paletteIndex]);
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

  setMirrorAxis(axis) {
    // null | 'x' | 'y' | 'z'. Takes effect on the next startSculpt; an
    // in-flight sculpt keeps whatever regions it captured.
    this.mirrorAxis = axis;
  }

  setBrushMode(mode) {
    // 'drag' | 'smooth'. Takes effect on the next startSculpt — an in-flight
    // stroke keeps the mode it was started with.
    this.brushMode = mode;
  }

  cyclePalette() {
    this.paletteIndex = cyclePaletteIndex(this.paletteIndex);
    if (this._geom) {
      applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
      // Render once so the change shows even when the tick loop isn't running.
      this.render();
    }
    return this.paletteIndex;
  }

  get paletteName() {
    return PALETTES[this.paletteIndex].name;
  }

  // ---------- Sculpt API ----------

  get isSculpting() {
    return this._sculpting === true;
  }

  // Public sculpt entry point — dispatches to the current brush mode. Returns
  // true if a stroke was started (geometry claimed), false if the pinch was
  // too far from any vertex / brush region is empty.
  startSculpt(worldPoint) {
    if (this.brushMode === 'smooth') return this._startSmooth(worldPoint);
    if (this.brushMode === 'inflate') return this._startInflate(worldPoint, 1);
    if (this.brushMode === 'deflate') return this._startInflate(worldPoint, -1);
    return this._startDrag(worldPoint);
  }

  // Drag sculpt: grab the nearest vertex to `worldPoint`, build one or more
  // "brush regions" (primary + optional mirror), and store per-vertex
  // contribution lists so `_updateDrag` can deform both sides of a symmetric
  // sculpt in a single pass.
  _startDrag(worldPoint) {
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
    if (primaryIdx < 0 || minD > this.sculptPickRadius) return false;

    // New edit invalidates the forward-redo history.
    this._sculptRedoStack.length = 0;
    // Snapshot the pre-mutation position buffer for undo. Float32Array.slice
    // returns a fresh buffer, decoupled from the live attribute.
    this._sculptUndoStack.push(pos.array.slice());
    if (this._sculptUndoStack.length > this._UNDO_LIMIT) {
      this._sculptUndoStack.shift();
    }

    // Build the list of brush regions: always the primary, plus one mirrored
    // region if mirrorAxis is set. Centers are in LOCAL space so they stay
    // valid across rotations.
    const primaryLocal = {
      x: pos.getX(primaryIdx),
      y: pos.getY(primaryIdx),
      z: pos.getZ(primaryIdx),
    };
    const regions = [{ center: primaryLocal, deltaSign: { x: 1, y: 1, z: 1 } }];
    if (this.mirrorAxis) {
      regions.push({
        center: mirrorPoint(primaryLocal, this.mirrorAxis),
        deltaSign: mirrorDeltaSign(this.mirrorAxis),
      });
    }

    // For each vertex inside any region's falloff ball, record one
    // contribution per enclosing region. A vertex near the symmetry plane
    // will naturally end up in both regions — its deltas sum, which is the
    // correct mirrored behavior.
    this._sculptOriginals = new Map();
    for (const region of regions) {
      const { center, deltaSign } = region;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - center.x;
        const dy = pos.getY(i) - center.y;
        const dz = pos.getZ(i) - center.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < this.sculptFalloffRadius) {
          const w = 1 - d / this.sculptFalloffRadius;
          let entry = this._sculptOriginals.get(i);
          if (!entry) {
            entry = {
              x: pos.getX(i),
              y: pos.getY(i),
              z: pos.getZ(i),
              contribs: [],
            };
            this._sculptOriginals.set(i, entry);
          }
          entry.contribs.push({
            weight: w,
            sx: deltaSign.x,
            sy: deltaSign.y,
            sz: deltaSign.z,
          });
        }
      }
    }

    // Initial pinch position transformed into local space.
    const initLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    this._sculptInitialPinchLocal = { x: initLocal.x, y: initLocal.y, z: initLocal.z };
    this._sculptMode = 'drag';
    this._sculpting = true;
    return true;
  }

  // Smooth sculpt: no originals, no delta tracking. Each frame we recompute
  // the brush region at the current pinch point and run one laplacian
  // iteration — holding longer / dragging paints more smoothing.
  _startSmooth(worldPoint) {
    if (!this._geom || !this.mesh) return false;
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();

    const initLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    const region = brushIndicesInRegion(
      pos.array,
      { x: initLocal.x, y: initLocal.y, z: initLocal.z },
      this.sculptFalloffRadius,
    );
    if (region.length === 0) return false;

    // New edit invalidates the forward-redo history.
    this._sculptRedoStack.length = 0;
    // Snapshot for undo — one snapshot per stroke, same as drag.
    this._sculptUndoStack.push(pos.array.slice());
    if (this._sculptUndoStack.length > this._UNDO_LIMIT) {
      this._sculptUndoStack.shift();
    }

    this._sculptMode = 'smooth';
    this._sculpting = true;
    return true;
  }

  updateSculpt(worldPoint) {
    if (!this._sculpting || !this._geom || !this.mesh) return;
    if (this._sculptMode === 'smooth') return this._updateSmooth(worldPoint);
    if (this._sculptMode === 'inflate' || this._sculptMode === 'deflate') return this._updateInflate(worldPoint);
    return this._updateDrag(worldPoint);
  }

  _updateDrag(worldPoint) {
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const nowLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);

    const dx = nowLocal.x - this._sculptInitialPinchLocal.x;
    const dy = nowLocal.y - this._sculptInitialPinchLocal.y;
    const dz = nowLocal.z - this._sculptInitialPinchLocal.z;

    for (const [idx, entry] of this._sculptOriginals) {
      let tx = 0, ty = 0, tz = 0;
      for (const c of entry.contribs) {
        tx += dx * c.sx * c.weight;
        ty += dy * c.sy * c.weight;
        tz += dz * c.sz * c.weight;
      }
      pos.setXYZ(idx, entry.x + tx, entry.y + ty, entry.z + tz);
    }
    pos.needsUpdate = true;
    // Keep the gradient in sync: vertex colors are cheap to recompute and the
    // top/bottom of the shape can shift noticeably during sculpting.
    applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
  }

  _updateSmooth(worldPoint) {
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const nowLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    const center = { x: nowLocal.x, y: nowLocal.y, z: nowLocal.z };

    const region = brushIndicesInRegion(pos.array, center, this.sculptFalloffRadius);
    if (region.length > 0) {
      smoothStep(pos.array, region, this.smoothNeighborRadius, this.smoothStrength);
    }
    if (this.mirrorAxis) {
      const mCenter = mirrorPoint(center, this.mirrorAxis);
      const mRegion = brushIndicesInRegion(pos.array, mCenter, this.sculptFalloffRadius);
      if (mRegion.length > 0) {
        smoothStep(pos.array, mRegion, this.smoothNeighborRadius, this.smoothStrength);
      }
    }
    pos.needsUpdate = true;
    applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
  }

  // Inflate/deflate: push vertices along their surface normals each frame.
  // sign is encoded in _sculptMode ('inflate' → +1, 'deflate' → −1).
  _startInflate(worldPoint, sign) {
    if (!this._geom || !this.mesh) return false;
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const initLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    this._geom.computeVertexNormals();
    const region = brushIndicesInRegion(
      pos.array,
      { x: initLocal.x, y: initLocal.y, z: initLocal.z },
      this.sculptFalloffRadius,
    );
    if (region.length === 0) return false;
    this._sculptRedoStack.length = 0;
    this._sculptUndoStack.push(pos.array.slice());
    if (this._sculptUndoStack.length > this._UNDO_LIMIT) this._sculptUndoStack.shift();
    this._sculptMode = sign > 0 ? 'inflate' : 'deflate';
    this._sculpting = true;
    return true;
  }

  _updateInflate(worldPoint) {
    const pos = this._geom.attributes.position;
    this.mesh.updateMatrixWorld();
    const invMat = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const nowLocal = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .applyMatrix4(invMat);
    const center = { x: nowLocal.x, y: nowLocal.y, z: nowLocal.z };
    this._geom.computeVertexNormals();
    const norm = this._geom.attributes.normal;
    const sign = this._sculptMode === 'deflate' ? -1 : 1;
    const region = brushIndicesInRegion(pos.array, center, this.sculptFalloffRadius);
    if (region.length > 0) {
      inflateStep(pos.array, norm.array, region, this.inflateStepSize, sign);
    }
    if (this.mirrorAxis) {
      const mCenter = mirrorPoint(center, this.mirrorAxis);
      const mRegion = brushIndicesInRegion(pos.array, mCenter, this.sculptFalloffRadius);
      if (mRegion.length > 0) {
        inflateStep(pos.array, norm.array, mRegion, this.inflateStepSize, sign);
      }
    }
    pos.needsUpdate = true;
    applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
  }

  stopSculpt() {
    this._sculpting = false;
    this._sculptOriginals = null;
    this._sculptInitialPinchLocal = null;
    this._sculptMode = this.brushMode;
  }

  // Revert the most recent sculpt (restore the snapshot pushed in startSculpt).
  // Returns true if an undo was applied, false if the stack was empty.
  undoSculpt() {
    if (!this._geom || this._sculptUndoStack.length === 0) return false;
    const pos = this._geom.attributes.position;
    // Save current state so redo can replay it.
    this._sculptRedoStack.push(pos.array.slice());
    const snapshot = this._sculptUndoStack.pop();
    pos.array.set(snapshot);
    pos.needsUpdate = true;
    applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
    this.stopSculpt();
    this.render();
    return true;
  }

  redoSculpt() {
    if (!this._geom || this._sculptRedoStack.length === 0) return false;
    const pos = this._geom.attributes.position;
    // Save current state to undo so the user can undo back through the redo.
    this._sculptUndoStack.push(pos.array.slice());
    const snapshot = this._sculptRedoStack.pop();
    pos.array.set(snapshot);
    pos.needsUpdate = true;
    applyVertexGradient(this._geom, PALETTES[this.paletteIndex]);
    this.stopSculpt();
    this.render();
    return true;
  }

  get sculptUndoDepth() {
    return this._sculptUndoStack.length;
  }

  get sculptRedoDepth() {
    return this._sculptRedoStack.length;
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
