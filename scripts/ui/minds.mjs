/* The Monster Minds window (one scene's profiles) and the Minds Library window (0.24.0). Rhea's window samples of 2026-11-10 are the starting point:
   kinds on the left with any single monster's own profile under its kind; the six lines and notes on the right, Mind and Works with others as
   pick lists, the others her own words with suggestions; a tag per line saying where it comes from; a warning under a line that names a party member. */
import { esc } from "../journal.mjs";
import { ID, findCreatures } from "../builder.mjs";
import { CAPS, LAYER_WORDS, LIBRARY_LINES, LINES, LINE_LABEL, PICKS, SUGGEST, assemble, cleanLine, libraryChanges, lineWarnings, lineWords, peopleKey } from "../minds.mjs";
import { dropOwn, giveOwn, kindFacts, libraryEntries, libraryExport, libraryGet, libraryImport, libraryPut, libraryRemove, mindRows, partyPeople, rowProfile, setLines } from "../library.mjs";

const STYLE = `.leb-minds .window-content{overflow:hidden!important;padding:0;display:flex;flex-direction:column}
.leb-minds .lm-body{flex:1;display:flex;min-height:0}.leb-minds .lm-side{width:230px;overflow-y:auto;padding:8px;border-right:1px solid var(--color-border,#8886)}
.leb-minds .lm-side h4{margin:10px 4px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;border:0}
.leb-minds .lm-it{display:flex;justify-content:space-between;gap:6px;padding:5px 8px;border-radius:5px;margin:2px 0;cursor:pointer}.leb-minds .lm-it:hover{background:#8882}
.leb-minds .lm-it.on{background:#7a68b833;outline:1px solid #7a68b8}.leb-minds .lm-it small{opacity:.7;white-space:nowrap}.leb-minds .lm-it.sub{margin-left:16px}.leb-minds .lm-later{opacity:.5;padding:5px 8px}
.leb-minds .lm-main{flex:1;overflow-y:auto;padding:12px 16px;min-width:0}.leb-minds .lm-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}.leb-minds .lm-head b{font-size:1.25em}.leb-minds .lm-head small{opacity:.7}
.leb-minds .lm-row{display:grid;grid-template-columns:150px 1fr 150px;gap:10px;align-items:start;padding:7px 0;border-top:1px solid #8883}
.leb-minds .lm-row>label{font-weight:600;padding-top:6px}.leb-minds .lm-row textarea{width:100%;min-height:44px;resize:vertical;font-family:inherit}.leb-minds .lm-row textarea.lm-notes{min-height:84px}
.leb-minds .lm-row select,.leb-minds .lm-row input[type=text]{width:100%}.leb-minds .lm-pick{display:grid;grid-template-columns:190px 1fr;gap:6px}
.leb-minds .lm-chips{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}.leb-minds .lm-chip{font-size:12px;padding:1px 8px;border:1px solid #8886;border-radius:11px;cursor:pointer;opacity:.85}.leb-minds .lm-chip:hover{background:#8882}
.leb-minds .lm-from{font-size:12px;padding-top:6px;opacity:.9}.leb-minds .lm-tag{font-style:normal;padding:1px 7px;border-radius:9px;margin-right:4px;color:#111;white-space:nowrap}
.leb-minds .lm-tag.people{background:#bcd6f5}.leb-minds .lm-tag.kind{background:#cfe6b5}.leb-minds .lm-tag.encounter{background:#f3d9a8}.leb-minds .lm-tag.own{background:#f0c2ec}.leb-minds .lm-tag.statblock{background:#d9d9d9}.leb-minds .lm-tag.fight{background:#f5b8b0}
.leb-minds .lm-from a{display:block;margin-top:3px;font-size:11px}.leb-minds .lm-warn{margin:6px 0 0;padding:6px 9px;border:1px solid #a9772a;background:#f3d9a833;border-radius:5px;font-size:13px}
.leb-minds .lm-note{margin-top:10px;opacity:.75;font-size:12px}.leb-minds .lm-msg{padding:4px 16px;font-size:13px}
.leb-minds .lm-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--color-border,#8886)}.leb-minds .lm-foot button{width:auto;flex:0 0 auto}.leb-minds .lm-foot .lm-left{margin-right:auto}.leb-minds .lm-unsaved{align-self:center;font-size:12px;opacity:.8}
.leb-minds table.lm-tbl{width:100%;border-collapse:collapse;table-layout:fixed}.leb-minds .lm-tbl td,.leb-minds .lm-tbl th{padding:6px 8px;border-top:1px solid #8883;text-align:left;vertical-align:top;word-wrap:break-word}
.leb-minds .lm-tbl th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-top:0}.leb-minds .lm-tbl td.lm-cell{cursor:pointer}.leb-minds .lm-tbl td.lm-cell:hover{background:#8882}.leb-minds .lm-same{opacity:.5}
.leb-minds .lm-tbl th a{margin-left:6px;opacity:.7}.leb-minds input.lm-search{width:100%;margin-bottom:6px}
.lm-dialog textarea{width:100%;min-height:70px}.lm-dialog label.lm-line{display:block;margin:4px 0}.lm-dialog .lm-old{opacity:.6}`;
const ensureStyle = () => { if (!document.getElementById("leb-minds-style")) { const s = document.createElement("style"); s.id = "leb-minds-style"; s.textContent = STYLE; document.head.append(s); } };
const { ApplicationV2, DialogV2 } = foundry.applications.api;
const who = by => by === "gm" ? "yours" : by === "angel" ? "Angel" : "from its stat block";
const refKey = ref => JSON.stringify(ref ?? null);
const tag = (from, name) => `<i class="lm-tag ${esc(from)}">${esc(LAYER_WORDS[from] ?? from)}</i>${name ? esc(name) : ""}`;
const warnHtml = (text, people, library = false) => { const w = lineWarnings(text, people), out = [];
  for (const n of w.names) out.push(library ? `“${esc(n)}” in this line is a party member's name. Library text is used in every encounter, so it should name nobody.` : `“${esc(n)}” in this line is a party member's name. A monster only gets a line like this while it perceives that creature. Reword it?`);
  if (w.stats) out.push("This reads like a number off a character sheet. A monster couldn't know it.");
  return out.map(x => `<div class="lm-warn">⚠ ${x}</div>`).join(""); };
