// The graveyard: iron fence and gate, leaning tombstones with epitaphs,
// a mausoleum with a locked-away keepsake, and an angel that moves
// only when nobody is watching.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from './layout.js';
import { addCircle, addSeg, TAU, range, dampAngle } from './util.js';
import { MAT, T, GeoBatch, archFrameGeo } from './builders.js';

const EPITAPHS = [
  'HERE LIES EDMUND GREY · He asked the raven its name. It answered.',
  'AGNES MOOR, BELOVED · She still tends the garden. Look closer.',
  'IN MEMORY OF A CARTOGRAPHER · He is off every map now.',
  'BROTHER ALDRIC · Silence, at last.',
  'HERE SLEEPS WILLA THORNE · Do not wake her. Please.',
  'THE OLD BELLRINGER · He rang it thirteen times. We buried what we found.',
  'TOBIAS FINCH, LOCKSMITH · Every door opens eventually.',
  'SISTER MARGARETHE · Faith carried her. The river helped.',
  'AN UNKNOWN TRAVELER · The mist keeps his name.',
  'HAROLD & HIS HORSE · Parted by nothing, not even this.',
  'MOTHER HOLLOW · Her recipes died with her. Probably for the best.',
  'THE ASTRONOMER · Gone to count the stars from the far side.',
  'LITTLE PIP · The crows still bring him buttons.',
  'MASTER VANCE, PHYSICIAN · His cures were… permanent.',
  'GOODWIFE ORME · She heard the bell before it rang.'
];

const ANGEL_LINES = [
  'turn back',
  'the pale horse knows the way',
  'thirteen',
  'he is still ringing it',
  'we are so cold'
];

