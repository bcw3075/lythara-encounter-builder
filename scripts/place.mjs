/* Where each creature starts. Scores every square for each role and places groups together. Pure and seeded: the same model, creatures and
   seed give the same layout; "Try another layout" only changes the seed. Numbers here are starting points to judge on samples. */
const hashf = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/* feet of walking from the party's entry: first contact by about round 2 */
export const MOOD_WINDOW = { ambush: [25, 55], chase: [30, 60], standoff: [50, 90], patrol: [60, 110], lair: [30, 200], default: [40, 80] };
const ORDER = { guard: 0, brute: 1, ambusher: 2, beast: 3, ranged: 4, caster: 5 };
const windowScore = (d, [lo, hi]) => d < lo ? Math.max(-1, 1 - (lo - d) / Math.max(10, lo) * 2) : d > hi ? Math.max(-1, 1 - (d - hi) / 40) : 1;

export function layout(model, creatures, { seed = 1, mood = "ambush", extraAnchors = [] } = {}) {
  const { cols, rows, idx, centre, approach, exposure, cover, costs, fits, sees } = model;
  const win = MOOD_WINDOW[mood] ?? MOOD_WINDOW.default, warnings = [], placed = [], taken = new Set();
  const anchors = [...model.anchors, ...extraAnchors], entry = model.entry.squares;
  const ex = entry.length ? entry.reduce((a, s) => a + s[0], 0) / entry.length + .5 : cols / 2, ey = entry.length ? entry.reduce((a, s) => a + s[1], 0) / entry.length + .5 : rows;
  const lair = anchors.find(a => ["camp", "cave", "ruins", "fallen"].includes(a.kind)), goal = lair?.at ? [lair.at[0] + .5, lair.at[1] + .5] : [cols - ex, rows - ey];
  /* the way the party is likely to come: entry towards the anchor, or across the map */
  const pdx = goal[0] - ex, pdy = goal[1] - ey, plen = Math.hypot(pdx, pdy) || 1, ux = pdx / plen, uy = pdy / plen;
  const pathDist = (x, y) => { const t = Math.max(0, Math.min(plen, (x - ex) * ux + (y - ey) * uy)); return Math.hypot(x - (ex + ux * t), y - (ey + uy * t)); };
  const side = (x, y) => (x - ex) * uy - (y - ey) * ux;
  const engage = [ex + ux * Math.min(8, plen), ey + uy * Math.min(8, plen)];
  const groupFirst = new Map();
  const order = creatures.map((c, k) => [c, k]).sort((a, b) => (ORDER[a[0].role] ?? 9) - (ORDER[b[0].role] ?? 9) || a[1] - b[1]);
  for (const [c, cIndex] of order) {
    const n = c.n ?? 1, anchor = (c.anchor && anchors.find(a => a.kind === c.anchor)) || (c.role === "guard" || mood === "lair" ? lair : null);
    if (c.anchor && !anchors.some(a => a.kind === c.anchor)) warnings.push(`${c.label}: no ${c.anchor} on this map.`);
    if (c.role === "guard" && !anchor) warnings.push(`${c.label}: nothing on this map to guard, so it stands like a brute.`);
    const inView = c.state === "alert";
    let best = null;
    for (const strict of [true, false]) {
      for (let j = 0; j <= rows - n; j++) for (let i = 0; i <= cols - n; i++) {
        if (!fits(i, j, n, { swim: c.swim, taken })) continue;
        const k = idx(i, j), d = approach[k]; if (!Number.isFinite(d) || d < 15) continue;
        const seen = exposure[k]; if (strict && !inView && seen > 0) continue;
        const x = i + n / 2, y = j + n / 2, w = windowScore(d, win), cv = cover[k], cost = costs[k]; let s = 0;
        const first = groupFirst.get(c.group), toFirst = first ? Math.hypot(x - first[0], y - first[1]) : 0;
        const anchorDist = anchor ? Math.hypot(x - anchor.at[0] - .5, y - anchor.at[1] - .5) : 0;
        switch (anchor && c.role === "guard" ? "guard" : c.role === "guard" ? "brute" : c.role) {
          case "ambusher": { const pd = pathDist(x, y); s = cv * 2 + w * 1.5 + (pd <= 10 ? 1 - pd / 20 : -.5); break; }
          case "ranged": { s = w + (sees([x, y], engage) ? 1.5 : -1) + cv * .3; const m = Math.max(3, Math.round(Math.hypot(x - engage[0], y - engage[1]))); let rough = 0; for (let t = 1; t < m; t++) { const a = Math.floor(x + (engage[0] - x) * t / m), b = Math.floor(y + (engage[1] - y) * t / m); if (model.inMap(a, b) && costs[idx(a, b)]) rough++; } s += Math.min(.5, rough * .1); break; }
          case "caster": { const front = placed.length ? Math.max(...placed.map(p => approach[idx(p.i, p.j)]).filter(Number.isFinite)) : win[0]; s = windowScore(d, [front + 5, front + 35]) * 1.2 + cv * 1.2 + (first || placed[0] ? (sees([x, y], first ?? [placed[0].i + .5, placed[0].j + .5]) ? .5 : -.5) : 0); break; }
          case "guard": s = 2 - anchorDist * .4 + cv * .2; break;
          case "beast": { const others = placed.filter(p => p.role === "beast"), md = others.length ? Math.min(...others.map(p => Math.hypot(x - p.i - .5, y - p.j - .5))) : 6; const last = others[others.length - 1], flank = last && Math.sign(side(x, y)) !== Math.sign(side(last.i + .5, last.j + .5)) ? .6 : 0; s = w * 1.5 + (md < 3 ? -1 : md > 8 ? .2 : .5) + flank + (cost ? -.3 : 0); break; }
          default: s = w * 1.5 + (cost ? -.5 : .5) - cv * .3 - Math.max(0, d - win[0]) / 200;
        }
        if (first && c.role !== "beast") s += toFirst <= 5 ? .5 : -Math.min(1, (toFirst - 5) * .1);
        if (mood === "lair" && anchor && c.role !== "guard") s += 1.5 - Math.min(2, anchorDist * .1);
        if (c.state === "asleep") s += cv * .2;
        /* the back line stays with the group, and behind it as the party sees it; nobody starts hard against the map's edge */
        if ((c.role === "ranged" || c.role === "caster") && placed.length) { const cx = placed.reduce((a, p) => a + p.i + p.n / 2, 0) / placed.length, cy = placed.reduce((a, p) => a + p.j + p.n / 2, 0) / placed.length, along = (x - cx) * ux + (y - cy) * uy, off = Math.hypot(x - cx, y - cy); s += Math.max(-1, Math.min(.5, along * .08)) - Math.min(1.5, Math.max(0, off - 8) * .1); }
        if (i === 0 || j === 0 || i + n === cols || j + n === rows) s -= .4;
        if (!strict) s -= seen * 3;
        s += hashf(seed, k, cIndex) * .25;
        if (!best || s > best.s) best = { s, i, j, seen };
      }
      if (best) { if (!strict) warnings.push(`${c.label}: every free square is in the party's first view.`); break; }
    }
    if (!best) { warnings.push(`${c.label}: no room for it on this map.`); continue; }
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) taken.add(idx(best.i + a, best.j + b));
    if (!groupFirst.has(c.group)) groupFirst.set(c.group, [best.i + n / 2, best.j + n / 2]);
    placed.push({ key: c.key, group: c.group, role: c.role, label: c.label, n, i: best.i, j: best.j, state: c.state, approach: approach[idx(best.i, best.j)], exposure: best.seen });
  }
  placed.sort((a, b) => a.key < b.key ? -1 : 1);
  return { placed, warnings, seed };
}
/** A free square for something placed at an anchor (a cache, a note), nearest the spot first. */
export function nearestFree(model, at, n = 1, taken = null) {
  for (let r = 0; r < 12; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue; const i = at[0] + a, j = at[1] + b; if (model.fits(i, j, n, { taken })) return [i, j]; }
  return null;
}
/** Does a party square touch or sit next to a hidden monster? placed: [{ i, j, n, hidden }] */
export function hiddenNextTo(party, placed) {
  return placed.filter(m => m.hidden && party.some(([i, j]) => i >= m.i - 1 && i <= m.i + (m.n ?? 1) && j >= m.j - 1 && j <= m.j + (m.n ?? 1)));
}