const input = (title, content, ok = "Save", width = 520) => DialogV2.input({ window: { title }, classes: ["lm-dialog"], position: { width }, content, ok: { label: ok }, rejectClose: false });
let libraryApp = null;
export const openLibrary = () => { libraryApp ??= new LibraryApp(); libraryApp.render(true); return libraryApp; };
export const redrawLibrary = () => { if (libraryApp?.rendered) libraryApp.render(); };

/* ---------- Monster Minds: one scene ---------- */
export class MindsApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-minds", classes: ["leb-minds"], window: { title: "Monster Minds", resizable: true }, position: { width: 940, height: 680, top: 30 } };
  constructor(scene) { super(); this.scene = scene; this.sel = null; this.draft = {}; this.message = ""; }
  get title() { return `Monster Minds: ${this.scene.name}`; }
  get dirty() { return Object.keys(this.draft).length > 0; }
  /* the layer this view edits: a monster's own, or this encounter's for the kind */
  layerOf(ref) { return ref.token || Number.isInteger(ref.n) || this.row?.party ? "own" : "encounter"; }
  find(rows) { for (const r of rows) { if (refKey(r.ref) === this.sel) return { row: r, ref: r.ref }; for (const o of r.own) if (refKey(o.ref) === this.sel) return { row: r, ref: o.ref, own: o }; } return null; }
  async _renderHTML() {
    ensureStyle(); const scene = this.scene, rows = mindRows(scene); let at = this.find(rows);
    if (!at && rows.length) { this.sel = refKey(rows[0].ref); this.draft = {}; at = this.find(rows); }
    const built = rows.filter(r => Number.isInteger(r.ref.row)), loose = rows.filter(r => r.ref.kind), party = rows.filter(r => r.party);
    const item = r => `<div class="lm-it${refKey(r.ref) === this.sel ? " on" : ""}" data-sel="${esc(refKey(r.ref))}">${esc(r.name)} <small>${r.party ? "Angel plays it" : `× ${r.count}`}</small></div>${r.own.map(o => `<div class="lm-it sub${refKey(o.ref) === this.sel ? " on" : ""}" data-sel="${esc(refKey(o.ref))}">${esc(o.name)} <small>own profile</small></div>`).join("")}`;
    const side = `${built.length ? `<h4>In this encounter</h4>${built.map(item).join("")}` : ""}${loose.length ? `<h4>${built.length ? "Not placed by the build" : "On this map"}</h4>${loose.map(item).join("")}` : ""}${party.length ? `<h4>With the party</h4>${party.map(item).join("")}` : ""}<h4>Later releases</h4><div class="lm-later">Bands, their plans and leaders</div>`;
    if (!at) return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main"><p>No monsters on this map yet. Build an encounter or put monsters on it, then open this again.</p></div></div><div class="lm-foot"><button type="button" class="lm-left" data-action="library"><i class="fa-solid fa-book"></i> Minds Library…</button></div>`;
    const { row, ref } = at; this.row = row; this.ref = ref;
    const profile = this.profile = await rowProfile(scene, row, ref), layer = this.layer = this.layerOf(ref), people = partyPeople(scene);
    /* what a line falls back to when this layer's is taken away: for a monster's own profile only the stat block (its own is the whole profile) */
    const below = this.below = assemble(profile.layers.filter(l => l.from !== layer && (layer !== "own" || l.from === "statblock"))).lines, mine = this.mine = profile.layers.find(l => l.from === layer)?.lines ?? {};
    this.people = people; this.rowUuid = row.uuid ?? null;
    const single = layer === "own", entry = profile.kind ? libraryGet(profile.kind.key) : null, peopleName = entry?.people ? libraryGet(entry.people)?.name : null;
    const lineRow = k => {
      const cur = profile.assembled.lines[k], d = this.draft[k], val = d !== undefined ? (d ?? below[k] ?? {}) : (cur ?? {}), text = val.text ?? "", fromMine = d !== undefined ? d !== null : !!mine[k] && !mine[k].blank, blanked = d === undefined && !!mine[k]?.blank;
      const field = PICKS[k]
        ? `<div class="lm-pick"><select name="${k}.pick"><option value="">(not set)</option>${Object.entries(PICKS[k]).map(([id, p]) => `<option value="${id}"${val.pick === id ? " selected" : ""} title="${esc(p.words)}">${esc(p.label)}</option>`).join("")}</select><input type="text" name="${k}.text" maxlength="${CAPS.store}" value="${esc(text)}" placeholder="in your own words (optional)"></div>`
        : `<textarea name="${k}.text" class="${k === "notes" ? "lm-notes" : ""}" maxlength="${k === "notes" ? CAPS.storeNotes : CAPS.store}" placeholder="${blanked ? "left blank on purpose" : ""}">${esc(text)}</textarea>${(SUGGEST[k] ?? []).length ? `<div class="lm-chips">${SUGGEST[k].map(s => `<span class="lm-chip" data-chip="${k}">${esc(s)}</span>`).join("")}</div>` : ""}`;
      return `<div class="lm-row" data-line="${k}"><label>${esc(LINE_LABEL[k])}</label><div>${field}<div class="lm-warns">${warnHtml(text, people)}</div></div><div class="lm-from">${this.srcOf(k)}</div></div>`; };
    const head = single && !row.party ? `<b>${esc(at.own?.name ?? row.name)}</b><small>its own profile: it no longer follows ${esc(row.name)}'s</small>` : row.party ? `<b>${esc(row.name)}</b><small>with the party: only what you write here is used</small>` : `<b>${esc(row.name)}</b><small>${row.count} monster${row.count === 1 ? "" : "s"} follow${row.count === 1 ? "s" : ""} this profile${peopleName ? ` · people: ${esc(peopleName)}` : entry ? " · in the library" : ""}</small>`;
    const foot = `<button type="button" class="lm-left" data-action="library"><i class="fa-solid fa-book"></i> Minds Library…</button>${single && !row.party ? `<button type="button" data-action="dropOwn">Follow its kind again</button>` : ""}${!single && row.tokens.length ? `<button type="button" data-action="giveOwn">Give one monster its own profile…</button>` : ""}${!single && profile.kind ? `<button type="button" data-action="toLibrary">Save to library…</button>` : ""}<span class="lm-unsaved">${this.dirty ? "Not saved yet" : ""}</span><button type="button" data-action="save" class="lm-go"><i class="fa-solid fa-floppy-disk"></i> ${single ? "Save its profile" : "Save for this encounter"}</button>`;
    return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main"><div class="lm-head">${head}</div>${LINES.map(lineRow).join("")}
      <div class="lm-note">Tags show where each line comes from. ${single ? "This profile is this monster's alone." : "Changing a line here changes it for this encounter only, until you choose Save to library."} Angel is told these lines at every plan; a line naming a party member is left out until the monster perceives them.</div></div></div>
      ${this.message ? `<div class="lm-msg">${esc(this.message)}</div>` : ""}<div class="lm-foot">${foot}</div>`;
  }
  _replaceHTML(html, content) { const top = content.querySelector(".lm-main")?.scrollTop ?? 0; content.innerHTML = html; const box = content.querySelector(".lm-main"); if (box) box.scrollTop = top; }
  /* a field's value goes into the draft at once, so a redraw loses nothing */
  take(k) {
    const root = this.element, text = root.querySelector(`[name="${k}.text"]`)?.value ?? "", pick = root.querySelector(`[name="${k}.pick"]`)?.value ?? "";
    const now = cleanLine(k, { text, pick: pick || undefined }), cur = this.profile.assembled.lines[k], sameAs = l => !!l === !!now && (!now || ((l.pick ?? null) === (now.pick ?? null) && (l.text ?? "") === now.text));
    /* the same as what is saved is no change, even after typing something and typing it back: nothing she didn't change is ever written as hers */
    if (sameAs(cur)) { delete this.draft[k]; return; }
    this.draft[k] = now ?? { blank: true };
  }
  /* where a line comes from, for its tag, and the way back */
  srcOf(k) {
    const layer = this.layer, cur = this.profile.assembled.lines[k], d = this.draft[k], mine = this.mine ?? {}, below = this.below ?? {}, fromMine = d !== undefined ? d !== null : !!mine[k] && !mine[k].blank, blanked = d === undefined && !!mine[k]?.blank;
    const src = d !== undefined ? `<i class="lm-tag ${layer}">${esc(LAYER_WORDS[layer])}</i>not saved yet` : cur ? `${tag(cur.from, cur.name)}${cur.from === "statblock" ? "" : ` ${esc(who(cur.by))}`}` : blanked ? `<i class="lm-tag ${layer}">${esc(LAYER_WORDS[layer])}</i>blank on purpose` : "nothing written";
    return `${src}${fromMine || blanked ? `<a data-revert="${k}">${below[k] ? `back to ${esc(LAYER_WORDS[below[k].from])}'s` : "clear this line"}</a>` : ""}`;
  }
  /* a field changed: the draft, that line's warning and tag, and the "not saved" mark follow, with no redraw (a redraw would swallow the click that
     comes next: on Save, on another kind, on a suggestion; 0.24.0 review 10) */
  touch(k) {
    this.take(k); const root = this.element, row = root.querySelector(`.lm-row[data-line="${k}"]`); if (!row) return;
    row.querySelector(".lm-warns").innerHTML = warnHtml(row.querySelector(`[name="${k}.text"]`)?.value ?? "", this.people);
    row.querySelector(".lm-from").innerHTML = this.srcOf(k); this.bindRevert(row);
    const mark = root.querySelector(".lm-unsaved"); if (mark) mark.textContent = this.dirty ? "Not saved yet" : "";
  }
  bindRevert(el) { el.querySelectorAll("[data-revert]").forEach(a => a.addEventListener("click", () => { this.draft[a.dataset.revert] = null; this.render(); })); }
  _onRender() {
    const root = this.element;
    root.querySelectorAll("[data-sel]").forEach(el => el.addEventListener("click", async () => { if (el.dataset.sel === this.sel) return;
      if (this.dirty && !await DialogV2.confirm({ window: { title: "Monster Minds" }, content: "<p>Leave without saving the lines you changed?</p>", rejectClose: false })) return;
      this.sel = el.dataset.sel; this.draft = {}; this.message = ""; this.render(); }));
    root.querySelectorAll(".lm-row textarea,.lm-row input,.lm-row select").forEach(el => { const k = el.name.split(".")[0]; for (const ev of ["input", "change"]) el.addEventListener(ev, () => this.touch(k)); });
    root.querySelectorAll("[data-chip]").forEach(el => el.addEventListener("click", () => { const k = el.dataset.chip, box = root.querySelector(`[name="${k}.text"]`); if (!box) return; box.value = box.value.trim() ? `${box.value.trim().replace(/[.;]$/, "")}; ${el.textContent}` : el.textContent[0].toUpperCase() + el.textContent.slice(1); this.touch(k); }));
    this.bindRevert(root);
    root.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); this.act(el.dataset.action).catch(e => { ui.notifications.error(e.message); console.error(e); }); }));
  }
  /* the draft as `setLines` takes it: null takes this layer's line away; a line cleared over something below is blank on purpose */
  changes() { const out = {}; for (const [k, d] of Object.entries(this.draft)) out[k] = d === null ? null : d.blank ? (this.below[k] ? { blank: true } : null) : d; return out; }
  async act(a) {
    const scene = this.scene, row = this.row, ref = this.ref;
    if (a === "library") return openLibrary();
    if (["save", "giveOwn", "toLibrary"].includes(a)) {
      for (const k of LINES) if (this.element.querySelector(`[name="${k}.text"]`)) this.take(k);   /* a field still being typed in counts */
      /* the build may have been made again while this window stood open with edits: its rows are then other rows, and nothing is saved onto them */
      const now = this.find(mindRows(scene)); if (!now || (now.row.uuid ?? null) !== this.rowUuid) { this.draft = {}; this.message = "This map's monsters changed while you were editing, so nothing was saved. Here is how they stand now."; return this.render(); }
    }
    if (a === "save") { if (!this.dirty) { this.message = "Nothing was changed."; return this.render(); } await setLines(scene, ref, this.changes(), { by: "gm" }); this.draft = {}; this.message = "Saved."; return this.render(); }
    if (a === "giveOwn") {
      const taken = new Set(row.own.map(o => o.token)), free = row.tokens.map(id => scene.tokens.get(id)).filter(t => t && !taken.has(t.id)); if (!free.length) return ui.notifications.info("Every monster of this kind here already has its own profile.");
      const data = await input("Give one monster its own profile", `<p>It starts as a copy of the profile it follows now and then stops following ${esc(row.name)}'s.</p><div class="form-group"><label>Which one</label><select name="tok">${free.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>`, "Give it its own"); if (!data?.tok) return;
      if (this.dirty) await setLines(scene, ref, this.changes(), { by: "gm" });
      const tok = scene.tokens.get(data.tok); await giveOwn(scene, tok); this.draft = {}; this.message = `${tok.name} has its own profile now.`;
      const rows = mindRows(scene), mine = rows.flatMap(r => r.own).find(o => o.token === tok.id); if (mine) this.sel = refKey(mine.ref); return this.render(); }
    if (a === "dropOwn") { const tok = ref.token ? scene.tokens.get(ref.token) : scene.tokens.contents.find(t => { const m = String(t.getFlag(ID, "key") ?? "").match(/^c(\d+)-(\d+)$/); return m && +m[1] === ref.row && +m[2] === ref.n && t.getFlag(ID, "built") === scene.getFlag(ID, "build")?.id; });
      if (!await DialogV2.confirm({ window: { title: "Follow its kind again" }, content: "<p>Its own profile is thrown away and it follows its kind's again.</p>", rejectClose: false })) return;
      if (tok) await dropOwn(scene, tok); else await setLines(scene, ref, Object.fromEntries(LINES.map(k => [k, null])), { by: "gm" });
      this.sel = refKey(row.ref); this.draft = {}; this.message = "It follows its kind again."; return this.render(); }
    if (a === "toLibrary") {
      if (this.dirty) { await setLines(scene, ref, this.changes(), { by: "gm" }); this.draft = {}; }
      const profile = await rowProfile(scene, row, ref), kind = profile.kind, here = profile.layers.find(l => l.from === "encounter")?.lines ?? {}, entry = libraryGet(kind.key), list = libraryChanges(here, entry?.lines ?? {});
      if (!list.length) { this.message = "Nothing written for this encounter differs from the library (what it knows about its enemies is never kept there)."; return this.render(); }
      const peoples = libraryEntries().filter(e => e.type === "people"), named = list.filter(c => lineWarnings(here[c.key]?.text, partyPeople(scene)).names.length).map(c => c.key);
      const data = await input(`Save to library: ${kind.kindName}`, `<p>These lines would go to <b>${esc(entry?.name ?? kind.kindName)}</b> in the library and be used in every encounter. Untick any to keep for this encounter only.</p>
        ${list.map(c => `<label class="lm-line"><input type="checkbox" name="line_${c.key}" ${named.includes(c.key) ? "disabled" : "checked"}> <b>${esc(LINE_LABEL[c.key])}:</b> ${c.from ? `<span class="lm-old">${esc(c.from)}</span> → ` : ""}${esc(c.to)}${named.includes(c.key) ? " <em>(names a party member: reword it first)</em>" : ""}</label>`).join("")}
        ${entry ? "" : `<div class="form-group"><label>Its people or family</label><select name="people"><option value="">(none)</option>${peoples.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>`}`, "Save to library"); if (!data) return;
      const keys = list.map(c => c.key).filter(k => data[`line_${k}`]); if (!keys.length) return;
      await libraryPut({ type: "kind", key: kind.key, name: entry?.name ?? kind.kindName, ...(entry ? {} : { people: data.people || null }), lines: Object.fromEntries(keys.map(k => [k, here[k]])) }, { by: "gm", keepBy: true });   /* the lines move as they are: Angel's stay Angel's */
      await setLines(scene, ref, Object.fromEntries(keys.map(k => [k, null])), { by: "gm" });   /* they come from the library now */
      this.message = `Saved ${keys.length} line${keys.length === 1 ? "" : "s"} to the library.`; return this.render(); }
  }
}

