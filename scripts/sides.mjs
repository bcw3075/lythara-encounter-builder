/* Lythara Encounter Builder: monsters changing sides (0.30.0, monster minds release 3, tier 3d). The simple rule (Rhea, q-16, R3-15): a creature's
   side is PF2e's, at once, for everyone; the module only keeps the books: the creature leaves its band, gets no more orders, keeps its notebook
   and the last plan it heard, "If the leader falls" fires when it led, it rejoins when a temporary change flips back, its ticks stay as they
   were, and the module stops playing a creature a player owns. Pure: no Foundry globals. docs/features/sides.md. */

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
  if (!!now.owned !== !!was.owned) events.push({ kind: now.owned ? "owned" : "unowned" });
  return { entry, events };
}
const SIDE = { party: "the party's", opposition: "the monsters'", none: "nobody's" };
/** The band log's line for a side event (History), in names. e: { k: "side" | "sideBack" | "owned" | "unowned", tok, from, to, bandName }. */
export function sideLogWords(e, { nameOf = id => id, bandName = "" } = {}) {
  const who = nameOf(e.tok);
  if (e.k === "side") return `${who} changed sides (now ${SIDE[e.to] ?? "another side's"})${bandName ? `; left the band ${bandName}` : ""}.`;
  if (e.k === "sideBack") return `${who} is back on ${SIDE[e.to] ?? "its old"} side${bandName ? ` and rejoins the band ${bandName} with the last plan it heard (orders given meanwhile are lost to it)` : ""}.`;
  if (e.k === "owned") return `${who} was given to a player; the module no longer plays it.`;
  if (e.k === "unowned") return `${who} is no longer a player's; the module can play it again.`;
  return "";
}
/** The tag on its row of Monster Turns. entry: the books' entry; round: the fight's round. */
export function sideTag(entry) {
  if (entry?.owned) return { kind: "owned", text: "a player's now: not played by the module" };
  if (entry?.changed != null) return { kind: "turned", text: `changed sides, round ${entry.changed}` };
  return null;
}
/** The card's words for a creature that changed sides (her sample). */
export function sideCardWords(entry, { bandName = "" } = {}) {
  if (entry?.changed == null) return null;
  return bandName ? [`It has left the band ${bandName}: it gets no more orders and stops following the band's plan. It keeps its notebook and the last plan it heard. Everyone treats it as on its new side from now on.`, `If the change wears off, it rejoins ${bandName} with the last plan it heard (orders given meanwhile are lost to it).`]
    : [`Everyone treats it as on its new side from now on. It keeps its notebook.`, `If the change wears off, it is back on its old side.`];
}
/** What a turncoat's own packet says of where it came from (schema 7): the side it fought for, its old band and the last it heard there, as
    something it knows and no longer follows. heard: lines in labels (the plan's objective, standing orders), already gated by the caller. */
export function changedForPacket(entry, { bandName = "", heard = [] } = {}) {
  if (entry?.changed == null) return null;
  return { since: entry.changed, was: `Until round ${entry.changed} it fought for the other side${bandName ? `, in the band ${bandName}` : ""}. It has changed sides: its old side are its enemies now and the creatures it fought are its allies.`,
    ...(heard.length ? { lastHeard: heard.slice(0, 4), note: "What it last heard from its old band, as something it knows about them. It no longer follows any of it." } : {}) };
}
/** The side lines the fight's log keeps. */
export const SIDE_LOG = ["side", "sideBack", "owned", "unowned"];
