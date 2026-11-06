/* Treasure and threat numbers. Pure: no Foundry globals. XP itself comes from PF2e's calculateXP, in the glue.
   Treasure by Encounter and Treasure by Level from GM Core (see DEVELOPING.md for the links). */
/* level: [total per level, low, moderate, severe, extreme] in gp */
export const TREASURE = { 1: [175, 13, 18, 26, 35], 2: [300, 23, 30, 45, 60], 3: [500, 38, 50, 75, 100], 4: [850, 65, 85, 130, 170], 5: [1350, 100, 135, 200, 270], 6: [2000, 150, 200, 300, 400], 7: [2900, 220, 290, 440, 580], 8: [4000, 300, 400, 600, 800], 9: [5700, 430, 570, 860, 1140], 10: [8000, 600, 800, 1200, 1600], 11: [11500, 865, 1150, 1725, 2300], 12: [16500, 1250, 1650, 2475, 3300], 13: [25000, 1875, 2500, 3750, 5000], 14: [36500, 2750, 3650, 5500, 7300], 15: [54500, 4100, 5450, 8200, 10900], 16: [82500, 6200, 8250, 12400, 16500], 17: [128000, 9600, 12800, 19200, 25600], 18: [208000, 15600, 20800, 31200, 41600], 19: [355000, 26600, 35500, 53250, 71000], 20: [490000, 36800, 49000, 73500, 98000] };
const COLUMN = { low: 1, moderate: 2, severe: 3, extreme: 4 };
const clampLevel = l => Math.max(1, Math.min(20, Math.round(l)));
export const levelTotal = level => TREASURE[clampLevel(level)][0];
/** gp for one encounter. Trivial has no column in the table, so it places none. */
export const treasureFor = (level, rating) => COLUMN[rating] ? TREASURE[clampLevel(level)][COLUMN[rating]] : 0;

/** Level after an elite or weak adjustment (Monster Core). */
export function adjustedLevel(level, adjust) {
  if (adjust === "elite") return level + (level <= 0 ? 2 : 1);
  if (adjust === "weak") return level - (level === 1 ? 2 : 1);
  return level;
}
export const toGp = p => p ? (p.pp ?? 0) * 10 + (p.gp ?? 0) + (p.sp ?? 0) / 10 + (p.cp ?? 0) / 100 : 0;
export const coinsOf = gp => { const c = Math.round(gp * 100); return { gp: Math.floor(c / 100), sp: Math.floor((c % 100) / 10), cp: c % 10 }; };

/* The running total. ledger: { manual: { level: gp }, builds: { id: { level, gp } } } */
export function ledgerLine(ledger, level) {
  const placed = Object.values(ledger?.builds ?? {}).filter(b => b.level === level).reduce((a, b) => a + b.gp, 0), manual = Number(ledger?.manual?.[level]) || 0, total = levelTotal(level);
  return { placed, manual, total, spent: placed + manual, left: total - placed - manual };
}
/** Does a figure written in the notes agree with the calculation? */
export const claimDiffers = (claimed, xp) => claimed !== null && claimed !== undefined && Number(claimed) !== Number(xp);
/** PF2e and Archives of Nethys disagree on the Low budget away from 4 PCs, so the dialog says so. */
export const partySizeNote = size => size === 4 ? "" : `Party size is ${size}, not 4. For other sizes PF2e adds 15 XP per PC to the Low budget and Archives of Nethys lists 20. These numbers are PF2e's.`;

const hashf = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const CONSUMABLE = new Set(["potion", "elixir", "talisman", "oil"]);   /* not "other": it holds blank runestones and the like */
/** What a table-rolled treasure holds. Nothing random where it should make sense: a creature that carries nothing gets nothing,
    a lair keeps a cache. candidates: { items:[{uuid,name,level,gp,rarity,category}], goods:[...] }. Picks are seeded. */
export function chooseTreasure({ gp, level, carriers, lair, candidates, seed = 1 }) {
  const out = { lines: [], value: 0, note: "" };
  if (!gp) { out.note = "No treasure at this threat."; return out; }
  if (!carriers.length && !lair) { out.note = "Nothing here would carry treasure, so none was placed."; return out; }
  const to = k => lair ? "cache" : carriers[k % carriers.length];
  let left = gp, n = 0;
  const fit = (x, cap) => x.rarity === "common" && x.gp > 0 && x.gp <= cap;
  const inBand = x => x.level >= Math.max(0, level - 1) && x.level <= level + 1 && CONSUMABLE.has(x.category);
  const take = (list, cap, tag) => { const ok = list.filter(x => fit(x, cap)).sort((a, b) => a.uuid < b.uuid ? -1 : 1); if (!ok.length) return false; const x = ok[Math.floor(hashf(seed, tag) * ok.length)];
    out.lines.push({ kind: "item", uuid: x.uuid, name: x.name, gp: x.gp, qty: 1, to: to(n++) }); left -= x.gp; return true; };
  take((candidates?.items ?? []).filter(inBand), gp * .5, 1);
  if (lair) take(candidates?.goods ?? [], left * .5, 2);
  left = Math.round(left * 100) / 100;
  if (left > 0) { const heads = lair ? 1 : carriers.length, each = Math.floor(left / heads * 100) / 100; for (let k = 0; k < heads; k++) { const share = k === heads - 1 ? Math.round((left - each * (heads - 1)) * 100) / 100 : each; if (share > 0) out.lines.push({ kind: "coins", coins: coinsOf(share), gp: share, to: to(k) }); } }
  out.value = Math.round(out.lines.reduce((a, l) => a + l.gp * (l.qty ?? 1), 0) * 100) / 100;
  return out;
}
