/* The API route (0.31.0): who thinks for a fight's monsters, and which model. Pure: no Foundry globals; fight.mjs keeps the route on the Combat
   flag and the API thinker's light in world settings, the bridge's worker does the calling. See docs/features/api-route.md.
   Rhea, 2026-11-12: Sonnet by default, Opus for band leaders "and Opus on the bosses with spells as well". 2026-11-13 (q-28-api): a boss with
   spells is any monster that can cast spells and is two or more levels above the party, with a per-monster Opus tick, set by that rule and hers
   to flip either way. */

/** The ways a fight's monsters can be thought for: the API (the bridge's worker), a chat (through the bridge's fight tools), or nobody. */
export const ROUTES = ["api", "chat", "off"];
export const ROUTE_WORDS = { api: "API", chat: "Chat", off: "Off" };
export const MODELS = ["sonnet", "opus"];
const MODEL_WORDS = { sonnet: "Sonnet", opus: "Opus" };
/** How many levels above the party a spellcaster must be for Opus (q-28-api). */
export const OPUS_LEVELS_ABOVE = 2;
/** The event kinds the API answers: a stall asks the thinker to look into something, which only a chat with tools can do. */
export const API_KINDS = ["turn", "retry", "replan", "choice"];

/** A fight's route: its own when it has one, else the setting for new fights, else the API. */
export const routeOf = (own, fallback = "api") => ROUTES.includes(own) ? own : ROUTES.includes(fallback) ? fallback : "api";

/** Which model thinks for one monster, and why, in words for the GM.
    In: pick (her tick: "opus" | "sonnet" | null for the rule); leads (it leads its band now, a successor included); casts (its stat block has a
    spell outside rituals); level, partyLevel (numbers, or null when unknown). Out: { model, by: "gm" | "rule", why, rule } where `rule` is what
    the rule alone would pick, so the window can say what unticking undoes. */
export function modelFor({ pick = null, leads = false, casts = false, level = null, partyLevel = null } = {}) {
  const above = Number.isFinite(level) && Number.isFinite(partyLevel) ? level - partyLevel : null;
  const boss = casts && above != null && above >= OPUS_LEVELS_ABOVE;
  const rule = leads || boss ? "opus" : "sonnet";
  const why = leads ? "leads its band" : boss ? `casts spells and is level ${level}, ${above} above the party (${partyLevel})` : casts && above != null ? `casts spells, but is ${above >= 0 ? `only ${above} above` : `${-above} below`} the party` : "";
  if (MODELS.includes(pick)) return { model: pick, by: "gm", why, rule };
  return { model: rule, by: "rule", why, rule };
}
/** A model's short name: a pick ("opus") or an API model id ("claude-opus-5-5" → "Opus 5.5"). */
export function modelName(m) {
  const s = String(m ?? ""); if (MODEL_WORDS[s]) return MODEL_WORDS[s];
  const x = s.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/i); if (!x) return s;
  return `${x[1][0].toUpperCase()}${x[1].slice(1)} ${x[2]}${x[3] ? `.${x[3]}` : ""}`;
}

/** How long a turn stays with the thinker it was given to, even if that thinker's light lapses meanwhile (a slow answer): the API's three tries
    take at most about three and a half minutes. */
export const HOLD_MS = 240000;
/** Who an event in a fight goes to. route: the fight's; kind: the event's; api, chat: whether each thinker is listening now; handedOff: the API
    gave this turn up and it fell back to the chat; held: { who, at } when the turn was already given to a thinker (0.31.0 review 1: a turn
    stays with that thinker while it listens, or for HOLD_MS, so two thinkers never plan one turn); now: the server clock.
    Out: "api", "chat" or null (nobody: Rhea plays it). The agreed order is API, then a listening chat, then her: a turn on the API route goes to
    the chat while the API isn't listening, and the chat answers anything the API can't. */
