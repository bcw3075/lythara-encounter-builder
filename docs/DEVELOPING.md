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
| `scripts/ui/build.mjs` | The Build Encounter window and the preview loop | yes |
| `scripts/main.mjs` | Settings, the left-bar group "Encounters", hooks, API | yes |

The plan for the steps after this one (monster turns, the chat route, the API route) leaves room for `legal.mjs`, `perceive.mjs` and `brain.mjs`. They don't exist yet.

## Data

All flags use the module id as their scope: a made-up scope throws.
- **Scene:** `brief` (the last brief, or one sent from a chat), `build` (`id`, `seed`, `threat`, `rev`, `at`, `entry` the journal id), `design` (a request from Ask Angel with the map summary).
- **Tokens:** `built`, `key`, `group`, `role`, `run`, `auto`, `model`, `opus`; `cache` on a cache's token. Per token, not actor, so each monster has its own checkbox later.
- **Actors, journal, notes:** `built`. Folders carry `own`.
- **World settings:** `partySize` (in the settings menu), `treasure` (`manual` by level, `builds` by id).
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
- **Treasure:** the brief's list first; otherwise Treasure by Encounter (GM Core, https://2e.aonprd.com/Rules.aspx?ID=2738) with Treasure by Level's totals (https://2e.aonprd.com/Rules.aspx?ID=2656). Trivial has no column, so it places none. `chooseTreasure` keeps it sensible: nothing for animals and other things with `NO_CARRY` traits, a cache for a lair. Items are common, within a level of the party's: potions, elixirs, talismans and oils from the equipment pack; a lair's goods come from KCTG Trade Goods when active.
- **`chooseTreasure` doesn't pick permanent items.** The rule borrows their value from other encounters, so those are the GM's or the brief's to place.

## Placing documents
- `prepare` creates nothing. `place` clears the old build first.
- **Tokens are unlinked and the imported actors are copies.** One world actor per creature and adjustment per build, in the "Encounter Builder" folder, never a compendium original. Adjustments use `applyAdjustment` on the copy. Items and coins go on the token's own actor, so each creature carries its own. Conditions for asleep use the token's actor too.
- **A cache** is a loot actor with a core-hidden token. It has OBSERVER for all so players can open it once revealed. Visioner's per-token Stealth DC isn't set by the builder yet.
- **The journal** has no ownership by default. GM truth goes in `section.secret`. Tactics is a page of its own because monster turns will read it each turn, so editing it mid-fight changes the fight. With no brief text it holds only the maths and creature list: it makes up no story.
- **Map notes** only where the brief asks, each with its own page. A clue players may find has LIMITED on its page.
- **Foundry's redraw rule:** never create placeables while a client redraws (see Survey Sheet's DEVELOPING.md). `canvasSettled` waits for `canvasReady` when the GM's canvas is on that scene and a draw just happened.
- **Survey Sheet's redraw** removes only its own `enc` documents, and its Extend shifts everything else, so builder documents move with the map.

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
