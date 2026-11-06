/* A fight's turns, on the active GM's browser with the fight scene open. Everything is kept on the Combat's flag, so a reload or a summarised
   chat loses nothing. For now it runs Strikes; see claude/encounter-builder-plan.md for the rest of step 2. */
import { checkPlan, damageOptions, nextAction } from "./turn.mjs";

const ID = "lythara-encounter-builder", WORKBENCH = "xdy-pf2e-workbench", STEP_MS = 20000, SETTLE_MS = 400;
const isActive = () => game.users.activeGM?.id === game.user.id;
const turns = combat => combat.getFlag(ID, "turns") ?? { requests: {} };
export const applySetting = () => game.settings.get(ID, "applyMonsterDamage");
/* frequent writes: don't make the tracker redraw for each one */
async function save(combat, id, change) { await combat.update({ [`flags.${ID}.turns.requests.${id}`]: foundry.utils.mergeObject(foundry.utils.deepClone(turns(combat).requests[id] ?? {}), change) }, { render: false, [ID]: { quiet: true } }); }
const request = (combat, id) => turns(combat).requests[id];
export const currentRequest = combat => Object.entries(turns(combat).requests).map(([id, r]) => ({ id, ...r })).filter(r => !["done", "manual"].includes(r.state)).at(-1) ?? null;
/** The last finished turn, if it left something for the GM to read. */
export const lastNote = combat => Object.entries(turns(combat).requests).map(([id, r]) => ({ id, ...r })).filter(r => r.state === "done" && r.note).at(-1) ?? null;
const hostile = t => t.actor?.isOfType?.("npc");
const tokenOf = (combat, c) => c?.token ?? null;
/* a chance to stop before each stage, which the reload tests use */
function stepGate(stage, id) { return Hooks.call(`${ID}.step`, stage, id) !== false; }

