/* Lythara Encounter Builder: speech to the party and yielding (0.29.0, monster minds release 3, tier 3c). A monster may say one sentence a round
   to the party: to yield, to bargain or to threaten (Rhea, R3-7; any monster that knows a language: her answer of 2026-11-11). The line in chat is
   one public message; each browser shows it by what its player's character understands (R3-4), and a monster the GM has hidden speaks as
   "A voice". A monster that yields stands down until the GM answers on its row: Accepted (a prisoner, out of the fight) or Fight on.
   Pure: no Foundry globals, so the unit tests run it in Node. Rhea's decisions and the review's lines are in docs/features/speech.md. */
import { cutWords } from "./minds.mjs";

export const SAY_INTENTS = ["yield", "bargain", "threat"];
export const SAY_CAP = 160;
const str = v => String(v ?? "").replace(/\s+/g, " ").trim(), esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** A label in a sentence said aloud is nobody's name: the monster points ("that one"). The table never reads "E2", and a label is never turned
    into a party member's name the monster doesn't know (design review 11). */
export const spoken = s => str(s).replace(/\b[EM]\d{1,3}\b/g, "that one");

/** A `say` step, cleaned: { intent, words }. A yield may come with no words (a creature that can't speak gives itself up by what it does). */
export function cleanSay(raw) {
  const bad = reason => ({ ok: false, reason }); if (!raw || typeof raw !== "object") return bad("A say step is an object.");
  if (!SAY_INTENTS.includes(raw.intent)) return bad(`a "say" step needs "intent": "yield" (it gives itself up), "bargain" (it offers something to end the fight) or "threat".`);
  const words = cutWords(spoken(raw.say), SAY_CAP);
  if (!words && raw.intent !== "yield") return bad(`a "say" step needs "say": the one sentence it says, in its own voice.`);
  return { ok: true, say: { intent: raw.intent, words } };
}
/** May this creature speak to the party now, and may it yield? In: party (it fights on the party's side), cantAct (why it can't act, or null),
    langs (the languages on its sheet), below (it is under the ground), round, last (the round it last spoke in), yielded (it has yielded and
    stands down), over ({ round, how }: an earlier yield of this fight that ended: "refused", "struck", "own" or "back").
    Out: { say: { ok, why }, yield: { ok, why } }. A yield needs no language; one sentence a round (the rule for speaking, as for orders). */
export function speechFor({ party = false, cantAct = null, langs = [], below = false, round = 0, last = null, yielded = false, over = null } = {}) {
  const no = why => ({ ok: false, why }), ok = { ok: true };
  const say = party ? no("the party's side speaks through the GM") : cantAct ? no("it can't act, so it can't speak") : yielded ? no("it has yielded and stands down") : !(langs ?? []).length ? no("it speaks no language")
    : below ? no("it is under the ground, where nobody hears it") : last != null && last === round ? no("it has said its sentence for this round (one a round)") : ok;
  const yieldNow = party ? no("the party's side doesn't yield through the module") : cantAct ? no("it can't act, so it can't show that it gives up") : yielded ? no("it has already yielded")
    : over ? no(OVER[over.how] ? `${OVER[over.how]} in round ${over.round}: it doesn't yield again in this fight` : "it yielded once in this fight already") : below ? no("it is under the ground, where nobody sees or hears it") : ok;
  return { say, yield: yieldNow };
}
const OVER = { refused: "the party refused its yield", struck: "it was struck after it yielded", own: "its yield was set aside", back: "it was taken prisoner and is back in the fight" };
/** What a packet carries of this (schema 6), after `orders`: whether it may say its sentence and whether it may yield, with the reason when not,
    and what became of an earlier yield. Null for the party's side. */
export function speechForPacket(ctx, { party = false } = {}) {
  if (party || !ctx) return null;
  return { can: !!ctx.say?.ok, ...(ctx.say?.ok ? {} : { why: ctx.say?.why ?? "" }), canYield: !!ctx.yield?.ok, ...(ctx.yield?.ok ? {} : { yieldWhy: ctx.yield?.why ?? "" }) };
}
/** The language it speaks to the party in: Common when it has it (the tongue most likely shared), else the first on its sheet. The module never
    reads the party's languages to choose: that would tell a monster what its enemies understand. */
