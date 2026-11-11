**Developing the Encounter Builder**
How the code works and why, for anyone changing it. What it does for a GM is in the README.

Per-feature detail (decisions, how it works, checks, traps, open items) is in `docs/features/<name>.md`; `guide` prints what a change needs. Releases are recorded in `docs/changes/<version>.md`. This file keeps what applies to the whole module. The pre-migration text is in git at commit 927b98f (0.10.0).

## Layout
`docs/DEVELOPING.md` has the table. In short: pure `brain.mjs` (plans from outside, events, generations), `prompt.mjs` (the thinker's instructions), `area.mjs` (spell areas), `history.mjs` (the GM's history of the fight), `brief.mjs`, `budget.mjs`, `journal.mjs`, `mapread.mjs`, `move.mjs` (distance, routes), `perceive.mjs`, `place.mjs`, `turn.mjs`; Foundry glue `builder.mjs`, `fight.mjs`, `ui/build.mjs`, `ui/turns.mjs`, `ui/history.mjs`, `main.mjs`. Keep new logic pure wherever it can be: `node tools/test/unit.mjs` runs it with no browser. `api.fight.busy()` is what the bridge reads before touching the runner's page: keep it true for any new state with work in flight.
| File | Role | Foundry globals? |
|---|---|---|
| `scripts/brief.mjs` | The brief: `cleanBrief` fills and range-checks it, `expandCreatures` gives one entry per creature | no |
| `scripts/budget.mjs` | Treasure tables, `adjustedLevel`, the running total (`ledgerLine`), `chooseTreasure`, claim and party size notes | no |
| `scripts/journal.mjs` | `journalPages`: the journal as page data. Brief text is escaped here | no |
| `scripts/mapread.mjs` | `buildModel`: the per-square model (footing, cover, exposure, approach, anchors) and its `sees` and `fits` tests; `summarise` | no |
| `scripts/place.mjs` | `layout`: scoring and placement; `nearestFree`, `hiddenNextTo` | no |
| `scripts/builder.mjs` | Gathers documents (`readMap`), resolves creatures, `prepare` (plans, creates nothing), `place`, `clear`, `prepareReplace`, `applyReplace`, previews | yes |
| `scripts/turn.mjs` | A monster's turn as data: `checkPlan` (legality), `describeStep`, `nextAction`, `nextMove`, `nextPosture`, `nextCover`, `nextAbility`, `nextSpell` and `nextArea` (where a step stands); spells: `areaHurt`, `aimText`, `SAVE_MULT`, `spellMultiplier`, `spellActions`, `spellRange`, `spellTargets`; `isMove`, `POSTURES`, `absorbOwn`, `damageOptions`; Take Cover's `coverAfterTaking` and `endsCover`; abilities: `FOLLOW_UPS`, `CHECK_WORD`, `abilityCost`, `lastAction`, `followUpOutcome`; one action at a time: `situationOf`, `changesSince`, `describeChange`, `spentBy`, `doneStep`; `listWords` | no |
| `scripts/area.mjs` | Spell areas: `aimArea` (where an area goes, from the plan), `shapeOf` (PF2e's Region shape, in squares), `squaresNear`, `squaresOf`, `crossesWall`, `caughtBy` (who it catches), `alliesCaught`, `placeable`, `aimWords` | no |
| `scripts/move.mjs` | Moving: `distanceBetween` (PF2e's distance between two creatures), `findRoute` (a Stride's route and cost), `findStep` (a Step's), `footprintAt`, `routeWords`, `headingOf`, `featureNear` (a wall next to a creature's space, for Take Cover) | no |
| `scripts/perceive.mjs` | What a monster perceives: `perceiveOne` (the state for one pair), `sensesOf`, `lightAt`, `packetOf` (the only way anything about others gets into a packet), memory, labels, health words, ability text as plain words | no |
| `scripts/brain.mjs` | The brain interface: `cleanPlan` and `cleanMeta` (a plan and who made it, from outside), the event queue (`nextSeq`, `live`, `pickEvent`, `eventOut`), `listening`, `stale` generations, `hello` | no |
| `scripts/prompt.mjs` | `promptText`: the thinker's instructions, the same for a chat and the API | no |
| `scripts/fight.mjs` | The runner, turn requests on the Combat flag, gathering what a monster senses (`sense`, `buildPacket`), `submitPlan`, `judge`, `doIt`, one action at a time (`runTurn`, `lookAgain`, `replan`), the world a Stride or Step moves in (`mover`, `cantMove`), carrying out a Stride, Step or Crawl (`runStride`), a Stand or Drop Prone (`runPosture`), Take Cover (`runTakeCover`, `takeCover`, ending it with `settleCover` and `endTakeCover`), an ability (`abilityList`, `runAbility`), a spell (`spellBook`, `spellsOf`, `runSpell`, `awaitSave`, `savedDegree`, `saveButton`, `rollSaveOnCard`, `rollFor`, `onMessageUpdate`, `leaveWaiting`), an area spell (`areaCheck`, `coverage`, `solidWalls`, `shapePx`, `placeArea`, `runArea`, `awaitAreaSaves`, `rollSavesOnCard`, `aimAll`, `dropInstantAreas`) and a Strike, applying damage | yes |
| `scripts/history.mjs` | The fight's history for the GM: `historyOf` (rounds, turns, parts, lines from the Combat flag), `stepResult` (one step in full detail), `namer`, `historyHTML` (the window), `journalHTML` (the saved page) | no |
| `scripts/ui/history.mjs` | The Monster Turns history window (`HistoryApp`), `rounds` (gathers the fight and card numbers for `historyOf`), `saveHistory` (the journal), `onPreDeleteCombat` (Save or Discard at End Encounter) | yes |
| `scripts/ui/build.mjs` | The Build Encounter window and the preview loop | yes |
| `scripts/ui/turns.mjs` | The Monster Turns window: who's ticked, and the plan card. It shows the fight on the scene this browser is viewing, so `main.mjs` redraws it on `canvasReady`, a fight or combatant created, updated or deleted, a token deleted, a token's module flags (another GM ticking a box) and every `updateCombat` that matters (0.5.1; before that a scene change left it saying "No fight on this scene") | yes |
| `scripts/main.mjs` | Settings, the left-bar group "Encounters", hooks, API | yes |
The plan's `legal.mjs` is `checkPlan` in `turn.mjs` for now, and covers Strikes, Strides, Steps, Crawls, Stand, Drop Prone, Take Cover, abilities and spells.

## Feature index

Generated by `guide --index`; never edit by hand.

<!-- feature-index:start -->
| Feature | Doc | Owns | Checks |
|---|---|---|---|
| abilities | `docs/features/abilities.md` | 8 functions | 4 |
| ammunition | `docs/features/ammunition.md` | 5 functions | 1 |
| areas | `docs/features/areas.md` | scripts/area.mjs | 8 |
| bands | `docs/features/bands.md` | scripts/bands.mjs, scripts/bandlib.mjs | 9 |
| brain | `docs/features/brain.md` | scripts/brain.mjs, scripts/prompt.mjs | 3 |
| builder | `docs/features/builder.md` | scripts/brief.mjs, scripts/budget.mjs, scripts/journal.mjs, scripts/mapread.mjs, scripts/place.mjs, scripts/builder.mjs, scripts/ui/build.mjs | 7 |
| card-ui | `docs/features/card-ui.md` | scripts/ui/turns.mjs, scripts/ui/ticks.mjs | 3 |
| change | `docs/features/change.md` | 15 functions | 9 |
| distances | `docs/features/distances.md` | 10 functions | 1 |
| fleeing | `docs/features/fleeing.md` | 17 functions | 12 |
| history | `docs/features/history.md` | scripts/history.mjs, scripts/ui/history.mjs | 5 |
| interact-delay | `docs/features/interact-delay.md` | 4 functions | 10 |
| memory | `docs/features/memory.md` | scripts/memory.mjs | 9 |
| minds | `docs/features/minds.md` | scripts/minds.mjs, scripts/library.mjs, scripts/ui/minds.mjs | 10 |
| module | `docs/features/module.md` | scripts/main.mjs | 1 |
| moves | `docs/features/moves.md` | scripts/move.mjs | 24 |
| orders | `docs/features/orders.md` | scripts/orders.mjs | 11 |
| packet | `docs/features/packet.md` | scripts/perceive.mjs | 5 |
| posture | `docs/features/posture.md` | 3 functions | 4 |
| reactions | `docs/features/reactions.md` | scripts/react.mjs, scripts/ui/react.mjs, scripts/ui/chip.mjs | 35 |
| spells | `docs/features/spells.md` | 24 functions | 7 |
| stealth | `docs/features/stealth.md` | 11 functions | 4 |
| strike-damage | `docs/features/strike-damage.md` | 13 functions | 11 |
| take-cover | `docs/features/take-cover.md` | 19 functions | 10 |
| turn-loop | `docs/features/turn-loop.md` | 77 functions | 9 |
<!-- feature-index:end -->

## Data
All flags use the module id as their scope: a made-up scope throws.
- **Tokens:** `built`, `key`, `group`, `role`, `run`, `auto`, `model`, `opus`; `cache` on a cache's token. Per token, not actor, so each monster has its own checkbox later.
- **World settings:** `partySize`, `applyMonsterDamage`, `autoPause`, `reactionTimer` and `runner` (in the settings menu), `treasure` (`manual` by level, `builds` by id), `brain` (`generation`: who is thinking; its old `at` is no longer read), `brainAt` (when the thinker last asked, on the server clock) and `brainLaunch` (the world launch that time was written in, 0.23.0).

## Hooks must return nothing
Core fires `canvasReady` with `Hooks.call`, where a handler returning `false` stops every later handler, from every module. 0.1.0 to 0.2.4 had `c => markReady(id)`, and `Set#delete` returns false for an id it doesn't hold, so on every client the 20 `canvasReady` handlers registered after it never ran. Every hook here has a block body, and `unit.mjs` fails if one doesn't.

## Tests
For flows a change touches, by real clicks as AI, with Test Player in a second tab:
- Regression: the smoke test.
- **Local:** see `tools/test/README.md`.
- **In Foundry:** real clicks in PF2 Test as GM and as Test Player. Check that a real click builds, that threat matches `calculateXP`, that a player sees only what they should, that a hand-placed token survives Rebuild and Clear, and that Extend keeps tokens and notes on their spots.
- Each feature doc's **Checks** lists what to run when it or a feature it shares with changes; `guide --diff` prints the set, and `gate` refuses a release until each id is recorded in the change record.

## Releasing
Bump `version` in `module.json` for every release (the gate refuses an unbumped one). Start with `python3 ../foundry-mod-tools/guide.py start <version>`, then the release's title in quotes and `--plan` with the path of a local copy of the plan doc (checks and writes the plan's Build lock, creates `docs/changes/<version>.md`, switches the pre-push hook on, and prints the page checks in `tools/setup/` to run on every page the chat uses and whether a close-out pass of `docs/unverified.md`, the one running list of unverified items, is due). Before release run `gate`: it runs doccheck (names, ownership, check ids, the generated index), the privacy scan, the unit tests, reads the diff and the record, then builds `dist/lythara-encounter-builder.zip` from the tree and stamps it. The hook refuses a push to `main` that isn't stamped. Install and check as foundry-module-dev section 5 says.

