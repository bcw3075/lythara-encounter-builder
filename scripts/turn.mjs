/* A monster's turn as plain data: what a plan means, whether it's legal, and where a step stands. Pure: no Foundry globals.
   The glue gathers live values first. Strikes, Strides, Steps, Crawls, Stand, Drop Prone, Take Cover, abilities, spells, Hide, Sneak and Seek so far; the other step kinds come as step 2 goes on. */
import { distanceBetween, headingOf } from "./move.mjs";
import { placeable } from "./area.mjs";
/** What each step kind costs. An ability's cost is its own (0 for a free action); 1 here is only the fallback. */
export const COSTS = { strike: 1, stride: 1, step: 1, crawl: 1, stand: 1, "drop-prone": 1, "take-cover": 1, ability: 1, spell: 1, hide: 1, sneak: 1, seek: 1, none: 0 };
/** A basic save's damage by the target's degree of success, 0 critical failure to 3 critical success: double, full, half, none. Rules: Basic Saving Throws
    (https://2e.aonprd.com/Rules.aspx?ID=2297). */
export const SAVE_MULT = [2, 1, 0.5, 0];
/** Abilities that follow a Strike (Rhea, 2026-11-07: run for real). Each needs the monster's last action to be a successful Strike that lists it, and is an
    Athletics check that neither applies nor counts toward the multiple attack penalty. Rules: Grab, Knockdown, Push, Pull, and the Improved ones as free
    actions (https://2e.aonprd.com/MonsterAbilities.aspx: IDs 45, 46, 47, 71, 66). Grapple https://2e.aonprd.com/Actions.aspx?ID=2376, Trip ID 2382,
    Reposition ID 2379, Shove (Player Core). */
export const FOLLOW_UPS = { grab: "grapple", "improved-grab": "grapple", knockdown: "trip", "improved-knockdown": "trip", push: "shove", "improved-push": "shove", pull: "reposition", "improved-pull": "reposition" };
export const CHECK_WORD = { grapple: "Grapple", trip: "Trip", shove: "Shove", reposition: "Reposition" };
const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];
const MOVES = ["stride", "step", "crawl", "sneak"], ONE_SQUARE = ["step", "crawl"];
/** Steps that change only whether the monster is prone, and what they leave it. Rules: Prone (https://2e.aonprd.com/Conditions.aspx?ID=88). */
export const POSTURES = { stand: false, "drop-prone": true };
export const WORD = { stride: "Stride", step: "Step", crawl: "Crawl", sneak: "Sneak" };
/** A Step or a Crawl moves 5 ft; one that Foundry would charge more for (a diagonal after an odd number this turn) is refused. Rules: Step https://2e.aonprd.com/Actions.aspx?ID=2304; Crawl (Player Core): prone, Speed 10+, 5 ft, stays prone. */
export const STEP_FT = 5;
/** Hide, Sneak and Seek (Rhea, 2026-11-07): PF2e's own action posts its secret card, and the module presses Visioner's own buttons on it, so Visioner alone
    decides who the monster is hidden from or finds. Rules: Hide (https://2e.aonprd.com/Actions.aspx?ID=62), Sneak (ID 63), Seek (ID 2301). A Seek covers a
    15-ft burst at a grid corner within 30 ft, or a 30-ft cone from the monster (Angel's default, from the older printed rule; the remaster leaves it to
    the GM, about 30 ft or less). A Sneak moves up to half its Speed, as Visioner counts it: half, rounded down to 5 ft. */
export const SEEK = { burst: 15, cone: 30, range: 30 };
export const sneakSpeed = speed => Math.floor(Math.floor((Number(speed) || 0) / 2) / STEP_FT) * STEP_FT;
/** Actions that keep a hidden or undetected creature so (Rules: Hide, Sneak: anything other than Hide, Sneak or Step makes it observed). An attack keeps
    its off-guard for that attack and reveals it after; anything else reveals it just before (Rhea chose this, 2026-11-07). "none" does nothing at all. */
const KEEPS_HIDDEN = ["hide", "sneak", "step", "none"];
/** Whether a step is an attack: a Strike, or an ability or spell with the attack trait. */
export const isAttack = s => s?.do === "strike" || ((s?.do === "ability" || s?.do === "spell") && !!s.attack);
/** Whether the monster comes out of hiding just before this step (true) or just after it (an attack), or not at all. */
export const revealsBefore = s => !!s && !KEEPS_HIDDEN.includes(s.do) && !isAttack(s);
export const revealsAfter = s => isAttack(s);
const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
/** "A", "A and B", "A, B and C". */
export const listWords = (xs = []) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/** Check a plan against what the glue gathered. Returns { ok: true, steps } with each step resolved, or { ok: false, reason }.
    ctx: { actions (left this turn), attacksBefore (attacks already made this turn, for the multiple attack penalty), strikes: [{ id, name, reach, ranged, maxRange, shotsLeft (null: not counted), ammo (its name) }],
    targets: { label: { name, square, pos, span, size, elev, depth, flat } or { name, distance, flat } }, me: { square, pos, span, size, elev, depth } (pos and span: where the
    token really is and how wide, in squares, as PF2e measures it, fractional off the grid; distances use them, routes and occupancy the rounded square and
    size; a hidden target has no pos, so it is measured from the square the monster knows), speed (land), cantAct (why it can't act at all, or null),
    cantMove (why it can't use any move action, Stand included: grabbed, immobilized, restrained; or null), cantAttack (why it can't Strike, or null), prone (whether it starts the plan prone),
    route(from, to, before, { step, kind }) → { ok, route, cost } or { ok: false, reason }, before being the routes of this plan's earlier moves (the diagonal count
    runs across the turn), step asking for a single 5-ft square (a Step or a Crawl, named by kind) rather than a Stride }. Only what the monster perceives is in
    targets. A Stride, Step or Crawl moves where later steps are measured from; a Stand ends Prone for the rest of the plan and Drop Prone starts it.
    Take Cover (Rhea's rule B, 2026-11-07): tookCover (it is Taking Cover now), coverFrom ({ label: "standard" | "greater" }: the cover Visioner gives it now
    against each creature it sees, observed or concealed), nearCover(square, size) (a wall or a thick trunk in a square next to it). Names here are labels
    when the reason goes to the thinker.
    Abilities: abilities ([{ id, name, kind: "action" | "free" | "reaction" | "passive", cost, traits, usesLeft, followUp (a check from FOLLOW_UPS, or null),
    effect (the word a Strike's effects list for it) }]), strikes' `effects`, me.cat and each target's `cat` (size categories), `held` (it is grabbed or
    restrained), and last (its last action this turn before the plan, from `lastAction`; null at the start of a turn).
    Spells (2026-11-07): spells ([{ id, name, ranks: [{ rank, pool, left }] (pool null for a cantrip or an at-will spell; several spells can share a pool,
    such as a spontaneous caster's slots of one rank or the focus pool), minActions, maxActions (null: not castable on a turn, such as a reaction or one
    taking minutes), range (feet, or null for none or unlimited), touch, targets (how many creatures it targets; 0 for none or only itself), area
    ({ type, size } or null), attack (a spell attack roll), save ({ stat, basic } or null), damaging, traits, critText (its text lists what a critical
    success does) }]), allies ({ label: { name, square, size, elev, depth } }: its allies and itself, which a spell may target), saveRows (Toolbelt's Target
    Helper is on, so a save can be rolled from its rows) and reach (its longest melee reach, for touch spells).
    Hide, Sneak, Seek (2026-11-07): lightAt(square) ("bright" | "dim" | "dark" at a square), concealed (it has the concealed condition); Hide uses
    coverFrom too. A Sneak goes like a Stride at half Speed; a Seek must be the plan's last step (it is asked again after, with what it found). */
