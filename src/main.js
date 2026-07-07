// RAVENMOOR — assembly, staged boot, and the main loop.
import * as THREE from 'three';
import { makeRng, clamp } from './util.js';
import { WORLD } from './layout.js';
import { AudioEngine } from './audio.js';
import { Particles } from './particles.js';
import { Sky, MOON_DIR } from './sky.js';
import { Terrain } from './terrain.js';
import { buildCathedral } from './cathedral.js';
import { buildGraveyard } from './graveyard.js';
import { buildProps } from './props.js';
import { Horses } from './horse.js';
import { Birds } from './crows.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Interactions } from './interact.js';
import { Quest } from './quest.js';
import { UI } from './ui.js';
import { Journal } from './journal.js';
import { buildNPCs } from './npc.js';
import { buildDistricts } from './buildings2.js';
import { Race } from './race.js';
import { Mood } from './mood.js';

// ---------- error capture (read by the automated tests) ----------
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SEED = Number(params.get('seed') || 7);

// lightweight diagnostics -> server diag.log (only meaningful events)
let diagCount = 0;
const DIAG = (ev, info = {}) => {
  if (TEST || diagCount++ > 80) return;
  try {
    navigator.sendBeacon('/diag', JSON.stringify({ t: new Date().toISOString(), ev, ...info }));
  } catch { /* no server */ }
};
DIAG('boot', { ua: navigator.userAgent, dpr: devicePixelRatio });

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x161e2a, 0.0088);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 900);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0x3a4a63, 0x141821, 1.0);
hemi.userData.base = 1.0;
scene.add(hemi);
// faint lift so interiors and moon-shadowed faces never crush to pure black
const amb = new THREE.AmbientLight(0x39455e, 2.2);
scene.add(amb);
const moon = new THREE.DirectionalLight(0x93accc, 3.2);
moon.userData.base = 3.2;
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -60;
moon.shadow.camera.right = 60;
moon.shadow.camera.top = 60;
moon.shadow.camera.bottom = -60;
moon.shadow.camera.near = 20;
moon.shadow.camera.far = 420;
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.6;
scene.add(moon);
scene.add(moon.target);

// brief slow-motion for big moments
let timeScale = 1;
const slowmo = (v = 0.32) => { timeScale = Math.min(timeScale, v); };

// ---------- pooled point lights ----------
// A fixed pool of 6 point lights is reassigned each frame to the nearest
// lit lamp positions: constant light count (no shader recompiles), bounded
// per-pixel lighting cost on integrated GPUs.
const lampSpots = [];
const addLamp = (x, y, z, color, intensity, distance, speed = 0) => {
  const s = {
    x, y, z, color: new THREE.Color(color), base: intensity,
    distance, speed, on: true, t: Math.random() * 20, _d: 0
  };
  lampSpots.push(s);
  return s;
};
const POOL_N = 6;
const lightPool = [];
for (let i = 0; i < POOL_N; i++) {
  const l = new THREE.PointLight(0xffffff, 0, 10, 2);
  scene.add(l);
  lightPool.push(l);
}
const activeSpots = [];
function updateLamps(dt) {
  const cp = camera.position;
  activeSpots.length = 0;
  for (const s of lampSpots) {
    if (!s.on) continue;
    const dx = s.x - cp.x, dy = s.y - cp.y, dz = s.z - cp.z;
    s._d = dx * dx + dy * dy + dz * dz;
    if (s._d < 3600) activeSpots.push(s);
  }
  activeSpots.sort((a, b) => a._d - b._d);
  for (let i = 0; i < POOL_N; i++) {
    const l = lightPool[i];
    const s = activeSpots[i];
    if (!s) { l.intensity = 0; continue; }
    s.t += dt * s.speed * 0.42;
    const f = s.speed > 0
      ? 0.74 + 0.26 * (0.6 * Math.sin(s.t * 2.3) + 0.4 * Math.sin(s.t * 6.1 + 1.7) + 1) / 2
      : 1;
    l.position.set(s.x, s.y, s.z);
    l.color.copy(s.color);
    l.distance = s.distance;
    l.intensity = s.base * f;
  }
}

// ---------- shared systems ----------
const rng = makeRng(SEED);
const audio = new AudioEngine();
const ui = new UI();
const input = new Input(TEST);
const interact = new Interactions();
const particles = new Particles(scene);

