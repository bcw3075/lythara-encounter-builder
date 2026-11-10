---
feature: module
files: [scripts/main.mjs]
functions: []
dependsOn: []
since: 0.10.0
---
The module's glue: settings, the Encounters left-bar group, hooks and the `api` (`main.mjs`).

## Decisions
(none recorded yet)

## How it works
- **Monsters' reactions (0.21.0):** `main.mjs` adds the runner's hooks `moveToken`, `updateItem`, `deleteItem` and a third reader of `createChatMessage` (`onActionCard`), all with block bodies, and the API's `fight.reactions`, `fight.doReaction`, `fight.skipReaction`. No new setting.
- **Reactions (0.20.0):** the world setting `reactionTimer` ("Time to answer a reaction", 0 to 60 in steps of 5, default 20, 0 = no countdown; since 0.20.1 its hint says the GM's own rows have none), `"socket": true` in `module.json`, `game.socket.on("module.<id>")` in `ready` handing messages to `onSocket`, and the `<id>.reactionPrompt` hook for the player's window (`docs/features/reactions.md`).
- **`deleteCombat` (0.18.0):** besides redrawing Monster Turns, the runner clears a party member's Angel and Auto ticks (`untickParty`, `docs/features/turn-loop.md`).
- **`pauseGame` hook (0.11.0):** redraws the Monster Turns window, whose card says when Auto is waiting on the game's pause (`docs/features/turn-loop.md`).
**Design-era text (from the plan; where it and the lines above disagree, the lines above, written from the code, win):**
**The design in one page**
1. **Rhea clicks Build Encounter on a Survey Sheet map.** The mod reads the map. A Claude chat or Rhea by hand fills in a brief: which creatures, why they are here, what treasure. She sees a preview, then the mod places everything and files a GM journal. Numbers and names come from Notion or the rules, not the mod.
2. **Each monster in a fight has an "Angel runs this" checkbox.** On a ticked monster's turn, the mod writes down what that monster can perceive (the packet) and asks for a plan.
3. **Whoever is thinking returns a plan as plain data.** Now that is a Claude chat waiting on the bridge; later it is the API. The mod can't tell the difference.
4. **The mod checks the plan against the rules and shows Rhea a private card:** Do it, Change, or Play it myself.
5. **The mod carries the plan out one step at a time,** stopping whenever a player could react.
6. **If nobody is thinking, the card says so** and Rhea plays the turn.
Three choices do most of the work:
- **The thinker never touches the world.** It only returns a plan. The legality check, dice and token moves belong to the mod, which is what lets the API slot in later.
- **The mod's work runs on the Claude Bridge account's page ("the runner"), with the fight scene open there.** See "Who runs a turn" in step 2. Visioner's `getVisibility` looks tokens up on the viewed scene and answers "observed" when it can't find them [LIVE, CODE], so if the runner isn't on the fight scene it opens it, and if it can't, the card says so instead of giving silent wrong answers.
- **Everything is kept in Foundry, not in the chat.** A summarized chat or a browser reload loses nothing.
**Overlap with installed modules**
Checked against `claude/foundry-section-8-modules.md` and a live settings scan (103 third-party settings matched the keywords, none an encounter builder or AI turn) [LIVE]. **Nothing installed builds encounters or runs monster turns.**
| Job | Owner | What the mod does |
|---|---|---|
| XP and threat | PF2e `calculateXP` | Calls it |
| Budget hover, tracker, force turn, delay | PF2e HUD | Leaves it alone; doesn't change its markup |
| Elite and weak; re-levelling | PF2e `applyAdjustment`; Workbench | Elite and weak through PF2e; Workbench only if a brief asks |
| Loot generation by hand | Workbench | Leaves it for Rhea |
| Hidden states, Seek, Sneak, cover, hidden loot | Visioner | Reads its answers; never keeps a parallel system |
| Saves and per-target damage | Toolbelt Target Helper | Used for area effects at step 4 |
| NPC action secrecy | Toolbelt Anonymous (on in PF2 Test [LIVE]) | Monster cards go through it unchanged |
| Auto-damage, Frightened, Stunned, persistent damage, dying | Workbench | Doesn't do these too; D1 covers damage |
| Summons | Foundry Summons + Assistant | Summon abilities use them, not a copy |
| 3D dice delay | Dice So Nice | About 5 s per card is part of a turn's time |
| Maps, Fight Here, party placement | Lythara Survey Sheet | Read through the new call; never writes to its documents |
The "Encounters" control group uses no Ctrl or Shift click variants; both are taken (section 8.3).

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (mod-1) {live} The module's main flows that use this feature still work (no checklist was written for it before 0.10.0; add real items as it changes)

## Traps
- **No hook handler here may return a value.** Core fires `canvasReady` with `Hooks.call`, and 0.1.0 to 0.2.4 cut off 20 other handlers with a `Set#delete` that returned false. `unit.mjs` fails on an expression-bodied handler. (The one exception is `preDeleteCombat`, which returns false only to cancel that one delete for End Encounter's question.)
- **Unit tests need the Survey Sheet repo beside this one** (`/home/claude/lythara-survey-sheet`, a read clone) and the test data in `tools/test/data/`, or `unit.mjs` stops at its imports.
- **Each release restarts PF2 Test** (about 2 minutes). Batch the fixes a test round finds into one release, and keep test helpers in a scratch file: `window` helpers go with any reload of the runner.
- **After building a feature, have an independent reviewer read the diff before saving** (foundry-module-dev section 2). On 2026-11-07 it found six real problems that a night of live tests hadn't, then four in 0.5.0, several in 0.5.1, 4 bugs and 7 risks in the spells change (0.6.0), 4 bugs and 5 risks in the areas change (0.7.0), and 3 bugs and 7 risks in the stealth change (0.8.0), among them a Sneak that never reached its runner; 3 bugs and 3 display bugs in the history window (0.10.0).
- **Fix dice by stage, not by a queue:** on the runner, `CONFIG.Dice.randomUniform = () => window.__rigNow ?? original` and a `lythara-encounter-builder.step` hook that sets `__rigNow` from a map of stage to value (attack, damage, check, flat, save; 0.28 gives a d20 of 15, 0.5 of 10, 0.96 of 1, 0.01 of 20). The hook must return nothing except to stop. A reload drops it. Toolbelt's save rolls run on the runner's page when the module clicks them, so the `save` stage fixes them too.
- **Test setup trap: a token's `x` already includes the scene's padding.** Squares are `(x - scene.dimensions.sceneX) / grid.size`; a list read as `x / size` and then placed with `sceneX` added again put the test Pyro 95 ft away.
- **A pushed work branch is fine when a stop hook asks for a push mid-build:** push `spells`-style branches and move `main` only at release, because `main` is what the manifest installs from (2026-11-07). Set the branch's upstream with `git push -u` the first time, or the stop hook keeps reporting it as unpushed.
- **The measured fight harness is `claude/encounter-builder-fight-harness.md`:** the fight chat (Sonnet 5.5 medium) with the prompt there, stand-ins in the AI and Test Player sessions, the usage note (private doc). The old Wolf id `Actor.PfLLF0V7UOMgTcEb` no longer resolves; Monster Core's Wolf is `Compendium.pf2e.pathfinder-monster-core.Actor.BN5Lb6IsQ9Wyu3rL`.
- Before recommending a change to the design, read what the plan already says about it and give her the old reasons, including her standing rules (the stall whisper was recommended against "no whispered chat cards"). The Bridge choice reversed a line in the plan, and she heard that only after saying yes.
- **Viewing a scene from the bridge can create or re-save a fog record,** so viewing an encounter scene is a change: fine in build testing, but not during a "change nothing" check.

## Open items
- The smoke test still needs its monster-turn line.
