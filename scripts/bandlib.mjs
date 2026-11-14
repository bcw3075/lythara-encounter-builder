/* Lythara Encounter Builder: bands in Foundry (0.26.0, monster minds 3a). Where a band is kept, who is in it, who leads it and what a member's packet
   carries of it. The rules are pure, in bands.mjs. A scene's bands live in its brief (so a Rebuild keeps them) or, on a scene with no brief, in the
   scene's `bands` flag; a build row belongs to the band its `band` names, and a monster the build didn't place to the band its token's `band` flag
   names (design review 4: read through the brief, never from a token's copy). Everything here writes as a GM only. */
import { ID } from "./builder.mjs";
import { builtRef, briefOf, kindFacts, libraryGet, mindLayers, partyPeople, writeBrief } from "./library.mjs";
import { assemble } from "./minds.mjs";
import { PLANNED, applyBand, bandForPacket, bandId, cleanBand, cleanBands, guessLeader, leaderFell, natureOf, nextInLine, shiftSpots } from "./bands.mjs";
export { PLANNED };

const gmOnly = () => { if (!game.user.isGM) throw new Error("Only a GM can do this."); };
/* on the monsters' side (0.30.0, R3-15): a creature that changed sides, to the party's or to nobody's, belongs to no band until it is back */
const isMonster = t => !!t?.actor && t.actor.isOfType?.("npc") && t.actor.alliance === "opposition" && !t.getFlag(ID, "cache");
/** A scene's bands: the brief's, then the scene's own list (bands made before the map had a brief stay there and are still read: 0.26.0 review 2).
    A key in both is the brief's. */
export function bandsOf(scene) { const mine = briefOf(scene)?.bands ?? [], have = new Set(mine.map(b => b.key)); return [...mine, ...cleanBands(scene?.getFlag(ID, "bands")).filter(b => !have.has(b.key))]; }
const inBrief = (scene, key) => !!briefOf(scene)?.bands.some(b => b.key === key);
/** The key of the band a monster belongs to, or "". A creature on the party's side belongs to none. */
export function bandKeyOf(scene, tok) {
  if (!isMonster(tok)) return ""; const ref = builtRef(scene, tok);
  return ref ? briefOf(scene)?.creatures[ref.row]?.band ?? "" : bandId(tok.getFlag(ID, "band"));
}
export const bandOf = (scene, tok) => { const key = bandKeyOf(scene, tok); return key ? bandsOf(scene).find(b => b.key === key) ?? null : null; };
/** A band's monsters on the scene, in the build's order, then those the build didn't place. One that got away is still a member. */
export const membersOf = (scene, key) => key ? (scene?.tokens.contents ?? []).filter(t => bandKeyOf(scene, t) === key) : [];
/** A monster's Discipline as its mind stands (its pick; Loose when a line of words has no pick under it). */
export function disciplineOf(scene, tok, combat = null) { return assemble(mindLayers(scene, tok, combat)).lines.discipline?.pick ?? "loose"; }
/** The languages on a creature's sheet (their slugs). Telepathy and a language it understands but can't speak aren't told apart. */
export const langsOf = actor => [...(actor?.system?.details?.languages?.value ?? [])];
const speaks = actor => langsOf(actor).length > 0;
/** What this fight has changed of a band (0.28.0, the Combat's `bands` flag, written by the runner when a leader falls): { leader: { token },
    fell: { was, state, round, pick }, planGone, objective, nature }. */
export const fightBand = (combat, key) => combat?.getFlag(ID, "bands")?.[key] ?? null;
const fact = (scene, t, combat) => ({ id: t.id, level: t.actor?.level ?? 0, speaks: speaks(t.actor), discipline: disciplineOf(scene, t, combat) });
/** Who leads a band: the monster marked (in the Monster Minds window or by the brief), else the module's guess (bands.mjs `guessLeader`: the
    highest-level member that follows a leader and can speak), counted over every member, fallen or not, so the guess doesn't move on when the leader
    drops. Out: { tok, guessed, gone } (`gone`: one was marked and its token is no longer on the scene); `tok` null when the band has no leader. */
