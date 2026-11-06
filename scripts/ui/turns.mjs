/* The Monster Turns window: GM only. Who's ticked, and the plan card for the turn in hand. PF2e HUD's tracker is left alone. */
import { describeStep } from "../turn.mjs";
import { esc } from "../journal.mjs";
import { ID } from "../builder.mjs";
import { applySetting, currentRequest, doIt, hold, playMyself } from "../fight.mjs";

const STYLE = `.leb-turns .window-content{overflow-y:auto;padding:8px 12px}.leb-turns .leb-t{display:grid;grid-template-columns:1fr 58px 44px;gap:4px;align-items:center}.leb-turns .leb-cur{font-weight:700}.leb-turns .leb-card{border:1px solid #0006;padding:6px 8px;margin-top:8px}.leb-turns .leb-warn{color:#e07050}.leb-turns .leb-btns{display:flex;gap:6px;margin-top:6px}.leb-turns .leb-btns button{flex:1}`;
export class TurnsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-turns", classes: ["leb-turns"], window: { title: "Monster Turns", resizable: true }, position: { width: 400, height: 420, left: 110, top: 60 } };
  get combat() { return game.combat?.scene?.id === canvas.scene?.id ? game.combat : game.combats.find(c => c.scene?.id === canvas.scene?.id) ?? null; }
  async _renderHTML() {
    if (!document.getElementById("leb-turns-style")) { const s = document.createElement("style"); s.id = "leb-turns-style"; s.textContent = STYLE; document.head.append(s); }
    const c = this.combat; if (!c) return "<p>No fight on this scene.</p>";
    const rows = c.combatants.filter(x => x.actor?.isOfType?.("npc") && x.token).map(x => `<div class="leb-t ${c.combatant?.id === x.id ? "leb-cur" : ""}" data-token="${x.token.id}"><span>${esc(x.token.name)}</span><label title="Angel runs this"><input type="checkbox" name="run" ${x.token.getFlag(ID, "run") ? "checked" : ""}> Angel</label><label title="Act without waiting for Do it"><input type="checkbox" name="auto" ${x.token.getFlag(ID, "auto") ? "checked" : ""}> Auto</label></div>`).join("");
    const r = currentRequest(c); let card = "";
    if (r) { const tok = c.scene.tokens.get(r.tokenId), words = { requested: "Waiting for a plan.", submitted: "Checking the plan.", ready: "Ready.", running: "Carrying it out.", held: "Held.", stopped: "Stopped." }[r.state] ?? r.state;
      card = `<div class="leb-card" data-request="${r.id}"><b>${esc(tok?.name)}</b>: ${esc(words)}${r.plan?.reason ? `<p>${esc(r.plan.reason)}</p>` : ""}${r.steps ? `<ol>${r.steps.map(s => `<li>${esc(describeStep(s))}</li>`).join("")}</ol>` : ""}${r.verdict ? `<p class="leb-warn">${esc(r.verdict)}</p>` : ""}${r.note ? `<p class="leb-warn">${esc(r.note)}</p>` : ""}<div class="leb-btns">${["ready", "held", "stopped"].includes(r.state) ? `<button type="button" data-do="doit"><i class="fa-solid fa-play"></i> Do it</button>` : ""}${r.state === "running" ? `<button type="button" data-do="hold"><i class="fa-solid fa-hand"></i> Hold</button>` : ""}<button type="button" data-do="manual"><i class="fa-solid fa-user"></i> Play it myself</button></div></div>`; }
    return `<div>${rows || "<p>No monsters in this fight.</p>"}${card}${applySetting() ? "" : "<p><em>Damage is rolled, not applied: use the card's Damage button.</em></p>"}</div>`;
  }
  _replaceHTML(html, content) { content.innerHTML = html; }
  _onRender() {
    const root = this.element, c = this.combat;
    root.querySelectorAll("input[type=checkbox]").forEach(el => el.addEventListener("change", () => c.scene.tokens.get(el.closest("[data-token]").dataset.token)?.setFlag(ID, el.name, el.checked)));
    root.querySelectorAll("[data-do]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); const id = el.closest("[data-request]").dataset.request, a = el.dataset.do; (a === "doit" ? doIt(c, id) : a === "hold" ? hold(c, id) : playMyself(c, id)).catch(e => ui.notifications.error(e.message)); }));
  }
}
