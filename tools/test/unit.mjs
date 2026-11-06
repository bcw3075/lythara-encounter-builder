/* Tests with no Foundry: node tools/test/unit.mjs. Real maps come from the Survey Sheet repo's generator (SURVEY_REPO, default ../lythara-survey-sheet)
   and the sheet exports in tools/test/data (git-ignored: they hold campaign places). Writes tools/test/out/layouts.json for contact.py. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanBrief, expandCreatures } from "../../scripts/brief.mjs";
import { adjustedLevel, chooseTreasure, claimDiffers, coinsOf, ledgerLine, levelTotal, partySizeNote, toGp, treasureFor, TREASURE } from "../../scripts/budget.mjs";
import { esc, journalPages } from "../../scripts/journal.mjs";
import { buildModel, summarise } from "../../scripts/mapread.mjs";
import { hiddenNextTo, layout, nearestFree } from "../../scripts/place.mjs";
import { checkPlan, damageOptions, describeStep, latestNote, nextAction } from "../../scripts/turn.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)), DATA = path.join(HERE, "data"), OUT = path.join(HERE, "out"), REPO = process.env.SURVEY_REPO ?? path.resolve(HERE, "../../../lythara-survey-sheet");
let bad = 0, good = 0; const check = (name, ok, extra = "") => { if (ok) good++; else { bad++; console.log("FAIL", name, extra); } };

/* ---- numbers against the published tables ---- */
check("L1 moderate 18", treasureFor(1, "moderate") === 18); check("L3 extreme 100", treasureFor(3, "extreme") === 100); check("L20 severe", treasureFor(20, "severe") === 73500); check("trivial none", treasureFor(1, "trivial") === 0); check("20 levels", Object.keys(TREASURE).length === 20); check("L1 total 175", levelTotal(1) === 175);
check("elite", adjustedLevel(1, "elite") === 2 && adjustedLevel(0, "elite") === 2 && adjustedLevel(-1, "elite") === 1); check("weak", adjustedLevel(1, "weak") === -1 && adjustedLevel(3, "weak") === 2); check("normal", adjustedLevel(3, "") === 3);
check("toGp", toGp({ gp: 1, sp: 5, cp: 2 }) === 1.52 && toGp({ pp: 1 }) === 10 && toGp(null) === 0); const cc = coinsOf(12.34); check("coins", cc.gp === 12 && cc.sp === 3 && cc.cp === 4);
const L = ledgerLine({ manual: { 1: 20 }, builds: { a: { level: 1, gp: 18 }, b: { level: 2, gp: 30 } } }, 1); check("ledger", L.placed === 18 && L.manual === 20 && L.left === 137);
check("claim", claimDiffers(90, 80) && !claimDiffers(80, 80) && !claimDiffers(null, 80)); check("size note", partySizeNote(4) === "" && partySizeNote(5).includes("15"));
const cands = { items: [{ uuid: "a", name: "Potion", level: 1, gp: 4, rarity: "common", category: "potion", healing: true }, { uuid: "n", name: "Novelty", level: 1, gp: 4, rarity: "common", category: "elixir" }, { uuid: "b", name: "Rare", level: 1, gp: 4, rarity: "rare", category: "potion" }, { uuid: "c", name: "Too high", level: 9, gp: 4, rarity: "common", category: "potion" }, { uuid: "d", name: "Wand", level: 1, gp: 4, rarity: "common", category: "wand" }], goods: [{ uuid: "g", name: "Gem", level: 0, gp: 3, rarity: "common", category: "gem" }] };
let tr = chooseTreasure({ gp: 18, level: 1, carriers: [], lair: false, candidates: cands }); check("wolves carry nothing", tr.value === 0 && tr.lines.length === 0 && /carry/.test(tr.note));
tr = chooseTreasure({ gp: 18, level: 1, carriers: ["x", "y"], lair: false, candidates: cands, seed: 3 }); check("carried totals budget", tr.value === 18, JSON.stringify(tr)); check("only the potion", tr.lines.filter(l => l.kind === "item").every(l => l.uuid === "a")); check("to carriers", tr.lines.every(l => ["x", "y"].includes(l.to)));
tr = chooseTreasure({ gp: 26, level: 1, carriers: [], lair: true, candidates: cands, seed: 3 }); check("lair cache", tr.value === 26 && tr.lines.every(l => l.to === "cache") && tr.lines.some(l => l.uuid === "g"), JSON.stringify(tr));
check("trivial nothing", chooseTreasure({ gp: 0, level: 1, carriers: ["x"], lair: false, candidates: cands }).lines.length === 0);

