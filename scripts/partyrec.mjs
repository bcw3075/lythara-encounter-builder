/* Lythara Encounter Builder: the party record in Foundry (0.45.0, F-9, 9-1). On the runner's page only: at every turn change it closes the turn that
   ended (what that party member's chat cards show, where they moved and ended, what they spent) and opens the next one, and keeps what party members
   did on others' turns (a reaction, a free action). Kept on the Combat (flag `partyLog`), saved with the History; party.mjs has the rules. */
import { ID } from "./builder.mjs";
import { learnableActor } from "./library.mjs";
import { RECORD_SCHEMA, cardAct, cleanTurn, feetMoved, recordByMember, spentBetween, standing } from "./party.mjs";

const runnerName = () => game.settings.get(ID, "runner");
const isRunner = () => game.user.isGM && game.users.getName(runnerName())?.id === game.user.id;
/** A party member whose fighting is learned from (9-1, 9-5's party NPCs): a character on the party's side, or any member of PF2e's party. */
export const learnable = learnableActor;
/** The world actor behind a token's actor (an unlinked token's synthetic actor has the world actor's id). */
const actorIdOf = actor => actor?.isToken ? (actor.token?.baseActor?.id ?? actor.id) : actor?.id;

/* cards seen on this page since the last turn change, by the speaking token (review 12: by token, not actor, so two tokens of one actor stay apart,
   and only a fight's own tokens are taken at its turn change): the runner hears every card (`createChatMessage` fires on every page) */
const heard = new Map(); const pageSince = Date.now();
/** createChatMessage (main.mjs): keep the ids of cards a token in a running fight speaks, until the turn they belong to is closed. */
export function onPartyCard(message) {
  try { if (!isRunner()) return; const t = message?.speaker?.token; if (!t || !game.combats.some(c => c.started && c.combatants.some(x => x.tokenId === t))) return;
    const list = heard.get(t) ?? []; list.push(message.id); heard.set(t, list.slice(-60)); } catch (e) { console.warn(`${ID} | party record`, e); }
}
/** The cards heard from this fight's tokens, taken out of the list (another fight's stay). */
function takeHeard(combat) { const out = new Map(); for (const c of combat.combatants) { const ids = heard.get(c.tokenId); if (ids) { out.set(c.tokenId, ids); heard.delete(c.tokenId); } } return out; }
/** What one card shows, in the shape `cardAct` reads. Only roll and action cards: the card's own words, and plain chat, are never read. */
function cardFacts(m) {
  const f = m.flags?.pf2e ?? {}, c = f.context ?? {}, o = f.origin ?? {}, item = (() => { try { return m.item ?? null; } catch (e) { return null; } })();
  const title = (() => { const t = /<h4 class="action">\s*<strong>([^<]{1,80})<\/strong>/.exec(m.flavor ?? "")?.[1]?.trim() ?? ""; return t.replace(/^(Melee|Ranged) Strike: /, "").replace(/^Damage Roll: /, ""); })();
  const tokName = u => { try { const d = typeof u === "string" ? fromUuidSync(u) : null; return d?.name ?? null; } catch (e) { return null; } };
  const targets = [c.target?.token ? tokName(c.target.token) : null, ...((m.flags?.["pf2e-toolbelt"]?.targetHelper?.targets ?? []).map(tokName))].filter(Boolean);
  const kind = c.type ?? (o.type === "spell" ? "spell-cast" : null);
  return { kind, originType: o.type ?? null, item: item?.name ?? null, title, targets: [...new Set(targets)], outcome: c.outcome ?? null,
    rank: Number(o.castRank ?? item?.rank) || null, cantrip: !!item?.isCantrip, focus: !!item?.isFocusSpell,
    damage: c.type === "damage-roll" ? Math.round(Number(m.rolls?.[0]?.total)) : null, healing: c.type === "damage-roll" && (m.rolls?.[0]?.kinds?.has?.("healing") || /healing/i.test(String(m.rolls?.[0]?.formula ?? ""))) };
}
/** What a character has to spend, now (party.mjs `spentBetween` reads two of these): spell slots left (prepared ones not yet cast, spontaneous ones
    left, a flexible caster's slots as a spontaneous one's (review 14); cantrips, focus spells and innate spells aren't slots), focus points, hero points, and each consumable's count by name. */
