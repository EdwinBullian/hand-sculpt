import * as THREE from 'three';
import { stepBall, bouncePlane, resetBall } from '../physics.js';
import { isPinched } from '../gestures/pinchDetect.js';
import { palmCentroid } from '../gestures/singleHandPose.js';

// Free-throw basketball. The user holds the ball with a TWO-HAND PINCH
// (thumb+index on both hands), moves the ball through space, and releases
// the pinch to shoot. Release velocity is computed from the last few frames
// of hand motion. Ball physics: gravity + collisions vs floor, backboard,
// and rim torus. A made basket = ball center crosses the rim plane downward
// while inside the rim radius.

const COURT = {
  HOOP_X: 0,
  HOOP_Y: 1.5,
  HOOP_Z: -3.0,
  RIM_RADIUS: 0.32,
  RIM_TUBE: 0.025,
  BACKBOARD_W: 1.6,
  BACKBOARD_H: 1.1,
  BACKBOARD_Y: 1.85,
  BACKBOARD_Z: -3.25,
  FLOOR_Y: -1.5,
  HOLD_Z: 1.0,        // ball plane when in hands
  X_BOUNDS: 2.5,      // soft side walls (out-of-bounds threshold)
};

const BALL_RADIUS = 0.16;
const PINCH_THRESHOLD = 0.07;

// Restitution coefficients — tuned by feel, easy to adjust later.
const FLOOR_RESTITUTION = 0.55;
const BACKBOARD_RESTITUTION = 0.45;
const RIM_RESTITUTION = 0.55;

// Respawn delays after a made shot vs a missed shot (seconds).
const SCORED_DELAY = 0.9;
const MISSED_DELAY = 0.7;

// History buffer length for release-velocity computation. Keeping the last
// ~6 frames smooths over single-frame jitter from MediaPipe.
const HELD_HISTORY_FRAMES = 6;

export class Basketball {
  constructor() {
    this.ball = { pos: { x: 0, y: -0.3, z: COURT.HOLD_Z }, vel: { x: 0, y: 0, z: 0 } };
    this.ballMesh = null;
    this.rimMesh = null;
    this.netMesh = null;
    this.backboardMesh = null;
    this.backboardSquareMesh = null;
    this.floorMesh = null;
    this.score = 0;
    this.attempts = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastT = 0;
    this.state = 'held'; // 'held' | 'in_flight' | 'scored' | 'missed'
    this._wasGrabbed = false;     // were two hands pinched on the previous frame
    this._heldHistory = [];        // [{x,y,z,t}] for release-velocity
    this._respawnTimer = 0;
    this._lastBallY = 0;
    this._scoreCounted = false;    // ensures one score per shot
  }

