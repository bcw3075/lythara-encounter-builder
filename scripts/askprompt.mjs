/* Ask Angel inside Foundry (0.43.0, F-7): the pure part. The Build window's chat box writes the GM's words on the scene; the bridge's API worker
   answers with a reply and a filled-in brief, using the tools the module offers (creature and item search, the world's journals, the threat of a
   list) and, when the GM has given the bridge a read-only Notion key, the campaign's Notion pages. Angel fills the window and never places: the
   GM checks, Previews and Places. No Foundry globals here. */
import { ADJUSTMENTS, MOODS, ROLES, STATES } from "./brief.mjs";

export const ASK_WAIT_S = 150;          /* the chat box says Angel hasn't answered after this long (the worker may still answer) */
export const ASK_TTL_S = 600;           /* an ask older than this is no longer answered */
export const ASK_MAX_TURNS = 20;        /* the conversation kept on the scene: the newest messages */
export const ASK_MAX_TEXT = 2000;       /* one message from the GM, and Angel's reply */
export const NOTE_MAX = 6000, NOTES_MAX = 20000;
export const ASK_MODELS = ["sonnet", "opus", "fable"];

/* the system prompt the worker sends (cached): who Angel is here, what she fills in, the answer's shape */
export const ASK_PROMPT = `You are Angel, the game master's co-GM for a Pathfinder 2e (Remaster) campaign, answering inside Foundry VTT's Build Encounter window for one map. The GM talks to you in a chat box; you fill in the window for them. You never place anything: the GM checks what you filled in, presses Preview, then Place it.

What you get: the GM's latest message and the conversation before it; the map (its size, terrain, rooms, where the party comes in); the party (level, how many); the brief the window holds now (what is already filled in); and the map's own journal notes (the scene's journal and the notes pinned on it), written by the GM or by a prep thread from the campaign's notes. Read the notes first and keep to them: who is really here, what they are doing, what they want, what they guard. Invent nothing that contradicts them. When the notes don't say, and you have the Notion tools, look in the campaign's Notion pages (search, then read the page); otherwise search the world's journals. When nothing says, pick what fits the place and say in your reply that it is your guess.

Most asks at the table are random encounters: make them fit the place, the time and the party, quick to read. A planned encounter follows its notes exactly.

Tools: find_creatures (every creature you use must come from it: copy its uuid), find_items (for treasure you name), check_threat (the threat of a list for this party: use it before you answer, and aim for the threat the GM asked for, Moderate when they didn't say), search_journals and read_journal (the world's journals), and, when offered, notion_search and notion_page.

Answer with the JSON alone, no code fence:
{"reply": "<to the GM, plain words, at most 4 short sentences: what you filled in and why, and anything you guessed or couldn't find>",
 "brief": null or {
  "name": "<the encounter's name>", "mood": one of ${JSON.stringify(MOODS)},
  "why": "<why they are here>", "want": "<what they want>", "doing": "<what they were doing when the party arrives>", "retreat": "<when and how they retreat>",
  "partyLevel": <a number, only if the GM asked for another level>,
  "creatures": [{"uuid": "<from find_creatures>", "name": "<its name>", "count": <1 to 30>, "adjust": one of ${JSON.stringify(ADJUSTMENTS)} ("" is normal), "role": one of ${JSON.stringify(ROLES)}, "state": one of ${JSON.stringify(STATES)}, "anchor": "<optional: a thing on the map it keeps near, e.g. camp, cave, ruins>", "mind": {"notes": "<optional: how they fight here, what they were told to do>"}}],
  "treasureMode": "table" (the rules' treasure for the threat), "list" (the treasure below) or "none",
  "treasure": [{"name": "<an item from find_items>", "qty": <n>, "on": "carried" or "cache"}, {"coins": {"gp": <n>, "sp": <n>}, "on": "carried"}],
  "journal": {"truth": "<GM-only: what is really going on>", "locals": "<what people nearby know>", "learn": "<what the party can find out>"}}}

The brief you send replaces the window's: keep what the GM already filled in unless they asked to change it, and send "brief": null when they only asked a question. Starts: "alert" awake and ready, "hidden" awake and in hiding, "unaware" awake but not expecting a fight, "asleep" asleep. Roles: where each stands and how (ambusher, brute, ranged, caster, guard, beast). Use plain words in the reply; no rules jargon the GM didn't use.`;

