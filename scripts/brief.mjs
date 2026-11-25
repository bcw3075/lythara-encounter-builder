/* The brief: everything a build needs that the module can't work out itself. The module can't read the campaign notes and
   invents no creatures or story, so a chat or the GM writes this. Pure: no Foundry globals. */
import { MIND_SCHEMA, rowLines, rowOwn } from "./minds.mjs";
import { briefBands, rowRemoved } from "./bands.mjs";
export const MOODS = ["ambush", "lair", "patrol", "chase", "standoff"];
export const ROLES = ["ambusher", "brute", "ranged", "caster", "guard", "beast"];
export const STATES = ["alert", "hidden", "unaware", "asleep"];   /* unaware since 0.41.0 (F-3): awake, not expecting a fight; the same order as start.mjs STARTS */
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
    /* 0.46.0 (Rhea at the live test: "that should default to the real party level"): true only when a GM typed a level, or Ask Angel set one the GM
       asked for. Without it the level follows the party's sheets every time (fightLevel in builder.mjs), so an old fight's level doesn't stick. */
    partyLevelSet: !!b.partyLevelSet && b.partyLevel !== undefined && b.partyLevel !== null && b.partyLevel !== "",
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

/* ---------- one row per creature (0.41.0, F-5: "identical ones merged as ×n, split only when settings or notes differ") ---------- */
const lineKey = l => l == null ? null : typeof l === "object" ? JSON.stringify({ p: l.pick ?? null, t: l.text ?? null, b: !!l.blank }) : JSON.stringify(l);
const mindKey = m => JSON.stringify(Object.keys(m ?? {}).sort().map(k => [k, lineKey(m[k])]));
const sameRow = (a, b) => a.uuid === b.uuid && a.uuid && a.adjust === b.adjust && a.role === b.role && a.state === b.state && a.run === b.run && !!a.opus === !!b.opus && (a.anchor ?? "") === (b.anchor ?? "") && (a.band ?? "") === (b.band ?? "") && !!a.leader === !!b.leader && mindKey(a.mind) === mindKey(b.mind);
const refs = (bands, g) => (bands ?? []).some(b => [b.leader, b.second, ...(b.plan?.jobs ?? [])].some(r => r?.row === g));
const ownless = c => !Object.keys(c.own ?? {}).length;
/** Rows of the same creature with the same settings, notes and mind lines become one, its count the sum (at most 30). A row a band names (its leader,
    second or a job) or with a single monster's own profile stays apart: those point at a monster by its row and number. only: merge just that row
    with the others (the row just changed or added), so a row split off stays apart until it is set back to match (0.41.0 review 1). Pure. */
export function mergeRows(creatures = [], bands = [], only = null) {
  let rows = creatures.map(c => ({ ...c })), bs = bands;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (only != null && i !== only && j !== only) continue;
    if (!sameRow(a, b) || !ownless(a) || !ownless(b) || refs(bs, i) || refs(bs, j) || a.count + b.count > 30) continue;
    a.count += b.count; rows.splice(j, 1); bs = rowRemoved(bs, j); if (only != null) only = only === j ? i : only > j ? only - 1 : only; j--; }
  return { creatures: rows, bands: bs };
}
/** One monster of a row of several split off into its own row just below, to be set apart (its own start, strength, notes). Pure. */
export function splitRow(creatures = [], bands = [], g = 0) {
  const c = creatures[g]; if (!c || c.count < 2) return { creatures, bands };
  const rows = creatures.map(x => ({ ...x })); rows[g].count -= 1; rows.splice(g + 1, 0, { ...c, count: 1, own: {}, leader: false, mind: structuredClone(c.mind ?? {}) });
  /* the rows behind move down one; a mark on the row's last monster goes with it to the new row (review 3) */
  const fix = r => r?.row == null || r.row < g ? r : r.row > g ? { ...r, row: r.row + 1 } : r.n === c.count - 1 ? { ...r, row: g + 1, n: 0 } : r;
  return { creatures: rows, bands: (bands ?? []).map(b => ({ ...b, leader: fix(b.leader), second: fix(b.second), plan: { ...b.plan, jobs: (b.plan?.jobs ?? []).map(fix) } })) };
}
