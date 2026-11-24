---
feature: ask-angel
files: [scripts/askprompt.mjs, scripts/askangel.mjs]
functions: []
dependsOn: [builder, api-route]
since: 0.43.0
---
Ask Angel inside Foundry (F-7): a chat box in the Build window, answered by the bridge's API worker, which reads the map's journal notes (and, with a read-only key, the campaign's Notion pages) and fills the window in; the GM checks, Previews and Places.

## Decisions
- **Ask Angel is a chat box answered by the bridge's API worker (F-7, Rhea 2026-11-24, 1:02 to 1:07 AM: "can we comuncate useing the Ask Angel button kinda thing so I don't need to leave foundry?", then "We can use a Key for that, though we can also use jurnal notes in the game"):** the box replaces "say it in your chat", which a coordinator project doesn't have. Angel reads the map's Foundry journal notes first, then Notion directly through a read-only integration key (only the pages Rhea shares with it, kept in the bridge's config.json on the server PC beside the API key, pasted by her) when the notes don't cover it. Angel fills the window and never places by script: Rhea checks, Previews and Places. At the table it is mostly for random encounters; planned ones are set up before the game by a prep thread, which reads Notion and writes the map's journal notes (and may fill the window through `api.submitBrief`).
- **Angel's calls on the small points (2026-11-24, recorded for Rhea to judge):**
  - The Notion key isn't made by this release: it is Rhea's to create and paste (the steps are under Open items). Without it the worker offers no Notion tools and Angel searches the world's journals instead.
  - A prep thread leaves Place to Rhea too, in prep as at the table (F-7 left this open for build time): "never places by script" stays the one rule. She can change it.
  - Sonnet answers by default (a few cents an ask, each answer shows its cost); the world setting "Ask Angel's model" (`askModel`) picks Opus or Fable. The advisor tool was weighed and not used: an ask is one fill-in with lookups, where a single model plans well enough; prompt caching is used (the prompt and tools, and each round of lookups reads the earlier ones from the cache).
  - The conversation stays on the map (the newest 20 messages) until New conversation, so "make it harder" follows on. Each message is answered once; while Angel works the box is closed to a second message.
  - Angel's brief replaces the window's, but a line in a creature's notes the GM wrote stays (`mergeBrief`); a creature or item Angel names that isn't real is left out, and her reply says so. Only the GM who asked has the window filled; another GM sees the conversation.
  - The journal notes Angel reads are put together on the runner's page when the worker asks, so no journal text is written into a scene flag. The party's sheets go as levels only, never names.
  - After 150 seconds with no answer (`ASK_WAIT_S`) the box says what answers need; an ask stays open 10 minutes (`ASK_TTL_S`), so a late answer still fills the window.

## How it works
- **The box (`ui/build.mjs`, `BuildApp`):** a fieldset "Ask Angel" under the purpose box: the conversation, a status line (thinking with the seconds, the wait words, or why the last ask failed), the message box (Enter sends, Shift+Enter is a new line), Send to Angel and New conversation. The action bar's Ask Angel button takes the cursor to the box. While an ask waits (unanswered and under 10 minutes old) the box is closed to another message; past that it says the ask lapsed and opens again. A retry after a failed or lapsed answer replaces the unanswered message. The ask's time is the server's clock (`game.time.serverTime`, which starts again from 0 each time the world is launched): an ask that reads as from the future lapses. An answer is taken only when no Preview is running (else when it ends); what is typed in the window is read in before the hook re-draws it. An `updateScene` hook re-draws the window when the scene's `askAngel` changes and takes an answer's brief (`takeAnswer`), once (`answer.applied`); a window opened later takes an answer it hasn't taken. The brief taken is kept on the scene's `brief` too, so closing and opening the window keeps it.
- **The ask (`askangel.mjs`):** `askBuild(scene, text, brief)` writes `askAngel` (`seq`, `at` by the server's clock, `user`, `model`, `messages`, the window's `brief`, `answer: null`); `clearAsk` removes it.
- **The worker's door (`api.ask`):** `pending(skip)` (a read: the oldest unanswered ask under 10 minutes old, as `{ kind: "build", sceneId, seq, model, system, tools, text }`; `text` is `askText`: the map's summary and rooms, the party's level, size and sheet levels, the brief in short, the map's notes (`mapNotes`: the scene's journal and every journal pinned on the map, as plain text, cut at 6,000 characters each and 20,000 in all, the module's own build journals marked) and the conversation); `tool(sceneId, name, input)` answers the module's five tools, all reads: `find_creatures`, `find_items`, `check_threat`, `search_journals`, `read_journal` (`ASK_TOOLS`); `answer(sceneId, seq, answer, meta)` checks the answer (`cleanAskAnswer`), keeps only creatures that are NPC actors and items in PF2e's equipment, stamps the brief as Angel's, adds the reply (with what was left out, the model and the cost) to the conversation, and keeps the brief on `answer` for the window; `meta.failed` keeps the worker's words instead.
- **The bridge (0.4.4):** the worker runs the tool calls (Notion's itself, with the key) until the model answers, at most the bridge's ask-rounds setting in calls; see its DEVELOPING.md, "Ask Angel".

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (ak-1) {unit} `node tools/test/unit.mjs`: journal HTML as plain text; a long note cut.
- (ak-2) {unit} the conversation kept: who, trimmed, the newest 20, the model and cost on Angel's.
- (ak-3) {unit} the ask's text: the map, party and brief, the notes (the module's own marked), the conversation with the GM's latest last; no notes said.
- (ak-4) {unit} Angel's answer checked: a code fence read, a question with no brief, refusals in words.
- (ak-5) {unit} the prompt (never places, notes first, Notion when offered, uuids from find_creatures, the JSON) and the five read tools.
- (ak-6) {unit} the wait words and the cost in cents.
- (ak-7) {live} the box by real clicks as GM: a message sent (the thinking line), a stand-in answer through `api.ask` on the Bridge's page filling the rows, the encounter and the treasure with the reply and its cost; a GM's own note kept; a creature that isn't real left out and said; New conversation; the wait words; a failed answer said.
- (ak-8) {live} `api.ask.pending` and `api.ask.tool` on the Bridge's page: the text carries the map's notes and no names of the party; each of the five tools answers.
- (ak-9) {live} as a player: no Build window, nothing of the ask shown.

