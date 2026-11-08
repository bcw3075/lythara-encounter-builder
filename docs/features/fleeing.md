---
feature: fleeing
files: []
functions: [turn.mjs:edgeSides, fight.mjs:mapSquares, fight.mjs:surveyApi, fight.mjs:extendProblem, fight.mjs:escapeXP, fight.mjs:escapedOf, fight.mjs:letGo, fight.mjs:extendMap, fight.mjs:runExtend, fight.mjs:afterExtend, fight.mjs:escapedList, fight.mjs:bringBack]
dependsOn: [turn-loop, moves, card-ui, history, brain]
since: 0.11.0
---
Monsters fleeing off the map edge: the `flee` step, the GM's choice at the edge (Extend map or Let it get away), escaped tokens and Bring back.

## Decisions
Designed with Rhea one question at a time on 2026-11-08; she chose the recommended option every time. Ten decisions:
1. **Who decides at the edge: the GM, every time.** The turn stops (on Auto too, the same way it stops for an ability's card) and the Monster Turns card shows **Extend map** and **Let it get away**.
2. **What counts as reaching the edge: a plan step `flee`, planned by the thinker.** It is checked like a Stride: the monster must be able to reach a square on the outermost ring of the map with the actions it has left. Once it stands there the turn stops and the buttons appear. Ending an ordinary Stride on the ring triggers nothing.
3. **Let it get away:** the monster leaves the fight (its combatant is removed), its token stays on the scene, **hidden and flagged `escaped`**, with HP and conditions kept. Nothing is deleted.
4. **Threat and XP:** the encounter's threat stays as built. The escape is noted on the card and in the history window ("escaped: 1 Dire Wolf (30 XP not earned)"). Awarding XP for it is the GM's call at the end.
5. **After Extend map:** the monster keeps its turn. Once the Survey Sheet's redraw has settled it gets a fresh packet and the thinker plans the remaining actions (keep running or turn and fight). Nothing is forced.
6. **Which side grows:** one **Extend map** button per side the monster stands on, labelled with the side; at a corner two buttons. If Extend isn't possible the button is greyed out with the reason, and **Let it get away** stays available.
7. **When the thinker plans to flee:** its judgment (badly hurt, outnumbered, its leader down), with a `why` like any step, so the reason shows in the history. A monster with the **Fleeing** condition must spend its actions fleeing, as the rules say; the prompt (version 13) says so.
8. **Bringing one back:** an **Escaped** section in the Monster Turns window with a **Bring back** button per monster: unhide the token, add it to the combat, roll initiative as for any monster joining a fight. It lands where its token is now (the GM can move it first). The history keeps the escape line and adds a "brought back" line.
9. **Too far from the edge to arrive this turn:** the thinker runs toward the nearest edge with ordinary Strides (already legal) and plans `flee` once the edge is within what its remaining actions can reach. A Fleeing monster must move away from the source; checked the same way.
10. **What players see:** the token has already stood on the edge square; when the GM presses Let it get away the module hides it, so the table watches it run off and vanish. **No chat message** (her standing rule: no whispered or extra chat cards). The card and history carry the record.

Build choices (Angel, 2026-11-08, within the design; Rhea can change them):
- **The outermost ring is read from the scene's current bounds** (`scene.dimensions` ÷ grid size), never a stored size, so an extended map has new edges at once.
- **A `flee` must be the plan's last step**, like Seek: at the edge the GM decides, and if the map grows the thinker is asked again anyway. A flee with actions left after it leaves them for that re-ask.
- **Extend grows the map by 10 squares**, the Survey Sheet's own default, and the button is greyed when that would pass the Survey Sheet's 120-square limit on that side, when the Survey Sheet is off, or when the scene isn't an encounter map.
- **The GM's press asks the runner** (the flag `extend: side`), as Do it does: the extension and the fresh packet need the runner's page on the fight scene. Any GM may press Let it get away and Bring back, which only change documents.
- **Bring back's initiative** is `combat.rollInitiative` on the new combatant, which PF2e rolls with the creature's own initiative statistic.
- **XP not earned** is PF2e's own `calculateXP` for one creature of the monster's level against the party's level (the Build window's suggested level) and the party size setting.

