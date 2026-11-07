/* A fight's turns. One named account does the work (the runner: the Claude Bridge unless the setting says otherwise), on its own page with the
   fight scene open; any other GM's browser only asks it to, through the Combat's flag. Everything is kept on that flag, so a reload or a
   summarised chat loses nothing. For now it runs Strikes, Strides, Steps, Crawls, Stand, Drop Prone and Take Cover; see claude/encounter-builder-plan.md for the rest of step 2. */
import { MAX_REPLANS, POSTURES, WORD, absorbOwn, changesSince, checkPlan, coverAfterTaking, currentOf, damageOptions, describeChanges, doneStep, endsCover, isMove, latestNote, nextAction, nextCover, nextMove, nextPosture, requestBusy, situationOf, spentBy, strikeIds } from "./turn.mjs";
import { cutShort, diagonalsIn, featureNear, findRoute, findStep, footprintAt, routeWords } from "./move.mjs";
import { actionsFor, assignLabels, canTarget, flatDC, groundAround, healthEntries, healthWord, labelsOf, lightAt, packetOf, perceiveOne, plainText, remember, sensesOf, strikeMods, tacticsFor, visibleConditions } from "./perceive.mjs";
import { readMap } from "./builder.mjs";
import { MAX_TRIES, cleanMeta, cleanPlan, eventOut, hello, listening, live, nextSeq, pickEvent, stale, text, waitSeconds } from "./brain.mjs";

const ID = "lythara-encounter-builder", WORKBENCH = "xdy-pf2e-workbench", TOOLBELT = "pf2e-toolbelt", VISIONER = "pf2e-visioner", GROUND_RADIUS = 10, STEP_MS = 20000, SETTLE_MS = 400, SCENE_MS = 30000, RESUMABLE = ["ready", "running", "held", "stopped"];
export const runnerName = () => game.settings.get(ID, "runner");
const runner = () => game.users.getName(runnerName());
const isRunner = () => game.user.isGM && runner()?.id === game.user.id;
/** What the card should say when nobody can run a turn; null when the runner is there. */
export function runnerProblem() {
  const u = runner(); if (!u) return `There's no account called ${runnerName()}, so monster turns wait. Change it in the module's settings, or play this turn yourself.`;
  return u.active ? null : `${u.name} is offline, so monster turns wait. They carry on when it's back, or play this turn yourself.`;
}
const turns = combat => ({ requests: {}, ...combat.getFlag(ID, "turns") });   /* memory can land before the first request */
export const applySetting = () => game.settings.get(ID, "applyMonsterDamage");
/* frequent writes: don't make the tracker redraw for each one. Two browsers write here, so only the change goes: a whole copy of the request could
   put back what the other just wrote. */
async function save(combat, id, change) { await combat.update({ [`flags.${ID}.turns.requests.${id}`]: change }, { render: false, [ID]: { quiet: true } }); }
const saveTurns = (combat, change) => combat.update(Object.fromEntries(Object.entries(change).map(([k, v]) => [`flags.${ID}.turns.${k}`, v])), { render: false, [ID]: { quiet: true } });
const request = (combat, id) => turns(combat).requests[id];
export const currentRequest = combat => currentOf(turns(combat).requests, combat.round, combat.combatant?.id);   /* only this turn's: an old unfinished one stays out of the way */
/** The last finished turn, if it left something for the GM to read. */
export const lastNote = combat => latestNote(turns(combat).requests);
const hostile = t => t.actor?.isOfType?.("npc");
const tokenOf = (combat, c) => c?.token ?? null;
/* a chance to stop before each stage, which the reload tests use */
function stepGate(stage, id) { return Hooks.call(`${ID}.step`, stage, id) !== false; }

/* ---------- the fight's scene ---------- */
/** The runner needs the fight on its canvas: reach, distance and targets all use it, and Visioner answers "observed" for tokens it can't find. Anyone
    activating another scene pulls this page along, so it's checked before everything that uses the canvas. */
async function ensureScene(combat) {
  for (let tries = 0; tries < 3; tries++) {   /* a view can lose to an activation already on its way, so look again */
    if (canvas.scene?.id === combat.scene?.id && canvas.ready) return true;
    try { await within(combat.scene.view(), SCENE_MS, "Opening the fight map took too long."); } catch (e) { console.error(`${ID} | scene`, e); return false; }
    await new Promise(r => setTimeout(r, 500));
  }
  return canvas.scene?.id === combat.scene?.id && canvas.ready;
}
const within = (work, ms, words) => { let timer; return Promise.race([work, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(words)), ms); })]).finally(() => clearTimeout(timer)); };

/* ---------- what a monster perceives ---------- */
/* Worked out here rather than asked of Visioner: with its automatic system off it answers "observed" for a pair with no record, walls or no walls, and a monster
   token isn't a vision source. So: core's own sight and sound tests on the fight scene, the light at the target, the monster's senses, then Visioner's record on top. */
const onFightScene = combat => canvas.ready && canvas.scene?.id === combat.scene?.id;
/** The monster's Strikes with the ids plans use. */
const strikesWithIds = actor => { const list = (actor.system.actions ?? []).filter(a => a.type === "strike"), ids = strikeIds(list.map(a => ({ slug: a.slug ?? a.item?.id, ranged: !!a.item?.isRanged }))); return list.map((a, i) => ({ id: ids[i], strike: a })); };
const conditionsOn = actor => (actor.conditions?.active ?? []).map(c => c.slug);
const squareOf = (tok, scene) => { const px = scene.grid.size, d = scene.dimensions; return [Math.round((tok.x - d.sceneX) / px), Math.round((tok.y - d.sceneY) / px)]; };
/** How many squares a side a token covers: 1 for Medium and smaller, 2 for Large... */
const sizeOf = tok => Math.max(1, Math.round(tok.width ?? 1));
const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
function lightOn(point, scene) {
  const fx = canvas.effects, sources = [];
  for (const s of fx.darknessSources ?? []) if (s.active && s.shape?.contains?.(point.x, point.y)) sources.push({ darkness: true });
  for (const s of fx.lightSources ?? []) { if (!s.active || s instanceof foundry.canvas.sources.GlobalLightSource || !s.shape?.contains?.(point.x, point.y)) continue; sources.push({ reach: Math.hypot(point.x - s.x, point.y - s.y) <= (s.data?.bright ?? 0) ? "bright" : "dim" }); }
  return lightAt({ sceneLevel: scene.lightLevel, sources });
}
function enemiesOf(scene, tok) { return scene.tokens.contents.filter(t => t.id !== tok.id && !t.hidden && t.actor?.isOfType?.("creature") && t.object && t.actor.isEnemyOf?.(tok.actor)); }
/** Every creature against this monster, with how it stands to each. Needs the fight on this page's canvas. */
function sense(combat, tok, memory = {}) {
  const scene = combat.scene, me = tok.actor, conds = conditionsOn(me), blocked = (type, a, b) => !!CONFIG.Canvas.polygonBackends[type].testCollision(a, b, { mode: "any", type });
  const vis = game.modules.get(VISIONER)?.active ? game.modules.get(VISIONER).api : null, avs = !!vis && !!game.settings.get(VISIONER, "autoVisibilityEnabled");
  const senses = sensesOf([...(me.perception?.senses ?? [])], { deafened: conds.includes("deafened") });
  return enemiesOf(scene, tok).map(t => {
    const from = tok.object.center, to = t.object.center, distance = tok.object.distanceTo(t.object), theirs = conditionsOn(t.actor);
    const { state, by } = perceiveOne({ senses, blinded: conds.includes("blinded"), dazzled: conds.includes("dazzled"), sees: !blocked("sight", from, to), heard: !blocked("sound", from, to), light: lightOn(to, scene), distance, invisible: theirs.includes("invisible"), concealed: theirs.includes("concealed"), stored: vis?.getVisibility(tok.id, t.id) ?? null, avs, known: !!memory[t.id] });
    return { id: t.id, token: t, state, by, distance, square: squareOf(t, scene) };
  });
}
const healthWords = () => healthEntries(game.settings.get("pf2e-hud", "healthStatusData"), game.i18n.localize("pf2e-hud.health-status.default"));
const wordsFor = actor => { try { return healthWord(actor.hitPoints ?? {}, healthWords()); } catch { const h = actor.hitPoints; return h?.max ? (h.value <= 0 ? "Down" : h.value >= h.max ? "Unhurt" : "Hurt") : null; } };   /* PF2e HUD may be off or renamed its setting */
function gearOf(actor) {
  /* what it looks like: never a rune or an item's hidden name. PF2e builds "+1 Striking Longsword" from the runes; the source name is the plain one. */
  const show = i => i.isIdentified === false ? (i.system.identification?.unidentified?.name ?? i._source?.name ?? i.name) : (i._source?.name ?? i.name);
  return [...(actor.itemTypes?.weapon ?? []).filter(i => i.system.equipped?.carryType === "held"), ...(actor.itemTypes?.shield ?? []).filter(i => i.system.equipped?.carryType === "held"), ...(actor.itemTypes?.armor ?? []).filter(i => i.isWorn)].map(show);
}
function actionsOf(actor, combat) {
  const n = s => actor.getCondition?.(s)?.value ?? 0, r = actor.getFlag(WORKBENCH, "stunReduction"), reduced = r && r.combat === combat.id && r.round === combat.round ? r.reducedBy : 0;
  return actionsFor({ quickened: actor.hasCondition?.("quickened"), slowed: n("slowed"), stunned: n("stunned"), reduced });
}
async function strikesOf(actor) {
  const out = []; for (const { id, strike: a } of strikesWithIds(actor)) {
    let damage = null; try { damage = await a.damage({ getFormula: true }); } catch (e) { console.warn(`${ID} | damage formula`, e); }
    out.push({ id, name: a.label, mod: strikeMods(a.variants.map(v => v.label)), reach: actor.getReach({ action: "attack", weapon: a.item }), ...(a.item?.isRanged ? { range: a.item.range?.increment ?? null, maxRange: a.item.range?.max ?? null } : {}), damage: typeof damage === "string" ? damage : null, traits: (a.traits ?? []).map(t => t.name).filter(t => t !== "attack"), effects: a.item?.system?.attackEffects?.value ?? [] });
  } return out;
}
const localize = k => game.i18n.localize(k);
function abilitiesOf(actor) { return (actor.itemTypes?.action ?? []).map(i => ({ id: i.slug ?? game.pf2e.system.sluggify(i.name), name: i.name, kind: i.system.actionType?.value ?? "passive", cost: i.system.actions?.value ?? null, text: plainText(i.system.description?.value, localize) })); }
function tacticsOf(scene, tok) { const page = game.journal.get(scene.getFlag(ID, "build")?.entry)?.pages.find(p => p.name === "Tactics"); return page ? tacticsFor(page.text?.content, tok.getFlag(ID, "group"), localize) : null; }
/* Allies know where each other are, by default. */
function alliesOf(scene, tok) { return scene.tokens.contents.filter(t => t.id !== tok.id && t.actor?.isOfType?.("creature") && t.actor.isAllyOf?.(tok.actor)); }
/** What its next diagonal costs this turn, 5 or 10 ft: the 5-10 count runs across all its movement in the turn (Rules ID 444), and Foundry keeps that
    movement as the token's history until the turn changes. The thinker can't see the history, so the packet says it. */
