// Fully procedural WebAudio: wind, generative music, bells, hooves, thunder…
// Every method is safe to call before start() — it just does nothing.
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._organ = null;
    this._timers = [];
  }

  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.4;
    this.master.connect(c.destination);

    // Simple generated-impulse reverb shared by everything atmospheric.
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.6);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.noiseBuf = this._noise(2);
    this._wind();
    this._musicLoop();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.4, this.ctx.currentTime, 0.1);
  }

  dispose() { this._timers.forEach(clearTimeout); }

  // -- plumbing ------------------------------------------------------------
  _noise(sec) {
    const c = this.ctx, buf = c.createBuffer(1, sec * c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(sec, decay) {
    const c = this.ctx, len = sec * c.sampleRate;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Gain envelope node routed to master (+ optional reverb send).
  _env(t0, attack, hold, release, peak, wet = 0.3) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    g.connect(this.master);
    if (wet > 0) {
      const send = c.createGain();
      send.gain.value = wet;
      g.connect(send).connect(this.reverb);
    }
    return g;
  }

  _burst(t0, dur, filterType, freq, q, peak, wet = 0.15, rate = 1) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(this._env(t0, 0.005, 0, dur, peak, wet));
    src.start(t0); src.stop(t0 + dur + 0.1);
  }

  _tone(t0, type, f0, f1, dur, peak, wet = 0.3, attack = 0.005) {
    const c = this.ctx, o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    o.connect(this._env(t0, attack, 0, dur, peak, wet));
    o.start(t0); o.stop(t0 + dur + 0.2);
    return o;
  }

  _later(ms, fn) { this._timers.push(setTimeout(fn, ms)); }

  // -- ambience ------------------------------------------------------------
  _wind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noise(6); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master);
    // Two slow LFOs beat against each other for gusts.
    for (const [rate, depth] of [[0.05, 0.022], [0.13, 0.014]]) {
      const lfo = c.createOscillator(); lfo.frequency.value = rate;
      const lg = c.createGain(); lg.gain.value = depth;
      lfo.connect(lg).connect(g.gain); lfo.start();
    }
    const lfoF = c.createOscillator(); lfoF.frequency.value = 0.07;
    const lfg = c.createGain(); lfg.gain.value = 120;
    lfoF.connect(lfg).connect(lp.frequency); lfoF.start();
    src.start();
  }

  _musicLoop() {
    // A sparse music box in D minor, drowned in reverb.
    const notes = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 110.0, 87.31];
    const step = () => {
      if (!this.ctx) return;
      if (!this.muted && Math.random() < 0.85) {
        const t = this.ctx.currentTime + 0.05;
        const n = notes[Math.floor(Math.random() * notes.length)];
        this._tone(t, 'triangle', n, n, 3.2, 0.035, 0.85, 0.9);
        if (Math.random() < 0.3) this._tone(t + 1.4, 'triangle', n * 1.5, n * 1.5, 2.6, 0.02, 0.9, 0.8);
      }
      this._later(3800 + Math.random() * 4800, step);
    };
    this._later(2500, step);
    // Low cathedral drone, rare.
    const drone = () => {
      if (!this.ctx) return;
      if (!this.muted) this._tone(this.ctx.currentTime, 'sine', 73.4, 73.4, 14, 0.028, 0.9, 5);
      this._later(30000 + Math.random() * 40000, drone);
    };
    this._later(12000, drone);
  }

  // -- one-shots (all guarded) ----------------------------------------------
  footstep(surface) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (surface === 'wood') {
      this._tone(t, 'sine', 145, 85, 0.09, 0.045, 0.1);
      this._burst(t, 0.05, 'lowpass', 650, 0.8, 0.028, 0.08);
    } else if (surface === 'stone') {
      this._burst(t, 0.07, 'bandpass', 850 + Math.random() * 250, 1.8, 0.045, 0.12);
    } else if (surface === 'path') {
      this._burst(t, 0.08, 'bandpass', 600 + Math.random() * 200, 1.1, 0.05, 0.05);
    } else {
      this._burst(t, 0.09, 'lowpass', 420 + Math.random() * 160, 0.6, 0.05, 0.04);
    }
  }

  clop(vol = 1, hard = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = hard ? 300 : 190;
    this._tone(t, 'sine', f + Math.random() * 40, f * 0.7, 0.07, 0.055 * vol, 0.12);
    this._burst(t, 0.03, 'highpass', 1600, 1, 0.014 * vol, 0.05);
  }

  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, base = 146.83;
    const partials = [[1, 6, 0.22], [2.0, 4.5, 0.13], [2.98, 3.2, 0.08], [4.2, 2.2, 0.045], [0.5, 7, 0.1]];
    for (const [ratio, dur, amp] of partials) {
      this._tone(t, 'sine', base * ratio * (1 + (Math.random() - 0.5) * 0.004), base * ratio, dur, amp, 0.75, 0.002);
    }
    this._burst(t, 0.06, 'bandpass', 2400, 2, 0.05, 0.3);
    // A second, softer toll.
    this._later(2400, () => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      for (const [ratio, dur, amp] of partials) this._tone(t2, 'sine', base * ratio, base * ratio, dur * 0.8, amp * 0.55, 0.8, 0.002);
    });
  }

  chime(step = 0) {
    if (!this.ctx) return;
    const scale = [587.33, 698.46, 880.0, 1174.66];
    const f = scale[step % 4];
    this._tone(this.ctx.currentTime, 'triangle', f, f, 1.6, 0.05, 0.8);
    this._tone(this.ctx.currentTime + 0.06, 'sine', f * 2, f * 2, 1.2, 0.02, 0.9);
  }

  soulChorus() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [293.66, 349.23, 440.0, 587.33, 880.0].forEach((f, i) => {
      this._tone(t + i * 0.35, 'sine', f, f, 4.5, 0.035, 0.9, 1.2);
    });
  }

  creak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(52, t);
    o.frequency.linearRampToValueAtTime(88, t + 0.5);
    o.frequency.linearRampToValueAtTime(61, t + 1.0);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    o.connect(f).connect(this._env(t, 0.08, 0.5, 0.5, 0.035, 0.35));
    o.start(t); o.stop(t + 1.2);
  }

  chestOpen() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._burst(t, 0.05, 'highpass', 1800, 1, 0.05, 0.1);
    [880, 1108.7, 1318.5].forEach((f, i) => this._tone(t + 0.25 + i * 0.13, 'triangle', f, f, 1.4, 0.028, 0.85));
  }

  coin() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 2100, 1900, 0.4, 0.04, 0.3);
    this._later(900, () => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      this._tone(t2, 'sine', 300, 90, 0.18, 0.05, 0.5);
      this._burst(t2 + 0.02, 0.3, 'lowpass', 600, 0.7, 0.03, 0.5);
    });
  }

  thunder() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this._noise(4); src.playbackRate.value = 0.35;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(45, t + 3.2);
    const g = this._env(t, 0.12, 0.5, 2.8, 0.16, 0.6);
    src.connect(lp).connect(g);
    src.start(t); src.stop(t + 4);
    this._tone(t + 0.05, 'sine', 48, 30, 2.2, 0.07, 0.4, 0.1);
  }

  owl() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 392, 355, 0.28, 0.028, 0.6, 0.05);
    this._tone(t + 0.45, 'sine', 380, 340, 0.4, 0.024, 0.6, 0.05);
  }

  wolf() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(310, t);
    o.frequency.linearRampToValueAtTime(520, t + 0.8);
    o.frequency.linearRampToValueAtTime(290, t + 2.4);
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vg = c.createGain(); vg.gain.value = 7;
    vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + 2.6);
    o.connect(this._env(t, 0.5, 1.0, 1.0, 0.022, 0.85));
    o.start(t); o.stop(t + 2.6);
  }

  crow() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.22;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(720 + Math.random() * 80, t0);
      o.frequency.exponentialRampToValueAtTime(430, t0 + 0.14);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2.2;
      o.connect(f).connect(this._env(t0, 0.01, 0.05, 0.1, 0.04, 0.3));
      o.start(t0); o.stop(t0 + 0.2);
    }
  }

  snort() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 26;
    const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + 0.35);
    src.connect(lp).connect(am).connect(this._env(t, 0.02, 0.1, 0.2, 0.06, 0.1));
    src.start(t); src.stop(t + 0.4);
  }

  nicker() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.5);
    const vib = c.createOscillator(); vib.frequency.value = 13;
    const vg = c.createGain(); vg.gain.value = 22;
    vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + 0.6);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    o.connect(f).connect(this._env(t, 0.04, 0.25, 0.25, 0.05, 0.2));
    o.start(t); o.stop(t + 0.6);
  }

  whisper() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.7;
    const g = this._env(t, 0.3, 0.6, 0.7, 0.025, 0.8);
    // syllabic flutter
    const am = c.createGain(); am.gain.value = 0.6;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7.3;
    const lg = c.createGain(); lg.gain.value = 0.35;
    lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + 1.8);
    src.connect(bp).connect(am).connect(g);
    src.start(t); src.stop(t + 1.8);
  }

  knock() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this._tone(t + i * 0.28, 'sine', 130, 70, 0.1, 0.09, 0.25);
      this._burst(t + i * 0.28, 0.03, 'lowpass', 900, 1, 0.03, 0.1);
    }
  }

  // The soul swell: a rising multi-voice chord that climbs with each soul.
  soulSwell(count) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const minor = [0, 3, 7, 12, 15, 19, 24];
    const base = 220 * Math.pow(2, Math.min(count, 13) / 26);
    // sub thump
    this._tone(t, 'sine', 70, 34, 0.35, 0.12, 0.3, 0.01);
    // swelling voices
    for (let v = 0; v < 3; v++) {
      const f = base * Math.pow(2, minor[(count + v * 2) % minor.length] / 12);
      this._tone(t + 0.03 * v, 'sine', f, f * 1.01, 2.6, 0.05, 0.9, 0.5);
    }
    // sparkle arpeggio
    [0, 4, 7, 12].forEach((s, i) => {
      const f = base * 2 * Math.pow(2, s / 12);
      this._tone(t + 0.1 + i * 0.09, 'triangle', f, f, 1.1, 0.028, 0.85);
    });
  }

  achievement() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => this._tone(t + i * 0.11, 'triangle', f, f, 1.2, 0.04, 0.7));
    this._tone(t + 0.36, 'sine', 1046.5, 1046.5, 1.6, 0.03, 0.85);
  }

  murmur(seed = 0.5, dur = 1.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = 3 + Math.floor(seed * 4);
    for (let i = 0; i < n; i++) {
      const t0 = t + (i * dur) / n;
      const f = 120 + ((seed * 971 + i * 137) % 90);
      this._tone(t0, 'triangle', f, f * 0.92, dur / n * 0.7, 0.03, 0.25, 0.02);
    }
  }

  ghostMurmur() {
    if (!this.ctx) return;
    this.whisper();
  }

  countdown(last = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'square', last ? 880 : 440, last ? 880 : 440, last ? 0.35 : 0.14, 0.045, 0.2, 0.005);
  }

  gateChime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 987.77, 987.77, 0.5, 0.05, 0.5);
    this._tone(t + 0.05, 'sine', 1318.5, 1318.5, 0.7, 0.035, 0.6);
  }

  fanfare(win) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (win) {
      // minor rising into a bright picardy third
      [[293.66, 0], [349.23, 0.16], [440, 0.32], [587.33, 0.5], [739.99, 0.72]].forEach(([f, d]) => {
        this._tone(t + d, 'triangle', f, f, 1.4, 0.05, 0.7);
      });
      this._later(900, () => this.bell());
    } else {
      this._tone(t, 'sine', 220, 110, 1.2, 0.06, 0.5);
      this._tone(t + 0.3, 'sine', 146.8, 73, 1.6, 0.05, 0.6);
    }
  }

  whistle() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1100, t);
    o.frequency.linearRampToValueAtTime(1500, t + 0.16);
    o.frequency.linearRampToValueAtTime(900, t + 0.4);
    o.connect(this._env(t, 0.02, 0.25, 0.2, 0.05, 0.4));
    o.start(t); o.stop(t + 0.55);
  }

  lute(step = 0) {
    if (!this.ctx) return;
    const scale = [220, 246.9, 293.66, 329.6, 392, 440];
    const f = scale[step % scale.length];
    const t = this.ctx.currentTime;
    this._tone(t, 'triangle', f, f * 0.995, 1.3, 0.05, 0.4, 0.004);
    this._tone(t, 'sine', f * 2, f * 2, 0.7, 0.02, 0.4, 0.004);
  }

  crackle() {
    // one pop of a fireplace; caller repeats while nearby
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._burst(t, 0.03 + Math.random() * 0.05, 'bandpass', 900 + Math.random() * 1600, 1.5, 0.02 + Math.random() * 0.025, 0.06);
  }

  stagDrone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 55, 55, 6, 0.07, 0.7, 2);
    this._tone(t + 0.5, 'sine', 82.4, 82.4, 5, 0.045, 0.8, 1.5);
    [660, 880, 1108].forEach((f, i) => this._tone(t + 2 + i * 0.4, 'sine', f, f, 2.4, 0.02, 0.9, 0.6));
  }

  boneRattle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      this._burst(t + i * 0.06 + Math.random() * 0.03, 0.03, 'bandpass', 2100 + Math.random() * 900, 3, 0.02, 0.15, 1.6);
    }
  }

  peal() {
    // cascading bells for the dawn
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) {
      this._later(i * 1300 + Math.random() * 200, () => this.bell());
    }
  }

  songbirds() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const t0 = t + i * 0.28 + Math.random() * 0.1;
      const f = 2200 + Math.random() * 1400;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t0 + 0.09);
      o.connect(this._env(t0, 0.01, 0.04, 0.09, 0.022, 0.4));
      o.start(t0); o.stop(t0 + 0.2);
    }
  }

  tollDistant() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, base = 146.83;
    for (const [r, dur, amp] of [[1, 5, 0.05], [2.0, 3.5, 0.028], [2.98, 2.5, 0.016]]) {
      this._tone(t, 'sine', base * r, base * r, dur, amp, 0.9, 0.01);
    }
  }

  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 95, 42, 0.13, 0.08, 0.15);
    this._burst(t, 0.08, 'lowpass', 320, 0.8, 0.045, 0.08);
  }

  saddle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.22);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    o.connect(f).connect(this._env(t, 0.02, 0.08, 0.16, 0.035, 0.15));
    o.start(t); o.stop(t + 0.3);
    this._burst(t + 0.05, 0.06, 'bandpass', 700, 1.4, 0.02, 0.1);
  }

  click() {
    if (!this.ctx) return;
    this._burst(this.ctx.currentTime, 0.03, 'highpass', 2500, 1, 0.03, 0.05);
  }

  organ(on) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (on && !this._organ) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 2.8);
      g.connect(this.master);
      const send = c.createGain(); send.gain.value = 0.9;
      g.connect(send).connect(this.reverb);
      const oscs = [];
      for (const f of [73.42, 110.0, 146.83, 174.61, 220.0]) {
        for (const mul of [1, 2.001]) {
          const o = c.createOscillator(); o.type = 'sine';
          o.frequency.value = f * mul;
          const og = c.createGain(); og.gain.value = mul === 1 ? 0.5 : 0.22;
          o.connect(og).connect(g); o.start(t);
          oscs.push(o);
        }
      }
      this._organ = { g, oscs };
    } else if (!on && this._organ) {
      const { g, oscs } = this._organ;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      oscs.forEach(o => o.stop(t + 2.6));
      this._organ = null;
    }
  }

  gallopIntensity(v) {
    // hook kept for future surface mixing; volume handled per-clop
    this._gallop = clamp(v, 0, 1);
  }
}
