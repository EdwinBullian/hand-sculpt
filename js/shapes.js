import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Returns a BufferGeometry for one of the 5 supported primitives, or null.
// Sizes chosen so each shape comfortably fills the scene frustum at scale=1.
export function createShape(name) {
  switch (name) {
    case 'sphere':   return new THREE.SphereGeometry(1, 32, 16);
    case 'cube':     return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    case 'pyramid':  return new THREE.ConeGeometry(1, 1.8, 4);   // 4 radial segments = square base
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1.8, 32);
    case 'torus':    return new THREE.TorusGeometry(1, 0.4, 16, 48);
    default:         return null;
  }
}

export const SHAPE_NAMES = ['sphere', 'cube', 'pyramid', 'cylinder', 'torus'];