export function leaderOf(scene, band, combat = null) {
  if (!band) return { tok: null, guessed: false, gone: false }; const members = membersOf(scene, band.key), mark = band.leader;
  /* the one who took over in this fight (0.28.0: "Next in line takes over", acted on by the module) leads for as long as its token is there */
  const took = fightBand(combat, band.key)?.leader?.token, heir = took ? members.find(t => t.id === took) : null; if (heir) return { tok: heir, guessed: false, gone: false, took: true };
  if (mark) { const tok = mark.token ? members.find(t => t.id === mark.token) : members.find(t => { const r = builtRef(scene, t); return r?.row === mark.row && r.n === mark.n; }); return { tok: tok ?? null, guessed: false, gone: !tok }; }
  const id = guessLeader(members.map(t => fact(scene, t, combat)));
  return { tok: id ? scene.tokens.get(id) : null, guessed: true, gone: false };
}
/** A band's named second (0.28.0), or null. */
export function secondOf(scene, band) { const mark = band?.second; if (!mark) return null; const members = membersOf(scene, band.key);
  return (mark.token ? members.find(t => t.id === mark.token) : members.find(t => { const r = builtRef(scene, t); return r?.row === mark.row && r.n === mark.n; })) ?? null; }
/** The kinds of creature in a band, each with the id an order names its job by (orders.mjs `jobKey`: "r2" for a build row, "k0" for a kind the
    build didn't place, by its place among those), its name and its monsters. */
export function jobGroups(scene, band) {
  const rows = briefOf(scene)?.creatures ?? [], groups = new Map(), loose = new Map();
  rows.forEach((c, g) => { if (c.band === band.key) groups.set(`r${g}`, { id: `r${g}`, ref: { row: g }, name: c.name || "Creature", tokens: [] }); });
  for (const t of membersOf(scene, band.key)) { const r = builtRef(scene, t);
    if (r) { groups.get(`r${r.row}`)?.tokens.push(t.id); continue; }
    /* the id comes from the kind's own key, not from its place on a list, so it stays the same when another kind's last token leaves the map
       (0.28.0 review 11: a standing job order would pass to the next kind) */
    const kind = kindFacts(t.actor); if (!loose.has(kind.key)) { let n = [...kind.key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000, 7); while (groups.has(`k${n}`)) n = (n + 1) % 1000; loose.set(kind.key, `k${n}`); groups.set(`k${n}`, { id: `k${n}`, ref: { kind: kind.key }, name: kind.kindName, tokens: [] }); }
    groups.get(loose.get(kind.key)).tokens.push(t.id); }
  return [...groups.values()];
}
/** The layers a band's nature is read from (bands.mjs `natureOf`): this fight's (the Combat's `bands` flag: nothing writes it before tier 3b), this
    encounter's, the kind of group in the library it starts from, and the brief's own "what they want". */
export function natureLayers(scene, band, combat = null) {
  const layers = [], fight = combat?.getFlag(ID, "bands")?.[band.key]?.nature; if (fight) layers.push({ from: "fight", nature: cleanBand({ key: band.key, nature: fight }).nature });
  layers.push({ from: "encounter", nature: band.nature });
  const entry = band.lib ? libraryGet(band.lib) : null; if (entry?.type === "band") layers.push({ from: "library", name: entry.name, nature: entry.nature ?? {} });
  const want = briefOf(scene)?.want; if (want) layers.push({ from: "brief", nature: cleanBand({ key: band.key, nature: { want: { text: want, by: "module" } } }).nature });
  return layers;
}
/** A band's plan as a member is told it: the band's own, with the brief's "how they retreat" as when it falls back when the band says nothing.
    In a fight (0.28.0): a band that fell apart has no plan left, and one that fights harder has its new objective. */
