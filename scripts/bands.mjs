/* Lythara Encounter Builder: bands (0.26.0, monster minds release 3, tier 3a). A band is a group of monsters that fight as one: its nature (how its
   leader leads, what happens when the leader falls, its way of fighting, how its members stand toward each other, what they want), who leads it and
   a plan written when the encounter is built (the objective, who does what, where "fall back" leads). Pure: no Foundry globals, so the unit tests
   run it in Node. Rhea's decisions R3-1 to R3-13 (2026-11-11) and what the design review asked for are in docs/features/bands.md. Since 0.28.0
   (tier 3b) a band can name a second, who takes over first when "Next in line takes over" is its pick; what happens in the fight (orders, the
   leader's fall acted on) is orders.mjs. */
import { noteForThinker } from "./turn.mjs";
import { BY, cutWords, slug } from "./minds.mjs";

/** The lines of a band's nature, in the order they are shown and sent. Discipline isn't one of them: it belongs to each kind of creature (R3-11). */
export const NATURE = ["leadsBy", "ifLeaderFalls", "way", "toward", "want"];
export const NATURE_LABEL = { leadsBy: "Leader leads by", ifLeaderFalls: "If the leader falls", way: "Way of fighting", toward: "Toward each other", want: "What they want" };
/** R3-2: five outcomes to pick from, her own words on top. The words are the prompt's (prompt.mjs prints them once). */
export const FALLS = {
  next: { label: "Next in line takes over", words: "the highest-ranking member left leads from now on; the band keeps its discipline and its plan" },
  stands: { label: "Plan stands, nobody changes it", words: "they keep doing what they were told, even when it stops making sense" },
  apart: { label: "Falls apart", words: "the plan is gone: each fights by its own mind, as a Loose member would at best" },
  runs: { label: "Breaks and runs", words: "each acts as if its own \"givesUp\" line had been reached" },
  harder: { label: "Fights harder", words: "the plan becomes killing whoever dropped the leader, and nobody gives up" }
};
export const NATURE_PICKS = { ifLeaderFalls: FALLS };
/** Suggestions only: every line takes her own words. */
export const NATURE_SUGGEST = {
  leadsBy: ["fear", "respect earned in battle", "pay", "rank and drill", "faith", "being the strongest"],
  way: ["swarm one target at a time", "hold a line and let the archers work", "ambush, then scatter", "hit hard and fast before they can react", "wear them down from range"],
  toward: ["every one for itself", "they cover each other", "kin: they won't leave their own behind", "rivals who show off", "they fear their leader more than the enemy"],
  want: ["loot", "to drive intruders off", "food", "prisoners, alive", "to hold this place", "to get away with the prize"]
};
/** Hard caps (design review 18): what is stored is what is sent. */
export const BAND_CAPS = { line: 200, job: 120, when: 160, name: 60, jobs: 8, bands: 12, send: 3600 };
export const FALL_BACK = { spot: "A rally spot on the map", off: "Off the map" };
/** The disciplines whose members follow a band's plan and a leader (R3-1): Loose, Trained, Drilled. None and Pack have neither. */
export const PLANNED = ["loose", "trained", "drilled"];

const GATE_MAX = 8000, str = v => String(v ?? "").replace(/\s+/g, " ").trim();
const who = (v, by) => BY.includes(v) ? v : BY.includes(by) ? by : "gm";
/** A band's key from its name: letters, digits and dashes only, so it can be a flag's key (a dot would be read as a path). */
export const bandId = name => slug(name).slice(0, 40).replace(/-+$/, "");   /* a cut can end on a dash, which the next cleaning would take off: the key must come out the same every time (0.26.0 review 6) */

/** One piece of free text as a band stores it, or null when it says nothing: { pick?, text, by, at? }. A string is her words. */
export function cleanPart(v, { by = null, cap = BAND_CAPS.line, picks = null } = {}) {
  if (v == null) return null; const o = typeof v === "string" ? { text: v } : v; if (typeof o !== "object") return null;
  const text = cutWords(str(o.text).slice(0, GATE_MAX), cap), pick = picks && Object.hasOwn(picks, o.pick) ? o.pick : null, at = Number.isFinite(o.at) ? o.at : null;
  if (!text && !pick) return null;
  return { ...(pick ? { pick } : {}), text, by: who(o.by, by), ...(at ? { at } : {}) };
}
/** A band's nature: known lines only, each cleaned. */
export function cleanNature(n, { by = null } = {}) {
  const out = {}; if (!n || typeof n !== "object") return out;
  for (const k of NATURE) { const l = cleanPart(n[k], { by, picks: NATURE_PICKS[k] ?? null }); if (l) out[k] = l; }
  return out;
}
const whole = v => Number.isInteger(v) && v >= 0;
/** Who a job or the leader mark points at: a brief row ({ row }, with { n } for one monster of it), a kind the build didn't place ({ kind }) or one
    such monster ({ token }). */
