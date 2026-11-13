/* The Monster Turns history (Rhea, 2026-11-08): its own window, opened from Monster Turns. Each round, each monster's turn (foldable), Angel's whole plan
   and reason, then each action as it happened with its own reason and full detail, filling in live. Save to journal keeps it: one closed folder,
   "Monster Turns history", one entry per game night (the date), one page per fight. At End Encounter a GM is asked Save or Discard. GM only. */
import { ID } from "../builder.mjs";
import { esc } from "../journal.mjs";
import { SPEECH_LOG } from "../speech.mjs";
import { COMMAND_LOG } from "../command.mjs";
import { SIDE_LOG } from "../sides.mjs";
import { apiUseWords, historyHTML, historyOf, journalHTML, namer, notebooksHTML } from "../history.mjs";
import { bandLogWords, notebookOf, runnerName } from "../fight.mjs";
import { bookPrint } from "../memory.mjs";
import { MINDS } from "../minds.mjs";
import { pronounOf } from "../library.mjs";
import { pro } from "../pronoun.mjs";

const STYLE = `.leb-history .leb-h-grey{opacity:.6;font-style:italic}.leb-history details.leb-h-nb{border:none;padding:0 0 0 4px;margin:2px 0;font-size:12px}.leb-history details.leb-h-nb ul{margin:2px 0;padding-left:16px}.leb-history .window-content{overflow-y:auto;padding:6px 10px}.leb-history .leb-h-top{display:flex;gap:6px;align-items:center;margin-bottom:6px}.leb-history .leb-h-top span{flex:1;opacity:.8}.leb-history h3{margin:10px 0 4px;border-bottom:1px solid #0004}.leb-history details{border:1px solid #0003;border-radius:4px;padding:3px 7px;margin:4px 0}.leb-history details.leb-h-cur{border-color:#4caf50}.leb-history summary{cursor:pointer}.leb-history .leb-h-plan{margin:4px 0}.leb-history ol,.leb-history ul{margin:2px 0 4px 18px;padding:0}.leb-history .leb-h-why{opacity:.75;font-style:italic}.leb-history .leb-h-res{opacity:.95}.leb-history .leb-h-by{opacity:.65;font-size:.9em}.leb-history .leb-h-warn,.leb-history .leb-h-stall,.leb-history .leb-h-end{color:#e07050}.leb-history .leb-h-stall{color:#e0a030}.leb-history .leb-h-press{opacity:.7;list-style:"⏵ "}.leb-history .leb-h-note{color:#c08040}.leb-history .leb-h-gm{opacity:.65;margin:3px 0}.leb-history .leb-h-card{margin-left:4px;cursor:pointer}.leb-history hr.leb-h-sep{margin:6px 0;border-color:#0003}.chat-message.leb-h-flash{outline:2px solid #e0a030}`;

/** What the history needs from a fight: the Combat flag, the order, names, and card numbers. */
export function rounds(combat) {
  const scene = combat.scene, names = Object.fromEntries((scene?.tokens.contents ?? []).map(t => [t.id, t.name]));
  const fight = { round: combat.round, turn: combat.turn, current: combat.combatant?.id ?? null, order: combat.turns.map(c => ({ id: c.id, tokenId: c.tokenId, name: c.token?.name ?? c.name, npc: !!c.actor?.isOfType?.("npc") && c.actor.alliance !== "party" })) };
  return historyOf(combat.getFlag(ID, "turns") ?? {}, fight, names, look(names), bandLogWords(combat), Object.fromEntries(combat.scene?.tokens.map(t => { try { return [t.id, pronounOf(t, combat)]; } catch (e) { console.warn(`${ID} | pronoun`, e); return [t.id, undefined]; } }) ?? []));
}
/** Numbers read off chat cards: a roll's total, the DC or AC it was against (GM only), and damage types; a save on Toolbelt's row. Null when the card is gone. */
function look(names) {
  return {
    name: t => names[t] ?? null,
    card: id => { const m = game.messages.get(id); if (!m) return null; const roll = m.rolls?.[0], ctx = m.flags?.pf2e?.context ?? {};
      const types = [...new Set((roll?.instances ?? []).map(i => i.type).filter(Boolean))];
      return { total: roll?.total ?? null, dc: ctx.dc?.value ?? null, label: types.join(", ") }; },
    save: (id, tokenId) => { const m = game.messages.get(id);
      for (const v of Object.values(m?.flags?.["pf2e-toolbelt"]?.targetHelper?.saveVariants ?? {})) { const s = v?.saves?.[tokenId]; if (s) return { total: s.value ?? s.total ?? null, dc: v.dc?.value ?? v.dc ?? null }; }
      return null; }
  };
}

