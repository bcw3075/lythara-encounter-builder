---
feature: starts
files: [scripts/start.mjs]
functions: [fight.mjs:startOf, fight.mjs:startsAtStart, fight.mjs:setStart, fight.mjs:passesStill, fight.mjs:wakeLine, fight.mjs:fightNoisy, fight.mjs:wakeAtTurn, fight.mjs:wakeOnHarm]
dependsOn: [builder, minds, turn-loop, packet]
since: 0.41.0
---
How a monster starts a fight (F-3): Alert, Hidden, Unaware or Asleep; what it holds at the start; the line its mind carries all fight; a sleeper waking by the rules.

## Decisions
- **Weapons out at the start are set by the start (F-3, Rhea 2026-11-24, 12:50 AM, "A for sure"; Angel's recommendation, chosen over "always drawn" and "Angel decides at the look"):** Alert or Hidden hold their main weapon (a ranged row its ranged weapon, as since 0.33.2); Asleep holds nothing, so it must Draw. Monsters placed by hand get the same rule at the fight's start.
- **Unaware, a fourth start (Rhea, 12:51 AM: "There deffently needs to be another option in there for them being awake but nor expecting trouble"):** awake, placed out of the party's first view like Asleep, weapons put away (it must Draw), not Unconscious, initiative on Perception as usual.
- **Fully part of its mind (Rhea, 12:53 AM: "make sure it's fully intergrated in with the monster minds"):** its packet says how it started (the `started` line of `mind`), Monster Minds shows and sets it on the monster's page (the Starts row), and the fight-start look weighs it.
- **A sleeper wakes by the Unconscious condition's own rules** (PF2e's condition text, Player Core, read from `pf2e.conditionitems` on the live server, 2026-11-24, as Archives of Nethys couldn't be reached from the build's machine): damage (unless it drops it to 0 HP), healing, an ally's Interact, or a Perception check against the noise's DC at the start of its turn; with creatures keeping quiet the check is against their Stealth DCs.
- **Angel's calls on the small points (2026-11-24, recorded for Rhea):**
  - The noise DC of a fight is a world setting, "Noise DC to wake a sleeping monster", default 10 (the Simple DC for an untrained task: a fight next to it is easy to hear). A fight counts as noisy once an attack, damage, a save or a spell has been rolled in it; before that the check is against the lowest Stealth DC of its foes in the fight. With both, the lower DC (the rule's "lowest DC if there is more than one noise").
  - The wake check is public (no whispered cards, the module's rule) and rolled once a turn, kept on the fight (the fight's `wakes` (turns flag)), so a reload reads the same roll.
  - Still asleep, its turn passes by itself as a yielded one does (`passTurn` with `asleep`); awake, the turn goes on as any.
  - An ally waking it with an Interact goes through the Interact card for the GM to apply (the module can't carry an Interact out); the prompt tells the thinker it can.
  - The "main weapon" of a monster placed by hand is the weapon of the first Strike on its stat block; of a built row, a ranged row's first ranged weapon, else its first Strike's weapon if melee, else its first melee weapon. A shield stays in the other hand of a one-handed melee weapon; a bow or a two-handed weapon gets both hands.
  - A start set in Monster Minds is applied at once (gear, Unconscious on or off, the build's hidden start on or off) and can't be changed once its fight has started.

## How it works
- **Where a start comes from (`startOf`):** the fight's record (the fight's `starts` (turns flag), written once at the fight's start on the runner), else the token's `start` flag (the build, or Monster Minds' `setStart`), else read from the token (`deriveStart`: Unconscious and not dying with HP left is Asleep, `startHidden` is Hidden, anything else Alert). A monster placed by hand is never read as Unaware: set it in Monster Minds.
- **Gear (`readyGear` in start.mjs):** armed starts hold `mainWeapon`'s pick and put everything else held back to worn (keeping a shield with a one-handed melee weapon); unarmed starts put everything held back to worn. The build calls it for every token it places, before Unconscious for Asleep, and marks the token `readied`; `startsAtStart` calls it at the fight's start for each NPC in the fight not yet `readied` (placed by hand). Party members and players' characters are left alone.
- **The mind's `started` line (packet schema 11, prompt 37):** `startWords` in the monster's own pronoun, for every monster that isn't on the party's side, added to its `mind` in `buildPacket`. For a sleeper it adds "still asleep" or the round it woke (the fight's `woke` (turns flag)). The look's packets carry the same `mind`, and its instructions ask it to weigh the line.
- **A sleeper's turn (`wakeAtTurn` in `onTurnChange`, before the request):** only for a ticked monster still asleep (`asleepNow`: Unconscious, not dying, HP left). PF2e's own Perception roll (`actor.perception.roll` with the DC, no dialog). Success takes Unconscious off (Prone stays: it must Stand); failure passes the turn with the roll in the note.
- **Damage or healing (`wakeOnHarm`, `updateActor` on the runner):** an NPC in a started fight, asleep, whose HP changed: Unconscious comes off and the fight's `woke` (turns flag) gets the round.
- **Monster Minds' Starts row:** for the monsters the page is for (not the party's side); a list before their fight, the fight's record once it has started ("as this fight began").

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (sa-1) {unit} `node tools/test/unit.mjs`: the four starts in order and the same as the brief's; a start read from a monster placed by hand; the main weapon by role and first Strike; the started line in the monster's pronoun with a sleeper's state; the noise DC; the prompt's lines.
- (sa-2) {live} A build with one row of each start: Alert and Hidden hold their main weapon (a ranged row its bow), Unaware and Asleep hold nothing, Asleep is Unconscious, Unaware isn't; each token's `start` and `readied` flags; Unaware placed out of the party's first view.
- (sa-3) {live} A monster placed by hand with its weapon worn: at the fight's start its main weapon is in hand and the fight's `starts` (turns flag) records it as Alert; one set to Unaware in Monster Minds first holds nothing.
- (sa-4) {live} On the runner: a ticked monster's packet has `mind.started` with its start in its own pronoun; a sleeper's says "still asleep", then the round it woke.
- (sa-5) {live} A sleeper's turn: the public Perception card against the right DC (a quiet fight's lowest Stealth DC, then the setting's once a Strike has been rolled); a failure passes the turn with the roll in the note; a success takes Unconscious off and the turn is planned. Damage to a sleeper takes Unconscious off.
- (sa-6) {live} Monster Minds by real clicks: the Starts row shows the start; changing it applies at once (gear, Unconscious, hidden); during the fight it shows the fight's record and can't be changed.

## Traps
- `pro()` capitalises only a capital marker: a sentence after a full stop starts with `{They}`; after a creature's name write the verb plainly ("is"), as the other turn notes do (0.41.0 live test).
- the fight's `wakes` (turns flag) keys are `<round>-<combatantId>`: a dot in a flag key makes a nested path.

## Open items
- Rhea to judge the noise DC's default (10) on a real fight.
- An effect that makes a creature sleep too deeply for the Perception check (the rule's exception) isn't recognised: such a monster still rolls.
