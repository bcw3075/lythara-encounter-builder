/* Lythara Encounter Builder: Point Out (0.30.0, monster minds release 3, tier 3d). A creature that sees an enemy its allies have lost spends one
   action (auditory, manipulate, visual) to show them where it is. An ally that sees it point and understands it has the creature hidden at its
   square; one that only sees the gesture rolls Perception against the creature's Stealth DC and, on a failure, believes a square that can be
   wrong (only the GM is told). Pure: no Foundry globals. Rhea's decisions (q-18, R3-17) and the design review's finding 15 are in
   docs/features/point-out.md. Rules: Point Out (Player Core, https://2e.aonprd.com/Actions.aspx?ID=97: the creature is hidden to its allies rather than undetected, only for allies who can see the pointer). */

const LOST = ["undetected", "unnoticed"], SEES = ["observed", "concealed"];
/** Has an observer lost a creature (it has no square for it)? */
export const hasLost = state => LOST.includes(state);

/** What a pointed-out belief does to how one creature perceives another (design review 15: the one place a stored state can make things
    better, and only this far). own: { state, by } from its own senses; belief: { square, round, wrong? } or null. A belief counts only while its
    own senses give it no square (undetected or unnoticed): then the creature is hidden to it at the believed square. Anything its own senses
    say is kept as it is. */
export function withBelief(own, belief) {
  if (!belief || !Array.isArray(belief.square) || !hasLost(own?.state)) return { ...own, pointed: false };
  return { state: "hidden", by: "pointed", pointed: true, square: [...belief.square], wrong: !!belief.wrong };
}
/** Whether a creature can be pointed out by this one: it sees the creature itself (observed or concealed: "only by one that sees it"), and at
    least one of its allies has lost it. Out: { ok } or { ok: false, why }. */
export function canPointOut({ state = null, lostBy = 0, cantAct = null, restrained = false, below = false } = {}) {
  const no = why => ({ ok: false, why });
  if (cantAct) return no(cantAct);
  if (restrained) return no("it is restrained, so it can't Point Out (a manipulate action)");
  if (below) return no("it is under the ground");
  if (!SEES.includes(state)) return no("it doesn't see that creature itself (only a creature it sees can be pointed out)");
  if (!(lostBy > 0)) return no("none of its allies has lost track of that creature");
  return { ok: true };
}
/** What one ally gets from the gesture. ally: { knows (its own senses already give it a square), seesPointer, hears, sharesLanguage, asleep }.
    Out: "knows" (nothing to learn), "cantsee" (it can't see the pointer: it learns nothing), "understood" (the creature is hidden to it at its
    real square), or "roll" (it sees the gesture but can't follow the words: a Perception check against the creature's Stealth DC). */
export function allyGets(ally = {}) {
  if (ally.asleep) return "cantsee";
  if (ally.knows) return "knows";
  if (!ally.seesPointer) return "cantsee";
  return ally.hears && ally.sharesLanguage ? "understood" : "roll";
}
/** A square near the real one that isn't it, for an ally that misread the gesture: one or two squares off, inside the map. rnd: () => [0, 1).
    Null when the map has no other square in reach (never on a real map). */
export function wrongSquare(real, [cols, rows] = [0, 0], rnd = Math.random) {
  const out = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { if (!dx && !dy) continue; const x = real[0] + dx, y = real[1] + dy; if (x >= 0 && y >= 0 && (!cols || x < cols) && (!rows || y < rows)) out.push([x, y]); }
  return out.length ? out[Math.min(out.length - 1, Math.floor(rnd() * out.length))] : null;
}
/** One ally's result as the turns flag keeps it, from what it gets and (for a roll) its Perception total against the Stealth DC.
    Out: { id, how, total?, dc?, ok?, square?, wrong? }; `square` is what it now believes, `wrong` only when that isn't the real square. */
export function allyResult(id, how, { real, total = null, dc = null, wrongAt = null } = {}) {
  if (how === "understood") return { id, how, square: [...real] };
  if (how !== "roll") return { id, how };
  const ok = total != null && dc != null && total >= dc;
  return ok || !wrongAt ? { id, how, total, dc, ok: true, square: [...real] } : { id, how, total, dc, ok: false, square: [...wrongAt], wrong: true };
}
/** The GM's box under the step (her sample): one line an ally, in names. list: allyResult's, with `name`; lang: the pointer's language in words. */
export function pointLines(list = [], { target = "it", real = null, pointer = "it", lang = null } = {}) {
  const at = s => `[${s[0]}, ${s[1]}]`;
  return list.map(x => x.how === "understood" ? { name: x.name, text: `can see it point and understand it: ${target} is hidden to it at ${at(x.square)}.` }
    : x.how === "roll" ? { name: x.name, text: `sees the gesture but can't ${lang ? `understand ${lang}` : "follow the words"}: Perception ${x.total} vs ${target}'s Stealth DC ${x.dc}, ${x.ok ? "success" : "failure"}: it ${x.ok ? "has" : "believes"} ${target} ${x.ok ? "hidden " : ""}at ${at(x.square)}.`, ...(x.wrong && real ? { gm: `GM only: wrong, ${target} is at ${at(real)}` } : {}) }
    : x.how === "knows" ? { name: x.name, text: `already knows where ${target} is.` }
    : { name: x.name, text: `can't see ${pointer}: learns nothing.` });
}
/** Before the step runs: what each ally would get, in the same words without results. */
export function previewLines(list = [], { target = "it", pointer = "it", lang = null } = {}) {
  return list.map(x => ({ name: x.name, text: x.how === "understood" ? `can see it point and understand it: ${target} will be hidden to it at its square.` : x.how === "roll" ? `sees the gesture but can't ${lang ? `understand ${lang}` : "follow the words"}: a Perception check against ${target}'s Stealth DC; on a failure it believes a wrong square.` : x.how === "knows" ? `already knows where ${target} is.` : `can't see ${pointer}: learns nothing.` }));
}
/** The step's result for the thinker: how many allies it reached, never whether a believed square is right. */
export function pointResult(rec = {}) {
  const p = rec.pointed; if (!p) return rec.skipped ? `not pointed out (${rec.skipped})` : "unknown";
  const got = (p.list ?? []).filter(x => x.square).length, lost = (p.list ?? []).filter(x => x.how !== "knows").length;
  return `pointed out: ${got} of the ${lost} who had lost it now ha${got === 1 ? "s" : "ve"} a square for it`;
}
/** How far a believed square is from where the observer stands, in feet, as PF2e counts squares (every second diagonal 10 ft). */
export function squareFeet(a, b) { const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]), d = Math.min(dx, dy), s = Math.max(dx, dy) - d; return (s + d + Math.floor(d / 2)) * 5; }
