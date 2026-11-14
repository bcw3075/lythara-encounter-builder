---
feature: pronouns
files: [scripts/pronoun.mjs]
functions: [fight.mjs:P, fight.mjs:voiced, turn.mjs:checkPlanIt, turn.mjs:doneStepIt, turn.mjs:describeStepIt, turn.mjs:climbResultIt, turn.mjs:aimTextIt]
dependsOn: [minds, card-ui, history, packet, brain]
since: 0.30.1
---
Each creature's own pronoun in the module's words (R-2): a character by its sheet's Gender box, a monster by the Pronoun line of its mind profile, "it" for animals and mindless creatures until the GM says otherwise.

## Decisions
Rhea, 2026-11-12 (during a close-out sitting): creatures should be written about with their correct gender, not "it". She said yes to: **a character by its sheet's gender; a monster by a pronoun on its mind profile, set at build when not given and hers to change; animals and mindless creatures "it" unless she says otherwise.** Placed the same evening as its own small release right after tier 3d.

Rhea, 2026-11-13, each asked on its own, the first with a sample picture (the Pronoun row on Monster Minds, and four lines of text as they read today and after):
1. **Where it sits and what it offers: "As in the sample."** Its own row at the top of the profile, above Mind: he, she, they, it, and "other…" for her own words. Set per kind of monster; a single monster can differ through its own profile. (Not chosen: the same row without "other…"; the row at the bottom by Notes.)
2. **What the build sets when nothing says a thinking monster's gender: "they".** It never guesses wrong, shows as the module's pick, and one click changes it. When a brief's row says a pronoun, that is used. (Not chosen: Angel picking he or she when writing the brief; staying "it" until she sets one.)
3. **Animals and mindless creatures: "Starts "it", changeable."** The same Pronoun row; "it" is only what the module sets for them. (Not chosen: always "it", the row greyed.)

Settled by Angel, told to Rhea, hers to change:
- **The Pronoun is a line of the mind profile like any other** (`pronoun`, the first of `LINES`): it has the same layers (this fight, its own, this encounter, its kind and its people in the Minds Library, the stat block), the same tags, Save to library, export and import. Nothing is stored at build: the stat block's pick is read each time, so a creature put on the map by hand gets one too.
- **What "an animal or a mindless creature" is, for the pick:** PF2e's `animal` or `mindless` trait, or a stat block whose Intelligence makes its Mind "Animal" (-4 or less). Changing the Mind pick later does not change the pronoun.
- **A character whose Gender box is empty or unreadable is "they".** The box is read by its first telling word ("Female", "he/him", "she/they", "non-binary"); the profile's row for a character shows what was read and says to change it on the sheet.
- **"other…" takes two to five words** split by "/" or ",": subject, object, possessive, then the "theirs" and "themself" forms ("xe / xem / xyr"). Fewer than two words is no pronoun, and the line then says nothing.
- **The thinker is told its monster's pronoun** (`mind.pronoun`, as "she/her/her", packet schema 8, prompt version 31) and asked to use it in "reason" and "why". Other creatures stay labels there.
- **Left as "it" on purpose:** the thinker's instructions (`prompt.mjs`: they speak of any monster); a band's nature and plan lines and the Monster Minds help text (they are about a kind or a band); button names ("Do it", "Play it myself", "Let it get away": they are names the docs, the checks and the code use); "its card" and the like, where "it" is a spell, an ability or a card; a second creature in a sentence whose pronoun isn't at hand (the animal in a handler's plan refusal, the mover in a reaction's "not certain" line).