const ctx = {
  scene, rng, terrain: null, interact, audio, particles, ui, addLamp,
  onMount: null, onCoin: null, onLocket: null, onBoundary: null,
  noticeText: null, candlePrayer: null, onEpitaph: null, onPet: null,
  gallopBoost: 1, questRef: null
};

let terrain, sky, cathedral, graveyard, props, horses, player, quest, birds;
let journal, npcs, districts, race, mood;
const mistSources = [];

// ---------- quality ----------
let quality = 1;
let autoQualityDone = TEST;
function applyQuality(q) {
  quality = q;
  const dpr = window.devicePixelRatio || 1;
  const pr = [0.72, 1.0, Math.min(1.35, dpr)][q];
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  const shadowSize = [1024, 1536, 2048][q];
  if (moon.shadow.mapSize.x !== shadowSize) {
    moon.shadow.mapSize.set(shadowSize, shadowSize);
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  }
  terrain.setGrassCount([260, 560, 900][q]);
  ui.setQualityLabel(q);
  return q;
}

// ---------- pause / menu / fullscreen ----------
let playing = false;
let fsTransitionAt = -1e9;
function toggleFullscreen() {
  fsTransitionAt = performance.now();
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  } catch { /* older browsers */ }
}
ui.onFullscreen = toggleFullscreen;
ui.onResume = () => { ui.hidePause(); input.lock(renderer.domElement); };
ui.onQuality = () => { autoQualityDone = true; return applyQuality((quality + 1) % 3); };
ui.onSound = () => { audio.setMuted(!audio.muted); return audio.muted; };
ui.onBob = () => { player.viewBob = !player.viewBob; return player.viewBob; };
input.diag = DIAG;
input.onLockChange = (locked) => {
  DIAG('lock-change', { locked });
  if (!locked && playing && !TEST) {
    // fullscreen transitions (V) drop the lock too — we re-grab it instead
    const fsTransition = performance.now() - fsTransitionAt < 1200 || document.fullscreenElement;
    if (!fsTransition) ui.showPause();
  }
};
// If the browser refuses pointer lock (blocked permission, odd embedder),
// fall back to hold-and-drag mouselook so the game stays fully playable.
input.onLockError = (n, everLocked) => {
  DIAG('lock-error', { n, everLocked });
  // Only fall back if native capture has NEVER worked this session —
  // a browser that locked once can always lock again.
  if (!everLocked && n >= 3 && !input.dragLook) {
    input.dragLook = true;
    ui.setMouseModeLabel(true);
    ui.toast('Your browser is refusing mouse capture — switching to drag-look. (To fix capture: click the icon by the address bar → allow “Use your mouse”, then reload.)', 9000);
    DIAG('draglook-on', {});
  }
};
ui.onMouseMode = () => {
  input.dragLook = !input.dragLook;
  if (!input.dragLook) input.lock(renderer.domElement);
  else if (document.pointerLockElement) document.exitPointerLock();
  return input.dragLook;
};
renderer.domElement.addEventListener('click', () => {
  if (playing && !input.locked && !ui.isPaused() && !input.dragLook) input.lock(renderer.domElement);
});
// entering or leaving fullscreen drops the pointer lock — take it back
document.addEventListener('fullscreenchange', () => {
  if (playing && !ui.isPaused() && !TEST) {
    setTimeout(() => input.lock(renderer.domElement), 150);
  }
});

function begin() {
  playing = true;
  ui.begin();
  if (TEST) ui.showFps();
  else setTimeout(() => ui.toast('A notice flutters on the parish board nearby…', 5200), 2600);
}

// ---------- ambient event director ----------
let owlT = 14 + rng() * 20;
let wolfT = 45 + rng() * 60;
let lightningT = 24 + rng() * 30;
let thunderIn = -1;
let tollT = 90 + rng() * 90;

// ---------- stats ----------
const frameTimes = [];
let statAcc = 0;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- main loop ----------
const clock = new THREE.Clock();
let time = 0;
let frameNo = 0;
const CHEST = new THREE.Vector3();
let ready = false;