export function checkPlan(plan, ctx) {
  if (!plan || !Array.isArray(plan.steps)) return { ok: false, reason: "The plan has no steps." };
  let left = ctx.actions, attacks = ctx.attacksBefore ?? 0, here = ctx.me?.square ?? null, herePos = ctx.me?.pos ?? here, prone = !!ctx.prone, took = !!ctx.tookCover, tookProne = false, moved = false, sought = false, last = ctx.last ?? null; const steps = [], routes = [], uses = {}, pools = {}, shots = {};
  /* distances from where each creature really stands (pos, fractional off the grid), as PF2e and the packet measure them; after a move, from the square it moved to */
  const distanceTo = (t, reach) => { const p = t.pos ?? t.square; return herePos && p ? distanceBetween({ x: herePos[0], y: herePos[1], size: ctx.me.span ?? ctx.me.size ?? 1, elev: ctx.me.elev, depth: ctx.me.depth }, { x: p[0], y: p[1], size: t.pos ? t.span ?? t.size ?? 1 : t.size ?? 1, elev: t.elev, depth: t.depth }, { reach }) : t.distance; };
  for (const [n, step] of plan.steps.entries()) {
    const at = `Step ${n + 1}`;
    if (!(step.do in COSTS)) return { ok: false, reason: `${at}: I can't do "${step.do}" yet.` };
    if (sought) return { ok: false, reason: `${at}: a Seek has to be the plan's last step. You are asked again after it, with what it found.` };
    if (step.do === "spell") {
      if (ctx.cantAct) return { ok: false, reason: `${at}: ${ctx.cantAct}` };
      const sp = (ctx.spells ?? []).find(s => s.id === step.item);
      if (!sp) return { ok: false, reason: `${at}: it has no spell called "${step.item}" it can cast now${(ctx.abilities ?? []).some(a => a.id === step.item) ? ` (${step.item} is an ability: use an "ability" step)` : ""}.` };
      const r = checkSpell(step, sp, { ctx, at, attacks, distanceTo, pools, here });
      if (!r.ok) return r;
      if (r.step.actions > left) return { ok: false, reason: `${at}: no actions left${r.step.actions > 1 ? ` (${sp.name} takes ${r.step.actions})` : ""}.` };
      left -= r.step.actions; if (r.pool) pools[r.pool] = (r.pool in pools ? pools[r.pool] : r.poolLeft) - (r.poolCost ?? 1);
      steps.push(r.step);
      if (r.step.mapCounts) attacks++;
      if (r.step.attack) took = tookProne = false;
      last = { do: "spell", item: sp.id, target: r.step.target ?? null };
      continue;
    }
    const ab = step.do === "ability" ? (ctx.abilities ?? []).find(a => a.id === step.item) : null;
    if (step.do === "ability") {
      if (!ab) return { ok: false, reason: `${at}: it has no ability called "${step.item}"${ctx.strikes?.some(s => s.id === step.item) ? ` (${step.item} is a Strike: use a "strike" step)` : ""}.` };
      if (ab.kind === "passive") return { ok: false, reason: `${at}: ${ab.name} is passive: it is always on, not something to do.` };
      if (ab.kind === "reaction") return { ok: false, reason: `${at}: ${ab.name} is a reaction, used when its trigger happens, not planned on its own turn.` };
    }
    if (ab) {
      if (ctx.cantAct) return { ok: false, reason: `${at}: ${ctx.cantAct}` };
      const r = checkAbility(step, { ...ab, usesLeft: ab.id in uses ? uses[ab.id] : ab.usesLeft }, { ctx, last, at, attacks, distanceTo });
      if (!r.ok) return r;
      /* Grab's hold takes an action even for Improved Grab (Monster Core: it still needs an action to extend the duration) */
      const cost = r.step.mode === "hold" ? 1 : abilityCost(ab);
      if (cost > left) return { ok: false, reason: `${at}: no actions left${cost > 1 ? ` (${ab.name} takes ${cost})` : ""}.` };
      left -= cost; if (ab.usesLeft != null) uses[ab.id] = (ab.id in uses ? uses[ab.id] : ab.usesLeft) - 1;
      steps.push({ ...r.step, actions: cost });
      if (r.step.mapCounts) attacks++;
      if (r.step.attack) took = tookProne = false;
      last = { do: "ability", item: ab.id, target: r.step.target ?? null };   /* a free action is an action too: a second follow-up can't come after it */
      continue;
    }
    if (COSTS[step.do] > left) return { ok: false, reason: `${at}: no actions left.` };
    left -= COSTS[step.do];
    if (step.do === "none") { steps.push({ do: "none" }); last = { do: "none" }; continue; }
    if (ctx.cantAct) return { ok: false, reason: `${at}: ${ctx.cantAct}` };
    if (step.do in POSTURES) {
      if (ctx.cantMove) return { ok: false, reason: `${at}: ${ctx.cantMove}` };
      if (step.do === "stand" && !prone) return { ok: false, reason: `${at}: it isn't prone, so it has nothing to Stand up from.` };
      if (step.do === "drop-prone" && prone) return { ok: false, reason: `${at}: it is already prone.` };
      if (step.do === "drop-prone" && (ctx.me?.elev ?? 0) > 0) return { ok: false, reason: `${at}: it is ${Math.round(ctx.me.elev)} ft up, and a creature knocked or dropping prone in the air falls instead.` };
      /* a Take Cover taken while prone gives its greater cover against ranged attacks only while prone, so Standing ends it (Visioner removes its effect) */
      if (step.do === "stand" && tookProne) took = tookProne = false;
      steps.push({ do: step.do }); prone = POSTURES[step.do]; last = { do: step.do }; continue;
    }
    if (step.do === "take-cover") {
      /* Rules: Take Cover (Player Core, https://2e.aonprd.com/Actions.aspx?ID=2307): standard cover, near a feature that allows it, or prone. It lasts until the
         creature moves from its space or makes an attack, so a Stride or a Strike earlier in the plan ends one already taken. */
      if (took) return { ok: false, reason: `${at}: it is already Taking Cover.` };
      const from = moved ? null : Object.entries(ctx.coverFrom ?? {}).find(([, l]) => l === "standard" || l === "greater")?.[0] ?? null;
      const why = prone ? "prone" : here && ctx.nearCover?.(here, ctx.me?.size ?? 1) ? "near" : from ? "cover" : null;
      if (!why) return { ok: false, reason: `${at}: Take Cover needs it to be prone, next to a wall or a trunk thick enough to hide behind, or behind standard cover from a creature it sees${moved ? ` (after a move in the same plan only a wall or trunk next to its new square counts, because cover from a square it isn't on yet can't be read)` : ""}.` };
      steps.push({ do: "take-cover", why, ...(why === "cover" ? { from } : {}) }); took = true; tookProne = why === "prone"; last = { do: "take-cover" }; continue;
    }
    if (step.do === "hide") {
      /* Rules: Hide needs cover, greater cover or concealment from the creatures it hides from. Visioner checks each creature when it applies the result; this
         only turns down a Hide with nothing at all to hide behind, from what the monster knows: standard cover from a creature it sees, Taking Cover, its
         own concealment, or dim light or darkness where it stands. Cover from a square it isn't on yet can't be read, so after a move only a wall or a thick
         trunk next to it, or the light there, counts. */
      const light = herePos && ctx.lightAt ? ctx.lightAt(herePos) : "bright", size = ctx.me?.size ?? 1;
      const from = moved ? [] : Object.entries(ctx.coverFrom ?? {}).filter(([, l]) => l === "standard" || l === "greater").map(([k]) => k);
      const why = from.length ? "cover" : took ? "taking-cover" : ctx.concealed ? "concealed" : light !== "bright" ? light : moved && here && ctx.nearCover?.(here, size) ? "near" : null;
      if (!why) return { ok: false, reason: `${at}: Hide needs cover or concealment: standard cover from a creature it sees, Taking Cover, being concealed, or dim light or darkness where it stands (it's bright there)${moved ? `; after a move in the same plan only a wall or trunk next to its new square, or the light there, counts` : ""}.` };
      steps.push({ do: "hide", why, ...(why === "cover" ? { from } : {}) }); last = { do: "hide" }; continue;
    }
    if (step.do === "seek") {
      if (!here) return { ok: false, reason: `${at}: I can't tell where it stands.` };
      if ((step.at == null) === (step.toward == null)) return { ok: false, reason: `${at}: a Seek needs either "at": [x, y], a grid corner for a ${SEEK.burst}-foot burst within ${SEEK.range} ft, or "toward": [x, y], a square for a ${SEEK.cone}-foot cone from the monster.` };
      const key = step.at != null ? "at" : "toward", pt = step[key];
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(Number.isInteger)) return { ok: false, reason: `${at}: "${key}" must be [x, y], two whole numbers.` };
      const n = ctx.me?.size ?? 1;
      let aim;
      if (key === "at") {   /* the nearest of the four squares round the corner */
        const d = Math.min(...[[pt[0] - 1, pt[1] - 1], [pt[0], pt[1] - 1], [pt[0] - 1, pt[1]], [pt[0], pt[1]]].map(q => distanceTo({ square: q, size: 1 }, null)));
        if (d > SEEK.range) return { ok: false, reason: `${at}: the corner [${pt[0]}, ${pt[1]}] is ${d} ft away, and a Seek's ${SEEK.burst}-foot burst goes within ${SEEK.range} ft.` };
        aim = { type: "burst", corner: [...pt], size: SEEK.burst };
      } else {
        if (pt[0] >= here[0] && pt[0] < here[0] + n && pt[1] >= here[1] && pt[1] < here[1] + n) return { ok: false, reason: `${at}: a Seek's cone points away from the monster, so name a square outside its own space.` };
        aim = { type: "cone", toward: [...pt], size: SEEK.cone };
      }
      steps.push({ do: "seek", aim }); sought = true; last = { do: "seek" }; continue;
    }
    if (MOVES.includes(step.do)) {
      const word = WORD[step.do], small = ONE_SQUARE.includes(step.do);
      if (ctx.cantMove) return { ok: false, reason: `${at}: ${ctx.cantMove}` };
      if (step.do === "crawl" && !prone) return { ok: false, reason: `${at}: it isn't prone; Crawl is how a prone creature moves, so Stride or Step instead.` };
      if (step.do !== "crawl" && prone) return { ok: false, reason: `${at}: it is prone, so it has to Stand first (a "stand" step, 1 action) before it can ${word}, or Crawl 5 ft.` };
      if (!(ctx.speed > 0)) return { ok: false, reason: `${at}: it has no land Speed.` };
      const limit = step.do === "sneak" ? sneakSpeed(ctx.speed) : ctx.speed;
      if (!(limit > 0)) return { ok: false, reason: `${at}: a Sneak moves at half Speed, and half of ${ctx.speed} ft is less than a square.` };
      if (small && ctx.speed < 2 * STEP_FT) return { ok: false, reason: `${at}: a ${word} needs a Speed of at least ${2 * STEP_FT} ft, and its Speed is ${ctx.speed} ft.` };
      if (!Array.isArray(step.to)) return { ok: false, reason: `${at}: a ${word} needs "to", the square to end on.` };
      if (!here || !ctx.route) return { ok: false, reason: `${at}: I can't work out moves here.` };
      if (same(here, step.to)) return { ok: false, reason: `${at}: it is already at [${step.to[0]}, ${step.to[1]}].` };
      const way = ctx.route(here, step.to, routes, { step: small, kind: step.do });
      if (!way.ok) return { ok: false, reason: `${at}: ${way.reason}` };
      if (small && way.cost > STEP_FT) return { ok: false, reason: `${at}: ${step.do === "crawl" ? "crawling" : "stepping"} to [${step.to[0]}, ${step.to[1]}] counts as ${way.cost} ft, and a ${word} moves only ${STEP_FT} ft${way.route?.length === 2 && way.route[0][0] !== way.route[1][0] && way.route[0][1] !== way.route[1][1] ? " (every second diagonal in a turn counts 10 ft)" : ""}.` };
      if (way.cost > limit) return { ok: false, reason: step.do === "sneak" ? `${at}: getting to [${step.to[0]}, ${step.to[1]}] takes ${way.cost} ft, and a Sneak moves at most half its Speed (${limit} ft).` : `${at}: getting to [${step.to[0]}, ${step.to[1]}] takes ${way.cost} ft, more than its Speed of ${ctx.speed} ft.` };
      steps.push({ do: step.do, from: [...here], to: [...step.to], route: way.route, cost: way.cost }); routes.push(way.route);
      here = [...step.to]; herePos = here; moved = true; took = tookProne = false; last = { do: step.do }; continue;
    }
    if (ctx.cantAttack) return { ok: false, reason: `${at}: ${ctx.cantAttack}` };
    const s = ctx.strikes.find(x => x.id === step.item); if (!s) return { ok: false, reason: `${at}: it has no attack called "${step.item}".` };
    const t = ctx.targets[step.target]; if (!t) return { ok: false, reason: `${at}: it doesn't know of "${step.target}".` };
    const where = steps.some(x => MOVES.includes(x.do)) ? ` from [${here[0]}, ${here[1]}]` : "";
    /* ammunition: shotsLeft is what the shot's own checks will let through (fight.mjs's ammoOf), counted through the plan */
    if (s.shotsLeft != null) { const n = (shots[s.id] ?? 0) + 1; if (n > s.shotsLeft) return { ok: false, reason: `${at}: it has ${s.shotsLeft ? `only ${s.shotsLeft} shot${s.shotsLeft === 1 ? "" : "s"}` : "no shots"} left with ${s.name} (${s.ammo ?? "ammunition"}).` }; shots[s.id] = n; }
    if (s.ranged) { const d = distanceTo(t, null); if (s.maxRange && d > s.maxRange) return { ok: false, reason: `${at}: ${t.name} is ${d} ft away${where}, out of range of ${s.name} (${s.maxRange} ft).` }; }
    else { const d = distanceTo(t, s.reach); if (d > s.reach) return { ok: false, reason: `${at}: ${t.name} is ${d} ft away${where}, out of reach of ${s.name} (${s.reach} ft).` }; }
    steps.push({ do: "strike", item: s.id, itemName: s.name, target: step.target, targetName: t.name ?? step.target, variant: Math.min(attacks, 2), flat: t.flat ?? 0 });
    attacks++; took = tookProne = false; last = { do: "strike", item: s.id, target: step.target, effects: s.effects ?? [], reach: s.reach, ranged: !!s.ranged, hit: null };
  }
  return { ok: true, steps };
}
/** One spell step, checked. Rhea, 2026-11-07: a spell attack at one creature and a save spell at one creature run for real (the module casts, rolls the
    attack or waits for the save, and applies the damage); anything else (an area, a spell with no attack or save, more than damage) is "card": the
    module casts it, its card goes to chat and the GM applies it. Rules: Cast a Spell (https://2e.aonprd.com/Actions.aspx?ID=2287), spell attacks and
    the multiple attack penalty (Player Core: a spell with the attack trait counts toward it), Restrained (no attack or manipulate actions). */
