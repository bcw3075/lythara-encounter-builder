/* A monster's turn as plain data: what a plan means, whether it's legal, and where a step stands. Pure: no Foundry globals.
   The glue gathers live values first. Strikes and Strides so far; the other step kinds come as step 2 goes on. */
import { distanceBetween, headingOf } from "./move.mjs";
export const COSTS = { strike: 1, stride: 1, none: 0 };
const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];

/** Check a plan against what the glue gathered. Returns { ok: true, steps } with each step resolved, or { ok: false, reason }.
    ctx: { actions (left this turn), attacksBefore (attacks already made this turn, for the multiple attack penalty), strikes: [{ id, name, reach, ranged, maxRange }],
    targets: { label: { name, square, size, flat } or { name, distance, flat } }, me: { square, size }, speed, cantMove (why it can't Stride, or null),
    route(from, to) → { ok, route, cost } or { ok: false, reason } }. Only what the monster perceives is in targets. A Stride moves where later steps are
    measured from. Names here are labels when the reason goes to the thinker. */
export function checkPlan(plan, ctx) {
  if (!plan || !Array.isArray(plan.steps)) return { ok: false, reason: "The plan has no steps." };
  let left = ctx.actions, attacks = ctx.attacksBefore ?? 0, here = ctx.me?.square ?? null; const steps = [];
  const distanceTo = (t, reach) => here && t.square ? distanceBetween({ x: here[0], y: here[1], size: ctx.me.size ?? 1 }, { x: t.square[0], y: t.square[1], size: t.size ?? 1 }, { reach }) : t.distance;
  for (const [n, step] of plan.steps.entries()) {
    const at = `Step ${n + 1}`;
    if (!(step.do in COSTS)) return { ok: false, reason: `${at}: I can't do "${step.do}" yet.` };
    if (COSTS[step.do] > left) return { ok: false, reason: `${at}: no actions left.` };
    left -= COSTS[step.do];
    if (step.do === "none") { steps.push({ do: "none" }); continue; }
    if (step.do === "stride") {
      if (ctx.cantMove) return { ok: false, reason: `${at}: ${ctx.cantMove}` };
      if (!Array.isArray(step.to)) return { ok: false, reason: `${at}: a Stride needs "to", the square to end on.` };
      if (!here || !ctx.route) return { ok: false, reason: `${at}: I can't work out moves here.` };
      if (same(here, step.to)) return { ok: false, reason: `${at}: it is already at [${step.to[0]}, ${step.to[1]}].` };
      const way = ctx.route(here, step.to);
      if (!way.ok) return { ok: false, reason: `${at}: ${way.reason}` };
      if (way.cost > ctx.speed) return { ok: false, reason: `${at}: getting to [${step.to[0]}, ${step.to[1]}] takes ${way.cost} ft, more than its Speed of ${ctx.speed} ft.` };
      steps.push({ do: "stride", from: [...here], to: [...step.to], route: way.route, cost: way.cost });
      here = [...step.to]; continue;
    }
    const s = ctx.strikes.find(x => x.id === step.item); if (!s) return { ok: false, reason: `${at}: it has no attack called "${step.item}".` };
    const t = ctx.targets[step.target]; if (!t) return { ok: false, reason: `${at}: it doesn't know of "${step.target}".` };
    const where = steps.some(x => x.do === "stride") ? ` from [${here[0]}, ${here[1]}]` : "";
    if (s.ranged) { const d = distanceTo(t, null); if (s.maxRange && d > s.maxRange) return { ok: false, reason: `${at}: ${t.name} is ${d} ft away${where}, out of range of ${s.name} (${s.maxRange} ft).` }; }
    else { const d = distanceTo(t, s.reach); if (d > s.reach) return { ok: false, reason: `${at}: ${t.name} is ${d} ft away${where}, out of reach of ${s.name} (${s.reach} ft).` }; }
    steps.push({ do: "strike", item: s.id, itemName: s.name, target: step.target, targetName: t.name ?? step.target, variant: Math.min(attacks, 2), flat: t.flat ?? 0 });
    attacks++;
  }
  return { ok: true, steps };
}
/** One id per Strike. A thrown dagger shares its slug with the melee one, and a plan has to be able to say which. strikes: [{ slug, ranged }]. */
export function strikeIds(strikes) {
  const seen = new Map();
  return strikes.map(s => { const n = (seen.get(s.slug) ?? 0) + 1; seen.set(s.slug, n); return n === 1 ? s.slug : s.ranged ? `${s.slug}-ranged${n > 2 ? `-${n}` : ""}` : `${s.slug}-${n}`; });
}
/** What resolved steps used of the turn: actions, and attacks for the multiple attack penalty. */
export function spentBy(steps = []) {
  let actions = 0, attacks = 0; for (const s of steps) { actions += COSTS[s.do] ?? 0; if (s.do === "strike") attacks++; } return { actions, attacks };
}
export const OUTCOMES = ["critical miss", "miss", "hit", "critical hit"];
/** A finished step as the monster saw it, for the next plan: labels and ids only, and the result shown in chat. */
export function doneStep(step, rec = {}) {
  if (step.do === "stride") { const got = rec.moved?.to; return { do: "stride", to: step.to, result: !got ? "unknown" : same(got, step.to) ? "arrived" : `stopped at [${got[0]}, ${got[1]}]` }; }
  if (step.do !== "strike") return { do: step.do };
  return { do: "strike", item: step.item, target: step.target, result: rec.flat && !rec.flat.ok ? "flat check failed" : rec.attack ? OUTCOMES[rec.attack.degree] ?? "unknown" : "unknown" };
}

