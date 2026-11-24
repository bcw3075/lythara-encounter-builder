/* Ask Angel inside Foundry (0.43.0, F-7): the Foundry side. The Build window's chat box writes the GM's words on the scene (`askAngel`); the bridge's
   API worker, on the runner's page, reads the oldest unanswered ask with `api.ask.pending()` (the map, the party, the window's brief, the map's journal
   notes and the conversation, put together here on the runner's page so no journal text is written into a flag), answers the tools it asks for with
   `api.ask.tool()`, and hands in its reply and brief with `api.ask.answer()`. The GM's window fills itself from the answer; nothing is placed. */
import { ID, findCreatures, partyLevels, partySize, readMap, suggestedLevel, threatOf } from "./builder.mjs";
import { cleanBrief } from "./brief.mjs";
import { stampBrief } from "./minds.mjs";
import { adjustedLevel } from "./budget.mjs";
import { roomList } from "./room.mjs";
import { summarise } from "./mapread.mjs";
import { ASK_MAX_TEXT, ASK_MODELS, ASK_PROMPT, ASK_TOOLS, ASK_TTL_S, NOTES_MAX, NOTE_MAX, askText, cleanAskAnswer, cleanMessages, plainText } from "./askprompt.mjs";

const gmOnly = () => { if (!game.user.isGM) throw new Error("Only a GM can do this."); };
const model = () => { const m = game.settings.get(ID, "askModel"); return ASK_MODELS.includes(m) ? m : "sonnet"; };

/** The GM's words from the chat box: added to the conversation, with the brief the window holds now. Out: the ask's seq. */
export async function askBuild(scene, text, brief) {
  gmOnly(); const words = String(text ?? "").trim().slice(0, ASK_MAX_TEXT); if (!words) throw new Error("Type what you'd like Angel to build first.");
  const old = scene.getFlag(ID, "askAngel"), seq = Date.now(), at = game.time.serverTime;   /* the server's clock: the runner may be another machine */
  /* a retry after a failed answer: the unanswered message is replaced, not repeated (review 13) */
  const before = old?.answer?.error && old.messages?.at(-1)?.who === "gm" ? old.messages.slice(0, -1) : old?.messages ?? [];
  const messages = cleanMessages([...before, { who: "gm", text: words }]);
  await scene.update({ [`flags.${ID}.==askAngel`]: { seq, at, user: game.user.id, model: model(), messages, brief: cleanBrief(brief ?? {}), answer: null } });
  return seq;
}
/** New conversation: the scene's conversation goes. */
export async function clearAsk(scene) { gmOnly(); if (scene.getFlag(ID, "askAngel")) await scene.update({ [`flags.${ID}.-=askAngel`]: null }); }

/** The map's own journal notes: the scene's journal and every journal pinned on it, as text (journals the module's builds wrote are marked). */
export function mapNotes(scene) {
  const seen = new Set(), out = []; let left = NOTES_MAX;
  const add = e => { if (!e || seen.has(e.id) || left <= 0) return; seen.add(e.id);
    const text = plainText(e.pages.contents.filter(p => p.type === "text").sort((a, b) => a.sort - b.sort).map(p => `<h3>${p.name}</h3>${p.text?.content ?? ""}`).join(""), Math.min(NOTE_MAX, left));
    if (!text) return; left -= text.length; out.push({ id: e.id, name: e.name, text, made: !!e.getFlag(ID, "built") }); };
  const j = scene.journal; add(j instanceof JournalEntry ? j : game.journal.get(j));
  for (const n of scene.notes) add(n.entry ?? game.journal.get(n.entryId));
  return out;
}
/** For the worker: the oldest live ask nobody has answered, as an event { kind: "build", sceneId, seq, model, system, tools, text }, or null.
    A read. skip: "<sceneId>|<seq>" keys the worker has already taken. */
