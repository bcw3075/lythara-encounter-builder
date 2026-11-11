/* The brief: everything a build needs that the module can't work out itself. The module can't read the campaign notes and
   invents no creatures or story, so a chat or the GM writes this. Pure: no Foundry globals. */
import { MIND_SCHEMA, rowLines, rowOwn } from "./minds.mjs";
import { briefBands } from "./bands.mjs";
export const MOODS = ["ambush", "lair", "patrol", "chase", "standoff"];
export const ROLES = ["ambusher", "brute", "ranged", "caster", "guard", "beast"];
export const STATES = ["alert", "hidden", "asleep"];
export const ADJUSTMENTS = ["", "weak", "elite"];
const MAX_TEXT = 8000;
const text = (v, max = MAX_TEXT) => String(v ?? "").trim().slice(0, max);
const pick = (v, list, fallback) => list.includes(v) ? v : fallback;
const whole = (v, lo, hi, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
const square = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? [Math.floor(v[0]), Math.floor(v[1])] : null;

/** A brief with every field present and in range. Text is kept as data; it is escaped wherever it is shown.
    `minds` is the schema of the minds it carries (the encounter layer lives in the brief so a Rebuild keeps it: design review 10). */
export function cleanBrief(b = {}) {
  const creatures = (Array.isArray(b.creatures) ? b.creatures : []).map(c => ({
    uuid: text(c.uuid, 200), name: text(c.name, 120), count: whole(c.count, 1, 30, 1), adjust: pick(c.adjust ?? "", ADJUSTMENTS, ""),
    role: pick(c.role, ROLES, "brute"), state: pick(c.state, STATES, b.mood === "ambush" ? "hidden" : "alert"),
    anchor: text(c.anchor, 40), run: c.run !== false, opus: !!c.opus,
    /* monster minds (0.24.0): this encounter's profile lines for the row's kind, and whole profiles for single monsters of it by their number in the
       row. A row's old `tactics` text becomes the kind's notes (profiles replace the Tactics page: Rhea, 2026-11-10), so `tactics` is read, never kept.
       `band` is the key of the band the row's monsters belong to (0.26.0): the bands themselves, with who leads each, are in `bands` below. */
    mind: rowLines(c), own: rowOwn(c, whole(c.count, 1, 30, 1)), band: text(c.band, 60)
  })).filter(c => c.uuid || c.name);
  /* bands (0.26.0, monster minds 3a): each band's nature, leader and plan; rows are made to agree with them. A row handed in without a uuid or a name
     was dropped above, so the old `leader` mark is read from the rows that stayed. */
  const kept = (Array.isArray(b.creatures) ? b.creatures : []).filter(c => text(c.uuid, 200) || text(c.name, 120)), bands = briefBands(b.bands, kept, creatures);
  const coins = c => ({ gp: whole(c?.gp, 0, 1e7, 0), sp: whole(c?.sp, 0, 1e7, 0), cp: whole(c?.cp, 0, 1e7, 0) });
  const treasure = (Array.isArray(b.treasure) ? b.treasure : []).map(t => ({ uuid: text(t.uuid, 200), name: text(t.name, 120), qty: whole(t.qty, 1, 999, 1), coins: t.coins ? coins(t.coins) : null, on: text(t.on, 40) || "carried" })).filter(t => t.uuid || t.name || t.coins);
  const notes = (Array.isArray(b.notes) ? b.notes : []).map(n => ({ title: text(n.title, 120) || "Note", text: text(n.text), at: square(n.at), anchor: text(n.anchor, 40), player: !!n.player })).filter(n => n.at || n.anchor);
  const claimed = Number(b.claimedXP);
  return {
    minds: MIND_SCHEMA, name: text(b.name, 120), beat: text(b.beat, 500), why: text(b.why), want: text(b.want), doing: text(b.doing), retreat: text(b.retreat),
    mood: pick(b.mood, MOODS, "ambush"), partyLevel: b.partyLevel === undefined || b.partyLevel === null || b.partyLevel === "" ? null : whole(b.partyLevel, -1, 25, null),
    claimedXP: Number.isFinite(claimed) && b.claimedXP !== null && b.claimedXP !== "" ? claimed : null,
    creatures, bands, treasure, treasureMode: pick(b.treasureMode, ["list", "table", "none"], treasure.length ? "list" : "table"), notes,
    journal: { truth: text(b.journal?.truth), locals: text(b.journal?.locals), learn: text(b.journal?.learn) }
  };
}
/** One entry per creature on the map, in brief order. info: uuid -> { size squares, swim, carries } */
export function expandCreatures(brief, info = () => ({})) {
  const out = [];
  brief.creatures.forEach((c, g) => { const i = info(c) ?? {}; for (let k = 0; k < c.count; k++) out.push({ key: `c${g}-${k}`, group: g, n: i.n ?? 1, swim: !!i.swim, role: c.role, state: c.state, anchor: c.anchor, label: i.name ?? c.name }); });
  return out;
}