function nextDiagonalFt(tok, scene) { const px = scene.grid.size, d = scene.dimensions; return diagonalsIn((tok.movementHistory ?? []).map(w => [Math.round((w.x - d.sceneX) / px), Math.round((w.y - d.sceneY) / px)])) % 2 ? 10 : 5; }
/** A monster's packet as things stand, plus the labels it needs. Writes nothing. turn: what this turn already used ({ spent, attacks, done, note }), on a re-plan. */
async function buildPacket(combat, tok, turn = {}) {
  const scene = combat.scene, t = turns(combat), memory = t.memory?.[tok.id] ?? {}, others = sense(combat, tok, memory), allies = alliesOf(scene, tok);
  const known = others.filter(o => canTarget(o.state) || (o.state === "undetected" && memory[o.id])), labels = { ...(t.labels ?? {}) };
  const fresh = { ...assignLabels(labels, known.map(o => o.id), "E"), ...assignLabels(labels, [tok.id, ...allies.map(a => a.id)], "M") }; Object.assign(labels, fresh);
  const { model } = await readMap(scene), a = tok.actor, h = a.hitPoints, square = squareOf(tok, scene);
  const speeds = a.system.movement?.speeds ?? {}, extra = Object.fromEntries(["fly", "swim", "climb", "burrow"].filter(k => speeds[k]?.value).map(k => [k, speeds[k].value]));
  const you = { label: labels[tok.id], name: tok.name, square, size: a.size, nextDiagonal: nextDiagonalFt(tok, scene), actionsLeft: Math.max(0, actionsOf(a, combat) - (turn.spent ?? 0)), attacksMade: turn.attacks ?? 0, hp: `${h.value}/${h.max}`, speed: speeds.land?.value ?? 0, ...(Object.keys(extra).length ? { speeds: extra } : {}), conditions: (a.conditions?.active ?? []).map(c => c.value ? `${c.slug} ${c.value}` : c.slug), strikes: await strikesOf(a), abilities: abilitiesOf(a), tactics: tacticsOf(scene, tok) };
  const cover = visionerApi();
  you.takeCover = { taking: takingCover(tok), nextToCover: nearCoverFor(scene)(square, sizeOf(tok)), standardCoverFrom: cover ? others.filter(o => SEES.includes(o.state) && labels[o.id] && STANDARD.includes(coverOf(cover, o.token, tok))).map(o => labels[o.id]) : [] };
  const packet = packetOf({ you, round: combat.round, memory, note: turn.note ?? null, done: turn.done ?? [], ground: groundAround(model, square, GROUND_RADIUS),
    allies: allies.map(x => ({ label: labels[x.id], name: x.name, square: squareOf(x, scene), healthWord: wordsFor(x.actor), conditions: visibleConditions(conditionsOn(x.actor)) })),
    others: others.map(o => ({ id: o.id, state: o.state, label: labels[o.id], square: o.square, size: o.token.actor.size, distance: o.distance, gear: gearOf(o.token.actor), conditions: visibleConditions(conditionsOn(o.token.actor)), healthWord: wordsFor(o.token.actor), cover: cover?.getAutoCoverState?.(tok.object, o.token.object) ?? "none" })) });
  return { packet, labels: labelsOf(others.map(o => ({ id: o.id, state: o.state, label: labels[o.id] }))), fresh, others };
}
/* Keep what each ticked monster can perceive as the fight moves, so a monster's memory is where it last perceived someone and not where they stood on its own last turn. */
async function noteWhatTheySense(combat) {
  if (!onFightScene(combat)) return;
  const t = turns(combat), change = {};
  for (const c of combat.combatants) { const tok = c.token; if (!tok?.object || !tok.getFlag(ID, "run") || !hostile(tok) || tok.actor?.isDead) continue;
    const mem = t.memory?.[tok.id] ?? {}, now = remember(mem, sense(combat, tok, mem), combat.round);
    for (const [id, m] of Object.entries(now)) change[`memory.${tok.id}.${id}`] = m; }
  if (Object.keys(change).length) await saveTurns(combat, change);
}
/** What this monster perceives right now, as a packet. GM only, and only on a page with the fight open: anywhere else the sight tests would read the wrong map. */
export async function perceived(tokenId, combat = game.combat) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const tok = combat?.scene?.tokens.get(tokenId); if (!tok) throw new Error("That token isn't in this fight's scene.");
  if (!onFightScene(combat) || !tok.object) throw new Error("This page doesn't have the fight's map open, so it can't tell.");
  return (await buildPacket(combat, tok)).packet;
}

/* ---------- a turn starts ---------- */
/* pf2e.startTurn fires on Foundry's active GM only, which the runner may not be, so the runner watches the Combat itself. The guard is by round and
   combatant, not turn number: Workbench moves a PC's initiative at 0 HP, which changes the turn number in the middle of a monster's turn. */
