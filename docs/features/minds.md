---
feature: minds
files: [scripts/minds.mjs, scripts/library.mjs, scripts/ui/minds.mjs]
functions: []
dependsOn: [packet, brain, builder]
since: 0.24.0
---
Monster minds: a behaviour profile for every monster (six lines and notes) read from layers, the Minds Library that keeps them for reuse, and the two windows to read and edit them. Release 1 of 4.

## Decisions
Rhea, 2026-11-10, question by question (the design and its independent review are in the project's design doc; this is what release 1 builds):
1. **Profile shape: "A short form plus notes."** Six lines and a free notes box: Mind; Goes for; Fights by; Gives up; Works with others; Knows about its enemies.
2. **The picks are examples, not fixed lists** ("I hope those were just examples in each category"): every line takes her own words, with suggestions. Only **Mind** and **Works with others** keep a fixed pick underneath, because the module acts on them (how clever a plan may be; who will share a group plan).
3. **"Goes for" is not all or nothing:** a starting order plus what shifts it, weighed again at every plan and re-plan (the prompt says "a leaning, not a lock").
4. **Per kind, with any one monster able to differ:** a monster given its own profile stops following its kind's.
5. **A library, in Foundry** ("an efficient library system where all of the mind data will be stored so it can be reused"; "In Foundry", not the campaign notes).
6. **Profiles completely replace the Tactics page** ("This is the upgrade to that first version"): the profile is the one home for how a monster behaves; a brief's tactics text becomes that kind's Notes for the encounter; the build's journal has no Tactics page.
7. **Four releases,** each usable on its own: (1) profiles, the library and its windows, every turn going through the profile; (2) fight memory; (3) group nature, the shared plan and the leader's orders; (4) the fight-start look with Accept / Keep.
8. **The window samples** ("Looks good for a starting point"): kinds on the left with a single monster's own profile under its kind; the lines on the right with a tag saying where each comes from; a warning under a line that names a party member; Give one monster its own profile, Save to library, Save for this encounter; the library as one people with its kinds side by side, "same" for an inherited line.

Settled by Angel, told to Rhea, hers to change:
- **Five Minds:** Mindless, Animal, Simple, Cunning, Trained tactician. **Four ways of working with others:** On its own, With its pack, Follows a leader's plan, Is the leader. Their meaning is in the prompt, once.
- **From the stat block when nothing is written** (so nothing plays blank; marked as the module's guess): the Mindless trait; otherwise Intelligence (-4 or less Animal, -3 or -2 Simple, -1 to +2 Cunning, +3 or more Trained tactician); a mindless creature works alone, an animal with Pack Attack with its pack and alone without it, anything that thinks follows a leader's plan.
- **A party member Angel plays** has only a profile the GM writes for it herself: never the monsters' library.
- **Who wins when they pull apart** (design review 11), in the prompt: the rules and its conditions, then what the GM asks for this turn, then Notes, then the rest of its mind. Orders and a band's plan take their places in release 3.
- **Allies' deeds this round and the side's tally** (design review 15) are left for release 2, with fight memory.
- **No page for minds in the build's journal:** the Monster Minds window is the one place to read and edit.

## How it works
- **A line** is `{ pick?, text, by, at? }`: `by` is whose words they are (`gm`, `angel`, or `module` for a stat-block guess). `{ blank: true }` is a line left empty on purpose, which stops the layers below from filling it; a missing line inherits. Caps: 600 characters stored (2,000 for Notes), 240 sent (600 for Notes).
- **Layers, most specific first** (`assemble`): what was agreed in this fight (the Combat's `minds` flag: `own[tokenId]` or `kinds[{ kind, lines }]`; nothing writes it until release 4, but it is read from now on); the monster's own; this encounter's for its kind; its kind in the library; its people in the library; the stat block. For each line the first layer that says anything wins whole. An own profile is the whole profile: with one, the encounter, kind and people layers aren't read.
- **Where each layer lives:** this encounter's lines and single monsters' own profiles are in the **brief** on the scene (`creatures[g].mind`, `creatures[g].own[n]`), so Rebuild keeps them and a chat can write them with the brief; `cleanBrief` carries `minds: 1` (the schema). A row's old `tactics` text is read as its Notes when the row has none (so a build from before 0.24.0 still plays its tactics) and is never stored again. Monsters the build didn't place: the scene's `minds` flag (a list of `{ kind, lines }`: a kind's key has dots, which a flag's key can't) and the token's own `mind` flag. `band` and `leader` are stored on the brief row and the built token from now on; nothing acts on them yet.
- **A kind's key** (`kindKey`): `src:<compendium uuid>` when the creature came from a compendium (a built copy's actor names its source in its flag; a world actor by its `_stats.compendiumSource`), else `name:<slug>|<level>`. Elite and Weak are the base kind (the prefix off the name, the level put back). A kind names its people explicitly; the module never guesses it.
- **The Minds Library** is one journal (flag `mindsLibrary`), no ownership for anyone, one page per entry with the entry in the page's flag `mind` (`{ schema, type: people | kind | band, key, name, people, lines }`); the page's own text isn't used. Read through a cache that the journal-page hooks drop. Writes replace the flag whole (`==`). "Knows about its enemies" is never kept there. Export is a JSON file (`what: "minds-library"`, the schema); import shows new / the same / different-here and replaces a different one only where the GM ticks it; a file from a newer schema is refused.
- **Whose words:** `applyLines` never lets a write by Angel replace a line whose words are the GM's unless `force`; the skipped lines come back in `skipped`.
- **The packet** (`perceive.mjs`, schema 2): `mind` is the first key after `schema` and byte-stable for the fight; `you.tactics` is gone. `forPacket` writes each line in words (a pick's label, then her words) in fixed order, blank lines left out, with `pick: { mind, worksWith }` beside them. Free text goes through `noteForThinker` (the Change note's gate, now with a length): a party-side name becomes that creature's label when the monster perceives it or knows it as an ally; a line naming anyone else, or a name that fits several, is **held back whole** (a held line with a pick still sends the pick). Held lines are saved on the request (`mindHeld`) and the card says so.
- **The prompt** (version 24): what each line means, the five Minds and four ways of working with others, "never plan above its Mind", the order of who wins, and to ask for the hello again after a summarized chat.
- **Windows** (`ui/minds.mjs`): Monster Minds per scene (the Encounters tools, and `api.minds.open`): build rows, kinds the build didn't place, party members Angel plays; edits sit in a draft until Save; "back to kind's" takes this encounter's line away; clearing a line over something inherited saves it blank on purpose. Minds Library: peoples on the left, one people with its kinds as columns, a cell opens an editor, New people, New kind (by creature search), rename or move, remove, Import, Export.
- **API** (`api.minds`): `rows`, `profile`, `layers`, `of`, `kindOf`, `set(scene, ref, lines, { by, force })` with ref `{ row }`, `{ row, n }`, `{ kind }` or `{ token }`, `giveOwn`, `dropOwn`, `open`, `openLibrary`, and `library.{ list, get, put, remove, export, import }`.

## Checks
- (mi-1) {unit} The rules: lines and caps, the kind's key (compendium source, Elite and Weak, name and level), the stat-block guess, layers and their order (own stops kind; blank stops inherit; this fight on top), the packet (labels for perceived names, a line held back whole, fixed order, the same bytes twice, nothing left is no mind), warnings at save, whose words, the library preview, entries, export and import, the brief's encounter layer.
- (mi-2) {live,shared:packet} On the runner with a ticked monster: the packet's first key after `schema` is `mind`, there is no `you.tactics`, and the lines come from the right layer in turn: the stat block alone; a people and a kind put in the library; this encounter's line over them; one monster's own (its kind's lines gone); two packets of one monster in one fight carry the same `mind` bytes.
- (mi-3) {live,shared:packet} The name gate: a Notes line naming a party member is left out of the packet of a monster that doesn't perceive that creature (`mindHeld` on the request, the line on the card) and arrives with the creature's label for one that does; no party member's name anywhere in either packet (with pk-2).
- (mi-4) {live} Monster Minds by real clicks as AI: the build's kinds and their counts; a line edited and saved for this encounter with its tag changing; the warning under a line naming a party member and under a stat word; back to the kind's; a line cleared on purpose; Give one monster its own profile, then Follow its kind again; Save to library with its preview, a line unticked staying with the encounter, a new kind getting its people.
- (mi-5) {live} Minds Library by real clicks as AI: New people, New kind by search, a cell edited, same and blank on purpose, a party member's name refused, rename and move to another people, remove (a people's kinds stay), Export, then Import of that file (all the same), of an edited copy (different here: keep mine, then replace) and of a file with a newer schema (refused).
- (mi-6) {live,player} As the test player: the library journal isn't in their sidebar or openable, the Encounters tools aren't there, and what their browser holds of the library and of a scene's brief is recorded.
- (mi-7) {live,shared:builder} A build from a brief with `tactics` on one row and `mind`, `own`, `band` and `leader` on another: no Tactics page; the first row's Notes are its tactics; the tokens carry `band` and `leader`; Rebuild keeps this encounter's lines and the single monster's profile; a build made before 0.24.0 gives its tactics as Notes.
- (mi-8) {live} As a chat would: `api.minds.set` and `api.minds.library.put` with `by: "angel"` leave a line the GM wrote and name it in `skipped`; with `force` they replace it.
- (mi-9) {live,shared:brain} The hello carries prompt version 24 and packet schema 2 with the mind section; a turn planned through `fight_wait` and `fight_plan` from a packet with a mind is accepted and runs.
- (mi-10) {live} A party member with the Angel tick: no mind from the library or its stat block; one written for it in Monster Minds reaches its packet.

## Traps
- **A kind's key can't be a flag's key:** it has dots (a compendium uuid), which Foundry reads as a path. Per-kind data on a document is a list of `{ kind, … }`.
- **Replacing an object in a flag needs `==`:** a plain update merges, so a line taken away would come back. `{ "flags.<id>.==brief": … }` and `==mind` replace whole (seen on 14.370, 2026-11-10: both the dotted and the nested form).
- **A profile's text may name its own allies' kinds freely:** only party-side creatures, the world's characters and users are run through the name gate. A character's every long word counts as its name, so a party member called by a common word holds lines that use that word: the window's warning says which name.

## Open items
- The brief sits in the scene's flags, which every browser receives: a player who opens the console can read this encounter's lines (as they could read a brief's tactics text before 0.24.0). The library journal is GM-only; what reaches a player's browser of it is check mi-6.
- The card names which lines were held back, not the name that held them (Monster Minds shows it under the line).
- No step for surrender or parley: "Gives up" ends in a `flee` or `none` with the reason said (design review 15, noted for release 3).
- A profile can't hold back an Auto monster's Reactive Strike (design review 15).
