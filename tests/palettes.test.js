import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, cyclePaletteIndex, paletteColorAt } from '../js/palettes.js';

test('PALETTES has at least two distinct palettes and the first is named Gray', () => {
  assert.ok(PALETTES.length >= 2);
  assert.equal(PALETTES[0].name, 'Gray');
});

test('every palette has bottom and top as 3-component RGB in [0,1]', () => {
  for (const p of PALETTES) {
    assert.equal(p.bottom.length, 3, `${p.name}.bottom length`);
    assert.equal(p.top.length, 3, `${p.name}.top length`);
    for (const c of [...p.bottom, ...p.top]) {
      assert.ok(c >= 0 && c <= 1, `${p.name} component ${c} out of range`);
    }
  }
});

test('cyclePaletteIndex wraps around after the last palette', () => {
  const last = PALETTES.length - 1;
  assert.equal(cyclePaletteIndex(last), 0);
  assert.equal(cyclePaletteIndex(0), 1);
});

test('cyclePaletteIndex guards against bad inputs', () => {
  assert.equal(cyclePaletteIndex(-1), 0);
  assert.equal(cyclePaletteIndex(1.5), 0);
  assert.equal(cyclePaletteIndex(undefined), 0);
});

test('paletteColorAt at t=0 returns the bottom color', () => {
  const p = { bottom: [0.1, 0.2, 0.3], top: [0.9, 0.8, 0.7] };
  const c = paletteColorAt(p, 0);
  assert.ok(Math.abs(c.r - 0.1) < 1e-6);
  assert.ok(Math.abs(c.g - 0.2) < 1e-6);
  assert.ok(Math.abs(c.b - 0.3) < 1e-6);
});

test('paletteColorAt at t=1 returns the top color', () => {
  const p = { bottom: [0.1, 0.2, 0.3], top: [0.9, 0.8, 0.7] };
  const c = paletteColorAt(p, 1);
  assert.ok(Math.abs(c.r - 0.9) < 1e-6);
  assert.ok(Math.abs(c.g - 0.8) < 1e-6);
  assert.ok(Math.abs(c.b - 0.7) < 1e-6);
});

test('paletteColorAt at t=0.5 is the component-wise mean', () => {
  const p = { bottom: [0, 0, 0], top: [1, 1, 1] };
  const c = paletteColorAt(p, 0.5);
  assert.ok(Math.abs(c.r - 0.5) < 1e-6);
  assert.ok(Math.abs(c.g - 0.5) < 1e-6);
  assert.ok(Math.abs(c.b - 0.5) < 1e-6);
});

test('paletteColorAt clamps t outside [0, 1]', () => {
  const p = { bottom: [0, 0, 0], top: [1, 1, 1] };
  assert.ok(Math.abs(paletteColorAt(p, -0.5).r) < 1e-6);
  assert.ok(Math.abs(paletteColorAt(p, 2).r - 1) < 1e-6);
});
