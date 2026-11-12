---
feature: speech
files: [scripts/speech.mjs]
functions: [fight.mjs:liveFlag, fight.mjs:inTracker, fight.mjs:playerWords, fight.mjs:unseenByParty, fight.mjs:yieldOf, fight.mjs:prisonerOf, fight.mjs:fellWord, fight.mjs:speechCtx, fight.mjs:playerNamer, fight.mjs:myLanguages, fight.mjs:partyUnderstands, fight.mjs:sayChat, fight.mjs:onRenderSay, fight.mjs:runSay, fight.mjs:passTurn, fight.mjs:passAfter, fight.mjs:speechLog, fight.mjs:closeRequests, fight.mjs:acceptYield, fight.mjs:endYield, fight.mjs:refuseYield, fight.mjs:backInFight, fight.mjs:yieldedList, fight.mjs:prisonerList]
dependsOn: [orders, bands, packet, turn-loop, brain, memory, card-ui, history, reactions]
since: 0.29.0
---
Speech to the party and yielding (monster minds release 3, tier 3c): a `say` step, one sentence a round, shown in chat to each player by their character's languages; a monster the GM has hidden speaks as "A voice"; a monster that yields stands down until the GM answers on its row with Accepted (a prisoner) or Fight on.

## Decisions
Rhea, 2026-11-11 (the design and its review against the code are in the project's design doc, R3-4 and R3-7 and the review's findings 3, 10 and 11; this is what tier 3c builds of them):
1. **Monsters can speak to the party (R3-7):** one sentence a round, free, a public chat line; used to yield, to bargain or to threaten. A bargain is hers to play out: Angel opens it with one line, then the monster stands down or carries on.
2. **Who may talk: any monster** (over "leaders only" and "a setting"), asked 2026-11-11. Only a creature that knows a language has words; one sentence a round each.
3. **The line is shown to each player by their character's languages (R3-4):** one public message; a player whose character knows the language reads the words, the others read "Shouts something in <language>."; she always sees the words. Not whispered. The module reads the party's languages only to choose what each browser shows: that never goes to a thinker.
4. **A monster the GM has hidden speaks as "A voice"** (over "no line" and "the line as usual"), asked 2026-11-11: players see the speaker as "A voice" and "A voice shouts something in <language>." or the words if they know it, with no name; she sees who it is.
5. **Yielding is a real state (R3-7):** a monster that yields stands down: no hostile actions, its turns pass by themselves, and its row on Monster Turns gets **Accepted** (out of the fight, left on the map as a prisoner) and **Fight on** (the party refuses). Hit after it yields, it goes back to its own mind (fights or runs). A leader can order a band to yield; Discipline decides who obeys. Whether a kind ever yields comes from its "Gives up" line.
6. **She was shown sample pictures before any code** (the chat line as a player who knows the language, as one who doesn't, and a hidden monster's with her own view; a yield's sign; a yielded row with Accepted and Fight on; a Prisoners list) and answered: "They look good".

From the design review, kept as built:
- **A yielded monster's turn is passed by the module (review 3):** one request that says so, nothing asked of the thinker; it takes no reactions; any plan for it is refused; its packet word for others is `yielded`; Accepted closes its open requests, as Let it get away does.
- **Only an enemy's blow ends a yield (review 3):** healing, lasting damage, and damage from its own side or from nobody a card names leave it standing down.
- **The chat line stores the safe text (review 11):** the message's own content is what a player without the language reads; the words are in its flag, and each browser's render hook shows them to a GM and to a player who understands. The line is forced public. Labels in a sentence are never turned into party names the monster doesn't know: a label said aloud reads "that one".
- **A yield reads without the language (review 11):** a line of what the monster does goes with it, for everyone.
- **A player sees the words if any character they own in the fight knows the language (review 10);** with none in the fight, the character assigned to their account.

Settled by Angel, told to Rhea in the release note, hers to change:
- **The language it speaks:** Common when it has it, else the first on its sheet. The module never picks by what the party understands: that would tell a monster what its enemies know.
- **A creature with no language can still yield,** without words: it shows it. One that can't act (paralyzed, unconscious) can't.
- **The yield's sign** is "Drops its weapon and throws up its hands." for a creature holding something, "Backs down and stops fighting." for one that isn't (a wolf drops no weapon).
- **One yield a fight:** after Fight on, a blow, Play it myself or Back in the fight it doesn't yield again in that fight (its packet says why). It may still speak.
- **A yield is its plan's last step and leaves an action unspent before it;** a threat or a bargain comes before its last action, like an order (a re-plan with no actions left ends the turn before it speaks).
- **Its turns pass by themselves, ticked or not, Auto or not** (her sample: "its turns pass on their own"), two seconds after they begin, waiting out the game's pause.
- **Play it myself** on a yielded monster's card sets the yield aside and takes its Angel and Auto ticks off: she plays it.
- **Back in the fight** on the Prisoners list (Angel's addition, said so with the samples): the prisoner joins again where it stands and rolls initiative, as a monster brought back does.
- **A prisoner counts for its side as yielded,** apart from down and fled, and its band treats a leader that gave itself up as fallen (the band's "If the leader falls" pick is acted on; Fights harder has nobody to avenge, so the plan stands).
- **A leader's orders from hiding still post no line** (tier 3b's rule: an order isn't said to the party, and the line would give an ambush away). Her answer on a hidden monster's speech is applied to speech to the party.
- **An order's line for a player who knows the language** is the sentence the leader shouted when it said one, else what it ordered in names made for players: a creature the GM has hidden is "someone", a kind is "some of its band" (a kind's name can be a hidden creature's), and an order in her own words shows them nothing more than "Shouts something".
- **A hidden monster that yields without words** posts no line (nothing a player may see): its row and card tell her.
- **Speaking keeps a hidden creature hidden,** as an order does (speech is no action), and one that every player's character on the map has hidden or undetected (Visioner) speaks as "A voice" too. **Giving itself up shows it:** a yield brings it out of hiding first, like any action that isn't Hide, Sneak or Step.

## How it works
- **The rules** (`speech.mjs`, pure): `cleanSay` gives `{ intent, words }`; `speechFor` says whether it may speak and whether it may yield, with the reason; `speechForPacket` the packet's block; `speechLanguage`; `gestureWords`; `understands`; `sayHtml(flag, view)` writes the line for one browser (no view: the stored text); `orderHtml` an order's line for a player who understands; `breaksYield`; `speechLogWords`.
- **Where it is kept:** on the Combat's turns flag, `speech.last.<token>` (the round it last spoke in) and the log lines beside the band log (`orders.log`, kinds `accepted`, `fighton`, `struck`, `own`, `back`). On the token: `yielded` (`{ round, at, combat, words, lang }`), `prisoner` (`{ round, at, combat, yielded, words }`) and `yieldOver` (`{ round, how, combat }`). Each is read only while its fight is still going (`liveFlag`), so a flag left by a finished fight means nothing.
- **The `say` step** (`turn.mjs` `checkPlan`, `runSay`): free (`COSTS.say` 0), one a plan; `{ do: "say", intent: "yield" | "bargain" | "threat", say }`. `runSay` writes the step's record and the round's sentence in one update, marks the token for a yield, then posts the line. A yield returns "yielded": the request is done and `passAfter` ends the turn.
- **The packet** (schema 6): `speech` (`can`, `why`, `canYield`, `yieldWhy`) after `orders`; `yielded: true` on a creature in `perceived` or `allies` that stands down or is a prisoner. The side's tally counts yielded members apart.
- **The chat line** (`sayChat`, `onRenderSay`; `onRenderOrder` for orders): one public message whose flag `say` holds `{ words, lang, langName, intent, gesture, voice, who }`. A hidden speaker's message has no token or actor, only the alias "A voice".
- **A yielded monster's turn** (`onTurnChange` → `passTurn`): a request with `state: "done"`, `passed: "yielded"` and a note; `passAfter` then calls `nextTurn`. When the yield ends during its own turn (`onTokenFlag` sees `yieldOver`), the turn is asked for after all: a passed request doesn't block it.
- **The answers** (`acceptYield`, `refuseYield`, `backInFight`; any GM's page): Accepted moves the flag to `prisoner`, closes the token's open requests and deletes its combatant (which hands the turn on by itself); Fight on and Play it myself write `yieldOver`; an enemy's blow does the same from the runner (`onMemoryCard`, the damage-taken card). `fellWord` is what a band is told of a member: a creature that stands down reads "yielded".
- **The window** (`ui/turns.mjs`): a yielded monster's row has the two buttons where its ticks were; a card for each with what it said; a Prisoners list under Escaped.
- **API** (`speech` under `api.fight`): `yielded(combat)`, `prisoners(combat)`, `accept(combat, tokenId)`, `fightOn(combat, tokenId, { own })`, `back(combat, tokenId)`: the GM's buttons, never Angel's door.

## Checks
- (sy-1) {unit} The rules: a say step cleaned, who may speak and yield and why not, the packet's block, the language, who understands, the line as stored, for a player who understands, for the GM and for a hidden speaker, an order's line for a player, what ends a yield, the log's words, the `say` step through the plan check (each refusal, a yield without words, a yielded monster's plan), the order to yield, the packet's schema and the yielded mark, the side's tally, the History's line, the prompt.
- (sy-2) {live,shared:packet} On the runner: a monster with a language has `speech.can` and `canYield` true; one with none `can` false with the reason and `canYield` true; after it speaks, a later packet in the same round says `can` false; keys in the order `orders`, `speech`, `you`; a party member the GM plays has no `speech`; a yielded monster reads `yielded: true` in an ally's and an enemy's packet; scan the block for PC names.
- (sy-3) {live,shared:turn-loop} The `say` step through `api.fight.checkPlan` on the runner (two in a plan, after the last action, a yield not last, one with no language threatening), then by real clicks as AI: Do it on a threat posts the line and the plan goes on with no Next step press; a second sentence in the same round is refused; a reload of the runner after the line doesn't post it twice.
- (sy-4) {live,player} The chat line: public, nothing whispered; AI reads the words, the kind and "understood by n of the party's m"; the test player with a character that knows the language reads the words; with one that doesn't, only "Shouts something in <language>."; a monster the GM has hidden shows as "A voice" to the player, with no name anywhere on the player's page, and AI reads who it is.
- (sy-5) {live,player} An order's line (tier 3b's od-6 again): the test player whose character knows the leader's language reads the sentence, or the order in players' names when none was said; one who doesn't still reads "Shouts something in <language>.".
- (sy-6) {live} A yield by real clicks as AI: the plan's last step yields, the line has the sign, the turn ends by itself without Auto; the row shows "yielded, round n" with Accepted and Fight on, the card has what it said; its next turn passes by itself with a note and nothing is asked of the thinker; it is offered no Reactive Strike; a plan handed in for it is refused.
- (sy-7) {live} The answers, each on a fresh yield: Accepted (out of the tracker, still on the map and shown, in the Prisoners list, its open requests closed; on its own turn the next creature is up and is asked for); Fight on (ticks back on its row, its next packet says it can't yield again and why); Play it myself (its ticks off); Back in the fight (in the tracker with an initiative); a second GM's press finds the buttons grey or reads "Already done.".
- (sy-8) {live} Struck after yielding: a party member's Strike applied to it ends the yield (its row's ticks are back, the log line names the striker); lasting damage at its turn start and healing don't.
- (sy-9) {live,shared:history} History: the say step with its language, the yield, and a line of their own for Accepted, Fight on, a blow and Back in the fight; Save to journal carries them; "changed since saved" after an answer.
- (sy-10) {live} A leader that yields: its band's next packets carry `bandNow` with "has given itself up" and the band's pick is acted on once; an order to yield reaches the hearers' `orders.heard`.
- (sy-11) {live,shared:brain} The hello carries prompt version 29 and packet schema 6 with "Speaking to the party"; a turn planned through `fight_wait` and `fight_plan` with a `say` step is accepted and runs.
- (sy-12) {live} The languages as PF2e holds them: a character's and an NPC's list read by `langsOf` on the live server match their sheets.

## Traps
- **The stored text is the safe one.** A browser the render hook never reaches (a popped-out message, an export, a page with the module off) shows the message's own content, so that must be what a player without the language may read. Never store the words as the content and hide them in the hook.
- **A yield is two documents** (the Combat's record and the token's flag): the record is written first, and `runSay` marks the token again when a reload fell between them. Accepted and Back in the fight are ordered so that a cut-off press leaves a monster that reads as yielded, with its buttons: a prisoner still in the tracker is one that stands down (`yieldOf`), which is also what the GM gets when she puts a prisoner back in the tracker by hand.
- **The pass timer lives on the runner's page only:** `passTurn` starts it again for a turn that is already passing, so a reload or a pause doesn't leave the turn sitting.
- **A leader that gave itself up has fallen once; struck down later, it falls again** (`settleBandsNow` lets a fall recorded as "yielded" be followed by a real one, so Fights harder still gets its objective).
- **`passTurn` and `onTurnChange` pin the round they were called in.** A turn asked for late could wait out the settle time while the round moved on and the same creature came up again: it was then stamped with the new round beside that round's own request (0.28.0's u-81, two requests for one turn).
- **Deleting the current combatant hands the turn on by itself:** Accepted never calls `nextTurn` first (the fleeing doc's trap).
- **A label's letter says nothing about sides,** so the blow that ends a yield asks the creatures themselves (`isEnemyOf`).

## Open items
- When she plays a monster herself there is no button to make it yield or to post a line by languages: a yield comes only from a plan (Angel's, or one handed in through the API). Wanted or not is hers to say.
- A yield that ends on the very turn it was made (Fight on, or a blow, before the turn has passed) leaves that turn over and nothing ends it for her: the card says to end it herself, and the monster acts again on its next turn.
- Two GMs pressing different answers for one monster in the same instant can both land (a prisoner logged as refused too); Back in the fight pressed by two GMs at once can make two combatants. One press greys the buttons on the page that pressed, and the other page's follow once the change arrives.
- While a leader that gave itself up stands down, a band whose pick is Fights harder is told its leader "has given itself up" beside that pick's words; nothing changes until the leader is really struck down.
- A yielded monster stays in the group ticks' counts; a tick there changes nothing while it stands down.
- A prisoner's token is left as it is at End Encounter (flags of a finished fight are read as nothing).
- A blow applied with no card, or from a card that names no attacker, doesn't end a yield: Fight on does.
- Telepathy, and a language a creature understands but can't speak, aren't told apart (orders, open items); a player's character with a magical gift of tongues is read only by the languages on its sheet.
- A monster whose name doesn't show to players speaks under whatever name PF2e's own name-hiding gives its messages; the module doesn't hide it a second time.
- A reload of the runner's page between a sentence's record and its chat line leaves it said with no line in chat (the History has it), as for an order.
- A monster on the party's side never speaks or yields through the module.
- The thinker isn't told whether anyone understood what it said.