function checkSpell(step, sp, { ctx, at, attacks, distanceTo, pools, here }) {
  const no = reason => ({ ok: false, reason: `${at}: ${reason}` }), traits = sp.traits ?? [];
  if (ctx.cantAttack && traits.includes("attack")) return no(ctx.cantAttack);
  if (ctx.cantAttack && traits.includes("manipulate")) return no(`it is restrained, so it can't cast ${sp.name} (it has the manipulate trait).`);
  if (sp.minActions == null || sp.maxActions == null) return no(`${sp.name} isn't cast as part of a turn (it's a reaction, or takes longer than a turn).`);
  let actions = sp.minActions;
  if (sp.minActions !== sp.maxActions) {
    if (step.actions == null) return no(`${sp.name} can be cast with ${sp.minActions} to ${sp.maxActions} actions: say how many with "actions".`);
    if (step.actions < sp.minActions || step.actions > sp.maxActions) return no(`${sp.name} takes ${sp.minActions} to ${sp.maxActions} actions, not ${step.actions}.`);
    actions = step.actions;
  } else if (step.actions != null && step.actions !== sp.minActions) return no(`${sp.name} always takes ${sp.minActions} action${sp.minActions === 1 ? "" : "s"}.`);
  /* the rank: the one asked for, or the lowest it still has a use or slot for */
  const leftIn = r => r.pool == null ? Infinity : r.pool in pools ? pools[r.pool] : r.left, enough = r => leftIn(r) >= (r.cost ?? 1);   /* a focus spell can cost more than 1 point */
  const ranks = sp.ranks ?? [], open = ranks.filter(enough), list = ranks.map(r => r.rank).join(", ");
  const at_ = step.rank != null ? ranks.find(r => r.rank === step.rank) : open[0] ?? ranks[0];
  if (step.rank != null && !at_) return no(`it can't cast ${sp.name} at rank ${step.rank} (it can at ${list || "no rank"}).`);
  if (!at_ || !enough(at_)) return no(`${sp.name} has no ${step.rank != null ? `rank ${step.rank} ` : ""}uses or slots left${at_?.pool === "focus" ? ` (it costs ${at_.cost} focus point${at_.cost === 1 ? "" : "s"})` : ""}.`);
  /* the target: a creature it perceives, or one of its allies or itself */
  let t = null, tLabel = null;
  if (step.target) {
    if (!sp.targets && !sp.area) return no(`${sp.name} doesn't target a creature, so leave "target" out.`);
    t = ctx.targets?.[step.target] ?? ctx.allies?.[step.target] ?? null; if (!t) return no(`it doesn't know of "${step.target}".`);
    tLabel = step.target;
  } else if (sp.targets && !sp.area) return no(`${sp.name} needs a target: give "target", a label.`);
  if (t && (sp.range != null || sp.touch) && !sp.area && !sp.variants) {
    const reach = sp.touch ? Math.max(5, ctx.reach ?? 5) : sp.range, d = distanceTo(t, sp.touch ? reach : null);
    if (d > reach) return no(`${t.name ?? tLabel} is ${d} ft away, out of ${sp.touch ? "reach for" : "range of"} ${sp.name} (${reach} ft).`);
  }
  /* an area the module places (Rhea, 2026-11-07): aimed by "at" (a burst's corner) or "toward" (a cone's or line's square), or at the named creature; it may
     not catch an ally or the monster itself unless the plan says "deliberate" */
  let area = null;
  if (sp.area && placeable(sp.area) && ctx.areaOf && here) {
    const r = ctx.areaOf(sp, { at: step.at, toward: step.toward }, { square: here, size: ctx.me?.size ?? 1 }, t ? { square: t.square, size: t.size ?? 1 } : null);
    if (!r.ok) return no(`${sp.name}: ${r.reason}`);
    if (r.aim.type === "burst") {   /* a corner of a square within range: the nearest of the four squares round it; touch by its reach; no range: a corner of its own space */
      const c = r.aim.corner, n = ctx.me?.size ?? 1, range = sp.touch ? Math.max(5, ctx.reach ?? 5) : sp.range;
      if (range == null) { if (!(c[0] >= here[0] && c[0] <= here[0] + n && c[1] >= here[1] && c[1] <= here[1] + n)) return no(`${sp.name} has no range, so its burst starts at a corner of the monster's own space.`); }
      else { const d = Math.min(...[[c[0] - 1, c[1] - 1], [c[0], c[1] - 1], [c[0] - 1, c[1]], [c[0], c[1]]].map(q => distanceTo({ square: q, size: 1 }, null))); if (d > range) return no(`the corner [${c[0]}, ${c[1]}] is ${d} ft away, beyond ${sp.name}'s range (${range} ft).`); }
    }
    if (r.allies.length && !step.deliberate) return no(`${sp.name} there would also catch ${listWords(r.allies.map(l => l === r.self ? "itself" : l))}. Aim it elsewhere, or add "deliberate": true if it means to.`);
    area = { type: r.aim.type, size: r.aim.size, aim: r.aim, catches: r.known, hits: r.ids, ...(step.deliberate ? { deliberate: true } : {}) };
  } else if (t && sp.area && sp.range != null) { const d = distanceTo(t, null); if (d > sp.range) return no(`${t.name ?? tLabel} is ${d} ft away, beyond ${sp.name}'s range (${sp.range} ft).`); }
  /* run for real only at one creature it perceives, and never a spell whose range, targets or damage change with its actions (Heal, Harm: PF2e's
     variants, whose base item reads as a basic save at touch), nor at an ally: those are the GM's from the card */
  const one = !sp.area && !sp.variants && (sp.targets ?? 0) === 1 && !!t && !t.ally;
  /* a basic save area that deals damage runs for real (Rhea, 2026-11-07): everyone in it saves and takes damage by their own degree */
  const mode = one && sp.attack ? "attack" : one && sp.save && ctx.saveRows ? "save" : area && !sp.variants && !sp.attack && sp.save?.basic && sp.damaging && ctx.saveRows ? "area" : "card";
  const isAttack = traits.includes("attack");
  const out = { do: "spell", item: sp.id, itemName: sp.name, ...(sp.entryId ? { entryId: sp.entryId, spellId: sp.spellId } : {}), rank: at_.rank, actions, mode, ...(t ? { target: tLabel, targetName: t.name ?? tLabel, flat: sp.area ? 0 : t.flat ?? 0 } : {}),
    ...(isAttack ? { attack: true, mapCounts: true, variant: Math.min(attacks, 2) } : {}), ...(area ? { area, ...(sp.lasting ? { lasting: true } : {}) } : sp.area ? { area: { ...sp.area } } : {}),
    ...(mode === "save" || mode === "area" ? { save: sp.save.stat, basic: !!sp.save.basic } : {}), damaging: !!sp.damaging, ...(sp.critText ? { critText: true } : {}) };
  return { ok: true, step: out, pool: at_.pool, poolLeft: at_.left, poolCost: at_.cost ?? 1 };
}
/** What to do next with a spell step, from its record. Never repeated: when the record can't tell whether a stage finished, "ask". The spell is cast first
    (its slot or use is spent and its card posted), then a flat check for a concealed or hidden target, then by mode: "attack" rolls the spell attack and,
    for a damaging spell that hits, its damage; "save" waits for the target's save ("wait") and, for a basic save, rolls the damage and applies it by
    degree; "card" (after a flat check at a creature it can't see clearly), and anything a non-damaging or non-basic spell does, is the GM's ("gm"). */
