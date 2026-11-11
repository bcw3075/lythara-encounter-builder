---
feature: memory
files: [scripts/memory.mjs]
functions: []
dependsOn: [packet, minds, brain, turn-loop, reactions]
since: 0.25.0
---
Fight memory: a notebook per monster for the fight (who hurt it, what it tried that failed, who heals and casts, what it worked out), its allies' deeds this round and its side's tally, the Remembers fold-out and the GM's own lines. Monster minds release 2 of 4.

## Decisions
Rhea, 2026-11-11 (each answered "A" to a question with three choices; the design and its independent review are in the project's design doc):
1. **She sees it:** a fold-out "Remembers" on the plan card and the same in the History window, so she can check why a monster changed its target and catch a wrong notebook.
2. **She can correct it:** she can cross a line out and add a line of her own in a few words. Her lines are marked hers, go through the name gate, and the monster thinks again if it is mid-turn. Angel never changes or removes a line of hers.
3. **How much a monster works out depends on its Mind:** Mindless nothing; Animal who hurt it and who hurt it last; Simple also what it tried that failed; Cunning also who heals and who throws magic; Trained tactician also the finer things it saw (who strikes when you walk away, who blocked with a shield, what hurt one of them far more than it should, what did little).
4. **Weakness and resistance of an enemy** are kept though they are facts off a player's sheet, because she chose it: for a Trained tactician only, in words only, and only from an outcome the monster perceived, never read from the sheet ahead of time.

Settled by Angel, told to Rhea, hers to change:
- Kept for every creature that isn't a player's, ticked for Angel or not. A party member Angel plays with no written Mind gets the Cunning rung.
- Only what it perceived at the moment the effect landed; words, never numbers; magic is what it visibly did, not the spell's name, unless the monster has that same spell itself.
- Each line is sure or unsure by how the module knows it; nothing is guessed.
- The ladder is enforced by the module: the notebook stores what the monster perceived, the packet carries only the kinds of line its Mind may use.
- Lasts this fight only.

## The source table (live probe, 2026-11-11, PF2e 8.7.0, Foundry 14.370, Toolbelt 3.60.0)
What was done in the test world, as the test player and as a GM by real clicks on the cards, and what each left behind. "The card" below is PF2e's **damage-taken** card: `flags.pf2e.context.type === "damage-taken"`, posted by whoever pressed Apply, its speaker the creature that took it.

| What happened | What PF2e records | Tier |
|---|---|---|
| A player's Strike, hit or miss | The attack card: `context.type "attack-roll"`, `context.target.token` (uuid), `context.outcome`, `context.origin.token` and `flags.pf2e.origin.actor` (the attacker), `origin.type` weapon or melee | sure |
| Its damage applied from the card (Toolbelt's row or PF2e's button) | The card with `flags.pf2e.origin` (attacker's actor uuid and item uuid) and `appliedDamage` (`isHealing`, `shield`, `persistent`, the old HP). The HP update comes **before** the card | sure |
| A weakness, resistance or immunity applied | Only in the card's HTML: `<span class="iwr" data-applications='[{"category":"weakness"\|"resistance"\|"immunity","type":"slashing","adjustment":5}]'>` (GM-visible). Nothing in the flags | sure |
| Damage brought to nothing (resisted away, immune) | The card with `appliedDamage: null`, the `iwr` span, and **no** HP update | sure |
| A spell cast | A card with `flags.pf2e.casting` and `origin.type "spell"` (item uuid: its traits, area and slug are on the item) | sure |
| A spell attack | An attack card as for a Strike, `context.action "cast-a-spell"` | sure |
| A save spell's damage | The damage card has `context.sourceType "save"`; the save itself is rolled on Toolbelt's row with **no chat card**: `flags.pf2e-toolbelt.targetHelper.saveVariants.null.saves[tokenId].success` arrives as an update of the damage card. Then the card per target, with the spell as origin | sure |
| An area spell | Nothing says area on the cards (Toolbelt's `area` was null with targets picked by hand); the spell item has `system.area`. Each creature caught gets its own card | sure per creature |
| Healing applied | The card with `appliedDamage.isHealing: true` and the healer's spell as origin; posted by the player who applied it | sure |
| Persistent damage starting | The card with `appliedDamage.persistent: [condition id]`; the condition item itself names no source (`origin` is its bearer) | sure when a card with an origin started it |
| Persistent damage at the end of its turn | PF2e rolls and applies it on the active GM's page: the card's `origin.type "condition"`, its actor the bearer | sure (what, not who) |
| Shield Block | Part absorbed: `appliedDamage.shield`. All absorbed: `appliedDamage: null` and only the card's words say so. The module's own reaction answers say it for a monster's Strike | sure through the reaction answer |
| A companion's or summon's attack | The same cards as a Strike, speaker and origin the companion's own token | sure |
| HP typed by hand | An HP update only (it carries PF2e's `damageTaken` like any other, so that proves nothing), no card | unsure |
| A condition put on by hand (Frightened) | The condition item, its `origin` the bearer: no source | none: her own line |
| The module's own monster hits | `applyDamage` with no item, so the card names nobody; the module knows the attacker itself (the step log) | sure |

So the rule the code follows: **a card is the event; an HP drop with no card for that creature within a short wait is "something hurt it, unsure what"**. Sizes seen: a small monster's packet is about 3,900 characters (its own sheet 1,800, the ground map 950, what it perceives 850); the notebook's part is capped well under a quarter of that (below).

## How it works
<!-- Filled as the release is built. -->

## Checks
<!-- Filled as the release is built. -->

## Traps
- **The HP update arrives before the damage-taken card,** and a card can come with no HP update at all (damage resisted to nothing, a shield taking all of it). Read the card; use the HP update only as the fallback after a wait.
- **`damageTaken` in an HP update's options is there for a hand edit too:** it doesn't tell a card's damage from a typed number.
- **A weakness or resistance applied is only in the card's HTML** (`data-applications` on the `.iwr` span), not in its flags.
- **A pre-update hook fires only on the page that made the change:** a watcher on another page needs `updateActor`.
- **Toolbelt rolls a save with no chat card:** the result is a flag update on the damage card.
- **An NPC's HP value can't be raised past its max in the same update that raises the max** on an unlinked token (seen: max went to 80, the value stayed): set the max, then the value.

## Open items
- "What frightened it" has no source: a condition records no origin. Until players' buttons or a known card give one, it is Rhea's line to add.
