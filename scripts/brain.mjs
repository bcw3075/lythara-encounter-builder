/* The brain interface: the one contract between the fight and whoever thinks for a monster. Today that's a Claude chat waiting through the bridge;
   later the Claude API. The module can't tell them apart: both wait for an event, read its packet, and hand in a plan. Pure: no Foundry globals;
   fight.mjs keeps the events on the Combat flag and the listener in a world setting. See claude/encounter-builder-plan.md, steps 3 and 5. */
import { COSTS, describeChanges } from "./turn.mjs";
import { PACKET_SCHEMA } from "./perceive.mjs";
import { formsFromWords } from "./pronoun.mjs";
import { PROMPT_VERSION, promptText } from "./prompt.mjs";

export const PLAN_SCHEMA = 1;
/** Every kind a plan may name. The module carries out only those in turn.mjs's COSTS so far; checkPlan turns down the rest by name. */
export const STEP_KINDS = ["stride", "step", "crawl", "fly", "swim", "climb", "burrow", "release", "strike", "ability", "spell", "stand", "drop-prone", "seek", "hide", "sneak", "take-cover", "flee", "interact", "delay", "order", "say", "command-animal", "point-out", "none"];
export const MAX_STEPS = 8, MAX_TRIES = 2, LISTEN_MS = 120000, MAX_WAIT_S = 100;   /* run_script stops at 120 s */
const LABEL = /^[EM]\d{1,3}$/, ITEM = /^[\w-]{1,80}$/, BY = ["chat", "api", "gm"];

/** A short line of text from outside: no control characters, capped. */
export const text = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, max) : "";
const bad = reason => ({ ok: false, reason });
/** A plan as it arrives (an object or JSON text), reduced to the fields the module reads. Anything else is dropped; a wrong shape is refused with a
    reason a person can read. Legality (actions, reach, what it perceives) is turn.mjs's checkPlan, after this. */
