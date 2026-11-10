/* A fight's turns. One named account does the work (the runner: the Claude Bridge unless the setting says otherwise), on its own page with the
   fight scene open; any other GM's browser only asks it to, through the Combat's flag. Everything is kept on that flag, so a reload or a
   summarised chat loses nothing. It runs Strikes, Strides, Steps, Crawls, Fly, Swim, Climb, Release, Stand, Drop Prone, Take Cover, abilities, spells, Hide, Sneak, Seek, Interact, Delay and fleeing off the map; what is still to come is in the repo's docs/features and the project's plan doc. */
import { CHANGEABLE, NOTE_MAX, changeProblem, describeStep, noteForThinker } from "./turn.mjs";
import { CHECK_OUTCOMES, CHECK_WORD, FOLLOW_UPS, MAX_REPLANS, OUTCOMES, POSTURES, SIDES, WORD, absorbOwn, movedOn, shouldFall, shouldSink, edgeSides, areaHurt, forThinker, listWords, nextArea, nextSpell, spellActions, spellMultiplier, spellRange, spellTargets, followUpOutcome, lastAction, nextAbility, changesSince, checkPlan, coverAfterTaking, currentOf, damageOptions, describeChanges, doneStep, endsCover, isMove, latestNote, nextAction, nextCover, nextMove, nextPosture, nextStealth, requestBusy, revealsAfter, revealsBefore, situationOf, spentBy, strikeIds, nextInteract, nextClimb, climbResult } from "./turn.mjs";
import { BURROW_DEPTH, FT, burrowWorld, crossesWalls, cutShort, diagonalsIn, featureNear, findRoute, findStep, flyWaypoints, flyWorld, footprintAt, heightWhenCut, rockSquares, routeWords, swimWorld, glideWorld, treeTop, treesBeside, wallSquares, waterKinds, waterUnder } from "./move.mjs";
import { actionsFor, assignLabels, canTarget, flatDC, groundAround, healthEntries, healthWord, labelsOf, lightAt, packetOf, perceiveOne, plainText, remember, sensesOf, strikeMods, tacticsFor, visibleConditions } from "./perceive.mjs";
import { readMap, partySize, suggestedLevel } from "./builder.mjs";
import { aimArea, aimWords, alliesCaught, burstReachable, caughtBy, shapeOf, squaresNear } from "./area.mjs";
import { MAX_TRIES, cleanMeta, cleanPlan, eventOut, hello, listening, live, nextSeq, pickEvent, stale, stallOf, text, waitSeconds } from "./brain.mjs";

const ID = "lythara-encounter-builder", WORKBENCH = "xdy-pf2e-workbench", TOOLBELT = "pf2e-toolbelt", VISIONER = "pf2e-visioner", HUD = "pf2e-hud", GROUND_RADIUS = 10, STEP_MS = 20000, SETTLE_MS = 400, SCENE_MS = 30000, RESUMABLE = ["ready", "running", "held", "stopped", "saves"];
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
async function save(combat, id, change) {
  if (["state", "pos", "log"].some(k => k in change)) change = { ...change, since: clock() };   /* it moved on: the stall check counts from here */
  await combat.update({ [`flags.${ID}.turns.requests.${id}`]: change }, { render: false, [ID]: { quiet: true } }); }
const saveTurns = (combat, change) => combat.update(Object.fromEntries(Object.entries(change).map(([k, v]) => [`flags.${ID}.turns.${k}`, v])), { render: false, [ID]: { quiet: true } });
const request = (combat, id) => turns(combat).requests[id];
export const currentRequest = combat => currentOf(turns(combat).requests, combat.round, combat.combatant?.id);   /* only this turn's: an old unfinished one stays out of the way */
/** The last finished turn, if it left something for the GM to read. */
export const lastNote = combat => latestNote(turns(combat).requests);
/** A party member the GM plays (Rhea, 2026-11-09: "the option is OK to be there, but always have the default be unticked"): a character no player owns.
    Angel can run it like a monster, only when the GM ticks it; the module never ticks it. */
export const partyMember = actor => !!actor?.isOfType?.("character") && !actor.hasPlayerOwner && actor.alliance === "party";   /* a villain built as a character isn't one (0.18.0 review) */
/** Who Angel can run: a monster (any NPC, on either side) or a party member the GM plays. */
export const runnable = t => !!t?.actor?.isOfType?.("npc") || partyMember(t?.actor);
/** On the party's side (a party member, or an NPC fighting with the party): fleeing off the map is a monster's escape, not theirs. */
const onParty = actor => actor?.alliance === "party";
/** What the thinker calls a character (0.18.0): never its name (the module's rule: no PC's name goes to the thinker), but its ancestry and class. */
const kindOf = actor => [actor?.ancestry?.name, actor?.class?.name].filter(Boolean).join(" ") || (actor?.type === "familiar" ? "familiar" : actor?.isOfType?.("npc") ? "companion" : "party member");
/** Only a monster's own kind of name goes to the thinker: an NPC no player owns. A character, a familiar or a player's companion (often named after its
    master or given a pet's name) goes as what it is (0.18.0 review). */
const nameFor = tok => tok.actor?.isOfType?.("npc") && !tok.actor.hasPlayerOwner ? tok.name : kindOf(tok.actor);
/** HP with temporary HP, for the history's "from 18 to 9" (kept on the step's record when damage is applied). */
const hpNow = tok => (tok?.actor?.hitPoints?.value ?? 0) + (tok?.actor?.hitPoints?.temp ?? 0);
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
const strikesWithIds = actor => { const list = (actor.system.actions ?? []).filter(a => a.type === "strike" && (actor.isOfType?.("npc") || (a.ready !== false && a.visible !== false))),   /* a character's Strike with a stowed weapon isn't ready; an NPC's always counts (a Goblin's worn shortbow shoots) */ ids = strikeIds(list.map(a => ({ slug: a.slug ?? a.item?.id, ranged: !!a.item?.isRanged }))); return list.map((a, i) => ({ id: ids[i], strike: a })); };
const conditionsOn = actor => (actor.conditions?.active ?? []).map(c => c.slug);
const squareOf = (tok, scene) => { const px = scene.grid.size, d = scene.dimensions; return [Math.round((tok.x - d.sceneX) / px), Math.round((tok.y - d.sceneY) / px)]; };
/** Where a token really is for distances, as PF2e's `distanceTo` measures it (its `mechanicalBounds`, PF2e 8.7.0): { pos, span } in squares, pos fractional
    when it sits off the grid (a Small creature dropped between squares), span its real width. A Tiny token counts as the whole square holding its top-left
    corner. Routes, occupancy and the square the thinker is told use squareOf and sizeOf. Rounded to a millionth so pixel arithmetic can't land a hair off a
    whole square. */
const placeOf = (tok, scene) => {
  const px = scene.grid.size, d = scene.dimensions, f = v => Math.round(v * 1e6) / 1e6, x = f((tok.x - d.sceneX) / px), y = f((tok.y - d.sceneY) / px), w = Number(tok.width) || 1;
  return (tok.isTiny ?? w < 1) ? { pos: [Math.floor(x), Math.floor(y)], span: 1 } : { pos: [x, y], span: Math.max(1, w) };
};
/** Is the token off the grid (its top-left corner between squares)? Its square is then the one it rounds to, while distances are from where it is. */
const offGrid = (tok, scene) => { const { pos } = placeOf(tok, scene); return !Number.isInteger(pos[0]) || !Number.isInteger(pos[1]); };
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
  const senses = sensesOf([...(me.perception?.senses ?? [])], { deafened: conds.includes("deafened") }), below = isBelow(tok);   /* burrowed: only tremorsense reaches it (0.16.0) */
  return enemiesOf(scene, tok).map(t => {
    const from = tok.object.center, to = t.object.center, distance = tok.object.distanceTo(t.object), theirs = conditionsOn(t.actor);
    const { state, by } = perceiveOne({ senses, blinded: conds.includes("blinded"), dazzled: conds.includes("dazzled"), sees: !blocked("sight", from, to), heard: !blocked("sound", from, to), light: lightOn(to, scene), distance, invisible: theirs.includes("invisible"), concealed: theirs.includes("concealed"), stored: vis?.getVisibility(tok.id, t.id) ?? null, avs, known: !!memory[t.id], below, aloft: heightUp(t) > 0 });
    return { id: t.id, token: t, state, by, distance, square: squareOf(t, scene) };
  });
}
const healthWords = () => healthEntries(game.settings.get("pf2e-hud", "healthStatusData"), game.i18n.localize("pf2e-hud.health-status.default"));
/* dead: core's Dead status, or a monster at 0 HP that isn't dying or unconscious (PF2e's NPCs die at 0); anyone else at 0 HP is "Down" */
const isDeadNow = actor => !!actor.statuses?.has?.("dead") || (actor.type === "npc" && (actor.hitPoints?.value ?? 1) <= 0 && !actor.hasCondition?.("dying") && !actor.hasCondition?.("unconscious"));
const wordsFor = actor => { try { return healthWord(actor.hitPoints ?? {}, healthWords(), { dead: isDeadNow(actor) }); } catch { const h = actor.hitPoints; return h?.max ? (h.value <= 0 ? (isDeadNow(actor) ? "Dead" : "Down") : h.value >= h.max ? "Unhurt" : "Hurt") : null; } };   /* PF2e HUD may be off or renamed its setting */
function gearOf(actor) {
  /* what it looks like: never a rune or an item's hidden name. PF2e builds "+1 Striking Longsword" from the runes; the source name is the plain one. */
  const show = i => i.isIdentified === false ? (i.system.identification?.unidentified?.name ?? i._source?.name ?? i.name) : (i._source?.name ?? i.name);
  return [...(actor.itemTypes?.weapon ?? []).filter(i => i.system.equipped?.carryType === "held"), ...(actor.itemTypes?.shield ?? []).filter(i => i.system.equipped?.carryType === "held"), ...(actor.itemTypes?.armor ?? []).filter(i => i.isWorn)].map(show);
}
function actionsOf(actor, combat) {
  const n = s => actor.getCondition?.(s)?.value ?? 0, r = actor.getFlag(WORKBENCH, "stunReduction"), reduced = r && r.combat === combat.id && r.round === combat.round ? r.reducedBy : 0;
  return actionsFor({ quickened: actor.hasCondition?.("quickened"), slowed: n("slowed"), stunned: n("stunned"), reduced });
}
/* Ammunition (Rhea, 2026-11-08: "Module takes 1 Arrow itself"). PF2e Ranged Combat 8.0.7 reads a monster's ammunition one short (it sees 1 Arrow as none)
   and its shot then takes 2 (a player's takes 1: tested with Valeros). So on a monster's shot the module turns Ranged Combat's counting off with its own
   "skip-post-processing" roll option and takes the weapon's expend itself, from the stack Ranged Combat's check chose. Its check before the shot still
   reads one short, so the last Arrow can't be fired: `shotsLeft` is what that check lets through, read from Ranged Combat itself so it follows its
   version. Without Ranged Combat, PF2e's own count (an NPC's attack has no ammunition linked, so nothing is counted or taken). */
const RANGED = "pf2e-ranged-combat", rangedOn = () => !!game.modules.get(RANGED)?.active;
let rangedSystem = null;
async function rangedWeapons() { if (!rangedOn()) return null; try { rangedSystem ??= (await import(foundry.utils.getRoute(`modules/${RANGED}/scripts/weapons/system.js`))).WeaponSystem; return rangedSystem; } catch (e) { console.warn(`${ID} | Ranged Combat`, e); return null; } }
/** What a Strike's shots use: null if nothing is counted, otherwise { shotsLeft, ammo (its name), stack (the item id it takes from), expend }. */
export async function ammoOf(actor, strike) {
  const item = strike.item; if (!item?.isRanged) return null;
  if (actor.type === "npc" && rangedOn()) {
    const W = await rangedWeapons(); let w = null; try { w = W?.transformWeapon(actor, item); } catch (e) { console.warn(`${ID} | Ranged Combat weapon`, e); }
    if (!W || !w) return { shotsLeft: null, unreadable: true };   /* Ranged Combat changed: it counts this shot itself, and the GM is told */
    if (w.expend == null || w.expend <= 0) return null;
    if (w.isRepeating || w.capacity > 0 || w.reloadActions > 0) return null;   /* weapons it loads: its own loading rules, not counted here */
    /* the stack its check will take from: the selected one (even when it reads it as empty), or the only usable one; several with none chosen,
       Ranged Combat would ask which, where nobody can answer, so no shot until the GM picks one */
    const all = w.compatibleAmmunition ?? [], usable = all.filter(a => a.quantity > 0), sel = w.selectedInventoryAmmunition;
    const pick = sel ? all.find(a => a.id === sel.id) ?? sel : usable.length === 1 ? usable[0] : null;
    if (!pick) return { shotsLeft: 0, ammo: usable.length ? "several kinds, none chosen in Ranged Combat" : (all[0]?.name ?? "ammunition"), stack: null, expend: w.expend };
    const uses = pick.quantity > 0 ? (pick.calculateTotalRemainingUses?.() ?? pick.quantity) : 0;
    return { shotsLeft: Math.floor(uses / w.expend), ammo: pick.name ?? "ammunition", stack: pick.id, expend: w.expend };
  }
  const expend = item.system?.expend ?? 0, a = item.ammo; if (!(expend > 0) || !a) return null;
  const left = a.isOfType?.("ammo") && a.system.uses?.max > 1 ? a.system.uses.value + (a.quantity - 1) * a.system.uses.max : a.quantity;
  return { shotsLeft: Math.floor(left / expend), ammo: a.name, stack: null, expend };
}
/** A Strike Ranged Combat refused this turn counts as having no shots for the rest of it, so a re-plan can't try it again (turns.noShot). */
const shotsFor = (combat, tok, id, m) => { const b = combat ? turns(combat).noShot?.[tok.id] : null; return b?.round === combat.round && b.items?.includes(id) ? 0 : m?.shotsLeft; };
const ammoFields = (m, left) => m && !m.unreadable ? { shotsLeft: left, ammo: m.ammo, ...(m.stack ? { stack: m.stack } : {}) } : {};
/** Take a monster's shot's ammunition from the stack (uses first, then the stack), as Ranged Combat would for one shot. */
async function takeAmmo(actor, ammo) {
  const it = ammo?.stack ? actor.items.get(ammo.stack) : null; if (!it) return null;
  let q = it.quantity, u = it.system.uses?.value ?? 1; const max = it.system.uses?.max ?? 1;
  for (let n = ammo.expend; n > 0 && q > 0; n--) { u -= 1; if (u <= 0) { q -= 1; u = max; } }
  await it.update({ "system.quantity": Math.max(0, q), ...(max > 1 ? { "system.uses.value": u } : {}) });
  return Math.max(0, q);
}
async function strikesOf(actor, combat = null, tok = null) {
  const out = []; for (const { id, strike: a } of strikesWithIds(actor)) {
    if (droppedWeapon(actor, a)) continue;   /* its weapon lies on the ground (a Release): "you.dropped" says so */
    let damage = null; try { damage = await a.damage({ getFormula: true }); } catch (e) { console.warn(`${ID} | damage formula`, e); }
    out.push({ id, name: a.label, mod: strikeMods(a.variants.map(v => v.label)), reach: actor.getReach({ action: "attack", weapon: a.item }), ...(a.item?.isRanged ? { range: a.item.range?.increment ?? null, maxRange: a.item.range?.max ?? null } : {}), damage: typeof damage === "string" ? damage : null, traits: (a.traits ?? []).map(t => t.name).filter(t => t !== "attack"), effects: a.item?.system?.attackEffects?.value ?? [], ...(await ammoOf(actor, a).then(m => ammoFields(m, shotsFor(combat, tok, id, m))).catch(() => ({}))) });
  } return out;
}
const localize = k => game.i18n.localize(k);
/** The monster's abilities (its action items) with the ids plans use: the slug, or the name made into one, with -2 and so on when two share it. kind is
    action, free, reaction or passive; cost the actions an action takes; usesLeft what its frequency has left (null if it has none); followUp the check a
    Grab, Knockdown, Push or Pull rolls (FOLLOW_UPS), with `effect` the word a Strike's effects list for it. */
