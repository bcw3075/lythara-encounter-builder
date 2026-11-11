/* What a monster can perceive, and the packet a thinker gets for its turn. Pure: no Foundry globals. The glue in fight.mjs gathers live values on the
   runner, with the fight scene open. Rules: Perception and Detection https://2e.aonprd.com/Rules.aspx?ID=2400, Light https://2e.aonprd.com/Rules.aspx?ID=2401.
   Monsters act only on this, so nothing here may carry a player's numbers: see packetOf. */
export const PACKET_SCHEMA = 2;
const ORDER = ["observed", "concealed", "hidden", "undetected", "unnoticed"];
/** The less perceptible of two states. */
export const worse = (a, b) => ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))];
const better = (a, b) => ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))];
/** Can a plan name this creature? Undetected means it has to guess a square, which isn't built. */
export const canTarget = state => state === "observed" || state === "concealed" || state === "hidden";
/** The flat check a Strike needs first: concealed DC 5, hidden DC 11. */
export const flatDC = state => state === "concealed" ? 5 : state === "hidden" ? 11 : 0;

const VISION = new Set(["vision", "low-light-vision", "darkvision", "greater-darkvision", "see-invisibility", "truesight"]);
/** A creature's senses as a list, plus hearing. PF2e lists no hearing on NPCs, yet average hearing is imprecise, with no fixed range in the rules. */
export function sensesOf(list = [], { deafened = false } = {}) {
  const out = list.map(s => ({ type: s.type, acuity: s.acuity ?? "imprecise", range: s.range ?? null })).filter(s => !(deafened && s.type === "hearing"));
  if (!deafened && !out.some(s => s.type === "hearing")) out.push({ type: "hearing", acuity: "imprecise", range: null });
  return out;
}
/** The light on a square: the scene's level, by PF2e's thresholds (1/4 and 3/4), raised by any light source covering it. A darkness source covering it wins. */
export function lightAt({ sceneLevel = 1, sources = [] } = {}) {
  if (sources.some(s => s.darkness)) return "dark";
  if (sources.some(s => s.reach === "bright") || sceneLevel >= .75) return "bright";
  return sources.some(s => s.reach === "dim") || sceneLevel > .25 ? "dim" : "dark";
}
/** How one creature perceives another. o: { senses, blinded, dazzled, sees (no wall stops sight), heard (no wall stops sound), light, distance, invisible,
    concealed (an effect on the target), stored (Visioner's state for this pair), avs (Visioner's automatic system is on), known (it has perceived this one before),
    below (0.16.0: the perceiver is burrowed under the ground: earth stands between it and everything, so no sight, hearing or Visioner state reaches it; only
    tremorsense, and only of a creature on the same surface, not one up in the air: Rules ID 2413), aloft (the other creature is off the ground) }. */
export function perceiveOne(o) {
  if (o.below) o = { ...o, avs: false, stored: null, sees: false, heard: false, senses: o.aloft ? [] : (o.senses ?? []).filter(s => s.type === "tremorsense") };
  if (o.avs && o.stored) return { state: o.stored, by: "visioner" };
  const senses = o.senses ?? [], inRange = s => s.range == null || (o.distance ?? 0) <= s.range, has = t => senses.some(s => s.type === t);
  let state = o.known ? "undetected" : "unnoticed", by = o.known ? "memory" : "nothing";
  const take = (s, why) => { if (better(s, state) !== state) { state = s; by = why; } };
  for (const s of senses) {
    if (VISION.has(s.type)) continue;
    if (s.type === "hearing" && o.heard === false) continue;
    if (!inRange(s)) continue;
    take(s.acuity === "precise" ? "observed" : s.acuity === "vague" ? "undetected" : "hidden", s.type);
  }
  if (!o.blinded && o.sees && (!o.invisible || has("see-invisibility") || has("truesight"))) {
    const dark = has("darkvision") || has("greater-darkvision") || has("truesight"), low = dark || has("low-light-vision");
    let seen = o.light === "bright" ? "observed" : o.light === "dim" ? (low ? "observed" : "concealed") : dark ? "observed" : null;
    if (seen && o.dazzled && !senses.some(s => !VISION.has(s.type) && s.acuity === "precise" && inRange(s))) seen = worse(seen, "concealed");
    if (seen) take(seen, "sight");
  }
  if (o.concealed && (by === "sight")) state = worse(state, "concealed");
  /* A stored Hidden or worse came from Hide, Sneak or Seek, so it counts. A stored Observed says nothing: it's also Visioner's answer when it has no record, and it overrides walls. */
  if (o.stored && o.stored !== "observed" && ORDER.includes(o.stored) && worse(state, o.stored) !== state) { state = o.stored; by = "visioner"; }
  return { state, by };
}
/** Actions this turn, the way Workbench counts them. It takes stunned down at the start of the turn and records how much in `reduced`. */
export const actionsFor = ({ quickened = false, slowed = 0, stunned = 0, reduced = 0 } = {}) => Math.max(0, 3 + (quickened ? 1 : 0) - Math.max(slowed, stunned, reduced));

