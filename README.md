# Lythara Encounter Builder

A Foundry VTT module for Pathfinder 2e. On an encounter map it reads the ground, then places creatures, treasure, a GM journal and notes from a brief you write by hand or get from a chat. You see a preview first, and everything it made can be removed without touching what you placed yourself.

Open an encounter map and use the **Encounters** group in the left bar:
- **Build Encounter**: fill in the party level, creatures and treasure, then Preview. Place it, try another layout, or cancel.
- **Re-place around the party**: a new layout for the same creatures, starting from where the party stands.
- **Monster Minds**: how each kind of monster on this map thinks and fights (six lines and notes), yours to read and edit; one monster can have its own. **Minds Library**: the profiles kept for reuse, by people and kind.
- **Journal**: opens the build's GM journal.
- **Clear**: removes what the build made.

It reads maps made by Lythara Survey Sheet. Without that module it still works from walls and regions, and says the read is partial. Monster turns: for each monster ticked in the Monster Turns window, a thinker (a chat through the bridge) plans from what the monster perceives, and the module checks each plan against the rules and carries it out one action at a time on the account named in its settings, with Do it, Change and Play it myself for the GM. What is built so far is listed per feature in `docs/features/`.

How the code works: `docs/DEVELOPING.md`.
