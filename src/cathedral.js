// The Cathedral of Ravenmoor: towers, spires, buttresses, stained glass,
// a working great door, altar, organ, and the bell that ends the tale.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from './layout.js';
import { addCircle, addSeg, TAU } from './util.js';
import { MAT, T, GeoBatch, archShape, archFrameGeo, stainedGlassTexture, haloTexture, normalizeUVs } from './builders.js';

const CX = WORLD.cathedral.x, CZ = WORLD.cathedral.z;

export function buildCathedral(ctx) {
  const { scene, rng, terrain, interact, audio, particles, ui, addLamp } = ctx;
  const g = new THREE.Group();
  g.position.set(CX, 0, CZ);
  scene.add(g);
  const batch = new GeoBatch();

  // ---- floors & steps (terrain patches keep movers on top) ----------------
  terrain.addPatch(CX - 10.4, CZ - 19.5, CX + 10.4, CZ + 20.7, 0.45);
  terrain.addPatch(CX - 5.5, CZ + 20.7, CX + 5.5, CZ + 21.9, 0.22);
  batch.box(MAT.stone, 18.8, 0.45, 39.0, T(0, 0.225, 0));                // interior floor
  batch.box(MAT.stone, 11, 0.45, 1.6, T(0, 0.225, 20.4));                // porch
  batch.box(MAT.darkStone, 11, 0.22, 1.3, T(0, 0.11, 21.5));             // step

  // ---- nave walls ----------------------------------------------------------
  const WALL_H = 15;
  batch.box(MAT.stone, 7.8, WALL_H, 0.8, T(-6.1, WALL_H / 2, 19.6));      // front, left of portal
  batch.box(MAT.stone, 7.8, WALL_H, 0.8, T(6.1, WALL_H / 2, 19.6));       // front, right of portal
  batch.box(MAT.stone, 4.8, WALL_H - 8.3, 0.8, T(0, 8.3 + (WALL_H - 8.3) / 2, 19.6)); // above the portal
  batch.box(MAT.stone, 0.8, WALL_H, 40, T(-9.6, WALL_H / 2, 0));          // side walls
  batch.box(MAT.stone, 0.8, WALL_H, 40, T(9.6, WALL_H / 2, 0));
  batch.box(MAT.stone, 20, WALL_H, 0.8, T(0, WALL_H / 2, -19.6));         // back wall
  // plinth line
  batch.box(MAT.darkStone, 21, 1.1, 41.4, T(0, 0.55, 0));
  // cornice under the eaves
  batch.box(MAT.darkStone, 21.2, 0.6, 41, T(0, WALL_H - 0.1, 0));

  // ---- roof ---------------------------------------------------------------
  const roofAng = Math.atan2(9, 10);
  const slope = Math.hypot(10, 9) + 0.9;
  batch.box(MAT.roof, slope, 0.45, 41.6, T(-5, 19.5, 0, 0, 0, roofAng));
  batch.box(MAT.roof, slope, 0.45, 41.6, T(5, 19.5, 0, 0, 0, -roofAng));
  batch.box(MAT.darkStone, 0.5, 0.6, 41.8, T(0, 24.1, 0));                // ridge cap
  // gable triangles
  const tri = new THREE.Shape();
  tri.moveTo(-10, 0); tri.lineTo(10, 0); tri.lineTo(0, 9); tri.lineTo(-10, 0);
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.7, bevelEnabled: false });
  batch.add(MAT.stone, triGeo, T(0, WALL_H, 19.3));
  batch.add(MAT.stone, triGeo, T(0, WALL_H, -20.0));

  // ---- apse (east end) ----------------------------------------------------
  batch.cyl(MAT.stone, 6.5, 6.8, 12, 8, T(0, 6, -23));
  batch.cone(MAT.roof, 7.2, 5.5, 8, T(0, 14.7, -23));

  // ---- buttresses ----------------------------------------------------------
  for (const zi of [-16, -8, 0, 8, 16]) {
    for (const side of [-1, 1]) {
      batch.box(MAT.stone, 1.1, 10, 1.1, T(side * 10.9, 5, zi));
      batch.box(MAT.stone, 1.0, 4.6, 1.0, T(side * 10.5, 11.4, zi, 0, 0, side * 0.55));
      addCircle(CX + side * 10.9, CZ + zi, 0.9);
    }
  }

  // ---- towers + belfry + spires --------------------------------------------
  for (const side of [-1, 1]) {
    const tx = side * 13;
    batch.box(MAT.stone, 7, 22, 7, T(tx, 11, 17));
    batch.box(MAT.darkStone, 7.8, 1.2, 7.8, T(tx, 22.2, 17));             // belfry base band
    for (const cx of [-2.8, 2.8]) for (const cz of [-2.8, 2.8]) {
      batch.box(MAT.stone, 1.0, 5.4, 1.0, T(tx + cx, 25.5, 17 + cz));
    }
    batch.box(MAT.darkStone, 7.8, 0.9, 7.8, T(tx, 28.3, 17));             // lintel
    batch.cone(MAT.roof, 5.4, 11, 4, T(tx, 34.2, 17, Math.PI / 4));       // spire
    batch.sphere(MAT.bronze, 0.35, T(tx, 40.1, 17));                      // finial
    // slit windows (dark insets)
    for (const wy of [8, 14.5]) {
      batch.box(MAT.darkWood, 0.9, 2.6, 0.2, T(tx, wy, 20.55));
    }
    addCircle(CX + tx, CZ + 17, 5.2);
    // gargoyles on the two front lintel corners
    for (const cx of [-3.6, 3.6]) {
      const gg = new GeoBatch();
      gg.box(MAT.darkStone, 0.3, 0.32, 0.95, T(0, 0, 0.35));
      gg.box(MAT.darkStone, 0.26, 0.26, 0.3, T(0, 0.16, 0.9));
      gg.box(MAT.darkStone, 0.06, 0.5, 0.34, T(-0.2, 0.34, 0.3, 0, 0, 0.5));
      gg.box(MAT.darkStone, 0.06, 0.5, 0.34, T(0.2, 0.34, 0.3, 0, 0, -0.5));
      const [mesh] = gg.flush(g);
      mesh.position.set(tx + cx, 28.4, 20.9);
    }
  }

  // ---- stained glass windows -----------------------------------------------
  const glassTex = stainedGlassTexture(rng);
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, side: THREE.DoubleSide });
  glassMat.color.setScalar(1.3);   // HDR push through the tone mapper
  const lancetFrame = archFrameGeo(2.0, 5.6, 0.28, 0.5);
  const lancetGlass = normalizeUVs(new THREE.ShapeGeometry(archShape(2.0, 5.6), 8));
  for (const zi of [-14, -7, 0, 7, 14]) {
    for (const side of [-1, 1]) {
      batch.add(MAT.darkStone, lancetFrame, T(side * 10.05, 6.8, zi, side * Math.PI / 2));
      const glass = new THREE.Mesh(lancetGlass, glassMat);
      glass.position.set(side * 10.02, 7.08, zi);
      glass.rotation.y = side * Math.PI / 2;
      g.add(glass);
    }
  }
  // front lancets flanking the portal
  for (const side of [-1, 1]) {
    batch.add(MAT.darkStone, lancetFrame, T(side * 6.4, 8.2, 20.05));
    const glass = new THREE.Mesh(lancetGlass, glassMat);
    glass.position.set(side * 6.4, 8.48, 20.06);
    g.add(glass);
  }

  // ---- rose window ----------------------------------------------------------
  const roseTex = stainedGlassTexture(rng, true);
  const roseMat = new THREE.MeshBasicMaterial({ map: roseTex, side: THREE.DoubleSide });
  roseMat.color.setScalar(1.5);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(2.55, 28), roseMat);
  rose.position.set(0, 17.4, 20.06);
  g.add(rose);
  batch.add(MAT.darkStone, new THREE.TorusGeometry(2.7, 0.24, 8, 28), T(0, 17.4, 20.02));
  const roseHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), color: 0x7f95d9, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  roseHalo.position.set(0, 17.4, 20.6);
  roseHalo.scale.setScalar(10);
  g.add(roseHalo);

  // ---- portal: nested archivolts + the great door ---------------------------
  batch.add(MAT.darkStone, archFrameGeo(4.4, 7.4, 0.42, 0.7), T(0, 0.45, 19.75));
  batch.add(MAT.stone, archFrameGeo(5.5, 8.1, 0.4, 0.6), T(0, 0.45, 20.15));
  batch.add(MAT.darkStone, archFrameGeo(6.5, 8.8, 0.38, 0.5), T(0, 0.45, 20.5));
  // tympanum (filled arch above door height)
  const tympGeo = normalizeUVs(new THREE.ShapeGeometry(archShape(4.4, 7.4), 8));
  const tymp = new THREE.Mesh(tympGeo, MAT.darkWood);
  tymp.position.set(0, 0.5, 19.62);
  g.add(tymp);

  const doorMat = MAT.wood;
  const doors = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 2.2, 0.45, 19.7);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.14, 6.1, 0.18), doorMat);
    panel.position.set(-side * 1.07, 3.05, 0);
    panel.castShadow = true;
    hinge.add(panel);
    // iron straps + ring
    for (const sy of [1.4, 3.0, 4.6]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.06), MAT.iron);
      strap.position.set(-side * 1.07, sy, 0.12);
      hinge.add(strap);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), MAT.iron);
    ring.position.set(-side * 1.8, 3.1, 0.16);
    hinge.add(ring);
    g.add(hinge);
    doors.push(hinge);
  }
  const doorSeg = addSeg(CX - 2.2, CZ + 19.7, CX + 2.2, CZ + 19.7, 0.4);
  const door = { open: false, t: 0, busy: false };

  interact.register({
    pos: new THREE.Vector3(CX, 1.6, CZ + 20.6),
    radius: 2.6, maxDist: 4.5,
    label: () => door.busy ? null : (door.open ? 'Close the great door' : 'Open the great door'),
    action: () => {
      door.open = !door.open;
      door.busy = true;
      audio.creak();
      if (door.open) ui.toast('The hinges wail like something waking.');
    }
  });

  // ---- interior --------------------------------------------------------------
  for (let i = 0; i < 5; i++) {
    const zi = -14 + i * 7;
    for (const side of [-1, 1]) {
      batch.cyl(MAT.stone, 0.5, 0.6, 14.6, 10, T(side * 5.6, 7.3 + 0.45, zi));
      batch.box(MAT.darkStone, 1.4, 0.5, 1.4, T(side * 5.6, 14.4, zi));
      addCircle(CX + side * 5.6, CZ + zi, 0.75);
    }
  }
  // pews
  for (let i = 0; i < 4; i++) {
    const zi = 2 + i * 3.4;
    for (const side of [-1, 1]) {
      batch.box(MAT.darkWood, 5.4, 0.12, 0.5, T(side * 4.2, 1.05, zi));
      batch.box(MAT.darkWood, 5.4, 0.7, 0.1, T(side * 4.2, 1.0, zi + 0.3));
      batch.box(MAT.darkWood, 0.14, 0.55, 0.5, T(side * 1.7, 0.72, zi));
      batch.box(MAT.darkWood, 0.14, 0.55, 0.5, T(side * 6.7, 0.72, zi));
      addSeg(CX + side * 1.7, CZ + zi, CX + side * 6.7, CZ + zi, 0.45);
    }
  }
  // altar
  batch.box(MAT.darkStone, 6.4, 0.5, 4.2, T(0, 0.7, -14.5));
  batch.box(MAT.stone, 2.6, 1.15, 1.3, T(0, 1.5, -14.5));
  batch.box(MAT.darkWood, 2.8, 0.08, 1.5, T(0, 2.1, -14.5));
  addCircle(CX, CZ - 14.5, 1.7);
  // candelabrum: five candles
  const candlePts = [];
  for (let i = 0; i < 5; i++) {
    const cx = -0.9 + i * 0.45;
    batch.cyl(MAT.bone, 0.05, 0.05, 0.4 + (i % 2) * 0.12, 6, T(cx, 2.35, -14.4));
    candlePts.push(new THREE.Vector3(CX + cx, 2.62 + (i % 2) * 0.12, CZ - 14.4));
  }
  particles.candleFlame(() => candlePts[Math.floor(Math.random() * candlePts.length)]);
  // visible flame beads on the candles
  const beadGeos = candlePts.map(p => new THREE.SphereGeometry(0.035, 6, 5)
    .translate(p.x - CX, p.y + 0.03, p.z - CZ));
  const beadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  beadMat.color.setRGB(2.2, 1.4, 0.6);
  const beads = new THREE.Mesh(mergeGeometries(beadGeos), beadMat);
  g.add(beads);
  addLamp(CX, 3.4, CZ - 13.8, 0xffa050, 42, 34, 3.1);   // altar candles
  addLamp(CX, 9, CZ - 2, 0x6a80a8, 14, 36, 0);          // cold nave spill
  addLamp(CX - 8.4, 4.2, CZ - 4, 0xff9440, 14, 18, 7);  // aisle sconces
  addLamp(CX + 8.4, 4.2, CZ + 6, 0xff9440, 14, 18, 8);

  interact.register({
    pos: new THREE.Vector3(CX, 2, CZ - 13.4),
    radius: 2.2, maxDist: 3.4,
    label: () => 'Light a prayer candle',
    action: () => {
      audio.click();
      particles.burst(new THREE.Vector3(CX, 2.8, CZ - 14.2), 0xffc070, 8, 0.7);
      ui.toast(ctx.candlePrayer ? ctx.candlePrayer() : 'A small light against a great dark.');
    }
  });

  // pale moonlight shafts through the clerestory
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0x7690b8, transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  for (const [sx2, sz2, ry] of [[-4.2, -7, 0.5], [4.5, 2, -0.55], [-3.8, 10, 0.42]]) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 11.5), shaftMat);
    shaft.position.set(sx2, 6.6, sz2);
    shaft.rotation.set(0, ry, sx2 > 0 ? -0.6 : 0.6);
    g.add(shaft);
  }

  // organ (back corner)
  const organBatch = new GeoBatch();
  organBatch.box(MAT.darkWood, 3.4, 2.4, 1.2, T(0, 1.65, 0));
  for (let i = 0; i < 9; i++) {
    const h = 1.6 + Math.abs(4 - i) * -0.12 + 2.6;
    organBatch.cyl(MAT.bronze, 0.13, 0.13, h, 8, T(-1.4 + i * 0.35, 2.8 + h / 2 - 1.3, 0));
  }
  const [organMesh] = organBatch.flush(g);
  organMesh.position.set(-6.8, 0.45, -17.6);
  addCircle(CX - 6.8, CZ - 17.6, 1.6);
  let organOn = false;
  interact.register({
    pos: new THREE.Vector3(CX - 6.4, 1.6, CZ - 16.6),
    radius: 2.0, maxDist: 3.2,
    label: () => organOn ? 'Still the organ' : 'Play the organ',
    action: () => {
      organOn = !organOn;
      audio.organ(organOn);
      ui.toast(organOn ? 'The organ exhales a mournful chord.' : 'The last note refuses to leave.');
    }
  });

  // ---- torches flanking the portal -------------------------------------------
  const torches = [];
  for (const side of [-1, 1]) {
    const pos = new THREE.Vector3(CX + side * 3.55, 3.3, CZ + 20.55);
    batch.box(MAT.iron, 0.12, 0.5, 0.12, T(side * 3.55, 3.1, 20.45, 0, -0.5, 0));
    batch.cyl(MAT.iron, 0.16, 0.09, 0.3, 6, T(side * 3.55, 3.32, 20.55));
    const spot = addLamp(CX + side * 3.55, 3.75, CZ + 20.8, 0xff9440, 16, 21, 9);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xff9040, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.position.set(side * 3.55, 3.6, 20.75);
    halo.scale.setScalar(2.6);
    g.add(halo);
    const src = particles.torchFlame(() => pos);
    const torch = { lit: true, spot, src, halo };
    torches.push(torch);
    interact.register({
      pos: pos.clone(), radius: 1.4, maxDist: 3.4,
      label: () => torch.lit ? 'Snuff the torch' : 'Light the torch',
      action: () => {
        torch.lit = !torch.lit;
        torch.spot.on = torch.lit;
        torch.src.on = torch.lit;
        torch.halo.visible = torch.lit;
        audio.click();
      }
    });
  }

  // ---- the bell -----------------------------------------------------------
  const bellProfile = [];
  const prof = [[0.06, 1.25], [0.3, 1.2], [0.42, 1.0], [0.48, 0.72], [0.5, 0.45], [0.56, 0.2], [0.74, 0.05], [0.76, 0], [0.62, -0.02], [0.45, 0.04]];
  for (const [x, y] of prof) bellProfile.push(new THREE.Vector2(x, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellProfile, 14), MAT.bronze);
  const bellPivot = new THREE.Group();
  bellPivot.position.set(13, 26.6, 17);
  bell.position.y = -1.5;
  bellPivot.add(bell);
  g.add(bellPivot);

  // rope alcove on the tower face
  batch.add(MAT.darkStone, archFrameGeo(1.5, 2.9, 0.3, 0.4), T(13, 0.45, 20.6));
  const inset = normalizeUVs(new THREE.ShapeGeometry(archShape(1.5, 2.9), 8));
  const insetMesh = new THREE.Mesh(inset, new THREE.MeshBasicMaterial({ color: 0x07080c }));
  insetMesh.position.set(13, 0.75, 20.52);
  g.add(insetMesh);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 5), new THREE.MeshLambertMaterial({ color: 0x8a7a58 }));
  rope.position.set(13, 2.3, 20.75);
  g.add(rope);
  const ropeKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 6), MAT.darkWood);
  ropeKnob.position.set(13, 1.28, 20.75);
  g.add(ropeKnob);

  const bellState = { energy: 0, cooldown: 0 };
  const api = {
    onRing: null,
    ringBell() {
      if (bellState.cooldown > 0) return;
      bellState.energy = 1;
      bellState.cooldown = 5;
      audio.bell();
      if (api.onRing) api.onRing();
    }
  };
  interact.register({
    pos: new THREE.Vector3(CX + 13, 1.6, CZ + 20.9),
    radius: 1.8, maxDist: 3.6,
    label: () => bellState.cooldown > 0 ? null : 'Ring the bell of Ravenmoor',
    action: () => api.ringBell()
  });

  // wall segment colliders (world coords)
  addSeg(CX - 10, CZ + 19.6, CX - 2.2, CZ + 19.6, 0.55);
  addSeg(CX + 2.2, CZ + 19.6, CX + 10, CZ + 19.6, 0.55);
  addSeg(CX - 9.6, CZ - 20, CX - 9.6, CZ + 20, 0.55);
  addSeg(CX + 9.6, CZ - 20, CX + 9.6, CZ + 20, 0.55);
  addSeg(CX - 10, CZ - 19.6, CX + 10, CZ - 19.6, 0.55);
  addCircle(CX, CZ - 23, 7.2);

  batch.flush(g);

  // ---- per-frame updates ----------------------------------------------------
  // NOTE: return the api object itself (not a spread) so `cathedral.onRing = fn`
  // is seen by the ringBell closure.
  api.doorState = door;
  api.update = function update(dt, time) {
      // door swing
      const target = door.open ? 1 : 0;
      if (Math.abs(door.t - target) > 0.001) {
        door.t += Math.sign(target - door.t) * dt / 1.15;
        door.t = Math.max(0, Math.min(1, door.t));
        const e = door.t * door.t * (3 - 2 * door.t);
        doors[0].rotation.y = e * 1.92;
        doors[1].rotation.y = -e * 1.92;
        if (door.t === target) door.busy = false;
      }
      doorSeg.on = door.t < 0.45;
      // bell swing
      if (bellState.cooldown > 0) bellState.cooldown -= dt;
      if (bellState.energy > 0.01) {
        bellState.energy *= Math.exp(-dt * 0.55);
        bellPivot.rotation.z = Math.sin(time * 5.2) * bellState.energy * 0.55;
      } else {
        bellPivot.rotation.z *= Math.exp(-dt * 2);
      }
  };
  return api;
}
