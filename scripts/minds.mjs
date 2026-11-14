/* Lythara Encounter Builder: monster minds (0.24.0, release 1 of 4). A monster's behaviour profile: six lines plus notes, kept in layers that each
   store only what they change, put together fresh for every packet. Pure: no Foundry globals, so the unit tests run it in Node.
   Rhea's decisions (2026-11-10) and the design review's findings are in docs/features/minds.md. */
import { noteForThinker } from "./turn.mjs";
import { cleanNature } from "./bands.mjs";
import { PRONOUNS, formsOf, guessPronoun, otherForms } from "./pronoun.mjs";

/* 2 since 0.26.0: "Works with others" became "Discipline" (five steps), and a library entry for a kind of group holds a band's nature. Older data is read as it was. */
export const MIND_SCHEMA = 2;
/** The profile's lines, in the order they are shown and sent. */
/* "pronoun" since 0.30.1 (R-2): how the module and Angel write about the creature. It leads, as on the Monster Minds page. */
export const LINES = ["pronoun", "mind", "goesFor", "fightsBy", "givesUp", "discipline", "knows", "notes"];
export const LINE_LABEL = { pronoun: "Pronoun", mind: "Mind", goesFor: "Goes for", fightsBy: "Fights by", givesUp: "Gives up", discipline: "Discipline", knows: "Knows about its enemies", notes: "Notes" };
/** Only these two keep a fixed pick underneath, because the module acts on them (Rhea's decision 2): how clever a plan may be, and who shares a group plan.
    The words are the prompt's (one place: prompt.mjs prints them), never repeated in a packet. */
export const MINDS = {
  mindless: { label: "Mindless", words: "no thought at all: it goes for whatever is nearest or last touched it, uses no tactics, never hides, waits or retreats on its own" },
  animal: { label: "Animal", words: "instinct and habit: it hunts, defends itself or its young and runs when hurt, with the tricks of its kind (a pack surrounds, an ambusher lies in wait) but no plans" },
  simple: { label: "Simple", words: "it thinks, slowly: obvious choices, one idea at a time, easily drawn off by whoever is in front of it" },
  cunning: { label: "Cunning", words: "quick and practical: it uses the ground, cover, numbers and dirty tricks, picks its targets and knows when a fight is lost" },
  tactician: { label: "Trained tactician", words: "drilled or brilliant: it plans the whole turn, sets up its allies, denies the enemy their best moves and keeps to a plan under pressure" }
};
/** Discipline (Rhea, 2026-11-11, R3-1 and R3-11): how a creature of this kind works with others, a five-step ladder set per kind of creature. It
    took the place of "Works with others" in 0.26.0 so that one thing has one home (design review 17): who leads is a mark on the band, not a pick. */
export const DISCIPLINES = {
  none: { label: "None", words: "it works with nobody: no plan reaches it and what its allies do is only part of the scenery (mindless things, loners)" },
  pack: { label: "Pack", words: "no orders and no plan, but by instinct it fights beside its own: it joins an ally on a target and helps surround, working off what it sees the others do" },
  loose: { label: "Loose", words: "it follows its band's plan while that suits it; when the plan and its own mind pull apart, its own mind wins" },
  trained: { label: "Trained", words: "its band's plan wins over its own leanings until its own \"givesUp\" line is reached" },
  drilled: { label: "Drilled", words: "its band's plan wins even at its own cost: only the plan's own fall-back or its leader falling releases it" }
};
/** "Works with others" picks from before 0.26.0, read as the Discipline nearest to them ("Is the leader" is now the leader mark on a band). */
const OLD_WORKS = { alone: "none", pack: "pack", follows: "loose", leads: "loose" };
const fromOld = v => v && typeof v === "object" ? (v.blank === true ? v : { ...v, pick: OLD_WORKS[v.pick] ?? undefined }) : typeof v === "string" ? v : null;
/** A layer's lines with an old "worksWith" read as "discipline" when there is no discipline line. */
const modern = lines => lines && typeof lines === "object" && "worksWith" in lines && !("discipline" in lines) ? { ...lines, discipline: lines.worksWith === null ? null : fromOld(lines.worksWith) } : lines;
export const PICKS = { pronoun: PRONOUNS, mind: MINDS, discipline: DISCIPLINES };
/** Suggestions only (Rhea: "I hope those were just examples"): every free line takes her own words. */
export const SUGGEST = {
  goesFor: ["the nearest", "the wounded", "whoever hurt it last", "casters and healers", "the biggest threat", "its goal"],
  fightsBy: ["charging straight in", "swarming one target", "hit and run", "keeping its distance", "ambush from hiding", "holding a spot"],
  givesUp: ["never", "when badly hurt", "when half its side is down", "when its leader falls", "when the prize is lost"],
  knows: ["nothing about them", "the basics: armour means tough, robes mean spells", "it has watched them fight before"],
  notes: []
};
/** Hard caps (design review 13). What a layer stores is what a packet carries, so nothing is cut behind the GM's back (0.24.0 review 8): 240
    characters a line, 600 for Notes. Blank lines are never sent. */
