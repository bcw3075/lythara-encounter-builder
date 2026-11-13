---
feature: point-out
files: [scripts/pointout.mjs]
functions: [fight.mjs:lostByAllies, fight.mjs:pointCtx, fight.mjs:pointHearers, fight.mjs:runPointOut, fight.mjs:wrongBelief, fight.mjs:runBlindMiss, fight.mjs:dropBeliefs, fight.mjs:pointCard, turn.mjs:nextPoint]
dependsOn: [packet, turn-loop, stealth, strike-damage, reactions, brain, card-ui, history]
since: 0.30.0
---
Point Out (monster minds release 3, tier 3d): a `point-out` step shows a monster's allies a creature they have lost; one that sees and understands has it hidden at its square, one that only sees the gesture rolls Perception against its Stealth DC and may believe a wrong square, which only the GM is told.

## Decisions
Rhea, 2026-11-12 (q-18 of the plan, R3-17 of the design doc; the review's finding 15):
1. **She was shown a sample picture before any code** (the step with a box of what each ally now knows, and what the next ally's packet is told) and answered: "They look good". The build follows it:
   - only a creature its allies have lost (undetected or unnoticed) can be pointed out, and only by one that sees it;
   - an ally that can see it point and understands it: the creature is hidden to it at its square;
   - an ally that sees the gesture but can't understand the words: Perception against the creature's Stealth DC; on a failure it believes a square that is wrong, and **only the GM is told it is wrong**;
   - an ally that can't see the pointer learns nothing;
   - a pointed-out square lasts until that creature moves away from it unseen, or the ally's own senses say better;
   - nothing extra goes to chat: the step shows like any other.
2. **Point Out is built and tested on its own inside the tier (review 15):** it is the one place a stored state makes a creature better perceived than a monster's own senses say.

Settled by Angel, told to Rhea in the release note, hers to change:
- **"Understands" means it hears the pointer and shares a language with it;** a deafened ally, one out of earshot and one with no common language all roll.
- **The Perception roll posts no card** (a public one would tell the table who misread; the module posts no whispered cards): the GM reads it in the box under the step and in the History.
- **A wrong square is one or two squares from the real one,** picked at random.
- **A Strike at a creature it knows only from a wrong square goes at the empty square:** a public line says it struck at where it believed a creature was hiding and nothing was there; the thinker is told its flat check failed (all it could tell), and the belief ends with that blow. An ability or a single-target spell aimed there stops the turn for her instead.
- **Any move of the pointed-out creature ends every belief about its square,** seen or not (an ally that sees it move has its own senses again anyway).
- **The thinker is told which creatures its allies have lost** (`alliesLost` on a creature it sees), so it doesn't spend a try on a Point Out that would be refused. It is what a creature watching its own side would notice.
- **The action's card is one plain public line** ("points at <name> for its allies"), not posted for a pointer the GM has hidden; a creature the GM has hidden is "something", one whose name doesn't show is "a creature".
- **Rules:** Point Out, Player Core (https://2e.aonprd.com/Actions.aspx?ID=97). It is a manipulate action: the party's Reactive Strikes are asked before it, and a grabbed pointer rolls the DC 5 flat check.

## How it works
- **The rules** (`pointout.mjs`, pure): `withBelief(own, belief)` is the whole of what a belief does to perception: only when its own senses say undetected or unnoticed, the creature is hidden at the believed square. `canPointOut`, `allyGets` ("knows", "cantsee", "understood", "roll"), `wrongSquare`, `allyResult`, `pointLines` and `previewLines` (the GM's box), `pointResult` (the thinker's result: counts only), `squareFeet`.
- **Where it is kept:** on the Combat's turns flag, `pointed.<observer>.<creature>` = `{ square, round, by, wrong? }`.
- **Perception** (`fight.mjs` `senser`): after `perceiveOne`, `withBelief`; the result carries `raw` (its own senses' state), `pointed` and `wrong`. `perceiveOne` itself is unchanged. `packetOf` marks the entry `pointed: true` and never carries `wrong`; a wrong square's height is left out.
- **The step** (`checkPlan`; `pointCtx`, `runPointOut`): `{ do: "point-out", target }`, one action. `pointCtx` answers per label only when a plan asks (it runs every ally's senses). `runPointOut` checks that the pointer still sees the creature, works out each ally's result (`pointHearers`), rolls for those that only saw the gesture, posts the action's line, and writes the step's record and every belief in one update.
- **Ending** (`dropBeliefs` on `moveToken`; `packetExtras`; `runBlindMiss`): the creature moved; the observer's own senses gave it a square when its packet was built; or it struck at a wrong square.
- **The window** (`pointCard`): the box under the step, a preview before it runs (on a page with the fight's map open) and the results after.

## Checks
- (pt-1) {unit} The rules: a belief counts only while its own senses give no square; who can point out; what an ally gets; a wrong square; an ally's result; the GM's box as the sample has it; the thinker's result never says whether a square is right; the step through the plan check with its refusals; the step's record, done step and History line; the packet's `alliesLost` and `pointed`.
- (pt-2) {live,shared:packet} On the runner, real creatures behind real walls: a monster that sees a party member another monster can't see has `alliesLost: true` on that entry, and `api.fight.checkPlan` accepts a `point-out` at it and refuses one at a creature nobody has lost.
- (pt-3) {live,shared:turn-loop} By a real Do it click as AI: the action's public line posts; the box lists each ally (one that understood, one that only saw the gesture with its Perception against the Stealth DC, one that couldn't see the pointer); `pointed.<ally>.<creature>` is on the flag; the ally's next packet has the creature `hidden`, `pointed: true`, at the square; a party member's Reactive Strike is asked before the gesture.
- (pt-4) {live} A wrong square (the d20 fixed on the runner): the box has the GM-only line; the ally's packet shows the wrong square and nothing that says so; a Strike at it posts "strikes at a square where it believes a creature is hiding" with no attack roll, the thinker's done step reads "flat check failed", the belief is gone and the card's note says what happened.
- (pt-5) {live} Ending: the pointed-out creature moves one square and every belief about it is gone; an ally that walks into sight of it has the belief removed when its packet is built.
- (pt-6) {live,player} As the test player: the Point Out line names the creature only as players may read it, no card shows a Perception roll, and nothing on the player's page says a square is wrong.

## Traps
- **A belief must never beat the creature's own senses** (review 15): `withBelief` is applied after `perceiveOne` and only to undetected or unnoticed. A stored Visioner state of undetected is overridden by it; a stored hidden is left as it is.
- **`wrong` never leaves the runner's side of the packet:** `packetOf` copies named fields only, and the unit test scans the perceived block for the word.
- **A believed square goes into the monster's last-seen memory** (`remember` keeps a hidden creature's square), so once the belief ends it remembers the square it believed, right or wrong: that is what it knew.
- **`pointCtx` is a Proxy that works on first read:** spreading `ctx` copies the reference, never the answers.

## Open items
- A party member the GM plays, or a monster on the party's side, can Point Out for the party through a plan; players' own Point Outs aren't read by the module (Visioner handles those for the party's side).
- An area spell placed on a wrongly believed square isn't stopped: its area is checked against real positions as any area is.
- A wrong belief's distance in the packet is counted between squares, without height.
- The pointer's own Stealth state isn't a bar: a hidden monster that points comes out of hiding first, like any action that isn't Hide, Sneak or Step.
- Visioner's own record for the pair is not changed: only the module's monsters act on the belief.