export function planOf(scene, band, combat = null) { const retreat = briefOf(scene)?.retreat, f = band.plan.fallBack ?? {}, now = fightBand(combat, band.key);
  if (now?.planGone) return { jobs: [], fallBack: {} };
  const plan = !f.when && retreat ? { ...band.plan, fallBack: cleanBand({ key: band.key, plan: { fallBack: { ...f, when: { text: retreat, by: "module" } } } }).plan.fallBack } : band.plan;
  return now?.objective ? { ...plan, objective: { text: String(now.objective), by: "module" } } : plan; }
/** What a monster's packet carries of its band, and the keys of any lines held back by the name gate.
    labelOf(tokenId): the label of a creature this monster is told of (itself, an ally it knows, an enemy it perceives), else null.
    fallen(tok): "down" | "dead" | "fled" | null, as the fight sees that creature now. Out: { band, bandNow, held }. */
export function bandPacket(scene, tok, combat, { labelOf = () => null, fallen = () => null, discipline = null } = {}) {
  const band = bandOf(scene, tok); if (!band) return { band: null, bandNow: null, held: [] };
  const mine = discipline ?? disciplineOf(scene, tok, combat), lead = leaderOf(scene, band, combat), ref = builtRef(scene, tok), rows = briefOf(scene)?.creatures ?? [];
  const nature = natureOf(natureLayers(scene, band, combat)), members = membersOf(scene, band.key);
  const nameOf = j => j.row != null ? rows[j.row]?.name ?? "" : (() => { const t = members.find(m => !builtRef(scene, m) && kindFacts(m.actor)?.key === j.kind); return t ? kindFacts(t.actor).kindName : ""; })();
  /* a leader the GM has hidden isn't there for the thinker, fallen or not (0.26.0 review 9); one that got away is hidden too, and that is told */
  /* a leader that changed sides, acted on by the module with any pick but "Next in line" (0.33.1, review): the band is told it turned, for good, and
     a member the guess would now make leader doesn't lead (for "Next in line" the one who took over leads, below) */
  const fell0 = fightBand(combat, band.key)?.fell, turnedAway = fell0?.state === "turned" && !lead.took && lead.tok?.id !== fell0.was;   /* back on its side, it leads again */
  const unseen = t => !!t?.hidden && !t.getFlag(ID, "escaped"), state = turnedAway ? "turned" : lead.gone ? "gone" : lead.tok && !unseen(lead.tok) ? fallen(lead.tok) : null, leads = !turnedAway && !!lead.tok && lead.tok.id === tok.id;
  const { band: out, held } = bandForPacket({ discipline: mine, nature, plan: planOf(scene, band, combat), me: { row: ref?.row, kind: ref ? null : kindFacts(tok.actor)?.key, leads: leads && !state }, leader: lead.tok && !leads && !turnedAway ? labelOf(lead.tok.id) : null, nameOf, people: partyPeople(scene, labelOf) });
  let bandNow = null;
  if (turnedAway) bandNow = leaderFell({ discipline: mine, state: "turned", falls: fell0.pick ?? null, next: null });
  else if (state && (lead.tok || lead.gone) && !leads) { const facts = members.filter(t => !unseen(t)).map(t => ({ ...fact(scene, t, combat), standing: !fallen(t) })), sec = secondOf(scene, band);
    /* until the module has acted on the fall, the same answer it will give: the named second first (0.28.0 review 13) */
    const next = nature.ifLeaderFalls?.pick !== "next" ? null : facts.some(m => m.id === sec?.id && m.id !== lead.tok?.id && m.standing && PLANNED.includes(m.discipline)) ? sec.id : nextInLine(facts, lead.tok?.id ?? null);
    bandNow = leaderFell({ discipline: mine, state, falls: nature.ifLeaderFalls?.pick ?? null, next: next ? (next === tok.id ? "you" : labelOf(next) ?? "another of its band") : null }); }
  /* the leader that fell earlier in this fight, once the module has acted on it (0.28.0): the band is still told, and who leads now */
  const fell = fightBand(combat, band.key)?.fell;
  if (!bandNow && fell?.state && !state && lead.took) bandNow =   /* only while another leads: a leader that got back up leads again and nobody is told it is down (review 7) */ leaderFell({ discipline: mine, state: fell.state, falls: fell.pick ?? null, next: lead.took && lead.tok ? (leads ? "you" : labelOf(lead.tok.id) ?? "another of its band") : null });
  return { band: out, bandNow, held };
}