  init(threeScene) {
    // Floor — large wireframe plane to give depth.
    this.floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x884422, side: THREE.DoubleSide,
        transparent: true, opacity: 0.35, wireframe: true,
      }),
    );
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = COURT.FLOOR_Y;
    threeScene.add(this.floorMesh);

    // Backboard — translucent rectangle behind the rim.
    this.backboardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.BACKBOARD_W, COURT.BACKBOARD_H, 4, 3),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, side: THREE.DoubleSide,
        transparent: true, opacity: 0.25, wireframe: true,
      }),
    );
    this.backboardMesh.position.set(COURT.HOOP_X, COURT.BACKBOARD_Y, COURT.BACKBOARD_Z);
    threeScene.add(this.backboardMesh);

    // Backboard "square" (the small targeting rectangle painted behind the rim).
    this.backboardSquareMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xff5522, side: THREE.DoubleSide,
        transparent: true, opacity: 0.45, wireframe: true,
      }),
    );
    this.backboardSquareMesh.position.set(COURT.HOOP_X, COURT.HOOP_Y + 0.18, COURT.BACKBOARD_Z + 0.001);
    threeScene.add(this.backboardSquareMesh);

    // Rim — orange torus, axis vertical.
    this.rimMesh = new THREE.Mesh(
      new THREE.TorusGeometry(COURT.RIM_RADIUS, COURT.RIM_TUBE, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xff5522 }),
    );
    this.rimMesh.position.set(COURT.HOOP_X, COURT.HOOP_Y, COURT.HOOP_Z);
    this.rimMesh.rotation.x = Math.PI / 2;
    threeScene.add(this.rimMesh);

    // Net — wireframe cone hanging from rim, slightly tapered.
    this.netMesh = new THREE.Mesh(
      new THREE.ConeGeometry(COURT.RIM_RADIUS * 0.95, 0.5, 12, 4, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, side: THREE.DoubleSide,
        transparent: true, opacity: 0.4, wireframe: true,
      }),
    );
    this.netMesh.position.set(COURT.HOOP_X, COURT.HOOP_Y - 0.25, COURT.HOOP_Z);
    threeScene.add(this.netMesh);

    // Ball — orange sphere, slightly larger than the ping pong ball.
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff8822 }),
    );
    threeScene.add(this.ballMesh);

    this._respawn(/*resetStreak=*/false);
  }

  teardown(threeScene) {
    const meshes = [
      this.floorMesh, this.backboardMesh, this.backboardSquareMesh,
      this.rimMesh, this.netMesh, this.ballMesh,
    ];
    for (const m of meshes) {
      if (!m) continue;
      threeScene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
    this.floorMesh = this.backboardMesh = this.backboardSquareMesh =
      this.rimMesh = this.netMesh = this.ballMesh = null;
  }

  // Called from main.js tick. `results` is MediaPipe hand data.
  tick(results, tNow) {
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.05, (tNow - this.lastT) / 1000);
    this.lastT = tNow;

    const grabbed = this._isOneHandedGrab(results);

    if (this.state === 'held') {
      if (grabbed) {
        this._updateHeldFromHands(results, tNow);
        this._wasGrabbed = true;
      } else if (this._wasGrabbed) {
        // Released — fire a shot if we have enough motion history.
        this._releaseShot();
        this._wasGrabbed = false;
      } else {
        // No grab and never grabbed — keep ball at the ready position.
        this._syncBallMesh();
      }
    } else if (this.state === 'in_flight') {
      this._stepFlight(dt);
      this._checkScore();
      // Out-of-bounds check: ball gone too far below floor, behind backboard,
      // or past the user. Triggers a miss.
      if (
        this.ball.pos.y < COURT.FLOOR_Y - 1.5 ||
        this.ball.pos.z < COURT.BACKBOARD_Z - 1.5 ||
        this.ball.pos.z > 4 ||
        Math.abs(this.ball.pos.x) > COURT.X_BOUNDS + 1
      ) {
        this._endFlightAsMiss();
      }
      this._syncBallMesh();
    } else {
      // 'scored' or 'missed' — wait for respawn timer.
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) {
        const wasMiss = this.state === 'missed';
        this._respawn(/*resetStreak=*/wasMiss);
      }
    }

    return {
      score: this.score,
      attempts: this.attempts,
      streak: this.streak,
      bestStreak: this.bestStreak,
      state: this.state,
      grabbed,
    };
  }

  _isOneHandedGrab(results) {
    if (!results || !results.landmarks || results.landmarks.length === 0) return false;
    return isPinched(results.landmarks[0], PINCH_THRESHOLD);
  }

  _updateHeldFromHands(results, tNow) {
    // Track the PALM centroid (not the pinch midpoint) — palms are more
    // stable in MediaPipe than pinch points, which jump as soon as fingers
    // approach. Mirror x so user-right == screen-right.
    const lm = results.landmarks[0];
    const c = palmCentroid(lm);
    const worldX = (0.5 - c.x) * 4;
    const worldY = (0.5 - c.y) * 3;
    this.ball.pos.x = worldX;
    this.ball.pos.y = worldY;
    this.ball.pos.z = COURT.HOLD_Z;
    // Save the index-finger pointing direction at every held frame so we can
    // use it at release time as the shot aim. Direction is from the index
    // MCP knuckle (landmark 5) to the index TIP (landmark 8) in image coords.
    const tip = lm[8];
    const mcp = lm[5];
    const aimXImg = tip.x - mcp.x;
    const aimYImg = tip.y - mcp.y;
    this._heldHistory.push({
      x: worldX, y: worldY, z: COURT.HOLD_Z, t: tNow,
      aimXImg, aimYImg,
    });
    if (this._heldHistory.length > HELD_HISTORY_FRAMES) this._heldHistory.shift();
    this._syncBallMesh();
  }

  _releaseShot() {
    if (this._heldHistory.length < 2) return;
    // Power: magnitude of palm motion over the recent history. Even a gentle
    // release gets a minimum power so the ball reaches the rim.
    const oldest = this._heldHistory[0];
    const newest = this._heldHistory[this._heldHistory.length - 1];
    const dt = Math.max(0.001, (newest.t - oldest.t) / 1000);
    const palmVx = (newest.x - oldest.x) / dt;
    const palmVy = (newest.y - oldest.y) / dt;
    const palmSpeed = Math.hypot(palmVx, palmVy);
    const power = Math.max(4.5, palmSpeed * 1.5);

    // Aim: index-finger direction at the moment of release, mapped to world.
    // Image x → world x is mirrored to match the position mapping.
    // Image y → world y is inverted (image y points down).
    // World z is a fixed forward bias toward the hoop, so the ball always
    // travels forward; finger direction controls only the lateral + vertical
    // components.
    const FORWARD_BIAS = 1.2;
    const aimImgX = newest.aimXImg ?? 0;
    const aimImgY = newest.aimYImg ?? 0;
    let dirX = -aimImgX;
    let dirY = -aimImgY;
    let dirZ = -FORWARD_BIAS;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dirLen; dirY /= dirLen; dirZ /= dirLen;
    // Add a base upward boost — basketball shots arc, even if you point dead
    // straight at the hoop. Without this, low-power shots fall short.
    const ARC_BOOST = 1.8;

    this.ball.vel.x = power * dirX;
    this.ball.vel.y = power * dirY + ARC_BOOST;
    this.ball.vel.z = power * dirZ;
    this.state = 'in_flight';
    this.attempts++;
    this._scoreCounted = false;
    this._lastBallY = this.ball.pos.y;
  }

  _stepFlight(dt) {
    stepBall(this.ball, dt);
    bouncePlane(this.ball, 'y', COURT.FLOOR_Y, +1, BALL_RADIUS, FLOOR_RESTITUTION);
    // Backboard front face — only resolve when ball is within backboard
    // bounds (so a wild miss doesn't bounce off invisible walls extending
    // off-screen).
    if (
      Math.abs(this.ball.pos.x - COURT.HOOP_X) < COURT.BACKBOARD_W / 2 + BALL_RADIUS &&
      Math.abs(this.ball.pos.y - COURT.BACKBOARD_Y) < COURT.BACKBOARD_H / 2 + BALL_RADIUS
    ) {
      bouncePlane(this.ball, 'z', COURT.BACKBOARD_Z, +1, BALL_RADIUS, BACKBOARD_RESTITUTION);
    }
    this._collideWithRim();
    bouncePlane(this.ball, 'x', -COURT.X_BOUNDS, +1, BALL_RADIUS, 0.4);
    bouncePlane(this.ball, 'x', +COURT.X_BOUNDS, -1, BALL_RADIUS, 0.4);
  }

  // Closest-point-on-ring collision: treat the rim as a circle of radius
  // RIM_RADIUS at (HOOP_X, HOOP_Y, HOOP_Z) lying in the y=HOOP_Y plane.
  // Find the closest point on the circle to the ball, treat it as a sphere
  // of radius RIM_TUBE, and resolve a sphere-vs-sphere collision.
  _collideWithRim() {
    const dx = this.ball.pos.x - COURT.HOOP_X;
    const dz = this.ball.pos.z - COURT.HOOP_Z;
    const horizDist = Math.hypot(dx, dz);
    if (horizDist < 0.0001) return;
    const ringPx = COURT.HOOP_X + (dx / horizDist) * COURT.RIM_RADIUS;
    const ringPz = COURT.HOOP_Z + (dz / horizDist) * COURT.RIM_RADIUS;
    const ringPy = COURT.HOOP_Y;
    const nx = this.ball.pos.x - ringPx;
    const ny = this.ball.pos.y - ringPy;
    const nz = this.ball.pos.z - ringPz;
    const d = Math.hypot(nx, ny, nz);
    const minD = BALL_RADIUS + COURT.RIM_TUBE;
    if (d >= minD || d < 0.0001) return;
    // Push the ball out along the contact normal.
    const push = (minD - d) / d;
    this.ball.pos.x += nx * push;
    this.ball.pos.y += ny * push;
    this.ball.pos.z += nz * push;
    // Reflect velocity along the contact normal if moving INTO the rim.
    const ux = nx / d, uy = ny / d, uz = nz / d;
    const vDotN = this.ball.vel.x * ux + this.ball.vel.y * uy + this.ball.vel.z * uz;
    if (vDotN >= 0) return;
    const k = (1 + RIM_RESTITUTION) * vDotN;
    this.ball.vel.x -= k * ux;
    this.ball.vel.y -= k * uy;
    this.ball.vel.z -= k * uz;
  }

  // Score detection: ball center crosses the rim plane (y = HOOP_Y) going
  // downward AND is laterally inside the rim opening at that moment.
  _checkScore() {
    if (this._scoreCounted) {
      this._lastBallY = this.ball.pos.y;
      return;
    }
    const wasAbove = this._lastBallY > COURT.HOOP_Y;
    const nowBelow = this.ball.pos.y <= COURT.HOOP_Y;
    if (wasAbove && nowBelow && this.ball.vel.y < 0) {
      const dx = this.ball.pos.x - COURT.HOOP_X;
      const dz = this.ball.pos.z - COURT.HOOP_Z;
      const horizDist = Math.hypot(dx, dz);
      // "Inside the rim" means the ball center is within (rim radius - small
      // margin so a ball just kissing the inside still counts).
      if (horizDist < COURT.RIM_RADIUS - BALL_RADIUS * 0.3) {
        this.score++;
        this.streak++;
        if (this.streak > this.bestStreak) this.bestStreak = this.streak;
        this.state = 'scored';
        this._respawnTimer = SCORED_DELAY;
        this._scoreCounted = true;
      }
    }
    this._lastBallY = this.ball.pos.y;
  }

  _endFlightAsMiss() {
    this.state = 'missed';
    this._respawnTimer = MISSED_DELAY;
  }

  _respawn(resetStreak) {
    if (resetStreak) this.streak = 0;
    resetBall(this.ball,
      { x: 0, y: -0.3, z: COURT.HOLD_Z },
      { x: 0, y: 0, z: 0 },
    );
    this._heldHistory = [];
    this._wasGrabbed = false;
    this._scoreCounted = false;
    this.state = 'held';
    this._respawnTimer = 0;
    this._syncBallMesh();
  }

  _syncBallMesh() {
    if (this.ballMesh && this.ball) {
      this.ballMesh.position.set(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z);
    }
  }
}
