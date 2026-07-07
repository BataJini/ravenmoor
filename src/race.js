// Race the pale horse from the gravegate to the cathedral. He has been
// dead for years and still takes the corners better than you.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { haloTexture } from './builders.js';
import { clamp } from './util.js';

const FINISH = [0, -34];

export class Race {
  constructor(ctx, journal, horses, player) {
    this.ctx = ctx;
    this.journal = journal;
    this.horses = horses;
    this.player = player;
    this.wraith = horses.list.find(h => h.ghost);
    this.state = 'idle';
    this.t = 0;
    this.gateIndex = 0;
    this.whistleCd = 0;

    // gate rings
    this.gatePts = [...WORLD.raceGates, FINISH];
    this.gates = [];
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8fd8e8, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    this.gatePts.forEach(([x, z], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.13, 8, 26), mat.clone());
      const y = ctx.terrain.heightAt(x, z);
      ring.position.set(x, y + 2.5, z);
      const next = this.gatePts[Math.min(i + 1, this.gatePts.length - 1)];
      const prev = i > 0 ? this.gatePts[i - 1] : [39, 1];
      ring.rotation.y = Math.atan2(next[0] - prev[0], next[1] - prev[1]);
      ring.visible = false;
      ctx.scene.add(ring);
      this.gates.push(ring);
    });

    // challenge interaction, offered at the pale horse while mounted
    ctx.interact.register({
      pos: new THREE.Vector3(),
      radius: 2.6, maxDist: 6, priority: 0.9,
      dynamic: (playerPos, out) => {
        if (this.state !== 'idle') return false;
        if (!journal.getFlag('shoeDone') || journal.getFlag('raceWon')) return false;
        if (player.mode !== 'ride' || player.horse === this.wraith) return false;
        out.set(this.wraith.pos.x, this.wraith.pos.y + 1.6, this.wraith.pos.z);
        return true;
      },
      label: () => 'Challenge Wraith to a race',
      action: () => this.start()
    });
  }

  start() {
    this.state = 'countdown';
    this.t = 3.2;
    this.gateIndex = 0;
    this._beeped = {};
    this.gates.forEach(g => { g.visible = true; g.material.opacity = 0.5; });
    this.ctx.ui.toast('To the cathedral doors — through every ring. He knows the way. He IS the way.');
    // walk Wraith to the start line beside you
    this.wraith.pos.set(39, this.wraith.pos.y, 4);
    this.wraith.yaw = -Math.PI / 2;
  }

  _cleanup(win) {
    this.state = 'idle';
    this.gates.forEach(g => g.visible = false);
    this.ctx.ui.raceHud(false);
    this.wraith.race = null;
    if (win) {
      this.journal.setFlag('raceWon');
      this.journal.award('outrun');
      this.ctx.audio.fanfare(true);
      this.ctx.ui.toast('Wraith slows, bows his pale head — and accepts you. Whistle (R) and he will come.', 6200);
    } else {
      this.ctx.audio.fanfare(false);
      this.ctx.ui.toast('The dead ride light. Challenge him again when your blood is up.');
    }
  }

  whistle() {
    if (!this.journal.getFlag('raceWon')) return false;
    if (this.whistleCd > 0) return false;
    this.whistleCd = 18;
    const p = this.player;
    const a = p.yaw + Math.PI;
    const tx = p.pos.x - Math.sin(p.yaw) * 5;
    const tz = p.pos.z - Math.cos(p.yaw) * 5;
    this.ctx.audio.whistle();
    setTimeout(() => {
      if (this.wraith.ridden) return;
      this.wraith.pos.set(tx, this.ctx.terrain.heightAt(tx, tz), tz);
      this.wraith.yaw = a + Math.PI;
      this.wraith.state = 'idle';
      this.wraith.stateT = 6;
      this.ctx.particles.burst(new THREE.Vector3(tx, this.wraith.pos.y + 1.2, tz), 0x86c8de, 30, 2);
      this.ctx.audio.snort();
    }, 700);
    return true;
  }

  update(dt, time) {
    if (this.whistleCd > 0) this.whistleCd -= dt;
    if (this.state === 'idle') return;

    // pulse the current gate
    const cur = this.gates[this.gateIndex];
    if (cur) {
      const s = 1 + Math.sin(time * 6) * 0.08;
      cur.scale.setScalar(s);
      cur.material.opacity = 0.7;
    }

    if (this.state === 'countdown') {
      const before = Math.ceil(this.t);
      this.t -= dt;
      const after = Math.ceil(this.t);
      if (after !== before && after > 0) {
        this.ctx.ui.toast(String(after), 700);
        this.ctx.audio.countdown(false);
      }
      if (this.t <= 0) {
        this.state = 'running';
        this.t = 0;
        this.ctx.ui.toast('RIDE!', 900);
        this.ctx.audio.countdown(true);
        this.wraith.race = {
          wps: this.gatePts,
          i: 0,
          speed: 12.4,
          done: false
        };
        this.wraithRace = this.wraith.race;
      }
      return;
    }

    // running
    this.t += dt;
    this.ctx.ui.raceHud(true, this.t, this.gateIndex, this.gates.length);

    const p = this.player.pos;
    const g = this.gates[this.gateIndex];
    if (g) {
      const d = Math.hypot(p.x - g.position.x, p.z - g.position.z);
      if (d < 3.4) {
        g.visible = false;
        this.gateIndex++;
        this.ctx.audio.gateChime();
        this.ctx.particles.burst(g.position, 0x8fd8e8, 18, 1.6);
      }
    }
    if (this.gateIndex >= this.gates.length) {
      this._cleanup(true);
      return;
    }
    if (this.wraithRace && this.wraithRace.done) {
      this._cleanup(false);
      return;
    }
    // abandoning the race
    if (this.player.mode !== 'ride' || this.t > 180) {
      this._cleanup(false);
    }
  }
}
