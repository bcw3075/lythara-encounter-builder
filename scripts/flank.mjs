/* Flanking (0.44.0, F-10): which squares a monster can reach that flank a foe with an ally, how dangerous standing there is, whether it is flanked
   itself and where it could get out. Pure: no Foundry globals; fight.mjs gathers the live values and hands in the world. Everything here is worked
   out from what the monster perceives: only creatures it knows of are passed in, and nothing off a foe's sheet but what shows (its size, how far
   the weapon in its hand reaches). Rules: Flanking https://2e.aonprd.com/Rules.aspx?ID=2375 ; PF2e itself decides whether off-guard applies
   (`isFlanking` on the token, PF2e 8.7.0), this file only copies its test so the thinker can be told ahead of the move.
   A creature here is { label, square: [x, y] (top-left), size (squares a side), reach (feet, 0 when it has no melee attack), able }. */
import { distanceBetween, footprintAt } from "./move.mjs";

/** What a mind makes of flanking (Rhea, 2026-11-24: "work out squares, by mind"). mind and discipline are the picks of its profile; a creature with
    no Mind written (a party member Angel plays) counts as Cunning, as its notebook does.
    Out: null for a Mindless creature (it is told nothing), or { seeks, guesses }: seeks = it looks for flanks itself (a pack by instinct, a trained
    or drilled band by training, a cunning or trained mind by wit); every other thinking creature only guards its own back. guesses = it may count a
    foe's reaction it has not seen yet, as a guess (a trained tactician, or a trained or drilled band: "smarter or better trained"). */
export function flankUse(mind = null, discipline = null) {
  if (mind === "mindless") return null;
  const m = mind ?? "cunning";
  return { seeks: ["pack", "trained", "drilled"].includes(discipline) || ["cunning", "tactician"].includes(m), guesses: m === "tactician" || ["trained", "drilled"].includes(discipline) };
}

const centre = c => [c.square[0] + c.size / 2, c.square[1] + c.size / 2];
/* Foundry's `orient2dFast` and `lineSegmentIntersects` (14.370), which PF2e's `onOppositeSides` uses: touching counts, two collinear segments don't */
const orient = (a, b, c) => (a[1] - c[1]) * (b[0] - c[0]) - (a[0] - c[0]) * (b[1] - c[1]);
const crosses = (a, b, c, d) => { const xa = orient(a, b, c), xb = orient(a, b, d); if (!xa && !xb) return false; return xa * xb <= 0 && orient(c, d, a) * orient(c, d, b) <= 0; };
/** PF2e's test (`TokenPF2e#onOppositeSides`): the line between the two flankers' centres crosses two opposite sides of the creature between them
    (a line through opposite corners touches all four). */
export function oppositeSides(a, b, mid) {
  const p = centre(a), q = centre(b), [x0, y0] = mid.square, x1 = x0 + mid.size, y1 = y0 + mid.size;
  const side = (c, d) => crosses(p, q, c, d);
  return (side([x0, y0], [x0, y1]) && side([x1, y0], [x1, y1])) || (side([x0, y0], [x1, y0]) && side([x0, y1], [x1, y1]));
}
const box = c => ({ x: c.square[0], y: c.square[1], size: c.size });
/** Is `to` within this creature's melee reach, as PF2e measures it? */
export const reaches = (from, to) => !!from.able && from.reach > 0 && distanceBetween(box(from), box(to), { reach: from.reach }) <= from.reach;
const at = (me, square) => ({ ...me, square });
const sameSq = (a, b) => a[0] === b[0] && a[1] === b[1];

/** Which foes flank a creature standing at `square`: the labels of every foe that is one of a pair on opposite sides, both with it in reach. */
export function flankedAt(me, square, foes = []) {
  if (me.flankable === false) return [];
  const here = at(me, square), near = foes.filter(f => reaches(f, here)), out = new Set();
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) if (oppositeSides(near[i], near[j], here)) { out.add(near[i].label); out.add(near[j].label); }
  return [...out];
}
/** The squares around a footprint, one square out. */
function ring(square, size) { const out = []; for (let j = -1; j <= size; j++) for (let i = -1; i <= size; i++) if (i < 0 || j < 0 || i >= size || j >= size) out.push([square[0] + i, square[1] + j]); return out; }
/** Is its back covered at `square`? For each foe that reaches it there: is any free square beside it one from which a second foe would flank it
    with that one? "covered" when no foe that reaches it has such an opening (a wall, a tree or an ally stands there); "open" when one has; null
    when no foe reaches the square at all. Only the squares right beside it are looked at: a second foe with a long weapon could still flank from
    further off. free(i, j): a Medium creature could stand there, as far as this monster knows. */
