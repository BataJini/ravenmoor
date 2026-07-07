// Village dressing: cottages, the wishing well, lampposts, the stable and
// paddock, the parish notice board, benches, and barrels. All interactive.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { addCircle, addSeg, range, TAU } from './util.js';
import { MAT, T, GeoBatch, haloTexture, cottageWindowTexture } from './builders.js';

const KNOCKS = [
  'Bolted from within. Someone breathes just behind the wood.',
  'A lullaby stops mid-verse. You did not hear the rest begin again.',
  'No answer — but the candle in the window leans toward you.',
  'A voice, very old: “Not tonight. Not while the bell is silent.”'
];

const BARREL_LINES = [
  'Empty. Someone got here first.',
  'Rainwater, a drowned moth, and your own face looking back.',
  'It smells of apples and regret.'
];

export function buildProps(ctx) {
  const { scene, rng, terrain, interact, audio, ui, particles, addLamp } = ctx;
  const batch = new GeoBatch();
  const group = new THREE.Group();
  scene.add(group);
  const rot2 = (px, pz, r) => [px * Math.cos(r) + pz * Math.sin(r), -px * Math.sin(r) + pz * Math.cos(r)];

  // ---- cottages -------------------------------------------------------------
  const winTex = cottageWindowTexture();
  const winMat = new THREE.MeshBasicMaterial({ map: winTex });
  winMat.color.setScalar(1.35);
  WORLD.houses.forEach((h, hi) => {
    const y = terrain.heightAt(h.x, h.z);
    const W = 7, D = 5.5, WH = 3.4;
    const place = (px, py, pz) => {
      const [rx, rz] = rot2(px, pz, h.rot);
      return T(h.x + rx, y + py, h.z + rz, h.rot);
    };
    batch.box(MAT.stone, W, WH, D, place(0, WH / 2, 0));
    batch.box(MAT.darkStone, W + 0.4, 0.5, D + 0.4, place(0, 0.25, 0));
    // gable roof (ridge along x)
    const ang = Math.atan2(2.3, D / 2);
    const slope = Math.hypot(D / 2, 2.3) + 0.5;
    batch.box(MAT.roof, W + 0.9, 0.3, slope, place(0, WH + 1.15, -D / 4).multiply(new THREE.Matrix4().makeRotationX(-ang)));
    batch.box(MAT.roof, W + 0.9, 0.3, slope, place(0, WH + 1.15, D / 4).multiply(new THREE.Matrix4().makeRotationX(ang)));
    // gable ends: the ridge runs along local X, so the triangles close the ±X faces
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, 2.3); tri.lineTo(-D / 2, 0);
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false });
    triGeo.rotateY(Math.PI / 2);
    batch.add(MAT.wood, triGeo, place(W / 2 - 0.4, WH, 0));
    batch.add(MAT.wood, triGeo, place(-W / 2, WH, 0));
    // chimney
    batch.box(MAT.darkStone, 0.8, 2.6, 0.8, place(W / 2 - 1.2, WH + 1.4, 0));
    const [chx, chz] = rot2(W / 2 - 1.2, 0, h.rot);
    if (hi % 2 === 0) {
      const cp = new THREE.Vector3(h.x + chx, y + WH + 2.8, h.z + chz);
      particles.chimneySmoke(() => cp);
    }
    // door (front = +z local)
    batch.box(MAT.darkWood, 1.1, 2.2, 0.14, place(0, 1.1, D / 2 + 0.06));
    batch.box(MAT.darkStone, 1.5, 0.22, 0.3, place(0, 2.32, D / 2 + 0.08));
    // windows: two front, one gable
    for (const wx of [-2.2, 2.2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.0), winMat);
      const [rx, rz] = rot2(wx, D / 2 + 0.09, h.rot);
      win.position.set(h.x + rx, y + 1.75, h.z + rz);
      win.rotation.y = h.rot;
      group.add(win);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture(), color: 0xd08a3e, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.position.set(h.x + rx, y + 1.8, h.z + rz);
      halo.scale.setScalar(2.4);
      group.add(halo);
      batch.box(MAT.darkWood, 1.05, 1.2, 0.08, place(wx, 1.75, D / 2 + 0.04));
    }
    // colliders: rotated rectangle as 4 segs
    const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    const wc = corners.map(([px, pz]) => {
      const [rx, rz] = rot2(px, pz, h.rot);
      return [h.x + rx, h.z + rz];
    });
    for (let i = 0; i < 4; i++) {
      const [ax, az] = wc[i], [bx, bz] = wc[(i + 1) % 4];
      addSeg(ax, az, bx, bz, 0.35);
    }
    // knock interaction at the door
    const [dx, dz] = rot2(0, D / 2 + 0.6, h.rot);
    interact.register({
      pos: new THREE.Vector3(h.x + dx, y + 1.3, h.z + dz),
      radius: 1.4, maxDist: 3.0,
      label: () => 'Knock',
      action: () => {
        audio.knock();
        setTimeout(() => ui.toast(KNOCKS[hi % KNOCKS.length]), 800);
      }
    });
  });

  // ---- the wishing well -------------------------------------------------------
  const wx = WORLD.well.x, wz = WORLD.well.z;
  const wy = terrain.heightAt(wx, wz);
  batch.cyl(MAT.stone, 1.15, 1.25, 1.0, 12, T(wx, wy + 0.5, wz));
  batch.add(MAT.darkStone, new THREE.TorusGeometry(1.13, 0.14, 8, 14), T(wx, wy + 1.05, wz, 0, Math.PI / 2));
  batch.cyl(MAT.darkStone, 0.9, 0.9, 0.1, 12, T(wx, wy + 0.32, wz));   // dark water hint
  for (const side of [-1, 1]) {
    batch.box(MAT.wood, 0.16, 2.2, 0.16, T(wx + side * 1.05, wy + 1.9, wz));
  }
  batch.box(MAT.wood, 2.6, 0.14, 0.9, T(wx, wy + 3.0, wz, 0, 0, 0.0));
  batch.box(MAT.roof, 1.6, 0.1, 1.3, T(wx - 0.62, wy + 3.28, wz, 0, 0, 0.5));
  batch.box(MAT.roof, 1.6, 0.1, 1.3, T(wx + 0.62, wy + 3.28, wz, 0, 0, -0.5));
  batch.cyl(MAT.wood, 0.07, 0.07, 1.9, 6, T(wx, wy + 2.0, wz, 0, 0, Math.PI / 2));
  batch.cyl(MAT.darkWood, 0.16, 0.19, 0.3, 8, T(wx, wy + 1.45, wz));   // bucket
  batch.box(MAT.bone, 0.02, 0.55, 0.02, T(wx, wy + 1.75, wz));         // rope
  addCircle(wx, wz, 1.35);
  let coins = 0;
  const WISHES = [
    'You cast a coin. The water swallows it greedily.',
    'Something far below says thank you.',
    'A wish is a debt. It has been recorded.',
    'The splash echoes longer than the well is deep.'
  ];
  interact.register({
    pos: new THREE.Vector3(wx, wy + 1.2, wz),
    radius: 1.8, maxDist: 3.2,
    label: () => 'Drop a coin in the well',
    action: () => {
      audio.coin();
      ui.toast(WISHES[coins % WISHES.length]);
      coins++;
      if (coins === 1 && ctx.onCoin) setTimeout(() => ctx.onCoin(), 1600);
    }
  });

  // ---- lampposts ---------------------------------------------------------------
  const paneOn = (mat) => mat.color.setRGB(1.9, 1.25, 0.62);
  const paneOff = (mat) => mat.color.setRGB(0.07, 0.05, 0.04);
  const lampHeadMat = () => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    paneOn(m);
    return m;
  };
  WORLD.lamps.forEach((L) => {
    const ly = terrain.heightAt(L.x, L.z);
    batch.cyl(MAT.iron, 0.06, 0.1, 3.4, 7, T(L.x, ly + 1.7, L.z));
    batch.box(MAT.iron, 0.5, 0.05, 0.05, T(L.x + 0.2, ly + 3.36, L.z));
    // open lantern housing: caps + corner posts, glass visible between
    batch.box(MAT.iron, 0.32, 0.04, 0.32, T(L.x + 0.42, ly + 2.92, L.z));
    for (const cx of [-0.13, 0.13]) for (const cz of [-0.13, 0.13]) {
      batch.box(MAT.iron, 0.035, 0.34, 0.035, T(L.x + 0.42 + cx, ly + 3.1, L.z + cz));
    }
    batch.cone(MAT.iron, 0.28, 0.2, 4, T(L.x + 0.42, ly + 3.38, L.z, Math.PI / 4));
    const paneMat = lampHeadMat();
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), paneMat);
    pane.position.set(L.x + 0.42, ly + 3.08, L.z);
    group.add(pane);
    const spot = addLamp(L.x + 0.42, ly + 3.05, L.z, 0xffb163, 8, 13, 6);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xffa050, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.position.set(L.x + 0.42, ly + 3.05, L.z);
    halo.scale.setScalar(2.8);
    group.add(halo);
    const state = { lit: true };
    addCircle(L.x, L.z, 0.2);
    interact.register({
      pos: new THREE.Vector3(L.x + 0.42, ly + 2.6, L.z),
      radius: 1.2, maxDist: 3.0,
      label: () => state.lit ? 'Snuff the lantern' : 'Light the lantern',
      action: () => {
        state.lit = !state.lit;
        spot.on = state.lit;
        halo.visible = state.lit;
        (state.lit ? paneOn : paneOff)(paneMat);
        audio.click();
      }
    });
  });

  // ---- stable ---------------------------------------------------------------------
  const sx = WORLD.stable.x, sz = WORLD.stable.z;
  const sy = terrain.heightAt(sx, sz);
  // posts (opening faces east toward the path)
  const postXs = [sx - 3, sx + 3];
  for (const px of postXs) {
    for (const pz of [sz - 4.5, sz, sz + 4.5]) {
      batch.box(MAT.wood, 0.26, 3.1, 0.26, T(px, sy + 1.55, pz));
      addCircle(px, pz, 0.25);
    }
  }
  // back wall (west) + half walls north/south
  batch.box(MAT.wood, 0.18, 2.6, 9.6, T(sx - 3, sy + 1.3, sz));
  addSeg(sx - 3, sz - 4.8, sx - 3, sz + 4.8, 0.3);
  batch.box(MAT.wood, 6.2, 1.3, 0.18, T(sx, sy + 0.65, sz - 4.6));
  batch.box(MAT.wood, 6.2, 1.3, 0.18, T(sx, sy + 0.65, sz + 4.6));
  addSeg(sx - 3, sz - 4.6, sx + 3, sz - 4.6, 0.25);
  addSeg(sx - 3, sz + 4.6, sx + 3, sz + 4.6, 0.25);
  // roof
  const rAng = Math.atan2(1.6, 3.4);
  batch.box(MAT.roof, Math.hypot(3.4, 1.6) + 0.6, 0.22, 10.4, T(sx - 1.7, sy + 3.9, sz, 0, 0, rAng));
  batch.box(MAT.roof, Math.hypot(3.4, 1.6) + 0.6, 0.22, 10.4, T(sx + 1.7, sy + 3.9, sz, 0, 0, -rAng));
  // hay
  batch.box(MAT.hay, 1.4, 0.8, 1.0, T(sx - 1.9, sy + 0.4, sz - 3.2, 0.3));
  batch.box(MAT.hay, 1.2, 0.7, 0.9, T(sx - 1.8, sy + 0.35, sz + 3.4, -0.2));
  batch.box(MAT.hay, 1.2, 0.7, 0.9, T(sx - 1.7, sy + 1.05, sz + 3.1, 0.5));
  interact.register({
    pos: new THREE.Vector3(sx - 1.8, sy + 1, sz + 3.2),
    radius: 1.4, maxDist: 2.8,
    label: () => 'Search the hay',
    action: () => {
      audio.click();
      ui.toast('A mouse regards you with enormous disapproval.');
    }
  });
  // hanging lantern
  batch.box(MAT.iron, 0.03, 0.5, 0.03, T(sx, sy + 3.15, sz));
  const lantMat = lampHeadMat();
  const lant = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lantMat);
  lant.position.set(sx, sy + 2.8, sz);
  group.add(lant);
  const lantSpot = addLamp(sx, sy + 2.7, sz, 0xffa050, 7, 11, 7);
  const lantState = { lit: true };
  interact.register({
    pos: new THREE.Vector3(sx, sy + 2.4, sz),
    radius: 1.3, maxDist: 3.0,
    label: () => lantState.lit ? 'Snuff the stable lantern' : 'Light the stable lantern',
    action: () => {
      lantState.lit = !lantState.lit;
      lantSpot.on = lantState.lit;
      (lantState.lit ? paneOn : paneOff)(lantMat);
      audio.click();
    }
  });

  // ---- paddock fence ------------------------------------------------------------
  const pd = WORLD.paddock;
  const px0 = pd.x - pd.w / 2, px1 = pd.x + pd.w / 2;
  const pz0 = pd.z - pd.d / 2, pz1 = pd.z + pd.d / 2;
  const GHW = 1.5;   // gate half width, gate on south side at pd.x
  const rail = (xa, za, xb, zb) => {
    const len = Math.hypot(xb - xa, zb - za);
    const yaw = Math.atan2(xb - xa, zb - za);
    const cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const cy = terrain.heightAt(cx, cz);
    for (const ry of [0.55, 1.1]) batch.box(MAT.wood, 0.09, 0.13, len, T(cx, cy + ry, cz, yaw));
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const fx = xa + (xb - xa) * t, fz = za + (zb - za) * t;
      batch.box(MAT.wood, 0.16, 1.4, 0.16, T(fx, terrain.heightAt(fx, fz) + 0.7, fz));
    }
    addSeg(xa, za, xb, zb, 0.2);
  };
  rail(px0, pz0, pd.x - GHW, pz0);
  rail(pd.x + GHW, pz0, px1, pz0);
  rail(px1, pz0, px1, pz1);
  rail(px1, pz1, px0, pz1);
  rail(px0, pz1, px0, pz0);
  // paddock gate
  const gateHinge = new THREE.Group();
  const gy = terrain.heightAt(pd.x - GHW, pz0);
  gateHinge.position.set(pd.x - GHW, gy, pz0);
  const gb = new GeoBatch();
  gb.box(MAT.wood, 2.9, 0.12, 0.08, T(GHW - 0.05, 0.55, 0));
  gb.box(MAT.wood, 2.9, 0.12, 0.08, T(GHW - 0.05, 1.05, 0));
  gb.box(MAT.wood, 3.0, 0.1, 0.07, T(GHW - 0.05, 0.8, 0, 0, 0, 0.17));
  for (let i = 0; i <= 3; i++) gb.box(MAT.wood, 0.12, 1.15, 0.1, T(i * 0.95, 0.78, 0));
  const [gateMesh] = gb.flush(gateHinge);
  gateMesh.castShadow = true;
  group.add(gateHinge);
  const pgateSeg = addSeg(pd.x - GHW, pz0, pd.x + GHW, pz0, 0.18);
  const pgate = { open: false, t: 0 };
  interact.register({
    pos: new THREE.Vector3(pd.x, gy + 0.9, pz0),
    radius: 2.0, maxDist: 3.4,
    label: () => pgate.open ? 'Close the paddock gate' : 'Open the paddock gate',
    action: () => { pgate.open = !pgate.open; audio.creak(); }
  });

  // ---- notice board ---------------------------------------------------------------
  const bx = WORLD.board.x, bz = WORLD.board.z;
  const by = terrain.heightAt(bx, bz);
  const bRot = 0.38;   // angled toward the spawn plaza, catching the moon
  for (const side of [-0.9, 0.9]) {
    batch.box(MAT.wood, 0.14, 2.3, 0.14, T(bx + side * Math.cos(bRot), by + 1.15, bz - side * Math.sin(bRot), bRot));
  }
  batch.box(MAT.darkWood, 2.3, 1.3, 0.1, T(bx, by + 1.7, bz, bRot));
  batch.box(MAT.roof, 2.6, 0.08, 0.5, T(bx, by + 2.45, bz, bRot, 0.12));
  const bOff = (dx, dz) => [bx + dx * Math.cos(bRot) + dz * Math.sin(bRot), bz - dx * Math.sin(bRot) + dz * Math.cos(bRot)];
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.82),
    new THREE.MeshLambertMaterial({ color: 0xb0a583 })
  );
  const [p1x, p1z] = bOff(-0.35, 0.07);
  paper.position.set(p1x, by + 1.72, p1z);
  paper.rotation.y = bRot;
  paper.rotation.z = 0.04;
  group.add(paper);
  const paper2 = paper.clone();
  const [p2x, p2z] = bOff(0.4, 0.07);
  paper2.position.set(p2x, by + 1.66, p2z);
  paper2.rotation.z = -0.07;
  paper2.scale.setScalar(0.8);
  group.add(paper2);
  addCircle(bx, bz, 0.35);
  interact.register({
    pos: new THREE.Vector3(bx, by + 1.6, bz),
    radius: 1.8, maxDist: 3.4,
    label: () => 'Read the parish notice',
    action: () => {
      ui.panel('PARISH NOTICE', ctx.noticeText ? ctx.noticeText() :
        'The bell of Ravenmoor has fallen silent. Thirteen souls wander the parish, unable to rest. Gather them, and let the bell call them home. — Father Ossian');
    }
  });

  // ---- benches & barrels ------------------------------------------------------------
  const bench = (bxx, bzz, ry) => {
    const yy = terrain.heightAt(bxx, bzz);
    batch.box(MAT.wood, 1.9, 0.09, 0.5, T(bxx, yy + 0.5, bzz, ry));
    batch.box(MAT.wood, 1.9, 0.5, 0.08, T(bxx - Math.sin(ry) * 0.26, yy + 0.85, bzz - Math.cos(ry) * 0.26, ry));
    for (const side of [-0.8, 0.8]) {
      const lx = bxx + Math.cos(ry) * side, lz = bzz - Math.sin(ry) * side;
      batch.box(MAT.darkWood, 0.12, 0.5, 0.45, T(lx, yy + 0.25, lz, ry));
    }
    addCircle(bxx, bzz, 0.75);
    interact.register({
      pos: new THREE.Vector3(bxx, yy + 0.8, bzz),
      radius: 1.3, maxDist: 2.6,
      label: () => 'Rest a moment',
      action: () => ui.toast('The wood is cold. Someone carved “M + E” here, long ago.')
    });
  };
  bench(-4.2, 44.5, 0.5);
  bench(8.5, -38.5, -2.6);

  let barrelLine = 0;
  const barrels = [[sx + 2.4, sz + 4.1], [sx + 2.7, sz + 3.2], [25.2, 33.4]];
  for (const [bxx, bzz] of barrels) {
    const yy = terrain.heightAt(bxx, bzz);
    batch.cyl(MAT.darkWood, 0.34, 0.3, 0.85, 10, T(bxx, yy + 0.42, bzz));
    batch.add(MAT.iron, new THREE.TorusGeometry(0.33, 0.03, 5, 12), T(bxx, yy + 0.65, bzz, 0, Math.PI / 2));
    batch.add(MAT.iron, new THREE.TorusGeometry(0.35, 0.03, 5, 12), T(bxx, yy + 0.25, bzz, 0, Math.PI / 2));
    addCircle(bxx, bzz, 0.4);
  }
  interact.register({
    pos: new THREE.Vector3(sx + 2.55, terrain.heightAt(sx + 2.5, sz + 3.6) + 0.7, sz + 3.6),
    radius: 1.3, maxDist: 2.6,
    label: () => 'Look inside the barrels',
    action: () => ui.toast(BARREL_LINES[barrelLine++ % BARREL_LINES.length])
  });

  batch.flush(group);

  return {
    update(dt) {
      const t = pgate.open ? 1 : 0;
      pgate.t += (t - pgate.t) * Math.min(1, dt * 3);
      gateHinge.rotation.y = pgate.t * 1.9;
      pgateSeg.on = pgate.t < 0.4;
    }
  };
}
