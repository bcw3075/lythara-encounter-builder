# Unverified items (one running list)

What a release did not prove, until it is checked live or dropped. Change records add to it with
`guide unverified add "<text>"`; close an item by editing its status in place:
`verified <date> in <version>: <text>. Seen: <what was seen>` or `dropped <date>: <text>. Why: <reason>`.
The gate counts the open ones; above 8 open at a release's start, that release must close at least 3
(test the cheapest live first). Seeded 2026-11-09 from the 0.11.0 to 0.16.0 records.

- (u-1) [0.11.0] open: Extend at a corner by real click (two buttons rendered): the sides were checked through `checkPlan`, the button loop is the same code as the one-side case.
- (u-2) [0.11.0] open: The 120-square limit on Extend (greying was checked with the Survey Sheet patched off instead).
- (u-3) [0.11.0] open: A runner reload *during* an extension (fl-8 second half); the resume path is the normal `afterExtend`.
- (u-4) [0.11.0] open: The thinker's own `flee` planning through `fight_wait`/`fight_plan` (plans were handed in through `submitPlan`); the prompt text is unit-checked.
- (u-5) [0.11.0] open: Fleeing with the Fleeing condition (prompt rule only; the checker doesn't enforce "away from the source").
- (u-6) [0.11.0] open: What a player sees of the token running off at the moment of hiding (Test Player's page was read, not watched); fog and Visioner interactions with an escaped hidden token.
- (u-7) [0.11.0] open: Monster turns on the 0.10 paths beyond the smoke test and two Strides (D1 not re-run: no change to strike or damage code).
- (u-8) [0.11.0] dropped 2026-11-09: Ticking Auto while a plan is already waiting still doesn't start it (unchanged behaviour; open item, not a regression). Why: Rhea answered 2026-11-09: ticking Auto runs a waiting plan; a change for the next release.
- (u-9) [0.12.0] open: PF2e HUD's own hourglass bringing a delayed monster back early when that reorders the tracker (only the no-reorder case was pressed).
- (u-10) [0.12.0] open: `runDelay`'s own refusal when the named creature is defeated or gone (the look before acting caught it first; the guard is reached only if something changes in the instant between them).
- (u-11) [0.12.0] open: A reload between `nextTurn` and the initiative move (`onRunnerReady`'s sweep), not reproduced.
- (u-12) [0.12.0] open: Start-of-turn effects applied a second time when a delayed monster comes back: the note is on the card; no creature with persistent damage was tested.
- (u-13) [0.12.0] open: Several creatures tied at the named one's initiative and priority (documented: the monster lands after all of them).
- (u-14) [0.12.0] open: The thinker's own Interact and Delay planning through `fight_wait`/`fight_plan` (plans were handed in through `submitPlan`); the prompt text is unit-checked.
- (u-15) [0.12.0] dropped 2026-11-09: Other speeds (fly, swim, climb, burrow): not in this release. Why: fly, swim, climb and burrow were built in 0.13.0 to 0.16.0.
- (u-16) [0.13.0] open: A fall when the runner's page can't open the fight scene (the note route) and a backwards step of the tracker: unit tests only.
- (u-17) [0.13.0] open: The packet read a height mid-animation (15 for 20) when the height was set by script a moment before the turn began; moves made by the module wait for the animation, so only a GM change in the second before a turn starts is affected (the distances doc's existing trap).
- (u-18) [0.13.0] open: A flier on a real encounter map with trunks and deep water: the routes over deep water and round trunks are unit-tested; the live round used Claude Test Scene.
- (u-19) [0.13.0] open: The flier's token drawn at its height on a player's canvas.
- (u-20) [0.13.0] open: Other fight.mjs rolls (Strikes, saves) still follow the runner's roll mode rather than forcing public; only the fall's rolls were changed (review finding 10).
- (u-21) [0.14.0] open: Flowing water (a river) live: no map has any, because Survey Sheet's "wide stream" stays shallow; the Athletics check, its failure (no progress, a re-plan) and the R letter are unit-tested, and PF2e's Swim call was rolled on its own on the runner.
- (u-22) [0.14.0] open: A reload in the middle of a Swim: after its roll and before the move, or between the roll card and its record (`swimStarted`): code read and the review only.
- (u-23) [0.14.0] open: A flier above deep water (the refusal order and no `swimming` in its packet): unit tests only.
- (u-24) [0.14.0] open: A wide river's edges counted as flowing: unit tests only (no river map).
- (u-25) [0.14.0] open: A monster with neither speed in water put there by the GM other than the Goblin (one creature type tried); a Tiny or Huge swimmer.
- (u-26) [0.14.0] open: Rhea's own browser as the active GM.
- (u-27) [0.15.0] open: A critical failure from the ground, live; a reload during a Climb (including mid-fall) or a Release.
- (u-28) [0.15.0] open: A Fly off a tree clearing the flag (no flier was in the test; code read and the review's finding); a dead climber's body dropping, and Off-Guard put back by `settleClimbers` (unit-tested words only, the Foundry side not seen).
- (u-29) [0.15.0] open: A Release while grabbed (the flat check) live; a creature holding a shield or a two-handed weapon.
- (u-30) [0.15.0] open: The player's map picture (the hidden page drew no canvas); a real mouse drag of a climber off its tree (a scripted move stood in).
- (u-31) [0.15.0] open: A Large climber; an off-grid climber; a climber up a tree when the map is extended.
- (u-32) [0.15.0] open: A 5-ft fall doing no damage, live (by the rule, in code).
- (u-33) [0.16.0] open: A Survey Sheet encounter map's rock live (unit-tested on ten real reads); a burrower on a Survey Sheet map at all, live.
- (u-34) [0.16.0] open: An area spell leaving a burrowed creature out, live.
- (u-35) [0.16.0] open: A region the GM draws and names "Soil" herself.
- (u-36) [0.16.0] open: A reload mid-Burrow (the review's fixes 1 and 2 are read in the code, not run live).
- (u-37) [0.16.0] open: A Large burrower coming up short (the review's fix 6), live.
- (u-38) [0.16.0] open: Test Player's own screen as a picture (visibility read by script after a render refresh).
- (u-39) [0.16.0] dropped 2026-11-09: Earth Glide (Sod Hound has it: it may burrow through rock by its own text); the module still treats rock as rock for it, by the Open item. Why: a question for Rhea (plan doc, Open questions), not a test.
