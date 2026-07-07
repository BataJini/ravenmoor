// RAVENMOOR headless regression: full game arc including Act II systems.
// Usage: node test/run.mjs [--shots]
import { chromium } from 'playwright';

const URL = 'http://localhost:8130/?test=1';
const SHOTS = process.argv.includes('--shots');
const results = [];
const check = (name, pass, info = '') => {
  results.push({ name, pass: !!pass, info: String(info) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--mute-audio']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));

await page.goto(URL);
await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 40000 });
const ev = (fn) => page.evaluate(fn);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `test/shots/${name}.png` }); };

// ---------- boot ----------
const boot = await ev(() => ({ errors: window.__errors, gl: window.__game.gl() }));
check('boot clean', boot.errors.length === 0, boot.gl);

// ---------- movement ----------
let r = await ev(() => {
  const g = window.__game;
  g.teleport(0, 20, 0, 0);
  g.setKeys({ w: true, shift: true });
  g.step(3);
  g.setKeys({ w: false, shift: false });
  return g.pos();
});
check('sprint ~20m in 3s', 20 - r.z > 16 && 20 - r.z < 24, `dz=${(20 - r.z).toFixed(1)}`);

// ---------- door + interior ----------
r = await ev(() => {
  const g = window.__game;
  g.teleport(0, -38.6, 0, 0);
  g.step(0.2);
  g.press('e');
  g.step(1.6);
  const doorOpen = g.state().doorOpen;
  g.setKeys({ w: true });
  g.step(3);
  g.setKeys({ w: false });
  return { doorOpen, pos: g.pos() };
});
check('cathedral door opens + entry', r.doorOpen && r.pos.z < -45 && Math.abs(r.pos.y - 0.45) < 0.05, JSON.stringify(r.pos));

// A helper injected into the page: stand 1.7m from a live NPC, face them,
// talk, and click through n dialogue lines.
await ev(() => {
  const panelEl = () => document.getElementById('panel');
  window.__closeAll = () => {
    panelEl().classList.remove('on');
    document.getElementById('journal').classList.remove('on');
  };
  window.__talkTo = (name, presses = 8) => {
    const g = window.__game;
    window.__closeAll();
    const n = g.npcs().find(x => x.name === name);
    if (!n) return { ok: false, why: 'no npc' };
    // stand south of them, facing north at them
    const px = n.x, pz = n.z + 1.7;
    const yaw = Math.atan2(-(n.x - px), -(n.z - pz));
    g.teleport(px, pz, yaw, 0.05);
    g.step(0.4);
    const prompt = document.getElementById('prompt').textContent;
    g.press('e');
    g.step(0.3);
    const open = panelEl().classList.contains('on');
    const title = document.getElementById('panel-title').textContent;
    let closed = !open;
    for (let i = 0; i < presses && !closed; i++) {
      g.press('e');
      g.step(0.25);
      closed = !panelEl().classList.contains('on');
    }
    return { ok: open && closed, prompt, title };
  };
});

// ---------- NPC dialogue (Father Ossian) ----------
r = await ev(() => window.__talkTo('Father Ossian'));
check('Ossian dialogue', r.ok && /OSSIAN/.test(r.title), `${r.prompt} | ${r.title}`);

// ---------- shovel quest ----------
r = await ev(() => {
  const g = window.__game;
  window.__closeAll();
  g.teleport(19.5, 26.9, 0, 0.35);   // south of the shovel, facing it
  g.step(0.4);
  const p1 = document.getElementById('prompt').textContent;
  g.press('e'); g.step(0.3);
  const talk = window.__talkTo('Mordecai', 6);
  return { p1, talk, flags: g.state().flags, ach: g.state().achievements };
});
check('shovel quest', r.flags.shovelDone && r.ach.includes('gravefriend'), `${r.p1} | ${JSON.stringify(r.talk)}`);

// ---------- horseshoe quest ----------
r = await ev(() => {
  const g = window.__game;
  window.__closeAll();
  g.teleport(33, 4.8, 0, 0.5);        // south of the horseshoe, facing it
  g.step(0.4);
  const p1 = document.getElementById('prompt').textContent;
  g.press('e'); g.step(0.3);
  const talk = window.__talkTo('Elke', 6);
  return { p1, talk, flags: g.state().flags };
});
check('horseshoe quest', r.flags.shoeDone, `${r.p1} | ${JSON.stringify(r.talk)}`);

// ---------- ravens (well roof + gatepost) ----------
r = await ev(() => {
  const g = window.__game;
  window.__closeAll();
  g.teleport(15.4, 21.4, -0.5, 1.0);
  g.step(0.4);
  const p1 = document.getElementById('prompt').textContent;
  g.press('e'); g.step(0.3);
  g.teleport(41, -1.6, -1.57, 0.8);
  g.step(0.4);
  g.press('e'); g.step(0.3);
  return { p1, ravens: g.state().ravens };
});
check('ravens collectible', r.ravens >= 1, `ravens=${r.ravens} (${r.p1})`);

// ---------- tavern ----------
r = await ev(() => {
  const g = window.__game;
  g.teleport(-13, 40.5, Math.PI * 0.9, 0);
  g.setKeys({ w: true });
  g.step(1.6);
  g.setKeys({ w: false });
  g.step(0.3);
  return { pos: g.pos(), prompt: document.getElementById('prompt').textContent };
});
await shot('tavern');
check('tavern enterable', Math.abs(r.pos.x + 14) < 6 && Math.abs(r.pos.z - 38) < 6, JSON.stringify(r));

