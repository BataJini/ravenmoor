// The world's mood: the long night, and the dawn the bell buys.
import * as THREE from 'three';
import { MOON_DIR } from './sky.js';
import { clamp, lerp, smoothstep } from './util.js';

const SUN_DIR = new THREE.Vector3(0.62, 0.38, 0.44).normalize();

const NIGHT = {
  fog: new THREE.Color(0x161e2a), fogDensity: 0.0088,
  hemiSky: new THREE.Color(0x3a4a63), hemiGround: new THREE.Color(0x141821), hemiI: 1.0,
  amb: new THREE.Color(0x39455e), ambI: 2.2,
  sun: new THREE.Color(0x93accc), sunI: 3.2
};
const DAWN = {
  fog: new THREE.Color(0x9a8272), fogDensity: 0.0056,
  hemiSky: new THREE.Color(0xaebfd8), hemiGround: new THREE.Color(0x6a5948), hemiI: 1.05,
  amb: new THREE.Color(0x8a7663), ambI: 1.15,
  sun: new THREE.Color(0xffc48a), sunI: 3.5
};

export class Mood {
  constructor(scene, sky, sun, hemi, amb) {
    this.scene = scene;
    this.sky = sky;
    this.sun = sun;
    this.hemi = hemi;
    this.amb = amb;
    this.t = 0;
    this.active = false;
    this.lightDir = MOON_DIR.clone();
    this._events = {};
    this._c = new THREE.Color();
    this.apply();
  }

  begin(audio, mistSources) {
    if (this.t >= 1 || this.active) return;
    this.active = true;
    this._audio = audio;
    this._mists = mistSources;
  }

  instant(mistSources) {
    this.t = 1;
    this.active = false;
    if (mistSources) for (const m of mistSources) m.on = false;
    this.apply();
  }

  update(dt) {
    if (!this.active || this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 42);
    const ev = (k, at, fn) => {
      if (!this._events[k] && this.t >= at) { this._events[k] = true; fn(); }
    };
    if (this._audio) {
      ev('peal', 0.04, () => this._audio.peal());
      ev('birds1', 0.45, () => this._audio.songbirds());
      ev('birds2', 0.7, () => this._audio.songbirds());
      ev('birds3', 0.92, () => this._audio.songbirds());
    }
    ev('mists', 0.55, () => { if (this._mists) for (const m of this._mists) m.on = false; });
    this.apply();
    if (this.t >= 1) this.active = false;
  }

  apply() {
    const k = smoothstep(0, 1, this.t);
    const fog = this.scene.fog;
    fog.color.copy(NIGHT.fog).lerp(DAWN.fog, k);
    fog.density = lerp(NIGHT.fogDensity, DAWN.fogDensity, k);
    this.hemi.color.copy(NIGHT.hemiSky).lerp(DAWN.hemiSky, k);
    this.hemi.groundColor.copy(NIGHT.hemiGround).lerp(DAWN.hemiGround, k);
    this.hemi.userData.base = lerp(NIGHT.hemiI, DAWN.hemiI, k);
    this.amb.color.copy(NIGHT.amb).lerp(DAWN.amb, k);
    this.amb.intensity = lerp(NIGHT.ambI, DAWN.ambI, k);
    this.sun.color.copy(NIGHT.sun).lerp(DAWN.sun, k);
    this.sun.userData.base = lerp(NIGHT.sunI, DAWN.sunI, k);
    this.lightDir.copy(MOON_DIR).lerp(SUN_DIR, k).normalize();
    this.sky.setDawn(k);
  }
}