export function whoGets({ route = "api", kind = "turn", api = false, chat = false, handedOff = false, held = null, now = 0 } = {}) {
  if (route === "off") return null;
  if (route === "chat") return "chat";
  if (!API_KINDS.includes(kind) || handedOff) return "chat";
  if (held?.who === "api" || held?.who === "chat") { if ((held.who === "api" ? api : chat) || (Number.isFinite(held.at) && now >= held.at && now - held.at < HOLD_MS)) return held.who; }
  return api ? "api" : "chat";
}
/** The line at the top of the Monster Turns window, as data: which light is on and what it says. */
export function listenLine({ route = "api", api = false, chat = false } = {}) {
  if (route === "off") return { on: false, text: "Angel is off for this fight." };
  if (route === "chat") return chat ? { on: true, text: "Angel is listening", via: "chat" } : { on: false, text: "Angel isn't listening." };
  if (api) return { on: true, text: "Angel is listening", via: "API" };
  if (chat) return { on: true, text: "Angel is listening", via: "chat: the API isn't" };
  return { on: false, text: "Angel isn't listening." };
}

/** The API thinker's own note, as the bridge's worker writes it: why it stopped, or that it has no key. Words for the card, or "". */
export function apiNoteWords(note) {
  if (!note || typeof note !== "object") return "";
  const why = typeof note.reason === "string" ? note.reason.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200) : "";
  if (note.state === "no-key") return "The bridge has no API key: add \"anthropicApiKey\" to its config.json and restart it.";
  if (note.state === "stopped") return `The API route stopped${why ? `: ${why}` : ""}.`;
  if (note.state === "capped") return `The API route stopped${why ? `: ${why}` : ": too many calls this hour"}.`;
  return "";
}
/** How long Wake Angel waits for the light before saying nothing answered. */
export const WAKE_MS = 20000;
/** Where a press of Wake Angel stands. wake: the setting ({ n, at, launch }); now, launch: the page's server clock and launch; api: the light;
    seenAt: when the API thinker last listened (in this launch), so a press it answered never reads as unanswered later (0.31.0 review 6). */
export function wakeState(wake, { now = 0, launch = "", api = false, seenAt = 0 } = {}) {
  if (!wake?.at || (wake.launch ?? "") !== launch || now < wake.at) return null;
  if (api || (Number.isFinite(seenAt) && seenAt >= wake.at)) return null;
  return now - wake.at < WAKE_MS ? "waking" : "silent";
}

/** One plan's usage, in words for the History: "API, Opus 5.5 · 9.8 s · 4¢". by: the plan's `by` ({ by, model, usage }). */
export function byWords(by) {
  if (!by) return null;
  const route = { chat: "Angel (chat)", api: "Angel (API)", gm: "a GM" }[by.by] ?? "a GM", model = by.model ? modelName(by.model) : null;
  const head = by.by === "api" ? `Angel (API${model ? `, ${model}` : ""})` : `${route}${model ? `, ${model}` : ""}`;
  const u = by.usage, bits = [];
  if (Number.isFinite(u?.seconds)) bits.push(`${u.seconds.toFixed(1)} s`);
  if (Number.isFinite(u?.cost)) bits.push(cents(u.cost));
  return bits.length ? `${head} · ${bits.join(" · ")}` : head;
}
/** Dollars as the History shows them: cents under a dollar ("4¢", "under 1¢"), else "$1.23". */
export const cents = d => !Number.isFinite(d) ? "" : d >= 1 ? `$${d.toFixed(2)}` : d === 0 ? "0¢" : d < 0.005 ? "under 1¢" : `${Math.round(d * 100)}¢`;
/** What the API cost this fight (0.31.0 review 8): one entry per answer the API gave, as the bridge's worker records it on the fight
    (`apiUse`), whether the plan in it landed or not: { n, cost, priced, models: { name: n } }. */
export function apiTotal(uses = []) {
  const out = { n: 0, cost: 0, priced: 0, models: {} };
  for (const u of uses) { if (!u || typeof u !== "object") continue; out.n++; if (Number.isFinite(u.cost)) { out.cost += u.cost; out.priced++; } const m = modelName(u.model) || "?"; out.models[m] = (out.models[m] ?? 0) + 1; }
  return out;
}
/** The History's line for the fight's API use, or "" when the API answered nothing. */
export function apiTotalWords(t) {
  if (!t?.n) return "";
  const by = Object.entries(t.models).map(([m, n]) => `${m.replace(/ [\d.]+$/, "")} ${n}`).join(", ");
  const cost = t.priced ? `${cents(t.cost)}${t.priced < t.n ? " for the ones with a price" : ""}` : "no price known";
  return `Angel through the API this fight: ${t.n} answer${t.n === 1 ? "" : "s"}, ${cost}${by ? ` (${by})` : ""}.`;
}