/* ---------- writing ---------- */
/* each band is written back where it lives: the brief's in the brief, the scene's own in the scene's flag; a new one goes to the brief when the map has one */
const store = async (scene, bands) => { const brief = briefOf(scene), loose = new Set(cleanBands(scene.getFlag(ID, "bands")).map(b => b.key).filter(k => !inBrief(scene, k)));
  const own = bands.filter(b => loose.has(b.key) || !brief), mine = bands.filter(b => !loose.has(b.key) && brief);
  if (brief && (mine.length || brief.bands.length)) { brief.bands = mine; await writeBrief(scene, brief); }
  if (own.length || loose.size) await scene.update({ [`flags.${ID}.==bands`]: cleanBands(own) }); };
/** Change a band, or make it (give `name`). `change` as bands.mjs `applyBand` takes it. Angel never replaces the GM's words or choices unless `force`.
    Out: { band, skipped }. */
export async function setBand(scene, key, change = {}, { by = "gm", force = false } = {}) {
  gmOnly(); const bands = bandsOf(scene), id = bandId(key || change.name), i = bands.findIndex(b => b.key === id), rows = briefOf(scene)?.creatures ?? null;
  /* a new band is made only when a name is given: a mistyped key must not make an empty one (0.26.0 review 12) */
  if (!id) throw new Error("A band needs a name."); if (i < 0 && !String(change.name ?? "").trim()) throw new Error("This map has no such band. To make one, give it a name.");
  const r = applyBand(i >= 0 ? bands[i] : null, { ...change, key: id }, { by, force, now: Date.now(), rows: i >= 0 && !inBrief(scene, id) ? null : rows }); if (!r.band) throw new Error("A band needs a name.");
  if (i >= 0) bands[i] = r.band; else bands.push(r.band);
  await store(scene, bands); return r;
}
/** Put monsters into a band, or take them out (key "" or null). ref: { row } a build row's monsters; { kind } every monster of that kind the build
    didn't place; { token } one such monster. */
