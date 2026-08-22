// ─────────────────────────────────────────────────────────────────────────────
// TOOLS REGISTRY
//
// Adding a tool = one entry here. `power` is damage per hit; `suits` lists the
// material families this tool is strong against (full power) — anything else is
// dug at reduced power. `universal` tools are strong against everything.
// `pitch` flavors the dig sound. Loot in objects.js grants a tool by `id`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ToolDef
 * @property {string}   id
 * @property {string}   name
 * @property {number}   power     Damage per hit (voxel durability is in these units).
 * @property {string[]} suits     Material families this tool excels at.
 * @property {boolean}  [universal] Strong against every material.
 * @property {number}   tier      Upgrade ordering (higher replaces lower).
 * @property {number}   pitch     Dig-sound pitch flavor.
 */

/** @type {Record<string, ToolDef>} */
export const TOOLS = {
  hand:    { id: 'hand',    name: 'Hand',    power: 1.0, suits: [],                 tier: 0, pitch: 1.0 },
  shovel:  { id: 'shovel',  name: 'Shovel',  power: 2.0, suits: ['soft'],           tier: 1, pitch: 1.1 },
  pickaxe: { id: 'pickaxe', name: 'Pickaxe', power: 2.0, suits: ['rock', 'metal'],  tier: 1, pitch: 0.95 },
  drill:   { id: 'drill',   name: 'Drill',   power: 3.0, suits: [], universal: true, tier: 2, pitch: 0.8 },
};

export const getTool = (id) => TOOLS[id];

// Effective damage of `tool` against a material `family`.
// Right tool for the family = full power; wrong tool = 60%.
export function toolPower(tool, family) {
  if (tool.universal || tool.suits.includes(family)) return tool.power;
  return Math.max(1, tool.power * 0.6);
}
