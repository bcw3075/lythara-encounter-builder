---
feature: sides
files: [scripts/sides.mjs]
functions: [fight.mjs:checkSides, fight.mjs:checkSidesNow, fight.mjs:onSideChange, fight.mjs:turnedPacket, fight.mjs:sideList]
dependsOn: [bands, orders, minds, packet, turn-loop, card-ui, history]
since: 0.30.0
---
Monsters changing sides (monster minds release 3, tier 3d), by the simple rule: the side is PF2e's at once for everyone; the module keeps the books (the band left and rejoined, a leader's change counted as its fall, a player's creature no longer played).

## Decisions
Rhea, 2026-11-11 and 2026-11-12 (R3-8 and R3-15 of the design doc, q-16 and q-18 of the plan; the review's finding 2):
1. **The simple rule** (over R3-8's full rule, where the old band waits until it sees the turncoat act), asked 2026-11-12: at the flip everyone treats the creature as on its new side. The module does the band bookkeeping: it leaves its band, gets no more orders, keeps its notebook and the last plan it heard; "If the leader falls" fires if it led; it rejoins with the last plan it heard when a temporary change flips back (orders given meanwhile are lost to it); and the module stops playing it when a player gets it. The full rule may come later as its own change if this feels wrong in play.
2. **She was shown a sample picture before any code** and answered: "They look good". It shows, and the build follows: a "changed sides, round n" tag on its row; "(party)" after its name when she still plays it, **its ticks kept as they were** (Angel's choice, shown); a row greyed and not played once a player owns it (the tag reads "a player's now" for one that changed hands in this fight, "a player's" for one that was a player's all along); a card saying it left the band and what it keeps; a line when the one that changed was the leader, with what the band's pick did; History lines for each.

Settled by Angel, told to Rhea in the release note, hers to change:
- **A side is PF2e's `alliance`:** party, opposition, or nobody's. A monster set to nobody's side has left its band too.
- **Giving a monster to a player usually changes its side as well** (PF2e counts a creature a player owns as the party's unless its side was set by hand): both lines are logged.
- **A creature that changed sides keeps its mind** (its profile is read as before), which a monster on the party's side otherwise doesn't have.
- **Its packet says it changed sides** and carries the orders it last heard as something it knows, in the orders' own words; a creature named there that it can't name itself reads "a creature it hasn't seen". The band's plan as written at build isn't repeated to it, nor the band's name (her own text, which has passed no name gate there).
- **Fights harder has nobody to avenge when the leader changed sides** (as for one that gave itself up): the plan stands.
- **The card shows in the round of the change only;** the tag stays.

## How it works
- **The rules** (`sides.mjs`, pure): `sideWord`, `sideChange(was, now, round)` (the books' entry and the events "first", "turned", "back", "owned", "unowned"), `sideTag`, `sideCardWords`, `sideLogWords`, `changedForPacket`.
- **Where it is kept:** on the Combat's turns flag, `sides.<token>` = `{ side, from, home, owned, changed? }`, `leads.<band>` (who led at the last look) and `turned.<band>` = `{ token, round }`. Log lines `side`, `sideBack`, `owned`, `unowned` share the band log.
- **The look** (`checkSides`, runner, in the notebooks' queue): at every turn change before the bands are settled, and when an actor's `system.details.alliance` or `ownership` changes (`onSideChange`, from `updateActor` and from `updateToken`'s `delta`). It compares every NPC combatant with the books. Membership needs no write: `bandlib` counts only a creature on the opposition's side as a band's (`isMonster`), so the band's packet, orders and hearers drop it and take it back by themselves.
- **A leader that changed sides** (`settleBandsNow`): `turned.<band>` makes the fall's state "turned" once (its `done` is written with the fall, so a later fall of the heir can't bring it back); the pick is acted on as for any fall, and a leader that came back and is struck down later falls again. A marked leader that left reads as gone afterwards and is skipped.
- **A player's creature** (`runnable`): an NPC a player owns isn't played; its open requests are closed with a note.
- **The mind** (`library.mjs` `mindLayers`): an NPC on the party's side whose books say it began on the opposition's keeps its layers.
- **The window** (`sideList`): tags, "(party)", the greyed row, the card.

## Checks
- (sc-1) {unit} The books: first seen, turned, back, to nobody's side, a second change, a player's ownership, a band joined late; the tag and the card as the sample has them; the History's lines; a turned leader in the band log's words, in `fallOutcome` and in a member's packet words; a turncoat's own packet block.
- (sc-2) {live} Probe and record which hook fires: a monster's side set to the party's on its sheet (an unlinked token and a linked one) and an owner given to its actor; after each, `sides.<token>` on the runner has the change without waiting for a turn change, or with it (say which).
- (sc-3) {live,shared:bands} A band member changes sides by real clicks on its sheet as AI: its row has the tag and "(party)", its ticks unchanged; the card and the History line appear; its next packet has no `band` and no `orders`, has `you.changedSides` and `you.side`, and lists its old band in `perceived`; a member's packet lists it as an enemy; an order given now doesn't count it among the hearers.
- (sc-4) {live,shared:orders} The leader changes sides: the band log has the fell line with "has changed sides", the pick is acted on once (Next in line: the new leader's packet says it leads), and a second turn change does nothing more.
- (sc-5) {live} Flipped back: the tag goes, the band's packets include it again, the orders it heard before are still its standing orders, and the log has the line.
- (sc-6) {live,player} Given to the test player: its row is greyed with the tag, its open request is closed with the note, its turn asks nothing of Angel, and the test player can move it; taken back, its row is as before.
- (sc-7) {live,shared:minds} A turncoat still ticked for Angel gets a turn request whose packet has its mind profile (not empty).

## Traps
- **A guessed leader leaves no mark when it goes:** `leaderOf` simply guesses the next member, so the books keep who led at the last look (`leads`) and compare.
- **A marked leader that changed sides reads as "gone" on every later pass:** `settleBandsNow` skips a band whose `turned` entry has been acted on while the mark still points at the one that left, or the band would fall a second time.
- **The look runs inside the notebooks' queue and settles the bands itself:** calling the queued `settleBands` from there would wait on its own job.

## Open items
- An NPC a player owned before the fight (a companion built as an NPC, an ally whose sheet a player holds) is no longer played by the module, where before 0.30.0 it could be ticked for Angel: its row is greyed with "a player's".
- A band member that is on nobody's side when the fight starts is simply not in its band (no line is logged: nothing changed in the fight).
- Only NPCs are looked at: a character that changes sides isn't the module's to keep books for.
- A change during the turncoat's own running turn isn't stopped: the step in hand finishes, and the next look at the plan sees the new sides.
- Why it changed (a charm, a bribe) isn't known to the module; the card doesn't say.
- A monster set to nobody's side is still asked for turns when ticked: with no enemies and no allies its packet is nearly empty.
- The turncoat's notebook still speaks of its old enemies as enemies in past lines; the packet's `changedSides` tells the thinker how to read that.