export const CAPS = { store: 240, storeNotes: 600, send: 240, sendNotes: 600, name: 80, pronoun: 60 };
/** "Knows about its enemies" belongs to one encounter, one monster or one fight: never the library (design review 10). */
export const LIBRARY_LINES = LINES.filter(l => l !== "knows");
export const BY = ["gm", "angel", "module"];
export const ENTRY_TYPES = ["people", "kind", "band"];

const str = (v, max) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** One line as a layer stores it, or null when it says nothing. A string is her words. `blank: true` is a line deliberately left empty, which stops
    the layers below from filling it (explicit blank against inherit, design review 9). `by` says whose words they are. */
export function cleanLine(key, v, by = null) {
  if (!LINES.includes(key) || v == null) return null;
  /* words with no pick for the Pronoun line are a pick ("she") or her own words ("xe / xem / xyr"): a brief or a chat may write it as a plain string (0.30.1 review 5) */
  let o = typeof v === "string" ? { text: v } : v; if (typeof o !== "object") return null;
  if (key === "pronoun" && !o.pick && typeof o.text === "string" && o.blank !== true) { const w = o.text.trim().toLowerCase(); o = Object.hasOwn(PRONOUNS, w) && w !== "other" ? { ...o, pick: w, text: "" } : { ...o, pick: "other" }; }
  const who = BY.includes(o.by) ? o.by : BY.includes(by) ? by : "gm", at = Number.isFinite(o.at) ? o.at : null;
  if (o.blank === true) return { blank: true, by: who, ...(at ? { at } : {}) };
  const pick = PICKS[key] && Object.hasOwn(PICKS[key], o.pick) ? o.pick : null;
  /* the Pronoun line is a pick alone; "other" keeps her own words ("xe / xem / xyr") and says nothing until they read as a pronoun */
  if (key === "pronoun") { const own = pick === "other" ? str(o.text, CAPS.pronoun) : ""; return !pick || (pick === "other" && !otherForms(own)) ? null : { pick, text: own, by: who, ...(at ? { at } : {}) }; }
  const text = cutWords(str(o.text, GATE_MAX), key === "notes" ? CAPS.storeNotes : CAPS.store);
  if (!text && !pick) return null;
  return { ...(pick ? { pick } : {}), text, by: who, ...(at ? { at } : {}) };
}
/** A layer's lines: known keys only, each cleaned. library: true drops "knows". */
export function cleanLines(lines, { by = null, library = false } = {}) {
  const out = {}; if (!lines || typeof lines !== "object") return out; lines = modern(lines);
  for (const k of library ? LIBRARY_LINES : LINES) { const l = cleanLine(k, lines[k], by); if (l) out[k] = l; }
  return out;
}
/** A library key from a name: lower case, words joined by dashes. */
export const slug = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const peopleKey = name => `people:${slug(name)}`;
export const bandKey = name => `band:${slug(name)}`;
/** What kind of creature this is, as a key that holds across encounters and worlds (design review 8): its compendium source when it has one; otherwise
    its name and level. Elite and Weak are the same kind as the creature they adjust: the prefix PF2e adds to the name is taken off and the level is the
    base creature's. facts: { source, name, level, adjustment } (adjustment "elite" | "weak" | null, as PF2e or the builder marks it). */