/* ---- brief ---- */
const br = cleanBrief({ name: "<b>x</b>", mood: "nonsense", creatures: [{ name: "Wolf", count: 99, role: "bad", adjust: "huge" }, { count: 1 }], notes: [{ title: "n", at: [1.5, 2.5] }, { title: "none" }], treasure: [{ coins: { gp: "5" } }] });
check("mood default", br.mood === "ambush"); check("count capped", br.creatures[0].count === 30); check("role default", br.creatures[0].role === "brute"); check("adjust default", br.creatures[0].adjust === ""); check("empty creature dropped", br.creatures.length === 1); check("notes need a place", br.notes.length === 1 && br.notes[0].at[0] === 1); check("list mode", br.treasureMode === "list" && br.treasure[0].coins.gp === 5);
check("expand", expandCreatures(br, () => ({ n: 2 })).length === 30 && expandCreatures(br, () => ({ n: 2 }))[0].n === 2);

/* ---- journal ---- */
const jb = cleanBrief({ beat: "b", why: "<script>", creatures: [{ name: "Wolf", tactics: "Bite @Check[perception|dc:15]" }], journal: { truth: "secret truth", locals: "they say", learn: "you find" } }), pages = journalPages(jb, { threat: { rating: "moderate", xp: 80, size: 4, level: 1 }, setup: ["Wolf: beast"], treasure: ["5 gp"] }), byName = n => pages.find(p => p.name === n)?.content ?? "";
check("escaped", !byName("Overview").includes("<script>") && byName("Overview").includes("&lt;script&gt;")); check("tactics and check link", byName("Tactics").includes("@Check[perception|dc:15]")); check("truth is secret", /<section class="secret">.*secret truth.*<\/section>/s.test(byName("What can be learned"))); check("locals not secret", !/<section class="secret">[^]*they say[^]*<\/section>/.test(byName("What can be learned")));
const bare = journalPages(cleanBrief({ creatures: [{ name: "Wolf" }] }), {}); check("no made-up story", bare.length === 3 && !bare.some(p => p.name === "What can be learned") && !/Why here/.test(bare[0].content)); check("esc", esc(`a<"&`) === "a&lt;&quot;&amp;");

/* ---- a turn ---- */
const tctx = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }, { id: "bow", name: "Bow", reach: 5, ranged: true, maxRange: 60 }], targets: { E1: { name: "Hero", distance: 5 }, E2: { name: "Far", distance: 70 } } };
const st = (o) => ({ do: "strike", ...o });
let pl = checkPlan({ steps: [st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" })] }, tctx); check("three attacks", pl.ok && pl.steps.map(s => s.variant).join() === "0,1,2");
check("fourth has no actions", !checkPlan({ steps: [1, 2, 3, 4].map(() => st({ item: "jaws", target: "E1" })) }, tctx).ok); check("out of reach", /out of reach/.test(checkPlan({ steps: [st({ item: "jaws", target: "E2" })] }, tctx).reason)); check("out of range", /out of range/.test(checkPlan({ steps: [st({ item: "bow", target: "E2" })] }, tctx).reason)); check("bow in range", checkPlan({ steps: [st({ item: "bow", target: "E1" })] }, tctx).ok);
check("unknown target", /doesn't know/.test(checkPlan({ steps: [st({ item: "jaws", target: "E9" })] }, tctx).reason)); check("unknown attack", /no attack/.test(checkPlan({ steps: [st({ item: "claw", target: "E1" })] }, tctx).reason)); check("unknown step", /can't do/.test(checkPlan({ steps: [{ do: "stride" }] }, tctx).reason)); check("no plan", !checkPlan(null, tctx).ok); check("words", describeStep(pl.steps[1]) === "Jaws at Hero, attack 2.");
const hit = { started: true, attack: { degree: 2 } };
check("fresh attacks", nextAction({}) === "attack"); check("started, no result: ask, never roll again", nextAction({ started: true }) === "ask"); check("miss ends", nextAction({ started: true, attack: { degree: 1 } }, { apply: true }) === "next"); check("hit rolls", nextAction(hit) === "damage"); check("damage started, no card: ask", nextAction({ ...hit, damageStarted: true }) === "ask");
check("a note shows", latestNote({ a: { state: "done", at: 1, note: "x" } })?.note === "x"); check("a later clean turn clears an old note", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "done", at: 2 } }) === null); check("a turn played by hand clears it too", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "manual", at: 2 } }) === null); check("order comes from the time, not the key", latestNote({ b: { state: "done", at: 2, note: "new" }, a: { state: "done", at: 1, note: "old" } })?.note === "new"); check("a turn still open doesn't count", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "stopped", at: 2 } })?.note === "x"); check("no turns, no note", latestNote() === null);
const dmg = { ...hit, damageStarted: true, damage: { message: "m" } }; check("apply off stops", nextAction(dmg) === "next"); check("apply on applies", nextAction(dmg, { apply: true }) === "apply"); check("applying unknown: ask, never apply again", nextAction({ ...dmg, applying: true }, { apply: true }) === "ask"); check("applied ends", nextAction({ ...dmg, applying: true, applied: true }, { apply: true }) === "next");
const dop = damageOptions(["self:level:1", "target:x", "item:y", "self"]); check("options", dop.origin.join() === "origin:level:1" && dop.keep.join() === "item:y");

