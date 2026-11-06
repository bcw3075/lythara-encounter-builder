/* A fight's turns. One named account does the work (the runner: the Claude Bridge unless the setting says otherwise), on its own page with the
   fight scene open; any other GM's browser only asks it to, through the Combat's flag. Everything is kept on that flag, so a reload or a
   summarised chat loses nothing. For now it runs Strikes; see claude/encounter-builder-plan.md for the rest of step 2. */
import { checkPlan, currentOf, damageOptions, latestNote, nextAction } from "./turn.mjs";

const ID = "lythara-encounter-builder", WORKBENCH = "xdy-pf2e-workbench", STEP_MS = 20000, SETTLE_MS = 400, SCENE_MS = 30000, RESUMABLE = ["ready", "running", "held", "stopped"];
export const runnerName = () => game.settings.get(ID, "runner");
const runner = () => game.users.getName(runnerName());
const isRunner = () => game.user.isGM && runner()?.id === game.user.id;
/** What the card should say when nobody can run a turn; null when the runner is there. */
export function runnerProblem() {
  const u = runner(); if (!u) return `There's no account called ${runnerName()}, so monster turns wait. Change it in the module's settings, or play this turn yourself.`;
  return u.active ? null : `${u.name} is offline, so monster turns wait. They carry on when it's back, or play this turn yourself.`;
}
const turns = combat => combat.getFlag(ID, "turns") ?? { requests: {} };
export const applySetting = () => game.settings.get(ID, "applyMonsterDamage");
/* frequent writes: don't make the tracker redraw for each one. Two browsers write here, so only the change goes: a whole copy of the request could
   put back what the other just wrote. */
