/* Monster minds release 4 (0.33.0): the fight-start look and what an escaped monster saw. Pure: no Foundry globals, so the unit tests run it in Node.
   fight.mjs keeps the look on the Combat's flag (`turns.look`) and runs it on the runner; ui/turns.mjs draws its card; ui/history.mjs offers the
   escaped monsters' lines at End Encounter. Rhea's decisions (2026-11-10 decisions 4 and 5; 2026-11-12 R4-1, R4-2 and R4-4) are in
   docs/features/look.md. */
import { text } from "./brain.mjs";
import { CAPS, DISCIPLINES, LINE_LABEL, MINDS, cutWords } from "./minds.mjs";
import { canUse } from "./memory.mjs";

/** The look's own request id: it belongs to the fight, not to a monster's turn. One a fight. */
export const LOOK_ID = "look";
/** The profile lines a suggestion may change (the Pronoun line is the creature's own, never the fight's). */
export const LOOK_LINES = ["goesFor", "fightsBy", "givesUp", "discipline", "mind", "knows", "notes"];
export const LOOK_MAX = 8, WHY_MAX = 200, LOOK_TRIES = 2;
const LABEL = /^M\d{1,3}$/;
const PICK_OF = { mind: MINDS, discipline: DISCIPLINES };
const bad = reason => ({ ok: false, reason });

/** A monster's packet cut down to what a look rests on (as `choicePacket` is for a choice): its mind and band, its own state, who fights beside it
    and what it perceives now, with where they are, their size, gear and health words. Never the ground map, spells or stealth: a look is about who
    is there, not about the first action. */
export function lookPacket(p) {
  if (!p) return null;
  const who = x => ({ label: x.label, ...(x.name ? { name: x.name } : {}), ...(x.state ? { state: x.state } : {}), ...(x.square ? { square: x.square } : {}), ...(x.distance != null ? { distance: x.distance } : {}),
    ...(x.size ? { size: x.size } : {}), ...(x.gear ? { gear: x.gear } : {}), ...(x.healthWord ? { healthWord: x.healthWord } : {}), ...(x.conditions?.length ? { conditions: x.conditions } : {}), ...(x.cover && x.cover !== "none" ? { cover: x.cover } : {}) });
  return { ...(p.mind ? { mind: p.mind } : {}), ...(p.band ? { band: p.band } : {}),
    you: { label: p.you?.label ?? null, name: p.you?.name ?? null, square: p.you?.square ?? null, hp: p.you?.hp ?? null, conditions: p.you?.conditions ?? [] },
    allies: (p.allies ?? []).map(who), perceived: (p.perceived ?? []).filter(x => x?.label).map(who) };
}

/** Is this a look handed in (and not a plan or a choice)? */
export const isLook = raw => { let p = raw; if (typeof p === "string") { try { p = JSON.parse(p); } catch { return false; } } return !!p && typeof p === "object" && !Array.isArray(p) && Array.isArray(p.look) && p.steps == null; };

/** A look as it arrives (an object or JSON text), cleaned. monsters: the labels the look was asked about. Out: { ok, items, fits, seq } or a
    refusal in words. Each item: { to: "kind" | "one", label, line, pick?, text, why }. A second suggestion for the same line of the same monster
    (or its kind) is dropped; so is one about a monster the look didn't name. */