function abilityList(actor) {
  const seen = new Map();
  const own = [...(actor.itemTypes?.action ?? []), ...(actor.isOfType?.("npc") ? [] : (actor.itemTypes?.feat ?? []).filter(i => ["action", "free", "reaction"].includes(i.system.actionType?.value)))];   /* a character's actions are mostly feats (0.18.0 review) */
  const list = own.map(i => {
    const slug = i.slug ?? game.pf2e.system.sluggify(i.name), n = (seen.get(slug) ?? 0) + 1; seen.set(slug, n);
    const kind = i.system.actionType?.value ?? "passive", f = i.system.frequency;
    return { item: i, id: n === 1 ? slug : `${slug}-${n}`, name: i.name, kind, cost: kind === "action" ? (i.actionCost?.value ?? i.system.actions?.value ?? 1) : kind === "free" ? 0 : null,
      traits: [...(i.system.traits?.value ?? [])], usesLeft: f ? (f.value ?? f.max ?? null) : null, followUp: FOLLOW_UPS[slug] ?? null, effect: FOLLOW_UPS[slug] ? slug : null };
  });
  /* A Strike can list Grab or Knockdown with no matching item on the creature (PF2e's attack effects don't need one): it can still use it, as the rules say */
  for (const { strike } of strikesWithIds(actor)) for (const e of strike.item?.system?.attackEffects?.value ?? []) {
    if (!FOLLOW_UPS[e] || list.some(a => a.id === e)) continue;
    const free = e.startsWith("improved-");
    list.push({ item: null, id: e, name: e.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "), kind: free ? "free" : "action", cost: free ? 0 : 1, traits: [], usesLeft: null, followUp: FOLLOW_UPS[e], effect: e });
  }
  return list;
}
/** For the packet: what each ability is, in plain words, with what the module does with a follow-up. */
function abilitiesOf(actor) {
  return abilityList(actor).map(a => ({ id: a.id, name: a.name, kind: a.kind, cost: a.cost, ...(a.traits.length ? { traits: a.traits } : {}), ...(a.usesLeft != null ? { usesLeft: a.usesLeft } : {}),
    ...(a.followUp ? { followUp: `${CHECK_WORD[a.followUp]} check, right after a Strike that lists ${a.effect} and hits` } : {}), text: a.item ? plainText(a.item.system.description?.value, localize) : "" }));
}
/* ---------- spells ---------- */
/* What it can cast now, from PF2e's own spellcasting sheet data (the list a sheet shows: prepared slots not yet expended, a spontaneous caster's known and
   signature spells by rank with the slots it has left, innate spells with their uses, focus spells and the focus pool, cantrips). One entry per spell per
   spellcasting entry, with the ranks it can be cast at and the pool each rank spends from: a spontaneous caster's slots of a rank are one pool shared by
   every spell of that rank, a prepared caster's copies of one spell at one rank are one pool, an innate spell's uses its own, focus spells the focus pool.
   Cantrips and at-will spells have none. Rituals and staffs, wands and scrolls aren't here. */
const CASTERS = ["prepared", "spontaneous", "innate", "focus"];
async function spellBook(actor) {
  const book = new Map(), counts = {}, focus = Number(actor.system.resources?.focus?.value) || 0, entries = (actor.spellcasting?.regular ?? []).filter(e => e.statistic && !e.isRitual && CASTERS.includes(e.category));
  /* ids stay the same through the turn: a spell known in two entries is "slug" in the first and "slug-2" in the second, whatever is left to cast, so a plan
     can't end up casting from the other entry once one runs out */
  const slugOf = s => s.slug ?? game.pf2e.system.sluggify(s.name), owners = new Map();
  for (const e of entries) for (const s of e.spells?.contents ?? []) { const k = slugOf(s), list = owners.get(k) ?? []; if (!list.includes(e.id)) list.push(e.id); owners.set(k, list); }
  for (const e of entries) {
    let sd; try { sd = await e.getSheetData(); } catch (x) { console.warn(`${ID} | spells`, x); continue; }
    for (const g of sd.groups ?? []) {
      const cantrips = g.id === "cantrips", groupRank = Number(g.id);
      for (const x of g.active ?? []) {
        const sp = x?.spell; if (!sp || x.expended) continue;
        const base = sp.original ?? sp, rank = cantrips || !Number.isInteger(groupRank) ? sp.rank : groupRank, fp = Number(base.system.cast?.focusPoints) || 0;
        let pool = null, left = null, cost = 1;
        if (fp > 0 || (e.isFocusPool && !base.isCantrip)) { pool = "focus"; left = focus; cost = Math.max(1, fp); }
        else if (cantrips || base.isCantrip) { /* at will */ }
        else if (e.isInnate) { const u = x.uses ?? base.system.location?.uses; if (!sp.atWill && u?.max > 0) { pool = `innate:${e.id}:${base.id}:${rank}`; left = Number(u.value) || 0; } }
        else if (e.isPrepared && !e.isFlexible) { pool = `prep:${e.id}:${rank}:${base.id}`; left = counts[pool] = (counts[pool] ?? 0) + 1; }
        else { pool = `slots:${e.id}:${rank}`; left = Number(g.uses?.value) || 0; }
        const key = `${e.id}:${base.id}`;
        if (!book.has(key)) {
          const slug = slugOf(base), n = Math.max(1, (owners.get(slug) ?? [e.id]).indexOf(e.id) + 1);
          const act = spellActions(base.system.time?.value), rng = spellRange(base.system.range?.value), save = base.system.defense?.save, text = plainText(base.system.description?.value, localize);
          book.set(key, { id: n === 1 ? slug : `${slug}-${n}`, name: base.name, entryId: e.id, spellId: base.id, ranks: [], minActions: act.min, maxActions: act.max, time: base.system.time?.value ?? "",
            range: rng.range, touch: rng.touch, rangeText: base.system.range?.value ?? "", targets: spellTargets(base.system.target?.value), targetText: base.system.target?.value ?? "",
            area: base.system.area?.type ? { type: base.system.area.type, size: base.system.area.value } : null, attack: !!base.isAttack, save: save?.statistic ? { stat: save.statistic, basic: !!save.basic } : null,
            damaging: Object.keys(base.system.damage ?? {}).length > 0, damage: Object.values(base.system.damage ?? {}).map(d => `${d.formula} ${d.type ?? ""}`.trim()).join(" + "),
            variants: !!base.hasVariants && act.min !== act.max, lasting: !!String(base.system.duration?.value ?? "").trim() || !!base.system.duration?.sustained, traits: [...(base.system.traits?.value ?? [])], critText: /critical success/i.test(text), dc: e.statistic.dc?.value ?? null, attackMod: e.statistic.check?.mod ?? null, text });
        }
        const s = book.get(key), had = s.ranks.find(r => r.rank === rank);
        if (had) { if (pool?.startsWith("prep:")) had.left = left; } else s.ranks.push({ rank, pool, left, cost });
      }
    }
  }
  return [...book.values()].map(s => ({ ...s, ranks: s.ranks.sort((a, b) => a.rank - b.rank) }));
}
/** For the packet: each spell in plain words, with the ranks it can be cast at and what each has left. */
function spellsOf(book) {
  const cap = (t, n) => t.length > n ? `${t.slice(0, n - 1)}…` : t;
  return book.map(s => ({ id: s.id, name: s.name, ranks: Object.fromEntries(s.ranks.map(r => [r.rank, r.pool == null ? "at will" : r.pool === "focus" ? `${r.left} focus point${r.left === 1 ? "" : "s"} (costs ${r.cost})` : r.left])),
    actions: s.time, ...(s.rangeText ? { range: s.rangeText } : {}), ...(s.targetText ? { targets: s.targetText } : {}), ...(s.area ? { area: `${s.area.size}-foot ${s.area.type}`, aim: aimWords(s.area.type) ?? "the GM places it" } : {}),
    ...(s.area && s.lasting ? { lasting: "its area stays on the map after the turn" } : {}),
    ...(s.attack ? { defense: "AC", attackMod: s.attackMod } : s.save ? { defense: `${s.save.basic ? "basic " : ""}${s.save.stat[0].toUpperCase()}${s.save.stat.slice(1)} save`, dc: s.dc } : {}),
    ...(s.damage ? { baseDamage: s.damage } : {}), ...(s.variants ? { variants: "what it does depends on the actions spent: the GM applies it from its card" } : {}), traits: s.traits, text: cap(s.text, 900) }));
}
/** The spell a step casts, found again by its entry and item. */
const spellFor = (actor, step) => { const entry = actor.spellcasting?.get(step.entryId); const spell = entry?.spells?.get(step.spellId) ?? actor.items.get(step.spellId); return entry && spell ? { entry, spell } : null; };
const isHeld = actor => ["grabbed", "restrained"].some(c => actor?.hasCondition?.(c));
function tacticsOf(scene, tok) { if (onParty(tok.actor)) return null;   /* the Tactics page is the monsters' plans: a party member or an NPC with the party knows none of it (0.18.0 review) */
  const page = game.journal.get(scene.getFlag(ID, "build")?.entry)?.pages.find(p => p.name === "Tactics"); return page ? tacticsFor(page.text?.content, tok.getFlag(ID, "group"), localize) : null; }
/* Allies know where each other are, by default. */
function alliesOf(scene, tok) { return scene.tokens.contents.filter(t => t.id !== tok.id && t.actor?.isOfType?.("creature") && t.actor.isAllyOf?.(tok.actor)); }
/** The allies a thinker is told of: those the GM hasn't hidden, and a burrowed one (hidden only because it is below ground) unless the GM had hidden it
    before it went down (0.16.0 review). The packet and a Delay use the same list. */
const knownAllies = (scene, tok) => alliesOf(scene, tok).filter(a => !a.hidden || (isBelow(a) && !a.getFlag(ID, "burrowed")?.wasHidden));
/** What its next diagonal costs this turn, 5 or 10 ft: the 5-10 count runs across all its movement in the turn (Rules ID 444), and Foundry keeps that
    movement as the token's history until the turn changes. The thinker can't see the history, so the packet says it. */
function nextDiagonalFt(tok, scene) { const px = scene.grid.size, d = scene.dimensions; return diagonalsIn((tok.movementHistory ?? []).map(w => [Math.round((w.x - d.sceneX) / px), Math.round((w.y - d.sceneY) / px)])) % 2 ? 10 : 5; }
/** A monster's packet as things stand, plus the labels it needs. Writes nothing. turn: what this turn already used ({ spent, attacks, done, note }), on a re-plan. */
async function buildPacket(combat, tok, turn = {}) {
  const scene = combat.scene, t = turns(combat), memory = t.memory?.[tok.id] ?? {}, others = sense(combat, tok, memory), allies = knownAllies(scene, tok);   /* a GM-hidden or escaped ally isn't there for the thinker; a burrowed one is (it knows where its own are) */
  const known = others.filter(o => canTarget(o.state) || (o.state === "undetected" && memory[o.id])), labels = { ...(t.labels ?? {}) };
  const fresh = { ...assignLabels(labels, known.map(o => o.id), "E"), ...assignLabels(labels, [tok.id, ...allies.map(a => a.id)], "M") }; Object.assign(labels, fresh);
  const { model, read } = await readMap(scene), a = tok.actor, h = a.hitPoints, square = squareOf(tok, scene);
  const water = waterKinds(deepWater(scene, model), read), swimming = heightUp(tok) > 0 ? null : waterUnder(square, sizeOf(tok), water);   /* "calm" | "flowing" | null; a flier above the water isn't swimming */
  const speeds = a.system.movement?.speeds ?? {}, extra = Object.fromEntries(["fly", "swim", "climb", "burrow"].filter(k => speeds[k]?.value).map(k => [k, speeds[k].value]));
  const you = { label: labels[tok.id], name: nameFor(tok), ...(onParty(a) ? { side: "party" } : {}), square, size: a.size, nextDiagonal: nextDiagonalFt(tok, scene), actionsLeft: Math.max(0, actionsOf(a, combat) - (turn.spent ?? 0)), attacksMade: turn.attacks ?? 0, hp: `${h.value}/${h.max}`, speed: speeds.land?.value ?? 0, ...(Object.keys(extra).length ? { speeds: extra } : {}), ...(heightUp(tok) ? { height: heightUp(tok) } : {}), ...(swimming ? { swimming } : {}), conditions: (a.conditions?.active ?? []).map(c => c.value ? `${c.slug} ${c.value}` : c.slug), strikes: await strikesOf(a, combat, tok), abilities: abilitiesOf(a), tactics: tacticsOf(scene, tok) };
  const book = await spellBook(a); if (book.length) you.spells = spellsOf(book);
  /* Climb and Release (0.15.0): what it holds (a Climb needs both hands free), weapons it let go of, and the trees near it, tallest guess included */
  const held = heldItems(a); if (held.length) you.holding = held.map(({ id, name }) => ({ id, name }));
  const gone = [...new Set(strikesWithIds(a).filter(({ strike }) => droppedWeapon(a, strike)).map(({ strike }) => strike.label))]; if (gone.length) you.dropped = gone;
  const up = treeUp(tok, scene), far = t => Math.max(Math.abs(t.at[0] - square[0]), Math.abs(t.at[1] - square[1]));
  const near = treesOf(read).filter(t => far(t) <= GROUND_RADIUS).sort((x, y) => far(x) - far(y)).slice(0, 12);
  if (up || near.length) you.climb = { trees: near, ...(up ? { up: { tree: up.at, top: up.top } } : {}) };
  /* Burrow (0.16.0): whether it is under the ground now, whether the ground it stands on is soil, and on a map the module can't read whose ground isn't
     judged yet, the request to judge it from a picture (Rhea, 2026-11-08: Angel judges each map in play) */
  const burrows = burrowSpeedOf(a) > 0, glides = burrows && glidesThroughRock(a), isDeep = burrows ? deepWater(scene, model) : null, soil = burrows ? soilOf(scene, model, read, isDeep, glides ? glideBounds(scene, model) : null) : null;
  if (burrows) {
    /* a glider needs no soil judged (rock is no bar to it), but it needs to know which of the map's own walls are stone (0.17.0) */
    const below = isBelow(tok), judge = !glides && !read && !groundJudged(scene), judgeWalls = glides && plainWalls(scene).length > 0 && !wallsJudged(scene);
    const shown = (judge || judgeWalls) && isRunner() ? await showGroundPicture(scene).catch(e => { console.warn(`${ID} | ground picture`, e); return false; }) : false;
    const picture = { size: mapSquares(scene), picture: shown ? `a picture of the whole map with numbered squares is on the runner's page, element #${GROUND_EL}` : "no picture could be drawn: judge from the scene's name and the ground map, or answer \"none\"", sceneName: scene.name };
    you.burrow = { below, soilHere: footprintAt(square, sizeOf(tok)).every(([i, j]) => soil(i, j)),
      ground: glides ? "it glides through rock and earth alike (\"r\" on the ground map is no bar to it); only deep water, trees, doors and walls that aren't stone stop it, and it comes up only onto open floor"
        : read ? "known: the module read this map (\"r\" on the ground map is rock)" : judge ? "not judged yet: everywhere counts as rock" : "judged: soil is where the GM's soil areas are (\"r\" on the ground map is rock)",
      ...(glides ? { glides: true, walls: !plainWalls(scene).length ? "known: the map's own walls (stone features pass, trunks don't)" : judgeWalls ? "not judged yet: every wall stops it" : "judged: walls inside the GM's stone-walls areas are stone; others stop it" } : {}),
      ...(judge ? { judgeGround: picture } : {}), ...(judgeWalls ? { judgeWalls: picture } : {}) };
  }
  const cover = visionerApi();
  if (offGrid(tok, scene)) you.offGrid = true;
  /* already Taking Cover: the cover it has now comes from that, so it isn't listed as cover to Take Cover from (it can't take it again until it moves or attacks) */
  const taking = takingCover(tok), coverList = cover ? others.filter(o => SEES.includes(o.state) && labels[o.id] && STANDARD.includes(coverOf(cover, o.token, tok))).map(o => labels[o.id]) : [];
  you.takeCover = { taking, ...(taking ? { why: "It is Taking Cover now: the cover it has comes from that. It ends when it moves off its square or attacks." } : {}), nextToCover: nearCoverFor(scene)(square, sizeOf(tok)), standardCoverFrom: taking ? [] : coverList };
  /* what it knows of its own stealth (Rhea, 2026-11-07, B): what it last tried and whether it is still hiding, the light where it stands, its own
     concealment and who it has standard cover from; never whether a secret roll worked */
  const tried = t.stealth?.[tok.id] ?? null;
  you.stealth = { lastTried: tried ? `${tried.did === "sneak" ? "Sneaked" : "Hid"} in round ${tried.round}, and has only Hidden, Sneaked or Stepped since` : null, light: lightOn(tok.object.center, scene), concealed: !!a.hasCondition?.("concealed"), standardCoverFrom: coverList };   /* the real list: Taking Cover itself allows a Hide */
  const packet = packetOf({ you, round: combat.round, memory, note: turn.note ?? null, done: turn.done ?? [], ground: groundAround(model, square, GROUND_RADIUS, undefined, takeCoverSquares(scene), water, soil && !glides ? (x, y) => !soil(x, y) && !model.blocked[model.idx(x, y)] && !water(x, y) : null),
    allies: allies.map(x => ({ label: labels[x.id], name: nameFor(x), square: squareOf(x, scene), ...(heightUp(x) ? { height: heightUp(x) } : {}), ...(isBelow(x) ? { below: true } : {}), healthWord: wordsFor(x.actor), conditions: visibleConditions(conditionsOn(x.actor)) })),
    others: others.map(o => ({ id: o.id, state: o.state, label: labels[o.id], square: o.square, height: heightUp(o.token), offGrid: offGrid(o.token, scene), size: o.token.actor.size, distance: o.distance, gear: gearOf(o.token.actor), conditions: visibleConditions(conditionsOn(o.token.actor)), healthWord: wordsFor(o.token.actor), cover: cover?.getAutoCoverState?.(tok.object, o.token.object) ?? "none" })) });
  return { packet, labels: labelsOf(others.map(o => ({ id: o.id, state: o.state, label: labels[o.id] }))), fresh, others };
}
/* Keep what each ticked monster can perceive as the fight moves, so a monster's memory is where it last perceived someone and not where they stood on its own last turn. */
async function noteWhatTheySense(combat) {
  if (!onFightScene(combat)) return;
  const t = turns(combat), change = {};
  for (const c of combat.combatants) { const tok = c.token; if (!tok?.object || !tok.getFlag(ID, "run") || !runnable(tok) || tok.actor?.isDead) continue;
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
  const combatant = combat.combatant, tok = tokenOf(combat, combatant); if (!tok?.getFlag(ID, "run") || !runnable(tok)) return;
  if (partyMember(tok.actor) && isDown(tok.actor)) return;   /* dying or unconscious: its turn (the recovery check) is the GM's, and every plan would be refused (0.18.0 review) */
  const key = `${combat.id}.${combat.round}.${combatant.id}`; if (starting.has(key)) return;
  /* a Delay ends the request and the monster comes back later this round for a whole new turn (0.12.0): a delayed request never blocks it */
  const mine = Object.values(turns(combat).requests).filter(r => r.combatantId === combatant.id && r.round === combat.round);
  if (mine.some(r => !r.delayed)) return;
  const afterDelay = mine.length > 0;
  if (afterDelay && combatant.getFlag(HUD, "delayed")) await combatant.unsetFlag(HUD, "delayed").catch(e => console.warn(`${ID} | HUD delayed flag`, e));   /* back in the order: the tracker's hourglass goes */
  starting.add(key);
  try {
    await new Promise(r => setTimeout(r, SETTLE_MS));   /* start-of-turn effects; how long is enough is still to be measured */
    if (combat.combatant?.id !== combatant.id) return;
    const opened = await ensureScene(combat);
    const id = foundry.utils.randomID(8), base = { state: "requested", combatantId: combatant.id, tokenId: tok.id, round: combat.round, turn: combat.turn, at: Date.now(), since: clock(), log: {}, ...(afterDelay ? { afterDelay: true } : {}) };
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
  if ("turn" in change || "round" in change) leaveWaiting(combat).catch(e => console.warn(`${ID} | waiting`, e)).then(() => dropInstantAreas(combat, currentRequest(combat) ? { id: currentRequest(combat).id, pos: 0 } : null)).catch(e => console.warn(`${ID} | areas`, e));
  if ("turn" in change || "round" in change) { const prev = { ...(combat.previous ?? {}) };   /* the turn that just ended, read before anything awaits */
    fallIfAloft(combat, prev).catch(e => console.warn(`${ID} | fall`, e)).then(() => sinkNote(combat, prev)).catch(e => console.warn(`${ID} | sink`, e)).then(() => settleClimbers(combat)).catch(e => console.warn(`${ID} | climbing`, e)).then(() => settleBurrowers(combat)).catch(e => console.warn(`${ID} | burrowing`, e)).then(() => noteWhatTheySense(combat)).catch(e => console.warn(`${ID} | memory`, e)).then(() => onTurnChange(combat)).catch(e => console.error(`${ID} | turn`, e)); }
  act(combat);
}
/* ---------- falling ---------- */
/** A ticked monster still in the air at the end of a turn the module ran, with no Fly in that round, falls (Rules ID 2344: "If you're airborne at the end
    of your turn and didn't use a Fly action this round, you fall"). It uses Arrest a Fall (its reaction, needing a fly Speed: Acrobatics or Reflex, the
    better, against DC 15); on a failure it takes bludgeoning damage of half the distance and lands prone (Player Core, falling). A turn the GM played
    herself, or one ended by a Delay, is left alone: the GM may have flown it by hand, and a Delay hasn't ended its turn. prev: Combat#previous. */
async function fallIfAloft(combat, prev) {
  if (!prev?.combatantId || prev.round == null) return;
  const c = combat.combatants.get(prev.combatantId), tok = c?.token; if (!tok?.getFlag(ID, "run") || !runnable(tok)) return;
  const fall = heightUp(tok), mine = Object.entries(turns(combat).requests ?? {}).filter(([, r]) => r.combatantId === c.id && r.round === prev.round).sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0));
  const what = shouldFall({ requests: mine.map(([, r]) => r), height: fall, flies: flySpeedOf(tok.actor) > 0, dead: !!tok.actor?.isDead, forward: movedOn(prev, { round: combat.round, turn: combat.turn }), clinging: !!treeUp(tok, combat.scene) });
  if (!what) return;
  const lastId = mine.at(-1)[0];
  /* first, so a second turn change can't make it fall twice; the note says what is under way in case a reload cuts it short */
  await save(combat, lastId, { fell: { from: fall }, note: `${tok.name} didn't Fly this round and is falling ${fall} ft. If it still shows in the air, move it to the ground and check its HP.` });
  if (!(await ensureScene(combat) && tok.object)) { await save(combat, lastId, { note: `${tok.name} didn't Fly this round and falls ${fall} ft. I couldn't open the map, so move it down yourself${what === "fall" ? `; it may Arrest the Fall (DC 15), or else it takes ${Math.floor(fall / 2)} bludgeoning damage and lands prone` : ""}.` }); return; }
  if (what === "drop") { await watched(() => tok.update({ elevation: 0 })); await save(combat, lastId, { fell: { from: fall, dead: true }, note: `${tok.name}'s body fell ${fall} ft to the ground.` }); return; }
  const actor = tok.actor, stats = [actor.skills?.acrobatics, actor.saves?.reflex].filter(Boolean).sort((a, b) => (b.mod ?? 0) - (a.mod ?? 0));
  let saved = false;
  if (stats[0] && !cantAct(actor)) {   /* Arrest a Fall is a reaction: not while it can't act. Reactions used earlier aren't tracked yet. */
    const roll = await watched(() => stats[0].roll({ dc: { value: 15 }, skipDialog: true, label: "Arrest a Fall", extraRollOptions: ["action:arrest-a-fall"], token: tok, rollMode: "publicroll" }));
    saved = (roll?.degreeOfSuccess ?? 0) >= 2;
  }
  await watched(() => tok.update({ elevation: 0 }));
  let words = `${tok.name} didn't Fly this round, so it fell ${fall} ft`;
  const dmg = saved ? 0 : await fallDamage(tok, fall);
  if (dmg > 0) words += `, took ${dmg} bludgeoning damage and landed prone.`;
  else words += saved ? `; it Arrested the Fall and took no damage.` : `${fall <= 5 ? " (no damage from 5 ft or less)" : ""}.`;
  await save(combat, lastId, { fell: { from: fall, saved, damage: saved ? 0 : dmg }, note: words });
}
/** Falling damage (Player Core, Falling, Rules ID 2352): a fall of more than 5 ft deals bludgeoning damage of half the distance (at most 750), and a
    creature that takes any lands prone. It is the monster's own, so it is applied whatever the monster-damage setting says. Returns the damage taken.
    (0.15.0: before, a 5-ft fall dealt 2.) */
async function fallDamage(tok, fall) {
  const dmg = fall > 5 ? Math.min(750, Math.floor(fall / 2)) : 0, actor = tok.actor; if (!(dmg > 0)) return 0;
  const DamageRoll = CONFIG.Dice.rolls.find(r => r.name === "DamageRoll"), roll = await new DamageRoll(`${dmg}[bludgeoning]`).evaluate();
  await watched(() => roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Falling ${fall} ft` }, { rollMode: "publicroll" }));
  await watched(() => actor.applyDamage({ damage: roll, token: tok, item: null, shieldBlockRequest: false }));
  if (!actor.isDead) await watched(() => actor.increaseCondition?.("prone"));
  return dmg;
}
/** A ticked monster whose turn the module ran to the end, left in deep water without a successful Swim: the rules sink it 10 ft or let the current take
    it, as the GM decides (Player Core Swim, Actions ID 2381). Swimming is at the surface only for now (Rhea, 2026-11-08), so the module moves nothing and
    says so on its card. Same guards as the fall (`shouldSink`); `sank` is saved with the note so a second turn change can't repeat it. */
async function sinkNote(combat, prev) {
  if (!prev?.combatantId || prev.round == null) return;
  const c = combat.combatants.get(prev.combatantId), tok = c?.token; if (!tok?.getFlag(ID, "run") || !runnable(tok)) return;
  const mine = Object.entries(turns(combat).requests ?? {}).filter(([, r]) => r.combatantId === c.id && r.round === prev.round).sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0));
  const wet = await stillInWater(combat, tok);
  if (!shouldSink({ requests: mine.map(([, r]) => r), wet: !!wet, dead: !!tok.actor?.isDead, forward: movedOn(prev, { round: combat.round, turn: combat.turn }) })) return;
  await save(combat, mine.at(-1)[0], { sank: true, note: joinNote(combat, mine.at(-1)[0], `${tok.name} ended its turn in deep ${wet} water without a successful Swim, so by the rules it sinks 10 ft or the current carries it, as you decide. The module keeps swimmers at the surface for now, so it hasn't moved it.`) });
}
/** The deep water under a token now ("calm", "flowing" or null), read from the scene's own documents (no canvas needed). */
async function stillInWater(combat, tok) {
  const scene = combat.scene; if (heightUp(tok) > 0) return null;
  const { model, read } = await readMap(scene); return waterUnder(squareOf(tok, scene), sizeOf(tok), waterKinds(deepWater(scene, model), read));
}
/** The turn moved on while a monster's spell waited for a save: that request ends, and the note tells the GM what's left on the card. */
async function leaveWaiting(combat) {
  const change = {};
  for (const [id, r] of Object.entries(turns(combat).requests ?? {})) {
    if (!["saves", "fled"].includes(r.state) || (r.round === combat.round && r.combatantId === combat.combatant?.id)) continue;
    if (r.state === "fled") { change[`requests.${id}.state`] = "done"; change[`requests.${id}.extend`] = null; change[`requests.${id}.note`] = [r.note, "The turn moved on while it stood at the map's edge."].filter(Boolean).join(" "); continue; }
    const step = r.steps?.[r.pos ?? 0];
    change[`requests.${id}.state`] = "done"; change[`requests.${id}.note`] = [r.note, `The turn moved on while ${step?.itemName ?? "a spell"} waited for ${step?.area?.aim ? "saves" : `${step?.target ? `${step.target}'s` : "a"} save`}: apply what's left from its card.`].filter(Boolean).join(" ");
  }
  if (Object.keys(change).length) await saveTurns(combat, change);
}
function act(combat) {
  const r = currentRequest(combat); if (!r) return;
  if (r.state === "submitted") judge(combat, r.id).catch(e => console.error(`${ID} | plan`, e));
  else if (r.state === "saves" && Object.values(r.rollFor ?? {}).some(Boolean)) doIt(combat, r.id).catch(e => console.error(`${ID} | turn`, e));   /* Roll it for them */
  else if ((r.ask || r.edit) && CHANGEABLE.includes(r.state)) runChange(combat, r.id).catch(e => console.error(`${ID} | change`, e));   /* the Change button (0.19.0), before a press */
  else if (r.go && RESUMABLE.includes(r.state)) doIt(combat, r.id).catch(e => console.error(`${ID} | turn`, e));
  else if (r.state === "fled" && r.extend) runExtend(combat, r.id).catch(e => console.error(`${ID} | extend`, e));
}
/** A monster ticked during its own turn. */
export function onTokenFlag(tok, change) {
  if (!isRunner()) return;
  if (foundry.utils.getProperty(change, `flags.${ID}.run`)) for (const c of game.combats.filter(c => c.started && c.combatant?.tokenId === tok.id)) onTurnChange(c).catch(e => console.error(`${ID} | turn`, e));
  /* Auto ticked while its plan waits on the card (ready: before its first step, or between steps for Next step): it runs as if Auto had been on from the
     start (Rhea, 2026-11-09), waiting out the game's pause like Auto's own start. A held, stopped or running turn is left as it is. */
  if (foundry.utils.getProperty(change, `flags.${ID}.auto`) === true) for (const c of game.combats.filter(c => c.started && c.combatant?.tokenId === tok.id)) {
    const r = currentRequest(c), still = n => n?.state === "ready" && !n.hold && !n.gmWait && (n.pos ?? 0) === (r.pos ?? 0) && !!tok.getFlag(ID, "auto");
    /* a pause the GM has to apply an ability's effects in waits for her Next step, Auto or not; read again after the game's pause (0.17.0 review) */
    if (still(r) && r.tokenId === tok.id && !running.has(r.id)) (async () => { if (!(await pausedAuto(c, r.id, tok)) && still(request(c, r.id))) await doIt(c, r.id); })().catch(e => console.error(`${ID} | turn`, e));
  }
}
/** The runner has just loaded: pick up whatever happened while it was away. A turn left "running" stopped when the page went, so it waits for Do it,
    which carries on from the record and never repeats a step. */
export async function onRunnerReady() {
  if (!isRunner()) return;
  for (const combat of game.combats.filter(c => c.started)) {
    const r = currentRequest(combat);
    if (r?.state === "running" && !running.has(r.id)) await save(combat, r.id, { state: "stopped", go: false, note: `${game.user.name}'s page reloaded during this turn. Check the chat and HP, then Do it carries on from where it stopped.` });
    /* a reload while the map was extending: whether or not it grew, asking again from a fresh packet is right (the monster can flee to the same edge again) */
    if (r?.state === "extending" && r.extending && !running.has(r.id)) { const tok = combat.scene?.tokens.get(r.tokenId); if (tok && await ensureScene(combat)) await afterExtend(combat, r.id, r.extending, tok, { shifted: [0, 0] }).catch(e => console.error(`${ID} | extend`, e)); }
    /* a Delay cut off by the reload after its turn ended and before its place moved (0.12.0): the request isn't current any more, so it is closed here */
    for (const [id, x] of Object.entries(turns(combat).requests ?? {})) { const s = x.steps?.[x.pos ?? 0]; if (x.state === "running" && s?.do === "delay" && x.log?.[x.pos ?? 0]?.ended && !x.log[x.pos ?? 0].moved && !running.has(id)) await save(combat, id, { state: "done", delayed: true, note: joinNote(combat, id, `${game.user.name}'s page reloaded as it delayed: its turn ended, but its place in the order may not have moved. Check the tracker and drag it to just after ${s.after} if it isn't.`) }); }
    await onTurnChange(combat); act(combat);
    if (r?.state === "saves") doIt(combat, r.id).catch(e => console.error(`${ID} | turn`, e));   /* a save rolled while this page was away */
  }
}
/** Live values for the legality check. Reach, distance and moves need the canvas on the fight scene. used: what this request's finished steps took. Names
    are labels, because a refusal's reason goes back to the thinker; the card puts names in. */
async function gather(combat, req, used = { actions: 0, attacks: 0 }, { moves = true, before = null, spells = false } = {}) {
  const scene = combat.scene, tok = scene.tokens.get(req.tokenId), actor = tok.actor;
  const holding = heldItems(actor);
  const strikes = await Promise.all(strikesWithIds(actor).map(async ({ id, strike: a }) => { const m = await ammoOf(actor, a).catch(() => null), w = weaponOf(actor, a); return { id, name: a.label, weapon: holding.find(h => h.itemId === w?.id)?.id ?? null, dropped: droppedWeapon(actor, a), reach: actor.getReach({ action: "attack", weapon: a.item }), ranged: !!a.item?.isRanged, maxRange: a.item?.range?.max ?? null, effects: [...(a.item?.system?.attackEffects?.value ?? [])], ...ammoFields(m, shotsFor(combat, tok, id, m)) }; }));
  /* only what it perceived when asked, and still does: a plan can't name anything else */
  const now = new Map(sense(combat, tok, turns(combat).memory?.[tok.id] ?? {}).map(o => [o.id, o])), targets = {};
  for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const o = now.get(tokenId); if (o && canTarget(o.state)) targets[label] = { name: label, square: o.square, ...(o.state === "hidden" ? {} : placeOf(o.token, scene)), size: sizeOf(o.token), ...heightOf(o.token), flat: flatDC(o.state), cat: o.token.actor?.size ?? null, held: !!turns(combat).grips?.[tok.id]?.[tokenId] && isHeld(o.token.actor) }; }
  /* moves are worked out only for a plan that has a Stride, Step or Crawl, so trouble there can't stop a plan of Strikes */
  const speed = landSpeed(actor), flySpeed = flySpeedOf(actor), swimSpeed = swimSpeedOf(actor), burrowSpeed = burrowSpeedOf(actor); let route = null;
  if (moves) { try { route = await mover(combat, tok, speed, knownTo(combat, tok, [...now.values()]), flySpeed, swimSpeed, burrowSpeed); } catch (e) { console.error(`${ID} | moves`, e); const why = `I couldn't work out moves here (${e.message}).`; route = () => ({ ok: false, reason: why }); } }
  /* Take Cover: the cover Visioner gives it now against each creature it sees and could name, and the walls and trunks next to a square */
  const vis = visionerApi(), coverFrom = {};
  if (vis) for (const [label, tokenId] of Object.entries(req.labels ?? {})) { const o = now.get(tokenId); if (o && SEES.includes(o.state)) { const l = coverOf(vis, o.token, tok); if (STANDARD.includes(l)) coverFrom[label] = l; } }
  return { actions: Math.max(0, actionsOf(actor, combat) - (req.spent ?? 0) - used.actions), attacksBefore: (req.attacks ?? 0) + used.attacks, strikes, targets,
    me: { square: squareOf(tok, scene), ...placeOf(tok, scene), size: sizeOf(tok), ...heightOf(tok), cat: actor.size ?? null }, speed, flySpeed, swimSpeed, waterAt: route?.waterAt, waterIn: route?.waterIn,
    /* Climb and Release (0.15.0): its climb Speed, the trees beside a square, the tree it is up now, what it holds */
    /* Burrow (0.16.0): its burrow Speed, whether it is under the ground now, soil under a footprint, a creature it knows of where it would come up */
    burrowSpeed, below: isBelow(tok), soilAt: route?.soilAt ?? null, occupiedAt: route?.occupiedAt ?? null, glides: glidesThroughRock(actor), surfaceAt: route?.surfaceAt ?? null,
    climbSpeed: climbSpeedOf(actor), treesAt: route?.trees ? sq => treesBeside(sq, sizeOf(tok), route.trees) : null, onTree: treeUp(tok, scene), holding: holding.map(({ id, name }) => ({ id, name })),
    cantAct: cantAct(actor), cantMove: cantMove(actor), cantAttack: cantAttack(actor), prone: !!actor.hasCondition?.("prone"), route,
    tookCover: takingCover(tok), coverFrom, nearCover: nearCoverFor(scene),
    /* Interact and Delay (0.12.0): grabbed asks a DC 5 flat check of a manipulate action; a Delay needs an untouched turn and a creature still to act this round */
    grabbed: !!actor.hasCondition?.("grabbed"), fresh: !(req.spent ?? 0) && !used.actions && !(req.done?.length) && !before, order: turnOrder(combat, tok, req),
    /* flee: the map's edges as the scene stands now (an extended map has new bounds), never a stored size */
    edgeAt: (sq, n) => edgeSides(sq, n, ...mapSquares(scene)), party: onParty(actor),
    /* Hide: the light at a square (where it stands, or will after a move) and its own concealment */
    lightAt: sq => { const px = scene.grid.size, d = scene.dimensions, n = sizeOf(tok); return lightOn({ x: d.sceneX + (sq[0] + n / 2) * px, y: d.sceneY + (sq[1] + n / 2) * px }, scene); }, concealed: !!actor.hasCondition?.("concealed"),
    /* abilities, and its last action before this plan (a Grab or Knockdown needs it): the step just done, or the last thing done before a re-plan */
    abilities: abilityList(actor).map(({ item, ...a }) => a), last: lastAction({ ...(before ?? { done: req.done?.at(-1) ?? null }), strikes }),
    /* spells: what it can cast now, and for a spell at a friend its allies (not hidden by the GM) and itself, by their labels */
    ...(spells ? { spells: await spellBook(actor), allies: alliesByLabel(combat, tok), saveRows: targetHelperOn(), reach: actor.getReach?.({ action: "interact" }) ?? 5, areaOf: areaCheck(combat, tok, req, now) } : {}) };   /* touch: the creature's own reach, not a weapon's */
}
/** Its allies the GM hasn't hidden, and itself, by label, for a spell aimed at a friend. */
function alliesByLabel(combat, tok) {
  const labels = turns(combat).labels ?? {}, scene = combat.scene, out = {};
  for (const t of [tok, ...alliesOf(scene, tok).filter(a => !a.hidden)]) { const l = labels[t.id]; if (l) out[l] = { name: l, square: squareOf(t, scene), ...placeOf(t, scene), size: sizeOf(t), ...heightOf(t), flat: 0, ally: true }; }
  return out;
}
/** For a Delay: for each creature the monster could name (what it perceived when asked, its allies and itself), whether its turn is still to come this
    round ("later"), has passed ("earlier"), or is the monster's own ("self"). Order is the fight's current order; a creature not in the fight is left out. */
function turnOrder(combat, tok, req) {
  const out = {}, order = combat.turns ?? [], mine = order.findIndex(c => c.tokenId === tok.id);
  if (mine < 0) return out;   /* not in the order: nothing can be said, so every label reads as unknown */
  const allies = knownAllies(combat.scene, tok);   /* as in the packet: a GM-hidden ally stays out, a burrowed one is there */
  const named = { ...Object.fromEntries(Object.entries(turns(combat).labels ?? {}).filter(([id]) => id === tok.id || allies.some(a => a.id === id)).map(([id, l]) => [l, id])), ...(req.labels ?? {}) };
  for (const [label, tokenId] of Object.entries(named)) { const i = order.findIndex(c => c.tokenId === tokenId); if (i < 0 || order[i].isDefeated || order[i].initiative == null) continue; out[label] = tokenId === tok.id ? "self" : i > mine ? "later" : "earlier"; }
  return out;
}
/** A label's token: the creatures it perceived when asked, then its allies and itself. */
const tokenIdOf = (combat, r, label) => r.labels?.[label] ?? Object.entries(turns(combat).labels ?? {}).find(([, l]) => l === label)?.[0] ?? null;
/** Toolbelt's Target Helper puts a row per target on a spell's card, where a player rolls their own save (Rhea, 2026-11-07). Without it, a save spell is the GM's. */
const targetHelperOn = () => { try { return !!game.modules.get(TOOLBELT)?.active && !!game.settings.get(TOOLBELT, "targetHelper.enabled"); } catch { return false; } };

/* ---------- moving ---------- */
/** Height for distances: PF2e counts the vertical gap when two creatures stand at different elevations. */
/** How far above the ground a token is, in feet, for the packet (0 on the ground). */
const heightUp = tok => Math.max(0, Math.round(Number(tok?.elevation) || 0));
/** A token's height span in feet, for an area's vertical test: from its elevation up by its depth (squares of 5 ft). at: an elevation to use instead. */
const spanOf = (tok, at = null) => { const elev = at != null ? Number(at) || 0 : Number(tok.elevation) || 0; return { elev, top: elev + (Number(tok.depth) || sizeOf(tok)) * 5 }; };
const heightOf = tok => ({ elev: Number(tok.elevation) || 0, depth: Number(tok.depth) || sizeOf(tok) });
const hasMove = steps => (steps ?? []).some(s => isMove(s) || s?.do === "climb");   /* a Burrow is a move (0.16.0), so it gets the routes and the soil */   /* a Climb needs the map's trees, which come with the routes */
const hasSpell = steps => (steps ?? []).some(s => s?.do === "spell");
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
const flySpeedOf = actor => Number(actor.system.movement?.speeds?.fly?.value) || 0;
const swimSpeedOf = actor => Number(actor.system.movement?.speeds?.swim?.value) || 0;
const climbSpeedOf = actor => Number(actor.system.movement?.speeds?.climb?.value) || 0;
/* ---------- burrowing (0.16.0) ---------- */
const burrowSpeedOf = actor => Number(actor?.system?.movement?.speeds?.burrow?.value) || 0;
/** Is this token burrowed under the ground: the module's flag and its token below 0. A token the GM lifted back to 0 or above isn't, whatever its flag. */
const isBelow = tok => !!tok?.getFlag?.(ID, "burrowed") && (Number(tok.elevation) || 0) < 0;
/** Soil regions on a scene: Angel's judgment (flag `soil`) or any region the GM names "Soil..." (Rhea, 2026-11-08: Angel judges maps the module can't read; she
    can change the result). */
const SOIL_NAME = /^soil\b/i;
const soilRegions = scene => scene.regions.filter(r => r.getFlag(ID, "soil") || SOIL_NAME.test(r.name ?? ""));
/** Whether the ground of a scene the module can't read has been judged (the scene's flag, or soil regions the GM drew herself). */
const groundJudged = scene => !!scene.getFlag(ID, "ground") || soilRegions(scene).length > 0;
/** Which squares a burrower can dig through, as (i, j) → boolean. A Survey Sheet encounter map: everything but rock (`rockSquares`: crag, outcrops, big
    boulders, standing stones, ruin walls, caves), solid things (trunks, walls through the square) and deep water. Any other scene: only inside soil
    regions; everywhere else counts as rock (and so does all of it until its ground is judged). */
function soilOf(scene, model, read, isDeep, glide = null) {
  const px = scene.grid.size, d = scene.dimensions, memo = new Map();
  if (glide) return (i, j) => model.inMap(i, j) && !isDeep(i, j) && !glide.hard(i, j);   /* Earth Glide: rock and earth alike (0.17.0) */
  if (read) { const rock = rockSquares(read, model.cols, model.rows); return (i, j) => model.inMap(i, j) && !rock[model.idx(i, j)] && !model.blocked[model.idx(i, j)] && !isDeep(i, j); }
  const regs = soilRegions(scene);
  return (i, j) => { if (!model.inMap(i, j)) return false; const k = model.idx(i, j);
    if (!memo.has(k)) memo.set(k, !model.blocked[k] && !isDeep(i, j) && regs.some(r => r.testPoint({ x: d.sceneX + (i + .5) * px, y: d.sceneY + (j + .5) * px, elevation: 0 }))); return memo.get(k); };
}
/* ---------- Earth Glide (0.17.0; Rhea, 2026-11-09: "Absolutely") ---------- */
/* Monster Core's abilities that let a burrower through rock: Earth Glide ("can Burrow through any earthen matter, including rock"), Rock Tunneler
   ("can burrow through solid stone") and Unstoppable Burrow. PF2e gives them no slug, so they are read by name. */
const GLIDE = /^(earth glide|rock tunneler|unstoppable burrow)$/i;
/** Whether it burrows through rock and earth by its own ability (it needs a burrow Speed too). */
const glidesThroughRock = actor => burrowSpeedOf(actor) > 0 && !!actor?.items?.some(i => GLIDE.test(String(i.name ?? "").trim()));
/** Stone-walls regions: Angel's judgment (flag `stoneWalls`) or any region the GM names "Stone walls..." (Rhea, 2026-11-09: what the walls are made of is
    Angel's choice for each place; she can change it). */
const STONE_NAME = /^stone walls?\b/i;
const stoneRegions = scene => scene.regions.filter(r => r.getFlag(ID, "stoneWalls") || STONE_NAME.test(r.name ?? ""));
/** The walls whose material the map doesn't say: anything that stops movement and isn't a door or one of Survey Sheet's (its trunks are wood, its stones,
    ruin walls, outcrops and cave rock are stone). */
const plainWalls = scene => scene.walls.filter(w => w.move !== CONST.WALL_MOVEMENT_TYPES.NONE && !w.door && !w.flags?.[SURVEY]?.enc);
/** Whether the walls of a scene have been judged (the scene's flag, or stone-walls regions the GM drew herself). */
const wallsJudged = scene => !!scene.getFlag(ID, "walls") || stoneRegions(scene).length > 0;
/** wall -> whether a glider passes through it: Survey Sheet's features yes and its trunks no; a door never (a way through, wood or metal); any other
    wall when it lies in a stone-walls region (its middle, or a quarter square either side of it, so a wall along a region's edge counts), otherwise not:
    until a scene's walls are judged, they stop it. */
function earthenWall(scene) {
  const regs = stoneRegions(scene), q = scene.grid.size / 4;
  return w => { if (w.door) return false; const enc = w.flags?.[SURVEY]?.enc; if (enc) return enc === "feature"; if (!regs.length) return false;
    /* points along it (a long wall can run partly through a stone area: stone when most of it is, 0.17.0 review), each with a quarter square either side */
    const pts = [.1, .3, .5, .7, .9].map(t => [w.c[0] + (w.c[2] - w.c[0]) * t, w.c[1] + (w.c[3] - w.c[1]) * t]);
    const inside = ([x, y]) => [[0, 0], [q, 0], [-q, 0], [0, q], [0, -q]].some(([dx, dy]) => regs.some(r => r.testPoint({ x: x + dx, y: y + dy, elevation: 0 })));
    return pts.filter(inside).length >= 3; };
}
/** What stops a glider on this scene: every wall that stops movement and isn't earthen (an open door doesn't stop anything), as the squares those walls
    pass through (`hard`) and the test between two squares (`wallBetween`, for a creature `size` squares across). */
function glideBounds(scene, model) {
  const d = scene.dimensions, px = scene.grid.size, earthen = earthenWall(scene), open = CONST.WALL_DOOR_STATES.OPEN;
  const walls = scene.walls.filter(w => w.move !== CONST.WALL_MOVEMENT_TYPES.NONE && !(w.door && w.ds === open) && !earthen(w))
    .map(w => ({ ax: (w.c[0] - d.sceneX) / px, ay: (w.c[1] - d.sceneY) / px, bx: (w.c[2] - d.sceneX) / px, by: (w.c[3] - d.sceneY) / px }));
  const hard = wallSquares(walls, model.cols, model.rows);
  return { hard: (i, j) => model.inMap(i, j) && !!hard[model.idx(i, j)], wallBetween: (a, b, size = 1) => crossesWalls(walls, a, b, size) };
}
/** The open floor of a scene, for where a glider may come up (0.17.0): every square a creature could walk to from where creatures stand on the surface now
    (not below, not escaped), round every wall that stops movement except doors (a door is a way through), over nothing solid and no deep water. On a
    hand-built map the solid rock outside the rooms has no walls through it, so "nothing solid there" alone would let a glider come up inside the rock.
    Returns (i, j) → boolean. */
function openFloor(scene, model, isDeep) {
  const d = scene.dimensions, px = scene.grid.size;
  const walls = scene.walls.filter(w => w.move !== CONST.WALL_MOVEMENT_TYPES.NONE && !w.door)
    .map(w => ({ ax: (w.c[0] - d.sceneX) / px, ay: (w.c[1] - d.sceneY) / px, bx: (w.c[2] - d.sceneX) / px, by: (w.c[3] - d.sceneY) / px }));
  const ok = (i, j) => model.inMap(i, j) && !model.blocked[model.idx(i, j)] && !isDeep(i, j), seen = new Set(), todo = [];
  for (const t of scene.tokens) { if (isBelow(t) || t.getFlag(ID, "escaped") || !t.actor?.isOfType?.("creature")) continue;
    for (const [i, j] of footprintAt(squareOf(t, scene), sizeOf(t))) if (ok(i, j) && !seen.has(`${i},${j}`)) { seen.add(`${i},${j}`); todo.push([i, j]); } }
  while (todo.length) { const [i, j] = todo.pop();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b, k = `${x},${y}`; if (seen.has(k) || !ok(x, y) || crossesWalls(walls, [i, j], [x, y])) continue; seen.add(k); todo.push([x, y]); } }
  return (i, j) => seen.has(`${i},${j}`);
}
/** Into the ground or out of it: the token's flag and its visibility. Underground it is hidden from everyone (Rhea: "unseen while below"), as the GM's own
    hidden toggle does it; coming up it shows again, unless the GM had hidden it before it went down. */
async function setBelow(tok, down) {
  const f = tok.getFlag(ID, "burrowed");
  if (down) { if (!f) await watched(() => tok.update({ hidden: true, [`flags.${ID}.burrowed`]: { wasHidden: !!tok.hidden } })); else if (!tok.hidden) await watched(() => tok.update({ hidden: true })); return; }
  if (f) await watched(() => tok.update({ hidden: !!f.wasHidden, [`flags.${ID}.-=burrowed`]: null }));
}
/** At each turn change: a token flagged as burrowed that the GM brought up to the surface (or above) by hand is above ground again: shown, flag gone. */
async function settleBurrowers(combat) {
  for (const tok of combat.scene?.tokens ?? []) if (tok.getFlag(ID, "burrowed") && !isBelow(tok)) await setBelow(tok, false).catch(e => console.warn(`${ID} | burrowing`, e));
}
/* The picture Angel judges a map's ground from (0.16.0): the scene's own background with the grid and every square numbered, in a small panel on this page
   (the runner's), which the thinker looks at (on the chat route, the bridge's ui_look on the runner with selector #lythara-encounter-builder-ground). */
const GROUND_EL = `${ID}-ground`;
async function showGroundPicture(scene) {
  if (typeof document === "undefined") return false;
  const src = scene.levels?.contents?.[0]?.background?.src ?? scene.background?.src ?? null, d = scene.dimensions, px = scene.grid.size;
  const cols = Math.round(d.sceneWidth / px), rows = Math.round(d.sceneHeight / px), cell = Math.max(12, Math.min(32, Math.floor(1100 / Math.max(cols, rows)))), pad = 22;
  let el = document.getElementById(GROUND_EL);
  if (el && el.dataset.scene === scene.id && el.dataset.src === String(src)) return true;
  el?.remove(); el = document.createElement("div"); el.id = GROUND_EL; el.dataset.scene = scene.id; el.dataset.src = String(src);
  el.style.cssText = "position:fixed;left:8px;top:8px;z-index:100000;background:#fff;color:#000;padding:6px;border:2px solid #333;font:12px sans-serif;box-shadow:0 2px 12px #0008";
  const c = document.createElement("canvas"); c.width = pad + cols * cell; c.height = pad + rows * cell; const g = c.getContext("2d");
  g.fillStyle = "#ddd"; g.fillRect(0, 0, c.width, c.height);
  if (src) { const img = new Image(); img.src = src; await new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 15000); }); if (img.naturalWidth) g.drawImage(img, pad, pad, cols * cell, rows * cell); }
  /* walls, so a corridor's edges read even on a plain picture */
  g.strokeStyle = "#c00"; g.lineWidth = 2; for (const w of scene.walls) { g.beginPath(); g.moveTo(pad + (w.c[0] - d.sceneX) / px * cell, pad + (w.c[1] - d.sceneY) / px * cell); g.lineTo(pad + (w.c[2] - d.sceneX) / px * cell, pad + (w.c[3] - d.sceneY) / px * cell); g.stroke(); }
  g.strokeStyle = "#0006"; g.lineWidth = 1; for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(pad + i * cell, pad); g.lineTo(pad + i * cell, pad + rows * cell); g.stroke(); } for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(pad, pad + j * cell); g.lineTo(pad + cols * cell, pad + j * cell); g.stroke(); }
  g.fillStyle = "#000"; g.font = `${Math.min(11, cell - 2)}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const every = cell >= 18 ? 1 : 2; for (let i = 0; i < cols; i += every) g.fillText(String(i), pad + (i + .5) * cell, pad / 2); for (let j = 0; j < rows; j += every) g.fillText(String(j), pad / 2, pad + (j + .5) * cell);
  const head = document.createElement("div"); head.textContent = `Angel is judging the ground and walls of "${scene.name}": squares x across, y down. Red lines are walls.`; head.style.marginBottom = "4px";
  el.append(head, c); document.body.append(el);
  setTimeout(() => { if (document.getElementById(GROUND_EL) === el) el.remove(); }, 10 * 60000);   /* gone after 10 minutes, or as soon as the judgment is in */
  return true;
}
const hideGroundPicture = () => { if (typeof document !== "undefined") document.getElementById(GROUND_EL)?.remove(); };
/** Angel's judgment of a scene's ground, made real: GM-only soil regions (flag `soil`, named "Soil (Angel)"), and the scene's flag so it is asked once.
    ground: brain.mjs's cleanGround ({ soil: "all" | "none" | [[x0, y0, x1, y1]] }). The GM can reshape or delete the regions with the region tools. */
const applyGround = (scene, ground, by = "Angel") => applyAreas(scene, ground.soil, { name: `Soil (${by})`, color: "#8b5a2b", flag: "soil", sceneFlag: "ground", by });
/** Angel's judgment of which walls are stone, for a monster that glides through rock (0.17.0): a GM-only region "Stone walls (Angel)" (flag `stoneWalls`)
    over the squares whose walls are stone, and the scene's flag `walls` so it is asked once. walls: brain.mjs's cleanWalls. */
const applyWalls = (scene, walls, by = "Angel") => applyAreas(scene, walls.stone, { name: `Stone walls (${by})`, color: "#7a7a7a", flag: "stoneWalls", sceneFlag: "walls", by });
/* areas: "all", "none" or rectangles of squares, made into one GM-only region with a rectangle each; returns how many rectangles */
async function applyAreas(scene, areas, { name, color, flag, sceneFlag, by }) {
  const d = scene.dimensions, px = scene.grid.size, cols = Math.round(d.sceneWidth / px), rows = Math.round(d.sceneHeight / px);
  const rects = areas === "all" ? [[0, 0, cols - 1, rows - 1]] : areas === "none" ? [] : areas.map(([a, b, c, e]) => [Math.max(0, a), Math.max(0, b), Math.min(cols - 1, c), Math.min(rows - 1, e)]).filter(([a, b, c, e]) => a <= c && b <= e);
  if (rects.length) await watched(() => scene.createEmbeddedDocuments("Region", [{ name, color, visibility: CONST.REGION_VISIBILITY.GAMEMASTER, levels: [],
    shapes: rects.map(([a, b, c, e]) => ({ type: "rectangle", x: d.sceneX + a * px, y: d.sceneY + b * px, width: (c - a + 1) * px, height: (e - b + 1) * px, rotation: 0 })), flags: { [ID]: { [flag]: true } } }]));
  await watched(() => scene.setFlag(ID, sceneFlag, { by, at: Date.now(), [sceneFlag === "ground" ? "soil" : "stone"]: areas === "all" || areas === "none" ? areas : rects.length }));
  hideGroundPicture();
  return rects.length;
}
/** The trees on a map, for climbing (0.15.0): Survey Sheet's read gives each tree's square and trunk radius, and `treeTop` guesses its height from the
    trunk (Rhea, 2026-11-08: "height by size"). A map with no read has no trees to climb. */
const treesOf = read => (read?.things?.trees ?? []).filter(t => Array.isArray(t?.at)).map(t => ({ at: [...t.at], top: treeTop(t.trunk) }));
/** The tree a token is up: the one its last Climb left on its flag, while it is still off the ground and beside that tree; otherwise null (the GM
    moved it, or it came down some other way). */
function treeUp(tok, scene) {
  const f = tok.getFlag(ID, "climbing"); if (!Array.isArray(f?.at) || !(heightUp(tok) > 0)) return null;
  return treesBeside(squareOf(tok, scene), sizeOf(tok), [{ at: f.at, top: f.top }]).length ? { at: [...f.at], top: Number(f.top) || 0 } : null;
}
/** What it holds in its hands (a Climb needs both free; Rhea, 2026-11-08: by the rule): physical items carried "held" in one or two hands, with an
    id a plan can name (the slug, -2 and so on when two share it). */
function heldItems(actor) {
  const seen = new Map();
  return actor.items.filter(i => i.isOfType?.("physical") && i.system.equipped?.carryType === "held" && (Number(i.system.equipped.handsHeld) || 0) > 0).map(i => {
    const base = String(i.slug ?? i.name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || i.id, k = (seen.get(base) ?? 0) + 1; seen.set(base, k);
    return { id: k > 1 ? `${base}-${k}` : base, name: i.name, itemId: i.id }; });
}
/** The weapon item a Strike is made with: a PF2e NPC's attack links its weapon by flag (PF2e 8.7.0), a character's Strike is the weapon itself. */
function weaponOf(actor, a) { const it = a?.item; if (!it) return null; if (it.type === "weapon") return it; const w = it.flags?.pf2e?.linkedWeapon; return w ? actor.items.get(w) ?? null : null; }
/** A Strike whose weapon lies on the ground: PF2e still offers an NPC's attack after its weapon is dropped, so the module leaves it out itself. */
const droppedWeapon = (actor, a) => weaponOf(actor, a)?.system?.equipped?.carryType === "dropped";
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
  for (const c of ["restrained", "grabbed", "immobilized"]) if (actor.hasCondition?.(c)) return `it is ${c}, so it can't use move actions (Stride, Step, Crawl, Sneak, Stand or Drop Prone).`;
  return null;
}
/** The movement action a move is sent and priced with: crawl for a Crawl (a prone token can't walk); otherwise the token's own, except never crawl for a
    Stride or Step (one after a Crawl and a Stand in the same plan). */