/* ---- geometry ---- */
const ring = (x, y, r, sight) => { const pts = [...Array(6)].map((_, k) => [x + Math.cos(k * Math.PI / 3) * r, y + Math.sin(k * Math.PI / 3) * r]); return pts.map((p, k) => ({ ax: p[0], ay: p[1], bx: pts[(k + 1) % 6][0], by: pts[(k + 1) % 6][1], move: true, sight, dir: 1 })); };
const blank = (walls = [], extra = {}) => buildModel({ cols: 20, rows: 20, walls, costs: new Array(400).fill(0), occupied: new Array(400).fill(false), entrySquares: [[10, 19]], ...extra });
let m = blank(); check("clear sight", m.sees([1, 1], [18, 18])); check("no walls exposure 1", m.exposure[m.idx(5, 5)] === 1); check("approach straight 45ft", m.approach[m.idx(10, 10)] === 45, m.approach[m.idx(10, 10)]);
m = blank([...ring(5.5, 5.5, .2, 1)]); check("past one limited: sees", m.sees([1, 5.5], [10, 5.5])); check("ring blocks its square", m.blocked[m.idx(5, 5)]); check("ring leaves the next square", !m.blocked[m.idx(7, 5)]);
m = blank([...ring(5.5, 5.5, .2, 1), ...ring(7.5, 5.5, .2, 1)]); check("past two limited: blind", !m.sees([1, 5.5], [10, 5.5]));
m = blank([...ring(5.5, 5.5, .2, 2)]); check("thick trunk blind", !m.sees([1, 5.5], [10, 5.5]));
m = blank([{ ax: 0, ay: 10, bx: 20, by: 10, move: true, sight: 2, dir: 0 }]); check("long wall splits", !m.sees([5, 5], [5, 15])); check("unreachable", !Number.isFinite(m.approach[m.idx(5, 5)])); check("unseen behind", m.exposure[m.idx(5, 5)] === 0);
m = blank([], { costs: new Array(400).fill(1) }); check("difficult doubles", m.approach[m.idx(10, 10)] === 90, m.approach[m.idx(10, 10)]);
const deep = new Array(400).fill(0); deep[blank().idx(3, 3)] = 2; m = blank([], { costs: deep }); check("no deep water", !m.fits(3, 3, 1)); check("swimmer may", m.fits(3, 3, 1, { swim: true })); check("large footprint", !m.fits(2, 2, 2) && m.fits(5, 5, 2) && !m.fits(19, 19, 2));
const occ = new Array(400).fill(false); occ[blank().idx(5, 5)] = true; m = blank([], { occupied: occ }); check("no stacking", !m.fits(5, 5) && !m.fits(4, 4, 2)); check("nearest free", nearestFree(m, [5, 5]).join() !== "5,5");
check("hidden next to", hiddenNextTo([[5, 5]], [{ i: 6, j: 6, n: 1, hidden: true }, { i: 9, j: 9, n: 1, hidden: true }, { i: 5, j: 6, n: 1, hidden: false }]).length === 1); check("large reach", hiddenNextTo([[8, 5]], [{ i: 6, j: 5, n: 2, hidden: true }]).length === 1);

