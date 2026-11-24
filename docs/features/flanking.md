---
feature: flanking
files: [scripts/flank.mjs]
functions: [fight.mjs:flankFor]
dependsOn: [packet, minds, memory, moves, brain]
since: 0.44.0
---
Flanking (F-10): each turn the packet shows which squares a monster can reach that flank a foe with an ally, how dangerous standing there is, whether it is flanked itself and where it could get out; how much it makes of that goes by its mind, and the card says why when a flank was open and not taken.

## Decisions
Rhea, 2026-11-24 (the live test's feature design, F-10; found: the thinker was never told the flanking rule and nothing worked out flanking squares, though PF2e already applies off-guard when tokens really flank):
1. **"Work out squares, by mind"** (her pick, Angel's recommendation): each turn the packet shows which reachable squares flank a perceived foe with an ally; pack, trained and drilled minds use it, mindless don't; the card says why when it doesn't flank.
2. **The danger, and its own back** (her words: "A needs to be smarter then that. IT needs to know when Flanking would put itself in more danger, and it also needs to knwo to try and not let themselve get flanked either."): for each flanking square, the danger of standing there (which foes reach it, whether it would itself be flanked there, reactions it would provoke on the way, how far from its allies); and defence: whether it is flanked now and which reachable squares get it out or keep its back covered (a wall, an ally). All of it only from what the monster perceives; how much it weighs this goes by its mind.
3. **A foe's reaction is unknown until seen** (her words: "it should not know if somone has a reaction that can trick by moving until it happens though smarter or better tained may have a good idea."): the danger names a foe's movement reaction only once the monster has seen that foe use it (its notebook); before that only a smarter or better-trained mind may count it, as a guess from what it sees, marked unsure, never as fact; a party member's sheet is never read for it.

Settled by Angel at build time, told to Rhea, hers to change:
- **Who seeks flanks** (`flankUse`): Discipline Pack, Trained or Drilled, or Mind Cunning or Trained tactician. Every other thinking creature (an Animal on its own, a Simple mind in a loose band) gets only its own back: whether it is flanked and the ways out ("habit": "guards"). A Mindless creature gets nothing. A party member Angel plays with no Mind written counts as Cunning, as its notebook does.
- **Who may guess an unseen reaction:** a Trained tactician, or a creature of a Trained or Drilled band. The guess is "a melee weapon in its hand" (for a monster foe, any melee attack), listed apart as "mayProvoke".
- **A seen reaction counts for every mind that is told about flanking**, not only the Trained tactician whose notebook shows the line "strikes at those who move away": she said a monster knows it "once it has seen it used". The notebook's ladder is unchanged; only the flank block reads the stored line.
- **A foe's reach is what shows:** PF2e's own figure for the creature (`getReach`, from its size and the weapon in its hand), the same number PF2e's flanking test uses. No Speed, AC or anything else is read from a foe.
- **Only squares it can get to this turn** are listed: a Step, a Stride, or two Strides (which leave one action at most). At most 4 flank squares, the least dangerous first, and 3 ways out (two Steps, then a Stride). An ally must already be in place: setting a flank up for an ally who moves later is left to the thinker (the prompt gives the rule).
- **The card's line** when a flank was open and the plan's last move ends on none of the listed squares: the thinker's own "noFlank" words, or "Angel gave no reason"; for a mind that doesn't seek, that its mind doesn't look for flanks; for a Mindless creature, that it never thinks to. The thinker isn't asked again for a missing reason (no extra round trip).

## How it works
- **The rule** ([Flanking](https://2e.aonprd.com/Rules.aspx?ID=2375)): two creatures flank a foe when both have it in melee reach, both can act and attack, and a line between the centres of their spaces passes through opposite sides or opposite corners of the foe's space. PF2e applies off-guard itself (`TokenPF2e#isFlanking`, PF2e 8.7.0): this feature never sets it, it only tells the thinker ahead of the move.
- **`flank.mjs`, pure:** `oppositeSides` is a copy of PF2e's `onOppositeSides` (Foundry's `lineSegmentIntersects`, touching counts) in squares; `reaches` is PF2e's distance with the reach rule (`distanceBetween`); `flankedAt` (which foes flank a creature at a square), `backAt` (covered when no foe that reaches the square has a free square opposite it, right beside the monster), `provokedBy` (foes whose reach covers a square a Stride leaves; a Step provokes nothing), `flankView` (the block and how many flank squares were open), `tookFlank`, `flankNote` (the card's line).
- **`flankFor` in fight.mjs** gathers it for `buildPacket`: foes are the creatures the monster can target (observed, concealed or hidden; only one it sees can be flanked for a Strike, and a pointed-out square never counts as seen), allies the ones it knows of; each with its square, size, reach and whether it is up and able (down, paralyzed, petrified, restrained or yielded creatures threaten nothing and flank nothing). A foe's "seen it react" is a `reactive` line about it in this monster's notebook that the GM hasn't crossed out. Routes come from `mover` with the same known-creatures set as a plan's legality check, looked for within two Speeds; `route.freeAt` says whether a Medium creature could stand in a square as far as this monster knows.
- **A foe it only hears** (hidden, or pointed out) counts with an ordinary 5-foot reach, as able, and is never guessed at: its weapon and conditions don't show. **A prone monster** is promised no square (it must Stand first), but is still told who flanks it. Each square is routed to once a packet, and nothing further than two Speeds is tried.
- **Left out:** when PF2e's flanking automation is off; when the monster is in the air or under the ground; any creature off the ground (heights aren't worked out).
- **The packet (schema 12):** `flank`, after `memory` (it is built from what the monster perceives): `{ habit, flankedBy?, flanking?, squares?, out? }`, labels, squares and fixed words only; absent when there is nothing to say. The request keeps `flank: { open, use, mind, discipline }` when a flank was open, for the card's line.
- **The prompt (version 38)** explains the rule, each field, that a foe in neither list is unknown rather than safe, how each mind weighs it, and the plan's `noFlank`.
- **The plan:** `noFlank` (160 characters, `cleanPlan`), never read by the check.

## Checks
- (fk-u) {unit} fk-1 to fk-12 in `unit.mjs`: by mind; opposite sides for Medium and Large and with reach; flanked now; its back; who may strike on the way (sure, guessed, unknown); the squares, their cost and danger; already flanking; out of reach; a mind that doesn't seek and a Mindless one; the ways out; the block's fields; the card's line; the packet's key order and the plan's `noFlank`; the hello.
- (fk-l1) {live} `oppositeSides` and `reaches` against PF2e itself on the runner's page: for Medium and Large flankers and foes at every offset within three squares, the copy and `TokenPF2e#onOppositeSides` agree, and `isFlanking` agrees with the block's `flanking` for real tokens.
- (fk-l2) {live,shared:packet} A real fight: a pack creature with a packmate beside a party member gets `squares` in its `flank` block with the square opposite; standing there, `flanking`, and PF2e shows the target off-guard on its Strike; a Simple loose creature gets no `squares`; a Mindless one no `flank`; scan the block for names and numbers off a sheet.
- (fk-l3) {live} Danger: a second party member beside the flank square shows in `reach` and `flanked`; a party member that has used Reactive Strike on this monster shows in `provokes` on a later turn and not before; `mayProvoke` only for a Trained tactician or a trained or drilled band.
- (fk-l4) {live} Its own back: between two party members it gets `flankedBy` and `out`; with a wall behind it a square reads `back: "covered"`.
- (fk-l5) {live} The card, by real clicks as the GM: a plan that takes a listed square has no line; one that doesn't shows "A flank was open and not taken:" with the thinker's `noFlank`; a mind that doesn't seek shows its own line. A turn planned through `fight_wait` and `fight_plan` from a packet with `flank` is accepted and runs.
- (fk-l6) {live,player} As the test player: nothing of the flank block on screen; what their browser holds of it is labels and squares only.

## Traps
- **A flank square is only as good as its route:** the square is listed with the route the module found at the start of the turn; the thinker's own Stride there is checked again by `checkPlan` like any move.
- **Spreading a creature over a base one** (`{ ...base, square }`) must put the new square last, or the base's square wins (the unit test's first draft did it the other way round).

## Open items
- A foe that can't be flanked (all-around vision, a class feature that denies it) is not known to the monster: it may move to flank and gain nothing. Learning that from a flank that didn't work isn't built.
- Gang Up and other feats that change who counts as flanking are PF2e's; the block uses the plain rule only.
- Heights: a flier, a burrowed creature or one up a tree is left out on both sides.
- Its back is judged from the squares right beside it only; a second foe with a long weapon could flank from further off.
- Setting a flank up for an ally who hasn't moved yet is left to the thinker.
