/* A fight's turns. One named account does the work (the runner: the Claude Bridge unless the setting says otherwise), on its own page with the
   fight scene open; any other GM's browser only asks it to, through the Combat's flag. Everything is kept on that flag, so a reload or a
   summarised chat loses nothing. For now it runs Strikes; see claude/encounter-builder-plan.md for the rest of step 2. */
import { MAX_REPLANS, changesSince, checkPlan, currentOf, damageOptions, describeChanges, doneStep, latestNote, nextAction, requestBusy, situationOf, spentBy, strikeIds } from "./turn.mjs";
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
/** A monster's packet as things stand, plus the labels it needs. Writes nothing. turn: what this turn already used ({ spent, attacks, done, note }), on a re-plan. */
async function buildPacket(combat, tok, turn = {}) {
  const scene = combat.scene, t = turns(combat), memory = t.memory?.[tok.id] ?? {}, others = sense(combat, tok, memory), allies = alliesOf(scene, tok);
  const known = others.filter(o => canTarget(o.state) || (o.state === "undetected" && memory[o.id])), labels = { ...(t.labels ?? {}) };
  const fresh = { ...assignLabels(labels, known.map(o => o.id), "E"), ...assignLabels(labels, [tok.id, ...allies.map(a => a.id)], "M") }; Object.assign(labels, fresh);
  const { model } = await readMap(scene), a = tok.actor, h = a.hitPoints, square = squareOf(tok, scene);
  const speeds = a.system.movement?.speeds ?? {}, extra = Object.fromEntries(["fly", "swim", "climb", "burrow"].filter(k => speeds[k]?.value).map(k => [k, speeds[k].value]));
  const you = { label: labels[tok.id], name: tok.name, square, size: a.size, actionsLeft: Math.max(0, actionsOf(a, combat) - (turn.spent ?? 0)), attacksMade: turn.attacks ?? 0, hp: `${h.value}/${h.max}`, speed: speeds.land?.value ?? 0, ...(Object.keys(extra).length ? { speeds: extra } : {}), conditions: (a.conditions?.active ?? []).map(c => c.value ? `${c.slug} ${c.value}` : c.slug), strikes: await strikesOf(a), abilities: abilitiesOf(a), tactics: tacticsOf(scene, tok) };
  const cover = game.modules.get(VISIONER)?.active ? game.modules.get(VISIONER).api : null;
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
/** Live values for the legality check. Reach and distance need the canvas on the fight scene. used: what this request's finished steps took. Names are
    labels, because a refusal's reason goes back to the thinker; the card puts names in. */
function gather(combat, req, used = { actions: 0, attacks: 0 }) {
  const scene = combat.scene, tok = scene.tokens.get(req.tokenId), actor = tok.actor;
  const strikes = strikesWithIds(actor).map(({ id, strike: a }) => ({ id, name: a.label, reach: actor.getReach({ action: "attack", weapon: a.item }), ranged: !!a.item?.isRanged, maxRange: a.item?.range?.max ?? null }));
  /* only what it perceived when asked, and still does: a plan can't name anything else */
  const now = new Map(sense(combat, tok, turns(combat).memory?.[tok.id] ?? {}).map(o => [o.id, o])), targets = {};
  for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const o = now.get(tokenId); if (o && canTarget(o.state)) targets[label] = { name: label, distance: o.distance, flat: flatDC(o.state) }; }
  return { actions: Math.max(0, actionsOf(actor, combat) - (req.spent ?? 0) - used.actions), attacksBefore: (req.attacks ?? 0) + used.attacks, strikes, targets };
}
/** Hand a plan in. Any GM may call this; the runner checks it. meta says who made it ({ by: "chat" | "api" | "gm", model, generation, usage }); a plan
    from an older chat's generation is ignored. The plan is stored as it came and cleaned by the runner, so tries are counted in one place. */