export function buildGraveyard(ctx) {
  const { scene, rng, terrain, interact, audio, ui, particles } = ctx;
  const gy = WORLD.graveyard;
  const x0 = gy.x - gy.w / 2, x1 = gy.x + gy.w / 2;
  const z0 = gy.z - gy.d / 2, z1 = gy.z + gy.d / 2;
  const batch = new GeoBatch();
  const group = new THREE.Group();
  scene.add(group);
  const perches = [];

  // ---- iron fence -----------------------------------------------------------
  const postGeo = mergeGeometries([
    new THREE.BoxGeometry(0.12, 1.5, 0.12).translate(0, 0.75, 0),
    new THREE.ConeGeometry(0.1, 0.26, 4).translate(0, 1.6, 0)
  ]);
  const posts = [];
  const fenceRail = (xa, za, xb, zb) => {
    const len = Math.hypot(xb - xa, zb - za);
    const yaw = Math.atan2(xb - xa, zb - za);
    const cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const y = terrain.heightAt(cx, cz);
    for (const ry of [0.5, 1.12]) {
      batch.box(MAT.iron, 0.07, 0.09, len, T(cx, y + ry, cz, yaw));
    }
    const n = Math.floor(len / 2.2);
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0.5 : i / n;
      const px = xa + (xb - xa) * t, pz = za + (zb - za) * t;
      posts.push({ x: px, z: pz });
    }
    addSeg(xa, za, xb, zb, 0.22);
  };
  const GATE_HALF = 1.6;
  fenceRail(x0, z0, x1, z0);
  fenceRail(x1, z0, x1, z1);
  fenceRail(x1, z1, x0, z1);
  fenceRail(x0, z1, x0, gy.z + GATE_HALF);
  fenceRail(x0, gy.z - GATE_HALF, x0, z0);

  const postMesh = new THREE.InstancedMesh(postGeo, MAT.iron, posts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  posts.forEach((p, i) => {
    q.setFromAxisAngle(up, rng() * TAU);
    m4.compose(new THREE.Vector3(p.x, terrain.heightAt(p.x, p.z), p.z), q, new THREE.Vector3(1, 1, 1));
    postMesh.setMatrixAt(i, m4);
    if (i % 6 === 0) perches.push(new THREE.Vector3(p.x, terrain.heightAt(p.x, p.z) + 1.66, p.z));
  });
  postMesh.castShadow = true;
  group.add(postMesh);

  // gate posts (heavier)
  for (const gz of [gy.z - GATE_HALF, gy.z + GATE_HALF]) {
    const y = terrain.heightAt(x0, gz);
    batch.box(MAT.darkStone, 0.5, 2.2, 0.5, T(x0, y + 1.1, gz));
    batch.sphere(MAT.darkStone, 0.3, T(x0, y + 2.35, gz));
  }

  // ---- the gate ---------------------------------------------------------------
  const gateY = terrain.heightAt(x0, gy.z);
  const makeGatePanel = (hingeZ, dir) => {
    const hinge = new THREE.Group();
    hinge.position.set(x0, gateY, hingeZ);
    const pb = new GeoBatch();
    const L = GATE_HALF - 0.05;
    pb.box(MAT.iron, 0.07, 0.09, L, T(0, 0.42, dir * L / 2));
    pb.box(MAT.iron, 0.07, 0.09, L, T(0, 1.35, dir * L / 2));
    for (let i = 1; i <= 3; i++) {
      const bz = dir * (i * L / 3.5);
      pb.box(MAT.iron, 0.05, 1.5, 0.05, T(0, 0.75, bz));
      pb.cone(MAT.iron, 0.07, 0.2, 4, T(0, 1.58, bz));
    }
    const [mesh] = pb.flush(hinge);
    mesh.castShadow = true;
    group.add(hinge);
    return hinge;
  };
  const gateA = makeGatePanel(gy.z - GATE_HALF, 1);
  const gateB = makeGatePanel(gy.z + GATE_HALF, -1);
  const gateSeg = addSeg(x0, gy.z - GATE_HALF, x0, gy.z + GATE_HALF, 0.2);
  const gate = { open: false, t: 0 };
  interact.register({
    pos: new THREE.Vector3(x0, gateY + 1.2, gy.z),
    radius: 2.2, maxDist: 3.8,
    label: () => gate.open ? 'Close the gate' : 'Open the gate',
    action: () => {
      gate.open = !gate.open;
      audio.creak();
      if (gate.open && !gate.warned) {
        gate.warned = true;
        ui.toast('The dead of Ravenmoor keep a quiet parish.');
      }
    }
  });

  // ---- tombstones ---------------------------------------------------------------
  const slabGeo = mergeGeometries([
    new THREE.BoxGeometry(0.85, 1.0, 0.16).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.425, 0.425, 0.16, 12, 1, false, 0, Math.PI)
      .rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.0, 0)
  ]);
  const crossGeo = mergeGeometries([
    new THREE.BoxGeometry(0.75, 0.35, 0.35).translate(0, 0.17, 0),
    new THREE.BoxGeometry(0.2, 1.5, 0.2).translate(0, 0.9, 0),
    new THREE.BoxGeometry(0.75, 0.2, 0.2).translate(0, 1.25, 0)
  ]);
  const obeliskGeo = mergeGeometries([
    new THREE.BoxGeometry(0.7, 0.4, 0.7).translate(0, 0.2, 0),
    new THREE.BoxGeometry(0.42, 1.5, 0.42).translate(0, 1.15, 0),
    new THREE.ConeGeometry(0.31, 0.42, 4).translate(0, 2.06, 0)
  ]);
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x646a73 });
  const types = [slabGeo, crossGeo, obeliskGeo];
  const stones = [];
  const cells = [];
  for (let gx = x0 + 4; gx < x1 - 3; gx += 4.6) {
    for (let gz = z0 + 3.5; gz < z1 - 3; gz += 4.2) {
      cells.push([gx, gz]);
    }
  }
  const col = new THREE.Color();
  const byType = [[], [], []];
  for (const [cx, cz] of cells) {
    if (rng() < 0.18) continue;
    const x = cx + range(rng, -1.2, 1.2), z = cz + range(rng, -1.1, 1.1);
    if (Math.hypot(x - WORLD.mausoleum.x, z - WORLD.mausoleum.z) < 5) continue;
    if (Math.hypot(x - WORLD.angel.x, z - WORLD.angel.z) < 3) continue;
    if (Math.abs(z - gy.z) < 1.8 && x < x0 + 12) continue;   // keep the gate lane clear
    let blocked = false;
    for (const t of WORLD.trees) if (Math.hypot(x - t.x, z - t.z) < 2) { blocked = true; break; }
    if (blocked) continue;
    const type = Math.floor(rng() * 3);
    stones.push({ x, z, type, epitaph: EPITAPHS[stones.length % EPITAPHS.length] });
    byType[type].push(stones[stones.length - 1]);
  }
  byType.forEach((list, ti) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(types[ti], stoneMat, list.length);
    list.forEach((s, i) => {
      const y = terrain.heightAt(s.x, s.z);
      const e = new THREE.Euler(range(rng, -0.09, 0.09), rng() * TAU, range(rng, -0.1, 0.1), 'YXZ');
      q.setFromEuler(e);
      const sc = range(rng, 0.85, 1.25);
      m4.compose(new THREE.Vector3(s.x, y - 0.06, s.z), q, new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(i, m4);
      col.setHSL(range(rng, 0.2, 0.35), range(rng, 0.03, 0.14), range(rng, 0.3, 0.45));
      mesh.setColorAt(i, col);
      addCircle(s.x, s.z, 0.34);
      if (ti !== 1 && rng() < 0.5) perches.push(new THREE.Vector3(s.x, y + (ti === 0 ? 1.1 : 2.1) * sc, s.z));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  });

  // one shared "read the epitaph" interaction that finds the nearest stone
  interact.register({
    pos: new THREE.Vector3(),
    radius: 1.6, maxDist: 2.9,
    dynamic: (playerPos, out) => {
      let best = null, bd = 2.9;
      for (const s of stones) {
        const d = Math.hypot(playerPos.x - s.x, playerPos.z - s.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return false;
      out.set(best.x, terrain.heightAt(best.x, best.z) + 1.0, best.z);
      interactStone = best;
      return true;
    },
    label: () => 'Read the epitaph',
    action: () => {
      if (!interactStone) return;
      const [name, rest] = splitEpitaph(interactStone.epitaph);
      ui.panel(name, rest);
      if (rng() < 0.18) audio.whisper();
      if (!interactStone.read) {
        interactStone.read = true;
        ctx.onEpitaph && ctx.onEpitaph();
      }
    }
  });
  let interactStone = null;
  const splitEpitaph = (t) => {
    const i = t.indexOf('·');
    return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : ['HERE LIES', t];
  };

  // ---- mausoleum -----------------------------------------------------------------
  const mx = WORLD.mausoleum.x, mz = WORLD.mausoleum.z;
  terrain.addPatch(mx - 3.2, mz - 2.7, mx + 3.2, mz + 2.7, 0.3);
  batch.box(MAT.darkStone, 6.4, 0.3, 5.4, T(mx, 0.15, mz));
  // walls (door faces west / -x)
  batch.box(MAT.stone, 0.35, 3.2, 1.35, T(mx - 2.3, 1.9, mz - 1.35));
  batch.box(MAT.stone, 0.35, 3.2, 1.35, T(mx - 2.3, 1.9, mz + 1.35));
  batch.box(MAT.stone, 0.35, 0.85, 1.3, T(mx - 2.3, 2.88, mz));
  batch.box(MAT.stone, 0.35, 3.2, 4.05, T(mx + 2.3, 1.9, mz));
  batch.box(MAT.stone, 4.95, 3.2, 0.35, T(mx, 1.9, mz - 1.85));
  batch.box(MAT.stone, 4.95, 3.2, 0.35, T(mx, 1.9, mz + 1.85));
  batch.box(MAT.darkStone, 5.3, 0.4, 4.6, T(mx, 3.55, mz));
  // pediment (triangle prism, ridge running east-west)
  const ped = new THREE.Shape();
  ped.moveTo(-2.4, 0); ped.lineTo(2.4, 0); ped.lineTo(0, 1.4); ped.lineTo(-2.4, 0);
  const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 5.3, bevelEnabled: false });
  pedGeo.rotateY(Math.PI / 2);
  batch.add(MAT.stone, pedGeo, T(mx - 2.65, 3.75, mz));
  // columns
  for (const cz of [-1.5, 1.5]) {
    batch.cyl(MAT.stone, 0.2, 0.24, 2.9, 8, T(mx - 2.8, 1.75, mz + cz));
  }
  batch.box(MAT.darkStone, 0.5, 0.4, 4.4, T(mx - 2.8, 3.4, mz));
  // colliders
  addSeg(mx - 2.3, mz - 1.85, mx - 2.3, mz - 0.68, 0.3);
  addSeg(mx - 2.3, mz + 0.68, mx - 2.3, mz + 1.85, 0.3);
  addSeg(mx + 2.3, mz - 1.85, mx + 2.3, mz + 1.85, 0.3);
  addSeg(mx - 2.3, mz - 1.85, mx + 2.3, mz - 1.85, 0.3);
  addSeg(mx - 2.3, mz + 1.85, mx + 2.3, mz + 1.85, 0.3);
  const mausDoorSeg = addSeg(mx - 2.3, mz - 0.68, mx - 2.3, mz + 0.68, 0.25);

  // iron door
  const doorHinge = new THREE.Group();
  doorHinge.position.set(mx - 2.32, 0.3, mz - 0.62);
  const doorBatch = new GeoBatch();
  doorBatch.box(MAT.iron, 0.09, 2.5, 1.2, T(0, 1.25, 0.62));
  doorBatch.box(MAT.darkStone, 0.06, 0.35, 0.35, T(-0.06, 1.35, 0.62));
  const [doorMesh] = doorBatch.flush(doorHinge);
  doorMesh.castShadow = true;
  group.add(doorHinge);
  const mdoor = { open: false, t: 0 };
  interact.register({
    pos: new THREE.Vector3(mx - 2.6, 1.5, mz),
    radius: 1.6, maxDist: 3.2,
    label: () => mdoor.open ? null : 'Open the mausoleum',
    action: () => {
      mdoor.open = true;
      audio.creak();
      ui.toast('Cold air spills out, thick with old prayers.');
    }
  });
  // cold interior light
  ctx.addLamp(mx + 0.5, 2.2, mz, 0x5f86b0, 5, 7, 0);

  // the chest
  const chest = new THREE.Group();
  chest.position.set(mx + 1.5, 0.3, mz);
  chest.rotation.y = -Math.PI / 2;
  const chestBase = new GeoBatch();
  chestBase.box(MAT.darkWood, 0.95, 0.45, 0.6, T(0, 0.225, 0));
  chestBase.box(MAT.iron, 0.99, 0.09, 0.64, T(0, 0.42, 0));
  chestBase.box(MAT.iron, 0.1, 0.5, 0.62, T(0, 0.25, 0));
  chestBase.flush(chest);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.46, -0.3);
  const lidBatch = new GeoBatch();
  lidBatch.box(MAT.darkWood, 0.95, 0.16, 0.6, T(0, 0.08, 0.3));
  lidBatch.box(MAT.iron, 0.99, 0.05, 0.2, T(0, 0.18, 0.3));
  lidBatch.flush(lidPivot);
  chest.add(lidPivot);
  group.add(chest);
  addCircle(mx + 1.5, mz, 0.55);
  const glowSpot = ctx.addLamp(mx + 1.2, 1.0, mz, 0xffc873, 7, 4.5, 2.5);
  glowSpot.on = false;
  const chestState = { open: false };
  interact.register({
    pos: new THREE.Vector3(mx + 1.5, 0.8, mz),
    radius: 1.3, maxDist: 2.6,
    label: () => chestState.open ? null : 'Open the chest',
    action: () => {
      chestState.open = true;
      audio.chestOpen();
      glowSpot.on = true;
      particles.burst(new THREE.Vector3(mx + 1.3, 1.1, mz), 0xffd280, 24, 1.2);
      ui.toast('You found the Sexton’s Locket. It is warm to the touch.');
      ctx.onLocket && ctx.onLocket();
    }
  });

  // ---- the weeping angel -------------------------------------------------------
  const ax = WORLD.angel.x, az = WORLD.angel.z;
  const angel = new THREE.Group();
  const ay = terrain.heightAt(ax, az);
  angel.position.set(ax, ay, az);
  const ab = new GeoBatch();
  ab.box(MAT.darkStone, 1.3, 1.1, 1.3, T(0, 0.55, 0));
  ab.cone(MAT.bone, 0.62, 2.3, 9, T(0, 2.2, 0));                       // robe
  ab.sphere(MAT.bone, 0.34, T(0, 3.35, 0.02));                          // shoulders
  ab.sphere(MAT.bone, 0.21, T(0, 3.72, 0.06));                          // head, bowed
  ab.box(MAT.bone, 0.1, 0.75, 0.5, T(-0.42, 3.15, -0.18, 0, 0.35, 0.5)); // wings
  ab.box(MAT.bone, 0.1, 0.75, 0.5, T(0.42, 3.15, -0.18, 0, -0.35, -0.5));
  ab.box(MAT.bone, 0.09, 0.6, 0.09, T(-0.2, 2.9, 0.28, 0, 0.9));        // praying arms
  ab.box(MAT.bone, 0.09, 0.6, 0.09, T(0.2, 2.9, 0.28, 0, -0.9));
  const angelMeshes = ab.flush(angel);
  angelMeshes.forEach(m => { m.castShadow = true; });
  group.add(angel);
  addCircle(ax, az, 0.85);
  let angelLine = 0;
  interact.register({
    pos: new THREE.Vector3(ax, ay + 2.2, az),
    radius: 1.8, maxDist: 3.4,
    label: () => 'Study the angel',
    action: () => {
      audio.whisper();
      ui.whisper(ANGEL_LINES[angelLine++ % ANGEL_LINES.length]);
      if (angelLine === 1) ui.toast('Its face was carved smiling. It is not smiling now.');
    }
  });

  batch.flush(group);

  // ---- updates ------------------------------------------------------------------
  const V = new THREE.Vector3();
  return {
    perches,
    update(dt, player, camera) {
      // gate swing
      const target = gate.open ? 1 : 0;
      gate.t += (target - gate.t) * Math.min(1, dt * 3);
      const e = gate.t;
      gateA.rotation.y = -e * 1.7;
      gateB.rotation.y = e * 1.7;
      gateSeg.on = gate.t < 0.4;
      // mausoleum door
      const mt = mdoor.open ? 1 : 0;
      mdoor.t += (mt - mdoor.t) * Math.min(1, dt * 2.4);
      doorHinge.rotation.y = mdoor.t * 1.9;
      mausDoorSeg.on = mdoor.t < 0.4;
      // chest lid
      const lt = chestState.open ? -1.65 : 0;
      lidPivot.rotation.x += (lt - lidPivot.rotation.x) * Math.min(1, dt * 4);
      // the angel only moves when unobserved
      V.set(ax - player.pos.x, 0, az - player.pos.z);
      const dist = V.length();
      if (dist < 26 && dist > 2.2) {
        camera.getWorldDirection(TMP);
        TMP.y = 0; TMP.normalize(); V.normalize();
        const looking = TMP.dot(V) > 0.25;
        if (!looking) {
          const desired = Math.atan2(player.pos.x - ax, player.pos.z - az);
          angel.rotation.y = dampAngle(angel.rotation.y, desired, 1.2, dt);
        }
      }
    }
  };
}

const TMP = new THREE.Vector3();
