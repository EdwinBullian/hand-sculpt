import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEMA, makeHysteresis } from '../js/smoothing.js';

test('EMA first value is returned unchanged', () => {
  const ema = makeEMA(0.5);
  assert.equal(ema.update(10), 10);
});

test('EMA with alpha=0.5 averages new and previous', () => {
  const ema = makeEMA(0.5);
  ema.update(10);
  assert.equal(ema.update(20), 15);   // 0.5*20 + 0.5*10
  assert.equal(ema.update(30), 22.5); // 0.5*30 + 0.5*15
});

test('EMA with alpha=1 returns latest value', () => {
  const ema = makeEMA(1);
  ema.update(10);
  assert.equal(ema.update(99), 99);
});

test('EMA reset clears prior value', () => {
  const ema = makeEMA(0.5);
  ema.update(10);
  ema.reset();
  assert.equal(ema.update(42), 42);
});

test('hysteresis fires after N consecutive true frames', () => {
  const h = makeHysteresis(3);
  assert.equal(h.update(true), false);
  assert.equal(h.update(true), false);
  assert.equal(h.update(true), true);   // 3rd true → fires
  assert.equal(h.update(true), true);   // stays on
});

test('hysteresis releases after N consecutive false frames', () => {
  const h = makeHysteresis(3);
  h.update(true); h.update(true); h.update(true); // fired
  assert.equal(h.update(false), true);
  assert.equal(h.update(false), true);
  assert.equal(h.update(false), false); // 3rd false → releases
});

test('hysteresis counter resets when signal matches current state', () => {
  const h = makeHysteresis(3);
  h.update(true);
  h.update(true);
  // counter=2 toward flipping to true, but state is still false
  h.update(false); // matches current state (false), resets counter
  h.update(true);
  h.update(true);
  // counter=2 again, not yet 3
  assert.equal(h.update(true), true); // 3rd true → fires
});