function cleanRef(r, { rows = null, single = false } = {}) {
  if (!r || typeof r !== "object") return null;
  if (whole(r.row) && (rows == null || r.row < rows.length)) { if (!single) return { row: r.row }; const n = whole(r.n) ? r.n : 0; return rows == null || n < (rows[r.row]?.count ?? 1) ? { row: r.row, n } : null; }
  if (typeof r.token === "string" && r.token) return { token: r.token.slice(0, 40) };
  if (!single && typeof r.kind === "string" && r.kind) return { kind: r.kind.slice(0, 200) };
  return null;
}
const refKey = r => r.row != null ? `r${r.row}` : r.kind != null ? `k${r.kind}` : `t${r.token}`;
/** Where "fall back" leads (R3-12): a rally spot on the map (the band pulls back there and keeps fighting) or off the map, and when, in words. */
function cleanFallBack(f, by = null) {
  if (!f || typeof f !== "object") return {};
  const to = Object.hasOwn(FALL_BACK, f.to) ? f.to : null, at = Array.isArray(f.at) && f.at.length === 2 && f.at.every(Number.isFinite) ? [Math.floor(f.at[0]), Math.floor(f.at[1])] : null, when = cleanPart(f.when, { by, cap: BAND_CAPS.when });
  return { ...(to ? { to, by: who(f.by, by) } : {}), ...(to === "spot" && at ? { at } : {}), ...(when ? { when } : {}) };
}
/** A band, cleaned: { key, name, lib, leader, nature, plan: { objective, jobs, fallBack } }. `rows` are the brief's creature rows, when the band lives
    in a brief: a leader or a job pointing past them is dropped. `lib` names a kind of group in the Minds Library that its nature starts from. */
export function cleanBand(b = {}, { rows = null, by = null } = {}) {
  const name = str(b.name).slice(0, BAND_CAPS.name), key = bandId(b.key || name); if (!key) return null;
  const lead = cleanRef(b.leader, { rows, single: true }), sec = cleanRef(b.second, { rows, single: true }), seen = new Set(), jobs = [];
  for (const j of Array.isArray(b.plan?.jobs) ? b.plan.jobs : []) { const ref = cleanRef(j, { rows }), l = ref ? cleanPart(j, { by, cap: BAND_CAPS.job }) : null; if (!l || seen.has(refKey(ref)) || jobs.length >= 30) continue; seen.add(refKey(ref)); jobs.push({ ...ref, text: l.text, by: l.by, ...(l.at ? { at: l.at } : {}) }); }
  const objective = cleanPart(b.plan?.objective, { by });
  return { key, name: name || key, lib: typeof b.lib === "string" && b.lib.startsWith("band:") ? b.lib.slice(0, 80) : null, leader: lead ? { ...lead, by: who(b.leader.by, by) } : null,
    /* the named second (0.28.0): first in line when the leader falls; never the leader itself */
    second: sec && !(lead && refKey(sec) === refKey(lead) && (sec.n ?? null) === (lead.n ?? null)) ? { ...sec, by: who(b.second.by, by) } : null,
    nature: cleanNature(b.nature, { by }), plan: { ...(objective ? { objective } : {}), jobs, fallBack: cleanFallBack(b.plan?.fallBack, by) } };
}
/** A list of bands, cleaned: one of each key, at most BAND_CAPS.bands. */
export function cleanBands(list, opts = {}) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) { const b = cleanBand(raw, opts); if (!b || seen.has(b.key) || out.length >= BAND_CAPS.bands) continue; seen.add(b.key); out.push(b); }
  return out;
}
/** A brief's bands, with its rows made to agree (design review 4): each row's `band` becomes a band's key; a band a row names that isn't in the list is
    made with that name; a row marked `leader` in a brief from before 0.26.0 gives its band its first monster as leader when the band has none.
    rawRows: the rows as handed in (for the old `leader` mark); rows: the cleaned rows, changed in place. Out: the bands. */
