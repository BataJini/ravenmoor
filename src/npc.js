// The living (and less living) of Ravenmoor: Father Ossian, Mordecai the
// gravekeeper, Elke of the stables, and ghosts that will not be spoken to.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { TAU, range, damp, dampAngle, clamp } from './util.js';
import { haloTexture } from './builders.js';

const V = new THREE.Vector3();

class NPC {
  constructor(ctx, def) {
    this.ctx = ctx;
    this.def = def;
    this.pos = new THREE.Vector3(def.x, 0, def.z);
    this.yaw = Math.random() * TAU;
    this.state = 'idle';
    this.stateT = range(Math.random, 2, 5);
    this.target = new THREE.Vector3();
    this.speed = 0;
    this.walkT = 0;
    this.ghostFade = 1;
    this._build(def);

    if (!def.ghost || def.speak) {
      ctx.interact.register({
        pos: new THREE.Vector3(),
        radius: 1.7, maxDist: 3.4,
        dynamic: (playerPos, out) => {
          if (def.available && !def.available()) return false;
          out.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
          return true;
        },
        label: () => `Speak with ${def.name}`,
        action: () => {
          this.ctx.audio.murmur(def.voice, 1.2);
          const d = def.dialogue();
          this.ctx.ui.dialogue(def.title || def.name, d.lines, d.onDone);
          this.faceT = 4;
        }
      });
    }
  }

  _build(def) {
    const g = new THREE.Group();
    this.group = g;
    const cloakMat = new THREE.MeshLambertMaterial({ color: def.cloak });
    const skinMat = new THREE.MeshLambertMaterial({ color: def.skin || 0x8a7864 });
    if (def.ghost) {
      for (const m of [cloakMat, skinMat]) {
        m.transparent = true;
        m.opacity = 0.34;
        m.emissive = new THREE.Color(0x7fa8c0);
        m.emissiveIntensity = 0.5;
      }
    }
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 8), cloakMat);
    cloak.position.y = 0.75;
    cloak.castShadow = !def.ghost;
    g.add(cloak);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), cloakMat);
    shoulders.position.y = 1.4;
    shoulders.scale.set(1.1, 0.72, 0.85);
    g.add(shoulders);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 9, 7), skinMat);
    head.position.y = 1.58;
    g.add(head);
    if (def.hood !== false) {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.34, 7), cloakMat);
      hood.position.set(0, 1.66, -0.035);
      hood.rotation.x = -0.45;
      g.add(hood);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a22 }));
      hair.position.set(0, 1.64, -0.02);
      hair.scale.y = 0.8;
      g.add(hair);
    }
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.52, 0.075), cloakMat);
      arm.position.set(side * 0.27, 1.1, 0);
      arm.rotation.z = side * 0.16;
      g.add(arm);
      this.arms.push(arm);
    }
    if (def.stole) {
      const stole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.8, 0.02), new THREE.MeshLambertMaterial({ color: 0x6a5a20 }));
      stole.position.set(0.09, 1.05, 0.3);
      g.add(stole);
    }
    if (def.lantern) {
      const lant = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.13), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lant.material.color.setRGB(1.9, 1.25, 0.6);
      lant.position.set(0.34, 0.85, 0.12);
      g.add(lant);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture(), color: 0xffa050, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.position.copy(lant.position);
      halo.scale.setScalar(1.8);
      g.add(halo);
      this.lampSpot = this.ctx.addLamp(def.x, 1, def.z, 0xffa050, 6, 9, 8);
    }
    if (def.ghost) {
      this.cloakMat = cloakMat;
    }
    g.scale.setScalar(def.scale || 1);
    this.ctx.scene.add(g);
  }

  update(dt, player, time) {
    const { terrain } = this.ctx;
    const def = this.def;
    const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    // ghosts refuse company (unless they have something to say)
    if (def.ghost && !def.speak) {
      if (pd < 3 && this.ghostFade > 0.95) {
        this.ghostFade = 0.949;
        this.ctx.audio.ghostMurmur();
      }
      if (this.ghostFade < 1 && this.ghostFade > 0) {
        this.ghostFade -= dt * 0.8;
        if (this.ghostFade <= 0) {
          const a = Math.random() * TAU, r = def.home.r * (0.5 + Math.random() * 0.5);
          this.pos.set(def.home.x + Math.cos(a) * r, 0, def.home.z + Math.sin(a) * r);
          this.ghostFade = 0.001;
          this.state = 'idle';
          this.stateT = 2;
        }
      } else if (this.ghostFade < 1) {
        this.ghostFade = Math.min(1, this.ghostFade + dt * 0.4);
      }
      const vis = this.ghostFade > 0.9 ? 1 : this.ghostFade < 0.1 ? 0 : this.ghostFade;
      this.cloakMat.opacity = 0.34 * clamp(vis, 0, 1);
    }

    // simple wander inside the home circle
    this.stateT -= dt;
    if (this.faceT > 0) {
      this.faceT -= dt;
      this.speed = damp(this.speed, 0, 5, dt);
      this.yaw = dampAngle(this.yaw, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 4, dt);
    } else if (this.state === 'idle') {
      this.speed = damp(this.speed, 0, 4, dt);
      if (pd < 4.5 && !def.ghost) {
        this.yaw = dampAngle(this.yaw, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 2, dt);
      }
      if (this.stateT <= 0) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * def.home.r;
        this.target.set(def.home.x + Math.cos(a) * r, 0, def.home.z + Math.sin(a) * r);
        this.state = 'walk';
        this.stateT = 20;
      }
    } else {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8 || this.stateT <= 0) {
        this.state = 'idle';
        this.stateT = range(Math.random, 3, 9);
      } else {
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 2.5, dt);
        this.speed = damp(this.speed, def.ghost ? 0.7 : 1.05, 2, dt);
      }
    }

    if (this.speed > 0.02) {
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      this.walkT += dt * this.speed * 5;
    }
    this.pos.y = terrain.heightAt(this.pos.x, this.pos.z);

    const bob = def.ghost ? 0.12 + Math.sin(time * 1.1 + this.def.voice * 9) * 0.08
      : Math.abs(Math.sin(this.walkT)) * 0.05 * clamp(this.speed, 0, 1);
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = Math.sin(this.walkT) * 0.03 * clamp(this.speed, 0, 1);
    const swing = Math.sin(this.walkT) * 0.4 * clamp(this.speed, 0, 1);
    this.arms[0].rotation.x = swing;
    this.arms[1].rotation.x = -swing;

    if (this.lampSpot) {
      this.lampSpot.x = this.pos.x + Math.sin(this.yaw + 0.6) * 0.4;
      this.lampSpot.y = this.pos.y + 0.95;
      this.lampSpot.z = this.pos.z + Math.cos(this.yaw + 0.6) * 0.4;
    }
  }
}

