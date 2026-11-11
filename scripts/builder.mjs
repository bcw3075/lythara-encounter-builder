/* The Foundry side of a build: gathers the map, imports creatures, places tokens, treasure, journal and notes, and removes them again.
   Every document made here carries flags[ID].built = the build id, and Rebuild and Clear delete only those, by id. */
import { cleanBrief, expandCreatures } from "./brief.mjs";
import { stampBrief } from "./minds.mjs";
import { adjustedLevel, chooseTreasure, claimDiffers, ledgerLine, levelTotal, toGp, treasureFor } from "./budget.mjs";
import { esc, journalPages } from "./journal.mjs";
import { SIZE_SQUARES, buildModel, summarise } from "./mapread.mjs";
import { hiddenNextTo, layout, nearestFree } from "./place.mjs";

export const ID = "lythara-encounter-builder";
const SURVEY = "lythara-survey-sheet", READ_SCHEMA = 1, FOLDER = "Encounter Builder";
const NO_CARRY = new Set(["animal", "mindless", "beast", "ooze", "swarm"]);
const ROLE_COLOR = { ambusher: "#a03030", brute: "#b06020", ranged: "#3060a0", caster: "#7030a0", guard: "#808020", beast: "#306030" };
const gmOnly = () => { if (!game.user.isGM) throw new Error("Only a GM can do this."); };
const isSquare = scene => scene.grid.type === CONST.GRID_TYPES.SQUARE;

/* ---------- reading the map ---------- */
const reads = new Map(), redrawing = new Set();
export function markDrawn(scene) { reads.delete(scene.id); redrawing.add(scene.id); }
export const markReady = id => redrawing.delete(id);
/* placeables must never be created while a client redraws (DEVELOPING.md), so a build right after Fight Here waits for it */
async function canvasSettled(scene) {
  if (canvas.scene?.id !== scene.id || (canvas.ready && !redrawing.has(scene.id))) return;
  await new Promise(res => { const id = Hooks.once("canvasReady", () => { clearTimeout(t); res(); }), t = setTimeout(() => { Hooks.off("canvasReady", id); res(); }, 20000); });
}
/** The Survey Sheet read, or null with the reason this map can only be read in part. An unknown schema is refused. */
async function surveyRead(scene) {
  const mod = game.modules.get(SURVEY);
  if (!mod?.active || !mod.api?.readEncounterMap) return { read: null, why: "Lythara Survey Sheet isn't active or is too old, so this read comes from walls and regions alone." };
  const st = scene.getFlag(SURVEY, "encounter"); if (!st) return { read: null, why: "This scene isn't a Survey Sheet encounter map, so the read comes from walls and regions alone." };
  const key = `${st.rev}|${JSON.stringify(game.settings.get(SURVEY, "heading"))}`, hit = reads.get(scene.id);
  if (hit?.key === key) return { read: hit.read, why: "" };
  const read = await mod.api.readEncounterMap(scene);
  if (read?.schema !== READ_SCHEMA) throw new Error(`This Survey Sheet gives a map read this builder doesn't know (version ${read?.schema}). Update the Encounter Builder.`);
  reads.set(scene.id, { key, read });
  return { read, why: "" };
}
function footprint(t, ox, oy, px) { const i = Math.round((t.x - ox) / px), j = Math.round((t.y - oy) / px), n = Math.max(1, Math.ceil(t.width)), m = Math.max(1, Math.ceil(t.height)), out = []; for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) out.push([i + a, j + b]); return out; }
function partyTokens(scene) { const ids = new Set(game.actors.party?.members.map(m => m.id) ?? []); return scene.tokens.filter(t => ids.has(t.actorId)); }
/** The per-square model from the scene's documents and the read. except: token ids that don't count as in the way. */
export async function readMap(scene, { except = new Set() } = {}) {
  gmOnly(); if (!isSquare(scene)) throw new Error("The builder needs a square grid.");
  const { read, why } = await surveyRead(scene), d = scene.dimensions, px = scene.grid.size, ox = d.sceneX, oy = d.sceneY, cols = Math.round(d.sceneWidth / px), rows = Math.round(d.sceneHeight / px);
  const WS = CONST.EDGE_SENSE_TYPES, open = CONST.WALL_DOOR_STATES.OPEN;
  const walls = scene.walls.filter(w => !(w.door && w.ds === open)).map(w => ({ ax: (w.c[0] - ox) / px, ay: (w.c[1] - oy) / px, bx: (w.c[2] - ox) / px, by: (w.c[3] - oy) / px, move: w.move !== CONST.WALL_MOVEMENT_TYPES.NONE, sight: w.sight === WS.NONE ? 0 : w.sight === WS.LIMITED ? 1 : 2, dir: w.dir ?? 0 }));
  const costs = new Array(cols * rows).fill(0);
  for (const r of scene.regions) for (const b of r.behaviors) { if (b.type !== "modifyMovementCost" || b.disabled) continue; const walk = Number(b.system?.difficulties?.walk) || 1, c = Math.max(0, Math.min(2, walk - 1)); if (!c) continue;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (costs[j * cols + i] < c && r.testPoint({ x: ox + (i + .5) * px, y: oy + (j + .5) * px, elevation: 0 })) costs[j * cols + i] = c; }
  const occupied = new Array(cols * rows).fill(false);
  for (const t of scene.tokens) { if (except.has(t.id)) continue; for (const [i, j] of footprint(t, ox, oy, px)) if (i >= 0 && j >= 0 && i < cols && j < rows) occupied[j * cols + i] = true; }
  const party = partyTokens(scene), partySquares = party.map(t => footprint(t, ox, oy, px)[0]);
  const entrySource = party.length ? "tokens" : read ? "read" : "default", entrySquares = party.length ? partySquares : read ? [read.entry.square] : [[Math.floor(cols / 2), rows - 3]];
  const model = buildModel({ cols, rows, walls, costs, occupied, entrySquares, entrySource, entryEdge: read?.entry?.edge ?? "south", read });
  return { read, why, model, px, ox, oy };
}
export async function summary(scene) { const { read, why, model } = await readMap(scene); return { why, ...summarise(model, read) }; }