// ---------- watchtower survey ----------
r = await ev(() => {
  const g = window.__game;
  window.__closeAll();
  g.teleport(56, -33, 0.6, 0.15);
  g.step(0.5);
  const prompt = document.getElementById('prompt').textContent;
  g.press('e');
  g.step(0.5);
  return { prompt, toast: document.getElementById('toast').textContent };
});
check('watchtower survey', /Survey|survey/.test(r.prompt) || /light|pillar|moor/.test(r.toast), r.toast);

// ---------- locket -> crypt -> Bellringer ----------
r = await ev(() => {
  const g = window.__game;
  window.__closeAll();
  // mausoleum door + chest
  g.teleport(70.8, 9, -1.57, 0.1);
  g.step(0.4);
  g.press('e'); g.step(1.2);           // open mausoleum
  g.setKeys({ w: true }); g.step(1.2); g.setKeys({ w: false });
  g.teleport(74.6, 9, 1.57, 0.2);
  g.step(0.3);
  g.press('e'); g.step(0.5);           // chest -> locket
  const flags1 = g.state().flags;
  // the Bone Chapel (door faces east; approach from the east, facing west)
  g.teleport(-14.4, -90, 1.57, 0.05);
  g.step(0.4);
  const p1 = document.getElementById('prompt').textContent;
  g.press('e'); g.step(1.4);
  const flags2 = g.state().flags;
  g.setKeys({ w: true }); g.step(1.4); g.setKeys({ w: false });
  g.step(0.5);
  const inside = g.pos();
  const talk = window.__talkTo('The Old Bellringer', 5);
  return { flags1, flags2, p1, inside, talk };
});
check('locket unlocks Bone Chapel', r.flags1.locket && r.flags2.cryptOpen, `${r.p1} | inside: ${JSON.stringify(r.inside)}`);
check('Bellringer waits inside', r.talk.ok && /BELLRINGER/.test(r.talk.title), JSON.stringify(r.talk));

// ---------- the race ----------
r = await ev(async () => {
  const g = window.__game;
  window.__closeAll();
  const nyx = g.horses().find(h => h.name === 'Nyx');
  g.teleport(nyx.x + 1, nyx.z, 0, 0);
  g.step(0.3);
  const mounted = g.mountNearest();
  const w = g.horses().find(h => h.name === 'Wraith');
  g.rideTo(w.x + 2.5, w.z, Math.atan2(w.x - (w.x + 2.5), w.z - w.z));
  g.step(0.4);
  const prompt = document.getElementById('prompt').textContent;
  g.press('e');
  g.step(4.5);                          // countdown
  const midState = g.state().race;
  // ride the gates via rideTo cheats
  const gates = [[30, 4], [0, 10], [-30, 12], [-2, 24], [16, 22], [0, -30], [0, -34]];
  for (const [x, z] of gates) {
    g.rideTo(x, z, 0);
    g.step(0.5);
  }
  const st = g.state();
  return { prompt, mounted, midState, race: st.race, flags: st.flags, ach: st.achievements };
});
check('race vs Wraith', r.flags.raceWon && r.ach.includes('outrun'), `mounted=${r.mounted} prompt="${r.prompt}" mid=${r.midState}`);

// ---------- whistle ----------
r = await ev(async () => {
  const g = window.__game;
  g.dismount();
  g.teleport(0, 30, 0, 0);
  g.step(0.3);
  g.press('r');
  g.step(0.2);
  await new Promise(res => setTimeout(res, 900));
  g.step(0.5);
  const w = g.horses().find(h => h.name === 'Wraith');
  return { d: Math.hypot(w.x - 0, w.z - 30).toFixed(1) };
});
check('whistle summons Wraith', Number(r.d) < 12, `dist=${r.d}`);

// ---------- souls, well, bell, dawn ----------
r = await ev(async () => {
  const g = window.__game;
  window.__closeAll();
  // sweep until every visible soul is gathered (retries cover timing wobbles)
  for (let i = 0; i < 16; i++) {
    if (!g.collectNearestSoul()) break;
    g.step(0.6);
  }
  g.teleport(14.5, 21, -1.1, 0.05);
  g.step(0.3);
  g.press('e');
  g.step(0.2);
  await new Promise(res => setTimeout(res, 1900));
  g.step(2.5);
  g.teleport(16, 22, 0, 0);
  g.step(2);
  const souls = g.state().souls;
  const left = g.soulsLeft();
  g.ringBell();
  g.step(10);
  const mid = g.state();
  g.step(40);
  const end = g.state();
  return { souls, left, midMood: mid.moodT, endMood: end.moodT, finale: end.finaleDone, errors: end.errors };
});
check('13 souls gathered', r.souls === 13, JSON.stringify(r.left));
check('finale completes', r.finale === true);
check('dawn breaks', r.endMood > 0.9, `mood ${r.midMood} -> ${r.endMood}`);
await ev(() => { window.__game.teleport(-4, 44, -0.1, 0.03); window.__game.step(1); });
await shot('dawn');

// ---------- perf ----------
const bench = await ev(() => {
  const g = window.__game;
  g.teleport(0, 40, 0, 0.02);
  g.step(0.3);
  return g.bench(30);
});
console.log('BENCH (SwiftShader — CI only, real GPU is ~10x faster):', JSON.stringify(bench));

const errs = await ev(() => window.__errors);
check('zero runtime errors', errs.length === 0 && pageErrors.length === 0, JSON.stringify([...errs, ...pageErrors].slice(0, 4)));

await browser.close();
const failed = results.filter(x => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