export async function askPending(skip = []) {
  if (!game.user.isGM) return null;
  const seen = new Set(Array.isArray(skip) ? skip : []), now = game.time.serverTime;
  const asks = game.scenes.map(s => [s, s.getFlag(ID, "askAngel")]).filter(([s, a]) => a?.seq && !a.answer && now - a.at < ASK_TTL_S * 1000 && !seen.has(`${s.id}|${a.seq}`)).sort((a, b) => a[1].at - b[1].at);
  if (!asks.length) return null;
  const [s, a] = asks[0], brief = cleanBrief(a.brief ?? {});
  let map;
  try { const { read, why, model: m } = await readMap(s); map = { ...summarise(m, read), why, rooms: roomList(m).map(r => ({ room: r.n, squares: r.size, walkFt: r.near, seenByParty: r.seen, things: r.things, partyStartsHere: r.party })) }; }
  catch (e) { map = { unreadable: e.message }; }
  const party = { level: brief.partyLevel ?? suggestedLevel(), size: partySize(), sheetLevels: partyLevels().map(p => p.level) };
  return { kind: "build", sceneId: s.id, scene: s.name, seq: a.seq, model: a.model ?? "sonnet", system: ASK_PROMPT, tools: ASK_TOOLS,
    text: askText({ scene: s.name, map, party, brief, notes: mapNotes(s), messages: a.messages }) };
}

/* ---------- the tools the worker may call (all reads) ---------- */
let itemIndex = null;
async function items() { if (itemIndex) return itemIndex; const ix = await game.packs.get("pf2e.equipment-srd")?.getIndex({ fields: ["system.level.value", "system.price.value"] });
  return itemIndex = (ix ? [...ix] : []).map(e => ({ name: e.name, uuid: e.uuid, type: e.type, level: e.system?.level?.value ?? 0, price: e.system?.price?.value ?? {} })); }
const gpOf = p => Math.round(((p?.pp ?? 0) * 10 + (p?.gp ?? 0) + (p?.sp ?? 0) / 10 + (p?.cp ?? 0) / 100) * 100) / 100;
/** One tool call: its result as plain data, or { error } in words. sceneId: the ask's map (for the party it is checked against). */
export async function askTool(sceneId, name, input = {}) {
  gmOnly(); const q = String(input?.query ?? "").trim();
  try {
    if (name === "find_creatures") {
      const lo = Number.isFinite(input.minLevel) ? input.minLevel : -Infinity, hi = Number.isFinite(input.maxLevel) ? input.maxLevel : Infinity;
      const hits = (await findCreatures(q, 200)).filter(c => c.level >= lo && c.level <= hi).slice(0, 15);
      return { creatures: hits.map(c => ({ uuid: c.uuid, name: c.name, level: c.level, size: c.size, rarity: c.rarity, traits: (c.traits ?? []).slice(0, 8), compendium: c.pack })), ...(hits.length ? {} : { note: q.length < 2 ? "Search with at least 2 letters." : "Nothing by that name: try part of it." }) };
    }
    if (name === "find_items") {
      if (q.length < 2) return { items: [], note: "Search with at least 2 letters." };
      const low = q.toLowerCase(), hits = (await items()).filter(i => i.name.toLowerCase().includes(low)).sort((a, b) => (a.name.toLowerCase() === low ? -1 : 0) - (b.name.toLowerCase() === low ? -1 : 0) || a.level - b.level).slice(0, 15);
      return { items: hits.map(i => ({ name: i.name, level: i.level, gp: gpOf(i.price), type: i.type })) };
    }
    if (name === "check_threat") {
      const scene = game.scenes.get(sceneId), brief = cleanBrief(scene?.getFlag(ID, "askAngel")?.brief ?? {}), level = Number.isFinite(input.partyLevel) ? input.partyLevel : brief.partyLevel ?? suggestedLevel();
      const levels = [], unknown = [];
      for (const c of (Array.isArray(input.creatures) ? input.creatures : []).slice(0, 30)) { const a = await fromUuid(String(c?.uuid ?? "")).catch(() => null);
        if (!(a instanceof Actor) || a.type !== "npc") { unknown.push(String(c?.uuid ?? "?")); continue; }
        const n = Math.max(1, Math.min(30, Math.round(Number(c.count) || 1))); for (let k = 0; k < n; k++) levels.push(adjustedLevel(a.level, ["weak", "elite"].includes(c.adjust) ? c.adjust : "")); }
      if (!levels.length) return { error: "None of those uuids is a creature: take them from find_creatures." };
      const t = threatOf(levels, level); return { rating: t.rating, xp: t.xp, partyLevel: t.level, partySize: t.size, ...(unknown.length ? { notCreatures: unknown } : {}) };
    }
    if (name === "search_journals") {
      if (q.length < 2) return { journals: [], note: "Search with at least 2 letters." };
      const low = q.toLowerCase(), out = [];
      for (const e of game.journal) { const text = plainText(e.pages.contents.filter(p => p.type === "text").map(p => p.text?.content ?? "").join("\n"), 100000), at = text.toLowerCase().indexOf(low);
        if (!e.name.toLowerCase().includes(low) && at < 0) continue; out.push({ id: e.id, name: e.name, snippet: at < 0 ? text.slice(0, 200) : text.slice(Math.max(0, at - 80), at + 200) }); if (out.length >= 8) break; }
      return { journals: out };
    }
    if (name === "read_journal") {
      const e = game.journal.get(String(input?.id ?? "")); if (!e) return { error: "No journal has that id: take one from search_journals." };
      return { name: e.name, text: plainText(e.pages.contents.filter(p => p.type === "text").sort((a, b) => a.sort - b.sort).map(p => `<h3>${p.name}</h3>${p.text?.content ?? ""}`).join(""), 8000) };
    }
    return { error: `There is no tool called ${name}.` };
  } catch (e) { return { error: String(e?.message ?? e).slice(0, 200) }; }
}