export function backAt(me, square, foes = [], free = () => true) {
  const here = at(me, square), near = foes.filter(f => reaches(f, here)); if (!near.length) return null; if (me.flankable === false) return "covered";
  const open = ring(square, me.size).filter(([i, j]) => free(i, j));
  return near.some(f => open.some(t => oppositeSides(f, { square: t, size: 1 }, here))) ? "open" : "covered";
}
/** Who may strike as it moves along a route (a Stride leaves each square but the last; a Step provokes nothing): the foes whose reach covers a
    square it moves out of. Sure only for a foe it has seen do that (`seenReact`: its notebook); a guess for one that looks the part
    (`looksMartial`: a melee weapon in hand) when its mind may guess; anyone else it knows nothing of, so nothing is said. */
export function provokedBy(me, route = [], foes = [], { guesses = false } = {}) {
  const sure = [], maybe = [];
  for (const f of foes) { if (!route.slice(0, -1).some(sq => reaches(f, at(me, sq)))) continue;
    if (f.seenReact) sure.push(f.label); else if (guesses && f.looksMartial) maybe.push(f.label); }
  return { sure, maybe };
}

export const FLANK_MAX = 4, OUT_MAX = 3, OUT_TRIES = 30, OUT_RADIUS = 4;
/** The flanking part of a packet, or null when there is nothing to say.
    o: { me: { ...creature, flankable, speed, actions, canMove, canStep }, allies: [creature], foes: [{ ...creature, seen (observed or concealed: it
         can be flanked for a Strike), seenReact, looksMartial }], use: flankUse(...), world: { route(from, to) → { ok, cost, route } (a Stride, looked
         for within two Speeds), step(from, to) → the same for a Step, free(i, j) } }
    Out: { block (what the thinker is sent), open (how many flank squares there were, whether or not its mind is told of them: the card's line) }.
    block: { habit: "seeks" | "guards", flankedBy?: [labels], flanking?: [{ foe, with }], squares?: [{ to, foe, with, by, feet, reach?, flanked?,
             provokes?, mayProvoke?, back?, allyNear }], out?: [{ to, by, feet, reach?, provokes?, mayProvoke?, back? }] } */