/* the tools the module answers on the runner's page (api.ask.tool); the worker adds the Notion ones when it has a key */
export const ASK_TOOLS = [
  { name: "find_creatures", description: "Search the world's creatures and the bestiary compendiums by name (and optionally a level range). Returns up to 15: uuid, name, level, size, rarity, traits, compendium. Every creature in the brief must come from here.", input_schema: { type: "object", properties: { query: { type: "string", description: "part of the name, at least 2 letters" }, minLevel: { type: "integer" }, maxLevel: { type: "integer" } }, required: ["query"] } },
  { name: "find_items", description: "Search PF2e's equipment by name for treasure. Returns up to 15: name, level, price in gp, type.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "check_threat", description: "The threat of a list of creatures for this map's party (PF2e's encounter XP): rating, XP and the party it was worked out for.", input_schema: { type: "object", properties: { creatures: { type: "array", items: { type: "object", properties: { uuid: { type: "string" }, count: { type: "integer" }, adjust: { type: "string", enum: ADJUSTMENTS } }, required: ["uuid"] } }, partyLevel: { type: "integer" } }, required: ["creatures"] } },
  { name: "search_journals", description: "Search the world's journals (names and text) for words. Returns up to 8: id, name, a snippet.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "read_journal", description: "Read one journal of the world by its id, as text (cut at 8000 characters).", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }
];
export const ASK_TOOL_NAMES = ASK_TOOLS.map(t => t.name);

const str = (v, max) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
/** Journal HTML as plain text: block ends and <br> become new lines, tags go, entities are read. Pure (no DOM). */
export function plainText(html, max = NOTE_MAX) {
  const t = String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|section|blockquote)>/gi, "\n").replace(/<li[^>]*>/gi, "- ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? `${t.slice(0, max)}… (cut)` : t;
}
/** The conversation as kept on the scene: [{ who: "gm" | "angel", text, model?, cost? }], the newest ASK_MAX_TURNS. */
export function cleanMessages(list = []) {
  return (Array.isArray(list) ? list : []).filter(m => m && ["gm", "angel"].includes(m.who) && str(m.text, ASK_MAX_TEXT)).slice(-ASK_MAX_TURNS)
    .map(m => ({ who: m.who, text: str(m.text, ASK_MAX_TEXT), ...(m.who === "angel" && typeof m.model === "string" ? { model: m.model.slice(0, 40) } : {}), ...(m.who === "angel" && Number.isFinite(m.cost) ? { cost: Math.round(m.cost * 10000) / 10000 } : {}) }));
}
/** A brief in short for the ask: what the window holds, without uuids of minds' history. */
export function briefInShort(b = {}) {
  return { name: b.name ?? "", mood: b.mood ?? "", partyLevel: b.partyLevel ?? null, why: b.why ?? "", want: b.want ?? "", doing: b.doing ?? "", retreat: b.retreat ?? "", treasureMode: b.treasureMode ?? "table",
    creatures: (b.creatures ?? []).map(c => ({ uuid: c.uuid, name: c.name, count: c.count, adjust: c.adjust, role: c.role, state: c.state, ...(c.anchor ? { anchor: c.anchor } : {}), ...(c.mind?.notes?.text ? { notes: c.mind.notes.text } : {}) })),
    treasure: (b.treasure ?? []).map(t => t.coins ? { coins: t.coins, on: t.on } : { name: t.name, qty: t.qty, on: t.on }),
    journal: b.journal ?? {} };
}
/** The one user message the worker sends: the context as JSON, then the conversation, the GM's latest last. Pure. */
export function askText({ scene = "", map = {}, party = {}, brief = {}, notes = [], messages = [] } = {}) {
  const talk = cleanMessages(messages), last = talk.length - 1;
  const lines = talk.map((m, i) => `${i === last && m.who === "gm" ? "The GM now" : m.who === "gm" ? "The GM" : "You (Angel)"}: ${m.text}`);
  return `The map "${scene}" and what the window holds:\n${JSON.stringify({ map, party, brief: briefInShort(brief) })}\n\nThe map's journal notes:\n${notes.length ? notes.map(n => `## ${n.name}${n.made ? " (written by the module's last build here)" : ""}\n${n.text}`).join("\n\n") : "(none on this map)"}\n\nThe conversation:\n${lines.join("\n")}\n\nAnswer with the JSON alone.`;
}
/** Angel's answer checked: { reply, brief } or { error }. The brief is only shaped here; its creatures and items are checked on the page. Pure. */
export function cleanAskAnswer(a) {
  if (typeof a === "string") { const t = a.trim(); try { a = JSON.parse(t); } catch { const i = t.indexOf("{"), j = t.lastIndexOf("}"); try { a = i >= 0 && j > i ? JSON.parse(t.slice(i, j + 1)) : null; } catch { a = null; } } }
  if (!a || typeof a !== "object" || Array.isArray(a)) return { error: "the answer wasn't the JSON asked for" };
  const reply = str(a.reply, ASK_MAX_TEXT);
  if (!reply) return { error: "the answer had no reply to you" };
  if (a.brief == null) return { reply, brief: null };
  if (typeof a.brief !== "object" || Array.isArray(a.brief)) return { error: "the answer's brief wasn't an object" };
  if (!Array.isArray(a.brief.creatures)) return { error: "the answer's brief had no creatures list" };
  return { reply, brief: a.brief };
}
/** Words for the box's status line. Pure. */
export function waitWords(seconds) {
  return seconds < ASK_WAIT_S ? null : `Angel hasn't answered in ${Math.round(seconds / 60 * 10) / 10} minutes. Answers need the bridge's API worker (version 0.4.4 or later) with its API key, running and not stopped; this ask stays open for ${Math.round(ASK_TTL_S / 60)} minutes in all.`;
}
export const costWords = cost => !Number.isFinite(cost) ? "" : cost < 0.01 ? "under 1¢" : `${Math.round(cost * 100)}¢`;
