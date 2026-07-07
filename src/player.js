// The player: first-person on foot (with head bob, sprint FOV, footsteps),
// third-person chase camera while riding.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { clamp, lerp, damp, dampAngle, resolveCollisions } from './util.js';

const F = new THREE.Vector3();
const R = new THREE.Vector3();
const WISH = new THREE.Vector3();
const CAM_TARGET = new THREE.Vector3();
const CAM_DESIRED = new THREE.Vector3();
const ANCHOR = new THREE.Vector3();

const EYE = 1.68;

export class Player {
  constructor(camera, terrain, audio, ui, input, horses) {
    this.camera = camera;
    this.terrain = terrain;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.horses = horses;
    this.pos = new THREE.Vector3(WORLD.spawn.x, 0, WORLD.spawn.z);
    this.pos.y = terrain.heightAt(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;             // facing -z (the cathedral)
    this.pitch = -0.02;
    this.mode = 'foot';
    this.horse = null;
    this.grounded = true;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stepAcc = 0;
    this.fov = 68;
    this.viewBob = true;
    this.sens = 0.0023;
    this.rideLookYaw = 0;
    this.rideLookPitch = 0;
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    this.boundaryT = 0;
    this.sprintBoost = 1;
    this.jumpBoost = 1;
    camera.rotation.order = 'YXZ';
  }

  ride(horse) {
    if (this.mode === 'ride') return;
    this.mode = 'ride';
    this.horse = horse;
    horse.ridden = true;
    this.rideLookYaw = 0;
    this.rideLookPitch = 0;
    this.camInit = false;
    this.ui.rideHint(true);
    this.audio.saddle();
  }

  dismount() {
    if (this.mode !== 'ride') return;
    const h = this.horse;
    h.ridden = false;
    this.mode = 'foot';
    this.horse = null;
    // step off to the horse's left
    this.pos.set(
      h.pos.x - Math.cos(h.yaw) * 1.5,
      0,
      h.pos.z + Math.sin(h.yaw) * 1.5
    );
    resolveCollisions(this.pos, 0.5);
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.yaw = h.yaw + Math.PI * 0.5;
    this.ui.rideHint(false);
    this.audio.saddle();
    this.audio.thud();
  }

  update(dt) {
    const [mdx, mdy] = this.input.consumeMouse();
    if (this.mode === 'foot') this._updateFoot(dt, mdx, mdy);
    else this._updateRide(dt, mdx, mdy);
    this._boundary(dt);
  }

  _updateFoot(dt, mdx, mdy) {
    this.yaw -= mdx * this.sens;
    this.pitch = clamp(this.pitch - mdy * this.sens, -1.45, 1.45);

    const fwd = (this.input.held('w') ? 1 : 0) - (this.input.held('s') ? 1 : 0);
    const strafe = (this.input.held('d') ? 1 : 0) - (this.input.held('a') ? 1 : 0);
    const sprint = this.input.held('shift') && fwd > 0;
    F.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    R.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    WISH.set(0, 0, 0).addScaledVector(F, fwd).addScaledVector(R, strafe);
    if (WISH.lengthSq() > 0) WISH.normalize();
    const targetSpeed = sprint ? 7.2 * this.sprintBoost : 4.3;
    WISH.multiplyScalar(targetSpeed);

    const lam = this.grounded ? 9 : 2;
    this.vel.x = damp(this.vel.x, WISH.x, lam, dt);
    this.vel.z = damp(this.vel.z, WISH.z, lam, dt);

    // gravity & jumping
    const ground = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (this.grounded && this.input.pressed('space')) {
      this.vel.y = 5.3 * this.jumpBoost;
      this.grounded = false;
    }
    if (!this.grounded) this.vel.y -= 13.5 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    resolveCollisions(this.pos, 0.5);
    this.horses.pushOut(this.pos, 0.45, null);

    const g2 = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g2 + 0.001) {
      if (!this.grounded && this.vel.y < -4.5) this.audio.thud();   // landing
      this.pos.y = g2;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y - g2 > 0.05) {
      this.grounded = false;
    }

    // head bob + footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const k = clamp(hSpeed / 4.3, 0, 1.4);
    if (this.grounded && hSpeed > 0.4) {
      this.bobPhase += dt * (6.5 + hSpeed * 0.9);
      this.bobAmp = damp(this.bobAmp, 1, 6, dt);
      this.stepAcc += hSpeed * dt;
      const stride = sprint ? 2.9 : 2.25;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.audio.footstep(this.terrain.groundType(this.pos.x, this.pos.z));
      }
    } else {
      this.bobAmp = damp(this.bobAmp, 0, 6, dt);
    }
    const bobY = this.viewBob ? Math.sin(this.bobPhase * 2) * 0.042 * k * this.bobAmp : 0;
    const bobR = this.viewBob ? Math.sin(this.bobPhase) * 0.006 * k * this.bobAmp : 0;