export function nextSpell(rec = {}, { mode = "card", flat = 0, apply = false, damaging = false, basic = false } = {}) {
  if (!rec.castStarted) return "cast";
  if (!rec.cast) return "ask";
  if (rec.noRows) return "gm";
  if (flat) { if (!rec.flatStarted) return "flat"; if (!rec.flat) return "ask"; if (!rec.flat.ok) return "next"; }   /* a concealed or hidden target, card mode too: a failure means it isn't affected */
  if (mode === "card") return "gm";
  if (mode === "attack") {
    if (!rec.started) return "attack";
    if (!rec.attack) return "ask";
    if (rec.attack.degree < 2) return "next";
    if (!damaging) return "gm";
  } else {
    if (!rec.save) return "save";
    if (!damaging || !basic) return "gm";
    if (SAVE_MULT[rec.save.degree] === 0) return "next";
  }
  if (!rec.damageStarted) return "damage";
  if (!rec.damage) return "ask";
  if (!apply && !rec.applying) return "next";
  if (!rec.applying) return "apply";
  return rec.applied ? "next" : "ask";
}
/** What to do next with an area spell the module placed (Rhea, 2026-11-07), from its record; never repeated. Cast (with the caught creatures targeted, so
    Toolbelt gives each a row), then place PF2e's area (found again if it already exists, so safe after a reload). Mode "card": the GM resolves it from
    there. Mode "area" (a damaging basic save): every caught creature with a row saves ("save": the glue rolls what it may and waits for players), the
    damage is rolled once and applied to each by its own degree, then an instant area is removed; a lasting one stays for the GM.
    rec.rows: the caught creatures with a row on the card; rec.saves: { tokenId: degree }; rec.applying / rec.applied: { tokenId: true }. */
