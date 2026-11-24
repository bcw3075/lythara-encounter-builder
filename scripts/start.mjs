/* How a monster starts a fight (0.41.0, F-3): Alert, Hidden, Unaware or Asleep. Its gear at the start (what it holds), the words its mind carries all
   fight, and the rules for a sleeper waking (PF2e's Unconscious condition, Player Core: damage, healing, an Interact, or a Perception check against the
   noise at the start of its turn). The pure part runs in Node for the unit tests; `readyGear` changes an actor and needs PF2e. */
import { pro } from "./pronoun.mjs";

export const STARTS = ["alert", "hidden", "unaware", "asleep"];
export const START_LABEL = { alert: "Alert", hidden: "Hidden", unaware: "Unaware", asleep: "Asleep" };
export const START_HINT = {
  alert: "Awake and ready for trouble: its main weapon in hand.",
  hidden: "Lying in wait out of sight: its main weapon in hand, initiative on Stealth, hidden by that roll when the fight starts.",
  unaware: "Awake but not expecting a fight: out of the party's first view, weapons put away (it must Draw), initiative on Perception.",
  asleep: "Asleep: out of the party's first view, nothing in hand, Unconscious until something wakes it.",
};
/** Weapons in hand at the start: Alert and Hidden hold their main one; Unaware and Asleep hold nothing (Rhea, F-3). */
export const armedAt = state => state === "alert" || state === "hidden";

/** A start for a monster nobody set one for (placed by hand): Asleep if it is Unconscious but not dying with HP left, Hidden if the build hid it,
    else Alert. f: { unconscious, dying, hp, startHidden }. */
export function deriveStart(f = {}) {
  if (f.unconscious && !f.dying && (f.hp ?? 1) > 0) return "asleep";
  if (f.startHidden) return "hidden";
  return "alert";
}

/** The weapon it should hold for an armed start, or null. weapons: [{ id, ranged, twoHands }] in the sheet's order; firstStrike: the weapon id of the
    first Strike on its stat block (its "main" attack) or null; role: the build row's role (a ranged one holds its ranged weapon, as since 0.33.2). */
export function mainWeapon(weapons = [], { role = null, firstStrike = null } = {}) {
  if (!weapons.length) return null;
  if (role === "ranged" && weapons.some(w => w.ranged)) return weapons.find(w => w.ranged);   /* none: the melee choice below (review 8) */
  const first = weapons.find(w => w.id === firstStrike);
  if (first && (role === null || role === "ranged" || !first.ranged)) return first;   /* placed by hand: its stat block's first Strike, whatever kind */
  return weapons.find(w => !w.ranged) ?? first ?? weapons[0];
}

/** What the thinker is told of how the fight found it (its mind's "started" line), in the "they" form with pronoun markers turned by `pro`.
    woke: the round it woke in, or null. */
export function startWords(state, forms, { woke = null, asleepNow = false } = {}) {
  const w = {
    alert: "alert: {they} expected trouble and had {their} weapon in hand when the fight began.",
    hidden: "hidden: {they} {was|were} lying in wait, out of sight, weapon in hand, when the fight began.",
    unaware: "unaware: {they} {was|were} awake but not expecting a fight, and {their} weapons were put away. The fight's first moments caught {them} off guard: {they} may have needed to Draw a weapon, call out or get {their} bearings before {they} can fight well.",
    asleep: "asleep: {they} {was|were} asleep when the fight began, with nothing in hand.",
  }[state];
  if (!w) return null;
  const now = state !== "asleep" ? "" : asleepNow ? " {They} {is|are} still asleep." : woke != null ? ` {They} woke in round ${woke}: {they} {is|are} probably still prone and must Draw a weapon before using it.` : " {They} {has|have} since woken: {they} may still be prone and must Draw a weapon before using it.";
  return pro(w + now, forms);
}

/** The DC a sleeper's Perception check is against at the start of its turn (Unconscious: "Loud noise around you might wake you ... If creatures are
    attempting to stay quiet around you, this Perception check uses their Stealth DCs"). noisy: an attack, damage or a spell has happened in the fight;
    loudDC: the world setting for a fight's noise; quietDCs: the Stealth DCs of its foes in the fight. The lowest DC when there is more than one noise. */
export function noiseDC({ noisy = false, loudDC = 10, quietDCs = [] } = {}) {
  const quiet = quietDCs.filter(Number.isFinite);
  if (noisy) return { dc: Math.min(loudDC, ...quiet), why: "the noise of the fight" };
  if (quiet.length) return { dc: Math.min(...quiet), why: "its foes keeping quiet: their lowest Stealth DC" };
  return { dc: loudDC, why: "the noise of the fight" };
}

/** Sleeping in the sense of the waking rules: Unconscious with Hit Points left and not dying. */
export const asleepNow = actor => !!actor?.hasCondition?.("unconscious") && !actor.hasCondition?.("dying") && (actor.hitPoints?.value ?? 0) > 0;

/** Put its gear as its start says (needs PF2e): armed, its main weapon in hand and everything else it held back to worn; unarmed, everything it
    held back to worn. A weapon of the right kind already in hand is kept. role: the build row's, or null for one placed by hand. */
export async function readyGear(actor, state, role = null) {
  if (!actor?.items) return;
  const held = () => actor.items.filter(i => i.isOfType?.("physical") && i.system.equipped?.carryType === "held");
  const ws = (actor.itemTypes?.weapon ?? []).filter(w => w.system.equipped?.carryType !== "dropped");
  const firstStrike = (actor.system?.actions ?? []).map(a => a.item?.type === "weapon" ? a.item.id : a.item?.flags?.pf2e?.linkedWeapon ?? null).find(Boolean) ?? null;
  const pick = armedAt(state) ? mainWeapon(ws.map(w => ({ id: w.id, ranged: !!w.isRanged, twoHands: w.system.usage?.value === "held-in-two-hands" })), { role, firstStrike }) : null;
  const want = pick ? actor.items.get(pick.id) : null;
  /* a shield stays in the other hand of a one-handed melee weapon; a bow or a two-handed weapon needs both hands (review, 0.33.2) */
  const keep = it => it === want || (!!want && !pick.ranged && !pick.twoHands && !!it.isOfType?.("shield"));
  for (const it of held()) if (!keep(it)) await actor.changeCarryType(it, { carryType: "worn", handsHeld: 0 });
  if (want && want.system.equipped?.carryType !== "held") await actor.changeCarryType(want, { carryType: "held", handsHeld: pick.twoHands ? 2 : 1 });
}