const starting = new Set();
async function onTurnChange(combat) {
  if (!isRunner() || !combat?.started) return;
  const combatant = combat.combatant, tok = tokenOf(combat, combatant); if (!tok?.getFlag(ID, "run") || !hostile(tok)) return;
  const key = `${combat.id}.${combat.round}.${combatant.id}`; if (starting.has(key)) return;
  if (Object.values(turns(combat).requests).some(r => r.combatantId === combatant.id && r.round === combat.round)) return;
  starting.add(key);
  try {
    await new Promise(r => setTimeout(r, SETTLE_MS));   /* start-of-turn effects; how long is enough is still to be measured */
    if (combat.combatant?.id !== combatant.id) return;
    const opened = await ensureScene(combat);
    const id = foundry.utils.randomID(8), base = { state: "requested", combatantId: combatant.id, tokenId: tok.id, round: combat.round, turn: combat.turn, at: Date.now(), log: {} };
    if (!opened || !tok.object) return await save(combat, id, { ...base, labels: {}, note: cantOpen() });   /* no map, no packet: words instead of silent wrong answers */
    let built; try { built = await buildPacket(combat, tok); } catch (e) { console.error(`${ID} | packet`, e); return await save(combat, id, { ...base, labels: {}, note: `I couldn't work out what ${tok.name} perceives (${e.message}). Play this turn yourself.` }); }
    await saveTurns(combat, { [`requests.${id}`]: { ...base, labels: built.labels, packet: built.packet, seen: situationNow(combat, tok, built.labels, built.others), note: null, tries: 0, pos: 0 }, ...eventChange("turn", id, 0), ...packetExtras(combat, tok, built) });
  } finally { starting.delete(key); }
}
const cantOpen = () => `${game.user.name} couldn't open the fight map. Play this turn yourself.`;
/* new labels and memory that come with a packet */
function packetExtras(combat, tok, built) {
  const change = {}; for (const [k, v] of Object.entries(built.fresh)) change[`labels.${k}`] = v;
  for (const [k, v] of Object.entries(remember(turns(combat).memory?.[tok.id] ?? {}, built.others, combat.round))) change[`memory.${tok.id}.${k}`] = v;
  return change;
}
/* Down: no HP left, dying, unconscious or dead. A creature the monster can see falling is the change that matters most. */
const isDown = actor => !actor || (actor.hitPoints?.value ?? 1) <= 0 || !!actor.isDead || ["dying", "unconscious"].some(c => actor.hasCondition?.(c));
const conditionWords = actor => (actor.conditions?.active ?? []).map(c => c.value ? `${c.slug} ${c.value}` : c.slug);
/** What the rest of the turn rests on, as things stand: the monster itself, and each creature it could name when asked (labels: label to token id). */
function situationNow(combat, tok, labels = {}, others = null) {
  const a = tok.actor, h = a.hitPoints ?? {};
  others ??= sense(combat, tok, turns(combat).memory?.[tok.id] ?? {});
  const byId = new Map(others.map(o => [o.id, o])), seen = {};
  for (const [label, id] of Object.entries(labels)) { const o = byId.get(id); if (o) seen[label] = { square: o.square, state: o.state, down: isDown(o.token.actor) }; }
  return situationOf({ me: { square: squareOf(tok, combat.scene), hp: (h.value ?? 0) + (h.temp ?? 0), actions: actionsOf(a, combat), conditions: conditionWords(a) }, others: seen });
}
/** The runner's answer to any change on the Combat. */
export function onCombatUpdate(combat, change) {
  if (!isRunner()) return;
  if ("turn" in change || "round" in change) noteWhatTheySense(combat).catch(e => console.warn(`${ID} | memory`, e)).then(() => onTurnChange(combat)).catch(e => console.error(`${ID} | turn`, e));
  act(combat);
}
function act(combat) {
  const r = currentRequest(combat); if (!r) return;
  if (r.state === "submitted") judge(combat, r.id).catch(e => console.error(`${ID} | plan`, e));
  else if (r.go && RESUMABLE.includes(r.state)) doIt(combat, r.id).catch(e => console.error(`${ID} | turn`, e));
}
/** A monster ticked during its own turn. */
export function onTokenFlag(tok, change) {
  if (!isRunner() || !foundry.utils.getProperty(change, `flags.${ID}.run`)) return;
  for (const c of game.combats.filter(c => c.started && c.combatant?.tokenId === tok.id)) onTurnChange(c).catch(e => console.error(`${ID} | turn`, e));
}
/** The runner has just loaded: pick up whatever happened while it was away. A turn left "running" stopped when the page went, so it waits for Do it,
    which carries on from the record and never repeats a step. */
export async function onRunnerReady() {
  if (!isRunner()) return;
  for (const combat of game.combats.filter(c => c.started)) {
    const r = currentRequest(combat);
    if (r?.state === "running" && !running.has(r.id)) await save(combat, r.id, { state: "stopped", go: false, note: `${game.user.name}'s page reloaded during this turn. Check the chat and HP, then Do it carries on from where it stopped.` });
    await onTurnChange(combat); act(combat);
  }
}
/** Live values for the legality check. Reach, distance and moves need the canvas on the fight scene. used: what this request's finished steps took. Names
    are labels, because a refusal's reason goes back to the thinker; the card puts names in. */
async function gather(combat, req, used = { actions: 0, attacks: 0 }, { moves = true } = {}) {
  const scene = combat.scene, tok = scene.tokens.get(req.tokenId), actor = tok.actor;
  const strikes = strikesWithIds(actor).map(({ id, strike: a }) => ({ id, name: a.label, reach: actor.getReach({ action: "attack", weapon: a.item }), ranged: !!a.item?.isRanged, maxRange: a.item?.range?.max ?? null }));
  /* only what it perceived when asked, and still does: a plan can't name anything else */
  const now = new Map(sense(combat, tok, turns(combat).memory?.[tok.id] ?? {}).map(o => [o.id, o])), targets = {};
  for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const o = now.get(tokenId); if (o && canTarget(o.state)) targets[label] = { name: label, square: o.square, size: sizeOf(o.token), ...heightOf(o.token), flat: flatDC(o.state) }; }
  /* moves are worked out only for a plan that has a Stride, Step or Crawl, so trouble there can't stop a plan of Strikes */
  const speed = landSpeed(actor); let route = null;
  if (moves) { try { route = await mover(combat, tok, speed, knownTo(combat, tok, [...now.values()])); } catch (e) { console.error(`${ID} | moves`, e); const why = `I couldn't work out moves here (${e.message}).`; route = () => ({ ok: false, reason: why }); } }
  /* Take Cover: the cover Visioner gives it now against each creature it sees and could name, and the walls and trunks next to a square */
  const vis = visionerApi(), coverFrom = {};
  if (vis) for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const o = now.get(tokenId); if (o && SEES.includes(o.state)) { const l = coverOf(vis, o.token, tok); if (STANDARD.includes(l)) coverFrom[label] = l; } }
  return { actions: Math.max(0, actionsOf(actor, combat) - (req.spent ?? 0) - used.actions), attacksBefore: (req.attacks ?? 0) + used.attacks, strikes, targets,
    me: { square: squareOf(tok, scene), size: sizeOf(tok), ...heightOf(tok) }, speed, cantAct: cantAct(actor), cantMove: cantMove(actor), cantAttack: cantAttack(actor), prone: !!actor.hasCondition?.("prone"), route,
    tookCover: takingCover(tok), coverFrom, nearCover: nearCoverFor(scene) };
}

/* ---------- moving ---------- */
/** Height for distances: PF2e counts the vertical gap when two creatures stand at different elevations. */
const heightOf = tok => ({ elev: Number(tok.elevation) || 0, depth: Number(tok.depth) || sizeOf(tok) });
const hasMove = steps => (steps ?? []).some(isMove);
/** The creatures a monster knows are there: allies (not hidden by the GM), and those it perceives well enough to know their square. Only these shape
    the routes it's told about, so a refusal never gives away a creature it can't perceive. others: what `sense` gave. */
function knownTo(combat, tok, others) {
  const known = new Set(others.filter(o => canTarget(o.state)).map(o => o.id));
  for (const a of alliesOf(combat.scene, tok)) if (!a.hidden) known.add(a.id);
  return known;
}
/* Foundry has no pathfinding, so move.mjs finds the route; Foundry's own measurement then says what it costs, because that is what a real move charges
   (the same on 5 test routes over difficult terrain, 2026-11-07). Walls are core's own movement test between where the creature would stand. */
const landSpeed = actor => Number(actor.system.movement?.speeds?.land?.value) || 0;
/** Why it can't act at all, or null: Paralyzed, Petrified and Unconscious creatures take no actions (and a dead one none either). */
function cantAct(actor) {
  if (actor.isDead) return "it is dead.";
  for (const c of ["paralyzed", "petrified", "unconscious"]) if (actor.hasCondition?.(c)) return `it is ${c} and can't act.`;
  return null;
}
/** Why it can't attack, or null. Rules: Restrained (Player Core) bars actions with the attack or manipulate trait except to Escape or Force Open. */
function cantAttack(actor) { return actor.hasCondition?.("restrained") ? "it is restrained, so it can't attack." : null; }
/** Why it can't use any move action (Stride, Step, Crawl, Stand, Drop Prone), or null. Rules: Immobilized bars every action with the move trait, and Grabbed and
    Restrained creatures are Immobilized. Grabbed and Restrained are named first because PF2e adds Immobilized with them, and the cause is what the reader
    needs. Prone (Stand first) and no land Speed are checkPlan's, because a Stand earlier in the plan changes the first. */
function cantMove(actor) {
  for (const c of ["restrained", "grabbed", "immobilized"]) if (actor.hasCondition?.(c)) return `it is ${c}, so it can't use move actions (Stride, Step, Crawl, Stand or Drop Prone).`;
  return null;
}
/** The movement action a move is sent and priced with: crawl for a Crawl (a prone token can't walk); otherwise the token's own, except never crawl for a
    Stride or Step (one after a Crawl and a Stand in the same plan). */
const moveAction = (tok, kind) => kind === "crawl" ? "crawl" : tok.movementAction === "crawl" ? "walk" : tok.movementAction;
const DEEP = /deep water/i;   /* Survey Sheet's name for its greater-difficult water. Other greater difficult terrain is just 10 ft more a square. */
/** route(from, to, before, { step, kind }) for checkPlan, for this monster on this scene as it stands now: a Stride's route, or with step a single 5-ft
    square (a Step or a Crawl, which kind names for the words). */
