/* Moving a monster: the distance between two creatures, and the route and cost of a Stride, a Step or a Crawl. Pure: no Foundry globals. A creature's square is its
   top-left square, [x, y] with y down, and its size is how many squares a side (1, 2 for Large, ...). Foundry's own measurement has the last word on
   what a route costs (fight.mjs measures every route this finds); this file finds the route, because Foundry has no pathfinding of its own. */
export const FT = 5;
const SQUARE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** PF2e's distance between two creatures on a square grid, as `measureDistanceCuboid` works it out (PF2e 8.7.0): the squares between their edges,
    every second diagonal counting double. At different heights the vertical gap counts as a third axis (elevation in feet, depth in squares, which is
    the token's own depth, its size by default); at the same height it doesn't. With reach 10 it takes 5 ft off when the line has more than one
    diagonal, which is the rule that 10-foot reach reaches two squares diagonally. a, b: { x, y, size, elev, depth } in squares (elev in feet).
    Checked against `distanceTo` live for Medium and Large at one height (2026-11-07). */
export function distanceBetween(a, b, { reach = null } = {}) {
  const sa = a.size ?? 1, sb = b.size ?? 1;
  const overX = b.x < a.x + sa && b.x + sb > a.x, overY = b.y < a.y + sa && b.y + sb > a.y;
  const flat = overX && overY, dx = flat ? 0 : Math.max(b.x - (a.x + sa), a.x - (b.x + sb), 0) + 1, dy = flat ? 0 : Math.max(b.y - (a.y + sa), a.y - (b.y + sb), 0) + 1;
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
      if (passProblem([nx, ny], size, w)) continue;
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

/** A route's failure in words, for the thinker and the card. Squares stay squares, which is what the thinker plans with. */
export function routeWords(r, to, speed, kind = "stride") {
  const sq = `[${to[0]}, ${to[1]}]`, word = { stride: "Stride", step: "Step", crawl: "Crawl" }[kind] ?? "Stride";
  switch (r.why) {
    case "same": return `it is already at ${sq}.`;
    case "off": return `${sq} is off the map.`;
    case "blocked": return `it can't stand at ${sq}: something solid is there.`;
    case "terrain": return `${sq} is deep water: it would have to Swim, which a ${word} isn't.`;
    case "occupied": return `another creature is at ${sq}.`;
    case "notNext": return `[${to[0]}, ${to[1]}] isn't next to it: a ${word} moves one square (5 ft).`;
    case "difficult": return kind === "crawl" ? `[${to[0]}, ${to[1]}] is difficult terrain, which would take 10 ft, and a Crawl moves only 5 ft.` : `[${to[0]}, ${to[1]}] is difficult terrain, and a Step can't go into difficult terrain.`;
    case "wall": return `a wall is between it and [${to[0]}, ${to[1]}].`;
    case "far": return r.cost == null ? `${sq} is far beyond its Speed of ${speed} ft.` : `getting to ${sq} takes ${r.cost} ft, more than its Speed of ${speed} ft.`;
    default: return `there's no way to ${sq} from where it is.`;
  }
}
/** Which way a move goes, in words, for the card. */
export function headingOf(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1]; if (!dx && !dy) return "";
  const ns = Math.abs(dy) * 2 >= Math.abs(dx) ? (dy < 0 ? "north" : "south") : "", ew = Math.abs(dx) * 2 >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew;
}