/* ---------- creatures ---------- */
let creatureIndex = null;
const FIRST = ["pf2e.pathfinder-monster-core", "pf2e.pathfinder-monster-core-2", "pf2e.pathfinder-npc-core"];
async function allCreatures() {
  if (creatureIndex) return creatureIndex;
  const out = [], fields = ["system.details.level.value", "system.traits.size.value", "system.traits.value", "system.traits.rarity"];
  await Promise.all(game.packs.filter(p => p.documentName === "Actor").map(async p => { const ix = await p.getIndex({ fields }); const rank = FIRST.includes(p.collection) ? 1 : 2;
    for (const e of ix) if (e.type === "npc") out.push({ uuid: e.uuid, name: e.name, level: e.system?.details?.level?.value ?? 0, size: e.system?.traits?.size?.value ?? "med", rarity: e.system?.traits?.rarity ?? "common", pack: p.title, rank }); }));
  return creatureIndex = out;
}
/** Creatures by name, best match first: world actors, then Monster Core and NPC Core, then every other pack. Names repeat, so a brief keeps the UUID. */
export async function findCreatures(query, limit = 30) {
  gmOnly(); const q = String(query ?? "").trim().toLowerCase(); if (q.length < 2) return [];
  const world = game.actors.filter(a => a.type === "npc" && !a.getFlag(ID, "built")).map(a => ({ uuid: a.uuid, name: a.name, level: a.level, size: a.size, rarity: a.rarity ?? "common", pack: "This world", rank: 0 }));
  const score = c => { const n = c.name.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : 2; };
  return [...world, ...await allCreatures()].filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => score(a) - score(b) || a.rank - b.rank || a.name.localeCompare(b.name) || a.level - b.level).slice(0, limit);
}
async function resolveCreatures(brief) {
  const out = new Map();
  for (const c of brief.creatures) {
    if (!c.uuid) { const hits = (await findCreatures(c.name, 50)).filter(h => h.name.toLowerCase() === c.name.toLowerCase()); if (hits.length !== 1) throw new Error(hits.length ? `Several creatures are called ${c.name}: ${hits.slice(0, 6).map(h => `${h.pack} level ${h.level}`).join("; ")}. Pick one.` : `No creature is called ${c.name}.`); c.uuid = hits[0].uuid; }
    if (out.has(c.uuid)) continue;
    const a = await fromUuid(c.uuid); if (!(a instanceof Actor) || a.type !== "npc") throw new Error(`${c.name || c.uuid} isn't a creature.`);
    out.set(c.uuid, { uuid: c.uuid, name: a.name, level: a.level, n: SIZE_SQUARES[a.size] ?? 1, swim: !!a.system.movement?.speeds?.swim, carries: !a.system.traits.value.some(t => NO_CARRY.has(t)) });
  }
  for (const c of brief.creatures) c.name ||= out.get(c.uuid).name;
  return out;
}

