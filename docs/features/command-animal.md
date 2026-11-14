---
feature: command-animal
files: [scripts/command.mjs]
functions: [fight.mjs:traitsOf, fight.mjs:commandCtx, fight.mjs:commandNow, fight.mjs:commandPasses, fight.mjs:commandAtTurn, fight.mjs:runCommand, fight.mjs:commandList, fight.mjs:commandResult, fight.mjs:answerCommand, turn.mjs:nextCommand]
dependsOn: [turn-loop, packet, brain, speech, bands, card-ui, history]
since: 0.30.0
---
Command an Animal (monster minds release 3, tier 3d): a `command-animal` step, a real public Nature check against the animal's Will DC, one simple instruction the animal must carry out on its next turn; a failure passes that turn, a critical failure waits for the GM.

## Decisions
Rhea, 2026-11-11 and 2026-11-12 (the design is in the project's design doc, R3-6, R3-16 and R3-17, with the review's findings 3 and 16; her answers are q-17 and q-18 of the plan):
1. **Animals in a band fight by their own Pack mind, and a handler can spend an action to direct one (R3-6).** The leader's spoken orders don't reach them. Any creature on the animal's side can spend one action on Command an Animal: a real Nature roll against the animal's Will DC for one simple instruction for the animal's next turn ("that one", "over there"). On a failure the animal does nothing that turn; on a critical failure she chooses what it does. Ridden mounts are not part of this.
2. **What counts as an animal: PF2e's `animal` trait only** (over "the Mind pick" and "either"), asked 2026-11-12. The Mind pick is how a creature thinks, not what it is (a worg is a beast). A homebrew creature becomes commandable by adding the trait to its sheet. The animal must be on the handler's side: the rule fails at once on a hostile or unfriendly animal, so such a step is refused before any roll.
3. **She was shown sample pictures before any code** (the step on the handler's card with its roll and result line, the public Nature check in chat, the animal's row reading "commanded: …", the failed turn passed by the module, the critical failure waiting with two buttons) and answered: "They look good". The build follows them:
   - the Nature check is a public roll like any other, and the instruction itself gets no chat line;
   - a step is refused with the reason when the animal is hostile or unfriendly to the handler, can't hear it, or lacks the animal trait (and, from the review, when a player runs the animal or it has no place in the fight's order: no turn of it would ever answer the command);
   - a deafened handler rolls the DC 5 flat check first (Command an Animal is an auditory action);
   - after a failure the module passes the animal's turn (0.29.0's pass request) with a note and **Play it myself**;
   - after a critical failure the turn waits for her with **Play it myself** and **Let Angel plan it** (Angel's addition, shown in the sample).

Settled by Angel, told to Rhea in the release note, hers to change:
- **The instruction is data, never a sentence:** attack a creature the handler perceives, go to a square, or stay. Nothing a GM or Angel writes reaches the animal's thinker through a command.
- **"It must carry it out" is said to the thinker, not enforced by the plan check:** the animal's packet says what it was told and that it spends this turn on it; a plan that ignores it is still accepted (what "as well as it can" means on a given map can't be checked), and the animal's card shows the command so she can see it.
- **One command an animal until its next turn has come.** The rule lets several stack and leaves a clash between two handlers to the GM; a second command is refused with the reason instead.
- **The animal's turn is passed after a failure whether it is ticked for Angel or not** (as a yielded monster's is): the rule says it does nothing. Play it myself stops that.
- **Let Angel plan it** ticks the animal for Angel if it wasn't, and its packet then says the command went wrong and it does something else.
- **An animal set on a creature it doesn't perceive itself** is told so: it can't target it, and moves toward the fight or Seeks.
- **Rules:** Command an Animal, Player Core (https://2e.aonprd.com/Actions.aspx?ID=2400).

## How it works
- **The rules** (`command.mjs`, pure): `cleanCommand` (the instruction as data), `commandWords`, `canCommand` (who can be commanded and why not), `degreeOf`, `outcomeOf` ("obeys", "nothing", "gm"), `commandInForce` and `commandSpent` (a command is for the animal's next turn only), `commandForPacket`, `commandTag`, `resultWords`, `commandLogWords`.
- **Where it is kept:** on the Combat's turns flag, `commands.<animal token>` = `{ by, round, at, instruction, foe?, to?, degree, total, dc, used: { round }, own, angel }`. The runner writes all of it but `own` and `angel`, which are her two buttons. Log lines `commandOwn` and `commandAngel` share the band log (`orders.log`).
- **The step** (`turn.mjs` `checkPlan`; `fight.mjs` `commandCtx`, `runCommand`): `{ do: "command-animal", target: <the animal's label>, instruction: "attack" | "go" | "stay", foe: <a label>, to: [x, y] }`, one action. `commandCtx` gives the check each ally by label with `canCommand`'s answer (the sound test needs the fight's map on the runner's page). `runCommand` looks again as things stand, rolls a deafened handler's flat check, then the handler's Nature statistic against the animal's Will DC with no dialog, as a public roll; the step's record and the animal's command are one write.
- **The animal's turn** (`onTurnChange` → `commandAtTurn`): a command not yet acted on is stamped `used` for this round; one whose round has gone is deleted. A failure calls `passTurn(…, "command")` (the request has `passed: "command"`; `passAfter` ends the turn while `commandPasses` holds). A critical failure returns without asking anyone; `answerCommand(…, "angel")` sets `angel`, and the runner's `act` then asks for the turn. A success goes on as any turn.
- **The packet** (schema 7): `command` after `speech`: `{ from, told, must, unseen? }`, or with `went: "wrong"` after a critical failure handed to Angel.
- **The window** (`ui/turns.mjs`, `commandList`, `commandResult`): the result box under the handler's step (and the same words on the request's note, which is what the card still shows when the command was the plan's last step), the tag on the animal's row, the command on the animal's own card, and a card of its own for a failed command on the animal's turn with the buttons.
- **API** (`commands` under `api.fight`): `list(combat)`, `answer(combat, tokenId, "own" | "angel")`: the GM's buttons, never Angel's door.
- **0.33.1:** the words for an attack command and an unseen foe name "that creature" instead of "it".

## Checks
- (ca-1) {unit} The rules: a command cleaned and in words, who can be commanded and why not, the degrees, what a result means, a command in force for one turn only, the animal's packet block, the row's tag, the handler's result line, the log's lines; the `command-animal` step through the plan check (each refusal, a deafened handler's flat check, one command an animal), `cleanPlan`, the step's record, the done step, the History's line, the prompt.
- (ca-2) {live,shared:turn-loop} The step through `api.fight.checkPlan` on the runner against real creatures: an animal ally accepted; a non-animal ally, an enemy, itself, an animal behind a sound-blocking wall and one already commanded each refused with its reason. Then by a real Do it click as AI: PF2e's Nature check posts publicly from the handler with the animal's Will DC, nothing whispered, no dialog left open; the step's box shows the result line; `commands.<animal>` is on the turns flag.
- (ca-3) {live,shared:packet} A success: the animal's row reads "commanded: …" until its turn; on its turn its packet has `command` (after `speech`, with `told` and `must`), its card shows the command; once that turn is over the row's tag is gone, and the entry leaves the flag when its next turn begins.
- (ca-4) {live} A failure (the d20 fixed on the runner): the animal's row reads "command failed"; at its turn a request with `passed: "command"` and the note, the card with Play it myself, and the turn ends by itself after about 2 s (waiting out a pause) whether the animal is ticked or not; nothing is asked of the thinker. Play it myself pressed in time: the turn doesn't pass, the row reads "yours to play", no request is made for Angel, and the History has the line.
- (ca-5) {live} A critical failure: at the animal's turn nothing is asked and the turn waits; the card has Play it myself and Let Angel plan it. Let Angel plan it: its Angel tick is on, a turn request follows whose `command` block has `went: "wrong"`; Play it myself on a fresh one: nothing is asked. A second GM's press reads "Already done.".
- (ca-6) {live,player} As the test player: the Nature check's card is an ordinary public roll (the DC shown or not by PF2e's own setting), and nothing on the player's page names the instruction.
- (ca-7) {live} A deafened handler: the flat check card first; on a failure the action is spent and no Nature check is rolled.
- (ca-8) {live,shared:brain} A turn planned through `fight_wait` and `fight_plan` with a `command-animal` step is accepted and runs; the hello carries prompt version 30 and packet schema 7.

## Traps
- **A passed turn must stay passed for the thinker.** `onTurnChange` asks for a turn when the only request of the round is a passed one (that is how a yield that ended gets its turn back), and it runs again 1.2 s after every turn change: a failed command she took with Play it myself returns before that, or Angel would be asked for the turn she took.
- **Let Angel plan it ticks the animal first, and the tick's own hook asks for the turn before `angel` is saved:** that call finds a critical failure nobody answered and returns; the save's own update then reaches `act`, which asks again.
- **The public roll's label names the animal only when players may read its name** (not hidden by the GM, its name shown).

## Open items
- No button for a handler she plays herself: a command comes only from a plan (Angel's, or one handed in through the API). She rolls Nature by hand and plays the animal.
- The plan check doesn't enforce the command on the animal's own plan (above).
- An animal that becomes a player's after it was commanded keeps the command on its row until the fight ends (the module no longer plays its turn).
- A Delay by the animal on its commanded turn keeps the command for the turn it comes back to in the same round; one that comes back in a later round has lost it.
- The GM may lower the DC for a friendly animal or a treat (the rule's own words): not offered; she can re-roll by hand.
