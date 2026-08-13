import * as THREE from 'three';
import { stepBall, bouncePlane, bouncePaddle, isPastPaddle, resetBall } from '../physics.js';
import { palmCentroid } from '../gestures/singleHandPose.js';

// Solo wall-bounce ping pong. The user's tracked hand controls a flat
// paddle that floats just in front of the camera. A ball bounces between
// the back wall and the paddle; missing the ball resets the score.

const COURT = {
  WALL_Z: -4,         // back wall (far from camera)
  PADDLE_Z: 1.0,      // paddle plane (near camera)
  MISS_Z: 1.6,        // past this in +z = miss (ball passed user)
  FLOOR_Y: -1.5,
  CEIL_Y: 1.7,
  X_MIN: -2.0,
  X_MAX: 2.0,
};

const BALL_RADIUS = 0.14;
// Larger paddle than the v1 — Eddie reported the v1 hitbox felt invisible.
// Bigger hitbox + more visible mesh below.
const PADDLE_HALF = { x: 0.6, y: 0.42, z: 0.06 };

const FLOOR_RESTITUTION = 0.7;
const WALL_RESTITUTION = 0.95;
const SIDE_RESTITUTION = 0.85;

// Ball respawn delay after a miss (seconds).
const RESPAWN_DELAY = 1.0;

export class PingPong {
  constructor() {
    this.ball = { pos: { x: 0, y: 0, z: COURT.WALL_Z + 0.5 }, vel: { x: 0, y: 0, z: 3 } };
    this.ballMesh = null;
    this.paddleMesh = null;
    this.courtMeshes = [];
    this.score = 0;
    this.best = 0;
    this.missTimer = 0;
    this.lastT = 0;
    this.paddleState = {
      pos: { x: 0, y: 0, z: COURT.PADDLE_Z },
      prevPos: { x: 0, y: 0, z: COURT.PADDLE_Z },
      vel: { x: 0, y: 0, z: 0 },
      visible: false,
    };
  }