/* ---------- threat ---------- */
export const partySize = () => game.settings.get(ID, "partySize");
export const partyLevels = () => (game.actors.party?.members ?? []).filter(a => a.type === "character").map(a => ({ name: a.name, level: a.level }));
/** The level the sheets suggest: the most common, the lowest on a tie. Never taken silently: the dialog shows it and asks. */
export function suggestedLevel() { const n = new Map(); for (const { level } of partyLevels()) n.set(level, (n.get(level) ?? 0) + 1); return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1; }
export function threatOf(levels, level, claimed = null) {
  const size = partySize(), r = game.pf2e.gm.calculateXP(level, size, levels, [], {});
  return { level, size, xp: r.totalXP, rating: r.rating, budgets: r.encounterBudgets, claimed, claimNote: claimDiffers(claimed, r.totalXP) ? `The notes say ${claimed} XP; the calculation says ${r.totalXP}.` : "" };
}
const levelsOf = (brief, info) => brief.creatures.flatMap(c => Array(c.count).fill(adjustedLevel(info.get(c.uuid).level, c.adjust)));

/* ---------- treasure ---------- */
const ledger = () => game.settings.get(ID, "treasure") ?? { manual: {}, builds: {} };
export const ledgerFor = level => ledgerLine(ledger(), level);
export async function setManualTreasure(level, gp) { gmOnly(); const l = foundry.utils.deepClone(ledger()); l.manual[level] = Math.max(0, Number(gp) || 0); await game.settings.set(ID, "treasure", l); }
let itemIndex = null;
async function treasureCandidates() {
  if (itemIndex) return itemIndex;
  const fields = ["system.level.value", "system.price.value", "system.traits.rarity", "system.traits.value", "system.category"], row = e => ({ uuid: e.uuid, name: e.name, level: e.system?.level?.value ?? 0, gp: toGp(e.system?.price?.value), rarity: e.system?.traits?.rarity ?? "common", category: e.system?.category ?? "", healing: !!e.system?.traits?.value?.includes("healing") });
  const eq = await game.packs.get("pf2e.equipment-srd")?.getIndex({ fields }), goods = game.modules.get("kctg-2e")?.active ? await game.packs.get("kctg-2e.kctg-2e")?.getIndex({ fields }) : null;
  return itemIndex = { items: eq ? [...eq].filter(e => e.type === "consumable").map(row) : [], goods: [...(goods ?? []), ...(eq ?? [])].filter(e => e.type === "treasure" && ["gem", "art-object"].includes(e.system?.category)).map(row) };   /* gems and art, not trade goods: no chickens in a cache */
}
async function listedTreasure(brief, carriers) {
  const lines = [];
  for (const t of brief.treasure) {
    const to = t.on === "cache" || !carriers.length ? "cache" : carriers.includes(t.on) ? t.on : carriers[0];
    if (t.coins) { lines.push({ kind: "coins", coins: t.coins, gp: toGp(t.coins), to }); continue; }
    let uuid = t.uuid, name = t.name;
    if (!uuid) { const c = await treasureCandidates(), eq = await game.packs.get("pf2e.equipment-srd")?.getIndex(), hit = eq?.find(e => e.name.toLowerCase() === name.toLowerCase()) ?? [...c.goods, ...c.items].find(e => e.name.toLowerCase() === name.toLowerCase()); if (!hit) throw new Error(`No item is called ${name}.`); uuid = hit.uuid; name = hit.name; }
    const it = await fromUuid(uuid); if (!it) throw new Error(`No item at ${uuid}.`);
    lines.push({ kind: "item", uuid, name: it.name, gp: toGp(it.system?.price?.value), qty: t.qty, to });
  }
  return { lines, value: Math.round(lines.reduce((a, l) => a + l.gp * (l.qty ?? 1), 0) * 100) / 100, note: "" };
}

