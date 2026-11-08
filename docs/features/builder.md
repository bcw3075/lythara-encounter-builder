---
feature: builder
files: [scripts/brief.mjs, scripts/budget.mjs, scripts/journal.mjs, scripts/mapread.mjs, scripts/place.mjs, scripts/builder.mjs, scripts/ui/build.mjs]
functions: []
dependsOn: []
since: 0.10.0
---
Building an encounter from a brief: read the map, place monsters, treasure and journal notes, the Build Encounter window.

## Decisions
- Treasure when Notion lists none: the published Treasure by Encounter table with a running total.
**Design-era decisions (from the 2026-11-05/06 plan; the lines above are the skill's summary of the same choices):**
  - **Treasure when Notion lists none:** the published Treasure by Encounter table, with a running total.
- **Party size comes from the Standing Rules (4, counting the GM-run party member).** For a party of 4 the budgets match the rules. For other sizes the Low budget differs: PF2e uses +15 per PC (3 PCs 45, 5 PCs 75) and Archives of Nethys lists +20 [LIVE, RULES]. If the size is ever changed from 4, the dialog must say so.
- **Party level is never taken silently from the Party actor.** It reports level 3 for members at 1, 1 and 7 [LIVE]. The dialog shows the sheets' levels and asks.
- **Mood sets the distance** from the party's entry [ASSUMPTION, starting points to judge on samples]: first contact by about round 2 (40 to 80 ft on a 40×40 map) by default; ambush closer, patrol further, lair wherever its anchor is, standoff with clear space between.

## How it works
- **Scene:** `brief` (the last brief, or one sent from a chat), `build` (`id`, `seed`, `threat`, `rev`, `at`, `entry` the journal id), `design` (a request from Ask Angel with the map summary).
- **Actors, journal, notes:** `built`. Folders carry `own`.
- **Every document a build makes carries `built` = its id.** `clear` deletes only those, by id, so hand-placed things and Survey Sheet's documents stay. A build's actors stay if a token on any scene still uses them.
`surveyRead` calls `api.readEncounterMap` on Lythara Survey Sheet and caches by `rev` and heading, because the read's `entry` follows a live setting. It refuses a `schema` it doesn't know, with a plain message. If the module is missing or too old, or the scene isn't one of its maps, the read is null and the model is partial: walls and regions only, entry at the south edge, no anchors.
**The documents are the truth for anything a GM can edit.** Walls and movement costs come from the scene, not the read, so a hand-drawn wall or region counts. The read supplies what documents can't say: brush, canopy, anchors, the party's heading.
`entry` comes from the party's tokens if any are on the map, otherwise from the read. The preview says which.
**The model**
- **Geometry is in squares, y down,** relative to the map's corner, so Extend's changed offsets don't matter once gathered.
- **`sees`** copies core's rules for what Survey Sheet makes: past one limited wall yes, past two no, a blocking wall stops it. **One-way rings count once:** with `dir` LEFT and vertices clockwise on screen, a point outside has a negative cross product (`facing`). `crosses` is half-open, so a line through a ring's corner still counts once. Core's own sight test needs the canvas on that scene; the pure copy doesn't, so it works from the bridge or with the map closed. On a real woods map it agreed with core's `testCollision` on 2,997 of 3,000 random pairs (the rest grazed a wall's end), which also shows core counts one-way rings as a single wall.
- **`blocked`:** a movement wall crosses the square's middle 70%, so a token doesn't stand on a trunk.
- **`exposure`:** the share of the party's starting squares that can see this square. Five samples around a single entry square, so "in view" isn't judged from one point.
- **`approach`:** walking feet from the entry by Dijkstra, doubling for difficult and tripling for greater, diagonals half as much again (the 5-10 rule, averaged).
- **Height is advisory:** a map is one level, so tokens stay at elevation 0 and high ground has no rules effect.
**Placing**
`layout` scores every square that fits for each creature in role order (guard, brute, ambusher, beast, ranged, caster), so the back line can read where the front went. Same model, creatures and seed give the same layout: "Try another layout" only adds 1 to the seed.
- **First a strict pass:** a creature that doesn't start alert avoids every square the party can see. If nothing fits, a second pass allows them and warns.
- **A guard stays by what it guards** (within `GUARD_REACH` squares), in view or not, and the warning says so. Otherwise a camp in plain sight sent its guard to the far side of the map.
- **`MOOD_WINDOW`** sets the walking distance from the entry: first contact by about round 2. These are starting points to judge on samples.
- **Never** in a wall, on a token, on a footprint that doesn't fit, in deep water without a swim speed, or within 15 ft of walking from the entry.
**The numbers**
- **XP is PF2e's `calculateXP`.** Before placing, levels come from `adjustedLevel`; after placing, from the real tokens. If the rating changes the report says so.
- **Party level is never taken silently from the Party actor,** which reports a level no member has. `suggestedLevel` is the sheets' most common level, and the window shows the sheets and asks.
- **Treasure:** the brief's list first; otherwise Treasure by Encounter (GM Core, https://2e.aonprd.com/Rules.aspx?ID=2738) with Treasure by Level's totals (https://2e.aonprd.com/Rules.aspx?ID=2656). Trivial has no column, so it places none. `chooseTreasure` keeps it sensible: nothing for animals and other things with `NO_CARRY` traits, a cache for a lair. Items are common, within a level of the party's: healing potions and elixirs, and talismans, from the equipment pack; a lair's goods are gems and art from KCTG Trade Goods and the equipment pack, by category, because KCTG's other treasure includes livestock and rubble.
- **`chooseTreasure` doesn't pick permanent items.** The rule borrows their value from other encounters, so those are the GM's or the brief's to place.
**Placing documents**
- `prepare` creates nothing, and ignores the tokens and treasure of the build it would replace. `place` clears the old build first.
- **Tokens are unlinked and the imported actors are copies.** One world actor per creature and adjustment per build, in the "Encounter Builder" folder, never a compendium original. Adjustments use `applyAdjustment` on the copy. Items and coins go on the token's own actor, so each creature carries its own. Conditions for asleep use the token's actor too.
- **A cache** is a loot actor with a core-hidden token. PF2e sets loot actors to LIMITED for all whatever is asked for, which is enough for a player to open it once revealed. Visioner's per-token Stealth DC isn't set by the builder yet.
- **The journal** has no ownership by default. GM truth goes in `section.secret`. Tactics is a page of its own because monster turns will read it each turn, so editing it mid-fight changes the fight. With no brief text it holds only the maths and creature list: it makes up no story.
- **Map notes** only where the brief asks, each with its own page. **A clue players may find has OBSERVER on its page, not LIMITED:** core's `Note#_canView` refuses a page with exact LIMITED unless it's an image, and a double-click then does nothing (tested 14.370). LIMITED on the journal itself would list it in their sidebar, so the journal stays at none and an `activateNote` hook shows the page in a small window, with its @Check links working.
- **Foundry's redraw rule:** never create placeables while a client redraws (see Survey Sheet's DEVELOPING.md). `canvasSettled` waits for `canvasReady` when the GM's canvas is on that scene and a draw just happened.
- **Survey Sheet's redraw** removes only its own `enc` documents, and its Extend shifts everything else, so builder documents move with the map.
**Design-era text (from the plan; where it and the lines above disagree, the lines above, written from the code, win):**
**Step 1: the builder**
**What Survey Sheet must expose (a new release; no drawing changes, no monster logic)**
Today the scene flag stores the generator's inputs: `version, cx, cy, cols, rows, from, tune, features, notes, unknown, cover, slot, rev, drawnFor, yearFrac` [LIVE]. `planEncounter` is exported from its file but not on the API; `encounterInput` and `squareCosts` are private; no hook fires when a map is drawn [LIVE, CODE]. So add:
**`api.readEncounterMap(scene)`**, pure data computed from the same `planEncounter` the draw uses:
| Field | Contents |
|---|---|
| `schema` | Number. The builder refuses a schema it doesn't know, with a plain message |
| `rev` | Changes on each redraw; the builder's cache key |
| `cols, rows, sqFt, pxPerSq, originPx` | Grid and live offsets. Extend changes the offsets, so read them fresh |
| `world` | Centre in miles, source sheet id |
| `when` | Stored `yearFrac` and `drawnFor`. **Must use the stored value, not today's calendar**, so the read matches the picture [CODE] |
| `tune, features, notes, unknown` | From the flag |
| `grids` | One value per square: `terrain` code, `cost` (0 plain, 1 difficult, 2 greater, from `squareCosts`), `elev` in feet, `water`, `canopy` and `brush` share |
| `things` | Trees (square, trunk size, species, dead), big rocks, logs, stones, ruins, outcrops, camps, caves |
| `lines` | Kind and squares crossed. **No line names and no pins**, so nothing named leaks into the builder |
| `entry` | The heading setting and the edge Fight Here would use right now. It's a live world setting, not stored on the map [CODE], so tokens win if the party is already placed |
**Hook `lythara-survey-sheet.encounterDrawn(scene, {rev, reason})`** at the end of build, redraw and Extend. The builder marks its read as stale.
**Fix alongside:** `placeMembers` also skips squares that already hold a token. Today it avoids difficult squares and party members only [CODE], so the party can land on a monster.
**The documents stay the truth for anything the GM can edit.** Walls and regions are read from the scene, not the plan, so a hand-drawn wall counts. Survey Sheet makes one-way trunk rings (NORMAL movement, LIMITED or NORMAL sight, no sound) and `modifyMovementCost` regions with walk and travel set [LIVE, CODE].
**If Survey Sheet is missing or older,** the builder works from walls and regions alone, says the read is partial, and places by open space only.
**What the builder works out from the read**
One pure record per square: **footing** (can stand, cost, for which size; Large needs the whole footprint), **cover score** (trunks, brush, rocks, stones), **exposure** (how many sampled squares near the party's entry can see it), **approach** (walking cost from the entry), **anchors** (camps, caves, ruins, fallen trees, water and road edges). **Height is advisory only:** tokens stay at elevation 0 because a map is one level, so "high ground" is a placement preference with no rules effect.
**The Build dialog and the brief**
GM only, from the "Encounters" control group. **The mod can't read Notion, and campaign content can't live in its public repo,** so every build runs from a brief. The mod doesn't invent creatures.
| Route | How |
|---|---|
| **Ask Angel** (main route) | The dialog sends the map summary as a `design` event through the same wait route as turns. Claude follows lythara-campaign-workflows from Notion and shows Rhea the draft in chat. Once she agrees, it sends the brief. Until the wait route exists (step 3), Claude submits through `run_script` |
| **By hand** | Editable rows: creature (compendium search), count, weak or elite, role. Always works with no chat open |
**The brief holds:** name, beat, and the workflow's why here / what they want / what they were doing / how they retreat; **mood** (ambush, lair, patrol, chase, standoff); creatures (UUID, count, adjustment, role, tactics text, Angel-runs default, Opus suggestion); starting state (alert, hidden, asleep) and anchors; treasure list; journal text by layer (GM truth, what locals believe, what the party can learn).
**The maths, fresh each time**
- `game.pf2e.gm.calculateXP(level, 4, levels, hazards, {})`: four level −1 creatures against a level 1 party of 4 is 80, moderate [LIVE].
- A figure written in Notion is a claim: if it differs from the calculation, the dialog shows both.
- After placing, it re-rates the threat from the real tokens, including adjustments (`actor.applyAdjustment("weak"|"elite")` [LIVE: function exists; DOC: tested]). Workbench's scaler only if a brief asks to re-level.
**Finding creatures**
Search every Actor compendium: Kobold Tunnelrunner exists only in `pf2e.blog-bestiary` [LIVE]. Names repeat (Bandit is level 2 in NPC Core and level 1 in a PFS pack; Skeleton Guard is in two packs [LIVE]), so a brief keeps the UUID once found. Order: world actors and packs, Monster Core and NPC Core, then everything else. Several matches means the dialog asks. Import one world actor per creature and adjustment into a mod-owned folder, flagged; tokens are unlinked; never edit compendium originals.
**Placing**
Scores each square for each role, then places groups together:
| Role | Prefers |
|---|---|
| Ambusher | High cover, low exposure, within two Strides of the expected path |
| Brute | Short approach, open footing |
| Ranged | Clear lines to the entry, cost or water between it and the party |
| Caster or leader | Behind the group, cover, within sight of allies |
| Guard | Next to the anchor it protects |
| Pack beast | Spread to flank, not in a line |
- **Always:** never in a wall, on another token, or on a footprint that doesn't fit; no deep water unless it can swim; no square in the players' first view unless the brief says alert.
- **Preview before any token exists:** highlighted squares as a temporary flagged Drawing, removed on confirm or cancel. "Try another layout" changes only the seed. The same brief and seed give the same layout.
- **Re-place around the party** button, plus a warning if the party lands on or next to a hidden monster. If the party isn't placed, entry comes from `entry` and the preview says so.
- **Hidden starts** use core `hidden`, plus Visioner states once a fight starts. Scripted Stealth initiative is blocked by Visioner's cover prompt when that setting is on [DOC]; it's off in PF2 Test and on in pf2, so leave those rolls to Rhea's normal flow and test before go-live.
**Treasure**
1. **Notion first.** If the brief lists treasure, that's what gets placed.
2. **Otherwise the published Treasure by Encounter table** [RULES; optional rule meant for single encounters and sandbox play]. Level 1: Low 13 gp, Moderate 18, Severe 26, Extreme 35. Level 2: 23, 30, 45, 60. Level 3: 38, 50, 75, 100. Read higher levels from the rules page when building. There's no Trivial column, so trivial fights place none [ASSUMPTION]. The rules expect some encounters to carry nothing, and permanent items have to borrow from other encounters' value.
3. **Nothing random where it should make sense:** wolves carry nothing, a bandit carries coins and a weapon, a lair has a cache.
4. **Items** from `pf2e.equipment-srd` (6,003 entries [LIVE]) and KCTG trade goods (1,044, by UUID because names repeat [LIVE, DOC]). Levels stay within Treasure by Level's bands. Common only unless the brief says.
5. **Running total** per party level against the level's total (175 gp at level 1 [RULES]); warns before overspending. Treasure Rhea adds by hand in Notion counts against the same total, so the dialog shows it and lets her adjust it.
6. **Where it goes:** on creatures that would carry it (Lootable NPCs is on [LIVE]), or a flagged loot actor at an anchor. A cache can be hidden with Visioner's Stealth DC on loot tokens (on in PF2 Test [LIVE]). Not Droppeth, which uses the GM's viewed scene [DOC].
**Journal and map notes**
One JournalEntry per build, in a mod-owned folder, default ownership none, linked as the scene's journal.
- **Pages:** Overview (threat maths, setup), **Tactics**, What can be learned (by layer), Treasure.
- **The Tactics page is what the packet reads on each of that monster's turns,** so Rhea can edit tactics mid-fight and change the fight.
- GM-only text goes in `section.secret`, verified absent from a player's page [DOC]. Checks as `@Check` links.
- Map notes only where the brief asks. GM-only by default. A player-visible clue has **OBSERVER** on its page, not LIMITED: core refuses to view a page at exact LIMITED unless it's an image [LIVE, corrected 2026-11-05]. The module opens the page itself, so the journal stays out of the player's sidebar.
- With no brief text, it writes only the maths and creature list. It doesn't make up story. Nothing is written to Notion.
**Rebuild and living with Survey Sheet**
- Rebuild and Clear delete only documents flagged with that build id, by id. Hand-placed tokens and Survey Sheet's own documents are untouched.
- Survey Sheet's redraw removes only its own `enc` documents, and Extend shifts everything else [DOC], so builder documents move with the map.
- **Never create placeables right after an update that redraws clients** (the pale-patch bug, section 8.3). If Build follows Fight Here, wait for `canvasReady` on the active GM. (Building stays in the browser of the GM who clicks Build.)
**Step 1 is done when:** from a real click on a real map, a brief makes tokens, journal and loot; the threat matches `calculateXP`; a player sees only what they should; a hand-placed token survives Rebuild and Clear; Extend keeps tokens and notes on their spots.

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (bu-1) {live} Encounters group: Build (search, rows, threat line), Preview, Try another layout, Cancel, Place; Re-place; Journal; Clear with Yes.
- (bu-2) {unit} The threat equals `calculateXP` on the real tokens.
- (bu-3) {live} A brief through `api.submitBrief` from the bridge shows in an open window.
- (bu-4) {live} Rebuild and Clear leave a hand-placed token and note alone.
- (bu-5) {live} Extend keeps tokens and notes on their spots.
- (bu-6) {live,player} As the player: no Encounters group, hidden tokens and the GM note not on their canvas, the journal not in their sidebar, a clue opens with a real hover then double-click, a revealed cache opens.
- (bu-7) {unit} Local: `node tools/test/unit.mjs`, then `python3 tools/test/contact.py` and look at the picture after any scoring change.

## Traps
- `scene.tokens` and the like are collections: `.map` and `.filter` work, `.flatMap` doesn't. Use `.contents`.
- A clue page at exact LIMITED shows its note but can't be opened: core's `Note#_canView` allows that only for images. Use OBSERVER on the page; the journal stays at none.
- PF2e sets loot actors to LIMITED for all whatever you pass. A player's `actor.visible` is still false, so it stays out of their sidebar.
- Compendium names repeat, and world actors come first in a search. A brief keeps the UUID.
- KCTG Trade Goods' "treasure" includes livestock and rubble, and consumables "other" include blank runestones. Filter by category.
- The first Preview after a reload takes about 3 s while indexes load.
- A map in plain view gives "every free square is in the party's first view". That's true, not a bug: an open field has nowhere to hide.

## Open items
- A real encounter from Notion.
- Visioner's per-token Stealth DC on a cache.
- Hazards.