function purse(actor) {
  let slots = 0;
  for (const e of actor?.spellcasting?.contents ?? []) { const kind = e.system?.prepared?.value; if (!["prepared", "spontaneous"].includes(kind)) continue;
    for (const [k, s] of Object.entries(e.system?.slots ?? {})) { if (k === "slot0" || !s?.max) continue;
      slots += kind === "prepared" && !e.system?.prepared?.flexible ? (s.prepared ?? []).filter(p => p?.id && !p.expended).length : Number(s.value) || 0; } }
  const items = {}; for (const i of actor?.itemTypes?.consumable ?? []) { const q = Number(i.quantity ?? i.system?.quantity) || 0; items[i.name] = (items[i.name] ?? 0) + q; }
  return { slots, focus: Number(actor?.system?.resources?.focus?.value) || 0, hero: Number(actor?.system?.resources?.heroPoints?.value) || 0, items };
}
const rectOf = (t, grid) => ({ x: Math.round(t.x / grid), y: Math.round(t.y / grid), w: Math.max(1, t.width ?? 1), h: Math.max(1, t.height ?? 1) });
const downish = a => !a || (a.hitPoints?.value ?? 1) <= 0 || !!a.isDead || ["dying", "unconscious"].some(c => a.hasCondition?.(c));
/** Who stands near a token now, by side as that creature sees it. */
function aroundOf(combat, tok) {
  const scene = tok.parent, grid = scene?.grid?.size ?? 100, me = rectOf(tok, grid), others = [];
  for (const c of combat.combatants) { const t = c.token; if (!t || t.id === tok.id || t.parent !== scene || !t.actor) continue;
    const ally = tok.actor?.isAllyOf?.(t.actor) ?? (t.actor.alliance === tok.actor?.alliance); others.push({ name: t.name, rect: rectOf(t, grid), side: ally ? "ally" : "foe", down: downish(t.actor) }); }
  return standing(me, others);
}
const gridOf = tok => tok?.parent?.grid?.size ?? 100;
const squareOf = tok => ({ x: Math.round(tok.x / gridOf(tok)), y: Math.round(tok.y / gridOf(tok)) });
const tokenAnywhere = (combat, id) => !id ? null : combat.scene?.tokens.get(id) ?? game.scenes.find(s => s.tokens.has(id))?.tokens.get(id) ?? null;
const actsOf = ids => ids.map(id => game.messages.get(id)).filter(Boolean).map(m => cardAct(cardFacts(m)));
/** The open turn closed as things stand: its cards (ids), where the creature is now, what it has left. A turn Angel played (the Angel tick at its
    start or now) is marked, so that fight isn't learned from for that character (Angel's call 2). A token gone since (dismissed, deleted) still
    gives what its cards showed (review 4). */
function closeTurn(combat, open, ids) {
  const tok = tokenAnywhere(combat, open.tokenId), a = tok?.actor;
  if (!a) return open.actorId ? cleanTurn({ at: Date.now(), round: open.round, actorId: open.actorId, name: open.name, angel: !!open.angel, acts: actsOf(ids), partial: true }) : null;
  return cleanTurn({ at: Date.now(), round: open.round, actorId: actorIdOf(a), name: tok.name, angel: !!open.angel || !!tok.getFlag(ID, "run"), moved: feetMoved(open.square, squareOf(tok)),
    hp: [open.hp ?? 0, a.hitPoints?.value ?? 0], acts: actsOf(ids), spent: spentBetween(open.purse ?? {}, purse(a)), end: aroundOf(combat, tok) });
}
/** What party members other than the turn's own did on it (a reaction, a free action): one record each, filed under the round the turn was in. */
function offTurns(combat, cards, round, at, prefix) {
  const out = {}; for (const [tokenId, ids] of cards) { const c = combat.combatants.find(x => x.tokenId === tokenId), a = c?.actor; if (!a || !learnable(a)) continue;
    const t = cleanTurn({ at, round, actorId: actorIdOf(a), name: c.token?.name ?? a.name, own: false, angel: !!c.token?.getFlag?.(ID, "run"), acts: actsOf(ids) });
    if (t) out[`${prefix}-${tokenId}`] = t; }
  return out;
}
/** combatTurnChange and updateCombat (turn or round) on the runner (main.mjs): a turn ended and another began. One at a time, so each reads what
    the last wrote; the same change heard twice is skipped. */