export function briefBands(list, rawRows = [], rows = [], { by = null } = {}) {
  const bands = cleanBands(list, { rows, by });
  rows.forEach((c, g) => { const typed = str(rawRows[g]?.band).slice(0, BAND_CAPS.name), key = bandId(typed); c.band = key; if (!key) return;
    let b = bands.find(x => x.key === key); if (!b && bands.length < BAND_CAPS.bands) { b = cleanBand({ key, name: typed }); bands.push(b); }
    if (!b) { c.band = ""; return; }
    /* the old mark could only come from a chat's brief (no window set it), so it is Angel's and she can change it later (0.26.0 review 11) */
    if (rawRows[g]?.leader === true && !b.leader) b.leader = { row: g, n: 0, by: "angel" }; });
  /* a leader or a job must point at a row of its own band (0.26.0 review 4): a mark on another band's row would have the band told its leader is
     gone from the first round, and that row's job sent as one of the band's */
  for (const b of bands) { if (b.leader?.row != null && rows[b.leader.row]?.band !== b.key) b.leader = null; if (b.second?.row != null && rows[b.second.row]?.band !== b.key) b.second = null; b.plan.jobs = b.plan.jobs.filter(j => j.row == null || rows[j.row]?.band === b.key); }
  return bands;
}
/** A change laid over a band. Angel never replaces the GM's words or choices unless `force` (the same rule as a mind's lines): what was skipped comes
    back by name. change: { name, lib, leader (a ref or null), nature: { line: words | { pick, text } | null }, plan: { objective, jobs: [{ row | kind,
    text }] (an empty text takes the job away), fallBack: { to, at, when } } }. Out: { band, skipped }. */
export function applyBand(current, change = {}, { by = "gm", force = false, now = null, rows = null } = {}) {
  const b = cleanBand(current ?? {}, { rows }) ?? cleanBand({ key: change.key, name: change.name ?? change.key }, { rows }); if (!b) return { band: null, skipped: [] };
  const skipped = [], hers = l => by !== "gm" && !force && l?.by === "gm", stamp = l => l && now ? { ...l, at: now } : l;
  if (typeof change.name === "string" && str(change.name)) b.name = str(change.name).slice(0, BAND_CAPS.name);
  if ("lib" in change) b.lib = typeof change.lib === "string" && change.lib.startsWith("band:") ? change.lib : null;
  if ("leader" in change) { if (hers(b.leader)) skipped.push("leader"); else { const l = cleanRef(change.leader, { rows, single: true }); b.leader = l ? { ...l, by } : null; } }
  if ("second" in change) { if (hers(b.second)) skipped.push("second"); else { const l = cleanRef(change.second, { rows, single: true }); b.second = l ? { ...l, by } : null; } }
  for (const k of NATURE) { if (!(k in (change.nature ?? {}))) continue; if (hers(b.nature[k])) { skipped.push(k); continue; }
    const v = change.nature[k], l = v === null ? null : cleanPart(typeof v === "string" ? { text: v, by } : { ...v, by }, { by, picks: NATURE_PICKS[k] ?? null }); if (l) b.nature[k] = stamp(l); else delete b.nature[k]; }
  const plan = change.plan ?? {};
  if ("objective" in plan) { if (hers(b.plan.objective)) skipped.push("objective"); else { const v = plan.objective, l = v === null ? null : cleanPart(typeof v === "string" ? { text: v, by } : { ...v, by }, { by }); if (l) b.plan.objective = stamp(l); else delete b.plan.objective; } }
  for (const j of Array.isArray(plan.jobs) ? plan.jobs : []) { const ref = cleanRef(j, { rows }); if (!ref) continue; const i = b.plan.jobs.findIndex(x => refKey(x) === refKey(ref));
    if (i >= 0 && hers(b.plan.jobs[i])) { skipped.push(`job ${refKey(ref)}`); continue; }
    const l = cleanPart({ text: j.text, by }, { by, cap: BAND_CAPS.job }), job = l ? { ...ref, text: l.text, by, ...(now ? { at: now } : {}) } : null;
    if (i >= 0) { if (job) b.plan.jobs[i] = job; else b.plan.jobs.splice(i, 1); } else if (job) b.plan.jobs.push(job); }
  if (plan.fallBack && typeof plan.fallBack === "object") { const f = plan.fallBack, cur = b.plan.fallBack;
    if ("to" in f || "at" in f) { if (by !== "gm" && !force && cur.by === "gm") skipped.push("fallBack"); else { const next = cleanFallBack({ to: "to" in f ? f.to : cur.to, at: "at" in f ? f.at : cur.at, by }, by); delete cur.to; delete cur.at; delete cur.by; Object.assign(cur, next); } }
    if ("when" in f) { if (hers(cur.when)) skipped.push("when"); else { const l = f.when === null ? null : cleanPart(typeof f.when === "string" ? { text: f.when, by } : { ...f.when, by }, { by, cap: BAND_CAPS.when }); if (l) cur.when = stamp(l); else delete cur.when; } } }
  return { band: cleanBand(b, { rows }), skipped };
}
/** A nature's lines laid over a library entry's (a kind of group in the Minds Library): the same rule for whose words they are. */
export function applyNature(current = {}, incoming = {}, { by = "gm", force = false, now = null, keepBy = false } = {}) {
  const lines = cleanNature(current), skipped = [];
  for (const k of NATURE) { if (!(k in (incoming ?? {}))) continue; if (by !== "gm" && !force && lines[k]?.by === "gm") { skipped.push(k); continue; }
    const v = incoming[k], l = v === null ? null : cleanPart(typeof v === "string" ? { text: v, by } : { ...v, by: keepBy && BY.includes(v?.by) ? v.by : by }, { by, picks: NATURE_PICKS[k] ?? null });
    if (l) lines[k] = now ? { ...l, at: now } : l; else delete lines[k]; }
  return { lines, skipped };
}
/** Where a band's nature is read from, most specific first (design review 5): what was agreed in this fight (nothing writes it before tier 3b), this
    encounter's band, the kind of group in the library it starts from, and the brief's own words for what the monsters want. */
