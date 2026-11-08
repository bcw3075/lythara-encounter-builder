---
feature: distances
files: []
functions: [fight.mjs:within, fight.mjs:squareOf, fight.mjs:placeOf, fight.mjs:offGrid, fight.mjs:sizeOf, fight.mjs:same, fight.mjs:heightOf, fight.mjs:nextDiagonalFt, turn.mjs:sizeRank, turn.mjs:same]
dependsOn: []
since: 0.10.0
---
Where a token really is and how far things are, as PF2e measures them: `placeOf`, off-grid tokens, size, height, the diagonal count.

## Decisions
(none recorded yet)

## How it works
  - **Distance** is `distanceBetween`, a copy of PF2e's `measureDistanceCuboid`, height included (at different elevations the vertical gap is a third axis, from elevation and the token's depth; 0.4.6 left it out, so a ground monster could have bitten a flyer): squares between the creatures' edges, every second diagonal double, and with reach 10 five feet off when the line has more than one diagonal (10-foot reach reaches two squares diagonally). It matched `distanceTo` on 32 pairs, Medium and Large (2026-11-07). **Off the grid (0.8.3):** x and y may be fractional, and as PF2e does it tests overlap on where the creatures really are, then snaps each one's edges to the grid toward the other before counting. `gather` gives each creature `pos` and `span` (`placeOf`: where PF2e's `mechanicalBounds` puts it, in squares; a Tiny token is the whole square holding its top-left corner, anything else its real position and width) beside its rounded `square` and `size`; `checkPlan` measures from the monster's `pos` until a move step puts it on a square, to each target's `pos`. A hidden target gets no `pos`: it is measured from the square the monster knows, so a refusal can't give away where in that square it sits. Hide's light check also reads the light where the monster really stands, as the packet does. Routes, occupancy and the square the thinker is told stay rounded. Checked against PF2e's own `measureDistanceCuboid`, run on the server with a stub grid, on 140,800 cases (widths 1, 1.5, 2, 2.4 and 3, quarter-square offsets, reach 10 on and off): no difference. Still rounded: a move from an off-grid start (the route starts at the rounded square while Foundry moves the token from where it is). Melee is checked with the Strike's reach passed in, as PF2e does; before 0.4.6 the check used plain `distanceTo`, which refused a Dire Wolf two squares away diagonally.
- **A token off the grid used to be measured from the square it rounds to** (`squareOf` rounds), so the packet's distance (PF2e's) and the check's disagreed: a Small goblin at x 23.5 was told 5 ft and refused at 10 (2026-11-07). Fixed in 0.8.3 by measuring from `pos` (see Distance). Still rounded: routes and occupancy, and which squares an area covers (`coverage` and `caughtBy` work on `square`).

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
**Distances** (any change to `distanceBetween`, `placeOf` or the `distanceTo` in `checkPlan`):
- (di-1) {live,shared:moves} compare with PF2e's own code through `run_script` (foundry-module-dev section 7: cut `measureDistanceCuboid` and `measureDistanceOnGrid` out of `systems/pf2e/pf2e.mjs`, run with a stub `canvas`), over widths 1, 1.5, 2, 2.4 and 3, quarter-square offsets and reach 10 on and off (140,800 cases, none different, on 0.8.3); then every creature pair on Claude Test Scene against real `distanceTo` with the module file imported on the runner (180 of 180), and a token made Tiny (width 0.5) at off-grid spots (put it back); then a real turn of the off-grid Goblin Warrior next to Test Hero.

## Traps
- **Distances use where a token really is (0.8.3), as PF2e's `distanceTo` does:** it measures between `mechanicalBounds` (a Tiny token is the whole square holding its top-left corner, anything else its real bounds and width), and `measureDistanceCuboid` tests overlap on the real rectangles, then snaps each one's edges to the grid toward the other before counting. `placeOf` gives `pos` and `span`; `checkPlan` measures from the monster's `pos` (its square after a move step) to each target's `pos`. Before, the check used the rounded square: a Small Goblin Warrior at [23.5, 19.5] was told 5 ft and refused at 10. **A hidden target gets no `pos`** (measured from the square the monster knows, or a refusal's "X ft away" would show where in the square it sits), and **Hide's light check reads `lightAt(herePos)`**, as the packet reads the light at the token's centre (both found by the 0.8.3 review). Routes, occupancy, the square the thinker is told and an area's coverage stay rounded.
- **On the runner's page a token's elevation reads an in-between value while its change animates,** and an elevation change goes into Foundry's movement history as small vertical moves. Wait for `movementAnimationPromise` before reading or checking.
- **Claude Test Scene has tokens off the grid:** the Dire Wolves at [19.5, 15.5] and the Goblin Warrior at [23.5, 19.5]. Since 0.8.3 they needn't be moved onto the grid for a test, and they are handy for distance tests.

## Open items
(none recorded yet)