## How it works
- **`pronoun.mjs`** (pure). `PRONOUNS` are the line's picks. `formsOf(line)` gives the words to write with (`{ they, them, their, theirs, themself, plural }`); `fromGender(text)` reads a sheet's box; `guessPronoun({ traits, mind })` is the stat block's pick; `formsFromWords("she/her/her")` reads the packet's words back.
- **Markers.** A sentence about a creature is written in the "they" form with markers, and `pro(text, forms, forms2)` turns them: `{they} {them} {their} {theirs} {themself}` (a capital for a sentence's start), and a verb that must agree gives both forms, `{is|are}`, `{keeps|keep}` (the first for he, she and it). A marker marked 2 (`{they2}`, `{is|are|2}`) is about a second creature. With no forms the text reads as "it", exactly as before 0.30.1, so every pure function keeps its old output by default (`forms = IT`) and the unit tests from before still hold. Anything else in braces is left alone.
- **Who turns them.** Every pure function that makes words takes the creature's forms and returns finished text: `checkPlan` (from `ctx.pro`, in one pass over the reason), `describeStep`, `doneStep`, `describeChange`, `climbResult`, `followUpOutcome`, `routeWords` (`routeWordsIt` keeps the markers for `checkPlan`), `canCommand` (the handler, and the animal as the second creature), `resultWords`, `commandForPacket`, `commandLogWords`, `canPointOut`, `pointLines`, `previewLines`, `sideCardWords`, `sideLogWords`, `changedForPacket`, `speechFor`, `gestureWords`, `sayHtml`, `orderHtml`, `speechLogWords`, `canOrder`, `holdWords`, `logWords` (through `formsOf(tokenId)`), the notebook's `render`, `sideWords` and `forPacket`, `stepResult` and `historyOf` (through the namer's `formsOf`), `guiltLines`.
- **In the fight (`fight.mjs`).** `P(tok)` is a token's forms (`library.mjs` `pronounOf`: the sheet for a character, else the assembled profile's Pronoun line, else the stat block's pick). A request's `note`, `verdict` and `changeVerdict` are about the monster whose turn it is, so `save` and `saveTurns` turn their markers on the way in (`voiced`): nothing with a marker is stored. Text about anyone else (a party member's reaction, the animal, an ally) is turned where it is written, with that creature's forms.
- **In the windows.** `ui/turns.mjs` turns each card and row with its creature's forms (`formsFor`), and the whole plan card once. Monster Minds shows the row as pills with a box for "other…".
- **Nets.** A marker nothing turned must never show as a brace: the Monster Turns and History windows pass their HTML through `pro` once more, and a `preCreateChatMessage` hook does the same for a chat card's content and flavor. They read as "it".

## Checks
- (pn-1) {unit} The rules: markers for she, he, they, it and her own words, the verb agreeing; no forms reads as "it"; other braces left alone; her own words (two to five); a sheet's Gender box; the stat block's pick; the packet's words back as forms.
- (pn-2) {unit} The profile's line: first of the lines, filled by the stat block as the module's pick; a pick alone; "other" with her words; layers (her pick over the stat block, one monster's own over its kind's, a brief's row); the packet's three words and no pick id; Angel never replacing her pick unasked.
- (pn-3) {unit} The sweep: a plan's refusal, a step in words, what changed, the done step, a follow-up, Command an Animal (handler and animal), Point Out, changing sides, speech and yielding, orders, the notebook, the History's lines, Weight of Guilt's window, a route's words: each in the creature's own pronoun, and as before with none.
- (pn-4) {live,shared:minds} Monster Minds by real clicks as the GM: the Pronoun row above Mind with its tag; a thinking monster "they" and an animal "it" from the stat block; a pill clicked and saved for this encounter, the tag changing; "other…" with her own words; back to the stat block's; Save to library carrying it; one monster's own profile differing from its kind's; a character's row reading its sheet.
- (pn-5) {live,shared:card-ui} A fight on the test map with one monster set to "she" and one left "they": the plan card's steps and notes, a refusal, a chat line the module posts and the History's lines for those turns read "she/her" and "they/their" with the verbs agreeing; an animal reads "it"; a party member's row reads its sheet's pronoun.
- (pn-6) {live,shared:packet} The packet of a ticked monster carries `mind.pronoun` as three words; a plan through `fight_wait` and `fight_plan` from it is accepted and runs.
- (pn-7) {live,player} As the test player during that fight: no brace or marker in any chat card or window they see; a line about a monster reads with its pronoun.
- (pn-8) {live} No marker left anywhere after the fight: the Combat's flags, the chat log and the saved History page hold no `{they}`-style text.

## Traps
- **A sentence has more than one verb.** "{They} {has|have} yielded and stands down" read "They have yielded and stands down": every verb the subject governs needs both forms, not only the one after the pronoun (found by this release's own unit tests; the search that found the rest is in the change record).
- **"it" is often a thing.** "its card", "apply it", "nobody heard it", "Strike with it", "the turn it was made", "end it yourself": a card, a spell, an order, a weapon, a yield, a turn. Only a creature gets a marker, and only the creature whose forms will be used: a second creature in the sentence is named ("find ${target.name}"), not given the first one's pronoun (the independent review found two of each).
- **Code that matches wording.** `orderWords`' "some of its band" is matched by text elsewhere, and `actWords` strips a leading "its ": both were left as they are.
- **A marker survives `esc`** (it escapes only `& < > "`), so a card can be turned after it is built; but text the GM typed is in the same card, which is why only the exact marker shapes are touched.

## Open items
- A party member Angel plays (a character) has no pronoun line in its packet's `mind`: the thinker isn't told the sheet's pronoun, so its "reason" and "why" may not use it (found 2026-11-13 in 0.31.0's close-out on installed 0.30.1: Valeros, Gender box "M/He/Him", had `mind: { goesFor: "The wounded" }` only). The module's own sentences about it use the sheet.
- Swept in 0.32.0 (0.31.0's known gap): the model's reason on the plan card and Monster Minds ("leads {their} band") and a party member's row in Monster Minds ("Angel plays {them}").
- Not swept (they still say "it"): the thinker's instructions; band nature and plan lines; the "not certain" reasons of a monster's reaction to a player's move; a hearer's "is out of earshot (no sound reaches it …)"; the animal in a handler's plan refusal for a Command an Animal step that names a hostile animal; Monster Minds' and the Minds Library's own help text.
- A character's pronoun can't be set in Monster Minds: only on its sheet.
- A monster whose name is shown to players as "a creature" is still written with its pronoun in the lines players see (Weight of Guilt's window).
- The thinker's own words ("reason", "why") follow the prompt; nothing checks them.
- The chat net turns the exact marker shapes in any chat message's content and flavor, not only this module's cards (0.30.1 review 11): a typed `{they}` or `{a|b}` would be changed. Left so, because a card another module posts for a step is covered too.
