/* Lythara Encounter Builder: the leader's orders in the fight (0.28.0, monster minds release 3, tier 3b). An order is data, never prose (design
   review 8): which of the plan's three parts it changes (the objective, one kind's job, or the call to fall back), with a label or a place. The
   module writes the words each hearer is sent; the sentence the leader says aloud is for the chat line and the History only. One order a round
   for each band (Rhea, R3-3), heard by those who can hear the leader and share a language with it, and kept for each hearer on its own. The
   leader's fall is acted on here too: the next in line (a named second first), a band that falls apart, a band that fights harder (R3-2).
   Pure: no Foundry globals, so the unit tests run it in Node. Rhea's decisions and the review's lines are in docs/features/orders.md. */
import { PLANNED, nextInLine } from "./bands.mjs";
import { cutWords } from "./minds.mjs";

export const ORDER_PARTS = ["objective", "job", "fallBack"];
export const ORDER_CAPS = { say: 160, text: 120, jobs: 4, toldOf: 6, send: 900 };
/** Her quick buttons on the Give orders box (R3-5), and the fourth for one kind's job in her own words. */
export const QUICK = { fallBack: "Fall back", on: "Everyone on that one", hold: "Hold here", other: "Something else…" };
const LABEL = /^[EM]\d{1,3}$/, str = v => String(v ?? "").replace(/\s+/g, " ").trim();
const square = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isInteger(n) && n >= 0 && n < 1000) ? [v[0], v[1]] : null;
/** Which job an order means: a build row's kind ("r2") or a kind the build didn't place, by its place on the band's list ("k0"). */
export const jobKey = ref => ref?.row != null ? `r${ref.row}` : ref?.n != null ? `k${ref.n}` : null;
const JOB = /^[rk]\d{1,3}$/;

/** An order, cleaned: { part, target? | at? | text?, job?, say? }, or why not. `text` (the order in her own words, already in labels) is only a
    GM's: a thinker's order is a label or a place, so nothing only the leader perceives can ride along in prose (design review 8). */
export function cleanOrder(raw, { gm = false } = {}) {
  const bad = reason => ({ ok: false, reason }); if (!raw || typeof raw !== "object") return bad("An order is an object.");
  if (!ORDER_PARTS.includes(raw.part)) return bad(`an order needs "part": "objective" (what the whole band goes for), "job" (what one kind of its members does) or "fallBack" (the call to fall back).`);
  const out = { part: raw.part }, say = cutWords(str(raw.say), ORDER_CAPS.say); if (say) out.say = say;
  if (raw.part === "fallBack") return { ok: true, order: out };
  if (raw.part === "job") { if (typeof raw.job !== "string" || !JOB.test(raw.job)) return bad(`an order that changes a job needs "job": the id of one of the kinds in "orders.give.jobs".`); out.job = raw.job; }
  const target = typeof raw.target === "string" && LABEL.test(raw.target) ? raw.target : null, at = square(raw.at), text = gm ? cutWords(str(raw.text), ORDER_CAPS.text) : "";
  if (text) out.text = text; else if (target) out.target = target; else if (at) out.at = at;
  else return bad(raw.part === "job" ? `an order that changes a job needs "target" (a creature's label: that kind goes for it, or protects it when it is one of its own) or "at" (a square to take).` : `an order that changes the objective needs "target" (a creature's label: everyone goes for it, or protects it when it is one of their own) or "at" (a square to hold).`);
  return { ok: true, order: out };
}
/** An order from the GM's box as it waits on the flag for the runner, and back again once the runner has the creature's label and her words in
    labels. The time stamp is `ts`: `at` is the order's square (0.28.0 review 1: a stamp under `at` replaced the square of every Hold here). */
export const toPending = (order = {}, stamp = {}) => ({ part: order.part, ...(order.targetId ? { targetId: String(order.targetId) } : {}), ...(square(order.at) ? { at: square(order.at) } : {}), ...(order.job ? { job: String(order.job) } : {}), ...(order.text ? { text: String(order.text) } : {}), ...(order.say ? { say: String(order.say) } : {}), from: stamp.from ?? null, round: stamp.round ?? 0, ts: stamp.ts ?? 0 });
export const fromPending = (p = {}, { target = null, text = "" } = {}) => cleanOrder({ part: p.part, job: p.job, at: p.at, say: p.say, text, target }, { gm: true });
/** An order in the words one hearer is sent, or the GM reads. ctx: { ally (the target is on the hearer's own side), mine (the job is the hearer's
    own kind's), jobName (the kind's name), fallBack (where the band's plan says falling back leads, in words, or "") }. */