## Traps
- **Taking an answer writes the scene, and that write fires the window's own hook before it has redrawn** (0.44.0, seen with the first real answer from the API, 2026-11-24): the hook read the form "typed but not yet left" from the old screen, and the empty Name, Why, Want, Doing and Retreat and the default Mood went back over Angel's; the rows stayed because the old screen had none. The window now marks its form stale from the moment an answer is taken until it has drawn again (`formStale`), and reads nothing from it meanwhile. 0.43.0's stand-in answers had not shown it.
- A scene flag is read by every browser (foundry-traps, section 8): the journal text is read on the runner's page when the worker asks, never written into the flag. The conversation and Angel's brief (its journal truth too) are in the flag, as the scene's `brief` always was: a player who opens the console could read them. Kept so by Rhea's rule (2026-11-11: her players won't poke at the console; private game tools aren't designed around it); a GM-only journal would be the place if that changes.
- The answer is written only after every await, by reading the ask again and writing it whole (`==askAngel`) when its seq still matches and it has no answer: a New conversation or a new message meanwhile wins (review 1). Not a lock: a clear sent while the answer's own write is on its way can still lose (test build 1 saw it with both sent from one page at once); the window is one round trip to the server.

## Open items
- Angel's answer through the real API (bridge 0.4.4 with its key) is Rhea's to install and see.
- The read-only Notion key is Rhea's: in Notion, Settings, Connections, Develop or manage integrations, a new internal integration with only "Read content", then share the campaign's pages with it (a page's ⋯ menu, Connections), and paste its secret into the bridge's config.json as `"notionApiKey"`; restart the bridge. Not seen live.
- Cost per ask is measured on each answer (shown in the box and in the bridge's log) but not yet seen on real asks: the guess was 10 to 30 cents a build.