export function nextArea(rec = {}, { mode = "area", apply = false, lasting = false } = {}) {
  if (!rec.castStarted) return "cast";
  if (!rec.cast) return "ask";
  if (!rec.placed) return "place";
  if (mode !== "area" || rec.noRows) return "gm";
  const ids = rec.rows ?? [];
  if (ids.some(id => rec.saves?.[id] == null)) return "save";
  const hurt = ids.filter(id => SAVE_MULT[rec.saves[id]] > 0);
  if (hurt.length) {
    if (!rec.damageStarted) return "damage";
    if (!rec.damage) return "ask";
    if (apply || rec.applying) for (const id of hurt) if (!rec.applied?.[id]) return rec.applying?.[id] ? "ask" : "apply";
  }
  if (!lasting && !rec.removed) return "remove";
  return "next";
}
/** Checked steps as the thinker may see them: an area's `hits` (token ids of everyone it catches, for the GM's card) never go back, because they would
    show creatures the monster doesn't perceive. */
export const forThinker = (steps = []) => steps.map(s => s?.area?.hits ? { ...s, area: Object.fromEntries(Object.entries(s.area).filter(([k]) => k !== "hits")) } : s);
/** Who an area hurts and by how much: { tokenId: multiplier } for each caught creature whose save lets damage through. */
export const areaHurt = (rec = {}) => Object.fromEntries((rec.rows ?? []).filter(id => SAVE_MULT[rec.saves?.[id]] > 0).map(id => [id, SAVE_MULT[rec.saves[id]]]));
/** Where an area was aimed, in words. */
export function aimText(area) {
  const a = area?.aim; if (!a) return "";
  if (a.type === "burst") return ` bursting from the corner [${a.corner[0]}, ${a.corner[1]}]`;
  if (a.type === "emanation") return " around itself";
  return a.toward ? ` toward square ${a.toward[0]}, ${a.toward[1]}` : "";
}
/** The damage multiplier a spell step applies: double on a spell attack's critical hit; by degree for a basic save. */
export const spellMultiplier = (step, rec = {}) => step.mode === "attack" ? (rec.attack?.degree === 3 ? 2 : 1) : SAVE_MULT[rec.save?.degree] ?? 1;
/** A spell's actions from PF2e's "time": "2", "1 to 3", "1 or 2", "free"; null for a reaction or anything longer than a turn. */
export function spellActions(time = "") {
  const t = String(time).trim().toLowerCase();
  if (t === "free") return { min: 0, max: 0 };
  const one = t.match(/^([1-3])$/); if (one) return { min: +one[1], max: +one[1] };
  const span = t.match(/^([1-3])\s*(?:to|or)\s*([1-3])$/); if (span) return { min: +span[1], max: +span[2] };
  return { min: null, max: null };
}
/** A spell's range in feet from PF2e's text: "30 feet" is 30, "touch" is reach (touch: true), anything else ("", "planetary", "see text") is null. */
export function spellRange(range = "") {
  const t = String(range).trim().toLowerCase();
  if (t === "touch") return { range: 0, touch: true };
  const m = t.match(/^(\d+)\s*(?:feet|foot|ft\.?)$/); return { range: m ? +m[1] : null, touch: false };
}
/** How many creatures a spell targets, from PF2e's target text: "1 creature" 1, "up to 3 creatures" 3; 0 for none, "you", or only objects. */
export function spellTargets(target = "") {
  const t = String(target).trim().toLowerCase();
  if (!t || t === "you" || (/object|item|weapon|armor|corpse|square/.test(t) && !/creature|ally|allies|enemy|enemies/.test(t))) return 0;   /* "1 animal", "1 humanoid" target creatures too */
  const n = t.match(/(\d+)/); return n ? Math.max(1, +n[1]) : 1;
}
/** Actions an ability takes: its own count, 0 for a free action. */
export const abilityCost = ab => ab.kind === "free" ? 0 : Number.isInteger(ab.cost) && ab.cost > 0 ? ab.cost : 1;
const sizeRank = c => SIZES.indexOf(c);
/** One ability step, checked. A follow-up (Grab, Knockdown, Push, Pull) runs for real; Grab can also keep hold of a creature it has grabbed or restrained
    ("hold", no check); any other ability is "card": its card goes to chat and the GM applies it. Requirements written in an ability's text can't be read,
    so the GM sees those on the card. */
function checkAbility(step, ab, { ctx, last, at, attacks, distanceTo }) {
  const no = reason => ({ ok: false, reason: `${at}: ${reason}` });
  if (ab.usesLeft === 0) return no(`${ab.name} has no uses left.`);
  const traits = ab.traits ?? [];
  if (!ab.followUp) {
    if (ctx.cantAttack && traits.includes("attack")) return no(ctx.cantAttack);
    if (ctx.cantAttack && traits.includes("manipulate")) return no(`it is restrained, so it can't use ${ab.name} (a manipulate action).`);
    if (ctx.cantMove && traits.includes("move")) return no(ctx.cantMove);
    let t = null; if (step.target) { t = ctx.targets[step.target]; if (!t) return no(`it doesn't know of "${step.target}".`); }
    const isAttack = traits.includes("attack");
    return { ok: true, step: { do: "ability", item: ab.id, itemName: ab.name, mode: "card", ...(t ? { target: step.target, targetName: t.name ?? step.target, flat: t.flat ?? 0 } : {}), ...(isAttack ? { attack: true, mapCounts: true, variant: Math.min(attacks, 2) } : {}) } };
  }
  if (ctx.cantAttack) return no(ctx.cantAttack);
  const word = CHECK_WORD[ab.followUp], after = last?.do === "strike" && (last.effects ?? []).includes(ab.effect);
  const target = step.target ?? (after ? last.target : null);
  const straight = `${ab.name} has to come straight after a Strike that lists ${ab.name} and hits (its last action must be that Strike)${ab.followUp === "grapple" ? ", or keep hold of a creature it already has grabbed or restrained (give that creature as the target)" : ""}.`;
  if (!target) return no(straight);
  const t = ctx.targets[target]; if (!t) return no(`it doesn't know of "${target}".`);
  const follow = after && last.target === target && last.hit !== false;
  if (!follow) {
    /* Grab's other use: keep hold of a creature it has grabbed or restrained, with no check (it lasts to the end of its next turn). `held` is true only for a
       grip this monster's own Grab made (the glue keeps them), so another creature's grip doesn't count and nothing is given away. */
    if (ab.followUp === "grapple" && t.held) {
      const reach = Math.max(0, ...(ctx.strikes ?? []).filter(s => !s.ranged && (s.effects ?? []).includes(ab.effect)).map(s => s.reach ?? 5));
      const d = distanceTo(t, reach); if (d > reach) return no(`${t.name ?? target} is ${d} ft away, out of reach to keep hold of.`);
      return { ok: true, step: { do: "ability", item: ab.id, itemName: ab.name, mode: "hold", target, targetName: t.name ?? target } };
    }
    if (after && last.target === target && last.hit === false) return no(`its Strike at ${t.name ?? target} didn't hit, so it can't use ${ab.name}.`);
    if (after && last.target !== target) return no(`${ab.name} goes at the creature its Strike just hit (${last.target}), not ${target}.`);
    return no(straight);
  }
  if (last.ranged) return no(`${ab.name} needs the creature within reach, and its last Strike was ranged.`);
  const d = distanceTo(t, last.reach ?? 5); if (d > (last.reach ?? 5)) return no(`${t.name ?? target} is ${d} ft away, out of reach for ${ab.name}.`);
  if (sizeRank(t.cat) >= 0 && sizeRank(ctx.me?.cat) >= 0 && sizeRank(t.cat) > sizeRank(ctx.me.cat) + 1) return no(t.flat >= 11 ? `it can't ${word} ${t.name ?? target}.` : `${t.name ?? target} is more than one size larger than it, too big to ${word}.`);   /* a hidden creature's size isn't the monster's to know */
  return { ok: true, step: { do: "ability", item: ab.id, itemName: ab.name, mode: "check", check: ab.followUp, target, targetName: t.name ?? target, flat: t.flat ?? 0, attack: true, needsHit: last.hit == null } };
}
/** Its last action this turn before a plan, for an ability that needs it (Grab, Knockdown...): from the step just done with its record, or from the last
    entry of `done` (a re-planned turn). strikes: what checkPlan gets, for the Strike's effects and reach. */