/* ---------- planning a build (nothing is created) ---------- */
/** Everything a build will do. Nothing is written until place(). */
export async function prepare(scene, rawBrief, { seed = null, except = null } = {}) {
  gmOnly();
  /* placing replaces this map's build, so what it placed isn't in the way and its treasure doesn't count against the new one */
  const old = scene.getFlag(ID, "build"); except ??= new Set(old ? scene.tokens.filter(t => t.getFlag(ID, "built") === old.id).map(t => t.id) : []);
  const brief = cleanBrief(rawBrief); if (!brief.creatures.length) throw new Error("The brief has no creatures.");
  const info = await resolveCreatures(brief), { read, why, model, px, ox, oy } = await readMap(scene, { except });
  const level = brief.partyLevel ?? suggestedLevel(); brief.partyLevel = level;
  const threat = threatOf(levelsOf(brief, info), level, brief.claimedXP);
  const s = seed ?? (Math.floor(Math.random() * 1e6) + 1), list = expandCreatures(brief, c => info.get(c.uuid));
  const plan = layout(model, list, { seed: s, mood: brief.mood }), warnings = [...plan.warnings];
  if (why) warnings.unshift(why);
  if (model.entry.source !== "tokens") warnings.push(model.entry.source === "read" ? `The party isn't on this map yet, so I took the ${model.entry.edge} edge as where they come in (their last heading).` : "The party isn't on this map, and the read has no heading, so I took the south edge as where they come in.");
  if (threat.claimNote) warnings.push(threat.claimNote);
  const carriers = brief.creatures.flatMap((c, g) => info.get(c.uuid).carries ? plan.placed.filter(p => p.group === g).map(p => p.key) : []);
  const treasure = brief.treasureMode === "none" ? { lines: [], value: 0, note: "No treasure asked for." } : brief.treasureMode === "list" ? await listedTreasure(brief, carriers)
    : chooseTreasure({ gp: treasureFor(level, threat.rating), level, carriers, lair: brief.mood === "lair", candidates: await treasureCandidates(), seed: s });
  const line = ledgerFor(level), refund = old && ledger().builds?.[old.id]?.level === level ? ledger().builds[old.id].gp : 0, left = line.left + refund; if (treasure.value > left) warnings.push(`This treasure (${treasure.value} gp) goes over what's left for level ${level}: ${Math.max(0, left)} of ${levelTotal(level)} gp.`);
  return { scene, brief, info, read, model, px, ox, oy, level, threat, plan, treasure, warnings, seed: s };
}
/* where a cache goes: its anchor if the brief or the map has one */
function cacheSquare(prep, taken) { const a = prep.model.anchors.find(x => ["cave", "camp", "ruins", "fallen", "stones"].includes(x.kind)); const at = a?.at ?? [Math.floor(prep.model.cols / 2), Math.floor(prep.model.rows / 2)]; return nearestFree(prep.model, at, 1, taken); }
const planTaken = prep => { const t = new Set(); for (const p of prep.plan.placed) for (let a = 0; a < p.n; a++) for (let b = 0; b < p.n; b++) t.add(prep.model.idx(p.i + a, p.j + b)); return t; };