function simulate(dt) {
  time += dt;

  if (playing && !ui.isPaused()) {
    player.update(dt);
    horses.update(dt, player, input);
    cathedral.update(dt, time);
    graveyard.update(dt, player, camera);
    props.update(dt);
    birds.update(dt, player.pos);
    npcs.update(dt, player, time);
    districts.update(dt, player, time);
    race.update(dt, time);
    CHEST.copy(player.pos).y += 1.2;
    quest.update(dt, CHEST, time);

    // interactions & prompt
    const target = interact.update(camera, CHEST);
    ui.prompt(
      target ? target.label() : null,
      target && target.secondaryLabel ? target.secondaryLabel() : null
    );

    if (ui.isPanelOpen()) {
      if (input.pressed('e')) {
        const wasDialogue = !!ui._dlg;
        ui.advancePanel();
        if (wasDialogue && ui._dlg) audio.murmur(0.2 + Math.random() * 0.6, 1.1);
      }
    } else if (input.pressed('e')) {
      if (!interact.tryPrimary() && player.mode === 'ride') player.dismount();
    }
    if (input.pressed('f')) interact.trySecondary();
    if (input.pressed('q') && player.mode === 'ride') player.dismount();
    if (input.pressed('j')) {
      ui.toggleJournal(journal.html({ souls: quest.count, total: quest.total, finaleDone: quest.finaleDone }));
    }
    if (input.pressed('r')) race.whistle();
    if (input.pressed('h')) {
      ui.panel('THE WAYS OF THE MOOR',
        'WASD to walk · SHIFT to run or gallop · SPACE to jump · E to interact · F to pet or challenge · Q to dismount · J for the journal · R to whistle (once earned) · V for fullscreen.');
    }
    if (input.pressed('f3')) ui.toggleFps();
    if (input.pressed('v')) toggleFullscreen();
    // with pointer lock inactive (drag-look), ESC must open the menu itself
    if (input.pressed('esc') && !input.locked && !TEST && !ui.isPaused()) {
      if (ui.isPanelOpen()) ui.closePanel();
      else if (ui.isJournalOpen()) ui.closeJournal();
      else ui.showPause();
    }

    // ambient events (the night's repertoire fades with the dawn)
    const nightK = 1 - (mood ? mood.t : 0);
    owlT -= dt;
    if (owlT <= 0) {
      owlT = 25 + rng() * 40;
      if (nightK > 0.5) audio.owl(); else audio.songbirds();
    }
    wolfT -= dt;
    if (wolfT <= 0) {
      wolfT = 60 + rng() * 90;
      if (nightK > 0.5) audio.wolf();
    }
    lightningT -= dt;
    if (lightningT <= 0) {
      lightningT = 26 + rng() * 44;
      if (nightK > 0.4) {
        sky.lightning();
        thunderIn = 1.1 + rng() * 1.8;
      }
    }
    if (thunderIn > 0) {
      thunderIn -= dt;
      if (thunderIn <= 0) { audio.thunder(); thunderIn = -1; }
    }
    tollT -= dt;
    if (tollT <= 0) { tollT = 170 + rng() * 120; audio.tollDistant(); }

    ui.setCompass(player.mode === 'ride' ? player.horse.yaw + Math.PI : player.yaw);
    const hintable = !TEST && !input.locked && !ui.isPaused() && !ui.isPanelOpen() && !ui.isJournalOpen();
    ui.clickHint(hintable && (!input.dragLook || time < 14), input.dragLook);
  }

  updateLamps(dt);
  particles.update(dt);
  sky.update(dt, camera.position);
  if (mood) mood.update(dt);
  const flashK = 1 - (mood ? mood.t : 0);
  moon.intensity = moon.userData.base + sky.flash * 2.6 * flashK;
  hemi.intensity = hemi.userData.base + sky.flash * 0.8 * flashK;

  // shadow frustum follows the player on a snapped grid (no shimmer)
  const DIR = mood ? mood.lightDir : MOON_DIR;
  const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
  const sx = Math.round(px / 8) * 8;
  const sz = Math.round(pz / 8) * 8;
  moon.position.set(sx + DIR.x * 170, DIR.y * 170, sz + DIR.z * 170);
  moon.target.position.set(sx, 0, sz);

  input.endFrame();
}

