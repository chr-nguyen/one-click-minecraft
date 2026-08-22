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

/** @type {MaterialDef[]} */
export const MATERIAL_DEFS = [
  { id: 'dirt',     name: 'Dirt',     durability: 1, family: 'soft',    hsl: [0.08, 0.55, 0.34], colorJitter: 0.10, grain: 0.9,  roughness: 1.0,  metalness: 0.0,  emissive: 0,    crackTint: '#241809', spawnWeight: 5, dyn: { jiggle: 0.13, chips: 10, chipSpeed: 4,   pitch: 1.0 } },
  { id: 'sand',     name: 'Sand',     durability: 1, family: 'soft',    hsl: [0.12, 0.55, 0.60], colorJitter: 0.08, grain: 1.0,  roughness: 1.0,  metalness: 0.0,  emissive: 0,    crackTint: '#3a2f14', spawnWeight: 3, dyn: { jiggle: 0.18, chips: 14, chipSpeed: 5,   pitch: 1.15 } },
  { id: 'stone',    name: 'Stone',    durability: 3, family: 'rock',    hsl: [0.62, 0.04, 0.48], colorJitter: 0.09, grain: 0.6,  roughness: 0.9,  metalness: 0.02, emissive: 0,    crackTint: '#181c22', spawnWeight: 6, dyn: { jiggle: 0.14, chips: 12, chipSpeed: 5,   pitch: 1.0 } },
  { id: 'ice',      name: 'Ice',      durability: 2, family: 'crystal', hsl: [0.55, 0.45, 0.72], colorJitter: 0.06, grain: 0.25, roughness: 0.25, metalness: 0.0,  emissive: 0.04, crackTint: '#dff2ff', spawnWeight: 2, dyn: { jiggle: 0.10, chips: 16, chipSpeed: 6.5, pitch: 1.5 } },
  { id: 'ore',      name: 'Ore',      durability: 4, family: 'metal',   hsl: [0.58, 0.10, 0.42], colorJitter: 0.12, grain: 0.7,  roughness: 0.7,  metalness: 0.35, emissive: 0.02, crackTint: '#12161e', spawnWeight: 3, dyn: { jiggle: 0.12, chips: 12, chipSpeed: 5,   pitch: 0.9 } },
  { id: 'obsidian', name: 'Obsidian', durability: 6, family: 'crystal', hsl: [0.75, 0.30, 0.14], colorJitter: 0.05, grain: 0.4,  roughness: 0.35, metalness: 0.15, emissive: 0.02, crackTint: '#d8c8ff', spawnWeight: 1, dyn: { jiggle: 0.08, chips: 10, chipSpeed: 5,   pitch: 0.7 } },
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
      const v = Math.max(0, Math.min(1, 1 - Math.abs(n) * def.grain * 0.35)) * 255;
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
