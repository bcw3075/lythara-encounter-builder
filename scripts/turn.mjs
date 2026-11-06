/* A monster's turn as plain data: what a plan means, whether it's legal, and where a step stands. Pure: no Foundry globals.
   The glue gathers live values first. For now this covers Strikes; movement and the rest come as step 2 goes on. */
export const COSTS = { strike: 1, none: 0 };

/** Check a plan against what the glue gathered. Returns { ok: true, steps } with each step resolved, or { ok: false, reason }.
    ctx: { actions, strikes: [{ id, name, reach, ranged, maxRange }], targets: { label: { distance, name } } } */
export function checkPlan(plan, ctx) {
  if (!plan || !Array.isArray(plan.steps)) return { ok: false, reason: "The plan has no steps." };
  let left = ctx.actions, attacks = 0; const steps = [];
  for (const [n, step] of plan.steps.entries()) {
    const at = `Step ${n + 1}`;
    if (!(step.do in COSTS)) return { ok: false, reason: `${at}: I can't do "${step.do}" yet.` };
    if (COSTS[step.do] > left) return { ok: false, reason: `${at}: no actions left.` };
    left -= COSTS[step.do];
    if (step.do === "none") { steps.push({ do: "none" }); continue; }
    const s = ctx.strikes.find(x => x.id === step.item); if (!s) return { ok: false, reason: `${at}: it has no attack called "${step.item}".` };
    const t = ctx.targets[step.target]; if (!t) return { ok: false, reason: `${at}: it doesn't know of "${step.target}".` };
    if (s.ranged) { if (s.maxRange && t.distance > s.maxRange) return { ok: false, reason: `${at}: ${t.name} is ${t.distance} ft away, out of range of ${s.name} (${s.maxRange} ft).` }; }
    else if (t.distance > s.reach) return { ok: false, reason: `${at}: ${t.name} is ${t.distance} ft away, out of reach of ${s.name} (${s.reach} ft).` };
    steps.push({ do: "strike", item: s.id, itemName: s.name, target: step.target, targetName: t.name, variant: Math.min(attacks, 2) });
    attacks++;
  }
  return { ok: true, steps };
}
/** A resolved step in plain words, for the card. */
export function describeStep(s) {
  if (s.do === "none") return "Does nothing.";
  return `${s.itemName} at ${s.targetName}${s.variant ? `, attack ${s.variant + 1}` : ""}.`;
}
/** What to do next with a Strike step, from what its record says already happened. Nothing is ever repeated: when the record can't tell
    whether something finished, the answer is "ask" and Rhea looks. */
export function nextAction(rec = {}, { apply = false } = {}) {
  if (!rec.started) return "attack";
  if (!rec.attack) return "ask";
  if (rec.attack.degree < 2) return "next";
  if (!rec.damageStarted) return "damage";
  if (!rec.damage) return "ask";
  if (!apply && !rec.applying) return "next";
  if (!rec.applying) return "apply";
  return rec.applied ? "next" : "ask";
}
/** This turn's unfinished request. By round and combatant, not turn number: an initiative change can move the number during the turn. */
export function currentOf(requests = {}, round, combatantId) {
  return Object.entries(requests).map(([id, r]) => ({ id, ...r })).filter(r => !["done", "manual"].includes(r.state) && r.round === round && r.combatantId === combatantId).at(-1) ?? null;
}
/** Whether a request has work in flight or about to start. Waiting on a person or a plan doesn't count. */
export const requestBusy = r => !!r && (r.state === "running" || r.state === "submitted" || !!r.go);
/** The note to show between turns: only the latest finished turn's, so an old warning never outlives the turn it was about. */
export function latestNote(requests = {}) {
  const fin = Object.values(requests).filter(r => ["done", "manual"].includes(r.state)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const last = fin.at(-1); return last?.state === "done" && last.note ? last : null;
}
/** The roll options PF2e's own damage button gives a target, from the damage card's context. */
export function damageOptions(options = []) {
  const origin = options.filter(o => o.startsWith("self:")).map(o => o.replace(/^self\b/, "origin"));
  return { origin, keep: options.filter(o => !/^(?:self|target)(?::|$)/.test(o)) };
}
