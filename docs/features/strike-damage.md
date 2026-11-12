---
feature: strike-damage
files: []
functions: [fight.mjs:resistEffect, fight.mjs:strikesWithIds, fight.mjs:strikesOf, fight.mjs:runStrike, fight.mjs:targetHelperOn, fight.mjs:markApplied, fight.mjs:onRenderMessage, fight.mjs:applyFromCard, fight.mjs:aimAt, fight.mjs:stopAiming, turn.mjs:isAttack, turn.mjs:strikeIds, turn.mjs:damageOptions]
dependsOn: [turn-loop, card-ui, ammunition]
since: 0.10.0
---
Strikes from a plan, targeting on the runner's account, automatic damage with the undo card, what players see on a damage card (test D1).

## Decisions
- **"Down" not "Dead"** for a creature at 0 HP that isn't dead (Rhea).
- Damage applied automatically with an undo card, protected by D1.
- **On a monster's damage card with automatic damage on, players get no apply buttons:** Target Helper's row is taken off and PF2e's four buttons are hidden from them, because they can only apply again. GMs keep PF2e's. With automatic damage off, nothing is hidden. A player's own cards aren't touched.
**Design-era decisions (from the 2026-11-05/06 plan; the lines above are the skill's summary of the same choices):**
  - **Damage:** applied automatically, with an undo card. Protected by the required test D1 in step 2.
- **D1 now includes Auto.** The first matrix used Do it only and passed; Auto then rolled the first attack twice. So run the matrix with Auto too, plus a three-Strike plan with real dice.

## How it works
- **Player reactions (0.20.0):** before the attack (Nimble Dodge, and Reactive Strike for a ranged one), after the roll the degree is read again against AC + 2 for a Nimble Dodge used; on a hit before damage (`hitGate`) Shield Block (applied through `applyFromCard`'s `shieldBlockRequest`) and Reactive Shield (the degree read again against the raised shield; a hit that becomes a miss skips damage). The step's record keeps `reacted`, `shieldBlock`, and on a changed degree the attack's `was` (the first degree) and `against` (the AC it was read against). Details: `docs/features/reactions.md`.
- **A character's Strikes (0.18.0):** `strikesWithIds` keeps only a character's Strikes that PF2e has ready and visible (a stowed weapon's isn't ready); every NPC Strike still counts. Its ammunition is PF2e's and Ranged Combat's own (the module takes ammunition only for NPCs); a refused shot with no roll is u-45.
- **A Strike whose weapon lies on the ground isn't offered (0.15.0):** PF2e keeps an NPC's attack ready after its weapon is dropped, so `strikesOf` leaves out a Strike whose linked weapon (`weaponOf`) is carried "dropped" (after a Release), and `checkPlan` refuses one (`docs/features/moves.md`).
- **Only the module rolls damage.** Workbench's auto-damage would roll on the card author's browser, with the dialog if that user has dialogs on. So `preCreateChatMessage` adds Workbench's own `noAutoDamageRoll` flag to this module's attack cards, and the module always rolls. One roller, one card, whatever anyone's settings. If Workbench drops that flag you'd see a second damage card, but not double HP, because Workbench never applies damage. Test D1 catches it; re-run D1 after any PF2e, Workbench or Toolbelt update.
- **No dialogs:** a click event with `shiftKey` equal to the user's dialog setting, because PF2e flips on Shift. `skipDialog` doesn't work.
- **Real targets:** `aimAt` targets on the runner's own account before each attack and damage roll, and `stopAiming` clears them after the turn. Each account has its own targets, so a GM's are never touched. That clears Workbench's targeting reminder (at "mustTarget" an untargeted Strike is cancelled outright, tested). **With automatic damage on, `markApplied` flags the module's damage card as `autoApplied` once it's made and takes Toolbelt's Target Helper row off it.** A flagged card doesn't draw PF2e's `.damage-application` buttons for players (`onRenderMessage`, in their browser only; GMs keep them). Those buttons and the row's both applied a second time after the module had applied damage, even once Toolbelt marked the row applied (tested), and Block comes too late to work: Shield Block's route is the reaction pop-up, before damage. Toolbelt fills the row from the roll's target, in a `preCreateChatMessage` hook that runs after this module's, so it comes off afterwards whatever the hook order. If Toolbelt renames its flag the row stays, and if PF2e renames the class the buttons show again; nothing else breaks. With automatic damage off, nothing is marked. A player's own cards aren't touched. Others see the runner's target mark on the token during the turn.
- **Applying** copies PF2e's Damage, Half and Double buttons (`applyFromCard`, PF2e's `applyDamageFromMessage`) for a named target: contextual clone, roll options from the card plus `origin:ally` or `origin:enemy` as PF2e adds (0.6.0), item, outcome, and the roll altered by the multiplier. It doesn't read effects that count only for one hit, because PF2e's `extractEphemeralEffects` isn't exported.
**Design-era text (from the plan; where it and the lines above disagree, the lines above, written from the code, win):**
**Required early test D1: damage lands exactly once, and undo works**
This is the **first test of step 2**, as soon as one real Strike can run. Nothing else in step 2 counts as done until it passes, and automatic damage stays off until it does. If it fails, stop and tell Rhea.
Set up in PF2 Test, in a real started combat, through the mod's real Do it route, with the Bridge as the runner, the AI tab as active GM standing in for Rhea's browser, and Test Player owning the target. (AI's user id sorts before the Bridge's, so AI is the active GM in PF2 Test.) Do the final pass with Rhea's own browser as active GM, when she can join in. Workbench's auto-damage is per browser, so record each setting before changing it, restore it afterwards, and delete test items by id.
| Case | Workbench auto-damage |
|---|---|
| a | Off in the browser running the turn |
| b | On in the browser running the turn |
| c | On in the browser running the turn and on for another logged-in GM |
| d | Off in the browser running the turn and on for another logged-in GM |
Run each case with a hit, a critical hit and a miss, with Dice So Nice on, and with the user's check and damage dialogs both on and off. Include one target with a resistance.
**Pass means, every time:**
- A hit or crit makes exactly one damage roll card and exactly one HP change, and the HP change equals the damage after resistances. A miss changes nothing.
- A late Workbench roll can't double up: wait long enough for Dice So Nice's delay, then check again.
- Reloading right after the damage step, then resuming the turn, does not apply damage again.
- A real click on the undo card restores HP exactly, and a second look from Test Player's view shows the same.
- Undo after a hit that takes a PC to 0 HP: record what happens to Dying, Wounded and Unconscious from Workbench. If undo doesn't clear them, the plan card must tell Rhea what's left to fix, and she hears about it in the report.
Re-run D1 after any change to rolling or applying damage, and after any PF2e, Workbench or Toolbelt update.
**Strike.** `strike.variants[n].roll({ event, target: token })` and `strike.damage({ event, target: token })` or `strike.critical(...)`, with `event` a mouse event whose `shiftKey` is set to the opposite of "skip dialogs": Shift when the user's dialogs are on, none when off.
- Ran with no dialog, for roll, damage and critical, with `createMessage: false` [LIVE]. `skipDialog: true` does **not** work: both the roll and damage opened their dialogs [LIVE].
- The runner also targets for real on its own account (`setTarget`, then `canvas.tokens.setTargets([], {mode: "replace"})` after the turn), so no GM's targets are touched [LIVE].
- Read the outcome from the returned roll's `degreeOfSuccess`.
- **Visioner's auto-cover applies with no dialog** [LIVE 2026-11-06]: a real Strike by this route behind a test wall with greater cover had `target:cover-level:greater` on the card and AC 11 became DC 15. Nothing needs passing on.
**Damage: never roll twice.** Changed from the first design, which waited on Workbench when its setting was on. Workbench's auto-damage only fires in the browser that wrote the attack card, using that browser's setting [CODE], so **the mod always rolls damage itself and turns Workbench off for its own attack cards** with Workbench's flag `noAutoDamageRoll` [LIVE: a plain Strike without the flag does auto-roll]. If a step's record can't tell whether something finished, the mod never repeats it: it stops and hands the step to Rhea. Dice So Nice holds each card about 5 s [DOC]. Test D1 proves this.
**Applying damage.** `actor.applyDamage({damage: roll, token})` on the target's actor (or, since 0.27.0, on a copy of it that carries a reaction's resistance), which respects resistances and shows the system's undo card [DOC, CODE]. Not the HP box or a bare number, which skip them [DOC].
- **Checked in step 2 (2026-11-05):** a real Strike card by the Shift route, and damage and undo (test D1). What players' browsers receive of Combat flags: they get the flag. Workbench's `reminderTargeting`: with no target, "reminder" shows a note and "mustTarget" cancels the Strike; with the runner's real target neither happens [LIVE].
- **Reactions to the damage (0.27.0, `reactions.md`):** the apply stage first asks the damage gate (`harmGate`), then applies unless the monster repented; `applyFromCard(message, roll, target, multiplier, shieldBlock, { resist, less })` puts a one-rule resistance effect (`resistEffect`) on the copy of the creature the damage is worked out on and takes a flat `less` off the roll with `roll.alter(multiplier, -less)`; `afterHarm` then says what happened. The attack stage reads the AC raised by the target's reactions through `acRaised` (Nimble Dodge, Interposing Earth) and says a hit turned into a miss to everyone. With automatic damage off, `harmByHand` asks after the damage roll.

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
**Any change to rolling or applying damage, a change to the Bridge's page, or a PF2e, Workbench or Toolbelt update: re-run D1 as this doc's How it works sets it out,**:
- (sd-1) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} with Do it and with Auto, then a three-Strike plan on Auto with real dice, then automatic damage off with hit, crit and miss.
- (sd-2) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Keep AI online as active GM, in a hidden session (`session start gm`; set its Workbench setting through `run_script` with target `gm`) or a pane tab: with only the Bridge online, it is the active GM, which D1 doesn't cover.
- (sd-3) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} The whole matrix takes about 7 minutes: run it on the Bridge's page in two batches, the other GM's setting off and then on.
- (sd-4) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} **The driver, setup and cleanup are in `claude/encounter-builder-d1-driver.md`** (39 of 39 on 0.7.1): reuse it, don't rebuild it.
- (sd-5) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} The Bridge is the runner, so the dice rig and the driver go on its page through `run_script` (start unawaited on `window`, poll); `CONFIG.Dice.randomUniform` fixes dice there, values 0.78, 0.28 and 0.96 give d20s of 5, 15 and 1 and 0.9 gives a d6 of 1.
- (sd-6) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Those dice show in the pane, so tell Rhea if she may be watching: a run of 1s is the rig.
- (sd-7) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Count cards by `flags.pf2e.context.type` after waiting 6.5 s for Dice So Nice.
- (sd-8) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} A creature killed by massive damage gets "takes no damage" cards with no `appliedDamage` flag, so count `damage-taken` cards, not that flag.
- (sd-9) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Workbench's strike setting is per browser: set the other GM's on its page, and put them all back.
- (sd-10) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Reload the Bridge's page afterwards to drop the rig, then allow about 30 s before it answers again.
- (sd-11) {live,shared:turn-loop,shared:card-ui,shared:spells,shared:areas} Also check no Target Helper row and the `autoApplied` flag on each damage card with automatic damage on, neither with it off.

## Traps
- Undo at 0 HP leaves Wounded, Prone, Off-Guard and the moved initiative; the card says so.
- **A Target Helper row or PF2e's Damage button applies again after the module has applied,** even once Toolbelt marks the row applied. Toolbelt fills the row from the roll's target, not only the account's targets, in a `preCreateChatMessage` hook that runs after this module's: clearing targets doesn't remove it, and removing it has to happen after the card is made.
- **Undo at 0 HP doesn't undo everything.** It restores HP but leaves Wounded, Prone and Off-Guard, and the moved initiative. The card says so.
- **A reaction that raises AC reads the attack's own DC (0.29.1):** `runStrike` adds only what the reaction beats of the circumstance bonus already in the DC, now read from the card's roll options too (bug B-3; `docs/features/reactions.md` Traps).

## Open items
- D1's full matrix wasn't re-run for 0.9.0 (18 of 18 hits applied once in the measured fight instead).
- The same missing-degree pattern the review found in spell attacks is still in `runStrike` (`?? 0`).
- D1's final pass with Rhea's own browser as active GM.