export const speechLanguage = (langs = []) => (langs ?? []).includes("common") ? "common" : (langs ?? [])[0] ?? null;
/** A yield anyone can read without the language (design review 11). `armed`: it holds a weapon. */
export const gestureWords = ({ armed = false } = {}) => armed ? "Drops its weapon and throws up its hands." : "Backs down and stops fighting.";
/** Does a player understand the language? langSets: the language lists of the characters that player owns in the fight. */
export const understands = (langSets = [], lang = null) => !!lang && (langSets ?? []).some(l => (l ?? []).includes(lang));
const INTENT = { yield: "a yield", bargain: "a bargain", threat: "a threat" };

/** The line in chat as one browser shows it. flag: { words, lang, langName, intent, gesture, voice (the GM has hidden the speaker), who }.
    view: { gm, knows, understood: [n, m] | null }. With no view it is the text the message itself stores: what a player who doesn't know the
    language reads, so nothing more is on the screen of a browser the render hook never reached. "" when there is nothing a player may see. */
export function sayHtml(flag = {}, view = {}) {
  const lang = flag.langName ? ` in ${esc(flag.langName)}` : "", sign = flag.gesture && !flag.voice ? `<p><em>${esc(flag.gesture)}</em></p>` : "", words = spoken(flag.words);
  if (view.gm) {
    const small = [flag.voice ? `${esc(flag.who ?? "A hidden creature")} (hidden)` : "", flag.langName && words ? `In ${esc(flag.langName)}` : "", INTENT[flag.intent] ?? "",
      words && Array.isArray(view.understood) ? `understood by ${view.understood[0]} of the party's ${view.understood[1]}` : ""].filter(Boolean).join(" · ");
    return `<p><strong>${flag.intent === "yield" ? "Yields" : "Says"}</strong> <span class="action-glyph">F</span> ${words ? `“${esc(words)}”` : "(no words)"}</p>${flag.gesture ? `<p><em>${esc(flag.gesture)}</em></p>` : ""}<p style="font-size:var(--font-size-12);opacity:.75;border-top:1px solid #8884;margin-top:4px;padding-top:3px">${small}</p>`;
  }
  if (!words) return sign;
  if (view.knows) return `<p><em>In ${esc(flag.langName ?? "its own tongue")}:</em> “${esc(words)}”</p>${sign}`;
  return `<p>${flag.voice ? "A voice shouts something" : "Shouts something"}${lang}.</p>${sign}`;
}
/** A leader's order as a player whose character knows the language reads it (R3-4, the part tier 3b left): the sentence it shouted when there
    was one, else what it ordered, in words made for players (`pwords`: no creature the GM has hidden is named). */
export function orderHtml(o = {}) {
  const lang = esc(o.lang ?? "its own tongue");
  return o.say ? `<p><em>In ${lang}:</em> “${esc(spoken(o.say))}”</p>` : o.pwords ? `<p><em>In ${lang}, to its band:</em> ${esc(o.pwords)}</p>` : "";
}
/** Does damage end a yield (R3-7: "hit after it yields, it goes back to its own mind")? Only a blow from an enemy: healing, lasting damage and
    anything from its own side or from nobody the card names leave it standing down (design review 3). */
export const breaksYield = ({ healing = false, lasting = false, enemy = false } = {}) => !healing && !lasting && enemy === true;
/** Yielding in the fight's log, in the GM's words. Entries: { k: "accepted" | "fighton" | "struck" | "own" | "back", r, tok, by }. */
export function speechLogWords(e, { nameOf = id => id } = {}) {
  const who = nameOf(e?.tok);
  if (e?.k === "accepted") return `${who}'s yield was accepted: a prisoner, out of the fight.`;
  if (e?.k === "fighton") return `${who}'s yield was refused: it fights on.`;
  if (e?.k === "struck") return `${who} was struck${e.by ? ` by ${nameOf(e.by)}` : ""} after it yielded: it goes back to its own mind.`;
  if (e?.k === "own") return `${who}'s yield was set aside: the GM plays it.`;
  if (e?.k === "back") return `${who}, a prisoner, is back in the fight.`;
  return "";
}
export const SPEECH_LOG = ["accepted", "fighton", "struck", "own", "back"];
