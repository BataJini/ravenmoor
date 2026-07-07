// Horses: procedurally built, fully articulated (4 two-segment legs, neck,
// head, tail, ears), with walk/gallop gaits, wandering AI, riding physics,
// petting, breath in the cold air — and one of them is dead.
import * as THREE from 'three';
import { TAU, clamp, lerp, smoothstep, damp, dampAngle, resolveCollisions, range } from './util.js';
import { WORLD } from './layout.js';

const FWD = new THREE.Vector3();
const TMP = new THREE.Vector3();

class Horse {
  constructor(ctx, def) {
    this.ctx = ctx;
    this.def = def;
    this.name = def.name;
    this.ghost = !!def.ghost;
    this.pos = new THREE.Vector3(def.x, 0, def.z);
    this.yaw = def.yaw ?? Math.random() * TAU;
    this.speed = 0;
    this.phase = 0;
    this.state = 'idle';
    this.stateT = range(Math.random, 1, 4);
    this.target = new THREE.Vector3(def.x, 0, def.z);
    this.ridden = false;
    this.petT = 0;
    this.breathT = range(Math.random, 4, 9);
    this.earT = range(Math.random, 2, 6);
    this.earFlick = 0;
    this.lastLegPhase = [0, 0, 0, 0];
    this._build(def);
  }

