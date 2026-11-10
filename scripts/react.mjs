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

/* ---------- monsters reacting on players' turns (0.21.0) ----------
   Rhea, 2026-11-09: a monster with Angel and Auto ticked takes a Reactive Strike by itself, any other monster's is Do it / Skip on her card; every
   trigger the rule names counts ("basically it should be anything that the rules state"; a spell only through its own traits); and when the module
   isn't sure a trigger happened it always comes to her card, even for an Auto monster. Reactive Strike (Rage of Elements pg. 233; Player Core, checked
   on Archives of Nethys 2026-11-09): a creature within reach uses a manipulate action or a move action, makes a ranged attack, or leaves a square
   during a move action it is using. Each function says what the module saw and how sure it is: { gate, sure, kind, why }. */
/** The reactions the module runs for a monster: Reactive Strike under either slug. A monster's other reactions are listed for the GM, never run. */
export const MONSTER_REACTIONS = ["reactive-strike", "attack-of-opportunity"];
/* Foundry's movement actions that are move actions leaving squares (PF2e 8.7.0 names them Stride, Crawl, Climb, Swim, Fly, Burrow, Leap). Teleports
   (blink, displace) aren't move actions that leave squares. There is no "step": a one-square walk can be a Step, which triggers nothing. */
const MOVE_ACTIONS = ["walk", "crawl", "climb", "swim", "fly", "burrow", "jump"], TELEPORTS = ["blink", "displace"];
/** A token move as a trigger. action: Foundry's movement action; squares: how many squares it left; ownTurn: it is the mover's turn; stepped: the mover
    posted a Step card just before. Returns null (no trigger) or { gate: "move", sure, kind, why }. */
export function moveTrigger({ action = "walk", squares = 0, ownTurn = true, stepped = false } = {}) {
  if (!(squares > 0) || TELEPORTS.includes(action)) return null;
  if (squares === 1 && action === "walk") { if (stepped) return null;
    return { gate: "move", sure: false, kind: "moved one square", why: "It moved one square: a Step doesn't trigger this, a Stride does." }; }
  if (!MOVE_ACTIONS.includes(action)) return { gate: "move", sure: false, kind: "moved", why: `Its move was made as "${action}", which may not be a move action.` };
  if (!ownTurn) return { gate: "move", sure: false, kind: "moved", why: "It moved outside its own turn: being pushed or pulled doesn't trigger this." };
  return { gate: "move", sure: true, kind: "left a square" };
}
/* Action cards whose movement shows as a token move (the move tells; the card would only ask twice), and the two move actions that leave no square. */
const MOVERS = ["stride", "crawl", "leap", "fly", "swim", "climb", "burrow", "sneak", "tumble-through", "long-jump", "high-jump", "balance", "mount", "travel"];
const STAYS = { stand: "stood up", "drop-prone": "dropped prone" };
/* Consumables whose activation is an Interact (manipulate) by their own rules: drinking, applying, injecting. Others vary (a talisman is usually free). */
const HAND_CONSUMABLES = ["potion", "elixir", "oil", "mutagen", "drug"];
/** A chat card as a trigger. card: { type (PF2e's context type or null), ranged, spell (it is a cast card), consumable (its category, or true when
    unknown), traits ([] of slugs from the card's tags, its origin and its context), slug (the action's, sluggified), name }. Returns null,
    { step: true } (a Step: the next one-square move is no trigger), or { gate, sure, kind, why }. */
export function cardTrigger(card = {}) {
  const traits = card.traits ?? [], name = card.name || "an action";
  if (card.type === "attack-roll") return card.ranged ? { gate: "ranged", sure: true, kind: "made a ranged attack" } : null;
  if (card.type && !["spell-cast", "skill-check", "perception-check"].includes(card.type)) return null;   /* damage, saves and the like follow an action already seen */
  if (card.spell) return traits.includes("manipulate") ? { gate: "manipulate", sure: true, kind: `cast ${name} (manipulate)` } : null;   /* only by its own traits (Rhea) */
  if (card.consumable) return HAND_CONSUMABLES.includes(card.consumable) || traits.includes("manipulate") ? { gate: "manipulate", sure: true, kind: `used ${name} (an Interact)` }
    : { gate: "manipulate", sure: false, kind: `used ${name}`, why: `It used ${name}: if activating it was a manipulate action, this triggers.` };
  if (card.slug === "step") return { step: true };
  if (card.slug === "release") return null;   /* Release has the manipulate trait and triggers nothing (Player Core pg. 417) */
  if (traits.includes("manipulate")) return { gate: "manipulate", sure: true, kind: `used ${name} (manipulate)` };
  if (traits.includes("move")) { if (card.slug in STAYS) return { gate: "stay", sure: true, kind: STAYS[card.slug] };
    return MOVERS.includes(card.slug) ? null : { gate: "stay", sure: true, kind: `used ${name} (a move action)` }; }
  return null;
}
/** An item changing hands with no card (PF2e posts none for drawing, stowing or picking up). before/after: { carry, hands }. Letting go (dropped, or
    fewer hands on something still held) is a Release and triggers nothing; anything else is an Interact, if it was an action at all: never sure. */
export function equipTrigger(before = {}, after = {}, name = "an item") {
  const b = { carry: before.carry ?? "worn", hands: before.hands ?? 0 }, a = { carry: after.carry ?? b.carry, hands: after.hands ?? b.hands };
  if (a.carry === b.carry && a.hands === b.hands) return null;
  if (a.carry === "dropped" || (a.carry === "held" && b.carry === "held" && a.hands < b.hands)) return null;
  const did = a.carry === "held" && b.carry !== "held" ? "drew or picked up" : b.carry === "held" && a.carry !== "held" ? "put away" : a.carry === "held" ? "changed its grip on" : "moved";
  return { gate: "manipulate", sure: false, kind: `${did} ${name}`, why: `It ${did} ${name} with no action card: that is an Interact (manipulate) if it was done as an action.` };
}
/** Prone coming off with no Stand card: standing up is a move action, but the condition can also just be removed. Never sure. */
export function proneOffTrigger({ ownTurn = true, stood = false } = {}) {
  return ownTurn && !stood ? { gate: "stay", sure: false, kind: "is no longer prone", why: "Prone came off with no Stand card: if it stood up, that is a move action." } : null;
}
/** The squares a token passed, from the squares of its waypoints (the first is where it started): straight runs between them, one square a step. */
export function squaresAlong(points = []) {
  const out = []; for (const p of points) { if (!out.length) { out.push([p[0], p[1]]); continue; }
    let [x, y] = out.at(-1); while (x !== p[0] || y !== p[1]) { x += Math.sign(p[0] - x); y += Math.sign(p[1] - y); out.push([x, y]); } }
  return out;
}
/** Which melee Strike a monster reacts with: the best attack among those that reach. strikes: [{ id, name, ranged, reach, mod }]; dist in feet. */
export function reactionStrike(strikes = [], dist = 5) {
  return strikes.filter(s => !s.ranged && (s.reach ?? 5) >= dist).sort((a, b) => (b.mod ?? 0) - (a.mod ?? 0))[0] ?? null;
}
/** The line on the GM's card. o: { monster, target, strike, kind, sure, why } */
export function offerWords(o = {}) {
  const who = o.target ?? "a creature";
  return `${o.monster ?? "A monster"} can make a Reactive Strike${o.strike ? ` (${o.strike})` : ""} at ${who}: ${who} ${o.kind ?? "acted"} in its reach.${o.sure ? "" : ` Not certain. ${o.why ?? ""}`.trimEnd()}`;
}