const moveAction = (tok, kind) => kind === "crawl" ? "crawl" : kind === "fly" ? "fly" : kind === "swim" ? "swim" : kind === "burrow" ? "burrow" : ["crawl", "fly", "swim", "climb", "burrow"].includes(tok.movementAction) ? "walk" : tok.movementAction;   /* a Stride after a landing or a swim walks */
const DEEP = /deep water/i;   /* Survey Sheet's name for its greater-difficult water. Other greater difficult terrain is just 10 ft more a square. */
/** route(from, to, before, { step, kind }) for checkPlan, for this monster on this scene as it stands now: a Stride's route, or with step a single 5-ft
    square (a Step or a Crawl, which kind names for the words). */
async function mover(combat, tok, speed, known = null, flySpeed = 0, swimSpeed = 0, burrowSpeed = 0) {
  const scene = combat.scene, px = scene.grid.size, d = scene.dimensions, ox = d.sceneX, oy = d.sceneY, size = sizeOf(tok);
  const { model, read } = await readMap(scene, { except: new Set(scene.tokens.map(t => t.id)) });   /* creatures are counted below, ally or enemy */
  const isDeep = deepWater(scene, model), terrain = (i, j) => { const c = model.costs[model.idx(i, j)] ?? 0; return c < 2 ? c : isDeep(i, j) ? null : 2; };
  const kind = waterKinds(isDeep, read);
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
  const glide = burrowSpeed > 0 && glidesThroughRock(tok.actor) ? glideBounds(scene, model) : null;   /* Earth Glide (0.17.0) */
  const soil = soilOf(scene, model, read, isDeep, glide), occupied = sq => footprintAt(sq, size).some(([i, j]) => !!who.get(`${i},${j}`));
  const route = (from, to, before = [], { step = false, kind = "stride", surface = false } = {}) => {
    const prefix = [...history]; for (const r of before) prefix.push(...(prefix.length && same(prefix.at(-1), r[0]) ? r.slice(1) : r));
    if (!prefix.length || !same(prefix.at(-1), from)) prefix.push(from);
    const fly = kind === "fly", swim = kind === "swim", dig = kind === "burrow", odd = diagonalsIn(prefix) % 2 === 1, budget = fly ? flySpeed : swim ? Math.max(swimSpeed, 20) : dig ? burrowSpeed : speed;
    if (dig && surface && occupied(to)) return { ok: false, reason: `another creature is at [${to[0]}, ${to[1]}], so it can't come up there.` };   /* below ground no one is in its way; where it comes up, anyone it knows of is */
    const r = step ? findStep({ from, to, size, odd }, world) : findRoute({ from, to, size, budget, odd }, fly ? flyWorld(world) : swim ? swimWorld(world, isDeep) : dig ? (glide ? glideWorld(world, isDeep, glide.hard, (a, b) => glide.wallBetween(a, b, size)) : burrowWorld(world, soil)) : world);
    if (!r.ok && (r.why !== "far" || !r.route)) return { ok: false, reason: dig && glide && r.why === "terrain" ? `[${to[0]}, ${to[1]}], or a square on the way there, is deep water, which it can't glide through.` : dig && glide && r.why === "blocked" ? `something it can't glide through (a tree, a door or a wall that isn't stone) is at [${to[0]}, ${to[1]}].` : routeWords(r, to, budget, kind) };   /* "far" with no route: past where the search looked */
    /* a Swim is priced by Foundry with its swim action, which Survey Sheet's regions don't slow; a bank square it climbs out onto keeps its own terrain cost */
    const bank = swim ? Math.max(0, ...footprintAt(to, size).filter(([i, j]) => !isDeep(i, j)).map(([i, j]) => model.costs[model.idx(i, j)] ?? 0)) * FT : 0;
    return { ok: true, route: r.route, cost: measure([...prefix, ...r.route.slice(1)], prefix.length, kind) - measure(prefix) + bank };   /* checkPlan compares the cost with Speed */
  };
  /* the deep water under its footprint at a square, for checkPlan: "calm", "flowing" or null */
  route.waterAt = sq => waterUnder(sq, size, kind); route.waterIn = sq => waterUnder(sq, size, kind, true);
  route.trees = treesOf(read);   /* for a Climb: the trees beside a square */
  route.soilAt = sq => footprintAt(sq, size).every(([i, j]) => soil(i, j)); route.occupiedAt = occupied;   /* for a Burrow (0.16.0) */
  /* where a Burrow may come up: open floor, nothing solid and no deep water under its footprint (a glider may be below rock, but can't come up in it) */
  const floor = glide ? openFloor(scene, model, isDeep) : null;   /* a glider can be anywhere below, so where it comes up is checked against the open floor */
  route.surfaceAt = sq => footprintAt(sq, size).every(([i, j]) => model.inMap(i, j) && !model.blocked[model.idx(i, j)] && !isDeep(i, j) && (!floor || floor(i, j)));
  return route;
}
/** Whether a square of this scene is deep water: Survey Sheet's greater-difficult region named "Deep water" (other greater difficult terrain isn't).
    Returns a memoised (i, j) → boolean. */