export function lastAction({ step = null, rec = {}, done = null, strikes = [] } = {}) {
  const strike = (item, target, hit) => { const s = strikes.find(x => x.id === item); return { do: "strike", item, target, effects: s?.effects ?? [], reach: s?.reach ?? 5, ranged: !!s?.ranged, hit }; };
  if (step) return step.do !== "strike" ? { do: step.do } : strike(step.item, step.target, rec?.flat && !rec.flat.ok ? false : rec?.attack ? rec.attack.degree >= 2 : null);
  if (done) return done.do !== "strike" ? { do: done.do } : strike(done.item, done.target, ["hit", "critical hit"].includes(done.result) ? true : ["miss", "critical miss", "flat check failed"].includes(done.result) ? false : null);
  return null;
}
/** Whether a step moves the monster across the map (a Stride, Step or Crawl). */
export const isMove = s => MOVES.includes(s?.do);
/** One id per Strike. A thrown dagger shares its slug with the melee one, and a plan has to be able to say which. strikes: [{ slug, ranged }]. */
export function strikeIds(strikes) {
  const seen = new Map();
  return strikes.map(s => { const n = (seen.get(s.slug) ?? 0) + 1; seen.set(s.slug, n); return n === 1 ? s.slug : s.ranged ? `${s.slug}-ranged${n > 2 ? `-${n}` : ""}` : `${s.slug}-${n}`; });
}
/** What resolved steps used of the turn: actions, and attacks for the multiple attack penalty. */
export function spentBy(steps = []) {
  let actions = 0, attacks = 0; for (const s of steps) { actions += s.do === "ability" || s.do === "spell" ? (s.actions ?? 1) : COSTS[s.do] ?? 0; if (s.do === "strike" || s.mapCounts) attacks++; } return { actions, attacks };
}
export const OUTCOMES = ["critical miss", "miss", "hit", "critical hit"];
export const CHECK_OUTCOMES = ["critical failure", "failure", "success", "critical success"];
/** A finished step as the monster saw it, for the next plan: labels and ids only, and the result shown in chat. */
export function doneStep(step, rec = {}) {
  /* Hide and Sneak are secret rolls (Rhea, 2026-11-07, B): the thinker learns what it did, never whether it worked */
  if (step.do === "hide") return { do: "hide", result: rec.applied ? "hid (whether it worked is secret)" : rec.gm ? "card posted for the GM to apply" : "unknown" };
  if (step.do === "seek") return { do: "seek", aim: step.aim, result: rec.applied ? "searched: what it perceives now shows what it found" : rec.gm ? "card posted for the GM to apply" : "unknown" };
  if (step.do === "sneak") { const got = rec.moved?.to; return { do: "sneak", to: step.to, result: `${!got ? "unknown" : same(got, step.to) ? "arrived" : `stopped at [${got[0]}, ${got[1]}]`}${rec.applied ? " (whether it stayed unseen is secret)" : rec.gm ? "; card posted for the GM to apply" : ""}` }; }
  if (isMove(step)) { const got = rec.moved?.to; return { do: step.do, to: step.to, result: !got ? "unknown" : same(got, step.to) ? "arrived" : `stopped at [${got[0]}, ${got[1]}]` }; }
  if (step.do in POSTURES) return { do: step.do, result: rec.changed || rec.stood ? (step.do === "stand" ? "stood" : "dropped") : "unknown" };
  if (step.do === "take-cover") return { do: "take-cover", result: rec.covered ? "took cover" : "unknown" };
  if (step.do === "ability") return { do: "ability", item: step.item, ...(step.target ? { target: step.target } : {}), result: rec.flat && !rec.flat.ok ? "flat check failed" : rec.check ? CHECK_OUTCOMES[rec.check.degree] ?? "unknown" : rec.posted ? (step.mode === "hold" ? "kept hold" : "card posted for the GM to apply") : "unknown" };
  if (step.do === "spell") return { do: "spell", item: step.item, rank: step.rank, ...(step.target ? { target: step.target } : {}), result: spellResult(step, rec) };
  if (step.do !== "strike") return { do: step.do };
  return { do: "strike", item: step.item, target: step.target, result: rec.flat && !rec.flat.ok ? "flat check failed" : rec.attack ? OUTCOMES[rec.attack.degree] ?? "unknown" : "unknown" };
}

/** How a spell step came out, in words the thinker and the GM read. */
function spellResult(step, rec = {}) {
  if (!rec.cast) return "unknown";
  if (rec.flat && !rec.flat.ok) return "flat check failed";
  if (step.mode === "card" || rec.noRows) return "card posted for the GM to apply";
  if (step.mode === "area") return rec.results != null || (rec.rows && !rec.rows.length) ? (rec.results ? `saves: ${rec.results}` : "cast; no one it knows of was in the area") : "waiting for saves";
  if (step.mode === "attack") return rec.attack ? OUTCOMES[rec.attack.degree] ?? "unknown" : "unknown";
  return rec.save ? `target's save: ${CHECK_OUTCOMES[rec.save.degree] ?? "unknown"}` : "waiting for the save";
}

/* ---------- one action at a time: look again before each ---------- */
/* Rhea, 2026-11-06: the module carries a plan out one action at a time and looks again before each. If anything changed since the plan was made, the rest
   is dropped and the thinker is asked again with a fresh packet. The baseline is taken when the packet is, because that's what the plan was made from. */