  _build(def) {
    const coat = new THREE.MeshLambertMaterial({ color: def.coat });
    const dark = new THREE.MeshLambertMaterial({ color: def.mane });
    if (this.ghost) {
      for (const m of [coat, dark]) {
        m.transparent = true;
        m.opacity = 0.72;
        m.emissive = new THREE.Color(0x5f9fb8);
        m.emissiveIntensity = 0.45;
        m.depthWrite = true;
      }
      dark.opacity = 0.6;
    }
    this.coatMat = coat;

    const root = new THREE.Group();
    this.root = root;

    // body
    const body = new THREE.Group();
    body.position.y = 1.16;
    root.add(body);
    this.body = body;
    const torsoGeo = new THREE.CapsuleGeometry(0.34, 1.15, 5, 10).rotateX(Math.PI / 2);
    const torso = new THREE.Mesh(torsoGeo, coat);
    torso.scale.set(0.94, 1.12, 1);
    torso.castShadow = true;
    body.add(torso);
    // chest + haunch masses give the silhouette its horse-ness
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), coat);
    chest.position.set(0, 0.02, 0.5);
    chest.scale.set(0.92, 1.05, 1);
    chest.castShadow = true;
    body.add(chest);
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), coat);
    haunch.position.set(0, 0.05, -0.48);
    haunch.scale.set(0.95, 1.1, 1.15);
    haunch.castShadow = true;
    body.add(haunch);

    // neck + head
    const neck = new THREE.Group();
    neck.position.set(0, 0.26, 0.66);
    body.add(neck);
    this.neck = neck;
    const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 8), coat);
    neckMesh.position.y = 0.38;
    neckMesh.castShadow = true;
    neck.add(neckMesh);
    // mane along the back of the neck
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.14), dark);
      tuft.position.set(0, 0.2 + i * 0.21, -0.15);
      neck.add(tuft);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.8, 0.05);
    neck.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8), coat);
    skull.castShadow = true;
    head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.19, 0.4), coat);
    muzzle.position.set(0, -0.04, 0.26);
    muzzle.castShadow = true;
    head.add(muzzle);
    this.muzzle = muzzle;
    const forelock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), dark);
    forelock.position.set(0, 0.16, 0.04);
    head.add(forelock);
    this.ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), coat);
      ear.position.set(side * 0.1, 0.22, -0.04);
      ear.rotation.z = -side * 0.25;
      head.add(ear);
      this.ears.push(ear);
    }

    // tail
    const tail = new THREE.Group();
    tail.position.set(0, 0.32, -0.72);
    body.add(tail);
    this.tail = tail;
    const dock = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.25, 3, 6), dark);
    dock.position.y = -0.16;
    tail.add(dock);
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 6), dark);
    hair.position.y = -0.5;
    hair.rotation.x = Math.PI;
    tail.add(hair);

    // legs: FL, FR, BL, BR
    this.legs = [];
    const legDefs = [
      [0.26, 0.55], [-0.26, 0.55], [0.26, -0.55], [-0.26, -0.55]
    ];
    for (const [lx, lz] of legDefs) {
      const thigh = new THREE.Group();
      thigh.position.set(lx, -0.11, lz);
      body.add(thigh);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 3, 7), coat);
      upper.position.y = -0.25;
      upper.castShadow = true;
      thigh.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      thigh.add(knee);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 3, 6), coat);
      lower.position.y = -0.24;
      lower.castShadow = true;
      knee.add(lower);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.11, 8), dark);
      hoof.position.y = -0.47;
      knee.add(hoof);
      this.legs.push({ thigh, knee });
    }

    // saddle (not for the ghost)
    if (!this.ghost) {
      const leather = new THREE.MeshLambertMaterial({ color: 0x2c1d10 });
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.75),
        new THREE.MeshLambertMaterial({ color: 0x351019 }));
      blanket.position.set(0, 0.38, -0.05);
      body.add(blanket);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.5), leather);
      seat.position.set(0, 0.46, -0.05);
      body.add(seat);
      const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), leather);
      pommel.position.set(0, 0.52, 0.16);
      body.add(pommel);
      const strapMat = new THREE.MeshLambertMaterial({ color: 0x22150b });
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.06), strapMat);
        strap.position.set(side * 0.34, 0.22, -0.05);
        body.add(strap);
      }
    }

    // the rider: a hooded figure, visible only when mounted
    const cloakMat = new THREE.MeshLambertMaterial({ color: 0x211c2b });
    const rider = new THREE.Group();
    rider.position.set(0, 0.4, -0.05);
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.82, 8), cloakMat);
    cloak.position.y = 0.41;
    cloak.castShadow = true;
    rider.add(cloak);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), cloakMat);
    shoulders.position.y = 0.78;
    shoulders.scale.set(1.15, 0.75, 0.9);
    rider.add(shoulders);
    const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a7864 }));
    riderHead.position.y = 0.97;
    rider.add(riderHead);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 7), cloakMat);
    hood.position.set(0, 1.02, -0.03);
    hood.rotation.x = -0.5;
    rider.add(hood);
    rider.visible = false;
    this.rider = rider;
    body.add(rider);

    this.ctx.scene.add(root);
    if (this.ghost) {
      this.ctx.particles.ghostTrail(
        () => TMP.copy(this.pos).setY(this.pos.y + 1.1),
        () => this.speed
      );
    }
  }

  // World-space anchor the rider camera hangs from.
  getRiderAnchor(out) {
    out.set(this.pos.x, this.pos.y + 2.05, this.pos.z);
    return out;
  }

  forward(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  pet() {
    this.petT = 2.0;
    this.earFlick = 1;
    if (Math.random() < 0.5) this.ctx.audio.nicker(); else this.ctx.audio.snort();
    this.ctx.particles.breath(this._muzzleWorld(), Math.sin(this.yaw), Math.cos(this.yaw));
    this.ctx.onPet && this.ctx.onPet(this.name);
  }

  _muzzleWorld() {
    this.muzzle.getWorldPosition(TMP);
    return TMP;
  }

  update(dt, player, input) {
    const { terrain, audio } = this.ctx;
    const gallopBlend = smoothstep(4.5, 9.5, this.speed);
    const wasSpeed = this.speed;

    if (this.race) {
      // --- racing the course, dead or alive ---
      const wp = this.race.wps[this.race.i];
      const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
      if (Math.hypot(dx, dz) < 3) {
        this.race.i++;
        if (this.race.i >= this.race.wps.length) {
          this.race.done = true;
          this.race = null;
        }
      } else {
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 3.5, dt);
        this.speed = damp(this.speed, this.race.speed, 1.6, dt);
      }
    } else if (this.ridden) {
      // --- riding physics ---
      const fwdIn = (input.held('w') ? 1 : 0) - (input.held('s') ? 1 : 0);
      const turnIn = (input.held('a') ? 1 : 0) - (input.held('d') ? 1 : 0);
      const wantGallop = input.held('shift') && fwdIn > 0;
      const boost = this.ctx.gallopBoost || 1;
      const target = fwdIn > 0 ? (wantGallop ? 13.0 * boost : 5.6) : fwdIn < 0 ? -2.0 : 0;
      const lam = Math.abs(target) > Math.abs(this.speed) ? 1.5 : 2.6;
      this.speed = damp(this.speed, target, lam, dt);
      const turnRate = lerp(2.1, 1.0, clamp(Math.abs(this.speed) / 13, 0, 1));
      this.yaw += turnIn * turnRate * dt * (this.speed < -0.1 ? -1 : 1);
    } else {
      // --- wandering AI ---
      this.stateT -= dt;
      if (this.petT > 0) {
        this.speed = damp(this.speed, 0, 4, dt);
      } else if (this.state === 'idle') {
        this.speed = damp(this.speed, 0, 3, dt);
        if (this.stateT <= 0) {
          if (Math.random() < 0.45) {
            this.state = 'graze';
            this.stateT = range(Math.random, 3, 8);
          } else {
            const home = this.def.home;
            const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * home.r;
            this.target.set(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
            this.state = 'walk';
            this.stateT = 20;
          }
        }
      } else if (this.state === 'graze') {
        this.speed = damp(this.speed, 0, 3, dt);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = range(Math.random, 2, 6); }
      } else if (this.state === 'walk') {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.3 || this.stateT <= 0) {
          this.state = 'idle';
          this.stateT = range(Math.random, 2, 7);
        } else {
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 2.2, dt);
          this.speed = damp(this.speed, this.ghost ? 1.5 : 2.1, 1.8, dt);
        }
      }
    }

    // move & collide
    if (Math.abs(this.speed) > 0.02) {
      this.forward(FWD);
      const before = TMP.copy(this.pos);
      this.pos.x += FWD.x * this.speed * dt;
      this.pos.z += FWD.z * this.speed * dt;
      // a racing ghost passes through fences; everyone else collides
      if (!(this.race && this.ghost)) resolveCollisions(this.pos, 0.8);
      // world boundary
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > WORLD.bounds - 3) {
        const s = (WORLD.bounds - 3) / d;
        this.pos.x *= s; this.pos.z *= s;
        if (this.ridden) this.ctx.onBoundary && this.ctx.onBoundary();
      }
      // wandering horse hit a wall: give up and idle
      if (!this.ridden && this.state === 'walk') {
        const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
        if (moved < Math.abs(this.speed) * dt * 0.25) {
          this.state = 'idle';
          this.stateT = 1.5;
        }
      }
    }
    this.pos.y = terrain.heightAt(this.pos.x, this.pos.z);

    // --- gait animation ---
    const absSpeed = Math.abs(this.speed);
    const activity = clamp(absSpeed / 1.1, 0, 1);
    const strideLen = lerp(1.75, 3.6, gallopBlend);
    this.phase = (this.phase + dt * absSpeed / strideLen) % 1;
    const offsets = [
      lerp(0.0, 0.5, gallopBlend),
      lerp(0.5, 0.62, gallopBlend),
      lerp(0.25, 0.0, gallopBlend),
      lerp(0.75, 0.12, gallopBlend)
    ];
    const swingAmp = lerp(0.42, 0.8, gallopBlend) * activity;
    const kneeAmp = lerp(0.55, 1.0, gallopBlend) * activity;
    for (let i = 0; i < 4; i++) {
      const p = (this.phase + offsets[i]) % 1;
      const a = p * TAU;
      this.legs[i].thigh.rotation.x = Math.sin(a) * swingAmp;
      this.legs[i].knee.rotation.x = Math.max(0, Math.cos(a)) * kneeAmp * 0.9;
      // hoof-fall sounds at phase wrap of the contact point
      const lp = this.lastLegPhase[i];
      this.lastLegPhase[i] = p;
      if (lp > 0.8 && p < 0.2 && absSpeed > 0.7) {
        const pd = player ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : 99;
        if (this.ridden || pd < 26) {
          const vol = this.ridden ? 1 : clamp(1.2 - pd / 26, 0.1, 1);
          audio.clop(vol * lerp(0.6, 1, gallopBlend), terrain.groundType(this.pos.x, this.pos.z) !== 'grass');
        }
      }
    }

    // body bob & lean
    this.body.position.y = 1.16 + Math.sin(this.phase * TAU * 2) * lerp(0.02, 0.06, gallopBlend) * activity;
    this.body.rotation.x = Math.sin(this.phase * TAU) * 0.05 * gallopBlend;
    // terrain slope alignment
    this.forward(FWD);
    const hAhead = terrain.heightAt(this.pos.x + FWD.x, this.pos.z + FWD.z);
    const hBehind = terrain.heightAt(this.pos.x - FWD.x, this.pos.z - FWD.z);
    this.root.rotation.x = clamp((hBehind - hAhead) * 0.5, -0.3, 0.3);

    // neck / head pose (graze needs > pi/2 so the muzzle truly reaches down)
    let neckTarget = lerp(0.78, 1.02, gallopBlend);
    if (this.state === 'graze' && !this.ridden) neckTarget = 2.3;
    if (this.petT > 0) neckTarget = 0.58;
    this.neck.rotation.x = damp(this.neck.rotation.x, neckTarget + Math.sin(this.phase * TAU) * 0.06 * activity, 3.5, dt);
    this.head.rotation.x = -this.neck.rotation.x * (this.neck.rotation.x > 1.6 ? 0.4 : 0.72);

    // tail sway
    const t = performance.now() / 1000 + (this.def.seed || 0);
    this.tail.rotation.z = Math.sin(t * 1.6) * 0.22 + Math.sin(t * 3.7) * 0.06;
    this.tail.rotation.x = -0.12 - gallopBlend * 0.5;

    // ears
    this.earT -= dt;
    if (this.earT <= 0) { this.earFlick = 1; this.earT = range(Math.random, 3, 9); }
    if (this.earFlick > 0) {
      this.earFlick = Math.max(0, this.earFlick - dt * 3);
      const w = Math.sin(this.earFlick * Math.PI * 4) * 0.35;
      this.ears[0].rotation.x = w;
      this.ears[1].rotation.x = -w * 0.6;
    }

    // breath in the night air
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = range(Math.random, 6, 12);
      const pd = player ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : 99;
      if (pd < 20 && !this.ghost) {
        this.ctx.particles.breath(this._muzzleWorld(), Math.sin(this.yaw), Math.cos(this.yaw));
        if (pd < 8 && Math.random() < 0.4) audio.snort();
      }
    }

    if (this.petT > 0) this.petT -= dt;

    // ghost shimmer
    if (this.ghost) {
      this.coatMat.emissiveIntensity = 0.4 + Math.sin(t * 2.3) * 0.12;
    }

    // the rider leans into the gallop
    this.rider.visible = this.ridden;
    if (this.ridden) {
      this.rider.rotation.x = 0.16 * gallopBlend + Math.sin(this.phase * TAU * 2) * 0.02 * activity;
      this.rider.rotation.z = Math.sin(this.phase * TAU) * 0.03 * activity;
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}

