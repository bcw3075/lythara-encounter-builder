/* The Monster Turns window: GM only. Who's ticked, and the plan card for the turn in hand. PF2e HUD's tracker is left alone. */
import { describeChanges, describeStep, isMove } from "../turn.mjs";
import { esc } from "../journal.mjs";
import { describeKnows } from "../perceive.mjs";
import { ID } from "../builder.mjs";
import { applySetting, brainListening, brainSeenAt, clock, currentRequest, doIt, hold, lastNote, playMyself, runnerProblem } from "../fight.mjs";
import { LISTEN_MS } from "../brain.mjs";

const STYLE = `.leb-turns .window-content{overflow-y:auto;padding:8px 12px}.leb-turns .leb-t{display:grid;grid-template-columns:1fr 58px 44px;gap:4px;align-items:center}.leb-turns .leb-cur{font-weight:700}.leb-turns .leb-card{border:1px solid #0006;padding:6px 8px;margin-top:8px}.leb-turns .leb-warn{color:#e07050}.leb-turns .leb-btns{display:flex;gap:6px;margin-top:6px}.leb-turns .leb-btns button{flex:1}.leb-turns .leb-listen{margin:0 0 6px;opacity:.8}.leb-turns .leb-listen i{color:#888}.leb-turns .leb-listen.on i{color:#4caf50}.leb-turns li.leb-done{opacity:.6}.leb-turns li.leb-next{font-weight:700}`;
export class TurnsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-turns", classes: ["leb-turns"], window: { title: "Monster Turns", resizable: true }, position: { width: 400, height: 420, left: 110, top: 60 } };
  get combat() { return game.combat?.scene?.id === canvas.scene?.id ? game.combat : game.combats.find(c => c.scene?.id === canvas.scene?.id) ?? null; }
  async _renderHTML() {
    if (!document.getElementById("leb-turns-style")) { const s = document.createElement("style"); s.id = "leb-turns-style"; s.textContent = STYLE; document.head.append(s); }
    const c = this.combat; if (!c) return "<p>No fight on this scene.</p>";
    const rows = c.combatants.filter(x => x.actor?.isOfType?.("npc") && x.token).map(x => `<div class="leb-t ${c.combatant?.id === x.id ? "leb-cur" : ""}" data-token="${x.token.id}"><span>${esc(x.token.name)}</span><label title="Angel runs this"><input type="checkbox" name="run" ${x.token.getFlag(ID, "run") ? "checked" : ""}> Angel</label><label title="Act without waiting for Do it"><input type="checkbox" name="auto" ${x.token.getFlag(ID, "auto") ? "checked" : ""}> Auto</label></div>`).join("");
    const r = currentRequest(c), problem = runnerProblem(), on = brainListening(); let card = "";
    const listen = `<p class="leb-listen ${on ? "on" : ""}"><i class="fa-solid fa-circle"></i> ${on ? "Angel is listening." : "Angel isn't listening."}</p>`;
    const deaf = r?.state === "requested" && r.packet && !r.gaveUp && !on ? `<p class="leb-warn">Angel isn't listening. Play it yourself, or in the chat say go.</p>` : "";
    /* text on a request uses labels (the thinker reads the same words); the GM gets names */
    const labels = c.getFlag(ID, "turns")?.labels ?? {}, nameOf = l => { const a = Object.entries(labels).find(([, v]) => v === l); return a ? c.scene.tokens.get(a[0])?.name ?? null : null; };
    const named = t => String(t ?? "").replace(/\b[EM]\d{1,3}\b/g, l => nameOf(l) ?? l);
    if (r) { const tok = c.scene.tokens.get(r.tokenId), pos = r.pos ?? 0, n = r.steps?.length ?? 0, knows = describeKnows(r.packet, nameOf);
      const words = { requested: r.why ? "Asked again: waiting for a new plan." : "Waiting for a plan.", submitted: "Checking the plan.", ready: pos ? `Step ${pos + 1} of ${n} next.` : "Ready.", running: "Carrying it out.", held: "Held.", stopped: "Stopped." }[r.state] ?? r.state;
      const strikeName = id => r.packet?.you?.strikes?.find(x => x.id === id)?.name ?? id;
      const done = (r.done ?? []).map(d => d.do === "strike" ? `${strikeName(d.item)} at ${nameOf(d.target) ?? d.target} (${d.result})` : isMove(d) ? `${{ step: "Step", crawl: "Crawl" }[d.do] ?? "Stride"} to square ${d.to?.[0]}, ${d.to?.[1]} (${d.result})` : d.do === "stand" ? `Stand (${d.result})` : d.do === "drop-prone" ? `Drop Prone (${d.result})` : d.do).join(", ");
      const steps = r.steps ? `<ol>${r.steps.map((s, i) => `<li class="${i < pos ? "leb-done" : i === pos && r.state !== "requested" ? "leb-next" : ""}">${i < pos ? "✓ " : ""}${esc(named(describeStep(s)))}</li>`).join("")}</ol>` : "";
      const go = pos ? `<i class="fa-solid fa-forward-step"></i> Next step` : `<i class="fa-solid fa-play"></i> Do it`;
      card = `<div class="leb-card" data-request="${r.id}"><b>${esc(tok?.name)}</b>: ${esc(words)}${r.why ? `<p class="leb-warn">${esc(named(describeChanges(r.why, nameOf, tok?.name ?? "It")))}</p>` : ""}${done ? `<p>Done this turn: ${esc(done)}.</p>` : ""}${knows ? `<p>${esc(knows)}</p>` : ""}${r.plan?.reason ? `<p>${esc(r.plan.reason)}</p>` : ""}${steps}${r.verdict ? `<p class="leb-warn">${esc(named(r.verdict))}</p>` : ""}${deaf}${r.note ? `<p class="leb-warn">${esc(named(r.note))}</p>` : ""}<div class="leb-btns">${["ready", "held", "stopped"].includes(r.state) && !r.go ? `<button type="button" data-do="doit" ${problem ? "disabled" : ""}>${go}</button>` : ""}${r.state === "running" ? `<button type="button" data-do="hold"><i class="fa-solid fa-hand"></i> Hold</button>` : ""}<button type="button" data-do="manual"><i class="fa-solid fa-user"></i> Play it myself</button></div></div>`; }
    const left = !r && lastNote(c); if (left) card = `<div class="leb-card"><p class="leb-warn">${esc(named(left.note))}</p></div>`;
    return `<div>${listen}${rows || "<p>No monsters in this fight.</p>"}${problem ? `<p class="leb-warn">${esc(problem)}</p>` : ""}${card}${applySetting() ? "" : "<p><em>Damage is rolled, not applied: use the card's Damage button.</em></p>"}</div>`;
  }
  _replaceHTML(html, content) { content.innerHTML = html; }
  _onRender() {
    const root = this.element, c = this.combat;
    /* the light goes grey on its own two minutes after the last ask, with nothing else changing */
    clearTimeout(this._grey); const left = brainSeenAt() + LISTEN_MS - clock(); if (left > 0) this._grey = setTimeout(() => { if (this.rendered) this.render(); }, left + 500);
    root.querySelectorAll("input[type=checkbox]").forEach(el => el.addEventListener("change", () => c.scene.tokens.get(el.closest("[data-token]").dataset.token)?.setFlag(ID, el.name, el.checked)));
    root.querySelectorAll("[data-do]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); const id = el.closest("[data-request]").dataset.request, a = el.dataset.do; (a === "doit" ? doIt(c, id) : a === "hold" ? hold(c, id) : playMyself(c, id)).catch(e => ui.notifications.error(e.message)); }));
  }
}