export function cleanLook(raw, monsters = [], kindOf = {}) {
  let p = raw;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { return bad("The look isn't valid JSON."); } }
  if (!p || typeof p !== "object" || Array.isArray(p) || !Array.isArray(p.look)) return bad(`A look is { "look": [suggestions], "fits": [labels], "seq": the event's seq }.`);
  if (p.look.length > LOOK_MAX) return bad(`A look has at most ${LOOK_MAX} suggestions.`);
  const known = new Set(monsters), items = [], seen = new Set();
  for (const [n, s] of p.look.entries()) {
    const at = `Suggestion ${n + 1}`;
    if (!s || typeof s !== "object") return bad(`${at} isn't an object.`);
    if (s.for !== "kind" && s.for !== "one") return bad(`${at}: "for" is "kind" (every monster of its kind in this fight) or "one" (this monster alone).`);
    if (typeof s.monster !== "string" || !LABEL.test(s.monster)) return bad(`${at}: "monster" is a monster's label, like M1.`);
    if (!known.has(s.monster)) return bad(`${at}: ${text(s.monster, 10)} isn't one of the monsters in this look (${[...known].join(", ") || "none"}).`);
    if (!LOOK_LINES.includes(s.line)) return bad(`${at}: "line" is one of ${LOOK_LINES.map(l => `"${l}"`).join(", ")}.`);
    const picks = PICK_OF[s.line], pick = picks ? (typeof s.pick === "string" && Object.hasOwn(picks, s.pick) ? s.pick : null) : null;
    if (picks && !pick) return bad(`${at}: a "${s.line}" suggestion needs "pick", one of ${Object.keys(picks).map(k => `"${k}"`).join(", ")}.`);
    const words = cutWords(text(s.text, 2000), s.line === "notes" ? CAPS.storeNotes : CAPS.store);
    if (!words && !pick) return bad(`${at}: "text" holds the new words for the line.`);
    const key = s.for === "kind" ? `kind|${kindOf[s.monster] ?? s.monster}|${s.line}` : `one|${s.monster}|${s.line}`;   /* two of one kind name one kind (0.33.1, review) */ if (seen.has(key)) continue; seen.add(key);
    items.push({ to: s.for, label: s.monster, line: s.line, ...(pick ? { pick } : {}), text: words, why: text(s.why, WHY_MAX) });
  }
  const fits = Array.isArray(p.fits) ? [...new Set(p.fits.filter(l => typeof l === "string" && known.has(l)))] : [];
  return { ok: true, items, fits, seq: Number.isFinite(p.seq) ? p.seq : null };
}
/** Two suggestions on the same line where one is for the kind and one for a monster of it: both stand (the monster's own wins for it, per line).
    The ids of the suggestions still unanswered. */
export const openItems = look => Object.entries(look?.items ?? {}).filter(([, x]) => x && !x.answer).map(([i]) => i);

/** What the thinker receives for a look (one event a fight). look: the flag; model: { model, modelWhy } for the strongest of its monsters. */
export function lookOut(look, { combatId, round }) {
  return { seq: look.seq, kind: "look", combatId, requestId: LOOK_ID, round, ...(look.refused ? { reason: `Your last look was refused: ${look.refused} Send it again, fixed.`, triesLeft: Math.max(0, LOOK_TRIES - (look.tries ?? 0)) } : {}),
    look: { monsters: Object.entries(look.monsters ?? {}).map(([label, m]) => ({ label, kind: m.kindName, packet: look.packets?.[label] ?? null })), lines: LOOK_LINES,
      answerWith: `{ "look": [{ "for": "kind" | "one", "monster": "M1", "line": "givesUp", "text": "the new words", "pick": "only for mind or discipline", "why": "a sentence for the GM" }], "fits": ["labels whose profile still fits"], "seq": ${look.seq} } where a plan would go, with requestId "${LOOK_ID}"` } };
}
/** Is the look still waiting for its answer? Until round 1 ends (Rhea, R4-1). */
export const lookWaiting = (look, round) => look?.state === "asked" && (round ?? 1) <= 1;