/* ---------- the preview: GM-only drawings, gone on confirm or cancel ---------- */
export async function showPreview(prep) {
  const { scene, px, ox, oy, plan, model } = prep; await canvasSettled(scene);
  const rect = (i, j, n, color, text, fill = .45) => ({ author: game.user.id, x: ox + i * px, y: oy + j * px, hidden: true, shape: { type: "r", width: n * px, height: n * px }, fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: color, fillAlpha: fill, strokeColor: color, strokeAlpha: 1, strokeWidth: 6, text, fontSize: 22, textColor: "#ffffff", flags: { [ID]: { preview: true } } });
  const data = plan.placed.map(p => rect(p.i, p.j, p.n, ROLE_COLOR[p.role] ?? "#606060", `${p.label}\n${p.role}`));
  if (prep.treasure.lines.some(l => l.to === "cache")) { const at = cacheSquare(prep, planTaken(prep)); if (at) data.push(rect(at[0], at[1], 1, "#c0a000", "Cache")); }
  if (model.entry.source !== "tokens") for (const [i, j] of model.entry.squares) data.push(rect(i, j, 1, "#2080c0", "Party comes in here", .3));
  const docs = await scene.createEmbeddedDocuments("Drawing", data);
  return docs.map(d => d.id);
}
export async function clearPreview(scene) { const ids = scene.drawings.filter(d => d.getFlag(ID, "preview")).map(d => d.id); if (ids.length) await scene.deleteEmbeddedDocuments("Drawing", ids); }

