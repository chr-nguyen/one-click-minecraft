import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// PROCEDURAL MATERIAL REGISTRY
//
// Adding a new material = append ONE object to MATERIAL_DEFS below. Everything
// (texture, per-voxel color variation, crack/particle colors, dig pace) is
// generated procedurally from these parameters — no image assets, ever.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MaterialDef
 * @property {string}  id         Unique key.
 * @property {string}  name       Display name.
 * @property {number}  durability Hits to break one voxel (in tool-power units).
 * @property {string}  family     Tool-matching + sound family: soft|rock|crystal|metal.
 * @property {[number,number,number]} hsl  Base color as [hue 0-1, sat 0-1, light 0-1].
 * @property {number}  colorJitter  Per-voxel HSL lightness/hue spread (0-1).
 * @property {number}  grain        Procedural speckle strength (0-1).
 * @property {number}  roughness
 * @property {number}  metalness
 * @property {number}  emissive     Self-glow strength (0 = none).
 * @property {string}  crackTint    Hex color for crack decals (readable on this material).
 * @property {number}  spawnWeight  Relative frequency in cube generation.
 * @property {Object}  dyn          Dig dynamics.
 * @property {number}  dyn.jiggle   Hit-jiggle amplitude (world units).
 * @property {number}  dyn.chips    Debris particles emitted on break.
 * @property {number}  dyn.chipSpeed Debris launch speed.
 * @property {number}  dyn.pitch    Sound pitch multiplier for this material.
 */

// Charles's block progression (docs/game-progression.md): dirt → … → gold.
// Ordered easy→hard; durability rises along the progression.
/** @type {MaterialDef[]} */
export const MATERIAL_DEFS = [
  { id: 'dirt',    name: 'Dirt',    tier: 1,  durability: 1, family: 'soft',  hsl: [0.08, 0.50, 0.33], colorJitter: 0.10, grain: 0.9,  roughness: 1.0,  metalness: 0.0,  emissive: 0, crackTint: '#20140a', spawnWeight: 7, dyn: { jiggle: 0.13, chips: 10, chipSpeed: 4,   pitch: 1.05 } },
  { id: 'mud',     name: 'Mud',     tier: 2,  durability: 1, family: 'soft',  hsl: [0.09, 0.42, 0.23], colorJitter: 0.10, grain: 0.85, roughness: 1.0,  metalness: 0.0,  emissive: 0, crackTint: '#160d05', spawnWeight: 6, dyn: { jiggle: 0.16, chips: 11, chipSpeed: 4,   pitch: 0.95 } },
  { id: 'clay',    name: 'Clay',    tier: 3,  durability: 2, family: 'soft',  hsl: [0.045,0.45, 0.44], colorJitter: 0.08, grain: 0.6,  roughness: 0.95, metalness: 0.0,  emissive: 0, crackTint: '#2a160c', spawnWeight: 6, dyn: { jiggle: 0.12, chips: 12, chipSpeed: 4.5, pitch: 1.1 } },
  { id: 'stone',   name: 'Stone',   tier: 4,  durability: 3, family: 'rock',  hsl: [0.62, 0.03, 0.50], colorJitter: 0.09, grain: 0.6,  roughness: 0.9,  metalness: 0.02, emissive: 0, crackTint: '#181c22', spawnWeight: 6, dyn: { jiggle: 0.14, chips: 12, chipSpeed: 5,   pitch: 1.0 } },
  { id: 'granite', name: 'Granite', tier: 5,  durability: 4, family: 'rock',  hsl: [0.96, 0.14, 0.46], colorJitter: 0.11, grain: 0.7,  roughness: 0.85, metalness: 0.03, emissive: 0, crackTint: '#20141a', spawnWeight: 4, dyn: { jiggle: 0.12, chips: 13, chipSpeed: 5,   pitch: 0.95 } },
  { id: 'iron',    name: 'Iron',    tier: 6,  durability: 5, family: 'metal', hsl: [0.08, 0.12, 0.52], colorJitter: 0.10, grain: 0.55, roughness: 0.6,  metalness: 0.4,  emissive: 0.01, crackTint: '#14161c', spawnWeight: 3, dyn: { jiggle: 0.11, chips: 12, chipSpeed: 5,   pitch: 0.9 } },
  { id: 'coal',    name: 'Coal',    tier: 7,  durability: 3, family: 'rock',  hsl: [0.0,  0.0,  0.13], colorJitter: 0.10, grain: 0.8,  roughness: 0.7,  metalness: 0.05, emissive: 0, crackTint: '#c9ccd4', spawnWeight: 5, dyn: { jiggle: 0.13, chips: 12, chipSpeed: 5,   pitch: 1.0 } },
  { id: 'copper',  name: 'Copper',  tier: 8,  durability: 5, family: 'metal', hsl: [0.055,0.62, 0.47], colorJitter: 0.11, grain: 0.55, roughness: 0.55, metalness: 0.45, emissive: 0.02, crackTint: '#2a1408', spawnWeight: 3, dyn: { jiggle: 0.11, chips: 12, chipSpeed: 5,   pitch: 0.92 } },
  { id: 'tin',     name: 'Tin',     tier: 9,  durability: 4, family: 'metal', hsl: [0.58, 0.04, 0.66], colorJitter: 0.09, grain: 0.5,  roughness: 0.5,  metalness: 0.5,  emissive: 0.02, crackTint: '#171a1f', spawnWeight: 3, dyn: { jiggle: 0.11, chips: 12, chipSpeed: 5.5, pitch: 1.05 } },
  { id: 'gold',    name: 'Gold',    tier: 10, durability: 6, family: 'metal', hsl: [0.125,0.85, 0.55], colorJitter: 0.10, grain: 0.45, roughness: 0.35, metalness: 0.7,  emissive: 0.05, crackTint: '#3a2800', spawnWeight: 1, dyn: { jiggle: 0.10, chips: 14, chipSpeed: 6,   pitch: 0.85 } },
];

