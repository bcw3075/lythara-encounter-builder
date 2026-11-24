---
feature: party-minds
files: [scripts/party.mjs, scripts/partyrec.mjs]
functions: []
dependsOn: [minds, history, packet, brain]
since: 0.45.0
---
A party member's mind learned from play: the party record kept from every fight, the Party section of the Minds Library (one page per party member, tied to its actor), Angel's suggestions waiting for the GM's Accept, and the profile a party member Angel plays is played by.

## Decisions
The GM's design of 2026-11-24 (9-1 to 9-8, in the project's plan, with her words):
- **9-1 What it is learned from: Foundry's own record and the session's cleaned transcript.** The module keeps what each party member did in every fight (chat cards of their rolls, spells and actions, their targets, where they moved and ended); the transcript adds why. The table bot's own transcript isn't used.
- **9-2 Where a profile lives:** in the Minds Library, one page per party member, tied to that character's actor by its Foundry id; the page keeps the name too, so if the actor is rebuilt or copied into another world the page is offered for relinking by name. It replaces the lines once written on a party member's token (a token belongs to one scene).
- **9-3 How a profile grows: suggested, she accepts each.** Each suggestion has its reason and waits for Accept or Keep mine (her standing rule for minds: everything waits for her OK).
- **9-4 What starts it: a daily check that runs itself** (a scheduled thread each morning; the module only holds the records and the suggestions).
- **The Party section, and party NPCs:** a section of its own in the Minds Library; a companion NPC in the party gets a page too and is refined the same way.
- **9-5 The profile's lines:** Role, Goes for, Fights by, Looks after, Spends, Takes risks, Notes; each learned line shows how many fights it is based on ("seen in 4 fights").
- **9-6 The layout (her pick on the sample: "Good start, we can refine from there"):** the party above the monster peoples with a gold count where suggestions wait; the page says which actor it is tied to and what it was learned from; each line tagged "Angel · seen in N fights" or "yours", one seen in a single fight orange; a gold box of suggestions, each with its reason and Accept / Keep mine; Relink and Export at the foot; on a map's Monster Minds a party row says it plays by its profile and links to the page. Her words are never overwritten by Angel.
- **9-7 The first profile: Angel drafts, she accepts.** From the character's sheet, the player-safe part of its campaign page and past session records, each line a suggestion.
- **9-8 Who sees it: GM only for now.** (A player-facing copy elsewhere is a later idea, not designed.)
- **Angel's calls (agreed):** only how the character fights is learned, never anything about the player as a person or out-of-character talk; a fight Angel played for that character isn't learned from; a fight she Discards isn't learned from; Foundry's record wins over the transcript on what happened; the profile is used only while Angel plays that character, and names in it reach the thinker as labels through the name gate.