export const MAX_REPLANS = 3;
/** What the rest of a turn rests on. me: { square, hp, actions, conditions }; others: { label: { square, state, down } }, only who it perceived when asked. */
export function situationOf({ me = {}, others = {} } = {}) {
  return { me: { square: me.square ?? null, hp: me.hp ?? 0, actions: me.actions ?? 0, conditions: [...new Set(me.conditions ?? [])].sort() },
    others: Object.fromEntries(Object.entries(others).map(([l, o]) => [l, { square: o.square ?? null, state: o.state, down: !!o.down }])) };
}
/** What changed since the plan was made, as data. Its own Strikes hurting someone don't count; someone going down does. */
export function changesSince(was, now) {
  if (!was || !now) return [];
  const out = [];
  if (!same(was.me.square, now.me.square)) out.push({ who: "me", what: "moved" });
  if (was.me.hp !== now.me.hp) out.push({ who: "me", what: now.me.hp < was.me.hp ? "hurt" : "healed" });
  if (was.me.actions !== now.me.actions) out.push({ who: "me", what: "actions", now: now.me.actions });
  if (was.me.conditions.join() !== now.me.conditions.join()) out.push({ who: "me", what: "conditions", now: now.me.conditions });
  for (const [label, w] of Object.entries(was.others)) {
    const n = now.others[label];
    if (!n) { out.push({ who: label, what: "gone" }); continue; }
    if (w.down !== n.down) out.push({ who: label, what: n.down ? "down" : "up" });
    if (w.state !== n.state) out.push({ who: label, what: "state", now: n.state });
    if (!same(w.square, n.square)) out.push({ who: label, what: "moved" });
  }
  return out;
}
/** A change in plain words. Labels stay labels unless nameOf says otherwise, so the same words can go to the thinker; `self` is how the monster is named. */
export function describeChange(c, nameOf = l => l, self = "It") {
  if (c.who === "plan") return String(c.reason ?? "").replace(/^Step \d+: /, "");
  const who = c.who === "me" ? self : nameOf(c.who) ?? c.who, its = c.who === "me" ? (self === "It" ? "Its" : `${self}'s`) : `${who}'s`;
  switch (c.what) {
    case "moved": return `${who} moved.`;
    case "stopped": return `${who} was stopped at [${c.at?.[0]}, ${c.at?.[1]}], short of where it was going.`;
    case "sought": return `${who} finished Seeking: what it perceives now shows what it found.`;
    case "noShot": return `${who} couldn't shoot its ${c.item ?? "weapon"}${c.why ? ` (${c.why})` : ""}; the action isn't spent.`;
    case "hurt": return `${who} was hurt.`;
    case "healed": return `${who} regained HP.`;
    case "actions": return `${its} actions this turn are now ${c.now}.`;
    case "conditions": return `${its} conditions are now ${c.now?.length ? c.now.join(", ") : "none"}.`;
    case "gone": return `${who} is gone.`;
    case "down": return `${who} is down.`;
    case "up": return `${who} is back up.`;
    case "state": return `${who} is now ${c.now}.`;
    default: return `${who} changed.`;
  }
}
export const describeChanges = (list = [], nameOf, self) => list.map(c => describeChange(c, nameOf, self)).join(" ");

/** A resolved step in plain words, for the card. */
export function describeStep(s) {
  if (s.do === "none") return "Does nothing.";
  if (isMove(s)) { const way = s.from ? headingOf(s.from, s.to) : ""; return `${WORD[s.do]}s ${s.cost ?? "?"} ft${way ? ` ${way}` : ""}, to square ${s.to[0]}, ${s.to[1]}${s.do === "sneak" ? " (a secret Stealth check; Visioner applies the result)" : ""}.`; }
  if (s.do === "hide") return `Hides (a secret Stealth check against each creature it has cover or concealment from; Visioner applies the result).`;
  if (s.do === "seek") return s.aim?.type === "burst" ? `Seeks in a ${s.aim.size}-foot burst from the corner [${s.aim.corner[0]}, ${s.aim.corner[1]}] (a secret Perception check; Visioner applies the result).` : `Seeks in a ${s.aim?.size ?? SEEK.cone}-foot cone toward square ${s.aim?.toward?.[0]}, ${s.aim?.toward?.[1]} (a secret Perception check; Visioner applies the result).`;
  if (s.do === "stand") return "Stands up.";
  if (s.do === "drop-prone") return "Drops prone.";
  if (s.do === "ability") {
    const flat = s.flat ? `, after a DC ${s.flat} flat check` : "";
    if (s.mode === "check") return `${s.itemName} at ${s.targetName}: a ${CHECK_WORD[s.check]} check, no attack penalty${flat}${s.actions ? "" : " (free action)"}.`;
    if (s.mode === "hold") return `${s.itemName}: keeps hold of ${s.targetName}.`;
    return `${s.itemName}${s.targetName ? ` at ${s.targetName}` : ""}${s.variant ? `, attack ${s.variant + 1}` : ""}: its card goes to chat for you to apply${s.flat ? ` (a DC ${s.flat} flat check if it targets)` : ""}.`;
  }
  if (s.do === "spell") {
    const head = `Casts ${s.itemName} (rank ${s.rank}${s.actions !== 2 ? `, ${s.actions} action${s.actions === 1 ? "" : "s"}` : ""})`, flat = s.flat ? `, after a DC ${s.flat} flat check` : "";
    if (s.mode === "attack") return `${head} at ${s.targetName}: a spell attack${s.variant ? `, attack ${s.variant + 1}` : ""}${flat}.`;
    if (s.area?.aim) {
      const what = `a ${s.area.size}-foot ${s.area.type}${aimText(s.area)}${s.area.catches?.length ? `, catching ${listWords(s.area.catches)}` : ""}${s.area.deliberate ? " (its allies on purpose)" : ""}`;
      if (s.mode === "area") return `${head}: ${what}. Each rolls a basic ${s.save[0].toUpperCase() + s.save.slice(1)} save and takes damage by degree.`;
      return `${head}: ${what}. The area is placed; its card goes to chat for you to apply.`;
    }
    if (s.mode === "save") return `${head} at ${s.targetName}: a ${s.basic ? "basic " : ""}${s.save[0].toUpperCase() + s.save.slice(1)} save${flat}${s.damaging && s.basic ? "" : ", then you apply its effects"}.`;
    return `${head}${s.targetName ? `${s.area ? " aimed at" : " at"} ${s.targetName}` : ""}${flat}: its card goes to chat for you to apply${s.area ? ` (place its ${s.area.size}-foot ${s.area.type})` : ""}${s.attack ? `, as attack ${(s.variant ?? 0) + 1}` : ""}.`;
  }
  if (s.do === "take-cover") return s.why === "prone" ? "Takes Cover while prone." : s.why === "near" ? "Takes Cover by the wall or trunk next to it." : `Takes Cover behind its cover from ${s.from}.`;
  return `${s.itemName} at ${s.targetName}${s.variant ? `, attack ${s.variant + 1}` : ""}${s.flat ? `, after a DC ${s.flat} flat check` : ""}.`;
}
/** What to do next with a Strike step, from what its record says already happened. Nothing is ever repeated: when the record can't tell
    whether something finished, the answer is "ask" and Rhea looks. */
export function nextAction(rec = {}, { apply = false, flat = 0 } = {}) {
  if (flat) { if (!rec.flatStarted) return "flat"; if (!rec.flat) return "ask"; if (!rec.flat.ok) return "next"; }   /* a failed flat check spends the action on nothing */
  if (!rec.started) return "attack";
  if (!rec.attack) return "ask";
  if (rec.attack.degree < 2) return "next";
  if (!rec.damageStarted) return "damage";
  if (!rec.damage) return "ask";
  if (!apply && !rec.applying) return "next";
  if (!rec.applying) return "apply";
  return rec.applied ? "next" : "ask";
}
/** What to do next with a Stride or Step. A move begun before a reload is never sent again: if the monster is where it was going, the step is done;
    anywhere else, the GM looks. at: the square it stands on now. */
export function nextMove(rec = {}, at = null, to = null) {
  if (rec.moved) return "next";
  if (!rec.started) return "move";
  return same(at, to) ? "arrived" : "ask";
}
/** What to do next with a Stand or Drop Prone. Its card is posted and Prone changed in one go, so one begun before a reload is never sent again: if the
    monster is already as the step leaves it, it counts as done; otherwise the GM looks. Not begun and already as it leaves it (something else stood it
    up or knocked it down first): done, with nothing posted. already: whether it is already standing (for Stand) or prone (for Drop Prone). */
export function nextPosture(rec = {}, already = false) {
  if (rec.changed || rec.stood) return "next";   /* stood: a Stand recorded by 0.5.0 */
  if (!rec.started) return already ? "already" : "act";
  return already ? "already" : "ask";
}
/** What to do next with a Take Cover. One begun before a reload is never sent again, and the GM looks: its cover is set creature by creature, so Taking
    Cover now doesn't show it reached them all. Not begun and already Taking Cover: done, with nothing posted. active: whether it is Taking Cover now. */