export function kindKey({ source = null, name = "", level = 0, adjustment = null, base = null } = {}) {
  if (typeof source === "string" && source.startsWith("Compendium.")) return `src:${source}`;
  return `name:${slug(baseName(name, adjustment))}|${baseLevel(level, adjustment, base)}`;
}
export const baseName = (name, adjustment = null) => { const n = String(name ?? "").trim(); return adjustment === "elite" ? n.replace(/^elite\s+/i, "") : adjustment === "weak" ? n.replace(/^weak\s+/i, "") : n; };
/* PF2e (8.7.0, seen 2026-11-13) reports the adjusted level, with Elite +2 at level -1 or 0 and Weak -2 at level 1, and keeps the base level in the
   actor's source: `base` is that, when known (0.33.1, review). Without it the adjusted level is turned back as well as it can be: Elite 1 can only
   be from -1, Weak -1 is taken as from 1 (from 0 it would be -1 too). */
export const baseLevel = (level, adjustment = null, base = null) => {
  if (adjustment && Number.isFinite(base)) return base;
  const l = Number(level) || 0;
  return adjustment === "elite" ? l - (l <= 1 ? 2 : 1) : adjustment === "weak" ? l + (l === -1 ? 2 : 1) : l;
};

/** A library entry, cleaned: { schema, type, key, name, people, lines }. A kind names its people explicitly (their key, or null): the module never
    guesses it. A people or a band has none. */
export function cleanEntry(e = {}) {
  const type = ENTRY_TYPES.includes(e.type) ? e.type : "kind", name = str(e.name, CAPS.name);
  const key = str(e.key, 200) || (type === "people" ? peopleKey(name) : type === "band" ? bandKey(name) : "");
  if (!key || !name || /^(people|band):$/.test(key)) return null;   /* a name of punctuation alone makes no key */
  /* a kind of group holds a band's nature and no profile lines (design review 5: the six lines were cleaned into it and the group's own dropped) */
  if (type === "band") return { schema: MIND_SCHEMA, type, key, name, people: null, lines: {}, nature: cleanNature(e.nature) };
  return { schema: MIND_SCHEMA, type, key, name, people: type === "kind" && typeof e.people === "string" && e.people.startsWith("people:") ? e.people : null, lines: cleanLines(e.lines, { library: true }) };
}
/** The Mind and Discipline a stat block alone suggests, so that nothing plays blank. A guess, and marked as the module's: the Mindless trait;
    otherwise Intelligence (-4 or less animal, -3 or -2 simple, -1 to +2 cunning, +3 or more a trained tactician); a mindless creature has no
    discipline, an animal is Pack (Rhea, R3-11), a trained tactician is Trained and anything else that thinks is Loose. Drilled is never guessed.
    The pronoun (Rhea, 2026-11-13): "it" for an animal or a mindless creature, "they" for anything that thinks, until she or a brief says otherwise.
    facts: { traits, int } */
export function fromStatBlock({ traits = [], int = null } = {}) {
  const t = (traits ?? []).map(x => String(x).toLowerCase()), n = Number(int);
  const mind = t.includes("mindless") ? "mindless" : !Number.isFinite(n) || int === null ? "simple" : n <= -4 ? "animal" : n <= -2 ? "simple" : n <= 2 ? "cunning" : "tactician";
  const discipline = mind === "mindless" ? "none" : mind === "animal" ? "pack" : mind === "tactician" ? "trained" : "loose";
  return { pronoun: { pick: guessPronoun({ traits: t, mind }), text: "", by: "module" }, mind: { pick: mind, text: "", by: "module" }, discipline: { pick: discipline, text: "", by: "module" } };
}
/** The layers a profile is read from, most specific first (Rhea's decisions 6 and 8, design review 7): what was agreed in this fight; the monster's
    own; this encounter's for its kind; its kind in the library; its people in the library; the stat block. */
export const LAYERS = ["fight", "own", "encounter", "kind", "people", "statblock"];
export const LAYER_WORDS = { fight: "this fight", own: "its own", encounter: "this encounter", kind: "kind", people: "people", statblock: "stat block" };
/** One profile from its layers: for each line the most specific layer that says anything wins, whole (a pick and its words go together); a line a
    layer left deliberately blank stays blank. A monster with its own profile stops following its kind's (decision 6): an own layer is the whole
    profile, so nothing below it is read except the stat block's Mind when its own gives none. layers: [{ from, name, lines }] in any order.
    Out: { lines: { key: { pick, text, by, from, name } }, own } with only lines that say something. */