/* ---------- one action at a time: look again before each ---------- */
/* Rhea, 2026-11-06: the module carries a plan out one action at a time and looks again before each. If anything changed since the plan was made, the rest
   is dropped and the thinker is asked again with a fresh packet. The baseline is taken when the packet is, because that's what the plan was made from. */
export const MAX_REPLANS = 3;
/** What the rest of a turn rests on. me: { square, hp, actions, conditions }; others: { label: { square, state, down } }, only who it perceived when asked. */
export function situationOf({ me = {}, others = {} } = {}) {
  return { me: { square: me.square ?? null, hp: me.hp ?? 0, actions: me.actions ?? 0, conditions: [...new Set(me.conditions ?? [])].sort() },
    others: Object.fromEntries(Object.entries(others).map(([l, o]) => [l, { square: o.square ?? null, state: o.state, down: !!o.down }])) };
}
/** What changed since the plan was made, as data. Its own Strikes hurting someone don't count; someone going down does. */
export function changesSince(was, now) {
  if (!was || !now) return [];
  const out = [];
  if (!same(was.me.square, now.me.square)) out.push({ who: "me", what: "moved" });
  if (was.me.hp !== now.me.hp) out.push({ who: "me", what: now.me.hp < was.me.hp ? "hurt" : "healed" });
  if (was.me.actions !== now.me.actions) out.push({ who: "me", what: "actions", now: now.me.actions });
  if (was.me.conditions.join() !== now.me.conditions.join()) out.push({ who: "me", what: "conditions", now: now.me.conditions });
  for (const [label, w] of Object.entries(was.others)) {
    const n = now.others[label];
    if (!n) { out.push({ who: label, what: "gone" }); continue; }
    if (w.down !== n.down) out.push({ who: label, what: n.down ? "down" : "up" });
    if (w.state !== n.state) out.push({ who: label, what: "state", now: n.state });
    if (!same(w.square, n.square)) out.push({ who: label, what: "moved" });
  }
  return out;
}
/** A change in plain words. Labels stay labels unless nameOf says otherwise, so the same words can go to the thinker; `self` is how the monster is named. */
export function describeChange(c, nameOf = l => l, self = "It") {
  if (c.who === "plan") return String(c.reason ?? "").replace(/^Step \d+: /, "");
  const who = c.who === "me" ? self : nameOf(c.who) ?? c.who, its = c.who === "me" ? (self === "It" ? "Its" : `${self}'s`) : `${who}'s`;
  switch (c.what) {
    case "moved": return `${who} moved.`;
    case "hurt": return `${who} was hurt.`;
    case "healed": return `${who} regained HP.`;
    case "actions": return `${its} actions this turn are now ${c.now}.`;
    case "conditions": return `${its} conditions are now ${c.now?.length ? c.now.join(", ") : "none"}.`;
    case "gone": return `${who} is gone.`;
    case "down": return `${who} is down.`;
    case "up": return `${who} is back up.`;
    case "state": return `${who} is now ${c.now}.`;
    default: return `${who} changed.`;
  }
}
export const describeChanges = (list = [], nameOf, self) => list.map(c => describeChange(c, nameOf, self)).join(" ");