async function mover(combat, tok, speed, known = null) {
  const scene = combat.scene, px = scene.grid.size, d = scene.dimensions, ox = d.sceneX, oy = d.sceneY, size = sizeOf(tok);
  const { model } = await readMap(scene, { except: new Set(scene.tokens.map(t => t.id)) });   /* creatures are counted below, ally or enemy */
  const deep = scene.regions.filter(r => DEEP.test(r.name ?? "") && r.behaviors.some(b => b.type === "modifyMovementCost" && !b.disabled)), deepAt = new Map();
  const terrain = (i, j) => { const k = model.idx(i, j), c = model.costs[k] ?? 0; if (c < 2) return c;
    if (!deepAt.has(k)) deepAt.set(k, deep.some(r => r.testPoint({ x: ox + (i + .5) * px, y: oy + (j + .5) * px, elevation: 0 }))); return deepAt.get(k) ? null : 2; };
  const who = new Map();
  for (const t of scene.tokens) { if (t.id === tok.id || !t.actor?.isOfType?.("creature") || (known && !known.has(t.id))) continue; const rel = t.actor.isAllyOf?.(tok.actor) ? "ally" : "enemy";
    for (const [i, j] of footprintAt(squareOf(t, scene), sizeOf(t))) if (who.get(`${i},${j}`) !== "enemy") who.set(`${i},${j}`, rel); }
  const centre = ([x, y]) => ({ x: ox + (x + size / 2) * px, y: oy + (y + size / 2) * px });
  const world = { cols: model.cols, rows: model.rows, terrain, blocked: (i, j) => !!model.blocked[model.idx(i, j)], creature: (i, j) => who.get(`${i},${j}`) ?? null,
    wall: (a, b) => !!CONFIG.Canvas.polygonBackends.move.testCollision(centre(a), centre(b), { mode: "any", type: "move" }) };
  const costFn = CONFIG.Token.movement.TerrainData.getMovementCostFunction(tok, {});
  /* squares before `from` (the turn so far) go with the token's own action, the new route with the move's own (crawl for a Crawl) */
  const measure = (squares, from = squares.length, kind = "stride") => squares.length < 2 ? 0 : tok.measureMovementPath(tok.object.createTerrainMovementPath(squares.map(([x, y], k) => ({ x: ox + x * px, y: oy + y * px, action: moveAction(tok, k >= from ? kind : "stride") }))), { cost: costFn }).cost;
  /* What it has already moved this turn: Foundry keeps the token's movement history for the turn (cleared when the turn changes) and charges a new move
     as the rest of that path, so diagonals carry on from it, as the rules say. */
  const history = (tok.movementHistory ?? []).map(w => [Math.round((w.x - ox) / px), Math.round((w.y - oy) / px)]);
  return (from, to, before = [], { step = false, kind = "stride" } = {}) => {
    const prefix = [...history]; for (const r of before) prefix.push(...(prefix.length && same(prefix.at(-1), r[0]) ? r.slice(1) : r));
    if (!prefix.length || !same(prefix.at(-1), from)) prefix.push(from);
    const odd = diagonalsIn(prefix) % 2 === 1, r = step ? findStep({ from, to, size, odd }, world) : findRoute({ from, to, size, budget: speed, odd }, world);
    if (!r.ok && r.why !== "far") return { ok: false, reason: routeWords(r, to, speed, kind) };
    return { ok: true, route: r.route, cost: measure([...prefix, ...r.route.slice(1)], prefix.length, kind) - measure(prefix) };   /* checkPlan compares the cost with Speed */
  };
}
/** Hand a plan in. Any GM may call this; the runner checks it. meta says who made it ({ by: "chat" | "api" | "gm", model, generation, usage }); a plan
    from an older chat's generation is ignored. The plan is stored as it came and cleaned by the runner, so tries are counted in one place. */
export async function submitPlan(combat, requestId, plan, meta = {}) {
  const r = request(combat, requestId); if (!r) throw new Error("No such request."); if (r.state !== "requested" && r.state !== "ready") throw new Error(`That turn is ${r.state}.`);
  if ((r.pos ?? 0) > 0) throw new Error("That turn is under way: its first steps are done, so a new plan can't replace them.");   /* between Next steps */
  const who = cleanMeta(meta); if (stale(brainNow(), who.generation)) return { state: r.state, ignored: true, reason: SUPERSEDED };
  if (JSON.stringify(plan ?? null).length > PLAN_BYTES) return { state: r.state, reason: "That plan is far too long to be a plan." };
  await save(combat, requestId, { plan: whole(plan), state: "submitted", verdict: null, by: whole(who) });
  if (isRunner()) await judge(combat, requestId);
  for (let i = 0; i < 40; i++) { await new Promise(res => setTimeout(res, 250)); const n = request(combat, requestId); if (n.state !== "submitted") return answer(n); }
  return { state: "submitted", reason: runnerProblem() ?? `${runnerName()} hasn't answered.` };
}
/* accepted: ready, or already running or done when Auto picked it up at once */
const answer = r => ({ state: r.state, ...(["ready", "running", "done"].includes(r.state) ? { steps: r.steps } : { reason: r.verdict, triesLeft: Math.max(0, MAX_TRIES - (r.tries ?? 0)) }) });
/* the plan is checked once, and a turn runs once: the updateCombat hook and the submitter can both arrive here, and Auto calls doIt straight after */
const judging = new Set(), running = new Set();
export async function judge(combat, requestId) {
  if (!isRunner() || judging.has(requestId) || request(combat, requestId)?.state !== "submitted") return null;
  judging.add(requestId); try { return await judgeNow(combat, requestId); } finally { judging.delete(requestId); }
}
async function judgeNow(combat, requestId) {
  if (!await ensureScene(combat)) { await save(combat, requestId, { state: "requested", verdict: cantOpen() }); return { state: "requested", reason: cantOpen() }; }
  const r = request(combat, requestId), clean = cleanPlan(r.plan);
  if (!clean.ok) return reject(combat, requestId, clean.reason);
  const c = checkPlan(clean.plan, await gather(combat, r, undefined, { moves: hasMove(clean.plan.steps) }));
  if (!c.ok) return reject(combat, requestId, c.reason);
  await save(combat, requestId, { state: "ready", plan: whole(clean.plan), steps: c.steps, verdict: null });
  const tok = combat.scene.tokens.get(r.tokenId);
  if (tok?.getFlag(ID, "auto")) doIt(combat, requestId).catch(e => console.error(e));
  return { state: "ready", steps: c.steps };
}
/* The reason goes back to the thinker once, as a retry event. A second refusal goes to the GM. */
async function reject(combat, requestId, reason) {
  const tries = (request(combat, requestId).tries ?? 0) + 1, last = tries >= MAX_TRIES, at = `requests.${requestId}`;
  await saveTurns(combat, { [`${at}.state`]: "requested", [`${at}.tries`]: tries, [`${at}.steps`]: null, [`${at}.verdict`]: last ? `Couldn't do: ${reason}` : reason, ...(last ? {} : eventChange("retry", requestId, tries)) });   /* an earlier plan's steps go: they'd read as this one's */
  return { state: "requested", reason, triesLeft: Math.max(0, MAX_TRIES - tries) };
}

/* ---------- the brain: whoever thinks waits here for an event and hands plans in ---------- */
/* Events live on each Combat's flag with the rest of the fight, numbered across all fights so one cursor serves them all. Only the runner adds them.
   The listener (generation and when it last asked) is a world setting, because a chat can be waiting before any fight exists. */
/* a plan replaces the last one whole: a merge would keep keys the new one doesn't have */
const whole = v => v && typeof v === "object" ? foundry.data.operators.ForcedReplacement.create(v) : v;
const PLAN_BYTES = 8000, SUPERSEDED = "A newer chat is thinking for the monsters now, so this was ignored.";
const brainNow = () => game.settings.get(ID, "brain") ?? {};
const setBrain = value => game.settings.set(ID, "brain", value);
const fights = () => game.combats.filter(c => c.started);
const eventsOf = combat => Object.values(turns(combat).events ?? {}).map(e => ({ ...e, combatId: combat.id }));
function eventChange(kind, requestId, tries) {
  const seq = nextSeq(Math.max(0, ...game.combats.contents.flatMap(c => Object.keys(turns(c).events ?? {}).map(Number))), Date.now());
  return { [`events.${seq}`]: { seq, kind, requestId, tries } };
}
function firstEvent(cursor) {
  const reqOf = e => request(game.combats.get(e.combatId), e.requestId);
  const ev = pickEvent(fights().flatMap(eventsOf), cursor, e => live(e, reqOf(e)));
  return ev ? eventOut(ev, reqOf(ev)) : null;
}
/** Wait for something to think about. With no generation this is a new thinker: it gets `hello` (the prompt, the schemas, its generation) at once and
    any older thinker is retired. Otherwise it returns the first event after `cursor` whose request still waits, holding up to maxSeconds (at most 100)
    for one; { idle: true } if none came. The cursor only moves when the caller asks again with the one it was given, so a dropped call loses nothing. */