export function cleanPlan(raw) {
  let p = raw;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { return bad("The plan isn't valid JSON."); } }
  if (!p || typeof p !== "object" || Array.isArray(p)) return bad("A plan is an object with a list of steps.");
  if (p.schema != null && p.schema !== PLAN_SCHEMA) return bad(`This module reads plan schema ${PLAN_SCHEMA}, not ${text(String(p.schema), 10)}.`);
  if (!Array.isArray(p.steps) || !p.steps.length) return bad("The plan has no steps.");
  if (p.steps.length > MAX_STEPS) return bad(`A plan has at most ${MAX_STEPS} steps.`);
  const steps = [];
  for (const [n, s] of p.steps.entries()) {
    const at = `Step ${n + 1}`;
    if (!s || typeof s !== "object") return bad(`${at} isn't a step.`);
    if (!STEP_KINDS.includes(s.do)) return bad(`${at}: "${text(String(s.do ?? ""), 30)}" isn't a kind of step.`);
    const out = { do: s.do };
    if (s.item != null) { if (typeof s.item !== "string" || !ITEM.test(s.item)) return bad(`${at}: "${text(String(s.item), 30)}" isn't an id.`); out.item = s.item; }
    if (s.target != null) { if (typeof s.target !== "string" || !LABEL.test(s.target)) return bad(`${at}: "${text(String(s.target), 30)}" isn't a label like E1.`); out.target = s.target; }
    if (s.to != null) { if (!Array.isArray(s.to) || s.to.length !== 2 || !s.to.every(v => Number.isInteger(v) && v >= 0 && v < 1000)) return bad(`${at}: "to" is a square, [x, y].`); out.to = [...s.to]; }
    /* a spell's rank (0 is never a rank, but a cantrip's own rank is given as is) and, for a spell cast with a choice of actions, how many */
    /* a Climb's tree, when it names one of several beside it (0.15.0) */
    if (s.tree != null) { if (!Array.isArray(s.tree) || s.tree.length !== 2 || !s.tree.every(v => Number.isInteger(v) && v >= 0 && v < 1000)) return bad(`${at}: "tree" is a tree's square, [x, y].`); out.tree = [...s.tree]; }
    /* a Fly's or a Climb's height at its end, in feet above the ground (0 lands it) */
    if (s.height != null) { if (!Number.isInteger(s.height) || s.height < 0 || s.height > 1000) return bad(`${at}: "height" is feet above the ground, a whole number from 0.`); out.height = s.height; }
    if (s.rank != null) { if (!Number.isInteger(s.rank) || s.rank < 1 || s.rank > 10) return bad(`${at}: "rank" is a spell rank, 1 to 10.`); out.rank = s.rank; }
    if (s.actions != null) { if (!Number.isInteger(s.actions) || s.actions < 0 || s.actions > 3) return bad(`${at}: "actions" is 0 to 3.`); out.actions = s.actions; }
    /* an area spell's aim: a burst's grid corner ("at"), a cone's or line's square ("toward"); "deliberate" when it means to catch its allies */
    for (const k of ["at", "toward"]) if (s[k] != null) { if (!Array.isArray(s[k]) || s[k].length !== 2 || !s[k].every(v => Number.isInteger(v) && v >= 0 && v < 1000)) return bad(`${at}: "${k}" is [x, y].`); out[k] = [...s[k]]; }
    if (s.deliberate != null) { if (typeof s.deliberate !== "boolean") return bad(`${at}: "deliberate" is true or false.`); if (s.deliberate) out.deliberate = true; }
    /* an Interact's words for the GM's card, and the creature a Delay waits for (0.12.0) */
    if (s.what != null) { if (typeof s.what !== "string") return bad(`${at}: "what" is a few words of text.`); const w = text(s.what, 120); if (w) out.what = w; }
    if (s.after != null) { if (typeof s.after !== "string" || !LABEL.test(s.after)) return bad(`${at}: "after" isn't a label like E1.`); out.after = s.after; }
    /* a Burrow that comes up to the surface at its end (0.16.0) */
    if (s.up != null) { if (typeof s.up !== "boolean") return bad(`${at}: "up" is true or false.`); if (s.up) out.up = true; }
    /* an order to its band (0.28.0): which part of the plan it changes, the kind whose job it changes, and the sentence said aloud (for the chat
       line and the History only: what the hearers are sent is written by the module from the label or the place) */
    if (s.part != null) { if (!["objective", "job", "fallBack", "yield"].includes(s.part)) return bad(`${at}: "part" is "objective", "job", "fallBack" or "yield".`); out.part = s.part; }
    if (s.job != null) { if (typeof s.job !== "string" || !/^[rk]\d{1,3}$/.test(s.job)) return bad(`${at}: "job" is the id of a kind in "orders.give.jobs", like "r0".`); out.job = s.job; }
    if (s.intent != null) { if (!["yield", "bargain", "threat"].includes(s.intent)) return bad(`${at}: "intent" is "yield", "bargain" or "threat".`); out.intent = s.intent; }   /* a `say` step (0.29.0) */
    if (s.say != null) { if (typeof s.say !== "string") return bad(`${at}: "say" is one sentence of text.`); const w = text(s.say, 160); if (w) out.say = w; }
    /* Command an Animal (0.30.0): the instruction, and the creature the animal is set on ("target" is the animal, "to" the square of a "go") */
    if (s.instruction != null) { if (!["attack", "go", "stay"].includes(s.instruction)) return bad(`${at}: "instruction" is "attack", "go" or "stay".`); out.instruction = s.instruction; }
    if (s.foe != null) { if (typeof s.foe !== "string" || !LABEL.test(s.foe)) return bad(`${at}: "foe" isn't a label like E1.`); out.foe = s.foe; }
    /* its own short reason, for the GM's history window (Rhea, 2026-11-08); never read by the check */
    if (s.why != null) { const w = text(String(s.why), 160); if (w) out.why = w; }
    steps.push(out);
  }
  /* the ground the thinker judged, on a map the module can't read, when its packet asked (0.16.0) */
  let ground = null; if (p.ground != null) { const g = cleanGround(p.ground); if (!g.ok) return g; ground = g.ground; }
  /* which of the map's walls are stone, for a monster that glides through rock (0.17.0) */
  let walls = null; if (p.walls != null) { const g = cleanWalls(p.walls); if (!g.ok) return g; walls = g.walls; }
  return { ok: true, plan: { schema: PLAN_SCHEMA, reason: text(p.reason, 300), steps, ifBlocked: text(p.ifBlocked, 100) || null, suggestOpus: p.suggestOpus === true, ...(ground ? { ground } : {}), ...(walls ? { walls } : {}) } };
}
export const MAX_SOIL_AREAS = 24;
/** The ground judgment a plan may carry (0.16.0; Rhea, 2026-11-08: on a map the module can't read, Angel judges the soil in play): { soil: "all" } (the
    whole floor is soil), { soil: "none" } (all rock), or { soil: [[x0, y0, x1, y1], ...] }, rectangles of squares, both corners included, at most
    MAX_SOIL_AREAS. Returns { ok, ground } or a refusal in words. */
