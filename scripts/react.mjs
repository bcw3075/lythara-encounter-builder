/* Player reactions during a monster's turn (0.20.0): which reactions the module knows, which gate each one fits, where along a move the gates fall,
   and what a reaction that raises AC does to an attack already rolled. Pure: no Foundry globals, so the unit tests run it in Node. */
import { distanceBetween } from "./move.mjs";

/* The gates a monster's action passes through (Rhea's design, 2026-11-05; built 0.20.0): move: it leaves a square during a move action (asked before
   it leaves); stay: a move action that leaves no square (Stand, Drop Prone, a Climb), asked at the end of that action; manipulate and ranged: asked
   before the action resolves; attack: a Strike at a creature, before the roll; hit: that Strike hit, before damage. */
/** The reactions the module knows, by PF2e slug, each row checked against Archives of Nethys (2026-11-09):
    Reactive Strike (Player Core; Player Core 2 pg. 80; monsters' Rage of Elements pg. 233): a creature within your reach uses a manipulate or a move
      action, makes a ranged attack, or leaves a square during a move action; a melee Strike, no multiple attack penalty; a critical hit disrupts a
      manipulate action. The old slug attack-of-opportunity is the same reaction.
    Shield Block (Player Core): while your shield is raised you would take physical damage from an attack; the shield takes it first.
    Reactive Shield (Player Core pg. 140): an enemy hits you with a melee Strike, while wielding a shield; you Raise a Shield, and the bonus counts
      against that attack.
    Nimble Dodge (Player Core): a creature targets you with an attack and you can see it; +2 circumstance to AC against that attack. */
export const KNOWN = {
  "reactive-strike": { name: "Reactive Strike", gates: ["move", "stay", "manipulate", "ranged"], reach: true },
  "attack-of-opportunity": { name: "Reactive Strike", gates: ["move", "stay", "manipulate", "ranged"], reach: true },
  "shield-block": { name: "Shield Block", gates: ["hit"], target: true, needs: "raised", physical: true },
  "reactive-shield": { name: "Reactive Shield", gates: ["hit"], target: true, needs: "shield", melee: true },
  "nimble-dodge": { name: "Nimble Dodge", gates: ["attack"], target: true, ac: 2 }
};
const PHYSICAL = ["bludgeoning", "piercing", "slashing"];

/** The trigger line of a reaction's description (HTML), in plain words, or null. */
export function triggerOf(html = "") {
  const m = String(html).match(/<strong>\s*Trigger\s*<\/strong>\s*([\s\S]*?)(?:<\/p>|<hr|<strong>|$)/i);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null : null;
}
/** A creature's reactions from its items ({ slug, name, actionType, description }): the known ones with their row, the others with their trigger. */
export function reactionsOf(items = []) {
  const out = [], seen = new Set();
  for (const it of items) {
    if (it?.actionType !== "reaction") continue;
    const row = KNOWN[it.slug], key = row ? row.name : it.slug ?? it.name; if (seen.has(key)) continue; seen.add(key);
    out.push(row ? { slug: it.slug, name: row.name, known: true } : { slug: it.slug ?? null, name: it.name, known: false, trigger: triggerOf(it.description) });
  }
  return out;
}
/** Does a known reaction fit this gate? who: what the glue read of the reactor ({ inReach, isTarget, shieldRaised, hasShield }); what: the action
    ({ melee, damageTypes }). Unknown reactions never fit: they are shown to the GM, never asked (Rhea, 2026-11-09: prompted only when they have the right one). */
