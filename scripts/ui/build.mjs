/* The Build Encounter window: the brief by hand or from a chat, the live threat and treasure numbers, then a preview with GM-only drawings. */
import { ADJUSTMENTS, MOODS, ROLES, STATES, cleanBrief, mergeRows, splitRow } from "../brief.mjs";
import { START_HINT, START_LABEL } from "../start.mjs";
import { rowRemoved } from "../bands.mjs";
import { adjustedLevel, partySizeNote, treasureFor } from "../budget.mjs";
import { esc } from "../journal.mjs";
import { askRoom, dropRoomAsk } from "../roomask.mjs";
import { askBuild, clearAsk, markApplied } from "../askangel.mjs";
import { ASK_TTL_S, costWords, waitWords } from "../askprompt.mjs";
import { mergeBrief } from "../minds.mjs";
import { ROOM_WAIT_S, offersRooms } from "../room.mjs";
import { ID, ROOM_BY, applyReplace, clear, clearPreview, findCreatures, ledgerFor, partyLevels, partySize, place, prepare, prepareReplace, setManualTreasure, showPreview, suggestedLevel, threatOf } from "../builder.mjs";

const STYLE = `.leb-build .window-content{overflow:hidden!important;padding:0;display:block}.leb-build form.leb-form{display:flex;flex-direction:column;height:100%}.leb-build .leb-scroll{flex:1;overflow-y:auto;padding:8px 12px}.leb-build fieldset{margin:0 0 8px;padding:6px 8px}.leb-build .leb-row,.leb-build .leb-head{display:grid;grid-template-columns:minmax(120px,1fr) 52px 92px 100px 96px 44px 22px 22px;gap:5px;align-items:center;margin-bottom:2px}.leb-build .leb-head{font-size:.85em;opacity:.8;text-align:center;border-bottom:1px solid #0004;padding-bottom:3px;margin-bottom:5px;line-height:1.15}.leb-build .leb-head span:first-child{text-align:left}.leb-build .leb-row select{width:100%}.leb-build .leb-row input[type=checkbox]{justify-self:center}.leb-build .leb-row a{text-align:center}.leb-build .leb-row a.leb-x{color:#d05050}.leb-build details.leb-notes{margin:0 0 6px 14px;font-size:.9em}.leb-build details.leb-notes summary{cursor:pointer;opacity:.8}.leb-build details.leb-notes summary i{opacity:.75}.leb-build .leb-purpose{background:#1e2a3a;border:1px solid #4a6a90;border-radius:5px;padding:8px 10px;margin:0 0 8px;color:#e8eef6;line-height:1.4}.leb-build .leb-add{display:flex;gap:6px;align-items:center}.leb-build .leb-add input{flex:1}.leb-build .leb-add span{opacity:.75;white-space:nowrap;font-size:.9em}.leb-build .leb-drop{outline:2px dashed #6a9ad0;outline-offset:2px}.leb-build .leb-threat{color:#7cc47c;font-weight:600}.leb-build .leb-row b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.leb-build .leb-row input[type=number]{width:100%}.leb-build .leb-results{max-height:150px;overflow-y:auto;margin-top:4px}.leb-build .leb-results button{display:block;width:100%;text-align:left;line-height:1.5;height:auto;margin-bottom:1px}.leb-build .leb-warn{color:#e07050}.leb-build .leb-num{font-weight:600}.leb-build textarea{width:100%;min-height:42px}.leb-build .leb-two{display:grid;grid-template-columns:1fr 1fr;gap:6px}.leb-build .leb-actions{display:flex;gap:6px;padding:8px 12px;border-top:1px solid #0006}.leb-build .leb-actions button{flex:1}.leb-build label{font-size:.9em}.leb-build .leb-ask-log{max-height:190px;overflow-y:auto;margin:0 0 6px}.leb-build .leb-ask-log p{margin:0 0 4px;line-height:1.35}.leb-build .leb-ask-log .leb-me b{color:#6a9ad0}.leb-build .leb-ask-log .leb-angel b{color:#c08ad8}.leb-build .leb-ask-log i{opacity:.7}.leb-build .leb-ask-send{display:flex;gap:6px;margin-top:4px}.leb-build .leb-ask-send button{flex:1}.leb-build .leb-ask-send button.leb-small{flex:0 0 auto}`;
const ensureStyle = () => { if (!document.getElementById("leb-style")) { const s = document.createElement("style"); s.id = "leb-style"; s.textContent = STYLE; document.head.append(s); } };
const options = (list, cur, label = v => v) => list.map(v => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label(v))}</option>`).join("");

export class BuildApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-build", classes: ["leb-build"], window: { title: "Build Encounter", resizable: true }, position: { width: 760, height: 760, top: 20 } };
  constructor(scene) { super(); this.scene = scene; this.results = []; this.message = ""; this.draft = ""; this.loadBrief(); this.takeAnswer(); }
  /* Ask Angel (0.43.0, F-7): an answer with a brief that this GM asked for and hasn't taken yet fills the window; the GM's own lines stay */
  takeAnswer() {
    const a = this.scene.getFlag(ID, "askAngel"), b = a?.answer?.brief;
    if (!b || a.answer.applied || a.user !== game.user.id || this.previewing) return false;   /* not under a running Preview: taken when it ends (review 6) */
    const level = this.brief.partyLevel, next = cleanBrief(mergeBrief(this.brief, b, { by: "angel" }).brief); next.partyLevel ??= level;
    this.brief = next; this.openNotes?.clear(); this.message = "Angel filled this in: check it, then Preview."; markApplied(this.scene, next).catch(e => console.warn(`${ID} | ask`, e)); return true;
  }
  _onFirstRender(context, options) { super._onFirstRender?.(context, options);
    this.askHook = (scene, change) => { if (scene.id !== this.scene.id || !foundry.utils.hasProperty(change, `flags.${ID}`)) return; const f = change.flags[ID]; if (!Object.keys(f).some(k => k.endsWith("askAngel"))) return;
      this.element?.querySelectorAll("input:not([name=search]):not([name=askText]),select,textarea:not([name=askText])").forEach(el => this.readForm(el));   /* typed but not yet left (review 4) */
      this.takeAnswer(); this.render(); };
    Hooks.on("updateScene", this.askHook);
    this.askTimer = setInterval(() => { const el = this.element?.querySelector(".leb-ask-status"); if (!el) return; const was = this.askOpen(); el.innerHTML = this.askStatus(); if (was && !this.askOpen()) this.render(); }, 5000); }
  /** Is an ask waiting for its answer (unanswered and not yet lapsed)? */
  askOpen() { const a = this.scene.getFlag(ID, "askAngel"), age = a ? game.time.serverTime - a.at : -1; return !!a && !a.answer && age >= 0 && age < ASK_TTL_S * 1000; }   /* the server's clock starts again at a restart: an older ask then reads as in the future, and lapses */
  _onClose(options) { super._onClose?.(options); if (this.askHook) Hooks.off("updateScene", this.askHook); clearInterval(this.askTimer); }
  /** The chat box's status line: thinking (with how long), the wait words, or why the last ask failed. */
  askStatus() {
    const a = this.scene.getFlag(ID, "askAngel"); if (!a) return "";
    if (a.answer?.error) return `<span class="leb-warn">Angel couldn't answer: ${esc(a.answer.error)}. Send again to retry.</span>`;
    if (a.answer) return "";
    const s = Math.max(0, (game.time.serverTime - a.at) / 1000), late = waitWords(s);
    if (!this.askOpen()) return `<span class="leb-warn">Angel didn't answer that, so it has lapsed (an ask waits ${Math.round(ASK_TTL_S / 60)} minutes, and ends when the world is launched again). Answers need the bridge's API worker (version 0.4.4 or later) with its API key, running and not stopped. Send again to retry.</span>`;
    return late ? `<span class="leb-warn">${esc(late)}</span>` : `<i class="fa-solid fa-spinner fa-spin"></i> Angel is reading the map's notes and filling this in (${Math.round(s)} s).`;
  }
  loadBrief() {
    const stored = this.scene.getFlag(ID, "brief");
    this.brief = cleanBrief(stored ?? { mood: "ambush" }); this.brief.partyLevel ??= suggestedLevel(); this.fromChat = !!stored;
    this.rowInfo = new Map();
  }
  /* the minds as the scene now has them, for rows that are still the same creature at the same place (the notes box shows them) */
  takeMinds(stored) { const rows = cleanBrief(stored ?? {}).creatures; this.brief.creatures.forEach((c, i) => { const s = rows[i]; if (s && s.uuid === c.uuid) { c.mind = s.mind; c.own = s.own; } });
    /* bands (0.26.0): the scene's are taken whole, and each row that is still the scene's takes its band; a mark or a job pointing at a row that isn't
       in the band any more is dropped when the brief is cleaned (0.26.0 review 5: all-or-nothing lost a band edit made while a row was being added) */
    this.brief.creatures.forEach((c, i) => { const s = rows[i]; if (s && s.uuid === c.uuid) c.band = s.band; }); this.brief.bands = cleanBrief(stored ?? {}).bands; }
  async rowFacts() { for (const c of this.brief.creatures) if (c.uuid && !this.rowInfo.has(c.uuid)) { const a = await fromUuid(c.uuid); if (a) { this.rowInfo.set(c.uuid, { level: a.level, name: a.name }); c.name ||= a.name; } } }
  threat() { const levels = this.brief.creatures.flatMap(c => { const i = this.rowInfo.get(c.uuid); return i ? Array(c.count).fill(adjustedLevel(i.level, c.adjust)) : []; }); return levels.length ? threatOf(levels, this.brief.partyLevel, this.brief.claimedXP) : null; }
  async _renderHTML() {
    await this.rowFacts(); ensureStyle();
    const b = this.brief, t = this.threat(), lv = b.partyLevel, line = ledgerFor(lv), gp = t ? treasureFor(lv, t.rating) : 0, built = this.scene.getFlag(ID, "build"), sizeNote = partySizeNote(partySize());
    /* one row per creature (0.41.0, F-5; Rhea's sample): headers you can see, Strength (Weak / Normal / Elite), Starts with Unaware (F-3), the notes folded
       under the row; a row of several can split one off to set it apart */
    const STRENGTH = { "": "Normal", weak: "Weak", elite: "Elite" }, cap = v => v ? `${v[0].toUpperCase()}${v.slice(1)}` : v, open = this.openNotes ??= new Set();
    const head = b.creatures.length ? `<div class="leb-head"><span>Creature (level)</span><span>How many</span><span>Strength</span><span>Role</span><span>Starts</span><span>Angel</span><span></span><span></span></div>` : "";
    const rows = head + b.creatures.map((c, k) => { const i = this.rowInfo.get(c.uuid), note = c.mind?.notes?.blank ? "" : c.mind?.notes?.text ?? "";
      return `<div class="leb-row" data-row="${k}"><b title="${esc(c.uuid)}">${esc(c.name)}${i ? ` (${i.level})` : ""}</b><input type="number" name="count" min="1" max="30" value="${c.count}" title="How many"><select name="adjust" title="Strength: PF2e's Weak or Elite adjustment">${options(["weak", "", "elite"].filter(v => ADJUSTMENTS.includes(v)), c.adjust, v => STRENGTH[v])}</select><select name="role" title="Role: where it is placed and how it stands">${options(ROLES, c.role, cap)}</select><select name="state" title="${esc(START_HINT[c.state] ?? "How it starts")}">${options(STATES, c.state, v => START_LABEL[v] ?? cap(v))}</select><input type="checkbox" name="run" ${c.run ? "checked" : ""} title="Angel plays it in the fight (its tick on Monster Turns)">${c.count > 1 ? `<a data-action="splitRow" title="Split one off, to give it its own settings or notes"><i class="fa-solid fa-code-branch"></i></a>` : "<span></span>"}<a data-action="removeRow" class="leb-x" title="Remove"><i class="fa-solid fa-xmark"></i></a></div><details class="leb-notes" data-row="${k}"${open.has(k) ? " open" : ""}><summary>Notes for ${esc(c.name)} in this fight${note ? ` <i>(${esc(note.length > 50 ? `${note.slice(0, 50)}…` : note)})</i>` : ""}</summary><textarea name="notes" data-row="${k}" placeholder="How they fight here, what they are told to do (the Notes line of their mind; the rest is in Monster Minds once built)">${esc(note)}</textarea></details>`; }).join("");
    return `<form class="leb-form"><div class="leb-scroll">
      <div class="leb-purpose"><b>Builds a fight on this map.</b> 1. Add the creatures (search, or drag them in from the Actors or a compendium). 2. Set how each starts. 3. Say what they're doing here. 4. <b>Preview</b> shows where they'd stand; <b>Place it</b> puts them on the map with their notes and treasure. Or tell <b>Angel</b> below what you want, and she fills it in for you.</div>
      ${this.askBox()}
      ${built ? `<p class="leb-warn">This map already has a build. Placing replaces what that build made. Anything placed by hand stays.</p>` : ""}
      ${this.fromChat && !this.message ? `<p>Brief filled in from what's stored on this map. You can still change it.</p>` : ""}
      ${this.message ? `<p class="leb-num">${esc(this.message)}</p>` : ""}
      <fieldset><legend>The party</legend>
        <p>Sheets: ${partyLevels().map(p => `${esc(p.name)} ${p.level}`).join(", ") || "no party found"}. ${partySize()} PCs for balance.</p>
        <div class="form-group"><label>Party level for this fight</label><input type="number" name="partyLevel" min="-1" max="25" value="${lv}"></div>
        ${sizeNote ? `<p class="leb-warn">${esc(sizeNote)}</p>` : ""}</fieldset>
      <fieldset class="leb-creatures"><legend>Creatures</legend>${rows || "<p>None yet. Search below, or ask Angel.</p>"}
        <div class="leb-add"><input type="text" name="search" placeholder="Add a creature: type a name" autocomplete="off"><span>or drag one in</span></div><div class="leb-results">${this.results.map((r, k) => `<button type="button" data-action="addResult" data-k="${k}">${esc(r.name)}, level ${r.level}, ${esc(r.size)}: ${esc(r.pack)}</button>`).join("")}</div>
        <p class="leb-threat">${t ? `Threat: ${esc(t.rating)}, ${t.xp} XP for ${t.size} PCs of level ${t.level}.` : "Threat: add a creature."}</p>
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
  askBox() {
    const a = this.scene.getFlag(ID, "askAngel"), msgs = a?.messages ?? [], asked = this.askOpen();
    const MODEL = { sonnet: "Sonnet", opus: "Opus", fable: "Fable" }, log = msgs.map(m => m.who === "gm" ? `<p class="leb-me"><b>You:</b> ${esc(m.text)}</p>`
      : `<p class="leb-angel"><b>Angel:</b> ${esc(m.text)}${m.model || Number.isFinite(m.cost) ? ` <i>(${esc([m.model ? MODEL[Object.keys(MODEL).find(k => m.model.includes(k))] ?? m.model : "", costWords(m.cost)].filter(Boolean).join(", "))})</i>` : ""}</p>`).join("");
    return `<fieldset class="leb-ask"><legend>Ask Angel</legend>${log ? `<div class="leb-ask-log">${log}</div>` : `<p>Say what you want, for example "a random encounter on this road at night, Moderate" or "build what the notes say is here". She reads this map's journal notes first.</p>`}
      <p class="leb-ask-status">${this.askStatus()}</p>
      <textarea name="askText" placeholder="Tell Angel what to build or change" ${asked ? "disabled" : ""}>${esc(this.draft)}</textarea>
      <div class="leb-ask-send"><button type="button" data-action="askSend" ${asked ? "disabled" : ""}><i class="fa-solid fa-paper-plane"></i> Send to Angel</button>${msgs.length ? `<button type="button" class="leb-small" data-action="askClear" title="Start a new conversation"><i class="fa-solid fa-broom"></i> New conversation</button>` : ""}</div></fieldset>`;
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
      if (el.name === "search" || el.name === "askText") return;
      if (el.name === "manual") { await setManualTreasure(this.brief.partyLevel, el.value); return this.render(); }
      this.readForm(el);
      /* rows that now match another become one (F-5): the brief changes shape, so the open notes are forgotten */
      if (["adjust", "role", "state", "run", "notes"].includes(el.name) && this.merge(+(el.closest("[data-row]")?.dataset.row ?? el.dataset.row))) return this.render();
      if (["count", "adjust", "state", "partyLevel", "claimedXP"].includes(el.name)) this.render();
    }));
    root.querySelectorAll("details.leb-notes").forEach(d => d.addEventListener("toggle", () => { const k = +d.dataset.row; if (d.open) this.openNotes.add(k); else this.openNotes.delete(k); }));
    /* drag a creature in from the Actors sidebar or a compendium (F-5) */
    const zone = root.querySelector(".leb-creatures");
    zone?.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("leb-drop"); });
    zone?.addEventListener("dragleave", ev => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove("leb-drop"); });
    zone?.addEventListener("drop", ev => { ev.preventDefault(); zone.classList.remove("leb-drop"); this.dropped(ev).catch(e => { ui.notifications.error(e.message); console.error(e); }); });
    root.querySelector("[name=askText]")?.addEventListener("input", ev => { this.draft = ev.target.value; });
    root.querySelector("[name=askText]")?.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); this.act(root.querySelector("[data-action=askSend]")).catch(e => { ui.notifications.error(e.message); console.error(e); }); } });
    const log = root.querySelector(".leb-ask-log"); if (log) log.scrollTop = log.scrollHeight;
    const box = root.querySelector("[name=search]"); let timer = null, seq = 0;
    box?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(async () => { const mine = ++seq, list = await findCreatures(box.value).catch(() => []); if (mine !== seq) return; this.results = list;
      root.querySelector(".leb-results").innerHTML = list.map((r, k) => `<button type="button" data-action="addResult" data-k="${k}">${esc(r.name)}, level ${r.level}, ${esc(r.size)}: ${esc(r.pack)}</button>`).join(""); this.bindActions(); }, 250); });
    this.bindActions();
  }
  bindActions() { this.element.querySelectorAll("[data-action]").forEach(el => { if (el.dataset.bound) return; el.dataset.bound = "1"; el.addEventListener("click", ev => { ev.preventDefault(); this.act(el).catch(e => { ui.notifications.error(e.message); console.error(e); }); }); }); }
  /** A creature added from the search or a drop: one more on a row of the same creature with the new-row settings, else a new row (F-5). */
  addCreature(r) {
    const row = { uuid: r.uuid, name: r.name, count: 1, adjust: "", role: "brute", state: this.brief.mood === "ambush" ? "hidden" : "alert", mind: {}, own: {}, band: "", leader: false, anchor: "", run: true, opus: false };
    this.brief.creatures.push(row); this.merge(this.brief.creatures.length - 1);
  }
  /** Rows that match become one. Out: whether anything changed. */
  merge(only = null) {
    const before = this.brief.creatures.length, r = mergeRows(this.brief.creatures, this.brief.bands, Number.isInteger(only) ? only : null);
    if (r.creatures.length === before) return false;
    this.brief.creatures = r.creatures; this.brief.bands = r.bands; this.openNotes?.clear(); return true;
  }
  /** A drop from the Actors sidebar or a compendium: a creature (an NPC) is added; a folder, a character or anything else is refused in words. */
  async dropped(ev) {
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor, data = TE.getDragEventData(ev);
    if (data?.type !== "Actor" || !data.uuid) return ui.notifications.warn("Drop a creature from the Actors sidebar or a compendium.");
    const a = await fromUuid(data.uuid); if (!a) return ui.notifications.warn("That creature couldn't be found.");
    if (!a.isOfType?.("npc")) return ui.notifications.warn(`${a.name} isn't a creature (an NPC), so it can't be built into an encounter.`);
    this.rowInfo.set(a.uuid, { level: a.level, name: a.name }); this.addCreature({ uuid: a.uuid, name: a.name }); this.render();
  }
  async act(el) {
    const a = el.dataset.action;
    if (a === "addResult") { const r = this.results[+el.dataset.k]; if (r) { this.addCreature(r); this.results = []; this.render(); } }
    else if (a === "removeRow") { const g = +el.closest("[data-row]").dataset.row; this.brief.creatures.splice(g, 1); this.brief.bands = rowRemoved(this.brief.bands, g); this.openNotes?.clear(); this.render(); }
    else if (a === "splitRow") { const g = +el.closest("[data-row]").dataset.row, r = splitRow(this.brief.creatures, this.brief.bands, g); this.brief.creatures = r.creatures; this.brief.bands = r.bands; this.openNotes?.clear(); this.render(); }
    else if (a === "askAngel") { const t = this.element.querySelector("[name=askText]"); t?.scrollIntoView({ block: "center" }); t?.focus(); }
    else if (a === "askSend") { if (!el || el.disabled) return; const words = (this.element.querySelector("[name=askText]")?.value ?? this.draft).trim(); if (!words) return ui.notifications.warn("Type what you'd like Angel to build first.");
      el.disabled = true; try { await askBuild(this.scene, words, this.brief); } catch (e) { el.disabled = false; throw e; } this.draft = ""; this.message = ""; this.render(); }
    else if (a === "askClear") { await clearAsk(this.scene); this.draft = ""; this.render(); }
    else if (a === "preview") { /* out of the way while she looks at the map */
      await this.minimize(); this.previewing = true;
      let r; try { r = await previewLoop(this.scene, (s, room) => prepare(this.scene, this.brief, { seed: s, room }), place, "Build this?"); } catch (e) { this.previewing = false; await this.maximize(); throw e; }   /* a brief prepare refuses must not leave the window minimized (0.39.10) */
      this.previewing = false; if (!r && this.takeAnswer()) this.render();   /* an answer that came during the Preview (review 6) */
      if (r) { this.close(); ui.notifications.info(`Placed ${r.tokens} creatures: ${r.threat.rating}, ${r.threat.xp} XP.`); for (const w of r.warnings) ui.notifications.warn(w); } else await this.maximize(); }
  }
}
function describe(prep, moving, roomLine = "") {
  const w = prep.warnings.length ? `<ul>${prep.warnings.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "", p = prep.plan.placed;
  return `<p><b>${esc(prep.threat.rating)}</b>, ${prep.threat.xp} XP for ${prep.threat.size} PCs of level ${prep.threat.level}. ${p.length} creatures.${moving ? "" : ` Treasure: ${prep.treasure.value} gp.`} Layout ${prep.seed}.</p>${roomLine}${prep.treasure.note && !moving ? `<p>${esc(prep.treasure.note)}</p>` : ""}${w}<p>The coloured squares are visible to GMs only.</p>`;
}
/* the room lines of the Preview (0.42.0, F-6): which room and why, and where Angel's look stands */
function roomWords(prep, ask, angel) {
  if (!offersRooms(prep.rooms ?? [])) return "";
  const r = prep.room, head = r ? `<p><b>Room ${r.n}</b> of ${prep.rooms.length}, ${esc(ROOM_BY[r.by] ?? "picked")}: ${esc(r.why)}</p>` : `<p><b>The whole map</b>: no room picked, so they stand anywhere on it.</p>`;
  let look = "";
  if (ask && !angel) look = `<p><i class="fa-solid fa-spinner fa-spin"></i> Angel is looking at the map for a room.${r?.by === "builder" ? " Meanwhile this is the builder's pick." : ""}</p>`;
  const stays = r?.by === "builder" ? "this stays the builder's pick" : "your choice stays";
  if (angel?.timeout) look = `<p>Angel didn't answer within ${ROOM_WAIT_S} seconds (it needs the bridge's API worker, version 0.4.3 or later, with its API key, running and not stopped), so ${stays}.</p>`;
  else if (angel?.error) look = `<p>Angel's pick couldn't be used (${esc(angel.error)}), so ${stays}.</p>`;
  else if (angel && r?.by !== "angel") look = `<p>Angel suggested room ${angel.n}: ${esc(angel.why)}</p>`;
  return head + look;
}
/** Click a square inside a room on the map: its number, or null (right-click, Escape or two minutes keep the room there was). */
function pickRoom(prep) {
  return new Promise(res => {
    ui.notifications.info("Click inside the room they should start in. Right-click or Escape keeps the room you had.");
    const done = v => { canvas.stage.off("pointerdown", on); document.removeEventListener("keydown", key, true); clearTimeout(t); res(v); };
    const on = ev => { if (ev.button === 2) return done(null); const p = ev.getLocalPosition(canvas.stage), m = prep.model, i = Math.floor((p.x - prep.ox) / prep.px), j = Math.floor((p.y - prep.oy) / prep.px);
      if (!m.inMap(i, j)) return ui.notifications.warn("That is off the map: click inside a room.");
      const r = prep.rooms.find(x => x.id === m.roomOf[m.idx(i, j)]);
      if (!r) return ui.notifications.warn("That square is in no room (a wall, or a pocket too small to stand in): click inside a room.");
      done(r.n); };
    const key = ev => { if (ev.key === "Escape") { ev.stopPropagation(); done(null); } };
    const t = setTimeout(() => done(null), 120000);
    canvas.stage.on("pointerdown", on); document.addEventListener("keydown", key, true);
  });
}
const PREVIEW_DIALOG = `${ID}-preview`;
/** Show a layout as GM-only drawings until the GM places it or cancels. "Try another layout" changes only the seed. On a map with rooms (0.42.0):
    the builder's pick first, Angel's when it comes (unless the GM clicked a room), "Pick another room" and "Use the whole map". */
async function previewLoop(scene, makePrep, apply, title, moving = false) {
  if (canvas.scene?.id !== scene.id) await scene.view();
  let seed = null, room, ask = null, angel = null, interrupted = false, timer = null, gmChose = false;
  /* a fresh id for each dialog (live test build 2: a dialog opened again at once under the id of the one just closing never showed, and the
     Preview hung), and this Preview's own, so Angel's answer closes only its dialog (review 7) */
  let dialogId = null, shown = 0;
  const wake = () => { interrupted = true; if (dialogId) foundry.applications.instances.get(dialogId)?.close(); };
  const hook = Hooks.on("updateScene", s => {
    if (s.id !== scene.id || ask == null || angel) return; const a = s.getFlag(ID, "roomAsk"); if (a?.seq !== ask || !a.answer) return;
    angel = a.answer; clearTimeout(timer);
    if (!angel.error && !gmChose) room = { n: angel.n, by: "angel", why: angel.why };   /* a room or the whole map the GM chose stays (review 2) */
    wake();
  });
  try {
    for (;;) {
      interrupted = false;
      let made = room; const prep = await makePrep(seed, room); seed = prep.seed;
      if (room !== made) continue;   /* Angel's pick came while this layout was being made */
      if (room === undefined) made = room = prep.room;
      await clearPreview(scene); await showPreview(prep);
      if (!moving && ask == null && offersRooms(prep.rooms ?? []) && game.settings.get(ID, "roomByAngel")) {
        ask = await askRoom(scene, prep);
        timer = setTimeout(() => { if (!angel) { angel = { timeout: true }; wake(); } }, ROOM_WAIT_S * 1000);
      }
      const rooms = !moving && offersRooms(prep.rooms ?? []);
      const buttons = [{ action: "place", label: "Place it", icon: "fa-solid fa-check", default: true }, { action: "again", label: "Try another layout", icon: "fa-solid fa-shuffle" },
        ...(rooms ? [{ action: "pick", label: "Pick another room", icon: "fa-solid fa-hand-pointer" }] : []),
        ...(rooms && angel?.n && room?.by !== "angel" ? [{ action: "angelRoom", label: `Use Angel's room ${angel.n}`, icon: "fa-solid fa-wand-magic-sparkles" }] : []),
        ...(rooms && room ? [{ action: "whole", label: "Use the whole map", icon: "fa-solid fa-expand" }] : []),
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }];
      if (interrupted || room !== made) continue;   /* Angel's answer came while this layout was drawn (review 3) */
      dialogId = `${PREVIEW_DIALOG}-${scene.id}-${++shown}`;
      const choice = await foundry.applications.api.DialogV2.wait({ id: dialogId, window: { title }, position: { width: 440, left: 110, top: 60 }, modal: false, rejectClose: false, content: describe(prep, moving, roomWords(prep, ask, angel)), buttons });
      if (interrupted && choice == null) continue;   /* Angel's pick came, or the wait ran out: the same layout's seed, drawn again */
      if (choice === "again") { seed += 1; continue; }
      if (choice === "pick") { const n = await pickRoom(prep); if (n != null) { room = { n, by: "gm", why: "You clicked it on the map." }; gmChose = true; } continue; }
      if (choice === "angelRoom") { room = { n: angel.n, by: "angel", why: angel.why }; gmChose = true; continue; }
      if (choice === "whole") { room = null; gmChose = true; continue; }
      if (choice !== "place") return null;
      return await apply(prep);
    }
  } finally { Hooks.off("updateScene", hook); clearTimeout(timer); try { await clearPreview(scene); } finally { if (ask != null) await dropRoomAsk(scene, ask).catch(() => {}); } }
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
