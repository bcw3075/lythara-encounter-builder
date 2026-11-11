---
feature: packet
files: [scripts/perceive.mjs]
functions: [fight.mjs:runnable, fight.mjs:onParty, fight.mjs:kindOf, fight.mjs:nameFor, fight.mjs:hpNow, fight.mjs:tokenOf, fight.mjs:lightOn, fight.mjs:enemiesOf, fight.mjs:sense, fight.mjs:healthWords, fight.mjs:isDeadNow, fight.mjs:wordsFor, fight.mjs:gearOf, fight.mjs:actionsOf, fight.mjs:localize, fight.mjs:alliesOf, fight.mjs:buildPacket, fight.mjs:noteWhatTheySense, fight.mjs:perceived, fight.mjs:cantOpen, fight.mjs:packetExtras, fight.mjs:isDown, fight.mjs:conditionWords, fight.mjs:conditionsOn]
dependsOn: [distances]
since: 0.10.0
---
What a monster perceives: the packet built at the start of its turn, senses, light, memory, labels, health words; `packetOf` is the only way anything about others gets in.

## Decisions
- **No PC's name to the thinker, on either side (0.18.0):** only an NPC no player owns goes by its name (`nameFor`); anything else (a character, a familiar, a player's companion, which are often named after their master or given a pet's name) goes as what it is (`kindOf`: ancestry and class, "Human Fighter", or "familiar", "companion", "party member"): as the `name` in `you` when Angel runs a party member the GM plays, and as an ally's `name` when the one acting fights on the party's side. Monsters' names are unchanged.
- **The party's side gets none of the monsters' minds (0.18.0 review, kept in 0.24.0):** a party member, or an NPC with the party, gets only a profile the GM wrote for it herself (`mindLayers` in library.mjs), never the monsters' library or this encounter's lines.
- **The mind replaces `you.tactics` (0.24.0, schema 2):** `mind` is the packet's first key after `schema`, the same bytes all fight; its free text goes through the name gate (`docs/features/minds.md`).
- **A character's sheet (0.18.0 review):** its Strikes are only those PF2e has ready and visible (a stowed weapon isn't; an NPC's Strikes all count, since a Goblin's worn shortbow shoots), and its abilities include its feats that are actions, free actions or reactions (a character's actions are mostly feats). Before 0.18.0 an NPC fighting with the party got its party allies' names in `allies` (found while building the party-member tick).
- **`you.side: "party"` (0.18.0)** for anything on the party's side (PF2e's `alliance`): a party member the GM plays, or an NPC fighting with the party. The prompt (version 20) tells the thinker what it means. Sides themselves (who is an enemy, who an ally) were already PF2e's `isEnemyOf`/`isAllyOf` from the acting creature, so nothing else changes with the side.

