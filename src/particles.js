// GPU-driven particle pools. Each pool is one THREE.Points whose particles
// move entirely in the vertex shader (birth + velocity + gravity), so the
// per-frame CPU cost is a single uniform update.
import * as THREE from 'three';

function softCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VERT = /* glsl */`
  uniform float uTime;
  uniform vec3 uGrav;
  attribute float aBirth;
  attribute float aLife;
  attribute vec3 aVel;
  attribute float aSize0;
  attribute float aSize1;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float age = uTime - aBirth;
    float t = clamp(age / max(aLife, 0.001), 0.0, 1.0);
    float alive = step(0.0, age) * step(age, aLife);
    vec3 p = position + aVel * age + 0.5 * uGrav * age * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = mix(aSize0, aSize1, t);
    gl_PointSize = min(alive * size * (240.0 / max(0.1, -mv.z)), 420.0);
    float fadeIn = smoothstep(0.0, 0.18, t);
    float fadeOut = 1.0 - smoothstep(0.55, 1.0, t);
    vAlpha = aAlpha * fadeIn * fadeOut * alive;
    vColor = aColor;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uTex;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor, tex.a * vAlpha);
    if (gl_FragColor.a < 0.003) discard;
  }
`;

class Pool {
  constructor(scene, tex, { max = 200, blending = THREE.AdditiveBlending, gravity = [0, 0, 0] }) {
    this.max = max;
    this.cursor = 0;
    this.time = 0;
    const geo = new THREE.BufferGeometry();
    const mk = (n) => new THREE.BufferAttribute(new Float32Array(max * n), n);
    geo.setAttribute('position', mk(3));
    geo.setAttribute('aVel', mk(3));
    geo.setAttribute('aColor', mk(3));
    geo.setAttribute('aBirth', mk(1));
    geo.setAttribute('aLife', mk(1));
    geo.setAttribute('aSize0', mk(1));
    geo.setAttribute('aSize1', mk(1));
    geo.setAttribute('aAlpha', mk(1));
    // Park everything far below the world until spawned.
    const pos = geo.attributes.position.array;
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -9999;
    geo.attributes.aBirth.array.fill(-1e9);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGrav: { value: new THREE.Vector3(...gravity) }, uTex: { value: tex } },
      vertexShader: VERT, fragmentShader: FRAG,
      blending, transparent: true, depthWrite: false
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const a = this.geo.attributes;
    a.position.setXYZ(i, p.x, p.y, p.z);
    a.aVel.setXYZ(i, p.vx || 0, p.vy || 0, p.vz || 0);
    const col = p.color;
    a.aColor.setXYZ(i, col.r, col.g, col.b);
    a.aBirth.setX(i, this.time);
    a.aLife.setX(i, p.life);
    a.aSize0.setX(i, p.size0);
    a.aSize1.setX(i, p.size1);
    a.aAlpha.setX(i, p.alpha);
    for (const k of ['position', 'aVel', 'aColor', 'aBirth', 'aLife', 'aSize0', 'aSize1', 'aAlpha']) {
      a[k].needsUpdate = true;
    }
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
  }
}

const C = (hex) => new THREE.Color(hex);

export class Particles {
  constructor(scene) {
    const tex = softCircleTexture();
    this.flame = new Pool(scene, tex, { max: 340, gravity: [0, 0.55, 0] });
    this.smoke = new Pool(scene, tex, { max: 160, blending: THREE.NormalBlending, gravity: [0, 0.06, 0] });
    this.mist = new Pool(scene, tex, { max: 130, blending: THREE.NormalBlending });
    this.magic = new Pool(scene, tex, { max: 420, gravity: [0, 0.25, 0] });
    this.pools = [this.flame, this.smoke, this.mist, this.magic];
    this.sources = [];   // { pool, rate, acc, fn, on }
    this._t = 0;
  }

  addSource(pool, rate, fn) {
    const s = { pool, rate, acc: 0, fn, on: true };
    this.sources.push(s);
    return s;
  }

  // ---- source presets ----
  torchFlame(getPos) {
    const src = this.addSource(this.flame, 22, (spawn) => {
      const p = getPos();
      const heat = Math.random();
      spawn({
        x: p.x + (Math.random() - 0.5) * 0.14, y: p.y, z: p.z + (Math.random() - 0.5) * 0.14,
        vx: (Math.random() - 0.5) * 0.22, vy: 0.55 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.22,
        life: 0.45 + Math.random() * 0.5,
        size0: 0.34, size1: 0.06,
        alpha: 0.85,
        color: heat > 0.65 ? C(0xffd9a0) : heat > 0.25 ? C(0xff9a40) : C(0xef5a1e)
      });
    });
    // occasional ember
    this.addSource(this.flame, 1.6, (spawn) => {
      const p = getPos();
      spawn({
        x: p.x, y: p.y + 0.1, z: p.z,
        vx: (Math.random() - 0.5) * 0.5, vy: 1.1 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.5,
        life: 1.4 + Math.random() * 1.2, size0: 0.06, size1: 0.02, alpha: 0.9, color: C(0xffb050)
      });
    }).master = src;
    return src;
  }