export const NATURE_LAYERS = ["fight", "encounter", "library", "brief"];
export const NATURE_LAYER_WORDS = { fight: "this fight", encounter: "this encounter", library: "library", brief: "the brief" };
/** One nature from its layers: for each line the most specific layer that says anything wins, whole. layers: [{ from, name, nature }]. */
export function natureOf(layers = []) {
  const by = new Map(); for (const l of layers ?? []) if (l && NATURE_LAYERS.includes(l.from) && l.nature) by.set(l.from, l);
  const lines = {};
  for (const k of NATURE) for (const f of NATURE_LAYERS) { const layer = by.get(f), l = layer?.nature[k]; if (!l) continue; lines[k] = { ...(l.pick ? { pick: l.pick } : {}), text: l.text ?? "", by: l.by ?? "gm", from: f, ...(layer.name ? { name: layer.name } : {}) }; break; }
  return lines;
}
/** A nature line in words: a pick's label, then her words. */
export function natureWords(k, l) { if (!l) return ""; const label = l.pick ? NATURE_PICKS[k]?.[l.pick]?.label ?? "" : "", text = str(l.text); return label && text ? `${label}. ${text}` : label || text; }

/** What one member's packet carries of its band (schema 4): the block is the same bytes all fight long, for as long as what the monster perceives of
    the creatures its lines name doesn't change. By its Discipline (R3-1): None gets nothing; Pack gets the way of fighting, how they stand toward each
    other and what they want, with no leader and no plan; Loose, Trained and Drilled get everything. Free text goes through the same gate as a mind's
    lines (a party member's name becomes its label when this monster perceives that creature; a line naming anyone else is held back whole).
    In: discipline (the member's pick); nature (from `natureOf`); plan (the band's); me: { row, kind, leads }; leader: its label, or null when the band
    has none or this monster isn't told of it; nameOf(job): the kind of creature a job is for, in words; people: as for `noteForThinker`.
    Out: { band, held: [key] }; `band` is null when nothing is left to say. */