function deepWater(scene, model) {
  const px = scene.grid.size, d = scene.dimensions, ox = d.sceneX, oy = d.sceneY, at = new Map();
  const deep = scene.regions.filter(r => DEEP.test(r.name ?? "") && r.behaviors.some(b => b.type === "modifyMovementCost" && !b.disabled));
  return (i, j) => { if (!model.inMap(i, j)) return false; const k = model.idx(i, j); if ((model.costs[k] ?? 0) < 2) return false;
    if (!at.has(k)) at.set(k, deep.some(r => r.testPoint({ x: ox + (i + .5) * px, y: oy + (j + .5) * px, elevation: 0 }))); return at.get(k); };
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
const answer = r => ({ state: r.state, ...(["ready", "running", "done"].includes(r.state) ? { steps: forThinker(r.steps) } : { reason: r.verdict, triesLeft: Math.max(0, MAX_TRIES - (r.tries ?? 0)) }) });
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
  /* the ground Angel judged, when its packet asked for it (0.16.0): made real before the check, so this plan's Burrow is judged on it. Once only: a later
     plan's ground is ignored, and the GM changes the regions herself. */
  if (clean.plan.ground && r.packet?.you?.burrow?.judgeGround && !groundJudged(combat.scene)) {
    try { const n = await applyGround(combat.scene, clean.plan.ground); await addNote(combat, requestId, `Angel judged this map's ground: ${clean.plan.ground.soil === "all" ? "all soil" : n ? `soil in ${n} area${n === 1 ? "" : "s"}` : "all rock"} (GM-only "Soil (Angel)" regions: reshape or delete them with the region tools).`); }
    catch (e) { console.error(`${ID} | ground`, e); await addNote(combat, requestId, `I couldn't mark the ground Angel judged (${e.message}); everything counts as rock until you draw soil regions (name them "Soil").`); }
  }
  /* which walls are stone, for a monster that glides through rock (0.17.0): the same, once */
  if (clean.plan.walls && r.packet?.you?.burrow?.judgeWalls && !wallsJudged(combat.scene)) {
    try { const n = await applyWalls(combat.scene, clean.plan.walls); await addNote(combat, requestId, `Angel judged this map's walls: ${clean.plan.walls.stone === "all" ? "all stone" : n ? `stone in ${n} area${n === 1 ? "" : "s"}` : "none of them stone"} (a GM-only "Stone walls (Angel)" region: reshape or delete it with the region tools; doors are never stone).`); }
    catch (e) { console.error(`${ID} | walls`, e); await addNote(combat, requestId, `I couldn't mark the walls Angel judged (${e.message}); every wall stops it until you draw a region named "Stone walls".`); }
  }
  const c = checkPlan(clean.plan, await gather(combat, r, undefined, { moves: hasMove(clean.plan.steps), spells: hasSpell(clean.plan.steps) }));
  if (!c.ok) return reject(combat, requestId, c.reason);
  await save(combat, requestId, { state: "ready", plan: whole(clean.plan), steps: c.steps, verdict: null });
  const tok = combat.scene.tokens.get(r.tokenId);
  if (tok?.getFlag(ID, "auto")) (async () => { if (!(await pausedAuto(combat, requestId, tok)) && request(combat, requestId)?.state === "ready" && !request(combat, requestId).hold) await doIt(combat, requestId); })().catch(e => console.error(e));   /* Auto's own start waits out the game's pause; read again after it (0.17.0 review) */
  return { state: "ready", steps: c.steps };
}
/* The reason goes back to the thinker once, as a retry event. A second refusal goes to the GM. */
async function reject(combat, requestId, reason) {
  const tries = (request(combat, requestId).tries ?? 0) + 1, last = tries >= MAX_TRIES, at = `requests.${requestId}`;
  await saveTurns(combat, { [`${at}.state`]: "requested", [`${at}.since`]: clock(), [`${at}.tries`]: tries, [`${at}.steps`]: null, [`${at}.verdict`]: last ? `Couldn't do: ${reason}` : reason, [`${at}.refused.${tries}`]: { reason, plan: cleanPlan(request(combat, requestId).plan).plan ?? null, at: Date.now() }, ...(last ? {} : eventChange("retry", requestId, tries)) });   /* an earlier plan's steps go: they'd read as this one's */
  return { state: "requested", reason, triesLeft: Math.max(0, MAX_TRIES - tries) };
}

/* ---------- the brain: whoever thinks waits here for an event and hands plans in ---------- */
/* Events live on each Combat's flag with the rest of the fight, numbered across all fights so one cursor serves them all. Only the runner adds them.
   The listener (generation and when it last asked) is a world setting, because a chat can be waiting before any fight exists. */
/* a plan replaces the last one whole: a merge would keep keys the new one doesn't have */
const whole = v => v && typeof v === "object" ? foundry.data.operators.ForcedReplacement.create(v) : v;
const PLAN_BYTES = 8000, SUPERSEDED = "A newer chat is thinking for the monsters now, so this was ignored.";
/* the generation lives in "brain" and is written only by a hello; when the thinker last asked lives in "brainAt", which every wait renews */
const brainNow = () => ({ generation: game.settings.get(ID, "brain")?.generation ?? 0, at: game.settings.get(ID, "brainAt") ?? 0 });
const renewBrain = () => game.settings.set(ID, "brainAt", clock());
const fights = () => game.combats.filter(c => c.started);
const eventsOf = combat => Object.values(turns(combat).events ?? {}).map(e => ({ ...e, combatId: combat.id }));
function eventChange(kind, requestId, tries, extra = {}) {
  const seq = nextSeq(Math.max(0, ...game.combats.contents.flatMap(c => Object.keys(turns(c).events ?? {}).map(Number))), Date.now());
  return { [`events.${seq}`]: { seq, kind, requestId, tries, ...extra } };
}
/** A turn Auto finished but never ended: its END_MS timer lived on a page that reloaded in between (found in the second measured run, 2026-11-08).
    The runner's 10 s check ends it, as endAfter would have. Only the current creature's latest request, done, Auto still ticked. */
function endLeftOver(combat) {
  if (!combat.started || !combat.combatant) return;
  const [id, r] = Object.entries(turns(combat).requests ?? {}).filter(([, x]) => x.combatantId === combat.combatant.id && x.round === combat.round).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))[0] ?? [];
  /* never a delayed request (the monster is back for a new turn), and never one whose last step left a card for the GM to apply (Rhea: Auto ends a turn
     after its last action, never after a card the GM must apply; found by the 0.12.0 review) */
  if (r?.state === "done" && !r.delayed && !r.gmEnded && Number.isFinite(r.since) && clock() - r.since > END_MS + 3000) endAfter(combat, id);
}
/** The stall check, on the runner every 10 s (Rhea, 2026-11-08): a turn that has sat past its limit (brain.mjs's stallOf) is marked on its request,
    which turns the GM's card amber, and Angel gets a "stall" event to look into it. Card only, no chat (her rule: no whispered cards). Anything the
    turn does next moves `since` on, which clears the mark. */