export function cleanGround(g) {
  const r = cleanAreas(g, "ground", "soil"); return r.ok ? { ok: true, ground: { soil: r.value } } : r;
}
/** Which walls are stone, a plan may carry for a monster that glides through rock (0.17.0; Rhea, 2026-11-09: "Angel's choice based on what the walls are
    made of for the location"): { stone: "all" | "none" | [[x0, y0, x1, y1], ...] }, rectangles of squares whose walls are stone or earth. */
export function cleanWalls(g) {
  const r = cleanAreas(g, "walls", "stone"); return r.ok ? { ok: true, walls: { stone: r.value } } : r;
}
/* "all", "none" or up to MAX_SOIL_AREAS rectangles of squares, under one key of one object, in words when it is wrong */
function cleanAreas(g, name, key) {
  if (!g || typeof g !== "object" || Array.isArray(g)) return bad(`"${name}" is { "${key}": "all" }, { "${key}": "none" } or { "${key}": [[x0, y0, x1, y1], ...] }.`);
  const v = g[key];
  if (v === "all" || v === "none") return { ok: true, value: v };
  if (!Array.isArray(v) || !v.length) return bad(`"${name}.${key}" is "all", "none" or a list of rectangles [x0, y0, x1, y1].`);
  if (v.length > MAX_SOIL_AREAS) return bad(`"${name}.${key}" has at most ${MAX_SOIL_AREAS} rectangles.`);
  const out = [];
  for (const r of v) { if (!Array.isArray(r) || r.length !== 4 || !r.every(x => Number.isInteger(x) && x >= 0 && x < 1000)) return bad(`each ${key} rectangle is [x0, y0, x1, y1], four whole numbers (squares).`);
    out.push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]); }
  return { ok: true, value: out };
}
/** Who made a plan, kept with it: the route, the model, the chat's generation, and usage (filled by the API route later). */
export function cleanMeta(m = {}) {
  const num = v => Number.isFinite(v) && v >= 0 ? v : null, u = m?.usage && typeof m.usage === "object" ? m.usage : null;
  return { by: BY.includes(m?.by) ? m.by : "gm", model: text(m?.model, 60) || null, generation: Number.isInteger(m?.generation) ? m.generation : null,
    usage: u ? { in: num(u.in), out: num(u.out), seconds: num(u.seconds), cost: num(u.cost) } : null };
}

/* ---------- the event queue ---------- */
/** The next event number: never smaller than the clock, always above every number given out, so a cursor only moves forwards across fights. */
export const nextSeq = (maxSeen = 0, now = 0) => Math.max(Math.floor(now), Math.floor(maxSeen) + 1);
/** An event still matters while its request waits for the plan it asks for. A turn event wants the first plan, a retry the second; once a plan is in,
    a turn is played, or the thinker gave up, it's history. */
export const live = (ev, req) => ev.kind === "stall" ? stallLive(ev, req) : ev.kind === "choice" ? choiceLive(ev, req) : !!req?.packet && req.state === "requested" && !req.gaveUp && (req.tries ?? 0) === ev.tries;

/* ---------- a choice in the middle of an action (0.27.0) ----------
   Rhea, 2026-11-11 (PR-1): when a champion's Glimpse of Redemption makes a monster repent or refuse, the thinker decides at that moment, through the
   monster's mind. It is an event of its own ("choice") on the monster's request, answered by handing in { choice, reason } where a plan would go. */
export const CHOICE_KINDS = ["repent", "refuse"];
/** A choice event matters while that same question is still open on its request. */
export const choiceLive = (ev, req) => !!req?.choice && req.choice.seq === ev.choiceSeq && !req.choice.answer && !req.choice.gaveUp && req.state !== "manual";
/** Is this a choice handed in (and not a plan)? */
export const isChoice = raw => { let p = raw; if (typeof p === "string") { try { p = JSON.parse(p); } catch { return false; } } return !!p && typeof p === "object" && !Array.isArray(p) && p.choice != null && p.steps == null; };
/** A choice as it arrives (an object or JSON text), reduced to what the module reads, or refused in words. */
export function cleanChoice(raw) {
  let p = raw;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { return bad("The choice isn't valid JSON."); } }
  if (!p || typeof p !== "object" || Array.isArray(p)) return bad(`A choice is { "choice": "repent" } or { "choice": "refuse" }, with a short "reason".`);
  if (!CHOICE_KINDS.includes(p.choice)) return bad(`"choice" is "repent" or "refuse", not "${text(String(p.choice ?? ""), 30)}".`);
  return { ok: true, choice: p.choice, reason: text(p.reason, 200), seq: Number.isFinite(p.seq) ? p.seq : null };   /* the event's own number, when the thinker passes it back */
}
/** The packet a choice goes out with, cut down to what the choice rests on (seen live 2026-11-11: the whole packet again cost about 1,500 tokens a
    choice): its mind, band and notebook, its own HP and conditions, and who it perceives and fights beside with their health words. */
