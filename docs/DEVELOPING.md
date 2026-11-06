# Developing the Encounter Builder

How the code works and why, for anyone changing it. What it does for a GM is in the README.

## Layout

| File | Role | Foundry globals? |
|---|---|---|
| `scripts/brief.mjs` | The brief: `cleanBrief` fills and range-checks it, `expandCreatures` gives one entry per creature | no |
| `scripts/budget.mjs` | Treasure tables, `adjustedLevel`, the running total (`ledgerLine`), `chooseTreasure`, claim and party size notes | no |
| `scripts/journal.mjs` | `journalPages`: the journal as page data. Brief text is escaped here | no |
| `scripts/mapread.mjs` | `buildModel`: the per-square model (footing, cover, exposure, approach, anchors) and its `sees` and `fits` tests; `summarise` | no |
| `scripts/place.mjs` | `layout`: scoring and placement; `nearestFree`, `hiddenNextTo` | no |
| `scripts/builder.mjs` | Gathers documents (`readMap`), resolves creatures, `prepare` (plans, creates nothing), `place`, `clear`, `prepareReplace`, `applyReplace`, previews | yes |
| `scripts/turn.mjs` | A monster's turn as data: `checkPlan` (legality), `describeStep`, `nextAction` (where a step stands), `damageOptions` | no |
| `scripts/fight.mjs` | The runner, turn requests on the Combat flag, `submitPlan`, `judge`, `doIt`, carrying out a Strike, applying damage | yes |
| `scripts/ui/build.mjs` | The Build Encounter window and the preview loop | yes |
| `scripts/ui/turns.mjs` | The Monster Turns window: who's ticked, and the plan card | yes |
| `scripts/main.mjs` | Settings, the left-bar group "Encounters", hooks, API | yes |

The plan leaves room for `perceive.mjs` and `brain.mjs`, which don't exist yet. Its `legal.mjs` is `checkPlan` in `turn.mjs` for now, and covers Strikes only.

## Data

All flags use the module id as their scope: a made-up scope throws.
- **Scene:** `brief` (the last brief, or one sent from a chat), `build` (`id`, `seed`, `threat`, `rev`, `at`, `entry` the journal id), `design` (a request from Ask Angel with the map summary).
- **Tokens:** `built`, `key`, `group`, `role`, `run`, `auto`, `model`, `opus`; `cache` on a cache's token. Per token, not actor, so each monster has its own checkbox later.
- **Actors, journal, notes:** `built`. Folders carry `own`.
- **Combat:** `turns.requests`, one per monster turn: `state`, `combatantId`, `tokenId`, `round`, `turn`, `labels` (E1 and so on, to token ids), `plan`, `steps`, `verdict`, `note`, `go`, `hold`, and `log` by step. It goes with the fight.
- **World settings:** `partySize`, `applyMonsterDamage` and `runner` (in the settings menu), `treasure` (`manual` by level, `builds` by id).
- **Every document a build makes carries `built` = its id.** `clear` deletes only those, by id, so hand-placed things and Survey Sheet's documents stay. A build's actors stay if a token on any scene still uses them.

## Reading the map
`surveyRead` calls `api.readEncounterMap` on Lythara Survey Sheet and caches by `rev` and heading, because the read's `entry` follows a live setting. It refuses a `schema` it doesn't know, with a plain message. If the module is missing or too old, or the scene isn't one of its maps, the read is null and the model is partial: walls and regions only, entry at the south edge, no anchors.

**The documents are the truth for anything a GM can edit.** Walls and movement costs come from the scene, not the read, so a hand-drawn wall or region counts. The read supplies what documents can't say: brush, canopy, anchors, the party's heading.

`entry` comes from the party's tokens if any are on the map, otherwise from the read. The preview says which.

## The model
- **Geometry is in squares, y down,** relative to the map's corner, so Extend's changed offsets don't matter once gathered.
- **`sees`** copies core's rules for what Survey Sheet makes: past one limited wall yes, past two no, a blocking wall stops it. **One-way rings count once:** with `dir` LEFT and vertices clockwise on screen, a point outside has a negative cross product (`facing`). `crosses` is half-open, so a line through a ring's corner still counts once. Core's own sight test needs the canvas on that scene; the pure copy doesn't, so it works from the bridge or with the map closed. On a real woods map it agreed with core's `testCollision` on 2,997 of 3,000 random pairs (the rest grazed a wall's end), which also shows core counts one-way rings as a single wall.
- **`blocked`:** a movement wall crosses the square's middle 70%, so a token doesn't stand on a trunk.
- **`exposure`:** the share of the party's starting squares that can see this square. Five samples around a single entry square, so "in view" isn't judged from one point.
- **`approach`:** walking feet from the entry by Dijkstra, doubling for difficult and tripling for greater, diagonals half as much again (the 5-10 rule, averaged).
- **Height is advisory:** a map is one level, so tokens stay at elevation 0 and high ground has no rules effect.

