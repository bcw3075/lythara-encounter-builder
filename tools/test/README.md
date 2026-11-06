# Local tests

No Foundry needed. The pure files in `scripts/` run in plain Node.

- `data/` (git-ignored) holds sheet exports plus `spots.json`, the same files as the Survey Sheet repo's test data. They name campaign places, so they never go in this public repo.
- `node tools/test/unit.mjs` runs everything: treasure and threat tables, the brief, the journal's text layers, wall and sight geometry, and placement on a real map for every terrain and mood. It uses the Survey Sheet generator from `SURVEY_REPO` (default `../lythara-survey-sheet`).
- `python3 tools/test/contact.py` draws the layouts from the last run as `out/layouts.png`. Look at it after changing scoring.