export async function joinBand(scene, ref, key) {
  gmOnly(); const id = bandId(key); if (id && !bandsOf(scene).some(b => b.key === id)) throw new Error("This map has no such band.");
  if (Number.isInteger(ref?.row)) { const brief = briefOf(scene), row = brief?.creatures[ref.row]; if (!row) throw new Error("This map's build has no such row.");
    /* a band made before the map had a brief moves into the brief when a row joins it: rows are read through the brief */
    if (id && !brief.bands.some(b => b.key === id)) { const moved = bandsOf(scene).find(b => b.key === id); brief.bands.push(moved); await scene.update({ [`flags.${ID}.==bands`]: cleanBands(scene.getFlag(ID, "bands")).filter(b => b.key !== id) }); }
    const was = row.band; row.band = id;
    /* a leader mark or a job that pointed at this row in the band it leaves goes with it */
    for (const b of brief.bands) if (b.key === was && was !== id) { if (b.leader?.row === ref.row) b.leader = null; if (b.second?.row === ref.row) b.second = null; b.plan.jobs = b.plan.jobs.filter(j => j.row !== ref.row); }
    await writeBrief(scene, brief); return id; }
  const toks = ref?.token ? [scene.tokens.get(ref.token)].filter(Boolean) : typeof ref?.kind === "string" ? scene.tokens.contents.filter(t => isMonster(t) && !builtRef(scene, t) && kindFacts(t.actor)?.key === ref.kind) : [];
  if (!toks.length) throw new Error("Which monsters? Give a row, a kind or a token.");
  if (toks.some(t => builtRef(scene, t))) throw new Error("That monster was placed by the build: put its row into the band instead.");
  const left = new Map(toks.map(t => [t.id, bandKeyOf(scene, t)]).filter(([, was]) => was && was !== id));
  await scene.updateEmbeddedDocuments("Token", toks.map(t => ({ _id: t.id, [`flags.${ID}.band`]: id || null })));
  /* a leader mark on a monster that left its band goes with it, and so does the job of a kind with nobody left in the band (0.26.0 review 3) */
  const bands = bandsOf(scene); let changed = false;
  for (const b of bands) { if (![...left.values()].includes(b.key)) continue;
    if (b.leader?.token && left.get(b.leader.token) === b.key) { b.leader = null; changed = true; }
    if (b.second?.token && left.get(b.second.token) === b.key) { b.second = null; changed = true; }
    const kinds = new Set(membersOf(scene, b.key).filter(t => !builtRef(scene, t)).map(t => kindFacts(t.actor)?.key)), jobs = b.plan.jobs.filter(j => j.kind == null || kinds.has(j.kind)); if (jobs.length !== b.plan.jobs.length) { b.plan.jobs = jobs; changed = true; } }
  if (changed) await store(scene, bands);
  return id;
}
/** Take a band away. Its monsters stay and belong to no band. */
export async function removeBand(scene, key) {
  gmOnly(); const id = bandId(key), brief = briefOf(scene);
  const loose = scene.tokens.contents.filter(t => !builtRef(scene, t) && bandId(t.getFlag(ID, "band")) === id);
  if (loose.length) await scene.updateEmbeddedDocuments("Token", loose.map(t => ({ _id: t.id, [`flags.${ID}.band`]: null })));
  if (brief && (brief.bands.some(b => b.key === id) || brief.creatures.some(c => c.band === id))) { brief.creatures.forEach(c => { if (c.band === id) c.band = ""; }); brief.bands = brief.bands.filter(b => b.key !== id); await writeBrief(scene, brief); }
  const own = cleanBands(scene.getFlag(ID, "bands")); if (own.some(b => b.key === id)) await scene.update({ [`flags.${ID}.==bands`]: own.filter(b => b.key !== id) });
  return true;
}
/** The map grew north or west: rally spots move with its content. */
export async function shiftBandSpots(scene, dx, dy) { if (!game.user.isGM || (!dx && !dy)) return; const bands = bandsOf(scene); if (bands.some(b => b.plan.fallBack?.at)) await store(scene, shiftSpots(bands, dx, dy)); }

/* ---------- for the windows and a chat ---------- */
/** Everything about a scene's bands in one read: each band with its members grouped by build row or kind, who leads it (and whether that is the
    module's guess), its nature with where each line comes from, and its plan. */
export function bandViews(scene, combat = null) {
  const rows = briefOf(scene)?.creatures ?? [];
  return bandsOf(scene).map(band => { const toks = membersOf(scene, band.key), lead = leaderOf(scene, band, combat), groups = new Map();
    rows.forEach((c, g) => { if (c.band === band.key) groups.set(`r${g}`, { ref: { row: g }, name: c.name || "Creature", tokens: [], count: c.count }); });
    for (const t of toks) { const r = builtRef(scene, t), k = r ? `r${r.row}` : `k${kindFacts(t.actor).key}`;
      if (!groups.has(k)) groups.set(k, { ref: r ? { row: r.row } : { kind: kindFacts(t.actor).key }, name: r ? rows[r.row]?.name ?? t.name : kindFacts(t.actor).kindName, tokens: [], count: 0 });
      groups.get(k).tokens.push({ id: t.id, name: t.name, discipline: disciplineOf(scene, t, combat), leaderRef: r ? { row: r.row, n: r.n } : { token: t.id } }); }
    const layers = natureLayers(scene, band, combat), follows = toks.some(t => PLANNED.includes(disciplineOf(scene, t, combat)));
    return { band, groups: [...groups.values()], members: toks.length, leader: lead.tok ? { token: lead.tok.id, name: lead.tok.name, guessed: lead.guessed, ...(lead.took ? { took: true } : {}) } : null, leaderGone: lead.gone, second: (() => { const t = secondOf(scene, band); return t ? { token: t.id, name: t.name } : null; })(), follows, layers, nature: natureOf(layers), plan: planOf(scene, band, combat) }; });
}
