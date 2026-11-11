/* The reaction prompt in a player's browser (0.20.0): "The Sod Hound is moving out of a square in your reach. React with Reactive Strike?" React or
   Pass, with the countdown the GM set (Rhea, 2026-11-09: 5 to 60 s, 0 = none). React on Reactive Strike asks the player to roll their Strike as usual
   (PF2e HUD or the sheet) and press Done; the other known reactions are used by pressing React. One window per reaction row, or one for a group of
   rows that are one choice (0.27.0: Glimpse of Redemption when an area hurts several allies, a button for each ally); a row can name its own two
   buttons and its own lines (Weight of Guilt: Stupefied 2 or Enfeebled 2, with what each does). Answers go to the runner by the module's socket.
   Foundry's DialogV2 runs `submit` before it closes (checked in foundry.mjs, 14.370), so a React is never sent as a Pass. */
import { esc } from "../journal.mjs";
import { answerReaction } from "../fight.mjs";

const ROLLS = ["reactive-strike", "attack-of-opportunity"], open = new Map();
const STYLE = ".leb-rx .leb-count{opacity:.8}.leb-rx .form-footer{flex-wrap:wrap}";
/** "ask" and "close" from the runner. A close can name one row (its creature's reaction went on another row). */
export function onReactionPrompt(data) {
  if (!data || game.user.isGM) return;
  if (data.t === "close") { for (const [k, w] of open) if (k.startsWith(`${data.request}.${data.key}.`) && (!data.row || w.rows.includes(data.row))) { open.delete(k); w.quiet(); w.dlg.close().catch(() => {}); } return; }   /* closed by the runner: no answer sent (review finding 19) */
  if (data.t !== "ask") return;
  const groups = new Map();
  for (const x of data.list ?? []) if ((x.users ?? []).includes(game.user.id)) { const g = x.group ?? x.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
  for (const [g, rows] of groups) show(data, g, rows).catch(e => console.warn("reaction prompt", e));
}
async function show(data, group, rows) {
  const k = `${data.request}.${data.key}.${group}`; if (open.has(k)) return;
  if (!document.getElementById("leb-rx-style")) document.head.insertAdjacentHTML("beforeend", `<style id="leb-rx-style">${STYLE}</style>`);
  const x = rows[0], many = rows.length > 1, ids = rows.map(r => r.id);
  const left = () => data.until ? Math.max(0, Math.ceil((data.until - game.time.serverTime) / 1000)) : null;
  const send = (row, answer) => answerReaction(data.combat, data.request, data.key, row, answer).catch(e => ui.notifications.error(e.message));
  let answered = false; const quiet = () => { answered = true; };
  const D = foundry.applications.api.DialogV2;
  /* a group: what each row is about, then one question with a button for each */
  const body = many ? rows.map(r => `<p>${esc(String(r.words ?? "").replace(/\s*React with .*$/, ""))}</p>`).join("") + `<p>React with ${esc(x.reaction)}? Choose one.</p>`
    : (x.lines?.length ? x.lines : [x.words]).map(w => `<p>${esc(w)}</p>`).join("");
  const buttons = many ? [...rows.map((r, n) => ({ action: `react:${n}`, label: `React: ${r.label ?? r.name}`, icon: "fa-solid fa-bolt", default: n === 0 })), { action: "pass", label: "Pass", icon: "fa-solid fa-xmark" }]
    : [{ action: "react", label: x.labels?.react ?? "React", icon: "fa-solid fa-bolt", default: !x.labels }, { action: "pass", label: x.labels?.pass ?? "Pass", icon: x.labels ? "fa-solid fa-bolt" : "fa-solid fa-xmark", default: !!x.labels }];
  const ask = new D({ window: { title: x.reaction }, classes: ["leb-rx"], position: { width: x.lines?.length || many ? 440 : 360 },
    content: `${body}${data.until ? `<p class="leb-count">${x.labels ? `${esc(x.labels.pass)} in` : "It passes in"} <b>${left()}</b> s.</p>` : ""}`,
    buttons,
    submit: async result => { answered = true;
      if (result === "pass") { for (const id of ids) await send(id, "pass"); return; }
      const row = many ? rows[Number(String(result).split(":")[1])] ?? x : x;
      if (!ROLLS.includes(row.slug)) return send(row.id, "done");
      await send(row.id, "react");
      let finished = false;
      const done = new D({ window: { title: row.reaction }, classes: ["leb-rx"], position: { width: 360 }, content: `<p>Make your ${esc(row.reaction)} now (PF2e HUD or your sheet), then press Done.</p>`,
        buttons: [{ action: "done", label: "Done", icon: "fa-solid fa-check", default: true }], submit: () => { finished = true; open.delete(k); return send(row.id, "done"); } });
      /* closing this window counts as Done; the runner closing it sends nothing */
      done.addEventListener?.("close", () => { if (!finished) { finished = true; open.delete(k); send(row.id, "done"); } });
      open.set(k, { dlg: done, rows: [row.id], quiet: () => { finished = true; } }); await done.render({ force: true }); } });
  /* closing the question without a button is a Pass */
  ask.addEventListener?.("close", () => { if (open.get(k)?.dlg === ask) open.delete(k); if (!answered) { answered = true; for (const id of ids) send(id, "pass"); } });
  open.set(k, { dlg: ask, rows: ids, quiet }); await ask.render({ force: true });
  if (data.until) { const tick = setInterval(() => { const n = left(), b = ask.element?.querySelector(".leb-count b"); if (b) b.textContent = n; if (!ask.rendered || n <= 0) { clearInterval(tick); if (ask.rendered && !answered) { answered = true; open.delete(k); ask.close(); } } }, 500); }
}