let stallTimer = null;
export function watchStalls() { clearInterval(stallTimer); stallTimer = setInterval(() => { if (isRunner()) checkStalls().catch(e => console.warn(`${ID} | stalls`, e)); }, 10000); }
async function checkStalls() {
  for (const combat of fights()) {
    const r = currentRequest(combat);
    if (!r) { endLeftOver(combat); continue; }
    if (!Number.isFinite(r.since)) { await saveTurns(combat, { [`requests.${r.id}.since`]: clock() }); continue; }   /* a request from before 0.9.0 */
    const tok = combat.scene?.tokens.get(r.tokenId), s = stallOf(r, { now: clock(), auto: !!tok?.getFlag(ID, "auto"), machineMs: Math.max(60000, autoPause() * 1000 + 30000) });   /* a long Auto pause isn't a stall */
    if (!s || r.stall?.since === s.since) continue;
    await saveTurns(combat, { [`requests.${r.id}.stall`]: whole(s), ...eventChange("stall", r.id, r.tries ?? 0, { since: s.since }) });
  }
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
  if (generation == null) { const g = (brainNow().generation ?? 0) + 1; await game.settings.set(ID, "brain", { generation: g, at: 0 }); await renewBrain(); return { cursor, hello: hello(g) }; }
  if (stale(brainNow(), generation)) return { cursor, superseded: true, reason: SUPERSEDED };
  await renewBrain();
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
  const c = checkPlan(clean.plan, await gather(combat, r, undefined, { moves: hasMove(clean.plan.steps), spells: hasSpell(clean.plan.steps) }));
  return c.ok ? { ...c, steps: forThinker(c.steps) } : c;
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
export function onPreCreateMessage(message) { if (pending && message.speaker?.token === pending.tokenId && (pending.all || message.flags?.pf2e?.context?.type === "attack-roll")) message.updateSource({ [`flags.${WORKBENCH}.noAutoDamageRoll`]: true }); }   /* a spell's cards all opt out: its cast card too, which Workbench reads for save spells */
/* PF2e gives a spell's cast card the context type "spell-cast" only when the spell has a check, damage or save; one without (Mist, found live 2026-11-07)
   has PF2e's casting flag and no context, so that counts as the cast card too */
export function onCreateMessage(message) { if (!pending || message.author?.id !== game.user.id || message.speaker?.token !== pending.tokenId) return; const type = message.flags?.pf2e?.context?.type ?? (message.flags?.pf2e?.casting ? "spell-cast" : undefined); (pending.waiters.get(type) ?? pending.waiters.get("*"))?.(message, type); }
/* a waiter's timer removes only its own waiter: a stage that ended early (no roll) mustn't take the next stage's (found by the 0.9.0 review) */
const waitFor = type => { const box = pending; let own; const p = new Promise((res, rej) => { const t = setTimeout(() => { if (box?.waiters.get(type) === own) box.waiters.delete(type); rej(new Error(`No ${type} card came.`)); }, STEP_MS); own = m => { clearTimeout(t); if (box.waiters.get(type) === own) box.waiters.delete(type); res(m); }; box.waiters.set(type, own); }); p.catch(() => {}); return p; };
/* the first of several card types: a spell attack's card type isn't pinned down, so take the first attack card that comes */
const waitForAny = types => { const box = pending; let own; const p = new Promise((res, rej) => { const t = setTimeout(() => { if (box?.waiters.get("*") === own) box.waiters.delete("*"); rej(new Error(`No ${types.join(" or ")} card came.`)); }, STEP_MS); own = (m, type) => { if (!types.includes(type)) return; clearTimeout(t); if (box.waiters.get("*") === own) box.waiters.delete("*"); res(m); }; box.waiters.set("*", own); }); p.catch(() => {}); return p; };
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
  /* no shot left: before anything is rolled (a flat check first would be a free reroll on the re-plan; found by the 0.9.0 review) */
  const ammo = await ammoOf(tok.actor, strike).catch(() => null), own = !!ammo?.stack;
  if (ammo && !Object.keys(get()).length && shotsFor(combat, tok, step.item, ammo) < 1) return "noShot";
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
        /* its "no valid ammunition" window, or no roll: nothing was rolled. After a flat check the action is spent (no free reroll), otherwise asked again with it unspent */
        const refused = async () => { await record({ started: false }); return get().flat ? "noShotSpent" : "noShot"; };
        let shot;
        try { shot = await watched(async () => { const card = waitFor("attack-roll"), roll = await strike.variants[step.variant].roll({ event: clickWith("showCheckDialogs"), target: target.object, ...(own ? { options: ["skip-post-processing"] } : {}) }); if (!roll) return { roll: null }; return { message: await card, roll }; }); }
        catch (e) { if (ammo && /ranged combat/i.test(e.message)) return refused(); throw e; }
        if (!shot.roll) { if (ammo) return refused(); throw new Error(`${step.itemName} didn't roll.`); }
        const { message, roll } = shot, left = own ? await takeAmmo(tok.actor, ammo) : null;
        if (ammo?.unreadable) await addNote(combat, id, `I couldn't read Ranged Combat's ammunition for ${tok.name}, so Ranged Combat took this shot's ammunition itself (on version 8.0.7 that is 2 for a monster).`);
        await record({ attack: { message: message.id, degree: roll?.degreeOfSuccess ?? message.rolls?.[0]?.degreeOfSuccess ?? 0, ...(left != null ? { ammoLeft: left } : {}) } });
      } else if (now === "damage") {
        const degree = get().attack.degree; aimAt(target); await record({ damageStarted: true });
        const message = await watched(async () => { const card = waitFor("damage-roll"); await strike[degree === 3 ? "critical" : "damage"]({ event: clickWith("showDamageDialogs"), target: target.object, mapIncreases: step.variant }); return card; });
        await record({ damage: { message: message.id } });
        if (applySetting()) await markApplied(message);
      } else if (now === "apply") {
        const message = game.messages.get(get().damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        await record({ applying: true }); const was = hpNow(target);
        await watched(() => applyFromCard(message, roll, target));
        await record({ applied: true, hp: [was, hpNow(target)] });
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
  const fly = step.do === "fly", dig = step.do === "burrow", up = () => heightUp(tok);
  const finish = async rec => { const at = squareOf(tok, scene), change = { log: { [i]: fly ? { ...rec, ...(rec.moved ? { moved: { ...rec.moved, elev: up() } } : {}) } : dig && rec.moved ? { ...rec, moved: { ...rec.moved, below: isBelow(tok) } } : rec } };
    if (request(combat, id).seen) change.seen = { me: { square: at } };   /* no baseline, nothing to move */
    /* gone under the ground: everyone vanishing from its senses is its own doing, so the baseline starts again from there (no re-plan for it). Coming up,
       what it perceives anew is news, and the look before the next action asks again if it changed (0.16.0). */
    if (dig && isBelow(tok) && !step.fromBelow && request(combat, id).seen) change.seen = whole(situationNow(combat, tok, request(combat, id).labels ?? {}));
    if (dig && isBelow(tok) !== !!step.below) change.note = `${tok.name} is ${isBelow(tok) ? "still below ground" : "at the surface"} instead of ${step.below ? "below ground" : "at the surface"}.`;
    if (!same(at, step.to)) change.note = `${tok.name} stopped at square ${at[0]}, ${at[1]} instead of ${step.to[0]}, ${step.to[1]}.`;
    else if (fly && up() !== step.height) change.note = `${tok.name} is ${up()} ft up instead of ${step.height} ft.`;
    await save(combat, id, change); };
  const now = nextMove(get(), squareOf(tok, scene), step.to, fly ? up() : dig ? isBelow(tok) : null, fly ? step.height : dig ? !!step.below : null);
  if (now === "next") return "next";
  if (now === "arrived") { if (dig && tok.getFlag(ID, "burrowed") && !isBelow(tok)) await setBelow(tok, false); await finish({ moved: { to: squareOf(tok, scene), cost: null } }); return "next"; }   /* a reload after it came up and before it was shown: show it now (0.16.0 review) */
  if (now === "ask") { await save(combat, id, { note: `${tok.name} started a ${WORD[step.do] ?? "Stride"} and isn't where it was going.` }); return "ask"; }
  if (!stepGate(step.do, id)) return "stopped";
  if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
  /* a Swim in flowing water without a swim Speed: PF2e's own Swim (an Athletics check, its card in chat) at the step's DC, rolled once (a reload
     keeps the result); below a success it makes no progress, and the turn goes on to the look before the next step, which asks again */
  if (step.do === "swim" && step.dc) {
    let rolled = get().swim;
    if (!rolled) {
      /* marked before the roll, so a reload between its card and its record asks the GM instead of rolling again (as a follow-up check does) */
      if (get().swimStarted) { await addNote(combat, id, `${tok.name}'s Swim check may already be in chat: check its card, then move it or press Next step.`); return "ask"; }
      await record({ swimStarted: true });
      const res = await watched(() => game.pf2e.actions.get("swim").use({ actors: [tok.actor], difficultyClass: { value: step.dc }, event: clickWith("showCheckDialogs") }));
      const got = (Array.isArray(res) ? res : []).find(x => x?.outcome in DEGREE); if (!got) { await addNote(combat, id, `${tok.name}'s Swim check gave no result: check the chat.`); return "ask"; }
      rolled = { dc: step.dc, degree: DEGREE[got.outcome], message: got.message?.id ?? null }; await record({ swim: rolled });
    }
    if (rolled.degree < 2) { await save(combat, id, { log: { [i]: { swim: rolled, moved: { to: squareOf(tok, scene), cost: 0 } } }, note: joinNote(combat, id, `${tok.name} failed its Athletics check to Swim (DC ${rolled.dc}) and made no progress.`) }); return "next"; }
  }
  const swum = step.do === "swim" ? { swum: true } : {};   /* an automatic success (a swim Speed, calm water) or a rolled one */
  /* someone it didn't know was there, on the way: the move ends before their space, as the rules say. The thinker is asked again without being told why. */
  const known = knownTo(combat, tok, sense(combat, tok, turns(combat).memory?.[tok.id] ?? {})), taken = new Set();
  for (const t of scene.tokens) if (t.id !== tok.id && t.actor?.isOfType?.("creature") && !known.has(t.id) && !t.getFlag(ID, "escaped") && !isBelow(t)) for (const [a, b] of footprintAt(squareOf(t, scene), sizeOf(t))) taken.add(`${a},${b}`);   /* an escaped token is gone, not an unknown creature; a burrowed one is under the ground */
  /* a Burrow passes under everyone: only the square it comes up on can be taken (then it stays below, one square short) */
  const endKeys = dig && !step.below ? new Set(footprintAt(step.to, sizeOf(tok)).map(([a, b]) => `${a},${b}`)) : null;
  const surfaceTaken = dig && !step.below && [...(endKeys ?? [])].some(k => taken.has(k));
  /* a Burrow stops one square short of where it would come up into an unseen creature (only the last square: a Large one's footprints overlap along the
     route), or, coming up where it is, doesn't move at all; either way it stays below (0.16.0 review) */
  const route = dig ? (surfaceTaken ? step.route.slice(0, -1) : step.route) : cutShort(step.route, sizeOf(tok), (a, b) => taken.has(`${a},${b}`));
  const below = dig ? (surfaceTaken ? true : !!step.below) : null;
  /* a Fly that stops short ends at the height it had reached there; a hover (Fly 0 ft) moves nothing and is recorded as flown */
  const height = fly ? heightWhenCut(up(), step.height, route.length - 1, route.length !== step.route.length) : null;
  if (route.length < 2 && !(fly && height !== up()) && !(dig && below !== isBelow(tok))) { await finish({ started: true, ...swum, moved: { to: squareOf(tok, scene), cost: 0 } }); return "next"; }   /* a hover, treading water, or cut short at once */
  const px = scene.grid.size, d = scene.dimensions, action = moveAction(tok, step.do), at = ([x, y]) => ({ x: d.sceneX + x * px, y: d.sceneY + y * px });
  /* a Burrow: down on its own square first, along the route at -5 ft, and up at the end; hidden before it goes down, shown again once it is up */
  const deep = -BURROW_DEPTH, here0 = route[0] ?? squareOf(tok, scene);
  const waypoints = fly ? flyWaypoints(route, up(), height).map(w => ({ ...at(w.square), elevation: w.elev, action }))
    : dig ? [...(isBelow(tok) ? [] : [{ ...at(here0), elevation: deep, action }]), ...route.slice(1).map(sq => ({ ...at(sq), elevation: deep, action })), ...(below ? [] : [{ ...at(route.at(-1)), elevation: 0, action }])]
    : route.slice(1).map(sq => ({ ...at(sq), action }));
  await record({ started: true, ...swum });
  if (dig && !isBelow(tok)) await setBelow(tok, true);
  const charged = await (async () => { try { return await watched(async () => {
    let got = null; const hook = Hooks.on("moveToken", (doc, mv) => { if (doc.id === tok.id) got = { cost: mv.passed?.cost ?? null, x: mv.destination?.x, y: mv.destination?.y, elevation: mv.destination?.elevation }; });
    try {
      /* a glider passes through earthen walls, which Foundry would stop it at: its route already keeps to what it may cross (0.17.0) */
      if (dig && glidesThroughRock(tok.actor)) await scene.moveTokens({ [tok.id]: { waypoints, constrainOptions: { ignoreWalls: true } } }); else await tok.move(waypoints);
      for (let t = 0; t < STEP_MS && !(got && tok.x === got.x && tok.y === got.y && (got.elevation == null || tok.elevation === got.elevation)); t += 100) await new Promise(res => setTimeout(res, 100));   /* the hook comes before the update lands */
      await within(tok.object?.movementAnimationPromise ?? Promise.resolve(), 10000, "The move's animation didn't finish.").catch(() => {});   /* cover and sight are read from where the token is drawn */
      return got;
    } finally { Hooks.off("moveToken", hook); }
  }); } finally { if (dig) await setBelow(tok, isBelow(tok)).catch(e => console.warn(`${ID} | burrowing`, e)); } })();   /* hidden only while really below, even if the move failed (0.16.0 review) */
  await finish({ moved: { to: squareOf(tok, scene), cost: charged?.cost ?? null } });
  if (dig && surfaceTaken) await addNote(combat, id, `${tok.name} couldn't come up at square ${step.to[0]}, ${step.to[1]}: something is there. It stays below ground.`);
  if (fly && tok.getFlag(ID, "climbing")) await setClimbing(tok, null).catch(e => console.warn(`${ID} | climbing`, e));   /* it flew off its tree: not holding on any more */
  return "next";
}
/* ---------- climbing (0.15.0) ---------- */
/** Up a tree, or back down: its flag (which tree, how tall) and, without a climb Speed, the Off-Guard the rules give a climber (Player Core Climb: "You're
    off-guard while climbing unless you have a climb Speed"). The module removes only the Off-Guard it added itself (its id is on the flag): one from
    another cause stays. */
async function setClimbing(tok, tree, guard) {
  const actor = tok.actor, f = tok.getFlag(ID, "climbing");
  if (!tree) { if (f?.guard && actor) await watched(() => actor.items.get(f.guard)?.delete() ?? null); if (f) await watched(() => tok.unsetFlag(ID, "climbing")); return; }
  if (!actor) return;
  let id = f?.guard && actor.items.get(f.guard) ? f.guard : null;   /* the GM may have deleted it by hand: add it again */
  if (guard && !id) id = (await watched(() => actor.increaseCondition?.("off-guard")))?.id ?? null;   /* null when it was already off-guard from something else */
  if (!guard && id) { await watched(() => actor.items.get(id)?.delete() ?? null); id = null; }
  await watched(() => tok.setFlag(ID, "climbing", { at: [...tree.at], top: tree.top, guard: id }));
}
/** At each turn change: a token whose climbing flag no longer holds (the GM moved it off the tree or down, or it is dead) loses the flag and the
    module's Off-Guard, so a monster on the ground isn't left off-guard. */
async function settleClimbers(combat) {
  for (const tok of combat.scene?.tokens ?? []) {
    if (!tok.getFlag(ID, "climbing")) continue;
    try {
      const up = treeUp(tok, combat.scene);
      if (!up || !tok.actor || tok.actor.isDead) { if (up && tok.actor?.isDead) await watched(() => tok.update({ elevation: 0 })); await setClimbing(tok, null); continue; }   /* a dead climber's body drops, as a dead flier's does */
      /* still up without a climb Speed and no longer off-guard (another cause it shared ended, or the GM removed it): off-guard again */
      if (!(climbSpeedOf(tok.actor) > 0) && !tok.actor.hasCondition?.("off-guard")) await setClimbing(tok, up, true);
    } catch (e) { console.warn(`${ID} | climbing`, e); }
  }
}
/** A Climb (Rhea, 2026-11-08; Player Core Climb, Actions ID 2374; climb Speed, Rules ID 2349): straight up or down the tree beside it, on its own
    square. With a climb Speed no check; without one PF2e's own Climb (an Athletics check, its card in chat) at the step's DC, rolled once (marked
    before the roll, so a reload asks instead of rolling again): below a success no progress, and a critical failure falls from the height it had,
    landing prone if it started on the ground (Player Core Climb) or took damage (Falling). Afterwards the flag and Off-Guard follow where it ends, and
    the look-before baseline takes in the Off-Guard its own Climb added or removed, so it doesn't re-plan for that. */
async function runClimb(combat, id, i, step, tok) {
  const scene = combat.scene, record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, actor = tok.actor;
  const finish = async (rec, before) => { const seen = request(combat, id).seen, change = { log: { [i]: rec } };
    if (seen?.me && before) change.seen = { me: { conditions: absorbOwn(seen.me.conditions ?? [], before, situationOf({ me: { conditions: conditionWords(actor) } }).me.conditions, ["off-guard"]) } };
    if (rec.moved && rec.moved.elev !== step.height) change.note = joinNote(combat, id, `${tok.name} is ${rec.moved.elev} ft up instead of ${step.height} ft.`);
    await save(combat, id, change); };
  for (let guard = 0; guard < 4; guard++) {
    const now = nextClimb(get(), step, heightUp(tok));
    if (now === "next") return "next";
    if (now === "arrived") { const before = situationOf({ me: { conditions: conditionWords(actor) } }).me.conditions.filter(c => c !== "off-guard" || !(step.height > 0 && !step.climbSpeed));   /* after a reload its own Off-Guard may already be on */ await setClimbing(tok, step.height > 0 ? { at: step.tree, top: step.top } : null, !step.climbSpeed); await finish({ ...get(), moved: { elev: heightUp(tok) } }, before); return "next"; }
    if (now === "ask") { const f = get().falling; await addNote(combat, id, f ? `${tok.name} critically failed its Climb and was falling ${f.from} ft when the page reloaded: put it on the ground, and apply ${f.from > 5 ? `${Math.floor(f.from / 2)} bludgeoning damage and Prone` : f.from ? "no damage" : "Prone"} if that didn't happen.` : `${tok.name}'s Climb was under way when the page reloaded: check its card and height, then move it or press Next step.`); return "ask"; }
    if (!stepGate(now === "roll" ? "climb-roll" : "climb", id)) return "stopped";
    if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
    if (now === "roll") {
      await record({ climbStarted: true });
      const res = await watched(() => game.pf2e.actions.get("climb").use({ actors: [actor], difficultyClass: { value: step.dc }, event: clickWith("showCheckDialogs") }));
      const got = (Array.isArray(res) ? res : []).find(x => x?.outcome in DEGREE); if (!got) { await addNote(combat, id, `${tok.name}'s Climb check gave no result: check the chat.`); return "ask"; }
      const climb = { dc: step.dc, degree: DEGREE[got.outcome], message: got.message?.id ?? null };
      if (climb.degree === 1) { await save(combat, id, { log: { [i]: { climb } }, note: joinNote(combat, id, `${tok.name} failed its Athletics check to Climb (DC ${climb.dc}) and made no progress.`) }); return "next"; }
      if (climb.degree === 0) {
        /* a critical failure: it falls from the height it had; from the ground it lands prone (Player Core Climb), from higher by the falling rules */
        const from = heightUp(tok); await record({ climb, falling: { from } });
        if (from > 0) await watched(() => tok.update({ elevation: 0 }));
        const dmg = await fallDamage(tok, from), prone = !actor.isDead && (dmg > 0 || from === 0);
        if (prone && !actor.hasCondition?.("prone")) await watched(() => actor.increaseCondition?.("prone"));
        await setClimbing(tok, null);
        await save(combat, id, { log: { [i]: { climb, fell: { from, damage: dmg, prone } } }, note: joinNote(combat, id, `${tok.name} critically failed its Athletics check to Climb (DC ${climb.dc}) and fell${from ? ` ${from} ft${dmg ? `, taking ${dmg} bludgeoning damage` : " (no damage from 5 ft or less)"}` : ""}${prone ? " and landed prone" : ""}.`) });
        return "next";
      }
      await record({ climb }); continue;
    }
    /* move: straight up or down on its own square, with Foundry's climb action */
    const before = situationOf({ me: { conditions: conditionWords(actor) } }).me.conditions;
    await record({ started: true });
    await watched(async () => {
      await tok.move([{ x: tok.x, y: tok.y, elevation: step.height, action: "climb" }]);
      for (let t = 0; t < STEP_MS && tok.elevation !== step.height; t += 100) await new Promise(res => setTimeout(res, 100));
      await within(tok.object?.movementAnimationPromise ?? Promise.resolve(), 10000, "The climb's animation didn't finish.").catch(() => {});
    });
    await setClimbing(tok, heightUp(tok) > 0 ? { at: step.tree, top: step.top } : null, !step.climbSpeed);
    await finish({ ...get(), moved: { elev: heightUp(tok) } }, before);
    return "next";
  }
  return "ask";
}
/** A Release (Player Core, Actions ID 2300): a free action that drops what it holds on its square, through PF2e's own carry type ("dropped"), with a
    short public card so everyone sees it let go. Grabbed: a DC 5 flat check first, as for Interact (the same stages, `nextInteract`). It doesn't
    trigger reactions. Picking the item up again is an Interact, which the GM applies. */
async function runRelease(combat, id, i, step, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, actor = tok.actor;
  for (let guard = 0; guard < 4; guard++) {
    const now = nextInteract(get(), { flat: step.flat ?? 0 });
    if (now === "gm") return "next";   /* dropped */
    if (now === "next") return "next";
    if (now === "ask") { const item = heldItems(actor).find(h => h.id === step.item); if (!item) { await record({ dropped: true, posted: { message: null } }); return "next"; } await addNote(combat, id, `${tok.name}'s Release was under way when the page reloaded: check whether it still holds its ${step.itemName}.`); return "ask"; }
    if (!stepGate(now === "flat" ? "flat" : "release", id)) return "stopped";
    if (now === "flat") {
      await record({ flatStarted: true });
      const roll = await watched(async () => { const r = await new Roll("1d20").evaluate(); await r.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Flat check, DC ${step.flat} (grabbed, a manipulate action)` }); return r; });
      await record({ flat: { dc: step.flat, total: roll.total, ok: roll.total >= step.flat } });
      if (roll.total < step.flat) await addNote(combat, id, `Its Release failed its DC ${step.flat} flat check (${roll.total}): it is grabbed, and still holds its ${step.itemName}.`);
      continue;
    }
    await record({ started: true });
    const h = heldItems(actor).find(x => x.id === step.item), item = h ? actor.items.get(h.itemId) : null;
    if (!item) { await save(combat, id, { log: { [i]: { dropped: true, posted: { message: null } } }, note: joinNote(combat, id, `${tok.name} no longer holds its ${step.itemName}.`) }); return "next"; }
    await watched(() => actor.changeCarryType(item, { carryType: "dropped", handsHeld: 0 }));
    const message = await watched(() => ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), content: `<p><strong>Release</strong> <span class="action-glyph">F</span>: drops its ${foundry.utils.escapeHTML(item.name)}.</p>` }));
    await record({ dropped: true, posted: { message: message?.id ?? null } });
    return "next";
  }
  return "ask";
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
  if (!wantProne) await dropOwnCover(tok, true);   /* the greater cover against ranged attacks a prone Take Cover gave lasts only while prone (Visioner removes its own) */
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
const SEES = ["observed", "concealed"], STANDARD = ["standard", "greater"];
const COVER_EFFECT = "Compendium.pf2e.other-effects.I9lfZUiCwMiGogVi", COVER_BONUS = { standard: 2, greater: 4, "greater-prone": 4 };
const visionerApi = () => game.modules.get(VISIONER)?.active ? game.modules.get(VISIONER).api ?? null : null;
const coverOf = (vis, observer, target) => { try { return vis.getAutoCoverState(observer.id, target.id) ?? "none"; } catch { return "none"; } };
/* the same address Foundry loaded Visioner's own files from, so the import gets its very copies (their state is shared), with any route prefix */
async function visionerFile(name) { if (!visionerApi()) return null; try { return await import(foundry.utils.getRoute(`modules/${VISIONER}/scripts/${name}`)); } catch (e) { console.warn(`${ID} | Visioner's ${name}`, e); return null; } }
const TAKE_COVER_SOURCES = ["take_cover_action"];
/** The PF2e cover effects this module added, flagged with their level; `proneOnly` picks the greater-prone kind, which counts only while prone. */
const ownCover = (tok, proneOnly = false) => (tok.actor?.itemTypes?.effect ?? []).filter(e => { const l = e.getFlag?.(ID, "takeCover"); return l && (!proneOnly || l === "greater-prone"); });
async function dropOwnCover(tok, proneOnly = false) { const ids = ownCover(tok, proneOnly).map(e => e.id); if (ids.length) await tok.actor.deleteEmbeddedDocuments("Item", ids); }
/** Whether it is Taking Cover now: Visioner's record of a Take Cover against anyone (as Visioner's own check reads it, a pending end included), Visioner's
    prone effect, or the PF2e effect this module adds. */
function takingCover(tok) {
  const flags = tok.flags?.[VISIONER] ?? {};
  if (Object.entries(flags).some(([k, f]) => k.startsWith("avs-override-from-") && (f?.coverOnly === true || TAKE_COVER_SOURCES.includes(f?.coverOverrideSource) || (TAKE_COVER_SOURCES.includes(f?.source) && f?.expectedCover)))) return true;
  const prone = !!tok.actor?.hasCondition?.("prone");   /* the prone-only kind gives nothing once it stands (Visioner removes its own then) */
  return (tok.actor?.itemTypes?.effect ?? []).some(e => e.flags?.[VISIONER]?.takeCoverProneRangedOnly === true) || ownCover(tok).some(e => prone || e.getFlag(ID, "takeCover") !== "greater-prone");
}
/** nearCover(square, size) for checkPlan: the scene's walls a creature could take cover behind, as segments in squares: the walls Visioner gives cover
    from (CoverDetector, 8.14.17: one that blocks sight, or one set to give standard or greater cover). An open door doesn't count; neither does a wall set
    to give lesser cover or none, or no cover at all (Survey Sheet's thin trunks: Rhea's rule, under 3 ft across is lesser cover, too thin to hide behind).
    Known gap: an invisible wall round a map's edge blocks sight, so it counts too. */
function coverSegs(scene) {
  const px = scene.grid.size, d = scene.dimensions, NONE = 0, open = CONST.WALL_DOOR_STATES?.OPEN ?? 1;
  return scene.walls.contents.filter(w => { const f = w.flags?.[VISIONER] ?? {}; if (w.door && w.ds === open) return false;
      return STANDARD.includes(f.coverOverride) || (w.sight !== NONE && !["lesser", "none"].includes(f.coverOverride) && f.provideCover !== false); })
    .map(w => [(w.c[0] - d.sceneX) / px, (w.c[1] - d.sceneY) / px, (w.c[2] - d.sceneX) / px, (w.c[3] - d.sceneY) / px]);
}
function nearCoverFor(scene) {
  let segs = null;
  return (square, size = 1) => { segs ??= coverSegs(scene); return !!square && featureNear(square, size, segs); };
}
/** For the packet's ground map: the squares holding a wall Take Cover can use (a thick trunk, a solid wall), as takeCoverAt(x, y). A segment counts for a
    square it passes through the inside of (sampled every tenth of a square, within its middle 70%, the same margin as the map's own blocking), so a trunk ring marks the square it stands in. */
function takeCoverSquares(scene) {
  const at = new Set();
  for (const [x1, y1, x2, y2] of coverSegs(scene)) { const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 10));
    for (let k = 0; k <= n; k++) { const x = x1 + (x2 - x1) * k / n, y = y1 + (y2 - y1) * k / n, fx = x - Math.floor(x), fy = y - Math.floor(y); if (fx > 0.15 && fx < 0.85 && fy > 0.15 && fy < 0.85) at.add(`${Math.floor(x)},${Math.floor(y)}`); } }
  return (x, y) => at.has(`${x},${y}`);
}
/** PF2e's own "Effect: Cover" with its level already chosen, so its prompt doesn't open where nobody can click it (a rule's `selection` skips it). */
async function addCoverEffect(actor, level) {
  const src = (await fromUuid(COVER_EFFECT))?.toObject(); if (!src) throw new Error("PF2e's Effect: Cover isn't in its compendium.");
  const choice = src.system.rules.find(r => r.key === "ChoiceSet"); if (!choice) throw new Error("PF2e's Effect: Cover has no choice to set.");
  delete src._id; choice.selection = { bonus: COVER_BONUS[level], level }; foundry.utils.setProperty(src, `flags.${ID}.takeCover`, level);
  await actor.createEmbeddedDocuments("Item", [src]);
}
/** The creatures Take Cover counts against: every creature on the map that isn't its ally, whether it knows of them or not (cover is where it is), except
    tokens the GM has hidden: Visioner keeps no Take Cover record for those, so their cover would never end (Visioner skips them in its own Take Cover). */
const coverSubjects = (scene, tok) => scene.tokens.contents.filter(t => t.id !== tok.id && !t.hidden && t.object && t.actor?.isOfType?.("creature") && !t.actor.isAllyOf?.(tok.actor));
async function takeCover(combat, tok) {
  const actor = tok.actor, prone = !!actor.hasCondition?.("prone"), vis = visionerApi();
  const out = await game.pf2e.actions.get("take-cover").use({ actors: [actor], effect: false });   /* its card, without PF2e's effect */
  const message = out?.[0]?.message?.id ?? null;
  if (!vis) { const level = prone ? "greater-prone" : "standard"; await addCoverEffect(actor, level); return { message, by: "pf2e", level }; }
  const levels = {}; let proneRanged = false, failed = 0;
  const subjects = coverSubjects(combat.scene, tok);
  for (const t of subjects) {
    const level = coverAfterTaking(coverOf(vis, t, tok), prone);
    if (level === "prone-ranged") { proneRanged = true; continue; }
    if (await vis.setCover(t.id, tok.id, level, { takeCover: true, skipEphemeralUpdate: false })) levels[t.id] = level; else failed++;
  }
  if (prone && !subjects.length) proneRanged = true;
  let pf2e = false;
  if (proneRanged) { const batch = await visionerFile("cover/batch.js"); if (batch?.applyTakeCoverProneRangedOnlyEffect) await batch.applyTakeCoverProneRangedOnlyEffect(tok.object); else { await addCoverEffect(actor, "greater-prone"); pf2e = true; } }
  return { message, by: "visioner", levels, proneRanged, ...(pf2e ? { pf2eProne: true } : {}), ...(failed ? { failed } : {}), ...(!subjects.length && !prone ? { nobody: true } : {}) };
}
/** Take Cover. Never sent twice: one begun before a reload goes to the GM. Afterwards it checks the cover took (Visioner's setCover reports a failure
    only by returning false); with nobody on the map to take cover from there is nothing to check. */
/* ---------- Interact and Delay (0.12.0) ---------- */
/** Interact: the module can't know what a monster does with its hands, so it posts a card saying what (the thinker's words, labels only) and the GM
    applies it, as for an ability the module can't run. Grabbed: a DC 5 flat check first; a failure spends the action on nothing (Rules: Grabbed). */
async function runInteract(combat, id, i, step, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  for (let guard = 0; guard < 4; guard++) {
    const rec = get();
    const now = nextInteract(rec, { flat: step.flat ?? 0 });
    if (now === "next" || now === "gm" || now === "ask") return now;
    if (!stepGate(now, id)) return "stopped";
    pending = { tokenId: tok.id, waiters: new Map() };
    try {
      if (now === "flat") {
        await record({ flatStarted: true });
        const roll = await watched(async () => { const r = await new Roll("1d20").evaluate(); await r.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Flat check, DC ${step.flat} (grabbed, a manipulate action)` }); return r; });
        await record({ flat: { dc: step.flat, total: roll.total, ok: roll.total >= step.flat } });
        if (roll.total < step.flat) await addNote(combat, id, `Its Interact failed its DC ${step.flat} flat check (${roll.total}): it is grabbed. The action is spent.`);
      } else if (now === "post") {
        stopAiming(); await record({ started: true });
        /* the thinker writes labels; the card is read by people, so labels become token names (only names the fight already shows in its tracker) */
        const labels = turns(combat).labels ?? {}, nameOf = l => { const a = Object.entries(labels).find(([, v]) => v === l); return a ? combat.scene.tokens.get(a[0])?.name ?? null : null; };
        const what = foundry.utils.escapeHTML(String(step.what ?? "").replace(/\b[EM]\d{1,3}\b/g, l => nameOf(l) ?? l));
        const message = await watched(() => ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), content: `<p><strong>Interact</strong> <span class="action-glyph">1</span>: ${what}</p>` }));
        /* the record and the GM's instruction in one save, so a reload can't keep one without the other */
        await save(combat, id, { log: { [i]: { posted: { message: message?.id ?? null } } }, note: joinNote(combat, id, `Apply what it does from its Interact card.`) });
      }
    } finally { pending = null; }
  }
  return "ask";
}
/** Delay: the turn ends now, as usual (start- and end-of-turn effects happen at once, as the rules say), then the monster's initiative moves to the named
    creature's with a tie-break that puts it right after, so its next turn comes when that creature's ends. The runner keeps the current turn through
    the initiative change (`keepTurn`). If its place can't be moved the turn has still ended, and the note says so. */
async function runDelay(combat, id, i, step, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), rec = request(combat, id).log?.[i] ?? {};
  if (rec.moved) return "delayed";
  if (rec.ended) return "ask";   /* the turn ended but the move wasn't recorded: a reload between the two; the GM checks the tracker */
  const me = combat.combatants.find(c => c.tokenId === tok.id), afterId = tokenIdOf(combat, request(combat, id), step.after), other = afterId ? combat.combatants.find(c => c.tokenId === afterId) : null;
  /* nothing has happened yet in these refusals, so the turn stops for the GM with the reason (not "ask", whose words say the turn should have ended) */
  if (!me || !other || other.initiative == null || other.isDefeated) { await addNote(combat, id, `${step.after} isn't in the fight any more${other?.isDefeated ? " (defeated)" : ""}, so it can't delay until after its turn. Play the turn yourself.`); return "stopped"; }
  const order = combat.turns, mineAt = order.findIndex(c => c.id === me.id), otherAt = order.findIndex(c => c.id === other.id);
  if (!(otherAt > mineAt)) { await addNote(combat, id, `${step.after}'s turn this round has passed, so delaying until after it would only lose this turn. Play the turn yourself.`); return "stopped"; }
  if (!stepGate("delay", id)) return "stopped";
  if (combat.combatant?.id !== me.id) { await addNote(combat, id, "It isn't this monster's turn any more. Play the turn yourself."); return "stopped"; }
  /* Rules: the effects of the start of its turn happened when the turn began; PF2e will run them again when it comes back this round */
  await addNote(combat, id, "Its start-of-turn effects (persistent damage and the like) already happened this round: if they are applied again when it comes back, undo them.");
  /* right after `other` among ties: a priority just above its own (lower goes first) */
  const priority = (other.overridePriority?.(other.initiative) ?? other.actor?.initiative?.tiebreakPriority ?? 3) + 0.5;
  await record({ ended: true, after: { id: other.id, initiative: other.initiative, priority } });
  await combat.nextTurn();
  const nextId = combat.combatant?.id ?? null;   /* whose turn it is now: the pointer must still name them after the re-sort */
  await combat.setMultipleInitiatives([{ id: me.id, value: other.initiative, statistic: me.actor?.system?.initiative?.statistic ?? "perception", overridePriority: priority }]);
  /* seen live (0.12.0 test build): the server's turn number stayed where nextTurn put it, which after the re-sort named the monster again (core keeps
     the current creature in each page's copy only, and PF2e's own fix sends nothing when the copy already agrees), so save the pointer ourselves */
  const keep = combat.turns.findIndex(c => c.id === nextId);
  if (nextId && keep >= 0) await combat.update({ turn: keep }, { diff: false, turnEvents: false });
  /* PF2e HUD's tracker marks a delayed creature with its own flag (its hourglass button sets it, and a second press brings the creature back right after
     the current one): the module sets the same flag so the tracker shows the monster delayed, and clears it when its turn comes back (onTurnChange) */
  if (game.modules.get(HUD)?.active) await me.setFlag(HUD, "delayed", true).catch(e => console.warn(`${ID} | HUD delayed flag`, e));
  await record({ moved: true, turn: keep });
  return "delayed";
}
async function runTakeCover(combat, id, i, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const now = nextCover(get(), takingCover(tok));
  if (now === "next") return "next";
  if (now === "already") { await record({ covered: { already: true } }); return "next"; }
  if (now === "ask") { await save(combat, id, { note: `${tok.name} started to Take Cover before the page reloaded, so its cover may not have reached every creature${takingCover(tok) ? "" : " (it isn't Taking Cover now)"}.` }); return "ask"; }
  if (!stepGate("take-cover", id)) return "stopped";
  if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
  await record({ started: true });
  const got = await watched(() => takeCover(combat, tok));
  if (got.failed || (!got.nobody && !takingCover(tok))) { await save(combat, id, { log: { [i]: { tried: got } }, note: `${tok.name} used Take Cover, but ${got.failed ? `Visioner didn't set its cover against ${got.failed === 1 ? "one creature" : `${got.failed} creatures`}` : "it isn't Taking Cover"}.` }); return "ask"; }
  await record({ covered: got });
  return "next";
}
const pendingCoverCard = tok => game.messages.contents.filter(m => { const f = m.flags?.[VISIONER]?.takeCoverExpiration; return f?.tokenId === tok.id && f.status === "pending"; }).at(-1) ?? null;
/** End a Take Cover its own attack or move just ended (the rules: until it moves from its space or makes an attack). Visioner posts its own "Take Cover
    Should End" card for that moment; this waits briefly for it and accepts it, so the card reads as done, or ends it directly if no card comes. Returns a
    note for the GM when it couldn't. */
async function endTakeCover(tok, reason) {
  await dropOwnCover(tok);   /* first: a greater-prone one left after a Stand doesn't count as Taking Cover, but is still there */
  if (!takingCover(tok)) return null;
  const did = reason === "attack" ? "attacked" : "moved";
  const svc = await visionerFile("chat/services/take-cover-expiration-service.js");
  if (!svc?.expireTakeCoverForToken || !svc?.acceptTakeCoverExpirationMessage) return `${tok.name} ${did}, which ends its Take Cover: remove it in Visioner (Remove Take Cover on its card, if one came).`;
  let card = null; for (let t = 0; t < 1500 && !(card = pendingCoverCard(tok)); t += 100) await new Promise(res => setTimeout(res, 100));
  if (card) await svc.acceptTakeCoverExpirationMessage(card); else await svc.expireTakeCoverForToken(tok.object, reason);
  /* another GM's browser can post a second card for the same move; left pending, a later click would end a newer Take Cover */
  for (let left = pendingCoverCard(tok); left; left = pendingCoverCard(tok)) if (!(await svc.acceptTakeCoverExpirationMessage(left))) break;
  return takingCover(tok) ? `${tok.name}'s Take Cover should have ended (it ${did}), and it hasn't: check Visioner's card.` : null;
}
/** After a step: if this request's steps from `from` to `upto` ended its Take Cover, end it, and keep any note for the GM. `coverSettled` (saved with `pos`,
    and with the note) marks the steps already settled, so a Take Cover the GM gives it between steps isn't ended for an earlier Strike, and a reload doesn't
    add the note twice. Run like a stage: a time limit, and a window it opens is closed. */
async function settleCover(combat, id, upto, tok, from = request(combat, id)?.coverSettled ?? 0) {
  const r = request(combat, id); if (!r?.steps || !endsCover(r.steps, r.log, upto, from) || !(takingCover(tok) || ownCover(tok).length)) return;
  let last = null; for (let k = upto - 1; k >= 0 && !last; k--) if (r.steps[k]?.do === "strike" || (["ability", "spell"].includes(r.steps[k]?.do) && r.steps[k].attack) || isMove(r.steps[k])) last = r.steps[k];
  let note; try { note = await watched(() => endTakeCover(tok, isMove(last) ? "movement" : "attack")); } catch (e) { console.error(`${ID} | take cover`, e); note = `I couldn't end ${tok.name}'s Take Cover (${e.message}): check Visioner's card.`; }
  await save(combat, id, { coverSettled: upto, ...(note ? { note: [request(combat, id).note, note].filter(Boolean).join(" ") } : {}) });
}
/* ---------- abilities ---------- */
/* Rhea, 2026-11-07: the Strike follow-ups (Grab, Knockdown, Push, Pull, and their Improved free-action forms) run for real: PF2e's own Grapple, Trip, Shove or
   Reposition rolls the Athletics check against the target's DC with no dialog, and with no multiple attack penalty passed, as the rules say; PF2e applies
   nothing, so the module applies Grabbed, Restrained or Prone and a critical Trip's 1d6, and leaves moving a pushed or pulled creature, and a target's
   choice on a critical failure, to the GM. Any other ability goes through PF2e's own use (its card, a frequency use, a self-effect button) and the GM applies
   it from the card: the turn waits for Next step. Grab can also keep hold of a creature it has grabbed or restrained: its card, nothing to roll. */
const DEGREE = { criticalFailure: 0, failure: 1, success: 2, criticalSuccess: 3 };
const joinNote = (combat, id, words) => [request(combat, id).note, words].filter(Boolean).join(" ");
const addNote = (combat, id, words) => save(combat, id, { note: joinNote(combat, id, words) });
async function runAbility(combat, id, i, step, tok, target) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, actor = tok.actor;
  const ab = abilityList(actor).find(a => a.id === step.item); if (!ab) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  for (let guard = 0; guard < 10; guard++) {
    const now = nextAbility(get(), { mode: step.mode, flat: step.flat ?? 0, apply: applySetting() });
    if (now === "next" || now === "gm" || now === "ask") return now;
    if (!stepGate(now, id)) return "stopped";
    if (!["effects", "apply"].includes(now) && !(await ensureScene(combat) && tok.object && (!target || target.object))) throw new Error(cantOpen());   /* conditions and applying need no canvas */
    pending = { tokenId: tok.id, waiters: new Map() };
    try {
      if (now === "post") {
        if (target) aimAt(target); else stopAiming();
        await record({ started: true });
        /* PF2e's own use: its card, a frequency use, a self-effect button. A Grab with no item of its own (a Strike's attack effect) gets a plain card. */
        const message = await watched(() => ab.item ? game.pf2e.rollItemMacro(ab.item.uuid, null) : ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), content: `<p><strong>${ab.name}</strong>: keeps hold of ${target?.name ?? "its target"}.</p>` }));
        /* the record and the GM's instruction in one save, so a reload can't keep one without the other */
        await save(combat, id, { log: { [i]: { posted: { message: message?.id ?? null } } }, ...(step.mode === "card" ? { note: joinNote(combat, id, `Apply ${step.itemName}${step.target ? ` at ${step.target}` : ""} from its card.`) } : {}) });
      } else if (now === "flat") {
        await record({ flatStarted: true });
        const roll = await watched(async () => { const r = await new Roll("1d20").evaluate(); await r.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Flat check, DC ${step.flat}` }); return r; });
        await record({ flat: { dc: step.flat, total: roll.total, ok: roll.total >= step.flat } });
        if (roll.total < step.flat) await addNote(combat, id, `${step.itemName} at ${step.target} failed its DC ${step.flat} flat check (${roll.total}). The action is spent.`);
      } else if (now === "check") {
        /* the Strike before it must have hit: the look before this step checks that too, but never roll a follow-up without it */
        if (step.needsHit) { const r = request(combat, id), prev = i > 0 ? lastAction({ step: r.steps[i - 1], rec: r.log?.[i - 1] ?? {} }) : lastAction({ done: r.done?.at(-1) ?? null });
          if (prev?.do !== "strike" || prev.hit !== true) { await addNote(combat, id, `${step.itemName} needs the Strike before it to hit, and it didn't.`); return "ask"; } }
        aimAt(target); await record({ started: true, held: isHeld(target.actor) });
        const res = await watched(() => game.pf2e.actions.get(step.check).use({ actors: [actor], target: target.object, event: clickWith("showCheckDialogs") }));
        const got = (Array.isArray(res) ? res : []).find(x => x?.outcome in DEGREE); if (!got) return "ask";
        await record({ check: { message: got.message?.id ?? null, degree: DEGREE[got.outcome] } });
      } else if (now === "effects") {
        const rec = get(), o = followUpOutcome(step.check, rec.check.degree, { held: !!rec.held, who: step.target, me: tok.name });
        for (const c of o.target) if (!target.actor.hasCondition(c)) await target.actor.increaseCondition(c);
        for (const c of o.self) if (!actor.hasCondition(c)) await actor.increaseCondition(c);
        /* one save: the record, the GM's instruction, and the grip its own Grab made (only those can be kept hold of later) */
        await saveTurns(combat, { [`requests.${id}.log.${i}.effects`]: { target: o.target, self: o.self, damage: o.damage, gm: o.gm }, ...(o.gm ? { [`requests.${id}.note`]: joinNote(combat, id, o.gm) } : {}),
          ...(step.check === "grapple" && o.target.length ? { [`grips.${tok.id}.${target.id}`]: { round: combat.round } } : {}) });
      } else if (now === "damage") {
        aimAt(target); await record({ damageStarted: true });
        const DamageRoll = CONFIG.Dice.rolls.find(r => r.name === "DamageRoll"), formula = get().effects.damage;
        const message = await watched(async () => { const roll = await new DamageRoll(formula).evaluate(); return roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `${step.itemName}: critical success, ${formula.replace(/\[(\w+)\]/, " $1")}` }); });
        await record({ damage: { message: message?.id ?? null } });
        if (applySetting() && message) await markApplied(message);
      } else if (now === "apply") {
        const message = game.messages.get(get().damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        await record({ applying: true }); const was = hpNow(target);
        await watched(() => target.actor.applyDamage({ damage: roll, token: target, item: null, shieldBlockRequest: false }));
        await record({ applied: true, hp: [was, hpNow(target)] });
        if (target.actor?.isOfType?.("character") && target.actor.hitPoints?.value === 0) await addNote(combat, id, `${target.name} is at 0 HP. If you undo this, PF2e restores the HP but you still need to remove Wounded and Prone and put their initiative back.`);
      }
    } finally { pending = null; }
  }
  return "ask";
}
/* ---------- spells ---------- */
/* Rhea, 2026-11-07. The module casts with the entry's own cast (the slot or use is spent and the card posted, as a sheet's Cast does), then: a spell attack
   rolls like a Strike (the attack penalty, the flat check, real targets) and a damaging one's damage is applied, doubled on a critical hit (PF2e rolls a
   spell attack's damage as a hit; its DOUBLE button is the critical); a save spell waits for the target's save on Toolbelt's row on the spell card: a
   player rolls their own and the turn waits with no timer, while a creature no player owns, or one whose player is offline, is rolled by the module
   through Toolbelt's own buttons. A basic save's damage is applied by degree. Anything else a spell does is the GM's, from its card. */
const ownerOnline = actor => game.users.some(u => !u.isGM && u.active && actor?.testUserPermission?.(u, "OWNER"));
/** The degree of a creature's save on a spell's card, from Toolbelt's row (its flag, which Workbench reads too), or null. */
/* ---------- Hide, Sneak and Seek ---------- */
/* Rhea, 2026-11-07: PF2e's own action posts the secret card, and the module presses Visioner's own buttons on it on this page (Apply Changes; Start Sneak
   before a Sneak's move), so Visioner alone decides who the monster is hidden from or finds, what each creature's cover and concealment allow, and the
   off-guard; the GM can Revert from the card. The card's buttons are Visioner's markup (`data-action` apply-now-hide, apply-now-seek, start-sneak,
   apply-now-sneak, apply-now-consequences in 8.14.17): if they aren't there (Visioner off, or an update changed its card), the step goes to the GM.
   Visioner checks every creature on the map for a Seek unless its card names an area, so the module writes the Seek's area into Visioner's own flag on
   the card (`seekTemplate`: a circle by straight distance, or a cone by angle, tested on each token's centre). Visioner's Start Sneak records every
   creature's start as hidden when its automatic system is off (it calls TokenDocument#canObserve, which Foundry 14 doesn't have, found 2026-11-07), so the
   module puts Visioner's own stored states back on the card before the move. */
const HIDDEN = ["hidden", "undetected", "unnoticed"], STEALTH_WORD = { hide: "Hide", sneak: "Sneak", seek: "Seek" };
const sleep = ms => new Promise(res => setTimeout(res, ms));
const cardEl = id => ui.chat?.element?.querySelector?.(`[data-message-id="${id}"]`) ?? null;
async function cardButton(id, action, ms = 3000) { for (let t = 0; t <= ms; t += 100) { const b = cardEl(id)?.querySelector?.(`[data-action="${action}"]`); if (b) return b; await sleep(100); } return null; }
/** Visioner draws its panel with the card and binds its click handler a moment later, with what the page's canvas shows then: a card drawn while this
    page viewed another scene (after a reload, before the fight's map opened) has a panel that finds no token and changes nothing, and a press before the
    handler is bound does nothing at all (both seen live, 2026-11-07). So the card is drawn again with the fight's map open, the handler waited for, and
    the press counted only if Visioner took it (it marks the button "processing" at once); a press it didn't take changed nothing and is tried again. */
const boundPanel = b => { const p = b?.closest?.(".pf2e-visioner-automation-panel"); return !!p && !!window.jQuery?._data?.(p, "events")?.click?.length; };
async function freshButton(id, action) {
  const m = game.messages.get(id); if (!m) return null;
  await redrawn(id, () => ui.chat.updateMessage(m));
  for (let t = 0; t <= 3000; t += 100) { const b = cardEl(id)?.querySelector?.(`[data-action="${action}"]`); if (b && boundPanel(b)) return b; await sleep(100); }
  return cardEl(id)?.querySelector?.(`[data-action="${action}"]`) ?? null;
}
async function press(id, action) {
  for (let k = 0; k < 10; k++) {
    const b = k ? cardEl(id)?.querySelector?.(`[data-action="${action}"]`) : await freshButton(id, action); if (!b) return null;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    if (b.classList.contains("processing")) return b;
    await sleep(300);
  }
  throw new Error(`Visioner didn't take the press on its ${action} button.`);
}
/** Press Visioner's Apply Changes on a card and wait for its answer: "applied" (Visioner turned the pressed button into Revert), "none" (it found nothing
    to change), or null if the button isn't there. Visioner marks the button "processing" while it works (synchronously, so a press can't run twice) and
    takes that off when done, on the pressed button itself even if the card has been redrawn meanwhile; a redrawn card always shows Apply again, because
    Visioner's panels never draw Revert, so only the pressed button tells. */
async function applyOnCard(id, kind) {
  const b = await press(id, `apply-now-${kind}`); if (!b) return null;
  for (let t = 0; t < STEP_MS; t += 100) {
    if (!b.classList.contains("processing")) return b.dataset.action === `revert-now-${kind}` ? "applied" : "none";
    await sleep(100);
  }
  throw new Error(`Visioner's ${kind} result didn't come within ${STEP_MS / 1000} seconds.`);
}
/** Run a change to a card and wait until the chat log has drawn it again, so a button found after it is the new one. */
async function redrawn(id, change) {
  const old = cardEl(id); await change();
  for (let t = 0; t < 3000 && cardEl(id) === old; t += 100) await sleep(100);
}
/** A Seek's area in Visioner's own terms: a circle at a grid corner, or a cone from the monster's centre toward a square's centre. */
function seekArea(aim, tok, scene) {
  const px = scene.grid.size, d = scene.dimensions, at = sq => ({ x: d.sceneX + sq[0] * px, y: d.sceneY + sq[1] * px });
  if (aim.type === "burst") return { center: at(aim.corner), radiusFeet: aim.size, templateType: "circle", hasTargets: true };
  const c = tok.object.center, to = at([aim.toward[0] + .5, aim.toward[1] + .5]);
  return { center: { x: c.x, y: c.y }, radiusFeet: aim.size, templateType: "cone", geometry: { direction: Math.atan2(to.y - c.y, to.x - c.x) * 180 / Math.PI, angle: 90 }, hasTargets: true };
}
/** Put Visioner's own stored states back as a Sneak's start, where its Start Sneak recorded something else. */
async function fixSneakStart(message, tok) {
  const vis = visionerApi(), f = message.flags?.[VISIONER] ?? {}, change = {};
  for (const [oid, st] of Object.entries(f.sneakStartStates ?? {})) {
    let real; try { real = vis.getVisibility(oid, tok.id) ?? "observed"; } catch { real = "observed"; }
    if (st?.visibility === real) continue;
    change[`flags.${VISIONER}.sneakStartStates.${oid}.visibility`] = real;
    if (f.startStates?.[oid]) change[`flags.${VISIONER}.startStates.${oid}.visibility`] = real;
  }
  if (Object.keys(change).length) await message.update(change);
  return Object.keys(change).length;
}
async function runStealth(combat, id, i, step, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, kind = step.do, word = STEALTH_WORD[kind];
  const toGm = async (why) => { await record({ gm: true }); await addNote(combat, id, `${why} ${kind === "sneak" ? `Press Start Sneak on its card, move ${tok.name} to square ${step.to[0]}, ${step.to[1]}, then apply its results` : `Apply its results from its card${kind === "seek" ? ` (only creatures in the ${step.aim.size}-foot ${step.aim.type} it searched)` : ""}`}.`); return "gm"; };
  for (let guard = 0; guard < 10; guard++) {
    const now = nextStealth(get(), kind);
    if (now === "next") return "next";
    if (now === "gm") return "gm";
    if (now === "ask") { await addNote(combat, id, `${tok.name}'s ${word} card may not have been posted.`); return "ask"; }
    if (now === "move") { const moved = await runStride(combat, id, i, step, tok); if (moved !== "next") return moved; continue; }
    if (!stepGate(`${kind}-${now}`, id)) return "stopped";
    if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
    const msgId = get().card?.message, message = msgId ? game.messages.get(msgId) : null;
    if (now === "roll") {
      await record({ rollStarted: true });
      pending = { tokenId: tok.id, waiters: new Map() };
      stopAiming();   /* PF2e would take a target left over from an earlier step into the check's roll options */
      let card; try { card = await watched(async () => { const c = waitForAny(["skill-check", "perception-check"]); await game.pf2e.actions.get(kind).use({ actors: [tok.actor], event: clickWith("showCheckDialogs") }); return c; }); }
      finally { pending = null; }
      await record({ card: { message: card.id } });
      if (!visionerApi()) return toGm(`Visioner is off, so the module can't apply ${tok.name}'s ${word}.`);
    } else if (now === "start" || now === "check-start") {
      if (!message) return toGm(`${tok.name}'s ${word} card is gone.`);
      if (now === "start") {
        if (!message.flags?.[VISIONER]?.sneakStartStates) {
          if (!(await freshButton(msgId, "start-sneak"))) return toGm(`Visioner's Start Sneak isn't on ${tok.name}'s Sneak card.`);
          await record({ startStarted: true });
          if (!(await press(msgId, "start-sneak"))) { await addNote(combat, id, `Visioner's Start Sneak went from ${tok.name}'s Sneak card before it was pressed.`); return "ask"; }
        } else await record({ startStarted: true });
      }
      /* Start Sneak writes sneakStartStates, sneakStartPosition, then startStates (which its results window reads): wait for all three before correcting */
      const started = () => { const f = game.messages.get(msgId)?.flags?.[VISIONER] ?? {}; return !!(f.sneakStartStates && f.sneakStartPosition && f.startStates); };
      for (let t = 0; t < STEP_MS && !started(); t += 100) await sleep(100);
      if (!started()) { await addNote(combat, id, `Visioner's Start Sneak didn't record ${tok.name}'s start.`); return "ask"; }
      await sleep(300);   /* its last write, then the panel's redraw */
      await fixSneakStart(game.messages.get(msgId), tok);
      await record({ startDone: true });
    } else if (now === "apply" || now === "check") {
      if (!message) return toGm(`${tok.name}'s ${word} card is gone.`);
      if (now === "check") {   /* begun before a reload: a Revert button survives only if the card wasn't redrawn, so usually the GM looks */
        if (await cardButton(msgId, `revert-now-${kind}`, 1500)) { await record({ applied: "applied" }); await rememberStealth(combat, tok, kind); continue; }
        await addNote(combat, id, `I can't tell whether Visioner applied ${tok.name}'s ${word}: look at its card (Open ${word} Results shows it).`); return "ask";
      }
      if (kind === "seek") await redrawn(msgId, () => message.update({ [`flags.${VISIONER}.seekTemplate`]: seekArea(step.aim, tok, combat.scene) }));   /* before the button, which must be the redrawn one: Visioner reads the flag when pressed */
      if (!(await freshButton(msgId, `apply-now-${kind}`))) return toGm(`Visioner's Apply Changes isn't on ${tok.name}'s ${word} card.`);
      await record({ applyStarted: true });
      const got = await watched(() => applyOnCard(msgId, kind));
      if (!got) { await addNote(combat, id, `Visioner's Apply Changes went from ${tok.name}'s ${word} card before it was pressed.`); return "ask"; }
      await record({ applied: got });
      await rememberStealth(combat, tok, kind);
    }
  }
  return "ask";
}
/** What the monster knows it last did to hide, for its packet; forgotten once it comes out of hiding. A Seek isn't hiding. */
async function rememberStealth(combat, tok, kind) { if (kind !== "seek") await saveTurns(combat, { [`stealth.${tok.id}`]: { did: kind, round: combat.round } }); }
/** Who it is hidden from or undetected by in Visioner now: every other creature not hidden by the GM, allies too (Visioner's own Hide can hide it from
    them when its "ignore allies" setting is off, seen live 2026-11-07). */
function hiddenFromWho(tok) {
  const vis = visionerApi(); if (!vis) return [];
  return tok.parent.tokens.contents.filter(t => { if (t.id === tok.id || t.hidden || !t.object || !t.actor?.isOfType?.("creature")) return false;
    try { return HIDDEN.includes(vis.getVisibility(t.id, tok.id)); } catch { return false; } });
}
/** Out of hiding (Rhea, 2026-11-07, A): a hidden or undetected monster becomes observed by those creatures just before an action other than Hide, Sneak
    or Step, and after an attack (which keeps its off-guard for that attack). After an attack Visioner's own Attack Consequences on its card goes first;
    otherwise Visioner's public setVisibility. The GM can hide it again in Visioner's manager. With Visioner's automatic system on, Visioner decides. */
async function comeOut(combat, id, tok, why, cardId = null) {
  /* what it knows it tried is forgotten at any revealing action, whether or not anyone had it hidden: keeping it only when a Hide failed would tell the
     thinker the secret result */
  if (turns(combat).stealth?.[tok.id]) await saveTurns(combat, { [`stealth.${tok.id}`]: foundry.data.operators.ForcedDeletion.create() });
  const who = hiddenFromWho(tok); if (!who.length) return;
  if (game.settings.get(VISIONER, "autoVisibilityEnabled")) return addNote(combat, id, `${tok.name} was hidden before ${why}; Visioner's automatic visibility decides whether it still is.`);
  let left = who;
  if (cardId) { try { if (await applyOnCard(cardId, "consequences")) left = hiddenFromWho(tok); } catch (e) { console.warn(`${ID} | consequences`, e); } }
  const vis = visionerApi(); for (const t of left) await vis.setVisibility(t.id, tok.id, "observed");
  await addNote(combat, id, `${tok.name} was hidden from ${listWords(who.map(t => t.name))}, and ${why} makes it observed by them (hide it again in Visioner's manager to allow a quiet action).`);
}
const actWords = step => step.do === "stride" ? "its Stride" : step.do === "crawl" ? "its Crawl" : step.do === "stand" ? "standing up" : step.do === "drop-prone" ? "dropping prone" : step.do === "take-cover" ? "Taking Cover" : step.do === "interact" ? "its Interact" : step.do === "climb" ? "its Climb" : step.do === "burrow" ? "burrowing" : step.do === "release" ? "letting go of what it holds" : step.do === "seek" ? "its Seek" : step.do === "spell" ? `casting ${step.itemName}` : step.do === "ability" ? `using ${step.itemName}` : step.do === "strike" ? `its ${step.itemName}` : "acting";
function savedDegree(message, tokenId) {
  for (const v of Object.values(message?.flags?.[TOOLBELT]?.targetHelper?.saveVariants ?? {})) { const s = v?.saves?.[tokenId]; if (s?.success in DEGREE) return DEGREE[s.success]; }
  return null;
}
/** Toolbelt's button that rolls this creature's save on the card in this page's chat log: the d20 for creatures no player owns, otherwise its row's own.
    Rows carry no token id, so they're matched in Toolbelt's own order for a GM (no player owner first, then by name; its createTargetsRows) and the name
    is checked. Null if it can't be found. */
async function saveButton(message, target, npc) {
  let el = null; for (let t = 0; t < 3000 && !(el = ui.chat?.element?.querySelector?.(`[data-message-id="${message.id}"]`)); t += 200) await new Promise(r => setTimeout(r, 200));
  if (!el) return null;
  if (npc) { const b = el.querySelector(".pf2e-toolbelt-target-rollSaves"); if (b) return b; }
  const toks = (message.flags?.[TOOLBELT]?.targetHelper?.targets ?? []).map(u => fromUuidSync(u)).filter(Boolean);
  const order = toks.map((t, k) => ({ t, k })).sort((a, b) => (a.t.hasPlayerOwner - b.t.hasPlayerOwner) || (a.t.name < b.t.name ? -1 : a.t.name > b.t.name ? 1 : a.k - b.k)).map(x => x.t);
  const rows = [...el.querySelectorAll(".pf2e-toolbelt-target-targetRows .target-row")], nameOf = r => r.querySelector(".name")?.textContent.trim() ?? "";
  let row = rows[order.findIndex(t => t.id === target.id)];
  if (!row || nameOf(row) !== target.name) { const same = rows.filter(r => nameOf(r) === target.name); row = same.length === 1 ? same[0] : null; }
  return row?.querySelector("[data-action=roll-save]") ?? null;
}
/** Roll a creature's save on the card through Toolbelt's own button, with the user's dialog rule (Shift flips it, as for Strikes), and wait for the result. */
async function rollSaveOnCard(message, target) {
  const npc = !target.actor?.hasPlayerOwner, button = await saveButton(message, target, npc);
  if (!button) throw new Error(`I couldn't find Toolbelt's save button for ${target.name} on the spell's card.`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: !!game.user.settings?.showCheckDialogs }));
  for (let t = 0; t < 12000; t += 250) { await new Promise(r => setTimeout(r, 250)); const d = savedDegree(game.messages.get(message.id), target.id); if (d != null) return d; }
  return null;
}
const SAVE_WORD = s => s[0].toUpperCase() + s.slice(1);
/** The save stage: the target's save from its row, rolled by the module for a creature no player owns, one whose player is offline, or when the GM pressed
    Roll it for them; otherwise "wait" for the player. "saved" once it's in. */
async function awaitSave(combat, id, i, step, tok, target) {
  const get = () => request(combat, id).log?.[i] ?? {}, card = game.messages.get(get().cast?.message);
  if (!card) { await addNote(combat, id, `${step.itemName}'s card is gone, so I can't read ${step.target}'s save.`); return "ask"; }
  if (!card.flags?.[TOOLBELT]?.targetHelper) { await save(combat, id, { log: { [i]: { noRows: true } }, note: joinNote(combat, id, `${step.itemName}'s card has no target rows (is Toolbelt's Target Helper on?): roll ${step.target}'s save and apply it yourself.`) }); return "gm"; }
  let degree = savedDegree(card, target.id);
  if (degree == null) {
    const asked = !!request(combat, id).rollFor?.[target.id], npc = !target.actor?.hasPlayerOwner, rolled = get().rollStarted ?? 0;
    if (asked || (!rolled && (npc || !ownerOnline(target.actor)))) {
      if (!stepGate("save", id)) return "stopped";
      if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
      await saveTurns(combat, { [`requests.${id}.log.${i}.rollStarted`]: rolled + 1, [`requests.${id}.log.${i}.waiting`]: [target.id], ...(asked ? { [`requests.${id}.rollFor.${target.id}`]: null } : {}) });
      degree = await watched(() => rollSaveOnCard(card, target));
    }
  }
  if (degree == null) { if (!get().waiting) await save(combat, id, { log: { [i]: { waiting: [target.id] } } }); return "wait"; }
  const gm = !step.damaging || !step.basic ? `Apply ${step.itemName} for ${step.target}'s ${CHECK_OUTCOMES[degree]} ${SAVE_WORD(step.save)} save from its card.`
    : step.critText ? `Anything ${step.itemName}'s text gives for ${step.target}'s ${CHECK_OUTCOMES[degree]} beyond its damage is yours to apply from its card.` : null;
  /* the result, a Roll it for them it made unnecessary, and the GM's note in one save */
  await saveTurns(combat, { [`requests.${id}.log.${i}.save`]: { degree }, [`requests.${id}.log.${i}.waiting`]: null, [`requests.${id}.rollFor.${target.id}`]: null, ...(gm ? { [`requests.${id}.note`]: joinNote(combat, id, gm) } : {}) });
  return "saved";
}
const cardWords = (step) => `Apply ${step.itemName}${step.area ? `: place its ${step.area.size}-foot ${step.area.type}${step.target ? ` aimed at ${step.target}` : ""} from its card and resolve it` : `${step.target ? ` at ${step.target}` : ""} from its card`}.`;
async function runSpell(combat, id, i, step, tok, target) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {};
  const found = spellFor(tok.actor, step); if (!found) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  const { entry, spell } = found;
  for (let guard = 0; guard < 12; guard++) {
    const now = nextSpell(get(), { mode: step.mode, flat: step.flat ?? 0, apply: applySetting(), damaging: step.damaging, basic: step.basic });
    if (now === "next" || now === "gm" || now === "ask") return now;
    if (now === "save") { const s = await awaitSave(combat, id, i, step, tok, target); if (s === "saved") continue; return s; }
    if (!stepGate(now, id)) return "stopped";
    if (now !== "apply" && !(await ensureScene(combat) && tok.object && (!target || target.object))) throw new Error(cantOpen());   /* applying needs no canvas */
    pending = { tokenId: tok.id, waiters: new Map(), all: true };
    try {
      if (now === "cast") {
        if (target) aimAt(target); else stopAiming();   /* Toolbelt puts a row on the card for each of the runner's targets */
        await record({ castStarted: true });
        const message = await watched(async () => { const card = waitFor("spell-cast"); await entry.cast(spell, { rank: step.rank, consume: true }); return card; });
        /* the record and the GM's instruction in one save, so a reload can't keep one without the other */
        await save(combat, id, { log: { [i]: { cast: { message: message.id } } }, ...(step.mode === "card" ? { note: joinNote(combat, id, cardWords(step)) } : {}) });
      } else if (now === "flat") {
        await record({ flatStarted: true });
        const roll = await watched(async () => { const r = await new Roll("1d20").evaluate(); await r.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ token: tok }), flavor: `Flat check, DC ${step.flat}` }); return r; });
        await record({ flat: { dc: step.flat, total: roll.total, ok: roll.total >= step.flat } });
        if (roll.total < step.flat) await addNote(combat, id, `${step.itemName} at ${step.target} failed its DC ${step.flat} flat check (${roll.total}): it doesn't affect them.`);
      } else if (now === "attack") {
        aimAt(target); await record({ started: true });
        const { message, roll } = await watched(async () => { const card = waitForAny(["spell-attack-roll", "attack-roll"]), roll = await spell.rollAttack(clickWith("showCheckDialogs"), (step.variant ?? 0) + 1); return { message: await card, roll }; });
        const degree = roll?.degreeOfSuccess ?? message.rolls?.[0]?.degreeOfSuccess ?? null;
        if (degree == null) { await addNote(combat, id, `${step.itemName}'s attack card has no result (did it have a target?).`); return "ask"; }   /* never a silent critical miss */
        const gm = degree >= 2 && !step.damaging ? `Apply ${step.itemName}'s ${OUTCOMES[degree]} at ${step.target} from its card.`
          : degree >= 2 && step.critText ? `${step.itemName} ${degree === 3 ? "critically hit" : "hit"} ${step.target}${degree === 3 && applySetting() ? ": its damage is doubled" : ""}; anything else its ${degree === 3 ? "critical success" : "success"} gives is yours to apply from its card.` : null;
        /* PF2e rolls a spell attack's damage as a hit: with automatic damage off, the GM doubles it */
        const double = degree === 3 && step.damaging && !applySetting() ? `It was a critical hit: use Double on ${step.itemName}'s damage card.` : null;
        const words = [gm, double].filter(Boolean).join(" ");
        await save(combat, id, { log: { [i]: { attack: { message: message.id, degree } } }, ...(words ? { note: joinNote(combat, id, words) } : {}) });
      } else if (now === "damage") {
        aimAt(target); await record({ damageStarted: true });
        /* the damage at the rank it was cast at (PF2e reads that from the card's button, which a script has none of) */
        const message = await watched(async () => { const card = waitFor("damage-roll"); const v = (step.rank !== spell.rank ? spell.loadVariant?.({ castRank: step.rank }) : null) ?? spell; await v.rollDamage(clickWith("showDamageDialogs"), step.mode === "attack" ? step.variant ?? 0 : undefined); return card; });
        await record({ damage: { message: message.id } });
        if (applySetting()) await markApplied(message);
      } else if (now === "apply") {
        const message = game.messages.get(get().damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        await record({ applying: true }); const was = hpNow(target);
        await watched(() => applyFromCard(message, roll, target, spellMultiplier(step, get())));
        await record({ applied: true, hp: [was, hpNow(target)] });
        if (target.actor?.isOfType?.("character") && target.actor.hitPoints?.value === 0) await addNote(combat, id, `${target.name} is at 0 HP. If you undo this, PF2e restores the HP but you still need to remove Wounded and Prone and put their initiative back.`);
      }
    } finally { pending = null; }
  }
  return "ask";
}
/* ---------- areas (Rhea, 2026-11-07) ----------
   The module places PF2e's own area for a monster's area spell: the Region PF2e's Place button makes (placeRegionFromItem in 8.7.0: a circle for a burst,
   a 90° cone, a line one square wide, an emanation round the caster's token, "coverage" highlighting, PF2e's messageId, origin and areaShape flags, which
   Visioner reads to give each creature its cover on the Reflex save from the area's origin). Who it catches is decided by Foundry's own test of each
   square's centre (what the highlighted squares show), and line of effect is stopped only by solid walls, never trunks. */
const SOLID_SIGHT = (CONST.EDGE_SENSE_TYPES ?? CONST.WALL_SENSE_TYPES).NORMAL, SOLID_MOVE = CONST.WALL_MOVEMENT_TYPES.NORMAL;
/** Solid walls, in squares: ones that block both movement and sight. Never Survey Sheet's trunks (they give cover to the save instead), never an open door. */
function solidWalls(scene) {
  const g = scene.grid.size, X = scene.dimensions.sceneX, Y = scene.dimensions.sceneY;
  return scene.walls.contents.filter(w => w.move === SOLID_MOVE && w.sight === SOLID_SIGHT && w.flags?.["lythara-survey-sheet"]?.enc !== "trunk" && !(w.door && w.ds === CONST.WALL_DOOR_STATES.OPEN))
    .map(w => [[(w.c[0] - X) / g, (w.c[1] - Y) / g], [(w.c[2] - X) / g, (w.c[3] - Y) / g]]);
}
/** A shape in squares (area.mjs's shapeOf) as a Region shape in pixels. A token shape's width and height stay in squares. */
function shapePx(shape, scene, tok) {
  const g = scene.grid.size, X = scene.dimensions.sceneX, Y = scene.dimensions.sceneY, out = { ...shape };
  if ("x" in shape) { out.x = X + shape.x * g; out.y = Y + shape.y * g; }
  for (const k of ["radius", "length"]) if (k in shape) out[k] = shape[k] * g;
  if (shape.type === "line") out.width = shape.width * g;
  if (shape.type === "emanation") { delete out.x; delete out.y; out.base = { ...shape.base, x: X + shape.base.x * g, y: Y + shape.base.y * g, shape: tok.shape }; }
  return out;
}
/** What an aim covers and catches on the scene as it stands, writing nothing: a Region made in memory only, Foundry's own test on each square's centre.
    from: { square, size } where the caster stands (after a move earlier in the plan). */
function coverage(scene, tok, aim, from) {
  const shape = shapePx(shapeOf(aim, from), scene, tok), doc = new foundry.documents.RegionDocument({ name: "area", shapes: [shape], levels: [] }, { parent: scene });
  const g = scene.grid.size, X = scene.dimensions.sceneX, Y = scene.dimensions.sceneY, covered = new Set();
  /* the same test as core's highlighted squares (Region#_getCoveredGridSpaceOffsets): a square's centre inside the shape, with its 0.75 px tolerance */
  for (const [x, y] of squaresNear(aim, from)) if (doc.polygonTree.testPoint({ x: X + (x + 0.5) * g, y: Y + (y + 0.5) * g }, 0.75)) covered.add(`${x},${y}`);
  /* a creature off the grid is tested where it really is, as Foundry tests a token against a placed Region (its containment test points), so the check
     and the area on the map agree; one on the grid by its squares, as before */
  const points = t => t.getContainmentTestPoints({ x: t.x, y: t.y, elevation: t.elevation, width: t.width, height: t.height, depth: t.depth, shape: t.shape }).map(p => [(p.x - X) / g, (p.y - Y) / g]);
  const creatures = scene.tokens.contents.filter(t => t.actor?.isOfType?.("creature") && !t.actor.isDead && !isBelow(t)).map(t => ({ id: t.id, square: t.id === tok.id ? from.square : squareOf(t, scene), size: sizeOf(t), ...spanOf(t, t.id === tok.id ? from.elev : null), ...(t.id !== tok.id && offGrid(t, scene) ? { points: points(t) } : {}) }));
  const walls = solidWalls(scene), insideAt = ([x, y]) => doc.polygonTree.testPoint({ x: X + x * g, y: Y + y * g }, 0.75);
  /* height (0.13.0): a burst starts on the ground at its corner; a cone, line or emanation at the caster's height */
  const casterElev = Number(from.elev ?? tok.elevation) || 0, originElev = aim.type === "burst" ? 0 : aim.type === "emanation" ? spanOf(tok, casterElev) : casterElev;
  return { shape, covered, reachable: burstReachable(aim, walls), ids: caughtBy(aim, covered, creatures, walls, tok.id, insideAt, originElev) };
}
/** The plan check's view of an area: who it catches, as labels the monster may know. Allies the GM hid, and creatures it doesn't perceive, are caught but
    never named to the thinker; their token ids go on the step for the GM's card only. now: what `sense` gave. */
function areaCheck(combat, tok, req, now) {
  const allyLabel = new Map(Object.entries(alliesByLabel(combat, tok)).map(([l]) => [tokenIdOf(combat, req, l), l]));
  const enemyLabel = new Map(Object.entries(req.labels ?? {}).filter(([, id]) => canTarget(now.get(id)?.state)).map(([l, id]) => [id, l]));
  return (sp, aimStep, from, target) => {
    const r = aimArea(sp.area, aimStep, from, target); if (!r.ok) return r;
    const { ids, reachable } = coverage(combat.scene, tok, r.aim, from);
    if (!reachable) return { ok: false, reason: `a solid wall stands between it and the corner [${r.aim.corner[0]}, ${r.aim.corner[1]}], so the burst can't start there.` };
    return { ok: true, aim: r.aim, ids, allies: alliesCaught(ids, id => allyLabel.get(id) ?? null), self: allyLabel.get(tok.id) ?? null, known: ids.map(id => enemyLabel.get(id)).filter(Boolean) };
  };
}
/** Target every creature in a list on the runner's own account, so Toolbelt gives each a row on the card. */
function aimAll(tokens) {
  stopAiming();
  for (const t of tokens.filter(Boolean)) t.object?.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
}
const areaFlag = (combat, id, i) => r => { const a = r.flags?.[ID]?.area; return a?.combat === combat.id && a.request === id && a.step === i; };
/** PF2e's own Region for the cast, found again if it already exists (safe after a reload). */
async function placeArea(combat, id, i, step, tok, spell, message) {
  const scene = combat.scene, had = scene.regions.find(areaFlag(combat, id, i)); if (had) return had;
  const from = { square: squareOf(tok, scene), size: sizeOf(tok) }, shape = shapePx(shapeOf(step.area.aim, from), scene, tok);
  const origin = { name: spell.name, slug: spell.slug, traits: foundry.utils.deepClone(spell.system.traits?.value ?? []), ...(spell.getOriginData?.() ?? {}) };
  const [made] = await scene.createEmbeddedDocuments("Region", [{ name: spell.name, shapes: [shape], levels: canvas.level ? [canvas.level.id] : [], color: game.user.color.toString(),
    highlightMode: "coverage", displayMeasurements: false, visibility: CONST.REGION_VISIBILITY.ALWAYS,
    /* Toolbelt's Template Helper opens its "target the tokens in this area?" dialog for any spell area its own user creates; on the runner's page nobody can
       click it (found live 2026-11-07), and the module targets the creatures itself, so it's told to skip (its own flag, read in its createRegion hook) */
    flags: { pf2e: { messageId: message?.id ?? null, origin, areaShape: spell.system.area?.type ?? step.area.type }, [TOOLBELT]: { targetHelper: { skip: true } }, [ID]: { area: { combat: combat.id, request: id, step: i, mode: step.mode, lasting: !!step.lasting } } } }]);
  return made;
}
/** Instant areas go once they're done (Rhea, 2026-11-07); lasting ones stay for the GM. This drops instant card-mode areas, which the GM resolves from
    the card, once the turn goes on (keep: the request and step from which areas still matter). An area the module resolves removes itself when it's done;
    one left unresolved (the turn moved on during its saves) stays for the GM. */
async function dropInstantAreas(combat, keep = null) {
  const ids = combat.scene?.regions.filter(r => { const a = r.flags?.[ID]?.area; return a?.combat === combat.id && !a.lasting && a.mode !== "area" && !(keep && a.request === keep.id && a.step >= (keep.pos ?? 0)); }).map(r => r.id) ?? [];
  if (ids.length) await combat.scene.deleteEmbeddedDocuments("Region", ids);
}
/** Roll several creatures' saves on a card through Toolbelt's own buttons: the d20 once for those no player owns, then each player's row. Waits for all. */
async function rollSavesOnCard(message, targets) {
  const shift = !!game.user.settings?.showCheckDialogs, click = b => b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: shift }));
  const settled = async list => { for (let t = 0; t < 12000; t += 250) { await new Promise(r => setTimeout(r, 250)); const m = game.messages.get(message.id); if (list.every(x => savedDegree(m, x.id) != null)) return true; } return false; };
  const npcs = targets.filter(t => !t.actor?.hasPlayerOwner), rows = targets.filter(t => t.actor?.hasPlayerOwner);
  /* Toolbelt's d20 rolls every creature no player owns that hasn't saved yet; without it, each one's own row */
  if (npcs.length) { const b = await saveButton(message, npcs[0], true); if (!b) throw new Error(`I couldn't find Toolbelt's save button on the spell's card.`);
    if (b.classList.contains("pf2e-toolbelt-target-rollSaves")) { click(b); await settled(npcs); } else rows.unshift(...npcs); }
  for (const t of rows) { const b = await saveButton(message, t, false); if (!b) throw new Error(`I couldn't find ${t.name}'s row on the spell's card.`); click(b); await settled([t]); }
}
/** Everyone's saves on an area's card: rolled by the module for creatures no player owns, offline players, and any the GM asked it to roll; a player online
    rolls their own and the turn waits ("wait"), with no timer. "saved" once all are in. */
