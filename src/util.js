// Math helpers, seeded RNG, and the shared collision world.
export const TAU = Math.PI * 2;

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (rng, a, b) => a + rng() * (b - a);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Frame-rate independent exponential approach.
export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(cur, target, lambda, dt) {
  return cur + angleDelta(cur, target) * (1 - Math.exp(-lambda * dt));
}

// ---------------------------------------------------------------------------
// Collision world: static circles and wall segments on the XZ plane.
// Movers call resolveCollisions() to get pushed out of solids.
// ---------------------------------------------------------------------------
const circles = [];   // { x, z, r, on }
const segs = [];      // { x1, z1, x2, z2, r, on }

export function addCircle(x, z, r) {
  const c = { x, z, r, on: true };
  circles.push(c);
  return c;
}

export function addSeg(x1, z1, x2, z2, r) {
  const s = { x1, z1, x2, z2, r, on: true };
  segs.push(s);
  return s;
}

export function resolveCollisions(pos, radius) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of circles) {
      if (!c.on) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (min - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
    for (const s of segs) {
      if (!s.on) continue;
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const wx = pos.x - s.x1, wz = pos.z - s.z1;
      const len2 = vx * vx + vz * vz;
      const t = len2 > 1e-8 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
      const px = s.x1 + vx * t, pz = s.z1 + vz * t;
      const dx = pos.x - px, dz = pos.z - pz;
      const min = s.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (min - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
  }
}

// Distance from point to polyline (used for path detection / footstep sound).
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const vx = x2 - x1, vz = z2 - z1;
    const wx = x - x1, wz = z - z1;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 1e-8 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
    const dx = x - (x1 + vx * t), dz = z - (z1 + vz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}