export function orderWords(o, { ally = false, mine = false, jobName = "", fallBack = "" } = {}) {
  if (!o) return "";
  if (o.part === "fallBack") return `fall back${fallBack ? ` ${fallBack}` : ""}`;
  const body = o.text ? o.text : o.target ? (ally ? `protect ${o.target}` : o.part === "job" ? `go for ${o.target}` : `everyone on ${o.target}`) : o.at ? (o.part === "job" ? `take the square [${o.at[0]}, ${o.at[1]}]` : `hold at [${o.at[0]}, ${o.at[1]}]`) : "";
  return o.part === "job" ? `${mine ? "your job now" : `the job of ${jobName || "some of its band"} now`}: ${body}` : body;
}
/** Where a band's plan says falling back leads, in words. */
export const fallBackWords = f => f?.to === "off" ? "off the map" : f?.to === "spot" && f.at ? `to the rally spot at [${f.at[0]}, ${f.at[1]}]` : "";

/** May this creature give an order now? Only its band's leader, able to act and to speak, above ground, with someone to follow it, once a round
    for the band (design review 7: a re-plan or a turn that comes back after a Delay is the same round). Out: { ok } or { ok: false, why }. */
export function canOrder({ leads = false, followers = 0, cantAct = null, langs = [], below = false, round = 0, last = null } = {}) {
  if (!leads) return { ok: false, why: "it doesn't lead a band" };
  if (!followers) return { ok: false, why: "nobody in its band is left to follow an order" };
  if (cantAct) return { ok: false, why: "it can't act, so it can't speak" };
  if (!(langs ?? []).length) return { ok: false, why: "it speaks no language" };
  if (below) return { ok: false, why: "it is under the ground, where nobody hears it" };
  if (last != null && last === round) return { ok: false, why: "its band has had this round's order (one a round)" };
  return { ok: true };
}
/** The language an order is spoken in: the one of the leader's that the most of its followers understand, the earliest on its sheet among equals. */
export function orderLanguage(speaker = [], members = []) {
  let best = null, n = -1; for (const l of speaker ?? []) { const c = (members ?? []).filter(m => (m ?? []).includes(l)).length; if (c > n) { best = l; n = c; } }
  return best;
}
/** Does this member get the order (design reviews 4 and 9)? It must follow a leader (Loose, Trained or Drilled: animals and the mindless don't
    take spoken orders, R3-6), be up and awake, not deafened, above ground, understand the language and have a path for sound from the leader.
    The GM's own call for this round (`call`: "yes" | "no") wins over everything but being down. Out: { hears, why } (`why` null when it hears). */
export function hearing({ member = {}, lang = null, call = null } = {}) {
  const no = why => ({ hears: false, why });
  if (member.fallen) return no("is down");
  if (!PLANNED.includes(member.discipline)) return no("takes no spoken orders");
  if (call === "no") return no("can't hear it (your call)"); if (call === "yes") return { hears: true, why: null };
  if (member.asleep) return no("is unconscious");
  if (member.deafened) return no("is deafened");
  if (member.below) return no("is under the ground");
  if (lang && !(member.langs ?? []).includes(lang)) return no("doesn't understand the language");
  if (member.path === false) return no("is out of earshot (no sound reaches it from the leader)");
  return { hears: true, why: null };
}
/** A hearer's standing orders with one more: the latest objective (a call to fall back takes its place, and the other way round), and the latest
    order for each kind's job, at most ORDER_CAPS.jobs of them. standing: { goal: { r, o }, jobs: { key: { r, o } } }. Out: the same shape, new. */