Settled by Angel at the build, told to the GM, hers to change:
- **`set` writes only her words** (the build review): Angel's words reach a page only as a suggestion she accepts (9-3).
- **A fight with a party record asks Save or Discard at End Encounter**, even when she played every monster herself: a fight that isn't saved is never learned from, and the record rides on the saved History page. Before 0.45.0 such a fight ended without the question.
- **Who has a page:** a character on the party's side, or any member of PF2e's party actor. "Add a party member…" makes one for any character. A player's character is listed as "player", one no player owns (a companion) as "companion".
- **A suggestion for a line that has one waiting replaces it** (the newer reading of the same line); a suggestion the same as the line, or as words she kept out before, is dropped, so the daily check doesn't ask twice.
- **Accept writes the line as Angel's** (the words are Angel's, tagged with the fights it was seen in); editing it makes it hers.
- **The old token lines** (the monsters' shape) carry over to a new page where they mean the same: Goes for, Fights by and Notes.
- **Relink by name ignores brackets,** so a test copy "Odile Fenn (L5 test)" is offered "Odile Fenn" in another world.

## How it works
- **The record (`partyrec.mjs`, runner only):** `createChatMessage` keeps the ids of every card a token in a running fight speaks, by token; at each turn change (`combatTurnChange`, and `updateCombat` with a turn or round in it, which also gives the first turn; one at a time through a queue, the same change heard twice skipped) only that fight's tokens' cards are taken, and the open turn is closed: its cards read by `cardFacts` (context type, origin type, item, the flavor's action title, the target or Toolbelt's targets, outcome, rank, cantrip or focus, damage) into acts (`party.mjs` `cardAct`: saves, flat checks, damage taken and initiative aren't kept; a damage roll joins its Strike), how far it got (start square to end square), HP before and after, what it spent (`purse`: prepared slots not yet cast, spontaneous slots left, focus, hero points, consumables by name), and who stood near it at the end (`standing`: allies within 10 ft, foes within 10 ft, the nearest foe). Cards a party member speaks on someone else's turn are a record of their own (`own: false`). The new turn opens with a snapshot if it is a party member's (its actor id and name kept, so a token deleted mid-turn still leaves what its cards showed); anyone else's turn opens with only its round and time, so what the party does on it is filed under the right round. `open` is replaced whole at each change. All of it is the Combat's flag `partyLog` (`turns.<key>`, `open`). A turn whose start came before the runner's page loaded, or that began while another page was the runner, is marked `partial`.
- **Angel-played:** a turn is marked `angel` when the creature's Angel tick was on at its start or end; `recordByMember` marks the whole fight for that character, and nothing learns from it.
- **Saving:** `saveHistory` closes the still-open last turn by the cards' times (`partyRecordOf`: its own cards and the other party members' on it), writes a "The party's turns" section in words on the page, and keeps the record on the page's flag `partyRecord`. The saved-or-not signature includes `partyLog`; End Encounter asks when there is one.
- **The pages:** library entries of type `party` (`cleanPartyEntry`: key `party:<actor id>`, name, kind, class, lines `{ text, by, at, seen }`, suggestions `{ id, line, text, why, seen, session }`, declined words, the fights and sessions learned from). `minds.mjs` `cleanEntry` hands them to `party.mjs`, so the library's cache, Export and Import carry them like any entry.
- **API (`api.minds.party`):** `list`, `get(actor | id | key)`, `ensure(actor | id)`, `set(ref, lines)` (her words only: written for her when she asked; Angel's words reach a page only as suggestions), `suggest(ref, { session, fights, suggestions })`, `answer(ref, id, "accept" | "keep")`, `relink(ref, actorId)` (the old actor id is kept in `formerIds`, so fights saved under it still count), `lost()`, `records({ since })` (every saved fight's party record by night, with what each page hasn't learned from), `recordOf(combat)`, `open(ref)`.
- **The packet:** `mindOf` gives a party-side creature whose page has at least one line `partyForPacket` (an empty page leaves the token's old lines in force): `mind: { profile: "party", pronoun, role, … }`, each line through the name gate, a learned line ending "(seen in N fights)"; `mindLayers` gives such a creature no layers. Packet schema 13, prompt version 39.
- **Windows:** the Minds Library's Party section (`partyPage`), and Monster Minds' party rows (`partyHtml`: plays by the page, or Make a page). GM only: `openLibrary` draws nothing on a player's page.

## Checks
- (pm-1) {unit} A page: key from the actor, known lines only, whose words, seen counts, caps; minds.mjs hands a party entry to party.mjs.
- (pm-2) {unit} Whose words: Angel never replaces hers unless `force`; null takes a line away.
- (pm-3) {unit} Suggestions: one per line waiting, the same as the line or as words she kept out dropped, the fights and session counted.
- (pm-4) {unit} Accept writes the line as Angel's with its count; Keep mine remembers the words.
- (pm-5) {unit} Tags: yours, Angel seen in N (orange at one), drafted.
- (pm-6) {unit,shared:packet} The packet: profile party, pronoun, labels for perceived names, a line naming someone unseen held back whole, fixed order.
- (pm-7) {unit} A token's old lines carried over; relink candidates by name.
- (pm-8) {unit} The record: cards to acts, a damage roll joined, feet, spending, standing, a turn in words.
- (pm-9) {unit} By member; an Angel-played fight not learned from; fresh fights; the saved page's section.
- (pm-10) {unit} A party page exports and imports (new, the same, different here).
- (pm-11) {unit,shared:brain} The hello (prompt 39, packet 13) explains a party profile.
- (pm-12) {live} A fight on the test scene with party members played by real clicks as the test player (a Strike, a spell, a move) and by the GM: the Combat's `partyLog` has each turn with its acts, move, spending and standing; a reaction on a monster's turn is its own record; Save at End Encounter puts "The party's turns" on the page and `partyRecord` on its flag; `api.minds.party.records()` lists it.
- (pm-13) {live} Discard at End Encounter leaves no record anywhere; a fight with a party member ticked Angel is marked Angel-played for them and `records().fresh` leaves it out.
- (pm-14) {live} The Minds Library by real clicks as Angel: the Party section above the peoples with counts; a page made from a no-page row; a line edited (tag "yours"); a suggestion accepted (tag "Angel · seen in N") and one kept (gone, and refused when suggested again); Relink to another actor and back; Export of one page and Import of it (all the same).
- (pm-15) {live} Monster Minds: a ticked party member with a page says it plays by its profile and opens it; one without says so and Make a page carries its token lines over.
- (pm-16) {live,shared:packet} A ticked party member's packet carries its page's lines (`profile: "party"`), a line naming an unseen creature held back; an API-route or chat plan for it is accepted.
- (pm-17) {live,player} As the test player: the Party pages aren't openable (the library journal isn't theirs), and what their browser holds is noted.

## Traps
- **A player's character is never played by the module** (B-7): ticked, it shows "a player's" in Monster Minds, so a party page's packet is only ever built for a companion the GM ticked or an away player's character handed to Angel; test the packet with a companion.
- **PF2e action cards from `game.pf2e.actions` carry no `flags.pf2e`** (the traps doc): their title is read from the flavor's `<h4 class="action"><strong>`.
- **A chat card's `timestamp` is the creating browser's clock:** only the fight's last turn, closed at save on another page, is found by time; every other turn by the ids the runner heard.

## Open items
- Two GM pages writing the same party page within a moment: the library cache is dropped before each write, but the later write still wins whole.
- Wand and staff charges aren't counted in what a character spent (slots, focus, hero points and consumables are).
- A runner reload in the middle of a turn loses that turn's earlier cards (marked `partial`).
- Movement is start square to end square, not the path walked.
- A reaction taken without a card (a Shield Block applied by hand) leaves nothing in the record.
