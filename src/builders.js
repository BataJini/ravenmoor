// Shared building blocks: material palette, a geometry batcher that merges
// everything with the same material into one draw call, and gothic shapes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Lambert everywhere big: on an integrated GPU the per-pixel cost of
// MeshStandardMaterial across a full-screen ground plane is brutal.
export const MAT = {
  stone: new THREE.MeshLambertMaterial({ color: 0x5d6472 }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x3d424e }),
  roof: new THREE.MeshLambertMaterial({ color: 0x232834 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x41301f }),
  darkWood: new THREE.MeshLambertMaterial({ color: 0x291f13 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.55, metalness: 0.65 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x6b5530, roughness: 0.45, metalness: 0.75 }),
  hay: new THREE.MeshLambertMaterial({ color: 0x6a5a2e }),
  bone: new THREE.MeshLambertMaterial({ color: 0x7d8280 })
};

// Compose a Matrix4 tersely.
export function T(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

export class GeoBatch {
  constructor() { this.buckets = new Map(); }

  add(mat, geo, matrix) {
    // Normalize to non-indexed: Extrude/Shape geometries are non-indexed
    // while the primitives are indexed, and mergeGeometries refuses to mix.
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return this;
  }

  box(mat, w, h, d, matrix) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), matrix);
  }

  cyl(mat, rTop, rBot, h, seg, matrix) {
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBot, h, seg), matrix);
  }

  cone(mat, r, h, seg, matrix) {
    return this.add(mat, new THREE.ConeGeometry(r, h, seg), matrix);
  }

  sphere(mat, r, matrix, w = 10, h = 8) {
    return this.add(mat, new THREE.SphereGeometry(r, w, h), matrix);
  }

  flush(parent, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.buckets) {
      const merged = mergeGeometries(geos);
      geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// A gothic lancet (pointed arch) outline. Origin at bottom-center,
// optionally lifted by y0 (used to punch holes in frames).
export function archShape(w, h, y0 = 0) {
  const s = new THREE.Shape();
  const half = w / 2;
  const shoulder = y0 + (h - w * 0.85);   // where the arch curves begin
  s.moveTo(-half, y0);
  s.lineTo(-half, shoulder);
  s.quadraticCurveTo(-half * 0.86, y0 + h * 0.97, 0, y0 + h);
  s.quadraticCurveTo(half * 0.86, y0 + h * 0.97, half, shoulder);
  s.lineTo(half, y0);
  s.lineTo(-half, y0);
  return s;
}

// Arch frame: outer arch with an inner arch hole, extruded. The inner
// opening spans y = t .. t + h, so the frame surrounds it on all sides.
export function archFrameGeo(w, h, t, depth) {
  const outer = archShape(w + t * 2, h + t * 2);
  outer.holes.push(archShape(w, h, t));
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// Stained glass canvas texture (tall lancet).
export function stainedGlassTexture(rng, rose = false) {
  const w = rose ? 256 : 128, h = rose ? 256 : 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const colors = ['#1c2a58', '#4a1522', '#321a4e', '#5a4416', '#143842', '#4c2210', '#1e3c58'];
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, w, h);
  if (rose) {
    const cx = w / 2, cy = h / 2;
    const petals = 12;
    for (let i = 0; i < petals; i++) {
      const a0 = (i / petals) * Math.PI * 2, a1 = ((i + 1) / petals) * Math.PI * 2;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, w * 0.46, a0 + 0.03, a1 - 0.03);
      g.fill();
    }
    g.fillStyle = colors[3];
    g.beginPath(); g.arc(cx, cy, w * 0.17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#04050a'; g.lineWidth = 7;
    g.beginPath(); g.arc(cx, cy, w * 0.3, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * w * 0.48, cy + Math.sin(a) * w * 0.48);
      g.stroke();
    }
  } else {
    const cols = 2, rows = 8;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = colors[Math.floor(rng() * colors.length)];
        g.fillRect(x * (w / cols) + 3, y * (h / rows) + 3, w / cols - 6, h / rows - 6);
        // uneven candle-light behind the panes
        g.fillStyle = `rgba(0,0,0,${(rng() * 0.4).toFixed(2)})`;
        g.fillRect(x * (w / cols) + 3, y * (h / rows) + 3, w / cols - 6, h / rows - 6);
      }
    }
    // mullion + transoms
    g.strokeStyle = '#04050a';
    g.lineWidth = 8;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 5;
    for (let y = 1; y < rows; y++) { g.beginPath(); g.moveTo(0, y * h / rows); g.lineTo(w, y * h / rows); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Shared soft radial glow (tinted per-sprite via material color).
let _halo = null;
export function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.32)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.07)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}

// ShapeGeometry UVs come out in raw shape units; remap them into 0..1.
export function normalizeUVs(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - bb.min.x) / sx, (uv.getY(i) - bb.min.y) / sy);
  }
  return geo;
}

// Warm lattice window for cottages.
export function cottageWindowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c97f2e';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createRadialGradient(32, 30, 4, 32, 32, 44);
  grad.addColorStop(0, 'rgba(255,220,150,0.9)');
  grad.addColorStop(1, 'rgba(140,70,20,0.9)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#1c1208';
  g.lineWidth = 5;
  g.strokeRect(2, 2, 60, 60);
  g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
