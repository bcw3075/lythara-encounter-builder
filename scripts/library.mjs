/* Lythara Encounter Builder: monster minds in Foundry (0.24.0). Where each layer of a profile is kept and how a monster's profile is put together:
   the Minds Library (one GM-only journal, one page per entry, the entry in the page's flags: Rhea's decisions 8 and 9, design review 9), this
   encounter's lines in the brief on the scene (design review 10), a single monster's own profile, and what was agreed in this fight on the Combat.
   The rules themselves are pure, in minds.mjs. Everything here writes as a GM only. */
import { ID } from "./builder.mjs";
import { cleanBrief } from "./brief.mjs";
import { nameWords } from "./turn.mjs";
import { MIND_SCHEMA, LINES, applyLines, assemble, baseName, baseLevel, cleanEntry, cleanLines, exportData, forPacket, fromStatBlock, importPlan, kindKey, rowLines } from "./minds.mjs";

const LIBRARY_NAME = "Minds Library (Encounter Builder)";
const gmOnly = () => { if (!game.user.isGM) throw new Error("Only a GM can do this."); };
const NONE = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;

/* ---------- the library ---------- */
/** The library's journal, or null before anything was saved to it. GM-only: no ownership for anyone, pages inherit. */
export const libraryJournal = () => game.journal.find(j => j.getFlag(ID, "mindsLibrary")) ?? null;
let making = null;
async function ensureLibrary() {
  gmOnly(); const have = libraryJournal(); if (have) return have;
  /* one create at a time on this page: two saves in a row must not make two journals */
  making ??= JournalEntry.create({ name: LIBRARY_NAME, ownership: { default: NONE() }, flags: { [ID]: { mindsLibrary: { schema: MIND_SCHEMA } } } }).finally(() => { making = null; });
  return making;
}
/* key → { entry, page }: read at every packet, so kept until a page of the library changes (main.mjs calls dropLibraryCache from the journal hooks) */
let index = null;
export const dropLibraryCache = () => { index = null; };
function libraryIndex() {
  if (index) return index; index = new Map(); const j = libraryJournal(); if (!j) return index;
  for (const page of j.pages) { const e = cleanEntry(page.getFlag(ID, "mind")); if (e && !index.has(e.key)) index.set(e.key, { entry: e, page }); }
  return index;
}
export const libraryEntries = () => [...libraryIndex().values()].map(x => x.entry);
export const libraryGet = key => libraryIndex().get(key)?.entry ?? null;
const pageText = e => `<p>${foundry.utils.escapeHTML(e.type === "people" ? "A people or family" : e.type === "band" ? "A kind of group" : "A kind of creature")} in the Minds Library. Read and edit it in the Minds Library window (the Encounters tools); what is typed on this page is not used.</p>`;
/** Save an entry: its lines are laid over what the library has (minds.mjs `applyLines`: Angel never replaces the GM's words unless `force`; a line
    given as null goes back to inherit). `by` is "gm" or "angel". Out: { entry, skipped, created }. */
export async function libraryPut(raw, { by = "gm", force = false } = {}) {
  gmOnly(); const want = cleanEntry({ ...raw, lines: {} }); if (!want) throw new Error("A library entry needs a name.");
  const have = libraryIndex().get(want.key), { lines, skipped } = applyLines(have?.entry.lines ?? {}, raw.lines ?? {}, { by, force, library: true, now: Date.now() });
  const entry = { ...want, people: raw.people === undefined && have ? have.entry.people : want.people, lines };
  if (entry.type === "kind" && entry.people && !libraryGet(entry.people)) throw new Error("That people isn't in the library.");
  const j = await ensureLibrary();
  if (have) await have.page.update({ name: entry.name, [`flags.${ID}.==mind`]: entry });
  else await j.createEmbeddedDocuments("JournalEntryPage", [{ name: entry.name, type: "text", text: { content: pageText(entry), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }, flags: { [ID]: { mind: entry } } }]);
  dropLibraryCache(); return { entry, skipped, created: !have };
}
/** Remove an entry (the GM's own press: nothing else calls it). A people's kinds stay, with no people. */
export async function libraryRemove(key) {
  gmOnly(); const have = libraryIndex().get(key); if (!have) return false;
  if (have.entry.type === "people") for (const x of [...libraryIndex().values()]) if (x.entry.people === key) await x.page.update({ [`flags.${ID}.==mind`]: { ...x.entry, people: null } });
  await have.page.delete(); dropLibraryCache(); return true;
}
export const libraryExport = () => exportData(libraryEntries());
/** Import a library file. Without `apply` nothing is written and the plan comes back (new, match, collision per entry). With it, new entries are added
    and a collision is replaced only when `theirs` names its key (the GM's choice, entry by entry). Peoples go first so their kinds find them. */
