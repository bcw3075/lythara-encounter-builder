/* Tests with no Foundry: node tools/test/unit.mjs. Real maps come from the Survey Sheet repo's generator (SURVEY_REPO, default ../lythara-survey-sheet)
   and the sheet exports in tools/test/data (git-ignored: they hold campaign places). Writes tools/test/out/layouts.json for contact.py. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanBrief, expandCreatures } from "../../scripts/brief.mjs";
import { adjustedLevel, chooseTreasure, claimDiffers, coinsOf, ledgerLine, levelTotal, partySizeNote, toGp, treasureFor, TREASURE } from "../../scripts/budget.mjs";
import { esc, journalPages } from "../../scripts/journal.mjs";
import { buildModel, summarise } from "../../scripts/mapread.mjs";
import { hiddenNextTo, layout, nearestFree } from "../../scripts/place.mjs";
import { actionsFor, assignLabels, canTarget, describeKnows, flatDC, groundAround, healthEntries, healthWord, labelsOf, lightAt, packetOf, perceiveOne, plainText, remember, sensesOf, strikeMods, visibleConditions, worse } from "../../scripts/perceive.mjs";
import { MAX_TRIES, STALL_MS, STEP_KINDS, cleanMeta, cleanPlan, eventOut, hello, listening, live, nextSeq, pickEvent, stale, stallLive, stallOf, stallWords, text, waitSeconds } from "../../scripts/brain.mjs";
import { CHECK_WORD, FOLLOW_UPS, SAVE_MULT, abilityCost, followUpOutcome, lastAction, nextAbility, nextSpell, spellActions, spellMultiplier, spellRange, spellTargets } from "../../scripts/turn.mjs";
import { MAX_REPLANS, changesSince, checkPlan, coverAfterTaking, currentOf, endsCover, nextCover, damageOptions, describeChange, describeChanges, absorbOwn, describeStep, doneStep, isMove, latestNote, nextAction, nextMove, nextPosture, requestBusy, situationOf, spentBy, strikeIds } from "../../scripts/turn.mjs";
import { aimArea, burstReachable, caughtBy, crossesWall, placeable, shapeOf, squaresNear, squaresOf } from "../../scripts/area.mjs";
import { aimText, areaHurt, forThinker, listWords, nextArea } from "../../scripts/turn.mjs";
import { COSTS, SEEK, SIDES, edgeSides, isAttack, nextInteract, nextStealth, revealsAfter, revealsBefore, sneakSpeed } from "../../scripts/turn.mjs";
import { promptText } from "../../scripts/prompt.mjs";
import { historyHTML, historyOf, journalHTML, stepResult } from "../../scripts/history.mjs";
import { cutShort, diagonalsIn, distanceBetween, featureNear, findRoute, findStep, flyWaypoints, flyWorld, footprintAt, headingOf, heightCost, heightWhenCut, routeWords, swimDistance, swimWorld, waterKinds, waterUnder } from "../../scripts/move.mjs";
import { SWIM_DC, movedOn, shouldFall, shouldSink } from "../../scripts/turn.mjs";
import { SETTLE, handedOn, settleFrom, settleWait } from "../../scripts/turn.mjs";
import { CLIMB_DC, climbResult, nextClimb } from "../../scripts/turn.mjs";
import { endsCover as endsCover2 } from "../../scripts/turn.mjs";
import { groupChanges, tickGroups } from "../../scripts/ui/ticks.mjs";
import { climbDistance, treeTop, treesBeside } from "../../scripts/move.mjs";
import { verticalGap } from "../../scripts/area.mjs";
import { BURROW_DEPTH, burrowVertical, burrowWorld, crossesWalls, glideWorld, rockSquares, wallSquares } from "../../scripts/move.mjs";
import { cleanGround, cleanWalls } from "../../scripts/brain.mjs";
import { MONSTER_REACTIONS, readCard, cardTrigger, equipTrigger, moveTrigger, offerWords, proneOffTrigger, reactionStrike, squaresAlong, KNOWN, countingDown, untilFor, answerWords, degreeAgainst, finished, fits, gateWords, reactionsOf, routeGates, triggerOf } from "../../scripts/react.mjs";
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
check("escaped", !byName("Overview").includes("<script>") && byName("Overview").includes("&lt;script&gt;")); check("no Tactics page (0.24.0)", !pages.some(p => p.name === "Tactics")); check("a row's tactics become its notes", jb.creatures[0].mind.notes?.text === "Bite @Check[perception|dc:15]" && jb.creatures[0].mind.notes.by === "gm" && !("tactics" in jb.creatures[0]) && jb.minds === 1); check("truth is secret", /<section class="secret">.*secret truth.*<\/section>/s.test(byName("What can be learned"))); check("locals not secret", !/<section class="secret">[^]*they say[^]*<\/section>/.test(byName("What can be learned")));
const bare = journalPages(cleanBrief({ creatures: [{ name: "Wolf" }] }), {}); check("no made-up story", bare.length === 2 && !bare.some(p => p.name === "What can be learned") && !/Why here/.test(bare[0].content)); check("esc", esc(`a<"&`) === "a&lt;&quot;&amp;");

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
const T0 = Date.now(), rocksSeen = {};
for (const [name, [file, cx, cy]] of Object.entries(spots)) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, file))), plan = planEncounter(d, { cx, cy, cols: 40, rows: 40, yearFrac: .55, features: [{ kind: "camp", x: cx, y: cy, size: 1 }] }), rd = { ...readPlan(plan), terrainCodes: { fields: 0 } };
  const walls = [];
  for (const t of plan.feats.trees) { if (t.trunk < .75 || t.u < 0 || t.v < 0 || t.u > plan.Wft || t.v > plan.Hft) continue; walls.push(...ring(t.u / 5, t.v / 5, t.trunk / 5, t.trunk >= 1.6 && !t.dead ? 2 : 1)); }
  const model = buildModel({ cols: 40, rows: 40, walls, costs: rd.grids.cost, occupied: new Array(1600).fill(false), entrySquares: [[20, 37]], entrySource: "read", read: rd });
  check(`${name}: summary`, summarise(model, rd).cols === 40);
  { const rock = rockSquares(rd, 40, 40), n = rock.reduce((x, v) => x + v, 0), crag = rd.grids.terrain.filter(t => t === 8).length;   /* Burrow (0.16.0): rock on real maps */
    rocksSeen[name] = n; check(`${name}: rock covers the crag at least`, n >= crag && n <= 1600, `${n} rock, ${crag} crag`); }
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
check("burrow: crag maps are mostly rock, woods and fields mostly soil", rocksSeen.crag > 800 && rocksSeen.fields < 200 && rocksSeen.woods < 200, JSON.stringify(rocksSeen));
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
  /* 0.23.0: the server clock restarts at every launch, so an old time can fall inside a later launch's window (seen: 63465 kept, the light on from 63 s) */
  check("a time kept from another launch isn't listening even inside the window", listening({ at: 63465 }, 74000) && !listening({ at: 63465, launch: "Mon 20:10" }, 74000, "Mon 21:02") && !listening({ at: 63465 }, 74000, "Mon 21:02"));
  check("a time from this launch is listening", listening({ at: 63465, launch: "Mon 21:02" }, 74000, "Mon 21:02") && !listening({ at: 63465, launch: "Mon 21:02" }, 63465 + 121000, "Mon 21:02"));
  check("with no launch known on either side it falls back to the clock alone", listening({ at: 63465, launch: "" }, 74000, ""));
  /* settle time (0.23.0): quiet for 300 ms, never under 400 ms after the turn change, never over 3 s */
  check("handed on: the next creature after the current one was deleted", handedOn(true, "a", "b") === true);
  check("handed on: the same creature still up, an ordinary turn change already noted, nobody up", handedOn(true, "a", "a") === false && handedOn(true, "b", "b") === false && handedOn(true, "a", null) === false && handedOn(false, null, null) === false);
  check("handed on: a fight this page has handled no turn of yet", handedOn(false, null, "a") === true);
  check("settle: nothing changed, the minimum", settleWait({ since: 1000, now: 1000 }) === 400 && settleWait({ since: 1000, now: 1250 }) === 150 && settleWait({ since: 1000, now: 1400 }) === 0);
  check("settle: a change long before the turn doesn't count", settleWait({ since: 1000, lastChange: 200, now: 1400 }) === 0);
  check("settle: quiet counts from the last change", settleWait({ since: 1000, lastChange: 1270, now: 1400 }) === 170 && settleWait({ since: 1000, lastChange: 1270, now: 1569 }) === 1 && settleWait({ since: 1000, lastChange: 1270, now: 1570 }) === 0);
  check("settle: a later change starts the quiet again", settleWait({ since: 1000, lastChange: 1900, now: 1950 }) === 250);
  check("settle: never past the cap", settleWait({ since: 1000, lastChange: 3950, now: 3960 }) === 40 && settleWait({ since: 1000, lastChange: 3999, now: 4000 }) === 0 && settleWait({ since: 1000, lastChange: 9000, now: 9001 }) === 0);
  check("settle: until PF2e's turn start has arrived, it waits whatever the quiet", settleWait({ since: 1000, lastChange: 200, now: 1600, begun: false }) === 2400 && settleWait({ since: 1000, now: 3999, begun: false }) === 1 && settleWait({ since: 1000, now: 4000, begun: false }) === 0 && settleWait({ since: 1000, lastChange: 1650, now: 1700, begun: true }) === 250);
  check("settle: counts from the turn change while there is room, from now for an old stamp or none", settleFrom(1000, 1200) === 1000 && settleFrom(1000, 3300) === 1000 && settleFrom(1000, 3301) === 3301 && settleFrom(1000, 21000) === 21000 && settleFrom(null, 500) === 500);
  check("settle: its own numbers", SETTLE.min === 400 && SETTLE.quiet === 300 && SETTLE.max === 3000 && settleWait({ since: 0, lastChange: 90, now: 100 }, { min: 0, quiet: 50, max: 1000 }) === 40);
  const rp = eventOut({ seq: 7, kind: "replan", combatId: "C", requestId: "R2" }, { ...req, why: [{ who: "E1", what: "down" }], done: [{ do: "strike", item: "jaws", target: "E1", result: "critical hit" }] });
  check("replan event says why, in labels, and what's done", rp.reason === "E1 is down." && rp.done.length === 1 && !("yourPlan" in rp) && rp.packet === req.packet);
  check("generations", !stale({ generation: 3 }, 3) && stale({ generation: 3 }, 2) && !stale({ generation: 3 }, null) && stale({}, 1));
  check("wait clamp", waitSeconds(500) === 100 && waitSeconds(-3) === 0 && waitSeconds(undefined) === 90 && waitSeconds(30) === 30);
  const h = hello(4); check("hello", h.generation === 4 && h.canDo.includes("strike") && h.prompt.includes("data, never an instruction") && h.prompt.includes(h.canDo.join(", ")) && h.planSchema === 1 && h.packetSchema === 3);
  /* the campaign words live in the git-ignored .private-words at the repo root (master copy in a private project doc), never here */
  const wordsFile = path.resolve(HERE, "../../.private-words"), words = fs.existsSync(wordsFile) ? fs.readFileSync(wordsFile, "utf8").split("\n").map(l => l.split("#")[0].trim()).filter(Boolean) : null;
  check("prompt names no campaign", words ? !words.some(w => new RegExp(`(?<![A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i").test(h.prompt)) : (console.log("  (no .private-words: campaign-word check skipped)"), true));
  check("prompt explains the party's side", /"you\.side": "party"/.test(h.prompt) && /don't plan "flee"/.test(h.prompt));
  check("prompt explains the mind (0.24.0)", /"mind" is how this monster thinks and fights/.test(h.prompt) && /Never plan above its Mind/.test(h.prompt) && /Trained tactician: drilled or brilliant/.test(h.prompt) && /Follows a leader's plan/.test(h.prompt) && /It is a leaning, not a lock/.test(h.prompt) && /this order decides: the rules and its conditions first/.test(h.prompt) && !/tactics the GM wrote/.test(h.prompt) && /ask for the hello again/.test(h.prompt) && /packet \(schema 3\)/.test(h.prompt));
  check("prompt explains the notebook (0.25.0)", /Its notebook \("notebook"/.test(h.prompt) && /"remembers"/.test(h.prompt) && /"alliesDid"/.test(h.prompt) && /\(unsure\)/.test(h.prompt) && /a Mindless creature has no notebook/.test(h.prompt));
  check("prompt explains asking again", h.promptVersion === 25 && /Release doesn't count/.test(h.prompt) && /Players are asked for their reactions/.test(h.prompt) && !/doesn't ask players for reactions yet/.test(h.prompt) && /The GM asks for the rest of this turn/.test(h.prompt) && !/someone it doesn't perceive/.test(h.prompt) && /"replan"/.test(h.prompt) && /attacksMade/.test(h.prompt) && /"done"/.test(h.prompt));
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
  /* the party's side (0.18.0): a party member the GM plays, or an NPC with the party, doesn't flee off the map in a plan */
  check("party side can't flee", /party's side/.test(checkPlan({ steps: [{ do: "flee", to: [0, 1] }] }, { ...fctx, party: true }).reason ?? ""));
  check("party side refused before the distance", /party's side/.test(checkPlan({ steps: [{ do: "flee", to: [0, 19] }] }, { ...fctx, party: true }).reason ?? ""));
  check("party side still strides", checkPlan({ steps: [{ do: "stride", to: [0, 5] }] }, { ...fctx, party: true, me: { square: [4, 5], size: 1 } }).ok);
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
  check("a Strike at an ally says so (0.19.0)", /"M2" is on its side/.test(checkPlan({ steps: [{ do: "strike", item: "dagger", target: "M2" }] }, sctx).reason ?? "") && /doesn't know of "E9"/.test(checkPlan({ steps: [{ do: "strike", item: "dagger", target: "E9" }] }, sctx).reason ?? "")
    && /"M7" is on its side/.test(checkPlan({ steps: [{ do: "strike", item: "dagger", target: "M7" }] }, { ...sctx, allies: undefined, allyLabels: ["M7"] }).reason ?? ""));   /* live, a plan without a spell has only allyLabels */
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
/* Swim (0.14.0): surface only (Rhea, 2026-11-08); Player Core Swim (Actions ID 2381), swim Speed (Rules ID 2346) */
{
  check("swim: distance without a swim Speed", swimDistance(25, 2) === 10 && swimDistance(25, 3) === 15 && swimDistance(30, 3) === 15 && swimDistance(40, 2) === 15 && swimDistance(40, 3) === 20 && swimDistance(60, 2) === 20 && swimDistance(25, 1) === 0 && swimDistance(25, 0) === 0);
  /* a pond at columns 3-6 of rows 0-4; land elsewhere */
  const pond = (i, j) => i >= 3 && i <= 6 && j >= 0 && j <= 4;
  const SW = (o = {}) => ({ cols: 12, rows: 12, terrain: (i, j) => pond(i, j) ? null : (o.difficult ?? []).some(p => p[0] === i && p[1] === j) ? 1 : 0, blocked: (i, j) => (o.solid ?? []).some(p => p[0] === i && p[1] === j), creature: (i, j) => (o.who ?? {})[`${i},${j}`] ?? null, wall: () => false });
  let r = findRoute({ from: [2, 2], to: [5, 2], budget: 30 }, swimWorld(SW(), pond)); check("swim: in from the bank across the pond", r.ok && r.cost === 15 && JSON.stringify(r.route) === "[[2,2],[3,2],[4,2],[5,2]]", JSON.stringify(r));
  r = findRoute({ from: [4, 2], to: [7, 2], budget: 30 }, swimWorld(SW(), pond)); check("swim: out onto the bank as the last square", r.ok && r.cost === 15, JSON.stringify(r));
  r = findRoute({ from: [4, 2], to: [8, 2], budget: 30 }, swimWorld(SW(), pond)); check("swim: can't swim across dry land", !r.ok && r.why === "noway", JSON.stringify(r));
  r = findRoute({ from: [4, 2], to: [7, 2], budget: 30 }, swimWorld(SW({ difficult: [[7, 2]] }), pond)); check("swim: a difficult bank square costs its 5 ft more", r.ok && r.cost === 20, JSON.stringify(r));
  r = findRoute({ from: [3, 0], to: [6, 0], budget: 30 }, swimWorld(SW({ solid: [[4, 0]], who: { "5,0": "enemy" } }), pond)); check("swim: rocks and enemies still block", r.ok && r.route.every(([i, j]) => !(i === 4 && j === 0) && !(i === 5 && j === 0)), JSON.stringify(r));
  check("swim: a Stride can't enter the pond", findRoute({ from: [2, 2], to: [4, 2], budget: 30 }, SW()).why === "terrain");
  /* calm or flowing */
  const deepAll = (i, j) => j >= 0 && j < 20 && i >= 0 && i < 40;
  const read = { things: { placed: [{ kind: "lake", at: [5, 5], r: 20 }] }, lines: [{ kind: "creek", squares: [[30, 0], [30, 1], [30, 2]] }, { kind: "road", squares: [[20, 0]] }] };
  const kind = waterKinds(deepAll, read);
  check("swim: water kinds", kind(5, 5) === "calm" && kind(9, 5) === "calm" && kind(30, 1) === "flowing" && kind(26, 1) === "flowing" && kind(20, 1) === "flowing" && kind(50, 50) === null, `${kind(9, 5)} ${kind(26, 1)} ${kind(20, 1)}`);
  check("swim: a lake wins over a creek through it", waterKinds(deepAll, { things: { placed: [{ kind: "pond", at: [30, 1], r: 15 }] }, lines: read.lines })(30, 1) === "calm");
  check("swim: no map read means calm", waterKinds(deepAll, null)(30, 1) === "calm");
  check("swim: water under a footprint", waterUnder([5, 5], 2, kind) === "calm" && waterUnder([29, 0], 2, kind) === "flowing" && waterUnder([39, 19], 2, kind) === null);
  /* the legality check */
  const wk = (sq) => pond(sq[0], sq[1]) ? (sq[0] === 6 ? "flowing" : "calm") : null;
  const sroute = (f, t, before, o) => { const x = findRoute({ from: f, to: t, budget: 60 }, o?.kind === "swim" ? swimWorld(SW(), pond) : SW()); return x.ok || (x.why === "far" && x.route) ? { ok: true, route: x.route, cost: x.cost } : { ok: false, reason: routeWords(x, t, 25, o?.kind) }; };
  const sctx = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }], targets: { E1: { name: "E1", square: [8, 2], size: 1, elev: 0 } }, me: { square: [2, 2], size: 1, elev: 0 }, speed: 25, flySpeed: 0, swimSpeed: 0, cantMove: null, route: sroute, waterAt: wk, waterIn: wk };
  let q = checkPlan({ steps: [{ do: "swim", to: [5, 2] }] }, sctx); check("swim: calm water, no swim Speed, 15 ft", q.ok && q.steps[0].cost === 15 && !q.steps[0].dc && q.steps[0].water === "calm" && /automatic critical success/.test(describeStep(q.steps[0])), q.reason ?? JSON.stringify(q.steps));
  q = checkPlan({ steps: [{ do: "swim", to: [5, 0] }] }, { ...sctx, me: { ...sctx.me, square: [2, 4] } }); check("swim: calm water beyond 15 ft refused", !q.ok && /at most 15 ft in calm water/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [6, 2] }] }, { ...sctx, me: { ...sctx.me, square: [4, 2] } }); check("swim: flowing water needs a check, 10 ft", q.ok && q.steps[0].dc === SWIM_DC && q.steps[0].water === "flowing" && /DC 15/.test(describeStep(q.steps[0])), q.reason ?? JSON.stringify(q.steps));
  q = checkPlan({ steps: [{ do: "swim", to: [7, 2] }] }, { ...sctx, me: { ...sctx.me, square: [4, 2] } }); check("swim: flowing beyond 10 ft refused", !q.ok && /at most 10 ft in flowing water/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [7, 2] }, { do: "strike", item: "jaws", target: "E1" }] }, { ...sctx, swimSpeed: 25, me: { ...sctx.me, square: [3, 2] } }); check("swim: a swim Speed goes its Speed with no check, out onto the bank, then bites", q.ok && !q.steps[0].dc && q.steps[0].out && /climbing out/.test(describeStep(q.steps[0])), q.reason ?? JSON.stringify(q.steps));
  q = checkPlan({ steps: [{ do: "swim", to: [6, 0] }] }, { ...sctx, swimSpeed: 10, me: { ...sctx.me, square: [3, 4] } }); check("swim: beyond a swim Speed refused", !q.ok && /more than its swim Speed of 10 ft/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "stride", to: [5, 2] }] }, { ...sctx, me: { ...sctx.me, square: [4, 2] } }); check("swim: no Stride in deep water", !q.ok && /moves by Swim/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "step", to: [7, 2] }] }, { ...sctx, me: { ...sctx.me, square: [6, 2] } }); check("swim: no Step out of deep water", !q.ok && /moves by Swim/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [4, 2] }] }, { ...sctx, me: { ...sctx.me, square: [4, 2] } }); check("swim: treading water is 0 ft", q.ok && q.steps[0].cost === 0 && /Treads water/.test(describeStep(q.steps[0])), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [2, 2] }] }, sctx); check("swim: nothing to tread on land", !q.ok && /isn't in deep water/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [1, 2] }] }, sctx); check("swim: land to land is no Swim", !q.ok && /nothing to swim in/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [4, 2] }] }, { ...sctx, prone: true }); check("swim: not while prone", !q.ok && /prone/.test(q.reason));
  q = checkPlan({ steps: [{ do: "swim", to: [4, 2] }] }, { ...sctx, cantMove: "it is grabbed." }); check("swim: grabbed can't", /grabbed/.test(q.reason));
  q = checkPlan({ steps: [{ do: "swim", to: [4, 2] }, { do: "swim", to: [5, 2] }, { do: "swim", to: [7, 2] }] }, sctx); check("swim: three Swims, the last onto the bank", q.ok && q.steps.length === 3 && q.steps[2].out, q.reason);
  check("swim: done words", doneStep({ do: "swim", from: [2, 2], to: [5, 2] }, { moved: { to: [5, 2] }, swum: true }).result === "arrived" && /no progress/.test(doneStep({ do: "swim", from: [4, 2], to: [6, 2] }, { swim: { degree: 1 } }).result) && doneStep({ do: "swim", from: [4, 2], to: [4, 2] }, { swum: true }).result === "trod water");
  const done = (steps, log = {}, extra = {}) => ({ state: "done", steps, log, ...extra });
  check("sink: in deep water with no Swim", shouldSink({ requests: [done([{ do: "strike" }])], wet: true }) === "sink");
  check("sink: a successful Swim keeps it up", shouldSink({ requests: [done([{ do: "swim" }], { 0: { swum: true } })], wet: true }) === null);
  check("sink: a failed Swim doesn't", shouldSink({ requests: [done([{ do: "swim" }], { 0: { swim: { degree: 1 } } })], wet: true }) === "sink");
  check("sink: not on land, not dead, not backwards, not twice, not the GM's turn, not after a Delay", shouldSink({ requests: [done([])], wet: false }) === null && shouldSink({ requests: [done([])], wet: true, dead: true }) === null && shouldSink({ requests: [done([])], wet: true, forward: false }) === null && shouldSink({ requests: [done([], {}, { sank: true })], wet: true }) === null && shouldSink({ requests: [{ state: "manual", steps: [] }], wet: true }) === null && shouldSink({ requests: [done([{ do: "delay" }], {}, { delayed: true })], wet: true }) === null);
  check("swim: step kind, cost, plan keeps it, prompt explains it", STEP_KINDS.includes("swim") && COSTS.swim === 1 && cleanPlan({ steps: [{ do: "swim", to: [1, 1] }] }).plan?.steps[0].to?.[0] === 1 && /"do": "swim"/.test(promptText()) && /sink/.test(promptText()));
  check("swim: packet says it is swimming", packetOf({ you: { swimming: "calm" } }).you.swimming === "calm");
  /* the review's findings (0.14.0) */
  r = findRoute({ from: [1, 2], to: [4, 2], size: 2, budget: 40 }, swimWorld(SW(), pond)); check("swim: a Large creature swims in from the bank", r.ok && r.cost === 15, JSON.stringify(r));
  r = findRoute({ from: [4, 2], to: [7, 2], size: 2, budget: 40 }, swimWorld(SW(), pond)); check("swim: a Large creature climbs out", r.ok && r.cost === 15, JSON.stringify(r));
  r = findRoute({ from: [4, 2], to: [9, 2], size: 2, budget: 40 }, swimWorld(SW(), pond)); check("swim: a Large creature still can't swim across dry land", !r.ok && r.why === "noway", JSON.stringify(r));
  const lk = sq => waterUnder(sq, 2, (i, j) => pond(i, j) ? "calm" : null), lin = sq => waterUnder(sq, 2, (i, j) => pond(i, j) ? "calm" : null, true);
  check("swim: water under a half-wet footprint", lk([2, 2]) === null && lin([2, 2]) === "calm" && lk([3, 2]) === "calm" && lin([0, 2]) === null);
  const lroute = (f, t, before, o) => { const x = findRoute({ from: f, to: t, size: 2, budget: 60 }, o?.kind === "swim" ? swimWorld(SW(), pond) : SW()); return x.ok || (x.why === "far" && x.route) ? { ok: true, route: x.route, cost: x.cost } : { ok: false, reason: routeWords(x, t, 25, o?.kind) }; };
  q = checkPlan({ steps: [{ do: "swim", to: [2, 2] }] }, { ...sctx, swimSpeed: 25, me: { square: [1, 2], size: 2, elev: 0 }, route: lroute, waterAt: lk, waterIn: lin }); check("swim: Large one square half into the water is a Swim", q.ok, q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [4, 2] }, { do: "swim", to: [7, 2] }] }, { ...sctx, swimSpeed: 25, me: { square: [1, 2], size: 2, elev: 0 }, route: lroute, waterAt: lk, waterIn: lin }); check("swim: Large in then out", q.ok && !q.steps[0].out && q.steps[1].out, q.reason);
  q = checkPlan({ steps: [{ do: "stride", to: [1, 2] }] }, { ...sctx, flySpeed: 40, me: { ...sctx.me, square: [4, 2], elev: 20 } }); check("swim: a flier above the water is told to Fly", !q.ok && /moves by Fly/.test(q.reason), q.reason);
  check("swim: unknown distance words", routeWords({ ok: false, why: "far", cost: null }, [9, 9], 20, "swim") === "[9, 9] is farther than one Swim can go.");
  check("sink: not after a Fly landed it in the water", shouldSink({ requests: [done([{ do: "strike" }, { do: "fly" }], { 0: { applied: true }, 1: { started: true, moved: { to: [4, 2] } } })], wet: true }) === null && shouldSink({ requests: [done([{ do: "fly" }, { do: "strike" }], { 0: { started: true, moved: { to: [4, 2] } }, 1: { started: true } })], wet: true }) === "sink");
  check("swim: a success not moved yet isn't 'no progress'", !/no progress/.test(doneStep({ do: "swim", from: [4, 2], to: [5, 2] }, { swim: { degree: 2 } }).result));
  /* a wide river: deep water 8 squares either side of its line is still flowing; a pool away from it is calm */
  const riverDeep = (i, j) => (i >= 0 && i < 30 && j >= 2 && j <= 18) || (i >= 40 && i <= 42 && j >= 5 && j <= 7);
  const rk = waterKinds(riverDeep, { things: { placed: [] }, lines: [{ kind: "river", squares: Array.from({ length: 30 }, (_, i) => [i, 10]) }] });
  check("swim: a wide river's edges flow, a separate pool is calm", rk(5, 2) === "flowing" && rk(5, 18) === "flowing" && rk(41, 6) === "calm" && rk(35, 6) === null);
  const g = groundAround({ cols: 6, rows: 1, idx: (x, y) => y * 6 + x, blocked: [0, 0, 0, 0, 0, 0], costs: [2, 2, 2, 1, 0, 0], cover: [0, 0, 0, 0, 0, 0] }, [3, 0], 3, .3, null, x => x === 0 ? "calm" : x === 1 ? "flowing" : null);
  check("swim: ground letters W, R and D", g.rows[0] === "WRDd..", JSON.stringify(g.rows));
  const hl = (rec, step = { do: "swim", from: [4, 2], to: [5, 2] }) => stepResult(step, rec, { card: () => ({ total: 18 }), nameOf: x => x });
  check("swim: history lines", /no progress/.test(JSON.stringify(hl({ swim: { dc: 15, degree: 1 }, moved: { to: [4, 2] } }))) && !/no progress/.test(JSON.stringify(hl({ swim: { dc: 15, degree: 2 } }))) && /trod water/.test(JSON.stringify(hl({ swum: true, moved: { to: [4, 2] } }, { do: "swim", from: [4, 2], to: [4, 2] }))), JSON.stringify(hl({ swim: { dc: 15, degree: 2 } })));
}
/* Climb and Release (0.15.0): Rhea, 2026-11-08: trees, height by size, hands by the rule; Player Core Climb (Actions ID 2374), climb Speed (Rules ID 2349), Release (ID 2300) */
{
  check("climb: tree heights from the trunk", treeTop(0.48) === 15 && treeTop(0.78) === 15 && treeTop(1.28) === 20 && treeTop(1.6) === 25 && treeTop(2.4) === 30 && treeTop(3.12) === 35 && treeTop(0) === 10 && treeTop(9) === 40 && treeTop(undefined) === 20);
  check("climb: distance without a climb Speed", climbDistance(25, 2) === 5 && climbDistance(25, 3) === 10 && climbDistance(30, 2) === 5 && climbDistance(40, 2) === 10 && climbDistance(60, 2) === 15 && climbDistance(25, 1) === 0 && climbDistance(25, 0) === 0);
  const T = [{ at: [4, 4], top: 15 }, { at: [6, 4], top: 25 }, { at: [10, 10], top: 30 }];
  check("climb: trees beside a square", JSON.stringify(treesBeside([5, 5], 1, T).map(t => t.at)) === "[[6,4],[4,4]]" && treesBeside([8, 8], 1, T).length === 0 && treesBeside([8, 8], 2, T).length === 1 && treesBeside([9, 9], 1, T)[0]?.top === 30 && treesBeside([4, 4], 1, T)[0]?.at[0] === 4);
  check("climb: a Large creature's footprint reaches further", treesBeside([7, 2], 2, T).map(t => t.top).join() === "25");
  const cctx = (o = {}) => ({ actions: 3, strikes: [{ id: "dogslicer", name: "Dogslicer", reach: 5, weapon: "dogslicer" }, { id: "shortbow", name: "Shortbow", ranged: true, maxRange: 300 }], targets: { E1: { name: "E1", square: [5, 9], size: 1, elev: 0 } },
    me: { square: [5, 5], size: 1, elev: 0 }, speed: 25, flySpeed: 0, swimSpeed: 0, climbSpeed: 0, cantMove: null, route: () => ({ ok: true, route: [[5, 5], [5, 6]], cost: 5 }), waterAt: () => null, waterIn: () => null,
    treesAt: sq => treesBeside(sq, 1, T), onTree: null, holding: [], ...o });
  let q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx());
  check("climb: up 5 ft with a check", q.ok && q.steps[0].dc === CLIMB_DC && CLIMB_DC === 15 && q.steps[0].height === 5 && q.steps[0].fromHeight === 0 && JSON.stringify(q.steps[0].tree) === "[6,4]" && q.steps[0].top === 25 && /Athletics check, DC 15/.test(describeStep(q.steps[0])), q.reason ?? JSON.stringify(q.steps));
  q = checkPlan({ steps: [{ do: "climb", height: 10 }] }, cctx()); check("climb: 10 ft refused without a climb Speed", !q.ok && /at most 5 ft/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 5 }, { do: "climb", height: 10 }, { do: "climb", height: 15 }] }, cctx()); check("climb: three Climbs, 15 ft", q.ok && q.steps[2].fromHeight === 10, q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 20 }] }, cctx({ climbSpeed: 20 })); check("climb: a climb Speed goes its Speed with no check", q.ok && !q.steps[0].dc && q.steps[0].climbSpeed === 20 && /no check/.test(describeStep(q.steps[0])), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 30 }] }, cctx({ climbSpeed: 40 })); check("climb: not above the tree's top", !q.ok && /about 25 ft tall/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 10, tree: [4, 4] }] }, cctx({ climbSpeed: 20 })); check("climb: names a tree beside it", q.ok && q.steps[0].top === 15, q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 5, tree: [10, 10] }] }, cctx()); check("climb: a tree not beside it", !q.ok && /isn't beside it/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx({ me: { square: [8, 0], size: 1, elev: 0 } })); check("climb: no tree, no Climb", !q.ok && /no tree beside it/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 7 }] }, cctx()); check("climb: height in 5-ft steps", !q.ok && /steps of 5/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb" }] }, cctx()); check("climb: needs a height", !q.ok && /needs "height"/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 0 }] }, cctx()); check("climb: already there", !q.ok && /already 0 ft up/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx({ prone: true })); check("climb: not while prone", !q.ok && /prone/.test(q.reason));
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx({ cantMove: "it is grabbed, so it can't use move actions." })); check("climb: grabbed can't", /grabbed/.test(q.reason));
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx({ waterAt: () => "calm" })); check("climb: not from deep water", !q.ok && /moves by Swim/.test(q.reason), q.reason);
  /* hands, by the rule */
  const held = { holding: [{ id: "dogslicer", name: "Dogslicer" }] };
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx(held)); check("climb: hands must be free", !q.ok && /both hands free/.test(q.reason) && /Dogslicer/.test(q.reason) && /release/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "release", item: "dogslicer" }, { do: "climb", height: 5 }, { do: "strike", item: "shortbow", target: "E1" }] }, cctx(held));
  check("climb: release then climb then shoot", q.ok && q.steps[0].do === "release" && q.steps[0].itemName === "Dogslicer" && spentBy(q.steps).actions === 2 && COSTS.release === 0, q.reason);
  q = checkPlan({ steps: [{ do: "release", item: "Dogslicer" }, { do: "strike", item: "dogslicer", target: "E1" }] }, cctx({ ...held, targets: { E1: { name: "E1", square: [5, 6], size: 1, elev: 0 } } }));
  check("release: no Strike with what it let go of", !q.ok && /on the ground \(released earlier/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "strike", item: "dogslicer", target: "E1" }] }, cctx({ strikes: [{ id: "dogslicer", name: "Dogslicer", reach: 5, dropped: true }], targets: { E1: { name: "E1", square: [5, 6], size: 1, elev: 0 } } }));
  check("release: no Strike with a weapon on the ground", !q.ok && /Dogslicer is on the ground,/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "release", item: "axe" }] }, cctx(held)); check("release: only what it holds", !q.ok && /it holds Dogslicer/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "release", item: "dogslicer" }] }, cctx({ ...held, cantAttack: "it is restrained, so it can't attack." })); check("release: restrained can't", !q.ok && /restrained/.test(q.reason));
  q = checkPlan({ steps: [{ do: "release", item: "dogslicer" }] }, cctx({ ...held, grabbed: true })); check("release: grabbed asks a flat check", q.ok && q.steps[0].flat === 5 && /flat check/.test(describeStep(q.steps[0])));
  q = checkPlan({ steps: [{ do: "release", item: "dogslicer" }, { do: "release", item: "dogslicer" }] }, cctx(held)); check("release: not twice", !q.ok && /holds nothing/.test(q.reason), q.reason);
  /* up a tree */
  const up = cctx({ me: { square: [5, 5], size: 1, elev: 15 }, onTree: { at: [6, 4], top: 25 } });
  q = checkPlan({ steps: [{ do: "stride", to: [5, 6] }] }, up); check("climb: no Stride up a tree", !q.ok && /up the tree at \[6, 4\]/.test(q.reason) && /"height": 0/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "step", to: [5, 6] }] }, up); check("climb: no Step up a tree", !q.ok && /can't Step there/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "swim", to: [5, 6] }] }, up); check("climb: no Swim up a tree", !q.ok && /can't Swim there/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "drop-prone" }] }, up); check("climb: no Drop Prone up a tree", !q.ok && /15 ft up/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 10 }, { do: "climb", height: 5 }, { do: "climb", height: 0 }, { do: "stride", to: [5, 6] }] }, { ...up, actions: 4 }); check("climb: down, then Stride", q.ok && q.steps[2].height === 0 && /to the ground/.test(describeStep(q.steps[2])), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 10, tree: [4, 4] }] }, up); check("climb: only the tree it is up", !q.ok && /only Climb that one/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "strike", item: "shortbow", target: "E1" }] }, up); check("climb: shoots from up a tree", q.ok, q.reason);
  q = checkPlan({ steps: [{ do: "strike", item: "dogslicer", target: "E1" }] }, { ...up, targets: { E1: { name: "E1", square: [5, 6], size: 1, elev: 0 } } }); check("climb: 15 ft up is out of a 5-ft reach", !q.ok && /out of reach/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, cctx({ me: { square: [5, 5], size: 1, elev: 10 } })); check("climb: up on something that isn't its tree", !q.ok && /isn't a tree it climbed/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "fly", to: [5, 6], height: 10 }, { do: "climb", height: 0 }] }, { ...up, flySpeed: 40 }); check("climb: a Fly off the tree leaves it", !q.ok && /up in the air/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "stride", to: [5, 6] }] }, { ...up, flySpeed: 40 }); check("climb: a flier up a tree is told it can Fly off", !q.ok && /Fly off/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "take-cover" }, { do: "climb", height: 5 }, { do: "take-cover" }] }, cctx({ nearCover: () => true })); check("climb: leaving its square up ends Take Cover", q.ok, q.reason);
  check("climb: reveals a hidden monster", revealsBefore({ do: "climb" }) && revealsBefore({ do: "release" }));
  /* falling and the resume rule */
  const done = (steps, log = {}) => ({ state: "done", steps, log });
  check("climb: a flier up a tree holds on", shouldFall({ requests: [done([{ do: "strike" }])], height: 15, flies: true, clinging: true }) === null && shouldFall({ requests: [done([{ do: "strike" }])], height: 15, flies: true }) === "fall");
  const st = { do: "climb", height: 5, dc: 15 };
  check("climb: next stage", nextClimb({}, st, 0) === "roll" && nextClimb({ climbStarted: true }, st, 0) === "ask" && nextClimb({ climbStarted: true, climb: { degree: 2 } }, st, 0) === "move" && nextClimb({ climb: { degree: 1 } }, st, 0) === "next" && nextClimb({ climb: { degree: 0 }, fell: { from: 0 } }, st, 0) === "next" && nextClimb({ climb: { degree: 2 }, started: true }, st, 5) === "arrived" && nextClimb({ climb: { degree: 2 }, started: true }, st, 0) === "ask" && nextClimb({}, { do: "climb", height: 20, climbSpeed: 20 }, 0) === "move" && nextClimb({ moved: { elev: 5 } }, st, 5) === "next");
  check("climb: done words", climbResult(st, { climb: { degree: 2 }, moved: { elev: 5 } }) === "arrived, 5 ft up" && /no progress/.test(climbResult(st, { climb: { degree: 1 } })) && /fell 10 ft, took 5 damage and landed prone/.test(climbResult(st, { fell: { from: 10, damage: 5, prone: true } })) && climbResult({ do: "climb", height: 0 }, { moved: { elev: 0 } }) === "back on the ground" && doneStep(st, { moved: { elev: 5 } }).result === "arrived, 5 ft up" && doneStep({ do: "release", itemName: "Dogslicer" }, { dropped: true }).result === "dropped it");
  check("climb: step kinds, costs, the plan keeps tree and height, the prompt explains both", STEP_KINDS.includes("climb") && STEP_KINDS.includes("release") && COSTS.climb === 1 && cleanPlan({ steps: [{ do: "climb", height: 10, tree: [3, 4] }, { do: "release", item: "dogslicer" }] }).plan?.steps[0].tree?.[1] === 4 && cleanPlan({ steps: [{ do: "climb", height: 10 }] }).plan?.steps[0].height === 10 && /"do": "climb"/.test(promptText()) && /"do": "release"/.test(promptText()) && /off-guard while up a tree/.test(promptText()));
  check("climb: a bad tree square is refused by the cleaner", !cleanPlan({ steps: [{ do: "climb", height: 5, tree: [1] }] }).ok);
  const hl = (step, rec) => JSON.stringify(stepResult(step, rec, { card: () => ({ total: 17 }), nameOf: x => x }));
  check("climb: history lines", /Athletics 17 vs DC 15: success/.test(hl(st, { climb: { dc: 15, degree: 2, message: "m1" }, moved: { elev: 5 } })) && /arrived, 5 ft up/.test(hl(st, { climb: { dc: 15, degree: 2 }, moved: { elev: 5 } })) && /climb Speed, no check/.test(hl({ do: "climb", height: 20, climbSpeed: 20 }, { moved: { elev: 20 } })) && /dropped its Dogslicer/.test(hl({ do: "release", itemName: "Dogslicer" }, { dropped: true })) && !/\(a critical failure\)/.test(hl(st, { climb: { dc: 15, degree: 0, message: "m1" }, fell: { from: 10, damage: 5, prone: true } })));
  check("climb: packet carries climb, holding and dropped", (() => { const p = packetOf({ you: { climb: { trees: [{ at: [1, 2], top: 20 }], up: { tree: [1, 2], top: 20 } }, holding: [{ id: "dogslicer", name: "Dogslicer" }], dropped: ["Shortbow"] } }).you; return p.climb.up.top === 20 && p.holding[0].id === "dogslicer" && p.dropped[0] === "Shortbow"; })());
}
/* the 0.15.0 review's findings */
{
  const cl = { do: "climb", fromHeight: 0, height: 5, dc: 15 };
  check("climb review: a Climb that moved ends Take Cover", endsCover2([{ do: "take-cover" }, cl], { 0: { covered: true }, 1: { moved: { elev: 5 } } }) && endsCover2([cl], { 0: { climb: { degree: 0 }, fell: { from: 0 } } }) && !endsCover2([cl], { 0: { climb: { degree: 1 } } }));
  check("climb review: a Fly up on its own square ends Take Cover", endsCover2([{ do: "fly", from: [1, 1], to: [1, 1], fromHeight: 0, height: 10 }], { 0: { moved: { to: [1, 1], elev: 10 } } }) && !endsCover2([{ do: "fly", from: [1, 1], to: [1, 1], fromHeight: 10, height: 10 }], { 0: { moved: { to: [1, 1], elev: 10 } } }));
  check("climb review: a fall begun before a reload asks", nextClimb({ climbStarted: true, climb: { degree: 0 }, falling: { from: 10 } }, cl, 10) === "ask" && /not confirmed/.test(climbResult(cl, { climb: { degree: 0 }, falling: { from: 10 } })));
  const done = steps => ({ state: "done", steps, log: {} });
  check("climb review: a dead flier up a tree still drops", shouldFall({ requests: [done([{ do: "strike" }])], height: 15, flies: true, clinging: true, dead: true }) === "drop");
  check("climb review: a failed Climb's re-plan words", describeChange({ who: "me", what: "noClimb", height: 5 }) === "It failed its Athletics check to Climb and made no progress (still 5 ft up)." && /still on the ground/.test(describeChange({ who: "me", what: "noClimb", height: 0 })));
  const q = checkPlan({ steps: [{ do: "climb", height: 5 }] }, { actions: 3, strikes: [], targets: {}, me: { square: [1, 1], size: 1, elev: 0 }, speed: 25, holding: [], treesAt: null });
  check("climb review: no tree info says why", !q.ok && /can't work out moves here/.test(q.reason), q.reason);
  check("climb review: the prompt's distance at 60", /15 at 60/.test(promptText()));
}

/* Burrow (0.16.0): Rhea, 2026-11-08: soil, not rock (crag and solid features are rock); unseen while below; Angel judges maps the module can't read.
   Player Core Burrow (Actions ID 2310), burrow Speed (Rules ID 2348), tremorsense (Rules ID 2413), line of effect (Rules ID 2382) */
{
  /* the rock map */
  const terrain = new Array(100).fill(0); terrain[0] = 8; terrain[99] = 9;
  const rock = rockSquares({ grids: { terrain }, things: { outcrops: [{ at: [5, 5], r: 7 }], rocks: [{ at: [2, 8], r: 4, climb: true }, { at: [8, 2], r: 3, climb: false }], stones: [{ at: [0, 9] }], ruins: [{ from: [7, 7], to: [9, 7] }], caves: [{ at: [9, 0] }] } }, 10, 10);
  const R = (i, j) => !!rock[j * 10 + i];
  check("burrow: crag is rock, snow isn't", R(0, 0) && !R(9, 9));
  check("burrow: an outcrop's squares within its radius", R(5, 5) && R(6, 5) && R(5, 4) && !R(7, 5) && R(6, 6) === (Math.hypot(1, 1) <= 1.4));
  check("burrow: a big boulder is rock, a small one isn't", R(2, 8) && !R(8, 2) && !R(3, 9));
  check("burrow: standing stones and ruin walls", R(0, 9) && R(7, 7) && R(8, 7) && R(9, 7) && !R(8, 8));
  check("burrow: a cave mouth and its face", R(9, 0) && R(8, 1) && R(7, 0) && !R(6, 0));
  check("burrow: no read, no rock", rockSquares(null, 4, 4).every(v => v === 0));
  /* the world below ground */
  const soil = (i, j) => !(i === 4 && j <= 3);   /* a rock wall at column 4, rows 0-3 */
  const BW = () => burrowWorld({ cols: 10, rows: 10, terrain: (i, j) => (i === 6 && j === 6 ? null : 1), blocked: (i, j) => i === 2 && j === 2, creature: () => "enemy", wall: () => false }, soil);
  let r = findRoute({ from: [3, 1], to: [5, 1], budget: 60 }, BW()); check("burrow: around a rock wall, under its foot", r.ok && r.route.every(([i, j]) => !(i === 4 && j <= 3)), JSON.stringify(r));
  r = findRoute({ from: [0, 0], to: [3, 0], budget: 30 }, BW()); check("burrow: under creatures and difficult ground at plain cost", r.ok && r.cost === 15, JSON.stringify(r));
  r = findRoute({ from: [3, 1], to: [4, 1], budget: 30 }, BW()); check("burrow: never into rock", !r.ok && r.why === "terrain" && /rock or deep water/.test(routeWords(r, [4, 1], 20, "burrow")), JSON.stringify(r));
  r = findRoute({ from: [1, 1], to: [3, 3], budget: 30 }, BW()); check("burrow: trunks still stop it", r.ok && r.route.every(([i, j]) => !(i === 2 && j === 2)));
  check("burrow: depth costs", BURROW_DEPTH === 5 && burrowVertical(false, true, false) === 5 && burrowVertical(true, false, true) === 5 && burrowVertical(true, true, true) === 0 && burrowVertical(false, false, true) === 10);
  /* the plan check */
  const broute = (f, t, before, o) => { if (o?.kind !== "burrow") return { ok: false, reason: "wrong kind" }; if (o.surface && t[0] === 9 && t[1] === 9) return { ok: false, reason: `another creature is at [9, 9], so it can't come up there.` }; const x = findRoute({ from: f, to: t, budget: 60 }, BW()); return x.ok ? { ok: true, route: x.route, cost: x.cost } : { ok: false, reason: routeWords(x, t, 20, "burrow") }; };
  const bctx = { actions: 3, strikes: [{ id: "jaws", name: "Jaws", reach: 5 }], targets: { E1: { name: "E1", square: [7, 1], size: 1, elev: 0 } }, me: { square: [5, 1], size: 1, elev: 0 }, speed: 25, burrowSpeed: 20, below: false, route: broute, soilAt: sq => soil(sq[0], sq[1]), occupiedAt: sq => sq[0] === 9 && sq[1] === 9, abilities: [], spells: [] };
  let q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, bctx); check("burrow: down where it stands, 5 ft", q.ok && q.steps[0].cost === 5 && q.steps[0].below && /down under the ground where it stands/.test(describeStep(q.steps[0])), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }, { do: "strike", item: "jaws", target: "E1" }] }, bctx); check("burrow: no Strike from below", !q.ok && /burrowed under the ground/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [6, 1], up: true }, { do: "strike", item: "jaws", target: "E1" }] }, bctx); check("burrow: dip under, come up next to it, bite", q.ok && q.steps[0].cost === 15 && !q.steps[0].below && /dipping under/.test(describeStep(q.steps[0])), q.reason ?? JSON.stringify(q.steps));
  q = checkPlan({ steps: [{ do: "burrow", to: [9, 1] }] }, bctx); check("burrow: beyond its burrow Speed", !q.ok && /more than its burrow Speed of 20 ft/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, { ...bctx, burrowSpeed: 0 }); check("burrow: no burrow Speed", !q.ok && /no burrow Speed/.test(q.reason));
  q = checkPlan({ steps: [{ do: "burrow", to: [4, 1] }] }, { ...bctx, me: { ...bctx.me, square: [3, 1] } }); check("burrow: never into rock (the check)", !q.ok && /rock or deep water/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [4, 1] }] }, { ...bctx, me: { ...bctx.me, square: [4, 1] } }); check("burrow: not down from rock", !q.ok && /is rock/.test(q.reason), q.reason);
  const below = { ...bctx, below: true, me: { ...bctx.me, elev: -5 } };
  q = checkPlan({ steps: [{ do: "burrow", to: [7, 1] }, { do: "burrow", to: [7, 1], up: true }] }, below); check("burrow: below, on and up in two actions", q.ok && q.steps[0].cost === 10 && q.steps[1].cost === 5 && /coming up/.test(describeStep(q.steps[1])), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [6, 1], up: true }, { do: "strike", item: "jaws", target: "E1" }] }, below); check("burrow: coming up from below ends the plan (asked again at the surface)", !q.ok && /last step/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [6, 1], up: true }] }, below); check("burrow: up alone from below", q.ok && q.steps[0].fromBelow && !q.steps[0].below, q.reason);
  check("burrow: the surfaced re-plan words", /came up out of the ground/.test(describeChange({ who: "me", what: "surfaced" })));
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, below); check("burrow: already below, nowhere to go", !q.ok && /already below ground/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "stride", to: [6, 1] }] }, below); check("burrow: no Stride below", !q.ok && /burrowed/.test(q.reason));
  q = checkPlan({ steps: [{ do: "delay", after: "E1" }] }, { ...below, fresh: true, order: { E1: "later" } }); check("burrow: Delay still allowed below", q.ok, q.reason);
  q = checkPlan({ steps: [{ do: "none" }] }, below); check("burrow: doing nothing is allowed below", q.ok);
  q = checkPlan({ steps: [{ do: "burrow", to: [9, 9], up: true }] }, { ...below, burrowSpeed: 100 }); check("burrow: can't come up on a creature it knows of", !q.ok && /another creature is at \[9, 9\]/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [9, 9], up: true }] }, { ...below, me: { ...below.me, square: [9, 9] } }); check("burrow: nor straight up into one", !q.ok && /another creature/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, { ...bctx, prone: true }); check("burrow: not while prone", !q.ok && /prone/.test(q.reason));
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, { ...bctx, me: { ...bctx.me, elev: 10 } }); check("burrow: not from up high", !q.ok && /10 ft up/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, { ...bctx, cantMove: "it is grabbed." }); check("burrow: grabbed can't", /grabbed/.test(q.reason));
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1], up: "yes" }] }, bctx); check("burrow: up is a boolean", !q.ok);
  check("burrow: cleanPlan keeps up", cleanPlan({ steps: [{ do: "burrow", to: [1, 1], up: true }] }).plan.steps[0].up === true && !("up" in cleanPlan({ steps: [{ do: "burrow", to: [1, 1], up: false }] }).plan.steps[0]) && !cleanPlan({ steps: [{ do: "burrow", up: 1 }] }).ok);
  check("burrow: is a move and a step kind", isMove({ do: "burrow" }) && STEP_KINDS.includes("burrow") && COSTS.burrow === 1);
  check("burrow: done words", doneStep({ do: "burrow", to: [5, 1], below: true }, { moved: { to: [5, 1], below: true } }).result === "arrived, below ground" && doneStep({ do: "burrow", to: [6, 1], below: false }, { moved: { to: [6, 1], below: false } }).up === true && /stopped at \[5, 1\], below ground/.test(doneStep({ do: "burrow", to: [6, 1], below: false }, { moved: { to: [5, 1], below: true } }).result));
  check("burrow: going down or up ends Take Cover", endsCover([{ do: "take-cover" }, { do: "burrow", from: [1, 1], to: [1, 1], fromBelow: false, below: true }], { 1: { moved: { to: [1, 1], below: true } } }) === true);
  check("burrow: history line", /below ground/.test(stepResult({ do: "burrow", from: [1, 1], to: [2, 1], below: true }, { moved: { to: [2, 1], cost: 5, below: true } }).text));
  /* perception underground: only tremorsense, only of creatures on the ground */
  const tremor = sensesOf([{ type: "darkvision", acuity: "precise" }, { type: "tremorsense", acuity: "imprecise", range: 30 }]);
  check("burrow: below, tremorsense finds one on the ground", perceiveOne({ senses: tremor, sees: true, heard: true, light: "bright", distance: 20, below: true }).state === "hidden");
  check("burrow: below, nothing out of tremorsense range", perceiveOne({ senses: tremor, sees: true, heard: true, light: "bright", distance: 40, below: true }).state === "unnoticed");
  check("burrow: below, nothing up in the air", perceiveOne({ senses: tremor, sees: true, heard: true, light: "bright", distance: 10, below: true, aloft: true }).state === "unnoticed");
  check("burrow: below without tremorsense, only memory", perceiveOne({ senses: sensesOf([{ type: "darkvision" }]), sees: true, heard: true, light: "bright", distance: 5, below: true, known: true }).state === "undetected");
  check("burrow: below, Visioner's stored state doesn't reach it", perceiveOne({ senses: tremor, sees: true, distance: 50, below: true, avs: true, stored: "observed" }).state === "unnoticed");
  /* the ground map marks rock for a burrower */
  const gm = buildModel({ cols: 4, rows: 2, costs: new Array(8).fill(0), occupied: new Array(8).fill(false), entrySquares: [[0, 0]] });
  const g = groundAround(gm, [0, 0], 5, undefined, null, null, (x, y) => x === 2);
  check("burrow: r on the ground map", g.rows[0] === "..r." && /r rock/.test(g.key) && !/r rock/.test(groundAround(gm, [0, 0], 5).key), JSON.stringify(g));
  /* Angel's ground judgment */
  check("burrow: ground all and none", cleanGround({ soil: "all" }).ground.soil === "all" && cleanGround({ soil: "none" }).ground.soil === "none");
  check("burrow: ground rectangles ordered", JSON.stringify(cleanGround({ soil: [[5, 6, 1, 2]] }).ground.soil) === "[[1,2,5,6]]");
  check("burrow: bad ground refused", !cleanGround({ soil: [[1, 2, 3]] }).ok && !cleanGround({ soil: "some" }).ok && !cleanGround([]).ok && !cleanGround({ soil: Array(25).fill([0, 0, 1, 1]) }).ok);
  check("burrow: cleanPlan keeps ground", cleanPlan({ steps: [{ do: "none" }], ground: { soil: [[0, 0, 3, 3]] } }).plan.ground.soil.length === 1 && !cleanPlan({ steps: [{ do: "none" }], ground: { soil: 3 } }).ok);
  check("burrow: the prompt", /"do": "burrow"/.test(promptText()) && /judgeGround/.test(promptText()) && /"soil": "none"/.test(promptText()));
  /* Earth Glide (0.17.0): through rock, stopped by walls that aren't earthen and squares they cross, deep water; where it comes up */
  const ws = wallSquares([{ ax: 4.5, ay: 0, bx: 4.5, by: 3 }], 10, 10); check("glide: a wall's squares", ws[0 * 10 + 4] && ws[2 * 10 + 4] && !ws[4 * 10 + 4] && !ws[0 * 10 + 3] && !ws[0 * 10 + 5]);
  check("glide: a wall along a square edge marks no square", wallSquares([{ ax: 5, ay: 0, bx: 5, by: 3 }], 10, 10).every(v => !v));
  check("glide: line across walls", crossesWalls([{ ax: 5, ay: 0, bx: 5, by: 3 }], [4, 1], [5, 1]) && !crossesWalls([{ ax: 5, ay: 0, bx: 5, by: 3 }], [4, 5], [5, 5]) && crossesWalls([{ ax: 5, ay: 0, bx: 5, by: 3 }], [3, 1], [4, 1], 2));
  check("glide review: a Large creature doesn't straddle a wall, whichever way it was drawn", [[{ ax: 5, ay: 0, bx: 5, by: 12 }], [{ ax: 5, ay: 12, bx: 5, by: 0 }], [{ ax: 5, ay: 0, bx: 5, by: 6 }, { ax: 5, ay: 12, bx: 5, by: 6 }]].every(ws => crossesWalls(ws, [3, 4], [4, 4], 2) && crossesWalls(ws, [2, 4], [3, 4], 2) === false && !crossesWalls(ws, [5, 4], [6, 4], 2)));
  check("glide review: a Large glider routes round a wall drawn in two pieces", (() => { const ws = [{ ax: 5, ay: 0, bx: 5, by: 6 }, { ax: 5, ay: 12, bx: 5, by: 6 }]; const w = glideWorld({ cols: 12, rows: 15, terrain: () => 0, blocked: () => false, creature: () => null, wall: () => false }, () => false, () => false, (a, b) => crossesWalls(ws, a, b, 2)); const r = findRoute({ from: [2, 4], to: [7, 4], size: 2, budget: 400 }, w); return r.ok && r.route.every(([i, j]) => j >= 12 || i + 2 <= 5 || i >= 5); })());
  const edge = [{ ax: 5, ay: 0, bx: 5, by: 3 }], deepAt = (i, j) => i === 7 && j === 7;
  const GW = (walls = edge) => glideWorld({ cols: 10, rows: 10, terrain: () => 1, blocked: () => true, creature: () => "enemy", wall: () => true }, deepAt, (i, j) => i === 2 && j === 2, (a, b) => crossesWalls(walls, a, b));
  r = findRoute({ from: [3, 1], to: [5, 1], budget: 60 }, GW()); check("glide: through rock (a blocked square in the map isn't in its way), round a wall that isn't stone", r.ok && r.route.every(([i, j]) => !(i === 2 && j === 2)) && r.route.some(([, j]) => j >= 3), JSON.stringify(r));
  r = findRoute({ from: [3, 1], to: [5, 1], budget: 60 }, GW([])); check("glide: straight through when the wall is stone", r.ok && r.cost === 10, JSON.stringify(r));
  r = findRoute({ from: [6, 6], to: [7, 7], budget: 60 }, GW([])); check("glide: never into deep water", !r.ok && r.why === "terrain");
  r = findRoute({ from: [1, 1], to: [2, 2], budget: 60 }, GW([])); check("glide: never into a square something wooden crosses", !r.ok && r.why === "blocked");
  r = findRoute({ from: [0, 5], to: [3, 5], budget: 60 }, GW([])); check("glide: under creatures at plain cost", r.ok && r.cost === 15);
  const gctx = { ...bctx, glides: true, soilAt: () => true, surfaceAt: sq => !(sq[0] === 6 && sq[1] === 1) };
  q = checkPlan({ steps: [{ do: "burrow", to: [6, 1], up: true }] }, { ...gctx, below: true }); check("glide: can't come up inside rock", !q.ok && /can't come up at \[6, 1\]: that is solid rock/.test(q.reason), q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1], up: true }] }, { ...gctx, below: true, me: { square: [5, 1], size: 1, elev: 0 } }); check("glide: comes up on open floor where it is", q.ok && q.steps[0].below === false, q.reason);
  q = checkPlan({ steps: [{ do: "burrow", to: [5, 1] }] }, { ...gctx, soilAt: () => false }); check("glide: the refusal to go down says what stops it", !q.ok && /something it can't glide through/.test(q.reason), q.reason);
  check("glide: walls judgment", cleanWalls({ stone: "all" }).walls.stone === "all" && JSON.stringify(cleanWalls({ stone: [[3, 4, 1, 2]] }).walls.stone) === "[[1,2,3,4]]" && !cleanWalls({ soil: "all" }).ok && /"walls.stone"/.test(cleanWalls({ stone: 3 }).reason));
  check("glide: cleanPlan keeps walls", cleanPlan({ steps: [{ do: "none" }], walls: { stone: "none" } }).plan.walls.stone === "none" && !cleanPlan({ steps: [{ do: "none" }], walls: { stone: "x" } }).ok);
  check("glide: the prompt", /you\.burrow\.glides/.test(promptText()) && /judgeWalls/.test(promptText()) && /"stone": "none"/.test(promptText()) && /doors never count/.test(promptText()));
}
/* ---- the Change button (0.19.0) ---- */
{
  const { CHANGEABLE, NOTE_MAX, applyEdits, changeProblem, editableParts, noteForThinker } = await import("../../scripts/turn.mjs");
  const two = [{ do: "stride", to: [3, 4] }, { do: "strike", item: "jaws", target: "E1" }];
  check("ch: a ready plan can change", changeProblem({ state: "ready", steps: two, pos: 0 }) === null && changeProblem({ state: "held", steps: two, pos: 1 }) === null && changeProblem({ state: "stopped", steps: two, pos: 1, log: { 0: { started: true } } }) === null);
  check("ch: not while running", /Hold first/.test(changeProblem({ state: "running", steps: two })));
  check("ch: not without a plan", /no plan/.test(changeProblem({ state: "requested" })) && /no plan/.test(changeProblem({ state: "done", steps: two })) && /no plan/.test(changeProblem({ state: "saves", steps: two })) && /no turn/.test(changeProblem(null)));
  check("ch: nothing left", /Nothing is left/.test(changeProblem({ state: "ready", steps: two, pos: 2 })));
  check("ch: next step begun", /Step 2 was begun/.test(changeProblem({ state: "stopped", steps: two, pos: 1, log: { 1: { started: true } } })));
  check("ch: one change at a time", /already on its way/.test(changeProblem({ state: "ready", steps: two, ask: { text: "x" } })) && /already/.test(changeProblem({ state: "ready", steps: two, go: true })) && /already/.test(changeProblem({ state: "ready", steps: two, edit: { steps: [] } })));
  check("ch: changeable states", CHANGEABLE.join() === "ready,held,stopped");
  check("ch: parts", editableParts({ do: "strike", item: "jaws", target: "E1" }).join() === "target" && editableParts({ do: "stride", to: [1, 2] }).join() === "to"
    && editableParts({ do: "fly", to: [1, 2], height: 10 }).join() === "to,height" && editableParts({ do: "climb", height: 5 }).join() === "height"
    && editableParts({ do: "seek", at: [1, 2] }).join() === "at" && editableParts({ do: "spell", item: "s", toward: [1, 2] }).join() === "toward"
    && editableParts({ do: "delay", after: "M2" }).join() === "after" && editableParts({ do: "stand" }).length === 0 && editableParts({ do: "ability", item: "a" }).length === 0);
  const ed = applyEdits([{ do: "stride", to: [3, 4], why: "close in" }, { do: "strike", item: "jaws", target: "E1", why: "bite" }, { do: "strike", item: "jaws", target: "E1", why: "again" }], [{ to: [5, 6] }, { remove: true }, { target: "E2", to: [9, 9] }]);
  check("ch: edits applied", ed.length === 2 && ed[0].to.join() === "5,6" && ed[0].why === "changed by the GM" && ed[1].target === "E2" && ed[1].to === undefined && ed[1].why === "changed by the GM", JSON.stringify(ed));
  const same = applyEdits([{ do: "stride", to: [3, 4], why: "close in" }], [{ to: [3, 4] }]);
  check("ch: an unchanged step keeps its why", same[0].why === "close in" && applyEdits([{ do: "stand" }], []).length === 1 && applyEdits([{ do: "stand" }], [{ remove: true }]).length === 0);
  const src = [{ do: "stride", to: [3, 4] }]; applyEdits(src, [{ to: [7, 7] }]); check("ch: edits don't touch the plan they read", src[0].to.join() === "3,4");
  const { nameWords, planPrint } = await import("../../scripts/turn.mjs");
  const people = [{ names: ["Test Hero"], label: "E1" }, { names: ["Valeros", "Valeros (Level 7)", ...nameWords("Valeros (Level 7)")], label: null }, { names: ["Hero"], label: "E9" }, { names: ["Sod Hound"], label: "M2" }, { names: ["Ankhrav"], label: "M1" },
    { names: ["Goblin Warrior"], label: "E2" }, { names: ["Goblin Warrior"], label: "E3" }, { names: ["Wolf"], label: "E4" }, { names: ["Wolf"], label: null }, { names: ["Gamemaster"], label: null }];
  const nt = noteForThinker("  Ankhrav: go for test hero; help the Sod Hound.  ", people);
  check("ch: names become labels", nt.text === "Ankhrav: go for E1; help the M2.".replace("Ankhrav", "M1") && !nt.unknown.length && !nt.ambiguous.length, JSON.stringify(nt));
  const nu = noteForThinker("not Valeros, and not Valeros (Level 7)", people);
  check("ch: an unperceived name is kept and reported, never swapped", nu.text === "not Valeros, and not Valeros (Level 7)" && nu.unknown.join() === "Valeros,Valeros (Level 7)", JSON.stringify(nu));
  check("ch: a user's name is reported", noteForThinker("ask Gamemaster", people).unknown.join() === "Gamemaster");
  const na = noteForThinker("hit the Goblin Warrior, then the Wolf", people);
  check("ch: names that fit several creatures are reported", na.ambiguous.join() === "Goblin Warrior,Wolf" && !na.unknown.length, JSON.stringify(na));
  check("ch: whole words only", noteForThinker("Heroes and Hero", people).text === "Heroes and E9" && noteForThinker("Sod Hounds", people).text === "Sod Hounds");
  check("ch: note trimmed to its limit", noteForThinker("x".repeat(NOTE_MAX + 50)).text.length === NOTE_MAX && noteForThinker("", people).text === "");
  check("ch: name words", nameWords("Valeros (Level 7)").join() === "Valeros" && nameWords("Mira Blackwood").join() === "Mira,Blackwood" && nameWords("Al Bo").length === 0);
  check("ch: first names caught", noteForThinker("then Mira", [{ names: ["Mira Blackwood", ...nameWords("Mira Blackwood")], label: null }]).unknown.join() === "Mira");
  const pr = { pos: 1, plan: { steps: [{ do: "stand" }, { do: "strike", item: "jaws", target: "E1" }] } };
  check("ch: plan fingerprint", planPrint(pr) === planPrint(structuredClone(pr)) && planPrint(pr) !== planPrint({ ...pr, pos: 2 }) && planPrint(pr) !== planPrint({ pos: 1, plan: { steps: [{ do: "stand" }, { do: "strike", item: "jaws", target: "E2" }] } }));
  check("ch: the note in words", describeChange({ who: "gm", what: "note", text: "go for E1" }) === 'The GM asks for the rest of this turn: "go for E1"' && describeChanges([{ who: "gm", what: "note", text: "flee" }], l => "X", "Wolf").includes('"flee"'));
}
/* the history shows the GM's edits with the presses (0.19.0) */
{
  const t = { labels: { tokA: "M1", tokB: "E1" }, requests: { q1: { round: 1, combatantId: "c1", tokenId: "tokA", at: 1, state: "ready", pos: 0,
    plan: { reason: "bite", steps: [{ do: "strike", item: "jaws", target: "E1" }] }, steps: [{ do: "strike", item: "jaws", itemName: "Jaws", target: "E1", targetName: "E1" }],
    presses: { 5: { do: "Use my changes", user: "Rhea", pos: 0 } }, edits: { 6: { user: "Rhea", pos: 0, before: ["Jaws at E1."], after: ["Jaws at E1, attack 2."] } } } } };
  const h = historyOf(t, { round: 1, turn: 0, current: "c1", order: [{ id: "c1", name: "Wolf", npc: true }] }, { tokA: "Wolf", tokB: "Test Hero" });
  const lines = h[0].turns[0].parts[0].lines.map(l => l.text);
  check("history: an edit line in names after its press", lines.length === 2 && /pressed Use my changes/.test(lines[0]) && lines[1] === "Rhea changed the plan from step 1: Jaws at Test Hero, attack 2. (Was: Jaws at Test Hero.)", JSON.stringify(lines));
  const t2 = structuredClone(t); t2.requests.q1.edits = { 6: { user: "Rhea", pos: 0, before: ["Jaws at E1."], after: [] } };
  const t3 = structuredClone(t); t3.requests.q1.edits = { 6: { user: "Rhea", pos: 0, what: "change", refused: "Step 1: E1 is out of reach." } };
  check("history: a refused change says why, in names", historyOf(t3, { round: 1, turn: 0, current: "c1", order: [{ id: "c1", name: "Wolf", npc: true }] }, { tokA: "Wolf", tokB: "Test Hero" })[0].turns[0].parts[0].lines.at(-1).text === "Rhea's change wasn't used: Step 1: Test Hero is out of reach.");
  check("history: the rest taken out", /took out the rest\./.test(historyOf(t2, { round: 1, turn: 0, current: "c1", order: [{ id: "c1", name: "Wolf", npc: true }] }, { tokA: "Wolf", tokB: "Test Hero" })[0].turns[0].parts[0].lines.at(-1).text));
}
/* ---- player reactions (0.20.0) ---- */
{
  const items = [{ slug: "reactive-strike", name: "Reactive Strike", actionType: "reaction", description: "<p><strong>Trigger</strong> A creature within your reach uses a manipulate action.</p>" },
    { slug: "attack-of-opportunity", name: "Attack of Opportunity", actionType: "reaction" }, { slug: "shield-block", name: "Shield Block", actionType: "reaction" },
    { slug: "opportune-backstab", name: "Opportune Backstab", actionType: "reaction", description: "<p><strong>Trigger</strong> A creature in your melee reach is hit by an ally.</p><hr>" }, { slug: "power-attack", name: "Power Attack", actionType: "action" }];
  const rx = reactionsOf(items);
  check("rx: known and unknown, one Reactive Strike, actions left out", rx.length === 3 && rx.filter(x => x.name === "Reactive Strike").length === 1 && rx.find(x => x.slug === "opportune-backstab")?.known === false && rx.find(x => x.slug === "opportune-backstab").trigger === "A creature in your melee reach is hit by an ally.", JSON.stringify(rx));
  check("rx: trigger text", triggerOf("<p><strong>Trigger</strong> An enemy hits you with a melee Strike.</p>") === "An enemy hits you with a melee Strike." && triggerOf("<p>No trigger here</p>") === null);
  check("rx: Reactive Strike gates", ["move", "stay", "manipulate", "ranged"].every(g => fits("reactive-strike", g, { inReach: true })) && !fits("reactive-strike", "move", { inReach: false }) && !fits("reactive-strike", "attack", { inReach: true, isTarget: true }) && !fits("reactive-strike", "hit", { inReach: true, isTarget: true }));
  check("rx: Shield Block needs a raised shield and physical damage", fits("shield-block", "hit", { isTarget: true, shieldRaised: true }, { damageTypes: ["piercing"] }) && !fits("shield-block", "hit", { isTarget: true, shieldRaised: false }) && !fits("shield-block", "hit", { isTarget: true, shieldRaised: true }, { damageTypes: ["fire"] }) && fits("shield-block", "hit", { isTarget: true, shieldRaised: true }, {}) && !fits("shield-block", "hit", { isTarget: false, shieldRaised: true }));
  check("rx: Reactive Shield: melee, a shield not yet raised, the target", fits("reactive-shield", "hit", { isTarget: true, hasShield: true }, { melee: true }) && !fits("reactive-shield", "hit", { isTarget: true, hasShield: true }, { melee: false }) && !fits("reactive-shield", "hit", { isTarget: true, hasShield: true, shieldRaised: true }, { melee: true }) && !fits("reactive-shield", "hit", { isTarget: true, hasShield: false }, { melee: true }));
  check("rx: Nimble Dodge before the attack, the target only", fits("nimble-dodge", "attack", { isTarget: true }) && !fits("nimble-dodge", "attack", { isTarget: false }) && !fits("nimble-dodge", "hit", { isTarget: true }) && KNOWN["nimble-dodge"].ac === 2);
  check("rx: an unknown reaction never fits", !fits("opportune-backstab", "move", { inReach: true, isTarget: true }));
  /* a reactor at [5, 5] with 5-ft reach, and Medium movers walking past it */
  const R = [{ id: "a", pos: [5, 5], span: 1, elev: 0, reach: 5 }];
  check("rx: gate before leaving the first square in reach", JSON.stringify(routeGates([[2, 5], [3, 5], [4, 5], [4, 4], [4, 3], [4, 2]], { size: 1 }, R)) === JSON.stringify([{ k: 2, ids: ["a"] }]));
  check("rx: starting in reach asks before the first square", JSON.stringify(routeGates([[4, 5], [3, 5], [2, 5]], { size: 1 }, R)) === JSON.stringify([{ k: 0, ids: ["a"] }]));
  check("rx: ending in reach asks nothing (that square isn't left)", routeGates([[1, 5], [2, 5], [3, 5], [4, 5]], { size: 1 }, R).length === 0);
  check("rx: once per reactor per move", routeGates([[4, 4], [4, 5], [4, 6], [4, 7]], { size: 1 }, R).length === 1 && routeGates([[4, 4], [4, 5], [4, 6], [4, 7]], { size: 1 }, R, { done: ["a"] }).length === 0);
  check("rx: 10-ft reach two squares off", routeGates([[3, 5], [2, 5], [1, 5]], { size: 1 }, [{ id: "b", pos: [5, 5], span: 1, reach: 10 }])[0]?.k === 0 && routeGates([[2, 5], [1, 5]], { size: 1 }, [{ id: "b", pos: [5, 5], span: 1, reach: 10 }]).length === 0);
  check("rx: height counts (a flier 15 ft up is out of 5-ft reach)", routeGates([[4, 5], [3, 5]], { size: 1, elev: 15 }, R).length === 0 && routeGates([[4, 5], [3, 5]], { size: 1, elev: 5 }, R).length === 1);
  check("rx: two reactors, each at its own square", JSON.stringify(routeGates([[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]], { size: 1 }, [{ id: "a", pos: [3, 3], reach: 5 }, { id: "b", pos: [6, 3], reach: 5 }])) === JSON.stringify([{ k: 0, ids: ["a"] }, { k: 3, ids: ["b"] }]));
  check("rx: degrees", degreeAgainst(20, 10, 20) === 2 && degreeAgainst(19, 10, 20) === 1 && degreeAgainst(30, 10, 20) === 3 && degreeAgainst(10, 5, 20) === 0 && degreeAgainst(19, 20, 20) === 2 && degreeAgainst(22, 1, 20) === 1 && degreeAgainst(31, 20, 20) === 3 && degreeAgainst(5, 1, 30) === 0);
  check("rx: Nimble Dodge turns a bare hit into a miss", degreeAgainst(22, 12, 20) === 2 && degreeAgainst(22, 12, 22 + 1) === 1);
  check("rx: words", gateWords("move", "The Sod Hound", { reaction: "Reactive Strike" }) === "The Sod Hound is moving out of a square in your reach. React with Reactive Strike?" && gateWords("stay", "A creature", { kind: "stands up", reaction: "Reactive Strike" }) === "A creature stands up in your reach. React with Reactive Strike?" && /attacks you/.test(gateWords("attack", "X", { reaction: "Nimble Dodge" })));
  check("rx: finished", finished([{ answer: "pass" }, { answer: "done" }, { answer: "timeout" }]) && !finished([{ answer: "react" }]) && !finished([{ answer: null }]) && finished([]));
  check("rx: waiting for a reaction is a person wait", stallOf({ state: "running", since: 0, react: { key: "move:2" } }, { now: 61000 }) === null && stallOf({ state: "running", since: 0, react: { key: "move:2" } }, { now: 181000 })?.state === "reacting" && stallOf({ state: "running", since: 0 }, { now: 61000 })?.kind === "machine" && /waiting for a reaction/.test(stallWords({ state: "reacting", waited: 190000 })));
  check("rx: countdown for players' rows only (0.20.1)", untilFor([{ to: "gm" }], 20, 1000) === 0 && untilFor([{ to: "gm" }, { to: "player" }], 20, 1000) === 21000 && untilFor([{ to: "player" }], 0, 1000) === 0 && untilFor([], 20, 1000) === 0);
  check("rx: the card counts down only while a player can still answer", countingDown([{ id: "a", to: "player" }, { id: "b", to: "gm" }], {}, 5000, 1000) && !countingDown([{ id: "a", to: "player" }, { id: "b", to: "gm" }], { a: "pass" }, 5000, 1000) && !countingDown([{ id: "a", to: "player" }], {}, 5000, 6000) && !countingDown([{ id: "b", to: "gm" }], {}, 5000, 1000));
  check("rx: answer words", answerWords([{ token: "a", reaction: "Reactive Strike", answer: "done" }, { token: "b", reaction: "Shield Block", answer: "timeout" }], { a: "Valeros", b: "Kyra" }).join("|") === "Valeros used Reactive Strike|Kyra didn't answer in time (Shield Block passed)");
  /* monsters reacting on players' turns (0.21.0) */
  check("mrx: the module runs Reactive Strike under both slugs, nothing else", MONSTER_REACTIONS.includes("reactive-strike") && MONSTER_REACTIONS.includes("attack-of-opportunity") && !MONSTER_REACTIONS.includes("shield-block"));
  check("mrx: a Stride on its own turn is sure", moveTrigger({ action: "walk", squares: 3, ownTurn: true })?.sure === true && moveTrigger({ action: "walk", squares: 3 }).gate === "move");
  check("mrx: one walked square is never sure (Step or Stride)", moveTrigger({ action: "walk", squares: 1 })?.sure === false && /Step/.test(moveTrigger({ action: "walk", squares: 1 }).why));
  check("mrx: one square after a Step card is no trigger", moveTrigger({ action: "walk", squares: 1, stepped: true }) === null && moveTrigger({ action: "walk", squares: 2, stepped: true })?.sure === true);
  check("mrx: a Crawl of one square is sure (its own action)", moveTrigger({ action: "crawl", squares: 1 })?.sure === true);
  check("mrx: climb, swim, fly, burrow and leap are move actions", ["climb", "swim", "fly", "burrow", "jump"].every(a => moveTrigger({ action: a, squares: 2 })?.sure === true));
  check("mrx: teleports and no squares left are no trigger", moveTrigger({ action: "blink", squares: 4 }) === null && moveTrigger({ action: "displace", squares: 4 }) === null && moveTrigger({ action: "walk", squares: 0 }) === null);
  check("mrx: a move outside its own turn is never sure", moveTrigger({ action: "walk", squares: 3, ownTurn: false })?.sure === false && /pushed/.test(moveTrigger({ action: "walk", squares: 3, ownTurn: false }).why));
  check("mrx: an unknown movement action is never sure", moveTrigger({ action: "travel", squares: 3 })?.sure === false);
  check("mrx: a ranged attack roll triggers, a melee one doesn't", cardTrigger({ type: "attack-roll", ranged: true })?.gate === "ranged" && cardTrigger({ type: "attack-roll", ranged: true }).sure === true && cardTrigger({ type: "attack-roll", ranged: false }) === null);
  check("mrx: a spell only through its manipulate trait (Rhea)", cardTrigger({ spell: true, traits: ["concentrate", "manipulate"], name: "Ignition", type: "spell-cast" })?.gate === "manipulate" && cardTrigger({ spell: true, traits: ["concentrate"], name: "Shield" }) === null);
  check("mrx: damage and save cards trigger nothing", cardTrigger({ type: "damage-roll", traits: ["manipulate"] }) === null && cardTrigger({ type: "saving-throw", traits: ["manipulate"] }) === null);
  check("mrx: Interact's card", cardTrigger({ traits: ["manipulate"], slug: "interact", name: "Interact" })?.sure === true && cardTrigger({ traits: ["manipulate"], slug: "interact", name: "Interact" }).gate === "manipulate");
  check("mrx: Release triggers nothing", cardTrigger({ traits: ["manipulate"], slug: "release", name: "Release" }) === null);
  check("mrx: Stand and Drop Prone are move actions that leave no square", cardTrigger({ traits: ["move"], slug: "stand", name: "Stand" })?.gate === "stay" && cardTrigger({ traits: ["move"], slug: "stand" }).kind === "stood up" && cardTrigger({ traits: ["move"], slug: "drop-prone" })?.kind === "dropped prone");
  check("mrx: a Step card marks a Step, a Stride card waits for the move", cardTrigger({ traits: ["move"], slug: "step" })?.step === true && cardTrigger({ traits: ["move"], slug: "stride" }) === null && cardTrigger({ traits: ["move"], slug: "crawl" }) === null);
  check("mrx: another move-trait action in reach triggers", cardTrigger({ traits: ["move"], slug: "some-feat", name: "Some Feat" })?.gate === "stay");
  check("mrx: a potion is an Interact, an unknown consumable is unsure", cardTrigger({ consumable: "potion", name: "Healing Potion" })?.sure === true && cardTrigger({ consumable: "talisman", name: "A Talisman" })?.sure === false && cardTrigger({ consumable: true, name: "Something" })?.sure === false && cardTrigger({ consumable: "talisman", traits: ["manipulate"] })?.sure === true);
  check("mrx: a card with no traits triggers nothing", cardTrigger({ name: "Hello" }) === null && cardTrigger({}) === null);
  check("mrx: drawing, stowing and regripping are unsure Interacts", equipTrigger({ carry: "worn", hands: 0 }, { carry: "held", hands: 1 }, "Longsword")?.sure === false && /drew or picked up Longsword/.test(equipTrigger({ carry: "worn", hands: 0 }, { carry: "held", hands: 1 }, "Longsword").kind) && /put away/.test(equipTrigger({ carry: "held", hands: 1 }, { carry: "worn", hands: 0 }, "Longsword").kind) && /grip/.test(equipTrigger({ carry: "held", hands: 1 }, { carry: "held", hands: 2 }, "Longsword").kind));
  check("mrx: letting go triggers nothing", equipTrigger({ carry: "held", hands: 2 }, { carry: "held", hands: 1 }) === null && equipTrigger({ carry: "held", hands: 1 }, { carry: "dropped", hands: 0 }) === null && equipTrigger({ carry: "held", hands: 1 }, { carry: "held", hands: 1 }) === null);
  check("mrx: Prone off with no Stand card is unsure, with one it is the card's", proneOffTrigger({ ownTurn: true, stood: false })?.sure === false && proneOffTrigger({ ownTurn: true, stood: true }) === null && proneOffTrigger({ ownTurn: false }) === null);
  check("mrx: squares along waypoints", JSON.stringify(squaresAlong([[0, 0], [2, 1], [2, 3]])) === JSON.stringify([[0, 0], [1, 1], [2, 1], [2, 2], [2, 3]]) && squaresAlong([[4, 4]]).length === 1 && squaresAlong([]).length === 0 && squaresAlong([[1, 1], [1, 1]]).length === 1);
  check("mrx: the route test finds the monster a move leaves", routeGates(squaresAlong([[4, 5], [1, 5]]), { size: 1 }, [{ id: "m", pos: [5, 5], span: 1, reach: 5 }])[0]?.k === 0 && routeGates(squaresAlong([[1, 5], [4, 5]]), { size: 1 }, [{ id: "m", pos: [5, 5], span: 1, reach: 5 }]).length === 0);
  check("mrx: the best melee Strike that reaches", reactionStrike([{ id: "bow", ranged: true, mod: 12 }, { id: "jaws", reach: 5, mod: 7 }, { id: "tail", reach: 10, mod: 5 }], 5)?.id === "jaws" && reactionStrike([{ id: "jaws", reach: 5, mod: 7 }, { id: "tail", reach: 10, mod: 5 }], 10)?.id === "tail" && reactionStrike([{ id: "bow", ranged: true, mod: 12 }], 5) === null);
  check("mrx: the card's words", offerWords({ monster: "Goblin", target: "Valeros", strike: "Dogslicer", kind: "left a square", sure: true }) === "Goblin can make a Reactive Strike (Dogslicer) at Valeros: Valeros left a square in its reach.");
  check("mrx: an unsure offer says why", /Not certain\. It moved one square/.test(offerWords({ monster: "Goblin", target: "Valeros", kind: "moved one square", sure: false, why: "It moved one square: a Step doesn't trigger this, a Stride does." })));
  { const interact = `<h4 class="action">\n    <strong>Interact</strong>        <span class="action-glyph larger">1</span>\n</h4>\n<div class="tags" data-tooltip-class="pf2e">\n        <span class="tag" data-slug="manipulate" data-tooltip="PF2E.TraitDescriptionManipulate">Manipulate</span>\n</div>`, rc = readCard(interact);
    check("mrx: PF2e's Interact card reads as a manipulate action called interact", rc.title === "Interact" && rc.slug === "interact" && rc.traits.join() === "manipulate" && rc.itemCard === false && cardTrigger({ type: null, ...rc, name: rc.title })?.gate === "manipulate");
    const stand = readCard(interact.replace("Interact", "Stand").replace(/manipulate/g, "move").replace("Manipulate", "Move"));
    check("mrx: the Stand card reads as a move action that leaves no square", stand.slug === "stand" && cardTrigger({ type: null, ...stand })?.kind === "stood up");
    check("mrx: a two-word title is sluggified", readCard(`<h4 class="action"> <strong>Drop Prone</strong></h4>`).slug === "drop-prone");
    check("mrx: a check's action comes from its option, so a Climb roll isn't a second trigger", readCard("", ["action:climb", "self:trait:human"], ["move"]).slug === "climb" && cardTrigger({ type: "skill-check", ...readCard("", ["action:climb"], ["move"]) }) === null);
    check("mrx: a spell's traits come from its origin options", readCard("", ["origin:item:type:spell", "origin:item:slug:ignition", "origin:item:trait:attack", "origin:item:trait:manipulate"]).traits.includes("manipulate") && readCard("", ["origin:item:slug:ignition"]).slug === "ignition");
    check("mrx: an item shown in chat is told from one used", readCard(`<div class="pf2e chat-card item-card" data-item-id="x"><header></header></div>`).itemCard === true && readCard(`Uses Healing Potion`).itemCard === false); }
  { const hist = historyOf({ requests: { t1: { state: "done", round: 1, turn: 0, combatantId: "w", tokenId: "tw", at: 5, steps: [], log: {} }, rx: { state: "done", round: 1, turn: 1, combatantId: "w", tokenId: "tw", turnOf: "v", at: 9, reaction: { by: "tv", kind: "left a square", auto: false }, steps: [{ do: "strike", item: "jaws", itemName: "Jaws", target: "T", targetName: "Valeros", variant: 0 }], log: { 0: { started: true, attack: { degree: 2 } } }, labels: { T: "tv" }, pos: 1 } } }, { round: 1, turn: 1, order: [{ id: "w", name: "Wolf", npc: true }, { id: "v", name: "Valeros", npc: false }] }, { tw: "Wolf", tv: "Valeros" });
    const e = hist[0]?.turns.find(x => x.reaction);
    check("mrx: the history lists a reaction as its own entry with its Strike, after the turn it happened on", !!e && e.angel === true && e.combatantId === null && e.parts.length === 1 && /Wolf: a Reactive Strike on Valeros's turn \(Valeros left a square\)/.test(e.name) && hist[0].turns.length === 2 && hist[0].turns.indexOf(e) === 1); }
  check("mrx: a reaction is never the turn's request", currentOf({ a: { state: "ready", round: 2, combatantId: "c1", reaction: { by: "t" } } }, 2, "c1") === null && currentOf({ a: { state: "ready", round: 2, combatantId: "c1" } }, 2, "c1")?.id === "a");
  check("mrx: a reaction's note isn't the last turn's note", latestNote({ a: { state: "done", at: 1, note: "turn" }, b: { state: "done", at: 2, note: "reaction", reaction: { by: "t" } } })?.note === "turn");
}
/* the group ticks (0.22.0) */
{ const R = (id, kind, o = {}) => ({ id, name: `${kind} ${id}`, kind, party: false, run: false, auto: false, ...o });
  const pack = [R("a", "Wolf", { run: true }), R("b", "Wolf"), R("c", "Goblin Warrior", { run: true, auto: true }), R("d", "Goblin Warrior", { run: true, auto: true }), R("e", "Ogre"), R("p", "Fighter", { party: true, run: true })];
  const g = tickGroups(pack), by = k => g.find(x => x.key === k);
  check("group tick: all first, then kinds of two or more", g.map(x => x.key).join("|") === "all|kind:Wolf|kind:Goblin Warrior");
  check("group tick: the party member is in no group", by("all").ids.join("") === "abcde" && !g.some(x => x.ids.includes("p")));
  check("group tick: states", by("all").run === "some" && by("all").auto === "some" && by("kind:Wolf").run === "some" && by("kind:Wolf").auto === "none" && by("kind:Goblin Warrior").run === "all" && by("kind:Goblin Warrior").auto === "all");
  check("group tick: labels", by("all").label === "All monsters" && by("kind:Wolf").label === "Wolf");
  check("group tick: one kind only gives the all row", tickGroups([R("a", "Wolf"), R("b", "Wolf")]).map(x => x.key).join() === "all");
  check("group tick: one monster gives no row", !tickGroups([R("a", "Wolf")]).length && !tickGroups([R("a", "Wolf"), R("p", "Fighter", { party: true })]).length && !tickGroups(null).length);
  check("group tick: every kind single gives only the all row", tickGroups([R("a", "Wolf"), R("b", "Ogre")]).map(x => x.key).join() === "all");
  check("group tick: a kind falls back to the name", tickGroups([{ id: "a", name: "Rat" }, { id: "b", name: "Rat" }, { id: "c", name: "Bat" }]).map(x => x.key).join("|") === "all|kind:Rat");
  check("group tick: changes only the ones that differ", groupChanges(by("all").ids, pack, "run", true).join("") === "be" && groupChanges(by("all").ids, pack, "run", false).join("") === "acd" && !groupChanges(by("kind:Goblin Warrior").ids, pack, "auto", true).length);
  check("group tick: never a party member or a stranger", !groupChanges(["p", "zz"], pack, "run", false).length && !groupChanges(null, pack, "run", true).length); }
/* canvasReady goes through Hooks.call: a handler that returns false stops every later module's handler (0.2.4 did exactly that) */
for (const f of ["main.mjs", "fight.mjs", "builder.mjs", "ui/build.mjs", "ui/turns.mjs", "ui/history.mjs", "ui/react.mjs"]) for (const m of fs.readFileSync(path.resolve(HERE, "../../scripts", f), "utf8").matchAll(/Hooks\.(?:on|once)\(["`]([^"`]+)["`],\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*([^{\s])/g)) check(`hook ${m[1]} in ${f} returns nothing`, false, m[0]);
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "layouts.json"), JSON.stringify(out));

/* ---- monster minds (0.24.0): lines, layers, the kind's key, the packet gate, the library file ---- */
{
  const M = await import(pathToFileURL(path.join(HERE, "../../scripts/minds.mjs")).href), { cleanBrief: cb } = await import(pathToFileURL(path.join(HERE, "../../scripts/brief.mjs")).href);
  const { noteForThinker: nft } = await import(pathToFileURL(path.join(HERE, "../../scripts/turn.mjs")).href);
  /* lines */
  check("mind line: her words as a string", JSON.stringify(M.cleanLine("goesFor", " the  wounded ")) === '{"text":"the wounded","by":"gm"}');
  check("mind line: a pick with words, and whose", JSON.stringify(M.cleanLine("mind", { pick: "cunning", text: "sly", by: "angel", at: 5 })) === '{"pick":"cunning","text":"sly","by":"angel","at":5}');
  check("mind line: an unknown pick is dropped, a pick on a free line too", M.cleanLine("mind", { pick: "genius" }) === null && !("pick" in M.cleanLine("fightsBy", { pick: "cunning", text: "x" })));
  check("mind line: nothing said is no line, an unknown line is none", M.cleanLine("goesFor", "  ") === null && M.cleanLine("mood", "x") === null && M.cleanLine("goesFor", null) === null);
  check("mind line: deliberately blank is kept as blank", JSON.stringify(M.cleanLine("givesUp", { blank: true, text: "ignored" })) === '{"blank":true,"by":"gm"}');
  check("mind line: caps", M.cleanLine("goesFor", "x".repeat(5000)).text.length === M.CAPS.store && M.cleanLine("notes", "x".repeat(5000)).text.length === M.CAPS.storeNotes);
  check("mind lines: the library never keeps what it knows of its enemies", !("knows" in M.cleanLines({ knows: "the wizard is weak", goesFor: "a" }, { library: true })) && "knows" in M.cleanLines({ knows: "x" }));
  /* the kind's key */
  check("kind: a compendium creature goes by its source", M.kindKey({ source: "Compendium.pf2e.pathfinder-monster-core.Actor.abc", name: "Wolf", level: 1 }) === "src:Compendium.pf2e.pathfinder-monster-core.Actor.abc");
  check("kind: Elite and Weak are the base kind", M.kindKey({ name: "Elite Bandit", level: 3, adjustment: "elite" }) === M.kindKey({ name: "Bandit", level: 2 }) && M.kindKey({ name: "Weak Bandit", level: 1, adjustment: "weak" }) === "name:bandit|2");
  check("kind: two creatures of one name and different levels differ; a world actor's own id is no source", M.kindKey({ name: "Bandit", level: 2 }) !== M.kindKey({ name: "Bandit", level: 5 }) && M.kindKey({ source: "Actor.xyz", name: "Bandit", level: 2 }) === "name:bandit|2");
  check("kind: a name that only starts with Elite keeps it", M.baseName("Elite Guard", null) === "Elite Guard" && M.baseName("Elite Guard", "elite") === "Guard");
  /* the stat block */
  const sb = (traits, int, abilities = []) => { const r = M.fromStatBlock({ traits, int, abilities }); return `${r.mind.pick}/${r.worksWith.pick}/${r.mind.by}`; };
  check("stat block: mindless", sb(["undead", "mindless"], -5) === "mindless/alone/module");
  check("stat block: an animal alone and with Pack Attack", sb(["animal"], -4) === "animal/alone/module" && sb(["animal"], -4, ["Pack Attack", "Knockdown"]) === "animal/pack/module");
  check("stat block: simple, cunning, tactician by Intelligence", sb([], -2) === "simple/follows/module" && sb([], 0) === "cunning/follows/module" && sb([], 2) === "cunning/follows/module" && sb([], 3) === "tactician/follows/module" && sb([], null) === "simple/follows/module");
  /* layers */
  const L = (from, lines, name) => ({ from, lines: M.cleanLines(lines), ...(name ? { name } : {}) });
  const people = L("people", { mind: { pick: "cunning" }, goesFor: "the smallest", fightsBy: "swarm", givesUp: "when badly hurt" }, "Goblins"), kind = L("kind", { goesFor: "whatever burns", givesUp: { blank: true } }, "Goblin Pyro");
  const stat = { from: "statblock", lines: M.fromStatBlock({ int: -1 }) }, enc = L("encounter", { notes: "hold the bridge", knows: "the basics" });
  let a = M.assemble([stat, people, kind, enc]);
  check("layers: the most specific that speaks wins, line by line", a.lines.goesFor.text === "whatever burns" && a.lines.goesFor.from === "kind" && a.lines.goesFor.name === "Goblin Pyro" && a.lines.fightsBy.from === "people" && a.lines.notes.from === "encounter" && a.lines.mind.from === "people" && a.lines.worksWith.from === "statblock");
  check("layers: a blank line stops the ones below", !("givesUp" in a.lines));
  check("layers: order given doesn't matter", JSON.stringify(M.assemble([enc, kind, people, stat])) === JSON.stringify(a));
  const own = L("own", { goesFor: "the one who killed its brother", mind: { pick: "simple" } });
  a = M.assemble([stat, people, kind, enc, own]);
  check("layers: a monster with its own profile stops following its kind's", a.own && a.lines.goesFor.from === "own" && !("fightsBy" in a.lines) && !("notes" in a.lines) && a.lines.mind.pick === "simple" && a.lines.worksWith.from === "statblock");
  a = M.assemble([stat, people, own, L("fight", { givesUp: "now: its leader fell" })]);
  check("layers: what was agreed in this fight is on top, even of its own", a.lines.givesUp.from === "fight" && a.lines.goesFor.from === "own");
  check("layers: nothing but the stat block still gives a Mind", M.assemble([stat]).lines.mind.pick === "cunning" && Object.keys(M.assemble([]).lines).length === 0);
  /* words and the packet */
  check("words: a pick's label, then her words", M.lineWords("mind", { pick: "cunning", text: "and patient" }) === "Cunning. and patient" && M.lineWords("mind", { pick: "animal", text: "" }) === "Animal" && M.lineWords("goesFor", { text: "the nearest" }) === "the nearest");
  const party = [{ names: ["Valeros", "Val"], label: null }, { names: ["Merisiel"], label: "E2" }, { names: ["Kyra"], label: "E3" }, { names: ["Kyra"], label: "E4" }];
  a = M.assemble([stat, L("encounter", { goesFor: "Merisiel first, she killed the chief", notes: "Rush Valeros at the fallen tree", fightsBy: "from the trees", knows: "Kyra heals" })]);
  let p = M.forPacket(a, party);
  check("packet: a perceived name becomes its label", p.mind.goesFor === "E2 first, she killed the chief");
  check("packet: a line naming someone it doesn't perceive is held back whole", !("notes" in p.mind) && p.held.some(h => h.key === "notes" && h.unknown.includes("Valeros")));
  check("packet: a name that fits two it perceives is held back too", !("knows" in p.mind) && p.held.some(h => h.key === "knows" && h.ambiguous.includes("Kyra")));
  check("packet: fixed order, picks' ids alongside, no name of a party member anywhere", JSON.stringify(Object.keys(p.mind)) === '["pick","mind","goesFor","fightsBy","worksWith"]' && p.mind.pick.mind === "cunning" && p.mind.pick.worksWith === "follows" && !/Valeros|Merisiel|Kyra/.test(JSON.stringify(p.mind)));
  check("packet: the same profile twice is the same bytes", JSON.stringify(M.forPacket(a, party).mind) === JSON.stringify(p.mind));
  a = M.assemble([L("encounter", { mind: { pick: "tactician", text: "trained by Valeros" } })]); p = M.forPacket(a, party);
  check("packet: a held line with a pick keeps the pick, never the words", p.mind.mind === "Trained tactician" && p.held.length === 1);
  a = M.assemble([L("encounter", { goesFor: "g".repeat(590), notes: "n".repeat(1900) })]); p = M.forPacket(a, []);
  check("packet: caps per line and for notes", p.mind.goesFor.length === M.CAPS.send && p.mind.notes.length === M.CAPS.sendNotes);
  check("packet: nothing to say is no mind", M.forPacket(M.assemble([]), party).mind === null && M.forPacket(M.assemble([L("encounter", { notes: "ask Valeros" })]), party).mind === null);
  check("the note gate still cuts a GM's note at 300 and takes a longer text when asked", nft("x".repeat(900), []).text.length === 300 && nft("x".repeat(900), [], 600).text.length === 600);
  /* warnings at save */
  let w = M.lineWarnings("Rush Valeros, his AC is 18", party);
  check("warn: a party member's name and a number off a sheet", w.names.includes("Valeros") && w.stats === true);
  w = M.lineWarnings("Swarm the smallest, never a fair fight", party);
  check("warn: nothing to warn of", w.names.length === 0 && w.stats === false);
  check("warn: 'level ground' and 'will' aren't stat words, 'level 3' and 'Will save' are", !M.lineWarnings("fights on level ground at will", []).stats && M.lineWarnings("they are level 3", []).stats && M.lineWarnings("weak Will save", []).stats);
  /* whose words: Angel never replaces hers unasked */
  let r = M.applyLines({ goesFor: { text: "hers", by: "gm" }, fightsBy: { text: "angel's", by: "angel" } }, { goesFor: "new", fightsBy: "newer", givesUp: "never" }, { by: "angel" });
  check("whose: Angel's write leaves the GM's line and says so", r.lines.goesFor.text === "hers" && r.skipped.join() === "goesFor" && r.lines.fightsBy.text === "newer" && r.lines.givesUp.by === "angel");
  r = M.applyLines({ goesFor: { text: "hers", by: "gm" } }, { goesFor: "new" }, { by: "angel", force: true, now: 77 });
  check("whose: asked to, Angel replaces it; the time is stamped", r.lines.goesFor.text === "new" && r.lines.goesFor.by === "angel" && r.lines.goesFor.at === 77 && !r.skipped.length);
  r = M.applyLines({ goesFor: { text: "hers", by: "gm" }, notes: { text: "a", by: "angel" } }, { goesFor: null, notes: null }, { by: "angel" });
  check("whose: taking a line away follows the same rule", r.lines.goesFor?.text === "hers" && !("notes" in r.lines) && r.skipped.join() === "goesFor");
  r = M.applyLines({ goesFor: { text: "angel's", by: "angel" } }, { goesFor: "mine now", knows: "x" }, { by: "gm", library: true });
  check("whose: the GM replaces anything; a library write drops knows", r.lines.goesFor.by === "gm" && !("knows" in r.lines));
  /* save to library, line by line */
  const ch = M.libraryChanges(M.cleanLines({ goesFor: "the wounded", fightsBy: "swarm", knows: "secret", notes: "n", givesUp: { blank: true } }), M.cleanLines({ fightsBy: "swarm", goesFor: "the nearest" }));
  check("library preview: only lines that differ, never knows, never a blank", ch.map(c => c.key).join() === "goesFor,notes" && ch[0].from === "the nearest" && ch[0].to === "the wounded");
  /* entries and the library file */
  const e1 = M.cleanEntry({ type: "people", name: "Goblins", lines: { mind: { pick: "cunning" }, knows: "no" } }), e2 = M.cleanEntry({ type: "kind", key: "name:goblin-pyro|1", name: "Goblin Pyro", people: "people:goblins", lines: { goesFor: "whatever burns" } });
  check("entry: a people's key from its name, a kind names its people, knows never stored", e1.key === "people:goblins" && e1.people === null && !("knows" in e1.lines) && e2.people === "people:goblins" && e1.schema === 1);
  check("entry: no name or no key is no entry; a people can't have a people", M.cleanEntry({ type: "kind", name: "x" }) === null && M.cleanEntry({ type: "people", key: "people:a" }) === null && M.cleanEntry({ type: "people", name: "A", people: "people:b" }).people === null);
  const file = M.exportData([e2, e1], 123);
  check("library file: marked, versioned, sorted", file.what === "minds-library" && file.schema === 1 && file.exported === 123 && file.entries.map(e => e.key).join() === "name:goblin-pyro|1,people:goblins");
  let plan = M.importPlan([e1], file);
  check("import: match and new", plan.ok && plan.rows.find(x => x.entry.key === e1.key).status === "match" && plan.rows.find(x => x.entry.key === e2.key).status === "new");
  plan = M.importPlan([M.cleanEntry({ ...e2, lines: { goesFor: "the nearest" } }), e1], file);
  check("import: a collision shows both", plan.rows.find(x => x.entry.key === e2.key).status === "collision" && plan.rows.find(x => x.entry.key === e2.key).mine.lines.goesFor.text === "the nearest");
  check("import: who wrote a line or when doesn't make a collision", M.importPlan([M.cleanEntry({ ...e2, lines: { goesFor: { text: "whatever burns", by: "angel", at: 9 } } })], file).rows[0].status === "match");
  check("import: a newer schema or another file is refused", !M.importPlan([], { ...file, schema: 2 }).ok && !M.importPlan([], { what: "other", entries: [] }).ok && !M.importPlan([], null).ok);
  /* the brief carries the encounter layer */
  const b = cb({ creatures: [{ name: "Goblin Warrior", count: 4, tactics: "old tactics", mind: { goesFor: "the wounded", knows: "the basics", junk: "x" }, own: { 2: { goesFor: "the dwarf" }, 9: { goesFor: "out of range" }, x: {} }, band: "warband", leader: true }, { name: "Wolf", mind: { notes: "kept" }, tactics: "ignored: the row has notes" }] });
  check("brief: a row's mind, cleaned", b.creatures[0].mind.goesFor.text === "the wounded" && b.creatures[0].mind.knows.text === "the basics" && !("junk" in b.creatures[0].mind) && b.creatures[0].mind.notes.text === "old tactics");
  check("brief: single monsters' own profiles by their number, in range only", Object.keys(b.creatures[0].own).join() === "2" && b.creatures[0].own[2].goesFor.text === "the dwarf");
  check("brief: band and leader are kept for the group releases", b.creatures[0].band === "warband" && b.creatures[0].leader === true && b.creatures[1].band === "" && b.creatures[1].leader === false);
  check("brief: a row's own notes win over old tactics text", b.creatures[1].mind.notes.text === "kept");
  check("brief: cleaning twice changes nothing", JSON.stringify(cb(b)) === JSON.stringify(b));
  /* the review's findings (0.24.0) */
  a = M.assemble([L("encounter", { goesFor: "x".repeat(225) + " Valeros is the one" })]); p = M.forPacket(a, party);
  check("review 1: a name at the cap is never sent in part", !/Valer/.test(JSON.stringify(p.mind ?? {})) && M.cleanLine("goesFor", "x".repeat(236) + " Valeros").text === "x".repeat(236));
  check("review 1: the gate reads the whole text before the cap", M.forPacket({ lines: { notes: { text: "y ".repeat(310) + "ask Valeros", by: "gm" } } }, party).held.some(h => h.key === "notes"));
  check("review 1: a cut falls at a word's end", M.cutWords("alpha beta gamma", 12) === "alpha beta" && M.cutWords("short", 12) === "short" && M.cutWords("x".repeat(30), 12).length === 12);
  check("review 2: a short first name, a surname, an ally's name word", M.namesFor("Kai Stormwind").join() === "Kai Stormwind,Kai,Stormwind" && M.namesFor("Captain Mirela", 4).includes("Mirela") && !M.namesFor("Ed of the Vale", 3).includes("the") && !M.namesFor("Ed of the Vale", 3).includes("of") && M.namesFor("Valeros (Level 7)").join() === "Valeros (Level 7),Valeros");
  p = M.forPacket(M.assemble([L("encounter", { goesFor: "Kai first; Kai's shield arm is weak" })]), [{ names: M.namesFor("Kai Stormwind"), label: null }]);
  check("review 2: a line using only the short first name is held", p.mind === null && p.held[0].unknown.includes("Kai"));
  r = M.applyLines({ goesFor: { text: "hers", by: "gm" } }, { goesFor: { text: "angel wrote", by: "gm" }, notes: { text: "n", by: "gm" } }, { by: "angel" });
  check("review 3: a line can't claim to be the GM's", r.lines.goesFor.text === "hers" && r.skipped.join() === "goesFor" && r.lines.notes.by === "angel");
  r = M.applyLines({}, { goesFor: { text: "moved", by: "angel" } }, { by: "gm", keepBy: true });
  check("review 3: lines moved between layers keep whose they were", r.lines.goesFor.by === "angel");
  const sb2 = cb(M.stampBrief({ creatures: [{ name: "Wolf", tactics: "circle", mind: { goesFor: "the wounded", fightsBy: { text: "hers", by: "gm" } }, own: { 0: { givesUp: "never" } } }] }));
  check("review 3: a chat's brief is Angel's unless it says it is hers", sb2.creatures[0].mind.goesFor.by === "angel" && sb2.creatures[0].mind.notes.by === "angel" && sb2.creatures[0].mind.fightsBy.by === "gm" && sb2.creatures[0].own[0].givesUp.by === "angel");
  check("review 8: what is stored is what is sent", M.CAPS.store === M.CAPS.send && M.CAPS.storeNotes === M.CAPS.sendNotes);
  check("review 11: a name of punctuation alone is no entry; a pick alone replaces the whole line", M.cleanEntry({ type: "people", name: "!!!" }) === null && M.applyLines({ mind: { pick: "cunning", text: "patient", by: "gm" } }, { mind: { pick: "simple" } }, { by: "gm" }).lines.mind.text === "");
}
/* ---------- fight memory (0.25.0): the notebook's rules ---------- */
{
  const Mem = await import("../../scripts/memory.mjs");
  const W = (id, o = {}) => ({ id, isActor: false, isTarget: false, actorIs: "enemy", targetIs: "self", actor: { state: "observed", label: "E1" }, target: { state: "self", label: "M1" }, knows: [], ...o });
  const stamp = { round: 2, at: 1000 };
  let out = Mem.witnessLines({ kind: "damage", amount: 12, max: 30, actor: true, iwr: [], types: [] }, [W("m1", { isTarget: true })], stamp);
  check("memory: a hit names who it saw and how bad against its own HP", out.length === 1 && out[0].id === "m1" && out[0].line.k === "hurt" && out[0].line.a === "E1" && out[0].line.s === 3 && out[0].line.r === 2 && out[0].line.at === 1000);
  check("memory: severity is against its own hit points", Mem.severity(2, 30) === 1 && Mem.severity(3, 30) === 2 && Mem.severity(9, 30) === 3 && Mem.severity(5, 0) === 3);
  out = Mem.witnessLines({ kind: "damage", amount: 5, max: 30, actor: true }, [W("m1", { isTarget: true, actor: { state: "hidden", label: null } }), W("m2", { isTarget: true, actor: { state: "undetected", label: null } })], stamp);
  check("memory: one it only heard is someone it couldn't see; one it didn't detect is something unseen", out[0].line.a === Mem.UNSEEN && out[1].line.a === Mem.UNKNOWN);
  out = Mem.witnessLines({ kind: "damage", amount: 5, max: 30, actor: false }, [W("m1", { isTarget: true })], stamp);
  check("memory: damage with no source is unsure and names nobody", out[0].line.sure === 0 && !("a" in out[0].line) || out[0].line.a == null);
  out = Mem.witnessLines({ kind: "damage", amount: 2, max: 30, actor: false, persistent: "acid" }, [W("m1", { isTarget: true })], stamp);
  check("memory: persistent damage says its kind, not who", out[0].line.p === "acid" && out[0].line.a == null && out[0].line.sure !== 0);
  /* weakness and resistance: only of an enemy it saw, from the outcome */
  const iwr = [{ category: "resistance", type: "fire", adjustment: -5 }, { category: "weakness", type: "slashing", adjustment: 5 }, { category: "immunity", type: "mental" }];
  out = Mem.witnessLines({ kind: "damage", amount: 3, max: 50, actor: true, iwr, types: ["fire"] }, [W("att", { isActor: true, actorIs: "self", targetIs: "enemy", actor: { state: "self", label: "M1" }, target: { state: "observed", label: "E2" } }), W("by", { actorIs: "ally", targetIs: "enemy", actor: { state: "observed", label: "M1" }, target: { state: "observed", label: "E2" } }), W("blind", { actorIs: "ally", targetIs: "enemy", actor: { state: "observed", label: "M1" }, target: { state: "hidden", label: null } }), W("pcside", { actorIs: "enemy", targetIs: "ally", actor: { state: "observed", label: "E9" }, target: { state: "observed", label: "M7" } })], stamp);
  check("memory: what was applied to an enemy it saw, in words", out.filter(x => x.id === "att").map(x => `${x.line.k}:${x.line.t}:${x.line.d}`).join() === "resist:E2:fire,weak:E2:slashing,immune:E2:mental" && out.filter(x => x.id === "by").length === 3);
  check("memory: nothing about a creature it couldn't see, nothing about its own side's weaknesses", !out.some(x => x.id === "blind") && !out.some(x => x.id === "pcside"));
  check("memory: no number from the card is kept", !/5|adjust/.test(JSON.stringify(out.map(x => ({ ...x.line, at: 0, r: 0 })))));
  out = Mem.witnessLines({ kind: "damage", amount: 0, max: 50, actor: true, iwr: [iwr[2]], types: ["mental"] }, [W("att", { isActor: true, actorIs: "self", targetIs: "enemy", actor: { state: "self", label: "M1" }, target: { state: "observed", label: "E2" } }), W("tgt", { isTarget: true })], stamp);
  check("memory: an attack that came to nothing is a thing it tried that failed; the target isn't hurt", out.some(x => x.id === "att" && x.line.k === "nothing" && x.line.t === "E2" && x.line.d === "mental") && !out.some(x => x.id === "tgt"));
  /* attacks: its own miss, an ally's deed */
  const att = W("a", { isActor: true, actorIs: "self", targetIs: "enemy", actor: { state: "self", label: "M1" }, target: { state: "observed", label: "E1" } }), ally = W("b", { actorIs: "ally", targetIs: "enemy", actor: { state: "observed", label: "M1" }, target: { state: "observed", label: "E1" } }), farAlly = W("c", { actorIs: "ally", targetIs: "enemy", actor: { state: "hidden", label: null }, target: { state: "observed", label: "E1" } }), foe = W("d", { isTarget: true, actorIs: "enemy", targetIs: "self", actor: { state: "observed", label: "E5" } });
  out = Mem.witnessLines({ kind: "attack", degree: 1 }, [att, ally, farAlly, foe], stamp);
  check("memory: its own miss; an ally that saw it gets a deed; one that didn't, nothing; the target, nothing", out.find(x => x.id === "a").line.k === "miss" && out.find(x => x.id === "b").line.w === "missed E1" && !out.some(x => x.id === "c" || x.id === "d"));
  out = Mem.witnessLines({ kind: "attack", degree: 3 }, [att, { ...ally, target: { state: "undetected", label: null } }], stamp);
  check("memory: a hit is no failure; a deed never names a creature the witness doesn't see", !out.some(x => x.id === "a") && out[0].line.w === `critically hit ${Mem.UNSEEN}`);
  out = Mem.witnessLines({ kind: "deed", pre: "used knockdown on", post: " (success)", hasTarget: true }, [att, ally], stamp);
  check("memory: a step's deed, for allies only", out.length === 1 && out[0].id === "b" && out[0].line.w === "used knockdown on E1 (success)");
  /* heal, cast, saved, reactions */
  const sawHeal = W("h", { actorIs: "enemy", targetIs: "enemy", actor: { state: "observed", label: "E3" }, target: { state: "observed", label: "E1" } });
  out = Mem.witnessLines({ kind: "heal" }, [sawHeal, { ...sawHeal, id: "h2", target: { state: "hidden", label: null } }, { ...sawHeal, id: "h3", actorIs: "ally" }], stamp);
  check("memory: a heal it saw land, by an enemy", out.length === 1 && out[0].line.k === "heal" && out[0].line.a === "E3" && out[0].line.t === "E1");
  out = Mem.witnessLines({ kind: "cast", slug: "breathe-fire", words: "fire, in a 15-foot cone" }, [W("c1", { actorIs: "enemy", actor: { state: "hidden", label: null }, target: {} }), W("c2", { actorIs: "enemy", actor: { state: "observed", label: "E3" }, knows: ["breathe-fire"], target: {} }), W("c3", { actorIs: "enemy", actor: { state: "undetected", label: null }, target: {} })], stamp);
  check("memory: a casting is what it visibly did; heard is someone unseen; its name only for one that has the spell", out.length === 2 && out[0].line.a === Mem.UNSEEN && !out[0].line.n && out[0].line.w === "fire, in a 15-foot cone" && out[1].line.n === "breathe-fire");
  check("memory: spell words never use the name", Mem.spellWords({ traits: ["fire", "concentrate", "manipulate"], area: { type: "cone", value: 15 } }) === "fire, in a 15-foot cone" && Mem.spellWords({ traits: ["mental"], save: "will" }) === "mental, that one creature had to resist" && /couldn't tell/.test(Mem.spellWords({ traits: ["concentrate"] })));
  out = Mem.witnessLines({ kind: "saved", item: "Breathe Fire" }, [att, ally], stamp);
  check("memory: a save against its own magic, for the caster only", out.length === 1 && out[0].line.k === "saved" && out[0].line.t === "E1" && out[0].line.i === "Breathe Fire");
  out = Mem.witnessLines({ kind: "reactive" }, [W("r1", { actorIs: "enemy", actor: { state: "observed", label: "E1" } }), W("r2", { actorIs: "enemy", actor: { state: "hidden", label: null } })], stamp);
  check("memory: who strikes at a move, for those that saw", out.length === 1 && out[0].line.k === "reactive" && out[0].line.a === "E1");
  check("memory: a gap line for everyone", Mem.witnessLines({ kind: "gap" }, [{ id: "x" }, { id: "y" }], stamp).map(x => x.line.k).join() === "gap,gap");
  /* the ladder and the words */
  const L = (k, o = {}, at = 0) => ({ k, r: 1, at, ...o });
  const book = { a01: L("hurt", { a: "E1", s: 1 }), a02: L("hurt", { a: "E1", s: 3 }), a03: L("hurt", { a: "E2", s: 2 }), a04: L("miss", { t: "E2" }), a05: L("miss", { t: "E2" }), a06: L("heal", { a: "E3", t: "E1" }), a07: L("cast", { a: "E3", w: "fire, in a 15-foot cone" }),
    a08: L("resist", { t: "E2", d: "fire" }), a09: L("weak", { t: "E1", d: "slashing" }), a10: L("reactive", { a: "E1" }), a11: L("block", { a: "E2" }), a12: L("hurt", { s: 2, sure: 0 }), a13: L("gm", { by: "gm", text: "E3 is the one giving orders" }), a14: L("deed", { a: "M2", w: "hit E1" }, 50), a15: L("deed", { a: "M2", w: "missed E1" }, 150), a16: L("deed", { a: "M3", w: "took cover" }, 200), a17: L("saved", { t: "E1", i: "Fear" }), a18: L("gap", { r: 3 }) };
  const kindsAt = rung => Mem.render(book, { rung }).remembers.map(x => x.kind).filter((k, i, a) => a.indexOf(k) === i).join();
  check("memory: Mindless nothing", Mem.forPacket(book, { rung: 0 }) === null && kindsAt(0) === "");
  check("memory: Animal knows who hurt it; Simple also what failed", kindsAt(1) === "gm,hurt,gap" && kindsAt(2) === "gm,hurt,miss,saved,gap");
  check("memory: Cunning also healers and casters; a tactician the finer things", kindsAt(3) === "gm,hurt,miss,saved,heal,cast,gap" && Mem.render(book, { rung: 4 }).unused.length <= 3 && ["reactive", "block", "weak", "resist"].every(k => Mem.render(book, { rung: 4 }).remembers.concat(Mem.render(book, { rung: 4 }).unused).some(x => x.kind === k)));
  check("memory: what it makes nothing of is kept apart, for the fold-out", Mem.render(book, { rung: 1 }).unused.map(x => x.kind).includes("heal") && !Mem.render(book, { rung: 1 }).remembers.some(x => x.kind === "heal"));
  const r3 = Mem.render(book, { rung: 3, since: 100 }), texts = r3.remembers.map(x => x.text);
  check("memory: tallies, not a log", texts.includes("E1 hurt it twice, badly once.") && texts.includes("E2 hurt it and was the last to hurt it.") && texts.includes("It keeps missing E2.") && texts.includes("E3 healed E1.") && texts.includes("E1 shrugged off its Fear.") && texts.includes("Something (unsure what) hurt it.") && texts.includes("It missed part of round 3."));
  check("memory: her line first, in her words", r3.remembers[0].text === "E3 is the one giving orders" && r3.remembers[0].by === "gm");
  check("memory: allies' deeds only since its last turn, one line an ally", r3.allies.map(x => x.text).join("|") === "M2: missed E1.|M3: took cover.");
  check("memory: miss tallies never count (no AC given away)", !/\d/.test(texts.find(t => /missing/.test(t)).replace(/[EM]\d+/g, "")));
  const pk = Mem.forPacket(book, { rung: 3, since: 100, side: { started: 4, standing: 2, down: 1, fled: 1 } });
  check("memory: the packet's notebook: unsure marked, side in words, blank parts left out", pk.remembers.includes("Something (unsure what) hurt it. (unsure)") && pk.side === "Its side, counting itself: 4 at the start, 2 standing, 1 down, 1 fled." && pk.alliesDid.length === 2 && Mem.forPacket({}, { rung: 3 }) === null && !("alliesDid" in Mem.forPacket({ a: L("hurt", { a: "E1", s: 1 }) }, { rung: 3 })));
  check("memory: alone and unhurt, no tally", Mem.sideWords({ started: 1, standing: 1 }) === null);
  check("memory: the notebook's share of a packet stays small", JSON.stringify(Mem.forPacket(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${String(i).padStart(2, "0")}`, L(["hurt", "miss", "cast", "heal", "weak"][i % 5], { a: `E${i % 7}`, t: `E${i % 6}`, s: 2, d: "fire", w: "fire, in a 30-foot cone and more words here" }, i)])), { rung: 4, side: { started: 6, standing: 4, down: 2 } })).length < 1000);
  /* crossing out, eviction, rethinking */
  const crossed = Mem.render({ ...book, a13: { ...book.a13, x: true }, a04: { ...book.a04, x: true } }, { rung: 3 });
  check("memory: a crossed-out line isn't sent and is shown crossed", !crossed.remembers.some(x => x.kind === "gm") && crossed.remembers.some(x => x.text === "It missed E2.") && crossed.crossed.length === 2 && crossed.crossed.some(x => x.text === "E3 is the one giving orders" && x.by === "gm"));
  const big = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${String(i).padStart(2, "0")}`, i === 0 ? L("gm", { by: "gm", text: "hers" }) : i === 1 ? L("deed", { a: "M2", w: "old" }, 1) : i === 2 ? L("hurt", { s: 1, sure: 0 }) : i === 3 ? L("hurt", { a: "E1", s: 1 }) : L("hurt", { a: "E1", s: 3 }, 500)]));
  check("memory: over the cap, old deeds go first, then unsure, then scratches; hers never", Mem.evict(big, 9, 100).join() === "k01,k02,k03" && Mem.evict(big, 12).length === 0 && !Mem.evict(big, 1).includes("k00"));
  check("memory: a heal or a casting by others after the plan was asked for makes it think again; its own miss never", Mem.rethinkFor({ a: L("heal", { a: "E3" }, 500), b: L("miss", { t: "E1" }, 600), c: L("cast", { a: "E3", w: "x" }, 50), d: L("cast", { a: "E2", w: "y", x: true }, 700) }, { rung: 3, after: 100 }).map(x => `${x.who}:${x.what}`).join() === "E3:sawHeal" && Mem.rethinkFor({ a: L("heal", { a: "E3" }, 500) }, { rung: 2, after: 100 }).length === 0);
  check("memory: keys sort by time", [Mem.lineKey(2000, 0, "zz"), Mem.lineKey(1000, 5, "aa"), Mem.lineKey(1000, 0, "zz")].sort().join() === [Mem.lineKey(1000, 0, "zz"), Mem.lineKey(1000, 5, "aa"), Mem.lineKey(2000, 0, "zz")].join() && !/[.\-=]/.test(Mem.lineKey(Date.now(), 3, "Ab1")));
  check("memory: a GM's line is cut to its cap and marked hers", Mem.gmLine("  E2   is  the leader ".repeat(20)).text.length <= Mem.GM_LINE_MAX && Mem.gmLine("x").by === "gm" && Mem.gmLine("x").k === "gm");
  check("memory: the saved-or-not signature follows adds and cross-outs", Mem.bookPrint({ t: { a: L("hurt") } }) !== Mem.bookPrint({ t: { a: L("hurt"), b: L("miss") } }) && Mem.bookPrint({ t: { a: L("hurt") } }) !== Mem.bookPrint({ t: { a: { ...L("hurt"), x: true } } }));
  check("memory: rungs", Mem.rungOf("mindless") === 0 && Mem.rungOf("tactician") === 4 && Mem.rungOf(undefined) === 3 && Mem.canUse("gm", 1) && !Mem.canUse("gm", 0) && !Mem.canUse("weak", 3));
  /* the packet and the change words */
  const pkt = packetOf({ you: { label: "M1" }, mind: { mind: "Cunning" }, notebook: { remembers: ["E1 hurt it."] } });
  check("memory: the packet is schema 3 with the notebook right after the mind", pkt.schema === 3 && Object.keys(pkt).slice(0, 4).join() === "schema,mind,notebook,you" && !("notebook" in packetOf({ you: {}, mind: null })));
  check("memory: the words for thinking again", /read its notebook afresh/.test(describeChange({ who: "gm", what: "notebook" })) && describeChange({ who: "E3", what: "sawHeal" }) === "E3 healed one of its own side: its notebook has it." && /^Someone it couldn't see cast a spell/.test(describeChange({ who: Mem.UNSEEN, what: "sawCast" })));
}
console.log(`${good} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
