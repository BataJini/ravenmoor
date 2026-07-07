// Night sky: gradient dome, stars, a huge low moon, drifting clouds,
// and lightning flashes that light the whole scene.
import * as THREE from 'three';
import { TAU, range } from './util.js';

export const MOON_DIR = new THREE.Vector3(-0.28, 0.56, -0.78).normalize();

function glowTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, 'rgba(220,228,255,0.35)');
  grad.addColorStop(0.6, 'rgba(180,195,235,0.08)');
  grad.addColorStop(1, 'rgba(160,180,230,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene, rng) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.flash = 0;

    // -- dome ---------------------------------------------------------------
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        // horizon sits a touch LIGHTER than the scene fog, so fogged trees
        // and buildings read as dark silhouettes against moonlit haze
        uTop: { value: new THREE.Color(0x05070e) },
        uMid: { value: new THREE.Color(0x131e30) },
        uHorizon: { value: new THREE.Color(0x243349) },
        uFlash: { value: 0 },
        uDawn: { value: 0 }
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon;
        uniform float uFlash; uniform float uDawn;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y, -0.05, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.02, 0.2, h));
          col = mix(col, uTop, smoothstep(0.18, 0.62, h));
          // dawn palette blends in when the bell has done its work
          vec3 dHor = vec3(1.0, 0.62, 0.42);
          vec3 dMid = vec3(0.52, 0.6, 0.74);
          vec3 dTop = vec3(0.27, 0.42, 0.65);
          vec3 dawn = mix(dHor, dMid, smoothstep(0.02, 0.22, h));
          dawn = mix(dawn, dTop, smoothstep(0.2, 0.6, h));
          col = mix(col, dawn, uDawn);
          col += vec3(0.65, 0.72, 0.9) * uFlash * (1.0 - h * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 14), this.domeMat);
    this.group.add(dome);

    // -- stars ----------------------------------------------------------------
    const starCount = 1100;
    const pos = new Float32Array(starCount * 3);
    const col = new Float32Array(starCount * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const a = rng() * TAU;
      const y = 0.06 + Math.pow(rng(), 0.7) * 0.94;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(a) * r * 500;
      pos[i * 3 + 1] = y * 500;
      pos[i * 3 + 2] = Math.sin(a) * r * 500;
      const b = range(rng, 0.35, 1.0);
      tint.setHSL(range(rng, 0.55, 0.68), range(rng, 0, 0.35), b * 0.75);
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.group.add(stars);
    this.starsMat = stars.material;

    // -- moon -----------------------------------------------------------------
    const moonPos = MOON_DIR.clone().multiplyScalar(430);
    // a pale cratered face, drawn once
    const mc = document.createElement('canvas');
    mc.width = mc.height = 128;
    const mg = mc.getContext('2d');
    mg.fillStyle = '#e8ebf2';
    mg.beginPath(); mg.arc(64, 64, 64, 0, TAU); mg.fill();
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU, rr = Math.sqrt(rng()) * 52;
      const x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr;
      const cr = range(rng, 2, 9);
      mg.fillStyle = `rgba(168,176,196,${range(rng, 0.14, 0.4).toFixed(2)})`;
      mg.beginPath(); mg.arc(x, y, cr, 0, TAU); mg.fill();
    }
    const moonTex = new THREE.CanvasTexture(mc);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(17, 36),
      new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true })
    );
    this.moonMat = moon.material;
    moon.position.copy(moonPos);
    moon.lookAt(0, 0, 0);
    this.group.add(moon);

    const glowTex = glowTexture();
    const glow1 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, transparent: true,
      opacity: 0.65, fog: false, depthWrite: false
    }));
    glow1.position.copy(moonPos);
    glow1.scale.setScalar(120);
    this.group.add(glow1);
    const glow2 = glow1.clone();
    glow2.material = glow1.material.clone();
    glow2.material.opacity = 0.22;
    glow2.scale.setScalar(330);
    this.group.add(glow2);
    this.glowMats = [glow1.material, glow2.material];

    // -- clouds: dark wisps sliding past the moon -----------------------------
    this.clouds = [];
    const cloudTex = this._cloudTexture(rng);
    for (let i = 0; i < 6; i++) {
      const w = range(rng, 140, 260);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.3),
        new THREE.MeshBasicMaterial({
          map: cloudTex, transparent: true, opacity: range(rng, 0.3, 0.55),
          color: 0x05070c, fog: false, depthWrite: false
        })
      );
      const a = range(rng, 0, TAU);
      const rad = range(rng, 320, 430);
      const y = range(rng, 120, 300);
      m.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      m.lookAt(0, y * 0.9, 0);
      m.userData.speed = range(rng, 0.9, 2.4);
      m.userData.angle = a;
      m.userData.rad = rad;
      m.userData.y = y;
      this.clouds.push(m);
      this.group.add(m);
    }
  }

  _cloudTexture(rng) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    for (let i = 0; i < 46; i++) {
      const x = range(rng, 10, 246), y = range(rng, 22, 74);
      const r = range(rng, 12, 34);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return new THREE.CanvasTexture(c);
  }

  lightning() {
    this.flash = 1;
    this._flashSteps = 2 + Math.floor(Math.random() * 2);
  }

  setDawn(t) {
    this.domeMat.uniforms.uDawn.value = t;
    this.starsMat.opacity = 0.95 * (1 - t);
    this.moonMat.opacity = 1 - t * 0.85;
    this.glowMats[0].opacity = 0.65 * (1 - t * 0.9);
    this.glowMats[1].opacity = 0.22 * (1 - t * 0.9);
  }

  update(dt, camPos) {
    this.group.position.set(camPos.x, 0, camPos.z);
    for (const m of this.clouds) {
      m.userData.angle += dt * m.userData.speed * 0.004;
      m.position.set(
        Math.cos(m.userData.angle) * m.userData.rad,
        m.userData.y,
        Math.sin(m.userData.angle) * m.userData.rad
      );
      m.lookAt(this.group.position.x, m.userData.y * 0.9, this.group.position.z);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.2);
      // stutter re-strike
      if (this.flash < 0.35 && this._flashSteps > 0 && Math.random() < 0.12) {
        this.flash = 0.55 + Math.random() * 0.4;
        this._flashSteps--;
      }
    }
    this.domeMat.uniforms.uFlash.value = this.flash * 0.34;
  }
}
