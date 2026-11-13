/* Lythara Encounter Builder: monsters changing sides (0.30.0, monster minds release 3, tier 3d). The simple rule (Rhea, q-16, R3-15): a creature's
   side is PF2e's, at once, for everyone; the module only keeps the books: the creature leaves its band, gets no more orders, keeps its notebook
   and the last plan it heard, "If the leader falls" fires when it led, it rejoins when a temporary change flips back, its ticks stay as they
   were, and the module stops playing a creature a player owns. Pure: no Foundry globals. docs/features/sides.md. */

import { IT, pro } from "./pronoun.mjs";

/** A creature's side as the books keep it: "party", "opposition" or "none" (PF2e's `alliance`, null for a creature on nobody's side). */
export const sideWord = alliance => alliance === "party" || alliance === "opposition" ? alliance : "none";

/** What changed for one creature since the books were last written. was: { side, band, owned, from?, changed? } or null (first seen);
    now: { side, band (its band's key as things stand, "" on the party's side), owned (a player owns it) }. `from` is the side it started the
    fight on, `home` the band it started in; both stay through every flip so a flip back can be told from a second change.
    Out: { entry (what to store), events: [...] } with events of kind "first", "turned" (to another side), "back" (to the side it started on),
    "owned" (a player got it) and "unowned". */
export function sideChange(was, now, round = 0) {
  if (!was) return { entry: { side: now.side, from: now.side, home: now.band ?? "", owned: !!now.owned }, events: [{ kind: "first" }] };
  const events = [], entry = { ...was, side: now.side, owned: !!now.owned };
  if (!was.home && !was.changed && now.band) entry.home = now.band;   /* it joined a band after the books were opened */
  if (now.side !== was.side) {
    if (now.side === was.from) { events.push({ kind: "back", from: was.side, to: now.side, band: was.home ?? "" }); delete entry.changed; }
    else { events.push({ kind: "turned", from: was.side, to: now.side, band: was.home ?? "" }); entry.changed = round; }
  }
  if (!!now.owned !== !!was.owned) { events.push({ kind: now.owned ? "owned" : "unowned" }); if (now.owned) entry.ownedAt = round; else delete entry.ownedAt; }
  return { entry, events };
}
const SIDE = { party: "the party's", opposition: "the monsters'", none: "nobody's" };
/** The band log's line for a side event (History), in names. e: { k: "side" | "sideBack" | "owned" | "unowned", tok, from, to, bandName }. */
export function sideLogWords(e, { nameOf = id => id, bandName = "", formsOf = () => IT } = {}) {
  const who = nameOf(e.tok); return pro(sideLogIt(e, who, bandName), formsOf(e.tok));   /* the creature's own pronoun (pronoun.mjs) */
}
function sideLogIt(e, who, bandName) {
  if (e.k === "side") return `${who} changed sides (now ${SIDE[e.to] ?? "another side's"})${bandName ? `; left the band ${bandName}` : ""}.`;
  if (e.k === "sideBack") return `${who} is back on ${SIDE[e.to] ?? "{their} old"} side${bandName ? ` and rejoins the band ${bandName} with the last plan {they} heard (orders given meanwhile are lost to {them})` : ""}.`;
  if (e.k === "owned") return `${who} was given to a player; the module no longer plays {them}.`;
  if (e.k === "unowned") return `${who} is no longer a player's; the module can play {them} again.`;
  return "";
}
/** The tag on its row of Monster Turns. entry: the books' entry; round: the fight's round. */
export function sideTag(entry) {
  if (entry?.owned) return { kind: "owned", text: entry.ownedAt != null ? "a player's now: not played by the module" : "a player's: not played by the module" };   /* "now" only when it changed hands in this fight */
  if (entry?.changed != null) return { kind: "turned", text: `changed sides, round ${entry.changed}` };
  return null;
}
/** The card's words for a creature that changed sides (her sample). */
export function sideCardWords(entry, { bandName = "", forms = IT } = {}) {
  if (entry?.changed == null) return null;
  return (bandName ? [`{They} {has|have} left the band ${bandName}: {they} {gets|get} no more orders and {stops|stop} following the band's plan. {They} {keeps|keep} {their} notebook and the last plan {they} heard. Everyone treats {them} as on {their} new side from now on.`, `If the change wears off, {they} {rejoins|rejoin} ${bandName} with the last plan {they} heard (orders given meanwhile are lost to {them}).`]
    : [`Everyone treats {them} as on {their} new side from now on. {They} {keeps|keep} {their} notebook.`, `If the change wears off, {they} {is|are} back on {their} old side.`]).map(t => pro(t, forms));
}
/** What a turncoat's own packet says of where it came from (schema 7): the side it fought for, its old band and the last it heard there, as
    something it knows and no longer follows. heard: lines in labels (the plan's objective, standing orders), already gated by the caller. */
export function changedForPacket(entry, { bandName = "", heard = [], forms = IT } = {}) {
  if (entry?.changed == null) return null; const say = t => pro(t, forms);
  /* the band's name is the GM's own text and isn't sent (it has passed no name gate): "in a band" is enough */
  return { since: entry.changed, was: say(`Until round ${entry.changed} {they} fought for the other side${bandName ? ", in a band" : ""}. {They} {has|have} changed sides: {their} old side are {their} enemies now and the creatures {they} fought are {their} allies.`),
    ...(heard.length ? { lastHeard: heard.slice(0, 4), note: say("What {they} last heard from {their} old band, as something {they} {knows|know} about them. {They} no longer {follows|follow} any of it.") } : {}) };
}
/** The side lines the fight's log keeps. */
export const SIDE_LOG = ["side", "sideBack", "owned", "unowned"];