export function applyHeard(standing = {}, order, round = 0) {
  const out = { ...(standing.goal ? { goal: standing.goal } : {}), jobs: { ...(standing.jobs ?? {}) } }, { say, ...o } = order ?? {};
  if (!ORDER_PARTS.includes(o.part)) return out;
  if (o.part === "job") { out.jobs[o.job] = { r: round, o }; const keys = Object.keys(out.jobs).sort((a, b) => out.jobs[a].r - out.jobs[b].r); while (keys.length > ORDER_CAPS.jobs) delete out.jobs[keys.shift()]; }
  else out.goal = { r: round, o };
  return out;
}
/** The labels a hearer's standing orders name. */
export const labelsIn = (standing = {}) => [...new Set([standing.goal?.o, ...Object.values(standing.jobs ?? {}).map(j => j.o)].flatMap(o => !o ? [] : [...(o.target ? [o.target] : []), ...(String(o.text ?? "").match(/\b[EM]\d{1,3}\b/g) ?? [])]))];

/** What a packet carries of orders (schema 5), after the unchanging blocks: `heard` (its standing orders in words, the newest objective first),
    `toldOf` (creatures an order named that it hasn't perceived: it knows they exist, not where, and can't target them: Rhea, R3-14) and, for a
    leader, `give` (whether it may give this round's order and the kinds whose job it can change). Null when there is nothing to say.
    In: standing; wordsOf(order) → the words for this hearer; unseen: the labels of `labelsIn` it neither perceives nor remembers; give: null or
    { ok, why, jobs: [{ id, name }] }. */
export function ordersForPacket({ standing = {}, wordsOf = () => "", unseen = [], give = null } = {}) {
  const heard = [];
  if (standing.goal) { const w = wordsOf(standing.goal.o); if (w) heard.push(`round ${standing.goal.r}: ${w}`); }
  for (const j of Object.values(standing.jobs ?? {}).sort((a, b) => b.r - a.r)) { const w = wordsOf(j.o); if (w) heard.push(`round ${j.r}: ${w}`); }
  const out = { ...(heard.length ? { heard } : {}), ...(unseen.length ? { toldOf: unseen.slice(0, ORDER_CAPS.toldOf) } : {}),
    ...(give ? { give: give.ok ? { can: true, ...(give.jobs?.length ? { jobs: give.jobs.slice(0, 8) } : {}) } : { can: false, why: give.why } } : {}) };
  return Object.keys(out).length ? out : null;
}

/* ---------- the leader falls (R3-2, acted on by the module since 0.28.0) ---------- */
/** Who hurt a creature last, as its own notebook has it: the label of the last sure "hurt" line, or null. */
export function lastHurtBy(book = {}) {
  const lines = Object.entries(book ?? {}).filter(([, l]) => l && l.k === "hurt" && !l.x && /^E\d{1,3}$/.test(String(l.a ?? "")))   /* an enemy's label only: a blow from its own side isn't avenged on an ally (review 14) */.sort((a, b) => a[0] < b[0] ? -1 : 1);
  return lines.length ? lines.at(-1)[1].a : null;
}
/** What the module does when a band's leader has fallen, by the band's pick. In: pick; state ("down" | "dead" | "fled" | "gone"); members:
    [{ id, level, speaks, discipline, standing }] (the fallen leader among them); leaderId; second (the id of the named second, or null); dropper
    (the label of whoever dropped it, or null).
    Out: { leader (who leads now: an id, or null for nobody), loosen: [ids whose Discipline drops to Loose], planGone, objective (the plan's new
    objective in labels, or null), never: [ids that no longer give up] }.
    "Next in line takes over": the named second if it stands and follows a leader, else the highest-level member left. "Falls apart": the plan is
    gone and Trained and Drilled members are Loose from now on. "Fights harder": only when the leader was struck down (one that fled or is gone
    leaves nobody to avenge): the plan's objective becomes killing whoever dropped it, and nobody gives up. "Plan stands" and "Breaks and runs"
    change nothing here: the thinker is told the pick in words, as in tier 3a. */
