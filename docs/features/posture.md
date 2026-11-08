---
feature: posture
files: []
functions: [fight.mjs:runPosture, turn.mjs:nextPosture, turn.mjs:absorbOwn]
dependsOn: [moves, turn-loop]
since: 0.10.0
---
Stand and Drop Prone, and what prone changes.

## Decisions
(none recorded yet)

## How it works
- **Stand and Drop Prone (0.5.0, 0.5.1).** `{ do: "stand" }` only when prone, `{ do: "drop-prone" }` only when not, and not above the ground, where it would fall instead (Rules: Prone, https://2e.aonprd.com/Conditions.aspx?ID=88). `runPosture` uses PF2e's own action (`game.pf2e.actions.get(kind).use({ actors })`, `StandActionVariant` and `DropProneActionVariant` in PF2e 8.7.0), which posts the action's card and toggles Prone, with no dialog. Then it waits up to 2 s for Prone to change (PF2e awaits its own toggle, so this is a margin). `log` gets `started`, then `changed`; one begun before a reload is never sent again (`nextPosture`, which also reads 0.5.0's `stood`): already as the step leaves it counts as done, otherwise the GM looks; not begun and already like that is done with nothing posted. Afterwards `absorbOwn` puts into `seen.me.conditions` what the action itself changed, limited to Prone and the Off-Guard it brings, so the look before the next action doesn't re-plan for its own doing while a condition a reaction added still counts (0.5.0's first draft copied all conditions, which the review caught).

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
**Steps, Crawl, Stand and Drop Prone** (any change to `findStep`, `runPosture`, `nextPosture`, `absorbOwn`, `moveAction`, prone in `checkPlan`, or `nextDiagonalFt`):
- (po-1) {live,shared:moves} through `api.fight.checkPlan` on the runner, each refusal in words (a Step into difficult terrain, two squares away, onto a creature, a diagonal Step after a one-diagonal Stride at Foundry's 10 ft, Stand when not prone and twice, prone then Stride or Step, grabbed then Stand, restrained then Strike), conditions put on the monster's actor and taken off between checks.
- (po-2) {live,shared:moves} By real clicks as AI: Step then Strike (charged 5, no re-plan); a prone monster's Stand, Stride, Strike with a stop at hook stage `stand` and a reload of the runner (one Stand card under the monster's token, Prone and Off-Guard gone, no re-plan for its own Stand); a PC moved mid-turn so the re-plan's packet shows `nextDiagonal` 10 and a diagonal Step is refused with a retry; the same plan on Auto with a stop at stage `step`.
- (po-3) {live,player,shared:moves} Test Player sees the Stand card.
- (po-4) {live,shared:moves} For Crawl and Drop Prone (0.5.1): refusals for Crawl when not prone, Drop Prone when prone and at elevation (wait for the elevation animation first), a second diagonal Crawl, Immobilized; by real clicks Drop Prone with a stop at stage `drop-prone` and a reload, then Crawl (moved with the crawl action; Foundry books it 10 ft) and a bite; on Auto on a fresh turn, Crawl, Stand, Stride (the Stride goes as a walk, charged as planned).

## Traps
- **PF2e's own simple actions are usable as they are:** `game.pf2e.actions.get("stand")` and `get("drop-prone")`, `.use({ actors: [actor] })`, post the card (speaker the token of an unlinked actor) and await changing Prone, no dialog. PF2e's Crawl is only a card, so the module moves the token itself. Prone brings Off-Guard as its own condition. `system.movement.speeds.land.value` already includes Speed penalties (PF2e 8.7.0).
- **Foundry's crawl action books double** (core's `costMultiplier: 2`): a one-square Crawl's charged cost reads 10 ft. Check a Crawl at the rules distance (terrain cost alone, 5 ft a square), not by Foundry's charge. A prone token can't Walk in Foundry (`walk.canSelect` false), so a Crawl must be sent with the crawl action, and a Stride or Step never with it (`moveAction`).
- **`absorbOwn` always takes the limit** (Prone and Off-Guard): with no limit it would also take in a condition a reaction added during the action.

## Open items
- Reactive Strike during a Crawl and at the end of a Stand or Drop Prone (not built with the rest of reactions).
- A Large creature's Step or Crawl, a Step at a wall or into deep water, a Stand or Drop Prone interrupted by a reload halfway: unit tests only.
- Test Player's view of a Drop Prone card.