  candleFlame(getPos) {
    return this.addSource(this.flame, 7, (spawn) => {
      const p = getPos();
      spawn({
        x: p.x + (Math.random() - 0.5) * 0.05, y: p.y, z: p.z + (Math.random() - 0.5) * 0.05,
        vx: 0, vy: 0.22 + Math.random() * 0.2, vz: 0,
        life: 0.35 + Math.random() * 0.3, size0: 0.13, size1: 0.03, alpha: 0.8,
        color: Math.random() > 0.4 ? C(0xffcf90) : C(0xff9440)
      });
    });
  }

  chimneySmoke(getPos) {
    return this.addSource(this.smoke, 1.7, (spawn) => {
      const p = getPos();
      spawn({
        x: p.x + (Math.random() - 0.5) * 0.2, y: p.y, z: p.z + (Math.random() - 0.5) * 0.2,
        vx: 0.12 + Math.random() * 0.12, vy: 0.4 + Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.1,
        life: 4.5 + Math.random() * 3, size0: 0.5, size1: 2.6, alpha: 0.16,
        color: C(0x3a3d46)
      });
    });
  }

  groundMist(cx, cz, radius, heightAt) {
    return this.addSource(this.mist, 0.5, (spawn) => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      spawn({
        x, y: heightAt(x, z) + 0.5 + Math.random() * 0.5, z,
        vx: (Math.random() - 0.5) * 0.28, vy: 0.012, vz: (Math.random() - 0.5) * 0.28,
        life: 9 + Math.random() * 7, size0: 3.4, size1: 5.6, alpha: 0.045,
        color: C(0x8794a8)
      });
    });
  }

  fireflies(cx, cz, radius, heightAt) {
    return this.addSource(this.magic, 1.1, (spawn) => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      spawn({
        x, y: heightAt(x, z) + 0.4 + Math.random() * 1.6, z,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.3) * 0.3, vz: (Math.random() - 0.5) * 0.5,
        life: 2.2 + Math.random() * 2.4, size0: 0.05, size1: 0.025, alpha: 0.85,
        color: C(Math.random() < 0.7 ? 0xc8e08a : 0x9fd4a8)
      });
    });
  }

  soulIdle(getPos) {
    return this.addSource(this.magic, 3.2, (spawn) => {
      const p = getPos();
      spawn({
        x: p.x + (Math.random() - 0.5) * 0.3, y: p.y + (Math.random() - 0.5) * 0.3, z: p.z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.16, vy: 0.1 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.16,
        life: 1.2 + Math.random(), size0: 0.09, size1: 0.02, alpha: 0.75, color: C(0x9fd4ff)
      });
    });
  }

  ghostTrail(getPos, getVel) {
    return this.addSource(this.magic, 14, (spawn) => {
      const p = getPos(), v = getVel();
      if (v < 0.5) return;
      spawn({
        x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + Math.random() * 0.9, z: p.z + (Math.random() - 0.5) * 0.7,
        vx: (Math.random() - 0.5) * 0.2, vy: 0.12, vz: (Math.random() - 0.5) * 0.2,
        life: 0.8 + Math.random() * 0.8, size0: 0.22, size1: 0.03, alpha: 0.34, color: C(0x86c8de)
      });
    });
  }

  // ---- one-shots ----
  burst(pos, colorHex, n = 20, speed = 1.6) {
    const color = C(colorHex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.magic.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 0.6, vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.7 + Math.random() * 0.9, size0: 0.14, size1: 0.02, alpha: 0.85, color
      });
    }
  }

  breath(pos, dirX, dirZ) {
    for (let i = 0; i < 4; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dirX * 0.5 + (Math.random() - 0.5) * 0.2, vy: 0.06 + Math.random() * 0.1, vz: dirZ * 0.5 + (Math.random() - 0.5) * 0.2,
        life: 1.1 + Math.random() * 0.6, size0: 0.1, size1: 0.55, alpha: 0.12, color: C(0x9aa4b5)
      });
    }
  }

  update(dt) {
    this._t += dt;
    for (const p of this.pools) p.update(dt);
    for (const s of this.sources) {
      if (!s.on || (s.master && !s.master.on)) continue;
      s.acc += s.rate * dt;
      const spawn = s.pool.spawn.bind(s.pool);
      while (s.acc >= 1) { s.acc -= 1; s.fn(spawn); }
    }
  }
}