function frame() {
  requestAnimationFrame(frame);
  const raw = clamp(clock.getDelta(), 0.0001, 0.05);
  timeScale = timeScale + (1 - timeScale) * Math.min(1, raw * 2.4);
  simulate(raw * timeScale);

  // shadows refresh on a cadence tied to quality (halves iGPU shadow cost)
  frameNo++;
  if (frameNo % [3, 2, 1][quality] === 0) renderer.shadowMap.needsUpdate = true;

  renderer.render(scene, camera);

  // stats
  frameTimes.push(raw * 1000);
  if (frameTimes.length > 240) frameTimes.shift();
  statAcc += raw;
  if (statAcc > 0.5) {
    statAcc = 0;
    const s = stats();
    ui.setFps(`${s.fps} fps\n${s.calls} calls · ${(s.triangles / 1000).toFixed(0)}k tris`);
    // Auto-quality only judges honest frames (focused, visible window —
    // otherwise the browser throttles rAF and the numbers lie).
    if (!autoQualityDone && time > 9 && document.visibilityState === 'visible' && document.hasFocus()) {
      autoQualityDone = true;
      if (s.fps < 32 && quality > 0) { applyQuality(quality - 1); ui.toast('The mist thickens to spare your lantern. (Quality lowered)'); }
      else if (s.fps > 54 && quality < 2) applyQuality(quality + 1);
    }
  }
  if (!ready) {
    ready = true;
    if (window.__game) window.__game.ready = true;
  }
}

function stats() {
  const n = frameTimes.length || 1;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / n;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  return {
    fps: Math.round(1000 / avg),
    ms: +avg.toFixed(2),
    p95: +p95.toFixed(2),
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles
  };
}

// ---------- staged boot (feeds the loading screen) ----------
const loadEl = document.getElementById('load-status');
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
async function stage(label) {
  if (loadEl) loadEl.textContent = label;
  await nextFrame();
}

