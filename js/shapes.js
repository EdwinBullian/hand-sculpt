import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Returns a BufferGeometry for one of the 5 supported primitives, or null.
// Extra subdivisions on cube/pyramid/cylinder give many more vertices for the
// vertex-drag sculpting in Phase 4. `mergeVertices` collapses duplicates that
// Three.js inserts along face boundaries (for separate normals), so moving a
// vertex doesn't tear the surface along edges.
export function createShape(name) {
  let g;
  switch (name) {
    case 'sphere':
      g = new THREE.SphereGeometry(1, 32, 16);
      break;
    case 'cube':
      // 4 segments per axis → 25 vertices per face (dense grid for sculpting).
      g = new THREE.BoxGeometry(1.5, 1.5, 1.5, 4, 4, 4);
      break;
    case 'pyramid': {
      // mergeVertices corrupts winding order on 4-segment cones (alternating
      // transparent faces). Return early with raw geometry instead.
      const pg = new THREE.ConeGeometry(1, 1.8, 4, 6);
      pg.computeVertexNormals();
      return pg;
    }
    case 'cylinder':
      g = new THREE.CylinderGeometry(1, 1, 1.8, 32, 6);
      break;
    case 'torus':
      g = new THREE.TorusGeometry(1, 0.4, 16, 48);
      break;
    default:
      return null;
  }
  const merged = mergeVertices(g);
  merged.computeVertexNormals();
  return merged;
}

export const SHAPE_NAMES = ['sphere', 'cube', 'pyramid', 'cylinder', 'torus'];

// Low-poly counterpart of `createShape`, used as the wireframe overlay.
// Returns the same primitive at the same dimensions but with little or no
// subdivision, so `wireframe: true` rendering shows a CLEAN outline (no
// triangulation diagonals on the cube/pyramid/cylinder, no dense lat/long
// grid on the sphere/torus). Drawn as a child of the subdivided fill so it
// inherits all transforms.
export function createWireGeom(name) {
  switch (name) {
    case 'sphere':
      return new THREE.SphereGeometry(1, 16, 10);
    case 'cube':
      return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    case 'pyramid':
      return new THREE.ConeGeometry(1, 1.8, 4, 1);
    case 'cylinder':
      return new THREE.CylinderGeometry(1, 1, 1.8, 16, 1);
    case 'torus':
      return new THREE.TorusGeometry(1, 0.4, 8, 24);
    default:
      return null;
  }
}