export async function waitForEvent(cursor = 0, maxSeconds = 90, { generation = null } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  cursor = Number.isFinite(cursor) ? cursor : 0;
  if (generation == null) { const g = (brainNow().generation ?? 0) + 1; await setBrain({ generation: g, at: clock() }); return { cursor, hello: hello(g) }; }
  if (stale(brainNow(), generation)) return { cursor, superseded: true, reason: SUPERSEDED };
  await setBrain({ generation, at: clock() });
  let got = firstEvent(cursor);
  if (!got) got = await new Promise(res => {
    let hook = null, timer = null;
    const done = v => { Hooks.off("updateCombat", hook); clearTimeout(timer); res(v); };
    hook = Hooks.on("updateCombat", () => { const e = firstEvent(cursor); if (e) done(e); });
    timer = setTimeout(() => done(null), waitSeconds(maxSeconds) * 1000);
  });
  if (stale(brainNow(), generation)) return { cursor, superseded: true, reason: SUPERSEDED };
  return got ? { cursor: got.seq, event: got } : { cursor, idle: true };
}
/** Foundry's server clock: the same in every browser, so the light means the same on Rhea's computer as on the server PC. */
export const clock = () => game.time.serverTime;
/** Is the thinker there? For the Monster Turns window. */
export const brainListening = () => listening(brainNow(), clock());
export const brainSeenAt = () => brainNow().at ?? 0;
/** Legality only: what the runner would say, with nothing written. Needs the fight open on this page. */
export async function checkOnly(combat, requestId, plan) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (!r) throw new Error("No such request.");
  if (!onFightScene(combat)) throw new Error("This page doesn't have the fight's map open, so it can't tell.");
  const clean = cleanPlan(plan); if (!clean.ok) return { ok: false, reason: clean.reason };
  return checkPlan(clean.plan, await gather(combat, r, undefined, { moves: hasMove(clean.plan.steps) }));
}
/** The thinker can't make a plan: the card says so and the GM plays. */
export async function reportFailure(combat, requestId, reason, meta = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (!r) throw new Error("No such request."); if (r.state !== "requested") throw new Error(`That turn is ${r.state}.`);
  if (stale(brainNow(), cleanMeta(meta).generation)) return { ignored: true, reason: SUPERSEDED };
  await save(combat, requestId, { gaveUp: true, verdict: `Angel couldn't plan this turn: ${text(reason, 200) || "no reason given"}. Play it yourself.` });
  return { state: "requested", gaveUp: true };
}
/** A short read of where a fight stands, for whoever thinks. */
export function fightState(combat = game.combat) {
  if (!combat) return { fight: false };
  const r = currentRequest(combat);
  return { combatId: combat.id, started: combat.started, round: combat.round, listening: brainListening(), generation: brainNow().generation ?? 0,
    request: r ? { id: r.id, state: r.state, monster: r.packet?.you?.label ?? null, verdict: r.verdict ?? null, triesLeft: Math.max(0, MAX_TRIES - (r.tries ?? 0)), gaveUp: !!r.gaveUp } : null };
}

/* ---------- carrying it out ---------- */
/* Workbench's own auto-damage would open the damage dialog and roll in its own time, so a card this module makes opts out, with Workbench's own
   flag. It only ever fires on the card's author's browser, and this module always rolls the damage itself: one roller, one card. */
let pending = null;
export function onPreCreateMessage(message) { if (pending && message.speaker?.token === pending.tokenId && message.flags?.pf2e?.context?.type === "attack-roll") message.updateSource({ [`flags.${WORKBENCH}.noAutoDamageRoll`]: true }); }
export function onCreateMessage(message) { if (!pending || message.author?.id !== game.user.id || message.speaker?.token !== pending.tokenId) return; const type = message.flags?.pf2e?.context?.type; pending.waiters.get(type)?.(message); }
const waitFor = type => { const p = new Promise((res, rej) => { const t = setTimeout(() => { pending?.waiters.delete(type); rej(new Error(`No ${type} card came.`)); }, STEP_MS); pending.waiters.set(type, m => { clearTimeout(t); pending.waiters.delete(type); res(m); }); }); p.catch(() => {}); return p; };
const clickWith = key => new MouseEvent("click", { shiftKey: !!game.user.settings?.[key] });   /* PF2e flips the dialog on Shift */
/* Nobody can click a window on the runner's page, and a roll waits for its dialog for ever. So a stage gets a time limit, and a dialog ends it at once:
   closing it lets the roll give up, and the record says the stage may not have finished, so it goes to Rhea and nothing is repeated. */
const openWindows = () => [...foundry.applications.instances.values(), ...Object.values(ui.windows)];
const isPrompt = a => a instanceof foundry.applications.api.DialogV2 || /dialog|prompt/i.test(a.constructor?.name ?? "");
async function watched(work) {
  const before = new Set(openWindows()), fresh = () => openWindows().filter(a => !before.has(a));
  let poll, timer;
  const stop = new Promise((_, rej) => {
    poll = setInterval(() => { const p = fresh().find(isPrompt); if (p) rej(new Error(`The window "${p.title ?? p.constructor.name}" opened on ${game.user.name}'s page, where nobody can click it.`)); }, 250);
    timer = setTimeout(() => rej(new Error(`This took over ${STEP_MS / 1000} seconds.`)), STEP_MS);
  });
  try { return await Promise.race([work(), stop]); }
  catch (e) { for (const a of fresh()) await a.close?.().catch?.(() => {}); throw e; }
  finally { clearInterval(poll); clearTimeout(timer); }
}
/* Real targets, on the runner's own account: hers are never touched. Workbench's "Please target" and Toolbelt's Target Helper rows both read them. */
const aimAt = target => target.object?.setTarget(true, { user: game.user, releaseOthers: true, groupSelection: false });
/* With automatic damage on, a damage card's buttons can only apply a second time, and Block comes too late (the reaction pop-up is its proper route). So the
   card is marked, which hides PF2e's buttons from players, and Target Helper's row is taken off. That's done after the card is made, because Toolbelt fills
   the row in a preCreate hook that runs after this module's. If Toolbelt renames its flag the row simply stays. */
async function markApplied(message) {
  const change = { [`flags.${ID}.autoApplied`]: true }; if (message.flags?.[TOOLBELT]?.targetHelper) change[`flags.${TOOLBELT}.targetHelper`] = foundry.data.operators.ForcedDeletion.create();
  await message.update(change).catch(e => console.warn(`${ID} | card`, e));
}
/** Drawing a marked card for a player. It changes only what this browser shows, so if PF2e changes its markup the buttons just show again. */
export function onRenderMessage(message, html) { if (game.user.isGM || !message.getFlag(ID, "autoApplied")) return; for (const el of html.querySelectorAll?.(".damage-application") ?? []) el.remove(); }
const stopAiming = () => { if (game.user.targets.size) canvas.tokens?.setTargets?.([], { mode: "replace" }); };