## How it works
- **Earth Glide (0.17.0):** a glider's `you.burrow` also has `glides: true`, `walls` (how the map's walls are known: Survey Sheet's own, judged, or not yet) and, when its scene has walls of its own and none are judged, `judgeWalls` (the same picture fields as `judgeGround`); its `ground` text says rock doesn't stop it, and it is never asked `judgeGround`; `soilHere` means it can go down there (rock included).
- **Burrow (0.16.0):** a monster with a burrow Speed gets `you.burrow` (`below`, `soilHere`, `ground`: how the ground is known, and `judgeGround` when a map the module can't read hasn't been judged), and its ground map marks rock "r" (`groundAround`'s `rockAt`, with `ROCK_KEY` added to the key). A burrowed monster perceives only by tremorsense, only creatures on the ground (`perceiveOne`'s `below` and `aloft`; no sight, hearing or Visioner state reaches it). A burrowed ally is listed with `below: true` though its token is hidden (`knownAllies`, which a Delay's list uses too; not one the GM had hidden before it went down). The ground picture is drawn only on the runner's page (`perceived()` on another GM's page builds the packet without it). Other monsters don't perceive a burrowed creature: its token is hidden, and `enemiesOf` leaves hidden tokens out.
- **Climbing (0.15.0):** `you.climb` = `{ trees: [{ at, top }], up? }`: the trees within the ground window (nearest first, at most 12), each tree's square and its height guess (`treeTop`, `docs/features/moves.md`), and `up: { tree, top }` while it is up one. `you.holding` lists what it holds in its hands (`{ id, name }`, ids a Release names), `you.dropped` the Strikes left out of `you.strikes` because their weapon lies on the ground. All its own; nothing about others changed.
- **Heights (0.13.0):** `you.height` when the monster is off the ground, and `height` (feet above the ground) on anything perceived or hidden in the air and on allies; nothing when on the ground. A hidden creature's space is known, height included. Read by `heightUp` in `buildPacket`; `packetOf` passes it field by field.
- **Hidden allies are left out (0.11.0):** `buildPacket` lists only allies that aren't hidden, so a GM-hidden or escaped ally never reaches the thinker with its square and health; `knownTo` already did the same. See `docs/features/fleeing.md`.
- **The next diagonal in the packet:** `you.nextDiagonal` (5 or 10) says what the monster's next diagonal costs after what it has moved this turn (`nextDiagonalFt`, from the token's movement history), because the thinker can't see that history and a diagonal Step at 10 is refused.
- **"Down" (0.9.0, Rhea):** `healthWord` says "Down" at 0 HP unless the creature is dead (core's Dead status, or a monster at 0 HP that isn't dying or unconscious), where PF2e HUD's list says its word for 0 HP.
Worked out by the module, on the runner, with the fight open. Visioner can't answer it alone: with its automatic system off it says "observed" for a pair with no record, walls or no walls, and a monster token isn't a vision source (tested). Rules: Perception and Detection (https://2e.aonprd.com/Rules.aspx?ID=2400), Light (https://2e.aonprd.com/Rules.aspx?ID=2401).
- **Inputs, per pair (`sense`):** `actor.perception.senses` plus hearing, which PF2e doesn't list on NPCs and the rules give no fixed range; core's `testCollision` centre to centre for sight and for sound; the light at the target; blinded, dazzled, deafened on the monster; invisible and concealed on the target; Visioner's stored state.
- **Light (`lightOn`, `lightAt`):** the scene's level by PF2e's own thresholds (`ScenePF2e.isBright` at 3/4, `isDark` at 1/4), raised by any source whose shape holds the point. A darkness source wins. `GlobalLightSource` doesn't count: PF2e's rule-based levels decide what the scene gives.
- **Visioner on top:** a stored Concealed, Hidden, Undetected or Unnoticed counts if it's worse than what the senses say. A stored Observed says nothing, because it's also the answer for no record. With its automatic system on, its answer is used directly.
- **Hearing makes most things Hidden:** a creature it can't see but can hear is hidden at its exact square, however far, unless a wall blocks sound (Survey Sheet's trunks don't) or Visioner has it undetected from a Sneak. That's the rules with no made-up limit.
- **Who counts:** tokens on the scene that are creatures, not core-hidden, and `isEnemyOf` the monster, in the fight or not. Allies are `isAllyOf`, known by default; a brief's "no shared knowledge" isn't built.
- **The packet (`packetOf`):** observed and concealed show square, size, gear, visible conditions, health word, distance, cover. Hidden shows the square only. Undetected isn't listed; if it has memory, a `memory` line with `lastSeen` and round. Unnoticed: nothing. Everything about others goes through `packetOf`, field by field, so HP, AC, saves, level and names can't get in. `you` is the monster's own sheet. Text in it is data, never instruction. `schema` is checked by whoever reads it.
- **Health words** are PF2e HUD's: its `healthStatusData` setting, or its default list with the markers it would give them.
- **Gear** uses the item's source name, because PF2e builds "+1 Striking Longsword" from the runes.
- **Water (0.14.0):** `you.swimming` ("calm" or "flowing") while its whole footprint is in deep water, and the ground map marks deep water W (calm: a pond or lake) and R (flowing: a river or creek channel), keeping D for other greater difficult terrain (`groundAround`'s `waterAt`, from `waterKinds` in `move.mjs`; how a Swim works is `docs/features/moves.md`).
- **Ground (`groundAround`):** a text map 10 squares around it, from the same `readMap` model the builder uses. Tokens aren't marked, or an unseen one would show as a gap. Allies and what it perceives have squares of their own.
- **Actions (`actionsFor`):** Workbench's sum: 3, plus quickened, less the largest of slowed, stunned and Workbench's `stunReduction` for this round. Workbench lowers stunned at the start of the turn, so reading stunned alone would miss it (tested).
- **Labels and memory:** E and M labels last the whole fight and are given out when first needed. Memory updates at every turn change for every ticked monster, not only on its own turn.
- **A plan can name only labels in its request that it still perceives** (`gather`). `flatDC` adds the check to the step: DC 5 concealed, DC 11 hidden. It's rolled first and logged, and a failure spends the action with no attack (`nextAction`). PF2e and Visioner don't roll it. Undetected can't be targeted yet: picking a square isn't built.
- **Strike ids** come from `strikeIds`: a thrown dagger shares its slug with the melee one, so the second gets `-ranged`.
- **Cover with no dialog works.** Visioner's auto-cover applied on a real Strike by the Shift route: AC 11 became DC 15 behind a test wall, and behind one real trunk with a Shortbow (tested 2026-11-06). So nothing needs passing on, and `getAutoCoverState` is what the packet shows.
- **Not on the fight scene:** `perceived` refuses, and a turn's request says so instead of giving silent wrong answers.
**Design-era text (from the plan; where it and the lines above disagree, the lines above, written from the code, win):**
**Monsters act only on what they perceive**
**Why the mod works this out itself:** with AVS off, Visioner answers "observed" for a pair with no stored state [LIVE, no wall between them; behind a wall not tried]. A monster token isn't a vision source [LIVE]. So: Foundry's sight check on the fight scene, plus light and senses, with Visioner's stored results on top.
| Step | Rule |
|---|---|
| Senses | `actor.perception.senses` [LIVE] **plus hearing as imprecise, added by the mod.** A Dire Wolf lists low-light vision and scent 30 ft, with no hearing [LIVE]. Average hearing is imprecise, and the rules give imprecise senses no fixed range [RULES], so hearing gets no made-up limit |
| Line of sight | Centre to centre with core's `CONFIG.Canvas.polygonBackends.sight.testCollision`, on the runner with the fight scene open. It counts one-way trunk rings once [LIVE, step 1's check below] |
| Light at the target | The scene's level by PF2e's thresholds (bright from 3/4, dark to 1/4), raised by any light source whose shape holds the point, with a darkness source winning. Dim: concealed without low-light or darkvision. Darkness: not seen without darkvision [RULES] |
| Imprecise senses | No sight: at best **hidden**, or undetected if the creature is using Stealth [RULES]. Hearing uses core's sound test: trunk walls have sound NONE [LIVE], so it passes them, and a wall with sound blocks it [LIVE] |
| Vague | Unnoticed becomes undetected, never better [RULES] |
| Visioner on top | `getVisibility(observer, target)`. A stored Concealed, Hidden, Undetected or Unnoticed counts when it's worse than the senses say. A stored Observed says nothing, because it's also the answer for no record, and it overrides walls [DOC] |
| If AVS is on | Visioner's answer is used directly |
Result per pair: `observed / concealed / hidden / undetected / unnoticed`.
**What goes in the packet**
| State | What the monster's packet shows |
|---|---|
| Observed, concealed | Square, size, visible gear, visible conditions, health word |
| Hidden | The exact square only: a hidden creature's space is known [RULES] |
| Undetected | Not listed. If seen earlier: `lastSeen` square and round, which may be wrong, as the rules intend |
| Unnoticed | Nothing at all |
- **Attacks on what it can't clearly see** [RULES]: concealed DC 5 flat, hidden DC 11, undetected means picking a square, with the check and attack secret and no explanation of a miss. Area effects still hit.
- **Memory:** `lastSeen`, kept at every turn change for each ticked monster, on the Combat flag. Things done where the monster could see aren't built. **No `reactionReady` field:** a monster regains its reaction at the start of its own turn, so it would always say yes.
```json
{ "schema": 2,
  "mind": { "pick": {"mind":"animal","worksWith":"pack"}, "mind": "Animal", "goesFor": "the wounded; turns on whoever hurt it last", "worksWith": "With its pack", "notes": "…" },
  "you": { "label": "M1", "name": "Dire Wolf", "square": [18,20], "size": "lg", "actionsLeft": 3,
           "hp": "50/50", "speed": 35, "conditions": [],
           "strikes": [{"id":"jaws","name":"Jaws","mod":[12,7,2],"reach":10,"damage":"1d10 + 5 piercing","traits":["reach-10","unarmed"],"effects":["grab","knockdown"]}],
           "abilities": [{"id":"knockdown","name":"Knockdown","kind":"action","cost":1,"text":"…"}] },
  "allies": [{ "label":"M2", "name":"Goblin Warrior", "square":[16,19], "healthWord":"Barely Hurt", "conditions":[] }],
  "perceived": [{ "label":"E2", "state":"observed", "square":[12,22], "size":"med", "gear":["Longsword"],
                  "conditions":["prone"], "healthWord":"Seen Better Days", "distance":30, "cover":"none" },
                { "label":"E4", "state":"hidden", "square":[9,18] }],
  "memory": [{ "label":"E3", "lastSeen":[11,14], "round":2 }],
  "ground": { "from":[8,10], "rows":["..dd#...","..c....."], "key":"…" },
  "round": 3, "note": null }
```
- **Unusual abilities as text:** every monster's ability text goes in its packet, so a thinker can understand it even if the mod doesn't.
- **Checked during step 1 (2026-11-05):** the module's own sight test against core's `testCollision` on a real woods map agreed on 2,997 of 3,000 pairs, so core counts one-way trunk rings once and sees past one medium trunk, not two. Sight past trunks is no longer unverified.

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
**What a monster perceives:**:
- (pk-5) {live} A party member the GM plays, ticked: its packet has `you.side` "party", its own `name` its ancestry and class (not its name), its allies (the PCs) by label and ancestry and class only, the monsters in `perceived`; scan it for every PC name in the fight.
- (pk-1) {live} `api.fight.perceived(tokenId, combat)` on the runner shows it with no turn needed, so change one thing and read the states: scene darkness at 0.5 and 0.9 with a creature with no senses, one with low-light, one with darkvision; a light on a target; a solid wall with sound on and off; `vis.setVisibility` hidden, undetected, concealed and back; a core-hidden token; invisible, blinded, dazzled.
- (pk-2) {live} Scan a real packet for PC names, HP, AC, level, saves and slots outside `you`, and for a party member's name inside `mind` (0.24.0: a line a GM or Angel wrote goes through the name gate).
- (pk-3) {live} A real Hide changes it, through Visioner's Apply All.
- (pk-4) {live} Flat checks: pass, fail, and stopped by the `.step` hook then resumed, with one flat card.

## Traps
- **Visioner answers "observed" when it has no record,** walls or no walls, so a stored Observed means nothing and counts for nothing. Its automatic system is off, and a monster token isn't a vision source: the module works it out from core's sight and sound tests, the light and the senses, with Visioner's other stored states on top.
- **Memory can land on the Combat flag before any request,** so `turns` always gives `requests` a default. 0.3.5 lost every first request to this, seen only on the Bridge's console.
- **Compendium ability text is mostly `@Localize` keys,** and a Strike's slug isn't unique: a melee and a thrown dagger share one (`strikeIds`). PF2e builds a weapon's name from its runes, so gear uses the source name.
- **Workbench lowers stunned at the start of the turn:** read its `stunReduction` flag too (`actionsFor`), or the lost actions vanish.
- **Anything that shapes words sent to the thinker must use only what the monster knows.** Routes once counted every creature, so a refusal could reveal an invisible PC or a GM-hidden token (found by an independent review, 2026-11-07). Same for distances: PF2e counts height, so a flat copy let a ground monster bite a flyer.
- **The thinker can't see the token's movement history,** so anything that depends on it (the next diagonal's cost) must be in the packet (`you.nextDiagonal`).
- **Do not use Visioner's `explainVisibility`:** it returns an error (`foundry.utils.Ray is not a constructor`) [LIVE].

## Open items
- Attacking undetected by picking a square.
- **Allies:** by default a monster knows where its allies are. A brief marking a group "no shared knowledge" for mindless things [ASSUMPTION] isn't built.
