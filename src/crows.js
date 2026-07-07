// Crows that scatter when you come close (or when the bell tolls),
// and bats that wheel around the belfry all night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, range, clamp } from './util.js';
import { WORLD } from './layout.js';

const TMP = new THREE.Vector3();

export function crowBody() {
  const geo = mergeGeometries([
    new THREE.CapsuleGeometry(0.055, 0.13, 3, 6).rotateX(Math.PI / 2 + 0.25),
    new THREE.SphereGeometry(0.045, 7, 6).translate(0, 0.045, 0.1),
    new THREE.ConeGeometry(0.018, 0.06, 5).rotateX(Math.PI / 2).translate(0, 0.04, 0.16),
    new THREE.BoxGeometry(0.05, 0.012, 0.12).translate(0, 0.01, -0.14).applyMatrix4(
      new THREE.Matrix4().makeRotationX(0.35))
  ]);
  return geo;
}

class Crow {
  constructor(scene, mat, wingGeo, bodyGeo, spot) {
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(bodyGeo, mat);
    this.body.castShadow = true;
    this.group.add(this.body);
    this.wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, mat);
      w.position.set(side * 0.045, 0.03, -0.02);
      w.rotation.z = side * 0.12;
      w.scale.x = side;
      this.group.add(w);
      this.wings.push(w);
    }
    this.group.scale.setScalar(1.45);
    this.state = 'perched';
    this.spot = spot;
    this.group.position.copy(spot);
    this.group.rotation.y = Math.random() * TAU;
    this.t = 0;
    this.twitchT = range(Math.random, 1, 5);
    scene.add(this.group);
  }

  scare(spots, audio, delay = 0) {
    if (this.state !== 'perched') return;
    this.state = 'pre-flight';
    this.t = -delay;
    this._spots = spots;
    if (Math.random() < 0.6) audio.crow();
  }

  update(dt, playerPos) {
    const g = this.group;
    if (this.state === 'perched') {
      this.twitchT -= dt;
      if (this.twitchT <= 0) {
        this.twitchT = range(Math.random, 1.5, 6);
        g.rotation.y += range(Math.random, -1, 1);
      }
      return;
    }
    this.t += dt;
    if (this.state === 'pre-flight') {
      if (this.t >= 0) {
        this.state = 'flying';
        this.t = 0;
        // rise away from the player
        const away = TMP.copy(g.position).sub(playerPos).setY(0);
        if (away.lengthSq() < 0.1) away.set(1, 0, 0);
        away.normalize();
        this.ctrl = g.position.clone().add(away.clone().multiplyScalar(6)).add(new THREE.Vector3(0, 9, 0));
        const spots = this._spots.filter(s => s.distanceTo(playerPos) > 13);
        this.dest = (spots.length ? spots[Math.floor(Math.random() * spots.length)] : this.spot).clone();
        this.mid = this.ctrl.clone().add(this.dest).multiplyScalar(0.5).add(new THREE.Vector3(range(Math.random, -6, 6), range(Math.random, 5, 9), range(Math.random, -6, 6)));
        this.dur = range(Math.random, 4.5, 7);
      }
      return;
    }
    if (this.state === 'flying') {
      const t = clamp(this.t / this.dur, 0, 1);
      // cubic-ish bezier through start ctrl mid dest
      const p0 = this.spot, p1 = this.ctrl, p2 = this.mid, p3 = this.dest;
      const it = 1 - t;
      TMP.set(0, 0, 0)
        .addScaledVector(p0, it * it * it)
        .addScaledVector(p1, 3 * it * it * t)
        .addScaledVector(p2, 3 * it * t * t)
        .addScaledVector(p3, t * t * t);
      const dir = TMP.clone().sub(g.position);
      if (dir.lengthSq() > 1e-6) g.rotation.y = Math.atan2(dir.x, dir.z);
      g.position.copy(TMP);
      const flap = Math.sin(this.t * 21) * 0.85 * (t < 0.75 ? 1 : 0.4);
      this.wings[0].rotation.z = 0.12 + flap;
      this.wings[1].rotation.z = -0.12 - flap;
      if (t >= 1) {
        this.state = 'perched';
        this.spot = this.dest;
        g.position.copy(this.dest);
        this.wings[0].rotation.z = 0.12;
        this.wings[1].rotation.z = -0.12;
      }
    }
  }
}

export class Birds {
  constructor(ctx, perchSpots) {
    const { scene, audio } = ctx;
    this.audio = audio;
    this.spots = perchSpots;
    const mat = new THREE.MeshLambertMaterial({ color: 0x0c0d11 });
    const wingGeo = new THREE.PlaneGeometry(0.22, 0.09).translate(0.11, 0, 0);
    wingGeo.rotateX(-0.2);
    const bodyGeo = crowBody();
    this.crows = [];
    const used = new Set();
    for (let i = 0; i < 7 && i < perchSpots.length; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * perchSpots.length); } while (used.has(idx));
      used.add(idx);
      this.crows.push(new Crow(scene, mat, wingGeo, bodyGeo, perchSpots[idx].clone()));
    }

    // bats around the belfry
    this.batGroup = new THREE.Group();
    const belfry = new THREE.Vector3(WORLD.cathedral.x + 13, 27, WORLD.cathedral.z + 17);
    this.batGroup.position.copy(belfry);
    scene.add(this.batGroup);
    const batMat = new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.DoubleSide });
    this.bats = [];
    for (let i = 0; i < 6; i++) {
      const bat = new THREE.Group();
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.14), batMat);
        w.position.x = side * 0.16;
        bat.add(w);
        bat.userData['w' + (side + 1)] = w;
      }
      bat.userData.a = Math.random() * TAU;
      bat.userData.r = range(Math.random, 5, 13);
      bat.userData.speed = range(Math.random, 0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1);
      bat.userData.y = range(Math.random, -3, 4);
      bat.userData.flap = Math.random() * TAU;
      this.batGroup.add(bat);
      this.bats.push(bat);
    }
  }

  scareAll(center, radius) {
    let n = 0;
    for (const c of this.crows) {
      if (c.state === 'perched' && c.group.position.distanceTo(center) < radius) {
        c.scare(this.spots, this.audio, n * 0.22 + Math.random() * 0.2);
        n++;
      }
    }
  }

  update(dt, playerPos) {
    for (const c of this.crows) {
      if (c.state === 'perched' && c.group.position.distanceTo(playerPos) < 5.5) {
        c.scare(this.spots, this.audio, Math.random() * 0.25);
      }
      c.update(dt, playerPos);
    }
    const t = performance.now() / 1000;
    for (const bat of this.bats) {
      const u = bat.userData;
      u.a += dt * u.speed;
      bat.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.7 + u.flap) * 1.2, Math.sin(u.a) * u.r);
      bat.rotation.y = -u.a - Math.PI / 2 * Math.sign(u.speed);
      const flap = Math.sin(t * 17 + u.flap) * 0.7;
      bat.userData.w0.rotation.y = flap;
      bat.userData.w2.rotation.y = -flap;
    }
  }
}