export async function libraryImport(data, { apply = false, theirs = [] } = {}) {
  const plan = importPlan(libraryEntries(), data); if (!apply || !plan.ok) return plan;
  gmOnly(); const j = await ensureLibrary(), take = new Set(theirs); let added = 0, replaced = 0, kept = 0;
  const rows = [...plan.rows].sort((a, b) => (a.entry.type === "people" ? 0 : 1) - (b.entry.type === "people" ? 0 : 1));
  for (const r of rows) {
    if (r.status === "match") continue;
    if (r.status === "collision" && !take.has(r.entry.key)) { kept++; continue; }
    const have = libraryIndex().get(r.entry.key);
    if (have) { await have.page.update({ name: r.entry.name, [`flags.${ID}.==mind`]: r.entry }); replaced++; }
    else { await j.createEmbeddedDocuments("JournalEntryPage", [{ name: r.entry.name, type: "text", text: { content: pageText(r.entry), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }, flags: { [ID]: { mind: r.entry } } }]); added++; }
    dropLibraryCache();
  }
  return { ...plan, added, replaced, kept };
}

/* ---------- what kind of creature ---------- */
/** The facts `kindKey` needs. A built monster is a copy: its actor's flag names what it was copied from and how it was adjusted. A world actor that
    came from a compendium is that compendium creature's kind; one that didn't goes by its name and level. */
export function kindFacts(actor) {
  if (!actor) return null;
  const flagged = actor.getFlag?.(ID, "source") ?? null, from = flagged && !flagged.startsWith("Compendium.") ? fromUuidSync(flagged) : null, base = from ?? actor;
  const adjustment = actor.getFlag?.(ID, "adjust") || actor.system?.attributes?.adjustment || null;
  const source = flagged?.startsWith("Compendium.") ? flagged : base._stats?.compendiumSource ?? null;
  const facts = { source: typeof source === "string" && source.startsWith("Compendium.") ? source : null, name: from ? from.name : actor.name, level: from ? from.level : actor.level, adjustment: from ? null : adjustment };
  return { ...facts, key: kindKey(facts), kindName: baseName(facts.name, facts.adjustment), baseLevel: baseLevel(facts.level, facts.adjustment) };
}
const statFacts = actor => ({ traits: actor?.system?.traits?.value ?? [], int: actor?.system?.abilities?.int?.mod ?? null, abilities: (actor?.items ?? []).filter(i => i.type === "action").map(i => i.name) });

/* ---------- this encounter ---------- */
const briefOf = scene => { const b = scene?.getFlag(ID, "brief"); return b ? cleanBrief(b) : null; };
/** Where a token stands in the build on its scene: { row, n } (its brief row and its number in the row), or null for a creature the build didn't place. */
export function builtRef(scene, tok) {
  const b = scene?.getFlag(ID, "build"); if (!b || tok?.getFlag(ID, "built") !== b.id) return null;
  const m = String(tok.getFlag(ID, "key") ?? "").match(/^c(\d+)-(\d+)$/); return m && scene.getFlag(ID, "brief")?.creatures?.[+m[1]] ? { row: +m[1], n: +m[2] } : null;
}
/* a kind the build didn't place keeps this encounter's lines on the scene, as a list (a kind's key has dots in it, which a flag's key can't) */
const looseOf = scene => (scene?.getFlag(ID, "minds") ?? []).filter(x => x && typeof x.kind === "string");
/** The layers a monster's profile is read from (minds.mjs `assemble` puts them in order). A creature on the party's side that Angel plays for the GM has
    only a profile the GM gave it herself: never the monsters' library (settled with Rhea, 2026-11-10). */
export function mindLayers(scene, tok, combat = null) {
  const actor = tok?.actor; if (!actor) return [];
  const mine = cleanLines(tok.getFlag(ID, "mind"));
  if (actor.alliance === "party") return Object.keys(mine).length ? [{ from: "own", lines: mine }] : [];
  const kind = kindFacts(actor), ref = builtRef(scene, tok), brief = ref ? briefOf(scene) : null, row = brief?.creatures[ref.row] ?? null, layers = [];
  const fight = combat?.getFlag(ID, "minds") ?? null, agreed = cleanLines(fight?.own?.[tok.id] ?? (fight?.kinds ?? []).find(x => x?.kind === kind.key)?.lines);
  if (Object.keys(agreed).length) layers.push({ from: "fight", lines: agreed });
  const own = row ? row.own[String(ref.n)] : Object.keys(mine).length ? mine : null; if (own) layers.push({ from: "own", lines: own });
  const here = row ? rowLines(row) : cleanLines(looseOf(scene).find(x => x.kind === kind.key)?.lines); if (Object.keys(here).length) layers.push({ from: "encounter", lines: here });
  const entry = libraryGet(kind.key); if (entry) layers.push({ from: "kind", name: entry.name, lines: entry.lines });
  const people = entry?.people ? libraryGet(entry.people) : null; if (people) layers.push({ from: "people", name: people.name, lines: people.lines });
  layers.push({ from: "statblock", lines: fromStatBlock(statFacts(actor)) });
  return layers;
}
/** Who a profile's free text may not name unless the monster perceives them: everyone on the party's side on the scene (a character also by each long
    word of its name), every other character in the world and every user. labelOf(tokenId): that creature's label when this monster perceives it or
    knows it as an ally, else null. The same shape `noteForThinker` takes for the GM's note. */