export function assemble(layers = []) {
  const byFrom = new Map(); for (const l of layers ?? []) if (l && LAYERS.includes(l.from) && l.lines) byFrom.set(l.from, l);
  const own = byFrom.has("own"), order = LAYERS.filter(f => byFrom.has(f) && !(own && ["encounter", "kind", "people"].includes(f)));
  const lines = {};
  for (const k of LINES) for (const f of order) { const layer = byFrom.get(f), l = layer.lines[k]; if (!l) continue;
    if (!l.blank) lines[k] = { ...(l.pick ? { pick: l.pick } : {}), text: l.text ?? "", by: l.by ?? "gm", from: f, ...(layer.name ? { name: layer.name } : {}) };
    break; }
  return { lines, own };
}
/** A line in words, for the packet and the windows: a pick's label, then her words. */
export function lineWords(key, l) {
  if (!l) return ""; if (key === "pronoun") return l.pick === "other" ? String(l.text ?? "").trim() : PRONOUNS[l.pick]?.label ?? "";
  const label = l.pick ? PICKS[key]?.[l.pick]?.label ?? "" : "", text = String(l.text ?? "").trim();
  return label && text ? `${label}. ${text}` : label || text;
}
const GATE_MAX = 8000;
/** Text no longer than max, cut at the end of a word when it has to be cut. */
export function cutWords(text, max) { const s = String(text ?? ""); if (s.length <= max) return s; const cut = s.slice(0, max + 1), at = cut.lastIndexOf(" "); return (at > max * .5 ? cut.slice(0, at) : s.slice(0, max)).trim(); }
/** The names a party-side creature can be called by in a line (0.24.0 review 2): its whole name, and each word of it of `min` letters or more
    (brackets left out; "the", "of" and the like never count), so a first name or a surname alone is caught. A character's words count from 3
    letters; any other creature's from 4. */
const SMALL = new Set(["the", "and", "von", "van", "der", "del", "des", "for", "mac"]);
export function namesFor(name, min = 3) {
  const full = String(name ?? "").trim(); if (!full) return [];
  const words = full.replace(/\([^)]*\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= min && !SMALL.has(w.toLowerCase()));
  return [...new Set([full, ...words])];
}
/** What one packet carries (design reviews 1 and 13): each line in words, capped, blank ones left out, in the fixed order. Free text goes through the
    same gate as the GM's note to Angel: a name of someone on the party's side becomes that creature's label when this monster perceives it, and a
    line naming anyone it doesn't perceive (or a name that fits several it does) is held back whole, since even "someone" would tell it they exist.
    people: [{ names, label }] as for `noteForThinker`, label null for a creature it doesn't perceive. Out: { mind, held: [{ key, unknown, ambiguous }] };
    `mind` is null when nothing is left to send. The picks' ids ride along ("pick": { mind, discipline }) so the prompt's meaning for them is found. */
export function forPacket(assembled, people = []) {
  const out = {}, pick = {}, held = [];
  for (const k of LINES) { const l = assembled?.lines?.[k]; if (!l) continue;
    /* the pronoun goes as its three words ("she/her/her"): no free text, so no gate, and no pick id (the prompt has nothing to look up) */
    if (k === "pronoun") { const f = formsOf(l); out[k] = `${f.they}/${f.them}/${f.their}`; continue; }
    /* the gate reads the whole text and the cap comes after, at a word's end: a name cut in half by the cap would pass as no name (0.24.0 review 1) */
    const max = k === "notes" ? CAPS.sendNotes : CAPS.send, g = noteForThinker(String(l.text ?? ""), people, GATE_MAX); g.text = cutWords(g.text, max);
    if (g.unknown.length || g.ambiguous.length) { held.push({ key: k, unknown: g.unknown, ambiguous: g.ambiguous }); if (!l.pick) continue; }
    const words = lineWords(k, { pick: l.pick, text: g.unknown.length || g.ambiguous.length ? "" : g.text }); if (!words) continue;
    out[k] = words; if (l.pick) pick[k] = l.pick; }
  if (!Object.keys(out).length) return { mind: null, held };
  return { mind: { ...(Object.keys(pick).length ? { pick } : {}), ...out }, held };
}
/** Words that read like numbers off a sheet (design review 1): a warning at save, nothing more. */
const STAT_WORDS = /\b(AC|HP|hit points?|armor class|saves?|saving throws?|fortitude|reflex|will save|perception DC|DC ?\d+|level ?\d+|\d+(st|nd|rd|th)[- ]level|spell slots?|\+\d+ to hit)\b/i;
/** What to warn the GM of when a line is saved: names of people on the party's side (a monster only gets that line while it perceives them), and stat
    words. people: [{ names }]. Out: { names: [...], stats: bool }. Library text should name nobody: it is used in every encounter. */