async function runStrike(combat, id, i, step, tok, target) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const strike = strikesWithIds(tok.actor).find(x => x.id === step.item)?.strike; if (!strike) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  for (let guard = 0; guard < 8; guard++) {
    const now = nextAction(get(), { apply: applySetting(), flat: step.flat ?? 0 });
    if (now === "next") return "next";
    if (now === "ask") return "ask";
    if (!stepGate(now, id)) return "stopped";
    if (now !== "apply" && !(await ensureScene(combat) && tok.object && target.object)) throw new Error(cantOpen());   /* applying needs no canvas */
    pending = { tokenId: tok.id, waiters: new Map() };
    try {
      if (now === "flat") {
        await record({ flatStarted: true });
        const roll = await watched(async () => { const r = await new Roll("1d20").evaluate(); await r.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Flat check, DC ${step.flat}` }); return r; });
        await record({ flat: { dc: step.flat, total: roll.total, ok: roll.total >= step.flat } });
        if (roll.total < step.flat) await save(combat, id, { note: `${step.itemName} at ${step.targetName} failed its DC ${step.flat} flat check (${roll.total}). The action is spent.` });
      } else if (now === "attack") {
        aimAt(target); await record({ started: true });
        const { message, roll } = await watched(async () => { const card = waitFor("attack-roll"), roll = await strike.variants[step.variant].roll({ event: clickWith("showCheckDialogs"), target: target.object }); return { message: await card, roll }; });
        await record({ attack: { message: message.id, degree: roll?.degreeOfSuccess ?? message.rolls?.[0]?.degreeOfSuccess ?? 0 } });
      } else if (now === "damage") {
        const degree = get().attack.degree; aimAt(target); await record({ damageStarted: true });
        const message = await watched(async () => { const card = waitFor("damage-roll"); await strike[degree === 3 ? "critical" : "damage"]({ event: clickWith("showDamageDialogs"), target: target.object, mapIncreases: step.variant }); return card; });
        await record({ damage: { message: message.id } });
        if (applySetting()) await markApplied(message);
      } else if (now === "apply") {
        const message = game.messages.get(get().damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        await record({ applying: true });
        await watched(() => applyFromCard(message, roll, target));
        await record({ applied: true });
        /* undo restores HP but not what Workbench and PF2e did at 0 HP (seen in test D1) */
        if (target.actor?.isOfType?.("character") && target.actor.hitPoints?.value === 0) await save(combat, id, { note: `${target.name} is at 0 HP. If you undo this, PF2e restores the HP but you still need to remove Wounded and Prone and put their initiative back.` });
      }
    } finally { pending = null; }
  }
  return "ask";
}
/** A Stride, a Step or a Crawl, along the route the check found (a Step's or Crawl's is its one square), with the action the token moves by: its own for
    a Stride or Step, crawl for a Crawl (a prone token can't walk). Foundry's crawl action books each square at double (core's costMultiplier 2, tested
    2026-11-07), so a Crawl's charged cost reads 10 ft; the rules distance, which checkPlan uses, is 5 ft. Never sent twice: a move begun before a reload
    counts as done only if the monster is where it was going. Afterwards the monster's own square in `seen` moves with it, so the look before the next
    action doesn't take its own Stride for a change; anything else (an HP change from a reaction, someone now out of sight) still counts. */
async function runStride(combat, id, i, step, tok) {
  const scene = combat.scene, record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  /* the step's record, the baseline's square and any note go in one save: a reload between two saves would leave the step done with the old square,
     and the look before the next action would re-plan for its own move */
  const finish = async rec => { const at = squareOf(tok, scene), change = { log: { [i]: rec } };
    if (request(combat, id).seen) change.seen = { me: { square: at } };   /* no baseline, nothing to move */
    if (!same(at, step.to)) change.note = `${tok.name} stopped at square ${at[0]}, ${at[1]} instead of ${step.to[0]}, ${step.to[1]}.`;
    await save(combat, id, change); };
  const now = nextMove(get(), squareOf(tok, scene), step.to);
  if (now === "next") return "next";
  if (now === "arrived") { await finish({ moved: { to: squareOf(tok, scene), cost: null } }); return "next"; }
  if (now === "ask") { await save(combat, id, { note: `${tok.name} started a ${WORD[step.do] ?? "Stride"} and isn't where it was going.` }); return "ask"; }
  if (!stepGate(step.do, id)) return "stopped";
  if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
  /* someone it didn't know was there, on the way: the move ends before their space, as the rules say. The thinker is asked again without being told why. */
  const known = knownTo(combat, tok, sense(combat, tok, turns(combat).memory?.[tok.id] ?? {})), taken = new Set();
  for (const t of scene.tokens) if (t.id !== tok.id && t.actor?.isOfType?.("creature") && !known.has(t.id)) for (const [a, b] of footprintAt(squareOf(t, scene), sizeOf(t))) taken.add(`${a},${b}`);
  const route = cutShort(step.route, sizeOf(tok), (a, b) => taken.has(`${a},${b}`));
  if (route.length < 2) { await finish({ started: true, moved: { to: squareOf(tok, scene), cost: 0 } }); return "next"; }
  const px = scene.grid.size, d = scene.dimensions, action = moveAction(tok, step.do), waypoints = route.slice(1).map(([x, y]) => ({ x: d.sceneX + x * px, y: d.sceneY + y * px, action }));
  await record({ started: true });
  const charged = await watched(async () => {
    let got = null; const hook = Hooks.on("moveToken", (doc, mv) => { if (doc.id === tok.id) got = { cost: mv.passed?.cost ?? null, x: mv.destination?.x, y: mv.destination?.y }; });
    try {
      await tok.move(waypoints);
      for (let t = 0; t < STEP_MS && !(got && tok.x === got.x && tok.y === got.y); t += 100) await new Promise(res => setTimeout(res, 100));   /* the hook comes before the update lands */
      await within(tok.object?.movementAnimationPromise ?? Promise.resolve(), 10000, "The move's animation didn't finish.").catch(() => {});   /* cover and sight are read from where the token is drawn */
      return got;
    } finally { Hooks.off("moveToken", hook); }
  });
  await finish({ moved: { to: squareOf(tok, scene), cost: charged?.cost ?? null } });
  return "next";
}
/** Stand or Drop Prone: PF2e's own action (`StandActionVariant`, `DropProneActionVariant` in PF2e 8.7.0), which posts its card and then removes or adds
    Prone, with no dialog. Never sent twice: one begun before a reload counts as done if the monster is already as the step leaves it, and the GM looks
    otherwise; one not begun with the monster already like that posts nothing. Afterwards the look-before baseline takes in what the action itself changed
    (`absorbOwn`: Prone and the Off-Guard it brings), so it doesn't re-plan for its own doing, while anything a reaction added still counts. Not built:
    Reactive Strike and the like, which these move actions can trigger at the end of the action (Rules ID 446). */
const PRONE_SET = ["prone", "off-guard"];
async function runPosture(combat, id, i, kind, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, actor = tok.actor, wantProne = POSTURES[kind];
  const already = () => !!actor.hasCondition?.("prone") === wantProne, words = kind === "stand" ? "Stand" : "Drop Prone";
  /* the step's record and the baseline go in one save, so a reload can't leave the step done with the old conditions */
  const finish = async (rec, before) => { const seen = request(combat, id).seen, change = { log: { [i]: rec } };
    if (seen?.me) change.seen = { me: { conditions: absorbOwn(seen.me.conditions ?? [], before, situationOf({ me: { conditions: conditionWords(actor) } }).me.conditions, PRONE_SET) } };
    await save(combat, id, change); };
  const now = nextPosture(get(), already());
  if (now === "next") return "next";
  if (now === "already") { await finish({ changed: { message: null } }, request(combat, id).seen?.me?.conditions ?? []); return "next"; }
  if (now === "ask") { await save(combat, id, { note: `${tok.name} started to ${words} and is ${wantProne ? "not" : "still"} prone.` }); return "ask"; }
  if (!stepGate(kind, id)) return "stopped";
  const before = situationOf({ me: { conditions: conditionWords(actor) } }).me.conditions;
  await record({ started: true });
  const out = await watched(() => game.pf2e.actions.get(kind).use({ actors: [actor] }));
  for (let t = 0; t < 2000 && !already(); t += 100) await new Promise(res => setTimeout(res, 100));   /* PF2e awaits its toggle, but give the update a moment */
  if (!already()) { await save(combat, id, { note: `${tok.name} used ${words} but is ${wantProne ? "not" : "still"} prone.` }); return "ask"; }
  await finish({ changed: { message: out?.[0]?.message?.id ?? null } }, before);
  return "next";
}
/* ---------- Take Cover ---------- */
/* Rhea, 2026-11-07: rule B for when it's allowed (prone, a wall or thick trunk next to it, or standard cover from a creature it sees), and Visioner's own
   per-creature cover for what it does, because that is how the rules work: standard cover from someone becomes greater, anything less becomes standard.
   PF2e's own "Effect: Cover" gives one bonus against everyone, takes the higher of it and Visioner's wall cover rather than adding (tested: AC 15 behind a
   thick trunk was 17 with it at standard), and never ends by itself. Visioner's public setCover with its takeCover option is what its own Take Cover
   calls. Ending it, and its prone effect, aren't in its API, so those come from its own files; if an update moves them the module falls back: the GM
   clicks Visioner's "Take Cover Should End" card, and a prone monster gets PF2e's effect. With Visioner off, PF2e's effect is used throughout. */
const SEES = ["observed", "concealed"], STANDARD = ["standard", "greater"], VISIONER_FILES = `/modules/${VISIONER}/scripts/`;
const COVER_EFFECT = "Compendium.pf2e.other-effects.I9lfZUiCwMiGogVi", COVER_BONUS = { standard: 2, greater: 4, "greater-prone": 4 };
const visionerApi = () => game.modules.get(VISIONER)?.active ? game.modules.get(VISIONER).api ?? null : null;
const coverOf = (vis, observer, target) => { try { return vis.getAutoCoverState(observer.id, target.id) ?? "none"; } catch { return "none"; } };
async function visionerFile(name) { if (!visionerApi()) return null; try { return await import(`${VISIONER_FILES}${name}`); } catch (e) { console.warn(`${ID} | Visioner's ${name}`, e); return null; } }
const TAKE_COVER_SOURCES = ["take_cover_action"];
/** Whether it is Taking Cover now: Visioner's record of a Take Cover against anyone (as Visioner's own check reads it, a pending end included), Visioner's
    prone effect, or the PF2e effect this module adds. */
function takingCover(tok) {
  const flags = tok.flags?.[VISIONER] ?? {};
  if (Object.entries(flags).some(([k, f]) => k.startsWith("avs-override-from-") && (f?.coverOnly === true || TAKE_COVER_SOURCES.includes(f?.coverOverrideSource) || (TAKE_COVER_SOURCES.includes(f?.source) && f?.expectedCover)))) return true;
  const prone = !!tok.actor?.hasCondition?.("prone");   /* the prone-only kind gives nothing once it stands (Visioner removes its own then) */
  return (tok.actor?.itemTypes?.effect ?? []).some(e => e.flags?.[VISIONER]?.takeCoverProneRangedOnly === true || (e.getFlag?.(ID, "takeCover") && (prone || e.flags?.pf2e?.rulesSelections?.cover?.level !== "greater-prone")));
}
/** nearCover(square, size) for checkPlan: the scene's walls a creature could take cover behind, as segments in squares. A wall blocks movement or sight;
    an open door doesn't count; neither does a wall Visioner is told gives lesser cover or none (Survey Sheet's thin trunks: Rhea's rule, under 3 ft
    across is lesser cover, too thin to hide behind). */
function nearCoverFor(scene) {
  let segs = null;
  return (square, size = 1) => {
    if (!segs) { const px = scene.grid.size, d = scene.dimensions, NONE = 0, open = CONST.WALL_DOOR_STATES?.OPEN ?? 1;
      segs = scene.walls.contents.filter(w => (w.move !== NONE || w.sight !== NONE) && !(w.door && w.ds === open) && !["lesser", "none"].includes(w.flags?.[VISIONER]?.coverOverride))
        .map(w => [(w.c[0] - d.sceneX) / px, (w.c[1] - d.sceneY) / px, (w.c[2] - d.sceneX) / px, (w.c[3] - d.sceneY) / px]); }
    return !!square && featureNear(square, size, segs);
  };
}
/** PF2e's own "Effect: Cover" with its level already chosen, so its prompt doesn't open where nobody can click it (a rule's `selection` skips it). */
async function addCoverEffect(actor, level) {
  const src = (await fromUuid(COVER_EFFECT))?.toObject(); if (!src) throw new Error("PF2e's Effect: Cover isn't in its compendium.");
  delete src._id; src.system.rules[0].selection = { bonus: COVER_BONUS[level], level }; foundry.utils.setProperty(src, `flags.${ID}.takeCover`, true);
  await actor.createEmbeddedDocuments("Item", [src]);
}
/** The creatures Take Cover counts against: every creature on the map that isn't its ally, hidden ones too (cover is where it is, not what it knows). */
const coverSubjects = (scene, tok) => scene.tokens.contents.filter(t => t.id !== tok.id && t.object && t.actor?.isOfType?.("creature") && !t.actor.isAllyOf?.(tok.actor));
async function takeCover(combat, tok) {
  const actor = tok.actor, prone = !!actor.hasCondition?.("prone"), vis = visionerApi();
  const out = await game.pf2e.actions.get("take-cover").use({ actors: [actor], effect: false });   /* its card, without PF2e's effect */
  const message = out?.[0]?.message?.id ?? null;
  if (!vis) { const level = prone ? "greater-prone" : "standard"; await addCoverEffect(actor, level); return { message, by: "pf2e", level }; }
  const levels = {}; let proneRanged = false;
  const subjects = coverSubjects(combat.scene, tok);
  for (const t of subjects) {
    const level = coverAfterTaking(coverOf(vis, t, tok), prone);
    if (level === "prone-ranged") { proneRanged = true; continue; }
    if (await vis.setCover(t.id, tok.id, level, { takeCover: true, skipEphemeralUpdate: false })) levels[t.id] = level;
  }
  if (prone && !subjects.length) proneRanged = true;
  let pf2e = false;
  if (proneRanged) { const batch = await visionerFile("cover/batch.js"); if (batch?.applyTakeCoverProneRangedOnlyEffect) await batch.applyTakeCoverProneRangedOnlyEffect(tok.object); else { await addCoverEffect(actor, "greater-prone"); pf2e = true; } }
  return { message, by: "visioner", levels, proneRanged, ...(pf2e ? { pf2eProne: true } : {}) };
}
/** Take Cover. Never sent twice: one begun before a reload counts as done if the monster is Taking Cover, and the GM looks otherwise. */
async function runTakeCover(combat, id, i, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const now = nextCover(get(), takingCover(tok));
  if (now === "next") return "next";
  if (now === "already") { await record({ covered: { already: true } }); return "next"; }
  if (now === "ask") { await save(combat, id, { note: `${tok.name} started to Take Cover and isn't Taking Cover.` }); return "ask"; }
  if (!stepGate("take-cover", id)) return "stopped";
  if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
  await record({ started: true });
  const got = await watched(() => takeCover(combat, tok));
  await record({ covered: got });
  return "next";
}
const pendingCoverCard = tok => game.messages.contents.filter(m => { const f = m.flags?.[VISIONER]?.takeCoverExpiration; return f?.tokenId === tok.id && f.status === "pending"; }).at(-1) ?? null;
/** End a Take Cover its own attack or move just ended (the rules: until it moves from its space or makes an attack). Visioner posts its own "Take Cover
    Should End" card for that moment; this waits briefly for it and accepts it, so the card reads as done, or ends it directly if no card comes. Returns a
    note for the GM when it couldn't. */
async function endTakeCover(tok, reason) {
  if (!takingCover(tok)) return null;
  const ours = (tok.actor?.itemTypes?.effect ?? []).filter(e => e.getFlag(ID, "takeCover")).map(e => e.id);
  if (ours.length) await tok.actor.deleteEmbeddedDocuments("Item", ours);
  if (!takingCover(tok)) return null;
  const svc = await visionerFile("chat/services/take-cover-expiration-service.js");
  if (!svc?.expireTakeCoverForToken || !svc?.acceptTakeCoverExpirationMessage) return `${tok.name} ${reason === "attack" ? "attacked" : "moved"}, which ends its Take Cover: click Remove Take Cover on Visioner's card.`;
  let card = null; for (let t = 0; t < 1500 && !(card = pendingCoverCard(tok)); t += 100) await new Promise(res => setTimeout(res, 100));
  if (card) await svc.acceptTakeCoverExpirationMessage(card); else await svc.expireTakeCoverForToken(tok.object, reason);
  return takingCover(tok) ? `${tok.name}'s Take Cover should have ended (it ${reason === "attack" ? "attacked" : "moved"}), and it hasn't: check Visioner's card.` : null;
}
/** After a step: if this request's steps so far ended its Take Cover, end it, and keep any note for the GM. */
async function settleCover(combat, id, upto, tok) {
  const r = request(combat, id); if (!r?.steps || !endsCover(r.steps, r.log, upto) || !takingCover(tok)) return;
  let last = null; for (let k = upto - 1; k >= 0 && !last; k--) if (r.steps[k]?.do === "strike" || isMove(r.steps[k])) last = r.steps[k];
  let note; try { note = await endTakeCover(tok, last?.do === "strike" ? "attack" : "movement"); } catch (e) { console.error(`${ID} | take cover`, e); note = `I couldn't end ${tok.name}'s Take Cover (${e.message}): check Visioner's card.`; }
  if (note) await save(combat, id, { note: [request(combat, id).note, note].filter(Boolean).join(" ") });
}
/* what PF2e's own Damage button does, for a named target rather than the selected tokens. Effects that only count for this one hit aren't read. */
async function applyFromCard(message, roll, target) {
  const context = message.flags.pf2e?.context ?? {}, { origin, keep } = damageOptions(context.options ?? []), actor = target.actor.getContextualClone(origin, []);
  const rollOptions = new Set([...keep, ...origin, ...actor.getSelfRollOptions()]);
  await actor.applyDamage({ damage: roll, token: target, item: message.item, rollOptions, shieldBlockRequest: false, outcome: context.outcome });
}
/** Do it (and Next step): on the runner, carry the plan on from where it stands. Without Auto it does one action and waits for Next step; with Auto it
    goes on by itself, with a pause between actions. Safe to call again after a reload: finished work is never repeated. From anyone else's browser it
    asks the runner, through the flag; a turn never runs quietly in the wrong browser. */
export async function doIt(combat, requestId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  if (!isRunner()) { const why = runnerProblem(); if (why) throw new Error(why); return save(combat, requestId, { go: true }); }
  if (running.has(requestId)) return;
  running.add(requestId); try { await runTurn(combat, requestId); } finally { running.delete(requestId); stopAiming(); }
}
const autoPause = () => Math.max(0, Number(game.settings.get(ID, "autoPause")) || 0);
/* Auto's pause between actions, so each roll can be followed. Hold and Play it myself end it at once. */
async function pauseBetween(combat, id) {
  const end = Date.now() + autoPause() * 1000;
  while (Date.now() < end) { await new Promise(r => setTimeout(r, Math.min(200, end - Date.now()))); const n = request(combat, id); if (n?.hold || n?.state === "manual") return; }
}
async function runTurn(combat, requestId) {
  const r = request(combat, requestId); if (!RESUMABLE.includes(r?.state)) throw new Error("That turn isn't ready.");
  if (!await ensureScene(combat)) return save(combat, requestId, { state: "stopped", go: false, note: cantOpen() });
  /* pressing Do it means go, whatever was held. A note about why it stopped goes; one from an earlier step (a PC at 0 HP) stays with the turn. */
  await save(combat, requestId, { state: "running", go: false, hold: false, ...(r.state === "held" || r.state === "stopped" ? { note: null } : {}) });
  const tok = combat.scene.tokens.get(r.tokenId);
  await settleCover(combat, requestId, r.pos ?? 0, tok);   /* a reload between a step and ending its Take Cover */
  for (let i = r.pos ?? 0; i < r.steps.length; i++) {
    const now = { ...request(combat, requestId), id: requestId };   /* a stored request doesn't carry its own id; replan needs it */
    let step = r.steps[i];
    if (now.state === "manual") return;
    if (now.hold) return save(combat, requestId, { state: "held", hold: false, note: "Held before the next step." });
    /* look again before an action that hasn't begun. One begun before a reload carries on, never re-planned halfway. */
    if (!Object.keys(now.log?.[i] ?? {}).length) {
      let look; try { look = await lookAgain(combat, now, i, tok); } catch (e) { console.error(`${ID} | look again`, e); return save(combat, requestId, { state: "stopped", note: `I couldn't check step ${i + 1} before doing it (${e.message}). Play the rest yourself.` }); }
      if (look.changes.length) return replan(combat, now, i, look.changes, tok);
      /* a Stride goes by the route just checked: the ground can change under a plan (a wall, someone it can't perceive) without the monster noticing */
      if (isMove(step) && look.next?.do === step.do && JSON.stringify(look.next.route) !== JSON.stringify(step.route)) {
        step = { ...step, route: look.next.route, cost: look.next.cost }; r.steps[i] = step; await save(combat, requestId, { steps: r.steps });
      }
    }
    let work = null;
    if (step.do === "strike") {
      const target = combat.scene.tokens.get(r.labels[step.target]); if (!target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
      work = () => runStrike(combat, requestId, i, step, tok, target);
    } else if (isMove(step)) work = () => runStride(combat, requestId, i, step, tok);
    else if (step.do in POSTURES) work = () => runPosture(combat, requestId, i, step.do, tok);
    else if (step.do === "take-cover") work = () => runTakeCover(combat, requestId, i, tok);
    if (work) {
      let result; try { result = await work(); } catch (e) { console.error(e); result = "ask"; await save(combat, requestId, { note: e.message }); }
      if (result === "stopped") return save(combat, requestId, { state: "stopped" });
      if (result === "ask") return save(combat, requestId, { state: "stopped", note: `${request(combat, requestId).note ?? ""} Step ${i + 1} may not have finished. ${isMove(step) ? "Put the monster where it should be" : step.do in POSTURES ? "Check whether it is prone" : step.do === "take-cover" ? "Check whether it is Taking Cover" : "Check the chat and HP"}, then play the rest yourself.`.trim() });
      await settleCover(combat, requestId, i + 1, tok);   /* its own attack or move ends a Take Cover */
      /* a Stride, Step or Crawl that ended short of its square: the rest was planned from there, so ask again (the reason names the square, never what stopped it) */
      const at = squareOf(tok, combat.scene);
      if (isMove(step) && !same(at, step.to) && i + 1 < r.steps.length && request(combat, requestId).state !== "manual") return replan(combat, { ...request(combat, requestId), id: requestId }, i + 1, [{ who: "me", what: "stopped", at }], tok);
    }
    if (request(combat, requestId).state === "manual") return;
    if (i + 1 >= r.steps.length) return save(combat, requestId, { pos: i + 1, state: "done" });
    if (!tok.getFlag(ID, "auto")) return save(combat, requestId, { pos: i + 1, state: "ready" });   /* Next step */
    await save(combat, requestId, { pos: i + 1 });
    await pauseBetween(combat, requestId);
  }
  if (request(combat, requestId).state !== "manual") return save(combat, requestId, { state: "done" });
}
/** What changed since the plan was made, or why the next step no longer works (`changes`, empty when it can go on), and the next step as it checks out now (`next`). */
async function lookAgain(combat, r, i, tok) {
  if (!r.seen || !tok.object) return { changes: [] };   /* a request from before 0.4.0 has no baseline */
  const changes = changesSince(r.seen, situationNow(combat, tok, r.labels));
  if (changes.length) return { changes };
  const left = (r.plan?.steps ?? []).slice(i), rest = checkPlan({ steps: left }, await gather(combat, r, spentBy(r.steps.slice(0, i)), { moves: hasMove(left) }));
  return rest.ok ? { changes: [], next: rest.steps[0] } : { changes: [{ who: "plan", what: "illegal", reason: rest.reason }] };
}
/** Drop the rest of the plan and ask again, for the same turn: a new request with a fresh packet, what's done so far, and why. The old one ends there. */
async function replan(combat, r, i, changes, tok) {
  const used = spentBy(r.steps.slice(0, i)), spent = (r.spent ?? 0) + used.actions, attacks = (r.attacks ?? 0) + used.attacks, replans = (r.replans ?? 0) + 1;
  const done = [...(r.done ?? []), ...r.steps.slice(0, i).map((s, k) => doneStep(s, r.log?.[k]))], why = describeChanges(changes), at = `requests.${r.id}`;
  if (actionsOf(tok.actor, combat) - spent <= 0) return saveTurns(combat, { [`${at}.state`]: "done", [`${at}.pos`]: i, [`${at}.why`]: changes, [`${at}.note`]: `${why} No actions left, so the turn ends here.` });
  if (replans > MAX_REPLANS) return saveTurns(combat, { [`${at}.state`]: "done", [`${at}.pos`]: i, [`${at}.why`]: changes, [`${at}.note`]: `${why} That would be re-plan ${replans} this turn, so play the rest yourself.` });
  let built; try { built = await buildPacket(combat, tok, { spent, attacks, done, note: `Asked again mid-turn: ${why}` }); }
  catch (e) { console.error(`${ID} | packet`, e); return save(combat, r.id, { state: "stopped", note: `Something changed (${why}) and I couldn't work out what ${tok.name} perceives now (${e.message}). Play the rest yourself.` }); }
  const id = foundry.utils.randomID(8);
  await saveTurns(combat, { [`${at}.state`]: "done", [`${at}.pos`]: i, [`${at}.replanned`]: id,
    [`requests.${id}`]: { state: "requested", combatantId: r.combatantId, tokenId: r.tokenId, round: r.round, turn: r.turn, at: Date.now(), log: {}, labels: built.labels, packet: built.packet, seen: situationNow(combat, tok, built.labels, built.others), note: null, tries: 0, pos: 0, spent, attacks, done, replans, why: changes, parent: r.id },
    ...eventChange("replan", id, 0), ...packetExtras(combat, tok, built) });
}
/** Is this page working on a turn, or about to? For tools that share the runner's page. The in-memory sets cover the start of a turn, before any request
    exists, so only the runner's own page has the full answer; on any other page it's the flag alone. */
/** Keep the current turn through an initiative change made on this page. Workbench moves a PC at 0 HP to just ahead of whoever's turn it is, from the
    page that applied the damage: the runner's. PF2e then tries to keep the turn, but that page's copy has already shifted, so its turn update often
    finds nothing to send, and the turn passed to the PC mid-turn, with turn events. Seen with the runner as active GM too (3 in 3), so this runs either way. Two steps on the runner's page:
    `keepTurn` gives the change core's `combatTurn` and `turnEvents: false`, as core's own initiative roll does, so every page keeps the same creature
    current with no turn event; core applies that in each page's copy only, so `saveTurn` then saves the turn for real, forced through (`diff: false`). */
export function keepTurn(combatant, change, options) {
  const combat = combatant.parent;
  if (!isRunner() || !combat?.started || combat.turn == null || typeof options.combatTurn === "number" || !("initiative" in change)) return;
  const current = combat.combatant; if (!current) return;
  const updates = Array.isArray(options.updates) && options.updates.length ? options.updates : [{ ...change, _id: combatant.id }];
  const after = combat.combatants.contents.map(c => { const u = updates.find(x => x._id === c.id); return u ? c.clone(u, { keepId: true, parent: combat }) : c; });
  const keep = after.sort((a, b) => combat._sortCombatants(a, b)).findIndex(c => c.id === current.id);
  if (keep < 0) return;
  options.combatTurn = keep; options.turnEvents = false; options[ID] = { ...(options[ID] ?? {}), keepTurn: keep };
}
export function saveTurn(combatant, options, userId) {
  const keep = options[ID]?.keepTurn; if (typeof keep !== "number" || userId !== game.user.id || !isRunner()) return;
  combatant.parent?.update({ turn: keep }, { diff: false, turnEvents: false }).catch(e => console.error(`${ID} | keeping the turn`, e));
}
export const busy = () => starting.size > 0 || judging.size > 0 || running.size > 0 || game.combats.filter(c => c.started).some(c => requestBusy(currentRequest(c)));
export const hold = (combat, id) => save(combat, id, { hold: true });
export const playMyself = (combat, id) => save(combat, id, { state: "manual" });
