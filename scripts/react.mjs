/* Player reactions during a monster's turn (0.20.0): which reactions the module knows, which gate each one fits, where along a move the gates fall,
   and what a reaction that raises AC does to an attack already rolled. Pure: no Foundry globals, so the unit tests run it in Node. */
import { distanceBetween } from "./move.mjs";
import { IT, pro } from "./pronoun.mjs";

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
const PHYS = ["bludgeoning", "piercing", "slashing"], PHYSICAL = PHYS;
export const KNOWN = {
  "reactive-strike": { name: "Reactive Strike", gates: ["move", "stay", "manipulate", "ranged"], reach: true },
  "attack-of-opportunity": { name: "Reactive Strike", gates: ["move", "stay", "manipulate", "ranged"], reach: true },
  "shield-block": { name: "Shield Block", gates: ["hit"], target: true, needs: "raised", physical: true },
  "reactive-shield": { name: "Reactive Shield", gates: ["hit"], target: true, needs: "shield", melee: true },
  "nimble-dodge": { name: "Nimble Dodge", gates: ["attack"], target: true, ac: 2 },
  /* The party's own (0.27.0), each checked on Archives of Nethys 2026-11-11.
     Glimpse of Redemption (Player Core 2 pg. 93): an enemy damages your ally, and both are in your champion's aura; the enemy repents (the ally is
       unharmed) or refuses (the ally resists all of that damage by 2 + your level, then the enemy is enfeebled 2 until the end of its next turn).
     Interposing Earth (Rage of Elements pg. 95, a reaction spell): you are the target of a Strike or would attempt a Reflex save against a damaging
       area effect; standard cover against it, and if you are still damaged the barrier is destroyed and the damage is 2 less (8 from 4th rank). */
  "glimpse-of-redemption": { name: "Glimpse of Redemption", gates: ["harm"], ally: true, aura: "champions-aura" },
  "interposing-earth": { name: "Interposing Earth", gates: ["attack", "area"], target: true, ac: 2, cover: true, spell: true },
  /* Moment E, a monster casts a spell (0.36.0; the full reactions pass, release 2), each checked on Archives of Nethys 2026-11-16.
     Counterspell (Player Core pg. 186; the compendium also keeps the legacy sorcerer's "spontaneous" version): a creature casts a spell you have
       prepared (or in your repertoire, spontaneous) and you can see it; you lose that slot as if you had cast it, then counteract it.
     Recognize Spell (Player Core pg. 261, secret): a creature in your line of sight casts a spell you don't have prepared or in your repertoire;
       automatic success for a common spell up to rank 2/4/6/10 by your proficiency in its tradition's skill; untrained, no better than failure;
       a critical success gives +1 circumstance to your save or AC against it.
     Nullify (Impossible Magic pg. 155, spell 10): a foe within 120 feet casts a 9th-rank or lower spell; it is counteracted automatically and you
       lose 1d8 HP per rank of that spell.
     Shadow Siphon (Core Rulebook pg. 368, legacy only on Archives of Nethys): a spell deals damage, range 60 feet; counteract it with your rank
       treated as 2 higher; on a success the damage is halved.
     Mimic Spell (Rival Academies pg. 33, spell 8), Spell Riposte (Player Core 2 pg. 252, spell 7: you are the target; not an area) and Redirect
       Teleportation (Impossible Magic pg. 109, wizard 12: a creature teleports into a space within 60 feet) are the player's to make (Pause). */
  "counterspell-prepared": { name: "Counterspell", gates: ["cast"], sees: true, counter: "same", entries: "prepared" },
  "counterspell-spontaneous": { name: "Counterspell", gates: ["cast"], sees: true, counter: "same", entries: "spontaneous" },
  "recognize-spell": { name: "Recognize Spell", gates: ["cast"], sees: true, recognize: true },
  "nullify": { name: "Nullify", gates: ["cast"], spell: true, sees: true, range: 120, maxRank: 9, counter: "auto" },
  "shadow-siphon": { name: "Shadow Siphon", gates: ["cast"], spell: true, range: 60, damaging: true, counter: "siphon" },
  "mimic-spell": { name: "Mimic Spell", gates: ["cast"], spell: true, sees: true, range: 120, tradition: true, pause: true },
  "spell-riposte": { name: "Spell Riposte", gates: ["cast"], spell: true, target: true, pause: true },
  "redirect-teleportation": { name: "Redirect Teleportation", gates: ["cast"], sees: true, range: 60, teleport: true, pause: true },
  /* Moments A, B and C (0.37.0; the full reactions pass, release 3). Read from PF2e's compendium on 2026-11-16 (Rhea: "Compendium first"), the legacy
     ones and Whisper of Warning checked on Archives of Nethys the same day.
     A, before a monster's attack roll:
     Apparition Cloud (War of Immortals pg. 26, animist 12): you are targeted by an attack, your familiar adjacent or in your space; you are concealed
       from it (DC 5 flat check).
     Cloud Dragon's Cloak (Rage of Elements pg. 70, spell 3, 60 ft): you or an ally is targeted by a ranged attack; hidden for it (DC 11 flat check) and
       for all ranged attacks against it for 1 round.
     Curse of Recoil (Battlecry! pg. 85, spell 1, 120 ft): an enemy you can see is about to make a ranged attack; its Will save: success off-guard,
       failure also -1 status to the attack, critical failure -2 to its ranged attacks until its next turn; off-guard until the start of its next turn.
     Anchoring Air (Lost Omens High Seas, spell 4): a melee Strike against you; its Reflex save: success -2 circumstance to that attack, failure -2 to
       all its attacks until the end of its turn, critical failure also immobilized until the start of its next turn.
     Unexpected Transposition (Impossible Magic, spell 6: a Strike at you; swap places) and Body of Air (Rage of Elements, kineticist 14: an enemy you
       observe targets you with an attack; Vapor Form) are the player's (Pause).
     B, a hit, before damage:
     Whisper of Warning (War of Immortals pg. 26, animist 12, once per 10 minutes): you would be hit, not critically; the attacker rolls again, lower kept.
     Sacrifice Armor (Advanced Player's Guide pg. 120, champion 8, legacy): hit by a Strike with physical damage; the damage is less by twice the
       armor's level; the armor is broken (destroyed if it was already damaged).
     Hidebound (Howl of the Wild, spell 2, 60 ft): a creature is hit by a Strike with physical damage; resistance 5 physical (+3 per 2 ranks), except
       adamantine, until the start of its next turn.
     Rebounding Barrier (Legends pg. 37, spell 4, legacy): you are hit by a physical Strike; resistance 10 (+2 a rank) to one physical type it deals, and
       the attacker takes 5 (+1 a rank) of that type.
     Wooden Double (crit hit; Step, a block takes it), Drop Dead (120 ft), Champion's Sacrifice (devotion 6, 30 ft, an ally hit by a Strike) and Vanish
       Weapon (a melee weapon Strike at you that hits or misses, not critically) are the player's (Pause).
     C, damage about to be applied:
     Shield of Reckoning (Player Core 2, champion 10, once a round): an enemy's attack against an ally fits both Shield Block and your champion's
       reaction: you Shield Block for the ally and use your champion's reaction.
     Blazing Spirit (War of Immortals pg. 25, animist 6, once per 10 minutes): a creature damages you with a melee attack; resistance = your level,
       and it takes 1d6 fire and 1 persistent fire (2 at 12th, 3 at 18th).
     Calcifying Sand (Rage of Elements, kineticist 4, incapacitation): an unarmed or non-reach melee attack damages you; resistance = level to its
       physical damage; its Fortitude save against your class DC: failure slowed 1, critical failure petrified, until the end of its next turn; it can't
       set this off again for 1 hour.
     Consume Power (kineticist 6): acid, electricity, fire or sonic; resistance = level to one of them.
     Deflecting Wave (kineticist 1): acid, bludgeoning, fire or slashing from an enemy's effect, not off-guard to it; resistance = level (bludgeoning,
       slashing) or twice it (acid, fire), the highest once.
     Preemptive Reconfiguration (Ancestry Guide pg. 77, level 9, once a day, legacy): bludgeoning, piercing or slashing; resistance = level to that type.
     Eat Fire (Rage of Elements, cantrip): you would take fire damage; resistance 5 fire (+5 every 3 ranks) until the end of the turn.
     Scintillating Safeguard (Player Core 2, spell 6, 30 ft): physical or energy damage to you or creatures in range; up to 5 of them resist 10 (+1 a
       rank) one type of it.
     Blood Vendetta (Player Core pg. 318, spell 2, 30 ft): a creature deals piercing, slashing or bleed damage to you, and you can bleed; it takes 2d6
       persistent bleed (+2d6 per 2 ranks) by its Will save (none, half, full and weakness 1 to piercing and slashing, double).
     Warping Pull (spell 2, 30 ft: teleport, resistance 5 a 2 ranks), Volcanic Escape (kineticist 6: in your kinetic aura; Leap, and the enemy's basic
       Reflex), Pyrefowl Rebuke (spell 2: within 10 ft, a Strike; Fly, and its basic Reflex), Blinding Fury (spell 6) and Overselling Flourish (spell 1)
       are the player's (Pause); the damage and saves after Done are the module's. */
  "apparition-cloud": { name: "Apparition Cloud", gates: ["attack"], target: true, familiar: true, flat: 5 },
  "cloud-dragons-cloak": { name: "Cloud Dragon's Cloak", gates: ["attack"], spell: true, guard: 60, ranged: true, flat: 11 },
  "curse-of-recoil": { name: "Curse of Recoil", gates: ["ranged"], spell: true, sees: true, range: 120, save: "will" },
  "anchoring-air": { name: "Anchoring Air", gates: ["attack"], spell: true, target: true, melee: true, save: "reflex" },
  "unexpected-transposition": { name: "Unexpected Transposition", gates: ["attack"], spell: true, target: true, strike: true, pause: true, stops: true },
  "body-of-air": { name: "Body of Air", gates: ["attack"], target: true, sees: true, pause: true, stops: true },
  "whispers-of-warning": { name: "Whisper of Warning", gates: ["hit"], target: true, notCrit: true, freq: 600, reroll: true },
  "sacrifice-armor": { name: "Sacrifice Armor", gates: ["hit"], target: true, strike: true, physical: true, armor: true },
  "hidebound": { name: "Hidebound", gates: ["hit"], spell: true, guard: 60, strike: true, physical: true },
  "rebounding-barrier": { name: "Rebounding Barrier", gates: ["hit"], spell: true, target: true, strike: true, physical: true },
  "wooden-double": { name: "Wooden Double", gates: ["hit"], spell: true, target: true, critOnly: true, pause: true, stops: true },
  "drop-dead": { name: "Drop Dead", gates: ["hit"], spell: true, guard: 120, pause: true, stops: true },
  "champions-sacrifice": { name: "Champion's Sacrifice", gates: ["hit"], spell: true, guard: 30, other: true, strike: true, pause: true, stops: true },
  "vanish-weapon": { name: "Vanish Weapon", gates: ["hit"], spell: true, target: true, strike: true, melee: true, notCrit: true, pause: true, stops: true },
  "shield-of-reckoning": { name: "Shield of Reckoning", gates: ["harm"], ally: true, aura: "champions-aura", needs: "raised", physical: true, attack: true },
  "blazing-spirit": { name: "Blazing Spirit", gates: ["harm"], target: true, melee: true, attack: true, freq: 600 },
  "calcifying-sand": { name: "Calcifying Sand", gates: ["harm"], target: true, close: true, attack: true, perAttacker: 3600 },
  "consume-power": { name: "Consume Power", gates: ["harm"], target: true, dmg: ["acid", "electricity", "fire", "sonic"] },
  "deflecting-wave": { name: "Deflecting Wave", gates: ["harm"], target: true, dmg: ["acid", "bludgeoning", "fire", "slashing"], aware: true },
  "preemptive-reconfiguration": { name: "Preemptive Reconfiguration", gates: ["harm"], target: true, dmg: PHYS, freq: 86400 },
  "eat-fire": { name: "Eat Fire", gates: ["harm"], spell: true, target: true, dmg: ["fire"] },
  "scintillating-safeguard": { name: "Scintillating Safeguard", gates: ["harm"], spell: true, guard: 30 },
  "blood-vendetta": { name: "Blood Vendetta", gates: ["harm"], spell: true, target: true, dmg: ["piercing", "slashing", "bleed"], range: 30, bleeds: true },
  "warping-pull": { name: "Warping Pull", gates: ["harm"], spell: true, guard: 30, other: true, pause: true },
  "volcanic-escape": { name: "Volcanic Escape", gates: ["harm"], target: true, aura: "kinetic-aura", own: true, pause: true },
  "pyrefowl-rebuke": { name: "Pyrefowl Rebuke", gates: ["harm"], spell: true, target: true, strike: true, range: 10, pause: true },
  "blinding-fury": { name: "Blinding Fury", gates: ["harm"], spell: true, target: true, range: 60, pause: true },
  "overselling-flourish": { name: "Overselling Flourish", gates: ["harm"], spell: true, target: true, range: 60, pause: true },
  /* Moments D and F (0.38.0; the full reactions pass, release 4). Read from PF2e's compendium in PF2 Test on 2026-11-17 (Rhea: "Compendium first").
     D, someone would drop to 0 or die (asked in the damage moment's question, when the hit as rolled could take them to 0 HP):
     Martyr's Intervention (Knights of Lastwall, spell 3, divine, occult, primal, 60 ft, a living creature; requirement: you aren't wounded): it is
       reduced to 1 HP instead of 0, all the damage it was spared is dealt to you, and you both become wounded 1 (or 1 more).
     Breath of Life (Player Core, spell 5, divine, 60 ft): a living creature would die (not by a death effect or one that leaves no remains); it
       doesn't die and regains 5d8 HP (+1d8 per 2 ranks).
     Love's Sacrifice (Rival Academies, spell 7: you would drop to 0; a creature near you takes half or all of it) and Word of Revision (Kingmaker,
       spell 6, rare, 60 ft: reduced to 0, it stays at 1; or a failed save, see F) are the player's (Pause), and the turn stops for her ruling.
     F, a save against a monster's effect, before the roll (asked before the spell is cast, in the cast moment's question):
     Divine Grace (Player Core 2, champion 2): a save against a spell; +2 circumstance to it.
     Inspiring Resilience (Knights of Lastwall, champion 4, uncommon): you and at least one other creature are targeted by an emotion, fear or mental
       effect with a save; allies within 30 ft get +1 circumstance to their Will save against it (+2 against an undead's).
     Skeptic's Defense (Dark Archive, skill 7, once a day): targeted by or in the area of a mental spell or effect; counteract it with Intimidation,
       rank half your level rounded up; success: you ignore it, and its source (Intelligence -3 or higher) is stupefied 1 for 1 round.
     Elemental Counter (Rage of Elements, cantrip 1, arcane, primal): you or a creature within 60 ft saves against a spell with the earth, fire, metal,
       plant, water or wood trait, and you have a slot of its countering element; you lose that slot and counteract the spell with its rank.
     Prophet's Luck (Season of Ghosts, spell 4, rare, 60 ft): a save against an obvious threat; predict success or failure: +1 or -1 status to it
       (2 at 6th, 3 at 9th); right, you get +1 status to saves for 10 minutes, wrong, the target -1.
     F, after the result:
     Know Oneself (Character Guide, human 1, once a day, fortune): a critical failure against an emotion effect becomes a failure.
     Schadenfreude (Player Core 2, spell 1, 30 ft): you critically fail a save against a foe's effect; its Will save: success -1 status to
       Perception and Will saves for 1 round, failure stupefied 1 for 1 round, critical failure stupefied 2 for 1 round and stunned 1.
     Keep Up Appearances (Character Guide, human 1: you are affected by an emotion effect; Deception against observers) is the player's (Pause);
       Champion's Sacrifice (an ally fails a save against an effect that doesn't affect you) and Word of Revision (a failed save) stop the turn.
     Counter Element (kineticist 6) is not built: its prerequisite is exactly one kinetic element (Archives of Nethys, Rage of Elements pg. 22). */
  "martyrs-intervention": { name: "Martyr's Intervention", gates: ["harm"], spell: true, guard: 60, other: true, drop: true, living: true, notWounded: true, deferCast: true },
  "breath-of-life": { name: "Breath of Life", gates: ["harm"], spell: true, guard: 60, dies: true, living: true, deferCast: true },
  "loves-sacrifice": { name: "Love's Sacrifice", gates: ["harm"], spell: true, target: true, drop: true, pause: true, stops: true },
  "word-of-revision": { name: "Word of Revision", gates: ["harm", "saved"], spell: true, guard: 60, drop: true, failed: true, pause: true, stops: true },
  "divine-grace": { name: "Divine Grace", gates: ["save"], target: true, spellOnly: true, saveBonus: 2 },
  "inspiring-resilience": { name: "Inspiring Resilience", gates: ["save"], target: true, traitsAny: ["emotion", "fear", "mental"], others: true, will: true },
  "skeptics-defense": { name: "Skeptic's Defense", gates: ["save"], target: true, traitsAny: ["mental"], freq: 86400, skeptic: true },
  "elemental-counter": { name: "Elemental Counter", gates: ["save"], spell: true, guard: 60, spellOnly: true, element: true },
  "prophets-luck": { name: "Prophet's Luck", gates: ["save"], spell: true, guard: 60, prophet: true },
  "keep-up-appearances": { name: "Keep Up Appearances", gates: ["saved"], target: true, traitsAny: ["emotion"], affected: true, pause: true },
  "know-oneself": { name: "Know Oneself", gates: ["saved"], target: true, traitsAny: ["emotion"], critFail: true, freq: 86400 },
  "schadenfreude": { name: "Schadenfreude", gates: ["saved"], spell: true, target: true, critFail: true, foeSave: "will" }
};
/* Champion's Sacrifice answers a failed save too (Player Core 2: "an ally fails a saving throw against an effect that doesn't affect you"). */
KNOWN["champions-sacrifice"].gates.push("saved"); KNOWN["champions-sacrifice"].failed = true;
/** Reactions the player makes with the usual tools after React, then presses Done (Reactive Strike's roll, and the "Pause" rows of the pass). */
export const makesItself = slug => !!(KNOWN[slug]?.reach || KNOWN[slug]?.pause);
/** The rows that are asked before an attack and raise AC against it (circumstance bonuses, so only the best counts). */
export const AC_ROWS = Object.keys(KNOWN).filter(k => KNOWN[k].ac);

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
    const row = KNOWN[it.slug], key = row ? row.name : it.slug ?? it.name; if (seen.has(key)) continue;
    if (row && !!row.spell !== !!it.spell) continue;   /* a spell's row is only for the spell, a feat's only for the feat */
    seen.add(key);
    out.push(row ? { slug: it.slug, name: row.name, known: true, ...(it.spell ? { spell: it.spell } : {}) } : { slug: it.slug ?? null, name: it.name, known: false, trigger: triggerOf(it.description) });
  }
  return out;
}
/** Does a known reaction fit this gate? who: what the glue read of the reactor ({ inReach, isTarget, shieldRaised, hasShield }); what: the action
    ({ melee, damageTypes }). Unknown reactions never fit: they are shown to the GM, never asked (Rhea, 2026-11-09: prompted only when they have the right one). */