export function lineWarnings(text, people = []) {
  const g = noteForThinker(String(text ?? ""), (people ?? []).map(p => ({ names: p.names, label: null })), GATE_MAX);
  return { names: g.unknown, stats: STAT_WORDS.test(String(text ?? "")) };
}
/** New lines over a layer's own. Angel never replaces hers unasked (design review 9): a line whose words are the GM's is left alone unless `force`
    (she asked) or the writer is the GM. `null` for a key removes that line (back to inherit); the same rule protects hers. `now` stamps each line
    written with when. A line is written whole: a pick alone replaces the pick and its words. Out: { lines, skipped }. */
export function applyLines(current = {}, incoming = {}, { by = "gm", force = false, library = false, now = null, keepBy = false } = {}) {
  const lines = { ...cleanLines(current, { library }) }, skipped = []; incoming = modern(incoming);
  for (const k of library ? LIBRARY_LINES : LINES) { if (!(k in (incoming ?? {}))) continue;
    if (by !== "gm" && !force && lines[k]?.by === "gm") { skipped.push(k); continue; }
    /* the writer is who the call says, never who the line says (0.24.0 review 3), unless the caller is moving existing lines between layers (keepBy) */
    const l = incoming[k] === null ? null : cleanLine(k, typeof incoming[k] === "string" ? { text: incoming[k], by } : { ...incoming[k], by: keepBy && BY.includes(incoming[k]?.by) ? incoming[k].by : by }, by);
    if (l) lines[k] = now ? { ...l, at: now } : l; else delete lines[k]; }
  return { lines, skipped };
}
/** Save to library, line by line with a preview (design review 10): what an encounter's lines would change in the kind's library entry. "knows" never
    goes; a line already the same isn't listed. Out: [{ key, from, to }] in words. */
export function libraryChanges(encounterLines = {}, entryLines = {}) {
  const out = []; for (const k of LIBRARY_LINES) { const a = encounterLines?.[k]; if (!a || a.blank) continue;
    const b = entryLines?.[k], to = lineWords(k, a), from = b && !b.blank ? lineWords(k, b) : ""; if (to && to !== from) out.push({ key: k, from, to }); }
  return out;
}
/** The library as a file: { schema, exported, entries }. */
export const exportData = (entries = [], now = Date.now()) => ({ module: "lythara-encounter-builder", what: "minds-library", schema: MIND_SCHEMA, exported: now, entries: (entries ?? []).map(cleanEntry).filter(Boolean).sort((a, b) => a.key.localeCompare(b.key)) });
/** An import, before anything is written (design review 8): each incoming entry is `new` (no such key here), `match` (the same lines, name and
    people) or `collision` (the key is here with something different; the GM chooses which to keep). A file from a newer schema is refused whole.
    Out: { ok, reason, rows: [{ status, entry, mine }] }. */
export function importPlan(existing = [], data = null) {
  if (!data || data.what !== "minds-library" || !Array.isArray(data.entries)) return { ok: false, reason: "That file isn't a Minds Library export.", rows: [] };
  if (!Number.isFinite(data.schema) || data.schema > MIND_SCHEMA) return { ok: false, reason: `That file is from a newer version of the module (schema ${data.schema}; this one reads ${MIND_SCHEMA}).`, rows: [] };
  const mine = new Map((existing ?? []).map(cleanEntry).filter(Boolean).map(e => [e.key, e])), rows = [], seen = new Set();
  const core = e => ({ type: e.type, name: e.name, people: e.people, lines: Object.fromEntries(Object.entries(e.lines).map(([k, l]) => [k, { pick: l.pick ?? null, text: l.text ?? "", blank: !!l.blank }])), nature: Object.fromEntries(Object.entries(e.nature ?? {}).map(([k, l]) => [k, { pick: l.pick ?? null, text: l.text ?? "" }])) });
  for (const raw of data.entries) { const e = cleanEntry(raw); if (!e || seen.has(e.key)) continue; seen.add(e.key);
    const m = mine.get(e.key); rows.push({ status: !m ? "new" : same(core(m), core(e)) ? "match" : "collision", entry: e, mine: m ?? null }); }
  return { ok: true, reason: null, rows };
}
/** A brief as a chat hands it in (0.24.0 review 3): its mind lines are Angel's unless a line says they are the GM's own words (she dictated them);
    a row's `tactics` text too. The Build window's lines are the GM's and don't come through here. */