/* ---------- placing ---------- */
async function folderFor(type) { return game.folders.find(f => f.type === type && f.name === FOLDER && f.getFlag(ID, "own")) ?? Folder.create({ name: FOLDER, type, flags: { [ID]: { own: true } } }); }
async function importCreature(uuid, adjust, buildId, folder) {
  const src = await fromUuid(uuid), data = src.toObject(); delete data._id;
  data.folder = folder.id; data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  foundry.utils.setProperty(data, `flags.${ID}`, { built: buildId, source: uuid, adjust });
  if (uuid.startsWith("Compendium.")) foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
  const a = await Actor.create(data); if (adjust) await a.applyAdjustment(adjust);
  return a;
}
/** Make it real. Removes this map's earlier build first. Returns a report. */
export async function place(prep) {
  gmOnly();
  const { scene, brief, info, plan, treasure, px, ox, oy, level, seed } = prep;
  await canvasSettled(scene); await clear(scene, { quiet: true }); await clearPreview(scene);
  const buildId = foundry.utils.randomID(8), flag = { [ID]: { built: buildId } }, actorFolder = await folderFor("Actor");
  /* one world actor per creature and adjustment, never the compendium's own */
  const actors = new Map();
  for (const c of brief.creatures) { const k = `${c.uuid}|${c.adjust}`; if (!actors.has(k)) actors.set(k, await importCreature(c.uuid, c.adjust, buildId, actorFolder)); }
  const tokenData = [];
  for (const p of plan.placed) { const c = brief.creatures[p.group], a = actors.get(`${c.uuid}|${c.adjust}`), idx = Number(p.key.split("-")[1]);
    const t = (await a.getTokenDocument({ x: ox + p.i * px, y: oy + p.j * px })).toObject();
    Object.assign(t, { x: ox + p.i * px, y: oy + p.j * px, actorLink: false, hidden: p.state === "hidden", disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE, name: c.count > 1 ? `${a.name} ${idx + 1}` : a.name });
    foundry.utils.setProperty(t, `flags.${ID}`, { built: buildId, key: p.key, group: p.group, role: p.role, run: c.run, auto: false, model: null, opus: c.opus, band: c.band || null, leader: !!c.leader });   /* band and leader: stored for the group releases, nothing acts on them yet (0.24.0) */
    tokenData.push(t); }
  const made = await scene.createEmbeddedDocuments("Token", tokenData), byKey = new Map(made.map(t => [t.getFlag(ID, "key"), t]));
  for (const t of made) if (plan.placed.find(p => p.key === t.getFlag(ID, "key"))?.state === "asleep") await t.actor.increaseCondition("unconscious");
  /* treasure on who carries it, or in a cache */
  const lootText = []; let cache = null;
  if (treasure.lines.some(l => l.to === "cache")) { const at = cacheSquare(prep, planTaken(prep)) ?? [0, 0], folder = actorFolder;
    const loot = await Actor.create({ name: "Cache", type: "loot", folder: folder.id, flags: flag });
    const t = (await loot.getTokenDocument({ x: ox + at[0] * px, y: oy + at[1] * px })).toObject(); Object.assign(t, { x: ox + at[0] * px, y: oy + at[1] * px, hidden: true, actorLink: true }); foundry.utils.setProperty(t, `flags.${ID}`, { built: buildId, cache: true });
    [cache] = await scene.createEmbeddedDocuments("Token", [t]); }
  for (const l of treasure.lines) { const tok = l.to === "cache" ? cache : byKey.get(l.to), who = l.to === "cache" ? "in the cache" : `on ${tok?.name}`; if (!tok) continue; const actor = tok.actor;
    if (l.kind === "coins") { await actor.inventory.addCoins(l.coins); lootText.push(`${[l.coins.gp && `${l.coins.gp} gp`, l.coins.sp && `${l.coins.sp} sp`, l.coins.cp && `${l.coins.cp} cp`].filter(Boolean).join(", ")} ${who}`); }
    else { const d = (await fromUuid(l.uuid)).toObject(); delete d._id; foundry.utils.setProperty(d, "system.quantity", l.qty ?? 1); await actor.createEmbeddedDocuments("Item", [d]); lootText.push(`${l.qty > 1 ? `${l.qty} × ` : ""}${l.name} ${who}`); } }
  /* the threat again, from the real tokens */
  const threat = threatOf(made.map(t => t.actor.level), level, brief.claimedXP);
  /* the journal */
  const setup = plan.placed.map(p => `${byKey.get(p.key)?.name}: ${p.role}, ${p.state}, ${p.approach} ft of walking from the party's way in`);
  if (cache) setup.push("A hidden cache. Reveal the token when they find it.");
  const folder = await folderFor("JournalEntry"), entry = await JournalEntry.create({ name: brief.name || `Encounter: ${scene.name}`, folder: folder.id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: flag,
    pages: journalPages(brief, { threat, setup, treasure: lootText, treasureNote: treasure.note }).map((p, i) => ({ name: p.name, type: "text", sort: (i + 1) * 100000, text: { content: p.content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML } })) });
  /* map notes only where the brief asks; a clue players may find needs OBSERVER on its own page (DEVELOPING.md) */
  const noteData = [], warnings = [];
  for (const n of brief.notes) { const a = n.at ? null : prep.model.anchors.find(x => x.kind === n.anchor), at = n.at ?? a?.at; if (!at) { warnings.push(`Note "${n.title}": no ${n.anchor} on this map.`); continue; }
    const [page] = await entry.createEmbeddedDocuments("JournalEntryPage", [{ name: n.title, type: "text", sort: 900000 + noteData.length, ownership: { default: n.player ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT }, text: { content: `<p>${esc(n.text)}</p>`, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML } }]);
    noteData.push({ x: ox + (at[0] + .5) * px, y: oy + (at[1] + .5) * px, entryId: entry.id, pageId: page.id, text: n.title, iconSize: 40, texture: { src: "icons/svg/book.svg" }, flags: flag }); }
  if (noteData.length) await scene.createEmbeddedDocuments("Note", noteData);
  /* records */
  const l = foundry.utils.deepClone(ledger()); l.builds[buildId] = { level, gp: treasure.value }; await game.settings.set(ID, "treasure", l);
  const update = { [`flags.${ID}.build`]: { id: buildId, seed, threat, rev: prep.read?.rev ?? null, at: Date.now(), entry: entry.id }, [`flags.${ID}.brief`]: brief };
  if (!scene.journal) { update.journal = entry.id; update.journalEntryPage = entry.pages.contents.find(p => p.name === "Overview")?.id ?? null; }
  await scene.update(update);
  if (threat.rating !== prep.threat.rating) warnings.push(`Threat changed once the real tokens were counted: ${prep.threat.rating} became ${threat.rating}.`);
  warnings.push(...nextToParty(scene));
  return { buildId, seed, threat, tokens: made.length, cache: !!cache, journal: entry.id, treasure: treasure.value, loot: lootText, warnings: [...prep.warnings, ...warnings] };
}
/** Hidden monsters a party token landed on or next to. Rhea decides what to do; nothing moves on its own. */
export function nextToParty(scene) {
  const d = scene.dimensions, px = scene.grid.size, party = partyTokens(scene).flatMap(t => footprint(t, d.sceneX, d.sceneY, px));
  const hidden = scene.tokens.filter(t => t.getFlag(ID, "built") && !t.getFlag(ID, "cache")).map(t => { const [i, j] = footprint(t, d.sceneX, d.sceneY, px)[0]; return { name: t.name, i, j, n: Math.ceil(t.width), hidden: t.hidden }; });
  return hiddenNextTo(party, hidden).map(m => `The party is next to hidden ${m.name}.`);
}
/** One step: prepare and place with no preview, for scripts and tests. */
export async function build(scene, brief, opts = {}) { return place(await prepare(scene, brief, opts)); }