/** The worker's answer, checked and kept on the ask: Angel's reply goes into the conversation; the brief's creatures must be real creatures and its
    items real items (the rest is dropped and said in the reply). Answers once. meta: { by: "api", model, cost, seconds, failed }. */
export async function answerAsk(sceneId, seq, answer, meta = {}) {
  gmOnly(); const scene = game.scenes.get(sceneId), a = scene?.getFlag(ID, "askAngel");
  if (!a || a.seq !== seq) return { ignored: true, reason: "That ask has been replaced or cleared." };
  if (a.answer) return { ignored: true, reason: "That ask has its answer." };
  const cost = Number(meta.cost), money = Number.isFinite(cost) ? Math.round(cost * 10000) / 10000 : null, by = typeof meta.model === "string" ? meta.model.slice(0, 60) : null;
  const clean = typeof meta.failed === "string" && meta.failed ? { error: meta.failed.slice(0, 200) } : cleanAskAnswer(answer);
  /* the ask is read again and written whole after every await, with none between: a New conversation or a new message meanwhile wins (review 1) */
  const write = async answerPart => { const now = scene.getFlag(ID, "askAngel"); if (!now || now.seq !== seq || now.answer) return false;
    await scene.update({ [`flags.${ID}.==askAngel`]: { ...now, messages: answerPart.messages ?? now.messages, answer: answerPart.answer } }); return true; };
  if (clean.error) { const ok = await write({ answer: { error: clean.error, by: "api", model: by, cost: money, at: Date.now() } }); return ok ? { state: "refused", error: clean.error } : { ignored: true, reason: "That ask has been replaced or cleared." }; }
  let brief = null; const dropped = [];
  if (clean.brief) {
    const raw = clean.brief, rows = [];
    for (const c of raw.creatures.slice(0, 30)) { const x = await fromUuid(String(c?.uuid ?? "")).catch(() => null);
      if (x instanceof Actor && x.type === "npc") rows.push({ ...c, name: x.name }); else dropped.push(String(c?.name || c?.uuid || "a creature").slice(0, 60)); }
    const known = new Set((await items()).map(i => i.name.toLowerCase())), treasure = [];
    for (const t of Array.isArray(raw.treasure) ? raw.treasure.slice(0, 30) : []) { if (t?.coins || known.has(String(t?.name ?? "").toLowerCase())) treasure.push(t); else dropped.push(String(t?.name ?? "an item").slice(0, 60)); }
    brief = cleanBrief(stampBrief({ ...raw, creatures: rows, treasure, ...(raw.treasureMode === "list" && !treasure.length ? { treasureMode: "table" } : {}) }, "angel"));
  }
  const reply = dropped.length ? `${clean.reply} (Not found, so left out: ${dropped.join(", ")}.)` : clean.reply;
  const now = scene.getFlag(ID, "askAngel"), messages = cleanMessages([...(now?.messages ?? []), { who: "angel", text: reply, model: by ?? undefined, cost: money ?? undefined }]);
  const ok = await write({ messages, answer: { brief, by: "api", model: by, cost: money, seconds: Number(meta.seconds) || null, dropped, applied: false, at: Date.now() } });
  return ok ? { state: "answered", brief: !!brief, dropped } : { ignored: true, reason: "That ask has been replaced or cleared." };
}
/** The asking GM's window has taken the answer's brief: it isn't taken again when the window opens next, and the brief it made is kept on the
    scene, so a window closed and opened again still has it (review 5). */
export async function markApplied(scene, brief) { if (game.user.isGM && scene.getFlag(ID, "askAngel")?.answer?.brief) await scene.update({ [`flags.${ID}.askAngel.answer.applied`]: true, [`flags.${ID}.brief`]: cleanBrief(brief) }); }
