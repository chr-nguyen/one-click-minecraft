// ─────────────────────────────────────────────────────────────────────────────
// BESPOKE MATERIAL ICONS — hand-authored 12×12 pixel sprites, one per material,
// rendered to cached data URLs. Distinct shapes/motifs so each reads at a glance
// (grass-topped dirt, cracked stone, ore-flecked metals, gold nugget, …), in the
// game's chunky pixel style.
// ─────────────────────────────────────────────────────────────────────────────

const G = 12, PX = 4, SZ = G * PX; // 48px canvas, 4px cells

// Blob (rock) and block silhouettes as 12-row masks.
const ROCK = [
  '000011110000', '000111111000', '001111111100', '011111111110',
  '011111111110', '111111111110', '111111111110', '011111111110',
  '011111111110', '001111111100', '000111111000', '000001100000',
];
const BLOCK = [
  '000000000000', '011111111110', '011111111110', '011111111110',
  '011111111110', '011111111110', '011111111110', '011111111110',
  '011111111110', '011111111110', '011111111110', '000000000000',
];

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

// Each material: shape mask, base color, and accent pixels (motifs).
// accents: [i, j, '#hex'] in grid coords.
const DEFS = {
  dirt:    { mask: BLOCK, base: '#7a5433', top: ['grass'], accents: speckle('#5f3f26', [[3,5],[7,7],[5,9],[9,6]]) },
  mud:     { mask: BLOCK, base: '#4f3620', accents: [...blob('#6b4a2b', [[3,3],[4,3],[3,4]]), ...blob('#8a6a44', [[3,3]]), [7,9,'#3a2716'],[8,9,'#3a2716']] },
  clay:    { mask: BLOCK, base: '#a1552a', accents: [[1,4,'#7c3f1e'],[2,4,'#7c3f1e'],[9,4,'#7c3f1e'],[10,4,'#7c3f1e'],[1,8,'#7c3f1e'],[5,8,'#7c3f1e'],[10,8,'#7c3f1e'],[6,6,'#c47a4a']] },
  stone:   { mask: ROCK, base: '#8b9099', accents: [[5,3,'#4c5058'],[5,4,'#4c5058'],[6,5,'#4c5058'],[6,6,'#4c5058'],[7,7,'#4c5058'],[3,8,'#4c5058'],[4,8,'#4c5058']] },
  granite: { mask: ROCK, base: '#9a7f88', accents: speckle('#e7d6da', [[3,4],[7,3],[5,6],[8,7],[4,8]]).concat(speckle('#5f4650', [[6,4],[3,7],[8,5]])) },
  iron:    { mask: ROCK, base: '#8790a0', accents: nug('#d9a35a', '#f0c98a', [[4,4],[7,6],[5,8]]) },
  coal:    { mask: ROCK, base: '#2c2f36', accents: [...blob('#111318', [[4,4],[7,5],[5,8]]), [4,3,'#7d8794']] }, // black lumps + shine
  copper:  { mask: ROCK, base: '#7d6f63', accents: nug('#c8703a', '#e79a5e', [[4,4],[7,7]]).concat(speckle('#3aa88a', [[8,4],[4,8]])) },
  tin:     { mask: ROCK, base: '#aab2bd', accents: speckle('#eef2f7', [[4,4],[7,5],[5,8],[8,7]]).concat([[4,3,'#ffffff']]) },
  gold:    { mask: ROCK, base: '#f0b400', accents: [[4,3,'#fff3b0'],[5,3,'#fff3b0'],[4,4,'#ffe27a'], [8,8,'#c98a00'],[7,8,'#c98a00'], ...star('#ffffff', 8, 4)] },
};

// helpers building accent pixel lists
function speckle(color, cells) { return cells.map(([i, j]) => [i, j, color]); }
function blob(color, cells) { return cells.flatMap(([i, j]) => [[i, j, color], [i + 1, j, color], [i, j + 1, color]]); }
function nug(dark, light, cells) { return cells.flatMap(([i, j]) => [[i, j, dark], [i + 1, j, dark], [i, j + 1, dark], [i, j, light]]); }
function star(color, i, j) { return [[i, j, color], [i - 1, j, color], [i + 1, j, color], [i, j - 1, color], [i, j + 1, color]]; }

const cache = new Map();

export function materialIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const def = DEFS[id] || DEFS.stone;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d');
  const base = hex(def.base);
  const outline = mix(base, BLACK, 0.55);

  const filled = (i, j) => i >= 0 && j >= 0 && i < G && j < G && def.mask[j][i] === '1';
  const put = (i, j, col) => { ctx.fillStyle = col; ctx.fillRect(i * PX, j * PX, PX, PX); };

  // base fill with top→bottom shading
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    if (!filled(i, j)) continue;
    const shade = 0.16 - (j / G) * 0.34; // lighter top, darker bottom
    put(i, j, rgb(mix(base, shade >= 0 ? WHITE : BLACK, Math.abs(shade))));
  }
  // grass cap for dirt
  if (def.top && def.top[0] === 'grass') {
    for (let i = 0; i < G; i++) if (filled(i, 1)) { put(i, 1, '#5fbf4a'); if (filled(i, 2) && (i % 2)) put(i, 2, '#4a9e38'); }
  }
  // accents
  for (const [i, j, col] of def.accents) if (filled(i, j)) put(i, j, col);
  // outline (filled cell touching an empty cell)
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    if (!filled(i, j)) continue;
    if (!filled(i - 1, j) || !filled(i + 1, j) || !filled(i, j - 1) || !filled(i, j + 1)) put(i, j, rgb(outline));
  }

  const url = c.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
