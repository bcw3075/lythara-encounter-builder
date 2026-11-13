/* Lythara Encounter Builder: Command an Animal (0.30.0, monster minds release 3, tier 3d). A creature spends one action (auditory, concentrate)
   to give an animal on its side one simple instruction for the animal's next turn: a real Nature check against the animal's Will DC. Pure: no
   Foundry globals, so the unit tests run it in Node. Rhea's decisions (R3-6, R3-16, q-17, q-18) and what the design review asked for are in
   docs/features/command-animal.md. Rules: Command an Animal (Player Core, https://2e.aonprd.com/Actions.aspx?ID=2400: success, it does as commanded on its next turn; failure, it does nothing; critical failure, some other action the GM picks; the check fails at once on a hostile or unfriendly animal). */

import { IT, pro } from "./pronoun.mjs";

/** The instructions an animal can be given (R3-6: "that one", "over there"): attack a creature, go to a square, or stay where it is. */
export const INSTRUCTIONS = ["attack", "go", "stay"];
export const DEAF_FLAT = 5;   /* an auditory action from a deafened creature: a DC 5 flat check first, or the action is lost */
const LABEL = /^[EM]\d{1,3}$/, sq = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isInteger(n) && n >= 0 && n < 1000);

/** A command as a plan's step gives it: { ok, command: { instruction, foe?, to? } } or { ok: false, reason }. Data only, never a sentence. */
export function cleanCommand(raw = {}) {
  const bad = reason => ({ ok: false, reason });
  if (!INSTRUCTIONS.includes(raw?.instruction)) return bad(`a "command-animal" step needs "instruction": "attack" (with "foe", the label of a creature the handler perceives), "go" (with "to": [x, y]) or "stay".`);
  if (raw.instruction === "attack") { if (typeof raw.foe !== "string" || !LABEL.test(raw.foe)) return bad(`an "attack" command needs "foe": the label of the creature the animal is set on.`); return { ok: true, command: { instruction: "attack", foe: raw.foe } }; }
  if (raw.instruction === "go") { if (!sq(raw.to)) return bad(`a "go" command needs "to": the square the animal is sent to, [x, y].`); return { ok: true, command: { instruction: "go", to: [...raw.to] } }; }
  return { ok: true, command: { instruction: "stay" } };
}
/** The instruction in words, in labels: "attack E2", "go to square 7, 4", "stay where it is" (forms: the animal's own pronoun, pronoun.mjs). */
export const commandWords = (c, forms = IT) => c?.instruction === "attack" ? `attack ${c.foe}` : c?.instruction === "go" ? `go to square ${c.to?.[0]}, ${c.to?.[1]}` : pro("stay where {they} {is|are}", forms);

/** Whether this creature can be commanded by this handler, as things stand (q-17: PF2e's `animal` trait only; on the handler's side; it must
    hear the handler). animal: { self, ally, traits, fallen, yielded, asleep, deafened, below, path (false: a wall stops the sound; null: not
    tested), pending (it already carries a command it hasn't acted on), played (false: a player runs it), inFight (false: it has no place in
    the fight's order, so no turn would ever come for the command), pro (the animal's own pronoun) }. forms: the handler's own pronoun.
    Out: { ok } or { ok: false, why }. */
export function canCommand({ animal = null, handlerBelow = false, forms = IT } = {}) {
  const no = why => ({ ok: false, why: pro(why, forms, animal?.pro ?? IT) });   /* {they}: the handler; {they2}: the animal */
  if (!animal) return no("{they} {doesn't|don't} know of that creature");
  if (animal.self) return no("{they} can't command {themself}");
  if (!animal.ally) return no("{they2} {is|are|2} hostile or unfriendly to {them} (Command an Animal fails at once on such an animal)");
  if (!(animal.traits ?? []).includes("animal")) return no("{they2} {isn't|aren't|2} an animal (only a creature with the animal trait can be commanded)");
  if (animal.played === false) return no("a player runs {them2} (the module doesn't play {them2}, so {they2} can't be held to a command)");
  if (animal.inFight === false) return no("{they2} {isn't|aren't|2} in this fight's order");
  if (animal.fallen) return no("{they2} {is|are|2} down");
  if (animal.yielded) return no("{they2} {has|have|2} yielded");
  if (animal.asleep) return no("{they2} {is|are|2} unconscious");
  if (animal.deafened) return no("{they2} {is|are|2} deafened and can't hear the command");
  if (handlerBelow || animal.below) return no("earth lies between them (one of them is under the ground)");
  if (animal.path === false) return no("{they2} {is|are|2} out of earshot (no sound reaches {them2} from the handler)");
  if (animal.pending) return no("{they2} already {carries|carry|2} a command for {their2} next turn");
  return { ok: true };
}
/** PF2e's four degrees from a total against a DC, with the natural 1 and 20 steps: 0 critical failure … 3 critical success. */
export function degreeOf(total, dc, die = null) {
  let d = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (die === 20) d = Math.min(3, d + 1); else if (die === 1) d = Math.max(0, d - 1);
  return d;
}
/** What a result means for the animal's next turn (R3-6): "obeys" (it must carry the instruction out), "nothing" (it does nothing: the module
    passes its turn) or "gm" (it does something else, the GM's choice: its turn waits for her). */