## Placing
`layout` scores every square that fits for each creature in role order (guard, brute, ambusher, beast, ranged, caster), so the back line can read where the front went. Same model, creatures and seed give the same layout: "Try another layout" only adds 1 to the seed.
- **First a strict pass:** a creature that doesn't start alert avoids every square the party can see. If nothing fits, a second pass allows them and warns.
- **A guard stays by what it guards** (within `GUARD_REACH` squares), in view or not, and the warning says so. Otherwise a camp in plain sight sent its guard to the far side of the map.
- **`MOOD_WINDOW`** sets the walking distance from the entry: first contact by about round 2. These are starting points to judge on samples.
- **Never** in a wall, on a token, on a footprint that doesn't fit, in deep water without a swim speed, or within 15 ft of walking from the entry.

## The numbers
- **XP is PF2e's `calculateXP`.** Before placing, levels come from `adjustedLevel`; after placing, from the real tokens. If the rating changes the report says so.
- **Party level is never taken silently from the Party actor,** which reports a level no member has. `suggestedLevel` is the sheets' most common level, and the window shows the sheets and asks.
- **Treasure:** the brief's list first; otherwise Treasure by Encounter (GM Core, https://2e.aonprd.com/Rules.aspx?ID=2738) with Treasure by Level's totals (https://2e.aonprd.com/Rules.aspx?ID=2656). Trivial has no column, so it places none. `chooseTreasure` keeps it sensible: nothing for animals and other things with `NO_CARRY` traits, a cache for a lair. Items are common, within a level of the party's: healing potions and elixirs, and talismans, from the equipment pack; a lair's goods are gems and art from KCTG Trade Goods and the equipment pack, by category, because KCTG's other treasure includes livestock and rubble.
- **`chooseTreasure` doesn't pick permanent items.** The rule borrows their value from other encounters, so those are the GM's or the brief's to place.

## Placing documents
- `prepare` creates nothing, and ignores the tokens and treasure of the build it would replace. `place` clears the old build first.
- **Tokens are unlinked and the imported actors are copies.** One world actor per creature and adjustment per build, in the "Encounter Builder" folder, never a compendium original. Adjustments use `applyAdjustment` on the copy. Items and coins go on the token's own actor, so each creature carries its own. Conditions for asleep use the token's actor too.
- **A cache** is a loot actor with a core-hidden token. PF2e sets loot actors to LIMITED for all whatever is asked for, which is enough for a player to open it once revealed. Visioner's per-token Stealth DC isn't set by the builder yet.
- **The journal** has no ownership by default. GM truth goes in `section.secret`. Tactics is a page of its own because monster turns will read it each turn, so editing it mid-fight changes the fight. With no brief text it holds only the maths and creature list: it makes up no story.
- **Map notes** only where the brief asks, each with its own page. **A clue players may find has OBSERVER on its page, not LIMITED:** core's `Note#_canView` refuses a page with exact LIMITED unless it's an image, and a double-click then does nothing (tested 14.370). LIMITED on the journal itself would list it in their sidebar, so the journal stays at none and an `activateNote` hook shows the page in a small window, with its @Check links working.
- **Foundry's redraw rule:** never create placeables while a client redraws (see Survey Sheet's DEVELOPING.md). `canvasSettled` waits for `canvasReady` when the GM's canvas is on that scene and a draw just happened.
- **Survey Sheet's redraw** removes only its own `enc` documents, and its Extend shifts everything else, so builder documents move with the map.