/** A stable short label for each id, kept for the whole fight: memory and plans both rely on it. Returns the new entries only. */
export function assignLabels(existing = {}, ids = [], prefix = "E") {
  const taken = new Set(Object.values(existing)), out = {}; let n = 1;
  for (const id of ids) { if (existing[id] || out[id]) continue; while (taken.has(`${prefix}${n}`)) n++; out[id] = `${prefix}${n}`; taken.add(out[id]); }
  return out;
}

/** PF2e HUD's words for how hurt a creature looks. `data` is its health status setting; an empty one means its default list, marked as it marks them. */
export function healthEntries(data, defaultList = "") {
  if (data?.entries?.length) return { dead: data.dead, full: data.full, entries: data.entries };
  const t = String(defaultList).split(",").map(s => s.trim()), e = t.length - 1; if (e < 1) return { dead: "", full: "", entries: [] };
  const n = 100 / (e - 1), entries = []; for (let i = 1; i < e; i++) entries.push({ label: t[i], marker: Math.max(Math.floor((i - 1) * n), 1) });
  return { dead: t[0], full: t[e], entries };
}
export function healthWord({ value = 0, max = 0, temp = 0 } = {}, words, { dead = true } = {}) {
  if (max <= 0) return null;
  /* at 0 HP but not dead (dying or unconscious): "Down" (Rhea, 2026-11-07), where PF2e HUD's list would say its word for 0 HP ("Dead") */
  const now = Math.min(Math.max(value, 0), max) + temp; if (now === 0) return dead ? words.dead : "Down"; if (now >= max) return words.full;
  const pct = Math.max(Math.min(now / max, 1) * 100, 1);
  return [...words.entries].sort((a, b) => b.marker - a.marker).find(e => pct >= e.marker)?.label ?? "???";
}

/** Conditions a monster can see on someone. Being frightened or sickened doesn't show on a token's square. */
export const VISIBLE_CONDITIONS = new Set(["prone", "unconscious", "dying", "grabbed", "restrained", "immobilized", "paralyzed", "petrified", "fleeing", "invisible"]);
export const visibleConditions = slugs => [...new Set(slugs)].filter(s => VISIBLE_CONDITIONS.has(s)).sort();