/* ---------- a turn starts ---------- */
export async function onStartTurn(combatant, combat) {
  if (!isActive() || !combat?.started) return;
  const tok = tokenOf(combat, combatant); if (!tok?.getFlag(ID, "run") || !hostile(tok)) return;
  if (Object.values(turns(combat).requests).some(r => r.combatantId === combatant.id && r.round === combat.round && r.turn === combat.turn)) return;
  await new Promise(r => setTimeout(r, SETTLE_MS));   /* start-of-turn effects; how long is enough is still to be measured */
  if (combat.combatant?.id !== combatant.id) return;
  const id = foundry.utils.randomID(8), others = combat.combatants.filter(c => c.token && !hostile(c.token) && c.actor?.isOfType?.("character")), labels = Object.fromEntries(others.map((c, i) => [`E${i + 1}`, c.token.id]));
  await save(combat, id, { state: "requested", combatantId: combatant.id, tokenId: tok.id, round: combat.round, turn: combat.turn, labels, at: Date.now(), log: {} });
}
/** Live values for the legality check. Reach and distance need the canvas on the fight scene. */
function gather(combat, req) {
  const scene = combat.scene, tok = scene.tokens.get(req.tokenId), actor = tok.actor;
  if (canvas.scene?.id !== scene.id) return { error: "Open the fight scene first." };
  const strikes = (actor.system.actions ?? []).filter(a => a.type === "strike").map(a => ({ id: a.slug ?? a.item?.id, name: a.label, reach: actor.getReach({ action: "attack", weapon: a.item }), ranged: !!a.item?.isRanged, maxRange: a.item?.range?.max ?? null }));
  const targets = {}; for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const t = scene.tokens.get(tokenId); if (t?.object && tok.object) targets[label] = { name: t.name, distance: tok.object.distanceTo(t.object) }; }
  return { actions: 3, strikes, targets };
}
/** Hand a plan in. Any GM may call this; the active GM checks it. */
export async function submitPlan(combat, requestId, plan) {
  const r = request(combat, requestId); if (!r) throw new Error("No such request."); if (r.state !== "requested" && r.state !== "ready") throw new Error(`That turn is ${r.state}.`);
  await save(combat, requestId, { plan, state: "submitted", verdict: null });
  if (isActive()) await judge(combat, requestId);
  for (let i = 0; i < 40; i++) { await new Promise(res => setTimeout(res, 250)); const n = request(combat, requestId); if (n.state !== "submitted") return { state: n.state, reason: n.verdict }; }
  return { state: "submitted", reason: "The active GM hasn't answered." };
}
/* the plan is checked once, and a turn runs once: the updateCombat hook and the submitter can both arrive here, and Auto calls doIt straight after */
const judging = new Set(), running = new Set();
export async function judge(combat, requestId) {
  if (!isActive() || judging.has(requestId) || request(combat, requestId)?.state !== "submitted") return null;
  judging.add(requestId); try { return await judgeNow(combat, requestId); } finally { judging.delete(requestId); }
}
async function judgeNow(combat, requestId) {
  const r = request(combat, requestId), ctx = gather(combat, r); if (ctx.error) { await save(combat, requestId, { state: "requested", verdict: ctx.error }); return { state: "requested", reason: ctx.error }; }
  const c = checkPlan(r.plan, ctx); await save(combat, requestId, c.ok ? { state: "ready", steps: c.steps, verdict: null } : { state: "requested", verdict: c.reason });
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
const waitFor = type => new Promise((res, rej) => { const t = setTimeout(() => { pending?.waiters.delete(type); rej(new Error(`No ${type} card came.`)); }, STEP_MS); pending.waiters.set(type, m => { clearTimeout(t); pending.waiters.delete(type); res(m); }); });
const clickWith = key => new MouseEvent("click", { shiftKey: !!game.user.settings?.[key] });   /* PF2e flips the dialog on Shift */

async function runStrike(combat, id, i, step, tok, target) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const strike = (tok.actor.system.actions ?? []).find(a => (a.slug ?? a.item?.id) === step.item); if (!strike) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  for (let guard = 0; guard < 8; guard++) {
    const now = nextAction(get(), { apply: applySetting() });
    if (now === "next") return "next";
    if (now === "ask") return "ask";
    if (!stepGate(now, id)) return "stopped";
    pending = { tokenId: tok.id, waiters: new Map() };
    try {
      if (now === "attack") {
        await record({ started: true });
        const card = waitFor("attack-roll"), roll = await strike.variants[step.variant].roll({ event: clickWith("showCheckDialogs"), target: target.object }), message = await card;
        await record({ attack: { message: message.id, degree: roll?.degreeOfSuccess ?? message.rolls?.[0]?.degreeOfSuccess ?? 0 } });
      } else if (now === "damage") {
        const degree = get().attack.degree; await record({ damageStarted: true });
        const card = waitFor("damage-roll"); await strike[degree === 3 ? "critical" : "damage"]({ event: clickWith("showDamageDialogs"), target: target.object, mapIncreases: step.variant });
        await record({ damage: { message: (await card).id } });
      } else if (now === "apply") {
        const message = game.messages.get(get().damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        await record({ applying: true });
        await applyFromCard(message, roll, target);
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
/** Do it: run the steps in order. Safe to call again after a reload: finished work is never repeated. */
export async function doIt(combat, requestId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  if (!isActive()) throw new Error(`${game.users.activeGM?.name} is the active GM, so it runs in their browser.`);
  if (canvas.scene?.id !== combat.scene?.id) throw new Error("Open the fight scene first.");
  if (running.has(requestId)) return;
  running.add(requestId); try { await runTurn(combat, requestId); } finally { running.delete(requestId); }
}
async function runTurn(combat, requestId) {
  const r = request(combat, requestId); if (!["ready", "running", "held", "stopped"].includes(r?.state)) throw new Error("That turn isn't ready.");
  await save(combat, requestId, { state: "running", note: null });
  const tok = combat.scene.tokens.get(r.tokenId);
  for (const [i, step] of r.steps.entries()) {
    if (request(combat, requestId).hold) return save(combat, requestId, { state: "held", hold: false, note: "Held before the next step." });
    if (step.do !== "strike") continue;
    const target = combat.scene.tokens.get(r.labels[step.target]); if (!target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
    let result; try { result = await runStrike(combat, requestId, i, step, tok, target); } catch (e) { console.error(e); result = "ask"; await save(combat, requestId, { note: e.message }); }
    if (result === "stopped") return save(combat, requestId, { state: "stopped" });
    if (result === "ask") return save(combat, requestId, { state: "stopped", note: `${request(combat, requestId).note ?? ""} Step ${i + 1} may not have finished. Check the chat and HP, then play the rest yourself.`.trim() });
  }
  return save(combat, requestId, { state: "done" });
}
export const hold = (combat, id) => save(combat, id, { hold: true });
export const playMyself = (combat, id) => save(combat, id, { state: "manual" });