async function awaitAreaSaves(combat, id, i, step, tok) {
  const get = () => request(combat, id).log?.[i] ?? {}, scene = combat.scene, card = game.messages.get(get().cast?.message);
  if (!card) { await addNote(combat, id, `${step.itemName}'s card is gone, so I can't read the saves.`); return "ask"; }
  if (!card.flags?.[TOOLBELT]?.targetHelper) { await save(combat, id, { log: { [i]: { noRows: true } }, note: joinNote(combat, id, `${step.itemName}'s card has no target rows (is Toolbelt's Target Helper on?): roll the saves and apply it yourself.`) }); return "gm"; }
  const rows = get().rows ?? [], missing = () => rows.filter(t => savedDegree(game.messages.get(card.id), t) == null);
  const asked = request(combat, id).rollFor ?? {}, rolled = get().rollStarted ?? 0;
  const mine = missing().map(t => scene.tokens.get(t)).filter(t => t && (asked[t.id] || (!rolled && (!t.actor?.hasPlayerOwner || !ownerOnline(t.actor)))));
  if (mine.length) {
    if (!stepGate("save", id)) return "stopped";
    if (!(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());
    /* a Roll it for them for a creature whose save already landed is cleared too, so it doesn't restart the run again and again */
    await saveTurns(combat, { [`requests.${id}.log.${i}.rollStarted`]: rolled + 1, [`requests.${id}.log.${i}.waiting`]: missing(), ...Object.fromEntries(Object.keys(asked).filter(t => asked[t] && (mine.some(x => x.id === t) || !missing().includes(t))).map(t => [`requests.${id}.rollFor.${t}`, null])) });
    await watched(() => rollSavesOnCard(card, mine));
  }
  const left = missing().filter(t => scene.tokens.get(t));   /* a creature removed from the map while waiting has nothing left to save */
  if (left.length) { await save(combat, id, { log: { [i]: { waiting: left } } }); return "wait"; }
  const r = request(combat, id), m = game.messages.get(card.id), saves = Object.fromEntries(rows.filter(t => scene.tokens.get(t)).map(t => [t, savedDegree(m, t)]));
  /* what the monster learns: the saves of creatures it knows of, by label */
  const known = new Map([...Object.entries(r.labels ?? {}).map(([l, t]) => [t, l]), ...Object.entries(alliesByLabel(combat, tok)).map(([l]) => [tokenIdOf(combat, r, l), l])]);
  const results = Object.entries(saves).filter(([t]) => known.has(t)).map(([t, d]) => `${known.get(t)} ${CHECK_OUTCOMES[d]}`).join(", ");
  const gm = step.critText ? `Anything ${step.itemName}'s text gives beyond its damage for each degree is yours to apply from its card.` : null;
  await saveTurns(combat, { [`requests.${id}.log.${i}.saves`]: saves, [`requests.${id}.log.${i}.rows`]: Object.keys(saves), [`requests.${id}.log.${i}.waiting`]: null, [`requests.${id}.log.${i}.results`]: results,
    ...Object.fromEntries(rows.map(t => [`requests.${id}.rollFor.${t}`, null])), ...(gm ? { [`requests.${id}.note`]: joinNote(combat, id, gm) } : {}) });
  return "saved";
}
/** An area spell (Rhea, 2026-11-07): cast with every caught creature targeted, PF2e's area placed, then for a damaging basic save everyone's save and the
    damage by degree; anything else is the GM's from the card. Stages from nextArea; nothing repeats. */
async function runArea(combat, id, i, step, tok) {
  const record = change => save(combat, id, { log: { [i]: change } }), get = () => request(combat, id).log?.[i] ?? {}, scene = combat.scene;
  const found = spellFor(tok.actor, step); if (!found) throw new Error(`${tok.name} has no ${step.itemName} now.`);
  const { entry, spell } = found;
  for (let guard = 0; guard < 40; guard++) {
    const now = nextArea(get(), { mode: step.mode, apply: applySetting(), lasting: !!step.lasting });
    if (now === "next" || now === "gm" || now === "ask") return now;
    if (now === "save") { const s = await awaitAreaSaves(combat, id, i, step, tok); if (s === "saved") continue; return s; }
    if (!stepGate(now, id)) return "stopped";
    if (now !== "apply" && now !== "remove" && !(await ensureScene(combat) && tok.object)) throw new Error(cantOpen());   /* applying and removing need no canvas */
    pending = { tokenId: tok.id, waiters: new Map(), all: true };
    try {
      if (now === "cast") {
        /* who it catches from where it stands now; GM-hidden creatures get no row on a public card, so the GM resolves them */
        const { ids } = coverage(scene, tok, step.area.aim, { square: squareOf(tok, scene), size: sizeOf(tok), elev: Number(tok.elevation) || 0 });
        const rows = ids.filter(t => !scene.tokens.get(t)?.hidden), hidden = ids.filter(t => scene.tokens.get(t)?.hidden);
        aimAll(rows.map(t => scene.tokens.get(t)));
        await record({ castStarted: true, caught: ids, rows, ...(rows.length ? {} : { results: "" }) });
        const message = await watched(async () => { const card = waitFor("spell-cast"); await entry.cast(spell, { rank: step.rank, consume: true }); return card; });
        const names = list => listWords(list.map(t => scene.tokens.get(t)?.name ?? "someone"));
        const words = [step.mode === "card" ? `Apply ${step.itemName} from its card${rows.length ? ` to ${names(rows)}` : ""}: its area is on the map.` : null,
          hidden.length ? `It also caught ${names(hidden)}, hidden from the players, so they have no row: ${spell.system.defense?.save?.statistic ? `roll ${hidden.length === 1 ? "that save" : "those saves"} and apply` : "apply"} ${step.itemName} to ${hidden.length === 1 ? "them" : "those"} yourself.` : null].filter(Boolean).join(" ");
        await save(combat, id, { log: { [i]: { cast: { message: message.id } } }, ...(words ? { note: joinNote(combat, id, words) } : {}) });
      } else if (now === "place") {
        const made = await watched(() => placeArea(combat, id, i, step, tok, spell, game.messages.get(get().cast.message)));
        await record({ placed: { region: made.id } });
      } else if (now === "damage") {
        const hurt = areaHurt(get()); aimAll(Object.keys(hurt).map(t => scene.tokens.get(t)));
        await record({ damageStarted: true });
        const message = await watched(async () => { const card = waitFor("damage-roll"); const v = (step.rank !== spell.rank ? spell.loadVariant?.({ castRank: step.rank }) : null) ?? spell; await v.rollDamage(clickWith("showDamageDialogs")); return card; });
        /* with automatic damage off the GM applies it: say each creature's share, since the damage card isn't tied to the saves */
        const off = applySetting() ? null : `Apply ${step.itemName}'s damage from its card: ${listWords(Object.entries(hurt).map(([t, m]) => `${scene.tokens.get(t)?.name ?? "someone"} ${m === 2 ? "double" : m === 0.5 ? "half" : "full"}`))}.`;
        await save(combat, id, { log: { [i]: { damage: { message: message.id } } }, ...(off ? { note: joinNote(combat, id, off) } : {}) });
        if (applySetting()) await markApplied(message);
      } else if (now === "apply") {
        const rec = get(), hurt = areaHurt(rec), t = Object.keys(hurt).find(x => !rec.applied?.[x]), target = scene.tokens.get(t);
        const message = game.messages.get(rec.damage.message), roll = message?.rolls?.[0]; if (!roll) return "ask";
        if (!target) { await record({ applied: { [t]: true } }); continue; }   /* removed from the map: nothing to apply to */
        await record({ applying: { [t]: true } }); const was = hpNow(target);
        await watched(() => applyFromCard(message, roll, target, hurt[t]));
        /* its own area hurting itself (a deliberate burst it stands in) isn't news to the look before its next action: the record and the baseline in one save */
        const own = t === tok.id && request(combat, id).seen ? { [`requests.${id}.seen.me.hp`]: (tok.actor.hitPoints?.value ?? 0) + (tok.actor.hitPoints?.temp ?? 0) } : {};
        await saveTurns(combat, { [`requests.${id}.log.${i}.applied.${t}`]: true, [`requests.${id}.log.${i}.hp.${t}`]: [was, hpNow(target)], ...own });
        if (target.actor?.isOfType?.("character") && target.actor.hitPoints?.value === 0) await addNote(combat, id, `${target.name} is at 0 HP. If you undo this, PF2e restores the HP but you still need to remove Wounded and Prone and put their initiative back.`);
      } else if (now === "remove") {
        const r = scene.regions.find(areaFlag(combat, id, i)); if (r) await r.delete();
        await record({ removed: true });
      }
    } finally { pending = null; }
  }
  return "ask";
}
/** Roll it for them (the card's button for a save still waiting): from any GM's browser; the runner rolls it on the card through Toolbelt. */
export async function rollFor(combat, requestId, tokenId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (r?.state !== "saves") throw new Error("That turn isn't waiting for a save.");
  await save(combat, requestId, { rollFor: { [tokenId]: true } });   /* no "go": the runner acts on this only while the turn still waits for that save */
  if (isRunner()) return doIt(combat, requestId);
}
/** Whether a turn waiting on a save has it now (the save landed while the step was still deciding to wait). */
function saveArrived(combat, r) {
  const rec = r?.log?.[r.pos ?? 0], card = game.messages.get(rec?.cast?.message);
  return !!card && (rec.waiting ?? []).some(t => savedDegree(card, t) != null);
}
/** A spell's card changed: a save on its Toolbelt row may be what a waiting turn needs. Runner only. */
export function onMessageUpdate(message, change) {
  if (!isRunner() || !foundry.utils.hasProperty(change, `flags.${TOOLBELT}`)) return;
  for (const combat of game.combats.filter(c => c.started)) {
    const r = currentRequest(combat);
    if (r?.state === "saves" && Object.values(r.log ?? {}).some(l => l?.cast?.message === message.id)) doIt(combat, r.id).catch(e => console.error(`${ID} | turn`, e));
  }
}
/* what PF2e's own Damage, Half and Double buttons do (applyDamageFromMessage, 8.7.0), for a named target rather than the selected tokens: the roll
   altered by the multiplier, and the target told whether the damage comes from an ally or an enemy. Effects that only count for this one hit aren't read. */
async function applyFromCard(message, roll, target, multiplier = 1) {
  const context = message.flags.pf2e?.context ?? {}, { origin, keep } = damageOptions(context.options ?? []), actor = target.actor.getContextualClone(origin, []);
  const side = target.actor.alliance && message.actor ? [`origin:${target.actor.alliance === message.actor.alliance ? "ally" : "enemy"}`] : [];
  const rollOptions = new Set([...keep, ...side, ...origin, ...actor.getSelfRollOptions()]);
  await actor.applyDamage({ damage: multiplier === 1 ? roll : roll.alter(multiplier, 0), token: target, item: message.item, rollOptions, shieldBlockRequest: false, outcome: context.outcome });
}
/** Do it (and Next step): on the runner, carry the plan on from where it stands. Without Auto it does one action and waits for Next step; with Auto it
    goes on by itself, with a pause between actions. Safe to call again after a reload: finished work is never repeated. From anyone else's browser it
    asks the runner, through the flag; a turn never runs quietly in the wrong browser. */
export async function doIt(combat, requestId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  if (!isRunner()) { const why = runnerProblem(); if (why) throw new Error(why); return save(combat, requestId, { go: true }); }
  if (running.has(requestId)) return;
  running.add(requestId); try { await runTurn(combat, requestId); } finally { running.delete(requestId); stopAiming(); }
  /* a save that landed between reading the card and writing "saves" fired no hook this page would act on: look once more */
  const n = request(combat, requestId); if (n?.state === "saves" && saveArrived(combat, n)) setTimeout(() => doIt(combat, requestId).catch(e => console.error(`${ID} | turn`, e)), 0);
}
const autoPause = () => Math.max(0, Number(game.settings.get(ID, "autoPause")) || 0);
/* Auto ends the monster's turn itself (Rhea, 2026-11-07: "If it's on auto then yes"), END_MS after its last action, so the last roll can be seen. Only
   when the turn finished by itself: a card for the GM to apply, a stop, Play it myself or a turn handed to the GM leave it to the GM. Nothing ends a
   turn that has moved on, or one with another request still going (a re-plan). */
const END_MS = 2000, ending = new Set();
function endAfter(combat, requestId) {
  const r = request(combat, requestId), tok = combat.scene?.tokens.get(r?.tokenId), key = `${combat.id}.${r?.round}.${r?.combatantId}`;
  if (!r || !tok?.getFlag(ID, "auto") || ending.has(key)) return;
  ending.add(key);
  setTimeout(async () => {
    try {
      while (game.paused) await new Promise(r => setTimeout(r, 300));   /* paused: the turn ends once the GM unpauses, if it is still this monster's */
      const n = request(combat, requestId);
      if (n?.state !== "done" || !combat.started || combat.round !== r.round || combat.combatant?.id !== r.combatantId || currentRequest(combat) || !tok.getFlag(ID, "auto")) return;   /* Auto read again: unticked in the 2 s, the GM ends it */
      await combat.nextTurn();
    } catch (e) { console.error(`${ID} | ending the turn`, e); } finally { ending.delete(key); }
  }, END_MS);
}
/* The game's pause pauses Auto (Rhea, 2026-11-08: "Pause would pause all actions"): while `game.paused`, Auto starts no action and ends no turn, and
   goes on when the GM unpauses. A GM's own press (Do it, Next step) still acts while paused: she asked for it. Returns true when the turn should
   stop instead (Hold, Play it myself, or the turn moved on while waiting). */
async function pausedAuto(combat, requestId, tok) {
  if (!tok?.getFlag(ID, "auto") || !game.paused) return false;
  while (game.paused) {
    await new Promise(r => setTimeout(r, 300));
    const n = request(combat, requestId);
    if (!n || n.hold || n.state === "manual" || n.state === "done" || !combat.started || combat.combatant?.id !== n.combatantId) return true;
  }
  return false;
}
/* Auto's pause between actions, so each roll can be followed. Hold and Play it myself end it at once. */
async function pauseBetween(combat, id) {
  const end = Date.now() + autoPause() * 1000;
  while (Date.now() < end) { await new Promise(r => setTimeout(r, Math.min(200, end - Date.now()))); const n = request(combat, id); if (n?.hold || n?.state === "manual") return; }
}
async function runTurn(combat, requestId) {
  const r = request(combat, requestId); if (!RESUMABLE.includes(r?.state)) throw new Error("That turn isn't ready.");
  if (!await ensureScene(combat)) return save(combat, requestId, { state: "stopped", go: false, note: cantOpen() });
  /* pressing Do it means go, whatever was held. A note about why it stopped goes; one from an earlier step (a PC at 0 HP) stays with the turn. */
  await save(combat, requestId, { state: "running", go: false, hold: false, gmWait: false, changeVerdict: null, ...(r.state === "held" || r.state === "stopped" ? { note: null } : {}) });
  const tok = combat.scene.tokens.get(r.tokenId);
  await dropInstantAreas(combat, { id: requestId, pos: r.pos ?? 0 }).catch(e => console.warn(`${ID} | areas`, e));   /* an instant area the GM resolved from its card */
  await settleCover(combat, requestId, r.pos ?? 0, tok);   /* a reload between a step and ending its Take Cover */
  for (let i = r.pos ?? 0; i < r.steps.length; i++) {
    if (i > (r.pos ?? 0) && await pausedAuto(combat, requestId, tok)) return;   /* the game's pause pauses Auto too (Rhea, 2026-11-08): the step the GM pressed for still runs */
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
      /* an ability as it checks out now: a Grab whose Strike missed may still keep hold of a creature it has grabbed */
      if (step.do === "ability" && look.next?.do === "ability" && (look.next.mode !== step.mode || look.next.target !== step.target)) { step = look.next; r.steps[i] = step; await save(combat, requestId, { steps: r.steps }); }
      /* an area as it checks out now: where it stands and who it catches */
      if (step.do === "spell" && step.area?.aim && look.next?.do === "spell" && JSON.stringify(look.next.area) !== JSON.stringify(step.area)) { step = look.next; r.steps[i] = step; await save(combat, requestId, { steps: r.steps }); }
      /* out of hiding just before anything but Hide, Sneak, Step or an attack (Rhea, 2026-11-07, A) */
      if (revealsBefore(step)) await comeOut(combat, requestId, tok, actWords(step)).catch(e => console.warn(`${ID} | out of hiding`, e));
    }
    let work = null;
    if (step.do === "strike") {
      const target = combat.scene.tokens.get(r.labels[step.target]); if (!target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
      work = () => runStrike(combat, requestId, i, step, tok, target);
    } else if (step.do in STEALTH_WORD) work = () => runStealth(combat, requestId, i, step, tok);   /* before moves: a Sneak is a move too */
    else if (isMove(step)) work = () => runStride(combat, requestId, i, step, tok);
    else if (step.do in POSTURES) work = () => runPosture(combat, requestId, i, step.do, tok);
    else if (step.do === "take-cover") work = () => runTakeCover(combat, requestId, i, tok);
    else if (step.do === "interact") work = () => runInteract(combat, requestId, i, step, tok);
    else if (step.do === "climb") work = () => runClimb(combat, requestId, i, step, tok);
    else if (step.do === "release") work = () => runRelease(combat, requestId, i, step, tok);
    else if (step.do === "delay") work = () => runDelay(combat, requestId, i, step, tok);
    else if (step.do === "ability") {
      const target = step.target ? combat.scene.tokens.get(r.labels[step.target]) : null; if (step.target && !target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
      work = () => runAbility(combat, requestId, i, step, tok, target);
    } else if (step.do === "spell") {
      const tid = step.target ? tokenIdOf(combat, r, step.target) : null, target = tid ? combat.scene.tokens.get(tid) : null; if (step.target && !target) return save(combat, requestId, { state: "stopped", note: `${step.targetName} is gone.` });
      work = step.area?.aim ? () => runArea(combat, requestId, i, step, tok) : () => runSpell(combat, requestId, i, step, tok, target);
    }
    if (work) {
      let result; try { result = await work(); } catch (e) { console.error(e); result = "ask"; await save(combat, requestId, { note: e.message }); }
      if (result === "stopped") return save(combat, requestId, { state: "stopped" });
      /* a Delay ended the turn itself (the rest of the turn doesn't happen): the request is done, and its new turn comes after the named creature's */
      if (result === "delayed") return save(combat, requestId, { pos: i + 1, coverSettled: i + 1, state: "done", delayed: true });
      /* a shot it couldn't make (no ammunition left, or Ranged Combat refused): nothing was rolled, so ask again with the action unspent */
      if (result === "noShot" || result === "noShotSpent") {
        const b = turns(combat).noShot?.[tok.id], items = b?.round === combat.round ? [...new Set([...(b.items ?? []), step.item])] : [step.item];
        await saveTurns(combat, { [`noShot.${tok.id}`]: whole({ round: combat.round, items }) });   /* no shots with it for the rest of this turn */
        const spent = result === "noShotSpent";   /* after a flat check the action is spent: no free reroll */
        return replan(combat, { ...request(combat, requestId), id: requestId }, spent ? i + 1 : i, [{ who: "me", what: "noShot", item: step.itemName, why: "no ammunition it can use", spent }], tok);
      }
      /* a save the player rolls: the turn waits, with no timer, until their row on the spell's card has it (or the GM presses Roll it for them) */
      if (result === "wait") return save(combat, requestId, { state: request(combat, requestId).state === "manual" ? "manual" : "saves" });
      if (result === "ask") return save(combat, requestId, { state: "stopped", note: `${request(combat, requestId).note ?? ""} Step ${i + 1} may not have finished. ${isMove(step) ? "Put the monster where it should be" : step.do in POSTURES ? "Check whether it is prone" : step.do === "take-cover" ? "Check whether it is Taking Cover" : step.do === "interact" ? "Check the chat for its Interact card" : step.do === "delay" ? "Check the tracker: its turn should have ended and its place moved to just after the creature it waits for" : step.do === "ability" ? "Check the chat, HP and conditions" : step.do === "spell" ? "Check the chat, the spell's slot or use, HP and conditions" : step.do in STEALTH_WORD ? `Check its ${STEALTH_WORD[step.do]} card and apply Visioner's results if they aren't${step.do === "sneak" ? ", and where it stands" : ""}` : step.do === "strike" && tok.actor?.type === "npc" && rangedOn() && strikesWithIds(tok.actor).find(x => x.id === step.item)?.strike?.item?.isRanged ? "Check the chat, HP and its ammunition (the module takes a monster's ammunition after the roll)" : "Check the chat and HP"}, then play the rest yourself.`.trim() });
      /* an attack from hiding: the target was off-guard to it, and now it is observed (Visioner's Attack Consequences on its card, or the module) */
      if (revealsAfter(step)) await comeOut(combat, requestId, tok, actWords(step), request(combat, requestId).log?.[i]?.attack?.message ?? null).catch(e => console.warn(`${ID} | out of hiding`, e));
      await settleCover(combat, requestId, i + 1, tok, i);   /* its own attack or move ends a Take Cover */
      /* a Seek ends the plan: ask again with what it found, while it has actions left (replan ends the turn otherwise) */
      if (step.do === "burrow" && !step.below && (step.fromBelow || isBelow(tok)) && result !== "gm" && request(combat, requestId).state !== "manual") return replan(combat, { ...request(combat, requestId), id: requestId }, i + 1, [isBelow(tok) ? { who: "me", what: "stopped", at: squareOf(tok, combat.scene) } : { who: "me", what: "surfaced" }], tok, step.fromBelow ? { counted: false } : {});   /* a reload before this repeats nothing: the Seek's record says it's done, and this is reached again */   /* up out of the ground (0.16.0): asked again at the surface, as after a Seek; and (0.18.0) one meant to come up that was stopped short below, even from the surface and as the last step, so it isn't left underground with actions unspent */
      if (step.do === "seek" && result !== "gm" && request(combat, requestId).state !== "manual") return replan(combat, { ...request(combat, requestId), id: requestId }, i + 1, [{ who: "me", what: "sought" }], tok, { counted: false });   /* a reload before this repeats nothing: the Seek's record says it's done, and this is reached again */
      /* a Stride, Step or Crawl that ended short of its square: the rest was planned from there, so ask again (the reason names the square, never what stopped it) */
      const at = squareOf(tok, combat.scene);
      if (isMove(step) && result !== "gm" && !same(at, step.to) && (i + 1 < r.steps.length || step.do === "flee") && request(combat, requestId).state !== "manual") return replan(combat, { ...request(combat, requestId), id: requestId }, i + 1, [{ who: "me", what: "stopped", at }], tok);
      /* a Climb that made no progress (a failed check): the rest was planned from higher up, so ask again, as for a Stride stopped short */
      if (step.do === "climb" && result !== "gm" && request(combat, requestId).log?.[i]?.climb?.degree === 1 && i + 1 < r.steps.length && request(combat, requestId).state !== "manual") return replan(combat, { ...request(combat, requestId), id: requestId }, i + 1, [{ who: "me", what: "noClimb", height: heightUp(tok) }], tok);
      /* at the map's edge (Rhea, 2026-11-08): the turn stops, Auto or not, and the GM chooses Extend map or Let it get away on the card */
      if (step.do === "flee" && result !== "gm" && request(combat, requestId).state !== "manual") return save(combat, requestId, { pos: i + 1, coverSettled: i + 1, state: "fled", fled: { sides: edgeSides(at, sizeOf(tok), ...mapSquares(combat.scene)), at } });
      /* an ability whose effects are the GM's to apply: the turn waits for Next step, Auto or not (the look before the next action then sees what changed) */
      if (result === "gm" && request(combat, requestId).state !== "manual") { const end = i + 1 >= r.steps.length;
        if (!end) await addNote(combat, requestId, "Then press Next step.");
        return save(combat, requestId, { pos: i + 1, coverSettled: i + 1, state: end ? "done" : "ready", ...(end ? { gmEnded: true } : { gmWait: true }) }); }   /* gmWait: ticking Auto doesn't run past it (0.17.0 review) */
    }
    if (request(combat, requestId).state === "manual") return;
    if (i + 1 >= r.steps.length) { await save(combat, requestId, { pos: i + 1, coverSettled: i + 1, state: "done" }); return endAfter(combat, requestId); }
    if (!tok.getFlag(ID, "auto")) return save(combat, requestId, { pos: i + 1, coverSettled: i + 1, state: "ready" });   /* Next step */
    await save(combat, requestId, { pos: i + 1, coverSettled: i + 1 });
    await pauseBetween(combat, requestId);
  }
  if (request(combat, requestId).state !== "manual") { await save(combat, requestId, { state: "done" }); return endAfter(combat, requestId); }
}
/** What changed since the plan was made, or why the next step no longer works (`changes`, empty when it can go on), and the next step as it checks out now (`next`). */
async function lookAgain(combat, r, i, tok) {
  if (!r.seen || !tok.object) return { changes: [] };   /* a request from before 0.4.0 has no baseline */
  const changes = changesSince(r.seen, situationNow(combat, tok, r.labels));
  if (changes.length) return { changes };
  const left = (r.plan?.steps ?? []).slice(i), rest = checkPlan({ steps: left }, await gather(combat, r, spentBy(r.steps.slice(0, i)), { moves: hasMove(left), spells: hasSpell(left), before: i > 0 ? { step: r.steps[i - 1], rec: r.log?.[i - 1] ?? {} } : null }));
  return rest.ok ? { changes: [], next: rest.steps[0] } : { changes: [{ who: "plan", what: "illegal", reason: rest.reason }] };
}
/** Drop the rest of the plan and ask again, for the same turn: a new request with a fresh packet, what's done so far, and why. The old one ends there. */
async function replan(combat, r, i, changes, tok, { counted = true } = {}) {
  /* counted: false for the re-ask after a Seek, which is part of the plan, not something that went wrong, so it doesn't use up MAX_REPLANS */
  const used = spentBy(r.steps.slice(0, i)), spent = (r.spent ?? 0) + used.actions, attacks = (r.attacks ?? 0) + used.attacks, replans = (r.replans ?? 0) + (counted ? 1 : 0);
  const done = [...(r.done ?? []), ...r.steps.slice(0, i).map((s, k) => doneStep(s, r.log?.[k]))], why = describeChanges(changes), at = `requests.${r.id}`;
  /* with no actions left the turn ends, unless an Improved Grab or the like can still follow the Strike that just hit (a free action) */
  const freeNext = () => { const l = lastAction({ done: done.at(-1) ?? null, strikes: strikesWithIds(tok.actor).map(({ id, strike: a }) => ({ id, effects: [...(a.item?.system?.attackEffects?.value ?? [])] })) });
    return l?.do === "strike" && l.hit === true && abilityList(tok.actor).some(a => a.followUp && a.kind === "free" && l.effects.includes(a.effect)); };
  if (actionsOf(tok.actor, combat) - spent <= 0 && !freeNext()) { await saveTurns(combat, { [`${at}.state`]: "done", [`${at}.since`]: clock(), [`${at}.pos`]: i, [`${at}.why`]: changes, [`${at}.note`]: [r.note, `${why} No actions left, so the turn ends here.`].filter(Boolean).join(" ") }); return endAfter(combat, r.id); }   /* keep a note from its steps (out of hiding, 0 HP) */
  if (replans > MAX_REPLANS) return saveTurns(combat, { [`${at}.state`]: "done", [`${at}.pos`]: i, [`${at}.why`]: changes, [`${at}.note`]: [r.note, `${why} That would be re-plan ${replans} this turn, so play the rest yourself.`].filter(Boolean).join(" ") });
  let built; try { built = await buildPacket(combat, tok, { spent, attacks, done, note: `Asked again mid-turn: ${why}` }); }
  catch (e) { console.error(`${ID} | packet`, e); return save(combat, r.id, { state: "stopped", note: `Something changed (${why}) and I couldn't work out what ${tok.name} perceives now (${e.message}). Play the rest yourself.` }); }
  const id = foundry.utils.randomID(8);
  await saveTurns(combat, { [`${at}.state`]: "done", [`${at}.pos`]: i, [`${at}.replanned`]: id,
    [`requests.${id}`]: { state: "requested", combatantId: r.combatantId, tokenId: r.tokenId, round: r.round, turn: r.turn, at: Date.now(), since: clock(), log: {}, labels: built.labels, packet: built.packet, seen: situationNow(combat, tok, built.labels, built.others), note: null, tries: 0, pos: 0, spent, attacks, done, replans, why: changes, parent: r.id },
    ...eventChange("replan", id, 0), ...packetExtras(combat, tok, built) });
}
/* ---------- fleeing off the map (Rhea, 2026-11-08) ---------- */
const SURVEY = "lythara-survey-sheet", EXTEND_SQUARES = 10, EXTEND_MAX = 120, EXTEND_MS = 180000, EXTEND_LATE = "The map took too long to extend.";
/** The map's size in squares as the scene stands now. */
const mapSquares = scene => [Math.round(scene.dimensions.sceneWidth / scene.grid.size), Math.round(scene.dimensions.sceneHeight / scene.grid.size)];
const surveyApi = () => game.modules.get(SURVEY)?.active ? game.modules.get(SURVEY).api ?? null : null;
/** Why the map can't be extended that way, or null. The Survey Sheet grows an encounter map by EXTEND_SQUARES squares and stops at EXTEND_MAX a side. */
export function extendProblem(scene, side) {
  if (!SIDES.includes(side)) return "Pick an edge: north, east, south or west.";
  if (!surveyApi()?.extendEncounter) return "Lythara Survey Sheet isn't on, so the map can't be extended.";
  if (!scene?.getFlag(SURVEY, "encounter")) return "This scene isn't an encounter map, so it can't be extended.";
  const [cols, rows] = mapSquares(scene), horiz = side === "east" || side === "west";
  if ((horiz ? cols : rows) + EXTEND_SQUARES > EXTEND_MAX) return `The map is at its limit (${EXTEND_MAX} squares a side) that way.`;
  return null;
}
/** The XP the party would have earned for this monster: PF2e's own calculation for one creature of its level against the party's level and size. null when it can't be worked out. */
export function escapeXP(tok) {
  try { const level = tok.actor?.level; if (!Number.isFinite(level)) return null; return game.pf2e.gm.calculateXP(suggestedLevel(), partySize(), [level], [], {}).totalXP ?? null; } catch { return null; }
}
const escapedOf = combat => turns(combat).escaped ?? {};   /* keyed by the request that fled, so a monster that escapes twice keeps both records */
const escapeRecord = (combat, tokenId) => Object.entries(escapedOf(combat)).filter(([, e]) => e?.tokenId === tokenId && !e.returned).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))[0] ?? null;
/** Let it get away (Rhea, 2026-11-08): the monster leaves the fight. Its token stays on the scene, hidden and flagged, HP and conditions kept; nothing is
    deleted but its combatant. The threat stays as built; the XP not earned is noted on the card and in the history. No chat message. Any GM may press it. */