async function save(combat, id, change) { await combat.update({ [`flags.${ID}.turns.requests.${id}`]: change }, { render: false, [ID]: { quiet: true } }); }
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
  if (canvas.scene?.id === combat.scene?.id && canvas.ready) return true;
  try { await within(combat.scene.view(), SCENE_MS, "Opening the fight map took too long."); } catch (e) { console.error(`${ID} | scene`, e); return false; }
  return canvas.scene?.id === combat.scene?.id;
}
const within = (work, ms, words) => { let timer; return Promise.race([work, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(words)), ms); })]).finally(() => clearTimeout(timer)); };

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
    const id = foundry.utils.randomID(8), others = combat.combatants.filter(c => c.token && !hostile(c.token) && c.actor?.isOfType?.("character")), labels = Object.fromEntries(others.map((c, i) => [`E${i + 1}`, c.token.id]));
    await save(combat, id, { state: "requested", combatantId: combatant.id, tokenId: tok.id, round: combat.round, turn: combat.turn, labels, at: Date.now(), log: {}, note: opened ? null : cantOpen() });
  } finally { starting.delete(key); }
}
const cantOpen = () => `${game.user.name} couldn't open the fight map. Play this turn yourself.`;
/** The runner's answer to any change on the Combat. */
export function onCombatUpdate(combat, change) {
  if (!isRunner()) return;
  if ("turn" in change || "round" in change) onTurnChange(combat).catch(e => console.error(`${ID} | turn`, e));
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
/** Live values for the legality check. Reach and distance need the canvas on the fight scene. */
function gather(combat, req) {
  const scene = combat.scene, tok = scene.tokens.get(req.tokenId), actor = tok.actor;
  const strikes = (actor.system.actions ?? []).filter(a => a.type === "strike").map(a => ({ id: a.slug ?? a.item?.id, name: a.label, reach: actor.getReach({ action: "attack", weapon: a.item }), ranged: !!a.item?.isRanged, maxRange: a.item?.range?.max ?? null }));
  const targets = {}; for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const t = scene.tokens.get(tokenId); if (t?.object && tok.object) targets[label] = { name: t.name, distance: tok.object.distanceTo(t.object) }; }
  return { actions: 3, strikes, targets };
}
/** Hand a plan in. Any GM may call this; the runner checks it. */
export async function submitPlan(combat, requestId, plan) {
  const r = request(combat, requestId); if (!r) throw new Error("No such request."); if (r.state !== "requested" && r.state !== "ready") throw new Error(`That turn is ${r.state}.`);
  await save(combat, requestId, { plan, state: "submitted", verdict: null });
  if (isRunner()) await judge(combat, requestId);
  for (let i = 0; i < 40; i++) { await new Promise(res => setTimeout(res, 250)); const n = request(combat, requestId); if (n.state !== "submitted") return { state: n.state, reason: n.verdict }; }
  return { state: "submitted", reason: runnerProblem() ?? `${runnerName()} hasn't answered.` };
}
/* the plan is checked once, and a turn runs once: the updateCombat hook and the submitter can both arrive here, and Auto calls doIt straight after */
const judging = new Set(), running = new Set();
export async function judge(combat, requestId) {
  if (!isRunner() || judging.has(requestId) || request(combat, requestId)?.state !== "submitted") return null;
  judging.add(requestId); try { return await judgeNow(combat, requestId); } finally { judging.delete(requestId); }
}
async function judgeNow(combat, requestId) {
  if (!await ensureScene(combat)) { await save(combat, requestId, { state: "requested", verdict: cantOpen() }); return { state: "requested", reason: cantOpen() }; }
  const r = request(combat, requestId), ctx = gather(combat, r), c = checkPlan(r.plan, ctx); await save(combat, requestId, c.ok ? { state: "ready", steps: c.steps, verdict: null } : { state: "requested", verdict: c.reason });
  const tok = combat.scene.tokens.get(r.tokenId);
  if (c.ok && tok?.getFlag(ID, "auto")) doIt(combat, requestId).catch(e => console.error(e));
  return c.ok ? { state: "ready", steps: c.steps } : { state: "requested", reason: c.reason };
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
const stopAiming = () => { if (game.user.targets.size) canvas.tokens?.setTargets?.([], { mode: "replace" }); };

async function runStrike(combat, id, i, step, tok, target) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const strike = (tok.actor.system.actions ?? []).find(a => (a.slug ?? a.item?.id) === step.item); if (!strike) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  for (let guard = 0; guard < 8; guard++) {
    const now = nextAction(get(), { apply: applySetting() });
    if (now === "next") return "next";
    if (now === "ask") return "ask";
    if (!stepGate(now, id)) return "stopped";
    if (!await ensureScene(combat)) throw new Error(cantOpen());
    pending = { tokenId: tok.id, waiters: new Map() };
    try {
      if (now === "attack") {
        aimAt(target); await record({ started: true });
        const { message, roll } = await watched(async () => { const card = waitFor("attack-roll"), roll = await strike.variants[step.variant].roll({ event: clickWith("showCheckDialogs"), target: target.object }); return { message: await card, roll }; });
        await record({ attack: { message: message.id, degree: roll?.degreeOfSuccess ?? message.rolls?.[0]?.degreeOfSuccess ?? 0 } });
      } else if (now === "damage") {
        const degree = get().attack.degree; aimAt(target); await record({ damageStarted: true });
        const message = await watched(async () => { const card = waitFor("damage-roll"); await strike[degree === 3 ? "critical" : "damage"]({ event: clickWith("showDamageDialogs"), target: target.object, mapIncreases: step.variant }); return card; });
        await record({ damage: { message: message.id } });
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
/** Do it: on the runner, run the steps in order. Safe to call again after a reload: finished work is never repeated. From anyone else's browser it asks
    the runner, through the flag; a turn never runs quietly in the wrong browser. */
export async function doIt(combat, requestId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  if (!isRunner()) { const why = runnerProblem(); if (why) throw new Error(why); return save(combat, requestId, { go: true }); }
  if (running.has(requestId)) return;
  running.add(requestId); try { await runTurn(combat, requestId); } finally { running.delete(requestId); stopAiming(); }
}
async function runTurn(combat, requestId) {
  const r = request(combat, requestId); if (!RESUMABLE.includes(r?.state)) throw new Error("That turn isn't ready.");
  if (!await ensureScene(combat)) return save(combat, requestId, { state: "stopped", go: false, note: cantOpen() });
  await save(combat, requestId, { state: "running", go: false, note: null });
  const tok = combat.scene.tokens.get(r.tokenId);
  for (const [i, step] of r.steps.entries()) {
    const now = request(combat, requestId);
    if (now.state === "manual") return;
    if (now.hold) return save(combat, requestId, { state: "held", hold: false, note: "Held before the next step." });
    if (step.do !== "strike") continue;
    const target = combat.scene.tokens.get(r.labels[step.target]); if (!target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
    let result; try { result = await runStrike(combat, requestId, i, step, tok, target); } catch (e) { console.error(e); result = "ask"; await save(combat, requestId, { note: e.message }); }
    if (result === "stopped") return save(combat, requestId, { state: "stopped" });
    if (result === "ask") return save(combat, requestId, { state: "stopped", note: `${request(combat, requestId).note ?? ""} Step ${i + 1} may not have finished. Check the chat and HP, then play the rest yourself.`.trim() });
  }
  if (request(combat, requestId).state !== "manual") return save(combat, requestId, { state: "done" });
}
export const hold = (combat, id) => save(combat, id, { hold: true });
export const playMyself = (combat, id) => save(combat, id, { state: "manual" });
