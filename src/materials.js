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
 * @property {number}  durability Hits to break one voxel (before tool bonus).
 * @property {[number,number,number]} hsl  Base color as [hue 0-1, sat 0-1, light 0-1].
 * @property {number}  colorJitter  Per-voxel HSL lightness/hue spread (0-1).
 * @property {number}  grain        Procedural speckle strength (0-1).
 * @property {number}  roughness
 * @property {number}  metalness
 * @property {number}  emissive     Self-glow strength (0 = none).
 * @property {string}  affinity     Tool id that breaks this fastest.
 * @property {number}  spawnWeight  Relative frequency in cube generation.
 */

/** @type {MaterialDef[]} */
export const MATERIAL_DEFS = [
  { id: 'dirt',     name: 'Dirt',     durability: 1, hsl: [0.08, 0.55, 0.34], colorJitter: 0.10, grain: 0.9, roughness: 1.0, metalness: 0.0, emissive: 0,    affinity: 'shovel',  spawnWeight: 5 },
  { id: 'sand',     name: 'Sand',     durability: 1, hsl: [0.12, 0.55, 0.60], colorJitter: 0.08, grain: 1.0, roughness: 1.0, metalness: 0.0, emissive: 0,    affinity: 'shovel',  spawnWeight: 3 },
  { id: 'stone',    name: 'Stone',    durability: 3, hsl: [0.62, 0.04, 0.48], colorJitter: 0.09, grain: 0.6, roughness: 0.9, metalness: 0.02, emissive: 0,   affinity: 'pickaxe', spawnWeight: 6 },
  { id: 'ice',      name: 'Ice',      durability: 2, hsl: [0.55, 0.45, 0.72], colorJitter: 0.06, grain: 0.25, roughness: 0.25, metalness: 0.0, emissive: 0.04, affinity: 'pickaxe', spawnWeight: 2 },
  { id: 'ore',      name: 'Ore',      durability: 4, hsl: [0.58, 0.10, 0.42], colorJitter: 0.12, grain: 0.7, roughness: 0.7, metalness: 0.35, emissive: 0.02, affinity: 'pickaxe', spawnWeight: 3 },
  { id: 'obsidian', name: 'Obsidian', durability: 6, hsl: [0.75, 0.30, 0.14], colorJitter: 0.05, grain: 0.4, roughness: 0.35, metalness: 0.15, emissive: 0.02, affinity: 'drill',  spawnWeight: 1 },
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
  // Grayscale grain only — the actual hue rides on per-instance color so we
  // never double-apply the palette (which would darken everything to mud).
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash2(x, y) * 0.6 + hash2(x >> 1, y >> 1) * 0.4 - 0.5);
      const v = Math.max(0, Math.min(1, 1 - Math.abs(n) * def.grain * 0.6)) * 255;
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

// Per-voxel color jitter — returns a THREE.Color offset from the base palette.
export function jitterColor(id, seed) {
  const def = getMaterial(id);
  const j = def.colorJitter;
  const rnd = (hash2(seed & 0xffff, seed >> 16) - 0.5) * 2;
  const rnd2 = (hash2(seed >> 8, seed) - 0.5) * 2;
  const [h, s, l] = def.hsl;
  const [r, g, b] = hslToRgb(
    (h + rnd2 * j * 0.15 + 1) % 1,
    Math.max(0, s + rnd * j * 0.2),
    Math.max(0.03, Math.min(0.97, l + rnd * j)),
  );
  return new THREE.Color(r / 255, g / 255, b / 255);
}

export const particleColor = (id) => {
  const [r, g, b] = hslToRgb(...getMaterial(id).hsl);
  return new THREE.Color(r / 255, g / 255, b / 255);
};
