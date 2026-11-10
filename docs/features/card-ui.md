---
feature: card-ui
files: [scripts/ui/turns.mjs]
functions: [fight.mjs:onPreCreateMessage, fight.mjs:onCreateMessage, fight.mjs:waitFor, fight.mjs:waitForAny, fight.mjs:clickWith, fight.mjs:openWindows, fight.mjs:isPrompt, fight.mjs:watched, fight.mjs:cardEl, fight.mjs:cardButton, fight.mjs:boundPanel, fight.mjs:freshButton, fight.mjs:press, fight.mjs:applyOnCard, fight.mjs:redrawn]
dependsOn: []
since: 0.10.0
---
The Monster Turns window and plan card (`ui/turns.mjs`), and driving chat cards: finding buttons, pressing them, waiting for cards and prompts.

## Decisions
**Design-era decisions (from the 2026-11-05/06 plan; the lines above are the skill's summary of the same choices):**
- **Rhea stays in charge:** an "Angel runs this" checkbox per monster; a private plan card with Do it / Change / Play it myself; optional auto-act per monster. If the thinking route is unavailable, she plays the turn herself, so a fight never gets stuck.
Its own GM-only window, **Monster Turns**, listing NPC combatants: "Angel runs this", auto-act, model (stored now, used at step 5), and a light showing whether a thinker is listening. **PF2e HUD's tracker is not modified,** because its markup can change with any update and mods surviving updates is Rhea's main worry. No whispered chat cards: the panel holds the plan, and the public chat shows only the real roll cards.

## How it works
- **Reactions (0.20.0):** while a step waits on reactions the card shows "Reactions:" with the sentence, each reactor's state, React / Pass (then Done for a Reactive Strike) for one the GM answers (no player online, or a party member she plays), Continue, and the countdown (redrawn each second); and "Not asked by the module: …" for reactions the module doesn't know, with their trigger. The player's own window is `ui/react.mjs` (`docs/features/reactions.md`).
- **Change (0.19.0):** beside Do it / Next step while the plan can be changed (`changeProblem`); its panel replaces the steps list until sent or cancelled, and a refused change shows as a warning line (`changeVerdict`). The draft is kept on the window (`_draft`), so the many redraws during a fight keep what she typed; it goes when the window closes. Angel's plan reason is shown in names (until 0.19.0 it showed labels). Details: `docs/features/change.md`.
- **Who is listed (0.18.0):** every combatant Angel can run (`runnable`): monsters, and a party member the GM plays, marked "(party)" after its name, its ticks unticked until she ticks them. A character a player owns isn't listed.
- **At the map's edge (0.11.0):** in state `fled` the card shows Extend map <side> per side (disabled with the reason as its title, and the reason written on the card) and Let it get away, Do it gone, Play it myself kept; an **Escaped** section under the card lists hidden escaped tokens with Bring back. The presses are noted for the history. See `docs/features/fleeing.md`.
- **A card waiter's timer removes only its own waiter** (`waitFor`, `waitForAny`): a stage that ended early without its card (a refused shot) would otherwise have removed the next stage's waiter 20 s later (found by the 0.9.0 review).
- **A prompt nobody can click:** a roll waits for its dialog for ever, and nobody can click the runner's page. `watched` gives each stage `STEP_MS`, stops at once if a window that looks like a dialog appears, closes what appeared (a closed Modifier dialog makes the roll return with no card), and the record then says the stage may not have finished, so it goes to Rhea with the window's title and nothing repeats. PF2e's Modifier dialog is a v1 app in `ui.windows`, not in `foundry.applications.instances`, so both are watched.
- **Only this turn on the card:** `currentRequest` is this round and turn's unfinished request, and `latestNote` only the latest finished turn's note. Both came from an old turn showing up as if it were current: a stopped request after Play it myself, and a 0 HP warning while the hero stood at 5.
**Design-era text (from the plan; where it and the lines above disagree, the lines above, written from the code, win):**
**The card's buttons:** **Do it**; **Change** (edit any step, or type a note that goes back to the thinker; built in 0.19.0: `docs/features/change.md`); **Play it myself** (always there, and ends the mod's part in that turn); **Hold** (pauses before the next step).

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
**The Monster Turns window** (any change to `ui/turns.mjs` or its hooks in `main.mjs`):
- (cu-1) {live,shared:module} as AI open it on a scene with no fight, view the fight's map and back, start a fight while it's open: it follows each change without being reopened.
- (cu-2) {live} Prompts: flip `window.MouseEvent`'s `shiftKey` on the Bridge's page at a chosen stage through the `.step` hook to make a real dialog open: it must stop within a second, close it, name it on the card and repeat nothing.

## Traps
- **The Monster Turns window object is reused when reopened** (`main.mjs` keeps one `TurnsApp`): anything kept on it (the Change draft) survives a close unless `_onClose` clears it (seen in 0.19.0's first test build: the panel came back open).
- Anything shown on the Monster Turns card must belong to the current turn or the latest finished one. Old requests and old notes stay on the Combat flag.
- **PF2e's Modifier dialog is a v1 app in `ui.windows`, not in `foundry.applications.instances`.** Watch both.
- **The Monster Turns window shows the fight on the scene its browser views,** so it must redraw on `canvasReady` and on fights, combatants and tokens changing, not only on fight updates (fixed in 0.5.1; before that a scene change left "No fight on this scene").
- **Visioner's card buttons from code (found live on 0.8.0):** a press right after the card appears can come before Visioner binds its panel's click handler and does nothing, and a card drawn while the runner viewed another scene keeps a panel that finds no token ("No changes to apply"). `press` redraws the card (`ui.chat.updateMessage`) with the fight map open, waits for the panel's jQuery click handler, and counts a press only when the button is `processing` straight after the click. Read Apply's answer from the pressed button, never the card again: a redrawn card always shows Apply.
- **A card waiter's timer must remove only its own waiter** (`waitFor`, `waitForAny`): a stage that ends early without its card would otherwise remove the next stage's waiter (0.9.0 review).

## Open items
(none recorded yet)