const byId = new Map(MATERIAL_DEFS.map((m) => [m.id, m]));
export const getMaterial = (id) => byId.get(id);

// ── Procedural value-noise texture ──────────────────────────────────────────
// One small canvas texture per material, generated from its palette + grain.
// Cached so repeated cube generation is free.

const TEX_SIZE = 64;
const texCache = new Map();

function hslToRgb(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// Deterministic hash noise so a material's texture is stable across reloads.
function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function proceduralTexture(def) {
  if (texCache.has(def.id)) return texCache.get(def.id);
  const c = document.createElement('canvas');
  c.width = c.height = TEX_SIZE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  // Minecraft-style block face: a grid of multi-shaded squares (grayscale;
  // the material color tints it in soloMaterial). Not real cubes — just a
  // texture/decal on the one solid block. Grainier materials = more contrast.
  const CELLS = 16;
  const cellPx = TEX_SIZE / CELLS;
  const amp = 0.10 + def.grain * 0.14;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const cx = Math.floor(x / cellPx), cy = Math.floor(y / cellPx);
      let shade = 1 + (hash2(cx * 7 + 1, cy * 13 + 3) - 0.5) * 2 * amp;
      if (hash2(cx * 3 + 5, cy * 9 + 2) > 0.9) shade *= 0.82; // occasional dark fleck
      const v = Math.max(0.45, Math.min(1.25, shade)) * 255;
      const i = (y * TEX_SIZE + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  texCache.set(def.id, tex);
  return tex;
}

// ── THREE material factory ──────────────────────────────────────────────────
const matCache = new Map();

export function threeMaterial(id) {
  if (matCache.has(id)) return matCache.get(id);
  const def = getMaterial(id);
  const [r, g, b] = hslToRgb(...def.hsl);
  const m = new THREE.MeshStandardMaterial({
    map: proceduralTexture(def),
    roughness: def.roughness,
    metalness: def.metalness,
    emissive: new THREE.Color(r / 255, g / 255, b / 255).multiplyScalar(def.emissive),
    // NOTE: do NOT set vertexColors — InstancedMesh.setColorAt drives instanceColor
    // on its own; vertexColors would multiply by a missing (black) attribute.
  });
  matCache.set(id, m);
  return m;
}

// Material for a single solid cube (color lives on the mesh, not instanceColor).
// Fresh instance per cube so per-cube damage-darkening never leaks across cubes.
export function soloMaterial(id) {
  const def = getMaterial(id);
  const [r, g, b] = hslToRgb(...def.hsl);
  const base = new THREE.Color(r / 255, g / 255, b / 255);
  return new THREE.MeshStandardMaterial({
    map: proceduralTexture(def),
    color: base,
    roughness: def.roughness,
    metalness: def.metalness,
    emissive: base.clone().multiplyScalar(def.emissive),
  });
}

export function baseColor(id) {
  const [r, g, b] = hslToRgb(...getMaterial(id).hsl);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// Small rendered pixel icon per material (a mini multi-shade block face in the
// material's color) as a data URL, for the collected-materials list. Cached.
const iconCache = new Map();
export function materialIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const def = getMaterial(id);
  const [h, s, l] = def.hsl;
  const SZ = 32, CELLS = 6, cell = SZ / CELLS;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d');
  const amp = 0.12 + def.grain * 0.14;
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    let shade = 1 + (hash2(i * 7 + 1, j * 13 + 3) - 0.5) * 2 * amp;
    if (j === 0) shade += 0.1; if (j === CELLS - 1) shade -= 0.12; // top light / bottom dark
    const [r, g, b] = hslToRgb(h, s, Math.max(0.05, Math.min(0.95, l * Math.max(0.4, shade))));
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(Math.floor(i * cell), Math.floor(j * cell), Math.ceil(cell), Math.ceil(cell));
  }
  // subtle outline for definition on any background
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, SZ - 2, SZ - 2);
  const url = c.toDataURL('image/png');
  iconCache.set(id, url);
  return url;
}

// The glowing nugget of material that pops out when a block shatters — a
// brighter, punchier version of the block's own color.
export function nuggetMaterial(id) {
  const d = getMaterial(id);
  const [r, g, b] = hslToRgb(d.hsl[0], Math.min(1, d.hsl[1] + 0.12), Math.min(0.85, d.hsl[2] + 0.18));
  const col = new THREE.Color(r / 255, g / 255, b / 255);
  return new THREE.MeshStandardMaterial({
    color: col, emissive: col.clone().multiplyScalar(0.35), roughness: 0.3, metalness: 0.4,
  });
}

// Voxel color — a single flat color per material with only a SMOOTH,
// low-frequency shade gradient across the cube. Adjacent voxels differ only
// slightly, so the intact surface reads as one solid block, not a grid of
// distinctly-colored cubes.
export function shadeColor(id, i, j, k) {
  const def = getMaterial(id);
  const [h, s, l] = def.hsl;
  const n = Math.sin(i * 0.9 + 1.3) * Math.cos(j * 0.8 + 0.7) * Math.sin(k * 0.7 + 2.1);
  const shade = 1 + n * 0.06; // ~0.94..1.06, gentle
  const [r, g, b] = hslToRgb(h, s, Math.max(0.03, Math.min(0.97, l)));
  return new THREE.Color(r / 255, g / 255, b / 255).multiplyScalar(shade);
}

export const particleColor = (id) => {
  const [r, g, b] = hslToRgb(...getMaterial(id).hsl);
  return new THREE.Color(r / 255, g / 255, b / 255);
};