export function fits(slug, gate, who = {}, what = {}) {
  const row = KNOWN[slug]; if (!row || !row.gates.includes(gate)) return false;
  if (row.reach && !who.inReach) return false;
  if (row.target && !who.isTarget) return false;
  if (row.ally && (!who.isAlly || who.isTarget || !who.inAura)) return false;   /* an ally, never itself, and the aura rule holds (Rhea, PR-8) */
  if (row.spell && !who.canCast) return false;
  if (row.needs === "raised" && !who.shieldRaised) return false;
  if (row.needs === "shield" && (!who.hasShield || who.shieldRaised)) return false;   /* already raised: nothing to gain */
  if (row.melee && !what.melee) return false;
  if (row.physical && (what.damageTypes?.length ? !what.damageTypes.some(t => PHYSICAL.includes(t)) : false)) return false;   /* unknown types: offer it */
  /* a monster casting (0.36.0): who: { hasSame (a copy it can spend), knowsIt, dist (ft to the caster), tradition, spellRank }; what: the cast
     { rank, tradition, damaging, teleport } */
  if (row.counter === "same" && !who.hasSame) return false;
  if (row.recognize && who.knowsIt) return false;
  if (row.range && !(Number(who.dist) <= row.range)) return false;
  if (row.maxRank && !(Number(what.rank) <= row.maxRank)) return false;
  if (row.damaging && !what.damaging) return false;
  if (row.teleport && !what.teleport) return false;
  if (row.tradition && (!what.tradition || what.tradition !== who.tradition || !(Number(what.rank) <= Number(who.spellRank)))) return false;
  /* Moments A to C (0.37.0): who adds { distTarget (ft from the reactor to the creature attacked), isAllyOfTarget, familiarNear, offGuard, canBleed,
     freqOk, inAura }; what adds { ranged, strike, degree (the hit's), close (unarmed or a non-reach melee weapon), attack (the harm came from an attack) } */
  if (row.guard && !(who.isTarget ? !row.other : who.isAllyOfTarget && Number(who.distTarget) <= row.guard)) return false;   /* you, or an ally within range */
  if (row.ranged && !what.ranged) return false;
  if (row.strike && what.strike === false) return false;
  if (row.attack && what.attack === false) return false;
  if (row.notCrit && what.degree !== 2) return false;
  if (row.critOnly && what.degree !== 3) return false;
  if (row.close && !what.close) return false;
  if (row.dmg && what.damageTypes?.length && !what.damageTypes.some(t => row.dmg.includes(t))) return false;   /* unknown types: offer it */
  if (row.familiar && !who.familiarNear) return false;
  if (row.aware && who.offGuard) return false;
  if (row.bleeds && who.canBleed === false) return false;
  if ((row.freq || row.perAttacker) && who.freqOk === false) return false;   /* review 4 (0.37.0): Calcifying Sand's hour per attacker */
  if (row.own && !who.inAura) return false;   /* in your own aura (Volcanic Escape: your kinetic aura) */
  /* Moments D and F (0.38.0): what adds { drops (the hit as rolled could take the creature to 0 HP), dies (and that would kill it), death (a death
     effect), isSpell, traits, savers (how many will save), degree (the save's, at "saved") }; who adds { targetLiving, wounded, alsoSaves, elementSlot } */
  if (row.drop && gate === "harm" && !what.drops) return false;
  if (row.dies && (!what.dies || what.death)) return false;
  if (row.living && who.targetLiving === false) return false;
  if (row.notWounded && who.wounded) return false;
  if (row.failed && gate === "saved" && !(Number(what.degree) <= 1)) return false;
  if (gate === "saved" && row.other && who.alsoSaves) return false;   /* Champion's Sacrifice: an effect that doesn't affect you */
  if (row.spellOnly && !what.isSpell) return false;
  if (row.traitsAny && !(what.traits ?? []).some(t => row.traitsAny.includes(t))) return false;
  if (row.others && !(Number(what.savers) > 1)) return false;
  if (row.will && what.saveStat && what.saveStat !== "will") return false;   /* its bonus is to the Will save (review 9) */
  if (row.element && !who.elementSlot) return false;
  if (row.critFail && what.degree !== 0) return false;
  if (row.affected && !(Number(what.degree) <= 2)) return false;
  return true;
}
/* ---------- Moments D and F (0.38.0) ---------- */
/** Would this damage take the creature to 0 HP? hp, temp (and stamina): what it has now; hit: the damage (as rolled at the question, PF2e's own
    figure once applied). Only a creature that is up can drop. */
