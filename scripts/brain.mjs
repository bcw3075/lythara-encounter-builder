/* The brain interface: the one contract between the fight and whoever thinks for a monster. Today that's a Claude chat waiting through the bridge;
   later the Claude API. The module can't tell them apart: both wait for an event, read its packet, and hand in a plan. Pure: no Foundry globals;
   fight.mjs keeps the events on the Combat flag and the listener in a world setting. See claude/encounter-builder-plan.md, steps 3 and 5. */
import { COSTS } from "./turn.mjs";
import { PACKET_SCHEMA } from "./perceive.mjs";
import { PROMPT_VERSION, promptText } from "./prompt.mjs";

export const PLAN_SCHEMA = 1;
/** Every kind a plan may name. The module carries out only those in turn.mjs's COSTS so far; checkPlan turns down the rest by name. */
export const STEP_KINDS = ["stride", "step", "strike", "ability", "spell", "stand", "seek", "hide", "sneak", "take-cover", "drop", "interact", "delay", "none"];
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
    steps.push(out);
  }
  return { ok: true, plan: { schema: PLAN_SCHEMA, reason: text(p.reason, 300), steps, ifBlocked: text(p.ifBlocked, 100) || null, suggestOpus: p.suggestOpus === true } };
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
export const live = (ev, req) => !!req?.packet && req.state === "requested" && !req.gaveUp && (req.tries ?? 0) === ev.tries;
/** The first event after the cursor that still matters. events: [{ seq, ... }] from every running fight; isLive(ev) says whether it still matters. */
export function pickEvent(events = [], cursor = 0, isLive = () => true) {
  return [...events].filter(e => e.seq > (cursor ?? 0)).sort((a, b) => a.seq - b.seq).find(isLive) ?? null;
}
/** What the thinker receives for an event: the event, its packet, and how many tries are left. The packet already went through packetOf. */
export function eventOut(ev, req) {
  return { seq: ev.seq, kind: ev.kind, combatId: ev.combatId, requestId: ev.requestId, round: req.round, monster: req.packet?.you?.label ?? null, triesLeft: MAX_TRIES - (req.tries ?? 0),
    ...(ev.kind === "retry" ? { reason: req.verdict, yourPlan: req.plan ?? null } : {}), packet: req.packet };
}

/* ---------- who is listening ---------- */
/** The light on the Monster Turns window: a thinker asked for an event within the last two minutes. */
export const listening = (brain, now) => !!brain?.at && now - brain.at < LISTEN_MS;
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
