---
feature: change
files: []
functions: [fight.mjs:askAngel, fight.mjs:changePlan, fight.mjs:runChange, fight.mjs:peopleFor, fight.mjs:sendNote, fight.mjs:useEdit, turn.mjs:changeProblem, turn.mjs:editableParts, turn.mjs:applyEdits, turn.mjs:noteForThinker]
dependsOn: [turn-loop, card-ui, brain, history]
since: 0.19.0
---
The Change button on the plan card: the GM edits the steps still to come (leave one out, its target, its square, its height), or sends Angel a note and the rest of the turn is planned again.

## Decisions
- **What Change does (Rhea, 2026-11-09):** asked whether it should offer a note to Angel, editing the steps herself, or both, she chose "Note and step edits": a note box that sends Angel back to re-plan with her words, and editing the plan herself (remove a step, change its target, pick a new square on the map), each edit checked by the same rules as Angel's plans. Rejected: a note only (step edits later); step edits only.
- **Names in her note become labels (Angel, from the module's standing rule that no PC's name reaches the thinker):** each name of a creature the monster perceives or knows as an ally becomes its label, its own name its own label; any other creature's name (GM-hidden, unseen, out of the fight) becomes "someone it doesn't perceive", and the new card says which names those were. She can write names freely; the card shows the note back in names.
- **A note doesn't use up a re-plan** (Angel's default): the GM asked, nothing went wrong, so `replan` runs with `counted: false`, as after a Seek.
- **What can be edited (Angel's default, within her answer):** the parts that are positions or creatures: `target` (and a Delay's `after`), `to`, `at`, `toward`, and a Fly's or Climb's `height`; and leaving a step out. Which Strike, spell or ability, or adding a step, is the thinker's: the note asks for that. An edited step's `why` becomes "changed by the GM" for the history.
- **When Change is offered:** a plan waiting on the card (ready, held, stopped) with steps left, and not when the next step was begun (a reload or a stop part-way: what it did isn't known). Not while running (Hold first), not while waiting for a plan, saves or the map's edge.
- **Taking out every step left ends the plan** with the turn left for the GM to end (as after a card she must apply: Auto doesn't end it).
- **A refused edit keeps the old plan;** the card says why in a warning line until the next run or change. Edits never go to the thinker and never count as tries.

## How it works
- Pure (`turn.mjs`): `changeProblem(r)` (why not now, or null; `CHANGEABLE` = ready, held, stopped), `editableParts(step)`, `applyEdits(raw, edits)` (per step `{ remove }` or changed parts; returns new raw steps, never touching the input), `noteForThinker(note, people)` (whole-word, case-insensitive, longest names first, trimmed to `NOTE_MAX` = 300; returns `{ text, unknown }`), and `describeChange`'s `gm` case: `The GM asks for the rest of this turn: "<text>"`.
- GM side (`fight.mjs`): `askAngel(combat, id, note)` and `changePlan(combat, id, steps)` check `changeProblem`, write `ask` or `edit` on the request (with the user and time) and clear `changeVerdict`; on the runner they carry on at once, elsewhere the runner's `act` picks them up (`ask`/`edit` on a changeable request, before a `go`). Both are on the module API's `fight` object.
- Runner (`runChange`, one at a time per request, never while the turn runs): checks again, opens the fight's map, then
  - a note (`sendNote`): `peopleFor` lists every token on the scene with its token and actor names and its label when known to the monster (`r.labels`, the packet's `allies`, its own label from the packet's `you`); `noteForThinker` makes the words; `replan` from the current step with the change `{ who: "gm", what: "note", text, user }`, not counted; the new request gets a GM-only note naming any creature swapped out.
  - an edit (`useEdit`): `cleanPlan` on the new steps, then `checkPlan` from the current step exactly as the look before each action does (`gather` with what the done steps spent and the last done step as `before`); accepted, `plan.steps` and `steps` are the done ones plus the new ones and an `edits.<time>` record keeps `{ user, pos, before, after }` (step words in labels); refused, `changeVerdict` says why. No steps left: the request is `done` with `gmEnded` and a note.
- `runTurn` clears `changeVerdict` when the turn runs again.
- Card (`ui/turns.mjs`, owned by card-ui): a Change button beside Do it / Next step; the panel lists the steps still to come with Leave out, a target list (labels it perceives and its allies, shown by name), square fields with **Pick** (the window minimises, the next left click on the canvas gives the square; right-click cancels), height; a note box; Use my changes, Send to Angel, Cancel. The draft lives on the window (this browser only) and survives redraws. Presses are noted for the history as "Send to Angel" and "Use my changes".
- History (`history.mjs`): an edit is a line at the step it changed from: "<user> changed the plan from step N: <new steps> (Was: <old steps>)", in names; a note shows as the re-plan's "Asked again" line.
- Prompt version 21 tells the thinker what a GM note is and that it comes before the monster's own tactics.

## Checks
- (ch-1) {unit} `changeProblem` (ready, held, stopped with a done step; running, requested, done, saves, nothing left, next step begun, a change already on its way), `editableParts` per step kind, `applyEdits` (remove, changed parts, an unchanged step keeps its why, the input untouched), `noteForThinker` (labels, unknown names, whole words, longest first, the limit), the `gm` change in words, the prompt's version and words, the history's edit lines.
- (ch-2) {live} By real clicks as AI on a ticked monster's ready plan: Change opens the panel with Do it hidden; Leave out on a step and Use my changes: the card shows the shorter plan, Do it runs it; a target changed to another perceived creature and accepted; a square changed with Pick on the map (a real click on the canvas) and accepted, and one that is out of reach refused with the reason in a warning line and the old plan kept; Cancel closes the panel with nothing changed.
- (ch-3) {live} A note by real clicks: Send to Angel with a perceived creature's name and a GM-hidden creature's name: the new request's `why` text holds the first one's label and "someone it doesn't perceive" and no name (scan the event's reason for every token name on the scene); the card shows the note in names and the note about the hidden one; the `replan` event reaches `fight_wait`; the re-plan isn't counted (`replans` unchanged).
- (ch-4) {live} Change between Next steps (pos 1): only the steps still to come are listed and changed; the done step stays done.
- (ch-5) {live} Leave out every step left: the turn's plan ends with the note, Auto doesn't end the turn.
- (ch-6) {live} Change isn't offered while a step runs, while waiting for a plan or for saves; a second GM page's Change (the AI session while the Bridge runs turns) goes through the runner.
- (ch-7) {live} The history window shows the "Use my changes" and "Send to Angel" presses, the edit line with what it was, and the note as "Asked again".
- (ch-8) {live,player} Test Player sees no Change button and no card.

## Traps
- **The plan's steps and the checked steps are two lists of the same length:** the request's `plan.steps` holds them as the thinker wrote them (what an edit changes and `checkPlan` reads), `r.steps` the checked ones (what runs and what the card describes). An edit must replace both from the current step on, as `lookAgain` reads them.

## Open items
- A note while the turn waits for a plan (state requested), or after Angel gave up: not offered yet (the turn has no plan to re-plan from); she can Play it myself.
- Adding a step, or changing which Strike or spell: through a note only.