## How it works
- `turn.mjs`: `flee` is in `COSTS`, `MOVES` and `WORD`; `edgeSides(square, size, cols, rows)` says which edges a creature's space touches. In `checkPlan` a flee goes through the move branch (prone, Speed, route and cost like a Stride), then needs `ctx.edgeAt(to, size)` to return at least one side, and sets `fled` so a later step is refused. The resolved step carries `sides`. `describeStep` says so on the card; `doneStep` gives the thinker "reached the map's edge".
- `fight.mjs`: `gather` passes `edgeAt` from `mapSquares(scene)`. In `runTurn`, after `runStride` moved it: short of its square → the usual "stopped" re-plan (also for a flee, though it is the last step); at its square → the request is saved `state: "fled"` with `fled: { sides, at }` and the loop ends. `endAfter` isn't reached, so Auto never ends a fled turn. The stall check treats `fled` as waiting on a person and `extending` as machine work.
- `letGo`: saves `escaped: { name, xp, at }` and a note on the request (the card's leftover note shows it once the turn has passed), `turns.escaped[tokenId]` on the Combat flag, hides the token with `flags.<id>.escaped`, calls `combat.nextTurn()` if it is still that monster's turn, then deletes its combatant (after the turn has passed, so core's bookkeeping sees a combatant removed from before the current one).
- `extendMap`: writes `extend: side` on the request; the runner's `act` sees `fled` with `extend` and runs `runExtend`: `state: "extending"` (busy), the Survey Sheet's `api.extendEncounter(scene, side, 10)` within 90 s, then waits for this page's canvas to be back on the fight scene with the token drawn, settles, and `afterExtend` saves `extended: side` and calls `replan` with the change `{ what: "extended", side }`, not counted against the re-plan limit. The old request ends "done"; the new one carries the done steps (the flee as "reached the map's edge") and the actions left. On a north or west extension every square's number shifts; the change's words tell the thinker to read positions afresh. A runner reload mid-extend: `onRunnerReady` runs `afterExtend` (whether or not the map grew, asking again is right).
- `escapedList` / `bringBack`: escaped tokens are those on the fight's scene with the `escaped` flag and no combatant. Bring back unhides, removes the flag, creates the combatant with `sceneId`, rolls its initiative and writes `turns.escaped[tokenId].returned`.
- `ui/turns.mjs`: state words for `fled` and `extending`; in `fled` the buttons Extend map <side> (one per side, disabled with the reason as its title, the reason also written on the card) and Let it get away, with Play it myself still there; an **Escaped** section below the card with Bring back per token. Presses are noted for the history.
- `history.mjs`: a request with `escaped` gets the line "Escaped: <name> got away (<xp> XP not earned)." (its note is not repeated); `extended` a line that the map was extended; `fled` "At the map's edge, waiting for you." A returned monster gets a "brought back into the fight" line in the round it returned (`t.escaped[tokenId].returned`), in the window and the journal.
- `brain.mjs` / `prompt.mjs`: `flee` is a known step kind; the prompt explains the step, when to use it, the GM's choice, the re-ask after Extend, running toward the edge first, and the fleeing condition.

## Checks
- (fl-1) {unit} `edgeSides` on a 12×12 map (sides, corners, a Large creature, no bounds); `checkPlan`: a flee to the ring accepted with `sides` and a Stride's cost, not on the ring refused, too far refused, not last refused, Stride then flee accepted, no `edgeAt` refused, an ordinary Stride onto the ring carries no `sides`; words of the step, of `doneStep` and of the extended change; stall kinds; `requestBusy`; the prompt and `cleanPlan` know `flee`; history lines for escaped, at the edge and brought back.
- (fl-2) {live} Through `api.fight.checkPlan` on the runner with a Dire Wolf on Claude Test Scene: a flee to a ring square is accepted with the right `sides` (a corner gives two), one square short of the ring refused in words, a flee then a Strike refused as not last, a flee beyond its Speed refused.
- (fl-3) {live} By real clicks as AI, Test Player online: a plan that flees to the west edge (through `fight_plan` or `submitPlan`), Do it: the wolf arrives, the card says it is at the west edge with Extend map west and Let it get away, Do it gone, Play it myself still there; on Auto the same stop (no `nextTurn` within 5 s).
- (fl-4) {live,player} Let it get away: the token hidden (Test Player's page shows no token, `tok.hidden` true), `flags.<id>.escaped` set with round and xp, the combatant gone from the tracker, the turn passed to the next creature with one start, HP and conditions unchanged, no new chat message, the card's leftover note names the XP, the Escaped section lists it, the history window shows the escape line.
- (fl-5) {live} Extend map west at a non-corner square: the card reads extending, the Survey Sheet grows the scene by 10 columns (scene width +1000 px), tokens keep their ground (the wolf's square shifts by 10), a `replan` event with the extended change and the shifted-squares note, the new request has the actions left and the flee as done; the monster's turn is still current. Then at a corner: two Extend buttons.
- (fl-6) {live} Greyed Extend: with the Survey Sheet patched off on the AI page (`game.modules.get` for `lythara-survey-sheet` from this module's stack) or a scene at 120 squares, the button is disabled with the reason as its title and the reason on the card; Let it get away still works.
- (fl-7) {live,player} Bring back: the token shows again where it stands, a combatant with a rolled initiative appears in the tracker in order, the Escaped section empties, the history shows "brought back into the fight" in the current round; Test Player sees the token.
- (fl-8) {live} A reload of the runner while the buttons wait: the card still shows them after it rejoins; a reload during extending: the thinker is asked again once it is back.
- (fl-9) {live} Smoke test as regression (`claude/foundry-smoke-test.md`): an ordinary Stride-and-Strike turn still runs, and a Stride ending on the ring triggers nothing.

## Traps
(none recorded yet)

## Open items
- A Fleeing monster with no reachable edge: the prompt tells the thinker to Stride away from the source; the checker doesn't enforce "away from the source".
- Reactions to a monster's move (Reactive Strike as it flees) are not built, as for every move.
- The thinker gets no hint that the edge is in reach beyond the map's size and its square; it works it out.
- Extend's effect on other hidden tokens: the Survey Sheet shifts every token, hidden ones too; not yet watched live.