export async function submitPlan(combat, requestId, plan, meta = {}) {
  const r = request(combat, requestId); if (!r) throw new Error("No such request."); if (r.state !== "requested" && r.state !== "ready") throw new Error(`That turn is ${r.state}.`);
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
  const c = checkPlan(clean.plan, gather(combat, r));
  if (!c.ok) return reject(combat, requestId, c.reason);
  await save(combat, requestId, { state: "ready", plan: whole(clean.plan), steps: c.steps, verdict: null });
  const tok = combat.scene.tokens.get(r.tokenId);
  if (tok?.getFlag(ID, "auto")) doIt(combat, requestId).catch(e => console.error(e));
  return { state: "ready", steps: c.steps };
}
/* The reason goes back to the thinker once, as a retry event. A second refusal goes to the GM. */
async function reject(combat, requestId, reason) {
  const tries = (request(combat, requestId).tries ?? 0) + 1, last = tries >= MAX_TRIES, at = `requests.${requestId}`;
  await saveTurns(combat, { [`${at}.state`]: "requested", [`${at}.tries`]: tries, [`${at}.verdict`]: last ? `Couldn't do: ${reason}` : reason, ...(last ? {} : eventChange("retry", requestId, tries)) });
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
export function checkOnly(combat, requestId, plan) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (!r) throw new Error("No such request.");
  if (!onFightScene(combat)) throw new Error("This page doesn't have the fight's map open, so it can't tell.");
  const clean = cleanPlan(plan); if (!clean.ok) return { ok: false, reason: clean.reason };
  return checkPlan(clean.plan, gather(combat, r));
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
  await save(combat, requestId, { state: "running", go: false, hold: false, note: null });   /* pressing Do it means go, whatever was held */
  const tok = combat.scene.tokens.get(r.tokenId);
  for (let i = r.pos ?? 0; i < r.steps.length; i++) {
    const now = { ...request(combat, requestId), id: requestId }, step = r.steps[i];   /* a stored request doesn't carry its own id; replan needs it */
    if (now.state === "manual") return;
    if (now.hold) return save(combat, requestId, { state: "held", hold: false, note: "Held before the next step." });
    /* look again before an action that hasn't begun. One begun before a reload carries on, never re-planned halfway. */
    if (!Object.keys(now.log?.[i] ?? {}).length) { const why = lookAgain(combat, now, i, tok); if (why.length) return replan(combat, now, i, why, tok); }
    if (step.do === "strike") {
      const target = combat.scene.tokens.get(r.labels[step.target]); if (!target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
      let result; try { result = await runStrike(combat, requestId, i, step, tok, target); } catch (e) { console.error(e); result = "ask"; await save(combat, requestId, { note: e.message }); }
      if (result === "stopped") return save(combat, requestId, { state: "stopped" });
      if (result === "ask") return save(combat, requestId, { state: "stopped", note: `${request(combat, requestId).note ?? ""} Step ${i + 1} may not have finished. Check the chat and HP, then play the rest yourself.`.trim() });
    }
    if (request(combat, requestId).state === "manual") return;
    if (i + 1 >= r.steps.length) return save(combat, requestId, { pos: i + 1, state: "done" });
    if (!tok.getFlag(ID, "auto")) return save(combat, requestId, { pos: i + 1, state: "ready" });   /* Next step */
    await save(combat, requestId, { pos: i + 1 });
    await pauseBetween(combat, requestId);
  }
  if (request(combat, requestId).state !== "manual") return save(combat, requestId, { state: "done" });
}
/** What changed since the plan was made, or why the next step no longer works. Empty when it can go on. */
function lookAgain(combat, r, i, tok) {
  if (!r.seen || !tok.object) return [];   /* a request from before 0.4.0 has no baseline */
  const changes = changesSince(r.seen, situationNow(combat, tok, r.labels));
  if (changes.length) return changes;
  const rest = checkPlan({ steps: (r.plan?.steps ?? []).slice(i) }, gather(combat, r, spentBy(r.steps.slice(0, i))));
  return rest.ok ? [] : [{ who: "plan", what: "illegal", reason: rest.reason }];
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
export const busy = () => starting.size > 0 || judging.size > 0 || running.size > 0 || game.combats.filter(c => c.started).some(c => requestBusy(currentRequest(c)));
export const hold = (combat, id) => save(combat, id, { hold: true });
export const playMyself = (combat, id) => save(combat, id, { state: "manual" });
