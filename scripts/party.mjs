/* Lythara Encounter Builder: a party member's mind learned from play (0.45.0, F-9; Rhea, 2026-11-24, 9-1 to 9-8 and Angel's calls in the plan).
   Pure: no Foundry globals, so the unit tests run it in Node. docs/features/party-minds.md.

   Two things live here:
   - the party record: what each party member did in a fight, turn by turn, read from Foundry itself (the chat cards of their rolls, spells and
     actions, their targets, where they moved and ended, what they spent). It is kept on the Combat while the fight runs and saved with the
     History; a fight she Discards, or a character Angel played in that fight, is never learned from.
   - the party profile: one page per party member in the Minds Library's Party section, tied to the character's actor by its id (relinked by name
     if the actor is rebuilt). Its own lines (Role, Goes for, Fights by, Looks after, Spends, Takes risks, Notes), each learned line tagged with how
     many fights it was seen in, and Angel's suggestions waiting for her Accept or Keep mine. Nothing Angel suggests is applied by itself. */
import { noteForThinker } from "./turn.mjs";
/* the same as minds.mjs `cutWords` (kept here so the two files don't import each other) */
const cutWords = (text, max) => { const s = String(text ?? ""); if (s.length <= max) return s; const cut = s.slice(0, max + 1), at = cut.lastIndexOf(" "); return (at > max * .5 ? cut.slice(0, at) : s.slice(0, max)).trim(); };

