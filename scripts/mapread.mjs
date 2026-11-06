/* The per-square map model: what each square offers a creature. Input is gathered by the glue from the Survey Sheet read and the
   scene's documents; the documents win for anything a GM can edit. Pure: no Foundry globals. Geometry is in squares, y down. */
export const SIZE_SQUARES = { tiny: 1, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };
const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
const crosses = (px, py, qx, qy, w) => { const d1 = orient(w.ax, w.ay, w.bx, w.by, px, py), d2 = orient(w.ax, w.ay, w.bx, w.by, qx, qy), d3 = orient(px, py, qx, qy, w.ax, w.ay), d4 = orient(px, py, qx, qy, w.bx, w.by); return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0); };   /* half-open, so a line through a corner of a ring still counts once */
/* a one-way wall only counts for an origin on its blocking side. Survey Sheet's rings run clockwise on screen with dir LEFT, so a
   point outside them has a negative cross product: they stop entry, and a sight line through one counts once. */
const facing = (w, px, py) => w.dir === 0 || (w.dir === 1 ? orient(w.ax, w.ay, w.bx, w.by, px, py) < 0 : orient(w.ax, w.ay, w.bx, w.by, px, py) > 0);
const segBox = (w, x0, y0, x1, y1) => { const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1; if (inside(w.ax, w.ay) || inside(w.bx, w.by)) return true;
  return [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].some(([a, b, c, d]) => crosses(a, b, c, d, w)); };

/** walls: [{ ax, ay, bx, by, move: bool, sight: 0 none | 1 limited | 2 blocks, dir: 0 | 1 | 2 }]; costs: per square 0/1/2; occupied: per
    square bool; entrySquares: [[i, j]] where the party is or comes in; read: the Survey Sheet read, or null for a partial model. */
