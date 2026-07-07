// The thirteen lost souls: named, gathered with spectacle, carried visibly
// in orbit around you — and released at the bell.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { haloTexture } from './builders.js';
import { TAU, clamp, lerp } from './util.js';

const MILESTONES = {
  4: 'Four souls circle you now. The moor is watching.',
  7: 'Half the parish walks in your wake.',
  10: 'Ten. The bell tower leans closer to hear.'
};

export class Quest {
  constructor(ctx, persist) {
    this.ctx = ctx;
    this.persist = persist;
    this.total = WORLD.souls.length;
    this.souls = [];
    this.orbiters = [];
    this.finale = null;
    this.finaleDone = false;
    this.locket = false;

    let saved = [];
    if (persist) {
      try {
        saved = JSON.parse(localStorage.getItem('ravenmoor.souls') || '[]');
        this.finaleDone = localStorage.getItem('ravenmoor.rest') === '1';
      } catch { /* fresh parish */ }
    }

    const tex = haloTexture();
    for (const def of WORLD.souls) {
      const group = new THREE.Group();
      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xcfeaff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      core.scale.setScalar(0.55);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0x6fb0e8, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.setScalar(1.6);
      group.add(core, halo);
      const soul = {
        def, group, core, halo,
        collected: saved.includes(def.id),
        hidden: !!def.well,
        seed: Math.random() * TAU,
        riseT: -1
      };
      const y = ctx.terrain.heightAt(def.x, def.z);
      group.position.set(def.x, y + 1.35, def.z);
      ctx.scene.add(group);
      this.souls.push(soul);
      const src = ctx.particles.soulIdle(() => group.position);
      soul.src = src;
      if (soul.collected) {
        soul.hidden = true;
        this._makeOrbiter(soul, true);
      }
      group.visible = !soul.hidden;
      src.on = !soul.hidden;
    }
    this.count = this.souls.filter(s => s.collected).length;
    ctx.ui.setSouls(this.count, this.total);
  }

  _makeOrbiter(soul, silent = false) {
    // the soul's core sprite leaves its grave-light and follows you
    const i = this.orbiters.length;
    soul.group.visible = false;
    const sprite = new THREE.Sprite(soul.core.material.clone());
    sprite.scale.setScalar(0.34);
    sprite.material.opacity = 0.8;
    this.ctx.scene.add(sprite);
    this.orbiters.push({
      sprite,
      name: soul.def.name,
      a: (i / 13) * TAU + Math.random(),
      r: 0.85 + (i % 5) * 0.14,
      h: -0.25 + (i % 4) * 0.3,
      speed: 0.7 + (i % 3) * 0.35,
      state: 'orbit',
      t: 0
    });
    if (!silent) sprite.position.copy(soul.group.position);
  }

  freeWellSoul() {
    const soul = this.souls.find(s => s.def.well);
    if (!soul || !soul.hidden || soul.collected) return;
    soul.hidden = false;
    soul.riseT = 0;
    soul.group.visible = true;
    soul.src.on = true;
    this.ctx.audio.chime(2);
    this.ctx.ui.toast('Something pale rises, dripping, from the well.');
  }

  noticeText() {
    const left = this.total - this.count;
    if (this.finaleDone) return 'The bell has rung thirteen souls home, and dawn has kept its promise. Ravenmoor remembers the one who walked its mists. — Father Ossian';
    if (left === 0) return 'All thirteen souls walk beside you. Ring the bell of Ravenmoor, and let them go home. — Father Ossian';
    return `The bell of Ravenmoor has fallen silent. ${left} soul${left === 1 ? '' : 's'} still wander the parish, unable to rest. Gather them, and let the bell call them home. The old watchtower on the east hill sees farther than any of us. — Father Ossian`;
  }