(async function boot() {
  await stage('Unrolling the moor…');
  terrain = new Terrain(scene, rng);
  ctx.terrain = terrain;
  sky = new Sky(scene, rng);

  await stage('Raising the cathedral…');
  cathedral = buildCathedral(ctx);

  await stage('Digging the graves…');
  graveyard = buildGraveyard(ctx);

  await stage('Lighting the lamps…');
  props = buildProps(ctx);

  await stage('Waking the horses…');
  horses = new Horses(ctx);
  player = new Player(camera, terrain, audio, ui, input, horses);
  journal = new Journal(ui, audio, !TEST);

  await stage('Counting thirteen souls…');
  quest = new Quest({
    scene, terrain, particles, audio, ui,
    slowmo,
    onMilestone: () => { sky.flash = Math.max(sky.flash, 0.4); },
    onSoul: (count) => {
      if (count === 1) journal.award('firstlight');
      if (count === 7) journal.award('halfparish');
    },
    onDawn: () => { mood.begin(audio, mistSources); journal.award('thirteenth'); },
    onFinaleDone: () => { /* the dawn carries on by itself */ }
  }, !TEST);
  ctx.questRef = quest;
  const perches = [...graveyard.perches, ...terrain.treeTops.map(t => new THREE.Vector3(t.x, t.y, t.z))];
  birds = new Birds(ctx, perches);

  await stage('Opening the tavern…');
  districts = buildDistricts(ctx, journal, player);

  await stage('Waking the parish…');
  npcs = buildNPCs(ctx, journal, quest);
  race = new Race(ctx, journal, horses, player);
  mood = new Mood(scene, sky, moon, hemi, amb);

  ctx.playerRef = player;
  ctx.onMount = (h) => {
    player.ride(h);
    ui.toast(h.ghost ? 'Wraith bears you gladly. The cold does not.' : `You swing into ${h.name}’s saddle.`);
  };
  ctx.onCoin = () => quest.freeWellSoul();
  ctx.noticeText = () => quest.noticeText();
  ctx.candlePrayer = () => quest.candlePrayer();
  ctx.onEpitaph = () => journal.readEpitaph();
  ctx.onPet = (name) => journal.pet(name);
  ctx.onLocket = () => { journal.setFlag('locket'); journal.award('sexton'); };
  cathedral.onRing = () => {
    journal.award('bellringer');
    quest.onBell();
    birds.scareAll(new THREE.Vector3(WORLD.cathedral.x, 2, WORLD.cathedral.z), 90);
  };

  // ground mist beds
  for (const [mx, mz, mr] of [
    [63, 1, 16], [0, 8, 10], [0, -92, 12], [-44, -46, 12],
    [46, -42, 10], [16, 22, 6], [-56, 38, 9], [0, -40, 9]
  ]) {
    mistSources.push(particles.groundMist(mx, mz, mr, (x, z) => terrain.heightAt(x, z)));
  }
  // fireflies among the trees
  for (const [fx2, fz2, fr] of [[12, -12, 6], [30, 20, 5], [-14, 58, 6], [48, 14, 5], [-34, -18, 6]]) {
    particles.fireflies(fx2, fz2, fr, (x, z) => terrain.heightAt(x, z));
  }

  // returning after the bell: the moor wakes already at dawn
  if (quest.finaleDone) mood.instant(mistSources);

  applyQuality(Number(params.get('q') ?? 1));

  // ---------- test API ----------
  window.__game = {
    ready: false,
    stats,
    pos: () => ({ x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2) }),
    state: () => ({
      mode: player.mode,
      riding: player.horse ? player.horse.name : null,
      souls: quest.count,
      doorOpen: cathedral.doorState.open,
      finaleDone: quest.finaleDone,
      quality,
      moodT: +mood.t.toFixed(2),
      race: race.state,
      flags: { ...journal.flags },
      achievements: [...journal.ach],
      ravens: journal.ravens.size,
      errors: window.__errors
    }),
    teleport: (x, z, yaw = 0, pitch = 0) => {
      if (player.mode === 'ride') player.dismount();
      player.pos.set(x, terrain.heightAt(x, z), z);
      player.vel.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = pitch;
    },
    setKeys: (m) => input.testSetKeys(m),
    press: (k) => input.testPress(k),
    // Advance the simulation in fixed ticks, immune to rAF throttling.
    step: (seconds = 1) => {
      const dtFix = 1 / 60;
      const n = Math.min(7200, Math.round(seconds / dtFix));
      for (let i = 0; i < n; i++) simulate(dtFix);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      return { pos: window.__game.pos(), state: window.__game.state() };
    },
    mountNearest: () => {
      const h = horses.nearestRideable(player.pos, 6);
      if (h) { player.ride(h); return h.name; }
      return null;
    },
    dismount: () => player.dismount(),
    ringBell: () => cathedral.ringBell(),
    openDoor: () => { if (!cathedral.doorState.open) cathedral.doorState.open = true; },
    collectNearestSoul: () => {
      if (player.mode === 'ride') player.dismount();
      let best = null, bd = 1e9;
      for (const s of quest.souls) {
        if (s.collected || s.hidden) continue;
        const d = s.group.position.distanceTo(player.pos);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) { player.pos.set(best.def.x, terrain.heightAt(best.def.x, best.def.z), best.def.z); return best.def.id; }
      return null;
    },
    setQuality: (q) => applyQuality(q),
    horses: () => horses.list.map(h => ({ name: h.name, x: +h.pos.x.toFixed(1), z: +h.pos.z.toFixed(1), yaw: +h.yaw.toFixed(2), ridden: h.ridden, state: h.state })),
    npcs: () => npcs.npcs.map(n => ({ name: n.def.name, x: +n.pos.x.toFixed(1), z: +n.pos.z.toFixed(1) })),
    soulsLeft: () => quest.souls.filter(s => !s.collected).map(s => ({ id: s.def.id, hidden: s.hidden })),
    soulsState: () => quest.souls.map(s => ({ id: s.def.id, collected: s.collected, hidden: s.hidden })),
    rideTo: (x, z, yaw = 0) => {
      if (player.mode !== 'ride') return false;
      player.horse.pos.set(x, terrain.heightAt(x, z), z);
      player.horse.yaw = yaw;
      return true;
    },
    freeWell: () => quest.freeWellSoul(),
    gl: () => {
      const glctx = renderer.getContext();
      const dbg = glctx.getExtension('WEBGL_debug_renderer_info');
      return dbg ? glctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    },
    // True GPU frame cost, immune to rAF throttling: render n frames
    // back-to-back with a forced 1px readback sync after each.
    bench: (n = 50) => {
      const glctx = renderer.getContext();
      const pxb = new Uint8Array(4);
      const sync = () => glctx.readPixels(0, 0, 1, 1, glctx.RGBA, glctx.UNSIGNED_BYTE, pxb);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        sync();
      }
      const ms = (performance.now() - t0) / n;
      return {
        msPerFrame: +ms.toFixed(2),
        fpsEquivalent: Math.round(1000 / ms),
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles
      };
    }
  };

  await stage('The parish is ready.');
  document.getElementById('loading').classList.add('off');
  document.getElementById('fade').style.opacity = '0';   // reveal the title

  if (TEST) {
    begin();
  } else {
    ui.showTitle(() => {
      audio.start();
      input.lock(renderer.domElement);
      begin();
    });
  }

  frame();
})();