/* ---------- Rebuild, Clear, Re-place ---------- */
/** Delete what the current build made, by id. Hand-placed things and Survey Sheet's documents have no such flag and stay. */
export async function clear(scene, { quiet = false } = {}) {
  gmOnly();
  const b = scene.getFlag(ID, "build"); if (!b) { if (!quiet) ui.notifications.info("This map has no build to clear."); return { removed: 0 }; }
  const of = doc => doc.getFlag(ID, "built") === b.id; let removed = 0;
  for (const type of ["Token", "Note", "Drawing"]) { const ids = scene.getEmbeddedCollection(type).filter(of).map(d => d.id); if (ids.length) { await scene.deleteEmbeddedDocuments(type, ids); removed += ids.length; } }
  const entry = game.journal.find(of), wasScene = entry && scene.journal?.id === entry.id;
  if (wasScene) await scene.update({ journal: null, journalEntryPage: null });
  if (entry) await entry.delete();
  /* a build's actors go too, unless a token someone placed by hand still uses one */
  const inUse = id => game.scenes.some(s => s.tokens.some(t => t.actorId === id));
  const gone = game.actors.filter(a => of(a) && !inUse(a.id)).map(a => a.id); if (gone.length) await Actor.deleteDocuments(gone);
  const l = foundry.utils.deepClone(ledger()); delete l.builds[b.id]; await game.settings.set(ID, "treasure", l);
  await scene.update({ [`flags.${ID}.-=build`]: null });
  return { removed, actors: gone.length };
}
/** A new layout around where the party is now, for the tokens the build already placed. */
export async function prepareReplace(scene, seed = null) {
  const b = scene.getFlag(ID, "build"), brief = scene.getFlag(ID, "brief"); if (!b || !brief) throw new Error("This map has no build to move.");
  const mine = new Set(scene.tokens.filter(t => t.getFlag(ID, "built") === b.id).map(t => t.id));
  return prepare(scene, { ...brief, treasureMode: "none" }, { seed, except: mine });
}
export async function applyReplace(prep) {
  const { scene, plan, px, ox, oy } = prep; await clearPreview(scene); await canvasSettled(scene);
  const b = scene.getFlag(ID, "build"), ups = [], movement = {};
  for (const p of plan.placed) { const t = scene.tokens.find(x => x.getFlag(ID, "built") === b.id && x.getFlag(ID, "key") === p.key); if (!t) continue; ups.push({ _id: t.id, x: ox + p.i * px, y: oy + p.j * px }); movement[t.id] = { constrainOptions: { ignoreWalls: true, ignoreCost: true } }; }
  if (ups.length) await scene.updateEmbeddedDocuments("Token", ups, { animate: false, movement });
  await scene.update({ [`flags.${ID}.build.seed`]: plan.seed });
  return { moved: ups.length, warnings: [...prep.warnings, ...nextToParty(scene)] };
}
/** Store a brief on the map for the Build dialog to pick up, written in a chat. Nothing is placed. */
/* a chat's door: mind lines in the brief are Angel's unless they say they are the GM's own words (minds.mjs `stampBrief`, 0.24.0) */
export async function submitBrief(scene, brief, { by = "angel" } = {}) { gmOnly(); const clean = cleanBrief(stampBrief(brief, by)); await scene.setFlag(ID, "brief", clean); return clean; }