let queue = Promise.resolve();
export const onPartyTurn = combat => { queue = queue.then(() => partyTurn(combat)).catch(e => console.warn(`${ID} | party record`, e)); return queue; };
async function partyTurn(combat) {
  if (!isRunner() || !combat?.started || !game.combats.has(combat.id)) return;
  const log = combat.getFlag(ID, "partyLog") ?? {}, now = Date.now(), change = {}, cur = combat.combatant;
  if (log.open && log.open.combatantId === (cur?.id ?? null) && log.open.round === combat.round && now - (log.open.at ?? 0) < 2500) return;
  /* the turn that ended: its party member's own turn, and what any other party member did during it (each card belongs to the turn it came in) */
  const open = log.open ?? null, cards = takeHeard(combat);
  if (open?.tokenId) { const ids = cards.get(open.tokenId) ?? []; cards.delete(open.tokenId);
    /* this page started after that turn did (a reload), or another page was the runner when it began (review 26): the cards before it weren't heard here, so the turn is marked part-seen */
    const t = closeTurn(combat, open, ids); if (t) change[`turns.${open.key}`] = pageSince > (open.at ?? 0) || (open.by && open.by !== game.user.id) ? { ...t, partial: true } : t; }
  Object.assign(change, Object.fromEntries(Object.entries(offTurns(combat, cards, open?.round ?? combat.round, now, open?.key ?? `r${open?.round ?? combat.round}t${now}`)).map(([k, v]) => [`turns.${k}`, v])));
  /* the turn now beginning: a snapshot if it is a party member's; for anyone else only its round and time, so what the party does on it is filed
     under the right round (review 10). Replaced whole (review 1: a plain write merged the last member's consumables into the next one's) */
  const tok = cur?.token, a = tok?.actor, base = { combatantId: cur?.id ?? null, round: combat.round, at: now, by: game.user.id };
  if (tok && learnable(a)) { const n = Object.keys(log.turns ?? {}).filter(k => k.startsWith(`${combat.round}-${cur.id}-`) && k.split("-").length === 3).length;
    change["==open"] = { ...base, key: `${combat.round}-${cur.id}-${n}`, tokenId: tok.id, actorId: actorIdOf(a), name: tok.name, square: squareOf(tok), hp: a.hitPoints?.value ?? 0, purse: purse(a), angel: !!tok.getFlag(ID, "run") }; }
  else change["==open"] = { ...base, key: null, tokenId: null };
  change.schema = RECORD_SCHEMA;
  await combat.update(Object.fromEntries(Object.entries(change).map(([k, v]) => [`flags.${ID}.partyLog.${k}`, v])), { render: false, [ID]: { quiet: true } });
}
/** The fight's record as the History saves it: { schema, members: { actorId: { name, angel, turns } } }. The turn still open (the fight's last,
    saved before any next turn change) is closed as it stands from any GM page: its cards, and the other party members' on it, are found by their
    time from the turn's start on (review 11). */
export function partyRecordOf(combat) {
  const log = combat?.getFlag(ID, "partyLog") ?? {}, turns = Object.values(log.turns ?? {}), open = log.open;
  if (open?.at) { const since = (open.at ?? 0) - 1000, cards = new Map();
    for (const m of game.messages.contents) { const t = m.speaker?.token; if (!t || (m.timestamp ?? 0) < since || !combat.combatants.some(c => c.tokenId === t)) continue; cards.set(t, [...(cards.get(t) ?? []), m.id]); }
    if (open.tokenId) { const t = closeTurn(combat, open, cards.get(open.tokenId) ?? []); cards.delete(open.tokenId); if (t) turns.push(t); }
    turns.push(...Object.values(offTurns(combat, cards, open.round ?? combat.round, Date.now(), "last"))); }
  return { schema: RECORD_SCHEMA, members: recordByMember(turns.sort((x, y) => (x.at ?? 0) - (y.at ?? 0))) };
}
/** Whether the fight has a party record to save (review 5: the same test as saving's, so End Encounter never asks for what it can't save). */
export const hasPartyRecord = combat => { const l = combat?.getFlag(ID, "partyLog"); if (!l || (!Object.keys(l.turns ?? {}).length && !l.open?.at)) return false; try { return Object.keys(partyRecordOf(combat).members).length > 0; } catch (e) { return false; } };
