/* Spell areas (Rhea, 2026-11-07): the module places PF2e's own area for a monster's spell, works out who it catches, and refuses one that would catch an
   ally unless the plan says it means to. Pure: no Foundry globals. Squares are [x, y] map squares from the top-left; points are in squares too, so a
   corner of square [x, y] is the point [x, y] and its centre [x + 0.5, y + 0.5]. fight.mjs turns these into PF2e's Region shapes and asks Foundry which
   squares a shape covers (a square counts when its centre is inside, which is what the highlighted squares show everyone).
   Rules: Area (https://2e.aonprd.com/Rules.aspx?ID=2384). A burst starts at a corner of a square within range; a cone starts at the caster's space and
   widens to a quarter circle (orthogonal: its first square shares an edge with the space; diagonal: it touches a corner), never over the caster's own space;
   a line goes straight out from the caster, 5 ft wide; an emanation reaches out from every side of the caster's space, and the creature at its centre
   chooses whether it is affected (here: not). A creature is in an area if even one square of its space is. */

/** Area kinds the module can place. A cylinder is placed as a burst (PF2e does the same); cubes, squares, rings and walls stay with the GM. */
export const PLACEABLE = ["burst", "cylinder", "cone", "line", "emanation"];
export const placeable = area => !!area && PLACEABLE.includes(area.type) && Number(area.size) > 0;
/** How a plan aims each kind, in words the thinker reads. */
export const AIM_WORDS = {
  burst: `"at": [x, y], the grid corner it bursts from (the top-left corner of square [x, y]); it must be within the spell's range`,
  cone: `"toward": [x, y], a square it points at; it starts from the monster's own space and turns in 45° steps`,
  line: `"toward": [x, y], a square it points at; it starts from the monster's own space`,
  emanation: "nothing: it spreads from every side of the monster's own space, and the monster itself isn't affected"
};
export const aimWords = type => AIM_WORDS[type === "cylinder" ? "burst" : type] ?? null;
const DEG = 180 / Math.PI;
const snap = (deg, step) => { const v = Math.round(deg / step) * step; return ((v + 540) % 360) - 180; };
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** Where an area goes, from the plan step. me: { square, size } (size in squares); target: { square, size } of the creature a step named, when it gave
    no "at" or "toward" (an older plan, or one that just names who to catch). Returns { ok, aim } or { ok: false, reason } with the reason in words.
    aim: { type, size (feet), origin: [x, y] point, rotation (degrees, 0 = east, 90 = south), corner (a burst's grid corner), toward } */
export function aimArea(area, step = {}, me, target = null) {
  if (!placeable(area)) return { ok: false, reason: `its ${area?.size ?? "?"}-foot ${area?.type ?? "area"} isn't one the module can place.` };
  const type = area.type === "cylinder" ? "burst" : area.type, size = Number(area.size), n = me?.size ?? 1;
  if (!isPoint(me?.square)) return { ok: false, reason: "I can't tell where it stands." };
  const centre = [me.square[0] + n / 2, me.square[1] + n / 2];
  if (type === "emanation") {
    if (step.at || step.toward) return { ok: false, reason: `a ${size}-foot emanation spreads from the monster itself: leave out "at" and "toward".` };
    return { ok: true, aim: { type, size, origin: centre, rotation: 0, from: centre } };
  }
  if (type === "burst") {
    if (step.toward) return { ok: false, reason: `a burst is placed with "at" (a grid corner), not "toward".` };
    let corner = step.at ? [...step.at] : null;
    if (!corner && target?.square) {   /* aimed at a creature: the corner of its space nearest the caster */
      const t = target.square, m = target.size ?? 1, cs = [[t[0], t[1]], [t[0] + m, t[1]], [t[0], t[1] + m], [t[0] + m, t[1] + m]];
      corner = cs.sort((a, b) => Math.hypot(a[0] - centre[0], a[1] - centre[1]) - Math.hypot(b[0] - centre[0], b[1] - centre[1]))[0];
    }
    if (!corner) return { ok: false, reason: `a burst needs ${AIM_WORDS.burst}.` };
    if (!corner.every(Number.isInteger)) return { ok: false, reason: `"at" is a grid corner, two whole numbers.` };
    /* line of effect is traced from the corner moved a hair toward the caster, so a corner on a wall belongs to the caster's side of it */
    const d = Math.hypot(centre[0] - corner[0], centre[1] - corner[1]) || 1, from = [corner[0] + (centre[0] - corner[0]) / d * 1e-3, corner[1] + (centre[1] - corner[1]) / d * 1e-3];
    return { ok: true, aim: { type, size, origin: corner, rotation: 0, corner, from, centre } };
  }
  /* cone or line: a direction from the monster's centre toward a square */
  if (step.at) return { ok: false, reason: `a ${type} is aimed with "toward" (a square), not "at".` };
  const sq = step.toward ? [...step.toward] : target?.square ? [...target.square] : null, ts = step.toward ? 1 : target?.size ?? 1;
  if (!sq) return { ok: false, reason: `a ${type} needs ${AIM_WORDS[type]}.` };
  const aimAt = [sq[0] + ts / 2, sq[1] + ts / 2], dx = aimAt[0] - centre[0], dy = aimAt[1] - centre[1];
  if (sq[0] >= me.square[0] && sq[0] < me.square[0] + n && sq[1] >= me.square[1] && sq[1] < me.square[1] + n) return { ok: false, reason: `"toward" is inside the monster's own space; point it at a square outside it.` };
  /* PF2e's own placement turns a cone in 45° steps and a line in 5° steps */
  const rotation = snap(Math.atan2(dy, dx) * DEG, type === "cone" ? 45 : 5), rad = rotation / DEG, c = Math.cos(rad), s = Math.sin(rad);
  let origin;
  if (type === "cone") {   /* orthogonal: the middle of the edge it faces; diagonal: the corner it faces */
    const ox = Math.abs(c) < 1e-9 ? 0 : Math.sign(c), oy = Math.abs(s) < 1e-9 ? 0 : Math.sign(s);
    origin = [centre[0] + ox * n / 2, centre[1] + oy * n / 2];
  } else {   /* a line leaves its space where a ray from its centre does */
    const t = (n / 2) / Math.max(Math.abs(c), Math.abs(s));
    origin = [centre[0] + c * t, centre[1] + s * t];
  }
  /* a cone or line starts at the caster's edge, often on a wall along a grid line: line of effect is traced from the caster's centre, so a wall it stands against stops it */
  return { ok: true, aim: { type, size, origin: origin.map(v => Math.round(v * 1e6) / 1e6), rotation, toward: sq, from: centre } };
}
/** PF2e's Region shape for an aim, in squares (fight.mjs scales it to pixels). As PF2e's own shapeDataFromEffectArea (8.7.0): a burst is a circle, a cone
    a 90° cone, a line one square wide, an emanation one round the caster's token. me: { square, size } for an emanation's base. */
export function shapeOf(aim, me) {
  const r = aim.size / 5;
  if (aim.type === "burst") return { type: "circle", radius: r, x: aim.origin[0], y: aim.origin[1] };
  if (aim.type === "cone") return { type: "cone", angle: 90, radius: r, x: aim.origin[0], y: aim.origin[1], rotation: aim.rotation };
  if (aim.type === "line") return { type: "line", length: r, width: 1, x: aim.origin[0], y: aim.origin[1], rotation: aim.rotation };
  return { type: "emanation", radius: r, x: aim.origin[0], y: aim.origin[1], base: { type: "token", x: me.square[0], y: me.square[1], width: me.size ?? 1, height: me.size ?? 1 } };
}
/** The squares worth testing for a shape: a box round its origin, big enough for any of these shapes. */
export function squaresNear(aim, me) {
  const r = Math.ceil(aim.size / 5) + (aim.type === "emanation" ? Math.ceil((me?.size ?? 1) / 2) + 1 : 1), out = [];
  for (let x = Math.floor(aim.origin[0]) - r; x <= Math.ceil(aim.origin[0]) + r; x++) for (let y = Math.floor(aim.origin[1]) - r; y <= Math.ceil(aim.origin[1]) + r; y++) if (x >= 0 && y >= 0) out.push([x, y]);
  return out;
}
/** The squares a creature occupies. */
export const squaresOf = (square, size = 1) => { const out = []; for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) out.push([square[0] + i, square[1] + j]); return out; };

/** Whether segment a-b crosses any wall segment [[x1, y1], [x2, y2]]. Touching at the very start (an area starting at a wall's end) doesn't count. */
export function crossesWall(a, b, walls = []) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  for (const [[x1, y1], [x2, y2]] of walls) {
    const sx = x2 - x1, sy = y2 - y1, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;   /* parallel: a wall along the line doesn't stop it */
    const t = ((x1 - a[0]) * sy - (y1 - a[1]) * sx) / den, u = ((x1 - a[0]) * ry - (y1 - a[1]) * rx) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) return true;
  }
  return false;
}
/** Whether a burst's corner can be reached: line of effect from the caster's centre to it (Rules: a burst needs line of effect to its origin). */
export const burstReachable = (aim, walls = []) => aim.type !== "burst" || !crossesWall(aim.centre, aim.from, walls);
/** Who an area catches. covered: the set of "x,y" squares Foundry says the shape covers; creatures: [{ id, square, size }]; walls: solid wall segments in
    squares (line of effect: only walls that block both movement and sight, never trunks: Rhea, 2026-11-07). A creature off the grid carries `points`
    (Foundry's containment test points, in squares) and is caught if insideAt says one is in the shape, as a placed Region tests it. Otherwise it is caught if any square of its space
    is covered and has line of effect to that square's centre from aim.from (a burst's corner, nudged to the caster's side; the caster's centre for the rest). The caster isn't caught by its own emanation. */
