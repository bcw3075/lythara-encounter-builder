---
feature: rooms
files: [scripts/room.mjs, scripts/roomask.mjs]
functions: []
dependsOn: [builder, api-route]
since: 0.42.0
---
Picking a room (F-6): on a map with several rooms, Preview places the creatures inside one room, picked by the builder at once, then by Angel through the bridge's API worker, and changed by the GM with a click.

## Decisions
- **Angel suggests, Rhea can change (F-6, Rhea 2026-11-24, 1:01 AM, her pick on a card, Angel's recommendation; chosen over "I click the room" and "Angel picks it alone"):** at Preview Angel looks at the map's picture and the brief and outlines a room with a one-line reason; Rhea accepts it or clicks another room. A room is the space bounded by walls and doors; the scoring still places each creature inside it. A few cents a build on the API.
- **Angel's calls on the small points (2026-11-24, recorded for Rhea):**
  - Every door bounds a room, open, closed or locked: an open door stops nothing and hides nothing, but the space past it is still another room. A pocket under 4 squares (`MIN_ROOM`) is no room, and neither is a space with no door and no way in (the solid rock around a dungeon's rooms, the outside of a building: seen on the test dungeon, test build 1); a room behind a locked door has its door, so it stays. A map with one open space (most outdoor maps) offers no rooms, and Preview is as before.
  - The builder's own pick by the numbers shows at once, so Preview never waits: a room the brief's anchor (or a lair's camp, cave, ruins or fallen tree) is in, walking distance in the mood's window, out of the party's first view when most of them don't start alert, room for them all; never the party's room, a room nobody walks into or one too small unless nothing else fits. Angel's pick replaces it when it comes, unless Rhea clicked a room first; then Angel's shows as a suggestion with "Use Angel's room".
  - Angel's pick is on Sonnet (a cent or two with the picture), set on the ask (`model`), and needs bridge 0.4.3 with its API key; the world setting "Angel picks the room at Preview" (`roomByAngel`, default on) turns the ask off. Preview waits up to 90 seconds (`ROOM_WAIT_S`) and then says Angel didn't answer.
  - A creature that finds no free space in the room is placed outside it, with a warning. Caches go at an anchor inside the room, else its middle. Re-place around the party keeps the room the build was made in.

## How it works
- **Rooms (`mapread.mjs` `buildModel`):** `roomOf` (per square, a room's id or -1) and `rooms` (`{ id, squares, doors }`) by orthogonal steps that cross no wall stopping movement and no door (`readMap` keeps an open door in the wall list as no wall at all, `door: true`, only for this). `roomList` numbers the rooms worth offering in the map's reading order and gives each its size, free squares, walking feet from the party's way in, share in the party's first view, things in it, doors and whether the party starts in it.
- **Preview (`ui/build.mjs` `previewLoop`):** the first layout uses `suggestRoom`; on a map with rooms and the setting on, the GM's page writes the ask on the scene (`roomAsk`: seq, the brief in short, the rooms, the builder's pick; `askRoom`). An `updateScene` hook sees the answer, takes Angel's room (unless the GM picked one) and draws Preview again with the same seed. Buttons: Place it, Try another layout, Pick another room (a click on the canvas: `pickRoom`; right-click or Escape keeps the room), Use Angel's room, Use the whole map, Cancel. The ask is removed when Preview ends (`dropRoomAsk`). The room shows as a GM-only region over its squares (`roomRects`) with its number and who picked it; both are preview documents, removed with the rest.
- **The worker's door (`roomask.mjs`, `api.room`):** `pending()` (a read: the oldest unanswered ask under 5 minutes old, with the room prompt `ROOM_PROMPT`); `show(sceneId)` draws the map on the runner's page (its picture, walls red, each room's number in a circle, the party's way in blue; the element's id is the module's id followed by "-rooms"); `answer(sceneId, seq, answer, meta)` checks the room is one of the ask's (`cleanRoomAnswer`) and keeps it on the ask with the model and cost, or keeps the refusal (or the worker's `meta.failed`) for Preview to show.
- **The build:** `prepare(scene, brief, { room })` (left out: the builder's pick; null: the whole map; `{ n, by, why }`); `layout(..., { room })` tries each pass inside the room first; the build's flag keeps `room`, and the journal's setup starts with the room and why.

## Checks
Record every id below in the release's change record when this feature, or a feature a `shared:` tag names, changes.
- (ro-1) {unit} `node tools/test/unit.mjs`: rooms bounded by walls and doors (open ones too), the party's room, a closet nobody walks into, doors counted.
- (ro-2) {unit} the builder's own pick and its line; no pick on a map with one room.
- (ro-3) {unit} every creature inside the chosen room; a room too full puts the rest outside with a warning; the outline's rectangles cover the room exactly.
- (ro-4) {unit} each real outdoor map in the test data offers no rooms.
- (ro-5) {unit} Angel's answer checked (a code fence, an unknown room, no reason); the ask carries the brief in short and no compendium ids; the room prompt.
- (ro-6) {live} Preview on a map with rooms by real clicks: the builder's pick outlined with its line, Pick another room by a click on the map, Use the whole map, Try another layout keeping the room, Place it with every creature in the room and the journal's line; Cancel removes the outline, the label and the ask.
- (ro-7) {live} Angel's pick through the worker's door on the Bridge's page (a stand-in answer while bridge 0.4.3 isn't installed): `pending` shows the ask, `show` draws the picture, `answer` moves Preview to Angel's room with its reason; a GM's own pick stays, with Use Angel's room; a bad answer and the 90-second wait shown in words.
- (ro-8) {live} An outdoor map: Preview as before, no room line and no ask.

## Traps
- `game.time.serverTime` is the server's own clock, which starts again when the server does: an ask from before a restart reads as from the future and is not answered (0.43.0).
- A room's ids come from the walls alone, so the GM's page and the runner's number the rooms the same way; tokens never change them.

## Open items
- Angel's pick through the real API (bridge 0.4.3, with its key) is Rhea's to install and see.
- A room on a second level of a scene (Foundry's levels) isn't told apart: a map is read as one level.
