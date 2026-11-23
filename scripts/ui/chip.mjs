/* The player's reaction chip (0.27.0; Rhea, 2026-11-11, PR-3 and PR-4): a small marker for the player's own character, shown only while a fight is
   running: "reaction ready" or "reaction used". The module ticks it when the character uses a reaction it can see; the player clicks it to mark one
   it can't, or to undo. It comes back when the character's turn begins. The player can drag it anywhere, and each browser remembers where it was
   put. The GM has no chip: her boxes are the Party reactions block on the Monster Turns window. Nothing is put on tokens or in PF2e HUD. */
import { ID } from "../builder.mjs";
import { esc } from "../journal.mjs";
import { partyReactors, readyAct, setReactionUsed } from "../fight.mjs";

const EL = "leb-chip", SETTING = "chipPlace", DRAG_PX = 4;
/* where it starts: the top of the map, just left of the sidebar, clear of the scene tabs, PF2e HUD's bar and tracker and the hotbar (seen on a
   player's page, 2026-11-11: the top-left corner sat on the scene tabs) */
const startPlace = el => { const sb = document.getElementById("sidebar")?.getBoundingClientRect(), edge = sb && sb.left > 300 ? sb.left : window.innerWidth; return { left: edge - (el.offsetWidth || 180) - 12, top: 12 }; };
const STYLE = `#${EL}{position:fixed;z-index:60;display:flex;flex-direction:column;gap:3px;padding:4px 6px 4px 4px;border-radius:6px;background:#1c1c1ce6;border:1px solid #0009;box-shadow:0 0 6px #000a;cursor:grab;user-select:none;touch-action:none;font-size:13px;color:#eee}#${EL}.leb-drag{cursor:grabbing;opacity:.85}#${EL} button{display:flex;align-items:center;gap:6px;width:auto;height:auto;min-height:24px;line-height:1.2;margin:0;padding:2px 8px;border:1px solid #fff3;border-radius:4px;background:#2e7d32;color:#fff;cursor:pointer;white-space:nowrap}#${EL} button.leb-used{background:#555;color:#ccc}#${EL} button.leb-used .leb-chip-s{text-decoration:line-through}#${EL} button.leb-off{background:#444;color:#aaa}#${EL} .leb-chip-g{opacity:.6;font-size:11px;padding:0 2px}#${EL} .leb-chip-r{display:flex;flex-direction:column;gap:3px;padding:2px 2px 2px 4px;width:240px;max-width:280px}#${EL} .leb-chip-r input{user-select:text;-webkit-user-select:text;width:100%;height:24px;font-size:12px;cursor:text;background:#000a;color:#eee;border:1px solid #fff3;border-radius:4px;padding:0 4px}#${EL} .leb-chip-r button{background:#b7791f;align-self:flex-start}#${EL} .leb-chip-r button.leb-done{background:#2f6fb5}#${EL} .leb-chip-t{font-size:12px;white-space:normal}`;
export function registerChip() { game.settings.register(ID, SETTING, { scope: "client", config: false, type: Object, default: {} }); }
/** The player's own characters in a running fight: [{ combat, id, name, used, delaying }]. */
const mine = () => game.combats.filter(c => c.started).flatMap(c => partyReactors(c).filter(x => x.mine).map(x => ({ ...x, combat: c.id })));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function place(el, at) {
  const w = el.offsetWidth || 160, h = el.offsetHeight || 30;
  el.style.left = `${clamp(Number(at?.left) || 0, 0, Math.max(0, window.innerWidth - w))}px`; el.style.top = `${clamp(Number(at?.top) || 0, 0, Math.max(0, window.innerHeight - h))}px`;
}
/** Draw, redraw or remove the chip. Called whenever a fight, its creatures or its reaction boxes change. */
export function drawChip() {
  if (game.user?.isGM) return;
  const list = mine(); let el = document.getElementById(EL);
  if (!list.length) { el?.remove(); return; }
  /* typing a Ready trigger: a redraw that would change nothing but the words waits until it is sent (a fight update mid-word would wipe it); one that
     changes what the chip offers (Done appearing, the box ticked) happens at once (review nit) */
  const sig = list.map(x => `${x.id}:${!!x.used}:${!!x.delaying}:${!!x.ready}:${x.waiting ?? ""}`).join("|");
  if (el && el.dataset.sig === sig && el.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") { el.dataset.later = "1"; return; }
  if (!document.getElementById(`${EL}-style`)) document.head.insertAdjacentHTML("beforeend", `<style id="${EL}-style">${STYLE}</style>`);
  const fresh = !el;
  if (!el) { el = document.createElement("div"); el.id = EL; document.body.append(el); wire(el); }
  el.innerHTML = list.map(x => { const cls = x.delaying ? "leb-off" : x.used ? "leb-used" : "", state = x.delaying ? "no reaction while Delaying" : x.used ? "reaction used" : "reaction ready";
    const tip = x.delaying ? "A Delaying character can't use reactions until it is back in the initiative order." : x.used ? `Used${x.used.reaction ? `: ${x.used.reaction}` : ""}. Click to undo. It comes back when your turn begins.` : "Click when you use your reaction. It comes back when your turn begins.";
    /* Ready (0.35.0, sample 4): the trigger in one line (may be blank) and Now!; once Now! stopped a monster's turn, Done lets it go on */
    const rd = x.waiting ? `<div class="leb-chip-r" data-combat="${esc(x.combat)}" data-rtoken="${esc(x.id)}"><span class="leb-chip-t">Readied action: the monster's turn waits. Make it, then press Done.</span><button type="button" class="leb-done" data-act="done"><i class="fa-solid fa-check"></i> Done</button></div>`
      : x.ready && !x.used && !x.delaying ? `<div class="leb-chip-r" data-combat="${esc(x.combat)}" data-rtoken="${esc(x.id)}"><span class="leb-chip-t">Readied:</span><input type="text" maxlength="120" placeholder="what sets it off (optional)" value="${esc(x.ready.trigger ?? "")}" title="What your readied action waits for, so the GM sees it. Press Enter to send."><button type="button" data-act="now" title="Take your readied action now: the monster's turn stops before its next step"><i class="fa-solid fa-bolt"></i> Now!</button></div>` : "";
    return `<button type="button" class="${cls}" data-combat="${esc(x.combat)}" data-token="${esc(x.id)}" data-used="${x.used ? 1 : 0}" ${x.delaying ? "data-off=1" : ""} title="${esc(tip)}"><i class="fa-solid ${x.used || x.delaying ? "fa-ban" : "fa-bolt"}"></i><span>${list.length > 1 ? `${esc(x.name)}: ` : ""}<span class="leb-chip-s">${state}</span></span></button>${rd}`; }).join("");
  delete el.dataset.later; el.dataset.sig = sig;
  /* a redraw keeps the chip where it is (a fight update in the middle of a drag must not send it back: review 15) */
  place(el, fresh ? { ...startPlace(el), ...(game.settings.get(ID, SETTING) ?? {}) } : { left: el.offsetLeft, top: el.offsetTop });
}
/* a press that doesn't travel is a click on the row under it; one that does moves the chip, and where it is let go is remembered */
function wire(el) {
  let from = null;
  el.addEventListener("pointerdown", ev => { if (ev.button !== 0 || ev.target.closest?.("input")) return;   /* the trigger box takes its own clicks */
    from = { x: ev.clientX, y: ev.clientY, left: el.offsetLeft, top: el.offsetTop, moved: false, row: ev.target.closest?.("button[data-token]") ?? null, act: ev.target.closest?.("button[data-act]") ?? null }; el.setPointerCapture?.(ev.pointerId); });
  /* the trigger, sent when it is left or Enter is pressed; a redraw held back while typing happens then */
  el.addEventListener("change", ev => { const box = ev.target.closest?.("[data-rtoken]"), combat = box && game.combats.get(box.dataset.combat); if (combat && ev.target.tagName === "INPUT") readyAct(combat, box.dataset.rtoken, "text", ev.target.value).catch(e => console.warn(`${ID} | ready`, e)); });
  el.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.tagName === "INPUT") ev.target.blur(); });
  el.addEventListener("focusout", () => setTimeout(() => { if (el.dataset.later) drawChip(); }, 0));
  el.addEventListener("pointermove", ev => { if (!from) return; const dx = ev.clientX - from.x, dy = ev.clientY - from.y;
    if (!from.moved && Math.hypot(dx, dy) < DRAG_PX) return; from.moved = true; el.classList.add("leb-drag"); place(el, { left: from.left + dx, top: from.top + dy }); });
  const end = ev => { if (!from) return; const f = from; from = null; el.classList.remove("leb-drag"); el.releasePointerCapture?.(ev.pointerId);
    if (f.moved) { game.settings.set(ID, SETTING, { left: el.offsetLeft, top: el.offsetTop }).catch(e => console.warn(`${ID} | chip`, e)); return; }
    if (f.act) { const box = f.act.closest("[data-rtoken]"), combat = box && game.combats.get(box.dataset.combat); if (combat) { f.act.disabled = true; readyAct(combat, box.dataset.rtoken, f.act.dataset.act).catch(e => ui.notifications.error(e.message)); } return; }
    const b = f.row; if (!b || b.dataset.off) return;
    const combat = game.combats.get(b.dataset.combat); if (combat) setReactionUsed(combat, b.dataset.token, b.dataset.used !== "1").catch(e => ui.notifications.error(e.message)); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", ev => { from = null; el.classList.remove("leb-drag"); el.releasePointerCapture?.(ev.pointerId); });
  const onResize = () => { if (!el.isConnected) { window.removeEventListener("resize", onResize); return; } place(el, { left: el.offsetLeft, top: el.offsetTop }); };   /* a chip removed at a fight's end drops its listener at the next resize (0.39.10) */
  window.addEventListener("resize", onResize);
}