export function fallOutcome({ pick = null, state = null, members = [], leaderId = null, second = null, dropper = null } = {}) {
  const out = { leader: null, loosen: [], planGone: false, objective: null, never: [] }, up = (members ?? []).filter(m => m.id !== leaderId && m.standing);
  if (!state) return out;
  if (pick === "next") { const s = up.find(m => m.id === second && PLANNED.includes(m.discipline)); out.leader = s ? s.id : nextInLine(members, leaderId); }
  else if (pick === "apart") { out.planGone = true; out.loosen = up.filter(m => m.discipline === "trained" || m.discipline === "drilled").map(m => m.id); }
  else if (pick === "harder" && (state === "down" || state === "dead")) { out.objective = dropper ? `kill ${dropper}, who struck the leader down` : "kill whoever struck the leader down"; out.never = up.filter(m => PLANNED.includes(m.discipline)).map(m => m.id); }
  return out;
}
/** The line a member who no longer gives up carries in this fight's layer of its mind. */
export const NEVER_GIVES_UP = "Never, now: its leader was struck down and it fights on to the end.";

/* ---------- the band log, in words (the History, the cards) ---------- */
const FELL = { down: "is down", dead: "is dead", fled: "has fled the fight", gone: "is gone" };
/** One entry of the band log for the GM. nameOf(tokenId) → a name; named(text) turns labels into names; langName(slug) → "Goblin".
    Entries: { k: "order", band, r, by, from, o, words (as the leader meant it, in labels), say, lang, heard: [ids], missed: { id: why }, msg }
    and { k: "fell", band, r, was, state, pick, leader, loosen, objective, never }. */
export function logWords(e, { nameOf = id => id, named = s => s, langName = l => l, bandName = "" } = {}) {
  const list = xs => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`, band = bandName ? ` (${bandName})` : "";
  if (e?.k === "order") {
    const heard = (e.heard ?? []).map(nameOf), missed = Object.entries(e.missed ?? {}).map(([id, why]) => `${nameOf(id)} (${why})`);
    return `${nameOf(e.from)}${band} ordered: ${named(e.words ?? "")}${e.say ? `. Said${e.lang ? ` in ${langName(e.lang)}` : ""}: “${e.say}”` : e.lang ? ` (in ${langName(e.lang)})` : ""}. ${heard.length ? `Heard by ${list(heard)}.` : "Nobody heard it."}${missed.length ? ` Not by ${list(missed)}.` : ""}${e.by === "gm" ? " Given by the GM." : ""}`;
  }
  if (e?.k === "fell") {
    const who = `${nameOf(e.was)}${band}, the leader, ${FELL[e.state] ?? "is down"}.`;
    if (e.pick === "next") return `${who} ${e.leader ? `${nameOf(e.leader)} leads now.` : "Nobody is left to lead."}`;
    if (e.pick === "apart") return `${who} The band falls apart: its plan is gone${(e.loosen ?? []).length ? `, and ${list(e.loosen.map(nameOf))} ${e.loosen.length === 1 ? "is" : "are"} Loose from now on` : ""}.`;
    if (e.pick === "harder") return e.objective ? `${who} The band fights harder: ${named(e.objective)}, and nobody gives up.` : `${who} Nobody struck it down, so the plan stands.`;
    if (e.pick === "runs") return `${who} Each of its band acts as if its own “Gives up” had been reached.`;
    if (e.pick === "stands") return `${who} The plan stands, and nobody changes it.`;
    return `${who} The band has no pick for this: each is told its leader fell.`;
  }
  return "";
}
/** What a member's card says of this round's order: { heard: words } when it heard one this round, { missed: why } when its band had one it
    didn't get, else null. log: the band log's entries; standing: its standing orders. */
export function roundLine(log = [], tokenId, round) {
  const e = [...(log ?? [])].reverse().find(x => x?.k === "order" && x.r === round); if (!e || e.from === tokenId) return null;
  if ((e.heard ?? []).includes(tokenId)) return { heard: true, entry: e };
  return tokenId in (e.missed ?? {}) ? { heard: false, why: e.missed[tokenId], entry: e } : null;
}
/** How firmly an order holds for a hearer, for its card (the prompt says the same once to the thinker). */
export const HOLDS = { loose: "Loose: it follows the order while it suits it", trained: "Trained: the order wins until its own “Gives up” is reached", drilled: "Drilled: the order wins even at its own cost" };
