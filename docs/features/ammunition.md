---
feature: ammunition
files: []
functions: [fight.mjs:rangedWeapons, fight.mjs:ammoOf, fight.mjs:shotsFor, fight.mjs:ammoFields, fight.mjs:takeAmmo]
dependsOn: [strike-damage]
since: 0.10.0
---
Monster ammunition: the module takes the shot's ammunition itself around PF2e Ranged Combat.

## Decisions
- **Monster ammunition (Rhea, 2026-11-08: "Module takes 1 Arrow itself"):** PF2e Ranged Combat 8.0.7 reads a monster's stack one short and takes 2 a shot (a player's shot takes 1); the module passes Ranged Combat's `skip-post-processing` and takes the ammunition itself. A monster's last Arrow still can't be fired (Ranged Combat's own check).

## How it works
- **Ammunition (0.9.0, Rhea, 2026-11-08: "Module takes 1 Arrow itself").** PF2e Ranged Combat 8.0.7 reads a monster's ammunition stack one short (its NPC weapon's `compatibleAmmunition` shows 1 Arrow as 0) and its shot then saves the stack 2 lower; a character's shot takes 1 (tested with Valeros). PF2e's own NPC Strike takes nothing (an NPC attack has no ammunition linked). So `ammoOf` reads the shots Ranged Combat's own check will let through, from its `WeaponSystem.transformWeapon` (imported through `getRoute`): the selected stack (even when it reads it as empty), or the only usable one, `calculateTotalRemainingUses` over `expend`. Several usable stacks with none selected give 0 shots ("several kinds, none chosen"): Ranged Combat would ask which, where nobody can answer. Weapons it loads (reload, capacity, repeating) aren't counted and go through Ranged Combat as before. On a monster's shot from a counted stack `runStrike` passes Ranged Combat's own roll option `skip-post-processing` (its `Check.roll` wrapper then skips consumption and its "fires Arrows" card) and `takeAmmo` takes `expend` from that stack, uses first, after the roll and before the attack's record (a reload in between asks, and the note says to check the ammunition). Its check still reads one short, so a monster's last Arrow can't be fired. `shotsLeft` (with `stack`) goes in the packet's Strikes, and `checkPlan` counts shots through the plan per stack. **No shot left is decided before anything is rolled**, so a flat check can't be rolled and then re-planned for a free reroll (found by the review). If Ranged Combat still refuses (its window "PF2e Ranged Combat", which `watched` stops on, or a null roll), the step returns `noShot`, or `noShotSpent` when the flat check was already rolled (the action is then spent); the weapon goes in `turns.noShot` for the rest of the turn (its `shotsLeft` reads 0, so a re-plan can't try it again) and `runTurn` re-plans. If Ranged Combat can't be read at all (an update changed it), Ranged Combat counts the shot as before and the GM's card says so.

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (am-1) {live} The module's main flows that use this feature still work (no checklist was written for it before 0.10.0; add real items as it changes)

## Traps
- **PF2e Ranged Combat consumes arrows:** an archer with 0 Arrows fails its shots silently.
- **PF2e Ranged Combat 8.0.7 and monsters (found 2026-11-08):** its NPC weapon's `compatibleAmmunition` reads a stack one short (2 Arrows as 1) and its consume saves the stack 2 lower; its `Check.roll` wrapper skips consumption (not its check before the shot) for the roll option `skip-post-processing`. Its weapon model: `import(getRoute("modules/pf2e-ranged-combat/scripts/weapons/system.js")).WeaponSystem.transformWeapon(actor, item)`. With 1 left its window "PF2e Ranged Combat" ("has no valid ammunition") opens and the roll returns null. Several stacks with none selected open its "Ammunition Select" window. A character with no ammunition selected also gets that window.
- **Decide "no shot left" before anything is rolled:** a flat check rolled first, then a re-plan, is a free reroll (0.9.0 review).

## Open items
- 0.9.0/0.9.1, not tested live: Ranged Combat's own refusal window during a monster's shot (the module's count now agrees with it, so it couldn't be produced; `noShot`/`noShotSpent` re-plan is unit-tested only), an off-grid creature caught by a real area, Take Cover with the new packet fields in a real fight, "Down" for a character dead at dying 4 without core's Dead status, Auto ending a turn while the game is paused (it does; Rhea told).