  init(threeScene) {
    // Back wall: a translucent panel so the user can see the ball spawning behind it.
    const wallW = COURT.X_MAX - COURT.X_MIN;
    const wallH = COURT.CEIL_Y - COURT.FLOOR_Y;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, wallH, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0x224488, side: THREE.DoubleSide,
        transparent: true, opacity: 0.35, wireframe: true,
      }),
    );
    wall.position.set(0, (COURT.FLOOR_Y + COURT.CEIL_Y) / 2, COURT.WALL_Z);
    threeScene.add(wall);
    this.courtMeshes.push(wall);

    // Floor: lying flat, wireframed for depth perception.
    const floorD = COURT.PADDLE_Z - COURT.WALL_Z;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, floorD, 8, 12),
      new THREE.MeshBasicMaterial({
        color: 0x2d4d2d, side: THREE.DoubleSide,
        transparent: true, opacity: 0.45, wireframe: true,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, COURT.FLOOR_Y, (COURT.WALL_Z + COURT.PADDLE_Z) / 2);
    threeScene.add(floor);
    this.courtMeshes.push(floor);

    // Side walls: faint vertical planes.
    for (const sx of [-1, 1]) {
      const sw = new THREE.Mesh(
        new THREE.PlaneGeometry(floorD, wallH, 4, 4),
        new THREE.MeshBasicMaterial({
          color: 0x444466, side: THREE.DoubleSide,
          transparent: true, opacity: 0.18, wireframe: true,
        }),
      );
      sw.rotation.y = Math.PI / 2;
      sw.position.set(sx * COURT.X_MAX, (COURT.FLOOR_Y + COURT.CEIL_Y) / 2, (COURT.WALL_Z + COURT.PADDLE_Z) / 2);
      threeScene.add(sw);
      this.courtMeshes.push(sw);
    }

    // Ball
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
    );
    threeScene.add(this.ballMesh);

    // Paddle — solid translucent fill + opaque wireframe so the user can
    // SEE the hitbox. v1 was a sparse white wireframe and Eddie couldn't
    // tell where it was.
    const paddleBox = new THREE.BoxGeometry(PADDLE_HALF.x * 2, PADDLE_HALF.y * 2, PADDLE_HALF.z * 2);
    this.paddleMesh = new THREE.Mesh(
      paddleBox,
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.55 }),
    );
    const paddleEdge = new THREE.Mesh(
      paddleBox,
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
    );
    this.paddleMesh.add(paddleEdge);
    this.paddleMesh.visible = false;
    threeScene.add(this.paddleMesh);

    this._spawnBall();
  }

  teardown(threeScene) {
    for (const m of this.courtMeshes) {
      threeScene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.courtMeshes.length = 0;
    if (this.ballMesh) {
      threeScene.remove(this.ballMesh);
      this.ballMesh.geometry.dispose();
      this.ballMesh.material.dispose();
      this.ballMesh = null;
    }
    if (this.paddleMesh) {
      threeScene.remove(this.paddleMesh);
      this.paddleMesh.geometry.dispose();
      this.paddleMesh.material.dispose();
      this.paddleMesh = null;
    }
  }

  // Called from the main tick. `results` is MediaPipe hand data; `tNow` is a
  // performance.now() timestamp for dt computation.
  tick(results, tNow) {
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.05, (tNow - this.lastT) / 1000);
    this.lastT = tNow;

    this._updatePaddleFromHand(results, dt);

    if (this.missTimer > 0) {
      this.missTimer -= dt;
      if (this.missTimer <= 0) this._spawnBall();
    } else {
      stepBall(this.ball, dt);
      bouncePlane(this.ball, 'y', COURT.FLOOR_Y, +1, BALL_RADIUS, FLOOR_RESTITUTION);
      bouncePlane(this.ball, 'y', COURT.CEIL_Y, -1, BALL_RADIUS, FLOOR_RESTITUTION);
      bouncePlane(this.ball, 'x', COURT.X_MIN, +1, BALL_RADIUS, SIDE_RESTITUTION);
      bouncePlane(this.ball, 'x', COURT.X_MAX, -1, BALL_RADIUS, SIDE_RESTITUTION);
      bouncePlane(this.ball, 'z', COURT.WALL_Z, +1, BALL_RADIUS, WALL_RESTITUTION);

      if (this.paddleState.visible) {
        const paddle = {
          pos: this.paddleState.pos,
          halfSize: PADDLE_HALF,
          vel: this.paddleState.vel,
          restitution: 0.95,
        };
        if (bouncePaddle(this.ball, paddle, BALL_RADIUS)) {
          this.score++;
          if (this.score > this.best) this.best = this.score;
        }
      }

      if (isPastPaddle(this.ball, COURT.MISS_Z)) {
        this.score = 0;
        this.missTimer = RESPAWN_DELAY;
        if (this.ballMesh) this.ballMesh.visible = false;
      }
      this._syncBallMesh();
    }

    return {
      score: this.score,
      best: this.best,
      paddleVisible: this.paddleState.visible,
      missing: this.missTimer > 0,
    };
  }

  _spawnBall() {
    // Spawn just inside the back wall, flying toward the camera with a touch
    // of upward velocity (so it arcs naturally) and a random lateral nudge.
    resetBall(this.ball,
      { x: (Math.random() - 0.5) * 0.8, y: 0.2, z: COURT.WALL_Z + 0.3 },
      { x: (Math.random() - 0.5) * 1.2, y: 0.6 + Math.random() * 0.4, z: 3.5 + Math.random() * 0.8 },
    );
    if (this.ballMesh) this.ballMesh.visible = true;
  }

  _updatePaddleFromHand(results, dt) {
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      this.paddleState.visible = false;
      if (this.paddleMesh) this.paddleMesh.visible = false;
      return;
    }
    // Track the FIRST visible hand. The user can use either hand; we don't
    // care about handedness for paddle control.
    const lm = results.landmarks[0];
    const c = palmCentroid(lm);
    // Map normalized image coords (0..1) to court coords.
    // x: image-x increases left→right; we use (c.x - 0.5) * width to center.
    //   The webcam is mirrored on screen, so user-right corresponds to image-x
    //   DECREASING (typical browser webcam). If this feels backwards in live
    //   testing, flip the sign on targetX.
    const targetX = (0.5 - c.x) * (COURT.X_MAX - COURT.X_MIN);
    const targetY = (0.5 - c.y) * (COURT.CEIL_Y - COURT.FLOOR_Y);

    // Save previous position before overwriting, for velocity computation.
    this.paddleState.prevPos.x = this.paddleState.pos.x;
    this.paddleState.prevPos.y = this.paddleState.pos.y;
    this.paddleState.prevPos.z = this.paddleState.pos.z;

    this.paddleState.pos.x = targetX;
    this.paddleState.pos.y = targetY;
    this.paddleState.pos.z = COURT.PADDLE_Z;

    if (dt > 0) {
      this.paddleState.vel.x = (this.paddleState.pos.x - this.paddleState.prevPos.x) / dt;
      this.paddleState.vel.y = (this.paddleState.pos.y - this.paddleState.prevPos.y) / dt;
      // Z velocity is always 0 in this simple model — paddle stays in its plane.
      // The bouncePaddle helper still respects vel.z if we ever lift this.
      this.paddleState.vel.z = 0;
    }

    this.paddleState.visible = true;
    if (this.paddleMesh) {
      this.paddleMesh.position.set(targetX, targetY, COURT.PADDLE_Z);
      this.paddleMesh.visible = true;
    }
  }

  _syncBallMesh() {
    if (this.ballMesh && this.ball) {
      this.ballMesh.position.set(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z);
    }
  }
}