export const dropsFrom = ({ hp = 0, temp = 0, sp = 0, hit = 0 } = {}) => Number(hp) > 0 && Number(hit) >= Number(hp) + Number(temp) + Number(sp);
/** Would this damage kill it (Breath of Life's "would die")? An NPC dies at 0 HP; a character dies of massive damage (twice its maximum HP) or when
    the dying value it is knocked out with (1, 2 on a critical, plus its wounded value) reaches its dying maximum (4 less doomed). Player Core pg. 411. */
export function diesFrom({ character = true, hp = 0, temp = 0, sp = 0, max = 0, spMax = 0, hit = 0, wounded = 0, dyingMax = 4, crit = false } = {}) {
  if (!dropsFrom({ hp, temp, sp, hit })) return false;
  if (!character) return true;
  if (Number(max) > 0 && Number(hit) >= 2 * (Number(max) + Number(spMax))) return true;
  return 1 + (crit ? 1 : 0) + (Number(wounded) || 0) >= (Number(dyingMax) || 4);
}
/** Martyr's Intervention: the creature stays at 1 HP and the caster takes what it was spared. before: its HP and temporary HP before the damage;
    dealt: the full damage (PF2e's figure). */
export const martyrShare = (before = 0, dealt = 0) => Math.max(0, (Number(dealt) || 0) - Math.max(0, (Number(before) || 0) - 1));
/** Breath of Life's healing: 5d8, 1d8 more per 2 ranks above 5th. */
export const breathDice = rank => `${5 + Math.floor((rnk(rank) - 5) / 2)}d8`;
/** Prophet's Luck's bonus or penalty: 1, 2 from 6th rank, 3 from 9th. */
export const prophetBy = rank => rnk(rank) >= 9 ? 3 : rnk(rank) >= 6 ? 2 : 1;
/** Was the prophecy right? predict: "success" (a success or a critical success) or "failure"; degree: the save's. */
export const prophetRight = (predict, degree) => (predict === "success") === (Number(degree) >= 2);
/** Elemental Counter: the elements that counter a spell of each element (Rage of Elements: wood or plant counter earth, earth water, water fire,
    fire metal, metal wood or plant). */