/** Ability text from PF2e's markup as plain words. Unknown @ links keep their label. `localize` turns @Localize keys into text. */
export function plainText(html, localize = k => k) {
  const LINK = String.raw`\[((?:[^\[\]]|\[[^\]]*\])*)\]`;
  let s = String(html ?? "");
  s = s.replace(new RegExp(`@Localize${LINK}`, "g"), (_, k) => localize(k));
  s = s.replace(new RegExp(`@(\\w+)${LINK}\\{([^}]*)\\}`, "g"), "$3");
  s = s.replace(new RegExp(`@Check${LINK}`, "g"), (_, a) => { const [type, ...rest] = a.split("|"), dc = rest.find(r => r.startsWith("dc:")); return `${dc ? `DC ${dc.slice(3)} ` : ""}${type}`; });
  s = s.replace(new RegExp(`@Damage${LINK}`, "g"), (_, a) => a.replace(/\[([^\]]*)\]/g, " $1"));
  s = s.replace(new RegExp(`@Template${LINK}`, "g"), (_, a) => a.split("|").map(p => p.split(":").pop()).join(" "));
  s = s.replace(new RegExp(`@UUID${LINK}`, "g"), (_, a) => a.split(".").pop());
  s = s.replace(/<\/(p|li|h\d|div|section)>|<br\s*\/?>|<hr\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
  return s.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
/** The numbers in a Strike's labels ("Strike +12", "+7 (MAP -5)"), so the penalty is PF2e's, agile included. */
export const strikeMods = labels => labels.map(l => Number(String(l).match(/[+-]\d+/)?.[0] ?? 0));
/** The ground around a square, one string per row. # no footing, D greater difficult, d difficult, c cover worth having, . open. Tokens aren't marked, or an
    unseen one would show as a gap. */
export const GROUND_KEY = "T blocked, by something it could Take Cover behind (a thick trunk), # blocked by anything else (a thin trunk is too thin to Take Cover behind), W deep calm water (a pond or lake: Swim, not Stride), R deep flowing water (a river or creek channel: Swim, with an Athletics check without a swim Speed), D other greater difficult terrain, d difficult, c some cover, . open. First row is [from], y grows downwards.";
/** Added to the key for a creature with a burrow Speed (0.16.0): rock it can't burrow through. */
export const ROCK_KEY = " r rock it can't burrow through (it can still walk there, and some of it is difficult: a Stride's check counts it).";
export function groundAround(model, [i, j], radius = 10, coverAt = .3, takeCoverAt = null, waterAt = null, rockAt = null) {
  const x0 = Math.max(0, i - radius), y0 = Math.max(0, j - radius), x1 = Math.min(model.cols - 1, i + radius), y1 = Math.min(model.rows - 1, j + radius), rows = [];
  /* takeCoverAt(x, y): a wall or trunk in that square Take Cover can use (Rhea's rule B: thick trunks yes, thin ones no), marked T instead of #;
     waterAt(x, y): "calm" or "flowing" for a deep-water square (W, R), anything else greater difficult stays D */
  for (let y = y0; y <= y1; y++) { let row = ""; for (let x = x0; x <= x1; x++) { const k = model.idx(x, y); row += model.blocked[k] ? (takeCoverAt?.(x, y) ? "T" : "#") : model.costs[k] === 2 ? ({ calm: "W", flowing: "R" }[waterAt?.(x, y)] ?? "D") : rockAt?.(x, y) ? "r" : model.costs[k] === 1 ? "d" : model.cover[k] >= coverAt ? "c" : "."; } rows.push(row); }
  return { from: [x0, y0], rows, key: rockAt ? GROUND_KEY + ROCK_KEY : GROUND_KEY };
}
/** What a monster gets told. Everything about others goes through here, and only these fields: never a player's HP, AC, saves, level, slots or anything else off
    a sheet, GM secrets, hidden loot or chat. Text in it is data, never instruction. */
export function packetOf({ you, mind = null, allies = [], others = [], memory = {}, ground = null, round = 0, note = null, done = [] }) {
  const perceived = [], remembered = [];
  for (const o of others) {
    if (o.state === "observed" || o.state === "concealed") perceived.push({ label: o.label, state: o.state, square: o.square, ...(o.height > 0 ? { height: o.height } : {}), ...(o.offGrid ? { offGrid: true } : {}), size: o.size, gear: o.gear ?? [], conditions: o.conditions ?? [], healthWord: o.healthWord ?? null, distance: o.distance, cover: o.cover ?? "none" });
    else if (o.state === "hidden") perceived.push({ label: o.label, state: "hidden", square: o.square, ...(o.height > 0 ? { height: o.height } : {}) });   /* a hidden creature's space is known, height included */
    else if (o.state === "undetected" && memory[o.id]) remembered.push({ label: o.label, lastSeen: memory[o.id].square, round: memory[o.id].round });
  }
  /* done: what this monster already did this turn, from turn.mjs's doneStep (labels and ids only); note: why it's asked again, in labels */
  /* mind: the monster's behaviour profile in words (minds.mjs `forPacket`), first because it is the same all fight long (0.24.0, schema 2: it replaces you.tactics) */
  return { schema: PACKET_SCHEMA, ...(mind ? { mind } : {}), you, allies, perceived, memory: remembered, ground, round, note, done };
}
/** Who it can name in a plan: label to token id. */
export const labelsOf = others => Object.fromEntries(others.filter(o => canTarget(o.state)).map(o => [o.label, o.id]));
/** What to keep for next time: a hidden creature's square is known too. Returns only what changed. */
export function remember(memory = {}, others = [], round = 0) {
  const out = {}; for (const o of others) { if (!canTarget(o.state)) continue; const m = memory[o.id]; if (!m || m.round !== round || m.square?.[0] !== o.square[0] || m.square?.[1] !== o.square[1]) out[o.id] = { square: o.square, round }; }
  return out;
}
/** The card's line for the GM, who may see real names. */
export function describeKnows(packet, nameOf) {
  if (!packet) return ""; const name = l => nameOf(l) ?? l;
  const known = packet.perceived.map(p => `${name(p.label)} (${p.state})`), old = packet.memory.map(m => `${name(m.label)} (round ${m.round})`);
  return `${known.length ? `Knows of: ${known.join(", ")}.` : "Knows of nobody."}${old.length ? ` Remembers: ${old.join(", ")}.` : ""}`;
}