export async function letGo(combat, requestId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (r?.state !== "fled") throw new Error("That monster isn't at the map's edge.");
  const tok = combat.scene?.tokens.get(r.tokenId), combatant = combat.combatants.get(r.combatantId); if (!tok) throw new Error("Its token is gone.");
  if (escapedOf(combat)[requestId]) throw new Error("Already done.");   /* two GMs pressing together: the record is written first, so the second press stops here */
  const xp = escapeXP(tok), name = tok.name, at = Date.now(), xpWords = xp != null ? ` (${xp} XP not earned)` : "";
  await saveTurns(combat, { [`escaped.${requestId}`]: whole({ tokenId: tok.id, name, xp, round: combat.round, at, combatantId: r.combatantId }) });
  await save(combat, requestId, { state: "done", extend: null, escaped: { name, xp, at }, note: [r.note, `${name} got away${xpWords}.`].filter(Boolean).join(" ") });
  await tok.update({ hidden: true, [`flags.${ID}.escaped`]: { round: combat.round, at, xp, combat: combat.id } });
  /* deleting the current combatant is enough: core's Combatant._preDeleteOperation hands the turn to the next survivor with turn events
     (14.370). Calling nextTurn first and then deleting skipped the next creature's turn (seen live 2026-11-08: round 1 → 2, Test Hero's turn lost). */
  if (combatant) await combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
  return { name, xp };
}
/** Extend map (Rhea, 2026-11-08): the GM's press asks the runner, which grows the map and then asks the thinker again from a fresh packet; the monster keeps its turn. */
export async function extendMap(combat, requestId, side) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const r = request(combat, requestId); if (r?.state !== "fled") throw new Error("That monster isn't at the map's edge.");
  if (!(r.fled?.sides ?? []).includes(side)) throw new Error(`It isn't at the ${side} edge.`);
  const why = extendProblem(combat.scene, side); if (why) throw new Error(why);
  return save(combat, requestId, { extend: side });
}
async function runExtend(combat, requestId) {
  if (!isRunner()) return; if (running.has(requestId)) return;
  running.add(requestId);
  try {
    const r = request(combat, requestId), side = r?.extend;
    if (r?.state !== "fled" || !side) { if (r?.extend) await save(combat, requestId, { extend: null }); return; }   /* the state changed under the press (Play it myself): drop it */
    const tok = combat.scene.tokens.get(r.tokenId); if (!tok) return save(combat, requestId, { state: "stopped", extend: null, note: "Its token is gone." });
    await save(combat, requestId, { state: "extending", extend: null, extending: side });
    const history = tok.movementHistory?.length ?? 0; let shifted = null;
    try {
      const why = extendProblem(combat.scene, side); if (why) throw new Error(why);
      /* the Survey Sheet keeps drawing after a timeout, so a timeout never offers the buttons again (a second press would grow the map twice): it carries on as if it finished */
      try { shifted = (await within(surveyApi().extendEncounter(combat.scene, side, EXTEND_SQUARES), EXTEND_MS, EXTEND_LATE))?.shifted ?? null; }
      catch (e) { if (e.message !== EXTEND_LATE) throw e; console.warn(`${ID} | extend`, e.message); }
      /* the redraw: every client rebuilds its canvas; the packet needs this page's canvas back on the fight scene with the token drawn */
      for (let t = 0; t < EXTEND_MS && !(await ensureScene(combat) && tok.object && !tok.object.destroyed); t += 500) await sleep(500);
      await sleep(SETTLE_MS);
    } catch (e) { console.error(`${ID} | extend`, e); return save(combat, requestId, { state: "fled", extending: null, note: `The map couldn't be extended (${e.message}).` }); }
    await afterExtend(combat, requestId, side, tok, { shifted: shifted ?? shiftFor(side), history });
  } finally { running.delete(requestId); }
}
/** The pixel shift an extension on that side gives everything on the map (the Survey Sheet grows north and west by moving the content). */
const shiftFor = side => [side === "west" ? EXTEND_SQUARES * 100 : 0, side === "north" ? EXTEND_SQUARES * 100 : 0];
/** The map has grown: the monster keeps its turn and the thinker is asked again from a fresh packet (not counted as a re-plan). The request stays
    `extending` (busy, no buttons) until `replan` closes it, so a Let it get away can't slip in between. Squares this module remembers (where a
    monster last saw someone) move with the content; the token's movement history is cleared if the shift was recorded as movement, so the next
    Stride isn't charged for it. */
