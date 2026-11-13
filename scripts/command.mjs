/* Lythara Encounter Builder: Command an Animal (0.30.0, monster minds release 3, tier 3d). A creature spends one action (auditory, concentrate)
   to give an animal on its side one simple instruction for the animal's next turn: a real Nature check against the animal's Will DC. Pure: no
   Foundry globals, so the unit tests run it in Node. Rhea's decisions (R3-6, R3-16, q-17, q-18) and what the design review asked for are in
   docs/features/command-animal.md. Rules: Command an Animal (Player Core, https://2e.aonprd.com/Actions.aspx?ID=2400: success, it does as commanded on its next turn; failure, it does nothing; critical failure, some other action the GM picks; the check fails at once on a hostile or unfriendly animal). */

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
/** The instruction in words, in labels: "attack E2", "go to square 7, 4", "stay where it is". */
export const commandWords = c => c?.instruction === "attack" ? `attack ${c.foe}` : c?.instruction === "go" ? `go to square ${c.to?.[0]}, ${c.to?.[1]}` : "stay where it is";

/** Whether this creature can be commanded by this handler, as things stand (q-17: PF2e's `animal` trait only; on the handler's side; it must
    hear the handler). animal: { self, ally, traits, fallen, yielded, asleep, deafened, below, path (false: a wall stops the sound; null: not
    tested), pending (it already carries a command it hasn't acted on), played (false: a player runs it), inFight (false: it has no place in
    the fight's order, so no turn would ever come for the command) }. Out: { ok } or { ok: false, why }. */
export function canCommand({ animal = null, handlerBelow = false } = {}) {
  const no = why => ({ ok: false, why });
  if (!animal) return no("it doesn't know of that creature");
  if (animal.self) return no("it can't command itself");
  if (!animal.ally) return no("it is hostile or unfriendly to it (Command an Animal fails at once on such an animal)");
  if (!(animal.traits ?? []).includes("animal")) return no("it isn't an animal (only a creature with the animal trait can be commanded)");
  if (animal.played === false) return no("a player runs it (the module doesn't play it, so it can't be held to a command)");
  if (animal.inFight === false) return no("it isn't in this fight's order");
  if (animal.fallen) return no("it is down");
  if (animal.yielded) return no("it has yielded");
  if (animal.asleep) return no("it is unconscious");
  if (animal.deafened) return no("it is deafened and can't hear the command");
  if (handlerBelow || animal.below) return no("earth lies between them (one of them is under the ground)");
  if (animal.path === false) return no("it is out of earshot (no sound reaches it from the handler)");
  if (animal.pending) return no("it already carries a command for its next turn");
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
export function resultWords(rec = {}, animal = "the animal") {
  const c = rec.check; if (!c) return rec.skipped ? `No command given: ${rec.skipped}.` : rec.flat && !rec.flat.ok ? `Deafened: its DC ${rec.flat.dc} flat check failed (${rec.flat.total}), and the command is lost.` : "";
  const head = `${["Critical failure", "Failure", "Success", "Critical success"][c.degree] ?? "Done"} · Nature ${c.total}${c.die != null ? ` (rolled ${c.die})` : ""} vs ${animal}'s Will DC ${c.dc}.`;
  return `${head} ${c.degree >= 2 ? `${animal} will ${rec.words ?? "do as told"} on its next turn.` : c.degree === 1 ? `${animal} does nothing on its next turn.` : `${animal} does something else on its next turn: you choose what.`}`;
}
/** What the animal's packet carries of a command in force (schema 7): the instruction in labels, and that it binds this turn. `from`: the
    handler's label when the animal knows it as an ally; `sees`: whether the animal itself perceives the creature it was set on. A command that
    critically failed and was handed to Angel says the opposite: it does anything but what was asked. */
export function commandForPacket(cmd, { from = null, sees = true } = {}) {
  if (!cmd) return null;
  const words = commandWords(cmd);
  if (cmd.degree <= 0) return { from, went: "wrong", told: words, must: `Its handler's command went badly wrong: this turn it does something else, by its own animal mind, and not what it was told (${words}).` };
  return { from, told: words, must: `Its handler commanded it and it obeys: it spends this turn doing that as well as it can (${cmd.instruction === "attack" ? "close with that creature and attack it; nothing else comes first" : cmd.instruction === "go" ? "move to that square, or as near as it can get, before anything else" : "it doesn't leave its square; it may still attack what comes into reach"}).`,
    ...(cmd.instruction === "attack" && !sees ? { unseen: `It doesn't perceive ${cmd.foe} itself: it can't target it yet. It moves toward where its handler is facing the enemy, or Seeks, and attacks once it perceives it.` } : {}) };
}
/** The tag on the animal's row of Monster Turns, in labels. */
export function commandTag(cmd, round, isTurn = false) {
  if (!commandInForce(cmd, round)) return null;
  const o = outcomeOf(cmd.degree);
  if (o === "obeys") return { kind: "ok", text: `commanded: ${commandWords(cmd)}` };
  if (o === "nothing") return { kind: "bad", text: isTurn && !cmd.own ? "command failed · turn passed" : cmd.own ? "command failed · yours to play" : "command failed" };
  return { kind: "warn", text: cmd.angel ? "command critically failed · Angel plans it" : "command critically failed · your choice" };
}
/** The band log's line for a command (History), in labels. e: { k: "command", by, tok, r, degree, words, total, dc }. */
export function commandLogWords(e, { nameOf = id => id, named = s => s } = {}) {
  const how = e.degree >= 2 ? `it will ${named(e.words ?? "do as told")} on its next turn` : e.degree === 1 ? "it does nothing on its next turn" : "it does something else on its next turn, the GM's choice";
  if (e.k === "command") return `${nameOf(e.by)} commanded ${nameOf(e.tok)} (Nature ${e.total} vs Will DC ${e.dc}: ${["a critical failure", "a failure", "a success", "a critical success"][e.degree] ?? "done"}): ${how}.`;
  if (e.k === "commandOwn") return `${nameOf(e.tok)}: its handler's command ${e.degree === 0 ? "critically failed" : "failed"}; played by the GM.`;
  if (e.k === "commandAngel") return `${nameOf(e.tok)}: its handler's command critically failed; the GM let Angel plan what it does instead.`;
  return "";
}
/** The command lines the fight's log keeps (the History reads them; a handler's own step is already in its turn). */
export const COMMAND_LOG = ["commandOwn", "commandAngel"];
