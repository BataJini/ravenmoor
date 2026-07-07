// Interaction targeting: every interactive thing registers itself; each
// frame we pick the best candidate near the camera's gaze and offer it
// to the HUD prompt. Forgiving by design — angle OR proximity wins.
import * as THREE from 'three';

const TO = new THREE.Vector3();
const DIR = new THREE.Vector3();

export class Interactions {
  constructor() {
    this.items = [];
    this.current = null;
  }

  // def: { pos, radius, maxDist, label(), action(),
  //        secondaryLabel?(), secondaryAction?(), dynamic?(playerPos, outPos) }
  register(def) {
    this.items.push(def);
    return def;
  }

  update(camera, playerPos) {
    camera.getWorldDirection(DIR);
    let best = null, bestScore = -Infinity;
    for (const it of this.items) {
      if (it.dynamic && !it.dynamic(playerPos, it.pos)) continue;
      const label = it.label();
      if (!label) continue;
      const d = it.pos.distanceTo(playerPos);
      if (d > it.maxDist) continue;
      TO.copy(it.pos).sub(camera.position).normalize();
      const cos = TO.dot(DIR);
      const near = d < it.radius + 0.7;
      if (cos < 0.78 && !near) continue;
      const score = cos * 2 - d * 0.18 + (near ? 0.5 : 0) + (it.priority || 0);
      if (score > bestScore) { bestScore = score; best = it; }
    }
    this.current = best;
    return best;
  }

  tryPrimary() {
    if (this.current && this.current.label()) {
      this.current.action();
      return true;
    }
    return false;
  }

  trySecondary() {
    if (this.current && this.current.secondaryLabel && this.current.secondaryLabel()) {
      this.current.secondaryAction();
      return true;
    }
    return false;
  }
}