/* ---------- the Minds Library ---------- */
const NO_PEOPLE = "(no people)";
export class LibraryApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-minds-library", classes: ["leb-minds"], window: { title: "Minds Library", resizable: true }, position: { width: 980, height: 640, top: 50 } };
  constructor() { super(); this.sel = null; this.search = ""; this.message = ""; }
  async _renderHTML() {
    ensureStyle(); const all = libraryEntries(), peoples = all.filter(e => e.type === "people").sort((a, b) => a.name.localeCompare(b.name)), kinds = all.filter(e => e.type === "kind").sort((a, b) => a.name.localeCompare(b.name));
    const q = this.search.trim().toLowerCase(), hit = e => !q || e.name.toLowerCase().includes(q) || Object.values(e.lines).some(l => (l.text ?? "").toLowerCase().includes(q));
    const of = key => kinds.filter(k => (k.people ?? null) === key), orphans = kinds.filter(k => !k.people || !peoples.some(p => p.key === k.people));
    const groups = [...peoples.map(p => ({ key: p.key, name: p.name, people: p, kinds: of(p.key) })), ...(orphans.length ? [{ key: NO_PEOPLE, name: "Kinds with no people", people: null, kinds: orphans }] : [])].filter(g => !q || (g.people && hit(g.people)) || g.kinds.some(hit));
    if (!groups.some(g => g.key === this.sel)) this.sel = groups[0]?.key ?? null;
    const g = groups.find(x => x.key === this.sel) ?? null;
    const side = `<input type="search" class="lm-search" placeholder="Search…" value="${esc(this.search)}"><h4>Peoples and families</h4>${groups.map(x => `<div class="lm-it${x.key === this.sel ? " on" : ""}" data-sel="${esc(x.key)}">${esc(x.name)} <small>${x.kinds.length} kind${x.kinds.length === 1 ? "" : "s"}</small></div>`).join("") || `<div class="lm-later">${q ? "Nothing matches." : "Nothing saved yet."}</div>`}<h4>Kinds of group</h4><div class="lm-later">A later release</div>`;
    let main = `<p>The library is empty. Save a kind from Monster Minds with <b>Save to library…</b>, or start with <b>New people…</b> below.</p>`;
    if (g) {
      const cols = [...(g.people ? [g.people] : []), ...g.kinds], cell = (e, k) => { const l = e.lines[k], base = e.type === "kind" && g.people ? g.people.lines[k] : null;
        const words = l ? (l.blank ? "<em>blank on purpose</em>" : esc(lineWords(k, l))) : base && !base.blank ? `<span class="lm-same">same</span>` : `<span class="lm-same">—</span>`;
        return `<td class="lm-cell" data-edit="${esc(e.key)}" data-line="${k}" title="Click to edit">${words}</td>`; };
      const last = e => { const ls = Object.values(e.lines).filter(l => l.at); if (!ls.length) return `<span class="lm-same">—</span>`; const l = ls.sort((a, b) => b.at - a.at)[0]; return `${l.by === "gm" ? `<i class="lm-tag own">yours</i>` : "Angel"} <small>${new Date(l.at).toLocaleDateString()}</small>`; };
      main = `<div class="lm-head"><b>${esc(g.name)}</b><small>${g.people ? "the nature every kind of this people starts from" : "these kinds stand on their own"}</small></div>
        <table class="lm-tbl"><tr><th style="width:120px">Line</th>${cols.map(e => `<th>${esc(e.name)}${e.type === "people" ? " (people)" : ""}<a data-rename="${esc(e.key)}" title="Rename${e.type === "kind" ? " or move to another people" : ""}"><i class="fa-solid fa-pen"></i></a><a data-remove="${esc(e.key)}" title="Remove from the library"><i class="fa-solid fa-trash"></i></a></th>`).join("")}</tr>
        ${LIBRARY_LINES.map(k => `<tr><td>${esc(LINE_LABEL[k])}</td>${cols.map(e => cell(e, k)).join("")}</tr>`).join("")}<tr><td>Last changed</td>${cols.map(e => `<td>${last(e)}</td>`).join("")}</tr></table>
        <div class="lm-note">A kind stores only what differs from its people (“same” is inherited). Click any cell to edit it. “Knows about its enemies” is never kept in the library: it belongs to one encounter.</div>`;
    }
    return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main">${main}</div></div>${this.message ? `<div class="lm-msg">${esc(this.message)}</div>` : ""}
      <div class="lm-foot"><button type="button" data-action="import">Import…</button><button type="button" data-action="export">Export…</button><button type="button" data-action="newPeople">New people…</button><button type="button" data-action="newKind">New kind…</button></div>`;
  }
  _replaceHTML(html, content) { content.innerHTML = html; }
  _onRender() {
    const root = this.element, on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); Promise.resolve(fn(el)).catch(e => { ui.notifications.error(e.message); console.error(e); }); }));
    on("[data-sel]", el => { this.sel = el.dataset.sel; this.message = ""; this.render(); });
    const box = root.querySelector(".lm-search"); box?.addEventListener("change", () => { this.search = box.value; this.render(); });
    on("[data-edit]", el => this.editCell(el.dataset.edit, el.dataset.line)); on("[data-rename]", el => this.rename(el.dataset.rename)); on("[data-remove]", el => this.remove(el.dataset.remove));
    on("[data-action]", el => this[el.dataset.action]());
  }
  async editCell(key, k) {
    const e = libraryGet(key); if (!e) return; const l = e.lines[k] ?? {}, picks = PICKS[k];
    const data = await input(`${e.name}: ${LINE_LABEL[k]}`, `${picks ? `<div class="form-group"><label>${esc(LINE_LABEL[k])}</label><select name="pick"><option value="">(not set)</option>${Object.entries(picks).map(([id, p]) => `<option value="${id}"${l.pick === id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>` : ""}
      <textarea name="text" maxlength="${k === "notes" ? CAPS.storeNotes : CAPS.store}" placeholder="${picks ? "in your own words (optional)" : "your own words"}">${esc(l.blank ? "" : l.text ?? "")}</textarea>${(SUGGEST[k] ?? []).length ? `<p class="lm-old">For example: ${SUGGEST[k].map(esc).join("; ")}.</p>` : ""}
      ${e.type === "kind" ? `<label class="lm-line"><input type="checkbox" name="same"> Same as its people (take this kind's own line away)</label><label class="lm-line"><input type="checkbox" name="blank"${l.blank ? " checked" : ""}> Blank on purpose (don't use its people's line either)</label>` : `<label class="lm-line"><input type="checkbox" name="same"> Take this line away</label>`}`); if (!data) return;
    const line = data.same ? null : data.blank ? { blank: true } : cleanLine(k, { text: data.text, pick: data.pick || undefined });
    /* a party member's name in library text: asked, not refused, since a name can also be an everyday word; the packet's own gate still holds the line back from any monster that doesn't perceive them */
    if (line && !line.blank) { const w = lineWarnings(line.text, partyPeople(canvas.scene)); if (w.names.length && !await DialogV2.confirm({ window: { title: "A party member's name" }, content: `<p>“${esc(w.names[0])}” is a party member's name, or part of one. Library text is used in every encounter, so it should name nobody; a monster is only told a line like this while it perceives that creature.</p><p>Save it anyway?</p>`, rejectClose: false })) return; }
    await libraryPut({ ...e, lines: { [k]: line } }, { by: "gm" }); this.message = "Saved."; this.render();
  }
  async rename(key) {
    const e = libraryGet(key); if (!e) return; const peoples = libraryEntries().filter(x => x.type === "people");
    const data = await input(`Rename: ${e.name}`, `<div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${CAPS.name}" value="${esc(e.name)}"></div>${e.type === "kind" ? `<div class="form-group"><label>Its people or family</label><select name="people"><option value="">(none)</option>${peoples.map(p => `<option value="${esc(p.key)}"${p.key === e.people ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}`); if (!data?.name?.trim()) return;
    await libraryPut({ ...e, name: data.name, ...(e.type === "kind" ? { people: data.people || null } : {}), lines: {} }, { by: "gm" }); this.message = "Saved."; this.render();
  }
  async remove(key) {
    const e = libraryGet(key); if (!e) return; const n = e.type === "people" ? libraryEntries().filter(x => x.people === key).length : 0;
    if (!await DialogV2.confirm({ window: { title: "Remove from the library" }, content: `<p>Remove <b>${esc(e.name)}</b> from the Minds Library? This can't be undone.${n ? ` Its ${n} kind${n === 1 ? "" : "s"} stay, with no people.` : ""}</p>`, rejectClose: false })) return;
    await libraryRemove(key); this.message = `${e.name} removed.`; this.render();
  }
  async newPeople() {
    const data = await input("New people or family", `<p>A people or family holds what all its kinds share: goblins, wolves and dogs, mindless undead.</p><div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${CAPS.name}" autofocus></div>`, "Create"); if (!data?.name?.trim()) return;
    if (libraryGet(peopleKey(data.name))) return ui.notifications.warn("The library already has a people of that name.");
    const r = await libraryPut({ type: "people", name: data.name, lines: {} }, { by: "gm" }); this.sel = r.entry.key; this.message = `${r.entry.name} added. Click a cell to write its lines.`; this.render();
  }
  async newKind() {
    const first = await input("New kind of creature", `<p>Which creature? Type part of its name.</p><div class="form-group"><label>Creature</label><input type="text" name="q" autofocus></div>`, "Search"); if (!first?.q?.trim()) return;
    const found = await findCreatures(first.q, 20); if (!found.length) return ui.notifications.warn("No creature of that name was found.");
    const peoples = libraryEntries().filter(x => x.type === "people");
    const data = await input("New kind of creature", `<div class="form-group"><label>Creature</label><select name="uuid">${found.map(r => `<option value="${esc(r.uuid)}">${esc(r.name)}, level ${r.level}: ${esc(r.pack)}</option>`).join("")}</select></div><div class="form-group"><label>Its people or family</label><select name="people"><option value="">(none)</option>${peoples.map(p => `<option value="${esc(p.key)}"${p.key === this.sel ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>`, "Create"); if (!data?.uuid) return;
    const actor = await fromUuid(data.uuid), kind = actor ? kindFacts(actor) : null; if (!kind) return ui.notifications.warn("That creature couldn't be read.");
    if (libraryGet(kind.key)) { this.sel = libraryGet(kind.key).people ?? NO_PEOPLE; this.message = `${kind.kindName} is already in the library.`; return this.render(); }
    await libraryPut({ type: "kind", key: kind.key, name: kind.kindName, people: data.people || null, lines: {} }, { by: "gm" }); this.sel = data.people || NO_PEOPLE; this.message = `${kind.kindName} added. Click a cell to write its lines.`; this.render();
  }
  async export() { const data = libraryExport(); foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", "minds-library.json"); this.message = `Exported ${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"}.`; this.render(); }
  async import() {
    const picked = await new Promise(resolve => { const f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json"; f.addEventListener("change", () => resolve(f.files?.[0] ?? null)); f.addEventListener("cancel", () => resolve(null)); f.click(); }); if (!picked) return;
    let data = null; try { data = JSON.parse(await picked.text()); } catch (e) { return ui.notifications.warn("That file couldn't be read as a library export."); }
    const plan = await libraryImport(data); if (!plan.ok) return ui.notifications.warn(plan.reason);
    const count = s => plan.rows.filter(r => r.status === s), fresh = count("new"), same = count("match"), clash = count("collision");
    if (!fresh.length && !clash.length) { this.message = `Nothing to import: all ${same.length} entries are already here, the same.`; return this.render(); }
    const answer = await input("Import into the Minds Library", `<p>${fresh.length} new, ${same.length} already here and the same, ${clash.length} here but different.</p>${fresh.length ? `<p><b>New:</b> ${fresh.map(r => esc(r.entry.name)).join(", ")}</p>` : ""}
      ${clash.length ? `<p><b>Different here.</b> Tick the ones to replace with the file's; the others keep yours.</p>${clash.map((r, i) => `<label class="lm-line"><input type="checkbox" name="take_${i}"> ${esc(r.entry.name)}</label>`).join("")}` : ""}`, "Import"); if (!answer) return;
    const theirs = clash.filter((r, i) => answer[`take_${i}`]).map(r => r.entry.key), done = await libraryImport(data, { apply: true, theirs });
    this.message = `Imported: ${done.added} added, ${done.replaced} replaced, ${done.kept} kept as yours.`; this.render();
  }
}
