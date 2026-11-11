/* The Monster Turns window: GM only. Who's ticked, and the plan card for the turn in hand. PF2e HUD's tracker is left alone. */
import { LINE_LABEL, MINDS } from "../minds.mjs";
import { BAND_GO, HELD_LABEL } from "../bands.mjs";
import { CHANGEABLE, NOTE_MAX, SIDES, WORD, applyEdits, changeProblem, planPrint, describeChanges, describeStep, editableParts, isMove, listWords } from "../turn.mjs";
import { tickGroups, groupChanges } from "./ticks.mjs";
import { esc } from "../journal.mjs";
import { countingDown, offerWords } from "../react.mjs";
import { describeKnows } from "../perceive.mjs";
import { ID } from "../builder.mjs";
import { notebookOf, previewRemember, rememberAdd, rememberCross } from "../fight.mjs";
import { GM_LINE_MAX } from "../memory.mjs";
import { askAngel, cancelChange, changePlan, previewNote, applySetting, partyMember, runnable, brainListening, bringBack, runnerName, escapedList, extendMap, extendProblem, letGo, letBandGo, bandStillFighting, notePress, brainSeenAt, clock, currentRequest, doIt, hold, lastNote, playMyself, rollFor, runnerProblem, answerReaction, continueReactions, otherReactions, doReaction, skipReaction, monsterReactionsLeft } from "../fight.mjs";
import { LISTEN_MS, stallWords } from "../brain.mjs";

const STYLE = `.leb-turns .leb-nb{margin:4px 0;border:1px solid #0003;border-radius:4px;padding:2px 6px}.leb-turns .leb-nb summary{cursor:pointer;font-weight:600}.leb-turns .leb-nb ul{margin:2px 0 4px;padding-left:16px}.leb-turns .leb-nb li{margin:1px 0;display:flex;gap:4px;align-items:flex-start}.leb-turns .leb-nb li>span.leb-lt{flex:1}.leb-turns .leb-nb .leb-grey{opacity:.55;font-style:italic}.leb-turns .leb-nb .leb-x{text-decoration:line-through;opacity:.6}.leb-turns .leb-nb button{flex:0 0 auto;width:auto;line-height:16px;height:18px;padding:0 4px;margin-left:4px;font-size:11px}.leb-turns .leb-nb .leb-mine{font-size:11px;opacity:.75}.leb-turns .leb-nbadd{display:flex;gap:4px}.leb-turns .leb-nbadd input{flex:1}.leb-turns .leb-nbs{margin-top:6px}.leb-turns .window-content{overflow-y:auto;padding:8px 12px}.leb-turns .leb-t{display:grid;grid-template-columns:1fr 58px 44px;gap:4px;align-items:center}.leb-turns .leb-cur{font-weight:700}.leb-turns .leb-g{font-style:italic}.leb-turns .leb-gs{border-bottom:1px solid #0004;margin-bottom:4px;padding-bottom:4px}.leb-turns .leb-card{border:1px solid #0006;padding:6px 8px;margin-top:8px}.leb-turns .leb-warn{color:#e07050}.leb-turns .leb-card.leb-stall{border-color:#e0a030;background:#e0a03022}.leb-turns .leb-stallw{color:#e0a030;font-weight:700}.leb-turns .leb-btns{display:flex;gap:6px;margin-top:6px}.leb-turns .leb-btns button{flex:1}.leb-turns .leb-listen{margin:0 0 6px;opacity:.8}.leb-turns .leb-listen i{color:#888}.leb-turns .leb-listen.on i{color:#4caf50}.leb-turns li.leb-done{opacity:.6}.leb-turns li.leb-next{font-weight:700}.leb-turns .leb-esc{margin-top:8px}.leb-turns .leb-esc .leb-t{grid-template-columns:1fr 110px}.leb-turns .leb-edge{font-weight:700}.leb-turns .leb-edit{border-top:1px solid #0004;margin-top:6px;padding-top:6px}.leb-turns .leb-er{margin:4px 0;padding:4px;border:1px solid #0002}.leb-turns .leb-er.leb-out .leb-et{text-decoration:line-through;opacity:.6}.leb-turns .leb-ef{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:3px}.leb-turns .leb-ef input[type=number]{width:52px}.leb-turns .leb-ef select{flex:1;min-width:120px}.leb-turns .leb-edit textarea{width:100%;min-height:44px}.leb-turns .leb-prev{border-left:3px solid #4caf50;padding-left:6px}.leb-turns .leb-react{border-left:3px solid #e0a030;padding-left:6px;margin-top:6px}.leb-turns .leb-react button{margin-left:4px}.leb-turns .leb-other{opacity:.75;font-size:.9em}`;
/** A question to reactors as the card shows it (0.20.0): who is asked, the GM's own rows with React and Pass, and Continue. Also used under a monster's
    own reaction (0.21.0), whose hit can be Shield Blocked. */