export function flankView({ me, allies = [], foes = [], use = null, world }) {
  const told = !!use; use = use ?? { seeks: false, guesses: false };   /* a Mindless creature is told nothing, but the card still says a flank was open */
  const speed = me.speed ?? 0, here = me.square, able = foes.filter(f => f.able);
  /* one answer a square (review 9): a square near two foes, or opposite two allies, is routed to once; and nothing further than two Speeds is tried */
  const moves = new Map(), moveTo = to => { const k = `${to[0]},${to[1]}`; if (!moves.has(k)) moves.set(k, Math.max(Math.abs(to[0] - here[0]), Math.abs(to[1] - here[1])) * 5 > speed * 2 + 5 ? null : moveNow(to)); return moves.get(k); };
  const moveNow = to => {
    if (!me.canMove) return null;
    if (me.canStep && Math.max(Math.abs(to[0] - here[0]), Math.abs(to[1] - here[1])) === 1) { const s = world.step(here, to); if (s?.ok) return { by: "step", feet: s.cost, route: s.route }; }
    const r = world.route(here, to); if (!r?.ok || !(speed > 0)) return null;
    return r.cost <= speed ? { by: "stride", feet: r.cost, route: r.route } : r.cost <= speed * 2 && (me.actions ?? 3) >= 2 ? { by: "two strides", feet: r.cost, route: r.route } : null;
  };
  const danger = (to, m, skip = null) => {
    const there = at(me, to), reach = able.filter(f => f.label !== skip && reaches(f, there)).map(f => f.label), fl = flankedAt(me, to, able), p = m.by === "step" ? { sure: [], maybe: [] } : provokedBy(me, m.route, able, use), back = backAt(me, to, able, world.free);
    return { ...(reach.length ? { reach } : {}), ...(fl.length ? { flanked: true } : {}), ...(p.sure.length ? { provokes: p.sure } : {}), ...(p.maybe.length ? { mayProvoke: p.maybe } : {}), ...(back === "covered" ? { back: "covered" } : {}) };
  };
  const weight = s => (s.flanked ? 3 : 0) + (s.reach?.length ?? 0) + 2 * (s.provokes?.length ?? 0) + (s.mayProvoke?.length ?? 0) + (s.by === "two strides" ? 1 : 0) - (s.back ? 0.5 : 0);
  /* flanking: for each foe it sees and each ally that has that foe in reach, the squares from which its own melee reach covers the foe and the
     foe stands between the two */
  const flanking = [], spots = new Map();
  if (me.able && me.reach > 0) for (const f of foes) { if (!f.seen || f.flankable === false) continue;
    for (const a of allies) { if (!reaches(a, f)) continue;
      if (reaches(me, f) && oppositeSides(me, a, f)) { if (!flanking.some(x => x.foe === f.label)) flanking.push({ foe: f.label, with: a.label }); continue; }
      const r = Math.ceil(me.reach / 5);
      for (let y = f.square[1] - r - me.size + 1; y <= f.square[1] + f.size - 1 + r; y++) for (let x = f.square[0] - r - me.size + 1; x <= f.square[0] + f.size - 1 + r; x++) {
        const to = [x, y], k = `${x},${y},${f.label}`; if (spots.has(k) || sameSq(to, here)) continue; const there = at(me, to);
        if (footprintAt(to, me.size).some(([i, j]) => i >= f.square[0] && i < f.square[0] + f.size && j >= f.square[1] && j < f.square[1] + f.size)) continue;
        if (!reaches(there, f) || !oppositeSides(there, a, f)) continue;
        const m = moveTo(to); if (!m) continue;
        const near = Math.min(...allies.map(al => distanceBetween(box(there), box(al))));
        spots.set(k, { to, foe: f.label, with: a.label, by: m.by, feet: m.feet, ...danger(to, m, f.label), allyNear: near }); } } }
  const already = new Set(flanking.map(x => x.foe)), all = [...spots.values()].filter(s => !already.has(s.foe)).sort((p, q) => weight(p) - weight(q) || p.feet - q.feet), squares = all.slice(0, FLANK_MAX);
  /* its own back: who flanks it now, and where it could go to be out of it (a Step first, then a short Stride), least threatened first */
  const flankedBy = flankedAt(me, here, able), out = [];
  if (flankedBy.length && me.canMove) {
    const cand = []; for (let dy = -OUT_RADIUS; dy <= OUT_RADIUS; dy++) for (let dx = -OUT_RADIUS; dx <= OUT_RADIUS; dx++) { if (!dx && !dy) continue; const to = [here[0] + dx, here[1] + dy];
      if (!footprintAt(to, me.size).every(([i, j]) => world.free(i, j) || footprintAt(here, me.size).some(([a, b]) => a === i && b === j))) continue;
      if (flankedAt(me, to, able).length) continue;
      cand.push({ to, far: Math.max(Math.abs(dx), Math.abs(dy)), n: able.filter(f => reaches(f, at(me, to))).length }); }
    cand.sort((p, q) => (p.far === 1 ? 0 : 1) - (q.far === 1 ? 0 : 1) || p.n - q.n || p.far - q.far);
    const found = []; let tries = 0;
    for (const c of cand) { if (tries++ >= OUT_TRIES || found.length >= OUT_MAX * 3) break; const m = moveTo(c.to); if (!m || m.by === "two strides") continue; found.push({ to: c.to, by: m.by, feet: m.feet, ...danger(c.to, m) }); }
    /* a Step never draws a reaction, so the two best Steps come first, then the best Stride (which can get it clear of everyone), then whatever is left */
    const rank = (p, q) => weight(p) - weight(q) || p.feet - q.feet, steps = found.filter(x => x.by === "step").sort(rank), strides = found.filter(x => x.by !== "step").sort(rank);
    const pick = [...steps.slice(0, OUT_MAX - 1), ...strides.slice(0, 1)]; pick.push(...[...steps.slice(OUT_MAX - 1), ...strides.slice(1)].sort(rank).slice(0, OUT_MAX - pick.length));
    out.push(...pick);
  }
  const block = { habit: use.seeks ? "seeks" : "guards", ...(flankedBy.length ? { flankedBy } : {}), ...(use.seeks && flanking.length ? { flanking } : {}), ...(use.seeks && squares.length ? { squares } : {}), ...(out.length ? { out } : {}) };
  return { block: told && Object.keys(block).length > 1 ? block : null, open: all.length, flanking: flanking.length };
}
/** Did a plan take one of the flank squares it was shown (its last move ends on one)? */
export const tookFlank = (block, steps = []) => { const last = steps.filter(st => Array.isArray(st.to)).at(-1); return !!last && !!block?.squares?.some(s => sameSq(last.to, s.to)); };   /* where its last move ends (review 12) */
/** The card's line for the GM when a flank was open and the plan didn't take it (F-10: "the card says why when it doesn't flank"), or null.
    o: { use, open, has (how many flanks it holds already), block, steps, noFlank (the thinker's own words), mind, discipline (labels, for a mind that doesn't seek) } */
export function flankNote({ use, open = 0, has = 0, block = null, steps = [], noFlank = null, mind = "", discipline = "" } = {}) {
  if (!open || has) return null;   /* has: the flanks it already holds, which a mind that doesn't seek is never told of (live test, 0.44.0) */
  if (!use) return "A flank was open and not taken: a Mindless creature never thinks to flank.";
  if (!use.seeks) return `A flank was open and not taken: this mind doesn't look for flanks (Mind ${mind || "not set"}, Discipline ${discipline || "not set"}); only being flanked is guarded against.`;
  if (block?.flanking?.length || tookFlank(block, steps)) return null;
  return `A flank was open and not taken: ${String(noFlank ?? "").trim().replace(/[.!?\s]+$/, "") || "Angel gave no reason"}.`;   /* the thinker's own full stop would make two (live test) */
}
