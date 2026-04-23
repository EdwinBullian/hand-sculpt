// Exponential Moving Average: prev = alpha * new + (1 - alpha) * prev
// First update returns the value unchanged.
export function makeEMA(alpha) {
  let prev = null;
  return {
    update(value) {
      prev = (prev === null) ? value : alpha * value + (1 - alpha) * prev;
      return prev;
    },
    reset() { prev = null; },
    get value() { return prev; },
  };
}

// Hysteresis: a boolean signal must hold for `frames` consecutive frames
// to flip the state. Returns the current stable state each frame.
export function makeHysteresis(frames) {
  let state = false;
  let counter = 0;
  return {
    update(active) {
      if (active === state) {
        counter = 0;
        return state;
      }
      counter++;
      if (counter >= frames) {
        state = active;
        counter = 0;
      }
      return state;
    },
    reset() { state = false; counter = 0; },
    get state() { return state; },
  };
}