function rxHtml(rx) { if (!rx) return ""; const ans = rx.answers ?? {}, left = countingDown(rx.list, ans, rx.until, clock()) ? Math.ceil((rx.until - clock()) / 1000) : null;   /* only while a player still has time to answer */
        const rows = rx.list.map(x => { const a = ans[x.id], gm = x.to === "gm";
          const state = a === "done" ? "used it" : a === "react" ? "is rolling it" : a === "pass" ? "passed" : a === "timeout" ? "didn't answer in time" : a === "continue" ? "skipped" : gm ? "yours to answer" : "asked in their window";
          const btns = gm && !a ? `<button type="button" data-rx="react" data-row="${esc(x.id)}">React</button><button type="button" data-rx="pass" data-row="${esc(x.id)}">Pass</button>` : gm && a === "react" ? `<button type="button" data-rx="done" data-row="${esc(x.id)}">Done</button>` : "";
          return `<p>${esc(x.name)}: ${esc(x.reaction)}, ${state}. ${btns}</p>`; }).join("");
        return `<div class="leb-react"><p><b>Reactions</b>: ${esc(String(rx.list[0]?.gmWords ?? rx.list[0]?.words ?? "").replace(/\s*React with .*$/, ""))}${left != null ? ` ${rx.list.some(x => x.to === "gm") ? "Players' answers pass" : "They pass"} in about ${left} s.` : ""}</p>${rows}<div class="leb-btns"><button type="button" data-rx="cont" title="Skip any reaction not answered yet and carry on"><i class="fa-solid fa-forward"></i> Continue</button></div></div>`; }
/** The window's monsters as plain rows for the group ticks. A kind is the creature a token was made from (its base actor's name: PF2e gives an unlinked
    token's own actor the token's name, so that can't be used, seen live 2026-11-10), with "Elite" or "Weak" in front when PF2e's adjustment is on it
    (the adjustment renames nothing), so a renamed or numbered token stays with its kind and an Elite one is its own. Anything on the party's side or owned by a player (a party member the GM plays, an NPC ally, a summon
    or companion built as an NPC) is marked `party` and is in no group: one click must never hand Angel a creature that isn't an enemy (0.22.0 review). */
const kindOf = x => { const base = x.token.baseActor?.name ?? x.actor?.name ?? x.token.name, adj = x.actor?.isElite ? "Elite" : x.actor?.isWeak ? "Weak" : "";
  return adj && !new RegExp(`^${adj}\\b`, "i").test(base) ? `${adj} ${base}` : base; };   /* a world actor already named "Elite Wolf" isn't prefixed twice */
const tickRows = c => c.combatants.filter(x => x.token && runnable(x.token)).map(x => ({ id: x.token.id, name: x.token.name, kind: kindOf(x),
  party: partyMember(x.actor) || x.actor?.alliance === "party" || !!x.actor?.hasPlayerOwner, run: !!x.token.getFlag(ID, "run"), auto: !!x.token.getFlag(ID, "auto") }));
