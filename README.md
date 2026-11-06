# Lythara Encounter Builder

A Foundry VTT module for Pathfinder 2e. On an encounter map it reads the ground, then places creatures, treasure, a GM journal and notes from a brief you write by hand or get from a chat. You see a preview first, and everything it made can be removed without touching what you placed yourself.

Open an encounter map and use the **Encounters** group in the left bar:
- **Build Encounter**: fill in the party level, creatures and treasure, then Preview. Place it, try another layout, or cancel.
- **Re-place around the party**: a new layout for the same creatures, starting from where the party stands.
- **Journal**: opens the build's GM journal. The Tactics page is yours to edit.
- **Clear**: removes what the build made.

It reads maps made by Lythara Survey Sheet. Without that module it still works from walls and regions, and says the read is partial. Monster turns are being built: for now it carries out Strikes from a plan, on the account named in its settings, and nothing decides yet.

How the code works: `docs/DEVELOPING.md`.
