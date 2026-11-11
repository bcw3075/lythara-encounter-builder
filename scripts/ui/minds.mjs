/* The Monster Minds window (one scene's profiles) and the Minds Library window (0.24.0). Rhea's window samples of 2026-11-10 are the starting point:
   kinds on the left with any single monster's own profile under its kind; the six lines and notes on the right, Mind and Works with others as
   pick lists, the others her own words with suggestions; a tag per line saying where it comes from; a warning under a line that names a party member. */
import { esc } from "../journal.mjs";
import { ID, findCreatures } from "../builder.mjs";
import { CAPS, LAYER_WORDS, LIBRARY_LINES, LINES, LINE_LABEL, PICKS, SUGGEST, assemble, cleanLine, libraryChanges, lineWarnings, lineWords, peopleKey } from "../minds.mjs";
import { BAND_CAPS, FALL_BACK, NATURE, NATURE_LABEL, NATURE_PICKS, NATURE_SUGGEST, NATURE_LAYER_WORDS, PLANNED, bandId, cleanPart, natureWords } from "../bands.mjs";
import { bandViews, joinBand, removeBand, setBand } from "../bandlib.mjs";
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
.leb-minds .lm-tag.library{background:#cfe6b5}.leb-minds .lm-tag.brief{background:#d9d9d9}.leb-minds .lm-band h3{margin:14px 0 2px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.75;border:0}
.leb-minds .lm-spot{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.leb-minds .lm-spot input[type=number]{width:64px}.leb-minds .lm-spot button{width:auto;flex:0 0 auto}.leb-minds .lm-spot select{width:auto}.leb-minds .lm-mem{margin:0;padding-left:18px}
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
  constructor(scene) { super(); this.scene = scene; this.sel = null; this.draft = {}; this.bdraft = {}; this.message = ""; }
  get title() { return `Monster Minds: ${this.scene.name}`; }
  get dirty() { return Object.keys(this.draft).length > 0 || Object.keys(this.bdraft).length > 0; }
  /* the layer this view edits: a monster's own, or this encounter's for the kind */
  layerOf(ref) { return ref.token || Number.isInteger(ref.n) || this.row?.party ? "own" : "encounter"; }
  find(rows) { for (const r of rows) { if (refKey(r.ref) === this.sel) return { row: r, ref: r.ref }; for (const o of r.own) if (refKey(o.ref) === this.sel) return { row: r, ref: o.ref, own: o }; } return null; }
  async _renderHTML() {
    ensureStyle(); const scene = this.scene, rows = mindRows(scene), bands = this.bands = bandViews(scene), bandSel = typeof this.sel === "string" && this.sel.startsWith("band:") ? bands.find(v => `band:${v.band.key}` === this.sel) ?? null : null;
    if (!bandSel) this.bdraft = {};
    let at = bandSel ? null : this.find(rows);
    if (!at && !bandSel && rows.length) { this.sel = refKey(rows[0].ref); this.draft = {}; at = this.find(rows); }
    const built = rows.filter(r => Number.isInteger(r.ref.row)), loose = rows.filter(r => r.ref.kind), party = rows.filter(r => r.party);
    const item = r => `<div class="lm-it${refKey(r.ref) === this.sel ? " on" : ""}" data-sel="${esc(refKey(r.ref))}">${esc(r.name)} <small>${r.party ? "Angel plays it" : `× ${r.count}`}</small></div>${r.own.map(o => `<div class="lm-it sub${refKey(o.ref) === this.sel ? " on" : ""}" data-sel="${esc(refKey(o.ref))}">${esc(o.name)} <small>own profile</small></div>`).join("")}`;
    const side = `${built.length ? `<h4>In this encounter</h4>${built.map(item).join("")}` : ""}${loose.length ? `<h4>${built.length ? "Not placed by the build" : "On this map"}</h4>${loose.map(item).join("")}` : ""}${party.length ? `<h4>With the party</h4>${party.map(item).join("")}` : ""}<h4>Bands</h4>${bands.map(v => `<div class="lm-it${`band:${v.band.key}` === this.sel ? " on" : ""}" data-sel="band:${esc(v.band.key)}">${esc(v.band.name)} <small>${v.members} in it</small></div>`).join("")}<div class="lm-it" data-action="newBand"><span><i class="fa-solid fa-plus"></i> New band…</span></div>`;
    if (bandSel) return this.bandHtml(bandSel, side);
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
    const inBand = !single && !row.party ? (Number.isInteger(ref.row) ? scene.getFlag(ID, "brief")?.creatures?.[ref.row]?.band ?? "" : (() => { const ks = [...new Set(row.tokens.map(id => bandId(scene.tokens.get(id)?.getFlag(ID, "band"))))]; return ks.length > 1 ? "?" : ks[0] ?? ""; })()) : null;
    const bandRow = inBand === null ? "" : `<div class="lm-row"><label>Band</label><div><select name="band" title="The group these monsters fight as part of. Its leader, nature and plan are on the band's own page, under Bands.">${inBand === "?" ? `<option value="?" selected>(only some of them: pick one to set all)</option>` : ""}<option value="">(no band)</option>${bands.map(v => `<option value="${esc(v.band.key)}"${v.band.key === bandId(inBand) ? " selected" : ""}>${esc(v.band.name)}</option>`).join("")}</select></div><div class="lm-from">${bands.length ? "changed at once" : "make one with New band…"}</div></div>`;
    return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main"><div class="lm-head">${head}</div>${bandRow}${LINES.map(lineRow).join("")}
      <div class="lm-note">Tags show where each line comes from. ${single ? "This profile is this monster's alone." : "Changing a line here changes it for this encounter only, until you choose Save to library."} Angel is told these lines at every plan; a line naming a party member is left out until the monster perceives them.</div></div></div>
      ${this.message ? `<div class="lm-msg">${esc(this.message)}</div>` : ""}<div class="lm-foot">${foot}</div>`;
  }
  _replaceHTML(html, content) { const top = content.querySelector(".lm-main")?.scrollTop ?? 0; content.innerHTML = html; const box = content.querySelector(".lm-main"); if (box) box.scrollTop = top; }
  /* a field's value goes into the draft at once, so a redraw loses nothing */
  take(k) {
    const root = this.element, text = root.querySelector(`[name="${k}.text"]`)?.value ?? "", pick = root.querySelector(`[name="${k}.pick"]`)?.value ?? "";
    const now = cleanLine(k, { text, pick: pick || undefined }), cur = this.profile.assembled.lines[k], sameAs = l => !!l === !!now && (!now || ((l.pick ?? null) === (now.pick ?? null) && (l.text ?? "") === now.text));
    /* the same as what is saved is no change, even after typing something and typing it back: nothing she didn't change is ever written as hers */
    /* a line sent back to the layer below shows that layer's words: reading the field then must not turn them into this layer's own (seen live
       2026-11-11: "back to kind's" then Save wrote the kind's words into this encounter as the GM's) */
    if (this.draft[k] === null && sameAs(this.below?.[k])) return;
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
      this.sel = el.dataset.sel; this.draft = {}; this.bdraft = {}; this.message = ""; this.render(); }));
    root.querySelectorAll("[data-action]").forEach(el => { if (el.dataset.bound) return; el.dataset.bound = "1"; el.addEventListener("click", ev => { ev.preventDefault(); this.act(el.dataset.action).catch(e => { ui.notifications.error(e.message); console.error(e); }); }); });
    if (root.querySelector(".lm-band")) return this.bindBand(root);
    root.querySelector('select[name="band"]')?.addEventListener("change", ev => { if (ev.target.value === "?") return; joinBand(this.scene, this.row.ref, ev.target.value).then(() => { this.message = ev.target.value ? "In that band now." : "In no band now."; this.render(); }).catch(e => { ui.notifications.error(e.message); this.render(); }); });
    root.querySelectorAll(".lm-row textarea,.lm-row input,.lm-row select:not([name=band])").forEach(el => { const k = el.name.split(".")[0]; for (const ev of ["input", "change"]) el.addEventListener(ev, () => this.touch(k)); });
    root.querySelectorAll("[data-chip]").forEach(el => el.addEventListener("click", () => { const k = el.dataset.chip, box = root.querySelector(`[name="${k}.text"]`); if (!box) return; box.value = box.value.trim() ? `${box.value.trim().replace(/[.;]$/, "")}; ${el.textContent}` : el.textContent[0].toUpperCase() + el.textContent.slice(1); this.touch(k); }));
    this.bindRevert(root);
  }
  /* ---------- a band's page (0.26.0): who is in it, who leads, its nature and its plan ---------- */
  /* what a field shows: what was typed since the last save, else what is stored (or inherited) */
  bval(name, stored) { return name in this.bdraft ? this.bdraft[name] : stored; }
  bandHtml(v, side) {
    const b = v.band, people = this.people = partyPeople(this.scene), f = v.plan.fallBack ?? {}, own = b.plan.fallBack ?? {}, libs = libraryEntries().filter(e => e.type === "band").sort((x, y) => x.name.localeCompare(y.name));
    const toks = v.groups.flatMap(g => g.tokens), tagOf = (from, name, by) => `<i class="lm-tag ${from === "library" ? "library" : from === "brief" ? "brief" : from === "fight" ? "fight" : "encounter"}">${esc(NATURE_LAYER_WORDS[from] ?? from)}</i>${name ? `${esc(name)} ` : ""}${from === "brief" ? "" : esc(who(by))}`;
    const mark = b.leader ? JSON.stringify(b.leader.token ? { token: b.leader.token } : { row: b.leader.row, n: b.leader.n }) : "", leadVal = this.bval("leader", mark);
    const leaderRow = `<div class="lm-row"><label>Leader</label><div><select name="leader"><option value="">${v.leader?.guessed ? `(Angel's pick: ${esc(v.leader.name)})` : v.follows ? "(not marked)" : "(none: nobody in it follows a leader)"}</option>${toks.map(t => { const val = JSON.stringify(t.leaderRef); return `<option value="${esc(val)}"${val === leadVal ? " selected" : ""}>${esc(t.name)}</option>`; }).join("")}</select>${v.leaderGone ? `<div class="lm-warn">⚠ The monster marked as leader is no longer on this map. Its band is told its leader is gone.</div>` : ""}</div><div class="lm-from">${b.leader ? `<i class="lm-tag encounter">this encounter</i>${esc(who(b.leader.by))}` : v.leader?.guessed ? "the highest-level member that follows a leader and can speak" : "nothing marked"}</div></div>`;
    /* the named second (0.28.0): first in line when "Next in line takes over" is the band's pick */
    const mark2 = b.second ? JSON.stringify(b.second.token ? { token: b.second.token } : { row: b.second.row, n: b.second.n }) : "", secVal = this.bval("second", mark2);
    const secondRow = v.follows ? `<div class="lm-row"><label>Second</label><div><select name="second"><option value="">(not named: the highest-level member left takes over)</option>${toks.filter(t => JSON.stringify(t.leaderRef) !== leadVal).map(t => { const val = JSON.stringify(t.leaderRef); return `<option value="${esc(val)}"${val === secVal ? " selected" : ""}>${esc(t.name)}</option>`; }).join("")}</select></div><div class="lm-from">${b.second ? `<i class="lm-tag encounter">this encounter</i>${esc(who(b.second.by))}` : "takes over first if the leader falls and the next in line takes over"}</div></div>` : "";
    const members = `<div class="lm-row"><label>In it</label><div>${v.groups.length ? `<ul class="lm-mem">${v.groups.map(g => { const ds = [...new Set(g.tokens.map(t => PICKS.discipline[t.discipline]?.label ?? t.discipline))]; return `<li>${esc(g.name)} × ${g.tokens.length || g.count}${ds.length ? ` <small>(${esc(ds.join(", "))})</small>` : ""}</li>`; }).join("")}</ul>` : "Nobody yet."}</div><div class="lm-from">A kind joins or leaves on its own page (Band).</div></div>`;
    const libRow = `<div class="lm-row"><label>Starts from</label><div><select name="lib"><option value="">(no kind of group)</option>${libs.map(e => `<option value="${esc(e.key)}"${e.key === this.bval("lib", b.lib ?? "") ? " selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div><div class="lm-from">a kind of group in the Minds Library: its lines fill what isn't written here</div></div>`;
    const natureRow = k => { const cur = v.nature[k], text = this.bval(`n.${k}.text`, cur?.text ?? ""), pick = this.bval(`n.${k}.pick`, cur?.pick ?? ""), picks = NATURE_PICKS[k];
      const field = picks ? `<div class="lm-pick"><select name="n.${k}.pick"><option value="">(not set)</option>${Object.entries(picks).map(([id, x]) => `<option value="${id}"${pick === id ? " selected" : ""} title="${esc(x.words)}">${esc(x.label)}</option>`).join("")}</select><input type="text" name="n.${k}.text" maxlength="${BAND_CAPS.line}" value="${esc(text)}" placeholder="in your own words (optional)"></div>`
        : `<textarea name="n.${k}.text" maxlength="${BAND_CAPS.line}">${esc(text)}</textarea><div class="lm-chips">${(NATURE_SUGGEST[k] ?? []).map(x => `<span class="lm-chip" data-bchip="n.${k}.text">${esc(x)}</span>`).join("")}</div>`;
      return `<div class="lm-row"><label>${esc(NATURE_LABEL[k])}</label><div>${field}<div class="lm-warns">${warnHtml(text, people)}</div></div><div class="lm-from">${cur ? tagOf(cur.from, cur.name, cur.by) : "nothing written"}</div></div>`; };
    const objective = this.bval("p.objective", b.plan.objective?.text ?? ""), when = this.bval("p.when", f.when?.text ?? ""), to = this.bval("p.to", own.to ?? ""), x = this.bval("p.x", own.at?.[0] ?? ""), y = this.bval("p.y", own.at?.[1] ?? "");
    const jobRow = (g, i) => { const j = b.plan.jobs.find(q => (g.ref.row != null && q.row === g.ref.row) || (g.ref.kind != null && q.kind === g.ref.kind)), text = this.bval(`p.job.${i}`, j?.text ?? "");
      return `<div class="lm-row"><label>${esc(g.name)}</label><div><input type="text" name="p.job.${i}" maxlength="${BAND_CAPS.job}" value="${esc(text)}" placeholder="its part in the plan"><div class="lm-warns">${warnHtml(text, people)}</div></div><div class="lm-from">${j ? `<i class="lm-tag encounter">this encounter</i>${esc(who(j.by))}` : "nothing written"}</div></div>`; };
    const plan = `<div class="lm-row"><label>Objective</label><div><textarea name="p.objective" maxlength="${BAND_CAPS.line}" placeholder="what the band is trying to do in this fight">${esc(objective)}</textarea><div class="lm-warns">${warnHtml(objective, people)}</div></div><div class="lm-from">${b.plan.objective ? `<i class="lm-tag encounter">this encounter</i>${esc(who(b.plan.objective.by))}` : "nothing written"}</div></div>
      ${v.groups.map(jobRow).join("")}
      <div class="lm-row"><label>Fall back</label><div><div class="lm-spot"><select name="p.to"><option value="">(not set)</option>${Object.entries(FALL_BACK).map(([id, label]) => `<option value="${id}"${to === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>
        <span class="lm-xy"${to === "spot" ? "" : " hidden"}>square <input type="number" name="p.x" value="${esc(String(x))}" min="0" step="1"> , <input type="number" name="p.y" value="${esc(String(y))}" min="0" step="1"> <button type="button" data-action="pickSpot"><i class="fa-solid fa-crosshairs"></i> Pick on the map</button></span></div>
        <input type="text" name="p.when" maxlength="${BAND_CAPS.when}" value="${esc(when)}" placeholder="when: for example, when half are down" style="margin-top:6px"><div class="lm-warns">${warnHtml(when, people)}</div></div>
        <div class="lm-from">${own.to ? `<i class="lm-tag encounter">this encounter</i>${esc(who(own.by))}` : "not set"}${f.when ? `<br>when: ${f.when.by === "module" ? `<i class="lm-tag brief">the brief</i>` : `<i class="lm-tag encounter">this encounter</i>${esc(who(f.when.by))}`}` : ""}</div></div>`;
    const foot = `<button type="button" class="lm-left" data-action="library"><i class="fa-solid fa-book"></i> Minds Library…</button><button type="button" data-action="removeBand">Remove band…</button><button type="button" data-action="renameBand">Rename…</button><button type="button" data-action="bandToLibrary">Save nature to library…</button><span class="lm-unsaved">${this.dirty ? "Not saved yet" : ""}</span><button type="button" data-action="saveBand" class="lm-go"><i class="fa-solid fa-floppy-disk"></i> Save band</button>`;
    return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main lm-band"><div class="lm-head"><b>${esc(b.name)}</b><small>a band: ${v.members} monster${v.members === 1 ? "" : "s"} fight${v.members === 1 ? "s" : ""} as one group</small></div>
      ${members}${leaderRow}${secondRow}${libRow}<h3>Its nature</h3>${NATURE.map(natureRow).join("")}<h3>Its plan for this fight</h3>${plan}
      <div class="lm-note">How firmly the plan holds each member is that kind's own Discipline (on its page): None is told nothing of the band, Pack only its way of fighting, how they stand toward each other and what they want, the rest all of it. A rally spot is where the band pulls back to and fights on; off the map means they leave. The band knows at once when its leader falls. A line naming a party member is left out until the monster perceives them.</div></div></div>
      ${this.message ? `<div class="lm-msg">${esc(this.message)}</div>` : ""}<div class="lm-foot">${foot}</div>`;
  }
  bindBand(root) {
    const note = el => { this.bdraft[el.name] = el.value; const w = el.closest(".lm-row")?.querySelector(".lm-warns"); if (w && el.type !== "number" && el.tagName !== "SELECT") w.innerHTML = warnHtml(el.value, this.people);
      if (el.name === "p.to") root.querySelector(".lm-xy")?.toggleAttribute("hidden", el.value !== "spot");
      const m = root.querySelector(".lm-unsaved"); if (m) m.textContent = "Not saved yet"; };
    root.querySelectorAll(".lm-band textarea,.lm-band input,.lm-band select").forEach(el => { for (const ev of ["input", "change"]) el.addEventListener(ev, () => note(el)); });
    root.querySelectorAll("[data-bchip]").forEach(el => el.addEventListener("click", () => { const box = root.querySelector(`[name="${el.dataset.bchip}"]`); if (!box) return; box.value = box.value.trim() ? `${box.value.trim().replace(/[.;]$/, "")}; ${el.textContent}` : el.textContent[0].toUpperCase() + el.textContent.slice(1); note(box); }));
  }
  /* what was typed, as `setBand` takes it: only what differs from what the page showed, so nothing she didn't change is written as hers */
  bandChange(v) {
    const b = v.band, d = this.bdraft, change = {}, has = n => n in d, differs = (n, shown) => has(n) && String(d[n] ?? "").trim() !== String(shown ?? "").trim();
    const mark = b.leader ? JSON.stringify(b.leader.token ? { token: b.leader.token } : { row: b.leader.row, n: b.leader.n }) : "";
    if (differs("leader", mark)) change.leader = d.leader ? JSON.parse(d.leader) : null;
    const mark2 = b.second ? JSON.stringify(b.second.token ? { token: b.second.token } : { row: b.second.row, n: b.second.n }) : "";
    if (differs("second", mark2)) change.second = d.second ? JSON.parse(d.second) : null;
    if (differs("lib", b.lib ?? "")) change.lib = d.lib || null;
    for (const k of NATURE) { const cur = v.nature[k], t = differs(`n.${k}.text`, cur?.text ?? ""), p = differs(`n.${k}.pick`, cur?.pick ?? ""); if (!t && !p) continue;
      const line = cleanPart({ text: has(`n.${k}.text`) ? d[`n.${k}.text`] : cur?.text ?? "", pick: (has(`n.${k}.pick`) ? d[`n.${k}.pick`] : cur?.pick) || undefined }, { picks: NATURE_PICKS[k] ?? null }); (change.nature ??= {})[k] = line ? { text: line.text, ...(line.pick ? { pick: line.pick } : {}) } : null; }
    const plan = {}, f = v.plan.fallBack ?? {}, own = b.plan.fallBack ?? {};
    if (differs("p.objective", b.plan.objective?.text ?? "")) plan.objective = String(d["p.objective"]).trim() || null;
    v.groups.forEach((g, i) => { const j = b.plan.jobs.find(q => (g.ref.row != null && q.row === g.ref.row) || (g.ref.kind != null && q.kind === g.ref.kind)); if (differs(`p.job.${i}`, j?.text ?? "")) (plan.jobs ??= []).push({ ...g.ref, text: String(d[`p.job.${i}`]).trim() }); });
    const fb = {}; if (differs("p.to", own.to ?? "") || differs("p.x", own.at?.[0] ?? "") || differs("p.y", own.at?.[1] ?? "")) { fb.to = (has("p.to") ? d["p.to"] : own.to) || null; const x = Number(has("p.x") ? d["p.x"] : own.at?.[0]), y = Number(has("p.y") ? d["p.y"] : own.at?.[1]); fb.at = fb.to === "spot" && String(has("p.x") ? d["p.x"] : own.at?.[0] ?? "") !== "" && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null; }
    if (differs("p.when", f.when?.text ?? "")) fb.when = String(d["p.when"]).trim() || null;
    if (Object.keys(fb).length) plan.fallBack = fb; if (Object.keys(plan).length) change.plan = plan;
    return change;
  }
  /** Pick the rally spot: the window steps aside and the next left click on the map gives the square. A right-click or Escape cancels. */
  pickSpot() {
    if (!canvas.ready || canvas.scene?.id !== this.scene.id) return ui.notifications.warn("Open this map first: the square is picked on it."); this._endPick?.();
    const stage = canvas.stage; this.minimize(); ui.notifications.info("Click the rally spot on the map (right-click or Escape to cancel).");
    const end = () => { stage.off("pointerdown", on); document.removeEventListener("keydown", key, true); Hooks.off("canvasTearDown", torn); this._endPick = null; };
    const stop = () => { end(); if (this.rendered) { this.maximize(); this.render(); } };
    const on = ev => { if (ev.button === 2) return stop(); if (ev.button !== 0) return; const p = ev.getLocalPosition(stage), dim = canvas.scene.dimensions;
      this.bdraft["p.to"] = "spot"; this.bdraft["p.x"] = String(Math.floor((p.x - dim.sceneX) / dim.size)); this.bdraft["p.y"] = String(Math.floor((p.y - dim.sceneY) / dim.size)); stop(); };
    const key = ev => { if (ev.key === "Escape") { ev.stopPropagation(); stop(); } };
    const torn = () => { end(); };
    stage.on("pointerdown", on); document.addEventListener("keydown", key, true); Hooks.on("canvasTearDown", torn); this._endPick = end;
  }
  async close(options) { this._endPick?.(); return super.close(options); }
  async actBand(a) {
    const scene = this.scene, v = bandViews(scene).find(x => `band:${x.band.key}` === this.sel) ?? null;
    if (a === "newBand") {
      if (this.dirty && !await DialogV2.confirm({ window: { title: "Monster Minds" }, content: "<p>Leave without saving the lines you changed?</p>", rejectClose: false })) return;
      const data = await input("New band", `<p>A band is a group of monsters that fight as one: it has a leader, a nature and a plan. Put kinds of monster into it from their own pages afterwards.</p><div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${BAND_CAPS.name}" autofocus></div>`, "Create"); const name = data?.name?.trim(); if (!name) return;
      if (!bandId(name)) return ui.notifications.warn("A band's name needs a letter or a number in it."); if (bandViews(scene).some(x => x.band.key === bandId(name))) return ui.notifications.warn("This map already has a band of that name.");
      const r = await setBand(scene, name, { name }, { by: "gm" }); this.draft = {}; this.bdraft = {}; this.sel = `band:${r.band.key}`; this.message = `${r.band.name} made. Put monsters into it from their own pages (Band).`; return this.render(); }
    if (!v) return;
    if (a === "pickSpot") return this.pickSpot();
    if (a === "saveBand" || a === "bandToLibrary") { const change = this.bandChange(v);
      if (Object.keys(change).length) await setBand(scene, v.band.key, change, { by: "gm" }); else if (a === "saveBand") { this.bdraft = {}; this.message = "Nothing was changed."; return this.render(); }
      this.bdraft = {}; if (a === "saveBand") { this.message = "Saved."; return this.render(); } }
    if (a === "renameBand") { const data = await input(`Rename: ${v.band.name}`, `<div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${BAND_CAPS.name}" value="${esc(v.band.name)}"></div>`); if (!data?.name?.trim()) return;
      await setBand(scene, v.band.key, { name: data.name }, { by: "gm" }); this.message = "Renamed."; return this.render(); }
    if (a === "removeBand") { if (!await DialogV2.confirm({ window: { title: "Remove band" }, content: `<p>Remove <b>${esc(v.band.name)}</b> from this map? Its nature and plan here are thrown away; its ${v.members} monster${v.members === 1 ? "" : "s"} stay and belong to no band.</p>`, rejectClose: false })) return;
      await removeBand(scene, v.band.key); this.sel = null; this.bdraft = {}; this.message = `${v.band.name} removed.`; return this.render(); }
    if (a === "bandToLibrary") {
      const now = bandViews(scene).find(x => x.band.key === v.band.key), here = now.band.nature, entry = now.band.lib ? libraryGet(now.band.lib) : null, keys = NATURE.filter(k => here[k] && natureWords(k, here[k]) !== natureWords(k, entry?.nature?.[k]));
      if (!keys.length) { this.message = "Nothing written for this band's nature differs from the library."; return this.render(); }
      const people = partyPeople(scene), named = keys.filter(k => lineWarnings(here[k].text, people).names.length);
      const data = await input(`Save nature to library: ${now.band.name}`, `<p>These lines would go to a <b>kind of group</b> in the Minds Library, to start other bands from. The leader and the plan stay with this encounter. Untick any to keep here only.</p>
        <div class="form-group"><label>Kind of group</label><input type="text" name="name" maxlength="${CAPS.name}" value="${esc(entry?.name ?? now.band.name)}"></div>
        ${keys.map(k => `<label class="lm-line"><input type="checkbox" name="line_${k}" ${named.includes(k) ? "disabled" : "checked"}> <b>${esc(NATURE_LABEL[k])}:</b> ${entry?.nature?.[k] ? `<span class="lm-old">${esc(natureWords(k, entry.nature[k]))}</span> → ` : ""}${esc(natureWords(k, here[k]))}${named.includes(k) ? " <em>(names a party member: reword it first)</em>" : ""}</label>`).join("")}`, "Save to library"); if (!data?.name?.trim()) return;
      const take = keys.filter(k => data[`line_${k}`]); if (!take.length) return;
      const put = await libraryPut({ type: "band", ...(entry && entry.name === data.name.trim() ? { key: entry.key } : {}), name: data.name, nature: Object.fromEntries(take.map(k => [k, here[k]])) }, { by: "gm", keepBy: true });
      await setBand(scene, now.band.key, { lib: put.entry.key, nature: Object.fromEntries(take.map(k => [k, null])) }, { by: "gm" });   /* they come from the library now */
      this.message = `Saved ${take.length} line${take.length === 1 ? "" : "s"} to the library as ${put.entry.name}.`; return this.render(); }
  }
  /* the draft as `setLines` takes it: null takes this layer's line away; a line cleared over something below is blank on purpose */
  changes() { const out = {}; for (const [k, d] of Object.entries(this.draft)) out[k] = d === null ? null : d.blank ? (this.below[k] ? { blank: true } : null) : d; return out; }
  async act(a) {
    const scene = this.scene, row = this.row, ref = this.ref;
    if (a === "library") return openLibrary();
    if (["newBand", "saveBand", "renameBand", "removeBand", "bandToLibrary", "pickSpot"].includes(a)) return this.actBand(a);
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
const NO_PEOPLE = "(no people)", GROUPS = "(groups)";
export class LibraryApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-minds-library", classes: ["leb-minds"], window: { title: "Minds Library", resizable: true }, position: { width: 980, height: 640, top: 50 } };
  constructor() { super(); this.sel = null; this.search = ""; this.message = ""; }
  async _renderHTML() {
    ensureStyle(); const all = libraryEntries(), peoples = all.filter(e => e.type === "people").sort((a, b) => a.name.localeCompare(b.name)), kinds = all.filter(e => e.type === "kind").sort((a, b) => a.name.localeCompare(b.name));
    const q = this.search.trim().toLowerCase(), hit = e => !q || e.name.toLowerCase().includes(q) || Object.values(e.lines).some(l => (l.text ?? "").toLowerCase().includes(q));
    const of = key => kinds.filter(k => (k.people ?? null) === key), orphans = kinds.filter(k => !k.people || !peoples.some(p => p.key === k.people));
    const groups = [...peoples.map(p => ({ key: p.key, name: p.name, people: p, kinds: of(p.key) })), ...(orphans.length ? [{ key: NO_PEOPLE, name: "Kinds with no people", people: null, kinds: orphans }] : [])].filter(g => !q || (g.people && hit(g.people)) || g.kinds.some(hit));
    const groupsAll = all.filter(e => e.type === "band").sort((a, b) => a.name.localeCompare(b.name));
    if (this.sel !== GROUPS && !groups.some(g => g.key === this.sel)) this.sel = groups[0]?.key ?? (groupsAll.length ? GROUPS : null);
    const g = groups.find(x => x.key === this.sel) ?? null;
    const side = `<input type="search" class="lm-search" placeholder="Search…" value="${esc(this.search)}"><h4>Peoples and families</h4>${groups.map(x => `<div class="lm-it${x.key === this.sel ? " on" : ""}" data-sel="${esc(x.key)}">${esc(x.name)} <small>${x.kinds.length} kind${x.kinds.length === 1 ? "" : "s"}</small></div>`).join("") || `<div class="lm-later">${q ? "Nothing matches." : "Nothing saved yet."}</div>`}<h4>Kinds of group</h4><div class="lm-it${this.sel === GROUPS ? " on" : ""}" data-sel="${GROUPS}">All kinds of group <small>${groupsAll.length}</small></div>`;
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
    if (this.sel === GROUPS) main = groupsAll.length ? `<div class="lm-head"><b>Kinds of group</b><small>a band's nature, to start bands from: warbands, wolf packs, a knight's retinue</small></div>
        <table class="lm-tbl"><tr><th style="width:140px">Line</th>${groupsAll.map(e => `<th>${esc(e.name)}<a data-rename="${esc(e.key)}" title="Rename"><i class="fa-solid fa-pen"></i></a><a data-remove="${esc(e.key)}" title="Remove from the library"><i class="fa-solid fa-trash"></i></a></th>`).join("")}</tr>
        ${NATURE.map(k => `<tr><td>${esc(NATURE_LABEL[k])}</td>${groupsAll.map(e => `<td class="lm-cell" data-nature="${esc(e.key)}" data-line="${k}" title="Click to edit">${e.nature?.[k] ? esc(natureWords(k, e.nature[k])) : `<span class="lm-same">—</span>`}</td>`).join("")}</tr>`).join("")}</table>
        <div class="lm-note">A band in an encounter that starts from one of these uses its lines wherever the band itself says nothing. Discipline isn't here: it belongs to each kind of creature. Leaders and plans belong to one encounter.</div>`
      : `<p>No kinds of group yet. Start one with <b>New kind of group…</b> below, or save a band's nature from Monster Minds.</p>`;
    return `<div class="lm-body"><div class="lm-side">${side}</div><div class="lm-main">${main}</div></div>${this.message ? `<div class="lm-msg">${esc(this.message)}</div>` : ""}
      <div class="lm-foot"><button type="button" data-action="import">Import…</button><button type="button" data-action="export">Export…</button><button type="button" data-action="newPeople">New people…</button><button type="button" data-action="newKind">New kind…</button><button type="button" data-action="newGroup">New kind of group…</button></div>`;
  }
  _replaceHTML(html, content) { content.innerHTML = html; }
  _onRender() {
    const root = this.element, on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); Promise.resolve(fn(el)).catch(e => { ui.notifications.error(e.message); console.error(e); }); }));
    on("[data-sel]", el => { this.sel = el.dataset.sel; this.message = ""; this.render(); });
    const box = root.querySelector(".lm-search"); box?.addEventListener("change", () => { this.search = box.value; this.render(); });
    on("[data-edit]", el => this.editCell(el.dataset.edit, el.dataset.line)); on("[data-nature]", el => this.editNature(el.dataset.nature, el.dataset.line)); on("[data-rename]", el => this.rename(el.dataset.rename)); on("[data-remove]", el => this.remove(el.dataset.remove));
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
  /* a kind of group's line (0.26.0) */
  async editNature(key, k) {
    const e = libraryGet(key); if (!e) return; const l = e.nature?.[k] ?? {}, picks = NATURE_PICKS[k];
    const data = await input(`${e.name}: ${NATURE_LABEL[k]}`, `${picks ? `<div class="form-group"><label>${esc(NATURE_LABEL[k])}</label><select name="pick"><option value="">(not set)</option>${Object.entries(picks).map(([id, p]) => `<option value="${id}"${l.pick === id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></div>` : ""}
      <textarea name="text" maxlength="${BAND_CAPS.line}" placeholder="${picks ? "in your own words (optional)" : "your own words"}">${esc(l.text ?? "")}</textarea>${(NATURE_SUGGEST[k] ?? []).length ? `<p class="lm-old">For example: ${NATURE_SUGGEST[k].map(esc).join("; ")}.</p>` : ""}
      <label class="lm-line"><input type="checkbox" name="same"> Take this line away</label>`); if (!data) return;
    const line = data.same ? null : cleanPart({ text: data.text, pick: data.pick || undefined }, { picks: picks ?? null });
    if (line) { const w = lineWarnings(line.text, partyPeople(canvas.scene)); if (w.names.length && !await DialogV2.confirm({ window: { title: "A party member's name" }, content: `<p>“${esc(w.names[0])}” is a party member's name, or part of one. Library text is used in every encounter, so it should name nobody.</p><p>Save it anyway?</p>`, rejectClose: false })) return; }
    await libraryPut({ type: "band", key: e.key, nature: { [k]: line ? { text: line.text, ...(line.pick ? { pick: line.pick } : {}) } : null } }, { by: "gm" }); this.message = "Saved."; this.render();
  }
  async newGroup() {
    const data = await input("New kind of group", `<p>A kind of group holds a band's nature, to start bands from in any encounter: a goblin warband, a wolf pack, a knight's retinue.</p><div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${CAPS.name}" autofocus></div>`, "Create"); if (!data?.name?.trim()) return;
    const r = await libraryPut({ type: "band", name: data.name, nature: {} }, { by: "gm" }); if (!r.created) ui.notifications.info("The library already has a kind of group of that name.");
    this.sel = GROUPS; this.message = `${r.entry.name} ${r.created ? "added" : "is here"}. Click a cell to write its lines.`; this.render();
  }
  async rename(key) {
    const e = libraryGet(key); if (!e) return; const peoples = libraryEntries().filter(x => x.type === "people");
    const data = await input(`Rename: ${e.name}`, `<div class="form-group"><label>Name</label><input type="text" name="name" maxlength="${CAPS.name}" value="${esc(e.name)}"></div>${e.type === "kind" ? `<div class="form-group"><label>Its people or family</label><select name="people"><option value="">(none)</option>${peoples.map(p => `<option value="${esc(p.key)}"${p.key === e.people ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}`); if (!data?.name?.trim()) return;
    await libraryPut({ ...e, name: data.name, ...(e.type === "kind" ? { people: data.people || null } : {}), lines: {}, nature: {} }, { by: "gm" }); this.message = "Saved."; this.render();
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
