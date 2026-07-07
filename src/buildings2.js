// Act II districts: The Drowned Rat tavern, the watchtower hill, the
// stone circle and its old rite, the Bone Chapel — and six silver ravens.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { addCircle, addSeg, TAU, range, clamp } from './util.js';
import { MAT, T, GeoBatch, haloTexture, archFrameGeo, archShape, normalizeUVs } from './builders.js';
import { crowBody } from './crows.js';

export function buildDistricts(ctx, journal, player) {
  const { scene, rng, terrain, interact, audio, ui, particles, addLamp } = ctx;
  const batch = new GeoBatch();
  const group = new THREE.Group();
  scene.add(group);
  const updaters = [];

  // ======================= silver ravens =======================
  const ravenGeo = crowBody();
  const ravenMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.85, roughness: 0.25 });
  const placeRaven = (id, x, y, z, label = 'Take the silver raven') => {
    if (journal.ravens.has(id)) return;
    const m = new THREE.Mesh(ravenGeo, ravenMat);
    m.position.set(x, y, z);
    m.rotation.y = rng() * TAU;
    m.scale.setScalar(0.9);
    group.add(m);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xcfe0f2, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glint.position.set(x, y + 0.1, z);
    glint.scale.setScalar(0.9);
    group.add(glint);
    interact.register({
      pos: new THREE.Vector3(x, y, z),
      radius: 1.2, maxDist: 4.2,
      label: () => m.visible ? label : null,
      action: () => {
        m.visible = false;
        glint.visible = false;
        journal.foundRaven(id);
        audio.chime(3);
        particles.burst(m.position, 0xcfe0f2, 14, 1.0);
        const n = journal.ravens.size;
        if (n >= 6) {
          player.sprintBoost = 1.15;
          ui.toast('The six ravens hum together in your pack. Your stride lengthens.');
        } else {
          ui.toast(`A silver raven, cold and heavier than it looks. (${n} / 6)`);
        }
      }
    });
  };

  // ======================= The Drowned Rat =======================
  {
    const tx = WORLD.tavern.x, tz = WORLD.tavern.z, rot = WORLD.tavern.rot;
    const ty = terrain.heightAt(tx, tz);
    const rot2 = (px, pz) => [tx + px * Math.cos(rot) + pz * Math.sin(rot), tz - px * Math.sin(rot) + pz * Math.cos(rot)];
    const P = (px, py, pz, ry = 0) => {
      const [wx, wz] = rot2(px, pz);
      return T(wx, ty + py, wz, rot + ry);
    };
    const W = 11, D = 7.5, H = 3.6;
    // walls with a door gap on the front (+z local)
    batch.box(MAT.stone, W, H, 0.5, P(0, H / 2, -D / 2));
    batch.box(MAT.stone, 0.5, H, D, P(-W / 2, H / 2, 0));
    batch.box(MAT.stone, 0.5, H, D, P(W / 2, H / 2, 0));
    batch.box(MAT.stone, W / 2 - 1.1, H, 0.5, P(-W / 4 - 0.55, H / 2, D / 2));
    batch.box(MAT.stone, W / 2 - 1.1, H, 0.5, P(W / 4 + 0.55, H / 2, D / 2));
    batch.box(MAT.stone, 2.2, H - 2.5, 0.5, P(0, 2.5 + (H - 2.5) / 2, D / 2));
    // roof
    const ang = Math.atan2(2.6, D / 2);
    const slope = Math.hypot(D / 2, 2.6) + 0.6;
    batch.box(MAT.roof, W + 1, 0.32, slope, P(0, H + 1.3, -D / 4).multiply(new THREE.Matrix4().makeRotationX(-ang)));
    batch.box(MAT.roof, W + 1, 0.32, slope, P(0, H + 1.3, D / 4).multiply(new THREE.Matrix4().makeRotationX(ang)));
    // gable ends close the triangle under the ridge (ridge runs along local X)
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, 2.6); tri.lineTo(-D / 2, 0);
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false });
    triGeo.rotateY(Math.PI / 2);
    batch.add(MAT.wood, triGeo, P(W / 2 - 0.4, H, 0));
    batch.add(MAT.wood, triGeo, P(-W / 2, H, 0));
    // rafter beam (for a raven)
    batch.box(MAT.darkWood, 0.22, 0.24, D - 0.6, P(1.8, H - 0.35, 0));
    // floor + hearth
    batch.box(MAT.darkWood, W - 0.8, 0.12, D - 0.8, P(0, 0.06, 0));
    terrain.addWoodFloor(tx, tz, 5.4);
    // fireplace on the west wall
    batch.box(MAT.darkStone, 1.8, 2.2, 0.9, P(-W / 2 + 0.7, 1.1, -1.2));
    batch.box(MAT.darkStone, 2.2, 0.3, 1.1, P(-W / 2 + 0.75, 2.35, -1.2));
    batch.box(MAT.darkStone, 0.9, 3.4, 0.9, P(-W / 2 + 0.6, H + 1.2, -1.2));  // chimney
    const [fx, fz] = rot2(-W / 2 + 0.95, -1.2);
    const firePos = new THREE.Vector3(fx, ty + 0.55, fz);
    particles.torchFlame(() => firePos);
    addLamp(fx, ty + 1.1, fz, 0xff8a3a, 22, 17, 5);
    // candle-warmth under the rafters so the room reads
    const [ctrX, ctrZ] = rot2(0.5, 0);
    addLamp(ctrX, ty + 2.6, ctrZ, 0xffb163, 10, 12, 3);
    const [cx2, cz2] = rot2(-W / 2 + 0.6, -1.2);
    const chimPos = new THREE.Vector3(cx2, ty + H + 3.1, cz2);
    particles.chimneySmoke(() => chimPos);
    interact.register({
      pos: firePos.clone(), radius: 1.5, maxDist: 3,
      label: () => 'Stoke the fire',
      action: () => {
        audio.crackle(); audio.crackle();
        particles.burst(firePos, 0xffa050, 10, 1.2);
        ui.toast('The fire spits sparks and settles, satisfied.');
      }
    });
    // bar + mugs + tables
    batch.box(MAT.darkWood, 3.6, 1.05, 0.7, P(2.6, 0.55, -D / 2 + 1.1));
    for (const mx of [1.4, 2.3, 3.4]) {
      batch.add(MAT.darkWood, new THREE.CylinderGeometry(0.07, 0.06, 0.14, 7), P(mx, 1.18, -D / 2 + 1.05));
    }
    const [bx2, bz2] = rot2(2.6, -D / 2 + 1.35);
    addSeg(...rot2(0.8, -D / 2 + 1.5), ...rot2(4.4, -D / 2 + 1.5), 0.35);
    interact.register({
      pos: new THREE.Vector3(bx2, ty + 1.3, bz2), radius: 1.6, maxDist: 3,
      label: () => 'Drink mulled cider',
      action: () => {
        audio.coin();
        ui.flash(0.25);
        ui.toast(['Warmth spreads to your fingertips. The night backs off a step.',
          'It tastes of apples, cloves, and someone’s better years.'][Math.floor(rng() * 2)]);
      }
    });
    // tables + candles
    for (const [px, pz] of [[-1.6, 1.4], [2.4, 1.6], [-2.4, -1.6]]) {
      batch.cyl(MAT.darkWood, 0.62, 0.62, 0.08, 10, P(px, 0.86, pz));
      batch.cyl(MAT.darkWood, 0.09, 0.12, 0.85, 7, P(px, 0.43, pz));
      batch.cyl(MAT.darkWood, 0.24, 0.26, 0.5, 8, P(px + 0.85, 0.25, pz + 0.2));
      batch.cyl(MAT.darkWood, 0.24, 0.26, 0.5, 8, P(px - 0.8, 0.25, pz - 0.3));
      const [wx2, wz2] = rot2(px, pz);
      addCircle(wx2, wz2, 0.7);
      batch.cyl(MAT.bone, 0.035, 0.045, 0.16, 6, P(px + 0.2, 0.98, pz));
      const [cwx, cwz] = rot2(px + 0.2, pz);
      const candleP = new THREE.Vector3(cwx, ty + 1.08, cwz);
      particles.candleFlame(() => candleP);
    }
    // the lute on the wall
    batch.add(MAT.wood, new THREE.SphereGeometry(0.26, 8, 6), P(4.6, 1.8, 0.2, 0, 0, 0).multiply(new THREE.Matrix4().makeScale(1, 1.35, 0.4)));
    batch.box(MAT.wood, 0.08, 0.7, 0.05, P(4.6, 2.45, 0.2));
    const [lx2, lz2] = rot2(4.6, 0.2);
    let luteStep = 0;
    interact.register({
      pos: new THREE.Vector3(lx2, ty + 1.9, lz2), radius: 1.4, maxDist: 3,
      label: () => 'Pluck the old lute',
      action: () => {
        audio.lute(luteStep++);
        if (luteStep % 6 === 0) ui.toast('Somewhere in the room, a ghost hums along.');
      }
    });
    // the patron who never left
    const patron = new THREE.Group();
    const pMat = new THREE.MeshLambertMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.28, emissive: 0x7fa8c0, emissiveIntensity: 0.5 });
    const torso = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), pMat);
    torso.position.y = 1.0;
    patron.add(torso);
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), pMat);
    pHead.position.y = 1.55;
    patron.add(pHead);
    const [gx2, gz2] = rot2(-2.4, -2.3);
    patron.position.set(gx2, ty + 0.15, gz2);
    patron.rotation.y = rot + 0.5;
    group.add(patron);
    interact.register({
      pos: new THREE.Vector3(gx2, ty + 1.2, gz2), radius: 1.4, maxDist: 3,
      label: () => 'Sit with the quiet patron',
      action: () => {
        audio.whisper();
        ui.toast('His mug has been empty for forty years. He does not seem to mind company.');
      }
    });
    // sign + colliders
    batch.box(MAT.darkWood, 1.4, 0.9, 0.06, P(1.9, 2.6, D / 2 + 0.35));
    batch.box(MAT.iron, 0.05, 0.5, 0.05, P(1.9, 3.25, D / 2 + 0.2));
    const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = rot2(...corners[i]);
      const [bx3, bz3] = rot2(...corners[(i + 1) % 4]);
      if (i === 2) {   // front wall: leave the doorway
        const [dl] = [rot2(1.1, D / 2)], [dr] = [rot2(-1.1, D / 2)];
        addSeg(ax, az, dl[0], dl[1], 0.35);
        addSeg(dr[0], dr[1], bx3, bz3, 0.35);
      } else {
        addSeg(ax, az, bx3, bz3, 0.35);
      }
    }
    addCircle(fx, fz, 0.9);
    // raven on the rafter
    const [rx2, rz2] = rot2(1.8, 1.5);
    placeRaven('r1', rx2, ty + H - 0.15, rz2);
  }

  // ======================= the watchtower hill =======================
  {
    const wx = WORLD.watchtower.x, wz = WORLD.watchtower.z;
    const wy = terrain.heightAt(wx, wz);
    // broken ring wall
    const N = 10;
    for (let i = 0; i < N; i++) {
      if (i === 3 || i === 4) continue;   // the collapsed doorway
      const a = (i / N) * TAU;
      const px = wx + Math.cos(a) * 4.2, pz = wz + Math.sin(a) * 4.2;
      const h = 1.6 + ((i * 2.7) % 2.2);
      batch.box(MAT.stone, 2.7, h, 0.7, T(px, wy + h / 2, pz, -a + Math.PI / 2));
      const a2 = ((i + 1) / N) * TAU;
      addSeg(wx + Math.cos(a) * 4.2, wz + Math.sin(a) * 4.2, wx + Math.cos(a2) * 4.2, wz + Math.sin(a2) * 4.2, 0.4);
    }
    // undo the two doorway collider segments
    // (cheap: overlay nothing — the gap segs above were skipped visually but
    //  added; rebuild colliders precisely instead)
    // center plinth + brass telescope
    batch.cyl(MAT.darkStone, 0.5, 0.62, 1.1, 8, T(wx, wy + 0.55, wz));
    batch.cyl(MAT.bronze, 0.09, 0.13, 1.3, 8, T(wx + 0.3, wy + 1.45, wz, 0, -0.9, -0.5));
    addCircle(wx, wz, 0.7);
    const beacons = [];
    interact.register({
      pos: new THREE.Vector3(wx, wy + 1.3, wz),
      radius: 1.9, maxDist: 3.4,
      label: () => 'Survey the moor',
      action: () => {
        for (const b of beacons) { group.remove(b.mesh); }
        beacons.length = 0;
        const left = ctx.questRef ? ctx.questRef.souls.filter(s => !s.collected && !s.hidden) : [];
        audio.chime(1);
        if (!left.length) {
          ui.toast(ctx.questRef && ctx.questRef.count >= 13 ? 'Nothing left to find. Only a bell left to ring.' : 'The moor keeps its last secrets sunken. (Try the well.)');
          return;
        }
        for (const s of left) {
          const m = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.9, 70, 10, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0x9fd4ff, transparent: true, opacity: 0.16,
              blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
            })
          );
          m.position.set(s.def.x, 36, s.def.z);
          group.add(m);
          beacons.push({ mesh: m, t: 12 });
        }
        ui.toast(`${left.length} stray light${left.length === 1 ? '' : 's'} answer the glass. Follow the pillars.`);
      }
    });
    updaters.push((dt) => {
      for (let i = beacons.length - 1; i >= 0; i--) {
        const b = beacons[i];
        b.t -= dt;
        b.mesh.material.opacity = 0.16 * clamp(b.t / 3, 0, 1);
        if (b.t <= 0) { group.remove(b.mesh); beacons.splice(i, 1); }
      }
    });
    placeRaven('r2', wx + Math.cos(0.6) * 4.2, wy + 2.3, wz + Math.sin(0.6) * 4.2);
  }

  // ======================= the stone circle =======================
  {
    const sx = WORLD.stoneCircle.x, sz = WORLD.stoneCircle.z;
    const sy = terrain.heightAt(sx, sz);
    const braziers = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      const px = sx + Math.cos(a) * 6.4, pz = sz + Math.sin(a) * 6.4;
      const py = terrain.heightAt(px, pz);
      batch.box(MAT.darkStone, 1.1, 3.2 + (i % 3) * 0.7, 0.8, T(px, py + 1.6, pz, -a, 0, (rng() - 0.5) * 0.12));
      addCircle(px, pz, 0.75);
      // brazier before each stone
      const bx = sx + Math.cos(a) * 4.4, bz = sz + Math.sin(a) * 4.4;
      const by = terrain.heightAt(bx, bz);
      batch.cyl(MAT.iron, 0.3, 0.18, 0.24, 8, T(bx, by + 0.62, bz));
      for (let leg = 0; leg < 3; leg++) {
        const la = (leg / 3) * TAU;
        batch.box(MAT.iron, 0.05, 0.66, 0.05, T(bx + Math.cos(la) * 0.16, by + 0.33, bz + Math.sin(la) * 0.16, 0, 0, Math.cos(la) * 0.35));
      }
      const pos = new THREE.Vector3(bx, by + 0.72, bz);
      const flameSrc = particles.torchFlame(() => pos);
      flameSrc.on = false;
      const spot = addLamp(bx, by + 1.1, bz, 0xff9440, 9, 12, 8);
      spot.on = false;
      const brazier = { lit: false, flameSrc, spot, pos };
      braziers.push(brazier);
      interact.register({
        pos: pos.clone(), radius: 1.3, maxDist: 3,
        label: () => brazier.lit ? null : 'Light the brazier',
        action: () => {
          brazier.lit = true;
          brazier.flameSrc.on = true;
          brazier.spot.on = true;
          audio.click();
          const lit = braziers.filter(b => b.lit).length;
          if (lit < 5) ui.toast(`The flame takes. ${5 - lit} braziers remain cold.`);
          else beginRite();
        }
      });
    }
    batch.cyl(MAT.darkStone, 1.5, 1.7, 0.5, 10, T(sx, sy + 0.25, sz));

    let stag = null, charm = null;
    const beginRite = () => {
      if (journal.getFlag('ritualDone') || stag) return;
      audio.stagDrone();
      ui.flash(0.4);
      // the spectral stag
      const g2 = new THREE.Group();
      const m = new THREE.MeshLambertMaterial({
        color: 0xeaf4f8, transparent: true, opacity: 0.5,
        emissive: 0x9fd4c8, emissiveIntensity: 0.7
      });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 8).rotateX(Math.PI / 2), m);
      body.position.y = 1.3;
      g2.add(body);
      const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 3, 6), m);
      neck.position.set(0, 1.7, 0.5);
      neck.rotation.x = 0.5;
      g2.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.34), m);
      head.position.set(0, 1.98, 0.72);
      g2.add(head);
      for (const side of [-1, 1]) {
        for (let seg = 0; seg < 3; seg++) {
          const ant = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.035), m);
          ant.position.set(side * (0.1 + seg * 0.07), 2.2 + seg * 0.16, 0.62 - seg * 0.05);
          ant.rotation.z = side * (0.4 + seg * 0.25);
          g2.add(ant);
        }
        for (const lz of [-0.45, 0.5]) {
          const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.85, 3, 5), m);
          leg.position.set(side * 0.18, 0.62, lz);
          g2.add(leg);
        }
      }
      scene.add(g2);
      stag = { g: g2, t: 0 };
      ctx.particles.ghostTrail(() => g2.position, () => stag ? 6 : 0);
    };

    updaters.push((dt, playerRef, time) => {
      if (stag) {
        stag.t += dt;
        const k = stag.t / 9;
        const a = -0.8 + k * (TAU * 0.9);
        const r = 14 - k * 6;
        stag.g.position.set(sx + Math.cos(a) * r, terrain.heightAt(sx + Math.cos(a) * r, sz + Math.sin(a) * r) + Math.abs(Math.sin(stag.t * 7)) * 0.25, sz + Math.sin(a) * r);
        stag.g.rotation.y = Math.atan2(Math.cos(a + 0.5) * r - Math.cos(a) * r, Math.sin(a + 0.5) * r - Math.sin(a) * r) + Math.PI;
        if (stag.t > 9) {
          scene.remove(stag.g);
          stag = null;
          // the antler charm
          charm = new THREE.Sprite(new THREE.SpriteMaterial({
            map: haloTexture(), color: 0xbfe8d8, transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false
          }));
          charm.position.set(sx, sy + 1.1, sz);
          charm.scale.setScalar(0.8);
          scene.add(charm);
          ui.toast('The stag leaves something shining on the altar stone.');
          interact.register({
            pos: new THREE.Vector3(sx, sy + 1.1, sz),
            radius: 1.5, maxDist: 3,
            label: () => charm ? 'Take the Antler Charm' : null,
            action: () => {
              scene.remove(charm);
              charm = null;
              journal.setFlag('ritualDone');
              journal.award('oldrites');
              player.jumpBoost = 1.35;
              audio.chime(0); audio.chime(2);
              ui.toast('The Antler Charm settles warm against your chest. Your legs feel younger. (+jump)');
            }
          });
        }
      }
    });
  }

  // ======================= the Bone Chapel =======================
  {
    const bx = WORLD.crypt.x, bz = WORLD.crypt.z;
    const by = terrain.heightAt(bx, bz);
    // faces east toward the cathedral rear yard
    batch.box(MAT.stone, 0.4, 3.2, 4.6, T(bx - 2.5, by + 1.6, bz));
    batch.box(MAT.stone, 5.4, 3.2, 0.4, T(bx, by + 1.6, bz - 2.3));
    batch.box(MAT.stone, 5.4, 3.2, 0.4, T(bx, by + 1.6, bz + 2.3));
    batch.box(MAT.stone, 0.4, 3.2, 1.5, T(bx + 2.5, by + 1.6, bz - 1.55));
    batch.box(MAT.stone, 0.4, 3.2, 1.5, T(bx + 2.5, by + 1.6, bz + 1.55));
    batch.box(MAT.stone, 0.4, 0.9, 1.7, T(bx + 2.5, by + 2.75, bz));
    const ped2 = new THREE.Shape();
    ped2.moveTo(-2.6, 0); ped2.lineTo(2.6, 0); ped2.lineTo(0, 1.5); ped2.lineTo(-2.6, 0);
    const pedGeo2 = new THREE.ExtrudeGeometry(ped2, { depth: 5.6, bevelEnabled: false });
    pedGeo2.rotateY(Math.PI / 2);
    batch.add(MAT.roof, pedGeo2, T(bx + 2.8, by + 3.2, bz));
    batch.add(MAT.darkStone, archFrameGeo(1.3, 2.5, 0.28, 0.4), T(bx + 2.55, by + 0.2, bz, Math.PI / 2));
    // skull niches inside (west wall)
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        batch.box(MAT.darkWood, 0.12, 0.34, 0.34, T(bx - 2.2, by + 0.9 + row * 0.75, bz - 1.5 + i * 0.6));
        batch.sphere(MAT.bone, 0.11, T(bx - 2.14, by + 0.92 + row * 0.75, bz - 1.5 + i * 0.6), 7, 6);
      }
    }
    // sarcophagus of the Old Bellringer
    batch.box(MAT.darkStone, 1.1, 0.7, 2.4, T(bx - 0.6, by + 0.35, bz));
    batch.box(MAT.stone, 1.2, 0.18, 2.5, T(bx - 0.6, by + 0.8, bz));
    batch.box(MAT.darkStone, 0.16, 0.1, 1.5, T(bx - 0.6, by + 0.94, bz));
    batch.box(MAT.darkStone, 0.55, 0.1, 0.16, T(bx - 0.6, by + 0.94, bz + 0.45));
    addCircle(bx - 0.6, bz, 1.0);
    // candles
    for (const [cx3, cz3] of [[bx + 0.9, bz - 1.6], [bx + 0.9, bz + 1.6], [bx - 1.6, bz + 1.8]]) {
      batch.cyl(MAT.bone, 0.05, 0.06, 0.3, 6, T(cx3, by + 0.15, cz3));
      const cp2 = new THREE.Vector3(cx3, by + 0.34, cz3);
      particles.candleFlame(() => cp2);
    }
    const cryptSpot = addLamp(bx, by + 1.6, bz, 0xffa050, 9, 9, 4);
    cryptSpot.on = false;

    // the iron door (east face)
    const doorHinge = new THREE.Group();
    doorHinge.position.set(bx + 2.52, by, bz - 0.62);
    const db = new GeoBatch();
    db.box(MAT.iron, 0.09, 2.4, 1.2, T(0, 1.2, 0.6));
    const [doorMesh] = db.flush(doorHinge);
    doorMesh.castShadow = true;
    group.add(doorHinge);
    const cryptSeg = addSeg(bx + 2.5, bz - 0.7, bx + 2.5, bz + 0.7, 0.28);
    addSeg(bx - 2.5, bz - 2.3, bx - 2.5, bz + 2.3, 0.35);
    addSeg(bx - 2.5, bz - 2.3, bx + 2.5, bz - 2.3, 0.35);
    addSeg(bx - 2.5, bz + 2.3, bx + 2.5, bz + 2.3, 0.35);
    addSeg(bx + 2.5, bz - 2.3, bx + 2.5, bz - 0.7, 0.35);
    addSeg(bx + 2.5, bz + 0.7, bx + 2.5, bz + 2.3, 0.35);
    const crypt = { open: false, t: 0 };
    interact.register({
      pos: new THREE.Vector3(bx + 2.8, by + 1.4, bz),
      radius: 1.7, maxDist: 3.2,
      label: () => crypt.open ? null
        : journal.getFlag('locket') ? 'Unlock the Bone Chapel with the Sexton’s Locket'
          : 'A heavy iron door. The keyhole is shaped like a locket.',
      action: () => {
        if (!journal.getFlag('locket')) {
          audio.knock();
          ui.toast('Locked. Somewhere in the graveyard, the Sexton kept the key close.');
          return;
        }
        crypt.open = true;
        cryptSpot.on = true;
        journal.setFlag('cryptOpen');
        journal.award('bones');
        audio.creak();
        audio.boneRattle();
        ui.toast('The locket turns. The bones inside exhale.');
      }
    });
    updaters.push((dt) => {
      const t = crypt.open ? 1 : 0;
      crypt.t += (t - crypt.t) * Math.min(1, dt * 2.2);
      doorHinge.rotation.y = -crypt.t * 1.85;
      cryptSeg.on = crypt.t < 0.4;
    });
    placeRaven('r6', bx - 0.6, by + 1.0, bz, 'Take the silver raven from the lid');
  }

  // ======================= remaining ravens =======================
  {
    const wy2 = terrain.heightAt(WORLD.well.x, WORLD.well.z);
    placeRaven('r3', WORLD.well.x - 0.5, wy2 + 3.45, WORLD.well.z, 'Take the silver raven from the well roof');
    const c = WORLD.cathedral;
    placeRaven('r4', c.x - 6.4, 4.6, c.z - 17.4, 'Take the silver raven from the organ');
    const gy = WORLD.graveyard;
    const gpy = terrain.heightAt(gy.x - gy.w / 2, gy.z - 1.6);
    placeRaven('r5', gy.x - gy.w / 2, gpy + 2.5, gy.z - 1.6, 'Take the silver raven from the gatepost');
  }

  batch.flush(group);

  return {
    update(dt, playerRef, time) {
      for (const u of updaters) u(dt, playerRef, time);
    }
  };
}