export function fits(slug, gate, who = {}, what = {}) {
  const row = KNOWN[slug]; if (!row || !row.gates.includes(gate)) return false;
  if (row.reach && !who.inReach) return false;
  if (row.target && !who.isTarget) return false;
  if (row.needs === "raised" && !who.shieldRaised) return false;
  if (row.needs === "shield" && (!who.hasShield || who.shieldRaised)) return false;   /* already raised: nothing to gain */
  if (row.melee && !what.melee) return false;
  if (row.physical && (what.damageTypes?.length ? !what.damageTypes.some(t => PHYSICAL.includes(t)) : false)) return false;   /* unknown types: offer it */
  return true;
}
/** Where along a move the "move" gates fall. route: squares from where it stands to where it ends; mover: { size, elev }; reactors: [{ id, pos, span,
    elev, reach }]. A reactor is asked once per move action, before the mover leaves the first square of the route that is within its reach (the end
    square isn't left). Returns [{ k, ids }] by route index, in order. from: gates only from this index on (a move resumed after an earlier gate). */
export function routeGates(route = [], mover = {}, reactors = [], { from = 0, done = [] } = {}) {
  const out = new Map(), asked = new Set(done);
  for (let k = from; k < route.length - 1; k++) for (const r of reactors) {
    if (asked.has(r.id)) continue;
    const d = distanceBetween({ x: route[k][0], y: route[k][1], size: mover.size ?? 1, elev: mover.elev ?? 0 }, { x: r.pos[0], y: r.pos[1], size: r.span ?? 1, elev: r.elev ?? 0 }, { reach: r.reach });
    if (d <= r.reach) { asked.add(r.id); if (!out.has(k)) out.set(k, []); out.get(k).push(r.id); }
  }
  return [...out].sort((a, b) => a[0] - b[0]).map(([k, ids]) => ({ k, ids }));
}
/** The degree of an attack roll against a DC, as the rules count it: 10 over is a critical, under by 10 a critical failure, a natural 20 one better
    and a natural 1 one worse. 0 critical failure .. 3 critical success. */
export function degreeAgainst(total, natural, dc) {
  let d = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (natural === 20) d++; else if (natural === 1) d--;
  return Math.max(0, Math.min(3, d));
}
/** What the reactor is told, in a sentence. who: the mover as the reactor may see it ("The Sod Hound" or "A creature"); kind: the monster's action. */
export function gateWords(gate, who, { kind = "", reaction = "" } = {}) {
  const W = { move: `${who} is moving out of a square in your reach`, stay: `${who} ${kind || "uses a move action"} in your reach`, manipulate: `${who} uses a manipulate action in your reach${kind ? ` (${kind})` : ""}`,
    ranged: `${who} makes a ranged attack in your reach`, attack: `${who} attacks you`, hit: `${who}'s Strike hits you` };
  return `${W[gate] ?? who}. React with ${reaction}?`;
}
/** What a reaction asked on the card or the prompt resolved to, from the answers: "react" (and the reactor finished: "done"), "pass", "timeout",
    "continue" (the GM went on). A list is finished when no one is left to answer. */
export function finished(list = []) { return list.every(x => ["done", "pass", "timeout", "continue"].includes(x.answer)); }
/** When a question's countdown ends (server-clock ms), or 0 for none: only rows a player answers in their own window count down; rows the GM answers
    on her card wait (Rhea, 2026-11-09, 0.20.1). secs 0 is no countdown. */
export function untilFor(rows = [], secs = 0, now = 0) { return secs > 0 && rows.some(x => x.to === "player") ? now + secs * 1000 : 0; }
/** Whether the card shows the countdown: time is left and a player row is still unanswered. */
export function countingDown(rows = [], answers = {}, until = 0, now = 0) { return until > now && rows.some(x => x.to === "player" && !answers[x.id]); }
/** The answers as plain words for the card and the history ("Valeros: Reactive Strike", "Test Hero passed"). names: token id → name. */
export function answerWords(list = [], names = {}) {
  return list.map(x => { const n = names[x.token] ?? x.name ?? "Someone";
    return x.answer === "done" ? `${n} used ${x.reaction}` : x.answer === "react" ? `${n} is using ${x.reaction}` : x.answer === "timeout" ? `${n} didn't answer in time (${x.reaction} passed)` : x.answer === "continue" ? `${n}'s ${x.reaction} was skipped` : `${n} passed on ${x.reaction}`; });
}