/* ---- real maps: every terrain in spots.json, every role and mood ---- */
const { planEncounter, readPlan } = await import(pathToFileURL(path.join(REPO, "scripts/encounter.mjs")).href);
const spots = JSON.parse(fs.readFileSync(path.join(DATA, "spots.json"))), out = [];
const creatures = [{ key: "a-0", group: 0, n: 1, role: "ambusher", state: "hidden", label: "A1" }, { key: "a-1", group: 0, n: 1, role: "ambusher", state: "hidden", label: "A2" }, { key: "b-0", group: 1, n: 2, role: "brute", state: "hidden", label: "B" }, { key: "c-0", group: 2, n: 1, role: "ranged", state: "hidden", label: "R" }, { key: "d-0", group: 3, n: 1, role: "caster", state: "hidden", label: "C" }, { key: "e-0", group: 4, n: 1, role: "beast", state: "alert", label: "W1" }, { key: "e-1", group: 4, n: 1, role: "beast", state: "alert", label: "W2" }, { key: "e-2", group: 4, n: 1, role: "beast", state: "alert", label: "W3" }];
const T0 = Date.now();
for (const [name, [file, cx, cy]] of Object.entries(spots)) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, file))), plan = planEncounter(d, { cx, cy, cols: 40, rows: 40, yearFrac: .55, features: [{ kind: "camp", x: cx, y: cy, size: 1 }] }), rd = { ...readPlan(plan), terrainCodes: { fields: 0 } };
  const walls = [];
  for (const t of plan.feats.trees) { if (t.trunk < .75 || t.u < 0 || t.v < 0 || t.u > plan.Wft || t.v > plan.Hft) continue; walls.push(...ring(t.u / 5, t.v / 5, t.trunk / 5, t.trunk >= 1.6 && !t.dead ? 2 : 1)); }
  const model = buildModel({ cols: 40, rows: 40, walls, costs: rd.grids.cost, occupied: new Array(1600).fill(false), entrySquares: [[20, 37]], entrySource: "read", read: rd });
  check(`${name}: summary`, summarise(model, rd).cols === 40);
  for (const mood of ["ambush", "lair", "patrol", "chase", "standoff"]) {
    const a = layout(model, creatures, { seed: 7, mood }), b = layout(model, creatures, { seed: 7, mood }), c = layout(model, creatures, { seed: 8, mood });
    check(`${name} ${mood}: same seed same layout`, JSON.stringify(a) === JSON.stringify(b)); check(`${name} ${mood}: another seed can differ`, c.seed === 8);
    check(`${name} ${mood}: all placed`, a.placed.length === creatures.length, a.warnings.join());
    const taken = new Set(); let overlap = false, wall = false, deepWater = false;
    for (const p of a.placed) for (let x = 0; x < p.n; x++) for (let y = 0; y < p.n; y++) { const k = model.idx(p.i + x, p.j + y); if (taken.has(k)) overlap = true; taken.add(k); if (model.blocked[k]) wall = true; if (rd.grids.cost[k] === 2) deepWater = true; }
    check(`${name} ${mood}: no overlap`, !overlap); check(`${name} ${mood}: no wall`, !wall); check(`${name} ${mood}: no deep water`, !deepWater);
    const big = a.placed.find(p => p.n === 2); check(`${name} ${mood}: Large fits`, big && big.i + 2 <= 40 && big.j + 2 <= 40);
    const seen = a.placed.filter(p => p.state !== "alert" && p.exposure > 0); check(`${name} ${mood}: hidden out of first view when possible`, !seen.length || a.warnings.some(w => w.includes("first view")), JSON.stringify(seen));
    if (mood === "ambush" || mood === "patrol") out.push({ name, mood, cols: 40, rows: 40, cost: rd.grids.cost, canopy: rd.grids.canopy, blocked: model.blocked, exposure: model.exposure, entry: model.entry.squares, placed: a.placed, warnings: a.warnings });
  }
}
console.log(`real maps: ${Date.now() - T0} ms`);
/* a brute with nothing nearby still placed, a map too tight says so */
const tight = buildModel({ cols: 10, rows: 10, walls: [], costs: new Array(100).fill(0), occupied: new Array(100).fill(true), entrySquares: [[5, 5]] });
const none = layout(tight, [{ key: "a-0", group: 0, n: 1, role: "brute", state: "hidden", label: "X" }]); check("no room says so", none.placed.length === 0 && none.warnings[0].includes("no room"));
const ga = layout(blank(), [{ key: "a-0", group: 0, n: 1, role: "guard", state: "hidden", label: "G" }]); check("guard without anchor warns", ga.placed.length === 1 && ga.warnings[0].includes("nothing on this map to guard"));
const anch = { ...blank(), anchors: [{ kind: "camp", at: [10, 10] }] }, gd = layout(anch, [{ key: "a-0", group: 0, n: 1, role: "guard", state: "asleep", anchor: "camp", label: "G" }]); check("guard stays by what it guards, in view or not", Math.hypot(gd.placed[0].i - 10, gd.placed[0].j - 10) <= 5 && gd.warnings.some(w => w.includes("guards")), JSON.stringify(gd));
const miss = layout(blank(), [{ key: "a-0", group: 0, n: 1, role: "brute", state: "alert", anchor: "cave", label: "G" }]); check("missing anchor warns", miss.warnings.some(w => w.includes("no cave")));
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "layouts.json"), JSON.stringify(out));
console.log(`${good} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
