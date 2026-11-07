/* Moving a monster: the distance between two creatures, and the route and cost of a Stride. Pure: no Foundry globals. A creature's square is its
   top-left square, [x, y] with y down, and its size is how many squares a side (1, 2 for Large, ...). Foundry's own measurement has the last word on
   what a route costs (fight.mjs measures every route this finds); this file finds the route, because Foundry has no pathfinding of its own. */
export const FT = 5;
const SQUARE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** PF2e's distance between two creatures on a square grid at the same height, as `measureDistanceCuboid` works it out (PF2e 8.7.0): the squares between
    their edges, every second diagonal counting double. With reach 10 it takes 5 ft off when the line has more than one diagonal, which is the rule that
    10-foot reach reaches two squares diagonally. a, b: { x, y, size } in squares. Checked against `distanceTo` live for Medium and Large (2026-11-07). */
export function distanceBetween(a, b, { reach = null } = {}) {
  const sa = a.size ?? 1, sb = b.size ?? 1;
  const overX = b.x < a.x + sa && b.x + sb > a.x, overY = b.y < a.y + sa && b.y + sb > a.y;
  if (overX && overY) return 0;
  const dx = Math.max(b.x - (a.x + sa), a.x - (b.x + sb), 0) + 1, dy = Math.max(b.y - (a.y + sa), a.y - (b.y + sb), 0) + 1;
  const lo = Math.min(dx, dy), hi = Math.max(dx, dy), off = lo > 1 && reach === 10 ? 1 : 0;
  return (Math.floor(lo * 1.5 + (hi - lo)) - off) * FT;
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

/** The cheapest route for a Stride from `from` to `to`, counting as PF2e does: every other diagonal 10 ft, each difficult square entered 5 ft more,
    greater 10 more. world: { cols, rows, terrain(i, j) → 0 | 1 | 2, or null where a Stride can't go (deep water); blocked(i, j) → a trunk or rock in the
    square; creature(i, j) → null | "ally" | "enemy" (anyone else's space); wall(a, b) → a wall between two places it could stand }.
    budget: feet to look within. Returns { ok: true, route: [[x, y], ...from first to last], cost } or { ok: false, why, cost? }, why being
    "same", "off", "blocked", "terrain", "occupied" (the end square), "far" (cost is what it would take) or "noway". */
export function findRoute({ from, to, size = 1, budget = 200 }, w) {
  if (from[0] === to[0] && from[1] === to[1]) return { ok: false, why: "same" };
  const end = standProblem(to, size, w); if (end) return { ok: false, why: end };
  /* Dijkstra over (square, whether an odd number of diagonals has been taken): the 5-10 rule makes the cost of the next diagonal depend on it */
  const best = new Map(), prev = new Map(), heap = [];
  const push = (c, s) => { heap.push([c, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const start = `${key(...from)}|0`; best.set(start, 0); push(0, start);
  const limit = Math.max(budget, 0) * 4 + 60;   /* look past the budget, so "too far" can say how far */
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
      if (nc > limit) continue;
      const ns = `${key(nx, ny)}|${nodd}`; if (nc < (best.get(ns) ?? Infinity)) { best.set(ns, nc); prev.set(ns, s); push(nc, ns); }
    }
  }
  return { ok: false, why: "noway" };
}

/** A route's failure in words, for the thinker and the card. Squares stay squares, which is what the thinker plans with. */
export function routeWords(r, to, speed) {
  const sq = `[${to[0]}, ${to[1]}]`;
  switch (r.why) {
    case "same": return `it is already at ${sq}.`;
    case "off": return `${sq} is off the map.`;
    case "blocked": return `it can't stand at ${sq}: something solid is there.`;
    case "terrain": return `${sq} is deep water: it would have to Swim, which a Stride isn't.`;
    case "occupied": return `another creature is at ${sq}.`;
    case "far": return `getting to ${sq} takes ${r.cost} ft, more than its Speed of ${speed} ft.`;
    default: return `there's no way to ${sq} from where it is.`;
  }
}
/** Which way a move goes, in words, for the card. */
export function headingOf(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1]; if (!dx && !dy) return "";
  const ns = Math.abs(dy) * 2 >= Math.abs(dx) ? (dy < 0 ? "north" : "south") : "", ew = Math.abs(dx) * 2 >= Math.abs(dy) ? (dx < 0 ? "west" : "east") : "";
  return ns && ew ? `${ns}-${ew}` : ns || ew;
}