export function partyPeople(scene, labelOf = () => null) {
  const out = [], onScene = new Set(), names = (...ns) => [...new Set(ns.filter(Boolean))];
  for (const t of scene?.tokens.contents ?? []) { const a = t.actor; if (!a || a.alliance !== "party") continue; onScene.add(a.id); const isChar = !!a.isOfType?.("character");
    out.push({ names: names(t.name, a.name, ...(isChar ? [...nameWords(t.name), ...nameWords(a.name)] : [])), label: labelOf(t.id) ?? null }); }
  for (const a of game.actors.filter(x => x.isOfType?.("character") && !onScene.has(x.id))) out.push({ names: names(a.name, ...nameWords(a.name)), label: null });
  for (const u of game.users) out.push({ names: [u.name], label: null });
  return out;
}
/** A monster's profile as things stand: { assembled, mind, held } (`mind` is what its packet carries, null when nothing is left to say). */
export function mindOf(scene, tok, combat = null, labelOf = () => null) {
  const assembled = assemble(mindLayers(scene, tok, combat)), { mind, held } = forPacket(assembled, partyPeople(scene, labelOf));
  return { assembled, mind, held };
}

/* ---------- writing this encounter's lines ---------- */
const writeBrief = (scene, brief) => scene.update({ [`flags.${ID}.==brief`]: cleanBrief(brief) });
/** Change lines of a profile on a scene. ref says whose: { row } a build row's kind for this encounter; { row, n } one built monster's own;
    { kind } a kind the build didn't place, for this scene; { token } one such monster's own. lines: key → words, { pick, text }, or null to take the
    line away. Angel never replaces the GM's words unless `force`. Out: { lines, skipped }. */
export async function setLines(scene, ref, lines, { by = "gm", force = false } = {}) {
  gmOnly(); const opts = { by, force, now: Date.now() };
  if (Number.isInteger(ref?.row)) {
    const brief = briefOf(scene), row = brief?.creatures[ref.row]; if (!row) throw new Error("This map's build has no such row.");
    if (Number.isInteger(ref.n)) { if (ref.n < 0 || ref.n >= row.count) throw new Error("That row has no such monster."); const r = applyLines(row.own[String(ref.n)] ?? {}, lines, opts);
      if (Object.keys(r.lines).length) row.own[String(ref.n)] = r.lines; else delete row.own[String(ref.n)]; await writeBrief(scene, brief); return r; }
    const r = applyLines(row.mind, lines, opts); row.mind = r.lines; await writeBrief(scene, brief); return r;
  }
  if (ref?.token) { const tok = scene.tokens.get(ref.token); if (!tok) throw new Error("That token isn't on this scene.");
    const at = builtRef(scene, tok); if (at) return setLines(scene, at, lines, { by, force });
    const r = applyLines(tok.getFlag(ID, "mind") ?? {}, lines, opts); await tok.update({ [`flags.${ID}.==mind`]: Object.keys(r.lines).length ? r.lines : null }); return r; }
  if (typeof ref?.kind === "string") { const list = looseOf(scene), had = list.find(x => x.kind === ref.kind), r = applyLines(had?.lines ?? {}, lines, opts);
    const next = [...list.filter(x => x.kind !== ref.kind), ...(Object.keys(r.lines).length ? [{ kind: ref.kind, lines: r.lines }] : [])];
    await scene.update({ [`flags.${ID}.==minds`]: next }); return r; }
  throw new Error("Whose profile? Give a row, a row and number, a kind or a token.");
}
/** Give one monster its own profile (Rhea's decision 6): a copy of the profile it follows now, which then stops following its kind's. */
export async function giveOwn(scene, tok) {
  gmOnly(); const layers = mindLayers(scene, tok).filter(l => l.from !== "fight" && l.from !== "own"), a = assemble(layers);
  const lines = Object.fromEntries(LINES.filter(k => a.lines[k]).map(k => [k, { ...(a.lines[k].pick ? { pick: a.lines[k].pick } : {}), text: a.lines[k].text, by: a.lines[k].by }]));
  const at = builtRef(scene, tok);
  if (at) { const brief = briefOf(scene); brief.creatures[at.row].own[String(at.n)] = cleanLines(lines); await writeBrief(scene, brief); }
  else await tok.update({ [`flags.${ID}.==mind`]: cleanLines(lines) });
  return cleanLines(lines);
}
/** Take a monster's own profile away: it follows its kind again. */
export async function dropOwn(scene, tok) {
  gmOnly(); const at = builtRef(scene, tok);
  if (at) { const brief = briefOf(scene); delete brief.creatures[at.row].own[String(at.n)]; await writeBrief(scene, brief); }
  else await tok.update({ [`flags.${ID}.==mind`]: null });
}
/** Everything the Monster Minds window lists for a scene: the build's rows, then the kinds of monsters the build didn't place; under each, the
    monsters with a profile of their own. Party-side creatures Angel plays come last, each on its own. */