    this.fov = damp(this.fov, sprint && hSpeed > 4 ? 75 : 68, 5, dt);
    this._applyFov();

    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, bobR);
    this.camPos.copy(this.camera.position);
  }

  _updateRide(dt, mdx, mdy) {
    const h = this.horse;
    // free look around the horse, springing back when moving
    this.rideLookYaw -= mdx * this.sens;
    this.rideLookPitch = clamp(this.rideLookPitch - mdy * this.sens, -0.55, 0.5);
    if (Math.abs(h.speed) > 2.5) {
      this.rideLookYaw = dampAngle(this.rideLookYaw, 0, 1.6, dt);
    }
    this.rideLookYaw = clamp(this.rideLookYaw, -2.6, 2.6);

    // logical player position rides along (for interactions, souls, map)
    this.pos.copy(h.pos);

    h.getRiderAnchor(ANCHOR);
    const camYaw = h.yaw + Math.PI + this.rideLookYaw;   // behind the horse
    const camPitch = 0.34 + this.rideLookPitch;
    const dist = 6.6;
    CAM_DESIRED.set(
      ANCHOR.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
      ANCHOR.y + Math.sin(camPitch) * dist,
      ANCHOR.z + Math.cos(camYaw) * Math.cos(camPitch) * dist
    );
    // keep the camera above the ground
    const gy = this.terrain.heightAt(CAM_DESIRED.x, CAM_DESIRED.z) + 0.45;
    if (CAM_DESIRED.y < gy) CAM_DESIRED.y = gy;

    if (!this.camInit) {
      this.camPos.copy(CAM_DESIRED);
      this.camInit = true;
    } else {
      this.camPos.x = damp(this.camPos.x, CAM_DESIRED.x, 7.5, dt);
      this.camPos.y = damp(this.camPos.y, CAM_DESIRED.y, 7.5, dt);
      this.camPos.z = damp(this.camPos.z, CAM_DESIRED.z, 7.5, dt);
    }
    this.camera.position.copy(this.camPos);

    F.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    CAM_TARGET.copy(ANCHOR).addScaledVector(F, 2.4);
    CAM_TARGET.y = ANCHOR.y + 0.2;
    this.camera.lookAt(CAM_TARGET);

    const gallop = smooth01((Math.abs(h.speed) - 5) / 8);
    this.fov = damp(this.fov, 68 + gallop * 10, 4, dt);
    this._applyFov();

    // keep player yaw synced for a graceful dismount view
    this.yaw = h.yaw + Math.PI;
    this.pitch = -0.1;
  }

  _boundary(dt) {
    this.boundaryT -= dt;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > WORLD.bounds) {
      const push = (d - WORLD.bounds) * 2.5 * dt;
      this.pos.x -= (this.pos.x / d) * push;
      this.pos.z -= (this.pos.z / d) * push;
      if (this.boundaryT <= 0) {
        this.boundaryT = 9;
        this.ui.toast('The mist refuses you.');
        this.audio.whisper();
      }
    }
  }

  _applyFov() {
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

function smooth01(x) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}
