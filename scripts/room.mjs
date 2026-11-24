/* Picking a room (0.42.0, F-6, Rhea 2026-11-24: "Angel suggests, I can change"). A room is the space bounded by walls and doors (mapread.mjs's
   `roomOf`). At Preview the builder picks one by the map's numbers at once, asks Angel (the bridge's API worker, which looks at a picture of the map
   with the rooms numbered and at the brief), and moves to Angel's pick when it comes, unless Rhea has clicked a room of her own. The layout then
   places every creature inside the chosen room. Pure: runs in Node for the unit tests. */
import { MOOD_WINDOW } from "./place.mjs";

/** A room needs this many squares to be offered: smaller pockets (the inside of a ring of rocks, a corner cut off by a wall) are no room. */
export const MIN_ROOM = 4;
/** How long Preview waits for Angel's pick before saying Angel didn't answer (the builder's own pick stays meanwhile). */
export const ROOM_WAIT_S = 90;
/** An ask older than this is no longer offered to the worker. */
export const ROOM_ASK_TTL_S = 300;

const windowScore = (d, [lo, hi]) => d < lo ? Math.max(-1, 1 - (lo - d) / Math.max(10, lo) * 2) : d > hi ? Math.max(-1, 1 - (d - hi) / 40) : 1;

/** The rooms worth offering (at least MIN_ROOM squares, and a door or a way in), numbered from 1 in the map's reading order, with what a picker weighs: size, free squares, walking feet from the
    party's way in (null: no way in), the share of it in the party's first view, what is in it, its doors, the party in it. */
export function roomList(model) {
  const out = [], party = new Set(model.entry.squares.filter(([i, j]) => model.inMap(i, j)).map(([i, j]) => model.roomOf[model.idx(i, j)]));
  for (const r of model.rooms ?? []) {
    if (r.squares.length < MIN_ROOM) continue;
    let i0 = Infinity, j0 = Infinity, i1 = -1, j1 = -1, sx = 0, sy = 0, seen = 0, near = Infinity, free = 0, rough = 0, cover = 0;
    for (const k of r.squares) { const i = k % model.cols, j = Math.floor(k / model.cols); i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j); sx += i; sy += j;
      seen += model.exposure[k]; if (Number.isFinite(model.approach[k])) near = Math.min(near, model.approach[k]); if (!model.occupied[k]) free++; if (model.costs[k]) rough++; cover += model.cover[k]; }
    /* no door and no way in: the solid rock around a dungeon's rooms, or the space outside a building, is no room (live test build 1) */
    if (!Number.isFinite(near) && !(r.doors ?? 0)) continue;
    const n = r.squares.length, mx = sx / n, my = sy / n;
    const centre = r.squares.map(k => [k % model.cols, Math.floor(k / model.cols)]).sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0];
    const inside = new Set(r.squares), things = [...new Set(model.anchors.filter(a => (a.squares ?? [a.at]).some(([i, j]) => model.inMap(i, j) && inside.has(model.idx(i, j)))).map(a => a.kind))];
    out.push({ n: out.length + 1, id: r.id, size: n, free, box: [i0, j0, i1, j1], centre, near: Number.isFinite(near) ? Math.round(near) : null, seen: +(seen / n).toFixed(2), rough: +(rough / n).toFixed(2), cover: +(cover / n).toFixed(2), things, doors: r.doors ?? 0, party: party.has(r.id) });
  }
  return out;
}
/** Is there a choice to make? Two rooms or more; a map with one open space (most outdoor maps) has none. */
export const offersRooms = list => list.length >= 2;
/** Squares the creatures need: one each, a large one its whole footprint. creatures: the expanded list ({ n }). */
export const roomNeed = creatures => creatures.reduce((a, c) => a + (c.n ?? 1) ** 2, 0);

/** The builder's own pick by the numbers, at once, before Angel's comes: { n, why } or null. creatures: the expanded list ({ n, role, state, anchor });
    mood: the brief's. A room the party is in, a room nobody can walk to and a room too small for them all come last. */
export function suggestRoom(list, creatures, mood = "ambush") {
  if (!offersRooms(list)) return null;
  const need = roomNeed(creatures), win = MOOD_WINDOW[mood] ?? MOOD_WINDOW.default, hidden = creatures.filter(c => c.state !== "alert").length > creatures.length / 2;
  const wantThing = new Set(creatures.map(c => c.anchor).filter(Boolean)), lairish = mood === "lair" || creatures.some(c => c.role === "guard");
  const score = r => {
    let s = 0;
    if (r.party) s -= 6; if (r.near == null) s -= 4; if (r.free < need) s -= 5;
    if (r.things.some(t => wantThing.has(t))) s += 3; else if (lairish && r.things.some(t => ["camp", "cave", "ruins", "fallen"].includes(t))) s += 2.5;
    if (r.near != null) s += windowScore(r.near, win) * 2;
    s += hidden ? (1 - r.seen) * 1.5 : r.seen * .3;
    s += Math.min(1, r.free / Math.max(1, need * 3)) * .8;
    return s;
  };
  const best = [...list].sort((a, b) => score(b) - score(a) || a.n - b.n)[0];
  return { n: best.n, why: roomWhy(best, creatures, need, wantThing) };
}
/** One line on why a room suits them, from its numbers. */
export function roomWhy(r, creatures, need = roomNeed(creatures), wantThing = new Set()) {
  const parts = [];
  const thing = r.things.find(t => wantThing.has(t)) ?? r.things.find(t => ["camp", "cave", "ruins", "fallen"].includes(t));
  if (thing) parts.push(`the ${thing} is in it`);
  if (r.party) parts.push("the party starts in it");
  else if (r.near == null) parts.push("nothing walks into it from where the party comes in");
  else parts.push(`about ${r.near} ft of walking from where the party comes in`);
  if (!r.party) parts.push(r.seen <= .05 ? "out of the party's first view" : r.seen < .5 ? "mostly out of the party's first view" : "in the party's first view");
  parts.push(r.free >= need ? `room for all ${creatures.length}` : `only ${r.free} free squares for ${need}`);
  const s = parts.join(", ");
  return s[0].toUpperCase() + s.slice(1) + ".";
}

