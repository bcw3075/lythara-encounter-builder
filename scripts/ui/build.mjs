/* The Build Encounter window: the brief by hand or from a chat, the live threat and treasure numbers, then a preview with GM-only drawings. */
import { ADJUSTMENTS, MOODS, ROLES, STATES, cleanBrief } from "../brief.mjs";
import { adjustedLevel, partySizeNote, treasureFor } from "../budget.mjs";
import { esc } from "../journal.mjs";
import { ID, applyReplace, clear, clearPreview, findCreatures, ledgerFor, partyLevels, partySize, place, prepare, prepareReplace, setManualTreasure, showPreview, suggestedLevel, summary, threatOf } from "../builder.mjs";

const STYLE = `.leb-build .window-content{overflow:hidden!important;padding:0;display:block}.leb-build form.leb-form{display:flex;flex-direction:column;height:100%}.leb-build .leb-scroll{flex:1;overflow-y:auto;padding:8px 12px}.leb-build fieldset{margin:0 0 8px;padding:6px 8px}.leb-build .leb-row{display:grid;grid-template-columns:1fr 54px 70px 88px 78px 24px 24px;gap:4px;align-items:center;margin-bottom:3px}.leb-build .leb-row b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.leb-build .leb-row input[type=number]{width:100%}.leb-build .leb-results{max-height:150px;overflow-y:auto;margin-top:4px}.leb-build .leb-results button{display:block;width:100%;text-align:left;line-height:1.5;height:auto;margin-bottom:1px}.leb-build .leb-warn{color:#e07050}.leb-build .leb-num{font-weight:600}.leb-build textarea{width:100%;min-height:42px}.leb-build .leb-two{display:grid;grid-template-columns:1fr 1fr;gap:6px}.leb-build .leb-actions{display:flex;gap:6px;padding:8px 12px;border-top:1px solid #0006}.leb-build .leb-actions button{flex:1}.leb-build label{font-size:.9em}`;
const ensureStyle = () => { if (!document.getElementById("leb-style")) { const s = document.createElement("style"); s.id = "leb-style"; s.textContent = STYLE; document.head.append(s); } };
const options = (list, cur, label = v => v) => list.map(v => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label(v))}</option>`).join("");

export class BuildApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-build", classes: ["leb-build"], window: { title: "Build Encounter", resizable: true }, position: { width: 660, height: 720, top: 20 } };
  constructor(scene) { super(); this.scene = scene; this.results = []; this.message = ""; this.loadBrief(); }
  loadBrief() {
    const stored = this.scene.getFlag(ID, "brief");
    this.brief = cleanBrief(stored ?? { mood: "ambush" }); this.brief.partyLevel ??= suggestedLevel(); this.fromChat = !!stored;
    this.rowInfo = new Map();
  }
  async rowFacts() { for (const c of this.brief.creatures) if (c.uuid && !this.rowInfo.has(c.uuid)) { const a = await fromUuid(c.uuid); if (a) { this.rowInfo.set(c.uuid, { level: a.level, name: a.name }); c.name ||= a.name; } } }
  threat() { const levels = this.brief.creatures.flatMap(c => { const i = this.rowInfo.get(c.uuid); return i ? Array(c.count).fill(adjustedLevel(i.level, c.adjust)) : []; }); return levels.length ? threatOf(levels, this.brief.partyLevel, this.brief.claimedXP) : null; }
  async _renderHTML() {
    await this.rowFacts(); ensureStyle();
    const b = this.brief, t = this.threat(), lv = b.partyLevel, line = ledgerFor(lv), gp = t ? treasureFor(lv, t.rating) : 0, built = this.scene.getFlag(ID, "build"), sizeNote = partySizeNote(partySize());
    const rows = b.creatures.map((c, k) => { const i = this.rowInfo.get(c.uuid); return `<div class="leb-row" data-row="${k}"><b title="${esc(c.uuid)}">${esc(c.name)}${i ? ` (${i.level})` : ""}</b><input type="number" name="count" min="1" max="30" value="${c.count}" title="How many"><select name="adjust" title="Adjustment">${options(ADJUSTMENTS, c.adjust, v => v || "normal")}</select><select name="role" title="Role">${options(ROLES, c.role)}</select><select name="state" title="How it starts">${options(STATES, c.state)}</select><input type="checkbox" name="run" ${c.run ? "checked" : ""} title="Angel runs this (used once monster turns exist)"><a data-action="removeRow" title="Remove"><i class="fa-solid fa-xmark"></i></a></div><textarea name="notes" data-row="${k}" placeholder="Notes for ${esc(c.name)} in this encounter: how they fight here, what they are told to do (the Notes line of their mind; the rest is in Monster Minds once built)">${esc(c.mind?.notes?.blank ? "" : c.mind?.notes?.text ?? "")}</textarea>`; }).join("");
    return `<form class="leb-form"><div class="leb-scroll">
      ${built ? `<p class="leb-warn">This map already has a build. Placing replaces what that build made. Anything placed by hand stays.</p>` : ""}
      ${this.fromChat ? `<p>Brief filled in from what's stored on this map. You can still change it.</p>` : ""}
      ${this.message ? `<p class="leb-num">${esc(this.message)}</p>` : ""}
      <fieldset><legend>The party</legend>
        <p>Sheets: ${partyLevels().map(p => `${esc(p.name)} ${p.level}`).join(", ") || "no party found"}. ${partySize()} PCs for balance.</p>
        <div class="form-group"><label>Party level for this fight</label><input type="number" name="partyLevel" min="-1" max="25" value="${lv}"></div>
        ${sizeNote ? `<p class="leb-warn">${esc(sizeNote)}</p>` : ""}</fieldset>
      <fieldset><legend>Creatures</legend>${rows || "<p>None yet. Search below, or ask Angel.</p>"}
        <input type="text" name="search" placeholder="Search every creature compendium" autocomplete="off"><div class="leb-results">${this.results.map((r, k) => `<button type="button" data-action="addResult" data-k="${k}">${esc(r.name)}, level ${r.level}, ${esc(r.size)}: ${esc(r.pack)}</button>`).join("")}</div>
        <p class="leb-num">${t ? `Threat: ${esc(t.rating)}, ${t.xp} XP for ${t.size} PCs of level ${t.level}.` : "Threat: add a creature."}</p>
        ${t?.claimNote ? `<p class="leb-warn">${esc(t.claimNote)}</p>` : ""}
        <div class="form-group"><label>XP written in the notes (optional)</label><input type="number" name="claimedXP" value="${b.claimedXP ?? ""}"></div></fieldset>
      <fieldset><legend>The encounter</legend>
        <div class="leb-two"><div class="form-group"><label>Name</label><input type="text" name="name" value="${esc(b.name)}"></div><div class="form-group"><label>Mood</label><select name="mood">${options(MOODS, b.mood)}</select></div></div>
        <textarea name="why" placeholder="Why are they here?">${esc(b.why)}</textarea><textarea name="want" placeholder="What do they want?">${esc(b.want)}</textarea><textarea name="doing" placeholder="What were they doing?">${esc(b.doing)}</textarea><textarea name="retreat" placeholder="How do they retreat?">${esc(b.retreat)}</textarea></fieldset>
      <fieldset><legend>Treasure</legend>
        <div class="form-group"><label>Source</label><select name="treasureMode">${b.treasure.length ? `<option value="list"${b.treasureMode === "list" ? " selected" : ""}>The brief's list (${b.treasure.length})</option>` : ""}<option value="table"${b.treasureMode === "table" ? " selected" : ""}>Treasure by Encounter: ${gp} gp</option><option value="none"${b.treasureMode === "none" ? " selected" : ""}>None</option></select></div>
        <p>Level ${lv}: ${line.placed} gp placed by builds and ${line.manual} gp added by hand, of ${line.total} gp for the level. <span class="${line.left < gp ? "leb-warn" : ""}">${Math.max(0, line.left)} gp left.</span></p>
        <div class="form-group"><label>Added by hand at this level (gp)</label><input type="number" name="manual" min="0" value="${line.manual}"></div></fieldset>
      </div><div class="leb-actions"><button type="button" data-action="askAngel"><i class="fa-solid fa-comments"></i> Ask Angel</button><button type="button" data-action="preview"><i class="fa-solid fa-eye"></i> Preview</button></div>
    </form>`;
  }
  _replaceHTML(html, content) { const top = content.querySelector(".leb-scroll")?.scrollTop ?? 0; content.innerHTML = html; const box = content.querySelector(".leb-scroll"); if (box) box.scrollTop = top; }
  /* whatever the form holds goes into the brief at once, so a re-render loses nothing */
  readForm(el) {
    const n = el.name, row = el.closest("[data-row]")?.dataset.row ?? el.dataset.row, c = row === undefined ? null : this.brief.creatures[+row];
    if (c) { if (n === "count") c.count = Math.max(1, Math.min(30, +el.value || 1)); else if (n === "run") c.run = el.checked; else if (["adjust", "role", "state"].includes(n)) c[n] = el.value;
      else if (n === "notes") { c.mind ??= {}; if (el.value.trim()) c.mind.notes = { text: el.value, by: "gm" }; else delete c.mind.notes; } return; }
    if (n === "partyLevel") this.brief.partyLevel = Math.round(+el.value || 0); else if (n === "claimedXP") this.brief.claimedXP = el.value === "" ? null : +el.value; else if (["name", "mood", "why", "want", "doing", "retreat", "treasureMode"].includes(n)) this.brief[n] = el.value;
  }
  _onRender() {
    const root = this.element;
    root.querySelectorAll("input,select,textarea").forEach(el => el.addEventListener("change", async ev => {
      if (el.name === "search") return;
      if (el.name === "manual") { await setManualTreasure(this.brief.partyLevel, el.value); return this.render(); }
      this.readForm(el); if (["count", "adjust", "partyLevel", "claimedXP"].includes(el.name)) this.render();
    }));
    const box = root.querySelector("[name=search]"); let timer = null, seq = 0;
    box?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => { const mine = ++seq, list = await findCreatures(box.value).catch(() => []); if (mine !== seq) return; this.results = list;
      root.querySelector(".leb-results").innerHTML = list.map((r, k) => `<button type="button" data-action="addResult" data-k="${k}">${esc(r.name)}, level ${r.level}, ${esc(r.size)}: ${esc(r.pack)}</button>`).join(""); this.bindActions(); }, 250); });
    this.bindActions();
  }
  bindActions() { this.element.querySelectorAll("[data-action]").forEach(el => { if (el.dataset.bound) return; el.dataset.bound = "1"; el.addEventListener("click", ev => { ev.preventDefault(); this.act(el).catch(e => { ui.notifications.error(e.message); console.error(e); }); }); }); }
  async act(el) {
    const a = el.dataset.action;
    if (a === "addResult") { const r = this.results[+el.dataset.k]; if (r) { this.brief.creatures.push({ uuid: r.uuid, name: r.name, count: 1, adjust: "", role: "brute", state: this.brief.mood === "ambush" ? "hidden" : "alert", mind: {}, own: {}, band: "", leader: false, anchor: "", run: true, opus: false }); this.results = []; this.render(); } }
    else if (a === "removeRow") { this.brief.creatures.splice(+el.closest("[data-row]").dataset.row, 1); this.render(); }
    else if (a === "askAngel") { const s = await summary(this.scene); await this.scene.setFlag(ID, "design", { requested: Date.now(), summary: s }); this.message = `Asked. In your chat, say "build an encounter on ${this.scene.name}". The brief appears here when it's sent.`; this.render(); }
    else if (a === "preview") { /* out of the way while she looks at the map */
      await this.minimize();
      const r = await previewLoop(this.scene, s => prepare(this.scene, this.brief, { seed: s }), place, "Build this?");
      if (r) { this.close(); ui.notifications.info(`Placed ${r.tokens} creatures: ${r.threat.rating}, ${r.threat.xp} XP.`); for (const w of r.warnings) ui.notifications.warn(w); } else await this.maximize(); }
  }
}
function describe(prep, moving) {
  const w = prep.warnings.length ? `<ul>${prep.warnings.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "", p = prep.plan.placed;
  return `<p><b>${esc(prep.threat.rating)}</b>, ${prep.threat.xp} XP for ${prep.threat.size} PCs of level ${prep.threat.level}. ${p.length} creatures.${moving ? "" : ` Treasure: ${prep.treasure.value} gp.`} Layout ${prep.seed}.</p>${prep.treasure.note && !moving ? `<p>${esc(prep.treasure.note)}</p>` : ""}${w}<p>The coloured squares are visible to GMs only.</p>`;
}
/** Show a layout as GM-only drawings until the GM places it or cancels. "Try another layout" changes only the seed. */
async function previewLoop(scene, makePrep, apply, title, moving = false) {
  if (canvas.scene?.id !== scene.id) await scene.view();
  let seed = null;
  try {
    for (;;) {
      const prep = await makePrep(seed); seed = prep.seed; await clearPreview(scene); await showPreview(prep);
      const choice = await foundry.applications.api.DialogV2.wait({ window: { title }, position: { width: 420, left: 110, top: 60 }, modal: false, rejectClose: false, content: describe(prep, moving), buttons: [{ action: "place", label: "Place it", icon: "fa-solid fa-check", default: true }, { action: "again", label: "Try another layout", icon: "fa-solid fa-shuffle" }, { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }] });
      if (choice === "again") { seed += 1; continue; }
      if (choice !== "place") return null;
      return await apply(prep);
    }
  } finally { await clearPreview(scene); }
}
export async function askReplace(scene) {
  const r = await previewLoop(scene, s => prepareReplace(scene, s), applyReplace, "Move them here?", true);
  if (r) { ui.notifications.info(`Moved ${r.moved} creatures.`); for (const w of r.warnings) ui.notifications.warn(w); }
}
export async function askClear(scene) {
  if (!scene.getFlag(ID, "build")) return ui.notifications.info("This map has no build to clear.");
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Clear this build" }, content: "<p>Remove the creatures, treasure, journal and notes this build made? Anything placed by hand stays.</p>" }).catch(() => false);
  if (ok) { const r = await clear(scene); ui.notifications.info(`Removed ${r.removed} placed things.`); }
}