export const ELEMENT_COUNTERS = { earth: ["plant", "wood"], water: ["earth"], fire: ["water"], metal: ["fire"], plant: ["metal"], wood: ["metal"] };
export const counteringElements = (traits = []) => [...new Set((traits ?? []).flatMap(t => ELEMENT_COUNTERS[t] ?? []))];
/** Skeptic's Defense's counteract rank: half the character's level, rounded up. */
export const skepticRank = level => Math.max(1, Math.ceil(lvl(level) / 2));
/** Know Oneself: a critical failure becomes a failure. */
export const knowOneself = degree => degree === 0 ? 1 : degree;
/** Schadenfreude by the foe's Will save: what it gets for 1 round, or null. */
export const schadenBy = degree => degree === 3 ? null : degree === 2 ? { penalty: true } : degree === 1 ? { stupefied: 1 } : { stupefied: 2, stunned: 1 };
/** What a row of Moments D and F would do, for its button (numbers worked out when it is asked). */
export function rx4Detail(x = {}) {
  const row = KNOWN[x.slug] ?? {};
  if (row.pause) return "then make it yourself; the turn waits for the GM";
  switch (x.slug) {
    case "martyrs-intervention": return `${x.ally ? `${x.ally} stays` : "they stay"} at 1 HP; you take the rest of the damage, and you both become wounded (cast only if it is needed)`;
    case "breath-of-life": return `${x.ally ? `${x.ally} doesn't die and regains` : "you don't die and regain"} ${breathDice(x.rank)} HP (cast only if it is needed)`;
    case "divine-grace": return "+2 circumstance to your save against this spell";
    case "inspiring-resilience": return `allies within 30 feet get +${x.undead ? 2 : 1} circumstance to their Will save against it`;
    case "skeptics-defense": return `counteract it: Intimidation +${x.mod ?? 0} against DC ${x.dc ?? "?"}, rank ${x.myRank ?? 1}; on a success you ignore it`;
    case "elemental-counter": return `spend your ${x.slotName ?? "spell"} (rank ${x.myRank ?? 1}) to counteract it: +${x.mod ?? 0} against DC ${x.dc ?? "?"}`;
    case "prophets-luck": return `${x.predict === "failure" ? `-${prophetBy(x.rank)}` : `+${prophetBy(x.rank)}`} status to ${x.ally ?? "the"} save; right: +1 status to your saves for 10 minutes, wrong: -1 to theirs`;
    case "know-oneself": return "your critical failure becomes a failure";
    case "schadenfreude": return `its Will save against your spell DC${x.dc ? ` ${x.dc}` : ""} (stupefied, or worse)`;
    default: return "";
  }
}
/** The sentence for one of these. who: the monster as the reactor may see it; ally: the creature it is about, when it isn't the reactor; gate: harm, save or saved. */
export function rx4Words(x = {}, who = "A creature", ally = null, gate = "harm", kind = "") {
  const what = gate === "harm" ? `${who} is about to ${x.slug === "breath-of-life" ? "kill" : "drop"} ${ally ?? "you"}`
    : gate === "save" ? `${who}'s ${kind || "spell"} calls for ${ally ? `${ally}'s` : "your"} save`
    : `${ally ?? "You"} ${x.degree === 0 ? "critically failed" : "failed"} ${ally ? "the" : "your"} save against ${who}'s ${kind || "effect"}`;
  return `${what}. React with ${x.reaction ?? KNOWN[x.slug]?.name}?`;
}
/** The window a row of the damage moment is asked in (0.37.1, seen live 2026-11-17: a character's Blazing Spirit and Deflecting Wave opened as two
    windows stacked on the same spot, the lower one hidden). A reaction that protects someone else (a champion picking which ally, Warping Pull) and
    Scintillating Safeguard's one row when it is for an ally keep a group of their own, so their window lists the allies; a reactor's own rows get
    none, so they share the character's one window (one window per character and moment, 0.36.0). x: the row ({ id, slug, token }); targetId: the creature the damage is for. */
export const harmGroup = (x, targetId) => x.token !== targetId ? x.id : null;
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
/** The circumstance cover bonus PF2e already put in an attack's DC, from the attack card's roll options (`target:cover-bonus:<n>`; 0.29.1, bug B-3).
    Visioner's cover is a modifier predicated on the attacker, so it reads as disabled on the target's AC outside the roll: without this a reaction's
    +2 was added on top of a cover bonus the DC already held, though circumstance bonuses don't stack. options: the card's `context.options`. */
export function coverInDc(options = []) {
  let best = 0;
  for (const o of Array.isArray(options) ? options : []) { const m = /^target:cover-bonus:(\d+)$/.exec(String(o)); if (m) best = Math.max(best, Number(m[1])); }
  return best;
}
/** What a reaction that raises AC adds to a DC: only what it beats of the circumstance bonus already counted (circumstance bonuses don't stack).
    bonus: the reaction's; had: the best circumstance bonus already in the DC. */
export const acAdds = (bonus, had) => Math.max(0, (Number(bonus) || 0) - Math.max(0, Number(had) || 0));
/** What the reactor is told, in a sentence. who: the mover as the reactor may see it ("The Sod Hound" or "A creature"); kind: the monster's action. */
export function gateWords(gate, who, { kind = "", reaction = "" } = {}) {
  const W = { move: `${who} is moving out of a square in your reach`, stay: `${who} ${kind || "uses a move action"} in your reach`, manipulate: `${who} uses a manipulate action in your reach${kind ? ` (${kind})` : ""}`,
    ranged: `${who} makes a ranged attack in your reach`, attack: `${who} attacks you`, hit: `${who}'s ${kind || "Strike"} hits you`,
    harm: `${who} is about to damage ${kind || "your ally"}, and both are in your champion's aura`, area: `${who}'s ${kind || "spell"} is about to catch you in its area`,
    cast: `${who} is casting ${kind || "a spell"}`, save: `${who}'s ${kind || "spell"} calls for a save`, saved: `A save against ${who}'s ${kind || "spell"} went badly` };
  return `${W[gate] ?? who}. React with ${reaction}?`;
}
/** What a reaction asked on the card or the prompt resolved to, from the answers: "react" (and the reactor finished: "done"), "pass", "timeout",
    "continue" (the GM went on). A list is finished when no one is left to answer. */
export function finished(list = []) { return list.every(x => ["done", "pass", "timeout", "continue"].includes(x.answer)); }
/** The rows another answer settles (0.27.0): a creature has one reaction, so once one of its rows is being used its other rows that spend the reaction
    are skipped. rows: [{ id, token, free }]; answers: { id: answer }. Returns the ids to skip. */
export function spentRows(rows = [], answers = {}) {
  const using = new Set(rows.filter(x => !x.free && ["react", "done"].includes(answers[x.id])).map(x => x.token));
  return rows.filter(x => !x.free && using.has(x.token) && !answers[x.id]).map(x => x.id);
}
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
    posted a Step card just before; strode: a Stride card just before; difficult: a square it entered is difficult terrain; landSpeed: its land Speed
    in feet (null when unknown); keyboard: moved by the movement keys; script: moved by a script or another module. Returns null (no trigger) or { gate: "move", sure, kind, why } (and `steps`: how many Steps it could have been).
    Rhea, 2026-11-15 (q-33): "a step is 5ft anf a stride is anything more then 5ft. Can't you use that as your guide?": one walked square on its own
    turn is a Step, unless a Step can't go there (difficult terrain, a Speed other than land, a land Speed under 10: Player Core pg. 418, checked on
    Archives of Nethys 2026-11-15) or a Stride card says otherwise. And "they couild go 2 or 3 steps in a row": one walk of 10 or 15 ft could be
    Steps or a Stride, so the player is asked (`steps`), never the module guessing. */