/** A resolved step in plain words, for the card. */
export function describeStep(s) {
  if (s.do === "none") return "Does nothing.";
  if (s.do === "stride") { const way = s.from ? headingOf(s.from, s.to) : ""; return `Strides ${s.cost ?? "?"} ft${way ? ` ${way}` : ""}, to square ${s.to[0]}, ${s.to[1]}.`; }
  return `${s.itemName} at ${s.targetName}${s.variant ? `, attack ${s.variant + 1}` : ""}${s.flat ? `, after a DC ${s.flat} flat check` : ""}.`;
}
/** What to do next with a Strike step, from what its record says already happened. Nothing is ever repeated: when the record can't tell
    whether something finished, the answer is "ask" and Rhea looks. */
export function nextAction(rec = {}, { apply = false, flat = 0 } = {}) {
  if (flat) { if (!rec.flatStarted) return "flat"; if (!rec.flat) return "ask"; if (!rec.flat.ok) return "next"; }   /* a failed flat check spends the action on nothing */
  if (!rec.started) return "attack";
  if (!rec.attack) return "ask";
  if (rec.attack.degree < 2) return "next";
  if (!rec.damageStarted) return "damage";
  if (!rec.damage) return "ask";
  if (!apply && !rec.applying) return "next";
  if (!rec.applying) return "apply";
  return rec.applied ? "next" : "ask";
}
/** What to do next with a Stride step. A move begun before a reload is never sent again: if the monster is where it was going, the step is done;
    anywhere else, the GM looks. at: the square it stands on now. */
export function nextMove(rec = {}, at = null, to = null) {
  if (rec.moved) return "next";
  if (!rec.started) return "move";
  return same(at, to) ? "arrived" : "ask";
}
/** This turn's unfinished request. By round and combatant, not turn number: an initiative change can move the number during the turn. */
export function currentOf(requests = {}, round, combatantId) {
  return Object.entries(requests).map(([id, r]) => ({ id, ...r })).filter(r => !["done", "manual"].includes(r.state) && r.round === round && r.combatantId === combatantId).at(-1) ?? null;
}
/** Whether a request has work in flight or about to start. Waiting on a person or a plan doesn't count. */
export const requestBusy = r => !!r && (r.state === "running" || r.state === "submitted" || !!r.go);
/** The note to show between turns: only the latest finished turn's, so an old warning never outlives the turn it was about. A turn that was re-planned
    is several requests linked by `parent`, and a warning from its first part (a PC at 0 HP) still counts. */
export function latestNote(requests = {}) {
  const fin = Object.values(requests).filter(r => ["done", "manual"].includes(r.state)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const last = fin.at(-1); if (last?.state !== "done") return null;
  const notes = []; for (let r = last, n = 0; r && n < 10; r = r.parent ? requests[r.parent] : null, n++) if (r.note) notes.unshift(r.note);
  return notes.length ? { ...last, note: notes.join(" ") } : null;
}
/** The roll options PF2e's own damage button gives a target, from the damage card's context. */
export function damageOptions(options = []) {
  const origin = options.filter(o => o.startsWith("self:")).map(o => o.replace(/^self\b/, "origin"));
  return { origin, keep: options.filter(o => !/^(?:self|target)(?::|$)/.test(o)) };
}