export function mindRows(scene) {
  const brief = briefOf(scene), build = scene?.getFlag(ID, "build"), rows = [], loose = new Map(), party = [];
  const npcs = (scene?.tokens.contents ?? []).filter(t => t.actor && (t.actor.alliance === "party" ? !!t.getFlag(ID, "run") : t.actor.isOfType?.("npc")));
  if (brief && build) brief.creatures.forEach((c, g) => { const toks = npcs.filter(t => { const r = builtRef(scene, t); return r?.row === g; });
    rows.push({ ref: { row: g }, name: c.name || toks[0]?.name || "Creature", count: toks.length || c.count, tokens: toks.map(t => t.id), uuid: c.uuid,
      own: Object.keys(c.own).map(n => { const t = toks.find(x => builtRef(scene, x)?.n === +n); return { ref: { row: g, n: +n }, name: t?.name ?? `${c.name} ${+n + 1}`, token: t?.id ?? null }; }) }); });
  for (const t of npcs) { if (builtRef(scene, t)) continue; const a = t.actor;
    if (a.alliance === "party") { party.push({ ref: { token: t.id }, name: t.name, count: 1, tokens: [t.id], party: true, own: [] }); continue; }
    if (t.getFlag(ID, "cache") || a.isOfType?.("loot")) continue;
    const k = kindFacts(a), row = loose.get(k.key) ?? { ref: { kind: k.key }, name: k.kindName, count: 0, tokens: [], own: [] }; row.count++; row.tokens.push(t.id);
    if (Object.keys(cleanLines(t.getFlag(ID, "mind"))).length) row.own.push({ ref: { token: t.id }, name: t.name, token: t.id });
    loose.set(k.key, row); }
  return [...rows, ...loose.values(), ...party];
}
/** The actor a row stands for: one of its tokens, or the creature its brief row names (async: a compendium creature has to be fetched). */
export async function rowActor(scene, row) { const t = (row.tokens ?? []).map(id => scene.tokens.get(id)).find(x => x?.actor); return t?.actor ?? (row.uuid ? await fromUuid(row.uuid).catch(() => null) : null); }
/** A row's profile for the window: its layers (without any one monster's own) and the result. For an own-profile ref, that monster's. */
export async function rowProfile(scene, row, ref = row.ref) {
  const tok = ref.token ? scene.tokens.get(ref.token) : Number.isInteger(ref.n) ? scene.tokens.contents.find(t => { const r = builtRef(scene, t); return r?.row === ref.row && r.n === ref.n; }) : (row.tokens ?? []).map(id => scene.tokens.get(id)).find(Boolean);
  const actor = tok?.actor ?? await rowActor(scene, row), single = !!ref.token || Number.isInteger(ref.n) || !!row.party;
  let layers;
  if (tok) layers = mindLayers(scene, tok).filter(l => l.from !== "fight" && (single || l.from !== "own"));
  else { /* no token left on the map: the brief row and the library still say what it would be */
    const kind = actor ? kindFacts(actor) : null, b = briefOf(scene), r = Number.isInteger(ref.row) ? b?.creatures[ref.row] : null, entry = kind ? libraryGet(kind.key) : null, people = entry?.people ? libraryGet(entry.people) : null;
    layers = [...(single && r?.own[String(ref.n)] ? [{ from: "own", lines: r.own[String(ref.n)] }] : []), ...(r && Object.keys(rowLines(r)).length ? [{ from: "encounter", lines: rowLines(r) }] : []), ...(entry ? [{ from: "kind", name: entry.name, lines: entry.lines }] : []), ...(people ? [{ from: "people", name: people.name, lines: people.lines }] : []), ...(actor ? [{ from: "statblock", lines: fromStatBlock(statFacts(actor)) }] : [])];
  }
  return { layers, assembled: assemble(layers), kind: actor && actor.alliance !== "party" ? kindFacts(actor) : null, token: tok?.id ?? null };
}