## A monster's turn (so far: Strikes)
- **The runner does the work.** The `runner` setting names one GM account, Claude Bridge by default. Only that account's page creates requests, judges plans and carries out turns. Any other GM's Do it writes `go` on the request and the runner picks it up from `updateCombat`. If the runner is offline or doesn't exist, `runnerProblem` gives the words, the card shows them, Do it is disabled, and nothing runs anywhere else. Foundry's active GM can't be chosen, which is why the module names its own. PF2e's and Workbench's own automations still run on the active GM.
- **A turn starts:** the runner sees `turn` or `round` change in `updateCombat`, because `pf2e.startTurn` fires on the active GM only. Also when a monster is ticked during its own turn, and when the runner's page loads. A short wait, then a request in state `requested`. How long start-of-turn effects really need is still to be measured.
- **By round and combatant, not turn number.** Workbench moves a PC's initiative at 0 HP, which changes `combat.turn` in the middle of a monster's turn. `currentOf` and the guard in `onTurnChange` use the combatant so that doesn't start a second request or hide the card.
- **The scene:** `ensureScene` opens the fight scene on the runner before anything that uses the canvas, because activating any scene pulls that page along and Visioner answers "observed" for tokens it can't find. A view takes about 1 to 3 s. Map jobs (a sheet redraw, the exploration carry) don't move the view and a Strike during one wasn't slowed (measured 2026-11-05). If it can't open, the card says so.
- **The plan:** any GM may call `api.fight.submitPlan`; the runner's `judge` checks it. `ready` shows the card.
- **Who sees it:** players' browsers do receive the Combat flag, plans included (read as Test Player). Accepted among friends; nothing shows in their UI.
- **Only the module rolls damage.** Workbench's auto-damage would roll on the card author's browser, with the dialog if that user has dialogs on. So `preCreateChatMessage` adds Workbench's own `noAutoDamageRoll` flag to this module's attack cards, and the module always rolls. One roller, one card, whatever anyone's settings. If Workbench drops that flag you'd see a second damage card, but not double HP, because Workbench never applies damage. Test D1 catches it; re-run D1 after any PF2e, Workbench or Toolbelt update.
- **No dialogs:** a click event with `shiftKey` equal to the user's dialog setting, because PF2e flips on Shift. `skipDialog` doesn't work.
- **A prompt nobody can click:** a roll waits for its dialog for ever, and nobody can click the runner's page. `watched` gives each stage `STEP_MS`, stops at once if a window that looks like a dialog appears, closes what appeared (a closed Modifier dialog makes the roll return with no card), and the record then says the stage may not have finished, so it goes to Rhea with the window's title and nothing repeats. PF2e's Modifier dialog is a v1 app in `ui.windows`, not in `foundry.applications.instances`, so both are watched.
- **Real targets:** `aimAt` targets on the runner's own account before each attack and damage roll, and `stopAiming` clears them after the turn. Each account has its own targets, so a GM's are never touched. That clears Workbench's targeting reminder (at "mustTarget" an untargeted Strike is cancelled outright, tested). **With automatic damage on, `dropRow` takes Toolbelt's Target Helper row off the module's damage card once it's made:** a row's Damage button applied a second time after the module had applied it, even once Toolbelt marked the row applied (tested), and its Block button comes too late to work. Toolbelt fills the row from the roll's target whatever the account's targets are, in a `preCreateChatMessage` hook that runs after this module's, so taking it off afterwards doesn't depend on hook order. If Toolbelt renames its flag, the row simply stays. With automatic damage off, the row stays and is how the GM applies it. A player's own cards aren't touched. PF2e's own Damage button shows on a card with no row, and applies again if clicked. Others see the runner's target mark on the token during the turn.
- **Applying** copies PF2e's Damage button (`applyFromCard`) for a named target: contextual clone, roll options from the card, item, outcome. It doesn't read effects that count only for one hit, because PF2e's `extractEphemeralEffects` isn't exported.
- **One run at a time:** `judge` and `doIt` each guard by request id in memory. With Auto on, the `updateCombat` hook and the submitter both reached `judge` and rolled the first attack twice, which the D1 matrix didn't catch because it didn't use Auto. D1 now includes it.
- **Only this turn on the card:** `currentRequest` is this round and turn's unfinished request, and `latestNote` only the latest finished turn's note. Both came from an old turn showing up as if it were current: a stopped request after Play it myself, and a 0 HP warning while the hero stood at 5.
- **Never twice:** `save` writes each stage to `log` before moving on, and `nextAction` reads it. `started` with no attack, `damageStarted` with no card, or `applying` with no `applied` means it can't tell, so the card stops and asks. A reload at any point resumes from there through Do it.
- **The `lythara-encounter-builder.step` hook** fires before each stage; return false to stop there. The reload tests use it.
- **Saves use `{ render: false }`** so each stage doesn't redraw the tracker. Whether that's fully quiet with PF2e HUD open isn't checked yet. **Saves send only the change:** two browsers write to a request now, so a whole copy could put back what the other just wrote.
- **A reload:** on the runner's `ready`, a request still `running` becomes `stopped` with a note, and Do it carries on from the record. A `go` or a plan left waiting is picked up.

## Hooks must return nothing
Core fires `canvasReady` with `Hooks.call`, where a handler returning `false` stops every later handler, from every module. 0.1.0 to 0.2.4 had `c => markReady(id)`, and `Set#delete` returns false for an id it doesn't hold, so on every client the 20 `canvasReady` handlers registered after it never ran. Every hook here has a block body, and `unit.mjs` fails if one doesn't.

## Tests
- **Local:** see `tools/test/README.md`.
- **In Foundry:** real clicks in PF2 Test as GM and as Test Player. Check that a real click builds, that threat matches `calculateXP`, that a player sees only what they should, that a hand-placed token survives Rebuild and Clear, and that Extend keeps tokens and notes on their spots.

## Releasing
Run `python3 tools/doccheck.py` (it lists names here that are gone from the code) and reread what the change touched. Bump `version` in `module.json`, then rebuild the zip the manifest downloads:

```sh
rm dist/lythara-encounter-builder.zip && zip -qr dist/lythara-encounter-builder.zip module.json scripts
```

## Keep out of this repo
Campaign content: place names, plot, real test data. The repo is public. Briefs hold campaign text and live in the world, never here.