export function caughtBy(aim, covered, creatures = [], walls = [], selfId = null, insideAt = null, originElev = 0) {
  const out = [];
  for (const c of creatures) {
    if (aim.type === "emanation" && c.id === selfId) continue;
    if (verticalGap(originElev, c) > (aim.size ?? 0)) continue;   /* height (0.13.0): a flier above the area, or a creature below a flier's area */
    /* off the grid (points, in squares): where it really is, as Foundry tests a token against a Region (insideAt), with line of effect to that point */
    const hit = c.points && insideAt ? c.points.some(p => insideAt(p) && !crossesWall(aim.from ?? aim.origin, p, walls))
      : squaresOf(c.square, c.size ?? 1).some(([x, y]) => covered.has(`${x},${y}`) && !crossesWall(aim.from ?? aim.origin, [x + 0.5, y + 0.5], walls));
    if (hit) out.push(c.id);
  }
  return out;
}
/** How far a creature is above or below an area's starting height, in feet: 0 when its height span (elev up to top) includes it. A creature with no
    height given stands on the ground. Areas are measured from their origin in every direction (a burst spreads out from its point, a cone or line
    from the caster's height), so one whose size is less than the gap misses it; the horizontal part is the map's own test. origin: a height, or an emanation's caster span
    { elev, top }. */
export function verticalGap(origin = 0, c = {}) {
  const o = typeof origin === "number" ? { elev: origin, top: origin } : { elev: Number(origin?.elev) || 0, top: origin?.top != null ? Number(origin.top) : Number(origin?.elev) || 0 };
  const bottom = Number(c.elev) || 0, top = c.top != null ? Number(c.top) : bottom;
  return Math.max(0, bottom - o.top, o.elev - top);
}
/** The allies (and the monster itself) an area would catch, as labels, so a plan can be refused naming them. labelOf(id) gives a label for a creature
    the monster knows is on its side, or null; only those can be named, so a creature the GM hid never shows up in the words. */
export function alliesCaught(ids = [], labelOf = () => null) { return ids.map(labelOf).filter(Boolean); }