export class Horses {
  constructor(ctx) {
    this.ctx = ctx;
    const pd = WORLD.paddock;
    this.list = [
      new Horse(ctx, {
        name: 'Nyx', coat: 0x17171d, mane: 0x0a0a0e,
        x: pd.x - 4, z: pd.z + 2, yaw: 2.4, seed: 1,
        home: { x: pd.x, z: pd.z, r: 8.5 }
      }),
      new Horse(ctx, {
        name: 'Ashfall', coat: 0x38231a, mane: 0x160d06,
        x: pd.x + 4.5, z: pd.z - 3, yaw: 5.1, seed: 2,
        home: { x: pd.x, z: pd.z, r: 8.5 }
      }),
      new Horse(ctx, {
        name: 'Wraith', coat: 0xb9d6e4, mane: 0x7da8bc, ghost: true,
        x: 60, z: -4, yaw: 1.2, seed: 3,
        home: { x: 63, z: 0, r: 13 }
      })
    ];

    // mount / pet interactions
    for (const h of this.list) {
      ctx.interact.register({
        pos: new THREE.Vector3(),
        radius: 1.6, maxDist: 3.4,
        dynamic: (playerPos, out) => {
          if (h.ridden || h.race) return false;
          // no remounting offers while already in a saddle
          if (ctx.playerRef && ctx.playerRef.mode === 'ride') return false;
          out.set(h.pos.x, h.pos.y + 1.4, h.pos.z);
          return true;
        },
        label: () => h.ghost ? `Mount ${h.name}, the pale horse` : `Mount ${h.name}`,
        action: () => ctx.onMount && ctx.onMount(h),
        secondaryLabel: () => `Pet ${h.name}`,
        secondaryAction: () => {
          h.pet();
          ctx.ui.toast(h.ghost
            ? `${h.name} is cold as riverwater, and glad of you.`
            : `${h.name} leans into your hand.`);
        }
      });
    }
  }

  nearestRideable(pos, maxD = 3) {
    let best = null, bd = maxD;
    for (const h of this.list) {
      if (h.ridden) continue;
      const d = Math.hypot(pos.x - h.pos.x, pos.z - h.pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // Keep the player (or the ridden horse) from walking through horses.
  pushOut(pos, radius, exclude) {
    for (const h of this.list) {
      if (h === exclude) continue;
      const dx = pos.x - h.pos.x, dz = pos.z - h.pos.z;
      const min = radius + 0.85;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
  }

  update(dt, player, input) {
    for (const h of this.list) h.update(dt, player, input);
  }
}
