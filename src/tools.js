// ─────────────────────────────────────────────────────────────────────────────
// TOOLS — the shovel progression (docs/game-progression.md).
//
// Progression is AUTOMATIC and luck-driven: the player never crafts. As blocks
// are dug, material totals accumulate; the game auto-equips the best shovel
// whose recipe is met (cumulative totals, non-consuming). `power` is damage per
// hit; `color` is the blade color for the 3D model; `funItems` rolls the bonus
// item table. Adding a tier = one entry here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ToolDef
 * @property {string} id
 * @property {string} name
 * @property {number} power   Damage per hit.
 * @property {number} tier    Progression rank (higher = better).
 * @property {Object<string,number>} recipe  Cumulative material totals required.
 * @property {string} color   Blade color for the held 3D model.
 * @property {number} pitch   Dig-sound flavor.
 * @property {boolean} [funItems] Rolls the bonus fun-item table on dig.
 */

/** @type {Record<string, ToolDef>} */
export const TOOLS = {
  hand:        { id: 'hand',        name: 'Hand',              power: 1.0, tier: 0, recipe: {},                             color: null,      pitch: 1.0 },
  clay_shovel: { id: 'clay_shovel', name: 'Clay Shovel',      power: 1.6, tier: 1, recipe: { clay: 10 },                   color: '#b5651d', pitch: 1.1 },
  stone_shovel:{ id: 'stone_shovel',name: 'Stone Shovel',     power: 2.2, tier: 2, recipe: { stone: 10 },                  color: '#9aa0a8', pitch: 1.0 },
  iron_shovel: { id: 'iron_shovel', name: 'Iron Shovel',      power: 2.8, tier: 3, recipe: { coal: 10, iron: 10 },         color: '#d6dae0', pitch: 0.95 },
  steel_shovel:{ id: 'steel_shovel',name: 'Steel Shovel',     power: 3.4, tier: 4, recipe: { coal: 10, granite: 10, iron: 10 }, color: '#aeb8c8', pitch: 0.9 },
  copper_shovel:{id: 'copper_shovel',name:'Copper Shovel',    power: 3.6, tier: 5, recipe: { coal: 10, copper: 10 },       color: '#c8703a', pitch: 0.92 },
  bronze_shovel:{id: 'bronze_shovel',name:'Bronze Shovel',    power: 4.0, tier: 6, recipe: { coal: 10, copper: 8, tin: 2 },color: '#a97142', pitch: 0.88 },
  gold_shovel: { id: 'gold_shovel', name: 'Gold Alloy Shovel',power: 4.8, tier: 7, recipe: { coal: 10, iron: 10, gold: 10 }, color: '#f2c400', pitch: 0.82, funItems: true },
};

export const getTool = (id) => TOOLS[id] || TOOLS.hand;

const recipeMet = (recipe, totals) =>
  Object.entries(recipe).every(([mat, n]) => (totals[mat] || 0) >= n);

// The best (highest-tier) shovel whose recipe the cumulative totals satisfy.
export function bestTool(totals) {
  let best = TOOLS.hand;
  for (const t of Object.values(TOOLS)) {
    if (t.tier > best.tier && recipeMet(t.recipe, totals)) best = t;
  }
  return best;
}