export function moveTrigger({ action = "walk", squares = 0, ownTurn = true, stepped = false, strode = false, difficult = false, landSpeed = null, keyboard = false, script = false } = {}) {
  if (!(squares > 0) || TELEPORTS.includes(action)) return null;
  if (squares === 1 && action === "walk" && stepped) return null;
  if (!MOVE_ACTIONS.includes(action)) return { gate: "move", sure: false, kind: "moved", why: `Its move was made as "${action}", which may not be a move action.` };
  if (!ownTurn) return { gate: "move", sure: false, kind: "moved", why: "It moved outside its own turn: being pushed or pulled doesn't trigger this." };
  const canStep = action === "walk" && !strode && !difficult && !(landSpeed != null && landSpeed < 10);
  /* the movement keys move one square a press, so a Stride by keys is a row of one-square moves: those stay the GM's to judge, as before q-33 */
  if (canStep && squares <= 3 && script) return { gate: "move", sure: false, kind: `moved ${squares * 5} feet`, why: "It was moved by a script or another module, which may not be its own move action." };   /* never the player's to answer for */
  if (canStep && squares === 1 && keyboard) return { gate: "move", sure: false, kind: "moved one square", why: "It moved one square with the movement keys: a Step doesn't trigger this, a Stride does." };
  if (canStep && squares === 1) return null;   /* a Step */
  if (canStep && squares <= 3) return { gate: "move", sure: false, kind: `moved ${squares * 5} feet`, steps: squares, why: `It moved ${squares * 5} feet: ${STEPS_WORDS[squares]} Steps don't trigger this, a Stride does.` };
  const kind = action !== "walk" || squares > 3 ? "left a square" : strode ? "strode" : difficult ? "strode into difficult terrain (a Step can't go there)" : landSpeed != null && landSpeed < 10 ? "strode (with a Speed under 10 feet it can't Step)" : "left a square";
  return { gate: "move", sure: true, kind };
}
export const STEPS_WORDS = { 2: "two", 3: "three" };
/* Action cards whose movement shows as a token move (the move tells; the card would only ask twice), and the two move actions that leave no square. */
const MOVERS = ["stride", "crawl", "leap", "fly", "swim", "climb", "burrow", "sneak", "tumble-through", "long-jump", "high-jump", "balance", "mount", "travel"];
const STAYS = { stand: "stood up", "drop-prone": "dropped prone" };
/* Consumables whose activation is an Interact (manipulate) by their own rules: drinking, applying, injecting. Others vary (a talisman is usually free). */
const HAND_CONSUMABLES = ["potion", "elixir", "oil", "mutagen", "drug"];
/** What a chat card says of its action, from its HTML (flavor and content) and roll options. PF2e's own action cards (Interact, Stand, Step) carry no
    flags: the title is in `<h4 class="action"><strong>`, the traits in `class="tag" data-slug`. A check rolled for an action names it in the option
    `action:<slug>`; an item's card names its traits and slug in `item:trait:<x>` and `item:slug:<x>` (with or without `origin:`). itemCard: an item
    shown in chat, not used. Returns { traits, title, slug, itemCard }. */
export function readCard(html = "", options = [], traits = []) {
  const h = String(html), out = new Set(traits.filter(Boolean));
  for (const x of options) { const m = /(?:^|:)item:trait:([a-z0-9-]+)$/.exec(x); if (m) out.add(m[1]); }
  for (const m of h.matchAll(/<[^>]*class="tag[^"]*"[^>]*>/g)) { const s = /data-slug="([a-z0-9-]+)"/.exec(m[0]); if (s) out.add(s[1]); }
  for (const m of h.matchAll(/<[^>]*data-slug="([a-z0-9-]+)"[^>]*class="tag[^"]*"[^>]*>/g)) out.add(m[1]);
  const title = /<h4 class="action">\s*<strong>([^<]+)<\/strong>/.exec(h)?.[1]?.trim() ?? null;
  const slug = options.map(x => /^action:([a-z0-9-]+)$/.exec(x)?.[1] ?? /(?:^|:)item:slug:([a-z0-9-]+)$/.exec(x)?.[1]).find(Boolean) ?? (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : null);
  return { traits: [...out], title, slug, itemCard: /class="[^"]*\bitem-card\b/.test(h) };
}
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
  if (card.slug === "stride") return { stride: true };   /* the move itself is the trigger; the card says it wasn't Steps (q-33) */
  if (card.slug === "release") return null;   /* Release has the manipulate trait and triggers nothing (Player Core pg. 417) */
  if (traits.includes("manipulate")) return { gate: "manipulate", sure: true, kind: `used ${name} (manipulate)` };
  if (traits.includes("move")) { if (card.slug in STAYS) return { gate: "stay", sure: true, kind: STAYS[card.slug] };
    return MOVERS.includes(card.slug) ? null : { gate: "stay", sure: true, kind: `used ${name} (a move action)` }; }
  return null;
}
/** An item changing hands with no card (PF2e posts none for drawing, stowing or picking up). before/after: { carry, hands }. Letting go (dropped, or
    fewer hands on something still held) is a Release and triggers nothing. Something coming into a hand on its own turn (drawn, picked up, a second
    hand on the grip) is an Interact, sure (Rhea, 2026-11-15, q-33: "Yes, all by rule"); anything else (put away, or outside its turn) is an
    Interact only if it was done as an action at all: never sure. */
export function equipTrigger(before = {}, after = {}, name = "an item", ownTurn = false) {
  const b = { carry: before.carry ?? "worn", hands: before.hands ?? 0 }, a = { carry: after.carry ?? b.carry, hands: after.hands ?? b.hands };
  if (a.carry === b.carry && a.hands === b.hands) return null;
  if (a.carry === "dropped" || (a.carry === "held" && b.carry === "held" && a.hands < b.hands)) return null;
  const did = a.carry === "held" && b.carry !== "held" ? "drew or picked up" : b.carry === "held" && a.carry !== "held" ? "put away" : a.carry === "held" ? "changed its grip on" : "moved";
  if (ownTurn && a.carry === "held" && (b.carry !== "held" || a.hands > b.hands)) return { gate: "manipulate", sure: true, kind: `${did} ${name} (an Interact)` };
  return { gate: "manipulate", sure: false, kind: `${did} ${name}`, why: `It ${did} ${name} with no action card: that is an Interact (manipulate) if it was done as an action.` };
}
/** Prone coming off with no Stand card: on its own turn that is a Stand, a move action (Rhea, 2026-11-15, q-33). Outside its turn it is no trigger
    (the condition was taken off, nothing was done). */