/* ---------- Angel's pick: the ask, the prompt and the answer ---------- */
export const ROOM_PROMPT = `You help a Pathfinder 2e game master build encounters in Foundry VTT. A builder is about to place a group of creatures on a map that has several rooms (spaces bounded by walls and doors) and asks you which room they start in.

You get the brief (who the creatures are, how many, how each starts: alert, hidden, unaware or asleep; their role; the scene, what they are doing here and want; the mood), the rooms with their numbers (size in squares, free squares, walking feet from where the party comes in, the share of the room in the party's first view, what is in it such as a camp or water, doors, whether the party starts in it), the builder's own pick by the numbers, and a picture of the whole map: the map itself, walls in red, doors in orange, each room's number in a circle, and where the party comes in in blue.

Pick the room where these creatures would really be, given what they are doing: a lair's sleepers in its back room, guards by what they guard, a patrol in a passage, an ambush where the party must pass. Never the party's own room unless nothing else fits, never a room too small for them all, and keep creatures that aren't alert out of the party's first view. The builder then places each creature inside your room; you don't place them.

Answer with the JSON alone: {"room": <its number>, "why": "<one sentence for the GM, at most 25 words, with no creature called it>"}.`;

/** The ask the worker answers: the brief in short and the rooms. brief: the clean brief; list: roomList; pick: suggestRoom's. */
export function roomAsk(brief, list, pick, creatures) {
  const cut = (t, n) => t ? String(t).slice(0, n) : null;
  const who = brief.creatures.map(c => ({ name: c.name, count: c.count, role: c.role, starts: c.state ?? "alert", strength: c.adjust || "normal", ...(c.anchor ? { keepsBy: c.anchor } : {}) }));
  return { brief: { name: cut(brief.name, 120), scene: cut(brief.beat, 500), doing: cut(brief.doing, 500), want: cut(brief.want, 300), why: cut(brief.why, 300), mood: brief.mood, creatures: who, squaresNeeded: roomNeed(creatures) },
    rooms: list.map(r => ({ room: r.n, size: r.size, free: r.free, walkFt: r.near, inFirstView: r.seen, roughGround: r.rough, cover: r.cover, things: r.things, doors: r.doors, partyStartsHere: r.party })),
    builderPick: pick };
}
/** Angel's answer made safe: { n, why } or { error }. */
export function cleanRoomAnswer(a, list) {
  const o = typeof a === "string" ? (() => { try { return JSON.parse(a); } catch { const i = a.indexOf("{"), j = a.lastIndexOf("}"); try { return i >= 0 && j > i ? JSON.parse(a.slice(i, j + 1)) : null; } catch { return null; } } })() : a;
  if (!o || typeof o !== "object") return { error: 'An answer is {"room": <number>, "why": "<one sentence>"}.' };
  const n = Number(o.room); if (!Number.isInteger(n) || !list.some(r => r.n === n)) return { error: `There is no room ${o.room}: the rooms are ${list.map(r => r.n).join(", ")}.` };
  const why = String(o.why ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return { n, why: why || "Angel gave no reason." };
}

/** A room's squares as few rectangles ([i, j, w, h] in squares): runs along each row, joined with the same run in the rows below. For the outline. */
export function roomRects(squares, cols) {
  const rows = new Map(); for (const k of squares) { const i = k % cols, j = Math.floor(k / cols); if (!rows.has(j)) rows.set(j, []); rows.get(j).push(i); }
  const runs = [];
  for (const [j, is] of [...rows].sort((a, b) => a[0] - b[0])) { is.sort((a, b) => a - b); let s = is[0], p = is[0]; for (const i of [...is.slice(1), null]) { if (i === p + 1) { p = i; continue; } runs.push([s, j, p - s + 1, 1]); if (i != null) { s = i; p = i; } } }
  const open = new Map(), out = [];
  for (const r of runs) { const key = `${r[0]},${r[2]}`, prev = open.get(key); if (prev && prev[1] + prev[3] === r[1]) { prev[3]++; continue; } const nr = [...r]; open.set(key, nr); out.push(nr); }
  return out;
}
