// The map of Ravenmoor. Every site, path, and terrain flattening pad
// lives here so terrain, buildings, and quests agree on geography.
export const WORLD = {
  bounds: 118,                          // soft edge of the world (the mist)
  spawn: { x: 0, z: 40 },
  cathedral: { x: 0, z: -62 },          // portal faces +z, toward the spawn
  graveyard: { x: 63, z: 1, w: 46, d: 34 },  // fenced rectangle, gate on west side
  mausoleum: { x: 74, z: 9 },
  angel: { x: 56, z: -7 },
  stable: { x: -56, z: 12 },
  paddock: { x: -56, z: 38, w: 26, d: 20 },
  well: { x: 16, z: 22 },
  board: { x: 3.2, z: 36 },
  houses: [
    { x: -24, z: 18, rot: 0.45 },
    { x: 27, z: 36, rot: -0.7 },
    { x: -32, z: 54, rot: 0.15 },
    { x: 40, z: -24, rot: -1.1 }
  ],
  lamps: [
    { x: -2.6, z: 24 }, { x: 2.8, z: 2 }, { x: -2.6, z: -20 },
    { x: 22, z: 8 }, { x: -26, z: 12 }, { x: -3.6, z: 41 }
  ],
  trees: [
    { x: 12, z: -12, s: 1.15 }, { x: -14, z: -30, s: 1.0 }, { x: -34, z: -18, s: 1.25 },
    { x: 30, z: 20, s: 0.9 }, { x: 48, z: 14, s: 1.1 }, { x: 52, z: -12, s: 1.0 },
    { x: 70, z: -10, s: 1.3 }, { x: 76, z: 14, s: 0.95 }, { x: 56, z: 12, s: 1.05 },
    { x: -46, z: -42, s: 1.35 }, { x: -56, z: -30, s: 1.1 }, { x: -38, z: -52, s: 1.0 },
    { x: 40, z: -46, s: 1.2 }, { x: 52, z: -38, s: 1.05 }, { x: -12, z: 58, s: 1.1 },
    { x: -70, z: 0, s: 1.2 }, { x: 14, z: 52, s: 0.95 }, { x: 82, z: -18, s: 1.15 }
  ],
  souls: [
    // graveyard (5)
    { id: 's1', x: 52, z: -8, name: 'Edmund Grey' },
    { id: 's2', x: 68, z: -6, name: 'Agnes Moor' },
    { id: 's3', x: 72, z: 12, name: 'Mother Hollow' },
    { id: 's4', x: 56, z: 10, name: 'Willa Thorne' },
    { id: 's5', x: 80, z: 2, name: 'the Unknown Traveler' },
    // cathedral (inside + rear yard)
    { id: 's6', x: 0, z: -66, inside: true, name: 'Brother Aldric' },
    { id: 's7', x: -10, z: -92, name: 'the Cartographer' },
    // stable & paddock
    { id: 's8', x: -60, z: 14, name: 'Harold' },
    // house gardens
    { id: 's9', x: -28, z: 24, name: 'Little Pip' },
    { id: 's10', x: 31, z: 42, name: 'Goodwife Orme' },
    // the woods
    { id: 's11', x: -44, z: -46, name: 'the Astronomer' },
    { id: 's12', x: 46, z: -42, name: 'Tobias Finch' },
    // the well soul: hidden until a coin is dropped
    { id: 's13', x: 16, z: 22, well: true, name: 'Sister Margarethe' }
  ],

  // -- Act II additions --
  tavern: { x: -14, z: 38, rot: -0.35 },          // The Drowned Rat
  watchtower: { x: 56, z: -34 },
  stoneCircle: { x: -54, z: 62 },
  crypt: { x: -18, z: -90 },                      // the Bone Chapel (locket-locked)
  raceGates: [
    [30, 4], [0, 10], [-30, 12], [-2, 24], [16, 22], [0, -30]
  ],
  ravens: [
    { id: 'r1', hint: 'tavern rafter' },
    { id: 'r2', hint: 'watchtower top' },
    { id: 'r3', hint: 'well roof' },
    { id: 'r4', hint: 'organ loft' },
    { id: 'r5', hint: 'gravegate post' },
    { id: 'r6', hint: 'bone chapel' }
  ]
};

// Dirt paths, as polylines of [x, z]. Painted into the ground texture and
// used to pick footstep sounds.
export const PATHS = [
  [[0, 48], [0, 10], [0, -18], [0, -34]],            // spawn -> cathedral steps
  [[0, 8], [16, 6], [30, 4], [39.5, 1]],             // fork -> graveyard gate
  [[0, 12], [-16, 13], [-30, 12], [-46, 12]],        // fork -> stable
  [[1, 16], [9, 20], [15, 21.5]],                    // -> the well
  [[10, 42], [20, 40], [26, 38]]                     // -> east cottage
];

// Terrain flattening pads: { x, z, r, h } - terrain blends to height h.
export const FLATTENS = [
  { x: 0, z: -62, r: 42, h: 0.0 },     // cathedral grounds
  { x: 0, z: 40, r: 16, h: 0.2 },      // spawn plaza
  { x: 63, z: 1, r: 32, h: 0.35 },     // graveyard
  { x: -56, z: 24, r: 30, h: 0.15 },   // stable + paddock
  { x: 16, z: 22, r: 9, h: 0.25 },     // well
  { x: -24, z: 18, r: 8, h: 0.2 },     // houses…
  { x: 27, z: 36, r: 8, h: 0.25 },
  { x: -32, z: 54, r: 8, h: 0.2 },
  { x: 40, z: -24, r: 8, h: 0.3 },
  { x: 0, z: 10, r: 10, h: 0.15 },     // the crossroads
  { x: -14, z: 38, r: 10, h: 0.25 },   // the tavern
  { x: 56, z: -34, r: 9, h: 3.4 },     // watchtower hill
  { x: -54, z: 62, r: 11, h: 0.6 },    // the stone circle
  { x: -18, z: -90, r: 7, h: 0.2 }     // the Bone Chapel
];