/** Show a roll's card: scroll the chat log to it and flash it; if it isn't drawn there (an old one), open it on its own. */
async function showCard(id) {
  const m = game.messages.get(id); if (!m) return ui.notifications.info("That card is no longer in chat.");
  ui.sidebar?.changeTab?.("chat", "primary");
  const li = ui.chat?.element?.querySelector(`[data-message-id="${id}"]`);
  if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); li.classList.add("leb-h-flash"); setTimeout(() => li.classList.remove("leb-h-flash"), 2500); return; }
  const Popout = foundry.applications?.sidebar?.apps?.ChatPopout; if (Popout) new Popout({ message: m }).render(true);
}

/* ---------- saving to the journal ---------- */
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** One closed folder, one entry per game night (this browser's date), one page per fight: saving the same fight again replaces its page. GM-only (no ownership). */
export async function saveHistory(combat) {
  if (!game.user.isGM) throw new Error("Only a GM can save the history.");
  const reqs = Object.values(combat.getFlag(ID, "turns")?.requests ?? {}), nbs = notebooks(combat); if (!reqs.length && !nbs.length) throw new Error("There's no monster turn or notebook to save yet.");   /* a fight where she played every monster still has its notebooks (0.25.0 design review 8) */
  const folder = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(ID, "history")) ?? await Folder.implementation.create({ name: "Monster Turns history", type: "JournalEntry", sorting: "a", flags: { [ID]: { history: true } } });
  const date = today(), name = `Monster Turns · ${date}`;
  const entry = game.journal.find(e => e.folder?.id === folder.id && e.getFlag(ID, "historyDate") === date) ?? await JournalEntry.implementation.create({ name, folder: folder.id, flags: { [ID]: { historyDate: date } } });
  const first = reqs.length ? Math.min(...reqs.map(r => r.at ?? Date.now())) : Date.now(), title = `${combat.scene?.name ?? "A fight"} · ${hhmm(first)}`;
  const content = journalHTML(rounds(combat), esc, { title, when: `${date}, ${reqs.length} plan${reqs.length === 1 ? "" : "s"}, round ${combat.round}` }) + notebooksHTML(nbs, esc, { fold: false });
  /* saved again after midnight: the page stays in the night it was first saved */
  const page = game.journal.filter(e => e.folder?.id === folder.id).flatMap(e => e.pages.contents).find(p => p.getFlag(ID, "historyCombat") === combat.id);
  if (page) await page.update({ name: title, "text.content": content });
  else await entry.createEmbeddedDocuments("JournalEntryPage", [{ name: title, type: "text", text: { content, format: 1 }, flags: { [ID]: { historyCombat: combat.id } } }]);
  await combat.update({ [`flags.${ID}.turns.historySaved`]: signature(combat.getFlag(ID, "turns")?.requests, combat.getFlag(ID, "notebook"), combat.getFlag(ID, "turns")?.orders?.log) }, { render: false, [ID]: { quiet: true } });
  return entry;
}
/** Has anything happened since it was last saved? */
const unsaved = combat => { const t = combat.getFlag(ID, "turns") ?? {}, nb = combat.getFlag(ID, "notebook"); /* with no monster turn, only her own notebook lines and cross-outs are worth the question at End Encounter: a fight she played herself isn't interrupted for notebooks nobody touched */
  /* nor for a band log with nothing of hers in it (0.28.0): an order she gave from the Give orders box is hers */
  if (!Object.keys(t.requests ?? {}).length && !Object.values(nb ?? {}).some(b => Object.values(b ?? {}).some(l => l?.k === "gm" || l?.x)) && !Object.values(t.orders?.log ?? {}).some(e => (e?.k === "order" && e.by === "gm") || SPEECH_LOG.includes(e?.k) || COMMAND_LOG.includes(e?.k) || SIDE_LOG.includes(e?.k))) return false; return t.historySaved !== signature(t.requests, nb, t.orders?.log); };
/** Every creature's notebook as the Remembers fold-out shows it, in names, for the window's last section and the saved page. */
function notebooks(combat) {
  const labels = combat.getFlag(ID, "turns")?.labels ?? {}, n = namer(labels, Object.fromEntries(combat.scene?.tokens.map(t => [t.id, t.name]) ?? []));
  return Object.keys(combat.getFlag(ID, "notebook") ?? {}).map(id => { const tok = combat.scene?.tokens.get(id), nb = tok ? notebookOf(combat, id) : null; if (!nb) return null;
    const words = x => `${n.named(x.text)}${x.sure === false ? " (unsure)" : ""}${x.by === "gm" ? " (the GM's line)" : ""}`;
    return { name: tok.name, mind: MINDS[nb.mind]?.label ?? nb.mind, sent: [...nb.remembers.map(words), ...nb.allies.map(x => `Ally: ${n.named(x.text)}`)], unused: nb.unused.map(words), crossed: nb.crossed.map(words), side: nb.side }; }).filter(Boolean);
}
/** What the saved page was made from: many writes don't move a request's `since` (saves, notes, presses), and the server clock restarts with the server,
    so a time can't say whether anything changed (found by the review). A short hash of the requests can. */