export function bandForPacket({ discipline = "loose", nature = {}, plan = {}, me = {}, leader = null, nameOf = () => "", people = [] } = {}) {
  const held = [], gate = (key, text, cap) => { const g = noteForThinker(String(text ?? ""), people, GATE_MAX); if (g.unknown.length || g.ambiguous.length) { held.push(key); return ""; } return cutWords(g.text, cap); };
  if (discipline === "none" || !discipline) return { band: null, held };
  const planned = PLANNED.includes(discipline), out = {}, pick = {};
  if (planned && (me.leads || leader)) out.leader = me.leads ? "you" : leader;
  for (const k of planned ? NATURE : ["way", "toward", "want"]) { const l = nature[k]; if (!l) continue;
    const text = gate(k, l.text, BAND_CAPS.line), words = natureWords(k, { pick: l.pick, text }); if (!words) continue; out[k] = words; if (l.pick) pick[k] = l.pick; }
  if (planned) {
    const p = {}, objective = plan.objective ? gate("objective", plan.objective.text, BAND_CAPS.line) : ""; if (objective) p.objective = objective;
    const mine = j => (j.row != null && j.row === me.row) || (j.kind != null && j.kind === me.kind), others = [];
    for (const j of plan.jobs ?? []) { const text = gate(mine(j) ? "yourJob" : "jobs", j.text, BAND_CAPS.job); if (!text) continue; if (mine(j)) p.yourJob = text; else if (others.length < BAND_CAPS.jobs) { const name = gate("jobs", str(nameOf(j)), 60); if (name) others.push(`${name}: ${text}`); } }   /* the kind's name is a brief row's name, typed by someone: it goes through the gate too (0.26.0 review 8) */
    if (others.length) p.jobs = others;
    const f = plan.fallBack ?? {}, when = f.when ? gate("fallBack", f.when.text, BAND_CAPS.when) : "", where = f.to === "off" ? "off the map" : f.to === "spot" && f.at ? `to the rally spot at [${f.at[0]}, ${f.at[1]}]` : "";
    if (where || when) p.fallBack = where && when ? `${where}: ${when}` : where || when;
    if (Object.keys(p).length) out.plan = p;
  }
  const body = Object.keys(out).filter(k => k !== "leader"); if (!body.length && !out.leader) return { band: null, held: [...new Set(held)] };
  return { band: { ...(Object.keys(pick).length ? { pick } : {}), ...out }, held: [...new Set(held)] };
}
/** What a member is told once its leader has fallen (R3-10: the band knows at once): how, and for "Next in line takes over" who leads now. Only for
    members that follow a leader. state: "down" | "dead" | "fled" | "gone" (its token is no longer on the map). next: the new leader's label, "you", or
    null when nobody is left to lead. Out: the packet's `bandNow`, or null. */
export function leaderFell({ discipline = "loose", state = null, falls = null, next = null } = {}) {
  if (!state || !PLANNED.includes(discipline)) return null;
  const how = state === "fled" ? "has fled the fight" : state === "dead" ? "is dead" : state === "gone" ? "is gone" : state === "yielded" ? "has given itself up" : state === "turned" ? "has changed sides and fights against the band now" : "is down";
  return { leader: `Its leader ${how}.`, ...(falls === "next" ? { leadsNow: next ?? "nobody is left to lead" } : {}) };
}
/** Who leads when nobody was marked (the module's guess, shown as such): the highest-level member that follows a leader, one that can speak before
    one that can't, the earliest on the list among equals. members: [{ id, level, speaks, discipline }]. Out: id or null. */
export function guessLeader(members = []) {
  const able = (members ?? []).filter(m => PLANNED.includes(m.discipline)); if (!able.length) return null;
  return [...able].sort((a, b) => (b.speaks ? 1 : 0) - (a.speaks ? 1 : 0) || (b.level ?? 0) - (a.level ?? 0))[0].id;
}
/** Next in line (R3-2): the highest-level member still standing that follows a leader, the fallen leader left out. A named second goes first
    (orders.mjs `fallOutcome`). */
export const nextInLine = (members = [], leaderId = null) => guessLeader((members ?? []).filter(m => m.id !== leaderId && m.standing));
/** Rally spots moved with the map's content when the map grows north or west (the squares' numbers shift). Out: the bands, changed or not. */
export const shiftSpots = (bands = [], dx = 0, dy = 0) => (bands ?? []).map(b => b?.plan?.fallBack?.at && (dx || dy) ? { ...b, plan: { ...b.plan, fallBack: { ...b.plan.fallBack, at: [b.plan.fallBack.at[0] + dx, b.plan.fallBack.at[1] + dy] } } } : b);
/** A brief row was taken out (the Build window): marks and jobs pointing at it go, and those pointing past it move up one. */
export function rowRemoved(bands = [], g = 0) {
  const fix = r => r?.row == null ? r : r.row === g ? null : r.row > g ? { ...r, row: r.row - 1 } : r;
  return (bands ?? []).map(b => ({ ...b, leader: fix(b.leader), second: fix(b.second), plan: { ...b.plan, jobs: (b.plan?.jobs ?? []).map(fix).filter(Boolean) } }));
}
/** What the turn card calls a band line the name gate held back. */
export const HELD_LABEL = { leadsBy: "its band: Leader leads by", ifLeaderFalls: "its band: If the leader falls", way: "its band: Way of fighting", toward: "its band: Toward each other", want: "its band: What they want", objective: "its band's objective", yourJob: "its job in the band's plan", jobs: "the others' jobs in the band's plan", fallBack: "when its band falls back" };
/** The words on a flee card for a monster of a band (R3-13). */
export const BAND_GO = { one: "Let this one go", all: "Let the whole band go" };