export function choicePacket(p) {
  if (!p) return null;
  const who = x => ({ label: x.label, ...(x.name ? { name: x.name } : {}), ...(x.state ? { state: x.state } : {}), ...(x.healthWord ? { healthWord: x.healthWord } : {}), ...(x.distance != null ? { distance: x.distance } : {}), ...(x.conditions?.length ? { conditions: x.conditions } : {}) });
  return { schema: p.schema, ...(p.mind ? { mind: p.mind } : {}), ...(p.band ? { band: p.band } : {}), ...(p.bandNow ? { bandNow: p.bandNow } : {}), ...(p.notebook ? { notebook: p.notebook } : {}),
    you: { label: p.you?.label ?? null, name: p.you?.name ?? null, hp: p.you?.hp ?? null, conditions: p.you?.conditions ?? [], ...(p.you?.side ? { side: p.you.side } : {}) },
    allies: (p.allies ?? []).map(who), perceived: (p.perceived ?? []).filter(x => x?.label).map(who), round: p.round ?? null };
}
/** What the thinker receives for a choice: the question, and the monster's packet as it last was, cut down (`choicePacket`). The seq to pass back
    is the question's own (`choiceSeq`): a choice the API handed on to the chat goes out again as a newer event of the same question (0.31.0). */
export function choiceOut(ev, req, packet = null) {
  return { seq: ev.seq, kind: "choice", combatId: ev.combatId, requestId: ev.requestId, round: req.round, monster: packet?.you?.label ?? null,
    choice: { about: req.choice.kind, on: req.choice.ally ?? null, words: req.choice.words, answers: CHOICE_KINDS, answerWith: `{ "choice": "repent" | "refuse", "reason": "a few words", "seq": ${ev.choiceSeq ?? ev.seq} } where a plan would go` }, packet: choicePacket(packet) };
}

/* ---------- stalls (Rhea, 2026-11-08) ---------- */
/** How long a turn may sit before it counts as stalled: machine work (an action running, or the thinker's plan not in) 60 s; anything waiting on a person
    (a save, a card to apply, a stopped turn) 3 minutes. A turn waiting for the GM's Next step without Auto is normal and never stalls, nor does Held. */