export function buildModel({ cols, rows, walls = [], costs, occupied, entrySquares, entrySource = "default", entryEdge = "south", read = null }) {
  const n = cols * rows, idx = (i, j) => j * cols + i, inMap = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows;
  const buckets = Array.from({ length: n }, () => []);
  walls.forEach((w, id) => { const len = Math.hypot(w.bx - w.ax, w.by - w.ay), steps = Math.max(1, Math.ceil(len / .25)), seen = new Set();
    for (let s = 0; s <= steps; s++) { const x = w.ax + (w.bx - w.ax) * s / steps, y = w.ay + (w.by - w.ay) * s / steps, ci = Math.floor(x), cj = Math.floor(y);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = ci + a, j = cj + b; if (!inMap(i, j)) continue; const k = idx(i, j); if (!seen.has(k)) { seen.add(k); buckets[k].push(id); } } } });
  /* the walls near a straight line */
  const along = (px, py, qx, qy) => { const out = new Set(), len = Math.hypot(qx - px, qy - py), steps = Math.max(1, Math.ceil(len / .5));
    for (let s = 0; s <= steps; s++) { const i = Math.floor(px + (qx - px) * s / steps), j = Math.floor(py + (qy - py) * s / steps); if (inMap(i, j)) for (const id of buckets[idx(i, j)]) out.add(id); } return out; };
  /** can p see q? past one limited wall yes, past two no. */
  const sees = (p, q) => { let limited = 0; for (const id of along(p[0], p[1], q[0], q[1])) { const w = walls[id]; if (!w.sight || !crosses(p[0], p[1], q[0], q[1], w) || !facing(w, p[0], p[1])) continue; if (w.sight === 2 || ++limited >= 2) return false; } return true; };
  const walkBlocked = (p, q) => { for (const id of along(p[0], p[1], q[0], q[1])) { const w = walls[id]; if (w.move && crosses(p[0], p[1], q[0], q[1], w) && facing(w, p[0], p[1])) return true; } return false; };
  const centre = (i, j) => [i + .5, j + .5];

  const blocked = new Array(n).fill(false), cover = new Array(n).fill(0), g = read?.grids ?? null;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = idx(i, j);
    for (const id of buckets[k]) if (walls[id].move && segBox(walls[id], i + .15, j + .15, i + .85, j + .85)) { blocked[k] = true; break; }
    let c = (g ? g.brush[k] * .6 + g.canopy[k] * .1 : 0);
    for (const id of buckets[k]) { const w = walls[id]; if (!w.sight) continue; const mx = (w.ax + w.bx) / 2 - (i + .5), my = (w.ay + w.by) / 2 - (j + .5), d = Math.hypot(mx, my); if (d < 2) c += (w.sight === 2 ? .12 : .06) * (d < 1 ? 1 : .5); }
    cover[k] = c; }
  for (const r of read?.things?.rocks ?? []) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = r.at[0] + a, j = r.at[1] + b; if (inMap(i, j)) cover[idx(i, j)] += a || b ? .1 : .25; }
  for (let k = 0; k < n; k++) cover[k] = Math.min(1, +cover[k].toFixed(3));

  /* what the party sees from where it starts */
  const samples = entrySamples(entrySquares, cols, rows).map(([i, j]) => centre(i, j)), exposure = new Array(n).fill(0);
  if (samples.length) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const c = centre(i, j); let hit = 0; for (const s of samples) if (sees(s, c)) hit++; exposure[idx(i, j)] = +(hit / samples.length).toFixed(3); }

  /* walking cost in feet from the entry: diagonals count half as much again, as the 5-10 rule averages out */
  const approach = new Array(n).fill(Infinity), heap = [];
  const push = (d, k) => { heap.push([d, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const a = 2 * c + 1, b = a + 1; let m = c; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  for (const [i, j] of entrySquares) if (inMap(i, j)) { approach[idx(i, j)] = 0; push(0, idx(i, j)); }
  while (heap.length) { const [d, k] = pop(); if (d > approach[k]) continue; const i = k % cols, j = Math.floor(k / cols);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!a && !b) continue; const x = i + a, y = j + b; if (!inMap(x, y)) continue; const m = idx(x, y); if (blocked[m]) continue;
      const step = 5 * (1 + (costs[m] ?? 0)) * (a && b ? 1.5 : 1), nd = d + step; if (nd < approach[m] && !walkBlocked(centre(i, j), centre(x, y))) { approach[m] = nd; push(nd, m); } } }

  const fits = (i, j, size = 1, { swim = false, taken = null } = {}) => { for (let b = 0; b < size; b++) for (let a = 0; a < size; a++) { const x = i + a, y = j + b; if (!inMap(x, y)) return false; const k = idx(x, y); if (blocked[k] || occupied[k] || taken?.has(k) || (costs[k] === 2 && !swim)) return false; } return true; };
  return { cols, rows, idx, inMap, centre, sees, walkBlocked, costs, occupied, blocked, cover, exposure, approach, fits, anchors: anchorsOf(read), partial: !read, entry: { squares: entrySquares, source: entrySource, edge: entryEdge }, wallCount: walls.length };
}
/* a few squares around where the party starts, so "in view" isn't judged from one point */
export function entrySamples(squares, cols, rows) {
  if (squares.length > 1) return squares;
  const [[i, j]] = squares.length ? squares : [[-1, -1]]; if (i < 0) return [];
  return [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].map(([a, b]) => [i + a, j + b]).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows);
}
function anchorsOf(read) {
  if (!read) return []; const t = read.things, out = [];
  for (const q of t.camps ?? []) out.push({ kind: "camp", at: q.at });
  for (const q of t.caves ?? []) out.push({ kind: "cave", at: q.at });
  for (const q of t.fallen ?? []) out.push({ kind: "fallen", at: q.at });
  for (const q of t.placed ?? []) if (!["camp", "cave", "fallen"].includes(q.kind)) out.push({ kind: q.kind, at: q.at });
  for (const l of read.lines ?? []) if (l.squares.length) out.push({ kind: l.kind === "road" || l.kind === "track" ? "road" : "water", at: l.squares[Math.floor(l.squares.length / 2)], squares: l.squares });
  return out;
}
/** A short plain description of a map, for whoever writes the brief. No campaign names: the read has none. */
export function summarise(model, read) {
  const n = model.cols * model.rows, mean = a => +(a.reduce((x, y) => x + y, 0) / n).toFixed(2), count = v => model.costs.filter(c => c === v).length;
  const codes = read ? Object.fromEntries(Object.entries(read.terrainCodes).map(([k, v]) => [v, k])) : {}, mix = {};
  if (read) for (const t of read.grids.terrain) { const k = codes[t] ?? t; mix[k] = (mix[k] ?? 0) + 1; }
  return { partial: model.partial, cols: model.cols, rows: model.rows, entry: model.entry, terrain: Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, +(v / n).toFixed(2)])), difficult: count(1), greaterDifficult: count(2), blocked: model.blocked.filter(Boolean).length, meanCover: mean(model.cover), canopy: read ? mean(read.grids.canopy) : null, elevation: read ? [Math.min(...read.grids.elev), Math.max(...read.grids.elev)] : null, when: read?.when ?? null, things: read ? Object.fromEntries(Object.entries(read.things).map(([k, v]) => [k, v.length])) : {}, anchors: model.anchors.map(a => ({ kind: a.kind, at: a.at })), notes: read?.notes ?? "" };
}
