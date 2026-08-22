import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// LOOT + TOOLS
//
// Objects hidden inside cubes. Shapes are described procedurally as a small set
// of filled voxel cells on a normalized grid, so adding loot = one entry here.
// Some loot are TOOLS: extracting them boosts dig power for the rest of the run.
// ─────────────────────────────────────────────────────────────────────────────

export const RARITY = {
  common:    { name: 'Common',    color: 0xb8c0cc, glow: 0.15, weight: 60, score: 1 },
  rare:      { name: 'Rare',      color: 0x4aa3ff, glow: 0.45, weight: 25, score: 3 },
  epic:      { name: 'Epic',      color: 0xb46bff, glow: 0.7,  weight: 12, score: 8 },
  legendary: { name: 'Legendary', color: 0xffb020, glow: 1.0,  weight: 3,  score: 20 },
};

// Tools live in tools.js; loot grants one by `tool` id below.

// Voxel blueprints on a 5x5x5 normalized grid. `cells` are [x,y,z] offsets
// (0..4). Kept small & readable; the generator centers them in the cube.
const B = {
  gem: [ // octahedron-ish gem
    [2,0,2],[1,1,2],[2,1,1],[2,1,2],[2,1,3],[3,1,2],
    [1,2,2],[2,2,1],[2,2,2],[2,2,3],[3,2,2],[2,3,2],
  ],
  coin: [ // flat disc
    [1,2,2],[2,2,1],[2,2,2],[2,2,3],[3,2,2],[1,2,1],[1,2,3],[3,2,1],[3,2,3],
  ],
  pickaxe: [ // T-ish head on a handle
    [0,4,2],[1,4,2],[2,4,2],[3,4,2],[4,4,2],
    [2,3,2],[2,2,2],[2,1,2],[2,0,2],
  ],
  shovel: [ // scoop + handle
    [1,4,2],[2,4,2],[3,4,2],[1,3,2],[3,3,2],[2,3,2],
    [2,2,2],[2,1,2],[2,0,2],
  ],
  drill: [ // fat body tapering to a tip
    [2,4,2],[1,3,2],[2,3,2],[3,3,2],[2,3,1],[2,3,3],
    [1,2,2],[2,2,2],[3,2,2],[2,1,2],[2,0,2],
  ],
  artifact: [ // little idol
    [2,4,2],[1,3,2],[2,3,2],[3,3,2],[1,2,2],[2,2,2],[3,2,2],[2,1,2],[1,0,2],[3,0,2],
  ],
  pebble: [ // junk
    [2,1,2],[2,2,2],[1,2,2],[2,2,1],
  ],
};

/** @type {Array<{id,name,shape,rarity,tool?,weight}>} */
export const LOOT_DEFS = [
  { id: 'pebble',        name: 'Pebble',          shape: 'pebble',   rarity: 'common',    weight: 20 },
  { id: 'coin',          name: 'Coin',            shape: 'coin',     rarity: 'common',    weight: 25 },
  { id: 'gem',           name: 'Gem',             shape: 'gem',      rarity: 'rare',      weight: 18 },
  { id: 'shovel_up',     name: 'Sturdy Shovel',   shape: 'shovel',   rarity: 'rare',      weight: 8,  tool: 'shovel' },
  { id: 'pickaxe_up',    name: 'Iron Pickaxe',    shape: 'pickaxe',  rarity: 'rare',      weight: 8,  tool: 'pickaxe' },
  { id: 'artifact',      name: 'Ancient Idol',    shape: 'artifact', rarity: 'epic',      weight: 6 },
  { id: 'drill_up',      name: 'Power Drill',     shape: 'drill',    rarity: 'epic',      weight: 4,  tool: 'drill' },
  { id: 'crown_gem',     name: 'Crown Jewel',     shape: 'gem',      rarity: 'legendary', weight: 2 },
];

// Bonus items the Gold Alloy Shovel can unearth (docs/game-progression.md).
export const FUN_ITEMS = [
  { name: 'Old Boot',      score: 5,  color: '#6b4a2b' },
  { name: 'Ham Sandwich',  score: 8,  color: '#e0a86a' },
  { name: 'Band T-Shirt',  score: 10, color: '#8a5cff' },
  { name: 'T-Rex Skull',   score: 15, color: '#e8e2c8' },
  { name: 'Gold Loot',     score: 25, color: '#ffcf33' },
];
export const pickFunItem = () => FUN_ITEMS[Math.floor(Math.random() * FUN_ITEMS.length)];

const lootById = new Map(LOOT_DEFS.map((l) => [l.id, l]));
export const getLoot = (id) => lootById.get(id);
export const getShape = (name) => B[name];

// Weighted pick helper (seeded via the passed rng for reproducible cubes).
export function weightedPick(defs, rng) {
  const total = defs.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of defs) { r -= d.weight; if (r <= 0) return d; }
  return defs[defs.length - 1];
}

export function lootMaterial(rarity) {
  const r = RARITY[rarity];
  return new THREE.MeshStandardMaterial({
    color: r.color,
    emissive: new THREE.Color(r.color),
    emissiveIntensity: r.glow,
    roughness: 0.3,
    metalness: 0.4,
  });
}
