---
feature: look
files: [scripts/look.mjs]
functions: [fight.mjs:withPackets, fight.mjs:lookOf, fight.mjs:lookCheck, fight.mjs:lookTokens, fight.mjs:startLook, fight.mjs:lookModel, fight.mjs:lookEvent, fight.mjs:offLook, fight.mjs:submitLook, fight.mjs:answerLook, fight.mjs:dismissLook, fight.mjs:lookNow, fight.mjs:escapeOffers, fight.mjs:acceptEscapeLines]
dependsOn: [minds, memory, brain, api-route, card-ui, history, fleeing, packet, turn-loop]
since: 0.33.0
---
The fight-start look and an escaped monster's lines (monster minds release 4): when a fight starts Angel looks at it from what the monsters perceive and suggests changes to their minds, each waiting for the GM's Accept or Keep and lasting this fight only; at End Encounter a monster that got away offers a few sure lines about its enemies for its own "Knows about its enemies".

## Decisions
Rhea, 2026-11-10 (the design doc's decisions 4 and 5) and 2026-11-12 (R4-1 to R4-4, an Opus design chat; the samples are in the private repo, under its plan folder):
1. **Who writes a profile: both** (decision 4). It is written when the encounter is built; "when the fight starts, Angel takes a look at the current situation and suggests any updates to take any changes or old assumptions into account."
2. **"Everything waits for your OK"** (decision 5): each suggestion has Accept / Keep (Angel added Accept all / Keep all); the stored profile stays in force until she answers. What she accepts goes on this fight's layer and never reaches the library.
3. **With nothing listening at the start: wait, but only until round 1 ends** (R4-1, Angel's recommendation). The look comes after any waiting monster turn; on the chat route it waits for the first hello; if round 1 ends unanswered it is dropped and the card says it didn't happen. With the route off there is no look, and the card says so. Why: waiting costs nothing (the stored profiles stay in force); after round 1 the monsters have already acted.
4. **The API route answers it too** (Rhea, 2026-11-13, at this build: "Bridge change too"): bridge 0.4.0's worker answered only turns, retries, re-plans and choices, so with her fights on the API route the look would almost never have happened. Bridge 0.4.1's worker answers the "look" event. A look the API can't make goes to a listening chat, as a turn does.
5. **Escaped monsters' notebooks are offered at End Encounter for their own "Knows about its enemies": yes, with limits** (R4-2): only monsters that got away (fled off the map), not the dead, down or prisoners; a few short summary lines, not the notebook, each Accept / Keep, plus Accept all / Keep all; sure lines only; names restored, so the name gate makes fresh labels in the next fight; on that monster's own profile, never its kind or the library, marked as Angel's, so it never replaces hers.
6. **The samples: "They look good"** (R4-4), with Angel's additions in them: who each suggestion applies to and which line, the nothing-to-change note, the reminder line, Dismiss, and **her answers to an escaped monster's lines stand whether she saves or discards the history**.

Settled by Angel at the build, told to Rhea, hers to change:
- **The look is about the monsters Angel plays** in the fight (ticked for Angel, the module's to run, on the monsters' side, alive). With none there is no look and no card.
- **One call for the whole fight**, each monster's short packet in it; Opus when any of them is thought for by Opus (a band leader, a caster two or more above the party, her tick), else Sonnet.
- **At most 8 suggestions**, for the lines Goes for, Fights by, Gives up, Discipline, Mind, Knows about its enemies and Notes (never the Pronoun line). A refused look gets one more try, then the card says it couldn't be made.
- **An accepted line is used from the monster's next packet** (its next turn or re-plan): a turn already being thought about isn't stopped for it.
- **The escaped monster's lines are the module's own words from its notebook,** not a thinker's: the End Encounter question never waits on a call. Which lines it offers follows its Mind's rung, as its notebook does (an animal: only who hit it hard; a cunning one also healers and casters; a trained tactician also shields, reactive strikes, weaknesses and resistances).
- **Its own profile:** a monster that has none is given one first (a copy of what it follows now, as Give one monster its own profile does), so the line is on its own layer; it then no longer follows later changes to its kind's lines, and Follow its kind again (Monster Minds) takes the line away with the rest. Her own words on that line are never added to: the box says so and has no buttons.
- **Closing the End Encounter window** writes nothing (the fight goes on), as before; with the history already saved and a monster's lines to answer, the window has End encounter instead of Save or Discard.

## How it works
- **The look** lives on the Combat's `turns.look`: `state` (`asked`, `ready`, `missed`, `off`, `failed`), `seq`, `monsters` (label → token, name, kind key and name), `packets` (label → `lookPacket`), `items` (the suggestions, each with the line as it stood when the look came, `now`, and her `answer`), `fits`, `thinker` (who it was given to, with that thinker's generation), `handedOff`, `tries`, `dismissed`. Its event is `events.<seq>` with kind `look` and request id `LOOK_ID` ("look"): one a fight.
- **Started by the runner** (`lookCheck`, at every turn or round change and in the 10 s stall check): at round 1 with no look yet, `startLook` waits for the first creature's request (at most 15 s) so the first turn goes first, then builds each monster's packet with `buildPacket` and saves its labels and memory as a turn would. Packets are built one at a time with the turn's (`withPackets`): two built at once could give one label to two creatures. Once round 1 is over a look still `asked` becomes `missed`.
- **Delivered** by `firstEvent` after every live turn event, through `lookEvent`: not by the cursor (a turn handed out first would carry the cursor past it) but once to each thinker's generation (again after the hold time if no answer came), so a chat that says hello later still gets it; `waitForEvent` stamps `look.thinker` and leaves the cursor where it was. Who gets it is `whoGets` with kind `look` (in `API_KINDS`): the API when it listens on the API route, else a listening chat.
- **Answered** through `submitPlan(combat, "look", look, meta)` (`submitLook`): ignored when stale, off the route, handed on, given to the other thinker or after round 1; cleaned by `cleanLook`; refused once with a reason (re-issued under a new number with `look.refused`, its answer `requested` with the tries left, so the API worker counts it as landed and answers it again), then `failed`. `handOff` and `reportFailure` take `LOOK_ID` too. Its answer is `{ state: "looked" }`, which bridge 0.4.1's worker counts as landed.
- **Her answers** (`answerLook`, the card's buttons): an accepted "one" suggestion is `flags.<id>.minds.own.<tokenId>.<line>`; a "kind" one is the kind's entry in `flags.<id>.minds.kinds` (a list, replaced whole). `mindLayers` lays a monster's own fight lines over its kind's, line by line (before 0.33.0 one monster's fight lines hid its kind's).
- **The card** (`_lookCard` in `ui/turns.mjs`) sits under the light on Monster Turns; Angel's words go through `escW` (never read for pronoun markers) and labels are turned into names for her (`namer`).
- **End Encounter** (`onPreDeleteCombat`, `askOnEnd`): `escapeOffers` reads each monster in `escapedList` with its notebook (`escapeLines`, pure: sure lines about enemies, by its rung, at most `ESCAPE_MAX`, names through the fight's labels, only the party's side); her answers are kept in the window and written by `acceptEscapeLines` before the history is saved or discarded and the fight deleted: `giveOwn` when it has no own profile, then `setLines` on its own `knows` line as Angel's (`knowsAfter`: Angel's words kept, new ones added once, cut to the cap; null when the line is hers).

## Checks
- (lk-1) {unit} A look cleaned and refused in words: both kinds of suggestion, a pick, duplicates dropped, fits of this look only, the seq kept; not JSON, a bad `for`, a bad label, a monster not in the look, a line it can't change, a pick missing, no words, too many, the cap.
- (lk-2) {unit} A look is told from a plan and a choice.
- (lk-3) {unit} A look's packet keeps mind, band, its own state, allies and whom it perceives, and drops the ground map, spells and unlabelled creatures.
- (lk-4) {unit} The look event's shape and seq; it waits until round 1 ends; the didn't-happen, off and failed words; who it applies to in words.
- (lk-5) {unit} What an escaped monster saw: sure lines about enemies, once each, most telling first, at most four, names restored, no pronoun; by its Mind's rung.
- (lk-6) {unit} The Knows line after Accept: her words never replaced; Angel's kept with the new added once; the cap.
- (lk-7) {unit} Who gets the look on each route; the hello (prompt version 33) explains it.
- (lk-8) {live,shared:api-route} On PF2 Test with bridge 0.4.1 on the API route: a fight started with two kinds of monster ticked gets a look card "waiting for Angel" after the first turn's request; the worker answers it (its log line "look"); the card shows the suggestions with who, line, now, change and why.
- (lk-9) {live} By real clicks as AI on the look's card: Accept one ("✓ Accepted", the fight's `minds` has the line, the next packet of that monster carries it), Keep one, Accept all / Keep all, Dismiss; a "kind" suggestion reaches every monster of the kind; a monster with a fight line of its own still gets its kind's other fight lines.
- (lk-10) {live} The look on the chat route with no chat listening: the card waits; at round 2 it says the fight-start look didn't happen, with Dismiss; with the route Off at the start, the off card.
- (lk-11) {live,shared:fleeing} End Encounter by real clicks as AI after a monster fled off the map: its box with its sure lines in names, Accept one and Keep one, Accept all; Discard; the monster now has its own profile in Monster Minds with the accepted lines on "Knows about its enemies", tagged Angel's; a dead monster and a prisoner offer nothing; with the history saved first, the window has End encounter.
- (lk-12) {live,player} As Test Player: no look card, no End Encounter offer, and nothing new in their chat.

## Traps
- **A turn handed out after the look would carry the cursor past it** (the cursor only moves forwards): the look is delivered by generation, and `waitForEvent` doesn't move the cursor for it.
- **Two packets built at once can give one label to two creatures:** the look's packets and a turn's are built one at a time (`withPackets`).
- **The fight layer's per-monster lines used to hide its kind's** (`mindLayers` took `own[tokenId]` or the kind's, never both): the look writes kinds' lines, so they are now laid together line by line.

## Open items
- An escaped monster's knowledge follows it only on this scene's build (its own profile is by its number in the brief row): a monster that reappears in another encounter (another scene's build, or a world actor placed by hand) starts without it.
- A "Knows about its enemies" line that names a party member is held back whole from a packet when the monster doesn't perceive that creature (the name gate's rule): one line naming three characters is held back if any one is out of sight.
- A "kind" suggestion's text is in the fight's labels and reaches every monster of the kind, including one that doesn't perceive the creature named.
- The look isn't in the History window or the saved page.
- Two GM pages accepting two "kind" suggestions at the same moment can lose one (the fight's kinds list is written whole). An answer landing just as round 2 begins can cross the runner marking the look missed.
- A look still waiting with no runner online has no Dismiss: it is dropped at round 2 once a runner is back.