export const PARTY_SCHEMA = 1;
/** The party profile's lines (9-5), in the order they are shown and sent. */
export const PARTY_LINES = ["role", "goesFor", "fightsBy", "looksAfter", "spends", "risks", "notes"];
export const PARTY_LABEL = { role: "Role", goesFor: "Goes for", fightsBy: "Fights by", looksAfter: "Looks after", spends: "Spends", risks: "Takes risks", notes: "Notes" };
export const PARTY_HINT = {
  role: "what they see themselves doing: front line, holds the door; heals and buffs from the back",
  goesFor: "who they pick to hit, and what shifts it",
  fightsBy: "favourite moves, positioning, go-to spells or actions",
  looksAfter: "who they protect or stick close to",
  spends: "how freely they burn spell slots, potions, focus points",
  risks: "cautious, steady or reckless",
  notes: "anything else about how they fight"
};
export const PARTY_CAPS = { line: 240, notes: 600, why: 400, name: 80, what: 60, suggestions: 16, declined: 30, list: 200, fights: 500, former: 10 };
const BY = ["gm", "angel"];
const str = (v, max) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const cap = (k, v) => cutWords(str(v, 4000), k === "notes" ? PARTY_CAPS.notes : PARTY_CAPS.line);
const seenOf = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : null; };
export const partyKey = actorId => `party:${String(actorId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;

/** One profile line: { text, by, at?, seen? }, or null when it says nothing. `seen` is how many fights Angel saw it in (9-5); her own lines carry none. */
export function cleanPartyLine(key, v, by = null) {
  if (!PARTY_LINES.includes(key) || v == null) return null;
  const o = typeof v === "string" ? { text: v } : typeof v === "object" ? v : null; if (!o) return null;
  const text = cap(key, o.text); if (!text) return null;
  const who = BY.includes(o.by) ? o.by : BY.includes(by) ? by : "gm", seen = who === "angel" ? seenOf(o.seen) : null;
  return { text, by: who, ...(Number.isFinite(o.at) ? { at: o.at } : {}), ...(seen ? { seen } : {}) };
}
export function cleanPartyLines(lines) {
  const out = {}; if (!lines || typeof lines !== "object") return out;
  for (const k of PARTY_LINES) { const l = cleanPartyLine(k, lines[k]); if (l) out[k] = l; }
  return out;
}
/** One of Angel's suggestions: { id, line, text, why, seen, session, at }. `text` is the line's new words, whole; a suggestion with no words is
    dropped (taking a line away is hers to do, on the page). */
export function cleanSuggestion(s = {}) {
  if (!s || typeof s !== "object" || !PARTY_LINES.includes(s.line)) return null;
  const text = cap(s.line, s.text), why = cutWords(str(s.why, 4000), PARTY_CAPS.why); if (!text) return null;
  const id = str(s.id, 16).replace(/[^A-Za-z0-9]/g, "") || null; if (!id) return null;
  return { id, line: s.line, text, why, ...(seenOf(s.seen) ? { seen: seenOf(s.seen) } : {}), ...(str(s.session, 20) ? { session: str(s.session, 20) } : {}), ...(Number.isFinite(s.at) ? { at: s.at } : {}) };
}
const uniq = (list, max, clean = x => str(x, 40)) => [...new Set((Array.isArray(list) ? list : []).map(clean).filter(Boolean))].slice(-max);
/** A party page as the library keeps it. kind: "player" (a player's character) or "companion" (a party member nobody plays, like a companion NPC). */
export function cleanPartyEntry(e = {}) {
  const actorId = str(e.actorId, 32).replace(/[^A-Za-z0-9]/g, ""), name = str(e.name, PARTY_CAPS.name); if (!actorId || !name) return null;
  const suggestions = (Array.isArray(e.suggestions) ? e.suggestions : []).map(cleanSuggestion).filter(Boolean).slice(-PARTY_CAPS.suggestions);
  const declined = (Array.isArray(e.declined) ? e.declined : []).filter(d => d && PARTY_LINES.includes(d.line)).map(d => ({ line: d.line, text: cap(d.line, d.text), ...(Number.isFinite(d.at) ? { at: d.at } : {}) })).filter(d => d.text).slice(-PARTY_CAPS.declined);
  return { schema: PARTY_SCHEMA, type: "party", key: partyKey(actorId), actorId, name, kind: e.kind === "companion" ? "companion" : "player", what: str(e.what, PARTY_CAPS.what),
    people: null, lines: cleanPartyLines(e.lines), suggestions, declined, fights: uniq(e.fights, PARTY_CAPS.fights), formerIds: uniq(e.formerIds, PARTY_CAPS.former, x => str(x, 32).replace(/[^A-Za-z0-9]/g, "")).filter(x => x !== actorId), sessions: uniq(e.sessions, PARTY_CAPS.list, x => /^\d{4}-\d{2}-\d{2}$/.test(String(x ?? "")) ? String(x) : "").sort() };
}
/** Her edit or Angel's, line by line (the whose-words rule, design review 9 of minds): a write by Angel never replaces a line that is hers unless
    `force` (she asked). `null` takes a line away. Out: { lines, skipped }. */
export function applyPartyLines(current = {}, incoming = {}, { by = "gm", force = false, now = null } = {}) {
  const lines = { ...cleanPartyLines(current) }, skipped = [];
  for (const k of PARTY_LINES) { if (!(k in (incoming ?? {}))) continue;
    if (by !== "gm" && !force && lines[k]?.by === "gm") { skipped.push(k); continue; }
    const v = incoming[k], l = v === null ? null : cleanPartyLine(k, typeof v === "string" ? { text: v, by } : { ...v, by }, by);
    if (l) lines[k] = now ? { ...l, at: now } : l; else delete lines[k]; }
  return { lines, skipped };
}
/** Angel's suggestions from a session (9-3, 9-4, 9-7), waiting for her answer. A new suggestion for a line that already has one waiting takes its
    place (the newer reading of the same line). One the same as the line already is, or as one she said no to before, is left out. The fights and
    the session it was learned from are counted on the page whether or not anything was suggested (the "learned from" line). Out: { entry, added, dropped }. */
export function addSuggestions(entry, { session = null, fights = [], suggestions = [] } = {}, { now = 0, newId = i => `s${now.toString(36)}${i}` } = {}) {
  const e = cleanPartyEntry(entry); if (!e) return { entry: null, added: [], dropped: [] };
  const added = [], dropped = [], same = (a, b) => str(a, 4000).toLowerCase() === str(b, 4000).toLowerCase();
  /* the id is always the module's own (review 29), one no suggestion on the page has */
  const ids = new Set(e.suggestions.map(x => x.id)), idFor = i => { let id = str(newId(i), 12).replace(/[^A-Za-z0-9]/g, "") || `s${i}`, n = 0; while (ids.has(id)) id = `${id.slice(0, 12)}${(++n).toString(36)}`; ids.add(id); return id; };
  (Array.isArray(suggestions) ? suggestions : []).forEach((raw, i) => {
    const s = cleanSuggestion({ ...raw, id: idFor(i), session: raw?.session ?? session, at: now }); if (!s) { dropped.push({ line: raw?.line ?? null, why: "not a line of the profile, or no words" }); return; }
    if (same(e.lines[s.line]?.text, s.text)) { dropped.push({ line: s.line, why: "the line already says that" }); return; }
    if (e.declined.some(d => d.line === s.line && same(d.text, s.text))) { dropped.push({ line: s.line, why: "the GM kept her own line over these words before" }); return; }
    e.suggestions = [...e.suggestions.filter(x => x.line !== s.line), s]; added.push(s); });
  e.suggestions = e.suggestions.slice(-PARTY_CAPS.suggestions);
  /* a fight is its combat id, or a record from `records()` carrying one (review 27) */
  e.fights = uniq([...e.fights, ...(Array.isArray(fights) ? fights : []).map(f => f && typeof f === "object" ? f.combatId : f)], PARTY_CAPS.fights);
  if (session && /^\d{4}-\d{2}-\d{2}$/.test(session)) e.sessions = uniq([...e.sessions, session], PARTY_CAPS.list).sort();
  return { entry: e, added, dropped };
}
/** Her answer to one suggestion: "accept" writes it as the line (marked Angel's, with how many fights it was seen in, since the words are Angel's;
    her Accept is what lets it stand), "keep" leaves her line and remembers the words, so the same suggestion isn't made again. Out: { entry, line } or null. */
export function answerSuggestion(entry, id, answer, { now = 0 } = {}) {
  const e = cleanPartyEntry(entry), s = e?.suggestions.find(x => x.id === id); if (!s || !["accept", "keep"].includes(answer)) return null;
  e.suggestions = e.suggestions.filter(x => x.id !== id);
  if (answer === "accept") e.lines[s.line] = { text: s.text, by: "angel", at: now, ...(s.seen ? { seen: s.seen } : {}) };
  else e.declined = [...e.declined, { line: s.line, text: s.text, at: now }].slice(-PARTY_CAPS.declined);
  return { entry: e, line: s.line };
}
/** The tag a line gets on its page (9-6): "yours", or "Angel · seen in N fights" (orange when only one), or "Angel" for a drafted line with no count. */
export const lineTag = l => !l ? null : l.by === "gm" ? { words: "yours", tone: "gm" } : l.seen ? { words: `Angel · seen in ${l.seen} fight${l.seen === 1 ? "" : "s"}`, tone: l.seen === 1 ? "few" : "angel" } : { words: "Angel · drafted", tone: "angel" };
/** What the packet carries for a party member Angel plays (Angel's call 5: only while she plays them): each line in words through the name gate
    (a party-side name becomes that creature's label when it is perceived or known as an ally; a line naming anyone else is held back whole), with
    "(seen in N fights)" after a learned line so a habit reads apart from a one-off. forms: the pronoun's three words. Out: { mind, held }. */
export function partyForPacket(entry, people = [], pronoun = null) {
  const out = {}, held = [], e = entry && typeof entry === "object" ? entry : null; if (!e) return { mind: null, held };
  for (const k of PARTY_LINES) { const l = cleanPartyLine(k, e.lines?.[k]); if (!l) continue;
    const g = noteForThinker(l.text, people, 8000); if (g.unknown.length || g.ambiguous.length) { held.push({ key: k, unknown: g.unknown, ambiguous: g.ambiguous }); continue; }
    out[k] = cutWords(g.text, k === "notes" ? PARTY_CAPS.notes : PARTY_CAPS.line) + (l.seen ? ` (seen in ${l.seen} fight${l.seen === 1 ? "" : "s"})` : ""); }
  if (!Object.keys(out).length) return { mind: null, held };
  return { mind: { profile: "party", ...(pronoun ? { pronoun } : {}), ...out }, held };
}
/** A first page for a party member (9-7): her old lines written on the token (the monsters' shape, before 0.45.0) carried over where they mean the
    same (Goes for, Fights by, Notes), keeping whose words they were, so nothing she wrote is lost. */
export function seedFromToken(tokenLines = {}) {
  const out = {}; for (const [from, to] of [["goesFor", "goesFor"], ["fightsBy", "fightsBy"], ["notes", "notes"]]) { const l = tokenLines?.[from];
    if (l && !l.blank && str(l.text, 4000)) out[to] = { text: l.text, by: ["angel", "module"].includes(l.by) ? "angel" : "gm" }; }   /* a token line the module guessed is Angel's, not hers (review 7) */
  return cleanPartyLines(out);
}
/** Party pages whose actor has gone (rebuilt, or the page came from another world): each actor of the same name, for Relink (9-2). actors: [{ id, name }]. */
export function relinkCandidates(entry, actors = []) {
  const n = str(entry?.name, 200).toLowerCase(); if (!n) return [];
  return (actors ?? []).filter(a => a && a.id !== entry.actorId && str(a.name, 200).toLowerCase() === n);
}

/* ---------- the party record (9-1): what each party member did, from Foundry itself ---------- */
export const RECORD_SCHEMA = 1;
const OUTCOME = { criticalSuccess: "critical success", success: "success", failure: "failure", criticalFailure: "critical failure" };
/** One chat card as the record keeps it, or null for a card that isn't something the character did (a save they were made to roll, a flat check,
    damage they took, initiative, plain chat). m: { kind, what, item, traits, targets: [names], outcome, rank, damage, title }, read from the card
    by the glue. Plain chat and the card's free text are never kept (Angel's call 1: only how the character fights). */
export function cardAct(m = {}) {
  const kind = String(m.kind ?? ""), item = str(m.item, 60), title = str(m.title, 60), targets = (m.targets ?? []).map(t => str(t, 60)).filter(Boolean).slice(0, 6);
  if (["saving-throw", "flat-check", "damage-taken", "initiative", "self-effect"].includes(kind)) return null;
  const outcome = OUTCOME[m.outcome] ?? null, base = { ...(targets.length ? { on: targets } : {}), ...(outcome ? { o: outcome } : {}) };
  if (kind === "attack-roll") return { k: "strike", w: item || title || "a Strike", ...base };
  /* a spell's damage roll is its damage, not a second casting (review 2): the damage branch comes first */
  if (kind === "damage-roll") return { k: "damage", w: item || title || "damage", ...(Number.isFinite(m.damage) ? { d: m.damage } : {}), ...(m.healing ? { heal: true } : {}), ...base };
  if (kind === "spell-attack-roll" || kind === "spell-cast" || (!kind && m.originType === "spell")) return { k: "spell", w: item || title || "a spell", ...(Number.isFinite(m.rank) && m.rank > 0 ? { rank: m.rank } : {}), ...(m.cantrip ? { cantrip: true } : {}), ...(m.focus ? { focus: true } : {}), ...base };
  if (m.originType === "consumable") return { k: "item", w: item || title || "an item", ...base };
  if (kind === "skill-check" || kind === "perception-check") return { k: "check", w: title || item || "a check", ...base };
  if (title || item) return { k: "action", w: title || item, ...base };
  return null;
}
/** A damage roll joins the act it belongs to: of the Strikes and spells of the same item with no damage yet, the earliest that hit (a first Strike
    that hit, then a second that missed, then the first's damage: review 13), else the latest. "hit, 12 damage". The rest stay in order. */
const HIT = new Set(["success", "critical success"]);
export function joinActs(acts = []) {
  const out = []; for (const a of acts) { if (!a) continue;
    if (a.k === "damage") { const open = out.filter(x => (x.k === "strike" || x.k === "spell") && x.d == null && (x.w === a.w || a.w === "damage")), to = open.find(x => HIT.has(x.o)) ?? open.at(-1); if (to) { if (a.d != null) to.d = a.d; if (a.heal) to.heal = true; if (!to.on && a.on) to.on = a.on; continue; } }
    out.push({ ...a }); }
  return out.slice(0, 20);
}
/** Feet between two creatures' nearest squares, PF2e's way (every second diagonal 10 ft). a, b: { x, y, w, h } in squares. */
export function feetBetween(a, b) {
  const ox = a.x < b.x + b.w && b.x < a.x + a.w, oy = a.y < b.y + b.h && b.y < a.y + a.h; if (ox && oy) return 0;
  const dx = ox ? 0 : Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)) + 1, dy = oy ? 0 : Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)) + 1;
  return 5 * (Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2));
}
/** How far a creature got from its start square to its end square (PF2e's count, straight; not the path it walked). */
export function feetMoved(a, b) { const dx = Math.abs((b?.x ?? 0) - (a?.x ?? 0)), dy = Math.abs((b?.y ?? 0) - (a?.y ?? 0)), lo = Math.min(dx, dy), hi = Math.max(dx, dy); return 5 * (hi + Math.floor(lo / 2)); }
/** What a character has to spend, as a snapshot: spell slots left, focus points, hero points, and each consumable's count (by name). */
export function spentBetween(start = {}, end = {}) {
  const out = {}, d = (k) => Math.max(0, (Number(start[k]) || 0) - (Number(end[k]) || 0));
  if (d("slots")) out.slots = d("slots"); if (d("focus")) out.focus = d("focus"); if (d("hero")) out.hero = d("hero");
  const used = []; for (const [n, q] of Object.entries(start.items ?? {})) { const left = Number(end.items?.[n] ?? 0), had = Number(q) || 0; if (had > left) used.push(had - left > 1 ? `${n} ×${had - left}` : n); }
  if (used.length) out.items = used.slice(0, 8);
  return out;
}
/** Who is near a creature where its turn ended (for "Looks after" and how it stands): allies within 10 ft, foes within 10 ft, and the nearest foe.
    others: [{ name, rect, side: "ally" | "foe", down }]. */
export function standing(me, others = []) {
  const near = [], foes = []; let nearest = null;
  for (const o of others ?? []) { if (!o?.rect || o.down) continue; const f = feetBetween(me, o.rect);
    if (o.side === "ally" && f <= 10) near.push(o.name);
    if (o.side === "foe") { if (f <= 10) foes.push(`${o.name} (${f} ft)`); if (nearest == null || f < nearest) nearest = f; } }
  return { ...(near.length ? { allies: near.slice(0, 6) } : {}), ...(foes.length ? { foes: foes.slice(0, 6) } : {}), ...(nearest != null ? { nearestFoe: nearest } : {}) };
}
/** One turn's record, cleaned for keeping: { round, actorId, name, angel, own, moved, hp, acts, spent, end }. `own` false is what they did on
    someone else's turn (a reaction, a free action). */
export function cleanTurn(t = {}) {
  const actorId = str(t.actorId, 32).replace(/[^A-Za-z0-9]/g, ""); if (!actorId) return null;
  const acts = joinActs((Array.isArray(t.acts) ? t.acts : []).filter(a => a && typeof a === "object" && a.k).map(a => ({ k: str(a.k, 12), w: str(a.w, 60), ...(Array.isArray(a.on) && a.on.length ? { on: a.on.map(x => str(x, 60)).slice(0, 6) } : {}), ...(a.o ? { o: str(a.o, 20) } : {}), ...(Number.isFinite(a.d) ? { d: a.d } : {}), ...(a.heal ? { heal: true } : {}), ...(Number.isFinite(a.rank) ? { rank: a.rank } : {}), ...(a.cantrip ? { cantrip: true } : {}), ...(a.focus ? { focus: true } : {}) })));
  const own = t.own !== false;
  if (!own && !acts.length) return null;
  return { ...(Number.isFinite(t.at) ? { at: t.at } : {}), round: Math.max(0, Math.floor(Number(t.round) || 0)), actorId, name: str(t.name, 60), ...(t.angel ? { angel: true } : {}), ...(own ? {} : { own: false }),
    ...(own && Number.isFinite(t.moved) ? { moved: t.moved } : {}), ...(Array.isArray(t.hp) && t.hp.length === 2 ? { hp: t.hp.map(n => Math.round(Number(n) || 0)) } : {}),
    acts, ...(t.spent && Object.keys(t.spent).length ? { spent: t.spent } : {}), ...(t.partial ? { partial: true } : {}), ...(own && t.end && Object.keys(t.end).length ? { end: t.end } : {}) };
}
/** A turn in words, for the saved page and the daily check: "Round 2: moved 25 ft; Strike (Longsword) on Goblin Warrior: success, 12 damage; spent 1 spell slot; ended next to Corwin; foes close: Goblin Warrior (5 ft)." */
export function turnWords(t) {
  if (!t) return ""; const parts = [];
  if (t.own !== false && t.moved) parts.push(`moved ${t.moved} ft`);
  for (const a of t.acts ?? []) {
    const what = a.k === "strike" ? `Strike (${a.w})` : a.k === "spell" ? `cast ${a.w}${a.cantrip ? " (cantrip)" : a.focus ? " (focus)" : a.rank ? ` (rank ${a.rank})` : ""}` : a.k === "item" ? `used ${a.w}` : a.w;
    parts.push(`${what}${a.on?.length ? ` on ${a.on.join(", ")}` : ""}${a.o ? `: ${a.o}` : ""}${a.d != null ? `${a.o ? "," : ":"} ${a.d} ${a.heal ? "healing" : "damage"}` : ""}`); }
  const s = t.spent ?? {}, sp = [s.slots ? `${s.slots} spell slot${s.slots === 1 ? "" : "s"}` : "", s.focus ? `${s.focus} focus point${s.focus === 1 ? "" : "s"}` : "", s.hero ? `${s.hero} hero point${s.hero === 1 ? "" : "s"}` : "", ...(s.items ?? [])].filter(Boolean);
  if (sp.length) parts.push(`spent ${sp.join(", ")}`);
  const e = t.end ?? {}, at = [e.allies?.length ? `next to ${e.allies.join(", ")}` : "", e.foes?.length ? `foes close: ${e.foes.join(", ")}` : e.nearestFoe != null ? `with the nearest foe ${e.nearestFoe} ft away` : ""].filter(Boolean);
  if (at.length) parts.push(`ended ${at.join("; ")}`);
  if (t.own !== false && !parts.length) parts.push("nothing the cards show");
  return `${t.own === false ? `On another's turn in round ${t.round}` : `Round ${t.round}`}${t.angel ? " (Angel's turn)" : ""}: ${parts.join("; ")}.`;
}
/** The fight's record by party member, as saved with the History: { [actorId]: { name, angel, turns: [...] } }. A character Angel played on any
    turn of the fight is marked `angel` (Angel's call 2: that fight isn't learned from for them). turns: the cleaned turns in order. */
export function recordByMember(turns = []) {
  const out = {}; for (const t of (turns ?? []).map(cleanTurn).filter(Boolean)) { const m = out[t.actorId] ??= { name: t.name, angel: false, turns: [] }; if (t.angel) m.angel = true; m.turns.push(t); }
  return out;
}
/** Which saved fights a page hasn't learned from yet, and that may be learned from: not played by Angel for this character. fights: [{ combatId,
    members }]. Out: [{ combatId, turns }]. */
export function freshFights(entry, fights = []) {
  const seen = new Set(entry?.fights ?? []), ids = [entry?.actorId, ...(entry?.formerIds ?? [])].filter(Boolean);
  /* a fight saved before a Relink is the character's under the id it had then (review 15) */
  return (fights ?? []).filter(f => f && !seen.has(f.combatId)).map(f => ({ ...f, me: ids.map(id => f.members?.[id]).find(Boolean) ?? null })).filter(f => f.me && !f.me.angel && f.me.turns?.length);
}
/** The saved page's section on the party (0.45.0): each party member's turns in words, and which characters this fight isn't learned for. */
export function partyRecordHTML(record, esc = s => String(s)) {
  const members = Object.entries(record?.members ?? {}); if (!members.length) return "";
  return `<h2>The party's turns</h2>${members.map(([, m]) => `<h3>${esc(m.name)}${m.angel ? " (Angel played this character in this fight, so it isn't learned from)" : ""}</h3><ul>${m.turns.map(t => `<li>${esc(turnWords(t))}${t.partial ? " (part of this turn wasn't seen)" : ""}</li>`).join("")}</ul>`).join("")}`;
}