async function afterExtend(combat, requestId, side, tok, { shifted = shiftFor(side), history = 0 } = {}) {
  const scene = combat.scene, g = scene.grid.size, dx = Math.round((shifted?.[0] ?? 0) / g), dy = Math.round((shifted?.[1] ?? 0) / g), change = { [`requests.${requestId}.extended`]: side, [`requests.${requestId}.extending`]: null };
  if (dx || dy) for (const [who, mem] of Object.entries(turns(combat).memory ?? {})) for (const [id, m] of Object.entries(mem ?? {})) if (Array.isArray(m?.square)) change[`memory.${who}.${id}.square`] = [m.square[0] + dx, m.square[1] + dy];
  await saveTurns(combat, change);
  if ((tok.movementHistory?.length ?? 0) > history && tok.clearMovementHistory) await tok.clearMovementHistory();
  const r = request(combat, requestId);
  await replan(combat, { ...r, id: requestId }, r.pos ?? r.steps.length, [{ who: "me", what: "extended", side }], tok, { counted: false });
}
/** Escaped monsters still on this fight's scene: their hidden, flagged tokens, newest first. */
export function escapedList(combat) {
  const scene = combat?.scene; if (!scene) return [];
  return scene.tokens.contents.filter(t => t.getFlag(ID, "escaped")?.combat === combat.id && !combat.combatants.some(c => c.tokenId === t.id)).map(t => { const e = t.getFlag(ID, "escaped"), rec = escapeRecord(combat, t.id)?.[1]; return { id: t.id, name: t.name, round: e.round, xp: e.xp ?? rec?.xp ?? null, at: e.at }; }).sort((a, b) => b.at - a.at);
}
/** Bring back (Rhea, 2026-11-08): the token is shown again, joins the fight where it stands now (the GM may move it first) and rolls initiative as any monster joining a fight. The history keeps the escape line and adds a returned line. */
export async function bringBack(combat, tokenId) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const tok = combat.scene?.tokens.get(tokenId); if (!tok?.getFlag(ID, "escaped")) throw new Error("That monster hasn't escaped.");
  if (combat.combatants.some(c => c.tokenId === tok.id)) throw new Error("It is already in the fight.");
  await tok.update({ hidden: false, [`flags.${ID}.-=escaped`]: null });
  const [c] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: tok.id, actorId: tok.actorId, sceneId: combat.scene.id }]);
  if (c) await combat.rollInitiative([c.id], { skipDialog: true });   /* PF2e's roll dialog would wait for ever on a page nobody watches (seen live 2026-11-08) */
  const rec = escapeRecord(combat, tok.id); if (rec) await saveTurns(combat, { [`escaped.${rec[0]}.returned`]: { round: combat.round, at: Date.now() } });
  return { name: tok.name, initiative: c?.initiative ?? null };
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
/** A GM's press on the card (Do it, Next step, Hold, Play it myself, Roll it for them), for the history window. Keyed by time so two browsers never
    write over each other. Only real presses: Auto's own runs don't come here. */
/* ---------- the Change button (Rhea, 2026-11-09: "Note and step edits") ---------- */
/** A note to Angel from the card: the rest of the turn is planned again with the GM's words (names become labels on the runner). Any GM may call it;
    the runner carries it out. It never counts as one of the turn's re-plans: the GM asked. */
export async function askAngel(combat, requestId, note) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const why = changeProblem(request(combat, requestId)); if (why) throw new Error(why);
  const words = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX); if (!words) throw new Error("Write what you want Angel to do first.");
  await save(combat, requestId, { ask: whole({ text: words, user: game.user.name, at: Date.now() }), changeVerdict: null });
  if (isRunner()) await runChange(combat, requestId);
}
/** The GM's own edits from the card: `steps` is the plan from the current step on, written as the thinker writes steps (the card makes it with
    applyEdits). Checked on the runner by the same rules as any plan; refused, the old plan stays and the card says why. An empty list ends the plan. */
export async function changePlan(combat, requestId, steps) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  const why = changeProblem(request(combat, requestId)); if (why) throw new Error(why);
  if (!Array.isArray(steps) || JSON.stringify(steps).length > 8000) throw new Error("That isn't a list of steps.");
  await save(combat, requestId, { edit: whole({ steps, user: game.user.name, at: Date.now() }), changeVerdict: null });
  if (isRunner()) await runChange(combat, requestId);
}
/* one change at a time per request: the updateCombat hook and the GM's own call on the runner's page can both arrive here */
const changing = new Set();
async function runChange(combat, requestId) {
  if (!isRunner() || changing.has(requestId) || running.has(requestId)) return;
  changing.add(requestId);
  try {
    const r = request(combat, requestId); if (!r?.ask && !r?.edit) return;
    const what = r.ask ? "note" : "change", refuse = reason => save(combat, requestId, { ask: null, edit: null, changeVerdict: `Your ${what} wasn't used: ${reason}` });
    const why = changeProblem({ ...r, ask: null, edit: null }); if (why) return refuse(why);
    if (!await ensureScene(combat)) return refuse(cantOpen());
    const tok = combat.scene.tokens.get(r.tokenId); if (!tok) return refuse("its token is gone.");
    return r.ask ? await sendNote(combat, requestId, r, tok) : await useEdit(combat, requestId, r, tok, refuse);
  } finally { changing.delete(requestId); }
}
/** Who the GM's note can name, for noteForThinker: every token on the scene by its token and actor names, with its label when the monster perceives it
    (or knows it as an ally), its own label for itself, and null for anyone else (GM-hidden, unseen, not in the fight). */
function peopleFor(combat, r, tok) {
  const labels = turns(combat).labels ?? {}, known = new Set([...Object.keys(r.labels ?? {}), ...(r.packet?.allies ?? []).map(a => a?.label)].filter(Boolean)), me = r.packet?.you?.label ?? "it";
  return combat.scene.tokens.contents.map(t => ({ names: [t.name, t.actor?.name].filter(Boolean), label: t.id === tok.id ? me : known.has(labels[t.id]) ? labels[t.id] : null }));
}
async function sendNote(combat, requestId, r, tok) {
  const { text: words, unknown } = noteForThinker(r.ask.text, peopleFor(combat, r, tok));
  await save(combat, requestId, { ask: null });
  await replan(combat, { ...request(combat, requestId), id: requestId }, r.pos ?? 0, [{ who: "gm", what: "note", text: words, user: r.ask.user }], tok, { counted: false });
  const next = request(combat, requestId)?.replanned;
  if (next && unknown.length) await addNote(combat, next, `${listWords(unknown)} ${unknown.length === 1 ? "isn't someone" : "aren't creatures"} ${tok.name} perceives, so Angel was told "someone it doesn't perceive".`);
}
async function useEdit(combat, requestId, r, tok, refuse) {
  const i = r.pos ?? 0, steps = r.edit.steps ?? [], user = r.edit.user, before = r.steps.slice(i).map(s => describeStep(s)), at = Date.now();
  if (!steps.length) {   /* the rest taken out: the plan ends here, and ending the turn is the GM's (Auto doesn't end a turn the GM cut short) */
    await save(combat, requestId, { ask: null, edit: null, changeVerdict: null, state: "done", gmEnded: true, plan: whole({ ...(r.plan ?? {}), steps: (r.plan?.steps ?? []).slice(0, i) }), steps: r.steps.slice(0, i), edits: { [at]: { user, pos: i, before, after: [] } } });
    return addNote(combat, requestId, "You took out the rest of the plan: end the turn when you're ready.");
  }
  const clean = cleanPlan({ steps, reason: r.plan?.reason }); if (!clean.ok) return refuse(clean.reason);
  const left = clean.plan.steps, rest = checkPlan({ steps: left }, await gather(combat, r, spentBy(r.steps.slice(0, i)), { moves: hasMove(left), spells: hasSpell(left), before: i > 0 ? { step: r.steps[i - 1], rec: r.log?.[i - 1] ?? {} } : null }));
  if (!rest.ok) return refuse(rest.reason);
  await save(combat, requestId, { ask: null, edit: null, changeVerdict: null, verdict: null, plan: whole({ ...(r.plan ?? {}), steps: [...(r.plan?.steps ?? []).slice(0, i), ...left] }), steps: [...r.steps.slice(0, i), ...rest.steps], edits: { [at]: { user, pos: i, before, after: rest.steps.map(s => describeStep(s)) } } });
}
export const notePress = (combat, id, what, extra = {}) => save(combat, id, { presses: { [Date.now()]: { do: what, user: game.user.name, pos: request(combat, id)?.pos ?? 0, ...extra } } }).catch(e => console.warn(`${ID} | history`, e));

/** A party member's Angel and Auto ticks last one fight (Rhea: "always have the default be unticked"): cleared when the fight is deleted, on the runner
    only, so a ticked party member doesn't come up ticked in the next fight (0.18.0 review). */
export async function untickParty(combat) {
  if (!isRunner()) return;
  for (const c of combat.combatants) { const tok = c.token; if (!tok || !partyMember(tok.actor)) continue;
    for (const k of ["run", "auto"]) if (tok.getFlag(ID, k) != null) await tok.unsetFlag(ID, k).catch(e => console.warn(`${ID} | untick`, e)); }
}
