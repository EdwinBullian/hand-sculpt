import { palmFacesCamera } from './palmDirection.js';

// Detects the reset signal: exactly 2 hands visible, both with palms NOT facing camera.
// While active, the scene driver is expected to snap transforms to identity (position (0,0,0),
// rotation identity, scale 1) and freeze updates.

export class BothBacksReset {
  detect(results) {
    if (!results || !results.landmarks || !results.handedness) {
      return { active: false };
    }
    if (results.landmarks.length !== 2) {
      return { active: false };
    }
    let bothDown = true;
    for (let i = 0; i < 2; i++) {
      const lm = results.landmarks[i];
      const side = results.handedness[i]?.[0]?.categoryName;
      if (side !== 'Left' && side !== 'Right') {
        bothDown = false;
        break;
      }
      const isLeft = side === 'Left';
      if (palmFacesCamera(lm, isLeft)) {
        bothDown = false;
        break;
      }
    }
    return { active: bothDown };
  }
}