export function proneOffTrigger({ ownTurn = true, stood = false } = {}) {
  return ownTurn && !stood ? { gate: "stay", sure: true, kind: "stood up (Prone came off on its own turn)" } : null;
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

/** The player's question when one walk of 10 or 15 ft left a monster's reach (Rhea, 2026-11-15, q-33: "Ask the player"). n: squares (2 or 3);
    monsters: their names as this player sees them. Returns { title, lines, steps, stride } (the two buttons). */
export function stepsQuestion(n = 2, monsters = []) {
  const counts = new Map(); for (const m of monsters) { const k = /^a creature$/i.test(m) ? "a creature" : m; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const NUM = { 2: "two", 3: "three", 4: "four" }, parts = [...counts].map(([k, c]) => c === 1 ? k : k === "a creature" ? `${NUM[c] ?? c} creatures` : `${NUM[c] ?? c} ${k}s`);
  const ft = n * 5, list = parts.length ? (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`) : "a creature";
  const lead = list.charAt(0).toUpperCase() + list.slice(1);
  return { title: "Your move", lines: [`You moved ${ft} feet, out of the reach of ${list}.`, `${lead} can react to a Stride, but not to a Step.`, `Was that ${STEPS_WORDS[n] ?? n} Steps, or a Stride?`],
    steps: `${(STEPS_WORDS[n] ?? String(n)).replace(/^./, c => c.toUpperCase())} Steps`, stride: "Stride" };
}
/** What the player's answer did, for the card's note and the history. answer: "steps" | "stride" | "timeout"; who: the mover's name; user: the
    player's name; n: squares. */
export function stepsAnswerWords(answer, who = "It", user = "the player", n = 2) {
  const steps = STEPS_WORDS[n] ?? n;
  return answer === "steps" ? `No reaction: ${who} took ${steps} Steps, ${steps} of ${who}'s actions (${user} said so).` : answer === "stride" ? `strode ${n * 5} feet (${user} said so)`
    : `${user} didn't answer whether it was ${steps} Steps or a Stride.`;
}

/* ---------- the party's reactions (0.27.0) ----------
   Rhea, 2026-11-11 (docs/features/reactions.md): each character's reaction is tracked like a focus point that comes back at the start of its turn; a
   character whose reaction is used, who is Delaying, or who is a minion is never asked; every reduction says why. */
/** Who has a reaction box and is asked: a character, or an ordinary NPC fighting on the party's side; never a minion (summons, companions and
    familiars can't use reactions, Player Core pg. 416, checked on Archives of Nethys 2026-11-11). a: { type, traits } */
export const canReact = (a = {}) => ["character", "npc"].includes(a.type) && !(a.traits ?? []).includes("minion");
/** Does a held shield let its bearer Shield Block without the feat? The impulse's own shield says so in its text, and the module reads what the
    character can do, not only a feat with that slug (Rhea, 2026-11-11). shield: { slug, text } (its description as plain text). */
export const shieldGrantsBlock = (shield = {}) => shield.slug === "metal-carapace-shield" || /shield block\W{0,3}with this shield even if you don.t have/i.test(String(shield.text ?? ""));
/** Glimpse of Redemption, refused: resistance to all of the triggering damage, 2 + the champion's level. */
export const glimpseResistance = level => 2 + Math.max(0, Math.round(Number(level) || 0));
/** Interposing Earth: how much comes off the damage when the barrier is destroyed (8 from 4th rank). */
export const earthLess = rank => (Number(rank) || 1) >= 4 ? 8 : 2;
/* ---------- Interposing Earth's barrier on the map (0.35.0; Rhea, 2026-11-16, q-36: "Wall plus picture") ---------- */
/** The barrier's numbers by the rank it was cast at (Rage of Elements pg. 95, checked on Archives of Nethys 2026-11-16: AC 5, Hardness 2, 5 HP;
    heightened 4th: Hardness 8, 20 HP). It lasts 3 rounds: one comes off at the start of each of the caster's turns (a spell's duration in rounds). */
export const barrierStats = rank => (Number(rank) || 1) >= 4 ? { ac: 5, hardness: 8, hp: 20, rounds: 3 } : { ac: 5, hardness: 2, hp: 5, rounds: 3 };
/** Where the barrier stands: on the border between the caster's space and the square next to it toward the source ("between you and the source of
    the triggering effect"), one square long (5 ft). caster: { pos: [x, y], span }; src: the source's centre in squares { x, y }. Returns { side
    (east, west, north or south of the caster), a, b (the edge's two grid points, in squares), near (the caster's square at that edge), far (the
    square across it, the source's side) }. The side is the axis the source is furthest along (east or west on a tie); along the edge, the row or
    column of the caster's space nearest the source. */
export function barrierEdge(caster = {}, src = {}) {
  const n = Math.max(1, Number(caster.span) || 1), [px, py] = caster.pos ?? [0, 0], cx = px + n / 2, cy = py + n / 2;
  const dx = (Number(src.x) || 0) - cx, dy = (Number(src.y) || 0) - cy, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (Math.abs(dx) >= Math.abs(dy)) {
    const row = clamp(Math.floor(Number(src.y) || 0), py, py + n - 1), east = dx >= 0, x = east ? px + n : px;
    return { side: east ? "east" : "west", a: [x, row], b: [x, row + 1], near: [east ? x - 1 : x, row], far: [east ? x : x - 1, row] };
  }
  const col = clamp(Math.floor(Number(src.x) || 0), px, px + n - 1), south = dy > 0, y = south ? py + n : py;
  return { side: south ? "south" : "north", a: [col, y], b: [col + 1, y], near: [col, south ? y - 1 : y], far: [col, south ? y : y - 1] };
}
/** The words on the slab's picture, for everyone. */
export const barrierLabel = b => `Earth barrier ${Math.max(0, b.hp)}/${b.max} HP · ${b.left} round${b.left === 1 ? "" : "s"}`;
/** The GM's line for a barrier that stands (pronoun markers: the caster's). */
export const barrierCardWords = (name, b) => `${name}'s earth barrier stands on the edge ${b.side} of {them}: a wall no one can pass, cover behind it, AC ${b.ac}, Hardness ${b.hardness}, ${b.hp} HP, ${b.left} round${b.left === 1 ? "" : "s"} left (one comes off at the start of each of {their} turns).`;
/** What a blow at the barrier takes off its HP: the damage less its Hardness (an object's Hardness, Player Core). */
export const slabHit = (rolled, hardness = 2) => Math.max(0, Math.floor(Number(rolled) || 0) - (Number(hardness) || 0));
/** The line for everyone after a monster's Strike at a barrier. who: the monster as players may name it. */
export function slabWords({ who = "A creature", outcome = "miss", rolled = 0, dealt = 0, hardness = 2, hp = 0, max = 5, gone = false } = {}) {
  const hit = ["hit", "critical hit"].includes(outcome);
  return `${who} struck the earth barrier: ${outcome}${hit ? `, ${rolled} damage, ${dealt} after its Hardness ${hardness}` : ""}. ${gone ? "It was already gone." : hp > 0 ? `It stands at ${hp}/${max} HP.` : "It crumbles."}`;
}

/* ---------- Ready (0.35.0; Rhea, 2026-11-16, q-37: the Now! button) ---------- */
/** While someone has an action readied, each monster step waits this long before it goes on, so the player can press Now! (sample 4). */
export const READY_WAIT_MS = 3000;
/** The trigger as the player typed it on the chip: one line, short. */
export const cleanTrigger = text => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
/** The amber line on the monster's card while someone is readied. */
export const readyWords = (name, trigger) => `${name} has an action readied${trigger ? `: "${trigger}"` : ""}. Each step waits ${READY_WAIT_MS / 1000} s before it goes on, so ${name}'s player can press Now!`;
/** The line once Now! was pressed: the turn waits for the readied action. */
export const readiedWords = (name, moved = false) => `${name}'s readied action: the turn waits${moved ? " (the monster stopped in the square it was entering)" : ""}. ${name}'s player makes it, then Done.`;
/** The lowest rank a reaction spell can be cast at now. slots: [{ rank, left }]; base: the spell's own rank. Null when none is left. */
export function castRank(base = 1, slots = []) {
  return slots.filter(s => s.rank >= base && s.left > 0).sort((a, b) => a.rank - b.rank)[0]?.rank ?? null;
}
/** How long "until the end of its next turn" is as a PF2e effect that expires at a turn's end, counted from the monster's own initiative: 0 rounds
    when its turn this round is still to come (that turn is its next), 1 when its turn is under way or already over this round. */
export const untilNextTurnEnds = ({ ownTurn = false, acted = false } = {}) => ownTurn || acted ? 1 : 0;
/** What the refused enemy gets, in plain words for the champion's player (Rhea, 2026-11-11: so she never has to look it up; Player Core pp. 443 and
    446, checked on Archives of Nethys 2026-11-11). */
export const GUILT = {
  enfeebled: { name: "Enfeebled 2", words: "Enfeebled 2: -2 to its Strength-based attack rolls, its Strength-based damage and Athletics (Grapple, Trip, Shove). Best against a creature that fights with weapons, claws or teeth." },
  stupefied: { name: "Stupefied 2", words: "Stupefied 2: -2 to its spell attacks, spell DCs, Will saves and Intelligence-, Wisdom- and Charisma-based skills, and each spell it casts is lost unless it rolls 7 or higher on a flat check. Best against a spellcaster." }
};
/* the same two lines with pronoun markers (pronoun.mjs), so the window writes about the enemy as the rest of the module does (0.30.1) */
const GUILT_OF = { enfeebled: "Enfeebled 2: -2 to {their} Strength-based attack rolls, {their} Strength-based damage and Athletics (Grapple, Trip, Shove). Best against a creature that fights with weapons, claws or teeth.",
  stupefied: "Stupefied 2: -2 to {their} spell attacks, spell DCs, Will saves and Intelligence-, Wisdom- and Charisma-based skills, and each spell {they} {casts|cast} is lost unless {they} {rolls|roll} 7 or higher on a flat check. Best against a spellcaster." };
export const guiltLines = (who, forms = IT) => [`${who} refused your Glimpse of Redemption. Weight of Guilt: make {them} Enfeebled 2 or Stupefied 2? Both last until the end of {their} next turn.`, GUILT_OF.enfeebled, GUILT_OF.stupefied, "No answer in time is Enfeebled 2."].map(t => pro(t, forms));
export const guiltWords = (who, forms = IT) => guiltLines(who, forms).join(" ");
/** Why a character with a fitting reaction wasn't asked, for the GM's card. list: [{ name, reaction, why }] */
export function notAskedWords(list = []) {
  const W = { used: "reaction already used", delaying: "Delaying" };
  return list.map(x => `${x.name}: ${x.reaction} not asked (${W[x.why] ?? x.why}).`).join(" ");
}
/** The damage a creature took from one application, for the line after a reaction (0.38.0; Rhea, 2026-11-17: "You should be recording the full
    damage"): PF2e's own figure (the update's `damageTaken`, which its damage-taken card shows and which goes past 0 HP) when it came; otherwise
    what came off HP and temporary HP (no update came: nothing was taken, or the creature was already at 0); null when nothing is known. */
export function fullDamage({ dealt = null, was = null, now = null } = {}) {
  if (dealt != null && Number.isFinite(Number(dealt))) return Math.max(0, Number(dealt));
  if (was == null || now == null) return null;
  return Math.max(0, was - now);
}
/** What a hit did after the reactions to it, for everyone (Rhea, 2026-11-11, PR-10: every reduction says why, with the numbers).
    o: { name, enemy ("the creature" as players may name it), hit (the damage as rolled, after doubling or halving), taken (the full damage dealt
    after the reactions, as PF2e's card gives it: `fullDamage`), repent, resist (Glimpse refused: the resistance), less (Interposing Earth: what came off), block (Shield Block was used) } */
export function harmWords(o = {}) {
  const name = o.name ?? "Someone", enemy = o.enemy ?? "the creature";
  if (o.repent) return `${name} is unharmed: ${enemy} repented (Glimpse of Redemption).`;
  const why = [o.resist ? `Glimpse of Redemption, refused: resistance ${o.resist} to all of it` : null, o.less ? `Interposing Earth: ${o.less} less, and the barrier is destroyed` : null, o.block ? "Shield Block" : null].filter(Boolean);
  if (!why.length) return "";
  return `${name} takes ${o.taken ?? 0} (the hit was ${o.hit ?? 0}; ${why.join("; ")}).`;
}
/** A hit turned into a miss by a reaction, for everyone. */
export const missWords = (name, reaction, strike = "The hit") => `${strike} at ${name} becomes a miss: ${reaction === "Interposing Earth" ? "cover from Interposing Earth" : reaction}.`;
/** What the thinker is told when its monster must answer Glimpse of Redemption: words, never numbers (Rhea, 2026-11-11, reading a). */
export const CHOICES = ["repent", "refuse"];
export const choiceWords = ally => `As your blow lands on ${ally || "your enemy"}, a vision floods your mind: the harm you are doing, and another way. You must choose now. "repent": you hold back, and this blow does ${ally || "them"} no harm at all. "refuse": the blow lands, but weaker, and you are left weakened until the end of your next turn.`;

/* ---------- Moment E: a monster casts a spell (0.36.0) ----------
   Counteracting (Player Core pg. 431, checked on Archives of Nethys 2026-11-16): a spell's counteract rank is its rank; the check is the
   spellcasting attribute modifier plus the spellcasting proficiency bonus against the caster's spell DC. Critical success: counteract it if its
   rank is no more than 3 higher than yours; success: no more than 1 higher; failure: only if it is lower; critical failure: never. */
/** Does a counteract check of this degree (0 to 3) with my counteract rank beat theirs? */
export function counteracts(degree, mine, theirs) {
  const d = (Number(theirs) || 0) - (Number(mine) || 0);
  return degree === 3 ? d <= 3 : degree === 2 ? d <= 1 : degree === 1 ? d < 0 : false;
}
/** Which prepared copy (or slot) Counterspell spends, from those it could: [{ rank, ... }]. The lowest rank that still counteracts on a success
    (no more than 1 below the spell's), else the highest it has (Angel's reading, 0.36.0: keep the bigger slots for later). */
export function counterCopy(copies = [], target = 1) {
  const up = copies.filter(c => c.rank >= target - 1).sort((a, b) => a.rank - b.rank);
  return up[0] ?? [...copies].sort((a, b) => b.rank - a.rank)[0] ?? null;
}
/** DCs by spell rank and the rarity adjustments (GM Core pg. 52, checked on Archives of Nethys 2026-11-16). */
export const SPELL_RANK_DC = [14, 15, 18, 20, 23, 26, 28, 31, 34, 36, 39];
export const RARITY_ADJ = { common: 0, uncommon: 2, rare: 5, unique: 10 };
export const recognizeDc = (rank, rarity = "common") => SPELL_RANK_DC[Math.max(0, Math.min(10, Math.round(Number(rank) || 0)))] + (RARITY_ADJ[rarity] ?? 0);
/** The highest rank Recognize Spell identifies at once, by proficiency rank in the tradition's skill (0 untrained to 4 legendary). */
export const recognizeCap = prof => [0, 2, 4, 6, 10][Math.max(0, Math.min(4, Number(prof) || 0))];
export const TRADITION_SKILL = { arcane: "arcana", divine: "religion", occult: "occultism", primal: "nature" };
/** Recognize Spell's degree after its own rules: untrained, no better than failure; automatic, no worse than success. */
export function recognizeDegree(degree, { prof = 0, rank = 1, rarity = "common" } = {}) {
  if (!(Number(prof) > 0)) return Math.min(degree, 1);
  if (rarity === "common" && Number(rank) <= recognizeCap(prof)) return Math.max(degree, 2);
  return degree;
}
const RANK_WORD = r => { const n = Math.round(Number(r) || 0); return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`; };
/** The window's words for one reaction to a cast (the player's; gm: the GM's card, which always names the spell). x: the row. */
export function castWords(x = {}, who = "A creature", spell = "a spell", gm = false) {
  const name = gm || x.slug?.startsWith("counterspell") ? spell : "a spell";
  if (x.slug?.startsWith("counterspell")) return `${who} is casting ${spell}. You have ${spell} ${x.copy?.kind === "spontaneous" ? "in your repertoire" : "prepared"}. Counterspell? It uses up your ${x.copy?.kind === "spontaneous" ? `${RANK_WORD(x.copy?.rank)}-rank slot` : `prepared ${spell}`}.`;
  if (x.slug === "spell-riposte") return `${who} is casting ${name} at you. React with ${x.reaction}?`;
  if (x.slug === "shadow-siphon") return `${who} is casting ${name} that will deal damage. React with ${x.reaction}?`;
  if (x.slug === "redirect-teleportation") return `${who} is casting ${gm ? spell : "a teleportation spell"}. React with ${x.reaction}?`;
  return `${who} is casting ${name}. React with ${x.reaction}?`;
}
/** What each reaction to a cast would do, in numbers worked out now (the sample's line under the button). */
export function castDetail(x = {}) {
  if (x.slug?.startsWith("counterspell") || x.slug === "shadow-siphon") return `counteract check ${x.mod >= 0 ? "+" : ""}${x.mod} vs DC ${x.dc}${x.slug === "shadow-siphon" ? "; on a success its damage is halved" : ""}`;
  if (x.slug === "nullify") return `counteracted automatically; you lose ${x.rank}d8 HP`;
  if (x.slug === "recognize-spell") return x.auto ? "you know it at once; the roll is only for a critical success" : `${x.skillName ?? "skill"} ${x.mod >= 0 ? "+" : ""}${x.mod}, rolled in secret`;
  if (KNOWN[x.slug]?.pause) return "then make it yourself";
  return "";
}
/** The public line after a counteract check (PR-10: every reduction says why). */
export function counterLine({ who = "Someone", reaction = "Counterspell", monster = "A creature", spell = "spell", total = 0, dc = 0, degree = 1, ok = false, halved = false } = {}) {
  const deg = ["Critical failure", "Failure", "Success", "Critical success"][degree] ?? "Failure";
  monster = String(monster).replace(/^A creature$/, "a creature");   /* mid-sentence (seen live in test build 1: "on A creature's Fear") */
  return `${who} uses ${reaction} on ${monster}'s ${spell}: counteract check ${total} vs DC ${dc}, ${deg.toLowerCase()}. ${ok ? (halved ? "The spell still works, but its damage is halved." : "The spell is lost.") : "The spell goes on."}`;
}
/** What Recognize Spell tells the player, by degree (0 to 3). */
export function recognizeWords(degree, spell = "the spell", rank = 1) {
  if (degree === 3) return `You recognize it: ${spell} (${RANK_WORD(rank)} rank). You get +1 to your save or AC against it.`;
  if (degree === 2) return `You recognize it: ${spell} (${RANK_WORD(rank)} rank).`;
  if (degree === 1) return "You don't recognize the spell.";
  return "You think you recognize it, but you are wrong: the GM tells you which spell you think it is.";
}

/* ---------- Moments A to C (0.37.0): the numbers ---------- */
const lvl = n => Math.max(1, Math.round(Number(n) || 1)), rnk = n => Math.max(1, Math.min(10, Math.round(Number(n) || 1)));
/** A cantrip's rank: half the caster's level, rounded up. */
export const cantripRank = level => Math.max(1, Math.ceil(lvl(level) / 2));
/** What a row's resistance is, worked out for this damage: { type, value } or null. types: the damage types of the triggering damage, biggest first. */
export function resistFor(slug, { level = 1, rank = 1, types = [] } = {}) {
  const L = lvl(level), R = rnk(rank), has = t => types.includes(t), first = list => types.find(t => list.includes(t)) ?? null;
  switch (slug) {
    case "hidebound": return { type: "physical", value: 5 + 3 * Math.floor((R - 2) / 2), except: "adamantine" };
    case "rebounding-barrier": { const t = first(PHYS); return t ? { type: t, value: 10 + 2 * (R - 4) } : null; }
    case "blazing-spirit": return { type: "all-damage", value: L };
    case "calcifying-sand": return { type: "physical", value: L };
    case "consume-power": { const t = first(["acid", "electricity", "fire", "sonic"]); return t ? { type: t, value: L } : null; }
    case "deflecting-wave": { const best = ["acid", "fire", "bludgeoning", "slashing"].find(has); return best ? { type: best, value: ["acid", "fire"].includes(best) ? 2 * L : L } : null; }
    case "preemptive-reconfiguration": { const t = first(PHYS); return t ? { type: t, value: L } : null; }
    case "eat-fire": return { type: "fire", value: 5 * Math.ceil(R / 3) };
    case "scintillating-safeguard": { const t = types.find(x => x !== "bleed" && x !== "untyped") ?? null; return t ? { type: t, value: 4 + R } : null; }
    case "warping-pull": return { type: "all-damage", value: 5 * Math.floor(R / 2) };
    default: return null;
  }
}
/** Whisper of Warning: the attack rolled again, the lower kept. Returns the kept { total, natural }. */
export function rerollLower(old = {}, natural = 10) {
  const mod = (Number(old.total) || 0) - (Number(old.natural) || 0), again = { total: mod + natural, natural };
  return again.total < old.total || (again.total === old.total && natural < old.natural) ? again : { total: old.total, natural: old.natural };
}
/** Sacrifice Armor: the damage taken is less by twice the armor's level. */
export const sacrificeLess = armorLevel => 2 * Math.max(0, Math.round(Number(armorLevel) || 0));
/** What the attacker takes back: Rebounding Barrier 5 (+1 a rank), Blazing Spirit's dice and persistent fire, Blood Vendetta's persistent bleed. */
export const reboundBack = rank => 5 + (rnk(rank) - 4);
export const blazingBack = level => { const n = lvl(level) >= 18 ? 3 : lvl(level) >= 12 ? 2 : 1; return { dice: `${n}d6`, persistent: n }; };
export const bloodDice = rank => `${2 + 2 * Math.floor((rnk(rank) - 2) / 2)}d6`;
export const volcanicDice = level => `${Math.floor((lvl(level) - 6) / 4) + 1}d6`;
export const pyrefowlDice = rank => `${1 + Math.floor((rnk(rank) - 2) / 2)}d6`;
/** Blood Vendetta's persistent bleed by the attacker's Will save (0 critical failure .. 3 critical success): the multiplier on the dice, and the weakness. */
export const bloodBy = degree => ({ mult: [2, 1, 0.5, 0][degree] ?? 1, weak: degree <= 1 });
/** Calcifying Sand by the attacker's Fortitude save: the condition until the end of its next turn, or null. */
export const calcifyBy = degree => degree === 0 ? "petrified" : degree === 1 ? "slowed" : null;
/** Curse of Recoil and Anchoring Air by the monster's save: what it does to the attack. */
export function curseBy(slug, degree) {
  if (slug === "curse-of-recoil") return degree === 3 ? null : { offGuard: true, penalty: degree === 1 ? -1 : degree === 0 ? -2 : 0, lasting: degree === 0 };
  if (slug === "anchoring-air") return degree === 3 ? null : degree === 2 ? { penalty: -2, thisAttack: true } : { penalty: -2, turn: true, immobilized: degree === 0 };
  return null;
}
const SAVE_WORD = ["critically fails", "fails", "succeeds", "critically succeeds"];
/** The line for everyone after a monster's save against one of these (PR-10: every change says why). */
export function curseWords(slug, who = "A creature", degree = 1, reactor = "Someone") {
  const c = curseBy(slug, degree), name = KNOWN[slug]?.name ?? slug, save = slug === "anchoring-air" ? "Reflex" : "Will";
  if (!c) return `${reactor} casts ${name}: ${who} critically succeeds at its ${save} save and is unaffected.`;
  if (slug === "curse-of-recoil") return `${reactor} casts ${name}: ${who} ${SAVE_WORD[degree]} at its Will save${c.penalty ? `, so its ranged attack takes ${c.penalty} (status)${c.lasting ? ", and so do its ranged attacks until the start of its next turn" : ""}` : ""}; it is off-guard until the start of its next turn.`;
  return `${reactor} casts ${name}: ${who} ${SAVE_WORD[degree]} at its Reflex save, so ${c.thisAttack ? "this attack takes -2 (circumstance)" : `its attacks take -2 (circumstance) until the end of its turn${c.immobilized ? ", and it is immobilized until the start of its next turn" : ""}`}.`;
}
/** The flat check a row asks of the attack: Apparition Cloud's DC 5 (concealed), Cloud Dragon's Cloak's DC 11 (hidden). */
export const flatOf = slug => KNOWN[slug]?.flat ?? 0;
/** What each of these would do, in numbers worked out at the moment (the line under its button). x: the row with { level, rank, resist, less, flat }. */
export function rxDetail(x = {}) {
  const row = KNOWN[x.slug] ?? {};
  if (row.pause) return "then make it yourself";
  if (row.flat) return `the attack needs a DC ${row.flat} flat check to hit you${x.slug === "cloud-dragons-cloak" ? " (and ranged attacks at them for 1 round)" : ""}`;
  if (row.save) return `${row.save === "will" ? "Will" : "Reflex"} save against your spell DC${x.dc ? ` ${x.dc}` : ""}`;
  if (row.reroll) return "the attack is rolled again and the lower result kept";
  if (row.armor) return `${x.less ?? 0} less damage; your armor is broken`;
  if (x.slug === "shield-of-reckoning") return `your shield blocks up to ${x.hardness ?? 0} for the ally, and your champion's reaction too`;
  const r = x.resist;
  const back = x.slug === "rebounding-barrier" ? `; the attacker takes ${reboundBack(x.rank)}` : x.slug === "blazing-spirit" ? `; the attacker takes ${blazingBack(x.level).dice} fire and ${blazingBack(x.level).persistent} persistent fire` : x.slug === "calcifying-sand" ? "; the attacker's Fortitude save (slowed or petrified)" : x.slug === "blood-vendetta" ? `; the attacker takes ${bloodDice(x.rank)} persistent bleed by its Will save` : "";
  if (r) return `resistance ${r.value} to ${r.type === "all-damage" ? "this damage" : `${r.type}${r.type === "physical" ? " damage" : ""}`}${back}`;
  return back.replace(/^; /, "");
}
/** The window's sentence for one of these. who: the monster as the reactor may see it; ally: the creature attacked, when it isn't the reactor. */
export function rxWords(x = {}, who = "A creature", ally = null) {
  const gate = KNOWN[x.slug]?.gates?.[0];
  const what = gate === "attack" ? (ally ? `${who} attacks ${ally}` : `${who} attacks you`) : gate === "ranged" ? `${who} is about to make a ranged attack` : gate === "hit" ? (ally ? `${who}'s Strike hits ${ally}` : `${who} hits you`) : (ally ? `${who} is about to damage ${ally}` : `${who} is about to damage you`);
  return `${what}. React with ${x.reaction ?? KNOWN[x.slug]?.name}?`;
}
