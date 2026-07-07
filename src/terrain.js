// The moor itself: rolling ground with painted paths, grass tufts,
// dead trees, and a silhouette treeline that closes the horizon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, PATHS, FLATTENS } from './layout.js';
import { TAU, range, smoothstep, lerp, distToPolyline, addCircle } from './util.js';

const GROUND_SIZE = 320;

export class Terrain {
  constructor(scene, rng) {
    this.rng = rng;
    this.patches = [];    // raised solid floors: { x1, z1, x2, z2, h }
    this._buildGround(scene);
    this._buildGrass(scene, rng);
    this._buildDeadTrees(scene, rng);
    this._buildBushes(scene, rng);
    this._buildTreeline(scene, rng);
  }

  // Raised floor slabs (porches, crypt plinths). Movers stand on max(ground, patch).
  addPatch(x1, z1, x2, z2, h) {
    this.patches.push({
      x1: Math.min(x1, x2), z1: Math.min(z1, z2),
      x2: Math.max(x1, x2), z2: Math.max(z1, z2), h
    });
  }

  // Analytic height — used by geometry AND by all movers, so they agree.
  heightAt(x, z) {
    let h =
      1.15 * Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.017 - 0.4) +
      0.65 * Math.sin(x * 0.045 + 0.3) * Math.cos(z * 0.039 + 2.1) +
      0.28 * Math.sin(x * 0.09 + z * 0.075);
    const d = Math.hypot(x, z);
    h += smoothstep(WORLD.bounds * 0.86, WORLD.bounds * 1.45, d) * 9;   // rim bowl
    for (const p of FLATTENS) {
      const pd = Math.hypot(x - p.x, z - p.z);
      const t = 1 - smoothstep(p.r * 0.55, p.r, pd);
      h = lerp(h, p.h, t);
    }
    for (const p of this.patches) {
      if (x >= p.x1 && x <= p.x2 && z >= p.z1 && z <= p.z2 && p.h > h) h = p.h;
    }
    return h;
  }

  addWoodFloor(x, z, r) {
    (this.woodFloors || (this.woodFloors = [])).push({ x, z, r });
  }

  groundType(x, z) {
    if (this.woodFloors) {
      for (const w of this.woodFloors) if (Math.hypot(x - w.x, z - w.z) < w.r) return 'wood';
    }
    if (Math.hypot(x - WORLD.spawn.x, z - WORLD.spawn.z) < 9) return 'stone';
    const c = WORLD.cathedral;
    if (Math.abs(x - c.x) < 15 && z > c.z + 18 && z < c.z + 34) return 'stone';
    if (Math.abs(x - c.x) < 10.4 && z > c.z - 19.5 && z < c.z + 20.7) return 'stone';
    for (const path of PATHS) if (distToPolyline(x, z, path) < 1.8) return 'path';
    return 'grass';
  }

  // ---------------------------------------------------------------------
  _buildGround(scene) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const g = canvas.getContext('2d');
    const S = 1024 / GROUND_SIZE;           // world → px
    const px = (x) => (x + GROUND_SIZE / 2) * S;
    const pz = (z) => (z + GROUND_SIZE / 2) * S;

    // base grass, mottled — painted as ALBEDO (the night lighting darkens it)
    g.fillStyle = '#41522f';
    g.fillRect(0, 0, 1024, 1024);
    const rng = this.rng;
    const blotches = ['#35452a', '#4c5c38', '#3a4a2c', '#57653f', '#2f3d24', '#485834'];
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = blotches[Math.floor(rng() * blotches.length)];
      g.globalAlpha = range(rng, 0.05, 0.16);
      const x = rng() * 1024, y = rng() * 1024, r = range(rng, 4, 26);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // graveyard soil tint
    const gy = WORLD.graveyard;
    g.fillStyle = 'rgba(74,66,50,0.45)';
    g.fillRect(px(gy.x - gy.w / 2), pz(gy.z - gy.d / 2), gy.w * S, gy.d * S);

    // paddock & stable dirt
    g.fillStyle = 'rgba(112,92,60,0.5)';
    const pd = WORLD.paddock;
    g.fillRect(px(pd.x - pd.w / 2), pz(pd.z - pd.d / 2), pd.w * S, pd.d * S);
    g.beginPath(); g.arc(px(WORLD.stable.x), pz(WORLD.stable.z), 9 * S, 0, TAU); g.fill();

    // paths (double stroke: soft edge + core)
    for (const path of PATHS) {
      for (const [width, color, alpha] of [[4.6, '#5c4e33', 0.5], [2.6, '#6f5d40', 0.9]]) {
        g.strokeStyle = color;
        g.globalAlpha = alpha;
        g.lineWidth = width * S;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        path.forEach(([x, z], i) => i === 0 ? g.moveTo(px(x), pz(z)) : g.lineTo(px(x), pz(z)));
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    // spawn plaza: worn stone circle
    g.fillStyle = '#585b66';
    g.beginPath(); g.arc(px(0), pz(40), 8.5 * S, 0, TAU); g.fill();
    g.strokeStyle = '#3d3f49'; g.lineWidth = 3;
    for (let r = 2.5; r < 8.5; r += 2) { g.beginPath(); g.arc(px(0), pz(40), r * S, 0, TAU); g.stroke(); }

    // cathedral forecourt flagstones
    g.fillStyle = '#525560';
    g.fillRect(px(-14), pz(WORLD.cathedral.z + 18), 28 * S, 15 * S);
    g.strokeStyle = 'rgba(46,48,58,0.9)'; g.lineWidth = 2;
    for (let i = 0; i <= 7; i++) {
      g.beginPath(); g.moveTo(px(-14 + i * 4), pz(WORLD.cathedral.z + 18)); g.lineTo(px(-14 + i * 4), pz(WORLD.cathedral.z + 33)); g.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(px(-14), pz(WORLD.cathedral.z + 18 + i * 3.75)); g.lineTo(px(14), pz(WORLD.cathedral.z + 18 + i * 3.75)); g.stroke();
    }

    // subtle darkening toward the mist boundary
    const edge = g.createRadialGradient(512, 512, 512 * 0.55, 512, 512, 512);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(4,6,10,0.75)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 1024, 1024);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 130, 130);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, this.heightAt(posAttr.getX(i), posAttr.getZ(i)));
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  // ---------------------------------------------------------------------
  _buildGrass(scene, rng) {
    // Two crossed dark blade-fans per tuft: tapered so they read as grass,
    // not floating cubes.
    const blade = new THREE.PlaneGeometry(0.4, 0.34, 1, 1);
    // pinch the top edge inward for a fan silhouette
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      if (bp.getY(i) > 0) bp.setX(i, bp.getX(i) * 0.25);
    }
    blade.translate(0, 0.17, 0);
    const cross = blade.clone().rotateY(Math.PI / 2);
    const tuft = mergeGeometries([blade, cross]);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x2e3d22, side: THREE.DoubleSide
    });
    const MAX = 900;
    const mesh = new THREE.InstancedMesh(tuft, mat, MAX);
    mesh.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const col = new THREE.Color();
    const pd = WORLD.paddock, st = WORLD.stable;
    let placed = 0, guard = 0;
    while (placed < MAX && guard++ < MAX * 12) {
      const a = rng() * TAU, r = 8 + Math.sqrt(rng()) * 92;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.groundType(x, z) !== 'grass') continue;
      const gy = WORLD.graveyard;
      if (Math.abs(x - gy.x) < gy.w / 2 && Math.abs(z - gy.z) < gy.d / 2 && rng() < 0.6) continue;
      if (Math.abs(x - pd.x) < pd.w / 2 + 1 && Math.abs(z - pd.z) < pd.d / 2 + 1) continue;
      if (Math.hypot(x - st.x, z - st.z) < 10) continue;
      q.setFromAxisAngle(v.set(0, 1, 0), rng() * TAU);
      const sc = range(rng, 0.65, 1.2);
      s.set(sc, sc * range(rng, 0.75, 1.25), sc);
      m4.compose(v.set(x, this.heightAt(x, z), z).clone(), q, s);
      mesh.setMatrixAt(placed, m4);
      col.setHSL(0.25, range(rng, 0.16, 0.28), range(rng, 0.12, 0.22));
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.grass = mesh;
    this.grassMax = placed;
    scene.add(mesh);
  }

  setGrassCount(n) {
    this.grass.count = Math.min(this.grassMax, n);
  }

  // ---------------------------------------------------------------------
  _makeTreeGeometry(rng) {
    // Recursive bare branches merged into one geometry.
    const parts = [];
    const addBranch = (m, len, r0, r1, depth) => {
      const geo = new THREE.CylinderGeometry(r1, r0, len, 5, 1);
      geo.translate(0, len / 2, 0);
      geo.applyMatrix4(m);
      parts.push(geo);
      if (depth >= 3) return;
      const tip = new THREE.Matrix4().makeTranslation(0, len, 0).premultiply(m);
      const n = depth === 0 ? 3 + Math.floor(rng() * 2) : 2;
      for (let i = 0; i < n; i++) {
        const yaw = rng() * TAU;
        const tilt = range(rng, 0.45, 0.95) * (depth === 0 ? 0.9 : 1.1);
        const rot = new THREE.Matrix4().makeRotationY(yaw)
          .multiply(new THREE.Matrix4().makeRotationX(tilt));
        const start = depth === 0 ? range(rng, 0.55, 0.95) : range(rng, 0.6, 1);
        const base = new THREE.Matrix4().makeTranslation(0, len * start, 0).premultiply(m).multiply(rot);
        addBranch(base, len * range(rng, 0.5, 0.68), r0 * 0.55, r1 * 0.4, depth + 1);
      }
    };
    addBranch(new THREE.Matrix4(), range(rng, 3.2, 4.4), 0.3, 0.18, 0);
    return mergeGeometries(parts);
  }

  _buildDeadTrees(scene, rng) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b2533 });
    const types = [this._makeTreeGeometry(rng), this._makeTreeGeometry(rng), this._makeTreeGeometry(rng)];
    const groups = [[], [], []];
    WORLD.trees.forEach((t, i) => groups[i % 3].push(t));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    this.treeTops = [];
    types.forEach((geo, ti) => {
      const list = groups[ti];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = true;
      list.forEach((t, i) => {
        const y = this.heightAt(t.x, t.z);
        q.setFromAxisAngle(up, rng() * TAU);
        m4.compose(new THREE.Vector3(t.x, y - 0.1, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
        mesh.setMatrixAt(i, m4);
        addCircle(t.x, t.z, 0.5 * t.s);
        this.treeTops.push({ x: t.x, y: y + 3.6 * t.s, z: t.z });
      });
      scene.add(mesh);
    });
  }

  _buildBushes(scene, rng) {
    const geo = new THREE.IcosahedronGeometry(0.55, 0);
    geo.scale(1.2, 0.72, 1.1);
    const mat = new THREE.MeshLambertMaterial({ color: 0x243120 });
    const N = 30;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 400) {
      const a = rng() * TAU, r = 12 + Math.sqrt(rng()) * 80;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.groundType(x, z) !== 'grass') continue;
      const gy = WORLD.graveyard;
      if (Math.abs(x - gy.x) < gy.w / 2 + 2 && Math.abs(z - gy.z) < gy.d / 2 + 2) continue;
      const pd = WORLD.paddock;
      if (Math.abs(x - pd.x) < pd.w / 2 + 2 && Math.abs(z - pd.z) < pd.d / 2 + 2) continue;
      q.setFromAxisAngle(up, rng() * TAU);
      const s = range(rng, 0.7, 1.9);
      m4.compose(new THREE.Vector3(x, this.heightAt(x, z) + 0.12 * s, z), q, new THREE.Vector3(s, s * range(rng, 0.8, 1.2), s));
      mesh.setMatrixAt(placed, m4);
      col.setHSL(0.26, range(rng, 0.15, 0.28), range(rng, 0.1, 0.2));
      mesh.setColorAt(placed, col);
      addCircle(x, z, 0.55 * s);
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  _buildTreeline(scene, rng) {
    // Jagged conifer silhouettes half-swallowed by fog, ringing the world.
    const cone = new THREE.ConeGeometry(3.2, 17, 6);
    cone.translate(0, 7.5, 0);
    const cone2 = new THREE.ConeGeometry(2.2, 12, 5);
    cone2.translate(0.8, 11, 0.4);
    const geo = mergeGeometries([cone, cone2]);
    const mat = new THREE.MeshLambertMaterial({ color: 0x0b0f12 });
    const N = 64;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + range(rng, -0.06, 0.06);
      const r = range(rng, WORLD.bounds + 6, WORLD.bounds + 34);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      q.setFromAxisAngle(up, rng() * TAU);
      const s = range(rng, 0.8, 1.9);
      m4.compose(new THREE.Vector3(x, this.heightAt(x, z) - 1, z), q, new THREE.Vector3(s, s * range(rng, 0.9, 1.5), s));
      mesh.setMatrixAt(i, m4);
    }
    scene.add(mesh);
  }
}