export const STALL_MS = { machine: 60000, person: 180000, extending: 240000 };
const STALL_KIND = { requested: "machine", submitted: "machine", running: "machine", extending: "machine", saves: "person", stopped: "person", fled: "person" };
/** Is this request stalled now? since: when it last moved on (state, step or a stage's record), on the server clock. auto: the monster's Auto box. */
export function stallOf(req, { now, auto = false, machineMs = STALL_MS.machine } = {}) {
  if (!req || req.gaveUp || !Number.isFinite(req.since) || !Number.isFinite(now) || now < req.since) return null;
  /* a request with no packet, or refused for the last time, waits on the GM, not on the thinker */
  const gm = req.state === "requested" && (!req.packet || (req.tries ?? 0) >= MAX_TRIES);
  /* waiting for a player's reaction (0.20.0) is a wait on a person, whatever the step's state */
  if (req.react) { const waited = now - req.since; return waited >= STALL_MS.person ? { kind: "person", state: "reacting", since: req.since, waited } : null; }
  /* a monster's repent-or-refuse (0.27.0): Angel's to answer within the machine's time, or the GM's on her card */
  if (req.choice && !req.choice.answer) { const waited = now - req.since, mine = !!req.choice.angel && !req.choice.gaveUp; return waited >= (mine ? machineMs : STALL_MS.person) ? { kind: mine ? "machine" : "person", state: "choosing", since: req.since, waited } : null; }
  const kind = gm ? "person" : STALL_KIND[req.state] ?? (req.state === "ready" && auto ? "person" : null); if (!kind) return null;
  const waited = now - req.since; return waited >= (kind === "machine" ? (req.state === "extending" ? Math.max(machineMs, STALL_MS.extending) : machineMs) : STALL_MS.person) ? { kind, state: gm ? "gm" : req.state, since: req.since, waited } : null;
}
/** A stall event matters while the request is still stuck at the same point. */
export const stallLive = (ev, req) => !!req?.stall && req.stall.since === ev.since && req.since === ev.since && !["done", "manual", "held"].includes(req.state);
/** What it's waiting on, in words for the card and the thinker. */
export function stallWords(stall) {
  const what = { gm: "waiting for you to play the turn", requested: "waiting for Angel's plan", submitted: "checking the plan", running: "an action has been running", saves: "waiting for a save", reacting: "waiting for a reaction", choosing: "waiting for the monster's answer to Glimpse of Redemption (Repent or Refuse on your card)", stopped: "stopped, waiting for you", ready: "waiting for you (a card to apply, then Next step)", fled: "at the map's edge, waiting for you (Extend map or Let it get away)", extending: "the map has been extending" }[stall?.state] ?? "not moving";
  const m = Math.floor((stall?.waited ?? 0) / 60000), sec = Math.round((stall?.waited ?? 0) / 1000);
  return `Stalled: ${what}, for ${m >= 1 ? `${m} minute${m === 1 ? "" : "s"}` : `${sec} seconds`}.`;
}
/** The first event after the cursor that still matters. events: [{ seq, ... }] from every running fight; isLive(ev) says whether it still matters. */
export function pickEvent(events = [], cursor = 0, isLive = () => true) {
  return [...events].filter(e => e.seq > (cursor ?? 0)).sort((a, b) => a.seq - b.seq).find(isLive) ?? null;
}
/** What the thinker receives for an event: the event, its packet, and how many tries are left. The packet already went through packetOf. */
export function eventOut(ev, req) {
  /* a stall: no packet (nothing to plan), just what's stuck, so the thinker can look into it (the note, the runner's windows) and clear it or tell the GM */
  if (ev.kind === "stall") return { seq: ev.seq, kind: "stall", combatId: ev.combatId, requestId: ev.requestId, round: req.round, monster: req.packet?.you?.label ?? null, state: req.state,
    stall: { kind: req.stall?.kind ?? null, waitedSeconds: Math.round((req.stall?.waited ?? 0) / 1000), words: stallWords(req.stall) }, step: (req.pos ?? 0) + 1, steps: req.steps?.length ?? 0, verdict: req.verdict ?? null };   /* never the GM's note: it carries names and what the monster can't know */
  return { seq: ev.seq, kind: ev.kind, combatId: ev.combatId, requestId: ev.requestId, round: req.round, monster: req.packet?.you?.label ?? null, triesLeft: MAX_TRIES - (req.tries ?? 0),
    ...(ev.kind === "retry" ? { reason: req.verdict, yourPlan: req.plan ?? null } : ev.kind === "replan" ? { reason: describeChanges(req.why, undefined, undefined, formsFromWords(req.packet?.mind?.pronoun)), done: req.done ?? [] } : {}), packet: req.packet };
}

/* ---------- who is listening ---------- */
/** The light on the Monster Turns window: a thinker asked for an event within the last two minutes. Times are Foundry's server clock, which every
    browser shares; it starts again at every world launch, so a time is only good for the launch it was written in (`launch`, kept beside it since
    0.23.0): a time kept from an earlier launch turned the light on by itself for two minutes once the new launch's clock reached it (seen 2026-11-10).
    A time ahead of now counts as not listening either way. With no `launch` given the launch isn't compared. */
export const listening = (brain, now, launch) => !!brain?.at && (launch === undefined || (brain.launch ?? "") === launch) && now >= brain.at && now - brain.at < LISTEN_MS;
/** A newer chat takes over: plans and waits from an older generation are refused, so two chats never both play a monster. No generation means a GM by hand. */
export const stale = (brain, generation) => generation != null && generation !== (brain?.generation ?? 0);
/** The first answer a new thinker gets. */
export function hello(generation) {
  const canDo = Object.keys(COSTS);
  return { generation, planSchema: PLAN_SCHEMA, packetSchema: PACKET_SCHEMA, promptVersion: PROMPT_VERSION, stepKinds: STEP_KINDS, canDo, maxSteps: MAX_STEPS, tries: MAX_TRIES,
    prompt: promptText({ canDo, stepKinds: STEP_KINDS, maxSteps: MAX_STEPS, tries: MAX_TRIES }) };
}
/** How long one wait may hold, in seconds. */
export const waitSeconds = s => Math.min(MAX_WAIT_S, Math.max(0, Number.isFinite(s) ? s : 90));