function signature(requests, books = null, bandLog = null) { const s = JSON.stringify(requests ?? {}) + bookPrint(books) + (bandLog && Object.keys(bandLog).length ? JSON.stringify(bandLog) : ""); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return `${s.length}:${h}`; }

/* ---------- End Encounter: Save or Discard (Rhea, 2026-11-08) ---------- */
/** preDeleteCombat: for a GM ending a fight that has unsaved history, stop the delete, ask, then delete again marked as asked. The runner's page and
    anything already asked are left alone (nobody can click on the runner's page). Returns false only to cancel this one delete, as a pre-hook must; otherwise nothing. */
export function onPreDeleteCombat(combat, options, userId) {
  if (userId !== game.user.id || !game.user.isGM || options?.[ID]?.asked || game.user.name === runnerName() || !unsaved(combat)) return;
  askOnEnd(combat).catch(e => { ui.notifications.error(e.message); console.error(e); });
  return false;
}
async function askOnEnd(combat) {
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: "Monster Turns history" }, position: { width: 380 },
    content: `<p>This fight has a Monster Turns history. Save it to the journal before ending the encounter?</p><p class="hint">Saved fights go in the folder "Monster Turns history", one entry per game night.</p>`,
    buttons: [{ action: "save", label: "Save to journal", icon: "fa-solid fa-book", default: true }, { action: "discard", label: "Discard", icon: "fa-solid fa-trash" }], rejectClose: false });
  if (choice !== "save" && choice !== "discard") return;   /* closed: the fight goes on */
  if (choice === "save") { await saveHistory(combat); ui.notifications.info("Saved the Monster Turns history to the journal."); }
  if (game.combats.get(combat.id)) await combat.delete({ [ID]: { asked: true } });
}

/* ---------- the window ---------- */
export class HistoryApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-history", classes: ["leb-history"], window: { title: "Monster Turns history", resizable: true }, position: { width: 480, height: 600, left: 520, top: 60 } };
  folds = new Map();   /* turn key → open or not, as the GM left it; untouched turns follow the default (the current round open) */
  get combat() { return game.combat?.scene?.id === canvas.scene?.id ? game.combat : game.combats.find(c => c.scene?.id === canvas.scene?.id) ?? null; }
  async _renderHTML() {
    if (!document.getElementById("leb-history-style")) { const s = document.createElement("style"); s.id = "leb-history-style"; s.textContent = STYLE; document.head.append(s); }
    const c = this.combat; if (!c) return "<p>No fight on this scene.</p>";
    const rds = rounds(c), last = rds.at(-1)?.round;
    const open = (key, t) => this.folds.has(key) ? this.folds.get(key) : t.current || rds.find(r => r.turns.includes(t))?.round === last;
    const saved = c.getFlag(ID, "turns")?.historySaved;
    return `<div class="leb-h-top"><span>${esc(c.scene?.name ?? "")} · round ${c.round}${saved ? (unsaved(c) ? " · changed since saved" : " · saved") : ""}</span><button type="button" data-do="save"><i class="fa-solid fa-book"></i> Save to journal</button></div>${(() => { const w = apiUseWords(c.getFlag(ID, "turns") ?? {}); return w ? `<p class="leb-h-api">${esc(w)}</p>` : ""; })()}${historyHTML(rds, esc, { open })}${notebooksHTML(notebooks(c), esc)}`;
  }
  _replaceHTML(html, content) {
    const atEnd = content.scrollHeight - content.scrollTop - content.clientHeight < 40, top = content.scrollTop;
    content.innerHTML = pro(html); content.scrollTop = atEnd ? content.scrollHeight : top;   /* newest at the bottom: follow it while the GM is there */
  }
  _onRender() {
    const root = this.element, c = this.combat;
    /* only a click counts as the GM folding: drawing an open <details> fires "toggle" too, which would pin every default-open turn open */
    root.querySelectorAll("details[data-key] > summary").forEach(sm => sm.addEventListener("click", () => { const d = sm.parentElement; this.folds.set(d.dataset.key, !d.open); }));
    root.querySelectorAll("[data-message]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); showCard(a.dataset.message); }));
    root.querySelector('[data-do="save"]')?.addEventListener("click", ev => { ev.preventDefault(); if (!c) return;
      saveHistory(c).then(e => { ui.notifications.info(`Saved to "${e.name}".`); this.render(); }).catch(e => ui.notifications.error(e.message)); });
  }
}