export function buildNPCs(ctx, journal, quest) {
  const { terrain, interact, audio, ui, particles } = ctx;
  const npcs = [];

  // ---- quest items in the world ------------------------------------------
  const items = { shovel: false, shoe: false };

  // the rusted shovel, dropped by the well
  const shovel = new THREE.Group();
  const sy = terrain.heightAt(19.5, 25.5);
  shovel.position.set(19.5, sy, 25.5);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), new THREE.MeshLambertMaterial({ color: 0x4a3620 }));
  handle.rotation.z = 1.25;
  handle.position.y = 0.16;
  shovel.add(handle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 }));
  blade.position.set(0.62, 0.05, 0);
  shovel.add(blade);
  ctx.scene.add(shovel);
  interact.register({
    pos: new THREE.Vector3(19.5, sy + 0.4, 25.5),
    radius: 1.3, maxDist: 2.8,
    label: () => (!items.shovel && !journal.getFlag('shovelDone') && shovel.visible) ? 'Take the rusted shovel' : null,
    action: () => {
      items.shovel = true;
      shovel.visible = false;
      audio.click();
      ui.toast('You take the gravekeeper’s shovel. It smells of rain and patience.');
    }
  });

  // the lost horseshoe, glinting on the east road
  const shoe = new THREE.Group();
  const hy = terrain.heightAt(33, 3.2);
  shoe.position.set(33, hy + 0.05, 3.2);
  const shoeMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.035, 6, 12, Math.PI * 1.4),
    new THREE.MeshStandardMaterial({ color: 0x777d88, metalness: 0.85, roughness: 0.3 })
  );
  shoeMesh.rotation.x = -Math.PI / 2;
  shoe.add(shoeMesh);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), color: 0xbfd4e8, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glint.position.y = 0.2;
  glint.scale.setScalar(0.8);
  shoe.add(glint);
  ctx.scene.add(shoe);
  interact.register({
    pos: new THREE.Vector3(33, hy + 0.3, 3.2),
    radius: 1.3, maxDist: 2.8,
    label: () => (!items.shoe && !journal.getFlag('shoeDone') && shoe.visible) ? 'Pick up the horseshoe' : null,
    action: () => {
      items.shoe = true;
      shoe.visible = false;
      audio.click();
      ui.toast('A cold iron crescent. Lucky, supposedly.');
    }
  });

  // ---- Father Ossian --------------------------------------------------------
  npcs.push(new NPC(ctx, {
    name: 'Father Ossian', title: 'FATHER OSSIAN',
    x: -4, z: -36, home: { x: 0, z: -36, r: 8 },
    cloak: 0x2a2430, stole: true, voice: 0.32, scale: 1.04,
    dialogue: () => {
      if (quest.finaleDone) return {
        lines: [
          'You brought the morning back to Ravenmoor. I have buried many, but I have thanked very few.',
          'Walk the moor as long as you like. It is friendlier now — mostly.'
        ]
      };
      const left = quest.total - quest.count;
      if (left === 0) return {
        lines: ['They are all with you — I can hear them, like rain about to fall.', 'Ring the bell. Let them go home.']
      };
      return {
        lines: [
          `Thirteen of my parish never made it to rest. ${left} still wander tonight.`,
          'The old watchtower on the east hill sees every stray light on the moor. Climb it, if the stairs will hold you.',
          'And light a candle at the altar now and then. The flame keeps count better than I do.'
        ]
      };
    }
  }));

  // ---- Mordecai the gravekeeper --------------------------------------------
  npcs.push(new NPC(ctx, {
    name: 'Mordecai', title: 'MORDECAI, GRAVEKEEPER',
    x: 58, z: 6, home: { x: 60, z: 4, r: 10 },
    cloak: 0x33301f, lantern: true, voice: 0.71,
    dialogue: () => {
      if (journal.getFlag('shovelDone')) return {
        lines: ['The graves lie easier tonight. So do I.', 'Mind the angel. She cheats.']
      };
      if (items.shovel) return {
        lines: [
          'Ha! Me shovel! The old bones thank you, walker.',
          'A kindness for a kindness: the astronomer’s light drifts in the western woods, and the locksmith glimmers under the eastern pines.',
          'And if you find a little silver raven anywhere — keep it. There were six, once.'
        ],
        onDone: () => {
          journal.setFlag('shovelDone');
          journal.award('gravefriend');
          ui.toast('Journal updated — Mordecai’s kindness. (J)');
        }
      };
      return {
        lines: [
          'Evening, walker. Mind the mounds — they mind you back.',
          'Left me shovel by the well, fetching water I don’t drink anymore. Old habits.',
          'Bring it back and I’ll owe you a kindness. Gravekeepers pay their debts.'
        ]
      };
    }
  }));

  // ---- Elke of the stables ---------------------------------------------------
  npcs.push(new NPC(ctx, {
    name: 'Elke', title: 'ELKE, OF THE STABLES',
    x: -52, z: 16, home: { x: -53, z: 17, r: 7 },
    cloak: 0x3a3226, hood: false, voice: 0.18, scale: 0.94,
    dialogue: () => {
      if (journal.getFlag('raceWon')) return {
        lines: ['You outran the dead. Around here that’s a marketable skill.', 'Whistle any time — he likes you now. R, like “rider”.']
      };
      if (journal.getFlag('shoeDone')) return {
        lines: [
          'The pale one — Wraith — raced the post-riders when he lived. Never lost.',
          'Challenge him: ride up on a horse and press F on him at the graveyard gate. Beat him to the cathedral and he’ll answer your whistle forever.'
        ]
      };
      if (items.shoe) return {
        lines: [
          'That’s the one! Ashfall bows his thanks — or he would, if he had manners.',
          'Your horses will run truer now. And come back — I know a secret about the pale one worth racing for.'
        ],
        onDone: () => {
          journal.setFlag('shoeDone');
          journal.award('wellshod');
          ctx.gallopBoost = 1.15;
          ui.toast('The horses run truer now. (+15% gallop)');
        }
      };
      return {
        lines: [
          'Ashfall threw a shoe on the east road again. Third time this month.',
          'Find it for me? Iron doesn’t rust fast in this air — look for the glint past the crossroads.'
        ]
      };
    }
  }));

  // ---- ghosts ---------------------------------------------------------------
  npcs.push(new NPC(ctx, {
    name: 'a pale villager', ghost: true, voice: 0.5,
    x: -6, z: 6, home: { x: 0, z: 8, r: 14 }, cloak: 0xcfe0ea
  }));
  npcs.push(new NPC(ctx, {
    name: 'a thin shade', ghost: true, voice: 0.83,
    x: 20, z: -28, home: { x: 12, z: -24, r: 16 }, cloak: 0xd8e4ec
  }));

  // ---- the Old Bellringer, sealed in the Bone Chapel -------------------------
  npcs.push(new NPC(ctx, {
    name: 'The Old Bellringer', title: 'THE OLD BELLRINGER',
    ghost: true, speak: true, voice: 0.92,
    x: WORLD.crypt.x - 1.4, z: WORLD.crypt.z + 1.2,
    home: { x: WORLD.crypt.x - 1.4, z: WORLD.crypt.z + 1.2, r: 0.4 },
    cloak: 0xd8e4ec,
    available: () => journal.getFlag('cryptOpen'),
    dialogue: () => ({
      lines: [
        'Thirteen times I rang it, the night the mist came in. Twelve was never enough. Fourteen would have been rude.',
        'The crown they buried me with was dust before the coffin-wood was. Keep the little ravens instead — silver remembers weight.',
        quest.finaleDone
          ? 'You rang it true. I heard it all the way down here, and it sounded like morning.'
          : 'When the thirteen are gathered, ring it once and mean it. I will hear it from here.'
      ]
    })
  }));

  return {
    npcs,
    update(dt, player, time) {
      for (const n of npcs) n.update(dt, player, time);
    }
  };
}