  candlePrayer() {
    const left = this.total - this.count;
    if (left === 0) return 'The flame stands perfectly still. They are all listening now.';
    return `The flame bows ${left === 1 ? 'once' : left + ' times'}. ${left} still out in the dark.`;
  }

  onBell() {
    if (this.finaleDone || this.finale) {
      if (this.finaleDone) this.ctx.ui.toast('The bell rings clear and unburdened.');
      return;
    }
    const left = this.total - this.count;
    if (left > 0) {
      this.ctx.ui.toast(`The bell tolls… ${left} soul${left === 1 ? '' : 's'} still wander the moor. (Press J for the journal.)`);
      return;
    }
    this._startFinale();
  }

  _startFinale() {
    const c = WORLD.cathedral;
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9fd4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, 170, 18, 1, true), beamMat);
    beam.position.set(c.x, 80, c.z);
    this.ctx.scene.add(beam);

    // your carried souls are the finale — they stream out of you
    this.orbiters.forEach((o, i) => {
      o.state = 'depart';
      o.t = -i * 0.42;
      o.spiralR = 8 + (i % 4) * 1.5;
      o.spiralY = 2 + i * 0.6;
      o.spiralSpeed = 0.9 + (i % 5) * 0.14;
      o.sprite.material.opacity = 0.95;
      o.sprite.scale.setScalar(0.7);
    });

    this.finale = { t: 0, beam, beamMat };
    this.ctx.audio.soulChorus();
    if (this.ctx.slowmo) this.ctx.slowmo(0.45);
    this.ctx.ui.flash(0.7);
    this.ctx.ui.toast('The thirteen rise from your keeping, singing without sound.');
    if (this.ctx.onDawn) this.ctx.onDawn();
  }

  update(dt, playerPos, time) {
    for (const soul of this.souls) {
      if (soul.collected || soul.hidden) continue;
      const g = soul.group;
      const def = soul.def;
      const baseY = this.ctx.terrain.heightAt(def.x, def.z);
      if (soul.riseT >= 0 && soul.riseT < 1) {
        soul.riseT = Math.min(1, soul.riseT + dt * 0.5);
        g.position.y = baseY - 0.8 + (2.15 + Math.sin(time * 1.3 + soul.seed) * 0.25) * soul.riseT;
      } else {
        g.position.set(
          def.x + Math.sin(time * 0.5 + soul.seed) * 0.5,
          baseY + 1.35 + Math.sin(time * 1.3 + soul.seed) * 0.25,
          def.z + Math.cos(time * 0.42 + soul.seed * 1.7) * 0.5
        );
      }
      const pulse = 0.85 + Math.sin(time * 2.2 + soul.seed) * 0.15;
      soul.core.material.opacity = 0.85 * pulse;
      soul.halo.scale.setScalar(1.4 + pulse * 0.4);

      if (playerPos.distanceTo(g.position) < 1.6) this._collect(soul);
    }

    this._updateOrbiters(dt, playerPos, time);
    if (this.finale) this._updateFinale(dt, time);
  }

  _collect(soul) {
    soul.collected = true;
    soul.src.on = false;
    this.count++;
    const { ui, audio, particles } = this.ctx;

    // spectacle
    if (this.ctx.slowmo) this.ctx.slowmo(0.3);
    ui.flash(0.55 + this.count * 0.02);
    audio.soulSwell(this.count);
    particles.burst(soul.group.position, 0x9fd4ff, 34, 2.4);
    particles.burst(soul.group.position, 0xffffff, 12, 0.9);
    this._makeOrbiter(soul);

    ui.setSouls(this.count, this.total);
    const left = this.total - this.count;
    if (this.count === this.total) {
      ui.toast(`${soul.def.name} joins the circle. THIRTEEN. Ring the bell of Ravenmoor.`, 5200);
    } else if (MILESTONES[this.count]) {
      ui.toast(`${soul.def.name} walks with you. ${MILESTONES[this.count]}`, 4800);
      audio.whisper();
      if (this.ctx.onMilestone) this.ctx.onMilestone(this.count);
    } else {
      ui.toast(`${soul.def.name} walks with you now. ${left} remain${left === 1 ? 's' : ''}.`, 3800);
    }
    if (this.ctx.onSoul) this.ctx.onSoul(this.count, soul.def);
    this._save();
  }

  _updateOrbiters(dt, playerPos, time) {
    const c = WORLD.cathedral;
    for (let i = this.orbiters.length - 1; i >= 0; i--) {
      const o = this.orbiters[i];
      if (o.state === 'orbit') {
        o.a += dt * o.speed;
        const wob = Math.sin(time * 1.4 + i) * 0.12;
        o.sprite.position.set(
          playerPos.x + Math.cos(o.a) * o.r,
          playerPos.y + o.h + wob,
          playerPos.z + Math.sin(o.a) * o.r
        );
        o.sprite.material.opacity = 0.55 + Math.sin(time * 2 + i * 1.7) * 0.2;
      } else if (o.state === 'depart') {
        o.t += dt;
        if (o.t < 0) {   // still waiting its turn, keep orbiting
          o.a += dt * o.speed;
          o.sprite.position.set(
            playerPos.x + Math.cos(o.a) * o.r,
            playerPos.y + o.h,
            playerPos.z + Math.sin(o.a) * o.r
          );
          continue;
        }
        // fly to the beam
        const k = clamp(o.t / 1.6, 0, 1);
        const e = k * k * (3 - 2 * k);
        const tx = c.x + Math.cos(o.a) * o.spiralR;
        const tz = c.z + Math.sin(o.a) * o.spiralR;
        o.sprite.position.x = lerp(o.sprite.position.x, tx, e * 0.2 + dt * 4 * e);
        o.sprite.position.y = lerp(o.sprite.position.y, o.spiralY, e * 0.2 + dt * 4 * e);
        o.sprite.position.z = lerp(o.sprite.position.z, tz, e * 0.2 + dt * 4 * e);
        if (k >= 1) o.state = 'spiral';
      } else if (o.state === 'spiral') {
        o.a += dt * o.spiralSpeed;
        o.spiralR = Math.max(0.4, o.spiralR - dt * 0.5);
        o.spiralY += dt * (2.4 + (this.finale ? this.finale.t * 0.3 : 0));
        o.sprite.position.set(
          c.x + Math.cos(o.a) * o.spiralR,
          o.spiralY,
          c.z + Math.sin(o.a) * o.spiralR
        );
        if (o.spiralY > 120) {
          o.sprite.material.opacity -= dt * 1.5;
          if (o.sprite.material.opacity <= 0) {
            this.ctx.scene.remove(o.sprite);
            this.orbiters.splice(i, 1);
          }
        }
      }
    }
  }

  _updateFinale(dt, time) {
    const f = this.finale;
    f.t += dt;
    const fadeIn = clamp(f.t / 3, 0, 1);
    const fadeOut = clamp((26 - f.t) / 5, 0, 1);
    f.beamMat.opacity = 0.36 * fadeIn * fadeOut;
    if (f.t > 7 && !f.chimed) {
      f.chimed = true;
      this.ctx.audio.soulChorus();
    }
    if (f.t > 26) {
      this.ctx.scene.remove(f.beam);
      this.finale = null;
      this.finaleDone = true;
      this.ctx.ui.toast('Ravenmoor rests. The moor — and the morning — are yours.', 6000);
      if (this.ctx.onFinaleDone) this.ctx.onFinaleDone();
      this._save();
    }
  }

  _save() {
    if (!this.persist) return;
    try {
      localStorage.setItem('ravenmoor.souls', JSON.stringify(this.souls.filter(s => s.collected).map(s => s.def.id)));
      if (this.finaleDone) localStorage.setItem('ravenmoor.rest', '1');
    } catch { /* private mode */ }
  }
}
