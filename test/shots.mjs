// Hero screenshots for visual review.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8130/?test=1');
await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 40000 });
const ev = (fn) => page.evaluate(fn);
const snap = async (name) => page.screenshot({ path: `test/shots/${name}.png` });

// 1 — spawn vista (night, fireflies, moon craters)
await ev(() => { const g = window.__game; g.teleport(-2, 46, -0.08, 0.03); g.step(2.5); });
await snap('final-spawn');

// 2 — orbiting souls while riding (collect 5 first)
await ev(() => {
  const g = window.__game;
  for (let i = 0; i < 5; i++) { g.collectNearestSoul(); g.step(0.5); }
  const nyx = g.horses().find(h => h.name === 'Nyx');
  g.teleport(nyx.x + 1, nyx.z, 0, 0);
  g.step(0.3);
  g.mountNearest();
  g.rideTo(0, 18, Math.PI - 0.2);
  g.setKeys({ w: true });
  g.step(1.2);
  g.setKeys({ w: false });
  g.step(0.6);
});
await snap('final-souls-riding');

// 3 — altar with light shafts
await ev(() => { const g = window.__game; g.dismount(); g.teleport(0, -60, 0, 0.06); g.step(1.2); });
await snap('final-nave');

// 4 — tavern interior
await ev(() => { const g = window.__game; g.teleport(-13.2, 39.5, 2.6, 0.04); g.step(1.2); });
await snap('final-tavern');

// 5 — Mordecai with his lantern among the graves
await ev(() => {
  const g = window.__game;
  const m = g.npcs().find(n => n.name === 'Mordecai');
  g.teleport(m.x, m.z + 3.5, 0, 0.03);
  g.step(0.8);
});
await snap('final-mordecai');

await browser.close();
console.log('shots done');