## Rules
Rules: [Combat Threats](https://2e.aonprd.com/Rules.aspx?ID=2716&Redirected=1), [Treasure by Encounter](https://2e.aonprd.com/Rules.aspx?ID=2738), [Treasure by Level](https://2e.aonprd.com/Rules.aspx?ID=2656), [Reactive Strike](https://2e.aonprd.com/Actions.aspx?ID=2256), [Move Actions that Trigger Reactions](https://2e.aonprd.com/Rules.aspx?ID=446), [Imprecise Senses](https://2e.aonprd.com/Rules.aspx?ID=2407), [Perception and Detection](https://2e.aonprd.com/Rules.aspx?ID=2400).

## Labels in design-era text
Some feature docs carry text from the design plan with these labels:
**Labels:** [LIVE] run on PF2 Test on 2026-11-05 (core 14.370, PF2e 8.7.0). [CODE] read in the installed code or repos that day. [RULES] read on Archives of Nethys that day. [DOC] from a project doc, tested earlier and not re-run. [UNVERIFIED] not checked; treat as a guess until tested. [ASSUMPTION] a working choice Rhea can change.

## Keep out of this repo
Campaign content: place names, plot, real test data. The repo is public. Briefs hold campaign text and live in the world, never here.
The privacy scan (`scan.py`) reads the git-ignored `.private-words` and the gate fails closed without it.
