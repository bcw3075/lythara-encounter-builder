/* Moving a monster: the distance between two creatures, and the route and cost of a Stride, a Step or a Crawl. Pure: no Foundry globals. A creature's square is its
   top-left square, [x, y] with y down, and its size is how many squares a side (1, 2 for Large, ...). Foundry's own measurement has the last word on
   what a route costs (fight.mjs measures every route this finds); this file finds the route, because Foundry has no pathfinding of its own. */
export const FT = 5;
const SQUARE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** PF2e's distance between two creatures on a square grid, as `measureDistanceCuboid` works it out (PF2e 8.7.0): the squares between their edges,
    every second diagonal counting double. At different heights the vertical gap counts as a third axis (elevation in feet, depth in squares, which is
    the token's own depth, its size by default); at the same height it doesn't. With reach 10 it takes 5 ft off when the line has more than one
    diagonal, which is the rule that 10-foot reach reaches two squares diagonally. a, b: { x, y, size, elev, depth } in squares (elev in feet).
    Checked against `distanceTo` live for Medium and Large at one height (2026-11-07). x and y may be fractional for a token off the grid: as PF2e does,
    the overlap test uses where it really is, and then each creature's edges are snapped to the grid toward the other before the squares are counted, so
    a creature half a square off is measured from the nearer square (a Small goblin at x 23.5 next to a creature at x 22 is 5 ft away, not 10). */
export function distanceBetween(a, b, { reach = null } = {}) {
  const sa = a.size ?? 1, sb = b.size ?? 1;
  const overX = b.x < a.x + sa && b.x + sb > a.x, overY = b.y < a.y + sa && b.y + sb > a.y, flat = overX && overY;
  const snap = (v, other) => (v < other ? Math.ceil : Math.floor)(v), ax = snap(a.x, b.x), bx = snap(b.x, a.x), ay = snap(a.y, b.y), by = snap(b.y, a.y), wa = Math.ceil(sa), wb = Math.ceil(sb);
  const dx = flat ? 0 : Math.max(bx - (ax + wa), ax - (bx + wb), 0) + 1, dy = flat ? 0 : Math.max(by - (ay + wa), ay - (by + wb), 0) + 1;
  let dz = 0;
  if ((a.elev ?? 0) !== (b.elev ?? 0)) {
    const ta = (a.elev ?? 0) / FT, tb = (b.elev ?? 0) / FT, da = a.depth ?? sa, db = b.depth ?? sb;
    dz = tb < ta + da && tb + db > ta ? 0 : Math.ceil(Math.max(tb - (ta + da), ta - (tb + db), 0)) + 1;
  }
  const [d0, d1, d2] = [dx, dy, dz].sort((p, q) => p - q), off = d1 > 1 && reach === 10 ? 1 : 0;
  return Math.max(0, Math.floor(d0 * 1.75 + (d1 - d0) * 1.5 + (d2 - d1)) - off) * FT;
}

/** The squares a creature covers standing at [x, y]. */
export function footprintAt([x, y], size = 1) { const out = []; for (let b = 0; b < size; b++) for (let a = 0; a < size; a++) out.push([x + a, y + b]); return out; }
const key = (x, y) => `${x},${y}`;

/** Why a creature can't stand at [x, y], or null if it can. Shared by the route search and the destination check, so both say the same thing. */
function standProblem(at, size, w) {
  for (const [i, j] of footprintAt(at, size)) {
    if (i < 0 || j < 0 || i >= w.cols || j >= w.rows) return "off";
    if (w.blocked(i, j)) return "blocked";
    if (w.terrain(i, j) == null) return "terrain";
    if (w.creature(i, j)) return "occupied";
  }
  return null;
}
/** Whether it may pass through [x, y] on the way: an ally's space yes, an enemy's no. */
function passProblem(at, size, w) {
  for (const [i, j] of footprintAt(at, size)) {
    if (i < 0 || j < 0 || i >= w.cols || j >= w.rows) return "off";
    if (w.blocked(i, j)) return "blocked";
    if (w.terrain(i, j) == null) return "terrain";
    if (w.creature(i, j) === "enemy") return "occupied";
  }
  /* a Swim goes through water: every square it passes has some deep water under it (a Large creature half on the bank is still swimming in or out);
     its last square may be dry land, the bank (findRoute) */
  if (w.wet && !footprintAt(at, size).some(([i, j]) => w.wet(i, j))) return "dry";
  return null;
}
/** The extra cost of the squares a step enters: 5 ft for each difficult square, 10 ft for greater, as Foundry charged it (2026-11-07). A Large creature
    entering several new squares pays for the worst one: Foundry's measurement is checked afterwards anyway. */
function extraFor(from, to, size, w) {
  const old = new Set(footprintAt(from, size).map(p => key(...p))); let worst = 0;
  for (const [i, j] of footprintAt(to, size)) if (!old.has(key(i, j))) worst = Math.max(worst, w.terrain(i, j) ?? 0);
  return worst * FT;
}

/** How many diagonal steps a path of waypoints takes. A segment can span several squares (a hand-dragged move), and Foundry counts min(|dx|, |dy|)
    diagonals in it. */
export function diagonalsIn(squares = []) { let n = 0; for (let k = 1; k < squares.length; k++) n += Math.min(Math.abs(squares[k][0] - squares[k - 1][0]), Math.abs(squares[k][1] - squares[k - 1][1])); return n; }

/** The cheapest route for a Stride from `from` to `to`, counting as PF2e does: every other diagonal 10 ft, each difficult square entered 5 ft more,
    greater 10 more. The diagonal count runs across the whole turn (Rules ID 444: "your total diagonal movement across all your movement during your
    turn"), so `odd` says whether an odd number of diagonals has already been taken this turn: then the first diagonal here costs 10. world: { cols, rows, terrain(i, j) → 0 | 1 | 2, or null where a Stride can't go (deep water); blocked(i, j) → a trunk or rock in the
    square; creature(i, j) → null | "ally" | "enemy" (anyone else's space); wall(a, b) → a wall between two places it could stand }.
    budget: feet to look within. Returns { ok: true, route: [[x, y], ...from first to last], cost } or { ok: false, why, cost? }, why being
    "same", "off", "blocked", "terrain", "occupied" (the end square), "far" (cost is what it would take) or "noway". */
export function findRoute({ from, to, size = 1, budget = 200, odd = false }, w) {
  if (from[0] === to[0] && from[1] === to[1]) return { ok: false, why: "same" };
  const end = standProblem(to, size, w); if (end) return { ok: false, why: end };
  /* Dijkstra over (square, whether an odd number of diagonals has been taken): the 5-10 rule makes the cost of the next diagonal depend on it */
  const best = new Map(), prev = new Map(), heap = [];
  const push = (c, s) => { heap.push([c, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const start = `${key(...from)}|${odd ? 1 : 0}`; best.set(start, 0); push(0, start);
  const limit = Math.max(budget, 0) * 4 + 60; let cut = false;   /* look past the budget, so "too far" can say how far */
  while (heap.length) {
    const [c, s] = pop(); if (c > (best.get(s) ?? Infinity)) continue;
    const [sq, odd] = s.split("|"), [x, y] = sq.split(",").map(Number);
    if (x === to[0] && y === to[1]) {
      const route = []; for (let k = s; k; k = prev.get(k)) route.unshift(k.split("|")[0].split(",").map(Number));
      return c <= budget ? { ok: true, route, cost: c } : { ok: false, why: "far", cost: c, route };
    }
    for (const [dx, dy] of SQUARE_DIRS) {
      const nx = x + dx, ny = y + dy, diag = dx && dy, nodd = diag ? (odd === "1" ? 0 : 1) : Number(odd);
      const pp = passProblem([nx, ny], size, w); if (pp && !(pp === "dry" && nx === to[0] && ny === to[1])) continue;   /* a Swim may climb out on its last square */
      if (w.wall([x, y], [nx, ny])) continue;
      const nc = c + (diag && odd === "1" ? 2 * FT : FT) + extraFor([x, y], [nx, ny], size, w);
      if (nc > limit) { cut = true; continue; }
      const ns = `${key(nx, ny)}|${nodd}`; if (nc < (best.get(ns) ?? Infinity)) { best.set(ns, nc); prev.set(ns, s); push(nc, ns); }
    }
  }
  return cut ? { ok: false, why: "far", cost: null } : { ok: false, why: "noway" };   /* beyond where it looked isn't the same as no way */
}

/** A Step: one square, 5 ft, never into difficult terrain (Rules: https://2e.aonprd.com/Actions.aspx?ID=2304). Same world as findRoute; the cost here is
    what the 5-10 rule makes it (10 for a diagonal after an odd number this turn), and Foundry's measurement is taken afterwards anyway. Returns
    { ok: true, route: [from, to], cost } or { ok: false, why }, why being "same", "notNext" (more than one square away), "off", "blocked", "terrain",
    "occupied", "difficult" or "wall". */
export function findStep({ from, to, size = 1, odd = false }, w) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  if (!dx && !dy) return { ok: false, why: "same" };
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return { ok: false, why: "notNext" };
  const end = standProblem(to, size, w); if (end) return { ok: false, why: end };
  if (extraFor(from, to, size, w) > 0) return { ok: false, why: "difficult" };
  if (w.wall(from, to)) return { ok: false, why: "wall" };
  return { ok: true, route: [[...from], [...to]], cost: dx && dy && odd ? 2 * FT : FT };
}

/** Where a move along `route` really stops: before the first place whose footprint holds a creature in `unknown(i, j)`, one the mover didn't know was
    there. Rules: moving into an undetected creature's space ends the move. Returns the route up to there (at least its first square). */
export function cutShort(route = [], size = 1, unknown = () => false) {
  for (let k = 1; k < route.length; k++) if (footprintAt(route[k], size).some(([i, j]) => unknown(i, j))) return route.slice(0, k);
  return route;
}

/** What changing height costs on top of a Fly's ground route, by the rules (Rules ID 2344, https://2e.aonprd.com/Rules.aspx?ID=2344): moving upward,
    straight or diagonally, is difficult terrain, so each 5 ft risen costs 10, but a square moved across while rising is that same 5 ft step (a
    diagonal upward move into a square costs 10, not 5 + 10); moving straight down costs 5 ft for each 10 ft descended, and height lost while moving
    across squares costs nothing more. Foundry measures height as a plain third axis, so it can't price this. squares: how many squares the ground route
    crosses; dz: the change in height, in feet (a multiple of 5). */
export function heightCost(squares = 0, dz = 0) {
  const n = Math.max(0, squares), steps = Math.round(Math.abs(dz) / FT);
  if (dz > 0) return 2 * FT * steps - FT * Math.min(steps, n);
  if (dz < 0) return Math.ceil(Math.max(0, steps - n) / 2) * FT;
  return 0;
}
/** The height at each square of a Fly's route: it rises or drops 5 ft a square as it goes (as heightCost prices it), and any height left over is
    changed at the last square. Returns [{ square, elev }] for every square after the first, plus one more at the last square when height is left. */
export function flyWaypoints(route = [], from = 0, to = 0) {
  const out = [], dir = Math.sign(to - from); let e = from;
  for (const sq of route.slice(1)) { if (e !== to) e += dir * FT; out.push({ square: [...sq], elev: e }); }
  if (e !== to || !out.length) out.push({ square: [...(route.at(-1) ?? [0, 0])], elev: to });
  return out;
}
/** Where a Fly cut short ends in height: it changes 5 ft a square as it goes (flyWaypoints), so after `squares` squares of a route meant to go from
    `from` to `to` it has changed by at most 5 ft a square. A Fly not cut short ends at `to`. */
export function heightWhenCut(from = 0, to = 0, squares = 0, cut = true) {
  if (!cut) return to;
  return Math.max(0, from + Math.sign(to - from) * Math.min(Math.abs(to - from), Math.max(0, squares) * FT));
}
/** The world as a flier crosses it: ground terrain costs nothing and deep water is no bar, while trunks, rocks, walls and creatures stay as they are
    (trees are taller than it flies over, and walls stop Foundry's moves at any height). */
export const flyWorld = w => ({ ...w, terrain: () => 0 });

/** The world as a Swim crosses it (Player Core Swim, Actions ID 2381; swim Speed, Rules ID 2346): only through deep water, which costs no more than an
    open square there, with the last square allowed on the bank (climbing out); walls, trunks, rocks and creatures as for a Stride. wet(i, j): the
    square is deep water. The bank square keeps its own terrain cost. */
export const swimWorld = (w, wet) => ({ ...w, terrain: (i, j) => wet(i, j) ? 0 : w.terrain(i, j) ?? 2, wet });   /* the part of a footprint on the bank keeps its own cost */
/** How far a Swim action goes without a swim Speed (Player Core Swim, Actions ID 2381): up to 10 ft, plus 5 ft for every 20 ft of land Speed above 20
    once the land Speed is 40 or more; a critical success adds 5 ft (most calm water is an automatic critical success). degree: 0 critical failure,
    1 failure, 2 success, 3 critical success; no progress below a success. */
export function swimDistance(landSpeed = 25, degree = 2) {
  if (degree < 2) return 0;
  const fast = landSpeed >= 40 ? FT * Math.floor((landSpeed - 20) / 20) : 0;
  return 2 * FT + fast + (degree >= 3 ? FT : 0);
}
/** Which kind of deep water each square is, for a Swim: "calm" (a pond or lake: Player Core's "most calm water", an automatic critical success) or
    "flowing" (a river or creek channel: a trained task, so an Athletics check), or null when the square isn't deep water. deep(i, j): the square is
    deep water. read: Survey Sheet's map read ({ things: { placed: [{ kind, at, r (feet) }] }, lines: [{ kind, squares }] }); without one, all of it
    is calm. Inside a pond or lake (its radius and 30% more, the shapes being irregular) wins over a creek running through it; otherwise deep water
    within 5 squares of a creek or river line is flowing, and anything else (a pool in a hollow) is calm. Returns (i, j) → "calm" | "flowing" | null. */
export function waterKinds(deep, read = null) {
  const still = (read?.things?.placed ?? []).filter(p => p.kind === "lake" || p.kind === "pond");
  const line = new Set((read?.lines ?? []).filter(l => l.kind === "creek" || l.kind === "river").flatMap(l => (l.squares ?? []).map(([a, b]) => `${a},${b}`)));
  const inStill = (i, j) => still.some(p => Math.hypot(i - p.at[0], j - p.at[1]) * FT <= p.r * 1.3 + FT);
  const patchOf = new Map(), flows = [];   /* each connected patch of deep water: does a creek or river line run through it (or along its edge)? */
  const patch = (i, j) => {
    const k0 = `${i},${j}`; if (patchOf.has(k0)) return patchOf.get(k0);
    const id = flows.length; let touches = false; const todo = [[i, j]]; patchOf.set(k0, id);
    for (let n = 0; todo.length && n < 20000; n++) {
      const [x, y] = todo.pop();
      for (let b = -1; b <= 1 && !touches; b++) for (let a = -1; a <= 1; a++) if (line.has(`${x + a},${y + b}`)) { touches = true; break; }
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + a},${y + b}`; if (!patchOf.has(k) && deep(x + a, y + b)) { patchOf.set(k, id); todo.push([x + a, y + b]); } }
    }
    flows.push(touches); return id;
  };
  return (i, j) => !deep(i, j) ? null : inStill(i, j) || !line.size || !flows[patch(i, j)] ? "calm" : "flowing";
}
/** The water under a creature's footprint at [x, y]: with `any` false (swimming, the packet, the sink note), null unless every square of it is deep
    water; with `any` true (is there water to swim in at all), null only when none of it is. "flowing" if any deep square of it flows. */
export function waterUnder(at, size, kind, any = false) {
  let out = null, dry = false;
  for (const [i, j] of footprintAt(at, size)) { const k = kind(i, j); if (!k) { dry = true; continue; } if (k === "flowing" || !out) out = k === "flowing" ? "flowing" : out ?? "calm"; }
  return dry && !any ? null : out;
}

/** How tall a tree on an encounter map is, in feet, for climbing it (Rhea, 2026-11-08: "height by size"). Survey Sheet's read gives each tree's trunk
    radius in feet, not its height, so this is Angel's guess, from the trunk: 10 ft plus 8 ft per foot of trunk radius, in 5-ft steps, at least 10 and
    at most 40 (a birch about 15 ft, an oak or pine 20 to 25, the biggest dark trees 30 to 35). A dead tree keeps its height. */
export function treeTop(trunk = 1) {
  const t = Math.max(0, Number(trunk) || 0);
  return Math.max(2 * FT, Math.min(8 * FT, FT * Math.round((10 + 8 * t) / FT)));
}
/** How far a Climb action goes without a climb Speed (Player Core Climb, Actions ID 2374): up to 5 ft, plus 5 ft for every 20 ft of land Speed above 20
    once the land Speed is 40 or more; a critical success adds 5 ft. degree: 0 critical failure, 1 failure, 2 success, 3 critical success; no
    progress below a success (and a critical failure falls). */
export function climbDistance(landSpeed = 25, degree = 2) {
  if (degree < 2) return 0;
  const fast = landSpeed >= 40 ? FT * Math.floor((landSpeed - 20) / 20) : 0;
  return FT + fast + (degree >= 3 ? FT : 0);
}
/** The trees a creature can climb from where it stands: a tree whose trunk square is under its footprint at [x, y] or next to it (diagonals too), so
    it can put its hands on the trunk. trees: [{ at: [i, j], top }]. Tallest first, then nearest the footprint's top-left. */
export function treesBeside(at, size = 1, trees = []) {
  if (!Array.isArray(at)) return [];
  const [x, y] = at, n = Math.max(1, size);
  return trees.filter(t => Array.isArray(t?.at) && t.at[0] >= x - 1 && t.at[0] <= x + n && t.at[1] >= y - 1 && t.at[1] <= y + n)
    .sort((a, b) => (b.top - a.top) || (Math.abs(a.at[0] - x) + Math.abs(a.at[1] - y)) - (Math.abs(b.at[0] - x) + Math.abs(b.at[1] - y)));
}

/* ---------- burrowing (0.16.0) ---------- */
/** How far below the surface a burrowing creature is, in feet: one depth only (Angel's reading; Player Core gives none). Its token sits at -BURROW_DEPTH. */
export const BURROW_DEPTH = 5;
/** Survey Sheet's ground class for crag (land.mjs's T.crag): bare rock. */
const CRAG = 8;
/** Which squares of a Survey Sheet encounter map are rock a burrower can't dig through (Rhea, 2026-11-08: "Crag and solid features"): crag ground,
    outcrops, big boulders, standing stones, ruin walls and caves. Everything else, snow, mud and scree included, is soil. Burrow (Player Core, Actions
    ID 2310): dirt, sand or similar loose material, never rock. read: the map read ({ grids: { terrain }, things: { outcrops: [{ at, r (ft) }],
    rocks: [{ at, r, climb (big) }], stones: [{ at }], ruins: [{ from, to }], caves: [{ at }] } }). Returns a Uint8Array, 1 for rock, row by row. */
export function rockSquares(read, cols, rows) {
  const out = new Uint8Array(Math.max(0, cols * rows)), put = (i, j) => { if (i >= 0 && j >= 0 && i < cols && j < rows) out[j * cols + i] = 1; };
  if (!read) return out;
  const t = read.grids?.terrain ?? []; for (let k = 0; k < out.length; k++) if (t[k] === CRAG) out[k] = 1;
  /* round things: every square whose centre lies within the radius (in feet) of the thing's centre, the square holding it always */
  const round = (at, rft) => { if (!Array.isArray(at)) return; const r = Math.max(0, Number(rft) || 0) / FT, n = Math.ceil(r);
    for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) if ((!a && !b) || Math.hypot(a, b) <= r) put(at[0] + a, at[1] + b); };
  const th = read.things ?? {};
  for (const o of th.outcrops ?? []) round(o.at, o.r);
  for (const r of th.rocks ?? []) if (r.climb) round(r.at, r.r);
  for (const s of th.stones ?? []) round(s.at, 0);
  for (const c of th.caves ?? []) round(c.at, 2 * FT);   /* a cave mouth sits in a rock face: the face around it is rock too */
  for (const w of th.ruins ?? []) { if (!Array.isArray(w.from) || !Array.isArray(w.to)) continue;
    const n = Math.max(1, Math.max(Math.abs(w.to[0] - w.from[0]), Math.abs(w.to[1] - w.from[1])) * 2);
    for (let q = 0; q <= n; q++) put(Math.round(w.from[0] + (w.to[0] - w.from[0]) * q / n), Math.round(w.from[1] + (w.to[1] - w.from[1]) * q / n)); }
  return out;
}
/** The world as a Burrow crosses it (Player Core Burrow, Actions ID 2310; burrow Speed, Rules ID 2348): only through soil (soil(i, j)), where surface
    terrain costs nothing more (it digs under it); trunks, walls and rock stop it; no creature's space blocks it below ground. The square it comes up on
    is checked for creatures by the glue. */
export const burrowWorld = (w, soil) => ({ ...w, terrain: (i, j) => soil(i, j) ? 0 : null, creature: () => null, rock: true });
/* ---------- Earth Glide (0.17.0; Rhea, 2026-11-09: "Absolutely") ---------- */
const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const segsCross = (px, py, qx, qy, w) => { const d1 = orient(w.ax, w.ay, w.bx, w.by, px, py), d2 = orient(w.ax, w.ay, w.bx, w.by, qx, qy), d3 = orient(px, py, qx, qy, w.ax, w.ay), d4 = orient(px, py, qx, qy, w.bx, w.by); return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0); };
/** The squares a set of walls (in squares, { ax, ay, bx, by }) pass through, marked the way the map model marks a blocked square: a wall touching the
    inner part of the square (0.15 to 0.85). Returns a flat array, index j * cols + i. */
export function wallSquares(walls, cols, rows) {
  const out = new Array(cols * rows).fill(false);
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor(Math.min(w.ax, w.bx)) - 1), i1 = Math.min(cols - 1, Math.floor(Math.max(w.ax, w.bx)) + 1), j0 = Math.max(0, Math.floor(Math.min(w.ay, w.by)) - 1), j1 = Math.min(rows - 1, Math.floor(Math.max(w.ay, w.by)) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (out[j * cols + i]) continue; const x0 = i + .15, y0 = j + .15, x1 = i + .85, y1 = j + .85, inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (inside(w.ax, w.ay) || inside(w.bx, w.by) || [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].some(([a, b, c, d]) => segsCross(a, b, c, d, w))) out[j * cols + i] = true; }
  }
  return out;
}
/** Whether a creature (`size` squares across) moving between two squares (top-left squares) crosses any of the walls: the line between its centres,
    nudged off the grid lines (a Large creature's centre sits on one, where a line only touching a wall counted on one side; 0.17.0 review), or a wall
    through the inside of its footprint where it ends (a big creature straddling a wall that runs between its squares). */
export const crossesWalls = (walls, a, b, size = 1) => { const e = 1e-3, x0 = b[0] + .1, y0 = b[1] + .1, x1 = b[0] + size - .1, y1 = b[1] + size - .1;
  return walls.some(w => segsCross(a[0] + size / 2 + e, a[1] + size / 2 + 2 * e, b[0] + size / 2 + e, b[1] + size / 2 + 2 * e, w)
    || (size > 1 && [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].some(([p, q, r, t]) => segsCross(p, q, r, t, w)) ) || (size > 1 && w.ax > x0 && w.ax < x1 && w.ay > y0 && w.ay < y1)); };
/** The world as a Burrow crosses it for a creature that glides through rock and earth (Earth Glide, Rock Tunneler, Unstoppable Burrow): every square
    but deep water and squares something that isn't earthen passes through (a trunk, a door, a wall that isn't stone), and only walls that aren't earthen
    stand in its way; creatures don't (it is below them). `hard(i, j)` and `wallBetween(a, b)` come from the glue, which knows what each wall is made of.
    Where it comes up is checked by the glue (open floor, no one there). */
export const glideWorld = (w, isDeep, hard, wallBetween) => ({ ...w, terrain: (i, j) => isDeep(i, j) ? null : 0, blocked: hard, wall: wallBetween, creature: () => null, rock: true });
/** What going down or coming up adds to a Burrow, in feet: 5 ft each way (Angel's reading: one depth, 5 ft below). from, to: below at the start and
    the end; across: whether it moves across squares at all (a Burrow that starts and ends at the surface dips down and comes up). */
export function burrowVertical(from, to, across) {
  if (from !== to) return BURROW_DEPTH;
  return !from && across ? 2 * BURROW_DEPTH : 0;
}

/** A route's failure in words, for the thinker and the card. Squares stay squares, which is what the thinker plans with. */
export function routeWords(r, to, speed, kind = "stride") {
  const sq = `[${to[0]}, ${to[1]}]`, word = { stride: "Stride", step: "Step", crawl: "Crawl", sneak: "Sneak", flee: "Flee", fly: "Fly", swim: "Swim", climb: "Climb", burrow: "Burrow" }[kind] ?? "Stride";
  switch (r.why) {
    case "same": return `it is already at ${sq}.`;
    case "off": return `${sq} is off the map.`;
    case "blocked": return `it can't stand at ${sq}: something solid is there.`;
    case "terrain": return kind === "burrow" ? `${sq}, or ground on the way there, is rock or deep water, and a Burrow goes only through soil.` : `${sq} is deep water: it would have to Swim (a "swim" step), which a ${word} isn't.`;
    case "occupied": return `another creature is at ${sq}.`;
    case "notNext": return `[${to[0]}, ${to[1]}] isn't next to it: a ${word} moves one square (5 ft).`;
    case "difficult": return kind === "crawl" ? `[${to[0]}, ${to[1]}] is difficult terrain, which would take 10 ft, and a Crawl moves only 5 ft.` : `[${to[0]}, ${to[1]}] is difficult terrain, and a Step can't go into difficult terrain.`;
    case "wall": return `a wall is between it and [${to[0]}, ${to[1]}].`;
    case "far": { const what = kind === "fly" ? "fly Speed" : kind === "swim" ? "swimming distance" : kind === "burrow" ? "burrow Speed" : "Speed"; if (kind === "swim" && r.cost == null) return `${sq} is farther than one Swim can go.`; return r.cost == null ? `${sq} is far beyond its ${what} of ${speed} ft.` : `getting to ${sq} takes ${r.cost} ft, more than its ${what} of ${speed} ft.`; }
    default: return `there's no way to ${sq} from where it is.`;
  }
}
/** Which way a move goes, in words, for the card. */
export function headingOf(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1]; if (!dx && !dy) return "";
  const ns = Math.abs(dy) * 2 >= Math.abs(dx) ? (dy < 0 ? "north" : "south") : "", ew = Math.abs(dx) * 2 >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew;
}

/** Whether a wall or other solid feature runs through any square next to a creature (the ring around its footprint), for Take Cover's "near a feature that
    allows you to take cover". segments: [[x1, y1, x2, y2]] in squares from the map's corner (a square's corner is a whole number), already narrowed by the
    glue to what a creature could take cover behind. A wall on the ring's outer edge counts; one that only touches its outer corner doesn't. */
export function featureNear([x, y], size = 1, segments = []) {
  const e = 1e-6, lo = [x - 1 - e, y - 1 - e], hi = [x + size + 1 + e, y + size + 1 + e];
  return segments.some(([x1, y1, x2, y2]) => {
    /* Liang-Barsky: does the segment pass through the box? */
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 - lo[0]], [dx, hi[0] - x1], [-dy, y1 - lo[1]], [dy, hi[1] - y1]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9 && Math.hypot(dx, dy) * (t1 - t0) > 1e-3;   /* more than a touch */
  });
}