export function stampBrief(brief, by = "angel") {
  const lines = v => v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, l]) => [k, typeof l === "string" ? { text: l, by } : l && typeof l === "object" && !BY.includes(l.by) ? { ...l, by } : l])) : {};
  const part = v => typeof v === "string" ? { text: v, by } : v && typeof v === "object" && !BY.includes(v.by) ? { ...v, by } : v;
  const bands = (Array.isArray(brief?.bands) ? brief.bands : []).map(b => b && typeof b === "object" ? { ...b, ...(b.leader && typeof b.leader === "object" ? { leader: part(b.leader) } : {}), nature: lines(b.nature),
    plan: { ...(b.plan ?? {}), ...(b.plan?.objective != null ? { objective: part(b.plan.objective) } : {}), jobs: (Array.isArray(b.plan?.jobs) ? b.plan.jobs : []).map(part), ...(b.plan?.fallBack && typeof b.plan.fallBack === "object" ? { fallBack: { ...part(b.plan.fallBack), ...(b.plan.fallBack.when != null ? { when: part(b.plan.fallBack.when) } : {}) } } : {}) } } : b);
  return { ...(brief ?? {}), ...(bands.length ? { bands } : {}), creatures: (Array.isArray(brief?.creatures) ? brief.creatures : []).map(c => { const mind = lines(c?.mind); if (String(c?.tactics ?? "").trim() && !mind.notes) mind.notes = { text: c.tactics, by };
    const { tactics, ...rest } = c ?? {}; return { ...rest, mind, own: c?.own && typeof c.own === "object" ? Object.fromEntries(Object.entries(c.own).map(([n, v]) => [n, lines(v)])) : {} }; }) };
}
/** A brief handed in by Angel over one that is there (0.33.1, review: it replaced the GM's own lines in this encounter and in single monsters'
    profiles): each row's lines are laid over the row it matches (same uuid, else same place and name) with `applyLines`, so a line whose words are
    the GM's stays. Both briefs stamped. Out: { brief, skipped: [{ row, n?, lines }] }. Pure. */
export function mergeBrief(old, next, { by = "angel", force = false } = {}) {
  const was = Array.isArray(old?.creatures) ? old.creatures : [], skipped = [];
  if (by === "gm" || force || !was.length) return { brief: next, skipped };
  const creatures = (next.creatures ?? []).map((c, g) => {
    const o = (c.uuid ? was.find(x => x?.uuid === c.uuid) : null) ?? (was[g] && (was[g].name ?? "") === (c.name ?? "") ? was[g] : null); if (!o) return c;
    const m = applyLines(o.mind ?? {}, c.mind ?? {}, { by }); if (m.skipped.length) skipped.push({ row: g, lines: m.skipped });
    const own = { ...(o.own ?? {}) };
    for (const [n, v] of Object.entries(c.own ?? {})) { const r = applyLines(own[n] ?? {}, v ?? {}, { by }); if (r.skipped.length) skipped.push({ row: g, n: +n, lines: r.skipped }); own[n] = r.lines; }
    return { ...c, mind: m.lines, own };
  });
  return { brief: { ...next, creatures }, skipped };
}
/** A brief row's encounter mind (decision 11: profiles replace the Tactics page). A row's old `tactics` text is that kind's notes for the encounter
    when the row has no notes of its own. Out: lines. */
export function rowLines(row = {}) {
  const lines = cleanLines(row.mind); if (!lines.notes && String(row.tactics ?? "").trim()) lines.notes = cleanLine("notes", { text: row.tactics, by: "gm" });
  return lines;
}
/** A row's single-monster profiles, by the monster's number in the row ("0", "1", ...): each a whole profile (decision 6). */
export function rowOwn(row = {}, count = 30) {
  const out = {}; for (const [k, v] of Object.entries(row.own && typeof row.own === "object" ? row.own : {})) { const n = Number(k); if (!Number.isInteger(n) || n < 0 || n >= count) continue; const l = cleanLines(v); if (Object.keys(l).length) out[String(n)] = l; }
  return out;
}
