/* Tests with no Foundry: node tools/test/unit.mjs. Real maps come from the Survey Sheet repo's generator (SURVEY_REPO, default ../lythara-survey-sheet)
   and the sheet exports in tools/test/data (git-ignored: they hold campaign places). Writes tools/test/out/layouts.json for contact.py. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanBrief, expandCreatures } from "../../scripts/brief.mjs";
import { adjustedLevel, chooseTreasure, claimDiffers, coinsOf, ledgerLine, levelTotal, partySizeNote, toGp, treasureFor, TREASURE } from "../../scripts/budget.mjs";
import { esc, journalPages } from "../../scripts/journal.mjs";
import { buildModel, summarise } from "../../scripts/mapread.mjs";
import { hiddenNextTo, layout, nearestFree } from "../../scripts/place.mjs";
import { actionsFor, assignLabels, canTarget, describeKnows, flatDC, groundAround, healthEntries, healthWord, labelsOf, lightAt, packetOf, perceiveOne, plainText, remember, sensesOf, strikeMods, tacticsFor, visibleConditions, worse } from "../../scripts/perceive.mjs";
import { MAX_TRIES, STALL_MS, STEP_KINDS, cleanMeta, cleanPlan, eventOut, hello, listening, live, nextSeq, pickEvent, stale, stallLive, stallOf, stallWords, text, waitSeconds } from "../../scripts/brain.mjs";
import { CHECK_WORD, FOLLOW_UPS, SAVE_MULT, abilityCost, followUpOutcome, lastAction, nextAbility, nextSpell, spellActions, spellMultiplier, spellRange, spellTargets } from "../../scripts/turn.mjs";
import { MAX_REPLANS, changesSince, checkPlan, coverAfterTaking, currentOf, endsCover, nextCover, damageOptions, describeChange, describeChanges, absorbOwn, describeStep, doneStep, isMove, latestNote, nextAction, nextMove, nextPosture, requestBusy, situationOf, spentBy, strikeIds } from "../../scripts/turn.mjs";
import { aimArea, burstReachable, caughtBy, crossesWall, placeable, shapeOf, squaresNear, squaresOf } from "../../scripts/area.mjs";
import { aimText, areaHurt, forThinker, listWords, nextArea } from "../../scripts/turn.mjs";
import { COSTS, SEEK, SIDES, edgeSides, isAttack, nextInteract, nextStealth, revealsAfter, revealsBefore, sneakSpeed } from "../../scripts/turn.mjs";
import { promptText } from "../../scripts/prompt.mjs";
import { historyHTML, historyOf, journalHTML, stepResult } from "../../scripts/history.mjs";
import { cutShort, diagonalsIn, distanceBetween, featureNear, findRoute, findStep, flyWaypoints, flyWorld, footprintAt, headingOf, heightCost, heightWhenCut, routeWords } from "../../scripts/move.mjs";
import { movedOn, shouldFall } from "../../scripts/turn.mjs";
import { verticalGap } from "../../scripts/area.mjs";
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
check("unknown target", /doesn't know/.test(checkPlan({ steps: [st({ item: "jaws", target: "E9" })] }, tctx).reason)); check("unknown attack", /no attack/.test(checkPlan({ steps: [st({ item: "claw", target: "E1" })] }, tctx).reason)); check("unknown step", /can't do/.test(checkPlan({ steps: [{ do: "jump" }] }, tctx).reason)); check("no plan", !checkPlan(null, tctx).ok); check("words", describeStep(pl.steps[1]) === "Jaws at Hero, attack 2.");
const hit = { started: true, attack: { degree: 2 } };
check("fresh attacks", nextAction({}) === "attack"); check("started, no result: ask, never roll again", nextAction({ started: true }) === "ask"); check("miss ends", nextAction({ started: true, attack: { degree: 1 } }, { apply: true }) === "next"); check("hit rolls", nextAction(hit) === "damage"); check("damage started, no card: ask", nextAction({ ...hit, damageStarted: true }) === "ask");
check("a note shows", latestNote({ a: { state: "done", at: 1, note: "x" } })?.note === "x"); check("a later clean turn clears an old note", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "done", at: 2 } }) === null); check("a turn played by hand clears it too", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "manual", at: 2 } }) === null); check("order comes from the time, not the key", latestNote({ b: { state: "done", at: 2, note: "new" }, a: { state: "done", at: 1, note: "old" } })?.note === "new"); check("a turn still open doesn't count", latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "stopped", at: 2 } })?.note === "x"); check("no turns, no note", latestNote() === null); check("a re-planned turn keeps the first part's warning", latestNote({ a: { state: "done", at: 1, note: "0 HP" }, b: { state: "done", at: 2, parent: "a" } })?.note === "0 HP" && latestNote({ a: { state: "done", at: 1, note: "x" }, b: { state: "done", at: 2, parent: "a", note: "y" } })?.note === "x y"); check("but not an earlier turn's", latestNote({ z: { state: "done", at: 0, note: "old" }, a: { state: "done", at: 1 }, b: { state: "done", at: 2, parent: "a" } }) === null);
const dmg = { ...hit, damageStarted: true, damage: { message: "m" } }; check("apply off stops", nextAction(dmg) === "next"); check("apply on applies", nextAction(dmg, { apply: true }) === "apply"); check("applying unknown: ask, never apply again", nextAction({ ...dmg, applying: true }, { apply: true }) === "ask"); check("applied ends", nextAction({ ...dmg, applying: true, applied: true }, { apply: true }) === "next");
const dop = damageOptions(["self:level:1", "target:x", "item:y", "self"]); check("options", dop.origin.join() === "origin:level:1" && dop.keep.join() === "item:y");
/* ---- one action at a time ---- */
{
  const three = { steps: [st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" })] };
  check("attack penalty carries on after a re-plan", checkPlan(three, { ...tctx, attacksBefore: 1 }).steps.map(s => s.variant).join() === "1,2" && checkPlan(three, { ...tctx, attacksBefore: 2 }).steps.map(s => s.variant).join() === "2,2");
  check("actions left after a re-plan", /no actions left/.test(checkPlan(three, { ...tctx, actions: 1 }).reason));
  check("a label stays a label when no name is given", checkPlan({ steps: [st({ item: "jaws", target: "E1" })] }, { ...tctx, targets: { E1: { distance: 5 } } }).steps[0].targetName === "E1");
  const sp = spentBy([{ do: "strike" }, { do: "none" }, { do: "strike" }]); check("spent", sp.actions === 2 && sp.attacks === 2); check("nothing spent", spentBy().actions === 0);
  check("done: critical hit", doneStep({ do: "strike", item: "jaws", target: "E1" }, { started: true, attack: { degree: 3 } }).result === "critical hit");
  check("done: flat check failed", doneStep({ do: "strike", item: "jaws", target: "E1", flat: 11 }, { flatStarted: true, flat: { ok: false } }).result === "flat check failed");
  check("done: no names", JSON.stringify(doneStep({ do: "strike", item: "jaws", target: "E1", targetName: "Hero", itemName: "Jaws" }, { attack: { degree: 1 } })) === '{"do":"strike","item":"jaws","target":"E1","result":"miss"}');
  const base = situationOf({ me: { square: [5, 5], hp: 50, actions: 3, conditions: ["frightened 1"] }, others: { E1: { square: [6, 5], state: "observed", down: false }, E2: { square: [9, 9], state: "hidden", down: false } } });
  const tweak = f => { const n = JSON.parse(JSON.stringify(base)); f(n); return changesSince(base, n); };
  check("nothing changed", changesSince(base, situationOf(JSON.parse(JSON.stringify(base)))).length === 0);
  check("conditions in any order", changesSince(situationOf({ me: { conditions: ["a", "b"] } }), situationOf({ me: { conditions: ["b", "a", "a"] } })).length === 0);
  check("target down", tweak(n => { n.others.E1.down = true; }).map(c => `${c.who}:${c.what}`).join() === "E1:down");
  check("someone moved", tweak(n => { n.others.E2.square = [9, 8]; }).map(c => `${c.who}:${c.what}`).join() === "E2:moved");
  check("perceived differently", tweak(n => { n.others.E1.state = "hidden"; })[0]?.now === "hidden");
  check("gone", tweak(n => { delete n.others.E2; })[0]?.what === "gone");
  check("it moved", tweak(n => { n.me.square = [5, 6]; })[0]?.what === "moved"); check("it was hurt", tweak(n => { n.me.hp = 40; })[0]?.what === "hurt"); check("it healed", tweak(n => { n.me.hp = 55; })[0]?.what === "healed");
  check("its actions", tweak(n => { n.me.actions = 2; })[0]?.now === 2); check("its conditions", tweak(n => { n.me.conditions = ["slowed 1"]; })[0]?.what === "conditions");
  check("no baseline, no change", changesSince(null, base).length === 0 && changesSince(base, null).length === 0);
  check("words for the thinker keep labels", describeChange({ who: "E1", what: "down" }) === "E1 is down." && describeChange({ who: "me", what: "hurt" }) === "It was hurt." && describeChange({ who: "me", what: "actions", now: 2 }) === "Its actions this turn are now 2.");
  check("words for the GM have names", describeChanges([{ who: "E1", what: "down" }, { who: "me", what: "conditions", now: ["slowed 1"] }], l => ({ E1: "Hero" })[l], "Wolf") === "Hero is down. Wolf's conditions are now slowed 1.");
  check("a plan reason loses its step number", describeChange({ who: "plan", what: "illegal", reason: "Step 1: E1 is 30 ft away, out of reach of Jaws (5 ft)." }) === "E1 is 30 ft away, out of reach of Jaws (5 ft).");
  check("re-plans capped", MAX_REPLANS === 3);
}

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
const rq = { a: { state: "done", round: 1, combatantId: "w" }, b: { state: "ready", round: 2, combatantId: "w", turn: 0 }, c: { state: "stopped", round: 2, combatantId: "x" } };
check("current by round and combatant", currentOf(rq, 2, "w")?.id === "b"); check("a moved turn number keeps the request", currentOf({ b: { ...rq.b, turn: 0 } }, 2, "w")?.turn === 0); check("old round not current", currentOf(rq, 3, "w") === null); check("finished not current", currentOf(rq, 1, "w") === null);
check("busy states", requestBusy({ state: "running" }) && requestBusy({ state: "submitted" }) && requestBusy({ state: "ready", go: true }) && !requestBusy({ state: "ready" }) && !requestBusy({ state: "requested" }) && !requestBusy({ state: "held" }) && !requestBusy({ state: "stopped" }) && !requestBusy(null));
/* ---- what a monster perceives, against the rules ---- */
{
  const wolf = sensesOf([{ type: "low-light-vision", acuity: "precise", range: null }, { type: "scent", acuity: "imprecise", range: 30 }]), man = sensesOf([]), orc = sensesOf([{ type: "darkvision", acuity: "precise", range: null }]);
  const see = (senses, o = {}) => perceiveOne({ senses, sees: true, heard: true, light: "bright", distance: 40, ...o }).state;
  check("hearing added", man.some(s => s.type === "hearing" && s.acuity === "imprecise" && s.range == null)); check("deaf hears nothing", !sensesOf([], { deafened: true }).length);
  check("bright: observed", see(man) === "observed"); check("dim: concealed without low-light", see(man, { light: "dim" }) === "concealed"); check("dim: low-light sees", see(wolf, { light: "dim" }) === "observed"); check("dim: darkvision sees", see(orc, { light: "dim" }) === "observed");
  check("dark: hearing only, so hidden", see(man, { light: "dark" }) === "hidden"); check("dark: low-light doesn't help", see(wolf, { light: "dark" }) === "hidden"); check("dark: darkvision sees", see(orc, { light: "dark" }) === "observed");
  check("wall: heard, hidden", see(man, { sees: false }) === "hidden"); check("wall that stops sound: unnoticed", see(man, { sees: false, heard: false }) === "unnoticed"); check("seen before: undetected", see(man, { sees: false, heard: false, known: true }) === "undetected");
  check("scent in range past a wall", see(wolf, { sees: false, heard: false, distance: 30 }) === "hidden"); check("scent out of range", see(wolf, { sees: false, heard: false, distance: 35 }) === "unnoticed");
  check("vague lifts unnoticed only", see([{ type: "scent", acuity: "vague", range: null }], { sees: false }) === "undetected"); check("vague doesn't lift undetected", see([{ type: "scent", acuity: "vague", range: null }], { sees: false, known: true }) === "undetected");
  check("precise non-vision", see(sensesOf([{ type: "echolocation", acuity: "precise", range: 40 }]), { sees: false }) === "observed");
  check("blinded: hearing only", see(man, { blinded: true }) === "hidden"); check("deaf and blind: nothing", see(sensesOf([], { deafened: true }), { blinded: true }) === "unnoticed");
  check("dazzled: concealed", see(man, { dazzled: true }) === "concealed"); check("dazzled with another precise sense", see(sensesOf([{ type: "echolocation", acuity: "precise", range: 60 }]), { dazzled: true }) === "observed");
  check("invisible: hidden by hearing", see(man, { invisible: true }) === "hidden"); check("see invisibility", see(sensesOf([{ type: "see-invisibility", acuity: "precise" }]), { invisible: true }) === "observed");
  check("concealing effect", see(man, { concealed: true }) === "concealed");
  check("stored hidden beats sight", see(man, { stored: "hidden" }) === "hidden"); check("stored undetected beats hearing", see(man, { sees: false, stored: "undetected" }) === "undetected"); check("stored observed is no answer behind a wall", see(man, { sees: false, stored: "observed" }) === "hidden");
  check("stored observed in the dark", see(man, { light: "dark", stored: "observed" }) === "hidden"); check("stored unnoticed", see(man, { stored: "unnoticed" }) === "unnoticed"); check("no stored answer", see(man, { stored: null }) === "observed"); check("AVS answers directly", see(man, { stored: "concealed", avs: true, sees: false }) === "concealed");
  check("worse", worse("observed", "hidden") === "hidden" && worse("undetected", "hidden") === "undetected"); check("flat DCs", flatDC("observed") === 0 && flatDC("concealed") === 5 && flatDC("hidden") === 11); check("targets", canTarget("hidden") && !canTarget("undetected") && !canTarget("unnoticed"));
  check("light levels", lightAt({ sceneLevel: 1 }) === "bright" && lightAt({ sceneLevel: .75 }) === "bright" && lightAt({ sceneLevel: .5 }) === "dim" && lightAt({ sceneLevel: .25 }) === "dark");
  check("light raises", lightAt({ sceneLevel: 0, sources: [{ reach: "dim" }] }) === "dim" && lightAt({ sceneLevel: 0, sources: [{ reach: "dim" }, { reach: "bright" }] }) === "bright"); check("darkness wins", lightAt({ sceneLevel: 1, sources: [{ reach: "bright" }, { darkness: true }] }) === "dark");
  check("actions", actionsFor() === 3 && actionsFor({ quickened: true }) === 4 && actionsFor({ slowed: 1 }) === 2 && actionsFor({ stunned: 2, slowed: 1 }) === 1 && actionsFor({ reduced: 1 }) === 2 && actionsFor({ stunned: 5 }) === 0 && actionsFor({ quickened: true, slowed: 1 }) === 3);
  const l1 = { a: "E1", c: "E3" }, l2 = assignLabels(l1, ["a", "b", "c", "d"], "E"); check("labels stay and fill in", l2.b === "E2" && l2.d === "E4" && !("a" in l2));
  const words = healthEntries({}, "Dead, At Death's Door, Not Feeling Good, Seen Better Days, Barely Hurt, Perfectly Fine"); check("default markers as PF2e HUD", words.entries.map(e => e.marker).join() === "1,25,50,75" && words.full === "Perfectly Fine");
  check("health words", healthWord({ value: 0, max: 20 }, words) === "Dead" && healthWord({ value: 20, max: 20 }, words) === "Perfectly Fine" && healthWord({ value: 19, max: 20 }, words) === "Barely Hurt" && healthWord({ value: 10, max: 20 }, words) === "Seen Better Days" && healthWord({ value: 9, max: 20 }, words) === "Not Feeling Good" && healthWord({ value: 1, max: 20 }, words) === "At Death's Door"); check("temp HP hides a scratch", healthWord({ value: 19, max: 20, temp: 2 }, words) === "Perfectly Fine");
  check("custom health entries", healthWord({ value: 5, max: 10 }, healthEntries({ dead: "x", full: "y", entries: [{ label: "low", marker: 1 }, { label: "mid", marker: 40 }] })) === "mid");
  check("visible conditions only", visibleConditions(["prone", "frightened", "prone", "sickened", "grabbed"]).join() === "grabbed,prone");
  check("plain text", plainText('<p><strong>Requirements</strong> Has a creature @UUID[Compendium.pf2e.conditionitems.Item.x]{Grabbed}.</p><p>@Check[reflex|dc:20] &amp; @Damage[(1d6+3)[fire]]</p><p>@Localize[K]</p>', k => k === "K" ? "<p>Grab text</p>" : k) === "Requirements Has a creature Grabbed.\nDC 20 reflex & (1d6+3) fire\nGrab text");
  const page = '<h3 data-group="0">Wolf (beast)</h3><p>Circle.</p><h3 data-group="1">Hob (brute)</h3><p>Charge.</p><section class="secret"><p>He is the mayor.</p></section>';
  check("tactics by group", tacticsFor(page, 0) === "Wolf (beast)\nCircle."); check("tactics, secret out", !tacticsFor(page, 1).includes("mayor") && tacticsFor(page, 1).includes("Charge")); check("tactics, rewritten page", tacticsFor("<p>All rush.</p>", 2) === "All rush.");
  check("strike numbers", strikeMods(["Strike +12", "+7 (MAP -5)", "+2 (MAP -10)"]).join() === "12,7,2" && strikeMods(["Strike -1", "-6 (MAP -5)"]).join() === "-1,-6");
  const m = buildModel({ cols: 6, rows: 6, walls: [], costs: [0, 1, 2, 0, 0, 0, ...new Array(30).fill(0)], occupied: new Array(36).fill(true), entrySquares: [[5, 5]] }), g = groundAround(m, [0, 0], 2); check("ground", g.rows.length === 3 && g.rows[0] === ".dD" && g.from.join() === "0,0"); check("ground hides tokens", !g.rows.join("").includes("o"));
  const others = [{ id: "a", label: "E1", state: "observed", square: [1, 1], size: "med", gear: ["Sword"], conditions: ["prone"], healthWord: "Barely Hurt", distance: 10, cover: "none", hp: 17, ac: 19, level: 3, name: "Sekrit" }, { id: "b", label: "E2", state: "hidden", square: [2, 2], size: "med", gear: ["Sword"], healthWord: "x", distance: 5 }, { id: "c", label: "E3", state: "undetected", square: [3, 3] }, { id: "d", label: "E4", state: "undetected", square: [4, 4] }, { id: "e", label: "E5", state: "unnoticed", square: [5, 5] }];
  const pk = packetOf({ you: { label: "M1" }, others, memory: { c: { square: [9, 9], round: 2 } }, round: 3 }), flat = JSON.stringify(pk);
  check("hidden shows the square only", Object.keys(pk.perceived[1]).sort().join() === "label,square,state"); check("nothing off a sheet", !/"(hp|ac|level|name|saves)"/.test(flat.replace(/"you":\{[^}]*\}/, "")) && !flat.includes("Sekrit") && !flat.includes("17")); check("undetected: only what it remembers", pk.memory.length === 1 && pk.memory[0].lastSeen.join() === "9,9" && !pk.perceived.some(p => p.label === "E3" || p.label === "E4")); check("unnoticed: nothing", !flat.includes("E5") && !flat.includes("E4"));
  check("packet carries what's done and why", pk.note === null && Array.isArray(pk.done) && pk.done.length === 0 && packetOf({ you: {}, done: [{ do: "none" }], note: "E1 is down." }).done.length === 1);
  check("plan labels", Object.keys(labelsOf(others)).join() === "E1,E2"); const rem = remember({ a: { square: [1, 1], round: 3 } }, others, 3); check("remember only changes", Object.keys(rem).join() === "b" && rem.b.square.join() === "2,2");
  check("card line", describeKnows(pk, l => ({ E1: "Hero", E2: "Rogue", E3: "Monk" })[l]) === "Knows of: Hero (observed), Rogue (hidden). Remembers: Monk (round 2).");
  const hid = checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E2" }] }, { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 10 }], targets: { E2: { name: "Rogue", distance: 5, flat: 11 } } }); check("plan carries the flat check", hid.ok && hid.steps[0].flat === 11 && describeStep(hid.steps[0]).includes("DC 11")); check("unknown target refused", !checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E9" }] }, { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 10 }], targets: {} }).ok);
  check("a thrown dagger has its own id", strikeIds([{ slug: "dagger" }, { slug: "dagger", ranged: true }, { slug: "fist" }, { slug: "fist" }]).join() === "dagger,dagger-ranged,fist,fist-2");
  check("flat first", nextAction({}, { flat: 5 }) === "flat"); check("flat unsure asks", nextAction({ flatStarted: true }, { flat: 5 }) === "ask"); check("flat failed ends the step", nextAction({ flatStarted: true, flat: { ok: false } }, { flat: 5 }) === "next"); check("flat passed attacks", nextAction({ flatStarted: true, flat: { ok: true } }, { flat: 5 }) === "attack"); check("no flat, as before", nextAction({}) === "attack");
}