export function nextCover(rec = {}, active = false) {
  if (rec.covered) return "next";
  if (!rec.started) return active ? "already" : "act";
  return "ask";
}
/** What to do next with a Hide, Sneak or Seek, from its record. Never repeated: when the record can't tell whether a stage finished, "ask" ("check" after
    Apply was pressed: the glue looks for Visioner's Revert on the card, which survives only if the card wasn't redrawn, and otherwise asks). PF2e's own action posts the card with the secret roll
    ("roll"); "gm" when Visioner's buttons aren't on it, so the GM applies the result from the card. A Sneak then presses Start Sneak ("start", and
    "check-start" after a reload), moves like a Stride ("move": the glue goes by the move's own record, `started` and `moved`), and applies. A Seek is
    limited to its area when it applies. rec: rollStarted, card, gm, startStarted, startDone, started, moved, applyStarted, applied. */
export function nextStealth(rec = {}, kind = "hide") {
  if (!rec.rollStarted) return "roll";
  if (!rec.card) return "ask";
  if (rec.gm) return "gm";
  if (kind === "sneak") {
    if (!rec.startStarted) return "start";
    if (!rec.startDone) return "check-start";
    if (!rec.moved) return "move";
  }
  if (!rec.applyStarted) return "apply";
  return rec.applied ? "next" : "check";
}
/** What to do next with an ability step, from its record. Never repeated: when the record can't tell whether a stage finished, "ask". mode: "check" (a
    follow-up: flat check if any, the check, its effects, then a Trip's critical damage), "hold" or "card" (its card posted). "gm" means done, with something
    left for the GM to apply. Applying a condition again changes nothing, so the effects stage may run again after a reload. */
export function nextAbility(rec = {}, { mode = "check", flat = 0, apply = false } = {}) {
  if (mode !== "check") { if (!rec.started) return "post"; return rec.posted ? (mode === "card" ? "gm" : "next") : "ask"; }
  if (flat) { if (!rec.flatStarted) return "flat"; if (!rec.flat) return "ask"; if (!rec.flat.ok) return "next"; }
  if (!rec.started) return "check";
  if (!rec.check) return "ask";
  if (!rec.effects) return "effects";
  if (rec.effects.damage) {
    if (!rec.damageStarted) return "damage"; if (!rec.damage) return "ask";
    if (apply && !rec.applying) return "apply"; if (rec.applying && !rec.applied) return "ask";
  }
  return rec.effects.gm ? "gm" : "next";
}
/** What a follow-up's check does, by degree (0 critical failure to 3 critical success), as the rules say: conditions for the target and for the monster,
    damage, and what's left for the GM, in words (`who` names the target, `me` the monster). held: the target was grabbed or restrained before the check. */
export function followUpOutcome(check, degree, { held = false, who = "The target", me = "it" } = {}) {
  const out = { target: [], self: [], damage: null, gm: null };
  if (check === "grapple") {
    if (degree === 3) out.target.push("restrained");
    else if (degree === 2) out.target.push("grabbed");
    else if (degree === 1 && held) out.gm = `${who} was already grabbed or restrained: if ${me} was the one holding them, that ends now.`;
    else if (degree === 0) out.gm = `${held ? `If ${me} was holding ${who}, they break free. ` : ""}${who} can grab ${me} (as if they succeeded at a Grapple) or make ${me} fall prone: apply what they choose.`;
  } else if (check === "trip") {
    if (degree >= 2) out.target.push("prone");
    if (degree === 3) out.damage = "1d6[bludgeoning]";
    if (degree === 0) out.self.push("prone");
  } else if (check === "shove") {
    if (degree >= 2) out.gm = `Move ${who} ${degree === 3 ? 10 : 5} ft straight away from ${me} (the module doesn't move a pushed creature).`;
    if (degree === 0) out.self.push("prone");
  } else if (check === "reposition") {
    if (degree >= 2) out.gm = `Move ${who} up to ${degree === 3 ? 10 : 5} ft closer to ${me}, staying within its reach (the module doesn't move a pulled creature).`;
    if (degree === 0) out.gm = `${who} can move ${me} up to 5 ft (as if they Repositioned it): apply what they choose.`;
  }
  return out;
}
/** The cover Take Cover gives against one creature, from the cover it has against that creature now, as Visioner's own Take Cover works it out (8.14.17):
    standard or greater becomes greater, anything less becomes standard; prone with none at all gives greater cover against ranged attacks only. */
export const coverAfterTaking = (now = "none", prone = false) => now === "standard" || now === "greater" ? "greater" : prone && (!now || now === "none") ? "prone-ranged" : "standard";
/** Whether this request's steps before `upto` ended a Take Cover: an attack made (or its flat check rolled: the action is spent either way) or a move out of
    its space, after the last Take Cover among them (or from the start, for one taken on an earlier turn). Rules: it lasts until you move from your space,
    make an attack, become unconscious, or end it. `from`: only steps from there on count (the earlier ones were settled already, so a Take Cover the GM
    gave it after them stands). */
export function endsCover(steps = [], log = {}, upto = steps.length, from = 0) {
  let k0 = 0; for (let k = 0; k < upto; k++) if (steps[k]?.do === "take-cover") k0 = k + 1;
  for (let k = Math.max(k0, from); k < upto; k++) {
    const s = steps[k], rec = log?.[k] ?? {};
    if ((s?.do === "strike" || (s?.do === "ability" && s.attack)) && (rec.started || rec.flatStarted)) return true;
    if (s?.do === "spell" && s.attack && rec.castStarted) return true;
    if (isMove(s) && rec.moved?.to && !same(rec.moved.to, s.from)) return true;
  }
  return false;
}
/** The monster's conditions in the look-before baseline after its own Stand or Drop Prone: what that action took away goes, what it added comes in, and
    nothing else changes, so a condition a reaction added still counts as a change. Lists of condition words; `own`, if given, limits what counts as the
    action's doing (for a reload, when the conditions just before it are unknown). */
export function absorbOwn(seen = [], before = [], after = [], own = null) {
  const counts = c => !own || own.includes(c.split(" ")[0]);
  const gone = before.filter(c => !after.includes(c) && counts(c)), came = after.filter(c => !before.includes(c) && counts(c));
  return [...new Set([...seen.filter(c => !gone.includes(c)), ...came])].sort();
}
/** This turn's unfinished request. By round and combatant, not turn number: an initiative change can move the number during the turn. */
export function currentOf(requests = {}, round, combatantId) {
  return Object.entries(requests).map(([id, r]) => ({ id, ...r })).filter(r => !["done", "manual"].includes(r.state) && r.round === round && r.combatantId === combatantId).at(-1) ?? null;
}
/** Whether a request has work in flight or about to start. Waiting on a person or a plan doesn't count. */
export const requestBusy = r => !!r && (r.state === "running" || r.state === "submitted" || !!r.go);
/** The note to show between turns: only the latest finished turn's, so an old warning never outlives the turn it was about. A turn that was re-planned
    is several requests linked by `parent`, and a warning from its first part (a PC at 0 HP) still counts. */
export function latestNote(requests = {}) {
  const fin = Object.values(requests).filter(r => ["done", "manual"].includes(r.state)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const last = fin.at(-1); if (last?.state !== "done") return null;
  const notes = []; for (let r = last, n = 0; r && n < 10; r = r.parent ? requests[r.parent] : null, n++) if (r.note) notes.unshift(r.note);
  return notes.length ? { ...last, note: notes.join(" ") } : null;
}
/** The roll options PF2e's own damage button gives a target, from the damage card's context. */
export function damageOptions(options = []) {
  const origin = options.filter(o => o.startsWith("self:")).map(o => o.replace(/^self\b/, "origin"));
  return { origin, keep: options.filter(o => !/^(?:self|target)(?::|$)/.test(o)) };
}
