// Color gradients for the vertex-gradient fill. Scene.js lerps each vertex's
// color between `bottom` and `top` based on its Y coordinate within the mesh
// bounding range, so the lowest vertex paints `bottom` and the highest paints
// `top`. RGB components are 0..1.

export const PALETTES = [
  { name: 'Gray',    bottom: [0.15, 0.15, 0.15], top: [0.95, 0.95, 0.95] },
  { name: 'Ocean',   bottom: [0.02, 0.10, 0.30], top: [0.55, 0.80, 0.95] },
  { name: 'Sunset',  bottom: [0.95, 0.85, 0.20], top: [0.98, 0.40, 0.70] },
  { name: 'Emerald', bottom: [0.02, 0.30, 0.20], top: [0.45, 0.95, 0.80] },
  { name: 'Royal',   bottom: [0.20, 0.05, 0.35], top: [0.95, 0.40, 0.90] },
  { name: 'Ember',   bottom: [0.12, 0.02, 0.02], top: [0.98, 0.35, 0.15] },
];

// Wrap around so `C` can cycle indefinitely.
export function cyclePaletteIndex(current) {
  if (!Number.isInteger(current) || current < 0) return 0;
  return (current + 1) % PALETTES.length;
}

// Linearly interpolate a vertex color given its normalised Y (0..1). Returned
// as a plain { r, g, b } so scene.js can write straight into the BufferAttribute.
export function paletteColorAt(palette, t) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const [br, bg, bb] = palette.bottom;
  const [tr, tg, tb] = palette.top;
  return {
    r: br + (tr - br) * clamped,
    g: bg + (tg - bg) * clamped,
    b: bb + (tb - bb) * clamped,
  };
}