/** The card's words for a look that didn't come (R4-4's second sample). */
export function lookEndWords(look) {
  if (look?.state === "missed") return "The fight-start look didn't happen: Angel didn't answer before round 1 ended, so the monsters used their stored profiles as they are. Nothing was changed.";
  if (look?.state === "off") return "No fight-start look: Angel's route is off, so the monsters use their stored profiles as they are.";
  if (look?.state === "failed") return `The fight-start look couldn't be made${look.reason ? `: ${look.reason}` : ""}. The monsters use their stored profiles as they are.`;
  return "";
}
/** Who a suggestion applies to, in words: "the kind: all 3 of them" or "this one". */
export const lookWho = item => item.to === "kind" ? `the kind: ${item.count > 1 ? `all ${item.count} of them` : "the one in this fight"}` : "this one";
export const lineName = key => LINE_LABEL[key] ?? key;
/** A suggestion's new line as words: a pick's label, then its text. */
export function changeWords(item) { const label = item.pick ? PICK_OF[item.line]?.[item.pick]?.label ?? "" : ""; return label && item.text ? `${label}. ${item.text}` : label || item.text || ""; }

/* ---------- an escaped monster's lines (R4-2, R4-4's third sample) ---------- */
/** A few short lines, at most: "a few short sure lines" (Rhea, R4-2). */
export const ESCAPE_MAX = 4;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
/** What an escaped monster saw of its enemies, as lines for its own "Knows about its enemies". book: its notebook (memory.mjs lines); rung: its
    Mind's place on the ladder (it offers only what its Mind could make of what it saw); nameOf(label): the creature's name for the GM, or null
    for one the line can't name. Sure lines only, about enemies only (labels E1, E2), each said once, most telling first, at most ESCAPE_MAX.
    Out: [{ id, text }] in names, with no pronoun (a creature is never "it" by default: the lines are written so they need none). */
export function escapeLines(book, { rung = 3, nameOf = () => null } = {}) {
  const groups = new Map(), enemy = l => typeof l === "string" && /^E\d{1,3}$/.test(l);
  for (const [, l] of Object.entries(book ?? {}).sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (!l || typeof l !== "object" || l.x || l.sure === 0) continue;
    const kind = l.k === "hurt" ? (l.s === 3 && !l.p ? "hard" : null) : l.k, who = ["heal", "cast", "block", "reactive", "hard"].includes(kind) ? l.a : l.t;   /* who did it, or whom it was done to */
    if (!kind || !["heal", "cast", "block", "reactive", "weak", "resist", "immune", "hard"].includes(kind) || !enemy(who)) continue;
    if (!canUse(kind === "hard" ? "hurt" : kind, rung)) continue;
    const name = nameOf(who); if (!name) continue;
    const id = `${kind}|${who}|${kind === "cast" ? l.n ?? l.w ?? "" : l.d ?? ""}`; if (groups.has(id)) continue;
    const t = kind === "heal" ? `${name} heals the others.` : kind === "cast" ? (l.n ? `${name} casts ${l.n.replace(/-/g, " ")}.` : `${name} casts spells: ${String(l.w ?? "magic").replace(/[.\s]+$/, "")}.`)
      : kind === "block" ? `${name} blocks blows with a shield.` : kind === "reactive" ? `${name} strikes at anyone who moves away or drops their guard nearby.`
      : kind === "hard" ? `${name} hits hard.` : kind === "weak" ? `${cap(l.d)} hurts ${name} far more than it should.` : kind === "resist" ? `${cap(l.d)} does little to ${name}.` : `${cap(l.d)} does nothing to ${name}.`;
    groups.set(id, { id, kind, text: t });
  }
  const order = ["heal", "cast", "block", "reactive", "weak", "immune", "resist", "hard"];
  return [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, ESCAPE_MAX).map(({ id, text: t }) => ({ id, text: t }));
}
/** The "Knows about its enemies" line after accepting some lines: Angel's own words kept, the new ones added, said once each, cut to the line's cap.
    existing: the line now ({ text, by }) or null. Out: the new text, or null when a GM's words are on the line (Angel never replaces hers). */
export function knowsAfter(existing, accepted = []) {
  if (existing && existing.by === "gm" && String(existing.text ?? "").trim()) return null;
  const had = String(existing?.text ?? "").trim(), add = [...new Set(accepted.map(s => String(s ?? "").trim()))].filter(s => s && !had.includes(s));
  return cutWords([had, ...add].filter(Boolean).join(" "), CAPS.store);
}