/* ---- the brain interface ---- */
{
  const ok = cleanPlan({ requestId: "r1", reason: "Wizard\u0007 is alone", steps: [{ do: "strike", item: "jaws", target: "E2", hp: 5 }, { do: "stride", to: [3, 4] }], suggestOpus: true, extra: "x" });
  check("plan cleaned", ok.ok && ok.plan.steps.length === 2 && !("hp" in ok.plan.steps[0]) && !("extra" in ok.plan) && ok.plan.reason === "Wizard is alone" && ok.plan.suggestOpus === true && ok.plan.schema === 1, JSON.stringify(ok));
  check("plan from JSON text", cleanPlan('{"steps":[{"do":"none"}]}').ok); check("broken JSON", /JSON/.test(cleanPlan("{steps").reason)); check("not an object", !cleanPlan([1]).ok && !cleanPlan(null).ok);
  check("no steps", /no steps/.test(cleanPlan({ steps: [] }).reason)); check("too many steps", /at most/.test(cleanPlan({ steps: new Array(9).fill({ do: "none" }) }).reason));
  check("unknown kind", /isn't a kind/.test(cleanPlan({ steps: [{ do: "fireball" }] }).reason)); check("bad label", /label/.test(cleanPlan({ steps: [{ do: "strike", item: "jaws", target: "Hero" }] }).reason)); check("bad id", /id/.test(cleanPlan({ steps: [{ do: "strike", item: "<b>", target: "E1" }] }).reason));
  check("bad square", /square/.test(cleanPlan({ steps: [{ do: "stride", to: [1] }] }).reason) && !cleanPlan({ steps: [{ do: "stride", to: [-1, 2] }] }).ok); check("wrong schema", /schema/.test(cleanPlan({ schema: 2, steps: [{ do: "none" }] }).reason));
  check("long reason capped", cleanPlan({ reason: "x".repeat(900), steps: [{ do: "none" }] }).plan.reason.length === 300); check("text", text("a\nb", 10) === "a b" && text(5, 10) === "");
  check("every kind accepted by shape", STEP_KINDS.every(k => cleanPlan({ steps: [{ do: k }] }).ok));
  check("cleaned plan still checks", checkPlan(cleanPlan({ steps: [{ do: "strike", item: "jaws", target: "E1" }] }).plan, { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }], targets: { E1: { name: "Hero", distance: 5 } } }).ok);
  check("interact kept clean", (() => { const c = cleanPlan({ steps: [{ do: "interact", what: " open the  door ", after: "E1" }] }); return c.ok && c.plan.steps[0].what === "open the door" && c.plan.steps[0].after === "E1"; })());
  check("bad after label refused", !cleanPlan({ steps: [{ do: "delay", after: "Hero" }] }).ok);
  const meta = cleanMeta({ by: "chat", model: "x".repeat(99), generation: 3, usage: { in: 10, out: -1, cost: "a" } }); check("meta", meta.by === "chat" && meta.model.length === 60 && meta.generation === 3 && meta.usage.in === 10 && meta.usage.out === null && meta.usage.cost === null);
  check("meta defaults", JSON.stringify(cleanMeta()) === JSON.stringify({ by: "gm", model: null, generation: null, usage: null }) && cleanMeta({ by: "boss", generation: 1.5 }).by === "gm" && cleanMeta({ generation: 1.5 }).generation === null);
  check("seq follows the clock", nextSeq(0, 1000.7) === 1000); check("seq never repeats", nextSeq(2000, 1000) === 2001 && nextSeq(1000, 1000) === 1001);
  const req = { state: "requested", packet: { you: { label: "M1" } }, tries: 0, round: 2 };
  check("turn event live", live({ tries: 0 }, req)); check("retry not live yet", !live({ tries: 1 }, req)); check("retry live after a refusal", live({ tries: 1 }, { ...req, tries: 1 }) && !live({ tries: 0 }, { ...req, tries: 1 }));
  check("not live once planned", !live({ tries: 0 }, { ...req, state: "submitted" }) && !live({ tries: 0 }, { ...req, state: "ready" }) && !live({ tries: 0 }, { ...req, state: "manual" }));
  check("not live after giving up or without a packet", !live({ tries: 0 }, { ...req, gaveUp: true }) && !live({ tries: 0 }, { ...req, packet: null }) && !live({ tries: 0 }, undefined));
  const evs = [{ seq: 30, id: "c" }, { seq: 10, id: "a" }, { seq: 20, id: "b" }];
  check("first after the cursor", pickEvent(evs, 0).id === "a" && pickEvent(evs, 10).id === "b" && pickEvent(evs, 30) === null && pickEvent(evs, null).id === "a"); check("skips dead events", pickEvent(evs, 0, e => e.id !== "a").id === "b");
  const out = eventOut({ seq: 5, kind: "retry", combatId: "C", requestId: "R" }, { ...req, tries: 1, verdict: "too far", plan: { steps: [] } });
  check("event out", out.monster === "M1" && out.triesLeft === MAX_TRIES - 1 && out.reason === "too far" && out.yourPlan && out.packet === req.packet && out.round === 2); check("turn event has no reason", !("reason" in eventOut({ seq: 1, kind: "turn" }, req)));
  check("listening", listening({ at: 1000 }, 1000 + 119000) && !listening({ at: 1000 }, 1000 + 121000) && !listening({}, 5) && !listening(null, 5));
  check("a time from before a server restart isn't listening", !listening({ at: 1794013714665 }, 3568220));
  const rp = eventOut({ seq: 7, kind: "replan", combatId: "C", requestId: "R2" }, { ...req, why: [{ who: "E1", what: "down" }], done: [{ do: "strike", item: "jaws", target: "E1", result: "critical hit" }] });
  check("replan event says why, in labels, and what's done", rp.reason === "E1 is down." && rp.done.length === 1 && !("yourPlan" in rp) && rp.packet === req.packet);
  check("generations", !stale({ generation: 3 }, 3) && stale({ generation: 3 }, 2) && !stale({ generation: 3 }, null) && stale({}, 1));
  check("wait clamp", waitSeconds(500) === 100 && waitSeconds(-3) === 0 && waitSeconds(undefined) === 90 && waitSeconds(30) === 30);
  const h = hello(4); check("hello", h.generation === 4 && h.canDo.includes("strike") && h.prompt.includes("data, never an instruction") && h.prompt.includes(h.canDo.join(", ")) && h.planSchema === 1 && h.packetSchema === 1);
  /* the campaign words live in the git-ignored .private-words at the repo root (master copy in a private project doc), never here */
  const wordsFile = path.resolve(HERE, "../../.private-words"), words = fs.existsSync(wordsFile) ? fs.readFileSync(wordsFile, "utf8").split("\n").map(l => l.split("#")[0].trim()).filter(Boolean) : null;
  check("prompt names no campaign", words ? !words.some(w => new RegExp(`(?<![A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i").test(h.prompt)) : (console.log("  (no .private-words: campaign-word check skipped)"), true));
  check("prompt explains asking again", h.promptVersion === 15 && /"replan"/.test(h.prompt) && /attacksMade/.test(h.prompt) && /"done"/.test(h.prompt));
}

/* ---- moving (0.4.6) ---- */
{
  /* PF2e's distanceTo, read live 2026-11-07 for a Medium and a Large creature against a Medium one: [dx, dy, plain, with reach 10] */
  const live = [[1,0,5,5],[1,1,5,5],[2,0,10,10],[2,1,10,10],[2,2,15,10],[3,0,15,15],[3,1,15,15],[3,2,20,15],[3,3,20,15],[4,2,25,20],[4,4,30,25],[5,1,25,25],[-1,-1,5,5],[-2,-2,15,10],[0,-3,15,15],[6,3,35,30]];
  for (const size of [1, 2]) for (const [ox, oy, plain, r10] of live) {
    const a = { x: 18 + ox + (ox < 0 ? -(size - 1) : 0), y: 35 + oy + (oy < 0 ? -(size - 1) : 0), size }, b = { x: 18, y: 35, size: 1 };
    check(`distance ${size} ${ox},${oy}`, distanceBetween(a, b) === plain && distanceBetween(a, b, { reach: 10 }) === r10 && distanceBetween(b, a) === plain, `${distanceBetween(a, b)} ${distanceBetween(a, b, { reach: 10 })}`);
  }
  /* off the grid (0.8.3): PF2e snaps each creature's edges toward the other, so a Small goblin at x 23.5 beside a creature at x 22 is 5 ft away (found
     2026-11-07 night, when the check measured from the rounded square, 10 ft, and refused a Strike the packet called 5 ft) */
  check("off-grid next to it is 5", distanceBetween({ x: 23.5, y: 19.5 }, { x: 22, y: 19 }) === 5 && distanceBetween({ x: 22, y: 19 }, { x: 23.5, y: 19.5 }) === 5);
  check("off-grid two squares off is 10", distanceBetween({ x: 24.5, y: 19.5 }, { x: 22, y: 19 }) === 10 && distanceBetween({ x: 23.5, y: 19.5 }, { x: 21, y: 19 }) === 10);
  check("off-grid half overlapping is 0", distanceBetween({ x: 22.5, y: 19.5 }, { x: 22, y: 19 }) === 0 && distanceBetween({ x: 23, y: 19.5 }, { x: 22, y: 19 }) === 5);
  check("off-grid Large and reach 10", distanceBetween({ x: 25.5, y: 22.5, size: 2 }, { x: 22, y: 19 }) === 20 && distanceBetween({ x: 25.5, y: 22.5, size: 2 }, { x: 22, y: 19 }, { reach: 10 }) === 15 && distanceBetween({ x: 25.5, y: 22.5, size: 2 }, { x: 22, y: 19 }) === distanceBetween({ x: 25, y: 22, size: 2 }, { x: 22, y: 19 }));
  check("on the grid unchanged", distanceBetween({ x: 24, y: 20 }, { x: 22, y: 19 }) === 10);
  {
    const og = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }], me: { square: [24, 20], pos: [23.5, 19.5], size: 1 }, targets: { E1: { name: "E1", square: [22, 19], pos: [22, 19], size: 1 } }, speed: 25, route: (f, t) => ({ ok: true, route: [f, t], cost: 5 }) };
    check("off-grid Strike measured where it stands", checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E1" }] }, og).ok);
    check("off-grid target measured where it stands", checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E1" }] }, { ...og, me: { square: [21, 18], size: 1 }, targets: { E1: { name: "E1", square: [23, 20], pos: [22.5, 19.5], size: 1 } } }).ok);
    check("a hidden target (no pos) is measured from the square the monster knows", /out of reach/.test(checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E1" }] }, { ...og, me: { square: [21, 18], size: 1 }, targets: { E1: { name: "E1", square: [23, 20], size: 1, flat: 11 } } }).reason ?? ""));
    check("its real width counts", checkPlan({ steps: [{ do: "strike", item: "jaws", target: "E1" }] }, { ...og, me: { square: [24, 20], pos: [24, 20], span: 1, size: 1 }, targets: { E1: { name: "E1", square: [21, 19], pos: [21, 19], span: 2.4, size: 2 } } }).ok);
    check("Hide reads the light where it really stands", checkPlan({ steps: [{ do: "hide" }] }, { ...og, lightAt: sq => sq[0] % 1 ? "dim" : "bright" }).ok);
    check("after a move, measured from the new square", /out of reach/.test(checkPlan({ steps: [{ do: "stride", to: [26, 20] }, { do: "strike", item: "jaws", target: "E1" }] }, og).reason ?? ""));
  }
  check("overlap is 0", distanceBetween({ x: 3, y: 3, size: 2 }, { x: 4, y: 4 }) === 0); check("footprint", footprintAt([2, 3], 2).map(p => p.join()).join(" ") === "2,3 3,3 2,4 3,4");
  /* a 12x12 world: difficult squares, a wall line, creatures */
  const W = ({ diff = [], deep = [], solid = [], who = {}, wall = () => false } = {}) => ({ cols: 12, rows: 12, terrain: (i, j) => deep.some(p => p[0] === i && p[1] === j) ? null : diff.some(p => p[0] === i && p[1] === j) ? 1 : 0,
    blocked: (i, j) => solid.some(p => p[0] === i && p[1] === j), creature: (i, j) => who[`${i},${j}`] ?? null, wall });
  let r = findRoute({ from: [0, 0], to: [5, 0], budget: 35 }, W()); check("straight 25", r.ok && r.cost === 25 && r.route.length === 6);
  r = findRoute({ from: [0, 0], to: [5, 0], budget: 35 }, W({ diff: [[3, 0], [4, 0]] })); check("difficult adds 5 a square, or goes round", r.ok && r.cost <= 35, JSON.stringify(r));
  r = findRoute({ from: [0, 5], to: [5, 5], budget: 60 }, W({ diff: [[1, 4], [1, 5], [1, 6], [2, 4], [2, 5], [2, 6], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]] })); check("matches Foundry's count on a field", r.ok, JSON.stringify(r));
  r = findRoute({ from: [0, 0], to: [4, 4], budget: 35 }, W()); check("diagonals 5-10", r.ok && r.cost === 30);
  r = findRoute({ from: [0, 0], to: [3, 3], budget: 35 }, W({ diff: [[3, 3]] })); check("diagonal into difficult: 5 more, as Foundry charged", r.ok && r.cost === 25, JSON.stringify(r));
  r = findRoute({ from: [0, 0], to: [8, 0], budget: 35 }, W()); check("too far says how far", !r.ok && r.why === "far" && r.cost === 40);
  check("far in words", /takes 40 ft, more than its Speed of 35 ft/.test(routeWords(r, [8, 0], 35)));
  check("same square", findRoute({ from: [1, 1], to: [1, 1] }, W()).why === "same"); check("off the map", findRoute({ from: [1, 1], to: [12, 1] }, W()).why === "off");
  check("deep water", findRoute({ from: [1, 1], to: [3, 1] }, W({ deep: [[3, 1]] })).why === "terrain" && /Swim/.test(routeWords({ why: "terrain" }, [3, 1], 35)));
  check("can't end on anyone", findRoute({ from: [1, 1], to: [3, 1] }, W({ who: { "3,1": "ally" } })).why === "occupied");
  check("through an ally", findRoute({ from: [0, 1], to: [2, 1], budget: 10 }, W({ who: { "1,1": "ally", "1,0": "enemy", "1,2": "enemy" } })).cost === 10);
  r = findRoute({ from: [0, 1], to: [2, 1], budget: 30 }, W({ who: { "1,0": "enemy", "1,1": "enemy", "1,2": "enemy" } })); check("round an enemy", r.ok && r.cost > 10 && !r.route.some(p => p[0] === 1 && p[1] <= 2), JSON.stringify(r));
  check("solid", findRoute({ from: [1, 1], to: [3, 1] }, W({ solid: [[3, 1]] })).why === "blocked");
  const wallX = (a, b) => (a[0] < 4) !== (b[0] < 4) && Math.min(a[1], b[1]) < 9;   /* a wall between x 3 and 4, open from row 9 down */
  r = findRoute({ from: [2, 2], to: [5, 2], budget: 200 }, W({ wall: wallX })); check("round a wall", r.ok && r.route.some(p => p[1] >= 9) && r.cost > 15, JSON.stringify(r.cost));
  check("no way", findRoute({ from: [2, 2], to: [5, 2], budget: 500 }, W({ wall: (a, b) => (a[0] < 4) !== (b[0] < 4) })).why === "noway");
  r = findRoute({ from: [0, 0], to: [4, 0], size: 2, budget: 35 }, W({ who: { "2,2": "enemy" } })); check("large", r.ok && r.cost === 20);
  check("large can't squeeze past an enemy", findRoute({ from: [0, 0], to: [4, 0], size: 2, budget: 35 }, W({ who: { "2,1": "enemy" } })).cost > 20);
  check("large end must fit", findRoute({ from: [0, 0], to: [11, 0], size: 2 }, W()).why === "off");
  check("heading", headingOf([5, 5], [5, 1]) === "north" && headingOf([5, 5], [9, 9]) === "south-east" && headingOf([5, 5], [1, 4]) === "west");

  /* a plan with Strides */
  const route = (from, to) => { const x = findRoute({ from, to, budget: 35 }, W({ who: { "6,5": "enemy" } })); return x.ok || x.why === "far" ? { ok: true, route: x.route, cost: x.cost } : { ok: false, reason: routeWords(x, to, 35) }; };
  const mctx = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 10 }, { id: "bite", name: "Bite", reach: 5 }, { id: "bow", name: "Bow", ranged: true, maxRange: 30 }], targets: { E1: { name: "E1", square: [6, 5], size: 1 } }, me: { square: [0, 5], size: 1 }, speed: 35, cantMove: null, route };
  let p = checkPlan({ steps: [st({ item: "bite", target: "E1" })] }, mctx); check("out of reach from where it is", !p.ok && /30 ft away, out of reach/.test(p.reason), p.reason);
  p = checkPlan({ steps: [{ do: "stride", to: [5, 5] }, st({ item: "bite", target: "E1" }), st({ item: "bite", target: "E1" })] }, mctx); check("stride then bite twice", p.ok && p.steps[0].cost === 25 && p.steps[1].variant === 0 && p.steps[2].variant === 1, JSON.stringify(p));
  check("stride in words", describeStep(p.steps[0]) === "Strides 25 ft east, to square 5, 5.");
  p = checkPlan({ steps: [{ do: "stride", to: [4, 5] }, st({ item: "bite", target: "E1" })] }, mctx); check("reach measured from the new square", !p.ok && /10 ft away from \[4, 5\], out of reach of Bite/.test(p.reason), p.reason);
  check("10-ft reach two diagonals", checkPlan({ steps: [{ do: "stride", to: [4, 3] }, st({ item: "jaws", target: "E1" })] }, mctx).ok);

  /* fleeing off the map (2026-11-08): a flee is a Stride that must end on the outermost ring and be the plan's last step */
  check("edges of a 12x12 map", edgeSides([0, 5], 1, 12, 12).join() === "west" && edgeSides([11, 0], 1, 12, 12).join() === "north,east" && edgeSides([5, 5], 1, 12, 12).length === 0 && edgeSides([10, 10], 2, 12, 12).join() === "east,south" && edgeSides([0, 0], 1, 0, 0).length === 0);
  check("sides in order", SIDES.join() === "north,east,south,west");
  const fctx = { ...mctx, edgeAt: (sq, n) => edgeSides(sq, n, 12, 12) };
  p = checkPlan({ steps: [{ do: "flee", to: [0, 1] }] }, fctx); check("flee to the west edge", p.ok && p.steps[0].do === "flee" && p.steps[0].sides.join() === "west" && p.steps[0].cost === 20, JSON.stringify(p));
  check("flee in words", /^Flees 20 ft north, to square 0, 1 at the west edge of the map: you decide/.test(describeStep(p.steps[0])), describeStep(p.steps[0]));
  check("flee not on the ring refused", /outermost ring/.test(checkPlan({ steps: [{ do: "flee", to: [3, 5] }] }, fctx).reason ?? ""));
  check("flee too far refused like a Stride", /more than its Speed/.test(checkPlan({ steps: [{ do: "flee", to: [11, 11] }] }, fctx).reason ?? ""));

  /* Interact and Delay (0.12.0) */
  const ictx = { ...mctx, fresh: true, order: { E1: "later", M2: "earlier", M1: "self" }, grabbed: false, cantAttack: null };
  p = checkPlan({ steps: [{ do: "interact", what: "draws its horn" }] }, ictx); check("interact accepted", p.ok && p.steps[0].do === "interact" && p.steps[0].what === "draws its horn" && !p.steps[0].flat, JSON.stringify(p));
  check("interact in words", describeStep(p.steps[0]) === "Interacts: draws its horn. Its card goes to chat for you to apply.", describeStep(p.steps[0]));
  check("interact needs what", /needs "what"/.test(checkPlan({ steps: [{ do: "interact" }] }, ictx).reason ?? ""));
  check("interact restrained refused", /restrained, so it can't Interact/.test(checkPlan({ steps: [{ do: "interact", what: "x" }] }, { ...ictx, cantAttack: "it is restrained, so it can't attack." }).reason ?? ""));
  p = checkPlan({ steps: [{ do: "interact", what: "grabs the rope" }] }, { ...ictx, grabbed: true }); check("interact grabbed gets a DC 5 flat check", p.ok && p.steps[0].flat === 5 && /DC 5 flat check first/.test(describeStep(p.steps[0])), JSON.stringify(p));
  check("interact costs an action", checkPlan({ steps: [{ do: "interact", what: "a" }, { do: "interact", what: "b" }, { do: "interact", what: "c" }, { do: "interact", what: "d" }] }, ictx).reason === "Step 4: no actions left.");
  check("interact keeps Take Cover", (() => { const r = checkPlan({ steps: [{ do: "interact", what: "a" }, { do: "take-cover" }] }, { ...ictx, tookCover: true }); return /already Taking Cover/.test(r.reason ?? ""); })());
  check("interact reveals, delay keeps hidden", revealsBefore({ do: "interact" }) && !revealsBefore({ do: "delay" }) && !revealsAfter({ do: "interact" }));
  check("interact done step", doneStep({ do: "interact", what: "x" }, { posted: { message: "m" } }).result === "card posted for the GM to apply" && doneStep({ do: "interact", what: "x" }, { flat: { ok: false } }).result === "flat check failed");
  p = checkPlan({ steps: [{ do: "delay", after: "E1" }] }, ictx); check("delay accepted", p.ok && p.steps[0].do === "delay" && p.steps[0].after === "E1", JSON.stringify(p));
  check("delay in words", /^Delays until after E1's turn: its turn ends now/.test(describeStep(p.steps[0])), describeStep(p.steps[0]));
  check("delay costs nothing", spentBy(p.steps).actions === 0);
  check("delay must be alone", /only step/.test(checkPlan({ steps: [{ do: "delay", after: "E1" }, st({ item: "bite", target: "E1" })] }, ictx).reason ?? "") && /only step/.test(checkPlan({ steps: [{ do: "stride", to: [5, 5] }, { do: "delay", after: "E1" }] }, ictx).reason ?? ""));
  check("delay needs an untouched turn", /already acted this turn/.test(checkPlan({ steps: [{ do: "delay", after: "E1" }] }, { ...ictx, fresh: false }).reason ?? ""));
  check("delay needs after", /needs "after"/.test(checkPlan({ steps: [{ do: "delay" }] }, ictx).reason ?? ""));
  check("delay unknown creature", /doesn't know of "E7"/.test(checkPlan({ steps: [{ do: "delay", after: "E7" }] }, ictx).reason ?? ""));
  check("delay after itself refused", /its own turn/.test(checkPlan({ steps: [{ do: "delay", after: "M1" }] }, ictx).reason ?? ""));
  check("delay after one who acted refused", /already acted this round/.test(checkPlan({ steps: [{ do: "delay", after: "M2" }] }, ictx).reason ?? ""));
  check("delay while paralyzed refused", /paralyzed/.test(checkPlan({ steps: [{ do: "delay", after: "E1" }] }, { ...ictx, cantAct: "it is paralyzed and can't act." }).reason ?? ""));
  check("delay done step", doneStep({ do: "delay", after: "E1" }, { ended: true, moved: true }).result.startsWith("delayed") && /may not have moved/.test(doneStep({ do: "delay", after: "E1" }, { ended: true }).result));
  check("interact stages", nextInteract({}) === "post" && nextInteract({ started: true }) === "ask" && nextInteract({ started: true, posted: { message: "m" } }) === "gm" && nextInteract({}, { flat: 5 }) === "flat" && nextInteract({ flatStarted: true }, { flat: 5 }) === "ask" && nextInteract({ flatStarted: true, flat: { ok: false } }, { flat: 5 }) === "next" && nextInteract({ flatStarted: true, flat: { ok: true } }, { flat: 5 }) === "post" && nextInteract({ flatStarted: true, flat: { ok: true }, posted: {} }, { flat: 5 }) === "gm");
  check("a done delayed request isn't current", currentOf({ a: { state: "done", delayed: true, round: 1, combatantId: "c" } }, 1, "c") === null);
  check("interact history line", /its card posted for you to apply/.test(stepResult({ do: "interact", what: "x" }, { started: true, posted: { message: "m1" } }).text) && stepResult({ do: "interact", what: "x" }, { posted: { message: "m1" } }).cards.includes("m1") && /failed, the action is spent/.test(stepResult({ do: "interact", what: "x", flat: 5 }, { flatStarted: true, flat: { total: 1, dc: 5, ok: false } }).text));
  check("delay history line", /back in the order right after E1/.test(stepResult({ do: "delay", after: "E1" }, { ended: true, moved: true }).text) && /may not have moved/.test(stepResult({ do: "delay", after: "E1" }, { ended: true }).text));
  check("bad what refused", !cleanPlan({ steps: [{ do: "interact", what: { a: 1 } }] }).ok);
  check("prompt teaches interact and delay", /"do": "interact", "what"/.test(hello(1).prompt) && /"do": "delay", "after"/.test(hello(1).prompt) && /DC 5 flat check/.test(hello(1).prompt));
  check("flee must be last", /last step/.test(checkPlan({ steps: [{ do: "flee", to: [0, 1] }, st({ item: "jaws", target: "E1" })] }, fctx).reason ?? ""));
  check("stride then flee", checkPlan({ steps: [{ do: "stride", to: [0, 5] }, { do: "flee", to: [0, 1] }] }, { ...fctx, me: { square: [4, 5], size: 1 } }).ok);
  check("flee needs the map's bounds", /where this map ends/.test(checkPlan({ steps: [{ do: "flee", to: [0, 1] }] }, mctx).reason ?? ""));
  check("a Stride onto the ring is just a Stride", checkPlan({ steps: [{ do: "stride", to: [0, 1] }] }, fctx).steps[0].sides === undefined);
  check("flee costs an action and is a move", COSTS.flee === 1 && isMove({ do: "flee" }) && STEP_KINDS.includes("flee") && spentBy([{ do: "flee" }]).actions === 1);
  check("flee done words", doneStep({ do: "flee", to: [0, 1] }, { moved: { to: [0, 1] } }).result === "reached the map's edge" && doneStep({ do: "flee", to: [0, 1] }, { moved: { to: [2, 3] } }).result === "stopped at [2, 3]");
  check("extended change in words", /extended to the north.*renumber|shifted/.test(describeChanges([{ who: "me", what: "extended", side: "north" }])) && !/shifted/.test(describeChanges([{ who: "me", what: "extended", side: "east" }])));
  check("fled waits on a person, extending on the machine", stallOf({ state: "fled", since: 0 }, { now: 181000 })?.kind === "person" && stallOf({ state: "fled", since: 0 }, { now: 61000 }) === null && stallOf({ state: "extending", since: 0 }, { now: 250000 })?.kind === "machine" && /edge/.test(stallWords({ state: "fled", waited: 1000 })));
  check("extending counts as busy", requestBusy({ state: "extending" }) && requestBusy({ state: "fled", extend: "north" }) && !requestBusy({ state: "fled" }));
  check("prompt teaches flee", /"do": "flee"/.test(promptText({ canDo: Object.keys(COSTS), stepKinds: STEP_KINDS })) && /fleeing condition/.test(promptText({})));
  check("a Large monster flees to the south-east corner", checkPlan({ steps: [{ do: "flee", to: [10, 10] }] }, { ...fctx, me: { square: [8, 8], size: 2 } }).steps?.[0]?.sides.join() === "east,south");
  check("already on the ring: must move", /already at/.test(checkPlan({ steps: [{ do: "flee", to: [0, 1] }] }, { ...fctx, me: { square: [0, 1], size: 1 } }).reason ?? ""));
  check("flee with no actions left refused", !checkPlan({ steps: [{ do: "flee", to: [0, 1] }] }, { ...fctx, actions: 0 }).ok);
  check("extending stall words and busy", /extending/.test(stallWords({ state: "extending", waited: 1000 })) && !requestBusy({ state: "fled", extend: null }) && stallOf({ state: "extending", since: 0 }, { now: 200000 }) === null && stallOf({ state: "extending", since: 0 }, { now: 250000 })?.kind === "machine");
  check("cleanPlan accepts flee", cleanPlan({ steps: [{ do: "flee", to: [0, 1], why: "hurt" }] }).ok);
  check("but not 3 by 2", !checkPlan({ steps: [{ do: "stride", to: [3, 3] }, st({ item: "jaws", target: "E1" })] }, mctx).ok);
  check("two strides from where the first ended", checkPlan({ steps: [{ do: "stride", to: [3, 5] }, { do: "stride", to: [5, 4] }, st({ item: "bite", target: "E1" })] }, mctx).ok);
  check("a stride uses an action", /no actions left/.test(checkPlan({ steps: [{ do: "stride", to: [3, 5] }, { do: "stride", to: [5, 4] }, st({ item: "bite", target: "E1" }), st({ item: "bite", target: "E1" })] }, mctx).reason));
  check("too far, round the enemy in the way", /takes 45 ft, more than its Speed of 35 ft/.test(checkPlan({ steps: [{ do: "stride", to: [8, 5] }] }, mctx).reason ?? ""), checkPlan({ steps: [{ do: "stride", to: [8, 5] }] }, mctx).reason);
  check("onto the target", /another creature is at \[6, 5\]/.test(checkPlan({ steps: [{ do: "stride", to: [6, 5] }] }, mctx).reason));
  check("no square", /needs "to"/.test(checkPlan({ steps: [{ do: "stride" }] }, mctx).reason)); check("already there", /already at/.test(checkPlan({ steps: [{ do: "stride", to: [0, 5] }] }, mctx).reason));
  check("prone", /Stand first/.test(checkPlan({ steps: [{ do: "stride", to: [2, 5] }] }, { ...mctx, prone: true }).reason));
  check("bow from a new square", checkPlan({ steps: [{ do: "stride", to: [1, 5] }, st({ item: "bow", target: "E1" })] }, mctx).ok && !checkPlan({ steps: [st({ item: "bow", target: "E1" })] }, { ...mctx, me: { square: [0, 0], size: 1 } }).ok);
  check("no moves without a route", /can't work out moves/.test(checkPlan({ steps: [{ do: "stride", to: [2, 5] }] }, { ...mctx, route: null }).reason));
  check("spent counts a stride", spentBy([{ do: "stride" }, { do: "strike" }]).actions === 2 && spentBy([{ do: "stride" }]).attacks === 0);
  check("done: arrived", doneStep({ do: "stride", to: [5, 5] }, { moved: { to: [5, 5] } }).result === "arrived" && doneStep({ do: "stride", to: [5, 5] }, { moved: { to: [4, 5] } }).result === "stopped at [4, 5]" && doneStep({ do: "stride", to: [5, 5] }, { started: true }).result === "unknown");
  check("next move", nextMove({}) === "move" && nextMove({ started: true }, [1, 1], [2, 2]) === "ask" && nextMove({ started: true }, [2, 2], [2, 2]) === "arrived" && nextMove({ started: true, moved: { to: [2, 2] } }) === "next");
  /* the diagonal count runs across the turn (Rules ID 444); Foundry charged 15 ft, not 10, for a diagonal and a straight after a move with 3 diagonals (2026-11-07) */
  check("diagonals counted", diagonalsIn([[26, 19], [25, 19], [24, 20], [23, 21], [22, 20], [21, 20], [20, 20]]) === 3 && diagonalsIn() === 0);
  check("odd start: first diagonal 10", findRoute({ from: [6, 6], to: [5, 8], odd: true }, W()).cost === 15 && findRoute({ from: [6, 6], to: [5, 8] }, W()).cost === 10);
  { const seen = []; checkPlan({ steps: [{ do: "stride", to: [2, 5] }, { do: "stride", to: [3, 6] }] }, { ...mctx, route: (f, t, before) => { seen.push(before.map(r => r.length)); return route(f, t); } });
    check("later strides see earlier routes", seen.length === 2 && seen[0].length === 0 && seen[1].length === 1 && seen[1][0] === 3, JSON.stringify(seen)); }
  check("can't act: no step but none", /paralyzed/.test(checkPlan({ steps: [st({ item: "bite", target: "E1" })] }, { ...mctx, cantAct: "it is paralyzed and can't act." }).reason) && checkPlan({ steps: [{ do: "none" }] }, { ...mctx, cantAct: "x" }).ok);
  /* the independent review's findings (2026-11-07) */
  check("height counts, as PF2e's third axis", distanceBetween({ x: 0, y: 0 }, { x: 0, y: 0, elev: 20 }) === 20 && distanceBetween({ x: 0, y: 0 }, { x: 1, y: 0, elev: 20 }) === 20 && distanceBetween({ x: 0, y: 0 }, { x: 1, y: 0, elev: 5 }) === 5 && distanceBetween({ x: 0, y: 0, elev: 10 }, { x: 1, y: 0, elev: 10 }) === 5);
  check("a bite can't reach a flyer", /out of reach/.test(checkPlan({ steps: [st({ item: "bite", target: "E1" })] }, { ...mctx, me: { square: [5, 5], size: 1 }, targets: { E1: { name: "E1", square: [6, 5], size: 1, elev: 20 } } }).reason));
  check("a dragged move's diagonals", diagonalsIn([[0, 0], [3, 2]]) === 2 && diagonalsIn([[0, 0], [3, 0]]) === 0);
  check("far past the search is far, not no way", findRoute({ from: [0, 0], to: [11, 0], budget: 5 }, W()).why === "far" && /far beyond its Speed of 5 ft/.test(routeWords({ why: "far", cost: null }, [11, 0], 5)));
  check("cut short before someone it didn't know of", cutShort([[0, 0], [1, 0], [2, 0], [3, 0]], 1, (i, j) => i === 2 && j === 0).map(p => p.join()).join(" ") === "0,0 1,0" && cutShort([[0, 0], [1, 0]], 1, () => false).length === 2 && cutShort([[0, 0], [1, 0]], 2, (i, j) => i === 2 && j === 1).length === 1);
  check("stopped in words, no cause", describeChange({ who: "me", what: "stopped", at: [4, 5] }) === "It was stopped at [4, 5], short of where it was going.");
  check("hello can stride", hello(1).canDo.includes("stride") && hello(1).prompt.includes('"do": "stride"'));
  check("plan keeps to", cleanPlan({ steps: [{ do: "stride", to: [3, 4] }] }).plan.steps[0].to.join() === "3,4");
  /* Step and Stand (0.5.0). Rules: Step https://2e.aonprd.com/Actions.aspx?ID=2304, Prone https://2e.aonprd.com/Conditions.aspx?ID=88 */
  check("step east", JSON.stringify(findStep({ from: [2, 2], to: [3, 2] }, W())) === JSON.stringify({ ok: true, route: [[2, 2], [3, 2]], cost: 5 }));
  check("step diagonal 5, or 10 after an odd count", findStep({ from: [2, 2], to: [3, 3] }, W()).cost === 5 && findStep({ from: [2, 2], to: [3, 3], odd: true }, W()).cost === 10 && findStep({ from: [2, 2], to: [3, 2], odd: true }, W()).cost === 5);
  check("step only next door", findStep({ from: [2, 2], to: [4, 2] }, W()).why === "notNext" && findStep({ from: [2, 2], to: [2, 2] }, W()).why === "same" && /one square/.test(routeWords({ why: "notNext" }, [4, 2], 35)));
  check("no step into difficult", findStep({ from: [2, 2], to: [3, 2] }, W({ diff: [[3, 2]] })).why === "difficult" && /can't go into difficult terrain/.test(routeWords({ why: "difficult" }, [3, 2], 35)));
  check("step out of difficult is fine", findStep({ from: [2, 2], to: [3, 2] }, W({ diff: [[2, 2]] })).ok);
  check("no step through a wall", findStep({ from: [3, 2], to: [4, 2] }, W({ wall: wallX })).why === "wall" && /a wall is between/.test(routeWords({ why: "wall" }, [4, 2], 35)));
  check("no step onto anyone, or solid, deep or off", findStep({ from: [2, 2], to: [3, 2] }, W({ who: { "3,2": "ally" } })).why === "occupied" && findStep({ from: [2, 2], to: [3, 2] }, W({ solid: [[3, 2]] })).why === "blocked" && findStep({ from: [2, 2], to: [3, 2] }, W({ deep: [[3, 2]] })).why === "terrain" && findStep({ from: [0, 0], to: [-1, 0] }, W()).why === "off");
  check("large step: new squares only", findStep({ from: [2, 2], size: 2, to: [3, 2] }, W({ diff: [[3, 3]] })).ok && findStep({ from: [2, 2], size: 2, to: [3, 2] }, W({ diff: [[4, 3]] })).why === "difficult" && findStep({ from: [2, 2], size: 2, to: [3, 2] }, W({ diff: [[2, 2]] })).ok);
  const sroute = (from, to, before, opt = {}) => { if (opt.step) { const x = findStep({ from, to }, W({ who: { "6,5": "enemy" }, diff: [[1, 4]] })); return x.ok ? x : { ok: false, reason: routeWords(x, to, 35) }; } return route(from, to); };
  const sctx = { ...mctx, route: sroute };
  p = checkPlan({ steps: [{ do: "step", to: [1, 5] }, st({ item: "bow", target: "E1" })] }, sctx); check("step then shoot", p.ok && p.steps[0].do === "step" && p.steps[0].cost === 5 && describeStep(p.steps[0]) === "Steps 5 ft east, to square 1, 5.", JSON.stringify(p));
  check("step into difficult refused", /difficult terrain/.test(checkPlan({ steps: [{ do: "step", to: [1, 4] }] }, sctx).reason));
  check("step two squares refused", /isn't next to it/.test(checkPlan({ steps: [{ do: "step", to: [2, 5] }] }, sctx).reason));
  check("step needs Speed 10", /at least 10 ft, and its Speed is 5 ft/.test(checkPlan({ steps: [{ do: "step", to: [1, 5] }] }, { ...sctx, speed: 5 }).reason) && /no land Speed/.test(checkPlan({ steps: [{ do: "step", to: [1, 5] }] }, { ...sctx, speed: 0 }).reason));
  check("a 10-ft diagonal step refused", /counts as 10 ft, and a Step moves only 5 ft \(every second diagonal/.test(checkPlan({ steps: [{ do: "step", to: [1, 6] }] }, { ...sctx, route: () => ({ ok: true, route: [[0, 5], [1, 6]], cost: 10 }) }).reason));
  check("step moves where reach is measured from", checkPlan({ steps: [{ do: "stride", to: [4, 5] }, { do: "step", to: [5, 5] }, st({ item: "bite", target: "E1" })] }, sctx).ok);
  { const seen = []; checkPlan({ steps: [{ do: "stride", to: [2, 5] }, { do: "step", to: [3, 5] }, { do: "stride", to: [4, 6] }] }, { ...mctx, route: (f, t, before, o = {}) => { seen.push([before.length, !!o.step]); return o.step ? findStep({ from: f, to: t }, W()) : route(f, t); } });
    check("steps count among earlier moves", JSON.stringify(seen) === "[[0,false],[1,true],[2,false]]", JSON.stringify(seen)); }
  check("prone: step refused", /Stand first \(a "stand" step, 1 action\) before it can Step/.test(checkPlan({ steps: [{ do: "step", to: [1, 5] }] }, { ...sctx, prone: true }).reason));
  p = checkPlan({ steps: [{ do: "stand" }, { do: "stride", to: [5, 5] }, st({ item: "bite", target: "E1" })] }, { ...sctx, prone: true }); check("stand, stride, bite", p.ok && p.steps[0].do === "stand" && describeStep(p.steps[0]) === "Stands up." && p.steps[2].variant === 0, JSON.stringify(p));
  check("stand, then step", checkPlan({ steps: [{ do: "stand" }, { do: "step", to: [1, 5] }] }, { ...sctx, prone: true }).ok);
  check("stand when not prone", /isn't prone/.test(checkPlan({ steps: [{ do: "stand" }] }, sctx).reason));
  check("stand twice", /isn't prone/.test(checkPlan({ steps: [{ do: "stand" }, { do: "stand" }] }, { ...sctx, prone: true }).reason));
  check("prone can still strike", checkPlan({ steps: [st({ item: "bow", target: "E1" })] }, { ...sctx, prone: true }).ok);
  check("grabbed: no stand", /grabbed, so it can't use move actions/.test(checkPlan({ steps: [{ do: "stand" }] }, { ...sctx, prone: true, cantMove: "it is grabbed, so it can't use move actions (Stride, Step or Stand)." }).reason));
  check("stand costs an action", /no actions left/.test(checkPlan({ steps: [{ do: "stand" }, { do: "stride", to: [5, 5] }, st({ item: "bite", target: "E1" }), st({ item: "bite", target: "E1" })] }, { ...sctx, prone: true }).reason));
  check("paralyzed: no stand", /paralyzed/.test(checkPlan({ steps: [{ do: "stand" }] }, { ...sctx, prone: true, cantAct: "it is paralyzed and can't act." }).reason));
  check("spent: step and stand", spentBy([{ do: "stand" }, { do: "step" }, { do: "strike" }]).actions === 3 && spentBy([{ do: "stand" }, { do: "step" }]).attacks === 0);
  check("done: step and stand", doneStep({ do: "step", to: [1, 5] }, { moved: { to: [1, 5] } }).result === "arrived" && doneStep({ do: "stand" }, { changed: { message: "x" } }).result === "stood" && doneStep({ do: "stand" }, { started: true }).result === "unknown");
  check("next posture", nextPosture({}, false) === "act" && nextPosture({}, true) === "already" && nextPosture({ started: true }, false) === "ask" && nextPosture({ started: true }, true) === "already" && nextPosture({ started: true, changed: {} }, true) === "next");
  /* the review's findings (2026-11-07): a Step after a Stride, with the diagonal count carried the way mover does it (history plus earlier routes) */
  { const cw = W(), carried = (from, to, before = [], o = {}) => { const prefix = []; for (const r of before) prefix.push(...(prefix.length ? r.slice(1) : r)); if (!prefix.length) prefix.push(from);
      const odd = diagonalsIn(prefix) % 2 === 1, x = o.step ? findStep({ from, to, odd }, cw) : findRoute({ from, to, budget: 35, odd }, cw); return x.ok ? x : { ok: false, reason: routeWords(x, to, 35) }; };
    const c = { ...mctx, route: carried, targets: {} };
    check("one diagonal then a diagonal step: 10 ft, refused", /counts as 10 ft, and a Step moves only 5 ft \(every second diagonal/.test(checkPlan({ steps: [{ do: "stride", to: [1, 6] }, { do: "step", to: [2, 7] }] }, c).reason ?? ""), checkPlan({ steps: [{ do: "stride", to: [1, 6] }, { do: "step", to: [2, 7] }] }, c).reason);
    check("two diagonals then a diagonal step: fine", checkPlan({ steps: [{ do: "stride", to: [2, 7] }, { do: "step", to: [3, 8] }] }, c).ok);
    check("one diagonal then a straight step: fine", checkPlan({ steps: [{ do: "stride", to: [1, 6] }, { do: "step", to: [2, 6] }] }, c).ok); }
  check("restrained can't strike", /restrained, so it can't attack/.test(checkPlan({ steps: [st({ item: "bite", target: "E1" })] }, { ...mctx, me: { square: [5, 5], size: 1 }, cantAttack: "it is restrained, so it can't attack." }).reason) && checkPlan({ steps: [st({ item: "bite", target: "E1" })] }, { ...mctx, me: { square: [5, 5], size: 1 }, cantAttack: null }).ok);
  check("deep water words name the move", /a Stride isn't/.test(routeWords({ why: "terrain" }, [3, 1], 35)) && /a Step isn't/.test(routeWords({ why: "terrain" }, [3, 1], 35, "step")));
  /* Crawl and Drop Prone (0.5.1). Crawl (Player Core): prone, Speed 10+, 5 ft, stays prone. Drop Prone: falls prone. Both have the move trait. */
  { const cw = W({ diff: [[1, 4]], who: { "6,5": "enemy" } }), r2 = (from, to, before = [], o = {}) => { const x = o.step ? findStep({ from, to }, cw) : findRoute({ from, to, budget: 35 }, cw); return x.ok ? x : { ok: false, reason: routeWords(x, to, 35, o.kind) }; };
    const c = { ...mctx, route: r2, prone: true };
    let q = checkPlan({ steps: [{ do: "crawl", to: [1, 5] }, st({ item: "bow", target: "E1" })] }, c); check("crawl then shoot", q.ok && q.steps[0].do === "crawl" && q.steps[0].cost === 5 && describeStep(q.steps[0]) === "Crawls 5 ft east, to square 1, 5.", JSON.stringify(q));
    check("crawl only while prone", /isn't prone; Crawl is how a prone creature moves/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 5] }] }, { ...c, prone: false }).reason));
    check("crawl into difficult: too far", /difficult terrain, which would take 10 ft, and a Crawl moves only 5 ft/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 4] }] }, c).reason));
    check("crawl one square only", /a Crawl moves one square/.test(checkPlan({ steps: [{ do: "crawl", to: [2, 5] }] }, c).reason));
    check("crawl needs Speed 10", /a Crawl needs a Speed of at least 10 ft/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 5] }] }, { ...c, speed: 5 }).reason));
    check("crawl stays prone", /Stand first/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 5] }, { do: "stride", to: [3, 5] }] }, c).reason) && checkPlan({ steps: [{ do: "crawl", to: [1, 5] }, { do: "stand" }, { do: "stride", to: [3, 5] }] }, c).ok);
    check("a prone stride names crawl", /or Crawl 5 ft/.test(checkPlan({ steps: [{ do: "stride", to: [3, 5] }] }, c).reason));
    check("crawl's 10-ft diagonal", /crawling to \[1, 6\] counts as 10 ft, and a Crawl moves only 5 ft/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 6] }] }, { ...c, route: () => ({ ok: true, route: [[0, 5], [1, 6]], cost: 10 }) }).reason));
    q = checkPlan({ steps: [{ do: "drop-prone" }, { do: "crawl", to: [1, 5] }] }, { ...c, prone: false }); check("drop then crawl", q.ok && describeStep(q.steps[0]) === "Drops prone.", JSON.stringify(q));
    check("drop when prone", /already prone/.test(checkPlan({ steps: [{ do: "drop-prone" }] }, c).reason));
    check("drop then stride refused", /Stand first/.test(checkPlan({ steps: [{ do: "drop-prone" }, { do: "stride", to: [3, 5] }] }, { ...c, prone: false }).reason));
    check("immobilized: no drop or crawl", /immobilized/.test(checkPlan({ steps: [{ do: "drop-prone" }] }, { ...c, prone: false, cantMove: "it is immobilized, so it can't use move actions (Stride, Step, Crawl, Stand or Drop Prone)." }).reason) && /immobilized/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 5] }] }, { ...c, cantMove: "it is immobilized, so it can't use move actions." }).reason));
    check("crawl and drop cost actions", spentBy([{ do: "drop-prone" }, { do: "crawl" }]).actions === 2);
    check("done: crawl and drop", doneStep({ do: "crawl", to: [1, 5] }, { moved: { to: [1, 5] } }).result === "arrived" && doneStep({ do: "drop-prone" }, { changed: {} }).result === "dropped");
    check("isMove crawl", isMove({ do: "crawl" }) && !isMove({ do: "drop-prone" }));
    check("hello can crawl and drop", hello(1).canDo.includes("crawl") && hello(1).canDo.includes("drop-prone") && STEP_KINDS.includes("drop-prone") && !STEP_KINDS.includes("drop") && hello(1).prompt.includes('"do": "crawl"') && hello(1).prompt.includes('"do": "drop-prone"')); }
  /* its own Stand or Drop Prone isn't news; anything else that came is */
  const PS = ["prone", "off-guard"];
  check("absorb a stand", absorbOwn(["frightened 1", "off-guard", "prone"], ["frightened 1", "off-guard", "prone"], ["frightened 1"], PS).join() === "frightened 1");
  check("absorb a drop", absorbOwn(["frightened 1"], ["frightened 1"], ["frightened 1", "off-guard", "prone"], PS).join() === "frightened 1,off-guard,prone");
  { const was = situationOf({ me: { square: [1, 1], conditions: ["off-guard", "prone"] } }), after = ["clumsy 1"], seen = { ...was, me: { ...was.me, conditions: absorbOwn(was.me.conditions, was.me.conditions, after, PS) } };
    const ch = changesSince(seen, situationOf({ me: { square: [1, 1], conditions: after } }));
    check("a reaction's condition after a Stand re-plans", ch.length === 1 && ch[0].what === "conditions" && ch[0].now.join() === "clumsy 1", JSON.stringify(ch));
    const ok = changesSince({ ...was, me: { ...was.me, conditions: absorbOwn(was.me.conditions, was.me.conditions, [], PS) } }, situationOf({ me: { square: [1, 1], conditions: [] } }));
    check("its own Stand alone doesn't", ok.length === 0, JSON.stringify(ok)); }
  /* the second review's findings (0.5.1) */
  { const cw = W(), carried = (from, to, before = [], o = {}) => { const prefix = []; for (const r of before) prefix.push(...(prefix.length ? r.slice(1) : r)); if (!prefix.length) prefix.push(from);
      const odd = diagonalsIn(prefix) % 2 === 1, x = o.step ? findStep({ from, to, odd }, cw) : findRoute({ from, to, budget: 35, odd }, cw); return x.ok ? x : { ok: false, reason: routeWords(x, to, 35, o.kind) }; };
    const c = { ...mctx, route: carried, targets: {}, prone: true };
    check("a diagonal crawl after a diagonal crawl: 10 ft, refused", /crawling to \[2, 7\] counts as 10 ft/.test(checkPlan({ steps: [{ do: "crawl", to: [1, 6] }, { do: "crawl", to: [2, 7] }] }, c).reason ?? ""), checkPlan({ steps: [{ do: "crawl", to: [1, 6] }, { do: "crawl", to: [2, 7] }] }, c).reason);
    check("crawl, stand, stride", checkPlan({ steps: [{ do: "crawl", to: [1, 5] }, { do: "stand" }, { do: "stride", to: [3, 5] }] }, c).ok); }
  check("a Large creature's crawl: only the new squares", findStep({ from: [2, 2], size: 2, to: [3, 2] }, W({ diff: [[3, 3]] })).ok && /a Crawl moves only 5 ft/.test(routeWords(findStep({ from: [2, 2], size: 2, to: [3, 2] }, W({ diff: [[4, 3]] })), [3, 2], 35, "crawl")));
  check("no dropping prone in the air", /20 ft up/.test(checkPlan({ steps: [{ do: "drop-prone" }] }, { ...mctx, me: { square: [0, 5], size: 1, elev: 20 } }).reason) && checkPlan({ steps: [{ do: "drop-prone" }] }, mctx).ok);
  check("a 0.5.0 Stand record still counts", nextPosture({ started: true, stood: {} }, true) === "next" && doneStep({ do: "stand" }, { stood: {} }).result === "stood");

  check("prompt names the next diagonal", hello(1).prompt.includes("you.nextDiagonal") && /Restrained: it can't Strike/.test(hello(1).prompt));
  check("isMove", isMove({ do: "step" }) && isMove({ do: "stride" }) && !isMove({ do: "stand" }) && !isMove(null));
  check("hello can step and stand", hello(1).canDo.includes("step") && hello(1).canDo.includes("stand") && hello(1).prompt.includes('"do": "step"') && hello(1).prompt.includes('"do": "stand"'));
  check("plan keeps a stand", cleanPlan({ steps: [{ do: "stand" }, { do: "step", to: [1, 2] }] }).plan.steps.map(x => x.do).join() === "stand,step");
  /* Take Cover (0.5.2), Rhea's rule B: prone, a wall or thick trunk next to it, or standard cover from a creature it sees. Rules: https://2e.aonprd.com/Actions.aspx?ID=2307 */
  { const near = sq => sq[0] === 3 && sq[1] === 5, c = { ...mctx, me: { square: [0, 5], size: 1 }, route: (f, t) => ({ ok: true, route: [f, t], cost: 15 }), nearCover: near, coverFrom: {} };
    const tc = { do: "take-cover" }, why = p => p.ok ? p.steps.find(x => x.do === "take-cover")?.why : p.reason;
    check("take cover: nothing to take cover with", /needs it to be prone, next to a wall or a trunk/.test(checkPlan({ steps: [tc] }, c).reason));
    check("take cover: prone", why(checkPlan({ steps: [tc] }, { ...c, prone: true })) === "prone");
    check("take cover: standard cover from E1", why(checkPlan({ steps: [tc] }, { ...c, coverFrom: { E1: "standard" } })) === "cover" && checkPlan({ steps: [tc] }, { ...c, coverFrom: { E1: "standard" } }).steps[0].from === "E1");
    check("take cover: greater counts, lesser doesn't", why(checkPlan({ steps: [tc] }, { ...c, coverFrom: { E2: "greater" } })) === "cover" && !checkPlan({ steps: [tc] }, { ...c, coverFrom: { E1: "lesser" } }).ok);
    check("take cover: next to a wall", why(checkPlan({ steps: [tc] }, { ...c, me: { square: [3, 5], size: 1 } })) === "near");
    check("take cover after a stride: only walls next to the new square", why(checkPlan({ steps: [{ do: "stride", to: [3, 5] }, tc] }, c)) === "near" && /after a move in the same plan only a wall or trunk/.test(checkPlan({ steps: [{ do: "stride", to: [2, 5] }, tc] }, { ...c, coverFrom: { E1: "standard" } }).reason));
    check("take cover: not twice", /already Taking Cover/.test(checkPlan({ steps: [tc, tc] }, { ...c, prone: true }).reason) && /already Taking Cover/.test(checkPlan({ steps: [tc] }, { ...c, prone: true, tookCover: true }).reason));
    check("take cover again after a strike or a move", checkPlan({ steps: [st({ item: "bow", target: "E1" }), tc] }, { ...c, prone: true, tookCover: true }).ok && checkPlan({ steps: [{ do: "stride", to: [3, 5] }, tc] }, { ...c, tookCover: true }).ok);
    check("take cover: drop prone then take cover", why(checkPlan({ steps: [{ do: "drop-prone" }, tc] }, c)) === "prone");
    check("take cover: stand first, then nothing", !checkPlan({ steps: [{ do: "stand" }, tc] }, { ...c, prone: true }).ok);
    check("take cover while prone ends on Stand", checkPlan({ steps: [tc, { do: "stand" }, { do: "stride", to: [3, 5] }] }, { ...c, prone: true, actions: 3 }).ok && checkPlan({ steps: [{ do: "drop-prone" }, tc, { do: "stand" }] }, { ...c, me: { square: [3, 5], size: 1 } }).ok
      && why(checkPlan({ steps: [{ do: "drop-prone" }, tc, { do: "stand" }] }, { ...c, me: { square: [3, 5], size: 1 } })) === "prone"
      && checkPlan({ steps: [tc, { do: "stand" }, tc] }, { ...c, prone: true, me: { square: [3, 5], size: 1 } }).ok
      && /already Taking Cover/.test(checkPlan({ steps: [tc, { do: "drop-prone" }, tc] }, { ...c, me: { square: [3, 5], size: 1 } }).reason));
    check("take cover costs an action", /no actions left/.test(checkPlan({ steps: [tc, tc] }, { ...c, prone: true, actions: 1 }).reason) && spentBy([tc]).actions === 1);
    check("take cover: can't act", /paralyzed/.test(checkPlan({ steps: [tc] }, { ...c, prone: true, cantAct: "it is paralyzed and can't act." }).reason));
    check("take cover: immobilized may", checkPlan({ steps: [tc] }, { ...c, prone: true, cantMove: "it is immobilized" }).ok);
    check("take cover words", describeStep({ do: "take-cover", why: "prone" }) === "Takes Cover while prone." && describeStep({ do: "take-cover", why: "cover", from: "E1" }) === "Takes Cover behind its cover from E1." && /wall or trunk/.test(describeStep({ do: "take-cover", why: "near" })));
    check("take cover done", doneStep(tc, { covered: {} }).result === "took cover" && doneStep(tc, {}).result === "unknown"); }
  check("cover after taking", coverAfterTaking("standard") === "greater" && coverAfterTaking("greater") === "greater" && coverAfterTaking("lesser") === "standard" && coverAfterTaking("none") === "standard" && coverAfterTaking("none", true) === "prone-ranged" && coverAfterTaking("lesser", true) === "standard" && coverAfterTaking("standard", true) === "greater" && coverAfterTaking(undefined, true) === "prone-ranged");
  check("next cover", nextCover({}, false) === "act" && nextCover({}, true) === "already" && nextCover({ started: true }, true) === "ask" && nextCover({ started: true }, false) === "ask" && nextCover({ covered: {} }, false) === "next");
  { const S = [{ do: "take-cover" }, { do: "strike" }, { do: "stride", from: [1, 1], to: [3, 1] }];
    check("ends cover: a strike after it", endsCover(S, { 1: { started: true } }, 2) && !endsCover(S, {}, 2) && endsCover(S, { 1: { flatStarted: true } }, 2));
    check("ends cover: not its own step", !endsCover(S, { 0: { covered: {} } }, 1));
    check("ends cover: a move out of its space", endsCover([{ do: "take-cover" }, { do: "stride", from: [1, 1], to: [3, 1] }], { 1: { moved: { to: [2, 1] } } }, 2) && !endsCover([{ do: "take-cover" }, { do: "stride", from: [1, 1], to: [3, 1] }], { 1: { moved: { to: [1, 1] } } }, 2));
    check("ends cover: from an earlier turn", endsCover([{ do: "strike" }], { 0: { started: true } }, 1) && !endsCover([{ do: "stand" }], { 0: { changed: {} } }, 1));
    check("ends cover: only steps not settled yet", !endsCover([{ do: "strike" }, { do: "stride", from: [1, 1], to: [1, 1] }], { 0: { started: true }, 1: { moved: { to: [1, 1] } } }, 2, 1) && endsCover([{ do: "strike" }, { do: "strike" }], { 0: { started: true }, 1: { started: true } }, 2, 1) && endsCover([{ do: "strike" }], { 0: { started: true } }, 1, 0));
    check("ends cover: only after the last take cover", !endsCover([{ do: "strike" }, { do: "take-cover" }, { do: "stand" }], { 0: { started: true } }, 3)); }
  check("feature next to it", featureNear([5, 5], 1, [[7, 4, 7, 8]]) && !featureNear([5, 5], 1, [[8, 4, 8, 8]]) && featureNear([5, 5], 1, [[6.5, 6.5, 6.6, 6.6]]) && !featureNear([5, 5], 1, [[7, 7, 8, 8]]) && featureNear([5, 5], 2, [[8, 2, 8, 9]]) && !featureNear([5, 5], 1, []));
  check("hello can take cover", hello(1).canDo.includes("take-cover") && hello(1).prompt.includes('"do": "take-cover"') && hello(1).prompt.includes("you.takeCover.standardCoverFrom"));
  check("plan keeps a take cover", cleanPlan({ steps: [{ do: "take-cover" }] }).plan.steps[0].do === "take-cover");
}
/* abilities (0.5.3): Strike follow-ups run for real, any other ability posts its card for the GM */
{ const jaws = { id: "jaws", name: "Jaws", reach: 10, effects: ["grab", "knockdown"] }, bite = { id: "bite", name: "Bite", reach: 5, effects: [] }, bow = { id: "bow", name: "Bow", ranged: true, maxRange: 60, reach: 5, effects: ["knockdown"] };
  const AB = [{ id: "knockdown", name: "Knockdown", kind: "action", cost: 1, traits: [], usesLeft: null, followUp: "trip", effect: "knockdown" },
    { id: "grab", name: "Grab", kind: "action", cost: 1, traits: [], usesLeft: null, followUp: "grapple", effect: "grab" },
    { id: "improved-push", name: "Improved Push", kind: "free", cost: 0, traits: [], usesLeft: null, followUp: "shove", effect: "improved-push" },
    { id: "worry", name: "Worry", kind: "action", cost: 1, traits: ["attack"], usesLeft: null, followUp: null, effect: null },
    { id: "breath", name: "Breath Weapon", kind: "action", cost: 2, traits: ["arcane"], usesLeft: null, followUp: null, effect: null },
    { id: "rally", name: "Rally", kind: "action", cost: 1, traits: ["manipulate"], usesLeft: 0, followUp: null, effect: null },
    { id: "rally-2", name: "Rally", kind: "action", cost: 1, traits: ["manipulate"], usesLeft: 1, followUp: null, effect: null },
    { id: "leap", name: "Leap", kind: "action", cost: 1, traits: ["move"], usesLeft: null, followUp: null, effect: null },
    { id: "pack-attack", name: "Pack Attack", kind: "passive", cost: null, traits: [], usesLeft: null, followUp: null, effect: null },
    { id: "buck", name: "Buck", kind: "reaction", cost: null, traits: [], usesLeft: null, followUp: null, effect: null }];
  const actx = { actions: 3, strikes: [jaws, bite, bow, { id: "slam", name: "Slam", reach: 5, effects: ["improved-push"] }], abilities: AB, me: { square: [5, 5], size: 1, cat: "med" },
    targets: { E1: { name: "E1", square: [6, 5], size: 1, cat: "med" }, E2: { name: "E2", square: [5, 7], size: 1, cat: "med", held: true }, E3: { name: "E3", square: [6, 6], size: 3, cat: "huge" }, E4: { name: "E4", square: [12, 5], size: 1, cat: "med" } } };
  const ab = (item, target) => ({ do: "ability", item, ...(target ? { target } : {}) });
  let p = checkPlan({ steps: [st({ item: "jaws", target: "E1" }), ab("knockdown"), st({ item: "jaws", target: "E1" })] }, actx);
  check("knockdown after a jaws hit", p.ok && p.steps[1].mode === "check" && p.steps[1].check === "trip" && p.steps[1].target === "E1" && p.steps[1].needsHit && p.steps[1].actions === 1, JSON.stringify(p));
  check("a follow-up neither takes nor counts toward the attack penalty", p.ok && p.steps[0].variant === 0 && p.steps[2].variant === 1 && !p.steps[1].variant && spentBy(p.steps).attacks === 2 && spentBy(p.steps).actions === 3);
  check("knockdown words", describeStep(p.steps[1]) === "Knockdown at E1: a Trip check, no attack penalty.", describeStep(p.steps[1]));
  check("knockdown alone refused", /straight after a Strike that lists Knockdown/.test(checkPlan({ steps: [ab("knockdown", "E1")] }, actx).reason));
  check("knockdown after a Strike without it refused", /straight after/.test(checkPlan({ steps: [st({ item: "bite", target: "E1" }), ab("knockdown", "E1")] }, actx).reason));
  check("knockdown after a move refused", /straight after/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), { do: "stand" }, ab("knockdown", "E1")] }, { ...actx, prone: true }).reason));
  check("knockdown at another creature refused", /goes at the creature its Strike just hit \(E1\), not E4/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), ab("knockdown", "E4")] }, actx).reason));
  check("two follow-ups after one Strike refused", /straight after/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), ab("knockdown"), ab("grab")] }, actx).reason));
  check("a miss refuses it", /didn't hit/.test(checkPlan({ steps: [ab("knockdown")] }, { ...actx, last: { do: "strike", item: "jaws", target: "E1", effects: ["knockdown"], reach: 10, hit: false } }).reason));
  check("after a hit it goes, no longer waiting on the hit", (q => q.ok && !q.steps[0].needsHit && q.steps[0].target === "E1")(checkPlan({ steps: [ab("knockdown")] }, { ...actx, last: { do: "strike", item: "jaws", target: "E1", effects: ["knockdown"], reach: 10, hit: true } })));
  check("too big to trip", /more than one size larger/.test(checkPlan({ steps: [st({ item: "jaws", target: "E3" }), ab("knockdown")] }, actx).reason) && checkPlan({ steps: [st({ item: "jaws", target: "E3" }), ab("knockdown")] }, { ...actx, me: { ...actx.me, cat: "lg" } }).ok);
  check("follow-up after a ranged Strike refused", /last Strike was ranged/.test(checkPlan({ steps: [st({ item: "bow", target: "E4" }), ab("knockdown")] }, actx).reason));
  check("follow-up out of reach (it was moved)", /out of reach for Knockdown/.test(checkPlan({ steps: [ab("knockdown")] }, { ...actx, last: { do: "strike", item: "jaws", target: "E4", effects: ["knockdown"], reach: 10, hit: true } }).reason));
  check("restrained can't follow up", /restrained/.test(checkPlan({ steps: [ab("knockdown")] }, { ...actx, cantAttack: "it is restrained, so it can't attack.", last: { do: "strike", item: "jaws", target: "E1", effects: ["knockdown"], reach: 10, hit: true } }).reason));
  check("improved push is free", (q => q.ok && q.steps[3].actions === 0 && describeStep(q.steps[3]).includes("free action"))(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" }), st({ item: "slam", target: "E1" }), ab("improved-push")] }, actx)));
  check("grab keeps hold with no Strike", (q => q.ok && q.steps[0].mode === "hold" && describeStep(q.steps[0]) === "Grab: keeps hold of E2.")(checkPlan({ steps: [ab("grab", "E2")] }, actx)));
  check("grab with no target and no Strike refused", /straight after a Strike that lists Grab .*give that creature as the target/.test(checkPlan({ steps: [ab("grab")] }, actx).reason));
  check("grab after a miss keeps hold if it can", checkPlan({ steps: [ab("grab", "E2")] }, { ...actx, last: { do: "strike", item: "jaws", target: "E2", effects: ["grab"], reach: 10, hit: false } }).steps[0].mode === "hold");
  check("grab hold out of reach", /out of reach to keep hold/.test(checkPlan({ steps: [ab("grab", "E2")] }, { ...actx, targets: { E2: { ...actx.targets.E2, square: [12, 12] } } }).reason));
  check("follow-up at a hidden target carries the flat check", checkPlan({ steps: [st({ item: "jaws", target: "E1" }), ab("knockdown")] }, { ...actx, targets: { ...actx.targets, E1: { ...actx.targets.E1, flat: 11 } } }).steps[1].flat === 11);
  check("passive refused", /passive/.test(checkPlan({ steps: [ab("pack-attack")] }, actx).reason));
  check("reaction refused", /reaction/.test(checkPlan({ steps: [ab("buck")] }, actx).reason));
  check("unknown ability refused, with a hint for a Strike id", /no ability called "fly"\.$/.test(checkPlan({ steps: [ab("fly")] }, actx).reason) && /jaws is a Strike/.test(checkPlan({ steps: [ab("jaws", "E1")] }, actx).reason));
  p = checkPlan({ steps: [ab("worry", "E2"), st({ item: "jaws", target: "E2" })] }, actx);
  check("an attack-trait ability goes to the GM and counts toward the penalty", p.ok && p.steps[0].mode === "card" && p.steps[0].attack && p.steps[1].variant === 1 && describeStep(p.steps[0]) === "Worry at E2: its card goes to chat for you to apply.", JSON.stringify(p));
  check("its attack penalty shows when it comes second", describeStep(checkPlan({ steps: [st({ item: "jaws", target: "E2" }), ab("worry", "E2")] }, actx).steps[1]).includes("attack 2"));
  check("a two-action ability", (q => q.ok && q.steps[0].actions === 2 && spentBy(q.steps).actions === 2)(checkPlan({ steps: [ab("breath")] }, actx)) && /no actions left \(Breath Weapon takes 2\)/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" }), ab("breath")] }, actx).reason));
  check("no uses left", /no uses left/.test(checkPlan({ steps: [ab("rally")] }, actx).reason) && checkPlan({ steps: [ab("rally-2")] }, actx).ok);
  check("restrained: no manipulate ability", /manipulate/.test(checkPlan({ steps: [ab("rally-2")] }, { ...actx, cantAttack: "x" }).reason) && /restrained|x/.test(checkPlan({ steps: [ab("worry", "E2")] }, { ...actx, cantAttack: "x" }).reason));
  check("immobilized: no move ability", /immobilized/.test(checkPlan({ steps: [ab("leap")] }, { ...actx, cantMove: "it is immobilized" }).reason));
  check("card ability at an unknown target refused", /doesn't know of "E9"/.test(checkPlan({ steps: [ab("worry", "E9")] }, actx).reason));
  check("card ability with no target", (q => q.ok && !q.steps[0].target && describeStep(q.steps[0]) === "Breath Weapon: its card goes to chat for you to apply.")(checkPlan({ steps: [ab("breath")] }, actx)));
  check("an attack ability ends Take Cover", checkPlan({ steps: [{ do: "take-cover" }, ab("worry", "E2"), { do: "take-cover" }] }, { ...actx, prone: true }).ok && endsCover([{ do: "ability", attack: true }], { 0: { started: true } }, 1) && !endsCover([{ do: "ability" }], { 0: { started: true } }, 1));
  check("ability cost", abilityCost({ kind: "free", cost: 1 }) === 0 && abilityCost({ kind: "action", cost: 3 }) === 3 && abilityCost({ kind: "action" }) === 1);
  check("follow-up table", FOLLOW_UPS.grab === "grapple" && FOLLOW_UPS["improved-knockdown"] === "trip" && FOLLOW_UPS.pull === "reposition" && CHECK_WORD.shove === "Shove");
  /* the last action before a plan */
  const S = actx.strikes;
  check("last: a jaws hit", (l => l.hit === true && l.effects.includes("knockdown") && l.reach === 10)(lastAction({ step: st({ item: "jaws", target: "E1" }), rec: { started: true, attack: { degree: 3 } }, strikes: S })));
  check("last: a miss, a failed flat check, not yet", lastAction({ step: st({ item: "jaws", target: "E1" }), rec: { attack: { degree: 1 } }, strikes: S }).hit === false && lastAction({ step: st({ item: "jaws", target: "E1" }), rec: { flat: { ok: false } }, strikes: S }).hit === false && lastAction({ step: st({ item: "jaws", target: "E1" }), rec: {}, strikes: S }).hit === null);
  check("last: from what's done", lastAction({ done: { do: "strike", item: "jaws", target: "E1", result: "critical hit" }, strikes: S }).hit === true && lastAction({ done: { do: "strike", item: "jaws", target: "E1", result: "flat check failed" }, strikes: S }).hit === false && lastAction({ done: { do: "stride" } }).do === "stride" && lastAction() === null && lastAction({ step: { do: "stand" } }).do === "stand");
  /* where an ability step stands */
  check("card: post, then the GM", nextAbility({}, { mode: "card" }) === "post" && nextAbility({ started: true }, { mode: "card" }) === "ask" && nextAbility({ started: true, posted: {} }, { mode: "card" }) === "gm");
  check("hold: post, then on", nextAbility({}, { mode: "hold" }) === "post" && nextAbility({ started: true, posted: {} }, { mode: "hold" }) === "next");
  check("check: flat first", nextAbility({}, { flat: 11 }) === "flat" && nextAbility({ flatStarted: true }, { flat: 11 }) === "ask" && nextAbility({ flatStarted: true, flat: { ok: false } }, { flat: 11 }) === "next" && nextAbility({ flatStarted: true, flat: { ok: true } }, { flat: 11 }) === "check");
  check("check: roll, effects, never twice", nextAbility({}) === "check" && nextAbility({ started: true }) === "ask" && nextAbility({ started: true, check: { degree: 2 } }) === "effects" && nextAbility({ started: true, check: { degree: 2 }, effects: { gm: null } }) === "next" && nextAbility({ started: true, check: { degree: 2 }, effects: { gm: "x" } }) === "gm");
  const crit = { started: true, check: { degree: 3 }, effects: { damage: "1d6[bludgeoning]" } };
  check("a critical Trip's damage", nextAbility(crit) === "damage" && nextAbility({ ...crit, damageStarted: true }) === "ask" && nextAbility({ ...crit, damageStarted: true, damage: {} }) === "next" && nextAbility({ ...crit, damageStarted: true, damage: {} }, { apply: true }) === "apply" && nextAbility({ ...crit, damageStarted: true, damage: {}, applying: true }, { apply: true }) === "ask" && nextAbility({ ...crit, damageStarted: true, damage: {}, applying: true, applied: true }, { apply: true }) === "next");
  /* what each check does, by the rules */
  const o = (c, d, h) => followUpOutcome(c, d, { held: h, who: "E1", me: "Wolf" });
  check("grapple outcomes", o("grapple", 3).target.join() === "restrained" && o("grapple", 2).target.join() === "grabbed" && !o("grapple", 1).gm && /that ends now/.test(o("grapple", 1, true).gm) && /can grab Wolf .* or make Wolf fall prone/.test(o("grapple", 0).gm) && /break free/.test(o("grapple", 0, true).gm));
  check("trip outcomes", o("trip", 3).target.join() === "prone" && o("trip", 3).damage === "1d6[bludgeoning]" && o("trip", 2).target.join() === "prone" && !o("trip", 2).damage && !o("trip", 1).target.length && o("trip", 0).self.join() === "prone" && !o("trip", 0).gm);
  check("shove outcomes", /Move E1 10 ft straight away from Wolf/.test(o("shove", 3).gm) && /5 ft/.test(o("shove", 2).gm) && !o("shove", 1).gm && o("shove", 0).self.join() === "prone");
  check("reposition outcomes", /up to 10 ft closer to Wolf/.test(o("reposition", 3).gm) && /up to 5 ft/.test(o("reposition", 2).gm) && /E1 can move Wolf up to 5 ft/.test(o("reposition", 0).gm) && !o("reposition", 1).gm);
  check("done ability", doneStep({ do: "ability", item: "knockdown", target: "E1", mode: "check" }, { check: { degree: 3 } }).result === "critical success" && doneStep({ do: "ability", item: "worry", target: "E2", mode: "card" }, { posted: {} }).result === "card posted for the GM to apply" && doneStep({ do: "ability", item: "grab", mode: "hold" }, { posted: {} }).result === "kept hold" && doneStep({ do: "ability", item: "knockdown", mode: "check" }, { flat: { ok: false } }).result === "flat check failed");
  /* found by the review of 0.5.3 */
  const igrab = { id: "improved-grab", name: "Improved Grab", kind: "free", cost: 0, traits: [], usesLeft: null, followUp: "grapple", effect: "improved-grab" };
  check("improved grab's hold takes an action", (q => q.ok && q.steps[0].mode === "hold" && q.steps[0].actions === 1 && spentBy(q.steps).actions === 1)(checkPlan({ steps: [ab("improved-grab", "E2")] }, { ...actx, abilities: [...AB, igrab], strikes: [...actx.strikes, { id: "claw", name: "Claw", reach: 10, effects: ["improved-grab"] }] }))
    && /no actions left/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" }), st({ item: "jaws", target: "E1" }), ab("improved-grab", "E2")] }, { ...actx, abilities: [...AB, igrab], strikes: [...actx.strikes, { id: "claw", name: "Claw", reach: 10, effects: ["improved-grab"] }] }).reason));
  check("one use left can't be planned twice", /no uses left/.test(checkPlan({ steps: [ab("rally-2"), ab("rally-2")] }, actx).reason));
  check("nothing between a Strike and its follow-up", /straight after/.test(checkPlan({ steps: [st({ item: "jaws", target: "E1" }), { do: "none" }, ab("knockdown")] }, actx).reason ?? ""));
  check("a hidden creature's size isn't given away", (r => /can't Trip E3\.$/.test(r) && !/size/.test(r))(checkPlan({ steps: [st({ item: "jaws", target: "E3" }), ab("knockdown")] }, { ...actx, targets: { ...actx.targets, E3: { ...actx.targets.E3, flat: 11 } } }).reason));
  check("hello can use abilities", hello(1).canDo.includes("ability") && hello(1).prompt.includes('"do": "ability"') && hello(1).prompt.includes("followUp"));
  check("a cleaned plan keeps an ability with no target", (c => c.ok && c.plan.steps[0].item === "knockdown" && !("target" in c.plan.steps[0]))(cleanPlan({ steps: [{ do: "ability", item: "knockdown" }] })));
}
/* spells (2026-11-07): a spell attack or a save spell at one creature runs for real, anything else posts its card for the GM */
{
  check("spell actions", JSON.stringify([spellActions("2"), spellActions("1 to 3"), spellActions("1 or 2"), spellActions("free"), spellActions("reaction"), spellActions("1 minute")]) === JSON.stringify([{ min: 2, max: 2 }, { min: 1, max: 3 }, { min: 1, max: 2 }, { min: 0, max: 0 }, { min: null, max: null }, { min: null, max: null }]));
  check("spell range", spellRange("30 feet").range === 30 && spellRange("Touch").touch && spellRange("").range === null && spellRange("planetary").range === null && spellRange("500 ft.").range === 500);
  check("spell targets", spellTargets("1 creature") === 1 && spellTargets("up to 3 creatures") === 3 && spellTargets("you") === 0 && spellTargets("") === 0 && spellTargets("1 object of Bulk 1 or less") === 0 && spellTargets("1 willing creature") === 1);
  const cant = { rank: 1, pool: null, left: null };
  const SP = [
    { id: "ignition", name: "Ignition", entryId: "e1", spellId: "s1", ranks: [cant], minActions: 2, maxActions: 2, range: 30, touch: false, targets: 1, area: null, attack: true, save: null, damaging: true, traits: ["attack", "concentrate", "fire", "manipulate"], critText: true },
    { id: "thunderstrike", name: "Thunderstrike", entryId: "e1", spellId: "s2", ranks: [{ rank: 1, pool: "slots:e1:1", left: 1 }], minActions: 2, maxActions: 2, range: 120, touch: false, targets: 1, area: null, attack: false, save: { stat: "reflex", basic: true }, damaging: true, traits: ["concentrate", "manipulate"] },
    { id: "fear", name: "Fear", entryId: "e1", spellId: "s3", ranks: [{ rank: 1, pool: "slots:e1:1", left: 1 }], minActions: 2, maxActions: 2, range: 30, touch: false, targets: 1, area: null, attack: false, save: { stat: "will", basic: false }, damaging: false, traits: ["concentrate", "manipulate"] },
    { id: "breathe-fire", name: "Breathe Fire", entryId: "e2", spellId: "s4", ranks: [{ rank: 1, pool: "innate:e2:s4:1", left: 1 }], minActions: 2, maxActions: 2, range: null, touch: false, targets: 0, area: { type: "cone", size: 15 }, attack: false, save: { stat: "reflex", basic: true }, damaging: true, traits: ["fire"] },
    { id: "heal", name: "Heal", entryId: "e1", spellId: "s5", ranks: [{ rank: 1, pool: "slots:e1:1", left: 1 }], minActions: 1, maxActions: 3, range: null, touch: true, targets: 1, area: null, attack: false, save: null, damaging: true, traits: ["healing", "manipulate"] },
    { id: "shield", name: "Shield", entryId: "e1", spellId: "s6", ranks: [cant], minActions: 1, maxActions: 1, range: null, touch: false, targets: 0, area: null, attack: false, save: null, damaging: false, traits: ["concentrate", "force"] },
    { id: "feather-fall", name: "Feather Fall", entryId: "e1", spellId: "s7", ranks: [cant], minActions: null, maxActions: null, range: 60, touch: false, targets: 1, area: null, attack: false, save: null, damaging: false, traits: [] }
  ];
  const sctx = { actions: 3, strikes: [{ id: "dagger", name: "Dagger", reach: 5, effects: [] }], abilities: [{ id: "rally", name: "Rally", kind: "action", cost: 1, traits: [], usesLeft: null }], spells: SP, saveRows: true, reach: 5,
    me: { square: [5, 5], size: 1 }, targets: { E1: { name: "E1", square: [8, 5], size: 1, flat: 0 }, E2: { name: "E2", square: [20, 5], size: 1, flat: 0 }, E3: { name: "E3", square: [6, 6], size: 1, flat: 11 } },
    allies: { M1: { name: "M1", square: [5, 5], size: 1, flat: 0, ally: true }, M2: { name: "M2", square: [6, 5], size: 1, flat: 0, ally: true } } };
  const sp = (item, target, more = {}) => ({ do: "spell", item, ...(target ? { target } : {}), ...more });
  let q = checkPlan({ steps: [sp("ignition", "E1")] }, sctx);
  check("spell attack at one creature runs for real", q.ok && q.steps[0].mode === "attack" && q.steps[0].attack && q.steps[0].variant === 0 && q.steps[0].actions === 2 && q.steps[0].rank === 1 && q.steps[0].entryId === "e1" && q.steps[0].spellId === "s1" && q.steps[0].damaging && q.steps[0].critText, JSON.stringify(q));
  q = checkPlan({ steps: [{ do: "strike", item: "dagger", target: "E3" }, sp("ignition", "E1")] }, sctx);
  check("a spell attack takes the multiple attack penalty", q.ok && q.steps[1].variant === 1 && spentBy(q.steps).attacks === 2 && spentBy(q.steps).actions === 3, JSON.stringify(q));
  check("out of range", /out of range of Ignition \(30 ft\)/.test(checkPlan({ steps: [sp("ignition", "E2")] }, sctx).reason ?? ""));
  check("a hidden target's flat check", checkPlan({ steps: [sp("ignition", "E3")] }, sctx).steps?.[0].flat === 11);
  q = checkPlan({ steps: [sp("thunderstrike", "E2")] }, sctx);
  check("a basic save spell at one creature waits for the save", q.ok && q.steps[0].mode === "save" && q.steps[0].save === "reflex" && q.steps[0].basic && !q.steps[0].attack && !q.steps[0].mapCounts, JSON.stringify(q));
  check("without Toolbelt's rows a save spell is the GM's", checkPlan({ steps: [sp("thunderstrike", "E2")] }, { ...sctx, saveRows: false }).steps?.[0].mode === "card");
  check("one slot can't be spent twice", /no uses or slots left/.test(checkPlan({ steps: [sp("thunderstrike", "E2"), sp("fear", "E1")] }, { ...sctx, actions: 4 }).reason ?? ""));
  check("a rank it hasn't", /can't cast Thunderstrike at rank 2 \(it can at 1\)/.test(checkPlan({ steps: [sp("thunderstrike", "E2", { rank: 2 })] }, sctx).reason ?? ""));
  check("a cantrip any number of times", checkPlan({ steps: [sp("shield"), sp("shield"), sp("shield")] }, sctx).ok);
  q = checkPlan({ steps: [sp("fear", "E1")] }, sctx);
  check("a non-basic save spell", q.ok && q.steps[0].mode === "save" && !q.steps[0].basic && !q.steps[0].damaging);
  q = checkPlan({ steps: [sp("breathe-fire")] }, sctx);
  check("an area spell is the GM's for now", q.ok && q.steps[0].mode === "card" && q.steps[0].area?.type === "cone" && !q.steps[0].target, JSON.stringify(q));
  q = checkPlan({ steps: [sp("breathe-fire", "E1")] }, sctx);
  check("an area spell may be aimed at someone", q.ok && q.steps[0].mode === "card" && q.steps[0].target === "E1" && /aimed at E1/.test(describeStep(q.steps[0])));
  check("an innate spell's one use", /no uses or slots left/.test(checkPlan({ steps: [sp("breathe-fire"), sp("breathe-fire")] }, { ...sctx, actions: 4 }).reason ?? ""));
  check("a choice of actions needs a number", /say how many with "actions"/.test(checkPlan({ steps: [sp("heal", "M2")] }, sctx).reason ?? ""));
  q = checkPlan({ steps: [sp("heal", "M2", { actions: 1 })] }, sctx);
  check("Heal on an ally by touch", q.ok && q.steps[0].actions === 1 && q.steps[0].mode === "card" && q.steps[0].flat === 0, JSON.stringify(q));
  check("Heal on itself", checkPlan({ steps: [sp("heal", "M1", { actions: 1 })] }, sctx).ok);
  check("touch needs reach", /out of reach for Heal \(5 ft\)/.test(checkPlan({ steps: [sp("heal", "E1", { actions: 1 })] }, sctx).reason ?? ""));
  check("too many actions", /no actions left \(Heal takes 3\)/.test(checkPlan({ steps: [sp("shield"), sp("heal", "M2", { actions: 3 })] }, sctx).reason ?? ""));
  check("a fixed spell's actions", /always takes 2 actions/.test(checkPlan({ steps: [sp("ignition", "E1", { actions: 1 })] }, sctx).reason ?? ""));
  check("a reaction spell isn't planned", /isn't cast as part of a turn/.test(checkPlan({ steps: [sp("feather-fall", "M2")] }, sctx).reason ?? ""));
  check("a target it needs", /needs a target/.test(checkPlan({ steps: [sp("ignition")] }, sctx).reason ?? ""));
  check("no target for a spell with none", /leave "target" out/.test(checkPlan({ steps: [sp("shield", "E1")] }, sctx).reason ?? ""));
  check("someone it doesn't know of", /doesn't know of "E9"/.test(checkPlan({ steps: [sp("ignition", "E9")] }, sctx).reason ?? ""));
  check("an ability's id given as a spell", /rally is an ability/.test(checkPlan({ steps: [sp("rally")] }, sctx).reason ?? ""));
  check("restrained can't cast a manipulate spell", /can't cast Thunderstrike/.test(checkPlan({ steps: [sp("thunderstrike", "E2")] }, { ...sctx, cantAttack: "it is restrained, so it can't attack." }).reason ?? "")
    && /restrained/.test(checkPlan({ steps: [sp("ignition", "E1")] }, { ...sctx, cantAttack: "it is restrained, so it can't attack." }).reason ?? ""));
  check("can't act", /paralyzed/.test(checkPlan({ steps: [sp("shield")] }, { ...sctx, cantAct: "it is paralyzed and can't act." }).reason ?? ""));
  check("an attack spell ends Take Cover", endsCover([{ do: "take-cover" }, { do: "spell", attack: true }], { 1: { castStarted: true } }) && !endsCover([{ do: "take-cover" }, { do: "spell" }], { 1: { castStarted: true } }));
  /* where a spell step stands */
  const A = { mode: "attack", damaging: true, apply: true };
  check("spell attack stages", nextSpell({}, A) === "cast" && nextSpell({ castStarted: true }, A) === "ask" && nextSpell({ castStarted: true, cast: {} }, A) === "attack" && nextSpell({ castStarted: true, cast: {}, started: true }, A) === "ask"
    && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 1 } }, A) === "next" && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 2 } }, A) === "damage"
    && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 3 }, damageStarted: true, damage: {} }, A) === "apply" && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 3 }, damageStarted: true, damage: {}, applying: true }, A) === "ask"
    && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 3 }, damageStarted: true, damage: {}, applying: true, applied: true }, A) === "next" && nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 2 }, damageStarted: true, damage: {} }, { ...A, apply: false }) === "next");
  check("a non-damaging spell attack that hits is the GM's", nextSpell({ castStarted: true, cast: {}, started: true, attack: { degree: 2 } }, { mode: "attack", damaging: false }) === "gm");
  check("a flat check first, after the cast", nextSpell({ castStarted: true, cast: {} }, { ...A, flat: 5 }) === "flat" && nextSpell({ castStarted: true, cast: {}, flatStarted: true, flat: { ok: false } }, { ...A, flat: 5 }) === "next" && nextSpell({ castStarted: true, cast: {}, flatStarted: true, flat: { ok: true } }, { ...A, flat: 5 }) === "attack");
  const S = { mode: "save", damaging: true, basic: true, apply: true };
  check("save spell stages", nextSpell({ castStarted: true, cast: {} }, S) === "save" && nextSpell({ castStarted: true, cast: {}, save: { degree: 3 } }, S) === "next" && nextSpell({ castStarted: true, cast: {}, save: { degree: 1 } }, S) === "damage"
    && nextSpell({ castStarted: true, cast: {}, save: { degree: 0 }, damageStarted: true, damage: {} }, S) === "apply" && nextSpell({ castStarted: true, cast: {}, save: { degree: 2 } }, { ...S, basic: false }) === "gm" && nextSpell({ castStarted: true, cast: {}, save: { degree: 2 } }, { ...S, damaging: false }) === "gm");
  check("a card spell is the GM's once cast", nextSpell({ castStarted: true, cast: {} }, { mode: "card" }) === "gm" && nextSpell({}, { mode: "card" }) === "cast");
  check("damage multipliers", SAVE_MULT.join() === "2,1,0.5,0" && spellMultiplier({ mode: "attack" }, { attack: { degree: 3 } }) === 2 && spellMultiplier({ mode: "attack" }, { attack: { degree: 2 } }) === 1
    && spellMultiplier({ mode: "save" }, { save: { degree: 0 } }) === 2 && spellMultiplier({ mode: "save" }, { save: { degree: 2 } }) === 0.5);
  check("spell words", /^Casts Ignition \(rank 1\) at Test Hero: a spell attack, attack 2\.$/.test(describeStep({ do: "spell", itemName: "Ignition", rank: 1, actions: 2, mode: "attack", targetName: "Test Hero", variant: 1 }))
    && /a basic Reflex save\.$/.test(describeStep({ do: "spell", itemName: "Thunderstrike", rank: 1, actions: 2, mode: "save", targetName: "E1", save: "reflex", basic: true, damaging: true }))
    && /a Will save, then you apply its effects\.$/.test(describeStep({ do: "spell", itemName: "Fear", rank: 1, actions: 2, mode: "save", targetName: "E1", save: "will", basic: false, damaging: false }))
    && /^Casts Heal \(rank 1, 1 action\) at M2: its card goes to chat/.test(describeStep({ do: "spell", itemName: "Heal", rank: 1, actions: 1, mode: "card", targetName: "M2" })));
  check("done spell", doneStep({ do: "spell", item: "ignition", rank: 1, target: "E1", mode: "attack" }, { cast: {}, attack: { degree: 3 } }).result === "critical hit" && doneStep({ do: "spell", item: "fear", rank: 1, target: "E1", mode: "save" }, { cast: {}, save: { degree: 1 } }).result === "target's save: failure"
    && doneStep({ do: "spell", item: "heal", rank: 1, mode: "card" }, { cast: {} }).result === "card posted for the GM to apply" && doneStep({ do: "spell", item: "x", mode: "attack" }, {}).result === "unknown" && doneStep({ do: "spell", item: "x", mode: "save" }, { cast: {} }).result === "waiting for the save");
  check("a cleaned plan keeps a spell's rank and actions", (c => c.ok && c.plan.steps[0].rank === 2 && c.plan.steps[0].actions === 1)(cleanPlan({ steps: [{ do: "spell", item: "heal", target: "M2", rank: 2, actions: 1 }] }))
    && /"rank" is a spell rank/.test(cleanPlan({ steps: [{ do: "spell", item: "heal", rank: 0 }] }).reason) && /"actions" is 0 to 3/.test(cleanPlan({ steps: [{ do: "spell", item: "heal", actions: 4 }] }).reason));
  /* found by the review of the spells change */
  const focusSp = { id: "fire-ray", name: "Fire Ray", ranks: [{ rank: 1, pool: "focus", left: 1, cost: 2 }], minActions: 2, maxActions: 2, range: 60, targets: 1, area: null, attack: true, save: null, damaging: true, traits: ["attack"] };
  check("a focus spell costing 2 with 1 point left", /no uses or slots left \(it costs 2 focus points\)/.test(checkPlan({ steps: [sp("fire-ray", "E1")] }, { ...sctx, spells: [...SP, focusSp] }).reason ?? ""));
  const harm = { id: "harm", name: "Harm", ranks: [{ rank: 1, pool: "slots:e1:1", left: 2 }], minActions: 1, maxActions: 3, range: null, touch: false, targets: 1, area: null, attack: false, save: { stat: "fortitude", basic: true }, damaging: true, variants: true, traits: ["manipulate"] };
  check("a spell with variants is the GM's, at any range", (q => q.ok && q.steps[0].mode === "card")(checkPlan({ steps: [sp("harm", "E2", { actions: 2 })] }, { ...sctx, spells: [...SP, harm] })));
  check("a save spell at an ally is the GM's", checkPlan({ steps: [sp("thunderstrike", "M2")] }, sctx).steps?.[0].mode === "card");
  check("an area aimed at a hidden creature has no flat check", checkPlan({ steps: [sp("breathe-fire", "E3")] }, sctx).steps?.[0].flat === 0);
  check("a card spell at a hidden creature rolls its flat check first", nextSpell({ castStarted: true, cast: {} }, { mode: "card", flat: 11 }) === "flat" && nextSpell({ castStarted: true, cast: {}, flatStarted: true, flat: { ok: true } }, { mode: "card", flat: 11 }) === "gm"
    && nextSpell({ castStarted: true, cast: {}, flatStarted: true, flat: { ok: false } }, { mode: "card", flat: 11 }) === "next" && /after a DC 11 flat check: its card/.test(describeStep({ do: "spell", itemName: "Fear", rank: 1, actions: 2, mode: "card", targetName: "E3", flat: 11 })));
  check("a card with no rows", nextSpell({ castStarted: true, cast: {}, noRows: true }, S) === "gm" && doneStep({ do: "spell", item: "x", mode: "save" }, { cast: {}, noRows: true }).result === "card posted for the GM to apply");
  check("creatures by kind", spellTargets("1 animal") === 1 && spellTargets("1 humanoid") === 1 && spellTargets("1 creature or unattended object") === 1 && spellTargets("1 unattended object") === 0 && spellTargets("1 corpse") === 0);
  check("hello can cast spells", hello(1).canDo.includes("spell") && hello(1).prompt.includes('"do": "spell"') && hello(1).prompt.includes("you.spells"));
}
/* ---- area spells (0.7.0) ---- */
{
  const me = { square: [5, 5], size: 1 };
  let a = aimArea({ type: "burst", size: 10 }, { at: [10, 6] }, me);
  check("a burst at a corner", a.ok && a.aim.type === "burst" && a.aim.corner.join() === "10,6" && a.aim.origin.join() === "10,6", JSON.stringify(a));
  a = aimArea({ type: "cylinder", size: 10 }, {}, me, { square: [10, 5], size: 1 });
  check("a cylinder is a burst; aimed at a creature it bursts from the corner of its space nearest the caster", a.ok && a.aim.type === "burst" && a.aim.corner.join() === "10,5", JSON.stringify(a));
  check("a burst needs at", /needs "at"/.test(aimArea({ type: "burst", size: 10 }, {}, me).reason) && /with "at"/.test(aimArea({ type: "burst", size: 10 }, { toward: [9, 9] }, me).reason));
  a = aimArea({ type: "cone", size: 15 }, { toward: [5, 0] }, me);
  check("an orthogonal cone starts mid-edge", a.ok && a.aim.rotation === -90 && a.aim.origin.join() === "5.5,5", JSON.stringify(a));
  a = aimArea({ type: "cone", size: 15 }, { toward: [9, 9] }, me);
  check("a diagonal cone starts at the corner", a.ok && a.aim.rotation === 45 && a.aim.origin.join() === "6,6", JSON.stringify(a));
  a = aimArea({ type: "cone", size: 15 }, { toward: [9, 8] }, me);
  check("a cone turns in 45° steps", a.ok && a.aim.rotation === 45);
  a = aimArea({ type: "cone", size: 30 }, { toward: [20, 15] }, { square: [5, 5], size: 2 });
  check("a Large creature's diagonal cone starts at its corner", a.ok && a.aim.origin.join() === "7,7", JSON.stringify(a));
  check("toward its own space", /inside the monster's own space/.test(aimArea({ type: "cone", size: 15 }, { toward: [6, 6] }, { square: [5, 5], size: 2 }).reason));
  a = aimArea({ type: "line", size: 30 }, { toward: [11, 5] }, me);
  check("a line leaves its space where its ray does", a.ok && a.aim.rotation === 0 && a.aim.origin.join() === "6,5.5", JSON.stringify(a));
  a = aimArea({ type: "line", size: 30 }, { toward: [11, 7] }, me);
  check("a line snaps to 5°", a.ok && a.aim.rotation % 5 === 0 && a.aim.origin[0] === 6, JSON.stringify(a));
  check("an emanation takes no aim", aimArea({ type: "emanation", size: 10 }, {}, me).ok && /leave out "at"/.test(aimArea({ type: "emanation", size: 10 }, { at: [1, 1] }, me).reason));
  check("cubes and rings stay with the GM", !placeable({ type: "cube", size: 10 }) && !placeable({ type: "ring", size: 10 }) && placeable({ type: "line", size: 60 }) && !aimArea({ type: "cube", size: 10 }, {}, me).ok);
  check("shapes as PF2e makes them", shapeOf(aimArea({ type: "burst", size: 20 }, { at: [3, 4] }, me).aim, me).radius === 4 && shapeOf(aimArea({ type: "cone", size: 15 }, { toward: [5, 0] }, me).aim, me).angle === 90
    && shapeOf(aimArea({ type: "line", size: 60 }, { toward: [20, 5] }, me).aim, me).length === 12 && shapeOf(aimArea({ type: "emanation", size: 10 }, {}, me).aim, me).base.width === 1);
  check("squares near cover the shape", squaresNear(aimArea({ type: "burst", size: 20 }, { at: [10, 10] }, me).aim, me).some(([x, y]) => x === 6 && y === 10) && squaresNear({ type: "emanation", size: 10, origin: [1, 1] }, { size: 1 }).every(([x, y]) => x >= 0 && y >= 0));
  /* who it catches: square centres inside a burst circle stand in for Foundry's own test */
  const circle = (o, r) => { const c = new Set(); for (let x = o[0] - r - 1; x <= o[0] + r; x++) for (let y = o[1] - r - 1; y <= o[1] + r; y++) if (Math.hypot(x + 0.5 - o[0], y + 0.5 - o[1]) <= r) c.add(`${x},${y}`); return c; };
  const burst = { type: "burst", size: 10, origin: [10, 10] }, cov = circle([10, 10], 2);
  check("a 10-foot burst covers 12 squares", cov.size === 12);
  const C = [{ id: "a", square: [10, 10], size: 1 }, { id: "b", square: [12, 10], size: 1 }, { id: "big", square: [11, 8], size: 2 }, { id: "far", square: [14, 10], size: 1 }, { id: "corner", square: [11, 11], size: 1 }];
  check("caught: in it, a Large creature by one square, not outside", caughtBy(burst, cov, C).join() === "a,big", caughtBy(burst, cov, C).join());
  check("a solid wall stops it", caughtBy(burst, cov, C, [[[10.8, 8], [10.8, 10]]]).join() === "a" && crossesWall([0, 0], [2, 0], [[[1, -1], [1, 1]]]) && !crossesWall([0, 0], [2, 0], [[[0, -1], [0, 1]]]) && !crossesWall([0, 0], [2, 0], [[[0, 0], [2, 0]]]));
  check("the caster isn't in its own emanation", caughtBy({ type: "emanation", size: 5, origin: [5.5, 5.5] }, new Set(["5,5", "6,5"]), [{ id: "me", square: [5, 5] }, { id: "x", square: [6, 5] }], [], "me").join() === "x");
  check("squares of a creature", squaresOf([2, 3], 2).length === 4);
  /* the plan check, with a stand-in for the glue's areaOf */
  const people = [{ id: "tE1", label: "E1", square: [8, 5] }, { id: "tM2", label: "M2", square: [6, 5], ally: true }, { id: "tMe", label: "M1", square: [5, 5], ally: true }, { id: "tX", label: null, square: [9, 6] }];
  const areaOf = (sp, aimStep, from, target) => {
    const r = aimArea(sp.area, aimStep, from, target); if (!r.ok) return r;
    const covered = new Set(); for (let x = 0; x < 30; x++) for (let y = 0; y < 30; y++) { const cx = x + 0.5, cy = y + 0.5, o = r.aim.origin;
      if (r.aim.type === "burst" ? Math.hypot(cx - o[0], cy - o[1]) <= r.aim.size / 5 : r.aim.type === "cone" ? Math.hypot(cx - o[0], cy - o[1]) <= r.aim.size / 5 && Math.abs((((Math.atan2(cy - o[1], cx - o[0]) * 180 / Math.PI) - r.aim.rotation + 540) % 360) - 180) <= 45 : false) covered.add(`${x},${y}`); }
    const ids = caughtBy(r.aim, covered, people.map(p => ({ id: p.id, square: p.id === "tMe" ? from.square : p.square, size: 1 })), [], "tMe");
    const lab = new Map(people.map(p => [p.id, p])), allies = ids.filter(i => lab.get(i)?.ally).map(i => lab.get(i).label);
    return { ok: true, aim: r.aim, ids, allies, self: "M1", known: ids.filter(i => lab.get(i)?.label && !lab.get(i).ally).map(i => lab.get(i).label) };
  };
  const BF = { id: "breathe-fire", name: "Breathe Fire", ranks: [{ rank: 1, pool: "i", left: 1 }], minActions: 2, maxActions: 2, range: null, targets: 0, area: { type: "cone", size: 15 }, save: { stat: "reflex", basic: true }, damaging: true, traits: ["fire"] };
  const FB = { id: "fireball", name: "Fireball", ranks: [{ rank: 3, pool: "s", left: 2 }], minActions: 2, maxActions: 2, range: 500, targets: 0, area: { type: "burst", size: 20 }, save: { stat: "reflex", basic: true }, damaging: true, traits: ["fire"], lasting: false };
  const GR = { id: "grease", name: "Grease", ranks: [{ rank: 1, pool: "g", left: 1 }], minActions: 2, maxActions: 2, range: 30, targets: 0, area: { type: "burst", size: 10 }, save: null, damaging: false, traits: [], lasting: true };
  const actx = { actions: 3, strikes: [], abilities: [], spells: [BF, FB, GR], saveRows: true, me: { square: [5, 5], size: 1 }, targets: { E1: { name: "E1", square: [8, 5], size: 1, flat: 0 } }, allies: { M1: { name: "M1", square: [5, 5], ally: true }, M2: { name: "M2", square: [6, 5], ally: true } }, areaOf };
  let q = checkPlan({ steps: [{ do: "spell", item: "breathe-fire", toward: [8, 5] }] }, actx);
  check("a cone that would catch an ally is turned down, naming it", !q.ok && /would also catch M2/.test(q.reason) && /"deliberate": true/.test(q.reason), JSON.stringify(q));
  q = checkPlan({ steps: [{ do: "spell", item: "breathe-fire", toward: [8, 5], deliberate: true }] }, actx);
  check("deliberate: it runs for real, and the GM's card shows the ally", q.ok && q.steps[0].mode === "area" && q.steps[0].area.deliberate && q.steps[0].area.hits.includes("tM2") && q.steps[0].save === "reflex" && q.steps[0].basic, JSON.stringify(q));
  q = checkPlan({ steps: [{ do: "spell", item: "breathe-fire", toward: [5, 0] }] }, actx);
  check("a cone away from its allies", q.ok && q.steps[0].mode === "area" && q.steps[0].area.aim.rotation === -90 && !q.steps[0].area.catches.length, JSON.stringify(q));
  q = checkPlan({ steps: [{ do: "spell", item: "fireball", at: [6, 5] }] }, actx);
  check("a burst on itself names itself", !q.ok && /itself/.test(q.reason) && /M2/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "spell", item: "fireball", at: [11, 5] }] }, actx);
  check("a burst catching an enemy and one it can't perceive", q.ok && q.steps[0].area.catches.join() === "E1" && q.steps[0].area.hits.includes("tX") && /catching E1/.test(describeStep(q.steps[0])) && !/tX/.test(describeStep(q.steps[0])), JSON.stringify(q));
  check("a burst's corner must be in range", /beyond Grease's range \(30 ft\)/.test(checkPlan({ steps: [{ do: "spell", item: "grease", at: [20, 20] }] }, actx).reason ?? ""));
  q = checkPlan({ steps: [{ do: "spell", item: "grease", at: [8, 9] }] }, actx);
  check("a non-damaging area is placed and goes to the card, and stays", q.ok && q.steps[0].mode === "card" && q.steps[0].lasting && q.steps[0].area.aim && /The area is placed/.test(describeStep(q.steps[0])), JSON.stringify(q));
  check("an aim it can't use", /Breathe Fire: a cone is aimed with "toward"/.test(checkPlan({ steps: [{ do: "spell", item: "breathe-fire", at: [7, 7] }] }, actx).reason ?? ""));
  check("without Toolbelt's rows a damaging area is the GM's", checkPlan({ steps: [{ do: "spell", item: "breathe-fire", toward: [5, 0] }] }, { ...actx, saveRows: false }).steps?.[0].mode === "card");
  q = checkPlan({ steps: [{ do: "stride", to: [5, 9] }, { do: "spell", item: "breathe-fire", toward: [8, 9] }] }, { ...actx, speed: 25, route: (f, t) => ({ ok: true, route: [f, t], cost: 20 }) });
  check("an area after a Stride is aimed from the new square", q.ok && q.steps[1].area.aim.origin.join() === "6,9.5", JSON.stringify(q.steps?.[1]?.area));
  check("an aimed step reads where it goes", /toward square 5, 0/.test(describeStep(checkPlan({ steps: [{ do: "spell", item: "breathe-fire", toward: [5, 0] }] }, actx).steps[0])) && aimText({ aim: { type: "burst", corner: [1, 2] } }) === " bursting from the corner [1, 2]" && aimText({ aim: { type: "emanation" } }) === " around itself");
  /* where an area step stands */
  const R = { castStarted: true, cast: {}, placed: {}, rows: ["a", "b"] };
  check("area stages: cast, place, saves", nextArea({}) === "cast" && nextArea({ castStarted: true }) === "ask" && nextArea({ castStarted: true, cast: {} }) === "place" && nextArea(R) === "save" && nextArea({ ...R, saves: { a: 1 } }) === "save");
  check("area damage once, then applied to each by degree", nextArea({ ...R, saves: { a: 1, b: 3 } }, { apply: true }) === "damage" && nextArea({ ...R, saves: { a: 1, b: 3 }, damageStarted: true }, { apply: true }) === "ask"
    && nextArea({ ...R, saves: { a: 1, b: 0 }, damageStarted: true, damage: {} }, { apply: true }) === "apply" && nextArea({ ...R, saves: { a: 1, b: 0 }, damageStarted: true, damage: {}, applying: { a: true } }, { apply: true }) === "ask"
    && nextArea({ ...R, saves: { a: 1, b: 0 }, damageStarted: true, damage: {}, applying: { a: true }, applied: { a: true } }, { apply: true }) === "apply"
    && nextArea({ ...R, saves: { a: 1, b: 0 }, damageStarted: true, damage: {}, applying: { a: true, b: true }, applied: { a: true, b: true } }, { apply: true }) === "remove"
    && nextArea({ ...R, saves: { a: 1, b: 0 }, damageStarted: true, damage: {}, applying: { a: true, b: true }, applied: { a: true, b: true }, removed: true }, { apply: true }) === "next");
  check("everyone saved critically: no damage, the area goes", nextArea({ ...R, saves: { a: 3, b: 3 } }, { apply: true }) === "remove" && nextArea({ ...R, saves: { a: 3, b: 3 } }, { apply: true, lasting: true }) === "next");
  check("damage off: rolled, not applied", nextArea({ ...R, saves: { a: 1, b: 2 }, damageStarted: true, damage: {} }, { apply: false }) === "remove");
  check("card areas and no rows are the GM's", nextArea({ castStarted: true, cast: {}, placed: {} }, { mode: "card" }) === "gm" && nextArea({ ...R, noRows: true }) === "gm");
  check("no one caught", nextArea({ castStarted: true, cast: {}, placed: {}, rows: [] }) === "remove");
  check("who it hurts", JSON.stringify(areaHurt({ rows: ["a", "b", "c"], saves: { a: 0, b: 2, c: 3 } })) === '{"a":2,"b":0.5}');
  check("area results for the thinker", doneStep({ do: "spell", item: "x", mode: "area" }, { cast: {}, results: "E1 failure" }).result === "saves: E1 failure" && doneStep({ do: "spell", item: "x", mode: "area" }, { cast: {}, results: "" }).result === "cast; no one it knows of was in the area" && doneStep({ do: "spell", item: "x", mode: "area" }, { cast: {} }).result === "waiting for saves");
  check("list words", listWords([]) === "" && listWords(["a"]) === "a" && listWords(["a", "b", "c"]) === "a, b and c");
  /* the plan as it arrives */
  check("cleanPlan keeps an area's aim", (p => p.ok && p.plan.steps[0].at.join() === "3,4" && p.plan.steps[0].toward.join() === "1,1" && p.plan.steps[0].deliberate === true)(cleanPlan({ steps: [{ do: "spell", item: "x", at: [3, 4], toward: [1, 1], deliberate: true }] }))
    && !cleanPlan({ steps: [{ do: "spell", item: "x", at: [3] }] }).ok && !cleanPlan({ steps: [{ do: "spell", item: "x", deliberate: "yes" }] }).ok && !("deliberate" in cleanPlan({ steps: [{ do: "spell", item: "x", deliberate: false }] }).plan.steps[0]));
  /* review fixes */
  const cone = aimArea({ type: "cone", size: 15 }, { toward: [10, 5] }, me).aim, wallAtEdge = [[[6, 4], [6, 7]]];
  check("a cone traces line of effect from the caster's centre, so a wall it stands against stops it", cone.from.join() === "5.5,5.5" && caughtBy(cone, new Set(["6,5", "7,5"]), [{ id: "x", square: [7, 5] }], wallAtEdge).length === 0 && caughtBy(cone, new Set(["6,5", "7,5"]), [{ id: "x", square: [7, 5] }], []).join() === "x");
  const b2 = aimArea({ type: "burst", size: 10 }, { at: [8, 5] }, me).aim;
  check("a burst's corner on a wall belongs to the caster's side", b2.from[0] < 8 && caughtBy(b2, new Set(["7,5", "8,5"]), [{ id: "near", square: [7, 5] }, { id: "far", square: [8, 5] }], [[[8, 3], [8, 8]]]).join() === "near");
  check("a burst behind a solid wall can't start there", !burstReachable(aimArea({ type: "burst", size: 10 }, { at: [10, 5] }, me).aim, [[[8, 3], [8, 8]]]) && burstReachable(b2, [[[8, 3], [8, 8]]]) && burstReachable(cone, wallAtEdge));
  const NR = { id: "aura", name: "Aura", ranks: [{ rank: 1, pool: null, left: null }], minActions: 1, maxActions: 1, range: null, targets: 0, area: { type: "burst", size: 10 }, save: { stat: "will", basic: true }, damaging: true, traits: [] };
  const TO = { ...NR, id: "touchburst", name: "Touch Burst", touch: true };
  check("a burst with no range starts at a corner of its own space", checkPlan({ steps: [{ do: "spell", item: "aura", at: [6, 6], deliberate: true }] }, { ...actx, spells: [NR] }).ok && /no range, so its burst starts at a corner of the monster's own space/.test(checkPlan({ steps: [{ do: "spell", item: "aura", at: [9, 9] }] }, { ...actx, spells: [NR] }).reason ?? ""));
  check("a touch burst within reach", /beyond Touch Burst's range \(5 ft\)/.test(checkPlan({ steps: [{ do: "spell", item: "touchburst", at: [12, 12] }] }, { ...actx, spells: [TO] }).reason ?? ""));
  const st = checkPlan({ steps: [{ do: "spell", item: "fireball", at: [11, 5] }] }, actx).steps;
  check("the thinker never gets an area's hits", st[0].area.hits.length && !("hits" in forThinker(st)[0].area) && forThinker(st)[0].area.catches.join() === "E1" && st[0].area.hits.length > 0 && forThinker([{ do: "strike" }])[0].do === "strike");
  check("nobody caught reads as finished", doneStep({ do: "spell", item: "x", mode: "area" }, { cast: {}, rows: [] }).result === "cast; no one it knows of was in the area");
  check("the prompt explains aiming", /"toward": \[x, y\]/.test(hello(1).prompt) && /"deliberate": true/.test(hello(1).prompt));
}

/* ---- Hide, Sneak, Seek (2026-11-07) ---- */
{
  check("stealth costs", COSTS.hide === 1 && COSTS.sneak === 1 && COSTS.seek === 1);
  check("sneak speed", sneakSpeed(25) === 10 && sneakSpeed(30) === 15 && sneakSpeed(35) === 15 && sneakSpeed(40) === 20 && sneakSpeed(5) === 0 && sneakSpeed(null) === 0);
  const light = l => () => l, sroute2 = (f, t) => ({ ok: true, route: [f, t], cost: 5 * Math.max(Math.abs(t[0] - f[0]), Math.abs(t[1] - f[1])) });
  const hc = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }], targets: { E1: { name: "E1", square: [6, 5], size: 1 } }, me: { square: [0, 5], size: 1 }, speed: 25, cantMove: null, route: sroute2, lightAt: light("bright"), coverFrom: {}, nearCover: () => false };
  const hide = { do: "hide" }, why = p => p.ok ? p.steps.find(x => x.do === "hide")?.why : p.reason;
  check("hide refused in the open", /Hide needs cover or concealment/.test(why(checkPlan({ steps: [hide] }, hc))));
  check("hide with standard cover", why(checkPlan({ steps: [hide] }, { ...hc, coverFrom: { E1: "standard" } })) === "cover" && checkPlan({ steps: [hide] }, { ...hc, coverFrom: { E1: "standard" } }).steps[0].from.join() === "E1");
  check("hide not with lesser cover", /Hide needs/.test(why(checkPlan({ steps: [hide] }, { ...hc, coverFrom: { E1: "lesser" } }))));
  check("hide concealed", why(checkPlan({ steps: [hide] }, { ...hc, concealed: true })) === "concealed");
  check("hide in dim light", why(checkPlan({ steps: [hide] }, { ...hc, lightAt: light("dim") })) === "dim" && why(checkPlan({ steps: [hide] }, { ...hc, lightAt: light("dark") })) === "dark");
  check("hide after taking cover", why(checkPlan({ steps: [{ do: "take-cover" }, hide] }, { ...hc, prone: true })) === "taking-cover");
  check("hide after a move: cover not read", /after a move in the same plan/.test(why(checkPlan({ steps: [{ do: "stride", to: [2, 5] }, hide] }, { ...hc, coverFrom: { E1: "standard" } }))));
  check("hide after a move by a trunk", why(checkPlan({ steps: [{ do: "stride", to: [2, 5] }, hide] }, { ...hc, nearCover: sq => sq[0] === 2 })) === "near");
  check("hide after a move in shadow", why(checkPlan({ steps: [{ do: "stride", to: [2, 5] }, hide] }, { ...hc, lightAt: sq => sq[0] === 2 ? "dim" : "bright" })) === "dim");
  check("hide needs actions", /no actions left/.test(checkPlan({ steps: [hide, hide, hide, hide] }, { ...hc, concealed: true }).reason));
  check("hide when paralyzed", /paralyzed/.test(checkPlan({ steps: [hide] }, { ...hc, concealed: true, cantAct: "it is paralyzed and can't act." }).reason));
  /* Seek */
  const sk = (o, c = hc) => checkPlan({ steps: [{ do: "seek", ...o }] }, c);
  check("seek needs an aim", /needs either "at"/.test(sk({}).reason) && /needs either "at"/.test(sk({ at: [1, 1], toward: [2, 2] }).reason));
  check("seek aim is two numbers", /two whole numbers/.test(sk({ at: [1.5, 2] }).reason) && /two whole numbers/.test(sk({ toward: "E1" }).reason));
  { const p = sk({ at: [7, 6] }); check("seek burst within 30 ft", p.ok && p.steps[0].aim.type === "burst" && p.steps[0].aim.size === SEEK.burst && p.steps[0].aim.corner.join() === "7,6", JSON.stringify(p)); }
  check("seek burst too far", /is 35 ft away, and a Seek's 15-foot burst goes within 30 ft/.test(sk({ at: [8, 5] }).reason), sk({ at: [8, 5] }).reason);
  { const p = sk({ toward: [6, 5] }); check("seek cone", p.ok && p.steps[0].aim.type === "cone" && p.steps[0].aim.size === 30 && p.steps[0].aim.toward.join() === "6,5"); }
  check("seek cone not at itself", /outside its own space/.test(sk({ toward: [0, 5] }).reason) && /outside its own space/.test(sk({ toward: [1, 6] }, { ...hc, me: { square: [0, 5], size: 2 } }).reason));
  check("seek must be last", /has to be the plan's last step/.test(checkPlan({ steps: [{ do: "seek", toward: [6, 5] }, { do: "strike", item: "jaws", target: "E1" }] }, hc).reason));
  check("seek after a stride, measured from there", checkPlan({ steps: [{ do: "stride", to: [5, 5] }, { do: "seek", at: [12, 6] }] }, hc).ok && !checkPlan({ steps: [{ do: "seek", at: [12, 6] }] }, hc).ok);
  /* Sneak */
  check("sneak half speed", checkPlan({ steps: [{ do: "sneak", to: [2, 5] }] }, hc).ok && /a Sneak moves at most half its Speed \(10 ft\)/.test(checkPlan({ steps: [{ do: "sneak", to: [3, 5] }] }, hc).reason));
  check("sneak prone", /it is prone, so it has to Stand first/.test(checkPlan({ steps: [{ do: "sneak", to: [1, 5] }] }, { ...hc, prone: true }).reason));
  check("sneak grabbed", /grabbed/.test(checkPlan({ steps: [{ do: "sneak", to: [1, 5] }] }, { ...hc, cantMove: "it is grabbed, so it can't use move actions." }).reason));
  check("sneak too slow", /half of 5 ft is less than a square/.test(checkPlan({ steps: [{ do: "sneak", to: [1, 5] }] }, { ...hc, speed: 5 }).reason));
  { const p = checkPlan({ steps: [{ do: "sneak", to: [2, 5] }] }, hc); check("sneak resolved as a move", p.ok && isMove(p.steps[0]) && p.steps[0].cost === 10 && p.steps[0].from.join() === "0,5"); }
  check("sneak counts its kind for the route", (() => { let k = null; checkPlan({ steps: [{ do: "sneak", to: [1, 5] }] }, { ...hc, route: (f, t, b, o) => { k = o.kind; return sroute2(f, t); } }); return k === "sneak"; })());
  check("sneak then hide then strike", checkPlan({ steps: [{ do: "sneak", to: [2, 5] }, { do: "hide" }, { do: "strike", item: "jaws", target: "E1" }] }, { ...hc, lightAt: light("dim"), targets: { E1: { name: "E1", square: [3, 5], size: 1 } } }).ok);
  /* words: what was done, never whether a secret roll worked */
  check("hide words", /Hides \(a secret Stealth check/.test(describeStep({ do: "hide", why: "cover" })));
  check("seek words", /Seeks in a 15-foot burst from the corner \[7, 6\]/.test(describeStep({ do: "seek", aim: { type: "burst", corner: [7, 6], size: 15 } })) && /30-foot cone toward square 6, 5/.test(describeStep({ do: "seek", aim: { type: "cone", toward: [6, 5], size: 30 } })));
  check("sneak words", /^Sneaks 10 ft .*to square 2, 5 \(a secret Stealth check/.test(describeStep({ do: "sneak", from: [0, 5], to: [2, 5], cost: 10 })));
  const dh = doneStep({ do: "hide" }, { applied: "applied" }), dn = doneStep({ do: "hide" }, { applied: "none" }), ds = doneStep({ do: "sneak", to: [2, 5] }, { moved: { to: [2, 5] }, applied: "applied" });
  check("done hide is secret", dh.result === dn.result && /secret/.test(dh.result) && !/hidden from|nothing|none/.test(dh.result));
  check("done sneak", ds.result === "arrived (whether it stayed unseen is secret)" && doneStep({ do: "sneak", to: [2, 5] }, { moved: { to: [1, 5] } }).result === "stopped at [1, 5]");
  check("done seek", /what it perceives now/.test(doneStep({ do: "seek", aim: { type: "cone" } }, { applied: "none" }).result) && /GM/.test(doneStep({ do: "seek" }, { gm: true }).result));
  check("sought change", describeChange({ who: "me", what: "sought" }) === "It finished Seeking: what it perceives now shows what it found.");
  check("sneak ends take cover", endsCover([{ do: "take-cover" }, { do: "sneak", from: [1, 1], to: [2, 1] }], { 1: { moved: { to: [2, 1] } } }, 2));
  check("spent by stealth", spentBy([{ do: "hide" }, { do: "sneak" }, { do: "seek" }]).actions === 3 && spentBy([{ do: "hide" }]).attacks === 0);
  /* the record */
  const walk = (kind, recs) => recs.map(r => nextStealth(r, kind)).join(",");
  check("hide stages", walk("hide", [{}, { rollStarted: true }, { rollStarted: true, card: { message: "m" } }, { rollStarted: true, card: {}, applyStarted: true }, { rollStarted: true, card: {}, applyStarted: true, applied: "none" }]) === "roll,ask,apply,check,next");
  check("seek stages", walk("seek", [{ rollStarted: true, card: {} }, { rollStarted: true, card: {}, applyStarted: true, applied: "applied" }]) === "apply,next");
  check("sneak stages", walk("sneak", [{ rollStarted: true, card: {} }, { rollStarted: true, card: {}, startStarted: true }, { rollStarted: true, card: {}, startStarted: true, startDone: true }, { rollStarted: true, card: {}, startStarted: true, startDone: true, started: true }, { rollStarted: true, card: {}, startDone: true, startStarted: true, moved: { to: [1, 1] } }]) === "start,check-start,move,move,apply");
  check("stealth to the GM", nextStealth({ rollStarted: true, card: {}, gm: true }, "sneak") === "gm" && nextStealth({ rollStarted: true, card: {}, gm: true, applyStarted: true }, "hide") === "gm");
  /* coming out of hiding (Rhea, 2026-11-07, A) */
  check("reveal before", ["stride", "crawl", "stand", "drop-prone", "take-cover", "seek"].every(d => revealsBefore({ do: d })) && revealsBefore({ do: "spell", mode: "card" }) && revealsBefore({ do: "ability", mode: "card" }));
  check("keeps hidden", ["hide", "sneak", "step", "none"].every(d => !revealsBefore({ do: d }) && !revealsAfter({ do: d })));
  check("reveal after attacks", revealsAfter({ do: "strike" }) && revealsAfter({ do: "spell", attack: true }) && revealsAfter({ do: "ability", attack: true }) && !revealsBefore({ do: "strike" }) && !revealsBefore({ do: "spell", attack: true }) && isAttack({ do: "ability", mode: "check", attack: true }));
  /* the prompt */
  const pt = promptText({ canDo: Object.keys(COSTS), stepKinds: STEP_KINDS });
  check("prompt teaches stealth", /"do": "hide"/.test(pt) && /"do": "sneak"/.test(pt) && /"do": "seek", "at"/.test(pt) && /Hiding ends/.test(pt) && /never told whether it worked/.test(pt) && !/\$\{/.test(pt));
  { const f = fs.readFileSync(path.resolve(HERE, "../../scripts/fight.mjs"), "utf8"); check("a Sneak reaches runStealth before the move dispatch", f.indexOf("step.do in STEALTH_WORD) work") > 0 && f.indexOf("step.do in STEALTH_WORD) work") < f.indexOf("isMove(step)) work")); }
  check("can do stealth", ["hide", "sneak", "seek"].every(k => Object.keys(COSTS).includes(k)));
}

/* ---- 0.9.0: ammunition, stalls, Down, thick trunks, off-grid areas ---- */
{
  const bctx = { actions: 3, strikes: [{ id: "bow", name: "Shortbow", reach: 5, ranged: true, maxRange: 300, shotsLeft: 2, ammo: "Arrows" }], targets: { E1: { name: "Hero", distance: 30 } } };
  const shot = n => ({ steps: Array.from({ length: n }, () => ({ do: "strike", item: "bow", target: "E1" })) });
  check("two shots with two left", checkPlan(shot(2), bctx).ok);
  const r3 = checkPlan(shot(3), bctx); check("third shot refused", !r3.ok && /Step 3: it has only 2 shots left with Shortbow \(Arrows\)/.test(r3.reason), r3.reason);
  const r0 = checkPlan(shot(1), { ...bctx, strikes: [{ ...bctx.strikes[0], shotsLeft: 0 }] }); check("no shots left", !r0.ok && /no shots left/.test(r0.reason), r0.reason);
  check("uncounted shots pass", checkPlan(shot(3), { ...bctx, strikes: [{ ...bctx.strikes[0], shotsLeft: null }] }).ok);
  check("noShot words", /couldn't shoot its Shortbow \(no ammunition it can use\); the action isn't spent/.test(describeChange({ who: "me", what: "noShot", item: "Shortbow", why: "no ammunition it can use" })));
  const S = 1000000;
  check("no stall before 60 s", stallOf({ state: "running", since: S }, { now: S + 59000 }) === null);
  const st = stallOf({ state: "running", since: S }, { now: S + 61000 }); check("running stalls at 60 s", st?.kind === "machine" && st.since === S);
  check("requested stalls at 60 s", stallOf({ state: "requested", since: S, packet: {} }, { now: S + 60000 })?.kind === "machine");
  check("saves wait 3 min", stallOf({ state: "saves", since: S }, { now: S + 120000 }) === null && stallOf({ state: "saves", since: S }, { now: S + STALL_MS.person })?.kind === "person");
  check("stopped is a person wait", stallOf({ state: "stopped", since: S }, { now: S + 200000 })?.kind === "person");
  check("ready without Auto never stalls", stallOf({ state: "ready", since: S }, { now: S + 9e6 }) === null);
  check("ready with Auto is a person wait", stallOf({ state: "ready", since: S }, { now: S + 200000, auto: true })?.kind === "person");
  check("held, done, manual never stall", ["held", "done", "manual"].every(x => stallOf({ state: x, since: S }, { now: S + 9e6, auto: true }) === null));
  check("given up never stalls", stallOf({ state: "requested", since: S, gaveUp: true }, { now: S + 9e6 }) === null);
  check("no since, no stall", stallOf({ state: "running" }, { now: S }) === null && stallOf({ state: "running", since: S + 5 }, { now: S }) === null);
  check("stall words", stallWords({ state: "saves", waited: 185000 }) === "Stalled: waiting for a save, for 3 minutes." && stallWords({ state: "running", waited: 61000 }) === "Stalled: an action has been running, for 1 minute.");
  const sreq = { state: "running", since: S, stall: { since: S, kind: "machine", state: "running", waited: 61000 }, packet: { you: { label: "M1" } }, round: 2, pos: 1, steps: [{}, {}], note: "x" };
  check("stall event live while stuck", live({ kind: "stall", since: S }, sreq));
  check("stall event gone once it moves", !live({ kind: "stall", since: S }, { ...sreq, since: S + 5 }) && !live({ kind: "stall", since: S }, { ...sreq, state: "done" }) && !stallLive({ since: S }, { ...sreq, stall: null }));
  const so = eventOut({ seq: 9, kind: "stall", combatId: "c", requestId: "r", since: S }, sreq); check("stall event carries no packet", so.kind === "stall" && !("packet" in so) && so.step === 2 && so.steps === 2 && so.stall.waitedSeconds === 61 && /Stalled/.test(so.stall.words));
  const words = { dead: "Dead", full: "Unhurt", entries: [{ marker: 50, label: "Hurt" }, { marker: 1, label: "Bad" }] };
  check("0 HP and dying is Down", healthWord({ value: 0, max: 10 }, words, { dead: false }) === "Down" && healthWord({ value: 0, max: 10 }, words) === "Dead" && healthWord({ value: 10, max: 10 }, words, { dead: false }) === "Unhurt");
  const gm = { cols: 3, rows: 1, idx: (x, y) => y * 3 + x, blocked: [1, 1, 0], costs: [0, 0, 0], cover: [0, 0, 0] };
  check("thick trunk is T, thin is #", groundAround(gm, [1, 0], 2, 0.3, (x, y) => x === 0).rows[0] === "T#." && groundAround(gm, [1, 0], 2).rows[0] === "##." && /T blocked/.test(groundAround(gm, [1, 0], 2).key));
  const cov = new Set(["5,5"]), aim = { type: "burst", from: [4, 4] };
  check("off-grid tested where it is", caughtBy(aim, cov, [{ id: "a", square: [5, 5], size: 1, points: [[6.1, 6.1]] }], [], null, ([x, y]) => x < 6) .length === 0 && caughtBy(aim, cov, [{ id: "a", square: [7, 7], size: 1, points: [[5.5, 5.5]] }], [], null, ([x, y]) => x < 6).length === 1);
  check("on-grid unchanged", caughtBy(aim, cov, [{ id: "a", square: [5, 5], size: 1 }], [], null, () => false).length === 1);
  const pk = packetOf({ you: {}, others: [{ id: "x", label: "E1", state: "observed", square: [1, 1], offGrid: true }, { id: "y", label: "E2", state: "observed", square: [2, 2], offGrid: false }, { id: "z", label: "E3", state: "hidden", square: [3, 3], offGrid: true }] });
  check("packet says off grid", pk.perceived[0].offGrid === true && !("offGrid" in pk.perceived[1]) && !("offGrid" in pk.perceived[2]));
  check("no packet or no tries left waits on the GM", stallOf({ state: "requested", since: 1, tries: 2, packet: {} }, { now: 200000 })?.state === "gm" && stallOf({ state: "requested", since: 1 }, { now: 120000 }) === null && /play the turn/.test(stallWords({ state: "gm", waited: 181000 })));
  check("long Auto pause isn't a stall", stallOf({ state: "running", since: 1 }, { now: 70001, machineMs: 90000 }) === null);
  const leak = eventOut({ seq: 1, kind: "stall", since: 1 }, { state: "running", since: 1, stall: { since: 1, state: "running", waited: 61000 }, note: "Valeros is at 0 HP", packet: { you: { label: "M1" } } });
  check("stall event carries no note", !JSON.stringify(leak).includes("Valeros"));
  check("shots from one stack counted together", !checkPlan({ steps: [{ do: "strike", item: "a", target: "E1" }, { do: "strike", item: "b", target: "E1" }] }, { actions: 3, strikes: [{ id: "a", name: "A", ranged: true, shotsLeft: 1, stack: "s1" }, { id: "b", name: "B", ranged: true, shotsLeft: 1, stack: "s1" }], targets: { E1: { name: "Hero", distance: 30 } } }).ok);
  check("spent noShot words", /action is spent/.test(describeChange({ who: "me", what: "noShot", item: "Bow", spent: true })));
  const pr = hello(1).prompt; check("prompt explains the new parts", /shotsLeft/.test(pr) && /"Down"/.test(pr) && /offGrid/.test(pr) && /T marks/.test(pr) && /"stall"/.test(pr));
}

/* ---------- the history window (Rhea, 2026-11-08) ---------- */
{
  const w = cleanPlan({ steps: [{ do: "strike", item: "jaws", target: "E1", why: "bite the\u0007 wizard" }, { do: "none", why: "" }] });
  check("plan keeps each step's why", w.ok && w.plan.steps[0].why === "bite the wizard" && !("why" in w.plan.steps[1]));
  check("prompt asks for a why per step", /"why"/.test(promptText({ canDo: ["strike"], stepKinds: ["strike"] })));
  const labels = { tHero: "E1", tWolf2: "M2" }, names = { tHero: "Valeros", tWolf: "Wolf", tWolf2: "Pup", tGob: "Goblin" };
  const look = { name: t => names[t], card: id => ({ a1: { total: 19, dc: 18 }, d1: { total: 9, label: "piercing" }, a2: { total: 7, dc: 18 } })[id] ?? null, save: () => ({ total: 12, dc: 17 }) };
  const strike = { do: "strike", item: "jaws", itemName: "Jaws", target: "E1", targetName: "E1", variant: 0, flat: 0 };
  const r1 = stepResult(strike, { started: true, attack: { message: "a1", degree: 2 }, damageStarted: true, damage: { message: "d1" }, applying: true, applied: true, hp: [18, 9] }, look, { nameOf: l => l === "E1" ? "Valeros" : null, named: x => x, tokenOf: () => "tHero" });
  check("strike line: total vs AC, degree, damage, HP", /19 vs AC 18: hit/.test(r1.text) && /damage 9 piercing/.test(r1.text) && /Valeros 18 → 9 HP/.test(r1.text) && r1.cards.join() === "a1,d1");
  check("strike that drops: Down", /\(Down\)/.test(stepResult(strike, { attack: { message: "a1", degree: 3 }, damage: { message: "d1" }, applied: true, hp: [5, 0] }, look).text));
  check("flat check failed", /flat check 3 vs DC 11: failed/.test(stepResult({ ...strike, flat: 11 }, { flatStarted: true, flat: { dc: 11, total: 3, ok: false } }, look).text));
  check("card gone: still says the degree", /miss/.test(stepResult(strike, { attack: { message: "gone", degree: 1 } }, {}).text));
  check("stride stopped short", /stopped at 4, 5 \(10 ft charged\), short of 6, 5/.test(stepResult({ do: "stride", to: [6, 5] }, { started: true, moved: { to: [4, 5], cost: 10 } }, look).text));
  check("area saves by creature with HP", /saves: Valeros 12 vs DC 17 success, Goblin 12 vs DC 17 critical failure/.test(stepResult({ do: "spell", mode: "area", itemName: "Fireball" }, { cast: { message: "c" }, saves: { tHero: 2, tGob: 0 }, damage: { message: "d1" }, applied: { tHero: true, tGob: true }, hp: { tHero: [20, 16], tGob: [6, 0] } }, look).text));
  const t = { labels, requests: {
    a: { round: 1, combatantId: "cWolf", tokenId: "tWolf", at: 1, since: 5, state: "done", replanned: true, pos: 1, by: { by: "chat", model: "sonnet" }, plan: { reason: "Bite E1 twice", steps: [{ do: "strike", why: "softest target" }, { do: "strike", why: "again" }] },
      steps: [strike, { ...strike, variant: 1 }], log: { 0: { started: true, attack: { message: "a2", degree: 1 } } }, presses: { 10: { do: "Do it", user: "Gamemaster", pos: 0 } },
      refused: { 1: { reason: "E1 is out of reach.", plan: { reason: "x", steps: [{ do: "strike", target: "E1" }] } } } },
    b: { round: 1, combatantId: "cWolf", tokenId: "tWolf", at: 2, state: "ready", pos: 0, parent: "a", why: [{ who: "E1", what: "down" }], plan: { reason: "Turn on M2's foe", steps: [{ do: "none" }] }, steps: [{ do: "none" }], log: {} } } };
  const order = [{ id: "cHero", name: "Valeros", npc: false }, { id: "cWolf", name: "Wolf", npc: true }, { id: "cGob", name: "Goblin", npc: true }];
  const rds = historyOf(t, { round: 2, turn: 1, current: "cWolf", order }, names, look);
  check("history: rounds and GM-played monsters", rds.length === 1 && rds[0].turns.map(x => x.name).join() === "Wolf,Goblin" && rds[0].turns[0].angel && !rds[0].turns[1].angel);
  { const td = { labels, requests: { d: { round: 1, combatantId: "cWolf", tokenId: "tWolf", at: 1, since: 5, state: "done", delayed: true, turn: 0, pos: 1, steps: [{ do: "delay", after: "E1" }], log: { 0: { ended: true, moved: true } }, plan: { reason: "wait", steps: [{ do: "delay" }] } },
      e: { round: 1, combatantId: "cWolf", tokenId: "tWolf", at: 2, since: 9, state: "done", afterDelay: true, turn: 1, pos: 1, steps: [strike], log: { 0: { started: true, attack: { message: "a2", degree: 2 } } }, plan: { reason: "now", steps: [{ do: "strike" }] } } } };
    const h = historyOf(td, { round: 1, turn: 2, current: "cGob", order: [{ id: "cHero", name: "Valeros", npc: false }, { id: "cWolf", name: "Wolf", npc: true }, { id: "cGob", name: "Goblin", npc: true }] }, names, look);
    check("history: a delayed turn and the turn it came back for are two turns, in order", h[0]?.turns.map(x => x.name).join("|") === "Wolf|Wolf (back after delaying)", JSON.stringify(h[0]?.turns.map(x => x.name))); }
  check("history: a monster the GM played this round shows once passed", historyOf(t, { round: 2, turn: 2, current: "cGob", order }, names, look)[1]?.turns.map(x => x.name).join() === "Wolf");
  check("history: current round only up to the turn", (rds[1]?.turns ?? []).length === 0);
  const wolf = rds[0].turns[0];
  check("history: a re-plan is a second part, oldest first", wolf.parts.length === 2 && wolf.parts[0].reason === "Bite Valeros twice" && /Valeros is down/.test(wolf.parts[1].asked));
  check("history: per-step why and press in order", wolf.parts[0].lines.map(l => l.kind).join() === "refused,press,step,end" && wolf.parts[0].lines[2].why === "softest target" && /Gamemaster pressed Do it/.test(wolf.parts[0].lines[1].text));
  check("history: refused plan kept", /out of reach/.test(wolf.parts[0].lines[0].text) && /Valeros/.test(wolf.parts[0].lines[0].text));
  check("history: names, not labels, for the GM", !/\bE1\b/.test(JSON.stringify(wolf)) && /Pup/.test(wolf.parts[1].reason));
  const html = historyHTML(rds, esc, { open: () => true });
  check("history HTML: folds, links, escapes", /<details[^>]*open/.test(html) && /data-message="a2"/.test(html) && /played by the GM/.test(html));
  { const t2 = { labels: { t: "M1" }, requests: { a: { round: 1, combatantId: "c", tokenId: "t", state: "done", pos: 1, plan: { reason: "run", steps: [{ do: "flee", to: [0, 1], why: "hurt" }] }, steps: [{ do: "flee", from: [3, 3], to: [0, 1], cost: 20, sides: ["west"] }], log: { 0: { moved: { to: [0, 1], cost: 20 } } }, escaped: { name: "Wolf", xp: 30, at: 5 }, note: "Wolf got away (30 XP not earned)." },
      b: { round: 2, combatantId: "d", tokenId: "u", state: "fled", pos: 1, plan: { steps: [{ do: "flee", to: [0, 1] }] }, steps: [{ do: "flee", from: [3, 3], to: [0, 1], cost: 20, sides: ["west"] }], log: { 0: { moved: { to: [0, 1], cost: 20 } } } } },
      escaped: { a: { tokenId: "t", name: "Wolf", xp: 30, round: 1, returned: { round: 2, at: 9 } } } };
    const rd = historyOf(t2, { round: 2, turn: 0, current: "d", order: [{ id: "c", name: "Wolf", npc: true }, { id: "d", name: "Goblin", npc: true }] }, { t: "Wolf", u: "Goblin" });
    const l1 = rd[0].turns[0].parts[0].lines, l2 = rd[1].turns.find(x => x.combatantId === "d").parts[0].lines;
    check("history: escape line, once", l1.filter(l => /Escaped: Wolf got away \(30 XP not earned\)/.test(l.text)).length === 1 && !l1.some(l => /got away\./.test(l.text)));
    check("history: at the edge line", l2.some(l => /At the map's edge/.test(l.text)));
    const rd2 = historyOf({ ...t2, requests: { ...t2.requests, b: { ...t2.requests.b, state: "done", extended: "west", note: "x" } } }, { round: 2, turn: 0, current: "d", order: [{ id: "c", name: "Wolf", npc: true }, { id: "d", name: "Goblin", npc: true }] }, { t: "Wolf", u: "Goblin" });
    check("history: extended line and the note", rd2[1].turns.find(x => x.combatantId === "d").parts[0].lines.some(l => /extended the map to the west/.test(l.text)) && rd2[1].turns.find(x => x.combatantId === "d").parts[0].lines.some(l => l.text === "x"));
    check("history: a returned entry sorts after the turns", rd[1].turns.at(-1).returned === true);
    check("history: the escape note is the latest note", /got away/.test(latestNote({ a: { ...t2.requests.a, at: 1 } })?.note ?? ""));
    check("history: brought back line", rd[1].turns.some(x => x.returned && x.name === "Wolf") && /brought back into the fight/.test(historyHTML(rd, esc)) && /brought back/.test(journalHTML(rd, esc)));
  }
  check("history HTML escapes", !/<b>x<\/b>/.test(historyHTML(historyOf({ requests: { z: { round: 1, combatantId: "c", tokenId: "t", plan: { reason: "<b>x</b>", steps: [] }, steps: [] } } }, { round: 1, order: [] }, { t: "T" }), esc)));
  check("journal HTML: no links", !/data-message/.test(journalHTML(rds, esc, { title: "Fight" })) && /Round 1/.test(journalHTML(rds, esc, {})));
  check("history: a step done with no record isn't 'not reached'", /did nothing/.test(stepResult({ do: "none" }, {}, look, undefined, true).text) && /done/.test(stepResult({ do: "stand" }, {}, look, undefined, true).text));
  const waitAgain = historyOf({ requests: { w: { round: 1, combatantId: "c", tokenId: "t", state: "requested", tries: 1, plan: { reason: "bad plan", steps: [{ do: "none" }] }, refused: { 1: { reason: "no", plan: { reason: "bad plan", steps: [] } } } } } }, { round: 1, order: [] }, { t: "T" })[0].turns[0].parts[0];
  check("history: a refused plan isn't shown as the plan while it waits", !waitAgain.reason && waitAgain.waiting && /Turned down/.test(waitAgain.lines[0].text));
  const ended = historyOf({ requests: { e: { round: 1, combatantId: "c", tokenId: "t", state: "done", why: [{ who: "me", what: "actions", now: 0 }], steps: [], plan: { reason: "r", steps: [] } } } }, { round: 1, order: [] }, { t: "T" })[0].turns[0].parts[0];
  check("history: a turn ended (not asked again) says so", !ended.asked && /The turn ended/.test(ended.lines.at(-1).text));
  check("history: empty fight", /Nothing yet/.test(historyHTML([], esc)));
}
/* Fly (0.13.0): height by the rules, the route over deep water, refusals, words, done results, arrival by height, the packet's heights */
{
  check("fly: height up straight 10 costs 20", heightCost(0, 10) === 20);
  check("fly: up 10 across 2 costs 10 extra (two diagonal-up squares at 10 each)", heightCost(2, 10) === 10);
  check("fly: up 10 across 1 costs 15 extra", heightCost(1, 10) === 15);
  check("fly: straight down 10 costs 5, 20 costs 10, 5 costs 5", heightCost(0, -10) === 5 && heightCost(0, -20) === 10 && heightCost(0, -5) === 5);
  check("fly: down while moving across costs nothing more", heightCost(3, -15) === 0 && heightCost(1, -15) === 5);
  check("fly: level costs nothing", heightCost(4, 0) === 0);
  check("fly: waypoints rise 5 a square, rest at the end", JSON.stringify(flyWaypoints([[0, 0], [1, 0], [2, 0]], 0, 15)) === JSON.stringify([{ square: [1, 0], elev: 5 }, { square: [2, 0], elev: 10 }, { square: [2, 0], elev: 15 }]));
  check("fly: waypoints straight up", JSON.stringify(flyWaypoints([[3, 3]], 0, 10)) === JSON.stringify([{ square: [3, 3], elev: 10 }]));
  check("fly: waypoints descend", JSON.stringify(flyWaypoints([[0, 0], [1, 1]], 10, 0)) === JSON.stringify([{ square: [1, 1], elev: 5 }, { square: [1, 1], elev: 0 }]));
  check("fly: level waypoints", JSON.stringify(flyWaypoints([[0, 0], [1, 0]], 20, 20)) === JSON.stringify([{ square: [1, 0], elev: 20 }]));
  const FW = ({ deep = [], solid = [], who = {} } = {}) => ({ cols: 12, rows: 12, terrain: (i, j) => deep.some(p => p[0] === i && p[1] === j) ? null : 0, blocked: (i, j) => solid.some(p => p[0] === i && p[1] === j), creature: (i, j) => who[`${i},${j}`] ?? null, wall: () => false });
  const water = [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]];
  check("fly: a walker can't cross deep water there", !findRoute({ from: [0, 0], to: [5, 0], budget: 30 }, FW({ deep: [...water, [2, 3], [3, 3], [2, 4], [3, 4], [2, 5], [3, 5], [2, 6], [3, 6], [2, 7], [3, 7], [2, 8], [3, 8], [2, 9], [3, 9], [2, 10], [3, 10], [2, 11], [3, 11]] })).ok);
  check("fly: a flier crosses it", findRoute({ from: [0, 0], to: [5, 0], budget: 30 }, flyWorld(FW({ deep: water }))).cost === 25);
  check("fly: a trunk still blocks a flier", findRoute({ from: [0, 0], to: [2, 0], budget: 30 }, flyWorld(FW({ solid: [[2, 0]] }))).why === "blocked");
  const froute = (f, t, before, o) => { const x = findRoute({ from: f, to: t, budget: 40 }, flyWorld(FW())); return x.ok || x.why === "far" ? { ok: true, route: x.route, cost: x.cost } : { ok: false, reason: routeWords(x, t, 40, o?.kind) }; };
  const fctx = { actions: 3, strikes: [{ id: "talon", name: "Talon", reach: 5 }], targets: { E1: { name: "E1", square: [3, 0], size: 1, elev: 0 } }, me: { square: [0, 0], size: 1, elev: 0 }, speed: 10, flySpeed: 40, cantMove: null, route: froute };
  let p = checkPlan({ steps: [{ do: "fly", to: [2, 0], height: 10 }] }, fctx); check("fly: across 2 and up 10 costs 20", p.ok && p.steps[0].cost === 20 && p.steps[0].height === 10, JSON.stringify(p));
  p = checkPlan({ steps: [{ do: "fly", to: [2, 0], height: 10 }, st({ item: "talon", target: "E1" })] }, fctx); check("fly: height counts in reach", !p.ok && /out of reach/.test(p.reason), p.reason);
  p = checkPlan({ steps: [{ do: "fly", to: [2, 0], height: 5 }, st({ item: "talon", target: "E1" })] }, fctx); check("fly: 5 ft up next to it is in reach", p.ok, p.reason);
  p = checkPlan({ steps: [{ do: "fly", to: [8, 0], height: 0 }] }, { ...fctx, flySpeed: 0 }); check("fly: no fly Speed", /no fly Speed/.test(p.reason));
  p = checkPlan({ steps: [{ do: "fly", to: [0, 0], height: 25 }] }, fctx); check("fly: straight up 25 is 50, too far", !p.ok && /takes 50 ft/.test(p.reason), p.reason);
  p = checkPlan({ steps: [{ do: "fly", to: [0, 0], height: 7 }] }, fctx); check("fly: height in steps of 5", /steps of 5/.test(p.reason));
  p = checkPlan({ steps: [{ do: "stride", to: [1, 0] }] }, { ...fctx, me: { ...fctx.me, elev: 15 } }); check("fly: no Stride in the air", /in the air, so it moves by Fly/.test(p.reason));
  p = checkPlan({ steps: [{ do: "fly", to: [0, 0], height: 15 }] }, { ...fctx, me: { ...fctx.me, elev: 15 } }); check("fly: a hover is 0 ft", p.ok && p.steps[0].cost === 0 && /Hovers 15 ft up/.test(describeStep(p.steps[0])));
  p = checkPlan({ steps: [{ do: "fly", to: [0, 0], height: 0 }, { do: "stride", to: [1, 0] }] }, { ...fctx, me: { ...fctx.me, elev: 20 } }); check("fly: land then Stride", p.ok && p.steps[0].cost === 10 && /lands/.test(describeStep(p.steps[0])), p.reason ?? describeStep(p.steps[0]));
  p = checkPlan({ steps: [{ do: "fly", to: [1, 0] }] }, { ...fctx, prone: true }); check("fly: not while prone", /prone/.test(p.reason));
  p = checkPlan({ steps: [{ do: "fly", to: [1, 0] }] }, { ...fctx, cantMove: "it is grabbed." }); check("fly: grabbed can't", /grabbed/.test(p.reason));
  p = checkPlan({ steps: [{ do: "drop-prone" }] }, { ...fctx, me: { ...fctx.me, elev: 10 } }); check("fly: no Drop Prone in the air", /falls instead/.test(p.reason));
  p = checkPlan({ steps: [{ do: "fly", to: [3, 0], height: 20 }] }, fctx); check("fly: words across and up", p.ok && /^Flies \d+ ft east, to square 3, 0, 20 ft up\.$/.test(describeStep(p.steps[0])), describeStep(p.steps[0] ?? {}));
  check("fly: done arrived", doneStep({ do: "fly", to: [3, 0], height: 20 }, { moved: { to: [3, 0], elev: 20 } }).result === "arrived");
  check("fly: done short of height", /stopped at \[3, 0\], 10 ft up/.test(doneStep({ do: "fly", to: [3, 0], height: 20 }, { moved: { to: [3, 0], elev: 10 } }).result));
  check("fly: arrival needs the height", nextMove({ started: true }, [3, 0], [3, 0], 20, 20) === "arrived" && nextMove({ started: true }, [3, 0], [3, 0], 0, 20) === "ask" && nextMove({ started: true }, [3, 0], [3, 0]) === "arrived");
  check("fly: plan keeps height", cleanPlan({ steps: [{ do: "fly", to: [1, 1], height: 15 }] }).plan?.steps[0].height === 15 && !cleanPlan({ steps: [{ do: "fly", to: [1, 1], height: -5 }] }).ok && STEP_KINDS.includes("fly") && COSTS.fly === 1);
  const pk = packetOf({ you: {}, others: [{ id: "a", state: "observed", label: "E1", square: [1, 1], height: 15 }, { id: "b", state: "hidden", label: "E2", square: [2, 2], height: 10 }, { id: "c", state: "observed", label: "E3", square: [3, 3], height: 0 }] });
  check("fly: packet heights", pk.perceived[0].height === 15 && pk.perceived[1].height === 10 && !("height" in pk.perceived[2]));
  /* the review's findings (0.13.0) */
  const done = (steps, log = {}, extra = {}) => ({ state: "done", steps, log, ...extra });
  check("fall: in the air, no Fly, module's turn", shouldFall({ requests: [done([{ do: "strike" }], { 0: { applied: true } })], height: 10, flies: true }) === "fall");
  check("fall: a Fly cut by a reload still counts", shouldFall({ requests: [done([{ do: "fly" }], { 0: { started: true } })], height: 10, flies: true }) === null);
  check("fall: a hover counts", shouldFall({ requests: [done([{ do: "fly" }], { 0: { started: true, moved: { to: [1, 1] } } })], height: 10, flies: true }) === null);
  check("fall: not after a Delay, even before 'delayed' is saved", shouldFall({ requests: [{ state: "running", steps: [{ do: "delay" }], log: { 0: { ended: true } } }], height: 10, flies: true }) === null && shouldFall({ requests: [done([{ do: "delay" }], {}, { delayed: true })], height: 10, flies: true }) === null);
  check("fall: not after the GM's own turn (manual, stopped, ready, held)", ["manual", "stopped", "ready", "held", "requested"].every(st => shouldFall({ requests: [{ state: st, steps: [] }], height: 10, flies: true }) === null));
  check("fall: once", shouldFall({ requests: [done([], {}, { fell: { from: 10 } })], height: 10, flies: true }) === null);
  check("fall: not on the ground, not without a fly Speed, not backwards, not with no request", shouldFall({ requests: [done([])], height: 0, flies: true }) === null && shouldFall({ requests: [done([])], height: 10, flies: false }) === null && shouldFall({ requests: [done([])], height: 10, flies: true, forward: false }) === null && shouldFall({ requests: [], height: 10, flies: true }) === null);
  check("fall: a dead flier's body drops", shouldFall({ requests: [{ state: "manual", steps: [] }], height: 10, flies: true, dead: true }) === "drop");
  check("fall: moved on, not back", movedOn({ round: 1, turn: 0 }, { round: 1, turn: 1 }) && movedOn({ round: 1, turn: 3 }, { round: 2, turn: 0 }) && !movedOn({ round: 2, turn: 1 }, { round: 2, turn: 0 }));
  check("fly: height when cut short", heightWhenCut(0, 20, 2, true) === 10 && heightWhenCut(0, 20, 9, true) === 20 && heightWhenCut(20, 0, 1, true) === 15 && heightWhenCut(0, 20, 1, false) === 20);
  p = checkPlan({ steps: [{ do: "fly", to: [0, 0] }] }, { ...fctx, me: { ...fctx.me, elev: 7 } }); check("fly: a hover at an odd GM height is fine", p.ok && p.steps[0].height === 7, p.reason);
  p = checkPlan({ steps: [{ do: "stride", to: [1, 0] }] }, { ...fctx, flySpeed: 0, me: { ...fctx.me, elev: 10 } }); check("fly: no fly Speed up high stands on something: Stride allowed", p.ok, p.reason);
  check("area: vertical gap", verticalGap(0, { elev: 40, top: 45 }) === 40 && verticalGap(0, { elev: 0, top: 5 }) === 0 && verticalGap(30, { elev: 0, top: 5 }) === 25 && verticalGap({ elev: 20, top: 25 }, { elev: 0, top: 5 }) === 15);
  check("area: a 20-ft burst on the ground misses a flier 40 ft up", (() => { const aim = { type: "burst", corner: [5, 5], origin: [5, 5], size: 20 }, cov = new Set(["4,4", "5,5"]); return caughtBy(aim, cov, [{ id: "a", square: [4, 4], size: 1, elev: 40, top: 45 }, { id: "b", square: [5, 5], size: 1, elev: 0, top: 5 }], [], null, null, 0).join() === "b"; })());
  check("fly: prompt explains Fly", /"do": "fly"/.test(promptText()) && /falls/.test(promptText()));
}
/* canvasReady goes through Hooks.call: a handler that returns false stops every later module's handler (0.2.4 did exactly that) */
for (const f of ["main.mjs", "fight.mjs", "builder.mjs", "ui/build.mjs", "ui/turns.mjs", "ui/history.mjs"]) for (const m of fs.readFileSync(path.resolve(HERE, "../../scripts", f), "utf8").matchAll(/Hooks\.(?:on|once)\("([^"]+)",\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*([^{\s])/g)) check(`hook ${m[1]} in ${f} returns nothing`, false, m[0]);
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "layouts.json"), JSON.stringify(out));
console.log(`${good} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
