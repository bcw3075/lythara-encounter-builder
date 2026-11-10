/* The reaction prompt in a player's browser (0.20.0): "The Sod Hound is moving out of a square in your reach. React with Reactive Strike?" React or
   Pass, with the countdown the GM set (Rhea, 2026-11-09: 5 to 60 s, 0 = none). React on Reactive Strike asks the player to roll their Strike as usual
   (PF2e HUD or the sheet) and press Done; the other known reactions are used by pressing React. Answers go to the runner by the module's socket. */
import { esc } from "../journal.mjs";
import { answerReaction } from "../fight.mjs";

const ROLLS = ["reactive-strike", "attack-of-opportunity"], open = new Map();
const STYLE = ".leb-rx .leb-count{opacity:.8}";
/** "ask" and "close" from the runner. */
export function onReactionPrompt(data) {
  if (!data || game.user.isGM) return;
  if (data.t === "close") { for (const [k, d] of open) if (k.startsWith(`${data.request}.${data.key}.`)) { open.delete(k); d.close?.().catch?.(() => {}); } return; }
  if (data.t !== "ask") return;
  for (const x of data.list ?? []) if ((x.users ?? []).includes(game.user.id)) show(data, x).catch(e => console.warn("reaction prompt", e));
}
async function show(data, x) {
  const k = `${data.request}.${data.key}.${x.token}`; if (open.has(k)) return;
  if (!document.getElementById("leb-rx-style")) document.head.insertAdjacentHTML("beforeend", `<style id="leb-rx-style">${STYLE}</style>`);
  const left = () => data.until ? Math.max(0, Math.ceil((data.until - game.time.serverTime) / 1000)) : null;
  const send = answer => answerReaction(data.combat, data.request, data.key, x.token, answer).catch(e => ui.notifications.error(e.message));
  let answered = false;
  const D = foundry.applications.api.DialogV2;
  const ask = new D({ window: { title: x.reaction }, classes: ["leb-rx"], position: { width: 360 },
    content: `<p>${esc(x.words)}</p>${data.until ? `<p class="leb-count">It passes in <b>${left()}</b> s.</p>` : ""}`,
    buttons: [{ action: "react", label: "React", icon: "fa-solid fa-bolt", default: true }, { action: "pass", label: "Pass", icon: "fa-solid fa-xmark" }],
    submit: async result => { answered = true; if (result === "pass") return send("pass");
      if (!ROLLS.includes(x.slug)) return send("done");
      await send("react");
      const done = new D({ window: { title: x.reaction }, classes: ["leb-rx"], position: { width: 360 }, content: `<p>Make your ${esc(x.reaction)} now (PF2e HUD or your sheet), then press Done.</p>`,
        buttons: [{ action: "done", label: "Done", icon: "fa-solid fa-check", default: true }], submit: () => { open.delete(k); return send("done"); } });
      done.addEventListener?.("close", () => { if (open.get(k) === done) { open.delete(k); send("done"); } });
      open.set(k, done); await done.render({ force: true }); } });
  /* closing the window without a button is a Pass */
  ask.addEventListener?.("close", () => { if (open.get(k) === ask) open.delete(k); if (!answered) { answered = true; send("pass"); } });
  open.set(k, ask); await ask.render({ force: true });
  if (data.until) { const tick = setInterval(() => { const n = left(), b = ask.element?.querySelector(".leb-count b"); if (b) b.textContent = n; if (!ask.rendered || n <= 0) { clearInterval(tick); if (ask.rendered && !answered) { answered = true; open.delete(k); ask.close(); } } }, 500); }
}