export const outcomeOf = degree => degree >= 2 ? "obeys" : degree === 1 ? "nothing" : "gm";

/** Is a stored command in force for this turn of the animal's? cmd: { round, degree, used: { round } }. A command is for the animal's next
    turn: the first one to start after it was given (`used` is stamped then) and, within that turn, every re-plan of it. */
export function commandInForce(cmd, round) { return !!cmd && Number.isInteger(cmd.degree) && (!cmd.used || cmd.used.round === round); }
/** A command whose turn has come and gone. */
export const commandSpent = (cmd, round) => !!cmd?.used && cmd.used.round !== round;

/** The handler's own line for the result, for its card and the History (the GM's page turns labels into names). */
export function resultWords(rec = {}, animal = "the animal", { forms = IT, animalForms = IT } = {}) {
  const c = rec.check; if (!c) return rec.skipped ? `No command given: ${rec.skipped}.` : rec.flat && !rec.flat.ok ? pro(`Deafened: {their} DC ${rec.flat.dc} flat check failed (${rec.flat.total}), and the command is lost.`, forms) : "";
  const head = `${["Critical failure", "Failure", "Success", "Critical success"][c.degree] ?? "Done"} · Nature ${c.total}${c.die != null ? ` (rolled ${c.die})` : ""} vs ${animal}'s Will DC ${c.dc}.`;
  return pro(`${head} ${c.degree >= 2 ? `${animal} will ${rec.words ?? "do as told"} on {their} next turn.` : c.degree === 1 ? `${animal} does nothing on {their} next turn.` : `${animal} does something else on {their} next turn: you choose what.`}`, animalForms);
}
/** What the animal's packet carries of a command in force (schema 7): the instruction in labels, and that it binds this turn. `from`: the
    handler's label when the animal knows it as an ally; `sees`: whether the animal itself perceives the creature it was set on. A command that
    critically failed and was handed to Angel says the opposite: it does anything but what was asked. */
export function commandForPacket(cmd, { from = null, sees = true, forms = IT } = {}) {
  if (!cmd) return null;
  const words = commandWords(cmd, forms), say = text => pro(text, forms);   /* the animal's own pronoun */
  if (cmd.degree <= 0) return { from, went: "wrong", told: words, must: say(`{Their} handler's command went badly wrong: this turn {they} {does|do} something else, by {their} own animal mind, and not what {they} {was|were} told (${words}).`) };
  return { from, told: words, must: say(`{Their} handler commanded {them} and {they} {obeys|obey}: {they} {spends|spend} this turn doing that as well as {they} can (${cmd.instruction === "attack" ? "close with that creature and attack it; nothing else comes first" : cmd.instruction === "go" ? "move to that square, or as near as {they} can get, before anything else" : "{they} {doesn't|don't} leave {their} square; {they} may still attack what comes into reach"}).`),
    ...(cmd.instruction === "attack" && !sees ? { unseen: say(`{They} {doesn't|don't} perceive ${cmd.foe} {themself}: {they} can't target it yet. {They} {moves|move} toward where {their} handler is facing the enemy, or {Seeks|Seek}, and {attacks|attack} once {they} {perceives|perceive} it.`) } : {}) };
}
/** The tag on the animal's row of Monster Turns, in labels. */
export function commandTag(cmd, round, isTurn = false, forms = IT) {
  if (!commandInForce(cmd, round)) return null;
  const o = outcomeOf(cmd.degree);
  if (o === "obeys") return { kind: "ok", text: `commanded: ${commandWords(cmd, forms)}` };
  if (o === "nothing") return { kind: "bad", text: isTurn && !cmd.own ? "command failed · turn passed" : cmd.own ? "command failed · yours to play" : "command failed" };
  return { kind: "warn", text: cmd.angel ? "command critically failed · Angel plans it" : "command critically failed · your choice" };
}
/** The band log's line for a command (History), in labels. e: { k: "command", by, tok, r, degree, words, total, dc }. */
export function commandLogWords(e, { nameOf = id => id, named = s => s, formsOf = () => IT } = {}) {
  const say = text => pro(text, formsOf(e.tok));   /* the animal's own pronoun */
  const how = say(e.degree >= 2 ? `{they} will ${named(e.words ?? "do as told")} on {their} next turn` : e.degree === 1 ? "{they} {does|do} nothing on {their} next turn" : "{they} {does|do} something else on {their} next turn, the GM's choice");
  if (e.k === "command") return `${nameOf(e.by)} commanded ${nameOf(e.tok)} (Nature ${e.total} vs Will DC ${e.dc}: ${["a critical failure", "a failure", "a success", "a critical success"][e.degree] ?? "done"}): ${how}.`;
  if (e.k === "commandOwn") return say(`${nameOf(e.tok)}: {their} handler's command ${e.degree === 0 ? "critically failed" : "failed"}; played by the GM.`);
  if (e.k === "commandAngel") return say(`${nameOf(e.tok)}: {their} handler's command critically failed; the GM let Angel plan what {they} {does|do} instead.`);
  return "";
}
/** The command lines the fight's log keeps (the History reads them; a handler's own step is already in its turn). */
export const COMMAND_LOG = ["commandOwn", "commandAngel"];
