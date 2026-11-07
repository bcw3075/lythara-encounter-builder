/* Tests with no Foundry: node tools/test/unit.mjs. Real maps come from the Survey Sheet repo's generator (SURVEY_REPO, default ../lythara-survey-sheet)
   and the sheet exports in tools/test/data (git-ignored: they hold campaign places). Writes tools/test/out/layouts.json for contact.py. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanBrief, expandCreatures } from "../../scripts/brief.mjs";
import { adjustedLevel, chooseTreasure, claimDiffers, coinsOf, ledgerLine, levelTotal, partySizeNote, toGp, treasureFor, TREASURE } from "../../scripts/budget.mjs";
import { esc, journalPages } from "../../scripts/journal.mjs";
import { buildModel, summarise } from "../../scripts/mapread.mjs";
import { hiddenNextTo, layout, nearestFree } from "../../scripts/place.mjs";
import { actionsFor, assignLabels, canTarget, describeKnows, flatDC, groundAround, healthEntries, healthWord, labelsOf, lightAt, packetOf, perceiveOne, plainText, remember, sensesOf, strikeMods, tacticsFor, visibleConditions, worse } from "../../scripts/perceive.mjs";
import { MAX_TRIES, STEP_KINDS, cleanMeta, cleanPlan, eventOut, hello, listening, live, nextSeq, pickEvent, stale, text, waitSeconds } from "../../scripts/brain.mjs";
import { CHECK_WORD, FOLLOW_UPS, SAVE_MULT, abilityCost, followUpOutcome, lastAction, nextAbility, nextSpell, spellActions, spellMultiplier, spellRange, spellTargets } from "../../scripts/turn.mjs";
import { MAX_REPLANS, changesSince, checkPlan, coverAfterTaking, currentOf, endsCover, nextCover, damageOptions, describeChange, describeChanges, absorbOwn, describeStep, doneStep, isMove, latestNote, nextAction, nextMove, nextPosture, requestBusy, situationOf, spentBy, strikeIds } from "../../scripts/turn.mjs";
import { cutShort, diagonalsIn, distanceBetween, featureNear, findRoute, findStep, footprintAt, headingOf, routeWords } from "../../scripts/move.mjs";
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
check("unknown target", /doesn't know/.test(checkPlan({ steps: [st({ item: "jaws", target: "E9" })] }, tctx).reason)); check("unknown attack", /no attack/.test(checkPlan({ steps: [st({ item: "claw", target: "E1" })] }, tctx).reason)); check("unknown step", /can't do/.test(checkPlan({ steps: [{ do: "seek" }] }, tctx).reason)); check("no plan", !checkPlan(null, tctx).ok); check("words", describeStep(pl.steps[1]) === "Jaws at Hero, attack 2.");
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
  check("unbuilt kind refused by name", /can't do "sneak"/.test(checkPlan(cleanPlan({ steps: [{ do: "sneak", to: [1, 1] }] }).plan, { actions: 3, strikes: [], targets: {} }).reason));
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
  check("prompt names no campaign", !/Lythara|Stoneclaim|Redthorn/i.test(h.prompt));
  check("prompt explains asking again", h.promptVersion === 8 && /"replan"/.test(h.prompt) && /attacksMade/.test(h.prompt) && /"done"/.test(h.prompt));
}

/* ---- moving (0.4.6) ---- */
{
  /* PF2e's distanceTo, read live 2026-11-07 for a Medium and a Large creature against a Medium one: [dx, dy, plain, with reach 10] */
  const live = [[1,0,5,5],[1,1,5,5],[2,0,10,10],[2,1,10,10],[2,2,15,10],[3,0,15,15],[3,1,15,15],[3,2,20,15],[3,3,20,15],[4,2,25,20],[4,4,30,25],[5,1,25,25],[-1,-1,5,5],[-2,-2,15,10],[0,-3,15,15],[6,3,35,30]];
  for (const size of [1, 2]) for (const [ox, oy, plain, r10] of live) {
    const a = { x: 18 + ox + (ox < 0 ? -(size - 1) : 0), y: 35 + oy + (oy < 0 ? -(size - 1) : 0), size }, b = { x: 18, y: 35, size: 1 };
    check(`distance ${size} ${ox},${oy}`, distanceBetween(a, b) === plain && distanceBetween(a, b, { reach: 10 }) === r10 && distanceBetween(b, a) === plain, `${distanceBetween(a, b)} ${distanceBetween(a, b, { reach: 10 })}`);
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
  check("hello can cast spells", hello(1).canDo.includes("spell") && hello(1).prompt.includes('"do": "spell"') && hello(1).prompt.includes("you.spells"));
}
/* canvasReady goes through Hooks.call: a handler that returns false stops every later module's handler (0.2.4 did exactly that) */
for (const f of ["main.mjs", "fight.mjs", "builder.mjs", "ui/build.mjs", "ui/turns.mjs"]) for (const m of fs.readFileSync(path.resolve(HERE, "../../scripts", f), "utf8").matchAll(/Hooks\.(?:on|once)\("([^"]+)",\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*([^{\s])/g)) check(`hook ${m[1]} in ${f} returns nothing`, false, m[0]);
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, "layouts.json"), JSON.stringify(out));
console.log(`${good} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