export class TurnsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "leb-turns", classes: ["leb-turns"], window: { title: "Monster Turns", resizable: true }, position: { width: 400, height: 420, left: 110, top: 60 } };
  get combat() { return game.combat?.scene?.id === canvas.scene?.id ? game.combat : game.combats.find(c => c.scene?.id === canvas.scene?.id) ?? null; }
  async _renderHTML() {
    if (!document.getElementById("leb-turns-style")) { const s = document.createElement("style"); s.id = "leb-turns-style"; s.textContent = STYLE; document.head.append(s); }
    const c = this.combat; if (!c) return "<p>No fight on this scene.</p>";
    /* the group ticks (0.22.0): every monster, then each kind with two or more; a tick there sets the same tick on each monster in it */
    const box = (g, k, title) => `<label title="${title}"><input type="checkbox" name="${k}" data-state="${g[k]}" ${g[k] === "all" ? "checked" : ""}> ${k === "run" ? "Angel" : "Auto"}</label>`;
    const groups = tickGroups(tickRows(c)).map(g => `<div class="leb-t leb-g" data-group="${esc(g.key)}" data-ids="${g.ids.join(",")}"><span>${esc(g.label)} (${g.ids.length})</span>${box(g, "run", "Angel runs all of these")}${box(g, "auto", "All of these act without waiting for Do it")}</div>`).join("");
    const rows = (groups ? `<div class="leb-gs">${groups}</div>` : "") + c.combatants.filter(x => x.token && runnable(x.token)).map(x => `<div class="leb-t ${c.combatant?.id === x.id ? "leb-cur" : ""}" data-token="${x.token.id}"><span>${esc(x.token.name)}${partyMember(x.actor) ? " (party)" : ""}</span><label title="Angel runs this"><input type="checkbox" name="run" ${x.token.getFlag(ID, "run") ? "checked" : ""}> Angel</label><label title="Act without waiting for Do it"><input type="checkbox" name="auto" ${x.token.getFlag(ID, "auto") ? "checked" : ""}> Auto</label></div>`).join("");
    const r = currentRequest(c), problem = runnerProblem(), on = brainListening(); let card = "";
    const listen = `<p class="leb-listen ${on ? "on" : ""}"><i class="fa-solid fa-circle"></i> ${on ? "Angel is listening." : "Angel isn't listening."}</p>`;
    const deaf = r?.state === "requested" && r.packet && !r.gaveUp && !on ? `<p class="leb-warn">Angel isn't listening. Play it yourself, or in the chat say go.</p>` : "";
    /* text on a request uses labels (the thinker reads the same words); the GM gets names */
    const labels = c.getFlag(ID, "turns")?.labels ?? {}, nameOf = l => { const a = Object.entries(labels).find(([, v]) => v === l); return a ? c.scene.tokens.get(a[0])?.name ?? null : null; };
    const named = t => String(t ?? "").replace(/\b[EM]\d{1,3}\b/g, l => nameOf(l) ?? l);
    if (r) { const tok = c.scene.tokens.get(r.tokenId), pos = r.pos ?? 0, n = r.steps?.length ?? 0, knows = describeKnows(r.packet, nameOf);
      const words = { requested: r.why ? "Asked again: waiting for a new plan." : "Waiting for a plan.", submitted: "Checking the plan.", ready: pos ? `Step ${pos + 1} of ${n} next.` : "Ready.", running: "Carrying it out.", held: "Held.", stopped: "Stopped.", saves: "Waiting for saves.", fled: r.extend ? `Asking ${runnerName()} to extend the map ${r.extend}…` : `At the ${listWords(r.fled?.sides ?? [])} edge of the map: let it get away, or extend the map and let it keep its turn?`, extending: `Extending the map… the monster keeps its turn.` }[r.state] ?? r.state;
      const strikeName = id => r.packet?.you?.strikes?.find(x => x.id === id)?.name ?? id, abilityName = id => r.packet?.you?.abilities?.find(x => x.id === id)?.name ?? id, spellName = id => r.packet?.you?.spells?.find(x => x.id === id)?.name ?? id;
      const done = (r.done ?? []).map(d => d.do === "strike" ? `${strikeName(d.item)} at ${nameOf(d.target) ?? d.target} (${d.result})` : isMove(d) ? `${WORD[d.do] ?? "Stride"} to square ${d.to?.[0]}, ${d.to?.[1]} (${d.result})` : d.do === "stand" ? `Stand (${d.result})` : d.do === "drop-prone" ? `Drop Prone (${d.result})` : d.do === "take-cover" ? `Take Cover (${d.result})` : d.do === "hide" ? `Hide (${d.result})` : d.do === "seek" ? `Seek (${d.result})` : d.do === "ability" ? `${abilityName(d.item)}${d.target ? ` at ${nameOf(d.target) ?? d.target}` : ""} (${d.result})` : d.do === "spell" ? `${spellName(d.item)}${d.target ? ` at ${nameOf(d.target) ?? d.target}` : ""} (${named(d.result)})` : d.do).join(", ");
      /* an area also catches creatures the monster doesn't know of (and its allies, when it meant to): the GM sees them all */
      const also = s => { if (!s.area?.hits?.length) return "";
        const known = new Set((s.area.catches ?? []).map(l => Object.entries(labels).find(([, v]) => v === l)?.[0]).filter(Boolean));
        const rest = s.area.hits.filter(t => !known.has(t)).map(t => c.scene.tokens.get(t)?.name).filter(Boolean);
        return rest.length ? ` Also in the area: ${listWords(rest)}.` : ""; };
      const steps = r.steps ? `<ol>${r.steps.map((s, i) => `<li class="${i < pos ? "leb-done" : i === pos && r.state !== "requested" ? "leb-next" : ""}">${i < pos ? "✓ " : ""}${esc(named(describeStep(s)) + also(s))}</li>`).join("")}</ol>` : "";
      const go = pos ? `<i class="fa-solid fa-forward-step"></i> Next step` : `<i class="fa-solid fa-play"></i> Do it`;
      /* the Change button (Rhea, 2026-11-09: "Note and step edits"): the steps still to come, each with what can be changed, and a note to Angel */
      const fp = planPrint(r), canChange = !changeProblem(r), pending = !!(r.ask || r.edit);
      /* a draft is for one plan as it stood: another plan, another step done, or an accepted change drops it; a refusal keeps it (she fixes and sends again) */
      if (this._draft && (this._draft.id !== r.id || this._draft.fp !== fp)) this._draft = null;
      const editing = canChange && !!this._draft;
      const choices = [...(r.packet?.perceived ?? []), ...(r.packet?.allies ?? [])].map(x => x?.label).filter((l, i, a) => l && a.indexOf(l) === i);
      const editPanel = editing ? `<div class="leb-edit"><p><b>Change the plan</b> from step ${pos + 1}. Each change is checked like Angel's plans.</p>${(r.plan?.steps ?? []).slice(pos).map((raw, k) => { const e = this._draft.edits[k] ?? {}, parts = editableParts(raw), val = f => e[f] !== undefined ? e[f] : raw[f];
        const sel = f => `<select data-f="${f}">${choices.map(l => `<option value="${esc(l)}" ${val(f) === l ? "selected" : ""}>${esc(nameOf(l) ?? l)} (${esc(l)})</option>`).join("")}${choices.includes(val(f)) ? "" : `<option value="${esc(val(f))}" selected>${esc(val(f))}</option>`}</select>`;
        const sq = f => `<span>${f === "to" ? "Square" : f === "at" ? "From corner" : "Toward"} <input type="number" min="0" data-f="${f}" data-i="0" value="${val(f)?.[0] ?? ""}"> , <input type="number" min="0" data-f="${f}" data-i="1" value="${val(f)?.[1] ?? ""}"> <button type="button" data-pick="${f}" title="Click a square on the map"><i class="fa-solid fa-crosshairs"></i> Pick</button></span>`;
        const fields = parts.map(f => f === "target" || f === "after" ? `<label>${f === "after" ? "After" : "Target"} ${sel(f)}</label>` : f === "height" ? `<label>Height <input type="number" min="0" step="5" data-f="height" value="${val("height") ?? ""}"> ft</label>` : sq(f)).join("");
        return `<div class="leb-er${e.remove ? " leb-out" : ""}" data-k="${k}"><div class="leb-et">${pos + k + 1}. ${esc(named(describeStep(r.steps[pos + k] ?? raw)))}</div><div class="leb-ef"><label><input type="checkbox" data-f="remove" ${e.remove ? "checked" : ""}> Leave out</label>${e.remove ? "" : fields}</div></div>`; }).join("")}
        <p><textarea data-f="note" maxlength="${NOTE_MAX}" placeholder="Or tell Angel what you want for the rest of this turn (names are fine: Angel gets labels)">${esc(this._draft.note ?? "")}</textarea></p>
        ${this._draft.preview ? (() => { const p = this._draft.preview, bad = [...p.unknown.map(n => `${n} isn't someone ${tok?.name ?? "it"} perceives: take the name out, or the note would tell it they're there.`), ...p.ambiguous.map(n => `${n} could mean more than one creature: use its label (shown in the target lists).`)];
          return bad.length ? bad.map(w => `<p class="leb-warn">${esc(w)}</p>`).join("") : `<p class="leb-prev">Angel will get: “${esc(p.text)}”</p><div class="leb-btns"><button type="button" data-do="confirmnote"><i class="fa-solid fa-paper-plane"></i> Send this</button></div>`; })() : ""}
        <div class="leb-btns"><button type="button" data-do="useedit"><i class="fa-solid fa-check"></i> Use my changes</button><button type="button" data-do="sendnote"><i class="fa-solid fa-paper-plane"></i> Send to Angel</button><button type="button" data-do="cancel"><i class="fa-solid fa-xmark"></i> Cancel</button></div></div>` : "";
      /* a save the player rolls from their row on the spell's card; the GM can roll it for them */
      const waiting = r.state === "saves" ? (r.log?.[pos]?.waiting ?? []).map(tid => { const t = c.scene.tokens.get(tid), player = t?.actor?.hasPlayerOwner && game.users.some(u => !u.isGM && u.active && t.actor.testUserPermission(u, "OWNER"));
        return `<p>Waiting for ${esc(t?.name ?? "a creature")}'s save${player ? " (their row on the spell's card)" : ": I rolled it on the card and no result has come yet"}. <button type="button" data-do="rollfor" data-for="${esc(tid)}"><i class="fa-solid fa-dice-d20"></i> Roll it for them</button></p>`; }).join("") : "";
      /* player reactions (0.20.0): who is asked, the GM's own (no player online, or a party member she plays) with React and Pass, and Continue */
      const reacting = rxHtml(r.react);
      /* reactions the module doesn't know: shown with their trigger, never asked (Rhea, 2026-11-09: prompted only for the right one) */
      const others = ["ready", "requested", "running"].includes(r.state) ? otherReactions(c, tok) : [], otherLine = others.length ? `<p class="leb-other">Not asked by the module: ${others.map(o => `${esc(o.name)}'s ${esc(o.reaction)}${o.trigger ? ` (${esc(o.trigger)})` : ""}`).join("; ")}.</p>` : "";
      /* a stall (the runner's check, Rhea 2026-11-08): amber while the turn is still stuck at the point it was marked */
      const stalled = r.stall && r.stall.since === r.since ? `<p class="leb-stallw"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(stallWords(r.stall))} Angel has been asked to look into it.</p>` : "";
      card = `<div class="leb-card${stalled ? " leb-stall" : ""}" data-request="${r.id}">${stalled}<b>${esc(tok?.name)}</b>: ${esc(words)}${r.why ? `<p class="leb-warn">${esc(named(describeChanges(r.why, nameOf, tok?.name ?? "It")))}</p>` : ""}${done ? `<p>Done this turn: ${esc(done)}.</p>` : ""}${knows ? `<p>${esc(knows)}</p>` : ""}${this._nbHtml(c, r.tokenId, nameOf)}${r.mindHeld?.length ? `<p class="leb-warn">Left out of what Angel was told about its mind: ${esc(r.mindHeld.map(k => LINE_LABEL[k] ?? HELD_LABEL[k.replace(/^band\./, "")] ?? k).join(", "))} (a name there is someone it doesn't perceive, or fits more than one it does). Monster Minds shows the line.</p>` : ""}${r.plan?.reason ? `<p>${esc(named(r.plan.reason))}</p>` : ""}${editing ? editPanel : steps}${pending ? `<p class="leb-warn">Your ${r.ask ? "note" : "change"} is on its way to ${esc(runnerName())}. <button type="button" data-do="cancelchange"><i class="fa-solid fa-xmark"></i> Cancel it</button></p>` : ""}${waiting}${reacting}${otherLine}${r.changeVerdict && CHANGEABLE.includes(r.state) ? `<p class="leb-warn">${esc(named(r.changeVerdict))}</p>` : ""}${r.verdict ? `<p class="leb-warn">${esc(named(r.verdict))}</p>` : ""}${deaf}${game.paused && tok?.getFlag(ID, "auto") && ["ready", "running", "done"].includes(r.state) ? `<p class="leb-warn">The game is paused: Auto waits until you unpause.</p>` : ""}${r.note ? `<p class="leb-warn">${esc(named(r.note))}</p>` : ""}${r.state === "fled" ? (r.fled?.sides ?? []).map(x => extendProblem(c.scene, x)).filter(Boolean).map(w => `<p class="leb-warn">${esc(w)}</p>`).join("") : ""}<div class="leb-btns">${r.state === "fled" ? (r.extend ? "" : (r.fled?.sides ?? []).filter(x => SIDES.includes(x)).map(x => { const why = extendProblem(c.scene, x) ?? problem; return `<button type="button" data-do="extend" data-side="${x}" ${why ? `disabled title="${esc(why)}"` : ""}><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Extend map ${x}</button>`; }).join("")) + (bandStillFighting(c, r.tokenId) ? `<button type="button" data-do="letgo" title="It leaves the fight. The next of its band to reach the edge asks again."><i class="fa-solid fa-person-running"></i> ${BAND_GO.one}</button><button type="button" data-do="letband" title="It leaves the fight, and so does every other member of its band that reaches the map's edge, without stopping."><i class="fa-solid fa-people-group"></i> ${BAND_GO.all}</button>` : `<button type="button" data-do="letgo"><i class="fa-solid fa-person-running"></i> Let it get away</button>`) : ""}${["ready", "held", "stopped"].includes(r.state) && !r.go && !editing && !pending ? `<button type="button" data-do="doit" ${problem ? "disabled" : ""}>${go}</button>` : ""}${canChange && !editing ? `<button type="button" data-do="change" title="Change the plan, or tell Angel what you want"><i class="fa-solid fa-pen"></i> Change</button>` : ""}${r.state === "running" ? `<button type="button" data-do="hold"><i class="fa-solid fa-hand"></i> Hold</button>` : ""}<button type="button" data-do="manual"><i class="fa-solid fa-user"></i> Play it myself</button></div></div>`; }
    /* monsters' reactions on players' turns (0.21.0): each offer with Do it and Skip, the reason when the module isn't sure, and what came of it until
       the turn moves on */
    const reqs = Object.entries(c.getFlag(ID, "turns")?.requests ?? {}).filter(([, x]) => x?.reaction && !x.skipped && !x.lapsed && (x.state !== "done" || (x.note && x.round === c.round && x.turnOf === c.combatant?.id)));
    const mreact = reqs.map(([id, x]) => { const m = c.scene.tokens.get(x.tokenId), t = c.scene.tokens.get(x.reaction.by), line = offerWords({ monster: m?.name, target: t?.name, strike: x.reaction.strike, kind: x.reaction.kind, sure: x.reaction.sure, why: x.reaction.why });
      const waitsAuto = x.state === "ready" && x.reaction.auto && !x.go;
      const body = x.state === "done" ? "" : x.state === "running" ? `<p><i class="fa-solid fa-bolt"></i> Making its Reactive Strike…</p>` : x.go ? `<p>Asking ${esc(runnerName())} to make it…</p>` : waitsAuto ? `<p>${game.paused ? "The game is paused: it strikes when you unpause." : "It takes it by itself (Auto)."}</p>` : "";
      const btns = x.state === "ready" && !x.go ? `<div class="leb-btns"><button type="button" data-do="reactdo" ${problem ? `disabled title="${esc(problem)}"` : ""}><i class="fa-solid fa-bolt"></i> Do it</button><button type="button" data-do="reactskip"><i class="fa-solid fa-xmark"></i> Skip</button></div>` : "";
      return `<div class="leb-card leb-mreact" data-request="${id}"><p><b>Reaction</b>: ${esc(line)}</p>${body}${rxHtml(x.react)}${x.note ? `<p class="leb-warn">${esc(x.note)}</p>` : ""}${btns}</div>`; }).join("");
    const mOther = monsterReactionsLeft(c), mOtherLine = c.started && mOther.length ? `<p class="leb-other">Monsters' other reactions are yours to play: ${mOther.map(o => `${esc(o.name)}'s ${esc(o.reaction)}${o.trigger ? ` (${esc(o.trigger)})` : ""}`).join("; ")}.</p>` : "";
    const left = !r && lastNote(c); if (left) card = `<div class="leb-card"><p class="leb-warn">${esc(named(left.note))}</p></div>`;
    /* fight memory (0.25.0): every other creature that keeps a notebook has its fold-out too, so the ones she plays can be read and corrected */
    const rest = c.started ? c.combatants.filter(x => x.token && x.token.id !== r?.tokenId).map(x => this._nbHtml(c, x.token.id, nameOf, x.token.name)).filter(Boolean) : [], notebooks = rest.length ? `<div class="leb-nbs">${rest.join("")}</div>` : "";
    const history = `<p class="leb-btns"><button type="button" data-do="history"><i class="fa-solid fa-clock-rotate-left"></i> History</button></p>`;
    /* escaped monsters (Rhea, 2026-11-08): hidden on this scene, out of the fight; Bring back shows the token where it stands now and rolls initiative */
    const gone = escapedList(c), escaped = gone.length ? `<div class="leb-esc"><b>Escaped</b>${gone.map(e => `<div class="leb-t" data-token="${esc(e.id)}"><span>${esc(e.name)} (round ${e.round}${e.xp != null ? `, ${e.xp} XP not earned` : ""})</span><button type="button" data-do="bringback"><i class="fa-solid fa-rotate-left"></i> Bring back</button></div>`).join("")}</div>` : "";
    return `<div>${listen}${rows || "<p>No monsters in this fight.</p>"}${problem ? `<p class="leb-warn">${esc(problem)}</p>` : ""}${card}${mreact}${notebooks}${escaped}${mOtherLine}${applySetting() ? "" : "<p><em>Damage is rolled, not applied: use the card's Damage button.</em></p>"}${history}</div>`;
  }
  /** The Remembers fold-out for one creature (Rhea, 2026-11-11): what is sent to Angel, what it perceived and makes nothing of (greyed), her own
      lines, a cross on every line and a box to add one. The GM reads names beside the labels; what is stored and sent holds labels only. */
  _nbHtml(c, tokenId, nameOf, title = null) {
    const nb = notebookOf(c, tokenId); if (!nb) return "";
    const named = t => String(t ?? "").replace(/\b[EM]\d{1,3}\b/g, l => nameOf(l) ? `${nameOf(l)} (${l})` : l), count = nb.remembers.length + nb.allies.length;
    const cross = x => `<button type="button" data-nbdo="cross" data-keys="${esc(x.keys.join(","))}" title="Cross this out: it is no longer sent to Angel"><i class="fa-solid fa-xmark"></i></button>`;
    const li = (x, cls = "") => `<li class="${cls}"><span class="leb-lt">${esc(named(x.text))}${x.sure === false ? " (unsure)" : ""}${x.by === "gm" ? ` <span class="leb-mine">yours</span>` : ""}</span>${cross(x)}</li>`;
    const sent = nb.remembers.map(x => li(x)).join(""), deeds = nb.allies.map(x => li(x)).join(""), grey = nb.unused.map(x => li(x, "leb-grey")).join("");
    const gone = nb.crossed.map(x => `<li class="leb-x"><span class="leb-lt">${esc(named(x.text))}${x.by === "gm" ? ` <span class="leb-mine">yours</span>` : ""}</span><button type="button" data-nbdo="back" data-keys="${esc(x.keys.join(","))}" title="Put it back"><i class="fa-solid fa-rotate-left"></i></button></li>`).join("");
    const draft = this._nbDraft?.[tokenId] ?? "", prev = this._nbPrev?.[tokenId];
    const warn = prev ? [...prev.unknown.map(n => `${n} isn't someone it has perceived in this fight: take the name out, or the line would tell it they're there.`), ...prev.ambiguous.map(n => `${n} could mean more than one creature: use its label (E2, M3…).`)].map(w => `<p class="leb-warn">${esc(w)}</p>`).join("") : "";
    return `<details class="leb-nb" data-nb="${esc(tokenId)}" ${this._nbOpen?.has(tokenId) ? "open" : ""}><summary>${title ? `${esc(title)} remembers` : "Remembers"} (${count})</summary>
      <p class="leb-mine">Mind: ${esc(MINDS[nb.mind]?.label ?? nb.mind)}.${nb.rung === 0 ? " Mindless: it makes nothing of any of this, and nothing here is sent." : ""}</p>
      ${sent ? `<ul>${sent}</ul>` : nb.rung > 0 ? `<p class="leb-mine">Nothing yet.</p>` : ""}
      ${deeds ? `<p class="leb-mine">Its allies, since its last turn:</p><ul>${deeds}</ul>` : ""}${nb.side ? `<p class="leb-mine">${esc(nb.side)}</p>` : ""}
      ${grey ? `<p class="leb-mine">Saw it, makes nothing of it:</p><ul>${grey}</ul>` : ""}${gone ? `<p class="leb-mine">Crossed out:</p><ul>${gone}</ul>` : ""}
      <div class="leb-nbadd"><input type="text" data-nbadd maxlength="${GM_LINE_MAX}" placeholder="Add a line of your own (names are fine)" value="${esc(draft)}"><button type="button" data-nbdo="add"><i class="fa-solid fa-plus"></i> Add</button></div>${warn}</details>`;
  }
  _replaceHTML(html, content) { content.innerHTML = html; }
  /** A field of the Change panel into the draft (this browser only, until sent). */
  _field(el) {
    const d = this._draft; if (!d) return; const f = el.dataset.f;
    if (f === "note") { d.note = el.value; d.preview = null; return; }
    const k = Number(el.closest("[data-k]")?.dataset.k), e = d.edits[k] ??= {};
    if (f === "remove") { e.remove = el.checked; return this.render(); }
    if (f === "height") { e.height = el.value === "" ? undefined : Math.max(0, Math.round(Number(el.value))); return; }
    if (el.dataset.i != null) { const vals = [...el.closest("[data-k]").querySelectorAll(`[data-f="${f}"]`)].map(x => x.value.trim()), xy = vals.map(v => Math.round(Number(v)));
      e[f] = vals.every(v => v === "") ? undefined : vals.some(v => v === "") || !xy.every(v => Number.isFinite(v) && v >= 0) ? null : xy; return; }   /* null: half filled, refused on sending */
    e[f] = el.value;
  }
  /** Pick: the window steps aside, the next left click on the map gives the square (its top-left corner, for a burst's "at"). A right-click or
      Escape cancels; closing the window or a new map ends it too, so no listener is left behind. */
  _pick(k, f) {
    const d = this._draft; if (!d || !canvas.ready) return; this._endPick?.();
    const stage = canvas.stage; this.minimize(); ui.notifications.info("Click a square on the map (right-click or Escape to cancel).");
    const end = () => { stage.off("pointerdown", on); document.removeEventListener("keydown", key, true); Hooks.off("canvasTearDown", torn); this._endPick = null; };
    const stop = () => { end(); if (this.rendered) { this.maximize(); this.render(); } };
    const on = ev => { if (ev.button === 2) return stop(); if (ev.button !== 0) return; const p = ev.getLocalPosition(stage), dim = canvas.scene.dimensions;
      (d.edits[k] ??= {})[f] = [Math.floor((p.x - dim.sceneX) / dim.size), Math.floor((p.y - dim.sceneY) / dim.size)]; stop(); };
    const key = ev => { if (ev.key === "Escape") { ev.stopPropagation(); stop(); } };
    const torn = () => { end(); };
    stage.on("pointerdown", on); document.addEventListener("keydown", key, true); Hooks.on("canvasTearDown", torn); this._endPick = end;
  }
  /** While she types in the Change panel, a redraw waits (the field would be replaced mid-word); it happens when the panel loses focus. */
  _typing() { const a = document.activeElement; return !!a && !!this.element?.contains(a) && (!!a.closest?.(".leb-edit") || !!a.closest?.(".leb-nb")); }
  render(...args) { if (this.rendered && this._typing()) { this._deferred = true; return this; } return super.render(...args); }
  async _onClose(options) { this._endPick?.(); this._draft = null; this._deferred = false; this._nbDraft = {}; this._nbPrev = {}; return super._onClose?.(options); }   /* the window object is reused when reopened: a draft must not come back with it */
  /** The Change panel's buttons. Sending never waits for Angel: the card follows the request as usual. */
  async _change(a, c, id, r, el) {
    if (a === "change") { this._draft = { id, fp: planPrint(r), edits: [], note: "" }; return this.render(); }
    if (a === "cancel") { this._draft = null; return this.render(); }
    if (a === "cancelchange") return cancelChange(c, id).catch(e => ui.notifications.error(e.message));
    const d = this._draft; if (!d || d.id !== id || this._sending) return;
    if (a === "sendnote") { if (!String(d.note ?? "").trim()) return ui.notifications.warn("Write what you want Angel to do first."); d.preview = previewNote(c, id, d.note); return this.render(); }
    this._sending = true; el.disabled = true;   /* one send: a redraw before the save lands brings the button back */
    try {
      if (a === "confirmnote") { await askAngel(c, id, d.note, d.fp); notePress(c, id, "Send to Angel"); }
      else { const raw = (r?.plan?.steps ?? []).slice(r?.pos ?? 0), steps = applyEdits(raw, d.edits);
        const half = raw.findIndex((s, k) => Object.values(d.edits[k] ?? {}).includes(null)); if (half >= 0) return ui.notifications.warn(`Step ${(r?.pos ?? 0) + half + 1}: a square needs both numbers.`);
        if (JSON.stringify(steps) === JSON.stringify(raw)) return ui.notifications.warn("Nothing is changed yet.");
        await changePlan(c, id, steps, d.fp); notePress(c, id, "Use my changes"); }
      d.preview = null;   /* the draft stays until the change is accepted, so a refusal can be fixed; a note's new request drops it */
    } catch (e) { ui.notifications.error(e.message); }
    finally { this._sending = false; if (el.isConnected) el.disabled = false; this.render(); }
  }
  _onRender() {
    const root = this.element, c = this.combat;
    /* the light goes grey on its own two minutes after the last ask, with nothing else changing */
    clearTimeout(this._grey); const left = brainListening() ? brainSeenAt() + LISTEN_MS - clock() : 0; if (left > 0) this._grey = setTimeout(() => { if (this.rendered) this.render(); }, left + 500);
    root.querySelectorAll(".leb-t[data-token] input[type=checkbox]").forEach(el => el.addEventListener("change", () => { c.scene.tokens.get(el.closest("[data-token]").dataset.token)?.setFlag(ID, el.name, el.checked); }));
    /* a group's tick: half-ticked when only some of its monsters are; one update for the tokens whose own tick differs, read again at the click */
    root.querySelectorAll(".leb-g input[type=checkbox]").forEach(el => { el.indeterminate = el.dataset.state === "some";
      el.addEventListener("change", () => { const ids = groupChanges(el.closest("[data-ids]").dataset.ids.split(",").filter(Boolean), tickRows(c), el.name, el.checked);
        if (!ids.length) return;
        /* the group boxes wait for the redraw the update brings, so a second click can't act on ticks that haven't arrived yet; a refused write redraws
           the window, which puts the boxes back to what the tokens really say (0.22.0 review) */
        root.querySelectorAll(".leb-g input[type=checkbox]").forEach(b => { b.disabled = true; });
        c.scene.updateEmbeddedDocuments("Token", ids.map(id => ({ _id: id, [`flags.${ID}.${el.name}`]: el.checked }))).catch(e => { ui.notifications.error(e.message); if (this.rendered) this.render(); }); }); });
    root.querySelectorAll("[data-request] [data-do]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); const id = el.closest("[data-request]").dataset.request, a = el.dataset.do; const r = c.getFlag(ID, "turns")?.requests?.[id];
      if (["change", "useedit", "sendnote", "confirmnote", "cancel", "cancelchange"].includes(a)) return this._change(a, c, id, r, el);
      if (a === "reactdo" || a === "reactskip") { el.disabled = true; notePress(c, id, a === "reactdo" ? "Do it" : "Skip"); return (a === "reactdo" ? doReaction(c, id) : skipReaction(c, id)).catch(e => ui.notifications.error(e.message)); }   /* a monster's reaction (0.21.0) */
      if (a === "letgo" || a === "letband" || a === "extend") root.querySelectorAll(`[data-request="${id}"] [data-do="letgo"],[data-request="${id}"] [data-do="letband"],[data-request="${id}"] [data-do="extend"]`).forEach(b => { b.disabled = true; });   /* one press: a second GM's click lands on a disabled button */
      notePress(c, id, a === "doit" ? ((r?.pos ?? 0) ? "Next step" : "Do it") : a === "hold" ? "Hold" : a === "rollfor" ? "Roll it for them" : a === "extend" ? `Extend map ${el.dataset.side}` : a === "letgo" ? (bandStillFighting(c, r?.tokenId) ? BAND_GO.one : "Let it get away") : a === "letband" ? BAND_GO.all : "Play it myself", a === "rollfor" ? { for: el.dataset.for } : {});   /* for the history window */
      (a === "doit" ? doIt(c, id) : a === "hold" ? hold(c, id) : a === "rollfor" ? rollFor(c, id, el.dataset.for) : a === "extend" ? extendMap(c, id, el.dataset.side) : a === "letgo" ? letGo(c, id) : a === "letband" ? letBandGo(c, id) : playMyself(c, id)).catch(e => ui.notifications.error(e.message)); }));
    /* reactions on the card (0.20.0): the GM's own answers, and Continue. A React that needs no roll (Shield Block and the like) is used at once. */
    root.querySelectorAll("[data-request] [data-rx]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); const id = el.closest("[data-request]").dataset.request, a = el.dataset.rx, r = c.getFlag(ID, "turns")?.requests?.[id], rx = r?.react; if (!rx) return;
      el.disabled = true;
      if (a === "cont") { notePress(c, id, "Continue"); return continueReactions(c, id).catch(e => ui.notifications.error(e.message)); }
      const x = rx.list.find(y => y.id === el.dataset.row), answer = a === "react" && !["reactive-strike", "attack-of-opportunity"].includes(x?.slug) ? "done" : a;
      answerReaction(c.id, id, rx.key, el.dataset.row, answer).catch(e => ui.notifications.error(e.message)); }));
    /* the countdown: only the turn in hand, only while it runs (review finding 3) */
    clearTimeout(this._rxTick); const cur = c ? currentRequest(c) : null, ticking = [cur, ...(c ? Object.values(c.getFlag(ID, "turns")?.requests ?? {}).filter(x => x?.reaction && x.state === "running") : [])].find(x => x?.react && countingDown(x.react.list, x.react.answers ?? {}, x.react.until, clock())); if (ticking) this._rxTick = setTimeout(() => { if (this.rendered) this.render(); }, 1000);
    /* fight memory (0.25.0): the fold-outs stay open across redraws; a line typed in the add box is kept and a redraw waits while she types */
    this._nbOpen ??= new Set(); this._nbDraft ??= {}; this._nbPrev ??= {};
    root.querySelectorAll("details.leb-nb").forEach(d => d.addEventListener("toggle", () => { if (d.open) this._nbOpen.add(d.dataset.nb); else this._nbOpen.delete(d.dataset.nb); }));
    root.querySelectorAll(".leb-nb [data-nbadd]").forEach(el => { const tid = el.closest("[data-nb]").dataset.nb;
      el.addEventListener("input", () => { this._nbDraft[tid] = el.value; delete this._nbPrev[tid]; });
      el.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); el.closest(".leb-nbadd").querySelector('[data-nbdo="add"]')?.click(); } });
    });
    /* focus anywhere in a fold-out holds a redraw back (review 1: a redraw between the press and the release of a click on Add or a cross lost the click); it comes when focus leaves */
    root.querySelectorAll("details.leb-nb").forEach(d => d.addEventListener("focusout", () => setTimeout(() => { if (this._deferred && !this._typing()) { this._deferred = false; this.render(); } }, 0)));
    root.querySelectorAll(".leb-nb [data-nbdo]").forEach(el => el.addEventListener("click", async ev => { ev.preventDefault(); ev.stopPropagation(); const tid = el.closest("[data-nb]").dataset.nb, a = el.dataset.nbdo, keys = (el.dataset.keys ?? "").split(",").filter(Boolean);
      if (this._nbBusy) return; this._nbBusy = true; el.disabled = true;
      try {
        if (a === "cross" || a === "back") await rememberCross(c, tid, keys, a === "cross");
        else { const text = String(this._nbDraft[tid] ?? "").trim(); if (!text) { ui.notifications.warn("Write the line first."); return; }
          const prev = previewRemember(c, tid, text); if (prev.unknown.length || prev.ambiguous.length) { this._nbPrev[tid] = prev; return; }
          await rememberAdd(c, tid, text); delete this._nbDraft[tid]; delete this._nbPrev[tid]; }
      } catch (e) { ui.notifications.error(e.message); }
      finally { this._nbBusy = false; this._deferred = false; if (this.rendered) super.render(); } }));
    root.querySelectorAll('.leb-esc [data-do="bringback"]').forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); const tid = el.closest("[data-token]").dataset.token; el.disabled = true;
      bringBack(c, tid).then(r => { ui.notifications.info(`${r.name} is back in the fight${r.initiative != null ? ` at initiative ${r.initiative}` : ""}.`); }).catch(e => { el.disabled = false; ui.notifications.error(e.message); }); }));
    /* the Change panel's fields go into the draft as they change, so a redraw (any fight update) keeps them */
    root.querySelectorAll(".leb-edit [data-f]").forEach(el => el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", () => this._field(el)));
    /* a redraw while she types would take the field away mid-word: wait until the panel loses focus (render is deferred, see render below) */
    root.querySelector(".leb-edit")?.addEventListener("focusout", () => setTimeout(() => { if (this._deferred && !this.element?.querySelector(".leb-edit")?.contains(document.activeElement)) { this._deferred = false; this.render(); } }, 0));
    root.querySelectorAll(".leb-edit [data-pick]").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); this._pick(Number(el.closest("[data-k]").dataset.k), el.dataset.pick); }));
    root.querySelector('[data-do="history"]')?.addEventListener("click", ev => { ev.preventDefault(); Hooks.callAll(`${ID}.openHistory`); });
  }
}
